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
import type { SetupPatch } from '../model/interact'
import {
  type BalanceMode,
  type Coordination,
  DEFAULT_TASK,
  type ExerciseId,
  type Task,
} from '../model/lift'
import { DEADLIFT_PRESETS, SQUAT_PRESETS } from './presets'

export interface AppState {
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
  exercise: 'deadlift',
  anthro: DEFAULT_ANTHROPOMETRY,
  task: DEFAULT_TASK,
  coordination: {
    deadlift: { ...DEADLIFT_PRESETS[0].coordination },
    squat: { ...SQUAT_PRESETS[0].coordination },
  },
  playing: false,
  showComGuides: true,
  showMomentArms: false,
  showLoadMap: true,
  showCurves: true,
}

export type ViewFlag = 'showComGuides' | 'showMomentArms' | 'showLoadMap' | 'showCurves'

export type Action =
  | { type: 'setExercise'; exercise: ExerciseId }
  | { type: 'setTask'; patch: Partial<Task> }
  | { type: 'setAnthro'; patch: Partial<Anthropometry> }
  | { type: 'resetProportions' }
  | { type: 'setCoordination'; patch: Partial<Coordination> }
  | { type: 'setParams'; patch: SetupPatch }
  | { type: 'setBalance'; balance: BalanceMode }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'toggle'; key: ViewFlag }
  | { type: 'hydrate'; state: Partial<AppState> }
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

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setExercise':
      return { ...state, exercise: action.exercise, task: { ...state.task, progress: 0 } }
    case 'setTask':
      return { ...state, task: { ...state.task, ...action.patch } }
    case 'setAnthro':
      return { ...state, anthro: withDerivedHeight({ ...state.anthro, ...action.patch }) }
    case 'resetProportions': {
      // Back to the table's proportions for the height the segments currently
      // imply, keeping the mass and mobility the user set.
      const scaled = anthropometryFromHeight(heightFromSegments(state.anthro), state.anthro.mass)
      return {
        ...state,
        anthro: { ...scaled, maxDorsiflexion: state.anthro.maxDorsiflexion },
      }
    }
    case 'setCoordination':
      return withCoordination(state, action.patch)
    case 'setParams': {
      // Body, task and coordination land in one dispatch, so the figure never
      // renders a pose that is half old and half new.
      let next = state
      if (action.patch.anthro) {
        next = { ...next, anthro: withDerivedHeight({ ...next.anthro, ...action.patch.anthro }) }
      }
      if (action.patch.task) {
        next = { ...next, task: { ...next.task, ...action.patch.task } }
      }
      return action.patch.coordination
        ? withCoordination(next, action.patch.coordination)
        : next
    }
    case 'setBalance':
      return { ...state, task: { ...state.task, balance: action.balance } }
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
    e: state.exercise === 'deadlift' ? 0 : 1,
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
    c: [round(c.kneeTravel), round(c.spineFlexion, 1), round(c.barOffset)],
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
    const exercise: ExerciseId = p.e === 1 ? 'squat' : 'deadlift'
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
    return {
      exercise,
      anthro,
      task: {
        ...DEFAULT_TASK,
        load: p.ld,
        progress: p.pr,
        depth: p.dp,
        cop: p.cp,
        balance: p.bl === 1 ? 'bar' : 'cop',
        barPosition: p.bp,
      },
      coordination: {
        ...initialState.coordination,
        [exercise]: { kneeTravel: p.c[0], spineFlexion: p.c[1], barOffset: p.c[2] },
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
    if (fromUrl) return { ...initialState, ...fromUrl }
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = decode(stored)
      if (parsed) return { ...initialState, ...parsed }
    }
  } catch {
    /* storage unavailable */
  }
  return initialState
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial)

  useEffect(() => {
    const encoded = encode(state)
    const timer = window.setTimeout(() => {
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

export function useShareLink(): () => Promise<boolean> {
  const { state } = useApp()
  return useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#s=${encode(state)}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Palanca', url })
        return true
      }
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      return false
    }
  }, [state])
}
