import * as THREE from 'three';
import { clamp, damp, dampAngle, angleWrap, lerp } from '../core/math.js';
import { makeFrame } from '../world/track.js';

const GRAVITY = 24;
const CAR_HALF_W = 1.0;

/**
 * Arcade vehicle dynamics in world space (x/z plane) with the track providing height,
 * banking and walls. Tuned for feel, not realism: big grip, controllable drifts that charge
 * mini-turbos, strong boosts, natural jumps off crests and ramps.
 */
export class Vehicle {
  constructor(track, def) {
    this.track = track;
    this.def = def;
    this.stats = def.stats;
    this.frame = makeFrame();
    this.reset();
  }

  reset() {
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.heading = 0;
    this.yawRate = 0;
    this.vf = 0;
    this.vl = 0;
    this.speed = 0;
    this.hint = 0;
    this.s = 0;
    this.d = 0;
    this.grounded = true;
    this.airTime = 0;
    this.groundPrev = 0;
    this.drift = { active: false, dir: 0, time: 0, slip: 0, tier: 0 };
    this.boostTime = 0;
    this.boostLevel = 0;
    this.boostKind = '';
    this.nitro = 1;
    this.nitroMax = 3;
    this.slipstream = 0;
    this.wallContact = 0;
    this.events = [];
    this.longAcc = 0;
    this.latAcc = 0;
    this.roll = 0;
    this.pitch = 0;
    this.rpm = 0.2;
    this.gear = 1;
    this.frozen = false;
    this.steerVis = 0;
    this.braking = false;
    this.offTrackTimer = 0;
    this.wrongWay = 0;
    this.up = new THREE.Vector3(0, 1, 0);
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.quat = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this._airUp = new THREE.Vector3(0, 1, 0);
    this._padCooldown = 0;
  }

  /** Place on the track at distance s, lateral offset d, facing along the track. */
  placeAt(s, d = 0, speed = 0) {
    const f = this.track.frameAt(s, this.frame);
    this.hint = f.i;
    this.x = f.px + f.rx * d;
    this.z = f.pz + f.rz * d;
    this.heading = Math.atan2(f.tx, f.tz);
    this.vx = Math.sin(this.heading) * speed;
    this.vz = Math.cos(this.heading) * speed;
    this.yawRate = 0;
    this.vy = 0;
    this.track.project(this.x, this.z, this.hint, this.frame);
    this.y = this.frame.y;
    this.groundPrev = this.y;
    this.grounded = true;
    this.airTime = 0;
    this.drift.active = false;
    this.s = this.frame.s;
    this.d = this.frame.d;
    this._updateOrientation(0.016, true);
  }

  addNitro(amount) {
    this.nitro = clamp(this.nitro + amount, 0, this.nitroMax);
  }

  /** Fire a nitro charge. Returns true if it fired. */
  fireNitro() {
    if (this.nitro < 1 || this.frozen) return false;
    this.nitro -= 1;
    this.boostTime = Math.min(4.5, Math.max(this.boostTime, 0) + 2.3 * this.stats.nitro);
    this.boostKind = 'nitro';
    this.events.push({ type: 'nitro' });
    return true;
  }

  giveBoost(seconds, kind) {
    this.boostTime = Math.max(this.boostTime, seconds);
    this.boostKind = kind;
  }

  get topSpeed() {
    return this.stats.topSpeed;
  }

