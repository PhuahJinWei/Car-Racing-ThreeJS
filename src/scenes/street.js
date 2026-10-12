import * as THREE from 'three';
import { buildWorld } from '../world/world-builder.js';
import { aimLampLights, castCarShadow } from '../world/car-light.js';
import { globalUniforms, MAX_HEADLIGHTS } from '../world/materials.js';
import { CarModel } from '../car/car-model.js';
import { getCarDef, CARS } from '../car/car-defs.js';
import { getCarAsset } from '../car/car-assets.js';
import { randomCustom } from '../car/customization.js';
import { Effects } from '../game/effects.js';
import { DEFAULT_FX } from '../core/postfx.js';
import { clamp, damp, smoothstep } from '../core/math.js';

// Backdrop for the title and the menus: your car parked at the kerb of Downtown Loop at night,
// headlights on, under the street lamps, while now and then a rival streaks past in the far lane.
// It is the real track, so it looks exactly like the races.

const TRACK = 'district';
const KERB = 1.25; // parked this far in from the road edge (m)
const WET = 1; // the street has just had rain: darker tarmac with the lights reflected in it

// camera framings in the parked car's space (+x = its left, the road side; +z = ahead). They look
// back down the street, so the road and its lamps run off into the distance behind the car.
// Portrait screens get their own, more head-on framing so the whole car fits the narrow view.
const VIEWS = {
  title: { pos: [3.2, 1.0, 11.5], look: [0.7, 1.05, -2.5], fov: 36, offset: 0, sway: 0.08, portrait: { pos: [1.7, 1.2, 12.5], look: [0.1, 1.1, -2.0], offsetY: 0.02 } },
  menu: { pos: [2.6, 1.05, 8.6], look: [0.4, 0.75, -0.6], fov: 32, offset: -0.2, sway: 0.06, portrait: { pos: [1.5, 1.25, 9.6], look: [-0.15, 0.75, 0.2], offsetY: 0.1 } },
  setup: { pos: [2.4, 1.3, -8.4], look: [0.3, 0.7, 1.5], fov: 32, offset: 0.22, sway: 0.05, portrait: { pos: [1.4, 1.4, -9.4], look: [-0.1, 0.75, 0.6], offsetY: 0.08 } },
};

const HEAD_POWER = 1.2; // parked: dipped lights, softer than on the move
const HEAD_POWER_PASSER = 1.6;
const HEAD_RANGE = 60;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _zero = new THREE.Vector3();

/** Place `obj` on the track at distance s, lateral offset d, facing along the track. */
function placeOnTrack(track, frame, s, d, obj) {
  const L = track.length;
  const f = track.frameAt(((s % L) + L) % L, frame);
  obj.position.set(f.px + f.rx * d, f.py + f.ry * d + track.rampHeight(f.s, d), f.pz + f.rz * d);
  const up = _v.set(f.ux, f.uy, f.uz).normalize();
  const fwd = _v2.set(f.tx, f.ty, f.tz).normalize();
  const left = new THREE.Vector3().crossVectors(up, fwd).normalize();
  fwd.crossVectors(left, up).normalize();
  _m.makeBasis(left, up, fwd);
  obj.quaternion.setFromRotationMatrix(_m);
  return f;
}

export class MenuStreet {
  constructor(app) {
    this.app = app;
    this.world = null;
    this.camera = new THREE.PerspectiveCamera(34, app.renderer.aspect, 0.1, 6500);
    this.fx = DEFAULT_FX();
    this.time = 0;
    this.viewName = 'menu';
    this.view = VIEWS.menu;
    this.camPos = new THREE.Vector3(...VIEWS.menu.pos);
    this.camLook = new THREE.Vector3(...VIEWS.menu.look);
    this.userYaw = 0;
    this.dragging = false;
    this.car = null;
    this.carId = null;
    this.customKey = null;
    this.frame = {};
    this.passers = [];
    this.passTimer = 3;
  }

  get built() {
    return !!this.world;
  }

