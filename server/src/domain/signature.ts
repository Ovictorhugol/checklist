import { createHash } from 'node:crypto'

import type { SignatureInput, SignatureRecord } from './signatureTypes.js'
export type { SignatureInput, SignatureRecord } from './signatureTypes.js'

export function validateSignature(input: unknown): SignatureInput {
  const signature = input as SignatureInput | undefined
  if (!signature || typeof signature.signerName !== 'string' || !signature.signerName.trim() || signature.signerName.trim().length > 160 || !Array.isArray(signature.strokes) || !signature.strokes.length || signature.strokes.length > 64) {
    throw new Error('Informe o nome e desenhe a assinatura antes de finalizar.')
  }
  let points = 0
  let distance = 0
  const strokes = signature.strokes.map((stroke) => {
    if (!Array.isArray(stroke) || stroke.length < 2) throw new Error('Desenhe uma assinatura válida antes de finalizar.')
    points += stroke.length
    if (points > 2000) throw new Error('A assinatura excede o tamanho permitido. Limpe e assine novamente.')
    return stroke.map((point, index) => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1000 || point.y < 0 || point.y > 300) throw new Error('Dados da assinatura inválidos.')
      if (index) distance += Math.hypot(point.x - stroke[index - 1].x, point.y - stroke[index - 1].y)
      return { x: point.x, y: point.y }
    })
  })
  if (distance < 30) throw new Error('Desenhe uma assinatura válida antes de finalizar.')
  return { signerName: signature.signerName.trim(), strokes }
}

export function recordSignature(input: SignatureInput, document: unknown, capturedBy: string): SignatureRecord {
  return { ...input, signedAt: new Date().toISOString(), capturedBy, documentHash: createHash('sha256').update(JSON.stringify(document)).digest('hex') }
}
