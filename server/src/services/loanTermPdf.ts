import { chromium } from 'playwright'
import { renderLoanTermContent, type LoanTermData, type LoanTermMode } from '../domain/loanTermHtml.js'
import { loanTermStyles } from '../domain/loanTermStyles.js'
import { fitLoanTermToPage } from '../domain/fitLoanTerm.js'

/** Render the exact HTML and CSS used by the application's Print button. */
export async function generateLoanTermPdf(delivery: LoanTermData, mode: LoanTermMode = 'full'): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ timezoneId: 'America/Sao_Paulo' })
    // The document is entirely self-contained; no recipient data leaves this process.
    await page.route('**/*', route => route.abort())
    await page.setContent(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo</title><style>${loanTermStyles}
      html, body { margin: 0; padding: 0; background: #fff; }
    </style></head><body><div class="loan-term-print-page"><article class="loan-term-document" data-term-mode="${mode}" aria-label="Termo de empréstimo e devolução">${renderLoanTermContent(delivery, mode)}</article></div></body></html>`)
    await page.evaluate('document.fonts.ready')
    await page.locator('.loan-term-document').evaluate(fitLoanTermToPage)
    return await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false })
  } finally {
    await browser.close()
  }
}
