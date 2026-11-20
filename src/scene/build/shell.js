import * as THREE from 'three';
import { BowlContour } from '../../venue/bowl.js';

// Cielo nocturno: degradado + estrellas.
// Cielo: degradado de día (azul despejado de Madrid), atardecer y noche con estrellas.
export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uDay: { value: 0 }, uGolden: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; uniform float uDay; uniform float uGolden; uniform vec3 uSun;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        float t = clamp(vP.y, 0., 1.);
        // noche
        vec3 night = mix(vec3(0.10,0.12,0.20), vec3(0.01,0.015,0.04), pow(t, 0.5));
        night += vec3(0.25,0.18,0.10) * pow(1. - t, 6.) * 0.6;
        night += vec3(step(0.9985, h(floor(vP * 400.))) * t) * 0.8;
        // día
        vec3 zenith = vec3(0.16, 0.38, 0.82), horizon = vec3(0.66, 0.80, 0.95);
        vec3 day = mix(horizon, zenith, pow(t, 0.55));
        // atardecer: horizonte cálido en la dirección del sol
        float toward = max(dot(normalize(vec3(vP.x, 0., vP.z)), normalize(vec3(uSun.x, 0., uSun.z))), 0.);
        day = mix(day, vec3(1.0, 0.55, 0.28), uGolden * pow(1. - t, 3.) * (0.35 + 0.65 * toward));
        // disco y halo del sol
        float sd = max(dot(vP, normalize(uSun)), 0.);
        day += vec3(1.0, 0.9, 0.7) * (pow(sd, 900.) * 20. + pow(sd, 12.) * 0.25);
        vec3 col = mix(night, day * 1.7, uDay);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}

function ringShape(outer, inner) {
  const s = new THREE.Shape();
  roundedRect(s, outer.hx, outer.hz, outer.r);
  const h = new THREE.Path();
  roundedRect(h, inner.hx, inner.hz, inner.r);
  s.holes.push(h);
  return s;
}
function roundedRect(path, hw, hd, r) {
  path.moveTo(-hw + r, -hd);
  path.lineTo(hw - r, -hd); path.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  path.lineTo(hw, hd - r); path.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  path.lineTo(-hw + r, hd); path.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-hw, -hd + r); path.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

// Cubierta fija con óculo, cerchas, focos LED y videomarcador 360°.
export function buildRoof(cfg, scene) {
  const rc = cfg.roof;
  const group = new THREE.Group();

  const roofGeo = new THREE.ExtrudeGeometry(
    // Cara inferior de la cubierta (por dentro de la envolvente exterior)
    ringShape({ hx: rc.outerHx - 12, hz: rc.outerHz - 12, r: rc.outerR - 12 }, { hx: rc.hx, hz: rc.hz, r: rc.r }),
    { depth: 3, bevelEnabled: false, curveSegments: 32 },
  );
  roofGeo.rotateX(-Math.PI / 2); // la extrusión pasa a ser vertical (+y)
  const roofMat = new THREE.MeshStandardMaterial({ color: '#d6dae2', roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = rc.height;
  group.add(roof);

  // Cerchas radiales bajo la cubierta
  const inner = new BowlContour(rc.hx, rc.hz, rc.r);
  const trussMat = new THREE.MeshStandardMaterial({ color: '#b9bec8', roughness: 0.5, metalness: 0.6 });
  const n = 96;
  const truss = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), trussMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = inner.at((i / n) * inner.length, 0);
    const len = 60;
    const yaw = Math.atan2(p.nx, p.nz);
    q.setFromEuler(new THREE.Euler(0, yaw, 0));
    sc.set(0.6, 4.5, len);
    m.compose(new THREE.Vector3(p.x + p.nx * len / 2, rc.height - 2.2, p.z + p.nz * len / 2), q, sc);
    truss.setMatrixAt(i, m);
  }
  group.add(truss);

  // Anillo de focos en el borde del óculo (brillan con el bloom)
  const lampPts = new BowlContour(rc.hx + 1.5, rc.hz + 1.5, rc.r + 1.5);
  const lampCount = 220;
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.35, 0.9),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6e0').multiplyScalar(6) }), lampCount);
  for (let i = 0; i < lampCount; i++) {
    const p = lampPts.at((i / lampCount) * lampPts.length, 0);
    m.makeRotationY(Math.atan2(p.nx, p.nz));
    m.setPosition(p.x, rc.height - 0.3, p.z);
    lamps.setMatrixAt(i, m);
  }
  group.add(lamps);

  const board = buildVideoBoard(cfg);
  group.add(board.mesh);
  scene.add(group);
  roof.castShadow = true;
  truss.castShadow = true;
  board.mesh.castShadow = true;
  return { group, board, roof, lamps };
}

