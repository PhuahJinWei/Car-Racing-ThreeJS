// Sparse surface-nets polygoniser + per-material simplification + SDF normals/AO.
import { MeshoptSimplifier } from '../../node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js';

const CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];
// per-axis winding correction (verified with a sphere test so faces point outward)
export const FLIP = [false, false, false];
const EDGES = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * Polygonise `sdf(x, y, z, out)` (returns distance, writes out.m = material id) inside bounds
 * with voxel size h. Only blocks near the surface are evaluated.
 * Returns { positions: Float32Array, mats: Uint8Array (per vertex), indices: Uint32Array, triMats: Uint8Array }.
 */
export function polygonize(sdf, bounds, h, opts = {}) {
  const B = opts.block ?? 8;
  const dc = opts.dc ?? false;
  const crossings = new Float64Array(12 * 3);
  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  const nx = Math.ceil((x1 - x0) / h) + 1;
  const ny = Math.ceil((y1 - y0) / h) + 1;
  const nz = Math.ceil((z1 - z0) / h) + 1;
  const bxN = Math.ceil(nx / B);
  const byN = Math.ceil(ny / B);
  const bzN = Math.ceil(nz / B);
  const out = { m: 0 };
  const radius = Math.sqrt(3) * B * h * 0.5;
  const safety = opts.safety ?? 1.6;

  const vIndex = new Map(); // voxel id -> vertex index
  const vMask = []; // per vertex: corner sign mask
  const vVox = []; // per vertex: voxel id
  let pos = new Float32Array(1 << 20);
  let mats = new Uint8Array(1 << 18);
  let vCount = 0;
  const N = B + 1;
  const vals = new Float32Array(N * N * N);
  const mvals = new Uint8Array(N * N * N);
  const vid = (i, j, k) => i + nx * (j + ny * k);
  const c = new Float32Array(8);
  let evals = 0;
  let activeBlocks = 0;

  for (let bk = 0; bk < bzN; bk++) {
    for (let bj = 0; bj < byN; bj++) {
      for (let bi = 0; bi < bxN; bi++) {
        const cx = x0 + (bi * B + B * 0.5) * h;
        const cy = y0 + (bj * B + B * 0.5) * h;
        const cz = z0 + (bk * B + B * 0.5) * h;
        const dc = sdf(cx, cy, cz, out);
        evals++;
        if (Math.abs(dc) > radius * safety) continue;
        activeBlocks++;
        // corner values for the block (+1 overlap)
        for (let k = 0; k < N; k++) {
          for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
              const o = i + N * (j + N * k);
              vals[o] = sdf(x0 + (bi * B + i) * h, y0 + (bj * B + j) * h, z0 + (bk * B + k) * h, out);
              mvals[o] = out.m;
            }
          }
        }
        evals += N * N * N;
        for (let k = 0; k < B; k++) {
          const gk = bk * B + k;
          if (gk >= nz - 1) break;
          for (let j = 0; j < B; j++) {
            const gj = bj * B + j;
            if (gj >= ny - 1) break;
            for (let i = 0; i < B; i++) {
              const gi = bi * B + i;
              if (gi >= nx - 1) break;
              let mask = 0;
              for (let q = 0; q < 8; q++) {
                const o = i + CORNERS[q][0] + N * (j + CORNERS[q][1] + N * (k + CORNERS[q][2]));
                c[q] = vals[o];
                if (vals[o] < 0) mask |= 1 << q;
              }
              if (mask === 0 || mask === 255) continue;
              // vertex: the mean of the edge crossings (surface nets), or with `dc` the point that
              // best fits the surface's tangent planes at the crossings (dual contouring), which
              // lands on creases and corners instead of shaving them off
              let sx = 0;
              let sy = 0;
              let sz = 0;
              let cnt = 0;
              for (const [a, b] of EDGES) {
                const da = c[a];
                const db = c[b];
                if (da < 0 === db < 0) continue;
                const t = da / (da - db);
                const qx = CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
                const qy = CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
                const qz = CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
                if (dc) {
                  crossings[cnt * 3] = qx;
                  crossings[cnt * 3 + 1] = qy;
                  crossings[cnt * 3 + 2] = qz;
                }
                sx += qx;
                sy += qy;
                sz += qz;
                cnt++;
              }
              if (dc && cnt >= 2) {
                const fit = qefVertex(sdf, out, crossings, cnt, sx / cnt, sy / cnt, sz / cnt, x0 + gi * h, y0 + gj * h, z0 + gk * h, h);
                evals += cnt * 6;
                if (fit) {
                  sx = fit[0] * cnt;
                  sy = fit[1] * cnt;
                  sz = fit[2] * cnt;
                }
              }
              // material: corner closest to the surface
              let bestQ = 0;
              let bestD = Infinity;
              for (let q = 0; q < 8; q++) {
                const ad = Math.abs(c[q]);
                if (ad < bestD) {
                  bestD = ad;
                  bestQ = q;
                }
              }
              const mo = i + CORNERS[bestQ][0] + N * (j + CORNERS[bestQ][1] + N * (k + CORNERS[bestQ][2]));
              if ((vCount + 1) * 3 > pos.length) {
                const np = new Float32Array(pos.length * 2);
                np.set(pos);
                pos = np;
              }
              if (vCount + 1 > mats.length) {
                const nm = new Uint8Array(mats.length * 2);
                nm.set(mats);
                mats = nm;
              }
              const px = x0 + (gi + sx / cnt) * h;
              const py = y0 + (gj + sy / cnt) * h;
              const pz = z0 + (gk + sz / cnt) * h;
              pos[vCount * 3] = px;
              pos[vCount * 3 + 1] = py;
              pos[vCount * 3 + 2] = pz;
              // material where the vertex actually sits (sub-voxel accurate borders), falling back
              // to the nearest corner's if that point reports something odd
              sdf(px, py, pz, out);
              mats[vCount] = out.m ?? mvals[mo];
              evals++;
              const id = vid(gi, gj, gk);
              vIndex.set(id, vCount);
              vMask.push(mask);
              vVox.push(id);
              vCount++;
            }
          }
        }
      }
    }
  }

  // quads across sign-changing edges
  const idx = [];
  const triM = [];
  const sx = 1;
  const sy = nx;
  const sz = nx * ny;
  // (around the quad: a, b, d, c) split along the shorter diagonal, which follows a crease where the
  // fixed one would zigzag across it
  const d2 = (p, q) => (pos[p * 3] - pos[q * 3]) ** 2 + (pos[p * 3 + 1] - pos[q * 3 + 1]) ** 2 + (pos[p * 3 + 2] - pos[q * 3 + 2]) ** 2;
  // per triangle material: majority vote of the triangle's vertices
  const vote = (p, q, r) => (p === q || p === r ? p : q === r ? q : p);
  const tri = (p, q, r) => {
    idx.push(p, q, r);
    triM.push(vote(mats[p], mats[q], mats[r]));
  };
  const quad = (a, b, c, d, flip) => {
    const ad = dc && d2(a, d) < d2(b, c);
    if (ad) {
      if (flip) {
        tri(a, d, b);
        tri(a, c, d);
      } else {
        tri(a, b, d);
        tri(a, d, c);
      }
    } else if (flip) {
      tri(a, c, b);
      tri(b, c, d);
    } else {
      tri(a, b, c);
      tri(b, d, c);
    }
  };
  for (let v = 0; v < vCount; v++) {
    const mask = vMask[v];
    const id = vVox[v];
    const in0 = mask & 1;
    // edge along +x from corner 0 to corner 1
    if ((mask & 1) !== (mask & 2) >> 1) {
      const a = vIndex.get(id);
      const b = vIndex.get(id - sy);
      const c = vIndex.get(id - sz);
      const d = vIndex.get(id - sy - sz);
      if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) quad(a, b, c, d, !in0 !== FLIP[0]);
    }
    // edge along +y (corner 0 -> 2)
    if ((mask & 1) !== (mask & 4) >> 2) {
      const a = vIndex.get(id);
      const b = vIndex.get(id - sz);
      const c = vIndex.get(id - sx);
      const d = vIndex.get(id - sx - sz);
      if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) quad(a, b, c, d, !in0 !== FLIP[1]);
    }
    // edge along +z (corner 0 -> 4)
    if ((mask & 1) !== (mask & 16) >> 4) {
      const a = vIndex.get(id);
      const b = vIndex.get(id - sx);
      const c = vIndex.get(id - sy);
      const d = vIndex.get(id - sx - sy);
      if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) quad(a, b, c, d, !in0 !== FLIP[2]);
    }
  }
  return {
    positions: pos.slice(0, vCount * 3),
    mats: mats.slice(0, vCount),
    indices: new Uint32Array(idx),
    triMats: new Uint8Array(triM),
    stats: { evals, activeBlocks, vertices: vCount, triangles: idx.length / 3 },
  };
}

