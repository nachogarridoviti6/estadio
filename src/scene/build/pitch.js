import * as THREE from 'three';

// Capa de baja frecuencia: franjas de segado, desgaste en áreas y líneas.
function makePitchLayer(pitch, area) {
  const W = 4096, H = Math.round((W * area.w) / area.l);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sx = W / area.l, sz = H / area.w;
  const X = (m) => (m + area.l / 2) * sx;
  const Z = (m) => (m + area.w / 2) * sz;
  const L = pitch.length / 2, Wd = pitch.width / 2;

  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);
  // Franjas de segado (en el Bernabéu, transversales). Claro/oscuro según el sentido del corte.
  const stripes = 20;
  const stripeW = (pitch.length + 2 * 5) / stripes;
  for (let i = 0; i < stripes + 2; i++) {
    g.fillStyle = i % 2 ? '#8e8e8e' : '#727272';
    g.fillRect(X(-L - 5 + i * stripeW), 0, stripeW * sx + 1, H);
  }
  // Desgaste: zonas de portería y centro algo más apagadas
  const wear = (x, z, rx, rz, a) => {
    const grd = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rx * sx);
    grd.addColorStop(0, `rgba(90,80,60,${a})`);
    grd.addColorStop(1, 'rgba(90,80,60,0)');
    g.save(); g.scale(1, rz / rx); g.fillStyle = grd;
    g.beginPath(); g.arc(X(x), Z(z) * (rx / rz), rx * sx, 0, Math.PI * 2); g.fill(); g.restore();
  };
  wear(-L + 3, 0, 6, 4, 0.35); wear(L - 3, 0, 6, 4, 0.35); wear(0, 0, 12, 8, 0.12);

  g.strokeStyle = 'rgba(255,255,255,0.97)';
  g.fillStyle = 'rgba(255,255,255,0.97)';
  g.lineWidth = 0.12 * sx;
  const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
  rect(-L, -Wd, L, Wd);
  g.beginPath(); g.moveTo(X(0), Z(-Wd)); g.lineTo(X(0), Z(Wd)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 9.15 * sx, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 0.2 * sx, 0, Math.PI * 2); g.fill();
  for (const s of [-1, 1]) {
    const gx = s * L;
    rect(Math.min(gx, gx - s * 16.5), -20.16, Math.max(gx, gx - s * 16.5), 20.16);
    rect(Math.min(gx, gx - s * 5.5), -9.16, Math.max(gx, gx - s * 5.5), 9.16);
    g.beginPath(); g.arc(X(gx - s * 11), Z(0), 0.2 * sx, 0, Math.PI * 2); g.fill();
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    if (s > 0) g.arc(X(gx - 11), Z(0), 9.15 * sx, Math.PI - a, Math.PI + a);
    else g.arc(X(gx + 11), Z(0), 9.15 * sx, -a, a);
    g.stroke();
    for (const cz of [-1, 1]) { // córners
      g.beginPath();
      g.arc(X(gx), Z(cz * Wd), 1 * sx, s > 0 ? (cz > 0 ? Math.PI : Math.PI / 2) : (cz > 0 ? -Math.PI / 2 : 0),
        s > 0 ? (cz > 0 ? Math.PI * 1.5 : Math.PI) : (cz > 0 ? 0 : Math.PI / 2));
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; // datos, no color: se leen tal cual en el shader
  tex.anisotropy = 16;
  return tex;
}

export function buildPitch(cfg, scene, grassTex) {
  const area = { l: cfg.pitch.length + 2 * cfg.bowl.endGap + 6, w: cfg.pitch.width + 2 * cfg.bowl.sideGap + 6 };
  const layer = makePitchLayer(cfg.pitch, area);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.anisotropy = 16;

  // Material PBR con dos escalas: la textura real de hierba (alta frecuencia)
  // multiplicada por la capa de franjas y líneas (baja frecuencia).
  const mat = new THREE.MeshStandardMaterial({ map: layer, roughness: 0.88, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.grassMap = { value: grassTex };
    shader.uniforms.grassTint = { value: new THREE.Color('#3f8a2e') };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D grassMap; uniform vec3 grassTint;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        vec4 layer = texture2D(map, vMapUv);
        vec3 g1 = texture2D(grassMap, vMapUv * vec2(${(area.l / 3).toFixed(1)}, ${(area.w / 3).toFixed(1)})).rgb;
        vec3 g2 = texture2D(grassMap, vMapUv * vec2(${(area.l / 11).toFixed(1)}, ${(area.w / 11).toFixed(1)}) + 0.37).rgb;
        float lum = dot(mix(g1, g2, 0.4), vec3(0.299, 0.587, 0.114));
        float n = vnoise(vMapUv * vec2(60.0, 40.0)) * 0.5 + vnoise(vMapUv * vec2(240.0, 160.0)) * 0.5;
        vec3 grass = grassTint * (0.55 + lum * 0.9) * (0.9 + n * 0.2);
        float stripe = layer.g / 0.5;               // 0.9 - 1.1 franjas
        float isLine = smoothstep(0.75, 0.95, min(layer.r, layer.b));
        vec3 col = grass * stripe;
        col = mix(col, vec3(0.92), isLine);
        diffuseColor.rgb = col;
      `);
  };
  const geo = new THREE.PlaneGeometry(area.l, area.w);
  geo.rotateX(-Math.PI / 2);
  const grass = new THREE.Mesh(geo, mat);
  grass.receiveShadow = true;
  scene.add(grass);

  // Porterías con red
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.1 });
  const netMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 1, alphaMap: makeNetTexture(), alphaTest: 0.05 });
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.06, 0.06, 2.44, 12);
    for (const z of [-3.66, 3.66]) {
      const m = new THREE.Mesh(post, white); m.position.set(0, 1.22, z); m.castShadow = true; g.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.44, 12), white);
    bar.rotation.x = Math.PI / 2; bar.position.y = 2.44; bar.castShadow = true; g.add(bar);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.44), netMat);
    back.position.set(s * 2, 1.22, 0); back.rotation.y = Math.PI / 2; g.add(back);
    const roofNet = new THREE.Mesh(new THREE.PlaneGeometry(2, 7.32), netMat);
    roofNet.rotation.x = -Math.PI / 2; roofNet.position.set(s * 1, 2.44, 0); g.add(roofNet);
    for (const z of [-3.66, 3.66]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.44), netMat);
      side.position.set(s * 1, 1.22, z); g.add(side);
    }
    g.position.x = s * cfg.pitch.length / 2;
    scene.add(g);
  }
  // Banderines de córner
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), white);
    pole.position.set(sx * cfg.pitch.length / 2, 0.75, sz * cfg.pitch.width / 2);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ color: '#f2d21b', side: THREE.DoubleSide }));
    flag.position.set(0.2, 0.6, 0); pole.add(flag);
    scene.add(pole);
  }
  return grass;
}

function makeNetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 10);
  return t;
}
