import * as THREE from 'three';

/** How many cars' headlights light the world at once (the player and the rivals nearest the camera). */
export const MAX_HEADLIGHTS = 4;

// Shared uniforms: every custom material references these objects, so updating them once
// per frame updates the whole world.
export const globalUniforms = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0x0b0518) },
  uFogDensity: { value: 0.003 },
  uWet: { value: 0 },
  uAmbient: { value: new THREE.Color(0x202040) },
  uSkyGlow: { value: new THREE.Color(0xff3fb4) },
  // headlights: lamp-pair centre, forward and up of each car, (power, range m, half spacing of
  // the two lamps, -) - power 0 switches a slot off. Set every frame by the race.
  uHeadPos: { value: Array.from({ length: MAX_HEADLIGHTS }, () => new THREE.Vector3()) },
  uHeadFwd: { value: Array.from({ length: MAX_HEADLIGHTS }, () => new THREE.Vector3(0, 0, 1)) },
  uHeadUp: { value: Array.from({ length: MAX_HEADLIGHTS }, () => new THREE.Vector3(0, 1, 0)) },
  uHeadParams: { value: Array.from({ length: MAX_HEADLIGHTS }, () => new THREE.Vector4()) },
  uHeadColor: { value: new THREE.Color(0.93, 0.96, 1.0) },
};

export function hdr(hex, intensity = 1) {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(intensity);
}

/** Additive blending that leaves the destination alpha (reflection mask) untouched. */
export function additive(mat) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.SrcAlphaFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendEquationAlpha = THREE.AddEquation;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}

/** Normal alpha blending that leaves destination alpha untouched. */
export function alphaBlend(mat) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.SrcAlphaFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendEquationAlpha = THREE.AddEquation;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}

const NOISE_GLSL = /* glsl */ `
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
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

// Low-beam headlights: a wide beam from each pair of lamps with a cut-off line just under the
// horizon (light pools on the road, a bright band low on the walls), fading with distance.
// road = 1 for asphalt, which scatters light back toward the cars even at grazing angles;
// other surfaces have to face the lamps.
const HEADLIGHTS_GLSL = /* glsl */ `
#define MAX_HEAD ${MAX_HEADLIGHTS}
uniform vec3 uHeadPos[MAX_HEAD];
uniform vec3 uHeadFwd[MAX_HEAD];
uniform vec3 uHeadUp[MAX_HEAD];
uniform vec4 uHeadParams[MAX_HEAD];
uniform vec3 uHeadColor;
vec3 headlights(vec3 P, vec3 N, float road) {
  float sum = 0.0;
  for (int i = 0; i < MAX_HEAD; i++) {
    vec4 hp = uHeadParams[i];
    if (hp.x <= 0.0) continue;
    vec3 d = P - uHeadPos[i];
    float ahead = dot(d, uHeadFwd[i]);
    if (ahead < 0.5) continue;
    float rise = dot(d, uHeadUp[i]);
    float side = length(d - uHeadFwd[i] * ahead - uHeadUp[i] * rise);
    float spread = max(side - hp.z, 0.0) / (ahead + 2.0);
    float beam = (1.0 - smoothstep(0.27, 0.43, spread)) * (0.4 + 0.6 * (1.0 - smoothstep(0.0, 0.27, spread)));
    float cut = -0.012 * ahead;
    beam *= mix(0.06, 1.0, 1.0 - smoothstep(cut - 0.05, cut + 0.1, rise));
    float dist = length(d);
    float fall = smoothstep(1.5, 7.0, ahead) / (1.0 + dist * dist * (1.0 / 144.0));
    fall *= 1.0 - smoothstep(hp.y * 0.5, hp.y, dist);
    float ndl = max(dot(N, -d / dist), 0.0);
    float face = road > 0.5 ? 0.35 + 0.65 * sqrt(ndl) : ndl;
    sum += hp.x * beam * fall * face;
  }
  return sum * uHeadColor;
}
`;

const FOG_PARS_FRAG = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
varying float vFogDepth;
float fogFactor(float densityScale) {
  float d = uFogDensity * densityScale * vFogDepth;
  return 1.0 - exp(-d * d);
}
`;

