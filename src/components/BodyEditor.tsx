import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'

const kindLabels = {
  rotation: 'Rotación',
  position: 'Posición',
  length: 'Largo',
  other: 'Otros',
} as const

export interface BodyAdjustment {
  id: string
  kind: keyof typeof kindLabels
  label: string
  control: ReactNode
}

export function BodyEditHint() {
  return <span className="body-edit-hint">Tocá una parte para ajustarla</span>
}

export function BodyEditor<K extends string>({
  options,
  selected,
  onSelect,
  editForces,
  onEditForces,
  adjustments,
}: {
  options: { id: K; label: string }[]
  selected: K
  onSelect: (id: K) => void
  editForces: boolean
  onEditForces: (enabled: boolean) => void
  adjustments: BodyAdjustment[]
}) {
  const [preference, setPreference] = useState<BodyAdjustment['kind']>('rotation')
  const [field, setField] = useState<string>()
  const kinds = (Object.keys(kindLabels) as BodyAdjustment['kind'][]).filter((kind) =>
    adjustments.some((adjustment) => adjustment.kind === kind),
  )
  const kind = kinds.includes(preference) ? preference : kinds[0]
  const fields = adjustments.filter((adjustment) => adjustment.kind === kind)
  const active = fields.find((option) => option.id === field) ?? fields[0]

  return (
    <section className="body-editor" aria-label="Ajustes de la parte seleccionada">
      <div className="body-editor-head">
        <label className="body-part-select">
          <select
            aria-label="Parte del cuerpo"
            value={selected}
            onChange={(event) => onSelect(event.target.value as K)}
          >
            {options.map((part) => (
              <option key={part.id} value={part.id}>
                {part.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden />
        </label>
        <label className="edit-force-check">
          <input
            type="checkbox"
            aria-label="Ver fuerzas al ajustar"
            checked={editForces}
            onChange={(e) => onEditForces(e.target.checked)}
          />
          Ver fuerzas
        </label>
      </div>
      {kinds.length > 1 && (
        <div className="body-edit-kinds" role="group" aria-label="Tipo de ajuste">
          {kinds.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={kind === item}
              onClick={() => setPreference(item)}
            >
              {item === 'other' && adjustments.filter((a) => a.kind === item).length === 1
                ? adjustments.find((a) => a.kind === item)?.label
                : kindLabels[item]}
            </button>
          ))}
        </div>
      )}
      <div className="body-edit-control">
        {fields.length > 1 && (
          <select
            aria-label="Medida a ajustar"
            value={active.id}
            onChange={(event) => setField(event.target.value)}
          >
            {fields.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        )}
        {active?.control}
      </div>
    </section>
  )
}
