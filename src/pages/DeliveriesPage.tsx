import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  type DeliveryRecord,
  isDeliveryReturned,
  getDeliveryDamageCount,
  type ReturnInspectionPart,
  type ReturnInspectionInput,
} from '../domain/deliveryTypes'
import '../styles/DeliveriesPage.css'
import SignatureDialog from '../components/SignatureDialog'
import type { SignatureInput } from '../domain/signature'
import LoanTermDocument from '../components/LoanTermDocument'
import { printLoanTermDocument } from '../services/printLoanTerm'
import { formatCpf } from '../domain/cpf'

type DeliveriesPageProps = {
  deliveries: DeliveryRecord[]
  onNewDelivery: () => void
  onSaveReturn: (deliveryId: string, inspection: ReturnInspectionInput) => Promise<DeliveryRecord>
  onDeleteDelivery: (deliveryId: string) => Promise<void>
  isAdmin: boolean
  personalEmail?: string
  personalName?: string | null
  hidden: boolean
}

type StatusFilter = 'all' | 'in_possession' | 'returned'
type DamageFilter = 'all' | 'damaged' | 'clear'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function DeliveriesPage({ deliveries, onNewDelivery, onSaveReturn, onDeleteDelivery, isAdmin, personalEmail, personalName, hidden }: DeliveriesPageProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [damageFilter, setDamageFilter] = useState<DamageFilter>('all')
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryRecord | null>(null)
  const [isReturnInspection, setIsReturnInspection] = useState(false)
  const [returnStatuses, setReturnStatuses] = useState<Record<string, '' | 'ok' | 'damaged'>>({})
  const [returnNotes, setReturnNotes] = useState<Record<string, string>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [pendingReturn, setPendingReturn] = useState<Omit<ReturnInspectionInput, 'signature'> | null>(null)
  const [returnBusy, setReturnBusy] = useState(false)
  const [returnError, setReturnError] = useState('')

  const inPossessionCount = deliveries.filter((delivery) => !isDeliveryReturned(delivery)).length
  const returnedCount = deliveries.filter((delivery) => isDeliveryReturned(delivery)).length
  const damagedDeliveries = deliveries.filter((delivery) => getDeliveryDamageCount(delivery) > 0).length

  const visibleDeliveries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return [...deliveries]
      .sort((first, second) => second.deliveredAt.localeCompare(first.deliveredAt))
      .filter((delivery) => {
        const returned = isDeliveryReturned(delivery)
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'in_possession' ? !returned : returned)

        const hasDamage = getDeliveryDamageCount(delivery) > 0
        const matchesDamage =
          damageFilter === 'all' ||
          (damageFilter === 'damaged' ? hasDamage : !hasDamage)

        const searchable = [
          delivery.protocol,
          delivery.assetTag,
          delivery.serialNumber,
          delivery.recipient,
          delivery.recipientEmail,
          delivery.recipientDepartment,
          delivery.equipment,
          delivery.model,
          delivery.brand,
          returned ? 'devolvido' : 'em posse responsabilidade',
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('pt-BR')

        return matchesStatus && matchesDamage && (!query || searchable.includes(query))
      })
  }, [deliveries, statusFilter, damageFilter, search])

  const beginReturnInspection = () => {
    if (!selectedDelivery) return
    setReturnStatuses(Object.fromEntries(selectedDelivery.parts.map((part) => [part.id, ''])) as Record<string, '' | 'ok' | 'damaged'>)
    setReturnNotes({})
    setReturnError('')
    setIsReturnInspection(true)
  }

  const beginReturnSignature = () => {
    if (returnBusy) return
    if (!selectedDelivery || selectedDelivery.parts.some((part) => !returnStatuses[part.id])) return
    const returnDate = new Date().toISOString()
    const inspection: Omit<ReturnInspectionInput, 'signature'> = {
      returnedAt: returnDate,
      parts: selectedDelivery.parts.map((part): ReturnInspectionPart => ({
        id: part.id,
        label: part.label,
        deliveredStatus: part.status,
        returnedStatus: returnStatuses[part.id] as 'ok' | 'damaged',
        note: (returnNotes[part.id] ?? '').trim(),
      })),
    }
    setPendingReturn(inspection)
  }

  const saveReturn = async (signature: SignatureInput) => {
    if (!selectedDelivery || !pendingReturn || returnBusy) return
    setReturnBusy(true)
    setReturnError('')
    try {
      const updated = await onSaveReturn(selectedDelivery.id, { ...pendingReturn, returnedAt: new Date().toISOString(), signature })
      setSelectedDelivery(updated)
      setIsReturnInspection(false)
      setPendingReturn(null)
    } catch (error) {
      setReturnError((error as Error).message)
      throw error
    } finally {
      setReturnBusy(false)
    }
  }

  const deleteDelivery = async (delivery: DeliveryRecord) => {
    if (!window.confirm(`Excluir permanentemente a entrega ${delivery.protocol}?`)) return
    setDeletingId(delivery.id)
    setDeleteError('')
    try {
      await onDeleteDelivery(delivery.id)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Não foi possível excluir a entrega.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main id="entregas" className="history-page" hidden={hidden}>
      {pendingReturn && selectedDelivery && <SignatureDialog title="Assinatura da devolução" signerName={personalName || ''} editableName onCancel={() => setPendingReturn(null)} onConfirm={saveReturn}>
        <p><strong>Protocolo:</strong> {selectedDelivery.protocol} · <strong>Patrimônio:</strong> {selectedDelivery.assetTag}</p>
        <p><strong>Equipamento:</strong> {selectedDelivery.equipment} · <strong>Responsável pela entrega:</strong> {selectedDelivery.recipient}</p>
        <p>A assinatura deve ser feita pelo responsável do hospital que recebe e confere o equipamento.</p>
        <ul>{pendingReturn.parts.map((part) => <li key={part.id}>{part.label}: {part.returnedStatus === 'damaged' ? 'Danificado' : 'Sem danos'}{part.note && ` — ${part.note}`}</li>)}</ul>
        <p>Declaro que recebi o equipamento em devolução nas condições da inspeção acima, ressalvadas as observações registradas.</p>
      </SignatureDialog>}
      {returnError && <p role="alert">{returnError}</p>}
      {selectedDelivery ? (
        <section className="delivery-view" aria-labelledby="delivery-view-title">
          <div className="delivery-view-toolbar">
            <button className="delivery-back-button" type="button" disabled={returnBusy} onClick={() => setSelectedDelivery(null)}>
              <ArrowLeft size={15} /> Voltar às entregas
            </button>
            <button className="delivery-print-button" type="button" onClick={() => void printLoanTermDocument()}>
              <Printer size={15} /> Imprimir termo
            </button>
          </div>

          <div className="delivery-view-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> CONSULTA DE REGISTRO</div>
            <h1 id="delivery-view-title">Entrega {selectedDelivery.protocol}</h1>
            <p>Registro concluído em {dateFormatter.format(new Date(selectedDelivery.deliveredAt))}</p>
          </div>

          {/* Banner de status do equipamento */}
          <div className={`delivery-status-banner ${isDeliveryReturned(selectedDelivery) ? 'banner-returned' : 'banner-possession'}`}>
            {isDeliveryReturned(selectedDelivery) ? (
              <>
                <CheckCircle2 size={20} />
                <div>
                  <strong>Equipamento Devolvido ao Hospital</strong>
                  <p>
                    A devolução foi confirmada e conferida
                    {(selectedDelivery.returnedAt || selectedDelivery.returnInspection?.returnedAt) &&
                      ` em ${dateFormatter.format(new Date(selectedDelivery.returnedAt || selectedDelivery.returnInspection!.returnedAt))}`}.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Clock size={20} />
                <div>
                  <strong>Equipamento Em Posse do Responsável</strong>
                  <p>Este equipamento está sob a responsabilidade de <strong>{selectedDelivery.recipient}</strong> e aguarda devolução ao hospital.</p>
                </div>
              </>
            )}
          </div>

          <section className="delivery-view-meta" aria-label="Dados da entrega">
            <div><span>Equipamento</span><strong>{selectedDelivery.equipment}</strong></div>
            <div><span>Modelo do equipamento</span><strong>{selectedDelivery.model || 'Não informado'}</strong></div>
            <div><span>Marca</span><strong>{selectedDelivery.brand || 'Não informada'}</strong></div>
            <div><span>Patrimônio</span><strong>{selectedDelivery.assetTag}</strong></div>
            <div><span>Número de série</span><strong>{selectedDelivery.serialNumber || 'Não informado'}</strong></div>
            <div><span>Responsável pelo recebimento</span><strong>{selectedDelivery.recipient}</strong></div>
            <div><span>E-mail do responsável</span><strong>{selectedDelivery.recipientEmail || 'Não informado'}</strong></div>
            <div><span>CPF do responsável</span><strong>{selectedDelivery.recipientCpf ? formatCpf(selectedDelivery.recipientCpf) : 'Não informado'}</strong></div>
            <div><span>Setor do responsável</span><strong>{selectedDelivery.recipientDepartment || 'Não informado'}</strong></div>
          </section>

          {isAdmin && !isDeliveryReturned(selectedDelivery) && !isReturnInspection && (
            <button className="return-start-button" type="button" onClick={beginReturnInspection}>
              <ClipboardList size={15} /> Conferir e registrar devolução
            </button>
          )}

          {isReturnInspection && !isDeliveryReturned(selectedDelivery) && (
            <section className="return-inspection" aria-labelledby="return-inspection-title">
              <div className="delivery-view-section-heading">
                <div>
                  <div className="section-kicker">RECEBIMENTO DE DEVOLUÇÃO</div>
                  <h2 id="return-inspection-title">Conferir estado do equipamento</h2>
                </div>
                <span>Compare cada item com a entrega original</span>
              </div>
              <div className="return-inspection-list">
                {selectedDelivery.parts.map((part) => (
                  <div className="return-inspection-item" key={part.id}>
                    <strong>{part.label}</strong>
                    <div className="return-condition-pair">
                      <span><small>Na entrega</small>{part.status === 'damaged' ? 'Danificado' : 'Sem danos'}</span>
                      <label>
                        <small>Na devolução</small>
                        <select
                          required
                          disabled={returnBusy}
                          aria-label={`Condição na devolução: ${part.label}`}
                          value={returnStatuses[part.id] ?? ''}
                          onChange={(event) =>
                            setReturnStatuses((current) => ({
                              ...current,
                              [part.id]: event.target.value as '' | 'ok' | 'damaged',
                            }))
                          }
                        >
                          <option value="">Selecione</option>
                          <option value="ok">Sem danos</option>
                          <option value="damaged">Danificado</option>
                        </select>
                      </label>
                    </div>
                    {returnStatuses[part.id] === 'damaged' && (
                      <label className="return-note">
                        <span>Observação do dano na devolução</span>
                        <textarea
                          disabled={returnBusy}
                          rows={2}
                          value={returnNotes[part.id] ?? ''}
                          onChange={(event) => setReturnNotes((current) => ({ ...current, [part.id]: event.target.value }))}
                          placeholder="Descreva o dano encontrado..."
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              <div className="return-actions">
                <button className="return-cancel-button" type="button" disabled={returnBusy} onClick={() => setIsReturnInspection(false)}>
                  Cancelar
                </button>
                <button
                  className="return-save-button"
                  type="button"
                  disabled={returnBusy || selectedDelivery.parts.some((part) => !returnStatuses[part.id])}
                  onClick={beginReturnSignature}
                >
                  {returnBusy ? 'Salvando...' : 'Assinar e registrar devolução'}
                </button>
              </div>
            </section>
          )}

          {isDeliveryReturned(selectedDelivery) && selectedDelivery.returnInspection && (
            <section className="return-inspection" aria-labelledby="return-inspection-title">
              <div className="delivery-view-section-heading">
                <div>
                  <div className="section-kicker">DEVOLUÇÃO CONFERIDA</div>
                  <h2 id="return-inspection-title">Comparativo de condições</h2>
                </div>
                <span>
                  {dateFormatter.format(
                    new Date(selectedDelivery.returnedAt || selectedDelivery.returnInspection.returnedAt)
                  )}
                </span>
              </div>
              <div className="return-inspection-list">
                {selectedDelivery.returnInspection.parts.map((part) => (
                  <div
                    className={`return-inspection-item ${
                      part.deliveredStatus !== part.returnedStatus ? 'return-condition-changed' : ''
                    }`}
                    key={part.id}
                  >
                    <strong>{part.label}</strong>
                    <div className="return-condition-pair">
                      <span><small>Na entrega</small>{part.deliveredStatus === 'damaged' ? 'Danificado' : 'Sem danos'}</span>
                      <span><small>Na devolução</small>{part.returnedStatus === 'damaged' ? 'Danificado' : 'Sem danos'}</span>
                    </div>
                    {part.returnedStatus === 'damaged' && part.note && (
                      <p className="return-saved-note">{part.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="delivery-view-inspection" aria-labelledby="delivery-inspection-title">
            <div className="delivery-view-section-heading">
              <div>
                <div className="section-kicker">REGISTRO DA CONFERÊNCIA</div>
                <h2 id="delivery-inspection-title">Inspeção do equipamento</h2>
              </div>
              <span>{selectedDelivery.parts.length} itens verificados</span>
            </div>
            <div className="delivery-view-parts">
              {selectedDelivery.parts.map((part) => (
                <article
                  className={`delivery-view-part ${part.status === 'damaged' ? 'delivery-view-part-damaged' : ''}`}
                  key={part.id}
                >
                  {part.status === 'damaged' ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
                  <strong>{part.label}</strong>
                  <span className="delivery-view-status">{part.status === 'damaged' ? 'Danificado' : 'Sem danos'}</span>
                  {part.status === 'damaged' && <p>{part.note || 'Nenhuma observação registrada.'}</p>}
                </article>
              ))}
            </div>
          </section>
          <div className="delivery-readonly-notice">
            <ShieldCheck size={15} /> Registro histórico sincronizado
          </div>
          <LoanTermDocument delivery={selectedDelivery} />
        </section>
      ) : (
        <>
          <section className="history-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> CONTROLE DE ATIVOS</div>
              <h1>{personalEmail ? 'Minhas entregas' : 'Entregas realizadas'}</h1>
              <p>{personalEmail ? `Equipamentos entregues para ${personalName || personalEmail} e histórico de devoluções.` : 'Histórico completo de equipamentos entregues e devoluções ao hospital.'}</p>
            </div>
            {isAdmin && <button className="history-new-button" type="button" onClick={onNewDelivery}>
              <ClipboardList size={16} /> Nova conferência
            </button>}
          </section>

          {/* Cards de Métricas em 4 colunas */}
          <section className="history-metrics" aria-label="Resumo das entregas">
            <div className="history-metric">
              <span>TOTAL DE CONFERÊNCIAS</span>
              <strong>{deliveries.length}</strong>
            </div>
            <div className="history-metric metric-in-possession">
              <span>EM POSSE (COM RESPONSÁVEL)</span>
              <strong className="metric-possession-value">{inPossessionCount}</strong>
            </div>
            <div className="history-metric metric-returned">
              <span>DEVOLVIDOS AO HOSPITAL</span>
              <strong className="metric-returned-value">{returnedCount}</strong>
            </div>
            <div className="history-metric">
              <span>COM DANOS REGISTRADOS</span>
              <strong className={damagedDeliveries ? 'metric-warning' : ''}>{damagedDeliveries}</strong>
            </div>
          </section>

          <section className="history-content" aria-labelledby="history-list-title">
            <div className="history-tools">
              <div className="history-tools-title">
                <div className="section-kicker">REGISTROS</div>
                <h2 id="history-list-title">{personalEmail ? 'Minhas entregas' : 'Todas as entregas'} <span>{visibleDeliveries.length}</span></h2>
              </div>

              {/* Abas para separar Em posse vs Devolvidos */}
              <div className="history-status-tabs" role="tablist" aria-label="Filtrar por situação do equipamento">
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === 'all'}
                  className={`status-tab ${statusFilter === 'all' ? 'status-tab-active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  Todas ({deliveries.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === 'in_possession'}
                  className={`status-tab status-tab-possession ${statusFilter === 'in_possession' ? 'status-tab-active' : ''}`}
                  onClick={() => setStatusFilter('in_possession')}
                >
                  <Clock size={12} /> Em posse ({inPossessionCount})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === 'returned'}
                  className={`status-tab status-tab-returned ${statusFilter === 'returned' ? 'status-tab-active' : ''}`}
                  onClick={() => setStatusFilter('returned')}
                >
                  <CheckCircle2 size={12} /> Devolvidos ({returnedCount})
                </button>
              </div>

              <div className="history-controls">
                <label className="history-search">
                  <Search size={15} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por patrimônio, série ou pessoa"
                    aria-label="Buscar entregas"
                  />
                </label>
                <div className="history-filter" role="group" aria-label="Filtrar por danos">
                  <button type="button" className={damageFilter === 'all' ? 'filter-active' : ''} onClick={() => setDamageFilter('all')}>Todas</button>
                  <button type="button" className={damageFilter === 'damaged' ? 'filter-active' : ''} onClick={() => setDamageFilter('damaged')}>Com danos</button>
                  <button type="button" className={damageFilter === 'clear' ? 'filter-active' : ''} onClick={() => setDamageFilter('clear')}>Sem danos</button>
                </div>
              </div>
            </div>

            {deleteError && <p className="delete-error" role="alert">{deleteError}</p>}

            {visibleDeliveries.length ? (
              <div className="delivery-table-wrap">
                <table className="delivery-table">
                  <thead>
                    <tr>
                      <th>PROTOCOLO</th>
                      <th>EQUIPAMENTO</th>
                      <th>SITUAÇÃO</th>
                      <th>RESPONSÁVEL</th>
                      <th>DATA DA ENTREGA</th>
                      <th>CONDIÇÃO</th>
                      <th><span className="visually-hidden">Detalhes</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDeliveries.map((delivery) => {
                      const damageCount = getDeliveryDamageCount(delivery)
                      return (
                        <DeliveryRows
                          key={delivery.id}
                          delivery={delivery}
                          damageCount={damageCount}
                          onView={() => setSelectedDelivery(delivery)}
                          isAdmin={isAdmin}
                          deleting={deletingId === delivery.id}
                          onDelete={() => void deleteDelivery(delivery)}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="history-empty">
                {deliveries.length ? <Search size={22} /> : <ClipboardList size={22} />}
                <strong>
                  {!deliveries.length
                    ? 'Nenhuma entrega registrada'
                    : statusFilter === 'in_possession' && !inPossessionCount
                    ? 'Nenhum equipamento em posse no momento'
                    : statusFilter === 'returned' && !returnedCount
                    ? 'Nenhum equipamento devolvido ainda'
                    : 'Nenhuma entrega encontrada'}
                </strong>
                <p>
                  {!deliveries.length
                    ? 'As entregas concluídas aparecerão aqui.'
                    : statusFilter === 'in_possession' && !inPossessionCount
                    ? 'Todos os equipamentos entregues já foram devolvidos ao hospital.'
                    : statusFilter === 'returned' && !returnedCount
                    ? 'Quando uma conferência de devolução for realizada, o registro constará nesta lista.'
                    : 'Altere a busca ou os filtros para visualizar outros registros.'}
                </p>
                {!deliveries.length && isAdmin && <button type="button" onClick={onNewDelivery}>Iniciar uma conferência</button>}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="page-footer">
        <span>DONATO HOSPITAL DE OLHOS <span className="footer-dot">·</span> CONTROLE DE EQUIPAMENTOS</span>
      </footer>
    </main>
  )
}

type DeliveryRowsProps = {
  delivery: DeliveryRecord
  damageCount: number
  onView: () => void
  isAdmin: boolean
  deleting: boolean
  onDelete: () => void
}

function DeliveryRows({ delivery, damageCount, onView, isAdmin, deleting, onDelete }: DeliveryRowsProps) {
  const isReturned = isDeliveryReturned(delivery)
  const returnDate = delivery.returnedAt || delivery.returnInspection?.returnedAt

  return (
    <tr className={`delivery-row ${isReturned ? 'row-returned' : 'row-possession'}`}>
      <td data-label="Protocolo">
        <span className="table-primary">{delivery.protocol}</span>
        <span className="table-secondary">{delivery.assetTag}</span>
      </td>
      <td data-label="Equipamento">
        <span className="table-primary">{delivery.equipment}</span>
        <span className="table-secondary">Série {delivery.serialNumber}</span>
      </td>
      <td data-label="Situação">
        {isReturned ? (
          <span className="asset-status-badge badge-returned" title="Equipamento devolvido ao hospital">
            <CheckCircle2 size={12} /> Devolvido
          </span>
        ) : (
          <span className="asset-status-badge badge-possession" title={`Equipamento sob a responsabilidade de ${delivery.recipient}`}>
            <Clock size={12} /> Em posse
          </span>
        )}
      </td>
      <td data-label="Responsável">
        <span className="table-primary">{delivery.recipient}</span>
        <span className="table-secondary">{delivery.recipientEmail || 'E-mail não informado'}</span>
        <span className="table-secondary">Setor: {delivery.recipientDepartment || 'Não informado'}</span>
        {isReturned && returnDate && <span className="table-secondary">Devolvido em {dateFormatter.format(new Date(returnDate))}</span>}
      </td>
      <td data-label="Data da entrega">
        <span className="table-primary">{dateFormatter.format(new Date(delivery.deliveredAt))}</span>
      </td>
      <td data-label="Condição">
        {damageCount ? (
          <span className="delivery-condition has-recorded-damage">
            <CircleAlert size={14} /> {damageCount} {damageCount === 1 ? 'dano' : 'danos'}
          </span>
        ) : (
          <span className="delivery-condition no-recorded-damage">
            <CheckCircle2 size={14} /> Sem danos
          </span>
        )}
      </td>
      <td className="table-action-cell">
        <div className="table-actions">
          <button className="details-button" type="button" onClick={onView} aria-label={`Visualizar entrega ${delivery.protocol}`}>
            Visualizar <ArrowUpRight size={13} />
          </button>
          {isAdmin && (
            <button className="delete-button" type="button" onClick={onDelete} disabled={deleting} aria-label={`Excluir entrega ${delivery.protocol}`} title="Excluir entrega">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default DeliveriesPage
