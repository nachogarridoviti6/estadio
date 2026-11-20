import * as THREE from 'three';
import { BowlContour } from '../../venue/bowl.js';

// Exterior del Bernabéu, a partir de fotos reales del estadio terminado:
//  1. Zócalo oscuro acristalado (0-10 m) y torres cilíndricas en las esquinas.
//  2. Fachada: banda de lamas de acero HORIZONTALES que se abomba hacia fuera
//     y "flota" sobre el zócalo (más alta en las esquinas, dejando ver las torres).
//  3. Franja oscura retranqueada entre fachada y cubierta.
//  4. Cubierta: "tapa" de borde muy redondeado; las lamas giran por el borde y
//     forman anillos concéntricos hasta la zona central de paneles (retráctil).

const LAMELLA = 0.7; // separación entre lamas (m)

// Punto por tramo: ambos contornos tienen 9 tramos alineados (esquinas con esquinas)
function pieceAt(c, i, f) {
  let s = 0;
  for (let k = 0; k < i; k++) s += c.pieces[k][1];
  return c.at(s + f * c.pieces[i][1], 0);
}

function columns(c, lineN = 44, arcN = 24) {
  const cols = [];
  c.pieces.forEach(([type], i) => {
    const n = type === 'line' ? lineN : arcN;
    for (let j = 0; j < n; j++) cols.push([i, j / n, type === 'arc' ? Math.sin((j / n) * Math.PI) : 0]);
  });
  cols.push([0, 0, 0]);
  return cols;
}

