// Offline asset preparation. Inputs are the four public files named in creditos.html.
// node src/anatomy/prepare-atlas.mjs anatomy.glb skeleton.glb mesh_mapping.json FMA7163.stl
import { readFileSync, writeFileSync } from 'node:fs'
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js'

const [muscleFile, skeletonFile, mappingFile, skinFile] = process.argv.slice(2)
const catalogue = new Map(JSON.parse(readFileSync(mappingFile)).map((m) => [m.name, m]))
const out = new URL('../../public/anatomy/', import.meta.url)
const bones = [
  'pelvis',
  'lumbarLow',
  'lumbarHigh',
  'thoraxLow',
  'thoraxHigh',
  'head',
  ...['L', 'R'].flatMap((side) =>
    ['foot', 'shin', 'thigh', 'upperArm', 'forearm', 'hand'].map((part) => part + side),
  ),
]
const sources = { bp3d: new Map(), zanatomy: new Map() }
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const blend = (a, b, t) => [
  [bones.indexOf(a), 1 - t],
  [bones.indexOf(b), t],
]
const one = (name) => [[bones.indexOf(name), 1]]

// Coordinates in the source atlas are millimetres, with the vertex along +Z.
// Each entry names actual anatomy: nearby hands must never bind to the pelvis.
function region(name, bone, x, y, z) {
  if (
    /finger|thumb|metacarp|hand|wrist|capitate|hamate|pisiform|scaphoid|trapezi(um|oid)|lunate|triquetr|pollicis|palmar interosse/.test(
      name,
    ) &&
    z < 830
  )
    return 'hand'
  if (
    /forearm|ulna|radius|radialis|digitorum superficialis|digitorum profundus|carpi|digiti minimi|brachioradialis|palmaris|pronator|supinator|extensor digitorum$|extensor indicis/.test(
      name,
    ) &&
    z > 600 &&
    x > 165
  )
    return 'forearm'
  if (/humerus|brachi|anconeus|deltoid/.test(name)) return 'upperArm'
  if (/patella/.test(name)) return 'knee'
  if (
    /femur|femoris|vastus|semitendinosus|semimembranosus|sartorius|gracilis|adductor (longus|magnus|brevis|minimus)|pectineus|fasciae latae|iliotibial/.test(
      name,
    )
  )
    return 'thigh'
  if (/gluteus|gemellus|obturator|piriformis/.test(name)) return 'gluteal'
  if (
    /tibia|fibul|gastrocnemius|soleus|calcaneal tendon|leg|hallucis longus|digitorum longus|plantaris|popliteus/.test(
      name,
    )
  )
    return 'shin'
  if (z < 70) return 'foot'
  if (z < 585) return 'shin'
  if (x > 185 && z < 870) return 'hand'
  if (x > 185 && z < 1040) return 'forearm'
  if (x > 175 && z < 1235) return 'upperArm'
  if (/hip bone|sacrum|coccyx/.test(name)) return 'pelvis'
  if (bone && /rib|scapula|clavicle|sternum|manubrium|xiphoid/.test(name)) return 'ribcage'
  if (z > 1460 || (bone && /mandible|maxilla|hyoid/.test(name))) return 'head'
  return 'spine'
}

function spineWeights(z) {
  if (z < 947) return blend('pelvis', 'lumbarLow', smooth(887, 947, z))
  if (z < 1010) return blend('lumbarLow', 'lumbarHigh', smooth(955, 1010, z))
  if (z < 1095) return blend('lumbarHigh', 'thoraxLow', smooth(1025, 1095, z))
  if (z < 1290) return blend('thoraxLow', 'thoraxHigh', smooth(1145, 1220, z))
  return blend('thoraxHigh', 'head', smooth(1315, 1440, z))
}

function weights(part, side, z, rigid) {
  const chain = (...names) => names.map((n) => n + side)
  if (part === 'ribcage') return one('thoraxHigh')
  if (part === 'spine') return spineWeights(z)
  if (part === 'head' || part === 'pelvis') return one(part)
  if (part === 'knee') return blend(...chain('shin', 'thigh'), 0.55)
  if (part === 'gluteal') return blend('thigh' + side, 'pelvis', smooth(690, 820, z))
  if (rigid || part === 'foot') return one(part + side)
  if (part === 'thigh' || part === 'shin') {
    if (z < 65) return blend(...chain('foot', 'shin'), smooth(-24, 61, z))
    if (z < 445) return blend(...chain('shin', 'thigh'), smooth(323, 430, z))
    return blend('thigh' + side, 'pelvis', smooth(747, 884, z))
  }
  if (z < 855) return blend(...chain('hand', 'forearm'), smooth(787, 851, z))
  if (z < 1120) return blend(...chain('forearm', 'upperArm'), smooth(990, 1085, z))
  return blend('upperArm' + side, 'thoraxHigh', smooth(1260, 1345, z) * 0.76)
}

