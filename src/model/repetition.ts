import { clamp, lerp } from './geometry'
import type { ExerciseId } from './lift'

export type PlaybackPhase = 'ascending' | 'descending'

/** Zero speed and acceleration at each reversal keep a nearly straight knee from snapping open. */
function ease(t: number): number {
  return t * t * t * (10 + t * (-15 + 6 * t))
}

/** Time runs from 0 to 2: one unit out, one back. Invert the path to start at any scrubbed pose. */
export function repetitionStart(exercise: ExerciseId, progress: number, min: number, max: number) {
  if (max <= min) return 0
  const height = clamp((progress - min) / (max - min), 0, 1)
  const outward = exercise === 'deadlift' ? height : 1 - height
  if (outward === 0 || outward === 1) return outward
  let lo = 0
  let hi = 1
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2
    if (ease(mid) < outward) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function repetitionPose(exercise: ExerciseId, time: number, min: number, max: number) {
  const t = clamp(time, 0, 2)
  const outward = clamp(ease(t <= 1 ? t : 2 - t), 0, 1)
  const ascending = exercise === 'deadlift' ? t < 1 : t >= 1
  const phase: PlaybackPhase = ascending ? 'ascending' : 'descending'
  return {
    progress: lerp(min, max, exercise === 'deadlift' ? outward : 1 - outward),
    phase,
  }
}