  step(dt, inp) {
    const st = this.stats;
    const tr = this.track;
    const f = this.frame;

    // ---------------- inputs
    let steer = inp.steer;
    let throttle = this.frozen ? 0 : inp.throttle;
    let brake = this.frozen ? 0 : inp.brake;
    const speedAbs = Math.hypot(this.vx, this.vz);
    // Combined drift/brake button: steering -> drift, straight -> brake
    const driftBtn = inp.drift && !this.frozen;
    if (driftBtn && Math.abs(steer) < 0.25 && !this.drift.active) brake = Math.max(brake, 0.85);

    // ---------------- boost bookkeeping
    if (this.boostTime > 0) this.boostTime = Math.max(0, this.boostTime - dt);
    const boostTarget = this.boostTime > 0 ? 1 : 0;
    this.boostLevel = damp(this.boostLevel, boostTarget, boostTarget > this.boostLevel ? 14 : 3, dt);
    const vmax = st.topSpeed * (1 + 0.3 * this.boostLevel + 0.07 * this.slipstream);

    // ---------------- yaw
    const fwdSpeed = this.vf;
    const v = Math.max(Math.abs(fwdSpeed), 0.01);
    const aLat = 30 * st.grip;
    let wMax = Math.min(1.9, 0.26 * v, aLat / v + 0.06);
    const dir = fwdSpeed >= -0.5 ? 1 : -1;
    let wTarget = -steer * wMax * dir;
    const D = this.drift;

    // drift state machine
    if (!D.active) {
      if (driftBtn && Math.abs(steer) > 0.25 && fwdSpeed > 17 && this.grounded) {
        D.active = true;
        D.dir = Math.sign(steer);
        D.time = 0;
        D.tier = 0;
        this.yawRate += -D.dir * 0.55 * st.drift;
        this.events.push({ type: 'driftStart', dir: D.dir });
      }
    }
    // slip angle (positive when the nose points into the drift)
    const slipRaw = Math.atan2(-this.vl, Math.max(Math.abs(this.vf), 1));
    if (D.active) {
      D.time += dt;
      D.slip = slipRaw * D.dir;
      const into = steer * D.dir; // +1 steering into the drift, -1 counter-steer
      const wDrift = Math.min(2.2, 0.3 * v, (aLat * 1.25) / v + 0.12);
      wTarget = -D.dir * wDrift * (1.05 + 0.6 * into) * st.drift;
      if (D.slip > 0.8) wTarget = lerp(wTarget, D.dir * 0.6, clamp((D.slip - 0.8) * 3, 0, 1));
      const tier = D.time > 3.0 ? 3 : D.time > 1.9 ? 2 : D.time > 0.9 ? 1 : 0;
      if (tier > D.tier) {
        D.tier = tier;
        this.events.push({ type: 'driftTier', tier });
      }
      this.addNitro(dt * 0.2 * clamp(D.slip / 0.45, 0, 1.2) * clamp(fwdSpeed / 50, 0.3, 1.3));
      const end = !driftBtn || fwdSpeed < 12 || !this.grounded || (D.time > 0.35 && D.slip < 0.05 && into < 0);
      if (end) {
        D.active = false;
        if (D.tier > 0) {
          const dur = [0, 0.7, 1.15, 1.7][D.tier];
          this.giveBoost(dur, 'mini');
          this.events.push({ type: 'miniturbo', tier: D.tier });
        }
        this.events.push({ type: 'driftEnd', time: D.time, tier: D.tier });
        D.tier = 0;
      }
    } else {
      D.slip = slipRaw;
    }

    if (!this.grounded) wTarget *= 0.35;
    const yawResp = D.active ? 6 : 9;
    this.yawRate = damp(this.yawRate, wTarget, yawResp, dt);
    this.heading += this.yawRate * dt;

    // ---------------- velocity in the new heading frame
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const rx = -Math.cos(this.heading);
    const rz = Math.sin(this.heading);
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;

    // ---------------- longitudinal
    let a = 0;
    this.braking = false;
    if (this.grounded) {
      if (brake > 0.05 && vf > 1) {
        a -= 34 * brake;
        this.braking = true;
      } else if (brake > 0.05) {
        a -= 11 * brake;
        if (vf < -15) a = 0;
        this.braking = true;
      } else if (throttle > 0) {
        const ratio = clamp(vf / vmax, -1, 1.5);
        // strong launch that tapers off toward top speed (~0-100 km/h in 1.7 s, top speed in ~8 s)
        const base = 17.5 * st.accel * throttle;
        const r = Math.max(ratio, 0);
        a += ratio < 1 ? base * (1 - Math.pow(r, 2.4)) * (1 + 0.25 * (1 - r)) : -(ratio - 1) * 20;
      }
      if (this.boostLevel > 0.02 && vf < vmax * 1.02) a += 24 * this.boostLevel;
      // drag + rolling
      a -= 0.0007 * vf * Math.abs(vf);
      if (throttle < 0.1 && brake < 0.05) a -= Math.sign(vf) * Math.min(Math.abs(vf), 3.0);
      if (D.active) a -= 2.2 * clamp(D.slip, 0, 1) * Math.sign(vf);
      if (vf > vmax && this.boostLevel < 0.05) a = Math.min(a, -(vf - vmax) * 0.9);
    }
    vf += a * dt;

    // ---------------- lateral grip
    let grip = D.active ? 2.1 + (1 - clamp(steer * D.dir, -1, 1)) * 0.6 : 13 * st.grip;
    if (!this.grounded) grip = 0.3;
    if (Math.abs(vf) < 4) grip = Math.max(grip, 18);
    const vlNew = vl * Math.exp(-grip * dt);
    const lost = Math.abs(vl) - Math.abs(vlNew);
    vf += Math.sign(vf || 1) * lost * (D.active ? 0.42 : 0.12);
    vl = vlNew;

    this.longAcc = (vf - this.vf) / dt;
    this.vf = vf;
    this.vl = vl;
    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    this.latAcc = vf * this.yawRate;

    // ---------------- integrate position
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    tr.project(this.x, this.z, this.hint, f);
    this.hint = f.i;

    // ---------------- walls
    const W = tr.halfWidth;
    const limit = W - CAR_HALF_W + 0.35;
    this.wallContact = Math.max(0, this.wallContact - dt * 4);
    if (Math.abs(f.d) > limit) {
      const side = Math.sign(f.d);
      const pen = Math.abs(f.d) - limit;
      const hl = Math.hypot(f.rx, f.rz) || 1;
      const nx = (-side * f.rx) / hl;
      const nz = (-side * f.rz) / hl;
      const cb = Math.cos(f.bank);
      this.x += nx * pen * cb;
      this.z += nz * pen * cb;
      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        const impact = -vn;
        const e = 0.28;
        this.vx -= (1 + e) * vn * nx;
        this.vz -= (1 + e) * vn * nz;
        const loss = 1 - Math.min(0.4, impact * 0.012);
        this.vx *= loss;
        this.vz *= loss;
        // deflect heading toward the wall tangent
        const travel = Math.atan2(f.tx, f.tz) + (this.vf < 0 ? Math.PI : 0);
        this.heading = dampAngle(this.heading, travel, 3 + impact * 0.6, dt);
        this.yawRate *= 0.6;
        if (impact > 4) {
          this.events.push({ type: 'wall', strength: impact, side, x: this.x, y: this.y + 0.5, z: this.z });
          if (impact > 9 && D.active) {
            D.active = false;
            D.tier = 0;
            this.events.push({ type: 'driftFail' });
          }
        }
        this.wallContact = Math.max(this.wallContact, clamp(speedAbs / 40, 0, 1));
      } else {
        this.wallContact = Math.max(this.wallContact, clamp(speedAbs / 60, 0, 0.6) * (pen > 0.02 ? 1 : 0));
      }
      this.vx *= 1 - 0.5 * dt;
      this.vz *= 1 - 0.5 * dt;
      tr.project(this.x, this.z, this.hint, f);
      this.wallSide = side;
    }

