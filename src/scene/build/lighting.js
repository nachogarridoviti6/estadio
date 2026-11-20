import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// Iluminación según la hora del partido: cielo físico + sol con sombras de
// día, focos del estadio de noche, y la mezcla de ambos al atardecer.
export class LightingRig {
  constructor(renderer, scene, cfg, { quality = 'high', nightEnv, nightSky } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.cfg = cfg;
    this.nightEnv = nightEnv;
    this.nightSky = nightSky;
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sky = new Sky();
    this.sky.scale.setScalar(2000);
    this.sky.material.uniforms.turbidity.value = 2.2;
    this.sky.material.uniforms.rayleigh.value = 2.2;
    this.sky.material.uniforms.mieCoefficient.value = 0.003;
    this.sky.material.uniforms.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight('#bcc8ff', '#202430', 0.55);
    scene.add(this.hemi);

    // Luz principal con sombras: el sol de día, el foco principal de noche
    const key = (this.key = new THREE.DirectionalLight('#fff6ea', 1.6));
    key.castShadow = true;
    const sz = quality === 'high' ? 4096 : 2048;
    key.shadow.mapSize.set(sz, sz);
    Object.assign(key.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 900 });
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.04;
    scene.add(key, key.target);

    // Focos de la cubierta (sin sombras)
    const rh = cfg.roof.height;
    this.floods = [[0, rh, -70], [90, rh, 0], [-90, rh, 0]].map((p) => {
      const l = new THREE.DirectionalLight('#fff6ea', 0.9);
      l.position.set(...p);
      scene.add(l);
      return l;
    });
  }

  // sunDir: vector unitario hacia el sol (ejes del modelo)
  update(sunDir, { lamps } = {}) {
    const elev = Math.asin(sunDir[1]) * 180 / Math.PI;
    const day = THREE.MathUtils.smoothstep(elev, -5, 12);   // 0 noche, 1 día
    const golden = THREE.MathUtils.smoothstep(elev, -2, 4) * (1 - THREE.MathUtils.smoothstep(elev, 8, 25));
    this.day = day;

    this.sky.visible = elev > -8;
    this.nightSky.visible = day < 0.6;
    this.sky.material.uniforms.sunPosition.value.set(sunDir[0], sunDir[1], sunDir[2]);

    const key = this.key;
    if (day > 0.15) {
      // Sol
      key.position.set(sunDir[0] * 400, Math.max(sunDir[1], 0.05) * 400, sunDir[2] * 400);
      key.color.set('#fff3e0').lerp(new THREE.Color('#ffb070'), golden);
      key.intensity = 4.2 * THREE.MathUtils.smoothstep(elev, -1, 10);
    } else {
      // Foco principal
      key.position.set(0, this.cfg.roof.height, 70);
      key.color.set('#fff6ea');
      key.intensity = 1.6;
    }
    key.target.position.set(0, 0, 0);
    for (const f of this.floods) f.intensity = 0.9 * (1 - day * 0.85);
    this.hemi.color.set('#bcc8ff').lerp(new THREE.Color('#b7d3ff'), day);
    this.hemi.groundColor.set('#202430').lerp(new THREE.Color('#5a5446'), day);
    this.hemi.intensity = 0.55 + day * 0.15;

    // Reflejos: cielo del momento de día, HDR nocturno de noche
    if (day > 0.3) {
      this.skyScene ||= new THREE.Scene();
      const s2 = this.sky.clone();
      this.skyScene.clear();
      this.skyScene.add(s2);
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromScene(this.skyScene, 0, 1, 3000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.3;
    } else {
      this.scene.environment = this.nightEnv;
      this.scene.environmentIntensity = 0.5;
    }
    const fogCol = new THREE.Color('#0b0f1c').lerp(new THREE.Color('#9fbde3'), day);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.near = THREE.MathUtils.lerp(450, 700, day);
    this.scene.fog.far = THREE.MathUtils.lerp(1300, 3200, day);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.0, 0.55, day);
    if (lamps) lamps.material.color.set('#fff6e0').multiplyScalar(6 * (1 - day * 0.8) + 0.5);
    return { day, elev };
  }
}
