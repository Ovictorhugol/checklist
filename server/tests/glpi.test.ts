import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReservationTicket, checkGlpiConnection, GlpiError } from '../src/services/glpi/glpiClient.js'
import { createTestDatabase } from './helpers/postgresTestDatabase.js'
import { Reservation } from '../src/models/Reservation.js'
import { getPool } from '../src/config/postgres.js'
import { processNextReservationGlpi } from '../src/services/reservations/reservationGlpi.js'
import { retryReservationGlpi } from '../src/controllers/reservationGlpiController.js'

const snapshot = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', requester_name: 'Pessoa Teste', requester_email: 'pessoa@example.com', department: 'TI', equipment: 'Notebook', purpose: 'Treinamento <script>alert(1)</script>', start_date: '2099-10-06', end_date: '2099-10-08' }
const reservation = { requesterName: snapshot.requester_name, requesterEmail: snapshot.requester_email, department: snapshot.department, equipment: snapshot.equipment, purpose: snapshot.purpose, startDate: snapshot.start_date, endDate: snapshot.end_date }

function fakeGlpi(options: { existing?: boolean | 'content' | 'both' | 'duplicate'; ambiguousCategory?: boolean; failPost?: number | 'timeout' } = {}) {
  const calls: { path: string; method: string; body?: any }[] = []
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Retry-After': '120' } })
  const request = (async (url: string, input: RequestInit) => {
    const path = new URL(url).pathname.split('/').at(-1)!
    const method = input.method!
    const body = input.body ? JSON.parse(input.body as string) : undefined
    calls.push({ path, method, body })
    const headers = input.headers as Record<string, string>
    assert.equal(input.redirect, 'error')
    assert.equal(headers['App-Token'], 'fake-app')
    if (path === 'initSession') {
      assert.equal(headers.Authorization, 'user_token fake-user')
      return json({ session_token: 'fake-session' })
    }
    assert.equal(headers['Session-Token'], 'fake-session')
    assert.equal(headers.Authorization, undefined)
    if (path === 'getActiveEntities') return json({ active_entity: { id: 0 } })
    if (path === 'ITILCategory') return json([{ id: 25, name: 'Hardware', entities_id: 0, is_request: 1 }, ...(options.ambiguousCategory ? [{ id: 26, name: 'Hardware', entities_id: 0, is_request: 1 }] : [])])
    if (path === 'killSession') return json(true)
    if (path === 'Ticket' && method === 'GET') {
      const field = new URL(url).searchParams.has('searchText[content]') ? 'content' : 'name'
      if (!options.existing) return json([])
      const legacy = { id: 123, name: `[Reserva ${snapshot.id}] Chamado já existente` }
      const current = { id: options.existing === 'duplicate' ? 456 : 123, name: 'Nova Reserva de Equipamento realizada', content: `<p>Referência: [Reserva ${snapshot.id}]</p>` }
      return json(field === 'name' ? options.existing === 'content' ? [] : [legacy] : options.existing === true ? [] : [current])
    }
    if (path === 'Ticket' && method === 'POST') {
      if (options.failPost === 'timeout') throw new Error('Network error')
      if (options.failPost) return json(['ERROR_TEST', 'Never expose server response or tokens'], options.failPost)
      return json({ id: 123 }, 201)
    }
    throw new Error(`Unexpected request: ${path}`)
  }) as typeof fetch
  return { request, calls }
}

