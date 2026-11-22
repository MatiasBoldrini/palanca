import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useMediaQuery } from './useMediaQuery'
import { repetitionStart, repetitionPose, type PlaybackPhase as MovementPhase } from '../model/repetition'
import type { RepetitionExercise } from '../model/repetition'

export type PlaybackPhase = MovementPhase | 'idle'

export type NumericSnapshot = Record<string, number>

interface Options {
  /** Higher is snappier. */
  stiffness?: number
  /** 1 is critically damped. */
  dampingRatio?: number
  /** Below this distance the spring is considered settled. */
  epsilon?: number
  /** Switching tasks starts a new pose rather than interpolating unrelated coordinate systems. */
  resetKey?: string
}

/**
 * Springs a bag of numbers towards their targets on a single animation frame
 * loop, and stops the loop once everything settles. Keeping one loop for the
 * whole model means the figure, the readouts and the chart marker always
 * describe the same instant.
 */
export function useSpringSnapshot<T extends NumericSnapshot>(
  target: T,
  { stiffness = 260, dampingRatio = 1, epsilon = 0.0002, resetKey }: Options = {},
): T {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [snapshot, setSnapshot] = useState<T>(target)
  const stateRef = useRef({
    values: { ...target } as NumericSnapshot,
    velocities: {} as NumericSnapshot,
  })
  const targetRef = useRef(target)
  const frameRef = useRef(0)
  const runningRef = useRef(false)

  targetRef.current = target
  const previousKey = useRef(resetKey)
  useLayoutEffect(() => {
    if (previousKey.current === resetKey) return
    previousKey.current = resetKey
    cancelAnimationFrame(frameRef.current)
    runningRef.current = false
    stateRef.current = { values: { ...targetRef.current }, velocities: {} }
    setSnapshot(targetRef.current)
  }, [resetKey])

  // The loop reads the target through a ref, so a new target while it is in
  // flight just changes where it is heading. It must not tear the loop down:
  // cancelling the pending frame here without scheduling a new one would leave
  // the spring flagged as running and frozen for good.
  useEffect(() => {
    const atTarget = Object.keys(target).every((key) => stateRef.current.values[key] === target[key])
    if (reduceMotion) {
      cancelAnimationFrame(frameRef.current)
      runningRef.current = false
      stateRef.current.velocities = {}
      if (!atTarget) {
        stateRef.current.values = { ...target }
        setSnapshot(target)
      }
      return
    }
    if (runningRef.current || atTarget) return

    runningRef.current = true
    let last = performance.now()
    const damping = 2 * Math.sqrt(stiffness) * dampingRatio

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      const { values, velocities } = stateRef.current
      const goal = targetRef.current
      let settled = true

      for (const key of Object.keys(goal)) {
        const to = goal[key]
        const from = values[key] ?? to
        const v = velocities[key] ?? 0
        const acceleration = -stiffness * (from - to) - damping * v
        const nextV = v + acceleration * dt
        const next = from + nextV * dt
        if (Math.abs(next - to) > epsilon || Math.abs(nextV) > epsilon) {
          settled = false
          values[key] = next
          velocities[key] = nextV
        } else {
          values[key] = to
          velocities[key] = 0
        }
      }

      setSnapshot({ ...values } as T)

      if (settled) {
        runningRef.current = false
        return
      }
      frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
  }, [target, stiffness, dampingRatio, epsilon, reduceMotion])

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      runningRef.current = false
    },
    [],
  )

  return reduceMotion || previousKey.current !== resetKey ? target : snapshot
}

interface PlaybackCursor {
  exercise: RepetitionExercise
  min: number
  max: number
  time: number
  progress: number
}

/** Play one complete repetition, preserving its direction across pause and resume. */
export function usePlayback(
  progress: number,
  playing: boolean,
  onChange: (value: number) => void,
  onStop: () => void,
  { min, max } = { min: 0, max: 1 },
  cycleSeconds = 7,
  exercise: RepetitionExercise = 'deadlift',
): PlaybackPhase {
  const cursor = useRef<PlaybackCursor | null>(null)
  const latest = useRef({ progress, onChange, onStop })
  latest.current = { progress, onChange, onStop }
  const [phase, setPhase] = useState<MovementPhase>('ascending')

  useEffect(() => {
    if (!playing) return
    if (max <= min || cycleSeconds <= 0) {
      latest.current.onStop()
      return
    }

    const previous = cursor.current
    const resume = previous && previous.exercise === exercise &&
      previous.min === min && previous.max === max &&
      Math.abs(previous.progress - latest.current.progress) < 1e-8
    let time = resume ? previous.time : repetitionStart(exercise, latest.current.progress, min, max)
    setPhase(repetitionPose(exercise, time, min, max).phase)

    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      time = Math.min(2, time + (2 * (now - last)) / (cycleSeconds * 1000))
      last = now
      const pose = repetitionPose(exercise, time, min, max)
      cursor.current = { exercise, min, max, time, progress: pose.progress }
      setPhase(pose.phase)
      latest.current.onChange(pose.progress)
      if (time === 2) {
        cursor.current = null
        latest.current.onStop()
      } else {
        raf = requestAnimationFrame(step)
      }
    }
    const syncVisibility = () => {
      cancelAnimationFrame(raf)
      if (document.hidden) return
      last = performance.now()
      raf = requestAnimationFrame(step)
    }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', syncVisibility)
    }
  }, [playing, cycleSeconds, exercise, min, max])

  return playing ? phase : 'idle'
}
