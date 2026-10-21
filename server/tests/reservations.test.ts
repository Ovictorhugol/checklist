import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { setupMicrosoftIdentity } from './helpers/microsoftTestIdentity.js'
import { Reservation } from '../src/models/Reservation.js'
import reservationRoutes from '../src/routes/reservationRoutes.js'
import { validateReservation } from '../src/domain/reservation/reservation.js'
import { minimumReservationEndDate } from '../src/domain/reservation/reservationDates.js'

const payload = { equipment: 'Notebook', requesterName: 'Pessoa Teste', department: 'TI', purpose: 'Treinamento', startDate: '2099-10-06', endDate: '2099-10-08' }

test('reservas validam catálogo, período, tamanho dos campos e descartam metadados do cliente', () => {
  assert.deepEqual(validateReservation({ ...payload, requesterEmail: 'outro@example.com', status: 'aprovada', glpiTicketId: 99, glpiStatus: 'created', glpiTicketUrl: 'javascript:alert(1)' }, '2099-10-06'), payload)
  for (const change of [{ equipment: 'impressora' }, { equipment: 'toString' }, { startDate: '2099-10-05' }, { endDate: '2099-10-05' }, { endDate: '2099-10-06' }, { startDate: '2099-02-30' }, { endDate: '2099-13-01' }, { requesterName: ' ' }, { purpose: 'x'.repeat(2001) }]) {
    assert.throws(() => validateReservation({ ...payload, ...change }, '2099-10-06'))
  }
  assert.throws(() => validateReservation(null))
  const model = new Reservation({ ...payload, requesterEmail: 'Pessoa@Example.com' })
  assert.equal(model.validateSync(), undefined)
  const json = JSON.parse(JSON.stringify(model))
  assert.equal(json.status, 'pendente')
  assert.equal(json.requesterEmail, 'pessoa@example.com')
  assert.ok(json.id)
  assert.equal(json._id, undefined)
})

test('reserva aceita o dia seguinte, inclusive em viradas de mês/ano e ano bissexto', () => {
  for (const [startDate, endDate] of [['2099-10-06', '2099-10-07'], ['2026-10-31', '2026-11-01'], ['2026-12-31', '2027-01-01'], ['2028-02-28', '2028-02-29'], ['2028-02-29', '2028-03-01']]) {
    assert.equal(minimumReservationEndDate(startDate), endDate)
    assert.equal(validateReservation({ ...payload, startDate, endDate }, startDate).endDate, endDate)
    assert.throws(() => validateReservation({ ...payload, startDate, endDate: startDate }, startDate), /1 dia/)
  }
  assert.equal(minimumReservationEndDate(''), '')
  assert.equal(minimumReservationEndDate('2026-02-30'), '')
})

