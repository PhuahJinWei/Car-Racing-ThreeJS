// Details far thinner than the voxel size (LED strips, projector lenses) are generated as their own
// little meshes, laid onto the car's skin by ray-marching the distance field from a 2D drawing.

/** Projection views: `dir` points into the car, (u, v) span the drawing plane. */
export const VIEW = {
  front: { dir: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  rear: { dir: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  left: { dir: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  right: { dir: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  top: { dir: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
};

const FAR = 3;

function normalAt(f, x, y, z, out) {
  const e = 0.0015;
  const gx = f(x + e, y, z) - f(x - e, y, z);
  const gy = f(x, y + e, z) - f(x, y - e, z);
  const gz = f(x, y, z + e) - f(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  out[0] = gx / l;
  out[1] = gy / l;
  out[2] = gz / l;
  return out;
}

/** Point on the surface under the drawing-plane point (a, b), pushed `depth` below it. */
function project(f, view, a, b, depth, pos, nor) {
  const { dir, u, v } = view;
  const ox = u[0] * a + v[0] * b - dir[0] * FAR;
  const oy = u[1] * a + v[1] * b - dir[1] * FAR;
  const oz = u[2] * a + v[2] * b - dir[2] * FAR;
  const at = (t) => f(ox + dir[0] * t, oy + dir[1] * t, oz + dir[2] * t);
  let t = 0;
  let prev = 0;
  let hit = -1;
  for (let i = 0; i < 2000 && t < FAR * 2; i++) {
    const d = at(t);
    if (d < 0) {
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2;
        if (at(m) < 0) hi = m;
        else lo = m;
      }
      hit = (lo + hi) / 2;
      break;
    }
    prev = t;
    t += Math.max(d * 0.6, 0.0004);
  }
  if (hit < 0) return false;
  const hx = ox + dir[0] * hit;
  const hy = oy + dir[1] * hit;
  const hz = oz + dir[2] * hit;
  const n = [0, 0, 0];
  normalAt(f, hx, hy, hz, n);
  pos.push(hx - n[0] * depth, hy - n[1] * depth, hz - n[2] * depth);
  nor.push(n[0], n[1], n[2]);
  return true;
}

function resample(path, step, sharp) {
  const pts = [];
  const n = path.length;
  for (let i = 0; i < n - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const p0 = sharp || i === 0 ? p1 : path[i - 1];
    const p3 = sharp || i + 2 >= n ? p2 : path[i + 2];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const c = (a0, a1, a2, a3) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t * t + (-a0 + 3 * a1 - 3 * a2 + a3) * t * t * t);
      pts.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(path[n - 1].slice());
  return pts;
}

/** Make every triangle face along its vertices' normals. */
function orient(positions, normals, indices) {
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx * normals[a] + ny * normals[a + 1] + nz * normals[a + 2] < 0) {
      const tmp = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = tmp;
    }
  }
}

/** A strip of constant width following a 2D path, sunk `depth` below the skin. */
export function ribbon(f, { view, path, width, depth = 0, step = 0.003, sharp = false }) {
  const pts = resample(path, step, sharp);
  const pos = [];
  const nor = [];
  const ok = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q0 = pts[Math.max(0, i - 1)];
    const q1 = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q1[0] - q0[0];
    let ty = q1[1] - q0[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const good =
      project(f, view, p[0] - ty * width * 0.5, p[1] + tx * width * 0.5, depth, pos, nor) &&
      project(f, view, p[0] + ty * width * 0.5, p[1] - tx * width * 0.5, depth, pos, nor);
    if (!good) {
      pos.length = ok.length * 6;
      nor.length = ok.length * 6;
      ok.push(false);
      pos.push(0, 0, 0, 0, 0, 0);
      nor.push(0, 1, 0, 0, 1, 0);
    } else ok.push(true);
  }
  const idx = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    if (!ok[i] || !ok[i + 1]) continue;
    const a = 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const out = { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx) };
  orient(out.positions, out.normals, out.indices);
  return out;
}

/** A small disc (fan) sunk `depth` below the skin. */
export function disc(f, { view, center, radius, depth = 0, segments = 24 }) {
  const pos = [];
  const nor = [];
  if (!project(f, view, center[0], center[1], depth, pos, nor)) return null;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    if (!project(f, view, center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, depth, pos, nor)) return null;
  }
  const idx = [];
  for (let i = 0; i < segments; i++) idx.push(0, 1 + i, 1 + ((i + 1) % segments));
  const out = { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx) };
  orient(out.positions, out.normals, out.indices);
  return out;
}

/**
 * A curved panel (window glass) filling a closed 2D outline, laid onto the skin. Star-shaped
 * outlines are meshed as rings around the centroid so the edge follows the outline exactly.
 * outline: [[a, b, sharp?], ...] in the view's drawing plane.
 */
