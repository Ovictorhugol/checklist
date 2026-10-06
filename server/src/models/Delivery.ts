import { Schema, model } from 'mongoose'
import { isValidCpf, normalizeCpf } from '../domain/cpf.js'

export interface IDeliveryPart {
  id: string
  label: string
  status: 'ok' | 'damaged'
  note: string
}

export interface IReturnInspectionPart {
  id: string
  label: string
  deliveredStatus: 'ok' | 'damaged'
  returnedStatus: 'ok' | 'damaged'
  note: string
}

export interface IReturnInspection {
  returnedAt: string
  inspectedBy?: string
  parts: IReturnInspectionPart[]
}

export type DeliveryStatus = 'entregue' | 'devolvido'

export interface IDelivery {
  protocol: string
  assetTag: string
  serialNumber: string
  recipient: string
  recipientEmail?: string
  recipientCpf?: string
  recipientDepartment?: string
  equipment: string
  model: string
  brand: string
  accessories?: string
  status: DeliveryStatus
  isReturned: boolean
  returnedAt?: string
  deliveredAt: string
  deliveredBy?: string
  parts: IDeliveryPart[]
  returnInspection?: IReturnInspection
  createdAt: Date
  updatedAt: Date
}

const deliveryPartSchema = new Schema<IDeliveryPart>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    status: { type: String, enum: ['ok', 'damaged'], required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
)

const returnInspectionPartSchema = new Schema<IReturnInspectionPart>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    deliveredStatus: { type: String, enum: ['ok', 'damaged'], required: true },
    returnedStatus: { type: String, enum: ['ok', 'damaged'], required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
)

const returnInspectionSchema = new Schema<IReturnInspection>(
  {
    returnedAt: { type: String, required: true },
    inspectedBy: { type: String },
    parts: { type: [returnInspectionPartSchema], default: [] },
  },
  { _id: false }
)

const deliverySchema = new Schema<IDelivery>(
  {
    protocol: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    assetTag: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    serialNumber: {
      type: String,
      required: true,
      trim: true,
    },
    recipient: {
      type: String,
      required: true,
      trim: true,
    },
    recipientEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    recipientCpf: {
      type: String,
      // Optional for old records. New deliveries require CPF in the API.
      set: (value: unknown) => typeof value === 'string' ? normalizeCpf(value) : value,
      validate: {
        validator: (value: unknown) => value == null || isValidCpf(value),
        message: 'Informe um CPF válido para o responsável.',
      },
    },
    recipientDepartment: {
      type: String,
      required: true,
      trim: true,
    },
    equipment: {
      type: String,
      required: true,
      trim: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    accessories: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['entregue', 'devolvido'],
      default: 'entregue',
      index: true,
    },
    isReturned: {
      type: Boolean,
      default: false,
      index: true,
    },
    returnedAt: {
      type: String,
      index: true,
    },
    deliveredAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
    deliveredBy: {
      type: String,
      trim: true,
    },
    parts: {
      type: [deliveryPartSchema],
      default: [],
    },
    returnInspection: {
      type: returnInspectionSchema,
      required: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString()
        ret.isReturned = ret.isReturned ?? !!ret.returnInspection
        ret.status = ret.status ?? (ret.returnInspection ? 'devolvido' : 'entregue')
        if (ret.returnInspection && !ret.returnedAt) {
          ret.returnedAt = ret.returnInspection.returnedAt
        }
        delete ret._id
        delete ret.__v
        return ret
      },
    },
  }
)

export const Delivery = model<IDelivery>('Delivery', deliverySchema)
