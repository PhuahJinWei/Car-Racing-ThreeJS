// Signed-distance modelling helpers for the offline car factory.
// Everything is plain numbers (no allocations in hot paths) because the mesher evaluates
// the car's distance field millions of times.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Polynomial smooth minimum (union with a fillet of radius ~k). */
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth maximum (intersection / subtraction with a rounded edge). */
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

export function sdBox(px, py, pz, bx, by, bz) {
  const qx = Math.abs(px) - bx;
  const qy = Math.abs(py) - by;
  const qz = Math.abs(pz) - bz;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
}

export function sdRoundBox(px, py, pz, bx, by, bz, r) {
  return sdBox(px, py, pz, bx - r, by - r, bz - r) - r;
}

/** Capped cylinder along X centred at origin (radius r, half length h). */
export function sdCylX(px, py, pz, r, h) {
  const dx = Math.abs(px) - h;
  const dr = Math.sqrt(py * py + pz * pz) - r;
  const ax = Math.max(dx, 0);
  const ar = Math.max(dr, 0);
  return Math.min(Math.max(dx, dr), 0) + Math.sqrt(ax * ax + ar * ar);
}

/** Capped cylinder along Z. */
export function sdCylZ(px, py, pz, r, h) {
  return sdCylX(pz, py, px, r, h);
}

/** Capped cylinder along Y. */
export function sdCylY(px, py, pz, r, h) {
  return sdCylX(py, px, pz, r, h);
}

/** Capsule between two points. */
export function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Ellipsoid (approximate, good enough for modelling). */
export function sdEllipsoid(px, py, pz, rx, ry, rz) {
  const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
  const k1 = Math.sqrt((px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

/** Rotate a 2D point (returns via array to keep call sites short). */
export function rot2(x, y, a, out) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  out[0] = c * x - s * y;
  out[1] = s * x + c * y;
  return out;
}

// ---------------------------------------------------------------------------------------
// 2D profiles (side / plan / front views) as precomputed signed-distance grids
// ---------------------------------------------------------------------------------------

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Build a dense closed polyline from control points [u, v, sharp?]. Runs between sharp points
 * are smoothed with Catmull-Rom; sharp points stay as crisp corners.
 */
export function densify(points, step = 0.002) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p0 = p1[2] ? p1 : points[(i - 1 + n) % n];
    const p3 = p2[2] ? p2 : points[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  return out;
}

/** Mirror a half outline (u >= 0, listed from one end on the axis to the other) into a full closed shape. */
export function mirrorU(half) {
  const back = half
    .slice(1, -1)
    .reverse()
    .map((p) => [-p[0], p[1], p[2]]);
  return [...half, ...back];
}

export class Profile2D {
  /**
   * points: closed outline [[u, v, sharp?], ...]; res: grid cell size (m); band: max distance stored.
   */
  constructor(points, opts = {}) {
    const res = opts.res ?? 0.004;
    const band = opts.band ?? 0.35;
    const poly = opts.dense ? points : densify(points, opts.step ?? res * 0.5);
    this.poly = poly;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [u, v] of poly) {
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const m = band + res * 2;
    this.u0 = minU - m;
    this.v0 = minV - m;
    this.res = res;
    this.nu = Math.ceil((maxU - minU + 2 * m) / res) + 1;
    this.nv = Math.ceil((maxV - minV + 2 * m) / res) + 1;
    this.band = band;
    this.grid = new Float32Array(this.nu * this.nv);
    this._build();
  }

  _build() {
    const { poly, res, nu, nv, u0, v0, band } = this;
    const n = poly.length;
    // bucket segments for local distance queries
    const bs = 0.08;
    const buckets = new Map();
    const key = (a, b) => a * 100003 + b;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const ia0 = Math.floor((Math.min(a[0], b[0]) - band) / bs);
      const ia1 = Math.floor((Math.max(a[0], b[0]) + band) / bs);
      const ib0 = Math.floor((Math.min(a[1], b[1]) - band) / bs);
      const ib1 = Math.floor((Math.max(a[1], b[1]) + band) / bs);
      for (let ia = ia0; ia <= ia1; ia++) {
        for (let ib = ib0; ib <= ib1; ib++) {
          const k = key(ia, ib);
          let arr = buckets.get(k);
          if (!arr) buckets.set(k, (arr = []));
          arr.push(i);
        }
      }
    }
    // per row crossing lists for inside test (even-odd along +u)
    const crossings = [];
    for (let j = 0; j < nv; j++) {
      const v = v0 + j * res;
      const xs = [];
      for (let i = 0; i < n; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % n];
        if (a[1] > v !== b[1] > v) xs.push(a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      crossings.push(xs);
    }
    for (let j = 0; j < nv; j++) {
      const v = v0 + j * res;
      const xs = crossings[j];
      let ci = 0;
      for (let i = 0; i < nu; i++) {
        const u = u0 + i * res;
        while (ci < xs.length && xs[ci] < u) ci++;
        const inside = ci % 2 === 1;
        const segs = buckets.get(key(Math.floor(u / bs), Math.floor(v / bs)));
        let best = band * band;
        if (segs) {
          for (const s of segs) {
            const a = poly[s];
            const b = poly[(s + 1) % n];
            const bax = b[0] - a[0];
            const bay = b[1] - a[1];
            const pax = u - a[0];
            const pay = v - a[1];
            const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay || 1), 0, 1);
            const dx = pax - bax * h;
            const dy = pay - bay * h;
            const d2 = dx * dx + dy * dy;
            if (d2 < best) best = d2;
          }
        }
        const d = Math.sqrt(best);
        this.grid[j * nu + i] = inside ? -d : d;
      }
    }
  }

  /** Signed distance at (u, v); bicubic so gradients (normals) stay smooth. */
  sample(u, v) {
    const fu = (u - this.u0) / this.res;
    const fv = (v - this.v0) / this.res;
    if (fu < 1 || fv < 1 || fu > this.nu - 3 || fv > this.nv - 3) {
      // outside the stored band: distance to the grid box plus the band
      const cu = clamp(fu, 1, this.nu - 3);
      const cv = clamp(fv, 1, this.nv - 3);
      const extra = Math.hypot((fu - cu) * this.res, (fv - cv) * this.res);
      return this.band + extra;
    }
    const iu = Math.floor(fu);
    const iv = Math.floor(fv);
    const tu = fu - iu;
    const tv = fv - iv;
    const g = this.grid;
    const nu = this.nu;
    let o = (iv - 1) * nu + iu;
    const r0 = catmull(g[o - 1], g[o], g[o + 1], g[o + 2], tu);
    o += nu;
    const r1 = catmull(g[o - 1], g[o], g[o + 1], g[o + 2], tu);
    o += nu;
    const r2 = catmull(g[o - 1], g[o], g[o + 1], g[o + 2], tu);
    o += nu;
    const r3 = catmull(g[o - 1], g[o], g[o + 1], g[o + 2], tu);
    return catmull(r0, r1, r2, r3, tv);
  }
}
