import { ChevronDown, Minus, Orbit, Plus } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createAnatomicalBody, type MuscleId } from '../anatomy/body'
import type { Anthropometry } from '../model/anthropometry'
import type { Vec2 } from '../model/geometry'
import type { Bounds, ExerciseId, Frame, Task } from '../model/lift'
import type { Posture } from '../model/posture'
import './anatomyViewer.css'

interface Props {
  frame: Frame
  anthro: Anthropometry
  exercise: ExerciseId
  task: Task
  playing?: boolean
  bounds?: Bounds
  postures?: readonly Posture[]
  layer: 'muscles' | 'skeleton'
  selectedMuscle: MuscleId | null
  onSelectMuscle: (id: MuscleId | null) => void
  onUnavailable: () => void
}

const VIEWS = {
  oblique: { name: 'Tres cuartos', yaw: 38, elevation: 11 },
  front: { name: 'Anterior', yaw: 90, elevation: 6 },
  rear: { name: 'Posterior', yaw: -90, elevation: 6 },
  side: { name: 'Perfil', yaw: 0, elevation: 3 },
} as const
type View = keyof typeof VIEWS
type Body = Awaited<ReturnType<typeof createAnatomicalBody>>
const radians = THREE.MathUtils.degToRad

function studioFloor() {
  // Lines fade before the edge of the finite floor. Each square is 20 cm.
  const positions: number[] = []
  const colors: number[] = []
  const ink = new THREE.Color('#81796b')
  function vertex(x: number, z: number, major: boolean) {
    positions.push(x, -0.006, z)
    const fade = Math.max(0, 1 - Math.hypot(x, z) / 1.65)
    colors.push(ink.r, ink.g, ink.b, fade * (major ? 0.31 : 0.2))
  }
  for (let line = -8; line <= 8; line++) {
    for (let step = -8; step < 8; step++) {
      const at = line * 0.2
      const a = step * 0.2
      const b = (step + 1) * 0.2
      const major = line % 5 === 0
      vertex(at, a, major)
      vertex(at, b, major)
      vertex(a, at, major)
      vertex(b, at, major)
    }
  }
  const gridGeometry = new THREE.BufferGeometry()
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  gridGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  const gridMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const root = new THREE.Group()
  root.add(new THREE.LineSegments(gridGeometry, gridMaterial))

  const pixels = 48
  const alpha = new Uint8Array(pixels * pixels * 4)
  for (let i = 0; i < pixels * pixels; i++) {
    const x = (((i % pixels) + 0.5) / pixels - 0.5) * 2
    const z = ((Math.floor(i / pixels) + 0.5) / pixels - 0.5) * 2
    alpha.set([255, 255, 255, 255 * Math.max(0, 1 - x * x - z * z) ** 3], i * 4)
  }
  const shadowMap = new THREE.DataTexture(alpha, pixels, pixels)
  shadowMap.magFilter = THREE.LinearFilter
  shadowMap.minFilter = THREE.LinearFilter
  shadowMap.needsUpdate = true
  const shadowGeometry = new THREE.PlaneGeometry().rotateX(-Math.PI / 2)
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: '#544b3d',
    map: shadowMap,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    toneMapped: false,
  })
  const shadows = Array.from({ length: 3 }, () => new THREE.Mesh(shadowGeometry, shadowMaterial))
  root.add(...shadows)
  const receiverMaterial = new THREE.ShadowMaterial({
    color: '#554f45',
    opacity: 0.12,
    depthWrite: false,
  })
  const receiver = new THREE.Mesh(shadowGeometry, receiverMaterial)
  receiver.scale.set(8, 1, 8)
  receiver.position.y = -0.005
  receiver.receiveShadow = true
  root.add(receiver)

  return {
    root,
    update({ frame, anthro, exercise }: Props) {
      const p = frame.posture
      const middle = (p.heel.x + p.toe.x) / 2
      const stance = (anthro.height / 1.71) * (exercise === 'squat' ? 0.151 : 0.115)
      for (const [i, side] of [-1, 1].entries()) {
        shadows[i].position.set(middle, -0.002, side * stance)
        shadows[i].scale.set(anthro.foot * 1.9, 1, anthro.foot * 0.9)
      }
      shadows[2].position.set(middle, -0.003, 0)
      shadows[2].scale.set(anthro.foot * 4, 1, stance * 6)
    },
    dispose() {
      gridGeometry.dispose()
      gridMaterial.dispose()
      shadowMap.dispose()
      shadowGeometry.dispose()
      shadowMaterial.dispose()
      receiverMaterial.dispose()
    },
  }
}

