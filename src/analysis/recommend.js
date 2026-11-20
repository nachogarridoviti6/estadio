// Recomendador.
//  1) findBetterDeals: asientos LIBRES con vista igual o mejor que cuestan menos.
//  2) findContextualTips: consejos según cómo es TU asiento (lluvia, accesos,
//     tipo de zona, grupo...). Cada consejo puede traer un asiento alternativo.

export const SIMILAR_TOLERANCE = 0.15; // en puntos de rating (0-10)

// Zonas que no se mezclan: no recomendamos la grada de animación (de pie), el
// sector visitante ni la zona familiar a quien no ha elegido ya esa zona (la
// familiar solo se sugiere con su propio consejo para grupos).
const EXCLUSIVE_ZONES = new Set(['animacion', 'visitante', 'familiar']);
const zoneCompatible = (seat, c) => !EXCLUSIVE_ZONES.has(c.zone) || c.zone === seat.zone;

function candidates(venue, seat, quantity, filter) {
  const bestPerRow = new Map();
  for (const c of venue.seats) {
    if (c.sold || c.idx === seat.idx || !zoneCompatible(seat, c) || !filter(c)) continue;
    const key = `${c.sectorId}-${c.row}`;
    const prev = bestPerRow.get(key);
    if (prev && prev.rating >= c.rating) continue;
    if (quantity > 1 && !hasContiguous(venue, c, quantity)) continue;
    bestPerRow.set(key, c);
  }
  return [...bestPerRow.values()];
}

export function findBetterDeals(venue, seat, { limit = 5, quantity = 1 } = {}) {
  const minRating = seat.rating - SIMILAR_TOLERANCE;
  return candidates(venue, seat, quantity, (c) => c.price < seat.price && c.rating >= minRating)
    .map((c) => ({
      seat: c,
      saving: seat.price - c.price,
      ratingDelta: Math.round((c.rating - seat.rating) * 10) / 10,
      kind: c.rating > seat.rating + SIMILAR_TOLERANCE ? 'better' : 'similar',
    }))
    .sort((a, b) => b.saving - a.saving || b.seat.rating - a.seat.rating)
    .slice(0, limit);
}

// Elige el candidato más parecido en precio y, a igualdad, con mejor vista.
function closestInPrice(list, price) {
  return list.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price) || b.rating - a.rating)[0];
}

export function findContextualTips(venue, seat, { quantity = 1 } = {}) {
  const tips = [];
  const near = (c, tol = 0.3) => c.rating >= seat.rating - tol;
  const priceOk = (c, up = 10) => c.price <= seat.price + up;

  if (!seat.covered) {
    const alt = closestInPrice(
      candidates(venue, seat, quantity, (c) => c.covered && near(c) && priceOk(c)), seat.price);
    tips.push({
      id: 'rain', icon: '🌧️', title: '¿Y si llueve?',
      text: alt
        ? 'Tu asiento está al descubierto. Este está cubierto y tiene una vista parecida:'
        : 'Tu asiento está al descubierto. No hay asientos cubiertos libres con vista parecida a un precio similar.',
      seat: alt,
    });
  }

  if (seat.accessDist > 22) {
    const alt = closestInPrice(
      candidates(venue, seat, quantity, (c) => c.accessDist <= 12 && near(c, 0.2) && priceOk(c, 5)), seat.price);
    tips.push({
      id: 'access', icon: '🚪', title: 'Lejos de la salida',
      text: `Estás a unos ${seat.accessDist} m del acceso más cercano (bar y aseos a ${seat.barDist} m).` +
        (alt ? ' Si quieres salir rápido en el descanso, este está mucho más cerca:' : ''),
      seat: alt,
    });
  }

  if (seat.zone === 'animacion') {
    const alt = closestInPrice(
      candidates(venue, { ...seat, zone: null }, quantity, (c) => !c.zone && near(c, 0.4) && priceOk(c, 10)), seat.price);
    tips.push({
      id: 'calm', icon: '📣', title: 'Estás en la grada de animación',
      text: 'Aquí se anima de pie los 90 minutos. Si prefieres ver el partido sentado, tienes esta alternativa:',
      seat: alt,
    });
  }

  if (seat.zone === 'junto-visitante' || seat.zone === 'visitante') {
    const zone = venue.cfg.zones.find((z) => z.id === seat.zone);
    tips.push({ id: 'away', icon: '⚠️', title: zone.label, text: zone.note });
  }

  if (quantity >= 3 && seat.zone !== 'familiar') {
    const fam = candidates(venue, { ...seat, zone: 'familiar' }, quantity, (c) => c.zone === 'familiar');
    const alt = fam.sort((a, b) => b.rating - a.rating)[0];
    if (alt) tips.push({
      id: 'family', icon: '👨‍👩‍👧', title: '¿Vais en familia?',
      text: 'La zona familiar tiene ambiente tranquilo y descuento para menores. Mejor opción libre para vuestro grupo:',
      seat: alt,
    });
  }

  if (quantity > 1 && !hasContiguous(venue, seat, quantity)) {
    tips.unshift({
      id: 'together', icon: '👥', title: `No hay ${quantity} asientos juntos aquí`,
      text: `Alrededor de este asiento no quedan ${quantity} libres seguidos. Las recomendaciones de abajo sí los tienen.`,
    });
  }
  return tips;
}

export function hasContiguous(venue, seat, qty) {
  const sec = venue.sectorById[seat.sectorId];
  const perRow = sec.seatIdx.length / sec.rows;
  const rowStart = sec.seatIdx[0] + (seat.row - 1) * perRow;
  const k = seat.number - 1;
  for (let start = Math.max(0, k - qty + 1); start <= k; start++) {
    if (start + qty > perRow) break;
    let ok = true;
    for (let m = 0; m < qty; m++) if (venue.seats[rowStart + start + m].sold) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
