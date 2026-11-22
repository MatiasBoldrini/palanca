# Palanca

Laboratorio interactivo de **peso muerto, press de banca y sentadilla**. Girá el cuerpo en 3D y seguí las fuerzas, los momentos articulares y los brazos de palanca durante cada repetición.

![Fuerzas y momentos en el despegue del peso muerto](docs/peso-muerto.png)

## Explorar un levantamiento

1. Elegí un ejercicio y usá los botones bajo el recorrido para comparar la posición baja, la mitad y el bloqueo. También podés reproducir la repetición, pausarla o verla a media velocidad.
2. **Fuerzas** dibuja flechas rectas desde el punto de aplicación. El peso corporal y el de la barra apuntan hacia abajo. En los levantamientos de pie, la reacción total del suelo apunta hacia arriba. En banca se distinguen el apoyo del banco y el de los pies.
3. **Momentos** dibuja arcos alrededor de cada articulación. Su sentido indica el giro interno necesario para equilibrar la postura. Elegí una articulación para aislarla y mostrar la distancia perpendicular a la vertical de la carga.
4. En **Press de banca**, pausá en el pecho, seleccioná el hombro y variá el ancho de agarre. La vista desde los pies permite ver la separación lateral entre la mano y el hombro. Las curvas muestran la magnitud del momento total de cada articulación por brazo.
5. Cambiá entre músculos y esqueleto o abrí el diagrama 2D en la misma postura. En **Ajustes** podés editar la carga o copiar un enlace a la posición con sus capas de biomecánica.

![Press de banca con las fuerzas y momentos sobre la anatomía](docs/banca.png)

## Cómo interpretar los valores

El modelo equilibra cada postura con fuerzas verticales y expresa la demanda interna en N·m. En peso muerto y sentadilla, los momentos de cadera, rodilla y tobillo corresponden a una pierna. L5/S1 corresponde al tronco completo. Seleccionar una articulación muestra la contribución de la barra y de los segmentos corporales. En el despegue del peso muerto, las manos sostienen toda la carga.

En banca cada mano sostiene la mitad del peso de la barra. El modelo usa un apoyo vertical equivalente bajo los hombros y otro entre los pies. Las mediciones de un press real también incluyen aceleración y fuerzas horizontales que varían con el agarre. [Larsen y colaboradores (2021)](https://pubmed.ncbi.nlm.nih.gov/33554113/)

El color muscular ilustra la demanda relativa de la articulación asociada en distintos puntos del recorrido. La fuerza de cada músculo y su activación eléctrica requieren información adicional. Las mallas se sirven junto con la aplicación y el diagrama 2D sigue disponible si falla WebGL. [Fuentes y licencias del atlas](public/anatomy/creditos.html)

![Sentadilla con la palanca de la rodilla](docs/sentadilla.png)

## Desarrollo y verificación

```sh
npm ci
npm run dev
```

```sh
npm run build
npm test
npm run audit:motion
```

La [auditoría de animaciones](docs/auditoria-animaciones.md) reúne los problemas corregidos, los recorridos evaluados y los controles probados en el navegador.
