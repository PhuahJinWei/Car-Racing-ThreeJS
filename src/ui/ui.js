import { el, $, $$, delegate, ICONS } from './dom.js';
import { TRACKS, getTrackDef } from '../world/tracks.js';
import { Track } from '../world/track.js';
import { CARS, getCarDef } from '../car/car-defs.js';
import { CATEGORIES, findItem, PAINTS, resolveCustom } from '../car/customization.js';
import { getDaily, msUntilTomorrow } from '../game/daily.js';
import { hasOwnWheels } from '../car/car-assets.js';
import { formatTime, formatNumber } from '../core/math.js';
import { controlsCells } from './controls-help.js';
import districtShot from '../assets/tracks/district.jpg';
import lumenShot from '../assets/tracks/lumen.jpg';
import circuitShot from '../assets/tracks/circuit.jpg';

const THEME_LABEL = { tunnel: 'EXPRESSWAY', city: 'STREET', stadium: 'CIRCUIT' };

// In-game shots for the track cards; focus is the crop point when a card's shape differs from the 16:9 shot.
const TRACK_SHOTS = {
  district: { src: districtShot, focus: '74% 55%' },
  lumen: { src: lumenShot, focus: '52% 55%' },
  circuit: { src: circuitShot, focus: '70% 55%' },
};
// Event setup order (TRACKS keeps its own order: the daily challenge picks from it by index)
const SETUP_ORDER = ['district', 'lumen', 'circuit'];
const SETUP_TRACKS = [...TRACKS].sort((a, b) => (SETUP_ORDER.indexOf(a.id) + 1 || 99) - (SETUP_ORDER.indexOf(b.id) + 1 || 99));
const MODE_LABEL = { race: 'RACE', timetrial: 'TIME TRIAL', daily: 'DAILY CHALLENGE' };
const SUFFIX = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');

const TIPS = [
  'Hold <b>DRIFT</b> through a corner, then let go for a turbo boost. Longer drifts give bigger boosts.',
  'Hit <b>NITRO</b> just as the start lights go out for a perfect launch.',
  'Drifts, near misses, slipstreams and big air all refill your nitro.',
  'Chain stunts within four seconds of each other to build your <b>combo</b> multiplier.',
  'Tuck in behind a rival to catch their <b>slipstream</b>, then slingshot past.',
  'Blue chevron pads give you a free burst of speed.',
  'Daily challenges change at midnight. Complete them in a row to grow your streak bonus.',
  'Time Trial saves a ghost of your best run, so you can race against yourself.',
];

const LOGO = (cls = '') => `<div class="logo ${cls}"><span class="l1">MIDNIGHT</span><span class="l2">OVERDRIVE</span><span class="trail"></span></div>`;

const trackCache = new Map();
function previewTrack(id, variant) {
  const key = `${id}|${variant.reverse ? 1 : 0}|${variant.mirror ? 1 : 0}`;
  if (!trackCache.has(key)) trackCache.set(key, new Track(getTrackDef(id), variant));
  return trackCache.get(key);
}

/** Track outline: dim road underlay, crisp line, start/finish bar and a direction arrow. */
export function drawTrackPreview(canvas, track, { color = '#f3f5f8', accent = '#ff8a2a', width = 1 } = {}) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  g.clearRect(0, 0, W, H);
  const b = track.bounds;
  const pad = W * 0.11;
  const sc = (W - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const X = (k) => W / 2 + (track.px[k % track.n] - cx) * sc;
  const Y = (k) => H / 2 + (track.pz[k % track.n] - cz) * sc;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= track.n; i += 3) {
    if (i === 0) g.moveTo(X(i), Y(i));
    else g.lineTo(X(i), Y(i));
  }
  g.closePath();
  g.strokeStyle = 'rgba(255,255,255,0.09)';
  g.lineWidth = W * 0.08;
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = W * 0.022 * width;
  g.stroke();
  // start / finish bar across the road
  const k1 = Math.max(2, Math.round(track.n * 0.01));
  const dx = X(k1) - X(0);
  const dy = Y(k1) - Y(0);
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const s = W * 0.05;
  g.lineCap = 'butt';
  g.strokeStyle = '#ffffff';
  g.lineWidth = W * 0.024;
  g.beginPath();
  g.moveTo(X(0) - nx * s, Y(0) - ny * s);
  g.lineTo(X(0) + nx * s, Y(0) + ny * s);
  g.stroke();
  // direction arrow a little way down the road
  const ka = Math.round(track.n * 0.07);
  const kb = ka + Math.max(3, Math.round(track.n * 0.012));
  const a = Math.atan2(Y(kb) - Y(ka), X(kb) - X(ka));
  g.save();
  g.translate(X(ka), Y(ka));
  g.rotate(a);
  g.fillStyle = accent;
  g.beginPath();
  g.moveTo(W * 0.05, 0);
  g.lineTo(-W * 0.028, -W * 0.04);
  g.lineTo(-W * 0.012, 0);
  g.lineTo(-W * 0.028, W * 0.04);
  g.closePath();
  g.fill();
  g.restore();
}

function seg(name, options, value) {
  return `<div class="seg" data-opt="${name}">${options
    .map(([v, label]) => `<button data-action="seg" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`)
    .join('')}</div>`;
}

function statList(c) {
  return [
    ['SPEED', c.display.speed],
    ['ACCEL', c.display.accel],
    ['HANDLING', c.display.handling],
    ['NITRO', c.display.nitro],
  ];
}

// ---------------------------------------------------------------- customization swatches
const RIM_SPOKES = {
  split: () => [0, 1, 2, 3, 4].map((i) => `<g transform="rotate(${i * 72} 12 12)"><path d="M11.2 10L10.6 4.6M12.8 10l.6-5.4"/></g>`).join(''),
  turbine: () => Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30} 12 12)" d="M12 9.6c1.4-1.2 1.9-2.7 1.6-4.8"/>`).join(''),
  mesh: () => [0, 1, 2, 3, 4, 5].map((i) => `<path transform="rotate(${i * 30} 12 12)" d="M5 12h14"/>`).join(''),
  blade: () => [0, 1, 2, 3, 4].map((i) => `<path transform="rotate(${i * 72} 12 12)" d="M12 9.5C11 7.6 11.3 6 12.6 4.4"/>`).join(''),
};

const LIVERY_ART = {
  lv_none: () => '',
  lv_stripes: (a) => `<rect x="9.6" y="2" width="1.8" height="20" fill="${a}"/><rect x="12.6" y="2" width="1.8" height="20" fill="${a}"/>`,
  lv_race: (a) => `<circle cx="12" cy="12" r="5.2" fill="${a}"/><text x="12" y="14.4" text-anchor="middle" font-size="6.6" font-weight="700" font-family="Rajdhani, sans-serif" fill="#111">77</text>`,
  lv_bolt: (a) => `<path d="M13.6 3.5L7.6 13h4.2l-1.4 7.5 6-9.6h-4.2z" fill="${a}"/>`,
  lv_split: (a) => `<path d="M2 14L22 7V22H2z" fill="${a}"/>`,
  lv_circuit: (a) => `<path d="M3 8h6l3 3h4l2-2h3M3 15h4l2 2h5l3-3h4M12 11v6" stroke="${a}" stroke-width="1.3" fill="none"/><circle cx="18" cy="9" r="1.1" fill="${a}"/><circle cx="9" cy="17" r="1.1" fill="${a}"/>`,
};

