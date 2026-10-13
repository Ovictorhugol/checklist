import type { SignatureRecord } from '../domain/signature'

export default function SignatureMark({ signature }: { signature?: SignatureRecord }) {
  const points = signature?.strokes.flat() ?? []
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const viewBox = points.length ? `${minX - 4} ${minY - 4} ${maxX - minX + 8} ${maxY - minY + 8}` : '0 0 1000 300'

  return <i className="loan-term-signature-mark">
    {signature && <svg viewBox={viewBox} role="img" aria-label={`Assinatura de ${signature.signerName}`} preserveAspectRatio="xMidYMax meet">
      {signature.strokes.map((stroke, index) => <polyline key={index} points={stroke.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#17212b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>}
  </i>
}
