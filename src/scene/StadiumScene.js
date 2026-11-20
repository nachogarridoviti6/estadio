import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makePitchTexture, makeBoardTexture, makeLabelTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const COLORS = {
  tier: { lower: new THREE.Color('#b3122e'), upper: new THREE.Color('#1e4fa3') },
  sold: new THREE.Color('#2a2f3a'),
  priceStops: ['#20b2a0', '#8bd346', '#f4c542', '#f08a3c', '#e0457b'].map((c) => new THREE.Color(c)),
  viewStops: ['#d64545', '#f08a3c', '#f0c429', '#8bd346', '#20c070'].map((c) => new THREE.Color(c)),
};

function gradient(stops, t) {
  t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return stops[i].clone().lerp(stops[i + 1], t - i);
}

function roundedRect(path, hw, hd, r) {
  path.moveTo(-hw + r, -hd);
  path.lineTo(hw - r, -hd); path.quadraticCurveTo(hw, -hd, hw, -hd + r);
  path.lineTo(hw, hd - r); path.quadraticCurveTo(hw, hd, hw - r, hd);
  path.lineTo(-hw + r, hd); path.quadraticCurveTo(-hw, hd, -hw, hd - r);
  path.lineTo(-hw, -hd + r); path.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return path;
}

export class StadiumScene {
  constructor(container, venue) {
    this.venue = venue;
    this.cfg = venue.cfg;
    this.container = container;
    this.mode = 'overview';
    this.colorMode = 'stadium';
    this.listeners = {};
    this.anim = null;
    this.hoverSector = null;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070b16');
    this.scene.fog = new THREE.Fog('#070b16', 260, 520);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
    this.camera.position.set(95, 185, 165);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.setOverviewControls();

    this.buildLights();
    this.buildPitch();
    this.buildStands();
    this.buildSeats();
    this.buildPeople();
    this.buildAccesses();
    this.buildShell();
    this.buildMarkers();
    this.buildLabels();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.tick());
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }

  // ---------- construcción ----------
  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#c9d6ff', '#1b1e26', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(60, 140, 40);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#9fb4ff', 0.5);
    fill.position.set(-80, 90, -60);
    this.scene.add(fill);
  }

  buildPitch() {
    const { pitch } = this.cfg;
    const area = { l: 124, w: 86 };
    const mat = new THREE.MeshStandardMaterial({
      map: makePitchTexture(pitch, area), roughness: 0.95,
      emissive: '#ffffff', emissiveIntensity: 0.12,
    });
    mat.emissiveMap = mat.map;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(area.l, area.w), mat);
    grass.rotation.x = -Math.PI / 2;
    this.scene.add(grass);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 220),
      new THREE.MeshStandardMaterial({ color: '#1d2a22', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);

    // Porterías
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.3 });
    const net = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const post = new THREE.CylinderGeometry(0.06, 0.06, 2.44, 8);
      for (const z of [-3.66, 3.66]) {
        const m = new THREE.Mesh(post, white); m.position.set(0, 1.22, z); g.add(m);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.32, 8), white);
      bar.rotation.x = Math.PI / 2; bar.position.y = 2.44; g.add(bar);
      const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2.44, 7.32), net);
      box.position.set(s * 1, 1.22, 0); g.add(box);
      g.position.x = s * pitch.length / 2;
      this.scene.add(g);
    }

    // Vallas publicitarias LED
    const boardTex = makeBoardTexture('SEATVIEW');
    const L = pitch.length / 2 + 4, W = pitch.width / 2 + 3.5;
    const backMat = new THREE.MeshStandardMaterial({ color: '#0b1124' });
    const boards = [
      [[0, 0.45, W], 2 * L, Math.PI], [[0, 0.45, -W], 2 * L, 0],
      [[L, 0.45, 0], 2 * W, -Math.PI / 2], [[-L, 0.45, 0], 2 * W, Math.PI / 2],
    ];
    for (const [p, len, ry] of boards) {
      const g = new THREE.Group();
      // El texto se repite cada ~9 m para que no se estire en vallas largas
      const tex = boardTex.clone();
      tex.repeat.x = Math.round(len / 9);
      tex.needsUpdate = true;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
      face.position.z = 0.08;
      const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.14), backMat);
      g.add(face, back);
      g.position.set(...p); g.rotation.y = ry;
      this.scene.add(g);
    }

    // Jugadores (4-4-2 contra 4-3-3), simples pero dan escala a la vista.
    // Jugador: piernas (pantalón) + torso (camiseta) + cabeza
    const mkPlayer = (shirt, shorts) => {
      const legs = new THREE.CapsuleGeometry(0.16, 0.7, 3, 8); legs.translate(0, 0.5, 0); legs.scale(1.3, 1, 1);
      const torso = new THREE.CapsuleGeometry(0.22, 0.45, 3, 8); torso.translate(0, 1.25, 0); torso.scale(1, 1, 1.35);
      const head = new THREE.SphereGeometry(0.12, 10, 8); head.translate(0, 1.72, 0);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(legs, new THREE.MeshStandardMaterial({ color: shorts })));
      g.add(new THREE.Mesh(torso, new THREE.MeshStandardMaterial({ color: shirt })));
      g.add(new THREE.Mesh(head, new THREE.MeshStandardMaterial({ color: '#c99a76' })));
      return g;
    };
    const teamA = ['#f5f5f5', '#f5f5f5'], teamB = ['#d0262f', '#1d2a5a'];
    const A = [[-50, 0], [-36, -20], [-38, -7], [-38, 7], [-36, 20], [-18, -22], [-20, -7], [-20, 7], [-18, 22], [-4, -6], [-6, 8]];
    const B = [[50, 0], [36, -22], [37, -8], [37, 8], [36, 22], [16, -10], [18, 0], [16, 10], [4, -20], [2, 0], [5, 19]];
    for (const [list, [shirt, shorts]] of [[A, teamA], [B, teamB]]) {
      list.forEach(([x, z], i) => {
        // El portero, de otro color
        const p = i === 0 ? mkPlayer('#2bd36b', '#111') : mkPlayer(shirt, shorts);
        p.position.set(x, 0, z);
        p.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(p);
      });
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), white);
    ball.position.set(-1.5, 0.22, 4);
    this.scene.add(ball);
  }

  frameMatrix(frame, sOffset = 0) {
    const n = v3(frame.normal), t = v3(frame.tangent);
    const m = new THREE.Matrix4().makeBasis(n, UP, t);
    const o = v3(frame.origin).addScaledVector(t, sOffset);
    m.setPosition(o);
    return m;
  }

  stepShape(sec) {
    const d = this.cfg.rowDepth;
    const base = sec.tier === 'lower' ? 0 : sec.h0 - 2.6;
    const s = new THREE.Shape();
    s.moveTo(sec.uFront, base);
    s.lineTo(sec.uFront, sec.h0);
    for (let r = 0; r < sec.rows; r++) {
      const h = sec.h0 + r * sec.rise;
      s.lineTo(sec.uFront + (r + 1) * d, h);
      if (r < sec.rows - 1) s.lineTo(sec.uFront + (r + 1) * d, h + sec.rise);
    }
    const uBack = sec.uFront + sec.rows * d;
    const hLast = sec.h0 + (sec.rows - 1) * sec.rise;
    s.lineTo(uBack, hLast + 1.3);
    s.lineTo(uBack + 0.6, hLast + 1.3);
    s.lineTo(uBack + 0.6, base);
    s.lineTo(sec.uFront, base);
    return s;
  }

  buildStands() {
    this.sectorMeshes = [];
    this.standMat = new THREE.MeshStandardMaterial({ color: '#8a909c', roughness: 0.9 });
    const aisleMat = new THREE.MeshStandardMaterial({ color: '#6c717c', roughness: 0.9 });
    const aisle = this.cfg.aisle;

    for (const sec of this.venue.sectors) {
      const shape = this.stepShape(sec);
      const len = sec.sRange[1] - sec.sRange[0];
      const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
      geo.applyMatrix4(this.frameMatrix(sec.frame, sec.sRange[0]));
      const mat = this.standMat.clone();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.sector = sec;
      sec.mesh = mesh;
      this.scene.add(mesh);
      this.sectorMeshes.push(mesh);

      // Pasillo a la derecha de cada sector (salvo el último del lateral)
      const stand = this.cfg.stands.find((s) => s.id === sec.standId);
      if (sec.index < stand.sectors - 1) {
        const ag = new THREE.ExtrudeGeometry(shape, { depth: aisle, bevelEnabled: false });
        ag.applyMatrix4(this.frameMatrix(sec.frame, sec.sRange[1]));
        this.scene.add(new THREE.Mesh(ag, aisleMat));
      }
      // Centro del sector para cámara y etiquetas
      const uMid = sec.uFront + (sec.rows * this.cfg.rowDepth) / 2;
      const hMid = sec.h0 + (sec.rows * sec.rise) / 2;
      const sMid = (sec.sRange[0] + sec.sRange[1]) / 2;
      sec.center = v3(sec.frame.origin)
        .addScaledVector(v3(sec.frame.normal), uMid)
        .addScaledVector(UP, hMid)
        .addScaledVector(v3(sec.frame.tangent), sMid);
    }
  }

  buildSeats() {
    const pan = new THREE.BoxGeometry(0.44, 0.08, 0.44); pan.translate(0, 0.42, 0);
    const back = new THREE.BoxGeometry(0.06, 0.5, 0.44); back.translate(0.21, 0.68, 0);
    const geo = mergeGeometries([pan, back]);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const seats = this.venue.seats;
    const mesh = (this.seatMesh = new THREE.InstancedMesh(geo, mat, seats.length));
    const m = new THREE.Matrix4();
    for (const s of seats) {
      const n = v3(s.normal);
      m.makeBasis(n, UP, n.clone().cross(UP));
      m.setPosition(s.pos[0], s.pos[1], s.pos[2]);
      mesh.setMatrixAt(s.idx, m);
    }
    this.scene.add(mesh);
    this.applyColors();
  }

  buildPeople() {
    const body = new THREE.CapsuleGeometry(0.15, 0.32, 3, 8); body.scale(1, 1, 1.25); body.translate(0.08, 0.72, 0);
    const head = new THREE.IcosahedronGeometry(0.095, 1); head.translate(0.04, 1.08, 0);
    for (const g of [body, head]) g.deleteAttribute('uv');
    const geo = mergeGeometries([body.toNonIndexed(), head]);
    const sold = this.venue.seats.filter((s) => s.sold);
    const mesh = (this.peopleMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), sold.length));
    const pal = (arr) => arr.map((c) => new THREE.Color(c));
    const shirts = pal(['#ffffff', '#f2f2f2', '#e8e8e8', '#1c2a5a', '#7b1d2b', '#2d2d2d', '#c9a227', '#5b6b84']);
    const away = pal(['#d0262f', '#e33a3a', '#b81d28', '#ffffff']);
    const ultras = pal(['#ffffff', '#ffffff', '#1c2a5a', '#7b1d2b']);
    const m = new THREE.Matrix4();
    sold.forEach((s, i) => {
      const n = v3(s.normal);
      m.makeBasis(n, UP, n.clone().cross(UP));
      // En la grada de animación están de pie
      m.setPosition(s.pos[0], s.pos[1] + (s.standing ? 0.42 : 0), s.pos[2]);
      mesh.setMatrixAt(i, m);
      const zone = s.zone;
      const set = zone === 'visitante' ? away : zone === 'animacion' ? ultras : shirts;
      mesh.setColorAt(i, set[(s.idx * 2654435761) % set.length]);
    });
    this.scene.add(mesh);
  }

  // Vomitorios: bocas de acceso en los pasillos, con su cartel verde de salida.
  buildAccesses() {
    const d = this.cfg.rowDepth;
    const seen = new Set();
    const holes = [], signs = [], rails = [];
    for (const sec of this.venue.sectors) {
      const stand = this.cfg.stands.find((st) => st.id === sec.standId);
      // Solo dibujamos los de los pasillos interiores (los extremos son escaleras laterales)
      const inner = sec.accessS.filter((_, i) => (i === 0 ? sec.index > 0 : sec.index < stand.sectors - 1));
      for (const sa of inner) {
        const key = `${sec.standId}${sec.tier}${sa.toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const r = sec.accessRow - 1;
        const u = sec.uFront + r * d + d; // centro de 2 filas
        const h = sec.h0 + r * sec.rise;
        const o = v3(sec.frame.origin), n = v3(sec.frame.normal), t = v3(sec.frame.tangent);
        const at = (du, dh) => o.clone().addScaledVector(n, u + du).addScaledVector(UP, h + dh).addScaledVector(t, sa);
        const basis = new THREE.Matrix4().makeBasis(n, UP, t);
        holes.push(basis.clone().setPosition(at(0, -0.6)));
        signs.push(basis.clone().setPosition(at(d * 1.2, 2.3)));
        for (const side of [-1, 1]) {
          rails.push(basis.clone().setPosition(at(0, 0.55).addScaledVector(t, side * 0.62)));
        }
      }
    }
    const hole = new THREE.InstancedMesh(new THREE.BoxGeometry(d * 2.2, 1.3, this.cfg.aisle * 1.05),
      new THREE.MeshStandardMaterial({ color: '#07090f', roughness: 1 }), holes.length);
    holes.forEach((m, i) => hole.setMatrixAt(i, m));
    const sign = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.35, 0.9),
      new THREE.MeshBasicMaterial({ color: '#2bff88' }), signs.length);
    signs.forEach((m, i) => sign.setMatrixAt(i, m));
    const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(d * 2.2, 1.0, 0.05),
      new THREE.MeshStandardMaterial({ color: '#c9ced8', metalness: 0.6, roughness: 0.3 }), rails.length);
    rails.forEach((m, i) => rail.setMatrixAt(i, m));
    this.scene.add(hole, sign, rail);
  }

  buildShell() {
    // Cubierta (anillo) y fachada exterior
    const rc = this.cfg.roof;
    const roofShape = roundedRect(new THREE.Shape(), 97, 76, 26);
    roofShape.holes.push(roundedRect(new THREE.Path(), rc.hx, rc.hz, rc.r));
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.6, bevelEnabled: false, curveSegments: 24 });
    roofGeo.rotateX(-Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#c7ccd6', roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }));
    roof.position.y = rc.height;
    this.scene.add(roof);
    this.roof = roof;
    roof.visible = false; // solo se ve desde los asientos

    const wallShape = roundedRect(new THREE.Shape(), 97, 76, 26);
    wallShape.holes.push(roundedRect(new THREE.Path(), 96, 75, 25));
    const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: 34, bevelEnabled: false, curveSegments: 24 });
    wallGeo.rotateX(-Math.PI / 2);
    const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: '#3b4252', roughness: 0.8, side: THREE.DoubleSide }));
    this.scene.add(wall);

    // Focos: anillo luminoso en el borde interior de la cubierta
    const ringPts = roundedRect(new THREE.Path(), rc.hx + 0.5, rc.hz + 0.5, rc.r).getSpacedPoints(160);
    const lamp = new THREE.BoxGeometry(2.2, 0.5, 0.8);
    const lamps = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ color: '#fffbe8' }), ringPts.length);
    const m = new THREE.Matrix4();
    ringPts.forEach((p, i) => { m.makeTranslation(p.x, -0.3, -p.y); lamps.setMatrixAt(i, m); });
    this.roof.add(lamps); // los focos van con la cubierta
  }

  buildMarkers() {
    const beacon = new THREE.ConeGeometry(0.9, 2.2, 16); beacon.rotateX(Math.PI);
    this.selMarker = new THREE.Mesh(beacon, new THREE.MeshBasicMaterial({ color: '#36f28f' }));
    this.selMarker.visible = false;
    this.scene.add(this.selMarker);
    this.recoMarkers = [];
    for (let i = 0; i < 8; i++) {
      const mk = new THREE.Mesh(beacon, new THREE.MeshBasicMaterial({ color: '#ffc83d' }));
      mk.visible = false;
      this.scene.add(mk);
      this.recoMarkers.push(mk);
    }
    const hov = new THREE.BoxGeometry(0.55, 0.12, 0.55);
    this.hoverMarker = new THREE.Mesh(hov, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    this.hoverMarker.visible = false;
    this.scene.add(this.hoverMarker);
  }

  buildLabels() {
    this.labels = [];
    for (const sec of this.venue.sectors) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeLabelTexture(sec.id, `desde ${sec.minPrice} €`, sec.zone && `${sec.zone.icon} ${sec.zone.label.replace('Junto a la afición visitante', 'Junto a visitantes')}`),
        depthTest: false, transparent: true,
      }));
      sp.position.copy(sec.center).addScaledVector(UP, sec.tier === 'lower' ? 4 : 8);
      sp.scale.set(sec.zone ? 13 : 10, sec.zone ? 13 * 0.82 : 5, 1);
      sp.renderOrder = 10;
      this.scene.add(sp);
      this.labels.push(sp);
    }
  }

  // ---------- color ----------
  setColorMode(mode) { this.colorMode = mode; this.applyColors(); }

  applyColors() {
    const seats = this.venue.seats;
    const prices = seats.map((s) => s.price);
    const pMin = Math.min(...prices), pMax = Math.max(...prices);
    for (const s of seats) {
      let c;
      if (s.sold && this.colorMode !== 'stadium') c = COLORS.sold;
      else if (this.colorMode === 'price') c = gradient(COLORS.priceStops, (s.price - pMin) / (pMax - pMin));
      else if (this.colorMode === 'view') c = gradient(COLORS.viewStops, (s.rating - 3) / 7);
      else c = COLORS.tier[this.venue.sectorById[s.sectorId].tier];
      this.seatMesh.setColorAt(s.idx, c);
    }
    this.seatMesh.instanceColor.needsUpdate = true;
  }

  // ---------- selección ----------
  setSelection(seat, recos = []) {
    const place = (mk, s, lift) => {
      mk.visible = true;
      mk.position.set(s.pos[0], s.pos[1] + lift, s.pos[2]);
      mk.userData.baseY = mk.position.y;
    };
    this.selMarker.visible = false;
    if (seat) place(this.selMarker, seat, 3);
    this.recoMarkers.forEach((mk, i) => {
      mk.visible = false;
      if (recos[i]) place(mk, recos[i].seat, 3);
    });
  }

  // ---------- cámara ----------
  setOverviewControls() {
    const c = this.controls;
    Object.assign(c, {
      enableZoom: true, enablePan: false, rotateSpeed: 0.6,
      minDistance: 60, maxDistance: 340, minPolarAngle: 0.15, maxPolarAngle: Math.PI * 0.46,
      minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity,
    });
  }

  setSeatControls(eye, look) {
    const c = this.controls;
    const dir = look.clone().sub(eye).normalize();
    // Objetivo pegado a los ojos => arrastrar = girar la cabeza.
    c.target.copy(eye).addScaledVector(dir, 0.1);
    const back = eye.clone().sub(c.target);
    const az = Math.atan2(back.x, back.z);
    Object.assign(c, {
      enableZoom: false, enablePan: false, rotateSpeed: -0.35,
      minDistance: 0, maxDistance: Infinity,
      minPolarAngle: Math.PI * 0.12, maxPolarAngle: Math.PI * 0.58,
      minAzimuthAngle: az - 1.3, maxAzimuthAngle: az + 1.3,
    });
  }

  flyTo(pos, target, { duration = 1.6, fov = 42, arc = 0, onDone } = {}) {
    const from = { pos: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov };
    const ctrl = from.pos.clone().lerp(pos, 0.5).addScaledVector(UP, arc);
    this.controls.enabled = false;
    this.anim = { t: 0, duration, from, to: { pos, target, fov }, ctrl, onDone };
  }

  goOverview() {
    this.mode = 'overview';
    this.setOverviewControls();
    this.setLabelsVisible(true);
    this.flyTo(new THREE.Vector3(95, 185, 165), new THREE.Vector3(0, 0, 0), { fov: 42 });
    this.emit('mode', this.mode);
  }

  goSector(sec) {
    this.mode = 'sector';
    this.focusSector = sec;
    this.setLabelsVisible(false);
    const n = v3(sec.frame.normal);
    const pos = sec.center.clone().addScaledVector(n, -38).addScaledVector(UP, 10);
    this.setOverviewControls();
    this.flyTo(pos, sec.center.clone(), {
      fov: 45,
      onDone: () => Object.assign(this.controls, { minDistance: 15, maxDistance: 90 }),
    });
    this.emit('mode', this.mode);
  }

  goSeat(seat) {
    const wasSeat = this.mode === 'seat';
    this.mode = 'seat';
    this.setLabelsVisible(false);
    const eye = v3(seat.eye);
    const look = new THREE.Vector3(seat.eye[0] * 0.15, 0, seat.eye[2] * 0.15);
    const dir = look.clone().sub(eye).normalize();
    this.flyTo(eye, eye.clone().addScaledVector(dir, 0.1), {
      fov: 62, duration: wasSeat ? 2.2 : 1.8, arc: wasSeat ? 30 : 0,
      onDone: () => this.setSeatControls(eye, look),
    });
    this.emit('mode', this.mode);
  }

  setLabelsVisible(v) {
    this.labels.forEach((l) => (l.visible = v));
    this.roof.visible = !v && this.mode === 'seat';
  }

  // Vista previa en miniatura de un asiento (para la lista de recomendaciones)
  renderThumb(seat, w = 320, h = 180) {
    if (!this.thumbRT) {
      this.thumbRT = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
      this.thumbCam = new THREE.PerspectiveCamera(62, w / h, 0.1, 1200);
      this.thumbBuf = new Uint8Array(w * h * 4);
    }
    const cam = this.thumbCam;
    cam.position.set(...seat.eye);
    cam.lookAt(seat.eye[0] * 0.15, 0, seat.eye[2] * 0.15);
    const hidden = [this.selMarker, ...this.recoMarkers, this.hoverMarker, ...this.labels].filter((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const roofWas = this.roof.visible;
    this.roof.visible = true;
    this.renderer.setRenderTarget(this.thumbRT);
    this.renderer.render(this.scene, cam);
    this.renderer.readRenderTargetPixels(this.thumbRT, 0, 0, w, h, this.thumbBuf);
    this.renderer.setRenderTarget(null);
    hidden.forEach((o) => (o.visible = true));
    this.roof.visible = roofWas;

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      img.data.set(this.thumbBuf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.8);
  }

  // ---------- interacción ----------
  bindEvents() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    el.addEventListener('pointermove', (e) => this.onHover(e));
    el.addEventListener('pointerleave', () => this.clearHover());
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      this.onClick(e);
    });
  }

  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.sectorMeshes, false)[0];
    if (!hit) return null;
    const sec = hit.object.userData.sector;
    const p = hit.point.clone().sub(v3(sec.frame.origin));
    const u = p.dot(v3(sec.frame.normal));
    const s = p.dot(v3(sec.frame.tangent));
    const row = Math.min(sec.rows - 1, Math.max(0, Math.floor((u - sec.uFront) / this.cfg.rowDepth)));
    const perRow = sec.seatIdx.length / sec.rows;
    const k = Math.min(perRow - 1, Math.max(0, Math.floor((s - sec.sRange[0]) / this.cfg.seatWidth)));
    return { sector: sec, seat: this.venue.seats[sec.seatIdx[row * perRow + k]] };
  }

  onHover(e) {
    if (this.anim) return;
    const hit = this.pick(e);
    const sec = hit?.sector || null;
    if (sec !== this.hoverSector) {
      if (this.hoverSector) this.hoverSector.mesh.material.emissive.set('#000000');
      if (sec && this.mode === 'overview') sec.mesh.material.emissive.set('#3a5bd0');
      this.hoverSector = sec;
    }
    const seatLevel = this.mode !== 'overview' && hit;
    this.hoverMarker.visible = !!seatLevel;
    if (seatLevel) {
      const s = hit.seat;
      this.hoverMarker.position.set(s.pos[0], s.pos[1] + 0.95, s.pos[2]);
      this.hoverMarker.material.color.set(s.sold ? '#ff5a5a' : '#ffffff');
    }
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    this.emit('hover', hit ? { ...hit, level: seatLevel ? 'seat' : 'sector', x: e.clientX, y: e.clientY } : null);
  }

  clearHover() {
    if (this.hoverSector) this.hoverSector.mesh.material.emissive.set('#000000');
    this.hoverSector = null;
    this.hoverMarker.visible = false;
    this.emit('hover', null);
  }

  onClick(e) {
    if (this.anim) return;
    const hit = this.pick(e);
    if (!hit) return;
    if (this.mode === 'overview') {
      this.clearHover();
      this.goSector(hit.sector);
    } else {
      this.emit('seatClick', hit.seat);
    }
  }

  // ---------- bucle ----------
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const dt = this.clock.getDelta();
    const time = this.clock.elapsedTime;
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.duration);
      const k = ease(a.t);
      // Bézier cuadrática para que los saltos entre asientos "vuelen" en arco
      const p = a.from.pos.clone().multiplyScalar((1 - k) * (1 - k))
        .addScaledVector(a.ctrl, 2 * (1 - k) * k)
        .addScaledVector(a.to.pos, k * k);
      this.camera.position.copy(p);
      this.controls.target.lerpVectors(a.from.target, a.to.target, k);
      this.camera.fov = a.from.fov + (a.to.fov - a.from.fov) * k;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.controls.target);
      if (a.t >= 1) {
        this.anim = null;
        this.controls.enabled = true;
        a.onDone?.();
        this.emit('arrived', this.mode);
      }
    } else {
      this.controls.update();
    }
    const bob = Math.sin(time * 3) * 0.35;
    for (const mk of [this.selMarker, ...this.recoMarkers]) {
      if (mk.visible) { mk.position.y = mk.userData.baseY + bob; mk.rotation.y = time * 1.5; }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
