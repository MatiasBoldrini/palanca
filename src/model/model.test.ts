import { describe, expect, it } from 'vitest'
import {
  type Anthropometry,
  GRAVITY,
  DEFAULT_ANTHROPOMETRY,
  heightFromSegments,
  SEGMENT_MASS,
  anthropometryFromHeight,
  standingHipHeight,
} from './anthropometry'
import { angleBetween, dist } from './geometry'
import {
  DEFAULT_TASK,
  type ExerciseId,
  deadliftBarLimit,
  simulateSeries,
  solveDeadlift,
  solveFrame,
  solveSquat,
} from './lift'
import { type ParamId, type Setup, feasibleRange, nearestFeasibleProgress, patchFor } from './interact'
import { type TrunkShape, buildTrunkShape } from './posture'

/** Mean subject from Edington et al. (2018), Sports 6(3):90. */
const EDINGTON: Anthropometry = {
  height: 1.725,
  mass: 88.7,
  foot: 0.152 * 1.725,
  shank: 0.41,
  thigh: 0.384,
  torso: 0.427,
  arm: 0.523,
  maxDorsiflexion: 38,
}

const task = { ...DEFAULT_TASK, load: 180, progress: 0 }
const closeBar = { kneeTravel: 0, spineFlexion: 12, armLean: 0, barOffset: 0 }
const farBar = { kneeTravel: 1, spineFlexion: 12, armLean: 0, barOffset: 0 }

describe('anthropometric tables', () => {
  it('body segment masses sum to the whole body', () => {
    const total = Object.values(SEGMENT_MASS).reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(1, 6)
  })

  it('derives a standing hip height matching the landmark table', () => {
    const a = anthropometryFromHeight(1.75, 85)
    expect(standingHipHeight(a) / a.height).toBeCloseTo(0.53, 3)
  })
})

describe('trunk shape', () => {
  const a = anthropometryFromHeight(1.75, 85)
  const LANDMARKS = ['lumbosacral', 'lumbarApex', 'thoracolumbar', 'thoracicApex'] as const

  /**
   * How far a landmark sits behind the hip-to-shoulder chord, in metres.
   * Positive is posterior, which is the side a rounded back bulges towards.
   */
  function behindChord(shape: TrunkShape, key: (typeof LANDMARKS)[number]): number {
    const chord = shape.local.shoulder
    const p = shape.local[key]
    return (p.y * chord.x - p.x * chord.y) / Math.hypot(chord.x, chord.y)
  }

  it('shortens the hip-to-shoulder chord as the spine flexes', () => {
    const neutral = buildTrunkShape(a, 0)
    const rounded = buildTrunkShape(a, 40)
    expect(neutral.chord).toBeCloseTo(a.torso, 6)
    expect(rounded.chord).toBeLessThan(neutral.chord)
    // A pronounced round should trim a couple of per cent, not collapse the
    // torso: bowing a fixed arc through 40 deg is all this is.
    expect(rounded.chord / neutral.chord).toBeGreaterThan(0.9)
    expect(rounded.chord / neutral.chord).toBeLessThan(0.995)
  })

  // What the drawing has to say, and the reason the trunk is a curvature
  // distribution rather than links at hinges: at 0 the back reads as neutral,
  // which is a straight line, and every degree from there bows the whole back
  // a little further the same way. An S at any setting would be wrong.
  it('draws a dead straight back at zero flexion', () => {
    const neutral = buildTrunkShape(a, 0)
    for (const key of LANDMARKS) {
      expect(Math.abs(behindChord(neutral, key)), key).toBeLessThan(1e-9)
    }
  })

  it('bows the whole back one way, further with every degree', () => {
    let previous = LANDMARKS.map(() => 0)
    for (const flexion of [4, 8, 12, 20, 30, 45, 60]) {
      const shape = buildTrunkShape(a, flexion)
      const offsets = LANDMARKS.map((key) => behindChord(shape, key))
      offsets.forEach((offset, i) => {
        const where = `${LANDMARKS[i]} at ${flexion} deg`
        // No inflection anywhere along the back, and no landmark that stalls
        // or turns back while the rest keeps rounding.
        expect(offset, where).toBeGreaterThan(previous[i])
      })
      // A 60 deg round is a lot of rounding, and still nothing absurd.
      expect(Math.max(...offsets)).toBeLessThan(0.08)
      previous = offsets
    }
  })
})

