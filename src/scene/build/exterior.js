import * as THREE from 'three';
import { BowlContour } from '../../venue/bowl.js';

// Envolvente exterior del Bernabéu: una "piel" continua de lamas de acero que
// sube por la fachada, se curva en el hombro y cubre la cubierta hasta el óculo.

// Punto del contorno por tramo (los dos contornos tienen la misma estructura
// de 9 tramos, así las esquinas de fuera y de dentro quedan alineadas).
function pieceAt(c, i, f) {
  let s = 0;
  for (let k = 0; k < i; k++) s += c.pieces[k][1];
  return c.at(s + f * c.pieces[i][1], 0);
}

// Perfil de la piel: [k (0 fuera → 1 óculo), desplazamiento hacia fuera, altura]
const PROFILE = [
  [0, 0, -1], [0, 0.6, 6], [0, 1.6, 18], [0, 2.3, 30], [0, 1.9, 42], [0, 0.4, 51],
  [0.012, -1.6, 57.5], [0.045, -2.2, 62.5], [0.11, -1.2, 66.4], [0.25, 0, 68.6],
  [0.5, 0, 69.6], [0.78, 0, 69.3], [0.95, 0, 68.7], [1, 0, 68.3],
];

function lamellaTextures() {
  // Mapa de normales: lamas verticales de 1 m con un pequeño hueco entre ellas
  const W = 256, H = 4;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const t = x / W;                      // posición dentro de la lama
    const slope = Math.sin(t * Math.PI * 2) * 0.55 * (t < 0.88 ? 1 : 0);
    const nx = Math.round((slope * 0.5 + 0.5) * 255);
    for (let y = 0; y < H; y++) img.data.set([nx, 128, 255, 255], (y * W + x) * 4);
  }
  g.putImageData(img, 0, 0);
  const normal = new THREE.CanvasTexture(c);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.colorSpace = THREE.NoColorSpace;

  // Luz de noche: LED en el hueco entre lamas (más intensa en algunas)
  const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 4;
  const g2 = c2.getContext('2d');
  g2.fillStyle = '#000'; g2.fillRect(0, 0, 64, 4);
  g2.fillStyle = '#9fc4ff'; g2.fillRect(57, 0, 4, 4);
  const emissive = new THREE.CanvasTexture(c2);
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { normal, emissive };
}

export function buildShell(cfg, scene, clipPlane) {
  const rc = cfg.roof;
  const outer = new BowlContour(rc.outerHx, rc.outerHz, rc.outerR);
  const inner = new BowlContour(rc.hx, rc.hz, rc.r);
  const curve = new THREE.CatmullRomCurve3(PROFILE.map(([k, o, y]) => new THREE.Vector3(k, o, y)), false, 'centripetal');
  const prof = curve.getPoints(70);

  // Muestras a lo largo del perímetro
  const cols = [];
  outer.pieces.forEach(([type], i) => {
    const n = type === 'line' ? 40 : 18;
    for (let j = 0; j < n; j++) cols.push([i, j / n]);
  });
  cols.push([0, 0]); // cierra el anillo

  const pos = [], uv = [], idx = [];
  let perim = 0, prevP = null;
  const vLen = [0];
  for (let r = 1; r < prof.length; r++) {
    const a = prof[r - 1], b = prof[r];
    vLen.push(vLen[r - 1] + Math.hypot((b.x - a.x) * 60, b.y - a.y, b.z - a.z));
  }
  cols.forEach(([i, f], ci) => {
    const po = pieceAt(outer, i, f), pi = pieceAt(inner, i, f);
    if (prevP) perim += Math.hypot(po.x - prevP.x, po.z - prevP.z);
    prevP = po;
    prof.forEach((p, r) => {
      const x = po.x + (pi.x - po.x) * p.x + po.nx * p.y;
      const z = po.z + (pi.z - po.z) * p.x + po.nz * p.y;
      pos.push(x, p.z, z);
      uv.push(perim, vLen[r]);
    });
    if (ci > 0) {
      const R = prof.length;
      for (let r = 0; r < R - 1; r++) {
        const a = (ci - 1) * R + r, b = ci * R + r;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const { normal, emissive } = lamellaTextures();
  normal.repeat.set(1 / 1.1, 1);    // lamas de 1,1 m
  emissive.repeat.set(1 / 1.1, 1);
  normal.anisotropy = emissive.anisotropy = 16;
  const mat = new THREE.MeshStandardMaterial({
    color: '#a3aab4', metalness: 0.85, roughness: 0.38,
    normalMap: normal, normalScale: new THREE.Vector2(0.7, 0.7),
    emissive: '#ffffff', emissiveMap: emissive, emissiveIntensity: 0,
    side: THREE.DoubleSide, clippingPlanes: [clipPlane], clipShadows: true,
  });
  const shell = new THREE.Mesh(geo, mat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  scene.add(shell);

  // Cornisa del atrio de la entrada principal (lateral de la Castellana): 21 m de vuelo
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-70, 0); canopyShape.lineTo(70, 0);
  canopyShape.quadraticCurveTo(66, 21, 40, 21); canopyShape.lineTo(-40, 21);
  canopyShape.quadraticCurveTo(-66, 21, -70, 0);
  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, { depth: 1.2, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 3, curveSegments: 16 });
  canopyGeo.rotateX(Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({
    color: '#aeb4bd', metalness: 0.8, roughness: 0.4, normalMap: normal, normalScale: new THREE.Vector2(0.5, 0.5),
    emissive: '#fff1d6', emissiveIntensity: 0,
    clippingPlanes: [clipPlane],
  }));
  canopy.position.set(0, 14, rc.outerHz + 1.5);
  canopy.castShadow = true;
  scene.add(canopy);

  return {
    shell, canopy,
    setNight(n) {
      mat.emissiveIntensity = 0.55 * n;
      canopy.material.emissiveIntensity = 0.35 * n;
    },
  };
}
