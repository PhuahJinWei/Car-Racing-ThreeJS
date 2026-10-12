import * as THREE from 'three';
import { clamp, damp, wrap, lerp } from '../core/math.js';
import { makeFrame } from '../world/track.js';

export const AI_NAMES = ['VIPER', 'NOVA', 'BLITZ', 'KAIJU', 'RONIN', 'HEX', 'MIRAGE', 'ZERO', 'SPECTRE', 'JINX', 'ORBIT', 'RAZE'];

/**
 * Difficulty presets.
 *  pace      - fraction of the track's ideal corner speed each rival drives at (spread across the field)
 *  topSpeed  - fraction of the car's real top speed rivals may reach on straights
 *  rubberUp  - how much rivals speed up when the player is far ahead (1 = never)
 *  rubberDown- how much rivals ease off when they are far ahead of the player
 *  mistakes  - seconds between driver errors (running wide, lifting, wobbling)
 *  ahead     - rivals that start in front of the player on the grid (5 = player starts last)
 */
export const DIFFICULTY = {
  rookie: { label: 'ROOKIE', pace: [0.62, 0.72], topSpeed: 0.82, rubberUp: 1.0, rubberDown: 0.72, mistakes: [6, 11], nitro: 0.15, line: 0.35, ahead: 2, reward: 0.5 },
  easy: { label: 'EASY', pace: [0.72, 0.8], topSpeed: 0.88, rubberUp: 1.0, rubberDown: 0.78, mistakes: [10, 18], nitro: 0.3, line: 0.55, ahead: 3, reward: 0.75 },
  normal: { label: 'NORMAL', pace: [0.8, 0.88], topSpeed: 0.94, rubberUp: 1.04, rubberDown: 0.84, mistakes: [18, 30], nitro: 0.6, line: 0.75, ahead: 4, reward: 1 },
  hard: { label: 'HARD', pace: [0.89, 0.96], topSpeed: 1.0, rubberUp: 1.08, rubberDown: 0.9, mistakes: [40, 70], nitro: 1, line: 0.9, ahead: 5, reward: 1.4 },
};

export const DIFFICULTY_ORDER = ['rookie', 'easy', 'normal', 'hard'];

const GRAVITY = 24;

/**
 * Opponent driver simulated in track space (s, d). Cheap, stable and easy to make
 * race convincingly: racing line + braking profile + overtaking + rubber-banding.
 */
export class AIDriver {
  constructor(track, def, opts = {}) {
    this.track = track;
    this.def = def;
    this.stats = def.stats;
    this.name = opts.name || 'AI';
    this.pace = opts.pace ?? 0.93;
    this.aggression = opts.aggression ?? 0.5;
    this.laneBias = opts.laneBias ?? 0;
    this.rubberUp = opts.rubberUp ?? 1.05;
    this.rubberDown = opts.rubberDown ?? 0.85;
    this.topSpeedMul = opts.topSpeedMul ?? 1;
    this.mistakeEvery = opts.mistakes ?? [20, 30];
    this.nitroSkill = opts.nitro ?? 0.6;
    this.lineSkill = opts.line ?? 0.8;
    this.mistakeTimer = this._nextMistake() * (0.4 + Math.random() * 0.6);
    this.error = null;
    this.time = 0;
    this.frame = makeFrame();
    this.s = 0;
    this.progress = 0;
    this.d = 0;
    this.vd = 0;
    this.v = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.airTime = 0;
    this.groundPrev = 0;
    this.boostTime = 0;
    this.boostLevel = 0;
    this.nitro = 1;
    this.driftVis = 0;
    this.yawVis = 0;
    this.frozen = true;
    this.finished = false;
    this.position = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.velocity = new THREE.Vector3();
    this.events = [];
    this.bump = 0;
    this._nitroCooldown = 3 + Math.random() * 4;
  }

  _nextMistake() {
    const [a, b] = this.mistakeEvery;
    return a + Math.random() * (b - a);
  }

