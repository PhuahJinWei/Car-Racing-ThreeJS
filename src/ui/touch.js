import { el, $, ICONS } from './dom.js';
import { clamp } from '../core/math.js';
import { t } from '../core/i18n.js';

/**
 * On-screen controls for phones/tablets (multi-touch via Pointer Events):
 *  - left: steering pads (slide for analog steering) or tilt steering
 *  - right: NITRO (tap) and DRIFT/BRAKE (hold) buttons
 */
export class TouchControls {
  constructor(app) {
    this.app = app;
    this.input = app.input;
    this.root = el(`
      <div class="touch">
        <div class="steer">
          <div class="pad l">${ICONS.left}</div>
          <div class="pad r">${ICONS.right}</div>
        </div>
        <div class="tilt-hint" style="display:none">${t('touch.tilt')}</div>
        <div class="actions">
          <div class="tbtn nitro"><span class="ring"></span><span class="ico">${ICONS.bolt}</span><span class="cnt">1</span><span class="lbl">${t('touch.nitro')}</span></div>
          <div class="tbtn drift"><span class="lbl">${t('touch.drift')}</span><span class="sub">${t('touch.driftSub')}</span></div>
        </div>
      </div>`);
    this.steerEl = $(this.root, '.steer');
    this.arrowL = $(this.root, '.pad.l');
    this.arrowR = $(this.root, '.pad.r');
    this.nitroEl = $(this.root, '.nitro');
    this.nitroCnt = $(this.root, '.nitro .cnt');
    this.driftEl = $(this.root, '.drift');
    this.tiltHint = $(this.root, '.tilt-hint');
    this.steerPointer = null;
    this.driftPointers = new Set();
    // Touch players get auto-acceleration straight away (until they use a keyboard / pad).
    if (this.input.device === 'keyboard' && this.input.keys.size === 0) this.input.device = 'touch';
    this._bind();
    this.setMode(app.settings.controls);
  }

  setMode(mode) {
    this.mode = mode;
    const tilt = mode === 'tilt';
    this.steerEl.style.display = tilt ? 'none' : '';
    this.tiltHint.style.display = tilt ? '' : 'none';
    if (tilt) {
      this.input.enableTilt().then((ok) => {
        if (!ok) {
          this.app.ui.toast(t('touch.noTilt'));
          this.setMode('buttons');
          return;
        }
        // No sensor data arriving (e.g. desktop / denied) -> fall back to the pads.
        setTimeout(() => {
          if (this.mode === 'tilt' && !this.input.tilt.has) {
            this.app.ui.toast(t('touch.noSensor'));
            this.setMode('buttons');
          }
        }, 1500);
      });
    } else this.input.disableTilt();
  }

  _steerFrom(e) {
    const r = this.steerEl.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    let s = 0;
    if (u < 0.5) s = -clamp((0.5 - u) / 0.22, 0, 1);
    else s = clamp((u - 0.5) / 0.22, 0, 1);
    if (Math.abs(s) < 0.08) s = 0;
    this.input.setTouch({ steer: s });
    this.arrowL.classList.toggle('on', s < -0.05);
    this.arrowR.classList.toggle('on', s > 0.05);
  }

  _bind() {
    const st = this.steerEl;
    st.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.steerPointer = e.pointerId;
      try {
        st.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this._steerFrom(e);
    });
    st.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerPointer) return;
      e.preventDefault();
      this._steerFrom(e);
    });
    const endSteer = (e) => {
      if (e.pointerId !== this.steerPointer) return;
      this.steerPointer = null;
      this.input.setTouch({ steer: 0 });
      this.arrowL.classList.remove('on');
      this.arrowR.classList.remove('on');
    };
    st.addEventListener('pointerup', endSteer);
    st.addEventListener('pointercancel', endSteer);
    st.addEventListener('lostpointercapture', endSteer);

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
  }

  reset() {
    this.input.setTouch({ steer: 0, drift: false });
    this.driftPointers.clear();
    this.steerPointer = null;
  }

  dispose() {
    this.reset();
    this.root.remove();
  }
}
