import { getJwtSecret } from '../config/environment.js'
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
  }
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido' })
    return
  }

  const token = authHeader.split(' ')[1]
  const secret = getJwtSecret()

  try {
    const decoded = jwt.verify(token, secret) as { id: string; email: string; role: string }
    if (typeof decoded.id !== 'string' || typeof decoded.email !== 'string' || !['admin', 'operator'].includes(decoded.role)) throw new Error('Token inválido')
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' })
  }
}

export function adminOnlyMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      error: 'Acesso negado: apenas o usuário administrador tem permissão para excluir entregas.',
    })
    return
  }

  next()
}