    // ---------------- vertical
    const ground = f.y + tr.rampHeight(f.s, f.d);
    const groundVy = (ground - this.groundPrev) / dt;
    this.groundPrev = ground;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (f.tunnel) this.y = Math.min(this.y, ground + 5.2);
    if (this.y <= ground) {
      if (!this.grounded && this.airTime > 0.22) {
        const impact = Math.max(0, groundVy - this.vy);
        this.events.push({ type: 'land', strength: impact, air: this.airTime });
      }
      this.y = ground;
      this.vy = clamp(groundVy, -40, 30);
      if (!this.grounded) this.airTime = 0;
      this.grounded = true;
    } else if (this.y > ground + 0.08) {
      if (this.grounded) this.airTime = 0;
      this.grounded = false;
      this.airTime += dt;
    }

    // ---------------- boost pads
    this._padCooldown = Math.max(0, this._padCooldown - dt);
    if (this._padCooldown <= 0 && this.grounded) {
      for (const bp of tr.boostPads) {
        const ds = tr.deltaS(f.s, bp.s0);
        if (ds >= 0 && ds <= bp.len && Math.abs(f.d - bp.d) < bp.halfWidth + 0.6) {
          this.giveBoost(1.25, 'pad');
          this.events.push({ type: 'pad' });
          this._padCooldown = 1.0;
          break;
        }
      }
    }