function swatchFor(cat, item, custom) {
  if (cat === 'paint' || cat === 'accent' || cat === 'rimColor') {
    const glow = item.glow ? `box-shadow:0 0 12px ${item.color};` : '';
    return `<span class="sw gloss" style="--c:${item.color};${glow}"></span>`;
  }
  if (cat === 'underglow' || cat === 'trail') {
    if (!item.color) return `<span class="sw none"></span>`;
    if (item.color === 'rainbow') return '<span class="sw glow" style="--c:#fff;background:conic-gradient(#ff3b5c,#ffb03a,#7dff6a,#3ad0ff,#8a6bff,#ff3b5c)"></span>';
    return `<span class="sw glow" style="--c:${item.color}"></span>`;
  }
  const paint = custom.paint.color;
  if (cat === 'finish') {
    const bg = {
      gloss: `radial-gradient(circle at 32% 28%, #fff 0, ${paint} 26%, color-mix(in srgb, ${paint} 45%, #000) 100%)`,
      metallic: `radial-gradient(circle at 32% 28%, #fff 0, ${paint} 22%, color-mix(in srgb, ${paint} 40%, #000) 70%, color-mix(in srgb, ${paint} 70%, #fff) 100%)`,
      matte: `color-mix(in srgb, ${paint} 80%, #333)`,
      pearl: `conic-gradient(from 40deg, ${paint}, #7ad0ff, #e98bff, ${paint})`,
      chrome: 'linear-gradient(135deg, #fff 0%, #8a8f99 38%, #f4f6fa 55%, #3a3d44 100%)',
      neon: `radial-gradient(circle, #fff 0, ${paint} 45%, color-mix(in srgb, ${paint} 30%, #000) 100%)`,
    }[item.id];
    const glow = item.id === 'neon' ? `box-shadow:0 0 12px ${paint};` : '';
    return `<span class="sw" style="background:${bg};${glow}"></span>`;
  }
  if (cat === 'livery') {
    const art = (LIVERY_ART[item.id] || LIVERY_ART.lv_none)(custom.accent.color);
    return `<span class="sw art" style="--c:${paint}"><svg viewBox="0 0 24 24" aria-hidden="true">${art}</svg></span>`;
  }
  if (cat === 'rims') {
    const spokes = (RIM_SPOKES[item.style] || RIM_SPOKES.split)();
    return `<span class="sw art rim" style="--c:#15171c;color:color-mix(in srgb, ${custom.rimColor.color} 62%, #ffffff)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/>${spokes}<circle cx="12" cy="12" r="1.9" fill="currentColor"/></svg></span>`;
  }
  return '<span class="sw"></span>';
}

