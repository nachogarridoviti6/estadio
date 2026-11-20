// Sol y sombra durante el partido.
//
// 1) Posición solar (algoritmo astronómico simplificado, error < 1°) para el
//    Bernabéu (40.4531 N, 3.6883 O) a partir de la fecha y hora local de Madrid.
// 2) Para cada asiento, ¿le llega el sol? El rayo desde los ojos hacia el sol
//    tiene que salir por el óculo de la cubierta sin chocar antes con el nivel
//    de grada de encima.

export const BERNABEU = { lat: 40.4531, lon: -3.6883 };
const RAD = Math.PI / 180;

// Hora local de Madrid → UTC (CET +1, CEST +2 entre el último domingo de marzo
// y el último domingo de octubre, a la 01:00 UTC).
export function madridToUTC(y, m, d, hh, mm) {
  const lastSunday = (month) => {
    const t = new Date(Date.UTC(y, month + 1, 0));
    return t.getUTCDate() - t.getUTCDay();
  };
  const dstStart = Date.UTC(y, 2, lastSunday(2), 1);
  const dstEnd = Date.UTC(y, 9, lastSunday(9), 1);
  const guess = Date.UTC(y, m - 1, d, hh, mm) - 3600e3;
  const offset = guess >= dstStart && guess < dstEnd ? 2 : 1;
  return new Date(Date.UTC(y, m - 1, d, hh - offset, mm));
}

export function sunPosition(date, { lat, lon } = BERNABEU) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const H = ((gmst * 15 + lon) * RAD - ra);
  const phi = lat * RAD;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  let az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  az = (az + 2 * Math.PI) % (2 * Math.PI);
  return { elevation: el / RAD, azimuth: az / RAD };
}

// Ejes del modelo: +x = norte, +z = oeste, +y = arriba.
export function sunVector({ elevation, azimuth }) {
  const e = elevation * RAD, a = azimuth * RAD;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), -Math.cos(e) * Math.sin(a)];
}

function insideRoundedRect(x, z, hx, hz, r) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > hx || az > hz) return false;
  const dx = Math.max(ax - (hx - r), 0), dz = Math.max(az - (hz - r), 0);
  return Math.hypot(dx, dz) <= r;
}

export function seatInSun(venue, seat, dir) {
  if (dir[1] < 0.035) return false; // sol bajísimo o de noche
  const { cfg, contour } = venue;
  const e = seat.eye;
  // ¿Lo tapa algún nivel de grada superior?
  const ti = venue.sectorById[seat.sectorId].tierIndex;
  for (let k = ti + 1; k < cfg.tiers.length; k++) {
    const t = cfg.tiers[k];
    const under = t.h0 - 2.8;
    if (e[1] >= under) continue;
    const s = (under - e[1]) / dir[1];
    const { u } = contour.project(e[0] + dir[0] * s, e[2] + dir[2] * s);
    if (u > t.u0 - 0.3) return false;
  }
  // ¿Sale por el óculo de la cubierta?
  const r = cfg.roof;
  const s = (r.height - e[1]) / dir[1];
  return insideRoundedRect(e[0] + dir[0] * s, e[2] + dir[2] * s, r.hx, r.hz, r.r);
}

// Momentos del partido en los que se mira el sol (minutos desde el inicio)
export const MATCH_SAMPLES = [0, 25, 45, 70, 95];

export function computeSunExposure(venue, kickoffUTC) {
  const dirs = MATCH_SAMPLES.map((m) => sunVector(sunPosition(new Date(kickoffUTC.getTime() + m * 60000))));
  const anyDay = dirs.some((d) => d[1] >= 0.035);
  for (const seat of venue.seats) {
    let lit = 0;
    if (anyDay) for (const d of dirs) if (seatInSun(venue, seat, d)) lit++;
    seat.sunFrac = lit / dirs.length;
  }
  return { dirs, anyDay };
}
