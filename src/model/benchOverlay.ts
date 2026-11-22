import type { BenchFrame, BenchJointId } from './bench'

export const BENCH_JOINTS: { id: BenchJointId; label: string }[] = [
  { id: 'shoulder', label: 'Hombro' },
  { id: 'elbow', label: 'Codo' },
  { id: 'wrist', label: 'Muñeca' },
]

export function benchForces(frame: BenchFrame) {
  return [
    {
      id: 'bar',
      label: 'Peso de la barra',
      anchor: frame.bar,
      verticalN: frame.forces.barN,
      color: '#285b98',
    },
    {
      id: 'body',
      label: 'Peso corporal',
      anchor: frame.bodyCom,
      verticalN: frame.forces.bodyN,
      color: '#ac542b',
    },
    {
      id: 'bench',
      label: 'Reacción del banco',
      anchor: frame.benchSupport,
      verticalN: frame.forces.benchN,
      color: '#087568',
    },
    {
      id: 'feet',
      label: 'Reacción en los pies',
      anchor: frame.footSupport,
      verticalN: frame.forces.feetN,
      color: '#496e25',
    },
  ]
}

/** Free-body diagram of the lifter. Split bilateral resultants at the actual contacts. */
export function benchContactForces(frame: BenchFrame) {
  const [bar, body, bench, feet] = benchForces(frame)
  const hands = frame.arms.map((arm, i) => ({
    ...bar,
    id: i === 0 ? ('hand-positive' as const) : ('hand-negative' as const),
    label: 'Barra sobre la mano',
    anchor: arm.grip,
    verticalN: bar.verticalN / 2,
  }))
  const footContacts = frame.pose.legs.map((leg, i) => ({
    ...feet,
    id: i === 0 ? ('foot-positive' as const) : ('foot-negative' as const),
    label: 'Suelo sobre el pie',
    anchor: { ...feet.anchor, z: leg.ankle.z },
    verticalN: feet.verticalN / 2,
  }))
  return [...hands, body, bench, ...footContacts]
}