const _qn = [0, 0, 0];
const _fit = [0, 0, 0];

/**
 * Dual contouring: the point in a cell (cell units, 0..1) that best fits the tangent planes at its
 * edge crossings `q` (cnt of them), pulled gently toward their mean (mx, my, mz) so flat and gently
 * curved patches keep the surface nets placement. null when the fit is unusable.
 */
function qefVertex(sdf, out, q, cnt, mx, my, mz, ox, oy, oz, h) {
  // normal equations of sum((n.x - n.q)^2) + L |x - m|^2
  const L = 0.06;
  let a00 = L;
  let a01 = 0;
  let a02 = 0;
  let a11 = L;
  let a12 = 0;
  let a22 = L;
  let b0 = L * mx;
  let b1 = L * my;
  let b2 = L * mz;
  const e = h * 0.12;
  for (let i = 0; i < cnt; i++) {
    const qx = q[i * 3];
    const qy = q[i * 3 + 1];
    const qz = q[i * 3 + 2];
    gradient(sdf, ox + qx * h, oy + qy * h, oz + qz * h, e, out, _qn);
    const [nx, ny, nz] = _qn;
    const d = nx * qx + ny * qy + nz * qz;
    a00 += nx * nx;
    a01 += nx * ny;
    a02 += nx * nz;
    a11 += ny * ny;
    a12 += ny * nz;
    a22 += nz * nz;
    b0 += nx * d;
    b1 += ny * d;
    b2 += nz * d;
  }
  // symmetric 3x3 solve (Cramer)
  const c00 = a11 * a22 - a12 * a12;
  const c01 = a02 * a12 - a01 * a22;
  const c02 = a01 * a12 - a02 * a11;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (!(Math.abs(det) > 1e-12)) return null;
  const c11 = a00 * a22 - a02 * a02;
  const c12 = a01 * a02 - a00 * a12;
  const c22 = a00 * a11 - a01 * a01;
  let x = (c00 * b0 + c01 * b1 + c02 * b2) / det;
  let y = (c01 * b0 + c11 * b1 + c12 * b2) / det;
  let z = (c02 * b0 + c12 * b1 + c22 * b2) / det;
  if (!Number.isFinite(x + y + z)) return null;
  // (kept inside its cell: a point outside it is a fit across two features, which spikes)
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  y = y < 0 ? 0 : y > 1 ? 1 : y;
  z = z < 0 ? 0 : z > 1 ? 1 : z;
  _fit[0] = x;
  _fit[1] = y;
  _fit[2] = z;
  return _fit;
}

