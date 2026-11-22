import { describe, expect, it } from 'vitest'
import { anthropometryFromHeight, heightFromSegments } from './anthropometry'
import {
  benchPointDistance as distance,
  BENCH_POSE_LIMITS,
  DEFAULT_BENCH_POSE,
  benchElbowFlexion,
  benchKneeFlexion,
  footSlideAtKneeAngle,
  progressAtElbowFlexion,
  type BenchPoseSettings,
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

describe('bench segment rotation and placement', () => {
  const frameAt = (t: number, patch: Partial<BenchPoseSettings> = {}) =>
    buildBenchFrame(t, 100, reference.height, reference.mass, 1.5, reference, {
      ...DEFAULT_BENCH_POSE,
      ...patch,
    })

  it('solves the equivalent foot position for a requested knee flexion, on both legs', () => {
    const neutral = frameAt(0).pose.legs[0]
    for (const footSlideCm of [-14, -6, 0, 4, 12]) {
      const leg = frameAt(0.5, { footSlideCm }).pose.legs[0]
      expect(leg.ankle.x - neutral.ankle.x).toBeCloseTo(footSlideCm / 100, 8)
      expect(footSlideAtKneeAngle(neutral, benchKneeFlexion(leg))).toBeCloseTo(footSlideCm, 7)
    }
  })

  it('sets elbow flexion from lockout and rotates a bent elbow without moving the bar', () => {
    for (const barShiftCm of [-8, 0, 5]) {
      const sample = (t: number) => frameAt(t, { barShiftCm })
      const angles = Array.from({ length: 65 }, (_, i) => benchElbowFlexion(sample(i / 64).arms[0]))
      for (const target of [0, 15, 45, 90, Math.floor(Math.max(...angles))]) {
        const progress = progressAtElbowFlexion(target, 1, angles, sample)
        expect(benchElbowFlexion(sample(progress).arms[0])).toBeCloseTo(target, 2)
      }
    }
    const initial = frameAt(0.35),
      rotated = frameAt(0.35, { elbowTurnDeg: 20 })
    expect(rotated.bar).toEqual(initial.bar)
    expect(distance(initial.arms[0].elbow, rotated.arms[0].elbow)).toBeGreaterThan(0.03)
    expect(rotated.arms[0].moments.elbow.magnitudeNm).not.toBeCloseTo(
      initial.arms[0].moments.elbow.magnitudeNm,
      1,
    )
  })

  it('keeps the combined body/bar centre of mass within the support span for all pose limits', () => {
    const poseKeys = Object.keys(BENCH_POSE_LIMITS) as (keyof BenchPoseSettings)[]
    let poses = [DEFAULT_BENCH_POSE]
    for (const key of poseKeys) {
      const bounds = BENCH_POSE_LIMITS[key]
      poses = poses.flatMap((p) => [bounds.min, bounds.max].map((v) => ({ ...p, [key]: v })))
    }
    for (const shape of [
      reference,
      { shank: 0.3, thigh: 0.3, torso: 0.35, arm: 0.8, foot: 0.18 },
      { shank: 0.6, thigh: 0.6, torso: 0.65, arm: 0.45, foot: 0.35 },
      { shank: 0.3, thigh: 0.6, torso: 0.65, arm: 0.45, foot: 0.18 },
      { shank: 0.6, thigh: 0.3, torso: 0.35, arm: 0.8, foot: 0.35 },
    ]) {
      for (const pose of poses)
        for (const grip of [1, 2])
          for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const f = buildBenchFrame(t, 400, heightFromSegments(shape), 40, grip, shape, pose)
            const { feetN, benchN, bodyN, barN } = f.forces
            expect(feetN).toBeGreaterThanOrEqual(0)
            expect(benchN).toBeGreaterThanOrEqual(0)
            expect(feetN + benchN + bodyN + barN).toBeCloseTo(0, 8)
            expect(
              feetN * f.footSupport.x +
                benchN * f.benchSupport.x +
                bodyN * f.bodyCom.x +
                barN * f.bar.x,
            ).toBeCloseTo(0, 7)
            for (const key of names) expect(measured(f, 0)[key]).toBeCloseTo(shape[key], 7)
            expect(f.pose.legs[0].toe.y).toBe(0)
            expect(f.pose.legs[0].toe.z).toBeCloseTo(-f.pose.legs[1].toe.z)
            expect(f.bar.x).toBeGreaterThanOrEqual(f.barRangeX.min - 1e-9)
            expect(f.bar.x).toBeLessThanOrEqual(f.barRangeX.max + 1e-9)
          }
    }
  })
})
