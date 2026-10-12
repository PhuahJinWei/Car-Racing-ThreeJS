import * as THREE from 'three';

// Custom, mobile-friendly post-processing pipeline:
//   scene -> HDR target (alpha channel = 1 - road reflectivity)
//   bloom: threshold + dual-filter down/up chain
//   reflections (quarter size): what stands above the road, smeared upward into streaks of
//              three lengths, and for every column the foot of the first thing above the road
//   composite: radial speed blur + spectral chromatic aberration + screen-space wet reflections
//              + bloom + anamorphic streaks + grading + ACES tone map + speed lines + vignette + grain

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const PREFILTER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
  vec4 o = uTexel.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);
  vec3 c = texture2D(tInput, vUv + o.xy).rgb + texture2D(tInput, vUv + o.zy).rgb
         + texture2D(tInput, vUv + o.xw).rgb + texture2D(tInput, vUv + o.zw).rgb;
  c *= 0.25;
  // guard against NaN / Inf from any shader - one bad pixel would bloom into a white blob
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = clamp(c, vec3(0.0), vec3(48.0));
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * contrib, 1.0);
}`;

// What the wet road can mirror, straight from the scene to quarter size: everything standing
// above it (an 8 x 4 block, softened sideways), the dimmest left out so the road stays dark.
// The road itself (alpha < 1: it is reflective) never reflects itself. Alpha: how much of the
// texel's own 4 x 4 block is not road.
const REFL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uLo;
uniform float uHi;
varying vec2 vUv;
vec4 tap(float x, float y) {
  vec4 s = texture2D(tInput, vUv + uTexel * vec2(x, y));
  float solid = smoothstep(0.9, 0.99, s.a);
  return vec4(s.rgb * solid, solid);
}
void main() {
  vec4 inner = tap(-1.0, -1.0) + tap(1.0, -1.0) + tap(-1.0, 1.0) + tap(1.0, 1.0);
  vec4 outer = tap(-3.0, -1.0) + tap(3.0, -1.0) + tap(-3.0, 1.0) + tap(3.0, 1.0);
  vec3 c = (inner.rgb + outer.rgb) * 0.125;
  float solid = inner.a * 0.25;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = clamp(c, vec3(0.0), vec3(24.0));
  float br = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uLo, uHi, br), solid);
}`;

// Where the first thing standing above the road is, per column. R: v of the nearest texel at
// or above this one that is not road; G: its foot, placed inside the texels by how much of
// them is road. Start: look 8 texels up (else point 8 up); then each pass follows the pointer
// four times, so the reach grows 4x a pass, until it lands on something or leaves the screen.
const BASE_INIT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform float uStep;
varying vec2 vUv;
void main() {
  float s[9];
  for (int k = 0; k < 9; k++) s[k] = texture2D(tInput, vec2(vUv.x, vUv.y + float(k - 1) * uStep)).a;
  vec2 b = vec2(vUv.y + 8.0 * uStep);
  for (int k = 7; k >= 0; k--) {
    if (s[k + 1] > 0.5) {
      float y = vUv.y + float(k) * uStep;
      float below = s[k] > 0.5 ? 0.0 : s[k];
      b = vec2(y, y + (0.5 - s[k + 1] - below) * uStep);
    }
  }
  gl_FragColor = vec4(b, 0.0, 1.0);
}`;

const BASE_JUMP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
varying vec2 vUv;
void main() {
  vec4 b = texture2D(tInput, vUv);
  for (int k = 0; k < 3; k++) {
    if (b.r < 1.0) b = texture2D(tInput, vec2(vUv.x, b.r));
  }
  gl_FragColor = b;
}`;

// One-sided vertical box: the average of the input over [y, y + 4 steps). Three passes with
// steps of 1, 4 and 16 texels give streaks 4, 16 and 64 texels long, reaching only upward.
const STREAK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform float uStep;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tInput, vUv).rgb;
  s += texture2D(tInput, vUv + vec2(0.0, uStep)).rgb;
  s += texture2D(tInput, vUv + vec2(0.0, 2.0 * uStep)).rgb;
  s += texture2D(tInput, vUv + vec2(0.0, 3.0 * uStep)).rgb;
  gl_FragColor = vec4(s * 0.25, 1.0);
}`;

const DOWN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 h = uTexel;
  vec3 s = texture2D(tInput, vUv).rgb * 4.0;
  s += texture2D(tInput, vUv + vec2(-h.x, -h.y)).rgb;
  s += texture2D(tInput, vUv + vec2( h.x, -h.y)).rgb;
  s += texture2D(tInput, vUv + vec2(-h.x,  h.y)).rgb;
  s += texture2D(tInput, vUv + vec2( h.x,  h.y)).rgb;
  gl_FragColor = vec4(s * 0.125, 1.0);
}`;

