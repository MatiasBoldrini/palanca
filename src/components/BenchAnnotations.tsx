import { useId, type ReactNode } from 'react'
import { Vector3 } from 'three'
import type { OrthographicCamera } from 'three'
import type { BenchFrame, BenchJointId, BenchPoint } from '../model/bench'
import { benchContactForces, benchForces } from '../model/benchOverlay'
import { forceGlyphPaths } from '../anatomy/mechanicsDrawing'
import { formatBarArm, formatForce, formatMoment } from '../model/mechanicsOverlay'

export interface BenchProjection {
  camera: OrthographicCamera
  width: number
  height: number
}
export interface BenchMechanicsProps {
  frame: BenchFrame
  showForces: boolean
  showLoadPath: boolean
  showMoments: boolean
  joint: BenchJointId | 'all'
  showBarArm?: boolean
  peaks?: Partial<Record<BenchJointId, number>>
  onSelectJoint?: (joint: BenchJointId) => void
}
const jointNames = { shoulder: 'Hombro', elbow: 'Codo', wrist: 'Muñeca' }
const jointInk = '#754493'
const shortNames: Record<string, string> = {
  bar: 'Barra',
  body: 'Cuerpo',
  bench: 'Banco',
  feet: 'Pies',
}
const allJoints: BenchJointId[] = ['shoulder', 'elbow', 'wrist']
const asVector = (at: BenchPoint) => new Vector3(at.x, at.y, at.z)
type Point = { x: number; y: number }
const pair = (p: Point) => p.x.toFixed(1) + ',' + p.y.toFixed(1)
const pathOf = (points: Point[]) => 'M' + points.map(pair).join(' L')

function Arrow({ points, className }: { points: Point[]; className: string }) {
  if (points.length < 2) return null
  const d = pathOf(points)
  const tip = points.at(-1)!,
    back = points[points.length - 2]
  const dx = tip.x - back.x,
    dy = tip.y - back.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.000001) return null
  const ux = dx / dist,
    uy = dy / dist
  const size = Math.min(
    className === 'mechanics-vector' ? 9 : 6.5,
    points.reduce(
      (length, p, i) => length + (i ? Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0),
      0,
    ) * 0.45,
  )
  const base = { x: tip.x - ux * size, y: tip.y - uy * size }
  return (
    <g aria-hidden="true">
      <path className="mechanics-halo" d={d} />
      <path className={className + ' mechanics-shaft'} d={d} />
      <path
        className="mechanics-head"
        d={
          pathOf([
            tip,
            { x: base.x - (uy * size) / 2, y: base.y + (ux * size) / 2 },
            { x: base.x + (uy * size) / 2, y: base.y - (ux * size) / 2 },
          ]) + ' Z'
        }
      />
    </g>
  )
}

function Label({
  id,
  name,
  value,
  color,
  anchor,
  x,
  y,
  width,
  select,
  below,
  axial,
}: {
  id: string
  name: string
  value: string
  color: string
  anchor: Point
  x: number
  y: number
  width: number
  select?: () => void
  below: boolean
  axial?: Point[]
}) {
  return (
    <>
      <path
        className="mechanics-leader"
        stroke={color}
        d={pathOf([anchor, { x: x + width / 2, y: below ? y : y + 33 }])}
      />
      <g
        data-label-for={id}
        color={color}
        transform={`translate(${x},${y})`}
        role={select ? 'button' : undefined}
        tabIndex={select ? 0 : undefined}
        onClick={select}
        onKeyDown={
          select
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  select()
                }
              }
            : undefined
        }
        aria-label={name + ', ' + value}
        className={select ? 'mechanics-joint-label' : undefined}
      >
        <rect className="mechanics-card" width={width} height={33} rx={5} />
        <path className="mechanics-card-stripe" d="M2,7 v19" />
        <text className="mechanics-label-name" x={7} y={12}>
          {name}
        </text>
        <text className="mechanics-label-value" x={7} y={27}>
          {value}
        </text>
        {axial && (
          <g transform={`translate(${width - 14},13)`} className="mechanics-profile">
            <title>Giro visto a lo largo del eje del momento</title>
            <Arrow points={axial} className="mechanics-profile-arc" />
            <text x={0} y={16} textAnchor="middle">
              eje
            </text>
          </g>
        )}
      </g>
    </>
  )
}

