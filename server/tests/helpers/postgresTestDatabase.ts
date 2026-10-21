import dotenv from 'dotenv'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getPool, closeDB, postgresConfig, serverRoot } from '../../src/config/postgres.js'

// This opt-in suite creates and drops ONLY its own isolated test database.
export async function createTestDatabase() {
  if (process.env.TEST_RDS_ENV) dotenv.config({ path: resolve(serverRoot, process.env.TEST_RDS_ENV), override: true, quiet: true })
  const original = process.env.PGDATABASE
  const name = `checklist_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client(postgresConfig('postgres'))
  await admin.connect()
  await admin.query(`CREATE DATABASE "${name}"`)
  process.env.PGDATABASE = name
  try {
    await getPool().query(await readFile(resolve(serverRoot, 'database/migrations/001_checklist_schema.sql'), 'utf8'))
    await getPool().query(await readFile(resolve(serverRoot, 'database/migrations/003_rds_backend.sql'), 'utf8'))
    await getPool().query(await readFile(resolve(serverRoot, 'database/migrations/004_restore_deliveries.sql'), 'utf8'))
    await getPool().query(await readFile(resolve(serverRoot, 'database/migrations/005_equipment_possession.sql'), 'utf8'))
    await getPool().query(await readFile(resolve(serverRoot, 'database/migrations/006_delivery_email.sql'), 'utf8'))
    await getPool().query(await readFile(resolve(serverRoot, 'database/migrations/007_return_email.sql'), 'utf8'))
    await getPool().query(await readFile(resolve(serverRoot, 'database/migrations/008_reservation_glpi.sql'), 'utf8'))
  } catch (error) { await cleanup(); throw error }
  async function cleanup() {
    if (process.env.PGDATABASE !== name || !/^checklist_test_[a-f0-9]{32}$/.test(name)) throw new Error('Nome do banco de testes inesperado; remoção recusada.')
    await closeDB()
    await admin.query(`DROP DATABASE "${name}"`)
    await admin.end()
    if (original === undefined) delete process.env.PGDATABASE
    else process.env.PGDATABASE = original
  }
  return { name, cleanup }
}
