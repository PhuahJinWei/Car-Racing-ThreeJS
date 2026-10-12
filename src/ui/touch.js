import { el, $, ICONS } from './dom.js';
import { t } from '../core/i18n.js';

// The steering stick: full lock this far out (a share of its radius); nothing inside the dead zone.
const LOCK = 0.8;
const DEAD = 0.07;

/**
 * On-screen controls for phones/tablets (multi-touch via Pointer Events):
 *  - left: a steering stick that comes up under the thumb wherever it lands in the left zone
 *    (or tilt steering). With auto-accelerate off it works the pedals too: up to accelerate,
 *    down to brake.
 *  - right: NITRO (tap) and DRIFT/BRAKE (hold) buttons
 */
export class TouchControls {
  constructor(app) {
    this.app = app;
    this.input = app.input;
    // up / down are the left / right chevrons turned a quarter (CSS)
    const arrow = (dir) => `<span class="arrow ${dir}">${dir === 'l' || dir === 'u' ? ICONS.left : ICONS.right}</span>`;
    this.root = el(`
      <div class="touch">
        <div class="stick-zone"></div>
        <div class="stick">${arrow('l')}${arrow('r')}${arrow('u')}${arrow('d')}<span class="knob"></span></div>
        <div class="tilt-hint" style="display:none">${t('touch.tilt')}</div>
        <div class="actions">
          <div class="tbtn nitro"><span class="ring"></span><span class="ico">${ICONS.bolt}</span><span class="cnt">1</span><span class="lbl">${t('touch.nitro')}</span></div>
          <div class="tbtn drift"><span class="lbl">${t('touch.drift')}</span><span class="sub">${t('touch.driftSub')}</span></div>
        </div>
      </div>`);
    this.zone = $(this.root, '.stick-zone');
    this.stick = $(this.root, '.stick');
    this.knob = $(this.root, '.stick .knob');
    this.nitroEl = $(this.root, '.nitro');
    this.nitroCnt = $(this.root, '.nitro .cnt');
    this.driftEl = $(this.root, '.drift');
    this.tiltHint = $(this.root, '.tilt-hint');
    this.stickPointer = null;
    this.center = { x: 0, y: 0 };
    this.radius = 60;
    this.driftPointers = new Set();
    // Touch players get auto-acceleration straight away (until they use a keyboard / pad).
    if (this.input.device === 'keyboard' && this.input.keys.size === 0) this.input.device = 'touch';
    this._onResize = () => {
      if (this.stickPointer === null) this._rest();
    };
    window.addEventListener('resize', this._onResize);
    this._bind();
    this.setMode(app.settings.controls);
  }

  setMode(mode) {
    this.mode = mode;
    const tilt = mode === 'tilt';
    this.zone.style.display = tilt ? 'none' : '';
    this.stick.style.display = tilt ? 'none' : '';
    this.tiltHint.style.display = tilt ? '' : 'none';
    if (tilt) {
      this.input.enableTilt().then((ok) => {
        if (!ok) {
          this.app.ui.toast(t('touch.noTilt'));
          this.setMode('buttons');
          return;
        }
        // No sensor data arriving (e.g. desktop / denied) -> fall back to the stick.
        setTimeout(() => {
          if (this.mode === 'tilt' && !this.input.tilt.has) {
            this.app.ui.toast(t('touch.noSensor'));
            this.setMode('buttons');
          }
        }, 1500);
      });
    } else {
      this.input.disableTilt();
      this._rest();
    }
  }

  /** Where the stick waits, dimmed, for a thumb: the bottom corner of its zone. */
  _rest() {
    if (!this.root.isConnected) return;
    const box = this.root.getBoundingClientRect();
    const zone = this.zone.getBoundingClientRect();
    const r = this.stick.offsetWidth / 2;
    const gap = Math.max(14, r * 0.3);
    this._place(zone.left - box.left + r + gap, zone.bottom - box.top - r - gap);
    this._knob(0, 0);
    this.stick.classList.remove('on', 'l', 'r');
    this.stick.classList.toggle('pedals', !this.input.autoAccel);
  }

