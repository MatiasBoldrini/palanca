import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useId, useMemo, type ReactNode } from 'react'
import { useSpringSnapshot } from '../hooks/useAnimationEngine'
import { useElementSize, useMediaQuery } from '../hooks/useMediaQuery'
import { type Vec2, clamp, lerp, lerpVec, sub } from '../model/geometry'
import type { Hotspot, HotspotId } from '../model/interact'
import type { JointKey } from '../model/kinetics'
import type { Bounds, ExerciseId, Frame } from '../model/lift'
import type { Posture } from '../model/posture'
import { ARM_COLOR } from './palette'

interface Props {
  frame: Frame
  bounds: Bounds
  exercise: ExerciseId
  color: string
  showComGuides: boolean
  showMomentArms: boolean
  showLoadMap: boolean
  plateRadius: number
  /**
   * Largest joint moment anywhere in this lift, which is what the load map is
   * measured against.
   */
  peakMoment: number
  hotspots: Hotspot[]
  selected: HotspotId | null
  onSelect: (id: HotspotId | null) => void
  /**
   * Controls that live inside the frame rather than in boxes below it. The
   * drawing reserves room for whatever height they take, so the figure sits
   * above them instead of behind them.
   */
  children?: ReactNode
  /** Floated next to whichever hotspot is selected. */
  popover?: ReactNode
  /** Column down the left edge; the drawing keeps clear of its width. */
  panel?: ReactNode
  compact?: boolean
}

const LOAD_JOINTS: { key: JointKey; label: string; point: (p: Posture) => Vec2 }[] = [
  { key: 'l5s1', label: 'Espalda baja', point: (p) => p.lumbosacral },
  { key: 'hip', label: 'Cadera', point: (p) => p.hip },
  { key: 'knee', label: 'Rodilla', point: (p) => p.knee },
  { key: 'ankle', label: 'Tobillo', point: (p) => p.ankle },
]


type Rgb = readonly [number, number, number]

/**
 * Muted heat for joint demand: dusty gold → brick → deep red. The skeleton
 * underneath stays --figure-ink; heat is an overlay that fades to transparent
 * mid-limb so low demand never paints the body white.
 */
function rgbCss(c: Rgb): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

const HEAT_STOPS: { dark: { t: number; c: Rgb }[]; light: { t: number; c: Rgb }[] } = {
  dark: [
    { t: 0, c: [0xa8, 0x8a, 0x3c] },
    { t: 0.4, c: [0xa6, 0x62, 0x34] },
    { t: 0.72, c: [0x96, 0x3e, 0x34] },
    { t: 1, c: [0x7a, 0x2c, 0x2c] },
  ],
  light: [
    { t: 0, c: [0xb8, 0x90, 0x28] },
    { t: 0.4, c: [0xb0, 0x62, 0x24] },
    { t: 0.72, c: [0x9e, 0x3a, 0x2c] },
    { t: 1, c: [0x7e, 0x24, 0x24] },
  ],
}

function loadColor(t: number, dark: boolean): string {
  const stops = dark ? HEAT_STOPS.dark : HEAT_STOPS.light
  const v = Math.pow(clamp(t, 0, 1), 0.9)
  let i = 0
  while (i < stops.length - 2 && v > stops[i + 1].t) i += 1
  const a = stops[i]
  const b = stops[i + 1]
  const u = (v - a.t) / (b.t - a.t || 1)
  const channel = (k: number) => Math.round(a.c[k] + (b.c[k] - a.c[k]) * u)
  return rgbCss([channel(0), channel(1), channel(2)])
}

/** How hard the overlay paints at a joint. Near zero, only the ink body shows. */
function heatOpacity(intensity: number): number {
  return clamp((intensity - 0.05) / 0.55, 0, 1)
}

