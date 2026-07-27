import {
  type Anthropometry,
  LUMBAR_FLEXION_LIMIT,
  LUMBAR_SHARE,
  SEGMENT_COM,
  SEGMENT_MASS,
  TRUNK_LINK_FRACTION,
  ankleHeight,
  headComLength,
  headTopLength,
} from './anthropometry'
import {
  type Vec2,
  add,
  angleBetween,
  angleFromVertical,
  dist,
  fromPolar,
  lerpVec,
  norm,
  rad,
  scale,
  segmentAngle,
  sub,
  vec,
} from './geometry'

export interface TrunkShape {
  /** Hip -> acromion straight-line distance for this amount of spine flexion. */
  chord: number
  /** Angle of the chord relative to the sacral tangent, radians. */
  chordOffset: number
  /** Local-frame points with the sacral tangent along +x, hip at the origin. */
  local: {
    hip: Vec2
    lumbosacral: Vec2
    /** Mid-lumbar, around L3: the apex of the lumbar curve. */
    lumbarApex: Vec2
    thoracolumbar: Vec2
    /** Mid-thoracic, around T7: the apex of the thoracic curve. */
    thoracicApex: Vec2
    shoulder: Vec2
    headCom: Vec2
    headTop: Vec2
  }
}

/**
 * How the slider's degrees are shared between the lumbar and thoracic regions.
 *
 * The first degrees are lumbar-dominant, in Aasa's 65/35 proportion, because
 * what gives way first is the lordosis. Once the lumbar has spent its
 * excursion the remainder goes to the thorax: past that point the rounding a
 * lifter sees is upper back opening up, not a lumbar that keeps folding.
 */
function flexionSplit(spineFlexionDeg: number): { lumbar: number; thoracic: number } {
  const total = Math.max(spineFlexionDeg, 0)
  const lumbar =
    LUMBAR_FLEXION_LIMIT * (1 - Math.exp((-LUMBAR_SHARE * total) / LUMBAR_FLEXION_LIMIT))
  return { lumbar, thoracic: total - lumbar }
}

/**
 * Where each landmark falls along the spine, as a fraction of the whole
 * trochanter-to-acromion arc length. The apices sit in the middle of their
 * region because that is where a lordosis and a kyphosis have their extreme
 * point, not at either end joint.
 */
const STATION = {
  hip: 0,
  lumbosacral: TRUNK_LINK_FRACTION.pelvis,
  lumbarApex: TRUNK_LINK_FRACTION.pelvis + TRUNK_LINK_FRACTION.lumbar / 2,
  thoracolumbar: TRUNK_LINK_FRACTION.pelvis + TRUNK_LINK_FRACTION.lumbar,
  thoracicApex:
    TRUNK_LINK_FRACTION.pelvis + TRUNK_LINK_FRACTION.lumbar + TRUNK_LINK_FRACTION.thorax / 2,
  shoulder: 1,
} as const

/**
 * A region's share of the flexion spread over its length as a raised cosine:
 * zero at both ends, peak at the apex, and a total turn of exactly one degree
 * per degree handed to it. Vanishing at the ends is what keeps the drawn back
 * free of creases, because both the tangent and the curvature itself stay
 * continuous where one region hands over to the next.
 */
function raisedCosine(s: number, from: number, to: number): number {
  if (s <= from || s >= to) return 0
  const span = to - from
  return (1 - Math.cos((2 * Math.PI * (s - from)) / span)) / span
}

/** Degrees of flexion per unit arc length at station `s`. */
function curvature(s: number, split: { lumbar: number; thoracic: number }): number {
  return (
    split.lumbar * raisedCosine(s, STATION.lumbosacral, STATION.thoracolumbar) +
    split.thoracic * raisedCosine(s, STATION.thoracolumbar, STATION.shoulder)
  )
}

