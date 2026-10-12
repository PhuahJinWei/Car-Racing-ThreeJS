import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { resolveCustom } from './customization.js';
import { additive, globalUniforms } from '../world/materials.js';
import { tyreGeometry, rimGeometry, discGeometry, caliperGeometry, isSharedWheelGeometry, wheelSet } from './wheels.js';
import { AO_GLSL, withAO, makeCarbonMaterial, makeGrilleMaterial } from './car-materials.js';
import { PROJ_TILES, drawProjectedLivery } from './car-livery.js';
import { CarDamage, patchDamage } from './car-damage.js';
import { retainCarAsset, releaseCarAsset } from './car-assets.js';

// ------------------------------------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------------------------------------

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Smoothly resample keyframe rows (arrays of numbers) with Catmull-Rom; `per` samples per segment. */
function resampleKeys(keys, per) {
  const out = [];
  const n = keys.length;
  for (let k = 0; k < n - 1; k++) {
    const a = keys[Math.max(0, k - 1)];
    const b = keys[k];
    const c = keys[k + 1];
    const d = keys[Math.min(n - 1, k + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      out.push(b.map((_, j) => catmull(a[j], b[j], c[j], d[j], t)));
    }
  }
  out.push(keys[n - 1].slice());
  return out;
}

/** Loft closed rings (arrays of [x, y]) placed at z positions into a mesh with optional end caps. */
function loft(rings, zs, opts = {}) {
  const S = rings.length;
  const K = rings[0].length;
  const cols = K + 1;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let s = 0; s < S; s++) {
    for (let k = 0; k <= K; k++) {
      const p = rings[s][k % K];
      pos.push(p[0], p[1], zs[s]);
      uv.push(s / (S - 1), k / K);
    }
  }
  for (let s = 0; s < S - 1; s++) {
    for (let k = 0; k < K; k++) {
      const a = s * cols + k;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // outward-facing winding (rings go counter-clockwise when viewed from +Z)
      idx.push(a, b, c, b, d, c);
    }
  }
  const capStart = (si, flip) => {
    const base = pos.length / 3;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < K; k++) {
      cx += rings[si][k][0];
      cy += rings[si][k][1];
    }
    cx /= K;
    cy /= K;
    pos.push(cx, cy, zs[si]);
    uv.push(si / (S - 1), 0.5);
    for (let k = 0; k < K; k++) {
      pos.push(rings[si][k][0], rings[si][k][1], zs[si]);
      uv.push(si / (S - 1), k / K);
    }
    for (let k = 0; k < K; k++) {
      const a = base + 1 + k;
      const b = base + 1 + ((k + 1) % K);
      if (flip) idx.push(base, b, a);
      else idx.push(base, a, b);
    }
  };
  if (opts.caps !== false) {
    capStart(0, true);
    capStart(S - 1, false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function bodyRing(hw, yb, ys, yt, taper, K) {
  const pts = [];
  for (let k = 0; k < K; k++) {
    const th = -Math.PI / 2 + (k / K) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    let x = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / 3.4);
    let y;
    if (s >= 0) {
      y = ys + (yt - ys) * Math.pow(s, 2 / 2.3);
      x *= 1 - taper * Math.pow(s, 1.6);
    } else {
      y = ys - (ys - yb) * Math.pow(-s, 2 / 5.5);
    }
    pts.push([x, y]);
  }
  return pts;
}

function cabinRing(hwB, hwT, yB, yT, K) {
  const pts = [];
  for (let k = 0; k < K; k++) {
    const th = -Math.PI / 2 + (k / K) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.7);
    let x;
    let y;
    if (s >= 0) {
      x = sx * (hwB + (hwT - hwB) * Math.pow(s, 1.3));
      y = yB + (yT - yB) * Math.pow(s, 0.55);
    } else {
      x = sx * hwB;
      y = yB - 0.18 * -s;
    }
    pts.push([x, y]);
  }
  return pts;
}

function box(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

function sampleBody(def, z) {
  // linear interpolation of body keys at z (for detail placement)
  const keys = def.body;
  if (z <= keys[0][0]) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (z >= a[0] && z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0]);
      return a.map((v, j) => v + (b[j] - v) * t);
    }
  }
  return keys[keys.length - 1];
}

// ------------------------------------------------------------------------------------------
// Livery
// ------------------------------------------------------------------------------------------

