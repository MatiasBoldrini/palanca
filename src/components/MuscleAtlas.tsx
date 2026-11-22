import { useState } from 'react'
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import type { MuscleId } from '../anatomy/body'
import type { ExerciseId, Frame } from '../model/lift'

import { entries, groups, measurements } from './muscleGuide'

// Paired anatomical regions on a common standing silhouette let readers locate each entry at a glance.
const regionPaths: Record<MuscleId, string> = {
  glutes: 'M17 25q-3 1-2 8 3 2 7-2 4 4 7 2 1-7-2-8l-5 2z',
  quadriceps: 'M16 31q-2 8 1 15 4-3 5-13z M28 31q2 8-1 15-4-3-5-13z',
  hamstrings: 'M15 32q-1 8 2 14 2-2 4-13z M29 32q1 8-2 14-2-2-4-13z',
  erectors: 'M19 13q-2 9 2 14l.5-14z M25 13q2 9-2 14l-.5-14z',
  calves: 'M16 45q-2 5 1 11l2-5 1-6z M28 45q2 5-1 11l-2-5-1-6z',
  core: 'M17 18q0 8 5 11 5-3 5-11l-5 1z',
  lats: 'M15 14q0 8 6 12l-1-11z M29 14q0 8-6 12l1-11z',
  upperBody: 'M15 11q-3 0-4 5l-3 12 3 1 4-10 3-6z M29 11q3 0 4 5l3 12-3 1-4-10-3-6z',
}

function RegionIcon({ id }: { id: MuscleId }) {
  return (
    <svg className="region-icon" viewBox="0 0 44 62" aria-hidden="true">
      <circle cx="22" cy="6" r="4" fill="currentColor" />
      <path
        fill="currentColor"
        d="M20 9h4l1 2 5 1q2 1 3 5l4 13-2 2-6-14-2 7 2 6-1 12 1 5-1 9 2 3h-5l-1-11-2-13-2 13-1 11h-5l2-3-1-9 1-5-1-12 2-6-2-7-6 14-2-2 4-13q1-4 3-5l5-1z"
      />
      <path d={regionPaths[id]} fill="var(--muscle-ink)" />
    </svg>
  )
}

export function MuscleAtlas({
  exercise,
  frame,
  selected,
  onSelect,
  onShowModel,
}: {
  exercise: ExerciseId
  frame: Frame
  selected: MuscleId | null
  onSelect: (id: MuscleId | null) => void
  onShowModel?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const ordered = exercise === 'deadlift' ? groups : [groups[1], groups[0], ...groups.slice(2)]
  const current = selected && entries[selected]
  return (
    <section className="atlas-card muscle-atlas" aria-labelledby="muscle-title">
      <h2 className="rail-title" id="muscle-title" tabIndex={-1}>
        <BookOpen size={18} aria-hidden /> Atlas muscular
      </h2>
      <p className="color-note"><span className="demand-scale" aria-hidden />El tono cálido sigue el momento que corresponde a la función del grupo, en relación con el máximo de esa articulación en la repetición. Es una guía de demanda articular.</p>
      {current && selected ? (
        <div className="muscle-detail">
          <button className="atlas-back" onClick={() => onSelect(null)}>
            <ArrowLeft size={14} aria-hidden /> Todos los grupos
          </button>
          <div className="muscle-identity">
            <RegionIcon id={selected} />
            <div>
              <h3>{current.name}</h3>
              <p>{current.region}</p>
            </div>
          </div>
          <p>{current.action}</p>
          {onShowModel && (
            <button className="return-model" onClick={onShowModel}>
              Ver en el modelo
            </button>
          )}
          <div className="observe">
            <strong>Qué observar</strong>
            <p>{current.observe[exercise]}</p>
            <dl className="muscle-reading">
              {current.readings.map((key) => {
                const reading = measurements[key]
                return (
                  <div key={key}>
                    <dt>{reading.name}</dt>
                    <dd>
                      {Math.round(reading.value(frame))}
                      {reading.unit}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        </div>
      ) : (
        <>
          <p className="rail-intro">Elegí un grupo para ver su ubicación y qué función cumple.</p>
          <div className="muscle-list">
            {(expanded ? ordered : ordered.slice(0, 4)).map((id) => (
              <button className="muscle-row" key={id} onClick={() => onSelect(id)}>
                <RegionIcon id={id} />
                <span>
                  <strong>{entries[id].name}</strong>
                  <small>{entries[id].region}</small>
                </span>
                <ChevronRight size={15} aria-hidden />
              </button>
            ))}
          </div>
          <button
            className="more-muscles"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? 'Mostrar menos' : 'Ver los 8 grupos'} <ChevronDown size={14} aria-hidden />
          </button>
        </>
      )}
    </section>
  )
}
