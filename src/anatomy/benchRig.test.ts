import { Bone, Group, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { buildBenchFrame } from '../model/bench'
import { createBenchRig } from './benchRig'
import { restLimbs } from './rig'

it('retains a valid arm orientation and bilateral grip at lockout for every grip width', () => {
  const root = new Group()
  const parts = restLimbs.map((rest) => {
    const hand = new Bone()
    const upperArm = new Bone()
    hand.name = rest.hand.name
    upperArm.name = rest.upperArm.name
    root.add(hand, upperArm)
    return { rest, hand, upperArm }
  })
  const pose = createBenchRig({ root, style() {}, barbell: { root: new Group(), update() {} } })
  for (const width of [1, 1.5, 2]) {
    const frame = buildBenchFrame(1, 100, 1.75, 80, width)
    pose(frame, 'muscles')
    for (const [i, { rest, hand, upperArm }] of parts.entries()) {
      expect(upperArm.matrix.determinant()).toBeGreaterThan(0.1)
      const grip = rest.grip.clone().applyMatrix4(hand.matrix)
      const target = frame.arms[i].grip
      expect(grip.distanceTo(new Vector3(target.x, target.y, target.z))).toBeLessThan(1e-7)
    }
  }
})
