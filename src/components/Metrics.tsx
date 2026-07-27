import type { Frame } from '../model/lift'

export interface MetricRow {
  key: string
  label: string
  unit: string
  value: number
  /** Decimals to show. */
  digits: number
}

const fmt = (v: number, digits: number) => {
  // Values that round to zero should not carry a stray minus sign.
  const rounded = Number(v.toFixed(digits)) + 0
  return rounded.toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function buildRows(f: Frame): MetricRow[] {
  const rows: [string, string, string, number, number][] = [
    ['barHeight', 'Altura de la barra', 'cm', 1, f.barHeight * 100],
    ['barX', 'Barra respecto al mediopié', 'cm', 1, f.posture.bar.x * 100],
    ['cop', 'Centro de presión', 'cm', 1, f.centreOfPressure * 100],
    ['tibia', 'Ángulo de tibia', '°', 1, f.angles.tibia],
    ['knee', 'Flexión de rodilla', '°', 1, f.angles.kneeFlexion],
    ['trunk', 'Torso desde la vertical', '°', 1, 90 - f.angles.trunk],
    ['hipArm', 'Barra por delante de la cadera', 'cm', 1, f.kinetics.barMomentArm.hip * 100],
    ['kneeArm', 'Barra por delante de la rodilla', 'cm', 1, f.kinetics.barMomentArm.knee * 100],
    ['mHip', 'Momento de cadera', 'N·m', 0, f.kinetics.moment.hip],
    ['mKnee', 'Momento de rodilla', 'N·m', 0, f.kinetics.moment.knee],
    ['mAnkle', 'Momento de tobillo', 'N·m', 0, f.kinetics.moment.ankle],
    ['mL5', 'Momento en L5/S1', 'N·m', 0, f.kinetics.moment.l5s1],
    ['dom', 'Índice rodilla / cadera', '', 2, f.kinetics.kneeDominance],
    ['comp', 'Compresión lumbar estimada', 'N', 0, f.kinetics.lumbarCompression],
  ]
  return rows.map(([key, label, unit, digits, value]) => ({ key, label, unit, digits, value }))
}

export function MetricsTable({ rows }: { rows: MetricRow[] }) {
  return (
    <div className="metrics">
      {rows.map((row) => (
        <div className="metrics-row" key={row.key}>
          <span className="metrics-label">
            {row.label}
            {row.unit && <em>{row.unit}</em>}
          </span>
          <span className="metrics-value num">{fmt(row.value, row.digits)}</span>
        </div>
      ))}
    </div>
  )
}

/** Mechanical work of the whole lift — kept big and short on purpose. */
export function WorkReadout({ work }: { work: number }) {
  return (
    <p className="work-readout" aria-label={`Trabajo del levantamiento, ${Math.round(work)} julios`}>
      <span>W</span>
      <b className="num">{Math.round(work).toLocaleString('es-AR')} J</b>
    </p>
  )
}
