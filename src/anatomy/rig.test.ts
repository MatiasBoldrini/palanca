import { Bone, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ANTHROPOMETRY as anthro } from '../model/anthropometry'
import { DEFAULT_COORDINATION, DEFAULT_TASK, solveFrame } from '../model/lift'
import { createRig, restLimbs } from './rig'

describe.each(['deadlift', 'squat'] as const)('anatomical rig for %s', (exercise) => {
  it('keeps both grips on the bar and both feet planted throughout the lift', () => {
    const leftHand = new Bone()
    const rightHand = new Bone()
    const leftFoot = new Bone()
    const rightFoot = new Bone()
    leftHand.name = 'handL'
    rightHand.name = 'handR'
    leftFoot.name = 'footL'
    rightFoot.name = 'footR'
    const update = createRig([leftHand, rightHand, leftFoot, rightFoot])
    for (let i = 0; i <= 40; i++) {
      const task = { ...DEFAULT_TASK, progress: i / 40 }
      const frame = solveFrame(exercise, anthro, task, DEFAULT_COORDINATION[exercise])
      update(frame, anthro, exercise)
      for (const [index, hand] of [leftHand, rightHand].entries()) {
        const side = index === 0 ? -1 : 1
        // The centre of the closed hand and the floor under the calcaneus,
        // measured in the reference atlas before posing.
        const grip = new Vector3(0.018, 0.813, side * 0.254).applyMatrix4(hand.matrix)
        expect(grip.x).toBeCloseTo(frame.posture.bar.x, 6)
        expect(grip.y).toBeCloseTo(frame.posture.bar.y, 6)
        expect(Math.sign(grip.z)).toBe(side)
        const foot = index === 0 ? leftFoot : rightFoot
        const sole = new Vector3(-0.045, 0, side * 0.07).applyMatrix4(foot.matrix)
        expect(sole.y).toBeCloseTo(0, 6)
      }
    }
  })
})

describe.each([
  ['deadlift', 'conventional', 0.23],
  ['deadlift', 'sumo', 0.77],
  ['squat', 'conventional', 0.65],
] as const)('%s %s at %sm', (exercise, deadliftStyle, stanceWidth) => {
  it('rotates both soles outward, preserves link lengths and keeps the grip in the right place', () => {
    const bones = restLimbs.flatMap((ref) =>
      ['foot', 'shin', 'thigh', 'hand'].map((group) =>
        Object.assign(new Bone(), { name: group + ref.side }),
      ),
    )
    const byName = new Map(bones.map((b) => [b.name, b]))
    const update = createRig(bones)
    const coord = { ...DEFAULT_COORDINATION[exercise], deadliftStyle, stanceWidth }
    for (const progress of [0, 0.3, 0.62, 1]) {
      const frame = solveFrame(exercise, anthro, { ...DEFAULT_TASK, progress }, coord)
      const { stance, posture: p } = frame
      update(frame, anthro, exercise)
      for (const ref of restLimbs) {
        const side = -ref.mirror
        const foot = byName.get('foot' + ref.side)!.matrix
        const shin = byName.get('shin' + ref.side)!.matrix
        const thigh = byName.get('thigh' + ref.side)!.matrix
        const hand = byName.get('hand' + ref.side)!.matrix
        const heel = new Vector3(ref.ankle.x - 0.215 / 4, 0, ref.ankle.z).applyMatrix4(foot)
        const toe = new Vector3(ref.ankle.x + (3 * 0.215) / 4, 0, ref.ankle.z).applyMatrix4(foot)
        expect(heel.y).toBeCloseTo(0, 7)
        expect(toe.y).toBeCloseTo(0, 7)
        expect(heel.x).toBeCloseTo(p.heel.x, 7)
        expect(toe.x).toBeCloseTo(p.toe.x, 7)
        expect((heel.z + toe.z) * side).toBeCloseTo(stance.width, 7)
        expect(Math.atan2(side * (toe.z - heel.z), toe.x - heel.x)).toBeCloseTo(stance.toeOutRad, 7)
        expect(heel.distanceTo(toe)).toBeCloseTo(anthro.foot, 7)
        expect(
          ref.shin.from
            .clone()
            .applyMatrix4(shin)
            .distanceTo(ref.shin.to.clone().applyMatrix4(shin)),
        ).toBeCloseTo(anthro.shank, 6)
        expect(
          ref.thigh.from
            .clone()
            .applyMatrix4(thigh)
            .distanceTo(ref.thigh.to.clone().applyMatrix4(thigh)),
        ).toBeCloseTo(anthro.thigh, 6)
        const grip = ref.grip.clone().applyMatrix4(hand)
        expect(grip.distanceTo(new Vector3(p.bar.x, p.bar.y, side * stance.gripHalf))).toBeLessThan(
          1e-6,
        )
        if (exercise === 'deadlift') {
          const kneeHalf = Math.abs(ref.shin.to.clone().applyMatrix4(shin).z)
          if (deadliftStyle === 'sumo') expect(side * grip.z).toBeLessThan(kneeHalf)
          else expect(side * grip.z).toBeGreaterThan(kneeHalf)
        }
      }
    }
  })
})
