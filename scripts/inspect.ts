import type { Anthropometry } from '../src/model/anthropometry'
import { anthropometryFromHeight } from '../src/model/anthropometry'
import { DEFAULT_TASK, simulateSeries, solveDeadlift, solveSquat } from '../src/model/lift'

const EDINGTON: Anthropometry = {
  height: 1.725,
  mass: 88.7,
  foot: 0.152 * 1.725,
  shank: 0.41,
  thigh: 0.384,
  torso: 0.427,
  arm: 0.523,
  maxDorsiflexion: 38,
}

const cm = (v: number) => (v * 100).toFixed(1)
const one = (v: number) => v.toFixed(1)

function dumpDeadlift(label: string, kneeTravel: number) {
  const task = { ...DEFAULT_TASK, load: 180, progress: 0 }
  const f = solveDeadlift(EDINGTON, task, { kneeTravel, spineFlexion: 12, barOffset: 0 })
  console.log(`\n== deadlift ${label} ==`)
  console.log(
    'ankle', cm(f.posture.ankle.x), 'knee', cm(f.posture.knee.x),
    'hip', cm(f.posture.hip.x), '/', cm(f.posture.hip.y),
    'shoulder', cm(f.posture.shoulder.x), 'bar', cm(f.posture.bar.x),
  )
  console.log(
    'tibia', one(f.angles.tibia), 'kneeFlex', one(f.angles.kneeFlexion),
    'hipFlex', one(f.angles.hipFlexion), 'trunk', one(f.angles.trunk),
  )
  console.log(
    'M hip', one(f.kinetics.moment.hip), 'M knee', one(f.kinetics.moment.knee),
    'M ankle', one(f.kinetics.moment.ankle), 'M l5s1', one(f.kinetics.moment.l5s1),
  )
  console.log(
    'hip arm', cm(-f.kinetics.barMomentArm.hip), 'com', cm(f.kinetics.com.x),
    'compression N', one(f.kinetics.lumbarCompression),
  )
  console.log('warnings', f.warnings)
}

dumpDeadlift('close bar', 0)
dumpDeadlift('far bar', 1)

const a = anthropometryFromHeight(1.75, 85)
for (const [label, coord] of [
  ['high bar', { kneeTravel: 0.8, spineFlexion: 6, barOffset: 0 }],
  ['low bar', { kneeTravel: 0.2, spineFlexion: 6, barOffset: 0.08 }],
] as const) {
  const task = { ...DEFAULT_TASK, load: 150, progress: 0, depth: 0.55 }
  const f = solveSquat(a, task, coord)
  console.log(`\n== squat ${label} (bottom) ==`)
  console.log(
    'knee', cm(f.posture.knee.x), 'hip', cm(f.posture.hip.x), '/', cm(f.posture.hip.y),
    'shoulder', cm(f.posture.shoulder.x), 'bar', cm(f.posture.bar.x), '/', cm(f.posture.bar.y),
  )
  console.log(
    'tibia', one(f.angles.tibia), 'kneeFlex', one(f.angles.kneeFlexion),
    'hipFlex', one(f.angles.hipFlexion), 'trunk', one(f.angles.trunk),
  )
  console.log(
    'M hip', one(f.kinetics.moment.hip), 'M knee', one(f.kinetics.moment.knee),
    'dominance', f.kinetics.kneeDominance.toFixed(2),
  )
  console.log('warnings', f.warnings)
}

const lowBar = { kneeTravel: 0.25, spineFlexion: 8, barOffset: 0.085 }
const squatTask = { ...DEFAULT_TASK, load: 150, depth: 0.5 }
const series = simulateSeries('squat', a, squatTask, lowBar)
console.log('\n== squat ascent profile ==')
console.log('peak hip', one(series.peak.hip), 'at progress', series.peakHipProgress.toFixed(2))
for (const p of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
  const f = solveSquat(a, { ...squatTask, progress: p }, lowBar)
  console.log(
    `p=${p.toFixed(1)}`,
    'tibia', one(f.tibiaAngle),
    'trunk', one(f.angles.trunk),
    'hipX', cm(f.posture.hip.x),
    'M hip', one(f.kinetics.moment.hip),
    'M knee', one(f.kinetics.moment.knee),
  )
}

const dlSeries = simulateSeries('deadlift', EDINGTON, { ...DEFAULT_TASK, load: 180 }, {
  kneeTravel: 0, spineFlexion: 12, barOffset: 0,
})
console.log('\n== deadlift sticking point ==')
console.log('peak hip', one(dlSeries.peak.hip), 'at progress', dlSeries.peakHipProgress.toFixed(2))