function addStudioLighting(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xfff9ed, 0xbab0a7, 1.5))
  const lights = [
    { color: 0xfff0db, intensity: 2.5, at: [3, 5, 3] },
    { color: 0xdce7eb, intensity: 0.9, at: [-3, 2, 1] },
    { color: 0xfff1df, intensity: 1.65, at: [1, 3, -4] },
  ]
  for (const [index, { color, intensity, at }] of lights.entries()) {
    const light = new THREE.DirectionalLight(color, intensity)
    light.position.set(at[0], at[1], at[2])
    if (index === 0) {
      light.castShadow = true
      light.shadow.mapSize.set(1024, 1024)
      Object.assign(light.shadow.camera, {
        left: -1.5,
        right: 1.5,
        top: 1.5,
        bottom: -1.5,
        near: 0.5,
        far: 14,
      })
      light.shadow.camera.updateProjectionMatrix()
      light.shadow.normalBias = 0.0028
      light.shadow.bias = -0.00012
      light.target.position.y = 0.7
      scene.add(light.target)
    }
    scene.add(light)
  }
}

function createStudio(
  renderer: THREE.WebGLRenderer,
  host: HTMLDivElement,
  data: () => Props,
  onOrbit: (view: View | 'free', zoom: number) => void,
) {
  const canvas = renderer.domElement
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f8f6f0')
  addStudioLighting(scene)
  const floor = studioFloor()
  scene.add(floor.root)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 25)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = false
  controls.enablePan = false
  controls.minPolarAngle = radians(42)
  controls.maxPolarAngle = radians(89)
  controls.minZoom = 0.8
  controls.maxZoom = 2.45
  controls.rotateSpeed = 0.7
  controls.zoomSpeed = 0.8

  const direction = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const centre = new THREE.Vector3()
  const delta = new THREE.Vector3()
  const previousCentre = new THREE.Vector3()
  const fittedDirection = new THREE.Vector3()
  let fittedSamples: readonly Posture[] | undefined
  let fittedScale = 0
  let fittedRadius = 0
  let fittedLoad = 0
  const sweep = { left: 0, right: 0, top: 0, bottom: 0 }
  const ray = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let body: Body | undefined
  let posed: Props | undefined
  let width = 0
  let height = 0
  let visible = true
  let stopped = false
  let requested = 0
  let currentView: View | 'free' = 'oblique'
  const studyPixelRatio = renderer.getPixelRatio()
  let previousFrameTime = 0
  let slowFrames = 0
  let reducedPlayback = false
  let pickedMuscle: MuscleId | null = null
  let turn: {
    start: number
    yaw: number
    elevation: number
    dx: number
    dy: number
    zoom: number
  } | null = null
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  function fit({ frame, anthro, task, bounds, postures }: Props) {
    direction.subVectors(camera.position, controls.target).normalize()
    right.crossVectors(camera.up, direction).normalize()
    up.crossVectors(direction, right).normalize()
    let left = Infinity,
      bottom = Infinity,
      top = -Infinity,
      farRight = -Infinity
    // A projection of the actual pose and both bar ends keeps the side and end
    // views legible without iterating over every anatomical vertex each frame.
    function include(point: Vec2, halfWidth: number, radius = 0, disc = false) {
      const horizontal = point.x * right.x + point.y * right.y
      const vertical = point.x * up.x + point.y * up.y
      const dx = Math.abs(halfWidth * right.z) + radius * (disc ? Math.hypot(right.x, right.y) : 1)
      const dy = Math.abs(halfWidth * up.z) + radius * (disc ? Math.hypot(up.x, up.y) : 1)
      left = Math.min(left, horizontal - dx)
      farRight = Math.max(farRight, horizontal + dx)
      bottom = Math.min(bottom, vertical - dy)
      top = Math.max(top, vertical + dy)
    }
    const h = anthro.height
    function includePose(p: Posture) {
      include(p.headTop, h * 0.055, 0.025)
      include(p.shoulder, h * 0.145, h * 0.06)
      include(p.hip, h * 0.11, h * 0.075)
      include(p.elbow, h * 0.21, h * 0.032)
      include(p.hand, h * 0.22, h * 0.028)
      include(p.knee, h * 0.105, h * 0.055)
      include(p.heel, h * 0.13, 0.025)
      include(p.toe, h * 0.13, 0.02)
      include(p.bar, 0.89, 0.02)
      if (task.load > 20) include(p.bar, 0.78, task.plateRadius * 1.02, true)
    }
    includePose(frame.posture)
    const poseCentre = (bottom + top) / 2
    if (
      !postures ||
      postures !== fittedSamples ||
      direction.distanceToSquared(fittedDirection) > 1e-10 ||
      fittedScale !== h ||
      fittedRadius !== task.plateRadius ||
      fittedLoad !== task.load
    ) {
      for (const p of postures ?? []) includePose(p)
      if (!postures && bounds) {
        for (const x of [bounds.minX, bounds.maxX]) {
          include({ x, y: bounds.maxY }, h * 0.055, 0.025)
          include({ x, y: bounds.minY }, h * 0.13, 0.025)
        }
      }
      Object.assign(sweep, { left, right: farRight, top, bottom })
      fittedSamples = postures
      fittedScale = h
      fittedRadius = task.plateRadius
      fittedLoad = task.load
      fittedDirection.copy(direction)
    }
    // One physical scale throughout the lift. A mild vertical follow keeps
    // the bottom of a squat centred without changing grid or limb lengths.
    const span =
      Math.max(sweep.top - sweep.bottom, ((sweep.right - sweep.left) * height) / width) * 1.06
    camera.left = (-span * (width / height)) / 2
    camera.right = -camera.left
    camera.top = span / 2
    camera.bottom = -camera.top
    centre
      .copy(right)
      .multiplyScalar((sweep.left + sweep.right) / 2)
      .addScaledVector(up, THREE.MathUtils.lerp((sweep.bottom + sweep.top) / 2, poseCentre, 0.83))
    delta.subVectors(centre, previousCentre)
    controls.target.add(delta)
    camera.position.add(delta)
    previousCentre.copy(centre)
    camera.updateProjectionMatrix()
  }

  function draw() {
    if (requested) cancelAnimationFrame(requested)
    requested = 0
    if (!body || stopped || !visible || document.hidden || !width || !height) return
    const next = data()
    // Measure consecutive delivered poses, so zooming, a tab in the
    // background and an untouched study never trigger a quality change.
    // One downgrade per playback avoids oscillation near the threshold.
    if (next.playing && posed?.frame !== next.frame) {
      const now = performance.now()
      const interval = previousFrameTime ? now - previousFrameTime : 0
      previousFrameTime = now
      slowFrames = interval > 45 && interval < 450 ? slowFrames + 1 : Math.max(0, slowFrames - 1)
      if (!reducedPlayback && slowFrames >= 4) {
        renderer.setPixelRatio(Math.min(studyPixelRatio, 0.78))
        renderer.shadowMap.enabled = false
        reducedPlayback = true
      }
    } else if (!next.playing) {
      previousFrameTime = 0
      slowFrames = 0
      if (reducedPlayback) {
        renderer.setPixelRatio(studyPixelRatio)
        renderer.shadowMap.enabled = true
        renderer.shadowMap.needsUpdate = true
        reducedPlayback = false
      }
    }
    if (
      posed?.frame !== next.frame ||
      posed?.anthro !== next.anthro ||
      posed?.exercise !== next.exercise ||
      posed?.task !== next.task
    ) {
      body.update(next.frame, next.anthro, next.task, next.exercise)
      floor.update(next)
      renderer.shadowMap.needsUpdate = true
    }
    if (!posed || posed.layer !== next.layer || posed.selectedMuscle !== next.selectedMuscle) {
      body.style(next.layer, next.selectedMuscle)
      body.root.traverse((part) => {
        if (part instanceof THREE.Mesh) {
          part.receiveShadow = true
          part.castShadow = !part.material.transparent
        }
      })
      renderer.shadowMap.needsUpdate = true
      // A group chosen from the list can be on the far side of the body.
      // A group picked directly in the scene is already in view.
      const group = next.selectedMuscle
      if (group && group !== pickedMuscle && next.layer === 'muscles') {
        const anterior = group === 'quadriceps' || group === 'core'
        const posterior =
          group === 'glutes' ||
          group === 'hamstrings' ||
          group === 'erectors' ||
          group === 'calves' ||
          group === 'lats'
        const facing = Math.sin(controls.getAzimuthalAngle())
        if (posterior && facing > -0.2) setView('rear')
        if (anterior && facing < 0.2) setView('oblique')
      }
      pickedMuscle = null
    }
    posed = next
    if (turn) {
      const t = reducedMotion.matches ? 1 : Math.min(1, (performance.now() - turn.start) / 360)
      const u = t * t * (3 - 2 * t)
      camera.zoom = THREE.MathUtils.lerp(turn.zoom, 1, u)
      setAngle(turn.yaw + turn.dx * u, turn.elevation + turn.dy * u)
      if (t >= 1) turn = null
      else invalidate()
    }
    fit(next)
    renderer.render(scene, camera)
  }

  function invalidate() {
    if (!stopped && !requested && visible && !document.hidden)
      requested = requestAnimationFrame(draw)
  }

  function setAngle(yaw: number, elevation: number) {
    const e = THREE.MathUtils.clamp(elevation, radians(1), radians(48))
    direction.set(Math.sin(yaw) * Math.cos(e), Math.sin(e), Math.cos(yaw) * Math.cos(e))
    camera.position.copy(controls.target).addScaledVector(direction, 6)
    controls.update()
  }

  function setView(key: View) {
    const { yaw, elevation } = VIEWS[key]
    currentView = key
    controls.target.copy(previousCentre)
    const startYaw = controls.getAzimuthalAngle()
    const startElevation = Math.PI / 2 - controls.getPolarAngle()
    const dx =
      THREE.MathUtils.euclideanModulo(radians(yaw) - startYaw + Math.PI, Math.PI * 2) - Math.PI
    if (
      body &&
      !reducedMotion.matches &&
      (Math.abs(dx) > 0.01 ||
        Math.abs(camera.zoom - 1) > 0.01 ||
        Math.abs(radians(elevation) - startElevation) > 0.01)
    ) {
      turn = {
        start: performance.now(),
        yaw: startYaw,
        elevation: startElevation,
        dx,
        dy: radians(elevation) - startElevation,
        zoom: camera.zoom,
      }
    } else {
      turn = null
      camera.zoom = 1
      camera.updateProjectionMatrix()
      setAngle(radians(yaw), radians(elevation))
    }
    onOrbit(key, camera.zoom)
    invalidate()
  }

  function setZoom(factor: number) {
    cancelTurn()
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom)
    camera.updateProjectionMatrix()
    syncPan()
    controls.update()
    onOrbit(currentView, camera.zoom)
    invalidate()
  }

  function change() {
    if (!turn && currentView !== 'free') {
      const preset = VIEWS[currentView]
      const yaw = controls.getAzimuthalAngle()
      const elevation = Math.PI / 2 - controls.getPolarAngle()
      if (
        Math.abs(yaw - radians(preset.yaw)) + Math.abs(elevation - radians(preset.elevation)) >
        0.008
      ) {
        currentView = 'free'
      }
    }
    syncPan()
    onOrbit(currentView, camera.zoom)
    invalidate()
  }

  function syncPan() {
    if (controls.enablePan && camera.zoom <= 1.01) {
      delta.subVectors(previousCentre, controls.target)
      controls.target.add(delta)
      camera.position.add(delta)
    }
    controls.enablePan = camera.zoom > 1.01
  }

  function cancelTurn() {
    if (!turn) return
    turn = null
    currentView = 'free'
    onOrbit(currentView, camera.zoom)
  }

  function keyDown(event: KeyboardEvent) {
    if (event.metaKey || event.altKey || event.ctrlKey) return
    const yaw = controls.getAzimuthalAngle()
    const elevation = Math.PI / 2 - controls.getPolarAngle()
    const step = radians(10)
    if (event.key.startsWith('Arrow')) cancelTurn()
    switch (event.key) {
      case 'ArrowLeft':
        setAngle(yaw - step, elevation)
        break
      case 'ArrowRight':
        setAngle(yaw + step, elevation)
        break
      case 'ArrowUp':
        setAngle(yaw, elevation + step)
        break
      case 'ArrowDown':
        setAngle(yaw, elevation - step)
        break
      case '+':
      case '=':
        setZoom(1.18)
        break
      case '-':
        setZoom(1 / 1.18)
        break
      case 'Home':
        setView('oblique')
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  // OrbitControls owns capture. Track the entire gesture so releasing after
  // dragging (or pinching back to its start) can never select a muscle.
  let tap: { id: number; x: number; y: number } | null = null
  function down(e: PointerEvent) {
    if (!e.isPrimary || e.button !== 0) {
      tap = null
      return
    }
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  function move(e: PointerEvent) {
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 5) tap = null
  }
  function cancelTap() {
    tap = null
  }
  function pick(e: PointerEvent) {
    if (tap?.id !== e.pointerId) return
    move(e)
    if (!tap || !body || data().layer !== 'muscles') return
    tap = null
    if (requested) draw()
    const rect = canvas.getBoundingClientRect()
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    ray.setFromCamera(pointer, camera)
    for (const { object } of ray.intersectObject(body.root, true)) {
      if (
        object instanceof THREE.Mesh &&
        object.material.transparent &&
        object.material.opacity < 0.3
      )
        continue
      let shown = true
      let muscle: MuscleId | null = null
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (!node.visible) {
          shown = false
          break
        }
        muscle ??= node.userData.muscle ?? null
      }
      if (!shown) continue
      pickedMuscle = muscle === data().selectedMuscle ? null : muscle
      data().onSelectMuscle(pickedMuscle)
      return
    }
    data().onSelectMuscle(null)
  }

  const resize = new ResizeObserver(() => {
    width = host.clientWidth
    height = host.clientHeight
    if (width && height) renderer.setSize(width, height, false)
    invalidate()
  })
  resize.observe(host)
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    invalidate()
  })
  intersection.observe(host)
  document.addEventListener('visibilitychange', invalidate)
  canvas.addEventListener('keydown', keyDown)
  canvas.addEventListener('pointerdown', down, true)
  canvas.addEventListener('pointermove', move, true)
  canvas.addEventListener('pointerup', pick, true)
  canvas.addEventListener('pointercancel', cancelTap)
  controls.addEventListener('change', change)
  controls.addEventListener('start', cancelTurn)
  setView('oblique')

  return {
    setView,
    setZoom,
    draw,
    setBody(loaded: Body) {
      body = loaded
      scene.add(body.root)
      draw()
    },
    dispose() {
      stopped = true
      if (requested) cancelAnimationFrame(requested)
      resize.disconnect()
      intersection.disconnect()
      document.removeEventListener('visibilitychange', invalidate)
      canvas.removeEventListener('keydown', keyDown)
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move, true)
      canvas.removeEventListener('pointerup', pick, true)
      canvas.removeEventListener('pointercancel', cancelTap)
      controls.removeEventListener('change', change)
      controls.removeEventListener('start', cancelTurn)
      controls.dispose()
      body?.dispose()
      scene.traverse((part) => {
        if (part instanceof THREE.DirectionalLight) part.shadow.dispose()
      })
      floor.dispose()
      scene.clear()
    },
  }
}

