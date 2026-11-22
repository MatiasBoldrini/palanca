import { ScanLine } from 'lucide-react'
import type { ReactNode } from 'react'

export function BodyEditToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button type="button" className="body-edit-toggle" aria-pressed={active} onClick={onClick}>
      <ScanLine size={16} aria-hidden /> Ajustar cuerpo
    </button>
  )
}

export function BodyEditor<K extends string>({
  options,
  selected,
  onSelect,
  editForces,
  onEditForces,
  children,
}: {
  options: { id: K; label: string }[]
  selected: K
  onSelect: (id: K) => void
  editForces: boolean
  onEditForces: (enabled: boolean) => void
  children: ReactNode
}) {
  return (
    <section className="body-editor" aria-label="Ajustes de la parte seleccionada">
      <div className="body-editor-picker">
        <label>
          Parte del cuerpo
          <select value={selected} onChange={(event) => onSelect(event.target.value as K)}>
            {options.map((part) => (
              <option key={part.id} value={part.id}>
                {part.label}
              </option>
            ))}
          </select>
        </label>
        <p>También podés tocar una parte en el modelo.</p>
        <label className="edit-force-check">
          <input
            type="checkbox"
            checked={editForces}
            onChange={(e) => onEditForces(e.target.checked)}
          />
          Ver fuerzas al ajustar
        </label>
      </div>
      <div className="body-editor-sliders">{children}</div>
    </section>
  )
}
