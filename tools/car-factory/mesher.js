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
              // vertex = mean of edge crossings
              let sx = 0;
              let sy = 0;
              let sz = 0;
              let cnt = 0;
              for (const [a, b] of EDGES) {
                const da = c[a];
                const db = c[b];
                if (da < 0 === db < 0) continue;
                const t = da / (da - db);
                sx += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
                sy += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
                sz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
                cnt++;
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
  const quad = (a, b, c, d, flip) => {
    const ma = mats[a];
    const mb = mats[b];
    const mc = mats[c];
    const md = mats[d];
    if (flip) {
      idx.push(a, c, b, b, c, d);
    } else {
      idx.push(a, b, c, b, d, c);
    }
    // per triangle material: majority vote of the triangle's vertices
    const vote = (p, q, r) => (p === q || p === r ? p : q === r ? q : p);
    if (flip) {
      triM.push(vote(ma, mc, mb), vote(mb, mc, md));
    } else {
      triM.push(vote(ma, mb, mc), vote(mb, md, mc));
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
 * Split vertices per material (so material borders become attribute seams that the simplifier
 * keeps watertight) and compute field normals on the full-resolution mesh. Each normal is sampled
 * slightly inside the vertex's own faces, which keeps creases between materials crisp.
 */
function prepare(sdf, mesh, opts) {
  let prep = prepared.get(mesh);
  if (prep) return prep;
  const { indices, triMats, positions } = mesh;
  const key = new Map();
  const pos = [];
  const vm = [];
  const split = new Uint32Array(indices.length);
  for (let t = 0; t < triMats.length; t++) {
    const m = triMats[t];
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k];
      const id = v * 32 + m; // (room for 32 materials)
      let nv = key.get(id);
      if (nv === undefined) {
        nv = vm.length;
        key.set(id, nv);
        pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        vm.push(m);
      }
      split[t * 3 + k] = nv;
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
  const N = new Float32Array(n * 3);
  const out = { m: 0 };
  const g = [0, 0, 0];
  const e = opts.normalEps ?? 0.0025;
  for (let v = 0; v < n; v++) {
    const k = cnt[v] ? 0.35 / cnt[v] : 0;
    gradient(sdf, P[v * 3] + pull[v * 3] * k, P[v * 3 + 1] + pull[v * 3 + 1] * k, P[v * 3 + 2] + pull[v * 3 + 2] * k, e, out, g);
    N[v * 3] = g[0];
    N[v * 3 + 1] = g[1];
    N[v * 3 + 2] = g[2];
  }
  // AO is baked here, before simplification, so the simplifier can see it: baked afterwards, a
  // single crease vertex smeared its darkness across a whole large triangle as a black wedge
  const AO = bakeAO(sdf, P, N, out, opts.ao);
  // designs can lighten AO on chosen materials (e.g. a mesh deep in an intake that should still show)
  if (opts.aoStrength) {
    for (let v = 0; v < n; v++) {
      const s = opts.aoStrength[vm[v]];
      if (s !== undefined) AO[v] = 1 - (1 - AO[v]) * s;
    }
  }
  prep ={ split, P, N, AO, vm: Uint8Array.from(vm) };
  prepared.set(mesh, prep);
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

/** Cheap SDF ambient occlusion: march along the normal and a few tilted directions. */
export function bakeAO(sdf, positions, normals, out, cfg = {}) {
  const n = positions.length / 3;
  const ao = new Float32Array(n);
  const steps = cfg.steps ?? 5;
  const delta = cfg.delta ?? 0.03;
  const strength = cfg.strength ?? 1.0;
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
      let w = 1;
      for (let i = 1; i <= steps; i++) {
        const h = delta * i;
        const d = sdf(px + dx * h, py + dy * h, pz + dz * h, out);
        occ += Math.max(0, h - d) * w;
        w *= 0.6;
      }
    }
    occ /= dirs.length;
    let a = 1 - Math.min(1, (occ / delta) * 0.9 * strength);
    // ground: faces pointing down / near the floor are darker
    const ground = Math.min(1, Math.max(0, py / 0.35));
    a *= 0.55 + 0.45 * Math.min(1, ground + Math.max(0, ny) * 0.8);
    ao[v] = Math.max(0.08, a);
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
