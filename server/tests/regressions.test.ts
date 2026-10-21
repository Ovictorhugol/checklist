import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { setupMicrosoftIdentity, identityConfig } from './helpers/microsoftTestIdentity.js'
import deliveryRoutes from '../src/routes/deliveryRoutes.js'
import { validateEnvironment } from '../src/config/environment.js'
import { validateDeliveryParts, validateReturnParts } from '../src/domain/inspection/inspection.js'
import { Delivery } from '../src/models/Delivery.js'
import { DeliveryDeletionAudit } from '../src/models/DeliveryDeletionAudit.js'
import { ProtocolCounter } from '../src/models/ProtocolCounter.js'
import { initializeProtocolCounters, allocateProtocol, protocolDate } from '../src/services/deliveries/protocol.js'
import { createDelivery, saveReturnInspection } from '../src/controllers/deliveryController.js'

const signature = { signerName: 'R', strokes: [[{ x: 10, y: 50 }, { x: 150, y: 90 }]] }
const originals = { find: Delivery.find, findById: Delivery.findById, create: Delivery.create, update: Delivery.findOneAndUpdate, auditFind: DeliveryDeletionAudit.find, counterUpdate: ProtocolCounter.updateOne, counterIncrement: ProtocolCounter.findOneAndUpdate }
const originalEnv = { ...process.env }
afterEach(() => {
  Delivery.find = originals.find; Delivery.findById = originals.findById; Delivery.create = originals.create; Delivery.findOneAndUpdate = originals.update
  DeliveryDeletionAudit.find = originals.auditFind; ProtocolCounter.updateOne = originals.counterUpdate; ProtocolCounter.findOneAndUpdate = originals.counterIncrement
  process.env = { ...originalEnv }
})
const equipment = 'Notebook'
const parts = ['display', 'keyboard', 'touchpad', 'case', 'ports'].map((id) => ({ id, label: id, status: 'ok' as const, note: '' }))
const returned = parts.map((part) => ({ id: part.id, label: part.label, deliveredStatus: part.status, returnedStatus: 'ok' as const, note: '' }))
const delivery = { _id: '507f1f77bcf86cd799439011', recipient: 'R', parts, deliveredAt: '2020-01-01T00:00:00.000Z', status: 'entregue', isReturned: false }
const response = () => ({ code: 200, data: null as any, status(code: number) { this.code = code; return this }, json(data: any) { this.data = data; return this } })

