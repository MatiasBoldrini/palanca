import { Bone, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createRig } from '../anatomy/rig'
import { DEFAULT_ANTHROPOMETRY as body, GRAVITY } from './anthropometry'
import { computeKinetics } from './kinetics'
import { DEFAULT_COORDINATION, DEFAULT_TASK, solveFrame } from './lift'
import { buildMechanicsOverlay, formatBarArm, formatForce, formatMoment } from './mechanicsOverlay'
import { centreOfMass } from './posture'

describe.each(['deadlift', 'squat'] as const)('%s mechanical annotations', (exercise) => {
  it('places the pivots on the same joint centres as the deformed atlas on either side', () => {
    const task = { ...DEFAULT_TASK, progress: 0.32 }
    const frame = solveFrame(exercise, body, task, DEFAULT_COORDINATION[exercise])
    for (const side of [1, -1] as const) {
      const suffix = side === 1 ? 'R' : 'L'
      const rest = [
        ['lumbarLow', new Vector3(0, 0.997, 0)],
        ['thigh' + suffix, new Vector3(0.007, 0.878, side * 0.074)],
        ['thigh' + suffix, new Vector3(0.004, 0.442, side * 0.078)],
        ['shin' + suffix, new Vector3(0.001, 0.072, side * 0.07)],
      ] as const
      const bones = rest.map(([name]) => Object.assign(new Bone(), { name }))
      createRig(bones)(frame.posture, body, exercise)
      const { moments } = buildMechanicsOverlay(frame, task, exercise, body.height, side)
      for (const [i, [, landmark]] of rest.entries()) {
        const actual = landmark.applyMatrix4(bones[i].matrix)
        const { anchor } = moments[i]
        expect(actual.distanceTo(new Vector3(anchor.x, anchor.y, anchor.z))).toBeLessThan(1e-6)
      }
    }
  })

  it('balances the three vertical forces and their external torques at their real application points', () => {
    for (const load of [0, 20, 150]) {
      for (const progress of [0, 0.4, 1]) {
        const task = { ...DEFAULT_TASK, progress, load, balance: 'bar' as const, barPosition: 0.06 }
        const frame = solveFrame(exercise, body, task, DEFAULT_COORDINATION[exercise])
        const { forces } = buildMechanicsOverlay(frame, task, exercise, body.height)
        const [bar, weight, support] = forces
        expect(forces.map((f) => f.id)).toEqual(['bar', 'body', 'ground'])
        expect(bar.anchor).toEqual({ ...frame.posture.bar, z: 0 })
        expect(weight.anchor).toEqual({ ...centreOfMass(frame.massPoints), z: 0 })
        expect(support.anchor).toEqual({ x: frame.centreOfPressure, y: 0, z: 0 })
        expect(bar.verticalN).toBeCloseTo(-load * GRAVITY)
        expect(weight.verticalN).toBeCloseTo(-body.mass * GRAVITY)
        expect(support.verticalN).toBeGreaterThan(0)
        expect(forces.reduce((sum, f) => sum + f.verticalN, 0)).toBeCloseTo(0, 8)
        expect(forces.reduce((sum, f) => sum + f.anchor.x * f.verticalN, 0)).toBeCloseTo(0, 8)
      }
    }
  })

  it('splits bar and body moments for each joint and reverses the world torque convention at the knee', () => {
    for (const progress of [0, 0.4, 1]) {
      const task = { ...DEFAULT_TASK, progress }
      const frame = solveFrame(exercise, body, task, DEFAULT_COORDINATION[exercise])
      // Hold the pose fixed when removing the bar to independently recover the body contribution.
      const unloaded = computeKinetics(frame.posture, frame.massPoints, 0, body.mass, {
        armsCarryLoad: exercise === 'deadlift',
      })
      const near = buildMechanicsOverlay(frame, task, exercise, body.height, 1).moments
      const far = buildMechanicsOverlay(frame, task, exercise, body.height, -1).moments
      expect(near.map((m) => m.id)).toEqual(['l5s1', 'hip', 'knee', 'ankle'])
      for (const [i, m] of near.entries()) {
        const landmark = frame.posture[m.id === 'l5s1' ? 'lumbosacral' : m.id]
        const sign = m.id === 'knee' ? -1 : 1
        const share = m.id === 'l5s1' ? 1 : 0.5
        const barArm = frame.posture.bar.x - landmark.x
        expect(m.anchor.x).toBe(landmark.x)
        expect(m.anchor.y).toBe(landmark.y)
        if (m.id === 'l5s1') expect(m.anchor.z).toBe(0)
        else expect(m.anchor.z).toBeGreaterThan(0)
        expect(far[i].anchor.z).toBeCloseTo(-m.anchor.z)
        expect(far[i].torqueZNm).toBe(m.torqueZNm)
        expect(m.barArmM).toBeCloseTo(barArm)
        expect(m.barMomentNm).toBeCloseTo(sign * share * task.load * GRAVITY * barArm)
        expect(m.bodyMomentNm).toBeCloseTo(unloaded.moment[m.id])
        expect(m.bodyMomentNm + m.barMomentNm).toBeCloseTo(frame.kinetics.moment[m.id])
        expect(m.torqueZNm).toBeCloseTo(sign * m.momentNm)
      }
    }
  })
})

it('distinguishes flexion, extension and effectively zero demand', () => {
  const task = { ...DEFAULT_TASK, balance: 'bar' as const, barPosition: 0.08 }
  const frame = solveFrame('deadlift', body, task, DEFAULT_COORDINATION.deadlift)
  const makeOverlay = () => buildMechanicsOverlay(frame, task, 'deadlift', body.height)
  const knee = makeOverlay().moments.find((m) => m.id === 'knee')!
  expect(knee.barMomentNm).toBeLessThan(0)
  expect(knee.barMomentNm + knee.bodyMomentNm).toBeCloseTo(knee.momentNm)
  frame.kinetics.moment = { l5s1: -20, hip: 20, knee: 0, ankle: -5 }
  expect(makeOverlay().moments.map((m) => m.action)).toEqual([
    'Flexión',
    'Extensión',
    'Momento ≈ 0',
    'Dorsiflexión',
  ])
  frame.kinetics.moment.ankle = 10
  expect(makeOverlay().moments[3].action).toBe('Flexión plantar')
  expect(formatForce(-19.9)).toBe('20 N')
  expect(formatMoment(-16.1)).toBe('-16 N·m')
  expect(formatMoment(-0.01)).toBe('0 N·m')
  expect(formatBarArm(-0.032)).toBe('3,2 cm')
})