/**
 * Cut the mesh exactly along its material borders. Voxel meshing leaves each border as a staircase
 * of whole triangles; here every edge whose ends differ is split where the material actually
 * changes (found by bisection, then pulled onto the surface), and each triangle that straddles a
 * border is split into one piece per material. Borders come out as clean lines, true to the design
 * to well under a millimetre. Rewrites positions / mats / indices / triMats.
 */
export function cutMaterialBorders(sdf, mesh) {
  const { positions: P0, mats: M0, indices: I } = mesh;
  const nv0 = P0.length / 3;
  const pos = Array.from(P0);
  const mats = Array.from(M0);
  const out = { m: 0 };
  const g = [0, 0, 0];
  const cache = new Map();
  const matAt = (x, y, z) => {
    sdf(x, y, z, out);
    return out.m;
  };
  const onSurface = (x, y, z) => {
    for (let k = 0; k < 2; k++) {
      const d = sdf(x, y, z, out);
      if (Math.abs(d) < 1e-6) break;
      gradient(sdf, x, y, z, 0.0008, out, g);
      x -= g[0] * d;
      y -= g[1] * d;
      z -= g[2] * d;
    }
    return [x, y, z];
  };
  const addVertex = ([x, y, z], m) => {
    pos.push(x, y, z);
    mats.push(m);
    return mats.length - 1;
  };
  // where the material changes along the edge a-b
  const borderPoint = (a, b) => {
    const key = a < b ? a * nv0 + b : b * nv0 + a;
    let v = cache.get(key);
    if (v !== undefined) return v;
    const ma = mats[a];
    const ax = pos[a * 3];
    const ay = pos[a * 3 + 1];
    const az = pos[a * 3 + 2];
    const dx = pos[b * 3] - ax;
    const dy = pos[b * 3 + 1] - ay;
    const dz = pos[b * 3 + 2] - az;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 11; k++) {
      const t = (lo + hi) / 2;
      if (matAt(ax + dx * t, ay + dy * t, az + dz * t) === ma) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    v = addVertex(onSurface(ax + dx * t, ay + dy * t, az + dz * t), ma);
    cache.set(key, v);
    return v;
  };
  const idx = [];
  const triM = [];
  const fan = (poly, m) => {
    for (let k = 1; k + 1 < poly.length; k++) {
      idx.push(poly[0], poly[k], poly[k + 1]);
      triM.push(m);
    }
  };
  let split = 0;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    const m = [mats[v[0]], mats[v[1]], mats[v[2]]];
    if (m[0] === m[1] && m[1] === m[2]) {
      idx.push(v[0], v[1], v[2]);
      triM.push(m[0]);
      continue;
    }
    split++;
    // border points along the triangle's edges (null where an edge doesn't cross one)
    const e = [0, 1, 2].map((k) => (m[k] === m[(k + 1) % 3] ? null : borderPoint(v[k], v[(k + 1) % 3])));
    if (m[0] !== m[1] && m[1] !== m[2] && m[0] !== m[2]) {
      // three materials meet: one piece per corner, joined at a point in the middle
      const c = [0, 1, 2].map((k) => [0, 1, 2].reduce((s, j) => s + pos[e[j] * 3 + k], 0) / 3);
      const mid = addVertex(onSurface(c[0], c[1], c[2]), m[0]);
      for (let k = 0; k < 3; k++) fan([e[(k + 2) % 3], v[k], e[k], mid], m[k]);
      continue;
    }
    // two materials: walk the rim (corners and border points in winding order) and cut it in two
    const rim = [];
    for (let k = 0; k < 3; k++) {
      rim.push(v[k]);
      if (e[k] !== null) rim.push(e[k]);
    }
    const cuts = rim.map((p, i) => (e.includes(p) ? i : -1)).filter((i) => i >= 0);
    const [p, q] = cuts;
    const one = rim.slice(p, q + 1);
    const two = [...rim.slice(q), ...rim.slice(0, p + 1)];
    fan(one, mats[one[1]]);
    fan(two, mats[two[1]]);
  }
  mesh.positions = new Float32Array(pos);
  mesh.mats = Uint8Array.from(mats);
  mesh.indices = new Uint32Array(idx);
  mesh.triMats = Uint8Array.from(triM);
  return split;
}

