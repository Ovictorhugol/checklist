import { getMicrosoftConfig, isMicrosoftAuth } from './identity.js'

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32 || /SUBSTITUA|secret$/i.test(secret)) {
    throw new Error('Configure JWT_SECRET com um segredo aleatório de pelo menos 32 caracteres.')
  }
  return secret
}

export function validateEnvironment(): void {
  const microsoft = isMicrosoftAuth()
  if (microsoft) getMicrosoftConfig()
  else getJwtSecret()
  if (!process.env.MONGO_URI || /SUA_SENHA|<usuario>|<senha>/i.test(process.env.MONGO_URI)) {
    throw new Error('Configure MONGO_URI com uma conexão válida.')
  }
  if (microsoft) return
  if (!process.env.ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL.trim())) {
    throw new Error('Configure ADMIN_EMAIL com um e-mail válido.')
  }
  const password = process.env.ADMIN_PASSWORD
  if (!password || password.length < 12 || /SUBSTITUA|^admin12345$/i.test(password)) {
    throw new Error('Configure ADMIN_PASSWORD com uma senha própria de pelo menos 12 caracteres.')
  }
}
