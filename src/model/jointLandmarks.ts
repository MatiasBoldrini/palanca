import type { JointKey } from './kinetics'
import type { Stance } from './stance'

/** Transverse coordinate of a joint centre on the +Z side of the posed figure. */
export function jointLateralOffset(joint: JointKey, stance: Stance): number {
  switch (joint) {
    case 'ankle':
      return stance.ankleHalf
    case 'knee':
      return stance.kneeHalf
    case 'hip':
      return stance.hipHalf
    case 'l5s1':
      return 0
  }
}

/** Transverse coordinate on the +Z foot's longitudinal axis at a given sagittal X. */
export function lateralAlongFoot(stance: Stance, ankleX: number, x: number): number {
  return stance.ankleHalf + (x - ankleX) * Math.tan(stance.toeOutRad)
}
