import * as THREE from 'three';
import { setProjView, tileRect } from './car-livery.js';

// Cosmetic crash damage for car-factory models (handling is untouched):
//  - dents: up to MAX_DENTS impact points push the skin in, in the vertex shader, with the
//    reflections bent and creased - so every car keeps sharing one copy of its geometry
//  - scuffs: paint scraped to primer / bare metal in a mask laid out like the livery atlas
//  - bumper corners that sag and a bonnet buckled into a ridge
//  - cracked glass, lamps that flicker after a knock and go dark once broken
// Everything is driven by uniforms shared by the car's materials, and costs nothing until the
// car is first hit.

export const MAX_DENTS = 8;
const MAX_CRACKS = 4;
const MAX_DEPTH = 0.12; // m

// ------------------------------------------------------------------------------------------
// Shaders
// ------------------------------------------------------------------------------------------

const VERT_PARS = /* glsl */ `
#define DMG_DENTS ${MAX_DENTS}
uniform float uDmgOn;
uniform vec4 uDentA[DMG_DENTS]; // xyz centre on the skin (car space), w radius
uniform vec4 uDentB[DMG_DENTS]; // xyz push direction, w depth (0 = unused)
uniform vec4 uBend;             // sag of the bumper corners: front L, front R, rear L, rear R
uniform vec4 uDmgBox;           // half width, front z, rear z, bonnet buckle
varying float vDent;
varying vec3 vDmgPos;
varying vec3 vDmgNrm;
vec3 gDmgOff = vec3(0.0);
float gDmgDone = 0.0;
// how far the skin at p (normal n) has been pushed; w gathers how dented the spot is
vec3 dmgOffset(vec3 p, vec3 n, inout float w) {
  vec3 off = vec3(0.0);
  for (int i = 0; i < DMG_DENTS; i++) {
    vec4 b = uDentB[i];
    if (b.w <= 0.0) continue;
    vec4 a = uDentA[i];
    vec3 q = p - a.xyz;
    float d2 = dot(q, q) / (a.w * a.w);
    if (d2 >= 1.0) continue;
    float f = (1.0 - d2) * (1.0 - d2);
    off += b.xyz * (b.w * f);
    w += f * min(b.w * 18.0, 1.0);
  }
  float hw = uDmgBox.x;
  if (uBend.x + uBend.y + uBend.z + uBend.w > 0.0) {
    // the outer end of a bumper drops and pulls away from the body
    float low = 1.0 - smoothstep(0.4, 0.8, p.y);
    float fz = smoothstep(uDmgBox.y - 0.85, uDmgBox.y - 0.02, p.z);
    float rz = smoothstep(uDmgBox.z + 0.85, uDmgBox.z + 0.02, p.z);
    fz *= fz * low;
    rz *= rz * low;
    float sl = smoothstep(0.0, hw, p.x);
    float sr = smoothstep(0.0, hw, -p.x);
    off += (uBend.x * sl * fz) * vec3(0.035, -0.08, 0.045);
    off += (uBend.y * sr * fz) * vec3(-0.035, -0.08, 0.045);
    off += (uBend.z * sl * rz) * vec3(0.03, -0.07, -0.04);
    off += (uBend.w * sr * rz) * vec3(-0.03, -0.07, -0.04);
  }
  if (uDmgBox.w > 0.0) {
    // bonnet folded up into a ridge (and a smaller one behind it) across the front deck
    float u1 = (p.z - (uDmgBox.y - 0.85)) / 0.13;
    float u2 = (p.z - (uDmgBox.y - 0.55)) / 0.09;
    float ridge = exp(-u1 * u1) + 0.55 * exp(-u2 * u2);
    float deck = smoothstep(0.45, 0.8, n.y) * (1.0 - smoothstep(hw * 0.4, hw * 0.78, abs(p.x)));
    off.y += uDmgBox.w * 0.05 * ridge * deck;
  }
  return off;
}
`;

// runs right after <beginnormal_vertex>: displaced skin + its normal from finite differences
const VERT_NORMAL = /* glsl */ `
vDmgNrm = objectNormal;
vDent = 0.0;
if (uDmgOn > 0.5) {
  vec3 dn = normalize(objectNormal);
  float w0 = 0.0;
  float w1 = 0.0;
  gDmgOff = dmgOffset(position, dn, w0);
  vec3 t1 = normalize(cross(dn, abs(dn.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(dn, t1);
  vec3 e1 = t1 * 0.02 + dmgOffset(position + t1 * 0.02, dn, w1) - gDmgOff;
  vec3 e2 = t2 * 0.02 + dmgOffset(position + t2 * 0.02, dn, w1) - gDmgOff;
  objectNormal = normalize(cross(e1, e2));
  vDent = min(w0, 1.0);
}
gDmgDone = 1.0;
`;

// after <begin_vertex> (materials without normals, e.g. unlit lamps, only get here)
const VERT_POS = /* glsl */ `
vDmgPos = position;
if (gDmgDone < 0.5) {
  vDmgNrm = normal;
  vDent = 0.0;
  if (uDmgOn > 0.5) {
    float w0 = 0.0;
    gDmgOff = dmgOffset(position, normalize(normal), w0);
    vDent = min(w0, 1.0);
  }
}
transformed += gDmgOff;
`;

