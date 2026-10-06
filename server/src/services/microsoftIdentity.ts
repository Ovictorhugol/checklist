import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { getMicrosoftConfig } from '../config/identity.js'

export class IdentityPermissionError extends Error {}

export function createMicrosoftVerifier(config: ReturnType<typeof getMicrosoftConfig>, keys?: JWTVerifyGetKey) {
  const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`
  const keySet = keys ?? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`))
  return async (token: string) => {
    const { payload } = await jwtVerify(token, keySet, {
      issuer, audience: config.apiClientId, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'tid', 'oid', 'azp', 'ver'],
    })
    if (payload.tid !== config.tenantId || payload.ver !== '2.0' || typeof payload.oid !== 'string' || !payload.oid) {
      throw new Error('Identidade Microsoft inválida.')
    }
    if (payload.azp !== config.clientId || typeof payload.scp !== 'string' || !payload.scp.split(' ').includes(config.scope)) {
      throw new IdentityPermissionError('Aplicativo ou permissão de acesso não autorizado.')
    }
    const roles = Array.isArray(payload.roles) ? payload.roles : []
    const role = roles.includes('admin') ? 'admin' : roles.includes('operator') ? 'operator' : null
    if (!role) throw new IdentityPermissionError('Seu usuário não possui acesso ao checklist. Solicite ao administrador.')
    const username = [payload.preferred_username, payload.email, payload.upn].find((value) => typeof value === 'string' && value.trim())
    return {
      id: `${payload.tid}:${payload.oid}`,
      email: typeof username === 'string' ? username : payload.oid,
      name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined,
      role,
    }
  }
}

let verifier: ReturnType<typeof createMicrosoftVerifier> | undefined
export function verifyMicrosoftAccessToken(token: string) {
  verifier ??= createMicrosoftVerifier(getMicrosoftConfig())
  return verifier(token)
}