describe('deadlift solver', () => {
  const close = solveDeadlift(EDINGTON, task, closeBar)
  const far = solveDeadlift(EDINGTON, task, farBar)

  it('produces finite, closed kinematic chains', () => {
    for (const frame of [close, far]) {
      expect(Number.isFinite(frame.posture.hip.x)).toBe(true)
      expect(dist(frame.posture.ankle, frame.posture.knee)).toBeCloseTo(EDINGTON.shank, 6)
      expect(dist(frame.posture.knee, frame.posture.hip)).toBeCloseTo(EDINGTON.thigh, 6)
    }
  })

  it('balances the combined centre of mass over the target centre of pressure', () => {
    for (const frame of [close, far]) {
      expect(frame.kinetics.com.x).toBeCloseTo(task.cop, 4)
    }
  })

  it('matches the trunk angle Edington et al. measured for the close bar setup', () => {
    // Measured torso angle from vertical: 77.56 +/- 5.29 deg.
    const fromVertical = 90 - close.angles.trunk
    expect(fromVertical).toBeGreaterThan(77.56 - 2 * 5.29)
    expect(fromVertical).toBeLessThan(77.56 + 2 * 5.29)
  })

  it('moves the knees, torso and knee demand in the measured directions', () => {
    // Holding the centre of pressure fixed makes the model respond more
    // strongly than the subjects did, who also let the bar drift forward, so
    // only the direction is asserted here.
    expect(close.angles.tibia).toBeCloseTo(8.6, 1)
    expect(far.angles.tibia).toBeCloseTo(19.5, 1)
    expect(far.angles.kneeFlexion).toBeGreaterThan(close.angles.kneeFlexion)
    expect(far.angles.trunk).toBeGreaterThan(close.angles.trunk)
    expect(far.kinetics.moment.knee).toBeGreaterThan(close.kinetics.moment.knee + 40)
  })

  it('changes the hip far less than the knee, as measured', () => {
    const hipChange = Math.abs(far.kinetics.moment.hip - close.kinetics.moment.hip)
    const kneeChange = Math.abs(far.kinetics.moment.knee - close.kinetics.moment.knee)
    expect(hipChange).toBeLessThan(kneeChange)
    expect(hipChange / Math.abs(close.kinetics.moment.hip)).toBeLessThan(0.25)
  })

  it('puts per-limb hip extension demand in the range reported for heavy pulls', () => {
    // Bouvier et al. (2025): 303 +/- 47 N.m per limb at 85 % 1RM.
    expect(close.kinetics.moment.hip).toBeGreaterThan(250)
    expect(close.kinetics.moment.hip).toBeLessThan(600)
  })

  it('reports where the pressure falls when the bar position is pinned instead', () => {
    const pinned = solveDeadlift(
      EDINGTON,
      { ...task, balance: 'bar', barPosition: 0 },
      closeBar,
    )
    expect(pinned.posture.bar.x).toBeCloseTo(0, 6)
    // With the bar behind the balanced position, the pressure moves rearward.
    expect(pinned.centreOfPressure).toBeLessThan(0)
    expect(pinned.centreOfPressure).toBeGreaterThan(pinned.support.heel)
  })

  it('reduces the hip moment arm when the spine flexes', () => {
    const neutral = solveDeadlift(EDINGTON, task, { ...closeBar, spineFlexion: 0 })
    const rounded = solveDeadlift(EDINGTON, task, { ...closeBar, spineFlexion: 40 })
    expect(rounded.kinetics.moment.hip).toBeLessThan(neutral.kinetics.moment.hip)
  })

  it('never stalls and always returns finite values across the whole pull', () => {
    const series = simulateSeries('deadlift', EDINGTON, task, closeBar, 41)
    for (const point of series.points) {
      expect(Number.isFinite(point.hip)).toBe(true)
      expect(Number.isFinite(point.knee)).toBe(true)
    }
    expect(series.peak.hip).toBeGreaterThan(0)
  })

  it('stops the bar at the shin instead of letting it pass through', () => {
    let tested = 0
    for (let i = 0; i <= 10; i++) {
      const progress = i / 10
      const frame = solveDeadlift(
        EDINGTON,
        { ...task, progress, balance: 'bar', barPosition: -0.4 },
        farBar,
      )
      const { ankle, knee, bar } = frame.posture
      // Only while the bar is passing the shin. Higher up the leg has moved on
      // and the shin is no longer in the way of anything.
      if (bar.y > knee.y) continue
      const t = (bar.y - ankle.y) / (knee.y - ankle.y)
      expect(bar.x).toBeGreaterThanOrEqual(ankle.x + (knee.x - ankle.x) * t)
      expect(frame.barBlocked).toBe(true)
      expect(frame.warnings).not.toContain('La barra atravesaría la tibia en esta posición.')
      tested += 1
    }
    expect(tested).toBeGreaterThan(2)
  })

  it('releases shin contact continuously when the bar clears the knee', () => {
    // A rearward support point and a forward knee keep the bar against the
    // shin through the crossing. The old cutoff lost several cm in one frame.
    const lift = { ...task, cop: -0.06 }
    let previous = solveDeadlift(EDINGTON, lift, farBar)
    let crossed = false
    for (let i = 1; i <= 1000; i++) {
      const current = solveDeadlift(EDINGTON, { ...lift, progress: i / 1000 }, farBar)
      if (previous.posture.bar.y <= previous.posture.knee.y &&
          current.posture.bar.y > current.posture.knee.y) {
        expect(previous.barBlocked).toBe(true)
        expect(Math.abs(current.posture.bar.x - previous.posture.bar.x)).toBeLessThan(0.002)
        expect(dist(current.posture.headTop, previous.posture.headTop)).toBeLessThan(0.003)
        crossed = true
      }
      previous = current
    }
    expect(crossed).toBe(true)
  })

  it('leaves an achievable bar position untouched', () => {
    const frame = solveDeadlift(
      EDINGTON,
      { ...task, balance: 'bar', barPosition: 0.05 },
      closeBar,
    )
    expect(frame.barBlocked).toBe(false)
    expect(frame.posture.bar.x).toBeCloseTo(0.05, 6)
  })

  it('unloads the hip as the bar rises', () => {
    const bottom = solveDeadlift(EDINGTON, { ...task, progress: 0 }, closeBar)
    const top = solveDeadlift(EDINGTON, { ...task, progress: 1 }, closeBar)
    expect(top.kinetics.moment.hip).toBeLessThan(bottom.kinetics.moment.hip)
    expect(top.angles.trunk).toBeGreaterThan(bottom.angles.trunk)
  })
})

