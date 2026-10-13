import { clamp, approach } from './math.js';

const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  drift: ['Space'],
  nitro: ['ShiftLeft', 'ShiftRight', 'KeyN', 'KeyE'],
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  reset: ['KeyR'],
  // a patrol car's siren
  siren: ['KeyQ'],
};

/**
 * Unified input: keyboard, touch (fed by the on-screen controls), gamepad and device tilt.
 * Produces analog steer / throttle / brake plus edge-triggered actions.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.edges = new Set();
    // rev: held to rev the engine on the start line - the gas, or NITRO where the gas is automatic
    // (revBy says which)
    // autoGas: the throttle is the automatic one (touch), which a drift lifts (see Vehicle)
    this.state = { steer: 0, throttle: 0, brake: 0, drift: false, nitroHeld: false, rev: false, autoGas: false };
    this.revBy = 'gas';
    this.kbSteer = 0;
    this.device = 'keyboard';
    // from the on-screen controls: steer -1..1, throttle / brake 0..1 (the stick, with auto-accelerate off)
    this.touch = { steer: 0, throttle: 0, brake: 0, drift: false, nitro: false, active: false };
    this.tilt = { enabled: false, raw: 0, neutral: 0, value: 0, has: false };
    this.autoAccel = true;
    this.tiltSensitivity = 1;
    this.haptics = true;
    this.enabled = true;
    this._gpPrev = {};

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (this._isGameKey(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this.device = 'keyboard';
      for (const [action, codes] of Object.entries(BINDINGS)) if (codes.includes(e.code)) this.edges.add(action);
      if (this._isGameKey(e.code) && !this._typingTarget(e.target)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.drift = false;
      this.touch.steer = 0;
      this.touch.throttle = 0;
      this.touch.brake = 0;
    });
    window.addEventListener('gamepadconnected', () => {
      this.device = 'gamepad';
      this.padSeen = true;
    });
  }

  _typingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }

  _isGameKey(code) {
    return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code);
  }

  has(action) {
    const codes = BINDINGS[action];
    for (let i = 0; i < codes.length; i++) if (this.keys.has(codes[i])) return true;
    return false;
  }

  /** Edge-triggered action (true once per press). */
  consume(action) {
    if (this.edges.has(action)) {
      this.edges.delete(action);
      return true;
    }
    return false;
  }

  /** Called by the on-screen controls. */
  press(action) {
    this.edges.add(action);
    this.device = 'touch';
  }

  setTouch(partial) {
    Object.assign(this.touch, partial);
    this.touch.active = true;
    this.device = this.tilt.enabled ? 'tilt' : 'touch';
  }

  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch {
      return false;
    }
    if (!this._tiltHandler) {
      this._tiltHandler = (e) => {
        const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
        let v;
        if (angle === 90) v = e.beta;
        else if (angle === -90 || angle === 270) v = -e.beta;
        else v = e.gamma;
        if (v == null) return;
        this.tilt.raw = v;
        this.tilt.has = true;
      };
      window.addEventListener('deviceorientation', this._tiltHandler);
    }
    this.tilt.enabled = true;
    this.calibrateTilt();
    return true;
  }

  disableTilt() {
    this.tilt.enabled = false;
  }

  calibrateTilt() {
    this.tilt.neutral = this.tilt.raw || 0;
  }

  vibrate(pattern) {
    if (!this.haptics) return;
    if (this.device !== 'touch' && this.device !== 'tilt') return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }

  _pollGamepad(dt = 1 / 60) {
    // getGamepads() hands back a new list every call: skip it until a pad has shown up
    if (!this.padSeen) return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0;
      const steer = Math.abs(ax) < 0.12 ? 0 : (ax - Math.sign(ax) * 0.12) / 0.88;
      const b = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
      const rt = b(7);
      const lt = b(6);
      const anyActive = Math.abs(steer) > 0.05 || rt > 0.05 || lt > 0.05 || gp.buttons.some((x) => x.pressed);
      if (anyActive) this.device = 'gamepad';
      const edge = (i, ...actions) => {
        const pressed = !!(gp.buttons[i] && gp.buttons[i].pressed);
        if (pressed && !this._gpPrev[i]) for (const a of actions) this.edges.add(a);
        this._gpPrev[i] = pressed;
      };
      edge(0, 'nitro', 'ui-ok');
      edge(1, 'ui-back');
      edge(3, 'camera');
      edge(9, 'pause');
      edge(8, 'reset');
      edge(4, 'siren');
      edge(12, 'ui-up');
      edge(13, 'ui-down');
      edge(14, 'ui-left');
      edge(15, 'ui-right');
      // menu navigation with the left stick, with key-style auto repeat
      const sx = gp.axes[0] || 0;
      const sy = gp.axes[1] || 0;
      const dir = Math.abs(sy) > 0.6 && Math.abs(sy) >= Math.abs(sx) ? (sy < 0 ? 'ui-up' : 'ui-down') : Math.abs(sx) > 0.6 ? (sx < 0 ? 'ui-left' : 'ui-right') : null;
      if (dir !== this._stickDir) {
        this._stickDir = dir;
        this._stickT = 0.42;
        if (dir) this.edges.add(dir);
      } else if (dir) {
        this._stickT -= dt;
        if (this._stickT <= 0) {
          this._stickT = 0.13;
          this.edges.add(dir);
        }
      }
      return {
        steer,
        throttle: Math.max(rt, b(12) > 0.5 ? 1 : 0),
        brake: Math.max(lt, b(13) > 0.5 ? 1 : 0),
        drift: !!(gp.buttons[2]?.pressed || gp.buttons[1]?.pressed || gp.buttons[5]?.pressed),
      };
    }
    return null;
  }

  update(dt) {
    const s = this.state;
    if (!this.enabled) {
      s.steer = 0;
      s.throttle = 0;
      s.brake = 0;
      s.drift = false;
      return s;
    }
    // Keyboard steering with smoothing (digital -> analog)
    const kl = this.has('left');
    const kr = this.has('right');
    const target = (kr ? 1 : 0) - (kl ? 1 : 0);
    const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(this.kbSteer) && this.kbSteer !== 0 ? 10 : 4.5;
    this.kbSteer = approach(this.kbSteer, target, rate * dt);

    const gp = this._pollGamepad(dt);
    const dev = this.device;
    if (dev === 'gamepad' && gp) {
      s.steer = gp.steer;
      s.throttle = gp.throttle;
      s.brake = gp.brake;
      s.drift = gp.drift;
      s.rev = gp.throttle > 0.5;
      s.autoGas = false;
      this.revBy = 'gas';
    } else if (dev === 'touch' || dev === 'tilt') {
      if (this.tilt.enabled && this.tilt.has) {
        const v = (this.tilt.raw - this.tilt.neutral) / (22 / this.tiltSensitivity);
        this.tilt.value = clamp(v, -1, 1);
        s.steer = Math.abs(this.tilt.value) < 0.04 ? 0 : this.tilt.value;
      } else {
        s.steer = this.touch.steer;
      }
      s.drift = this.touch.drift;
      s.brake = this.touch.brake;
      s.throttle = this.autoAccel ? 1 : this.touch.throttle;
      s.autoGas = this.autoAccel;
      s.rev = this.autoAccel ? this.touch.nitro : this.touch.throttle > 0.5;
      this.revBy = this.autoAccel ? 'nitro' : 'gas';
    } else {
      s.steer = this.kbSteer;
      s.throttle = this.has('up') ? 1 : 0;
      s.brake = this.has('down') ? 1 : 0;
      s.drift = this.has('drift');
      s.rev = s.throttle > 0;
      s.autoGas = false;
      this.revBy = 'gas';
    }
    s.nitroHeld = this.has('nitro');
    return s;
  }

  clearEdges() {
    this.edges.clear();
  }

  isTouchDevice() {
    return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }
}
