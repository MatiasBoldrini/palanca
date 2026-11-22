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

it('keeps the skinned limb endpoints on the edited frame and scales trunk length independently of arm thickness', () => {
  const root = new Group()
  const rest = restLimbs[0]
  const links = [rest.shin, rest.thigh, rest.upperArm, rest.forearm, rest.hand]
  const bones = links.map((link) => {
    const bone = new Bone()
    bone.name = link.name
    root.add(bone)
    return bone
  })
  const pose = createBenchRig({ root, style() {}, barbell: { root: new Group(), update() {} } })
  const frame = buildBenchFrame(0.45, 100, 1.75, 80)
  const custom = buildBenchFrame(0.45, 100, 1.75, 80, 1.5, {
    ...frame.segments,
    arm: 0.64,
    thigh: 0.48,
    shank: 0.39,
    foot: 0.25,
  })
  const longerTrunk = buildBenchFrame(0.45, 100, 1.75, 80, 1.5, { ...custom.segments, torso: 0.59 })
  pose(custom, 'skeleton')
  const upperArmScale = bones[2].matrix.determinant()
  pose(longerTrunk, 'skeleton')
  const arm = longerTrunk.arms[0],
    leg = longerTrunk.pose.legs[0]
  const endpoints = [
    [leg.ankle, leg.knee],
    [leg.knee, leg.hip],
    [arm.elbow, arm.shoulder],
    [arm.wrist, arm.elbow],
    [arm.grip, arm.wrist],
  ]
  for (const [i, link] of links.entries()) {
    for (const [endpoint, target] of [
      [link.from, endpoints[i][0]],
      [link.to, endpoints[i][1]],
    ] as const) {
      const actual = endpoint.clone().applyMatrix4(bones[i].matrix)
      expect(actual.distanceTo(new Vector3(target.x, target.y, target.z))).toBeLessThan(1e-7)
    }
  }
  expect(bones[2].matrix.determinant()).toBeCloseTo(upperArmScale, 8)
})