// ---- paint: scuff mask + creased metal in the dents
const BODY_PARS = /* glsl */ `
uniform float uDmgOn;
uniform sampler2D uDmgMap;
uniform float uDmgMapOn;
varying float vDent;
varying vec3 vDmgPos;
varying vec3 vDmgNrm;
float dmgHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dmgNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dmgHash(i), dmgHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(dmgHash(i + vec3(0.0, 1.0, 0.0)), dmgHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(dmgHash(i + vec3(0.0, 0.0, 1.0)), dmgHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(dmgHash(i + vec3(0.0, 1.0, 1.0)), dmgHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
// creased sheet metal: ridged noise
float dmgCrumple(vec3 p) {
  return (1.0 - abs(dmgNoise(p * 13.0) * 2.0 - 1.0)) * 0.65 + (1.0 - abs(dmgNoise(p * 29.0 + 7.1) * 2.0 - 1.0)) * 0.35;
}
// bump the normal by a height field given as its screen-space derivatives (Mikkelsen)
vec3 dmgBump(vec3 pos, vec3 n, vec2 dH) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(max(abs(det), 1e-12) * n - g);
}
#ifdef USE_PROJ_LIVERY
vec3 dmgTile(vec4 tile, vec2 st) {
  return texture2D(uDmgMap, tile.xy + clamp(st, 0.002, 0.998) * tile.zw).rgb;
}
#endif
`;

// before <alphamap_fragment>: r = scuffed to primer, g = bare metal, b = grime
const BODY_COLOR = /* glsl */ `
float dScuff = 0.0;
float dMetal = 0.0;
float dSoot = 0.0;
#ifdef USE_PROJ_LIVERY
if (uDmgMapOn > 0.5) {
  vec3 dp = (vDmgPos - uLivMin) / uLivSize;
  vec3 dn = normalize(vDmgNrm);
  vec3 dw = vec3(pow(abs(dn.x), 3.0) + 0.002, pow(max(dn.y, 0.0), 3.0), pow(abs(dn.z), 3.0));
  dw /= (dw.x + dw.y + dw.z);
  vec3 dS = dn.x > 0.0 ? dmgTile(uTileL, vec2(1.0 - dp.z, 1.0 - dp.y)) : dmgTile(uTileR, vec2(dp.z, 1.0 - dp.y));
  vec3 dT = dmgTile(uTileT, vec2(1.0 - dp.z, dp.x));
  vec3 dE = dn.z > 0.0 ? dmgTile(uTileF, vec2(dp.x, 1.0 - dp.y)) : dmgTile(uTileB, vec2(1.0 - dp.x, 1.0 - dp.y));
  vec3 D = dS * dw.x + dT * dw.y + dE * dw.z;
  dScuff = clamp(D.r, 0.0, 1.0);
  dMetal = clamp(D.g, 0.0, 1.0);
  dSoot = clamp(D.b, 0.0, 1.0);
  float dAO = 1.0;
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    dAO = vColor.r;
  #endif
  // scratched clear coat and primer scatter light: they read pale, even on dark paint
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.3, 0.31) * dAO, dScuff * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.56, 0.58) * dAO, dMetal);
  diffuseColor.rgb *= 1.0 - 0.6 * dSoot;
}
#endif
`;

