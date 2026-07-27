import { useCallback, useEffect, useRef, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const list = window.matchMedia(query)
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', handler)
    return () => list.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** Tracks an element's box so an SVG can use a viewBox that matches its pixels. */
export function useElementSize<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [node, setNode] = useState<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // Callback ref so a node that mounts later (popover, etc.) is observed too.
  const setRef = useCallback((element: T | null) => {
    ref.current = element
    setNode(element)
  }, [])

  useEffect(() => {
    if (!node) {
      setSize({ width: 0, height: 0 })
      return
    }
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) setSize({ width: box.width, height: box.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return { ref: setRef, size }
}

export function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 390 : window.innerWidth,
    height: typeof window === 'undefined' ? 844 : window.innerHeight,
  }))

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}
