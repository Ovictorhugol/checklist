import { getMailConfig } from '../config/mail.js'

export class MailSendError extends Error {
  constructor(message: string, public readonly retryable = false, public readonly uncertain = false, public readonly retryAfterSeconds = 0) { super(message) }
}
let cachedToken: { value: string; expiresAt: number } | undefined
export function clearGraphToken(): void { cachedToken = undefined }

export async function getGraphMailToken(request: typeof fetch = fetch): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value
  const config = getMailConfig()
  let response: Response
  try {
    response = await request(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret, scope: 'https://graph.microsoft.com/.default' }),
    })
  } catch { throw new MailSendError('Não foi possível conectar à autenticação Microsoft.', true) }
  const data = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null
  if (!response.ok || typeof data?.access_token !== 'string') {
    throw new MailSendError(`Autenticação Microsoft recusada (HTTP ${response.status}). Verifique as credenciais e a validade do segredo.`, response.status === 429 || response.status >= 500)
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 }
  return cachedToken.value
}

export async function sendGraphTerm(snapshot: Record<string, any>, pdf: Buffer, request: typeof fetch = fetch, eventType: 'delivery' | 'return' = 'delivery'): Promise<void> {
  if (pdf.length >= 3 * 1024 * 1024) throw new MailSendError('O PDF excede o limite de anexo desta integração.')
  const config = getMailConfig()
  const token = await getGraphMailToken(request)
  const isReturn = eventType === 'return'
  let response: Response
  try {
    response = await request(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`, {
      method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        subject: `Termo de ${isReturn ? 'devolução' : 'empréstimo'} assinado — ${snapshot.protocol}`,
        body: { contentType: 'Text', content: `Olá, ${snapshot.recipient}.\n\nSegue ${isReturn ? 'a via do requisitante do termo de devolução' : 'a cópia do termo de responsabilidade da entrega'}, preenchido e assinado, referente ao protocolo ${snapshot.protocol}.\n\nDonato Hospital de Olhos` },
        toRecipients: [{ emailAddress: { address: snapshot.recipientEmail } }],
        attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: `termo-${isReturn ? 'devolucao' : 'entrega'}-${String(snapshot.protocol).replace(/[^a-z0-9-]/gi, '_')}.pdf`, contentType: 'application/pdf', contentBytes: pdf.toString('base64') }],
      }, saveToSentItems: true }),
    })
  } catch { throw new MailSendError('A conexão caiu durante o envio. Confira Itens Enviados antes de tentar novamente.', false, true) }
  if (response.status === 202) return
  if (response.status === 401) clearGraphToken()
  const retryHeader = response.headers.get('Retry-After')
  const retryDelay = retryHeader ? (Number.isFinite(Number(retryHeader)) ? Number(retryHeader) : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : 0
  throw new MailSendError(`Microsoft recusou o envio (HTTP ${response.status}).${response.status === 403 ? ' Confira a autorização da caixa remetente no Exchange.' : ''}`, response.status === 401 || response.status === 429 || response.status >= 500, false, Math.max(0, retryDelay || 0))
}
