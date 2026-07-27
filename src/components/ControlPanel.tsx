import { anthropometryFromHeight } from '../model/anthropometry'
import type { Coordination } from '../model/lift'
import { useApp } from '../state/appState'
import { presetsFor } from '../state/presets'
import { Chip, Collapsible, Section, Segmented, Slider, Switch } from './ui'

const deg = (v: number) => `${v.toFixed(0)}°`

function sameCoordination(a: Coordination, b: Coordination): boolean {
  return (
    Math.abs(a.kneeTravel - b.kneeTravel) < 0.02 &&
    Math.abs(a.spineFlexion - b.spineFlexion) < 0.6 &&
    Math.abs(a.barOffset - b.barOffset) < 0.004
  )
}

export function PatternPanel({ accent }: { accent: string }) {
  const { state, dispatch, coordination } = useApp()
  const presets = presetsFor(state.exercise)
  const active = presets.find((p) => sameCoordination(p.coordination, coordination))

  return (
    <Section title="Coordinación">
      <div className="chip-row">
        {presets.map((preset) => (
          <Chip
            key={preset.id}
            active={active?.id === preset.id}
            accent={accent}
            onClick={() => dispatch({ type: 'setCoordination', patch: preset.coordination })}
          >
            {preset.name}
          </Chip>
        ))}
      </div>
      <p className="caption pattern-blurb">
        {active?.blurb ?? 'Patrón propio, armado moviendo los puntos del dibujo.'}
      </p>

      <Collapsible title="Ajuste numérico">
        <Slider
          label="Recorrido de rodilla"
          value={Math.round(coordination.kneeTravel * 100)}
          min={0}
          max={100}
          accent={accent}
          format={(v) => `${v}%`}
          onChange={(v) => dispatch({ type: 'setCoordination', patch: { kneeTravel: v / 100 } })}
          marks={[
            { at: 0, label: 'cadera' },
            { at: 100, label: 'rodilla' },
          ]}
        />
        <Slider
          label="Flexión de columna"
          value={Math.round(coordination.spineFlexion)}
          min={0}
          max={50}
          accent={accent}
          format={deg}
          onChange={(v) => dispatch({ type: 'setCoordination', patch: { spineFlexion: v } })}
          hint="0° es la curva natural: lordosis lumbar y cifosis dorsal. Los grados se suman sobre eso — primero se va la lordosis, después redondea la espalda alta."
        />
        {state.exercise === 'squat' && (
          <Slider
            label="Posición de la barra en la espalda"
            value={Math.round(coordination.barOffset * 100)}
            min={0}
            max={14}
            accent={accent}
            format={(v) => `${v} cm bajo el acromion`}
            onChange={(v) => dispatch({ type: 'setCoordination', patch: { barOffset: v / 100 } })}
            marks={[
              { at: 0, label: 'high bar' },
              { at: 14, label: 'low bar' },
            ]}
          />
        )}
      </Collapsible>
    </Section>
  )
}

