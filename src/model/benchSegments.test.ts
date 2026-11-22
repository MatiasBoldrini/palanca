import { describe, expect, it } from 'vitest'
import { anthropometryFromHeight, heightFromSegments } from './anthropometry'
import {
  benchPointDistance as distance,
  buildBenchFrame,
  type BenchFrame,
  type BenchSegments,
} from './bench'

const reference = anthropometryFromHeight(1.75, 80)
const names = ['shank', 'thigh', 'torso', 'arm', 'foot'] as const
const ranges: Record<keyof BenchSegments, [number, number]> = {
  shank: [0.3, 0.6],
  thigh: [0.3, 0.6],
  torso: [0.35, 0.65],
  arm: [0.45, 0.8],
  foot: [0.18, 0.35],
}

function measured(frame: BenchFrame, side: 0 | 1): BenchSegments {
  const leg = frame.pose.legs[side]
  const arm = frame.arms[side]
  return {
    shank: distance(leg.ankle, leg.knee),
    thigh: distance(leg.knee, leg.hip),
    torso: distance(frame.pose.hip, { ...arm.shoulder, z: 0 }),
    arm: distance(arm.shoulder, arm.elbow) + distance(arm.elbow, arm.grip),
    foot: distance(leg.toe, leg.heel),
  }
}

describe('bench press with editable anatomical lengths', () => {
  it('keeps the height-only call compatible with its reference proportions', () => {
    const restored = anthropometryFromHeight(1.59, 74)
    const original = buildBenchFrame(0.4, 120, restored.height, restored.mass, 1.75)
    const explicit = buildBenchFrame(0.4, 120, restored.height, restored.mass, 1.75, restored)
    expect(original).toEqual(explicit)
  })

  it.each(names)(
    'changes the selected %s length while keeping the other measured lengths',
    (name) => {
      const edited = { ...reference, [name]: ranges[name][1] }
      const frame = buildBenchFrame(0.5, 100, heightFromSegments(edited), edited.mass, 1.5, edited)
      for (const key of names) expect(measured(frame, 0)[key]).toBeCloseTo(edited[key], 10)
      expect(measured(frame, 0)[name]).not.toBeCloseTo(reference[name])
    },
  )

  it('preserves grip, floor contact, segment lengths and vertical equilibrium at the limits', () => {
    let extremes: BenchSegments[] = [reference]
    for (const name of names) {
      extremes = extremes.flatMap((shape) =>
        ranges[name].map((value) => ({ ...shape, [name]: value })),
      )
    }
    for (const shape of extremes) {
      for (const grip of [1, 2]) {
        const height = heightFromSegments(shape)
        const bottom = buildBenchFrame(0, 150, height, 80, grip, shape)
        const top = buildBenchFrame(1, 150, height, 80, grip, shape)
        expect(top.bar.y).toBeGreaterThan(bottom.bar.y)
        expect(distance(top.arms[0].shoulder, top.arms[0].grip)).toBeCloseTo(shape.arm, 8)
        for (const t of [0, 0.5, 1]) {
          const frame = buildBenchFrame(t, 150, height, 80, grip, shape)
          expect(frame.bar.y).toBeCloseTo(bottom.bar.y + t * (top.bar.y - bottom.bar.y), 9)
          for (const side of [0, 1] as const) {
            const leg = frame.pose.legs[side],
              arm = frame.arms[side]
            const lengths = measured(frame, side)
            for (const key of names) expect(lengths[key]).toBeCloseTo(shape[key], 8)
            expect(arm.grip.x).toBe(frame.bar.x)
            expect(arm.grip.y).toBe(frame.bar.y)
            expect(arm.grip.z).toBeCloseTo(-frame.arms[1 - side].grip.z)
            expect(leg.toe.y).toBe(0)
            expect(leg.heel.y).toBe(0)
            expect(Number.isFinite(arm.moments.elbow.magnitudeNm)).toBe(true)
          }
          const { feetN, benchN, bodyN, barN } = frame.forces
          expect(feetN).toBeGreaterThan(0)
          expect(benchN).toBeGreaterThan(0)
          expect(feetN + benchN + bodyN + barN).toBeCloseTo(0, 8)
          const torque =
            frame.footSupport.x * feetN +
            frame.benchSupport.x * benchN +
            frame.bodyCom.x * bodyN +
            frame.bar.x * barN
          expect(torque).toBeCloseTo(0, 8)
        }
      }
    }
  })
})
