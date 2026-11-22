import type { MuscleId } from '../anatomy/body'
import type { ExerciseId, Frame } from '../model/lift'

export const measurements = {
  hip: { name: 'Flexión de cadera', value: (f: Frame) => f.angles.hipFlexion, unit: '°' },
  knee: { name: 'Flexión de rodilla', value: (f: Frame) => f.angles.kneeFlexion, unit: '°' },
  trunk: { name: 'Torso desde la vertical', value: (f: Frame) => 90 - f.angles.trunk, unit: '°' },
  ankle: { name: 'Inclinación de tibia', value: (f: Frame) => f.angles.tibia, unit: '°' },
  hand: { name: 'Altura de la mano', value: (f: Frame) => f.posture.hand.y * 100, unit: ' cm' },
}

interface Entry {
  readings: (keyof typeof measurements)[]
  name: string
  region: string
  action: string
  observe: Record<ExerciseId, string>
}

export const entries: Record<MuscleId, Entry> = {
  glutes: {
    readings: ['hip'],
    name: 'Glúteos',
    region: 'Cadera · cara posterior',
    action:
      'El glúteo mayor extiende la cadera. Acerca el muslo y el tronco a la alineación que tienen al estar de pie.',
    observe: {
      deadlift: 'Mirá de perfil cómo se abre la cadera desde que despega la barra.',
      squat:
        'Compará la flexión de cadera en el fondo con la que queda al volver a ponerte de pie.',
    },
  },
  quadriceps: {
    readings: ['knee'],
    name: 'Cuádriceps',
    region: 'Muslo · cara anterior',
    action:
      'Sus cuatro porciones se unen en un tendón sobre la rótula. Juntas producen extensión de rodilla.',
    observe: {
      deadlift:
        'Frená el despegue y mirá cómo se endereza la rodilla mientras la barra pasa junto a la tibia.',
      squat: 'Desde el fondo, seguí la rótula y el fémur mientras disminuye la flexión de rodilla.',
    },
  },
  hamstrings: {
    readings: ['hip', 'knee'],
    name: 'Isquiotibiales',
    region: 'Muslo · cara posterior',
    action:
      'Los isquiotibiales flexionan la rodilla. Las porciones que nacen en la pelvis también extienden la cadera.',
    observe: {
      deadlift:
        'Pasá a la vista posterior para ubicar el grupo entre el pliegue del glúteo y la rodilla.',
      squat: 'Seguí sus dos extremos mientras la cadera y la rodilla se flexionan al descender.',
    },
  },
  erectors: {
    readings: ['trunk'],
    name: 'Erectores espinales',
    region: 'Dorso · junto a la columna',
    action:
      'A ambos lados de la columna, estos músculos producen un momento extensor que ayuda a sostener el tronco inclinado.',
    observe: {
      deadlift:
        'En el diagrama 2D, compará la distancia de la barra a L5/S1 al despegar y al terminar.',
      squat:
        'Compará las posiciones de barra alta y baja en Ajustes y observá cómo cambia la inclinación del torso.',
    },
  },
  calves: {
    readings: ['ankle'],
    name: 'Pantorrillas',
    region: 'Pierna · cara posterior',
    action:
      'El gastrocnemio y el sóleo se unen al talón a través del tendón de Aquiles. Generan flexión plantar en el tobillo.',
    observe: {
      deadlift: 'Desde el lateral, observá cuánto se inclina la tibia con el pie apoyado.',
      squat:
        'Al bajar, seguí el avance de la rodilla sobre el pie y el cambio de ángulo en el tobillo.',
    },
  },
  core: {
    readings: ['trunk'],
    name: 'Abdominales',
    region: 'Tronco · pared abdominal',
    action:
      'El recto y los oblicuos forman parte de la pared abdominal. Participan en el control de la posición del tronco.',
    observe: {
      deadlift:
        'Girá hacia el frente para ubicar la pared abdominal entre las costillas y la pelvis.',
      squat: 'Usá la vista lateral para seguir la orientación de ese espacio durante el descenso.',
    },
  },
  lats: {
    readings: ['trunk', 'hand'],
    name: 'Dorsales',
    region: 'Tronco · dorso lateral',
    action:
      'El dorsal ancho conecta el tronco con el húmero y participa en la extensión y la aducción del hombro.',
    observe: {
      deadlift: 'Observá la posición del brazo respecto del torso al despegar y al llegar arriba.',
      squat:
        'Girá hacia la espalda para seguir el borde del dorsal desde la cintura hacia la axila.',
    },
  },
  upperBody: {
    readings: ['hand'],
    name: 'Hombros y brazos',
    region: 'Miembro superior',
    action:
      'El deltoides actúa sobre el hombro. El bíceps puede flexionar el codo y el tríceps lo extiende.',
    observe: {
      deadlift:
        'Seguí la mano sobre la barra. El codo permanece extendido mientras se mueven la cadera y la rodilla.',
      squat: 'Mirá de costado cómo se flexionan los codos para sostener la barra sobre la espalda.',
    },
  },
}

export const groups: MuscleId[] = [
  'glutes',
  'quadriceps',
  'hamstrings',
  'erectors',
  'calves',
  'core',
  'lats',
  'upperBody',
]
