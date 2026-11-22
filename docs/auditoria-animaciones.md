# Auditoría de animaciones de Palanca

## Recorrido y sincronización

| Componente | Hallazgo | Cambio comprobado |
| --- | --- | --- |
| Peso muerto y sentadilla | El sentido de inicio dependía de la altura de la barra. El peso muerto desde el piso terminaba de pie tras media repetición. | El peso muerto sube y vuelve al piso. La sentadilla comienza de pie, baja y vuelve a subir. Cada extremo depende del rango alcanzable de la configuración. |
| Pausa y velocidad | Reanudar desde una postura intermedia podía invertir el movimiento. | El reproductor conserva fase y sentido al pausar o alternar entre 1× y 0,5×. El cambio de ejercicio, la edición y el desplazamiento manual detienen el recorrido. |
| Contacto de la barra | En peso muerto con las rodillas adelantadas y el apoyo posterior, el límite de la tibia desaparecía en un solo paso al superar la rodilla. La barra saltaba unos 6 cm. | El límite se libera de manera continua al pasar la rodilla. En el barrido de peso muerto, el mayor desplazamiento entre posiciones factibles contiguas fue de 3,34 mm con pasos del 0,1 % del recorrido. |
| Curvas, ángulos y trabajo | El indicador del gráfico saltaba al punto muestreado más cercano y podía mostrar otro instante que la figura. Algunas configuraciones extremas tenían un recorrido más corto que el gráfico. | El indicador y el valor numérico siguen el fotograma exacto. Curvas, encuadre y trabajo usan el tramo alcanzable. |
| Cámara, capas y selección | El esquema lateral cambiaba de escala con el levantamiento. | El diagrama y el atlas usan el barrido de la repetición para fijar la escala. Se puede cambiar de capa, encuadre o representación con el recorrido en la misma posición. |
| Transiciones de interfaz | El modelo seguía interpolando algunos cambios de configuración. | Cambiar de ejercicio reinicia la interpolación. La preferencia de movimiento reducido elimina los giros y desplazamientos automáticos. La repetición se inicia con el control de reproducción. |

## Qué se verificó

`npm run audit:motion` usa las proporciones de referencia, una barra de 100 kg, los diez patrones incluidos y tres puntos de apoyo situados a −6, 0 y +6 cm del mediopié.

- **30.030 posiciones absolutas**. Se recorren 1.001 posiciones por configuración. Se comprueba que todas las coordenadas sean finitas y se mide el desplazamiento entre pares factibles consecutivos. La sentadilla produce combinaciones fuera de equilibrio con algunos apoyos extremos.
- **12.630 cuadros de reproducción**. Se recorre el intervalo factible de cada configuración durante siete segundos a 60 Hz simulados. Se verifica la factibilidad de cada cuadro y que todas las coordenadas de la postura final coincidan con la inicial.
- **Interacción en Chrome**. Se verificaron ambas vistas, las capas de huesos y músculos, el giro y el zoom, la selección de grupos, la pausa, el cambio de velocidad, el control manual y la edición articular. Se probaron el tamaño móvil de 390 × 844, la navegación con teclado, la preferencia de movimiento reducido y el retorno al diagrama al perder WebGL.

En reposo, el visor dejó de emitir llamadas de dibujo. En este Mac, Chrome con aceleración gráfica ANGLE/Metal sostuvo 60 cuadros por segundo durante una muestra de 2,3 segundos de reproducción. En Chrome con renderizado por software (SwiftShader), el ajuste de resolución y sombras durante el movimiento pasó de 7,8 a 10,4 cuadros por segundo en la comparación local. La resolución original se recuperó al pausar. Queda pendiente una medición en teléfonos físicos.

Los 60 Hz son la cadencia del ensayo numérico. El rendimiento gráfico depende del dispositivo. La auditoría evalúa continuidad y coherencia con el modelo de Palanca. Los detalles de superficie y el agarre son aproximaciones ilustrativas de las mallas anatómicas.
