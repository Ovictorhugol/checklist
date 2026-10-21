type PrintableElement = {
  parentElement: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void } | null
  style: { removeProperty(name: string): string; setProperty(name: string, value: string): void }
  getBoundingClientRect(): { width: number; height: number }
  scrollHeight: number
  scrollWidth: number
}

/** Self-contained so Chromium and the frontend execute the same A4 fit. */
export function fitLoanTermToPage(element: PrintableElement): void {
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
