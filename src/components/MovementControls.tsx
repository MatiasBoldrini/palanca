export function AnalysisToggle({
  active,
  onChange,
}: {
  active: boolean
  onChange: (active: boolean) => void
}) {
  return (
    <div className="movement-analysis">
      <button type="button" aria-pressed={active} onClick={() => onChange(!active)}>
        Fuerzas y momentos
        <span className="analysis-switch" aria-hidden="true" />
      </button>
    </div>
  )
}

export function LoadButton({ load, onClick }: { load: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className="movement-load"
      aria-label={`Ajustar carga de la barra, ${load} kg`}
      aria-haspopup="dialog"
      onClick={() => {
        onClick()
        requestAnimationFrame(() => document.getElementById('settings-load')?.focus())
      }}
    >
      {load.toLocaleString('es-AR')} kg
    </button>
  )
}
