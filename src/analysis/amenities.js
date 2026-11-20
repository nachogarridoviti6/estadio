// Atributos "de experiencia" de cada asiento, más allá de la vista:
//   - covered: protegido de la lluvia (fuera del óculo de la cubierta o bajo
//     el nivel superior)
//   - accessDist: metros andando hasta el vomitorio más cercano
//   - barDist: metros hasta el bar/aseos más cercano
//   - zone: zona especial (animación, visitante, familiar, VIP...)

function insideRoundedRect(x, z, hx, hz, r) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > hx || az > hz) return false;
  const dx = Math.max(ax - (hx - r), 0), dz = Math.max(az - (hz - r), 0);
  return Math.hypot(dx, dz) <= r;
}

export function computeAmenities(venue) {
  const { cfg, sectors, seats } = venue;
  const roof = cfg.roof;
  const m = roof.rainMargin;

  for (const sec of sectors) {
    const accessRow = cfg.access[sec.tier];
    sec.accessRow = accessRow;
    for (const i of sec.seatIdx) {
      const s = seats[i];
      // Andar por la fila hasta el pasillo + subir/bajar escalones hasta el vomitorio
      const lateral = Math.min(s.sAct, s.rowLen - s.sAct) + cfg.aisle / 2;
      s.accessDist = Math.round(lateral + Math.abs(s.row - accessRow) * sec.rowDepth * 1.8 + 3);
      // Bares en el anillo interior, cada barSpacing metros
      const ringPos = (sec.index * 37 + (s.sAct < s.rowLen / 2 ? 0 : s.rowLen)) % cfg.barSpacing;
      s.barDist = Math.round(s.accessDist + 8 + Math.min(ringPos, cfg.barSpacing - ringPos));
      s.zone = sec.zone?.id || null;
      s.covered = s.underOverhang ||
        !insideRoundedRect(s.eye[0], s.eye[2], roof.hx + m, roof.hz + m, roof.r);
    }
  }
}
