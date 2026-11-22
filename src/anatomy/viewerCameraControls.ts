import type { OrthographicCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const touchCameraHint =
  'Deslizá a los lados para girar y hacia arriba o abajo para recorrer la página.'

export class ViewerCameraControls extends OrbitControls {
  private readonly gestures = new AbortController()

  constructor(camera: OrthographicCamera, canvas: HTMLCanvasElement) {
    super(camera, canvas)
    canvas.style.touchAction = 'pan-y'
    canvas.setAttribute('aria-description', touchCameraHint)
    const listen = { capture: true, passive: true, signal: this.gestures.signal }
    let start: PointerEvent | null = null

    const reset = () => {
      start = null
      this.enableRotate = true
    }
    const begin = (event: PointerEvent) => {
      reset()
      if (event.pointerType === 'touch' && event.isPrimary) start = event
    }
    const chooseDirection = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.pointerId) return
      // OrbitControls sees small moves before the browser cancels a vertical
      // swipe. Keep the preset still until a single finger commits to orbit.
      const dx = Math.abs(event.clientX - start.clientX)
      const dy = Math.abs(event.clientY - start.clientY)
      this.enableRotate = false
      if (Math.max(dx, dy) < 7) return
      this.enableRotate = dx > dy
      start = null
    }
    canvas.addEventListener('pointerdown', begin, listen)
    canvas.addEventListener('pointermove', chooseDirection, listen)
    canvas.addEventListener('pointercancel', reset, listen)
    canvas.addEventListener('pointerup', reset, listen)
  }

  override dispose() {
    this.gestures.abort()
    super.dispose()
  }
}
