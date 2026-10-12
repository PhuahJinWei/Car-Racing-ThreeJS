import * as THREE from 'three';
import { clamp, wrap, angleWrap } from '../core/math.js';
import { buildTurtlePath, sampleProfile } from './track-gen.js';

const _v = new THREE.Vector3();

function smoothArray(src, radius, passes = 1) {
  const n = src.length;
  let a = Float32Array.from(src);
  let b = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += a[(i + k + n) % n];
      b[i] = s / (2 * radius + 1);
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

/**
 * Runtime representation of a circuit: an evenly sampled, banked ribbon with helpers
 * for projecting world positions to track space (s = distance along, d = lateral offset,
 * positive to the driver's right).
 */
export class Track {
  constructor(def, variant = {}) {
    this.def = def;
    this.variant = { reverse: false, mirror: false, weather: 'clear', ...variant };
    this.halfWidth = def.width / 2;
    this._build();
    this._buildGrid();
    this._computeRacing();
  }

  get key() {
    const v = this.variant;
    return `${this.def.id}|${v.reverse ? 'r' : 'f'}|${v.mirror ? 'm' : 'n'}|${v.weather}`;
  }

  _build() {
    const def = this.def;
    const { reverse, mirror } = this.variant;
    const { pts, starts } = buildTurtlePath(def.path, 6);
    // Raw loop length to place the start line and elevation.
    const raw = pts.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    let rawLen = 0;
    const rawS = [0];
    for (let i = 1; i <= raw.length; i++) {
      rawLen += raw[i % raw.length].distanceTo(raw[i - 1]);
      if (i < raw.length) rawS.push(rawLen);
    }
    // Elevation (authored against the forward direction from the raw start).
    for (let i = 0; i < raw.length; i++) raw[i].y = sampleProfile(def.elevation, rawS[i] / rawLen);

    // Rotate so the start line sits `startOffset` metres into the loop.
    let startIdx = 0;
    const so = def.startOffset || 0;
    while (startIdx < raw.length - 1 && rawS[startIdx] < so) startIdx++;
    const startS = rawS[startIdx];
    const cmdS = starts.map((i) => (i < rawS.length ? rawS[i] : rawLen));
    // Feature positions can be fractions of the raw loop or [commandIndex, fraction] pairs.
    const resolve = (x) => {
      let sRaw;
      if (Array.isArray(x)) {
        const a = cmdS[x[0]];
        const b = x[0] + 1 < cmdS.length ? cmdS[x[0] + 1] : rawLen;
        sRaw = a + (b - a) * x[1];
      } else sRaw = x * rawLen;
      return wrap(sRaw - startS, rawLen) / rawLen;
    };
    let loop = raw.slice(startIdx).concat(raw.slice(0, startIdx));
    if (mirror) loop.forEach((p) => (p.x = -p.x));
    if (reverse) loop = [loop[0], ...loop.slice(1).reverse()];

    const curve = new THREE.CatmullRomCurve3(loop, true, 'centripetal');
    curve.arcLengthDivisions = loop.length * 8;
    const L = curve.getLength();
    const n = Math.round(L / 2);
    const ds = L / n;
    const sp = curve.getSpacedPoints(n);
    this.length = L;
    this.n = n;
    this.ds = ds;
    this.curve = curve;

    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const pz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = sp[i].x;
      py[i] = sp[i].y;
      pz[i] = sp[i].z;
    }
    // Smooth heights a little to avoid jitter from spline overshoot
    const pys = smoothArray(py, 3, 2);
    py.set(pys);

    const tx = new Float32Array(n);
    const ty = new Float32Array(n);
    const tz = new Float32Array(n);
    const heading = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      _v.set(px[b] - px[a], py[b] - py[a], pz[b] - pz[a]).normalize();
      tx[i] = _v.x;
      ty[i] = _v.y;
      tz[i] = _v.z;
      heading[i] = Math.atan2(_v.x, _v.z);
    }
    // Signed horizontal curvature (positive = left turn).
    const kappa = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      kappa[i] = angleWrap(heading[b] - heading[a]) / (2 * ds);
    }
    const kSmooth = smoothArray(kappa, 4, 2);

    // Banking: inside of the corner lower. bank > 0 => right side lower (right turn).
    const bankGain = def.bankGain ?? 14;
    const maxBank = def.maxBank ?? 0.22;
    const bankRaw = new Float32Array(n);
    for (let i = 0; i < n; i++) bankRaw[i] = clamp(-kSmooth[i] * bankGain, -maxBank, maxBank);
    const bank = smoothArray(bankRaw, 10, 2);

    const rx = new Float32Array(n);
    const ry = new Float32Array(n);
    const rz = new Float32Array(n);
    const ux = new Float32Array(n);
    const uy = new Float32Array(n);
    const uz = new Float32Array(n);
    const T = new THREE.Vector3();
    const R = new THREE.Vector3();
    const N0 = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      T.set(tx[i], ty[i], tz[i]);
      R.crossVectors(T, up).normalize();
      N0.crossVectors(R, T).normalize();
      const b = bank[i];
      const cb = Math.cos(b);
      const sb = Math.sin(b);
      const Rx = R.x * cb - N0.x * sb;
      const Ry = R.y * cb - N0.y * sb;
      const Rz = R.z * cb - N0.z * sb;
      rx[i] = Rx;
      ry[i] = Ry;
      rz[i] = Rz;
      // N = R' x T
      ux[i] = Ry * T.z - Rz * T.y;
      uy[i] = Rz * T.x - Rx * T.z;
      uz[i] = Rx * T.y - Ry * T.x;
    }

    Object.assign(this, { px, py, pz, tx, ty, tz, rx, ry, rz, ux, uy, uz, heading, kappa: kSmooth, bank });

    // Sections / features mapped to this variant.
    const lateralSign = (reverse ? -1 : 1) * (mirror ? -1 : 1);
    this.lateralSign = lateralSign;
    const mapRange = (a, b) => (reverse ? [1 - b, 1 - a] : [a, b]);
    this.sections = (def.sections || []).map((sec) => {
      const [a, b] = mapRange(resolve(sec.from), resolve(sec.to));
      return { ...sec, s0: a * L, s1: b * L };
    });
    this.tunnelFlags = new Uint8Array(n);
    for (const sec of this.sections) {
      if (sec.type !== 'tunnel') continue;
      for (let i = 0; i < n; i++) if (inRange(i * ds, sec.s0, sec.s1)) this.tunnelFlags[i] = 1;
    }
    this.boostPads = (def.boostPads || []).map((bp) => {
      const len = 10;
      const f = resolve(bp.at);
      const s0 = reverse ? L - f * L - len : f * L;
      return { s0: wrap(s0, L), len, d: (bp.offset || 0) * lateralSign, halfWidth: bp.width ? bp.width / 2 : 2.2 };
    });
    this.ramps = (def.ramps || []).map((rp) => {
      const len = rp.length || 26;
      const f = resolve(rp.at);
      const s0 = reverse ? L - f * L - len : f * L;
      return {
        s0: wrap(s0, L),
        len,
        height: rp.height || 2.6,
        d: (rp.offset || 0) * lateralSign,
        halfWidth: (rp.width || def.width) / 2,
      };
    });
  }

  _buildGrid() {
    const cell = 30;
    this.gridCell = cell;
    const grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const k = gridKey(Math.floor(this.px[i] / cell), Math.floor(this.pz[i] / cell));
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(i);
    }
    this.grid = grid;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minX = Math.min(minX, this.px[i]);
      maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]);
      maxZ = Math.max(maxZ, this.pz[i]);
      minY = Math.min(minY, this.py[i]);
      maxY = Math.max(maxY, this.py[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ, minY, maxY };
  }

  /** Distance from (x, z) to the nearest centre-line sample (approximate, 2 m resolution). */
  nearestDistance(x, z, maxR = 90) {
    const cell = this.gridCell;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    const r = Math.ceil(maxR / cell);
    let best = Infinity;
    let bestI = -1;
    for (let ix = cx - r; ix <= cx + r; ix++) {
      for (let iz = cz - r; iz <= cz + r; iz++) {
        const arr = this.grid.get(gridKey(ix, iz));
        if (!arr) continue;
        for (const i of arr) {
          const dx = this.px[i] - x;
          const dz = this.pz[i] - z;
          const d = dx * dx + dz * dz;
          if (d < best) {
            best = d;
            bestI = i;
          }
        }
      }
    }
    return { dist: Math.sqrt(best), index: bestI };
  }

  /** Index of the sample nearest to a world position with no hint (global search). */
  findIndex(x, z) {
    const r = this.nearestDistance(x, z, 400);
    return r.index >= 0 ? r.index : 0;
  }

  /**
   * Project a world position onto the track near sample `hint`.
   * Fills `out` with: i, t, s, d (lateral, + right), y (surface height at that point),
   * bank, tunnel, and the frame vectors (forward/right/up).
   */
  project(x, z, hint, out) {
    const { px, pz, n } = this;
    let best = 0;
    let bestT = 0;
    let bestD2 = Infinity;
    const range = 14;
    for (let k = -range; k <= range; k++) {
      const i = (((hint + k) % n) + n) % n;
      const j = i + 1 === n ? 0 : i + 1;
      const ax = px[i];
      const az = pz[i];
      const ex = px[j] - ax;
      const ez = pz[j] - az;
      const len2 = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + ex * t - x;
      const qz = az + ez * t - z;
      const d2 = qx * qx + qz * qz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
        bestT = t;
      }
    }
    this._fillFrame(best, bestT, out);
    // lateral offset along horizontal right
    const hx = out.rx;
    const hz = out.rz;
    const hl = Math.hypot(hx, hz) || 1;
    const dh = ((x - out.px) * hx + (z - out.pz) * hz) / hl;
    const cb = Math.cos(out.bank);
    out.d = dh / cb;
    out.y = out.py - out.d * Math.sin(out.bank);
    return out;
  }

  _fillFrame(i, t, out) {
    const n = this.n;
    const j = i + 1 === n ? 0 : i + 1;
    const u = 1 - t;
    out.i = i;
    out.t = t;
    out.s = (i + t) * this.ds;
    out.px = this.px[i] * u + this.px[j] * t;
    out.py = this.py[i] * u + this.py[j] * t;
    out.pz = this.pz[i] * u + this.pz[j] * t;
    out.tx = this.tx[i] * u + this.tx[j] * t;
    out.ty = this.ty[i] * u + this.ty[j] * t;
    out.tz = this.tz[i] * u + this.tz[j] * t;
    out.rx = this.rx[i] * u + this.rx[j] * t;
    out.ry = this.ry[i] * u + this.ry[j] * t;
    out.rz = this.rz[i] * u + this.rz[j] * t;
    out.ux = this.ux[i] * u + this.ux[j] * t;
    out.uy = this.uy[i] * u + this.uy[j] * t;
    out.uz = this.uz[i] * u + this.uz[j] * t;
    out.bank = this.bank[i] * u + this.bank[j] * t;
    out.kappa = this.kappa[i] * u + this.kappa[j] * t;
    out.heading = this.heading[i] + angleWrap(this.heading[j] - this.heading[i]) * t;
    out.tunnel = this.tunnelFlags[i] || this.tunnelFlags[j];
    return out;
  }

  /** Frame at distance s along the track. */
  frameAt(s, out) {
    s = wrap(s, this.length);
    const f = s / this.ds;
    const i = Math.floor(f) % this.n;
    return this._fillFrame(i, f - Math.floor(f), out);
  }

  /** World position at (s, d) on the surface. */
  pointAt(s, d, out = new THREE.Vector3(), lift = 0) {
    const f = this.frameAt(s, _frame);
    out.set(f.px + f.rx * d + f.ux * lift, f.py + f.ry * d + f.uy * lift, f.pz + f.rz * d + f.uz * lift);
    return out;
  }

  /** Extra height from ramps at (s, d); also returns slope via out param. */
  rampHeight(s, d) {
    for (const r of this.ramps) {
      let ls = s - r.s0;
      if (ls < 0) ls += this.length;
      if (ls < 0 || ls > r.len) continue;
      if (Math.abs(d - r.d) > r.halfWidth) continue;
      const t = ls / r.len;
      return r.height * Math.pow(t, 1.6);
    }
    return 0;
  }

  /** Wrapped signed difference a - b in [-L/2, L/2]. */
  deltaS(a, b) {
    const L = this.length;
    let d = (a - b) % L;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  _computeRacing() {
    const n = this.n;
    const W = this.halfWidth;
    const k = smoothArray(this.kappa, 5, 2);
    const lineRaw = new Float32Array(n);
    for (let i = 0; i < n; i++) lineRaw[i] = clamp(-k[i] * 950, -W * 0.62, W * 0.62);
    this.racingLine = smoothArray(lineRaw, 14, 3);
    const aLat = 34;
    const aBrake = 30;
    const vTop = 120;
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = Math.min(vTop, Math.sqrt(aLat / Math.max(Math.abs(k[i]), 1e-5)));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * aBrake * this.ds));
      }
    }
    this.speedProfile = v;
    let t = 0;
    for (let i = 0; i < n; i++) t += this.ds / Math.min(v[i], 82);
    this.lapEstimate = t;
  }

  sampleArray(arr, s) {
    const f = wrap(s, this.length) / this.ds;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const t = f - Math.floor(f);
    return arr[i] * (1 - t) + arr[j] * t;
  }

  isTunnelAt(s) {
    const i = Math.floor(wrap(s, this.length) / this.ds) % this.n;
    return this.tunnelFlags[i] === 1;
  }

  sectionAt(s, type) {
    s = wrap(s, this.length);
    for (const sec of this.sections) if ((!type || sec.type === type) && inRange(s, sec.s0, sec.s1)) return sec;
    return null;
  }

  /** Iterate sample indices inside sections of a type: cb(i, section). */
  forEachInSections(type, cb) {
    for (const sec of this.sections) {
      if (sec.type !== type) continue;
      for (let i = 0; i < this.n; i++) if (inRange(i * this.ds, sec.s0, sec.s1)) cb(i, sec);
    }
  }
}

export function inRange(s, s0, s1) {
  return s0 <= s1 ? s >= s0 && s <= s1 : s >= s0 || s <= s1;
}

const _frame = {};

function gridKey(ix, iz) {
  return (ix + 32768) * 65536 + (iz + 32768);
}

export function makeFrame() {
  return {
    i: 0, t: 0, s: 0, d: 0, y: 0,
    px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0,
    bank: 0, kappa: 0, heading: 0, tunnel: 0,
  };
}
