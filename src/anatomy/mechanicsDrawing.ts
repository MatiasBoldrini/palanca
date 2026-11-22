import { Vector3, type OrthographicCamera } from 'three'
import type { JointKey } from '../model/kinetics'
import type { Frame, Task } from '../model/lift'
import {
  buildMechanicsOverlay,
  formatBarArm,
  formatForce,
  formatMoment,
  type MechanicsView,
  type OverlayForce,
  type WorldPoint,
} from '../model/mechanicsOverlay'
import './mechanicsDrawing.css'

const inks = { bar: '#285b98', body: '#ac542b', ground: '#087568', moment: '#754493' }
const forces = ['bar', 'body', 'ground'] as const
const joints = ['l5s1', 'hip', 'knee', 'ankle'] as const
const shortForces = { bar: 'Barra', body: 'Cuerpo', ground: 'Suelo' }
const startAngles = { l5s1: 35, hip: 135, knee: -100, ankle: -35 }
const radii = { l5s1: 0.045, hip: 0.061, knee: 0.059, ankle: 0.048 }
const fullSweep = (260 / 180) * Math.PI
export const FORCE_LENGTH_IN_HEIGHTS = 0.32

type Point = { x: number; y: number }
type ForceId = OverlayForce['id']
type LabelId = JointKey | ForceId
type DrawingProps = {
  frame: Frame
  task: Task
  mechanics: MechanicsView
  peakMoment: number
  anthro: { height: number }
}

function element<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attributes: Record<string, string | number> = {},
) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  parent.appendChild(node)
  return node
}

function shown(node: SVGElement, visible: boolean) {
  node.style.display = visible ? '' : 'none'
}

function xy(p: Point) {
  return p.x.toFixed(2) + ',' + p.y.toFixed(2)
}

function polyline(points: Point[]) {
  return points.length ? 'M' + points.map(xy).join(' L') : ''
}

function place(node: SVGElement, p: Point) {
  node.setAttribute('transform', 'translate(' + xy(p) + ')')
}

function text(node: SVGElement, value: string) {
  if (node.textContent !== value) node.textContent = value
}

function arrow(group: SVGElement, className: string) {
  const halo = element(group, 'path', { class: 'mechanics-halo' })
  const shaft = element(group, 'path', { class: className + ' mechanics-shaft' })
  const head = element(group, 'path', { class: 'mechanics-head' })
  return (points: Point[], wantedTip: number) => {
    const path = polyline(points)
    halo.setAttribute('d', path)
    shaft.setAttribute('d', path)
    const tip = points.at(-1)
    const prev = points.at(-2)
    if (!tip || !prev || wantedTip < 1) {
      head.setAttribute('d', '')
      return
    }
    const total = points.reduce(
      (len, p, i) => (i ? len + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : len),
      0,
    )
    const length = Math.hypot(tip.x - prev.x, tip.y - prev.y)
    if (!length) {
      head.setAttribute('d', '')
      return
    }
    const ux = (tip.x - prev.x) / length,
      uy = (tip.y - prev.y) / length
    const size = Math.min(wantedTip, total * 0.55)
    const base = { x: tip.x - ux * size, y: tip.y - uy * size }
    const half = size * 0.51
    head.setAttribute(
      'd',
      polyline([
        tip,
        { x: base.x - uy * half, y: base.y + ux * half },
        { x: base.x + uy * half, y: base.y - ux * half },
      ]) + ' Z',
    )
  }
}

/** A single silhouette ends exactly at the projected tip. The inner chevrons
 * repeat its direction when the shaft is long enough to keep them legible. */
