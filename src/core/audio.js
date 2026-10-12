// Fully synthesized audio: engine, tyres, wind, impacts, UI blips and a procedural synthwave
// soundtrack. No audio files to download - everything is generated with Web Audio.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
// Aim an audio param at a value, but only when it really changed: the engine sound updates about
// 30 params every frame, and every setTargetAtTime queues another automation event (garbage, and
// work for the audio thread) even when the value is the same as last frame's.
function aim(param, v, t, k) {
  const last = param._aim;
  if (last !== undefined && Math.abs(v - last) <= 1e-4 + Math.abs(last) * 0.002) return;
  param._aim = v;
  param.setTargetAtTime(v, t, k);
}

// game-feedback stingers: not part of the world, so slow motion doesn't muffle them and the
// pause menu doesn't mute the menu blips
const UI_SOUNDS = new Set(['ui', 'ui-back', 'ui-hover', 'buy', 'error', 'unlock', 'count', 'go', 'tier', 'lap', 'finish', 'popup', 'combo-lost']);
// rising pentatonic steps for the stunt combo chime
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const TIER_NOTE = [0, 76, 79, 83];

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.engine = null;
    this.music = null;
    this.enabled = true;
    this._curves = new Map();
  }

  unlock() {
    if (!this.ctx) this._init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.slowmo = ctx.createBiquadFilter();
    this.slowmo.type = 'lowpass';
    this.slowmo.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master.connect(this.slowmo);
    this.slowmo.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    // stingers skip the slow-motion filter (master volume is folded into its gain)
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.comp);
    this._bus = this.sfxBus;
    // reverb (tunnels + music space)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 2.6);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.9;
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.master);
    this.sfxVerb = ctx.createGain();
    this.sfxVerb.gain.value = 0.06;
    this.sfxBus.connect(this.sfxVerb);
    this.sfxVerb.connect(this.reverb);
    this.uiVerb = ctx.createGain();
    this.uiVerb.gain.value = 0.12;
    this.uiBus.connect(this.uiVerb);
    this.uiVerb.connect(this.reverb);
    // noise
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    const p = this.paused;
    this.master.gain.setTargetAtTime(s.master ?? 0.85, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(p ? 0 : s.sfx ?? 0.9, t, 0.05);
    this.uiBus.gain.setTargetAtTime((s.master ?? 0.85) * (s.sfx ?? 0.9), t, 0.05);
    this.musicBus.gain.setTargetAtTime((s.music ?? 0.55) * 0.7 * (p ? 0.45 : 1), t, 0.05);
  }

  setPaused(p) {
    this.paused = p;
    this.applyVolumes();
  }

  _distCurve(k) {
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return c;
  }

  _curve(k) {
    let c = this._curves.get(k);
    if (!c) this._curves.set(k, (c = this._distCurve(k)));
    return c;
  }

  _osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  _gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _noiseLayer(type, freq, Q, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    const g = this._gain(0);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(0, Math.random() * 1.5);
    return { src, f, g };
  }

  // ------------------------------------------------------------------ engine & race ambience
  startEngine() {
    if (!this.ctx) return;
    this.stopEngine();
    const ctx = this.ctx;
    const e = {};
    // everything continuous goes through the bed, so big hits can punch a hole in it
    e.bed = this._gain(1);
    e.bed.connect(this.sfxBus);
    e.out = this._gain(0);
    e.out.connect(e.bed);
    e.verbSend = this._gain(0.05);
    e.out.connect(e.verbSend);
    e.verbSend.connect(this.reverb);
    e.filter = ctx.createBiquadFilter();
    e.filter.type = 'lowpass';
    e.filter.Q.value = 2.2;
    e.filter.frequency.value = 500;
    e.shaper = ctx.createWaveShaper();
    e.shaper.curve = this._distCurve(2.6);
    e.am = this._gain(0.75);
    e.mix = this._gain(0.5);
    e.oscA = this._osc('sawtooth', 80);
    e.oscB = this._osc('square', 40);
    e.oscC = this._osc('sawtooth', 160);
    e.whine = this._osc('sine', 600);
    const gA = this._gain(0.5);
    const gB = this._gain(0.32);
    const gC = this._gain(0.16);
    e.gW = this._gain(0);
    e.oscA.connect(gA).connect(e.mix);
    e.oscB.connect(gB).connect(e.mix);
    e.oscC.connect(gC).connect(e.mix);
    e.mix.connect(e.am);
    e.am.connect(e.shaper);
    e.shaper.connect(e.filter);
    e.filter.connect(e.out);
    e.whine.connect(e.gW).connect(e.out);
    e.lfo = this._osc('sine', 30);
    e.lfoGain = this._gain(0.22);
    e.lfo.connect(e.lfoGain).connect(e.am.gain);
    // turbo whistle while boosting
    e.spool = this._osc('sine', 2400);
    e.gSpool = this._gain(0);
    e.spool.connect(e.gSpool).connect(e.bed);
    // tyre squeal: a wobbling tone under the screech noise - rubber stick-slip is tonal
    e.squeal = this._osc('triangle', 1100);
    const sqF = ctx.createBiquadFilter();
    sqF.type = 'bandpass';
    sqF.frequency.value = 1500;
    sqF.Q.value = 1.2;
    e.gSq = this._gain(0);
    e.squeal.connect(sqF).connect(e.gSq).connect(e.bed);
    e.sqLfo = this._osc('sine', 11);
    const sqDepth = this._gain(45);
    e.sqLfo.connect(sqDepth).connect(e.squeal.frequency);
    for (const o of [e.oscA, e.oscB, e.oscC, e.whine, e.lfo, e.spool, e.squeal, e.sqLfo]) o.start();
    e.wind = this._noiseLayer('bandpass', 600, 0.6, e.bed);
    e.screech = this._noiseLayer('bandpass', 2000, 9, e.bed);
    e.screech2 = this._noiseLayer('bandpass', 3150, 14, e.bed);
    e.scrape = this._noiseLayer('highpass', 2600, 0.7, e.bed);
    e.roar = this._noiseLayer('lowpass', 380, 0.9, e.bed);
    // the rush of a boost, above the low roar
    e.jet = this._noiseLayer('bandpass', 1100, 0.8, e.bed);
    e.rain = this._noiseLayer('highpass', 1800, 0.4, e.bed);
    // opponent engine (nearest car), panned & doppler-shifted
    e.opp = this._osc('sawtooth', 90);
    e.opp2 = this._osc('sawtooth', 181);
    e.oppF = ctx.createBiquadFilter();
    e.oppF.type = 'lowpass';
    e.oppF.frequency.value = 900;
    e.oppG = this._gain(0);
    const gOpp2 = this._gain(0.45);
    e.opp.connect(e.oppF);
    e.opp2.connect(gOpp2).connect(e.oppF);
    e.oppF.connect(e.oppG).connect(e.bed);
    e.opp.start();
    e.opp2.start();
    // lift-off: dump valve + exhaust crackle
    e.prevThr = 0;
    e.lastLift = -9;
    e.crackleUntil = 0;
    this.engine = e;
    e.out.gain.setTargetAtTime(0.18, ctx.currentTime, 0.3);
  }

  stopEngine() {
    const e = this.engine;
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    e.bed.gain.cancelScheduledValues(t);
    e.bed.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      try {
        for (const o of [e.oscA, e.oscB, e.oscC, e.whine, e.lfo, e.spool, e.squeal, e.sqLfo, e.opp, e.opp2]) o.stop();
        for (const n of [e.wind, e.screech, e.screech2, e.scrape, e.roar, e.jet, e.rain]) n.src.stop();
        e.bed.disconnect();
      } catch {
        /* already stopped */
      }
    }, 600);
    this.engine = null;
    this.slowmo.frequency.setTargetAtTime(20000, t, 0.1);
  }

  updateRace(p) {
    const e = this.engine;
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const dt = p.dt || 1 / 60;
    const sp = clamp(p.speed / (p.topSpeed || 80), 0, 1.4);
    const ts = p.timeScale ?? 1;
    const pitchMul = 0.62 + 0.38 * ts;
    const f0 = (40 + p.rpm * 175 + p.boost * 22) * pitchMul;
    const k = 0.035;
    aim(e.oscA.frequency, f0, t, k);
    aim(e.oscB.frequency, f0 * 0.5, t, k);
    aim(e.oscC.frequency, f0 * 2.006, t, k);
    aim(e.whine.frequency, f0 * 5.5, t, k);
    aim(e.lfo.frequency, f0 * 0.5, t, k);
    const thr = clamp(p.throttle, 0, 1);
    aim(e.filter.frequency, 220 + p.rpm * 1700 * (0.35 + 0.65 * thr) + p.boost * 1600, t, 0.05);
    aim(e.out.gain, (0.12 + thr * 0.13 + p.boost * 0.08) * (p.airborne ? 0.85 : 1), t, 0.06);
    aim(e.gW.gain, sp * 0.025 + p.boost * 0.05, t, 0.1);
    aim(e.wind.g.gain, sp * sp * 0.2 + p.boost * 0.06, t, 0.1);
    aim(e.wind.f.frequency, 300 + sp * 1500, t, 0.1);
    const scr = clamp(p.drift, 0, 1);
    aim(e.screech.g.gain, scr * 0.11, t, 0.05);
    aim(e.screech2.g.gain, scr * 0.05, t, 0.05);
    aim(e.screech.f.frequency, 1800 + Math.sin(t * 9) * 140 + sp * 300, t, 0.03);
    aim(e.gSq.gain, scr * scr * 0.05, t, 0.05);
    aim(e.squeal.frequency, (950 + sp * 300 + scr * 250 + (Math.random() - 0.5) * 140) * pitchMul, t, 0.04);
    aim(e.scrape.g.gain, clamp(p.scrape, 0, 1) * 0.2 * (0.6 + Math.random() * 0.4), t, 0.03);
    // boost: low roar, a jet rush that climbs with speed, a turbo whistle and flame pops
    aim(e.roar.g.gain, p.boost * 0.26, t, 0.08);
    aim(e.jet.g.gain, p.boost * 0.1, t, 0.08);
    aim(e.jet.f.frequency, 700 + p.boost * 800 + sp * 700, t, 0.1);
    aim(e.gSpool.gain, p.boost * 0.012, t, 0.15);
    aim(e.spool.frequency, (2000 + p.rpm * 1500 + p.boost * 700) * pitchMul, t, 0.12);
    if (p.boost > 0.3 && Math.random() < dt * 8 * p.boost) this._pop(0.3 * p.boost);
    // lift off at high revs: the dump valve sighs and the exhaust crackles for a moment
    if (e.prevThr > 0.7 && thr < 0.2 && p.rpm > 0.55 && sp > 0.3 && !p.airborne && ts > 0.9 && t - e.lastLift > 1.2) {
      e.lastLift = t;
      this.play('blowoff');
      e.crackleUntil = t + rand(0.35, 0.8);
    }
    e.prevThr = thr;
    if (t < e.crackleUntil && Math.random() < dt * 14) this._pop(rand(0.15, 0.32));
    // p.wet: 0 dry or sheltered .. 1 out in the rain
    aim(e.rain.g.gain, +p.wet * (0.035 + sp * 0.03), t, 0.3);
    aim(e.verbSend.gain, p.tunnel ? 0.55 : 0.04, t, 0.25);
    // opponent pass-by
    const near = clamp(1 - p.opponentDist / 70, 0, 1);
    aim(e.oppG.gain, near * near * 0.08, t, 0.05);
    const doppler = clamp(1 - (p.relSpeed || 0) / 340, 0.7, 1.4);
    const fo = (55 + (p.opponentSpeed || 0) * 2.4) * doppler * pitchMul;
    aim(e.opp.frequency, fo, t, 0.05);
    aim(e.opp2.frequency, fo * 2.01, t, 0.05);
    // slow motion = muffled world
    aim(this.slowmo.frequency, ts < 0.95 ? 500 + ts * 5000 : 20000, t, 0.06);
  }

  shift() {
    const e = this.engine;
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    e.out.gain.cancelScheduledValues(t);
    e.out.gain.setTargetAtTime(0.06, t, 0.01);
    e.out.gain._aim = undefined;
    this._noise(0.12, 'bandpass', 1200, 400, 1.5, 0.05);
    // the gearbox clunk
    this._tone('sine', 190, 110, 0.05, 0.08);
    this._noise(0.025, 'bandpass', 2400, 2000, 4, 0.1);
  }

  // momentarily pull the engine & tyre bed down so an impact lands
  _duck(depth, hold = 0.1) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    e.bed.gain.cancelScheduledValues(t);
    e.bed.gain.setTargetAtTime(1 - depth, t, 0.008);
    e.bed.gain.setTargetAtTime(1, t + hold, 0.22);
  }

  // ------------------------------------------------------------------ one-shot building blocks
  _env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _filt(node, type, f0, f1, Q, t, dur) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = Q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    node.connect(f);
    return f;
  }

  _shape(node, k) {
    const s = this.ctx.createWaveShaper();
    s.curve = this._curve(k);
    node.connect(s);
    return s;
  }

  // last stage of every one-shot: optional (moving) pan, then the bus
  _out(node, t, dur, o) {
    let out = node;
    if (o.pan || o.panTo) {
      const p = this.ctx.createStereoPanner();
      p.pan.setValueAtTime(o.pan || 0, t);
      if (o.panTo !== undefined) p.pan.linearRampToValueAtTime(o.panTo, t + dur);
      node.connect(p);
      out = p;
    }
    out.connect(o.bus || this._bus);
  }

  // opts: delay, attack, detune, filter/filterTo/ftype/q, drive, pan/panTo, bus
  _tone(type, f0, f1, dur, peak, o = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const atk = o.attack ?? 0.005;
    const osc = this._osc(type, f0);
    if (o.detune) osc.detune.value = o.detune;
    if (f1 !== f0) {
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + atk + dur);
    }
    let node = osc;
    if (o.filter) node = this._filt(node, o.ftype || 'lowpass', o.filter, o.filterTo, o.q ?? 1, t, atk + dur);
    if (o.drive) node = this._shape(node, o.drive);
    const g = this._gain(0);
    node.connect(g);
    this._out(g, t, atk + dur, o);
    this._env(g, t, atk, peak, dur);
    osc.start(t);
    osc.stop(t + atk + dur + 0.05);
  }

  _noise(dur, type, f0, f1, Q, peak, o = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const atk = o.attack ?? 0.004;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    let node = this._filt(src, type, f0, f1, Q, t, atk + dur);
    if (o.drive) node = this._shape(node, o.drive);
    const g = this._gain(0);
    node.connect(g);
    this._out(g, t, atk + dur, o);
    this._env(g, t, atk, peak, dur);
    src.start(t, Math.random() * 1.5);
    src.stop(t + atk + dur + 0.1);
  }

  // noise chopped into random little bursts: crumpling metal, flame pops, debris
  _crackle(dur, rate, freq, peak, o = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    let node = this._filt(src, 'bandpass', freq, 0, o.q ?? 0.9, t0, dur);
    if (o.drive) node = this._shape(node, o.drive);
    const g = this._gain(0);
    node.connect(g);
    this._out(g, t0, dur, o);
    let x = t0 + Math.random() * 0.01;
    while (x < t0 + dur) {
      g.gain.setValueAtTime(peak * (1 - (x - t0) / dur) * rand(0.25, 1), x);
      g.gain.setTargetAtTime(0, x + 0.001, rand(0.003, 0.012));
      x += -Math.log(1 - Math.random()) / rate;
    }
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.1);
  }

  // inharmonic partials with their own decays: struck sheet metal
  _ring(freqs, dur, peak, o = {}) {
    freqs.forEach((f, i) => this._tone('sine', f, f * 0.985, dur * (1 - i * 0.12), peak / (1 + i * 0.4), { ...o, attack: 0.001 }));
  }

  // a clean chime with a couple of overtones
  _bell(f, dur, peak, o = {}) {
    this._tone('sine', f, f, dur, peak, { ...o, attack: 0.002 });
    this._tone('sine', f * 2.01, f * 2.01, dur * 0.5, peak * 0.35, { ...o, attack: 0.002 });
    this._tone('triangle', f * 3.01, f * 3.01, dur * 0.25, peak * 0.2, { ...o, attack: 0.001 });
  }

  // bits of debris skittering away after a big hit
  _rattle(spread, count, peak, pan = 0) {
    for (let i = 0; i < count; i++) {
      const f = rand(900, 4200);
      this._noise(rand(0.02, 0.06), 'bandpass', f, f * 0.85, 6, peak * rand(0.4, 1), { delay: rand(0.06, spread), pan: clamp(pan + rand(-0.4, 0.4), -1, 1) });
    }
  }

  // one exhaust pop
  _pop(level) {
    this._noise(rand(0.025, 0.06), 'bandpass', rand(500, 1100), 220, 1.1, level * rand(0.6, 1), { drive: 6, pan: rand(-0.15, 0.15) });
  }

  // the shove of a boost: a low whump, a pressurised blast and a burst of flame crackle
  _blast(s) {
    this._tone('sine', 130, 38, 0.45, 0.5 * s, { drive: 2 });
    this._noise(0.35, 'lowpass', 1600, 180, 0.8, 0.45 * s);
    this._noise(0.55 + s * 0.35, 'bandpass', 900, 4200, 0.7, 0.3 * s, { attack: 0.015 });
    this._crackle(0.1 + s * 0.45, 40, 900, 0.4 * s, { drive: 5 });
  }

  play(name, o = {}) {
    if (!this.ctx || !this.enabled) return;
    this._bus = UI_SOUNDS.has(name) ? this.uiBus : this.sfxBus;
    switch (name) {
      case 'ui':
        this._tone('sine', 1400, 1800, 0.06, 0.12);
        break;
      case 'ui-back':
        this._tone('sine', 900, 600, 0.08, 0.12);
        break;
      case 'ui-hover':
        this._tone('sine', 2200, 2200, 0.03, 0.04);
        break;
      case 'buy':
        [0, 0.07, 0.14].forEach((d, i) => this._tone('square', [988, 1319, 1976][i], [988, 1319, 1976][i], 0.12, 0.06, { delay: d, filter: 4000 }));
        break;
      case 'error':
        this._tone('sawtooth', 140, 110, 0.22, 0.1, { filter: 900 });
        break;
      case 'count':
        // a firm beep with body: two detuned squares over a sub
        this._tone('square', 880, 880, 0.26, 0.09, { filter: 2600, detune: -6 });
        this._tone('square', 880, 880, 0.26, 0.09, { filter: 2600, detune: 6 });
        this._tone('sine', 440, 440, 0.3, 0.22);
        this._noise(0.02, 'highpass', 4000, 4000, 0.7, 0.12);
        break;
      case 'go':
        // an octave up and held, a chord that opens up, and a launch sweep
        this._tone('square', 1760, 1760, 0.7, 0.07, { filter: 4200, detune: -7 });
        this._tone('square', 1760, 1760, 0.7, 0.07, { filter: 4200, detune: 7 });
        this._tone('sine', 880, 880, 0.8, 0.25);
        for (const n of [57, 64, 69, 73]) this._tone('sawtooth', midi(n), midi(n), 0.9, 0.035, { filter: 900, filterTo: 4000, attack: 0.01 });
        this._noise(0.9, 'bandpass', 400, 5000, 0.9, 0.18, { attack: 0.05 });
        this._tone('sine', 120, 40, 0.4, 0.4);
        break;
      case 'nitro':
        this._blast(1);
        this._tone('sine', 900, 3400, 0.7, 0.035, { attack: 0.08 });
        this._duck(0.4, 0.15);
        break;
      case 'boost':
        // perfect start: a sparkle on top of the shove
        [81, 88, 93].forEach((n, i) => this._bell(midi(n), 0.4, 0.08, { delay: i * 0.05, bus: this.uiBus }));
        this._blast(0.85);
        this._duck(0.3, 0.12);
        break;
      case 'pad':
        // an electric zap up through the filter, then the shove
        this._tone('sawtooth', 220, 1760, 0.28, 0.1, { filter: 1200, filterTo: 7000, q: 7 });
        this._tone('square', 440, 3520, 0.2, 0.04, { filter: 6000 });
        this._blast(0.6);
        this._duck(0.25, 0.1);
        break;
      case 'turbo': {
        const tier = o.tier || 1;
        this._blast(0.55 + tier * 0.15);
        this._tone('sawtooth', 300 + tier * 150, 1500 + tier * 700, 0.22, 0.05 + tier * 0.01, { filter: 2000, filterTo: 7000, q: 4 });
        this._bell(midi(TIER_NOTE[tier] + 24), 0.3, 0.06, { bus: this.uiBus });
        this._duck(0.2 + tier * 0.06, 0.1);
        break;
      }
      case 'tier': {
        // drift charge climbs a level: a bright two-note chime, higher each tier
        const tier = o.tier || 1;
        const n = TIER_NOTE[tier] + 12;
        this._bell(midi(n), 0.35, 0.11);
        this._bell(midi(n + 7), 0.45, 0.09, { delay: 0.07 });
        this._noise(0.12, 'highpass', 7000, 7000, 0.7, 0.05 * tier);
        break;
      }
      case 'whoosh': {
        // a car going past: the air rips by while its engine drops in pitch
        const side = clamp((o.side || 0) * -0.75, -1, 1);
        const big = o.razor ? 1.35 : 1;
        this._noise(0.4, 'bandpass', 2800, 300, 1.3, 0.42 * big, { attack: 0.1, pan: side * 0.4, panTo: side });
        this._noise(0.25, 'highpass', 5000, 2000, 0.7, 0.1 * big, { attack: 0.08, pan: side });
        for (const det of [-10, 10]) this._tone('sawtooth', 270, 150, 0.5, 0.06 * big, { filter: 1400, filterTo: 500, attack: 0.08, detune: det, pan: side * 0.4, panTo: side });
        if (o.razor) this._tone('sine', 75, 38, 0.3, 0.3);
        break;
      }
      case 'hit': {
        // car-to-car: a click, a bang, crunching panels and a short metal ring
        const s = clamp((o.strength || 5) / 16, 0.2, 1);
        this._noise(0.012, 'highpass', 3000, 3000, 0.7, 0.4 * s, { attack: 0.001 });
        this._tone('sine', 150, 50, 0.22, 0.5 * s, { drive: 2 });
        this._noise(0.2, 'lowpass', 1800, 300, 0.7, 0.4 * s);
        this._crackle(0.12 + s * 0.12, 70, 1600, 0.35 * s, { drive: 6 });
        this._ring([rand(480, 560), rand(1250, 1400), rand(2150, 2350), rand(3300, 3600)], 0.25 + s * 0.2, 0.09 * s);
        this._duck(0.3 * s, 0.08);
        break;
      }
      case 'crash': {
        // into a wall: heavier, longer crunch, the body panels ring, debris for the big ones
        const s = clamp((o.strength || 8) / 22, 0.2, 1);
        const pan = clamp((o.side || 0) * -0.55, -1, 1);
        this._noise(0.015, 'highpass', 2500, 2500, 0.7, 0.55 * s, { attack: 0.001, pan });
        this._tone('sine', 110, 32, 0.45, 0.65 * s, { drive: 2.5 });
        this._noise(0.45, 'lowpass', 2200, 200, 0.6, 0.6 * s, { pan });
        this._crackle(0.2 + s * 0.35, 80, 1900, 0.45 * s, { drive: 7, pan });
        this._ring([rand(360, 420), rand(980, 1080), rand(1680, 1800), rand(2700, 2900), rand(4000, 4300)], 0.4 + s * 0.5, 0.11 * s, { pan });
        if (s > 0.45) this._rattle(0.5 + s * 0.4, Math.round(6 + s * 10), 0.12 * s, pan);
        this._duck(0.45 * s, 0.12 + 0.1 * s);
        break;
      }
      case 'glass': {
        // the crack, then shards tinkling down
        const s = clamp(o.strength ?? 0.6, 0.2, 1);
        this._noise(0.1, 'highpass', 2600, 2600, 0.8, 0.32 * s);
        for (let i = 0; i < 7; i++) {
          const f = 4000 + Math.random() * 5000;
          this._noise(0.04 + Math.random() * 0.07, 'bandpass', f, f * 0.8, 14, 0.07 * s, { delay: 0.03 + Math.random() * 0.4 });
        }
        break;
      }
      case 'land': {
        // the thump, a suspension clack and a chirp from the tyres
        const s = clamp((o.strength || 6) / 18, 0.2, 1);
        this._tone('sine', 85, 30, 0.38, 0.6 * s, { drive: 2 });
        this._noise(0.25, 'lowpass', 900, 160, 0.7, 0.4 * s);
        this._noise(0.05, 'bandpass', 1100, 700, 3, 0.3 * s);
        if (s > 0.35) this._noise(0.12, 'bandpass', 2200, 1700, 7, 0.25 * s, { delay: 0.02 });
        this._duck(0.3 * s, 0.08);
        break;
      }
      case 'backfire':
        this._noise(0.07, 'lowpass', 1400, 300, 0.8, 0.55, { drive: 6 });
        this._tone('sine', 95, 45, 0.1, 0.35);
        this._crackle(0.25, 30, 800, 0.3, { drive: 6, delay: 0.06 });
        break;
      case 'blowoff':
        // turbo dump valve on lift-off: a pressurised "pssh" with a falling whistle
        this._noise(0.32, 'bandpass', 4200, 1400, 1.3, 0.2, { attack: 0.008 });
        this._tone('sine', 3000, 1900, 0.18, 0.018);
        break;
      case 'lap':
        if (o.final) {
          // last lap: an urgent rising run and a chord that opens up
          [76, 81, 85, 88].forEach((n, i) => this._bell(midi(n), 0.3, 0.09, { delay: i * 0.07 }));
          for (const n of [64, 69, 73]) this._tone('sawtooth', midi(n), midi(n), 0.7, 0.03, { filter: 800, filterTo: 3500, delay: 0.21, attack: 0.02 });
        } else {
          this._bell(midi(81), 0.3, 0.1);
          this._bell(midi(88), 0.5, 0.1, { delay: 0.1 });
        }
        break;
      case 'finish': {
        const win = o.place === 1;
        const podium = o.place <= 3;
        const notes = win ? [69, 73, 76, 81, 85, 88] : podium ? [69, 72, 76, 81] : [69, 72, 76];
        notes.forEach((n, i) => this._bell(midi(n), 0.5, 0.08, { delay: i * 0.08 }));
        // the run lands on a big chord, a boom and a cymbal
        const end = notes.length * 0.08;
        const chord = win ? [57, 61, 64, 69, 73] : [57, 60, 64, 69];
        for (const n of chord) for (const det of [-8, 8]) this._tone('sawtooth', midi(n), midi(n), 1.6, 0.022, { filter: 700, filterTo: 3800, detune: det, delay: end, attack: 0.02 });
        this._tone('sine', 110, 40, 0.5, 0.32, { delay: end });
        this._noise(1.8, 'highpass', 6000, 4000, 0.6, podium ? 0.2 : 0.1, { delay: end });
        this._noise(1.2, 'bandpass', 800, 4000, 0.6, 0.12);
        break;
      }
      case 'respawn':
        // a swell that snaps back into place
        this._tone('sawtooth', 180, 1400, 0.1, 0.05, { filter: 800, filterTo: 5000, attack: 0.25 });
        this._noise(0.1, 'bandpass', 600, 4000, 0.8, 0.2, { attack: 0.25 });
        this._bell(midi(84), 0.3, 0.06, { delay: 0.3 });
        break;
      case 'thunder':
        this._noise(0.08, 'highpass', 1500, 1500, 0.5, 0.2);
        this._noise(3.2, 'lowpass', 600, 60, 0.5, 0.55);
        this._noise(1.4, 'lowpass', 2500, 300, 0.4, 0.2);
        break;
      case 'unlock':
        [72, 76, 79, 84].forEach((n, i) => this._tone('triangle', midi(n), midi(n), 0.3, 0.09, { delay: i * 0.07 }));
        break;
      case 'popup': {
        // stunt points: climbs a pentatonic step with each combo multiplier
        const f = midi(81 + PENTA[clamp((o.combo || 1) - 1, 0, PENTA.length - 1)]);
        this._bell(f, o.big ? 0.4 : 0.2, o.big ? 0.12 : 0.14);
        if (o.big) this._bell(f * 1.5, 0.5, 0.07, { delay: 0.06 });
        break;
      }
      case 'combo-lost':
        this._tone('triangle', midi(76), midi(64), 0.3, 0.1);
        break;
      default:
        break;
    }
    this._bus = this.sfxBus;
  }

  // ------------------------------------------------------------------ music
  startMusic(mode) {
    if (!this.ctx) return;
    if (this.music && this.music.mode === mode) return;
    this.stopMusic();
    this.music = new SynthwaveMusic(this, mode);
    this.music.start();
  }

  stopMusic() {
    if (this.music) {
      this.music.stop();
      this.music = null;
    }
  }

  setMusicIntensity(x) {
    if (this.music) this.music.intensity = x;
  }
}

