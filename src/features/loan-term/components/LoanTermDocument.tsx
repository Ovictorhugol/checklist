import { useEffect, useRef } from 'react'
import type { DeliveryRecord } from '../../deliveries/types/deliveryTypes'
import { fitLoanTermToPage } from '../services/printLoanTerm'
import { renderLoanTermContent } from '../../../../server/src/domain/loan-term/loanTermHtml'
import { loanTermStyles } from '../../../../server/src/domain/loan-term/loanTermStyles'

export default function LoanTermDocument({ delivery }: { delivery: DeliveryRecord }) {
  const documentRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const fitToPage = () => {
      const element = documentRef.current
      if (!element) return
      fitLoanTermToPage(element)
    }
    const resetSize = () => documentRef.current?.style.removeProperty('--loan-term-print-scale')
    window.addEventListener('beforeprint', fitToPage)
    window.addEventListener('afterprint', resetSize)
    return () => {
      window.removeEventListener('beforeprint', fitToPage)
      window.removeEventListener('afterprint', resetSize)
    }
  }, [delivery])

  return <div className="loan-term-print-page">
    <style>{loanTermStyles}</style>
    <article ref={documentRef} className="loan-term-document" aria-label="Termo de empréstimo e devolução"
      dangerouslySetInnerHTML={{ __html: renderLoanTermContent(delivery) }} />
  </div>
}