export function forceGlyphPaths(origin: Point, tip: Point) {
  const dx = tip.x - origin.x
  const dy = tip.y - origin.y
  const length = Math.hypot(dx, dy)
  if (length < 0.5) return { body: '', chevrons: '' }
  const ux = dx / length
  const uy = dy / length
  const point = (along: number, across: number): Point => ({
    x: origin.x + ux * along - uy * across,
    y: origin.y + uy * along + ux * across,
  })
  const head = Math.min(16, length * 0.57)
  const shoulder = length - head
  const halfHead = head * 0.64
  const halfShaft = Math.min(3.7, halfHead * 0.52)
  const body =
    polyline([
      point(0, -halfShaft),
      point(shoulder, -halfShaft),
      point(shoulder, -halfHead),
      tip,
      point(shoulder, halfHead),
      point(shoulder, halfShaft),
      point(0, halfShaft),
    ]) + 'Z'
  const count = shoulder < 19 ? 0 : shoulder < 66 ? 1 : 2
  let chevrons = ''
  for (let i = 1; i <= count; i++) {
    const at = 4 + ((shoulder - 4) * i) / (count + 1)
    chevrons += polyline([point(at - 1.8, -2.6), point(at + 1.8, 0), point(at - 1.8, 2.6)])
  }
  return { body, chevrons }
}

/** The ring stays on the real landmark even when the shaft has to shift to
 * distinguish two collinear forces. The witness joins its origin to the ring. */
export function createForceGlyph(parent: SVGGElement) {
  const witness = element(parent, 'path', { class: 'force-glyph-witness' })
  const body = element(parent, 'path', { class: 'mechanics-vector force-glyph-body' })
  const chevrons = element(parent, 'path', { class: 'force-glyph-chevrons' })
  const ring = element(parent, 'circle', { r: 4, class: 'force-glyph-origin' })
  return (origin: Point, tip: Point, offsetX = 0) => {
    const start = { x: origin.x + offsetX, y: origin.y }
    const end = { x: tip.x + offsetX, y: tip.y }
    const paths = forceGlyphPaths(start, end)
    body.setAttribute('d', paths.body)
    chevrons.setAttribute('d', paths.chevrons)
    witness.setAttribute('d', offsetX && paths.body ? polyline([origin, start]) : '')
    place(ring, origin)
  }
}

function makeLabel(parent: SVGElement, leaders: SVGElement, id: LabelId, color: string) {
  const leader = element(leaders, 'path', { class: 'mechanics-leader', stroke: color })
  const group = element(parent, 'g', { 'data-label-for': id, color })
  const card = element(group, 'rect', { class: 'mechanics-card', x: 0, y: 0, rx: 5 })
  element(group, 'path', { d: 'M2,8 v16', class: 'mechanics-card-stripe' })
  const name = element(group, 'text', { x: 9, y: 13, class: 'mechanics-label-name' })
  const value = element(group, 'text', { x: 9, y: 29, class: 'mechanics-label-value' })
  const extra = element(group, 'text', { x: 9, y: 42, class: 'mechanics-label-extra' })
  const inset = element(group, 'g', { class: 'mechanics-profile' })
  element(inset, 'circle', { r: 8, class: 'mechanics-profile-guide' })
  const profileArrow = arrow(inset, 'mechanics-profile-arc')
  text(element(inset, 'text', { x: 0, y: 17, 'text-anchor': 'middle' }), 'perfil')
  shown(inset, false)
  return { group, card, name, value, extra, inset, profileArrow, leader }
}
type Label = ReturnType<typeof makeLabel>
type Annotation = { label: Label; anchor: Point; width: number; height: number; y: number }

