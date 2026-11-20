// Definición declarativa del recinto.
//
// ⚠️ APROXIMADO. Modelo inspirado en el Santiago Bernabéu tras la reforma
// 2019-2024 con datos públicos (Wikipedia, artículo técnico UPM 2025):
//   - Campo 105 x 68 m, aforo ~83.000, todos los asientos azul marino.
//   - Graderío continuo de 5 niveles (grada baja + 4 anfiteatros).
//   - Cubierta fija con óculo retráctil (~96 x 72,5 m), a ~55-65 m del césped.
//   - Videomarcador 360°: 6,5 m de alto en laterales, 11 m en fondos, 8° de inclinación.
// Filas por nivel, pendientes y distancias al campo son ESTIMACIONES. Con los
// planos reales del club solo hay que cambiar este fichero.
//
// Los sectores se referencian con una clave "<grada><nivel>-<n>", p. ej. "S1-3"
// = Fondo Sur, Grada Baja, 3er sector.

export const STADIUM = {
  id: 'bernabeu-aprox',
  name: 'Santiago Bernabéu (modelo aproximado)',
  event: 'Real Demo CF vs Atlético Ejemplo',
  approximate: true,
  pitch: { length: 105, width: 68 },
  seatWidth: 0.5,
  aisle: 1.3,
  eyeHeight: 1.15,
  standingEyeHeight: 1.6,
  seatColor: '#1b2a4a', // azul marino

  // Contorno de la primera fila: distancia a la banda / al fondo y radio de esquina.
  bowl: { sideGap: 7.5, endGap: 10.5, cornerRadius: 16 },

  // Niveles (de abajo arriba). u0 = distancia horizontal desde el contorno base
  // hasta la primera fila; h0 = altura del primer escalón sobre el césped.
  tiers: [
    { key: 't1', label: 'Grada Baja',         digit: 1, rows: 27, rowDepth: 0.80, rise: 0.40, h0: 1.4,  u0: 0 },
    { key: 't2', label: 'Primer Anfiteatro',  digit: 2, rows: 14, rowDepth: 0.80, rise: 0.62, h0: 15.0, u0: 16.0 },
    { key: 't3', label: 'Segundo Anfiteatro', digit: 3, rows: 12, rowDepth: 0.80, rise: 0.68, h0: 26.5, u0: 23.5 },
    { key: 't4', label: 'Tercer Anfiteatro',  digit: 4, rows: 14, rowDepth: 0.78, rise: 0.72, h0: 37.5, u0: 29.5 },
    { key: 't5', label: 'Cuarto Anfiteatro',  digit: 5, rows: 12, rowDepth: 0.76, rise: 0.75, h0: 50.5, u0: 36.5 },
  ],

  // Gradas en orden de recorrido del contorno. Las esquinas van con los fondos.
  stands: [
    { id: 'O', name: 'Lateral Oeste', sectors: 6, priceFactor: 1.15 },
    { id: 'N', name: 'Fondo Norte',   sectors: 5, priceFactor: 0.62 },
    { id: 'E', name: 'Lateral Este',  sectors: 6, priceFactor: 1.0 },
    { id: 'S', name: 'Fondo Sur',     sectors: 5, priceFactor: 0.6 },
  ],
  // Precio base por nivel (lateral, sector central).
  tierPrice: { t1: 120, t2: 105, t3: 85, t4: 65, t5: 45 },

  // Cubierta: óculo abierto sobre el campo; fuera de él todo está cubierto.
  roof: { hx: 48, hz: 36.5, r: 6, height: 65, outerHx: 128, outerHz: 104, outerR: 40, rainMargin: 3 },
  videoBoard: { sideHeight: 6.5, endHeight: 11, tilt: 8 },

  // Fila donde está el vomitorio de cada nivel.
  access: { t1: 12, t2: 1, t3: 1, t4: 7, t5: 1 },
  barSpacing: 40,

  zones: [
    { id: 'animacion', label: 'Grada de animación', icon: '📣', sectors: ['S1-2', 'S1-3', 'S1-4'],
      note: 'Se anima de pie todo el partido. Ambientazo, pero no es para ver sentado.' },
    { id: 'visitante', label: 'Afición visitante', icon: '🧳', sectors: ['N5-5'],
      note: 'Sector reservado a la afición del equipo rival.' },
    { id: 'junto-visitante', label: 'Junto a la afición visitante', icon: '⚠️', sectors: ['N5-4', 'N4-5'],
      note: 'Separación con malla y más presencia de seguridad.' },
    { id: 'familiar', label: 'Zona familiar', icon: '👨‍👩‍👧', sectors: ['E2-5'],
      note: 'Ambiente tranquilo, menores con descuento y aseos con cambiador cerca.' },
    { id: 'vip', label: 'Palco VIP', icon: '🥂', sectors: ['O2-3', 'O2-4'],
      note: 'Zona hospitality: catering incluido y acceso preferente.' },
  ],
};
