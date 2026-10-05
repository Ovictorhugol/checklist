import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { connectDB } from './config/db.js'
import { ensureAdminUser } from './config/seedAdmin.js'
import authRoutes from './routes/authRoutes.js'
import deliveryRoutes from './routes/deliveryRoutes.js'
import { validateEnvironment } from './config/environment.js'
import { initializeProtocolCounters } from './services/protocol.js'
import { Delivery } from './models/Delivery.js'
import { User } from './models/User.js'
import { ProtocolCounter } from './models/ProtocolCounter.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middlewares
app.use(cors())
app.use(express.json())

// Rotas da API
app.use('/api/auth', authRoutes)
app.use('/api/deliveries', deliveryRoutes)

// Rota de verificação do status da API
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Donato Checklist API',
    timestamp: new Date().toISOString(),
  })
})

// Iniciar servidor e conexão com o MongoDB
async function startServer() {
  validateEnvironment()
  await connectDB()
  await Promise.all([Delivery.init(), User.init(), ProtocolCounter.init()])
  await ensureAdminUser()
  await initializeProtocolCounters()

  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`)
    console.log(`📍 Endpoints disponíveis:`)
    console.log(`   - POST http://localhost:${PORT}/api/auth/register`)
    console.log(`   - POST http://localhost:${PORT}/api/auth/login`)
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
