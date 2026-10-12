import * as THREE from 'three';
import { CarModel } from '../car/car-model.js';
import { getCarDef } from '../car/car-defs.js';
import { getCarAsset, ensureCarAssets, trimCarAssets } from '../car/car-assets.js';
import { DEFAULT_FX } from '../core/postfx.js';
import { globalUniforms } from '../world/materials.js';
import { damp, clamp } from '../core/math.js';

const VIEWS = {
  title: { yaw: 0.9, pitch: 0.08, dist: 8.2, target: [0, 0.55, 0], offset: 0, fov: 34, auto: 0.12 },
  menu: { yaw: 0.65, pitch: 0.16, dist: 8.6, target: [0, 0.6, 0], offset: -0.2, fov: 34, auto: 0.08 },
  garage: { yaw: 0.75, pitch: 0.17, dist: 9.2, target: [0, 0.5, 0], offset: -0.13, offsetY: 0.11, offsetYP: 0.08, fov: 34, auto: 0.0 },
  setup: { yaw: -2.3, pitch: 0.1, dist: 9.4, target: [0, 0.6, 0], offset: 0.22, fov: 32, auto: 0.05 },
};

/** Dark grey photo-studio showroom: the garage screen's backdrop. */
export class Garage {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, app.renderer.aspect, 0.1, 400);
    this.fx = DEFAULT_FX();
    Object.assign(this.fx, { reflect: 0.6, vignette: 0.38, bloomStrength: 0.16, blur: 0, ca: 0.0005, anamorphic: 0, saturation: 1.0, horizon: 0.5 });
    this.time = 0;
    this.view = { ...VIEWS.menu };
    this.viewName = 'menu';
    this.yaw = this.view.yaw;
    this.pitch = this.view.pitch;
    this.dist = this.view.dist;
    this.offset = this.view.offset;
    this.offsetY = 0;
    this.userYaw = 0;
    this.dragging = false;
    this.spin = 0;
    this._build();
  }

  _build() {
    const s = this.scene;
    // deep charcoal rather than black: dark paint and the car's silhouette still read against it
    const bg = new THREE.Color(0x0b0c0f);
    s.background = bg;
    s.fog = new THREE.FogExp2(bg, 0.03);

    // dark polished studio floor with a soft pool of light under the car
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vW;
        float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main(){
          vec2 p = vW.xz;
          float r = length(p);
          vec3 col = vec3(0.012, 0.012, 0.014) * (0.85 + 0.3 * h(floor(p * 30.0)));
          col += vec3(0.16, 0.16, 0.17) * smoothstep(10.0, 0.0, r);
          col += vec3(0.5) * smoothstep(0.03, 0.0, abs(r - 3.05)) * 0.6;
          float refl = 0.62 * smoothstep(26.0, 2.0, r);
          gl_FragColor = vec4(col, 1.0 - refl);
        }`,
    });
    s.add(new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), floorMat));

    // turntable: dark grey satin, so the tyres stand out and it doesn't mirror the lights into a
    // hot spot under the car
    const tt = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.1, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: 0x2c2e33, metalness: 0.1, roughness: 0.5 }),
    );
    tt.position.y = 0.06;
    s.add(tt);
    this.turntable = tt;
    const ttRing = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.35, 1.3) }));
    ttRing.rotation.x = Math.PI / 2;
    ttRing.position.y = 0.12;
    s.add(ttRing);

    // cyclorama wall, graded: lighter toward the floor so roofs and spoilers stand out against it,
    // fading into the background colour higher up
    const wallGeo = new THREE.CylinderGeometry(15, 15, 14, 48, 10, true);
    const wp = wallGeo.attributes.position;
    const wallCol = [];
    for (let i = 0; i < wp.count; i++) {
      const c = Math.exp(-(wp.getY(i) + 7) / 2.6);
      wallCol.push(bg.r + 0.011 * c, bg.g + 0.011 * c, bg.b + 0.012 * c);
    }
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
    const back = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    back.position.y = 7;
    s.add(back);

    // the car is lit like in a real car studio: by the softboxes in the environment below, plus a
    // soft sky light. No point-like lights: on glossy clear coat even a weak one makes a tiny,
    // blinding glint that blooms into a halo (a warm rim light here used to flare amber).
    s.add(new THREE.HemisphereLight(0x9aa6b8, 0x121214, 1.2));

    // reflections: a car-photo studio inside a graded grey cove (only reflected, never seen
    // directly) - a big light ceiling for roofs, hoods and glass at any camera angle, a long
    // softbox either side for a highlight line down each flank, low strips front and back, a soft
    // band of light around the horizon and a ring of tall strips, which chrome needs to read
    const env = new THREE.Scene();
    const cove = new THREE.SphereGeometry(30, 48, 24);
    const cp = cove.attributes.position;
    const coveCol = [];
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i) / 30;
      const c = y > 0 ? 0.12 - 0.1 * y : 0.05 + 0.035 * y;
      coveCol.push(c, c, c * 1.08);
    }
    cove.setAttribute('color', new THREE.Float32BufferAttribute(coveCol, 3));
    env.add(new THREE.Mesh(cove, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 3, 64, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.45, 0.47), side: THREE.BackSide }));
    band.position.y = 2.2;
    env.add(band);
    const panel = (w, h, x, y, z, k, ry = 0, rx = 0, tint = [1, 1, 1]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint[0] * k, tint[1] * k, tint[2] * k), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      env.add(m);
    };
    panel(24, 20, 0, 9, 0, 1.0, 0, Math.PI / 2);
    panel(14, 2.6, 12, 2.4, 0, 1.8, Math.PI / 2);
    panel(14, 2.6, -12, 2.4, 0, 1.8, Math.PI / 2);
    panel(10, 1.2, 0, 1.2, 12, 1.2);
    panel(12, 2.2, 0, 3.2, -12, 1.0, 0, 0, [0.95, 1, 1.08]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      panel(0.8, 7, Math.sin(a) * 16, 3.5, Math.cos(a) * 16, 1.5, a);
    }
    const pmrem = new THREE.PMREMGenerator(this.app.renderer.renderer);
    this.envRT = pmrem.fromScene(env, 0.02, 0.1, 100);
    pmrem.dispose();
    s.environment = this.envRT.texture;
  }

  /**
   * Put `carId` on the turntable with `custom`. A car whose model hasn't been downloaded yet is
   * fetched first, with the turntable empty meanwhile; resolves once that's settled.
   */
  setCar(carId, custom) {
    if (this.car) {
      this.scene.remove(this.car.group);
      this.car.dispose();
      this.car = null;
    }
    this.carId = carId;
    this.custom = custom;
    if (!getCarDef(carId).model || getCarAsset(carId)) {
      this._placeCar();
      return Promise.resolve();
    }
    return ensureCarAssets([carId], this.app.renderer.renderer).then(() => {
      // still the one wanted, and not mid-race (leaving a race puts your car back anyway)
      if (this.carId === carId && !this.car && this.app.state !== 'race' && this.app.state !== 'loading') this._placeCar();
    });
  }

  _placeCar() {
    const def = getCarDef(this.carId);
    this.car = new CarModel(def, this.custom, { envMap: this.envRT.texture, hq: true, number: 7, beams: false, liveryRes: this.app.renderer.preset?.liveryRes ?? 1024, asset: getCarAsset(this.carId) });
    this.car.group.position.y = 0.12;
    // the studio's own softboxes do the reflections here; the moving street-light streaks are a
    // racing effect and, frozen in place, they turn the glass into a chrome band
    this.car.setStreaks(0, 0.05);
    this.scene.add(this.car.group);
    this.spin = 1; // little showroom spin when switching cars
    // (cars browsed earlier and no longer shown are freed, bar the last few)
    trimCarAssets();
  }

  setCustom(custom) {
    this.custom = custom;
    if (this.car) this.car.setCustomization(custom);
  }

  setView(name) {
    if (!VIEWS[name]) return;
    this.viewName = name;
    this.view = { ...VIEWS[name] };
  }

  drag(dx, dy) {
    this.userYaw -= dx * 0.008;
    this.pitch = clamp(this.pitch + dy * 0.004, 0.02, 0.6);
  }

  update(dt) {
    this.time += dt;
    globalUniforms.uTime.value = this.time;
    const v = this.view;
    this.userYaw += v.auto * dt + this.spin * dt * 3;
    this.spin = damp(this.spin, 0, 2, dt);
    this.yaw = damp(this.yaw, v.yaw + this.userYaw, 4, dt);
    if (!this.dragging) this.pitch = damp(this.pitch, v.pitch, 1.5, dt);
    this.dist = damp(this.dist, v.dist, 3, dt);
    this.offset = damp(this.offset, v.offset, 4, dt);
    const cam = this.camera;
    const tx = v.target[0];
    const ty = v.target[1];
    const tz = v.target[2];
    cam.position.set(tx + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, ty + Math.sin(this.pitch) * this.dist + 0.4, tz + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    cam.lookAt(tx, ty, tz);
    cam.fov = damp(cam.fov, v.fov * (this.app.renderer.aspect < 1 ? 1.5 : 1), 4, dt);
    // shift the projection so the car sits beside the menu panel
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    // ...and vertically, so it clears the logo / bottom dock of each screen
    const portrait = this.app.renderer.aspect < 1;
    const off = portrait ? 0 : this.offset;
    this.offsetY = damp(this.offsetY, (portrait ? v.offsetYP : v.offsetY) ?? 0, 4, dt);
    cam.setViewOffset(w, h, off * w, this.offsetY * h, w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    if (this.car) {
      this.car.update(dt, { speed: 0, steer: Math.sin(this.time * 0.5) * 0.3, brake: false, boost: 0 });
    }
    this.turntable.rotation.y += dt * 0.1;
  }

  render() {
    this.app.renderer.render(this.scene, this.camera, this.fx, this.time);
  }
}
