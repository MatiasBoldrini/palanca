import { ArrowUpDown, RotateCcw, Ruler } from 'lucide-react'
import { formatForce } from '../model/mechanicsOverlay'

export interface JointOption<K extends string> {
  id: K
  label: string
}

interface Props<K extends string> {
  forces: boolean
  moments: boolean
  lever: boolean
  joint: K | 'all'
  options: JointOption<K>[]
  onForces: () => void
  onMoments: () => void
  onLever: () => void
  onJoint: (joint: K | 'all') => void
}

export function MechanicsControls<K extends string>(props: Props<K>) {
  return (
    <div className="mechanics-tools" role="group" aria-label="Capas de biomecánica">
      <div className="mechanics-toggles">
        <button className="force-toggle" aria-pressed={props.forces} onClick={props.onForces}>
          <ArrowUpDown size={15} aria-hidden />
          Fuerzas
        </button>
        <button className="moment-toggle" aria-pressed={props.moments} onClick={props.onMoments}>
          <RotateCcw size={15} aria-hidden />
          Momentos
        </button>
      </div>
      <label className="joint-picker">
        <span>Articulación</span>
        <select
          aria-label="Articulación"
          value={props.joint}
          onChange={(e) => props.onJoint(e.target.value as K | 'all')}
        >
          <option value="all">Todas</option>
          {props.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {props.joint !== 'all' && (
        <button className="lever-toggle" aria-pressed={props.lever} onClick={props.onLever}>
          <Ruler size={15} aria-hidden />
          Brazo de palanca
        </button>
      )}
    </div>
  )
}

interface ForceReading {
  id: string
  label: string
  verticalN: number
}
export function ForceBalance({ forces, note }: { forces: ForceReading[]; note: string }) {
  return (
    <section className="atlas-card moments-card force-card">
      <h2 className="rail-title">
        <ArrowUpDown size={18} aria-hidden />
        Fuerzas externas
      </h2>
      <dl className="force-readings">
        {forces.map((f) => (
          <div key={f.id} className={'force-' + f.id}>
            <dt>
              <span aria-hidden>{f.verticalN < 0 ? '↓' : '↑'}</span>
              {f.label}
            </dt>
            <dd>
              {formatForce(f.verticalN)}
              <span className="anatomy-sr">
                {f.verticalN < 0 ? ' hacia abajo' : ' hacia arriba'}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="moment-note">{note}</p>
    </section>
  )
}