describe('the arm hangs vertically at zero lean', () => {
  // Load-bearing assumption of the whole deadlift solve, and nothing else
  // guarded it. When the body or the task changes, what may move is the bar;
  // the shoulder has to come with it.
  it('keeps the shoulder over the bar however the body is built', () => {
    for (const torso of [0.4, 0.5, 0.65]) {
      for (const mass of [50, 85, 180]) {
        for (const arm of [0.45, 0.6, 0.8]) {
          const a = { ...EDINGTON, torso, mass, arm }
          const f = solveDeadlift(a, task, closeBar)
          // A very long torso on very short arms has no pose at all: the femur
          // and the trunk together are longer than the gap they have to span.
          // The model says so rather than drawing a lie, and the controls will
          // not let you build that body in the first place.
          if (!f.feasible) continue
          expect(
            Math.abs(f.posture.shoulder.x - f.posture.bar.x),
            `torso ${torso}, mass ${mass}, arm ${arm}`,
          ).toBeLessThan(0.002)
        }
      }
    }
  })

  it('refuses the bodies it cannot pose instead of drawing them wrong', () => {
    const impossible = solveDeadlift({ ...EDINGTON, torso: 0.65, arm: 0.45 }, task, closeBar)
    expect(impossible.feasible).toBe(false)
    expect(impossible.warnings).toContain('Las proporciones no cierran la cadena en esta posición.')
  })

  it('stops the torso short of the length that would fold it', () => {
    const setup: Setup = {
      exercise: 'deadlift',
      anthro: { ...EDINGTON, arm: 0.45 },
      task,
      coordination: closeBar,
    }
    const range = feasibleRange('torso', setup)
    expect(range.max).toBeLessThan(0.65)
    const atLimit = { ...setup.anthro, torso: range.max }
    expect(solveDeadlift(atLimit, task, closeBar).feasible).toBe(true)
  })

  it('holds all the way up, and in both balance modes', () => {
    for (const balance of ['cop', 'bar'] as const) {
      for (let i = 0; i <= 10; i++) {
        const f = solveDeadlift(
          EDINGTON,
          { ...task, progress: i / 10, balance, barPosition: 0.02 },
          closeBar,
        )
        expect(Math.abs(f.posture.shoulder.x - f.posture.bar.x), `${balance} at ${i / 10}`)
          .toBeLessThan(0.002)
      }
    }
  })
})

