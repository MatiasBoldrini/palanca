/**
 * Segment lengths follow Drillis & Contini (1964) as reproduced in Winter,
 * Biomechanics and Motor Control of Human Movement (4th ed.), Fig. 4.1.
 * Segment masses and centre-of-mass locations follow Winter Table 4.1
 * (Dempster). The README documents where each number comes from.
 */

/** Landmark heights as a fraction of standing height. */
export const LANDMARK_HEIGHT = {
  vertex: 1.0,
  acromion: 0.818,
  elbow: 0.63,
  trochanter: 0.53,
  wrist: 0.485,
  knee: 0.285,
  ankle: 0.039,
} as const

/** Segment lengths as a fraction of standing height. */
export const LENGTH_FRACTION = {
  // Slightly under Drillis & Contini (0.152): the sole dominated the stage at
  // the table value, and foot length is no longer a user control.
  foot: 0.125,
  shank: LANDMARK_HEIGHT.knee - LANDMARK_HEIGHT.ankle, // 0.246
  thigh: LANDMARK_HEIGHT.trochanter - LANDMARK_HEIGHT.knee, // 0.245
  torso: LANDMARK_HEIGHT.acromion - LANDMARK_HEIGHT.trochanter, // 0.288
  /** Acromion to the centre of the hand in a closed grip. */
  arm: 0.34,
  /** Acromion to the top of the head. */
  headTop: 0.182,
  /** Acromion to the ear canal, where Winter places the head+neck mass. */
  headCom: 0.112,
  shoulderWidth: 0.23,
  hipWidth: 0.191,
} as const

/**
 * Where the trunk is subdivided, as a fraction of its length measured along
 * the spine. Derived from landmark heights: L5/S1 at 0.583 H and T12/L1 at
 * 0.720 H. The three regions sum to 1.
 */
export const TRUNK_LINK_FRACTION = {
  pelvis: 0.184, // trochanter -> L5/S1
  lumbar: 0.476, // L5/S1 -> T12/L1
  thorax: 0.34, // T12/L1 -> acromion
} as const

/**
 * Mass as a fraction of body mass, and centre of mass as a fraction of the
 * link length measured from the first listed endpoint. Bilateral segments are
 * already doubled. The eight entries sum to exactly 1.000.
 */
export const SEGMENT_MASS = {
  feet: 0.029,
  shanks: 0.093,
  thighs: 0.2,
  pelvis: 0.142,
  lumbar: 0.139,
  thorax: 0.216,
  headNeck: 0.081,
  arms: 0.1,
} as const

export const SEGMENT_COM = {
  /** From the knee towards the ankle. */
  shank: 0.433,
  /** From the hip towards the knee. */
  thigh: 0.433,
  /** From the trochanter towards L5/S1. */
  pelvis: 0.5,
  /** From L5/S1 towards T12/L1. */
  lumbar: 0.56,
  /** From T12/L1 towards the acromion. Winter places the thorax mass low. */
  thorax: 0.18,
  /** From the acromion towards the grip. */
  arm: 0.53,
} as const

/**
 * Aasa et al. (2019) measured 22 deg of lower-lumbar and 12 deg of
 * upper-lumbar rotation during the deadlift, so spine flexion goes 65/35 to
 * the lumbar region over the thoracic one.
 */
export const LUMBAR_SHARE = 0.65

/**
 * How much the lumbar region can bend away from neutral before the rest of the
 * flexion has to come from above. Aasa's 22 deg of lower- plus 12 deg of
 * upper-lumbar rotation is the whole lumbar excursion of a deadlift, so once
 * the lordosis is spent the visible rounding is upper back, not lumbar.
 */
export const LUMBAR_FLEXION_LIMIT = 28

export const GRAVITY = 9.80665

export interface Anthropometry {
  /** Standing height, metres. */
  height: number
  /** Body mass, kilograms. */
  mass: number
  /** Foot length, metres. */
  foot: number
  /** Lateral malleolus to femoral condyle, metres. */
  shank: number
  /** Femoral condyle to greater trochanter, metres. */
  thigh: number
  /** Greater trochanter to acromion, metres. */
  torso: number
  /** Acromion to the centre of the gripping hand, metres. */
  arm: number
  /** Maximum weight-bearing dorsiflexion, degrees. */
  maxDorsiflexion: number
}

export function anthropometryFromHeight(height: number, mass: number): Anthropometry {
  return {
    height,
    mass,
    foot: LENGTH_FRACTION.foot * height,
    shank: LENGTH_FRACTION.shank * height,
    thigh: LENGTH_FRACTION.thigh * height,
    torso: LENGTH_FRACTION.torso * height,
    arm: LENGTH_FRACTION.arm * height,
    maxDorsiflexion: 35,
  }
}

export const DEFAULT_ANTHROPOMETRY = anthropometryFromHeight(1.75, 80)

/**
 * Standing height implied by the segments, rather than a number set on its own.
 *
 * Shank, thigh and torso stack from the ankle to the acromion, which the table
 * puts at 0.818 H, and the ankle itself at 0.039 H; the two fractions leave
 * those three segments spanning 0.779 H. Deriving it this way removes a
 * contradiction: height used to be an independent input that silently rewrote
 * the very segments it is made of.
 */
export const heightFromSegments = (a: {
  shank: number
  thigh: number
  torso: number
}): number =>
  (a.shank + a.thigh + a.torso) /
  (LENGTH_FRACTION.shank + LENGTH_FRACTION.thigh + LENGTH_FRACTION.torso)

/** Height of the ankle joint centre above the floor, metres. */
export const ankleHeight = (a: Anthropometry): number => LANDMARK_HEIGHT.ankle * a.height

/** Standing hip height, metres. Derived from the chain, not from the table. */
export const standingHipHeight = (a: Anthropometry): number =>
  ankleHeight(a) + a.shank + a.thigh

/** Standing acromion height, metres. */
export const standingShoulderHeight = (a: Anthropometry): number =>
  standingHipHeight(a) + a.torso

export const headTopLength = (a: Anthropometry): number =>
  (LENGTH_FRACTION.headTop / LENGTH_FRACTION.torso) * a.torso

export const headComLength = (a: Anthropometry): number =>
  (LENGTH_FRACTION.headCom / LENGTH_FRACTION.torso) * a.torso
