import type { Response } from 'express'
import type { AuthRequest } from '../middleware/authMiddleware.js'

export function getProfile(req: AuthRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }
  res.status(200).json({ user: req.user })
}