/**
 * A copy of a mesh with each triangle's material remapped by fn(x, y, z, material) at its centre (a
 * design's far model merges small details into what surrounds them). It has its own positions, so
 * smoothSeams straightens only the borders it keeps: a merged border left straightened is a
 * wavering crease the simplifier keeps thousands of triangles for.
 */
export function remapMaterials(mesh, fn) {
  const { positions: P, indices: I, triMats } = mesh;
  const tm = new Uint8Array(triMats.length);
  for (let t = 0; t < tm.length; t++) {
    const a = I[t * 3] * 3;
    const b = I[t * 3 + 1] * 3;
    const c = I[t * 3 + 2] * 3;
    tm[t] = fn((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3, triMats[t]);
  }
  return { ...mesh, positions: P.slice(), triMats: tm };
}

/**
 * Straighten material borders: voxel meshing leaves them as staircases of triangle edges. Each
 * border vertex is relaxed toward the midpoint of its two border neighbours and pulled back onto
 * the surface. Smooth borders look cleaner and simplify into far fewer triangles.
 */
export function smoothSeams(sdf, mesh, iters = 4) {
  const { positions: P, indices: I, triMats: M } = mesh;
  const nv = P.length / 3;
  const first = new Int16Array(nv).fill(-1);
  const seam = new Uint8Array(nv);
  for (let t = 0; t < M.length; t++) {
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k];
      if (first[v] < 0) first[v] = M[t];
      else if (first[v] !== M[t]) seam[v] = 1;
    }
  }
  // border edges: shared by two triangles of different materials
  const edges = new Map();
  const nb = new Map();
  const link = (a, b) => {
    let l = nb.get(a);
    if (!l) nb.set(a, (l = []));
    if (!l.includes(b)) l.push(b);
  };
  for (let t = 0; t < M.length; t++) {
    for (let k = 0; k < 3; k++) {
      const a = I[t * 3 + k];
      const b = I[t * 3 + ((k + 1) % 3)];
      if (!seam[a] || !seam[b]) continue;
      const key = a < b ? a * nv + b : b * nv + a;
      const m = edges.get(key);
      if (m === undefined) edges.set(key, M[t]);
      else if (m !== M[t]) {
        link(a, b);
        link(b, a);
      }
    }
  }
  const list = [];
  for (const [v, l] of nb) if (l.length === 2) list.push(v, l[0], l[1]);
  const out = { m: 0 };
  const g = [0, 0, 0];
  const next = new Float32Array(list.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < list.length; i += 3) {
      const v = list[i] * 3;
      const a = list[i + 1] * 3;
      const b = list[i + 2] * 3;
      let x = P[v] + 0.5 * ((P[a] + P[b]) * 0.5 - P[v]);
      let y = P[v + 1] + 0.5 * ((P[a + 1] + P[b + 1]) * 0.5 - P[v + 1]);
      let z = P[v + 2] + 0.5 * ((P[a + 2] + P[b + 2]) * 0.5 - P[v + 2]);
      for (let k = 0; k < 2; k++) {
        const d = sdf(x, y, z, out);
        gradient(sdf, x, y, z, 0.0015, out, g);
        x -= g[0] * d;
        y -= g[1] * d;
        z -= g[2] * d;
      }
      next[i] = x;
      next[i + 1] = y;
      next[i + 2] = z;
    }
    for (let i = 0; i < list.length; i += 3) {
      const v = list[i] * 3;
      P[v] = next[i];
      P[v + 1] = next[i + 1];
      P[v + 2] = next[i + 2];
    }
  }
  return list.length / 3;
}