// before <normal_fragment_begin>
const BODY_PBR = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.62, dScuff);
roughnessFactor = mix(roughnessFactor, 0.3, dMetal);
metalnessFactor = mix(metalnessFactor, 0.0, dScuff);
metalnessFactor = mix(metalnessFactor, 1.0, dMetal);
`;

// before <clearcoat_normal_fragment_begin> (derivatives stay in uniform control flow)
const BODY_BUMP = /* glsl */ `
vec2 dmgDH = vec2(0.0);
if (uDmgOn > 0.5) {
  float dmgH = vDent > 0.001 ? vDent * dmgCrumple(vDmgPos) * 0.006 : 0.0;
  dmgDH = vec2(dFdx(dmgH), dFdy(dmgH));
  normal = dmgBump(-vViewPosition, normal, dmgDH);
}
`;

// before <emissivemap_fragment>
const BODY_COAT_NORMAL = /* glsl */ `
#ifdef USE_CLEARCOAT
if (uDmgOn > 0.5) clearcoatNormal = dmgBump(-vViewPosition, clearcoatNormal, dmgDH);
#endif
`;

// before <lights_physical_fragment>: scraped paint stops glowing (neon finish)
const BODY_EMISSIVE = /* glsl */ `
totalEmissiveRadiance *= 1.0 - max(dScuff, dMetal);
`;

// before <lights_fragment_begin>: no clear coat left where it's scraped
const BODY_COAT = /* glsl */ `
#ifdef USE_CLEARCOAT
material.clearcoat *= 1.0 - 0.9 * max(dScuff, dMetal);
#endif
`;

// ---- glass: spider-web cracks
const GLASS_PARS = /* glsl */ `
#define DMG_CRACKS ${MAX_CRACKS}
uniform float uDmgOn;
uniform vec4 uCrack[DMG_CRACKS]; // xyz impact point on the glass (car space), w strength
varying vec3 vDmgPos;
varying vec3 vDmgNrm;
float dmgH1(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}
// px: metres per pixel here (lines stay about a pixel wide, then blur to a milky patch at range)
float dmgCracks(vec3 p, vec3 n, float px) {
  float sum = 0.0;
  for (int i = 0; i < DMG_CRACKS; i++) {
    vec4 c = uCrack[i];
    if (c.w <= 0.0) continue;
    vec3 v = p - c.xyz;
    float R = 0.14 + 0.4 * c.w;
    float r = length(v);
    if (r > R) continue;
    vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(n, t1);
    float a = atan(dot(v, t2), dot(v, t1));
    float seed = float(i) * 7.31 + c.x * 13.7 + c.z * 3.1;
    // radial cracks: nearly straight, unevenly spaced, of different lengths
    float k = (a + 3.14159265) / 6.2831853 * 13.0;
    float cell = floor(k);
    float ang = (cell + 0.5 + (dmgH1(cell + seed) - 0.5) * 0.5) / 13.0 * 6.2831853 - 3.14159265 + 0.035 * sin(r * 23.0 + cell * 1.7);
    float lat = abs(sin(a - ang)) * r;
    float len = R * (0.4 + 0.6 * dmgH1(cell * 3.7 + seed));
    float spoke = (1.0 - smoothstep(px * 0.4, px, lat)) * (1.0 - smoothstep(len * 0.6, len, r));
    // concentric cracks: straight chords between neighbouring spokes, not every gap
    float ring = 0.0;
    float chord = r * cos(a - ((cell + 0.5) / 13.0 * 6.2831853 - 3.14159265));
    for (int m = 0; m < 3; m++) {
      float fm = float(m);
      if (dmgH1(cell * 1.9 + fm * 5.3 + seed) < 0.45) continue;
      float rr = R * (0.12 + 0.17 * fm) * (0.85 + 0.3 * dmgH1(cell * 2.3 + fm + seed));
      ring = max(ring, 1.0 - smoothstep(px * 0.4, px, abs(chord - rr)));
    }
    float core = 1.0 - smoothstep(0.012 + 0.02 * c.w, 0.03 + 0.03 * c.w, r);
    float fade = 1.0 - smoothstep(R * 0.5, R, r);
    float lines = max(max(spoke, ring * 0.8) * (0.5 + 0.5 * fade), core);
    float haze = fade * 0.35;
    sum = max(sum, mix(lines, haze, smoothstep(0.004, 0.012, px)) * min(c.w * 1.6, 1.0));
  }
  return sum;
}
`;

// before <alphamap_fragment>
const GLASS_COLOR = /* glsl */ `
float dCrack = 0.0;
if (uDmgOn > 0.5) {
  float dPx = length(fwidth(vDmgPos));
  dCrack = dmgCracks(vDmgPos, normalize(vDmgNrm), dPx);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.38, 0.4), dCrack);
  diffuseColor.a = mix(diffuseColor.a, 1.0, dCrack * 0.7);
}
`;

const GLASS_PBR = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.5, dCrack);
`;

