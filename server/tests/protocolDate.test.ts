import { test } from 'node:test'
import assert from 'node:assert/strict'
import { protocolDate, allocateProtocol, initializeProtocolCounters } from '../src/services/protocol.js'
import { ProtocolCounter } from '../src/models/ProtocolCounter.js'
import { Delivery } from '../src/models/Delivery.js'
import { DeliveryDeletionAudit } from '../src/models/DeliveryDeletionAudit.js'

test('protocolo usa a data da entrega em São Paulo, inclusive na virada do ano UTC', async () => {
  assert.equal(protocolDate(new Date('2026-01-01T02:59:59Z')), '2025-12-31')
  assert.equal(protocolDate(new Date('2026-01-01T03:00:00Z')), '2026-01-01')
  const original = ProtocolCounter.findOneAndUpdate
  ProtocolCounter.findOneAndUpdate = (async (filter: { _id: string }) => {
    assert.equal(filter._id, '2025')
    return { sequence: 42 }
  }) as any
  try { assert.equal(await allocateProtocol(new Date('2026-01-01T02:59:59Z')), 'ENT-2025-12-31-0042') }
  finally { ProtocolCounter.findOneAndUpdate = original }
})

test('inicialização combina protocolos antigos e datados, incluindo os excluídos', async () => {
  const original = { find: Delivery.find, audits: DeliveryDeletionAudit.find, update: ProtocolCounter.updateOne }
  const counters = new Map<string, number>()
  Delivery.find = (() => ({ lean: async () => [{ protocol: 'ENT-2025-0040' }, { protocol: 'ENT-2025-12-30-0042' }] })) as any
  DeliveryDeletionAudit.find = (() => ({ lean: async () => [{ deliverySnapshot: { protocol: 'ENT-2025-12-31-0099' } }] })) as any
  ProtocolCounter.updateOne = (async (filter: any, update: any) => { counters.set(filter._id, update.$max.sequence) }) as any
  try { await initializeProtocolCounters(); assert.equal(counters.get('2025'), 99) }
  finally { Delivery.find = original.find; DeliveryDeletionAudit.find = original.audits; ProtocolCounter.updateOne = original.update }
})
