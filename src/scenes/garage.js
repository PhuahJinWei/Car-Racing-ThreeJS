import * as THREE from 'three';
import { CarModel } from '../car/car-model.js';
import { getCarDef } from '../car/car-defs.js';
import { getCarAsset } from '../car/car-assets.js';
import { DEFAULT_FX } from '../core/postfx.js';
import { globalUniforms } from '../world/materials.js';
import { damp, clamp } from '../core/math.js';

const VIEWS = {
  title: { yaw: 0.9, pitch: 0.08, dist: 8.2, target: [0, 0.55, 0], offset: 0, fov: 34, auto: 0.12 },
  menu: { yaw: 0.65, pitch: 0.16, dist: 8.6, target: [0, 0.6, 0], offset: -0.2, fov: 34, auto: 0.08 },
  garage: { yaw: 0.75, pitch: 0.17, dist: 9.2, target: [0, 0.5, 0], offset: -0.13, offsetY: 0.11, offsetYP: 0.08, fov: 34, auto: 0.0 },
  setup: { yaw: -2.3, pitch: 0.1, dist: 9.4, target: [0, 0.6, 0], offset: 0.22, fov: 32, auto: 0.05 },
};

/** Dark photo-studio showroom used as the backdrop for every menu screen. */
export class Garage {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, app.renderer.aspect, 0.1, 400);
    this.fx = DEFAULT_FX();
    Object.assign(this.fx, { reflect: 0.6, vignette: 0.5, bloomStrength: 0.3, blur: 0, ca: 0.0005, anamorphic: 0.08, saturation: 1.0, horizon: 0.5 });
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
    s.background = new THREE.Color(0x020203);
    s.fog = new THREE.FogExp2(0x030304, 0.03);
    const white = new THREE.Color(1, 1, 1);
    const warm = new THREE.Color('#ffd2a1');

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
          col += vec3(0.11, 0.105, 0.1) * smoothstep(7.5, 0.0, r);
          col += vec3(0.5) * smoothstep(0.03, 0.0, abs(r - 3.05)) * 0.6;
          float refl = 0.62 * smoothstep(26.0, 2.0, r);
          gl_FragColor = vec4(col, 1.0 - refl);
        }`,
    });
    s.add(new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), floorMat));

    // turntable
    const tt = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.1, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: 0x0d0d10, metalness: 0.75, roughness: 0.3 }),
    );
    tt.position.y = 0.06;
    s.add(tt);
    this.turntable = tt;
    const ttRing = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.35, 1.3) }));
    ttRing.rotation.x = Math.PI / 2;
    ttRing.position.y = 0.12;
    s.add(ttRing);

    // overhead softbox and side strip lights (visible light sources, like a car photo studio)
    const soft = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.2), new THREE.MeshBasicMaterial({ color: white.clone().multiplyScalar(2.2), side: THREE.DoubleSide }));
    soft.rotation.x = Math.PI / 2;
    soft.position.y = 6.2;
    s.add(soft);
    const stripGeo = new THREE.BoxGeometry(0.12, 4.2, 0.12);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const m = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: (i % 2 ? warm : white).clone().multiplyScalar(1.4) }));
      m.position.set(Math.sin(a) * 10.5, 2.4, Math.cos(a) * 10.5);
      s.add(m);
    }
    // dark cyclorama wall
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.1, roughness: 0.9, side: THREE.BackSide });
    const back = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 14, 48, 1, true), wallMat);
    back.position.y = 7;
    s.add(back);

    // lights: soft key from above, warm rim behind, cool fill
    s.add(new THREE.HemisphereLight(0x8090a8, 0x050506, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 9, 4);
    s.add(key);
    const rim = new THREE.DirectionalLight(0xffc690, 1.4);
    rim.position.set(-6, 4, -7);
    s.add(rim);
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.7);
    fill.position.set(-7, 2, 5);
    s.add(fill);

    // studio environment for reflections: big softboxes + strip lights
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 24, 12), new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.BackSide })));
    const panel = (w, h, x, y, z, c, ry = 0, rx = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      env.add(m);
    };
    panel(16, 5, 0, 12, 0, white.clone().multiplyScalar(3.2), 0, Math.PI / 2);
    panel(16, 1.0, 0, 10, 7, white.clone().multiplyScalar(2.0), 0, Math.PI / 2);
    panel(16, 1.0, 0, 10, -7, white.clone().multiplyScalar(2.0), 0, Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      panel(0.9, 9, Math.sin(a) * 18, 4, Math.cos(a) * 18, (i % 2 ? warm : white).clone().multiplyScalar(1.8), a);
    }
    panel(40, 1.2, 0, 1.2, -20, warm.clone().multiplyScalar(0.6));
    const pmrem = new THREE.PMREMGenerator(this.app.renderer.renderer);
    this.envRT = pmrem.fromScene(env, 0.02, 0.1, 100);
    pmrem.dispose();
    s.environment = this.envRT.texture;
  }

  setCar(carId, custom) {
    if (this.car) {
      this.scene.remove(this.car.group);
      this.car.dispose();
    }
    const def = getCarDef(carId);
    this.carId = carId;
    this.car = new CarModel(def, custom, { envMap: this.envRT.texture, hq: true, number: 7, beams: false, liveryRes: this.app.renderer.preset?.liveryRes ?? 1024, asset: getCarAsset(carId) });
    this.car.group.position.y = 0.12;
    this.scene.add(this.car.group);
    this.spin = 1; // little showroom spin when switching cars
  }

  setCustom(custom) {
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
