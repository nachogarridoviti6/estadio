# SeatView

Ver la vista real desde tu asiento **antes de comprar la entrada**, y que la web te avise
si hay asientos con vista igual o mejor por menos dinero.

**Web:** https://nachogarridoviti6.github.io/estadio/

## Qué hace

- Estadio en 3D (modelo aproximado del Santiago Bernabéu) con vista exterior, recorte y vuelo
  de cámara hasta el asiento elegido.
- Vista desde cada asiento con público, jugadores animados y nota de calidad de vista (0-10).
- Recomendador: asientos libres con vista igual o mejor por menos dinero, con N asientos juntos.
- Consejos según el asiento: lluvia, salida, grada de animación, afición visitante, familias.
- **Hora del partido:** posición real del sol en Madrid; luz de día, atardecer o noche y
  cuánto sol/sombra tendrá cada asiento durante el partido.
- Mapas de color por precio, calidad de vista y sol/sombra.

## Arrancar en local

```bash
npm install
npm run dev
```

La web se publica sola en GitHub Pages cada vez que se sube algo a `main`.

## Estadio

Modelo **aproximado** del Santiago Bernabéu (reforma 2019-2024) con datos públicos y fotos:
5 niveles de grada, cubierta con óculo, fachada de lamas de acero, videomarcador 360°.
Numeración de sectores según el plano de zonas. Filas, pendientes y distancias son
estimaciones: con los planos oficiales solo hay que cambiar `src/venue/stadiumConfig.js`.

## Recursos 3D (`public/assets`)

Modelos y texturas de ejemplo del repositorio de three.js. Valen para el prototipo; para un
producto comercial hay que sustituirlos por recursos con licencia comercial.

## Estructura

- `src/venue/`: configuración del recinto, geometría del graderío y generación de asientos.
- `src/analysis/`: nota de vista, servicios (accesos, cubierto), sol/sombra y recomendador.
- `src/scene/build/`: gradas, césped, cubierta, exterior, ciudad, público, jugadores, luz.
- `src/scene/StadiumScene.js`: render, animaciones de cámara y selección.
- `src/main.js`: interfaz.
