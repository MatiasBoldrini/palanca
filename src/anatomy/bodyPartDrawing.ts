import { Vector3, type OrthographicCamera } from 'three'
import './bodyPartDrawing.css'

type WorldPoint = { x: number; y: number; z: number }

export interface BodyPartTarget<K extends string> {
  id: K
  label: string
  point: WorldPoint
  segment?: readonly WorldPoint[]
  dimension?: {
    ends: [WorldPoint, WorldPoint]
    offsetEnds: [WorldPoint, WorldPoint]
    label: string
  }
}

const namespace = 'http://www.w3.org/2000/svg'
function svgNode<K extends keyof SVGElementTagNameMap>(parent: Element, name: K, cls: string) {
  const el = document.createElementNS(namespace, name)
  el.setAttribute('class', cls)
  parent.appendChild(el)
  return el
}

/** Show only the segment being edited, in the same projection as the anatomy. */
export function createBodyPartDrawing<K extends string>(host: HTMLElement) {
  const svg = svgNode(host, 'svg', 'body-part-drawing')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.display = 'none'
  const highlight = svgNode(svg, 'path', 'body-part-segment')
  const measure = svgNode(svg, 'g', 'body-part-dimension')
  measure.setAttribute('aria-hidden', 'true')
  const measureEnds = svgNode(measure, 'path', 'body-part-dimension-ends')
  const measureLine = svgNode(measure, 'path', 'body-part-dimension-line')
  const measureLabel = svgNode(measure, 'text', 'body-part-dimension-value')
  measureLabel.setAttribute('text-anchor', 'middle')
  const marker = svgNode(svg, 'circle', 'body-part-ring')
  marker.setAttribute('r', '4.5')
  const vector = new Vector3()
  function draw(
    camera: OrthographicCamera,
    width: number,
    height: number,
    targets: readonly BodyPartTarget<K>[],
    selected: K | null,
  ) {
    const activeTarget = targets.find((target) => target.id === selected)
    if (width <= 0 || height <= 0 || !activeTarget) {
      svg.style.display = 'none'
      return
    }
    svg.style.display = ''
    function project(p: WorldPoint) {
      vector.set(p.x, p.y, p.z).project(camera)
      return { x: ((1 + vector.x) * width) / 2, y: ((1 - vector.y) * height) / 2 }
    }
    const { x, y } = project(activeTarget.point)
    marker.setAttribute('cx', String(x))
    marker.setAttribute('cy', String(y))
    const { segment, dimension } = activeTarget
    measure.style.display = 'none'
    if (dimension) {
      const [originA, originB] = dimension.ends.map(project)
      const [a, b] = dimension.offsetEnds.map(project)
      const widthOnScreen = Math.hypot(a.x - b.x, a.y - b.y)
      // A transverse dimension seen end-on does not have a readable span.
      if (widthOnScreen > 22) {
        measure.style.display = ''
        const tickX = (4 * (a.y - b.y)) / widthOnScreen
        const tickY = (4 * (b.x - a.x)) / widthOnScreen
        const tick = (p: { x: number; y: number }) =>
          ' M' + (p.x - tickX) + ' ' + (p.y - tickY) + ' l' + tickX * 2 + ' ' + tickY * 2
        measureEnds.setAttribute(
          'd',
          'M' +
            originA.x +
            ' ' +
            originA.y +
            ' L' +
            a.x +
            ' ' +
            a.y +
            ' M' +
            originB.x +
            ' ' +
            originB.y +
            ' L' +
            b.x +
            ' ' +
            b.y,
        )
        measureLine.setAttribute(
          'd',
          'M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y + tick(a) + tick(b),
        )
        measureLabel.setAttribute('x', String(Math.min(width - 28, Math.max(28, (a.x + b.x) / 2))))
        measureLabel.setAttribute(
          'y',
          String(Math.min(height - 3, Math.max(12, (a.y + b.y) / 2 + 13))),
        )
        measureLabel.textContent = dimension.label
      }
    }
    const path =
      segment
        ?.map((p, i) => {
          const { x, y } = project(p)
          return (i ? 'L' : 'M') + x + ' ' + y
        })
        .join(' ') ?? ''
    highlight.setAttribute('d', path)
  }
  return {
    draw,
    hide: () => {
      svg.style.display = 'none'
    },
    dispose: () => svg.remove(),
  }
}
