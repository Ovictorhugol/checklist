import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatCpf, isValidCpf, normalizeCpf } from '../src/domain/validation/cpf.js'
import { Delivery } from '../src/models/Delivery.js'
import { createDelivery } from '../src/controllers/deliveryController.js'

const validCpf = '52998224725'
const deliveryData = {
  protocol: 'ENT-2026-0001', assetTag: 'A', serialNumber: 'S', recipient: 'Responsável',
  recipientEmail: 'recipient@example.com', recipientDepartment: 'TI', equipment: 'Notebook',
  model: 'M', brand: 'B', deliveredAt: '2026-10-05T12:00:00Z',
  parts: ['display', 'keyboard', 'touchpad', 'case', 'ports'].map((id) => ({ id, label: id, status: 'ok', note: '' })),
}

test('CPF valida os dois dígitos verificadores e rejeita valores incompletos, repetidos ou malformados', () => {
  for (const value of [validCpf, '529.982.247-25', ' 529.982.247-25 ']) assert.equal(isValidCpf(value), true)
  for (const value of ['', undefined, null, 52998224725, '00000000000', '11111111111', '529982247', '52998224724', '52998224715', '529982247250', 'abc52998224725']) {
    assert.equal(isValidCpf(value), false, String(value))
  }
  assert.equal(normalizeCpf('529.982.247-25'), validCpf)
  assert.equal(formatCpf(validCpf), '529.982.247-25')
  assert.equal(formatCpf('529.982.247-25'), '529.982.247-25')
  assert.equal(formatCpf('529982'), '529.982')
})

test('PostgreSQL preserva registros antigos sem CPF, normaliza novos valores e recusa CPF inválido', async () => {
  const legacy = new Delivery(deliveryData)
  await legacy.validate()
  assert.equal(legacy.recipientCpf, undefined)
  const current = new Delivery({ ...deliveryData, recipientCpf: '529.982.247-25' })
  await current.validate()
  assert.equal(current.recipientCpf, validCpf)
  assert.equal(current.toJSON().recipientCpf, validCpf)
  await assert.rejects(new Delivery({ ...deliveryData, recipientCpf: '52998224724' }).validate(), /CPF/)
})

test('API exige CPF válido em novas entregas antes de reservar protocolo ou gravar no banco', async () => {
  const original = Delivery.create
  let writes = 0
  Delivery.create = (async () => { writes++; throw new Error('Não deveria gravar') }) as any
  try {
    for (const recipientCpf of [undefined, '', '00000000000', '52998224724', 52998224725]) {
      const res = { code: 200, data: null as any, status(code: number) { this.code = code; return this }, json(data: any) { this.data = data; return this } }
      await createDelivery({ body: { ...deliveryData, recipientCpf }, user: { email: 'admin@example.com', role: 'admin' } } as any, res as any)
      assert.equal(res.code, 400)
      assert.match(res.data.error, /CPF/)
    }
    assert.equal(writes, 0)
  } finally {
    Delivery.create = original
  }
})
