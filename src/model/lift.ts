import { bendArm } from './armGeometry'
import { type Anthropometry, GRAVITY, ankleHeight } from './anthropometry'
import {
  type Vec2,
  add,
  clamp,
  deg,
  findRoot,
  fromPolar,
  lerp,
  rad,
  resolveJoint,
  scale,
  sub,
  vec,
} from './geometry'
import { type Kinetics, computeKinetics } from './kinetics'
import {
  type JointAngles,
  type MassPoint,
  type Posture,
  bodyMassPoints,
  buildTrunkShape,
  elbowFor,
  footPoints,
  jointAngles,
  placeTrunk,
  squatElbow,
  SQUAT_ELBOW_TURN,
} from './posture'

import { getStance, type DeadliftStyle, type Stance } from './stance'

export type ExerciseId = 'deadlift' | 'squat'

export interface Coordination {
  /** Distance between the centres of the two feet, in metres. */
  stanceWidth?: number
  /** Manual outward foot angle, in degrees. Omission follows the stance preset. */
  toeOutDeg?: number
  /** Rotation of the squat elbow around the shoulder–grip axis from neutral, in degrees. */
  squatElbowAngle?: number
  deadliftStyle?: DeadliftStyle
  /**
   * 0 = hip dominant with vertical shins, 1 = knees travel forward.
   * Anchored to Edington et al. (2018): 8.6 deg of tibia angle for the close
   * bar setup and 19.5 deg for the far bar setup.
   */
  kneeTravel: number
  /** Spine flexion relative to neutral, degrees. */
  spineFlexion: number
  /**
   * Deadlift only: how far the arm is held off vertical, degrees. Positive
   * puts the shoulder in front of the bar.
   *
   * The hanging bar pulls down on the hands. Moving the shoulder horizontally
   * away from this line of force increases the bar's moment about the shoulder.
   */
  armLean: number
  /** Squat only: distance from the acromion down the back to the bar, metres. */
  barOffset: number
}

export type BalanceMode = 'cop' | 'bar'

export interface Task {
  /** 0 = bar on the floor or bottom of the squat, 1 = lockout or standing. */
  progress: number
  /** Total bar load in kilograms. */
  load: number
  /** Target centre of pressure, metres relative to midfoot. */
  cop: number
  /** Plate radius, metres. Standard 450 mm plates are 0.225 m. */
  plateRadius: number
  /** Squat only: depth of the bottom position, 0 = above parallel, 1 = deep. */
  depth: number
  /**
   * `cop` solves for the bar position that balances the system over the
   * requested centre of pressure. `bar` pins the bar and reports where the
   * pressure ends up, which is how Edington et al. ran their protocol.
   */
  balance: BalanceMode
  /** Deadlift only, used when `balance` is `bar`: bar position from midfoot. */
  barPosition: number
}

export interface Frame {
  stance: Stance
  posture: Posture
  angles: JointAngles
  kinetics: Kinetics
  massPoints: MassPoint[]
  barHeight: number
  tibiaAngle: number
  /** Where the pressure has to act under the foot for this posture to balance. */
  centreOfPressure: number
  /** Base of support, metres from midfoot. */
  support: { heel: number; toe: number }
  /** Closest the bar can get to the ankle at this height before hitting the shin. */
  barLimit: number
  /** True when the shin is what is holding the bar out, not the requested setup. */
  barBlocked: boolean
  /**
   * The pose exists: the kinematic chain closes and the balance solve found a
   * root. Anything else is a drawing the model had to fake, so the controls
   * use this to refuse the value rather than render it.
   */
  feasible: boolean
  ok: boolean
  warnings: string[]
}

export const DEADLIFT_TIBIA = { hipDominant: 8.6, kneeForward: 19.5 } as const
export const SQUAT_TIBIA = { hipDominant: 22, kneeForward: 42 } as const

export const DEFAULT_COORDINATION: Record<ExerciseId, Coordination> = {
  deadlift: { kneeTravel: 0, spineFlexion: 10, armLean: 0, barOffset: 0 },
  squat: { kneeTravel: 0.25, spineFlexion: 8, armLean: 0, barOffset: 0.05 },
}

