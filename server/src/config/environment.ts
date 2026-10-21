import { getMicrosoftConfig } from './identity.js'

export function validateEnvironment(): void {
  getMicrosoftConfig()
  for (const key of ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLROOTCERT']) {
    if (!process.env[key] || /SUA_SENHA|SUBSTITUA|<senha>/i.test(process.env[key]!)) {
      throw new Error(`Configure ${key} para a conexão PostgreSQL/RDS.`)
    }
  }
}
