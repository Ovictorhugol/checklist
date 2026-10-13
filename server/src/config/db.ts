import { getPool } from './postgres.js'

export async function connectDB(): Promise<void> {
  try {
    await getPool().query('SELECT 1')
    console.log('PostgreSQL conectado: ' + process.env.PGHOST + ' / ' + process.env.PGDATABASE)
  } catch {
    throw new Error('Falha ao conectar no PostgreSQL. Verifique credenciais, certificado CA e acesso ao RDS.')
  }
}
