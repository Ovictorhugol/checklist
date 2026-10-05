import type { IDeliveryPart, IReturnInspectionPart } from '../models/Delivery.js'

const equipmentParts: Record<string, string[]> = {
  'Notebook Dell Latitude 5440': ['display', 'keyboard', 'touchpad', 'case', 'ports'],
  'Computador Dell OptiPlex 3000': ['case', 'front-panel', 'ports', 'rear-ports'],
  'Celular Samsung Galaxy A36': ['display', 'case', 'cameras', 'buttons', 'ports'],
  'Monitor Dell P2222H': ['display', 'bezel', 'stand', 'buttons', 'ports'],
}

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const condition = (value: unknown) => value === 'ok' || value === 'damaged'

export function validateDeliveryParts(equipment: string, input: unknown): IDeliveryPart[] {
  const expected = equipmentParts[equipment]
  if (!expected || !Array.isArray(input) || input.length !== expected.length) {
    throw new Error('Inspecione todas as peças de um equipamento válido.')
  }
  const ids = new Set<string>()
  return input.map((part) => {
    if (!part || !expected.includes(part.id) || ids.has(part.id) || !text(part.label) || !condition(part.status) || typeof part.note !== 'string') {
      throw new Error('Inspeção inválida: verifique peças, condições e observações.')
    }
    ids.add(part.id)
    return { id: part.id, label: part.label.trim(), status: part.status, note: part.note.trim() }
  })
}

export function validateReturnParts(delivered: IDeliveryPart[], input: unknown): IReturnInspectionPart[] {
  if (!delivered.length || !Array.isArray(input) || input.length !== delivered.length) {
    throw new Error('A devolução deve inspecionar todas as peças da entrega.')
  }
  const ids = new Set<string>()
  return input.map((part) => {
    const original = part && delivered.find((item) => item.id === part.id)
    if (!original || ids.has(part.id) || part.deliveredStatus !== original.status || !condition(part.returnedStatus) || typeof part.note !== 'string') {
      throw new Error('A inspeção de devolução não corresponde às peças e condições da entrega.')
    }
    ids.add(part.id)
    return { id: original.id, label: original.label, deliveredStatus: original.status, returnedStatus: part.returnedStatus, note: part.note.trim() }
  })
}