// Superficie barrida entre el contorno exterior y el óculo según un perfil
// [k (0 fuera → 1 óculo), desplazamiento hacia fuera, altura]. yFn permite
// modificar la altura por columna (esquinas).
function loft(outer, inner, profile, { samples = 40, yFn = null, vFromY = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(profile.map(([k, o, y]) => new THREE.Vector3(k, o, y)), false, 'centripetal');
  const prof = curve.getPoints(samples);
  const cols = columns(outer);
  const pos = [], uv = [], idx = [];
  const vLen = [0];
  for (let r = 1; r < prof.length; r++) {
    const a = prof[r - 1], b = prof[r];
    vLen.push(vLen[r - 1] + Math.hypot((b.x - a.x) * 70, b.y - a.y, b.z - a.z));
  }
  let perim = 0, prev = null;
  cols.forEach(([i, f, corner], ci) => {
    const po = pieceAt(outer, i, f), pi = pieceAt(inner, i, f);
    if (prev) perim += Math.hypot(po.x - prev.x, po.z - prev.z);
    prev = po;
    prof.forEach((p, r) => {
      const y = yFn ? yFn(p.z, r / (prof.length - 1), corner) : p.z;
      pos.push(po.x + (pi.x - po.x) * p.x + po.nx * p.y, y, po.z + (pi.z - po.z) * p.x + po.nz * p.y);
      uv.push(perim, vFromY ? y : vLen[r]); // fachada: lamas a altura constante
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
  return geo;
}

// Texturas de lama: cada lama es una banda de acero ligeramente curvada con
// una ranura oscura; de noche la ranura se ilumina.
function lamellaTextures() {
  const H = 64;
  const mk = () => { const c = document.createElement('canvas'); c.width = 4; c.height = H; return c; };
  const albedo = mk(), normal = mk(), glow = mk();
  const ga = albedo.getContext('2d'), gn = normal.getContext('2d'), gg = glow.getContext('2d');
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const gap = t > 0.86;
    const shade = gap ? 38 : 175 + 60 * Math.sin(t / 0.86 * Math.PI);
    ga.fillStyle = `rgb(${shade},${shade},${shade + 4})`; ga.fillRect(0, y, 4, 1);
    // pendiente de la lama: arriba mira hacia arriba, abajo hacia abajo
    const slope = gap ? 0 : Math.cos(t / 0.86 * Math.PI) * 0.75;
    const ny = Math.round((slope * 0.5 + 0.5) * 255);
    gn.fillStyle = `rgb(128,${ny},255)`; gn.fillRect(0, y, 4, 1);
    gg.fillStyle = gap ? '#cfe0ff' : '#000'; gg.fillRect(0, y, 4, 1);
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 16;
    t.repeat.set(1, 1 / LAMELLA);
    return t;
  };
  return { map: tex(albedo, true), normalMap: tex(normal, false), emissiveMap: tex(glow, true) };
}

// Ondulación suave de las lamas (como en la fachada real)
function addWave(mat, amp = 0.35) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      float wv = ${amp.toFixed(2)} * (sin(uv.x * 0.045) + 0.5 * sin(uv.x * 0.017 + 1.3));
      #ifdef USE_MAP
        vMapUv.y += wv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv.y += wv;
      #endif
      #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv.y += wv;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'wave' + amp;
}

function panelTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d9dde3'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#8f96a0'; g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  g.lineWidth = 1.5; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1 / 8, 1 / 8);
  t.anisotropy = 16;
  return t;
}

export function buildShell(cfg, scene, clipPlane) {
  const rc = cfg.roof;
  const outer = new BowlContour(rc.outerHx, rc.outerHz, rc.outerR);
  const inner = new BowlContour(rc.hx, rc.hz, rc.r);
  const clip = { clippingPlanes: [clipPlane], clipShadows: true };
  const group = new THREE.Group();
  const tex = lamellaTextures();

  const steel = new THREE.MeshStandardMaterial({
    color: '#d3d7dd', metalness: 0.92, roughness: 0.27, envMapIntensity: 2.2,
    map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(1, 1),
    emissive: '#ffffff', emissiveMap: tex.emissiveMap, emissiveIntensity: 0,
    side: THREE.DoubleSide, ...clip,
  });
  addWave(steel);

  // --- 2. Fachada: sube desde ~9 m (más alto en las esquinas) y se abomba ---
  const FACADE = [
    [0, -3.0, 0], [0, -1.2, 0.08], [0, 0.6, 0.25], [0, 2.4, 0.5], [0, 2.9, 0.68],
    [0, 2.2, 0.85], [0, 0.6, 0.96], [0.004, -1.0, 1.0],
  ];
  const facadeGeo = loft(outer, inner, FACADE, {
    samples: 48, vFromY: true,
    // y normalizada (0-1) → altura real: de la base (9 m, 15 m en esquinas) a 51 m
    yFn: (t, _r, corner) => { const y0 = 9 + 7 * corner; return y0 + (51 - y0) * t; },
  });
  const facade = new THREE.Mesh(facadeGeo, steel);
  facade.castShadow = facade.receiveShadow = true;
  group.add(facade);

  // --- 3. Franja oscura retranqueada entre fachada y cubierta ---
  const gapMat = new THREE.MeshStandardMaterial({ color: '#15181d', roughness: 0.7, metalness: 0.3, emissive: '#ffe6bf', emissiveIntensity: 0, side: THREE.DoubleSide, ...clip });
  const gapGeo = loft(outer, inner, [[0.004, -1.0, 51], [0.01, -5.5, 51.6], [0.012, -6, 53.5], [0.01, -5, 55.6], [0.004, -2.5, 56.2]], { samples: 10 });
  const gap = new THREE.Mesh(gapGeo, gapMat);
  gap.castShadow = true;
  group.add(gap);

  // --- 4. Cubierta: borde redondeado + anillos concéntricos de lamas ---
  const LID = [
    [0.004, -2.5, 56.2], [0, 0.4, 57.6], [0, 1.4, 59.8], [0.004, 0.6, 62.2], [0.02, -1.0, 64.0],
    [0.06, 0, 65.6], [0.14, 0, 67.0], [0.3, 0, 68.3], [0.52, 0, 69.0],
  ];
  const lidGeo = loft(outer, inner, LID, { samples: 44 });
  const lidMat = steel.clone();
  addWave(lidMat, 0.15);
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.castShadow = lid.receiveShadow = true;
  group.add(lid);

  // Zona central de paneles (cubierta retráctil y lucernarios), más clara
  const panelMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', map: panelTexture(), metalness: 0.4, roughness: 0.45, side: THREE.DoubleSide, ...clip });
  const panelGeo = loft(outer, inner, [[0.52, 0, 69.0], [0.75, 0, 69.2], [0.94, 0, 68.9], [1, 0, 68.4]], { samples: 12 });
  const panels = new THREE.Mesh(panelGeo, panelMat);
  panels.castShadow = true;
  group.add(panels);

  // --- 1. Zócalo acristalado retranqueado y torres de las esquinas ---
  const baseC = new BowlContour(rc.outerHx - 6, rc.outerHz - 6, rc.outerR - 6);
  const glass = new THREE.MeshStandardMaterial({ color: '#1b222c', metalness: 0.6, roughness: 0.15, emissive: '#ffd9a6', emissiveIntensity: 0, side: THREE.DoubleSide, ...clip });
  const baseGeo = loft(baseC, inner, [[0, 0, -1.6], [0, 0, 6], [0, 0, 16]], { samples: 2 });
  const base = new THREE.Mesh(baseGeo, glass);
  group.add(base);
  // Montantes del zócalo
  const mull = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 17.6, 0.35),
    new THREE.MeshStandardMaterial({ color: '#2c3138', metalness: 0.7, roughness: 0.4, ...clip }), 260);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 260; i++) {
    const p = baseC.at((i / 260) * baseC.length, 0.2);
    m.makeTranslation(p.x, 7.2, p.z); mull.setMatrixAt(i, m);
  }
  group.add(mull);
  // Torres cilíndricas oscuras (núcleos de las esquinas)
  const towerMat = new THREE.MeshStandardMaterial({ color: '#202328', roughness: 0.55, metalness: 0.3, ...clip });
  const a = rc.outerHx - rc.outerR, b = rc.outerHz - rc.outerR;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const dir = new THREE.Vector2(sx, sz).normalize();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 22, 48), towerMat);
    t.position.set(sx * a + dir.x * (rc.outerR - 7), 9.4, sz * b + dir.y * (rc.outerR - 7));
    t.castShadow = true;
    group.add(t);
  }

  scene.add(group);
  return {
    group,
    setNight(n) {
      steel.emissiveIntensity = lidMat.emissiveIntensity = 0.5 * n;
      gapMat.emissiveIntensity = 0.25 * n;
      glass.emissiveIntensity = 0.55 * n;
    },
  };
}
