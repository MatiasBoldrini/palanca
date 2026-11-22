import { Check, ChevronDown, Layers2, ScanLine } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'

type Mode = 'anatomy' | 'diagram'
type Layer = 'muscles' | 'skeleton'

interface Props {
  mode: Mode
  onMode: (mode: Mode) => void
  layer: Layer
  onLayer: (layer: Layer) => void
  editingBody: boolean
  onEdit: () => void
  canEdit: boolean
  children?: ReactNode
}

export function ViewerToolbar({
  mode,
  onMode,
  layer,
  onLayer,
  editingBody,
  onEdit,
  canEdit,
  children,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const layersButton = useRef<HTMLButtonElement>(null)
  const panel = useId()
  const canShowLayers = mode === 'anatomy' || !!children
  return (
    <div
      className="viewer-tools"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          setExpanded(false)
          layersButton.current?.focus()
        }
      }}
    >
      <div className="viewer-tool-row">
        <div className="render-mode" role="group" aria-label="Representación">
          {(['anatomy', 'diagram'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-label={value === 'anatomy' ? 'Anatomía 3D' : 'Diagrama 2D'}
              aria-pressed={mode === value}
              onClick={() => {
                if (mode !== value) onMode(value)
                setExpanded(false)
              }}
            >
              <span className="mode-name">{value === 'anatomy' ? 'Anatomía ' : 'Diagrama '}</span>
              {value === 'anatomy' ? '3D' : '2D'}
            </button>
          ))}
        </div>
        <div className="viewer-tool-actions">
          {canShowLayers && (
            <button
              ref={layersButton}
              type="button"
              aria-expanded={expanded}
              aria-controls={panel}
              onClick={() => setExpanded(!expanded)}
            >
              <Layers2 size={16} aria-hidden />
              Capas
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="edit-tool"
              aria-label="Ajustar cuerpo"
              aria-pressed={editingBody}
              onClick={() => {
                setExpanded(false)
                onEdit()
              }}
            >
              {editingBody ? <Check size={16} aria-hidden /> : <ScanLine size={16} aria-hidden />}
              {editingBody ? 'Listo' : 'Ajustar cuerpo'}
            </button>
          )}
        </div>
      </div>
      {canShowLayers && (
        <div className="viewer-layer-panel" id={panel} hidden={!expanded}>
          {mode === 'anatomy' && (
            <label className="tissue-picker">
              Anatomía
              <span>
                <select
                  value={layer}
                  aria-label="Capa anatómica"
                  onChange={(event) => onLayer(event.target.value as Layer)}
                >
                  <option value="muscles">Músculos</option>
                  <option value="skeleton">Esqueleto</option>
                </select>
                <ChevronDown size={14} aria-hidden />
              </span>
            </label>
          )}
          {children}
        </div>
      )}
    </div>
  )
}