export function BenchAnnotations({
  projection,
  vectorsOnly = false,
  frame,
  showForces,
  showLoadPath,
  showMoments,
  joint,
  peaks,
  showBarArm,
  onSelectJoint,
}: BenchMechanicsProps & { projection: BenchProjection; vectorsOnly?: boolean }) {
  const title = useId()
  const { camera, width, height } = projection
  const project = (at: BenchPoint) => {
    const p = asVector(at).project(camera)
    return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 }
  }
  const arm = frame.arms[camera.position.z >= 0 ? 0 : 1]
  const joints = joint === 'all' ? allJoints : [joint]
  const systemWeight = Math.abs(frame.forces.barN + frame.forces.bodyN)
  const momentPeak = Math.max(
    1,
    ...Object.values(peaks ?? {}),
    ...allJoints.map((id) => arm.moments[id].magnitudeNm),
  )
  const gap = 4
  const forceWidth = Math.min(136, (width - 5 * gap) / 4)
  const momentWidth = Math.min(113, (width - (joints.length + 1) * gap) / joints.length)
  const rowX = (i: number, n: number, w: number) => (width - n * w - (n - 1) * gap) / 2 + i * (w + gap)
  const labels: ReactNode[] = []
  const resultants = benchForces(frame)
  const contacts = showLoadPath ? benchContactForces(frame) : resultants
  const contactAnchors = new Map<string, Point[]>()
  const forceLabels: ReactNode[] = []
  const occupied: { x: number; top: number; bottom: number }[] = []
  const cameraY = camera.getWorldDirection(new Vector3()).y
  const axialView = Math.abs(cameraY) > 0.982
  // Force is measured in newtons. Use a common screen scale so orbiting the
  // camera cannot erase the vertical load through foreshortening.
  const forceScale = Math.min(height * 0.34, width * 0.34, 146) / Math.max(1, systemWeight)
  const forceVectors =
    showForces &&
    contacts.map(({ id, label, verticalN, anchor: at, color }) => {
      const anchor = project(at)
      const group = id.startsWith('hand-') ? 'bar' : id.startsWith('foot-') ? 'feet' : id
      const points = contactAnchors.get(group) ?? []
      points.push(anchor)
      contactAnchors.set(group, points)
      const up = project({ ...at, y: at.y + 1 })
      const length = Math.hypot(up.x - anchor.x, up.y - anchor.y)
      const pixels = forceScale * verticalN
      const tip = {
        x: anchor.x + ((up.x - anchor.x) / (length || 1)) * pixels,
        y: anchor.y + ((up.y - anchor.y) / (length || 1)) * pixels,
      }
      const top = axialView ? anchor.y - 10 : Math.min(anchor.y, tip.y)
      const bottom = axialView ? anchor.y + 10 : Math.max(anchor.y, tip.y)
      const offset =
        [0, -17, 17, -34, 34, -51, 51].find((dx) =>
          occupied.every(
            (p) => Math.abs(p.x - anchor.x - dx) >= 15 || bottom < p.top - 3 || top > p.bottom + 3,
          ),
        ) ?? 0
      const start = { x: anchor.x + offset, y: anchor.y }
      tip.x += offset
      occupied.push({ x: start.x, top, bottom })
      const { body, chevrons } = forceGlyphPaths(start, tip)
      const toward = verticalN * cameraY < 0
      const sense = verticalN === 0 ? 'fuerza nula' : verticalN > 0 ? 'hacia arriba' : 'hacia abajo'
      const part = id.startsWith('hand-') ? ', mitad de la carga de la barra' : ''
      return (
        <g
          key={id}
          data-force={id}
          data-force-kind={group === 'feet' || group === 'bench' ? 'support' : group}
          data-vertical-n={verticalN}
          color={color}
          aria-label={label + ', ' + formatForce(verticalN) + ' ' + sense + part}
        >
          <title>{label + ' · ' + formatForce(verticalN) + ' ' + sense + part}</title>
          {offset !== 0 && <path className="mechanics-offset" d={pathOf([anchor, start])} />}
          {axialView && verticalN !== 0 ? (
            <g className="bench-depth-cue" transform={`translate(${start.x},${start.y})`}>
              <circle r="8.2" className="bench-depth-ring" />
              {toward ? <circle r="2.8" fill="currentColor" /> : <path d="M-3,-3 L3,3 M3,-3 L-3,3" />}
            </g>
          ) : (
            <>
              <path d={body} className="force-glyph-body" />
              <path d={chevrons} className="force-glyph-chevrons" />
            </>
          )}
          {(!axialView || offset !== 0 || verticalN === 0) && (
            <circle cx={anchor.x} cy={anchor.y} r={3.8} className="force-glyph-origin" />
          )}
        </g>
      )
    })
  if (showForces && !vectorsOnly) {
    const forceY = 22
    const downwardCenter = rowX(0, 4, forceWidth) + forceWidth + gap / 2
    const upwardCenter = rowX(2, 4, forceWidth) + forceWidth + gap / 2
    forceLabels.push(
      <g className="bench-directions" key="directions" aria-hidden="true">
        <text x={downwardCenter} y={16}>
          ↓ Hacia abajo
        </text>
        <text x={upwardCenter} y={16}>
          ↑ Hacia arriba
        </text>
      </g>,
    )
    resultants.forEach(({ id, label, anchor, color, verticalN }, i) => {
      const p = project(anchor)
      const sources = contactAnchors.get(id) ?? [p]
      const benchShare = Math.round((100 * frame.forces.benchN) / (systemWeight || 1))
      const share = id === 'feet' ? 100 - benchShare : benchShare
      const support = id === 'bench' || id === 'feet'
      const split = sources.length === 2
      const narrow = forceWidth < 100
      const source =
        showLoadPath && id === 'bar' ? (narrow ? 'Manos' : 'Barra sobre manos') : shortNames[id]
      const name = source + (showLoadPath && support ? ' · ' + share + '%' : '')
      const half = formatForce(verticalN / 2)
      const detail = split
        ? narrow
          ? '½ = ' + half
          : half + (id === 'bar' ? ' por mano' : ' por pie')
        : ''
      const h = showLoadPath ? 45 : 33
      const x = rowX(i, 4, forceWidth)
      const direction = verticalN === 0 ? 'fuerza nula' : verticalN > 0 ? 'hacia arriba' : 'hacia abajo'
      const description = [
        showLoadPath && id === 'bar' ? 'Carga de la barra sobre ambas manos' : label,
        formatForce(verticalN) + ' ' + direction,
        showLoadPath && support && share + '% del apoyo total',
        split && half + (id === 'bar' ? ' por mano' : ' por pie'),
        showLoadPath && id === 'bar' && '50% de la barra en cada mano',
      ]
        .filter(Boolean)
        .join(', ')
      labels.push(
        <g
          key={id}
          aria-hidden="true"
          data-force-kind={support ? 'support' : id}
          className="bench-contact-lines"
          color={color}
        >
          <path className="mechanics-leader" d={pathOf([{ x: x + forceWidth / 2, y: forceY + h }, p])} />
          {split && <path className="bench-split-link" d={pathOf(sources)} />}
        </g>,
      )
      forceLabels.push(
        <g
          key={id}
          data-label-for={id}
          data-force-kind={support ? 'support' : id}
          color={color}
          transform={`translate(${x},${forceY})`}
          aria-label={description}
        >
          <title>{description}</title>
          <rect className="mechanics-card" width={forceWidth} height={h} rx={5} />
          <path className="mechanics-card-stripe" d={`M2,7 V${h - 7}`} />
          <text className="mechanics-label-name" x={7} y={12}>
            {name}
          </text>
          <text className="mechanics-label-value" x={7} y={27}>
            {formatForce(verticalN)}
          </text>
          {detail && (
            <text className="bench-share-value" x={7} y={40}>
              {detail}
            </text>
          )}
        </g>,
      )
    })
    if (axialView)
      forceLabels.push(
        <text key="depth" className="bench-depth-key" x={width / 2} y={showLoadPath ? 81 : 70}>
          ⊙ Hacia vos · ⊗ Se aleja
        </text>,
      )
  }
  const momentVectors =
    showMoments &&
    !vectorsOnly &&
    joints.map((id, i) => {
      const origin = arm[id],
        anchor = project(origin),
        moment = arm.moments[id]
      // U × V is the signed moment vector. Projecting this physical plane also
      // reproduces the reversal when the observer crosses to its other side.
      const axis = asVector(moment).normalize(),
        u = new Vector3(0, 1, 0),
        v = axis.clone().cross(u)
      const radiusPx = { shoulder: 25, elbow: 20, wrist: 15 }[id]
      const pixelsPerMetre = (height * camera.zoom) / (camera.top - camera.bottom)
      const radius = radiusPx / pixelsPerMetre
      const sweep = Math.min(1, moment.magnitudeNm / momentPeak) * Math.PI * 1.6
      const points = []
      if (Math.round(moment.magnitudeNm) > 0) {
        for (let k = 0; k <= 32; k++) {
          const angle = -0.55 + (k * sweep) / 32
          points.push(
            project(
              asVector(origin)
                .addScaledVector(u, Math.cos(angle) * radius)
                .addScaledVector(v, Math.sin(angle) * radius),
            ),
          )
        }
      }
      const select = onSelectJoint ? () => onSelectJoint(id) : undefined
      // When the torque plane is seen edge-on, show a second, axial view
      // inside the label. Looking down the positive axis, rotation is CCW.
      const alongAxis = axis.dot(camera.getWorldDirection(new Vector3()))
      const axial =
        points.length && Math.abs(alongAxis) < 0.27
          ? Array.from({ length: 21 }, (_, k) => {
              const a = -0.55 + (k * sweep) / 20
              return { x: -Math.sin(a) * 7, y: -Math.cos(a) * 7 }
            })
          : undefined
      labels.push(
        <Label
          key={id}
          x={rowX(i, joints.length, momentWidth)}
          y={height - 37}
          width={momentWidth}
          id={id}
          anchor={anchor}
          value={formatMoment(moment.magnitudeNm)}
          name={jointNames[id]}
          color={jointInk}
          below
          select={select}
          axial={axial}
        />,
      )
      return (
        <g data-moment={id} key={id} color={jointInk}>
          <Arrow points={points} className="mechanics-arc" />
          <circle cx={anchor.x} cy={anchor.y} r={3.2} className="mechanics-pivot" />
          {select && (
            <circle cx={anchor.x} cy={anchor.y} r={12} className="mechanics-hit" onClick={select} />
          )}
        </g>
      )
    })
  const lever =
    showBarArm &&
    !vectorsOnly &&
    joint !== 'all' &&
    (() => {
      const at = arm[joint],
        foot = { ...arm.grip, y: at.y },
        a = project(at),
        b = project(foot)
      const distance = Math.hypot(at.x - foot.x, at.z - foot.z)
      return (
        <g className="mechanics-lever">
          <path className="mechanics-gravity-line" d={pathOf([project(arm.grip), b])} />
          <path d={pathOf([a, b])} />
          <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} className="bench-arm-value">
            {formatBarArm(distance)}
          </text>
        </g>
      )
    })()
  return (
    <svg
      className="mechanics-overlay bench-annotations"
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-labelledby={title}
    >
      <title id={title}>
        {vectorsOnly
          ? 'Fuerzas durante la edición del press de banca'
          : 'Fuerzas externas y momentos internos por brazo durante el press de banca'}
      </title>
      {labels}
      {lever}
      {momentVectors}
      {forceVectors}
      {forceLabels}
    </svg>
  )
}
