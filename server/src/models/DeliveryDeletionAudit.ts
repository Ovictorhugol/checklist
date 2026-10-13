import { createPostgresModel } from './postgresModel.js'
import { auditConfig } from './modelConfigs.js'

export const DeliveryDeletionAudit = createPostgresModel(auditConfig)