function muscleId(n) {
  if (/vastus|rectus femoris/.test(n)) return 'quadriceps'
  if (/gluteus/.test(n)) return 'glutes'
  if (/biceps femoris|semimembranosus|semitendinosus/.test(n)) return 'hamstrings'
  if (/longissimus|iliocostalis|(^| )spinalis/.test(n)) return 'erectors'
  if (/gastrocnemius|soleus/.test(n)) return 'calves'
  if (/rectus abdominis|external oblique|internal oblique|transversus abdominis/.test(n))
    return 'core'
  if (/latissimus/.test(n)) return 'lats'
  if (/deltoid|pectoralis|trapezius|brachii|brachialis|brachioradialis|carpi/.test(n))
    return 'upperBody'
  return ''
}

function sourceMesh(file, bone) {
  const b = readFileSync(file)
  const size = b.readUInt32LE(12),
    gltf = JSON.parse(b.toString('utf8', 20, 20 + size))
  function accessor(id, Type) {
    const a = gltf.accessors[id],
      bv = gltf.bufferViews[a.bufferView]
    return new Type(
      b.buffer,
      b.byteOffset + 28 + size + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0),
      a.count * { SCALAR: 1, VEC3: 3 }[a.type],
    )
  }
  const rectusWidth = new Map()
  for (const item of gltf.meshes.filter((m) => /rectus abdominis/.test(m.name))) {
    const xyz = accessor(item.primitives[0].attributes.POSITION, Float32Array)
    for (let i = 0; i < xyz.length; i += 3) {
      const band = Math.round(xyz[i + 2] / 24)
      rectusWidth.set(band, Math.max(rectusWidth.get(band) ?? 0, Math.abs(xyz[i])))
    }
  }
  if (rectusWidth.size) {
    const margin = new Map()
    for (const item of gltf.meshes.filter((m) => /rectus abdominis/.test(m.name))) {
      const xyz = accessor(item.primitives[0].attributes.POSITION, Float32Array)
      for (let i = 0; i < xyz.length; i += 3) {
        const x = Math.abs(xyz[i]),
          y = xyz[i + 1],
          z = xyz[i + 2]
        if (x > 18) continue
        const band = Math.round(z / 16),
          row = margin.get(band) ?? { width: Infinity, front: Infinity }
        row.width = Math.min(row.width, x)
        row.front = Math.min(row.front, y)
        margin.set(band, row)
      }
    }
    const strip = {
      muscle: '',
      hotspot: 'spine',
      tissue: 'tendon',
      positions: [],
      indices: [],
      joints: [],
      weights: [],
      colors: [],
      uv: [],
    }
    Array.from(margin.keys())
      .sort((a, b) => a - b)
      .forEach((band, i) => {
        const { width, front } = margin.get(band),
          z = band * 16
        const w = spineWeights(z),
          w0 = Math.round(w[0][1] * 255)
        for (const side of [-1, 1]) {
          strip.positions.push((-front - 77) / 1000, (z + 72) / 1000, (side * (width + 4)) / 1000)
          strip.joints.push(w[0][0], w[1][0], 0, 0)
          strip.weights.push(w0, 255 - w0, 0, 0)
        }
        if (i) {
          const a = 2 * i - 2
          strip.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
        }
      })
    sources.zanatomy.set('lineaAlba', strip)
  }
  for (const item of gltf.meshes) {
    const name = item.name,
      prim = item.primitives[0],
      meta = catalogue.get(name)
    // Omit internal viscera, ocular muscles and duplicate tissue variants.
    if (
      /sphincter|diaphragm|arytenoid|thyroid|pterygoid|levator veli|tensor veli|levator ani|puborectalis|coccygeus|pubococcygeus|superior rectus|medial rectus|lateral rectus|inferior rectus|superior oblique$|inferior oblique$|\(\d\)/.test(
        name,
      )
    )
      continue
    if (
      !bone &&
      /intercostal|intertransvers|interspinal|interosse|lumbrical|levator(es)? cost|brevis of|gemellus|psoas|quadratus femoris|obturator|cervicis|crico|thyro|geniohyoid|stylohyoid|transversus thoracis|scalenus|serratus posterior|longus colli|palmaris brevis/.test(
        name,
      )
    )
      continue
    const a = gltf.accessors[prim.attributes.POSITION]
    const [cx, cy, cz] = a.min.map((v, i) => (v + a.max[i]) / 2)
    const part = region(name, bone, Math.abs(cx), cy, cz)
    const side = cx >= 0 ? 'L' : 'R'
    let positions = accessor(prim.attributes.POSITION, Float32Array)
    if (!bone && part === 'head') continue
    const idx = accessor(
      prim.indices,
      gltf.accessors[prim.indices].componentType === 5125 ? Uint32Array : Uint16Array,
    )
    const weld = MeshoptSimplifier.generatePositionRemap(positions, 3)
    for (let i = 0; i < idx.length; i++) idx[i] = weld[idx[i]]
    // Reflect the flat anterior oblique aponeuroses over the rectus sheath.
    // Its lateral edge comes from the rectus mesh at each transverse station.
    let trimmed = idx
    if (/(external|internal) oblique$/.test(name)) {
      const keep = [],
        expanded = Array.from(positions),
        cuts = new Map()
      const distance = (i) => {
        const band = positions[3 * i + 2] / 24,
          lower = Math.floor(band),
          t = band - lower
        return (
          Math.abs(positions[3 * i]) -
          ((rectusWidth.get(lower) ?? 0) * (1 - t) + (rectusWidth.get(lower + 1) ?? 0) * t - 3)
        )
      }
      function cut(a, b, da, db) {
        const key = Math.min(a, b) + '/' + Math.max(a, b)
        if (cuts.has(key)) return cuts.get(key)
        const t = da / (da - db),
          at = expanded.length / 3
        for (let k = 0; k < 3; k++)
          expanded.push(positions[3 * a + k] + t * (positions[3 * b + k] - positions[3 * a + k]))
        cuts.set(key, at)
        return at
      }
      for (let i = 0; i < idx.length; i += 3) {
        const corners = []
        for (let k = 0; k < 3; k++) {
          const a = idx[i + k],
            b = idx[i + ((k + 1) % 3)],
            da = distance(a),
            db = distance(b)
          if (da >= 0) corners.push(a)
          if (da >= 0 !== db >= 0) corners.push(cut(a, b, da, db))
        }
        for (let k = 1; k + 1 < corners.length; k++)
          keep.push(corners[0], corners[k], corners[k + 1])
      }
      positions = Float32Array.from(expanded)
      trimmed = new Uint32Array(keep)
    }
    const target = Math.min(
      trimmed.length,
      3 * Math.max(26, Math.min(690, Math.round((idx.length * (bone ? 0.11 : 0.08)) / 3))),
    )
    const [tri] = MeshoptSimplifier.simplify(trimmed, positions, 3, target, 0.09, [
      'Permissive',
      'Prune',
    ])
    const source = bone || meta?.source === 'bp3d' ? 'bp3d' : 'zanatomy'
    const tissue = bone
      ? 'bone'
      : meta?.isTendon || /fascia|iliotibial/.test(name)
        ? 'tendon'
        : 'muscle'
    const muscle = tissue === 'muscle' ? muscleId(name) : ''
    const hotspot = {
      head: 'spine',
      spine: 'spine',
      ribcage: 'spine',
      pelvis: 'hip',
      gluteal: 'hip',
      thigh: 'thigh',
      knee: 'knee',
      shin: 'shank',
      foot: 'foot',
      hand: 'arm',
      forearm: 'arm',
      upperArm: 'arm',
    }[part]
    // Preserve named anatomical surfaces for the bench press demand overlay.
    let benchMuscle
    if (tissue === 'muscle') {
      if (/pectoralis major/.test(name)) benchMuscle = 'pectoralis'
      if (/clavicular part of .*deltoid/.test(name)) benchMuscle = 'anteriorDeltoid'
      if (/triceps brachii/.test(name)) benchMuscle = 'triceps'
    }
    const key = [tissue, muscle, hotspot, ...(benchMuscle ? [benchMuscle] : [])].join('_')
    const group = sources[source].get(key) ?? {
      muscle,
      benchMuscle,
      hotspot,
      tissue,
      positions: [],
      indices: [],
      joints: [],
      weights: [],
      colors: [],
      uv: [],
    }
    sources[source].set(key, group)
    const remap = new Map()
    const tint = 0.8 + (0.2 * (item.name.length % 13)) / 12
    const isCurtain = /intercostal|dorsi|trapezius|oblique|pectoralis|fascia/.test(name)
    for (const old of tri) {
      if (!remap.has(old)) {
        const [x, y, z] = positions.subarray(old * 3, old * 3 + 3)
        const index = group.positions.length / 3
        remap.set(old, index)
        const w = weights(part, side, bone && part === 'spine' ? cz : z, bone)
        let px = (-y - 75) / 1000,
          py = (z + 72) / 1000
        // Curl the open reference hands into a closed, bilateral overhand grip.
        if (part === 'hand' || (part === 'forearm' && z < 812)) {
          const h = (806 - z) / 1000
          const f = Math.max(0, Math.min(4.95, (h - 0.065) / 0.026))
          px = px - 0.28 * h - 0.023 * (1 - Math.cos(f))
          py = 0.878 - Math.min(0.065, h) - 0.024 * Math.sin(f)
        }
        group.positions.push(px, py, -x / 1000)
        const wb = w.map((v) => Math.round(v[1] * 255))
        if (wb.length > 1) wb[1] = 255 - wb[0]
        group.joints.push(...w.map((v) => v[0]), ...Array(4 - w.length).fill(0))
        group.weights.push(...wb, ...Array(4 - w.length).fill(0))
        // Vertex tint marks changes of tissue and tapers the long limb bellies to their attachments.
        const h = (z - a.min[2]) / Math.max(1, a.max[2] - a.min[2])
        const tapered =
          tissue === 'muscle' && ['shin', 'thigh', 'upperArm', 'forearm'].includes(part)
        const fascia = tapered ? Math.min(0.73, (Math.pow(1 - h, 6) + Math.pow(h, 6)) * 0.77) : 0
        const shade = /rectus abdominis|rectus femoris|lateral head/.test(name) ? 1.06 : 0.97
        group.colors.push(
          ...[0.74, 0.19, 0.15].map((c) =>
            Math.round(255 * Math.min(1, tint * shade * (c + (1 - c) * fascia))),
          ),
          255,
        )
        // Project along the local fibre direction with slight fan-out on flat muscles.
        const lateral = /rectus abdominis/.test(name)
          ? Math.abs(x)
          : isCurtain
            ? 0.47 * (z - cz) + 0.7 * (Math.abs(x) - Math.abs(cx)) + 0.24 * (y - cy)
            : x * 0.68 + y * 0.73
        group.uv.push(lateral / 65, (z - cz) / 173)
      }
      group.indices.push(remap.get(old))
    }
  }
}