// ---------------------------------------------------------------------------------------
// Road
// ---------------------------------------------------------------------------------------
export function createRoadMaterial(opts) {
  const uniforms = {
    ...globalUniforms,
    uHalfWidth: { value: opts.halfWidth },
    uLength: { value: opts.length },
    uLanes: { value: opts.lanes ?? 3 },
    uEdgeColor: { value: new THREE.Color(opts.edgeColor ?? 0xffffff) },
    uEdgeGlow: { value: opts.edgeGlow ?? 0.0 },
    uLaneColor: { value: new THREE.Color(opts.laneColor ?? 0xffffff) },
    uLaneGlow: { value: opts.laneGlow ?? 0.0 },
    uCenterColor: { value: new THREE.Color(opts.centerColor ?? 0xffc23d) },
    uCenterLine: { value: opts.centerLine ? 1 : 0 },
    uCurbColor: { value: new THREE.Color(opts.curbColor ?? 0xff2a2a) },
    uGrid: { value: opts.grid ? 1 : 0 },
    uSheen: { value: new THREE.Color(opts.sheen ?? 0x301050) },
    uBrightness: { value: opts.brightness ?? 6.0 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aLight;
      attribute float aCurb;
      varying vec2 vUv;
      varying vec3 vLight;
      varying float vCurb;
      varying float vFogDepth;
      varying vec3 vWorld;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vLight = aLight;
        vCurb = aCurb;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vViewDir = normalize(cameraPosition - wp.xyz);
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uWet;
      uniform vec3 uAmbient;
      uniform float uHalfWidth;
      uniform float uLength;
      uniform float uLanes;
      uniform vec3 uEdgeColor;
      uniform float uEdgeGlow;
      uniform vec3 uLaneColor;
      uniform float uLaneGlow;
      uniform vec3 uCenterColor;
      uniform float uCenterLine;
      uniform vec3 uCurbColor;
      uniform float uGrid;
      uniform vec3 uSheen;
      uniform float uBrightness;
      varying vec2 vUv;
      varying vec3 vLight;
      varying float vCurb;
      varying vec3 vWorld;
      varying vec3 vViewDir;
      ${NOISE_GLSL}
      ${FOG_PARS_FRAG}
      ${HEADLIGHTS_GLSL}

      float band(float x, float center, float halfW, float aa) {
        return 1.0 - smoothstep(halfW - aa, halfW + aa, abs(x - center));
      }

      void main() {
        float W = uHalfWidth;
        float lat = (vUv.x - 0.5) * 2.0 * W;
        float s = vUv.y;
        float aaL = fwidth(lat) * 0.75 + 0.002;
        float aaS = fwidth(s) * 0.75 + 0.002;
        float distFade = clamp(1.0 - vFogDepth / 420.0, 0.0, 1.0);

        // Asphalt
        float n1 = vnoise(vWorld.xz * 1.9);
        float n2 = vnoise(vWorld.xz * 0.21);
        float grain = hash12(floor(vWorld.xz * 23.0));
        vec3 albedo = vec3(0.06, 0.062, 0.075) * (0.78 + 0.3 * n1 + 0.18 * grain * distFade) * (0.85 + 0.3 * n2);
        // rubbered racing line
        albedo *= 1.0 - 0.18 * band(lat, 0.0, W * 0.45, W * 0.3);

        float mark = 0.0;
        vec3 markCol = vec3(0.0);
        float glow = 0.0;

        // Edge lines
        float e = band(abs(lat), W - 0.55, 0.16, aaL);
        mark = max(mark, e);
        markCol += uEdgeColor * e;
        glow += uEdgeGlow * e;

        // Lane dashes
        float laneW = 2.0 * W / uLanes;
        float dashOn = step(fract(s / 14.0), 0.45);
        for (int k = 1; k < 4; k++) {
          if (float(k) >= uLanes) break;
          float x = -W + laneW * float(k);
          if (uCenterLine > 0.5 && abs(x) < 0.01) continue;
          float l = band(lat, x, 0.09, aaL) * dashOn;
          mark = max(mark, l);
          markCol += uLaneColor * l;
          glow += uLaneGlow * l;
        }
        // Double centre line
        if (uCenterLine > 0.5) {
          float c = band(lat, -0.22, 0.08, aaL) + band(lat, 0.22, 0.08, aaL);
          mark = max(mark, c);
          markCol += uCenterColor * c;
          glow += 0.25 * c;
        }

        // Start / finish checker (s in [0, 4])
        float sw = s;
        if (sw > uLength * 0.5) sw -= uLength;
        if (sw > -0.01 && sw < 4.0 && abs(lat) < W) {
          vec2 cell = floor(vec2(lat, sw) / 1.0);
          float chk = mod(cell.x + cell.y, 2.0);
          mark = max(mark, 1.0);
          markCol = mix(vec3(0.03), vec3(1.0), chk);
          glow += chk * 0.3;
        }
        // Grid slots behind the line
        if (uGrid > 0.5 && sw < -8.0 && sw > -66.0) {
          float k = (-sw - 8.0) / 9.0;
          float fk = fract(k);
          float slotSide = mod(floor(k), 2.0) * 2.0 - 1.0;
          float bar = band(fk * 9.0, 0.0, 0.12, aaS * 1.0) * band(lat, slotSide * 3.0, 1.4, aaL);
          mark = max(mark, bar);
          markCol += vec3(0.9) * bar;
        }

        // Curbs on corners
        if (vCurb > 0.01) {
          float zone = smoothstep(W - 1.35 - aaL, W - 1.35 + aaL, abs(lat));
          float stripe = step(0.5, fract(s / 3.0));
          vec3 cc = mix(vec3(0.95), uCurbColor, stripe);
          float cm = zone * vCurb;
          markCol = mix(markCol, cc, cm);
          mark = max(mark, cm);
          glow += cm * 0.12;
        }

        mark = clamp(mark, 0.0, 1.0);
        markCol = mark > 0.0 ? markCol / max(mark, 1e-3) : markCol;
        markCol = clamp(markCol, 0.0, 1.0);

        // Wetness and puddles
        float puddle = smoothstep(0.52, 0.78, vnoise(vWorld.xz * 0.07) * 0.65 + vnoise(vWorld.xz * 0.31) * 0.35);
        albedo *= mix(1.0, 0.5, uWet);
        vec3 surf = mix(albedo, markCol * 0.65, mark);
        vec3 head = headlights(vWorld, vec3(0.0, 1.0, 0.0), 1.0);
        vec3 light = vLight + uAmbient * 0.6 + head;
        vec3 col = surf * light * uBrightness;
        col += markCol * mark * glow * 3.0;
        // road paint is retro-reflective: it throws the headlights back toward the cars
        col += markCol * mark * head * 0.45;

        // Grazing-angle sheen
        float ndv = clamp(vViewDir.y, 0.0, 1.0);
        float fres = pow(clamp(1.0 - ndv, 0.0, 1.0), 4.0);
        col += uSheen * fres * (0.3 + uWet * 0.7);

        float refl = mix(0.22, 0.6, uWet) + puddle * 0.38 * uWet;
        refl *= 1.0 - mark * 0.6;
        refl *= 1.0 - fogFactor(0.8);

        col = mix(col, uFogColor, fogFactor(1.0));
        gl_FragColor = vec4(col, 1.0 - clamp(refl, 0.0, 0.97));
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Baked-light surfaces (walls, skirts, sidewalks, props)
// ---------------------------------------------------------------------------------------
export function createLitMaterial(opts = {}) {
  const uniforms = {
    ...globalUniforms,
    uAlbedo: { value: new THREE.Color(opts.albedo ?? 0x202028) },
    uBrightness: { value: opts.brightness ?? 3.5 },
    uStripes: { value: opts.stripes ?? 0 },
    uJoints: { value: opts.joints ?? 0 },
    uStripeColor: { value: new THREE.Color(opts.stripeColor ?? 0xffffff) },
    uEmissive: { value: new THREE.Color(opts.emissive ?? 0x000000) },
    uFogScale: { value: opts.fogScale ?? 1 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    side: opts.side ?? THREE.FrontSide,
    vertexShader: /* glsl */ `
      attribute vec3 aLight;
      varying vec3 vLight;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vWorld;
      varying float vFogDepth;
      void main() {
        vLight = aLight;
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      uniform vec3 uAlbedo;
      uniform float uBrightness;
      uniform float uStripes;
      uniform float uJoints;
      uniform vec3 uStripeColor;
      uniform vec3 uEmissive;
      uniform float uFogScale;
      varying vec3 vLight;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      ${FOG_PARS_FRAG}
      ${HEADLIGHTS_GLSL}
      void main() {
        float n = vnoise(vWorld.xz * 0.9 + vWorld.y * 0.7);
        vec3 alb = uAlbedo * (0.8 + 0.35 * n);
        vec3 nrm = normalize(vN);
        float up = clamp(nrm.y, 0.0, 1.0);
        vec3 light = vLight * (0.65 + 0.35 * up) + uAmbient * (0.35 + 0.4 * up) + headlights(vWorld, nrm, 0.0);
        vec3 col = alb * light * uBrightness;
        if (uJoints > 0.0) {
          // distance (m) to the nearest joint between precast segments
          float j = abs(fract(vUv.y / uJoints + 0.5) - 0.5) * uJoints;
          float aa = fwidth(vUv.y) * 1.5;
          col *= 1.0 - 0.6 * (1.0 - smoothstep(0.01, 0.01 + aa + 0.004, j));
        }
        if (uStripes > 0.5) {
          float st = step(0.5, fract(vUv.y / 2.0));
          col = mix(col, uStripeColor * (light * 1.5 + 0.08), st * 0.85);
        }
        col += uEmissive;
        col = mix(col, uFogColor, fogFactor(uFogScale));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Neon strips with flowing light pulses (uv.y = metres along the track)
// ---------------------------------------------------------------------------------------
export function createNeonMaterial(opts = {}) {
  const uniforms = {
    ...globalUniforms,
    uColor: { value: new THREE.Color(opts.color ?? 0x00e5ff) },
    uIntensity: { value: opts.intensity ?? 3.0 },
    uPulse: { value: opts.pulse ?? 1.0 },
    uPulseSpeed: { value: opts.pulseSpeed ?? 90 },
    uPulseSpacing: { value: opts.pulseSpacing ?? 60 },
    uDash: { value: opts.dash ?? 0 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vFogDepth;
      void main() {
        vUv = uv;
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vColor;
      uniform float uIntensity;
      uniform float uPulse;
      uniform float uPulseSpeed;
      uniform float uPulseSpacing;
      uniform float uDash;
      varying vec2 vUv;
      ${FOG_PARS_FRAG}
      void main() {
        float s = vUv.y;
        float p = fract((s - uTime * uPulseSpeed) / uPulseSpacing);
        float pulse = pow(p, 10.0) * 3.0 + pow(p, 60.0) * 6.0;
        float dash = 1.0;
        if (uDash > 0.0) dash = step(fract(s / uDash), 0.55);
        vec3 col = uColor * vColor * uIntensity * (1.0 + pulse * uPulse) * dash;
        col = mix(col, uFogColor, fogFactor(0.45));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Road tunnel: glazed tile walls, painted concrete vault, rows of ceiling luminaires,
// emergency exit signs and LED delineators. uv.x runs along the cross-section
// (0 = right floor, 1 = left floor), uv.y = metres along the track.
// ---------------------------------------------------------------------------------------
export function createTunnelMaterial(opts = {}) {
  const uniforms = {
    ...globalUniforms,
    uTile: { value: new THREE.Color(opts.tile ?? 0xb9b4a8) },
    uConcrete: { value: new THREE.Color(opts.concrete ?? 0x34363b) },
    uLamp: { value: new THREE.Color(opts.lamp ?? 0xffe0b0) },
    uExit: { value: new THREE.Color(opts.exit ?? 0x18c060) },
    uSpacing: { value: opts.spacing ?? 4.5 },
    uWallU: { value: opts.wallU ?? 0.25 },
    uOuter: { value: new THREE.Color(opts.outer ?? 0x1a1b1f) },
    uBright: { value: opts.brightness ?? 1.0 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFogDepth;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uAmbient;
      uniform vec3 uTile;
      uniform vec3 uConcrete;
      uniform vec3 uLamp;
      uniform vec3 uExit;
      uniform float uSpacing;
      uniform float uWallU;
      uniform vec3 uOuter;
      uniform float uBright;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      ${FOG_PARS_FRAG}
      ${HEADLIGHTS_GLSL}

      float box(vec2 p, vec2 c, vec2 hs, vec2 aa) {
        vec2 q = abs(p - c) - hs;
        return (1.0 - smoothstep(-aa.x, aa.x, q.x)) * (1.0 - smoothstep(-aa.y, aa.y, q.y));
      }

      void main() {
        float u = vUv.x;
        float s = vUv.y;
        vec2 aa = vec2(fwidth(u), fwidth(s)) * 0.8 + vec2(0.0004, 0.002);
        if (!gl_FrontFacing) {
          vec3 col = uOuter * (0.7 + 0.5 * vnoise(vWorld.xz * 0.15));
          col = mix(col, uFogColor, fogFactor(0.9));
          gl_FragColor = vec4(col, 1.0);
          return;
        }
        float uw = min(u, 1.0 - u);
        bool wall = uw < uWallU;
        float ph = fract(s / uSpacing);
        float pool = 0.55 + 0.45 * pow(0.5 + 0.5 * cos(ph * 6.2832), 2.0);
        vec3 nrm = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (dot(nrm, cameraPosition - vWorld) < 0.0) nrm = -nrm;
        vec3 light = uLamp * pool * (wall ? 0.9 : 0.55) + uAmbient * 0.4 + headlights(vWorld, nrm, 0.0) * 1.6;
        vec3 col;
        if (wall) {
          vec2 t = vec2(s / 0.3, uw / uWallU * 20.0);
          vec2 g = abs(fract(t) - 0.5);
          float grout = 1.0 - smoothstep(0.44, 0.48, max(g.x, g.y));
          float dirt = smoothstep(0.35, 0.0, uw / uWallU);
          vec3 alb = uTile * (0.85 + 0.15 * vnoise(floor(t) * 0.7)) * mix(1.0, 0.45, dirt);
          alb *= 0.75 + 0.25 * grout;
          col = alb * light * 0.55 * uBright;
          col += vec3(0.9, 0.95, 1.0) * box(vec2(fract(s / 10.0) * 10.0, uw / uWallU), vec2(5.0, 0.12), vec2(0.06, 0.02), aa * vec2(10.0, 1.0 / uWallU)) * 4.0;
          if (u < 0.5) {
            float e = box(vec2(mod(s, 120.0), uw / uWallU), vec2(60.0, 0.6), vec2(0.6, 0.07), aa * vec2(1.0, 1.0 / uWallU));
            col = mix(col, uExit * 2.2, e);
          }
        } else {
          float j = 1.0 - smoothstep(0.0, aa.y * 2.0 + 0.01, abs(fract(s / 12.0) - 0.5) - 0.495);
          vec3 alb = uConcrete * (0.8 + 0.3 * vnoise(vec2(u * 30.0, s * 0.3)));
          col = alb * light * 0.5 * uBright * (1.0 - j * 0.4);
          float row = box(vec2(u, ph * uSpacing), vec2(0.385, uSpacing * 0.5), vec2(0.012, uSpacing * 0.32), aa)
                    + box(vec2(u, ph * uSpacing), vec2(0.615, uSpacing * 0.5), vec2(0.012, uSpacing * 0.32), aa);
          col = mix(col, uLamp * 3.2, clamp(row, 0.0, 1.0));
        }
        col = mix(col, uFogColor, fogFactor(0.6));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Night sky: near-black zenith, city light pollution glowing on the horizon and on the
// underside of low clouds, a few faint stars where the clouds break.
// ---------------------------------------------------------------------------------------
export function createSkyMaterial(p) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalUniforms.uTime,
      uTop: { value: new THREE.Color(p.skyTop) },
      uHorizon: { value: new THREE.Color(p.skyHorizon) },
      uGlow: { value: new THREE.Color(p.skyGlow) },
      uStars: { value: p.stars ?? 0.2 },
      uClouds: { value: p.clouds ?? 0.5 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform float uStars;
      uniform float uClouds;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float hp = max(h, 0.0);
        vec3 col = mix(uHorizon, uTop, pow(clamp(h * 1.5, 0.0, 1.0), 0.5));
        col += uGlow * (exp(-hp * 7.0) * 0.6 + exp(-hp * 28.0) * 0.4);
        float starMask = 1.0;
        if (h > 0.0) {
          vec2 q = d.xz / (h + 0.12) * 1.4;
          float n = vnoise(q + uTime * 0.004) * 0.55 + vnoise(q * 2.3 - uTime * 0.006) * 0.3 + vnoise(q * 5.1) * 0.15;
          float c = smoothstep(0.42, 0.8, n) * uClouds * smoothstep(0.0, 0.07, h);
          vec3 cloudCol = uHorizon * 0.5 + uGlow * (0.25 + 0.9 * exp(-h * 3.5));
          col = mix(col, cloudCol, c);
          starMask = 1.0 - c;
        } else {
          col = mix(col, uHorizon * 0.35, clamp(-h * 5.0, 0.0, 1.0));
        }
        vec2 sp = vec2(atan(d.z, d.x) * 140.0, h * 280.0);
        vec2 cell = floor(sp);
        float r = hash12(cell);
        vec2 f = fract(sp) - 0.5;
        float star = step(0.992, r) * smoothstep(0.22, 0.0, length(f)) * smoothstep(0.12, 0.5, h);
        col += vec3(0.75, 0.8, 1.0) * star * uStars * starMask * (0.7 + 0.3 * sin(uTime * 2.0 + r * 50.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Distant skyline ring (follows the camera horizontally)
// ---------------------------------------------------------------------------------------
export function createSkylineMaterial(p, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalUniforms.uTime,
      uHorizon: { value: new THREE.Color(p.skyHorizon) },
      uGlow: { value: new THREE.Color(p.skyGlow) },
      uWinA: { value: new THREE.Color(p.lamp ?? '#ffc98a') },
      uWinB: { value: new THREE.Color(p.lamp2 ?? '#dde8ff') },
      uDensity: { value: opts.density ?? 1.0 },
      uHeight: { value: opts.height ?? 1.0 },
    },
    side: THREE.BackSide,
    depthWrite: true,
    transparent: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99998;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec3 uWinA;
      uniform vec3 uWinB;
      uniform float uDensity;
      uniform float uHeight;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float x = vUv.x * 900.0;
        float y = vUv.y;
        // two layers of buildings
        float id1 = floor(x / 3.0);
        float h1 = (0.12 + 0.55 * pow(hash11(id1), 2.2)) * uHeight;
        float id2 = floor(x / 5.0 + 0.5);
        float h2 = (0.08 + 0.3 * pow(hash11(id2 + 77.0), 1.5)) * uHeight;
        float spire = step(0.96, hash11(id1 * 1.3)) * 0.25 * uHeight;
        float inFar = step(y, h1 + spire * step(abs(fract(x / 3.0) - 0.5), 0.08));
        float inNear = step(y, h2);
        if (inFar < 0.5 && inNear < 0.5) discard;
        vec3 col = mix(uHorizon * 0.18, uHorizon * 0.1, inNear);
        // windows
        vec2 w = vec2(x * 4.0, y * 140.0);
        vec2 wc = floor(w);
        float lit = step(1.0 - 0.16 * uDensity, hash12(wc + (inNear > 0.5 ? 50.0 : 0.0)));
        float wmask = step(0.3, fract(w.x)) * step(0.35, fract(w.y));
        vec3 wcCol = mix(vec3(1.0, 0.82, 0.58), hash12(wc * 0.3) > 0.5 ? uWinA : uWinB, step(0.6, hash12(wc * 1.7)));
        col += wcCol * lit * wmask * (inNear > 0.5 ? 0.42 : 0.26);
        // aviation lights
        float top = (inNear > 0.5) ? h2 : h1;
        float blink = step(0.5, fract(uTime * 0.7 + hash11(id1) * 3.0));
        col += vec3(3.0, 0.2, 0.1) * blink * step(0.9, hash11(id1 * 2.7)) * smoothstep(0.006, 0.0, abs(y - top + 0.004)) * step(abs(fract(x / 3.0) - 0.5), 0.06);
        // haze toward bottom
        col = mix(col, uHorizon * 0.55 + uGlow * 0.12, smoothstep(0.25, 0.0, y) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
