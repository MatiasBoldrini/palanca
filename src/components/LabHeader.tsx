import { Activity, ChevronDown } from 'lucide-react'
import { useApp, type LiftId } from '../state/appState'
import './minimalControls.css'

const LIFTS: { value: LiftId; label: string }[] = [
  { value: 'deadlift', label: 'Peso muerto' },
  { value: 'bench', label: 'Press de banca' },
  { value: 'squat', label: 'Sentadilla' },
]

export function LabHeader({ onSwitch }: { onSwitch?: () => void }) {
  const { state, dispatch } = useApp()
  const active = state.benchActive ? 'bench' : state.exercise
  const name = LIFTS.find((lift) => lift.value === active)?.label
  return (
    <header className="lift-header">
      <div className="lift-header-inner">
        <span className="lift-wordmark">
          <img src={import.meta.env.BASE_URL + 'icon.svg'} alt="" width="22" height="22" />
          Palanca
        </span>
        <div className="lift-selector">
          <h1 id="exercise-title">{name}</h1>
          <ChevronDown size={16} aria-hidden />
          <select
            id="lift-select"
            aria-label="Ejercicio"
            value={active}
            onChange={(event) => {
              const exercise = event.target.value as LiftId
              if (exercise === active) return
              onSwitch?.()
              dispatch({ type: 'setExercise', exercise })
              requestAnimationFrame(() =>
                document.getElementById('lift-select')?.focus({ preventScroll: true }),
              )
            }}
          >
            {LIFTS.map((lift) => (
              <option key={lift.value} value={lift.value}>
                {lift.label}
              </option>
            ))}
          </select>
        </div>
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
