import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDatabase } from './helpers/postgresTestDatabase.js'
import { Delivery } from '../src/models/Delivery.js'
import { Reservation } from '../src/models/Reservation.js'
import { createReservedDelivery, ReservationDeliveryConflict } from '../src/services/reservations/reservationDelivery.js'

test('entrega de reserva valida aprovação, destinatário e equipamento; falha desfaz o vínculo', async () => {
  const originals = { startSession: Delivery.startSession, create: Delivery.create, update: Reservation.findOneAndUpdate }
  const reservationId = '000000000000000000000001'
  let reservation: Record<string, any> = { status: 'aprovada', equipment: 'Celular', requesterEmail: 'pessoa@example.com', requesterName: 'Pessoa', department: 'TI' }
  let failDelivery = false
  let creations = 0
  let ended = 0
  const session = {
    async withTransaction(work: () => Promise<void>) {
      const snapshot = { ...reservation }
      try { await work() } catch (error) { reservation = snapshot; throw error }
    },
    async endSession() { ended++ },
  }
  Delivery.startSession = (async () => session) as any
  Reservation.findOneAndUpdate = (async (filter: Record<string, any>, update: Record<string, any>, options: Record<string, any>) => {
    assert.equal(options.session, session)
    assert.equal(filter._id, reservationId)
    assert.equal(filter.deliveryId, null)
    if (reservation.status !== filter.status || reservation.deliveryId || reservation.requesterEmail !== filter.requesterEmail || reservation.requesterName !== filter.requesterName || reservation.department !== filter.department) return null
    Object.assign(reservation, update.$set)
    return reservation
  }) as any
  Delivery.create = (async (records: any[], options: Record<string, any>) => {
    assert.equal(options.session, session)
    if (failDelivery) throw new Error('Falha ao salvar entrega')
    creations++
    return records.map((record) => ({ ...record, id: record._id.toString() }))
  }) as any
  const payload = { equipment: reservation.equipment, recipientEmail: reservation.requesterEmail, recipient: reservation.requesterName, recipientDepartment: reservation.department, protocol: 'ENT-2026-0001' }
  try {
    for (const change of [{ recipient: 'Outra pessoa' }, { recipientDepartment: 'Outro setor' }, { recipientEmail: 'outra@example.com' }, { equipment: 'Notebook' }]) {
      await assert.rejects(createReservedDelivery(reservationId, { ...payload, ...change }), ReservationDeliveryConflict)
    }
    for (const status of ['pendente', 'recusada', 'cancelada']) {
      reservation.status = status
      await assert.rejects(createReservedDelivery(reservationId, payload), ReservationDeliveryConflict)
    }
    reservation.status = 'aprovada'; failDelivery = true
    await assert.rejects(createReservedDelivery(reservationId, payload), /Falha ao salvar/)
    assert.equal(reservation.deliveryId, undefined)
    assert.equal(reservation.deliveryProtocol, undefined)
    failDelivery = false
    const saved = await createReservedDelivery(reservationId, payload)
    assert.equal(saved.reservationId, reservationId)
    assert.equal(reservation.deliveryId, saved.id)
    assert.equal(reservation.deliveryProtocol, payload.protocol)
    await assert.rejects(createReservedDelivery(reservationId, payload), ReservationDeliveryConflict)
    assert.equal(creations, 1)
    assert.equal(ended, 10)
  } finally {
    Delivery.startSession = originals.startSession; Delivery.create = originals.create; Reservation.findOneAndUpdate = originals.update
  }
})

test('PostgreSQL: vínculo atômico, entrega única por reserva e rollback', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    await Promise.all([Delivery.init(), Reservation.init()])
    const reservation = await Reservation.create({ equipment: 'Celular Marca de exemplo Modelo de exemplo', requesterName: 'Pessoa', requesterEmail: 'pessoa@example.com', department: 'TI', purpose: 'Uso', startDate: '2099-01-01', endDate: '2099-01-02', status: 'aprovada' })
    const payload = { equipment: 'Celular', recipientEmail: reservation.requesterEmail, recipient: 'Pessoa', recipientDepartment: 'TI', assetTag: 'TESTE', serialNumber: 'TESTE', model: 'Modelo de exemplo', brand: 'Marca de exemplo', parts: [], protocol: 'ENT-2099-0001' }
    const results = await Promise.allSettled([createReservedDelivery(reservation.id, payload), createReservedDelivery(reservation.id, { ...payload, protocol: 'ENT-2099-0002' })])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(await Delivery.countDocuments({ reservationId: reservation.id }), 1)
    const linked = await Reservation.findById(reservation.id)
    const delivery = await Delivery.findOne({ reservationId: reservation.id })
    assert.equal(linked!.deliveryProtocol, delivery!.protocol)
    assert.equal(linked!.deliveryId, delivery!.id)
    const another = await Reservation.create({ ...reservation.toObject(), _id: undefined, deliveryId: undefined, deliveryProtocol: undefined })
    await assert.rejects(createReservedDelivery(another.id, { ...payload, protocol: delivery!.protocol }))
    assert.equal((await Reservation.findById(another.id))!.deliveryId, undefined)
  } finally {
    await database.cleanup()
  }
})