test('API de reservas protege identidade, visibilidade e transições concorrentes de situação', async () => {
  const originalEnv = { ...process.env }
  const originals = { find: Reservation.find, create: Reservation.create, update: Reservation.findOneAndUpdate }
  const identity = await setupMicrosoftIdentity()
  const records: Record<string, any>[] = []
  let failSave = false
  Reservation.create = (async (data: Record<string, unknown>) => {
    if (failSave) throw new Error('database offline')
    const record = { ...data, id: (records.length + 1).toString(16).padStart(24, '0'), createdAt: new Date().toISOString() }
    records.push(record)
    return { toJSON: () => record }
  }) as any
  Reservation.find = ((filter: Record<string, unknown>) => ({ sort: async () => records.filter((record) => !filter.requesterEmail || record.requesterEmail === filter.requesterEmail).map((record) => ({ toJSON: () => record })) })) as any
  Reservation.findOneAndUpdate = (async (filter: Record<string, any>, update: Record<string, any>) => {
    const record = records.find((item) => !item.deliveryId && item.id === filter._id && (!filter.requesterEmail || item.requesterEmail === filter.requesterEmail) && (typeof filter.status === 'string' ? item.status === filter.status : filter.status.$in.includes(item.status)))
    if (!record) return null
    Object.assign(record, update.$set)
    return { toJSON: () => record }
  }) as any
  const app = express()
  app.use(express.json()); app.use('/api/reservations', reservationRoutes)
  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/reservations`
    const request = async (path = '', method = 'GET', body?: unknown, role = 'operator', email = ' Pessoa@Example.com ', name = 'Pessoa autenticada') => fetch(base + path, {
      method, headers: { Authorization: `Bearer ${await identity.sign({ id: 'test', role, email, name })}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    })
    assert.equal((await fetch(base)).status, 401)
    assert.equal((await fetch(base + '/000000000000000000000001/glpi/retry', { method: 'POST' })).status, 401)
    assert.equal((await request('/000000000000000000000001/glpi/retry', 'POST')).status, 403)
    assert.equal((await request('', 'POST', payload, 'admin')).status, 403)
    assert.equal(records.length, 0)
    const created = await request('', 'POST', { ...payload, requesterName: 'Nome adulterado', status: 'aprovada', requesterEmail: 'spoof@example.com', reviewedBy: 'spoof@example.com' })
    assert.equal(created.status, 201)
    const own = await created.json()
    assert.equal((await request('', 'POST', { ...payload, endDate: payload.startDate })).status, 400)
    assert.equal(records.length, 1)
    assert.equal(own.requesterEmail, 'pessoa@example.com')
    assert.equal(own.requesterName, 'Pessoa autenticada')
    assert.equal(own.status, 'pendente')
    assert.equal(own.reviewedBy, undefined)
    await request('', 'POST', payload, 'operator', 'other@example.com', '')
    assert.equal(records[1].requesterName, 'other@example.com')
    assert.equal((await (await request('?requesterEmail=other@example.com')).json()).length, 1)
    assert.equal((await (await request('', 'GET', undefined, 'admin')).json()).length, 2)
    assert.equal((await request('/' + own.id, 'PATCH', { status: 'aprovada' })).status, 403)
    assert.equal((await request('/' + records[1].id, 'PATCH', { status: 'cancelada' })).status, 409)
    assert.equal((await request('/' + own.id, 'PATCH', { status: 'recusada', reviewNote: ' ' }, 'admin')).status, 400)
    const approved = await request('/' + own.id, 'PATCH', { status: 'aprovada', reviewedBy: 'spoof', reviewNote: ' Retirada na TI ' }, 'admin', 'admin@example.com')
    assert.equal(approved.status, 200)
    const approval = await approved.json()
    assert.equal(approval.reviewedBy, 'admin@example.com')
    assert.equal(approval.reviewNote, 'Retirada na TI')
    assert.ok(approval.reviewedAt)
    assert.equal((await request('/' + own.id, 'PATCH', { status: 'recusada', reviewNote: 'Equipamento indisponível' }, 'admin')).status, 409)
    assert.equal((await request('/' + own.id, 'PATCH', { status: 'cancelada' })).status, 200)
    assert.equal((await request('/' + own.id, 'PATCH', { status: 'cancelada' })).status, 409)
    assert.equal((await request('/' + records[1].id, 'PATCH', { status: 'recusada', reviewNote: 'Equipamento indisponível' }, 'admin')).status, 200)
    assert.equal((await request('/invalido', 'PATCH', { status: 'aprovada' }, 'admin')).status, 400)
    assert.equal((await request('/' + own.id, 'PATCH', { status: 'pendente' }, 'admin')).status, 400)
    assert.equal((await request('/' + own.id, 'PATCH', { status: 'recusada', reviewNote: 'x'.repeat(1001) }, 'admin')).status, 400)
    assert.equal((await request('', 'POST', { ...payload, endDate: '2000-01-01' })).status, 400)
    records[0].status = 'aprovada'; records[0].deliveryId = 'entrega-vinculada'
    assert.equal((await request('/' + own.id, 'PATCH', { status: 'cancelada' })).status, 409)
    assert.equal(records[0].status, 'aprovada')
    failSave = true
    assert.equal((await request('', 'POST', payload)).status, 500)
    assert.equal(records.length, 2)
  } finally {
    identity.restore()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    Reservation.find = originals.find; Reservation.create = originals.create; Reservation.findOneAndUpdate = originals.update
    process.env = originalEnv
  }
})
