import type { Anthropometry } from './anthropometry'
import { clamp, lerp, rad } from './geometry'
import type { Coordination, ExerciseId } from './lift'

export const TOE_OUT_RANGE = { min: 0, max: 45 } as const

export type DeadliftStyle = 'conventional' | 'sumo'

/** Positive transverse distances refer to one side of the sagittal midline.
 * The actual endpoints on the opposite side always have the opposite sign. */
export interface Stance {
  width: number
  toeOut: number
  toeOutRad: number
  ankleHalf: number
  kneeHalf: number
  hipHalf: number
  heelHalf: number
  toeHalf: number
  shoulderHalf: number
  elbowHalf: number
  gripHalf: number
  sagittalShank: number
  sagittalThigh: number
  /** For a straight deadlift arm; a bent squat arm uses the full length in its own 3D solve. */
  sagittalArm: number
  sagittalFoot: number
}

export function defaultStanceWidth(
  exercise: ExerciseId,
  height: number,
  style: DeadliftStyle = 'conventional',
) {
  if (exercise === 'deadlift' && style === 'sumo') return height * 0.43
  return (height / 1.71) * (exercise === 'squat' ? 0.302 : 0.23)
}

export function stanceWidthRange(
  exercise: ExerciseId,
  a: Anthropometry,
  style: DeadliftStyle = 'conventional',
) {
  const sumo = exercise === 'deadlift' && style === 'sumo'
  const min = a.height * (exercise === 'squat' ? 0.12 : sumo ? 0.3 : 0.1)
  const broadest = a.height * (exercise === 'squat' ? 0.52 : sumo ? 0.58 : 0.32)
  // The widest modeled base must still leave available sagittal femur length.
  const hipHalf = (a.height / 1.71) * 0.08
  return { min, max: Math.min(broadest, 2 * (hipHalf + 0.86 * a.thigh)) }
}

function sagittalLength(length: number, lateral: number) {
  return Math.sqrt(Math.max(0, length * length - lateral * lateral))
}

/** A symmetric, prescribed frontal pose. Width changes the length available
 * to the sagittal solver; the displayed kinetics remain sagittal components.
 * These neutral and wide settings illustrate geometry, not measured technique. */
export function getStance(
  exercise: ExerciseId,
  a: Anthropometry,
  coord: Coordination,
  progress = 0,
): Stance {
  const style = coord.deadliftStyle === 'sumo' ? 'sumo' : 'conventional'
  const sumo = exercise === 'deadlift' && style === 'sumo'
  const { min, max } = stanceWidthRange(exercise, a, style)
  const nominal = defaultStanceWidth(exercise, a.height, style)
  const asked = coord.stanceWidth
  const width = clamp(asked !== undefined && Number.isFinite(asked) ? asked : nominal, min, max)
  const fraction = (width - min) / (max - min)
  const presetToeOut =
    exercise === 'squat'
      ? lerp(8, 34, fraction)
      : sumo
        ? lerp(24, 42, fraction)
        : lerp(5, 18, fraction)
  const toeOut = typeof coord.toeOutDeg === 'number' && Number.isFinite(coord.toeOutDeg)
    ? clamp(coord.toeOutDeg, TOE_OUT_RANGE.min, TOE_OUT_RANGE.max) : presetToeOut
  const toeOutRad = rad(toeOut)
  const s = a.height / 1.71
  const hipHalf = 0.08 * s
  // The quarter-foot offset from ankle to midfoot rotates with the foot.
  const footSide = a.foot * Math.sin(toeOutRad)
  const ankleHalf = width / 2 - footSide / 4
  const shoulderHalf = 0.162 * s
  // At lockout the transverse component follows one straight leg. Flexing the
  // knee brings it outward toward its own foot, which changes the two sagittal projections.
  const standingKnee = lerp(hipHalf, ankleHalf, a.thigh / (a.shank + a.thigh))
  const bentKnee = lerp(hipHalf, ankleHalf, exercise === 'squat' ? 0.94 : 0.86)
  const t = clamp(progress, 0, 1)
  const kneeHalf = lerp(bentKnee, standingKnee, t * t * (3 - 2 * t))
  // Keep both hands on the same fixed points of the steel shaft throughout
  // the rep. In sumo they clear the inside knee, in conventional the outside.
  const gripHalf =
    exercise === 'squat'
      ? 0.35 * s
      : sumo
        ? Math.min(shoulderHalf, Math.min(bentKnee, standingKnee) - 0.023 * s)
        : Math.max(0.218 * s, Math.max(bentKnee, standingKnee) + 0.038 * s)
  return {
    width,
    toeOut,
    toeOutRad,
    ankleHalf,
    kneeHalf,
    hipHalf,
    shoulderHalf,
    gripHalf,
    heelHalf: width / 2 - footSide / 2,
    toeHalf: width / 2 + footSide / 2,
    elbowHalf: exercise === 'squat' ? 0.357 * s : lerp(shoulderHalf, gripHalf, 0.55),
    sagittalShank: sagittalLength(a.shank, ankleHalf - kneeHalf),
    sagittalThigh: sagittalLength(a.thigh, kneeHalf - hipHalf),
    sagittalArm: exercise === 'deadlift' ? sagittalLength(a.arm, gripHalf - shoulderHalf) : a.arm,
    sagittalFoot: a.foot * Math.cos(toeOutRad),
  }
}
