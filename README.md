# Palanca

Simulador interactivo de la mecánica del peso muerto y la sentadilla. Tocá una
parte del dibujo, ajustala, y mirá en el mismo dibujo qué le pasa a cada
articulación. Todo corre en el navegador: no hay backend ni datos que salgan del
dispositivo.

## Qué resuelve

Las calculadoras que existen hoy tienen tres problemas: dibujan posturas sin
verificar que el sistema esté en equilibrio, informan "momentos" que en realidad
son distancias, y esconden el modelo detrás de una pila de sliders. Palanca
resuelve el equilibrio de verdad, informa momentos en N·m con la convención de la
literatura, y se maneja tocando la figura.

## Cómo se maneja

La figura es el control principal. Cada cuadradito es una parte que se toca para
abrir sus controles:

Todo lo que el modelo toma como entrada tiene un lugar en el dibujo. Las
articulaciones llevan la postura, los miembros llevan las proporciones de la
persona, y la cabeza es la persona entera:

| Parte | Qué controla |
| --- | --- |
| Barra | Carga y posición respecto al mediopié |
| Rodilla | Cuánto viajan las rodillas hacia adelante |
| Media espalda | Flexión de columna y largo del torso |
| Cadera (sentadilla) | La profundidad del fondo |
| Triángulo bajo el pie | Dónde cae el centro de presión |
| Pie | Largo del pie y dorsiflexión disponible |
| Tibia, fémur, brazo | El largo de cada segmento |

El peso corporal es la excepción: cambia todos los números pero no hay nada en
una figura de palotes que se pueda agarrar para eso, así que vive en el panel.

**La altura no es un control.** Sale de sumar tibia, fémur y torso: la tabla
pone el acromion en 0,818 H y el tobillo en 0,039 H, así que esos tres segmentos
abarcan 0,779 H. Antes era una entrada independiente que reescribía en silencio
los mismos segmentos de los que está hecha; ahora los sigue y no puede
contradecirlos.

Los marcadores de los miembros son más chicos y tenues que los de las
articulaciones: fijar las proporciones es una decisión de setup, mover la
postura es de lo que trata la app. Su zona sensible sigue el trazo del miembro,
no una recta entre las puntas, para que el punto medio del pie no quede encima
del triángulo del centro de presión.

Al pasar por encima se ilumina **la parte entera**, no solo su marcador, y sale
una etiqueta al lado con su nombre y su valor actual: «Fémur · 42,9 cm». Sin eso
un fémur tocable es indistinguible de uno que no lo es, por más marcador que
tenga. El resaltado y la etiqueta están siempre en el árbol y los revela CSS,
así que la misma regla sirve para hover, foco de teclado y selección, y responde
al `:active` donde no hay puntero. La etiqueta se apaga mientras la parte está
seleccionada, porque el popover ya dice lo mismo justo encima.

El panel lateral arranca cerrado, detrás del botón «Ajustes»: el dibujo es la
app, y todo lo que hay en el panel tiene un lugar en él. El panel es la versión
larga para cuando la querés.

Los controles salen en un popover chico al lado del punto, del lado que tenga
lugar y sin salirse del marco. Anclarlo al punto hace obvia la relación sin
tener que dibujar una línea guía. La altura en el recorrido no está en el
popover de la barra a propósito: el scrubber de abajo ya es ese control, y estas
listas tienen que entrar al lado de una articulación.

### Ningún control puede pedir una postura imposible

Los topes de cada slider no son constantes: los calcula `feasibleRange`, que
camina hacia afuera desde el valor actual resolviendo el modelo en cada paso y
frena en el primer ajuste cuya postura no existe, afinando el borde por
bisección. El rango que sale de ahí es la respuesta del solver, no una
suposición.

Eso importa porque el modelo tiene bordes reales: si las rodillas viajan
demasiado, la cadena cinemática deja de cerrar y `resolveJoint` devuelve el
punto más cercano en vez de una solución. Antes eso se dibujaba igual, con los
segmentos del largo equivocado. Ahora simplemente no se puede llegar.

