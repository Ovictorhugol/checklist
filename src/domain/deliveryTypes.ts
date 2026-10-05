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
  parts: ReturnInspectionPart[]
}

export type DeliveryStatus = 'entregue' | 'devolvido'

export type DeliveryRecord = {
  id: string
  protocol: string
  assetTag: string
  serialNumber: string
  recipient: string
  recipientEmail?: string
  recipientDepartment?: string
  equipment: string
  model?: string
  brand?: string
  status?: DeliveryStatus
  isReturned?: boolean
  returnedAt?: string
  deliveredAt: string
  parts: DeliveryPartRecord[]
  returnInspection?: ReturnInspectionRecord
  deliveredBy?: string
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

export type NewDelivery = Omit<DeliveryRecord, 'id' | 'protocol' | 'deliveredAt' | 'model' | 'brand'> & {
  model: string
  brand: string
  recipientEmail: string
  recipientDepartment: string
}

export function isDeliveryReturned(delivery: DeliveryRecord): boolean {
  return delivery.status === 'devolvido' || delivery.isReturned === true || !!delivery.returnInspection
}