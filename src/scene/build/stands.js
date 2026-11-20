import * as THREE from 'three';
import { parapetTop } from '../../venue/generateVenue.js';

// Perfil (u, h) de un nivel de grada: peto delantero, escalones, muro trasero
// y la parte inferior inclinada (el "techo" del vomitorio / pasillo de abajo).
export function tierProfile(t, cfg) {
  const d = t.rowDepth;
  const hLast = t.h0 + (t.rows - 1) * t.rise;
  const uBack = t.u0 + t.rows * d;
  const base = t.h0 < 3 ? 0 : t.h0 - 2.8;
  const baseBack = t.h0 < 3 ? 0 : hLast - 2.2;
  const p = [];
  const top = parapetTop(cfg, t);
  p.push([t.u0 - 0.3, base]);
  p.push([t.u0 - 0.3, top]);
  p.push([t.u0, top]);
  p.push([t.u0, t.h0]);
  for (let r = 0; r < t.rows; r++) {
    const h = t.h0 + r * t.rise;
    p.push([t.u0 + (r + 1) * d, h]);
    if (r < t.rows - 1) p.push([t.u0 + (r + 1) * d, h + t.rise]);
  }
  p.push([uBack, hLast + 1.6]);
  p.push([uBack + 0.5, hLast + 1.6]);
  p.push([uBack + 0.5, baseBack]);
  return p;
}

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

// Barre un perfil cerrado a lo largo del contorno entre s0 y s1.
export function sweepProfile(contour, s0, s1, profile, { stepLine = 2, stepCorner = 0.7 } = {}) {
  const samples = [];
  for (let s = s0; s < s1; ) {
    samples.push(s);
    s += contour.at(s).corner ? stepCorner : stepLine;
  }
  samples.push(s1);
  const pts = samples.map((s) => contour.at(s, 0));
  const ccw = signedArea(profile) > 0;

  const pos = [], nor = [], uv = [], idx = [];
  let vAcc = 0;
  const P = (k, u, h) => {
    const s = samples[k];
    const c = contour.at(s, u);
    return [c.x, h, c.z];
  };
  for (let e = 0; e < profile.length; e++) {
    const [u0, h0] = profile[e];
    const [u1, h1] = profile[(e + 1) % profile.length];
    const du = u1 - u0, dh = h1 - h0;
    const len = Math.hypot(du, dh);
    if (len < 1e-4) continue;
    const n2 = ccw ? [dh / len, -du / len] : [-dh / len, du / len];
    const base = pos.length / 3;
    samples.forEach((s, k) => {
      const c = pts[k];
      const nx = c.nx * n2[0], ny = n2[1], nz = c.nz * n2[0];
      for (const [u, h, v] of [[u0, h0, vAcc], [u1, h1, vAcc + len]]) {
        pos.push(...P(k, u, h));
        nor.push(nx, ny, nz);
        uv.push(s * 0.5, v * 0.5);
      }
    });
    for (let k = 0; k < samples.length - 1; k++) {
      const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
      // Orientación según la normal deseada
      const A = new THREE.Vector3().fromArray(pos, a * 3);
      const B = new THREE.Vector3().fromArray(pos, c * 3);
      const D = new THREE.Vector3().fromArray(pos, b * 3);
      const n = new THREE.Vector3().fromArray(nor, a * 3);
      const tri = B.sub(A).cross(D.sub(A));
      if (tri.dot(n) >= 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
    vAcc += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Textura de hormigón procedural (ruido suave + manchas)
export function makeConcreteTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const n = 200 + (Math.random() - 0.5) * 30;
    img.data.set([n, n, n * 0.98, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.04)`;
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, 10 + Math.random() * 40, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStands(venue, scene) {
  const { contour, cfg } = venue;
  const concrete = makeConcreteTexture();
  const standMat = new THREE.MeshStandardMaterial({ color: '#a7abb3', map: concrete, roughness: 0.92 });
  const aisleMat = new THREE.MeshStandardMaterial({ color: '#8d9199', map: concrete, roughness: 0.95 });
  const meshes = [];

  cfg.tiers.forEach((tier, ti) => {
    const profile = tierProfile(tier, cfg);
    const secs = venue.sectors.filter((s) => s.tierIndex === ti).sort((a, b) => a.s0 - b.s0);
    secs.forEach((sec, i) => {
      const geo = sweepProfile(contour, sec.s0, sec.s1, profile);
      const mesh = new THREE.Mesh(geo, standMat.clone());
      mesh.userData.sector = sec;
      mesh.receiveShadow = true;
      sec.mesh = mesh;
      scene.add(mesh);
      meshes.push(mesh);
      // Pasillo hasta el siguiente sector (con vuelta completa al final)
      const next = secs[(i + 1) % secs.length];
      let a0 = sec.s1, a1 = next.s0;
      if (a1 < a0) a1 += contour.length;
      const aisle = new THREE.Mesh(sweepProfile(contour, a0, a1, profile, { stepLine: 0.5, stepCorner: 0.5 }), aisleMat);
      aisle.receiveShadow = true;
      scene.add(aisle);
    });
  });
  return meshes;
}
