import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDatabase } from './postgresTestDatabase.js'
import { getPool } from '../src/config/postgres.js'
import { Delivery } from '../src/models/Delivery.js'
import { DeliveryDeletionAudit } from '../src/models/DeliveryDeletionAudit.js'
import { Reservation } from '../src/models/Reservation.js'
import { deleteDelivery } from '../src/controllers/deliveryController.js'
import { restoreArchivedDelivery, DeliveryRestoreError } from '../src/services/restoreDelivery.js'

const actor = { id: '000000000000000000000001', email: 'admin@example.com', role: 'admin' }
const response = () => ({ code: 0, status(code: number) { this.code = code; return this }, json() { return this } })
const payload = { protocol: 'ENT-2026-10-13-0042', assetTag: 'A', serialNumber: 'S', recipient: 'Pessoa', recipientEmail: 'pessoa@example.com', recipientDepartment: 'TI', equipment: 'Celular', model: 'Modelo de exemplo', brand: 'Marca de exemplo', recipientCpf: '52998224725', parts: [{ id: 'display', label: 'Tela', status: 'ok', note: 'Original' }], signature: { signerName: 'Pessoa', strokes: [[{ x: 10, y: 50 }, { x: 150, y: 90 }]], signedAt: '2026-10-13T12:00:00Z', capturedBy: actor.email, documentHash: 'original-hash' } }
async function archive(id: string) {
  const res = response()
  await deleteDelivery({ params: { id }, user: actor } as any, res as any)
  assert.equal(res.code, 200)
  const audits = await DeliveryDeletionAudit.find({ deliveryId: id }).sort({ deletedAt: -1 })
  return audits[0]
}

test('RDS: recuperação concorrente preserva dados, assinaturas e auditoria; reexclusão usa snapshot mais recente', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const original = await Delivery.create({ ...payload, status: 'devolvido', isReturned: true, deliveredAt: '2026-10-13T12:00:00Z', returnedAt: '2026-10-13T13:00:00Z', returnInspection: { returnedAt: '2026-10-13T13:00:00Z', parts: [], signature: payload.signature } })
    const expected = JSON.parse(JSON.stringify(original.toJSON()))
    const audit = await archive(original.id)
    const results = await Promise.allSettled([restoreArchivedDelivery(audit.id, actor), restoreArchivedDelivery(audit.id, actor)])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter(result => result.status === 'rejected' && result.reason instanceof DeliveryRestoreError && result.reason.status === 409).length, 1)
    assert.deepEqual(JSON.parse(JSON.stringify((await Delivery.findById(original.id))!.toJSON())), expected)
    const recoveredAudit = await DeliveryDeletionAudit.findById(audit.id)
    assert.ok(recoveredAudit!.restoredAt)
    assert.equal(recoveredAudit!.restoredByEmail, actor.email)
    assert.equal(recoveredAudit!.deliverySnapshot.signature.documentHash, 'original-hash')
    const updated = await Delivery.findOneAndUpdate({ _id: original.id }, { $set: { accessories: 'Carregador' } })
    const nextAudit = await archive(original.id)
    await assert.rejects(restoreArchivedDelivery(audit.id, actor), error => error instanceof DeliveryRestoreError && error.status === 409)
    assert.equal((await restoreArchivedDelivery(nextAudit.id, actor)).accessories, updated!.accessories)
  } finally { await database.cleanup() }
})

test('RDS: conflito de protocolo ou registro antigo incompleto não confirma recuperação', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const original = await Delivery.create(payload)
    const audit = await archive(original.id)
    await Delivery.create(payload)
    await assert.rejects(restoreArchivedDelivery(audit.id, actor), error => error instanceof DeliveryRestoreError && error.status === 409)
    assert.equal((await DeliveryDeletionAudit.findById(audit.id))!.restoredAt, undefined)
    assert.equal(await Delivery.findById(original.id), null)
    const legacyId = '000000000000000000000099'
    await getPool().query('INSERT INTO checklist_donato.delivery_deletion_audits (id, delivery_id, deleted_by_user_id, deleted_by_email) VALUES ($1, $2, $3, $4)', [legacyId, 'old', actor.id, actor.email])
    await assert.rejects(restoreArchivedDelivery(legacyId, actor), /dados completos/)
    assert.equal(await Delivery.countDocuments(), 1)
  } finally { await database.cleanup() }
})

test('RDS: recuperação mantém vínculo de reserva e recusa reserva alterada', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const reservation = await Reservation.create({ equipment: payload.equipment, requesterName: payload.recipient, requesterEmail: payload.recipientEmail, department: 'TI', purpose: 'Uso', startDate: '2026-10-13', endDate: '2026-10-14', status: 'aprovada' })
    const delivery = await Delivery.create({ ...payload, reservationId: reservation.id })
    await Reservation.findOneAndUpdate({ _id: reservation.id }, { $set: { deliveryId: delivery.id, deliveryProtocol: delivery.protocol } })
    const audit = await archive(delivery.id)
    assert.equal((await restoreArchivedDelivery(audit.id, actor)).reservationId, reservation.id)
    const nextAudit = await archive(delivery.id)
    await Reservation.findOneAndUpdate({ _id: reservation.id }, { $set: { deliveryId: 'different' } })
    await assert.rejects(restoreArchivedDelivery(nextAudit.id, actor), /reserva vinculada mudou/)
    assert.equal(await Delivery.findById(delivery.id), null)
  } finally { await database.cleanup() }
})

test('RDS: falha ao registrar a recuperação reverte também a inserção da entrega', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const original = await Delivery.create(payload)
    const audit = await archive(original.id)
    await getPool().query('ALTER TABLE checklist_donato.delivery_deletion_audits ADD CONSTRAINT test_restore_failure CHECK (restored_at IS NULL)')
    await assert.rejects(restoreArchivedDelivery(audit.id, actor))
    assert.equal(await Delivery.findById(original.id), null)
    assert.equal((await DeliveryDeletionAudit.findById(audit.id))!.restoredAt, undefined)
    await getPool().query('ALTER TABLE checklist_donato.delivery_deletion_audits DROP CONSTRAINT test_restore_failure')
    assert.equal((await restoreArchivedDelivery(audit.id, actor)).id, original.id)
  } finally { await database.cleanup() }
})