export const DEFAULT_TASK: Task = {
  progress: 0,
  load: 100,
  cop: 0,
  plateRadius: 0.225,
  depth: 0.5,
  balance: 'cop',
  barPosition: 0,
}

/**
 * How far a chain may fall short of spanning a gap and still count as closed.
 *
 * Near full extension the joint angle is brutally sensitive to length: with
 * this athlete, holding back one per cent of the reach bends the hip fifteen
 * degrees. So the top of the lift cannot be kept feasible by shortening the
 * reach. Instead the links are allowed to come up a few millimetres short and
 * be drawn straight, which is what a locked-out chain looks like anyway, and
 * is far below anything visible at this scale. The lockout needs about three
 * millimetres of this; the rest is margin.
 */
const CHAIN_TOLERANCE = 0.006

/**
 * Bar height at lockout: the grip hangs an arm's length below the acromion,
 * along whatever angle the arm is held at.
 *
 * Derived from the chain rather than from the standing table, because the
 * table assumes an unflexed spine stacked straight over the ankle. The real
 * pose has a shortened trunk chord and a bar that hangs in front of the ankle,
 * and asking the links to span more than they have is what makes the chain
 * fail to close at the very top.
 */
export function deadliftLockoutHeight(
  a: Anthropometry,
  spineFlexion: number,
  armLean: number,
): number {
  const { ankle } = footPoints(a)
  const standing = rad(standingTibiaAngle(a))
  const knee = {
    x: ankle.x + a.shank * Math.sin(standing),
    y: ankleHeight(a) + a.shank * Math.cos(standing),
  }
  const reach = a.thigh + buildTrunkShape(a, spineFlexion).chord
  // The standing shin puts the knee over midfoot, and the bar hangs where the
  // standing body balances, which is also over midfoot. A leaning arm carries
  // the shoulder forward of both, so the femur and trunk have to span that
  // offset as well as the height.
  const lean = rad(armLean)
  const shoulderX = a.arm * Math.sin(lean)
  const span = shoulderX - knee.x
  return knee.y + Math.sqrt(Math.max(reach * reach - span * span, 0)) - a.arm * Math.cos(lean)
}

/**
 * Shin inclination once standing.
 *
 * The ankle joint sits a quarter of a foot length behind midfoot, so a shin
 * held exactly vertical would stack the whole body behind the point it has to
 * balance over. Something has to give, and in the model it was the trunk,
 * which ended the lift leaning forward several degrees. Leaning the shin
 * instead puts the knee over midfoot and lets everything above it stand up
 * straight, which is what standing actually looks like: quiet standing carries
 * a few degrees of dorsiflexion for exactly this reason.
 */
export function standingTibiaAngle(a: Anthropometry): number {
  const { ankle } = footPoints(a)
  return deg(Math.asin(clamp(-ankle.x / a.shank, -1, 1)))
}

/** The shin comes back to standing at lockout, not to vertical. */
export function deadliftTibiaAngle(
  a: Anthropometry,
  progress: number,
  kneeTravel: number,
): number {
  const start = lerp(DEADLIFT_TIBIA.hipDominant, DEADLIFT_TIBIA.kneeForward, kneeTravel)
  const standing = standingTibiaAngle(a)
  return standing + (start - standing) * Math.pow(1 - progress, 1.7)
}

/**
 * The knees reach their forward position early in the descent and hold it
 * through most of the ascent, only returning under the hips near lockout.
 * A linear profile would drag the knees back too soon and make the model
 * lean the torso forward on the way up, which is not what lifters do.
 */
export function squatTibiaAngle(
  a: Anthropometry,
  progress: number,
  kneeTravel: number,
): number {
  const max = lerp(SQUAT_TIBIA.hipDominant, SQUAT_TIBIA.kneeForward, kneeTravel)
  const standing = standingTibiaAngle(a)
  return standing + (max - standing) * (1 - Math.pow(progress, 2.4))
}

/**
 * Depth is defined relative to the knee joint in the bottom position, so 0.5
 * is parallel regardless of how far the knees travel. The reference knee
 * height therefore uses the tibia angle reached at the bottom.
 */