// Reserve a rail on each side. Work purely in viewport coordinates here;
// the leader always ends at a separately projected physical landmark.
function layout(entries: Annotation[], left: boolean, w: number, h: number, landmarks: Point[]) {
  entries.sort((a, b) => a.anchor.y - b.anchor.y)
  const pad = w < 400 ? 4 : 10
  // The camera controls can extend a few pixels into the drawing on narrow screens.
  const bottomPad = Math.max(11, pad)
  const top = Math.min(34, Math.max(3, h - entries.reduce((n, e) => n + e.height + 3, 0) - pad))
  let limit = top
  for (const e of entries) {
    e.y = Math.max(limit, Math.min(h - e.height - bottomPad, e.anchor.y - e.height / 2))
    limit = e.y + e.height + 3
  }
  limit = h - bottomPad
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    e.y = Math.min(e.y, limit - e.height)
    limit = e.y - 3
  }
  let remaining = entries.reduce((sum, e) => sum + e.height + 3, 0) - 3
  limit = top
  for (const e of entries) {
    const margin = Math.max(pad, (w - 670) / 2)
    const x = left ? margin : w - margin - e.width
    const near = landmarks.filter((p) => p.x >= x - 5 && p.x <= x + e.width + 5)
    const last = h - remaining - bottomPad
    const preferred = Math.max(limit, Math.min(last, e.y))
    const overlaps = (y: number) => near.some((p) => p.y >= y - 5 && p.y <= y + e.height + 5)
    e.y = preferred
    if (overlaps(preferred)) {
      // Cards share the silhouette's width on small screens. The nearest
      // clear position keeps the pivot and arrowheads visible underneath.
      for (let distance = 2; distance <= last - limit + 2; distance += 2) {
        const below = preferred + distance
        const above = preferred - distance
        if (above >= limit && !overlaps(above)) {
          e.y = above
          break
        }
        if (below <= last && !overlaps(below)) {
          e.y = below
          break
        }
      }
    }
    limit = e.y + e.height + 3
    remaining -= e.height + 3
    place(e.label.group, { x, y: e.y })
    e.label.card.setAttribute('width', String(e.width))
    e.label.card.setAttribute('height', String(e.height))
    const edge = left ? x + e.width : x
    const y = e.y + e.height / 2
    const knee = edge + (left ? 1 : -1) * Math.min(14, Math.abs(e.anchor.x - edge) * 0.25)
    const d = polyline([{ x: edge, y }, { x: knee, y }, e.anchor])
    e.label.leader.setAttribute('d', d)
  }
}

function arcPoints(sweep: number, start: number, point: (angle: number) => Point) {
  if (!sweep) return []
  const count = Math.max(2, Math.ceil(Math.abs(sweep) / 0.12))
  return Array.from({ length: count + 1 }, (_, i) => point(start + (sweep * i) / count))
}

