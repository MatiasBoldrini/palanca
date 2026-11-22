import { describe, expect, it } from 'vitest'
import { DEFAULT_ANTHROPOMETRY as body, GRAVITY, heightFromSegments } from './anthropometry'
import { dist } from './geometry'
import {
  DEFAULT_COORDINATION,
  DEFAULT_TASK,
  simulateSeries,
  solveFrame,
  type ExerciseId,
} from './lift'
import { defaultStanceWidth, getStance, stanceWidthRange, type DeadliftStyle } from './stance'

const setups: { exercise: ExerciseId; style: DeadliftStyle }[] = [
  { exercise: 'deadlift', style: 'conventional' },
  { exercise: 'deadlift', style: 'sumo' },
  { exercise: 'squat', style: 'conventional' },
]

describe.each(setups)('$exercise with $style stance', ({ exercise, style }) => {
  const coord = { ...DEFAULT_COORDINATION[exercise], deadliftStyle: style }
  const range = stanceWidthRange(exercise, body, style)

  it('closes the three-dimensional limbs for a complete lift at narrow and wide settings', () => {
    for (const width of [range.min, defaultStanceWidth(exercise, body.height, style), range.max]) {
      let previousGrip: number | undefined
      for (let i = 0; i <= 40; i++) {
        const task = { ...DEFAULT_TASK, progress: i / 40 }
        const frame = solveFrame(exercise, body, task, { ...coord, stanceWidth: width })
        const { posture: p, stance: s } = frame
        expect(frame.feasible).toBe(true)
        expect((2 * (s.toeHalf + s.heelHalf)) / 2).toBeCloseTo(width, 8)
        expect(Math.hypot(p.toe.x - p.heel.x, s.toeHalf - s.heelHalf)).toBeCloseTo(body.foot, 9)
        expect(Math.hypot(dist(p.ankle, p.knee), s.kneeHalf - s.ankleHalf)).toBeCloseTo(
          body.shank,
          9,
        )
        expect(Math.hypot(dist(p.knee, p.hip), s.hipHalf - s.kneeHalf)).toBeCloseTo(body.thigh, 9)
        expect(p.heel.y).toBe(0)
        expect(p.toe.y).toBe(0)
        const copZ = width / 2 + frame.centreOfPressure * Math.tan(s.toeOutRad)
        expect(copZ).toBeGreaterThanOrEqual(s.heelHalf)
        expect(copZ).toBeLessThanOrEqual(s.toeHalf)
        if (exercise === 'deadlift') {
          expect(p.hand).toEqual(p.bar)
          // Near lockout the pre-existing solver admits up to 6 mm of chain closure tolerance.
          expect(
            Math.abs(Math.hypot(dist(p.shoulder, p.hand), s.shoulderHalf - s.gripHalf) - body.arm),
          ).toBeLessThan(0.006)
          if (style === 'sumo') expect(s.gripHalf).toBeLessThan(s.kneeHalf)
          else expect(s.gripHalf).toBeGreaterThan(s.kneeHalf)
        }
        if (previousGrip !== undefined) expect(s.gripHalf).toBe(previousGrip)
        previousGrip = s.gripHalf
        const moment = frame.massPoints.reduce(
          (sum, mass) => sum + mass.mass * mass.position.x,
          task.load * p.bar.x,
        )
        const weight = (task.load + body.mass) * GRAVITY
        expect(moment * GRAVITY - frame.centreOfPressure * weight).toBeCloseTo(0, 8)
      }
    }
  })

  it('changes the solved sagittal posture, moments and displacement when the feet move apart', () => {
    const narrow = { ...coord, stanceWidth: range.min }
    const wide = { ...coord, stanceWidth: range.max }
    const small = solveFrame(exercise, body, DEFAULT_TASK, narrow)
    const broad = solveFrame(exercise, body, DEFAULT_TASK, wide)
    expect(Math.abs(small.posture.hip.x - broad.posture.hip.x)).toBeGreaterThan(0.01)
    expect(Math.abs(small.kinetics.moment.hip - broad.kinetics.moment.hip)).toBeGreaterThan(5)
    const smallSeries = simulateSeries(exercise, body, DEFAULT_TASK, narrow, 9)
    const broadSeries = simulateSeries(exercise, body, DEFAULT_TASK, wide, 9)
    expect(Math.abs(smallSeries.work - broadSeries.work)).toBeGreaterThan(1)
    expect(broadSeries.points[0].hip).toBeCloseTo(broad.kinetics.moment.hip, 8)
  })

  it('adapts the widest available stance to shorter legs without stretching them', () => {
    const short = { ...body, shank: 0.3, thigh: 0.3 }
    short.height = heightFromSegments(short)
    const max = stanceWidthRange(exercise, short, style).max
    const frame = getStance(exercise, short, { ...coord, stanceWidth: 5 })
    expect(frame.width).toBe(max)
    expect(frame.sagittalThigh).toBeGreaterThan(0)
    expect(frame.sagittalShank).toBeGreaterThan(0)
    expect(frame.sagittalArm).toBeGreaterThan(0)
  })
})
