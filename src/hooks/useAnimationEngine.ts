import { useEffect, useRef, useState } from 'react'

export type NumericSnapshot = Record<string, number>

interface Options {
  /** Higher is snappier. */
  stiffness?: number
  /** 1 is critically damped. */
  dampingRatio?: number
  /** Below this distance the spring is considered settled. */
  epsilon?: number
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Springs a bag of numbers towards their targets on a single animation frame
 * loop, and stops the loop once everything settles. Keeping one loop for the
 * whole model means the figure, the readouts and the chart marker always
 * describe the same instant.
 */
export function useSpringSnapshot<T extends NumericSnapshot>(
  target: T,
  { stiffness = 260, dampingRatio = 1, epsilon = 0.0002 }: Options = {},
): T {
  const [snapshot, setSnapshot] = useState<T>(target)
  const stateRef = useRef({
    values: { ...target } as NumericSnapshot,
    velocities: {} as NumericSnapshot,
  })
  const targetRef = useRef(target)
  const frameRef = useRef(0)
  const runningRef = useRef(false)

  targetRef.current = target

  // The loop reads the target through a ref, so a new target while it is in
  // flight just changes where it is heading. It must not tear the loop down:
  // cancelling the pending frame here without scheduling a new one would leave
  // the spring flagged as running and frozen for good.
  useEffect(() => {
    if (prefersReducedMotion()) {
      stateRef.current.values = { ...target }
      setSnapshot({ ...target })
      return
    }
    if (runningRef.current) return

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
  }, [target, stiffness, dampingRatio, epsilon])

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      runningRef.current = false
    },
    [],
  )

  return snapshot
}

export type PlaybackPhase = 'idle' | 'descending' | 'ascending'

/**
 * Drives the lift progress. Playing runs a full descent and ascent so the two
 * coordination patterns can be watched moving through the same task.
 */
export function usePlayback(
  progress: number,
  playing: boolean,
  onChange: (value: number) => void,
  onStop: () => void,
  /** Turnaround point, which for some setups falls short of a full lockout. */
  range: { min: number; max: number } = { min: 0, max: 1 },
  /** Seconds for a full descent plus ascent. */
  cycleSeconds = 7,
) {
  const progressRef = useRef(progress)
  const directionRef = useRef(-1)
  progressRef.current = progress

  /*
   * The callbacks are rebuilt on most renders, and the loop must not restart
   * for that. Restarting re-derives the direction from where the lift
   * currently is, so a loop that tears down every frame just flips direction
   * every frame and shudders in place instead of playing. Holding them in refs
   * leaves the effect depending only on things that really should restart it.
   */
  const onChangeRef = useRef(onChange)
  const onStopRef = useRef(onStop)
  onChangeRef.current = onChange
  onStopRef.current = onStop

  const { min, max } = range

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    // Starting from the top reads as a descent, which is how coaches cue it.
    directionRef.current = progressRef.current > min + 0.02 ? -1 : 1
    const speed = ((max - min) * 2) / cycleSeconds

    const step = (now: number) => {
      // Capped so coming back to a backgrounded tab does not teleport the bar.
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      let next = progressRef.current + directionRef.current * dt * speed

      if (next <= min) {
        next = min
        directionRef.current = 1
      } else if (next >= max) {
        next = max
        if (directionRef.current === 1) {
          onChangeRef.current(max)
          onStopRef.current()
          return
        }
      }

      progressRef.current = next
      onChangeRef.current(next)
      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, cycleSeconds, min, max])
}
