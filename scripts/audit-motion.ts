import { deepStrictEqual, ok } from 'node:assert'
import { DEFAULT_ANTHROPOMETRY } from '../src/model/anthropometry'
import {
  BENCH_GRIP,
  benchPointDistance,
  buildBenchFrame,
  type BenchFrame,
} from '../src/model/bench'
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

let benchSamples = 0
let benchPlaybackFrames = 0
let maxBenchBarStep = 0
let maxBenchElbowStep = 0
let maxBenchPlaybackElbowStep = 0
let maxBenchLockoutElbowStep = 0
for (const grip of [BENCH_GRIP.min, BENCH_GRIP.default, BENCH_GRIP.max]) {
  for (const height of [1.45, 1.75, 2.1]) {
    for (const load of [0, 100, 300]) {
      const solve = (p: number) =>
        buildBenchFrame(p, load, height, DEFAULT_ANTHROPOMETRY.mass, grip)
      const top = solve(1)
      const bottom = solve(0)
      let previous: BenchFrame | undefined
      for (let step = 0; step <= 1000; step++) {
        const frame = solve(step / 1000)
        const heightFraction = (frame.bar.y - bottom.bar.y) / (top.bar.y - bottom.bar.y)
        ok(Math.abs(heightFraction - step / 1000) < 1e-12, 'La altura no coincide con el recorrido')
        const { barN, bodyN, benchN, feetN } = frame.forces
        const context =
          'Banca, agarre ' + grip + ', estatura ' + height + ', carga ' + load + ', paso ' + step
        const totalMoment =
          frame.bar.x * barN +
          frame.bodyCom.x * bodyN +
          frame.benchSupport.x * benchN +
          frame.footSupport.x * feetN
        ok(
          Math.abs(barN + bodyN + benchN + feetN) < 1e-8 && Math.abs(totalMoment) < 1e-8,
          context + ': equilibrio',
        )
        ok(benchN >= 0 && feetN >= 0, context + ': contacto')
        for (const [side, arm] of frame.arms.entries()) {
          for (const point of [
            arm.shoulder,
            arm.elbow,
            arm.wrist,
            arm.grip,
            ...Object.values(frame.pose.legs[side]),
          ]) {
            ok(Object.values(point).every(Number.isFinite), context + ': postura')
          }
          for (const m of Object.values(arm.moments)) {
            ok(Object.values(m).every(Number.isFinite), context + ': momento')
          }
          ok(arm.grip.x === frame.bar.x && arm.grip.y === frame.bar.y, context + ': agarre')
          if (previous) {
            const stepM = benchPointDistance(arm.elbow, previous.arms[side].elbow)
            maxBenchElbowStep = Math.max(maxBenchElbowStep, stepM)
          }
        }
        if (previous) {
          const stepM = benchPointDistance(frame.bar, previous.bar)
          ok(stepM < 0.003 && frame.bar.y >= previous.bar.y, context + ': recorrido de barra')
          maxBenchBarStep = Math.max(maxBenchBarStep, stepM)
        }
        benchSamples++
        previous = frame
      }
      let previousFrame = top
      for (let tick = 0; tick <= 420; tick++) {
        const pose = repetitionPose('bench', (2 * tick) / 420, 0, 1)
        const frame = solve(pose.progress)
        if (tick === 210) deepStrictEqual(frame, bottom)
        if (tick === 420) deepStrictEqual(frame, top)
        ok(tick <= 210 ? frame.bar.y <= previousFrame.bar.y : frame.bar.y >= previousFrame.bar.y)
        const elbowStep = benchPointDistance(frame.arms[0].elbow, previousFrame.arms[0].elbow)
        ok(elbowStep < 0.007, 'Salto del codo durante la reproducción de banca')
        maxBenchPlaybackElbowStep = Math.max(maxBenchPlaybackElbowStep, elbowStep)
        if (tick === 1 || tick === 420) {
          ok(elbowStep < 0.00075, 'Salto del codo al entrar o salir del bloqueo')
          maxBenchLockoutElbowStep = Math.max(maxBenchLockoutElbowStep, elbowStep)
        }
        previousFrame = frame
        benchPlaybackFrames++
      }
    }
  }
}
console.log(
  'bench · ' +
    benchSamples +
    ' posiciones · paso máximo en barra ' +
    (maxBenchBarStep * 1000).toFixed(2) +
    ' mm y codo ' +
    (maxBenchElbowStep * 1000).toFixed(2) +
    ' mm · ' +
    benchPlaybackFrames +
    ' cuadros reproducibles · paso máximo del codo durante la reproducción ' +
    (maxBenchPlaybackElbowStep * 1000).toFixed(2) +
    ' mm, al bloqueo ' +
    (maxBenchLockoutElbowStep * 1000).toFixed(2) +
    ' mm',
)