export function squatBottomHipHeight(
  a: Anthropometry,
  depth: number,
  kneeTravel: number,
): number {
  const bottomTibia = squatTibiaAngle(a, 0, kneeTravel)
  const kneeHeight = ankleHeight(a) + a.shank * Math.cos(rad(bottomTibia))
  return kneeHeight + lerp(0.06, -0.1, depth) * (a.height / 1.75)
}

function assemble(
  a: Anthropometry,
  parts: {
    ankle: Vec2
    heel: Vec2
    toe: Vec2
    knee: Vec2
    hip: Vec2
    trunk: ReturnType<typeof placeTrunk>
    hand: Vec2
    elbow: Vec2
    bar: Vec2
  },
  upperArmFraction?: number,
): { posture: Posture; massPoints: MassPoint[] } {
  const posture: Posture = {
    heel: parts.heel,
    toe: parts.toe,
    ankle: parts.ankle,
    knee: parts.knee,
    hip: parts.hip,
    lumbosacral: parts.trunk.lumbosacral,
    lumbarApex: parts.trunk.lumbarApex,
    thoracolumbar: parts.trunk.thoracolumbar,
    thoracicApex: parts.trunk.thoracicApex,
    shoulder: parts.trunk.shoulder,
    elbow: parts.elbow,
    hand: parts.hand,
    headCom: parts.trunk.headCom,
    headTop: parts.trunk.headTop,
    bar: parts.bar,
  }
  return { posture, massPoints: bodyMassPoints(posture, a, upperArmFraction) }
}

/** Half a 28 mm bar plus the soft tissue over the tibia. */
const BAR_SHIN_CLEARANCE = 0.016

/**
 * Below the knee, contact follows the shin. Above it, release that horizontal
 * constraint along a parabola tangent to the shin, using the existing bar
 * clearance as its length scale. The free bar path takes over as soon as it
 * lies in front of this envelope. Dropping the constraint in a single frame
 * used to send the bar several centimetres backwards at the knee.
 */
function shinFrontAt(ankle: Vec2, knee: Vec2, height: number): number {
  const span = knee.y - ankle.y
  const slope = span > 1e-6 ? (knee.x - ankle.x) / span : 0
  const rise = Math.max(0, height - knee.y)
  return ankle.x + slope * Math.max(0, height - ankle.y) - rise * rise / (4 * BAR_SHIN_CLEARANCE)
}

/** The parts of a deadlift pose that are fixed before the bar is placed. */
function projectedBody(a: Anthropometry, stance: Stance): Anthropometry {
  return {
    ...a,
    foot: stance.sagittalFoot,
    shank: stance.sagittalShank,
    thigh: stance.sagittalThigh,
    arm: stance.sagittalArm,
  }
}

function deadliftFrame(body: Anthropometry, task: Task, coord: Coordination) {
  const stance = getStance('deadlift', body, coord, task.progress)
  const a = projectedBody(body, stance)
  const standing = projectedBody(body, getStance('deadlift', body, coord, 1))
  const { heel, toe, ankle } = footPoints(a)
  const lockout = deadliftLockoutHeight(standing, coord.spineFlexion, coord.armLean)
  const barHeight = lerp(task.plateRadius, lockout, task.progress)
  const tibiaAngle = deadliftTibiaAngle(a, task.progress, coord.kneeTravel)
  const knee = add(ankle, fromPolar(rad(90 - tibiaAngle), a.shank))
  return {
    stance,
    a,
    heel,
    toe,
    ankle,
    knee,
    lockout,
    barHeight,
    tibiaAngle,
    barLimit: shinFrontAt(ankle, knee, barHeight) + BAR_SHIN_CLEARANCE,
  }
}

/**
 * How far back the bar can sit at the current height. The bar is a rigid body
 * and so is the leg, so instead of reporting an impossible pose the solver
 * refuses to draw one and the shin simply holds the bar out.
 */
export const deadliftBarLimit = (
  a: Anthropometry,
  task: Task,
  coord: Coordination,
): number => deadliftFrame(a, task, coord).barLimit

