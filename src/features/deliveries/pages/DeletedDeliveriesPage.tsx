import { useEffect, useState } from 'react'
import { Archive, CircleAlert, RefreshCw, ShieldCheck, RotateCcw, CheckCircle2 } from 'lucide-react'
import { apiGetDeletedDeliveries, apiRestoreDelivery } from '../../../shared/api/api'
import type { DeletedDeliveryAudit, DeliveryRecord } from '../types/deliveryTypes'
import '../styles/DeletedDeliveriesPage.css'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(value?: string) {
  if (!value) return 'Não informado'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Não informado' : dateFormatter.format(date)
}

function DeletedDeliveriesPage({ hidden, onRestored }: { hidden: boolean; onRestored: () => Promise<void> }) {
  const [audits, setAudits] = useState<DeletedDeliveryAudit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [success, setSuccess] = useState('')

  const restore = async (audit: DeletedDeliveryAudit) => {
    if (restoringId || !audit.canRestore || !window.confirm(`Recuperar a entrega ${audit.deliverySnapshot.protocol} com os dados originais?`)) return
    setRestoringId(audit.id)
    setError('')
    setSuccess('')
    try {
      const delivery = await apiRestoreDelivery(audit.id)
      setSuccess(`Entrega ${delivery.protocol} recuperada. Ela está disponível em Entregas.`)
      await onRestored()
      await loadAudits()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível recuperar a entrega.')
    } finally { setRestoringId(null) }
  }

  const loadAudits = async () => {
    setLoading(true)
    setError('')
    try {
      setAudits(await apiGetDeletedDeliveries())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o histórico.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hidden) return
    let active = true
    void apiGetDeletedDeliveries().then(
      (records) => { if (active) { setAudits(records); setError(''); setLoading(false) } },
      (caught: Error) => { if (active) { setError(caught.message); setLoading(false) } }
    )
    return () => { active = false }
  }, [hidden])

  return (
    <main className="deleted-page" hidden={hidden}>
      <header className="deleted-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> AUDITORIA ADMINISTRATIVA</div>
          <h1>Entregas excluídas</h1>
          <p>Arquivo das entregas removidas, com os dados originais e o registro da exclusão.</p>
        </div>
        <button className="deleted-refresh" type="button" onClick={() => void loadAudits()} disabled={loading || !!restoringId} aria-label="Atualizar histórico" title="Atualizar histórico">
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      {error && <div className="deleted-feedback deleted-feedback-error" role="alert"><CircleAlert size={16} />{error}</div>}
      {success && <div className="deleted-feedback deleted-feedback-success" role="status"><CheckCircle2 size={16} />{success}</div>}
      {loading ? (
        <div className="deleted-empty">Carregando histórico...</div>
      ) : !audits.length ? (
        <div className="deleted-empty"><Archive size={22} /><strong>Nenhuma entrega excluída</strong><span>Exclusões futuras serão arquivadas aqui.</span></div>
      ) : (
        <section className="deleted-list" aria-label="Histórico de entregas excluídas">
          {audits.map((audit) => (
            <DeletedDelivery key={audit.id} audit={audit} onRestore={() => void restore(audit)} restoring={restoringId === audit.id} busy={!!restoringId} />
          ))}
        </section>
      )}
      <footer className="deleted-footer"><ShieldCheck size={14} /> Histórico de auditoria preservado</footer>
    </main>
  )
}

