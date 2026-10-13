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

import { createPostgresModel } from './postgresModel.js'
import { deliveryConfig } from './modelConfigs.js'

export const Delivery = createPostgresModel(deliveryConfig)
