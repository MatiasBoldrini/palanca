/**
 * The tappable parts of the drawing and the parameters behind each one.
 *
 * Every parameter is exposed through a range the solver has already agreed to:
 * `feasibleRange` walks outwards from the current value and stops at the first
 * setting whose pose does not exist. A control built on that range cannot ask
 * the model for a posture it would have to fake.
 */

import type { Anthropometry } from './anthropometry'
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
  | 'progress'
  | 'load'
  | 'cop'
  | 'depth'
  | 'barPosition'
  | 'kneeTravel'
  | 'spineFlexion'
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
}

/**
 * Everything the model takes as an input has a place on the drawing: the
 * joints carry the posture and the limbs carry the proportions of the person.
 *
 * Body mass is the exception. It changes every number but has nowhere on a
 * stick figure it could honestly be grabbed, so it stays in the setup panel.
 */
export function hotspotsFor(exercise: ExerciseId, frame: Frame, includeCop: boolean): Hotspot[] {
  const p = frame.posture
  const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

  const limbs: Hotspot[] = [
    // Matches the drawn foot: sole on the ground, stem up to the ankle. The
    // old heel→ankle→toe path was a chevron that no longer exists on screen.
    {
      id: 'foot',
      point: mid(p.heel, p.toe),
      path: [p.heel, { x: p.ankle.x, y: p.heel.y }, p.ankle, { x: p.ankle.x, y: p.heel.y }, p.toe],
    },
    { id: 'shank', point: mid(p.ankle, p.knee), path: [p.ankle, p.knee] },
    { id: 'thigh', point: mid(p.knee, p.hip), path: [p.knee, p.hip] },
    { id: 'arm', point: p.elbow, path: [p.shoulder, p.elbow, p.hand] },
  ].map((h) => ({ ...h, label: HOTSPOT_LABEL[h.id as HotspotId] }) as Hotspot)

  const joints: HotspotId[] =
    exercise === 'deadlift' ? ['bar', 'knee', 'spine'] : ['bar', 'knee', 'spine', 'hip']
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

/**
 * Which parameters each part of the drawing stands for, in display order.
 *
 * Height along the lift is deliberately absent from the bar: the transport
 * scrubber is already that control, sitting right below the drawing, and these
 * lists have to stay short enough to float beside a joint.
 */
export function paramsFor(hotspot: HotspotId, exercise: ExerciseId): ParamId[] {
  switch (hotspot) {
    case 'bar':
      return exercise === 'deadlift' ? ['load', 'barPosition'] : ['load', 'barOffset']
    case 'knee':
      return ['kneeTravel']
    case 'spine':
      return ['spineFlexion', 'torso']
    case 'hip':
      return ['depth']
    case 'cop':
      return ['cop']
    case 'foot':
      return ['foot', 'dorsiflexion']
    case 'shank':
      return ['shank']
    case 'thigh':
      return ['thigh']
    case 'arm':
      return ['arm']
  }
}

/** Outer bounds, before the solver gets a say. */
const PARAM_LIMITS: Record<ParamId, Range> = {
  progress: { min: 0, max: 1 },
  load: { min: 20, max: 400 },
  cop: { min: -0.06, max: 0.06 },
  depth: { min: 0, max: 1 },
  barPosition: { min: -0.06, max: 0.12 },
  kneeTravel: { min: 0, max: 1 },
  spineFlexion: { min: 0, max: 50 },
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
    case 'barOffset':
      return { coordination: { barOffset: value } }
    case 'dorsiflexion':
      return { anthro: { maxDorsiflexion: value } }
    default:
      return { anthro: { [id]: value } }
  }
}

function withPatch(setup: Setup, patch: SetupPatch): Setup {
  return {
    ...setup,
    anthro: patch.anthro ? { ...setup.anthro, ...patch.anthro } : setup.anthro,
    task: patch.task ? { ...setup.task, ...patch.task } : setup.task,
    coordination: patch.coordination
      ? { ...setup.coordination, ...patch.coordination }
      : setup.coordination,
  }
}

function poseExists(setup: Setup, id: ParamId, value: number): boolean {
  const s = withPatch(setup, patchFor(id, value))
  return solveFrame(s.exercise, s.anthro, s.task, s.coordination).feasible
}

/**
 * Outer bounds tightened by anything known in closed form, so the search does
 * not have to discover it. The shin is the case that matters: it is an exact
 * limit, and leaving it to the sampler would put a dead stretch at the bottom
 * of the bar-position control where the solver silently clamps.
 */
function outerBounds(id: ParamId, setup: Setup): Range {
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
  const here = clamp(paramValue(id, setup), bounds.min, bounds.max)
  // A setup that is already impossible would otherwise freeze every control.
  if (!works(here)) return bounds

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
