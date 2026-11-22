import { Vector3, type OrthographicCamera } from 'three'
import { GRAVITY } from '../model/anthropometry'
import { lateralAlongFoot } from '../model/jointLandmarks'
import type { ExerciseId, Frame, Task } from '../model/lift'
import type { MechanicsView } from '../model/mechanicsOverlay'
import { centreOfMass } from '../model/posture'
import { createForceGlyph, FORCE_LENGTH_IN_HEIGHTS } from './mechanicsDrawing'
import './loadPathDrawing.css'

interface DrawingProps {
  exercise: ExerciseId
  anthro: { height: number }
  frame: Frame
  mechanics: MechanicsView
  task: Task
}

interface Point {
  x: number
  y: number
}
interface Shaft {
  x: number
  top: number
  bottom: number
}
const svgNamespace = 'http://www.w3.org/2000/svg'
const contactIds = ['leftHand', 'rightHand', 'back', 'leftFoot', 'rightFoot'] as const
type Contact = (typeof contactIds)[number]

/** Vertical external forces acting on the athlete, with symmetric loading of the two limbs. */
export function createLoadPathDrawing(host: HTMLElement) {
  const svg = document.createElementNS(svgNamespace, 'svg')
  svg.classList.add('load-path-drawing')
  svg.setAttribute('aria-hidden', 'true')
  host.appendChild(svg)
  const glyphs = new Map(
    contactIds.map((id) => {
      const group = document.createElementNS(svgNamespace, 'g')
      group.setAttribute('data-contact', id)
      group.setAttribute('data-force-kind', id.endsWith('Foot') ? 'support' : 'bar')
      group.setAttribute('color', id.endsWith('Foot') ? '#087568' : '#285b98')
      svg.appendChild(group)
      return [id, { group, draw: createForceGlyph(group) }]
    }),
  )
  const world = new Vector3()

  function draw(
    { exercise, anthro, frame, mechanics, task }: DrawingProps,
    camera: OrthographicCamera,
    width: number,
    height: number,
  ): Point[] {
    const visible = mechanics.forces && mechanics.loadPath
    svg.style.display = visible ? '' : 'none'
    if (!visible) return []
    const project = (x: number, y: number, z: number): Point => {
      world.set(x, y, z).project(camera)
      return { x: ((1 + world.x) * width) / 2, y: ((1 - world.y) * height) / 2 }
    }
    const actorHeight = anthro.height
    const barWeight = task.load * GRAVITY
    const total = frame.kinetics.systemWeight
    const metresPerNewton = (actorHeight * FORCE_LENGTH_IN_HEIGHTS) / total
    const body = centreOfMass(frame.massPoints)
    const bodyStart = project(body.x, body.y, 0)
    const bodyEnd = project(body.x, body.y - (total - barWeight) * metresPerNewton, 0)
    const occupied: Shaft[] = [{ x: bodyStart.x, top: bodyStart.y, bottom: bodyEnd.y }]
    const marks: Point[] = []

    function contact(id: Contact, origin: Point, tip: Point, preferredShift: number) {
      const entry = glyphs.get(id)!
      entry.group.style.display = ''
      const top = Math.min(origin.y, tip.y)
      const bottom = Math.max(origin.y, tip.y)
      // Parallel shafts stay distinguishable in profile, with a witness to
      // the real contact when their projections share a line of action.
      const lane = 23
      const candidates = [preferredShift, 0, -lane, lane, -2 * lane, 2 * lane, -3 * lane, 3 * lane]
      const shift =
        candidates.find((dx) =>
          occupied.every(
            (other) =>
              Math.abs(other.x - (origin.x + dx)) >= lane ||
              top > other.bottom + 5 ||
              bottom < other.top - 5,
          ),
        ) ?? preferredShift
      entry.draw(origin, tip, shift)
      occupied.push({ x: origin.x + shift, top, bottom })
      marks.push(
        origin,
        { x: origin.x + shift, y: origin.y },
        { x: tip.x + shift, y: tip.y },
        { x: tip.x + shift, y: (origin.y + tip.y) / 2 },
      )
    }

    function pair(
      left: Contact,
      right: Contact,
      x: number,
      y: number,
      lateral: number,
      newtons: number,
    ) {
      const a = project(x, y, -lateral)
      const b = project(x, y, lateral)
      const close = Math.abs(a.x - b.x) < 23
      const separation = a.x < b.x ? -12 : 12
      const endY = y + newtons * metresPerNewton
      contact(left, a, project(x, endY, -lateral), close ? separation : 0)
      contact(right, b, project(x, endY, lateral), close ? -separation : 0)
    }

    if (exercise === 'deadlift') {
      glyphs.get('back')!.group.style.display = 'none'
      const { x, y } = frame.posture.hand
      pair('leftHand', 'rightHand', x, y, frame.stance.gripHalf, -barWeight / 2)
    } else {
      glyphs.get('leftHand')!.group.style.display = 'none'
      glyphs.get('rightHand')!.group.style.display = 'none'
      const { x, y } = frame.posture.bar
      contact('back', project(x, y, 0), project(x, y - barWeight * metresPerNewton, 0), 0)
    }
    pair(
      'leftFoot',
      'rightFoot',
      frame.centreOfPressure,
      0,
      lateralAlongFoot(frame.stance, frame.posture.ankle.x, frame.centreOfPressure),
      total / 2,
    )
    return marks
  }

  return { draw, dispose: () => svg.remove() }
}
