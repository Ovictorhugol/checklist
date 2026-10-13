import { Delivery } from '../models/Delivery.js'
import { deliveryConfig } from '../models/modelConfigs.js'
import { equipmentPossessionError } from './equipmentPossession.js'

export class DeliveryRestoreError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

export function isRestorableSnapshot(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, any>
  return ['protocol', 'assetTag', 'serialNumber', 'recipient', 'recipientEmail', 'recipientDepartment', 'equipment', 'model', 'brand', 'deliveredAt', 'createdAt', 'updatedAt']
    .every(key => typeof data[key] === 'string' && !!data[key].trim()) && Array.isArray(data.parts)
}

export async function restoreArchivedDelivery(auditId: string, actor: { id: string; email: string }) {
  const session = await Delivery.startSession()
  try {
    return await session.withTransaction(async () => {
      const client = session.client
      const audit = (await client.query('SELECT * FROM checklist_donato.delivery_deletion_audits WHERE id = $1 FOR UPDATE', [auditId])).rows[0]
      if (!audit) throw new DeliveryRestoreError(404, 'Registro de exclusão não encontrado.')
      if (audit.restored_at) throw new DeliveryRestoreError(409, 'Esta exclusão já foi recuperada.')
      if (!isRestorableSnapshot(audit.delivery_snapshot)) throw new DeliveryRestoreError(409, 'Este registro antigo não possui os dados completos necessários para recuperação.')
      const latest = (await client.query('SELECT id FROM checklist_donato.delivery_deletion_audits WHERE delivery_id = $1 ORDER BY deleted_at DESC, id DESC LIMIT 1', [audit.delivery_id])).rows[0]
      if (latest.id !== auditId) throw new DeliveryRestoreError(409, 'Recupere o registro de exclusão mais recente desta entrega.')
      const snapshot = audit.delivery_snapshot
      if (snapshot.reservationId) {
        const reservation = (await client.query('SELECT delivery_id, delivery_protocol FROM checklist_donato.reservations WHERE id = $1 FOR UPDATE', [snapshot.reservationId])).rows[0]
        if (!reservation || reservation.delivery_id !== audit.delivery_id || reservation.delivery_protocol !== snapshot.protocol) {
          throw new DeliveryRestoreError(409, 'A reserva vinculada mudou. Não foi possível recuperar a entrega com segurança.')
        }
      }
      const data = { ...snapshot, _id: audit.delivery_id }
      const entries = Object.entries(deliveryConfig.columns).filter(([key]) => data[key] !== undefined)
      // Restore the trusted archived values directly, preserving original dates,
      // signature hashes, protocol and ID; validation for new deliveries differs.
      const values = entries.map(([key]) => deliveryConfig.json?.includes(key) && data[key] != null ? JSON.stringify(data[key]) : data[key])
      await client.query(`INSERT INTO checklist_donato.deliveries (${entries.map(([,col]) => `"${col}"`).join(',')}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(',')})`, values)
      await client.query('UPDATE checklist_donato.delivery_deletion_audits SET restored_at = now(), restored_by_user_id = $2, restored_by_email = $3 WHERE id = $1', [auditId, actor.id, actor.email])
      const delivery = await Delivery.findById(audit.delivery_id).session(session)
      if (!delivery) throw new Error('A recuperação não foi confirmada.')
      return delivery
    })
  } catch (error) {
    const possessionError = equipmentPossessionError(error)
    if (possessionError) throw new DeliveryRestoreError(409, possessionError)
    if ((error as { code?: string }).code === '23505') throw new DeliveryRestoreError(409, 'A entrega, o protocolo ou a reserva já estão em uso. Atualize o histórico.')
    throw error
  } finally { await session.endSession() }
}
