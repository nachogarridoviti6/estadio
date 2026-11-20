import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Jugadores: cuerpo atlético con animaciones reales (correr, andar, parado) y
// la equipación pintada por zonas del cuerpo (camiseta, pantalón, medias, botas).

const KITS = {
  home: { shirt: '#f5f5f7', shorts: '#f5f5f7', socks: '#f5f5f7', trim: '#c9a227' },
  away: { shirt: '#c8102e', shorts: '#1b2a4a', socks: '#c8102e', trim: '#ffffff' },
  gkHome: { shirt: '#2bd36b', shorts: '#111111', socks: '#2bd36b', trim: '#111' },
  gkAway: { shirt: '#f2d21b', shorts: '#111111', socks: '#f2d21b', trim: '#111' },
};
const SKINS = ['#f1c9a5', '#d9a47c', '#8d5a3b', '#e8b993', '#5e3a26', '#f5d0b0'];
const HAIR = ['#1a1410', '#3b2a1e', '#0d0d0d', '#6b4a2b', '#1a1410'];

function kitMaterial(kit, skin, hair, bounds) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      cShirt: { value: new THREE.Color(kit.shirt) }, cShorts: { value: new THREE.Color(kit.shorts) },
      cSocks: { value: new THREE.Color(kit.socks) }, cTrim: { value: new THREE.Color(kit.trim) },
      cSkin: { value: new THREE.Color(skin) }, cHair: { value: new THREE.Color(hair) },
      cBoots: { value: new THREE.Color('#111111') },
      yMin: { value: bounds.min.y }, yMax: { value: bounds.max.y },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBind;
        uniform vec3 cShirt, cShorts, cSocks, cTrim, cSkin, cHair, cBoots;
        uniform float yMin, yMax;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float H = yMax - yMin;
        float t = (vBind.y - yMin) / H;
        float ax = abs(vBind.x) / H;            // distancia al eje (brazos en T)
        vec3 c = cSkin;
        if (t < 0.045) c = cBoots;
        else if (t < 0.27) c = cSocks;
        else if (t < 0.395) c = cSkin;                       // rodillas
        else if (t < 0.585) c = cShorts;
        else if (t < 0.835) c = (ax < 0.2) ? cShirt : cSkin;  // manga corta
        if (t > 0.585 && t < 0.6) c = mix(c, cTrim, 0.6);     // cintura
        if (ax > 0.185 && ax < 0.2 && t > 0.7) c = cTrim;      // remate manga
        if (t > 0.935) c = cHair;
        diffuseColor.rgb = c;`);
  };
  m.customProgramCacheKey = () => 'kit';
  return m;
}

// Formación base (x relativo hacia la portería rival, z lateral), 4-3-3
const FORMATION = [
  [-48, 0], [-34, -22], [-37, -8], [-37, 8], [-34, 22],
  [-18, -14], [-20, 0], [-18, 14], [-4, -22], [-2, 0], [-4, 22],
];

export class Match {
  constructor(scene, gltf) {
    this.scene = scene;
    this.players = [];
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
    );
    this.ball.castShadow = true;
    this.ball.position.set(0, 0.11, 0);
    scene.add(this.ball);
    this.ballFrom = new THREE.Vector3(); this.ballTo = new THREE.Vector3(); this.ballT = 1;
    this.focusX = 0; this.timer = 0;

    const base = gltf.scene;
    let bounds;
    base.traverse((o) => { if (o.isSkinnedMesh && o.name.includes('Surface')) { o.geometry.computeBoundingBox(); bounds = o.geometry.boundingBox; } });
    const clips = Object.fromEntries(gltf.animations.map((a) => [a.name, a]));

    for (const team of ['home', 'away']) {
      FORMATION.forEach(([fx, fz], i) => {
        const obj = SkeletonUtils.clone(base);
        const kit = KITS[i === 0 ? (team === 'home' ? 'gkHome' : 'gkAway') : team];
        const skin = SKINS[(i * 7 + (team === 'home' ? 0 : 3)) % SKINS.length];
        const mat = kitMaterial(kit, skin, HAIR[i % HAIR.length], bounds);
        obj.traverse((o) => {
          if (o.isMesh) { o.material = mat; o.castShadow = true; o.frustumCulled = false; }
        });
        const s = 1.78 + ((i * 13) % 7) * 0.02 - 0.06;
        obj.scale.setScalar(s / 1.8);
        const dir = team === 'home' ? 1 : -1;
        const home = new THREE.Vector3(fx * dir, 0, fz * dir);
        obj.position.copy(home);
        obj.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const mixer = new THREE.AnimationMixer(obj);
        const actions = {
          idle: mixer.clipAction(clips.idle), run: mixer.clipAction(clips.run), walk: mixer.clipAction(clips.walk),
        };
        for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
        actions.idle.setEffectiveWeight(1);
        mixer.update(Math.random() * 2);
        scene.add(obj);
        this.players.push({ obj, mixer, actions, home, team, dir, gk: i === 0, target: home.clone(), speed: 0 });
      });
    }
  }

  update(dt) {
    this.timer -= dt;
    // Cada pocos segundos el balón va a otro jugador (pase)
    if (this.timer <= 0) {
      const outfield = this.players.filter((p) => !p.gk);
      const to = outfield[Math.floor(Math.random() * outfield.length)];
      this.ballFrom.copy(this.ball.position);
      this.ballTo.set(to.obj.position.x + Math.random() * 2 - 1, 0.11, to.obj.position.z + Math.random() * 2 - 1);
      this.ballT = 0;
      this.ballDur = Math.max(0.6, this.ballFrom.distanceTo(this.ballTo) / 16);
      this.timer = this.ballDur + 1 + Math.random() * 2;
    }
    if (this.ballT < 1) {
      this.ballT = Math.min(1, this.ballT + dt / this.ballDur);
      this.ball.position.lerpVectors(this.ballFrom, this.ballTo, this.ballT);
      this.ball.position.y = 0.11 + Math.sin(this.ballT * Math.PI) * Math.min(4, this.ballFrom.distanceTo(this.ballTo) * 0.08);
      this.ball.rotation.x += dt * 8;
    }
    // El bloque se desplaza con el balón
    this.focusX += (THREE.MathUtils.clamp(this.ball.position.x, -30, 30) - this.focusX) * dt * 0.3;

    for (const p of this.players) {
      const shift = p.gk ? this.focusX * 0.08 : this.focusX * 0.75;
      p.target.set(
        THREE.MathUtils.clamp(p.home.x + shift + Math.sin(performance.now() / 4000 + p.home.z) * 3, -51, 51),
        0,
        p.home.z + (this.ball.position.z - p.home.z) * (p.gk ? 0.15 : 0.18),
      );
      const d = p.target.clone().sub(p.obj.position);
      d.y = 0;
      const dist = d.length();
      const want = dist > 6 ? 6.5 : dist > 1.5 ? 2.2 : 0;
      p.speed += (want - p.speed) * Math.min(1, dt * 2);
      if (dist > 0.05) p.obj.position.addScaledVector(d.normalize(), Math.min(dist, p.speed * dt));
      // Mira a donde corre, o al balón si está parado
      const look = p.speed > 0.8 ? d : this.ball.position.clone().sub(p.obj.position);
      const yaw = Math.atan2(look.x, look.z);
      let dy = yaw - p.obj.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.obj.rotation.y += dy * Math.min(1, dt * 5);
      // Mezcla de animaciones según velocidad
      const run = THREE.MathUtils.clamp((p.speed - 2.2) / 3, 0, 1);
      const walk = THREE.MathUtils.clamp(p.speed / 2.2, 0, 1) * (1 - run);
      p.actions.run.setEffectiveWeight(run);
      p.actions.walk.setEffectiveWeight(walk);
      p.actions.idle.setEffectiveWeight(1 - run - walk);
      p.mixer.update(dt * (0.7 + p.speed * 0.08));
    }
  }
}

export async function loadMatch(scene, url = '/assets/Xbot.glb') {
  const gltf = await new GLTFLoader().loadAsync(url);
  return new Match(scene, gltf);
}