  /** Build the street (cheap: one track, ~0.1 s on a desktop). */
  build() {
    if (this.world) return;
    const app = this.app;
    const q = app.renderer.preset;
    const world = buildWorld(app.renderer.renderer, TRACK, { reverse: false, mirror: false, weather: 'clear' }, q);
    this.world = world;
    this.track = world.track;
    this.scene = world.scene;
    // everything of ours hangs off one group, taken out again before the world is disposed
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.effects = new Effects(this.root, { particles: q.particles ?? 1, rain: false });

    const pal = world.palette;
    Object.assign(this.fx, {
      bloomStrength: 0.34,
      vignette: 0.55,
      reflect: WET ? 0.6 : 0.32,
      ca: 0.0008,
      grain: 0.02,
      blur: 0,
      exposure: (pal.exposure ?? 1) * 0.92,
      tint: pal.tint || [1, 1, 1],
      anamorphic: q.anamorphic ? 0.08 : 0,
    });

    // the parking spot: a long straight away from the start, under good light
    this.spotS = this._pickSpot();
    this.spotD = this.track.halfWidth - KERB;
    this.anchor = new THREE.Object3D();
    const f = placeOnTrack(this.track, this.frame, this.spotS, this.spotD, this.anchor);
    this.spotI = f.i;
    this.anchor.updateMatrixWorld(true);

    // real lights on the lamps over the car, and the street's glow from above
    this.lampLights = [];
    for (let k = 0; k < (q.carHQ ? 3 : 2); k++) {
      const L = new THREE.PointLight(0xffffff, 0, 24, 2);
      this.root.add(L);
      this.lampLights.push(L);
    }
    const p = this.anchor.position;
    aimLampLights(world, this.spotI, p.x, p.y, p.z, this.lampLights);
    this.probe = new THREE.PointLight(0xffffff, 0, 16, 1.6);
    world.lightAt(this.spotI, p.x, p.y, p.z, _c);
    const lum = _c.r * 0.3 + _c.g * 0.59 + _c.b * 0.11;
    const m = Math.max(_c.r, _c.g, _c.b, 0.001);
    this.probe.color.setRGB(_c.r / m, _c.g / m, _c.b / m);
    this.probe.intensity = clamp(lum, 0, 2.5) * 6;
    this.probe.position.copy(p).add(_v.set(0, 3.2, 0));
    this.root.add(this.probe);

    this.passers = [];
    this.passTimer = 2.5;
    if (this.carId) this.syncCar(this.carId, this.custom, true);
  }

  /** Free the street (before a race builds its own world). */
  dispose() {
    if (!this.world) return;
    for (const p of globalUniforms.uHeadParams.value) p.x = 0;
    this.scene.remove(this.root);
    if (this.car) this.car.dispose();
    this.car = null;
    for (const ps of this.passers) ps.model.dispose();
    this.passers = [];
    this.effects.dispose();
    this.world.dispose();
    this.world = null;
  }

  /** Make the parked car `carId` with `custom` (only rebuilt when something changed). */
  syncCar(carId, custom, force = false) {
    const key = JSON.stringify(custom || null);
    this.custom = custom;
    if (!this.world) {
      this.carId = carId;
      this.customKey = null;
      return;
    }
    if (!force && this.car && this.carId === carId) {
      if (this.customKey !== key) this.car.setCustomization(custom);
      this.customKey = key;
      return;
    }
    if (this.car) {
      this.root.remove(this.car.group);
      this.car.dispose();
    }
    const q = this.app.renderer.preset;
    this.carId = carId;
    this.customKey = key;
    this.car = new CarModel(getCarDef(carId), custom, { envMap: this.world.envMap, hq: q.carHQ, number: 7, liveryRes: Math.min(1024, q.liveryRes ?? 1024), asset: getCarAsset(carId) });
    this.car.group.position.copy(this.anchor.position);
    this.car.group.quaternion.copy(this.anchor.quaternion);
    // parked: no moving light streaks over the paint
    this.car.setStreaks(0, 0.05);
    this.root.add(this.car.group);
    this.car.group.updateMatrixWorld(true);
    const a = this.anchor.position;
    castCarShadow(this.world, this.car, this.spotI, a.x, a.y, a.z, 0);
  }

  setView(name) {
    if (!VIEWS[name]) return;
    this.viewName = name;
    this.view = VIEWS[name];
  }

  drag(dx) {
    this.userYaw = clamp(this.userYaw - dx * 0.006, -0.9, 0.9);
  }

