import type { ComponentProps, ReactNode } from 'react'
import {
  BENCH_POSE_LIMITS,
  benchElbowFlexion,
  benchKneeFlexion,
  footSlideAtKneeAngle,
  progressAtElbowFlexion,
  type BenchFrame,
  type BenchPoseSettings,
} from '../model/bench'
import { BENCH_PARTS, type BenchPartId } from '../model/bodyEditing'
import { PARAM_LIMITS } from '../model/interact'
import { useApp } from '../state/appState'
import { BodyEditor, type BodyAdjustment } from './BodyEditor'
import { PARAM_UI } from './params'
import { Slider } from './ui'

type FrameAt = (progress: number, patch?: Partial<BenchPoseSettings>) => BenchFrame
type Kind = BodyAdjustment['kind']
const options = (Object.keys(BENCH_PARTS) as BenchPartId[]).map((id) => ({
  id,
  label: BENCH_PARTS[id],
}))
const rounded = (v: number) => Number(v.toFixed(1))
const degrees = (v: number) => rounded(v).toLocaleString('es-AR') + '°'
const cm = (v: number) => rounded(v).toLocaleString('es-AR') + ' cm'
const offset = (v: number) =>
  cm(Math.abs(v)) + (v > 0 ? ' hacia la cabeza' : v < 0 ? ' hacia los pies' : '')

