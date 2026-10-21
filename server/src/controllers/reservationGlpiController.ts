import type { Response } from 'express'
import type { AuthRequest } from '../middleware/authMiddleware.js'
import { getPool } from '../config/postgres.js'
import { isValidRecordId } from '../models/postgresModel.js'
import { glpiEnabled } from '../config/glpi.js'

export async function retryReservationGlpi(req: AuthRequest, res: Response): Promise<void> {
  if (req.user?.role !== 'admin') { res.status(403).json({ error: 'Somente o administrador pode tentar novamente a abertura do chamado.' }); return }
  if (!isValidRecordId(req.params.id)) { res.status(400).json({ error: 'Reserva inválida.' }); return }
  if (!glpiEnabled()) { res.status(409).json({ error: 'A integração GLPI está desativada no servidor.' }); return }
  try {
    const result = await getPool().query(`UPDATE checklist_donato.reservation_glpi_jobs SET status = 'pending', retry_count = 0, next_attempt_at = now(), started_at = NULL, last_error = NULL, updated_at = now()
      WHERE reservation_id = $1 AND status IN ('failed', 'review') AND ticket_id IS NULL RETURNING reservation_id`, [req.params.id])
    if (!result.rowCount) { res.status(409).json({ error: 'Esta reserva não possui chamado pendente de nova tentativa. Atualize a lista.' }); return }
    res.json({ message: 'Nova tentativa de abertura do chamado programada.' })
  } catch { res.status(500).json({ error: 'Não foi possível programar a abertura do chamado.' }) }
}
