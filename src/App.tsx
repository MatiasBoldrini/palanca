import { AnimatePresence, motion } from 'motion/react'
import { Settings, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Figure } from './components/Figure'
import {
  BodyPanel,
  ModelNotes,
  PatternPanel,
  TaskPanel,
  ViewPanel,
} from './components/ControlPanel'
import { Inspector } from './components/Inspector'
import { MetricsTable, WorkReadout, buildRows } from './components/Metrics'
import { MomentPanel } from './components/MomentPanel'
import { Collapsible, Segmented } from './components/ui'
import { useMediaQuery } from './hooks/useMediaQuery'
import { usePlayback, useSpringSnapshot } from './hooks/useAnimationEngine'
import { clamp } from './model/geometry'
import {
  type HotspotId,
  type ParamId,
  type Setup,
  feasibleRange,
  hotspotsFor,
  paramValue,
  paramsFor,
  patchFor,
} from './model/interact'
import { formatParam } from './components/params'
import type { Coordination, Task } from './model/lift'
import { frameBounds, simulateSeries, solveFrame } from './model/lift'
import type { Anthropometry } from './model/anthropometry'
import { AppStateProvider, useApp, useShareLink } from './state/appState'
import { EXERCISE_META } from './state/presets'
import './styles/base.css'
import './styles/app.css'

/** The one hue: the bar, the things you can act on, and the load ramp's top. */
const ACCENT = 'var(--accent)'