  /** Human-like errors: run wide in a corner, lift off the throttle, or get sloppy on the wheel. */
  _updateMistakes(dt) {
    const tr = this.track;
    if (this.error) {
      this.error.t -= dt;
      if (this.error.t <= 0) this.error = null;
      return;
    }
    if (this.frozen || this.v < 15) return;
    this.mistakeTimer -= dt;
    if (this.mistakeTimer > 0) return;
    this.mistakeTimer = this._nextMistake();
    const kAhead = tr.sampleArray(tr.kappa, this.s + 25 + this.v * 0.4);
    const r = Math.random();
    if (Math.abs(kAhead) > 1 / 160 && r < 0.6) {
      // carried too much speed in: slides wide toward the outside wall, then has to slow down
      this.error = { type: 'wide', t: 2.4, side: Math.sign(kAhead) };
    } else if (r < 0.8) {
      this.error = { type: 'lift', t: 1.0 + Math.random() * 1.2 };
    } else {
      this.error = { type: 'wobble', t: 1.6 + Math.random(), phase: Math.random() * 6 };
    }
  }

  place(progress, d) {
    this.progress = progress;
    this.s = wrap(progress, this.track.length);
    this.d = d;
    this.vd = 0;
    this.v = 0;
    const f = this.track.frameAt(this.s, this.frame);
    this.y = f.py - f.ry * 0 + f.ry * d;
    this.groundPrev = this.y;
    this._transform(0.016);
  }

  /** ctx: { racers: [{s, d, v, progress, isPlayer}], player, raceStarted } */
  update(dt, ctx) {
    const tr = this.track;
    const st = this.stats;
    const W = tr.halfWidth;
    if (this.boostTime > 0) this.boostTime = Math.max(0, this.boostTime - dt);
    this.boostLevel = damp(this.boostLevel, this.boostTime > 0 ? 1 : 0, this.boostTime > 0 ? 12 : 3, dt);

    // ---- target speed
    const look = this.v * 0.85 + 8;
    let prof = Math.min(tr.sampleArray(tr.speedProfile, this.s + look), tr.sampleArray(tr.speedProfile, this.s + look * 0.45));
    let rubber = 1;
    if (ctx.player && !this.finished) {
      const gap = ctx.player.progress - this.progress; // >0: player ahead of me
      if (gap > 40) rubber = lerp(1, this.rubberUp, clamp((gap - 40) / 260, 0, 1));
      else if (gap < -60) rubber = lerp(1, this.rubberDown, clamp((-gap - 60) / 300, 0, 1));
    }
    this.time += dt;
    this._updateMistakes(dt);
    const err = this.error;
    if (err) {
      if (err.type === 'wide') rubber *= err.t < 1.4 ? 0.8 : 1.04;
      else if (err.type === 'lift') rubber *= 0.72;
      else rubber *= 0.93;
    }
    const vmax = st.topSpeed * this.topSpeedMul * (1 + 0.28 * this.boostLevel);
    let target = Math.min(prof * this.pace * (1 + 0.04 * this.boostLevel), vmax) * rubber;
    if (this.startDelay > 0) {
      this.startDelay -= dt;
      target = 0;
    }
    if (this.frozen) target = 0;

    // ---- longitudinal
    if (this.grounded) {
      if (this.v < target) {
        const ratio = clamp(this.v / vmax, 0, 1);
        this.v += (17.5 * st.accel * (1 - Math.pow(ratio, 2.4)) * (1 + 0.25 * (1 - ratio)) + 22 * this.boostLevel) * dt;
        this.v = Math.min(this.v, Math.max(target, this.v - 1));
      } else {
        this.v -= Math.min(30 * dt, this.v - target);
      }
    }
    if (this.bump > 0) this.bump = Math.max(0, this.bump - dt);

    // ---- nitro usage on straights
    this._nitroCooldown -= dt;
    this.nitro = Math.min(3, this.nitro + dt * 0.05);
    if (!this.frozen && this._nitroCooldown <= 0 && this.nitro >= 1 && this.boostTime <= 0) {
      const ahead = tr.sampleArray(tr.speedProfile, this.s + 120);
      const here = tr.sampleArray(tr.speedProfile, this.s + 30);
      if (ahead > st.topSpeed && here > st.topSpeed && Math.random() < dt * (0.15 + this.aggression * 0.5) * this.nitroSkill) {
        this.nitro -= 1;
        this.boostTime = 2.1;
        this._nitroCooldown = 6 + Math.random() * 8;
        this.events.push({ type: 'nitro' });
      }
    }

    // ---- lateral planning
    const lineAhead = tr.sampleArray(tr.racingLine, this.s + 12 + this.v * 0.3);
    let targetD = lineAhead * this.lineSkill + this.laneBias;
    let blocked = false;
    for (const c of ctx.racers) {
      if (c === this) continue;
      const ds = tr.deltaS(c.s, this.s);
      if (ds > 0 && ds < 22 + this.v * 0.25 && Math.abs(c.d - this.d) < 2.6 && this.v > c.v - 1.5) {
        const leftRoom = c.d - 2.7 - (-W + 1.2);
        const rightRoom = W - 1.2 - (c.d + 2.7);
        const pref = rightRoom > leftRoom ? 1 : -1;
        targetD = c.d + pref * 2.9;
        blocked = Math.max(leftRoom, rightRoom) < 0.5;
        break;
      }
    }
    if (blocked) target = Math.min(target, this.v);
    if (err && err.type === 'wide') targetD = err.side * (W - 1.3);
    if (err && err.type === 'wobble') targetD += Math.sin(this.time * 5 + err.phase) * 1.4;
    targetD = clamp(targetD, -W + 1.15, W - 1.15);
    // a car only moves sideways while it rolls forward: on the grid it holds its slot
    const vdMax = this.frozen ? 0 : Math.min(7.5, this.v * 0.6);
    const dErr = targetD - this.d;
    this.vd = damp(this.vd, clamp(dErr * 1.7, -vdMax, vdMax), 3.2, dt);
    this.d += this.vd * dt;
    const lim = W - 0.95;
    if (Math.abs(this.d) > lim) {
      this.d = Math.sign(this.d) * lim;
      this.vd = 0;
    }

    // ---- advance along the track
    const k = tr.sampleArray(tr.kappa, this.s);
    const ds = (this.v * dt) / Math.max(0.5, 1 + this.d * k);
    this.s = wrap(this.s + ds, tr.length);
    this.progress += ds;

    // ---- vertical (ramps / crests)
    const f = tr.frameAt(this.s, this.frame);
    const ground = f.py + f.ry * this.d + tr.rampHeight(this.s, this.d);
    const groundVy = (ground - this.groundPrev) / Math.max(dt, 1e-4);
    this.groundPrev = ground;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= ground) {
      if (!this.grounded && this.airTime > 0.25) this.events.push({ type: 'land', strength: groundVy - this.vy });
      this.y = ground;
      this.vy = clamp(groundVy, -40, 30);
      this.grounded = true;
      this.airTime = 0;
    } else if (this.y > ground + 0.08) {
      this.grounded = false;
      this.airTime += dt;
    }

