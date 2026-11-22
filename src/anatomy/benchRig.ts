import { Bone, Matrix4, Vector3 } from 'three'
import { GRAVITY } from '../model/anthropometry'
import type { BenchFrame, BenchPoint } from '../model/bench'
import type { createAnatomicalBody, AnatomyLayer } from './body'
import { restLimbs, restSpine } from './rig'

type Body = Awaited<ReturnType<typeof createAnatomicalBody>>
const vector = (p: BenchPoint) => new Vector3(p.x, p.y, p.z)
const up = new Vector3(0, 1, 0)
const footward = new Vector3(-1, 0, 0)

// The reference rig's +X is anterior and +Y runs from distal to proximal.
// In supine coordinates the head points along +X and anterior points up.
function orientedFrame(start: Vector3, end: Vector3, anterior: Vector3) {
  const axis = end.clone().sub(start).normalize()
  const front = anterior.clone().addScaledVector(axis, -anterior.dot(axis)).normalize()
  const side = front.clone().cross(axis)
  return new Matrix4().makeBasis(front, axis, side).setPosition(start)
}

export function createBenchRig(body: Pick<Body, 'root' | 'style' | 'barbell'>) {
  const bones = new Map<string, Bone[]>()
  body.root.traverse((node) => {
    if (node instanceof Bone) {
      node.matrixAutoUpdate = false
      const group = bones.get(node.name) ?? []
      group.push(node)
      bones.set(node.name, group)
    }
  })
  function apply(name: string, transform: Matrix4) {
    for (const bone of bones.get(name) ?? []) {
      bone.matrix.copy(transform)
      bone.matrixWorldNeedsUpdate = true
    }
  }
  function segment(
    ref: (typeof restSpine)[number],
    start: Vector3,
    end: Vector3,
    front: Vector3,
    scale: number,
  ) {
    const matrix = orientedFrame(start, end, front)
    matrix.scale(new Vector3(scale, start.distanceTo(end) / ref.length, scale))
    apply(ref.name, matrix.multiply(ref.inverseRest))
  }
  let previousLayer: AnatomyLayer | undefined
  return (frame: BenchFrame, layer: AnatomyLayer) => {
    const hip = vector(frame.pose.hip)
    const shoulder = vector(frame.arms[0].shoulder)
      .add(vector(frame.arms[1].shoulder))
      .multiplyScalar(0.5)
    const scale = frame.segments.height / 1.71
    const spine = (level: number) =>
      hip
        .clone()
        .lerp(shoulder, (level - restSpine[0].from.y) / (restSpine[5].from.y - restSpine[0].from.y))
    for (const ref of restSpine) {
      const end = ref.name === 'head' ? vector(frame.pose.head).lerp(shoulder, -0.4) : spine(ref.to.y)
      segment(ref, spine(ref.from.y), end, up, scale)
    }
    restLimbs.forEach((ref, i) => {
      const arm = frame.arms[i],
        leg = frame.pose.legs[i]
      const ankle = vector(leg.ankle),
        knee = vector(leg.knee),
        hipJoint = vector(leg.hip)
      const elbow = vector(arm.elbow),
        grip = vector(arm.grip),
        wrist = vector(arm.wrist)
      segment(ref.shin, ankle, knee, footward, scale)
      segment(ref.thigh, knee, hipJoint, up, scale)
      const armAxis = vector(arm.shoulder).sub(elbow).normalize()
      // The IK plane remains defined at lockout, even with a shoulder-width grip.
      const frontArm = vector(arm.elbowPlaneNormal).cross(armAxis).normalize()
      segment(ref.upperArm, elbow, vector(arm.shoulder), frontArm, scale)
      const transverse = new Vector3(0, 0, i === 0 ? 1 : -1)
      segment(ref.forearm, wrist, elbow, transverse, scale)
      segment(ref.hand, grip, wrist, footward, scale)
      const toe = vector(leg.toe),
        heel = vector(leg.heel)
      const forward = toe.sub(heel).setY(0).normalize()
      const foot = new Matrix4().makeBasis(forward, up, forward.clone().cross(up))
      const footWidth = Math.abs(leg.toe.x - leg.heel.x) / 0.215
      foot.scale(new Vector3(footWidth, ankle.y / ref.ankle.y, scale))
      foot.setPosition(ref.ankle.clone().applyMatrix4(foot).negate().add(ankle))
      apply('foot' + ref.side, foot)
    })
    if (previousLayer !== layer) {
      body.style(layer, null)
      previousLayer = layer
    }
    body.barbell.update(frame.bar, 0.225, Math.abs(frame.forces.barN) / GRAVITY, 'bench')
    body.root.updateMatrixWorld(true)
  }
}
