import type { SignatureInput, SignatureRecord } from './signature'
export type DeliveryPartRecord = {
  id: string
  label: string
  status: 'ok' | 'damaged'
  note: string
}

export type ReturnInspectionPart = {
  id: string
  label: string
  deliveredStatus: 'ok' | 'damaged'
  returnedStatus: 'ok' | 'damaged'
  note: string
}

export type ReturnInspectionRecord = {
  returnedAt: string
  inspectedBy?: string
  signature?: SignatureRecord
  parts: ReturnInspectionPart[]
}

export type ReturnInspectionInput = Omit<ReturnInspectionRecord, 'signature'> & { signature: SignatureInput }

export type DeliveryStatus = 'entregue' | 'devolvido'

export type DeliveryRecord = {
  id: string
  protocol: string
  reservationId?: string
  assetTag: string
  serialNumber: string
  recipient: string
  recipientEmail?: string
  recipientCpf?: string
  recipientDepartment?: string
  equipment: string
  model?: string
  brand?: string
  accessories?: string
  status?: DeliveryStatus
  isReturned?: boolean
  returnedAt?: string
  deliveredAt: string
  parts: DeliveryPartRecord[]
  returnInspection?: ReturnInspectionRecord
  deliveredBy?: string
  signature?: SignatureRecord
  createdAt?: string
  updatedAt?: string
}

export type DeletedDeliveryAudit = {
  id: string
  deliveryId: string
  deliverySnapshot: DeliveryRecord
  deletedByUserId: string
  deletedByEmail: string
  deletedAt: string
}

export type NewDelivery = Omit<DeliveryRecord, 'id' | 'protocol' | 'deliveredAt' | 'model' | 'brand' | 'signature'> & {
  signature: SignatureInput
  model: string
  brand: string
  recipientEmail: string
  recipientCpf: string
  recipientDepartment: string
}

export function isDeliveryReturned(delivery: DeliveryRecord): boolean {
  return delivery.status === 'devolvido' || delivery.isReturned === true || !!delivery.returnInspection
}

export function getDeliveryDamageCount(delivery: DeliveryRecord): number {
  if (delivery.returnInspection) {
    return delivery.returnInspection.parts.filter((part) => part.returnedStatus === 'damaged').length
  }
  return delivery.parts.filter((part) => part.status === 'damaged').length
}