describe('leaning the arm off vertical', () => {
  const leaned = { ...closeBar, armLean: 6 }

  it('carries the shoulder in front of the bar by the arm trigonometry', () => {
    for (const armLean of [0, 3, 6, 10, 15]) {
      const f = solveDeadlift(EDINGTON, task, { ...closeBar, armLean })
      const ahead = f.posture.shoulder.x - f.posture.bar.x
      const where = `${armLean} deg`
      expect(ahead, where).toBeCloseTo(EDINGTON.arm * Math.sin((armLean * Math.PI) / 180), 6)
      // The hand stays on the bar and the arm keeps its length: leaning it is a
      // rotation about the grip, not a stretch.
      expect(dist(f.posture.shoulder, f.posture.hand), where).toBeCloseTo(EDINGTON.arm, 6)
      expect(f.feasible, where).toBe(true)
    }
  })

  it('charges the shoulder for the offset, and nothing when there is none', () => {
    const vertical = solveDeadlift(EDINGTON, task, closeBar)
    expect(Math.abs(vertical.kinetics.shoulderMoment)).toBeLessThan(0.5)

    const f = solveDeadlift(EDINGTON, task, leaned)
    // The bar can only push the hand up, so the whole offset is held by the
    // shoulder: load times gravity times the offset, split between two arms.
    const expected = (task.load * GRAVITY * f.kinetics.shoulderMomentArm) / 2
    expect(f.kinetics.shoulderMoment).toBeGreaterThan(expected)
    expect(f.kinetics.shoulderMoment).toBeLessThan(expected * 1.05)
  })

  it('makes the shoulder cost grow with both the lean and the load', () => {
    let previous = 0
    for (const armLean of [0, 3, 6, 10, 15]) {
      const m = solveDeadlift(EDINGTON, task, { ...closeBar, armLean }).kinetics.shoulderMoment
      expect(m, `${armLean} deg`).toBeGreaterThan(previous)
      previous = m
    }
    const light = solveDeadlift(EDINGTON, { ...task, load: 60 }, leaned)
    const heavy = solveDeadlift(EDINGTON, { ...task, load: 240 }, leaned)
    expect(heavy.kinetics.shoulderMoment).toBeGreaterThan(light.kinetics.shoulderMoment * 3)
  })

  it('leaves the squat alone, where the bar rests on the back', () => {
    const a = anthropometryFromHeight(1.75, 85)
    const squatTask = { ...DEFAULT_TASK, load: 150, depth: 0.55 }
    for (const armLean of [0, 6, 15]) {
      const f = solveSquat(a, squatTask, { ...closeBar, armLean, barOffset: 0.08 })
      expect(f.kinetics.shoulderMoment, `${armLean} deg`).toBe(0)
      expect(f.kinetics.moment.hip, `${armLean} deg`).toBeCloseTo(
        solveSquat(a, squatTask, { ...closeBar, armLean: 0, barOffset: 0.08 }).kinetics.moment.hip,
        6,
      )
    }
  })

  /*
   * A shoulder held in front of the bar cannot also be stacked over it, so the
   * lockout keeps its locked knees but finishes leaning by about the angle the
   * arm was asked to hold. That is not the model giving up: standing up
   * straight is what puts the arm back on the vertical, which is why every
   * lifter's arms are vertical at the top no matter how the pull started.
   */
  it('locks the knees out, leaning by about as much as the arm does', () => {
    for (const armLean of [3, 6, 10, 15]) {
      const top = solveDeadlift(EDINGTON, { ...task, progress: 1 }, { ...closeBar, armLean })
      const where = `${armLean} deg`
      expect(top.feasible, where).toBe(true)
      expect(top.angles.kneeInterior, where).toBeGreaterThan(170)
      const trunkFromVertical = 90 - top.angles.trunk
      expect(trunkFromVertical, where).toBeGreaterThan(armLean * 0.5)
      expect(trunkFromVertical, where).toBeLessThan(armLean + 1)
    }
  })
})

