import { getPool } from '../../config/postgres.js'
import { mailEnabled, getMailConfig } from '../../config/mail.js'
import { deliveryConfig } from '../../models/modelConfigs.js'
import { generateLoanTermPdf } from '../documents/loanTermPdf.js'
import { sendGraphTerm, MailSendError } from './graphMail.js'

export async function processNextDeliveryEmail(send = sendGraphTerm): Promise<boolean> {
  const pool = getPool()
  // A crashed sender may have already submitted its message: never resend it
  // automatically. An administrator can review Sent Items and retry explicitly.
  await pool.query(`UPDATE checklist_donato.delivery_email_attempts a SET result = 'review', finished_at = now(), error = 'Processamento interrompido.'
    WHERE result = 'processing' AND EXISTS (SELECT 1 FROM checklist_donato.delivery_email_jobs j WHERE j.id = a.job_id AND j.status = 'processing' AND j.started_at < now() - interval '5 minutes')`)
  await pool.query(`UPDATE checklist_donato.delivery_email_jobs SET status = 'review', last_error = 'Envio interrompido. Confira Itens Enviados antes de tentar novamente.', updated_at = now()
    WHERE status = 'processing' AND started_at < now() - interval '5 minutes'`)
  const job = (await pool.query(`WITH claimed AS (UPDATE checklist_donato.delivery_email_jobs SET status = 'processing', attempts = attempts + 1, retry_count = retry_count + 1, started_at = now(), updated_at = now()
    WHERE id = (SELECT id FROM checklist_donato.delivery_email_jobs WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *), attempt AS (INSERT INTO checklist_donato.delivery_email_attempts (job_id, attempt_no) SELECT id, attempts FROM claimed RETURNING id, job_id)
    SELECT claimed.*, attempt.id AS attempt_id FROM claimed JOIN attempt ON attempt.job_id = claimed.id`)).rows[0]
  if (!job) return false
  try {
    const snapshot = Object.fromEntries(Object.entries(deliveryConfig.columns).map(([key, col]) => [key, job.snapshot[col]]))
    let pdf: Buffer = job.pdf
    if (!pdf) {
      pdf = await generateLoanTermPdf(snapshot, job.event_type)
      await pool.query('UPDATE checklist_donato.delivery_email_jobs SET pdf = $2 WHERE id = $1', [job.id, pdf])
    }
    await send(snapshot, pdf, undefined, job.event_type)
    await pool.query(`WITH accepted AS (UPDATE checklist_donato.delivery_email_jobs SET status = 'accepted', accepted_at = now(), last_error = NULL, updated_at = now() WHERE id = $1 RETURNING id)
      UPDATE checklist_donato.delivery_email_attempts a SET result = 'accepted', finished_at = now() FROM accepted WHERE a.id = $2 AND a.job_id = accepted.id`, [job.id, job.attempt_id])
  } catch (error) {
    const failure = error instanceof MailSendError ? error : new MailSendError('Não foi possível gerar ou registrar o envio do termo.', false, true)
    const retry = failure.retryable && job.retry_count < 5
    const status = failure.uncertain ? 'review' : retry ? 'pending' : 'failed'
    const delay = Math.max(failure.retryAfterSeconds, Math.min(3600, 30 * 2 ** (job.retry_count - 1)))
    await pool.query(`WITH failed AS (UPDATE checklist_donato.delivery_email_jobs SET status = $2, last_error = $3, next_attempt_at = now() + $4 * interval '1 second', updated_at = now() WHERE id = $1 RETURNING id)
      UPDATE checklist_donato.delivery_email_attempts a SET result = $6, error = $3, finished_at = now() FROM failed WHERE a.id = $5 AND a.job_id = failed.id`, [job.id, status, failure.message, delay, job.attempt_id, retry ? 'retry' : status])
  }
  return true
}

export function startDeliveryEmailWorker(): () => void {
  if (!mailEnabled()) return () => {}
  getMailConfig()
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { for (let i = 0; i < 10 && await processNextDeliveryEmail(); i++) { /* bounded batch */ } }
    catch { console.error('Falha ao processar a fila de termos por e-mail. Os registros permanecem no RDS.') }
    finally { running = false }
  }
  void tick()
  const timer = setInterval(() => void tick(), 10000)
  timer.unref()
  return () => clearInterval(timer)
}