    this.s = f.s;
    this.d = f.d;
    this.speed = Math.hypot(this.vx, this.vz);

    // wrong way detection
    const trackHeading = Math.atan2(f.tx, f.tz);
    const align = Math.cos(angleWrap(this.heading - trackHeading));
    this.wrongWay = align < -0.3 && this.speed > 5 ? this.wrongWay + dt : 0;

    // gears / rpm for audio + HUD
    const gearTop = [0, 0.18, 0.32, 0.46, 0.6, 0.74, 0.88, 2.0];
    const sr = clamp(Math.abs(vf) / st.topSpeed, 0, 1.5);
    let g = 1;
    while (g < 7 && sr > gearTop[g]) g++;
    if (g > this.gear) this.events.push({ type: 'shift', up: true, gear: g });
    this.gear = g;
    const lo = gearTop[g - 1];
    const hi = gearTop[g];
    const rpmT = clamp(0.28 + 0.72 * ((sr - lo) / Math.max(0.01, Math.min(hi, 1.2) - lo)), 0.2, 1.05);
    this.rpm = damp(this.rpm, throttle > 0.1 || this.boostLevel > 0.1 ? rpmT : rpmT * 0.85, 12, dt);

    this._updateOrientation(dt, false);
  }

  _updateOrientation(dt, snap) {
    const f = this.frame;
    const up = this.up;
    if (this.grounded) {
      up.set(f.ux, f.uy, f.uz).normalize();
      this._airUp.copy(up);
    } else {
      this._airUp.lerp(_worldUp, Math.min(1, dt * 1.5)).normalize();
      up.copy(this._airUp);
    }
    const fwd = this.fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    if (!this.grounded) {
      // pitch the nose with vertical velocity
      const pitch = clamp(-this.vy / Math.max(this.speed, 10), -0.35, 0.35) * 0.6;
      const left = _tmpL.crossVectors(up, fwd).normalize();
      fwd.applyAxisAngle(left, pitch);
      up.applyAxisAngle(left, pitch);
    }
    const left = _tmpL.crossVectors(up, fwd).normalize();
    _m.makeBasis(left, up, fwd);
    this.quat.setFromRotationMatrix(_m);
    this.position.set(this.x, this.y, this.z);
    this.velocity.set(this.vx, this.vy, this.vz);
    // visual body motion
    const rollT = clamp(this.latAcc * 0.0019 + (this.drift.active ? -this.drift.dir * 0.035 : 0), -0.09, 0.09);
    const pitchT = clamp(-this.longAcc * 0.0022, -0.06, 0.06);
    if (snap) {
      this.roll = rollT;
      this.pitch = pitchT;
    } else {
      this.roll = damp(this.roll, rollT, 7, dt);
      this.pitch = damp(this.pitch, pitchT, 7, dt);
    }
  }

  /** Simple pure-pursuit driver used for autopilot (after the finish, attract mode). */
  autopilot(dt, out, speedScale = 0.9) {
    const tr = this.track;
    const look = 10 + this.speed * 0.55;
    const s2 = this.s + look;
    const d2 = tr.sampleArray(tr.racingLine, s2) * 0.8;
    const p = tr.pointAt(s2, d2, _tmpV);
    const ang = angleWrap(Math.atan2(p.x - this.x, p.z - this.z) - this.heading);
    out.steer = clamp(-ang * 2.4, -1, 1);
    const target = tr.sampleArray(tr.speedProfile, this.s + this.speed * 0.9) * speedScale;
    const vt = Math.min(target, this.stats.topSpeed * speedScale);
    out.throttle = this.speed < vt ? 1 : 0;
    out.brake = this.speed > vt + 6 ? 1 : 0;
    out.drift = false;
    return out;
  }
}

const _worldUp = new THREE.Vector3(0, 1, 0);
const _tmpL = new THREE.Vector3();
const _tmpV = new THREE.Vector3();
const _m = new THREE.Matrix4();
