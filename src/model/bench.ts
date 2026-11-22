import {
  type Anthropometry,
  anthropometryFromHeight,
  GRAVITY,
  LANDMARK_HEIGHT,
  LENGTH_FRACTION,
  SEGMENT_COM,
  SEGMENT_MASS,
  TRUNK_LINK_FRACTION,
} from './anthropometry'
import { clamp } from './geometry'
import { bendArm } from './armGeometry'

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
export type BenchSegments = Pick<Anthropometry, 'shank' | 'thigh' | 'torso' | 'arm' | 'foot'>

export interface BenchFrame {
  segments: BenchSegments & { height: number }
  bar: BenchPoint
  barRangeX: { min: number; max: number }
  maxBarShiftCm: number
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

/** Symmetric setup offsets relative to the original bench posture. */
export const BENCH_POSE_LIMITS = {
  footSlideCm: { min: -14, max: 12, default: 0 },
  footYawDeg: { min: 0, max: 35, default: 0 },
  elbowTurnDeg: { min: -30, max: 30, default: 0 },
  torsoTiltDeg: { min: -4, max: 4, default: 0 },
  bodySlideCm: { min: -8, max: 8, default: 0 },
  barShiftCm: { min: -8, max: 5, default: 0 },
} as const
export type BenchPoseSettings = Record<keyof typeof BENCH_POSE_LIMITS, number>

export function readBenchPose(value: unknown): BenchPoseSettings {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const pose = {} as BenchPoseSettings
  for (const key of Object.keys(BENCH_POSE_LIMITS) as (keyof BenchPoseSettings)[]) {
    const v = saved[key]
    const limits = BENCH_POSE_LIMITS[key]
    pose[key] =
      typeof v === 'number' && Number.isFinite(v)
        ? clamp(v, limits.min, limits.max)
        : limits.default
  }
  return pose
}
export const DEFAULT_BENCH_POSE = readBenchPose(null)
const radians = (deg: number) => (deg * Math.PI) / 180
const degrees = (rad: number) => (rad * 180) / Math.PI

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
  shoulderX: number,
  shoulderY: number,
  bar: BenchPoint,
  gripHalfWidth: number,
  armLength: number,
  elbowTurnDeg: number,
): ArmPoints {
  const shoulder = at(shoulderX, shoulderY, side * shoulderHalfWidth)
  const grip = at(bar.x, bar.y, side * gripHalfWidth)
  const upper = armLength * 0.52
  const lower = armLength - upper
  const { elbow, elbowPlaneNormal } = bendArm(
    shoulder,
    grip,
    at(-0.42, -1, side * 0.18),
    upper,
    lower,
    -side * radians(elbowTurnDeg),
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

/** Keep both rigid links at their measured lengths while placing the sole flat
 * on the floor. Prefer a nearly vertical shin within the reachable knee heights. */
function placeLeg(
  side: number,
  hipMid: BenchPoint,
  dimensions: BenchFrame['segments'],
  pose: BenchPoseSettings,
): BenchLeg {
  const { height, shank, thigh, foot: footLength } = dimensions
  const hip = at(hipMid.x, hipMid.y, (side * LENGTH_FRACTION.hipWidth * height) / 2)
  const kneeZ = side * 0.115 * height
  const ankleZ = side * 0.125 * height
  const ankleY = LANDMARK_HEIGHT.ankle * height
  const shinReachSq = shank ** 2 - (ankleZ - kneeZ) ** 2
  const thighReachSq = thigh ** 2 - (hip.z - kneeZ) ** 2
  const preferredKneeY = ankleY + Math.sqrt(Math.max(0, shinReachSq - (0.035 * height) ** 2))
  const thighReach = Math.sqrt(thighReachSq)
  const kneeY = clamp(preferredKneeY, hip.y - thighReach, hip.y + thighReach)
  const thighDx = Math.sqrt(Math.max(0, thighReachSq - (hip.y - kneeY) ** 2))
  const shinDx = Math.sqrt(Math.max(0, shinReachSq - (ankleY - kneeY) ** 2))
  // Solve the knee in the sagittal plane after accounting for the lateral
  // separation of each joint. Choose the forward knee of the two IK solutions.
  const neutralAnkleX = hip.x - thighDx + shinDx
  const vertical = ankleY - hip.y
  const maxReachX = Math.sqrt(
    Math.max(0, (thighReach + Math.sqrt(shinReachSq)) ** 2 - vertical ** 2),
  )
  const ankleX = clamp(neutralAnkleX + pose.footSlideCm / 100, hip.x - maxReachX, hip.x - 0.02)
  const ankle = at(ankleX, ankleY, ankleZ)
  const dx = ankleX - hip.x
  const span = Math.hypot(dx, vertical)
  const along = (thighReachSq - shinReachSq + span ** 2) / (2 * span)
  const off = Math.sqrt(Math.max(0, thighReachSq - along ** 2))
  const knee = at(
    hip.x + (along * dx + off * vertical) / span,
    hip.y + (along * vertical - off * dx) / span,
    kneeZ,
  )
  const yaw = radians(pose.footYawDeg)
  const sole = (length: number) =>
    at(ankleX - length * Math.cos(yaw), 0, ankleZ + side * length * Math.sin(yaw))
  return { hip, knee, ankle, heel: sole(-footLength / 4), toe: sole((footLength * 3) / 4) }
}

/** Flexion measured between rigid links, with full extension at zero. */
function jointFlexion(a: BenchPoint, joint: BenchPoint, b: BenchPoint) {
  const first = benchPointDistance(a, joint),
    second = benchPointDistance(joint, b)
  const span = benchPointDistance(a, b)
  return degrees(
    Math.acos(clamp((span ** 2 - first ** 2 - second ** 2) / (2 * first * second), -1, 1)),
  )
}
export const benchKneeFlexion = (leg: BenchLeg) => jointFlexion(leg.hip, leg.knee, leg.ankle)
export const benchElbowFlexion = (arm: BenchArm) => jointFlexion(arm.shoulder, arm.elbow, arm.grip)

/** Select the closest phase with the requested elbow angle. A path with a
 * footward offset can have a shallow maximum just above the chest. */
export function progressAtElbowFlexion(
  target: number,
  current: number,
  angles: number[],
  frameAt: (t: number) => BenchFrame,
) {
  if (target <= 0) return 1
  const count = angles.length - 1
  let bracket = -1
  for (let i = 0; i < count; i++) {
    if ((target - angles[i]) * (target - angles[i + 1]) > 0) continue
    if (
      bracket < 0 ||
      Math.abs((i + 0.5) / count - current) < Math.abs((bracket + 0.5) / count - current)
    )
      bracket = i
  }
  if (bracket < 0) {
    const nearest = angles.reduce(
      (best, angle, i) => (Math.abs(angle - target) < Math.abs(angles[best] - target) ? i : best),
      0,
    )
    return nearest / count
  }
  let lo = bracket / count,
    hi = (bracket + 1) / count
  const increasing = angles[bracket + 1] > angles[bracket]
  for (let i = 0; i < 15; i++) {
    const mid = (lo + hi) / 2
    if (benchElbowFlexion(frameAt(mid).arms[0]) < target === increasing) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Change the foot position needed to reach a knee angle with the sole planted. */
export function footSlideAtKneeAngle(neutral: BenchLeg, flexion: number) {
  const thigh = benchPointDistance(neutral.hip, neutral.knee),
    shin = benchPointDistance(neutral.knee, neutral.ankle)
  const dz = neutral.hip.z - neutral.ankle.z,
    dy = neutral.hip.y - neutral.ankle.y
  const reachSq = thigh ** 2 + shin ** 2 + 2 * thigh * shin * Math.cos(radians(flexion))
  return (
    100 * (neutral.hip.x - neutral.ankle.x - Math.sqrt(Math.max(0, reachSq - dz ** 2 - dy ** 2)))
  )
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
  segments: BenchSegments = anthropometryFromHeight(heightM, massKg),
  pose: BenchPoseSettings = DEFAULT_BENCH_POSE,
): BenchFrame {
  const dimensions = {
    height: heightM,
    shank: segments.shank,
    thigh: segments.thigh,
    torso: segments.torso,
    arm: segments.arm,
    foot: segments.foot,
  }
  const t = clamp(progress, 0, 1)
  const grip = clamp(gripRatio, BENCH_GRIP.min, BENCH_GRIP.max)
  const benchHeight = 0.43
  const shoulderY = benchHeight + 0.074 * heightM
  const shoulderHalf = (LENGTH_FRACTION.shoulderWidth * heightM) / 2
  const gripHalf = shoulderHalf * grip
  const length = dimensions.arm
  const shoulderX = pose.bodySlideCm / 100
  const neutralTilt = Math.asin((0.019 * heightM) / dimensions.torso)
  const trunkAngle = neutralTilt + radians(pose.torsoTiltDeg)
  const hip = at(
    shoulderX - dimensions.torso * Math.cos(trunkAngle),
    shoulderY - dimensions.torso * Math.sin(trunkAngle),
  )
  const shoulderMid = at(shoulderX, shoulderY)
  const chest = between(hip, shoulderMid, 0.69)
  chest.y += 0.012 * heightM
  const neck = at(shoulderX + 0.045 * heightM, benchHeight + 0.064 * heightM)
  const head = at(shoulderX + LENGTH_FRACTION.headCom * heightM, benchHeight + 0.059 * heightM)
  const legs: [BenchLeg, BenchLeg] = [
    placeLeg(1, hip, dimensions, pose),
    placeLeg(-1, hip, dimensions, pose),
  ]
  const l5 = between(hip, shoulderMid, TRUNK_LINK_FRACTION.pelvis)
  const t12 = between(hip, shoulderMid, TRUNK_LINK_FRACTION.pelvis + TRUNK_LINK_FRACTION.lumbar)
  const stationaryMasses: PointMass[] = [
    ...legs.flatMap((l) => legMasses(l, massKg)),
    { at: between(hip, l5, SEGMENT_COM.pelvis), kg: SEGMENT_MASS.pelvis * massKg },
    { at: between(l5, t12, SEGMENT_COM.lumbar), kg: SEGMENT_MASS.lumbar * massKg },
    { at: between(t12, shoulderMid, SEGMENT_COM.thorax), kg: SEGMENT_MASS.thorax * massKg },
    { at: head, kg: SEGMENT_MASS.headNeck * massKg },
  ]
  // Even if the entire arm mass lay a full arm length headward, the
  // resultant of body and bar must stay inside the foot–bench support span.
  const stationaryLever = stationaryMasses.reduce((sum, m) => sum + m.kg * (shoulderX - m.at.x), 0)
  const maxBarShiftCm =
    loadKg > 0
      ? clamp(
          Math.floor((1000 * (stationaryLever - massKg * SEGMENT_MASS.arms * length)) / loadKg) /
            10,
          0,
          BENCH_POSE_LIMITS.barShiftCm.max,
        )
      : BENCH_POSE_LIMITS.barShiftCm.max
  const shift = Math.min(pose.barShiftCm, maxBarShiftCm) / 100
  const sagittalReachSq = length ** 2 - (gripHalf - shoulderHalf) ** 2
  const lockoutY = shoulderY + Math.sqrt(sagittalReachSq - shift ** 2)
  // Keep the contact height above the tilted chest. At the reference tilt
  // the contact is at 0.143 H above the pad; the fore/aft offset then follows
  // the local slope of the torso.
  const neutralChestY = benchHeight + (0.055 * 0.31 + 0.074 * 0.69 + 0.012) * heightM
  const bottomY =
    benchHeight + 0.143 * heightM + (chest.y - neutralChestY) + shift * Math.tan(trunkAngle)
  // The chest position and the chosen hand placement must be within arm reach.
  const chestOffset = Math.min(
    (0.1 / LENGTH_FRACTION.torso) * dimensions.torso,
    Math.sqrt(Math.max(0, sagittalReachSq - (bottomY - shoulderY) ** 2)) + shift,
  )
  const remaining = 1 - t
  const bar = at(
    shoulderX + shift - chestOffset * remaining * (0.75 + 0.25 * Math.sqrt(remaining)),
    lockoutY - (lockoutY - bottomY) * remaining,
  )
  const arms = ([1, -1] as const).map((side) =>
    loadArm(
      placeArm(side, shoulderHalf, shoulderX, shoulderY, bar, gripHalf, length, pose.elbowTurnDeg),
      massKg,
      loadKg,
    ),
  )
  const masses = [...stationaryMasses, ...arms.flatMap((a) => a.bodyMasses)]
  const bodyCom = at(0, 0)
  for (const mass of masses) {
    bodyCom.x += (mass.at.x * mass.kg) / massKg
    bodyCom.y += (mass.at.y * mass.kg) / massKg
  }
  const benchSupport = at(shoulderX, benchHeight)
  const footSupport = at((legs[0].heel.x + legs[0].toe.x) / 2, 0)
  const barN = -loadKg * GRAVITY
  const bodyN = -massKg * GRAVITY
  const feetN =
    -(barN * (bar.x - benchSupport.x) + bodyN * (bodyCom.x - benchSupport.x)) /
    (footSupport.x - benchSupport.x)
  const benchN = -(barN + bodyN + feetN)
  return {
    segments: dimensions,
    bar,
    barRangeX: { min: shoulderX + shift - chestOffset, max: shoulderX + shift },
    maxBarShiftCm,
    bodyCom,
    benchSupport,
    footSupport,
    benchHeight,
    arms: [arms[0].arm, arms[1].arm],
    pose: { hip, chest, neck, head, legs },
    forces: { barN, bodyN, benchN, feetN },
  }
}
