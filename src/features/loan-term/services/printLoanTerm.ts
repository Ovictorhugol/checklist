import { fitLoanTermToPage } from '../../../../server/src/domain/loan-term/fitLoanTerm'
export { fitLoanTermToPage } from '../../../../server/src/domain/loan-term/fitLoanTerm'

export async function printLoanTermDocument(): Promise<void> {
  const element = document.querySelector<HTMLElement>('.history-page:not([hidden]) .loan-term-document')
  if (!element) return
  // Evita medir com fontes ou logo ainda em carregamento.
  await document.fonts.ready
  await Promise.all(Array.from(element.querySelectorAll('img'), (image) => image.decode().catch(() => undefined)))
  if (!element.isConnected) return
  fitLoanTermToPage(element)
  window.print()
}
