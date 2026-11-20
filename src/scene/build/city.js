import * as THREE from 'three';

// Entorno del estadio: plaza, jardines, la Castellana y las calles que lo
// rodean (Concha Espina al sur, Padre Damián al este, Rafael Salgado al norte),
// manzanas de edificios con ventanas, farolas, árboles y tráfico.
// Ejes: +x norte, +z oeste.

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Calles: [x0, x1, z0, z1] (rectángulos de asfalto)
const PLAZA = { x0: -158, x1: 152, z0: -150, z1: 152 };
const STREETS = [
  { name: 'Paseo de la Castellana', x0: -700, x1: 700, z0: 160, z1: 222, lanes: [166, 172, 178, 204, 210, 216], dir: [1, 1, 1, -1, -1, -1] },
  { name: 'Av. de Concha Espina', x0: -190, x1: -162, z0: -700, z1: 700, lanes: [-170, -182], dir: [1, -1], alongZ: true },
  { name: 'Calle del Padre Damián', x0: -700, x1: 700, z0: -178, z1: -156, lanes: [-162, -172], dir: [1, -1] },
  { name: 'Calle de Rafael Salgado', x0: 156, x1: 176, z0: -700, z1: 160, lanes: [161, 171], dir: [1, -1], alongZ: true },
];

function windowMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: '#b9b0a2', roughness: 0.85, metalness: 0.05 });
  mat.userData.uNight = { value: 1 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = mat.userData.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vW = (modelMatrix * wp).xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vW; varying vec3 vN; uniform float uNight;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Rejilla de ventanas en fachadas (no en cubiertas)
        float wall = 1.0 - step(0.6, abs(vN.y));
        vec2 g = vec2(abs(vN.x) > 0.5 ? vW.z : vW.x, vW.y);
        vec2 cell = floor(g / vec2(3.2, 3.3));
        vec2 f = fract(g / vec2(3.2, 3.3));
        float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.85) * step(3.0, vW.y);
        float lit = step(0.45, h21(cell + floor(vW.xz / 40.0)));
        vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.85, 1.0), h21(cell * 1.7));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35 + vec3(0.05, 0.07, 0.1), win * wall);
        totalEmissiveRadiance += warm * win * wall * lit * uNight * 1.6;`);
  };
  mat.customProgramCacheKey = () => 'windows';
  return mat;
}

export function buildCity(scene) {
  const rand = mulberry(42);
  const group = new THREE.Group();

  // Suelo: asfalto general
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.95 }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = -1.6;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // Plaza perimetral del estadio (pavimento claro)
  const plazaTex = paving();
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(PLAZA.x1 - PLAZA.x0, PLAZA.z1 - PLAZA.z0),
    new THREE.MeshStandardMaterial({ color: '#c9c3b8', map: plazaTex, roughness: 0.8 }));
  plazaTex.repeat.set((PLAZA.x1 - PLAZA.x0) / 6, (PLAZA.z1 - PLAZA.z0) / 6);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set((PLAZA.x0 + PLAZA.x1) / 2, -1.5, (PLAZA.z0 + PLAZA.z1) / 2);
  plaza.receiveShadow = true;
  group.add(plaza);

  // Jardines: nueva plaza junto a la Castellana y jardín del este (antigua Esquina del Bernabéu)
  const grassMat = new THREE.MeshStandardMaterial({ color: '#3f6b35', roughness: 1 });
  for (const [x, z, w, d] of [[0, 140, 190, 22], [-120, -125, 60, 45]]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), grassMat);
    g.rotation.x = -Math.PI / 2; g.position.set(x, -1.45, z); g.receiveShadow = true;
    group.add(g);
  }

  // Marcas viales
  const lineMat = new THREE.MeshBasicMaterial({ color: '#d8d8d0' });
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.18), lineMat, 2000);
  let nd = 0;
  const m = new THREE.Matrix4();
  for (const st of STREETS) {
    const mids = [];
    for (let i = 0; i < st.lanes.length - 1; i++) mids.push((st.lanes[i] + st.lanes[i + 1]) / 2);
    for (const c of mids) {
      for (let t = -700; t < 700 && nd < 2000; t += 9) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, st.alongZ ? Math.PI / 2 : 0));
        m.compose(st.alongZ ? new THREE.Vector3(c, -1.55, t) : new THREE.Vector3(t, -1.55, c), q, new THREE.Vector3(1, 1, 1));
        if (!insidePlaza(st.alongZ ? c : t, st.alongZ ? t : c)) dashes.setMatrixAt(nd++, m);
      }
    }
  }
  dashes.count = nd;
  group.add(dashes);

  // Edificios: manzanas en una cuadrícula, sin invadir calles ni plaza
  const blocks = [];
  for (let x = -640; x <= 640; x += 70) {
    for (let z = -640; z <= 640; z += 70) {
      const bx = x + (rand() - 0.5) * 6, bz = z + (rand() - 0.5) * 6;
      if (bx > PLAZA.x0 - 40 && bx < PLAZA.x1 + 40 && bz > PLAZA.z0 - 40 && bz < PLAZA.z1 + 75) continue;
      if (STREETS.some((s) => bx + 30 > s.x0 && bx - 30 < s.x1 && bz + 30 > s.z0 && bz - 30 < s.z1)) continue;
      const dist = Math.hypot(bx, bz);
      // Manzana de varios edificios
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const w = 18 + rand() * 18, d = 16 + rand() * 18;
        const h = (dist < 320 ? 22 : 16) + rand() * (dist < 400 ? 22 : 30) + (rand() < 0.05 ? 50 : 0);
        blocks.push([bx + (rand() - 0.5) * 24, bz + (rand() - 0.5) * 24, w, d, h]);
      }
    }
  }
  // Torres singulares junto a la Castellana (como el skyline de la zona)
  blocks.push([210, 250, 26, 26, 110], [-260, 260, 30, 30, 95], [330, 245, 24, 24, 80]);
  const bMat = windowMaterial();
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const buildings = new THREE.InstancedMesh(bGeo, bMat, blocks.length);
  const tints = ['#c7b9a4', '#b5a891', '#d4cbbd', '#a89c8a', '#bfb3a1', '#9ea3a8', '#d9d2c6'].map((c) => new THREE.Color(c));
  blocks.forEach(([x, z, w, d, h], i) => {
    m.compose(new THREE.Vector3(x, -1.6, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    buildings.setMatrixAt(i, m);
    buildings.setColorAt(i, tints[Math.floor(rand() * tints.length)]);
  });
  buildings.receiveShadow = true;
  group.add(buildings);

  // Farolas en las aceras
  const poles = [], heads = [];
  for (const st of STREETS) {
    const edges = [st.alongZ ? st.x0 - 2 : st.z0 - 2, st.alongZ ? st.x1 + 2 : st.z1 + 2];
    for (const e of edges) {
      for (let t = -640; t < 640; t += 32) {
        const x = st.alongZ ? e : t, z = st.alongZ ? t : e;
        if (insidePlaza(x, z, 4)) continue;
        poles.push([x, z]);
      }
    }
  }
  // Farolas de la plaza
  for (let t = PLAZA.x0 + 10; t < PLAZA.x1; t += 30) { poles.push([t, PLAZA.z0 + 3], [t, PLAZA.z1 - 3]); }
  for (let t = PLAZA.z0 + 10; t < PLAZA.z1; t += 30) { poles.push([PLAZA.x0 + 3, t], [PLAZA.x1 - 3, t]); }
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 6),
    new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.6, roughness: 0.5 }), poles.length);
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(4) });
  const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 10, 8), headMat, poles.length);
  poles.forEach(([x, z], i) => {
    m.makeTranslation(x, 3, z); poleMesh.setMatrixAt(i, m);
    m.makeTranslation(x, 7.6, z); headMesh.setMatrixAt(i, m);
  });
  group.add(poleMesh, headMesh);

  // Árboles: bulevares de la Castellana y jardines
  const trees = [];
  for (let x = -640; x < 640; x += 11) { trees.push([x, 191], [x, 162], [x, 220]); }
  for (let i = 0; i < 60; i++) trees.push([-80 + rand() * 170, 132 + rand() * 18]);
  for (let i = 0; i < 40; i++) trees.push([-145 + rand() * 50, -145 + rand() * 40]);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 4, 6),
    new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 1 }), trees.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.8, 1),
    new THREE.MeshStandardMaterial({ color: '#3d5e2f', roughness: 0.95, flatShading: true }), trees.length);
  trees.forEach(([x, z], i) => {
    const s = 0.8 + rand() * 0.6;
    m.compose(new THREE.Vector3(x, 0.4, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, 4.2 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 3, 0)),
      new THREE.Vector3(s, s * 1.15, s)); crown.setMatrixAt(i, m);
    crown.setColorAt(i, new THREE.Color('#3d5e2f').offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.08));
  });
  trunk.castShadow = crown.castShadow = true;
  group.add(trunk, crown);

  // Tráfico: coches con faros (blancos de frente, rojos detrás)
  const cars = [];
  for (const st of STREETS) {
    st.lanes.forEach((lane, li) => {
      for (let k = 0; k < 14; k++) cars.push({ st, lane, dir: st.dir[li], t: -640 + rand() * 1280, v: 11 + rand() * 6 });
    });
  }
  const carGeo = new THREE.BoxGeometry(4.3, 1.4, 1.8); carGeo.translate(0, 0.7, 0);
  const carMesh = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.6 }), cars.length);
  const carCols = ['#1d1f24', '#d9dbe0', '#5a6270', '#8a1c1c', '#2b3f66', '#c0c3c8'].map((c) => new THREE.Color(c));
  cars.forEach((c, i) => carMesh.setColorAt(i, carCols[i % carCols.length]));
  const lightGeo = new THREE.BoxGeometry(0.15, 0.3, 1.5);
  const front = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d8').multiplyScalar(5) }), cars.length);
  const back = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(4) }), cars.length);
  group.add(carMesh, front, back);

  scene.add(group);

  const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  return {
    group,
    update(dt, night) {
      cars.forEach((c, i) => {
        c.t += c.v * c.dir * dt;
        if (c.t > 650) c.t = -650; if (c.t < -650) c.t = 650;
        const along = c.st.alongZ;
        const x = along ? c.lane : c.t, z = along ? c.t : c.lane;
        const yaw = along ? (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
        q.setFromEuler(new THREE.Euler(0, yaw, 0));
        tmp.compose(new THREE.Vector3(x, -1.55, z), q, one); carMesh.setMatrixAt(i, tmp);
        const fx = Math.cos(yaw) * 2.2, fz = -Math.sin(yaw) * 2.2;
        tmp.compose(new THREE.Vector3(x + fx, -0.9, z + fz), q, one); front.setMatrixAt(i, tmp);
        tmp.compose(new THREE.Vector3(x - fx, -0.9, z - fz), q, one); back.setMatrixAt(i, tmp);
      });
      carMesh.instanceMatrix.needsUpdate = front.instanceMatrix.needsUpdate = back.instanceMatrix.needsUpdate = true;
      front.visible = back.visible = night > 0.3;
    },
    setNight(n) {
      bMat.userData.uNight.value = n;
      headMat.color.set('#ffd9a0').multiplyScalar(n > 0.3 ? 4 : 0.6);
    },
  };
}

function insidePlaza(x, z, pad = 0) {
  return x > PLAZA.x0 - pad && x < PLAZA.x1 + pad && z > PLAZA.z0 - pad && z < PLAZA.z1 + pad;
}

function paving() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d6d0c5'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.strokeStyle = 'rgba(80,70,60,0.35)'; g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128); g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
