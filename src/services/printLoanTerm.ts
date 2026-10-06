/** Mede o conteúdo real antes de aplicar a escala de impressão. */
export function fitLoanTermToPage(element: HTMLElement): void {
  const page = element.parentElement
  if (!page) return
  element.style.removeProperty('--loan-term-print-scale')
  page.setAttribute('data-print-measuring', '')
  try {
    const bounds = element.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const availableHeight = (bounds.width / 194) * 268
    const contentHeight = Math.max(bounds.height, element.scrollHeight)
    const contentWidth = Math.max(bounds.width, element.scrollWidth)
    const scale = Math.min(1, availableHeight / contentHeight, bounds.width / contentWidth)
    element.style.setProperty('--loan-term-print-scale', String(scale))
  } finally {
    page.removeAttribute('data-print-measuring')
  }
}

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
