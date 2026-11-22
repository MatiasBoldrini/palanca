import { describe, expect, it } from 'vitest'
import { DEFAULT_ANTHROPOMETRY } from './anthropometry'
import { withSetupPatch, type HotspotId, type Setup } from './interact'
import { solveFrame, DEFAULT_COORDINATION, DEFAULT_TASK, type ExerciseId } from './lift'
import { standingPartControls } from './standingPartControls'

function setupFor(exercise: ExerciseId, progress: number): Setup {
  return {
    exercise,
    coordination: { ...DEFAULT_COORDINATION[exercise] },
    task: { ...DEFAULT_TASK, progress },
    anthro: { ...DEFAULT_ANTHROPOMETRY },
  }
}
const solve = (s: Setup) => solveFrame(s.exercise, s.anthro, s.task, s.coordination)
const segments: HotspotId[] = ['foot', 'shank', 'thigh', 'spine', 'arm']

describe.each(['deadlift', 'squat'] as const)('%s direct part editing', (exercise) => {
  it.each([0, 0.5, 1])('reaches the displayed physical quantities at progress %s', (progress) => {
    const setup = setupFor(exercise, progress)
    for (const part of segments) {
      const options = standingPartControls(part, setup)
      expect(
        options.map((control) => control.kind),
        part,
      ).toEqual(expect.arrayContaining(['position', 'rotation', 'length']))
      for (const control of options) {
        const next =
          Math.abs(control.max - control.value) > Math.abs(control.min - control.value)
            ? control.max
            : control.min
        const target = control.value + (next - control.value) * 0.65
        const changed = withSetupPatch(setup, control.patch(target))
        const actual = standingPartControls(part, changed).find((c) => c.id === control.id)
        const where = part + ' ' + control.id
        expect(actual?.value, where).toBeCloseTo(target, 1)
        expect(solve(changed).feasible, where).toBe(true)
        if (!control.label.includes('en el recorrido'))
          expect(changed.task.progress, where).toBe(progress)
      }
    }
  })

  it('keeps the sole on the ground when turning the foot in place', () => {
    const setup = setupFor(exercise, 0.4)
    const old = solve(setup)
    const control = standingPartControls('foot', setup).find((c) => c.id === 'toeOutDeg')!
    const changed = solve(withSetupPatch(setup, control.patch(34)))
    const f = changed.posture
    expect(changed.stance.toeOut).toBe(34)
    expect(changed.stance.width).toBe(old.stance.width)
    expect(f.heel.y).toBe(0)
    expect(f.toe.y).toBe(0)
    expect(
      Math.hypot(f.toe.x - f.heel.x, changed.stance.toeHalf - changed.stance.heelHalf),
    ).toBeCloseTo(setup.anthro.foot, 8)
    expect(f.hand).toEqual(f.bar)
  })

  it('clamps extrema and keeps phase and proportions for a thigh rotation away from lockout', () => {
    const setup = setupFor(exercise, 0.32)
    const control = standingPartControls('thigh', setup).find((c) => c.kind === 'rotation')!
    expect(control.label).not.toContain('recorrido')
    for (const request of [control.min - 20, control.max + 20]) {
      const changed = withSetupPatch(setup, control.patch(request))
      expect(changed.task.progress).toBe(setup.task.progress)
      expect(changed.anthro).toEqual(setup.anthro)
      const frame = solve(changed)
      expect(frame.feasible).toBe(true)
      const theta =
        (Math.atan2(
          frame.posture.hip.y - frame.posture.knee.y,
          frame.posture.knee.x - frame.posture.hip.x,
        ) *
          180) /
        Math.PI
      expect(theta).toBeCloseTo(request < control.min ? control.min : control.max, 1)
    }
  })
})

it('rotates the elbow about a fixed squat grip with rigid upper and lower arm links', () => {
  const setup = setupFor('squat', 0.3)
  const elbows = []
  for (const angle of [-40, -20, 0, 20, 40]) {
    const s = { ...setup, coordination: { ...setup.coordination, squatElbowAngle: angle } }
    const f = solve(s),
      p = f.posture
    const upper = Math.hypot(
      p.shoulder.x - p.elbow.x,
      p.shoulder.y - p.elbow.y,
      f.stance.shoulderHalf - f.stance.elbowHalf,
    )
    const lower = Math.hypot(
      p.elbow.x - p.hand.x,
      p.elbow.y - p.hand.y,
      f.stance.elbowHalf - f.stance.gripHalf,
    )
    expect(upper).toBeCloseTo(s.anthro.arm * 0.52, 8)
    expect(lower).toBeCloseTo(s.anthro.arm * 0.48, 8)
    expect(p.hand).toEqual(p.bar)
    expect(f.feasible).toBe(true)
    elbows.push(p.elbow)
  }
  for (let i = 1; i < elbows.length; i++) {
    const step = Math.hypot(elbows[i].x - elbows[i - 1].x, elbows[i].y - elbows[i - 1].y)
    expect(step).toBeGreaterThan(0.02)
    expect(step).toBeLessThan(setup.anthro.arm * 0.2)
  }
})
