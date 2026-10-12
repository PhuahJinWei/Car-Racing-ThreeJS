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
    droplets: false,
    particles: 0.5,
    decorDensity: 0.6,
    cones: false,
    carHQ: false,
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
    droplets: true,
    particles: 0.75,
    decorDensity: 0.85,
    cones: true,
    carHQ: true,
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
    droplets: true,
    particles: 1,
    decorDensity: 1,
    cones: true,
    carHQ: true,
    liveryRes: 2048,
  },
};

export function detectDefaultQuality() {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const small = Math.min(screen.width, screen.height) < 820;
  if (touch && small) return 'medium';
  if (touch) return 'medium';
  return 'high';
}

/**
 * Owns the WebGL renderer + post-processing and handles resizing and dynamic resolution.
 */
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
    this._lastAdjust = 0;
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
      droplets: p.droplets,
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

  /** Feed real frame durations (seconds); adapts render scale to hold the frame rate. */
  trackFrame(dt, now) {
    if (!this.autoQuality) return;
    const ft = this._frameTimes;
    ft.push(dt);
    if (ft.length > 90) ft.shift();
    if (now - this._lastAdjust < 2000 || ft.length < 60) return;
    const sorted = [...ft].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const prev = this.dynamicScale;
    if (median > 1 / 48) this.dynamicScale = Math.max(0.6, this.dynamicScale - 0.1);
    else if (median < 1 / 58 && this.dynamicScale < 1) this.dynamicScale = Math.min(1, this.dynamicScale + 0.05);
    if (prev !== this.dynamicScale) {
      this._lastAdjust = now;
      this._frameTimes = [];
      this._applyPost();
    }
  }

  render(scene, camera, fx, time) {
    this.post.render(scene, camera, fx, time);
  }
}
