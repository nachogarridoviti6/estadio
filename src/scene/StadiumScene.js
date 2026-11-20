import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { buildStands, sweepProfile } from './build/stands.js';
import { buildPitch } from './build/pitch.js';
import { loadHumanAssets, buildCrowdAtlas } from './build/humans.js';
import { buildCrowd } from './build/crowd.js';
import { loadMatch } from './build/players.js';
import { buildSky, buildRoof, buildFacade, buildUpperFill } from './build/shell.js';
import { parapetTop } from '../venue/generateVenue.js';

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t) => t * t * (3 - 2 * t);

const COLORS = {
  sold: new THREE.Color('#20242c'),
  hover: new THREE.Color('#ff8a1f'),
  priceStops: ['#20b2a0', '#8bd346', '#f4c542', '#f08a3c', '#e0457b'].map((c) => new THREE.Color(c)),
  viewStops: ['#d64545', '#f08a3c', '#f0c429', '#8bd346', '#20c070'].map((c) => new THREE.Color(c)),
};
function gradient(stops, t) {
  t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return stops[i].clone().lerp(stops[i + 1], t - i);
}

const OVERVIEW = { pos: new THREE.Vector3(150, 230, 210), target: new THREE.Vector3(0, 0, 0), fov: 40 };

export class StadiumScene {
  static async create(container, venue, onProgress = () => {}) {
    const s = new StadiumScene(container, venue);
    await s.init(onProgress);
    return s;
  }

  constructor(container, venue) {
    this.venue = venue;
    this.cfg = venue.cfg;
    this.container = container;
    this.mode = 'overview';
    this.colorMode = 'stadium';
    this.listeners = {};
    this.anim = null;
    this.hoverSector = null;
    this.quality = window.matchMedia('(max-width: 760px)').matches ? 'low' : 'high';
  }

  async init(onProgress) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#0b0f1c', 350, 1100);
    this.camera = new THREE.PerspectiveCamera(OVERVIEW.fov, 1, 0.3, 2500);
    this.camera.position.copy(OVERVIEW.pos);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.setOverviewControls();

    onProgress('Cargando iluminación y texturas…', 0.1);
    const [env, grass] = await Promise.all([
      new RGBELoader().loadAsync('/assets/moonless_golf_1k.hdr'),
      new THREE.TextureLoader().loadAsync('/assets/grasslight-big.jpg'),
    ]);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromEquirectangular(env).texture;
    this.scene.environmentIntensity = 0.5;
    env.dispose();

    onProgress('Construyendo el estadio…', 0.3);
    buildSky(this.scene);
    this.buildLights();
    buildPitch(this.cfg, this.scene, grass);
    this.sectorMeshes = buildStands(this.venue, this.scene);
    this.buildLedRing();
    this.buildSeats();
    buildUpperFill(this.venue, this.scene);
    this.facade = buildFacade(this.cfg, this.scene);
    this.roof = buildRoof(this.cfg, this.scene);
    this.roof.group.visible = false;

    onProgress('Creando el público…', 0.55);
    const humans = await loadHumanAssets();
    this.atlas = buildCrowdAtlas(r, humans);
    this.crowd = buildCrowd(this.venue, this.atlas, this.scene);

    onProgress('Saltan los jugadores al campo…', 0.8);
    this.match = await loadMatch(this.scene);

