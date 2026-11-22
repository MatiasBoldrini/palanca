import { deepStrictEqual } from 'node:assert'
import { DEFAULT_ANTHROPOMETRY } from '../src/model/anthropometry'
import { dist } from '../src/model/geometry'
import { feasibleRange } from '../src/model/interact'
import { DEFAULT_TASK, solveFrame, type ExerciseId, type Frame } from '../src/model/lift'
import { repetitionPose } from '../src/model/repetition'
import { presetsFor } from '../src/state/presets'

for (const exercise of ['deadlift', 'squat'] satisfies ExerciseId[]) {
  let samples = 0
  let playableFrames = 0
  let feasiblePairs = 0
  let maxBarStep = 0
  let maxHeadStep = 0
  for (const { id, coordination } of presetsFor(exercise)) {
    for (const cop of [-0.06, 0, 0.06]) {
      const task = { ...DEFAULT_TASK, cop, progress: exercise === 'squat' ? 1 : 0 }
      const solve = (progress: number) => {
        const frame = solveFrame(
          exercise,
          DEFAULT_ANTHROPOMETRY,
          { ...task, progress },
          coordination,
        )
        if (
          Object.values(frame.posture).some(
            ({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y),
          )
        ) {
          throw new Error(
            `Coordenada no finita en ${exercise}, ${id}, apoyo ${cop}, recorrido ${progress}`,
          )
        }
        return frame
      }
      // Sweep absolute position independently of rendering speed and playback easing.
      let previous: Frame | undefined
      for (let step = 0; step <= 1000; step++) {
        const pose = solve(step / 1000)
        if (pose.feasible && previous?.feasible) {
          maxBarStep = Math.max(maxBarStep, dist(pose.posture.bar, previous.posture.bar))
          maxHeadStep = Math.max(maxHeadStep, dist(pose.posture.headTop, previous.posture.headTop))
          feasiblePairs++
        }
        previous = pose
        samples++
      }
      // Replay one seven-second cycle at 60 Hz, including both endpoints.
      const { min, max } = feasibleRange('progress', {
        exercise,
        task,
        coordination,
        anthro: DEFAULT_ANTHROPOMETRY,
      })
      let start: Frame | undefined
      for (let tick = 0; tick <= 420; tick++) {
        const { progress } = repetitionPose(exercise, (2 * tick) / 420, min, max)
        const pose = solve(progress)
        if (!pose.feasible)
          throw new Error(
            `Reproducción inviable en ${exercise}, ${id}, apoyo ${cop}, cuadro ${tick}`,
          )
        if (tick === 0) start = pose
        if (tick === 420) deepStrictEqual(pose.posture, start?.posture)
        playableFrames++
      }
    }
  }
  console.log(
    `${exercise} · ${samples} posiciones · ${feasiblePairs} pares factibles · paso máximo en barra ${(maxBarStep * 1000).toFixed(2)} mm y cabeza ${(maxHeadStep * 1000).toFixed(2)} mm · ${playableFrames} cuadros reproducibles`,
  )
}
