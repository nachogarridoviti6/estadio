# SeatView

Ver la vista real desde tu asiento **antes de comprar la entrada**, y que la web te avise
si hay asientos con vista igual o mejor por menos dinero.

## Arrancar

```bash
npm install
npm run dev
```

## Estructura

- `src/venue/stadiumConfig.js`: definición del recinto (gradas, sectores, filas, precios). Un estadio real = otro fichero de config.
- `src/venue/generateVenue.js`: genera el inventario de asientos (JS puro, sin 3D).
- `src/analysis/viewScore.js`: puntuación objetiva de la vista (0–10 y percentil).
- `src/analysis/recommend.js`: busca asientos libres con vista ≥ y precio < (soporta N asientos juntos).
- `src/scene/`: escena 3D con Three.js (estadio, asientos, público, cámara, miniaturas).
- `src/main.js`: interfaz (ficha del asiento, recomendaciones, modos de color).
