// Atributos "de experiencia" de cada asiento, más allá de la vista:
//   - covered: protegido de la lluvia por la cubierta o la grada superior
//   - accessDist: metros andando hasta el acceso (vomitorio) más cercano
//   - barDist: metros hasta el bar/aseos más cercano (acceso + anillo interior)
//   - zone: zona especial (animación, visitante, familiar...)

function insideRoundedRect(x, z, hx, hz, r) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > hx || az > hz) return false;
  const dx = Math.max(ax - (hx - r), 0), dz = Math.max(az - (hz - r), 0);
  return Math.hypot(dx, dz) <= r;
}

export function computeAmenities(venue) {
  const { cfg, sectors, seats } = venue;
  const roof = cfg.roof;
  const zoneBySector = {};
  for (const z of cfg.zones || []) for (const id of z.sectors) zoneBySector[id] = z;

  for (const sec of sectors) {
    sec.zone = zoneBySector[sec.id] || null;
    const accessRow = cfg.access[sec.tier].row;
    const aisleHalf = cfg.aisle / 2;
    // Accesos a ambos lados del sector (pasillos / escaleras laterales)
    sec.accessS = [sec.sRange[0] - aisleHalf, sec.sRange[1] + aisleHalf];
    sec.accessRow = accessRow;
    const perRow = sec.seatIdx.length / sec.rows;

    sec.seatIdx.forEach((i, n) => {
      const s = seats[i];
      const k = n % perRow;
      const sPos = sec.sRange[0] + (k + 0.5) * cfg.seatWidth;
      // Recorrido por la fila + subir/bajar escalones (cuestan más que andar en llano)
      let best = Infinity, bestS = 0;
      for (const a of sec.accessS) {
        const d = Math.abs(sPos - a) + Math.abs(s.row - accessRow) * cfg.rowDepth * 1.8 + 3;
        if (d < best) { best = d; bestS = a; }
      }
      s.accessDist = Math.round(best);
      // Bares cada barSpacing metros en el anillo interior de cada grada
      const toBar = Math.abs(bestS - Math.round(bestS / cfg.barSpacing) * cfg.barSpacing);
      s.barDist = Math.round(best + 8 + toBar);
      s.zone = sec.zone?.id || null;

      // Cubierto si está fuera del hueco de la cubierta (con margen por lluvia
      // inclinada) o bajo el voladizo de la grada superior.
      const m = roof.rainMargin;
      s.covered = s.underOverhang ||
        !insideRoundedRect(s.eye[0], s.eye[2], roof.hx + m, roof.hz + m, roof.r);
    });
  }
}
