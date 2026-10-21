import { getGlpiConfig } from '../../config/glpi.js'

export class GlpiError extends Error {
  constructor(message: string, public readonly retryable = false, public readonly uncertain = false, public readonly retryAfterSeconds = 0) { super(message) }
}
type ReservationSnapshot = { id: string; equipment: string; requester_name: string; requester_email: string; department: string; purpose: string; start_date: string; end_date: string }
type GlpiTicket = { id: number; url: string }
const formatDate = (value: string) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')
const marker = (id: string) => `[Reserva ${id}]`
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

async function withGlpiSession<T>(action: (call: (path: string, method?: string, input?: unknown, creatingTicket?: boolean) => Promise<any>, config: ReturnType<typeof getGlpiConfig>) => Promise<T>, request: typeof fetch = fetch): Promise<T> {
  const config = getGlpiConfig()
  let session: string | undefined
  const call = async (path: string, method = 'GET', input?: unknown, creatingTicket = false): Promise<any> => {
    let response: Response
    try {
      response = await request(`${config.apiUrl}/${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'App-Token': config.appToken, ...(session ? { 'Session-Token': session } : { Authorization: `user_token ${config.userToken}` }) },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      })
    } catch { throw new GlpiError(creatingTicket ? 'A conexão foi interrompida ao abrir o chamado. Verifique o GLPI antes de tentar novamente.' : 'Não foi possível conectar à API do GLPI.', !creatingTicket, creatingTicket) }
    if (!response.ok) {
      const uncertain = creatingTicket && response.status >= 500
      const retryHeader = response.headers.get('Retry-After')
      const delay = retryHeader ? (Number.isFinite(Number(retryHeader)) ? Number(retryHeader) : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : 0
      throw new GlpiError(`GLPI recusou a operação (HTTP ${response.status}).${response.status === 401 || response.status === 403 ? ' Verifique os tokens e as permissões do usuário da integração.' : ''}`, !uncertain && (response.status === 429 || response.status >= 500), uncertain, Math.max(0, delay || 0))
    }
    try { return await response.json() }
    catch { throw new GlpiError('A API do GLPI retornou uma resposta inválida.', !creatingTicket, creatingTicket) }
  }
  const data = await call('initSession')
  if (typeof data?.session_token !== 'string' || !data.session_token) throw new GlpiError('A API do GLPI não confirmou a autenticação.')
  session = data.session_token
  try {
    if (config.entityId !== undefined) await call('changeActiveEntities', 'POST', { entities_id: config.entityId, is_recursive: false })
    return await action(call, config)
  } finally { await call('killSession').catch(() => undefined) }
}

async function categoryAndEntity(call: Parameters<Parameters<typeof withGlpiSession>[0]>[0], config: ReturnType<typeof getGlpiConfig>) {
  const active = await call('getActiveEntities')
  const entityId = config.entityId ?? Number(typeof active?.active_entity === 'object' ? active.active_entity?.id : active?.active_entity)
  if (!Number.isSafeInteger(entityId) || entityId < 0) throw new GlpiError('Não foi possível identificar a entidade ativa. Configure GLPI_ENTITY_ID.')
  const data = config.categoryId ? [await call(`ITILCategory/${config.categoryId}`)] : await call(`ITILCategory?${new URLSearchParams({ 'searchText[name]': config.categoryName, range: '0-999' })}`)
  if (!Array.isArray(data)) throw new GlpiError('Não foi possível consultar a categoria do GLPI.')
  const categories = data.filter(category => typeof category.name === 'string' && category.name.trim().toLocaleLowerCase('pt-BR') === config.categoryName.toLocaleLowerCase('pt-BR') && (Number(category.entities_id) === entityId || Number(category.is_recursive) === 1))
  if (categories.length !== 1 || !Number.isSafeInteger(Number(categories[0].id)) || Number(categories[0].id) <= 0) throw new GlpiError('Categoria Hardware ausente ou ambígua na entidade ativa. Confira GLPI_CATEGORY_ID e GLPI_ENTITY_ID.')
  if (Number(categories[0].is_request) === 0) throw new GlpiError('A categoria Hardware precisa permitir chamados do tipo Requisição.')
  return { categoryId: Number(categories[0].id), entityId }
}

export async function checkGlpiConnection(request: typeof fetch = fetch) {
  return withGlpiSession(async (call, config) => {
    const result = await categoryAndEntity(call, config)
    // Also verify the read permission needed to reconcile ambiguous POSTs.
    for (const field of ['name', 'content']) {
      await call(`Ticket?${new URLSearchParams({ [`searchText[${field}]`]: '[Reserva VERIFICACAO-SEM-CRIACAO]', range: '0-0' })}`)
    }
    return { apiUrl: config.apiUrl, categoryName: config.categoryName, ...result }
  }, request)
}

export async function createReservationTicket(snapshot: ReservationSnapshot, request: typeof fetch = fetch): Promise<GlpiTicket> {
  const equipment = snapshot.equipment.trim().split(/\s+/)[0]
  if (!/^[a-f0-9]{24}$/i.test(snapshot.id)) throw new GlpiError('Identificador de reserva inválido para integração.')
  return withGlpiSession(async (call, config) => {
    const { categoryId, entityId } = await categoryAndEntity(call, config)
    // Stable identifier + reconciliation before every POST, including manual retries.
    const matchesById = new Map<number, { id: number; name?: string; content?: string }>()
    for (const field of ['name', 'content']) {
      const existing = await call(`Ticket?${new URLSearchParams({ [`searchText[${field}]`]: marker(snapshot.id), range: '0-99' })}`)
      if (!Array.isArray(existing)) throw new GlpiError('Não foi possível conferir chamados existentes.')
      for (const ticket of existing) {
        if ((typeof ticket.name === 'string' && ticket.name.startsWith(`${marker(snapshot.id)} `)) ||
            (typeof ticket.content === 'string' && ticket.content.includes(marker(snapshot.id)))) {
          const id = Number(ticket.id)
          if (!Number.isSafeInteger(id) || id <= 0) throw new GlpiError('Identificador de chamado inválido retornado pelo GLPI.')
          matchesById.set(id, ticket)
        }
      }
    }
    const matches = [...matchesById.values()]
    if (matches.length > 1) throw new GlpiError('Mais de um chamado foi encontrado para esta reserva. Verifique os chamados no GLPI.', false, true)
    const ticketUrl = (id: number) => `${config.baseUrl}/front/ticket.form.php?id=${id}`
    if (matches.length === 1) {
      const id = Number(matches[0].id)
      if (!Number.isSafeInteger(id) || id <= 0) throw new GlpiError('Identificador de chamado inválido retornado pelo GLPI.')
      return { id, url: ticketUrl(id) }
    }
    const text = [`Reserva de equipamento criada no Donato Checklist.`, `Referência: ${marker(snapshot.id)}`, `Solicitante: ${snapshot.requester_name}`, `E-mail: ${snapshot.requester_email}`, `Setor: ${snapshot.department}`, `Equipamento: ${equipment}`, `Período de uso: ${formatDate(snapshot.start_date)} a ${formatDate(snapshot.end_date)}`, `Finalidade: ${snapshot.purpose}`, 'Situação inicial: aguardando análise da reserva.'].map(line => `<p>${escape(line).replace(/\r?\n/g, '<br>')}</p>`).join('')
    const result = await call('Ticket', 'POST', { input: {
      name: `Nova Reserva de Equipamento realizada por ${snapshot.requester_name.trim()}`.slice(0, 250), content: text,
      type: 2, status: 1, urgency: 3, impact: 3, itilcategories_id: categoryId, entities_id: entityId,
      _users_id_requester: 0, _users_id_requester_notif: { use_notification: 1, alternative_email: snapshot.requester_email },
      ...(config.groupId ? { _groups_id_assign: config.groupId } : {}),
    } }, true)
    const id = Number(result?.id)
    if (!Number.isSafeInteger(id) || id <= 0) throw new GlpiError('O GLPI não confirmou o número do chamado. Verifique antes de tentar novamente.', false, true)
    return { id, url: ticketUrl(id) }
  }, request)
}
