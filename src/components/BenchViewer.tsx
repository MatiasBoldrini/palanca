import { CameraMenu } from './CameraMenu'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from 'three'
import { createAnatomicalBody, type AnatomyLayer } from '../anatomy/body'
import {
  BENCH_CAMERAS,
  createBenchStudio,
  type BenchView,
  type BenchEditorProps,
} from '../anatomy/benchStudio'
import {
  BenchAnnotations,
  type BenchMechanicsProps,
  type BenchProjection,
} from './BenchAnnotations'
import './anatomyViewer.css'
import '../anatomy/mechanicsDrawing.css'
import './benchViewer.css'

interface Props extends BenchMechanicsProps, BenchEditorProps {
  analyzing?: boolean
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
    if (
      resized ||
      previous.analyzing !== props.analyzing ||
      previous.editingBody !== props.editingBody
    )
      studio.current?.refit()
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
    <div
      className={
        'anatomy-viewer bench-viewer' +
        (props.analyzing === false ? ' movement-view' : '') +
        (props.editingBody ? ' editing-body' : '') +
        (props.editForces && props.editingBody ? ' edit-forces' : '')
      }
    >
      <div className="anatomy-surface" ref={host} />
      <div className="bench-label-surface">
        {ready &&
          projection &&
          (props.editingBody ? props.editForces : props.analyzing !== false) && (
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
        <CameraMenu<BenchView>
          views={BENCH_CAMERAS}
          view={view}
          zoom={zoom}
          maxZoom={2.44}
          onView={(key) => studio.current?.setView(key)}
          onZoom={(factor) => studio.current?.zoom(factor)}
        />
      )}
    </div>
  )
}
export default BenchViewer
