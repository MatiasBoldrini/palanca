import { Bone, Matrix4, Vector3 } from 'three'
import type { Anthropometry } from '../model/anthropometry'
import type { Vec2 } from '../model/geometry'
import { jointLateralOffset } from '../model/jointLandmarks'
import type { ExerciseId, Frame } from '../model/lift'

const v = (x: number, y: number, z = 0) => new Vector3(x, y, z)
const world = (p: Vec2, z = 0) => v(p.x, p.y, z)

// The atlas uses millimetres with +Z up. These are joint centres read from its
// bone surfaces and converted to metres in the solver's sagittal coordinates.
function landmark(lateral: number, anterior: number, height: number) {
  return v((anterior - 75) / 1000, (height + 72) / 1000, -lateral / 1000)
}

function axisFrame(start: Vector3, end: Vector3, roll = 0) {
  const axis = end.clone().sub(start).normalize()
  const front = v(axis.y, -axis.x, 0).normalize()
  if (roll) front.applyAxisAngle(axis, roll)
  const side = front.clone().cross(axis).normalize()
  return new Matrix4().makeBasis(front, axis, side).setPosition(start)
}

interface Link {
  name: string
  from: Vector3
  to: Vector3
  inverseRest: Matrix4
  length: number
}

function link(name: string, from: Vector3, to: Vector3): Link {
  return { name, from, to, inverseRest: axisFrame(from, to).invert(), length: from.distanceTo(to) }
}

const axialNames = ['pelvis', 'lumbarLow', 'lumbarHigh', 'thoraxLow', 'thoraxHigh', 'head']
const axialLevels = [806, 925, 995, 1075, 1195, 1310, 1638]
const axial = axialNames.map((name, i) =>
  link(name, landmark(0, 75, axialLevels[i]), landmark(0, 75, axialLevels[i + 1])),
)

function limbLinks(mirror: number) {
  const side = mirror === 1 ? 'L' : 'R'
  const foot = landmark(mirror * 70, 76, 0)
  const knee = landmark(mirror * 78, 79, 370)
  const hip = landmark(mirror * 74, 82, 806)
  const shoulder = landmark(mirror * 162, 75, 1310)
  const elbow = landmark(mirror * 219, 75, 1035)
  const wrist = landmark(mirror * 254, 116, 806)
  const grip = wrist.clone().add(v(-0.023, -0.065, 0))
  return {
    side,
    mirror,
    ankle: foot,
    wrist,
    grip,
    shin: link('shin' + side, foot, knee),
    thigh: link('thigh' + side, knee, hip),
    upperArm: link('upperArm' + side, elbow, shoulder),
    forearm: link('forearm' + side, wrist, elbow),
    hand: link('hand' + side, grip, wrist),
  }
}
const sides = [limbLinks(1), limbLinks(-1)]

export { axial as restSpine, sides as restLimbs }

/** Three-dimensional landmarks used to pose and select the same arm. */
export function armLandmarks(frame: Frame, side: number) {
  const p = frame.posture
  const stance = frame.stance
  const shoulder = world(p.shoulder, side * stance.shoulderHalf)
  const elbow = world(p.elbow, side * stance.elbowHalf)
  const grip = world(p.hand, side * stance.gripHalf)
  return { shoulder, elbow, grip }
}

export function createRig(bones: Bone[]) {
  const byName = new Map<string, Bone[]>()
  for (const bone of bones) {
    bone.matrixAutoUpdate = false
    const existing = byName.get(bone.name) ?? []
    existing.push(bone)
    byName.set(bone.name, existing)
  }
  function apply(name: string, matrix: Matrix4) {
    for (const bone of byName.get(name) ?? []) {
      bone.matrix.copy(matrix)
      bone.matrixWorldNeedsUpdate = true
    }
  }
  function segment(ref: Link, from: Vector3, to: Vector3, width: number, roll = 0) {
    const basis = axisFrame(from, to, roll)
    basis.scale(v(width, from.distanceTo(to) / ref.length, width))
    apply(ref.name, basis.multiply(ref.inverseRest))
  }
  return (frame: Frame, a: Anthropometry, _exercise: ExerciseId) => {
    const { posture: p, stance } = frame
    const scale = a.height / 1.71
    const chain = [
      p.hip,
      p.lumbosacral,
      p.lumbarApex,
      p.thoracolumbar,
      p.thoracicApex,
      p.shoulder,
      p.headTop,
    ].map((point) => world(point))
    for (let i = 0; i < axial.length; i++) segment(axial[i], chain[i], chain[i + 1], scale)
    for (const ref of sides) {
      const ankle = world(p.ankle, -ref.mirror * jointLateralOffset('ankle', stance))
      const knee = world(p.knee, -ref.mirror * jointLateralOffset('knee', stance))
      const hip = world(p.hip, -ref.mirror * jointLateralOffset('hip', stance))
      const { shoulder, elbow, grip } = armLandmarks(frame, -ref.mirror)
      // A closed hand rotates around the bar's transverse axis. The wrist stays
      // on the elbow side of the shaft for both the pull and the squat grip.
      const towardElbow = v(elbow.x - grip.x, elbow.y - grip.y, 0).normalize()
      const wrist = grip.clone().addScaledVector(towardElbow, ref.hand.length * scale)
      const legRoll = ref.mirror * stance.toeOutRad
      segment(ref.thigh, knee, hip, scale, legRoll)
      segment(ref.shin, ankle, knee, scale, legRoll)
      segment(ref.upperArm, elbow, shoulder, scale)
      segment(ref.forearm, wrist, elbow, scale)
      segment(ref.hand, grip, wrist, scale)
      // Rotate about the ankle. The sagittal heel/toe span already contains
      // cos(toe-out); use the anatomical length when building the rotated sole.
      const foot = new Matrix4().makeRotationY(legRoll)
      foot.scale(v(a.foot / 0.215, p.ankle.y / ref.ankle.y, scale))
      const offset = ref.ankle.clone().applyMatrix4(foot).negate().add(ankle)
      apply('foot' + ref.side, foot.setPosition(offset))
    }
  }
}
