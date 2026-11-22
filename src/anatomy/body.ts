import {
  Bone,
  Color,
  DataTexture,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SkinnedMesh,
  Sphere,
  Vector3,
  type BufferGeometry,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Anthropometry } from '../model/anthropometry'
import type { ExerciseId, Frame, Task } from '../model/lift'
import { createBarbell } from './barbell'
import { createRig } from './rig'

export type MuscleId =
  'quadriceps' | 'glutes' | 'hamstrings' | 'erectors' | 'calves' | 'core' | 'lats' | 'upperBody'
export type AnatomyLayer = 'muscles' | 'skeleton'
type Tissue = 'bone' | 'muscle' | 'tendon' | 'cast' | 'support'

const atlasURL = (name: string) => `${import.meta.env.BASE_URL}anatomy/${name}.glb`

// Parallel fascicles follow the UV directions baked into the atlas. Keep
// their contrast low and mipmap them to avoid shimmer during playback.
function fascicleTexture() {
  const size = 128,
    data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 2 * Math.PI,
        v = (y / size) * 2 * Math.PI
      const fibres = 0.5 + 0.5 * Math.sin(6 * u + 0.43 * Math.sin(v) + 0.28 * Math.sin(2 * u - v))
      const strand = 0.5 + 0.5 * Math.sin(15 * u + Math.sin(v + Math.cos(u)))
      const value = Math.round(255 * (0.84 + 0.12 * fibres + 0.04 * strand))
      const index = (y * size + x) * 4
      data.set([value, value, value, 255], index)
    }
  const map = new DataTexture(data, size, size, RGBAFormat)
  map.wrapS = map.wrapT = RepeatWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.anisotropy = 4
  map.needsUpdate = true
  return map
}

const baseColor: Record<Tissue, number> = {
  bone: 0xe8dbc4,
  tendon: 0xe5cbb2,
  muscle: 0xe4c4ac,
  cast: 0xd8c8b5,
  support: 0x95594e,
}
const contextColor = new Color(0xb89e92)
const selectedColor = new Color(0xf08756)

export async function createAnatomicalBody() {
  const loader = new GLTFLoader()
  const requests = ['bodyparts3d', 'z-anatomy'].map((name) => loader.loadAsync(atlasURL(name)))
  const results = await Promise.allSettled(requests)
  const root = new Group()
  const barbell = createBarbell()
  root.add(barbell.root)
  const atlas = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value.scene] : [],
  )
  root.add(...atlas)
  const texture = fascicleTexture()
  const bones: Bone[] = []
  const surfaces: {
    mesh: SkinnedMesh
    tissue: Tissue
    muscle: MuscleId | null
    material: MeshStandardMaterial
  }[] = []
  const geometry = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const skeletons = new Set<SkinnedMesh['skeleton']>()
  const originalMaterials = new Set<Material>()
  root.traverse((obj) => {
    if (obj instanceof Bone) bones.push(obj)
    if (!(obj instanceof Mesh)) return
    geometry.add(obj.geometry)
    const old = Array.isArray(obj.material) ? obj.material : [obj.material]
    if (!(obj instanceof SkinnedMesh)) {
      old.forEach((material) => materials.add(material))
      return
    }
    old.forEach((material) => originalMaterials.add(material))
    skeletons.add(obj.skeleton)
    const tissue = obj.userData.tissue as Tissue
    const muscle = obj.userData.muscle as MuscleId | null
    const material = new MeshStandardMaterial({
      color: baseColor[tissue],
      roughness: tissue === 'tendon' ? 0.55 : 0.76,
      vertexColors: tissue === 'muscle',
      map: tissue === 'muscle' ? texture : null,
    })
    materials.add(material)
    obj.geometry.computeVertexNormals()
    obj.material = material
    // All attainable poses share this bound. A pose-dependent first-click
    // bound would reject valid hits on the next frame of the lift.
    obj.boundingSphere = new Sphere(new Vector3(0, 1, 0), 3)
    surfaces.push({ mesh: obj, material, tissue, muscle })
  })
  for (const material of originalMaterials) material.dispose()
  const updatePose = createRig(bones)
  function dispose() {
    for (const skeleton of skeletons) skeleton.dispose()
    for (const g of geometry) g.dispose()
    for (const material of materials) material.dispose()
    texture.dispose()
    root.clear()
  }
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) {
    dispose()
    throw failed.reason
  }
  return {
    root,
    update(frame: Frame, anthro: Anthropometry, task: Task, exercise: ExerciseId) {
      updatePose(frame.posture, anthro, exercise)
      barbell.update(frame.posture.bar, task.plateRadius, task.load, exercise)
      root.updateMatrixWorld(true)
      // Picking can occur before the renderer's next scheduled frame.
      for (const skeleton of skeletons) skeleton.update()
    },
    style(layer: AnatomyLayer, selected: MuscleId | null) {
      for (const { mesh, material, tissue, muscle } of surfaces) {
        mesh.visible = layer === 'muscles' || tissue === 'bone'
        const focused = layer === 'muscles' && selected !== null
        const chosen = focused && selected === muscle
        const reveal =
          focused &&
          selected === 'erectors' &&
          !chosen &&
          (tissue === 'muscle' || tissue === 'tendon') &&
          mesh.userData.hotspot === 'spine'
        material.color.setHex(baseColor[tissue])
        const authoredColor = tissue === 'muscle' && !focused
        if (material.vertexColors !== authoredColor) {
          material.vertexColors = authoredColor
          material.needsUpdate = true
        }
        if (chosen) material.color.copy(selectedColor)
        else if (focused && tissue === 'muscle') material.color.copy(contextColor)
        material.emissive.setHex(chosen ? 0x381306 : 0)
        material.opacity = reveal ? 0.2 : 1
        material.transparent = reveal
        material.depthWrite = !reveal
        mesh.renderOrder = reveal ? 1 : 0
      }
    },
    dispose,
  }
}