export function BodyPanel() {
  const { state, dispatch } = useApp()
  const { anthro } = state
  const scaled = anthropometryFromHeight(anthro.height, anthro.mass)
  const customised =
    Math.abs(scaled.shank - anthro.shank) > 0.002 ||
    Math.abs(scaled.thigh - anthro.thigh) > 0.002 ||
    Math.abs(scaled.torso - anthro.torso) > 0.002 ||
    Math.abs(scaled.arm - anthro.arm) > 0.002 ||
    Math.abs(scaled.foot - anthro.foot) > 0.002

  return (
    <>
      <Section
        title="Tu cuerpo"
        action={
          customised ? (
            <button
              className="text-button"
              onClick={() => dispatch({ type: 'resetProportions' })}
            >
              Volver a proporciones estándar
            </button>
          ) : null
        }
      >
        {/* Not a control: height is what the segments add up to. Setting it on
            its own would rewrite the very measurements it is made of. */}
        <div className="param-locked">
          <span className="slider-label">Altura</span>
          <span className="slider-value num">{Math.round(anthro.height * 100)} cm</span>
          <p className="caption">Sale de la suma de tibia, fémur y torso.</p>
        </div>
        <Slider
          label="Peso corporal"
          value={Math.round(anthro.mass)}
          min={40}
          max={180}
          format={(v) => `${v} kg`}
          onChange={(v) => dispatch({ type: 'setAnthro', patch: { mass: v } })}
        />
      </Section>

      <Section title="Medidas de segmento">
        <Collapsible title="Ajustar cada segmento">
        <Slider
          label="Pie"
          value={Math.round(anthro.foot * 100)}
          min={18}
          max={35}
          format={(v) => `${v} cm`}
          onChange={(v) => dispatch({ type: 'setAnthro', patch: { foot: v / 100 } })}
        />
        <Slider
          label="Tibia (tobillo a rodilla)"
          value={Math.round(anthro.shank * 100)}
          min={30}
          max={60}
          format={(v) => `${v} cm`}
          onChange={(v) => dispatch({ type: 'setAnthro', patch: { shank: v / 100 } })}
        />
        <Slider
          label="Fémur (rodilla a cadera)"
          value={Math.round(anthro.thigh * 100)}
          min={30}
          max={60}
          format={(v) => `${v} cm`}
          onChange={(v) => dispatch({ type: 'setAnthro', patch: { thigh: v / 100 } })}
        />
        <Slider
          label="Torso (cadera a acromion)"
          value={Math.round(anthro.torso * 100)}
          min={35}
          max={65}
          format={(v) => `${v} cm`}
          onChange={(v) => dispatch({ type: 'setAnthro', patch: { torso: v / 100 } })}
        />
        <Slider
          label="Brazo (acromion a la mano)"
          value={Math.round(anthro.arm * 100)}
          min={45}
          max={80}
          format={(v) => `${v} cm`}
          onChange={(v) => dispatch({ type: 'setAnthro', patch: { arm: v / 100 } })}
          hint="Es la medida que más cambia tu posición de partida en peso muerto."
        />
        <Slider
          label="Dorsiflexión disponible"
          value={Math.round(anthro.maxDorsiflexion)}
          min={10}
          max={55}
          format={deg}
          onChange={(v) => dispatch({ type: 'setAnthro', patch: { maxDorsiflexion: v } })}
          hint="Si el modelo la supera, te avisa en vez de dibujar una postura imposible."
        />
        </Collapsible>
      </Section>
    </>
  )
}

export function TaskPanel() {
  const { state, dispatch } = useApp()
  const { task, exercise } = state
  return (
    <Section title="Tarea">
      <Slider
        label="Carga en la barra"
        value={Math.round(task.load)}
        min={20}
        max={400}
        step={2.5}
        format={(v) => `${v} kg`}
        onChange={(v) => dispatch({ type: 'setTask', patch: { load: v } })}
      />
      <div className="field">
        <span className="slider-label">Restricción de equilibrio</span>
        <Segmented
          value={task.balance}
          groupId="balance"
          size="sm"
          options={[
            { value: 'cop', label: 'Equilibrar sobre el pie' },
            { value: 'bar', label: 'Fijar la barra' },
          ]}
          onChange={(balance) => dispatch({ type: 'setBalance', balance })}
        />
        <p className="caption">
          {task.balance === 'cop'
            ? 'El modelo busca dónde tiene que estar la barra para que el sistema quede equilibrado sobre el punto de apoyo que elijas. Tocá el triángulo bajo el pie para moverlo.'
            : 'Vos fijás la barra y el modelo te dice dónde cae la presión bajo el pie. Es el protocolo de Edington (2018).'}
        </p>
      </div>

      <Collapsible title="Ajuste numérico">
        {exercise === 'squat' && (
          <Slider
            label="Profundidad"
            value={Math.round(task.depth * 100)}
            min={0}
            max={100}
            format={(v) => (v < 45 ? 'sobre paralelo' : v > 60 ? 'profunda' : 'paralelo')}
            onChange={(v) => dispatch({ type: 'setTask', patch: { depth: v / 100 } })}
            marks={[
              { at: 0, label: 'alta' },
              { at: 50, label: 'paralelo' },
              { at: 100, label: 'profunda' },
            ]}
          />
        )}
        {task.balance === 'cop' ? (
          <Slider
            label="Punto de apoyo"
            value={Math.round(task.cop * 100)}
            min={-6}
            max={6}
            format={(v) => (v === 0 ? 'mediopié' : `${v > 0 ? '+' : '−'}${Math.abs(v)} cm`)}
            onChange={(v) => dispatch({ type: 'setTask', patch: { cop: v / 100 } })}
            marks={[
              { at: -6, label: 'talón' },
              { at: 6, label: 'punta' },
            ]}
          />
        ) : (
          exercise === 'deadlift' && (
            <Slider
              label="Posición de la barra"
              value={Math.round(task.barPosition * 100)}
              min={-6}
              max={12}
              format={(v) =>
                v === 0 ? 'sobre el mediopié' : `${v > 0 ? '+' : '−'}${Math.abs(v)} cm`
              }
              onChange={(v) => dispatch({ type: 'setTask', patch: { barPosition: v / 100 } })}
              hint="La tibia es un tope: si la pedís más atrás, la barra se queda apoyada contra ella."
            />
          )
        )}
      </Collapsible>
    </Section>
  )
}

