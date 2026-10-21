import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createTestDatabase } from './postgresTestDatabase.js'
import { getPool, serverRoot } from '../src/config/postgres.js'
import { Delivery } from '../src/models/Delivery.js'
import { Reservation } from '../src/models/Reservation.js'
import { DeliveryDeletionAudit } from '../src/models/DeliveryDeletionAudit.js'
import { createDelivery, saveReturnInspection, deleteDelivery } from '../src/controllers/deliveryController.js'
import { createReservedDelivery } from '../src/services/reservationDelivery.js'
import { restoreArchivedDelivery, DeliveryRestoreError } from '../src/services/restoreDelivery.js'
import { equipmentPossessionError } from '../src/services/equipmentPossession.js'

const actor = { id: '000000000000000000000001', email: 'admin@example.com', role: 'admin' }
const parts = ['display', 'keyboard', 'touchpad', 'case', 'ports'].map(id => ({ id, label: id, status: 'ok', note: '' }))
const signature = { signerName: 'Pessoa', strokes: [[{ x: 10, y: 50 }, { x: 150, y: 90 }]] }
const payload = { assetTag: 'PC-001', serialNumber: 'SERIAL-001', recipient: 'Pessoa', recipientEmail: 'pessoa@example.com', recipientCpf: '52998224725', recipientDepartment: 'TI', equipment: 'Notebook', model: 'Modelo de exemplo', brand: 'Marca de exemplo', parts, signature }
const response = () => ({ code: 0, data: null as any, status(code: number) { this.code = code; return this }, json(data: any) { this.data = data; return this } })
const activeConflict = (error: unknown) => !!equipmentPossessionError(error)
const returnDelivery = async (id: string) => {
  const res = response()
  await saveReturnInspection({ params: { id }, body: { parts: parts.map(part => ({ id: part.id, deliveredStatus: 'ok', returnedStatus: 'ok', note: '' })), signature }, user: actor } as any, res as any)
  assert.equal(res.code, 200)
}

test('RDS/API: patrimônio e série são bloqueados independentemente; devolução libera novo empréstimo', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const first = response()
    await createDelivery({ body: payload, user: actor } as any, first as any)
    assert.equal(first.code, 201)
    for (const [fields, text] of [
      [{ assetTag: ' pc-001 ', serialNumber: 'NEW-SERIAL' }, /patrimônio/],
      [{ assetTag: 'NEW-ASSET', serialNumber: ' serial-001 ' }, /número de série/],
    ] as const) {
      const failed = response()
      await createDelivery({ body: { ...payload, ...fields }, user: actor } as any, failed as any)
      assert.equal(failed.code, 409)
      assert.match(failed.data.error, text)
    }
    assert.equal(await Delivery.countDocuments(), 1)
    await returnDelivery(first.data.id)
    const next = response()
    await createDelivery({ body: payload, user: actor } as any, next as any)
    assert.equal(next.code, 201)
    assert.notEqual(next.data.id, first.data.id)
    assert.equal(await Delivery.countDocuments(), 2)
  } finally { await database.cleanup() }
})

test('RDS: concorrência e falhas de reserva/recuperação não duplicam a posse nem deixam bloqueios parciais', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => Delivery.create({ ...payload, protocol: `ENT-2026-10-13-${i + 1}` })))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.ok(results.filter(result => result.status === 'rejected').every(result => result.status === 'rejected' && activeConflict(result.reason)))
    const delivery = (results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>).value
    const reservation = await Reservation.create({ equipment: payload.equipment, requesterName: 'Pessoa', requesterEmail: payload.recipientEmail, department: 'TI', purpose: 'Uso', startDate: '2026-10-13', endDate: '2026-10-14', status: 'aprovada' })
    await assert.rejects(createReservedDelivery(reservation.id, { ...payload, protocol: 'ENT-2026-10-13-0100' }), activeConflict)
    assert.equal((await Reservation.findById(reservation.id))!.deliveryId, undefined)
    const res = response()
    await deleteDelivery({ params: { id: delivery.id }, user: actor } as any, res as any)
    assert.equal(res.code, 200)
    const audit = await DeliveryDeletionAudit.findOne({ deliveryId: delivery.id })
    const replacement = await Delivery.create({ ...payload, protocol: 'ENT-2026-10-13-0101' })
    await assert.rejects(restoreArchivedDelivery(audit!.id, actor), error => error instanceof DeliveryRestoreError && error.status === 409 && /patrimônio/.test(error.message))
    assert.equal((await DeliveryDeletionAudit.findById(audit!.id))!.restoredAt, undefined)
    // A serial conflict must roll back the claim for this otherwise-free asset.
    await assert.rejects(Delivery.create({ ...payload, assetTag: 'FREE', protocol: 'ENT-2026-10-13-0102' }), activeConflict)
    const independent = await Delivery.create({ ...payload, assetTag: 'FREE', serialNumber: 'FREE-SERIAL', protocol: 'ENT-2026-10-13-0103' })
    assert.ok(independent.id)
    await returnDelivery(replacement.id)
    assert.equal((await restoreArchivedDelivery(audit!.id, actor)).id, delivery.id)
  } finally { await database.cleanup() }
})

test('RDS: registros duplicados anteriores ficam bloqueados até todas as entregas serem devolvidas', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    await getPool().query('DROP TRIGGER deliveries_equipment_possession ON checklist_donato.deliveries')
    const first = await Delivery.create({ ...payload, protocol: 'ENT-2026-0001' })
    const second = await Delivery.create({ ...payload, protocol: 'ENT-2026-0002' })
    await getPool().query(await readFile(resolve(serverRoot, 'sql/005_equipment_possession.sql'), 'utf8'))
    await returnDelivery(first.id)
    await assert.rejects(Delivery.create({ ...payload, protocol: 'ENT-2026-10-13-0003' }), activeConflict)
    await returnDelivery(second.id)
    const next = await Delivery.create({ ...payload, protocol: 'ENT-2026-10-13-0004' })
    assert.ok(next.id)
    assert.equal(await Delivery.countDocuments(), 3)
  } finally { await database.cleanup() }
})
