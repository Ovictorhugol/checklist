import { createPostgresModel } from './postgresModel.js'
import { reservationConfig } from './modelConfigs.js'

export const Reservation = createPostgresModel(reservationConfig)
