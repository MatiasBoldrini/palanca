import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from 'three'

/** Some mobile GPUs can supply WebGL2 but cannot allocate a multisampled drawing buffer. */
export function createAtlasRenderer(maxPixelRatio: number, exposure: number) {
  const canvas = document.createElement('canvas')
  const smooth = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    powerPreference: 'low-power',
  })
  const context = smooth ?? canvas.getContext('webgl2', { alpha: false, antialias: false })
  if (!context) throw new Error('WebGL 2 no está disponible.')

  const renderer = new WebGLRenderer({ canvas, context })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smooth ? maxPixelRatio : 1))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = exposure
  return renderer
}
