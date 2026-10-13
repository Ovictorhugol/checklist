import { randomBytes } from 'node:crypto'
import { getPool, DatabaseSession } from '../config/postgres.js'

type Data = Record<string, any>
type Options = { session?: DatabaseSession; new?: boolean; runValidators?: boolean; upsert?: boolean }
export interface ModelConfig {
  table: string
  columns: Record<string, string>
  json?: string[]
  dates?: string[]
  defaults?: () => Data
  normalize?: (data: Data) => void
  validate?: (data: Data) => void
  serialize?: (data: Data) => Data
}

export function newId(): string { return randomBytes(12).toString('hex') }
export function isValidRecordId(value: unknown): boolean { return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) }

// Fixed column maps and bound values keep all query inputs out of SQL syntax.
function compileFilter(config: ModelConfig, filter: Data, values: any[] = []): { sql: string; values: any[] } {
  const bind = (value: any) => { values.push(value); return `$${values.length}` }
  const column = (key: string) => {
    const name = config.columns[key]
    if (!name) throw new Error(`Campo de consulta desconhecido: ${key}`)
    return `"${name}"`
  }
  const visit = (input: Data): string => {
    const conditions = Object.entries(input).map(([key, value]) => {
      if (key === '$or' || key === '$and') {
        if (!Array.isArray(value) || !value.length) throw new Error('Filtro lógico inválido.')
        return `(${value.map(visit).join(key === '$or' ? ' OR ' : ' AND ')})`
      }
      const col = column(key)
      if (value == null) return `${col} IS NULL`
      if (typeof value === 'object' && !(value instanceof Date)) {
        return `(${Object.entries(value).map(([op, operand]) => {
          if (op === '$exists') return `${col} IS ${operand ? 'NOT ' : ''}NULL`
          if (op === '$ne') return `${col} IS DISTINCT FROM ${bind(operand)}`
          if (op === '$in' && Array.isArray(operand)) return operand.length ? `${col} IN (${operand.map(bind).join(', ')})` : 'FALSE'
          throw new Error(`Operador de consulta desconhecido: ${op}`)
        }).join(' AND ')})`
      }
      return `${col} = ${bind(value)}`
    })
    return conditions.length ? conditions.join(' AND ') : 'TRUE'
  }
  return { sql: visit(filter), values }
}

class Query<T> implements PromiseLike<T> {
  private activeSession?: DatabaseSession
  private order?: Record<string, number>
  private plain = false
  constructor(private execute: (session?: DatabaseSession, order?: Record<string, number>, plain?: boolean) => Promise<T>) {}
  session(value: DatabaseSession): this { this.activeSession = value; return this }
  sort(value: Record<string, number>): this { this.order = value; return this }
  lean(): this { this.plain = true; return this }
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute(this.activeSession, this.order, this.plain).then(onfulfilled, onrejected)
  }
}

