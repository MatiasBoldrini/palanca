import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import {
  type Anthropometry,
  DEFAULT_ANTHROPOMETRY,
  anthropometryFromHeight,
  heightFromSegments,
} from '../model/anthropometry'
import { nearestFeasibleProgress, type SetupPatch } from '../model/interact'
import { type Coordination, DEFAULT_TASK, type ExerciseId, type Task } from '../model/lift'
import type { MechanicsView } from '../model/mechanicsOverlay'
import { BENCH_GRIP, type BenchJointId } from '../model/bench'
import { DEADLIFT_PRESETS, SQUAT_PRESETS } from './presets'

export type LiftId = ExerciseId | 'bench'
interface BenchSettings {
  progress: number
  gripRatio: number
  joint: BenchJointId | 'all'
}

export interface AppState {
  benchActive: boolean
  bench: BenchSettings
  mechanics: MechanicsView
  exercise: ExerciseId
  anthro: Anthropometry
  task: Task
  coordination: Record<ExerciseId, Coordination>
  playing: boolean
  showComGuides: boolean
  showMomentArms: boolean
  showLoadMap: boolean
  showCurves: boolean
}

const initialState: AppState = {
  benchActive: false,
  bench: { progress: 1, gripRatio: 1.5, joint: 'shoulder' },
  mechanics: {
    focus: 'all',
    forces: true,
    loadPath: true,
    moments: true,
    lever: true,
    joint: 'hip',
  },
  exercise: 'deadlift',
  anthro: DEFAULT_ANTHROPOMETRY,
  task: DEFAULT_TASK,
  coordination: {
    deadlift: { ...DEADLIFT_PRESETS[0].coordination },
    squat: { ...SQUAT_PRESETS[0].coordination },
  },
  playing: false,
  showComGuides: true,
  showMomentArms: true,
  showLoadMap: true,
  showCurves: true,
}

export type ViewFlag = 'showComGuides' | 'showMomentArms' | 'showLoadMap' | 'showCurves'

export type Action =
  | { type: 'setExercise'; exercise: LiftId }
  | { type: 'setTask'; patch: Partial<Task> }
  | { type: 'setAnthro'; patch: Partial<Anthropometry> }
  | { type: 'resetProportions' }
  | { type: 'setCoordination'; patch: Partial<Coordination> }
  | { type: 'setParams'; patch: SetupPatch }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'toggle'; key: ViewFlag }
  | { type: 'hydrate'; state: Partial<AppState> }
  | { type: 'setMechanics'; patch: Partial<MechanicsView> }
  | { type: 'setBench'; patch: Partial<BenchSettings> }
  | { type: 'reset' }

/** Height follows the segments, so it can never contradict them. */
const withDerivedHeight = (anthro: Anthropometry): Anthropometry => ({
  ...anthro,
  height: heightFromSegments(anthro),
})

function withCoordination(state: AppState, patch: Partial<Coordination>): AppState {
  return {
    ...state,
    coordination: {
      ...state.coordination,
      [state.exercise]: { ...state.coordination[state.exercise], ...patch },
    },
  }
}

function alignProgress(state: AppState): AppState {
  if (state.benchActive) return state
  const progress = nearestFeasibleProgress({
    exercise: state.exercise,
    task: state.task,
    anthro: state.anthro,
    coordination: state.coordination[state.exercise],
  })
  if (progress === null || progress === state.task.progress) return state
  return { ...state, task: { ...state.task, progress } }
}

