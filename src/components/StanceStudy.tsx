import { ChevronDown, GitCompareArrows } from 'lucide-react'
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Anthropometry } from '../model/anthropometry'
import { clamp, lerp } from '../model/geometry'
import { feasibleRange, type Range } from '../model/interact'
import {
  solveFrame,
  type Coordination,
  type ExerciseId,
  type Frame,
  type Series,
  type Task,
} from '../model/lift'
import { defaultStanceWidth, getStance, stanceWidthRange } from '../model/stance'
import { formatBarArm } from '../model/mechanicsOverlay'
import './StanceStudy.css'

interface SetupProps {
  exercise: ExerciseId
  anthro: Anthropometry
  coordination: Coordination
}

function wideSquat(anthro: Anthropometry) {
  const { min, max } = stanceWidthRange('squat', anthro)
  return clamp(1.6 * defaultStanceWidth('squat', anthro.height), min, max)
}

export function StanceControls({
  exercise,
  anthro,
  coordination,
  onChange,
}: SetupProps & { onChange: (patch: Partial<Coordination>) => void }) {
  const [widthOpen, setWidthOpen] = useState(false)
  const widthPanelId = useId()
  const widthButton = useRef<HTMLButtonElement>(null)
  const stance = getStance(exercise, anthro, coordination)
  const style = coordination.deadliftStyle ?? 'conventional'
  const deadlift = exercise === 'deadlift'
  const range = stanceWidthRange(exercise, anthro, style)
  const normal = defaultStanceWidth(exercise, anthro.height)
  const wide = wideSquat(anthro)
  const centimetres = Math.round(stance.width * 100)
  const minWidth = Math.ceil(range.min * 100)
  const maxWidth = Math.floor(range.max * 100)
  const widthFraction = clamp((centimetres - minWidth) / (maxWidth - minWidth || 1), 0, 1)
  const preset = deadlift
    ? style === 'sumo'
      ? 1
      : 0
    : [normal, wide].findIndex((width) => Math.abs(stance.width - width) < 0.005)
  const names = deadlift ? ['Convencional', 'Sumo'] : ['Base media', 'Base amplia']
  return (
    <div className="stance-controls">
      <div className="stance-choices" role="group" aria-label="Variante de la base">
        {names.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={index === preset}
            onClick={() => {
              if (index === preset) return
              onChange(
                deadlift
                  ? {
                      deadliftStyle: index === 0 ? 'conventional' : 'sumo',
                      stanceWidth: undefined,
                      toeOutDeg: undefined,
                    }
                  : { stanceWidth: index === 0 ? undefined : wide, toeOutDeg: undefined },
              )
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        ref={widthButton}
        className="stance-width-trigger"
        type="button"
        aria-label={`Ajustar la separación entre los pies, ${centimetres} cm`}
        aria-expanded={widthOpen}
        aria-controls={widthPanelId}
        onClick={() => setWidthOpen(!widthOpen)}
      >
        {centimetres} cm <ChevronDown size={14} aria-hidden />
      </button>
      <div
        id={widthPanelId}
        className="stance-width-panel"
        hidden={!widthOpen}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          setWidthOpen(false)
          widthButton.current?.focus({ preventScroll: true })
        }}
      >
        <label htmlFor={`${widthPanelId}-slider`}>Separación</label>
        <input
          id={`${widthPanelId}-slider`}
          type="range"
          aria-label="Separación entre los pies"
          aria-valuetext={`${centimetres} cm`}
          disabled={maxWidth <= minWidth}
          min={minWidth}
          max={maxWidth}
          value={centimetres}
          step={1}
          style={{ '--pct': `${widthFraction * 100}%` } as CSSProperties}
          onChange={(event) => onChange({ stanceWidth: event.currentTarget.valueAsNumber / 100 })}
        />
        <span>Puntas a {Math.round(stance.toeOut)}°</span>
      </div>
    </div>
  )
}

interface ComparisonProps extends SetupProps {
  frame: Frame
  onUseStance: (stance: Partial<Coordination>, progress: number) => void
  onJoint: (joint: 'hip' | 'knee') => void
  series: Series
  range: Range
  progress: number
  task: Task
}

export function StanceComparison({
  exercise,
  anthro,
  coordination,
  frame,
  series,
  range,
  progress,
  task,
  onJoint,
  onUseStance,
}: ComparisonProps) {
  const alternative = useMemo(() => {
    const normal = defaultStanceWidth(exercise, anthro.height)
    const style = coordination.deadliftStyle ?? 'conventional'
    const standard =
      exercise === 'deadlift'
        ? style === 'conventional'
        : Math.abs(getStance(exercise, anthro, coordination).width - normal) < 0.005
    const name =
      exercise === 'squat' ? (standard ? 'Amplia' : 'Media') : standard ? 'Sumo' : 'Convencional'
    const patch: Partial<Coordination> = {
      ...(exercise === 'deadlift' ? { deadliftStyle: standard ? 'sumo' : 'conventional' } : {}),
      stanceWidth: exercise === 'squat' && standard ? wideSquat(anthro) : undefined,
      toeOutDeg: undefined,
    }
    const other = { ...coordination, ...patch }
    const bounds = feasibleRange('progress', { exercise, anthro, coordination: other, task })
    const low = solveFrame(exercise, anthro, { ...task, progress: bounds.min }, other)
    const high = solveFrame(exercise, anthro, { ...task, progress: bounds.max }, other)
    return {
      name,
      patch,
      other,
      bounds,
      width: low.stance.width,
      travel: Math.abs(high.barHeight - low.barHeight),
    }
  }, [exercise, anthro, coordination, task])
  const fraction = clamp((progress - range.min) / (range.max - range.min || 1), 0, 1)
  const referenceProgress = lerp(alternative.bounds.min, alternative.bounds.max, fraction)
  const ref = useMemo(
    () => solveFrame(exercise, anthro, { ...task, progress: referenceProgress }, alternative.other),
    [exercise, anthro, task, alternative, referenceProgress],
  )
  const travel = Math.abs(
    series.points[series.points.length - 1].barHeight - series.points[0].barHeight,
  )
  const rows: [string, number, number, string][] = [
    ['Separación de pies', 100 * frame.stance.width, 100 * alternative.width, ' cm'],
    ['Inclinación del tronco', 90 - frame.angles.trunk, 90 - ref.angles.trunk, '°'],
    ['Flexión de cadera', frame.angles.hipFlexion, ref.angles.hipFlexion, '°'],
    ['Flexión de rodilla', frame.angles.kneeFlexion, ref.angles.kneeFlexion, '°'],
    ['Momento de cadera', frame.kinetics.moment.hip, ref.kinetics.moment.hip, ' N·m'],
    ['Momento de rodilla', frame.kinetics.moment.knee, ref.kinetics.moment.knee, ' N·m'],
    ['Recorrido de la barra', 100 * travel, 100 * alternative.travel, ' cm'],
  ]
  const currentLabel =
    exercise === 'deadlift'
      ? coordination.deadliftStyle === 'sumo'
        ? 'Sumo'
        : 'Convencional'
      : Math.abs(frame.stance.width - defaultStanceWidth('squat', anthro.height)) < 0.005
        ? 'Media'
        : Math.abs(frame.stance.width - wideSquat(anthro)) < 0.005
          ? 'Amplia'
          : 'A medida'
  return (
    <section
      className="atlas-card moments-card stance-comparison"
      id="stance-comparison"
      aria-labelledby="stance-heading"
      tabIndex={-1}
    >
      <h2 id="stance-heading" className="rail-title">
        <GitCompareArrows size={19} aria-hidden />
        Comparar posturas
      </h2>
      <p className="rail-intro">
        Misma carga y proporciones, al {Math.round(fraction * 100)} % del recorrido de cada postura.
      </p>
      {frame.feasible && ref.feasible ? (
        <>
          <p className="stance-lever-title">Distancia de la cadera a la línea de la barra</p>
          <dl className="stance-levers">
            <div>
              <dt>{currentLabel}</dt>
              <dd>{formatBarArm(frame.kinetics.barMomentArm.hip)}</dd>
            </div>
            <div>
              <dt>{alternative.name}</dt>
              <dd>{formatBarArm(ref.kinetics.barMomentArm.hip)}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="apply-stance"
            onClick={() => onUseStance(alternative.patch, referenceProgress)}
          >
            Ver {alternative.name.toLocaleLowerCase('es-AR')} en 3D
          </button>
        </>
      ) : (
        <p className="moment-note">
          El modelo no encontró ambas posturas en equilibrio para esta fase del recorrido.
        </p>
      )}
      <details className="stance-measurements">
        <summary>
          <span className="stance-measures-show">Ver medidas</span>
          <span className="stance-measures-hide">Ocultar medidas</span>
          <ChevronDown size={14} aria-hidden />
        </summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Medida</th>
              <th scope="col">Actual</th>
              <th scope="col">{alternative.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, first, second, unit]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{frame.feasible ? (Math.round(first) || 0) + unit : '—'}</td>
                <td>{ref.feasible ? (Math.round(second) || 0) + unit : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="moment-note">
          {frame.feasible && ref.feasible
            ? 'El tronco se mide desde la vertical. Los momentos se calculan de perfil y por pierna. Un valor positivo indica demanda de extensión.'
            : 'Una raya indica que el modelo no encontró una postura en equilibrio para esa configuración.'}
        </p>
      </details>
      <div className="stance-presets study-joints">
        <button onClick={() => onJoint('hip')}>Seguir cadera</button>
        <button onClick={() => onJoint('knee')}>Seguir rodilla</button>
      </div>
    </section>
  )
}
