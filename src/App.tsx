import { MotionConfig } from 'motion/react'
import {
  Activity,
  Bone,
  Box,
  ChartSpline,
  Hand,
  Layers3,
  SlidersHorizontal,
  Spline,
  Weight,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import type { MuscleId } from './anatomy/body'
import { LiftTransport } from './components/LiftTransport'
import { MuscleAtlas } from './components/MuscleAtlas'
import { entries as muscleGuide } from './components/muscleGuide'
import { SettingsDialog } from './components/SettingsDialog'
import { ViewerBoundary } from './components/ViewerBoundary'
import { Figure } from './components/Figure'
import {
  BodyPanel,
  ModelNotes,
  PatternPanel,
  TaskPanel,
  ViewPanel,
} from './components/ControlPanel'
import { Inspector } from './components/Inspector'
import { MetricsTable, buildRows } from './components/Metrics'
import { MomentPanel } from './components/MomentPanel'
import { Collapsible, Segmented } from './components/ui'
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
import { simulateSeries, solveFrame } from './model/lift'
import type { Anthropometry } from './model/anthropometry'
import { AppStateProvider, useApp, useShareLink } from './state/appState'
import { EXERCISE_META } from './state/presets'
import './styles/base.css'
import './styles/app.css'

import './styles/atlas.css'

const AnatomyViewer = lazy(() => import('./components/AnatomyViewer'))
const ACCENT = 'var(--accent)'

function Shell() {
  const { state, dispatch, coordination } = useApp()
  const share = useShareLink()
  const [mode, setMode] = useState<'anatomy' | 'diagram'>('anatomy')
  const [layer, setLayer] = useState<'muscles' | 'skeleton'>('muscles')
  const [muscle, setMuscle] = useState<MuscleId | null>(null)
  const [slow, setSlow] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const useDiagramFallback = useCallback(() => {
    setUnavailable(true)
    setMode('diagram')
  }, [])
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
    [coordination, task.load, task.cop, task.depth, task.barPosition, anthro],
  )

  const anim = useSpringSnapshot(springTarget, {
    stiffness: 300,
    dampingRatio: 1,
    resetKey: exercise,
  })

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

  const seriesTask: Task = useMemo(
    () => ({
      progress: 0,
      load: anim.load,
      cop: anim.cop,
      depth: anim.depth,
      barPosition: anim.barPosition,
      plateRadius: task.plateRadius,
      balance: task.balance,
    }),
    [anim, task.plateRadius, task.balance],
  )

  const solvedTask = useMemo(
    () => ({ ...seriesTask, progress: task.progress }),
    [seriesTask, task.progress],
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

  // The settled setup, not the springed one: feasible ranges have to describe
  // where the controls are actually allowed to go, not where a transition
  // happens to be passing through.
  const setup: Setup = useMemo(
    () => ({ exercise, anthro, task, coordination }),
    [exercise, anthro, task, coordination],
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
  const series = useMemo(
    () => simulateSeries(exercise, solvedAnthro, seriesTask, solvedCoordination, 33, progressRange),
    [exercise, solvedAnthro, seriesTask, solvedCoordination, progressRange],
  )

  const peakMoment = useMemo(
    () => Math.max(series.peak.hip, series.peak.knee, series.peak.l5s1, series.peak.ankle),
    [series],
  )

  // Each part carries what it currently reads, so hovering it can say what it
  // is and where it stands before you commit to opening anything.
  const hotspots = useMemo(() => {
    if (mode !== 'diagram' || state.playing) return []
    return hotspotsFor(exercise, frame, state.showComGuides).map((hotspot) => {
      const primary = paramsFor(hotspot.id, exercise)[0]
      return {
        ...hotspot,
        readout: primary
          ? formatParam(primary, paramValue(primary, { exercise, anthro, task, coordination }))
          : undefined,
      }
    })
  }, [mode, state.playing, exercise, frame, state.showComGuides, anthro, task, coordination])

  const setParam = useCallback(
    (id: ParamId, value: number) => {
      if (state.playing) dispatch({ type: 'setPlaying', playing: false })
      dispatch({ type: 'setParams', patch: patchFor(id, value) })
    },
    [dispatch, state.playing],
  )

  const setProgress = useCallback(
    (progress: number) =>
      dispatch({
        type: 'setTask',
        patch: { progress: clamp(progress, progressRange.min, progressRange.max) },
      }),
    [dispatch, progressRange],
  )
  const phase = usePlayback(
    task.progress,
    state.playing,
    setProgress,
    stopPlayback,
    progressRange,
    slow ? 14 : 7,
    exercise,
  )

  const selectedHotspot = hotspots.find((h) => h.id === selected) ?? null

  const rows = useMemo(
    () => (panelOpen ? buildRows(frame, exercise) : []),
    [panelOpen, frame, exercise],
  )

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
      <p className="caption">
        El atlas ilustra la anatomía de cada grupo. Los momentos corresponden a las articulaciones.
        Para repasar las funciones musculares, consultá{' '}
        <a
          href="https://openstax.org/books/anatomy-and-physiology-2e/pages/11-introduction"
          target="_blank"
          rel="noreferrer"
        >
          Anatomy and Physiology de OpenStax
        </a>
        .
      </p>
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

  const chooseMuscle = (id: MuscleId | null) => {
    setMuscle(id)
    if (id && !unavailable) {
      setMode('anatomy')
      setLayer('muscles')
    }
  }
  const openSettings = () => {
    stopPlayback()
    setPanelOpen(true)
  }
  const chooseView = (value: 'anatomy' | 'diagram') => {
    setMode(value)
    setUnavailable(false)
    setSelected(null)
  }

  return (
    <div className="atlas-app">
      <header className="atlas-header">
        <div className="atlas-header-inner">
          <div className="atlas-brand">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="32" height="32" />
            <strong>Palanca</strong>
            <span>Laboratorio de biomecánica</span>
          </div>
          <nav aria-label="Ejercicio">
            <Segmented
              value={exercise}
              groupId="exercise"
              panelId="exercise-panel"
              options={[
                { value: 'deadlift', label: 'Peso muerto' },
                { value: 'squat', label: 'Sentadilla' },
              ]}
              onChange={(value) => {
                if (exercise === value) return
                setSelected(null)
                dispatch({ type: 'setExercise', exercise: value })
              }}
            />
          </nav>
          <button className="settings-open" onClick={openSettings} aria-haspopup="dialog">
            <SlidersHorizontal size={16} aria-hidden /> Ajustes
          </button>
        </div>
      </header>
      <main className="atlas-main">
        <header className="exercise-head">
          <div>
            <h1>{EXERCISE_META[exercise].name}</h1>
            <p>
              {exercise === 'deadlift'
                ? 'Seguí la barra desde el suelo y observá cómo se extienden la cadera y las rodillas.'
                : 'Seguí el descenso de la cadera y la extensión de las rodillas al volver a subir.'}
            </p>
          </div>
          <div className="bar-load">
            <Weight size={19} strokeWidth={1.5} aria-hidden />
            <span>
              Carga en barra<strong className="num">{task.load.toLocaleString('es-AR')} kg</strong>
            </span>
          </div>
        </header>
        <div
          className="atlas-layout"
          id="exercise-panel"
          role="tabpanel"
          aria-labelledby={`exercise-${exercise}`}
        >
          <div className="lift-column">
            <section className="atlas-card viewer-card" aria-label="Simulador del levantamiento">
              <div className="view-toolbar">
                <div className="view-modes" role="group" aria-label="Representación">
                  <button aria-pressed={mode === 'anatomy'} onClick={() => chooseView('anatomy')}>
                    <Box size={16} aria-hidden />
                    Anatomía 3D
                  </button>
                  <button aria-pressed={mode === 'diagram'} onClick={() => chooseView('diagram')}>
                    <Spline size={16} aria-hidden />
                    Diagrama 2D
                  </button>
                </div>
                {mode === 'anatomy' && (
                  <label className="layer-picker">
                    {layer === 'muscles' ? (
                      <Layers3 size={15} aria-hidden />
                    ) : (
                      <Bone size={15} aria-hidden />
                    )}
                    <select
                      aria-label="Capa anatómica"
                      value={layer}
                      onChange={(e) => {
                        setLayer(e.target.value === 'skeleton' ? 'skeleton' : 'muscles')
                        if (e.target.value === 'skeleton') setMuscle(null)
                      }}
                    >
                      <option value="muscles">Músculos</option>
                      <option value="skeleton">Esqueleto</option>
                    </select>
                  </label>
                )}
              </div>
              {unavailable && (
                <p className="fallback-note" role="status">
                  El visor 3D no pudo iniciarse. Podés explorar el mismo movimiento en el diagrama o
                  volver a intentar con Anatomía 3D.
                </p>
              )}
              <div className={`atlas-viewport ${mode}`} id="lift-viewport" tabIndex={-1}>
                {mode === 'anatomy' && (
                  <div className="model-hint">
                    {muscle && layer === 'muscles' ? (
                      <button onClick={() => document.getElementById('muscle-title')?.focus()}>
                        {muscleGuide[muscle].name} <span>Ver ficha</span>
                      </button>
                    ) : (
                      <>
                        <Hand size={13} aria-hidden />
                        <span>Arrastrá para girar</span>
                      </>
                    )}
                  </div>
                )}
                {mode === 'anatomy' ? (
                  <ViewerBoundary onUnavailable={useDiagramFallback}>
                    <Suspense
                      fallback={
                        <p className="viewer-loading" role="status">
                          Cargando el atlas anatómico…
                        </p>
                      }
                    >
                      <AnatomyViewer
                        playing={state.playing}
                        postures={series.postures}
                        bounds={series.bounds}
                        frame={frame}
                        exercise={exercise}
                        anthro={solvedAnthro}
                        task={solvedTask}
                        layer={layer}
                        selectedMuscle={muscle}
                        onSelectMuscle={setMuscle}
                        onUnavailable={useDiagramFallback}
                      />
                    </Suspense>
                  </ViewerBoundary>
                ) : (
                  <Figure
                    frame={frame}
                    bounds={series.bounds}
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
                  />
                )}
              </div>
              <LiftTransport
                exercise={exercise}
                frame={frame}
                progress={task.progress}
                range={progressRange}
                playing={state.playing}
                phase={phase}
                slow={slow}
                onSpeed={() => setSlow(!slow)}
                onPlay={() => {
                  setSelected(null)
                  dispatch({ type: 'setPlaying', playing: !state.playing })
                }}
                onScrub={(value) => {
                  stopPlayback()
                  setProgress(value)
                }}
              />
              {mode === 'diagram' && (
                <p className="diagram-help">
                  Tocá una articulación o un segmento para ajustar el modelo.
                </p>
              )}
              {(warnings.length > 0 || frame.barBlocked) && (
                <div className="model-warnings">
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  {frame.barBlocked && <p>La tibia limita el recorrido de la barra hacia atrás.</p>}
                </div>
              )}
            </section>
            <dl className="pose-readings atlas-card">
              <div>
                <dt>Flexión de cadera</dt>
                <dd>
                  {Math.round(frame.angles.hipFlexion)}
                  <small>°</small>
                </dd>
              </div>
              <div>
                <dt>Flexión de rodilla</dt>
                <dd>
                  {Math.round(frame.angles.kneeFlexion)}
                  <small>°</small>
                </dd>
              </div>
              <div>
                <dt>Trabajo del ascenso</dt>
                <dd>
                  {Math.round(series.work).toLocaleString('es-AR')} <small>J</small>
                </dd>
              </div>
            </dl>
          </div>
          <aside className="atlas-rail" aria-label="Guía del movimiento">
            <MuscleAtlas
              frame={frame}
              exercise={exercise}
              selected={muscle}
              onSelect={chooseMuscle}
              onShowModel={
                mode === 'anatomy'
                  ? () => document.getElementById('lift-viewport')?.focus()
                  : undefined
              }
            />
            <section className="atlas-card moments-card" aria-labelledby="moment-title">
              <h2 id="moment-title" className="rail-title">
                <ChartSpline size={18} aria-hidden /> Momentos articulares
              </h2>
              <p className="rail-intro moment-intro">
                El momento expresa el efecto de giro de las fuerzas sobre cada articulación.
              </p>
              <MomentPanel
                series={series}
                frame={frame}
                progress={task.progress}
                curves={state.showCurves}
              />
            </section>
          </aside>
        </div>
        <footer className="atlas-footer">
          <span>
            <Activity size={15} aria-hidden /> Modelo biomecánico plano y cuasiestático.
          </span>
          <a
            href={`${import.meta.env.BASE_URL}anatomy/creditos.html`}
            target="_blank"
            rel="noreferrer"
          >
            Créditos del atlas 3D
          </a>
        </footer>
      </main>
      <SettingsDialog open={panelOpen} onClose={() => setPanelOpen(false)}>
        {panels}
      </SettingsDialog>
    </div>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </MotionConfig>
  )
}
