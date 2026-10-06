export function isMicrosoftAuth(): boolean {
  const provider = process.env.AUTH_PROVIDER || 'local'
  if (!['local', 'microsoft'].includes(provider)) throw new Error('AUTH_PROVIDER deve ser local ou microsoft.')
  return provider === 'microsoft'
}

export function getMicrosoftConfig() {
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const values = ['ENTRA_TENANT_ID', 'ENTRA_API_CLIENT_ID', 'ENTRA_CLIENT_ID'] as const
  for (const key of values) {
    if (!guid.test(process.env[key] || '')) throw new Error(`Configure ${key} com o ID fornecido pelo Entra ID.`)
  }
  return {
    tenantId: process.env.ENTRA_TENANT_ID!,
    apiClientId: process.env.ENTRA_API_CLIENT_ID!,
    clientId: process.env.ENTRA_CLIENT_ID!,
    scope: 'access_as_user',
  }
}
