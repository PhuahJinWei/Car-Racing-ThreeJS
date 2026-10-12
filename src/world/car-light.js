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
export function aimLampLights(world, i, x, y, z, lights) {
  let count = 0;
  eachLamp(world, i, 28, (L) => {
    const dx = L.x - x;
    const dy = L.y - y;
    const dz = L.z - z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= L.r2) return;
    // rank by how much light actually reaches the car
    let e = _pool[count];
    if (!e) _pool[count] = e = { L: null, w: 0 };
    e.L = L;
    e.w = Math.max(L.r, L.g, L.b) / Math.max(d2, 4);
    count++;
  });
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
 * Road shadow for a car model at (x, y, z) (track index i) from the two strongest lamps nearby:
 * each casts the footprint away from itself, as dark as its share of the light there. A lamp
 * straight overhead leaves the shadow right underneath. air: height above the road.
 */
export function castCarShadow(world, model, i, x, y, z, air) {
  const S = _top;
  S[0].w = S[1].w = 0;
  let total = 0;
  eachLamp(world, i, 26, (L) => {
    const dx = L.x - x;
    const dy = L.y - y;
    const dz = L.z - z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= L.r2) return;
    const f = 1 - d2 / L.r2;
    const w = Math.max(L.r, L.g, L.b) * f * f;
    total += w;
    if (w > S[0].w) {
      S[1].w = S[0].w;
      S[1].L = S[0].L;
      S[0].w = w;
      S[0].L = L;
    } else if (w > S[1].w) {
      S[1].w = w;
      S[1].L = L;
    }
  });
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
