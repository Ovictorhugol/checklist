import { isInspectionEquipment } from '../inspection/inspection.js'
import { minimumReservationEndDate } from './reservationDates.js'

export function validateReservation(input: unknown, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())) {
  if (!input || typeof input !== 'object') throw new Error('Informe os dados da reserva.')
  const data = input as Record<string, unknown>
  const field = (key: string, max: number) => {
    const value = data[key]
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`Campo inválido: ${key}.`)
    return value.trim()
  }
  if (!isInspectionEquipment(data.equipment)) throw new Error('Selecione um equipamento do catálogo de conferência.')
  const requesterName = field('requesterName', 160)
  const department = field('department', 160)
  const purpose = field('purpose', 2000)
  const startDate = field('startDate', 10)
  const endDate = field('endDate', 10)
  for (const date of [startDate, endDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Informe datas válidas para a reserva.')
  }
  if (startDate < today) throw new Error('O início deve ser hoje ou posterior.')
  const minimumEndDate = minimumReservationEndDate(startDate)
  if (!minimumEndDate || endDate < minimumEndDate) throw new Error('O fim do uso deve ser pelo menos 1 dia após o início.')
  return { equipment: data.equipment, requesterName, department, purpose, startDate, endDate }
}