/**
 * Stations the curve is integrated over: a fine even grid with the landmarks
 * inserted, so every landmark lands on a step boundary and is read off the
 * curve exactly instead of being interpolated between neighbours.
 */
const STATIONS = [
  ...new Set<number>([
    ...Object.values(STATION),
    ...Array.from({ length: 97 }, (_, i) => i / 96),
  ]),
].sort((x, y) => x - y)

const STATION_AT = {
  hip: STATIONS.indexOf(STATION.hip),
  lumbosacral: STATIONS.indexOf(STATION.lumbosacral),
  lumbarApex: STATIONS.indexOf(STATION.lumbarApex),
  thoracolumbar: STATIONS.indexOf(STATION.thoracolumbar),
  thoracicApex: STATIONS.indexOf(STATION.thoracicApex),
  shoulder: STATIONS.indexOf(STATION.shoulder),
} as const

/**
 * Walks the spine from the sacrum to the acromion, turning the tangent by the
 * local curvature as it goes. Midpoint rule, on a unit-length curve.
 */
function integrateSpine(split: { lumbar: number; thoracic: number }) {
  const points: Vec2[] = [vec(0, 0)]
  let tangent = 0
  for (let i = 1; i < STATIONS.length; i++) {
    const ds = STATIONS[i] - STATIONS[i - 1]
    const turn = rad(curvature((STATIONS[i] + STATIONS[i - 1]) / 2, split)) * ds
    // Flexion bows the back forward, which is the -x side of the local frame.
    points.push(add(points[i - 1], fromPolar(tangent - turn / 2, ds)))
    tangent -= turn
  }
  return { points, tangent }
}

/**
 * The spine is a curve of fixed arc length, described the way the sagittal
 * literature describes it: by how its curvature is distributed along its
 * length, not by rigid links meeting at hinges. Curvature integrates into the
 * tangent and the tangent into the shape, so the flexion the slider asks for
 * is exactly the total turn from sacrum to acromion.
 *
 * At 0 the curvature is zero everywhere and the back comes out dead straight,
 * which is what neutral is supposed to read as: the lordosis and the kyphosis
 * of a real neutral spine sit within a couple of centimetres of the
 * hip-to-shoulder chord and cancel along it. From there every degree bows the
 * whole back a little more, lumbar first in Aasa's proportion and thoracic
 * once the lordosis is spent, without ever creasing at a joint.
 *
 * Bowing a curve of fixed length shortens the straight line across it, so the
 * hip-to-shoulder chord falls out shorter on its own. That is the geometric
 * reason a rounded back reduces the hip moment arm; nothing here is a fudge
 * factor. At 0 the chord equals the arc, which is the `torso` the
 * anthropometric table measures.
 */
export function buildTrunkShape(a: Anthropometry, spineFlexionDeg: number): TrunkShape {
  const split = flexionSplit(spineFlexionDeg)
  const { points, tangent } = integrateSpine(split)
  const at = (key: keyof typeof STATION_AT): Vec2 => scale(points[STATION_AT[key]], a.torso)

  const shoulder = at('shoulder')
  // The lifter keeps looking forward, so the neck extends back against part of
  // the flexion the thorax carried instead of following it.
  const dirNeck = tangent + rad(split.lumbar + split.thoracic) * 0.35
  const headCom = add(shoulder, fromPolar(dirNeck, headComLength(a)))
  const headTop = add(shoulder, fromPolar(dirNeck, headTopLength(a)))

  return {
    chord: norm(shoulder),
    chordOffset: Math.atan2(shoulder.y, shoulder.x),
    local: {
      hip: at('hip'),
      lumbosacral: at('lumbosacral'),
      lumbarApex: at('lumbarApex'),
      thoracolumbar: at('thoracolumbar'),
      thoracicApex: at('thoracicApex'),
      shoulder,
      headCom,
      headTop,
    },
  }
}

