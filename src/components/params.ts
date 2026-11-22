import type { ParamId } from '../model/interact'

/**
 * How each parameter reads on screen. `scale` converts the model unit into the
 * one a person would say out loud: per cent of the lift, kilograms,
 * centimetres, degrees.
 */
export interface ParamUi {
  label: string
  scale: number
  step: number
  format: (value: number) => string
}

const cm = (v: number) => `${v} cm`
const fromMidfoot = (v: number) =>
  v === 0 ? 'mediopié' : `${v > 0 ? '+' : '−'}${Math.abs(v)} cm`

export const PARAM_UI: Record<ParamId, ParamUi> = {
  toeOutDeg: { label: 'Giro de los pies', scale: 1, step: 1, format: (v) => `${v}°` },
  squatElbowAngle: { label: 'Giro de los codos', scale: 1, step: 1, format: (v) => `${v}°` },
  stanceWidth: { label: 'Separación entre los pies', scale: 100, step: 1, format: cm },
  progress: { label: 'Altura en el recorrido', scale: 100, step: 1, format: (v) => `${v}%` },
  load: { label: 'Carga', scale: 1, step: 2.5, format: (v) => `${v} kg` },
  barPosition: { label: 'Respecto al mediopié', scale: 100, step: 0.5, format: fromMidfoot },
  cop: { label: 'Punto de apoyo', scale: 100, step: 0.5, format: fromMidfoot },
  depth: {
    label: 'Profundidad',
    scale: 100,
    step: 1,
    format: (v) => (v < 45 ? 'sobre paralelo' : v > 60 ? 'profunda' : 'paralelo'),
  },
  kneeTravel: { label: 'Recorrido', scale: 100, step: 1, format: (v) => `${v}%` },
  spineFlexion: { label: 'Flexión', scale: 1, step: 1, format: (v) => `${v}°` },
  armLean: {
    label: 'Hombro adelantado',
    scale: 1,
    step: 0.5,
    format: (v) => (v === 0 ? 'vertical' : `${v}°`),
  },
  barOffset: { label: 'Sobre la espalda', scale: 100, step: 0.5, format: cm },
  foot: { label: 'Largo del pie', scale: 100, step: 0.5, format: cm },
  shank: { label: 'Largo de la tibia', scale: 100, step: 0.5, format: cm },
  thigh: { label: 'Largo del fémur', scale: 100, step: 0.5, format: cm },
  torso: { label: 'Largo del torso', scale: 100, step: 0.5, format: cm },
  arm: { label: 'Largo del brazo', scale: 100, step: 0.5, format: cm },
  dorsiflexion: { label: 'Dorsiflexión disponible', scale: 1, step: 1, format: (v) => `${v}°` },
}
