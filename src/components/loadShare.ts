import type { JointKey } from '../model/kinetics'

export const JOINT_ROWS: { key: JointKey; label: string }[] = [
  { key: 'l5s1', label: 'Espalda baja' },
  { key: 'hip', label: 'Cadera' },
  { key: 'knee', label: 'Rodilla' },
  { key: 'ankle', label: 'Tobillo' },
]

/**
 * Thresholds span both lifts. A deadlift lives in the bottom of this range —
 * a knee-to-hip ratio of 0.25 is already a noticeably knee-assisted pull — so
 * the low end needs steps that a squat scale would flatten into one bucket.
 */
export function describeSplit(kneeToHip: number): string {
  if (kneeToHip < 0.1) return 'Trabajo casi todo de cadera'
  if (kneeToHip < 0.35) return 'Sobre todo cadera, con algo de rodilla'
  if (kneeToHip < 0.75) return 'Más cadera que rodilla'
  if (kneeToHip < 1.3) return 'Cadera y rodilla parejas'
  if (kneeToHip < 2.2) return 'Más rodilla que cadera'
  return 'Trabajo casi todo de rodilla'
}
