import { MotionConfig } from 'motion/react'
import { ChartSpline } from 'lucide-react'
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
import { StudyGuide } from './components/StudyGuide'
import { ViewerToolbar } from './components/ViewerToolbar'
import { BodyEditor, BodyEditHint } from './components/BodyEditor'
import { Inspector } from './components/Inspector'
import { MetricsTable, buildRows } from './components/Metrics'
import { LabHeader, LabFooter } from './components/LabHeader'
import { BenchLab } from './components/BenchLab'
import { SharePosture } from './components/SharePosture'
import { ForceReadingGuide } from './components/ForceReadingGuide'
import { ForceBalance, MechanicsControls } from './components/MechanicsControls'
import { buildMechanicsOverlay, formatBarArm, formatMoment } from './model/mechanicsOverlay'
import type { JointKey } from './model/kinetics'
import { MomentPanel } from './components/MomentPanel'
import { Collapsible, Slider } from './components/ui'
import { usePlayback, useSpringSnapshot } from './hooks/useAnimationEngine'
import { clamp } from './model/geometry'
import {
  type HotspotId,
  type ParamId,
  type Setup,
  feasibleRange,
  hotspotsFor,
  editableHotspotsFor,
  paramValue,
  paramsFor,
  patchFor,
} from './model/interact'
import { standingPartControls } from './model/standingPartControls'
import { formatParam } from './components/params'
import type { Coordination, Task } from './model/lift'
import { simulateSeries, solveFrame } from './model/lift'
import type { Anthropometry } from './model/anthropometry'
import { AppStateProvider, useApp } from './state/appState'
import { AnalysisToggle, LoadButton } from './components/MovementControls'
import './styles/base.css'
import './styles/app.css'

import './styles/atlas.css'
import './styles/mechanics.css'
import './styles/study.css'

const AnatomyViewer = lazy(() => import('./components/AnatomyViewer'))
const ACCENT = 'var(--accent)'

