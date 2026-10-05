import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'

export async function ensureAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD!
  const adminName = process.env.ADMIN_NAME || 'Administrador Donato'

  const existingAdmin = await User.findOne({ email: adminEmail.toLowerCase() })

  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(adminPassword, salt)

    await User.create({
      email: adminEmail.toLowerCase(),
      passwordHash,
      name: adminName,
      role: 'admin',
    })

    console.log(`👑 Usuário Administrador criado no MongoDB: ${adminEmail}`)
  } else if (existingAdmin.role !== 'admin') {
    existingAdmin.role = 'admin'
    await existingAdmin.save()
    console.log(`👑 Usuário ${adminEmail} atualizado para privilégio ADMIN no MongoDB.`)
  }
}