/** Gradient of the field by central differences. */
export function gradient(sdf, x, y, z, e, out, res) {
  const gx = sdf(x + e, y, z, out) - sdf(x - e, y, z, out);
  const gy = sdf(x, y + e, z, out) - sdf(x, y - e, z, out);
  const gz = sdf(x, y, z + e, out) - sdf(x, y, z - e, out);
  const l = Math.hypot(gx, gy, gz) || 1;
  res[0] = gx / l;
  res[1] = gy / l;
  res[2] = gz / l;
  return res;
}

const prepared = new WeakMap();

/**
 * Average a per-vertex attribute (size `dim`) with each vertex's neighbours across the triangles,
 * `iters` times; `unit` renormalises (normals).
 */
function smoothAttribute(indices, A, dim, iters, unit) {
  const n = A.length / dim;
  const sum = new Float32Array(A.length);
  const cnt = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    sum.fill(0);
    cnt.fill(0);
    for (let t = 0; t < indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const v = indices[t + k];
        const a = indices[t + ((k + 1) % 3)];
        const b = indices[t + ((k + 2) % 3)];
        for (let c = 0; c < dim; c++) sum[v * dim + c] += A[a * dim + c] + A[b * dim + c];
        cnt[v] += 2;
      }
    }
    for (let v = 0; v < n; v++) {
      if (!cnt[v]) continue;
      // half its own value, half its neighbours' mean
      for (let c = 0; c < dim; c++) A[v * dim + c] = 0.5 * A[v * dim + c] + (0.5 * sum[v * dim + c]) / cnt[v];
      if (unit) {
        const l = Math.hypot(A[v * 3], A[v * 3 + 1], A[v * 3 + 2]) || 1;
        A[v * 3] /= l;
        A[v * 3 + 1] /= l;
        A[v * 3 + 2] /= l;
      }
    }
  }
}

/**
 * Split vertices per material (so material borders become attribute seams that the simplifier
 * keeps watertight) and compute field normals on the full-resolution mesh. Each normal is sampled
 * slightly inside the vertex's own faces, which keeps creases between materials crisp.
 */