/** Screen manager + all menu screens. */
export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.screenLayer = el('<div class="layer"></div>');
    this.hudLayer = el('<div class="layer"></div>');
    this.overlayLayer = el('<div class="layer"></div>');
    this.toasts = el('<div class="toasts"></div>');
    this.rotateHint = el(`
      <div class="rotate-hint">
        <div class="rh-icon">${ICONS.rotate}</div>
        <div class="rh-title">ROTATE YOUR DEVICE</div>
        <div class="rh-sub">Midnight Overdrive plays best in landscape.</div>
        <button class="btn ghost small" data-action="playanyway">PLAY ANYWAY</button>
      </div>`);
    this.root.append(this.screenLayer, this.hudLayer, this.overlayLayer, this.toasts, this.rotateHint);
    this.screen = null;
    this.overlay = null;
    this.portraitOk = false;
    this.rotateHint.querySelector('button').addEventListener('click', () => {
      this.portraitOk = true;
      this.updateRotateHint();
    });
    // UI sounds
    this.root.addEventListener(
      'pointerdown',
      (e) => {
        const b = e.target.closest('button, .menu-item, .item');
        if (b && !b.disabled) app.audio?.play(b.dataset.sfx || 'ui');
      },
      true,
    );
    this.root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.menu-item');
      if (b && b !== this._hovered) app.audio?.play('ui-hover');
      this._hovered = b;
    });
    // keyboard: arrows move between controls, Esc / Backspace go back (the pause key is handled by the race)
    window.addEventListener('keydown', (e) => {
      if (!this._navAllowed() || this.loading) return;
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      if (dir) {
        // sliders keep their own left / right
        if ((dir === 'left' || dir === 'right') && document.activeElement?.matches?.('input.range')) return;
        e.preventDefault();
        this.navigate(dir);
      } else if ((e.key === 'Escape' || (e.key === 'Backspace' && e.target.tagName !== 'INPUT')) && !e.repeat && !this.overlay) {
        if (this.navBack()) e.preventDefault();
      }
    });
    // pointer use hides the keyboard / gamepad focus ring
    window.addEventListener('pointerdown', () => this._clearNavFocus(), true);
    window.addEventListener('resize', () => this.updateRotateHint());
  }

  // ---------------------------------------------------------------- keyboard / gamepad navigation
  _navAllowed() {
    const st = this.app.state;
    if (st === 'loading' || st === 'boot') return false;
    if (st === 'race') return !!this.overlay;
    return !!this.screen;
  }

  _navScope() {
    return this.overlay || this.screen?.el || null;
  }

  _focusables() {
    const scope = this._navScope();
    if (!scope) return [];
    return $$(scope, 'button:not([disabled]), input.range').filter((e) => e.offsetParent !== null && e.getClientRects().length);
  }

  _clearNavFocus() {
    for (const n of $$(this.root, '.nav-focus')) n.classList.remove('nav-focus');
  }

  _setNavFocus(elm) {
    this._clearNavFocus();
    elm.classList.add('nav-focus');
    elm.focus({ preventScroll: true });
    elm.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    this.app.audio?.play('ui-hover');
  }

  /** Spatial navigation: move to the nearest control in that direction. */
  navigate(dir) {
    const els = this._focusables();
    if (!els.length) return;
    const cur = document.activeElement;
    if (!els.includes(cur) || !cur.classList.contains('nav-focus')) {
      const start = els.includes(cur) ? cur : els.find((e) => e.classList.contains('menu-item')) || els.find((e) => e.classList.contains('primary')) || els[0];
      this._setNavFocus(start);
      return;
    }
    if (cur.matches('input.range') && (dir === 'left' || dir === 'right')) {
      const step = Number(cur.step) || 0.05;
      cur.value = String(Number(cur.value) + (dir === 'left' ? -step : step));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const e of els) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax;
      const dy = r.top + r.height / 2 - ay;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 2) continue;
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) this._setNavFocus(best);
  }

  navOk() {
    if (this.screen?.name === 'title' && !this.overlay) {
      this.screen.el.dispatchEvent(new Event('pointerdown'));
      return;
    }
    const cur = document.activeElement;
    if (cur && this._focusables().includes(cur) && cur.classList.contains('nav-focus')) {
      if (!cur.matches('input')) {
        this.app.audio?.play(cur.dataset.sfx || 'ui');
        cur.click();
      }
    } else this.navigate('down');
  }

  navBack() {
    const scope = this._navScope();
    if (!scope) return false;
    const back = scope.querySelector('[data-action="back"]') || scope.querySelector('[data-action="resume"]');
    if (!back) return false;
    this.app.audio?.play('ui-back');
    back.click();
    return true;
  }

  /** Gamepad edges from the input module (always consumed, acted on only while a menu is up). */
  pollNav(input) {
    const acts = [];
    for (const a of ['ui-up', 'ui-down', 'ui-left', 'ui-right', 'ui-ok', 'ui-back']) if (input.consume(a)) acts.push(a);
    if (!acts.length || !this._navAllowed() || this.loading) return;
    for (const a of acts) {
      if (a === 'ui-ok') this.navOk();
      else if (a === 'ui-back') this.navBack();
      else this.navigate(a.slice(3));
    }
  }

  /** Low quality: no backdrop blur (it re-blurs the live 3D view every frame). */
  setLite(on) {
    this.root.classList.toggle('lite', !!on);
  }

  updateRotateHint() {
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    const touch = this.app.input.isTouchDevice();
    const inRace = this.app.state === 'race';
    this.rotateBlocking = portrait && touch && inRace && !this.portraitOk;
    this.rotateHint.style.display = this.rotateBlocking ? 'flex' : 'none';
  }

  clearScreen() {
    if (this.screen) {
      this.screen.dispose?.();
      this.screen.el.remove();
      this.screen = null;
    }
  }

  show(name, params) {
    this.clearScreen();
    const fn = this[`_screen_${name}`];
    if (!fn) throw new Error('no screen ' + name);
    this.screen = fn.call(this, params || {});
    this.screen.name = name;
    this.screenLayer.appendChild(this.screen.el);
  }

  toast(msg) {
    const t = el(`<div class="toast">${msg}</div>`);
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }

  tip(msg) {
    const t = el(`<div class="tip"><span class="tag">TIP</span><span>${msg}</span></div>`);
    this.hudLayer.appendChild(t);
    setTimeout(() => t.remove(), 5100);
  }

  creditsHtml() {
    return `<div class="credits" title="Credits">${ICONS.coin}<b>${formatNumber(this.app.storage.credits)}</b><small>CR</small></div>`;
  }

  refreshCredits() {
    for (const n of $$(this.root, '.credits')) {
      $(n, 'b').textContent = formatNumber(this.app.storage.credits);
      n.classList.remove('bump');
      void n.offsetWidth;
      n.classList.add('bump');
    }
  }

  _head(eyebrow, title, right = '') {
    return `
      <header class="topbar anim-down">
        <button class="icon-btn" data-action="back" data-sfx="ui-back" aria-label="Back">${ICONS.back}</button>
        <div class="title-block"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>
        <div class="spacer"></div>
        ${right}
      </header>`;
  }

  // ---------------------------------------------------------------- loading
  /** Boot loader, or (with `info`) the race card shown while a track is being built. */
  showLoading(text, info) {
    this.hideLoading();
    let body;
    let tr = null;
    if (info && info.trackId) {
      const def = getTrackDef(info.trackId);
      const v = info.variant || {};
      tr = previewTrack(info.trackId, v);
      const laps = info.laps || def.laps;
      const chips = [
        `${ICONS.laps}${laps} ${laps === 1 ? 'LAP' : 'LAPS'}`,
        v.reverse ? `${ICONS.reverse}REVERSE` : null,
        v.mirror ? `${ICONS.mirror}MIRROR` : null,
        v.weather === 'rain' ? `${ICONS.rain}RAIN` : `${ICONS.moon}CLEAR`,
      ].filter(Boolean);
      const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
      body = `
        <div class="race-load">
          <canvas class="rl-map" width="320" height="320"></canvas>
          <div class="rl-info">
            <div class="eyebrow accent">${MODE_LABEL[info.mode] || 'RACE'} · ${THEME_LABEL[def.theme] || ''} · ${(tr.length / 1000).toFixed(1)} KM</div>
            <h2>${def.name}</h2>
            <p>${def.tagline}</p>
            <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
          </div>
        </div>
        <div class="load-foot">
          <div class="load-bar"><i></i></div>
          <div class="load-text">${text}</div>
          <div class="load-tip"><span class="tag">TIP</span><span>${tip}</span></div>
        </div>`;
    } else {
      body = `${LOGO('load')}<div class="load-bar"><i></i></div><div class="load-text">${text}</div>`;
    }
    this.loading = el(`<div class="loading-screen ${tr ? 'race' : ''}">${body}</div>`);
    if (tr) drawTrackPreview($(this.loading, '.rl-map'), tr, { width: 1.2 });
    this.overlayLayer.appendChild(this.loading);
  }

  hideLoading() {
    if (this.loading) {
      this.loading.remove();
      this.loading = null;
    }
  }

  // ---------------------------------------------------------------- title
  _screen_title() {
    const app = this.app;
    const touch = app.input.isTouchDevice();
    const root = el(`
      <div class="screen title-screen">
        <div class="title-center">
          ${LOGO('xl')}
          <div class="title-tag">NIGHT STREET RACING</div>
        </div>
        <div class="press-start"><i></i><span>${touch ? 'TAP TO START' : 'PRESS ANY KEY'}</span><i></i></div>
        <div class="title-footer">${touch ? 'BEST IN LANDSCAPE' : 'KEYBOARD · GAMEPAD · TOUCH'}<span class="dot"></span>HEADPHONES RECOMMENDED</div>
      </div>`);
    let done = false;
    const go = (e) => {
      if (done) return;
      done = true;
      e?.preventDefault?.();
      root.classList.add('leaving');
      app.onTitleStart();
    };
    root.addEventListener('pointerdown', go);
    const key = (e) => {
      if (e.repeat) return;
      go(e);
    };
    window.addEventListener('keydown', key);
    return { el: root, dispose: () => window.removeEventListener('keydown', key) };
  }

  // ---------------------------------------------------------------- main menu
  _screen_menu() {
    const app = this.app;
    const S = app.storage;
    const car = getCarDef(S.data.car);
    const daily = getDaily();
    const dailyDone = S.data.daily.date === daily.key && S.data.daily.completed;
    const st = S.data.stats;
    const item = (i, action, icon, title, sub, badge = '', cls = '') => `
      <button class="menu-item ${cls}" data-action="${action}" style="--i:${i}">
        <span class="mi-icon">${ICONS[icon]}</span>
        <span class="mi-text"><span class="mi-title">${title}${badge}</span><span class="mi-sub">${sub}</span></span>
        <span class="mi-go">${ICONS.chevron}</span>
      </button>`;
    const career = st.races
      ? `<div class="career anim-up" style="--d:480">
          <div><b>${st.races}</b><span>RACES</span></div>
          <div><b>${st.wins}</b><span>WINS</span></div>
          <div><b>${st.podiums}</b><span>PODIUMS</span></div>
        </div>`
      : `<div class="drag-hint anim-up" style="--d:600">${ICONS.left}<span>DRAG TO ROTATE</span>${ICONS.right}</div>`;
    const root = el(`
      <div class="screen menu-screen">
        <header class="topbar anim-down">
          ${LOGO('sm')}
          <div class="spacer"></div>
          ${this.creditsHtml()}
          <button class="icon-btn" data-action="fullscreen" aria-label="Fullscreen">${ICONS.fullscreen}</button>
          <button class="icon-btn" data-action="settings" aria-label="Settings">${ICONS.settings}</button>
        </header>
        <main class="menu-main">
          <nav class="menu-list">
            ${item(0, 'race', 'flag', 'RACE', `${TRACKS.length} tracks · 5 rivals`, '', 'hero')}
            ${item(1, 'timetrial', 'stopwatch', 'TIME TRIAL', 'Race your own ghost')}
            ${item(2, 'daily', 'calendar', 'DAILY', daily.objective.label, dailyDone ? `<span class="pill good">${ICONS.check}DONE</span>` : '<span class="pill">NEW</span>')}
            ${item(3, 'garage', 'car', 'GARAGE', 'Cars & customization')}
            ${item(4, 'settings', 'settings', 'SETTINGS', 'Graphics · audio · controls')}
          </nav>
        </main>
        <footer class="menu-footer">
          ${career}
          <div class="car-card anim-r" style="--d:300">
            <div class="eyebrow">${car.class}</div>
            <div class="car-name">${car.name}</div>
            <div class="mini-stats">${statList(car)
              .map(([n, v]) => `<div class="mini-stat"><span>${n}</span><i style="--v:${v}"></i></div>`)
              .join('')}</div>
          </div>
        </footer>
      </div>`);
    delegate(root, {
      race: () => app.openSetup('race'),
      timetrial: () => app.openSetup('timetrial'),
      daily: () => app.openDaily(),
      garage: () => app.openGarage(),
      settings: () => app.openSettings('menu'),
      fullscreen: () => app.toggleFullscreen(),
    });
    return { el: root };
  }

  // ---------------------------------------------------------------- race setup
  _screen_setup({ mode }) {
    const app = this.app;
    const S = app.storage;
    const st = { ...S.data.lastSetup };
    if (!['auto', 'clear', 'rain'].includes(st.weather)) st.weather = 'auto';
    if (!SETUP_TRACKS.some((t) => t.id === st.trackId)) st.trackId = SETUP_TRACKS[0].id;
    const isTT = mode === 'timetrial';
    const car = getCarDef(S.data.car);
    const root = el(`
      <div class="screen setup-screen">
        ${this._head(isTT ? 'SOLO · BEAT YOUR GHOST' : 'EVENT · 5 RIVALS', isTT ? 'TIME TRIAL' : 'RACE', this.creditsHtml())}
        <div class="setup-body">
          <div class="track-cards">
            ${SETUP_TRACKS.map((t, i) => {
              const shot = TRACK_SHOTS[t.id];
              return `
              <button class="track-card anim-up" style="--d:${80 + i * 70}" data-action="track" data-id="${t.id}">
                ${shot ? `<img class="tc-shot" src="${shot.src}" alt="" draggable="false" style="object-position:${shot.focus}">` : ''}
                <span class="tc-check">${ICONS.check}</span>
                <canvas class="tc-map" width="120" height="120"></canvas>
                <span class="tc-text">
                  <span class="tc-meta"></span>
                  <span class="tc-name">${t.name}</span>
                  <span class="tc-best"></span>
                </span>
              </button>`;
            }).join('')}
          </div>
          <section class="setup-opts glass anim-up" style="--d:290">
            <div class="opt"><label>CONDITIONS</label>${seg('weather', [['auto', `${ICONS.shuffle}AUTO`], ['clear', `${ICONS.moon}CLEAR`], ['rain', `${ICONS.rain}RAIN`]], st.weather)}</div>
            <div class="opt"><label>LAPS</label>${seg('laps', [[1, '1'], [2, '2'], [3, '3'], [5, '5']], st.laps)}</div>
            ${isTT ? '' : `<div class="opt"><label>RIVALS</label>${seg('difficulty', [['rookie', 'ROOKIE'], ['easy', 'EASY'], ['normal', 'NORMAL'], ['hard', 'HARD']], st.difficulty)}</div>`}
          </section>
        </div>
        <footer class="setup-footer anim-up" style="--d:220">
          <button class="car-chip" data-action="garage">${ICONS.car}<span><small>YOUR CAR</small><b>${car.name}</b></span><em>CHANGE</em></button>
          <button class="btn primary big" data-action="start">START${ICONS.chevron}</button>
        </footer>
      </div>`);
    // events always run forward and unmirrored; AUTO weather is rolled when the race starts
    const forward = { reverse: false, mirror: false };
    const conditions = () => (st.weather === 'auto' ? ['clear', 'rain'] : [st.weather]);
    const recordKey = (id, weather) => `${id}|f|n|${weather}`;
    for (const card of $$(root, '.track-card')) {
      const def = getTrackDef(card.dataset.id);
      const tr = previewTrack(def.id, forward);
      drawTrackPreview($(card, '.tc-map'), tr, { width: 1.5 });
      $(card, '.tc-meta').textContent = `${THEME_LABEL[def.theme] || ''} · ${(tr.length / 1000).toFixed(1)} KM`;
    }
    const refresh = () => {
      for (const card of $$(root, '.track-card')) {
        const id = card.dataset.id;
        const on = id === st.trackId;
        card.classList.toggle('selected', on);
        card.setAttribute('aria-pressed', String(on));
        // AUTO shows the better of the clear and wet records
        const best = Math.min(...conditions().map((w) => S.getRecord(recordKey(id, w), mode)?.bestTime || Infinity));
        const ghost = isTT && conditions().some((w) => S.getGhost(recordKey(id, w)));
        $(card, '.tc-best').innerHTML = `${isFinite(best) ? `BEST <b>${formatTime(best)}</b>` : 'NO TIME SET'}${ghost ? '<i class="tc-ghost">GHOST</i>' : ''}`;
      }
      for (const s of $$(root, '.seg')) {
        const v = st[s.dataset.opt];
        for (const b of $$(s, 'button')) b.classList.toggle('on', String(b.dataset.v) === String(v));
      }
    };
    const save = () => {
      S.data.lastSetup = { trackId: st.trackId, ...forward, weather: st.weather, laps: st.laps, difficulty: st.difficulty };
      S.save();
    };
    delegate(root, {
      back: () => app.toMenu(),
      track: (t) => {
        st.trackId = t.dataset.id;
        if (!st.lapsTouched) st.laps = getTrackDef(st.trackId).laps;
        refresh();
      },
      seg: (b) => {
        const name = b.closest('.seg').dataset.opt;
        let v = b.dataset.v;
        if (name === 'laps') {
          v = Number(v);
          st.lapsTouched = true;
        }
        st[name] = v;
        refresh();
      },
      garage: () => {
        save();
        app.openGarage({ back: () => app.openSetup(mode) });
      },
      start: () => {
        save();
        app.startRace({
          mode,
          trackId: st.trackId,
          variant: { ...forward, weather: st.weather },
          laps: st.laps,
          difficulty: st.difficulty,
        });
      },
    });
    refresh();
    return { el: root };
  }

  // ---------------------------------------------------------------- garage
  _screen_garage({ back } = {}) {
    const app = this.app;
    const S = app.storage;
    let carIdx = Math.max(0, CARS.findIndex((c) => c.id === S.data.car));
    let cat = 'paint';
    let pending = null; // { cat, item } preview awaiting purchase
    const root = el(`
      <div class="screen garage-screen">
        ${this._head('CARS & STYLE', 'GARAGE', this.creditsHtml())}
        <div class="garage-body">
          <section class="car-info glass anim-l" style="--d:80">
            <div class="ci-top"><span class="eyebrow accent ci-cls"></span><span class="ci-count"></span></div>
            <div class="ci-name-row">
              <h2 class="car-name"></h2>
              <div class="ci-arrows">
                <button class="icon-btn sm" data-action="prevcar" aria-label="Previous car">${ICONS.left}</button>
                <button class="icon-btn sm" data-action="nextcar" aria-label="Next car">${ICONS.right}</button>
              </div>
            </div>
            <p class="blurb"></p>
            <div class="stats"></div>
            <div class="car-action"></div>
          </section>
        </div>
        <section class="dock glass anim-up" style="--d:160">
          <div class="dock-tabs hscroll">${CATEGORIES.map((c) => `<button data-action="tab" data-cat="${c.key}">${c.name}</button>`).join('')}</div>
          <div class="dock-row">
            <div class="items hscroll"></div>
            <div class="buy-box"><div class="info"></div><button class="btn primary small" data-action="buy">BUY</button></div>
          </div>
        </section>
      </div>`);
    const car = () => CARS[carIdx];
    const owned = () => S.ownsCar(car().id);
    const equippedCustom = () => S.customFor(car().id);
    const previewing = () => {
      const base = owned() ? { ...equippedCustom() } : {};
      if (pending) base[pending.cat] = pending.item.id;
      return base;
    };

    const renderCar = () => {
      const c = car();
      $(root, '.car-name').textContent = c.name;
      $(root, '.ci-cls').textContent = c.class;
      $(root, '.ci-count').textContent = `${carIdx + 1} / ${CARS.length}`;
      $(root, '.blurb').textContent = c.blurb;
      $(root, '.stats').innerHTML = statList(c)
        .map(([n, v]) => `<div class="stat"><span>${n}</span><span class="bar"><i style="--v:${v}"></i></span><b>${Math.round(v * 100)}</b></div>`)
        .join('');
      const act = $(root, '.car-action');
      if (!owned()) {
        const short = c.price - S.credits;
        act.innerHTML = `<button class="btn primary" data-action="buycar" ${short > 0 ? 'disabled' : ''}>${ICONS.lock}${short > 0 ? `NEED ${formatNumber(short)} CR` : `BUY · ${formatNumber(c.price)} CR`}</button>`;
      } else if (S.data.car === c.id) act.innerHTML = `<div class="status">${ICONS.check}SELECTED</div>`;
      else act.innerHTML = '<button class="btn primary" data-action="selectcar">SELECT CAR</button>';
    };

    const renderItems = () => {
      // imported models keep their own paint scheme and wheels
      const hidden = (k) => (k === 'livery' || k === 'rims') && hasOwnWheels(car().id);
      if (hidden(cat)) cat = 'paint';
      for (const b of $$(root, '.dock-tabs button')) {
        b.classList.toggle('on', b.dataset.cat === cat);
        b.style.display = hidden(b.dataset.cat) ? 'none' : '';
      }
      const box = $(root, '.items');
      if (!owned()) {
        box.innerHTML = `<div class="items-empty">${ICONS.lock}<span>Buy the <b>${car().name}</b> to customize it.</span></div>`;
        return;
      }
      const c = CATEGORIES.find((x) => x.key === cat);
      const eq = equippedCustom()[cat];
      const look = resolveCustom(previewing());
      box.innerHTML = c.items
        .map((it) => {
          const own = S.owns(cat, it.id);
          const isEq = eq === it.id;
          const sel = pending && pending.item.id === it.id && pending.cat === cat;
          const cls = ['item', own ? '' : 'locked', isEq ? 'equipped' : '', sel ? 'selected' : ''].join(' ');
          const tag = own ? (isEq ? '<span class="pr eq">EQUIPPED</span>' : '<span class="pr own">OWNED</span>') : `<span class="pr">${ICONS.lock}${formatNumber(it.price)}</span>`;
          return `<button class="${cls}" data-action="item" data-id="${it.id}">${isEq ? `<span class="tick">${ICONS.check}</span>` : ''}${swatchFor(cat, it, look)}<span class="nm">${it.name}</span>${tag}</button>`;
        })
        .join('');
    };

    const renderBuyBar = () => {
      const box = $(root, '.buy-box');
      const info = $(box, '.info');
      const btn = $(box, 'button');
      box.classList.toggle('active', !!pending);
      box.style.display = owned() ? '' : 'none';
      if (pending) {
        const short = pending.item.price - S.credits;
        info.innerHTML = `<b>${pending.item.name}</b><span class="price">${ICONS.coin}${formatNumber(pending.item.price)} CR</span>`;
        btn.style.display = '';
        btn.disabled = short > 0;
        btn.textContent = short > 0 ? `NEED ${formatNumber(short)}` : 'BUY & EQUIP';
      } else {
        info.innerHTML = '<span class="hint">Tap a style to try it on</span>';
        btn.style.display = 'none';
      }
    };

    const previewCustom = () => app.garage.setCustom(previewing());

    const showCar = () => {
      pending = null;
      app.garage.setCar(car().id, owned() ? equippedCustom() : undefined);
      renderCar();
      renderItems();
      renderBuyBar();
    };

    const scrollToSelected = () => {
      const t = $(root, '.item.selected, .item.equipped');
      if (t) t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };

    delegate(root, {
      back: () => {
        app.garage.setCar(S.data.car, S.customFor(S.data.car));
        if (back) back();
        else app.toMenu();
      },
      prevcar: () => {
        carIdx = (carIdx + CARS.length - 1) % CARS.length;
        showCar();
      },
      nextcar: () => {
        carIdx = (carIdx + 1) % CARS.length;
        showCar();
      },
      buycar: () => {
        if (S.buyCar(car())) {
          S.data.car = car().id;
          S.save();
          app.audio?.play('unlock');
          this.toast(`${car().name} UNLOCKED`);
          this.refreshCredits();
          showCar();
        } else app.audio?.play('error');
      },
      selectcar: () => {
        S.data.car = car().id;
        S.save();
        renderCar();
        this.toast(`${car().name} SELECTED`);
      },
      tab: (b) => {
        cat = b.dataset.cat;
        pending = null;
        previewCustom();
        renderItems();
        renderBuyBar();
        $(root, '.items').scrollLeft = 0;
        b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        scrollToSelected();
      },
      item: (b) => {
        if (!owned()) return;
        const item = findItem(cat, b.dataset.id);
        if (S.owns(cat, item.id)) {
          S.equip(car().id, cat, item.id);
          pending = null;
        } else pending = { cat, item };
        previewCustom();
        renderItems();
        renderBuyBar();
      },
      buy: () => {
        if (!pending) return;
        if (S.buyItem(pending.cat, pending.item)) {
          S.equip(car().id, pending.cat, pending.item.id);
          app.audio?.play('buy');
          this.toast(`${pending.item.name} PURCHASED`);
          pending = null;
          this.refreshCredits();
          previewCustom();
          renderItems();
          renderBuyBar();
          renderCar();
        } else app.audio?.play('error');
      },
    });
    showCar();
    requestAnimationFrame(scrollToSelected);
    return {
      el: root,
      dispose: () => {
        if (pending) app.garage.setCustom(S.customFor(car().id));
      },
    };
  }

  // ---------------------------------------------------------------- settings
  /** Tabbed settings panel. `tabs` picks which sections are shown (the pause menu uses a subset). */
  settingsView(tabs = ['graphics', 'camera', 'audio', 'controls', 'profile']) {
    const app = this.app;
    const s = app.settings;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const range = (key, min, max, step, fmt = pct) =>
      `<input class="range" type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}" style="--val:${(((s[key] - min) / (max - min)) * 100).toFixed(1)}%" data-fmt="${fmt === pct ? 'pct' : 'x'}"><output>${fmt(s[key])}</output>`;
    const segS = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const sw = (key) => `<button class="switch" data-key="${key}" aria-pressed="${s[key] ? 'true' : 'false'}" aria-label="${key}"></button>`;
    const row = (label, hint, ctl) => `<div class="srow"><div class="lbl"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div><div class="ctl">${ctl}</div></div>`;
    const st = app.storage.data.stats;
    const SECTIONS = {
      graphics: {
        name: 'GRAPHICS',
        icon: 'display',
        html: () =>
          row('QUALITY', 'Auto picks a level that keeps your device smooth.', segS('quality', [['auto', 'AUTO'], ['low', 'LOW'], ['medium', 'MED'], ['high', 'HIGH']])) +
          row('SHOW FPS', 'Frame rate, render scale and draw calls in the HUD.', sw('showFps')),
      },
      camera: {
        name: 'CAMERA & FX',
        icon: 'camera',
        html: () =>
          row('CAMERA', 'Change it any time in a race with C or the camera button.', segS('camera', [['chase', 'CHASE'], ['near', 'NEAR'], ['bumper', 'BUMPER']])) +
          row('CAMERA SHAKE', '', range('shake', 0, 1.5, 0.05)) +
          row('MOTION BLUR', '', range('motionBlur', 0, 1.5, 0.05)) +
          row('LENS FRINGE', 'Colour fringing at the edges at high speed.', sw('chromatic')) +
          row('SPEED LINES', '', sw('speedLines')),
      },
      audio: {
        name: 'AUDIO',
        icon: 'audio',
        html: () => row('MASTER', '', range('master', 0, 1, 0.05)) + row('MUSIC', '', range('music', 0, 1, 0.05)) + row('EFFECTS', 'Engine, tyres, impacts and menus.', range('sfx', 0, 1, 0.05)),
      },
      controls: {
        name: 'CONTROLS',
        icon: 'gamepad',
        html: () =>
          row('KEY HINTS', 'Keyboard and controller prompts in races. Press H to show or hide the controls card.', sw('keyHints')) +
          row('TOUCH STEERING', 'Steering pads, or tilt your device to steer.', segS('controls', [['buttons', 'PADS'], ['tilt', 'TILT']])) +
          row('AUTO ACCELERATE', 'Touch: the throttle is held for you.', sw('autoAccel')) +
          row('TILT SENSITIVITY', '', range('tiltSensitivity', 0.5, 2, 0.05, (v) => `${Number(v).toFixed(2)}×`)) +
          row('HAPTICS', 'Vibrate on impacts and boosts.', sw('haptics')) +
          row('SPEED UNITS', '', segS('units', [['kmh', 'KM/H'], ['mph', 'MPH']])),
      },
      profile: {
        name: 'PROFILE',
        icon: 'profile',
        html: () => `
          <div class="career-grid">
            ${[
              ['RACES', formatNumber(st.races)],
              ['WINS', formatNumber(st.wins)],
              ['PODIUMS', formatNumber(st.podiums)],
              ['NEAR MISSES', formatNumber(st.nearMisses)],
              ['BEST DRIFT', formatNumber(st.bestDrift)],
              ['BEST COMBO', `x${st.bestCombo}`],
              ['DRIFT DISTANCE', `${(st.driftDistance / 1000).toFixed(1)} KM`],
              ['CREDITS EARNED', formatNumber(st.creditsEarned)],
            ]
              .map(([l, v]) => `<div class="kv"><span>${l}</span><b>${v}</b></div>`)
              .join('')}
          </div>
          ${row('RESET PROGRESS', 'Credits, cars, styles, records and ghosts. Settings are kept.', '<button class="btn ghost small" data-reset="1">RESET</button>')}
          <p class="about">Midnight Overdrive · procedural night city, synthesized audio. Built with three.js.</p>`,
      },
    };
    let tab = tabs[0];
    const view = el(`
      <div class="settings-body">
        <nav class="settings-nav anim-l" style="--d:60">${tabs
          .map((k) => `<button data-tab="${k}">${ICONS[SECTIONS[k].icon]}<span>${SECTIONS[k].name}</span></button>`)
          .join('')}</nav>
        <section class="settings-panel glass scroll anim-r" style="--d:120"></section>
      </div>`);
    const panel = $(view, '.settings-panel');
    const renderTab = () => {
      for (const b of $$(view, '.settings-nav button')) b.classList.toggle('on', b.dataset.tab === tab);
      panel.innerHTML = `<h3 class="panel-title">${SECTIONS[tab].name}</h3>${SECTIONS[tab].html()}`;
      panel.scrollTop = 0;
    };
    view.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (!t) return;
      tab = t.dataset.tab;
      renderTab();
    });
    renderTab();
    this.bindSettings(view);
    return view;
  }

  bindSettings(root) {
    const app = this.app;
    const s = app.settings;
    root.addEventListener('input', (e) => {
      const r = e.target.closest('input.range');
      if (!r) return;
      const k = r.dataset.key;
      const v = Number(r.value);
      s[k] = v;
      r.style.setProperty('--val', `${(((v - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100).toFixed(1)}%`);
      const out = r.nextElementSibling;
      if (out) out.textContent = r.dataset.fmt === 'pct' ? `${Math.round(v * 100)}%` : `${v.toFixed(2)}×`;
      app.applySettings(k);
    });
    root.addEventListener('click', (e) => {
      const sw = e.target.closest('.switch[data-key]');
      if (sw) {
        const k = sw.dataset.key;
        s[k] = typeof s[k] === 'number' ? (s[k] ? 0 : 1) : !s[k];
        sw.setAttribute('aria-pressed', s[k] ? 'true' : 'false');
        app.applySettings(k);
        return;
      }
      const b = e.target.closest('.seg[data-key] button');
      if (b) {
        const segEl = b.closest('.seg');
        const k = segEl.dataset.key;
        let v = b.dataset.v;
        if (v === 'true') v = true;
        else if (v === 'false') v = false;
        s[k] = v;
        for (const x of $$(segEl, 'button')) x.classList.toggle('on', x === b);
        // iOS only grants motion sensors from inside a tap, so ask right here.
        if (k === 'controls' && v === 'tilt') {
          app.input.enableTilt().then((ok) => {
            if (!ok) {
              this.toast('Motion sensors unavailable - using touch pads');
              s.controls = 'buttons';
              for (const x of $$(segEl, 'button')) x.classList.toggle('on', x.dataset.v === 'buttons');
              app.applySettings('controls');
            }
          });
        }
        app.applySettings(k);
        return;
      }
      const r = e.target.closest('[data-reset]');
      if (r) {
        if (r.dataset.confirm) {
          app.storage.reset();
          app.garage.setCar(app.storage.data.car, app.storage.customFor(app.storage.data.car));
          this.refreshCredits();
          this.toast('PROGRESS RESET');
          r.textContent = 'RESET';
          r.classList.remove('danger');
          delete r.dataset.confirm;
        } else {
          r.dataset.confirm = '1';
          r.classList.add('danger');
          r.textContent = 'TAP AGAIN TO CONFIRM';
        }
      }
    });
  }

  _screen_settings() {
    const app = this.app;
    const root = el(`<div class="screen settings-screen">${this._head('OPTIONS', 'SETTINGS')}</div>`);
    root.appendChild(this.settingsView());
    delegate(root, { back: () => app.toMenu() });
    return { el: root };
  }

  // ---------------------------------------------------------------- daily
  _screen_daily() {
    const app = this.app;
    const d = getDaily();
    const ds = app.storage.data.daily;
    const today = ds.date === d.key;
    const done = today && ds.completed;
    const v = d.variant;
    const chips = [
      `${ICONS.laps}${d.laps} LAPS`,
      v.reverse ? `${ICONS.reverse}REVERSE` : `${ICONS.forward}FORWARD`,
      v.mirror ? `${ICONS.mirror}MIRROR` : null,
      v.weather === 'rain' ? `${ICONS.rain}RAIN` : `${ICONS.moon}CLEAR`,
    ].filter(Boolean);
    const date = new Date(`${d.key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
    const root = el(`
      <div class="screen daily-screen">
        ${this._head(date, 'DAILY CHALLENGE', this.creditsHtml())}
        <div class="daily-body">
          <section class="daily-card glass anim-r" style="--d:100">
            <div class="daily-map"><canvas width="300" height="300"></canvas></div>
            <div class="daily-info">
              <div class="eyebrow accent">${d.trackName}</div>
              <div class="obj-label">${ICONS.target}OBJECTIVE</div>
              <h2 class="obj">${d.objective.label}</h2>
              <p class="obj-detail">${d.objective.detail}</p>
              <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
              <div class="daily-meta">
                <div class="kv"><span>CAR PROVIDED</span><b>${d.carName}</b></div>
                <div class="kv"><span>REWARD</span><b class="gold">${ICONS.coin}${formatNumber(d.reward)}</b></div>
                <div class="kv"><span>STREAK</span><b class="${ds.streak ? 'amber' : ''}">${ICONS.flame}${ds.streak || 0}</b></div>
              </div>
            </div>
            ${done ? `<div class="done-stamp">${ICONS.check}COMPLETED</div>` : ''}
          </section>
        </div>
        <footer class="daily-footer anim-up" style="--d:200">
          <div class="daily-countdown">NEW CHALLENGE IN <b data-countdown></b></div>
          <button class="btn primary big" data-action="start">${done ? 'PLAY AGAIN' : 'ACCEPT'}${ICONS.chevron}</button>
        </footer>
      </div>`);
    drawTrackPreview($(root, '.daily-map canvas'), previewTrack(d.trackId, v), { width: 1.25 });
    const cd = $(root, '[data-countdown]');
    const tick = () => {
      const ms = msUntilTomorrow();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      cd.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };
    tick();
    const timer = setInterval(tick, 1000);
    delegate(root, {
      back: () => app.toMenu(),
      start: () => app.startDaily(d),
    });
    return { el: root, dispose: () => clearInterval(timer) };
  }

  // ---------------------------------------------------------------- pause
  showPause() {
    this.hidePause();
    const app = this.app;
    const race = app.race;
    const h = race?.hud || {};
    const pad = app.input.device === 'gamepad';
    const kb = pad || !app.input.isTouchDevice();
    const tt = h.mode === 'timetrial';
    const pm = (i, action, icon, label, sfx = '') => `
      <button class="menu-item compact" data-action="${action}" style="--i:${i}" ${sfx ? `data-sfx="${sfx}"` : ''}>
        <span class="mi-icon">${ICONS[icon]}</span>
        <span class="mi-text"><span class="mi-title">${label}</span></span>
        <span class="mi-go">${ICONS.chevron}</span>
      </button>`;
    const o = el(`
      <div class="overlay pause-overlay">
        <div class="pause-side">
          <div class="eyebrow accent anim-l">${MODE_LABEL[race?.cfg.mode] || 'RACE'} · ${race?.world?.def.name || ''}</div>
          <h2 class="pause-title anim-l" style="--d:40">PAUSED</h2>
          <div class="pause-stats anim-l" style="--d:80">
            ${tt ? '' : `<div class="kv"><span>POSITION</span><b>${h.place || '-'}<small>/${h.total || '-'}</small></b></div>`}
            <div class="kv"><span>LAP</span><b>${h.lap || 1}<small>/${h.laps || 1}</small></b></div>
            <div class="kv"><span>TIME</span><b>${formatTime(h.time || 0)}</b></div>
          </div>
          <nav class="pause-menu">
            ${pm(0, 'resume', 'play', 'RESUME')}
            ${pm(1, 'restart', 'restart', 'RESTART')}
            ${pm(2, 'settings', 'settings', 'SETTINGS')}
            ${pm(3, 'quit', 'exit', 'QUIT TO MENU', 'ui-back')}
          </nav>
        </div>
        ${
          kb
            ? `<div class="keys glass anim-r" style="--d:140">
                <div class="eyebrow">${pad ? 'CONTROLLER' : 'KEYBOARD'}</div>
                <div class="ctl-grid">${controlsCells(pad ? 'gamepad' : 'keyboard')}</div>
                ${pad ? '' : '<div class="kl-note">Arrow keys work too · H shows the controls in a race</div>'}
              </div>`
            : ''
        }
      </div>`);
    delegate(o, {
      resume: () => app.resume(),
      restart: () => app.restart(),
      quit: () => app.quitRace(),
      settings: () => this.showPauseSettings(),
    });
    this.overlay = o;
    this.overlayLayer.appendChild(o);
    if (kb) requestAnimationFrame(() => this._setNavFocus($(o, '.menu-item')));
  }

  showPauseSettings() {
    this.hidePause();
    const app = this.app;
    const o = el(`
      <div class="overlay pause-overlay settings-overlay">
        <header class="topbar anim-down">
          <button class="icon-btn" data-action="back" data-sfx="ui-back" aria-label="Back">${ICONS.back}</button>
          <div class="title-block"><div class="eyebrow">PAUSED</div><h1>SETTINGS</h1></div>
        </header>
      </div>`);
    o.appendChild(this.settingsView(['camera', 'audio', 'controls']));
    delegate(o, { back: () => this.showPause() });
    this.overlay = o;
    this.overlayLayer.appendChild(o);
  }

  hidePause() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  // ---------------------------------------------------------------- results
  showResults(res, reward) {
    this.hidePause();
    this.hudLayer.classList.add('faded');
    const app = this.app;
    const isTT = res.mode === 'timetrial';
    const tags = [];
    if (reward.newRecord) tags.push(`<span class="chip c-gold">${ICONS.trophy}NEW RECORD</span>`);
    if (reward.newLap) tags.push(`<span class="chip c-ice">${ICONS.stopwatch}BEST LAP</span>`);
    if (reward.daily === true) tags.push(`<span class="chip c-good">${ICONS.check}DAILY COMPLETE</span>`);
    if (reward.daily === false) tags.push(`<span class="chip c-bad">DAILY FAILED · ${reward.dailyProgress}</span>`);
    const leader = res.rows[0]?.time || 0;
    const hero = isTT
      ? `<div class="res-time anim-pop">${formatTime(res.time)}</div>`
      : `<div class="res-place anim-pop p${res.place}"><span class="n">${res.place}</span><span class="suf">${SUFFIX(res.place)}</span><span class="of">/ ${res.total}</span></div>`;
    const rows = isTT
      ? res.lapTimes
          .map((t, i) => {
            const best = t === res.bestLap;
            return `<div class="st-row ${best ? 'me' : ''}" style="--i:${i}"><span class="pos">${i + 1}</span><i class="stripe" style="--c:${best ? 'var(--ice)' : 'rgba(255,255,255,.25)'}"></i><span class="nm"><b>LAP ${i + 1}</b>${best ? '<small>FASTEST</small>' : ''}</span><span class="tm">${formatTime(t)}</span></div>`;
          })
          .join('')
      : res.rows
          .map((r, i) => {
            const gap = i === 0 ? formatTime(r.time) : `+${Math.max(0, r.time - leader).toFixed(2)}`;
            return `<div class="st-row ${r.isPlayer ? 'me' : ''}" style="--i:${i}"><span class="pos">${r.place}</span><i class="stripe" style="--c:${r.color}"></i><span class="nm"><b>${r.name}</b><small>${r.car}</small></span><span class="tm">${r.estimated ? '~' : ''}${gap}</span></div>`;
          })
          .join('');
    const stats = [
      ['STYLE', formatNumber(res.style)],
      ['NEAR MISSES', res.counts.nearMiss || 0],
      ['BEST DRIFT', formatNumber(res.best.drift || 0)],
      ['TOP COMBO', `x${res.best.combo || 1}`],
      ['OVERTAKES', res.counts.overtake || 0],
    ];
    const o = el(`
      <div class="overlay results-overlay">
        <div class="results scroll">
          <section class="res-hero">
            <div class="eyebrow accent anim-l">${res.trackName} · ${MODE_LABEL[res.mode] || 'RACE'}</div>
            ${hero}
            <div class="res-times anim-l" style="--d:220">
              ${isTT ? '' : `<div class="kv"><span>TOTAL TIME</span><b>${formatTime(res.time)}</b></div>`}
              <div class="kv"><span>BEST LAP</span><b>${formatTime(res.bestLap)}</b></div>
            </div>
            ${tags.length ? `<div class="res-tags anim-l" style="--d:280">${tags.join('')}</div>` : ''}
            <div class="res-stats">${stats.map(([l, v], i) => `<div class="res-stat anim-up" style="--d:${320 + i * 50}"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
          </section>
          <section class="res-side glass anim-r" style="--d:160">
            <h3 class="panel-title">${isTT ? 'LAP TIMES' : 'STANDINGS'}</h3>
            <div class="standings">${rows}</div>
            <div class="rewards">
              ${reward.lines.map(([l, v]) => `<div class="rw"><span>${l}</span><b>+${formatNumber(v)}</b></div>`).join('')}
              <div class="rw-total"><span>EARNED</span><b>${ICONS.coin}<span data-earned>0</span><small>CR</small></b></div>
            </div>
            <div class="res-actions">
              <button class="btn ghost" data-action="menu" data-sfx="ui-back">MENU</button>
              <button class="btn ghost" data-action="garage">GARAGE</button>
              <button class="btn primary" data-action="retry">${ICONS.restart}RETRY</button>
            </div>
          </section>
        </div>
      </div>`);
    delegate(o, {
      menu: () => app.quitRace(),
      garage: () => app.quitRace('garage'),
      retry: () => app.restart(),
    });
    this.overlay = o;
    this.overlayLayer.appendChild(o);
    if (!app.input.isTouchDevice()) setTimeout(() => o.isConnected && this._setNavFocus($(o, '[data-action="retry"]')), 900);
    // count-up
    const span = $(o, '[data-earned]');
    const total = reward.total;
    const t0 = performance.now() + 700;
    const step = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - t0) / 1400));
      span.textContent = formatNumber(total * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && span.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- HUD mounting
  mountHud(hud, touch) {
    this.hudLayer.innerHTML = '';
    this.hudLayer.classList.remove('faded');
    hud.mount(this.hudLayer);
    hud.root.classList.toggle('has-touch', !!touch);
    if (touch) touch.mount(this.hudLayer);
  }

  clearHud() {
    this.hudLayer.innerHTML = '';
    this.hudLayer.classList.remove('faded');
  }
}

export { PAINTS };