const UP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 h = uTexel;
  vec3 s = texture2D(tInput, vUv + vec2(-2.0 * h.x, 0.0)).rgb;
  s += texture2D(tInput, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  s += texture2D(tInput, vUv + vec2(0.0, 2.0 * h.y)).rgb;
  s += texture2D(tInput, vUv + vec2(h.x, h.y)).rgb * 2.0;
  s += texture2D(tInput, vUv + vec2(2.0 * h.x, 0.0)).rgb;
  s += texture2D(tInput, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  s += texture2D(tInput, vUv + vec2(0.0, -2.0 * h.y)).rgb;
  s += texture2D(tInput, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(s * (uWeight / 12.0), 1.0);
}`;

function compositeFrag(defines) {
  return /* glsl */ `
precision highp float;
${defines}
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tBloomSmall;
uniform sampler2D tRefl1;
uniform sampler2D tRefl2;
uniform sampler2D tRefl3;
uniform sampler2D tBase;
uniform float uBaseW;
uniform vec3 uReflLen;
uniform float uReflGain;
uniform float uReflBlur;
uniform float uTime;
uniform float uAspect;
uniform vec2 uCenter;
uniform float uBlur;
uniform float uCA;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform float uSpeedLines;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uTint;
uniform vec3 uLift;
uniform float uReflect;
uniform float uHorizon;
uniform float uAnamorphic;
uniform vec3 uAnamorphicColor;
uniform float uGrain;
uniform float uDesat;
varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;

  vec2 dir = uv - uCenter;
  vec2 dirA = dir * vec2(uAspect, 1.0);
  float dist = length(dirA);
  float noise = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0);

  vec4 center = texture2D(tScene, uv);
  if (any(isnan(center)) || any(isinf(center))) center = vec4(0.0, 0.0, 0.0, 1.0);
  vec3 col = center.rgb;

  float blurAmt = uBlur * smoothstep(0.06, 0.8, dist);
  float caAmt = uCA * dist;
  #if BLUR_TAPS > 1
  if (blurAmt + caAmt > 0.0006) {
    vec3 acc = vec3(0.0);
    vec3 wsum = vec3(0.0);
    for (int i = 0; i < BLUR_TAPS; i++) {
      float t = (float(i) + noise) / float(BLUR_TAPS);
      vec2 suv = uv - dir * (blurAmt * t + caAmt * (t - 0.5));
      vec3 w = vec3(clamp(1.5 - 2.0 * t, 0.0, 1.0), 1.0 - abs(2.0 * t - 1.0) * 0.8, clamp(2.0 * t - 0.5, 0.0, 1.0));
      w = mix(vec3(1.0), w, clamp(caAmt * 40.0, 0.0, 1.0));
      acc += texture2D(tScene, suv).rgb * w;
      wsum += w;
    }
    col = acc / max(wsum, vec3(1e-4));
    if (any(isnan(col)) || any(isinf(col))) col = center.rgb;
  }
  #endif

  #ifdef REFLECTIONS
  float reflMask = clamp(1.0 - center.a, 0.0, 1.0);
  if (reflMask > 0.01 && uReflect > 0.0) {
    // Seen in a flat road, anything standing upright on it is mirrored about its foot - on
    // screen too: a point the road pixel at v reflects shows at 2 * foot - v. So find the foot
    // of the first thing above this pixel, look at its mirror point, and blur that upward and
    // downward the more the further it is: wet asphalt stretches reflections into streaks.
    // Between two quarter-size columns the feet blend along a sloping edge (a kerb, a
    // barrier); where they belong to different things the nearer column wins.
    float bx = uv.x * uBaseW - 0.5;
    float b0 = floor(bx);
    float bt = bx - b0;
    float fa = texture2D(tBase, vec2((b0 + 0.5) / uBaseW, uv.y)).g;
    float fb = texture2D(tBase, vec2((b0 + 1.5) / uBaseW, uv.y)).g;
    float foot = abs(fa - fb) < 0.03 ? mix(fa, fb, bt) : (bt < 0.5 ? fa : fb);
    float my = 2.0 * foot - uv.y;
    float L = max(uReflLen.x, (my - uv.y) * uReflBlur);
    vec2 p = vec2(uv.x, my - 0.5 * L);
    float a12 = clamp((L - uReflLen.x) / (uReflLen.y - uReflLen.x), 0.0, 1.0);
    float a23 = clamp((L - uReflLen.y) / (uReflLen.z - uReflLen.y), 0.0, 1.0);
    vec3 r = L < uReflLen.y ? mix(texture2D(tRefl1, p).rgb, texture2D(tRefl2, p).rgb, a12)
                            : mix(texture2D(tRefl2, p).rgb, texture2D(tRefl3, p).rgb, a23);
    // nothing to mirror once the mirror point leaves the top of the screen
    r *= 1.0 - smoothstep(0.92, 1.0, my - 0.25 * L);
    float fres = mix(0.45, 1.25, smoothstep(0.45, 0.0, abs(uHorizon - uv.y)));
    col += r * uReflGain * reflMask * uReflect * fres;
  }
  #endif

  col += texture2D(tBloom, uv).rgb * uBloomStrength;

  #ifdef ANAMORPHIC
  vec3 an = vec3(0.0);
  for (int i = -3; i <= 3; i++) {
    float fi = float(i);
    an += texture2D(tBloomSmall, vec2(uv.x + fi * 0.045, uv.y)).rgb * (1.0 - abs(fi) * 0.22);
  }
  col += an * uAnamorphic * uAnamorphicColor * 0.25;
  #endif

  col *= uExposure * uTint;
  col = aces(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation * (1.0 - uDesat));
  col = max((col - 0.5) * uContrast + 0.5, 0.0);
  col += uLift * (1.0 - col);

  if (uSpeedLines > 0.001) {
    float ang = atan(dirA.y, dirA.x) / 6.28318 + 0.5;
    float seg = ang * 180.0;
    float id = floor(seg);
    float fr = fract(seg);
    float rnd = hash11(id + floor(uTime * 14.0) * 17.13);
    float w = 0.12 + 0.3 * hash11(id * 3.17);
    float ln = smoothstep(w, 0.0, abs(fr - 0.5)) * step(0.7, rnd);
    float radial = smoothstep(0.42 + 0.3 * rnd, 1.05, dist);
    col += ln * radial * uSpeedLines * vec3(0.8, 0.92, 1.0);
  }

  col *= 1.0 - uVignette * smoothstep(0.3, 1.15, dist);
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));

  col = toSRGB(col);
  col += (noise - 0.5) * (uGrain + 0.004);
  gl_FragColor = vec4(col, 1.0);
}`;
}

export const DEFAULT_FX = () => ({
  bloomStrength: 0.34,
  bloomThreshold: 1.5,
  bloomKnee: 0.7,
  exposure: 1.0,
  blur: 0,
  center: [0.5, 0.55],
  ca: 0,
  vignette: 0.36,
  speedLines: 0,
  flash: 0,
  flashColor: [1, 1, 1],
  saturation: 1.0,
  contrast: 1.08,
  tint: [1, 1, 1],
  lift: [0.0, 0.0, 0.0],
  reflect: 0,
  // what the road mirrors fades in between these brightnesses (so the dimmest walls leave it
  // dark); gain: mirror strength; blur: how far a reflection streaks per unit of height
  reflectLo: 0.08,
  reflectHi: 0.5,
  reflectGain: 1,
  reflectBlur: 0.35,
  horizon: 0.55,
  anamorphic: 0.0,
  anamorphicColor: [0.75, 0.82, 1.0],
  grain: 0.02,
  desat: 0,
});

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.width = 1;
    this.height = 1;
    this.quality = {
      samples: 4,
      renderScale: 1,
      bloomLevels: 5,
      blurTaps: 8,
      anamorphic: true,
      reflections: true,
    };
    const gl = renderer.getContext();
    const ext = renderer.extensions;
    this.hdr = !!(ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.texType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(tri, null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.prefilterMat = this._mat(PREFILTER_FRAG, {
      tInput: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1 },
      uKnee: { value: 0.5 },
    });
    this.downMat = this._mat(DOWN_FRAG, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = this._mat(UP_FRAG, {
      tInput: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uWeight: { value: 1 },
    });
    this.upMat.blending = THREE.CustomBlending;
    this.upMat.blendEquation = THREE.AddEquation;
    this.upMat.blendSrc = THREE.OneFactor;
    this.upMat.blendDst = THREE.OneFactor;
    this.reflMat = this._mat(REFL_FRAG, {
      tInput: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uLo: { value: 0.08 },
      uHi: { value: 0.5 },
    });
    this.streakMat = this._mat(STREAK_FRAG, { tInput: { value: null }, uStep: { value: 0 } });
    this.baseInitMat = this._mat(BASE_INIT_FRAG, { tInput: { value: null }, uStep: { value: 0 } });
    this.baseJumpMat = this._mat(BASE_JUMP_FRAG, { tInput: { value: null } });

    this.sceneRT = null;
    this.mips = [];
    // reflection source, then its 4-, 16- and 64-texel upward streaks (quarter size), and two
    // buffers to find the foot of what stands above the road in
    this.refl = [];
    this.base = [];
    this.compositeMat = null;
    this._buildComposite();
  }

  _mat(frag, uniforms) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: frag,
      uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }

  _buildComposite() {
    const q = this.quality;
    let defines = `#define BLUR_TAPS ${q.blurTaps}\n`;
    if (q.anamorphic) defines += '#define ANAMORPHIC\n';
    if (q.reflections) defines += '#define REFLECTIONS\n';
    const old = this.compositeMat;
    this.compositeMat = this._mat(compositeFrag(defines), {
      tScene: { value: null },
      tBloom: { value: null },
      tBloomSmall: { value: null },
      tRefl1: { value: null },
      tRefl2: { value: null },
      tRefl3: { value: null },
      tBase: { value: null },
      uBaseW: { value: 1 },
      uReflLen: { value: new THREE.Vector3(0.02, 0.08, 0.32) },
      uReflGain: { value: 1 },
      uReflBlur: { value: 0.35 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uBlur: { value: 0 },
      uCA: { value: 0 },
      uBloomStrength: { value: 0.8 },
      uExposure: { value: 1 },
      uVignette: { value: 0.4 },
      uSpeedLines: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uSaturation: { value: 1 },
      uContrast: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uLift: { value: new THREE.Color(0, 0, 0) },
      uReflect: { value: 0 },
      uHorizon: { value: 0.55 },
      uAnamorphic: { value: 0 },
      uAnamorphicColor: { value: new THREE.Color(0.45, 0.65, 1.4) },
      uGrain: { value: 0.02 },
      uDesat: { value: 0 },
    });
    if (old) old.dispose();
  }

  setQuality(q) {
    const prev = this.quality;
    this.quality = { ...prev, ...q };
    const n = this.quality;
    if (n.blurTaps !== prev.blurTaps || n.anamorphic !== prev.anamorphic || n.reflections !== prev.reflections) {
      this._buildComposite();
    }
    if (n.samples !== prev.samples || n.bloomLevels !== prev.bloomLevels || n.renderScale !== prev.renderScale || n.reflections !== prev.reflections || !this.sceneRT) {
      this._allocTargets();
    }
  }

  setSize(w, h) {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    this._allocTargets();
  }

  _allocTargets() {
    const q = this.quality;
    const sw = Math.max(1, Math.round(this.width * q.renderScale));
    const sh = Math.max(1, Math.round(this.height * q.renderScale));
    const samples = this.isWebGL2 ? q.samples : 0;
    if (this.sceneRT) this.sceneRT.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(sw, sh, {
      type: this.texType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
      samples,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    for (const m of this.mips) m.dispose();
    this.mips = [];
    const target = (w, h, filter = THREE.LinearFilter, type = this.texType) =>
      new THREE.WebGLRenderTarget(w, h, {
        type,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: filter,
        magFilter: filter,
        generateMipmaps: false,
      });
    let mw = sw;
    let mh = sh;
    for (let i = 0; i < q.bloomLevels; i++) {
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
      this.mips.push(target(mw, mh));
    }
    for (const t of [...this.refl, ...this.base]) t.dispose();
    this.refl = [];
    this.base = [];
    if (q.reflections) {
      const rw = Math.max(1, Math.floor(sw / 4));
      const rh = Math.max(1, Math.floor(sh / 4));
      for (let i = 0; i < 4; i++) this.refl.push(target(rw, rh));
      // screen heights, read back exactly (nearest), in half float where the GPU can render it
      for (let i = 0; i < 2; i++) this.base.push(target(rw, rh, THREE.NearestFilter));
    }
  }

  _pass(mat, target, clear = true) {
    const r = this.renderer;
    this.quad.material = mat;
    r.setRenderTarget(target);
    if (clear) r.clear(true, false, false);
    r.render(this.quadScene, this.quadCam);
  }

  render(scene, camera, p, time) {
    const r = this.renderer;
    if (!this.sceneRT) this._allocTargets();
    const prevAutoClear = r.autoClear;
    r.autoClear = false;

    // 1. scene
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, false);
    r.render(scene, camera);

    // 2. bloom chain
    const mips = this.mips;
    const pf = this.prefilterMat.uniforms;
    pf.tInput.value = this.sceneRT.texture;
    pf.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
    pf.uThreshold.value = this.hdr ? p.bloomThreshold : Math.min(0.75, p.bloomThreshold * 0.7);
    pf.uKnee.value = p.bloomKnee;
    this._pass(this.prefilterMat, mips[0]);
    const du = this.downMat.uniforms;
    for (let i = 1; i < mips.length; i++) {
      du.tInput.value = mips[i - 1].texture;
      du.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
      this._pass(this.downMat, mips[i]);
    }
    const uu = this.upMat.uniforms;
    for (let i = mips.length - 1; i > 0; i--) {
      uu.tInput.value = mips[i].texture;
      uu.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
      uu.uWeight.value = 1.0;
      this._pass(this.upMat, mips[i - 1], false);
    }

    // 3. what the wet road reflects: the things above it, smeared upward, and where they stand
    const refl = this.refl;
    const c = this.compositeMat.uniforms;
    if (refl.length && p.reflect > 0) {
      const rf = this.reflMat.uniforms;
      rf.tInput.value = this.sceneRT.texture;
      rf.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      rf.uLo.value = this.hdr ? p.reflectLo : Math.min(0.3, p.reflectLo);
      rf.uHi.value = this.hdr ? p.reflectHi : Math.min(0.8, p.reflectHi);
      this._pass(this.reflMat, refl[0]);
      const su = this.streakMat.uniforms;
      const h = refl[0].height;
      for (let i = 1; i < 4; i++) {
        su.tInput.value = refl[i - 1].texture;
        su.uStep.value = 4 ** (i - 1) / h;
        this._pass(this.streakMat, refl[i]);
      }
      c.uReflLen.value.set(4 / h, 16 / h, 64 / h);
      // the foot of what stands above the road: look 8 texels up, then jump until done
      const base = this.base;
      const bi = this.baseInitMat.uniforms;
      bi.tInput.value = refl[0].texture;
      bi.uStep.value = 1 / h;
      this._pass(this.baseInitMat, base[0]);
      const bj = this.baseJumpMat.uniforms;
      let k = 0;
      for (let reach = 8; reach < h; reach *= 4, k ^= 1) {
        bj.tInput.value = base[k].texture;
        this._pass(this.baseJumpMat, base[k ^ 1]);
      }
      c.tBase.value = base[k].texture;
      c.uBaseW.value = base[k].width;
    }
    c.tRefl1.value = refl[1]?.texture ?? null;
    c.tRefl2.value = refl[2]?.texture ?? null;
    c.tRefl3.value = refl[3]?.texture ?? null;
    c.uReflGain.value = p.reflectGain;
    c.uReflBlur.value = p.reflectBlur;

    // 4. composite to screen
    c.tScene.value = this.sceneRT.texture;
    c.tBloom.value = mips[0].texture;
    c.tBloomSmall.value = mips[Math.min(3, mips.length - 1)].texture;
    c.uTime.value = time;
    c.uAspect.value = this.width / this.height;
    c.uCenter.value.set(p.center[0], p.center[1]);
    c.uBlur.value = p.blur;
    c.uCA.value = p.ca;
    c.uBloomStrength.value = p.bloomStrength;
    c.uExposure.value = p.exposure;
    c.uVignette.value = p.vignette;
    c.uSpeedLines.value = p.speedLines;
    c.uFlash.value = p.flash;
    c.uFlashColor.value.setRGB(p.flashColor[0], p.flashColor[1], p.flashColor[2]);
    c.uSaturation.value = p.saturation;
    c.uContrast.value = p.contrast;
    c.uTint.value.setRGB(p.tint[0], p.tint[1], p.tint[2]);
    c.uLift.value.setRGB(p.lift[0], p.lift[1], p.lift[2]);
    c.uReflect.value = p.reflect;
    c.uHorizon.value = p.horizon;
    c.uAnamorphic.value = p.anamorphic;
    c.uAnamorphicColor.value.setRGB(p.anamorphicColor[0], p.anamorphicColor[1], p.anamorphicColor[2]);
    c.uGrain.value = p.grain;
    c.uDesat.value = p.desat;
    this.quad.material = this.compositeMat;
    r.setRenderTarget(null);
    r.clear(true, true, false);
    r.render(this.quadScene, this.quadCam);

    r.autoClear = prevAutoClear;
  }

  dispose() {
    if (this.sceneRT) this.sceneRT.dispose();
    for (const m of this.mips) m.dispose();
    for (const t of [...this.refl, ...this.base]) t.dispose();
    this.prefilterMat.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.reflMat.dispose();
    this.streakMat.dispose();
    this.baseInitMat.dispose();
    this.baseJumpMat.dispose();
    this.compositeMat.dispose();
  }
}
