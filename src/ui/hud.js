import { el, $, ICONS } from './dom.js';
import { formatTime, formatNumber, clamp } from '../core/math.js';

const SUFFIX = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
const TIER_CLASS = ['', 'turbo1', 'turbo2', 'turbo3'];
const TIER_COLOR = ['#ffffff', '#a8d8ff', '#ffb466', '#ff7a6b'];

/** In-race heads-up display. Reads race.hud every frame; reacts to race events. */
export class HUD {
  constructor(app, race) {
    this.app = app;
    this.race = race;
    this.root = el(`
      <div class="hud ${race.cfg.mode === 'timetrial' ? 'tt' : ''}">
        <div class="hud-tl">
          <div class="pos-box"><span class="p">-</span><span class="suf"></span><span class="of"></span></div>
          <div class="lap-box"><span class="lbl">LAP</span><b class="l">1</b><span class="ls">/3</span></div>
          <div class="standings-mini"></div>
        </div>
        <div class="hud-tc">
          <div class="time">00:00.00</div>
          <div class="sub"><span>LAP <b class="lapt">00:00.00</b></span><span>BEST <b class="best">--:--.--</b></span></div>
        </div>
        <div class="hud-tr">
          <canvas class="minimap" width="200" height="200"></canvas>
          <div class="btns">
            <button class="icon-btn" data-a="pause" aria-label="Pause">${ICONS.pause}</button>
            <button class="icon-btn" data-a="camera" aria-label="Camera">${ICONS.camera}</button>
          </div>
        </div>
        <div class="combo"><div class="x">x1</div><div class="meter"><i></i></div><div class="style">STYLE 0</div></div>
        <div class="drift-tier"><span class="lbl">DRIFT</span><span class="pts">0</span></div>
        <div class="popups"></div>
        <div class="center-msg"></div>
        <div class="gauge">
          <div class="g-red"></div>
          <div class="g-track"></div>
          <div class="g-fill"></div>
          <div class="g-center"><div class="num">0</div><div class="unit">KM/H</div></div>
          <div class="g-gear">1</div>
          <div class="nitro-bars"><i><b></b></i><i><b></b></i><i><b></b></i></div>
        </div>
        <div class="fps"></div>
      </div>`);
    this.$ = {
      posBox: $(this.root, '.pos-box'),
      p: $(this.root, '.p'),
      suf: $(this.root, '.suf'),
      of: $(this.root, '.of'),
      l: $(this.root, '.l'),
      ls: $(this.root, '.ls'),
      standings: $(this.root, '.standings-mini'),
      time: $(this.root, '.time'),
      lapt: $(this.root, '.lapt'),
      best: $(this.root, '.best'),
      combo: $(this.root, '.combo'),
      comboX: $(this.root, '.combo .x'),
      comboBar: $(this.root, '.combo .meter i'),
      style: $(this.root, '.combo .style'),
      drift: $(this.root, '.drift-tier'),
      driftLbl: $(this.root, '.drift-tier .lbl'),
      driftPts: $(this.root, '.drift-tier .pts'),
      popups: $(this.root, '.popups'),
      center: $(this.root, '.center-msg'),
      gauge: $(this.root, '.gauge'),
      num: $(this.root, '.g-center .num'),
      unit: $(this.root, '.g-center .unit'),
      gear: $(this.root, '.g-gear'),
      nitro: Array.from(this.root.querySelectorAll('.nitro-bars i')),
      fps: $(this.root, '.fps'),
      map: $(this.root, '.minimap'),
    };
    this.$.unit.textContent = app.settings.units === 'mph' ? 'MPH' : 'KM/H';
    this.root.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      e.preventDefault();
      if (b.dataset.a === 'pause') app.pause();
      if (b.dataset.a === 'camera') app.input.press('camera');
    });
    this.cache = {};
    this._buildMap();
    this._fpsT = 0;
    this._fpsN = 0;
    this._wrongShown = false;
    this._standT = 1;
    this._heading = null;

    race.on('popup', (p) => this.popup(p));
    race.on('countdown', (c) => this.countdown(c.value));
    race.on('lap', (l) => {
      if (l.final) this.banner('FINAL LAP', 'info');
      else this.banner(`LAP ${l.lap}`, 'info');
      // lap split, with the gap to the best lap so far
      const prev = this._lapBest ?? Infinity;
      let delta = '';
      if (isFinite(prev)) {
        const d = l.time - prev;
        delta = `<span class="delta ${d <= 0 ? 'good' : 'bad'}">${d <= 0 ? '-' : '+'}${Math.abs(d).toFixed(2)}</span>`;
      }
      this._lapBest = Math.min(prev, l.time);
      this.popup({ kind: 'lap', label: `LAP ${l.lap - 1} · ${formatTime(l.time)}${delta}`, points: 0, combo: 1 });
    });
    race.on('finish', (f) =>
      this.banner(race.cfg.mode === 'timetrial' ? 'FINISH' : f.place === 1 ? 'VICTORY' : `FINISHED ${f.place}${SUFFIX(f.place)}`, f.place === 1 && race.cfg.mode !== 'timetrial' ? 'win' : 'info', true),
    );
    race.on('intro', (i) => this.intro(i));
    race.on('camera', (m) => this.popup({ kind: 'info', label: `CAMERA · ${m.toUpperCase()}`, points: 0, combo: 1 }));
  }

  mount(parent) {
    parent.appendChild(this.root);
  }

  intro(info) {
    const cfg = this.race.cfg;
    const v = cfg.variant || {};
    const mode = cfg.mode === 'timetrial' ? 'TIME TRIAL' : cfg.mode === 'daily' ? 'DAILY CHALLENGE' : 'RACE';
    const chips = [
      `${cfg.laps} ${cfg.laps === 1 ? 'LAP' : 'LAPS'}`,
      v.reverse ? 'REVERSE' : null,
      v.mirror ? 'MIRROR' : null,
      v.weather === 'rain' ? `${ICONS.rain}RAIN` : `${ICONS.moon}CLEAR`,
      cfg.mode === 'timetrial' ? null : `${cfg.opponents || 5} RIVALS`,
    ].filter(Boolean);
    const card = el(`
      <div class="intro-card">
        <div class="eyebrow">${mode}</div>
        <div class="t2">${info.name}</div>
        <div class="t3">${info.tagline}</div>
        <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
      </div>`);
    this.root.appendChild(card);
    const skip = el(`<div class="skip-hint">SKIP ${ICONS.chevron}</div>`);
    skip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.race.skipIntro();
    });
    this.root.appendChild(skip);
    this.root.classList.add('intro');
    setTimeout(() => {
      card.remove();
      skip.remove();
      this.root.classList.remove('intro');
    }, 3400);
    this.introEls = [card, skip];
  }

  countdown(v) {
    if (this.introEls) {
      for (const e of this.introEls) e.remove();
      this.introEls = null;
      this.root.classList.remove('intro');
    }
    this.$.center.innerHTML = '';
    this.$.center.appendChild(el(`<div class="countdown ${v === 'GO' ? 'go' : ''}">${v}</div>`));
  }

  banner(text, kind = 'info', long = false) {
    this.$.center.innerHTML = '';
    const d = el(`<div class="banner ${kind}">${text}</div>`);
    if (long) d.style.animationDuration = '3.2s';
    this.$.center.appendChild(d);
  }

  popup(p) {
    // the same informational message twice in a row (e.g. drafting two cars) is just noise
    const now = performance.now();
    if (!p.points && this._lastPopup && this._lastPopup.label === p.label && now - this._lastPopup.t < 1500) return;
    this._lastPopup = { label: p.label, t: now };
    const box = this.$.popups;
    while (box.children.length > 3) box.firstChild.remove();
    let cls = 'popup';
    if (p.big) cls += ' big';
    if (p.kind === 'fail' || p.kind === 'break') cls += ' fail';
    else if (p.kind === 'info') cls += ' info';
    if (p.kind === 'turbo') cls += ' ' + TIER_CLASS[p.tier || 1];
    const pts = p.points ? `<span class="pts">+${formatNumber(p.points)}</span>` : '';
    const mult = p.combo > 1 && p.points ? `<span class="pts">x${p.combo}</span>` : '';
    const d = el(`<div class="${cls}">${p.label}${pts}${mult}</div>`);
    box.appendChild(d);
    setTimeout(() => d.remove(), 1600);
    if (p.points) this.app.audio?.play('popup', { combo: p.combo });
  }

  _buildMap() {
    const tr = this.race.track;
    const c = this.$.map;
    const W = c.width;
    const b = tr.bounds;
    const pad = 22;
    const sx = (W - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    this.mapXf = (x, z) => [W / 2 + (x - cx) * sx, W / 2 + (z - cz) * sx];
    const off = document.createElement('canvas');
    off.width = W;
    off.height = W;
    const g = off.getContext('2d');
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= tr.n; i += 2) {
      const k = i % tr.n;
      const [x, y] = this.mapXf(tr.px[k], tr.pz[k]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    g.lineWidth = 12;
    g.stroke();
    g.strokeStyle = 'rgba(243, 245, 248, 0.85)';
    g.lineWidth = 3.5;
    g.stroke();
    // start / finish bar
    const [x0, y0] = this.mapXf(tr.px[0], tr.pz[0]);
    const [x1, y1] = this.mapXf(tr.px[4 % tr.n], tr.pz[4 % tr.n]);
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.save();
    g.translate(x0, y0);
    g.rotate(a);
    g.fillStyle = '#ffffff';
    g.fillRect(-2, -8, 4, 16);
    g.restore();
    this.mapBase = off;
    this.mapCtx = c.getContext('2d');
  }

  _drawMap() {
    const g = this.mapCtx;
    const W = this.$.map.width;
    g.clearRect(0, 0, W, W);
    g.drawImage(this.mapBase, 0, 0);
    const data = this.race.minimapData();
    if (data.ghost) {
      const [x, y] = this.mapXf(data.ghost.x, data.ghost.z);
      g.strokeStyle = 'rgba(168, 216, 255, 0.9)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.stroke();
    }
    for (const c of data.cars) {
      if (c.player) continue;
      const [x, y] = this.mapXf(c.x, c.z);
      g.fillStyle = c.color;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(x, y, 5.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const me = data.cars.find((c) => c.player);
    if (me) {
      const [x, y] = this.mapXf(me.x, me.z);
      // heading from recent movement, smoothed
      if (this._last) {
        const dx = x - this._last[0];
        const dy = y - this._last[1];
        if (dx * dx + dy * dy > 0.02) {
          const a = Math.atan2(dy, dx);
          if (this._heading === null) this._heading = a;
          else {
            let d = a - this._heading;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            this._heading += d * 0.35;
          }
        }
      }
      this._last = [x, y];
      const h = this._heading ?? 0;
      g.save();
      g.translate(x, y);
      g.rotate(h);
      g.beginPath();
      g.moveTo(10, 0);
      g.lineTo(-7, -7);
      g.lineTo(-3, 0);
      g.lineTo(-7, 7);
      g.closePath();
      g.lineJoin = 'round';
      g.strokeStyle = '#ff8a2a';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fill();
      g.restore();
    }
  }

  _drawStandings() {
    const race = this.race;
    if (race.cfg.mode === 'timetrial') {
      this.$.standings.style.display = 'none';
      return;
    }
    const order = race.order || race.racers;
    const meIdx = order.findIndex((r) => r.isPlayer);
    const sig = order.map((r) => r.name).join(',');
    if (sig === this.cache.stand) return;
    this.cache.stand = sig;
    this.$.standings.innerHTML = order
      .map((r, i) => {
        const near = Math.abs(i - meIdx) <= 1 ? 'near' : '';
        return `<div class="sm-row ${r.isPlayer ? 'me' : ''} ${near}"><span class="n">${i + 1}</span><i style="--c:${r.color}"></i><span>${r.isPlayer ? 'YOU' : r.name}</span></div>`;
      })
      .join('');
  }

  _set(key, node, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    node[prop] = value;
  }

  update(dt) {
    const h = this.race.hud;
    const $ = this.$;
    const timeTrial = h.mode === 'timetrial';
    if (!timeTrial) {
      const place = h.place || 0;
      if (this.cache.place && place && place !== this.cache.place) {
        $.posBox.classList.remove('changed');
        void $.posBox.offsetWidth;
        $.posBox.classList.add('changed');
      }
      this.cache.place = place;
      this._set('p', $.p, place ? String(place) : '-');
      this._set('suf', $.suf, place ? SUFFIX(place) : '');
      this._set('of', $.of, `/${h.total || '-'}`);
    }
    this._set('l', $.l, String(h.lap || 1));
    this._set('ls', $.ls, `/${h.laps || 1}`);
    this._set('time', $.time, formatTime(h.time || 0));
    this._set('lapt', $.lapt, formatTime(h.lapTime || 0));
    this._set('best', $.best, isFinite(h.bestLap) ? formatTime(h.bestLap) : '--:--.--');
    // gauge
    const mph = this.app.settings.units === 'mph';
    const spd = Math.round((h.speed || 0) * (mph ? 2.23694 : 3.6));
    this._set('num', $.num, String(spd));
    this._set('gear', $.gear, String(h.gear || 1));
    const rpm = clamp((h.rpm || 0) / 1.05, 0, 1);
    const p = rpm.toFixed(3);
    if (this.cache.rpm !== p) {
      this.cache.rpm = p;
      $.gauge.style.setProperty('--p', p);
    }
    const red = rpm > 0.9;
    if (this.cache.red !== red) {
      this.cache.red = red;
      $.gauge.classList.toggle('redline', red);
    }
    const boost = (h.boost || 0) > 0.05;
    if (this.cache.boost !== boost) {
      this.cache.boost = boost;
      $.gauge.classList.toggle('boost', boost);
    }
    // nitro bars
    for (let i = 0; i < 3; i++) {
      const f = clamp((h.nitro || 0) - i, 0, 1);
      const key = 'n' + i;
      const v = f.toFixed(2);
      if (this.cache[key] !== v) {
        this.cache[key] = v;
        $.nitro[i].firstChild.style.transform = `scaleX(${f})`;
        $.nitro[i].classList.toggle('full', f >= 1);
      }
    }
    // drift indicator
    const drifting = h.driftTier >= 0 && (h.driftPoints || 0) > 20;
    if (this.cache.drifting !== drifting) {
      this.cache.drifting = drifting;
      $.drift.classList.toggle('on', drifting);
    }
    if (drifting) {
      const tier = h.driftTier;
      this._set('dl', $.driftLbl, tier > 0 ? ['', 'MINI TURBO', 'SUPER TURBO', 'ULTRA TURBO'][tier] : 'DRIFT');
      this._set('dp', $.driftPts, formatNumber(h.driftPoints * (h.combo || 1)));
      const col = TIER_COLOR[tier];
      if (this.cache.dc !== col) {
        this.cache.dc = col;
        $.drift.style.color = col;
      }
    }
    // combo
    const comboOn = (h.combo || 1) > 1;
    if (this.cache.comboOn !== comboOn) {
      this.cache.comboOn = comboOn;
      $.combo.classList.toggle('on', comboOn);
    }
    this._set('cx', $.comboX, `x${h.combo || 1}`);
    $.comboBar.style.transform = `scaleX(${clamp(h.comboTimer || 0, 0, 1).toFixed(3)})`;
    this._set('st', $.style, `STYLE ${formatNumber(h.style || 0)}`);
    // wrong way
    if (h.wrongWay && !this._wrongShown) {
      this._wrongShown = true;
      this.banner('WRONG WAY', 'warn');
    } else if (!h.wrongWay) this._wrongShown = false;
    // minimap ~30 fps, standings 4 Hz
    this._mapT = (this._mapT || 0) + dt;
    if (this._mapT > 0.033) {
      this._mapT = 0;
      this._drawMap();
    }
    this._standT += dt;
    if (this._standT > 0.25) {
      this._standT = 0;
      this._drawStandings();
    }
    // fps
    if (this.app.settings.showFps) {
      this._fpsT += dt;
      this._fpsN++;
      if (this._fpsT > 0.5) {
        const r = this.app.renderer;
        $.fps.textContent = `${Math.round(this._fpsN / this._fpsT)} FPS · ${Math.round(r.post.quality.renderScale * 100)}% · ${r.renderer.info.render.calls} DC`;
        this._fpsT = 0;
        this._fpsN = 0;
      }
    } else if ($.fps.textContent) $.fps.textContent = '';
  }

  dispose() {
    this.root.remove();
  }
}
