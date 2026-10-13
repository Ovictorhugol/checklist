import { useEffect, useState } from 'react'
import { Mail, RotateCcw } from 'lucide-react'
import { apiGetDeliveryEmail, apiRetryDeliveryEmail, type DeliveryEmailState } from '../services/api'

export default function DeliveryEmailStatus({ deliveryId, eventType = 'delivery' }: { deliveryId: string; eventType?: 'delivery' | 'return' }) {
  const [state, setState] = useState<DeliveryEmailState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const value = await apiGetDeliveryEmail(deliveryId, eventType)
        if (!active) return
        setState(value)
        setError('')
        if (value.job?.status === 'pending' || value.job?.status === 'processing') timer = setTimeout(() => void load(), 10000)
      } catch (caught) { if (active) setError((caught as Error).message) }
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [deliveryId, eventType, busy])
  const job = state?.job
  const retry = async () => {
    if (busy) return
    if (job?.status === 'review' && !window.confirm('Confira os Itens Enviados da caixa remetente antes de continuar. Se o e-mail já tiver sido enviado, esta tentativa poderá enviar outra cópia. Deseja tentar novamente?')) return
    setBusy(true)
    setError('')
    try { await apiRetryDeliveryEmail(deliveryId, eventType) }
    catch (caught) { setError((caught as Error).message) }
    finally { setBusy(false) }
  }
  const labels = { pending: 'Aguardando envio', processing: 'Enviando termo', accepted: 'Encaminhado para envio', failed: 'Falha no envio', review: 'Envio precisa de verificação' }
  const termLabel = eventType === 'return' ? 'Devolução — Via do Requisitante' : 'Entrega — Termo de responsabilidade'
  return <aside className="delivery-email-status" aria-label={`Envio por e-mail: ${termLabel}`}>
    <Mail size={18} aria-hidden="true" />
    <div>
      <strong>{termLabel}: {job ? labels[job.status] : state ? 'Sem envio programado' : 'Consultando envio do termo...'}</strong>
      {job && <p>Cópia do termo assinado para {job.recipientEmail}.</p>}
      {state && !state.enabled && <p>O envio automático está desativado.</p>}
      {job?.lastError && <p>{job.lastError}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    {state?.enabled && job && ['failed', 'review'].includes(job.status) && <button type="button" disabled={busy} onClick={() => void retry()}><RotateCcw size={14} />{busy ? 'Programando...' : 'Tentar envio novamente'}</button>}
  </aside>
}
