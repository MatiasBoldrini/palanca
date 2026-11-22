import { useId, type CSSProperties } from 'react'
import { BENCH_GRIP } from '../model/bench'
import { formatBarArm } from '../model/mechanicsOverlay'
import './benchGripControl.css'

interface Props {
  ratio: number
  widthM: number
  onChange: (ratio: number) => void
}

export function BenchGripControl({ ratio, widthM, onChange }: Props) {
  const id = useId()
  const width = formatBarArm(widthM)
  const relative = ratio.toLocaleString('es-AR')
  const rangeHint = `Entre ${BENCH_GRIP.min} y ${BENCH_GRIP.max} veces el ancho de hombros`
  const percent = ((ratio - BENCH_GRIP.min) / (BENCH_GRIP.max - BENCH_GRIP.min)) * 100

  return (
    <div className="bench-grip-control">
      <label htmlFor={id}>Agarre</label>
      <input
        id={id}
        type="range"
        aria-label="Ancho de agarre"
        aria-description={rangeHint}
        aria-valuetext={`${width} entre manos, ${relative} veces el ancho de hombros`}
        title={`${relative}× hombros · ${rangeHint}`}
        min={BENCH_GRIP.min}
        max={BENCH_GRIP.max}
        step={0.05}
        value={ratio}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        style={{ '--pct': `${percent}%` } as CSSProperties}
      />
      <span className="bench-grip-width" aria-hidden="true">
        {width}
      </span>
    </div>
  )
}