describe('lockout', () => {
  // Near full extension the joint angle is extremely sensitive to length:
  // shortening the reach by one per cent to keep the chain solvable bent the
  // hip fifteen degrees, and the top of the lift stopped looking like a
  // lockout at all. The angles are asserted, not the lengths, because the
  // lengths looked fine the whole time this was broken.
  it('finishes standing up, whatever the coordination', () => {
    for (const kneeTravel of [0, 0.5, 1]) {
      for (const spineFlexion of [0, 12, 40]) {
        const coord = { kneeTravel, spineFlexion, armLean: 0, barOffset: 0 }
        const top = solveDeadlift(EDINGTON, { ...task, progress: 1 }, coord)
        const where = `knee ${kneeTravel}, spine ${spineFlexion}`
        expect(angleBetween(top.posture.knee, top.posture.hip, top.posture.shoulder), where)
          .toBeGreaterThan(175)
        expect(top.angles.kneeInterior, where).toBeGreaterThan(170)
        expect(90 - top.angles.trunk, where).toBeLessThan(10)
      }
    }
  })

  it('ends standing up, not leaning, with the load handed to the calves', () => {
    const top = solveDeadlift(EDINGTON, { ...task, progress: 1 }, closeBar)
    const p = top.posture
    // A vertical stack from the knee up. The shin is the one thing that is not
    // vertical: the ankle sits behind midfoot, so it has to lean to put
    // everything above it over the balance point.
    expect(Math.abs(p.knee.x - p.hip.x)).toBeLessThan(0.01)
    expect(Math.abs(p.knee.x - p.shoulder.x)).toBeLessThan(0.01)
    expect(90 - top.angles.trunk).toBeLessThan(2)

    // Nothing left for the hip or the knee to hold, and the whole system
    // sitting in front of the ankle joint, which is what the calves are for.
    expect(Math.abs(top.kinetics.moment.hip)).toBeLessThan(15)
    expect(Math.abs(top.kinetics.moment.knee)).toBeLessThan(15)
    expect(top.kinetics.moment.ankle).toBeGreaterThan(50)
  })

  it('keeps the drawn limbs at their true length while doing it', () => {
    const top = solveDeadlift(EDINGTON, { ...task, progress: 1 }, closeBar)
    expect(dist(top.posture.ankle, top.posture.knee)).toBeCloseTo(EDINGTON.shank, 6)
    expect(dist(top.posture.knee, top.posture.hip)).toBeCloseTo(EDINGTON.thigh, 6)
    // The arm may absorb the tolerance, but only a hair of it.
    expect(dist(top.posture.shoulder, top.posture.hand)).toBeCloseTo(EDINGTON.arm, 2)
  })
})

describe('work of the lift', () => {
  it('equals the potential energy the whole system gains', () => {
    const series = simulateSeries('deadlift', EDINGTON, task, closeBar, 41)
    const bottom = solveDeadlift(EDINGTON, { ...task, progress: 0 }, closeBar)
    const top = solveDeadlift(EDINGTON, { ...task, progress: 1 }, closeBar)
    const rise = top.kinetics.com.y - bottom.kinetics.com.y
    expect(series.work).toBeCloseTo((EDINGTON.mass + task.load) * GRAVITY * rise, 6)
  })

  it('keeps work, chart samples and camera poses inside the reachable range', () => {
    const coord = { ...closeBar, kneeTravel: 1 }
    const range = { min: 0.18, max: 0.78 }
    const series = simulateSeries('deadlift', EDINGTON, task, coord, 33, range)
    const bottom = solveDeadlift(EDINGTON, { ...task, progress: range.min }, coord)
    const top = solveDeadlift(EDINGTON, { ...task, progress: range.max }, coord)
    expect(series.postures).toHaveLength(33)
    expect(series.points[0].progress).toBe(range.min)
    expect(series.points.at(-1)?.progress).toBeCloseTo(range.max)
    expect(series.postures[0].bar).toEqual(bottom.posture.bar)
    expect(series.postures.at(-1)?.bar.y).toBeCloseTo(top.posture.bar.y)
    expect(series.work).toBeCloseTo((top.kinetics.com.y - bottom.kinetics.com.y) *
      (task.load + EDINGTON.mass) * GRAVITY, 6)

    const held = simulateSeries('deadlift', EDINGTON, task, coord, 33, { min: 0.4, max: 0.4 })
    expect(held.points.map((point) => point.progress)).toEqual([0.4])
    expect(held.work).toBe(0)
    expect(held.postures).toHaveLength(1)
  })

  it('scales with the load, since the bar is most of what goes up', () => {
    const light = simulateSeries('deadlift', EDINGTON, { ...task, load: 60 }, closeBar, 41)
    const heavy = simulateSeries('deadlift', EDINGTON, { ...task, load: 240 }, closeBar, 41)
    expect(heavy.work).toBeGreaterThan(light.work * 2)
  })

  it('costs more to lift your own body further, with the knees forward', () => {
    // The knee-forward setup starts with the hips lower, so the same bar
    // travel comes with more of the lifter's own mass to raise.
    const hip = simulateSeries('deadlift', EDINGTON, task, closeBar, 41)
    const knee = simulateSeries('deadlift', EDINGTON, task, farBar, 41)
    expect(knee.work).toBeGreaterThan(hip.work)
  })
})

