import type { Response } from 'express'
import { isValidRecordId } from '../models/postgresModel.js'
import type { AuthRequest } from '../middleware/authMiddleware.js'
import { Reservation } from '../models/Reservation.js'
import { validateReservation } from '../domain/reservation.js'

export async function listReservations(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Não autenticado.' }); return }
  try {
    const filter = req.user.role === 'admin' ? {} : { requesterEmail: req.user.email.trim().toLowerCase() }
    const records = await Reservation.find(filter).sort({ createdAt: -1 })
    res.json(records.map((record) => record.toJSON()))
  } catch { res.status(500).json({ error: 'Não foi possível carregar as reservas.' }) }
}

export async function createReservation(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Não autenticado.' }); return }
  if (req.user.role === 'admin') { res.status(403).json({ error: 'Administradores gerenciam as reservas; a solicitação é exclusiva dos usuários.' }); return }
  let data: ReturnType<typeof validateReservation>
  try { data = validateReservation(req.body) }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return }
  try {
    const record = await Reservation.create({ ...data, requesterEmail: req.user.email.trim().toLowerCase(), status: 'pendente' })
    res.status(201).json(record.toJSON())
  } catch { res.status(500).json({ error: 'Não foi possível registrar a reserva. Tente novamente.' }) }
}

export async function updateReservation(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Não autenticado.' }); return }
  if (!isValidRecordId(req.params.id)) { res.status(400).json({ error: 'Reserva inválida.' }); return }
  const { status, reviewNote = '' } = req.body ?? {}
  if (!['aprovada', 'recusada', 'cancelada'].includes(status) || typeof reviewNote !== 'string' || reviewNote.length > 1000) {
    res.status(400).json({ error: 'Situação ou observação inválida.' }); return
  }
  const admin = req.user.role === 'admin'
  if (!admin && status !== 'cancelada') { res.status(403).json({ error: 'Somente o administrador pode analisar solicitações.' }); return }
  if (status === 'recusada' && !reviewNote.trim()) { res.status(400).json({ error: 'Informe a justificativa da recusa para o solicitante.' }); return }
  const filter = {
    _id: req.params.id,
    deliveryId: null,
    status: status === 'cancelada' ? { $in: ['pendente', 'aprovada'] } : 'pendente',
    ...(!admin ? { requesterEmail: req.user.email.trim().toLowerCase() } : {}),
  }
  try {
    const record = await Reservation.findOneAndUpdate(filter, { $set: {
      status, reviewNote: reviewNote.trim(), reviewedBy: req.user.email.trim().toLowerCase(), reviewedAt: new Date().toISOString(),
    } }, { new: true, runValidators: true })
    if (!record) { res.status(409).json({ error: 'Reserva indisponível ou já atualizada. Atualize a lista antes de tentar novamente.' }); return }
    res.json(record.toJSON())
  } catch { res.status(500).json({ error: 'Não foi possível atualizar a reserva.' }) }
}
