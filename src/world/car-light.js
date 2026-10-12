import * as THREE from 'three';
import { smoothstep } from '../core/math.js';

// Lighting a car model from the street around it. The track's light comes baked from lamps,
// signs and tunnel luminaires (world.baker); a car is lit by real point lights placed on the
// strongest of those nearby, and casts its road shadow away from them.

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pool = [];
const _top = [
  { w: 0, L: null },
  { w: 0, L: null },
];
const _out = [0, 0, 0, 0, 0, 0, 0, 0];
// The lamp visitors below run for every car every frame. They're made once and read the point
// being lit (and what they collect) from here, so they leave no garbage behind.
let _px = 0;
let _py = 0;
let _pz = 0;
let _n = 0;
let _sum = 0;
let _reach = 0;
let _list = null;

/** Visit every baked / dynamic light registered within `range` metres of track index i. */
function eachLamp(world, i, range, fn) {
  const baker = world.baker;
  const n = world.track.n;
  const k = Math.ceil(range / world.track.ds);
  for (let j = i - k; j <= i + k; j++) {
    const jj = ((j % n) + n) % n;
    const a = baker.buckets[jj];
    if (a) for (let q = 0; q < a.length; q++) fn(a[q]);
    const b = baker.dyn && baker.dyn[jj];
    if (b) for (let q = 0; q < b.length; q++) fn(b[q]);
  }
}

/**
 * Put the point lights `lights` on the lamps that light (x, y, z) the most (track index i), so a
 * car there sweeps through real light. Unused lights are switched off.
 */
function aimVisit(L) {
  const dx = L.x - _px;
  const dy = L.y - _py;
  const dz = L.z - _pz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= L.r2) return;
  // rank by how much light actually reaches the car
  let e = _pool[_n];
  if (!e) _pool[_n] = e = { L: null, w: 0 };
  e.L = L;
  e.w = Math.max(L.r, L.g, L.b) / Math.max(d2, 4);
  _n++;
}

export function aimLampLights(world, i, x, y, z, lights) {
  _px = x;
  _py = y;
  _pz = z;
  _n = 0;
  eachLamp(world, i, 28, aimVisit);
  const count = _n;
  // partial selection of the strongest few
  for (let a = 0; a < Math.min(lights.length, count); a++) {
    let best = a;
    for (let b = a + 1; b < count; b++) if (_pool[b].w > _pool[best].w) best = b;
    const t = _pool[a];
    _pool[a] = _pool[best];
    _pool[best] = t;
  }
  for (let q = 0; q < lights.length; q++) {
    const light = lights[q];
    if (q >= count) {
      light.intensity = 0;
      continue;
    }
    const L = _pool[q].L;
    const m = Math.max(L.r, L.g, L.b, 1e-3);
    light.color.setRGB(L.r / m, L.g / m, L.b / m);
    light.intensity = m * 170;
    light.distance = Math.sqrt(L.r2) * 1.1;
    light.position.set(L.x, L.y, L.z);
  }
}

/**
 * The lamps that light the most of the space within `reach` metres of (x, y, z) (track index
 * i), strongest first, written to `out` (its length is the most it takes). Returns how many.
 */
function pickVisit(L) {
  const out = _list;
  const dx = L.x - _px;
  const dy = L.y - _py;
  const dz = L.z - _pz;
  const e = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) - _reach * 0.5, 0) ** 2 / L.r2;
  if (e >= 1) return;
  const w = Math.max(L.r, L.g, L.b) * (1 - e) * (1 - e);
  if (_n === out.length && w <= _w[_n - 1]) return;
  let k = _n < out.length ? _n++ : _n - 1;
  while (k > 0 && _w[k - 1] < w) {
    out[k] = out[k - 1];
    _w[k] = _w[k - 1];
    k--;
  }
  out[k] = L;
  _w[k] = w;
}

export function pickLamps(world, i, x, y, z, reach, out) {
  _px = x;
  _py = y;
  _pz = z;
  _reach = reach;
  _list = out;
  _n = 0;
  eachLamp(world, i, world.baker.maxRadius + reach, pickVisit);
  _list = null;
  return _n;
}
const _w = [];

/**
 * Road shadow for a car model at (x, y, z) (track index i) from the two strongest lamps nearby:
 * each casts the footprint away from itself, as dark as its share of the light there. A lamp
 * straight overhead leaves the shadow right underneath. air: height above the road.
 */
function shadowVisit(L) {
  const S = _top;
  const dx = L.x - _px;
  const dy = L.y - _py;
  const dz = L.z - _pz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= L.r2) return;
  const f = 1 - d2 / L.r2;
  const w = Math.max(L.r, L.g, L.b) * f * f;
  _sum += w;
  if (w > S[0].w) {
    S[1].w = S[0].w;
    S[1].L = S[0].L;
    S[0].w = w;
    S[0].L = L;
  } else if (w > S[1].w) {
    S[1].w = w;
    S[1].L = L;
  }
}

export function castCarShadow(world, model, i, x, y, z, air) {
  const S = _top;
  S[0].w = S[1].w = 0;
  _px = x;
  _py = y;
  _pz = z;
  _sum = 0;
  eachLamp(world, i, 26, shadowVisit);
  const total = _sum;
  const out = _out;
  out.fill(0);
  _q.copy(model.group.quaternion).invert();
  for (let s = 0; s < 2; s++) {
    const e = S[s];
    if (e.w <= 0) continue;
    // a point ~0.8 m up the car lands this far beyond it on the road
    _v.set(x - e.L.x, 0, z - e.L.z);
    const D = _v.length();
    const H = Math.max(e.L.y - y, 1.2);
    _v.applyQuaternion(_q);
    const l = Math.hypot(_v.x, _v.z) || 1;
    out[s * 4] = _v.x / l;
    out[s * 4 + 1] = _v.z / l;
    out[s * 4 + 2] = D > 0.05 ? (0.8 * D) / Math.max(H - 0.8, 0.6) : 0;
    out[s * 4 + 3] = 0.9 * (e.w / total) * smoothstep(0.02, 0.3, e.w);
  }
  model.setShadow(air, out[0], out[1], out[2], out[3], out[4], out[5], out[6], out[7]);
}