function writeGLB(groups, filename) {
  const buffers = [],
    views = [],
    accessors = [],
    meshes = []
  let offset = 0
  const nodes = bones.map((name) => ({ name }))
  function add(array, type, components, shape, target, extra = {}) {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength)
    views.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: bytes.length,
      ...(target ? { target } : {}),
    })
    const pad = (4 - (bytes.length % 4)) % 4
    buffers.push(bytes, Buffer.alloc(pad))
    offset += bytes.length + pad
    accessors.push({
      bufferView: views.length - 1,
      componentType: type,
      count: array.length / components,
      type: shape,
      ...extra,
    })
    return accessors.length - 1
  }
  for (const [name, g] of groups) {
    const P = Float32Array.from(g.positions),
      min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < P.length; i++) {
      const k = i % 3
      min[k] = Math.min(min[k], P[i])
      max[k] = Math.max(max[k], P[i])
    }
    const idx =
      g.positions.length / 3 > 65535 ? Uint32Array.from(g.indices) : Uint16Array.from(g.indices)
    const pos = add(P, 5126, 3, 'VEC3', 34962, { min, max })
    const attr = {
      POSITION: pos,
      JOINTS_0: add(Uint8Array.from(g.joints), 5121, 4, 'VEC4', 34962),
      WEIGHTS_0: add(Uint8Array.from(g.weights), 5121, 4, 'VEC4', 34962, { normalized: true }),
    }
    if (g.tissue === 'muscle') {
      attr.COLOR_0 = add(Uint8Array.from(g.colors), 5121, 4, 'VEC4', 34962, { normalized: true })
      attr.TEXCOORD_0 = add(Float32Array.from(g.uv), 5126, 2, 'VEC2', 34962)
    }
    meshes.push({
      name,
      primitives: [
        {
          attributes: attr,
          indices: add(idx, idx.BYTES_PER_ELEMENT === 4 ? 5125 : 5123, 1, 'SCALAR', 34963),
        },
      ],
    })
    nodes.push({
      name,
      mesh: meshes.length - 1,
      skin: 0,
      extras: { tissue: g.tissue, muscle: g.muscle || null, hotspot: g.hotspot, benchMuscle: g.benchMuscle },
    })
  }
  const joints = bones.map((_, i) => i)
  const skeletonRoot = nodes.push({ name: 'AtlasRig', children: joints }) - 1
  const tree = {
    asset: {
      version: '2.0',
      generator: 'Palanca / prepare-atlas.mjs',
      copyright:
        filename === 'bodyparts3d'
          ? 'BodyParts3D © The Database Center for Life Science, CC BY-SA 2.1 Japan'
          : 'Z-Anatomy © Gauthier Kervyn et al., CC BY-SA 4.0',
    },
    buffers: [{ byteLength: offset }],
    bufferViews: views,
    accessors,
    meshes,
    nodes,
    skins: [{ joints, skeleton: skeletonRoot }],
    scenes: [{ nodes: nodes.map((_, i) => i).slice(bones.length) }],
    scene: 0,
  }
  const json = Buffer.from(JSON.stringify(tree)),
    jpad = Buffer.alloc((4 - (json.length % 4)) % 4, 32)
  const j = Buffer.concat([json, jpad]),
    payload = Buffer.concat(buffers)
  const h = Buffer.alloc(20),
    bh = Buffer.alloc(8)
  h.write('glTF')
  h.writeUInt32LE(2, 4)
  h.writeUInt32LE(28 + j.length + payload.length, 8)
  h.writeUInt32LE(j.length, 12)
  h.write('JSON', 16)
  bh.writeUInt32LE(payload.length)
  bh.writeUInt32LE(0x004e4942, 4)
  writeFileSync(new URL(filename + '.glb', out), Buffer.concat([h, j, bh, payload]))
  console.log(
    filename,
    groups.size,
    'draw groups,',
    Math.round(payload.length / 1024),
    'KiB,',
    [...groups.values()].reduce((n, g) => n + g.indices.length / 3, 0),
    'triangles',
  )
}

