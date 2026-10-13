export function mailEnabled(): boolean { return process.env.MAIL_ENABLED === 'true' }

export function getMailConfig() {
  const tenantId = process.env.MAIL_GRAPH_TENANT_ID ?? ''
  const clientId = process.env.MAIL_GRAPH_CLIENT_ID ?? ''
  const clientSecret = process.env.MAIL_GRAPH_CLIENT_SECRET ?? ''
  const sender = process.env.MAIL_FROM_EMAIL?.trim().toLowerCase() ?? ''
  const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  if (!guid.test(tenantId) || !guid.test(clientId) || !clientSecret || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
    throw new Error('Configure MAIL_GRAPH_TENANT_ID, MAIL_GRAPH_CLIENT_ID, MAIL_GRAPH_CLIENT_SECRET e MAIL_FROM_EMAIL.')
  }
  return { tenantId, clientId, clientSecret, sender }
}
