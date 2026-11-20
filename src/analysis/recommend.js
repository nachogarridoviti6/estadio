// Recomendador: dado el asiento elegido, ¿hay asientos LIBRES con vista igual o
// mejor que cuesten menos? Devuelve como mucho un asiento por (sector, fila)
// para no llenar la lista de asientos casi idénticos.

export const SIMILAR_TOLERANCE = 0.15; // en puntos de rating (0-10)

export function findBetterDeals(venue, seat, { limit = 5, quantity = 1 } = {}) {
  const { seats } = venue;
  const minRating = seat.rating - SIMILAR_TOLERANCE;
  const bestPerRow = new Map();

  for (const c of seats) {
    if (c.sold || c.idx === seat.idx) continue;
    if (c.price >= seat.price || c.rating < minRating) continue;
    if (quantity > 1 && !hasContiguous(venue, c, quantity)) continue;
    const key = `${c.sectorId}-${c.row}`;
    const prev = bestPerRow.get(key);
    if (!prev || c.rating > prev.rating) bestPerRow.set(key, c);
  }

  return [...bestPerRow.values()]
    .map((c) => ({
      seat: c,
      saving: seat.price - c.price,
      ratingDelta: Math.round((c.rating - seat.rating) * 10) / 10,
      kind: c.rating > seat.rating + SIMILAR_TOLERANCE ? 'better' : 'similar',
    }))
    // Primero el ahorro, desempata la vista.
    .sort((a, b) => b.saving - a.saving || b.seat.rating - a.seat.rating)
    .slice(0, limit);
}

function hasContiguous(venue, seat, qty) {
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
