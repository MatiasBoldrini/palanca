import { ChevronDown, GitCompareArrows } from 'lucide-react'
import { useMemo } from 'react'
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
import { Slider } from './ui'
import { ControlDisclosure } from './ControlDisclosure'
import { StanceProfiles } from './StanceProfiles'
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

function StanceFootprint({
  width,
  turnout,
  height,
}: {
  width: number
  turnout: number
  height: number
}) {
  // Ground plan in units of stature so the same horizontal scale spans both deadlift styles.
  const separation = (width * 161) / height
  return (
    <svg
      className="stance-footprint"
      viewBox="0 0 126 66"
      role="img"
      aria-label={`Vista superior, centros de los pies separados ${Math.round(width * 100)} centímetros, pies girados ${Math.round(turnout)} grados hacia afuera`}
    >
      <path className="footprint-midline" d="M63 2V64" />
      <path className="footprint-measure" d={`M${63 - separation / 2} 34H${63 + separation / 2}`} />
      {[-1, 1].map((side) => (
        <g
          key={side}
          transform={`translate(${63 + (side * separation) / 2} 34) rotate(${turnout * side}) scale(${side} 1)`}
        >
          <path
            className="footprint-sole"
            transform="translate(0 9)"
            d="M-4 2C-5-3-2-8-4-12C-6-17-5-24-1-26C2-28 6-23 6-17C7-11 4-5 4 1C4 7-3 9-4 2Z"
          />
          <circle r="1.7" fill="#fffaf1" />
        </g>
      ))}
    </svg>
  )
}

export function StanceControls({
  exercise,
  anthro,
  coordination,
  onChange,
}: SetupProps & { onChange: (patch: Partial<Coordination>) => void }) {
  const stance = getStance(exercise, anthro, coordination)
  const style = coordination.deadliftStyle ?? 'conventional'
  const deadlift = exercise === 'deadlift'
  const range = stanceWidthRange(exercise, anthro, style)
  const normal = defaultStanceWidth(exercise, anthro.height)
  const wide = wideSquat(anthro)
  const centimetres = Math.round(stance.width * 100)
  const preset = deadlift
    ? style === 'sumo'
      ? 1
      : 0
    : [normal, wide].findIndex((width) => Math.abs(stance.width - width) < 0.005)
  const names = deadlift ? ['Convencional', 'Sumo'] : ['Base media', 'Base amplia']
  const name = names[preset] ?? `Base de ${centimetres} cm`

  return (
    <ControlDisclosure
      className="setup-menu"
      label={`Cambiar postura, ${name}, ${centimetres} cm entre pies`}
      trigger={
        <>
          {name} <ChevronDown size={14} aria-hidden />
        </>
      }
    >
      {(close) => (
        <>
          <div className="stance-presets" role="group" aria-label="Variante de la base">
            {names.map((label, index) => (
              <button
                key={label}
                type="button"
                aria-pressed={index === preset}
                onClick={() => {
                  onChange(
                    deadlift
                      ? {
                          deadliftStyle: index === 0 ? 'conventional' : 'sumo',
                          stanceWidth: undefined,
                        }
                      : { stanceWidth: index === 0 ? undefined : wide },
                  )
                  close()
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="stance-width-panel">
            <StanceFootprint width={stance.width} turnout={stance.toeOut} height={anthro.height} />
            <div className="stance-width-input">
              <Slider
                label="Separación entre los pies"
                min={Math.ceil(range.min * 100)}
                max={Math.floor(range.max * 100)}
                value={centimetres}
                step={1}
                format={(v) => v + ' cm'}
                onChange={(v) => onChange({ stanceWidth: v / 100 })}
              />
              <p className="stance-toeout">Puntas a {Math.round(stance.toeOut)}°</p>
            </div>
          </div>
        </>
      )}
    </ControlDisclosure>
  )
}

interface ComparisonProps extends SetupProps {
  frame: Frame
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
}: ComparisonProps) {
  const alternative = useMemo(() => {
    const normal = defaultStanceWidth(exercise, anthro.height)
    const style = coordination.deadliftStyle ?? 'conventional'
    const standard =
      (exercise === 'squat' || style === 'conventional') &&
      Math.abs(getStance(exercise, anthro, coordination).width - normal) < 0.005
    const name =
      exercise === 'squat' ? (standard ? 'Amplia' : 'Media') : standard ? 'Sumo' : 'Convencional'
    const other: Coordination = {
      ...coordination,
      deadliftStyle: standard && exercise === 'deadlift' ? 'sumo' : 'conventional',
      stanceWidth: exercise === 'squat' && standard ? wideSquat(anthro) : undefined,
    }
    const bounds = feasibleRange('progress', { exercise, anthro, coordination: other, task })
    const low = solveFrame(exercise, anthro, { ...task, progress: bounds.min }, other)
    const high = solveFrame(exercise, anthro, { ...task, progress: bounds.max }, other)
    return {
      name,
      other,
      bounds,
      width: low.stance.width,
      travel: Math.abs(high.barHeight - low.barHeight),
    }
  }, [exercise, anthro, coordination, task])
  const fraction = clamp((progress - range.min) / (range.max - range.min || 1), 0, 1)
  const ref = useMemo(
    () =>
      solveFrame(
        exercise,
        anthro,
        { ...task, progress: lerp(alternative.bounds.min, alternative.bounds.max, fraction) },
        alternative.other,
      ),
    [exercise, anthro, task, alternative, fraction],
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
          <StanceProfiles
            frame={frame}
            reference={ref}
            heightM={anthro.height}
            currentLabel={currentLabel}
            referenceLabel={alternative.name}
          />
          <p className="stance-explanation">
            El tramo violeta va de la <strong>cadera a la vertical de la barra</strong>. A igual
            carga, cuanto más largo es ese brazo de palanca, mayor es el momento que la barra ejerce
            sobre la cadera.
          </p>
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