function drawLivery(canvas, livery, paint, accent, seed = 77) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  switch (livery) {
    case 'lv_stripes': {
      // canvas y = v * h; top centre of the car is v = 0.5
      ctx.fillRect(0, h * 0.448, w, h * 0.03);
      ctx.fillRect(0, h * 0.522, w, h * 0.03);
      break;
    }
    case 'lv_race': {
      ctx.fillRect(0, h * 0.485, w, h * 0.03);
      const drawNumber = (cy, flip) => {
        ctx.save();
        ctx.translate(w * 0.47, cy);
        if (flip) ctx.rotate(Math.PI);
        ctx.beginPath();
        ctx.arc(0, 0, h * 0.075, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.fillStyle = paint;
        ctx.font = `bold ${Math.round(h * 0.09)}px Orbitron, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(seed % 100).padStart(2, '0'), 0, h * 0.004);
        ctx.restore();
      };
      drawNumber(h * 0.26, true);
      drawNumber(h * 0.74, false);
      ctx.fillStyle = accent;
      ctx.fillRect(0, h * 0.33, w, h * 0.012);
      ctx.fillRect(0, h * 0.658, w, h * 0.012);
      break;
    }
    case 'lv_bolt': {
      const bolt = (y0, dir) => {
        ctx.beginPath();
        const amp = h * 0.05 * dir;
        ctx.moveTo(w * 0.04, y0);
        ctx.lineTo(w * 0.35, y0 - amp);
        ctx.lineTo(w * 0.42, y0 + amp * 0.4);
        ctx.lineTo(w * 0.7, y0 - amp * 0.8);
        ctx.lineTo(w * 0.78, y0 + amp * 0.2);
        ctx.lineTo(w * 0.98, y0 - amp * 0.3);
        ctx.lineTo(w * 0.78, y0 + amp * 0.6);
        ctx.lineTo(w * 0.7, y0 + amp * 0.1);
        ctx.lineTo(w * 0.42, y0 + amp * 1.3);
        ctx.lineTo(w * 0.35, y0 + amp * 0.3);
        ctx.closePath();
        ctx.fill();
      };
      bolt(h * 0.28, 1);
      bolt(h * 0.72, -1);
      break;
    }
    case 'lv_split': {
      ctx.fillRect(0, 0, w, h * 0.3);
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
      ctx.fillRect(0, h * 0.49, w, h * 0.02);
      break;
    }
    case 'lv_circuit': {
      let s = seed * 9301 + 49297;
      const rnd = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
      ctx.lineWidth = Math.max(2, h * 0.006);
      ctx.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        let x = rnd() * w;
        let y = (0.18 + rnd() * 0.64) * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          if (rnd() < 0.5) x += (rnd() - 0.3) * w * 0.12;
          else y += (rnd() - 0.5) * h * 0.08;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, h * 0.01, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
}

// ------------------------------------------------------------------------------------------
// Wheels
// ------------------------------------------------------------------------------------------

function legacyRimGeometry(style, r) {
  const parts = [];
  const lip = new THREE.TorusGeometry(r, r * 0.07, 6, 28);
  lip.rotateY(Math.PI / 2);
  parts.push(lip);
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.22, 0.06, 12);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  const addSpoke = (ang, width, len, depth, twist = 0) => {
    const g = new THREE.BoxGeometry(depth, len, width);
    g.translate(0, r * 0.2 + len / 2, 0);
    if (twist) g.rotateY(twist);
    g.rotateX(ang);
    parts.push(g);
  };
  const L = r * 0.8;
  if (style === 'split') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      addSpoke(a - 0.09, r * 0.09, L, 0.05);
      addSpoke(a + 0.09, r * 0.09, L, 0.05);
    }
  } else if (style === 'turbine') {
    for (let i = 0; i < 14; i++) addSpoke((i / 14) * Math.PI * 2, r * 0.12, L, 0.04, 0.5);
    const disc = new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.03, 20);
    disc.rotateZ(Math.PI / 2);
    parts.push(disc);
  } else if (style === 'mesh') {
    for (let i = 0; i < 10; i++) {
      addSpoke((i / 10) * Math.PI * 2 + 0.25, r * 0.05, L, 0.035);
      addSpoke((i / 10) * Math.PI * 2 - 0.25, r * 0.05, L, 0.035);
    }
  } else {
    for (let i = 0; i < 3; i++) addSpoke((i / 3) * Math.PI * 2, r * 0.3, L, 0.05, 0.25);
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

// ------------------------------------------------------------------------------------------
// Shaders
// ------------------------------------------------------------------------------------------

const STREAK_GLSL = /* glsl */ `
  {
    vec3 rv = reflect(-geometryViewDir, normal);
    vec3 rw = inverseTransformDirection(rv, viewMatrix);
    float fw = dot(rw, uCarFwd);
    float ang = atan(rw.y, fw);
    float band = pow(max(sin(ang * 7.0 + uStreakPhase), 0.0), 36.0);
    band += pow(max(sin(ang * 3.0 - uStreakPhase * 0.43 + 1.7), 0.0), 60.0) * 0.6;
    float up = smoothstep(0.02, 0.35, rw.y);
    outgoingLight += uStreakColor * band * up * uStreakInt * STREAK_GAIN;
  }
`;

const STREAK_UNIFORMS = `
uniform float uStreakPhase;
uniform float uStreakInt;
uniform vec3 uStreakColor;
uniform vec3 uCarFwd;
`;

// Livery atlas projected from five orthographic views (see car-livery.js); alpha marks panel gaps.
const PROJ_GLSL = /* glsl */ `
#ifdef USE_PROJ_LIVERY
uniform sampler2D uLiv;
uniform vec3 uLivMin;
uniform vec3 uLivSize;
uniform vec4 uTileL;
uniform vec4 uTileR;
uniform vec4 uTileT;
uniform vec4 uTileF;
uniform vec4 uTileB;
varying vec3 vCarNormal;
float livGap = 1.0;
vec4 livTile(vec4 tile, vec2 st) {
  return texture2D(uLiv, tile.xy + clamp(st, 0.002, 0.998) * tile.zw);
}
#endif
`;
const PROJ_APPLY = /* glsl */ `
#ifdef USE_PROJ_LIVERY
{
  vec3 p = (vCarLocal - uLivMin) / uLivSize;
  vec3 n = normalize(vCarNormal);
  vec3 w = vec3(pow(abs(n.x), 3.0) + 0.002, pow(max(n.y, 0.0), 3.0), pow(abs(n.z), 3.0));
  w /= (w.x + w.y + w.z);
  vec4 sideC = n.x > 0.0 ? livTile(uTileL, vec2(1.0 - p.z, 1.0 - p.y)) : livTile(uTileR, vec2(p.z, 1.0 - p.y));
  vec4 topC = livTile(uTileT, vec2(1.0 - p.z, p.x));
  vec4 endC = n.z > 0.0 ? livTile(uTileF, vec2(p.x, 1.0 - p.y)) : livTile(uTileB, vec2(1.0 - p.x, 1.0 - p.y));
  vec4 L = sideC * w.x + topC * w.y + endC * w.z;
  diffuseColor.rgb *= L.rgb;
  livGap = L.a;
}
#endif
`;
const PROJ_LIGHT = /* glsl */ `
#ifdef USE_PROJ_LIVERY
  reflectedLight.directDiffuse *= mix(0.3, 1.0, livGap);
  reflectedLight.indirectDiffuse *= mix(0.3, 1.0, livGap);
  reflectedLight.directSpecular *= mix(0.1, 1.0, livGap);
  reflectedLight.indirectSpecular *= mix(0.08, 1.0, livGap);
  #ifdef USE_CLEARCOAT
    clearcoatSpecularDirect *= livGap;
    clearcoatSpecularIndirect *= livGap;
  #endif
#endif
`;

function patchBody(mat, arches, streak, proj = null) {
  if (proj) {
    mat.defines = { ...(mat.defines || {}), USE_PROJ_LIVERY: '' };
  }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uArches = { value: arches };
    Object.assign(shader.uniforms, streak);
    if (proj) {
      const t = (k) => new THREE.Vector4(...PROJ_TILES[k]);
      Object.assign(shader.uniforms, {
        uLiv: { value: proj.map },
        uLivMin: { value: proj.min },
        uLivSize: { value: proj.size },
        uTileL: { value: t('L') },
        uTileR: { value: t('R') },
        uTileT: { value: t('T') },
        uTileF: { value: t('F') },
        uTileB: { value: t('B') },
      });
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vCarLocal;
#ifdef USE_PROJ_LIVERY
varying vec3 vCarNormal;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vCarLocal = position;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
#ifdef USE_PROJ_LIVERY
vCarNormal = objectNormal;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCarLocal;
uniform vec4 uArches[4];
${STREAK_UNIFORMS}
${PROJ_GLSL}
#define STREAK_GAIN 1.0`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>
${PROJ_APPLY}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        for (int k = 0; k < 4; k++) {
          vec4 a = uArches[k];
          if (abs(vCarLocal.x) > a.w && length(vec2(vCarLocal.z - a.x, vCarLocal.y - a.y)) < a.z) discard;
        }`,
      )
      .replace('#include <aomap_fragment>', AO_GLSL + PROJ_LIGHT)
      .replace(
        '#include <opaque_fragment>',
        `${STREAK_GLSL}
if (!gl_FrontFacing) outgoingLight = vec3(0.003);
#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (proj ? 'carbody-proj' : 'carbody');
}

function patchGlass(mat, streak) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, streak);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${STREAK_UNIFORMS}
#define STREAK_GAIN 1.6`,
      )
      .replace('#include <aomap_fragment>', AO_GLSL)
      .replace(
        '#include <opaque_fragment>',
        `${STREAK_GLSL}
#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'carglass';
}

/**
 * See-through tinted glass: the cabin shows through while reflections keep their full strength
 * (premultiplied-style blending: diffuse is scaled by opacity, specular is not).
 */
function makeWindowMaterial(hq, streak) {
  const Mat = hq ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new Mat({
    color: 0x0b0e13,
    metalness: 0,
    roughness: 0.03,
    envMapIntensity: 1.5,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, streak);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${STREAK_UNIFORMS}
#define STREAK_GAIN 1.6`,
      )
      .replace(
        '#include <opaque_fragment>',
        `${STREAK_GLSL}
gl_FragColor = vec4(totalDiffuse * diffuseColor.a + (outgoingLight - totalDiffuse), diffuseColor.a);`,
      );
  };
  mat.customProgramCacheKey = () => 'carwindow';
  return mat;
}

function makeFlameMaterial() {
  return additive(
    new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime, uPower: { value: 0 }, uColor: { value: new THREE.Color(0.3, 0.6, 3.0) } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uPower;
        uniform vec3 uColor;
        varying vec2 vUv;
        float h(float x) { return fract(sin(x * 91.7) * 43758.5); }
        void main() {
          float y = 1.0 - vUv.y; // 0 tip .. 1 base (cone)
          float flick = 0.75 + 0.25 * h(floor(uTime * 40.0) + vUv.x * 3.0);
          float core = pow(clamp(y, 0.0, 1.0), 2.2);
          float bands = 0.75 + 0.25 * sin(y * 30.0 - uTime * 80.0);
          vec3 col = mix(uColor, vec3(1.5, 1.3, 1.1), core * 0.5) * bands * flick;
          float a = smoothstep(0.0, 0.7, y) * uPower;
          gl_FragColor = vec4(col * a, a);
        }`,
    }),
  );
}

function makeUnderglowMaterial() {
  return additive(
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0, 2, 3) }, uIntensity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float d = length(p * vec2(1.0, 1.0));
          float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.6);
          float core = smoothstep(0.75, 0.2, max(abs(p.x) * 1.25, abs(p.y) * 1.08));
          vec3 c = uColor * (a * 0.9 + core * 0.6) * uIntensity;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
}

export function makeHologramMaterial(color = 0x40e0ff) {
  return additive(
    new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        varying vec3 vW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec3 vN;
        varying vec3 vV;
        varying vec3 vW;
        void main() {
          float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.0);
          float scan = 0.6 + 0.4 * sin(vW.y * 60.0 - uTime * 8.0);
          vec3 c = uColor * (0.12 + f * 1.6) * scan * 1.5;
          gl_FragColor = vec4(c * uOpacity, 1.0);
        }`,
    }),
  );
}