export function ViewPanel() {
  const { state, dispatch } = useApp()
  return (
    <Section title="Vista">
      <Switch
        checked={state.showLoadMap}
        onChange={() => dispatch({ type: 'toggle', key: 'showLoadMap' })}
        label="Mapa de carga"
        hint="Colorea el esqueleto con gradientes cortos en cada articulación: oro apagado es poco, ladrillo es más, rojo oscuro es la que más momento aguanta en esta pose. El medio del segmento vuelve a tinta, para que no se pinte el cuerpo entero. Se mide contra la articulación más exigida del instante."
      />
      <Switch
        checked={state.showCurves}
        onChange={() => dispatch({ type: 'toggle', key: 'showCurves' })}
        label="Curvas del recorrido"
        hint="El momento de las cuatro articulaciones a lo largo del levantamiento, sobre el mismo eje que la barra de posición."
      />
      <Switch
        checked={state.showMomentArms}
        onChange={() => dispatch({ type: 'toggle', key: 'showMomentArms' })}
        label="Brazos de palanca"
        hint="La distancia horizontal de cada articulación a la línea de la barra, acotada en centímetros."
      />
      <Switch
        checked={state.showComGuides}
        onChange={() => dispatch({ type: 'toggle', key: 'showComGuides' })}
        label="Centro de masa y punto de apoyo"
        hint="Marca dónde cae la línea de gravedad del conjunto cuerpo más barra."
      />
    </Section>
  )
}

export function ModelNotes() {
  const { state } = useApp()
  return (
    <Section title="Qué asume este modelo">
      <ul className="notes">
        <li>
          Es un modelo <strong>plano y cuasi-estático</strong>: resuelve el equilibrio instante a
          instante, sin velocidad ni inercia. Sirve para peso muerto convencional y sentadilla con
          stance estrecho o medio. Para sumo o stance ancho, Escamilla midió errores de 16 a 18 cm en
          los brazos de palanca al analizar en 2D.
        </li>
        <li>
          Cadera, rodilla y tobillo se informan <strong>por pierna</strong>. L5/S1 es una sola
          articulación y lleva toda la carga.
        </li>
        <li>
          El <strong>trabajo del levantamiento</strong> es la energía potencial que gana el
          conjunto cuerpo más barra del fondo al final. Lo manda la carga, no la técnica: cambiar
          la coordinación lo mueve un puñado de joules, porque llevás tu propio cuerpo un poco más
          arriba o más abajo. Lo que la técnica sí cambia es <em>dónde</em> cae ese costo, y eso es
          lo que muestran los colores del esqueleto.
        </li>
        <li>
          Masas y centros de masa vienen de la tabla 4.1 de Winter (Dempster); las longitudes, de
          Drillis y Contini. Las ocho masas segmentarias suman exactamente el peso corporal.
        </li>
        <li>
          La columna son tres eslabones articulados y en reposo ya vienen curvados: lordosis lumbar
          con su vértice en L3 y cifosis desde T12/L1. Por eso, cuando la flexionás, el torso se
          acorta solo y el brazo de palanca de cadera baja: no hay ningún factor de corrección
          inventado.
        </li>
        {state.exercise === 'deadlift' && (
          <li>
            Se asume que el brazo cuelga vertical, algo que vale con cargas altas porque el brazo
            trabaja como tensor. Con cargas livianas el hombro se adelanta y el modelo pierde
            precisión.
          </li>
        )}
        <li>
          La coordinación es una <strong>hipótesis que elegís vos</strong>, no una predicción. El
          modelo te dice qué cuesta cada patrón, no cuál deberías usar.
        </li>
        <li>
          La compresión lumbar es una estimación con un músculo equivalente de 6 cm de brazo a 10°,
          calibrado contra Cholewicki (1991). Con estos modelos, cualquier levantamiento pesado
          supera holgadamente el límite ocupacional de 3400 N: eso describe la magnitud de la carga,
          no un pronóstico de lesión. Tomalo como orden de magnitud.
        </li>
      </ul>
    </Section>
  )
}
