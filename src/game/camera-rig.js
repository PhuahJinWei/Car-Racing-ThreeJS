import * as THREE from 'three';
import { clamp, damp, lerp, noise1, smoothstep, easeInOutCubic } from '../core/math.js';
import { makeFrame } from '../world/track.js';

const MODES = {
  chase: { dist: 5.4, height: 1.55, look: 0.85, ahead: 5, fov: 62, fovSpeed: 19 },
  near: { dist: 4.3, height: 1.38, look: 0.8, ahead: 6, fov: 66, fovSpeed: 22 },
  bumper: { dist: -1.9, height: 0.82, look: 0.7, ahead: 30, fov: 74, fovSpeed: 24 },
};
export const CAMERA_MODES = Object.keys(MODES);
// the cameras are set for a car this tall and this long (the Volt GT): a taller or longer car gets
// them raised and pulled back so the road still shows from as close ahead (see fitCar)
const REF_HEIGHT = 1.16;
const REF_HALF_LENGTH = 2.28;
const MAX_RAISE = 0.75;
// the widest the chase view gets: held at speed / on nitro, and briefly with a kick (degrees)
const FOV_MAX = 84;
const FOV_KICK_MAX = 92;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _left = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _look = new THREE.Vector3();
const _road = new THREE.Vector3();
const _side = new THREE.Vector3();

/**
 * Dynamic chase camera: lag in turns, surge on acceleration, FOV punch at speed and on boost,
 * dutch roll into corners, trauma-based shake, plus cinematic intro / orbit / trackside TV shots.
 */
