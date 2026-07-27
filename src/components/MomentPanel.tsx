import { useMemo } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import type { Frame, Series } from '../model/lift'
import { JOINT_ROWS, describeSplit } from './loadShare'
import { JOINT_COLOR } from './palette'

/** On a phone the column would otherwise eat a third of the drawing's width. */
const SIZE = {
  wide: { w: 104, h: 26 },
  narrow: { w: 72, h: 19 },
}

const fmtMoment = (v: number) => `${Math.round(Math.abs(v)).toLocaleString('es-AR')} N·m`

/**
 * Where the load sits across the lift: one sparkline per joint. The four
 * charts share a scale relative to the heaviest moment this lift produces
 * anywhere, so a curve flat along the bottom means that joint is barely
 * working rather than that its chart is boring.
 */
export function MomentPanel({
  series,
  frame,
  progress,
  curves,
}: {
  series: Series
  frame: Frame
  progress: number
  curves: boolean
}) {
  const narrow = useMediaQuery('(max-width: 619px)')
  const { w: W, h: H } = narrow ? SIZE.narrow : SIZE.wide

  const charts = useMemo(() => {
    const values = series.points.flatMap((p) => JOINT_ROWS.map((j) => p[j.key]))
    const top = Math.max(...values, 1)
    const bottom = Math.min(...values, 0)
    const span = top - bottom || 1

    const x = (t: number) => t * W
    const y = (v: number) => H - 2 - ((v - bottom) / span) * (H - 4)

    const last = series.points.length - 1
    const index = Math.min(Math.max(Math.round(progress * last), 0), last)
    const here = series.points[index]
    const cursor = x(here.progress)

    return {
      zeroY: bottom < 0 ? y(0) : null,
      cursor,
      items: JOINT_ROWS.map((joint) => {
        const line = series.points
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.progress)} ${y(p[joint.key])}`)
          .join(' ')
        return {
          ...joint,
          line,
          area: `${line} L ${x(1)} ${y(bottom)} L ${x(0)} ${y(bottom)} Z`,
          dotY: y(here[joint.key]),
          value: here[joint.key],
        }
      }),
    }
  }, [series, progress, W, H])

  // On a phone the column is already tight; the charts carry the answer.
  const headline = narrow ? null : (
    <p className="moment-headline">{describeSplit(frame.kinetics.kneeDominance)}</p>
  )

  if (!curves) {
    return headline ? <div className="moment-panel">{headline}</div> : null
  }

  return (
    <div className={narrow ? 'moment-panel narrow' : 'moment-panel'}>
      {headline}
      {charts.items.map((chart) => (
        <div className="moment-chart" key={chart.key}>
          <span style={{ color: JOINT_COLOR[chart.key] }}>{chart.label}</span>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <title>{`${chart.label}: ${fmtMoment(chart.value)}`}</title>
            {charts.zeroY !== null && (
              <line
                x1="0"
                x2={W}
                y1={charts.zeroY}
                y2={charts.zeroY}
                stroke="var(--grid)"
                strokeWidth="1"
              />
            )}
            <path d={chart.area} fill={JOINT_COLOR[chart.key]} opacity="0.16" />
            <path
              d={chart.line}
              fill="none"
              stroke={JOINT_COLOR[chart.key]}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1={charts.cursor}
              x2={charts.cursor}
              y1="0"
              y2={H}
              stroke="var(--hairline-strong)"
              strokeWidth="1"
            />
            <circle cx={charts.cursor} cy={chart.dotY} r="2.4" fill={JOINT_COLOR[chart.key]} />
          </svg>
        </div>
      ))}
    </div>
  )
}
