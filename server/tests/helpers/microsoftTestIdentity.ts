import { generateKeyPair, exportJWK, SignJWT } from 'jose'

export const identityConfig = {
  ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  ENTRA_API_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
  ENTRA_CLIENT_ID: '33333333-3333-3333-3333-333333333333',
}

// Exercise the real middleware with signed Entra-shaped tokens and isolated public keys.
export async function setupMicrosoftIdentity() {
  Object.assign(process.env, identityConfig)
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('login.microsoftonline.com/')) {
      return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } })
    }
    return originalFetch(input, init)
  }
  return {
    restore: () => { globalThis.fetch = originalFetch },
    sign: (user: { id?: string; email: string; role: string; name?: string }, expiresIn = '5m') => new SignJWT({
      tid: identityConfig.ENTRA_TENANT_ID, oid: user.id || 'test-user',
      azp: identityConfig.ENTRA_CLIENT_ID, ver: '2.0', scp: 'access_as_user',
      roles: [user.role], preferred_username: user.email, name: user.name,
    }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`https://login.microsoftonline.com/${identityConfig.ENTRA_TENANT_ID}/v2.0`)
      .setAudience(identityConfig.ENTRA_API_CLIENT_ID).setIssuedAt().setExpirationTime(expiresIn).sign(privateKey),
  }
}
