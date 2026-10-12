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

export function buildDecal(f, spec) {
  if (spec.kind === 'ribbon') return ribbon(f, spec);
  if (spec.kind === 'disc') return disc(f, spec);
  if (spec.kind === 'panel') return panel(f, spec);
  throw new Error(`unknown decal kind ${spec.kind}`);
}