El rango de un parámetro no depende de su propio valor más allá de elegir el
tramo factible donde está parado, así que mover el slider no mueve sus propios
topes. El scrubber del recorrido y la reproducción pasan por la misma compuerta,
así que no queda ningún camino hacia una postura que el modelo tenga que fingir.

Los sliders numéricos completos siguen en el panel lateral, plegados bajo
"Ajuste numérico".

### La tibia es un tope, no una advertencia

La barra no puede atravesar la espinilla. En vez de dibujar la postura imposible
y avisar con un cartel, el solver corta la posición de la barra en el límite: al
arrastrarla hacia atrás simplemente frena contra la tibia, y adelantar la rodilla
empuja la barra hacia afuera. Es la restricción `barLimit` de `solveDeadlift`, y
`barBlocked` indica que la barra está apoyada.

### Mapa de carga

El momento no se dibuja encima del cuerpo: **es** el color del cuerpo. Cada
tramo del esqueleto se pinta con el momento de la articulación cuyos músculos lo
cruzan, y hace un degradado donde queda entre dos:

| Tramo | De qué toma el color |
| --- | --- |
| Pie y tibia | Tobillo |
| Fémur | Rodilla en un extremo, cadera en el otro |
| Pelvis y columna | Cadera en la base, L5/S1 de ahí para arriba |
| Brazo, cuello y cabeza | Gris: el modelo no calcula un momento ahí |

De gris a azul, con escala **absoluta**: el azul pleno son 12 N·m por kilo de
peso corporal, que es el orden de magnitud de los levantamientos más pesados
medidos por Cholewicki (1991). Normalizar contra el pico del propio
levantamiento sería tentador pero es un error: todos los momentos escalan con la
carga de la barra, así que se cancela y el mapa deja de reaccionar al peso.

La rampa es de **un solo tono** a propósito. El momento es una magnitud
continua, sin categorías adentro; una rampa multicolor inventa fronteras donde
no las hay, y además obliga a consultar una leyenda para saber si el verde está
por encima o por debajo del naranja. Con un tono, más color es más carga y no
hay nada que recordar. Los tramos sin dato quedan más tenues que el extremo bajo
de la rampa, así que "no tengo nada que decir" nunca se lee como "poca carga".

## Qué se muestra y qué se guarda

El newton-metro es la unidad honesta para un momento y no la entiende nadie, así
que la app no la pone al frente. En su lugar hay una frase y cuatro barras
proporcionales: la frase dice cómo se reparte el trabajo entre cadera y rodilla
y qué tan exigente es la posición, y las barras dicen dónde cae la carga sin
pedirle a nadie que interprete una cifra.

Los umbrales de esa frase abarcan los dos ejercicios. Un peso muerto vive en el
fondo del rango —un índice rodilla/cadera de 0,25 ya es un tirón con bastante
rodilla— así que el extremo bajo necesita escalones que una escala pensada para
sentadilla aplastaría en una sola categoría.

Los catorce indicadores con sus unidades siguen ahí, plegados bajo «Ver los
números de esta posición». Sirven para revisar el modelo; no son la app.

### Trabajo del levantamiento

En la esquina también va el trabajo mecánico de todo el recorrido, en joules:
la energía potencial que gana el conjunto cuerpo más barra del fondo al final.
La gravedad es conservativa, así que ese número es exactamente el trabajo hecho
contra ella y no depende de ninguna suposición sobre el camino entre los dos
extremos. Un test lo verifica contra la fórmula.

Se suma paso a paso contando solo las subidas, en vez de restar los extremos,
para que siga siendo correcto si el centro de masa baja en algún tramo.

Lo manda la carga: 180 kg dan unos 1360 J y 300 kg unos 2070 J. La técnica lo
mueve poco —llevar las rodillas adelante lo sube un 3 %, porque arrancás con la
cadera más abajo y tenés que subir más tu propio cuerpo— y eso es en sí mismo el
dato: la coordinación casi no cambia cuánto cuesta el levantamiento, cambia
sobre qué articulación cae ese costo.

## Paleta

Blanco, negro, escala de grises y **un** color. El azul se gasta en dos cosas
nada más: lo que se puede tocar, y cuánta carga aguanta una zona. Los números no
llevan color, porque colorear un dato que ya está escrito no agrega nada.

