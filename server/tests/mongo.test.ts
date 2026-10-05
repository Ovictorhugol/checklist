import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Delivery } from '../src/models/Delivery.js'
import { DeliveryDeletionAudit } from '../src/models/DeliveryDeletionAudit.js'
import { ProtocolCounter } from '../src/models/ProtocolCounter.js'
import { allocateProtocol, initializeProtocolCounters } from '../src/services/protocol.js'
import { saveReturnInspection } from '../src/controllers/deliveryController.js'

test('MongoDB: protocolos concorrentes, exclusões, reinício e devoluções simultâneas', { skip: !process.env.TEST_MONGO_URI }, async () => {
  const dbName = `checklist_test_${randomUUID().replaceAll('-', '')}`
  await mongoose.connect(process.env.TEST_MONGO_URI!, { dbName, serverSelectionTimeoutMS: 5000 })
  try {
    await Promise.all([Delivery.init(), DeliveryDeletionAudit.init(), ProtocolCounter.init()])
    await initializeProtocolCounters()
    const protocols = await Promise.all(Array.from({ length: 30 }, () => allocateProtocol()))
    assert.equal(new Set(protocols).size, 30)
    const parts = ['display', 'keyboard', 'touchpad', 'case', 'ports'].map((id) => ({ id, label: id, status: 'ok', note: '' }))
    const original = await Delivery.create({ protocol: protocols[0], assetTag: 'A', serialNumber: 'S', recipient: 'R', recipientEmail: 'r@example.com', recipientDepartment: 'TI', equipment: 'Notebook Dell Latitude 5440', model: 'M', brand: 'B', parts })
    const inspection = parts.map((part) => ({ id: part.id, deliveredStatus: 'ok', returnedStatus: 'ok', note: '' }))
    const response = () => ({ code: 200, status(code: number) { this.code = code; return this }, json() { return this } })
    const responses = [response(), response()]
    await Promise.all(responses.map((res) => saveReturnInspection({ params: { id: original.id }, body: { parts: inspection }, user: { email: 'operator@example.com' } } as any, res as any)))
    assert.deepEqual(responses.map((res) => res.code).sort(), [200, 409])
    await DeliveryDeletionAudit.create({ deliveryId: original.id, deliverySnapshot: { ...original.toObject(), protocol: `ENT-${new Date().getFullYear()}-0099` }, deletedByUserId: 'admin', deletedByEmail: 'admin@example.com' })
    await original.deleteOne()
    await initializeProtocolCounters()
    assert.equal(await allocateProtocol(), `ENT-${new Date().getFullYear()}-0100`)
    // Simula instalação sobre base antiga sem contador: o snapshot deve preservar a sequência.
    await ProtocolCounter.deleteMany({})
    await initializeProtocolCounters()
    assert.equal(await allocateProtocol(), `ENT-${new Date().getFullYear()}-0100`)
  } finally {
    // Exclusivamente o banco de testes cujo nome foi criado acima.
    assert.equal(mongoose.connection.name, dbName)
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  }
})
