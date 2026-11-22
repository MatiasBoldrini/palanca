import type { Anthropometry } from '../model/anthropometry'
import { editableHotspotsFor, type HotspotId } from '../model/interact'
import type { ExerciseId, Frame } from '../model/lift'
import { formatBarArm, type WorldPoint } from '../model/mechanicsOverlay'
import { jointLateralOffset, lateralAlongFoot } from '../model/jointLandmarks'
import type { Vec2 } from '../model/geometry'
import type { BodyPartTarget } from './bodyPartDrawing'
import { armLandmarks } from './rig'

/** Resolve taps on the ends of a limb to the joint under the visible surface. */
export function standingPartAt(
  zone: HotspotId,
  hit: WorldPoint,
  frame: Frame,
  anthro: Anthropometry,
): HotspotId {
  function near(joint: 'ankle' | 'knee' | 'hip', radius: number) {
    const point = frame.posture[joint]
    const z = jointLateralOffset(joint, frame.stance)
    return (
      Math.hypot(hit.x - point.x, hit.y - point.y, Math.abs(hit.z) - z) <= anthro.height * radius
    )
  }
  if ((zone === 'foot' || zone === 'shank') && near('ankle', 0.035)) return 'ankle'
  if ((zone === 'shank' || zone === 'thigh') && near('knee', 0.047)) return 'knee'
  if (zone === 'thigh' && near('hip', 0.06)) return 'hip'
  return zone
}

export function standingTargets(
  frame: Frame,
  anthro: Anthropometry,
  exercise: ExerciseId,
  side: number,
): BodyPartTarget<HotspotId>[] {
  const p = frame.posture
  const world = (v: Vec2, z = 0): WorldPoint => ({ x: v.x, y: v.y, z })
  const offset = (joint: 'hip' | 'knee' | 'ankle') => side * jointLateralOffset(joint, frame.stance)
  const arm = armLandmarks(frame, side)
  const foot = (v: Vec2) => world(v, side * lateralAlongFoot(frame.stance, p.ankle.x, v.x))
  const hip = world(p.hip, offset('hip')),
    knee = world(p.knee, offset('knee')),
    ankle = world(p.ankle, offset('ankle'))
  const { width } = frame.stance
  const atWidth = (x: number): [WorldPoint, WorldPoint] => [
    { x, y: 0.002, z: -width / 2 },
    { x, y: 0.002, z: width / 2 },
  ]
  const dimension = {
    ends: atWidth((p.toe.x + p.heel.x) / 2),
    offsetEnds: atWidth(p.toe.x + anthro.foot * 0.18),
    label: formatBarArm(width),
  }
  return editableHotspotsFor(exercise, frame).map((spot) => {
    let point = world(spot.point)
    let segment: WorldPoint[] | undefined
    switch (spot.id) {
      case 'arm':
        point = arm.elbow
        segment = [arm.shoulder, arm.elbow, arm.grip]
        break
      case 'thigh':
        point = world(spot.point, (hip.z + knee.z) / 2)
        segment = [hip, knee]
        break
      case 'shank':
        point = world(spot.point, (knee.z + ankle.z) / 2)
        segment = [knee, ankle]
        break
      case 'hip':
        point = hip
        break
      case 'knee':
        point = knee
        break
      case 'ankle':
        point = ankle
        break
      case 'bar':
        point = world(p.bar, side * 0.65)
        segment = [world(p.bar, -0.85), world(p.bar, 0.85)]
        break
      case 'foot':
        point = foot(spot.point)
        segment = [foot(p.heel), foot(p.toe)]
        break
      case 'spine':
        segment = [
          p.hip,
          p.lumbosacral,
          p.lumbarApex,
          p.thoracolumbar,
          p.thoracicApex,
          p.shoulder,
        ].map((v) => world(v))
        break
    }
    return {
      id: spot.id,
      label: spot.label,
      point,
      segment,
      dimension: spot.id === 'foot' || spot.id === 'ankle' ? dimension : undefined,
    }
  })
}
