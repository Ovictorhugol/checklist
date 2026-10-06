import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose'
import { createMicrosoftVerifier, IdentityPermissionError } from '../src/services/microsoftIdentity.js'
import { validateEnvironment } from '../src/config/environment.js'
import authRoutes from '../src/routes/authRoutes.js'

const config = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  apiClientId: '22222222-2222-2222-2222-222222222222',
  clientId: '33333333-3333-3333-3333-333333333333', scope: 'access_as_user',
}

test('Microsoft: assinatura, validade, emissor, audience, tenant, cliente, scope e funções', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' }
  const verify = createMicrosoftVerifier(config, createLocalJWKSet({ keys: [jwk] }))
  const payload = {
    iss: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
    aud: config.apiClientId, tid: config.tenantId, oid: 'user-object-id',
    azp: config.clientId, ver: '2.0', scp: config.scope,
    roles: ['operator'], preferred_username: 'operator@example.com',
    name: 'Operador de Teste',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300,
  }
  const sign = (override: Record<string, unknown> = {}) => new SignJWT({ ...payload, ...override })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey)
  assert.deepEqual(await verify(await sign()), {
    id: `${config.tenantId}:user-object-id`, email: 'operator@example.com', name: 'Operador de Teste', role: 'operator',
  })
  assert.equal((await verify(await sign({ roles: ['admin', 'operator'] }))).role, 'admin')
  for (const override of [
    { iss: 'https://attacker.example.com' }, { aud: config.clientId },
    { tid: 'another-tenant' }, { exp: 1 }, { ver: '1.0' }, { oid: '' },
  ]) {
    await assert.rejects(() => sign(override).then(verify))
  }
  for (const override of [
    { azp: 'another-client' }, { scp: 'User.Read' }, { scp: undefined },
    { roles: [] }, { roles: ['unknown'] }, { roles: undefined },
  ]) {
    await assert.rejects(() => sign(override).then(verify), IdentityPermissionError)
  }
  const attacker = await generateKeyPair('RS256')
  const forged = await new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(attacker.privateKey)
  await assert.rejects(() => verify(forged))
  const missingExpiry = { ...payload, exp: undefined }
  await assert.rejects(() => new SignJWT(missingExpiry).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey).then(verify))
})

test('Microsoft: configuração dispensa credenciais locais e rotas de senha ficam bloqueadas', async () => {
  const original = { ...process.env }
  Object.assign(process.env, {
    AUTH_PROVIDER: 'microsoft', ENTRA_TENANT_ID: config.tenantId,
    ENTRA_API_CLIENT_ID: config.apiClientId, ENTRA_CLIENT_ID: config.clientId,
    MONGO_URI: 'mongodb://localhost/test',
  })
  delete process.env.JWT_SECRET
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  const server = app.listen(0, '127.0.0.1')
  try {
    assert.doesNotThrow(validateEnvironment)
    process.env.ENTRA_TENANT_ID = 'common'
    assert.throws(validateEnvironment, /ENTRA_TENANT_ID/)
    process.env.ENTRA_TENANT_ID = config.tenantId
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/auth`
    for (const [method, path] of [['POST', '/login'], ['POST', '/register'], ['PATCH', '/password']]) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' })
      assert.equal(response.status, 403)
    }
    assert.equal((await fetch(base + '/me')).status, 401)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    process.env = original
  }
})
