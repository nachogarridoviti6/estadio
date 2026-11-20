// Puntuación objetiva de la vista de cada asiento.
//
// Muestreamos una rejilla de puntos del campo y, para cada uno, medimos lo
// "grande y legible" que se ve desde los ojos del espectador:
//   tamaño aparente ~ 1/d   (más cerca = más grande)
//   escorzo         ~ sin(elevación)^0.3 (desde muy abajo el campo se aplana)
//   obstrucción     ~ el peto de la grada y las cabezas de la fila de delante
// La media sobre todo el campo premia ver bien TODO el partido, no solo una
// portería. Además se penaliza la orientación de fondo frente a la lateral.

const GX = 11, GZ = 7;

export function rawViewQuality(eye, pitch, normal = null, blockers = [], out = null) {
  let acc = 0, hidden = 0;
  for (let i = 0; i < GX; i++) {
    const px = -pitch.length / 2 + (pitch.length * i) / (GX - 1);
    for (let j = 0; j < GZ; j++) {
      const pz = -pitch.width / 2 + (pitch.width * j) / (GZ - 1);
      const dx = px - eye[0], dz = pz - eye[2], dy = eye[1];
      const d = Math.hypot(dx, dy, dz);
      const sinElev = dy / d;
      let vis = 1;
      if (normal) {
        // ¿El rayo hasta este punto del campo pasa por debajo de un peto o de una cabeza?
        const hd = Math.hypot(dx, dz);
        const cos = -(dx * normal[0] + dz * normal[2]) / hd;
        if (cos > 0.05) {
          for (const b of blockers) {
            const dist = b.du / cos;
            const lineH = eye[1] - eye[1] * (dist / hd);
            if (lineH < b.top) { vis -= b.weight; if (b.weight >= 1) hidden++; }
          }
        }
      }
      acc += (Math.max(0, vis) * Math.pow(sinElev, 0.3)) / d;
    }
  }
  // Orientación: el fútbol se entiende mejor de lado que desde la portería
  // (desde el fondo la profundidad del campo se aplana).
  if (out) out.hiddenFrac = hidden / (GX * GZ);
  const horiz = Math.hypot(eye[0], eye[2]) || 1;
  const side = Math.abs(eye[2]) / horiz; // 1 = lateral puro, 0 = fondo puro
  return (acc / (GX * GZ)) * (0.72 + 0.28 * side);
}

export function scoreSeats(seats, cfg) {
  const raw = seats.map((s) => {
    const info = {};
    let q = rawViewQuality(s.eye, cfg.pitch, s.normal, s.blockers, info);
    s.hiddenFrac = info.hiddenFrac; // parte del campo que tapa el peto
    if (s.underOverhang) q *= 0.96; // techo bajo: se pierden balones altos y algo de ambiente
    return q;
  });

  // Rating 0-10 normalizado sobre el propio estadio.
  const sorted = [...raw].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.01)];
  const hi = sorted[Math.floor(sorted.length * 0.995)];
  seats.forEach((s, i) => {
    const t = Math.min(1, Math.max(0, (raw[i] - lo) / (hi - lo)));
    s.viewRaw = raw[i];
    s.rating = Math.round((3 + 7 * t) * 10) / 10; // 3.0 – 10.0
  });

  // Percentil: "mejor vista que el X% del estadio".
  const order = raw.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  order.forEach(([, i], rank) => {
    seats[i].percentile = Math.round((rank / (order.length - 1)) * 100);
  });

  for (const s of seats) {
    const horiz = Math.hypot(s.eye[0], s.eye[2]);
    s.elevAngle = (Math.atan2(s.eye[1], horiz) * 180) / Math.PI;
  }
}