  update(dt) {
    if (!this.world) return;
    this.time += dt;
    globalUniforms.uTime.value = this.time;
    globalUniforms.uWet.value = WET;
    this._updatePassers(dt);
    this._updateCamera(dt);
    this._updateHeadlights();
    if (this.car) {
      this.car.update(dt, { speed: 0, steer: 0, brake: false, boost: 0 });
      // cold-night exhaust vapour
      if (Math.random() < dt * 3) {
        const e = this.car.exhaustPos[Math.floor(Math.random() * this.car.exhaustPos.length)];
        _v.copy(e).applyMatrix4(this.car.body.matrixWorld);
        this.effects.puff(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3, [0.55, 0.56, 0.6], 0.05, 0.12, 0.9, 1.8);
      }
    }
    this.effects.update(dt, this.camera, _zero, 0);
    this.world.update(dt, this.camera);
  }

  render() {
    if (!this.world) return;
    this.app.renderer.render(this.scene, this.camera, this.fx, this.time);
  }

  // ---------------------------------------------------------------------------- internals
  _pickSpot() {
    const tr = this.track;
    const n = tr.n;
    const span = Math.ceil(45 / tr.ds);
    const frame = {};
    let best = null;
    for (let i = 0; i < n; i += 2) {
      const s = i * tr.ds;
      if (Math.min(s, tr.length - s) < 80) continue; // keep clear of the start gantry
      let ok = true;
      for (let j = -span; j <= span && ok; j++) {
        const jj = (i + j + n) % n;
        if (Math.abs(tr.kappa[jj]) > 1 / 400 || tr.tunnelFlags[jj]) ok = false;
      }
      if (!ok) continue;
      const f = tr.frameAt(s, frame);
      const d = tr.halfWidth - KERB;
      this.world.lightAt(i, f.px + f.rx * d, f.py + f.ry * d, f.pz + f.rz * d, _c);
      const lum = _c.r * 0.3 + _c.g * 0.59 + _c.b * 0.11;
      if (!best || lum > best.lum) best = { s, lum };
    }
    return best ? best.s : tr.length * 0.25;
  }

  _updateCamera(dt) {
    const v = this.view;
    const r = this.app.renderer;
    const portrait = r.aspect < 1;
    const f = portrait ? v.portrait : v;
    const k = 1 - Math.exp(-2.4 * dt);
    this.camPos.lerp(_v.set(f.pos[0], f.pos[1], f.pos[2]), k);
    this.camLook.lerp(_v.set(f.look[0], f.look[1], f.look[2]), k);
    if (!this.dragging) this.userYaw = damp(this.userYaw, 0, 0.5, dt);
    // gentle sway plus the player's orbit, around the car's vertical axis through the look point
    const yaw = this.userYaw + Math.sin(this.time * 0.13) * v.sway;
    const L = this.camLook;
    const ox = this.camPos.x - L.x;
    const oz = this.camPos.z - L.z;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    _v.set(L.x + ox * c + oz * s, this.camPos.y, L.z - ox * s + oz * c);
    _v.x = Math.max(_v.x, 0.9); // stay over the road, out of the shopfronts
    const cam = this.camera;
    cam.position.copy(_v).applyMatrix4(this.anchor.matrixWorld);
    cam.up.set(0, 1, 0);
    cam.lookAt(_v2.copy(L).applyMatrix4(this.anchor.matrixWorld));
    // framing: beside the menu panel in landscape, above the menu dock in portrait
    cam.fov = damp(cam.fov, v.fov * (portrait ? 1.5 : 1), 4, dt);
    this.offset = damp(this.offset ?? 0, portrait ? 0 : v.offset, 4, dt);
    this.offsetY = damp(this.offsetY ?? 0, portrait ? v.portrait.offsetY : 0, 4, dt);
    cam.setViewOffset(r.width, r.height, this.offset * r.width, this.offsetY * r.height, r.width, r.height);
    cam.aspect = r.width / r.height;
    cam.updateProjectionMatrix();
    // the road's mirror line for the screen-space reflections
    cam.getWorldDirection(_v);
    _v.y = 0;
    _v.normalize().multiplyScalar(1000).add(cam.position).project(cam);
    this.fx.horizon = clamp(_v.y * 0.5 + 0.5, 0.2, 0.95);
  }

