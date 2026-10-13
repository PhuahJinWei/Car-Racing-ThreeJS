import { el, $, ICONS } from './dom.js';
import { t } from '../core/i18n.js';

// The steering stick, as shares of its radius: full lock this far out, nothing inside the dead zone.
const LOCK = 0.7;
const DEAD = 0.1;
// With the throttle automatic, pulling the stick down brakes (held at a standstill: reverses). It
// takes a clear pull down to start, then holds while the thumb moves sideways, so the car can be
// steered while it backs up. (Shares of the full-lock distance.)
const BRAKE_ON = 0.5;
const BRAKE_OFF = 0.3;

/** The Control size setting: how much the stick and buttons are scaled (CSS --tscale). */
export const TOUCH_SIZES = { s: 0.85, m: 1, l: 1.2 };

/**
 * On-screen controls for phones/tablets (multi-touch via Pointer Events):
 *  - left: a steering stick that stays put at the bottom left (or tilt steering). A thumb on its
 *    right side steers right at once, no drag needed; pulling it down brakes and reverses. With
 *    auto-accelerate off it works the pedals: up to accelerate, down to brake.
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
        <div class="stick-zone">
          <div class="stick">${arrow('l')}${arrow('r')}${arrow('u')}${arrow('d')}<span class="knob"></span></div>
        </div>
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
    this.braking = false;
    this.driftPointers = new Set();
    // Touch players get auto-acceleration straight away (until they use a keyboard / pad).
    if (this.input.device === 'keyboard' && this.input.keys.size === 0) this.input.device = 'touch';
    this._bind();
    this.setMode(app.settings.controls);
  }

  setMode(mode) {
    this.mode = mode;
    const tilt = mode === 'tilt';
    this.zone.style.display = tilt ? 'none' : '';
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
      this._release();
    }
  }

  /** At rest: knob centred, dimmed until a thumb comes down on it. */
  _release() {
    this._knob(0, 0);
    this.braking = false;
    this.stick.classList.remove('on', 'l', 'r', 'u', 'd');
    this.stick.classList.toggle('pedals', !this.input.autoAccel);
  }

  _knob(x, y) {
    this.knob.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  _stickMove(e) {
    // where the thumb is against the stick's centre (+x right, +y down), 1 = full lock
    const R = this.radius * LOCK;
    const x = (e.clientX - this.center.x) / R;
    const y = (e.clientY - this.center.y) / R;
    const len = Math.hypot(x, y);
    const k = len > 1 ? R / len : R;
    this._knob(x * k, y * k);
    const axis = (v) => {
      const a = Math.abs(v);
      return a <= DEAD ? 0 : Math.sign(v) * Math.min(1, (a - DEAD) / (1 - DEAD));
    };
    const steer = axis(x);
    let throttle = 0;
    let brake = 0;
    if (!this.input.autoAccel) {
      const pedal = -axis(y); // up accelerates, down brakes
      throttle = Math.max(0, pedal);
      brake = Math.max(0, -pedal);
    } else {
      // to start: well down and within 40 degrees of straight down, so hard steering with a low thumb doesn't brake
      this.braking = this.braking ? y > BRAKE_OFF : y > BRAKE_ON && y > Math.abs(x) * 1.2;
      brake = this.braking ? 1 : 0;
    }
    this.input.setTouch({ steer, throttle, brake });
    this.stick.classList.toggle('l', steer < -0.05);
    this.stick.classList.toggle('r', steer > 0.05);
    this.stick.classList.toggle('u', throttle > 0.05);
    this.stick.classList.toggle('d', brake > 0.05);
  }

  _bind() {
    // the thumb steers by where it is on the stick: a touch on its right side turns right at once
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
      const b = this.stick.getBoundingClientRect();
      this.center.x = b.left + b.width / 2;
      this.center.y = b.top + b.height / 2;
      this.radius = b.width / 2;
      this.braking = false;
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
      this._release();
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
      n.setPointerCapture?.(e.pointerId);
      this.input.press('nitro');
      this.input.setTouch({ nitro: true });
      n.classList.add('on');
      setTimeout(() => n.classList.remove('on'), 120);
    });
    // (held, NITRO revs the engine on the start line)
    const endNitro = () => this.input.setTouch({ nitro: false });
    n.addEventListener('pointerup', endNitro);
    n.addEventListener('pointercancel', endNitro);
    n.addEventListener('lostpointercapture', endNitro);
    // Stop the page from scrolling / zooming while playing.
    this.root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  update(hud) {
    // on the start line the button revs the engine
    const rev = hud.launch && this.input.revBy === 'nitro';
    if (rev !== this._lastRev) {
      this._lastRev = rev;
      $(this.nitroEl, '.lbl').textContent = rev ? t('touch.rev') : t('touch.nitro');
    }
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
    this._release();
  }

  reset() {
    this.input.setTouch({ steer: 0, throttle: 0, brake: 0, drift: false, nitro: false });
    this.driftPointers.clear();
    this.driftEl.classList.remove('on');
    this.stickPointer = null;
    this._release();
  }

  dispose() {
    this.reset();
    this.root.remove();
  }
}
