import type { Request, Response, NextFunction } from 'express'
import { errors as joseErrors } from 'jose'
import { IdentityPermissionError, verifyMicrosoftAccessToken } from '../services/auth/microsoftIdentity.js'

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
    req.user = await verifyMicrosoftAccessToken(token)
    next()
  } catch (error) {
    if (error instanceof IdentityPermissionError) {
      res.status(403).json({ error: error.message })
      return
    }
    // Log only validation metadata, never the token or user claims.
    console.warn('[Microsoft Entra ID] Token recusado:', {
      code: error instanceof joseErrors.JOSEError ? error.code : 'IDENTITY_VALIDATION_FAILED',
      claim: error instanceof joseErrors.JWTClaimValidationFailed ? error.claim : undefined,
    })
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