export interface Posture {
  heel: Vec2
  toe: Vec2
  ankle: Vec2
  knee: Vec2
  hip: Vec2
  lumbosacral: Vec2
  lumbarApex: Vec2
  thoracolumbar: Vec2
  thoracicApex: Vec2
  shoulder: Vec2
  elbow: Vec2
  hand: Vec2
  headCom: Vec2
  headTop: Vec2
  bar: Vec2
}

export interface MassPoint {
  key: string
  position: Vec2
  /** Mass in kilograms. */
  mass: number
}

/** Places the trunk so that the hip sits at `hip` and the chord points at `chordAngle`. */
export function placeTrunk(shape: TrunkShape, hip: Vec2, chordAngleRad: number) {
  const rotation = chordAngleRad - shape.chordOffset
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  const place = (p: Vec2): Vec2 => ({
    x: hip.x + p.x * c - p.y * s,
    y: hip.y + p.x * s + p.y * c,
  })
  return {
    hip,
    lumbosacral: place(shape.local.lumbosacral),
    lumbarApex: place(shape.local.lumbarApex),
    thoracolumbar: place(shape.local.thoracolumbar),
    thoracicApex: place(shape.local.thoracicApex),
    shoulder: place(shape.local.shoulder),
    headCom: place(shape.local.headCom),
    headTop: place(shape.local.headTop),
  }
}

export function footPoints(a: Anthropometry) {
  const half = a.foot / 2
  return {
    heel: vec(-half, 0),
    toe: vec(half, 0),
    // The lateral malleolus sits roughly a quarter of the foot length behind
    // midfoot, which is the origin of the model.
    ankle: vec(-a.foot * 0.25, ankleHeight(a)),
  }
}

/** Point masses for the whole body, in kilograms, at their current positions. */
export function bodyMassPoints(p: Posture, a: Anthropometry): MassPoint[] {
  const m = a.mass
  return [
    { key: 'feet', position: lerpVec(p.ankle, p.toe, 0.5), mass: SEGMENT_MASS.feet * m },
    {
      key: 'shanks',
      position: lerpVec(p.knee, p.ankle, SEGMENT_COM.shank),
      mass: SEGMENT_MASS.shanks * m,
    },
    {
      key: 'thighs',
      position: lerpVec(p.hip, p.knee, SEGMENT_COM.thigh),
      mass: SEGMENT_MASS.thighs * m,
    },
    {
      key: 'pelvis',
      position: lerpVec(p.hip, p.lumbosacral, SEGMENT_COM.pelvis),
      mass: SEGMENT_MASS.pelvis * m,
    },
    {
      key: 'lumbar',
      // Along the lordotic arc, not across its chord.
      position:
        SEGMENT_COM.lumbar <= 0.5
          ? lerpVec(p.lumbosacral, p.lumbarApex, SEGMENT_COM.lumbar * 2)
          : lerpVec(p.lumbarApex, p.thoracolumbar, SEGMENT_COM.lumbar * 2 - 1),
      mass: SEGMENT_MASS.lumbar * m,
    },
    {
      key: 'thorax',
      // Along the kyphotic arc, not across its chord.
      position:
        SEGMENT_COM.thorax <= 0.5
          ? lerpVec(p.thoracolumbar, p.thoracicApex, SEGMENT_COM.thorax * 2)
          : lerpVec(p.thoracicApex, p.shoulder, SEGMENT_COM.thorax * 2 - 1),
      mass: SEGMENT_MASS.thorax * m,
    },
    { key: 'headNeck', position: p.headCom, mass: SEGMENT_MASS.headNeck * m },
    { key: 'arms', position: armCentre(p), mass: SEGMENT_MASS.arms * m },
  ]
}

/**
 * Whole-arm centre of mass at 53 % of the shoulder-elbow-hand path. Following
 * the bent path matters in the squat, where the hands sit next to the
 * shoulders but the arms hang out behind them.
 */
