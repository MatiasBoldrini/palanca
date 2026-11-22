import { useId, useState } from 'react'
import type { BenchFrame, BenchJointId, BenchPoint } from '../model/bench'
import { formatForce, formatMoment } from '../model/mechanicsOverlay'

import { BENCH_JOINTS, benchForces } from '../model/benchOverlay'

interface Props {
  frame: BenchFrame
  height: number
  joint: BenchJointId | 'all'
  forces: boolean
  moments: boolean
  lever: boolean
  peak: number
}

export function BenchDiagram({ frame: f, height, joint, forces, moments, lever, peak }: Props) {
  const uid = useId()
  const [front, setFront] = useState(false)
  const scale = 295 / height
  const x = (p: BenchPoint) => (front ? 260 + p.z * scale : 332 + p.x * scale)
  const y = (p: BenchPoint) => 260 - p.y * scale
  const xy = (p: BenchPoint) => x(p) + ',' + y(p)
  const proj = (points: BenchPoint[]) => points.map(xy).join(' ')
  const benchY = 260 - f.benchHeight * scale
  const arm = f.arms[0]
  return (
    <div className="bench-diagram">
      <svg
        viewBox="45 12 425 268"
        role="img"
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
          x={front ? 235 : x(f.pose.hip) - 10}
          y={benchY}
          width={front ? 50 : x(f.pose.head) - x(f.pose.hip) + 25}
          height="8"
          rx="3"
          fill="#58655f"
        />
        <path
          d={
            front
              ? 'M245 ' + (benchY + 8) + 'V260M275 ' + (benchY + 8) + 'V260'
              : 'M' +
                x(f.pose.hip) +
                ' ' +
                (benchY + 8) +
                'V260M' +
                x(f.pose.neck) +
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
            <polyline key={i} points={proj([leg.hip, leg.knee, leg.ankle, leg.toe])} />
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
        {forces &&
          benchForces(f).map((force) => {
            const end =
              y(force.anchor) -
              (76 * force.verticalN) / Math.max(1, -f.forces.barN - f.forces.bodyN)
            return (
              <g key={force.id}>
                <title>
                  {force.label} · {formatForce(force.verticalN)}
                </title>
                <circle cx={x(force.anchor)} cy={y(force.anchor)} r="2.8" fill={force.color} />
                <line
                  x1={x(force.anchor)}
                  x2={x(force.anchor)}
                  y1={y(force.anchor)}
                  y2={end}
                  stroke={force.color}
                  strokeWidth="3.5"
                  markerEnd={'url(#' + uid + ')'}
                />
              </g>
            )
          })}
        {moments &&
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
        {lever && joint !== 'all' && (
          <g stroke="#696177" strokeDasharray="3 2">
            <line x1={x(arm[joint])} y1={y(arm[joint])} x2={x(arm.grip)} y2={y(arm[joint])} />
            <line x1={x(arm.grip)} x2={x(arm.grip)} y1={y(arm.grip)} y2={y(arm[joint])} />
          </g>
        )}
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
