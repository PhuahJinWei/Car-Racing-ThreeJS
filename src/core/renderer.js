import * as THREE from 'three';
import { PostFX } from './postfx.js';

export const QUALITY_PRESETS = {
  low: {
    pixelRatioCap: 1.0,
    renderScale: 0.8,
    minScale: 0.55,
    samples: 0,
    bloomLevels: 4,
    blurTaps: 4,
    anamorphic: false,
    reflections: true,
    particles: 0.5,
    decorDensity: 0.6,
    cones: false,
    carHQ: false,
    carDetail: 'light',
    liveryRes: 512,
  },
  medium: {
    pixelRatioCap: 1.5,
    renderScale: 0.85,
    minScale: 0.6,
    samples: 2,
    bloomLevels: 5,
    blurTaps: 6,
    anamorphic: false,
    reflections: true,
    particles: 0.75,
    decorDensity: 0.85,
    cones: true,
    carHQ: true,
    carDetail: 'light',
    liveryRes: 1024,
  },
  high: {
    pixelRatioCap: 2.0,
    renderScale: 1.0,
    minScale: 0.65,
    samples: 4,
    bloomLevels: 5,
    blurTaps: 8,
    anamorphic: true,
    reflections: true,
    particles: 1,
    decorDensity: 1,
    cones: true,
    carHQ: true,
    carDetail: 'full',
    liveryRes: 2048,
  },
};

/** Lower presets, in the order auto quality steps down through them. */
const STEPS = ['high', 'medium', 'low'];

// GPUs in phones that can't hold the medium preset (the renderer string WebGL reports)
const WEAK_GPU = /Mali-(4\d\d|T\d+|G31|G51|G52|G57)\b|Adreno \(TM\) ([345]\d\d|6[01][0-6])\b|PowerVR|SGX/i;

/**
 * Starting preset for AUTO: high on computers, medium on phones and tablets, low on clearly weak
 * ones (little memory, few cores, or a weak GPU). Auto quality steps down from there if needed.
 */
export function detectDefaultQuality(gl) {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  if (!touch) return 'high';
  // iOS doesn't report memory, and its core count says little: iPhones go by their GPU and speed
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  if ((mem && mem <= 3) || (!ios && cores && cores <= 4)) return 'low';
  try {
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg && WEAK_GPU.test(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))) return 'low';
  } catch {
    /* no renderer string: go by the frame rate */
  }
  return 'medium';
}

/** The lower of two presets. */
export function lowerQuality(a, b) {
  return STEPS[Math.max(STEPS.indexOf(a), STEPS.indexOf(b))] || a;
}

/**
 * Owns the WebGL renderer + post-processing and handles resizing and dynamic resolution.
 */
// median of the recent frame samples, without making garbage (insertion sort into a fixed buffer)
const _sorted = new Float64Array(128);
function medianOf(list) {
  const n = Math.min(list.length, _sorted.length);
  for (let i = 0; i < n; i++) {
    const v = list[i];
    let j = i - 1;
    while (j >= 0 && _sorted[j] > v) {
      _sorted[j + 1] = _sorted[j];
      j--;
    }
    _sorted[j + 1] = v;
  }
  return _sorted[n >> 1];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = true;
    this.post = new PostFX(this.renderer);
    this.presetName = 'high';
    this.preset = { ...QUALITY_PRESETS.high };
    this.dynamicScale = 1;
    this.autoQuality = true;
    this._frameTimes = [];
    this._workTimes = [];
    this._lastAdjust = 0;
    this._lastCheck = 0;
    // called when auto quality steps the preset down (name of the new preset)
    this.onQualityStep = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }

  setQuality(name, auto = this.autoQuality) {
    this.presetName = name;
    this.preset = { ...QUALITY_PRESETS[name] };
    this.autoQuality = auto;
    this.dynamicScale = 1;
    this.resize();
  }

  _applyPost() {
    const p = this.preset;
    this.post.setQuality({
      samples: p.samples,
      renderScale: Math.max(p.minScale, p.renderScale * this.dynamicScale),
      bloomLevels: p.bloomLevels,
      blurTaps: p.blurTaps,
      anamorphic: p.anamorphic,
      reflections: p.reflections,
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioCap);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.width = w;
    this.height = h;
    this.aspect = w / h;
    this._applyPost();
    this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
    if (this.onResize) this.onResize(w, h);
  }

  /**
   * Feed each frame's real duration and how long the game's own work took on the main thread
   * (update + draw submission, seconds). Holds the frame rate: while the GPU is the limit it lowers
   * the render resolution; once that's at its floor - or when the main thread is the limit, where
   * resolution can't help - it steps the preset down (the renderer at once, cars, decor and
   * particles from the next race). Frames from a hidden or throttled window are ignored.
   */
  trackFrame(dt, now, work = 0) {
    if (!this.autoQuality) return;
    // a frame far longer than a slow device's is a hitch or a throttled / background window
    if (dt > 0.1 || document.hidden) {
      this._frameTimes.length = 0;
      this._workTimes.length = 0;
      return;
    }
    const ft = this._frameTimes;
    const wt = this._workTimes;
    ft.push(dt);
    wt.push(work);
    if (ft.length > 90) {
      ft.shift();
      wt.shift();
    }
    // look at most once a second, and give a change 2 s to settle
    if (now - this._lastAdjust < 2000 || now - this._lastCheck < 1000 || ft.length < 60) return;
    this._lastCheck = now;
    const median = medianOf(ft);
    const cpuBound = medianOf(wt) > median * 0.7;
    const prev = this.dynamicScale;
    const prevPreset = this.presetName;
    if (median > 1 / 48) {
      if (!cpuBound && this.dynamicScale > 0.6) this.dynamicScale = Math.max(0.6, this.dynamicScale - 0.1);
      else if (this.presetName !== 'low') {
        const scale = this.dynamicScale;
        this.setQuality(STEPS[STEPS.indexOf(this.presetName) + 1], true);
        this.dynamicScale = scale;
      } else if (!cpuBound) this.dynamicScale = Math.max(0.6, this.dynamicScale - 0.1);
    } else if (median < 1 / 58 && this.dynamicScale < 1) this.dynamicScale = Math.min(1, this.dynamicScale + 0.05);
    if (prev !== this.dynamicScale || prevPreset !== this.presetName) {
      this._lastAdjust = now;
      this._frameTimes.length = 0;
      this._workTimes.length = 0;
      this._applyPost();
      if (prevPreset !== this.presetName) this.onQualityStep?.(this.presetName);
    }
  }

  render(scene, camera, fx, time) {
    this.post.render(scene, camera, fx, time);
  }
}
