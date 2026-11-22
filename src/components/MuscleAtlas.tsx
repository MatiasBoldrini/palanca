import { useState } from 'react'
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import type { MuscleId } from '../anatomy/body'
import type { ExerciseId, Frame } from '../model/lift'

import { entries, groups, measurements } from './muscleGuide'

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
      {current && selected ? (
        <div className="muscle-detail">
          <button className="atlas-back" onClick={() => onSelect(null)}>
            <ArrowLeft size={14} aria-hidden /> Todos los grupos
          </button>
          <div className="muscle-identity">
            <h3>{current.name}</h3>
            <p>{current.region}</p>
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
