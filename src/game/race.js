import * as THREE from 'three';
import { buildWorld } from '../world/world-builder.js';
import { globalUniforms, MAX_HEADLIGHTS } from '../world/materials.js';
import { aimLampLights, castCarShadow, pickLamps } from '../world/car-light.js';
import { CarModel } from '../car/car-model.js';
import { getCarDef, CARS } from '../car/car-defs.js';
import { getCarAsset } from '../car/car-assets.js';
import { randomCustom } from '../car/customization.js';
import { Vehicle } from './vehicle.js';
import { AIDriver, AI_NAMES, DIFFICULTY } from './ai.js';
import { CameraRig } from './camera-rig.js';
import { Effects, RAIN_LAMPS } from './effects.js';
import { StuntTracker } from './stunts.js';
import { GhostRecorder, GhostPlayer } from './ghost.js';
import { DEFAULT_FX } from '../core/postfx.js';
import { clamp, damp, lerp, rng, hashString, wrap, smoothstep } from '../core/math.js';
import { t, trackTagline } from '../core/i18n.js';

const TIER_COLORS = [null, [0.4, 1.6, 6.0], [6.0, 2.4, 0.4], [5.0, 0.6, 6.0]];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dv = new THREE.Vector3();
const _dv2 = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _sv = new THREE.Vector3();
const _sv2 = new THREE.Vector3();
const _c = new THREE.Color();
const _white = new THREE.Color(1, 1, 1);
// per-frame scratch: car model state, and effect colours (emitters copy them straight away)
const _modelState = { speed: 0, steer: 0, brake: false, boost: 0, drift: false, reverse: false };
const _smokeCol = [0, 0, 0];
const STEAM = [0.2, 0.2, 0.22];
const SPIN_WET = [0.74, 0.77, 0.83];
const SPIN_DRY = [0.7, 0.7, 0.74];
const SCRAPE = [6, 3.0, 1.0];
const EXHAUST = [0.6, 1.0, 2.4];
const SPRAY = [0.6, 0.65, 0.75];
// running order: finishers by time, then by distance covered
const byPlace = (a, b) => {
  if (a.finished && b.finished) return a.finishTime - b.finishTime;
  if (a.finished) return -1;
  if (b.finished) return 1;
  return b.progress - a.progress;
};
/** Sort a short, mostly sorted list in place (an insertion sort: no garbage, unlike Array#sort). */
function sortInPlace(list, cmp) {
  for (let i = 1; i < list.length; i++) {
    const x = list[i];
    let j = i - 1;
    while (j >= 0 && cmp(list[j], x) > 0) {
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = x;
  }
  return list;
}
const byCamDist = (a, b) => a.camD2 - b.camD2;

// headlights lighting the world: brightness (same units as the baked lamp light), reach (m) and
// the camera distance (m) beyond which a rival's lights fade out of the shaders
const HEAD_POWER = 2.6;
const HEAD_POWER_RIVAL = 1.6;
const HEAD_RANGE = 60;
const HEAD_FADE_FAR = 90;

/**
 * The car model of each rival, drawn from two or three models, so a race only loads those and
 * your own. A seed (the daily challenge's) gives everyone the same field.
 */
export function pickRivals(count, seed) {
  const rand = seed != null ? rng(hashString(`rivals|${seed}`)) : Math.random;
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const models = shuffle(CARS.map((c) => c.id)).slice(0, rand() < 0.5 ? 2 : 3);
  // each model races at least once, in a random grid slot
  return shuffle(Array.from({ length: count }, (_, k) => models[k < models.length ? k : Math.floor(rand() * models.length)]));
}

/**
 * One race session: world, cars, rules, effects, camera and per-frame orchestration.
 * cfg: { trackId, variant: {reverse, mirror, weather}, mode: 'race'|'timetrial'|'daily',
 *        laps, difficulty, carId, custom, opponents, rivals (car id per opponent), ghost }
 */
export class Race {
  constructor(app, cfg) {
    this.app = app;
    this.cfg = { mode: 'race', laps: 3, difficulty: 'normal', opponents: 5, ...cfg };
    this.handlers = {};
    this.phase = 'loading';
    this.time = 0;
    this.clock = 0;
    this.phaseTime = 0;
    this.timeScale = 1;
    this.timeScaleTarget = 1;
    this.slowmo = 0;
    this.paused = false;
    this.fx = DEFAULT_FX();
    this.flash = 0;
    this.flashColor = [1, 1, 1];
    this.impact = 0;
    this.lightning = 0;
    this.nextLightning = 6 + Math.random() * 8;
    // how far the camera is under a roof (tunnel, overpass): 0 out in the rain .. 1 sheltered
    this.shelter = 0;
    this.hud = {};
    this.messages = [];
    this._autoCtrl = { steer: 0, throttle: 0, brake: 0, drift: false };
    this._noCtrl = { steer: 0, throttle: 0, brake: 0, drift: false };
    this.perfectStart = null;
    this.startPressTime = null;
  }

  on(evt, fn) {
    (this.handlers[evt] || (this.handlers[evt] = [])).push(fn);
  }

  emit(evt, data) {
    for (const fn of this.handlers[evt] || []) fn(data);
  }

  build() {
    const app = this.app;
    const cfg = this.cfg;
    const q = app.renderer.preset;
    this.world = buildWorld(app.renderer.renderer, cfg.trackId, cfg.variant || {}, q);
    this.track = this.world.track;
    this.scene = this.world.scene;
    this.laps = cfg.laps;
    this.camera = new THREE.PerspectiveCamera(62, app.renderer.aspect, 0.1, 6500);
    this.rig = new CameraRig(this.camera, this.track);
    this.rig.shakeScale = app.settings.shake ?? 1;
    this.rig.setMode(app.settings.camera || 'chase');
    this.effects = new Effects(this.scene, { particles: q.particles, rain: this.world.rain });
    this.stunts = new StuntTracker((p) => this.emit('popup', p));
    const rand = rng(hashString(this.track.key + (cfg.seed || '')));

    // ---- racers
    const def = getCarDef(cfg.carId);
    // a patrol car has a siren, sounding from the start of every race
    this.playerPatrol = !!def.patrol;
    this.siren = this.playerPatrol;
    this.player = this._makeRacer(def, cfg.custom, true, 'YOU', { number: 7 });
    // the chase cameras rise over a tall car, so the road ahead stays in view
    // (its highest point above the road: the model's parts start at the underbody, wheels come later)
    const asset = this.player.model.asset;
    let top = Math.max(...def.cabin.map((c) => c[4]));
    if (asset?.lods?.lod0) top = Math.max(...asset.lods.lod0.map((p) => (p.geometry.boundingBox || (p.geometry.computeBoundingBox(), p.geometry.boundingBox)).max.y));
    this.rig.fitCar(top, asset?.dims ? -asset.dims.rearZ : def.dims.length / 2);
    this.racers = [this.player];
    this.ais = [];
    if (cfg.mode !== 'timetrial') {
      const diff = DIFFICULTY[cfg.difficulty] || DIFFICULTY.easy;
      this.diff = diff;
      const names = [...AI_NAMES].sort(() => rand() - 0.5);
      for (let k = 0; k < cfg.opponents; k++) {
        // (the draw stays when a car is given, so the rest of a seeded field comes out the same)
        const any = CARS[Math.floor(rand() * CARS.length)];
        const aiDef = cfg.rivals?.[k] ? getCarDef(cfg.rivals[k]) : any;
        // spread the field: some rivals are clearly slower than others
        const pace = lerp(diff.pace[0], diff.pace[1], (k + 0.5 + (rand() - 0.5) * 0.6) / cfg.opponents);
        const r = this._makeRacer(aiDef, randomCustom(rand, aiDef), false, names[k % names.length], {
          pace,
          aggression: rand(),
          laneBias: (rand() - 0.5) * 2.4,
          rubberUp: diff.rubberUp,
          rubberDown: diff.rubberDown,
          topSpeedMul: diff.topSpeed * lerp(0.97, 1.0, rand()),
          mistakes: diff.mistakes,
          nitro: diff.nitro,
          line: diff.line,
          number: 10 + Math.floor(rand() * 89),
        });
        this.racers.push(r);
        this.ais.push(r);
      }
    }

    // ---- grid: fastest rivals at the front; on easier levels the player starts mid-pack
    const byPace = [...this.ais].sort((a, b) => b.ai.pace - a.ai.pace);
    const ahead = Math.min(byPace.length, this.diff ? this.diff.ahead : 0);
    const order = [...byPace.slice(0, ahead), this.player, ...byPace.slice(ahead)];
    order.forEach((r, k) => {
      const back = 14 + k * 8.5;
      const d = this.ais.length ? (k % 2 === 0 ? -3.2 : 3.2) : 0;
      r.progress = -back;
      r.lapIdx = -1;
      r.prevS = wrap(-back, this.track.length);
      if (r.isPlayer) {
        r.vehicle.placeAt(this.track.length - back, d, 0);
        r.vehicle.frozen = true;
        r.vehicle.nitro = 1;
      } else {
        r.ai.place(-back, d);
        r.ai.frozen = true;
      }
      r.gridSlot = k;
    });

    // ---- ghost (time trial)
    this.recorder = cfg.mode === 'timetrial' ? new GhostRecorder() : null;
    this.ghost = null;
    if (cfg.ghost) {
      try {
        this.ghost = new GhostPlayer(cfg.ghost);
        this.ghostModel = new CarModel(def, cfg.custom, { envMap: this.world.envMap, hq: false, asset: getCarAsset(def.id) });
        this.ghostModel.setGhost(0x40e8ff);
        this.ghostModel.group.visible = false;
        this.scene.add(this.ghostModel.group);
      } catch (e) {
        console.warn('ghost load failed', e);
        this.ghost = null;
      }
    }

    // ---- local light probe that tints the player car with nearby baked light
    this.probe = new THREE.PointLight(0xffffff, 0, 16, 1.6);
    this.scene.add(this.probe);
    this.probeColor = new THREE.Color();
    // ---- real lights placed on the street lamps / signs nearest the player: cars light up as they
    // sweep underneath (the track itself uses baked light, so only cars and props react)
    this.lampLights = [];
    for (let k = 0; k < (q.carHQ ? 3 : 2); k++) {
      const L = new THREE.PointLight(0xffffff, 0, 24, 2);
      this.scene.add(L);
      this.lampLights.push(L);
    }
    // the lamps that light the falling rain, and the sky light a lightning flash adds to
    this.rainLamps = new Array(RAIN_LAMPS).fill(null);
    this.baseAmbient = globalUniforms.uAmbient.value.clone();
    this.baseHemi = this.world.env.hemi.intensity;

    this._syncRacers(0);
    this._updateModels(0.016);
    this.rig.update(0.016, this.player.vehicle);
    this.phase = 'ready';
  }

  _makeRacer(def, custom, isPlayer, name, opts) {
    const q = this.app.renderer.preset;
    const model = new CarModel(def, custom, {
      envMap: this.world.envMap,
      hq: isPlayer ? q.carHQ : false,
      // light detail (phones): the mid-detail model already rides on simpler wheels
      wheelHQ: isPlayer && q.carHQ && q.carDetail !== 'light',
      number: opts.number,
      liveryRes: isPlayer ? Math.min(1024, q.liveryRes ?? 1024) : 512,
      asset: getCarAsset(def.id),
      damage: true,
      damageRes: isPlayer ? 512 : 256,
    });
    this.scene.add(model.group);
    const r = {
      def,
      model,
      isPlayer,
      name,
      progress: 0,
      prevS: 0,
      lapIdx: -1,
      lapStart: 0,
      lapTimes: [],
      bestLap: Infinity,
      finished: false,
      finishTime: 0,
      place: 0,
      color: model.custom.paint.color,
      nm: new Map(),
      slip: 0,
      slipMsg: false,
      s: 0,
      d: 0,
      v: 0,
    };
    if (isPlayer) {
      r.vehicle = new Vehicle(this.track, def);
      r.vehicle.wet = !!this.world.rain;
    }
    else r.ai = new AIDriver(this.track, def, { name, ...opts });
    const tw = isPlayer ? 0.085 : 0.06;
    r.trails = [this.effects.trails.create(tw, model.trailColor), this.effects.trails.create(tw, model.trailColor)];
    if (isPlayer) {
      r.skids = [0, 1, 2, 3].map(() => this.effects.skids.create(0.16, '#ffffff'));
      r.skidSlot = 0;
      r.wasDrifting = false;
    }
    return r;
  }

  start() {
    this.phase = 'intro';
    this.phaseTime = 0;
    this.rig.startIntro(3.4);
    this.emit('intro', { name: this.world.def.name, tagline: trackTagline(this.world.def) });
  }

  skipIntro() {
    if (this.phase !== 'intro') return;
    this.rig.cine = null;
    this.rig.blend = 1;
    this._beginCountdown();
  }

  _beginCountdown() {
    this.phase = 'countdown';
    this.phaseTime = 0;
    this.lastCount = 4;
    this.rig.endCinematic(0.35);
  }

  _go() {
    this.phase = 'racing';
    this.phaseTime = 0;
    this.time = 0;
    for (const r of this.racers) {
      r.lapStart = 0;
      if (r.isPlayer) r.vehicle.frozen = false;
      else {
        // human-ish reaction time off the line (counted in game time, so pausing is safe)
        r.ai.startDelay = 0.05 + Math.random() * 0.3;
        r.ai.frozen = false;
      }
    }
    this.emit('countdown', { value: 'GO' });
    this.app.audio?.play('go');
    // perfect start window: pressed nitro within [-0.3, +0.25] s of GO
    if (this.startPressTime !== null && this.startPressTime > -0.32) this._perfectStart();
  }

  _perfectStart() {
    if (this.perfectStart) return;
    this.perfectStart = true;
    const v = this.player.vehicle;
    v.giveBoost(1.4, 'start');
    this.stunts.add('perfectStart', 300, t('pop.perfectStart'), { big: true });
    this.flash = 0.08;
    this.flashColor = [1.0, 0.75, 0.4];
    this.rig.kick(10);
    this.app.audio?.play('boost');
    this.app.input.vibrate(40);
  }

  respawn() {
    const v = this.player.vehicle;
    const s = v.s - 6;
    const d = clamp(v.d, -this.track.halfWidth * 0.4, this.track.halfWidth * 0.4);
    v.placeAt(s, d, Math.min(30, v.topSpeed * 0.35));
    this.player.prevS = v.s;
    this.flash = 0.35;
    this.flashColor = [0.02, 0.03, 0.06];
    this.app.audio?.play('respawn');
    this.stunts.breakCombo();
  }

  setPaused(p) {
    this.paused = p;
  }

  // ------------------------------------------------------------------------------------
  update(dtReal) {
    if (this.paused || this.phase === 'loading') return;
    const app = this.app;
    const input = app.input;

    // ---- time scale (slow motion moments)
    if (this.slowmo > 0) {
      this.slowmo -= dtReal;
      if (this.slowmo <= 0) this.timeScaleTarget = 1;
    }
    this.timeScale = damp(this.timeScale, this.timeScaleTarget, this.timeScaleTarget < this.timeScale ? 16 : 4, dtReal);
    const dt = dtReal * this.timeScale;
    this.clock += dt;
    this.phaseTime += dtReal;
    globalUniforms.uTime.value = this.clock;

    const P = this.player;
    const v = P.vehicle;

    // ---- phases
    if (this.phase === 'intro') {
      if (this.phaseTime > 3.4 || input.consume('nitro') || input.consume('pause')) this._beginCountdown();
    } else if (this.phase === 'countdown') {
      const remain = 3 - this.phaseTime;
      const c = Math.ceil(remain);
      if (c < this.lastCount && c > 0) {
        this.lastCount = c;
        this.emit('countdown', { value: c });
        app.audio?.play('count');
      }
      if (input.consume('nitro')) {
        this.startPressTime = -remain;
        if (remain > 0.32) this.emit('popup', { kind: 'fail', label: t('pop.tooEarly'), points: 0, combo: 1 });
      }
      if (remain <= 0) this._go();
    } else if (this.phase === 'racing' && !P.finished) {
      this.time += dt;
      if (this.phaseTime < 0.25 && input.consume('nitro') && !this.perfectStart) this._perfectStart();
      else if (input.consume('nitro')) {
        if (v.fireNitro()) this._onNitro();
        else this.emit('popup', { kind: 'fail', label: t('pop.noNitro'), points: 0, combo: 1 });
      }
      if (input.consume('reset')) this.respawn();
      // auto-recover when stuck (driving but not getting anywhere) or going the wrong way for too
      // long - a car the player has stopped on purpose stays put
      const ctl = input.state;
      const trying = (ctl.throttle > 0.5 && ctl.brake < 0.05) || (ctl.brake > 0.05 && v.reversing);
      if ((trying && v.speed < 2.5 && this.time > 4) || v.wrongWay > 3) {
        this._stuck = (this._stuck || 0) + dtReal;
        if (this._stuck > 2.5) {
          this._stuck = 0;
          this.respawn();
        }
      } else this._stuck = 0;
    } else if (this.phase === 'finish' || this.phase === 'results') {
      this.time += dt;
      if (this.phase === 'finish' && this.phaseTime > 3.2) {
        this.phase = 'results';
        this.phaseTime = 0;
        this.siren = false;
        this.rig.startTV();
        this.emit('results', this.getResults());
      }
    }
    if (input.consume('siren') && this.playerPatrol) this.siren = !this.siren;
    if (input.consume('camera')) {
      const m = this.rig.cycleMode();
      app.settings.camera = m;
      app.saveSettings?.();
      this.emit('camera', m);
    }

    // ---- player physics (fixed sub-steps)
    let ctrl = input.state;
    if (this.phase === 'intro' || this.phase === 'countdown' || this.phase === 'ready') ctrl = this._noCtrl;
    if (P.finished) ctrl = v.autopilot(dt, this._autoCtrl, 0.82);
    const steps = Math.min(10, Math.max(1, Math.ceil(dt / (1 / 120))));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) v.step(h, ctrl);

    // ---- AI
    const ctx = this._aiCtx || (this._aiCtx = { racers: this.racers, player: P });
    for (const r of this.ais) r.ai.update(dt, ctx);

    this._syncRacers(dt);
    this._collisions(dt);
    this._interactions(dt);
    this._handleEvents(dt, ctrl);
    this._laps();
    this._positions();
    this.stunts.update(dt);

    // drift scoring live
    if (v.drift.active && !P.finished) {
      const pts = this.stunts.driftTick(dt, v.speed, v.drift.slip);
      this.hud.driftPoints = pts;
    } else this.hud.driftPoints = 0;

    // ghost
    if (this.recorder && this.phase === 'racing' && !P.finished) this.recorder.record(this.time, v.position, v.quat);
    if (this.ghost && this.ghostModel) {
      const show = this.phase === 'racing' || this.phase === 'finish';
      if (show) {
        const alive = this.ghost.sample(this.time, this.ghostModel.group.position, this.ghostModel.group.quaternion);
        this.ghostModel.group.visible = alive;
        const dist = this.ghostModel.group.position.distanceTo(v.position);
        this.ghostModel.ghostMat.uniforms.uOpacity.value = clamp((dist - 3) / 10, 0.15, 1);
      } else this.ghostModel.group.visible = false;
    }

    this._updateModels(dt);
    this._emitEffects(dt);

    // ---- camera
    this.rig.update(dt, v);
    this.effects.update(dt, this.camera, this.app.renderer.post.sceneRT?.height);
    this.world.update(dt, this.camera);
    this.player.model.group.visible = !this.rig.hideCar;

    this._updateProbe(dt);
    this._updateLamps();
    this._updateRain(dtReal);
    this._updateHeadlights();
    // start lights: one more red column every 0.6 s of the countdown, all out at GO
    const SL = this.world.startLights;
    if (SL) {
      if (this.phase === 'countdown') {
        SL.uLit.value = Math.min(5, Math.floor(this.phaseTime / 0.6) + 1);
        SL.uGreen.value = 0;
      } else {
        SL.uLit.value = 0;
        SL.uGreen.value = this.phase === 'racing' ? Math.max(0, 1 - this.phaseTime * 0.5) : 0;
      }
    }
    this._updateFx(dtReal);
    this._updateAudio(dt);
    this._updateHud();
  }

  _syncRacers() {
    const tr = this.track;
    for (const r of this.racers) {
      if (r.isPlayer) {
        const v = r.vehicle;
        r.progress += tr.deltaS(v.s, r.prevS);
        r.prevS = v.s;
        r.s = v.s;
        r.d = v.d;
        r.v = v.vf;
      } else {
        r.s = r.ai.s;
        r.d = r.ai.d;
        r.v = r.ai.v;
        r.progress = r.ai.progress;
      }
    }
  }

  _collisions(dt) {
    const tr = this.track;
    const P = this.player;
    const v = P.vehicle;
    const WID = 1.95;
    const lenP = P.def.dims?.length ?? 4.6;
    const massP = P.def.stats.mass ?? 1;
    const f = v.frame;
    const hl = Math.hypot(f.rx, f.rz) || 1;
    const rhx = f.rx / hl;
    const rhz = f.rz / hl;
    this._hitCooldown = Math.max(0, (this._hitCooldown || 0) - dt);
    for (const r of this.ais) {
      const a = r.ai;
      // a long pickup touches sooner, a little city car later (two typical 4.6 m cars: 4.45 m)
      const LEN = 0.968 * (lenP + (r.def.dims?.length ?? 4.6)) * 0.5;
      // heavier cars shove lighter ones aside: each car's share of the push, and of the speed
      // traded, goes by the other car's mass (both shares are 1 when the masses match)
      const massA = r.def.stats.mass ?? 1;
      const kP = (2 * massA) / (massP + massA);
      const kA = (2 * massP) / (massP + massA);
      const ds = tr.deltaS(a.s, v.s);
      const dd = a.d - v.d;
      if (Math.abs(ds) >= LEN || Math.abs(dd) >= WID) continue;
      if (Math.abs(a.y - v.y) > 1.6) continue;
      const penS = LEN - Math.abs(ds);
      const penD = WID - Math.abs(dd);
      let strength = 0;
      const nm = this._nm(r);
      nm.touched = true;
      if (penD < penS * 0.75) {
        // side swipe
        const sgn = Math.sign(dd) || 1;
        const push = penD * 0.5;
        a.d += sgn * push * kA;
        v.x -= rhx * sgn * push * kP;
        v.z -= rhz * sgn * push * kP;
        const pvl = v.vx * rhx + v.vz * rhz;
        const rel = pvl - a.vd;
        if (rel * sgn > 0) {
          v.vx -= rhx * rel * Math.min(1, 0.85 * kP);
          v.vz -= rhz * rel * Math.min(1, 0.85 * kP);
          a.vd += rel * 0.6 * kA;
        }
        a.vd += sgn * 1.5 * kA;
        strength = Math.abs(rel) + 1.5;
      } else {
        const rel = v.vf - a.v;
        if (ds > 0) {
          // player hits the car ahead
          v.x -= f.tx * penS * 0.6;
          v.z -= f.tz * penS * 0.6;
          if (rel > 0) {
            const keep = (a.v + rel * Math.max(0, 1 - 0.75 * kP)) / Math.max(v.vf, 1);
            v.vx *= keep;
            v.vz *= keep;
            a.v += rel * 0.55 * kA;
            a.bump = 0.6;
          }
          strength = Math.max(0, rel);
        } else {
          // car behind hits the player
          a.progress -= penS * 0.6;
          a.s = wrap(a.s - penS * 0.6, tr.length);
          if (rel < 0) {
            v.vx += f.tx * -rel * 0.45 * kP;
            v.vz += f.tz * -rel * 0.45 * kP;
            a.v += rel * Math.min(1, 0.6 * kA);
          }
          strength = Math.max(0, -rel);
        }
      }
      // crash damage on both cars: contact normal from the player toward the rival, where they meet
      const sideHit = penD < penS * 0.75;
      const cs = sideHit ? Math.sign(dd) || 1 : ds > 0 ? 1 : -1;
      const hx = (sideHit ? rhx : f.tx) * cs;
      const hz = (sideHit ? rhz : f.tz) * cs;
      const px = (v.x + a.position.x) / 2;
      const pz = (v.z + a.position.z) / 2;
      if (strength > 2.5 && this._hitCooldown <= 0) {
        this._hitCooldown = 0.25;
        const py = (v.y + a.y) / 2 + 0.55;
        this.effects.burst(px, py, pz, v.velocity, Math.min(40, 8 + strength * 2), [6, 3.5, 1.4], 7, 0.55);
        this.rig.addTrauma(Math.min(0.6, 0.12 + strength * 0.03));
        this.impact = Math.min(1, this.impact + strength * 0.05);
        this.app.audio?.play('hit', { strength });
        this.app.input.vibrate(Math.min(80, 20 + strength * 4));
        if (strength > 9) this.stunts.breakCombo();
        this._damage(P, hx, hz, strength, px, pz);
        this._damage(r, -hx, -hz, strength, px, pz);
      } else if (sideHit && Math.abs(v.vf - a.v) > 1.5) {
        // rubbing door to door scuffs the paint
        const rub = dt * clamp(Math.abs(v.vf - a.v) / 10, 0.2, 1.2);
        this._scrape(P, hx, hz, rub, px, pz);
        this._scrape(r, -hx, -hz, rub, px, pz);
      }
    }
    // AI vs AI separation
    for (let i = 0; i < this.ais.length; i++) {
      for (let j = i + 1; j < this.ais.length; j++) {
        const ra = this.ais[i];
        const rb = this.ais[j];
        const a = ra.ai;
        const b = rb.ai;
        const ds = tr.deltaS(b.s, a.s);
        const dd = b.d - a.d;
        const LEN = 0.968 * ((ra.def.dims?.length ?? 4.6) + (rb.def.dims?.length ?? 4.6)) * 0.5;
        if (Math.abs(ds) < LEN && Math.abs(dd) < WID) {
          // closing speed, nose to tail or side by side, for the crash damage
          const hit = Math.abs(ds) > Math.abs(dd) * 1.6 ? Math.abs(a.v - b.v) : Math.abs(a.vd - b.vd) + 1;
          const pen = WID - Math.abs(dd);
          const sgn = Math.sign(dd) || 1;
          // (the lighter car gives way more)
          const ma = ra.def.stats.mass ?? 1;
          const mb = rb.def.stats.mass ?? 1;
          a.d -= sgn * pen * (mb / (ma + mb));
          b.d += sgn * pen * (ma / (ma + mb));
          if (ds > 0 && a.v > b.v) a.v = lerp(a.v, b.v, 0.5);
          else if (ds < 0 && b.v > a.v) b.v = lerp(b.v, a.v, 0.5);
          if (hit > 4 && this.clock - (ra.hitT ?? -9) > 0.4 && this.clock - (rb.hitT ?? -9) > 0.4) {
            ra.hitT = rb.hitT = this.clock;
            // contact normal from a toward b: along a's nose, or out of its side (right = (-fwd.z, fwd.x))
            const nose = Math.abs(ds) > Math.abs(dd) * 1.6;
            const cs = nose ? (ds > 0 ? 1 : -1) : sgn;
            const hx = (nose ? a.fwd.x : -a.fwd.z) * cs;
            const hz = (nose ? a.fwd.z : a.fwd.x) * cs;
            const px = (a.position.x + b.position.x) / 2;
            const pz = (a.position.z + b.position.z) / 2;
            this._damage(ra, hx, hz, hit, px, pz);
            this._damage(rb, -hx, -hz, hit, px, pz);
          }
        }
      }
    }
  }

  /**
   * Crash damage to racer r at `strength` m/s. (nx, nz): world direction from the car toward the
   * hit; (mx, mz): where two cars meet (walls leave it out: whatever sticks out furthest hits).
   */
  _damage(r, nx, nz, strength, mx, mz) {
    const m = r.model;
    const dmg = m.damage;
    if (!dmg) return;
    const src = r.isPlayer ? r.vehicle : r.ai;
    _dq.copy(src.quat).invert();
    _dv.set(nx, 0, nz).applyQuaternion(_dq);
    let events;
    if (mx === undefined) events = dmg.hitToward(_dv.x, _dv.z, strength);
    else {
      _dv2.set(mx - src.position.x, 0, mz - src.position.z).applyQuaternion(_dq);
      events = dmg.hitAt(_dv2, _dv.x, _dv.z, strength);
    }
    if (!events.length) return;
    const d2 = m.group.position.distanceToSquared(this.camera.position);
    if (d2 > 140 * 140) return;
    const vel = r.isPlayer ? r.vehicle.velocity : r.ai.velocity;
    m.group.updateMatrixWorld();
    let glass = 0;
    for (const e of events) {
      _dv.copy(e.p).applyMatrix4(m.body.matrixWorld);
      if (e.kind === 'debris') this.effects.debris(_dv.x, _dv.y, _dv.z, vel, e.n);
      else {
        this.effects.glints(_dv.x, _dv.y, _dv.z, vel, e.n);
        if (e.kind === 'lamp') this.effects.debris(_dv.x, _dv.y, _dv.z, vel, 3);
        glass = Math.max(glass, e.kind === 'glass' ? 1 : 0.6);
      }
    }
    if (glass && d2 < 40 * 40) this.app.audio?.play('glass', { strength: glass * (r.isPlayer ? 1 : 0.6) });
  }

  /** Paint scraped toward world direction (nx, nz), around (mx, mz) if given; amount ~ seconds of hard contact. */
  _scrape(r, nx, nz, amount, mx, mz) {
    const dmg = r.model.damage;
    if (!dmg) return;
    const src = r.isPlayer ? r.vehicle : r.ai;
    _dq.copy(src.quat).invert();
    _dv.set(nx, 0, nz).applyQuaternion(_dq);
    if (mx !== undefined) _dv2.set(mx - src.position.x, 0, mz - src.position.z).applyQuaternion(_dq);
    dmg.scrapeToward(_dv.x, _dv.z, amount, mx === undefined ? null : _dv2);
  }

  _nm(r) {
    let st = this.player.nm.get(r);
    if (!st) {
      st = { prevDs: 0, minDD: 99, touched: false, slip: 0, slipShown: false, slipUntil: 0 };
      this.player.nm.set(r, st);
    }
    return st;
  }

  _interactions(dt) {
    if (this.phase !== 'racing' || this.player.finished) return;
    const tr = this.track;
    const v = this.player.vehicle;
    let slipTarget = 0;
    for (const r of this.ais) {
      const a = r.ai;
      const st = this._nm(r);
      const ds = tr.deltaS(a.s, v.s);
      const dd = Math.abs(a.d - v.d);
      if (Math.abs(ds) < 7) st.minDD = Math.min(st.minDD, dd);
      // passed this car?
      if (st.prevDs > 0 && ds <= 0 && Math.abs(ds) < 10) {
        if (!st.touched && st.minDD < 3.4 && v.vf - a.v > 3 && v.speed > 25) {
          const razor = st.minDD < 2.45;
          this.stunts.add('nearMiss', razor ? 450 : 220, t(razor ? 'pop.razor' : 'pop.nearMiss'), { big: razor });
          v.addNitro(razor ? 0.5 : 0.3);
          // a camera kick reads as a burst of speed, so only the closest passes get one
          if (razor) this.rig.kick(9);
          this.app.audio?.play('whoosh', { side: Math.sign(a.d - v.d), razor });
          this.app.input.vibrate(18);
          if (razor && v.speed > 45 && (this._lastSlowmo ?? -99) < this.clock - 5) {
            this._lastSlowmo = this.clock;
            this.timeScaleTarget = 0.32;
            this.slowmo = 0.38;
          }
        }
        if (st.slipUntil > this.clock) {
          this.stunts.add('slipstream', 250, t('pop.slingshot'));
          st.slipUntil = 0;
        }
        st.minDD = 99;
        st.touched = false;
      }
      if (Math.abs(ds) > 14) {
        st.minDD = 99;
        st.touched = false;
      }
      st.prevDs = ds;
      // slipstream (drafting)
      if (ds > 3.5 && ds < 34 && dd < 1.6 && v.speed > 30) {
        st.slip = Math.min(1.5, st.slip + dt);
        slipTarget = Math.max(slipTarget, clamp(st.slip / 0.7, 0, 1));
        if (st.slip > 0.7) {
          v.addNitro(dt * 0.2);
          st.slipUntil = this.clock + 2.5;
          if (!st.slipShown) {
            st.slipShown = true;
            this.emit('popup', { kind: 'info', label: t('pop.slipstream'), points: 0, combo: 1 });
          }
        }
      } else {
        st.slip = Math.max(0, st.slip - dt * 2);
        if (st.slip === 0) st.slipShown = false;
      }
    }
    v.slipstream = damp(v.slipstream, slipTarget, 3, dt);
  }

  _onNitro() {
    this.flash = Math.max(this.flash, 0.06);
    this.flashColor = [1.0, 0.7, 0.35];
    this.rig.kick(14);
    this.rig.addTrauma(0.25);
    this.app.audio?.play('nitro');
    this.app.input.vibrate([30, 30, 50]);
    const v = this.player.vehicle;
    const m = this.player.model;
    for (const e of m.exhaustPos) {
      _v.copy(e).applyMatrix4(m.body.matrixWorld);
      this.effects.burst(_v.x, _v.y, _v.z, v.velocity, 10, [0.8, 1.4, 3.2], 5, 0.4);
    }
  }

  _handleEvents(dt, ctrl) {
    const P = this.player;
    const v = P.vehicle;
    const m = P.model;
    for (const e of v.events) {
      switch (e.type) {
        case 'nitro':
          break;
        case 'pad':
          this.rig.kick(8);
          this.app.audio?.play('pad');
          this.app.input.vibrate(25);
          break;
        case 'driftStart':
          break;
        case 'driftTier':
          this.app.audio?.play('tier', { tier: e.tier });
          break;
        case 'miniturbo': {
          this.emit('popup', { kind: 'turbo', label: t(`turbo.${e.tier}`), points: 0, combo: 1, tier: e.tier });
          this.rig.kick(5 + e.tier * 3);
          this.app.audio?.play('turbo', { tier: e.tier });
          this.app.input.vibrate(20 + e.tier * 10);
          const col = TIER_COLORS[e.tier];
          for (const w of [m.wheels[2], m.wheels[3]]) {
            w.pivot.getWorldPosition(_v);
            this.effects.burst(_v.x, _v.y, _v.z, v.velocity, 10 + e.tier * 6, col, 6, 0.45);
          }
          break;
        }
        case 'driftEnd':
          if (!P.finished) this.stunts.driftEnd(false);
          break;
        case 'driftFail':
          this.stunts.driftEnd(true);
          break;
        case 'wall': {
          const s = e.strength;
          this.rig.addTrauma(Math.min(0.7, 0.1 + s * 0.035));
          this.impact = Math.min(1, this.impact + s * 0.04);
          if (s > 12) {
            this.flash = Math.max(this.flash, 0.06);
            this.flashColor = [0.8, 0.1, 0.05];
          }
          const n = Math.min(60, 10 + s * 2.5);
          const side = e.side;
          const f = v.frame;
          const hl = Math.hypot(f.rx, f.rz) || 1;
          this.effects.burst(e.x + (f.rx / hl) * side * 1.0, e.y, e.z + (f.rz / hl) * side * 1.0, v.velocity, n, [6, 3.2, 1.2], 9, 0.6);
          this.app.audio?.play('crash', { strength: s, side });
          this.app.input.vibrate(Math.min(100, 25 + s * 4));
          if (s > 10) this.stunts.breakCombo();
          this._damage(P, (f.rx / hl) * side, (f.rz / hl) * side, s);
          break;
        }
        case 'land': {
          if (e.air > 0.55 && !P.finished && this.phase === 'racing') {
            this.stunts.add('air', Math.round(e.air * 650), t(e.air > 1.1 ? 'pop.massiveAir' : 'pop.bigAir'), { big: e.air > 1.1 });
            v.addNitro(0.4);
          }
          if (e.strength > 5) {
            this.rig.addTrauma(Math.min(0.6, e.strength * 0.03));
            for (const w of m.wheels) {
              w.pivot.getWorldPosition(_v);
              this.effects.burst(_v.x, _v.y - 0.3, _v.z, v.velocity, 6, [6, 3.4, 1.4], 5, 0.4);
            }
            this.app.audio?.play('land', { strength: e.strength });
            this.app.input.vibrate(40);
          }
          if (this.timeScaleTarget < 1 && this._airSlowmo) {
            this._airSlowmo = false;
            this.timeScaleTarget = 1;
          }
          break;
        }
        case 'shift':
          if (Math.random() < 0.22 && ctrl.throttle > 0.5 && e.gear > 3) {
            m.triggerBackfire();
            this.app.audio?.play('backfire');
          }
          this.app.audio?.shift?.();
          break;
        default:
          break;
      }
    }
    v.events.length = 0;
    // big air slow motion
    if (!v.grounded && v.airTime > 0.38 && !this._airSlowmo && this.phase === 'racing' && v.vy > -2) {
      this._airSlowmo = true;
      this.timeScaleTarget = 0.55;
      this.slowmo = 0.7;
    }
    for (const r of this.ais) r.ai.events.length = 0;
  }

  _laps() {
    const L = this.track.length;
    for (const r of this.racers) {
      if (r.finished) continue;
      const idx = Math.floor(r.progress / L);
      if (idx > r.lapIdx) {
        if (r.lapIdx >= 0 || idx >= 1) {
          if (r.lapIdx >= 0 && this.phase !== 'countdown') {
            const lt = this.time - r.lapStart;
            r.lapTimes.push(lt);
            r.bestLap = Math.min(r.bestLap, lt);
            r.lapStart = this.time;
            if (r.isPlayer && idx < this.laps) {
              const isBest = lt <= r.bestLap;
              this.emit('lap', { lap: idx + 1, laps: this.laps, time: lt, best: isBest, final: idx + 1 === this.laps });
              this.app.audio?.play('lap', { final: idx + 1 === this.laps });
              // the music lifts for the last lap
              if (idx + 1 === this.laps) this.app.audio?.setMusicIntensity(1.3);
            }
          }
        }
        r.lapIdx = idx;
        if (idx >= this.laps && this.phase !== 'countdown' && this.phase !== 'intro') this._finish(r);
      }
    }
  }

  _finish(r) {
    r.finished = true;
    r.finishTime = this.time;
    if (r.isPlayer) {
      this.phase = 'finish';
      this.phaseTime = 0;
      this.timeScaleTarget = 0.28;
      this.slowmo = 1.4;
      this.rig.startOrbit();
      this.flash = 0.12;
      this.flashColor = [1, 0.9, 0.75];
      this.app.audio?.play('finish', { place: r.place });
      this.app.input.vibrate([50, 40, 80]);
      if (r.vehicle.drift.active) this.stunts.driftEnd(false);
      this.emit('finish', { place: r.place, total: this.racers.length, time: r.finishTime });
    }
  }

  _positions() {
    const sorted = sortInPlace(this._order || (this._order = this.racers.slice()), byPlace);
    const prev = this.player.place;
    for (let i = 0; i < sorted.length; i++) sorted[i].place = i + 1;
    this.order = sorted;
    if (this.phase === 'racing' && prev && this.player.place < prev && !this.player.finished) {
      const gained = prev - this.player.place;
      for (let k = 0; k < gained; k++) this.stunts.add('overtake', 100, t('pop.overtake'), { chain: false });
    }
  }

  _updateModels(dt) {
    const P = this.player;
    const v = P.vehicle;
    const m = P.model;
    m.group.position.copy(v.position);
    m.group.quaternion.copy(v.quat);
    m.setBodyTilt(v.roll, v.pitch, v.squirm);
    this._castShadow(m, v.frame.i, v.x, v.y, v.z, v.y - v.groundPrev);
    const st = _modelState;
    st.speed = v.vf;
    st.steer = this.app.input.state.steer * (P.finished ? 0 : 1);
    st.brake = v.braking;
    st.boost = v.boostLevel;
    st.drift = v.drift.active;
    st.reverse = v.reversing;
    m.update(dt, st);
    // light streaks sliding over the paint (stronger in tunnels / under lamps)
    this._dist = (this._dist || 0) + v.speed * dt;
    const lum = this.probe ? this.probe.intensity / 6 : 0.3;
    const tun = v.frame.tunnel ? 1 : 0;
    m.setStreaks(-this._dist * 0.3, 0.12 + Math.min(lum, 2) * 0.18 + tun * 0.3 + v.boostLevel * 0.15, _c.copy(this.probe ? this.probe.color : _c.setRGB(1, 1, 1)).lerp(_white, 0.45), v.fwd);
    for (const r of this.ais) {
      const a = r.ai;
      r.model.setStreaks(-a.progress * 0.3, a.frame.tunnel ? 0.45 : 0.15, null, a.fwd);
      r.model.group.position.copy(a.position);
      r.model.group.quaternion.copy(a.quat);
      this._castShadow(r.model, a.frame.i, a.position.x, a.position.y, a.position.z, a.y - a.groundPrev);
      r.model.setBodyTilt(clamp(-a.driftVis * 0.08, -0.05, 0.05), 0);
      st.speed = a.v;
      st.steer = clamp(-a.vd * 0.15 + a.driftVis, -1, 1);
      st.brake = false;
      st.boost = a.boostLevel;
      st.drift = false;
      st.reverse = false;
      r.model.update(dt, st);
    }
  }

  _emitEffects(dt) {
    const fx = this.effects;
    const time = fx.time;
    const camPos = this.camera.position;
    const wet = this.world.rain;
    for (const r of this.racers) {
      const m = r.model;
      const isP = r.isPlayer;
      const speed = isP ? r.vehicle.speed : r.ai.v;
      const boost = isP ? r.vehicle.boostLevel : r.ai.boostLevel;
      const near = m.group.position.distanceToSquared(camPos) < 160 * 160;
      m.group.updateMatrixWorld();
      // tail light trails
      for (let k = 0; k < 2; k++) {
        const tr = r.trails[k];
        if (!tr) continue;
        if (near) {
          _v.copy(m.tailLightPos[k]).applyMatrix4(m.body.matrixWorld);
          fx.trails.push(tr, _v.x, _v.y, _v.z, time);
        } else if (tr.pts.length) fx.trails.reset(tr);
        tr.intensity = (clamp((speed - 22) / 45, 0, 1) * (isP ? 1.0 : 0.8) + boost * 1.2) * (m.damage ? m.damage.tailOn(k) : 1);
        tr.color.copy(m.trailColor).multiplyScalar(2.0);
        tr.width = (isP ? 0.055 : 0.045) * (1 + boost * 0.9);
      }
      if (!near) continue;
      const drifting = isP ? r.vehicle.drift.active && r.vehicle.grounded : Math.abs(r.ai.driftVis) > 0.18;
      const vel = isP ? r.vehicle.velocity : r.ai.velocity;
      // a battered nose steams (not into the bumper camera)
      const dmg = m.damage;
      if (dmg && dmg.smoke > 0 && !(isP && this.rig.hideCar) && Math.random() < 0.3 + dmg.smoke * 0.6) {
        const s = dmg.smoke;
        _v.copy(dmg.smokePoint).applyMatrix4(m.body.matrixWorld);
        fx.puff(
          _v.x + (Math.random() - 0.5) * 0.4,
          _v.y,
          _v.z + (Math.random() - 0.5) * 0.4,
          vel.x * 0.55 + (Math.random() - 0.5),
          0.8 + Math.random() * 0.8,
          vel.z * 0.55 + (Math.random() - 0.5),
          STEAM,
          0.1 + 0.2 * s,
          0.3,
          1.4 + s * 1.4,
          1 + s * 0.6,
        );
      }
      // tyre smoke while the driven wheels spin off the line (rivals: as they pull away)
      let spin = 0;
      if (isP) spin = r.vehicle.wheelspin;
      else {
        if (!r.ai.frozen && r.ai.v > 0.3 && r.ai.v > (r.prevV ?? 0)) spin = clamp(1 - r.ai.v / 11, 0, 1) * 0.55;
        r.prevV = r.ai.v;
      }
      if (spin > 0.12) {
        for (let k = 2; k < 4; k++) {
          const w = m.wheels[k];
          if (Math.random() > spin) continue;
          w.pivot.getWorldPosition(_v);
          fx.puff(
            _v.x + (Math.random() - 0.5) * 0.3,
            _v.y - w.r * 0.6,
            _v.z + (Math.random() - 0.5) * 0.3,
            vel.x * 0.3 + (Math.random() - 0.5) * 1.5,
            0.4 + Math.random() * 0.6,
            vel.z * 0.3 + (Math.random() - 0.5) * 1.5,
            wet ? SPIN_WET : SPIN_DRY,
            (wet ? 0.2 : 0.34) * spin + 0.06,
            0.45,
            2.2 + spin * 1.8,
            wet ? 0.8 : 1.4,
          );
        }
      }
      // drift smoke from rear wheels (tinted neon by the underglow)
      if (drifting && speed > 12) {
        const ug = m.underglow.visible ? m.underglowMat.uniforms.uColor.value : _c.setRGB(0.6, 0.6, 0.7);
        const amt = isP ? clamp(r.vehicle.drift.slip, 0.2, 1) : 0.5;
        _smokeCol[0] = lerp(0.55, ug.r * 0.35, 0.45);
        _smokeCol[1] = lerp(0.55, ug.g * 0.35, 0.45);
        _smokeCol[2] = lerp(0.6, ug.b * 0.35, 0.45);
        for (let k = 2; k < 4; k++) {
          const w = m.wheels[k];
          w.pivot.getWorldPosition(_v);
          if (Math.random() < 0.85 * amt) {
            fx.puff(
              _v.x + (Math.random() - 0.5) * 0.4,
              _v.y - 0.15,
              _v.z + (Math.random() - 0.5) * 0.4,
              vel.x * 0.25 + (Math.random() - 0.5) * 2,
              0.6 + Math.random() * 0.8,
              vel.z * 0.25 + (Math.random() - 0.5) * 2,
              _smokeCol,
              isP ? 0.32 : 0.22,
              0.7,
              isP ? 4.2 : 3.2,
              1.5,
            );
          }
          if (isP && r.vehicle.drift.tier > 0 && Math.random() < 0.6) {
            const col = TIER_COLORS[r.vehicle.drift.tier];
            fx.spark(_v.x, _v.y - 0.2, _v.z, vel.x * 0.8 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, vel.z * 0.8 + (Math.random() - 0.5) * 4, col, 0.35, 0.05, 0.03);
          }
        }
      }
      // neon skid light trails for the player (two slots per wheel so separate drifts never join)
      if (isP && r.skids) {
        const on = drifting && speed > 12;
        if (on && !r.wasDrifting) {
          r.skidSlot ^= 1;
          fx.skids.reset(r.skids[r.skidSlot * 2]);
          fx.skids.reset(r.skids[r.skidSlot * 2 + 1]);
        }
        r.wasDrifting = on;
        if (on) {
          const ug = m.underglow.visible ? m.underglowMat.uniforms.uColor.value : _c.setRGB(1.2, 1.2, 1.4);
          _v2.set(1, 0, 0).applyQuaternion(m.group.quaternion);
          for (let k = 0; k < 2; k++) {
            const sk = r.skids[r.skidSlot * 2 + k];
            const w = m.wheels[2 + k];
            w.pivot.getWorldPosition(_v);
            fx.skids.push(sk, _v.x, _v.y - w.r + 0.05, _v.z, time, _v2.x, _v2.y, _v2.z);
            sk.color.copy(ug).multiplyScalar(0.9);
            sk.intensity = 1;
          }
        }
      }
      // wall scrape sparks
      if (isP && r.vehicle.wallContact > 0.15) {
        const v = r.vehicle;
        const f = v.frame;
        const hl = Math.hypot(f.rx, f.rz) || 1;
        const side = v.wallSide || 1;
        this._scrape(r, (f.rx / hl) * side, (f.rz / hl) * side, dt * v.wallContact * clamp(v.speed / 30, 0.2, 1.5));
        const n = Math.ceil(v.wallContact * 4);
        for (let i = 0; i < n; i++) {
          fx.spark(
            v.x + (f.rx / hl) * side * 1.05 + (Math.random() - 0.5) * 1.5 * f.tx,
            v.y + 0.35 + Math.random() * 0.3,
            v.z + (f.rz / hl) * side * 1.05 + (Math.random() - 0.5) * 1.5 * f.tz,
            vel.x * 0.75 + (Math.random() - 0.5) * 5,
            Math.random() * 4,
            vel.z * 0.75 + (Math.random() - 0.5) * 5,
            SCRAPE,
            0.45,
            0.05,
            0.05,
          );
        }
      }
      // boost exhaust sparks
      if (boost > 0.3 && Math.random() < (isP ? 0.6 : 0.25)) {
        const e = m.exhaustPos[Math.floor(Math.random() * m.exhaustPos.length)];
        _v.copy(e).applyMatrix4(m.body.matrixWorld);
        fx.spark(_v.x, _v.y, _v.z, vel.x * 0.85 + (Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, vel.z * 0.85 + (Math.random() - 0.5) * 3, EXHAUST, 0.2, 0.04, 0.03);
      }
      // rain spray (not off the dry road under a roof)
      const gp = m.group.position;
      if (wet && speed > 18 && Math.random() < 0.9 && !this.world.cover.covers(gp.x, gp.y + 1, gp.z)) {
        for (let k = 2; k < 4; k++) {
          m.wheels[k].pivot.getWorldPosition(_v);
          fx.puff(_v.x, _v.y - 0.1, _v.z, vel.x * 0.6, 0.8 + Math.random(), vel.z * 0.6, SPRAY, 0.09 * clamp(speed / 60, 0.3, 1.2), 0.6, 3.2, 0.7);
        }
      }
    }
  }

  _updateLamps() {
    if (!this.lampLights || !this.lampLights.length) return;
    const v = this.player.vehicle;
    aimLampLights(this.world, v.frame.i, v.x, v.y, v.z, this.lampLights);
  }

  /** The lamps that light the rain ahead of the camera, and whether the camera is under a roof. */
  _updateRain(dtReal) {
    if (!this.world.rain) return;
    const v = this.player.vehicle;
    const f = this.effects.rainFocus;
    this.effects.lightRain(this.rainLamps, pickLamps(this.world, v.frame.i, f.x, f.y, f.z, 16, this.rainLamps));
    const cam = this.camera.position;
    this.shelter = damp(this.shelter, this.world.cover.covers(cam.x, cam.y, cam.z) ? 1 : 0, 3, dtReal);
  }

  _castShadow(model, i, x, y, z, air) {
    castCarShadow(this.world, model, i, x, y, z, air);
  }

  /**
   * Headlights for the world shaders: the player's car always, plus the rivals nearest the camera
   * (they fade with distance, so a slot can change hands without the light popping).
   */
  _updateHeadlights() {
    const G = globalUniforms;
    const slots = this.app.renderer.presetName === 'low' ? 2 : MAX_HEADLIGHTS;
    const cam = this.camera.position;
    const cand = this._headCand || (this._headCand = this.racers.slice());
    for (const r of cand) r.camD2 = r.isPlayer ? -1 : r.ai.position.distanceToSquared(cam);
    sortInPlace(cand, byCamDist);
    for (let k = 0; k < MAX_HEADLIGHTS; k++) {
      const prm = G.uHeadParams.value[k];
      const r = k < slots ? cand[k] : null;
      if (!r || r.camD2 > HEAD_FADE_FAR * HEAD_FADE_FAR) {
        prm.x = 0;
        continue;
      }
      const src = r.isPlayer ? r.vehicle : r.ai;
      const lamp = r.model.headLamp;
      G.uHeadPos.value[k].copy(src.position).addScaledVector(src.fwd, lamp.z).addScaledVector(src.up, lamp.y);
      G.uHeadFwd.value[k].copy(src.fwd);
      G.uHeadUp.value[k].copy(src.up);
      const fade = r.isPlayer ? 1 : smoothstep(HEAD_FADE_FAR, HEAD_FADE_FAR * 0.65, Math.sqrt(r.camD2));
      prm.set((r.isPlayer ? HEAD_POWER : HEAD_POWER_RIVAL) * fade, HEAD_RANGE, lamp.x, r.model.damage ? r.model.damage.headCode() : 0);
    }
  }

  _updateProbe(dt) {
    const v = this.player.vehicle;
    this.world.lightAt(v.frame.i, v.x, v.y, v.z, _c);
    const lum = _c.r * 0.3 + _c.g * 0.59 + _c.b * 0.11;
    this.probeColor.r = damp(this.probeColor.r, _c.r, 6, dt);
    this.probeColor.g = damp(this.probeColor.g, _c.g, 6, dt);
    this.probeColor.b = damp(this.probeColor.b, _c.b, 6, dt);
    const m = Math.max(this.probeColor.r, this.probeColor.g, this.probeColor.b, 0.001);
    this.probe.color.setRGB(this.probeColor.r / m, this.probeColor.g / m, this.probeColor.b / m);
    this.probe.intensity = damp(this.probe.intensity, clamp(lum, 0, 2.5) * 6, 6, dt);
    this.probe.position.copy(v.position).addScaledVector(v.up, 3.2);
  }

  _updateFx(dtReal) {
    const v = this.player.vehicle;
    const fx = this.fx;
    const st = this.app.settings;
    const sp = clamp(v.speed / v.topSpeed, 0, 1.4);
    const boost = v.boostLevel;
    const pal = this.world.palette;
    this.flash = Math.max(0, this.flash - dtReal * 2.2);
    this.impact = Math.max(0, this.impact - dtReal * 2.5);
    // lightning in the rain: a few strokes light the cloud deck from inside, and the street
    // catches the cold light from the sky (little of it under a roof)
    let bolt = 0;
    if (this.world.rain) {
      this.nextLightning -= dtReal;
      if (this.nextLightning <= 0) {
        this.nextLightning = 18 + Math.random() * 20;
        this.lightning = 1;
        const a = Math.random() * Math.PI * 2;
        globalUniforms.uFlashDir.value.set(Math.cos(a), Math.sin(a));
        setTimeout(() => this.app.audio?.play('thunder'), 300 + Math.random() * 900);
      }
      this.lightning = Math.max(0, this.lightning - dtReal * 2.5);
      if (!st.reduceFlashes) bolt = this.lightning * (0.25 + 0.75 * Math.max(0, Math.sin(this.lightning * 30)));
    }
    globalUniforms.uFlash.value = bolt * 1.1;
    const skyLight = bolt * (1 - this.shelter * 0.85);
    globalUniforms.uAmbient.value.copy(this.baseAmbient).add(_c.setRGB(0.62, 0.66, 0.85).multiplyScalar(skyLight * 0.5));
    this.world.env.moon.intensity = this.world.env.moonIntensity + skyLight * 2.5;
    this.world.env.hemi.intensity = this.baseHemi + skyLight;
    const blurMul = st.motionBlur ?? 1;
    const inTunnel = v.frame.tunnel;
    fx.blur = ((0.003 + 0.027 * sp * sp) * (inTunnel ? 1.15 : 1) + boost * 0.035) * blurMul * (1 - this.rig.hideCar * 0.3);
    fx.ca = (0.0012 + boost * 0.0075 + this.impact * 0.012 + (this.timeScale < 0.8 ? 0.004 : 0)) * (st.chromatic ?? 1);
    fx.speedLines = Math.max(0, boost - 0.3) * 0.35 * (st.speedLines ?? 1);
    fx.vignette = 0.38 + boost * 0.22 + (1 - this.timeScale) * 0.25;
    fx.flash = this.flash;
    fx.flashColor = this.flashColor;
    fx.reflect = (this.world.rain ? 0.62 : 0.3) + (inTunnel ? 0.18 : 0);
    // wet air spreads every light into a slightly wider halo
    fx.bloomThreshold = this.world.rain ? 1.3 : 1.5;
    fx.bloomStrength = 0.34 + boost * 0.06 + (this.world.rain ? 0.04 : 0);
    fx.exposure = (pal.exposure ?? 1) * (1 + boost * 0.06);
    fx.tint = pal.tint || [1, 1, 1];
    fx.desat = clamp((1 - this.timeScale) * 0.5, 0, 0.45);
    fx.anamorphic = this.app.renderer.preset.anamorphic ? 0.1 + boost * 0.08 : 0;
    fx.saturation = 1.0;
    fx.grain = 0.02;
    // radial blur centre = focus of expansion of the camera's motion
    const cam = this.camera;
    if (v.speed > 4) {
      _v.copy(v.velocity).normalize().multiplyScalar(400).add(cam.position);
    } else {
      cam.getWorldDirection(_v).multiplyScalar(400).add(cam.position);
    }
    _v.project(cam);
    fx.center[0] = clamp(_v.x * 0.5 + 0.5, 0.22, 0.78);
    fx.center[1] = clamp(_v.y * 0.5 + 0.5, 0.22, 0.78);
    cam.getWorldDirection(_v2);
    _v2.y = 0;
    _v2.normalize().multiplyScalar(1000).add(cam.position);
    _v2.project(cam);
    fx.horizon = clamp(_v2.y * 0.5 + 0.5, 0.2, 0.95);
  }

  _updateAudio(dt) {
    const a = this.app.audio;
    if (!a) return;
    const v = this.player.vehicle;
    let nearest = null;
    let nd = 1e9;
    for (const r of this.ais) {
      const d = r.model.group.position.distanceTo(this.camera.position);
      if (d < nd) {
        nd = d;
        nearest = r;
      }
    }
    // one state object, refilled every frame
    const st = this._audioState || (this._audioState = {});
    st.rpm = v.rpm;
    st.electric = !!this.player.def.electric;
    st.throttle = this.phase === 'racing' || this.player.finished ? this.app.input.state.throttle : 0.25;
    st.speed = v.speed;
    st.topSpeed = v.topSpeed;
    st.boost = v.boostLevel;
    st.drift = Math.max(v.drift.active ? clamp(v.drift.slip, 0, 1) : 0, v.wheelspin * 0.7);
    st.scrape = v.wallContact;
    st.tunnel = v.frame.tunnel ? 1 : 0;
    st.airborne = !v.grounded;
    st.timeScale = this.timeScale;
    st.opponentDist = nd;
    st.opponentSpeed = nearest ? nearest.ai.v : 0;
    st.relSpeed = nearest ? v.speed - nearest.ai.v : 0;
    // how loud the rain is: none under a roof
    st.wet = this.world.rain ? 1 - this.shelter : 0;
    // sirens: yours (the fast yelp while nitro fires), and once the race is on the nearest rival
    // patrol car's, heard only close by
    st.siren = this.siren;
    st.sirenYelp = this.siren && v.boostTime > 0 && v.boostKind === 'nitro';
    let patrol = null;
    let pd = 45;
    if (this.phase === 'racing' || this.phase === 'finish') {
      for (const r of this.ais) {
        if (!r.def.patrol) continue;
        const d = r.model.group.position.distanceTo(this.camera.position);
        if (d < pd) {
          pd = d;
          patrol = r;
        }
      }
    }
    st.rivalSiren = patrol ? 1 - pd / 45 : 0;
    if (patrol) {
      // which side of the camera it's on, and pitched up while it closes in
      _sv.subVectors(patrol.model.group.position, this.camera.position);
      _sv2.setFromMatrixColumn(this.camera.matrixWorld, 0);
      st.rivalSirenPan = clamp(_sv.dot(_sv2) / Math.max(pd, 1), -1, 1) * 0.85;
      const closing = patrol.progress < this.player.progress ? patrol.ai.v - v.speed : v.speed - patrol.ai.v;
      st.rivalSirenPitch = 1 + clamp(closing / 340, -0.12, 0.12);
    }
    st.dt = dt;
    a.updateRace(st);
  }

  _updateHud() {
    const P = this.player;
    const v = P.vehicle;
    const h = this.hud;
    h.phase = this.phase;
    h.place = P.place;
    h.total = this.racers.length;
    h.lap = clamp(P.lapIdx + 1, 1, this.laps);
    h.laps = this.laps;
    h.time = this.time;
    h.lapTime = this.phase === 'racing' ? this.time - P.lapStart : 0;
    h.bestLap = P.bestLap;
    h.speed = v.speed;
    h.gear = v.reversing ? 'R' : P.def.electric ? 'D' : v.gear;
    h.rpm = v.rpm;
    h.nitro = v.nitro;
    h.nitroMax = v.nitroMax;
    h.boost = v.boostLevel;
    h.driftTier = v.drift.active ? v.drift.tier : -1;
    h.driftTime = v.drift.active ? v.drift.time : 0;
    h.combo = this.stunts.combo;
    h.comboTimer = this.stunts.comboTimer / this.stunts.comboWindow;
    h.style = this.stunts.total;
    h.wrongWay = v.wrongWay > 1 && this.phase === 'racing';
    h.slipstream = v.slipstream;
    h.timeScale = this.timeScale;
    h.mode = this.cfg.mode;
  }

  /** Minimap data: track polyline + cars. */
  /** Where everyone is, for the minimap (one object, refilled on every call). */
  minimapData() {
    const d =
      this._map ||
      (this._map = {
        track: this.track,
        cars: this.racers.map((r) => ({ x: 0, z: 0, player: r.isPlayer, color: r.color })),
        ghostAt: { x: 0, z: 0 },
        ghost: null,
      });
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      d.cars[i].x = r.isPlayer ? r.vehicle.x : r.ai.position.x;
      d.cars[i].z = r.isPlayer ? r.vehicle.z : r.ai.position.z;
    }
    const g = this.ghostModel && this.ghostModel.group.visible ? this.ghostModel.group.position : null;
    if (g) {
      d.ghostAt.x = g.x;
      d.ghostAt.z = g.z;
    }
    d.ghost = g ? d.ghostAt : null;
    return d;
  }

  getResults() {
    const L = this.track.length;
    const totalDist = this.laps * L;
    const P = this.player;
    const rows = this.order.map((r) => {
      let time = r.finished ? r.finishTime : null;
      if (!r.finished) {
        // estimate from remaining distance and average speed
        const avg = Math.max(10, (r.progress + 14) / Math.max(1, this.time));
        time = this.time + Math.max(0, totalDist - r.progress) / avg;
      }
      return { name: r.name, place: r.place, time, estimated: !r.finished, isPlayer: r.isPlayer, car: r.def.name, color: r.color, bestLap: r.bestLap };
    });
    return {
      mode: this.cfg.mode,
      trackId: this.cfg.trackId,
      trackKey: this.track.key,
      trackName: this.world.def.name,
      variant: this.cfg.variant,
      laps: this.laps,
      place: P.place,
      total: this.racers.length,
      time: P.finishTime,
      bestLap: P.bestLap,
      lapTimes: P.lapTimes,
      style: this.stunts.total,
      counts: { ...this.stunts.counts },
      best: { ...this.stunts.best },
      rows,
      ghost: this.recorder ? this.recorder.encode() : null,
    };
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.app.renderer.render(this.scene, this.camera, this.fx, this.clock);
  }

  dispose() {
    for (const p of globalUniforms.uHeadParams.value) p.x = 0;
    globalUniforms.uFlash.value = 0;
    globalUniforms.uAmbient.value.copy(this.baseAmbient);
    this.effects.dispose();
    for (const r of this.racers) r.model.dispose();
    if (this.ghostModel) this.ghostModel.dispose();
    this.world.dispose();
  }
}
