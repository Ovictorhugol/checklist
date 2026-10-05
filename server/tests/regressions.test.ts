import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import deliveryRoutes from '../src/routes/deliveryRoutes.js'
import { validateEnvironment } from '../src/config/environment.js'
import { validateDeliveryParts, validateReturnParts } from '../src/domain/inspection.js'
import { Delivery } from '../src/models/Delivery.js'
import { DeliveryDeletionAudit } from '../src/models/DeliveryDeletionAudit.js'
import { ProtocolCounter } from '../src/models/ProtocolCounter.js'
import { initializeProtocolCounters, allocateProtocol } from '../src/services/protocol.js'
import { createDelivery, saveReturnInspection } from '../src/controllers/deliveryController.js'

const secret = 'test-only-random-secret-with-more-than-32-characters'
const originals = { find: Delivery.find, findById: Delivery.findById, create: Delivery.create, update: Delivery.findOneAndUpdate, auditFind: DeliveryDeletionAudit.find, counterUpdate: ProtocolCounter.updateOne, counterIncrement: ProtocolCounter.findOneAndUpdate }
const originalEnv = { ...process.env }
afterEach(() => {
  Delivery.find = originals.find; Delivery.findById = originals.findById; Delivery.create = originals.create; Delivery.findOneAndUpdate = originals.update
  DeliveryDeletionAudit.find = originals.auditFind; ProtocolCounter.updateOne = originals.counterUpdate; ProtocolCounter.findOneAndUpdate = originals.counterIncrement
  process.env = { ...originalEnv }
})
const equipment = 'Notebook Dell Latitude 5440'
const parts = ['display', 'keyboard', 'touchpad', 'case', 'ports'].map((id) => ({ id, label: id, status: 'ok' as const, note: '' }))
const returned = parts.map((part) => ({ id: part.id, label: part.label, deliveredStatus: part.status, returnedStatus: 'ok' as const, note: '' }))
const delivery = { _id: '507f1f77bcf86cd799439011', parts, deliveredAt: '2020-01-01T00:00:00.000Z', status: 'entregue', isReturned: false }
const response = () => ({ code: 200, data: null as any, status(code: number) { this.code = code; return this }, json(data: any) { this.data = data; return this } })

test('todas as rotas bloqueiam ausência, invalidez e expiração de JWT; operador não acessa auditoria', async () => {
  process.env.JWT_SECRET = secret
  const app = express(); app.use(express.json()); app.use('/api/deliveries', deliveryRoutes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}/api/deliveries`
  const expired = jwt.sign({ id: delivery._id, email: 'operator@example.com', role: 'operator' }, secret, { expiresIn: -1 })
  try {
    for (const [method, path] of [['GET', ''], ['GET', '/next-protocol'], ['GET', '/deleted'], ['GET', `/${delivery._id}`], ['POST', ''], ['PUT', `/${delivery._id}/return`], ['DELETE', `/${delivery._id}`]]) {
      for (const token of [null, 'invalid', expired]) {
        const result = await fetch(base + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} })
        assert.equal(result.status, 401, `${method} ${path}`)
      }
    }
    const token = jwt.sign({ id: delivery._id, email: 'operator@example.com', role: 'operator' }, secret)
    for (const [method, path] of [['GET', '/deleted'], ['DELETE', `/${delivery._id}`]]) {
      assert.equal((await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` } })).status, 403)
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('configuração recusa segredos, senhas padrão e placeholders', () => {
  Object.assign(process.env, { JWT_SECRET: secret, MONGO_URI: 'mongodb://localhost/test', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'exclusive-password-123' })
  validateEnvironment()
  for (const [key, value] of [['JWT_SECRET', 'secret'], ['JWT_SECRET', 'SUBSTITUA_POR_UM_SEGREDO_ALEATORIO'], ['ADMIN_PASSWORD', 'admin12345'], ['ADMIN_PASSWORD', 'SUBSTITUA_POR_UMA_SENHA_FORTE'], ['ADMIN_EMAIL', 'invalid'], ['MONGO_URI', 'mongodb://admin:SUA_SENHA_AQUI@host/db']]) {
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
  Delivery.find = (() => ({ select: () => ({ lean: async () => [{ protocol: `ENT-${year}-0003` }] }) })) as any
  DeliveryDeletionAudit.find = (() => ({ select: () => ({ lean: async () => [{ deliverySnapshot: { protocol: `ENT-${year}-0025` } }, { protocol: 'ENT-2020-0008' }] }) })) as any
  const counters = new Map<string, number>()
  ProtocolCounter.updateOne = (async (filter: any, update: any) => { counters.set(filter._id, Math.max(counters.get(filter._id) ?? 0, update.$max.sequence)) }) as any
  await initializeProtocolCounters()
  assert.equal(counters.get(String(year)), 25)
  assert.equal(counters.get('2020'), 8)
  counters.set(String(year), 30)
  await initializeProtocolCounters()
  assert.equal(counters.get(String(year)), 30)
})

test('reserva recupera corrida de inserção do contador na virada do ano', async () => {
  let calls = 0
  ProtocolCounter.findOneAndUpdate = (async (_filter: any, _update: any, options: any) => {
    if (++calls === 1) { assert.equal(options.upsert, true); throw Object.assign(new Error('duplicate'), { code: 11000 }) }
    assert.equal(options.upsert, false)
    return { sequence: 2 }
  }) as any
  assert.equal(await allocateProtocol(), `ENT-${new Date().getFullYear()}-0002`)
})

test('cadastro ignora protocolo do cliente e registra autor autenticado', async () => {
  ProtocolCounter.findOneAndUpdate = (async () => ({ sequence: 42 })) as any
  let stored: any
  Delivery.create = (async (input: any) => { stored = input; return { toJSON: () => input } }) as any
  const res = response()
  await createDelivery({ body: { equipment, parts, assetTag: 'A', serialNumber: 'S', recipient: 'R', recipientEmail: 'r@example.com', recipientDepartment: 'TI', model: 'M', brand: 'B', protocol: 'forged' }, user: { email: 'operator@example.com' } } as any, res as any)
  assert.equal(res.code, 201)
  assert.equal(stored.protocol, `ENT-${new Date().getFullYear()}-0042`)
  assert.equal(stored.deliveredBy, 'operator@example.com')
})

test('devolução repetida ou perdedora de corrida retorna conflito', async () => {
  Delivery.findById = (async () => ({ ...delivery, isReturned: true })) as any
  const res = response()
  await saveReturnInspection({ params: { id: delivery._id }, body: { parts: returned }, user: { email: 'operator@example.com' } } as any, res as any)
  assert.equal(res.code, 409)
  Delivery.findById = (async () => delivery) as any
  Delivery.findOneAndUpdate = (async (filter: any) => { assert.equal(filter.isReturned.$ne, true); assert.equal(filter.returnInspection, null); return null }) as any
  const raced = response()
  await saveReturnInspection({ params: { id: delivery._id }, body: { parts: returned }, user: { email: 'operator@example.com' } } as any, raced as any)
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
