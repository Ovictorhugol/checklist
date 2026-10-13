import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { SignatureInput, SignaturePoint } from '../domain/signature'
import '../styles/SignatureDialog.css'

type Props = {
  title: string
  signerName: string
  editableName?: boolean
  children: ReactNode
  onCancel: () => void
  onConfirm: (signature: SignatureInput) => Promise<void>
}

export default function SignatureDialog({ title, signerName, editableName = false, children, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<SignaturePoint[][]>([])
  const pointerRef = useRef<number | null>(null)
  const distanceRef = useRef(0)
  const [name, setName] = useState(signerName)
  const [hasSignature, setHasSignature] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('input, button')?.focus()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = oldOverflow; previous?.focus() }
  }, [])

  const pointFrom = (event: PointerEvent<HTMLCanvasElement>): SignaturePoint => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.round(Math.max(0, Math.min(1000, (event.clientX - bounds.left) * 1000 / bounds.width))), y: Math.round(Math.max(0, Math.min(300, (event.clientY - bounds.top) * 300 / bounds.height))) }
  }
  const beginStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy || pointerRef.current !== null || event.button !== 0 || strokesRef.current.length >= 64) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerRef.current = event.pointerId
    strokesRef.current.push([pointFrom(event)])
    setError('')
  }
  const drawStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy || pointerRef.current !== event.pointerId) return
    const stroke = strokesRef.current[strokesRef.current.length - 1]
    const previous = stroke[stroke.length - 1]
    const point = pointFrom(event)
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    if (distance < 1) return
    if (strokesRef.current.reduce((total, item) => total + item.length, 0) >= 2000) {
      setError('A assinatura está muito extensa. Limpe e assine novamente.')
      return
    }
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    context.lineWidth = 3
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#17212b'
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.lineTo(point.x, point.y)
    context.stroke()
    stroke.push(point)
    distanceRef.current += distance
    if (distanceRef.current >= 30) setHasSignature(true)
  }
  const endStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== event.pointerId) return
    const last = strokesRef.current[strokesRef.current.length - 1]
    if (last.length < 2) strokesRef.current.pop()
    pointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const clear = () => {
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, 1000, 300)
    strokesRef.current = []
    distanceRef.current = 0
    pointerRef.current = null
    setHasSignature(false)
    setAccepted(false)
    setError('')
  }
  const submit = async () => {
    if (busy || !hasSignature || !accepted || !name.trim() || pointerRef.current !== null) return
    setBusy(true)
    setError('')
    try {
      await onConfirm({ signerName: name.trim(), strokes: strokesRef.current.filter((stroke) => stroke.length > 1).map((stroke) => stroke.map((point) => ({ ...point }))) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar. Sua assinatura foi mantida para tentar novamente.')
    } finally { setBusy(false) }
  }

  return <div className="signature-overlay">
    <div ref={dialogRef} className="signature-dialog" role="dialog" aria-modal="true" aria-labelledby="signature-title" onKeyDown={(event) => {
      if (event.key === 'Escape' && !busy) { event.stopPropagation(); onCancel() }
      if (event.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <h2 id="signature-title">{title}</h2>
      <p>Confira os dados abaixo e assine com o mouse. O registro será concluído após confirmar a assinatura.</p>
      <div className="signature-summary">{children}</div>
      <label className="signature-name">Nome de quem assina<input value={name} readOnly={!editableName} disabled={busy} maxLength={160} onChange={(event) => setName(event.target.value)} /></label>
      <div className="signature-canvas-wrap">
        <canvas ref={canvasRef} width={1000} height={300} aria-label="Área para desenhar a assinatura com o mouse" onPointerDown={beginStroke} onPointerMove={drawStroke} onPointerUp={endStroke} onPointerCancel={endStroke} onLostPointerCapture={endStroke} />
        {!hasSignature && <span className="signature-hint">Desenhe sua assinatura aqui</span>}
      </div>
      <button className="signature-clear" type="button" disabled={busy} onClick={clear}>Limpar assinatura</button>
      <label className="signature-consent"><input type="checkbox" checked={accepted} disabled={busy} onChange={(event) => setAccepted(event.target.checked)} />Confirmo os dados e as condições da conferência apresentados acima e autorizo o registro desta assinatura.</label>
      {error && <p className="signature-error" role="alert">{error}</p>}
      <div className="signature-actions">
        <button type="button" disabled={busy} onClick={onCancel}>Voltar à conferência</button>
        <button className="signature-confirm" type="button" disabled={busy || !hasSignature || !accepted || !name.trim()} onClick={() => void submit()}>{busy ? 'Salvando...' : 'Assinar e finalizar'}</button>
      </div>
    </div>
  </div>
}