// ---------------------------------------------------------------------------------------
// Procedural synthwave: i-VI-III-VII progressions, pumping sidechain, arps, gated drums.
// The race tune runs in 16-bar phrases: 12 driving, 2 pulled back, 2 building into a crash.
// ---------------------------------------------------------------------------------------
const PROGS = [
  [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62],
  ],
  [
    [53, 57, 60],
    [55, 59, 62],
    [52, 55, 59],
    [57, 60, 64],
  ],
];

class SynthwaveMusic {
  constructor(audio, mode) {
    this.a = audio;
    this.ctx = audio.ctx;
    this.mode = mode;
    this.bpm = mode === 'race' ? 128 : 98;
    this.intensity = 1;
    this.step = 0;
    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(audio.musicBus);
    this.duck = ctx.createGain();
    this.duck.connect(this.out);
    this.drums = ctx.createGain();
    this.drums.gain.value = mode === 'race' ? 0.9 : 0.45;
    this.drums.connect(this.out);
    this.verb = ctx.createGain();
    this.verb.gain.value = 0.25;
    this.verb.connect(audio.reverb);
    this.out.connect(this.verb);
    // arp delay
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.38;
    this.delay.connect(this.fb).connect(this.delay);
    this.arpBus = ctx.createGain();
    this.arpBus.gain.value = 0.9;
    this.arpBus.connect(this.duck);
    this.arpBus.connect(this.delay);
    this.delay.connect(this.duck);
  }