describe('control ranges', () => {
  const setupFor = (
    exercise: ExerciseId,
    overrides: Partial<Setup> = {},
  ): Setup => ({
    exercise,
    anthro: EDINGTON,
    task: { ...task, progress: 0.3 },
    coordination: exercise === 'deadlift' ? closeBar : { ...closeBar, barOffset: 0.08 },
    ...overrides,
  })

  const withParam = (setup: Setup, id: ParamId, value: number): Setup => {
    const patch = patchFor(id, value)
    return {
      ...setup,
      anthro: { ...setup.anthro, ...patch.anthro },
      task: { ...setup.task, ...patch.task },
      coordination: { ...setup.coordination, ...patch.coordination },
    }
  }

  const ALL: ParamId[] = [
    'progress',
    'load',
    'cop',
    'barPosition',
    'kneeTravel',
    'spineFlexion',
    'armLean',
    'foot',
    'shank',
    'thigh',
    'torso',
    'arm',
  ]

  it.each(['deadlift', 'squat'] as const)('recovers a reachable %s endpoint after changing setup', (exercise) => {
    const dimensions = exercise === 'squat' ? { torso: 0.35, arm: 0.80 } : { shank: 0.60, thigh: 0.30 }
    const anthro = { ...DEFAULT_ANTHROPOMETRY, ...dimensions }
    anthro.height = heightFromSegments(anthro)
    const setup = setupFor(exercise, {
      anthro,
      coordination: exercise === 'squat'
        ? { kneeTravel: 0.25, spineFlexion: 8, armLean: 0, barOffset: 0.085 }
        : { kneeTravel: 0, spineFlexion: 12, armLean: 0, barOffset: 0 },
      task: { ...DEFAULT_TASK, cop: -0.06, load: 20, progress: exercise === 'squat' ? 1 : 0 },
    })
    const at = (progress: number) =>
      solveFrame(exercise, anthro, { ...setup.task, progress }, setup.coordination).feasible
    expect(at(setup.task.progress)).toBe(false)
    const range = feasibleRange('progress', setup)
    const recovered = nearestFeasibleProgress(setup)!
    expect(recovered).not.toBeNull()
    expect(at(recovered)).toBe(true)
    expect(recovered).toBeCloseTo(exercise === 'squat' ? range.max : range.min, 3)
    for (let i = 0; i <= 20; i++) {
      expect(at(range.min + (range.max - range.min) * i / 20)).toBe(true)
    }
  })

  it('only offers values that produce a pose the model can actually build', () => {
    for (const exercise of ['deadlift', 'squat'] as ExerciseId[]) {
      for (const id of ALL) {
        const setup = setupFor(exercise)
        const range = feasibleRange(id, setup)
        for (let i = 0; i <= 20; i++) {
          const v = range.min + ((range.max - range.min) * i) / 20
          const s = withParam(setup, id, v)
          const frame = solveFrame(s.exercise, s.anthro, s.task, s.coordination)
          const where = `${exercise} ${id} at ${v}`
          expect(frame.feasible, where).toBe(true)
          // Bones do not stretch. A chain that failed to close draws itself
          // with the wrong segment lengths, which is what "the figure broke"
          // looks like on screen.
          expect(dist(frame.posture.ankle, frame.posture.knee), where).toBeCloseTo(s.anthro.shank, 6)
          expect(dist(frame.posture.knee, frame.posture.hip), where).toBeCloseTo(s.anthro.thigh, 6)
        }
      }
    }
  })

  it('reaches a real lockout, however rounded the back is', () => {
    for (const spineFlexion of [0, 12, 30, 50]) {
      const setup = setupFor('deadlift', {
        coordination: { ...closeBar, spineFlexion },
      })
      expect(feasibleRange('progress', setup).max, `${spineFlexion} deg`).toBeCloseTo(1, 6)
    }
  })

  it('keeps the current value inside the range it offers', () => {
    for (const id of ALL) {
      const setup = setupFor('deadlift')
      const range = feasibleRange(id, setup)
      expect(range.min).toBeLessThanOrEqual(range.max)
    }
  })

  it('starts the bar-position control at the shin rather than behind it', () => {
    const setup = setupFor('deadlift', { coordination: farBar })
    const range = feasibleRange('barPosition', setup)
    expect(range.min).toBeCloseTo(
      deadliftBarLimit(setup.anthro, setup.task, setup.coordination),
      6,
    )
    // Nothing the control can ask for gets clamped away by the solver.
    const atFloor = withParam(setup, 'barPosition', range.min)
    expect(solveDeadlift(atFloor.anthro, atFloor.task, atFloor.coordination).posture.bar.x)
      .toBeCloseTo(range.min, 6)
  })

  it('does not move its own end stops as the value slides across the range', () => {
    const setup = setupFor('deadlift')
    const base = feasibleRange('kneeTravel', setup)
    for (const v of [base.min, (base.min + base.max) / 2, base.max]) {
      const moved = feasibleRange('kneeTravel', withParam(setup, 'kneeTravel', v))
      expect(moved.min).toBeCloseTo(base.min, 6)
      expect(moved.max).toBeCloseTo(base.max, 6)
    }
  })
})

