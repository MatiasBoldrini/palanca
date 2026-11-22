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

/** Projects both touch targets and their labels using the camera that drew the body. */
export function createBodyPartDrawing<K extends string>(
  host: HTMLElement,
  onSelect: (part: K) => void,
) {
  const svg = svgNode(host, 'svg', 'body-part-drawing')
  svg.setAttribute('role', 'group')
  svg.setAttribute('aria-label', 'Partes ajustables del cuerpo')
  svg.style.display = 'none'
  const highlight = svgNode(svg, 'path', 'body-part-segment')
  const measure = svgNode(svg, 'g', 'body-part-dimension')
  measure.setAttribute('aria-hidden', 'true')
  const measureEnds = svgNode(measure, 'path', 'body-part-dimension-ends')
  const measureLine = svgNode(measure, 'path', 'body-part-dimension-line')
  const measureLabel = svgNode(measure, 'text', 'body-part-dimension-value')
  measureLabel.setAttribute('text-anchor', 'middle')
  const links = svgNode(svg, 'g', 'body-part-links')
  const anchors = svgNode(svg, 'g', 'body-part-anchors')
  const labels = svgNode(svg, 'g', 'body-part-labels')
  const vector = new Vector3()

  function makeTarget(id: K) {
    const leader = svgNode(links, 'path', 'body-part-leader')
    const dotGroup = svgNode(anchors, 'g', 'body-part-anchor')
    dotGroup.setAttribute('data-edit-anchor', id)
    dotGroup.setAttribute('aria-hidden', 'true')
    const hit = svgNode(dotGroup, 'circle', 'body-part-hit')
    hit.setAttribute('r', '12')
    const ring = svgNode(dotGroup, 'circle', 'body-part-ring')
    ring.setAttribute('r', '4.2')
    const dot = svgNode(dotGroup, 'circle', 'body-part-dot')
    dot.setAttribute('r', '1.5')
    const label = svgNode(labels, 'g', 'body-part-label')
    label.setAttribute('data-edit-part', id)
    label.setAttribute('role', 'button')
    label.setAttribute('tabindex', '0')
    const rect = svgNode(label, 'rect', 'body-part-card')
    rect.setAttribute('rx', '5')
    const text = svgNode(label, 'text', 'body-part-text')
    text.setAttribute('dominant-baseline', 'central')
    text.setAttribute('x', '7')
    const activate = () => onSelect(id)
    dotGroup.addEventListener('click', activate)
    label.addEventListener('click', activate)
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        activate()
      }
    })
    return { leader, dotGroup, label, rect, text }
  }

  const cache = new Map<K, ReturnType<typeof makeTarget>>()
  function draw(
    camera: OrthographicCamera,
    width: number,
    height: number,
    targets: readonly BodyPartTarget<K>[],
    selected: K | null,
  ) {
    if (width <= 0 || height <= 0 || !targets.length) {
      svg.style.display = 'none'
      return
    }
    svg.style.display = ''
    const required = new Set(targets.map((p) => p.id))
    for (const [id, node] of cache) {
      if (required.has(id)) continue
      node.leader.remove()
      node.dotGroup.remove()
      node.label.remove()
      cache.delete(id)
    }
    function project(p: WorldPoint) {
      vector.set(p.x, p.y, p.z).project(camera)
      return { x: ((1 + vector.x) * width) / 2, y: ((1 - vector.y) * height) / 2 }
    }
    const activeTarget = targets.find((target) => target.id === selected)
    const segment = activeTarget?.segment
    const dimension = activeTarget?.dimension
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
    const projected = targets.map((target) => ({ target, ...project(target.point) }))
    // Keep each label near the visible side of its marker, and give close
    // targets separate rows even when ankle, shoe and centre of pressure meet.
    projected.sort((a, b) => a.x - b.x || a.y - b.y)
    const split = Math.ceil(projected.length / 2)
    const pad = Math.max(5, (width - 680) / 2)
    const labelHeight = Math.min(31, (height - 15) / split - 3)
    const row = labelHeight + 4
    for (const [column, list] of [projected.slice(0, split), projected.slice(split)].entries()) {
      const left = column === 0
      list.sort((a, b) => a.y - b.y || a.x - b.x)
      let nextTop = 4
      list.forEach(({ target, x, y }, i) => {
        const node = cache.get(target.id) ?? makeTarget(target.id)
        cache.set(target.id, node)
        const active = target.id === selected
        const labelWidth = target.label.length * 6.7 + 15
        const lx = left ? pad : width - pad - labelWidth
        const maxTop = height - 4 - labelHeight - row * (list.length - i - 1)
        const ly = Math.min(maxTop, Math.max(nextTop, y - labelHeight / 2))
        nextTop = ly + row
        const edge = left ? lx + labelWidth : lx
        const elbow = edge + (left ? 1 : -1) * 9
        node.leader.setAttribute(
          'd',
          'M' + edge + ' ' + (ly + labelHeight / 2) + ' H' + elbow + ' L' + x + ' ' + y,
        )
        node.leader.classList.toggle('selected', active)
        node.dotGroup.classList.toggle('selected', active)
        node.dotGroup.setAttribute('transform', 'translate(' + x + ' ' + y + ')')
        node.label.setAttribute('transform', 'translate(' + lx + ' ' + ly + ')')
        node.label.setAttribute('aria-pressed', String(active))
        node.label.setAttribute('aria-label', 'Ajustar ' + target.label.toLocaleLowerCase('es-AR'))
        node.rect.setAttribute('width', String(labelWidth))
        node.rect.setAttribute('height', String(labelHeight))
        node.text.setAttribute('y', String(labelHeight / 2))
        if (node.text.textContent !== target.label) node.text.textContent = target.label
      })
    }
  }
  return {
    draw,
    hide: () => {
      svg.style.display = 'none'
    },
    dispose: () => svg.remove(),
  }
}
