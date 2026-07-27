import type { JointKey } from '../model/kinetics'

/**
 * Cool hues for "which joint" on the curves. Kept away from the warm load
 * gradients on the figure so legend and load map never fight.
 */
export const JOINT_COLOR: Record<JointKey, string> = {
  l5s1: 'var(--joint-l5s1)',
  hip: 'var(--joint-hip)',
  knee: 'var(--joint-knee)',
  ankle: 'var(--joint-ankle)',
}

/** Dimension lines (cotas) on the figure — cool family, distinct from heat. */
export const ARM_COLOR: Record<JointKey, string> = {
  l5s1: 'var(--arm-l5s1)',
  hip: 'var(--arm-hip)',
  knee: 'var(--arm-knee)',
  ankle: 'var(--arm-ankle)',
}