// crushed glass scatters whatever light there is
const GLASS_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += vec3(0.03, 0.033, 0.036) * dCrack;
`;

// ---- lamps: x > 0 is the car's left
const LAMP_PARS = /* glsl */ `
uniform vec2 uLamp; // brightness of the left / right lamp (0 = broken)
varying vec3 vDmgPos;
`;

const LAMP_BASIC = /* glsl */ `
diffuseColor.rgb *= mix(0.012, 1.0, vDmgPos.x > 0.0 ? uLamp.x : uLamp.y);
`;

const LENS_COLOR = /* glsl */ `
float dLamp = vDmgPos.x > 0.0 ? uLamp.x : uLamp.y;
diffuseColor.rgb *= mix(0.4, 1.0, dLamp);
`;

const LENS_EMISSIVE = /* glsl */ `
totalEmissiveRadiance *= dLamp;
`;

const FRAG = {
  body: {
    pars: BODY_PARS,
    at: [
      ['#include <alphamap_fragment>', BODY_COLOR],
      ['#include <normal_fragment_begin>', BODY_PBR],
      ['#include <clearcoat_normal_fragment_begin>', BODY_BUMP],
      ['#include <emissivemap_fragment>', BODY_COAT_NORMAL],
      ['#include <lights_physical_fragment>', BODY_EMISSIVE],
      ['#include <lights_fragment_begin>', BODY_COAT],
    ],
  },
  glass: {
    pars: GLASS_PARS,
    at: [
      ['#include <alphamap_fragment>', GLASS_COLOR],
      ['#include <normal_fragment_begin>', GLASS_PBR],
      ['#include <lights_physical_fragment>', GLASS_EMISSIVE],
    ],
  },
  headBasic: { pars: LAMP_PARS, at: [['#include <alphamap_fragment>', LAMP_BASIC]] },
  tailBasic: { pars: LAMP_PARS, at: [['#include <alphamap_fragment>', LAMP_BASIC]] },
  tailLens: {
    pars: LAMP_PARS,
    at: [
      ['#include <alphamap_fragment>', LENS_COLOR],
      ['#include <lights_physical_fragment>', LENS_EMISSIVE],
    ],
  },
  plain: null,
};

function before(src, anchor, code) {
  if (!src.includes(anchor)) {
    console.warn(`[damage] shader anchor missing: ${anchor}`);
    return src;
  }
  return src.replace(anchor, `${code}\n${anchor}`);
}

/**
 * Add damage to a car material, on top of whatever it already patches.
 * kind: 'body' | 'glass' | 'headBasic' | 'tailBasic' | 'tailLens' | 'plain'
 */
export function patchDamage(mat, u, kind) {
  const prev = mat.onBeforeCompile;
  const key = `${mat.customProgramCacheKey()}|dmg-${kind}`;
  const frag = FRAG[kind];
  mat.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, { uDmgOn: u.uDmgOn, uDentA: u.uDentA, uDentB: u.uDentB, uBend: u.uBend, uDmgBox: u.uDmgBox });
    if (kind === 'body') Object.assign(shader.uniforms, { uDmgMap: u.uDmgMap, uDmgMapOn: u.uDmgMapOn });
    else if (kind === 'glass') shader.uniforms.uCrack = u.uCrack;
    else if (kind === 'headBasic') shader.uniforms.uLamp = u.uLampHead;
    else if (kind === 'tailBasic' || kind === 'tailLens') shader.uniforms.uLamp = u.uLampTail;
    let vs = before(shader.vertexShader, 'void main() {', VERT_PARS);
    vs = before(vs, '#include <morphnormal_vertex>', VERT_NORMAL);
    shader.vertexShader = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_POS}`);
    if (frag) {
      let fs = before(shader.fragmentShader, 'void main() {', frag.pars);
      for (const [anchor, code] of frag.at) fs = before(fs, anchor, code);
      shader.fragmentShader = fs;
    }
  };
  mat.customProgramCacheKey = () => key;
}

// ------------------------------------------------------------------------------------------
// Where hits land: a coarse picture of the body built from the light model
// ------------------------------------------------------------------------------------------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clampI = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);

function thin(list, n) {
  if (list.length <= n) return list;
  const out = [];
  const step = list.length / n;
  for (let i = 0; i < n; i++) out.push(list[Math.floor(i * step)]);
  return out;
}

class Hull {
  constructor(asset) {
    const dm = asset.dims;
    const NZ = (this.NZ = 48);
    const NY = (this.NY = 24);
    const NX = (this.NX = 24);
    this.x0 = -dm.halfWidth;
    this.x1 = dm.halfWidth;
    this.z0 = dm.rearZ;
    this.z1 = dm.frontZ;
    this.y1 = dm.height;
    this.side = new Float32Array(NZ * NY); // widest |x| per (z, y) cell, 0 = empty
    this.front = new Float32Array(NX * NY).fill(NaN); // furthest +z per (x, y) cell
    this.rear = new Float32Array(NX * NY).fill(NaN); // furthest -z per (x, y) cell
    this.top = new Float32Array(NX * NZ).fill(NaN); // highest y per (x, z) cell
    this.glass = { front: [], rear: [], left: [], right: [] };
    const zMid = (this.z0 + this.z1) / 2;
    const add = (x, y, z) => {
      const a = this.iz(z) * NY + this.iy(y);
      if (Math.abs(x) > this.side[a]) this.side[a] = Math.abs(x);
      const b = this.ix(x) * NY + this.iy(y);
      if (z > zMid) {
        if (!(this.front[b] >= z)) this.front[b] = z;
      } else if (!(this.rear[b] <= z)) this.rear[b] = z;
      const c = this.ix(x) * NZ + this.iz(z);
      if (!(this.top[c] >= y)) this.top[c] = y;
    };
    // sample the surfaces every few cm (the light model's vertices are far too sparse on flat panels)
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const C = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const n = new THREE.Vector3();
    const step2 = 0.035 * 0.035;
    for (const part of asset.lods.lod1 || asset.lods.lod0 || []) {
      if (part.role === 'interior') continue;
      const geo = part.geometry;
      const pos = geo.attributes.position;
      const idx = geo.index;
      const glassy = part.role === 'window' || part.role === 'glass';
      const count = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < count; t += 3) {
        A.fromBufferAttribute(pos, idx ? idx.getX(t) : t);
        B.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1);
        C.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2);
        e1.subVectors(B, A);
        e2.subVectors(C, A);
        n.crossVectors(e1, e2);
        const area = n.length() * 0.5;
        const k = Math.min(48, Math.ceil(area / step2));
        let list = null;
        if (glassy && area > 0) {
          n.normalize();
          list = n.x > 0.55 ? this.glass.left : n.x < -0.55 ? this.glass.right : n.y > 0.2 ? (A.z > zMid ? this.glass.front : this.glass.rear) : null;
        }
        for (let s = 0; s < k; s++) {
          // uniform random point in the triangle
          const r1 = Math.sqrt(Math.random());
          const r2 = Math.random();
          const u = r1 * (1 - r2);
          const v = r1 * r2;
          const x = A.x + e1.x * u + e2.x * v;
          const y = A.y + e1.y * u + e2.y * v;
          const z = A.z + e1.z * u + e2.z * v;
          add(x, y, z);
          if (list) list.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    for (const k of Object.keys(this.glass)) this.glass[k] = thin(this.glass[k], 160);
  }

