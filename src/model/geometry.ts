export interface Vec2 {
  x: number
  y: number
}

export const vec = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k })
export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

export const norm = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

export const fromPolar = (angleRad: number, length: number): Vec2 => ({
  x: Math.cos(angleRad) * length,
  y: Math.sin(angleRad) * length,
})

export const rotate = (a: Vec2, angleRad: number): Vec2 => {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }
}

export const rad = (deg: number): number => (deg * Math.PI) / 180
export const deg = (radians: number): number => (radians * 180) / Math.PI

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Interior angle at `vertex` formed by the segments towards `a` and `b`, in degrees. */
export function angleBetween(a: Vec2, vertex: Vec2, b: Vec2): number {
  const u = sub(a, vertex)
  const v = sub(b, vertex)
  const cos = (u.x * v.x + u.y * v.y) / (norm(u) * norm(v))
  return deg(Math.acos(clamp(cos, -1, 1)))
}

/** Angle of the vector a->b measured from the +x axis, in degrees. */
export function segmentAngle(a: Vec2, b: Vec2): number {
  return deg(Math.atan2(b.y - a.y, b.x - a.x))
}

/** Angle of the vector a->b measured from vertical. Positive means tilted towards +x. */
export function angleFromVertical(a: Vec2, b: Vec2): number {
  return deg(Math.atan2(b.x - a.x, b.y - a.y))
}

/**
 * Intersection of two circles. Returns both solutions ordered by ascending x,
 * or null when the circles do not intersect.
 */
export function circleIntersection(
  c0: Vec2,
  r0: number,
  c1: Vec2,
  r1: number,
): [Vec2, Vec2] | null {
  const d = dist(c0, c1)
  if (d > r0 + r1 || d < Math.abs(r0 - r1) || d === 0) return null
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
  const hSq = r0 * r0 - a * a
  if (hSq < 0) return null
  const h = Math.sqrt(hSq)
  const p = lerpVec(c0, c1, a / d)
  const ox = (h * (c1.y - c0.y)) / d
  const oy = (h * (c1.x - c0.x)) / d
  const s1 = vec(p.x + ox, p.y - oy)
  const s2 = vec(p.x - ox, p.y + oy)
  return s1.x <= s2.x ? [s1, s2] : [s2, s1]
}

/**
 * Places a joint at distance `r0` from `c0` and `r1` from `c1`, preferring the
 * posterior (lower x) solution. When the two circles cannot meet, it returns
 * the closest reachable point instead of NaN so the figure still renders, plus
 * how it failed when it did. The two ways are not equally forgivable:
 *
 * - `shortfall`: the links together are a little too short to span the gap.
 *   Missing by a millimetre just means the limb is straight, which is a real
 *   pose, so a caller can round it off.
 * - `folded`: the links are too long to fit in the gap and would have to
 *   double back on themselves. There is no pose there at any tolerance, and
 *   drawing one puts the far end nowhere near where it belongs.
 */
export function resolveJoint(
  c0: Vec2,
  r0: number,
  c1: Vec2,
  r1: number,
  prefer: 'posterior' | 'anterior' = 'posterior',
): { point: Vec2; reachable: boolean; shortfall: number; folded: boolean } {
  const solutions = circleIntersection(c0, r0, c1, r1)
  if (solutions) {
    return {
      point: prefer === 'posterior' ? solutions[0] : solutions[1],
      reachable: true,
      shortfall: 0,
      folded: false,
    }
  }
  const d = dist(c0, c1) || 1e-9
  const dir = scale(sub(c1, c0), 1 / d)
  const reach = clamp((d + r0 - r1) / 2, -r0, r0)
  return {
    point: add(c0, scale(dir, reach)),
    reachable: false,
    shortfall: Math.max(d - (r0 + r1), 0),
    folded: d < Math.abs(r0 - r1),
  }
}

/**
 * Finds a root of `f` in [lo, hi] by scanning for a sign change and then
 * bisecting. Always terminates: bounded scan plus a fixed iteration count.
 * Returns the best available estimate even when no sign change exists, so the
 * caller can still render something and flag it.
 */
export function findRoot(
  f: (x: number) => number,
  lo: number,
  hi: number,
  { samples = 48, iterations = 40, tolerance = 1e-6 } = {},
): { value: number; converged: boolean } {
  let prevX = lo
  let prevY = f(lo)
  if (Number.isFinite(prevY) && Math.abs(prevY) < tolerance) {
    return { value: lo, converged: true }
  }

  let bestX = lo
  let bestAbs = Number.isFinite(prevY) ? Math.abs(prevY) : Infinity

  for (let i = 1; i <= samples; i++) {
    const x = lo + ((hi - lo) * i) / samples
    const y = f(x)
    if (Number.isFinite(y) && Math.abs(y) < bestAbs) {
      bestAbs = Math.abs(y)
      bestX = x
    }
    if (Number.isFinite(prevY) && Number.isFinite(y) && prevY * y <= 0) {
      let a = prevX
      let b = x
      let fa = prevY
      for (let k = 0; k < iterations; k++) {
        const m = (a + b) / 2
        const fm = f(m)
        if (!Number.isFinite(fm)) break
        if (Math.abs(fm) < tolerance || (b - a) / 2 < tolerance) {
          return { value: m, converged: true }
        }
        if (fa * fm <= 0) {
          b = m
        } else {
          a = m
          fa = fm
        }
      }
      return { value: (a + b) / 2, converged: true }
    }
    prevX = x
    prevY = y
  }

  return { value: bestX, converged: false }
}
