import { Check, ChevronDown, ScanLine, SlidersHorizontal } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { ControlDisclosure } from './ControlDisclosure'
import './minimalControls.css'

type Layer = 'muscles' | 'skeleton'

interface Props {
  load: number
  layer: Layer
  onLayer: (layer: Layer) => void
  editingBody: boolean
  onSettings: () => void
  onEdit: () => void
  children?: ReactNode
}

export function ViewerToolbar({
  load,
  layer,
  onLayer,
  editingBody,
  onEdit,
  onSettings,
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
              <SlidersHorizontal size={16} aria-hidden /> <span>Herramientas</span>
            </>
          }
        >
          {(close) => (
            <>
              <button
                className="view-option-row tool-load"
                type="button"
                aria-haspopup="dialog"
                aria-label={`Ajustar carga de la barra, ${load} kg`}
                onClick={() => {
                  close()
                  onSettings()
                  requestAnimationFrame(() => document.getElementById('settings-load')?.focus())
                }}
              >
                Carga de la barra <span>{load.toLocaleString('es-AR')} kg</span>
              </button>
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
