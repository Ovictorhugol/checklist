import dotenv from 'dotenv'
import { connectDB } from '../config/db.js'
import { closeDB } from '../config/postgres.js'
import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'
import { validateEnvironment } from '../config/environment.js'
import { isMicrosoftAuth } from '../config/identity.js'

dotenv.config()

async function main(): Promise<void> {
  if (isMicrosoftAuth()) throw new Error('Administradores e senhas são gerenciados no Entra ID neste modo.')
  const mode = process.argv[2]
  if (mode !== '--check' && mode !== '--reset') throw new Error('Use --check ou --reset.')
  validateEnvironment()
  await connectDB()
  const user = await User.findOne({ email: process.env.ADMIN_EMAIL!.trim().toLowerCase() })
  if (!user) throw new Error('A conta configurada não existe neste banco. Reinicie o backend para criar o administrador.')
  if (user.role !== 'admin') throw new Error('A conta configurada não é administradora. Reinicie o backend para aplicar a configuração.')
  const matches = await bcrypt.compare(process.env.ADMIN_PASSWORD!, user.passwordHash)
  if (mode === '--check') {
    console.log(matches ? 'Administrador encontrado. A senha do .env corresponde à senha do banco.' : 'Administrador encontrado. A senha do .env é diferente da senha do banco.')
    return
  }
  if (!matches) {
    user.passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD!, 10)
    await user.save()
  }
  console.log('A conta administradora agora aceita a senha configurada no .env.')
}

void main().catch(() => {
  // Erros do driver podem incluir detalhes da conexão; mantenha credenciais fora do terminal.
  console.error('Não foi possível verificar ou redefinir a conta administradora. Confira a configuração, a existência da conta e o acesso ao PostgreSQL.')
  process.exitCode = 1
}).finally(async () => { await closeDB() })