export function panel(f, { view, outline, depth = 0, rings = 6, step = 0.03 }) {
  // densify (Catmull-Rom between sharp points)
  const n = outline.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p1 = outline[i];
    const p2 = outline[(i + 1) % n];
    const p0 = p1[2] ? p1 : outline[(i - 1 + n) % n];
    const p3 = p2[2] ? p2 : outline[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const c = (a0, a1, a2, a3) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t * t + (-a0 + 3 * a1 - 3 * a2 + a3) * t * t * t);
      pts.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;
  const pos = [];
  const nor = [];
  const ok = [];
  const add = (a, b) => {
    const good = project(f, view, a, b, depth, pos, nor);
    if (!good) {
      pos.push(0, 0, 0);
      nor.push(0, 1, 0);
    }
    ok.push(good);
    return ok.length - 1;
  };
  const center = add(cx, cy);
  const ringIdx = [];
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    ringIdx.push(pts.map((p) => add(cx + (p[0] - cx) * t, cy + (p[1] - cy) * t)));
  }
  const idx = [];
  const tri = (a, b, c) => {
    if (ok[a] && ok[b] && ok[c]) idx.push(a, b, c);
  };
  const m = pts.length;
  for (let j = 0; j < m; j++) tri(center, ringIdx[0][j], ringIdx[0][(j + 1) % m]);
  for (let r = 0; r + 1 < rings; r++) {
    for (let j = 0; j < m; j++) {
      const a = ringIdx[r][j];
      const b = ringIdx[r][(j + 1) % m];
      const c = ringIdx[r + 1][j];
      const d = ringIdx[r + 1][(j + 1) % m];
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  const out = { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx) };
  orient(out.positions, out.normals, out.indices);
  return out;
}

/** A closed outline [[a, b, sharp?], ...] densified (Catmull-Rom between its sharp points). */
export function densifyLoop(outline, step) {
  const n = outline.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p1 = outline[i];
    const p2 = outline[(i + 1) % n];
    const p0 = p1[2] ? p1 : outline[(i - 1 + n) % n];
    const p3 = p2[2] ? p2 : outline[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const c = (a0, a1, a2, a3) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t * t + (-a0 + 3 * a1 - 3 * a2 + a3) * t * t * t);
      pts.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return pts;
}

/**
 * A closed outline grown outward by `d` (negative: inward), densified at `step`. Corners come out
 * slightly rounded, as a frame's do.
 */
export function offsetLoop(outline, d, step = 0.004) {
  const pts = densifyLoop(outline, step);
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    area += ax * by - bx * ay;
  }
  const s = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const [ax, ay] = pts[(i - 1 + n) % n];
    const [bx, by] = pts[(i + 1) % n];
    let tx = bx - ax;
    let ty = by - ay;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    return [p[0] + ty * d * s, p[1] - tx * d * s];
  });
}

/**
 * Steady a path laid on the skin: where its rays graze a steep surface (a wraparound windshield's
 * pillars), neighbouring points land at uneven heights and the strip comes out ragged. Points that
 * jump far from their neighbours are pulled back between them, the path is relaxed, and every point
 * is put back onto the surface with its normal there. (In place.)
 */
function steady(f, base, nor, ok, closed) {
  const n = ok.length;
  if (n < 3) return;
  const at = (i) => (closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i)));
  const P = Float64Array.from(base);
  const tmp = new Float64Array(P.length);
  // typical spacing, to spot points that jumped
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
  const typical = total / (n - 1);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < n; i++) {
      const fixedEnd = !closed && (i === 0 || i === n - 1);
      const a = at(i - 1);
      const b = at(i + 1);
      for (let c = 0; c < 3; c++) {
        const mid = (P[a * 3 + c] + P[b * 3 + c]) / 2;
        tmp[i * 3 + c] = fixedEnd || !ok[i] ? P[i * 3 + c] : P[i * 3 + c] + (mid - P[i * 3 + c]) * 0.5;
      }
      // (a point far off the line between its neighbours goes all the way back to it)
      if (!fixedEnd && ok[i]) {
        const off = Math.hypot(P[i * 3] - (P[a * 3] + P[b * 3]) / 2, P[i * 3 + 1] - (P[a * 3 + 1] + P[b * 3 + 1]) / 2, P[i * 3 + 2] - (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
        if (off > typical * 1.5) for (let c = 0; c < 3; c++) tmp[i * 3 + c] = (P[a * 3 + c] + P[b * 3 + c]) / 2;
      }
    }
    P.set(tmp);
  }
  const g = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue;
    let x = P[i * 3];
    let y = P[i * 3 + 1];
    let z = P[i * 3 + 2];
    for (let k = 0; k < 4; k++) {
      const d = f(x, y, z);
      normalAt(f, x, y, z, g);
      x -= g[0] * d;
      y -= g[1] * d;
      z -= g[2] * d;
    }
    normalAt(f, x, y, z, g);
    base[i * 3] = x;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = z;
    nor[i * 3] = g[0];
    nor[i * 3 + 1] = g[1];
    nor[i * 3 + 2] = g[2];
  }
}