function reduceState(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setExercise':
      if (action.exercise === 'bench') return { ...state, benchActive: true, playing: false }
      if (!state.benchActive && state.exercise === action.exercise) return state
      return {
        ...state,
        benchActive: false,
        exercise: action.exercise,
        playing: false,
        task: { ...state.task, progress: action.exercise === 'squat' ? 1 : 0 },
      }
    case 'setTask':
      return {
        ...state,
        playing: state.playing && Object.keys(action.patch).every((key) => key === 'progress'),
        task: { ...state.task, ...action.patch, balance: 'cop' },
      }
    case 'setAnthro':
      return {
        ...state,
        playing: false,
        anthro: withDerivedHeight({ ...state.anthro, ...action.patch }),
      }
    case 'resetProportions': {
      // Back to the table's proportions for the height the segments currently
      // imply, keeping the mass and mobility the user set.
      const scaled = anthropometryFromHeight(heightFromSegments(state.anthro), state.anthro.mass)
      return {
        ...state,
        playing: false,
        anthro: { ...scaled, maxDorsiflexion: state.anthro.maxDorsiflexion },
      }
    }
    case 'setCoordination':
      return withCoordination({ ...state, playing: false }, action.patch)
    case 'setParams': {
      // Body, task and coordination land in one dispatch, so the figure never
      // renders a pose that is half old and half new.
      let next = { ...state, playing: false }
      if (action.patch.anthro) {
        next = { ...next, anthro: withDerivedHeight({ ...next.anthro, ...action.patch.anthro }) }
      }
      if (action.patch.task) {
        next = { ...next, task: { ...next.task, ...action.patch.task, balance: 'cop' } }
      }
      return action.patch.coordination ? withCoordination(next, action.patch.coordination) : next
    }
    case 'setMechanics':
      return { ...state, mechanics: { ...state.mechanics, ...action.patch } }
    case 'setBench':
      return {
        ...state,
        bench: { ...state.bench, ...action.patch },
        playing: state.playing && action.patch.gripRatio === undefined,
      }
    case 'setPlaying':
      return { ...state, playing: action.playing }
    case 'toggle':
      return { ...state, [action.key]: !state[action.key] }
    case 'hydrate':
      return { ...state, ...action.state, playing: false }
    case 'reset':
      return initialState
    default:
      return state
  }
}

function reducer(state: AppState, action: Action): AppState {
  const next = reduceState(state, action)
  if (
    state === next ||
    action.type === 'setPlaying' ||
    action.type === 'toggle' ||
    action.type === 'setMechanics' ||
    action.type === 'setBench'
  )
    return next
  // Scrubbing and RAF updates already use the current feasible range.
  if (action.type === 'setTask' && Object.keys(action.patch).every((key) => key === 'progress')) {
    return next
  }
  return alignProgress(next)
}

interface Store {
  state: AppState
  dispatch: (action: Action) => void
  coordination: Coordination
}

const StateContext = createContext<Store | null>(null)

const round = (v: number, digits = 3) => Number(v.toFixed(digits))

function encode(state: AppState): string {
  const c = state.coordination[state.exercise]
  const payload = {
    e: state.benchActive ? 2 : state.exercise === 'deadlift' ? 0 : 1,
    standing: state.exercise,
    stance: {
      deadlift: state.coordination.deadlift.stanceWidth,
      squat: state.coordination.squat.stanceWidth,
      style: state.coordination.deadlift.deadliftStyle,
    },
    b: [round(state.bench.progress), round(state.bench.gripRatio), state.bench.joint],
    m: state.mechanics,
    h: round(state.anthro.height),
    w: round(state.anthro.mass, 1),
    sg: round(state.anthro.shank),
    tg: round(state.anthro.thigh),
    tr: round(state.anthro.torso),
    ar: round(state.anthro.arm),
    ft: round(state.anthro.foot),
    df: round(state.anthro.maxDorsiflexion, 1),
    ld: round(state.task.load, 1),
    pr: round(state.task.progress),
    dp: round(state.task.depth),
    cp: round(state.task.cop),
    bl: state.task.balance === 'cop' ? 0 : 1,
    bp: round(state.task.barPosition),
    c: [round(c.kneeTravel), round(c.spineFlexion, 1), round(c.barOffset), round(c.armLean, 1)],
    v: [
      state.showComGuides ? 1 : 0,
      state.showMomentArms ? 1 : 0,
      state.showLoadMap ? 1 : 0,
      state.showCurves ? 1 : 0,
    ],
  }
  return btoa(encodeURIComponent(JSON.stringify(payload)))
}

