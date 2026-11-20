import * as THREE from 'three';
import { CROWD_TILE } from './humans.js';

// Público: una "foto" (impostor) por espectador, orientada hacia el campo.
// El shader elige la foto de frente o de espaldas según desde dónde mires, y
// la de pie para la grada de animación.
export function buildCrowd(venue, atlas, scene) {
  const people = venue.seats.filter((s) => s.sold);
  const geo = new THREE.PlaneGeometry(CROWD_TILE.w, CROWD_TILE.h);
  geo.translate(0, CROWD_TILE.h / 2, 0);

  const variant = new Float32Array(people.length);
  const standing = new Float32Array(people.length);
  const shade = new Float32Array(people.length);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uAtlas: { value: null }, uGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) }, uLight: { value: 1.0 }, uTime: { value: 0 } },
    ]),
    vertexShader: /* glsl */ `
      attribute float aVariant; attribute float aStanding; attribute float aShade;
      uniform vec2 uGrid; uniform float uTime;
      varying vec2 vUv; varying float vShade;
      #include <fog_pars_vertex>
      void main() {
        mat4 im = modelMatrix * instanceMatrix;
        vec3 center = (im * vec4(0.0, 1.0, 0.0, 1.0)).xyz;
        vec3 facing = normalize((im * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        float back = step(dot(cameraPosition - center, facing), 0.0);
        float row = aStanding * 2.0 + back;
        vec2 uv0 = uv;
        if (back > 0.5) uv0.x = 1.0 - uv0.x;
        if (aShade > 1.5) uv0.x = 1.0 - uv0.x;  // variantes en espejo para que no se repitan
        vUv = (vec2(aVariant, uGrid.y - 1.0 - row) + uv0) / uGrid;
        vShade = aShade > 1.5 ? aShade - 2.0 : aShade;
        vec3 p = position;
        // la grada de animación bota
        p.y += aStanding * max(0.0, sin(uTime * 7.0 + aVariant * 1.7 + center.x * 0.3)) * 0.12;
        vec4 mvPosition = viewMatrix * im * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas; uniform float uLight;
      varying vec2 vUv; varying float vShade;
      #include <fog_pars_fragment>
      void main() {
        vec4 c = texture2D(uAtlas, vUv);
        if (c.a < 0.45) discard;
        gl_FragColor = vec4(c.rgb / max(c.a, 0.001) * uLight * vShade, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    side: THREE.DoubleSide,
    fog: true,
  });
  mat.uniforms.uAtlas.value = atlas.texture;

  const mesh = new THREE.InstancedMesh(geo, mat, people.length);
  const m = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  people.forEach((s, i) => {
    const n = new THREE.Vector3(...s.normal);
    const facing = n.clone().negate();               // mira al campo
    const right = up.clone().cross(facing).normalize();
    m.makeBasis(right, up, facing);
    // El atlas tiene los pies en el suelo; los sentados, algo adelantados
    m.setPosition(s.pos[0] - n.x * 0.12, s.pos[1], s.pos[2] - n.z * 0.12);
    mesh.setMatrixAt(i, m);
    const h = (s.idx * 2654435761) >>> 0;
    variant[i] = h % atlas.cols;
    standing[i] = s.standing ? 1 : 0;
    // brillo 0.82-1.12 y, codificado sumando 2, si la variante va en espejo
    shade[i] = 0.82 + ((h >>> 8) % 100) / 100 * 0.3 + ((h >>> 16) % 2 ? 2 : 0);
  });
  geo.setAttribute('aVariant', new THREE.InstancedBufferAttribute(variant, 1));
  geo.setAttribute('aStanding', new THREE.InstancedBufferAttribute(standing, 1));
  geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1));
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