/**
 * Thin out a dense 2D path: keep a point once the path has turned `turn` radians, or run `run`
 * metres, since the last one kept (straight runs need few points, bends keep theirs).
 */
function sparse(pts, closed, turn, run) {
  const n = pts.length;
  if (n < 4) return pts;
  const dir = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const keep = [pts[0]];
  let last = 0;
  let heading = dir(pts[0], pts[1]);
  let len = 0;
  for (let i = 1; i < n - 1; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let d = dir(pts[i], pts[i + 1]) - heading;
    d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    if (d > turn || len > run) {
      keep.push(pts[i]);
      last = i;
      heading = dir(pts[i], pts[i + 1]);
      len = 0;
    }
  }
  void last;
  if (!closed) keep.push(pts[n - 1]);
  return keep;
}

/**
 * A rounded strip standing on the skin along a 2D path drawn in a view: chrome trims, window
 * frames, drip rails. Real geometry, so it stays smooth and crisp at any size (painted onto the
 * voxel mesh, a centimetre-wide trim came out crumpled). Its cross-section is a half-ellipse
 * `width` across and `height` tall, sunk `sink` into the skin so no gap shows. An open path tapers
 * to nothing at its ends; `closed` joins it into a loop.
 */
export function bead(f, { view, path, closed = false, width, height, sink = 0.0008, step = 0.004, sides = 6, sharp = false, turn = 0.06, run = 0.08 }) {
  const pts = sparse(closed ? densifyLoop(path, step) : resample(path, step, sharp), closed, turn, run);
  const n = pts.length;
  const base = [];
  const nor = [];
  const ok = [];
  for (const [a, b] of pts) {
    const before = base.length;
    const good = project(f, view, a, b, 0, base, nor);
    if (!good) {
      base.length = before;
      base.push(0, 0, 0);
      nor.push(0, 1, 0);
    }
    ok.push(good);
  }
  steady(f, base, nor, ok, closed);
  // distance along the path (for the tapered ends)
  const along = [0];
  for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(base[i * 3] - base[i * 3 - 3], base[i * 3 + 1] - base[i * 3 - 2], base[i * 3 + 2] - base[i * 3 - 1]));
  const total = along[n - 1];
  const taper = width * 1.5;
  const pos = [];
  const vn = [];
  const ring = sides + 1;
  for (let i = 0; i < n; i++) {
    const p = i * 3;
    const prev = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const next = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const nx = nor[p];
    const ny = nor[p + 1];
    const nz = nor[p + 2];
    let tx = base[next * 3] - base[prev * 3];
    let ty = base[next * 3 + 1] - base[prev * 3 + 1];
    let tz = base[next * 3 + 2] - base[prev * 3 + 2];
    const tn = tx * nx + ty * ny + tz * nz;
    tx -= nx * tn;
    ty -= ny * tn;
    tz -= nz * tn;
    let tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // across the strip: B = N x T
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;
    const k = closed ? 1 : Math.min(1, Math.sqrt(Math.min(along[i], total - along[i]) / taper));
    const hw = (width / 2) * k;
    const hh = height * k;
    for (let j = 0; j <= sides; j++) {
      const th = (Math.PI * j) / sides;
      const c = Math.cos(th);
      const s = Math.sin(th);
      pos.push(base[p] + bx * c * hw + nx * (s * hh - sink), base[p + 1] + by * c * hw + ny * (s * hh - sink), base[p + 2] + bz * c * hw + nz * (s * hh - sink));
      // the half-ellipse's normal: (cos/a, sin/b) scaled
      let ex = bx * c * height + nx * s * (width / 2);
      let ey = by * c * height + ny * s * (width / 2);
      let ez = bz * c * height + nz * s * (width / 2);
      const el = Math.hypot(ex, ey, ez) || 1;
      vn.push(ex / el, ey / el, ez / el);
    }
  }
  const idx = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % n;
    if (!ok[i] || !ok[i2]) continue;
    for (let j = 0; j < sides; j++) {
      const a = i * ring + j;
      const b = i * ring + j + 1;
      const c = i2 * ring + j;
      const d = i2 * ring + j + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const out = { positions: new Float32Array(pos), normals: new Float32Array(vn), indices: new Uint32Array(idx) };
  orient(out.positions, out.normals, out.indices);
  return out;
}

export function buildDecal(f, spec) {
  if (spec.kind === 'ribbon') return ribbon(f, spec);
  if (spec.kind === 'disc') return disc(f, spec);
  if (spec.kind === 'panel') return panel(f, spec);
  if (spec.kind === 'bead') return bead(f, spec);
  throw new Error(`unknown decal kind ${spec.kind}`);
}