    // ---- visual drift in tight, fast corners
    const lat = this.v * this.v * Math.abs(k);
    const dTarget = this.grounded && lat > 16 && Math.abs(k) > 1 / 140 ? clamp((lat - 16) / 14, 0, 1) * 0.42 * Math.sign(k) : 0;
    this.driftVis = damp(this.driftVis, dTarget, 4, dt);
    this._transform(dt);
  }

  _transform(dt) {
    const f = this.frame;
    const tr = this.track;
    this.position.set(f.px + f.rx * this.d, this.y, f.pz + f.rz * this.d);
    this.up.set(f.ux, f.uy, f.uz).normalize();
    const yaw = Math.atan2(this.vd, Math.max(this.v, 5)) * -1 + this.driftVis;
    this.yawVis = damp(this.yawVis, yaw, 10, dt || 0.016);
    const T = _t.set(f.tx, f.ty, f.tz).normalize();
    T.applyAxisAngle(this.up, this.yawVis);
    this.fwd.copy(T);
    const left = _l.crossVectors(this.up, this.fwd).normalize();
    this.fwd.crossVectors(left, this.up).normalize();
    _m.makeBasis(left, this.up, this.fwd);
    this.quat.setFromRotationMatrix(_m);
    // world velocity (for effects / camera)
    const hl = Math.hypot(f.rx, f.rz) || 1;
    this.velocity.set(f.tx * this.v + (f.rx / hl) * this.vd, this.vy, f.tz * this.v + (f.rz / hl) * this.vd);
    void tr;
  }

  get speed() {
    return this.v;
  }
}

const _t = new THREE.Vector3();
const _l = new THREE.Vector3();
const _m = new THREE.Matrix4();