export function BenchBodyEditor({
  frame,
  frameAt,
  series,
  selected,
  onSelect,
  editForces,
  onEditForces,
  gripSlider,
}: {
  frame: BenchFrame
  frameAt: FrameAt
  series: BenchFrame[]
  selected: BenchPartId
  onSelect: (id: BenchPartId) => void
  editForces: boolean
  onEditForces: (value: boolean) => void
  gripSlider: ReactNode
}) {
  const {
    state: { bench, anthro, task },
    dispatch,
  } = useApp()
  const adjustments: BodyAdjustment[] = []
  function add(
    kind: Kind,
    id: string,
    label: string,
    props: Omit<ComponentProps<typeof Slider>, 'label'>,
  ) {
    adjustments.push({ id, kind, label, control: <Slider label={label} {...props} /> })
  }
  function poseControl(
    kind: Kind,
    id: keyof BenchPoseSettings,
    label: string,
    format: (v: number) => string,
    overrides: Partial<ComponentProps<typeof Slider>> = {},
  ) {
    const limits = BENCH_POSE_LIMITS[id]
    add(kind, id, label, {
      min: limits.min,
      max: limits.max,
      value: bench[id],
      format,
      onChange: (value) => dispatch({ type: 'setBench', patch: { [id]: value } }),
      ...overrides,
    })
  }
  const setPhase = (progress: number) => dispatch({ type: 'setBench', patch: { progress } })

  if (selected === 'foot' || selected === 'shank' || selected === 'thigh') {
    const neutral = frameAt(bench.progress, { footSlideCm: 0 }).pose.legs[0]
    const away = frameAt(bench.progress, { footSlideCm: BENCH_POSE_LIMITS.footSlideCm.min }).pose
      .legs[0]
    const tucked = frameAt(bench.progress, { footSlideCm: BENCH_POSE_LIMITS.footSlideCm.max }).pose
      .legs[0]
    if (selected === 'foot') {
      poseControl('rotation', 'footYawDeg', 'Giro del pie hacia afuera', degrees)
    } else {
      add('rotation', 'kneeFlexion', 'Flexión de rodilla', {
        min: Math.ceil(benchKneeFlexion(away)),
        max: Math.floor(benchKneeFlexion(tucked)),
        value: rounded(benchKneeFlexion(frame.pose.legs[0])),
        format: degrees,
        onChange: (value) =>
          dispatch({
            type: 'setBench',
            patch: { footSlideCm: footSlideAtKneeAngle(neutral, value) },
          }),
      })
    }
    poseControl('position', 'footSlideCm', 'Posición de los pies', offset, {
      min: rounded(100 * (away.ankle.x - neutral.ankle.x)),
      max: rounded(100 * (tucked.ankle.x - neutral.ankle.x)),
      value: rounded(100 * (frame.pose.legs[0].ankle.x - neutral.ankle.x)),
      step: 0.5,
    })
  }
  if (selected === 'torso') {
    const neutral =
      (Math.asin((0.019 * frame.segments.height) / frame.segments.torso) * 180) / Math.PI
    poseControl('rotation', 'torsoTiltDeg', 'Inclinación del torso', degrees, {
      min: rounded(neutral + BENCH_POSE_LIMITS.torsoTiltDeg.min),
      max: rounded(neutral + BENCH_POSE_LIMITS.torsoTiltDeg.max),
      value: rounded(neutral + bench.torsoTiltDeg),
      step: 0.1,
      onChange: (value) => dispatch({ type: 'setBench', patch: { torsoTiltDeg: value - neutral } }),
    })
    poseControl('position', 'bodySlideCm', 'Posición sobre el banco', offset, { step: 0.5 })
  }
  if (selected === 'arm' || selected === 'grip' || selected === 'bar') {
    if (selected === 'arm') {
      const angles = series.map((f) => benchElbowFlexion(f.arms[0]))
      const flexion = benchElbowFlexion(frame.arms[0])
      add('rotation', 'elbowFlexion', 'Flexión de codo', {
        min: 0,
        max: Math.floor(Math.max(...angles)),
        value: rounded(flexion),
        format: degrees,
        onChange: (value) =>
          setPhase(progressAtElbowFlexion(value, bench.progress, angles, frameAt)),
      })
      if (flexion > 1) poseControl('rotation', 'elbowTurnDeg', 'Giro del plano del codo', degrees)
      else
        adjustments.push({
          kind: 'rotation',
          id: 'elbowTurnDeg',
          label: 'Giro del plano del codo',
          control: (
            <p className="caption">Flexioná el codo para girar su plano manteniendo el agarre.</p>
          ),
        })
    }
    if (selected === 'grip')
      adjustments.push({
        kind: 'position',
        id: 'grip',
        label: 'Ancho de agarre',
        control: gripSlider,
      })
    const low = series[0].bar.y * 100,
      high = series[series.length - 1].bar.y * 100
    add('position', 'barHeight', 'Altura de la barra', {
      min: low,
      max: high,
      value: frame.bar.y * 100,
      step: 0.25,
      format: cm,
      onChange: (value) => setPhase(Math.max(0, Math.min(1, (value - low) / (high - low)))),
    })
    poseControl('position', 'barShiftCm', 'Desplazamiento de la barra', offset, {
      value: Math.min(bench.barShiftCm, frame.maxBarShiftCm),
      max: frame.maxBarShiftCm,
      step: 0.5,
      hint:
        frame.maxBarShiftCm < BENCH_POSE_LIMITS.barShiftCm.max
          ? 'El apoyo de los pies limita el desplazamiento hacia la cabeza.'
          : undefined,
    })
  }
  if (selected === 'bar') {
    const limits = PARAM_LIMITS.load
    add('other', 'load', 'Carga', {
      min: limits.min,
      max: limits.max,
      value: task.load,
      step: PARAM_UI.load.step,
      format: PARAM_UI.load.format,
      onChange: (load) => dispatch({ type: 'setTask', patch: { load } }),
    })
  } else if (selected !== 'grip') {
    const limits = PARAM_LIMITS[selected]
    add('length', selected, PARAM_UI[selected].label, {
      min: limits.min * 100,
      max: limits.max * 100,
      value: rounded(anthro[selected] * 100),
      step: PARAM_UI[selected].step,
      format: cm,
      onChange: (value) => dispatch({ type: 'setAnthro', patch: { [selected]: value / 100 } }),
    })
  }
  return (
    <BodyEditor
      selected={selected}
      onSelect={onSelect}
      editForces={editForces}
      onEditForces={onEditForces}
      options={options}
      adjustments={adjustments}
    />
  )
}