export function AnatomyViewer(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  const runtime = useRef<ReturnType<typeof createStudio> | null>(null)
  const [view, setView] = useState<View | 'free'>('oblique')
  const [zoom, setZoom] = useState(1)
  const [ready, setReady] = useState(false)
  const hint = useId()

  useLayoutEffect(() => {
    latest.current = props
    runtime.current?.draw()
  }, [props])

  useEffect(() => {
    const el = host.current
    if (!el) return
    let active = true
    let renderer: THREE.WebGLRenderer | undefined
    function unavailable(event?: Event) {
      event?.preventDefault()
      if (active) latest.current.onUnavailable()
    }
    // A deferred start avoids creating two contexts during React's dev
    // lifecycle check. No animation loop runs after the first frame.
    const start = requestAnimationFrame(async () => {
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: 'low-power',
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFShadowMap
        renderer.shadowMap.autoUpdate = false
        const canvas = renderer.domElement
        canvas.tabIndex = 0
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', 'Modelo anatómico tridimensional del levantamiento')
        canvas.setAttribute('aria-describedby', hint)
        canvas.addEventListener('webglcontextlost', unavailable)
        el.appendChild(canvas)
        const studio = createStudio(
          renderer,
          el,
          () => latest.current,
          (camera, magnification) => {
            setView(camera)
            setZoom(magnification)
          },
        )
        runtime.current = studio
        const body = await createAnatomicalBody()
        if (!active) {
          body.dispose()
          return
        }
        studio.setBody(body)
        setReady(true)
      } catch {
        unavailable()
      }
    })
    return () => {
      active = false
      cancelAnimationFrame(start)
      runtime.current?.dispose()
      runtime.current = null
      if (renderer) {
        renderer.domElement.removeEventListener('webglcontextlost', unavailable)
        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
      }
    }
  }, [hint])

  return (
    <div className="anatomy-viewer">
      <div className="anatomy-surface" ref={host} />
      <span id={hint} className="anatomy-sr">
        Arrastrá o usá las flechas para girar. Con más y menos ajustás el zoom. Inicio restablece la
        cámara. También podés elegir un grupo en la ficha muscular.
      </span>
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
              onChange={(event) => runtime.current?.setView(event.target.value as View)}
            >
              {Object.entries(VIEWS).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.name}
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
            disabled={zoom <= 0.801}
            aria-label="Alejar modelo"
            title="Alejar modelo"
            onClick={() => runtime.current?.setZoom(1 / 1.22)}
          >
            <Minus aria-hidden size={15} />
          </button>
          <button
            type="button"
            disabled={zoom >= 2.449}
            aria-label="Acercar modelo"
            title="Acercar modelo"
            onClick={() => runtime.current?.setZoom(1.22)}
          >
            <Plus aria-hidden size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

export default AnatomyViewer
