# Auditoría de animaciones de Palanca

## Recorrido y sincronización

| Componente | Hallazgo | Cambio comprobado |
| --- | --- | --- |
| Peso muerto y sentadilla | El sentido de inicio dependía de la altura de la barra. El peso muerto desde el piso terminaba de pie tras media repetición. | El peso muerto sube y vuelve al piso. La sentadilla comienza de pie, baja y vuelve a subir. Cada extremo depende del rango alcanzable de la configuración. |
| Press de banca | La nueva trayectoria debe mantener el agarre y cerrar la repetición para distintos anchos de manos. | La barra parte del bloqueo, llega al pecho y regresa al bloqueo. La posición «Mitad» está a igual distancia vertical del pecho y del bloqueo para cualquier agarre. Los codos se extienden con longitudes de brazo y antebrazo constantes. |
| Pausa y velocidad | Reanudar desde una postura intermedia podía invertir el movimiento. | El reproductor conserva fase y sentido al pausar o alternar entre 1× y 0,5×. El cambio de ejercicio, la edición y el desplazamiento manual detienen el recorrido. |
| Contacto de la barra | En peso muerto con las rodillas adelantadas y el apoyo posterior, el límite de la tibia desaparecía en un solo paso al superar la rodilla. La barra saltaba unos 6 cm. | El límite se libera de manera continua al pasar la rodilla. En el barrido de peso muerto, el mayor desplazamiento entre posiciones factibles contiguas fue de 3,37 mm con pasos del 0,1 % del recorrido. |
| Curvas, ángulos y trabajo | El indicador del gráfico saltaba al punto muestreado más cercano y podía mostrar otro instante que la figura. Algunas configuraciones extremas tenían un recorrido más corto que el gráfico. | El indicador y el valor numérico siguen el fotograma exacto. Curvas, encuadre y trabajo usan el tramo alcanzable. |
| Cámara, capas y selección | El esquema lateral cambiaba de escala con el levantamiento. | El diagrama y el atlas usan el barrido de la repetición para fijar la escala. Se puede cambiar de capa, encuadre o representación con el recorrido en la misma posición. |
| Transiciones de interfaz | El modelo seguía interpolando algunos cambios de configuración. | Cambiar de ejercicio reinicia la interpolación. La preferencia de movimiento reducido elimina los giros y desplazamientos automáticos. La repetición se inicia con el control de reproducción. |

## Qué se verificó

Para peso muerto y sentadilla, `npm run audit:motion` usa las proporciones de referencia, una barra de 100 kg, los diez patrones incluidos y tres puntos de apoyo situados a −6, 0 y +6 cm del mediopié.

- **30.030 posiciones absolutas**. Se recorren 1.001 posiciones por configuración. Se comprueba que todas las coordenadas sean finitas y se mide el desplazamiento entre pares factibles consecutivos. En sentadilla, 11.437 pares consecutivos fueron factibles. Entre esos pares, la barra se desplazó como máximo 6,91 mm y la cabeza, 28,29 mm. Algunos apoyos extremos dejan la postura fuera de equilibrio.
- **12.630 cuadros de reproducción**. Se recorre el intervalo factible de cada configuración durante siete segundos a 60 Hz simulados. Se verifica la factibilidad de cada cuadro y que todas las coordenadas de la postura final coincidan con la inicial.
- **27.027 posiciones de banca**. Se combinan tres estaturas (1,45, 1,75 y 2,10 m), tres cargas (0, 100 y 300 kg) y tres separaciones de manos (1, 1,5 y 2 veces el ancho de hombros), con 80 kg de masa corporal. Las manos permanecen en el eje de la barra. Las reacciones del banco y de los pies son ascendentes y equilibran los pesos y sus momentos. En pasos uniformes de 0,1 % de la altura total, el mayor desplazamiento fue de 0,62 mm para la barra y 14,32 mm para los codos. Al estirar por completo el brazo, un cambio pequeño de altura corresponde a un cambio mayor en el ángulo del codo.
- **11.367 cuadros de reproducción en banca**. En las 27 configuraciones, la altura de la barra disminuye hasta el pecho y aumenta hasta el bloqueo. La repetición desacelera al acercarse a cada extremo. El codo se desplazó como máximo 5,52 mm por cuadro y 0,47 mm en el cuadro que entra o sale del bloqueo. Se conserva el plano de flexión del codo incluso al extender los brazos. La postura, las fuerzas y todos los momentos al cerrar cada repetición coinciden con los del cuadro inicial.
- **Interacción en Chrome**. Se verificaron ambas vistas, las capas de huesos y músculos, el giro y el zoom, la selección de grupos, la pausa, el cambio de velocidad, el control manual y la edición articular. Se probaron el tamaño móvil de 390 × 844, la navegación con teclado, la preferencia de movimiento reducido y el retorno al diagrama al perder WebGL.

En reposo, el visor dejó de emitir llamadas de dibujo. En este Mac, Chrome con aceleración gráfica ANGLE/Metal sostuvo 60 cuadros por segundo durante una muestra de 2,3 segundos de reproducción. En Chrome con renderizado por software (SwiftShader), el ajuste de resolución y sombras durante el movimiento pasó de 7,8 a 10,4 cuadros por segundo en la comparación local. La resolución original se recuperó al pausar. Queda pendiente una medición en teléfonos físicos.