export class CameraRig {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.mode = 'chase';
    this.dir = new THREE.Vector3(0, 0, 1);
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.fov = 62;
    this.fovKick = 0;
    this.trauma = 0;
    this.roll = 0;
    this.surge = 0;
    this.side = 0; // sideways lag in turns (m)
    this.lookBias = 0; // how far the view leans towards the road ahead (0..1)
    this.time = 0;
    this.shakeScale = 1;
    this.cine = null;
    this.blend = 1;
    this.frame = makeFrame();
    this.hint = 0;
    this.aspect = 16 / 9;
    this.hideCar = false;
    this._prevCine = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60 };
    this.initialized = false;
    // per chase camera: how much higher (h) and further back (d) it sits for this car
    this.fit = { chase: { h: 0, d: 0 }, near: { h: 0, d: 0 }, bumper: { h: 0, d: 0 } };
  }

  /**
   * Fit the chase cameras to the car: height = its highest point, halfLength = centre to tail (m).
   * The line of sight over the car's top should reach the road as close ahead as it does over the
   * Volt, so a tall car (a patrol car's light bar) doesn't hide the corners.
   */
  fitCar(height, halfLength) {
    for (const mode of ['chase', 'near']) {
      const cfg = MODES[mode];
      const d = Math.max(0, halfLength - REF_HALF_LENGTH);
      // where the sight line over the reference car meets the road, ahead of the car's centre
      const reach = (cfg.dist * REF_HEIGHT) / (cfg.height - REF_HEIGHT);
      const h = height + ((cfg.dist + d) * height) / reach;
      this.fit[mode] = { h: clamp(h - cfg.height, 0, MAX_RAISE), d };
    }
  }

  setMode(mode) {
    this.mode = mode;
  }

  cycleMode() {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
    return this.mode;
  }

  addTrauma(x) {
    this.trauma = Math.min(1, this.trauma + x);
  }

  kick(fovDegrees) {
    this.fovKick = Math.min(30, this.fovKick + fovDegrees);
  }

  startIntro(duration = 3.6) {
    this.cine = { type: 'intro', t: 0, duration };
  }

  startOrbit(duration = 3.5) {
    this.cine = { type: 'orbit', t: 0, duration, angle: 0.4 };
  }

  startTV() {
    this.cine = { type: 'tv', t: 0, spot: null };
  }

  /** A shot from a fixed point (world) that follows the car, framing about `frame` m around it. */
  spotShot(p, frame = 6, duration = 3) {
    this.cine = { type: 'spot', t: 0, p: p.clone(), frame, duration };
  }

  endCinematic(blendTime = 0.7) {
    if (!this.cine) return;
    this._prevCine.pos.copy(this.camera.position);
    _v.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this._prevCine.look.copy(this.camera.position).addScaledVector(_v, 10);
    this._prevCine.fov = this.camera.fov;
    this.cine = null;
    this.blend = 0;
    this.blendTime = blendTime;
  }

  _basis(t) {
    // car local axes in world: left, up, fwd
    _left.crossVectors(t.up, t.fwd).normalize();
    return _left;
  }

  /**
   * target: Vehicle-like { position, velocity, fwd, up, speed, topSpeed, boostLevel, drift, yawRate,
   * longAcc, grounded, airTime, hint }
   */
  update(dt, t) {
    this.time += dt;
    const cam = this.camera;
    const cfg = MODES[this.mode];
    const fit = this.fit[this.mode];
    const top = t.topSpeed || 80;
    const sp = clamp(t.speed / top, 0, 1.5);
    const boost = t.boostLevel || 0;
    const drifting = t.drift && t.drift.active;

    // ---- direction smoothing (follow velocity in drifts so we see the car's flank)
    const hx = t.fwd.x;
    const hz = t.fwd.z;
    let vx = t.velocity.x;
    let vz = t.velocity.z;
    const hs = Math.hypot(vx, vz);
    if (hs > 2) {
      vx /= hs;
      vz /= hs;
    } else {
      vx = hx;
      vz = hz;
    }
    const wVel = clamp(hs / 25, 0, 1) * (drifting ? 0.72 : 0.4);
    let dx = lerp(hx, vx, wVel);
    let dz = lerp(hz, vz, wVel);
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    if (!this.initialized) {
      this.dir.set(dx, 0, dz);
    }
    const rate = this.mode === 'bumper' ? 20 : drifting ? 3.2 : 5.5;
    this.dir.x = damp(this.dir.x, dx, rate, dt);
    this.dir.z = damp(this.dir.z, dz, rate, dt);
    this.dir.y = 0;
    this.dir.normalize();

    // ---- surge (camera falls behind when accelerating hard - on nitro too, for a moment, then it
    // tucks in low behind the car)
    const surgeT = clamp((t.longAcc || 0) * 0.045, -0.7, 0.8);
    this.surge = damp(this.surge, surgeT, 3.5, dt);

    // ---- base chase placement
    const P = t.position;
    let dist = cfg.dist + fit.d + (this.mode === 'bumper' ? 0 : this.surge - sp * 0.35 - boost * 0.35);
    let height = cfg.height + fit.h - (this.mode === 'bumper' ? 0 : sp * 0.18 + boost * 0.18);
    if (!t.grounded && t.airTime > 0.25 && this.mode !== 'bumper') {
      dist += Math.min(2.5, t.airTime * 2.5);
      height += Math.min(1.2, t.airTime);
    }
    const camUp = _v2.copy(_up).lerp(t.up, 0.45).normalize();
    const pos = _v.copy(P).addScaledVector(this.dir, -dist).addScaledVector(camUp, height);
    // ---- in a turn the camera swings wide (to the outside), so the car slides across the frame
    const sideT = this.mode === 'bumper' ? 0 : clamp((t.yawRate || 0) * hs * 0.0075, -0.85, 0.85);
    this.side = damp(this.side, sideT, 2.6, dt);
    pos.addScaledVector(_side.crossVectors(_up, this.dir).normalize(), -this.side);
    if (this.mode === 'bumper') {
      pos.copy(P).addScaledVector(t.fwd, 1.9).addScaledVector(t.up, cfg.height);
    }
    const look = _look.copy(P).addScaledVector(this.mode === 'bumper' ? t.fwd : this.dir, cfg.ahead + sp * 6).addScaledVector(camUp, cfg.look);
    // ---- lean the view towards where the road goes, so a corner shows up early (only while
    // driving along the track, on the ground)
    if (this.mode !== 'bumper' && t.s !== undefined && t.grounded !== false) {
      const rp = this.track.pointAt(t.s + 14 + sp * 14, (t.d || 0) * 0.6, _road, cfg.look + 0.3);
      const rx = rp.x - P.x;
      const rz = rp.z - P.z;
      const along = (rx * this.dir.x + rz * this.dir.z) / (Math.hypot(rx, rz) || 1);
      this.lookBias = damp(this.lookBias, along > 0.55 ? 0.3 : 0, 3, dt);
      look.lerp(rp, this.lookBias);
    }

    // ---- keep the camera inside walls / under tunnel roofs
    if (this.mode !== 'bumper') {
      const f = this.track.project(pos.x, pos.z, t.hint ?? this.hint, this.frame);
      this.hint = f.i;
      const W = this.track.halfWidth + 0.3;
      if (Math.abs(f.d) > W) {
        const k = (Math.abs(f.d) - W) * Math.sign(f.d);
        const hl = Math.hypot(f.rx, f.rz) || 1;
        pos.x -= (f.rx / hl) * k;
        pos.z -= (f.rz / hl) * k;
      }
      const minY = f.y + 0.6;
      if (pos.y < minY) pos.y = minY;
      if (f.tunnel) pos.y = Math.min(pos.y, f.y + 6.5);
    }

    // ---- roll + fov
    const rollT = this.mode === 'bumper' ? clamp(-t.yawRate * hs * 0.002, -0.1, 0.1) : clamp(-t.yawRate * hs * 0.0032, -0.15, 0.15) + (drifting ? t.drift.dir * 0.05 : 0);
    this.roll = damp(this.roll, rollT, 4, dt);
    // (wide at speed and on nitro, but held below FOV_MAX so the car stays big in the frame; the
    // nitro's punch is a brief kick past it)
    const fovT = Math.min(FOV_MAX, cfg.fov + cfg.fovSpeed * Math.pow(Math.min(sp, 1.2), 1.4) + 6 * boost);
    this.fov = damp(this.fov, fovT, 2.6, dt);
    this.fovKick = damp(this.fovKick, 0, 3.2, dt);

    // ---- shake
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    const shake = (this.trauma * this.trauma + Math.pow(Math.min(sp, 1.3), 2.2) * 0.06 + boost * 0.18) * this.shakeScale;
    const ts = this.time * 23;
    const sx = noise1(ts) * shake * 0.22;
    // (plus a fine road buzz that builds with speed)
    const sy = noise1(ts + 31.7) * shake * 0.16 + noise1(ts * 2.7 + 13.1) * Math.pow(Math.min(sp, 1.3), 2) * 0.014 * this.shakeScale;
    const sr = noise1(ts + 77.1) * shake * 0.025;

    let finalPos = pos;
    let finalLook = look;
    let finalFov = Math.min(FOV_KICK_MAX, this.fov + this.fovKick);
    let finalRoll = this.roll + sr;

    // ---- cinematics
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const left = this._basis(t);
      if (c.type === 'intro') {
        const u = clamp(c.t / c.duration, 0, 1);
        // keyframes in car space: [left, up, fwd], look offset, fov
        const keys = [
          { p: [2.6, 0.45, 6.5], l: [0, 0.5, 0], fov: 38 },
          { p: [5.0, 0.9, 1.0], l: [0, 0.6, 0], fov: 44 },
          { p: [2.0, 2.6, -7.5], l: [0, 0.8, 2], fov: 52 },
          { p: [0, cfg.height + fit.h, -cfg.dist - fit.d], l: [0, cfg.look, cfg.ahead], fov: cfg.fov },
        ];
        const seg = Math.min(keys.length - 2, Math.floor(u * (keys.length - 1)));
        const lu = easeInOutCubic(u * (keys.length - 1) - seg);
        const a = keys[seg];
        const b = keys[seg + 1];
        const lp = (k, arr) => arr.map((v, i) => lerp(k.p[i], v, 0));
        const cp = [0, 1, 2].map((i) => lerp(a.p[i], b.p[i], lu));
        const cl = [0, 1, 2].map((i) => lerp(a.l[i], b.l[i], lu));
        void lp;
        finalPos = new THREE.Vector3().copy(P).addScaledVector(left, cp[0]).addScaledVector(t.up, cp[1]).addScaledVector(t.fwd, cp[2]);
        finalLook = new THREE.Vector3().copy(P).addScaledVector(left, cl[0]).addScaledVector(t.up, cl[1]).addScaledVector(t.fwd, cl[2]);
        finalFov = lerp(a.fov, b.fov, lu);
        finalRoll = 0;
        if (c.t >= c.duration) this.cine = null;
      } else if (c.type === 'orbit') {
        c.angle += dt * 0.55;
        const r = 6.5;
        finalPos = new THREE.Vector3()
          .copy(P)
          .addScaledVector(left, Math.sin(c.angle) * r)
          .addScaledVector(t.fwd, Math.cos(c.angle) * r)
          .addScaledVector(_up, 1.6);
        finalLook = new THREE.Vector3().copy(P).addScaledVector(_up, 0.6);
        finalFov = 48;
        finalRoll = 0;
      } else if (c.type === 'spot') {
        finalPos = c.p.clone();
        finalLook = new THREE.Vector3().copy(P).addScaledVector(_up, 0.55);
        finalFov = clamp((2 * Math.atan(c.frame / finalPos.distanceTo(finalLook)) * 180) / Math.PI, 14, 62);
        finalRoll = 0;
        if (c.t >= c.duration) this.endCinematic(0.35);
      } else if (c.type === 'tv') {
        if (!c.spot || this.track.deltaS(t.s, c.spot.s) > 28) {
          const ahead = 70 + Math.random() * 60;
          const s = t.s + ahead;
          const side = Math.random() < 0.5 ? -1 : 1;
          const d = side * (this.track.halfWidth + 5 + Math.random() * 7);
          const p = this.track.pointAt(s, d, new THREE.Vector3(), 2.5 + Math.random() * 4);
          if (this.track.isTunnelAt(s)) {
            this.track.pointAt(s, side * (this.track.halfWidth - 1), p, 3.2);
          }
          c.spot = { s, p };
        }
        finalPos = c.spot.p.clone();
        finalLook = new THREE.Vector3().copy(P).addScaledVector(_up, 0.6);
        const dist2 = finalPos.distanceTo(finalLook);
        finalFov = clamp((2 * Math.atan(5.5 / dist2) * 180) / Math.PI, 9, 55);
        finalRoll = 0;
      }
    }

    // ---- blend out of cinematics
    if (this.blend < 1 && !this.cine) {
      this.blend = Math.min(1, this.blend + dt / (this.blendTime || 0.7));
      const b = smoothstep(0, 1, this.blend);
      finalPos = this._prevCine.pos.clone().lerp(finalPos, b);
      finalLook = this._prevCine.look.clone().lerp(finalLook, b);
      finalFov = lerp(this._prevCine.fov, finalFov, b);
    }

    cam.position.copy(finalPos);
    cam.position.x += sx;
    cam.position.y += sy;
    _m.lookAt(cam.position, finalLook, _up);
    cam.quaternion.setFromRotationMatrix(_m);
    cam.rotateZ(finalRoll);
    this._applyFov(finalFov);
    this.hideCar = this.mode === 'bumper' && !this.cine;
    this.initialized = true;
  }

  _applyFov(vfovLandscape) {
    const cam = this.camera;
    // On narrow (portrait) screens keep a minimum horizontal field of view.
    const a = cam.aspect;
    let v = vfovLandscape;
    if (a < 1.3) {
      const hMin = 2 * Math.atan(Math.tan(((vfovLandscape * Math.PI) / 180) / 2) * 1.3);
      v = Math.max(v, ((2 * Math.atan(Math.tan(hMin / 2) / a)) * 180) / Math.PI);
      v = Math.min(v, 105);
    }
    if (Math.abs(cam.fov - v) > 0.01) {
      cam.fov = v;
      cam.updateProjectionMatrix();
    }
  }
}
