import * as THREE from 'three';

// Custom, mobile-friendly post-processing pipeline:
//   scene -> HDR target (alpha channel = 1 - road reflectivity)
//   bloom: threshold + dual-filter down/up chain
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
uniform sampler2D tBloomMid;
uniform sampler2D tBloomSmall;
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
uniform float uDroplets;
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

  #ifdef DROPLETS
  if (uDroplets > 0.0) {
    // Cheap rain-on-lens: drifting refraction blobs
    vec2 g = uv * vec2(uAspect, 1.0) * 9.0;
    g.y += uTime * 0.35;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float r = hash12(cell);
    vec2 off = vec2(hash12(cell + 7.1), hash12(cell + 3.7)) - 0.5;
    vec2 d = f - off * 0.6;
    float rad = 0.12 + 0.18 * r;
    float m = smoothstep(rad, rad * 0.6, length(d)) * step(0.55, r);
    uv += d * m * 0.06 * uDroplets;
  }
  #endif

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
    vec3 r = vec3(0.0);
    float j = noise * 0.012;
    // Short upward streaks: lights sitting just above this road pixel (tail lights, lamps, wall strips)
    r += texture2D(tBloomMid, uv + vec2(0.0, 0.012 + j)).rgb * 1.0;
    r += texture2D(tBloomMid, uv + vec2(0.0, 0.032 + j)).rgb * 0.8;
    r += texture2D(tBloomMid, uv + vec2(0.0, 0.060 + j)).rgb * 0.55;
    r += texture2D(tBloomMid, uv + vec2(0.0, 0.095 + j)).rgb * 0.35;
    // Mirror about the horizon: distant / overhead lights
    float my = 2.0 * uHorizon - uv.y;
    float mw = smoothstep(1.0, 0.8, my);
    if (mw > 0.0) {
      r += texture2D(tBloomMid, vec2(uv.x, my + j)).rgb * 0.9 * mw;
      r += texture2D(tBloomMid, vec2(uv.x, my + 0.03 + j)).rgb * 0.5 * mw;
    }
    float fres = mix(0.45, 1.25, smoothstep(0.45, 0.0, abs(uHorizon - uv.y)));
    col += r * reflMask * uReflect * fres;
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
  horizon: 0.55,
  anamorphic: 0.0,
  anamorphicColor: [0.75, 0.82, 1.0],
  grain: 0.02,
  desat: 0,
  droplets: 0,
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
      droplets: true,
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

    this.sceneRT = null;
    this.mips = [];
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
    if (q.droplets) defines += '#define DROPLETS\n';
    const old = this.compositeMat;
    this.compositeMat = this._mat(compositeFrag(defines), {
      tScene: { value: null },
      tBloom: { value: null },
      tBloomMid: { value: null },
      tBloomSmall: { value: null },
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
      uDroplets: { value: 0 },
    });
    if (old) old.dispose();
  }

  setQuality(q) {
    const prev = this.quality;
    this.quality = { ...prev, ...q };
    const n = this.quality;
    if (n.blurTaps !== prev.blurTaps || n.anamorphic !== prev.anamorphic || n.reflections !== prev.reflections || n.droplets !== prev.droplets) {
      this._buildComposite();
    }
    if (n.samples !== prev.samples || n.bloomLevels !== prev.bloomLevels || n.renderScale !== prev.renderScale || !this.sceneRT) {
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
    let mw = sw;
    let mh = sh;
    for (let i = 0; i < q.bloomLevels; i++) {
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
      this.mips.push(
        new THREE.WebGLRenderTarget(mw, mh, {
          type: this.texType,
          format: THREE.RGBAFormat,
          depthBuffer: false,
          stencilBuffer: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          generateMipmaps: false,
        }),
      );
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

    // 3. composite to screen
    const c = this.compositeMat.uniforms;
    c.tScene.value = this.sceneRT.texture;
    c.tBloom.value = mips[0].texture;
    c.tBloomMid.value = mips[Math.min(1, mips.length - 1)].texture;
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
    c.uDroplets.value = p.droplets;
    this.quad.material = this.compositeMat;
    r.setRenderTarget(null);
    r.clear(true, true, false);
    r.render(this.quadScene, this.quadCam);

    r.autoClear = prevAutoClear;
  }

  dispose() {
    if (this.sceneRT) this.sceneRT.dispose();
    for (const m of this.mips) m.dispose();
    this.prefilterMat.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.compositeMat.dispose();
  }
}
