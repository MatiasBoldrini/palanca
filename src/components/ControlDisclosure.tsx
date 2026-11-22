import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  className: string
  trigger: ReactNode
  label: string
  children: (close: () => void) => ReactNode
}

export function ControlDisclosure({ className, trigger, label, children }: Props) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)

  function close() {
    const details = ref.current
    if (!details) return
    details.open = false
    details.querySelector('summary')?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) {
        ref.current.open = false
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <details
      ref={ref}
      className={`control-disclosure ${className}`}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && ref.current?.open) {
          event.preventDefault()
          close()
        }
      }}
      onBlur={(event) => {
        const target = event.relatedTarget
        if (target instanceof Node && !event.currentTarget.contains(target))
          event.currentTarget.open = false
      }}
    >
      <summary role="button" aria-expanded={open} aria-label={label} title={label}>
        {trigger}
      </summary>
      <div className="control-menu">{children(close)}</div>
    </details>
  )
}
