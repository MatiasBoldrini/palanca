import { useMemo } from 'react'
import {
  type HotspotId,
  type ParamId,
  type Setup,
  feasibleRange,
  paramValue,
  paramsFor,
} from '../model/interact'
import type { Frame } from '../model/lift'
import { PARAM_UI } from './params'
import { Segmented, Slider } from './ui'


function ParamSlider({
  id,
  setup,
  accent,
  onChange,
}: {
  id: ParamId
  setup: Setup
  accent: string
  onChange: (id: ParamId, value: number) => void
}) {
  const ui = PARAM_UI[id]
  // Recomputed from the settled setup, so the end stops are the ones the
  // solver will honour rather than the nominal ones.
  const range = useMemo(() => feasibleRange(id, setup), [id, setup])

  const toSlider = (v: number) => Number((v * ui.scale).toFixed(4))
  const min = Math.ceil(toSlider(range.min) / ui.step) * ui.step
  const max = Math.floor(toSlider(range.max) / ui.step) * ui.step
  const value = Math.min(Math.max(toSlider(paramValue(id, setup)), min), max)

  if (max - min < ui.step) {
    return (
      <div className="param-locked">
        <span className="slider-label">{ui.label}</span>
        <span className="slider-value num">{ui.format(Number(value.toFixed(1)))}</span>
        <p className="caption">No se puede mover sin romper la postura.</p>
      </div>
    )
  }

  return (
    <Slider
      label={ui.label}
      value={Number(value.toFixed(2))}
      min={min}
      max={max}
      step={ui.step}
      accent={accent}
      format={(v) => ui.format(Number(v.toFixed(1)))}
      onChange={(v) => onChange(id, v / ui.scale)}
    />
  )
}

export function Inspector({
  hotspot,
  label,
  setup,
  frame,
  accent,
  onChange,
  onBalance,
  onClose,
}: {
  hotspot: HotspotId
  label: string
  setup: Setup
  frame: Frame
  accent: string
  onChange: (id: ParamId, value: number) => void
  onBalance: (balance: 'cop' | 'bar') => void
  onClose: () => void
}) {
  const params = paramsFor(hotspot, setup.exercise)
  const pinned = setup.task.balance === 'bar'
  // Where the bar sits and where the pressure falls are one decision: whoever
  // is not the input is the output, so the control for the output side is
  // replaced by its readout.
  const showsBalance =
    setup.exercise === 'deadlift' && (hotspot === 'bar' || hotspot === 'cop')

  return (
    <div className="popover">
      <header className="popover-head">
        <span className="popover-title" style={{ color: accent }}>
          {label}
        </span>
        <button className="popover-close" onClick={onClose} aria-label="Cerrar el ajuste">
          <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden>
            <path
              d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {showsBalance && (
        <Segmented
          value={setup.task.balance}
          groupId="balance-popover"
          size="sm"
          options={[
            { value: 'cop' as const, label: 'Sobre el pie' },
            { value: 'bar' as const, label: 'Barra fija' },
          ]}
          onChange={onBalance}
        />
      )}

      {params.map((id) => {
        if (id === 'barPosition' && !pinned) {
          return (
            <div className="param-locked" key={id}>
              <span className="slider-label">Respecto al mediopié</span>
              <span className="slider-value num">
                {(frame.posture.bar.x * 100).toFixed(1)} cm
              </span>
              <p className="caption">La resuelve el equilibrio. Pasá a «Barra fija».</p>
            </div>
          )
        }
        if (id === 'cop' && pinned) {
          return (
            <div className="param-locked" key={id}>
              <span className="slider-label">Punto de apoyo</span>
              <span className="slider-value num">
                {(frame.centreOfPressure * 100).toFixed(1)} cm
              </span>
              <p className="caption">Con la barra fija es un resultado, no una entrada.</p>
            </div>
          )
        }
        return <ParamSlider key={id} id={id} setup={setup} accent={accent} onChange={onChange} />
      })}
    </div>
  )
}
