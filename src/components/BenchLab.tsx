import { Bone, BookOpen, Box, ChartSpline, Layers3, Spline } from 'lucide-react'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { usePlayback } from '../hooks/useAnimationEngine'
import { BENCH_GRIP, buildBenchFrame, type BenchJointId } from '../model/bench'
import { formatBarArm, formatMoment } from '../model/mechanicsOverlay'
import { useApp, useShareLink } from '../state/appState'
import { ForceReadingGuide } from './ForceReadingGuide'
import { BENCH_JOINTS, benchForces } from '../model/benchOverlay'
import { BodyEditor, BodyEditToggle } from './BodyEditor'
import { BENCH_PARTS, type BenchPartId } from '../model/bodyEditing'
import { PARAM_LIMITS } from '../model/interact'
import { PARAM_UI } from './params'
import { BenchDiagram } from './BenchDiagram'
import { ExerciseHeading, LabFooter, LabHeader } from './LabHeader'
import { LiftTransport } from './LiftTransport'
import { ForceBalance, MechanicsControls } from './MechanicsControls'
import { SettingsDialog } from './SettingsDialog'
import { Slider } from './ui'
import { ViewerBoundary } from './ViewerBoundary'

const BenchViewer = lazy(() => import('./BenchViewer'))
const RANGE = { min: 0, max: 1 }
const JOINT_HELP = {
  shoulder:
    'Desde los pies se ve la separación lateral entre el hombro y la mano. Cambiá el ancho de agarre y observá cómo varía esa distancia.',
  elbow:
    'Seguí la vertical de la mano. Cuanto más se aleja del codo, mayor es el momento que la barra genera sobre él.',
  wrist:
    'La distancia entre la muñeca y el centro del agarre explica el pequeño momento que puede quedar en esta articulación.',
}