El acento es una sola variable por esquema, `--accent` en `src/styles/base.css`,
junto con los dos extremos de la rampa de carga en `LOAD_RAMP`
(`src/components/Figure.tsx`). Cambiar de azul a ámbar es tocar esos tres
valores.

### Un tono por magnitud, un color por identidad

Los brazos de palanca y las curvas del recorrido responden otra pregunta: no
*cuánto*, sino *cuál*. Eso es una categoría, así que ahí sí va un color por
articulación —rojo L5/S1, ámbar cadera, verde rodilla, violeta tobillo— y esos
cuatro colores son los mismos en la leyenda, en los brazos y en las curvas.

El brazo de palanca es una distancia, y se dibuja como se dibuja una distancia:
una línea de cota con topes en las puntas y la medida en centímetros encima,
desde la articulación hasta la vertical de la barra. Codificar el momento en el
grosor de una banda, que es lo que hacía antes, solo producía un manchón.

Las cotas van **delante** del cuerpo, cada una con un contorno del color del
fondo por debajo. Una cota que desaparece detrás del objeto que mide no sirve, y
una apoyada plana encima ensucia el dibujo; abrir la figura a lo largo de la
línea es como un plano técnico resuelve exactamente este problema. La vertical
de la barra sí queda atrás: es una referencia tenue que recorre todo el alto, y
partir la figura por ella costaría más de lo que aporta.

Las curvas viven dentro del gráfico, en columna sobre el borde izquierdo: un
gráfico chico por articulación, cada uno con su nombre en su color. Los cuatro
comparten la escala vertical, y esa es toda la razón de separarlos. Así una
curva que queda chata contra el piso está diciendo que esa articulación no está
trabajando, no que su gráfico sea aburrido; darle a cada una su propia escala
llenaría los cuatro paneles de forma y destruiría en silencio la comparación.

Como los nombres van en el color de cada articulación, los gráficos son también
la clave de color de los brazos de palanca. Si se apagan, queda una leyenda
mínima en su lugar.

El dibujo reserva el ancho de esa columna y el alto de los controles de abajo,
los dos medidos y no estimados, así que la figura se acomoda alrededor en vez de
quedar tapada.

## Cómo está armado el modelo

### Antropometría

Las longitudes de segmento salen de Drillis y Contini (1964) tal como las
reproduce Winter en *Biomechanics and Motor Control of Human Movement*, fig 4.1.
Las masas y los centros de masa salen de la tabla 4.1 del mismo libro (datos de
Dempster). Las ocho masas segmentarias suman exactamente el peso corporal, y hay
un test que lo verifica.

Podés editar cada segmento por separado. Mover la altura reescala todo con las
proporciones estándar; mover un segmento suelto lo desacopla.

### Cinemática

El cuerpo es una cadena plana en el plano sagital: pie, tibia, fémur y una columna.
La columna no es un eslabón más: es una curva, y de ahí sale que flexionarla acorte
la cuerda cadera-hombro por geometría, que es la razón real por la que redondear la
espalda baja el brazo de palanca de cadera.

### La columna es una curva, no eslabones con bisagras

La literatura sagital describe la columna por cómo se reparte su **curvatura** a lo
largo del recorrido, no por rótulas entre tramos rígidos: arcos de círculo tangentes
en Berthonnaud / Roussouly y en Vaz, splines o polinomios en los métodos más finos,
una viga elástica en los modelos de carga. El modelo hace lo mismo. La curvatura se
integra en la dirección de la tangente y la tangente en la forma, así que los grados
del control son exactamente el giro total del sacro al acromion.

La curvatura se reparte con un coseno elevado por región: cero en los dos extremos y
máxima en el vértice, en L3 para la lumbar y en T7 para la dorsal, que es donde una
lordosis y una cifosis tienen su punto extremo. Que se anule en los bordes es lo que
deja la espalda sin pliegues: la tangente y la curvatura misma quedan continuas donde
una región le pasa el giro a la siguiente. No hay ninguna articulación donde la línea
pueda quebrarse.

