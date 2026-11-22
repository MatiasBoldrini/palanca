import { useId, type ReactNode } from 'react'
import { Vector3 } from 'three'
import type { OrthographicCamera } from 'three'
import type { BenchFrame, BenchJointId, BenchPoint } from '../model/bench'
import { benchForces } from '../model/benchOverlay'
import type { BenchPeaks } from '../anatomy/benchRig'
import { formatBarArm, formatForce, formatMoment } from '../model/mechanicsOverlay'

export interface BenchProjection {
  camera: OrthographicCamera
  width: number
  height: number
}
export interface BenchMechanicsProps {
  frame: BenchFrame
  showForces: boolean
  showMoments: boolean
  joint: BenchJointId | 'all'
  showBarArm?: boolean
  peaks?: BenchPeaks
  onSelectJoint?: (joint: BenchJointId) => void
}
const jointNames = { shoulder: 'Hombro', elbow: 'Codo', wrist: 'Muñeca' }
const jointInk = '#754493'
const shortNames: Record<string, string> = {
  bar: 'Peso barra',
  body: 'Peso cuerpo',
  bench: 'Apoyo banco',
  feet: 'Apoyo pies',
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
  frame,
  showForces,
  showMoments,
  joint,
  peaks,
  showBarArm,
  onSelectJoint,
}: BenchMechanicsProps & { projection: BenchProjection }) {
  const title = useId()
  const { camera, width, height } = projection
  const project = (at: BenchPoint) => {
    const p = asVector(at).project(camera)
    return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 }
  }
  // Order labels by their actual points of application from this viewpoint.
  const forces = benchForces(frame).sort((a, b) => project(a.anchor).x - project(b.anchor).x)
  const arm = frame.arms[camera.position.z >= 0 ? 0 : 1]
  const joints = joint === 'all' ? allJoints : [joint]
  const systemWeight = Math.abs(frame.forces.barN + frame.forces.bodyN)
  const momentPeak = Math.max(
    1,
    ...Object.values(peaks ?? {}),
    ...allJoints.map((id) => arm.moments[id].magnitudeNm),
  )
  const gap = 4
  const forceWidth = Math.min(102, (width - 5 * gap) / 4)
  const momentWidth = Math.min(113, (width - (joints.length + 1) * gap) / joints.length)
  const rowX = (i: number, n: number, w: number) => (width - n * w - (n - 1) * gap) / 2 + i * (w + gap)
  const labels: ReactNode[] = []
  const occupied: { x: number; top: number; bottom: number }[] = []
  const forceVectors =
    showForces &&
    forces.map(({ id, verticalN: value, anchor: at, color }, i) => {
      const anchor = project(at)
      const tip = project({ ...at, y: at.y + (0.55 * value) / systemWeight })
      const top = Math.min(anchor.y, tip.y),
        bottom = Math.max(anchor.y, tip.y)
      // Separate forces that project onto the same line, keeping each real
      // application point connected to its translated arrow.
      const offset =
        [0, -13, 13, -26, 26, -39, 39].find((dx) =>
          occupied.every(
            (prev) =>
              Math.abs(prev.x - anchor.x - dx) >= 11 || bottom < prev.top - 4 || top > prev.bottom + 4,
          ),
        ) ?? 0
      const start = { x: anchor.x + offset, y: anchor.y }
      tip.x += offset
      occupied.push({ x: start.x, top, bottom })
      labels.push(
        <Label
          key={id}
          x={rowX(i, 4, forceWidth)}
          y={4}
          width={forceWidth}
          id={id}
          anchor={tip}
          value={formatForce(value)}
          name={shortNames[id]}
          color={color}
          below={false}
        />,
      )
      return (
        <g data-force={id} key={id} color={color}>
          {offset !== 0 && <path className="mechanics-offset" d={pathOf([anchor, start])} />}
          <Arrow points={[start, tip]} className="mechanics-vector" />
          <circle cx={anchor.x} cy={anchor.y} r={3} className="mechanics-force-origin" />
        </g>
      )
    })
  const momentVectors =
    showMoments &&
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
          {select && <circle cx={anchor.x} cy={anchor.y} r={12} className="mechanics-hit" onClick={select} />}
        </g>
      )
    })
  const lever =
    showBarArm &&
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
      <title id={title}>Fuerzas externas y momentos internos por brazo durante el press de banca</title>
      {labels}
      {lever}
      {forceVectors}
      {momentVectors}
    </svg>
  )
}
