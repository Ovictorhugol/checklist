import type { Response } from 'express'
import type { AuthRequest } from '../middleware/authMiddleware.js'
import { getPool } from '../config/postgres.js'
import { mailEnabled } from '../config/mail.js'
import { isValidRecordId } from '../models/postgresModel.js'

export async function getDeliveryEmail(req: AuthRequest, res: Response): Promise<void> {
  if (!isValidRecordId(req.params.id)) { res.status(400).json({ error: 'Entrega inválida.' }); return }
  const eventType = req.query.type ?? 'delivery'
  if (eventType !== 'delivery' && eventType !== 'return') { res.status(400).json({ error: 'Tipo de termo inválido.' }); return }
  try {
    const result = await getPool().query(`SELECT j.status, j.recipient_email AS "recipientEmail", j.attempts, j.accepted_at AS "acceptedAt", j.last_error AS "lastError"
      FROM checklist_donato.delivery_email_jobs j JOIN checklist_donato.deliveries d ON d.id = j.delivery_id WHERE d.id = $1 AND j.event_type = $2`, [req.params.id, eventType])
    res.json({ enabled: mailEnabled(), job: result.rows[0] ?? null })
  } catch { res.status(500).json({ error: 'Não foi possível consultar o envio do termo.' }) }
}

export async function retryDeliveryEmail(req: AuthRequest, res: Response): Promise<void> {
  if (!mailEnabled()) { res.status(409).json({ error: 'O envio de e-mail está desativado no servidor.' }); return }
  if (!isValidRecordId(req.params.id)) { res.status(400).json({ error: 'Entrega inválida.' }); return }
  const eventType = req.query.type ?? 'delivery'
  if (eventType !== 'delivery' && eventType !== 'return') { res.status(400).json({ error: 'Tipo de termo inválido.' }); return }
  try {
    const result = await getPool().query(`UPDATE checklist_donato.delivery_email_jobs j SET status = 'pending', retry_count = 0, next_attempt_at = now(), started_at = NULL, last_error = NULL, updated_at = now()
      WHERE delivery_id = $1 AND event_type = $2 AND status IN ('failed', 'review') AND EXISTS (SELECT 1 FROM checklist_donato.deliveries d WHERE d.id = j.delivery_id) RETURNING id`, [req.params.id, eventType])
    if (!result.rowCount) { res.status(409).json({ error: 'Este envio não está disponível para nova tentativa. Atualize a consulta.' }); return }
    res.json({ message: 'Nova tentativa de envio programada.' })
  } catch { res.status(500).json({ error: 'Não foi possível programar uma nova tentativa.' }) }
}
