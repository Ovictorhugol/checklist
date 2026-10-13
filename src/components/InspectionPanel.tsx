import { Check, CheckCircle2, CircleAlert } from 'lucide-react'
import { statusText, type EquipmentPart, type InspectionStatus } from '../domain/inspection'

type InspectionPanelProps = {
  parts: EquipmentPart[]
  selectedPart: EquipmentPart | undefined
  selectedPartId: string | null
  inspectedCount: number
  onSelectPart: (partId: string) => void
  onInspectPart: (status: Exclude<InspectionStatus, 'pending'>) => void
  onUpdateNote: (note: string) => void
}

function InspectionPanel({
  parts,
  selectedPart,
  selectedPartId,
  inspectedCount,
  onSelectPart,
  onInspectPart,
  onUpdateNote,
}: InspectionPanelProps) {
  return (
    <aside className="inspection-panel">
      <div className="panel-header">
        <div>
          <div className="section-kicker">CHECKLIST VISUAL</div>
          <h2>Inspeção física</h2>
        </div>
        <div className="progress-ring" aria-label={`${inspectedCount} de ${parts.length} peças verificadas`}>
          <span>{inspectedCount}<small>/{parts.length}</small></span>
        </div>
      </div>

      <div className="progress-track"><span style={{ width: `${(inspectedCount / parts.length) * 100}%` }} /></div>
      <div className="part-list" role="list" aria-label="Peças do equipamento">
        {parts.map((part, index) => (
          <button
            key={part.id}
            type="button"
            className={`part-row ${selectedPartId === part.id ? 'is-selected' : ''} ${part.status === 'damaged' ? 'has-damage' : ''}`}
            onClick={() => onSelectPart(part.id)}
            aria-pressed={selectedPartId === part.id}
          >
            <span className={`part-index ${part.status === 'ok' ? 'index-ok' : ''} ${part.status === 'damaged' ? 'index-damaged' : ''}`}>
              {part.status === 'ok' ? <Check size={13} /> : part.status === 'damaged' ? <CircleAlert size={13} /> : String(index + 1).padStart(2, '0')}
            </span>
            <span className="part-copy"><strong>{part.label}</strong><small>{part.detail}</small></span>
            <span className={`part-status status-${part.status}`}>{statusText[part.status]}</span>
          </button>
        ))}
      </div>

      {selectedPart ? <div className="part-inspector">
        <div className="inspector-heading">
          <div><span className="inspector-label">PEÇA SELECIONADA</span><h3>{selectedPart.label}</h3></div>
          <span className={`inspector-status status-${selectedPart.status}`}><i />{statusText[selectedPart.status]}</span>
        </div>
        <div className="condition-actions" aria-label="Condição da peça">
          <button type="button" className={`condition-button ${selectedPart.status === 'ok' ? 'condition-active-ok' : ''}`} onClick={() => onInspectPart('ok')}>
            <CheckCircle2 size={16} /> Sem danos
          </button>
          <button type="button" className={`condition-button ${selectedPart.status === 'damaged' ? 'condition-active-damaged' : ''}`} onClick={() => onInspectPart('damaged')}>
            <CircleAlert size={16} /> Danificado
          </button>
        </div>
        {selectedPart.status === 'damaged' && (
          <label className="note-field">
            <span>Observação do dano</span>
            <textarea value={selectedPart.note} onChange={(event) => onUpdateNote(event.target.value)} placeholder="Descreva o dano observado..." rows={2} />
          </label>
        )}
      </div> : <p className="completion-hint">Selecione uma peça para inspecionar.</p>}
    </aside>
  )
}

export default InspectionPanel
