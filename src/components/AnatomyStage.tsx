import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useApp } from '../state/appState'
import { ViewerBoundary } from './ViewerBoundary'

type ViewerEvents = { onUnavailable: () => void }

export function AnatomyStage<P extends ViewerEvents>({
  loadViewer,
  viewerProps,
  hint,
  onFailure,
}: {
  loadViewer: () => Promise<{ default: ComponentType<P> }>
  viewerProps: Omit<NoInfer<P>, keyof ViewerEvents>
  hint?: ReactNode
  onFailure: () => void
}) {
  const [Viewer, setViewer] = useState<ComponentType<P> | null>(null)
  const [failed, setFailed] = useState(false)
  const { savePosture } = useApp()
  const fail = useCallback(() => {
    setFailed(true)
    onFailure()
  }, [onFailure])

  useEffect(() => {
    let mounted = true
    loadViewer().then(
      (module) => {
        if (mounted) setViewer(() => module.default)
      },
      () => {
        if (mounted) fail()
      },
    )
    return () => {
      mounted = false
    }
  }, [loadViewer, fail])

  return (
    <div className="atlas-viewport anatomy" id="lift-viewport" tabIndex={-1}>
      {failed ? (
        <div className="viewer-recovery">
          <p role="status">
            {Viewer ? 'No se pudo mostrar el modelo 3D.' : 'No se pudo cargar el visor 3D.'}
          </p>
          <button
            type="button"
            onClick={() => {
              // A fresh document can fetch the current bundle after a deployment or a failed import.
              if (Viewer) {
                setFailed(false)
              } else {
                savePosture()
                window.location.reload()
              }
            }}
          >
            {Viewer ? 'Reintentar en 3D' : 'Recargar el visor 3D'}
          </button>
        </div>
      ) : Viewer ? (
        <ViewerBoundary onUnavailable={fail}>
          {hint}
          <Viewer {...({ ...viewerProps, onUnavailable: fail } as P)} />
        </ViewerBoundary>
      ) : (
        <p className="viewer-loading" role="status">
          Cargando el modelo 3D…
        </p>
      )}
    </div>
  )
}
