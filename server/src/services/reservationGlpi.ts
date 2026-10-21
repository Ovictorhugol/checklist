import { getPool } from '../config/postgres.js'
import { getGlpiConfig, glpiEnabled } from '../config/glpi.js'
import { createReservationTicket, GlpiError } from './glpiClient.js'

export async function processNextReservationGlpi(create = createReservationTicket): Promise<boolean> {
  const pool = getPool()
  await pool.query(`UPDATE checklist_donato.reservation_glpi_jobs SET status = 'review', last_error = 'Processamento interrompido. Confira os chamados da reserva no GLPI antes de tentar novamente.', updated_at = now()
    WHERE status = 'processing' AND started_at < now() - interval '5 minutes'`)
  const job = (await pool.query(`UPDATE checklist_donato.reservation_glpi_jobs SET status = 'processing', attempts = attempts + 1, retry_count = retry_count + 1, started_at = now(), updated_at = now()
    WHERE reservation_id = (SELECT reservation_id FROM checklist_donato.reservation_glpi_jobs WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0]
  if (!job) return false
  try {
    const ticket = await create(job.snapshot)
    await pool.query(`UPDATE checklist_donato.reservation_glpi_jobs SET status = 'created', ticket_id = $2, ticket_url = $3, last_error = NULL, updated_at = now() WHERE reservation_id = $1`, [job.reservation_id, ticket.id, ticket.url])
  } catch (error) {
    const failure = error instanceof GlpiError ? error : new GlpiError('Não foi possível confirmar o chamado. Verifique o GLPI antes de tentar novamente.', false, true)
    const status = failure.uncertain ? 'review' : failure.retryable && job.retry_count < 5 ? 'pending' : 'failed'
    const delay = Math.max(failure.retryAfterSeconds, Math.min(3600, 30 * 2 ** (job.retry_count - 1)))
    await pool.query(`UPDATE checklist_donato.reservation_glpi_jobs SET status = $2, last_error = $3, next_attempt_at = now() + $4 * interval '1 second', updated_at = now() WHERE reservation_id = $1`, [job.reservation_id, status, failure.message, delay])
  }
  return true
}

export function startReservationGlpiWorker(): void {
  if (!glpiEnabled()) return
  getGlpiConfig()
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { for (let i = 0; i < 5 && await processNextReservationGlpi(); i++) { /* bounded batch */ } }
    catch { console.error('Falha ao processar a integração GLPI. As reservas permanecem no RDS.') }
    finally { running = false }
  }
  void tick()
  setInterval(() => void tick(), 10000).unref()
}