// Videomarcador 360°: anillo bajo el borde de la cubierta, 6,5 m en laterales
// y 11 m en fondos, inclinado 8° hacia la grada.
function buildVideoBoard(cfg) {
  const rc = cfg.roof, vb = cfg.videoBoard;
  const c = new BowlContour(rc.hx + 4, rc.hz + 4, rc.r + 4);
  const top = rc.height - 1;
  const tilt = Math.tan((vb.tilt * Math.PI) / 180);
  const N = 400;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * c.length;
    const p = c.at(s, 0);
    // Altura: fondos (normal en x) 11 m, laterales 6,5 m, transición en esquinas
    const endness = Math.abs(p.nx);
    const hgt = vb.sideHeight + (vb.endHeight - vb.sideHeight) * Math.pow(endness, 3);
    const out = hgt * tilt;
    pos.push(p.x, top, p.z, p.x - p.nx * out, top - hgt, p.z - p.nz * out);
    uv.push(1 - i / N, 1, 1 - i / N, 1 - hgt / vb.endHeight); // se lee bien desde la grada
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const canvas = document.createElement('canvas');
  canvas.width = 4096; canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, color: new THREE.Color(1.6, 1.6, 1.6) });
  const mesh = new THREE.Mesh(geo, mat);

  const draw = (minute, home, away) => {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    g.fillStyle = '#04070f'; g.fillRect(0, 0, W, H);
    const seg = W / 8;
    for (let k = 0; k < 8; k++) {
      const x0 = k * seg;
      if (k % 2 === 0) {
        const grd = g.createLinearGradient(x0, 0, x0, H);
        grd.addColorStop(0, '#0d1b3d'); grd.addColorStop(1, '#050a18');
        g.fillStyle = grd; g.fillRect(x0 + 4, 4, seg - 8, H - 8);
        g.fillStyle = '#ffffff'; g.font = 'bold 54px system-ui, sans-serif'; g.textBaseline = 'middle';
        g.textAlign = 'center';
        g.fillText(`REAL DEMO  ${home} - ${away}  ATL. EJEMPLO`, x0 + seg / 2, H * 0.42);
        g.fillStyle = '#ffc83d'; g.font = 'bold 36px system-ui, sans-serif';
        g.fillText(`${minute}'`, x0 + seg / 2, H * 0.82);
      } else {
        const grd = g.createLinearGradient(x0, 0, x0 + seg, 0);
        grd.addColorStop(0, '#1fd6a0'); grd.addColorStop(1, '#2b6cff');
        g.fillStyle = grd; g.fillRect(x0 + 4, 4, seg - 8, H - 8);
        g.fillStyle = '#ffffff'; g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('SEATVIEW', x0 + seg / 2, H / 2);
      }
    }
    tex.needsUpdate = true;
  };
  draw(23, 1, 0);
  return { mesh, draw };
}

// Fachada envolvente de lamas metálicas (exterior)
export function buildFacade(cfg, scene) {
  const rc = cfg.roof;
  const c = new BowlContour(rc.outerHx - 1, rc.outerHz - 1, rc.outerR - 1);
  const N = 640;
  const lamas = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.25, 1, 1.4),
    new THREE.MeshStandardMaterial({ color: '#c3c8cf', metalness: 0.85, roughness: 0.32 }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < N; i++) {
    const p = c.at((i / N) * c.length, 0);
    const yaw = Math.atan2(p.nx, p.nz) + 0.6; // lamas giradas, como en la fachada real
    q.setFromEuler(new THREE.Euler(0, yaw, 0));
    m.compose(new THREE.Vector3(p.x, rc.height / 2, p.z), q, new THREE.Vector3(1, rc.height + 3, 1));
    lamas.setMatrixAt(i, m);
  }
  lamas.castShadow = true;
  scene.add(lamas);
  // Muro interior oscuro detrás de las lamas
  const wallGeo = new THREE.ExtrudeGeometry(
    ringShape({ hx: rc.outerHx - 2, hz: rc.outerHz - 2, r: rc.outerR - 2 }, { hx: rc.outerHx - 3, hz: rc.outerHz - 3, r: rc.outerR - 3 }),
    { depth: rc.height, bevelEnabled: false, curveSegments: 32 },
  );
  wallGeo.rotateX(-Math.PI / 2);
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.9 }));
  wall.castShadow = true;
  scene.add(wall);
  // Suelo exterior (plaza)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: '#1a1d24', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);
  return { lamas, wall };
}

// Relleno entre el último nivel y la fachada, para cerrar el graderío por detrás
export function buildUpperFill(venue, scene) {
  const cfg = venue.cfg;
  const t = cfg.tiers[cfg.tiers.length - 1];
  const uBack = t.u0 + t.rows * t.rowDepth + 0.5;
  const hTop = t.h0 + (t.rows - 1) * t.rise + 1.6;
  const c = venue.contour;
  const outer = { hx: cfg.roof.outerHx - 2.5, hz: cfg.roof.outerHz - 2.5, r: cfg.roof.outerR - 2.5 };
  const inner = { hx: c.hx + uBack, hz: c.hz + uBack, r: c.r + uBack };
  const geo = new THREE.ExtrudeGeometry(ringShape(outer, inner), { depth: 1, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#555b66', roughness: 0.9 }));
  mesh.position.y = hTop - 1;
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}
