import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

export async function loadHumanAssets(base = import.meta.env.BASE_URL + 'assets/') {
  const [male, female, anim] = await Promise.all([
    load(base + 'readyplayer.me.glb'),
    load(base + 'Michelle.glb'),
    load(base + 'Soldier.glb'),
  ]);
  return { male, female, anim };
}

export function bone(root, name) {
  return root.getObjectByName(name) || root.getObjectByName('mixamorig' + name) || root.getObjectByName('mixamorig:' + name);
}

// Tinte que conserva el detalle de la textura (arrugas, costuras) pero
// cambia el color: color * luminancia de la textura.
function tintMaterial(mat, color, strength = 1) {
  const m = mat.clone();
  const c = new THREE.Color(color);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tint = { value: c };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 tint;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 tx = texture2D(map, vMapUv);
          float l = dot(tx.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(tx.rgb, tint * (0.45 + l * 1.1), ${strength.toFixed(2)});
        #else
          diffuseColor.rgb = tint;
        #endif
      `);
  };
  m.customProgramCacheKey = () => 'tint' + strength;
  return m;
}

// Cabeza sin gorro: pinta pelo en la parte superior y trasera del cráneo
function hairMaterial(mesh, skin, hair) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const m = mesh.material.clone();
  if (skin) m.color = new THREE.Color(skin);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hairColor = { value: new THREE.Color(hair) };
    sh.uniforms.bMin = { value: bb.min }; sh.uniforms.bMax = { value: bb.max };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBindH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindH = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBindH; uniform vec3 hairColor, bMin, bMax;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 q = (vBindH - bMin) / (bMax - bMin);
        float hairLine = q.y > 0.80 || (q.z < 0.42 && q.y > 0.5) || (q.z < 0.5 && q.y > 0.62 && abs(q.x - 0.5) > 0.36) ? 1.0 : 0.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, hairColor, hairLine);`);
  };
  m.customProgramCacheKey = () => 'hair';
  return m;
}

function normalizeHeight(root, height) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const h = box.max.y - box.min.y;
  root.scale.multiplyScalar(height / h);
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
}

// Crea una persona a partir del modelo masculino (ropa recoloreable) o femenino.
export function makePerson(assets, { female = false, top, bottom, skin, shoes, hat = true, hair = '#2a1d14', height = 1.78 } = {}) {
  const src = female ? assets.female.scene : assets.male.scene;
  const root = SkeletonUtils.clone(src);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    const n = o.material.name || '';
    if (n.includes('Headwear') && !hat) { o.visible = false; return; }
    if (n.includes('Skin') && o.name.includes('Head') && !hat) { o.material = hairMaterial(o, skin, hair); return; }
    if (female) {
      if (top) o.material = tintMaterial(o.material, top, 0.25);
    } else if (n.includes('Outfit_Top') && top) o.material = tintMaterial(o.material, top);
    else if (n.includes('Outfit_Bottom') && bottom) o.material = tintMaterial(o.material, bottom);
    else if (n.includes('Footwear') && shoes) o.material = tintMaterial(o.material, shoes, 0.8);
    else if ((n.includes('Skin') || n.includes('Body')) && skin) {
      o.material = o.material.clone();
      o.material.color = new THREE.Color(skin);
    }
  });
  const wrap = new THREE.Group();
  wrap.add(root);
  normalizeHeight(wrap, female ? height * 0.94 : height);
  wrap.userData.root = root;
  return wrap;
}

// ---------- poses ----------
const rot = (root, name, x = 0, y = 0, z = 0) => {
  const b = bone(root, name);
  if (b) b.rotation.set(b.rotation.x + x, b.rotation.y + y, b.rotation.z + z);
};

export function poseSitting(person, { armsUp = false } = {}) {
  const r = person.userData.root;
  rot(r, 'LeftUpLeg', -1.5, 0, 0.08); rot(r, 'RightUpLeg', -1.5, 0, -0.08);
  rot(r, 'LeftLeg', -1.45); rot(r, 'RightLeg', -1.45);
  armsDown(r, armsUp);
  settle(person);
}

export function poseStanding(person, { armsUp = false } = {}) {
  armsDown(person.userData.root, armsUp);
  settle(person);
}

function armsDown(r, armsUp) {
  if (armsUp) {
    rot(r, 'LeftArm', 0, 0, -0.9); rot(r, 'RightArm', 0, 0, 0.9);
    rot(r, 'LeftForeArm', 0, 0, -0.4); rot(r, 'RightForeArm', 0, 0, 0.4);
  } else {
    rot(r, 'LeftArm', 0.25, 0, 1.15); rot(r, 'RightArm', 0.25, 0, -1.15);
    rot(r, 'LeftForeArm', 0, 0.6, 0.3); rot(r, 'RightForeArm', 0, -0.6, -0.3);
  }
}

