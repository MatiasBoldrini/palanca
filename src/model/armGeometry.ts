interface Point3 {
  x: number
  y: number
  z: number
}

/** The elbow traces a circle about the shoulder–grip axis while both link lengths stay fixed.
 * The pole is the direction of the neutral bend relative to the shoulder. */
export function bendArm(
  shoulder: Point3,
  grip: Point3,
  pole: Point3,
  upper: number,
  lower: number,
  turnRad: number,
) {
  const dx = grip.x - shoulder.x
  const dy = grip.y - shoulder.y
  const dz = grip.z - shoulder.z
  const span = Math.max(1e-8, Math.hypot(dx, dy, dz))
  const ax = dx / span,
    ay = dy / span,
    az = dz / span
  const dot = pole.x * ax + pole.y * ay + pole.z * az
  const nx = pole.x - dot * ax,
    ny = pole.y - dot * ay,
    nz = pole.z - dot * az
  const length = Math.max(1e-8, Math.hypot(nx, ny, nz))
  const c = Math.cos(turnRad) / length,
    s = Math.sin(turnRad) / length
  const bend = {
    x: c * nx + s * (ay * nz - az * ny),
    y: c * ny + s * (az * nx - ax * nz),
    z: c * nz + s * (ax * ny - ay * nx),
  }
  const along = (upper * upper - lower * lower + span * span) / (2 * span)
  const radius = Math.sqrt(Math.max(0, upper * upper - along * along))
  return {
    elbow: {
      x: shoulder.x + ax * along + bend.x * radius,
      y: shoulder.y + ay * along + bend.y * radius,
      z: shoulder.z + az * along + bend.z * radius,
    },
    elbowPlaneNormal: {
      x: ay * bend.z - az * bend.y,
      y: az * bend.x - ax * bend.z,
      z: ax * bend.y - ay * bend.x,
    },
  }
}