test('GLPI 10: chamado preserva solicitante, categoria, entidade e dados; consulta prévia evita duplicidade', async () => {
  const original = { ...process.env }
  Object.assign(process.env, { GLPI_BASE_URL: 'http://glpi.example.com', GLPI_APP_TOKEN: 'fake-app', GLPI_USER_TOKEN: 'fake-user', GLPI_CATEGORY_NAME: 'Hardware', GLPI_CATEGORY_ID: '', GLPI_ENTITY_ID: '', GLPI_GROUP_ID: '' })
  try {
    const fake = fakeGlpi()
    assert.deepEqual(await createReservationTicket(snapshot, fake.request), { id: 123, url: 'http://glpi.example.com/front/ticket.form.php?id=123' })
    const input = fake.calls.find(call => call.method === 'POST')!.body.input
    assert.equal(input.type, 2)
    assert.equal(input.itilcategories_id, 25)
    assert.equal(input.entities_id, 0)
    assert.equal(input._users_id_requester_notif.alternative_email, snapshot.requester_email)
    assert.equal(input._groups_id_assign, undefined)
    assert.equal(input.name, `Nova Reserva de Equipamento realizada por ${snapshot.requester_name}`)
    assert.ok(input.content.includes(`[Reserva ${snapshot.id}]`))
    assert.ok(input.content.includes('&lt;script&gt;'))
    assert.ok(!input.content.includes('<script>'))
    for (const value of [snapshot.requester_name, snapshot.requester_email, snapshot.department, snapshot.equipment]) assert.ok(input.content.includes(value))
    assert.ok(input.content.includes('<p>Período de uso: 06/10/2099 a 08/10/2099</p>'))
    assert.ok(!input.content.includes(snapshot.start_date))
    assert.ok(!input.content.includes(snapshot.end_date))
    assert.equal(fake.calls.at(-1)?.path, 'killSession')
    for (const mode of [true, 'content', 'both'] as const) {
      const existing = fakeGlpi({ existing: mode })
      assert.equal((await createReservationTicket(snapshot, existing.request)).id, 123)
      assert.equal(existing.calls.filter(call => call.method === 'POST').length, 0)
    }
    const duplicate = fakeGlpi({ existing: 'duplicate' })
    await assert.rejects(createReservationTicket(snapshot, duplicate.request), error => error instanceof GlpiError && error.uncertain)
    assert.equal(duplicate.calls.filter(call => call.method === 'POST').length, 0)
    const check = fakeGlpi()
    assert.equal((await checkGlpiConnection(check.request)).categoryId, 25)
    assert.equal(check.calls.filter(call => call.method === 'POST').length, 0)
    const ambiguous = fakeGlpi({ ambiguousCategory: true })
    await assert.rejects(createReservationTicket(snapshot, ambiguous.request), error => error instanceof GlpiError && error.message.includes('ambígua'))
    assert.equal(ambiguous.calls.filter(call => call.method === 'POST').length, 0)
    for (const status of [503, 'timeout'] as const) {
      await assert.rejects(createReservationTicket(snapshot, fakeGlpi({ failPost: status }).request), error => error instanceof GlpiError && error.uncertain && !error.retryable && !error.message.includes('Never expose'))
    }
    await assert.rejects(createReservationTicket(snapshot, fakeGlpi({ failPost: 429 }).request), error => error instanceof GlpiError && error.retryable && !error.uncertain && error.retryAfterSeconds === 120)
  } finally { process.env = original }
})

test('GLPI: título com solicitante e descrição com somente a primeira palavra de qualquer equipamento', async () => {
  const original = { ...process.env }
  Object.assign(process.env, { GLPI_BASE_URL: 'http://glpi.example.com', GLPI_APP_TOKEN: 'fake-app', GLPI_USER_TOKEN: 'fake-user', GLPI_CATEGORY_NAME: 'Hardware', GLPI_CATEGORY_ID: '', GLPI_ENTITY_ID: '', GLPI_GROUP_ID: '' })
  try {
    for (const [fullName, firstName] of [
      ['Notebook Dell Latitude 5440', 'Notebook'],
      ['Desktop Dell OptiPlex 7010', 'Desktop'],
      ['Computador Dell OptiPlex 7010', 'Computador'],
      ['Celular Samsung Galaxy A54', 'Celular'],
      ['Monitor Dell P2422H', 'Monitor'],
      ['Impressora HP LaserJet', 'Impressora'],
      ['  Notebook\tDell Latitude 5440  ', 'Notebook'],
      ['Monitor', 'Monitor'],
    ]) {
      const fake = fakeGlpi()
      const data = { ...snapshot, equipment: fullName }
      await createReservationTicket(data, fake.request)
      const input = fake.calls.find(call => call.path === 'Ticket' && call.method === 'POST')!.body.input
      assert.equal(input.name, `Nova Reserva de Equipamento realizada por ${snapshot.requester_name}`)
      assert.ok(input.content.includes(`<p>Equipamento: ${firstName}</p>`))
      assert.equal(data.equipment, fullName, 'O snapshot original da reserva deve ser preservado')
    }
  } finally { process.env = original }
})