    this.buildMarkers();
    this.buildPost();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.tick());
    onProgress('Listo', 1);
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }

  // ---------- construcción ----------
  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#bcc8ff', '#202430', 0.55));
    // Focos de la cubierta: cuatro direcciones, una con sombras sobre el campo
    const rh = this.cfg.roof.height;
    const dirs = [[0, rh, 70], [0, rh, -70], [90, rh, 0], [-90, rh, 0]];
    dirs.forEach((p, i) => {
      const l = new THREE.DirectionalLight('#fff6ea', i === 0 ? 1.6 : 0.9);
      l.position.set(...p);
      if (i === 0) {
        l.castShadow = true;
        const sz = this.quality === 'high' ? 4096 : 2048;
        l.shadow.mapSize.set(sz, sz);
        Object.assign(l.shadow.camera, { left: -75, right: 75, top: 55, bottom: -55, near: 10, far: 200 });
        l.shadow.bias = -0.0004;
        l.shadow.normalBias = 0.02;
      }
      this.scene.add(l);
    });
  }

  // Anillo LED en el peto del primer anfiteatro
  buildLedRing() {
    const t = this.cfg.tiers[1];
    const top = parapetTop(this.cfg, t);
    const prof = [[t.u0 - 0.36, top - 2], [t.u0 - 0.31, top - 2], [t.u0 - 0.31, top - 0.05], [t.u0 - 0.36, top - 0.05]];
    const c = this.venue.contour;
    const geo = sweepProfile(c, 0, c.length, prof, { stepLine: 2, stepCorner: 0.7 });
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 64;
    const g = canvas.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 1024, 0);
    grd.addColorStop(0, '#0b2a6b'); grd.addColorStop(0.5, '#1e5bd8'); grd.addColorStop(1, '#0b2a6b');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 64);
    g.fillStyle = '#fff'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SEATVIEW  ·  TU VISTA ANTES DE COMPRAR', 512, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(1 / 15, 1);
    this.ledTex = tex;
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.4, 1.4, 1.4) })));
  }

  buildSeats() {
    const pan = new THREE.BoxGeometry(0.44, 0.06, 0.44); pan.translate(0, 0.44, 0);
    const back = new THREE.BoxGeometry(0.05, 0.42, 0.42); back.rotateZ(-0.12); back.translate(0.22, 0.7, 0);
    const leg = new THREE.BoxGeometry(0.05, 0.4, 0.05); leg.translate(0.12, 0.2, 0);
    const geo = mergeGeometries([pan, back, leg]);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 });
    const seats = this.venue.seats;
    const mesh = (this.seatMesh = new THREE.InstancedMesh(geo, mat, seats.length));
    const m = new THREE.Matrix4();
    for (const s of seats) {
      const n = v3(s.normal);
      m.makeBasis(n, UP, n.clone().cross(UP));
      m.setPosition(s.pos[0], s.pos[1], s.pos[2]);
      mesh.setMatrixAt(s.idx, m);
    }
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.applyColors();
  }

  // Asientos detallados (abatibles, respaldo curvo, patas) alrededor del
  // espectador. Sustituyen a los simplificados solo donde se ven de cerca.
  buildDetailSeats() {
    const parts = [];
    const pan = new THREE.BoxGeometry(0.42, 0.045, 0.43); pan.translate(-0.02, 0.43, 0); parts.push(pan);
    const lip = new THREE.CylinderGeometry(0.025, 0.025, 0.43, 8); lip.rotateX(Math.PI / 2); lip.translate(-0.23, 0.43, 0); parts.push(lip);
    const back = new THREE.CylinderGeometry(0.9, 0.9, 0.44, 16, 1, true, -0.25, 0.5);
    back.rotateY(Math.PI / 2); back.translate(-0.68, 0, 0); back.rotateZ(-0.16); back.translate(0.21, 0.72, 0);
    parts.push(back);
    const backThick = new THREE.BoxGeometry(0.03, 0.44, 0.44); backThick.rotateZ(-0.16); backThick.translate(0.235, 0.72, 0); parts.push(backThick);
    for (const z of [-0.24, 0.24]) {
      const arm = new THREE.BoxGeometry(0.36, 0.035, 0.045); arm.translate(0.02, 0.62, z); parts.push(arm);
      const post = new THREE.BoxGeometry(0.04, 0.6, 0.04); post.translate(0.14, 0.3, z); parts.push(post);
    }
    for (const p of parts) { if (p.index) p.toNonIndexed(); }
    const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
    this.detailSeats = new THREE.InstancedMesh(geo, mat, 2500);
    this.detailSeats.count = 0;
    this.detailSeats.receiveShadow = true;
    this.scene.add(this.detailSeats);
    this.hiddenSeats = [];
  }

  showDetailSeats(seat) {
    if (!this.detailSeats) this.buildDetailSeats();
    const m = new THREE.Matrix4();
    // Restaurar los simplificados ocultos
    for (const i of this.hiddenSeats) {
      const s = this.venue.seats[i];
      const n = v3(s.normal);
      m.makeBasis(n, UP, n.clone().cross(UP)).setPosition(s.pos[0], s.pos[1], s.pos[2]);
      this.seatMesh.setMatrixAt(i, m);
    }
    this.hiddenSeats = [];
    this.detailSeats.count = 0;
    if (seat) {
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      const e = seat.eye;
      for (const s of this.venue.seats) {
        if (this.detailSeats.count >= 2500) break;
        const dx = s.pos[0] - e[0], dy = s.pos[1] - e[1], dz = s.pos[2] - e[2];
        if (dx * dx + dy * dy + dz * dz > 22 * 22) continue;
        const n = v3(s.normal);
        m.makeBasis(n, UP, n.clone().cross(UP)).setPosition(s.pos[0], s.pos[1], s.pos[2]);
        this.detailSeats.setMatrixAt(this.detailSeats.count, m);
        this.detailSeats.setColorAt(this.detailSeats.count, this.seatColor(s));
        this.detailSeats.count++;
        this.seatMesh.setMatrixAt(s.idx, zero);
        this.hiddenSeats.push(s.idx);
      }
      this.detailSeats.instanceMatrix.needsUpdate = true;
      if (this.detailSeats.instanceColor) this.detailSeats.instanceColor.needsUpdate = true;
    }
    this.seatMesh.instanceMatrix.needsUpdate = true;
  }

  buildMarkers() {
    // Haz de luz sobre el asiento elegido (como en el vídeo de San Siro)
    const beamGeo = new THREE.CylinderGeometry(0.45, 0.45, 60, 24, 1, true);
    beamGeo.translate(0, 30, 0);
    const beamMat = (color) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uFade; varying vec2 vUv;
        void main(){ float a = uFade * pow(1.0 - vUv.y, 2.2) * (0.75 + 0.25 * sin(uTime * 4.0 - vUv.y * 20.0));
          gl_FragColor = vec4(uColor * 2.5 * a, a); }`,
    });
    const glowSeat = new THREE.BoxGeometry(0.6, 0.9, 0.6); glowSeat.translate(0, 0.45, 0);
    const mk = (color, scale) => {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(beamGeo, beamMat(color));
      beam.scale.set(scale, scale, scale);
      const seat = new THREE.Mesh(glowSeat, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, opacity: 0.85 }));
      g.add(beam, seat);
      g.visible = false;
      g.userData.beam = beam;
      g.userData.glow = seat;
      this.scene.add(g);
      return g;
    };
    this.selMarker = mk('#36f28f', 1);
    this.recoMarkers = Array.from({ length: 6 }, () => mk('#ffc83d', 0.6));
    this.hoverMarker = new THREE.Mesh(glowSeat, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2), transparent: true, opacity: 0.7 }));
    this.hoverMarker.visible = false;
    this.scene.add(this.hoverMarker);
  }

  buildPost() {
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // ---------- color ----------
  setColorMode(mode) { this.colorMode = mode; this.applyColors(); }

  seatColor(s) {
    if (this.colorMode === 'stadium') return new THREE.Color(this.cfg.seatColor);
    if (s.sold) return COLORS.sold;
    if (this.colorMode === 'price') return gradient(COLORS.priceStops, (s.price - this.pMin) / (this.pMax - this.pMin));
    return gradient(COLORS.viewStops, (s.rating - 3) / 7);
  }

  applyColors() {
    const seats = this.venue.seats;
    if (this.pMin === undefined) {
      const p = seats.map((s) => s.price);
      this.pMin = Math.min(...p); this.pMax = Math.max(...p);
    }
    for (const s of seats) this.seatMesh.setColorAt(s.idx, this.seatColor(s));
    this.seatMesh.instanceColor.needsUpdate = true;
    // En los mapas de calor se oculta el público para ver bien los colores
    if (this.crowd) this.crowd.visible = this.colorMode === 'stadium' || this.mode === 'seat';
  }

  tintSector(sec, on) {
    for (const i of sec.seatIdx) this.seatMesh.setColorAt(i, on ? COLORS.hover : this.seatColor(this.venue.seats[i]));
    this.seatMesh.instanceColor.needsUpdate = true;
    sec.mesh.material.emissive.set(on ? '#7a3500' : '#000000');
  }

  // ---------- selección ----------
  setSelection(seat, recos = []) {
    const place = (mk, s) => { mk.visible = true; mk.position.set(s.pos[0], s.pos[1], s.pos[2]); };
    this.selMarker.visible = false;
    if (seat && this.mode !== 'seat') place(this.selMarker, seat);
    if (seat) this.selMarker.position.set(seat.pos[0], seat.pos[1], seat.pos[2]);
    this.recoMarkers.forEach((mk, i) => { mk.visible = false; if (recos[i]) place(mk, recos[i].seat); });
  }

  // ---------- cámara ----------
  setOverviewControls() {
    Object.assign(this.controls, {
      enableZoom: true, enablePan: false, rotateSpeed: 0.6,
      minDistance: 90, maxDistance: 520, minPolarAngle: 0.12, maxPolarAngle: Math.PI * 0.42,
      minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity,
    });
  }

  setSeatControls(eye, look) {
    const c = this.controls;
    const dir = look.clone().sub(eye).normalize();
    c.target.copy(eye).addScaledVector(dir, 0.1);
    const back = eye.clone().sub(c.target);
    const az = Math.atan2(back.x, back.z);
    Object.assign(c, {
      enableZoom: false, enablePan: false, rotateSpeed: -0.35,
      minDistance: 0, maxDistance: Infinity,
      minPolarAngle: Math.PI * 0.15, maxPolarAngle: Math.PI * 0.62,
      minAzimuthAngle: az - 1.4, maxAzimuthAngle: az + 1.4,
    });
  }

  // Vuelo genérico: posición por curva, orientación por función
  fly({ points, lookAt, duration, fov, onDone }) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.controls.enabled = false;
    this.anim = { t: 0, duration, curve, lookAt, fov0: this.camera.fov, fov1: fov, onDone };
  }

  flyTo(pos, target, { duration = 1.8, fov = 42, onDone } = {}) {
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    const mid = p0.clone().lerp(pos, 0.5).addScaledVector(UP, p0.distanceTo(pos) * 0.15);
    this.fly({ points: [p0, mid, pos], duration, fov, onDone, lookAt: (k) => t0.clone().lerp(target, smooth(k)) });
    this.anim.finalTarget = target.clone();
  }

  goOverview() {
    this.showDetailSeats(null);
    this.mode = 'overview';
    this.roof.group.visible = false;
    this.crowd.visible = this.colorMode === 'stadium';
    this.setOverviewControls();
    this.flyTo(OVERVIEW.pos.clone(), OVERVIEW.target.clone(), { fov: OVERVIEW.fov, duration: 2 });
    this.emit('mode', this.mode);
  }

  goSector(sec) {
    this.showDetailSeats(null);
    this.mode = 'sector';
    this.focusSector = sec;
    this.roof.group.visible = false;
    this.crowd.visible = this.colorMode === 'stadium';
    const mid = this.venue.seats[sec.seatIdx[Math.floor(sec.seatIdx.length / 2)]];
    const center = v3(mid.pos);
    const n = v3(mid.normal);
    const pos = center.clone().addScaledVector(n, -42).addScaledVector(UP, 16);
    this.setOverviewControls();
    this.flyTo(pos, center, {
      fov: 45, duration: 2,
      onDone: () => Object.assign(this.controls, { minDistance: 15, maxDistance: 120 }),
    });
    this.emit('mode', this.mode);
  }

  // Vuelo cinematográfico hasta el asiento: sube sobre el campo, baja hacia la
  // grada mirando al asiento y, al llegar, gira para mirar al campo.
  goSeat(seat) {
    const fromSeat = this.mode === 'seat';
    this.mode = 'seat';
    this.crowd.visible = true;
    const eye = v3(seat.eye);
    const n = v3(seat.normal);
    const look = new THREE.Vector3(seat.eye[0] * 0.12, 0, seat.eye[2] * 0.12);
    const p0 = this.camera.position.clone();
    const high = new THREE.Vector3(eye.x * 0.45, Math.max(eye.y + 30, 75), eye.z * 0.45);
    const approach = eye.clone().addScaledVector(n, -16).addScaledVector(UP, 5);
    const near = eye.clone().addScaledVector(n, -3).addScaledVector(UP, 1.2);
    const points = fromSeat
      ? [p0, p0.clone().addScaledVector(UP, 25).lerp(high, 0.5), approach, near, eye]
      : [p0, high, approach, near, eye];
    const behind = eye.clone().addScaledVector(n, 8);
    const t0 = this.controls.target.clone();
    const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
    const tmp = new THREE.PerspectiveCamera(); // lookAt de cámara (mira hacia -Z)
    this.selMarker.visible = true;
    this.selMarker.position.set(seat.pos[0], seat.pos[1], seat.pos[2]);
    this.fly({
      points, duration: fromSeat ? 3.2 : 3.8, fov: 62,
      lookAt: (k, pos) => {
        const tgt = k < 0.2 ? t0.clone().lerp(eye, smooth(k / 0.2)) : (pos.distanceTo(eye) > 6 ? eye : behind);
        tmp.position.copy(pos); tmp.lookAt(tgt); qA.copy(tmp.quaternion);
        if (k < 0.78) return qA;
        tmp.position.copy(eye); tmp.lookAt(look); qB.copy(tmp.quaternion);
        return qA.slerp(qB, smooth((k - 0.78) / 0.22));
      },
      onDone: () => {
        this.showDetailSeats(seat);
        this.setSeatControls(eye, look);
        this.roof.group.visible = true;
        this.selMarker.visible = false;
      },
    });
    this.anim.showRoofAt = 0.55;
    this.anim.finalTarget = eye.clone().addScaledVector(look.clone().sub(eye).normalize(), 0.1);
    this.emit('mode', this.mode);
  }

  // Miniatura de la vista desde un asiento (sin postprocesado)
  renderThumb(seat, w = 320, h = 180) {
    if (!this.thumbRT) {
      this.thumbRT = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
      this.thumbRT.texture.colorSpace = THREE.SRGBColorSpace;
      this.thumbCam = new THREE.PerspectiveCamera(62, w / h, 0.1, 2500);
      this.thumbBuf = new Uint8Array(w * h * 4);
      this.thumbCanvas = document.createElement('canvas');
      this.thumbCanvas.width = w; this.thumbCanvas.height = h;
    }
    const cam = this.thumbCam;
    cam.position.set(...seat.eye);
    cam.lookAt(seat.eye[0] * 0.12, 0, seat.eye[2] * 0.12);
    const toggled = [this.selMarker, ...this.recoMarkers, this.hoverMarker].filter((o) => o.visible);
    toggled.forEach((o) => (o.visible = false));
    const roofWas = this.roof.group.visible, crowdWas = this.crowd.visible;
    this.roof.group.visible = true; this.crowd.visible = true;
    this.renderer.setRenderTarget(this.thumbRT);
    this.renderer.render(this.scene, cam);
    this.renderer.readRenderTargetPixels(this.thumbRT, 0, 0, w, h, this.thumbBuf);
    this.renderer.setRenderTarget(null);
    toggled.forEach((o) => (o.visible = true));
    this.roof.group.visible = roofWas; this.crowd.visible = crowdWas;
    const ctx = this.thumbCanvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      img.data.set(this.thumbBuf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return this.thumbCanvas.toDataURL('image/jpeg', 0.82);
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
    const { s, u } = this.venue.contour.project(hit.point.x, hit.point.z);
    const row = Math.min(sec.rows - 1, Math.max(0, Math.floor((u - sec.u0) / sec.rowDepth)));
    const start = sec.rowStart[row], count = sec.rowCount[row];
    const L = this.venue.contour.length;
    let best = null, bd = Infinity;
    for (let k = 0; k < count; k++) {
      const seat = this.venue.seats[start + k];
      let d = Math.abs((((seat.s % L) + L) % L) - s);
      d = Math.min(d, L - d);
      if (d < bd) { bd = d; best = seat; }
    }
    return { sector: sec, seat: best };
  }

  onHover(e) {
    if (this.anim) return;
    const hit = this.pick(e);
    const sec = hit?.sector || null;
    if (sec !== this.hoverSector) {
      if (this.hoverSector) this.tintSector(this.hoverSector, false);
      if (sec && this.mode === 'overview') this.tintSector(sec, true);
      this.hoverSector = sec;
    }
    const seatLevel = this.mode !== 'overview' && hit;
    this.hoverMarker.visible = !!seatLevel;
    if (seatLevel) {
      const s = hit.seat;
      this.hoverMarker.position.set(s.pos[0], s.pos[1], s.pos[2]);
      this.hoverMarker.material.color.set(s.sold ? '#ff5a5a' : '#ffffff').multiplyScalar(2);
    }
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    this.emit('hover', hit ? { ...hit, level: seatLevel ? 'seat' : 'sector', x: e.clientX, y: e.clientY } : null);
  }

  clearHover() {
    if (this.hoverSector) this.tintSector(this.hoverSector, false);
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
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.duration);
      const k = ease(a.t);
      const pos = a.curve.getPoint(k);
      this.camera.position.copy(pos);
      const look = a.lookAt(k, pos);
      if (look.isQuaternion) this.camera.quaternion.copy(look);
      else this.camera.lookAt(look);
      this.camera.fov = a.fov0 + (a.fov1 - a.fov0) * smooth(a.t);
      this.camera.updateProjectionMatrix();
      if (a.showRoofAt && a.t > a.showRoofAt) this.roof.group.visible = true;
      if (a.t >= 1) {
        this.anim = null;
        if (a.finalTarget) this.controls.target.copy(a.finalTarget);
        this.controls.enabled = true;
        a.onDone?.();
        this.controls.update();
        this.emit('arrived', this.mode);
      }
    } else {
      this.controls.update();
    }
    this.match.update(dt);
    this.crowd.material.uniforms.uTime.value = time;
    this.ledTex.offset.x = (time * 0.01) % 1;
    for (const mk of [this.selMarker, ...this.recoMarkers]) {
      if (!mk.visible) continue;
      const u = mk.userData.beam.material.uniforms;
      u.uTime.value = time;
      // El haz se desvanece cuando la cámara se acerca (para no atravesarlo)
      const d = Math.hypot(this.camera.position.x - mk.position.x, this.camera.position.z - mk.position.z);
      u.uFade.value = THREE.MathUtils.smoothstep(d, 6, 30);
      mk.userData.glow.material.opacity = 0.85 * THREE.MathUtils.smoothstep(d, 3, 12);
    }
    this.composer.render();
  }
}
