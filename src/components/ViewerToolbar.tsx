import { Check, ChevronDown, ScanLine, SlidersHorizontal } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { ControlDisclosure } from './ControlDisclosure'
import './minimalControls.css'

type Mode = 'anatomy' | 'diagram'
type Layer = 'muscles' | 'skeleton'

interface Props {
  mode: Mode
  onMode: (mode: Mode) => void
  layer: Layer
  onLayer: (layer: Layer) => void
  editingBody: boolean
  onSettings: () => void
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
  onSettings,
  canEdit,
  children,
}: Props) {
  const action = useRef<HTMLDivElement>(null)
  function toggleEditor() {
    onEdit()
    requestAnimationFrame(() =>
      action.current
        ?.querySelector<HTMLElement>('summary, .body-edit-done')
        ?.focus({ preventScroll: true }),
    )
  }

  return (
    <div ref={action} className="viewer-toolbox">
      {editingBody ? (
        <button
          className="body-edit-done"
          type="button"
          aria-label="Terminar ajuste"
          onClick={toggleEditor}
        >
          <Check size={16} aria-hidden /> <span className="edit-done-full">Terminar ajuste</span>
          <span className="edit-done-short">Listo</span>
        </button>
      ) : (
        <ControlDisclosure
          className="view-options"
          label="Herramientas"
          trigger={
            <>
              Herramientas <ChevronDown size={14} aria-hidden />
            </>
          }
        >
          {(close) => (
            <>
              <label className="view-option-row">
                Vista
                <span className="view-select">
                  <select
                    value={mode}
                    aria-label="Representación"
                    onChange={(e) => {
                      onMode(e.target.value as Mode)
                      close()
                    }}
                  >
                    <option value="anatomy">Anatomía 3D</option>
                    <option value="diagram">Diagrama 2D</option>
                  </select>
                  <ChevronDown size={14} aria-hidden />
                </span>
              </label>
              {mode === 'anatomy' && (
                <label className="view-option-row">
                  Anatomía
                  <span className="view-select">
                    <select
                      value={layer}
                      aria-label="Capa anatómica"
                      onChange={(e) => {
                        onLayer(e.target.value as Layer)
                        close()
                      }}
                    >
                      <option value="muscles">Músculos</option>
                      <option value="skeleton">Esqueleto</option>
                    </select>
                    <ChevronDown size={14} aria-hidden />
                  </span>
                </label>
              )}
              {canEdit && (
                <button
                  className="edit-body-action"
                  type="button"
                  onClick={() => {
                    close()
                    toggleEditor()
                  }}
                >
                  <ScanLine size={16} aria-hidden /> Ajustar cuerpo
                </button>
              )}
              <button
                className="edit-body-action"
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  close()
                  onSettings()
                }}
              >
                <SlidersHorizontal size={16} aria-hidden /> Ajustes
              </button>
              {children}
            </>
          )}
        </ControlDisclosure>
      )}
    </div>
  )
}
