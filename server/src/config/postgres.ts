import pg, { type PoolClient, type PoolConfig } from 'pg'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
let pool: pg.Pool | undefined

export function postgresConfig(database = process.env.PGDATABASE): PoolConfig {
  if (!process.env.PGHOST || !database || !process.env.PGUSER || !process.env.PGPASSWORD) {
    throw new Error('Configure PGHOST, PGDATABASE, PGUSER e PGPASSWORD.')
  }
  if (!process.env.PGSSLROOTCERT) throw new Error('Configure PGSSLROOTCERT com o certificado CA do RDS.')
  return {
    host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), database,
    user: process.env.PGUSER, password: process.env.PGPASSWORD,
    ssl: { ca: readFileSync(resolve(serverRoot, process.env.PGSSLROOTCERT), 'utf8'), rejectUnauthorized: true },
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, max: 10,
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool(postgresConfig())
    pool.on('error', () => console.error('Conexão PostgreSQL ociosa interrompida.'))
  }
  return pool
}

export async function closeDB(): Promise<void> { await pool?.end(); pool = undefined }

export class DatabaseSession {
  constructor(public readonly client: PoolClient) {}
  async withTransaction<T>(work: () => Promise<T>): Promise<T> {
    await this.client.query('BEGIN')
    try {
      const result = await work()
      await this.client.query('COMMIT')
      return result
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }
  async endSession(): Promise<void> { this.client.release() }
}
