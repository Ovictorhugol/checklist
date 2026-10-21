import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { getPool, closeDB, serverRoot } from '../config/postgres.js'

dotenv.config({ path: resolve(serverRoot, '.env'), quiet: true })

async function main(): Promise<void> {
  const pool = getPool()
  const connection = (await pool.query(`SELECT current_database() AS database,
    ssl, version AS tls FROM pg_stat_ssl WHERE pid = pg_backend_pid()`)).rows[0]
  if (!connection?.ssl) throw new Error('A conexão precisa usar TLS.')
  if (connection.database !== process.env.PGDATABASE) throw new Error('Banco conectado diferente do configurado.')
  const counts: Record<string, number> = {}
  for (const table of ['users', 'deliveries', 'reservations', 'delivery_deletion_audits', 'protocol_counters', 'delivery_email_jobs', 'delivery_email_attempts', 'reservation_glpi_jobs']) {
    const result = await pool.query(`SELECT count(*) AS count FROM checklist_donato."${table}"`)
    counts[table] = Number(result.rows[0].count)
  }
  console.log(JSON.stringify({ host: process.env.PGHOST, ...connection, counts }, null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error && !('code' in error)
    ? error.message : `Falha ao verificar o RDS; código ${(error as { code?: string }).code ?? 'indisponível'}.`)
  process.exitCode = 1
}).finally(closeDB)
