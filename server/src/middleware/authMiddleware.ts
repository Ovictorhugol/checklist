import { getJwtSecret } from '../config/environment.js'
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { errors as joseErrors } from 'jose'
import { isMicrosoftAuth } from '../config/identity.js'
import { IdentityPermissionError, verifyMicrosoftAccessToken } from '../services/microsoftIdentity.js'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name?: string
    role: string
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido' })
    return
  }

  const token = authHeader.split(' ')[1]
  try {
    if (isMicrosoftAuth()) {
      req.user = await verifyMicrosoftAccessToken(token)
      next()
      return
    }
    const secret = getJwtSecret()
    const decoded = jwt.verify(token, secret) as { id: string; email: string; role: string }
    if (typeof decoded.id !== 'string' || typeof decoded.email !== 'string' || !['admin', 'operator'].includes(decoded.role)) throw new Error('Token inválido')
    req.user = decoded
    next()
  } catch (error) {
    if (error instanceof IdentityPermissionError) {
      res.status(403).json({ error: error.message })
      return
    }
    if (isMicrosoftAuth()) {
      // Log only validation metadata, never the token or user claims.
      console.warn('[Microsoft Entra ID] Token recusado:', {
        code: error instanceof joseErrors.JOSEError ? error.code : 'IDENTITY_VALIDATION_FAILED',
        claim: error instanceof joseErrors.JWTClaimValidationFailed ? error.claim : undefined,
      })
    }
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

