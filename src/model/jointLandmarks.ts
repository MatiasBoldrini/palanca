import type { JointKey } from './kinetics'
import type { ExerciseId } from './lift'

/** Distance from the sagittal midline to one joint of Palanca's posed anatomical atlas. */
export function jointLateralOffset(joint: JointKey, exercise: ExerciseId, height: number): number {
  const scale = height / 1.71
  switch (joint) {
    case 'ankle':
      return scale * (exercise === 'squat' ? 0.151 : 0.115)
    case 'knee':
      return scale * (exercise === 'squat' ? 0.147 : 0.109)
    case 'hip':
      return scale * 0.08
    case 'l5s1':
      return 0
  }
}
