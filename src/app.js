import { Renderer, detectDefaultQuality, lowerQuality } from './core/renderer.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Storage } from './core/storage.js';
import { UI } from './ui/ui.js';
import { HUD } from './ui/hud.js';
import { TouchControls, TOUCH_SIZES } from './ui/touch.js';
import { Garage } from './scenes/garage.js';
import { MenuStreet } from './scenes/street.js';
import { Race } from './game/race.js';
import { getTrackDef } from './world/tracks.js';
import { evaluateDaily, dailyProgress, todayKey } from './game/daily.js';
import { clamp } from './core/math.js';
import { setLanguage, t } from './core/i18n.js';
import { DIFFICULTY } from './game/ai.js';
import { CARS } from './car/car-defs.js';
import { loadManifest, ensureCarAssets, previewModelFile, setCarDetail } from './car/car-assets.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export class App {
  constructor() {
    this.storage = new Storage();
    this.settings = this.storage.settings;
    setLanguage(this.settings.language);
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input();
    this.audio = new AudioEngine(this.settings);
    this.state = 'boot';
    this.race = null;
    this.hud = null;
    this.touch = null;
    this.garage = null;
    this.street = null;
    this.ui = new UI(this);
    this._appliedQuality = null;
    this._tick = (t) => this._frame(t);
    // auto quality stepped down: keep it for this session (choosing AUTO again resets it; a new
    // session starts from what the device looks capable of, so a passing slowdown never sticks),
    // and the next race loads the lighter cars if this preset uses them
    this._learnedQuality = null;
    this.renderer.onQualityStep = (name) => {
      this._learnedQuality = name;
      this._appliedQuality = `auto:${name}`;
      this.ui.setLite(name === 'low');
      setCarDetail(this.renderer.preset.carDetail);
    };
    this.applySettings();
    this.renderer.onResize = () => {
      if (this.race) this.race.resize(this.renderer.aspect);
      this.ui.updateRotateHint();
      this._renderPaused = true;
    };
    this._bindCanvasDrag();
    this._bindModelDrop();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.noAutoPause) return;
        if (this.state === 'race' && this.race && !this.race.paused && this.race.phase !== 'results') this.pause();
        this.audio.ctx?.suspend();
      } else if (this.audio.ctx && this.state !== 'title') this.audio.ctx.resume();
    });
  }

  async init() {
    this.ui.showLoading(t('loading'));
    try {
      await Promise.race([Promise.all([document.fonts.load('900 20px Orbitron'), document.fonts.load('700 20px Rajdhani')]), new Promise((r) => setTimeout(r, 2500))]);
    } catch {
      /* fonts are optional */
    }
    // real 3D car models (if any are listed in models/cars/cars.json)
    await loadManifest();
    const S = this.storage;
    if (!CARS.some((c) => c.id === S.data.car)) S.data.car = 'volt';
    await Promise.race([ensureCarAssets([S.data.car], this.renderer.renderer), new Promise((r) => setTimeout(r, 8000))]);
    this.garage = new Garage(this);
    this.garage.setCar(S.data.car, S.customFor(S.data.car));
    this.street = new MenuStreet(this);
    this.street.syncCar(S.data.car, S.customFor(S.data.car));
    this.street.build();
    // the rest load in the background, once the title screen is up and running smoothly
    setTimeout(() => {
      ensureCarAssets(CARS.map((c) => c.id), this.renderer.renderer).then(() => {
        if (this.state === 'race' || !this.garage) return;
        this.garage.setCar(this.garage.carId, S.ownsCar(this.garage.carId) ? S.customFor(this.garage.carId) : undefined);
        this.street.syncCar(S.data.car, S.customFor(S.data.car), true);
      });
    }, 1500);
    this.street.setView('title');
    this.ui.hideLoading();
    this.state = 'title';
    this.ui.show('title');
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }

  // ------------------------------------------------------------------ navigation
  onTitleStart() {
    this.audio.unlock();
    this.audio.startMusic('menu');
    this.toMenu();
  }

  /** Menus play out on the street with your car; the garage keeps its studio. */
  _toStreet(view) {
    const S = this.storage;
    this.street.build();
    this.street.syncCar(S.data.car, S.customFor(S.data.car));
    this.street.setView(view);
  }

  toMenu() {
    this.state = 'menu';
    this._toStreet('menu');
    this.ui.show('menu');
    this.audio.startMusic('menu');
  }

  openSetup(mode) {
    this.state = 'menu';
    this._toStreet('setup');
    this.ui.show('setup', { mode });
  }

  openGarage(params) {
    this.state = 'garage';
    this.garage.setView('garage');
    this.ui.show('garage', params);
  }

  openSettings() {
    this.state = 'menu';
    this._toStreet('menu');
    this.ui.show('settings');
  }

  openDaily() {
    this.state = 'menu';
    this._toStreet('setup');
    this.ui.show('daily');
  }

  startDaily(d) {
    this.currentDaily = d;
    this.startRace({ mode: 'daily', trackId: d.trackId, variant: d.variant, laps: d.laps, difficulty: d.difficulty, carId: d.carId, seed: d.key });
  }

  toggleFullscreen() {
    const doc = document;
    try {
      if (!doc.fullscreenElement) doc.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {});
      else doc.exitFullscreen?.();
    } catch {
      /* unsupported */
    }
  }

  _mobileFullscreen() {
    if (!this.input.isTouchDevice() || document.fullscreenElement) return;
    try {
      const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      p?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch?.(() => {});
    } catch {
      /* iOS Safari: no fullscreen API for pages - add to home screen instead */
    }
  }

  // ------------------------------------------------------------------ race lifecycle
  async startRace(cfg) {
    this._mobileFullscreen();
    this.audio.unlock();
    const S = this.storage;
    const carId = cfg.carId || S.data.car;
    const custom = S.ownsCar(carId) ? S.customFor(carId) : undefined;
    const v = { reverse: false, mirror: false, weather: 'clear', ...(cfg.variant || {}) };
    // AUTO rolls the conditions per race (restarts keep them); records stay split by clear/rain
    if (v.weather === 'auto') v.weather = Math.random() < 0.35 ? 'rain' : 'clear';
    const key =`${cfg.trackId}|${v.reverse ? 'r' : 'f'}|${v.mirror ? 'm' : 'n'}|${v.weather}`;
    const full = { opponents: 5, difficulty: 'easy', laps: 3, ...cfg, variant: v, carId, custom };
    if (full.mode === 'timetrial') full.ghost = S.getGhost(key);
    this.lastRaceCfg = full;
    this._teardownRace();
    // the race builds its own world; the menu street comes back afterwards
    this.street?.dispose();
    this.ui.clearScreen();
    this.ui.hidePause();
    this.ui.showLoading(t('building', { track: getTrackDef(cfg.trackId).name }), { trackId: cfg.trackId, variant: v, mode: full.mode, laps: full.laps });
    this.state = 'loading';
    await nextFrame();
    await ensureCarAssets(CARS.map((c) => c.id), this.renderer.renderer);
    const race = new Race(this, full);
    try {
      race.build();
    } catch (e) {
      console.error(e);
      this.ui.hideLoading();
      this.ui.toast(t('race.buildFailed'));
      this.toMenu();
      return;
    }
    this.race = race;
    race.on('results', (res) => this.onRaceResults(res));
    this.hud = new HUD(this, race);
    this.touch = this.input.isTouchDevice() ? new TouchControls(this) : null;
    this.ui.mountHud(this.hud, this.touch);
    this.ui.hideLoading();
    this.state = 'race';
    this.input.clearEdges();
    this.audio.startMusic('race');
    this.audio.setMusicIntensity(1);
    this.audio.startEngine();
    this.audio.setPaused(false);
    race.resize(this.renderer.aspect);
    race.start();
    this.ui.updateRotateHint();
    if (!S.data.tutorialDone) this._tips(race);
  }

  _tips(race) {
    const kind = this.input.isTouchDevice() ? 'touch' : 'kb';
    const tips = [1, 2, 3].map((i) => t(`intro.${kind}${i}`));
    race.on('countdown', (c) => {
      if (c.value !== 'GO') return;
      tips.forEach((tip, i) =>
        setTimeout(() => {
          if (this.race === race && !race.paused) this.ui.tip(tip);
        }, 900 + i * 6000),
      );
    });
  }

  _teardownRace() {
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
    if (this.hud) {
      this.hud.dispose();
      this.hud = null;
    }
    if (this.touch) {
      this.touch.dispose();
      this.touch = null;
    }
    this.ui.clearHud();
  }

  pause() {
    if (!this.race || this.race.paused) return;
    this.race.setPaused(true);
    this.audio.setPaused(true);
    this.touch?.reset();
    this.ui.showPause();
    this._renderPaused = true;
  }

  resume() {
    if (!this.race) return;
    this.ui.hidePause();
    this.race.setPaused(false);
    this.audio.setPaused(false);
    this.input.clearEdges();
    this.last = performance.now();
  }

  restart() {
    if (this.lastRaceCfg) this.startRace(this.lastRaceCfg);
  }

  quitRace(dest) {
    this._teardownRace();
    this.audio.stopEngine();
    this.audio.setPaused(false);
    this.ui.hidePause();
    this.ui.updateRotateHint();
    const S = this.storage;
    this.garage.setCar(S.data.car, S.customFor(S.data.car));
    if (dest === 'garage') this.openGarage();
    else this.toMenu();
  }

  onRaceResults(res) {
    const S = this.storage;
    const cfg = this.lastRaceCfg;
    const lines = [];
    const diffMul = (DIFFICULTY[cfg.difficulty] || DIFFICULTY.easy).reward;
    const lapMul = clamp(cfg.laps / 3, 0.5, 1.6);
    if (res.mode !== 'timetrial') {
      const table = [1500, 1000, 700, 500, 350, 250];
      lines.push([t('rw.place', { n: res.place }), Math.round((table[res.place - 1] || 200) * diffMul * lapMul)]);
    } else {
      lines.push([t('mode.timetrial'), Math.round(400 * lapMul)]);
    }
    if (res.style > 0) lines.push([t('rw.styleBonus'), Math.round(res.style / 10)]);
    const prev = S.getRecord(res.trackKey, res.mode);
    const hadRecord = !!(prev && prev.bestTime);
    const rec = S.setRecord(res.trackKey, res.mode, res.time, res.bestLap);
    const reward = { lines, newRecord: rec.newTime && hadRecord, newLap: rec.newLap && hadRecord };
    if (reward.newRecord) lines.push([t('res.newRecord'), 500]);
    if (res.mode === 'timetrial' && rec.newTime && res.ghost) S.setGhost(res.trackKey, res.ghost);
    if (res.mode === 'daily' && this.currentDaily) {
      const d = this.currentDaily;
      const ok = evaluateDaily(d, res);
      const ds = S.data.daily;
      reward.daily = ok;
      reward.dailyProgress = dailyProgress(d, res);
      if (ok && !(ds.date === d.key && ds.completed)) {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        ds.streak = ds.lastCompleted === todayKey(y) ? (ds.streak || 0) + 1 : 1;
        ds.lastCompleted = d.key;
        ds.date = d.key;
        ds.completed = true;
        lines.push([t('mode.daily'), d.reward]);
        if (ds.streak > 1) lines.push([t('rw.streak', { n: ds.streak }), Math.min(1000, (ds.streak - 1) * 200)]);
      } else if (!ok && ds.date !== d.key) {
        ds.date = d.key;
        ds.completed = false;
      }
    }
    const st = S.data.stats;
    st.races++;
    if (res.mode !== 'timetrial') {
      if (res.place === 1) st.wins++;
      if (res.place <= 3) st.podiums++;
    }
    st.nearMisses += res.counts.nearMiss || 0;
    st.driftDistance += Math.round(res.counts.driftDistance || 0);
    st.bestCombo = Math.max(st.bestCombo, res.best.combo || 1);
    st.bestDrift = Math.max(st.bestDrift, res.best.drift || 0);
    S.data.tutorialDone = true;
    reward.total = lines.reduce((a, l) => a + l[1], 0);
    S.addCredits(reward.total);
    S.save();
    if (reward.total > 0) setTimeout(() => this.audio.play('buy'), 500);
    this.ui.showResults(res, reward);
  }

  // ------------------------------------------------------------------ settings
  applySettings(changed) {
    const s = this.settings;
    // AUTO starts from what the device looks capable of, or lower if it has already stepped down
    if (changed === 'quality' && s.quality === 'auto') this._learnedQuality = null;
    const auto = lowerQuality(detectDefaultQuality(this.renderer.renderer.getContext()), this._learnedQuality || 'high');
    const q = s.quality === 'auto' ? `auto:${auto}` : s.quality;
    if (q !== this._appliedQuality) {
      this._appliedQuality = q;
      if (s.quality === 'auto') this.renderer.setQuality(auto, true);
      else this.renderer.setQuality(s.quality, false);
      this.ui.setLite(this.renderer.presetName === 'low');
      setCarDetail(this.renderer.preset.carDetail);
    }
    this.audio.applyVolumes();
    this.input.autoAccel = s.autoAccel;
    this.input.haptics = s.haptics;
    this.input.tiltSensitivity = s.tiltSensitivity;
    if (this.race) {
      this.race.rig.shakeScale = s.shake;
      if (changed === 'camera') this.race.rig.setMode(s.camera);
    }
    if (changed === 'controls' && this.touch) this.touch.setMode(s.controls);
    document.documentElement.style.setProperty('--tscale', String(TOUCH_SIZES[s.touchSize] ?? 1));
    if (changed === 'units' && this.hud) this.hud.$.unit.textContent = s.units === 'mph' ? 'MPH' : 'KM/H';
    if (changed === 'language') {
      setLanguage(s.language);
      this.ui.onLanguage();
    }
    this.storage.save();
  }

  saveSettings() {
    this.storage.save();
  }

  // ------------------------------------------------------------------ drop a .glb to preview a car model
  _bindModelDrop() {
    window.addEventListener('dragover', (e) => {
      if (this.state === 'race') return;
      e.preventDefault();
    });
    window.addEventListener('drop', async (e) => {
      if (this.state === 'race') return;
      e.preventDefault();
      const file = [...(e.dataTransfer?.files || [])].find((f) => /\.(glb|gltf)$/i.test(f.name));
      if (!file || !this.garage) return;
      const carId = this.garage.carId || this.storage.data.car;
      try {
        this.ui.toast(`LOADING ${file.name}`);
        const r = await previewModelFile(file, carId, this.renderer.renderer);
        const S = this.storage;
        this.garage.setCar(carId, S.ownsCar(carId) ? S.customFor(carId) : undefined);
        this.street?.syncCar(S.data.car, S.customFor(S.data.car), true);
        this.ui.toast(`PREVIEW: ${file.name} · wheels ${r.wheels ? 'found' : 'not found'} · paint ${r.roles.paint ? 'found' : 'not found'}`);
        console.info('[cars] preview report', r);
      } catch (err) {
        console.warn(err);
        this.ui.toast('Could not read that model file');
      }
    });
  }

  // ------------------------------------------------------------------ garage drag
  _bindCanvasDrag() {
    let id = null;
    let lx = 0;
    let ly = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.state !== 'menu' && this.state !== 'garage') return;
      id = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      this._backdrop().dragging = true;
      try {
        this.canvas.setPointerCapture(id);
      } catch {
        /* ignore */
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      this._backdrop().drag(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.garage.dragging = false;
      if (this.street) this.street.dragging = false;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  /** The scene behind the current screen: the studio in the garage, the street everywhere else. */
  _backdrop() {
    return this.state === 'garage' || !this.street ? this.garage : this.street;
  }

  // ------------------------------------------------------------------ main loop
  _frame(now) {
    requestAnimationFrame(this._tick);
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = raw > 0 ? Math.min(raw, 0.05) : 1 / 60;
    this.input.update(dt);
    this.ui.pollNav(this.input);
    if (this.state === 'race' && this.race) {
      if (this.input.consume('pause')) {
        if (this.race.paused) this.resume();
        else if (this.race.phase !== 'results') this.pause();
      }
      if (this.race.paused || this.ui.rotateBlocking) {
        if (this._renderPaused || this.ui.rotateBlocking) {
          this._renderPaused = false;
          this.race.render();
        }
        return;
      }
      const w0 = performance.now();
      this.race.update(dt);
      this.hud?.update(dt);
      this.touch?.update(this.race.hud);
      this.race.render();
      // auto quality: the real frame time, and how much of it was the main thread's own work
      this.renderer.trackFrame(raw, now, (performance.now() - w0) / 1000);
    } else if (this.garage && this.state !== 'loading') {
      this.input.clearEdges();
      const bg = this._backdrop();
      const w0 = performance.now();
      bg.update(dt);
      bg.render();
      if (bg === this.street) this.renderer.trackFrame(raw, now, (performance.now() - w0) / 1000);
    }
  }
}
