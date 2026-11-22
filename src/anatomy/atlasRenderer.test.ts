import { WebGLRenderer } from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { createAtlasRenderer } from './atlasRenderer'

vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: vi.fn(
    class {
      setPixelRatio = vi.fn()
    },
  ),
}))

function browserWithContexts(...contexts: (object | null)[]) {
  const canvas = { getContext: vi.fn(() => contexts.shift() ?? null) }
  const createElement = vi.fn(() => canvas)
  vi.stubGlobal('document', { createElement })
  vi.stubGlobal('window', { devicePixelRatio: 3 })
  return { canvas, createElement }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('uses the antialiased WebGL2 context when available and caps pixel density', () => {
  const smooth = {}
  const { canvas } = browserWithContexts(smooth)
  const renderer = createAtlasRenderer(1.65, 1)
  expect(canvas.getContext).toHaveBeenCalledExactlyOnceWith(
    'webgl2',
    expect.objectContaining({ antialias: true }),
  )
  expect(WebGLRenderer).toHaveBeenCalledWith({ canvas, context: smooth })
  expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.65)
})

it('uses the same canvas without antialias at a single pixel per CSS pixel when MSAA fails', () => {
  const basic = {}
  const { canvas, createElement } = browserWithContexts(null, basic)
  const renderer = createAtlasRenderer(1.65, 1)
  expect(createElement).toHaveBeenCalledExactlyOnceWith('canvas')
  expect(canvas.getContext.mock.calls).toEqual([
    ['webgl2', expect.objectContaining({ antialias: true })],
    ['webgl2', expect.objectContaining({ antialias: false })],
  ])
  expect(WebGLRenderer).toHaveBeenCalledExactlyOnceWith({ canvas, context: basic })
  expect(renderer.setPixelRatio).toHaveBeenCalledWith(1)
})

it('signals failure when neither WebGL2 context can be created', () => {
  const { canvas } = browserWithContexts(null, null)
  expect(() => createAtlasRenderer(1.65, 1)).toThrow('WebGL 2 no está disponible.')
  expect(canvas.getContext).toHaveBeenCalledTimes(2)
  expect(WebGLRenderer).not.toHaveBeenCalled()
})
