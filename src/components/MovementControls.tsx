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