function prepare(sdf, mesh, opts) {
  const creaseCos = opts.creaseCos ?? 0.76;
  let cache = prepared.get(mesh);
  if (!cache) prepared.set(mesh, (cache = new Map()));
  let prep = cache.get(creaseCos);
  if (prep) return prep;
  const { indices, triMats, positions } = mesh;
  const nt = triMats.length;
  // face normals, and each vertex's faces
  const FN = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    FN[t * 3] = nx / l;
    FN[t * 3 + 1] = ny / l;
    FN[t * 3 + 2] = nz / l;
  }
  const nv0 = positions.length / 3;
  const start = new Uint32Array(nv0 + 1);
  for (let i = 0; i < indices.length; i++) start[indices[i] + 1]++;
  for (let v = 0; v < nv0; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nv0);
  const vt = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) vt[fill[indices[i]]++] = i;
  // Split vertices per material (so material borders become attribute seams that the simplifier
  // keeps watertight) and per smoothing group: faces meeting at a real crease (over ~40 degrees)
  // get their own copies, so the crease stays crisp instead of being shaded round (creaseCos below
  // -1: no crease splits - every seam holds the simplifier back, which a far model can't afford)
  const pos = [];
  const vm = [];
  const split = new Uint32Array(indices.length);
  for (let v = 0; v < nv0; v++) {
    const groups = []; // [material, nx, ny, nz (first face), id]
    for (let k = start[v]; k < start[v + 1]; k++) {
      const corner = vt[k];
      const t = (corner / 3) | 0;
      const m = triMats[t];
      const fx = FN[t * 3];
      const fy = FN[t * 3 + 1];
      const fz = FN[t * 3 + 2];
      let gid = -1;
      for (const gr of groups) {
        if (gr[0] === m && gr[1] * fx + gr[2] * fy + gr[3] * fz > creaseCos) {
          gid = gr[4];
          break;
        }
      }
      if (gid < 0) {
        gid = vm.length;
        groups.push([m, fx, fy, fz, gid]);
        pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        vm.push(m);
      }
      split[corner] = gid;
    }
  }
  const P = new Float32Array(pos);
  const n = vm.length;
  const pull = new Float32Array(n * 3);
  const cnt = new Uint16Array(n);
  for (let t = 0; t < split.length; t += 3) {
    const a = split[t];
    const b = split[t + 1];
    const c = split[t + 2];
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    for (const v of [a, b, c]) {
      pull[v * 3] += cx - P[v * 3];
      pull[v * 3 + 1] += cy - P[v * 3 + 1];
      pull[v * 3 + 2] += cz - P[v * 3 + 2];
      cnt[v]++;
    }
  }
  // each copy's faces' mean normal (a check on the field's)
  const GN = new Float32Array(n * 3);
  for (let i = 0; i < split.length; i++) {
    const v = split[i];
    const t = (i / 3) | 0;
    GN[v * 3] += FN[t * 3];
    GN[v * 3 + 1] += FN[t * 3 + 1];
    GN[v * 3 + 2] += FN[t * 3 + 2];
  }
  const N = new Float32Array(n * 3);
  const out = { m: 0 };
  const g = [0, 0, 0];
  const e = opts.normalEps ?? 0.0025;
  // Painted skin takes its normals from the un-cut shell: the gaps, grooves and trims cut into it
  // otherwise bend the field's normals around them, and the bends spread over the large triangles
  // left after simplification as dents and smudges in the reflections
  const shell = opts.shell;
  const shellMats = opts.shellMats;
  for (let v = 0; v < n; v++) {
    const k = cnt[v] ? 0.35 / cnt[v] : 0;
    const qx = P[v * 3] + pull[v * 3] * k;
    const qy = P[v * 3 + 1] + pull[v * 3 + 1] * k;
    const qz = P[v * 3 + 2] + pull[v * 3 + 2] * k;
    if (shell && shellMats?.has(vm[v]) && Math.abs(shell(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])) < 0.0012) gradient(shell, qx, qy, qz, 0.004, out, g);
    else gradient(sdf, qx, qy, qz, e, out, g);
    // (where the field points somewhere else entirely - a thin part, a pocket's lip - the faces know
    // better)
    const gl = Math.hypot(GN[v * 3], GN[v * 3 + 1], GN[v * 3 + 2]) || 1;
    const fx = GN[v * 3] / gl;
    const fy = GN[v * 3 + 1] / gl;
    const fz = GN[v * 3 + 2] / gl;
    if (g[0] * fx + g[1] * fy + g[2] * fz < 0.3) {
      g[0] = fx;
      g[1] = fy;
      g[2] = fz;
    }
    N[v * 3] = g[0];
    N[v * 3 + 1] = g[1];
    N[v * 3 + 2] = g[2];
  }
  // smooth away the distance grids' millimetre-scale ripple (it shows as crumpled reflections);
  // copies only average with their own neighbours, so creases and material borders stay sharp
  smoothAttribute(split, N, 3, opts.normalSmooth ?? 2, true);
  // AO is baked here, before simplification, so the simplifier can see it: baked afterwards, a
  // single crease vertex smeared its darkness across a whole large triangle as a black wedge
  const AO = bakeAO(sdf, P, N, out, opts.ao);
  // (and smoothed: a handful of rays per vertex leaves it blotchy)
  smoothAttribute(split, AO, 1, opts.aoSmooth ?? 3, false);
  // designs can lighten AO on chosen materials (e.g. a mesh deep in an intake that should still show)
  if (opts.aoStrength) {
    for (let v = 0; v < n; v++) {
      const s = opts.aoStrength[vm[v]];
      if (s !== undefined) AO[v] = 1 - (1 - AO[v]) * s;
    }
  }
  // ...and set a floor under it in chosen places: aoFloor(x, y, z, nx, ny, nz, material) returns
  // the least AO a vertex may have (0: leave it)
  if (opts.aoFloor) {
    for (let v = 0; v < n; v++) {
      const f = opts.aoFloor(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], vm[v]);
      if (f > AO[v]) AO[v] = f;
    }
  }
  prep = { split, P, N, AO, vm: Uint8Array.from(vm) };
  cache.set(creaseCos, prep);
  return prep;
}

