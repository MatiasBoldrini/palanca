/**
 * The tappable parts of the drawing and the parameters behind each one.
 *
 * Every parameter is exposed through a range the solver has already agreed to:
 * `feasibleRange` walks outwards from the current value and stops at the first
 * setting whose pose does not exist. A control built on that range cannot ask
 * the model for a posture it would have to fake.
 */

import { heightFromSegments, type Anthropometry } from './anthropometry'
import { getStance, stanceWidthRange, TOE_OUT_RANGE } from './stance'
import { SQUAT_ELBOW_TURN } from './posture'
import { type Vec2, clamp } from './geometry'
import {
  type Coordination,
  type ExerciseId,
  type Frame,
  type Task,
  deadliftBarLimit,
  solveFrame,
} from './lift'

export type HotspotId =
  | 'bar'
  | 'knee'
  | 'spine'
  | 'hip'
  | 'cop'
  | 'foot'
  | 'shank'
  | 'thigh'
  | 'arm'
  | 'ankle'

export interface Hotspot {
  id: HotspotId
  /** Where the popover is anchored. */
  point: Vec2
  /**
   * Set for the ones that stand for a whole limb rather than a joint: the
   * points the limb is drawn through, so the hit area runs its length instead
   * of being a dot in the middle.
   */
  path?: Vec2[]
  label: string
  /** Filled in by the view: what this part currently reads, for the hover tag. */
  readout?: string
}

export type ParamId =
  | 'toeOutDeg'
  | 'stanceWidth'
  | 'squatElbowAngle'
  | 'progress'
  | 'load'
  | 'cop'
  | 'depth'
  | 'barPosition'
  | 'kneeTravel'
  | 'spineFlexion'
  | 'armLean'
  | 'barOffset'
  | 'foot'
  | 'shank'
  | 'thigh'
  | 'torso'
  | 'arm'
  | 'dorsiflexion'

export interface SetupPatch {
  task?: Partial<Task>
  coordination?: Partial<Coordination>
  anthro?: Partial<Anthropometry>
}

export interface Setup {
  exercise: ExerciseId
  anthro: Anthropometry
  task: Task
  coordination: Coordination
}

export interface Range {
  min: number
  max: number
}

const HOTSPOT_LABEL: Record<HotspotId, string> = {
  bar: 'Barra',
  knee: 'Rodilla',
  spine: 'Espalda',
  hip: 'Cadera',
  cop: 'Punto de apoyo',
  foot: 'Pie',
  shank: 'Tibia',
  thigh: 'Fémur',
  arm: 'Brazo',
  ankle: 'Tobillo',
}

/**
 * Everything the model takes as an input has a place on the drawing: the
 * joints carry the posture and the limbs carry the proportions of the person.
 *
 * Body mass and bar load are the exceptions: they change every number but
 * belong in the setup panel, not on a body popup.
 */
export function hotspotsFor(exercise: ExerciseId, frame: Frame, includeCop: boolean): Hotspot[] {
  const p = frame.posture
  const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

  // Foot length is not a hotspot: it barely changes the lesson and looked
  // oversized on the drawing even at the low end of its range.
  const limbs: Hotspot[] = [
    { id: 'shank', point: mid(p.ankle, p.knee), path: [p.ankle, p.knee] },
    { id: 'thigh', point: mid(p.knee, p.hip), path: [p.knee, p.hip] },
    { id: 'arm', point: p.elbow, path: [p.shoulder, p.elbow, p.hand] },
  ].map((h) => ({ ...h, label: HOTSPOT_LABEL[h.id as HotspotId] }) as Hotspot)

  // Deadlift bar position is solved from the support point — no bar hotspot.
  const joints: HotspotId[] =
    exercise === 'deadlift' ? ['knee', 'spine'] : ['bar', 'knee', 'spine', 'hip']
  if (includeCop) joints.push('cop')
  const jointPoint: Partial<Record<HotspotId, Vec2>> = {
    bar: p.bar,
    knee: p.knee,
    spine: p.thoracolumbar,
    hip: p.hip,
    cop: { x: frame.centreOfPressure, y: 0 },
  }

  // Limbs first so the joint markers, which are the smaller targets, end up on
  // top of them both visually and for hit testing.
  return [
    ...limbs,
    ...joints.map((id) => ({ id, point: jointPoint[id] as Vec2, label: HOTSPOT_LABEL[id] })),
  ]
}

