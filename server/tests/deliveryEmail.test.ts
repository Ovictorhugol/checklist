import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDatabase } from './postgresTestDatabase.js'
import { getPool } from '../src/config/postgres.js'
import { Delivery } from '../src/models/Delivery.js'
import { DeliveryDeletionAudit } from '../src/models/DeliveryDeletionAudit.js'
import { restoreArchivedDelivery } from '../src/services/restoreDelivery.js'
import { processNextDeliveryEmail } from '../src/services/deliveryEmail.js'
import { MailSendError, sendGraphTerm, clearGraphToken } from '../src/services/graphMail.js'
import { generateLoanTermPdf } from '../src/services/loanTermPdf.js'
import { getDeliveryEmail, retryDeliveryEmail } from '../src/controllers/deliveryEmailController.js'

const signature = { signerName: 'Pessoa', strokes: [[{ x: 10, y: 40 }, { x: 100, y: 80 }, { x: 150, y: 30 }]], signedAt: '2026-10-13T12:00:00Z', capturedBy: 'admin@example.com', documentHash: 'original-hash' }
const data = { protocol: 'ENT-2026-10-13-0001', assetTag: 'A', serialNumber: 'S', recipient: 'Pessoa', recipientEmail: 'pessoa@example.com', recipientCpf: '52998224725', recipientDepartment: 'TI', equipment: 'Notebook', model: 'Modelo de exemplo', brand: 'Marca de exemplo', accessories: 'Carregador', deliveredAt: '2026-10-13T12:00:00Z', signature, parts: [] }

test('Graph: destinatário e PDF seguem os dados assinados; aceite, limite e falha ambígua são distintos', async () => {
  const original = { ...process.env }
  Object.assign(process.env, { MAIL_GRAPH_TENANT_ID: '00000000-0000-0000-0000-000000000001', MAIL_GRAPH_CLIENT_ID: '00000000-0000-0000-0000-000000000002', MAIL_GRAPH_CLIENT_SECRET: 'test-secret', MAIL_FROM_EMAIL: 'sender@example.com' })
  clearGraphToken()
  const pdf = await generateLoanTermPdf(data)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  const request = (async (url: string, options: RequestInit) => {
    if (url.includes('/token')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 })
    assert.ok(url.includes('/users/sender%40example.com/sendMail'))
    const message = JSON.parse(options.body as string)
    assert.equal(message.message.toRecipients[0].emailAddress.address, 'pessoa@example.com')
    assert.equal(message.message.attachments[0].contentBytes, pdf.toString('base64'))
    assert.equal(message.saveToSentItems, true)
    return new Response(null, { status: 202 })
  }) as typeof fetch
  try {
    await sendGraphTerm(data, pdf, request)
    await sendGraphTerm(data, pdf, (async (_url: string, options: RequestInit) => {
      const message = JSON.parse(options.body as string).message
      assert.ok(message.subject.includes('devolução'))
      assert.ok(message.body.content.includes('via do requisitante'))
      assert.ok(message.attachments[0].name.startsWith('termo-devolucao-'))
      assert.equal(message.toRecipients[0].emailAddress.address, data.recipientEmail)
      return new Response(null, { status: 202 })
    }) as typeof fetch, 'return')
    await assert.rejects(sendGraphTerm(data, pdf, (async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } })) as typeof fetch), error => error instanceof MailSendError && error.retryable && error.retryAfterSeconds === 120)
    await assert.rejects(sendGraphTerm(data, pdf, (async () => { throw new Error('timeout') }) as typeof fetch), error => error instanceof MailSendError && error.uncertain)
    await assert.rejects(sendGraphTerm(data, pdf, (async () => new Response(null, { status: 403 })) as typeof fetch), error => error instanceof MailSendError && !error.retryable && !error.uncertain)
  } finally { clearGraphToken(); process.env = original }
})