/**
 * Simplify the whole mesh in one go (normals and AO are simplification attributes, so shading
 * features such as creases and crevices keep enough triangles), then build compact per-material meshes.
 * target: total triangle count to aim for.
 */
export async function buildParts(sdf, mesh, target, opts = {}) {
  await MeshoptSimplifier.ready;
  const { split, P, N, AO, vm } = prepare(sdf, mesh, opts);
  const goal = Math.min(split.length, Math.max(3, Math.floor(target) * 3));
  const w = opts.normalWeight ?? 0.03;
  const aw = opts.aoWeight ?? w;
  // attributes: normal + AO; per-material importance scales how much a part's shading detail counts
  const A = new Float32Array(vm.length * 4);
  for (let v = 0; v < vm.length; v++) {
    const k = opts.matWeights?.[vm[v]] ?? 1;
    A[v * 4] = N[v * 3] * k;
    A[v * 4 + 1] = N[v * 3 + 1] * k;
    A[v * 4 + 2] = N[v * 3 + 2] * k;
    A[v * 4 + 3] = AO[v] * k;
  }
  const weights = [w, w, w, aw];
  let src = split;
  // pre-passes: coarsen less visible parts (wheel wells, underbody, cockpit) with looser errors
  // while every vertex touching the remaining parts stays put
  for (const stage of opts.stages || []) {
    const lock = new Uint8Array(vm.length);
    const pinned = new Set();
    for (let v = 0; v < vm.length; v++) {
      if (stage.mats.has(vm[v])) continue;
      lock[v] = 1;
      pinned.add(`${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`);
    }
    // seam copies of a pinned vertex must stay locked as well
    for (let v = 0; v < vm.length; v++) if (!lock[v] && pinned.has(`${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`)) lock[v] = 1;
    [src] = MeshoptSimplifier.simplifyWithAttributes(src, P, 3, A, 4, weights, lock, 0, stage.error, ['ErrorAbsolute']);
  }
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(src, P, 3, A, 4, weights, null, Math.min(goal, src.length), opts.error ?? 0.002, ['ErrorAbsolute']);
  const byMat = new Map();
  for (let t = 0; t < simplified.length; t += 3) {
    const m = vm[simplified[t]];
    let arr = byMat.get(m);
    if (!arr) byMat.set(m, (arr = []));
    arr.push(simplified[t], simplified[t + 1], simplified[t + 2]);
  }
  const parts = {};
  for (const [m, arr] of byMat) {
    const remap = new Map();
    const pp = [];
    const nn = [];
    const aa = [];
    const ind = new Uint32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      let nv = remap.get(v);
      if (nv === undefined) {
        nv = pp.length / 3;
        remap.set(v, nv);
        pp.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        nn.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        aa.push(AO[v]);
      }
      ind[i] = nv;
    }
    parts[m] = { positions: new Float32Array(pp), normals: new Float32Array(nn), ao: new Float32Array(aa), indices: ind };
  }
  return parts;
}

