import { ChevronDown } from 'lucide-react'
import { type ForceFocus, formatForce } from '../model/mechanicsOverlay'

const focusLabels: { id: ForceFocus; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'bar', label: '↓ Barra' },
  { id: 'body', label: '↓ Cuerpo' },
  { id: 'support', label: '↑ Apoyos' },
]

interface Props {
  focus: ForceFocus
  onFocus: (focus: ForceFocus) => void
  loadPath: boolean
  feetReaction: number
  benchReaction?: number
}

/** Fractions here are of the total upward support, including the lifter's body weight. */
export function ForceReadingGuide({
  loadPath,
  feetReaction,
  benchReaction,
  focus,
  onFocus,
}: Props) {
  const total = feetReaction + (benchReaction ?? 0)
  const isBench = benchReaction !== undefined
  const firstShare = isBench && total > 0 ? benchReaction / total : 0.5
  const percent = Math.round(100 * firstShare)
  const left = isBench ? 'Banco' : 'Pie izquierdo'
  const right = isBench ? 'Ambos pies' : 'Pie derecho'
  return (
    <details className="force-disclosure">
      <summary>
        Leer las fuerzas
        {focus !== 'all' && <span>{focusLabels.find((option) => option.id === focus)?.label}</span>}
        <ChevronDown size={16} aria-hidden />
      </summary>
      <div className="force-reading-guide" aria-label="Cómo leer las fuerzas">
        <div className="force-guide-controls">
          <div className="force-key">
            <svg viewBox="0 0 45 15" width="44" height="15" aria-hidden="true">
              <circle cx="5" cy="7.5" r="3.2" />
              <path d="M9 7.5H40" />
              <path className="key-tip" d="M31 2L43 7.5L31 13Z" />
            </svg>
            <span>Del punto de aplicación a la punta de la flecha.</span>
          </div>
          <div className="force-filter" role="group" aria-label="Aislar una fuerza">
            {focusLabels.map((option) => (
              <button
                type="button"
                key={option.id}
                aria-pressed={focus === option.id}
                onClick={() => onFocus(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {loadPath && (
          <div className="support-split" role="group" aria-label="Reparto entre los apoyos">
            <div className="support-split-title">
              <strong>Reparto del apoyo</strong>
              <span>↑ {formatForce(total)} en total</span>
            </div>
            <div className="support-meter" aria-hidden="true">
              <span style={{ width: 100 * firstShare + '%' }} />
            </div>
            <div className="support-split-labels">
              <span>
                {left} <b>{percent} %</b>
              </span>
              <span>
                {right} <b>{100 - percent} %</b>
              </span>
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
