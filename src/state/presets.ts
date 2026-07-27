import type { Coordination, ExerciseId } from '../model/lift'

export interface Preset {
  id: string
  name: string
  blurb: string
  coordination: Coordination
}

export const DEADLIFT_PRESETS: Preset[] = [
  {
    id: 'hip',
    name: 'Cadera dominante',
    blurb: 'Tibias casi verticales, caderas altas, torso más horizontal.',
    coordination: { kneeTravel: 0, spineFlexion: 12, armLean: 0, barOffset: 0 },
  },
  {
    id: 'knee',
    name: 'Rodilla adelantada',
    blurb: 'Más dorsiflexión, caderas bajas, torso más erguido.',
    coordination: { kneeTravel: 1, spineFlexion: 12, armLean: 0, barOffset: 0 },
  },
  {
    id: 'mixed',
    name: 'Intermedio',
    blurb: 'El punto medio entre los dos setups medidos por Edington.',
    coordination: { kneeTravel: 0.5, spineFlexion: 12, armLean: 0, barOffset: 0 },
  },
  {
    id: 'neutral',
    name: 'Columna neutra',
    blurb: 'La curva de pie intacta: lordosis lumbar y cifosis dorsal, sin flexión agregada.',
    coordination: { kneeTravel: 0.25, spineFlexion: 0, armLean: 0, barOffset: 0 },
  },
  {
    id: 'rounded',
    name: 'Espalda redondeada',
    blurb: 'Flexión marcada: acorta el torso y el brazo de palanca de cadera.',
    coordination: { kneeTravel: 0.25, spineFlexion: 40, armLean: 0, barOffset: 0 },
  },
  {
    id: 'armlean',
    name: 'Brazo adelantado',
    blurb:
      'Hombro por delante de la barra, como en una serie liviana: el brazo deja de ser un tensor y el hombro paga la diferencia.',
    coordination: { kneeTravel: 0.25, spineFlexion: 12, armLean: 6, barOffset: 0 },
  },
]

export const SQUAT_PRESETS: Preset[] = [
  {
    id: 'lowbar',
    name: 'Low bar',
    blurb: 'Barra baja sobre el deltoides posterior, más inclinación de torso.',
    coordination: { kneeTravel: 0.25, spineFlexion: 8, armLean: 0, barOffset: 0.085 },
  },
  {
    id: 'highbar',
    name: 'High bar',
    blurb: 'Barra sobre el trapecio, torso más vertical, más rodilla.',
    coordination: { kneeTravel: 0.75, spineFlexion: 6, armLean: 0, barOffset: 0.005 },
  },
  {
    id: 'stiffankle',
    name: 'Tobillo rígido',
    blurb: 'Poca dorsiflexión disponible: la cadera absorbe el recorrido.',
    coordination: { kneeTravel: 0.05, spineFlexion: 10, armLean: 0, barOffset: 0.06 },
  },
  {
    id: 'kneedominant',
    name: 'Rodilla dominante',
    blurb: 'Rodillas bien adelante, típico de sentadilla frontal u olímpica.',
    coordination: { kneeTravel: 1, spineFlexion: 4, armLean: 0, barOffset: 0 },
  },
]

export const presetsFor = (exercise: ExerciseId): Preset[] =>
  exercise === 'deadlift' ? DEADLIFT_PRESETS : SQUAT_PRESETS

export const EXERCISE_META: Record<
  ExerciseId,
  { name: string; short: string; taskConstraint: string }
> = {
  deadlift: {
    name: 'Peso muerto',
    short: 'Peso muerto',
    taskConstraint: 'altura de la barra',
  },
  squat: {
    name: 'Sentadilla',
    short: 'Sentadilla',
    taskConstraint: 'profundidad de cadera',
  },
}
