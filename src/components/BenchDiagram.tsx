import { useId, useState } from 'react'
import type { BenchFrame, BenchJointId, BenchPoint } from '../model/bench'
import type { BenchPartId } from '../model/bodyEditing'
import { benchBodyTargets } from '../model/benchBodyParts'
import { formatForce, formatMoment } from '../model/mechanicsOverlay'

import { BENCH_JOINTS, benchContactForces, benchForces } from '../model/benchOverlay'

interface Props {
  frame: BenchFrame
  height: number
  joint: BenchJointId | 'all'
  forces: boolean
  loadPath: boolean
  moments: boolean
  lever: boolean
  peak: number
  editingBody: boolean
  editForces: boolean
  editPart: BenchPartId
  onEditPart: (id: BenchPartId) => void
}

export function BenchDiagram({
  frame: f,
  height,
  joint,
  forces,
  loadPath,
  moments,
  lever,
  peak,
  editingBody,
  editForces,
  editPart,
  onEditPart,
}: Props) {
  const uid = useId()
  const [front, setFront] = useState(false)
  const scale = 295 / height
  const x = (p: BenchPoint) => (front ? 260 + p.z * scale : 332 + p.x * scale)
  const y = (p: BenchPoint) => 260 - p.y * scale
  const xy = (p: BenchPoint) => x(p) + ',' + y(p)
  const proj = (points: BenchPoint[]) => points.map(xy).join(' ')
  const benchY = 260 - f.benchHeight * scale
  const arm = f.arms[0]
  const arrows = loadPath ? benchContactForces(f) : benchForces(f)
  const lanes: { x: number; top: number; bottom: number }[] = []
  // In profile, left and right contacts project to the same point. Shift the shaft,
  // retaining a short connector to its actual contact.
  const projected = arrows.map((force) => {
    const originX = x(force.anchor)
    const originY = y(force.anchor)
    const endY = originY - (80 * force.verticalN) / Math.max(1, -f.forces.barN - f.forces.bodyN)
    const top = Math.min(originY, endY)
    const bottom = Math.max(originY, endY)
    const offset =
      [0, -11, 11, -22, 22, -33, 33].find((dx) =>
        lanes.every(
          (lane) =>
            Math.abs(lane.x - originX - dx) > 9 || top - 3 > lane.bottom || bottom + 3 < lane.top,
        ),
      ) ?? 0
    const shaftX = originX + offset
    lanes.push({ x: shaftX, top, bottom })
    return { force, originX, originY, shaftX, endY }
  })
  return (
    <div className="bench-diagram">
      <svg
        viewBox="45 12 425 268"
        role="group"
        aria-label={'Diagrama de banca ' + (front ? 'desde los pies' : 'de perfil')}
      >
        <defs>
          <marker
            id={uid}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="3.5"
            markerHeight="3.5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L8 4L0 8Z" fill="context-stroke" />
          </marker>
        </defs>
        <path d="M55 260H460" stroke="#aca89c" />
        <rect
          x={front ? 235 : 332 - 0.945 * scale}
          y={benchY}
          width={front ? 50 : 1.35 * scale}
          height="8"
          rx="3"
          fill="#58655f"
        />
        <path
          d={
            front
              ? 'M245 ' + (benchY + 8) + 'V260M275 ' + (benchY + 8) + 'V260'
              : 'M' +
                (332 - 0.76 * scale) +
                ' ' +
                (benchY + 8) +
                'V260M' +
                (332 + 0.24 * scale) +
                ' ' +
                (benchY + 8) +
                'V260'
          }
          stroke="#7c8981"
          strokeWidth="5"
        />
        <g
          fill="none"
          stroke="#746f63"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {f.pose.legs.map((leg, i) => (
            <g key={i}>
              <polyline points={proj([leg.hip, leg.knee, leg.ankle])} />
              <polyline points={proj([leg.heel, leg.ankle, leg.toe])} strokeWidth="6" />
            </g>
          ))}
          <polyline points={proj([f.pose.hip, f.pose.chest, f.pose.neck])} strokeWidth="19" />
          <ellipse
            cx={x(f.pose.head)}
            cy={y(f.pose.head)}
            rx="11"
            ry="12"
            fill="#cbb59d"
            strokeWidth="2"
          />
          {f.arms.map((a, i) => (
            <polyline
              key={i}
              points={proj([a.shoulder, a.elbow, a.wrist, a.grip])}
              strokeWidth="7"
              stroke="#af735c"
            />
          ))}
        </g>
        <g className="diagram-edit-target" onClick={() => onEditPart('bar')}>
          <line
            x1={x(f.bar) - (front ? 124 : 0)}
            x2={x(f.bar) + (front ? 124 : 0)}
            y1={y(f.bar)}
            y2={y(f.bar)}
            stroke="#4c5553"
            strokeWidth="5"
          />
          {front ? (
            [-111, 111].map((d) => (
              <rect
                key={d}
                x={x(f.bar) + d - 4}
                y={y(f.bar) - 20}
                width="8"
                height="40"
                rx="2"
                fill="#4c5553"
              />
            ))
          ) : (
            <circle cx={x(f.bar)} cy={y(f.bar)} r="15" fill="#4c5553" opacity=".65" />
          )}
        </g>
        {(editingBody ? editForces : forces) &&
          projected.map(({ force, originX, originY, shaftX, endY }) => {
            const head = Math.min(7.5, Math.abs(originY - endY) * 0.48)
            const baseY = endY + Math.sign(originY - endY) * head
            return (
              <g
                key={force.id}
                data-force={force.id}
                color={force.color}
                data-force-kind={
                  force.id === 'body'
                    ? 'body'
                    : force.id === 'bar' || force.id.startsWith('hand-')
                      ? 'bar'
                      : 'support'
                }
              >
                <title>
                  {force.label} · {formatForce(force.verticalN)}{' '}
                  {force.verticalN < 0 ? 'hacia abajo' : 'hacia arriba'}
                </title>
                {originX !== shaftX && (
                  <line
                    x1={originX}
                    x2={shaftX}
                    y1={originY}
                    y2={originY}
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeDasharray="2 1.5"
                  />
                )}
                <line
                  x1={shaftX}
                  x2={shaftX}
                  y1={originY}
                  y2={baseY}
                  stroke="#fffdf5"
                  strokeWidth="5.5"
                />
                <line
                  x1={shaftX}
                  x2={shaftX}
                  y1={originY}
                  y2={baseY}
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <polygon
                  points={`${shaftX},${endY} ${shaftX - head * 0.65},${baseY} ${shaftX + head * 0.65},${baseY}`}
                  fill="currentColor"
                  stroke="#fffdf5"
                  strokeWidth="1.7"
                  paintOrder="stroke"
                />
                <circle
                  cx={originX}
                  cy={originY}
                  r="2.8"
                  fill="#fffdf5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </g>
            )
          })}
        {!editingBody &&
          moments &&
          BENCH_JOINTS.filter((j) => joint === 'all' || j.id === joint).map((j) => {
            const p = arm[j.id],
              m = arm.moments[j.id],
              component = front ? -m.x : m.z
            const angle = Math.min(
              Math.PI * 1.4,
              (Math.abs(component) / Math.max(1, peak)) * Math.PI * 1.4,
            )
            const sign = Math.sign(component),
              r = j.id === 'shoulder' ? 21 : 15
            const cx = x(p),
              cy = y(p)
            return (
              <g key={j.id}>
                <title>
                  {j.label} · componente en esta vista {formatMoment(component)}
                </title>
                <circle cx={cx} cy={cy} r="3" fill="#754493" />
                {Math.abs(component) >= 0.5 && (
                  <path
                    d={
                      'M ' +
                      (cx + r) +
                      ' ' +
                      cy +
                      ' A ' +
                      r +
                      ' ' +
                      r +
                      ' 0 ' +
                      (angle > Math.PI ? 1 : 0) +
                      ' ' +
                      (sign === 1 ? 0 : 1) +
                      ' ' +
                      (cx + r * Math.cos(angle)) +
                      ' ' +
                      (cy - sign * r * Math.sin(angle))
                    }
                    fill="none"
                    stroke="#754493"
                    strokeWidth="2.5"
                    markerEnd={'url(#' + uid + ')'}
                  />
                )}
              </g>
            )
          })}
        {!editingBody && lever && joint !== 'all' && (
          <g stroke="#696177" strokeDasharray="3 2">
            <line x1={x(arm[joint])} y1={y(arm[joint])} x2={x(arm.grip)} y2={y(arm[joint])} />
            <line x1={x(arm.grip)} x2={x(arm.grip)} y1={y(arm.grip)} y2={y(arm[joint])} />
          </g>
        )}
        {benchBodyTargets(f).map((target) => (
          <g
            className="diagram-edit-target"
            key={target.id}
            role="button"
            aria-label={'Ajustar ' + target.label}
            aria-pressed={editingBody && editPart === target.id}
            tabIndex={0}
            onClick={() => onEditPart(target.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onEditPart(target.id)
              }
            }}
          >
            <title>{'Ajustar ' + target.label}</title>
            {target.id !== 'bar' && target.id !== 'grip' && (
              <polyline
                points={proj(target.segment)}
                fill="none"
                stroke="transparent"
                strokeWidth="16"
              />
            )}
            {front && target.id !== 'bar' && target.id !== 'torso' && (
              <g transform="translate(520 0) scale(-1 1)">
                {target.id !== 'grip' && (
                  <polyline
                    points={proj(target.segment)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                  />
                )}
                <circle cx={x(target.point)} cy={y(target.point)} r="9" fill="transparent" />
              </g>
            )}
            {target.id === 'bar' && !front && (
              <circle
                cx={x(f.bar)}
                cy={y(f.bar)}
                r="14"
                fill="none"
                stroke="transparent"
                strokeWidth="8"
              />
            )}
            <g transform={'translate(' + xy(target.point) + ')'}>
              {(target.id !== 'bar' || front || editingBody) && <circle r="9" fill="transparent" />}
              {editingBody && (
                <>
                  <circle className="edit-pin" r="4.5" />
                  <path d="M-2 0H2M0 -2V2" fill="none" stroke="#fff" strokeWidth="1" />
                </>
              )}
            </g>
          </g>
        ))}
      </svg>
      <label className="diagram-plane">
        Vista{' '}
        <select
          value={front ? 'feet' : 'side'}
          onChange={(e) => setFront(e.target.value === 'feet')}
        >
          <option value="side">Perfil</option>
          <option value="feet">Desde los pies</option>
        </select>
      </label>
    </div>
  )
}
