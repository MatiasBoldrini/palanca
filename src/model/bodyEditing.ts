export type BenchPartId = 'foot' | 'shank' | 'thigh' | 'torso' | 'arm' | 'grip' | 'bar'

export const BENCH_PARTS: Record<BenchPartId, string> = {
  torso: 'Torso',
  arm: 'Brazo',
  grip: 'Agarre',
  thigh: 'Fémur',
  shank: 'Tibia',
  foot: 'Pie',
  bar: 'Barra',
}
