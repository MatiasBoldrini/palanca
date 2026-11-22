import { ChevronDown, Minus, Orbit, Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from 'three'
import { createAnatomicalBody, type AnatomyLayer } from '../anatomy/body'
import {
  BENCH_CAMERAS,
  createBenchStudio,
  type BenchView,
  type BenchEditorProps,
} from '../anatomy/benchStudio'
import { BenchAnnotations, type BenchMechanicsProps, type BenchProjection } from './BenchAnnotations'
import './anatomyViewer.css'
import '../anatomy/mechanicsDrawing.css'
import './benchViewer.css'

interface Props extends BenchMechanicsProps, BenchEditorProps {
  editForces?: boolean
  layer: AnatomyLayer
  onUnavailable: () => void
}

export function BenchViewer(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  const studio = useRef<ReturnType<typeof createBenchStudio> | null>(null)
  const [projection, setProjection] = useState<BenchProjection | null>(null)
  const [view, setView] = useState<BenchView | 'free'>('oblique')
  const [zoom, setZoom] = useState(1)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const previous = latest.current
    latest.current = props
    const before = previous.frame.segments
    const after = props.frame.segments
    const resized = (Object.keys(after) as (keyof typeof after)[]).some(
      (key) => before[key] !== after[key],
    )
    if (resized) studio.current?.refit()
    else studio.current?.draw()
  }, [props])
  useEffect(() => {
    const el = host.current
    if (!el) return
    let live = true,
      renderer: WebGLRenderer | undefined
    const fail = (e?: Event) => {
      e?.preventDefault()
      if (live) latest.current.onUnavailable()
    }
    const tick = requestAnimationFrame(async () => {
      try {
        renderer = new WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5))
        renderer.outputColorSpace = SRGBColorSpace
        renderer.toneMapping = ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.02
        const canvas = renderer.domElement
        canvas.tabIndex = 0
        canvas.setAttribute('role', 'img')
        canvas.setAttribute(
          'aria-label',
          'Press de banca en tres dimensiones. Usá las flechas para girar, más y menos para acercar o alejar, e Inicio para restablecer la cámara.',
        )
        canvas.addEventListener('webglcontextlost', fail)
        el.appendChild(canvas)
        const runtime = createBenchStudio(
          renderer,
          el,
          () => latest.current,
          (projection, view, zoom) => {
            if (live) {
              setProjection(projection)
              setView(view)
              setZoom(zoom)
            }
          },
        )
        studio.current = runtime
        const body = await createAnatomicalBody()
        if (!live) {
          body.dispose()
          return
        }
        runtime.setBody(body)
        setReady(true)
      } catch {
        fail()
      }
    })
    return () => {
      live = false
      cancelAnimationFrame(tick)
      studio.current?.dispose()
      studio.current = null
      if (renderer) {
        renderer.domElement.removeEventListener('webglcontextlost', fail)
        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
      }
    }
  }, [])
  return (
    <div className="anatomy-viewer bench-viewer">
      <div className="anatomy-surface" ref={host} />
      <div className="bench-label-surface">
        {ready && projection && (!props.editingBody || props.editForces) && (
          <BenchAnnotations
            {...props}
            projection={projection}
            vectorsOnly={props.editingBody}
            showForces={props.editingBody ? true : props.showForces}
          />
        )}
      </div>
      {!ready && (
        <p className="anatomy-loading" role="status">
          Cargando anatomía…
        </p>
      )}
      {ready && (
        <div className="anatomy-camera" role="group" aria-label="Controles de cámara">
          <label className="anatomy-camera-view">
            <Orbit size={15} aria-hidden />
            <select
              aria-label="Vista de cámara"
              value={view}
              onChange={(event) => studio.current?.setView(event.target.value as BenchView)}
            >
              {Object.entries(BENCH_CAMERAS).map(([key, camera]) => (
                <option key={key} value={key}>
                  {camera.label}
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
            aria-label="Alejar modelo"
            disabled={zoom <= 0.801}
            onClick={() => studio.current?.zoom(1 / 1.22)}
          >
            <Minus size={15} aria-hidden />
          </button>
          <button
            aria-label="Acercar modelo"
            disabled={zoom >= 2.439}
            onClick={() => studio.current?.zoom(1.22)}
          >
            <Plus size={15} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
export default BenchViewer
