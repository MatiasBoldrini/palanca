import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  TorusGeometry,
} from 'three'
import type { Vec2 } from '../model/geometry'
import type { ExerciseId } from '../model/lift'

// Chamfered tri-grip plates have open windows, so the near plate does not
// completely cover the lifter's shins when the camera is close to profile.
export function createBarbell() {
  const root = new Group()
  const loadedBar = new Group()
  loadedBar.userData.hotspot = 'bar'
  root.add(loadedBar)
  const steel = new MeshStandardMaterial({ color: 0xa5aca9, roughness: 0.38, metalness: 0.48 })
  const iron = new MeshStandardMaterial({ color: 0x373d3c, roughness: 0.65, metalness: 0.2 })
  const rim = new MeshStandardMaterial({ color: 0x68706c, roughness: 0.54, metalness: 0.36 })
  const shaft = new Mesh(new CylinderGeometry(0.014, 0.014, 1.78, 24), steel)
  shaft.rotation.x = Math.PI / 2
  loadedBar.add(shaft)
  const shape = new Shape()
  shape.absarc(0, 0, 1, 0, Math.PI * 2, false)
  const hole = new Path()
  hole.absarc(0, 0, 0.13, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3 + 0.3
    const slot = new Path()
    const point = (r: number, t: number) => [r * Math.cos(t), r * Math.sin(t)] as const
    const start = point(0.79, angle - 0.49)
    slot.moveTo(...start)
    slot.absarc(0, 0, 0.79, angle - 0.49, angle + 0.49, false)
    slot.quadraticCurveTo(...point(0.64, angle + 0.62), ...point(0.53, angle + 0.43))
    slot.absarc(0, 0, 0.53, angle + 0.43, angle - 0.43, true)
    slot.quadraticCurveTo(...point(0.64, angle - 0.62), ...start)
    shape.holes.push(slot)
  }
  const geom = new ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.02,
    bevelSegments: 2,
    curveSegments: 28,
  })
  geom.translate(0, 0, -0.05)
  const hub = new CylinderGeometry(0.034, 0.034, 0.27, 28)
  const boss = new CylinderGeometry(0.047, 0.047, 0.019, 36)
  const ring = new TorusGeometry(0.9, 0.011, 6, 72)
  const shelves: { plates: Group[]; collar: Mesh; side: number }[] = []
  for (const side of [-1, 1]) {
    const sleeve = new Mesh(hub, steel)
    sleeve.rotation.x = Math.PI / 2
    sleeve.position.z = side * 0.75
    loadedBar.add(sleeve)
    const plates: Group[] = []
    for (let i = 0; i < 4; i++) {
      const group = new Group()
      group.add(new Mesh(geom, iron))
      const bead = new Mesh(ring, rim)
      bead.position.z = side * 0.073
      group.add(bead)
      loadedBar.add(group)
      plates.push(group)
    }
    const collar = new Mesh(boss, steel)
    collar.rotation.x = Math.PI / 2
    loadedBar.add(collar)
    shelves.push({ plates, collar, side })
  }
  // The planar lift starts at regulation plate height even for an empty
  // 20 kg bar. Low pulling blocks keep that teaching setup physically legible.
  const blockGeometry = new BoxGeometry(1, 1, 1)
  const blockMaterial = new MeshStandardMaterial({ color: 0x9c9181, roughness: 0.9 })
  const blocks = [-1, 1].map((side) => {
    const block = new Mesh(blockGeometry, blockMaterial)
    block.position.z = side * 0.715
    root.add(block)
    return block
  })
  return {
    root,
    update(at: Vec2, radius: number, load: number, exercise: ExerciseId) {
      loadedBar.position.set(at.x, at.y, 0)
      for (const block of blocks) {
        block.visible = load <= 20 && exercise === 'deadlift'
        block.scale.set(0.42, Math.max(0.01, radius - 0.034), 0.12)
        block.position.y = block.scale.y / 2
      }
      const count = Math.max(0, Math.min(4, Math.ceil((load - 20) / 40)))
      for (const { plates, collar, side } of shelves) {
        plates.forEach((p, i) => {
          p.visible = i < count
          p.scale.setScalar(radius)
          p.position.z = side * (0.645 + i * 0.039)
        })
        collar.position.z = side * (0.645 + Math.max(0, count - 1) * 0.039 + radius * 0.082 + 0.012)
      }
    },
  }
}
