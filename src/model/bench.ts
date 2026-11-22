import {
  GRAVITY,
  LANDMARK_HEIGHT,
  LENGTH_FRACTION,
  SEGMENT_COM,
  SEGMENT_MASS,
  TRUNK_LINK_FRACTION,
} from './anthropometry'
import { clamp } from './geometry'

/** Supine world coordinates in metres: +X toward the head, +Y up, Z across the bench. */
export interface BenchPoint {
  x: number
  y: number
  z: number
}
export type BenchJointId = 'shoulder' | 'elbow' | 'wrist'
/** Internal moment exerted on the distal segments, in world axes, N·m. */
export interface BenchJointMoment extends BenchPoint {
  magnitudeNm: number
}
export interface BenchArm {
  shoulder: BenchPoint
  elbow: BenchPoint
  wrist: BenchPoint
  grip: BenchPoint
  /** Unit normal of the elbow bend plane, including at full extension. */
  elbowPlaneNormal: BenchPoint
  moments: Record<BenchJointId, BenchJointMoment>
}
export interface BenchLeg {
  hip: BenchPoint
  knee: BenchPoint
  ankle: BenchPoint
  heel: BenchPoint
  toe: BenchPoint
}
export interface BenchFrame {
  bar: BenchPoint
  bodyCom: BenchPoint
  benchSupport: BenchPoint
  footSupport: BenchPoint
  benchHeight: number
  /** Signed vertical forces on the body–bar system, in N. Feet and bench report total reactions. */
  forces: { barN: number; bodyN: number; benchN: number; feetN: number }
  /** The +Z limb precedes the −Z limb in both tuples. */
  arms: [BenchArm, BenchArm]
  pose: {
    hip: BenchPoint
    chest: BenchPoint
    neck: BenchPoint
    head: BenchPoint
    legs: [BenchLeg, BenchLeg]
  }
}

