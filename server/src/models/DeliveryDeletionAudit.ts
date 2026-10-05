import { Schema, model } from 'mongoose'

export interface IDeliveryDeletionAudit {
  deliveryId: string
  deliverySnapshot?: Record<string, unknown>
  protocol?: string
  assetTag?: string
  recipient?: string
  deletedByUserId: string
  deletedByEmail: string
  deletedAt: Date
}

const deliveryDeletionAuditSchema = new Schema<IDeliveryDeletionAudit>(
  {
    deliveryId: { type: String, required: true, index: true },
    deliverySnapshot: { type: Schema.Types.Mixed, required: true },
    deletedByUserId: { type: String, required: true, index: true },
    deletedByEmail: { type: String, required: true, trim: true, lowercase: true },
    deletedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { versionKey: false, collection: 'delivery_deletion_audits' }
)

export const DeliveryDeletionAudit = model<IDeliveryDeletionAudit>(
  'DeliveryDeletionAudit',
  deliveryDeletionAuditSchema
)