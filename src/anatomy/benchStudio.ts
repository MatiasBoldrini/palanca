import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three'
import { ViewerCameraControls } from './viewerCameraControls'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createAnatomicalBody, type AnatomyLayer } from './body'
import { createBodyPartDrawing } from './bodyPartDrawing'
import { listenForBodyPart } from './bodyPartPicking'
import { benchPointDistance } from '../model/bench'
import { benchBodyTargets } from '../model/benchBodyParts'
import type { BenchPartId } from '../model/bodyEditing'
import { createBenchRig } from './benchRig'
import type { BenchMechanicsProps, BenchProjection } from '../components/BenchAnnotations'

export const BENCH_CAMERAS = {
  oblique: { label: 'Tres cuartos', yaw: 44, elevation: 24 },
  side: { label: 'Perfil', yaw: 0, elevation: 8 },
  feet: { label: 'Desde los pies', yaw: -90, elevation: 12 },
  overhead: { label: 'Superior', yaw: -8, elevation: 68 },
}
export type BenchView = keyof typeof BENCH_CAMERAS
export interface BenchEditorProps {
  editingBody?: boolean
  editPart?: BenchPartId | null
  onEditPart?: (id: BenchPartId) => void
}
type Props = BenchMechanicsProps & BenchEditorProps & { layer: AnatomyLayer; analyzing?: boolean }
type Body = Awaited<ReturnType<typeof createAnatomicalBody>>

function createFurniture() {
  const root = new Group(),
    bench = new Group()
  const pad = new MeshStandardMaterial({ color: '#363f42', roughness: 0.86 })
  const steel = new MeshStandardMaterial({ color: '#7c878a', roughness: 0.52, metalness: 0.32 })
  const rubber = new MeshStandardMaterial({ color: '#313836', roughness: 0.98 })
  const cushion = new RoundedBoxGeometry(1.35, 0.075, 0.31, 3, 0.02)
  const seat = new Mesh(cushion, pad)
  seat.position.set(-0.27, -0.039, 0)
  bench.add(seat)
  const box = new BoxGeometry(1, 1, 1)
  function member(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    mat = steel,
  ) {
    const mesh = new Mesh(box, mat)
    mesh.position.set(x, y, z)
    mesh.scale.set(dx, dy, dz)
    bench.add(mesh)
  }
  member(-0.26, -0.097, 0, 1.21, 0.06, 0.065)
  const fastener = new CylinderGeometry(0.009, 0.009, 0.014, 8)
  for (const x of [-0.76, 0.24]) {
    member(x, -0.24, 0, 0.052, 0.32, 0.07)
    member(x, -0.408, 0, 0.08, 0.042, 0.49)
    for (const z of [-0.24, 0.24]) {
      member(x, -0.405, z, 0.093, 0.05, 0.067, rubber)
      const bolt = new Mesh(fastener, rubber)
      bolt.rotation.x = Math.PI / 2
      bolt.position.set(x, -0.106, Math.sign(z) * 0.035)
      bench.add(bolt)
    }
  }
  const floor = new GridHelper(4.8, 24, '#c6c0b5', '#ddd8cb')
  floor.position.set(-0.28, -0.005, 0)
  const gridMat = floor.material
  gridMat.transparent = true
  gridMat.opacity = 0.36
  root.add(bench, floor)
  return {
    root,
    bench,
    dispose() {
      for (const g of [cushion, box, fastener, floor.geometry]) g.dispose()
      for (const m of [pad, steel, rubber, gridMat]) m.dispose()
    },
  }
}

