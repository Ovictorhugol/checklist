import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import deliveryRoutes from '../src/routes/deliveryRoutes.js'
import { Delivery } from '../src/models/Delivery.js'

test('operador consulta somente entregas destinadas ao seu e-mail e não acessa registros alheios nem altera dados', async () => {
  const originalEnv = { ...process.env }
  const originalFind = Delivery.find
  const originalFindById = Delivery.findById
  const secret = 'personal-deliveries-test-secret-longer-than-32-characters'
  Object.assign(process.env, { AUTH_PROVIDER: 'local', JWT_SECRET: secret })
  const records = [
    { id: 'own', recipientEmail: 'operator@example.com', deliveredBy: 'admin@example.com' },
    { id: 'other', recipientEmail: 'other@example.com', deliveredBy: 'operator@example.com' },
    { id: 'legacy', deliveredBy: 'operator@example.com' },
  ]
  const filters: Record<string, unknown>[] = []
  Delivery.find = ((filter: Record<string, unknown>) => {
    filters.push(filter)
    return { sort: async () => records
      .filter((item) => !filter.recipientEmail || item.recipientEmail === filter.recipientEmail)
      .map((item) => ({ toJSON: () => item })) }
  }) as any
  Delivery.findById = (async (id: string) => {
    const record = records.find((item) => item.id === id)
    return record ? { ...record, toJSON: () => record } : null
  }) as any
  const app = express()
  app.use(express.json())
  app.use('/api/deliveries', deliveryRoutes)
  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/deliveries`
    const token = (role: string) => jwt.sign({ id: 'user-id', email: ' Operator@Example.com ', role }, secret, { expiresIn: '5m' })
    const request = (path: string, role = 'operator', method = 'GET') => fetch(base + path, {
      method, headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' },
      body: method === 'POST' || method === 'PUT' ? '{}' : undefined,
    })
    for (const path of ['', '/mine', '?recipientEmail=other@example.com', '/mine?email=other@example.com&status=devolvido']) {
      const response = await request(path)
      assert.equal(response.status, 200)
      assert.deepEqual((await response.json()).map((item: { id: string }) => item.id), ['own'])
      assert.equal(filters.at(-1)!.recipientEmail, 'operator@example.com')
    }
    assert.ok(filters.at(-1)!.$or, 'filtro por situação preservado junto ao filtro por destinatário')
    assert.equal((await request('/own')).status, 200)
    for (const id of ['other', 'legacy', 'missing']) assert.equal((await request('/' + id)).status, 404)
    for (const [method, path] of [['POST', ''], ['PUT', '/own/return'], ['DELETE', '/own'], ['GET', '/deleted'], ['GET', '/next-protocol']]) {
      assert.equal((await request(path, 'operator', method)).status, 403)
    }
    const all = await request('', 'admin')
    assert.equal(all.status, 200)
    assert.equal((await all.json()).length, 3)
    assert.equal((await request('/other', 'admin')).status, 200)
    assert.equal((await fetch(base + '/mine')).status, 401)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    Delivery.find = originalFind
    Delivery.findById = originalFindById
    process.env = originalEnv
  }
})