export function solveDeadlift(body: Anthropometry, task: Task, coord: Coordination): Frame {
  const { a, stance, heel, toe, ankle, knee, barHeight, tibiaAngle, barLimit } = deadliftFrame(body, task, coord)
  const trunkShape = buildTrunkShape(a, coord.spineFlexion)

  let reachable = true

  const lean = rad(coord.armLean)

  const build = (barX: number) => {
    // At zero lean the arm is a two-force member and the shoulder sits directly
    // above the bar, which is what a heavy pull does. Leaning it swings the
    // shoulder forward along the arm's own length; the hand stays on the bar,
    // so the arm keeps its length and the trunk has to find a new pose.
    const shoulderTarget = vec(
      barX + a.arm * Math.sin(lean),
      barHeight + a.arm * Math.cos(lean),
    )
    const solved = resolveJoint(knee, a.thigh, shoulderTarget, trunkShape.chord, 'posterior')
    // Only over-extension is rounded off. A folded trunk has no pose at any
    // tolerance, and accepting one leaves the shoulder off the bar.
    reachable = solved.reachable || (!solved.folded && solved.shortfall <= CHAIN_TOLERANCE)
    const hip = solved.point
    const chordAngle = Math.atan2(shoulderTarget.y - hip.y, shoulderTarget.x - hip.x)
    const trunk = placeTrunk(trunkShape, hip, chordAngle)
    const hand = vec(barX, barHeight)
    return assemble(a, {
      ankle,
      heel,
      toe,
      knee,
      hip,
      trunk,
      hand,
      elbow: elbowFor(trunk.shoulder, hand),
      bar: vec(barX, barHeight),
    })
  }

  const comX = (barX: number) => {
    const { posture, massPoints } = build(barX)
    if (!Number.isFinite(posture.hip.x)) return NaN
    const total = a.mass + task.load
    let sx = task.load * posture.bar.x
    for (const point of massPoints) sx += point.mass * point.position.x
    return sx / total
  }

  let barX = task.barPosition
  let converged = true
  if (task.balance === 'cop') {
    const search = findRoot((x) => comX(x) - task.cop, -a.foot * 0.7, a.foot / 2 + 0.28)
    barX = search.value
    converged = search.converged
  }

  // Reported as contact rather than as "you asked for the impossible": the bar
  // resting on the shin is the same state whether the setup asked for it or
  // the limit produced it.
  const barBlocked = barX <= barLimit + 1e-6
  if (barBlocked) barX = barLimit

  const { posture, massPoints } = build(barX)
  const kinetics = computeKinetics(posture, massPoints, task.load, a.mass, {
    armsCarryLoad: true,
  })
  const angles = jointAngles(posture)
  const support = { heel: posture.heel.x, toe: posture.toe.x }

  const warnings: string[] = []
  if (!converged) warnings.push('No se encontró una posición de equilibrio exacta.')
  if (!reachable) warnings.push('Las proporciones no cierran la cadena en esta posición.')
  if (tibiaAngle > a.maxDorsiflexion) {
    warnings.push('La tibia supera la dorsiflexión disponible.')
  }
  if (kinetics.com.x < support.heel || kinetics.com.x > support.toe) {
    warnings.push('El centro de masa cae fuera de la base de sustentación.')
  }

  return {
    stance,
    posture,
    angles,
    kinetics,
    massPoints,
    barHeight,
    tibiaAngle,
    centreOfPressure: kinetics.com.x,
    support,
    barLimit,
    barBlocked,
    feasible: converged && reachable,
    ok: converged && reachable && warnings.length === 0,
    warnings,
  }
}