  start() {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(1, t, 0.8);
    this.next = t + 0.15;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.3);
    const out = this.out;
    setTimeout(() => out.disconnect(), 1500);
  }

  _schedule() {
    const ctx = this.ctx;
    const stepDur = 60 / this.bpm / 4;
    while (this.next < ctx.currentTime + 0.14) {
      this._play(this.step, this.next, stepDur);
      this.next += stepDur;
      this.step++;
    }
  }

  _voice(type, freq, t, dur, peak, dest, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (opts.detune) o.detune.value = opts.detune;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = opts.q ?? 1;
    f.frequency.setValueAtTime(opts.cut0 ?? 2000, t);
    if (opts.cut1) f.frequency.exponentialRampToValueAtTime(opts.cut1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (opts.attack ?? 0.005));
    g.gain.setTargetAtTime(0.0001, t + (opts.hold ?? 0) + (opts.attack ?? 0.005), (opts.release ?? dur) / 3);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + (opts.attack ?? 0.005) + (opts.hold ?? 0) + (opts.release ?? dur) * 1.5 + 0.05);
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.45);
    // sidechain pump
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(0.25, t);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.28);
  }

  _noiseHit(t, type, freq, dur, peak, q = 0.8) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.a.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.drums);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  _snare(t, v) {
    this._noiseHit(t, 'bandpass', 1800, 0.2, 0.45 * v);
    this._noiseHit(t, 'highpass', 5000, 0.12, 0.16 * v);
    this._voice('triangle', 190, t, 0.1, 0.25 * v, this.drums, { cut0: 2000 });
  }

  // top of a phrase: cymbal wash and a low boom
  _crash(t) {
    this._noiseHit(t, 'highpass', 4500, 1.6, 0.22);
    this._voice('sine', 55, t, 0.6, 0.35, this.drums, { cut0: 400 });
  }

  // noise sweeping up through a build
  _riser(t, dur) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.a.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.01);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
  }

  _play(step, t, sd) {
    const race = this.mode === 'race';
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const prog = PROGS[Math.floor(bar / 8) % 2];
    const chord = prog[bar % 4];
    const inten = this.intensity;
    const sec = bar % 16;
    const lift = race && (sec === 12 || sec === 13);
    const build = race && (sec === 14 || sec === 15);
    // how far through the 2-bar build, 0..1
    const rise = build ? ((sec - 14) * 16 + s) / 32 : 0;
    // drums
    if (race) {
      if (sec === 0 && s === 0 && bar > 0) this._crash(t);
      if (lift ? s === 0 || s === 8 : s % 4 === 0) this._kick(t);
      if (build) {
        // snare roll: 8ths, then 16ths, swelling
        if (sec === 15 || s % 2 === 0) this._snare(t, 0.3 + 0.7 * rise);
      } else if (s === 4 || s === 12) this._snare(t, 1);
      else if (sec === 7 && s >= 13) this._snare(t, 0.5);
      if (!lift && !build && s % 2 === 1) this._noiseHit(t, 'highpass', 8000, 0.04, 0.14 * inten);
      if (!lift && !build && s === 14) this._noiseHit(t, 'highpass', 7000, 0.14, 0.12 * inten);
      // open hats on the off-beat once the final lap starts
      if (!lift && inten > 1.1 && s % 4 === 2) this._noiseHit(t, 'highpass', 6500, 0.2, 0.09);
      if (sec === 14 && s === 0) this._riser(t, sd * 32);
    } else {
      if (s === 0 || s === 8) this._kick(t);
      if (s % 4 === 2) this._noiseHit(t, 'highpass', 9000, 0.03, 0.06);
    }
    // bass: driving 8ths (race) / long notes (menu and the pulled-back bars)
    const root = chord[0] - 24;
    if (race && !lift) {
      if (s % 2 === 0) this._voice('sawtooth', midi(root + (s % 4 === 2 ? 12 : 0)), t, sd * 1.6, 0.22, this.duck, { cut0: 900 + rise * 1600, cut1: 180, q: 5, release: sd * 1.6 });
    } else if (s === 0 || s === 8) {
      this._voice('sawtooth', midi(root), t, sd * 7, 0.16, this.duck, { cut0: 500, cut1: 160, q: 3, release: sd * 7 });
    }
    // arpeggio
    const pattern = [0, 1, 2, 1, 2, 3, 2, 1];
    const idx = pattern[s % 8];
    const note = idx === 3 ? chord[0] + 12 : chord[idx];
    if (race || s % 2 === 0) {
      this._voice('square', midi(note + 12), t, sd * 0.9, race ? 0.05 * inten : 0.04, this.arpBus, { cut0: lift ? 1400 : 3200, cut1: 900, release: sd * 0.9 });
    }
    // pad on the bar
    if (s === 0) {
      for (const n of chord) {
        for (const det of [-9, 9]) {
          this._voice('sawtooth', midi(n), t, sd * 16, race ? 0.022 : 0.03, this.duck, { detune: det, attack: 0.35, hold: sd * 12, release: sd * 4, cut0: 1300 });
        }
      }
    }
    // lead motif: every 4th bar, and every other bar on the final lap
    const leadBar = inten > 1.1 ? bar % 2 === 1 : bar % 4 === 3;
    if (race && !lift && !build && leadBar && (s === 0 || s === 3 || s === 6 || s === 10)) {
      const lead = [chord[2] + 12, chord[1] + 12, chord[0] + 12, chord[1] + 12][[0, 3, 6, 10].indexOf(s)];
      this._voice('sawtooth', midi(lead), t, sd * 2.5, 0.05 * inten, this.arpBus, { cut0: 2600, cut1: 1200, q: 2, detune: 6, release: sd * 3 });
    }
  }
}