function armCentre(p: Posture): Vec2 {
  const upper = dist(p.shoulder, p.elbow)
  const fore = dist(p.elbow, p.hand)
  const target = (upper + fore) * SEGMENT_COM.arm
  if (target <= upper) {
    return lerpVec(p.shoulder, p.elbow, upper > 0 ? target / upper : 0)
  }
  return lerpVec(p.elbow, p.hand, fore > 0 ? (target - upper) / fore : 0)
}

export function centreOfMassX(points: MassPoint[]): number {
  let sum = 0
  let total = 0
  for (const point of points) {
    sum += point.mass * point.position.x
    total += point.mass
  }
  return sum / total
}

export function centreOfMass(points: MassPoint[]): Vec2 {
  let sx = 0
  let sy = 0
  let total = 0
  for (const point of points) {
    sx += point.mass * point.position.x
    sy += point.mass * point.position.y
    total += point.mass
  }
  return vec(sx / total, sy / total)
}

export interface JointAngles {
  /** Tibia inclination from vertical. Positive means the knee is forward. */
  tibia: number
  /** Interior knee angle, 180 deg when the leg is straight. */
  kneeInterior: number
  /** Knee flexion, 0 deg when the leg is straight. */
  kneeFlexion: number
  /** Hip flexion, 0 deg when standing tall. */
  hipFlexion: number
  /** Trunk chord inclination from horizontal, 90 deg when upright. */
  trunk: number
  /** Ankle dorsiflexion relative to a neutral, right-angled ankle. */
  dorsiflexion: number
  /** Femur inclination from horizontal, 0 deg when the thigh is parallel to the floor. */
  thigh: number
}

/** Acute inclination of a segment relative to the floor, 0 to 90 deg. */
export function inclinationFromHorizontal(a: Vec2, b: Vec2): number {
  const angle = Math.abs(segmentAngle(a, b))
  return angle > 90 ? 180 - angle : angle
}

export function jointAngles(p: Posture): JointAngles {
  const tibia = angleFromVertical(p.ankle, p.knee)
  const kneeInterior = angleBetween(p.ankle, p.knee, p.hip)
  const thighAngle = inclinationFromHorizontal(p.knee, p.hip)
  const trunk = segmentAngle(p.hip, p.shoulder)
  // Hip flexion is the angle closed between the femur and the trunk chord,
  // measured from the anatomical standing position.
  const hipFlexion = 180 - angleBetween(p.knee, p.hip, p.shoulder)
  return {
    tibia,
    kneeInterior,
    kneeFlexion: 180 - kneeInterior,
    hipFlexion,
    trunk,
    // With the sole flat on the floor the tibia's inclination from vertical is
    // the dorsiflexion angle.
    dorsiflexion: tibia,
    thigh: thighAngle,
  }
}

/** Straight-arm elbow position, purely for drawing. */
export function elbowFor(shoulder: Vec2, hand: Vec2): Vec2 {
  return lerpVec(shoulder, hand, 0.55)
}

/**
 * In the squat the hands are on the bar right behind the neck, so the elbow
 * is placed down and back from the shoulder relative to the trunk axis
 * instead of along the very short shoulder-to-bar line. The elbow also points
 * out to the side, so only part of the humerus projects onto the sagittal
 * plane: drawing its full length would send the arm clean through the torso.
 */
const SQUAT_ELBOW_PROJECTION = { alongTrunk: 0.55, posterior: 0.3 } as const

export function squatElbow(shoulder: Vec2, hip: Vec2, a: Anthropometry): Vec2 {
  const trunk = sub(shoulder, hip)
  const len = norm(trunk) || 1
  const up = vec(trunk.x / len, trunk.y / len)
  const posterior = vec(-up.y, up.x)
  const upperArm = a.arm * 0.5
  return add(
    shoulder,
    add(
      scale(up, -upperArm * SQUAT_ELBOW_PROJECTION.alongTrunk),
      scale(posterior, upperArm * SQUAT_ELBOW_PROJECTION.posterior),
    ),
  )
}