**A 0° la curvatura es cero en todo el recorrido y la espalda sale recta**, que es lo
que "neutro" tiene que leerse. La lordosis y la cifosis de una columna neutra real se
mueven un par de centímetros alrededor de la cuerda cadera-hombro y se cancelan sobre
ella; dibujar esa S es más ruido que información, y a 0° pedía leerse como una espalda
ya redondeada. De ahí en más cada grado arquea toda la espalda un poco más para el
mismo lado: 1,6 cm de panza en L3 a 12°, 4,5 cm a 40°. Nunca hay una inflexión.

El reparto entre regiones es el que midió Aasa (2019): los primeros grados son
mayormente lumbares, en proporción 65 / 35, porque lo primero que cede es la lordosis;
una vez gastados los 28° de excursión lumbar, el resto se lo lleva la dorsal. Eso es
lo que se ve en la sala: pasado cierto punto lo que redondea es la espalda alta, no
una lumbar que se sigue plegando.

El largo de arco es fijo y vale el `torso` de la tabla antropométrica, así que a 0°
la cuerda mide exactamente eso. Arquear una curva de largo fijo acorta la recta que
la cruza, y por eso la cuerda cadera-hombro se acorta sola: 40° de flexión la dejan
en el 97,5 %. Ese es el mecanismo completo, sin factores de ajuste.

### La tibia de pie no está vertical

El tobillo se ubica un cuarto de largo de pie por detrás del mediopié. Con la
tibia exactamente vertical, la rodilla queda sobre el tobillo y todo el cuerpo
queda apilado detrás del punto sobre el que tiene que equilibrar. Algo tiene que
ceder, y en el modelo cedía el tronco: el levantamiento terminaba con el torso
inclinado 4,7° hacia adelante.

Ahora la rampa de tibia no termina en cero sino en el ángulo que pone la rodilla
sobre el mediopié —unos 8,9° para este cuerpo—, que es lo que hace la
bipedestación real: unos grados de dorsiflexión, con la línea de gravedad por
delante del tobillo. Con eso el lockout es una pila vertical y los momentos se
reparten como corresponde: cadera y rodilla quedan en menos de 1 N·m, y el
tobillo se queda con 85 N·m, porque todo el sistema pesa 6,65 cm por delante del
eje del tobillo. Eso son los gemelos, y es la respuesta correcta.

### Restricciones y grados de libertad

En cada instante hay tres restricciones duras: la altura de la barra (o de la
cadera en sentadilla), el equilibrio del conjunto cuerpo más barra, y el cierre de
la cadena cinemática. Eso deja un grado de libertad, y ese grado de libertad es
justamente lo que llamamos **coordinación**: cuánto viajan las rodillas hacia
adelante. El modelo no predice qué patrón vas a usar; te muestra qué cuesta cada
uno.

El equilibrio se resuelve por bisección con un número acotado de iteraciones. Es
una diferencia deliberada respecto de MySquatMechanics, cuya página de peso muerto
entra en un bucle infinito y congela el navegador en buena parte de las
combinaciones de sliders.

Hay dos modos de restricción de equilibrio:

- **Equilibrar sobre el pie**: elegís dónde cae la presión y el modelo busca la
  posición de barra que lo logra.
- **Fijar la barra**: fijás la barra y el modelo te dice dónde cae la presión. Es
  el protocolo con el que Edington et al. (2018) compararon barra cerca y lejos.

### Cinética

Los momentos se calculan de arriba hacia abajo: cada articulación soporta la suma
de los momentos gravitatorios de todo lo que carga, incluida la barra. No se usa
el atajo del vector de fuerza de reacción del suelo, que ignora el peso
supraincumbente.

Cadera, rodilla y tobillo se informan **por pierna**, que es la convención de la
literatura de dinámica inversa contra la que validamos. L5/S1 es una sola
articulación en la línea media y lleva toda la carga. El signo está normalizado
para que positivo siempre signifique demanda extensora.