export function createMechanicsDrawing(host: HTMLElement, select: (id: JointKey) => void) {
  const svg = element(host, 'svg', {
    class: 'mechanics-overlay',
    role: 'group',
    'aria-label': 'Fuerzas y momentos sobre el modelo 3D',
  })
  const leaders = element(svg, 'g', { 'aria-hidden': 'true' })
  const lever = element(svg, 'g', { class: 'mechanics-lever', 'aria-hidden': 'true' })
  const gravityLine = element(lever, 'path', { class: 'mechanics-gravity-line' })
  const dimension = element(lever, 'path')
  const shapes = element(svg, 'g')
  const forceShapes = element(svg, 'g')
  const cards = element(svg, 'g')
  const forceNodes = new Map(
    forces.map((id) => {
      const group = element(forceShapes, 'g', { 'data-force': id, color: inks[id] })
      const label = makeLabel(cards, leaders, id, inks[id])
      const kind = id === 'ground' ? 'support' : id
      for (const node of [group, label.group, label.leader]) node.setAttribute('data-force-kind', kind)
      label.group.setAttribute('role', 'img')
      label.extra.classList.add('force-label-direction')
      label.extra.setAttribute('x', '22')
      const direction = element(label.group, 'path', { class: 'force-label-icon' })
      return [id, { group, glyph: createForceGlyph(group), label, direction }]
    }),
  )
  const momentNodes = new Map(
    joints.map((id) => {
      const group = element(shapes, 'g', { 'data-moment': id, color: inks.moment })
      const trace = arrow(group, 'mechanics-arc')
      const pivot = element(group, 'circle', { class: 'mechanics-pivot', r: 3.4 })
      const hit = element(group, 'circle', { class: 'mechanics-hit', r: 11, 'aria-hidden': 'true' })
      const label = makeLabel(cards, leaders, id, inks.moment)
      label.group.setAttribute('role', 'button')
      label.group.setAttribute('tabindex', '0')
      label.group.classList.add('mechanics-joint-label')
      hit.addEventListener('click', () => select(id))
      label.group.addEventListener('click', () => select(id))
      label.group.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          select(id)
        }
      })
      return [id, { group, trace, pivot, hit, label }]
    }),
  )
  const scratch = new Vector3()
  let nearSide: 1 | -1 = 1

  function draw(
    props: DrawingProps,
    camera: OrthographicCamera,
    w: number,
    h: number,
    contactLandmarks: readonly Point[] = [],
  ) {
    const { frame, task, mechanics: view, anthro } = props
    shown(svg, view.forces || view.moments || (view.lever && view.joint !== 'all'))
    if (svg.style.display === 'none') return
    camera.getWorldDirection(scratch)
    const z = -scratch.z
    if (Math.abs(z) > 0.025) nearSide = z > 0 ? 1 : -1
    const edgeOn = Math.abs(z) < 0.22
    svg.setAttribute('data-sagittal-profile', String(edgeOn))
    const { forces: loads, moments } = buildMechanicsOverlay(
      frame,
      task,
      nearSide,
    )
    function project(p: WorldPoint): Point {
      scratch.set(p.x, p.y, p.z).project(camera)
      return { x: ((scratch.x + 1) * w) / 2, y: ((1 - scratch.y) * h) / 2 }
    }
    const landmarks: Point[] = [...contactLandmarks]
    const compact = w < 480
    const left: Annotation[] = [],
      right: Annotation[] = []
    const projectedLoads = loads.map((load) => {
      const p = load.anchor
      const length =
        (anthro.height * FORCE_LENGTH_IN_HEIGHTS * load.verticalN) / frame.kinetics.systemWeight
      const visible = view.forces && (!view.loadPath || load.id === 'body')
      return { load, visible, origin: project(p), tip: project({ ...p, y: p.y + length }) }
    })
    const lanes: { x: number; top: number; bottom: number }[] = []
    for (const { load, visible, origin, tip } of projectedLoads) {
      const n = forceNodes.get(load.id)!
      shown(n.group, visible)
      shown(n.label.group, visible)
      shown(n.label.leader, visible)
      if (!visible) continue
      const top = Math.min(origin.y, tip.y)
      const bottom = Math.max(origin.y, tip.y)
      const space = 24
      // Leave the central line fixed for the first vector. If two projected
      // glyphs touch, slide the next one just far enough to uncover its tip.
      const conflicts = lanes.filter((lane) => bottom + 5 > lane.top && top - 5 < lane.bottom)
      const candidates = [
        origin.x,
        ...conflicts.flatMap((lane) => [lane.x - space, lane.x + space]),
      ]
      const clear = candidates.filter((x) =>
        conflicts.every((lane) => Math.abs(lane.x - x) >= space - 0.01),
      )
      const x = clear.reduce(
        (best, value) => (Math.abs(value - origin.x) < Math.abs(best - origin.x) ? value : best),
        clear[0] ?? origin.x,
      )
      if (load.verticalN) lanes.push({ x, top, bottom })
      n.glyph(origin, tip, x - origin.x)
      const end = { x, y: tip.y }
      landmarks.push(origin, end, { x: x - 9, y: tip.y }, { x: x + 9, y: tip.y })
      const sense = Math.sign(load.verticalN)
      const direction = sense > 0 ? 'Hacia arriba' : sense < 0 ? 'Hacia abajo' : 'Sin fuerza'
      text(n.label.name, compact ? shortForces[load.id] : load.label)
      text(n.label.value, formatForce(load.verticalN))
      text(n.label.extra, direction)
      n.label.group.setAttribute(
        'aria-label',
        load.label + ', ' + formatForce(load.verticalN) + ', ' + direction,
      )
      const icon =
        sense > 0
          ? 'M14 43V35m-3.5 3.5L14 35l3.5 3.5'
          : sense < 0
            ? 'M14 35v8m-3.5-3.5L14 43l3.5-3.5'
            : 'M11 39h6'
      n.direction.setAttribute('d', icon)
      left.push({ label: n.label, anchor: origin, width: compact ? 84 : 120, height: 48, y: 0 })
    }
    const maxMoment = Math.max(1, props.peakMoment, ...moments.map((m) => Math.abs(m.momentNm)))
    shown(lever, view.lever && view.joint !== 'all')
    for (const m of moments) {
      const n = momentNodes.get(m.id)!
      const measured = view.lever && view.joint === m.id
      const selected = view.joint === 'all' || view.joint === m.id
      const annotated = (view.moments && selected) || measured
      shown(n.group, view.moments || measured)
      shown(n.label.group, annotated)
      shown(n.label.leader, annotated)
      if (!view.moments && !measured) continue
      const p = m.anchor
      const centre = project(p)
      place(n.pivot, centre)
      place(n.hit, centre)
      n.pivot.setAttribute('r', selected ? '3.3' : '2.8')
      const start = (startAngles[m.id] * Math.PI) / 180
      const sweep =
        view.moments && selected && Math.round(m.momentNm) !== 0
          ? ((fullSweep * Math.abs(m.momentNm)) / maxMoment) * Math.sign(m.torqueZNm)
          : 0
      const radius = anthro.height * radii[m.id]
      const points = arcPoints(sweep, start, (angle) =>
        project({
          x: p.x + radius * Math.cos(angle),
          y: p.y + radius * Math.sin(angle),
          z: p.z,
        }),
      )
      n.trace(points, edgeOn ? 0 : 8.5)
      landmarks.push(centre)
      for (let sample = 0; sample < points.length; sample += 4) landmarks.push(points[sample])
      if (points.length) landmarks.push(points[points.length - 1])
      if (!annotated) continue
      const label = n.label
      const name = compact && m.id === 'l5s1' ? 'L5/S1' : m.label
      text(label.name, name)
      text(label.value, view.moments ? formatMoment(m.momentNm) : formatBarArm(m.barArmM))
      text(label.extra, measured && view.moments ? 'Brazo ' + formatBarArm(m.barArmM) : '')
      label.group.setAttribute(
        'aria-label',
        m.label +
          ', ' +
          (view.moments ? formatMoment(m.momentNm) + ', ' + m.action : '') +
          (measured ? ', brazo de la barra ' + formatBarArm(m.barArmM) : ''),
      )
      const inset = edgeOn && view.moments
      shown(label.inset, inset)
      const width = (compact ? 79 : 113) + (inset ? 23 : 0)
      if (inset) {
        place(label.inset, { x: width - 14, y: 14 })
        label.profileArrow(
          arcPoints(sweep, start, (a) => ({ x: 8 * Math.cos(a), y: -8 * Math.sin(a) })),
          4,
        )
      }
      right.push({ label, anchor: centre, width, height: measured && view.moments ? 48 : 35, y: 0 })
      if (measured) {
        const end = project({ x: frame.posture.bar.x, y: p.y, z: p.z })
        const bar = project({ x: frame.posture.bar.x, y: frame.posture.bar.y, z: p.z })
        gravityLine.setAttribute('d', polyline([bar, end]))
        const len = Math.hypot(end.x - centre.x, end.y - centre.y)
        let d = polyline([centre, end])
        if (len > 2) {
          const dx = (-(end.y - centre.y) / len) * 4,
            dy = ((end.x - centre.x) / len) * 4
          for (const point of [centre, end])
            d += polyline([
              { x: point.x - dx, y: point.y - dy },
              { x: point.x + dx, y: point.y + dy },
            ])
        }
        dimension.setAttribute('d', d)
      }
    }
    layout(left, true, w, h, landmarks)
    layout(right, false, w, h, landmarks)
  }
  return { draw, dispose: () => svg.remove() }
}
