import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateLoanTermPdf } from '../src/services/loanTermPdf.js'
import { renderLoanTermContent } from '../src/domain/loanTermHtml.js'

test('termo compartilhado escapa dados e mantém duas vias, campos e assinatura', () => {
  const html = renderLoanTermContent({ recipient: '<img src=x onerror=alert(1)>', accessories: 'Cabo & carregador', deliveredAt: '2026-10-14T01:00:00Z', signature: { signerName: 'Pessoa', strokes: [[{ x: 1, y: 2 }, { x: 3, y: 4 }]], signedAt: '', capturedBy: '', documentHash: '' } })
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('Cabo &amp; carregador'))
  assert.ok(html.includes('13/10/2026'))
  assert.ok(html.includes('<polyline'))
  assert.ok(html.includes('(Via do Requisitante)'))
  assert.equal(html.match(/<h3>TERMO DE DEVOLUÇÃO/g)?.length, 2)
})

test('PDF usa uma página A4 inclusive com campos e observações extensos', async () => {
  for (const repeat of [1, 30]) {
    const pdf = await generateLoanTermPdf({ protocol: 'ENT-2026-10-13-0001', recipient: 'Funcionário '.repeat(repeat), accessories: 'Carregador e cabo '.repeat(repeat), deliveredAt: '2026-10-13T12:00:00Z', returnInspection: { parts: [{ label: 'Tela', returnedStatus: 'damaged', note: 'Observação de devolução. '.repeat(repeat) }] } })
    const body = pdf.toString('latin1')
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    assert.equal(body.match(/\/Type\s*\/Page\b/g)?.length, 1)
    const size = body.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)
    assert.ok(size)
    assert.ok(Math.abs(Number(size[1]) - 595.28) < 1)
    assert.ok(Math.abs(Number(size[2]) - 841.89) < 1)
  }
})

test('anexos separam responsabilidade da entrega e somente a via do requisitante na devolução', async () => {
  const delivery = { recipient: 'Pessoa', signature: { signerName: 'Assinante da entrega', strokes: [[{ x: 1, y: 2 }, { x: 3, y: 4 }]], signedAt: '', capturedBy: '', documentHash: '' }, returnInspection: { signature: { signerName: 'Assinante da devolução', strokes: [[{ x: 5, y: 6 }, { x: 7, y: 8 }]], signedAt: '', capturedBy: '', documentHash: '' }, returnedAt: '2026-10-14T12:00:00Z', parts: [{ label: 'Tela', note: 'Dano constatado', returnedStatus: 'damaged' }] } }
  const loanHtml = renderLoanTermContent(delivery, 'delivery')
  assert.ok(loanHtml.includes('TERMO DE RESPONSABILIDADE'))
  assert.ok(loanHtml.includes('Assinante da entrega'))
  assert.ok(!loanHtml.includes('TERMO DE DEVOLUÇÃO '))
  assert.ok(!loanHtml.includes('Assinante da devolução'))
  const returnHtml = renderLoanTermContent(delivery, 'return')
  assert.equal(returnHtml.match(/<h3>TERMO DE DEVOLUÇÃO/g)?.length, 1)
  assert.ok(returnHtml.includes('(Via do Requisitante)'))
  assert.ok(returnHtml.includes('Assinante da devolução'))
  assert.ok(returnHtml.includes('Tela: Dano constatado'))
  assert.ok(returnHtml.includes('14/10/2026'))
  assert.ok(!returnHtml.includes('TERMO DE RESPONSABILIDADE'))
  assert.ok(!returnHtml.includes('Assinante da entrega'))
  const holderHtml = renderLoanTermContent({ ...delivery, recipient: delivery.returnInspection.signature.signerName }, 'return')
  assert.ok(holderHtml.includes('Assinatura do Funcionário Responsável pela Devolução:'))
  assert.ok(!holderHtml.includes('Assinatura do Funcionário Responsável pelo Recebimento:'))
  assert.ok(returnHtml.includes('Assinatura do Funcionário Responsável pelo Recebimento:'))
  for (const type of ['delivery', 'return'] as const) {
    const pdf = await generateLoanTermPdf(delivery, type)
    assert.equal(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length, 1)
  }
})