describe('squat solver', () => {
  const a = anthropometryFromHeight(1.75, 85)
  const squatTask = { ...DEFAULT_TASK, load: 150, progress: 0, depth: 0.55 }
  const highBar = { kneeTravel: 0.8, spineFlexion: 6, armLean: 0, barOffset: 0.0 }
  const lowBar = { kneeTravel: 0.2, spineFlexion: 6, armLean: 0, barOffset: 0.08 }

  it('keeps the system balanced over midfoot at every depth', () => {
    for (let i = 0; i <= 10; i++) {
      const frame = solveSquat(a, { ...squatTask, progress: i / 10 }, highBar)
      expect(frame.kinetics.com.x).toBeCloseTo(0, 3)
      expect(dist(frame.posture.knee, frame.posture.hip)).toBeCloseTo(a.thigh, 6)
    }
  })

  it('matches the high-bar and low-bar contrast from Glassbrook et al. (2017)', () => {
    const high = solveSquat(a, squatTask, highBar)
    const low = solveSquat(a, squatTask, lowBar)
    expect(high.angles.trunk).toBeGreaterThan(low.angles.trunk)
    expect(high.angles.kneeFlexion).toBeGreaterThan(low.angles.kneeFlexion)
    expect(low.kinetics.moment.hip).toBeGreaterThan(high.kinetics.moment.hip)
    expect(high.kinetics.kneeDominance).toBeGreaterThan(low.kinetics.kneeDominance)
  })

  it('puts extensor demand in the range reported by Escamilla et al. (2001)', () => {
    const low = solveSquat(a, squatTask, lowBar)
    expect(low.kinetics.moment.hip).toBeGreaterThan(150)
    expect(low.kinetics.moment.hip).toBeLessThan(700)
  })

  it('holds a more upright trunk at the bottom than a deadlift off the floor', () => {
    const squat = solveSquat(a, squatTask, lowBar)
    const deadlift = solveDeadlift(a, { ...DEFAULT_TASK, progress: 0 }, closeBar)
    expect(squat.angles.trunk).toBeGreaterThan(deadlift.angles.trunk)
  })

  it('peaks the hip moment just out of the hole', () => {
    const series = simulateSeries('squat', a, squatTask, lowBar, 41)
    expect(series.peakHipProgress).toBeLessThan(0.25)
  })

  it('keeps the femur near horizontal at the parallel depth setting', () => {
    const parallel = solveSquat(a, { ...squatTask, depth: 0.5 }, lowBar)
    expect(parallel.angles.thigh).toBeLessThan(12)
  })
})