export const BENCH_GRIP = { min: 1, max: 2, default: 1.5 } as const
export const benchPointDistance = (a: BenchPoint, b: BenchPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const at = (x: number, y: number, z = 0): BenchPoint => ({ x, y, z })
const between = (a: BenchPoint, b: BenchPoint, t: number): BenchPoint =>
  at(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)

type PointMass = { at: BenchPoint; kg: number }
type ArmPoints = Omit<BenchArm, 'moments'>

/** Two rigid links, with an outward-and-footward elbow plane at every grip width. */
function placeArm(
  side: number,
  shoulderHalfWidth: number,
  shoulderY: number,
  bar: BenchPoint,
  gripHalfWidth: number,
  armLength: number,
): ArmPoints {
  const shoulder = at(0, shoulderY, side * shoulderHalfWidth)
  const grip = at(bar.x, bar.y, side * gripHalfWidth)
  const upper = armLength * 0.52
  const lower = armLength - upper
  const span = benchPointDistance(grip, shoulder)
  const axis = at(grip.x / span, (grip.y - shoulder.y) / span, (grip.z - shoulder.z) / span)
  const pole = at(-0.42, -1, side * 0.18)
  const dot = pole.x * axis.x + pole.y * axis.y + pole.z * axis.z
  const normal = at(pole.x - dot * axis.x, pole.y - dot * axis.y, pole.z - dot * axis.z)
  const normalLength = Math.hypot(normal.x, normal.y, normal.z)
  const elbowPlaneNormal = at(
    (axis.y * normal.z - axis.z * normal.y) / normalLength,
    (axis.z * normal.x - axis.x * normal.z) / normalLength,
    (axis.x * normal.y - axis.y * normal.x) / normalLength,
  )
  const along = (upper * upper - lower * lower + span * span) / (2 * span)
  const radius = Math.sqrt(Math.max(0, upper * upper - along * along))
  const off = radius / normalLength
  const elbow = at(
    shoulder.x + along * axis.x + off * normal.x,
    shoulder.y + along * axis.y + off * normal.y,
    shoulder.z + along * axis.z + off * normal.z,
  )
  const wrist = between(elbow, grip, 0.87)
  return { shoulder, elbow, wrist, grip, elbowPlaneNormal }
}

/** Opposite of the moment of the distal weights about the joint: −Σ(r × F). */
function internalMoment(joint: BenchPoint, distal: PointMass[]): BenchJointMoment {
  let x = 0
  let z = 0
  for (const mass of distal) {
    const weight = mass.kg * GRAVITY
    x -= (mass.at.z - joint.z) * weight
    z += (mass.at.x - joint.x) * weight
  }
  return { x, y: 0, z, magnitudeNm: Math.hypot(x, z) }
}

function loadArm(points: ArmPoints, bodyKg: number, barKg: number) {
  const { shoulder, elbow, wrist, grip } = points
  // Dempster/Winter segment fractions of body mass, for one arm. Together
  // they equal half the bilateral arms mass used by the standing solver.
  const upper = { at: between(shoulder, elbow, 0.436), kg: bodyKg * 0.028 }
  const forearm = { at: between(elbow, wrist, 0.43), kg: bodyKg * 0.016 }
  const hand = { at: between(wrist, grip, 0.5), kg: bodyKg * 0.006 }
  const bar = { at: grip, kg: barKg / 2 }
  const moments = {
    shoulder: internalMoment(shoulder, [upper, forearm, hand, bar]),
    elbow: internalMoment(elbow, [forearm, hand, bar]),
    wrist: internalMoment(wrist, [hand, bar]),
  }
  return { arm: { ...points, moments }, bodyMasses: [upper, forearm, hand] }
}

function placeLeg(side: number, hipMid: BenchPoint, height: number): BenchLeg {
  const hip = at(hipMid.x, hipMid.y, (side * LENGTH_FRACTION.hipWidth * height) / 2)
  const kneeZ = side * 0.115 * height
  const ankleZ = side * 0.125 * height
  const shinDx = 0.035 * height
  const ankleY = LANDMARK_HEIGHT.ankle * height
  const kneeY =
    ankleY + Math.sqrt((LENGTH_FRACTION.shank * height) ** 2 - shinDx ** 2 - (ankleZ - kneeZ) ** 2)
  const thighDx = Math.sqrt(
    Math.max(
      0,
      (LENGTH_FRACTION.thigh * height) ** 2 - (hip.y - kneeY) ** 2 - (hip.z - kneeZ) ** 2,
    ),
  )
  const knee = at(hip.x - thighDx, kneeY, kneeZ)
  const ankle = at(knee.x + shinDx, ankleY, ankleZ)
  const footLength = LENGTH_FRACTION.foot * height
  return {
    hip,
    knee,
    ankle,
    heel: at(ankle.x + footLength / 4, 0, ankleZ),
    toe: at(ankle.x - (footLength * 3) / 4, 0, ankleZ),
  }
}

function legMasses(leg: BenchLeg, bodyKg: number): PointMass[] {
  return [
    { at: between(leg.heel, leg.toe, 0.5), kg: (bodyKg * SEGMENT_MASS.feet) / 2 },
    { at: between(leg.knee, leg.ankle, SEGMENT_COM.shank), kg: (bodyKg * SEGMENT_MASS.shanks) / 2 },
    { at: between(leg.hip, leg.knee, SEGMENT_COM.thigh), kg: (bodyKg * SEGMENT_MASS.thighs) / 2 },
  ]
}

/**
 * Symmetric, vertical-force, quasi-static bench press. The bar load is held
 * equally by both hands. The distributed back/buttock contact is idealised as
 * a single reaction at the shoulder line. The two upward reactions are then
 * determined by equilibrium. Horizontal hand forces and leg drive are unmodelled.
 * Progress is the fraction of vertical bar travel from chest contact to lockout.
 * Grip is hand-centre distance divided by shoulder breadth.
 */
export function buildBenchFrame(
  progress: number,
  loadKg: number,
  heightM: number,
  massKg: number,
  gripRatio: number = BENCH_GRIP.default,
): BenchFrame {
  const t = clamp(progress, 0, 1)
  const grip = clamp(gripRatio, BENCH_GRIP.min, BENCH_GRIP.max)
  const benchHeight = 0.43
  const shoulderY = benchHeight + 0.074 * heightM
  const shoulderHalf = (LENGTH_FRACTION.shoulderWidth * heightM) / 2
  const gripHalf = shoulderHalf * grip
  const length = LENGTH_FRACTION.arm * heightM
  const lockoutY = shoulderY + Math.sqrt(length * length - (gripHalf - shoulderHalf) ** 2)
  const bottomY = benchHeight + 0.143 * heightM
  const remaining = 1 - t
  const bar = at(
    -0.1 * heightM * remaining * (0.75 + 0.25 * Math.sqrt(remaining)),
    lockoutY - (lockoutY - bottomY) * remaining,
  )
  const arms = ([1, -1] as const).map((side) =>
    loadArm(placeArm(side, shoulderHalf, shoulderY, bar, gripHalf, length), massKg, loadKg),
  )
  const hip = at(-LENGTH_FRACTION.torso * heightM, benchHeight + 0.055 * heightM)
  const shoulderMid = at(0, shoulderY)
  const chest = between(hip, shoulderMid, 0.69)
  chest.y += 0.012 * heightM
  const neck = at(0.045 * heightM, benchHeight + 0.064 * heightM)
  const head = at(LENGTH_FRACTION.headCom * heightM, benchHeight + 0.059 * heightM)
  const legs: [BenchLeg, BenchLeg] = [placeLeg(1, hip, heightM), placeLeg(-1, hip, heightM)]
  const l5 = between(hip, shoulderMid, TRUNK_LINK_FRACTION.pelvis)
  const t12 = between(hip, shoulderMid, TRUNK_LINK_FRACTION.pelvis + TRUNK_LINK_FRACTION.lumbar)
  const masses: PointMass[] = [
    ...arms.flatMap((a) => a.bodyMasses),
    ...legs.flatMap((l) => legMasses(l, massKg)),
    { at: between(hip, l5, SEGMENT_COM.pelvis), kg: SEGMENT_MASS.pelvis * massKg },
    { at: between(l5, t12, SEGMENT_COM.lumbar), kg: SEGMENT_MASS.lumbar * massKg },
    { at: between(t12, shoulderMid, SEGMENT_COM.thorax), kg: SEGMENT_MASS.thorax * massKg },
    { at: head, kg: SEGMENT_MASS.headNeck * massKg },
  ]
  const bodyCom = at(0, 0)
  for (const mass of masses) {
    bodyCom.x += (mass.at.x * mass.kg) / massKg
    bodyCom.y += (mass.at.y * mass.kg) / massKg
  }
  const benchSupport = at(0, benchHeight)
  const footSupport = at((legs[0].heel.x + legs[0].toe.x) / 2, 0)
  const barN = -loadKg * GRAVITY
  const bodyN = -massKg * GRAVITY
  const feetN =
    -(barN * (bar.x - benchSupport.x) + bodyN * (bodyCom.x - benchSupport.x)) /
    (footSupport.x - benchSupport.x)
  const benchN = -(barN + bodyN + feetN)
  return {
    bar,
    bodyCom,
    benchSupport,
    footSupport,
    benchHeight,
    arms: [arms[0].arm, arms[1].arm],
    pose: { hip, chest, neck, head, legs },
    forces: { barN, bodyN, benchN, feetN },
  }
}