function Shell() {
  const { state, dispatch, coordination } = useApp()
  const share = useShareLink()
  const isDesktop = useMediaQuery('(min-width: 940px)')
  const [shared, setShared] = useState(false)
  const [selected, setSelected] = useState<HotspotId | null>(null)
  // Closed to begin with: the drawing is the app, and everything in here has a
  // place on it. The panel is the long form for when you want it.
  const [panelOpen, setPanelOpen] = useState(false)

  const { anthro, task, exercise } = state

  const springTarget = useMemo(
    () => ({
      kneeTravel: coordination.kneeTravel,
      spineFlexion: coordination.spineFlexion,
      armLean: coordination.armLean,
      barOffset: coordination.barOffset,
      load: task.load,
      cop: task.cop,
      depth: task.depth,
      barPosition: task.barPosition,
      height: anthro.height,
      mass: anthro.mass,
      foot: anthro.foot,
      shank: anthro.shank,
      thigh: anthro.thigh,
      torso: anthro.torso,
      arm: anthro.arm,
    }),
    [coordination, task, anthro],
  )

  const anim = useSpringSnapshot(springTarget, { stiffness: 300, dampingRatio: 1 })

  const stopPlayback = useCallback(
    () => dispatch({ type: 'setPlaying', playing: false }),
    [dispatch],
  )

  const solvedAnthro: Anthropometry = useMemo(
    () => ({
      height: anim.height,
      mass: anim.mass,
      foot: anim.foot,
      shank: anim.shank,
      thigh: anim.thigh,
      torso: anim.torso,
      arm: anim.arm,
      maxDorsiflexion: anthro.maxDorsiflexion,
    }),
    [anim, anthro.maxDorsiflexion],
  )

  const solvedTask: Task = useMemo(
    () => ({
      progress: task.progress,
      load: anim.load,
      cop: anim.cop,
      depth: anim.depth,
      barPosition: anim.barPosition,
      plateRadius: task.plateRadius,
      balance: task.balance,
    }),
    [anim, task.progress, task.plateRadius, task.balance],
  )

  const solvedCoordination: Coordination = useMemo(
    () => ({
      kneeTravel: anim.kneeTravel,
      spineFlexion: anim.spineFlexion,
      armLean: anim.armLean,
      barOffset: anim.barOffset,
    }),
    [anim],
  )

  const frame = useMemo(
    () => solveFrame(exercise, solvedAnthro, solvedTask, solvedCoordination),
    [exercise, solvedAnthro, solvedTask, solvedCoordination],
  )

  const seriesKey = [
    exercise,
    anim.load,
    anim.cop,
    anim.depth,
    anim.barPosition,
    task.balance,
    anim.height,
    anim.mass,
    anim.foot,
    anim.shank,
    anim.thigh,
    anim.torso,
    anim.arm,
  ].join('|')

  const series = useMemo(
    () => simulateSeries(exercise, solvedAnthro, solvedTask, solvedCoordination, 33),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesKey, anim.kneeTravel, anim.spineFlexion, anim.armLean, anim.barOffset],
  )

  const peakMoment = useMemo(
    () => Math.max(series.peak.hip, series.peak.knee, series.peak.l5s1, series.peak.ankle),
    [series],
  )

  const bounds = useMemo(
    () => frameBounds(frame, task.plateRadius, exercise),
    [frame, task.plateRadius, exercise],
  )

  // Each part carries what it currently reads, so hovering it can say what it
  // is and where it stands before you commit to opening anything.
  const hotspots = useMemo(
    () =>
      hotspotsFor(exercise, frame, state.showComGuides).map((hotspot) => {
        const primary = paramsFor(hotspot.id, exercise)[0]
        return {
          ...hotspot,
          readout: primary
            ? formatParam(primary, paramValue(primary, { exercise, anthro, task, coordination }))
            : undefined,
        }
      }),
    [exercise, frame, state.showComGuides, anthro, task, coordination],
  )

  // The settled setup, not the springed one: feasible ranges have to describe
  // where the controls are actually allowed to go, not where a transition
  // happens to be passing through.
  const setup: Setup = useMemo(
    () => ({ exercise, anthro, task, coordination }),
    [exercise, anthro, task, coordination],
  )

  const setParam = useCallback(
    (id: ParamId, value: number) => {
      if (state.playing) dispatch({ type: 'setPlaying', playing: false })
      dispatch({ type: 'setParams', patch: patchFor(id, value) })
    },
    [dispatch, state.playing],
  )

  // The scrubber and the playback loop go through the same gate as every other
  // control, so no path into the model can reach a pose it cannot build.
  //
  // Deliberately not keyed on the whole setup: that includes the progress this
  // very range governs, so it would be rebuilt on every frame of playback,
  // costing a few dozen solves each time and handing the loop below a fresh
  // callback that restarted it.
  const progressRange = useMemo(
    () => feasibleRange('progress', setup),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      exercise,
      anthro,
      coordination,
      task.load,
      task.cop,
      task.depth,
      task.barPosition,
      task.balance,
      task.plateRadius,
    ],
  )
  const setProgress = useCallback(
    (progress: number) =>
      dispatch({
        type: 'setTask',
        patch: { progress: clamp(progress, progressRange.min, progressRange.max) },
      }),
    [dispatch, progressRange],
  )
  usePlayback(task.progress, state.playing, setProgress, stopPlayback, progressRange)

  const selectedHotspot = hotspots.find((h) => h.id === selected) ?? null

  const rows = useMemo(() => buildRows(frame, exercise), [frame, exercise])

  // Mid-transition poses pass through settings the user never chose, so
  // warnings only appear once the springs have caught up with the target.
  const settled = useMemo(
    () =>
      (Object.keys(springTarget) as (keyof typeof springTarget)[]).every(
        (key) => Math.abs(anim[key] - springTarget[key]) < 1e-4,
      ),
    [anim, springTarget],
  )
  const warnings = settled ? frame.warnings : []

  const onShare = useCallback(async () => {
    const ok = await share()
    if (ok) {
      setShared(true)
      window.setTimeout(() => setShared(false), 1800)
    }
  }, [share])

  const panels = (
    <>
      <PatternPanel accent={ACCENT} />
      <TaskPanel />
      <BodyPanel />
      <ViewPanel />
      {/* Folded away: useful when you want to check the model, but a wall of
          newton-metres is not what the app is for. */}
      <section className="section">
        <Collapsible title="Ver los números de esta posición">
          <MetricsTable rows={rows} />
        </Collapsible>
      </section>
      <ModelNotes />
      <footer className="foot">
        <button className="icon-button share-in-panel" onClick={onShare}>
          {shared ? 'Enlace copiado' : 'Compartir enlace'}
        </button>
        <p className="caption">
          Palanca — modelo abierto de mecánica de barra. Winter (2009) · Drillis y Contini (1964) ·
          Edington (2018) · Escamilla (2000, 2001) · Aasa (2019) · Cholewicki (1991).
        </p>
      </footer>
    </>
  )

  const shellClass = [
    'app',
    isDesktop ? 'desktop' : 'mobile',
    panelOpen ? 'panel-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      <header className="topbar blur">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <h1 className="title-lg">Palanca</h1>
            <p className="brand-sub">{EXERCISE_META[exercise].name}</p>
          </div>
        </div>
        <div className="topbar-tabs">
          <Segmented
            value={exercise}
            groupId="exercise"
            options={[
              { value: 'deadlift', label: 'Peso muerto' },
              { value: 'squat', label: 'Sentadilla' },
            ]}
            onChange={(value) => dispatch({ type: 'setExercise', exercise: value })}
          />
        </div>
        <div className="topbar-actions">
          <button
            className={panelOpen ? 'ghost-icon on' : 'ghost-icon'}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? 'Cerrar ajustes' : 'Ajustes'}
            onClick={() => setPanelOpen(!panelOpen)}
          >
            {panelOpen ? (
              <X size={20} strokeWidth={1.75} aria-hidden />
            ) : (
              <Settings size={20} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </header>

      <div className="workspace">
        <main className="stage">
          <Figure
            frame={frame}
            bounds={bounds}
            exercise={exercise}
            color={ACCENT}
            showComGuides={state.showComGuides}
            showMomentArms={state.showMomentArms}
            showLoadMap={state.showLoadMap}
            plateRadius={task.plateRadius}
            peakMoment={peakMoment}
            hotspots={state.playing ? [] : hotspots}
            selected={state.playing ? null : selected}
            onSelect={setSelected}
            panel={
              <MomentPanel
                series={series}
                frame={frame}
                progress={task.progress}
                curves={state.showCurves}
              />
            }
            popover={
              selectedHotspot &&
              !state.playing && (
                <Inspector
                  hotspot={selectedHotspot.id}
                  label={selectedHotspot.label}
                  setup={setup}
                  accent={ACCENT}
                  onChange={setParam}
                  onClose={() => setSelected(null)}
                />
              )
            }
          >
            <AnimatePresence>
              {warnings.length > 0 && (
                <motion.div
                  className="warnings"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Only when there is something to say. The standing invitation to
                touch the drawing was permanent furniture for a one-time lesson. */}
            {frame.barBlocked && !selectedHotspot && (
              <p className="figure-hint">
                La barra está apoyada contra la tibia: no puede ir más atrás.
              </p>
            )}

            <WorkReadout work={series.work} />

            <div className="transport">
              <button
                className={state.playing ? 'play playing' : 'play'}
                aria-label={state.playing ? 'Pausar' : 'Reproducir el recorrido'}
                onClick={() => {
                  if (!state.playing) setSelected(null)
                  dispatch({ type: 'setPlaying', playing: !state.playing })
                }}
              >
                {state.playing ? (
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
                    <rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor" />
                    <rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
                    <path
                      d="M5 3.6v8.8c0 .5.6.9 1.1.6l6.8-4.4a.7.7 0 0 0 0-1.2L6.1 3a.7.7 0 0 0-1.1.6Z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
              <input
                className="scrubber"
                type="range"
                min={Math.ceil(progressRange.min * 1000)}
                max={Math.floor(progressRange.max * 1000)}
                value={Math.round(task.progress * 1000)}
                aria-label={`Posición del levantamiento — ${EXERCISE_META[exercise].taskConstraint}`}
                onChange={(e) => {
                  if (state.playing) dispatch({ type: 'setPlaying', playing: false })
                  setProgress(Number(e.target.value) / 1000)
                }}
                style={{ '--pct': `${task.progress * 100}%` } as React.CSSProperties}
              />
              <span className="transport-value num">
                {((exercise === 'deadlift' ? frame.barHeight : frame.posture.hip.y) * 100).toFixed(
                  0,
                )}{' '}
                cm
              </span>
            </div>
          </Figure>
        </main>

        <AnimatePresence>
          {panelOpen && (
            <motion.aside
              key="settings-panel"
              className={isDesktop ? 'side-panel' : 'mobile-panel'}
              initial={isDesktop ? { opacity: 0, x: 28 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={isDesktop ? { opacity: 0, x: 20 } : { opacity: 0, y: 12 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {panels}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  )
}
