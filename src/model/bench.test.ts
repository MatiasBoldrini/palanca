import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { GRAVITY, LENGTH_FRACTION } from './anthropometry'
import { BENCH_GRIP, benchPointDistance as distance, buildBenchFrame } from './bench'
import { repetitionPose } from './repetition'

const joints = ['shoulder', 'elbow', 'wrist'] as const

describe.each([BENCH_GRIP.min, BENCH_GRIP.default, BENCH_GRIP.max])(
  'bench press at grip ratio %s',
  (grip) => {
    it('keeps both hands on the shaft, limb lengths fixed and feet on the floor throughout the lift', () => {
      for (const height of [1.45, 1.75, 2.1]) {
        const start = buildBenchFrame(0, 100, height, 70, grip)
        const finish = buildBenchFrame(1, 100, height, 70, grip)
        let lastY = start.bar.y
        for (let i = 0; i <= 40; i++) {
          const frame = buildBenchFrame(i / 40, 100, height, 70, grip)
          expect((frame.bar.y - start.bar.y) / (finish.bar.y - start.bar.y)).toBeCloseTo(i / 40, 12)
          expect(frame.bar.y).toBeGreaterThanOrEqual(lastY)
          lastY = frame.bar.y
          expect(frame.bar.z).toBe(0)
          expect(distance(frame.arms[0].grip, frame.arms[1].grip)).toBeCloseTo(
            grip * LENGTH_FRACTION.shoulderWidth * height,
          )
          frame.arms.forEach((arm, index) => {
            const leg = frame.pose.legs[index]
            expect(arm.grip.x).toBe(frame.bar.x)
            expect(arm.grip.y).toBe(frame.bar.y)
            expect(arm.grip.z).toBeCloseTo(-frame.arms[1 - index].grip.z)
            for (const [a, b] of [
              ['shoulder', 'elbow'],
              ['elbow', 'wrist'],
              ['wrist', 'grip'],
            ] as const) {
              expect(distance(arm[a], arm[b])).toBeCloseTo(
                distance(start.arms[index][a], start.arms[index][b]),
                7,
              )
            }
            expect(distance(leg.hip, leg.knee)).toBeCloseTo(height * LENGTH_FRACTION.thigh)
            expect(distance(leg.knee, leg.ankle)).toBeCloseTo(height * LENGTH_FRACTION.shank)
            expect(leg.heel.y).toBe(0)
            expect(leg.toe.y).toBe(0)
          })
        }
        const lockout = buildBenchFrame(1, 100, height, 70, grip).arms[0]
        expect(distance(lockout.shoulder, lockout.grip)).toBeCloseTo(height * LENGTH_FRACTION.arm)
      }
    })

    it('preserves upper arm orientation through the entire playback cycle, including straight elbows', () => {
      let previousFront: Vector3 | undefined
      for (let i = 0; i <= 420; i++) {
        const { progress } = repetitionPose('bench', i / 210, 0, 1)
        const arm = buildBenchFrame(progress, 100, 1.75, 70, grip).arms[0]
        const axis = new Vector3().subVectors(arm.shoulder, arm.elbow).normalize()
        const plane = new Vector3().copy(arm.elbowPlaneNormal)
        const front = plane.cross(axis)
        expect(front.length()).toBeCloseTo(1, 9)
        expect(front.dot(new Vector3().subVectors(arm.wrist, arm.elbow))).toBeGreaterThan(-1e-8)
        if (previousFront) expect(front.angleTo(previousFront)).toBeLessThan(Math.PI / 90)
        previousFront = front
      }
    })

    it('satisfies force and torque equilibrium with positive bench and foot reactions', () => {
      for (const load of [0, 60, 300]) {
        for (const progress of [0, 0.35, 0.8, 1]) {
          const { bar, bodyCom, benchSupport, footSupport, forces } = buildBenchFrame(
            progress,
            load,
            1.75,
            80,
            grip,
          )
          const { barN, bodyN, benchN, feetN } = forces
          expect(barN).toBeCloseTo(-load * GRAVITY)
          expect(bodyN).toBeCloseTo(-80 * GRAVITY)
          expect(benchN).toBeGreaterThan(0)
          expect(feetN).toBeGreaterThan(0)
          expect(barN + bodyN + benchN + feetN).toBeCloseTo(0, 9)
          expect(
            bar.x * barN + bodyCom.x * bodyN + benchSupport.x * benchN + footSupport.x * feetN,
          ).toBeCloseTo(0, 9)
        }
      }
    })

    it('applies half the bar at each hand and reports internal distal torque as a mirrored axial vector', () => {
      for (const progress of [0, 0.5, 1]) {
        const loaded = buildBenchFrame(progress, 100, 1.75, 80, grip)
        const unloaded = buildBenchFrame(progress, 0, 1.75, 80, grip)
        for (const joint of joints) {
          const arm = loaded.arms[0]
          const target = arm.moments[joint]
          const other = loaded.arms[1].moments[joint]
          const bodyOnly = unloaded.arms[0].moments[joint]
          const halfWeight = 50 * GRAVITY
          expect(target.x - bodyOnly.x).toBeCloseTo(-halfWeight * (arm.grip.z - arm[joint].z), 9)
          expect(target.z - bodyOnly.z).toBeCloseTo(halfWeight * (arm.grip.x - arm[joint].x), 9)
          expect(target.y).toBe(0)
          expect(target.magnitudeNm).toBeCloseTo(Math.hypot(target.x, target.z))
          expect(other.x).toBeCloseTo(-target.x)
          expect(other.z).toBeCloseTo(target.z)
          expect(other.magnitudeNm).toBeCloseTo(target.magnitudeNm)
        }
      }
    })
  },
)