La compresión lumbar es una estimación con un músculo equivalente de 6 cm de brazo
tirando a 10° del eje de la columna. Ese brazo sale de despejarlo de Cholewicki
(1991): su pico de 17,2 kN de compresión frente a un momento de 1047 N·m implica
unos 6 cm. Tomala como orden de magnitud, no como un número clínico.

## Validación

`npm test` corre 38 tests que anclan el modelo a la literatura y verifican que
los controles no puedan salirse de él:

| Qué se verifica | Fuente |
| --- | --- |
| Las masas segmentarias suman el peso corporal | Winter, tabla 4.1 |
| Altura de cadera de pie = 0,53 × altura | Drillis y Contini |
| Ángulo de torso con barra cerca: 77,6° ± 5,3 desde la vertical | Edington et al. (2018) |
| La barra lejos sube la demanda de rodilla y deja la cadera casi igual | Edington et al. (2018) |
| Momento de cadera por pierna en tirones pesados | Bouvier et al. (2025) |
| High bar es más erguido y más dominante de rodilla que low bar | Glassbrook et al. (2017) |
| Demanda extensora de cadera en sentadilla | Escamilla et al. (2001) |
| El pico de momento de cadera en sentadilla cae apenas saliendo del hoyo | — |
| A 0° de flexión la espalda queda recta, sin ninguna S | — |
| Cada grado de flexión arquea toda la espalda para el mismo lado, sin inflexiones | — |
| La cadena cierra y el equilibrio se cumple en todo el recorrido | — |
| La barra nunca queda por detrás de la tibia, en ningún punto del recorrido | — |
| Todo valor que un control ofrece da una postura con los segmentos del largo correcto | — |
| El lockout se alcanza con la columna neutra y con la espalda redondeada | — |

Las diferencias entre patrones responden más fuerte que en los datos medidos,
porque el modelo mantiene el centro de presión fijo mientras que los sujetos
también corrían la barra. Los tests verifican la dirección, no la magnitud exacta.

## Límites conocidos

- Es plano y cuasi-estático: no hay velocidad, aceleración ni inercia.
- Vale para peso muerto convencional y sentadilla con stance estrecho o medio. En
  sumo y stance ancho, Escamilla midió errores de 16 a 18 cm en los brazos de
  palanca al analizar en 2D.
- En peso muerto se asume el brazo vertical, válido con cargas altas porque el
  brazo trabaja como tensor. Con cargas livianas el hombro se adelanta.
- El pico de momento no es el sticking point: el punto de estancamiento real
  depende también de la relación fuerza-longitud y del momento angular.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests del modelo
npm run typecheck  # chequeo de tipos
npm run inspect    # vuelca los números del modelo por consola
npm run build      # build de producción
```

El estado vive en la URL, así que cualquier configuración se comparte con un link
y se restaura tal cual. También queda guardada en `localStorage`.

Stack: React 19, TypeScript y Vite, con Motion para las animaciones. El motor
biomecánico (`src/model/`) es TypeScript puro sin dependencias, así que se puede
usar fuera de la app.

## Referencias

- Winter, D. *Biomechanics and Motor Control of Human Movement*, 4ª ed., 2009.
- Drillis, R. y Contini, R. *Body Segment Parameters*, 1964.
- Edington, C. et al. "The Effect of Set Up Position on EMG Amplitude, Lumbar
  Spine Kinetics, and Total Force Output During Maximal Isometric Conventional
  Deadlifts", *Sports* 6(3):90, 2018.
- Escamilla, R. et al. "A three-dimensional biomechanical analysis of sumo and
  conventional style deadlifts", *Med Sci Sports Exerc* 32(7), 2000.
- Escamilla, R. et al. "Effects of technique variations on knee biomechanics
  during the squat and leg press", *Med Sci Sports Exerc* 33(9), 2001.
- Glassbrook, D. et al. "A Review of the Biomechanical Differences Between the
  High-Bar and Low-Bar Back-Squat", *J Strength Cond Res* 31(9), 2017.
- Aasa, U. et al. "Lumbar spine kinematics during the deadlift", 2019.
- Cholewicki, J., McGill, S. y Norman, R. "Lumbar spine loads during the lifting
  of extremely heavy weights", *Med Sci Sports Exerc* 23(10), 1991.
