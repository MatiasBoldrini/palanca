import { ChevronDown, Minus, Orbit, Plus } from 'lucide-react'
import { ControlDisclosure } from './ControlDisclosure'

interface Props<View extends string> {
  views: Record<View, { label: string }>
  view: View | 'free'
  zoom: number
  maxZoom: number
  onView: (view: View) => void
  onZoom: (factor: number) => void
}

export function CameraMenu<View extends string>({
  views,
  view,
  zoom,
  maxZoom,
  onView,
  onZoom,
}: Props<View>) {
  return (
    <ControlDisclosure
      className="camera-menu"
      label="Cámara"
      trigger={
        <>
          <Orbit size={16} aria-hidden />
          Cámara
        </>
      }
    >
      {() => (
        <div className="anatomy-camera" role="group" aria-label="Controles de cámara">
          <label className="anatomy-camera-view">
            <select
              aria-label="Vista de cámara"
              value={view}
              onChange={(event) => onView(event.target.value as View)}
            >
              {(Object.keys(views) as View[]).map((key) => (
                <option key={key} value={key}>
                  {views[key].label}
                </option>
              ))}
              {view === 'free' && (
                <option value="free" disabled>
                  Libre
                </option>
              )}
            </select>
            <ChevronDown size={12} aria-hidden />
          </label>
          <span className="anatomy-camera-rule" />
          <button
            type="button"
            aria-label="Alejar modelo"
            disabled={zoom <= 0.801}
            onClick={() => onZoom(1 / 1.22)}
          >
            <Minus size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Acercar modelo"
            disabled={zoom >= maxZoom - 0.001}
            onClick={() => onZoom(1.22)}
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>
      )}
    </ControlDisclosure>
  )
}