function DeletedDelivery({ audit, onRestore, restoring, busy }: { audit: DeletedDeliveryAudit; onRestore: () => void; restoring: boolean; busy: boolean }) {
  const delivery = audit.deliverySnapshot

  return (
    <article className="deleted-record">
      <header className="deleted-record-heading">
        <div>
          <div className="section-kicker">PROTOCOLO</div>
          <h2>{delivery.protocol || 'Protocolo indisponível'}</h2>
          <p>Excluída em {formatDate(audit.deletedAt)} por <strong>{audit.deletedByEmail}</strong> ({audit.deletedByUserId})</p>
        </div>
        <div className="deleted-record-actions">
          <span className="deleted-audit-badge">{audit.restoredAt ? <CheckCircle2 size={13} /> : <Archive size={13} />}{audit.restoredAt ? 'Recuperada' : 'Arquivada'}</span>
          {!audit.restoredAt && <button type="button" className="deleted-refresh" disabled={!audit.canRestore || busy} onClick={onRestore}>
            <RotateCcw size={15} />{restoring ? 'Recuperando...' : 'Recuperar entrega'}
          </button>}
        </div>
      </header>
      {audit.restoredAt && <p className="deleted-restoration-note">Recuperada em {formatDate(audit.restoredAt)} por {audit.restoredByEmail}.</p>}
      {!audit.restoredAt && !audit.canRestore && <p className="deleted-restoration-note">Registro antigo sem dados completos para recuperação.</p>}

      <section className="deleted-data-grid" aria-label="Dados da entrega arquivada">
        <Data label="Equipamento" value={delivery.equipment} />
        <Data label="Modelo" value={delivery.model} />
        <Data label="Marca" value={delivery.brand} />
        <Data label="Patrimônio" value={delivery.assetTag} />
        <Data label="Número de série" value={delivery.serialNumber} />
        <Data label="Responsável" value={delivery.recipient} />
        <Data label="E-mail do responsável" value={delivery.recipientEmail} />
        <Data label="CPF do responsável" value={delivery.recipientCpf} />
        <Data label="Setor" value={delivery.recipientDepartment} />
        <Data label="Entregue por" value={delivery.deliveredBy} />
        <Data label="Data da entrega" value={formatDate(delivery.deliveredAt)} />
        <Data label="Situação na exclusão" value={delivery.isReturned || delivery.status === 'devolvido' ? 'Devolvido' : 'Em posse'} />
        <Data label="Data da devolução" value={formatDate(delivery.returnedAt || delivery.returnInspection?.returnedAt)} />
        <Data label="Inspecionado na devolução por" value={delivery.returnInspection?.inspectedBy} />
        <Data label="Criado no banco" value={formatDate(delivery.createdAt)} />
        <Data label="Última atualização no banco" value={formatDate(delivery.updatedAt)} />
        <Data label="ID original" value={audit.deliveryId} />
        <Data label="ID do registro de auditoria" value={audit.id} />
      </section>

      <Parts title="Inspeção na entrega" delivery={delivery} />
      {delivery.returnInspection && (
        <section className="deleted-parts-section">
          <h3>Inspeção de devolução em {formatDate(delivery.returnInspection.returnedAt)}</h3>
          <ul className="deleted-parts-list">
            {delivery.returnInspection.parts.map((part) => (
              <li key={part.id}>
                <strong>{part.label}</strong>
                <span>Entrega: {part.deliveredStatus === 'damaged' ? 'Danificado' : 'Sem danos'}</span>
                <span>Devolução: {part.returnedStatus === 'damaged' ? 'Danificado' : 'Sem danos'}</span>
                {part.note && <p>{part.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

function Data({ label, value }: { label: string; value?: string }) {
  return <div><span>{label}</span><strong>{value || 'Não informado'}</strong></div>
}

function Parts({ title, delivery }: { title: string; delivery: DeliveryRecord }) {
  return (
    <section className="deleted-parts-section">
      <h3>{title}</h3>
      {delivery.parts?.length ? (
        <ul className="deleted-parts-list">
          {delivery.parts.map((part) => (
            <li key={part.id}>
              <strong>{part.label}</strong>
              <span>{part.status === 'damaged' ? 'Danificado' : 'Sem danos'}</span>
              {part.note && <p>{part.note}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="deleted-muted">Nenhum detalhe de inspeção arquivado.</p>}
    </section>
  )
}

export default DeletedDeliveriesPage
