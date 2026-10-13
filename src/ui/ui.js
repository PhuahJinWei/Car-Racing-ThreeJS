import { el, $, $$, delegate, edgeFade, fitText, ICONS } from './dom.js';
import { TRACKS, getTrackDef, BOOST_PADS_ON } from '../world/tracks.js';
import { Track } from '../world/track.js';
import { CARS, getCarDef } from '../car/car-defs.js';
import { CATEGORIES, findItem, PAINTS, resolveCustom, itemFits, DEFAULT_CUSTOM, DEFAULT_CUSTOM_BY_CAR } from '../car/customization.js';
import { getDaily, msUntilTomorrow } from '../game/daily.js';
import { devMode, setDevMode, devCredits, devUnlockAll, devResetDaily, DEV_TAPS } from '../core/dev.js';
import { hasOwnWheels } from '../car/car-assets.js';
import { formatTime, formatNumber, clamp } from '../core/math.js';
import { DIFFICULTY } from '../game/ai.js';
import { controlsCells } from './controls-help.js';
import { t, locale, LANGUAGES, carClass, carBlurb, trackTagline, itemName } from '../core/i18n.js';
import districtShot from '../assets/tracks/district.jpg';
import lumenShot from '../assets/tracks/lumen.jpg';
import circuitShot from '../assets/tracks/circuit.jpg';
import ringShot from '../assets/tracks/ring.jpg';
import heightsShot from '../assets/tracks/heights.jpg';
import parkShot from '../assets/tracks/park.jpg';

const themeLabel = (def) => t(`theme.${def.theme}`);
const modeLabel = (mode) => t(`mode.${mode === 'timetrial' || mode === 'daily' ? mode : 'race'}`);
const diffLabel = (key) => t(`diff.${DIFFICULTY[key] ? key : 'easy'}`);
const km = (meters) => t('km', { n: (meters / 1000).toFixed(1) });
// difficulty pips (1-3), kept apart from the Rivals words so the two don't read as one setting
const levelPips = (def) => {
  const n = clamp(def.difficulty || 1, 1, 3);
  const label = t('track.level', { level: t(`level.${n}`) });
  return `<span class="tc-level" role="img" aria-label="${label}" title="${label}">${[1, 2, 3].map((k) => `<i${k <= n ? ' class="on"' : ''}></i>`).join('')}</span>`;
};
// loading-screen tips (tip.1 ... tip.8 in the interface text); tip.6 is about boost pads
const TIPS = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => n !== 6 || BOOST_PADS_ON);
// menu navigation actions, checked every frame
const NAV_ACTIONS = ['ui-up', 'ui-down', 'ui-left', 'ui-right', 'ui-ok', 'ui-back'];

// In-game shots for the track cards; focus is the crop point when a card's shape differs from the 16:9 shot.
const TRACK_SHOTS = {
  district: { src: districtShot, focus: '74% 55%' },
  lumen: { src: lumenShot, focus: '52% 55%' },
  circuit: { src: circuitShot, focus: '70% 55%' },
  ring: { src: ringShot, focus: '42% 55%' },
  heights: { src: heightsShot, focus: '46% 55%' },
  park: { src: parkShot, focus: '48% 55%' },
};
// Event setup order (TRACKS keeps its own order: the daily challenge picks from it by index)
const SETUP_ORDER = ['district', 'lumen', 'circuit', 'ring', 'heights', 'park'];
const SETUP_TRACKS = [...TRACKS].sort((a, b) => (SETUP_ORDER.indexOf(a.id) + 1 || 99) - (SETUP_ORDER.indexOf(b.id) + 1 || 99));

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
    [t('stat.speed'), c.display.speed],
    [t('stat.accel'), c.display.accel],
    [t('stat.handling'), c.display.handling],
    [t('stat.nitro'), c.display.nitro],
  ];
}

// ---------------------------------------------------------------- customization swatches
const RIM_SPOKES = {
  split: () => [0, 1, 2, 3, 4].map((i) => `<g transform="rotate(${i * 72} 12 12)"><path d="M11.2 10L10.6 4.6M12.8 10l.6-5.4"/></g>`).join(''),
  turbine: () => Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30} 12 12)" d="M12 9.6c1.4-1.2 1.9-2.7 1.6-4.8"/>`).join(''),
  mesh: () => [0, 1, 2, 3, 4, 5].map((i) => `<path transform="rotate(${i * 30} 12 12)" d="M5 12h14"/>`).join(''),
  blade: () => [0, 1, 2, 3, 4].map((i) => `<path transform="rotate(${i * 72} 12 12)" d="M12 9.5C11 7.6 11.3 6 12.6 4.4"/>`).join(''),
  classic: () => Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45} 12 12)" d="M12 10V4.2"/>`).join(''),
};

// the garage camera's shot for each customization tab (see SHOTS in scenes/garage.js)
const SHOT_FOR = { number: 'door', tint: 'glass', rims: 'wheel', rimColor: 'wheel', underglow: 'low', trail: 'rear' };

// the garage dock's groups of customization tabs
const GROUPS = [
  { key: 'cars', icon: 'car', cats: ['cars'] },
  { key: 'body', icon: 'spray', cats: ['paint', 'finish', 'livery', 'accent', 'number'] },
  { key: 'glass', icon: 'glass', cats: ['tint'] },
  { key: 'wheels', icon: 'wheel', cats: ['rims', 'rimColor'] },
  { key: 'lights', icon: 'lamp', cats: ['underglow', 'trail'] },
];
const groupOf = (cat) => GROUPS.find((g) => g.cats.includes(cat));