test('todas as rotas bloqueiam ausência, invalidez e expiração de JWT; operador não acessa auditoria', async () => {
  const identity = await setupMicrosoftIdentity()
  const app = express(); app.use(express.json()); app.use('/api/deliveries', deliveryRoutes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}/api/deliveries`
  const expired = await identity.sign({ id: delivery._id, email: 'operator@example.com', role: 'operator' }, '-1s')
  try {
    for (const [method, path] of [['GET', ''], ['GET', '/next-protocol'], ['GET', '/deleted'], ['GET', `/${delivery._id}`], ['POST', ''], ['PUT', `/${delivery._id}/return`], ['DELETE', `/${delivery._id}`], ['POST', `/deleted/${delivery._id}/restore`], ['GET', `/${delivery._id}/email`], ['POST', `/${delivery._id}/email/retry`]]) {
      for (const token of [null, 'invalid', expired]) {
        const result = await fetch(base + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} })
        assert.equal(result.status, 401, `${method} ${path}`)
      }
    }
    const token = await identity.sign({ id: delivery._id, email: 'operator@example.com', role: 'operator' })
    for (const [method, path] of [['GET', '/deleted'], ['DELETE', `/${delivery._id}`], ['POST', `/deleted/${delivery._id}/restore`], ['GET', `/${delivery._id}/email`], ['POST', `/${delivery._id}/email/retry`]]) {
      assert.equal((await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` } })).status, 403)
    }
  } finally {
    identity.restore()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('configuração exige IDs do Entra e conexão PostgreSQL sem placeholders', () => {
  Object.assign(process.env, { ...identityConfig, PGHOST: 'localhost', PGDATABASE: 'test', PGUSER: 'test', PGPASSWORD: 'exclusive-password-123', PGSSLROOTCERT: 'certs/global-bundle.pem' })
  validateEnvironment()
  for (const [key, value] of [['ENTRA_TENANT_ID', 'common'], ['ENTRA_API_CLIENT_ID', ''], ['ENTRA_CLIENT_ID', 'invalid'], ['PGPASSWORD', 'SUA_SENHA_AQUI'], ['PGHOST', ''], ['PGDATABASE', ''], ['PGSSLROOTCERT', '']]) {
    const previous = process.env[key]; process.env[key] = value
    assert.throws(validateEnvironment, undefined, key)
    process.env[key] = previous
  }
})

test('entrega rejeita inspeção vazia, incompleta, duplicada e equipamento desconhecido', () => {
  assert.equal(validateDeliveryParts(equipment, parts).length, 5)
  for (const input of [[], parts.slice(1), [...parts.slice(0, 4), parts[0]], parts.map((part) => ({ ...part, status: 'pending' }))]) {
    assert.throws(() => validateDeliveryParts(equipment, input))
  }
  assert.throws(() => validateDeliveryParts('unknown', parts))
})

test('devolução rejeita peças trocadas, duplicadas, incompletas e condição original falsa', () => {
  const result = validateReturnParts(parts, returned.map((part) => ({ ...part, label: 'alterado' })))
  assert.equal(result[0].label, parts[0].label)
  for (const input of [[], returned.slice(1), [...returned.slice(0, 4), returned[0]], returned.map((part) => ({ ...part, deliveredStatus: 'damaged' })), returned.map((part) => ({ ...part, id: 'other' }))]) {
    assert.throws(() => validateReturnParts(parts, input))
  }
})

test('migração mantém máximos de protocolos ativos e arquivados', async () => {
  const year = new Date().getFullYear()
  Delivery.find = (() => ({ lean: async () => [{ protocol: `ENT-${year}-0003` }] })) as any
  DeliveryDeletionAudit.find = (() => ({ lean: async () => [{ deliverySnapshot: { protocol: `ENT-${year}-0025` } }, { protocol: 'ENT-2020-0008' }] })) as any
  const counters = new Map<string, number>()
  ProtocolCounter.updateOne = (async (filter: any, update: any) => { counters.set(filter._id, Math.max(counters.get(filter._id) ?? 0, update.$max.sequence)) }) as any
  await initializeProtocolCounters()
  assert.equal(counters.get(String(year)), 25)
  assert.equal(counters.get('2020'), 8)
  counters.set(String(year), 30)
  await initializeProtocolCounters()
  assert.equal(counters.get(String(year)), 30)
})

test('reserva de protocolo usa operação atômica e propaga falhas do PostgreSQL', async () => {
  let calls = 0
  ProtocolCounter.findOneAndUpdate = (async (filter: { _id: string }) => {
    calls++
    assert.equal(filter._id, protocolDate().slice(0, 4))
    return { sequence: 2 }
  }) as any
  assert.equal(await allocateProtocol(), `ENT-${protocolDate()}-0002`)
  assert.equal(calls, 1)
  const failure = Object.assign(new Error('connection lost'), { code: '08006' })
  ProtocolCounter.findOneAndUpdate = (async () => { throw failure }) as any
  await assert.rejects(allocateProtocol(), (error) => error === failure)
})

test('cadastro ignora protocolo do cliente e registra autor autenticado', async () => {
  ProtocolCounter.findOneAndUpdate = (async () => ({ sequence: 42 })) as any
  let stored: any
  Delivery.create = (async (input: any) => { stored = input; return { toJSON: () => input } }) as any
  const res = response()
  await createDelivery({ body: { equipment, parts, assetTag: 'A', serialNumber: 'S', recipient: 'R', recipientEmail: 'r@example.com', recipientCpf: '529.982.247-25', recipientDepartment: 'TI', model: 'M', brand: 'B', accessories: 'Carregador', signature, protocol: 'forged' }, user: { email: 'operator@example.com' } } as any, res as any)
  assert.equal(res.code, 201)
  assert.equal(stored.protocol, `ENT-${protocolDate(new Date(stored.deliveredAt))}-0042`)
  assert.equal(stored.deliveredBy, 'operator@example.com')
  assert.equal(stored.accessories, 'Carregador')
  assert.equal(stored.recipientCpf, '52998224725')
})

test('devolução repetida ou perdedora de corrida retorna conflito', async () => {
  Delivery.findById = (async () => ({ ...delivery, isReturned: true })) as any
  const res = response()
  await saveReturnInspection({ params: { id: delivery._id }, body: { parts: returned, signature }, user: { email: 'operator@example.com' } } as any, res as any)
  assert.equal(res.code, 409)
  Delivery.findById = (async () => delivery) as any
  Delivery.findOneAndUpdate = (async (filter: any) => { assert.equal(filter.isReturned.$ne, true); assert.equal(filter.returnInspection, null); return null }) as any
  const raced = response()
  await saveReturnInspection({ params: { id: delivery._id }, body: { parts: returned, signature: { ...signature, signerName: delivery.recipient } }, user: { email: 'operator@example.com' } } as any, raced as any)
  assert.equal(raced.code, 409)
})

test('devolução recusa data inválida, anterior à entrega ou futura', async () => {
  Delivery.findById = (async () => delivery) as any
  for (const returnedAt of ['invalid', '2019-01-01', new Date(Date.now() + 3600000).toISOString()]) {
    const res = response()
    await saveReturnInspection({ params: { id: delivery._id }, body: { parts: returned, returnedAt }, user: { email: 'operator@example.com' } } as any, res as any)
    assert.equal(res.code, 400)
  }
})