Los 60 Hz son la cadencia del ensayo numérico. El rendimiento gráfico depende del dispositivo. La auditoría evalúa continuidad y coherencia con el modelo de Palanca. Los detalles de superficie y el agarre son aproximaciones ilustrativas de las mallas anatómicas.

## Lectura en pantalla

En Chrome se contrastaron con el modelo 55 combinaciones de peso muerto y sentadilla con anchos de 320, 390 y 1366 píxeles, dos capas anatómicas y cuatro cámaras. Los rótulos quedaron dentro del visor y sin solapamientos entre sí o con los controles de cámara. En banca se cotejaron las siete lecturas de fuerza y momento en cinco configuraciones con 180 kg. Se verificaron el agarre, las capas, las cámaras, la selección directa y la vuelta al diagrama tras perder WebGL. Los enlaces de la versión anterior abren con las nuevas flechas y arcos visibles.

## Cómo interpretar las flechas

En los tres ejercicios se supone equilibrio cuasiestático en cada postura y reparto simétrico entre ambos lados. La velocidad de reproducción modifica el tiempo de la demostración. Los cálculos usan el peso de los segmentos corporales y de la barra en la postura actual.

En sentadilla y peso muerto, la reacción total del suelo se aplica en el centro de presión entre los pies. El peso corporal actúa en el centro de masa del cuerpo y el peso de la barra en su eje. Los arcos dibujan el momento interno sobre el segmento proximal en el plano sagital. Cada cadera, rodilla y tobillo recibe la mitad de la carga bilateral, mientras que L5/S1 soporta la carga completa. Las pruebas comparan el aporte del cuerpo con el de la misma postura descargada y verifican el aporte de la barra mediante su brazo de palanca horizontal.

En banca, cada mano recibe la mitad del peso de la barra. El contacto del cuerpo con el banco se resume en una reacción vertical a la altura de los hombros, y el apoyo en ambos pies en otra reacción vertical en el suelo. El arco de cada brazo muestra el momento interno sobre los segmentos distales al hombro, codo o muñeca alrededor de su eje tridimensional. El modelo excluye aceleraciones, empujes horizontales y empuje voluntario de piernas. Mediciones con barras instrumentadas muestran que la fuerza horizontal de las manos varía con el agarre. [Larsen, Gomo y van den Tillaar, 2021](https://pubmed.ncbi.nlm.nih.gov/33554113/)

## Apertura, edición en 3D y reparto de carga

- Las pruebas de postura recorren 369 configuraciones de peso muerto convencional, sumo y sentadilla. Comprueban las longitudes reales de los segmentos, la ubicación de las manos respecto de las rodillas, el contacto de los pies y el equilibrio para tres aperturas por variante. Un barrido adicional de 567 posturas comprobó las posiciones del esqueleto renderizado en tres estaturas.
- En el modelo de referencia de 1,75 m y 80 kg, con 100 kg en la barra, pasar de convencional a sumo en el despegue lleva la apertura de 24 a 75 cm. El tronco pasa de 70° a 55° respecto de la vertical, el momento sagital de cadera por pierna pasa de 313 a 274 N·m y la barra recorre 57 cm en la repetición sumo frente a 61 cm en la convencional. Las cifras están redondeadas y dependen de las proporciones y la coordinación elegidas.
- En Chrome se contrastó el ancho del modelo con la cota de la vista frontal en escritorio y a 320 px. Los pies y las manos se distinguen a ambos lados de la barra. El enlace guardado restaura la apertura de cada ejercicio.
- **Edición por segmento**. Tocar la anatomía abre los ajustes de esa parte. Las pruebas cubrieron rotación, posición y largo, incluidos los extremos del recorrido, el contacto con la barra y las longitudes de los segmentos vecinos. En la captura del editor se seleccionó el fémur directamente sobre el modelo y se cambió su largo con el teclado. Las fuerzas de contacto se comprueban en ambas manos, la espalda o el banco según el ejercicio, y en ambos pies.

## Pantalla de estudio en el celular

En Chrome con emulación táctil a 390 × 844 px, el lienzo inicial de peso muerto pasó de empezar a 319 px de la parte superior a empezar a 108 px. Su altura pasó de 299 a 598 px. En 320 × 667 px, el lienzo inicial mide 421 px de alto. En ambos tamaños entran el movimiento, la reproducción y el interruptor **Fuerzas y momentos** en la primera pantalla de los tres ejercicios.

El interruptor muestra las fuerzas, los momentos y la guía conservando la posición del recorrido y la cámara. La variante o el agarre se ajustan al lado de la carga. Desde **Herramientas** se accede al editor del cuerpo, la anatomía y el diagrama 2D. La revisión visual siguió el procedimiento de [Unslop, de Damir Sokolovsky](https://github.com/heydamir/unslop).

La verificación en Chrome incluyó los anchos de 320, 390 y 1024 px, los tres ejercicios, el foco de teclado al cerrar menús, los cambios de postura y de fase, la restauración de enlaces y la edición de segmentos. En el banco se comprobó el reparto al cambiar el agarre. En los tres ejercicios se probaron el giro del modelo y el zoom desde el control de cámara.