/** The atlas also exposes load on the plates, foot length and ankle mobility. */
export function editableHotspotsFor(exercise: ExerciseId, frame: Frame): Hotspot[] {
  const spots = hotspotsFor(exercise, frame, true)
  const p = frame.posture
  function add(id: HotspotId, point: Vec2) {
    spots.push({ id, point, label: HOTSPOT_LABEL[id] })
  }
  if (exercise === 'deadlift') {
    add('bar', p.bar)
    add('hip', p.hip)
  }
  add('ankle', p.ankle)
  add('foot', { x: (p.heel.x + 3 * p.toe.x) / 4, y: p.toe.y })
  return spots
}

/** Outer bounds, before the solver gets a say. */
export const PARAM_LIMITS: Record<ParamId, Range> = {
  toeOutDeg: TOE_OUT_RANGE,
  squatElbowAngle: SQUAT_ELBOW_TURN,
  stanceWidth: { min: 0, max: 1.5 }, // Tightened to the available leg lengths below.
  progress: { min: 0, max: 1 },
  load: { min: 20, max: 400 },
  cop: { min: -0.06, max: 0.06 },
  depth: { min: 0, max: 1 },
  barPosition: { min: -0.06, max: 0.12 },
  kneeTravel: { min: 0, max: 1 },
  spineFlexion: { min: 0, max: 50 },
  // 15 deg already carries the shoulder some 18 cm in front of the bar, which
  // is well past anything a loaded pull holds.
  armLean: { min: 0, max: 15 },
  barOffset: { min: 0, max: 0.14 },
  foot: { min: 0.18, max: 0.35 },
  shank: { min: 0.3, max: 0.6 },
  thigh: { min: 0.3, max: 0.6 },
  torso: { min: 0.35, max: 0.65 },
  arm: { min: 0.45, max: 0.8 },
  dorsiflexion: { min: 10, max: 55 },
}

export function paramValue(id: ParamId, setup: Setup): number {
  switch (id) {
    case 'stanceWidth':
      return getStance(setup.exercise, setup.anthro, setup.coordination).width
    case 'toeOutDeg':
      return getStance(setup.exercise, setup.anthro, setup.coordination).toeOut
    case 'squatElbowAngle':
      return setup.coordination.squatElbowAngle ?? 0
    case 'progress':
      return setup.task.progress
    case 'load':
      return setup.task.load
    case 'cop':
      return setup.task.cop
    case 'depth':
      return setup.task.depth
    case 'barPosition':
      return setup.task.barPosition
    case 'kneeTravel':
      return setup.coordination.kneeTravel
    case 'spineFlexion':
      return setup.coordination.spineFlexion
    case 'armLean':
      return setup.coordination.armLean
    case 'barOffset':
      return setup.coordination.barOffset
    case 'dorsiflexion':
      return setup.anthro.maxDorsiflexion
    default:
      return setup.anthro[id]
  }
}

/**
 * Placing the bar and choosing where the pressure falls are the same decision
 * seen from two ends, so setting either one also claims that end as the input.
 */
export function patchFor(id: ParamId, value: number): SetupPatch {
  switch (id) {
    case 'stanceWidth':
    case 'toeOutDeg':
    case 'squatElbowAngle':
      return { coordination: { [id]: value } }
    case 'progress':
      return { task: { progress: value } }
    case 'load':
      return { task: { load: value } }
    case 'cop':
      return { task: { cop: value, balance: 'cop' } }
    case 'depth':
      return { task: { depth: value } }
    case 'barPosition':
      return { task: { barPosition: value, balance: 'bar' } }
    case 'kneeTravel':
      return { coordination: { kneeTravel: value } }
    case 'spineFlexion':
      return { coordination: { spineFlexion: value } }
    case 'armLean':
      return { coordination: { armLean: value } }
    case 'barOffset':
      return { coordination: { barOffset: value } }
    case 'dorsiflexion':
      return { anthro: { maxDorsiflexion: value } }
    default:
      return { anthro: { [id]: value } }
  }
}