// Cut a facial cast from the matching BodyParts3D skin. It masks facial
// structures in muscle view; the skull remains available in skeleton view.
// A recessed, unlabelled support at the hip fills the gap between superficial
// groups that can otherwise open during deep flexion of the teaching rig.
function skinCasts(file) {
  const source = readFileSync(file),
    count = source.readUInt32LE(80)
  for (const head of [true, false]) {
    const vertices = [],
      triangles = [],
      lookup = new Map()
    for (let i = 0; i < count; i++) {
      const o = 84 + i * 50 + 12
      const x = source.readFloatLE(o),
        y = source.readFloatLE(o + 4),
        z = source.readFloatLE(o + 8)
      const jaw = 1410 + 49 * smooth(-141, -72, y)
      if (head ? z < jaw : z < 745 || z > 895 || Math.abs(x) > 160 || Math.abs(x) < 76) continue
      for (let k = 0; k < 3; k++) {
        const p = [0, 4, 8].map((d) => source.readFloatLE(o + k * 12 + d))
        const key = p.map((v) => Math.round(v * 100)).join('/')
        if (!lookup.has(key)) {
          lookup.set(key, vertices.length / 3)
          vertices.push(...p)
        }
        triangles.push(lookup.get(key))
      }
    }
    const positions = Float32Array.from(vertices)
    const [cut] = MeshoptSimplifier.simplify(
      Uint32Array.from(triangles),
      positions,
      3,
      head ? 5600 * 3 : 1500 * 3,
      0.08,
      ['Permissive', 'Prune'],
    )
    const g = {
      muscle: '',
      hotspot: head ? 'spine' : 'hip',
      tissue: head ? 'cast' : 'support',
      positions: [],
      indices: [],
      joints: [],
      weights: [],
      colors: [],
      uv: [],
    }
    const remap = new Map()
    for (const old of cut) {
      if (!remap.has(old)) {
        let [x, y, z] = positions.subarray(old * 3, old * 3 + 3)
        const w = head ? one('head') : weights('gluteal', x >= 0 ? 'L' : 'R', z, false)
        remap.set(old, g.positions.length / 3)
        if (head) {
          x *= 1.035
          y = (y + 90) * 1.035 - 90
          z = (z - 1510) * 1.025 + 1510
        } else {
          x *= 0.79
          y = (y + 75) * 0.48 - 75
        }
        g.positions.push((-y - 75) / 1000, (z + 72) / 1000, -x / 1000)
        g.joints.push(...w.map((k) => k[0]), ...Array(4 - w.length).fill(0))
        const w0 = Math.round(w[0][1] * 255)
        g.weights.push(w0, 255 - w0, 0, 0)
      }
      g.indices.push(remap.get(old))
    }
    sources.bp3d.set(g.tissue, g)
  }
}
await MeshoptSimplifier.ready
sourceMesh(muscleFile, false)
sourceMesh(skeletonFile, true)
skinCasts(skinFile)
writeGLB(sources.bp3d, 'bodyparts3d')
writeGLB(sources.zanatomy, 'z-anatomy')
