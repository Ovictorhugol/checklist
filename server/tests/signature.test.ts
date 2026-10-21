import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { validateSignature, recordSignature } from '../src/domain/signature.js'
import { Delivery } from '../src/models/Delivery.js'
import { ProtocolCounter } from '../src/models/ProtocolCounter.js'
import { createDelivery, saveReturnInspection } from '../src/controllers/deliveryController.js'

const signature = { signerName: 'Responsável', strokes: [[{ x: 10, y: 30 }, { x: 150, y: 80 }, { x: 100, y: 120 }]] }
const parts = ['display', 'keyboard', 'touchpad', 'case', 'ports'].map((id) => ({ id, label: id, status: 'ok', note: '' }))
const body = { assetTag: 'A', serialNumber: 'S', recipient: 'Responsável', recipientEmail: 'r@example.com', recipientCpf: '52998224725', recipientDepartment: 'TI', equipment: 'Notebook', model: 'M', brand: 'B', parts }
const original = { create: Delivery.create, find: Delivery.findById, update: Delivery.findOneAndUpdate, counter: ProtocolCounter.findOneAndUpdate }
afterEach(() => { Delivery.create = original.create; Delivery.findById = original.find; Delivery.findOneAndUpdate = original.update; ProtocolCounter.findOneAndUpdate = original.counter })
const response = () => ({ code: 200, data: null as any, status(code: number) { this.code = code; return this }, json(data: any) { this.data = data; return this } })

test('assinatura rejeita ausência, traço vazio, ponto, coordenadas inválidas e excesso de dados', () => {
  for (const input of [undefined, {}, { ...signature, strokes: [] }, { ...signature, strokes: [[{ x: 10, y: 10 }]] }, { ...signature, strokes: [[{ x: 10, y: 10 }, { x: 11, y: 11 }]] }, { ...signature, strokes: [[{ x: -1, y: 10 }, { x: 100, y: 10 }]] }, { ...signature, strokes: [[{ x: NaN, y: 10 }, { x: 100, y: 10 }]] }, { ...signature, strokes: [Array.from({ length: 2001 }, () => ({ x: 100, y: 10 }))] }]) {
    assert.throws(() => validateSignature(input))
  }
  assert.deepEqual(validateSignature(signature), signature)
})

test('data, operador e hash são definidos pelo servidor; esquema mantém os traços', async () => {
  const validated = validateSignature({ ...signature, signedAt: 'forged', capturedBy: 'forged', documentHash: 'forged' })
  const recorded = recordSignature(validated, body, 'admin@example.com')
  assert.equal(recorded.capturedBy, 'admin@example.com')
  assert.match(recorded.documentHash, /^[a-f0-9]{64}$/)
  assert.notEqual(recorded.signedAt, 'forged')
  assert.notEqual(recorded.documentHash, recordSignature(validated, { ...body, assetTag: 'B' }, 'admin@example.com').documentHash)
  const stored = new Delivery({ ...body, protocol: 'ENT-2026-0001', signature: recorded })
  await stored.validate()
  assert.deepEqual(stored.toJSON().signature.strokes, signature.strokes)
})

test('entrega sem assinatura ou com nome divergente não reserva protocolo nem grava', async () => {
  let writes = 0
  Delivery.create = (async () => { writes++; throw new Error('Não deveria gravar') }) as any
  ProtocolCounter.findOneAndUpdate = (async () => { writes++; throw new Error('Não deveria reservar') }) as any
  for (const input of [undefined, { ...signature, signerName: 'Outra pessoa' }]) {
    const res = response()
    await createDelivery({ body: { ...body, signature: input }, user: { email: 'admin@example.com' } } as any, res as any)
    assert.equal(res.code, 400)
  }
  assert.equal(writes, 0)
})

test('devolução exige nova assinatura e salva imagem e inspeção na mesma atualização', async () => {
  const delivery = new Delivery({ ...body, protocol: 'ENT-2026-0001', deliveredAt: '2020-01-01T00:00:00Z' })
  Delivery.findById = (async () => delivery) as any
  let writes = 0
  const inspection = parts.map((part) => ({ id: part.id, label: part.label, deliveredStatus: 'ok', returnedStatus: 'ok', note: '' }))
  Delivery.findOneAndUpdate = (async (_filter: any, update: any) => {
    writes++
    assert.equal(update.$set.returnInspection.signature.signerName, signature.signerName)
    assert.equal(update.$set.returnInspection.signature.capturedBy, 'admin@example.com')
    assert.deepEqual(update.$set.returnInspection.signature.strokes, signature.strokes)
    return { toJSON: () => update.$set }
  }) as any
  const unsigned = response()
  await saveReturnInspection({ params: { id: delivery.id }, body: { parts: inspection }, user: { email: 'admin@example.com' } } as any, unsigned as any)
  assert.equal(unsigned.code, 400)
  assert.equal(writes, 0)
  const wrongSigner = response()
  await saveReturnInspection({ params: { id: delivery.id }, body: { parts: inspection, signature: { ...signature, signerName: 'Funcionário da coleta' } }, user: { email: 'admin@example.com' } } as any, wrongSigner as any)
  assert.equal(wrongSigner.code, 400)
  assert.equal(writes, 0)
  const signed = response()
  await saveReturnInspection({ params: { id: delivery.id }, body: { parts: inspection, signature }, user: { email: 'admin@example.com' } } as any, signed as any)
  assert.equal(signed.code, 200)
  assert.equal(writes, 1)
})
