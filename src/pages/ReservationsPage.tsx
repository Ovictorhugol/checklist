import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { equipmentCatalog } from '../domain/inspection'
import type { NewReservation, ReservationRecord, ReservationStatus } from '../domain/reservation'
import { apiCreateReservation, apiGetReservations, apiUpdateReservation } from '../services/api'
import '../styles/ReservationsPage.css'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`))
const statusLabels: Record<ReservationStatus, string> = { pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada' }

export default function ReservationsPage({ isAdmin, userName, userEmail, onStartInspection }: { isAdmin: boolean; userName: string | null; userEmail: string; onStartInspection: (reservation: ReservationRecord) => void }) {
  const [records, setRecords] = useState<ReservationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | ''>('')
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [form, setForm] = useState<NewReservation>({ equipment: equipmentCatalog[0].apiName, requesterName: userName || '', department: '', purpose: '', startDate: today(), endDate: today() })

  useEffect(() => {
    let active = true
    void apiGetReservations().then(
      (data) => { if (active) { setRecords(data); setLoading(false); setError('') } },
      (caught: Error) => { if (active) { setError(caught.message); setLoading(false) } },
    )
    return () => { active = false }
  }, [reload])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving.current || loading) return
    saving.current = true
    setBusy(true); setError(''); setSuccess('')
    try {
      const record = await apiCreateReservation(form)
      setRecords((current) => [record, ...current])
      setSuccess('Solicitação enviada. Aguarde a análise do administrador.')
      setForm((current) => ({ ...current, purpose: '' }))
      setStatusFilter(''); setSearch('')
    } catch (caught) { setError((caught as Error).message) }
    finally { saving.current = false; setBusy(false) }
  }

  const update = async (record: ReservationRecord, status: Exclude<ReservationStatus, 'pendente'>) => {
    if (saving.current || loading) return
    saving.current = true
    setBusy(true); setError(''); setSuccess('')
    try {
      const saved = await apiUpdateReservation(record.id, status, status === 'cancelada' ? '' : notes[record.id] || '')
      setRecords((current) => current.map((item) => item.id === saved.id ? saved : item))
      setSuccess(`Solicitação ${statusLabels[saved.status].toLowerCase()}.`)
      if (status === 'aprovada' && window.confirm('Reserva aprovada. Deseja iniciar a conferência do equipamento solicitado agora?')) onStartInspection(saved)
    } catch (caught) { setError((caught as Error).message) }
    finally { saving.current = false; setBusy(false) }
  }

  const visible = records.filter((record) => (!statusFilter || record.status === statusFilter) &&
    `${record.requesterName} ${record.requesterEmail} ${record.department} ${record.equipment} ${record.deliveryProtocol || ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  const equipmentName = (value: string) => equipmentCatalog.find((item) => item.apiName === value)?.name || value
  const field = (key: keyof NewReservation, value: string) => setForm((current) => ({ ...current, [key]: value }))

  return <main className="reservations-page">
    <header className="reservations-heading">
      <div><div className="eyebrow"><span className="eyebrow-dot" /> RESERVA DE EQUIPAMENTOS</div><h1>{isAdmin ? 'Solicitações de reserva' : 'Minhas reservas'}</h1><p>{isAdmin ? 'Analise as solicitações de todos os usuários.' : 'Solicite um equipamento e acompanhe a aprovação.'}</p></div>
      <button type="button" disabled={loading || busy} onClick={() => { setLoading(true); setReload((value) => value + 1) }}><RefreshCw size={16} /> Atualizar</button>
    </header>
    {error && <p className="reservations-error" role="alert">{error}</p>}
    {success && <p className="reservations-success" role="status">{success}</p>}
    {!isAdmin && <section className="reservation-form-card" aria-labelledby="reservation-form-title">
      <h2 id="reservation-form-title"><CalendarDays size={19} /> Nova reserva</h2>
      <p>A solicitação fica pendente até a análise do administrador. A retirada exige conferência e assinatura.</p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy || loading}>
          <div className="reservation-fields">
            <label>Equipamento<select aria-label="Equipamento" value={form.equipment} onChange={(event) => field('equipment', event.target.value)}>{equipmentCatalog.map((item) => <option key={item.id} value={item.apiName}>{item.name}</option>)}</select></label>
            <label>Nome do solicitante<input required maxLength={160} autoComplete="name" value={form.requesterName} onChange={(event) => field('requesterName', event.target.value)} /></label>
            <label>E-mail da conta<input value={userEmail} readOnly type="email" /></label>
            <label>Setor<input required maxLength={160} value={form.department} onChange={(event) => field('department', event.target.value)} /></label>
            <label>Início do uso<input required type="date" min={today()} value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value, endDate: current.endDate < event.target.value ? event.target.value : current.endDate }))} /></label>
            <label>Fim do uso<input required type="date" min={form.startDate || today()} value={form.endDate} onChange={(event) => field('endDate', event.target.value)} /></label>
            <label className="reservation-purpose">Finalidade / observações<textarea required maxLength={2000} rows={3} value={form.purpose} onChange={(event) => field('purpose', event.target.value)} placeholder="Descreva para que precisa do equipamento." /></label>
          </div>
          <div className="reservation-form-actions"><button type="submit" className="reservation-primary">{busy ? 'Salvando...' : 'Solicitar reserva'}</button></div>
        </fieldset>
      </form>
    </section>}
    <section className="reservation-list" aria-labelledby="reservation-list-title">
      <div className="reservation-list-heading"><h2 id="reservation-list-title">{isAdmin ? 'Todas as solicitações' : 'Minhas solicitações'} ({records.length})</h2><div className="reservation-filters">
        <input type="search" aria-label="Buscar solicitações" placeholder="Buscar solicitante ou equipamento" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filtrar situação" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ReservationStatus | '')}><option value="">Todas as situações</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div></div>
      {loading ? <p role="status">Carregando solicitações...</p> : !visible.length ? <p className="reservation-empty">Nenhuma solicitação encontrada.</p> : visible.map((record) => <article className="reservation-record" key={record.id}>
        <header><h3>{equipmentName(record.equipment)}</h3><span className={`reservation-status reservation-status-${record.status}`}>{statusLabels[record.status]}</span></header>
        <dl><div><dt>Solicitante</dt><dd>{record.requesterName}<small>{record.requesterEmail}</small></dd></div><div><dt>Setor</dt><dd>{record.department}</dd></div><div><dt>Período de uso</dt><dd>{formatDate(record.startDate)} a {formatDate(record.endDate)}</dd></div><div><dt>Solicitada em</dt><dd>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(record.createdAt))}</dd></div></dl>
        <p className="reservation-description">{record.purpose}</p>
        {record.deliveryProtocol && <p className="reservation-delivery"><strong>Protocolo de entrega:</strong> {record.deliveryProtocol}</p>}
        {record.status === 'recusada' && <p className="reservation-reason"><strong>Justificativa da recusa:</strong> {record.reviewNote || 'Justificativa não registrada.'}</p>}
        {record.reviewedBy && <p className="reservation-review">Atualizada por {record.reviewedBy}{record.status !== 'recusada' && record.reviewNote && `: ${record.reviewNote}`}</p>}
        {isAdmin && record.status === 'pendente' && <label className="reservation-note">Justificativa / observação da análise<textarea rows={2} maxLength={1000} disabled={busy || loading} value={notes[record.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [record.id]: event.target.value }))} /><small>Obrigatória para recusar. Será exibida ao solicitante.</small></label>}
        <div className="reservation-actions">
          {isAdmin && record.status === 'pendente' && <><button type="button" className="reservation-primary" disabled={busy || loading} onClick={() => void update(record, 'aprovada')}>Aprovar</button><button type="button" disabled={busy || loading || !notes[record.id]?.trim()} onClick={() => void update(record, 'recusada')}>Recusar</button></>}
          {isAdmin && record.status === 'aprovada' && !record.deliveryId && <button type="button" className="reservation-primary" disabled={busy || loading} onClick={() => onStartInspection(record)}>Iniciar conferência</button>}
          {!record.deliveryId && (record.status === 'pendente' || record.status === 'aprovada') && (!isAdmin || record.requesterEmail === userEmail.toLowerCase()) && <button type="button" disabled={busy || loading} onClick={() => void update(record, 'cancelada')}>Cancelar solicitação</button>}
        </div>
      </article>)}
    </section>
  </main>
}
