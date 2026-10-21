import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDatabase } from './postgresTestDatabase.js'
import { getPool } from '../src/config/postgres.js'
import { Delivery } from '../src/models/Delivery.js'
import { DeliveryDeletionAudit } from '../src/models/DeliveryDeletionAudit.js'
import { ProtocolCounter } from '../src/models/ProtocolCounter.js'
import { allocateProtocol, initializeProtocolCounters, protocolDate } from '../src/services/protocol.js'
import { saveReturnInspection, deleteDelivery } from '../src/controllers/deliveryController.js'

test('PostgreSQL: protocolos concorrentes, exclusões, reinício e devoluções simultâneas', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    await Promise.all([Delivery.init(), DeliveryDeletionAudit.init(), ProtocolCounter.init()])
    await initializeProtocolCounters()
    const protocols = await Promise.all(Array.from({ length: 30 }, () => allocateProtocol()))
    assert.equal(new Set(protocols).size, 30)
    const parts = ['display', 'keyboard', 'touchpad', 'case', 'ports'].map((id) => ({ id, label: id, status: 'ok', note: '' }))
    const original = await Delivery.create({ protocol: protocols[0], assetTag: 'A', serialNumber: 'S', recipient: 'R', recipientEmail: 'r@example.com', recipientDepartment: 'TI', equipment: 'Notebook', model: 'M', brand: 'B', parts })
    const inspection = parts.map((part) => ({ id: part.id, deliveredStatus: 'ok', returnedStatus: 'ok', note: '' }))
    const response = () => ({ code: 200, status(code: number) { this.code = code; return this }, json() { return this } })
    const responses = [response(), response()]
    await Promise.all(responses.map((res) => saveReturnInspection({ params: { id: original.id }, body: { parts: inspection, signature: { signerName: original.recipient, strokes: [[{ x: 10, y: 40 }, { x: 100, y: 80 }]] } }, user: { email: 'operator@example.com' } } as any, res as any)))
    assert.deepEqual(responses.map((res) => res.code).sort(), [200, 409])
    await DeliveryDeletionAudit.create({ deliveryId: original.id, deliverySnapshot: { ...original.toObject(), protocol: `ENT-${new Date().getFullYear()}-0099` }, deletedByUserId: 'admin', deletedByEmail: 'admin@example.com' })
    await original.deleteOne()
    await initializeProtocolCounters()
    assert.equal(await allocateProtocol(), `ENT-${protocolDate()}-0100`)
    // Simula instalação sobre base antiga sem contador: o snapshot deve preservar a sequência.
    await getPool().query('DELETE FROM checklist_donato.protocol_counters')
    await initializeProtocolCounters()
    assert.equal(await allocateProtocol(), `ENT-${protocolDate()}-0100`)
  } finally {
    await database.cleanup()
  }
})

test('PostgreSQL: exclusão com identidade Microsoft confirma auditoria ou desfaz tudo', { skip: !process.env.TEST_POSTGRES }, async (t) => {
  t.mock.method(console, 'error', () => {})
  const database = await createTestDatabase()
  const createAudit = DeliveryDeletionAudit.create
  try {
    const user = { id: 'tenant-id:object-id', email: 'admin@example.com', role: 'admin' }

    const delivery = await Delivery.create({ protocol: 'ENT-2099-0001', assetTag: 'A', serialNumber: 'S', recipient: 'Pessoa', recipientEmail: 'pessoa@example.com', recipientDepartment: 'TI', equipment: 'Celular', model: 'Modelo de exemplo', brand: 'Marca de exemplo' })
    const request = { params: { id: delivery.id }, user: { id: user.id, email: user.email, role: 'admin' } }
    const response = () => ({ code: 0, status(code: number) { this.code = code; return this }, json() { return this } })
    DeliveryDeletionAudit.create = (async (data: any, options: any) => {
      await createAudit.call(DeliveryDeletionAudit, data, options)
      assert.equal(Number((await options.session.client.query('SELECT count(*) AS count FROM checklist_donato.delivery_deletion_audits')).rows[0].count), 1)
      throw new Error('Falha simulada após inserir auditoria')
    }) as any
    const failed = response()
    await deleteDelivery(request as any, failed as any)
    assert.equal(failed.code, 500)
    assert.ok(await Delivery.findById(delivery.id))
    assert.equal(await DeliveryDeletionAudit.countDocuments(), 0)

    DeliveryDeletionAudit.create = createAudit
    const completed = response()
    await deleteDelivery(request as any, completed as any)
    assert.equal(completed.code, 200)
    assert.equal(await Delivery.findById(delivery.id), null)
    const audit = await DeliveryDeletionAudit.findOne({ deliveryId: delivery.id })
    assert.equal(audit!.deliverySnapshot.protocol, delivery.protocol)
    assert.equal(audit!.deletedByUserId, user.id)
  } finally {
    DeliveryDeletionAudit.create = createAudit
    await database.cleanup()
  }
})