/**
 * Cheap SDF ambient occlusion: march along the normal and a few tilted directions. A tilted ray is
 * only occluded where the field comes closer than an open surface would put it (h cos tilt): judged
 * against h, as it once was, every flat panel read as part-shadowed, by an amount that swung with
 * the slightest change in its angle - which turned invisible ripples into blotches. `open` is the
 * value an unoccluded surface bakes to (the game's materials are tuned for about 0.6).
 */
export function bakeAO(sdf, positions, normals, out, cfg = {}) {
  const n = positions.length / 3;
  const ao = new Float32Array(n);
  const steps = cfg.steps ?? 5;
  const delta = cfg.delta ?? 0.03;
  const strength = cfg.strength ?? 1.0;
  const open = cfg.open ?? 0.6;
  const dirs = [
    [0, 0],
    [0.55, 0],
    [-0.55, 0],
    [0, 0.55],
    [0, -0.55],
  ];
  for (let v = 0; v < n; v++) {
    const px = positions[v * 3];
    const py = positions[v * 3 + 1];
    const pz = positions[v * 3 + 2];
    const nx = normals[v * 3];
    const ny = normals[v * 3 + 1];
    const nz = normals[v * 3 + 2];
    // tangent frame
    let tx = Math.abs(ny) < 0.9 ? 0 : 1;
    let ty = Math.abs(ny) < 0.9 ? 1 : 0;
    let tz = 0;
    // t = normalize(cross(n, up))
    let ax = ny * tz - nz * ty;
    let ay = nz * tx - nx * tz;
    let az = nx * ty - ny * tx;
    let al = Math.hypot(ax, ay, az) || 1;
    ax /= al;
    ay /= al;
    az /= al;
    const bx = ny * az - nz * ay;
    const by = nz * ax - nx * az;
    const bz = nx * ay - ny * ax;
    let occ = 0;
    for (const [s, t] of dirs) {
      let dx = nx + ax * s + bx * t;
      let dy = ny + ay * s + by * t;
      let dz = nz + az * s + bz * t;
      const dl = Math.hypot(dx, dy, dz);
      dx /= dl;
      dy /= dl;
      dz /= dl;
      const cos = 1 / dl;
      let w = 1;
      for (let i = 1; i <= steps; i++) {
        const h = delta * i;
        const d = sdf(px + dx * h, py + dy * h, pz + dz * h, out);
        occ += Math.max(0, h * cos - d) * w;
        w *= 0.6;
      }
    }
    occ /= dirs.length;
    let a = 1 - Math.min(1, (occ / delta) * 0.9 * strength);
    // ground: faces pointing down / near the floor are darker
    const ground = Math.min(1, Math.max(0, py / 0.35));
    a *= 0.55 + 0.45 * Math.min(1, ground + Math.max(0, ny) * 0.8);
    ao[v] = Math.max(0.05, a * open);
  }
  return ao;
}

/** Snap vertices onto the true surface (a couple of Newton steps). */
export function project(sdf, positions, iters = 2, e = 0.002) {
  const out = { m: 0 };
  const g = [0, 0, 0];
  for (let v = 0; v < positions.length / 3; v++) {
    for (let it = 0; it < iters; it++) {
      const x = positions[v * 3];
      const y = positions[v * 3 + 1];
      const z = positions[v * 3 + 2];
      const d = sdf(x, y, z, out);
      if (Math.abs(d) < 1e-5) break;
      gradient(sdf, x, y, z, e, out, g);
      positions[v * 3] = x - g[0] * d;
      positions[v * 3 + 1] = y - g[1] * d;
      positions[v * 3 + 2] = z - g[2] * d;
    }
  }
}
