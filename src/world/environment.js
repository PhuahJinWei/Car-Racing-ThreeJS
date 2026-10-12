import * as THREE from 'three';
import { createSkyMaterial, createSkylineMaterial, globalUniforms } from './materials.js';

/**
 * Generates a neon "studio" environment map used for car paint / glass reflections.
 * Rendered once per scene with PMREM, so it costs nothing per frame.
 */
export function createEnvMap(renderer, palette, opts = {}) {
  const scene = new THREE.Scene();
  const top = new THREE.Color(palette.skyTop);
  const hor = new THREE.Color(palette.skyHorizon);
  const glow = new THREE.Color(palette.skyGlow);
  const ground = new THREE.Color(palette.ground ?? '#050308');
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTop: { value: top.clone().multiplyScalar(1.5) },
      uHor: { value: hor.clone().multiplyScalar(1.6) },
      uGlow: { value: glow.clone().multiplyScalar(1.2) },
      uGround: { value: ground },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uGround;
      varying vec3 vP;
      void main(){
        vec3 d = normalize(vP);
        vec3 c = d.y > 0.0 ? mix(uHor, uTop, pow(d.y, 0.5)) : mix(uHor * 0.4, uGround, pow(-d.y, 0.4));
        c += uGlow * exp(-abs(d.y) * 10.0) * 0.8;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), domeMat));

  const strip = (color, intensity, w, h, x, y, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    scene.add(m);
  };
  // street lights overhead (two rows) and a soft city glow on the horizon
  const lamp = palette.lamp ?? '#ffb066';
  const lamp2 = palette.lamp2 ?? '#e4ecff';
  for (let i = 0; i < 10; i++) {
    const z = -36 + i * 8;
    strip(i % 3 === 0 ? lamp2 : lamp, opts.softbox ?? 2.6, 1.2, 0.5, -7, 16, z, 0, Math.PI / 2);
    strip(i % 3 === 1 ? lamp2 : lamp, opts.softbox ?? 2.6, 1.2, 0.5, 7, 16, z + 4, 0, Math.PI / 2);
  }
  // a broad, dim overhead panel so roofs and hoods catch some light
  strip('#9aa6c0', 0.35, 30, 12, 0, 24, 0, 0, Math.PI / 2);
  // distant lit windows around the horizon
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    strip(i % 4 === 0 ? lamp2 : '#ffd2a0', 0.7 + (i % 3) * 0.3, 3 + (i % 5), 1.5 + (i % 4), Math.sin(a) * 42, 2 + (i % 6), Math.cos(a) * 42, a);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035, 0.1, 200);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return rt;
}

/**
 * Sky dome, skyline ring, fog, lights. Returns { group, update(camera), dispose }.
 */
export function createEnvironment(scene, palette, opts = {}) {
  const group = new THREE.Group();
  group.name = 'environment';
  scene.add(group);

  // Fog (shared with custom shaders through globalUniforms)
  const fogColor = new THREE.Color(palette.fog);
  globalUniforms.uFogColor.value.copy(fogColor);
  globalUniforms.uFogDensity.value = palette.fogDensity * (opts.fogMul ?? 1);
  scene.fog = new THREE.FogExp2(fogColor, globalUniforms.uFogDensity.value);
  scene.background = fogColor.clone();
  globalUniforms.uAmbient.value.set(palette.ambient);
  globalUniforms.uSkyGlow.value.set(palette.skyGlow);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), createSkyMaterial({ ...palette, stars: (palette.stars ?? 0.2) * (opts.stars ?? 1), clouds: Math.min(1, (palette.clouds ?? 0.5) * (opts.clouds ?? 1)) }));
  sky.frustumCulled = false;
  sky.renderOrder = 1000;
  sky.material.fog = false;
  group.add(sky);

  let skyline = null;
  if (opts.skyline !== false) {
    const geo = new THREE.CylinderGeometry(2400, 2400, 900, 96, 1, true);
    geo.translate(0, 450 - (opts.skylineDrop ?? 60), 0);
    skyline = new THREE.Mesh(geo, createSkylineMaterial(palette, { density: opts.skylineDensity ?? 1, height: opts.skylineHeight ?? 0.55 }));
    skyline.frustumCulled = false;
    skyline.renderOrder = 999;
    group.add(skyline);
  }

  // Lights: cheap hemisphere + moon. Most light comes from baked/emissive surfaces.
  const hemi = new THREE.HemisphereLight(new THREE.Color(palette.ambient).multiplyScalar(1.2), new THREE.Color(palette.ground ?? '#050308'), opts.hemi ?? 1.2);
  group.add(hemi);
  const moon = new THREE.DirectionalLight(new THREE.Color(opts.moonColor ?? '#8ea2c8'), opts.moon ?? 0.7);
  moon.position.set(-300, 600, 200);
  group.add(moon);
  group.add(moon.target);

  return {
    group,
    sky,
    skyline,
    hemi,
    moon,
    update(camera) {
      sky.position.copy(camera.position);
      if (skyline) {
        skyline.position.x = camera.position.x;
        skyline.position.z = camera.position.z;
        skyline.position.y = opts.skylineY ?? 0;
      }
    },
    dispose() {
      sky.geometry.dispose();
      sky.material.dispose();
      if (skyline) {
        skyline.geometry.dispose();
        skyline.material.dispose();
      }
    },
  };
}
