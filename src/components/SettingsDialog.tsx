import { useEffect, useRef, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

export function SettingsDialog({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog?.open) dialog?.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close()
      }}
    >
      <div className="settings-inner">
        <header className="settings-title">
          <h2 id="settings-title">
            <SlidersHorizontal size={19} aria-hidden /> Ajustes
          </h2>
          <button aria-label="Cerrar ajustes" onClick={onClose}>
            <X size={21} aria-hidden />
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  )
}
