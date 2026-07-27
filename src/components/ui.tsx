import { motion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
  hint?: string
  accent?: string
  marks?: { at: number; label: string }[]
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
  accent,
  marks,
}: SliderProps) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id} className="slider-label">
          {label}
        </label>
        <span className="slider-value num">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            '--pct': `${pct}%`,
            '--accent-local': accent ?? 'var(--accent)',
          } as React.CSSProperties
        }
      />
      {marks && (
        <div className="slider-marks">
          {marks.map((mark) => (
            <span
              key={mark.label}
              style={{ left: `${((mark.at - min) / (max - min)) * 100}%` }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      )}
      {hint && <p className="slider-hint">{hint}</p>}
    </div>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  groupId?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  groupId,
}: SegmentedProps<T>) {
  const fallbackId = useId()
  return (
    <div className={`segmented ${size}`} role="tablist">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            className={active ? 'segment active' : 'segment'}
            onClick={() => onChange(option.value)}
          >
            {active && (
              <motion.span
                layoutId={`segment-${groupId ?? fallbackId}`}
                className="segment-pill"
                transition={{ type: 'spring', stiffness: 480, damping: 40 }}
              />
            )}
            <span className="segment-text">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  srLabel,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
  hint?: string
  srLabel?: string
}) {
  return (
    <button
      className="switch-row"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : srLabel}
      onClick={() => onChange(!checked)}
    >
      {(label || hint) && (
        <span className="switch-text">
          {label && <span className="switch-label">{label}</span>}
          {hint && <span className="switch-hint">{hint}</span>}
        </span>
      )}
      <span className={checked ? 'switch on' : 'switch'}>
        <motion.span
          className="switch-knob"
          layout
          transition={{ type: 'spring', stiffness: 700, damping: 42 }}
        />
      </span>
    </button>
  )
}

export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="section">
      <header className="section-head">
        <h3 className="label">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}

/**
 * Numeric controls that duplicate a gesture on the figure. They stay in the
 * tree for precision and for keyboard users, but folded away so the drawing
 * reads as the primary control.
 */
export function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={open ? 'collapsible open' : 'collapsible'}>
      <button className="collapsible-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
          <path
            d="M4 6.2 8 10l4-3.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  accent,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  accent?: string
}) {
  return (
    <button
      className={active ? 'chip active' : 'chip'}
      onClick={onClick}
      style={active && accent ? ({ '--chip-accent': accent } as React.CSSProperties) : undefined}
    >
      {children}
    </button>
  )
}
