import { clamp, deg, lerp } from './geometry'
import {
  feasibleRange,
  paramValue,
  patchFor,
  withSetupPatch,
  type HotspotId,
  type ParamId,
  type Setup,
  type SetupPatch,
} from './interact'
import { solveFrame, type Frame } from './lift'

type Kind = 'rotation' | 'position' | 'length' | 'other'
type Unit = '°' | 'cm' | 'kg' | '%'

export interface StandingPartControl {
  id: string
  kind: Kind
  label: string
  unit: Unit
  min: number
  max: number
  step: number
  value: number
  patch: (value: number) => SetupPatch
}

const hipHeight = (f: Frame) => f.posture.hip.y * 100
const barHeight = (f: Frame) => f.barHeight * 100
const thighAngle = (f: Frame) =>
  deg(Math.atan2(f.posture.hip.y - f.posture.knee.y, f.posture.knee.x - f.posture.hip.x))
const forwardShin = (f: Frame) => f.angles.tibia
const lateralShin = (f: Frame) =>
  deg(Math.atan2(f.stance.kneeHalf - f.stance.ankleHalf, f.posture.knee.y - f.posture.ankle.y))

/** All positions refer to named landmarks and all editable quantities go back through the lift solver.
 * Values expressed in centimetres or degrees here are also the units accepted by patch(). */