const LIVERY_ART = {
  lv_none: () => '',
  lv_stripes: (a) => `<rect x="9.6" y="2" width="1.8" height="20" fill="${a}"/><rect x="12.6" y="2" width="1.8" height="20" fill="${a}"/>`,
  lv_race: (a) => `<circle cx="12" cy="12" r="5.2" fill="${a}"/><text x="12" y="14.4" text-anchor="middle" font-size="6.6" font-weight="700" font-family="Rajdhani, sans-serif" fill="#111">77</text>`,
  lv_bolt: (a) => `<path d="M13.6 3.5L7.6 13h4.2l-1.4 7.5 6-9.6h-4.2z" fill="${a}"/>`,
  lv_split: (a) => `<path d="M2 14L22 7V22H2z" fill="${a}"/>`,
  lv_circuit: (a) => `<path d="M3 8h6l3 3h4l2-2h3M3 15h4l2 2h5l3-3h4M12 11v6" stroke="${a}" stroke-width="1.3" fill="none"/><circle cx="18" cy="9" r="1.1" fill="${a}"/><circle cx="9" cy="17" r="1.1" fill="${a}"/>`,
  lv_panda: (a) => `<rect x="0" y="13.5" width="24" height="10.5" fill="${a}"/>`,
  lv_police: (a) => `<rect x="0" y="10" width="24" height="8" fill="${a}"/><rect x="6.5" y="5" width="5.5" height="2.6" rx="1" fill="#ff2a3a"/><rect x="12" y="5" width="5.5" height="2.6" rx="1" fill="#2a6bff"/>`,
  lv_flames: (a) => `<path d="M0.4 18.7L3.2 18.7L3.2 6.3L0.4 6.3zM1.5 19.1C6.2 19.9 9.9 17.3 12 15.9C9.1 16.5 5.7 17.8 1.5 15.5zM1.5 16.7C9.4 17.5 15.6 14.4 19.1 13C14.2 13.6 8.6 15.4 1.5 13.1zM1.5 14.3C11 15.1 18.3 12 22.5 10.6C16.6 11.2 9.9 13 1.5 10.7zM1.5 11.9C8.1 12.7 13.3 9.9 16.2 8.4C12.1 9 7.4 10.6 1.5 8.3zM1.5 9.7C5.3 10.6 8.2 8.4 9.9 7C7.5 7.6 4.9 8.4 1.5 6.1z" fill="${a}"/>`,
  lv_taxi: (a) => Array.from({ length: 12 }, (_, i) => `<rect x="${i * 2}" y="${i % 2 ? 13 : 11}" width="2" height="2" fill="${a}"/>`).join(''),
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
  if (cat === 'number') {
    if (item.value == null) return '<span class="sw none"></span>';
    const n = String(item.value);
    return `<span class="sw art" style="--c:#f2f4f8;box-shadow:inset 0 0 0 2px ${custom.accent.color},0 3px 8px rgba(0,0,0,0.5)"><svg viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="16.2" text-anchor="middle" font-size="${n.length > 1 ? 10.5 : 12.5}" font-weight="700" font-family="Rajdhani, sans-serif" fill="#111">${n}</text></svg></span>`;
  }
  if (cat === 'tint') {
    // a lit cabin seen through the film (mirror films: their coloured sheen)
    if (item.mirror) return `<span class="sw" style="background:linear-gradient(135deg, color-mix(in srgb, ${item.color} 70%, #fff) 0%, ${item.color} 38%, color-mix(in srgb, ${item.color} 30%, #000) 100%)"></span>`;
    return `<span class="sw" style="background:linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 40%, transparent 60%), linear-gradient(rgba(5,6,8,${item.shade}), rgba(5,6,8,${item.shade})), linear-gradient(180deg, #9aa3b3 0%, #4a505b 55%, #2a2e35 100%)"></span>`;
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
    this.rotateHint = el('<div class="rotate-hint"></div>');
    this._fillRotateHint();
    this.root.append(this.screenLayer, this.hudLayer, this.overlayLayer, this.toasts, this.rotateHint);
    this.screen = null;
    this.overlay = null;
    this.portraitOk = false;
    this.rotateHint.addEventListener('click', (e) => {
      if (!e.target.closest('button')) return;
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
      const start = els.includes(cur) ? cur : els.find((e) => 'navFirst' in e.dataset) || els.find((e) => e.classList.contains('menu-item')) || els.find((e) => e.classList.contains('primary')) || els[0];
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
    // runs every frame: which of the nav actions fired, as bits (no list to allocate)
    let fired = 0;
    for (let i = 0; i < NAV_ACTIONS.length; i++) if (input.consume(NAV_ACTIONS[i])) fired |= 1 << i;
    if (!fired || !this._navAllowed() || this.loading) return;
    for (let i = 0; i < NAV_ACTIONS.length; i++) {
      if (!(fired & (1 << i))) continue;
      const a = NAV_ACTIONS[i];
      if (a === 'ui-ok') this.navOk();
      else if (a === 'ui-back') this.navBack();
      else this.navigate(a.slice(3));
    }
  }

  /** Low quality: no backdrop blur (it re-blurs the live 3D view every frame). */
  setLite(on) {
    this.root.classList.toggle('lite', !!on);
  }

  _fillRotateHint() {
    this.rotateHint.innerHTML = `
      <div class="rh-icon">${ICONS.rotate}</div>
      <div class="rh-title">${t('rotate.title')}</div>
      <div class="rh-sub">${t('rotate.sub')}</div>
      <button class="btn ghost small" data-action="playanyway">${t('rotate.anyway')}</button>`;
  }

  /** The language changed (in settings): redraw the text on show in the new one. */
  onLanguage() {
    this._fillRotateHint();
    if (this.screen?.name === 'settings') this.show('settings', { tab: 'language' });
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
    const n = el(`<div class="toast">${msg}</div>`);
    this.toasts.appendChild(n);
    setTimeout(() => n.remove(), 2700);
  }

  tip(msg) {
    const n = el(`<div class="tip"><span class="tag">${t('tip')}</span><span>${msg}</span></div>`);
    this.hudLayer.appendChild(n);
    setTimeout(() => n.remove(), 5100);
  }

  creditsHtml() {
    return `<div class="credits" title="${t('credits')}">${ICONS.coin}<b>${formatNumber(this.app.storage.credits)}</b><small>CR</small></div>`;
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
        <button class="icon-btn" data-action="back" data-sfx="ui-back" aria-label="${t('back')}">${ICONS.back}</button>
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
        `${ICONS.laps}${t('laps', { n: laps })}`,
        v.reverse ? `${ICONS.reverse}${t('reverse')}` : null,
        v.mirror ? `${ICONS.mirror}${t('mirror')}` : null,
        v.weather === 'rain' ? `${ICONS.rain}${t('weather.rain')}` : `${ICONS.moon}${t('weather.clear')}`,
      ].filter(Boolean);
      const tip = t(`tip.${TIPS[Math.floor(Math.random() * TIPS.length)]}`);
      body = `
        <div class="race-load">
          <canvas class="rl-map" width="320" height="320"></canvas>
          <div class="rl-info">
            <div class="eyebrow accent">${modeLabel(info.mode)} · ${themeLabel(def)} · ${km(tr.length)}</div>
            <h2>${def.name}</h2>
            <p>${trackTagline(def)}</p>
            <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
          </div>
        </div>
        <div class="load-foot">
          <div class="load-bar"><i></i></div>
          <div class="load-text">${text}</div>
          <div class="load-tip"><span class="tag">${t('tip')}</span><span>${tip}</span></div>
        </div>`;
    } else {
      body = `${LOGO('load')}<div class="load-bar"><i></i></div><div class="load-text">${text}</div>`;
    }
    this.loading = el(`<div class="loading-screen ${tr ? 'race' : ''}">${body}</div>`);
    if (tr) drawTrackPreview($(this.loading, '.rl-map'), tr, { width: 1.2 });
    this.overlayLayer.appendChild(this.loading);
  }

  /** Turn the loading bar's sweep into real progress, 0..1 (it only moves forward). */
  setLoadProgress(p) {
    const bar = this.loading && $(this.loading, '.load-bar');
    if (!bar) return;
    bar.classList.add('det');
    const v = Math.max(Number(bar.style.getPropertyValue('--p')) || 0, Math.min(1, p));
    bar.style.setProperty('--p', v.toFixed(3));
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
          <div class="title-tag">${t('title.tag')}</div>
        </div>
        <div class="press-start"><i></i><span>${t(touch ? 'title.tap' : 'title.press')}</span><i></i></div>
        <div class="title-footer">${t(touch ? 'title.landscape' : 'title.inputs')}<span class="dot"></span>${t('title.headphones')}</div>
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
    const ds = S.data.daily;
    const dailyDone = ds.date === daily.key && ds.completed;
    const st = S.data.stats;
    const item = (i, action, icon, title, sub, badge = '', extra = '') => `
      <button class="menu-item" data-action="${action}" style="--i:${i}">
        <span class="mi-icon">${ICONS[icon]}</span>
        <span class="mi-text"><span class="mi-title">${title}${badge}</span><span class="mi-sub">${sub}</span></span>
        ${extra || `<span class="mi-go">${ICONS.chevron}</span>`}
      </button>`;
    // one click back into the last event you set up
    const ls = S.data.lastSetup;
    const qTrack = SETUP_TRACKS.find((d) => d.id === ls.trackId) || SETUP_TRACKS[0];
    const shot = TRACK_SHOTS[qTrack.id];
    const weather = t(ls.weather === 'clear' || ls.weather === 'rain' ? `weather.${ls.weather}` : 'weather.autoLong');
    const quick = `
      <button class="quick-race" data-action="quick" data-nav-first>
        ${shot ? `<img class="qr-shot" src="${shot.src}" alt="" draggable="false" style="object-position:${shot.focus}">` : ''}
        <span class="qr-text">
          <span class="qr-eyebrow">${t('menu.quick')}</span>
          <span class="qr-name">${qTrack.name}</span>
          <span class="qr-meta">${t('menu.quickMeta', { laps: t('laps', { n: ls.laps }), rivals: diffLabel(ls.difficulty), weather })}</span>
        </span>
        <span class="qr-go">${ICONS.play}</span>
      </button>`;
    const dailyReward = `<span class="mi-reward">${dailyDone ? '' : `<b>${ICONS.coin}${formatNumber(daily.reward)}</b>`}${ds.streak ? `<em>${ICONS.flame}${ds.streak}</em>` : ''}</span>`;
    // what to save up for next (or the career so far once every car is yours)
    const next = CARS.filter((c) => !S.ownsCar(c.id)).sort((a, b) => a.price - b.price)[0];
    const progress = next
      ? `<div class="next-car anim-up" style="--d:420">
          <span class="nc-label">${t('menu.nextCar')}</span>
          <span class="nc-name">${next.name}</span>
          <span class="nc-bar"><i style="--p:${clamp(S.credits / next.price, 0, 1)}"></i></span>
          <span class="nc-sub ${S.credits >= next.price ? 'ready' : ''}">${S.credits >= next.price ? t('menu.readyToBuy') : t('menu.crToGo', { n: formatNumber(next.price - S.credits) })}</span>
        </div>`
      : `<div class="career anim-up" style="--d:480">
          <div><b>${st.races}</b><span>${t('career.races')}</span></div>
          <div><b>${st.wins}</b><span>${t('career.wins')}</span></div>
          <div><b>${st.podiums}</b><span>${t('career.podiums')}</span></div>
        </div>`;
    const root = el(`
      <div class="screen menu-screen">
        <header class="topbar anim-down">
          ${LOGO('sm')}
          <div class="spacer"></div>
          ${this.creditsHtml()}
          <button class="icon-btn" data-action="fullscreen" aria-label="${t('fullscreen')}">${ICONS.fullscreen}</button>
          <button class="icon-btn" data-action="settings" aria-label="${t('settings')}">${ICONS.settings}</button>
        </header>
        <main class="menu-main">
          <nav class="menu-list">
            ${quick}
            ${item(1, 'race', 'flag', t('menu.race'), t('menu.raceSub', { n: TRACKS.length }))}
            ${item(2, 'timetrial', 'stopwatch', t('menu.tt'), t('menu.ttSub'))}
            ${item(3, 'daily', 'calendar', t('menu.daily'), daily.objective.label, dailyDone ? `<span class="pill good">${ICONS.check}${t('menu.done')}</span>` : `<span class="pill">${t('menu.new')}</span>`, dailyReward)}
            ${item(4, 'garage', 'car', t('menu.garage'), t('menu.garageSub'))}
          </nav>
        </main>
        <footer class="menu-footer">
          ${progress}
          <div class="car-card anim-r" style="--d:300">
            <div class="eyebrow">${carClass(car)}</div>
            <div class="car-name">${car.name}</div>
            <div class="mini-stats">${statList(car)
              .map(([n, v]) => `<div class="mini-stat"><span>${n}</span><i style="--v:${v}"></i></div>`)
              .join('')}</div>
          </div>
        </footer>
      </div>`);
    delegate(root, {
      quick: () =>
        app.startRace({
          mode: 'race',
          trackId: qTrack.id,
          variant: { reverse: false, mirror: false, weather: ls.weather || 'auto' },
          laps: ls.laps,
          difficulty: ls.difficulty,
        }),
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
    if (!SETUP_TRACKS.some((d) => d.id === st.trackId)) st.trackId = SETUP_TRACKS[0].id;
    const isTT = mode === 'timetrial';
    const car = getCarDef(S.data.car);
    const root = el(`
      <div class="screen setup-screen">
        ${this._head(isTT ? t('setup.ttEyebrow') : t('setup.raceEyebrow', { n: 5 }), modeLabel(mode), this.creditsHtml())}
        <div class="setup-body">
          <div class="track-cards hscroll fade-x">
            ${SETUP_TRACKS.map((d, i) => {
              const shot = TRACK_SHOTS[d.id];
              return `
              <button class="track-card anim-up" style="--d:${80 + i * 70}" data-action="track" data-id="${d.id}">
                ${shot ? `<img class="tc-shot" src="${shot.src}" alt="" draggable="false" style="object-position:${shot.focus}">` : ''}
                <span class="tc-check">${ICONS.check}</span>
                <canvas class="tc-map" width="120" height="120"></canvas>
                <span class="tc-text">
                  <span class="tc-meta"><span class="tc-about"></span>${levelPips(d)}</span>
                  <span class="tc-name">${d.name}</span>
                  <span class="tc-best"></span>
                </span>
              </button>`;
            }).join('')}
          </div>
          <section class="setup-opts glass anim-up" style="--d:290">
            <div class="opt"><label>${t('setup.conditions')}</label>${seg('weather', [['auto', `${ICONS.shuffle}${t('weather.auto')}`], ['clear', `${ICONS.moon}${t('weather.clear')}`], ['rain', `${ICONS.rain}${t('weather.rain')}`]], st.weather)}</div>
            <div class="opt"><label>${t('setup.laps')}</label>${seg('laps', [[1, '1'], [2, '2'], [3, '3'], [5, '5']], st.laps)}</div>
            ${isTT ? '' : `<div class="opt"><label>${t('setup.rivals')}</label>${seg('difficulty', ['rookie', 'easy', 'normal', 'hard'].map((d) => [d, diffLabel(d)]), st.difficulty)}</div>`}
          </section>
        </div>
        <footer class="setup-footer anim-up" style="--d:220">
          <button class="car-chip" data-action="garage">${ICONS.car}<span><small>${t('setup.yourCar')}</small><b>${car.name}</b></span><em>${t('setup.change')}</em></button>
          <button class="btn primary big" data-action="start">${t('setup.start')}${ICONS.chevron}</button>
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
      $(card, '.tc-about').textContent = `${themeLabel(def)} · ${km(tr.length)}`;
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
        $(card, '.tc-best').innerHTML = `${isFinite(best) ? t('setup.best', { time: formatTime(best) }) : t('setup.noTime')}${ghost ? `<i class="tc-ghost">${t('setup.ghost')}</i>` : ''}`;
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
      track: (b) => {
        st.trackId = b.dataset.id;
        if (!st.lapsTouched) st.laps = getTrackDef(st.trackId).laps;
        refresh();
        b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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
        app.openGarage({ back: () => app.openSetup(mode), tab: 'cars' });
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
    // past three tracks the row scrolls sideways: open on the chosen card, fade the ends with more
    const row = $(root, '.track-cards');
    const fade = edgeFade(row);
    window.addEventListener('resize', fade);
    requestAnimationFrame(() => {
      $(row, '.track-card.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      fade();
    });
    return { el: root, dispose: () => window.removeEventListener('resize', fade) };
  }

  // ---------------------------------------------------------------- garage
  _screen_garage({ back, tab } = {}) {
    const app = this.app;
    const S = app.storage;
    let carIdx = Math.max(0, CARS.findIndex((c) => c.id === S.data.car));
    let cat = tab || 'paint'; // 'cars', or a customization tab
    let armed = false; // the buy button asked to confirm
    let armTimer = 0;
    const lastCat = {}; // the tab last open in each group
    let pending = null; // { cat, item } preview awaiting purchase
    const root = el(`
      <div class="screen garage-screen">
        ${this._head(t('garage.eyebrow'), t('garage.title'), this.creditsHtml())}
        <div class="garage-body">
          <section class="car-info glass anim-l" style="--d:80">
            <div class="ci-top"><span class="eyebrow accent ci-cls"></span><span class="ci-count"></span></div>
            <div class="ci-name-row">
              <h2 class="car-name"></h2>
              <div class="ci-arrows">
                <button class="icon-btn sm" data-action="prevcar" aria-label="${t('garage.prevCar')}">${ICONS.left}</button>
                <button class="icon-btn sm" data-action="nextcar" aria-label="${t('garage.nextCar')}">${ICONS.right}</button>
              </div>
            </div>
            <div class="ci-loading"><span>${t('loading')}</span><b class="load-bar"><i></i></b></div>
            <p class="blurb"></p>
            <div class="stats"></div>
            <div class="car-action"></div>
          </section>
        </div>
        <section class="dock glass anim-up" style="--d:160">
          <div class="dock-head">
            <div class="dock-groups">${GROUPS.map((g) => `<button data-action="group" data-group="${g.key}">${ICONS[g.icon]}<span>${t(`garage.group.${g.key}`)}</span></button>`).join('')}</div>
            <div class="dock-subs hscroll fade-x"></div>
            <button class="icon-btn sm reset-look" data-action="resetlook" aria-label="${t('garage.reset')}" title="${t('garage.reset')}">${ICONS.restart}</button>
          </div>
          <div class="dock-row">
            <div class="items hscroll fade-x"></div>
            <div class="sel-panel"></div>
          </div>
        </section>
      </div>`);
    const car = () => CARS[carIdx];
    const owned = () => S.ownsCar(car().id);
    const equippedCustom = () => S.customFor(car().id);
    const previewing = () => {
      // (a car you don't own shows in its own colours: customFor gives its stock look)
      const base = { ...equippedCustom() };
      if (pending) base[pending.cat] = pending.item.id;
      return base;
    };

    // long names (SPECTER LMP, Magenta Streak...) step down in size to fit: measured once on
    // show after every redraw, and again when the window changes size
    let fitFrame = 0;
    const fades = [];
    const fitNames = () => {
      fitFrame = 0;
      fitText($(root, '.ci-name-row .car-name'));
      for (const n of $$(root, '.items .nm')) fitText(n, 0.8);
      for (const f of fades) f();
    };
    const fitSoon = () => {
      if (!fitFrame) fitFrame = requestAnimationFrame(fitNames);
    };
    window.addEventListener('resize', fitSoon);
    document.fonts?.ready.then(fitSoon);

    const renderCar = () => {
      const c = car();
      $(root, '.car-name').textContent = c.name;
      $(root, '.ci-cls').textContent = carClass(c);
      $(root, '.ci-count').textContent = `${carIdx + 1} / ${CARS.length}`;
      $(root, '.blurb').textContent = carBlurb(c);
      // a car that isn't yours marks your car's stats on its bars
      const mine = getCarDef(S.data.car);
      const cmp = mine.id !== c.id ? statList(mine) : null;
      $(root, '.stats').innerHTML =
        statList(c)
          .map(([n, v], i) => {
            const m = cmp?.[i][1];
            const d = cmp ? Math.round(v * 100) - Math.round(m * 100) : 0;
            return `<div class="stat ${d > 0 ? 'up' : d < 0 ? 'down' : ''}"><span>${n}</span><span class="bar"><i style="--v:${v}"></i>${cmp ? `<u style="--m:${m}"></u>` : ''}</span><b>${Math.round(v * 100)}</b></div>`;
          })
          .join('') + (cmp ? `<div class="stat-key"><u></u>${t('garage.vsYours', { car: mine.name })}</div>` : '');
      const act = $(root, '.car-action');
      if (!owned()) {
        const short = c.price - S.credits;
        const n = formatNumber(c.price);
        if (short > 0) act.innerHTML = `<button class="btn primary" data-action="buycar" disabled>${ICONS.lock}${t('garage.needCr', { n: formatNumber(short) })}</button>`;
        else act.innerHTML = `<button class="btn primary ${armed ? 'confirm' : ''}" data-action="buycar">${armed ? t('garage.confirmBuy', { n }) : `${ICONS.lock}${t('garage.buyCar', { n })}`}</button>`;
      } else act.innerHTML = `<div class="status">${ICONS.check}${t('garage.yourCar')}</div>`;
      fitSoon();
    };

    // imported models keep their own paint scheme and wheels
    const hidden = (k) => (k === 'livery' || k === 'number' || k === 'rims') && hasOwnWheels(car().id);
    const shown = (g) => g.cats.filter((k) => !hidden(k));

    const renderItems = () => {
      if (hidden(cat)) cat = 'paint';
      const group = groupOf(cat);
      lastCat[group.key] = cat;
      for (const b of $$(root, '.dock-groups button')) {
        const g = GROUPS.find((x) => x.key === b.dataset.group);
        b.classList.toggle('on', g === group);
        b.style.display = shown(g).length ? '' : 'none';
      }
      // the open group's tabs, as pills (the cars have none)
      const subs = $(root, '.dock-subs');
      subs.innerHTML = cat === 'cars' ? '' : shown(group)
        .map((k) => `<button class="${k === cat ? 'on' : ''}" data-action="tab" data-cat="${k}">${t(`cat.${k}`)}</button>`)
        .join('');
      const box = $(root, '.items');
      if (cat === 'cars') {
        // every car: its class (with a dot of its stock paint), name, and whether it's yours, owned
        // or its price
        box.innerHTML = CARS.map((c, i) => {
          const own = S.ownsCar(c.id);
          const mine = S.data.car === c.id;
          const cls = ['item', 'car-item', own ? '' : 'locked', mine ? 'equipped' : '', i === carIdx && !mine ? 'selected' : ''].join(' ');
          const paint = findItem('paint', (DEFAULT_CUSTOM_BY_CAR[c.id] || DEFAULT_CUSTOM).paint);
          const tag = mine
            ? `<span class="pr eq">${t('garage.yourCar')}</span>`
            : own
              ? `<span class="pr own">${t('garage.owned')}</span>`
              : `<span class="pr chip ${S.credits < c.price ? 'short' : ''}">${ICONS.lock}${formatNumber(c.price)}</span>`;
          return `<button class="${cls}" data-action="pickcar" data-idx="${i}">${mine ? `<span class="tick">${ICONS.check}</span>` : ''}<span class="cc-cls"><i style="--c:${paint.color}"></i>${carClass(c)}</span><span class="nm">${c.name}</span>${tag}</button>`;
        }).join('');
        fitSoon();
        return;
      }
      if (!owned()) {
        box.innerHTML = `<div class="items-empty">${ICONS.lock}<span>${t('garage.buyToCustomize', { car: car().name })}</span></div>`;
        return;
      }
      const c = CATEGORIES.find((x) => x.key === cat);
      const eq = equippedCustom()[cat];
      const look = resolveCustom(previewing());
      box.innerHTML = c.items
        .filter((it) => itemFits(it, car().id))
        .map((it) => {
          const own = S.owns(cat, it.id);
          const isEq = eq === it.id;
          const sel = pending && pending.item.id === it.id && pending.cat === cat;
          const cls = ['item', own ? '' : 'locked', isEq ? 'equipped' : '', sel ? 'selected' : ''].join(' ');
          const tag = own ? (isEq ? `<span class="pr eq">${t('garage.equipped')}</span>` : `<span class="pr own">${t('garage.owned')}</span>`) : `<span class="pr chip">${ICONS.lock}${formatNumber(it.price)}</span>`;
          return `<button class="${cls}" data-action="item" data-id="${it.id}">${isEq ? `<span class="tick">${ICONS.check}</span>` : ''}${swatchFor(cat, it, look)}<span class="nm">${itemName(it)}</span>${tag}</button>`;
        })
        .join('');
      fitSoon();
    };

    // the car's stock look, and whether it's wearing it
    const stockLook = () => DEFAULT_CUSTOM_BY_CAR[car().id] || DEFAULT_CUSTOM;
    const isStock = () => {
      const now = resolveCustom(equippedCustom());
      const stock = resolveCustom(stockLook());
      return Object.keys(stock).every((k) => now[k].id === stock[k].id);
    };

    // the item in focus - the one on preview, or the tab's equipped one - with its price and buy
    // button; and the reset button in the dock's header
    const renderBuyBar = () => {
      const box = $(root, '.sel-panel');
      const reset = $(root, '.reset-look');
      box.style.display = reset.style.display = owned() && cat !== 'cars' ? '' : 'none';
      if (!owned() || cat === 'cars') return;
      reset.disabled = isStock();
      box.classList.toggle('active', !!pending);
      const item = pending ? pending.item : resolveCustom(equippedCustom())[cat];
      let foot;
      if (pending) {
        const short = item.price - S.credits;
        foot = `<span class="price">${ICONS.coin}${formatNumber(item.price)} CR</span><button class="btn primary small" data-action="buy" ${short > 0 ? 'disabled' : ''}>${short > 0 ? t('garage.need', { n: formatNumber(short) }) : t('garage.buyEquip')}</button>`;
      } else foot = `<span class="sel-eq">${ICONS.check}${t('garage.equipped')}</span>`;
      box.innerHTML = `<span class="sel-cat">${pending ? t('garage.preview') : t(`cat.${cat}`)}</span><b class="sel-name">${itemName(item)}</b><div class="sel-foot">${foot}</div>`;
    };

    const previewCustom = () => app.garage.setCustom(previewing());

    const disarm = () => {
      armed = false;
      clearTimeout(armTimer);
    };

    const showCar = () => {
      pending = null;
      disarm();
      // a car you own becomes your car as you look at it
      if (owned() && S.data.car !== car().id) {
        S.data.car = car().id;
        S.save();
      }
      // a car not downloaded yet shows a loading bar until it's on the turntable; one you don't own
      // yet shows in its own colours
      const id = car().id;
      const loaded = () => car().id === id && root.classList.toggle('car-loading', !app.garage.car);
      app.garage.setCar(id, equippedCustom()).then(loaded);
      loaded();
      renderCar();
      renderItems();
      renderBuyBar();
    };

    const scrollToSelected = () => {
      const n = $(root, '.item.selected, .item.equipped');
      if (n) n.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };

    const openTab = (k) => {
      cat = k;
      app.garage.setShot(SHOT_FOR[cat] || 'hero');
      pending = null;
      previewCustom();
      renderItems();
      renderBuyBar();
      $(root, '.items').scrollLeft = 0;
      $(root, `.dock-subs [data-cat="${cat}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      scrollToSelected();
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
      pickcar: (b) => {
        const i = +b.dataset.idx;
        if (i === carIdx) return;
        carIdx = i;
        showCar();
        $(root, `.car-item[data-idx="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      },
      // buying a car takes a second tap within a few seconds
      buycar: () => {
        if (!armed) {
          armed = true;
          armTimer = setTimeout(() => {
            armed = false;
            renderCar();
          }, 3500);
          app.audio?.play('ui');
          renderCar();
          return;
        }
        disarm();
        if (S.buyCar(car())) {
          S.data.car = car().id;
          S.save();
          app.audio?.play('unlock');
          this.toast(t('garage.unlocked', { car: car().name }));
          this.refreshCredits();
          showCar();
        } else app.audio?.play('error');
      },
      // a group opens on the tab last open in it
      group: (b) => {
        const g = GROUPS.find((x) => x.key === b.dataset.group);
        if (g === groupOf(cat)) return;
        const k = lastCat[g.key];
        openTab(k && !hidden(k) ? k : shown(g)[0]);
      },
      tab: (b) => {
        if (b.dataset.cat !== cat) openTab(b.dataset.cat);
      },
      item: (b) => {
        if (!owned()) return;
        app.garage.setShot(SHOT_FOR[cat] || 'hero');
        const item = findItem(cat, b.dataset.id);
        if (S.owns(cat, item.id)) {
          S.equip(car().id, cat, item.id);
          pending = null;
        } else pending = { cat, item };
        previewCustom();
        renderItems();
        renderBuyBar();
        $(root, `.item[data-id="${item.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      },
      // back to the car's stock look (everything bought stays owned; the stock items come with the car)
      resetlook: () => {
        if (!owned()) return;
        const stock = stockLook();
        for (const [cat, id] of Object.entries(stock)) S.grant(cat, id);
        S.data.custom[car().id] = { ...stock };
        S.save();
        pending = null;
        previewCustom();
        renderItems();
        renderBuyBar();
        app.audio?.play('ui');
        this.toast(t('garage.resetDone'));
      },
      buy: () => {
        if (!pending) return;
        if (S.buyItem(pending.cat, pending.item)) {
          S.equip(car().id, pending.cat, pending.item.id);
          app.audio?.play('buy');
          this.toast(t('garage.purchased', { item: itemName(pending.item) }));
          pending = null;
          this.refreshCredits();
          previewCustom();
          renderItems();
          renderBuyBar();
          renderCar();
        } else app.audio?.play('error');
      },
    });
    fades.push(edgeFade($(root, '.items')), edgeFade($(root, '.dock-subs')));
    showCar();
    requestAnimationFrame(scrollToSelected);
    return {
      el: root,
      dispose: () => {
        if (pending) app.garage.setCustom(S.customFor(car().id));
        window.removeEventListener('resize', fitSoon);
        cancelAnimationFrame(fitFrame);
        clearTimeout(armTimer);
      },
    };
  }

  // ---------------------------------------------------------------- settings
  /**
   * Tabbed settings panel. `tabs` picks which sections are shown (the pause menu uses a subset),
   * `tab` the one open first.
   */
  settingsView(tabs = ['graphics', 'camera', 'audio', 'controls', 'profile', 'language'], tab = tabs[0]) {
    const app = this.app;
    const s = app.settings;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const range = (key, min, max, step, fmt = pct) =>
      `<input class="range" type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}" style="--val:${(((s[key] - min) / (max - min)) * 100).toFixed(1)}%" data-fmt="${fmt === pct ? 'pct' : 'x'}"><output>${fmt(s[key])}</output>`;
    const segS = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const sw = (key, label) => `<button class="switch" data-key="${key}" aria-pressed="${s[key] ? 'true' : 'false'}" aria-label="${label}"></button>`;
    const row = (label, hint, ctl) => `<div class="srow"><div class="lbl"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div><div class="ctl">${ctl}</div></div>`;
    const swRow = (key, label, hint) => row(label, hint, sw(key, label));
    const st = app.storage.data.stats;
    const devBtn = (act, label) => `<button class="btn ghost small" data-dev="${act}">${label}</button>`;
    const devHtml = () => `
          <div class="dev-block">
            <h4 class="dev-title">${ICONS.settings}${t('dev.title')}</h4>
            ${row(t('dev.credits'), t('dev.creditsHint'), devBtn('cr5', '+5,000') + devBtn('cr50', '+50,000'))}
            ${row(t('dev.unlock'), t('dev.unlockHint'), devBtn('unlock', t('dev.unlockBtn')))}
            ${row(t('dev.daily'), t('dev.dailyHint'), devBtn('daily', t('set.resetBtn')))}
            ${import.meta.env.DEV ? '' : row(t('dev.mode'), t('dev.modeHint'), devBtn('off', t('dev.offBtn')))}
          </div>`;
    const SECTIONS = {
      graphics: {
        name: t('set.graphics'),
        icon: 'display',
        html: () =>
          row(t('set.quality'), t('set.qualityHint'), segS('quality', [['auto', t('set.auto')], ['low', t('set.low')], ['medium', t('set.med')], ['high', t('set.high')]])) +
          swRow('showFps', t('set.fps'), t('set.fpsHint')),
      },
      camera: {
        name: t('set.camera'),
        icon: 'camera',
        html: () =>
          row(t('set.cameraMode'), t('set.cameraHint'), segS('camera', ['chase', 'near', 'bumper'].map((m) => [m, t(`cam.${m}`)]))) +
          row(t('set.shake'), '', range('shake', 0, 1.5, 0.05)) +
          row(t('set.blur'), '', range('motionBlur', 0, 1.5, 0.05)) +
          swRow('chromatic', t('set.fringe'), t('set.fringeHint')) +
          swRow('speedLines', t('set.speedLines'), ''),
      },
      audio: {
        name: t('set.audio'),
        icon: 'audio',
        html: () => row(t('set.master'), '', range('master', 0, 1, 0.05)) + row(t('set.music'), '', range('music', 0, 1, 0.05)) + row(t('set.sfx'), t('set.sfxHint'), range('sfx', 0, 1, 0.05)),
      },
      controls: {
        name: t('set.controls'),
        icon: 'gamepad',
        html: () =>
          swRow('keyHints', t('set.keyHints'), t('set.keyHintsHint')) +
          row(t('set.touch'), t('set.touchHint'), segS('controls', [['buttons', t('set.stick')], ['tilt', t('set.tilt')]])) +
          row(t('set.touchSize'), t('set.touchSizeHint'), segS('touchSize', [['s', t('set.small')], ['m', t('set.medium')], ['l', t('set.large')]])) +
          swRow('autoAccel', t('set.autoAccel'), t('set.autoAccelHint')) +
          row(t('set.tiltSens'), '', range('tiltSensitivity', 0.5, 2, 0.05, (v) => `${Number(v).toFixed(2)}×`)) +
          swRow('haptics', t('set.haptics'), t('set.hapticsHint')) +
          row(t('set.units'), '', segS('units', [['kmh', 'KM/H'], ['mph', 'MPH']])),
      },
      profile: {
        name: t('set.profile'),
        icon: 'profile',
        html: () => `
          <div class="career-grid">
            ${[
              [t('set.races'), formatNumber(st.races)],
              [t('set.wins'), formatNumber(st.wins)],
              [t('set.podiums'), formatNumber(st.podiums)],
              [t('set.nearMisses'), formatNumber(st.nearMisses)],
              [t('set.bestDrift'), formatNumber(st.bestDrift)],
              [t('set.bestCombo'), `x${st.bestCombo}`],
              [t('set.driftDistance'), km(st.driftDistance)],
              [t('set.creditsEarned'), formatNumber(st.creditsEarned)],
            ]
              .map(([l, v]) => `<div class="kv"><span>${l}</span><b>${v}</b></div>`)
              .join('')}
          </div>
          ${row(t('set.reset'), t('set.resetHint'), `<button class="btn ghost small" data-reset="1">${t('set.resetBtn')}</button>`)}
          ${devMode() ? devHtml() : ''}
          <p class="about">${t('set.about')}</p>`,
      },
      language: {
        name: t('set.language'),
        icon: 'globe',
        // each language named in its own script
        html: () => row(t('set.lang'), t('set.langHint'), segS('language', [['auto', t('set.auto')], ...LANGUAGES.map((l) => [l.id, `<span lang="${l.lang}">${l.name}</span>`])])),
      },
    };
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
    // developer mode: tap Profile seven times - its title, or its tab once it's open (a pause of
    // over 1.5 s starts over)
    let taps = 0;
    let lastTap = 0;
    const devTap = () => {
      if (devMode()) return;
      const now = performance.now();
      taps = now - lastTap > 1500 ? 1 : taps + 1;
      lastTap = now;
      const left = DEV_TAPS - taps;
      if (left <= 0) {
        setDevMode(true);
        taps = 0;
        app.audio?.play('unlock');
        this.toast(t('dev.on'));
        renderTab();
      } else if (left <= 3) this.toast(t('dev.tapsLeft', { n: left }));
    };
    const devAction = (act) => {
      const S = app.storage;
      if (act === 'cr5' || act === 'cr50') {
        const n = act === 'cr5' ? 5000 : 50000;
        devCredits(S, n);
        this.refreshCredits();
        this.toast(`+${formatNumber(n)} CR`);
        app.audio?.play('buy');
        return;
      }
      if (act === 'unlock') {
        devUnlockAll(S);
        this.toast(t('dev.unlockDone'));
      } else if (act === 'daily') {
        devResetDaily(S);
        this.toast(t('dev.dailyDone'));
      } else if (act === 'off') {
        setDevMode(false);
        this.toast(t('dev.off'));
        renderTab();
      }
      app.audio?.play('ui');
    };
    view.addEventListener('click', (e) => {
      const d = e.target.closest('[data-dev]');
      if (d) return devAction(d.dataset.dev);
      if (tab === 'profile' && e.target.closest('.panel-title, [data-tab="profile"]')) return devTap();
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      tab = b.dataset.tab;
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
              this.toast(t('set.noMotion'));
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
          this.toast(t('set.resetDone'));
          r.textContent = t('set.resetBtn');
          r.classList.remove('danger');
          delete r.dataset.confirm;
        } else {
          r.dataset.confirm = '1';
          r.classList.add('danger');
          r.textContent = t('set.resetConfirm');
        }
      }
    });
  }

  _screen_settings({ tab }) {
    const app = this.app;
    const root = el(`<div class="screen settings-screen">${this._head(t('settings.eyebrow'), t('settings.title'))}</div>`);
    root.appendChild(this.settingsView(undefined, tab));
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
      `${ICONS.laps}${t('laps', { n: d.laps })}`,
      v.reverse ? `${ICONS.reverse}${t('reverse')}` : `${ICONS.forward}${t('forward')}`,
      v.mirror ? `${ICONS.mirror}${t('mirror')}` : null,
      v.weather === 'rain' ? `${ICONS.rain}${t('weather.rain')}` : `${ICONS.moon}${t('weather.clear')}`,
    ].filter(Boolean);
    const date = new Date(`${d.key}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
    const root = el(`
      <div class="screen daily-screen">
        ${this._head(date, t('mode.daily'), this.creditsHtml())}
        <div class="daily-body">
          <section class="daily-card glass anim-r" style="--d:100">
            <div class="daily-map"><canvas width="300" height="300"></canvas></div>
            <div class="daily-info">
              <div class="eyebrow accent">${d.trackName}</div>
              <div class="obj-label">${ICONS.target}${t('daily.objective')}<b class="gold">+${formatNumber(d.bonus)}</b></div>
              <h2 class="obj">${d.objective.label}</h2>
              <p class="obj-detail">${d.objective.detail}</p>
              <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
              <div class="daily-meta">
                <div class="kv"><span>${t('daily.carProvided')}</span><b>${d.carName}</b></div>
                <div class="kv"><span>${t('daily.reward')}</span><b class="gold">${ICONS.coin}${formatNumber(d.reward)}</b></div>
                <div class="kv"><span>${t('daily.streak')}</span><b class="${ds.streak ? 'amber' : ''}">${ICONS.flame}${ds.streak || 0}</b></div>
              </div>
            </div>
            ${done ? `<div class="done-stamp">${ICONS.check}${t('daily.completed')}</div>` : ''}
          </section>
        </div>
        <footer class="daily-footer anim-up" style="--d:200">
          <div class="daily-countdown">${t('daily.newIn')} <b data-countdown></b></div>
          <button class="btn primary big" data-action="start">${t(done ? 'daily.again' : 'daily.accept')}${ICONS.chevron}</button>
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
          <div class="eyebrow accent anim-l">${modeLabel(race?.cfg.mode)} · ${race?.world?.def.name || ''}</div>
          <h2 class="pause-title anim-l" style="--d:40">${t('pause.paused')}</h2>
          <div class="pause-stats anim-l" style="--d:80">
            ${tt ? '' : `<div class="kv"><span>${t('pause.position')}</span><b>${h.place || '-'}<small>/${h.total || '-'}</small></b></div>`}
            <div class="kv"><span>${t('pause.lap')}</span><b>${h.lap || 1}<small>/${h.laps || 1}</small></b></div>
            <div class="kv"><span>${t('pause.time')}</span><b>${formatTime(h.time || 0)}</b></div>
          </div>
          <nav class="pause-menu">
            ${pm(0, 'resume', 'play', t('pause.resume'))}
            ${pm(1, 'restart', 'restart', t('pause.restart'))}
            ${pm(2, 'settings', 'settings', t('pause.settings'))}
            ${pm(3, 'quit', 'exit', t('pause.quit'), 'ui-back')}
          </nav>
        </div>
        ${
          kb
            ? `<div class="keys glass anim-r" style="--d:140">
                <div class="eyebrow">${t(pad ? 'pause.controller' : 'pause.keyboard')}</div>
                <div class="ctl-grid">${controlsCells(pad ? 'gamepad' : 'keyboard', 1, !!app.race?.playerPatrol)}</div>
                ${pad ? '' : `<div class="kl-note">${t('pause.kbNote')}</div>`}
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
          <button class="icon-btn" data-action="back" data-sfx="ui-back" aria-label="${t('back')}">${ICONS.back}</button>
          <div class="title-block"><div class="eyebrow">${t('pause.paused')}</div><h1>${t('settings.title')}</h1></div>
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
    if (reward.newRecord) tags.push(`<span class="chip c-gold">${ICONS.trophy}${t('res.newRecord')}</span>`);
    if (reward.newLap) tags.push(`<span class="chip c-ice">${ICONS.stopwatch}${t('res.bestLap')}</span>`);
    if (reward.daily) tags.push(`<span class="chip c-good">${ICONS.check}${t('res.dailyComplete')}</span>`);
    if (reward.objective === true) tags.push(`<span class="chip c-good">${ICONS.target}${t('res.objectiveMet')}</span>`);
    if (reward.objective === false) tags.push(`<span class="chip c-bad">${t('res.dailyFailed', { p: reward.dailyProgress })}</span>`);
    const leader = res.rows[0]?.time || 0;
    const ordPre = t('ord.pre', { n: res.place });
    const hero = isTT
      ? `<div class="res-time anim-pop">${formatTime(res.time)}</div>`
      : `<div class="res-place anim-pop p${res.place}">${ordPre ? `<span class="pre">${ordPre}</span>` : ''}<span class="n">${res.place}</span><span class="suf">${t('ord.suf', { n: res.place })}</span><span class="of">/ ${res.total}</span></div>`;
    const rows = isTT
      ? res.lapTimes
          .map((time, i) => {
            const best = time === res.bestLap;
            return `<div class="st-row ${best ? 'me' : ''}" style="--i:${i}"><span class="pos">${i + 1}</span><i class="stripe" style="--c:${best ? 'var(--ice)' : 'rgba(255,255,255,.25)'}"></i><span class="nm"><b>${t('res.lap', { n: i + 1 })}</b>${best ? `<small>${t('res.fastest')}</small>` : ''}</span><span class="tm">${formatTime(time)}</span></div>`;
          })
          .join('')
      : res.rows
          .map((r, i) => {
            const gap = i === 0 ? formatTime(r.time) : `+${Math.max(0, r.time - leader).toFixed(2)}`;
            return `<div class="st-row ${r.isPlayer ? 'me' : ''}" style="--i:${i}"><span class="pos">${r.place}</span><i class="stripe" style="--c:${r.color}"></i><span class="nm"><b>${r.isPlayer ? t('you') : r.name}</b><small>${r.car}</small></span><span class="tm">${r.estimated ? '~' : ''}${gap}</span></div>`;
          })
          .join('');
    const stats = [
      [t('res.style'), formatNumber(res.style)],
      [t('res.nearMisses'), res.counts.nearMiss || 0],
      [t('res.bestDrift'), formatNumber(res.best.drift || 0)],
      [t('res.topCombo'), `x${res.best.combo || 1}`],
      [t('res.overtakes'), res.counts.overtake || 0],
    ];
    const o = el(`
      <div class="overlay results-overlay">
        <div class="results scroll">
          <section class="res-hero">
            <div class="eyebrow accent anim-l">${res.trackName} · ${modeLabel(res.mode)}</div>
            ${hero}
            <div class="res-times anim-l" style="--d:220">
              ${isTT ? '' : `<div class="kv"><span>${t('res.totalTime')}</span><b>${formatTime(res.time)}</b></div>`}
              <div class="kv"><span>${t('res.bestLap')}</span><b>${formatTime(res.bestLap)}</b></div>
            </div>
            ${tags.length ? `<div class="res-tags anim-l" style="--d:280">${tags.join('')}</div>` : ''}
            <div class="res-stats">${stats.map(([l, v], i) => `<div class="res-stat anim-up" style="--d:${320 + i * 50}"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
          </section>
          <section class="res-side glass anim-r" style="--d:160">
            <h3 class="panel-title">${t(isTT ? 'res.lapTimes' : 'res.standings')}</h3>
            <div class="standings">${rows}</div>
            <div class="rewards">
              ${reward.lines.map(([l, v]) => `<div class="rw"><span>${l}</span><b>+${formatNumber(v)}</b></div>`).join('')}
              <div class="rw-total"><span>${t('res.earned')}</span><b>${ICONS.coin}<span data-earned>0</span><small>CR</small></b></div>
            </div>
            <div class="res-actions">
              <button class="btn ghost" data-action="menu" data-sfx="ui-back">${t('res.menu')}</button>
              <button class="btn ghost" data-action="garage">${t('res.garage')}</button>
              <button class="btn primary" data-action="retry">${ICONS.restart}${t('res.retry')}</button>
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