/** Catmull-Rom through the spine landmarks, so flexion is actually visible. */
function spinePath(points: Vec2[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`
  }
  return d
}

type Projected = Record<keyof Posture, Vec2> & { headCentre: Vec2; headRadius: number }

function projectPosture(
  posture: Posture,
  project: (p: Vec2) => Vec2,
  scale: number,
): Projected {
  const headAxis = sub(posture.headTop, posture.shoulder)
  const headRadius = Math.hypot(headAxis.x, headAxis.y) * 0.29 * scale
  return {
    heel: project(posture.heel),
    toe: project(posture.toe),
    ankle: project(posture.ankle),
    knee: project(posture.knee),
    hip: project(posture.hip),
    lumbosacral: project(posture.lumbosacral),
    lumbarApex: project(posture.lumbarApex),
    thoracolumbar: project(posture.thoracolumbar),
    thoracicApex: project(posture.thoracicApex),
    shoulder: project(posture.shoulder),
    elbow: project(posture.elbow),
    hand: project(posture.hand),
    headCom: project(posture.headCom),
    headTop: project(posture.headTop),
    bar: project(posture.bar),
    headCentre: project(lerpVec(posture.shoulder, posture.headTop, 0.66)),
    headRadius,
  }
}

/**
 * Stroke paint for each stretch. With the load map on, limbs use short
 * gradients that peak at the joints and fall back to ink in the middle —
 * heat on the articulations, not a wash over the whole body.
 */
interface Paint {
  foot: string
  shank: string
  thigh: string
  spine: string
  /** Arm, neck and head — same ink as the limbs; no separate mute tone. */
  rest: string
}

/**
 * `halo` strokes the skeleton in the stage colour underneath the real body, so
 * the figure keeps its shape where it crosses the grid.
 */
function Body({
  p,
  paint,
  accent,
  weight,
  halo,
  exercise,
  plateScreenRadius,
  jointDots,
}: {
  p: Projected
  paint: Paint
  /** Colour of the implement and the joint markers, which never shows load. */
  accent: string
  weight: number
  halo: boolean
  exercise: ExerciseId
  plateScreenRadius: number
  /** Joints that are not already marked by a hotspot. */
  jointDots: { at: Vec2; colour: string }[]
}) {
  const limb = weight
  const spine = weight * 1.22
  const shank = `M ${p.ankle.x} ${p.ankle.y} L ${p.knee.x} ${p.knee.y}`
  const thigh = `M ${p.knee.x} ${p.knee.y} L ${p.hip.x} ${p.hip.y}`
  const spineD = spinePath([
    p.hip,
    p.lumbosacral,
    p.lumbarApex,
    p.thoracolumbar,
    p.thoracicApex,
    p.shoulder,
  ])
  const neck = `M ${p.shoulder.x} ${p.shoulder.y} L ${p.headCentre.x} ${p.headCentre.y}`
  const arm = `M ${p.shoulder.x} ${p.shoulder.y} L ${p.elbow.x} ${p.elbow.y} L ${p.hand.x} ${p.hand.y}`
  // Inverted T on the ground: sole heel→toe, stem ankle→sole so the shank
  // does not float above a disconnected line.
  const soleY = p.heel.y
  const soleContact = { x: p.ankle.x, y: soleY }
  const footSole = `M ${p.heel.x} ${soleY} L ${p.toe.x} ${soleY}`
  const footStem = `M ${p.ankle.x} ${p.ankle.y} L ${soleContact.x} ${soleContact.y}`

  const bump = halo ? weight * 0.85 : 0
  // In the squat the arm reaches out to the side, so its sagittal projection
  // is a hint rather than a real segment and is drawn back accordingly.
  const outOfPlaneArm = exercise === 'squat'
  const armWeight = limb * (outOfPlaneArm ? 0.58 : 0.8)
  // Same ink opacity as the rest of the skeleton; only the squat's
  // out-of-plane arm is dialled back so it reads as a hint, not a limb.
  const armOpacity = halo ? 1 : outOfPlaneArm ? 0.45 : 1
  const footWidth = limb * 0.85 + bump
  const footOpacity = 1

  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={footSole} stroke={paint.foot} strokeWidth={footWidth} opacity={footOpacity} />
      <path d={footStem} stroke={paint.foot} strokeWidth={footWidth} opacity={footOpacity} />
      <path d={shank} stroke={paint.shank} strokeWidth={limb + bump} />
      <path d={thigh} stroke={paint.thigh} strokeWidth={limb + bump} />
      <path d={spineD} stroke={paint.spine} strokeWidth={spine + bump} />
      <path d={neck} stroke={paint.rest} strokeWidth={limb * 0.78 + bump} />
      <path d={arm} stroke={paint.rest} strokeWidth={armWeight + bump} opacity={armOpacity} />
      <circle
        cx={p.headCentre.x}
        cy={p.headCentre.y}
        r={p.headRadius}
        fill="var(--figure-halo)"
        stroke={paint.rest}
        strokeWidth={limb * 0.8 + bump}
      />

      {!halo && (
        <>
          {exercise === 'deadlift' && (
            <circle
              cx={p.bar.x}
              cy={p.bar.y}
              r={plateScreenRadius}
              stroke={accent}
              strokeWidth={1.5}
              opacity={0.24}
              strokeDasharray="4 8"
            />
          )}
          {jointDots.map((dot, i) => (
            <circle
              key={i}
              cx={dot.at.x}
              cy={dot.at.y}
              r={weight * 0.46}
              fill="var(--figure-halo)"
              stroke={dot.colour}
              strokeWidth={weight * 0.34}
            />
          ))}
          <circle cx={p.bar.x} cy={p.bar.y} r={weight * 1.2} fill={accent} />
        </>
      )}
    </g>
  )
}

export function Figure({
  frame,
  bounds,
  exercise,
  color,
  showComGuides,
  showMomentArms,
  showLoadMap,
  plateRadius,
  peakMoment,
  hotspots,
  selected,
  onSelect,
  children,
  popover,
  panel,
  compact = false,
}: Props) {
  // useId() emits colons (`:r1:`) that break `url(#…)` paint servers in SVG,
  // leaving the white halo stroke visible instead of the gradient.
  const gradientId = useId().replace(/:/g, '')
  const darkScheme = useMediaQuery('(prefers-color-scheme: dark)')
  // Same breakpoint as the moment column: on a phone the floating inspector
  // would cover the body, so we dock it and zoom the camera instead.
  const narrow = useMediaQuery('(max-width: 619px)')
  const { ref, size } = useElementSize<HTMLDivElement>()
  const { ref: controlsRef, size: controlsSize } = useElementSize<HTMLDivElement>()
  const { ref: popoverRef, size: popoverSize } = useElementSize<HTMLDivElement>()
  const { ref: panelRef, size: panelSize } = useElementSize<HTMLDivElement>()

  const VIEW_W = Math.max(size.width, 200)
  const VIEW_H = Math.max(size.height, 240)

  const selectedHotspot = selected ? hotspots.find((h) => h.id === selected) : undefined
  const editing = Boolean(selectedHotspot)
  const dockInspector = narrow && editing

  const padX = compact ? 18 : 32
  const padTop = compact ? 34 : 44
  // The overlays are measured rather than guessed at, so the drawing keeps
  // clear of whatever they happen to take instead of hiding behind them.
  // On a phone the inspector sits above the transport, so the body zooms into
  // the free band above rather than hiding under the slider.
  const inspectorClearance =
    dockInspector ? Math.max(popoverSize.height || 132, 120) + 10 : 0
  const padBottom = 38 + controlsSize.height + inspectorClearance
  // While editing on a phone the curves column steps aside so the zoom has
  // the whole width.
  const padLeft =
    padX + (!dockInspector && panelSize.width ? panelSize.width + 12 : 0)
  const padRight = padX

  // The camera follows the pose instead of framing the whole lift, so the
  // athlete always fills the stage. Selecting a part tightens the frame and
  // drifts toward it — a zoom, not a cut.
  const cameraTarget = useMemo(() => {
    let minX = bounds.minX
    let maxX = bounds.maxX
    let maxY = Math.max(bounds.maxY, 0.9)

    if (selectedHotspot) {
      const focus = selectedHotspot.point
      const spanX = Math.max(maxX - minX, 0.45)
      const spanY = Math.max(maxY, 0.5)
      const keep = narrow ? 0.62 : 0.78
      const midX = lerp((minX + maxX) / 2, focus.x, narrow ? 0.55 : 0.4)
      const midY = lerp(spanY * 0.5, focus.y, narrow ? 0.45 : 0.3)
      const halfX = (spanX * keep) / 2
      const halfY = (spanY * keep) / 2
      minX = midX - halfX
      maxX = midX + halfX
      maxY = Math.max(midY + halfY, focus.y + 0.12, 0.55)
    }

    return { minX, maxX, maxY }
  }, [bounds.minX, bounds.maxX, bounds.maxY, selectedHotspot, narrow])
  const camera = useSpringSnapshot(cameraTarget, {
    stiffness: editing ? 70 : 90,
    dampingRatio: 1,
  })

  const worldW = Math.max(camera.maxX - camera.minX, 0.45)
  const worldH = Math.max(camera.maxY * 1.06, 0.5)
  const boxW = Math.max(VIEW_W - padLeft - padRight, 80)
  const boxH = VIEW_H - padTop - padBottom
  const scale = Math.min(boxW / worldW, boxH / worldH)

  // In a tall narrow pane the drawing is width-limited, so the block is
  // centred vertically rather than left sitting at the bottom of the stage.
  const groundY = padTop + (boxH + worldH * scale) / 2
  const originX = padLeft + (boxW - worldW * scale) / 2 - camera.minX * scale

  const project = useCallback(
    (p: Vec2): Vec2 => ({ x: originX + p.x * scale, y: groundY - p.y * scale }),
    [originX, groundY, scale],
  )

  const weight = Math.max(scale * 0.024, 3)
  const support = frame.support
  const heelX = originX + support.heel * scale
  const toeX = originX + support.toe * scale
  const barScreenX = originX + frame.posture.bar.x * scale
  const barScreenY = groundY - frame.posture.bar.y * scale
  const com = project(frame.kinetics.com)

  /* ------------------------------------------------------------- load map -- */

  const projected = useMemo(
    () => projectPosture(frame.posture, project, scale),
    [frame.posture, project, scale],
  )

  /*
   * Scaled to the heaviest joint in this pose. Colour rides the skeleton as
   * short gradients that peak at each joint and return to ink mid-limb, so
   * the map reads as articulation demand — not a full-body wash, not dots.
   */
  const loads = useMemo(() => {
    const magnitudes = LOAD_JOINTS.map((joint) => Math.abs(frame.kinetics.moment[joint.key]))
    const framePeak = Math.max(...magnitudes, 1)
    const peak = Math.max(framePeak, peakMoment * 0.22, 1)
    return LOAD_JOINTS.map((joint, i) => {
      const intensity = clamp(magnitudes[i] / peak, 0, 1)
      const point = joint.point(frame.posture)
      return {
        ...joint,
        intensity,
        colour: loadColor(intensity, darkScheme),
        point,
        at: project(point),
      }
    })
  }, [frame, peakMoment, darkScheme, project])

  const heat = useMemo(
    () => Object.fromEntries(loads.map((l) => [l.key, l.colour])) as Record<JointKey, string>,
    [loads],
  )

  const heatOp = useMemo(
    () =>
      Object.fromEntries(loads.map((l) => [l.key, heatOpacity(l.intensity)])) as Record<
        JointKey,
        number
      >,
    [loads],
  )

  // A joint that already carries a hotspot does not also need a joint dot: the
  // two marks land on the same pixel and read as one smudge.
  const jointDots = useMemo(() => {
    const handled = new Set(hotspots.map((h) => h.id))
    const dots: { at: Vec2; colour: string }[] = []
    const tint = (key: JointKey) =>
      showLoadMap && heatOp[key] > 0.2 ? heat[key] : 'var(--figure-ink)'
    if (!handled.has('knee')) dots.push({ at: projected.knee, colour: tint('knee') })
    if (!handled.has('hip')) dots.push({ at: projected.hip, colour: tint('hip') })
    // The squat bar sits on the acromion, so marking the shoulder as well
    // would just double up the same dot.
    if (exercise === 'deadlift') {
      dots.push({ at: projected.shoulder, colour: 'var(--figure-ink)' })
    }
    return dots
  }, [hotspots, projected, exercise, showLoadMap, heat, heatOp])

  const shankGradient = `${gradientId}-shank`
  const thighGradient = `${gradientId}-thigh`
  const spineGradient = `${gradientId}-spine`
  const ink = 'var(--figure-ink)'

  // Where L5/S1 sits along the hip→shoulder axis, for the spine gradient stops.
  const spineL5 = useMemo(() => {
    const axis = sub(projected.shoulder, projected.hip)
    const lengthSq = axis.x * axis.x + axis.y * axis.y
    if (lengthSq < 1e-6) return 0.28
    const toL5 = sub(projected.lumbosacral, projected.hip)
    return clamp((toL5.x * axis.x + toL5.y * axis.y) / lengthSq, 0.12, 0.55)
  }, [projected])

  // One ink for the whole skeleton. Heat is a second stroke that fades out
  // mid-segment, so quiet joints never bleach the body.
  const paint: Paint = {
    foot: ink,
    shank: ink,
    thigh: ink,
    spine: ink,
    rest: ink,
  }

  const limb = weight
  const spineW = weight * 1.22
  const soleY = projected.heel.y
  const soleContact = { x: projected.ankle.x, y: soleY }
  const heatPaths = {
    footSole: `M ${projected.heel.x} ${soleY} L ${projected.toe.x} ${soleY}`,
    footStem: `M ${projected.ankle.x} ${projected.ankle.y} L ${soleContact.x} ${soleContact.y}`,
    shank: `M ${projected.ankle.x} ${projected.ankle.y} L ${projected.knee.x} ${projected.knee.y}`,
    thigh: `M ${projected.knee.x} ${projected.knee.y} L ${projected.hip.x} ${projected.hip.y}`,
    spine: spinePath([
      projected.hip,
      projected.lumbosacral,
      projected.lumbarApex,
      projected.thoracolumbar,
      projected.thoracicApex,
      projected.shoulder,
    ]),
  }

  /**
   * Desktop: beside the joint. Phone: docked above the transport so the zoom
   * can show the body without the slider sitting on top of it.
   */
  const popoverStyle = useMemo(() => {
    if (!selectedHotspot) return undefined

    if (dockInspector) {
      return {
        left: 10,
        right: 10,
        bottom: controlsSize.height + 6,
        top: 'auto' as const,
      }
    }

    const at = project(selectedHotspot.point)
    const width = popoverSize.width || 244
    const height = popoverSize.height || 150
    const gap = 20
    const toRight = at.x + gap + width <= VIEW_W - 10
    const left = toRight ? at.x + gap : Math.max(at.x - gap - width, 10)
    const lowest = Math.max(10, VIEW_H - controlsSize.height - height - 10)
    return {
      left: Math.min(left, Math.max(10, VIEW_W - width - 10)),
      top: clamp(at.y - height / 2, 10, lowest),
    }
  }, [
    selectedHotspot,
    dockInspector,
    project,
    popoverSize,
    controlsSize.height,
    VIEW_W,
    VIEW_H,
  ])

  const haloPaint: Paint = {
    foot: 'var(--figure-halo)',
    shank: 'var(--figure-halo)',
    thigh: 'var(--figure-halo)',
    spine: 'var(--figure-halo)',
    rest: 'var(--figure-halo)',
  }

  return (
    <div
      className={dockInspector ? 'figure focus-edit' : editing ? 'figure editing' : 'figure'}
      ref={ref}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="figure-svg"
        role="img"
        aria-label={`Modelo de ${exercise === 'deadlift' ? 'peso muerto' : 'sentadilla'}`}
        onClick={() => onSelect(null)}
      >
        <defs>
          {showLoadMap && (
            <>
              {/* Mid-limb stops are transparent: the ink body underneath shows
                  through, so low demand never turns a segment white. */}
              <linearGradient
                id={shankGradient}
                gradientUnits="userSpaceOnUse"
                x1={projected.ankle.x}
                y1={projected.ankle.y}
                x2={projected.knee.x}
                y2={projected.knee.y}
              >
                <stop offset="0" stopColor={heat.ankle} stopOpacity={heatOp.ankle} />
                <stop offset="0.2" stopColor={heat.ankle} stopOpacity={heatOp.ankle} />
                <stop offset="0.5" stopColor={heat.ankle} stopOpacity="0" />
                <stop offset="0.8" stopColor={heat.knee} stopOpacity={heatOp.knee} />
                <stop offset="1" stopColor={heat.knee} stopOpacity={heatOp.knee} />
              </linearGradient>
              <linearGradient
                id={thighGradient}
                gradientUnits="userSpaceOnUse"
                x1={projected.knee.x}
                y1={projected.knee.y}
                x2={projected.hip.x}
                y2={projected.hip.y}
              >
                <stop offset="0" stopColor={heat.knee} stopOpacity={heatOp.knee} />
                <stop offset="0.2" stopColor={heat.knee} stopOpacity={heatOp.knee} />
                <stop offset="0.5" stopColor={heat.knee} stopOpacity="0" />
                <stop offset="0.8" stopColor={heat.hip} stopOpacity={heatOp.hip} />
                <stop offset="1" stopColor={heat.hip} stopOpacity={heatOp.hip} />
              </linearGradient>
              <linearGradient
                id={spineGradient}
                gradientUnits="userSpaceOnUse"
                x1={projected.hip.x}
                y1={projected.hip.y}
                x2={projected.shoulder.x}
                y2={projected.shoulder.y}
              >
                <stop offset="0" stopColor={heat.hip} stopOpacity={heatOp.hip} />
                <stop
                  offset={Math.max(spineL5 - 0.12, 0.04)}
                  stopColor={heat.hip}
                  stopOpacity="0"
                />
                <stop offset={spineL5} stopColor={heat.l5s1} stopOpacity={heatOp.l5s1} />
                <stop
                  offset={Math.min(spineL5 + 0.14, 0.7)}
                  stopColor={heat.l5s1}
                  stopOpacity={heatOp.l5s1}
                />
                <stop
                  offset={Math.min(spineL5 + 0.28, 0.88)}
                  stopColor={heat.l5s1}
                  stopOpacity="0"
                />
                <stop offset="1" stopColor={heat.l5s1} stopOpacity="0" />
              </linearGradient>
            </>
          )}
        </defs>

        <rect width={VIEW_W} height={VIEW_H} fill="var(--stage)" rx="22" />

        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].map((h) =>
          groundY - h * scale > padTop * 0.4 ? (
            <line
              key={h}
              x1="14"
              x2={VIEW_W - 14}
              y1={groundY - h * scale}
              y2={groundY - h * scale}
              stroke="var(--grid)"
              strokeWidth="1"
              strokeDasharray="1 8"
            />
          ) : null,
        )}

        <line
          x1="10"
          x2={VIEW_W - 10}
          y1={groundY}
          y2={groundY}
          stroke="var(--hairline-strong)"
          strokeWidth="1.5"
        />
        <rect
          x={heelX}
          y={groundY + 1}
          width={toeX - heelX}
          height="4.5"
          rx="2.25"
          fill="var(--text-3)"
          opacity="0.55"
        />
        <line
          x1={originX}
          x2={originX}
          y1={groundY - 5}
          y2={groundY + 12}
          stroke="var(--text-3)"
          strokeWidth="1.5"
        />

        {/* The load's line of action. In the deadlift it is carried up past the
            shoulder, which is where a vertical arm puts it and where a leaning
            one visibly does not: the line makes the assumption, and any
            departure from it, something you can see rather than take on faith.
            It stays behind the body, being a faint full-height reference that is
            not worth punching through the figure. */}
        {showMomentArms && (
          <line
            x1={barScreenX}
            x2={barScreenX}
            y1={exercise === 'deadlift' ? Math.min(barScreenY, projected.shoulder.y) : barScreenY}
            y2={groundY}
            stroke="var(--text-3)"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        )}

        <Body
          p={projected}
          paint={haloPaint}
          accent={color}
          weight={weight}
          halo
          exercise={exercise}
          plateScreenRadius={plateRadius * scale}
          jointDots={jointDots}
        />
        <Body
          p={projected}
          paint={paint}
          accent={color}
          weight={weight}
          halo={false}
          exercise={exercise}
          plateScreenRadius={plateRadius * scale}
          jointDots={jointDots}
        />

        {showLoadMap && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
            <path
              d={heatPaths.footSole}
              stroke={heat.ankle}
              strokeWidth={limb * 0.85}
              opacity={0.78 * heatOp.ankle}
            />
            <path
              d={heatPaths.footStem}
              stroke={heat.ankle}
              strokeWidth={limb * 0.85}
              opacity={0.78 * heatOp.ankle}
            />
            <path d={heatPaths.shank} stroke={`url(#${shankGradient})`} strokeWidth={limb} />
            <path d={heatPaths.thigh} stroke={`url(#${thighGradient})`} strokeWidth={limb} />
            <path d={heatPaths.spine} stroke={`url(#${spineGradient})`} strokeWidth={spineW} />
          </g>
        )}

        {/* In front of the body, each line carrying a knockout in the stage
            colour underneath it. A dimension line that disappears behind the
            object it measures is useless, and one laid flat on top of it is a
            mess; breaking the figure open along the line is how a technical
            drawing resolves exactly this. */}
        {showMomentArms &&
          loads.map((load, index) => {
            const at = load.at
            const span = Math.abs(barScreenX - at.x)
            if (span < 8) return null
            // Labels alternate above and below the line, because two joints
            // can sit only a few pixels apart.
            const above = index % 2 === 0
            const arm = ARM_COLOR[load.key]
            const dimension = (stroke: string, bump: number) => (
              <g stroke={stroke} strokeLinecap="round">
                <line x1={at.x} x2={barScreenX} y1={at.y} y2={at.y} strokeWidth={1.25 + bump} />
                <line x1={at.x} x2={at.x} y1={at.y - 4} y2={at.y + 4} strokeWidth={1.5 + bump} />
                <line
                  x1={barScreenX}
                  x2={barScreenX}
                  y1={at.y - 4}
                  y2={at.y + 4}
                  strokeWidth={1.5 + bump}
                />
              </g>
            )
            return (
              <g key={`arm-${load.key}`}>
                {dimension('var(--stage)', 3.5)}
                {dimension(arm, 0)}
                {/* A number on a stub of a line is noise, and it is the case
                    most likely to land on a neighbouring label. */}
                {span >= 42 && (
                  <text
                    x={(at.x + barScreenX) / 2}
                    y={at.y + (above ? -6 : 13)}
                    textAnchor="middle"
                    className="figure-note num"
                    fill={arm}
                    stroke="var(--stage)"
                    strokeWidth="3"
                    paintOrder="stroke"
                  >
                    {Math.abs(frame.kinetics.barMomentArm[load.key] * 100).toFixed(0)} cm
                  </text>
                )}
              </g>
            )
          })}

        {frame.barBlocked && (
          <line
            x1={barScreenX - weight * 1.6}
            x2={barScreenX - weight * 1.6}
            y1={barScreenY - weight * 2}
            y2={barScreenY + weight * 2}
            stroke="var(--text)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.85"
          />
        )}

        {showComGuides && (
          <g>
            <line
              x1={com.x}
              x2={com.x}
              y1={com.y}
              y2={groundY}
              stroke={color}
              strokeWidth="1.25"
              strokeDasharray="3 4"
              opacity="0.55"
            />
            {/* Sits wherever the combined mass balances, which at light loads
                is inside the body: the halo ring keeps it from disappearing
                into the limb it lands on. */}
            <circle cx={com.x} cy={com.y} r="8" fill="var(--figure-halo)" opacity="0.92" />
            <circle cx={com.x} cy={com.y} r="8" fill="none" stroke={color} strokeWidth="1.75" />
            <line
              x1={com.x - 4.5}
              x2={com.x + 4.5}
              y1={com.y}
              y2={com.y}
              stroke={color}
              strokeWidth="1.5"
            />
            <line
              x1={com.x}
              x2={com.x}
              y1={com.y - 4.5}
              y2={com.y + 4.5}
              stroke={color}
              strokeWidth="1.5"
            />
            {/* Below and to the left: the lever arms are horizontal lines with
                horizontal labels, so anything level with this marker is asking
                to collide with one. Outlined because it often lands on a limb,
                where plain text vanishes. */}
            <text
              x={com.x - 10}
              y={com.y + 17}
              textAnchor="end"
              className="figure-note"
              fill={color}
              stroke="var(--stage)"
              strokeWidth="3"
              paintOrder="stroke"
            >
              centro de masa
            </text>
          </g>
        )}

        {hotspots.map((hotspot) => {
          const at = project(hotspot.point)
          const active = selected === hotspot.id
          const isCop = hotspot.id === 'cop'
          // Limbs get the quieter marker: they set the proportions of the
          // person, which is a setup decision, while the joints set the
          // posture, which is what the app is about.
          const base = hotspot.path ? 9 : 12
          const side = active ? base + 3 : base
          const limb = hotspot.path
            ?.map(project)
            .map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x} ${q.y}`)
            .join(' ')
          return (
            <g
              key={hotspot.id}
              className={active ? 'fig-spot active' : 'fig-spot'}
              tabIndex={0}
              role="button"
              aria-pressed={active}
              aria-label={`Ajustar ${hotspot.label.toLowerCase()}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(active ? null : hotspot.id)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect(active ? null : hotspot.id)
              }}
            >
              {/* The highlight is always in the tree and revealed by CSS, so
                  hover and selection light up the part itself rather than only
                  its marker. Without it there is nothing to tell you a limb
                  can be touched at all. */}
              {limb ? (
                <path
                  d={limb}
                  className="fig-spot-halo"
                  fill="none"
                  stroke={color}
                  strokeWidth={weight * 2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <circle
                  cx={at.x}
                  cy={at.y}
                  r={17}
                  className="fig-spot-halo"
                  fill={color}
                  stroke="none"
                />
              )}
              {limb ? (
                <path
                  d={limb}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={weight * 2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                // The pressure marker is drawn below the ground line rather
                // than at its own point, so its target has to follow it there:
                // left on the point it would swallow the whole foot.
                <circle
                  cx={at.x}
                  cy={isCop ? groundY + 8 : at.y}
                  r={isCop ? 15 : 22}
                  fill="transparent"
                />
              )}
              {isCop ? (
                <path
                  d={`M ${at.x - 6} ${groundY + 12} L ${at.x} ${groundY + 2} L ${at.x + 6} ${groundY + 12} Z`}
                  fill={color}
                  className="fig-spot-mark"
                />
              ) : (
                // A square rather than another circle: the drawing is already
                // full of rings and discs it could be mistaken for.
                <rect
                  x={at.x - side / 2}
                  y={at.y - side / 2}
                  width={side}
                  height={side}
                  rx={side * 0.3}
                  className={limb ? 'fig-spot-mark limb' : 'fig-spot-mark'}
                  fill={active ? color : 'var(--figure-halo)'}
                  stroke={color}
                  strokeWidth="2"
                />
              )}
              {/* Says what the part is and where it stands before you commit
                  to opening it. Set away from the middle of the frame so the
                  tag runs outwards rather than across the body. */}
              <text
                x={at.x + (at.x > VIEW_W * 0.55 ? -14 : 14)}
                y={at.y + 4}
                textAnchor={at.x > VIEW_W * 0.55 ? 'end' : 'start'}
                className="fig-spot-tag"
                fill="var(--text)"
                stroke="var(--stage)"
                strokeWidth="3.5"
                paintOrder="stroke"
              >
                {hotspot.label}
                {hotspot.readout ? ` · ${hotspot.readout}` : ''}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Carries the joint names in their own colours, so it is the key for the
          lever arms as well as a readout of its own. */}
      <div
        className="figure-panel"
        ref={panelRef}
        aria-hidden={dockInspector || undefined}
      >
        {panel}
      </div>

      <AnimatePresence>
        {popover && (
          <motion.div
            key={selected ?? 'popover'}
            className={dockInspector ? 'popover-layer docked' : 'popover-layer'}
            ref={popoverRef}
            style={popoverStyle}
            initial={{
              opacity: 0,
              y: dockInspector ? 18 : 10,
              scale: dockInspector ? 1 : 0.96,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: dockInspector ? 14 : 8,
              scale: dockInspector ? 1 : 0.96,
            }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {popover}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="figure-controls" ref={controlsRef}>
        {children}
      </div>
    </div>
  )
}
