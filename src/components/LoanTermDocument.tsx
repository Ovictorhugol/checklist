import SignatureMark from './SignatureMark'
import { useEffect, useRef } from 'react'
import type { DeliveryRecord } from '../domain/deliveryTypes'
import { formatCpf } from '../domain/cpf'
import { fitLoanTermToPage } from '../services/printLoanTerm'

const dateFormatter = new Intl.DateTimeFormat('pt-BR')

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

  const returnDate = delivery.returnedAt || delivery.returnInspection?.returnedAt
  const observations = (delivery.returnInspection?.parts ?? [])
    .filter((part) => part.returnedStatus === 'damaged' && part.note.trim())
    .map((part) => `${part.label}: ${part.note.trim()}`).join('; ')
  const accessories = delivery.accessories?.trim()

  return (
    <div className="loan-term-print-page">
    <article ref={documentRef} className="loan-term-document" aria-label="Termo de empréstimo e devolução">
      <header className="loan-term-header">
        <div className="loan-term-brand"><img src="/donato-eye.svg" alt="" /><strong>DONATO</strong></div>
        <div className="loan-term-title">
          <h2>TERMO DE EMPRÉSTIMO/DEVOLUÇÃO</h2>
          <small>Protocolo: {delivery.protocol}</small>
        </div>
      </header>

      <section className="loan-term-section">
        <h3>DADOS DO REQUISITANTE</h3>
        <div className="loan-term-fields">
          <div className="loan-term-field"><span>Departamento:</span><strong>{delivery.recipientDepartment || ' '}</strong></div>
          <div className="loan-term-recipient-row">
            <div className="loan-term-field"><span>Nome do Funcionário:</span><strong>{delivery.recipient}</strong></div>
            <div className="loan-term-field"><span>CPF:</span><strong>{delivery.recipientCpf ? formatCpf(delivery.recipientCpf) : ' '}</strong></div>
          </div>
        </div>
      </section>

      <section className="loan-term-section">
        <h3>DADOS DO PRODUTO</h3>
        <div className="loan-term-fields">
          <div className="loan-term-product-row">
            <div className="loan-term-field"><span>Marca/Modelo:</span><strong>{[delivery.equipment, delivery.brand, delivery.model].filter(Boolean).join(' ')}</strong></div>
            <div className="loan-term-field"><span>Nº Série:</span><strong>{delivery.serialNumber}</strong></div>
          </div>
          <div className="loan-term-field"><span>Patrimônio:</span><strong>{delivery.assetTag}</strong></div>
          <div className="loan-term-field"><span>Acessórios:</span><strong>{accessories || ' '}</strong></div>
          <div className="loan-term-accessory-check"><span><i>{accessories ? '✓' : ''}</i> Sim</span><div /></div>
          <div className="loan-term-accessory-check"><span><i>{accessories ? '' : '✓'}</i> Não</span><div /></div>
        </div>
      </section>

      <section className="loan-term-section loan-term-declaration">
        <h3>TERMO DE RESPONSABILIDADE</h3>
        <div className="loan-term-prose">
          <p>Pelo presente Termo de Entrega e Responsabilidade, o funcionário acima qualificado declara que recebeu os acessórios acima especificados, de propriedade do Instituto Donato de Oftalmologia LTDA, assumindo o compromisso de manter a guarda pessoal sobre os mesmos, ficando a seu cargo:</p>
          <ul>
            <li>Adequada utilização;</li>
            <li>Comprometer-se a não conceder empréstimo ou confiar a outrem;</li>
            <li>Comunicar, imediatamente, qualquer incidente e ocorrência com o(s) equipamento(s) sob sua responsabilidade;</li>
            <li>Indenizar os danos causados por negligência, má utilização, guarda inadequada, desleixo ou outra conduta danosa que possa decorrer, direta ou indiretamente, de sua ação ou omissão;</li>
          </ul>
        </div>
        <div className="loan-term-signatures">
          <div><span>Assinatura do Funcionário Requisitante:</span><SignatureMark signature={delivery.signature} /></div>
          <div><span>Data do Empréstimo:</span><strong>{dateFormatter.format(new Date(delivery.deliveredAt))}</strong></div>
        </div>
      </section>

      {[false, true].map((recipientCopy) => (
        <section key={String(recipientCopy)} className={`loan-term-section loan-term-return ${recipientCopy ? 'loan-term-recipient-copy' : ''}`}>
          <h3>TERMO DE DEVOLUÇÃO {recipientCopy && <em>(Via do Requisitante)</em>}</h3>
          <div className="loan-term-prose">
            <p>Pelo presente Termo de Devolução, o funcionário acima qualificado declara que devolveu o equipamento e acessórios acima especificados, de propriedade do Instituto Donato de Oftalmologia LTDA, nas mesmas condições em que os recebeu.</p>
            <p>O funcionário abaixo identificado declara que recebeu o(s) equipamento(s) com todos acessórios (se aplicável) em devolução em perfeitas condições, ressalvadas as observações abaixo.</p>
          </div>
          <div className="loan-term-observations"><span>Observações:</span><strong>{observations || ' '}</strong></div>
          <div className="loan-term-signatures">
            <div><span>Assinatura do Funcionário Responsável pelo Recebimento:</span><SignatureMark signature={delivery.returnInspection?.signature} /></div>
            <div><span>Data da Devolução:</span><strong>{returnDate ? dateFormatter.format(new Date(returnDate)) : '____ / ____ / ______'}</strong></div>
          </div>
        </section>
      ))}
    </article>
    </div>
  )
}