export function solveSquat(body: Anthropometry, task: Task, coord: Coordination): Frame {
  const stance = getStance('squat', body, coord, task.progress)
  const a = projectedBody(body, stance)
  const bottom = projectedBody(body, getStance('squat', body, coord, 0))
  const standing = projectedBody(body, getStance('squat', body, coord, 1))
  const { heel, toe, ankle } = footPoints(a)
  const tibiaAngle = squatTibiaAngle(a, task.progress, coord.kneeTravel)
  const knee = add(ankle, fromPolar(rad(90 - tibiaAngle), a.shank))
  const trunkShape = buildTrunkShape(a, coord.spineFlexion)

  const bottomHip = squatBottomHipHeight(bottom, task.depth, coord.kneeTravel)
  // Measured up from the standing knee rather than from the landmark table:
  // with the shin leaning as it does when standing, the table height would ask
  // the femur to span more than its own length.
  const standingHip =
    ankleHeight(standing) + standing.shank * Math.cos(rad(standingTibiaAngle(standing))) + standing.thigh
  const hipHeight = lerp(bottomHip, standingHip, task.progress)

  const dy = hipHeight - knee.y
  // Same tolerance as the deadlift: standing tall puts the femur exactly at
  // its own length, which rounding alone can push over the edge.
  const reachable = Math.abs(dy) <= a.thigh + CHAIN_TOLERANCE
  const dx = Math.sqrt(Math.max(a.thigh * a.thigh - dy * dy, 0))
  const hip = vec(knee.x - dx, hipHeight)

  const build = (chordAngle: number) => {
    const trunk = placeTrunk(trunkShape, hip, chordAngle)
    const dir = sub(trunk.shoulder, hip)
    const len = Math.hypot(dir.x, dir.y) || 1
    const along = { x: dir.x / len, y: dir.y / len }
    // Posterior normal: the bar rests on the back, behind the trunk axis.
    const posterior = { x: -along.y, y: along.x }
    const bar = add(
      sub(trunk.shoulder, scale(along, coord.barOffset)),
      scale(posterior, a.torso * 0.09),
    )
    const neutral = squatElbow(trunk.shoulder, hip, a)
    const upperArmFraction = 0.52
    const upperArm = a.arm * upperArmFraction
    const { elbow } = bendArm(
      { ...trunk.shoulder, z: stance.shoulderHalf },
      { ...bar, z: stance.gripHalf },
      {
        x: neutral.x - trunk.shoulder.x,
        y: neutral.y - trunk.shoulder.y,
        z: stance.elbowHalf - stance.shoulderHalf,
      },
      upperArm,
      a.arm - upperArm,
      rad(clamp(coord.squatElbowAngle ?? 0, SQUAT_ELBOW_TURN.min, SQUAT_ELBOW_TURN.max)),
    )
    return {
      ...assemble(a, { ankle, heel, toe, knee, hip, trunk, hand: bar, elbow, bar }, upperArmFraction),
      elbowHalf: elbow.z,
    }
  }

  const imbalance = (chordAngle: number) => {
    const { posture, massPoints } = build(chordAngle)
    const total = a.mass + task.load
    let sx = task.load * posture.bar.x
    for (const point of massPoints) sx += point.mass * point.position.x
    return sx / total - task.cop
  }

  const search = findRoot(imbalance, rad(12), rad(100))
  const chordAngle = clamp(search.value, rad(8), rad(104))
  const { posture, massPoints, elbowHalf } = build(chordAngle)
  // The squat bar rides on the back, so the arms hold nothing.
  const kinetics = computeKinetics(posture, massPoints, task.load, a.mass, {
    armsCarryLoad: false,
  })
  const angles = jointAngles(posture)
  const support = { heel: posture.heel.x, toe: posture.toe.x }

  const warnings: string[] = []
  if (!search.converged) {
    warnings.push('No hay ángulo de tronco que equilibre el sistema en esta posición.')
  }
  if (!reachable) warnings.push('La profundidad pedida excede el largo del fémur.')
  if (tibiaAngle > a.maxDorsiflexion) {
    warnings.push('La tibia supera la dorsiflexión disponible.')
  }

  return {
    stance: { ...stance, elbowHalf },
    posture,
    angles,
    kinetics,
    massPoints,
    barHeight: posture.bar.y,
    tibiaAngle,
    centreOfPressure: kinetics.com.x,
    support,
    // The squat bar rides on the back, so nothing can come between the two.
    barLimit: -Infinity,
    barBlocked: false,
    feasible: search.converged && reachable,
    ok: search.converged && reachable && warnings.length === 0,
    warnings,
  }
}

export function solveFrame(
  exercise: ExerciseId,
  a: Anthropometry,
  task: Task,
  coord: Coordination,
): Frame {
  return exercise === 'deadlift' ? solveDeadlift(a, task, coord) : solveSquat(a, task, coord)
}

