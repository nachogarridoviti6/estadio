# SeatView

Ver la vista real desde tu asiento **antes de comprar la entrada**, y que la web te avise
si hay asientos con vista igual o mejor por menos dinero.

## Arrancar

```bash
npm install
npm run dev
```

## Estadio

Modelo **aproximado** del Santiago Bernabéu (reforma 2019-2024) con datos públicos:
5 niveles de grada continuos, cubierta con óculo a 65 m, videomarcador 360°,
anillo LED y fachada de lamas. Filas, pendientes y distancias son estimaciones:
con los planos oficiales solo hay que cambiar `src/venue/stadiumConfig.js`.

## Recursos 3D (`public/assets`)

Modelos y texturas de ejemplo del repositorio de three.js (avatar Ready Player Me,
Xbot y Soldier de Mixamo, césped, HDR nocturno). Valen para el prototipo; para un
producto comercial hay que sustituirlos por recursos con licencia comercial.

## Estructura

- `src/venue/stadiumConfig.js`: definición del recinto (gradas, sectores, filas, precios). Un estadio real = otro fichero de config.
- `src/venue/generateVenue.js`: genera el inventario de asientos (JS puro, sin 3D).
- `src/analysis/viewScore.js`: puntuación objetiva de la vista (0–10 y percentil).
- `src/analysis/recommend.js`: busca asientos libres con vista ≥ y precio < (soporta N asientos juntos).
- `src/venue/bowl.js`: geometría del graderío continuo (filas paralelas con esquinas).
- `src/scene/build/`: estadio (gradas, césped, cubierta, fachada), público (impostores
  generados desde modelos 3D), jugadores animados.
- `src/scene/StadiumScene.js`: render (sombras, bloom), animaciones de cámara, selección.
- `src/main.js`: interfaz (ficha del asiento, recomendaciones, modos de color).