export function createBenchStudio(
  renderer: WebGLRenderer,
  host: HTMLElement,
  data: () => Props,
  onCamera: (projection: BenchProjection, view: BenchView | 'free', zoom: number) => void,
) {
  const scene = new Scene()
  scene.background = new Color('#f8f6f0')
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.05, 30)
  const controls = new ViewerCameraControls(camera, renderer.domElement)
  controls.enableDamping = false
  controls.enablePan = false
  controls.minZoom = 0.8
  controls.maxZoom = 2.44
  controls.maxPolarAngle = Math.PI * 0.49
  controls.minPolarAngle = Math.PI * 0.04
  const fill = new HemisphereLight('#fff8eb', '#a59e94', 1.95)
  const key = new DirectionalLight('#fff8ed', 2.65)
  key.position.set(-2, 4, 3)
  const rim = new DirectionalLight('#ddebff', 1)
  rim.position.set(2, 2, -2)
  const furniture = createFurniture()
  scene.add(fill, key, rim, furniture.root)
  let body: Body | undefined
  let pose: ReturnType<typeof createBenchRig> | undefined
  let view: BenchView | 'free' = 'oblique'
  let lastFrame: Props['frame'] | undefined
  let lastLayer: AnatomyLayer | undefined
  let pickedSide: 0 | 1 | undefined
  let wasEditing = false
  let closed = false,
    fitting = false,
    width = 0,
    height = 0
  const worldUp = new Vector3(0, 1, 0)
  const editDrawing = createBodyPartDrawing<BenchPartId>(host)
  function fit() {
    const { frame, analyzing = true, editingBody } = data()
    if (!width || !height) return
    const direction = camera.position.clone().sub(controls.target).normalize()
    const right = worldUp.clone().cross(direction).normalize()
    const up = direction.clone().cross(right)
    const points: Vector3[] = []
    function point(x: number, y: number, z: number) {
      points.push(new Vector3(x, y, z))
    }
    const shoulder = frame.arms[0].shoulder
    const headEnd = shoulder.x + 1.55 * (frame.pose.head.x - shoulder.x)
    const lockoutHeight = shoulder.y + frame.segments.arm
    // Fit the entire repetition once per setup. Include the turned feet and the
    // fixed bench so both remain visible when the lifter changes position.
    for (const leg of frame.pose.legs) {
      for (const landmark of [leg.toe, leg.heel, leg.knee, leg.hip]) {
        point(landmark.x, landmark.y, landmark.z)
      }
    }
    for (const side of [-1, 1]) {
      point(headEnd, frame.pose.head.y + 0.12, side * 0.1)
      for (const x of [-0.95, 0.41]) {
        point(x, frame.benchHeight, side * 0.16)
        point(x, 0, side * 0.26)
      }
      for (const x of [frame.barRangeX.min - 0.225, frame.barRangeX.max + 0.225]) {
        for (const y of [frame.benchHeight + 0.03, lockoutHeight + 0.225]) point(x, y, side * 0.9)
      }
    }
    let left = Infinity,
      rightEdge = -Infinity,
      bottom = Infinity,
      top = -Infinity
    for (const p of points) {
      const x = p.dot(right),
        y = p.dot(up)
      left = Math.min(left, x)
      rightEdge = Math.max(rightEdge, x)
      bottom = Math.min(bottom, y)
      top = Math.max(top, y)
    }
    const margin = width < 440 ? 14 : 20
    const usableHeight = Math.max(30, height - (analyzing || editingBody ? 80 : 2 * margin))
    const ppm = Math.min((width - 2 * margin) / (rightEdge - left), usableHeight / (top - bottom))
    const halfHeight = height / (ppm * 2)
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.right = (halfHeight * width) / height
    camera.left = -camera.right
    const centre = right
      .multiplyScalar((left + rightEdge) / 2)
      .addScaledVector(up, (top + bottom) / 2)
    controls.target.copy(centre)
    camera.position.copy(centre).addScaledVector(direction, 5)
    camera.lookAt(centre)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }
  function draw() {
    if (closed || !width || !height) return
    const next = data()
    if (next.frame !== lastFrame || next.layer !== lastLayer) {
      pose?.(next.frame, next.layer)
      furniture.bench.position.y = next.frame.benchHeight
      lastFrame = next.frame
      lastLayer = next.layer
    }
    renderer.render(scene, camera)
    if (wasEditing && !next.editingBody) pickedSide = undefined
    wasEditing = !!next.editingBody
    if (body && next.editingBody) {
      const side = pickedSide ?? (camera.getWorldDirection(new Vector3()).z <= 0 ? 0 : 1)
      editDrawing.draw(
        camera,
        width,
        height,
        benchBodyTargets(next.frame, side),
        next.editPart ?? null,
      )
    } else {
      editDrawing.hide()
    }
  }
  function syncCamera() {
    if (fitting || closed) return
    fit()
    draw()
    if (width && height) onCamera({ camera: camera.clone(), width, height }, view, camera.zoom)
  }
  function change() {
    if (fitting || closed) return
    if (view !== 'free') {
      const preset = BENCH_CAMERAS[view]
      const mismatch =
        Math.abs(controls.getAzimuthalAngle() - MathUtils.degToRad(preset.yaw)) +
        Math.abs(controls.getPolarAngle() - MathUtils.degToRad(90 - preset.elevation))
      if (mismatch > 0.01) view = 'free'
    }
    syncCamera()
  }
  function setView(next: BenchView) {
    view = next
    const yaw = MathUtils.degToRad(BENCH_CAMERAS[next].yaw),
      elev = MathUtils.degToRad(BENCH_CAMERAS[next].elevation)
    camera.position
      .copy(controls.target)
      .add(
        new Vector3(
          Math.sin(yaw) * Math.cos(elev),
          Math.sin(elev),
          Math.cos(yaw) * Math.cos(elev),
        ).multiplyScalar(5),
      )
    camera.zoom = 1
    fitting = true
    controls.update()
    fitting = false
    syncCamera()
  }
  function zoom(factor: number) {
    camera.zoom = MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom)
    syncCamera()
  }
  function keyboard(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Home') setView('oblique')
    else if (e.key === '+' || e.key === '=') zoom(1.22)
    else if (e.key === '-') zoom(1 / 1.22)
    else if (e.key.startsWith('Arrow')) {
      const yaw =
        controls.getAzimuthalAngle() + ({ ArrowLeft: -0.16, ArrowRight: 0.16 }[e.key] ?? 0)
      const phi = MathUtils.clamp(
        controls.getPolarAngle() + ({ ArrowUp: -0.13, ArrowDown: 0.13 }[e.key] ?? 0),
        controls.minPolarAngle,
        controls.maxPolarAngle,
      )
      camera.position.copy(controls.target).add(new Vector3().setFromSphericalCoords(5, phi, yaw))
      controls.update()
    } else return
    e.preventDefault()
  }
  const stopPicking = listenForBodyPart(
    renderer.domElement,
    camera,
    () => (body ? [body.root, furniture.bench] : []),
    (zone, point) => {
      const { frame, onEditPart } = data()
      let part: BenchPartId
      switch (zone) {
        case 'bar':
        case 'arm':
          part = frame.arms.some(
            (arm) => benchPointDistance(arm.grip, point) < frame.segments.arm * 0.1,
          )
            ? 'grip'
            : zone
          break
        case 'hip':
        case 'spine':
          part = 'torso'
          break
        case 'knee':
          part = 'thigh'
          break
        case 'foot':
        case 'shank':
        case 'thigh':
          part = zone
          break
        default:
          return
      }
      if (Math.abs(point.z) > 0.01) pickedSide = point.z > 0 ? 0 : 1
      onEditPart?.(part)
      if (data().editingBody && data().editPart === part) draw()
    },
  )
  setView('oblique')
  const measure = () => {
    width = host.clientWidth
    height = host.clientHeight
    if (width && height) {
      renderer.setSize(width, height, false)
      syncCamera()
    }
  }
  const resize = new ResizeObserver(measure)
  resize.observe(host)
  measure()
  controls.addEventListener('change', change)
  renderer.domElement.addEventListener('keydown', keyboard)
  return {
    draw,
    refit: syncCamera,
    zoom,
    setView,
    setBody(next: Body) {
      body = next
      pose = createBenchRig(body)
      scene.add(body.root)
      lastFrame = undefined
      draw()
    },
    dispose() {
      closed = true
      resize.disconnect()
      controls.removeEventListener('change', change)
      controls.dispose()
      editDrawing.dispose()
      stopPicking()
      renderer.domElement.removeEventListener('keydown', keyboard)
      body?.dispose()
      furniture.dispose()
      scene.clear()
    },
  }
}
