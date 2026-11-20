// Definición declarativa del recinto. La idea de producto: cada estadio real
// se describe con un fichero así (o se importa de un plano/CAD) y el resto del
// sistema (3D, puntuación de vista, recomendador) funciona igual.

export const STADIUM = {
  id: 'demo-stadium',
  name: 'Estadio Demo',
  event: 'Real Demo CF vs Atlético Ejemplo',
  pitch: { length: 105, width: 68 },
  seatWidth: 0.5,
  rowDepth: 0.8,
  aisle: 1.2,
  eyeHeight: 1.15, // altura de los ojos sentado sobre el escalón
  standingEyeHeight: 1.6, // de pie (grada de animación)

  tiers: {
    lower: { label: 'Grada Baja', digit: 1, rows: 25, rise: 0.42, h0: 1.0, offset: 0 },
    upper: { label: 'Grada Alta', digit: 2, rows: 20, rise: 0.55, h0: 16, offset: 14 },
  },

  // normal = hacia fuera del campo. edge = distancia del centro a la línea del campo.
  stands: [
    { id: 'T', name: 'Tribuna',      normal: [0, 0, 1],  edge: 34,   front: 6, sectors: 5, seatsPerSector: 44,
      price: { lower: 95, upper: 70 }, centerPremium: [0.78, 0.92, 1.0, 0.92, 0.78] },
    { id: 'N', name: 'Fondo Norte',  normal: [1, 0, 0],  edge: 52.5, front: 9, sectors: 4, seatsPerSector: 36,
      price: { lower: 48, upper: 38 }, centerPremium: [0.9, 1.0, 1.0, 0.9] },
    { id: 'P', name: 'Preferencia',  normal: [0, 0, -1], edge: 34,   front: 6, sectors: 5, seatsPerSector: 44,
      price: { lower: 82, upper: 58 }, centerPremium: [0.8, 0.93, 1.0, 0.93, 0.8] },
    { id: 'S', name: 'Fondo Sur',    normal: [-1, 0, 0], edge: 52.5, front: 9, sectors: 4, seatsPerSector: 36,
      price: { lower: 45, upper: 35 }, centerPremium: [0.9, 1.0, 1.0, 0.9] },
  ],

  // Cubierta: hueco interior (rectángulo redondeado, semiejes en x/z). Lo que
  // queda fuera del hueco está cubierto.
  roof: { hx: 72, hz: 50, r: 20, height: 34, rainMargin: 2 },

  // Accesos (vomitorios): uno en cada pasillo entre sectores, en esta fila.
  access: { lower: { row: 13 }, upper: { row: 8 } },
  // Bares y aseos en el anillo interior, cada X metros.
  barSpacing: 38,

  zones: [
    { id: 'animacion', label: 'Grada de animación', icon: '📣',
      sectors: ['115', '116', '117', '118'],
      note: 'Se anima de pie todo el partido. Ambientazo, pero no es para ver sentado.' },
    { id: 'visitante', label: 'Afición visitante', icon: '🧳', sectors: ['209'],
      note: 'Sector reservado a la afición del equipo rival.' },
    { id: 'junto-visitante', label: 'Junto a la afición visitante', icon: '⚠️', sectors: ['208', '109'],
      note: 'Separación con malla y más presencia de seguridad.' },
    { id: 'familiar', label: 'Zona familiar', icon: '👨‍👩‍👧', sectors: ['214'],
      note: 'Ambiente tranquilo, menores con descuento y aseos con cambiador cerca.' },
  ],
};