function decode(hash: string): Partial<AppState> | null {
  try {
    const p = JSON.parse(decodeURIComponent(atob(hash)))
    const exercise: ExerciseId =
      p.e === 1 || (p.e === 2 && p.standing === 'squat') ? 'squat' : 'deadlift'
    const anthro: Anthropometry = {
      height: p.h,
      mass: p.w,
      foot: p.ft,
      shank: p.sg,
      thigh: p.tg,
      torso: p.tr,
      arm: p.ar,
      maxDorsiflexion: p.df,
    }
    const savedStance = p.stance ?? {}
    const savedWidth = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
    const stanceByExercise = {
      deadlift: {
        stanceWidth: savedWidth(savedStance.deadlift),
        deadliftStyle: savedStance.style === 'sumo' ? ('sumo' as const) : ('conventional' as const),
      },
      squat: { stanceWidth: savedWidth(savedStance.squat) },
    }
    const mechanics = p.m ?? {}
    const bench = Array.isArray(p.b) ? p.b : []
    return {
      benchActive: p.e === 2,
      bench: {
        progress: Number.isFinite(bench[0])
          ? Math.max(0, Math.min(1, bench[0]))
          : initialState.bench.progress,
        gripRatio: Number.isFinite(bench[1])
          ? Math.max(BENCH_GRIP.min, Math.min(BENCH_GRIP.max, bench[1]))
          : initialState.bench.gripRatio,
        joint: ['shoulder', 'elbow', 'wrist'].includes(bench[2]) ? bench[2] : 'all',
      },
      mechanics: {
        focus: ['bar', 'body', 'support'].includes(mechanics.focus) ? mechanics.focus : 'all',
        forces: mechanics.forces !== false,
        loadPath: mechanics.loadPath !== false,
        moments: mechanics.moments !== false,
        lever: mechanics.lever !== false,
        joint: ['l5s1', 'hip', 'knee', 'ankle'].includes(mechanics.joint) ? mechanics.joint : 'all',
      },
      exercise,
      anthro,
      task: {
        ...DEFAULT_TASK,
        load: p.ld,
        progress: p.pr,
        depth: p.dp,
        cop: p.cp,
        // Older links could pin the bar; the UI only offers support-point mode.
        balance: 'cop',
        barPosition: p.bp,
      },
      coordination: {
        deadlift: { ...initialState.coordination.deadlift, ...stanceByExercise.deadlift },
        squat: { ...initialState.coordination.squat, ...stanceByExercise.squat },
        [exercise]: {
          ...stanceByExercise[exercise],
          kneeTravel: p.c[0],
          spineFlexion: p.c[1],
          barOffset: p.c[2],
          // Older links predate the arm lean, and they were all drawn with the
          // arm vertical.
          armLean: p.c[3] ?? 0,
        },
      },
      showComGuides: p.v[0] === 1,
      showMomentArms: p.v[1] === 1,
      showLoadMap: p.v[2] === 1,
      // Older links predate this flag; the strip is on by default.
      showCurves: p.v[3] !== 0,
    }
  } catch {
    return null
  }
}

const STORAGE_KEY = 'palanca.state.v2'

function loadInitial(): AppState {
  if (typeof window === 'undefined') return initialState
  const hash = window.location.hash.replace(/^#s=/, '')
  if (hash) {
    const fromUrl = decode(hash)
    if (fromUrl) return alignProgress({ ...initialState, ...fromUrl })
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = decode(stored)
      if (parsed) return alignProgress({ ...initialState, ...parsed })
    }
  } catch {
    /* storage unavailable */
  }
  return initialState
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial)

  useEffect(() => {
    // Keep serialization and history writes off the frame loop.
    if (state.playing) return
    const timer = window.setTimeout(() => {
      const encoded = encode(state)
      try {
        window.localStorage.setItem(STORAGE_KEY, encoded)
      } catch {
        /* storage unavailable */
      }
      window.history.replaceState(null, '', `#s=${encoded}`)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [state])

  const value = useMemo<Store>(
    () => ({ state, dispatch, coordination: state.coordination[state.exercise] }),
    [state],
  )

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>
}

export function useApp(): Store {
  const store = useContext(StateContext)
  if (!store) throw new Error('useApp must be used inside AppStateProvider')
  return store
}

export function useShareLink() {
  const { state } = useApp()
  const url = useMemo(() => {
    const link = new URL(window.location.href)
    link.hash = 's=' + encode(state)
    return link.href
  }, [state])

  const share = useCallback(async (): Promise<'shared' | 'copied' | 'manual' | 'cancelled'> => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Palanca', url })
        return 'shared'
      } catch (error) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
          return 'cancelled'
        }
      }
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        return 'copied'
      }
    } catch {
      // Browsers may expose the clipboard and still deny this page access.
    }
    return 'manual'
  }, [url])
  return { url, share }
}
