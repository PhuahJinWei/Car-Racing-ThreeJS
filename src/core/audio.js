// Fully synthesized audio: engine, tyres, wind, impacts, UI blips and a procedural synthwave
// soundtrack. No audio files to download - everything is generated with Web Audio.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.engine = null;
    this.music = null;
    this.enabled = true;
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
    e.out = this._gain(0);
    e.out.connect(this.sfxBus);
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
    for (const o of [e.oscA, e.oscB, e.oscC, e.whine, e.lfo]) o.start();
    e.wind = this._noiseLayer('bandpass', 600, 0.6, this.sfxBus);
    e.screech = this._noiseLayer('bandpass', 2000, 9, this.sfxBus);
    e.screech2 = this._noiseLayer('bandpass', 3150, 14, this.sfxBus);
    e.scrape = this._noiseLayer('highpass', 2600, 0.7, this.sfxBus);
    e.roar = this._noiseLayer('lowpass', 380, 0.9, this.sfxBus);
    e.rain = this._noiseLayer('highpass', 1800, 0.4, this.sfxBus);
    // opponent engine (nearest car), panned & doppler-shifted
    e.opp = this._osc('sawtooth', 90);
    e.oppF = ctx.createBiquadFilter();
    e.oppF.type = 'lowpass';
    e.oppF.frequency.value = 900;
    e.oppG = this._gain(0);
    e.opp.connect(e.oppF).connect(e.oppG).connect(this.sfxBus);
    e.opp.start();
    this.engine = e;
    e.out.gain.setTargetAtTime(0.18, ctx.currentTime, 0.3);
  }

  stopEngine() {
    const e = this.engine;
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const all = [e.out, e.wind.g, e.screech.g, e.screech2.g, e.scrape.g, e.roar.g, e.rain.g, e.oppG];
    for (const g of all) g.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      try {
        for (const o of [e.oscA, e.oscB, e.oscC, e.whine, e.lfo, e.opp]) o.stop();
        for (const n of [e.wind, e.screech, e.screech2, e.scrape, e.roar, e.rain]) n.src.stop();
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
    const sp = clamp(p.speed / (p.topSpeed || 80), 0, 1.4);
    const ts = p.timeScale ?? 1;
    const pitchMul = 0.62 + 0.38 * ts;
    const f0 = (40 + p.rpm * 175 + p.boost * 22) * pitchMul;
    const k = 0.035;
    e.oscA.frequency.setTargetAtTime(f0, t, k);
    e.oscB.frequency.setTargetAtTime(f0 * 0.5, t, k);
    e.oscC.frequency.setTargetAtTime(f0 * 2.006, t, k);
    e.whine.frequency.setTargetAtTime(f0 * 5.5, t, k);
    e.lfo.frequency.setTargetAtTime(f0 * 0.5, t, k);
    const thr = clamp(p.throttle, 0, 1);
    e.filter.frequency.setTargetAtTime(220 + p.rpm * 1700 * (0.35 + 0.65 * thr) + p.boost * 1600, t, 0.05);
    e.out.gain.setTargetAtTime((0.12 + thr * 0.13 + p.boost * 0.08) * (p.airborne ? 0.85 : 1), t, 0.06);
    e.gW.gain.setTargetAtTime(sp * 0.025 + p.boost * 0.05, t, 0.1);
    e.wind.g.gain.setTargetAtTime(sp * sp * 0.2 + p.boost * 0.06, t, 0.1);
    e.wind.f.frequency.setTargetAtTime(300 + sp * 1500, t, 0.1);
    const scr = clamp(p.drift, 0, 1);
    e.screech.g.gain.setTargetAtTime(scr * 0.11, t, 0.05);
    e.screech2.g.gain.setTargetAtTime(scr * 0.05, t, 0.05);
    e.screech.f.frequency.setTargetAtTime(1800 + Math.sin(t * 9) * 140 + sp * 300, t, 0.03);
    e.scrape.g.gain.setTargetAtTime(clamp(p.scrape, 0, 1) * 0.2 * (0.6 + Math.random() * 0.4), t, 0.03);
    e.roar.g.gain.setTargetAtTime(p.boost * 0.32, t, 0.08);
    e.rain.g.gain.setTargetAtTime(p.wet ? 0.035 + sp * 0.03 : 0, t, 0.3);
    e.verbSend.gain.setTargetAtTime(p.tunnel ? 0.55 : 0.04, t, 0.25);
    // opponent pass-by
    const near = clamp(1 - p.opponentDist / 70, 0, 1);
    e.oppG.gain.setTargetAtTime(near * near * 0.07, t, 0.05);
    const doppler = clamp(1 - (p.relSpeed || 0) / 340, 0.7, 1.4);
    e.opp.frequency.setTargetAtTime((55 + (p.opponentSpeed || 0) * 2.4) * doppler * pitchMul, t, 0.05);
    // slow motion = muffled world
    this.slowmo.frequency.setTargetAtTime(ts < 0.95 ? 500 + ts * 5000 : 20000, t, 0.06);
  }

  shift() {
    const e = this.engine;
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    e.out.gain.cancelScheduledValues(t);
    e.out.gain.setTargetAtTime(0.06, t, 0.01);
    this._noise(0.12, 'bandpass', 1200, 400, 1.5, 0.05);
  }

  // ------------------------------------------------------------------ one-shots
  _env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _tone(type, f0, f1, dur, peak, opts = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay || 0);
    const o = this._osc(type, f0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this._gain(0);
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    let out = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      g.connect(p);
      out = p;
    }
    out.connect(opts.bus || this.sfxBus);
    this._env(g, t, opts.attack ?? 0.005, peak, dur);
    o.start(t);
    o.stop(t + (opts.attack ?? 0.005) + dur + 0.05);
  }

  _noise(dur, type, f0, f1, Q, peak, opts = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = Q;
    const g = this._gain(0);
    src.connect(f).connect(g);
    let out = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      g.connect(p);
      out = p;
    }
    out.connect(opts.bus || this.sfxBus);
    this._env(g, t, opts.attack ?? 0.004, peak, dur);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.1);
  }

  play(name, o = {}) {
    if (!this.ctx || !this.enabled) return;
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
        this._tone('sine', 880, 880, 0.22, 0.25);
        this._tone('square', 880, 880, 0.12, 0.05, { filter: 3000 });
        break;
      case 'go':
        this._tone('sine', 1760, 1760, 0.6, 0.25);
        this._tone('square', 880, 880, 0.5, 0.08, { filter: 3500 });
        this._noise(0.6, 'bandpass', 600, 3000, 0.8, 0.12);
        break;
      case 'nitro':
        this._noise(0.7, 'bandpass', 180, 3800, 0.9, 0.5);
        this._tone('sine', 90, 34, 0.6, 0.45);
        this._tone('sawtooth', 220, 880, 0.35, 0.06, { filter: 2500 });
        break;
      case 'pad':
        this._tone('square', 500, 1700, 0.22, 0.07, { filter: 3000 });
        this._noise(0.35, 'bandpass', 400, 2600, 1, 0.25);
        break;
      case 'turbo': {
        const tier = o.tier || 1;
        this._noise(0.4 + tier * 0.1, 'bandpass', 300, 2400 + tier * 600, 1.2, 0.3);
        this._tone('triangle', 400 + tier * 200, 1200 + tier * 400, 0.25, 0.1);
        break;
      }
      case 'tier': {
        const n = [0, 76, 79, 83][o.tier || 1];
        this._tone('sine', midi(n + 12), midi(n + 12), 0.15, 0.08);
        break;
      }
      case 'whoosh':
        this._noise(0.45, 'bandpass', 3000, 300, 2.5, 0.42, { pan: clamp((o.side || 0) * -0.7, -1, 1) });
        break;
      case 'hit': {
        const s = clamp((o.strength || 5) / 20, 0.15, 1);
        this._noise(0.25, 'lowpass', 1200, 300, 0.7, 0.5 * s);
        this._tone('sine', 110, 45, 0.25, 0.5 * s);
        this._noise(0.4, 'bandpass', 2400, 1800, 18, 0.08 * s);
        break;
      }
      case 'crash': {
        const s = clamp((o.strength || 8) / 25, 0.2, 1);
        this._noise(0.5, 'lowpass', 2000, 200, 0.6, 0.7 * s);
        this._tone('sine', 90, 30, 0.45, 0.6 * s);
        this._noise(0.8, 'bandpass', 2600, 2000, 25, 0.12 * s);
        this._noise(0.6, 'bandpass', 4200, 3800, 30, 0.07 * s, { delay: 0.03 });
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
        const s = clamp((o.strength || 6) / 18, 0.2, 1);
        this._tone('sine', 70, 32, 0.35, 0.55 * s);
        this._noise(0.25, 'lowpass', 800, 200, 0.7, 0.35 * s);
        break;
      }
      case 'backfire':
        this._noise(0.09, 'bandpass', 420, 200, 1.2, 0.35);
        this._noise(0.05, 'highpass', 3000, 3000, 0.7, 0.12, { delay: 0.05 });
        break;
      case 'lap':
        this._tone('square', midi(76), midi(76), 0.12, 0.07, { filter: 4000 });
        this._tone('square', midi(83), midi(83), 0.25, 0.07, { filter: 4000, delay: 0.1 });
        break;
      case 'finish': {
        const notes = o.place === 1 ? [69, 73, 76, 81, 85, 88] : [69, 72, 76, 81];
        notes.forEach((n, i) => this._tone('sawtooth', midi(n), midi(n), 0.6, 0.06, { delay: i * 0.08, filter: 3000 }));
        this._noise(1.2, 'bandpass', 800, 4000, 0.6, 0.15);
        break;
      }
      case 'respawn':
        this._tone('sine', 300, 1200, 0.3, 0.12);
        break;
      case 'thunder':
        this._noise(3.2, 'lowpass', 600, 60, 0.5, 0.55);
        this._noise(1.4, 'lowpass', 2500, 300, 0.4, 0.2);
        break;
      case 'unlock':
        [72, 76, 79, 84].forEach((n, i) => this._tone('triangle', midi(n), midi(n), 0.3, 0.09, { delay: i * 0.07 }));
        break;
      case 'popup':
        this._tone('triangle', midi(84 + (o.combo || 1)), midi(84 + (o.combo || 1)), 0.1, 0.05);
        break;
      default:
        break;
    }
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

  _play(step, t, sd) {
    const race = this.mode === 'race';
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const prog = PROGS[Math.floor(bar / 8) % 2];
    const chord = prog[bar % 4];
    const inten = this.intensity;
    // drums
    if (race) {
      if (s % 4 === 0) this._kick(t);
      if (s === 4 || s === 12) {
        this._noiseHit(t, 'bandpass', 1800, 0.2, 0.45);
        this._voice('triangle', 190, t, 0.1, 0.25, this.drums, { cut0: 2000 });
      }
      if (s % 2 === 1) this._noiseHit(t, 'highpass', 8000, 0.04, 0.14 * inten);
      if (s === 14) this._noiseHit(t, 'highpass', 7000, 0.14, 0.12 * inten);
    } else {
      if (s === 0 || s === 8) this._kick(t);
      if (s % 4 === 2) this._noiseHit(t, 'highpass', 9000, 0.03, 0.06);
    }
    // bass: driving 8ths (race) / long notes (menu)
    const root = chord[0] - 24;
    if (race) {
      if (s % 2 === 0) this._voice('sawtooth', midi(root + (s % 4 === 2 ? 12 : 0)), t, sd * 1.6, 0.22, this.duck, { cut0: 900, cut1: 180, q: 5, release: sd * 1.6 });
    } else if (s === 0 || s === 8) {
      this._voice('sawtooth', midi(root), t, sd * 7, 0.16, this.duck, { cut0: 500, cut1: 160, q: 3, release: sd * 7 });
    }
    // arpeggio
    const pattern = [0, 1, 2, 1, 2, 3, 2, 1];
    const idx = pattern[s % 8];
    const note = idx === 3 ? chord[0] + 12 : chord[idx];
    if (race || s % 2 === 0) {
      this._voice('square', midi(note + 12), t, sd * 0.9, race ? 0.05 * inten : 0.04, this.arpBus, { cut0: 3200, cut1: 900, release: sd * 0.9 });
    }
    // pad on the bar
    if (s === 0) {
      for (const n of chord) {
        for (const det of [-9, 9]) {
          this._voice('sawtooth', midi(n), t, sd * 16, race ? 0.022 : 0.03, this.duck, { detune: det, attack: 0.35, hold: sd * 12, release: sd * 4, cut0: 1300 });
        }
      }
    }
    // occasional lead motif in the race music
    if (race && bar % 4 === 3 && (s === 0 || s === 3 || s === 6 || s === 10)) {
      const lead = [chord[2] + 12, chord[1] + 12, chord[0] + 12, chord[1] + 12][[0, 3, 6, 10].indexOf(s)];
      this._voice('sawtooth', midi(lead), t, sd * 2.5, 0.05 * inten, this.arpBus, { cut0: 2600, cut1: 1200, q: 2, detune: 6, release: sd * 3 });
    }
  }
}
