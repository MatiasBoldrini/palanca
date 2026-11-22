import { GRAVITY } from './anthropometry'
import type { Vec2 } from './geometry'
import { jointLateralOffset } from './jointLandmarks'
import { EXTENSOR_SIGN, JOINT_POINT, LIMB_SHARE, type JointKey } from './kinetics'
import type { Frame, Task } from './lift'
import { centreOfMass } from './posture'

/** Metres in the atlas: +X anterior, +Y vertical, Z transverse. */
export interface WorldPoint extends Vec2 {
  z: number
}

export interface OverlayForce {
  id: 'bar' | 'body' | 'ground'
  label: string
  anchor: WorldPoint
  /** Vertical component of the external force on the body–bar system. */
  verticalN: number
}

export interface OverlayMoment {
  id: JointKey
  label: string
  anchor: WorldPoint
  /** Net internal demand, positive for extension or plantarflexion. */
  momentNm: number
  /** Transverse torque on the proximal segment, positive around world +Z. */
  torqueZNm: number
  /** Signed horizontal offset from the joint to the bar's line of gravity, in metres. */
  barArmM: number
  /** Contributions in the same extensor-positive convention and limb share as momentNm. */
  barMomentNm: number
  bodyMomentNm: number
  action: string
}

export interface MechanicsOverlay {
  forces: OverlayForce[]
  moments: OverlayMoment[]
}

export type ForceFocus = 'all' | 'bar' | 'body' | 'support'

export interface MechanicsView {
  focus: ForceFocus
  loadPath: boolean
  forces: boolean
  moments: boolean
  joint: JointKey | 'all'
  lever: boolean
}

const JOINTS: { id: JointKey; label: string }[] = [
  { id: 'l5s1', label: 'Lumbar · L5/S1' },
  { id: 'hip', label: 'Cadera' },
  { id: 'knee', label: 'Rodilla' },
  { id: 'ankle', label: 'Tobillo' },
]

const wholeNumber = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const centimetres = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
export const formatForce = (newtons: number) => `${wholeNumber.format(Math.abs(newtons))} N`
export const formatMoment = (newtonMetres: number) =>
  `${wholeNumber.format(Math.round(newtonMetres) || 0)} N·m`
export const formatBarArm = (metres: number) => `${centimetres.format(Math.abs(metres) * 100)} cm`

function jointAction(joint: JointKey, moment: number) {
  if (Math.round(moment) === 0) return 'Momento ≈ 0'
  if (joint === 'ankle') return moment > 0 ? 'Flexión plantar' : 'Dorsiflexión'
  return moment > 0 ? 'Extensión' : 'Flexión'
}

export function buildMechanicsOverlay(
  frame: Frame,
  task: Task,
  nearSide: 1 | -1 = 1,
): MechanicsOverlay {
  const { kinetics, posture } = frame
  const barWeight = task.load * GRAVITY
  const bodyCom = centreOfMass(frame.massPoints)
  const forces: OverlayForce[] = [
    {
      id: 'bar',
      label: 'Peso de la barra',
      anchor: { ...posture.bar, z: 0 },
      verticalN: -barWeight,
    },
    {
      id: 'body',
      label: 'Peso corporal',
      anchor: { ...bodyCom, z: 0 },
      verticalN: barWeight - kinetics.systemWeight,
    },
    {
      id: 'ground',
      label: 'Reacción del suelo',
      anchor: { x: frame.centreOfPressure, y: 0, z: 0 },
      verticalN: kinetics.systemWeight,
    },
  ]
  const moments = JOINTS.map(({ id, label }) => {
    const point = JOINT_POINT[id](posture)
    const lateral = jointLateralOffset(id, frame.stance)
    const momentNm = kinetics.moment[id]
    const barArmM = kinetics.barMomentArm[id]
    const barMomentNm = barWeight * barArmM * LIMB_SHARE[id] * EXTENSOR_SIGN[id]
    return {
      id,
      label,
      anchor: { ...point, z: lateral ? nearSide * lateral : 0 },
      momentNm,
      torqueZNm: momentNm * EXTENSOR_SIGN[id],
      barArmM,
      barMomentNm,
      bodyMomentNm: momentNm - barMomentNm,
      action: jointAction(id, momentNm),
    }
  })
  return { forces, moments }
}
