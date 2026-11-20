// Genera el inventario completo del recinto (sectores + asientos) a partir de la
// configuración. Es JS puro (sin Three.js) para poder usarlo en servidor/tests.

import { scoreSeats } from '../analysis/viewScore.js';

const UP = [0, 1, 0];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round5 = (v) => Math.round(v / 5) * 5;

export function generateVenue(cfg, { seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const sectors = [];
  const seats = [];
  const { seatWidth: sw, rowDepth: rd, aisle } = cfg;

  for (const tierKey of ['lower', 'upper']) {
    const tier = cfg.tiers[tierKey];
    let sectorCounter = 1;

    for (const stand of cfg.stands) {
      const n = stand.normal;
      const t = cross(n, UP);
      const edgePt = [n[0] * stand.edge, 0, n[2] * stand.edge];
      const sectorLen = stand.seatsPerSector * sw;
      const total = stand.sectors * sectorLen + (stand.sectors - 1) * aisle;

      for (let j = 0; j < stand.sectors; j++) {
        const id = `${tier.digit}${String(sectorCounter++).padStart(2, '0')}`;
        const basePrice = round5(stand.price[tierKey] * stand.centerPremium[j]);
        const s0 = -total / 2 + j * (sectorLen + aisle);
        // Ocupación por sector: los sectores céntricos se venden más.
        const occupancy = 0.45 + 0.35 * stand.centerPremium[j] * rand();

        const sector = {
          id,
          name: `Sector ${id}`,
          standId: stand.id,
          standName: stand.name,
          tier: tierKey,
          tierLabel: tier.label,
          index: j,
          basePrice,
          // geometría para el 3D
          frame: { origin: edgePt, normal: n, tangent: t },
          sRange: [s0, s0 + sectorLen],
          uFront: stand.front + tier.offset,
          rows: tier.rows,
          rise: tier.rise,
          h0: tier.h0,
          seatIdx: [],
        };

        for (let r = 0; r < tier.rows; r++) {
          const u = sector.uFront + r * rd + rd * 0.5;
          const h = tier.h0 + r * tier.rise;
          // Banda de precio: primeras filas de grada baja algo más baratas.
          const price = tierKey === 'lower' && r < 4 ? round5(basePrice * 0.9) : basePrice;
          const rowBias = rand() * 0.25 - 0.12;

          for (let k = 0; k < stand.seatsPerSector; k++) {
            const s = s0 + (k + 0.5) * sw;
            const pos = [
              edgePt[0] + n[0] * u + t[0] * s,
              h,
              edgePt[2] + n[2] * u + t[2] * s,
            ];
            const eu = u + 0.05;
            const eye = [
              edgePt[0] + n[0] * eu + t[0] * s,
              h + cfg.eyeHeight,
              edgePt[2] + n[2] * eu + t[2] * s,
            ];
            const idx = seats.length;
            seats.push({
              idx,
              sectorId: id,
              row: r + 1,
              number: k + 1,
              pos,
              eye,
              normal: n,
              price,
              sold: rand() < occupancy + rowBias,
              distCenter: Math.hypot(eye[0], eye[1], eye[2]),
              height: eye[1],
            });
            sector.seatIdx.push(idx);
          }
        }
        sectors.push(sector);
      }
    }
  }

  // Bajo voladizo: filas de grada baja que quedan bajo la grada alta.
  for (const sec of sectors) {
    if (sec.tier !== 'lower') continue;
    const overhangU = cfg.stands.find((s) => s.id === sec.standId).front + cfg.tiers.upper.offset;
    for (const i of sec.seatIdx) {
      const r = seats[i].row - 1;
      seats[i].underOverhang = sec.uFront + r * rd + rd * 0.5 > overhangU;
    }
  }

  scoreSeats(seats, cfg);

  const sectorById = Object.fromEntries(sectors.map((s) => [s.id, s]));
  for (const sec of sectors) {
    const avail = sec.seatIdx.filter((i) => !seats[i].sold);
    sec.available = avail.length;
    sec.minPrice = Math.min(...avail.map((i) => seats[i].price));
  }
  return { cfg, sectors, seats, sectorById };
}