export function BenchLab() {
  const { state, dispatch } = useApp()
  const share = useShareLink()
  const { anthro, task, bench, mechanics } = state
  const [mode, setMode] = useState<'anatomy' | 'diagram'>('anatomy')
  const [layer, setLayer] = useState<'muscles' | 'skeleton'>('muscles')
  const [unavailable, setUnavailable] = useState(false)
  const [settings, setSettings] = useState(false)
  const [shared, setShared] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const [editForces, setEditForces] = useState(false)
  const [editPart, setEditPart] = useState<BenchPartId>('arm')
  const [slow, setSlow] = useState(false)
  const frameAt = useCallback(
    (t: number) =>
      buildBenchFrame(t, task.load, anthro.height, anthro.mass, bench.gripRatio, anthro),
    [task.load, anthro, bench.gripRatio],
  )
  const frame = useMemo(() => frameAt(bench.progress), [frameAt, bench.progress])
  const series = useMemo(() => Array.from({ length: 65 }, (_, i) => frameAt(i / 64)), [frameAt])
  const peaks = useMemo(() => {
    const result = { shoulder: 0, elbow: 0, wrist: 0 }
    for (const f of series)
      for (const { id } of BENCH_JOINTS) {
        result[id] = Math.max(result[id], f.arms[0].moments[id].magnitudeNm)
      }
    return result
  }, [series])
  const peak = Math.max(1, ...Object.values(peaks))
  const curves = useMemo(
    () =>
      Object.fromEntries(
        BENCH_JOINTS.map(({ id }) => [
          id,
          series
            .map(
              (f, i) =>
                (i ? 'L' : 'M') +
                ((100 * i) / (series.length - 1)).toFixed(2) +
                ',' +
                (26 - (23 * f.arms[0].moments[id].magnitudeNm) / peak).toFixed(2),
            )
            .join(' '),
        ]),
      ),
    [series, peak],
  )
  const arm = frame.arms[0]
  const selected = bench.joint
  const joint = selected === 'all' ? null : selected
  const observed = joint ?? 'shoulder'
  const armLength = Math.hypot(arm[observed].x - arm.grip.x, arm[observed].z - arm.grip.z)
  const selectJoint = useCallback(
    (value: BenchJointId | 'all') => {
      setEditingBody(false)
      dispatch({ type: 'setBench', patch: { joint: value } })
      dispatch({ type: 'setMechanics', patch: { moments: true, focus: 'all' } })
    },
    [dispatch],
  )
  const stop = useCallback(() => dispatch({ type: 'setPlaying', playing: false }), [dispatch])
  const progress = useCallback(
    (value: number) => dispatch({ type: 'setBench', patch: { progress: value } }),
    [dispatch],
  )
  const fallback = useCallback(() => {
    setMode('diagram')
    setUnavailable(true)
  }, [])
  const phase = usePlayback(
    bench.progress,
    state.playing,
    progress,
    stop,
    RANGE,
    slow ? 14 : 7,
    'bench',
  )

  const gripSlider = (
    <Slider
      label="Ancho de agarre"
      value={bench.gripRatio}
      min={BENCH_GRIP.min}
      max={BENCH_GRIP.max}
      step={0.05}
      format={(v) => formatBarArm(2 * arm.grip.z) + ' · ' + v.toLocaleString('es-AR') + '× hombros'}
      onChange={(v) => dispatch({ type: 'setBench', patch: { gripRatio: v } })}
      hint="La distancia entre las manos se expresa en múltiplos del ancho de hombros."
    />
  )
  const partSettings =
    editPart === 'grip' ? (
      gripSlider
    ) : editPart === 'bar' ? (
      <Slider
        label="Carga de la barra"
        value={task.load}
        min={PARAM_LIMITS.load.min}
        max={PARAM_LIMITS.load.max}
        step={PARAM_UI.load.step}
        format={PARAM_UI.load.format}
        onChange={(load) => dispatch({ type: 'setTask', patch: { load } })}
      />
    ) : (
      <Slider
        label={PARAM_UI[editPart].label}
        value={Number((anthro[editPart] * 100).toFixed(2))}
        min={Math.round(PARAM_LIMITS[editPart].min * 100)}
        max={Math.round(PARAM_LIMITS[editPart].max * 100)}
        step={PARAM_UI[editPart].step}
        format={PARAM_UI[editPart].format}
        onChange={(size) => dispatch({ type: 'setAnthro', patch: { [editPart]: size / 100 } })}
      />
    )
  return (
    <div className="atlas-app">
      <LabHeader
        onSettings={() => {
          stop()
          setSettings(true)
        }}
      />
      <main className="atlas-main">
        <ExerciseHeading
          name="Press de banca"
          load={task.load}
          description="Observá cuánto sostienen el banco y los pies a medida que la barra sube desde el pecho."
        />
        <div
          className="atlas-layout"
          id="exercise-panel"
          role="tabpanel"
          aria-labelledby="exercise-bench"
        >
          <div className="lift-column">
            <section
              className="atlas-card viewer-card"
              aria-label="Simulador del levantamiento"
              data-force-focus={mechanics.forces && !editingBody ? mechanics.focus : 'all'}
            >
              <div className="view-toolbar">
                <div className="view-modes" role="group" aria-label="Representación">
                  <button
                    aria-pressed={mode === 'anatomy'}
                    onClick={() => {
                      setMode('anatomy')
                      setUnavailable(false)
                    }}
                  >
                    <Box size={16} aria-hidden />
                    Anatomía 3D
                  </button>
                  <button
                    aria-pressed={mode === 'diagram'}
                    onClick={() => {
                      setMode('diagram')
                      setUnavailable(false)
                    }}
                  >
                    <Spline size={16} aria-hidden />
                    Diagrama 2D
                  </button>
                </div>
                <div className="viewer-actions">
                  <BodyEditToggle
                    active={editingBody}
                    onClick={() => {
                      stop()
                      setEditingBody(!editingBody)
                    }}
                  />
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
                        onChange={(e) =>
                          setLayer(e.target.value === 'skeleton' ? 'skeleton' : 'muscles')
                        }
                      >
                        <option value="muscles">Músculos</option>
                        <option value="skeleton">Esqueleto</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>
              {editingBody ? (
                <BodyEditor
                  editForces={editForces}
                  onEditForces={setEditForces}
                  selected={editPart}
                  onSelect={setEditPart}
                  options={(Object.keys(BENCH_PARTS) as BenchPartId[]).map((id) => ({
                    id,
                    label: BENCH_PARTS[id],
                  }))}
                >
                  {partSettings}
                </BodyEditor>
              ) : (
                <MechanicsControls<BenchJointId>
                  {...mechanics}
                  options={BENCH_JOINTS}
                  joint={selected}
                  onJoint={selectJoint}
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
                />
              )}
              {unavailable && (
                <p className="fallback-note" role="status">
                  Se abrió el diagrama del mismo movimiento porque el visor 3D no pudo iniciarse.
                </p>
              )}
              <div className={'atlas-viewport ' + mode} id="lift-viewport" tabIndex={-1}>
                {mode === 'anatomy' ? (
                  <ViewerBoundary onUnavailable={fallback}>
                    <Suspense
                      fallback={
                        <p className="viewer-loading" role="status">
                          Cargando el atlas anatómico…
                        </p>
                      }
                    >
                      <BenchViewer
                        frame={frame}
                        layer={layer}
                        joint={selected}
                        editingBody={editingBody}
                        editForces={editForces}
                        editPart={editPart}
                        onEditPart={setEditPart}
                        showForces={mechanics.forces}
                        showLoadPath={mechanics.loadPath}
                        showMoments={mechanics.moments}
                        showBarArm={mechanics.lever}
                        peaks={peaks}
                        onUnavailable={fallback}
                        onSelectJoint={selectJoint}
                      />
                    </Suspense>
                  </ViewerBoundary>
                ) : (
                  <BenchDiagram
                    frame={frame}
                    height={anthro.height}
                    {...mechanics}
                    editingBody={editingBody}
                    editForces={editForces}
                    editPart={editPart}
                    onEditPart={setEditPart}
                    joint={selected}
                    peak={peak}
                  />
                )}
              </div>
              {!editingBody && mechanics.forces && (
                <ForceReadingGuide
                  focus={mechanics.focus}
                  onFocus={(focus) => dispatch({ type: 'setMechanics', patch: { focus } })}
                  loadPath={mechanics.loadPath}
                  benchReaction={frame.forces.benchN}
                  feetReaction={frame.forces.feetN}
                />
              )}
              <LiftTransport
                marker="Barra"
                height={frame.bar.y}
                lowerStop="Pecho"
                progress={bench.progress}
                range={RANGE}
                playing={state.playing}
                phase={phase}
                slow={slow}
                onSpeed={() => setSlow(!slow)}
                onPlay={() => {
                  setEditingBody(false)
                  dispatch({ type: 'setPlaying', playing: !state.playing })
                }}
                onScrub={(value) => {
                  stop()
                  progress(value)
                }}
              />
              <p className="pose-explanation">
                <strong>{BENCH_JOINTS.find((j) => j.id === observed)?.label}.</strong> La vertical
                de la mano pasa a <b>{formatBarArm(armLength)}</b> de la articulación. La mitad del
                peso de la barra genera{' '}
                <b>{formatMoment((armLength * Math.abs(frame.forces.barN)) / 2)}</b> por brazo.
              </p>
            </section>
            {!editingBody && <section className="atlas-card bench-grip">{gripSlider}</section>}
          </div>
          <aside className="atlas-rail" aria-label="Guía del movimiento">
            <section className="atlas-card moments-card">
              <h2 className="rail-title">
                <ChartSpline size={18} aria-hidden />
                Momentos articulares
              </h2>
              <p className="rail-intro">
                Cada arco representa el giro interno que equilibra la carga sobre un brazo. Elegí
                una articulación para ver su palanca.
              </p>
              <div className="moment-panel">
                {BENCH_JOINTS.map(({ id, label }) => (
                  <button
                    key={id}
                    className="moment-chart"
                    aria-pressed={selected === id}
                    onClick={() => selectJoint(id)}
                  >
                    <span className="moment-label">{label}</span>
                    <span className="moment-value">
                      {formatMoment(arm.moments[id].magnitudeNm)}
                    </span>
                    {state.showCurves && (
                      <svg viewBox="0 0 100 29" preserveAspectRatio="none" aria-hidden="true">
                        <path d={curves[id]} fill="none" stroke="#886696" strokeWidth="1.6" />
                        <circle
                          cx={100 * bench.progress}
                          cy={26 - (23 * arm.moments[id].magnitudeNm) / peak}
                          r="2.4"
                          fill="#754493"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <p className="moment-note">
                Magnitud total por brazo. El peso de la barra se reparte por igual entre las manos.
              </p>
              {joint && (
                <div className="joint-detail">
                  <strong>{BENCH_JOINTS.find((j) => j.id === joint)?.label}</strong>
                  <dl>
                    <div>
                      <dt>Brazo de la carga en la mano</dt>
                      <dd>
                        {formatBarArm(
                          Math.hypot(arm[joint].x - arm.grip.x, arm[joint].z - arm.grip.z),
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p>{JOINT_HELP[joint]}</p>
                </div>
              )}
            </section>
            <ForceBalance
              forces={benchForces(frame)}
              note="Las reacciones del banco y de los pies equilibran el peso del cuerpo y el de la barra."
            />
            <section className="atlas-card moments-card">
              <h2 className="rail-title">
                <BookOpen size={18} aria-hidden />
                Qué observar
              </h2>
              <p className="rail-intro">
                Pausá en el pecho, elegí Hombro y cambiá el agarre. Girá la cámara hacia los pies
                para ver la distancia lateral entre mano y hombro.
              </p>
              <p className="moment-note">
                El pectoral mayor actúa sobre el hombro y el tríceps extiende el codo. Para comparar
                sus articulaciones, fijate cuánto se aleja la vertical de la mano de cada una al
                bajar.
              </p>
            </section>
          </aside>
        </div>
        <LabFooter bench />
      </main>
      <SettingsDialog open={settings} onClose={() => setSettings(false)}>
        <section className="section">
          <h3>Barra y cuerpo</h3>
          <Slider
            label="Carga de la barra"
            min={20}
            max={400}
            value={task.load}
            step={2.5}
            format={(v) => v + ' kg'}
            onChange={(load) => dispatch({ type: 'setTask', patch: { load } })}
          />
          <Slider
            label="Peso corporal"
            min={40}
            max={180}
            value={anthro.mass}
            format={(v) => v + ' kg'}
            onChange={(mass) => dispatch({ type: 'setAnthro', patch: { mass } })}
          />
          <p className="caption">
            Las medidas se comparten entre ejercicios. Estatura del modelo (
            {Math.round(anthro.height * 100)} cm).
          </p>
        </section>
        <section className="section">
          <h3>Cómo se calcula</h3>
          <p className="rail-intro">
            En cada postura se equilibran los pesos y las reacciones verticales. El contacto de la
            espalda y la pelvis se resume en un apoyo a la altura de los hombros. El modelo omite la
            aceleración, el empuje horizontal contra la barra y el impulso de las piernas.
          </p>
          <p className="caption">
            Las mediciones experimentales también encuentran fuerzas horizontales al variar el
            agarre.{' '}
            <a href="https://pubmed.ncbi.nlm.nih.gov/33554113/" target="_blank" rel="noreferrer">
              Larsen y colaboradores (2021)
            </a>
            .
          </p>
        </section>
        <button
          className="icon-button share-in-panel"
          onClick={async () => setShared(await share())}
        >
          {shared ? 'Enlace copiado' : 'Compartir enlace'}
        </button>
      </SettingsDialog>
    </div>
  )
}
