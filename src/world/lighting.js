import * as THREE from 'three';

const _c = new THREE.Color();

/**
 * Bakes light from many static lamps/neons into per-vertex colours (attribute `aLight`).
 * Mobile GPUs can't afford hundreds of real lights; baked pools of light look the same at speed.
 */
export class LightBaker {
  constructor(track) {
    this.track = track;
    this.buckets = new Array(track.n);
    this.maxRadius = 0;
    this.zones = [];
    this.count = 0;
  }

  addPoint(x, y, z, color, intensity, radius, index) {
    const i = index ?? this.track.findIndex(x, z);
    _c.set(color);
    const L = { x, y, z, r: _c.r * intensity, g: _c.g * intensity, b: _c.b * intensity, r2: radius * radius };
    (this.buckets[i] || (this.buckets[i] = [])).push(L);
    this.maxRadius = Math.max(this.maxRadius, radius);
    this.count++;
  }

  /** A light that isn't baked, only offered to dynamic objects (cars) - e.g. tunnel luminaires. */
  addDynamic(x, y, z, color, intensity, radius, index) {
    const i = index ?? this.track.findIndex(x, z);
    _c.set(color);
    if (!this.dyn) this.dyn = new Array(this.track.n);
    (this.dyn[i] || (this.dyn[i] = [])).push({ x, y, z, r: _c.r * intensity, g: _c.g * intensity, b: _c.b * intensity, r2: radius * radius });
  }

  /** fn(i, x, y, z, out) adds light procedurally (e.g. tunnel ambience). out = [r, g, b]. */
  addZone(fn) {
    this.zones.push(fn);
  }

  /** Light at a world point near sample i, written to out (THREE.Color or array). */
  sample(i, x, y, z, out) {
    const n = this.track.n;
    const k = Math.ceil(this.maxRadius / this.track.ds) + 1;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let j = i - k; j <= i + k; j++) {
      const bucket = this.buckets[((j % n) + n) % n];
      if (!bucket) continue;
      for (let q = 0; q < bucket.length; q++) {
        const L = bucket[q];
        const dx = L.x - x;
        const dy = L.y - y;
        const dz = L.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= L.r2) continue;
        const f = 1 - d2 / L.r2;
        const att = f * f;
        r += L.r * att;
        g += L.g * att;
        b += L.b * att;
      }
    }
    _arr[0] = r;
    _arr[1] = g;
    _arr[2] = b;
    for (const z0 of this.zones) z0(i, x, y, z, _arr);
    out[0] = _arr[0];
    out[1] = _arr[1];
    out[2] = _arr[2];
    return out;
  }

  /** Bake later, once every light has been registered (props built before the street lamps). */
  deferBake(geometry) {
    (this.deferred || (this.deferred = [])).push(geometry);
    return geometry;
  }

  flushDeferred() {
    for (const g of this.deferred || []) this.bake(g);
    this.deferred = [];
  }

  /** Bake into a geometry that carries an `aIdx` attribute (track sample index per vertex). */
  bake(geometry) {
    const pos = geometry.attributes.position;
    const idx = geometry.attributes.aIdx;
    const count = pos.count;
    const out = new Float32Array(count * 3);
    const tmp = [0, 0, 0];
    for (let v = 0; v < count; v++) {
      const i = Math.round(idx.getX(v)) % this.track.n;
      this.sample(i, pos.getX(v), pos.getY(v), pos.getZ(v), tmp);
      out[v * 3] = tmp[0];
      out[v * 3 + 1] = tmp[1];
      out[v * 3 + 2] = tmp[2];
    }
    geometry.setAttribute('aLight', new THREE.BufferAttribute(out, 3));
    return geometry;
  }
}

const _arr = [0, 0, 0];
