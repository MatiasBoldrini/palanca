import { useMemo } from 'react'
import type { Frame, Series } from '../model/lift'
import type { JointKey } from '../model/kinetics'
import { JOINT_ROWS } from './loadShare'
import { JOINT_COLOR } from './palette'

const WIDTH = 120
const HEIGHT = 29
const fmtMoment = (value: number) => `${(Math.round(value) || 0).toLocaleString('es-AR')} N·m`

export function MomentPanel({
  series,
  frame,
  progress,
  curves,
  selected,
  onSelectJoint,
}: {
  series: Series
  frame: Frame
  progress: number
  curves: boolean
  selected: JointKey | 'all'
  onSelectJoint: (joint: JointKey) => void
}) {
  // The traces are fixed for a setup. Only the live value and cursor move.
  const charts = useMemo(() => {
    const values = series.points.flatMap((point) => JOINT_ROWS.map((joint) => point[joint.key]))
    const first = series.points[0]
    const last = series.points[series.points.length - 1]
    const width = last.progress - first.progress
    const x = (at: number) => (width > 0 ? (WIDTH * (at - first.progress)) / width : 0)
    const top = Math.max(1, ...values)
    const bottom = Math.min(0, ...values)
    const y = (value: number) => HEIGHT - 3 - ((value - bottom) / (top - bottom)) * (HEIGHT - 6)
    return {
      x,
      y,
      zeroY: y(0),
      items: JOINT_ROWS.map((joint) => ({
        ...joint,
        description: `${joint.label}. Al comienzo del recorrido, ${fmtMoment(first[joint.key])}. Al final, ${fmtMoment(last[joint.key])}.`,
        line: series.points
          .map((point, i) => `${i ? 'L' : 'M'} ${x(point.progress)} ${y(point[joint.key])}`)
          .join(' '),
      })),
    }
  }, [series])
  const cursor = charts.x(progress)

  return (
    <div className="moment-panel">
      {charts.items.map((chart) => {
        const value = frame.kinetics.moment[chart.key]
        return (
          <button
            className="moment-chart"
            key={chart.key}
            aria-pressed={selected === chart.key}
            onClick={() => onSelectJoint(chart.key)}
          >
            <span className="moment-label">
              {chart.key === 'l5s1' ? 'Lumbar · L5/S1' : chart.label}
            </span>
            <span className="moment-value num">{fmtMoment(value)}</span>
            {curves && (
              <svg
                viewBox={`-3 0 ${WIDTH + 6} ${HEIGHT}`}
                width={WIDTH + 6}
                height={HEIGHT}
                role="img"
                aria-label={chart.description}
                preserveAspectRatio="none"
              >
                <line x1="0" x2={WIDTH} y1={charts.zeroY} y2={charts.zeroY} stroke="var(--grid)" />
                <path
                  d={chart.line}
                  stroke={JOINT_COLOR[chart.key]}
                  fill="none"
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <line x1={cursor} x2={cursor} y1="0" y2={HEIGHT} stroke="var(--hairline-strong)" />
                <circle cx={cursor} cy={charts.y(value)} r="2.5" fill={JOINT_COLOR[chart.key]} />
              </svg>
            )}
          </button>
        )
      })}
      <p className="moment-note">
        Cadera, rodilla y tobillo por pierna. L5/S1 incluye ambos lados.
      </p>
    </div>
  )
}
