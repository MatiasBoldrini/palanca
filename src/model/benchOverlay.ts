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
