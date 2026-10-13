import { Delivery } from '../models/Delivery.js'
import { DeliveryDeletionAudit } from '../models/DeliveryDeletionAudit.js'
import { ProtocolCounter } from '../models/ProtocolCounter.js'

// Inclui registros antigos e arquivados para não reutilizar protocolos excluídos.
export async function initializeProtocolCounters(): Promise<void> {
  const [deliveries, audits] = await Promise.all([
    Delivery.find().lean(),
    DeliveryDeletionAudit.find().lean(),
  ])
  const maxima = new Map<string, number>()
  for (const record of [...deliveries, ...audits]) {
    const snapshot = 'deliverySnapshot' in record ? record.deliverySnapshot : undefined
    const protocol = snapshot?.protocol ?? record.protocol
    const match = typeof protocol === 'string' ? /^ENT-(\d{4})-(\d+)$/.exec(protocol) : null
    if (match) maxima.set(match[1], Math.max(maxima.get(match[1]) ?? 0, Number(match[2])))
  }
  maxima.set(String(new Date().getFullYear()), maxima.get(String(new Date().getFullYear())) ?? 0)
  for (const [year, sequence] of maxima) {
    await ProtocolCounter.updateOne({ _id: year }, { $max: { sequence } }, { upsert: true })
  }
}

export async function allocateProtocol(): Promise<string> {
  const year = new Date().getFullYear()
  // O UPSERT PostgreSQL incrementa o contador numa única operação atômica.
  const counter = await ProtocolCounter.findOneAndUpdate(
    { _id: String(year) }, { $inc: { sequence: 1 } }, { upsert: true, new: true }
  )
  if (!counter) throw new Error('Não foi possível reservar o protocolo.')
  return `ENT-${year}-${String(counter!.sequence).padStart(4, '0')}`
}

export async function peekProtocol(): Promise<string> {
  const year = new Date().getFullYear()
  const counter = await ProtocolCounter.findById(String(year)).lean()
  return `ENT-${year}-${String((counter?.sequence ?? 0) + 1).padStart(4, '0')}`
}
