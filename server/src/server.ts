import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { connectDB } from './config/db.js'
import { getPool } from './config/postgres.js'
import authRoutes from './routes/authRoutes.js'
import deliveryRoutes from './routes/deliveryRoutes.js'
import reservationRoutes from './routes/reservationRoutes.js'
import { Reservation } from './models/Reservation.js'
import { validateEnvironment } from './config/environment.js'
import { initializeProtocolCounters } from './services/protocol.js'
import { Delivery } from './models/Delivery.js'
import { ProtocolCounter } from './models/ProtocolCounter.js'
import { getMailConfig, mailEnabled } from './config/mail.js'
import { startDeliveryEmailWorker } from './services/deliveryEmail.js'
import { getGlpiConfig, glpiEnabled } from './config/glpi.js'
import { startReservationGlpiWorker } from './services/reservationGlpi.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middlewares
app.use(cors())
app.use(express.json())

// Rotas da API
app.use('/api/auth', authRoutes)
app.use('/api/deliveries', deliveryRoutes)
app.use('/api/reservations', reservationRoutes)

// Rota de verificação do status da API
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Donato Checklist API',
    timestamp: new Date().toISOString(),
  })
})

// Iniciar servidor e conexão com o PostgreSQL/RDS
async function startServer() {
  validateEnvironment()
  if (mailEnabled()) getMailConfig()
  if (glpiEnabled()) getGlpiConfig()
  await connectDB()
  await Promise.all([Delivery.init(), ProtocolCounter.init(), Reservation.init()])
  await initializeProtocolCounters()
  if (mailEnabled()) {
    await getPool().query('SELECT event_type FROM checklist_donato.delivery_email_jobs LIMIT 0')
    startDeliveryEmailWorker()
  }
  if (glpiEnabled()) {
    await getPool().query('SELECT 1 FROM checklist_donato.reservation_glpi_jobs LIMIT 0')
    startReservationGlpiWorker()
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`)
    console.log(`📍 Endpoints disponíveis:`)
    console.log(`   - Autenticação: Microsoft Entra ID`)
    console.log(`   - GET  http://localhost:${PORT}/api/auth/me`)
    console.log(`   - GET  http://localhost:${PORT}/api/deliveries`)
    console.log(`   - POST http://localhost:${PORT}/api/deliveries`)
    console.log(`   - PUT  http://localhost:${PORT}/api/deliveries/:id/return`)
    console.log(`   - GET  http://localhost:${PORT}/api/health\n`)
  })
}

void startServer().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao iniciar o servidor.')
  process.exit(1)
})
