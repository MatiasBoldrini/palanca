import type { BenchFrame, BenchPoint } from './bench'
import { BENCH_PARTS, type BenchPartId } from './bodyEditing'

function midpoint(a: BenchPoint, b: BenchPoint): BenchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}

/** World-space landmarks for selecting and adjusting segments on the bench model. */
export function benchBodyTargets(frame: BenchFrame, side: 0 | 1 = 0) {
  const leg = frame.pose.legs[side]
  const arm = frame.arms[side]
  const points: Record<BenchPartId, BenchPoint> = {
    foot: midpoint(leg.heel, leg.toe),
    shank: midpoint(leg.ankle, leg.knee),
    thigh: midpoint(leg.knee, leg.hip),
    torso: frame.pose.chest,
    arm: midpoint(arm.elbow, arm.shoulder),
    grip: arm.grip,
    bar: { ...frame.bar, z: side === 0 ? 0.7 : -0.7 },
  }
  const shoulderMid = midpoint(frame.arms[0].shoulder, frame.arms[1].shoulder)
  const segments: Record<BenchPartId, BenchPoint[]> = {
    foot: [leg.heel, leg.toe],
    shank: [leg.ankle, leg.knee],
    thigh: [leg.knee, leg.hip],
    torso: [frame.pose.hip, shoulderMid],
    arm: [arm.shoulder, arm.elbow, arm.grip],
    grip: [frame.arms[0].grip, frame.arms[1].grip],
    bar: [
      { ...frame.bar, z: -0.86 },
      { ...frame.bar, z: 0.86 },
    ],
  }
  return (Object.keys(points) as BenchPartId[]).map((id) => ({
    id,
    label: BENCH_PARTS[id],
    point: points[id],
    segment: segments[id],
  }))
}
