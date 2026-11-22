import { describe, expect, it } from 'vitest'
import { repetitionPose, repetitionStart } from './repetition'

describe.each(['deadlift', 'squat'] as const)('%s repetition', (exercise) => {
  const min = 0.08
  const max = 0.93
  const pose = (t: number) => repetitionPose(exercise, t, min, max)
  const from = exercise === 'deadlift' ? min : max
  const to = exercise === 'deadlift' ? max : min

  it('travels both ways within the available range and returns to the starting endpoint', () => {
    expect(pose(0).progress).toBeCloseTo(from)
    expect(pose(1).progress).toBeCloseTo(to)
    expect(pose(2).progress).toBeCloseTo(from)
    expect(pose(0.5).phase).toBe(exercise === 'deadlift' ? 'ascending' : 'descending')
    expect(pose(1.5).phase).not.toBe(pose(0.5).phase)
    for (let i = 1; i <= 100; i++) {
      const t = i / 100
      expect((pose(t).progress - pose(t - 0.01).progress) * (to - from)).toBeGreaterThan(0)
      expect(pose(2 - t).progress).toBeCloseTo(pose(t).progress, 10)
    }
  })

  it('starts from an arbitrary scrub position without jumping', () => {
    for (const progress of [min, 0.23, 0.57, 0.84, max]) {
      expect(pose(repetitionStart(exercise, progress, min, max)).progress).toBeCloseTo(progress, 8)
    }
  })

  it('decelerates to rest at the endpoints', () => {
    expect(Math.abs(pose(0.01).progress - from)).toBeLessThan(0.00001)
    expect(Math.abs(pose(1.01).progress - to)).toBeLessThan(0.00001)
  })
})