function StandingLab() {
  const { state, dispatch, coordination } = useApp()
  const [mode, setMode] = useState<'anatomy' | 'diagram'>('anatomy')
  const [layer, setLayer] = useState<'muscles' | 'skeleton'>('muscles')
  const [muscle, setMuscle] = useState<MuscleId | null>(null)
  const [editingBody, setEditingBody] = useState(false)
  const [editForces, setEditForces] = useState(false)
  const [guide, setGuide] = useState('posturas')
  const [editPart, setEditPart] = useState<HotspotId>('thigh')
  const [slow, setSlow] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const useDiagramFallback = useCallback(() => {
    setEditingBody(false)
    setUnavailable(true)
    setMode('diagram')
  }, [])
  const [selected, setSelected] = useState<HotspotId | null>(null)
  // Closed to begin with: the drawing is the app, and everything in here has a
  // place on it. The panel is the long form for when you want it.
  const [panelOpen, setPanelOpen] = useState(false)

  const { anthro, task, exercise, analyzing } = state

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
      toeOutDeg: coordination.toeOutDeg,
      squatElbowAngle: coordination.squatElbowAngle,
    }),
    [
      anim,
      coordination.stanceWidth,
      coordination.deadliftStyle,
      coordination.toeOutDeg,
      coordination.squatElbowAngle,
    ],
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
    return hotspotsFor(exercise, frame, analyzing && state.showComGuides).map((hotspot) => {
      const primary = paramsFor(hotspot.id, exercise)[0]
      return {
        ...hotspot,
        readout: primary
          ? formatParam(primary, paramValue(primary, { exercise, anthro, task, coordination }))
          : undefined,
      }
    })
  }, [
    mode,
    state.playing,
    exercise,
    frame,
    analyzing,
    state.showComGuides,
    anthro,
    task,
    coordination,
  ])

  const bodyControls = useMemo(
    () => (editingBody ? standingPartControls(editPart, setup) : []),
    [editingBody, editPart, setup],
  )
  const selectBodyPart = (part: HotspotId) => {
    stopPlayback()
    setEditPart(part)
    setEditingBody(true)
  }
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

  const panels = (
    <>
      <TaskPanel />
      <PatternPanel accent={ACCENT} />
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
        <SharePosture />
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
    <div className="atlas-app movement-app">
      <LabHeader
        onSwitch={() => {
          setSelected(null)
          setEditingBody(false)
        }}
      />
      <main className="atlas-main" aria-labelledby="exercise-title">
        <div
          className="atlas-layout"
          id="exercise-panel"
          data-analyzing={analyzing && !editingBody}
        >
          <div className="lift-column">
            <section
              className="atlas-card viewer-card"
              aria-label="Simulador del levantamiento"
              data-editing={editingBody}
              data-force-focus={
                analyzing && mechanics.forces && !editingBody ? mechanics.focus : 'all'
              }
            >
              <div className="movement-options">
                <div className="movement-setup">
                  <StanceControls
                    key={exercise}
                    exercise={exercise}
                    anthro={anthro}
                    coordination={coordination}
                    onChange={(patch) => dispatch({ type: 'setCoordination', patch })}
                  />
                  <LoadButton load={task.load} onClick={openSettings} />
                </div>
                <ViewerToolbar
                  onSettings={openSettings}
                  mode={mode}
                  onMode={chooseView}
                  layer={layer}
                  onLayer={(value) => {
                    setLayer(value)
                    if (value === 'skeleton') setMuscle(null)
                  }}
                  canEdit={mode === 'anatomy'}
                  editingBody={editingBody}
                  onEdit={() => {
                    stopPlayback()
                    setEditingBody(!editingBody)
                  }}
                >
                  {analyzing && mode === 'anatomy' && !editingBody && (
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
                </ViewerToolbar>
              </div>
              {unavailable && (
                <p className="fallback-note" role="status">
                  El visor 3D no pudo iniciarse. Podés explorar el mismo movimiento en el diagrama o
                  volver a intentar con Anatomía 3D.
                </p>
              )}
              <div className={`atlas-viewport ${mode}`} id="lift-viewport" tabIndex={-1}>
                {mode === 'anatomy' &&
                  !editingBody &&
                  !(analyzing && muscle && layer === 'muscles') && <BodyEditHint />}
                {analyzing &&
                  !editingBody &&
                  mode === 'anatomy' &&
                  muscle &&
                  layer === 'muscles' && (
                    <div className="model-hint">
                      <button
                        aria-label={`Ver ficha de ${muscleGuide[muscle].name}`}
                        onClick={() => {
                          setGuide('musculos')
                          requestAnimationFrame(() =>
                            document.getElementById('muscle-title')?.focus(),
                          )
                        }}
                      >
                        {muscleGuide[muscle].name} · Ver ficha
                      </button>
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
                        analyzing={analyzing}
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
                        onEditPart={selectBodyPart}
                        mechanics={mechanics}
                        peakMoment={peakMoment}
                        onSelectJoint={(joint) => {
                          selectJoint(joint)
                          setGuide('momentos')
                        }}
                        selectedMuscle={analyzing ? muscle : null}
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
                    showComGuides={analyzing && state.showComGuides}
                    showMomentArms={analyzing && state.showMomentArms}
                    showLoadMap={analyzing && state.showLoadMap}
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
              {editingBody && mode === 'anatomy' && (
                <BodyEditor
                  options={editableHotspotsFor(exercise, frame)}
                  selected={editPart}
                  onSelect={setEditPart}
                  editForces={editForces}
                  onEditForces={setEditForces}
                  adjustments={bodyControls.map((control) => ({
                    id: control.id,
                    kind: control.kind,
                    label: control.label,
                    control:
                      control.max > control.min ? (
                        <Slider
                          label={control.label}
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          value={control.value}
                          format={(value) =>
                            value.toLocaleString('es-AR', { maximumFractionDigits: 1 }) +
                            (control.unit === '°' || control.unit === '%' ? '' : ' ') +
                            control.unit
                          }
                          onChange={(value) =>
                            dispatch({ type: 'setParams', patch: control.patch(value) })
                          }
                        />
                      ) : (
                        <p className="param-locked">
                          {control.label} · Alcanzaste el límite de esta postura.
                        </p>
                      ),
                  }))}
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
              {!editingBody && (
                <AnalysisToggle
                  active={analyzing}
                  onChange={(value) => dispatch({ type: 'setAnalyzing', value })}
                />
              )}
              {analyzing && !editingBody && (
                <>
                  <p className="pose-explanation">
                    <strong>{observed.label}.</strong> La vertical de la barra pasa a{' '}
                    <b>{formatBarArm(observed.barArmM)}</b> de la articulación. El peso de la barra
                    aporta <b>{formatMoment(observed.barMomentNm)}</b>
                    {observed.id === 'l5s1' ? ' al tronco' : ' por pierna'}.
                  </p>
                  {mode === 'anatomy' && !editingBody && mechanics.forces && (
                    <ForceReadingGuide
                      focus={mechanics.focus}
                      onFocus={(focus) => dispatch({ type: 'setMechanics', patch: { focus } })}
                      loadPath={mechanics.loadPath}
                      feetReaction={frame.kinetics.systemWeight}
                    />
                  )}
                </>
              )}
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
            {analyzing && !editingBody && (
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
            )}
          </div>
          {analyzing && !editingBody && (
            <StudyGuide
              tabs={[
                { id: 'posturas', label: 'Posturas' },
                { id: 'momentos', label: 'Articulaciones' },
                { id: 'fuerzas', label: 'Fuerzas' },
                { id: 'musculos', label: 'Músculos' },
              ]}
              value={guide}
              onChange={setGuide}
            >
              {guide === 'posturas' && (
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
              )}
              {guide === 'momentos' && (
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
              )}
              {guide === 'fuerzas' && (
                <ForceBalance
                  forces={overlay.forces}
                  note={
                    exercise === 'deadlift'
                      ? 'En el despegue, el modelo supone que las manos ya sostienen todo el peso de la barra.'
                      : 'La reacción total bajo ambos pies equilibra el peso del cuerpo y el de la barra.'
                  }
                />
              )}
              {guide === 'musculos' && (
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
              )}
            </StudyGuide>
          )}
        </div>
      </main>
      <SettingsDialog open={panelOpen} onClose={() => setPanelOpen(false)}>
        {panels}
        <LabFooter />
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
