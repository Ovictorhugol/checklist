import { formatCpf } from './cpf.js'
import type { SignatureRecord } from './signatureTypes.js'
import { responsibilityIntro, responsibilities, returnDeclarations } from './loanTerm.js'
import { getEquipmentName } from './equipment.js'

export type LoanTermData = {
  protocol?: string; recipientDepartment?: string; recipient?: string; recipientCpf?: string
  equipment?: string; brand?: string; model?: string; serialNumber?: string; assetTag?: string
  accessories?: string; deliveredAt?: string; returnedAt?: string; signature?: SignatureRecord
  returnInspection?: { returnedAt?: string; signature?: SignatureRecord; parts?: { returnedStatus?: string; note: string; label: string }[] }
}
export type LoanTermMode = 'full' | 'delivery' | 'return'

// All variable content is escaped: this template is used both by React and Chromium.
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const date = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '____ / ____ / ______'
const field = (label: string, value: unknown) => `<div class="loan-term-field"><span>${label}</span><strong>${escape(value) || ' '}</strong></div>`

function signature(record?: SignatureRecord): string {
  const points = record?.strokes.flat() ?? []
  const xs = points.map(point => point.x), ys = points.map(point => point.y)
  const box = points.length ? `${Math.min(...xs) - 4} ${Math.min(...ys) - 4} ${Math.max(...xs) - Math.min(...xs) + 8} ${Math.max(...ys) - Math.min(...ys) + 8}` : '0 0 1000 300'
  return `<i class="loan-term-signature-mark">${record ? `<svg viewBox="${escape(box)}" role="img" aria-label="Assinatura de ${escape(record.signerName)}" preserveAspectRatio="xMidYMax meet">${record.strokes.map(stroke => `<polyline points="${escape(stroke.map(point => `${point.x},${point.y}`).join(' '))}" fill="none" stroke="#17212b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`).join('')}</svg>` : ''}</i>`
}

const eye = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" fill="none"><path fill="#000" fill-rule="evenodd" d="M2 40C17 13 37 2 60 2s43 11 58 38C103 67 83 78 60 78S17 67 2 40Zm17 0c12 17 25 26 41 26s29-9 41-26C89 23 76 14 60 14S31 23 19 40Z"/><path d="M3 40c19 1 37 6 56 15 21 10 40 9 58-15" stroke="#fff" stroke-width="2.5"/></svg>'

export function renderLoanTermContent(delivery: LoanTermData, mode: LoanTermMode = 'full'): string {
  const accessories = delivery.accessories?.trim()
  const returnDate = delivery.returnedAt || delivery.returnInspection?.returnedAt
  const legacyReceiverSignature = delivery.returnInspection?.signature && delivery.returnInspection.signature.signerName.trim() !== delivery.recipient?.trim()
  const returnSignerLabel = legacyReceiverSignature ? 'Assinatura do Funcionário Responsável pelo Recebimento:' : 'Assinatura do Funcionário Responsável pela Devolução:'
  const observations = (delivery.returnInspection?.parts ?? []).filter(part => part.returnedStatus === 'damaged' && part.note.trim()).map(part => `${part.label}: ${part.note.trim()}`).join('; ')
  const deliveryContent = `<header class="loan-term-header">
    <div class="loan-term-brand">${eye}<strong>DONATO</strong></div>
    <div class="loan-term-title"><h2>TERMO DE EMPRÉSTIMO/DEVOLUÇÃO</h2><small>Protocolo: ${escape(delivery.protocol)}</small></div>
  </header>
  <section class="loan-term-section"><h3>DADOS DO REQUISITANTE</h3><div class="loan-term-fields">
    ${field('Departamento:', delivery.recipientDepartment)}
    <div class="loan-term-recipient-row">${field('Nome do Funcionário:', delivery.recipient)}${field('CPF:', delivery.recipientCpf ? formatCpf(delivery.recipientCpf) : '')}</div>
  </div></section>
  <section class="loan-term-section"><h3>DADOS DO PRODUTO</h3><div class="loan-term-fields">
    <div class="loan-term-product-row">${field('Marca/Modelo:', [getEquipmentName(delivery.equipment || ''), delivery.brand, delivery.model].filter(Boolean).join(' '))}${field('Nº Série:', delivery.serialNumber)}</div>
    ${field('Patrimônio:', delivery.assetTag)}${field('Acessórios:', accessories)}
    <div class="loan-term-accessory-check"><span><i>${accessories ? '✓' : ''}</i> Sim</span><div></div></div>
    <div class="loan-term-accessory-check"><span><i>${accessories ? '' : '✓'}</i> Não</span><div></div></div>
  </div></section>
  <section class="loan-term-section loan-term-declaration"><h3>TERMO DE RESPONSABILIDADE</h3>
    <div class="loan-term-prose"><p>${escape(responsibilityIntro)}</p><ul>${responsibilities.map(text => `<li>${escape(text)}</li>`).join('')}</ul></div>
    <div class="loan-term-signatures"><div><span>Assinatura do Funcionário Requisitante:</span>${signature(delivery.signature)}</div><div><span>Data do Empréstimo:</span><strong>${date(delivery.deliveredAt)}</strong></div></div>
  </section>`
  const returnContent = (mode === 'return' ? [true] : [false, true]).map(copy => `<section class="loan-term-section loan-term-return ${copy ? 'loan-term-recipient-copy' : ''}">
    <h3>TERMO DE DEVOLUÇÃO ${copy ? '<em>(Via do Requisitante)</em>' : ''}</h3>
    <div class="loan-term-prose">${returnDeclarations.map(text => `<p>${escape(text)}</p>`).join('')}</div>
    <div class="loan-term-observations"><span>Observações:</span><strong>${escape(observations) || ' '}</strong></div>
    <div class="loan-term-signatures"><div><span>${returnSignerLabel}</span>${signature(delivery.returnInspection?.signature)}</div><div><span>Data da Devolução:</span><strong>${date(returnDate)}</strong></div></div>
  </section>`).join('')
  return mode === 'delivery' ? deliveryContent : mode === 'return' ? returnContent : deliveryContent + returnContent
}
