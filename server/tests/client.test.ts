import { test, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
let tokenError: Error | undefined
await mock.module('../../src/services/microsoftAuth.ts', { namedExports: { getMicrosoftAccessToken: async () => {
  if (tokenError) throw tokenError
  return 'microsoft-access-token'
} } })
const { apiCreateDelivery, apiSaveReturnInspection, apiGetDeliveries } = await import('../../src/services/api.js')

const originalFetch = globalThis.fetch
const session = new Map<string, string>()
let expired = false
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value), removeItem: (key: string) => session.delete(key) } })
Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => { expired = true } } })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => { throw new Error('Local fallback forbidden') }, setItem: () => { throw new Error('Local fallback forbidden') } } })
afterEach(() => { globalThis.fetch = originalFetch; session.clear(); expired = false; tokenError = undefined })

test('rejeições e falhas de rede não viram gravações locais bem sucedidas', async () => {
  for (const status of [400, 401, 403, 409, 500]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Rejected' }), { status })
    await assert.rejects(apiCreateDelivery({} as any), /Rejected/)
    await assert.rejects(apiSaveReturnInspection('id', {} as any), /Rejected/)
  }
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(apiCreateDelivery({} as any), /Nenhuma gravação foi confirmada/)
})

test('401 sinaliza sessão Microsoft expirada', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Expired' }), { status: 401 })
  await assert.rejects(apiGetDeliveries(), /Expired/)
  assert.equal(expired, true)
})

test('cliente só resolve cadastro quando chega a resposta confirmada', async () => {
  let finish!: (value: Response) => void
  globalThis.fetch = () => new Promise<Response>((resolve) => { finish = resolve })
  let complete = false
  const operation = apiCreateDelivery({} as any).then((record) => { complete = true; return record })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(complete, false)
  finish(new Response(JSON.stringify({ id: 'confirmed', protocol: 'ENT-2026-0042' }), { status: 201 }))
  assert.equal((await operation).id, 'confirmed')
  assert.equal(complete, true)
})

test('cliente envia o token Microsoft e bloqueia requisições quando a sessão não pode ser renovada', async () => {
  let requests = 0
  globalThis.fetch = async (_input, init) => {
    requests++
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer microsoft-access-token')
    return new Response('[]')
  }
  await apiGetDeliveries()
  assert.equal(requests, 1)
  tokenError = new Error('Renove sua sessão Microsoft')
  await assert.rejects(apiGetDeliveries(), /Renove sua sessão/)
  assert.equal(requests, 1)
  assert.equal(expired, true)
})