export function withSetupPatch(setup: Setup, patch: SetupPatch): Setup {
  const anthro = patch.anthro ? { ...setup.anthro, ...patch.anthro } : setup.anthro
  if (patch.anthro) anthro.height = heightFromSegments(anthro)
  return {
    ...setup,
    anthro,
    task: patch.task ? { ...setup.task, ...patch.task } : setup.task,
    coordination: patch.coordination
      ? { ...setup.coordination, ...patch.coordination }
      : setup.coordination,
  }
}

function poseExists(setup: Setup, id: ParamId, value: number): boolean {
  const s = withSetupPatch(setup, patchFor(id, value))
  return solveFrame(s.exercise, s.anthro, s.task, s.coordination).feasible
}

/**
 * Outer bounds tightened by anything known in closed form, so the search does
 * not have to discover it. The shin is the case that matters: it is an exact
 * limit, and leaving it to the sampler would put a dead stretch at the bottom
 * of the bar-position control where the solver silently clamps.
 */
function outerBounds(id: ParamId, setup: Setup): Range {
  if (id === 'stanceWidth') return stanceWidthRange(setup.exercise, setup.anthro, setup.coordination.deadliftStyle)
  const base = PARAM_LIMITS[id]
  if (id !== 'barPosition' || setup.exercise !== 'deadlift') return base
  const shin = deadliftBarLimit(setup.anthro, setup.task, setup.coordination)
  return { min: clamp(shin, base.min, base.max), max: base.max }
}

/** Last value that still works, walking from a working `from` to a broken `to`. */
function edge(from: number, to: number, works: (v: number) => boolean): number {
  let good = from
  let bad = to
  for (let i = 0; i < 9; i++) {
    const mid = (good + bad) / 2
    if (works(mid)) good = mid
    else bad = mid
  }
  return good
}

/** Recover the closest reachable height after a change to body, load or exercise. */
export function nearestFeasibleProgress(setup: Setup): number | null {
  const here = clamp(setup.task.progress, 0, 1)
  const works = (value: number) => poseExists(setup, 'progress', value)
  if (works(here)) return here

  // Search on both sides before choosing an edge. This runs only when a setup
  // change invalidated the old height, never in a healthy playback loop.
  const samples = 100
  let previousLow = here
  let previousHigh = here
  for (let i = 1; i <= samples; i++) {
    const distance = i / samples
    const below = Math.max(0, here - distance)
    const above = Math.min(1, here + distance)
    const low = below < previousLow && works(below) ? edge(below, previousLow, works) : null
    const high = above > previousHigh && works(above) ? edge(above, previousHigh, works) : null
    if (low !== null && high !== null) return here - low <= high - here ? low : high
    if (low !== null || high !== null) return low ?? high
    previousLow = below
    previousHigh = above
  }
  return null
}

const STEPS = 10

/**
 * The stretch of a parameter that the current setup can actually reach: the
 * run of feasible values containing where it sits now. It deliberately does
 * not depend on the parameter's own value beyond picking that run, so sliding
 * the control does not move its own end stops.
 */
export function feasibleRange(id: ParamId, setup: Setup): Range {
  const bounds = outerBounds(id, setup)
  if (bounds.max - bounds.min < 1e-9) return bounds

  const works = (v: number) => poseExists(setup, id, v)
  let here = clamp(paramValue(id, setup), bounds.min, bounds.max)
  if (!works(here)) {
    // Keep the body controls available to recover from an impossible setup.
    if (id !== 'progress') return bounds
    const recovery = nearestFeasibleProgress(setup)
    if (recovery === null) return { min: here, max: here }
    here = recovery
  }

  const step = (bounds.max - bounds.min) / STEPS
  const walk = (direction: 1 | -1, stop: number): number => {
    let last = here
    for (let i = 1; i <= STEPS; i++) {
      const next = direction > 0 ? Math.min(here + i * step, stop) : Math.max(here - i * step, stop)
      if (!works(next)) return edge(last, next, works)
      last = next
      if (next === stop) break
    }
    return stop
  }

  return { min: walk(-1, bounds.min), max: walk(1, bounds.max) }
}
