import { createPostgresModel } from './postgresModel.js'
import { userConfig } from './modelConfigs.js'

export const User = createPostgresModel(userConfig)
