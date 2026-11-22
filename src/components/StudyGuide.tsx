import { useId, type ReactNode } from 'react'

interface Props {
  tabs: { id: string; label: string }[]
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

export function StudyGuide({ tabs, value, onChange, children }: Props) {
  const prefix = useId()
  return (
    <aside className="study-guide" aria-label="Guía del movimiento">
      <div className="study-tabs" role="tablist" aria-label="Qué estudiar">
        {tabs.map(({ id, label }, index) => (
          <button
            type="button"
            role="tab"
            key={id}
            id={prefix + id}
            aria-selected={value === id}
            aria-controls={prefix + 'panel'}
            tabIndex={value === id ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(event) => {
              const keys: Record<string, number> = {
                ArrowLeft: (index + tabs.length - 1) % tabs.length,
                ArrowRight: (index + 1) % tabs.length,
                Home: 0,
                End: tabs.length - 1,
              }
              const next = keys[event.key]
              if (next === undefined) return
              event.preventDefault()
              onChange(tabs[next].id)
              document.getElementById(prefix + tabs[next].id)?.focus()
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={prefix + 'panel'} aria-labelledby={prefix + value} tabIndex={0}>
        {children}
      </div>
    </aside>
  )
}