  ix(x) {
    return clampI(Math.floor(((x - this.x0) / (this.x1 - this.x0)) * this.NX), this.NX);
  }

  iy(y) {
    return clampI(Math.floor((y / this.y1) * this.NY), this.NY);
  }

  iz(z) {
    return clampI(Math.floor(((z - this.z0) / (this.z1 - this.z0)) * this.NZ), this.NZ);
  }

  /**
   * Outermost skin at z between heights ya and yb, preferring heights near yPref (so a hit level
   * with a wheel arch lands on the wing above it, not inside the arch). Sets out.x (>= 0), out.y.
   */
  widest(z, ya, yb, yPref, out) {
    const i = this.iz(z) * this.NY;
    let best = -Infinity;
    out.x = this.x1 * 0.9;
    out.y = yPref;
    for (let j = this.iy(ya); j <= this.iy(yb); j++) {
      const w = this.side[i + j];
      if (!(w > 0)) continue;
      const y = ((j + 0.5) / this.NY) * this.y1;
      const score = w - 0.15 * Math.abs(y - yPref);
      if (score > best) {
        best = score;
        out.x = w;
        out.y = y;
      }
    }
    return out;
  }

  /** Furthest z of the body at (x, y) toward the front (dir > 0) or the rear. */
  endAt(x, y, dir) {
    const arr = dir > 0 ? this.front : this.rear;
    const i = this.ix(x) * this.NY;
    const j = this.iy(y);
    for (let r = 0; r < 6; r++) {
      for (const jj of [j + r, j - r]) {
        if (jj < 0 || jj >= this.NY) continue;
        const v = arr[i + jj];
        if (v === v) return v;
      }
    }
    return dir > 0 ? this.z1 : this.z0;
  }

  topAt(x, z) {
    const v = this.top[this.ix(x) * this.NZ + this.iz(z)];
    return v === v ? v : this.y1 * 0.7;
  }

  /** The point of the body furthest out in direction (wx, wz), between heights ya and yb. */
  support(wx, wz, ya, yb, out) {
    let best = -Infinity;
    const { NX, NY, NZ } = this;
    const sx = wx < 0 ? -1 : 1;
    for (let j = this.iy(ya); j <= this.iy(yb); j++) {
      const y = ((j + 0.5) / NY) * this.y1;
      for (let i = 0; i < NZ; i++) {
        const w = this.side[i * NY + j];
        if (!(w > 0)) continue;
        const z = this.z0 + ((i + 0.5) / NZ) * (this.z1 - this.z0);
        const v = w * Math.abs(wx) + z * wz;
        if (v > best) {
          best = v;
          out.set(sx * w, y, z);
        }
      }
      const ends = wz >= 0 ? this.front : this.rear;
      for (let i = 0; i < NX; i++) {
        const z = ends[i * NY + j];
        if (z !== z) continue;
        const x = this.x0 + ((i + 0.5) / NX) * (this.x1 - this.x0);
        const v = x * wx + z * wz;
        if (v > best) {
          best = v;
          out.set(x, y, z);
        }
      }
    }
    return out;
  }