export function createPostgresModel(config: ModelConfig) {
  const table = `checklist_donato."${config.table}"`
  const encode = (key: string, value: any) => config.json?.includes(key) && value != null ? JSON.stringify(value) : value
  const decode = (row: Data): Data => {
    const data: Data = {}
    for (const [key, col] of Object.entries(config.columns)) {
      if (row[col] == null) continue
      const value = row[col]
      data[key] = config.dates?.includes(key) && value instanceof Date ? value.toISOString() : value
    }
    return data
  }
  const database = (session?: DatabaseSession) => session?.client ?? getPool()
  class RecordModel {
    [key: string]: any
    constructor(data: Data = {}) {
      Object.assign(this, config.defaults?.(), data, { _id: data._id?.toString() || newId() })
      config.normalize?.(this)
    }
    get id(): string { return this._id }
    toObject(): Data {
      return Object.fromEntries(Object.entries(this).filter(([key, value]) => config.columns[key] && value !== undefined))
    }
    toJSON(): Data {
      const data = this.toObject()
      data.id = this.id
      delete data._id
      return config.serialize?.(data) ?? data
    }
    validateSync(): Error | undefined {
      try { config.validate?.(this); return undefined }
      catch (error) { return error as Error }
    }
    async validate(): Promise<void> { const error = this.validateSync(); if (error) throw error }
    async save(): Promise<this> {
      await this.validate()
      const saved = await RecordModel.findOneAndUpdate({ _id: this.id }, { $set: this.toObject() }, { new: true })
      if (!saved) throw new Error('Registro não encontrado para atualizar.')
      Object.assign(this, saved.toObject())
      return this
    }
    async deleteOne(options: Options = {}): Promise<void> {
      await database(options.session).query(`DELETE FROM ${table} WHERE id = $1`, [this.id])
    }
    static async init(): Promise<void> { await getPool().query(`SELECT 1 FROM ${table} LIMIT 0`) }
    static async startSession(): Promise<DatabaseSession> { return new DatabaseSession(await getPool().connect()) }
    static find(filter: Data = {}): Query<RecordModel[]> {
      return new Query(async (session, order, plain) => {
        const where = compileFilter(config, filter)
        const sort = order ? ' ORDER BY ' + Object.entries(order).map(([key, direction]) => {
          if (!config.columns[key]) throw new Error('Campo de ordenação inválido.')
          return `"${config.columns[key]}" ${direction === -1 ? 'DESC' : 'ASC'}`
        }).join(', ') : ''
        const result = await database(session).query(`SELECT * FROM ${table} WHERE ${where.sql}${sort}`, where.values)
        return result.rows.map(row => plain ? decode(row) as RecordModel : new RecordModel(decode(row)))
      })
    }
    static findOne(filter: Data = {}): Query<RecordModel | null> {
      return new Query(async (session, _order, plain) => {
        const where = compileFilter(config, filter)
        // Lock the delivery during deletion so a concurrent return cannot change
        // the record between the historical snapshot and the DELETE.
        const result = await database(session).query(`SELECT * FROM ${table} WHERE ${where.sql} LIMIT 1${session ? ' FOR UPDATE' : ''}`, where.values)
        return result.rows[0] ? (plain ? decode(result.rows[0]) as RecordModel : new RecordModel(decode(result.rows[0]))) : null
      })
    }
    static findById(id: string): Query<RecordModel | null> { return this.findOne({ _id: id }) }
    static async create(data: Data | Data[], options: Options = {}): Promise<any> {
      if (Array.isArray(data)) {
        const records = []
        for (const item of data) records.push(await this.create(item, options))
        return records
      }
      const record = new RecordModel(data)
      await record.validate()
      const entries = Object.entries(record.toObject())
      const result = await database(options.session).query(
        `INSERT INTO ${table} (${entries.map(([key]) => `"${config.columns[key]}"`).join(', ')}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        entries.map(([key, value]) => encode(key, value)),
      )
      return new RecordModel(decode(result.rows[0]))
    }
    static async findOneAndUpdate(filter: Data, update: Data, options: Options = {}): Promise<RecordModel | null> {
      const changes = update.$set
      if (!changes) throw new Error('Atualização inválida.')
      const normalized = { ...changes }
      config.normalize?.(normalized)
      const entries = Object.entries(normalized).filter(([key]) => key !== '_id' && key !== 'createdAt' && key !== 'updatedAt')
      const values = entries.map(([key, value]) => encode(key, value))
      const assignments = entries.map(([key], i) => {
        if (!config.columns[key]) throw new Error('Campo de atualização inválido.')
        return `"${config.columns[key]}" = $${i + 1}`
      })
      const where = compileFilter(config, filter, values)
      const result = await database(options.session).query(`UPDATE ${table} SET ${assignments.join(', ')} WHERE ${where.sql} RETURNING *`, where.values)
      return result.rows[0] ? new RecordModel(decode(result.rows[0])) : null
    }
    static async countDocuments(filter: Data = {}): Promise<number> {
      const where = compileFilter(config, filter)
      const result = await getPool().query(`SELECT count(*) AS count FROM ${table} WHERE ${where.sql}`, where.values)
      return Number(result.rows[0].count)
    }
  }
  return RecordModel
}

export const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' }
export function required(data: Data, fields: string[]): void {
  for (const field of fields) if (typeof data[field] !== 'string' || !data[field].trim()) throw new Error(`Campo obrigatório: ${field}`)
}
export function normalizeStrings(data: Data, lower: string[] = []): void {
  for (const [key, value] of Object.entries(data)) if (typeof value === 'string' && key !== 'passwordHash') data[key] = lower.includes(key) ? value.trim().toLowerCase() : value.trim()
}