test('RDS: fila de reservas é atômica, imutável e concorrência abre apenas um chamado', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const session = await Reservation.startSession()
    try {
      await assert.rejects(session.withTransaction(async () => { await Reservation.create(reservation, { session }); throw new Error('rollback') }))
    } finally { await session.endSession() }
    assert.equal(Number((await getPool().query('SELECT count(*) AS count FROM checklist_donato.reservation_glpi_jobs')).rows[0].count), 0)
    const record = await Reservation.create(reservation)
    assert.equal(record.glpiStatus, 'pending')
    await Reservation.findOneAndUpdate({ _id: record.id }, { $set: { purpose: 'Mudança posterior', status: 'aprovada' } })
    let creations = 0
    const create = async (data: typeof snapshot) => { creations++; assert.equal(data.purpose, snapshot.purpose); return { id: 123, url: 'http://glpi.example.com/front/ticket.form.php?id=123' } }
    await Promise.all([processNextReservationGlpi(create), processNextReservationGlpi(create)])
    assert.equal(creations, 1)
    const saved = await Reservation.findById(record.id)
    assert.equal(saved!.glpiStatus, 'created')
    assert.equal(saved!.glpiTicketId, 123)
    assert.equal(saved!.status, 'aprovada')
    assert.equal(await processNextReservationGlpi(create), false)
    assert.equal(creations, 1)
  } finally { await database.cleanup() }
})

test('RDS: falha segura repete, falha ambígua exige revisão e apenas administrador pode reagendar', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  const originalEnabled = process.env.GLPI_ENABLED
  try {
    const record = await Reservation.create(reservation)
    await processNextReservationGlpi(async () => { throw new GlpiError('Indisponível antes do POST', true, false, 120) })
    let job = (await getPool().query('SELECT * FROM checklist_donato.reservation_glpi_jobs')).rows[0]
    assert.equal(job.status, 'pending')
    assert.ok(job.next_attempt_at.getTime() > Date.now() + 100000)
    assert.equal(await processNextReservationGlpi(async () => { throw new Error('Not due') }), false)
    await getPool().query('UPDATE checklist_donato.reservation_glpi_jobs SET next_attempt_at = now()')
    await processNextReservationGlpi(async () => { throw new GlpiError('Timeout no POST', false, true) })
    assert.equal((await Reservation.findById(record.id))!.glpiStatus, 'review')
    assert.equal(await processNextReservationGlpi(async () => { throw new Error('Must not create') }), false)
    const req = { params: { id: record.id }, user: { role: 'operator' } } as any
    let status = 200
    const res = { status: (value: number) => { status = value; return res }, json: () => undefined } as any
    process.env.GLPI_ENABLED = 'true'
    await retryReservationGlpi(req, res)
    assert.equal(status, 403)
    req.user.role = 'admin'; status = 200
    await retryReservationGlpi(req, res)
    assert.equal(status, 200)
    job = (await getPool().query('SELECT * FROM checklist_donato.reservation_glpi_jobs')).rows[0]
    assert.equal(job.status, 'pending')
    assert.equal(job.retry_count, 0)
    assert.equal(job.attempts, 2)
    await getPool().query("UPDATE checklist_donato.reservation_glpi_jobs SET status = 'processing', started_at = now() - interval '6 minutes'")
    await processNextReservationGlpi(async () => { throw new Error('Must not resend a crashed job') })
    assert.equal((await Reservation.findById(record.id))!.glpiStatus, 'review')
  } finally {
    await database.cleanup()
    if (originalEnabled === undefined) delete process.env.GLPI_ENABLED; else process.env.GLPI_ENABLED = originalEnabled
  }
})
