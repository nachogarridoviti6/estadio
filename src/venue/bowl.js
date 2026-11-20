// Geometría de un graderío continuo ("bowl") con planta de rectángulo
// redondeado. Todas las filas son curvas paralelas (offset) a un contorno base,
// así las esquinas también tienen asientos, como en el Bernabéu.
//
// El contorno se recorre con un parámetro s (metros sobre el contorno base),
// empezando en el centro del lateral z+ y avanzando hacia +x.

export class BowlContour {
  constructor(hx, hz, r) {
    this.hx = hx; this.hz = hz; this.r = r;
    const a = hx - r, b = hz - r;
    this.a = a; this.b = b;
    const q = (Math.PI * r) / 2;
    // Tramos: [tipo, longitud, datos]
    this.pieces = [
      ['line', a, { p0: [0, hz], d: [1, 0], n: [0, 1] }],
      ['arc', q, { c: [a, b], t0: Math.PI / 2, dir: -1 }],
      ['line', 2 * b, { p0: [hx, b], d: [0, -1], n: [1, 0] }],
      ['arc', q, { c: [a, -b], t0: 0, dir: -1 }],
      ['line', 2 * a, { p0: [a, -hz], d: [-1, 0], n: [0, -1] }],
      ['arc', q, { c: [-a, -b], t0: -Math.PI / 2, dir: -1 }],
      ['line', 2 * b, { p0: [-hx, -b], d: [0, 1], n: [-1, 0] }],
      ['arc', q, { c: [-a, b], t0: -Math.PI, dir: -1 }],
      ['line', a, { p0: [-a, hz], d: [1, 0], n: [0, 1] }],
    ];
    this.length = this.pieces.reduce((acc, p) => acc + p[1], 0);
  }

  // Punto del contorno desplazado `u` metros hacia fuera: {x, z, nx, nz, corner}
  at(s, u = 0) {
    s = ((s % this.length) + this.length) % this.length;
    for (const [type, len, d] of this.pieces) {
      if (s > len) { s -= len; continue; }
      if (type === 'line') {
        return {
          x: d.p0[0] + d.d[0] * s + d.n[0] * u,
          z: d.p0[1] + d.d[1] * s + d.n[1] * u,
          nx: d.n[0], nz: d.n[1], corner: false,
        };
      }
      const t = d.t0 + d.dir * (s / this.r);
      const nx = Math.cos(t), nz = Math.sin(t);
      return { x: d.c[0] + nx * (this.r + u), z: d.c[1] + nz * (this.r + u), nx, nz, corner: true };
    }
    return this.at(0, u);
  }

  // Inversa: de un punto (x, z) a {s, u} (para saber qué asiento has tocado)
  project(x, z) {
    const { a, b, r, hx, hz } = this;
    const ax = Math.abs(x), az = Math.abs(z);
    let s, u;
    if (ax <= a) { // lateral z
      u = az - hz;
      s = z >= 0 ? (x >= 0 ? x : this.length + x) : a + this.q() + 2 * b + this.q() + (a - x);
    } else if (az <= b) { // fondo x
      u = ax - hx;
      s = x >= 0 ? a + this.q() + (b - z) : a + this.q() + 2 * b + this.q() + 2 * a + this.q() + (z + b);
    } else { // esquina
      const cx = Math.sign(x) * a, cz = Math.sign(z) * b;
      const t = Math.atan2(z - cz, x - cx);
      u = Math.hypot(x - cx, z - cz) - r;
      const q = this.q();
      if (x > 0 && z > 0) s = a + (Math.PI / 2 - t) * r;
      else if (x > 0 && z < 0) s = a + q + 2 * b + (0 - t) * r;
      else if (x < 0 && z < 0) s = a + 2 * q + 2 * b + 2 * a + (-Math.PI / 2 - t) * r;
      else s = a + 3 * q + 4 * b + 2 * a + (Math.PI - t) * r;
    }
    return { s: ((s % this.length) + this.length) % this.length, u };
  }

  q() { return (Math.PI * this.r) / 2; }

  // Longitud real recorrida entre s0 y s1 a distancia u (las esquinas se alargan)
  realLength(s0, s1, u) {
    let len = 0;
    const step = 0.25;
    for (let s = s0; s < s1; s += step) {
      const ds = Math.min(step, s1 - s);
      const p = this.at(s + ds / 2, 0);
      len += ds * (p.corner ? (this.r + u) / this.r : 1);
    }
    return len;
  }

  // Coloca asientos con separación `spacing` a lo largo de [s0, s1] a distancia u.
  // Devuelve una lista de s (contorno base) para cada asiento.
  distribute(s0, s1, u, spacing) {
    const out = [];
    const step = 0.05;
    let acc = spacing / 2, next = spacing / 2;
    const total = this.realLength(s0, s1, u);
    const count = Math.floor(total / spacing);
    const pad = (total - count * spacing) / 2;
    next = pad + spacing / 2;
    acc = 0;
    for (let s = s0; s < s1 && out.length < count; s += step) {
      const p = this.at(s + step / 2, 0);
      const k = p.corner ? (this.r + u) / this.r : 1;
      const nextAcc = acc + step * k;
      while (nextAcc >= next && out.length < count) {
        out.push(s + ((next - acc) / (step * k)) * step);
        next += spacing;
      }
      acc = nextAcc;
    }
    return out;
  }
}