// room around the car for the soft edge and the lamp-cast shadow (m)
const SHADOW_MARGIN = 2.5;

/**
 * Shadow on the road under a car:
 *  - occlusion: dark under the floor, with a soft edge spilling out past the sills
 *  - tyre contact patches, nearly black
 *  - cast shadows from the two strongest nearby lamps: the footprint swept away from each light,
 *    longer the lower and farther the lamp is, as dark as that lamp's share of the light there
 *    (set every frame with CarModel.setShadow)
 * Height above the road (jumps) softens and fades it.
 */
function makeShadowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uHalf: { value: new THREE.Vector2(1, 2.2) },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uWheels: { value: new THREE.Vector4(1.3, -1.3, 0.8, 0.12) },
      uCast: { value: new THREE.Vector4(0, 0, 0, 0) },
      uCast2: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSoft: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uHalf;
      uniform vec2 uCenter;
      uniform vec4 uWheels;
      uniform vec4 uCast;
      uniform vec4 uCast2;
      uniform float uSoft;
      uniform float uOpacity;
      varying vec2 vP;
      float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      // the footprint swept along c.xy for c.z metres, fading with distance from the car
      float lampShadow(vec2 p, vec4 c, float soft) {
        if (c.w <= 0.0) return 0.0;
        float t = clamp(dot(p, c.xy), 0.0, c.z);
        float along = t / max(c.z, 0.001);
        float dc = sdRR(p - c.xy * t, uHalf - vec2(0.15, 0.25), 0.45);
        return (1.0 - smoothstep(-0.35, 0.3 + along * 0.55 + soft, dc)) * c.w * (1.0 - 0.6 * along);
      }
      void main() {
        vec2 p = vP - uCenter;
        float soft = uSoft;
        float d = sdRR(p, uHalf - vec2(0.1, 0.2), 0.35);
        float a = (1.0 - smoothstep(-0.6 - soft, 0.42 + soft * 1.5, d)) * 0.84;
        float contact = 1.0 - min(soft * 1.5, 1.0);
        for (int i = 0; i < 4; i++) {
          vec2 c = vec2(i < 2 ? uWheels.z : -uWheels.z, (i == 0 || i == 2) ? uWheels.x : uWheels.y);
          float dw = sdRR(vP - c, vec2(uWheels.w, 0.2), 0.08);
          a = max(a, (1.0 - smoothstep(-0.05, 0.16, dw)) * 0.96 * contact);
        }
        a = 1.0 - (1.0 - a) * (1.0 - lampShadow(p, uCast, soft)) * (1.0 - lampShadow(p, uCast2, soft));
        a *= uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
  });
}

let blurTex = null;
/** Radial texture standing in for spokes smeared by rotation. */
function wheelBlurTexture() {
  if (blurTex) return blurTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0.0, 'rgba(40,40,44,1)');
  grd.addColorStop(0.2, 'rgba(70,70,76,0.95)');
  grd.addColorStop(0.3, 'rgba(150,150,158,0.85)');
  grd.addColorStop(0.75, 'rgba(185,185,192,0.7)');
  grd.addColorStop(0.92, 'rgba(120,120,126,0.6)');
  grd.addColorStop(1.0, 'rgba(60,60,64,0.0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  blurTex = new THREE.CanvasTexture(c);
  blurTex.colorSpace = THREE.SRGBColorSpace;
  return blurTex;
}

// The light (far) model: parts that read alike at range share one material and one mesh
const FAR_ROLE = { window: 'glass', carbon: 'trim', grille: 'trim', exhaust: 'trim', head: 'chrome', lens: 'drl', reverse: 'chrome' };

// warning lights (a patrol car's light bar) glow steadily instead of strobing when flashes are reduced
let calmBeacons = false;
export function setReduceFlashes(on) {
  calmBeacons = !!on;
}

// ------------------------------------------------------------------------------------------
// Car model
// ------------------------------------------------------------------------------------------

export class CarModel {
  constructor(def, custom, opts = {}) {
    this.def = def;
    this.opts = { hq: true, envMap: null, ...opts };
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.wheels = [];
    this.wheelSpin = 0;
    this.materials = [];
    this.time = 0;
    this.boost = 0;
    this.brake = 0;
    this.reverse = 0;
    this.backfire = 0;
    this.streak = {
      uStreakPhase: { value: 0 },
      uStreakInt: { value: 0.25 },
      uStreakColor: { value: new THREE.Color(1, 1, 1) },
      uCarFwd: { value: new THREE.Vector3(0, 0, 1) },
    };
    this.asset = this.opts.asset || null;
    // (keeps the model loaded while this car exists; see dispose)
    retainCarAsset(this.asset);
    if (this.asset?.factory) this._buildFromFactory(this.asset);
    else if (this.asset) this._buildFromAsset(this.asset);
    else this._buildGeometry();
    this._buildShadow();
    // where the headlights sit (lamp-pair centre height / distance ahead, half spacing): the race
    // feeds this to the world shaders so the beams light the road and walls
    const h = this.asset?.head;
    this.headLamp = h && h.length ? { x: Math.abs(h[0].x), y: h[0].y, z: h[0].z } : { x: 0.62, y: 0.6, z: (this.frontZ ?? 2.2) - 0.25 };
    this.setCustomization(custom);
  }

