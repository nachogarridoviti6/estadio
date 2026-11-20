// Genera el inventario completo del recinto (sectores + asientos) a partir de la
// configuración. Es JS puro (sin Three.js) para poder usarlo en servidor/tests.

import { BowlContour } from './bowl.js';
import { scoreSeats } from '../analysis/viewScore.js';
import { computeAmenities } from '../analysis/amenities.js';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round5 = (v) => Math.round(v / 5) * 5;

// Tramos del contorno base que ocupa cada grada (las esquinas van con los fondos).
export function standRanges(c) {
  const { a, b } = c, q = c.q();
  const ends = 2 * q + 2 * b;
  return [
    [-a, a],
    [a, a + ends],
    [a + ends, a + ends + 2 * a],
    [a + ends + 2 * a, a + 2 * ends + 2 * a],
  ];
}

// Altura del peto de cada nivel, calculada como en el diseño real de gradas:
// lo más alto posible sin tapar la línea de banda desde la primera fila.
export function parapetTop(cfg, tier) {
  const eyeY = tier.h0 + cfg.eyeHeight;
  const tan = eyeY / (cfg.bowl.sideGap + tier.u0 + tier.rowDepth * 0.5);
  const top = eyeY - (tier.rowDepth * 0.5 + 0.35) * tan - 0.05;
  return Math.min(top, tier.h0 + 1.1);
}

export function makeContour(cfg) {
  return new BowlContour(
    cfg.pitch.length / 2 + cfg.bowl.endGap,
    cfg.pitch.width / 2 + cfg.bowl.sideGap,
    cfg.bowl.cornerRadius,
  );
}

export function generateVenue(cfg, { seed = 11 } = {}) {
  const rand = mulberry32(seed);
  const contour = makeContour(cfg);
  const zoneByKey = {};
  for (const z of cfg.zones || []) for (const k of z.sectors) zoneByKey[k] = z;

  const sectors = [];
  const seats = [];
  const L = contour.length;
  const standOf = (p) => {
    if (Math.abs(p.nx) > 0.5 || p.corner) return p.x > 0 ? 'N' : 'S';
    return p.z > 0 ? 'O' : 'E';
  };
  const standById = Object.fromEntries(cfg.stands.map((st) => [st.id, st]));

  cfg.tiers.forEach((tier, ti) => {
    const nextTier = cfg.tiers[ti + 1];
    const nb = tier.numbering;
    // Tramos de cada lado en el orden del plano (N → O → S → E), recorridos
    // con s decreciente. nb.counts = sectores por lado según el plano.
    const [rO, rN, rE, rS] = standRanges(contour);
    const sides = [rN, rO, rS, rE];
    const spans = [];
    sides.forEach(([a0, a1], k) => {
      const n = nb.counts[k];
      const w = (a1 - a0) / n;
      for (let i = 0; i < n; i++) spans.push([a1 - (i + 1) * w, a1 - i * w]);
    });
    for (let j = 0; j < spans.length; j++) {
      const id = String(nb.from + j * nb.step);
      const zone = zoneByKey[id] || null;
      let s0 = spans[j][0] + cfg.aisle / 2;
      s0 = ((s0 % L) + L) % L;
      const s1 = s0 + (spans[j][1] - spans[j][0]) - cfg.aisle;
      const mid = contour.at((s0 + s1) / 2, 0);
      const stand = standById[standOf(mid)];
      // Precio: más caro cuanto más centrado en su lateral/fondo
      const along = stand.id === 'O' || stand.id === 'E'
        ? Math.abs(mid.x) / contour.hx
        : (mid.corner ? 1 : Math.abs(mid.z) / contour.hz);
      const centrality = 1 - 0.25 * Math.min(1, along);
      let basePrice = round5(cfg.tierPrice[tier.key] * stand.priceFactor * centrality);
      if (zone?.id === 'vip') basePrice = round5(basePrice * 2.4);
      const standing = zone?.id === 'animacion';
      const occupancy = 0.5 + 0.35 * centrality * rand() + (standing ? 0.25 : 0);

      {
        const sector = {
          id, key: id, name: `Sector ${id}`,
          standId: stand.id, standName: stand.name,
          tier: tier.key, tierLabel: tier.label, tierIndex: ti,
          index: j, basePrice, zone,
          s0, s1, rows: tier.rows, rowDepth: tier.rowDepth, rise: tier.rise, h0: tier.h0, u0: tier.u0,
          rowStart: [], rowCount: [], seatIdx: [],
        };

        for (let r = 0; r < tier.rows; r++) {
          const u = tier.u0 + r * tier.rowDepth + tier.rowDepth * 0.5;
          const h = tier.h0 + r * tier.rise;
          const price = ti === 0 && r < 4 ? round5(basePrice * 0.9) : basePrice;
          const rowBias = rand() * 0.25 - 0.12;
          const list = contour.distribute(s0, s1, u, cfg.seatWidth);
          sector.rowStart.push(seats.length);
          sector.rowCount.push(list.length);
          const eyeH = standing ? cfg.standingEyeHeight : cfg.eyeHeight;
          list.forEach((s, k) => {
            const p = contour.at(s, u);
            const e = contour.at(s, u + 0.05);
            const idx = seats.length;
            seats.push({
              idx,
              sectorId: id,
              row: r + 1,
              number: k + 1,
              s,
              pos: [p.x, h, p.z],
              eye: [e.x, h + eyeH, e.z],
              normal: [p.nx, 0, p.nz],
              u,
              price,
              standing,
              sold: rand() < occupancy + rowBias,
              underOverhang: !!nextTier && u > nextTier.u0,
              // Obstáculos delante: peto del nivel y cabeza de la fila anterior
              blockers: [
                { du: u + 0.05 - (tier.u0 - 0.3), top: parapetTop(cfg, tier), weight: 1 },
                ...(r > 0 ? [{ du: tier.rowDepth, top: h - tier.rise + 1.25, weight: 0.22 }] : []),
              ],
              sAct: (k + 0.5) * cfg.seatWidth,
              rowLen: list.length * cfg.seatWidth,
            });
            sector.seatIdx.push(idx);
          });
        }
        sectors.push(sector);
      }
    }
  });

  for (const s of seats) {
    s.distCenter = Math.hypot(s.eye[0], s.eye[1], s.eye[2]);
    s.height = s.eye[1];
  }
  scoreSeats(seats, cfg);

  const sectorById = Object.fromEntries(sectors.map((s) => [s.id, s]));
  for (const sec of sectors) {
    const avail = sec.seatIdx.filter((i) => !seats[i].sold);
    sec.available = avail.length;
    sec.minPrice = avail.length ? Math.min(...avail.map((i) => seats[i].price)) : sec.basePrice;
  }
  const venue = { cfg, contour, sectors, seats, sectorById };
  computeAmenities(venue);
  return venue;
}
