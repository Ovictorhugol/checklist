import React from 'react'
import { createRoot } from 'react-dom/client'
import LoanTermDocument from '../../../src/components/LoanTermDocument'
import type { DeliveryRecord } from '../../../src/domain/deliveryTypes'
import '../../../src/styles/index.css'
import '../../../src/styles/DeliveriesPage.css'

const scenario = new URLSearchParams(window.location.search).get('case') || 'legacy'
const note = scenario === 'long' ? 'Tela danificada na devolução. '.repeat(80)
  : scenario === 'stress' ? 'Observação de devolução para conferir ajuste da impressão. '.repeat(300) : ''
const delivery: DeliveryRecord = {
  id: 'print-fixture', protocol: 'ENT-2026-0002',
  recipient: scenario === 'legacy' ? 'Funcionário de exemplo' : 'Funcionário com nome longo para verificar o alinhamento dos dados do requisitante',
  recipientDepartment: 'Tecnologia da Informação',
  equipment: 'Celular Samsung Galaxy A36', brand: 'Samsung', model: 'A36',
  serialNumber: '1', assetTag: '1',
  accessories: scenario === 'legacy' ? '' : 'Carregador e cabo USB. '.repeat(25),
  deliveredAt: '2026-10-02T12:00:00Z', returnedAt: '2026-10-03T12:00:00Z',
  status: 'devolvido', parts: [],
  returnInspection: { returnedAt: '2026-10-03T12:00:00Z', parts: [
    { id: 'display', label: 'Tela', deliveredStatus: 'ok', returnedStatus: 'damaged', note },
  ] },
}

createRoot(document.getElementById('root')!).render(
  <div className="app-shell"><div className="page-area"><main className="history-page"><section className="delivery-view">
    <LoanTermDocument delivery={delivery} />
  </section></main></div></div>,
)
