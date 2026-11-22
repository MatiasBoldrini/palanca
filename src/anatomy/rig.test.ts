import { Bone, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ANTHROPOMETRY as anthro } from '../model/anthropometry'
import { DEFAULT_COORDINATION, DEFAULT_TASK, solveFrame } from '../model/lift'
import { createRig } from './rig'

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
      update(frame.posture, anthro, exercise)
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