  _buildGeometry() {
    const def = this.def;
    const hq = this.opts.hq;
    const K = hq ? 30 : 20;
    const per = hq ? 5 : 3;
    const dims = def.dims;

    // --- body
    const bodyRows = resampleKeys(def.body, per);
    const bodyRings = bodyRows.map((r) => bodyRing(r[1], r[2], r[3], r[4], r[5], K));
    const bodyGeo = loft(bodyRings, bodyRows.map((r) => r[0]));
    this.bodyMat = hq
      ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const zr = -dims.wheelbase / 2;
    const zf = dims.wheelbase / 2;
    const archFor = (z, r) => {
      const b = sampleBody(def, z);
      return new THREE.Vector4(z, r, r + 0.075, b[1] - 0.34);
    };
    this.arches = [archFor(zf, dims.frontWheelR), archFor(zf, dims.frontWheelR), archFor(zr, dims.wheelR), archFor(zr, dims.wheelR)];
    patchBody(this.bodyMat, this.arches, this.streak);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.add(bodyMesh);
    this.bodyMesh = bodyMesh;

    // --- cabin / glass
    const cabRows = resampleKeys(def.cabin, per);
    const cabRings = cabRows.map((r) => cabinRing(r[1], r[2], r[3], r[4], K));
    const cabGeo = loft(cabRings, cabRows.map((r) => r[0]));
    this.glassMat = hq
      ? new THREE.MeshPhysicalMaterial({ color: 0x07090f, metalness: 0.3, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 })
      : new THREE.MeshStandardMaterial({ color: 0x07090f, metalness: 0.5, roughness: 0.1, envMapIntensity: 1.5 });
    patchGlass(this.glassMat, this.streak);
    this.body.add(new THREE.Mesh(cabGeo, this.glassMat));

    // --- dark trim (diffuser, intakes, mirrors stalks, wing stands)
    const rearB = def.body[0];
    const frontB = def.body[def.body.length - 1];
    const rearZ = rearB[0];
    const frontZ = frontB[0];
    const trim = [];
    const rb = sampleBody(def, rearZ + 0.12);
    trim.push(box(rb[1] * 1.25, 0.1, 0.45, 0, rb[2] + 0.02, rearZ + 0.26));
    for (let i = -2; i <= 2; i++) trim.push(box(0.025, 0.13, 0.4, i * rb[1] * 0.24, rb[2] + 0.05, rearZ + 0.24));
    // front splitter
    const fb = sampleBody(def, frontZ - 0.1);
    trim.push(box(fb[1] * 1.8, 0.035, 0.35, 0, fb[2] - 0.02, frontZ - 0.08));
    // side skirts
    for (const sx of [-1, 1]) {
      const mid = sampleBody(def, 0);
      trim.push(box(0.06, 0.08, dims.wheelbase - 0.9, sx * (mid[1] - 0.02), mid[2] + 0.04, 0));
    }
    // mirrors
    const cab0 = def.cabin[1];
    for (const sx of [-1, 1]) trim.push(box(0.18, 0.08, 0.12, sx * (cab0[1] + 0.12), cab0[3] + 0.08, cab0[0] - 0.05));
    // wing
    if (def.wing) {
      const w = def.wing;
      trim.push(box(w.span, 0.045, w.chord, 0, w.y, w.z, 0.12, 0, 0));
      for (const sx of [-1, 1]) {
        trim.push(box(0.04, w.stand + 0.25, 0.22, sx * w.span * 0.3, w.y - (w.stand + 0.25) / 2, w.z + 0.05));
        trim.push(box(0.035, 0.3, w.chord + 0.1, sx * w.span * 0.5, w.y + 0.02, w.z));
      }
    }
    if (def.fin) {
      const cl = def.cabin[def.cabin.length - 1];
      trim.push(box(0.03, 0.34, Math.abs(cl[0] - rearZ) + 0.2, 0, cl[4] - 0.05, (cl[0] + rearZ) / 2 + 0.1));
    }
    if (def.ducktail) {
      const rd = sampleBody(def, rearZ + 0.12);
      trim.push(box(rd[1] * 1.7, 0.03, 0.22, 0, rd[4] + 0.02, rearZ + 0.18, -0.35, 0, 0));
    }
    this.trimMat = new THREE.MeshStandardMaterial({ color: 0x0c0d12, metalness: 0.4, roughness: 0.45 });
    this.body.add(new THREE.Mesh(mergeGeometries(trim.map((g) => g.toNonIndexed())), this.trimMat));

    // --- lights
    const tail = [];
    const head = [];
    const rearTop = rb[4];
    const lightY = rearTop - 0.1;
    const lz = rearZ - 0.012;
    if (def.lights === 'bar') {
      tail.push(box(rb[1] * 1.45, 0.045, 0.03, 0, lightY, lz));
      for (const sx of [-1, 1]) {
        tail.push(box(0.24, 0.085, 0.03, sx * rb[1] * 0.62, lightY - 0.02, lz));
        tail.push(box(0.05, 0.15, 0.03, sx * rb[1] * 0.74, lightY - 0.06, lz));
      }
    } else if (def.lights === 'split') {
      for (const sx of [-1, 1]) {
        tail.push(box(0.5, 0.04, 0.03, sx * rb[1] * 0.62, lightY, lz, 0, 0, sx * 0.28));
        tail.push(box(0.4, 0.04, 0.03, sx * rb[1] * 0.62, lightY - 0.12, lz, 0, 0, -sx * 0.28));
      }
      tail.push(box(rb[1] * 0.6, 0.025, 0.03, 0, lightY + 0.02, lz));
    } else {
      for (const sx of [-1, 1]) tail.push(box(0.05, 0.32, 0.03, sx * rb[1] * 0.9, lightY - 0.08, lz));
      tail.push(box(rb[1] * 1.6, 0.03, 0.03, 0, lightY + 0.04, lz));
      if (def.wing) tail.push(box(def.wing.span * 0.95, 0.025, 0.02, 0, def.wing.y + 0.035, def.wing.z - def.wing.chord / 2 - 0.01, 0.12, 0, 0));
    }
    const hb = sampleBody(def, frontZ - 0.32);
    for (const sx of [-1, 1]) {
      head.push(box(0.36, 0.035, 0.05, sx * hb[1] * 0.68, (hb[3] + hb[4]) / 2 + 0.02, frontZ - 0.3, 0.25, -sx * 0.35, 0));
      head.push(box(0.2, 0.03, 0.04, sx * hb[1] * 0.62, hb[3] - 0.02, frontZ - 0.2, 0.1, -sx * 0.4, 0));
    }
    this.tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.12, 0.2) });
    this.headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 3.8, 4.5) });
    this.body.add(new THREE.Mesh(mergeGeometries(tail.map((g) => g.toNonIndexed())), this.tailMat));
    this.body.add(new THREE.Mesh(mergeGeometries(head.map((g) => g.toNonIndexed())), this.headMat));
    this.tailLightPos = [
      new THREE.Vector3(rb[1] * 0.72, lightY, lz - 0.05),
      new THREE.Vector3(-rb[1] * 0.72, lightY, lz - 0.05),
    ];

    // --- exhausts + flames
    const exN = def.exhaust;
    const exX = exN === 4 ? [-0.42, -0.28, 0.28, 0.42] : [-0.36, 0.36];
    const exGeo = [];
    const exY = rb[2] + 0.13;
    for (const x of exX) {
      const c = new THREE.CylinderGeometry(0.055, 0.06, 0.2, 10, 1, true);
      c.rotateX(Math.PI / 2);
      c.translate(x, exY, rearZ + 0.02);
      exGeo.push(c);
    }
    this.body.add(new THREE.Mesh(mergeGeometries(exGeo.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x777b85, metalness: 1, roughness: 0.3, side: THREE.DoubleSide })));
    this.exhaustGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.1, 0.02) });
    const glowGeo = [];
    for (const x of exX) {
      const d = new THREE.CircleGeometry(0.048, 10);
      d.rotateY(Math.PI);
      d.translate(x, exY, rearZ - 0.05);
      glowGeo.push(d);
    }
    this.body.add(new THREE.Mesh(mergeGeometries(glowGeo.map((g) => g.toNonIndexed())), this.exhaustGlowMat));
    this.flameMat = makeFlameMaterial();
    const flameGeo = [];
    for (const x of exX) {
      const cone = new THREE.ConeGeometry(0.09, 1.1, 10, 1, true);
      cone.rotateX(-Math.PI / 2); // tip toward -Z
      cone.translate(x, exY, -0.55);
      flameGeo.push(cone);
    }
    this.flames = new THREE.Mesh(mergeGeometries(flameGeo.map((g) => g.toNonIndexed())), this.flameMat);
    this.flames.position.z = rearZ - 0.06;
    this.flames.visible = false;
    this.flames.renderOrder = 5;
    this.body.add(this.flames);
    this.exhaustPos = exX.map((x) => new THREE.Vector3(x, exY, rearZ - 0.1));

    // --- wheels
    this.tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.92, metalness: 0.0 });
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0x555a63, metalness: 0.9, roughness: 0.28 });
    this.brakeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.8, roughness: 0.5 });
    this.caliperMat = new THREE.MeshStandardMaterial({ color: 0xd01020, metalness: 0.3, roughness: 0.4 });
    const tr = dims.track / 2;
    const positions = [
      [tr, dims.frontWheelR, zf, true],
      [-tr, dims.frontWheelR, zf, true],
      [tr, dims.wheelR, zr, false],
      [-tr, dims.wheelR, zr, false],
    ];
    for (const [x, r, z, front] of positions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, r, z);
      const spin = new THREE.Group();
      pivot.add(spin);
      const side = Math.sign(x);
      const tireGeo = new THREE.CylinderGeometry(r, r, dims.wheelW, hq ? 24 : 14, 1);
      tireGeo.rotateZ(Math.PI / 2);
      spin.add(new THREE.Mesh(tireGeo, this.tireMat));
      const rim = new THREE.Mesh(new THREE.BufferGeometry(), this.rimMat);
      rim.position.x = side * (dims.wheelW / 2 - 0.02);
      rim.scale.x = side;
      spin.add(rim);
      // brake disc + caliper (non spinning) - player car only, saves draw calls on opponents
      if (hq) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.03, 18), this.brakeMat);
        disc.rotation.z = Math.PI / 2;
        disc.position.x = side * (dims.wheelW / 2 - 0.09);
        pivot.add(disc);
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, r * 0.36, r * 0.24), this.caliperMat);
        cal.position.set(side * (dims.wheelW / 2 - 0.07), r * 0.42, -r * 0.2);
        pivot.add(cal);
      }
      this.group.add(pivot);
      this.wheels.push({ pivot, spin, rim, r, front, side });
    }

    // --- underglow
    this.underglowMat = makeUnderglowMaterial();
    const ug = new THREE.Mesh(new THREE.PlaneGeometry(dims.track + 2.4, dims.length + 2.2), this.underglowMat);
    ug.rotation.x = -Math.PI / 2;
    ug.position.y = 0.035;
    ug.renderOrder = 3;
    this.group.add(ug);
    this.underglow = ug;

    // Store some handy dimensions
    this.length = dims.length;
    this.rearZ = rearZ;
    this.frontZ = frontZ;
    this.wheelR = dims.wheelR;
  }

  /** Build from a prepared real 3D model (see car-assets.js). */
  _buildFromAsset(asset) {
    const hq = this.opts.hq;
    const dims = asset.dims;
    this.isAsset = true;
    const root = asset.scene.clone(true);
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });
    this.sharedMeshes = new Set(meshes);

    // materials we drive (paint colour/finish, glass, brake lights, tyres, rims)
    this.bodyMat = hq ? new THREE.MeshPhysicalMaterial({ color: 0xffffff }) : new THREE.MeshStandardMaterial({ color: 0xffffff });
    this.arches = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 99));
    patchBody(this.bodyMat, this.arches, this.streak);
    this.glassMat = hq
      ? new THREE.MeshPhysicalMaterial({ color: 0x07090f, metalness: 0.3, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 })
      : new THREE.MeshStandardMaterial({ color: 0x07090f, metalness: 0.5, roughness: 0.1, envMapIntensity: 1.5 });
    patchGlass(this.glassMat, this.streak);
    this.tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.12, 0.2) });
    this.headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 3.8, 4.5) });
    this.tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.92, metalness: 0.0 });
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0x555a63, metalness: 0.9, roughness: 0.28 });
    meshes.forEach((m, k) => {
      const info = asset.infos[k];
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((orig, j) => {
        switch (info.roles[j]) {
          case 'paint':
            return this.bodyMat;
          case 'glass':
            return this.glassMat;
          case 'tail':
            return this.tailMat;
          case 'head':
            return this.headMat;
          case 'tire':
            return this.tireMat;
          case 'rim':
            return this.rimMat;
          default:
            return orig;
        }
      });
      m.material = Array.isArray(m.material) ? out : out[0];
    });

    // wheels: re-parent each corner's parts under a pivot at the wheel centre so they can spin/steer
    this.wheels = [];
    this.wheelR = 0.35;
    if (asset.wheels) {
      const byCorner = { LF: [], RF: [], LB: [], RB: [] };
      meshes.forEach((m, k) => {
        const c = asset.infos[k].corner;
        if (c) byCorner[c].push(m);
      });
      for (const corner of Object.keys(byCorner)) {
        const w = asset.wheels[corner];
        const pivot = new THREE.Group();
        pivot.position.copy(w.center);
        const spin = new THREE.Group();
        pivot.add(spin);
        this.group.add(pivot);
        const inv = new THREE.Matrix4().makeTranslation(-w.center.x, -w.center.y, -w.center.z);
        for (const m of byCorner[corner]) {
          const M = inv.clone().multiply(m.matrixWorld);
          m.removeFromParent();
          spin.add(m);
          M.decompose(m.position, m.quaternion, m.scale);
        }
        this.wheels.push({ pivot, spin, rim: null, r: w.radius, front: corner[1] === 'F', side: corner[0] === 'L' ? 1 : -1 });
      }
      this.wheelR = asset.wheels.LB.radius;
    }
    this.body.add(root);

    // lights, exhaust, flames and underglow sized from the model
    this.tailLightPos = asset.tail.map((v) => v.clone().setZ(Math.min(v.z, dims.rearZ + 0.25) - 0.05));
    const rearZ = dims.rearZ;
    const exX = [-dims.halfWidth * 0.36, dims.halfWidth * 0.36];
    const exY = Math.max(0.22, dims.height * 0.24);
    this.exhaustGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.1, 0.02) });
    this.flameMat = makeFlameMaterial();
    const flameGeo = [];
    for (const x of exX) {
      const cone = new THREE.ConeGeometry(0.09, 1.1, 10, 1, true);
      cone.rotateX(-Math.PI / 2);
      cone.translate(x, exY, -0.55);
      flameGeo.push(cone);
    }
    this.flames = new THREE.Mesh(mergeGeometries(flameGeo.map((g) => g.toNonIndexed())), this.flameMat);
    this.flames.position.z = rearZ - 0.02;
    this.flames.visible = false;
    this.flames.renderOrder = 5;
    this.body.add(this.flames);
    this.exhaustPos = exX.map((x) => new THREE.Vector3(x, exY, rearZ - 0.05));
    this.underglowMat = makeUnderglowMaterial();
    const ug = new THREE.Mesh(new THREE.PlaneGeometry(dims.width + 0.6, dims.length + 1.4), this.underglowMat);
    ug.rotation.x = -Math.PI / 2;
    ug.position.y = 0.035;
    ug.renderOrder = 3;
    this.group.add(ug);
    this.underglow = ug;
    this.length = dims.length;
    this.rearZ = rearZ;
    this.frontZ = dims.frontZ;
  }

  _buildShadow() {
    const flames = this.flames;
    if (flames) this.body.remove(flames);
    const box = new THREE.Box3().setFromObject(this.body);
    if (flames) this.body.add(flames);
    const hx = Math.max(0.6, (box.max.x - box.min.x) / 2);
    const hz = Math.max(1.2, (box.max.z - box.min.z) / 2);
    this.shadowMat = makeShadowMaterial();
    this.shadowMat.uniforms.uHalf.value.set(hx, hz);
    this.shadowMat.uniforms.uCenter.value.set((box.max.x + box.min.x) / 2, (box.max.z + box.min.z) / 2);
    const fw = this.wheels.find((w) => w.front);
    const rw = this.wheels.find((w) => !w.front);
    if (fw && rw) {
      this.shadowMat.uniforms.uWheels.value.set(fw.pivot.position.z, rw.pivot.position.z, Math.abs(rw.pivot.position.x), (rw.w ?? 0.3) * 0.45);
    }
    const geo = new THREE.PlaneGeometry(hx * 2 + SHADOW_MARGIN * 2, hz * 2 + SHADOW_MARGIN * 2);
    geo.rotateX(-Math.PI / 2);
    geo.translate((box.max.x + box.min.x) / 2, 0.02, (box.max.z + box.min.z) / 2);
    this.shadow = new THREE.Mesh(geo, this.shadowMat);
    this.shadow.renderOrder = 2;
    this.group.add(this.shadow);
  }

  /** Build from a car-factory model: body + lights from the .glb, detailed wheels generated here. */
  _buildFromFactory(asset) {
    const hq = this.opts.hq;
    // finely tessellated wheels with brake discs and calipers (opts.wheelHQ, default: hq)
    this.wheelHQ = this.opts.wheelHQ ?? hq;
    const meta = asset.meta;
    const dims = asset.dims;
    const env = this.opts.envMap;
    this.isAsset = true;
    this.isFactory = true;
    this.sharedGeometries = new Set();
    this.arches = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 99));

    // ---- materials, matched to the model's parts by name
    const Phys = hq ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    this.bodyMat = new Phys({ color: 0xffffff, vertexColors: true });
    // livery + panel gaps painted into an atlas of orthographic views and projected in the shader
    const res = this.opts.liveryRes ?? (hq ? 1024 : 512);
    this.liveryCanvas = document.createElement('canvas');
    this.liveryCanvas.width = res;
    this.liveryCanvas.height = res;
    this.liveryTex = new THREE.CanvasTexture(this.liveryCanvas);
    this.liveryTex.colorSpace = THREE.SRGBColorSpace;
    this.liveryTex.flipY = false;
    this.liveryTex.anisotropy = 8;
    const bmin = new THREE.Vector3(dims.halfWidth * -1, 0, dims.rearZ);
    const bsize = new THREE.Vector3(dims.width, dims.height, dims.length);
    this.liveryLayout = {
      min: [bmin.x, bmin.y, bmin.z],
      max: [bmin.x + bsize.x, bmin.y + bsize.y, bmin.z + bsize.z],
      panels: meta.panels,
      livery: meta.livery,
      wheels: meta.wheels,
    };
    patchBody(this.bodyMat, this.arches, this.streak, { map: this.liveryTex, min: bmin, size: bsize });
    this.glassMat = hq
      ? new THREE.MeshPhysicalMaterial({ color: 0x06080c, metalness: 0.3, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, vertexColors: true })
      : new THREE.MeshStandardMaterial({ color: 0x06080c, metalness: 0.5, roughness: 0.1, envMapIntensity: 1.5, vertexColors: true });
    patchGlass(this.glassMat, this.streak);
    this.trimMat = withAO(new THREE.MeshStandardMaterial({ color: 0x0b0c0f, metalness: 0.05, roughness: 0.6, vertexColors: true }));
    this.carbonMat = makeCarbonMaterial(hq);
    this.chromeMat = withAO(new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 1, roughness: 0.07, vertexColors: true }));
    this.grilleMat = makeGrilleMaterial();
    // smoked-chrome lamp housings: the LED graphics and lenses carry the look, not a grey box
    this.headHousingMat = withAO(new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 1, roughness: 0.18, emissive: new THREE.Color(0.018, 0.02, 0.026), vertexColors: true }));
    this.tailLensMat = withAO(new Phys({ color: 0x3a0306, metalness: 0.1, roughness: 0.12, emissive: new THREE.Color(0.5, 0.02, 0.035), vertexColors: true }));
    // clear reverse-lamp lens: pale beside the lit tail lamps, white while backing up (see update)
    this.reverseMat = withAO(new Phys({ color: 0xb8bcc4, metalness: 0.6, roughness: 0.12, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.1, vertexColors: true }));
    this.tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.12, 0.2) });
    this.headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.5, 4.2) });
    this.lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.3, 2.6) });
    // amber lamp lenses (turn signals lit as position lamps), on the cars that have them
    if (asset.lods.lod0.some((p) => p.role === 'amber')) this.amberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.72, 0.1) });
    this.exhaustGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.1, 0.02) });
    this.tireMat = withAO(new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.85, metalness: 0, envMapIntensity: 0.5, vertexColors: true }));
    this.rimMat = withAO(
      hq
        ? new THREE.MeshPhysicalMaterial({ color: 0x555a63, metalness: 0.9, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.08, vertexColors: true })
        : new THREE.MeshStandardMaterial({ color: 0x555a63, metalness: 0.9, roughness: 0.28, vertexColors: true }),
      'rim',
    );
    this.brakeMat = withAO(new THREE.MeshStandardMaterial({ color: 0x5a5c62, metalness: 0.85, roughness: 0.36, vertexColors: true }), 'brake');
    this.caliperMat = withAO(new Phys({ color: 0xd01020, metalness: 0.2, roughness: 0.3, vertexColors: true, ...(hq ? { clearcoat: 1, clearcoatRoughness: 0.05 } : {}) }), 'caliper');
    // no baked AO inside: an enclosed cabin bakes almost black, real ones get light through the glass
    this.interiorMat = new THREE.MeshStandardMaterial({ color: 0x2c2c31, metalness: 0.05, roughness: 0.66 });
    this.windowMat = makeWindowMaterial(hq, this.streak);
    // a patrol car's light bar: red and blue lenses, flashed in update()
    if (asset.lods.lod0.some((p) => p.role === 'beaconR')) {
      this.beaconMats = [new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.01, 0.02) }), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.06, 0.4) })];
    }
    for (const m of [this.trimMat, this.carbonMat, this.chromeMat, this.grilleMat, this.headHousingMat, this.tailLensMat, this.reverseMat, this.tireMat, this.rimMat, this.brakeMat, this.caliperMat, this.interiorMat, this.windowMat]) m.envMap = env;
    // crash damage (race cars only): every body material bends with the dents, wheels don't
    if (this.opts.damage) {
      this.damage = new CarDamage(asset, { layout: this.liveryLayout, res: this.opts.damageRes ?? 256 });
      const u = this.damage.u;
      patchDamage(this.bodyMat, u, 'body');
      patchDamage(this.glassMat, u, 'glass');
      patchDamage(this.windowMat, u, 'glass');
      for (const m of [this.trimMat, this.carbonMat, this.chromeMat, this.grilleMat, this.headHousingMat, this.interiorMat, this.exhaustGlowMat]) patchDamage(m, u, 'plain');
      patchDamage(this.headMat, u, 'headBasic');
      patchDamage(this.lensMat, u, 'headBasic');
      if (this.amberMat) patchDamage(this.amberMat, u, 'plain');
      patchDamage(this.tailMat, u, 'tailBasic');
      patchDamage(this.tailLensMat, u, 'tailLens');
      patchDamage(this.reverseMat, u, 'tailLens');
      for (const m of this.beaconMats || []) patchDamage(m, u, 'plain');
    }
    const byRole = {
      paint: this.bodyMat,
      glass: this.glassMat,
      trim: this.trimMat,
      carbon: this.carbonMat,
      chrome: this.chromeMat,
      grille: this.grilleMat,
      head: this.headHousingMat,
      drl: this.headMat,
      lens: this.lensMat,
      amber: this.amberMat,
      tail: this.tailLensMat,
      reverse: this.reverseMat,
      tailglow: this.tailMat,
      exhaust: this.exhaustGlowMat,
      interior: this.interiorMat,
      window: this.windowMat,
      beaconR: this.beaconMats?.[0],
      beaconB: this.beaconMats?.[1],
    };
    // Parts with the same material become one mesh. Far away, parts that read alike at range share
    // a material as well (the glass turns opaque: the light model has no cockpit behind it), so a
    // distant car costs 7 draw calls instead of 13. Merged geometry is kept on the asset and
    // shared by every car built from it.
    const build = (parts, far = false) => {
      const g = new THREE.Group();
      const byMat = new Map();
      for (const p of parts) {
        const role = (far && FAR_ROLE[p.role]) || (byRole[p.role] ? p.role : 'trim');
        if (!byMat.has(role)) byMat.set(role, []);
        byMat.get(role).push(p);
      }
      const merged = asset.merged || (asset.merged = new Map());
      for (const [role, list] of byMat) {
        const key = `${far ? 'far' : 'near'}|${role}`;
        if (list.length > 1 && !merged.has(key)) merged.set(key, mergeGeometries(list.map((p) => p.geometry)));
        const geos = list.length > 1 && merged.get(key) ? [merged.get(key)] : list.map((p) => p.geometry);
        for (const geo of geos) {
          this.sharedGeometries.add(geo);
          const mesh = new THREE.Mesh(geo, byRole[role]);
          if (role === 'window') mesh.renderOrder = 4;
          g.add(mesh);
        }
      }
      return g;
    };
    // the player's car always uses full detail; opponents switch to the light model at range
    const lods = asset.lods;
    const lod = this.opts.lod ?? (hq ? 'near' : 'auto');
    if (lod === 'auto' && lods.lod1) {
      const l = new THREE.LOD();
      l.addLevel(build(lods.lod0), 0);
      l.addLevel(build(lods.lod1, true), 24);
      this.body.add(l);
    } else if (lod === 'far' && lods.lod1) this.body.add(build(lods.lod1, true));
    else this.body.add(build(lods.lod0));

    // ---- wheels: each part of all four wheels is one skinned mesh (see wheelSet), so a car draws
    // each wheel material once. Every wheel has a steering pivot bone with a rolling spin bone.
    this.wheels = [];
    this.blurMat = new THREE.MeshStandardMaterial({ map: wheelBlurTexture(), transparent: true, opacity: 0, metalness: 0.7, roughness: 0.45, depthWrite: false, envMap: env });
    const bones = [];
    this.wheelLayout = [];
    for (const [key, front] of [
      ['front', true],
      ['rear', false],
    ]) {
      const w = meta.wheels[key];
      for (const side of [1, -1]) {
        const pivot = new THREE.Bone();
        pivot.position.set(side * w.x, w.y, w.z);
        const spin = new THREE.Bone();
        pivot.add(spin);
        this.group.add(pivot);
        bones.push(pivot, spin);
        this.wheelLayout.push({ x: side * w.x, y: w.y, z: w.z, r: w.r, w: w.w, rim: w.rim, side });
        this.wheels.push({ pivot, spin, r: w.r, w: w.w, front, side });
      }
    }
    this.group.updateMatrixWorld(true);
    this.wheelSkeleton = new THREE.Skeleton(bones);
    const set = wheelSet(this.wheelLayout, 'split', this.wheelHQ);
    // culled as a whole: a sphere round all four wheels at rest (they only roll and steer in place)
    const bound = set.tyre.boundingSphere.clone();
    bound.radius += 0.1;
    const skinned = (geo, mat) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      this.group.add(m);
      m.bind(this.wheelSkeleton);
      m.boundingSphere = bound;
      return m;
    };
    this.tyreMesh = skinned(set.tyre, this.tireMat);
    this.rimMesh = skinned(set.rim, this.rimMat);
    if (this.wheelHQ) {
      skinned(set.disc, this.brakeMat);
      skinned(set.caliper, this.caliperMat);
    }
    // motion-blurred spokes fade in over the real ones at speed
    this.blurMesh = skinned(set.blur, this.blurMat);
    this.blurMesh.visible = false;
    this.wheelR = meta.wheels.rear.r;

    // ---- lights, exhaust flames, underglow
    this.tailLightPos = meta.tailLights.map((p) => new THREE.Vector3(p[0], p[1], p[2] - 0.04));
    const ex = meta.exhausts;
    this.flameMat = makeFlameMaterial();
    const flameGeo = [];
    for (const p of ex) {
      const cone = new THREE.ConeGeometry(0.075, 1.1, 10, 1, true);
      cone.rotateX(-Math.PI / 2);
      cone.translate(p[0], p[1], -0.55);
      flameGeo.push(cone);
    }
    this.flames = new THREE.Mesh(mergeGeometries(flameGeo.map((g) => g.toNonIndexed())), this.flameMat);
    this.flames.position.z = Math.min(...ex.map((p) => p[2]));
    this.flames.visible = false;
    this.flames.renderOrder = 5;
    this.body.add(this.flames);
    this.exhaustPos = ex.map((p) => new THREE.Vector3(p[0], p[1], p[2] - 0.04));
    this.underglowMat = makeUnderglowMaterial();
    const ug = new THREE.Mesh(new THREE.PlaneGeometry(dims.width + 0.6, dims.length + 1.4), this.underglowMat);
    ug.rotation.x = -Math.PI / 2;
    ug.position.y = 0.035;
    ug.renderOrder = 3;
    this.group.add(ug);
    this.underglow = ug;
    this.length = dims.length;
    this.rearZ = dims.rearZ;
    this.frontZ = dims.frontZ;
  }

  setCustomization(custom) {
    const c = resolveCustom(custom);
    this.custom = c;
    const hq = this.opts.hq;
    // livery (generated cars only - real models keep their own textures)
    if (!this.isAsset && !this.liveryCanvas) {
      this.liveryCanvas = document.createElement('canvas');
      this.liveryCanvas.width = hq ? 1024 : 256;
      this.liveryCanvas.height = hq ? 512 : 128;
      this.liveryTex = new THREE.CanvasTexture(this.liveryCanvas);
      this.liveryTex.colorSpace = THREE.SRGBColorSpace;
      this.liveryTex.flipY = false;
      this.liveryTex.anisotropy = 4;
    }
    const m = this.bodyMat;
    if (this.isFactory) {
      drawProjectedLivery(this.liveryCanvas, this.liveryLayout, c, c.number.value ?? this.opts.number ?? 7);
      this.liveryTex.needsUpdate = true;
      m.map = null;
      m.color.set(0xffffff);
    } else if (this.isAsset) {
      m.map = this.asset.paintMap || null;
      m.color.set(c.paint.color);
    } else {
      drawLivery(this.liveryCanvas, c.livery.id, c.paint.color, c.accent.color, c.number.value ?? this.opts.number ?? 77);
      this.liveryTex.needsUpdate = true;
      m.map = this.liveryTex;
      m.color.set(0xffffff);
    }
    m.emissive.set(0x000000);
    m.emissiveIntensity = 1;
    m.emissiveMap = null;
    m.envMap = this.opts.envMap;
    m.envMapIntensity = 1.25;
    const phys = m.isMeshPhysicalMaterial;
    const set = (metal, rough, cc = 0, ccr = 0.05) => {
      m.metalness = metal;
      m.roughness = rough;
      if (phys) {
        m.clearcoat = cc;
        m.clearcoatRoughness = ccr;
        m.iridescence = 0;
      }
    };
    switch (c.finish.id) {
      case 'metallic':
        set(0.75, 0.3, 1, 0.05);
        break;
      case 'matte':
        set(0.15, 0.72, 0);
        m.envMapIntensity = 0.7;
        break;
      case 'pearl':
        set(0.55, 0.26, 1, 0.04);
        if (phys) {
          m.iridescence = 1;
          m.iridescenceIOR = 1.9;
          m.iridescenceThicknessRange = [250, 900];
        } else m.metalness = 0.85;
        break;
      case 'chrome':
        set(1.0, 0.07, 0.5, 0.02);
        m.envMapIntensity = 1.6;
        break;
      case 'neon':
        set(0.2, 0.38, 1, 0.05);
        m.emissive.set(c.paint.color);
        m.emissiveIntensity = 0.9;
        m.emissiveMap = this.isAsset ? null : this.liveryTex;
        if (this.isFactory) m.emissive.multiplyScalar(0.6);
        break;
      default:
        set(0.2, 0.32, 1, 0.03);
    }
    m.needsUpdate = true;
    this.glassMat.envMap = this.opts.envMap;
    this.rimMat.envMap = this.opts.envMap;
    if (this.windowMat) this.windowMat.envMap = this.opts.envMap;

    // window film: the see-through glass hides more of the cabin; mirror films colour the
    // reflections, on the opaque glass (far away, and on real models) as well
    const tint = c.tint;
    this._glassBase ??= { color: this.glassMat.color.clone(), metal: this.glassMat.metalness };
    if (tint.mirror) {
      this.glassMat.color.set(tint.color).multiplyScalar(0.35);
      this.glassMat.metalness = 0.4 + tint.mirror * 0.5;
    } else {
      this.glassMat.color.copy(this._glassBase.color);
      this.glassMat.metalness = this._glassBase.metal;
    }
    if (this.windowMat) {
      this.windowMat.color.set(tint.color);
      this.windowMat.opacity = tint.shade;
      this.windowMat.metalness = tint.mirror ?? 0;
    }

    // rims (shape swaps exist for generated wheels only)
    if (this.isFactory) {
      this.rimMesh.geometry = wheelSet(this.wheelLayout, c.rims.style, this.wheelHQ).rim;
    } else if (!this.isAsset) {
      const rimGeo = legacyRimGeometry(c.rims.style, this.def.dims.wheelR * 0.74);
      for (const w of this.wheels) {
        w.rim.geometry.dispose();
        w.rim.geometry = rimGeo;
      }
    }
    this.rimMat.color.set(c.rimColor.color);
    if (c.rimColor.glow) {
      this.rimMat.emissive.set(c.rimColor.color);
      this.rimMat.emissiveIntensity = 2.2;
    } else {
      this.rimMat.emissive.set(0x000000);
    }
    this.rimMat.metalness = c.rimColor.id === 'rc_black' ? 0.4 : 0.9;
    if (this.blurMat) {
      this.blurMat.color.set(c.rimColor.color).lerp(new THREE.Color(0xffffff), 0.25);
      this.blurMat.emissive.copy(this.rimMat.emissive);
      this.blurMat.emissiveIntensity = this.rimMat.emissiveIntensity * 0.6;
    }
    // underglow / trail colours
    this.underglowRainbow = c.underglow.color === 'rainbow';
    this.underglow.visible = !!c.underglow.color;
    if (c.underglow.color && !this.underglowRainbow) this.underglowMat.uniforms.uColor.value.set(c.underglow.color).multiplyScalar(2.2);
    this.trailRainbow = c.trail.color === 'rainbow';
    this.trailColor = new THREE.Color(this.trailRainbow ? '#ff2040' : c.trail.color);
    this.caliperMat?.color.set(c.accent.color === c.paint.color ? '#d01020' : c.accent.color);
  }

  /** Visual-only update. state: { speed, steer, brake, boost, drift } */
  update(dt, state) {
    this.time += dt;
    const spinRate = (state.speed || 0) / (this.wheelR || this.def.dims.wheelR);
    this.wheelSpin = (this.wheelSpin + spinRate * dt) % (Math.PI * 2);
    const blurA = this.blurMat ? Math.min(1, Math.max(0, (Math.abs(spinRate) - 14) / 40)) : 0;
    if (this.blurMat) this.blurMat.opacity = blurA * 0.9;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -(state.steer || 0) * 0.42;
      if (w.blur) w.blur.visible = blurA > 0.01;
    }
    if (this.blurMesh) this.blurMesh.visible = blurA > 0.01;
    // brake discs glow after hard stops from speed
    if (this.isFactory && this.brakeMat) {
      const sp = Math.abs(state.speed || 0);
      const load = (state.brake ? 1.4 : 0) + (state.drift ? 0.45 : 0);
      const heat = (this.brakeHeat || 0) + (sp / 60) * load * dt - dt * 0.3;
      this.brakeHeat = Math.min(1, Math.max(0, heat));
      const h = this.brakeHeat;
      this.brakeMat.emissive.setRGB(2.0 * h * h, 0.32 * h * h * h, 0.02 * h * h * h);
    }
    // light bar: red and blue double flashes in turn (or a slow alternating glow)
    if (this.beaconMats) {
      let red;
      let blue;
      if (calmBeacons) {
        const w = 0.5 + 0.5 * Math.sin(this.time * 2.2);
        red = 0.15 + 0.6 * w;
        blue = 0.15 + 0.6 * (1 - w);
      } else {
        const ph = (this.time * 1.3) % 1;
        const pulse = (a) => (ph > a && ph < a + 0.08) || (ph > a + 0.14 && ph < a + 0.22);
        red = pulse(0) ? 1 : 0.05;
        blue = pulse(0.5) ? 1 : 0.05;
      }
      this.beaconMats[0].color.setRGB(6 * red, 0.12 * red, 0.2 * red);
      this.beaconMats[1].color.setRGB(0.2 * blue, 0.9 * blue, 7 * blue);
    }
    // brake lights
    this.brake += ((state.brake ? 1 : 0) - this.brake) * Math.min(1, dt * 18);
    const tb = 1 + this.brake * 1.6;
    this.tailMat.color.setRGB(4 * tb, 0.12 * tb, 0.2 * tb);
    if (this.tailLensMat) this.tailLensMat.emissiveIntensity = 1 + this.brake * 2.2;
    // reverse lamps
    this.reverse += ((state.reverse ? 1 : 0) - this.reverse) * Math.min(1, dt * 14);
    if (this.reverseMat) this.reverseMat.emissiveIntensity = 0.1 + this.reverse * 3;
    // boost flames
    this.boost += ((state.boost || 0) - this.boost) * Math.min(1, dt * 10);
    this.backfire = Math.max(0, this.backfire - dt * 6);
    const fp = Math.max(this.boost, this.backfire);
    this.flames.visible = fp > 0.02;
    this.flameMat.uniforms.uPower.value = fp;
    const flameLen = this.opts.hq ? 1 : 0.6;
    this.flames.scale.set(1, 1, (0.45 + fp * 0.6 + Math.random() * 0.15 * fp) * flameLen);
    if (this.backfire > this.boost) this.flameMat.uniforms.uColor.value.setRGB(1.4, 0.55, 0.1);
    else this.flameMat.uniforms.uColor.value.setRGB(0.25, 0.5, 1.4);
    const idle = this.isFactory ? 0.06 : 0.3;
    this.exhaustGlowMat.color.setRGB(idle + fp * 1.4, idle * 0.27 + fp * 0.6, idle * 0.07 + fp * 0.9);
    if (this.underglowRainbow && this.underglow.visible) {
      this.underglowMat.uniforms.uColor.value.setHSL((this.time * 0.25) % 1, 1, 0.5).multiplyScalar(2.2);
    }
    if (this.trailRainbow) this.trailColor.setHSL((this.time * 0.35) % 1, 1, 0.55);
    if (this.damage) this.damage.update(dt);
  }

  /** Moving light streak reflections (phase advances with distance travelled). */
  setStreaks(phase, intensity, color, fwd) {
    const u = this.streak;
    u.uStreakPhase.value = phase;
    u.uStreakInt.value = intensity;
    if (color) u.uStreakColor.value.copy(color);
    if (fwd) u.uCarFwd.value.copy(fwd);
  }

  triggerBackfire() {
    this.backfire = 1;
  }

  setBodyTilt(roll, pitch, yaw = 0) {
    this.body.rotation.set(pitch, yaw, roll);
  }

  /**
   * Road shadow for this frame. air: height above the road. Per lamp (two strongest): (x, z) the
   * direction away from it in car space (unit), len how far the cast shadow reaches (m), s 0..1.
   */
  setShadow(air, x1 = 0, z1 = 0, len1 = 0, s1 = 0, x2 = 0, z2 = 0, len2 = 0, s2 = 0) {
    if (!this.shadowMat) return;
    const u = this.shadowMat.uniforms;
    const max = SHADOW_MARGIN - 0.6;
    u.uCast.value.set(x1, z1, Math.min(len1, max), s1);
    u.uCast2.value.set(x2, z2, Math.min(len2, max), s2);
    const h = Math.max(0, air);
    u.uSoft.value = Math.min(h * 0.35, 1.2);
    u.uOpacity.value = 1 / (1 + h * 0.45);
    this.shadow.position.y = -h;
  }

  setGhost(color = 0x40e0ff) {
    const holo = makeHologramMaterial(color);
    this.group.traverse((o) => {
      if (o.isMesh && o !== this.underglow && o !== this.flames && o !== this.beam && o !== this.shadow) {
        o.material = holo;
        o.renderOrder = 6;
      }
    });
    this.underglow.visible = false;
    if (this.beam) this.beam.visible = false;
    if (this.shadow) this.shadow.visible = false;
    this.ghostMat = holo;
  }

  setEnvRotation(euler) {
    for (const m of [this.bodyMat, this.glassMat, this.trimMat, this.carbonMat, this.chromeMat, this.grilleMat, this.headHousingMat, this.tailLensMat, this.tireMat, this.rimMat, this.brakeMat, this.caliperMat, this.interiorMat, this.windowMat]) {
      if (m && m.envMapRotation) m.envMapRotation.copy(euler);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      // geometry of real models (and generated wheels) is shared between every car using it
      if (!o.isMesh) return;
      if (this.sharedMeshes && this.sharedMeshes.has(o)) return;
      if (this.sharedGeometries && this.sharedGeometries.has(o.geometry)) return;
      if (isSharedWheelGeometry(o.geometry)) return;
      o.geometry.dispose();
    });
    for (const m of [this.bodyMat, this.glassMat, this.trimMat, this.tailMat, this.headMat, this.tireMat, this.rimMat, this.brakeMat, this.caliperMat, this.flameMat, this.underglowMat, this.exhaustGlowMat, this.beamMat, this.carbonMat, this.chromeMat, this.grilleMat, this.headHousingMat, this.tailLensMat, this.reverseMat, this.lensMat, this.shadowMat, this.blurMat, this.interiorMat, this.windowMat, this.amberMat, ...(this.beaconMats || [])]) m?.dispose();
    if (this.liveryTex) this.liveryTex.dispose();
    if (this.damage) this.damage.dispose();
    this.wheelSkeleton?.dispose();
    // (once only: another car may share the model)
    if (!this.released) releaseCarAsset(this.asset);
    this.released = true;
  }
}
