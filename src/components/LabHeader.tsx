import { Activity, SlidersHorizontal, Weight } from 'lucide-react'
import { useApp, type LiftId } from '../state/appState'
import { Segmented } from './ui'

const LIFTS: { value: LiftId; label: string }[] = [
  { value: 'deadlift', label: 'Peso muerto' },
  { value: 'bench', label: 'Press de banca' },
  { value: 'squat', label: 'Sentadilla' },
]

export function LabHeader({
  onSettings,
  onSwitch,
}: {
  onSettings: () => void
  onSwitch?: () => void
}) {
  const { state, dispatch } = useApp()
  const active = state.benchActive ? 'bench' : state.exercise
  return (
    <header className="atlas-header">
      <div className="atlas-header-inner">
        <div className="atlas-brand">
          <img src={import.meta.env.BASE_URL + 'icon.svg'} alt="" width="32" height="32" />
          <strong>Palanca</strong>
          <span>Laboratorio de biomecánica</span>
        </div>
        <nav aria-label="Ejercicio">
          <Segmented
            value={active}
            groupId="exercise"
            panelId="exercise-panel"
            options={LIFTS}
            onChange={(exercise) => {
              if (exercise === active) return
              onSwitch?.()
              dispatch({ type: 'setExercise', exercise })
              requestAnimationFrame(() =>
                document.getElementById('exercise-' + exercise)?.focus({ preventScroll: true }),
              )
            }}
          />
        </nav>
        <button className="settings-open" onClick={onSettings} aria-haspopup="dialog">
          <SlidersHorizontal size={16} aria-hidden /> Ajustes
        </button>
      </div>
    </header>
  )
}

export function ExerciseHeading({
  name,
  description,
  load,
}: {
  name: string
  description: string
  load: number
}) {
  return (
    <header className="exercise-head">
      <div>
        <h1>{name}</h1>
        <p>{description}</p>
      </div>
      <div className="bar-load">
        <Weight size={19} strokeWidth={1.5} aria-hidden />
        <span>
          Carga en barra<strong className="num">{load.toLocaleString('es-AR')} kg</strong>
        </span>
      </div>
    </header>
  )
}

export function LabFooter({ bench = false }: { bench?: boolean }) {
  return (
    <footer className="atlas-footer">
      <span>
        <Activity size={15} aria-hidden />
        {bench
          ? 'Modelo bilateral simétrico y cuasiestático.'
          : 'Base de apoyo en 3D y momentos sagitales en equilibrio.'}
      </span>
      <a href={import.meta.env.BASE_URL + 'anatomy/creditos.html'} target="_blank" rel="noreferrer">
        Créditos del atlas 3D
      </a>
    </footer>
  )
}