export interface SeriesPoint {
  progress: number
  barHeight: number
  hip: number
  knee: number
  l5s1: number
  ankle: number
  kneeDominance: number
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface Series {
  points: SeriesPoint[]
  postures: Posture[]
  peak: { hip: number; knee: number; l5s1: number; ankle: number }
  /**
   * Mechanical work of the whole lift, in joules: the potential energy the
   * body-plus-bar system gains from the bottom to the top. Gravity is
   * conservative, so this is exactly the work done against it and needs no
   * assumption about the path taken between the two.
   */
  work: number
  /** Progress at which the hip moment peaks, a proxy for the sticking point. */
  peakHipProgress: number
  /**
   * Extent swept by the figure across the whole lift, so the drawing can be
   * framed once instead of rescaling on every frame.
   */
  bounds: Bounds
}

function growBounds(bounds: Bounds, frame: Frame, plateRadius: number, exercise: ExerciseId) {
  const { posture } = frame
  const points: Vec2[] = [
    posture.heel,
    posture.toe,
    posture.knee,
    posture.hip,
    posture.shoulder,
    posture.hand,
    posture.headTop,
    posture.bar,
  ]
  if (exercise === 'deadlift') {
    // Only part of the plate is counted: it is a 45 cm circle that would
    // dominate the framing, and letting its far edge run off the stage reads
    // fine because it is drawn as a faint outline.
    points.push(
      vec(posture.bar.x - plateRadius * 0.6, posture.bar.y),
      vec(posture.bar.x + plateRadius * 0.6, posture.bar.y + plateRadius * 0.5),
    )
  }
  for (const p of points) {
    bounds.minX = Math.min(bounds.minX, p.x)
    bounds.maxX = Math.max(bounds.maxX, p.x)
    bounds.minY = Math.min(bounds.minY, p.y)
    bounds.maxY = Math.max(bounds.maxY, p.y)
  }
}

export function frameBounds(
  frame: Frame,
  plateRadius: number,
  exercise: ExerciseId,
): Bounds {
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: 0, maxY: -Infinity }
  growBounds(bounds, frame, plateRadius, exercise)
  return bounds
}

export function simulateSeries(
  exercise: ExerciseId,
  a: Anthropometry,
  task: Task,
  coord: Coordination,
  samples = 41,
  range = { min: 0, max: 1 },
): Series {
  const points: SeriesPoint[] = []
  const postures: Posture[] = []
  const peak = { hip: 0, knee: 0, l5s1: 0, ankle: 0 }
  let peakHipProgress = 0
  const systemWeight = (a.mass + task.load) * GRAVITY
  let work = 0
  let lastCom: number | null = null
  const bounds: Bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: 0,
    maxY: -Infinity,
  }

  const count = range.max > range.min ? Math.max(2, Math.round(samples)) : 1
  for (let i = 0; i < count; i++) {
    const progress = count === 1 ? range.min : lerp(range.min, range.max, i / (count - 1))
    const frame = solveFrame(exercise, a, { ...task, progress }, coord)
    postures.push(frame.posture)
    growBounds(bounds, frame, task.plateRadius, exercise)

    // Only the rises count. Summing every step this way rather than taking the
    // difference between the ends keeps it right even if the centre of mass
    // dips somewhere along the way.
    const com = frame.kinetics.com.y
    if (lastCom !== null && com > lastCom) work += systemWeight * (com - lastCom)
    lastCom = com

    const point: SeriesPoint = {
      progress,
      barHeight: frame.barHeight,
      hip: frame.kinetics.moment.hip,
      knee: frame.kinetics.moment.knee,
      l5s1: frame.kinetics.moment.l5s1,
      ankle: frame.kinetics.moment.ankle,
      kneeDominance: frame.kinetics.kneeDominance,
    }
    points.push(point)
    if (Math.abs(point.hip) > peak.hip) {
      peak.hip = Math.abs(point.hip)
      peakHipProgress = progress
    }
    peak.knee = Math.max(peak.knee, Math.abs(point.knee))
    peak.l5s1 = Math.max(peak.l5s1, Math.abs(point.l5s1))
    peak.ankle = Math.max(peak.ankle, Math.abs(point.ankle))
  }

  return { points, postures, peak, peakHipProgress, bounds, work }
}
