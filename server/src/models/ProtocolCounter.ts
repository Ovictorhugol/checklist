import { getPool } from '../config/postgres.js'

export const ProtocolCounter = {
  async init() { await getPool().query('SELECT 1 FROM checklist_donato.protocol_counters LIMIT 0') },
  async updateOne(filter: { _id: string }, update: { $max: { sequence: number } }, _options: unknown) {
    await getPool().query('INSERT INTO checklist_donato.protocol_counters (year, sequence) VALUES ($1, $2) ON CONFLICT (year) DO UPDATE SET sequence = GREATEST(protocol_counters.sequence, EXCLUDED.sequence)', [filter._id, update.$max.sequence])
  },
  async findOneAndUpdate(filter: { _id: string }, _update: unknown, _options: unknown) {
    const result = await getPool().query('INSERT INTO checklist_donato.protocol_counters (year, sequence) VALUES ($1, 1) ON CONFLICT (year) DO UPDATE SET sequence = protocol_counters.sequence + 1 RETURNING sequence', [filter._id])
    return { sequence: Number(result.rows[0].sequence) }
  },
  findById(year: string) {
    return { async lean() {
      const result = await getPool().query('SELECT sequence FROM checklist_donato.protocol_counters WHERE year = $1', [year])
      return result.rows[0] ? { sequence: Number(result.rows[0].sequence) } : null
    } }
  },
}