// Apoya los pies en el suelo (y = 0) después de cambiar la pose.
function settle(person) {
  person.updateMatrixWorld(true);
  let minY = Infinity;
  for (const n of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) {
    const b = bone(person.userData.root, n);
    if (b) minY = Math.min(minY, b.getWorldPosition(new THREE.Vector3()).y);
  }
  if (isFinite(minY)) person.position.y -= minY - 0.03;
  person.updateMatrixWorld(true);
}

// ---------- atlas del público ----------
export const CROWD_TILE = { w: 0.9, h: 2.0 }; // metros que cubre cada celda

const SHIRTS = ['#f4f4f4', '#ffffff', '#1d2b53', '#e9e9e9', '#0e0e12', '#6b1f2b', '#c9a227', '#f4f4f4', '#3a4a6b', '#ffffff', '#202020', '#8a8f99'];
const PANTS = ['#1e2a3c', '#2b2b2b', '#3b4658', '#15181f', '#5a5246'];
const SKINS = ['#ffffff', '#f3d9c4', '#d9b08c', '#a87754', '#ffe7d6'];

export function crowdVariants() {
  const v = [];
  for (let i = 0; i < 16; i++) {
    v.push({
      top: SHIRTS[i % SHIRTS.length], bottom: PANTS[i % PANTS.length], skin: SKINS[(i * 3) % SKINS.length],
      shoes: '#222', hat: i % 4 === 0,
      hair: ['#1d140e', '#3b2716', '#0c0c0c', '#5a3b22', '#7a7a7a', '#2a1d14'][i % 6],
    });
  }
  return v;
}

// Renderiza cada variante sentada/de pie, de frente/de espaldas a una textura.
export function buildCrowdAtlas(renderer, assets, { tilePx = [96, 213] } = {}) {
  const variants = crowdVariants();
  const cols = variants.length, rows = 4; // fila: sentado-frente, sentado-espalda, pie-frente, pie-espalda
  const W = cols * tilePx[0], H = rows * tilePx[1];
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#555555', 1.6));
  const k1 = new THREE.DirectionalLight('#ffffff', 2.2); k1.position.set(1, 4, 3); scene.add(k1);
  const k2 = new THREE.DirectionalLight('#ffffff', 1.6); k2.position.set(-1, 4, -3); scene.add(k2);
  const cam = new THREE.OrthographicCamera(-CROWD_TILE.w / 2, CROWD_TILE.w / 2, CROWD_TILE.h, 0, 0.1, 20);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setScissorTest(true);

  variants.forEach((v, col) => {
    for (const standing of [false, true]) {
      const p = makePerson(assets, { ...v, height: 1.72 + (col % 3) * 0.05 });
      if (standing) poseStanding(p, { armsUp: col % 4 === 1 });
      else poseSitting(p);
      scene.add(p);
      for (const back of [false, true]) {
        cam.position.set(0, 0, back ? -5 : 5);
        cam.lookAt(0, 0, 0);
        cam.position.y = 0;
        const row = (standing ? 2 : 0) + (back ? 1 : 0);
        // Fila 0 arriba en la textura (v = 1)
        const y = (rows - 1 - row) * tilePx[1];
        renderer.setViewport(col * tilePx[0], y, tilePx[0], tilePx[1]);
        renderer.setScissor(col * tilePx[0], y, tilePx[0], tilePx[1]);
        renderer.render(scene, cam);
      }
      scene.remove(p);
    }
  });

  renderer.setScissorTest(false);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);
  renderer.setViewport(0, 0, renderer.domElement.width / renderer.getPixelRatio(), renderer.domElement.height / renderer.getPixelRatio());
  return { texture: rt.texture, cols, rows, variants };
}

// ---------- animación de jugadores ----------
export function retargetClips(assets, target) {
  const srcMesh = assets.anim.scene.getObjectByProperty('type', 'SkinnedMesh');
  const tgtMesh = target.getObjectByProperty('type', 'SkinnedMesh');
  const names = {};
  for (const b of tgtMesh.skeleton.bones) names[b.name] = 'mixamorig' + b.name;
  const out = { mesh: tgtMesh };
  for (const clipName of ['Idle', 'Run', 'Walk']) {
    const clip = assets.anim.animations.find((a) => a.name === clipName);
    if (!clip) continue;
    out[clipName] = SkeletonUtils.retargetClip(tgtMesh, srcMesh, clip, {
      names, hip: 'Hips', useFirstFramePosition: true, preserveBonePositions: true, fps: 30,
    });
  }
  return out;
}