  _place(x, y) {
    this.center.x = x;
    this.center.y = y;
    this.stick.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  _knob(x, y) {
    this.knob.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  _local(e) {
    const box = this.root.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  _stickMove(e) {
    const p = this._local(e);
    const r = this.radius;
    const pedals = !this.input.autoAccel;
    let dx = p.x - this.center.x;
    let dy = pedals ? p.y - this.center.y : 0;
    // past the rim the stick follows the thumb, so turning back answers at once
    const len = Math.hypot(dx, dy);
    if (len > r) {
      const k = (len - r) / len;
      this._place(this.center.x + dx * k, this.center.y + dy * k);
      dx -= dx * k;
      dy -= dy * k;
    }
    this._knob(dx, dy);
    const axis = (v) => {
      const a = Math.abs(v) / (r * LOCK);
      return a <= DEAD ? 0 : Math.sign(v) * Math.min(1, (a - DEAD) / (1 - DEAD));
    };
    const steer = axis(dx);
    const pedal = -axis(dy); // up accelerates, down brakes
    this.input.setTouch({ steer, throttle: Math.max(0, pedal), brake: Math.max(0, -pedal) });
    this.stick.classList.toggle('l', steer < -0.05);
    this.stick.classList.toggle('r', steer > 0.05);
  }

  _bind() {
    // one thumb steers: the stick comes up where it lands, and that spot is straight ahead
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickPointer !== null) return;
      this.stickPointer = e.pointerId;
      try {
        z.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.radius = this.stick.offsetWidth / 2;
      const p = this._local(e);
      this._place(p.x, p.y);
      this.stick.classList.add('on');
      this.stick.classList.toggle('pedals', !this.input.autoAccel);
      this._stickMove(e);
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointer) return;
      e.preventDefault();
      this._stickMove(e);
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.input.setTouch({ steer: 0, throttle: 0, brake: 0 });
      this._rest();
    };
    z.addEventListener('pointerup', endStick);
    z.addEventListener('pointercancel', endStick);
    z.addEventListener('lostpointercapture', endStick);

    const d = this.driftEl;
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.driftPointers.add(e.pointerId);
      try {
        d.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.input.setTouch({ drift: true });
      d.classList.add('on');
    });
    const endDrift = (e) => {
      this.driftPointers.delete(e.pointerId);
      if (this.driftPointers.size === 0) {
        this.input.setTouch({ drift: false });
        d.classList.remove('on');
      }
    };
    d.addEventListener('pointerup', endDrift);
    d.addEventListener('pointercancel', endDrift);
    d.addEventListener('lostpointercapture', endDrift);

    const n = this.nitroEl;
    n.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.press('nitro');
      n.classList.add('on');
      setTimeout(() => n.classList.remove('on'), 120);
    });
    // Stop the page from scrolling / zooming while playing.
    this.root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  update(hud) {
    const nitro = hud.nitro || 0;
    const c = Math.floor(nitro);
    if (c !== this._lastN) {
      this._lastN = c;
      this.nitroCnt.textContent = String(c);
      this.nitroEl.classList.toggle('ready', c > 0);
    }
    // ring = progress towards the next charge (full ring once the tank is full)
    const max = hud.nitroMax || 3;
    const frac = nitro >= max ? 1 : nitro - c;
    const p = frac.toFixed(2);
    if (p !== this._lastP) {
      this._lastP = p;
      this.nitroEl.style.setProperty('--p', p);
    }
  }

  mount(parent) {
    parent.appendChild(this.root);
    this._rest();
  }

  reset() {
    this.input.setTouch({ steer: 0, throttle: 0, brake: 0, drift: false });
    this.driftPointers.clear();
    this.driftEl.classList.remove('on');
    this.stickPointer = null;
    this._rest();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.reset();
    this.root.remove();
  }
}
