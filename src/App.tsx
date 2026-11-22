import { MotionConfig } from 'motion/react'
import { Bone, Box, ChartSpline, Hand, Layers3, Spline } from 'lucide-react'
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
import { StanceControls, StanceComparison } from './components/StanceStudy'
import { BodyEditToggle, BodyEditor } from './components/BodyEditor'
import { Inspector, ParamSlider } from './components/Inspector'
import { MetricsTable, buildRows } from './components/Metrics'
import { LabHeader, ExerciseHeading, LabFooter } from './components/LabHeader'
import { BenchLab } from './components/BenchLab'
import { ForceReadingGuide } from './components/ForceReadingGuide'
import { ForceBalance, MechanicsControls } from './components/MechanicsControls'
import { buildMechanicsOverlay, formatBarArm, formatMoment } from './model/mechanicsOverlay'
import type { JointKey } from './model/kinetics'
import { MomentPanel } from './components/MomentPanel'
import { Collapsible } from './components/ui'
import { usePlayback, useSpringSnapshot } from './hooks/useAnimationEngine'
import { clamp } from './model/geometry'
import {
  type HotspotId,
  type ParamId,
  type Setup,
  feasibleRange,
  hotspotsFor,
  editableHotspotsFor,
  bodyParamsFor,
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
import './styles/mechanics.css'

const AnatomyViewer = lazy(() => import('./components/AnatomyViewer'))
const ACCENT = 'var(--accent)'

function StandingLab() {
  const { state, dispatch, coordination } = useApp()
  const share = useShareLink()
  const [mode, setMode] = useState<'anatomy' | 'diagram'>('anatomy')
  const [layer, setLayer] = useState<'muscles' | 'skeleton'>('muscles')
  const [muscle, setMuscle] = useState<MuscleId | null>(null)
  const [editingBody, setEditingBody] = useState(false)
  const [editForces, setEditForces] = useState(false)
  const [editPart, setEditPart] = useState<HotspotId>('thigh')
  const [slow, setSlow] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const useDiagramFallback = useCallback(() => {
    setEditingBody(false)
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
      stanceWidth: coordination.stanceWidth,
      deadliftStyle: coordination.deadliftStyle,
    }),
    [anim, coordination.stanceWidth, coordination.deadliftStyle],
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

  const mechanics = state.mechanics
  const overlay = useMemo(() => buildMechanicsOverlay(frame, solvedTask), [frame, solvedTask])
  const focus = overlay.moments.find((j) => j.id === mechanics.joint)
  const observed =
    focus ?? overlay.moments.find((j) => j.id === (exercise === 'deadlift' ? 'hip' : 'knee'))!
  const selectJoint = useCallback(
    (joint: JointKey | 'all') => {
      dispatch({ type: 'setMechanics', patch: { joint, moments: true, focus: 'all' } })
    },
    [dispatch],
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
    setEditingBody(false)
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
    setEditingBody(false)
    setUnavailable(false)
    setSelected(null)
  }

  return (
    <div className="atlas-app">
      <LabHeader onSettings={openSettings} onSwitch={() => setSelected(null)} />
      <main className="atlas-main">
        <ExerciseHeading
          name={EXERCISE_META[exercise].name}
          load={task.load}
          description={
            exercise === 'deadlift'
              ? 'Compará la bisagra de cadera, la flexión de rodilla y el recorrido de la barra al pasar de convencional a sumo.'
              : 'Abrí o cerrá la base y observá cómo cambian la postura de la cadera y las rodillas al bajar.'
          }
        />
        <div
          className="atlas-layout"
          id="exercise-panel"
          role="tabpanel"
          aria-labelledby={`exercise-${exercise}`}
        >
          <div className="lift-column">
            <StanceControls
              exercise={exercise}
              anthro={anthro}
              coordination={coordination}
              onChange={(patch) => dispatch({ type: 'setCoordination', patch })}
            />
            <section
              className="atlas-card viewer-card"
              aria-label="Simulador del levantamiento"
              data-force-focus={mechanics.forces && !editingBody ? mechanics.focus : 'all'}
            >
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
                  <div className="viewer-actions">
                    <BodyEditToggle
                      active={editingBody}
                      onClick={() => {
                        stopPlayback()
                        setEditingBody(!editingBody)
                      }}
                    />
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
                  </div>
                )}
              </div>
              {mode === 'anatomy' && editingBody && (
                <BodyEditor
                  editForces={editForces}
                  onEditForces={setEditForces}
                  options={editableHotspotsFor(exercise, frame)}
                  selected={editPart}
                  onSelect={setEditPart}
                >
                  {bodyParamsFor(editPart, exercise).map((id) => (
                    <ParamSlider
                      key={id}
                      id={id}
                      setup={setup}
                      accent={ACCENT}
                      onChange={setParam}
                    />
                  ))}
                </BodyEditor>
              )}
              {mode === 'anatomy' && !editingBody && (
                <MechanicsControls<JointKey>
                  {...mechanics}
                  options={overlay.moments}
                  onLoadPath={() =>
                    dispatch({
                      type: 'setMechanics',
                      patch: {
                        forces: true,
                        loadPath: !mechanics.forces || !mechanics.loadPath,
                      },
                    })
                  }
                  onForces={() =>
                    dispatch({ type: 'setMechanics', patch: { forces: !mechanics.forces } })
                  }
                  onMoments={() =>
                    dispatch({ type: 'setMechanics', patch: { moments: !mechanics.moments } })
                  }
                  onLever={() =>
                    dispatch({ type: 'setMechanics', patch: { lever: !mechanics.lever } })
                  }
                  onJoint={selectJoint}
                />
              )}
              {unavailable && (
                <p className="fallback-note" role="status">
                  El visor 3D no pudo iniciarse. Podés explorar el mismo movimiento en el diagrama o
                  volver a intentar con Anatomía 3D.
                </p>
              )}
              <div className={`atlas-viewport ${mode}`} id="lift-viewport" tabIndex={-1}>
                {mode === 'anatomy' && (
                  <div className="model-hint">
                    {editingBody ? (
                      <span>Arrastrá para girar</span>
                    ) : muscle && layer === 'muscles' ? (
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
                        editingBody={editingBody}
                        editForces={editForces}
                        editJoint={editPart}
                        onEditPart={setEditPart}
                        mechanics={mechanics}
                        peakMoment={peakMoment}
                        onSelectJoint={selectJoint}
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
              {mode === 'anatomy' && !editingBody && mechanics.forces && (
                <ForceReadingGuide
                  focus={mechanics.focus}
                  onFocus={(focus) => dispatch({ type: 'setMechanics', patch: { focus } })}
                  loadPath={mechanics.loadPath}
                  feetReaction={frame.kinetics.systemWeight}
                />
              )}
              <LiftTransport
                marker={exercise === 'deadlift' ? 'Barra' : 'Cadera'}
                height={exercise === 'deadlift' ? frame.barHeight : frame.posture.hip.y}
                lowerStop={exercise === 'deadlift' ? 'Despegue' : 'Fondo'}
                progress={task.progress}
                range={progressRange}
                playing={state.playing}
                phase={phase}
                slow={slow}
                onSpeed={() => setSlow(!slow)}
                onPlay={() => {
                  setEditingBody(false)
                  setSelected(null)
                  dispatch({ type: 'setPlaying', playing: !state.playing })
                }}
                onScrub={(value) => {
                  stopPlayback()
                  setProgress(value)
                }}
              />
              <p className="pose-explanation">
                <strong>{observed.label}.</strong> La vertical de la barra pasa a{' '}
                <b>{formatBarArm(observed.barArmM)}</b> de la articulación. El peso de la barra
                aporta <b>{formatMoment(observed.barMomentNm)}</b>
                {observed.id === 'l5s1' ? ' al tronco' : ' por pierna'}.
              </p>
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
            <StanceComparison
              exercise={exercise}
              anthro={solvedAnthro}
              task={seriesTask}
              coordination={solvedCoordination}
              frame={frame}
              series={series}
              progress={task.progress}
              range={progressRange}
              onJoint={(joint) => {
                setEditingBody(false)
                selectJoint(joint)
                if (!unavailable) setMode('anatomy')
                if (window.matchMedia('(max-width: 790px)').matches) {
                  document.getElementById('lift-viewport')?.focus()
                }
              }}
            />
            <section className="atlas-card moments-card" aria-labelledby="moment-title">
              <h2 id="moment-title" className="rail-title">
                <ChartSpline size={18} aria-hidden /> Momentos articulares
              </h2>
              <p className="rail-intro moment-intro">
                Los arcos muestran el momento interno que equilibra la postura. Elegí una
                articulación para medir su distancia a la línea de la barra.
              </p>
              <MomentPanel
                series={series}
                frame={frame}
                progress={task.progress}
                curves={state.showCurves}
                selected={mechanics.joint}
                onSelectJoint={(joint) => {
                  setEditingBody(false)
                  selectJoint(joint)
                  if (!unavailable) setMode('anatomy')
                }}
              />
              {focus && (
                <div className="joint-detail">
                  <strong>
                    {focus.label} · {focus.action}
                  </strong>
                  <dl>
                    <div>
                      <dt>Brazo de la barra</dt>
                      <dd>{formatBarArm(focus.barArmM)}</dd>
                    </div>
                    <div>
                      <dt>Aporte de la barra</dt>
                      <dd>{formatMoment(focus.barMomentNm)}</dd>
                    </div>
                    <div>
                      <dt>Aporte de los segmentos</dt>
                      <dd>{formatMoment(focus.bodyMomentNm)}</dd>
                    </div>
                  </dl>
                  <p>
                    El momento neto suma ambos aportes. El signo positivo indica{' '}
                    {focus.id === 'ankle' ? 'flexión plantar' : 'extensión'}.
                  </p>
                </div>
              )}
            </section>
            <ForceBalance
              forces={overlay.forces}
              note={
                exercise === 'deadlift'
                  ? 'En el despegue, el modelo supone que las manos ya sostienen todo el peso de la barra.'
                  : 'La reacción total bajo ambos pies equilibra el peso del cuerpo y el de la barra.'
              }
            />
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
          </aside>
        </div>
        <LabFooter />
      </main>
      <SettingsDialog open={panelOpen} onClose={() => setPanelOpen(false)}>
        {panels}
      </SettingsDialog>
    </div>
  )
}

function Shell() {
  const { state } = useApp()
  return state.benchActive ? <BenchLab /> : <StandingLab />
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