  /** A rival streaks past in the far lane every few seconds, light trails and all. */
  _updatePassers(dt) {
    const tr = this.track;
    this.passTimer -= dt;
    if (this.passTimer <= 0 && !this.passers.some((p) => p.active)) {
      this.passTimer = 7 + Math.random() * 7;
      this._spawnPasser();
    }
    const time = this.effects.time;
    for (const ps of this.passers) {
      if (!ps.active) continue;
      ps.s += ps.v * dt;
      const m = ps.model;
      const f = placeOnTrack(tr, ps.frame, ps.s, ps.d, m.group);
      m.group.updateMatrixWorld(true);
      m.update(dt, { speed: ps.v, steer: 0, brake: false, boost: 0 });
      castCarShadow(this.world, m, f.i, m.group.position.x, m.group.position.y, m.group.position.z, 0);
      for (let k = 0; k < 2; k++) {
        _v.copy(m.tailLightPos[k]).applyMatrix4(m.body.matrixWorld);
        this.effects.trails.push(ps.trails[k], _v.x, _v.y, _v.z, time);
        ps.trails[k].intensity = 0.7;
        ps.trails[k].color.copy(m.trailColor).multiplyScalar(2);
      }
      // a whoosh as it goes by the camera
      const dCam = m.group.position.distanceTo(this.camera.position);
      if (!ps.whooshed && dCam < 14) {
        ps.whooshed = true;
        this.app.audio?.play('whoosh', { side: -1 });
      }
      ps.dist = dCam;
      if (ps.s > this.spotS + 260) {
        ps.active = false;
        m.group.visible = false;
        for (const t of ps.trails) t.pts.length = 0;
      }
    }
  }

  _spawnPasser() {
    // any rival car whose model has loaded
    const ready = CARS.filter((c) => getCarAsset(c.id));
    if (!ready.length) return;
    const def = ready[Math.floor(Math.random() * ready.length)];
    let ps = this.passers.find((p) => p.def.id === def.id);
    const rnd = Math.random;
    if (!ps) {
      const model = new CarModel(def, randomCustom(rnd), { envMap: this.world.envMap, hq: false, number: 10 + Math.floor(rnd() * 89), liveryRes: 512, asset: getCarAsset(def.id) });
      this.root.add(model.group);
      const tw = 0.06;
      ps = { def, model, frame: {}, trails: [this.effects.trails.create(tw, model.trailColor), this.effects.trails.create(tw, model.trailColor)] };
      if (!ps.trails[0] || !ps.trails[1]) {
        this.root.remove(model.group);
        model.dispose();
        return;
      }
      this.passers.push(ps);
    } else ps.model.setCustomization(randomCustom(rnd));
    ps.active = true;
    ps.whooshed = false;
    ps.s = this.spotS - 190;
    ps.v = 32 + rnd() * 14;
    ps.d = -(this.track.halfWidth - 2.3);
    ps.model.group.visible = true;
  }

  /** Headlights lighting the street: the parked car's, and a passing rival's. */
  _updateHeadlights() {
    const G = globalUniforms;
    const slots = [];
    if (this.car) slots.push({ model: this.car, obj: this.car.group, power: HEAD_POWER });
    for (const ps of this.passers) {
      if (!ps.active) continue;
      const fade = smoothstep(90, 60, ps.dist ?? 999);
      slots.push({ model: ps.model, obj: ps.model.group, power: HEAD_POWER_PASSER * fade });
    }
    for (let k = 0; k < MAX_HEADLIGHTS; k++) {
      const prm = G.uHeadParams.value[k];
      const sl = slots[k];
      if (!sl || sl.power <= 0) {
        prm.x = 0;
        continue;
      }
      const lamp = sl.model.headLamp;
      const fwd = _v.set(0, 0, 1).applyQuaternion(sl.obj.quaternion);
      const up = _v2.set(0, 1, 0).applyQuaternion(sl.obj.quaternion);
      G.uHeadPos.value[k].copy(sl.obj.position).addScaledVector(fwd, lamp.z).addScaledVector(up, lamp.y);
      G.uHeadFwd.value[k].copy(fwd);
      G.uHeadUp.value[k].copy(up);
      prm.set(sl.power, HEAD_RANGE, lamp.x, 0);
    }
  }
}
