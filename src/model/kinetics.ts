import { GRAVITY } from './anthropometry'
import { type Vec2, norm, rad, sub } from './geometry'
import type { MassPoint, Posture } from './posture'

/**
 * Effective erector spinae moment arm at L5/S1. Back-calculated from
 * Cholewicki et al. (1991), whose reported peak compression of 17.2 kN at a
 * 1047 N.m moment implies about 6 cm. Using their figure keeps our estimate on
 * the same scale as the numbers this tool cites.
 */
const ERECTOR_MOMENT_ARM = 0.06
/** Angle of the erector line of action relative to the spine axis. */
const ERECTOR_PULL_ANGLE = rad(10)

/** Which point masses each joint has to support, in the top-down formulation. */
const ABOVE: Record<JointKey, readonly string[]> = {
  ankle: ['shanks', 'thighs', 'pelvis', 'lumbar', 'thorax', 'headNeck', 'arms'],
  knee: ['thighs', 'pelvis', 'lumbar', 'thorax', 'headNeck', 'arms'],
  hip: ['pelvis', 'lumbar', 'thorax', 'headNeck', 'arms'],
  l5s1: ['lumbar', 'thorax', 'headNeck', 'arms'],
}

export type JointKey = 'ankle' | 'knee' | 'hip' | 'l5s1'

/**
 * Hip, knee and ankle moments are reported per limb, which is the convention
 * in the inverse-dynamics literature we validate against. L5/S1 is a single
 * midline joint and carries the whole load.
 */
export const LIMB_SHARE: Record<JointKey, number> = { ankle: 0.5, knee: 0.5, hip: 0.5, l5s1: 1 }

/**
 * Sign applied so that a positive number always means "the muscles spanning
 * this joint must produce extension" (plantarflexion at the ankle). The raw
 * top-down sum has the opposite meaning at the knee, because the thigh
 * extends backwards from it.
 */
export const EXTENSOR_SIGN: Record<JointKey, number> = { ankle: 1, knee: -1, hip: 1, l5s1: 1 }

export interface Kinetics {
  /** Net extensor demand, N.m. Negative means the joint needs flexor torque. */
  moment: Record<JointKey, number>
  /** Same values normalised by body mass, N.m/kg. */
  momentPerKg: Record<JointKey, number>
  /** Horizontal distance from the joint to the bar, metres. */
  barMomentArm: Record<JointKey, number>
  /** Horizontal distance from the joint to the combined centre of mass, metres. */
  comMomentArm: Record<JointKey, number>
  /** |knee moment| / |hip moment|. Above 1 the lift is knee-dominant. */
  kneeDominance: number
  /**
   * Shoulder extension demand per shoulder, N.m: what the lats and the
   * posterior shoulder have to produce to hold the arm off vertical. Zero when
   * the arms carry nothing, as in the squat.
   */
  shoulderMoment: number
  /** Horizontal distance from the shoulder to the bar, metres. */
  shoulderMomentArm: number
  /** Estimated L5/S1 compressive force, newtons. */
  lumbarCompression: number
  /** Estimated L5/S1 anterior shear force, newtons. */
  lumbarShear: number
  /** Combined body + bar centre of mass. */
  com: Vec2
  /** Total system weight, newtons. */
  systemWeight: number
}

export const JOINT_POINT: Record<JointKey, (p: Posture) => Vec2> = {
  ankle: (p) => p.ankle,
  knee: (p) => p.knee,
  hip: (p) => p.hip,
  l5s1: (p) => p.lumbosacral,
}

/**
 * Quasi-static inverse solution computed top-down: each joint moment is the
 * sum of the gravitational moments of everything it carries. This avoids the
 * ground-reaction-force-vector shortcut, which ignores supraincumbent weight
 * and segment reaction forces (Vigotsky).
 */
export function computeKinetics(
  posture: Posture,
  bodyPoints: MassPoint[],
  barMass: number,
  bodyMass: number,
  /** False when the load rests on the body instead of hanging from the hands. */
  { armsCarryLoad }: { armsCarryLoad: boolean },
): Kinetics {
  const byKey = new Map(bodyPoints.map((p) => [p.key, p]))
  const bar: MassPoint = { key: 'bar', position: posture.bar, mass: barMass }
  const all = [...bodyPoints, bar]

  let sx = 0
  let sy = 0
  let totalMass = 0
  for (const point of all) {
    sx += point.mass * point.position.x
    sy += point.mass * point.position.y
    totalMass += point.mass
  }
  const com: Vec2 = { x: sx / totalMass, y: sy / totalMass }

  const moment = {} as Record<JointKey, number>
  const momentPerKg = {} as Record<JointKey, number>
  const barMomentArm = {} as Record<JointKey, number>
  const comMomentArm = {} as Record<JointKey, number>

  for (const key of Object.keys(ABOVE) as JointKey[]) {
    const joint = JOINT_POINT[key](posture)
    let m = barMass * GRAVITY * (posture.bar.x - joint.x)
    for (const segment of ABOVE[key]) {
      const point = byKey.get(segment)
      if (!point) continue
      m += point.mass * GRAVITY * (point.position.x - joint.x)
    }
    m *= LIMB_SHARE[key] * EXTENSOR_SIGN[key]
    moment[key] = m
    momentPerKg[key] = m / bodyMass
    barMomentArm[key] = posture.bar.x - joint.x
    comMomentArm[key] = com.x - joint.x
  }

  const spineAxis = sub(posture.thoracolumbar, posture.lumbosacral)
  const spineLen = norm(spineAxis) || 1
  const ux = spineAxis.x / spineLen
  const uy = spineAxis.y / spineLen

  let weightAbove = barMass * GRAVITY
  for (const segment of ABOVE.l5s1) {
    const point = byKey.get(segment)
    if (point) weightAbove += point.mass * GRAVITY
  }

  const erectorForce = Math.abs(moment.l5s1) / ERECTOR_MOMENT_ARM
  const lumbarCompression = erectorForce * Math.cos(ERECTOR_PULL_ANGLE) + weightAbove * uy
  const lumbarShear = weightAbove * ux - erectorForce * Math.sin(ERECTOR_PULL_ANGLE)

  const kneeDominance =
    Math.abs(moment.hip) > 1e-6 ? Math.abs(moment.knee) / Math.abs(moment.hip) : 0

  /*
   * A hanging bar can only push the hand upwards: whatever horizontal offset
   * there is between the shoulder and the bar has to be held by the shoulder
   * itself. So the arm hanging vertical is not an accident of technique, it is
   * the only free way to hold a load, and this is the price of departing from
   * it. Split per shoulder, like the other paired joints.
   */
  const arms = byKey.get('arms')
  const shoulderMomentArm = armsCarryLoad ? posture.shoulder.x - posture.bar.x : 0
  let shoulderMoment = 0
  if (armsCarryLoad) {
    shoulderMoment = barMass * GRAVITY * shoulderMomentArm
    if (arms) {
      shoulderMoment += arms.mass * GRAVITY * (posture.shoulder.x - arms.position.x)
    }
    shoulderMoment *= 0.5
  }

  return {
    moment,
    momentPerKg,
    barMomentArm,
    comMomentArm,
    kneeDominance,
    shoulderMoment,
    shoulderMomentArm,
    lumbarCompression,
    lumbarShear,
    com,
    systemWeight: totalMass * GRAVITY,
  }
}
