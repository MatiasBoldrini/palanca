import {
  Mesh,
  Raycaster,
  Vector2,
  type Object3D,
  type OrthographicCamera,
  type Vector3,
} from 'three'
import type { HotspotId } from '../model/interact'

/** Pick the front visible surface of the posed atlas. Untagged objects, e.g. the bench, occlude the body. */
export function listenForBodyPart(
  canvas: HTMLCanvasElement,
  camera: OrthographicCamera,
  rootsForPose: () => Object3D[],
  onSelect: (zone: HotspotId, point: Vector3) => void,
) {
  const ray = new Raycaster()
  const pointer = new Vector2()
  const events = new AbortController()
  const options = { capture: true, passive: true, signal: events.signal }
  let tap: PointerEvent | null = null

  function moved(event: PointerEvent) {
    if (tap && Math.hypot(event.clientX - tap.clientX, event.clientY - tap.clientY) > 5) tap = null
  }

  canvas.addEventListener(
    'pointerdown',
    (e) => {
      tap = e.isPrimary && e.button === 0 ? e : null
    },
    options,
  )
  canvas.addEventListener('pointermove', moved, options)
  canvas.addEventListener(
    'pointercancel',
    () => {
      tap = null
    },
    options,
  )
  canvas.addEventListener(
    'lostpointercapture',
    () => {
      tap = null
    },
    options,
  )
  canvas.addEventListener(
    'pointerup',
    (e) => {
      moved(e)
      if (tap?.pointerId !== e.pointerId) return
      tap = null

      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const surfaces: Object3D[] = []
      for (const root of rootsForPose()) {
        root.traverseVisible((node) => {
          if (node instanceof Mesh && !(node.material.transparent && node.material.opacity < 0.3)) {
            surfaces.push(node)
          }
        })
      }
      if (!surfaces.length) return
      function hitAt(x: number, y: number) {
        pointer.set(((x - rect.left) * 2) / rect.width - 1, 1 - ((y - rect.top) * 2) / rect.height)
        ray.setFromCamera(pointer, camera)
        return ray.intersectObjects(surfaces, false)[0]
      }

      let hit = hitAt(e.clientX, e.clientY)
      // A finger can land in a small gap between ribs, fingers or the two shin bones.
      // Test a few adjacent pixels only when the central ray hit no surface at all.
      if (!hit && e.pointerType === 'touch') {
        for (const [dx, dy] of [
          [-3, 0],
          [3, 0],
          [0, -3],
          [0, 3],
        ]) {
          hit = hitAt(e.clientX + dx, e.clientY + dy)
          if (hit) break
        }
      }
      if (!hit) return
      for (let node: Object3D | null = hit.object; node; node = node.parent) {
        if (node.userData.hotspot) {
          onSelect(node.userData.hotspot as HotspotId, hit.point)
          return
        }
      }
    },
    options,
  )
  return () => events.abort()
}