  /** Glass nearest to p on one face of the car ('front' windscreen, 'rear', 'left', 'right'). */
  nearestGlass(face, p) {
    let best = null;
    let bd = Infinity;
    for (const g of this.glass[face] || []) {
      const d = g.distanceToSquared(p);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }
}

const hulls = new WeakMap();
function hullFor(asset) {
  let h = hulls.get(asset);
  if (!h) hulls.set(asset, (h = new Hull(asset)));
  return h;
}

// ------------------------------------------------------------------------------------------
// Damage state of one car
// ------------------------------------------------------------------------------------------

const _p = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

export class CarDamage {
  /** opts: { layout (livery atlas layout, for the scuff mask), res (mask size, px) } */
  constructor(asset, opts = {}) {
    this.hull = hullFor(asset);
    this.dims = asset.dims;
    this.layout = opts.layout || null;
    this.res = opts.res || 256;
    const lamp = (list, side) => (list || []).find((p) => Math.sign(p.x) === side) || null;
    // head left, head right, tail left, tail right (+x is the car's left)
    this.lamps = [lamp(asset.head, 1), lamp(asset.head, -1), lamp(asset.tail, 1), lamp(asset.tail, -1)];
    this.hp = [1, 1, 1, 1];
    this.on = [1, 1, 1, 1];
    this.flickT = [0, 0, 0, 0];
    this.flickV = [1, 1, 1, 1];
    this.dents = [];
    this.cracks = [];
    this.bend = [0, 0, 0, 0];
    this.hood = 0;
    this.zone = { front: 0, rear: 0, left: 0, right: 0 };
    this.smoke = 0;
    const d = this.dims;
    this.smokePoint = new THREE.Vector3(0, this.hull.topAt(0, d.frontZ - 0.7) + 0.03, d.frontZ - 0.7);
    this.u = {
      uDmgOn: { value: 0 },
      uDentA: { value: Array.from({ length: MAX_DENTS }, () => new THREE.Vector4(0, 0, 0, 1)) },
      uDentB: { value: Array.from({ length: MAX_DENTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uBend: { value: new THREE.Vector4() },
      uDmgBox: { value: new THREE.Vector4(d.halfWidth, d.frontZ, d.rearZ, 0) },
      uDmgMap: { value: null },
      uDmgMapOn: { value: 0 },
      uCrack: { value: Array.from({ length: MAX_CRACKS }, () => new THREE.Vector4()) },
      uLampHead: { value: new THREE.Vector2(1, 1) },
      uLampTail: { value: new THREE.Vector2(1, 1) },
    };
    this.ctx = null;
    this.tex = null;
    this.dirty = false;
    this.sinceUpload = 0;
    this.scrapeAcc = 0;
    this.events = [];
  }

  /** Point on the skin facing car-space direction (wx, wz) (unit), between heights ya and yb. */
  contact(wx, wz, ya, yb, out) {
    const H = this.hull;
    H.support(wx, wz, ya, yb, out);
    if (Math.abs(wx) >= Math.abs(wz) * 0.8) {
      // along a side: spread hits over the panel, back onto the skin
      out.z = clamp(out.z + (Math.random() - 0.5) * 0.8, H.z0 + 0.15, H.z1 - 0.15);
      H.widest(out.z, ya, yb, out.y, out);
      if (wx < 0) out.x = -out.x;
    } else {
      out.x = clamp(out.x + (Math.random() - 0.5) * 0.7, H.x0 * 0.85, H.x1 * 0.85);
      out.z = H.endAt(out.x, out.y, wz);
    }
    return out;
  }

  /** Point on the skin of the face toward (wx, wz) (unit), nearest to car-space spot `mid`. */
  contactAt(mid, wx, wz, out) {
    const H = this.hull;
    if (Math.abs(wx) >= Math.abs(wz)) {
      out.z = clamp(mid.z + (Math.random() - 0.5) * 0.5, H.z0 + 0.15, H.z1 - 0.15);
      H.widest(out.z, 0.3, 0.75, 0.4 + Math.random() * 0.2, out);
      if (wx < 0) out.x = -out.x;
    } else {
      out.y = 0.34 + Math.random() * 0.3;
      out.x = clamp(mid.x + (Math.random() - 0.5) * 0.5, H.x0 * 0.85, H.x1 * 0.85);
      out.z = H.endAt(out.x, out.y, wz);
    }
    return out;
  }

  /** A hit (a wall) from car-space direction (lx, lz) at `strength` m/s - the part sticking out furthest takes it. */
  hitToward(lx, lz, strength) {
    const l = Math.hypot(lx, lz) || 1;
    const p = this.contact(lx / l, lz / l, 0.32, 0.72, _p);
    return this.hit(p, _o.set(lx / l, 0, lz / l), strength);
  }

  /** A hit (another car) on the face toward car-space (lx, lz), where the cars meet (`mid`, car space). */
  hitAt(mid, lx, lz, strength) {
    const l = Math.hypot(lx, lz) || 1;
    const p = this.contactAt(mid, lx / l, lz / l, _p);
    return this.hit(p, _o.set(lx / l, 0, lz / l), strength);
  }

  /**
   * p: contact point on the skin (car space), out: unit direction from the car toward the hit.
   * Returns [{ kind: 'lamp' | 'glass' | 'debris', p, n }] (car space) for particles / sound.
   */
  hit(p, out, strength) {
    const ev = this.events;
    ev.length = 0;
    if (strength < 2) return ev;
    const e = clamp((strength - 3) / 17, 0, 1);
    const d = this.dims;
    if (this.layout) this._scuff(p, out, Math.max(0.12, e));
    if (e > 0.01) this._dent(p, out, 0.01 + 0.09 * e, 0.24 + 0.26 * e);
    const face = out.z > 0.55 ? 'front' : out.z < -0.55 ? 'rear' : out.x > 0 ? 'left' : 'right';
    this.zone[face] += e;
    // lamps near the hit: knocks make them flicker, hard hits break them
    for (let k = 0; k < 4; k++) {
      const lp = this.lamps[k];
      if (!lp || this.hp[k] <= 0) continue;
      const dist = lp.distanceTo(p);
      if (dist > 0.8) continue;
      this.hp[k] = Math.max(0, this.hp[k] - (e * 1.6 + 0.08) * (1 - dist / 0.8));
      if (this.hp[k] <= 0) ev.push({ kind: 'lamp', p: lp.clone(), n: 12 });
    }
    // big hits crack the glass nearby (a screen flexes even when the hit is at the bumper)
    if (e > 0.32) {
      const g = this.hull.nearestGlass(face, p);
      if (g && g.distanceTo(p) < (face === 'front' ? 2.3 : 1.5)) {
        this._crack(g, e);
        ev.push({ kind: 'glass', p: g.clone(), n: Math.round(8 + 18 * e) });
      }
    }
    // bumper corners sag after hits on or near them
    const nearFront = p.z > d.frontZ - 0.9;
    if (e > 0.15 && (nearFront || p.z < d.rearZ + 0.9)) {
      const k = (nearFront ? 0 : 2) + (p.x > 0 ? 0 : 1);
      const corner = clamp(Math.abs(p.x) / (d.halfWidth * 0.7), 0.3, 1);
      this.bend[k] = Math.min(1, this.bend[k] + e * corner * (Math.abs(out.z) > 0.5 ? 0.9 : 0.5));
    }
    // a hard hit square on the nose buckles the bonnet
    if (face === 'front' && e > 0.4 && Math.abs(p.x) < d.halfWidth * 0.7) this.hood = Math.min(1, this.hood + (e - 0.3) * 1.3);
    // a battered nose starts steaming
    this.smoke = clamp((this.zone.front - 0.8) / 1.5, 0, 1);
    if (e > 0.22) ev.push({ kind: 'debris', p: p.clone(), n: Math.round(3 + 10 * e) });
    this._sync();
    return ev;
  }

  /**
   * Grinding toward car-space direction (lx, lz): along a wall, or where a rival rubs (`mid`, car
   * space). amount ~ seconds of hard contact.
   */
  scrapeToward(lx, lz, amount, mid = null) {
    if (!this.layout) return;
    this.scrapeAcc += amount;
    if (this.scrapeAcc < 0.06) return;
    const k = Math.min(1, this.scrapeAcc * 2);
    this.scrapeAcc = 0;
    const l = Math.hypot(lx, lz) || 1;
    const p = mid ? this.contactAt(mid, lx / l, lz / l, _p) : this.contact(lx / l, lz / l, 0.3, 0.75, _p);
    this._streaks(p, _o.set(lx / l, 0, lz / l), k);
  }

  /** Lamp flicker + uploading the scuff mask (at most ~8 times a second). */
  update(dt) {
    for (let k = 0; k < 4; k++) {
      const hp = this.hp[k];
      let on = 1;
      if (hp <= 0) on = 0;
      else if (hp < 0.55) {
        this.flickT[k] -= dt;
        if (this.flickT[k] <= 0) {
          const off = Math.random() < 0.25 + (0.55 - hp);
          this.flickV[k] = off ? 0.05 + Math.random() * 0.25 : 1;
          this.flickT[k] = off ? 0.03 + Math.random() * 0.1 : 0.05 + Math.random() * hp * 1.4;
        }
        on = this.flickV[k];
      }
      this.on[k] = on;
    }
    this.u.uLampHead.value.set(this.on[0], this.on[1]);
    this.u.uLampTail.value.set(this.on[2], this.on[3]);
    this.sinceUpload += dt;
    if (this.dirty && this.sinceUpload > 0.12) {
      this.tex.needsUpdate = true;
      this.dirty = false;
      this.sinceUpload = 0;
    }
  }

  /** Headlight damage for the world shaders: left lamp in the low 4 bits, right in the high 4. */
  headCode() {
    const q = (v) => Math.round(clamp(1 - v, 0, 1) * 15);
    return q(this.on[0]) + 16 * q(this.on[1]);
  }

  /** Brightness of the tail lamp on the car's left (0) or right (1). */
  tailOn(k) {
    return this.on[2 + k];
  }

  dispose() {
    if (this.tex) this.tex.dispose();
  }

  // ---------------------------------------------------------------------------- internals
  _dent(p, out, depth, radius) {
    const dir = _d.set(-out.x, 0, -out.z).normalize();
    let near = null;
    let nd = Infinity;
    for (const dn of this.dents) {
      const dist = dn.c.distanceTo(p);
      if (dist < nd) {
        nd = dist;
        near = dn;
      }
    }
    if (near && nd < Math.max(near.r, radius) * 0.55) {
      near.depth = Math.min(MAX_DEPTH, near.depth + depth * 0.6);
      near.r = Math.min(0.6, Math.max(near.r, radius) * 1.05);
      near.c.lerp(p, 0.3);
      near.dir.lerp(dir, 0.35).normalize();
    } else if (this.dents.length < MAX_DENTS) {
      this.dents.push({ c: p.clone(), r: radius, dir: dir.clone(), depth });
    } else {
      // all slots used: a deeper dent replaces the shallowest, otherwise the nearest deepens
      let low = this.dents[0];
      for (const dn of this.dents) if (dn.depth < low.depth) low = dn;
      if (low.depth < depth) {
        low.c.copy(p);
        low.r = radius;
        low.dir.copy(dir);
        low.depth = depth;
      } else if (near) near.depth = Math.min(MAX_DEPTH, near.depth + depth * 0.35);
    }
  }

  _crack(g, e) {
    let near = null;
    let nd = Infinity;
    for (const c of this.cracks) {
      const dist = c.p.distanceTo(g);
      if (dist < nd) {
        nd = dist;
        near = c;
      }
    }
    if (near && nd < 0.3) near.s = Math.min(1, near.s + e * 0.6);
    else if (this.cracks.length < MAX_CRACKS) this.cracks.push({ p: g.clone(), s: Math.min(1, e) });
    else if (near) near.s = Math.min(1, near.s + e * 0.4);
  }

  _sync() {
    const u = this.u;
    for (let i = 0; i < MAX_DENTS; i++) {
      const dn = this.dents[i];
      if (dn) {
        u.uDentA.value[i].set(dn.c.x, dn.c.y, dn.c.z, dn.r);
        u.uDentB.value[i].set(dn.dir.x, dn.dir.y, dn.dir.z, dn.depth);
      } else u.uDentB.value[i].w = 0;
    }
    for (let i = 0; i < MAX_CRACKS; i++) {
      const c = this.cracks[i];
      if (c) u.uCrack.value[i].set(c.p.x, c.p.y, c.p.z, c.s);
      else u.uCrack.value[i].w = 0;
    }
    u.uBend.value.set(this.bend[0], this.bend[1], this.bend[2], this.bend[3]);
    u.uDmgBox.value.w = this.hood;
    u.uDmgOn.value = 1;
  }

  // ---- scuff mask: an opaque black canvas the marks are added to ('lighter'), one channel each
  _canvas() {
    if (this.ctx) return this.ctx;
    const c = document.createElement('canvas');
    c.width = c.height = this.res;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    this.ctx = ctx;
    this.tex = tex;
    this.u.uDmgMap.value = tex;
    this.u.uDmgMapOn.value = 1;
    return ctx;
  }

  _inView(k, fn) {
    const ctx = this._canvas();
    const r = tileRect(k, this.res, this.res);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    setProjView(ctx, this.layout, k);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    fn(ctx);
    ctx.restore();
    this.dirty = true;
  }

  /** Atlas views that see a spot facing `out`, with the spot's 2D coordinates in each. */
  _views(p, out) {
    const v = [];
    if (Math.abs(out.x) > 0.3) v.push([out.x > 0 ? 'L' : 'R', p.z, p.y]);
    if (out.z > 0.3) v.push(['F', p.x, p.y]);
    else if (out.z < -0.3) v.push(['B', p.x, p.y]);
    return v;
  }

  _scuff(p, out, e) {
    const r = 0.1 + 0.22 * e;
    for (const [k, a, b] of this._views(p, out)) {
      this._inView(k, (ctx) => {
        // clear coat scuffed through to primer
        const g = ctx.createRadialGradient(a, b, 0, a, b, r);
        g.addColorStop(0, `rgb(${Math.round(90 + 130 * e)},0,${Math.round(30 * e)})`);
        g.addColorStop(0.55, `rgb(${Math.round(35 + 60 * e)},0,${Math.round(20 * e)})`);
        g.addColorStop(1, 'rgb(0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(a - r, b - r, r * 2, r * 2);
        // gouges down to bare metal, mostly along the panel
        const n = Math.round(2 + 9 * e);
        for (let i = 0; i < n; i++) {
          const ang = (Math.random() - 0.5) * 0.9 + (Math.random() < 0.5 ? 0 : Math.PI);
          const len = r * (0.4 + Math.random() * 0.9);
          const sx = a + (Math.random() - 0.5) * r * 0.8;
          const sy = b + (Math.random() - 0.5) * r * 0.6;
          ctx.strokeStyle = `rgb(0,${Math.round(110 + 130 * e)},0)`;
          ctx.lineWidth = 0.004 + Math.random() * 0.009;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len * 0.35);
          ctx.stroke();
        }
      });
    }
  }

  _streaks(p, out, k) {
    for (const [v, a, b] of this._views(p, out)) {
      if (v === 'F' || v === 'B') continue; // scrapes run along the sides
      this._inView(v, (ctx) => {
        const n = 3 + Math.round(4 * k);
        for (let i = 0; i < n; i++) {
          const y = b + (Math.random() - 0.5) * 0.22;
          const z = a + (Math.random() - 0.5) * 0.9;
          const len = 0.25 + Math.random() * 0.8;
          const tilt = (Math.random() - 0.5) * 0.02;
          ctx.strokeStyle = `rgb(${Math.round(35 + 60 * k)},0,0)`;
          ctx.lineWidth = 0.015 + Math.random() * 0.03;
          ctx.beginPath();
          ctx.moveTo(z - len / 2, y);
          ctx.lineTo(z + len / 2, y + tilt);
          ctx.stroke();
          if (Math.random() < 0.1 + 0.35 * k) {
            ctx.strokeStyle = `rgb(0,${Math.round(60 + 100 * k)},0)`;
            ctx.lineWidth = 0.004 + Math.random() * 0.005;
            ctx.beginPath();
            ctx.moveTo(z - len * 0.4, y + 0.01);
            ctx.lineTo(z + len * 0.4, y + 0.01 + tilt);
            ctx.stroke();
          }
        }
      });
    }
  }
}