export function standingPartControls(part: HotspotId, setup: Setup): StandingPartControl[] {
  const controls: StandingPartControl[] = []
  const deadlift = setup.exercise === 'deadlift'
  function direct(id: ParamId, kind: Kind, label: string, unit: Unit, scale = 1, step = 0.5) {
    const range = feasibleRange(id, setup)
    controls.push({
      id,
      kind,
      label,
      unit,
      step,
      value: paramValue(id, setup) * scale,
      min: range.min * scale,
      max: range.max * scale,
      patch: (v) => patchFor(id, clamp(v / scale, range.min, range.max)),
    })
  }

  // Sampling the reachable branch accounts for the ground, fixed grip and closed chains.
  // Invert the measured quantity within the nearest pair of samples so the gesture moves
  // a real landmark, even when e.g. hip height is nonlinear in bar travel.
  function measured(
    id: string,
    driver: ParamId,
    kind: Kind,
    label: string,
    unit: Unit,
    read: (frame: Frame) => number,
  ): boolean {
    const { min, max } = feasibleRange(driver, setup)
    const here = paramValue(driver, setup)
    const sample = (input: number) => {
      const s = withSetupPatch(setup, patchFor(driver, input))
      const frame = solveFrame(s.exercise, s.anthro, s.task, s.coordination)
      return { input, value: read(frame), feasible: frame.feasible }
    }
    const current = sample(here)
    if (!current.feasible) return false
    const walk = (end: number) => {
      if (here === end) return []
      const points = []
      for (let i = 1; i <= 6; i++) {
        const point = sample(lerp(here, end, i / 6))
        if (!point.feasible) break
        points.push(point)
      }
      return points
    }
    const samples = [...walk(min).reverse(), current, ...walk(max)]
    const low = Math.min(...samples.map((p) => p.value))
    const high = Math.max(...samples.map((p) => p.value))
    if (high - low < 0.5) return false
    controls.push({
      id,
      kind,
      label: driver === 'progress' ? label + ' en el recorrido' : label,
      unit,
      value: current.value,
      min: low,
      max: high,
      step: 0.5,
      patch(value) {
        const target = clamp(value, low, high)
        if (Math.abs(target - current.value) < 1e-6) return {}
        // Prefer an adjacent solution when a segment briefly reverses direction.
        let span: [typeof current, typeof current] | undefined
        let closest = Infinity
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1],
            b = samples[i]
          if ((a.value - target) * (b.value - target) > 0) continue
          const distance = Math.min(Math.abs(a.input - here), Math.abs(b.input - here))
          if (distance < closest) {
            span = [a, b]
            closest = distance
          }
        }
        if (!span) return {}
        let [a, b] = span
        for (let i = 0; i < 14; i++) {
          const middle = sample((a.input + b.input) / 2)
          if (!middle.feasible) break
          if ((a.value - target) * (middle.value - target) <= 0) b = middle
          else a = middle
        }
        return patchFor(
          driver,
          Math.abs(a.value - target) < Math.abs(b.value - target) ? a.input : b.input,
        )
      },
    })
    return true
  }
  const legPosition = () =>
    direct('stanceWidth', 'position', 'Separación entre los pies', 'cm', 100)
  const shinAngle = () => {
    if (
      !measured('shinPitch', 'kneeTravel', 'rotation', 'Tibia hacia adelante', '°', forwardShin)
    ) {
      // Knee travel has no effect at lockout. The leg can still tilt in the frontal plane.
      measured(
        'shinRoll',
        'stanceWidth',
        'rotation',
        'Inclinación lateral de la tibia',
        '°',
        lateralShin,
      )
    }
  }
  function atCurrentPhase(
    id: string,
    drivers: ParamId[],
    kind: Kind,
    label: string,
    unit: Unit,
    read: (f: Frame) => number,
  ) {
    for (const driver of drivers) {
      if (measured(id, driver, kind, label, unit, read)) return
    }
    measured(id, 'progress', kind, label, unit, read)
  }
  switch (part) {
    case 'shank':
      shinAngle()
      measured(
        'shankSide',
        'stanceWidth',
        'position',
        'Distancia de la tibia a la línea media',
        'cm',
        (f) => 50 * (f.stance.ankleHalf + f.stance.kneeHalf),
      )
      direct('shank', 'length', 'Largo de la tibia', 'cm', 100)
      break
    case 'thigh':
      atCurrentPhase(
        'thighPitch',
        deadlift ? ['kneeTravel', 'cop'] : ['depth', 'kneeTravel'],
        'rotation',
        'Fémur respecto al suelo',
        '°',
        thighAngle,
      )
      measured(
        'thighSide',
        'stanceWidth',
        'position',
        'Distancia del muslo a la línea media',
        'cm',
        (f) => 50 * (f.stance.hipHalf + f.stance.kneeHalf),
      )
      direct('thigh', 'length', 'Largo del fémur', 'cm', 100)
      break
    case 'spine':
      atCurrentPhase(
        'trunkPitch',
        ['cop', 'kneeTravel'],
        'rotation',
        'Tronco respecto a la vertical',
        '°',
        (f) => 90 - f.angles.trunk,
      )
      measured(
        'shoulderHeight',
        'progress',
        'position',
        'Altura del hombro',
        'cm',
        (f) => f.posture.shoulder.y * 100,
      )
      direct('torso', 'length', 'Largo del torso', 'cm', 100)
      direct('spineFlexion', 'other', 'Flexión de la espalda', '°')
      break
    case 'arm':
      if (deadlift) direct('armLean', 'rotation', 'Brazo respecto a la vertical', '°')
      else direct('squatElbowAngle', 'rotation', 'Giro del codo sobre el agarre', '°')
      measured('handHeight', 'progress', 'position', 'Altura de la mano', 'cm', barHeight)
      direct('arm', 'length', 'Largo del brazo', 'cm', 100)
      break
    case 'foot':
      direct('toeOutDeg', 'rotation', 'Puntas hacia afuera', '°')
      legPosition()
      direct('foot', 'length', 'Largo del pie', 'cm', 100)
      break
    case 'ankle':
      shinAngle()
      measured(
        'ankleSpacing',
        'stanceWidth',
        'position',
        'Separación entre los tobillos',
        'cm',
        (f) => f.stance.ankleHalf * 200,
      )
      direct('dorsiflexion', 'other', 'Dorsiflexión disponible', '°')
      break
    case 'knee':
      atCurrentPhase(
        'kneeBend',
        deadlift ? ['kneeTravel'] : ['kneeTravel', 'depth'],
        'rotation',
        'Flexión de rodilla',
        '°',
        (f) => f.angles.kneeFlexion,
      )
      measured(
        'kneeSide',
        'stanceWidth',
        'position',
        'Separación entre las rodillas',
        'cm',
        (f) => f.stance.kneeHalf * 200,
      )
      break
    case 'hip':
      atCurrentPhase(
        'hipBend',
        ['cop', 'kneeTravel'],
        'rotation',
        'Flexión de cadera',
        '°',
        (f) => f.angles.hipFlexion,
      )
      atCurrentPhase(
        'hipHeight',
        deadlift ? ['kneeTravel'] : ['depth'],
        'position',
        'Altura de la cadera',
        'cm',
        hipHeight,
      )
      if (!deadlift) direct('depth', 'other', 'Profundidad en el fondo', '%', 100, 1)
      break
    case 'bar':
      measured('barHeight', 'progress', 'position', 'Altura de la barra', 'cm', barHeight)
      if (!deadlift)
        direct('barOffset', 'position', 'Distancia al hombro sobre la espalda', 'cm', 100)
      direct('load', 'other', 'Carga de la barra', 'kg', 1, 2.5)
      break
    case 'cop':
      measured(
        'cop',
        'cop',
        'position',
        'Apoyo respecto al mediopié',
        'cm',
        (f) => f.centreOfPressure * 100,
      )
      break
  }
  return controls
}
