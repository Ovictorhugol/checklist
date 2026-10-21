import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDeliveryDamageCount, type DeliveryRecord } from '../../src/features/deliveries/types/deliveryTypes.js'

const delivery: DeliveryRecord = {
  id: 'delivery-1', protocol: 'ENT-2026-0001', assetTag: 'A', serialNumber: 'S',
  recipient: 'Pessoa', equipment: 'Notebook', deliveredAt: '2026-10-02T16:11:00Z',
  parts: [
    { id: 'display', label: 'Tela', status: 'ok', note: '' },
    { id: 'keyboard', label: 'Teclado', status: 'ok', note: '' },
  ],
}

test('resumo considera danos na devolução mesmo quando a entrega foi sem danos', () => {
  const returned: DeliveryRecord = {
    ...delivery, status: 'devolvido', isReturned: true,
    returnInspection: {
      returnedAt: '2026-10-02T16:12:00Z',
      parts: delivery.parts.map((part) => ({
        ...part, deliveredStatus: part.status,
        returnedStatus: part.id === 'display' ? 'damaged' : 'ok',
      })),
    },
  }
  assert.equal(getDeliveryDamageCount(returned), 1)
  assert.equal(getDeliveryDamageCount({ ...returned, status: undefined, isReturned: undefined }), 1)
  assert.equal(getDeliveryDamageCount({
    ...returned,
    returnInspection: {
      ...returned.returnInspection!,
      parts: returned.returnInspection!.parts.map((part) => ({ ...part, returnedStatus: 'damaged' })),
    },
  }), 2)
})

test('sem inspeção de devolução usa a entrega; com inspeção usa a condição devolvida', () => {
  assert.equal(getDeliveryDamageCount(delivery), 0)
  const damaged: DeliveryRecord = {
    ...delivery, parts: delivery.parts.map((part) => ({ ...part, status: 'damaged' })),
  }
  assert.equal(getDeliveryDamageCount(damaged), 2)
  assert.equal(getDeliveryDamageCount({ ...damaged, status: 'devolvido' }), 2)
  assert.equal(getDeliveryDamageCount({
    ...damaged,
    returnInspection: {
      returnedAt: '2026-10-02T16:12:00Z',
      parts: damaged.parts.map((part) => ({ ...part, deliveredStatus: part.status, returnedStatus: 'ok' })),
    },
  }), 0)
})