test('RDS: devolução assinada agenda uma via imutável; rollback, repetição e retries são independentes', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const delivery = await Delivery.create(data)
    const returned = { status: 'devolvido', isReturned: true, returnedAt: '2026-10-14T12:00:00Z', returnInspection: { returnedAt: '2026-10-14T12:00:00Z', signature: { ...signature, signerName: 'Recebedor' }, parts: [{ label: 'Tela', returnedStatus: 'damaged', note: 'Dano registrado na devolução' }] } }
    const session = await Delivery.startSession()
    try {
      await assert.rejects(session.withTransaction(async () => {
        await Delivery.findOneAndUpdate({ _id: delivery.id }, { $set: returned }, { session })
        throw new Error('rollback')
      }))
    } finally { await session.endSession() }
    assert.equal(Number((await getPool().query('SELECT count(*) AS count FROM checklist_donato.delivery_email_jobs')).rows[0].count), 1)
    await Promise.all([Delivery.findOneAndUpdate({ _id: delivery.id, isReturned: false }, { $set: returned }), Delivery.findOneAndUpdate({ _id: delivery.id, isReturned: false }, { $set: returned })])
    await Delivery.findOneAndUpdate({ _id: delivery.id }, { $set: { recipient: 'Alterado após a devolução' } })
    const jobs = (await getPool().query('SELECT event_type, snapshot FROM checklist_donato.delivery_email_jobs ORDER BY event_type')).rows
    assert.deepEqual(jobs.map(row => row.event_type), ['delivery', 'return'])
    assert.equal(jobs[1].snapshot.recipient, data.recipient)
    assert.equal(jobs[1].snapshot.return_inspection.signature.signerName, 'Recebedor')
    const sent: string[] = []
    const send = async (snapshot: Record<string, any>, pdf: Buffer, _request: unknown, eventType: string) => {
      sent.push(eventType)
      assert.equal(snapshot.recipient, data.recipient)
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
      if (eventType === 'return') assert.equal(snapshot.returnInspection.signature.signerName, 'Recebedor')
    }
    await Promise.all([processNextDeliveryEmail(send), processNextDeliveryEmail(send)])
    assert.deepEqual(sent.sort(), ['delivery', 'return'])
    assert.equal(await processNextDeliveryEmail(send), false)
    await getPool().query("UPDATE checklist_donato.delivery_email_jobs SET status = 'failed'")
    const req = { params: { id: delivery.id }, query: { type: 'return' } } as any
    let response: any
    const res = { json: (value: any) => { response = value }, status: () => res } as any
    await getDeliveryEmail(req, res)
    assert.equal(response.job.status, 'failed')
    const enabled = process.env.MAIL_ENABLED
    try { process.env.MAIL_ENABLED = 'true'; await retryDeliveryEmail(req, res) }
    finally { if (enabled === undefined) delete process.env.MAIL_ENABLED; else process.env.MAIL_ENABLED = enabled }
    const retried = (await getPool().query('SELECT event_type, status FROM checklist_donato.delivery_email_jobs ORDER BY event_type')).rows
    assert.deepEqual(retried, [{ event_type: 'delivery', status: 'failed' }, { event_type: 'return', status: 'pending' }])
  } finally { await database.cleanup() }
})

test('RDS: fila atômica, snapshot imutável e trabalhadores concorrentes enviam uma única vez', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    const session = await Delivery.startSession()
    try {
      await assert.rejects(session.withTransaction(async () => { await Delivery.create(data, { session }); throw new Error('rollback') }))
      assert.equal(Number((await getPool().query('SELECT count(*) AS count FROM checklist_donato.delivery_email_jobs')).rows[0].count), 0)
    } finally { await session.endSession() }
    const delivery = await Delivery.create(data)
    await Delivery.findOneAndUpdate({ _id: delivery.id }, { $set: { recipient: 'Nome alterado depois' } })
    let sends = 0
    const send = async (snapshot: Record<string, any>, pdf: Buffer) => {
      sends++
      assert.equal(snapshot.recipient, 'Pessoa')
      assert.equal(snapshot.signature.documentHash, 'original-hash')
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    }
    await Promise.all([processNextDeliveryEmail(send), processNextDeliveryEmail(send)])
    assert.equal(sends, 1)
    const job = (await getPool().query('SELECT * FROM checklist_donato.delivery_email_jobs')).rows[0]
    assert.equal(job.status, 'accepted')
    assert.ok(job.accepted_at)
    assert.equal((await getPool().query('SELECT result FROM checklist_donato.delivery_email_attempts')).rows[0].result, 'accepted')
    await processNextDeliveryEmail(send)
    assert.equal(sends, 1)
    await DeliveryDeletionAudit.create({ deliveryId: delivery.id, deliverySnapshot: { ...delivery.toObject(), id: delivery.id }, deletedByUserId: 'admin', deletedByEmail: 'admin@example.com' })
    await delivery.deleteOne()
    const audit = await DeliveryDeletionAudit.findOne({ deliveryId: delivery.id })
    await restoreArchivedDelivery(audit!.id, { id: 'admin', email: 'admin@example.com' })
    assert.equal(Number((await getPool().query('SELECT count(*) AS count FROM checklist_donato.delivery_email_jobs')).rows[0].count), 1)
  } finally { await database.cleanup() }
})

test('RDS: limite de envio agenda retry; timeout e processo interrompido exigem revisão', { skip: !process.env.TEST_POSTGRES }, async () => {
  const database = await createTestDatabase()
  try {
    await Delivery.create(data)
    await processNextDeliveryEmail(async () => { throw new MailSendError('Limite de envio', true, false, 120) })
    let job = (await getPool().query('SELECT * FROM checklist_donato.delivery_email_jobs')).rows[0]
    assert.equal(job.status, 'pending')
    assert.equal(job.attempts, 1)
    assert.ok(job.next_attempt_at.getTime() > Date.now() + 100000)
    await getPool().query("UPDATE checklist_donato.delivery_email_jobs SET next_attempt_at = now()")
    await processNextDeliveryEmail(async () => { throw new MailSendError('Conexão interrompida', false, true) })
    job = (await getPool().query('SELECT * FROM checklist_donato.delivery_email_jobs')).rows[0]
    assert.equal(job.status, 'review')
    assert.deepEqual((await getPool().query('SELECT result FROM checklist_donato.delivery_email_attempts ORDER BY id')).rows.map(row => row.result), ['retry', 'review'])
    assert.equal(await processNextDeliveryEmail(async () => { throw new Error('Não deve reenviar') }), false)
    await getPool().query("UPDATE checklist_donato.delivery_email_jobs SET status = 'processing', started_at = now() - interval '6 minutes'")
    await processNextDeliveryEmail(async () => { throw new Error('Não deve reenviar') })
    assert.equal((await getPool().query('SELECT status FROM checklist_donato.delivery_email_jobs')).rows[0].status, 'review')
  } finally { await database.cleanup() }
})
