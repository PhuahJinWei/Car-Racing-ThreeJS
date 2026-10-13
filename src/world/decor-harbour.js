import * as THREE from 'three';
import { globalUniforms, additive } from './materials.js';
import { createHaloMaterial } from './decor-common.js';

// A container port the ring road drives through: a bay it crosses on a bridge, a straight quay
// lined with ship-to-shore cranes (the road runs along it at ground level, between their legs)
// and moored ships, a container yard behind it lit by floodlight masts (the road runs through it
// between rows of stacks), sheds further back and the city beyond, where the road is elevated.

const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();

const CONTAINER = { l: 12.2, w: 2.44, h: 2.6 }; // a 40 ft box
const ROW = 2.75; // container rows across a yard block (with the gaps between them)
const BAY = 12.8; // container bays along a block
const SHIP_COLORS = ['#3a5274', '#7a2a24', '#2a5442', '#50555d', '#304a6e'];
const BOX_COLORS = ['#1d4f8a', '#b8382c', '#2f6e3b', '#c96d1f', '#7d8288', '#d9d6cc', '#5b3a7a', '#8a2c3d', '#2a6f7a', '#c9a227', '#3d4ea0', '#a33a1c'];

/**
 * Where everything goes, in plain numbers (no meshes), so it can be checked on a plan.
 * The quay runs along the stretch of road marked as a `quay` section (a straight at ground
 * level), `quayOffset` metres out from its centre line toward the stretch marked `water`: beyond
 * it is the bay. The road along the quay passes between the cranes' legs; where it runs through
 * the yard at ground level, stacks line it. opts.landY: the ground's height (the road at ground
 * level sits just above it). Positions use the quay frame: u along the quay, v inland from its
 * edge; containers are given in the world (x, z) with the direction of their length (dx, dz).
 */
export function planHarbour(track, opts = {}, rand = Math.random) {
  const water = track.sections.find((s) => s.type === 'water');
  const quay = track.sections.find((s) => s.type === 'quay');
  if (!water || !quay) return null;
  const { n, px, pz, py } = track;
  const W = track.halfWidth;
  const inSec = (sec, i) => {
    const s = i * track.ds;
    return sec.s0 <= sec.s1 ? s >= sec.s0 && s <= sec.s1 : s >= sec.s0 || s <= sec.s1;
  };
  const mean = (sec) => {
    let x = 0;
    let z = 0;
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (!inSec(sec, i)) continue;
      x += px[i];
      z += pz[i];
      k++;
    }
    return [x / k, z / k];
  };
  // the quay's line: along the quay stretch, out toward the water
  const q0 = Math.round(quay.s0 / track.ds) % n;
  const q1 = Math.round(quay.s1 / track.ds) % n;
  const ql = Math.hypot(px[q1] - px[q0], pz[q1] - pz[q0]) || 1;
  const [mx, mz] = mean(quay);
  const [wx, wz] = mean(water);
  let nx = (pz[q1] - pz[q0]) / ql;
  let nz = -(px[q1] - px[q0]) / ql;
  if ((wx - mx) * nx + (wz - mz) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  // (x seaward, y up, z along the quay: a right-handed frame)
  const tx = -nz;
  const tz = nx;
  const c = mx * nx + mz * nz + (opts.quayOffset ?? 18);
  const toUV = (x, z) => [x * tx + z * tz, c - (x * nx + z * nz)];
  const toXZ = (u, v) => [u * tx + (c - v) * nx, u * tz + (c - v) * nz];
  let uMin = Infinity;
  let uMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const [u] = toUV(px[i], pz[i]);
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
  }
  const span = { u0: uMin - (opts.reach ?? 300), u1: uMax + (opts.reach ?? 300) };
  const landY = opts.landY ?? 0;
  // the road at ground level (a crane's portal, 40 m up, passes over it)
  const low = (i) => py[i] < landY + 6;
  const near = (u, v, r) => {
    const [x, z] = toXZ(u, v);
    return track.nearestDistance(x, z, r + 30);
  };
  const clear = (u, v, r) => near(u, v, r).dist >= r;
  // every point of a quay-frame rectangle at least r from the road's centre line
  const rectClear = (u0, u1, v0, v1, r, step = 8) => {
    for (let u = u0; u <= u1 + 0.01; u += Math.min(step, u1 - u0 || step)) {
      for (let v = v0; v <= v1 + 0.01; v += Math.min(step, v1 - v0 || step)) if (!clear(u, v, r)) return false;
    }
    return true;
  };

  // ---- ship-to-shore cranes along the quay, the boom out over the water
  const cranes = [];
  for (let u = span.u0; u < span.u1; u += 68 + rand() * 16) {
    const up = rand() < 0.35; // an idle crane with its boom raised
    // the legs and their bogies (15 m either side of the rails' middle, 18 m in) clear of every
    // road, past its barriers and lamps...
    let ok = [3, 33].every((v) => [-9, 9].every((du) => clear(u + du, v, 13)));
    // ...and only a road at ground level may pass between them, under the portal and its braces
    for (let du = -10; ok && du <= 10; du += 4) {
      for (let v = 0; ok && v <= 36; v += 4) {
        const r = near(u + du, v, W + 2);
        if (r.dist < W + 2 && !low(r.index)) ok = false;
      }
    }
    if (ok) cranes.push({ u, up, color: rand() < 0.55 ? 0 : 1, trolley: rand() });
  }

  // ---- ships moored alongside: a road on the quay may pass by, none over the water may
  const shipClear = (u0, u1, v0, v1, r) => {
    for (let u = u0; u <= u1; u += 12) {
      for (let v = v0; v <= v1; v += 6) {
        const hit = near(u, v, r);
        if (hit.dist >= r) continue;
        if (toUV(px[hit.index], pz[hit.index])[1] < 0 || hit.dist < W + 6) return false;
      }
    }
    return true;
  };
  const ships = [];
  for (let u = span.u0 + rand() * 120; u < span.u1; ) {
    const len = 210 + rand() * 90;
    const beam = 32 + rand() * 10;
    if (shipClear(u, u + len, -8 - beam - 4, -2, 40)) {
      ships.push({ u: u + len / 2, v: -8 - beam / 2, len, beam, yaw: 0, color: SHIP_COLORS[Math.floor(rand() * SHIP_COLORS.length)], load: 0.45 + rand() * 0.5 });
      u += len + 60 + rand() * 160;
    } else u += 40;
  }
  // ...and a few at anchor out in the bay, swung the same way by the tide, waiting for a berth
  const anchored = [];
  for (let k = 0; k < 20 && anchored.length < 3; k++) {
    const len = 230 + rand() * 90;
    const beam = 36 + rand() * 10;
    const yaw = 0.35 + rand() * 0.15;
    const u = span.u0 + 150 + rand() * (span.u1 - span.u0 - 300);
    const v = -190 - rand() * 380;
    const hu = (Math.abs(Math.cos(yaw)) * len + Math.abs(Math.sin(yaw)) * beam) / 2;
    const hv = (Math.abs(Math.sin(yaw)) * len + Math.abs(Math.cos(yaw)) * beam) / 2;
    if (!rectClear(u - hu, u + hu, v - hv, v + hv, 60, 16)) continue;
    if (anchored.some((s) => Math.hypot(s.u - u, s.v - v) < 360)) continue;
    anchored.push({ u, v, len, beam, yaw, color: SHIP_COLORS[Math.floor(rand() * SHIP_COLORS.length)], load: 0.55 + rand() * 0.4 });
  }
  ships.push(...anchored);
  // channel buoys: red on the quay's side, green on the far side, pairs along the fairway
  const buoys = [];
  for (let u = span.u0 + 60; u < span.u1; u += 240) {
    for (const [v, red] of [[-640, true], [-760, false]]) if (clear(u, v, 40)) buoys.push({ u, v, red });
  }

  // ---- the container yard: blocks of rows parallel to the quay, lanes between them (on low
  // detail, opts.density < 0.8, only the blocks nearest the quay)
  const fullDepth = opts.yardDepth ?? 380;
  const yard = { v0: 62, v1: (opts.density ?? 1) < 0.8 ? 62 + (fullDepth - 62) * 0.5 : fullDepth };
  const rows = 7;
  const blockLen = 20 * BAY;
  const stacks = [];
  const rtgs = [];
  const masts = [];
  // a container, by its centre and the direction of its length, clear of every road's barriers
  const KEEP = W + 3.2;
  const boxClear = (x, z, dx, dz) => {
    for (const [a, b] of [[6.1, 1.22], [6.1, -1.22], [-6.1, 1.22], [-6.1, -1.22], [0, 0]]) {
      if (track.nearestDistance(x + dx * a - dz * b, z + dz * a + dx * b, KEEP + 30).dist < KEEP) return false;
    }
    return true;
  };
  // the road through the yard at ground level, and the rows of stacks along it
  const yardRoad = (i) => {
    if (!low(i)) return false;
    const v = toUV(px[i], pz[i])[1];
    return v > yard.v0 - 10 && v < yard.v1 + 30;
  };
  const LINE = 4; // rows of stacks either side of it
  const lineOff = (k) => W + 1.2 + 2.6 + CONTAINER.w / 2 + k * ROW;
  const lineEdge = lineOff(LINE - 1) + CONTAINER.w / 2 + 0.6;
  // a point among the rows lining the yard road
  const inLine = (x, z) => {
    const r = track.nearestDistance(x, z, 60);
    return r.index >= 0 && r.dist < lineEdge && yardRoad(r.index);
  };
  const step = Math.max(1, Math.round(BAY / track.ds));
  // the last box placed in each row either side, so a row bunching up on the inside of a bend
  // never overlaps itself
  const last = new Map();
  for (let i = 0; i < n; i += step) {
    if (!yardRoad(i)) continue;
    const dl = Math.hypot(track.tx[i], track.tz[i]) || 1;
    const dx = track.tx[i] / dl;
    const dz = track.tz[i] / dl;
    const rl = Math.hypot(track.rx[i], track.rz[i]) || 1;
    for (const side of [-1, 1]) {
      for (let k = 0; k < LINE; k++) {
        const off = side * lineOff(k);
        const x = px[i] + (track.rx[i] / rl) * off;
        const z = pz[i] + (track.rz[i] / rl) * off;
        const v = toUV(x, z)[1];
        if (v < yard.v0 - 8 || v > yard.v1 + 25 || !boxClear(x, z, dx, dz)) continue;
        const prev = last.get(side * 10 + k);
        if (prev && Math.hypot(prev[0] - x, prev[1] - z) < CONTAINER.l + 0.3) continue;
        last.set(side * 10 + k, [x, z]);
        if (rand() < 0.08) continue;
        // tall next to the road: a canyon of boxes
        const h = k === 0 ? 3 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 5);
        stacks.push({ x, z, dx, dz, h, seed: rand(), road: true });
      }
    }
  }
  for (let v = yard.v0; v + rows * ROW <= yard.v1; v += rows * ROW + 24) {
    for (let u = span.u0 + rand() * 40; u + blockLen < span.u1; u += blockLen + 30) {
      let any = false;
      for (let b = 0; b < 20; b++) {
        for (let r = 0; r < rows; r++) {
          const [x, z] = toXZ(u + (b + 0.5) * BAY, v + (r + 0.5) * ROW);
          // gaps where a road runs through: its piers, or the rows lining it at ground level
          const ends = [6.1, -6.1].flatMap((a) => [1.22, -1.22].map((w) => [x + tx * a - tz * w, z + tz * a + tx * w]));
          if (ends.some(([ex, ez]) => inLine(ex, ez)) || !boxClear(x, z, tx, tz)) continue;
          // full stacks in the middle of a block, lower toward its ends
          const edge = Math.min(b, 19 - b);
          const hMax = edge < 1 ? 2 : edge < 3 ? 4 : 5;
          const h = rand() < 0.07 ? 0 : 1 + Math.floor(rand() * hMax);
          if (h) stacks.push({ x, z, dx: tx, dz: tz, h, seed: rand() });
          any = true;
        }
      }
      // a rubber-tyred gantry straddling the block, somewhere along it
      if (any && rand() < 0.6) {
        const gu = u + (2 + rand() * 16) * BAY;
        const legs = [-6, 6].flatMap((du) => [v - 1, v + rows * ROW + 1].map((gv) => toXZ(gu + du, gv)));
        if (rectClear(gu - 8, gu + 8, v - 4, v + rows * ROW + 4, 14) && !legs.some(([x, z]) => inLine(x, z))) rtgs.push({ u: gu, v: v + (rows * ROW) / 2 });
      }
    }
    // floodlight masts in the lane behind the block row
    for (let u = span.u0 + 40; u < span.u1; u += 105) {
      const mv = v + rows * ROW + 12;
      if (mv < yard.v1 && clear(u, mv, 13) && !inLine(...toXZ(u, mv))) masts.push({ u, v: mv });
    }
  }
  // masts along the back of the apron, behind the cranes
  for (let u = span.u0 + 20; u < span.u1; u += 105) if (clear(u, 50, 13) && !inLine(...toXZ(u, 50))) masts.push({ u, v: 50 });

  // ---- sheds and warehouses behind the yard
  const sheds = [];
  for (let v = yard.v1 + 30; v < yard.v1 + 230; v += 70 + rand() * 30) {
    for (let u = span.u0 + rand() * 80; u < span.u1; ) {
      const len = 70 + rand() * 90;
      const dep = 28 + rand() * 22;
      if (rectClear(u, u + len, v, v + dep, 16, 10)) sheds.push({ u: u + len / 2, v: v + dep / 2, len, dep, h: 9 + rand() * 9, seed: rand() });
      u += len + 18 + rand() * 40;
    }
  }

  return { nx, nz, tx, tz, c, toUV, toXZ, uMin: span.u0, uMax: span.u1, yard, rows, cranes, ships, buoys, stacks, rtgs, masts, sheds, cityFrom: fullDepth + 260 };
}

// ---------------------------------------------------------------------------------------
// The port's own lights (masts, cranes, ships, sheds): baked onto what they light, and into a
// light map of the ground and the water around the quay
// ---------------------------------------------------------------------------------------
class PortLights {
  constructor() {
    this.cell = 60;
    this.grid = new Map();
    this.maxR = 0;
    this.glints = []; // the bright ones also shine on the water
  }

  add(x, y, z, color, intensity, radius, glint = 0) {
    const c = new THREE.Color(color);
    const L = { x, y, z, r: c.r * intensity, g: c.g * intensity, b: c.b * intensity, r2: radius * radius };
    const k = this._key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let arr = this.grid.get(k);
    if (!arr) this.grid.set(k, (arr = []));
    arr.push(L);
    this.maxR = Math.max(this.maxR, radius);
    if (glint > 0) this.glints.push({ x, y, z, color: c, power: glint });
  }

  _key(ix, iz) {
    return (ix + 32768) * 65536 + (iz + 32768);
  }

  /** Light reaching (x, y, z), into out[0..2]. */
  at(x, y, z, out) {
    const r = Math.ceil(this.maxR / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let lr = 0;
    let lg = 0;
    let lb = 0;
    for (let ix = cx - r; ix <= cx + r; ix++) {
      for (let iz = cz - r; iz <= cz + r; iz++) {
        const arr = this.grid.get(this._key(ix, iz));
        if (!arr) continue;
        for (const L of arr) {
          const dx = L.x - x;
          const dy = L.y - y;
          const dz = L.z - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= L.r2) continue;
          const f = 1 - d2 / L.r2;
          lr += L.r * f * f;
          lg += L.g * f * f;
          lb += L.b * f * f;
        }
      }
    }
    out[0] = lr;
    out[1] = lg;
    out[2] = lb;
    return out;
  }
}

// Boxes (any position, rotation and size) gathered into one geometry with per-vertex colours.
// Each box is the unit cube mapped through a matrix.
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _col = new THREE.Color();

class Parts {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }

  /** The unit cube through m, in one colour (a hex/string, or a THREE.Color: HDR for glow). */
  box(m, color, skipBottom = false) {
    const col = color.isColor ? color : _col.set(color);
    for (let f = 0; f < 6; f++) {
      if (skipBottom && f === 3) continue;
      const [N, U, V] = FACES[f];
      const pts = CORNERS.map(([a, b], k) => [_a, _b, _c, _d][k].set(N[0] * 0.5 + U[0] * a * 0.5 + V[0] * b * 0.5, N[1] * 0.5 + U[1] * a * 0.5 + V[1] * b * 0.5, N[2] * 0.5 + U[2] * a * 0.5 + V[2] * b * 0.5).applyMatrix4(m));
      _e1.subVectors(pts[1], pts[0]);
      _e2.subVectors(pts[2], pts[0]);
      _e1.cross(_e2).normalize();
      for (const k of [0, 1, 2, 0, 2, 3]) {
        this.pos.push(pts[k].x, pts[k].y, pts[k].z);
        this.nrm.push(_e1.x, _e1.y, _e1.z);
        this.col.push(col.r, col.g, col.b);
      }
    }
  }

  get empty() {
    return this.pos.length === 0;
  }

  /** colorName: 'aColor' for the port material, 'color' for MeshBasicMaterial vertex colours. */
  geometry(lights, colorName = 'aColor') {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute(colorName, new THREE.Float32BufferAttribute(this.col, 3));
    if (lights) {
      const n = this.pos.length / 3;
      const out = new Float32Array(n * 3);
      const tmp = [0, 0, 0];
      // light at each face's centre, nudged off the face, so a box is lit evenly face by face
      for (let v = 0; v < n; v += 6) {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let k = 0; k < 6; k++) {
          x += this.pos[(v + k) * 3];
          y += this.pos[(v + k) * 3 + 1];
          z += this.pos[(v + k) * 3 + 2];
        }
        lights.at(x / 6 + this.nrm[v * 3] * 0.5, y / 6 + this.nrm[v * 3 + 1] * 0.5, z / 6 + this.nrm[v * 3 + 2] * 0.5, tmp);
        for (let k = 0; k < 6; k++) out.set(tmp, (v + k) * 3);
      }
      g.setAttribute('aLight', new THREE.BufferAttribute(out, 3));
    }
    return g;
  }
}

// The cranes' painted steel on high detail: boxes as in Parts, and prisms (wheels, a cable reel),
// but indexed, lit at every corner (a long member catches the light along its length, not just at
// its middle), and with each face's own coordinates for the steel shader. aUV: (u, v) on the face
// in metres and its width and height; the height is negative unless v runs up an upright face,
// with u to the right as seen from outside. aInfo: what the part is (KIND), the crane's number.
const _n = new THREE.Vector3();
class SteelParts {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.uv = [];
    this.info = [];
    this.index = [];
  }

  get empty() {
    return this.pos.length === 0;
  }

  _corner(p, col, u, v, w, h, kind, tag) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(_n.x, _n.y, _n.z);
    this.col.push(col.r, col.g, col.b);
    this.uv.push(u, v, w, h);
    this.info.push(kind, tag);
  }

  /** A quad, its corners counter-clockwise as seen from outside. */
  _quad(pts, col, kind, tag) {
    let ax = _e1.subVectors(pts[1], pts[0]);
    let ay = _e2.subVectors(pts[3], pts[0]);
    _n.crossVectors(ax, ay).normalize();
    // the corners' (u, v) as fractions of the face
    let fu = [0, 1, 1, 0];
    let fv = [0, 0, 1, 1];
    let up = false;
    if (Math.abs(_n.y) < 0.2) {
      const uUp = Math.abs(ax.y) > 0.98 * ax.length();
      if (uUp || Math.abs(ay.y) > 0.98 * ay.length()) {
        if (uUp) {
          [ax, ay] = [ay, ax];
          [fu, fv] = [fv, fu];
        }
        if (ay.y < 0) fv = fv.map((t) => 1 - t);
        // (right, seen from outside: -n x up)
        if (ax.x * _n.z - ax.z * _n.x < 0) fu = fu.map((t) => 1 - t);
        up = true;
      }
    }
    // otherwise u along the longer edge
    if (!up && ay.lengthSq() > ax.lengthSq()) {
      [ax, ay] = [ay, ax];
      [fu, fv] = [fv, fu];
    }
    const w = ax.length();
    const h = ay.length();
    const base = this.pos.length / 3;
    for (let k = 0; k < 4; k++) this._corner(pts[k], col, fu[k] * w, fv[k] * h, w, up ? h : -h, kind, tag);
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** The unit cube through m. */
  box(m, color, kind = 0, tag = 0) {
    const col = color.isColor ? color : _col.set(color);
    for (let f = 0; f < 6; f++) {
      const [N, U, V] = FACES[f];
      const pts = CORNERS.map(([a, b], k) => [_a, _b, _c, _d][k].set(N[0] * 0.5 + U[0] * a * 0.5 + V[0] * b * 0.5, N[1] * 0.5 + U[1] * a * 0.5 + V[1] * b * 0.5, N[2] * 0.5 + U[2] * a * 0.5 + V[2] * b * 0.5).applyMatrix4(m));
      this._quad(pts, col, kind, tag);
    }
  }

  /** An n-sided prism through m: unit diameter across its x and y, unit length along its z (an axle); capKind for its ends. */
  prism(m, sides, color, kind, capKind, tag = 0) {
    const col = color.isColor ? color : new THREE.Color(color);
    const ring = (z) =>
      Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, z).applyMatrix4(m);
      });
    const r0 = ring(-0.5);
    const r1 = ring(0.5);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this._quad([r0[i], r0[j], r1[j], r1[i]], col, kind, tag);
    }
    // the ends, as fans: (u, v) across the square they're drawn in
    const dx = _s.setFromMatrixColumn(m, 0).length();
    const dy = _s.setFromMatrixColumn(m, 1).length();
    for (const [r, back] of [[r1, false], [r0, true]]) {
      _n.set(0, 0, back ? -1 : 1).transformDirection(m);
      const base = this.pos.length / 3;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        this._corner(r[i], col, (0.5 + Math.cos(a) * 0.5) * dx, (0.5 + Math.sin(a) * 0.5) * dy, dx, -dy, capKind, tag);
      }
      for (let i = 1; i < sides - 1; i++) {
        if (back) this.index.push(base, base + i + 1, base + i);
        else this.index.push(base, base + i, base + i + 1);
      }
    }
  }

  geometry(lights) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(this.uv, 4));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 2));
    // the light at each corner, a little off its face
    const n = this.pos.length / 3;
    const out = new Float32Array(n * 3);
    const tmp = [0, 0, 0];
    for (let v = 0; v < n * 3; v += 3) {
      lights.at(this.pos[v] + this.nrm[v] * 0.5, this.pos[v + 1] + this.nrm[v + 1] * 0.5, this.pos[v + 2] + this.nrm[v + 2] * 0.5, tmp);
      out.set(tmp, v);
    }
    g.setAttribute('aLight', new THREE.BufferAttribute(out, 3));
    g.setIndex(this.index);
    return g;
  }
}

/** A frame in the quay's terms: x seaward, y up, z along the quay, origin at (u, v, y). */
function quayFrame(plan, u, v, y, out = new THREE.Matrix4()) {
  const [x, z] = plan.toXZ(u, v);
  return out.set(plan.nx, 0, plan.tx, x, 0, 1, 0, y, plan.nz, 0, plan.tz, z, 0, 0, 0, 1);
}

/** A ship's frame: the quay's, swung by its yaw (ships at anchor lie at an angle). */
function shipFrame(plan, s, seaY) {
  const f = quayFrame(plan, s.u, s.v, seaY);
  return s.yaw ? f.multiply(new THREE.Matrix4().makeRotationY(s.yaw)) : f;
}

const _lm = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
/** A box in a frame: centre (x, y, z), size (sx, sy, sz), turned by `ang` about the frame's z. */
function boxIn(frame, x, y, z, sx, sy, sz, ang = 0) {
  _lm.makeTranslation(x, y, z);
  if (ang) _lm.multiply(_rot.makeRotationZ(ang));
  _lm.scale(_s.set(sx, sy, sz));
  return _m.multiplyMatrices(frame, _lm);
}
/** A beam between two points of a frame's x-y plane (at depth z), thickness t. */
function beamIn(frame, x0, y0, x1, y1, z, t) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  return boxIn(frame, (x0 + x1) / 2, (y0 + y1) / 2, z, len, t, t, Math.atan2(y1 - y0, x1 - x0));
}
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
/** A box between two points of a frame ([x, y, z]), w wide (level, across it) and t thick. */
function segIn(frame, a, b, w, t) {
  _p0.fromArray(a);
  _p1.fromArray(b);
  _bx.subVectors(_p1, _p0);
  const len = _bx.length();
  _bx.divideScalar(len);
  if (Math.abs(_bx.y) > 0.999) _bz.set(1, 0, 0);
  else _bz.set(-_bx.z, 0, _bx.x).normalize();
  _by.crossVectors(_bz, _bx);
  _lm.makeBasis(_bx.multiplyScalar(len), _by.multiplyScalar(t), _bz.multiplyScalar(w));
  _lm.setPosition(_p0.add(_p1).multiplyScalar(0.5));
  return _m.multiplyMatrices(frame, _lm);
}
/** A wheel (SteelParts.prism) in a frame: centre (x, y, z), its axle along the frame's x (or z). */
function wheelIn(frame, x, y, z, diameter, width, alongZ = false) {
  if (alongZ) _lm.set(diameter, 0, 0, x, 0, diameter, 0, y, 0, 0, width, z, 0, 0, 0, 1);
  else _lm.set(0, 0, width, x, diameter, 0, 0, y, 0, diameter, 0, z, 0, 0, 0, 1);
  return _m.multiplyMatrices(frame, _lm);
}

// ---------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------
const FOG = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying float vFogDepth;
  vec3 fogged(vec3 col, float scale) {
    float d = uFogDensity * scale * vFogDepth;
    return mix(col, uFogColor, 1.0 - exp(-d * d));
  }
`;
const HASH = /* glsl */ `
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

/** Painted steel and concrete: per-vertex colour, baked port light, the night's ambient. */
function createPortMaterial(gain = 2.2) {
  return new THREE.ShaderMaterial({
    uniforms: { uAmbient: globalUniforms.uAmbient, uFogColor: globalUniforms.uFogColor, uFogDensity: globalUniforms.uFogDensity, uGain: { value: gain } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute vec3 aLight;
      varying vec3 vCol;
      varying vec3 vLight;
      varying vec3 vN;
      varying float vFogDepth;
      void main() {
        vCol = aColor;
        vLight = aLight;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      uniform float uGain;
      varying vec3 vCol;
      varying vec3 vLight;
      varying vec3 vN;
      ${FOG}
      void main() {
        vec3 n = normalize(vN);
        float up = clamp(n.y, 0.0, 1.0);
        vec3 light = vLight * (0.6 + 0.4 * up) + uAmbient * (0.3 + 0.35 * up) + vec3(0.012, 0.014, 0.02);
        gl_FragColor = vec4(fogged(vCol * light * uGain, 0.8), 1.0);
      }`,
  });
}

// Made-up shipping lines for the containers' livery (no real brands): a mark and a name each,
// drawn white on black into a mask atlas, one row per line.
const LINES = [
  { name: 'VARENO', mark: 'wave' },
  { name: 'KORVANA LINES', mark: 'ring' },
  { name: 'OSTRALIS', mark: 'star' },
  { name: 'TALVEX', mark: 'chevron' },
  { name: 'MIRAKO', mark: 'sun' },
  { name: 'SELVANTA', mark: 'diamond' },
  { name: 'HALVERN', mark: 'anchor' },
  { name: 'QUORVA', mark: 'drop' },
];

let liveryAtlas = null;
function getLiveryAtlas() {
  if (liveryAtlas) return liveryAtlas;
  if (typeof document === 'undefined') {
    // (outside a browser: no canvas, no livery)
    liveryAtlas = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    liveryAtlas.needsUpdate = true;
    return liveryAtlas;
  }
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  LINES.forEach((line, k) => {
    const y0 = k * 128;
    // the mark, in the row's first 128 px
    g.save();
    g.translate(64, y0 + 64);
    g.lineWidth = 11;
    g.lineCap = 'round';
    g.beginPath();
    switch (line.mark) {
      case 'wave':
        for (const dy of [-22, 0, 22]) {
          g.moveTo(-44, dy);
          g.bezierCurveTo(-22, dy - 18, -8, dy + 18, 10, dy);
          g.bezierCurveTo(24, dy - 14, 34, dy + 10, 44, dy);
        }
        g.stroke();
        break;
      case 'ring':
        g.arc(0, 0, 40, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(0, 0, 14, 0, Math.PI * 2);
        g.fill();
        break;
      case 'star':
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 20 : 48;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        break;
      case 'chevron':
        for (const dx of [-20, 14]) {
          g.moveTo(dx - 14, -40);
          g.lineTo(dx + 18, 0);
          g.lineTo(dx - 14, 40);
        }
        g.lineWidth = 16;
        g.stroke();
        break;
      case 'sun':
        g.arc(0, 0, 22, 0, Math.PI * 2);
        g.fill();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          g.moveTo(Math.cos(a) * 32, Math.sin(a) * 32);
          g.lineTo(Math.cos(a) * 48, Math.sin(a) * 48);
        }
        g.stroke();
        break;
      case 'diamond':
        g.moveTo(0, -48);
        g.lineTo(40, 0);
        g.lineTo(0, 48);
        g.lineTo(-40, 0);
        g.closePath();
        g.fill();
        break;
      case 'anchor':
        g.moveTo(0, -30);
        g.lineTo(0, 40);
        g.moveTo(-22, -16);
        g.lineTo(22, -16);
        g.stroke();
        g.beginPath();
        g.arc(0, -40, 10, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(0, 8, 34, 0.25 * Math.PI, 0.75 * Math.PI);
        g.stroke();
        break;
      default:
        // a drop
        g.moveTo(0, -48);
        g.bezierCurveTo(30, -12, 36, 6, 36, 16);
        g.arc(0, 16, 36, 0, Math.PI);
        g.bezierCurveTo(-36, 6, -30, -12, 0, -48);
        g.fill();
    }
    g.restore();
    // the name after it, filling the rest of the row
    let size = 84;
    g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    const w = g.measureText(line.name).width;
    if (w > 860) {
      size = Math.floor((size * 860) / w);
      g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    }
    g.textBaseline = 'middle';
    g.fillText(line.name, 150, y0 + 66);
  });
  liveryAtlas = new THREE.CanvasTexture(c);
  liveryAtlas.anisotropy = 4;
  return liveryAtlas;
}

/**
 * Containers: an instance is a whole stack far from the road (its boxes painted one above
 * another) or a single box beside it. Up close each box gets its steel frame (corner posts,
 * rails, castings), corrugations that catch the light, doors with locking bars and hinges at one
 * end (a refrigeration unit on some), a shipping line's name and mark, rust and grime; all of it
 * fades into the plain paint where a pixel covers more than a few centimetres, and stays off
 * when detail is off (low quality).
 */
function createStackMaterial(detail = true) {
  const N = BOX_COLORS.length;
  return new THREE.ShaderMaterial({
    uniforms: {
      uAmbient: globalUniforms.uAmbient,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uPal: { value: BOX_COLORS.map((c) => new THREE.Color(c)) },
      uAtlas: { value: getLiveryAtlas() },
      uDetail: { value: detail ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aLight;
      attribute vec2 aBox; // seed, boxes stacked in this instance
      varying vec3 vLocal;
      varying vec3 vScale;
      varying vec3 vN;
      varying vec3 vLight;
      varying vec2 vBox;
      varying vec3 vView;
      varying float vFogDepth;
      void main() {
        mat4 im = instanceMatrix;
        vScale = vec3(length(im[0].xyz), length(im[1].xyz), length(im[2].xyz));
        vLocal = position * vScale;
        vN = normal;
        vLight = aLight;
        vBox = aBox;
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        // the view ray in the box's own frame, for the paint's sheen
        mat3 R = mat3(im[0].xyz / vScale.x, im[1].xyz / vScale.y, im[2].xyz / vScale.z);
        vView = transpose(R) * (wp.xyz - cameraPosition);
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      uniform vec3 uPal[${N}];
      uniform sampler2D uAtlas;
      uniform float uDetail;
      varying vec3 vLocal;
      varying vec3 vScale;
      varying vec3 vN;
      varying vec3 vLight;
      varying vec2 vBox;
      varying vec3 vView;
      ${HASH}
      ${FOG}
      float band(float x, float a, float b, float e) { return smoothstep(a - e, a + e, x) * (1.0 - smoothstep(b - e, b + e, x)); }
      // inside a rectangle (centre c, half size h) with a soft edge
      float rect(vec2 p, vec2 c, vec2 h, float aa) { vec2 d = abs(p - c) - h; return 1.0 - smoothstep(-aa, aa, max(d.x, d.y)); }
      // trapezoidal corrugation: the flank's slope (-1..1) and how deep in its trough
      vec2 corrugate(float x, float pitch, float aa) {
        float t = fract(x / pitch);
        float e = aa / pitch + 0.01;
        return vec2(band(t, 0.85, 1.0, e) - band(t, 0.35, 0.5, e), band(t, 0.5, 0.85, e));
      }
      void main() {
        vec3 n = normalize(vN);
        float L = vScale.x;
        float Wd = vScale.z;
        float levels = vBox.y;
        float levelH = vScale.y / levels;
        float li = clamp(floor(vLocal.y / levelH), 0.0, levels - 1.0);
        float ly = vLocal.y - li * levelH;
        // this box: its line's colour (or a reefer's white), its wear
        float cs = h21(vec2(vBox.x * 97.3, li + 1.7));
        bool reefer = h21(vec2(cs * 41.0, 2.9)) < 0.07;
        vec3 base = reefer ? vec3(0.8, 0.81, 0.78) : uPal[int(min(cs * ${N}.0, ${N - 1}.0))];
        base = mix(base, vec3(dot(base, vec3(0.3, 0.5, 0.2))), 0.3) * (0.8 + 0.35 * h21(vec2(li, vBox.x * 13.1)));
        float wear = h21(vec2(cs * 7.7, 2.3)) * uDetail;
        // fine detail only where a pixel covers a few centimetres
        vec3 dlx = dFdx(vLocal);
        vec3 dly = dFdy(vLocal);
        vec3 fw = abs(dlx) + abs(dly);
        float mpp = max(fw.x, max(fw.y, fw.z));
        float near = (1.0 - smoothstep(0.04, 0.16, mpp)) * uDetail;
        float aa = mpp * 0.75 + 0.002;
        vec3 alb = base;
        float frame = 0.0; // the steel frame's members
        float steel = 0.0; // bars, hinges, castings: dark bare steel
        vec2 rib = vec2(0.0); // the corrugation: flank slope, trough
        vec3 tang = vec3(1.0, 0.0, 0.0); // which way the ribs' flanks turn
        float hx = L * 0.5 - abs(vLocal.x); // to the nearer end
        float led = 0.0;
        if (abs(n.z) > 0.5) {
          // ---------------- a long side
          float post = 1.0 - smoothstep(0.14 - aa, 0.14 + aa, hx);
          float top = smoothstep(levelH - 0.13 - aa, levelH - 0.13 + aa, ly);
          float bot = 1.0 - smoothstep(0.16 - aa, 0.16 + aa, ly);
          frame = max(post, max(top, bot));
          rib = reefer ? corrugate(ly, 0.12, aa) * 0.4 : corrugate(vLocal.x, 0.278, aa);
          if (reefer) tang = vec3(0.0, 1.0, 0.0);
          steel = step(hx, 0.18) * max(step(ly, 0.12), step(levelH - 0.12, ly));
          // a line's name and mark along the upper half (on most boxes)
          if (uDetail > 0.5 && !reefer && h21(vec2(cs * 5.3, 7.1)) > 0.35) {
            float row = floor(h21(vec2(cs * 3.1, 1.3)) * 8.0);
            float bw = L * 0.72;
            vec2 bp = vec2((vLocal.x * sign(n.z) + bw * 0.5) / bw, (ly - levelH * 0.5) / (bw / 8.0));
            if (bp.x > 0.0 && bp.x < 1.0 && bp.y > 0.0 && bp.y < 1.0) {
              // (the gradients come from outside the branch: taken inside it, they're garbage
              // along the band's edges and pick the wrong mip there)
              vec2 sx = vec2(sign(n.z), 1.0) / bw;
              float m = textureGrad(uAtlas, vec2(bp.x, 1.0 - (row + 1.0 - bp.y) / 8.0), dlx.xy * sx, dly.xy * sx).r;
              float lum = dot(base, vec3(0.3, 0.5, 0.2));
              vec3 ink = lum > 0.42 ? vec3(0.06, 0.1, 0.22) : vec3(0.9, 0.9, 0.86);
              vec3 mark = uPal[int(mod(row * 5.0 + 2.0, ${N}.0))];
              if (bp.x < 0.125) ink = lum > 0.42 ? mark * 0.7 : mix(mark, vec3(1.0), 0.45);
              alb = mix(alb, ink, m * 0.92);
            }
          }
          // rust run down from the top rail, grime toward the bottom
          float streak = smoothstep(0.58, 0.86, vnoise(vec2(vLocal.x * 2.4 + cs * 40.0, 0.5))) * exp(-(levelH - 0.13 - ly) * 1.3);
          alb = mix(alb, vec3(0.3, 0.15, 0.07), streak * wear * 0.8);
          alb *= 1.0 - 0.35 * wear * (1.0 - smoothstep(0.16, 0.8, ly));
        } else if (abs(n.x) > 0.5) {
          // ---------------- an end: the doors, the front wall or a reefer's machinery
          float e = -vLocal.z * sign(n.x); // across, left to right as seen from outside
          float ex = Wd * 0.5 - abs(e);
          bool doors = (n.x > 0.0) == (h21(vec2(cs, 3.3)) > 0.5);
          float headH = doors ? 0.26 : 0.13;
          float post = 1.0 - smoothstep(0.12 - aa, 0.12 + aa, ex);
          float head = smoothstep(levelH - headH - aa, levelH - headH + aa, ly);
          float sill = 1.0 - smoothstep(0.18 - aa, 0.18 + aa, ly);
          frame = max(post, max(head, sill));
          tang = vec3(0.0, 0.0, 1.0);
          steel = step(ex, 0.16) * max(step(ly, 0.12), step(levelH - 0.12, ly));
          if (doors) {
            rib = corrugate(e, 0.3, aa) * 0.6;
            float inDoor = step(0.18, ly) * step(ly, levelH - 0.26);
            float ae = abs(e);
            // the gap between the doors, four locking bars, their levers at hand height
            float gap = 1.0 - smoothstep(0.006, 0.006 + aa * 2.0, ae);
            float bars = (1.0 - smoothstep(0.022, 0.022 + aa, min(abs(ae - 0.3), abs(ae - 0.88)))) * inDoor;
            float lever = (1.0 - smoothstep(0.022, 0.022 + aa, abs(ly - 1.25))) * (band(ae, 0.06, 0.3, aa) + band(ae, 0.64, 0.88, aa));
            // hinges down the outer edges, four a side
            float hy = abs(fract((ly - 0.3) / 0.62 + 0.5) - 0.5) * 0.62;
            float hinge = (1.0 - smoothstep(0.05, 0.05 + aa, hy)) * band(ex, 0.12, 0.27, aa) * inDoor;
            steel = max(steel, max(bars, max(lever, hinge)) * near);
            // the data plate, the box's number
            alb = mix(alb, vec3(0.72, 0.7, 0.6), rect(vec2(e, ly), vec2(-0.75, 0.55), vec2(0.13, 0.08), aa) * near);
            float digits = step(0.45, h21(floor(vec2(e * 20.0, ly * 10.0)) + cs * 9.0));
            alb = mix(alb, vec3(0.88), digits * rect(vec2(e, ly), vec2(0.6, levelH - 0.55), vec2(0.32, 0.1), aa) * near);
            alb *= 1.0 - 0.6 * gap * near;
          } else if (reefer) {
            // the refrigeration unit: a dark grille with louvres, its control panel, a running light
            float unit = rect(vec2(e, ly), vec2(0.0, levelH * 0.45), vec2(Wd * 0.5 - 0.22, levelH * 0.33), aa);
            float louvre = 0.7 + 0.3 * step(0.5, fract(ly / 0.07));
            alb = mix(alb, vec3(0.1, 0.11, 0.12) * mix(1.0, louvre, near), unit);
            alb = mix(alb, vec3(0.2, 0.22, 0.25), rect(vec2(e, ly), vec2(0.62, levelH * 0.82), vec2(0.18, 0.11), aa));
            led = rect(vec2(e, ly), vec2(0.5, levelH * 0.82), vec2(0.025, 0.025), aa) * step(0.4, h21(vec2(cs, 8.8))) * near;
          } else {
            rib = corrugate(e, 0.278, aa);
          }
          alb *= 1.0 - 0.3 * wear * (1.0 - smoothstep(0.18, 0.9, ly));
        } else if (n.y > 0.5) {
          // ---------------- the roof (the top box's): rails along its edges, shallow ribs across
          float ez = Wd * 0.5 - abs(vLocal.z);
          frame = max(1.0 - smoothstep(0.1 - aa, 0.1 + aa, ez), 1.0 - smoothstep(0.14 - aa, 0.14 + aa, hx));
          rib = corrugate(vLocal.x, 0.25, aa) * 0.5;
          steel = step(hx, 0.18) * step(ez, 0.16);
          float stain = smoothstep(0.55, 0.85, vnoise(vLocal.xz * 0.9 + cs * 17.0));
          alb = mix(alb, vec3(0.28, 0.15, 0.08), stain * wear * 0.6);
        }
        // the seam under each box: the gap to the box below, or its shadow on the ground
        alb *= 1.0 - (1.0 - smoothstep(0.0, 0.03 + aa, ly)) * 0.7;
        // the frame stands proud of the panels and is a shade darker; bare steel is darker still
        alb *= 1.0 - 0.22 * frame;
        alb = mix(alb, vec3(0.08, 0.08, 0.09), steel * (0.35 + 0.65 * near));
        // the troughs a little in shadow, the flanks turned to and from the light
        rib *= near * (1.0 - frame);
        alb *= 1.0 - 0.08 * rib.y;
        vec3 np = normalize(n + tang * rib.x * 0.7);
        vec3 key = normalize(vec3(0.45, 0.8, 0.4));
        float relief = 1.0 + (dot(np, key) - dot(n, key)) * 0.9;
        float sheen = pow(max(dot(reflect(normalize(vView), np), key), 0.0), 10.0) * near;
        float up = clamp(n.y, 0.0, 1.0);
        vec3 light = vLight * (0.5 + 0.5 * up) + uAmbient * (0.32 + 0.3 * up) + vec3(0.01, 0.012, 0.016);
        vec3 col = alb * light * 1.7 * relief + light * sheen * 0.3 + vec3(0.2, 1.0, 0.35) * led * 1.2;
        gl_FragColor = vec4(fogged(col, 0.8), 1.0);
      }`,
  });
}

// What each part of a crane is, for the steel shader (which tells them apart by these numbers)
const KIND = { PAINT: 0, LEG: 1, PORTAL: 2, HOUSE: 3, BOGIE: 4, WHEELS: 5, GRATE: 6, RAIL: 7, CAB: 8, TYRE: 9, HUB: 10 };

// The port's name, on the cranes' machinery houses (made up, like the shipping lines)
const PORT_NAME = 'VELMARA';
let craneText = null;
/** The digits for the cranes' numbers (the top row) and the port's name (the bottom row), white on black. */
function getCraneText() {
  if (craneText) return craneText;
  if (typeof document === 'undefined') {
    craneText = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    craneText.needsUpdate = true;
    return craneText;
  }
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const font = (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.font = font(116);
  for (let d = 0; d < 10; d++) g.fillText(String(d), (d + 0.5) * 102.4, 68);
  g.font = font(108);
  const w = g.measureText(PORT_NAME).width;
  if (w > 940) g.font = font(Math.floor((108 * 940) / w));
  g.fillText(PORT_NAME, 512, 128 + 68);
  craneText = new THREE.CanvasTexture(c);
  craneText.anisotropy = 4;
  return craneText;
}

/**
 * The cranes' painted steel on high detail: per-vertex paint and port light as the port material,
 * and what makes a girder read as one up close: faded, patchy paint, worn edges, the joints between
 * its plates with a bolted splice over each, rust run down from them, grime; hazard stripes at the
 * legs' feet and on the bogies, their wheels, tyres; treads on the stairs; the crane's number on
 * its portal and the port's name on the machinery house. The fine detail fades out where a pixel
 * covers more than a few centimetres.
 */
function createSteelMaterial(gain = 1.25) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAmbient: globalUniforms.uAmbient,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uGain: { value: gain },
      uText: { value: getCraneText() },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute vec3 aLight;
      attribute vec4 aUV;
      attribute vec2 aInfo;
      varying vec3 vCol;
      varying vec3 vLight;
      varying vec3 vN;
      varying vec3 vWorld;
      varying vec4 vUV;
      varying vec2 vInfo;
      varying float vFogDepth;
      void main() {
        vCol = aColor;
        vLight = aLight;
        vUV = aUV;
        vInfo = aInfo;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      uniform float uGain;
      uniform sampler2D uText;
      varying vec3 vCol;
      varying vec3 vLight;
      varying vec3 vN;
      varying vec3 vWorld;
      varying vec4 vUV;
      varying vec2 vInfo;
      ${HASH}
      ${FOG}
      float band(float x, float a, float b, float e) { return smoothstep(a - e, a + e, x) * (1.0 - smoothstep(b - e, b + e, x)); }
      float disc(vec2 p, float r, float aa) { return 1.0 - smoothstep(r - aa, r + aa, length(p)); }
      // yellow and black on the diagonal, a little dirty
      vec3 hazard(vec2 p, float aa) {
        float t = abs(fract((p.x + p.y) / 0.8) - 0.5) * 2.0;
        return mix(vec3(0.025), vec3(0.72, 0.5, 0.04), smoothstep(0.5 - aa * 2.5, 0.5 + aa * 2.5, t)) * (0.65 + 0.35 * vnoise(p * 1.7));
      }
      // painted steel: faded, patchy paint, worn edges, the joints between the plates along the
      // member with a bolted splice plate over each, rust run down from them, grime
      vec3 painted(vec3 alb, vec2 p, vec2 sz, bool up, vec3 n, float aa, float fine, float mid, float seed) {
        bool lu = sz.x >= sz.y;
        float al = lu ? p.x : p.y;
        float ac = lu ? p.y : p.x;
        float La = max(sz.x, sz.y);
        alb *= 0.9 + 0.2 * vnoise(p * 0.21 + seed * 41.0);
        float edge = min(min(p.x, sz.x - p.x), min(p.y, sz.y - p.y));
        alb *= 1.0 + 0.18 * (1.0 - smoothstep(0.0, 0.035 + aa, edge)) * mid;
        // how far below the top of the face (or, up a leg, the joint above)
        float below = sz.y - p.y;
        if (La > 7.0) {
          float nSeg = floor(La / 6.0 + 0.5);
          float seg = La / nSeg;
          float j = al / seg;
          float sd = abs(fract(j + 0.5) - 0.5) * seg;
          float inside = step(0.5, j) * step(j, nSeg - 0.5);
          float plate = (1.0 - smoothstep(0.3 - aa, 0.3 + aa, sd)) * inside;
          alb *= 1.0 + (0.08 * plate - 0.3 * band(sd, 0.29, 0.33, aa) * inside) * mid;
          vec2 bq = vec2(min(abs(sd - 0.1), abs(sd - 0.21)), (fract(ac / 0.18) - 0.5) * 0.18);
          alb *= 1.0 - 0.45 * disc(bq, 0.024, aa) * plate * fine;
          if (up && !lu) below = min(below, seg - mod(p.y, seg));
        }
        if (up) {
          // (rust browns and darkens whatever the paint: mixed toward a rust colour, blue paint
          // would turn purple)
          float run = smoothstep(0.58, 0.88, vnoise(vec2(p.x * 2.6 + seed * 23.0, seed * 7.0))) * exp(-below * 0.55);
          alb = alb * mix(vec3(1.0), vec3(0.8, 0.55, 0.32), run) + vec3(0.03, 0.012, 0.004) * run;
          alb *= 0.86 + 0.14 * vnoise(vec2(p.x * 0.7 + seed * 5.0, p.y * 0.045));
        } else if (n.y > 0.5) {
          alb *= mix(vec3(1.0), vec3(0.7, 0.5, 0.32), smoothstep(0.62, 0.9, vnoise(p * 0.9 + seed * 11.0)));
        } else if (n.y < -0.5) {
          alb *= 0.85;
        }
        return alb;
      }
      void main() {
        vec3 n = normalize(vN);
        // (KIND: 0 paint, 1 leg, 2 portal, 3 house, 4 bogie, 5 wheels, 6 grate, 7 rail, 8 cab, 9 tyre, 10 hub)
        float kind = floor(vInfo.x + 0.5);
        float tag = floor(vInfo.y + 0.5);
        vec2 p = vUV.xy;
        vec2 sz = abs(vUV.zw);
        bool up = vUV.w > 0.0;
        // (the derivatives out here, outside any branch: the lettering is sampled with them)
        vec2 dpx = dFdx(p);
        vec2 dpy = dFdy(p);
        vec2 fw = abs(dpx) + abs(dpy);
        float mpp = max(fw.x, fw.y);
        float aa = mpp * 0.75 + 0.002;
        float fine = 1.0 - smoothstep(0.015, 0.06, mpp);
        float mid = 1.0 - smoothstep(0.05, 0.22, mpp);
        // the face's own (the plane it lies in tells it from the others)
        float seed = h21(vec2(tag + kind * 0.37, fract(dot(vWorld, n) * 0.137) * 61.0));
        vec3 alb = vCol;
        float gloss = 0.22;
        if (kind > 6.5) {
          if (kind > 9.5) {
            // a tyre's side: the rubber, the wheel's rim, its hub and nuts
            vec2 c = p - sz * 0.5;
            float R = sz.x * 0.5;
            float r = length(c);
            alb = mix(alb, vec3(0.5, 0.51, 0.52), 1.0 - smoothstep(R * 0.56 - aa, R * 0.56 + aa, r));
            alb = mix(alb, vec3(0.1), band(r, R * 0.42, R * 0.46, aa) * mid);
            alb = mix(alb, vec3(0.16), 1.0 - smoothstep(R * 0.2 - aa, R * 0.2 + aa, r));
            float ang = atan(c.y, c.x);
            vec2 nut = vec2(r - R * 0.31, (fract(ang / 6.2832 * 8.0) - 0.5) * 0.7854 * r);
            alb = mix(alb, vec3(0.06), disc(nut, 0.035, aa) * fine);
          } else if (kind > 8.5) {
            // a tyre's tread
            alb *= 0.8 + 0.4 * vnoise(p * 4.0 + seed * 9.0);
            gloss = 0.08;
          } else if (kind > 7.5) {
            // the cab: a dark skirt round its foot
            if (up) alb *= 1.0 - 0.55 * (1.0 - smoothstep(0.28 - aa, 0.3 + aa, p.y));
          }
          // (handrails: plain)
        } else if (kind > 5.5) {
          // stairs and landings: galvanised grating, treads across a flight
          alb *= 0.9 + 0.2 * vnoise(p * 0.8 + seed * 3.0);
          if (n.y > 0.3) {
            bool lu = sz.x >= sz.y;
            alb *= 1.0 - 0.4 * band(fract((lu ? p.x : p.y) / 0.3), 0.0, 0.2, aa / 0.3) * fine;
            alb *= 1.0 - 0.2 * band(fract((lu ? p.y : p.x) / 0.05), 0.0, 0.3, aa / 0.05) * fine;
          }
          gloss = 0.1;
        } else if (kind > 3.5) {
          // a bogie: dark steel, its ends striped; along a little bogie's sides, its wheels
          alb *= 0.9 + 0.2 * vnoise(p * 0.5 + seed * 9.0);
          if (up) {
            if (sz.x < 3.0) alb = hazard(p, aa);
            else if (kind > 4.5) {
              float pitch = sz.x / max(1.0, floor(sz.x / 1.4));
              float R = min(0.46, min(pitch * 0.4, sz.y * 0.3));
              float r = length(vec2((fract(p.x / pitch) - 0.5) * pitch, p.y - R * 1.05));
              alb = mix(alb, vec3(0.02), 1.0 - smoothstep(R - aa, R + aa, r));
              alb = mix(alb, vec3(0.32), band(r, R * 0.62, R * 0.76, aa) * mid);
              alb = mix(alb, vec3(0.22), 1.0 - smoothstep(R * 0.18 - aa, R * 0.18 + aa, r));
            }
          }
        } else if (kind > 2.5) {
          // the machinery house: ribbed cladding in panels, louvres, a door, the port's name
          alb *= 0.92 + 0.16 * vnoise(p * 0.3 + seed * 13.0);
          if (up) {
            alb *= 1.0 - 0.14 * band(fract(p.x / 0.3), 0.0, 0.2, aa / 0.3) * fine;
            alb *= 1.0 - 0.3 * (1.0 - smoothstep(0.01, 0.01 + aa, abs(fract(p.y / 2.0 + 0.5) - 0.5) * 2.0)) * mid;
            float louvre = step(abs(p.x - 1.7), 1.1) * step(abs(p.y - 1.5), 0.65);
            alb *= 1.0 - louvre * (0.35 + 0.3 * step(0.5, fract(p.y / 0.12))) * mid;
            alb *= 1.0 - 0.45 * step(abs(p.x - (sz.x - 1.8)), 0.5) * step(p.y, 2.2) * mid;
            if (sz.x > 8.0) {
              float nw = sz.x * 0.84;
              float nh = nw / 8.0;
              vec2 q = (p - vec2((sz.x - nw) * 0.5, sz.y * 0.6 - nh * 0.5)) / vec2(nw, nh);
              if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
                vec2 gs = vec2(1.0 / nw, 0.5 / nh);
                float m = textureGrad(uText, vec2(q.x, q.y * 0.5), dpx * gs, dpy * gs).r;
                alb = mix(alb, vec3(0.86, 0.87, 0.85), m * 0.92);
              }
            }
          }
        } else {
          // painted members: a leg's foot striped, the portal beam carrying the crane's number
          alb = painted(alb, p, sz, up, n, aa, fine, mid, seed);
          if (kind > 0.5 && kind < 1.5 && up) alb = mix(alb, hazard(p, aa), 1.0 - smoothstep(2.4 - aa, 2.4 + aa, p.y));
          if (kind > 1.5 && up && sz.x > sz.y * 4.0) {
            float dh = sz.y * 0.95;
            float dw = dh * 0.8;
            vec2 q = (p - vec2(sz.x * 0.5 - dw, (sz.y - dh) * 0.5)) / vec2(dw, dh);
            if (q.x > 0.0 && q.x < 2.0 && q.y > 0.0 && q.y < 1.0) {
              float d = q.x < 1.0 ? floor(tag / 10.0) : mod(tag, 10.0);
              vec2 gs = vec2(0.1 / dw, 0.5 / dh);
              float m = textureGrad(uText, vec2((d + fract(q.x)) * 0.1, 0.5 + q.y * 0.5), dpx * gs, dpy * gs).r;
              alb = mix(alb, vec3(0.86, 0.87, 0.85), m * 0.92);
            }
          }
        }
        float upn = clamp(n.y, 0.0, 1.0);
        vec3 light = vLight * (0.6 + 0.4 * upn) + uAmbient * (0.3 + 0.35 * upn) + vec3(0.012, 0.014, 0.02);
        // a little gloss: the paint catching the light from above
        vec3 V = normalize(cameraPosition - vWorld);
        float spec = pow(max(dot(reflect(-V, n), normalize(vec3(0.25, 0.9, 0.35))), 0.0), 14.0) * gloss;
        gl_FragColor = vec4(fogged((alb + spec) * light * uGain, 0.8), 1.0);
      }`,
  });
}

/**
 * The land: concrete apron at the quay (crane rails, the yellow edge line), the container yard
 * (slot markings, lane lines), pools under the floodlight masts from a baked light map, then the
 * lit street grid of the city inland.
 */
function createLandMaterial(plan, palette, lightMap, rect) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAmbient: globalUniforms.uAmbient,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uFrame: { value: new THREE.Vector4(plan.tx, plan.tz, plan.nx, plan.nz) },
      uC: { value: plan.c },
      uPort: { value: new THREE.Vector4(plan.uMin, plan.uMax, plan.yard.v1, plan.cityFrom) },
      uYard: { value: new THREE.Vector3(plan.yard.v0, plan.rows * ROW, plan.rows * ROW + 24) },
      uLightMap: { value: lightMap },
      uRect: { value: rect },
      uBase: { value: new THREE.Color(palette.ground ?? '#06060a') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vFogDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      uniform vec4 uFrame;
      uniform float uC;
      uniform vec4 uPort;
      uniform vec3 uYard;
      uniform sampler2D uLightMap;
      uniform vec4 uRect;
      uniform vec3 uBase;
      varying vec3 vWorld;
      ${HASH}
      ${FOG}
      float line(float x, float w) {
        float aa = fwidth(x) * 1.2;
        return 1.0 - smoothstep(w, w + aa, abs(x));
      }
      vec3 carpet(vec2 p) {
        vec2 g = p / 34.0;
        vec2 cell = floor(g);
        vec2 f = fract(g);
        float street = 1.0 - smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        float dots = step(0.5, fract((p.x + p.y) * 0.2)) * street;
        // (the lit streets only: the road comes down to this ground, too close for the far-off
        // view's scattered lit windows)
        vec3 col = uBase + uAmbient * 0.04;
        col += mix(vec3(1.0, 0.62, 0.28), vec3(0.9, 0.95, 1.0), step(0.85, h21(cell))) * dots * 0.9;
        return col;
      }
      void main() {
        vec2 p = vWorld.xz;
        float u = dot(p, uFrame.xy);
        float v = uC - dot(p, uFrame.zw);
        // how much of the port is here (fading out past its ends and into the city)
        float port = smoothstep(uPort.x - 150.0, uPort.x, u) * (1.0 - smoothstep(uPort.y, uPort.y + 150.0, u)) * (1.0 - smoothstep(uPort.w - 160.0, uPort.w, v));
        float n = vnoise(p * 0.08) * 0.6 + vnoise(p * 0.9) * 0.4;
        vec3 alb = mix(vec3(0.07, 0.072, 0.075), vec3(0.11, 0.11, 0.105), step(v, uYard.x - 8.0)) * (0.8 + 0.4 * n);
        // markings: the quay's yellow edge, the crane rails, lanes and container slots in the yard
        vec3 paint = vec3(0.0);
        paint += vec3(0.9, 0.7, 0.1) * line(v - 0.9, 0.18);
        paint += vec3(0.5) * (line(v - 3.0, 0.07) + line(v - 33.0, 0.07));
        float band = mod(v - uYard.x, uYard.z);
        float inBlock = step(0.0, v - uYard.x) * step(band, uYard.y) * step(v, uPort.z);
        paint += vec3(0.55) * inBlock * (line(mod(u, ${BAY.toFixed(1)}) - 0.5, 0.06) + line(mod(band, ${ROW.toFixed(2)}) - 0.1, 0.05));
        float lane = step(uYard.y, band) * step(0.0, v - uYard.x) * step(v, uPort.z);
        paint += vec3(0.9, 0.75, 0.2) * lane * line(band - uYard.y - 12.0, 0.09) * step(0.5, fract(u / 6.0));
        alb += paint * 0.35;
        vec2 lmUv = vec2((u - uRect.x) * uRect.z, (v - uRect.y) * uRect.w);
        vec3 lm = texture2D(uLightMap, lmUv).rgb * 4.0;
        lm *= step(0.0, lmUv.x) * step(lmUv.x, 1.0) * step(0.0, lmUv.y) * step(lmUv.y, 1.0);
        vec3 portCol = alb * (lm * 1.1 + uAmbient * 0.5 + vec3(0.02, 0.022, 0.028));
        vec3 col = mix(carpet(p), portCol, port);
        gl_FragColor = vec4(fogged(col, 1.0), 1.0);
      }`,
  });
}

/** Night water: ripples, the sky glow and the city's light pollution in it, the port's glow near the quay. */
function createWaterMaterial(plan, palette, lightMap, rect) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalUniforms.uTime,
      uAmbient: globalUniforms.uAmbient,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uSkyGlow: globalUniforms.uSkyGlow,
      uSkyTop: { value: new THREE.Color(palette.skyTop ?? '#010205') },
      uHorizon: { value: new THREE.Color(palette.skyHorizon ?? '#0a1322') },
      uFrame: { value: new THREE.Vector4(plan.tx, plan.tz, plan.nx, plan.nz) },
      uC: { value: plan.c },
      uLightMap: { value: lightMap },
      uRect: { value: rect },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vFogDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uAmbient;
      uniform vec3 uSkyGlow;
      uniform vec3 uSkyTop;
      uniform vec3 uHorizon;
      uniform vec4 uFrame;
      uniform float uC;
      uniform sampler2D uLightMap;
      uniform vec4 uRect;
      varying vec3 vWorld;
      ${HASH}
      ${FOG}
      void main() {
        vec2 p = vWorld.xz;
        // two layers of ripples drifting different ways
        vec2 q1 = p * 0.11 + vec2(uTime * 0.05, uTime * 0.03);
        vec2 q2 = p * 0.31 - vec2(uTime * 0.07, -uTime * 0.04);
        float e = 0.5;
        vec2 grad = vec2(vnoise(q1 + vec2(e, 0.0)) - vnoise(q1 - vec2(e, 0.0)), vnoise(q1 + vec2(0.0, e)) - vnoise(q1 - vec2(0.0, e)));
        grad += 0.6 * vec2(vnoise(q2 + vec2(e, 0.0)) - vnoise(q2 - vec2(e, 0.0)), vnoise(q2 + vec2(0.0, e)) - vnoise(q2 - vec2(0.0, e)));
        vec3 nrm = normalize(vec3(-grad.x * 0.22, 1.0, -grad.y * 0.22));
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 R = reflect(V, nrm);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, nrm), 0.0), 5.0);
        // the sky it mirrors: dark overhead, the city's glow along the horizon
        float h = clamp(R.y, 0.0, 1.0);
        vec3 sky = mix(uHorizon * 2.6 + uSkyGlow * 0.9, uSkyTop, smoothstep(0.0, 0.3, h));
        vec3 deep = vec3(0.006, 0.01, 0.016) + uAmbient * 0.03;
        vec3 col = mix(deep, sky, fres);
        // the port's lights over the water near the quay
        float u = dot(p, uFrame.xy);
        float v = uC - dot(p, uFrame.zw);
        vec2 lmUv = vec2((u - uRect.x) * uRect.z, (v - uRect.y) * uRect.w);
        vec3 lm = texture2D(uLightMap, lmUv).rgb * 4.0;
        lm *= step(0.0, lmUv.x) * step(lmUv.x, 1.0) * step(0.0, lmUv.y) * step(lmUv.y, 1.0);
        col += lm * 0.05 * (0.6 + 0.8 * vnoise(q2 * 2.0));
        gl_FragColor = vec4(fogged(col, 0.9), 1.0);
      }`,
  });
}

/**
 * Light on the water: a shimmering streak under each bright light, stretched toward the camera
 * the way ripples smear a reflection (instanced quads on the surface, additive).
 */
export function createGlintMaterial() {
  return additive(
    new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime, uFogColor: globalUniforms.uFogColor, uFogDensity: globalUniforms.uFogDensity },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aFoot; // x, water height, z, height of the light above the water
        attribute vec4 aGlint; // colour, power
        varying vec2 vUv;
        varying vec4 vGlint;
        varying float vFogDepth;
        varying float vSeed;
        void main() {
          vec2 toCam = cameraPosition.xz - aFoot.xz;
          float D = max(length(toCam), 1.0);
          vec2 dir = toCam / D;
          vec2 side = vec2(-dir.y, dir.x);
          float h = aFoot.w;
          float H = max(cameraPosition.y - aFoot.y, 1.0);
          // the light's mirror point on still water, smeared along the line of sight by the ripples
          float r0 = D * h / (h + H);
          float len = clamp(D * 0.22, 4.0, 110.0);
          float a0 = max(r0 - len * 0.45, 0.0);
          float a1 = min(r0 + len * 0.55, D - 3.0);
          float along = mix(a0, a1, position.y);
          float width = 0.5 + h * 0.012 + D * 0.002;
          vec2 xz = aFoot.xz + dir * along + side * position.x * width;
          vUv = vec2(position.x, position.y);
          vGlint = aGlint;
          vSeed = aFoot.x * 0.13 + aFoot.z * 0.07;
          vec4 mv = viewMatrix * vec4(xz.x, aFoot.y + 0.08, xz.y, 1.0);
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying vec4 vGlint;
        varying float vSeed;
        ${HASH}
        ${FOG}
        void main() {
          float across = exp(-vUv.x * vUv.x * 7.0);
          float along = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
          // broken into flickering glints by the waves
          float bands = vnoise(vec2(vUv.y * 34.0 - uTime * 1.6, vSeed)) * vnoise(vec2(vUv.y * 11.0 + uTime * 0.7, vSeed + 3.0));
          float sparkle = smoothstep(0.35, 0.75, vnoise(vec2(vUv.y * 60.0 + vUv.x * 4.0, vSeed + uTime * 2.3)));
          float a = across * along * (0.08 + 0.9 * bands + 0.6 * sparkle * bands);
          vec3 col = vGlint.rgb * vGlint.a * a;
          float d = uFogDensity * 0.7 * vFogDepth;
          gl_FragColor = vec4(col * exp(-d * d), 1.0);
        }`,
    }),
  );
}

// ---------------------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------------------
const CRANE_PAINT = [
  { frame: '#a8352c', boom: '#a7abb0' },
  { frame: '#2d62a3', boom: '#a7abb0' },
];
const STEEL = '#2b2d31';

/**
 * opts: { plan (planHarbour), seaY (the water), landY (the quay and the yard), lampHeads (the
 * road's lamp heads, [{x, y, z}], for their light on the water), detail (false on low quality:
 * plain cranes and containers) }
 */
export function buildHarbour(track, palette, rand, opts) {
  const { plan, seaY, landY } = opts;
  const detail = opts.detail !== false;
  const group = new THREE.Group();
  group.name = 'harbour';
  const lights = new PortLights();
  const glow = new Parts(); // lamps, windows: unlit, bright (bloom)
  const white = new THREE.Color('#eef2ff').multiplyScalar(2.6);
  const sodium = new THREE.Color('#ffb066').multiplyScalar(2.6);
  const red = new THREE.Color('#ff2a1a').multiplyScalar(4);
  const green = new THREE.Color('#1aff6a').multiplyScalar(4);
  const halos = { white: [], sodium: [], red: [], green: [] };
  const halo = (kind, x, y, z, size) => halos[kind].push([x, y, z, size]);
  const f = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const at = (frame, x, y, z) => tmp.set(x, y, z).applyMatrix4(frame);

  // ---- the lights first (everything else is lit by them)
  // the road's own lamps, where it runs through the port at ground level: the stacks lining it,
  // the cranes over it and the ground beside it (as bright as on the road; their light on the
  // water is added with the glints)
  for (const h of opts.lampHeads || []) lights.add(h.x, h.y, h.z, palette.lamp ?? '#eef3ff', 0.85, 22);
  // floodlight masts: a ring of lamps 34 m up, sodium in the yard, white on the apron
  const MAST_H = 34;
  for (const m of plan.masts) {
    const [x, z] = plan.toXZ(m.u, m.v);
    const apron = m.v < 60;
    lights.add(x, landY + MAST_H, z, apron ? '#e8eeff' : '#ffb87a', 1.15, 78, m.v < 70 ? 0.3 : 0);
  }
  // crane floodlights under the boom and the portal
  const craneFrames = plan.cranes.map((k) => quayFrame(plan, k.u, 18, landY));
  plan.cranes.forEach((k, ci) => {
    const fr = craneFrames[ci];
    const reach = k.up ? [-10, 4, 12] : [-10, 4, 18, 32, 46, 60];
    for (const x of reach) {
      const p = at(fr, x, 44.5, 0);
      lights.add(p.x, p.y, p.z, '#eef3ff', 0.8, 52, 0.35);
    }
  });
  // ships' deck lights, sheds' dock lights
  for (const s of plan.ships) {
    const sf = shipFrame(plan, s, seaY);
    for (let k = -2; k <= 2; k++) {
      const p = at(sf, 0, 30, (k * s.len) / 5.5);
      lights.add(p.x, p.y, p.z, '#ffe2b8', 0.6, 40, 0.3);
    }
  }
  for (const s of plan.sheds) {
    const sf = quayFrame(plan, s.u, s.v, landY);
    for (let z = -s.len / 2 + 8; z < s.len / 2 - 4; z += 16) {
      const p = at(sf, s.dep / 2 + 1.5, 5.5, z);
      lights.add(p.x, p.y, p.z, '#ffd2a0', 0.45, 18);
    }
  }
  for (const g of plan.rtgs) {
    const gf = quayFrame(plan, g.u, g.v, landY);
    const p = at(gf, 0, 22, 0);
    lights.add(p.x, p.y, p.z, '#eef3ff', 0.7, 30);
  }

  // ---- light map over the port's ground (and the water off the quay)
  const rect = new THREE.Vector4();
  const lmW = 512;
  const lmH = 256;
  const u0 = plan.uMin - 60;
  const u1 = plan.uMax + 60;
  const v0 = -160;
  const v1 = plan.cityFrom;
  rect.set(u0, v0, 1 / (u1 - u0), 1 / (v1 - v0));
  const lmData = new Uint8Array(lmW * lmH * 4);
  const lt = [0, 0, 0];
  for (let j = 0; j < lmH; j++) {
    const v = v0 + ((j + 0.5) / lmH) * (v1 - v0);
    const y = v < 0 ? seaY : landY;
    for (let i = 0; i < lmW; i++) {
      const u = u0 + ((i + 0.5) / lmW) * (u1 - u0);
      const [x, z] = plan.toXZ(u, v);
      lights.at(x, y, z, lt);
      const o = (j * lmW + i) * 4;
      lmData[o] = Math.min(255, (lt[0] / 4) * 255);
      lmData[o + 1] = Math.min(255, (lt[1] / 4) * 255);
      lmData[o + 2] = Math.min(255, (lt[2] / 4) * 255);
      lmData[o + 3] = 255;
    }
  }
  const lightMap = new THREE.DataTexture(lmData, lmW, lmH, THREE.RGBAFormat);
  lightMap.magFilter = THREE.LinearFilter;
  lightMap.minFilter = THREE.LinearFilter;
  lightMap.wrapS = lightMap.wrapT = THREE.ClampToEdgeWrapping;
  lightMap.needsUpdate = true;

  // ---- water out to the horizon, the land behind the quay (3 m above it)
  const cx = (track.bounds.minX + track.bounds.maxX) / 2;
  const cz = (track.bounds.minZ + track.bounds.maxZ) / 2;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), createWaterMaterial(plan, palette, lightMap, rect));
  water.position.set(cx, seaY, cz);
  water.name = 'water';
  group.add(water);
  const [ucx] = plan.toUV(cx, cz);
  const landGeo = new THREE.BufferGeometry();
  const L = 7000;
  const corners = [
    [ucx - L, 0],
    [ucx + L, 0],
    [ucx + L, L],
    [ucx - L, L],
  ].map(([u, v]) => {
    const [x, z] = plan.toXZ(u, v);
    return [x, landY, z];
  });
  landGeo.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  // wound to face up whichever way the quay frame turns
  const up = (corners[1][0] - corners[0][0]) * (corners[2][2] - corners[0][2]) - (corners[1][2] - corners[0][2]) * (corners[2][0] - corners[0][0]) < 0;
  landGeo.setIndex(up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  const land = new THREE.Mesh(landGeo, createLandMaterial(plan, palette, lightMap, rect));
  land.name = 'land';
  group.add(land);

  // ---- structures, all lit by the port's lights
  const parts = new Parts();
  const steel = new SteelParts(); // the cranes on high detail
  // the quay wall along the whole shore, black fenders on its face along the port
  quayFrame(plan, ucx, -0.4, (seaY + landY) / 2 - 1, f);
  parts.box(boxIn(f, 0, 0, 0, 0.8, landY - seaY + 2, 2 * L), '#55575c');
  for (let u = plan.uMin; u < plan.uMax; u += 16) {
    quayFrame(plan, u, -0.95, seaY + 1.3, f);
    parts.box(boxIn(f, 0, 0, 0, 0.5, 2.2, 2.6), '#141416');
  }

  // ship-to-shore cranes. On high detail they're painted steel (createSteelMaterial), each with
  // more bracing and a lit cab; those near the road also get a stair tower up a leg, walkways
  // along the boom, bogies on wheels and the cable reel. Plain painted boxes on low detail
  const roadDist = (p) => {
    const r = track.nearestDistance(p.x, p.z, 160);
    return r.index < 0 ? Infinity : r.dist;
  };
  const GRATE = '#6f7378';
  const RAILING = '#d6ac2a';
  const cabGlass = new THREE.Color('#ffe2b8').multiplyScalar(1.8);
  const stairLamp = new THREE.Color('#fff0d6').multiplyScalar(3);
  plan.cranes.forEach((k, ci) => {
    const fr = craneFrames[ci];
    const paint = CRANE_PAINT[k.color];
    const num = ci + 1;
    const near = detail && roadDist(at(fr, 0, 0, 0)) < 100;
    const put = (m, col, kind = KIND.PAINT) => (detail ? steel.box(m, col, kind, num) : parts.box(m, col));
    const B = (x, y, z, sx, sy, sz, col, kind) => put(boxIn(fr, x, y, z, sx, sy, sz), col, kind);
    const S = (a, b, w, t, col, kind) => put(segIn(fr, a, b, w, t), col, kind);
    // legs on their bogies, the lower ties, the portal at the top
    for (const x of [-15, 15]) {
      for (const z of [-9, 9]) {
        B(x, 22.5, z, 1.8, 41, 1.8, paint.frame, KIND.LEG);
        if (near) {
          // an equaliser beam on two little bogies of wheels
          B(x, 1.85, z, 2.2, 0.9, 6.4, STEEL, KIND.BOGIE);
          for (const dz of [-1.6, 1.6]) B(x, 0.7, z + dz, 1.5, 1.4, 3, '#232528', KIND.WHEELS);
        } else B(x, 1.3, z, 2.6, 2.6, 6.4, STEEL, KIND.WHEELS);
      }
      B(x, 43, 0, 2.2, 2.6, 20.5, paint.frame);
    }
    for (const z of [-9, 9]) {
      B(0, 15, z, 30, 1.3, 1.3, paint.frame);
      B(0, 43, z, 32, 2.6, 2.2, paint.frame, KIND.PORTAL);
      put(beamIn(fr, -15, 16, 15, 42, z, 0.9), paint.frame);
    }
    if (detail) {
      // knee braces in the portal's top corners; along each side, a tie and a diagonal
      for (const z of [-9, 9]) for (const s of [-1, 1]) S([s * 15, 34, z], [s * 8.5, 41.8, z], 0.8, 0.8, paint.frame);
      for (const x of [-15, 15]) {
        B(x, 15, 0, 1.3, 1.3, 16.2, paint.frame);
        S([x, 16, -8.1], [x, 41.7, 8.1], 0.9, 0.9, paint.frame);
      }
    }
    // the boom: backreach behind the hinge, outreach over the water (raised on an idle crane)
    const hinge = [15, 46.8];
    const ang = k.up ? 1.36 : 0;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const outLen = 57;
    const tip = [hinge[0] + ca * outLen, hinge[1] + sa * outLen];
    for (const z of [-3.4, 3.4]) {
      B(-7.5, 46.8, z, 45, 2.6, 1.5, paint.boom);
      put(boxIn(fr, (hinge[0] + tip[0]) / 2, (hinge[1] + tip[1]) / 2, z, outLen, 2.6, 1.5, ang), paint.boom);
    }
    for (let d = 6; d < outLen; d += 9) put(boxIn(fr, hinge[0] + ca * d, hinge[1] + sa * d, 0, 0.6, 0.6, 6.8, ang), paint.boom);
    for (let x = -28; x < 14; x += 9) B(x, 46.8, 0, 0.6, 0.6, 6.8, paint.boom);
    // the A-frame above the waterside legs, stays to the boom's two ends
    const apex = [8, 78];
    for (const z of [-4, 4]) {
      put(beamIn(fr, 15, 45, apex[0], apex[1], z, 1.4), paint.frame);
      put(beamIn(fr, -6, 45, apex[0], apex[1], z, 1.4), paint.frame);
      put(beamIn(fr, apex[0], apex[1], tip[0], tip[1] + 1, z * 0.85, 0.35), STEEL, KIND.RAIL);
      put(beamIn(fr, apex[0], apex[1], -29, 48, z * 0.85, 0.35), STEEL, KIND.RAIL);
    }
    B(apex[0], apex[1] + 0.8, 0, 3, 1.8, 9.5, paint.frame);
    // machinery house on the backreach, the trolley and its spreader
    B(-21, 52, 0, 14, 8, 9.5, '#7f838a', KIND.HOUSE);
    const tx = k.up ? 11 : 22 + k.trolley * 40;
    const ty = 44.6;
    B(tx, ty, 0, 6.5, 2.4, 8, STEEL);
    // the spreader: parked up (always, over a road), over a ship's cargo, or down at the apron
    const sp = at(fr, tx, 9, 0);
    const overRoad = track.nearestDistance(sp.x, sp.z, 60).dist < 24;
    const sy = k.up || overRoad ? 36 : tx > 30 ? 34 : 9;
    B(tx, sy, 0, 2.7, 0.9, 12.3, '#c9a227');
    for (const z of [-4.5, 4.5]) B(tx, (ty + sy) / 2, z, 0.12, ty - sy, 0.12, STEEL, KIND.RAIL);
    // floodlights under the boom and the portal; red warning lights on top
    for (const x of k.up ? [-10, 4, 12] : [-10, 4, 18, 32, 46, 60]) {
      glow.box(boxIn(fr, x, 45.3, 0, 0.9, 0.2, 1.3), white);
      const p = at(fr, x, 45.1, 0);
      halo('white', p.x, p.y, p.z, 3.5);
    }
    for (const [x, y] of [[apex[0], apex[1] + 2], [tip[0], tip[1] + 1.8]]) {
      glow.box(boxIn(fr, x, y, 0, 0.7, 0.7, 0.7), red);
      const p = at(fr, x, y, 0);
      halo('red', p.x, p.y, p.z, 4);
      lights.glints.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color('#ff3020'), power: 0.45 });
    }
    if (detail) {
      // the operator's cab under the trolley, its windows lit, the glass floor too
      const cx = tx + 1.6;
      B(cx, 42.2, -2.2, 2.8, 2.6, 2.4, '#d9dbdd', KIND.CAB);
      glow.box(boxIn(fr, cx + 1.43, 42.5, -2.2, 0.05, 1.2, 2), cabGlass);
      for (const s of [-1, 1]) glow.box(boxIn(fr, cx + 0.2, 42.5, -2.2 + s * 1.23, 2.2, 1.2, 0.05), cabGlass);
      glow.box(boxIn(fr, cx + 0.2, 40.88, -2.2, 2, 0.05, 1.8), cabGlass);
    }
    if (near) {
      // a stair tower beside a leg (landside, where that's clear of the road): twelve flights up
      // to the portal, landings with guard rails, a lamp on every other one
      const legs = ci % 2 ? [[-15, 9], [-15, -9], [15, 9], [15, -9]] : [[-15, -9], [-15, 9], [15, -9], [15, 9]];
      const clear = ([lx, lz]) => [lx - 1.2, lx + 1.2].every((x) => [lz + Math.sign(lz), lz + Math.sign(lz) * 6.2].every((z) => roadDist(at(fr, x, 0, z)) > 13));
      const leg = legs.find(clear);
      if (leg) {
        const [lx, lz] = leg;
        const s = Math.sign(lz);
        const zA = lz + s; // the tower's end by the leg
        const zB = lz + s * 6.2; // its far end
        const top = 41.7;
        const rise = top / 12;
        const xl = lx - Math.sign(lx) * 1.15; // its side toward the road, for the lamps
        for (const x of [lx - 1.1, lx + 1.1]) for (const z of [zA, zB]) B(x, top / 2, z, 0.14, top, 0.14, paint.frame, KIND.RAIL);
        for (let f = 0; f < 12; f++) {
          const y0 = f * rise;
          const y1 = y0 + rise;
          const outward = f % 2 === 0;
          const x = lx + (outward ? 0.55 : -0.55);
          const xr = x + (outward ? 0.5 : -0.5);
          const za = outward ? zA + s * 0.8 : zB - s * 0.8;
          const zb = outward ? zB - s * 0.8 : zA + s * 0.8;
          // the flight, a handrail along its open side, the landing it arrives at, its guard rail
          S([x, y0, za], [x, y1, zb], 0.95, 0.22, GRATE, KIND.GRATE);
          S([xr, y0 + 1, za], [xr, y1 + 1, zb], 0.06, 0.06, RAILING, KIND.RAIL);
          const zl = outward ? zB - s * 0.4 : zA + s * 0.4;
          B(lx, y1 - 0.08, zl, 2.2, 0.16, 0.8, GRATE, KIND.GRATE);
          B(lx, y1 + 1, outward ? zB : zA, 2.2, 0.06, 0.06, RAILING, KIND.RAIL);
          if (f % 2) {
            glow.box(boxIn(fr, xl, y1 + 2.3, zl, 0.12, 0.22, 0.35), stairLamp);
            const lp = at(fr, xl, y1 + 2.3, zl);
            halo('white', lp.x, lp.y, lp.z, 1.6);
            lights.add(lp.x, lp.y, lp.z, '#fff0d6', 0.4, 9);
          }
        }
      }
      // walkways along both sides of the boom with a railing, and railings along the portal's top
      const onBoom = (d, off) => [hinge[0] + ca * d - sa * off, hinge[1] + sa * d + ca * off];
      for (const s of [-1, 1]) {
        const zw = s * 4.75;
        const zr = s * 5.25;
        S([-30, 45.45, zw], [15, 45.45, zw], 1.1, 0.1, GRATE, KIND.GRATE);
        S([-30, 46.55, zr], [15, 46.55, zr], 0.07, 0.07, RAILING, KIND.RAIL);
        for (let x = -29; x < 15; x += 9) B(x, 46, zr, 0.07, 1.1, 0.07, RAILING, KIND.RAIL);
        const [w0, w1, r0, r1] = [onBoom(0, -1.35), onBoom(outLen, -1.35), onBoom(0, -0.25), onBoom(outLen, -0.25)];
        S([w0[0], w0[1], zw], [w1[0], w1[1], zw], 1.1, 0.1, GRATE, KIND.GRATE);
        S([r0[0], r0[1], zr], [r1[0], r1[1], zr], 0.07, 0.07, RAILING, KIND.RAIL);
        for (let d = 3; d < outLen; d += 9) {
          const [a, b] = [onBoom(d, -1.35), onBoom(d, -0.25)];
          S([a[0], a[1], zr], [b[0], b[1], zr], 0.07, 0.07, RAILING, KIND.RAIL);
        }
      }
      for (const z of [-9, 9]) {
        const zr = z + Math.sign(z) * 0.95;
        B(0, 45.4, zr, 32, 0.07, 0.07, RAILING, KIND.RAIL);
        for (let x = -15; x <= 15; x += 7.5) B(x, 44.85, zr, 0.07, 1.1, 0.07, RAILING, KIND.RAIL);
      }
      // the cable reel, landside, hung from the tie: a drum of cable between two flanges, the
      // cable dropping from it to the ground
      if (roadDist(at(fr, -17.6, 0, 0)) > 14) {
        for (const dz of [-0.62, 0.62]) steel.prism(wheelIn(fr, -17.6, 10.2, dz, 4.4, 0.14, true), 12, paint.frame, KIND.PAINT, KIND.PAINT, num);
        steel.prism(wheelIn(fr, -17.6, 10.2, 0, 2.8, 1.1, true), 12, '#26282c', KIND.TYRE, KIND.TYRE, num);
        S([-15, 14.4, 0], [-17.6, 10.2, 0], 0.5, 0.5, STEEL);
        B(-18.95, 4.4, 0, 0.14, 8.8, 0.14, '#1a1b1e', KIND.RAIL);
      }
    }
  });

  // rubber-tyred gantries over the yard blocks: painted steel with a lit cab on high detail, and
  // on tyres near the road
  plan.rtgs.forEach((g, gi) => {
    const gf = quayFrame(plan, g.u, g.v, landY);
    const tag = 40 + gi;
    const near = detail && roadDist(at(gf, 0, 0, 0)) < 100;
    const put = (m, col, kind = KIND.PAINT) => (detail ? steel.box(m, col, kind, tag) : parts.box(m, col));
    const B = (x, y, z, sx, sy, sz, col, kind) => put(boxIn(gf, x, y, z, sx, sy, sz), col, kind);
    for (const x of [-12.5, 12.5]) {
      for (const z of [-6, 6]) {
        if (near) {
          // the leg on a short beam, two tyres under it
          B(x, 12.1, z, 1.1, 20.2, 1.1, '#d7b223', KIND.LEG);
          B(x, 1.8, z, 1.3, 0.7, 3.9, STEEL, KIND.BOGIE);
          for (const dz of [-1.05, 1.05]) steel.prism(wheelIn(gf, x, 0.72, z + dz, 1.44, 0.62), 10, '#121315', KIND.TYRE, KIND.HUB, tag);
        } else {
          B(x, 11, z, 1.1, 22, 1.1, '#d7b223', KIND.LEG);
          B(x, 1, z, 1.8, 2, 3.2, STEEL, KIND.WHEELS);
        }
      }
      B(x, 22.4, 0, 1.4, 1.8, 13.4, '#d7b223');
    }
    for (const z of [-6, 6]) B(0, 23.4, z, 27, 1.8, 1.4, '#e2e2dc');
    B(4, 25, 0, 5, 2.2, 7, '#e2e2dc');
    glow.box(boxIn(gf, 0, 22.3, 0, 8, 0.25, 0.8), white);
    if (detail) {
      // the cab, hung under the trolley, its windows lit
      B(5.6, 23.4, 2.2, 0.3, 1.2, 0.3, STEEL, KIND.RAIL);
      B(5.6, 21.6, 2.2, 2.2, 2.4, 2, '#d9dbdd', KIND.CAB);
      glow.box(boxIn(gf, 6.73, 21.85, 2.2, 0.05, 1.1, 1.6), cabGlass);
      for (const s of [-1, 1]) glow.box(boxIn(gf, 5.6, 21.85, 2.2 + s * 1.03, 1.8, 1.1, 0.05), cabGlass);
    }
  });

  // sheds and warehouses: walls, a darker roof, a lit dock along the yard side
  for (const s of plan.sheds) {
    const sf = quayFrame(plan, s.u, s.v, landY);
    const wall = ['#5d6168', '#6b6458', '#4f5e6b', '#6a6c70'][Math.floor(s.seed * 4)];
    parts.box(boxIn(sf, 0, s.h / 2, 0, s.dep, s.h, s.len), wall, true);
    parts.box(boxIn(sf, 0, s.h + 0.3, 0, s.dep + 0.6, 0.6, s.len + 0.6), '#2c2e33');
    for (let z = -s.len / 2 + 8; z < s.len / 2 - 4; z += 16) glow.box(boxIn(sf, s.dep / 2 + 0.05, 5.6, z, 0.1, 0.4, 2.4), sodium);
  }

  // ships alongside: hull (a darker band at the waterline), deck cargo, the bridge at the stern
  const shipStacks = [];
  for (const s of plan.ships) {
    const sf = shipFrame(plan, s, seaY);
    const L2 = s.len / 2;
    const B2 = s.beam / 2;
    const deck = 15;
    const bow = 0.18 * s.len;
    // hull: a box for the parallel middle body and tapering boxes for the bow
    parts.box(boxIn(sf, 0, deck / 2 - 3, -bow / 2, s.beam, deck + 6, s.len - bow), s.color);
    for (let k = 0; k < 4; k++) {
      const z0 = L2 - bow + (k * bow) / 4;
      const w = s.beam * (1 - Math.pow((k + 0.5) / 4, 1.6) * 0.9);
      parts.box(boxIn(sf, 0, deck / 2 - 3 + k * 0.4, z0 + bow / 8, w, deck + 6 + k * 0.8, bow / 4), s.color);
    }
    parts.box(boxIn(sf, 0, 0.2, -bow / 2, s.beam + 0.2, 2.2, s.len - bow + 0.2), '#5a2420');
    // a pale line along the deck edge
    parts.box(boxIn(sf, 0, deck - 0.4, -bow / 2, s.beam + 0.15, 0.7, s.len - bow + 0.15), '#c9ccd0');
    // accommodation block and bridge near the stern, a funnel behind it
    const az = -L2 + 0.13 * s.len;
    parts.box(boxIn(sf, 0, deck + 13, az, B2 * 1.5, 26, 14), '#d8d6d0');
    parts.box(boxIn(sf, 0, deck + 25, az + 2, s.beam + 2, 2.4, 6), '#d8d6d0');
    parts.box(boxIn(sf, 0, deck + 12, az - 14, 7, 18, 7), '#3a3d42');
    for (let y = deck + 4; y < deck + 24; y += 3) {
      for (const x of [-B2 * 0.75 - 0.05, B2 * 0.75 + 0.05]) {
        if (rand() < 0.55) glow.box(boxIn(sf, x, y, az + (rand() - 0.5) * 8, 0.1, 1.1, 2.2), rand() < 0.7 ? new THREE.Color('#ffd7a0').multiplyScalar(2.2) : new THREE.Color('#cfe0ff').multiplyScalar(2));
      }
    }
    glow.box(boxIn(sf, 0, deck + 25, az + 5.1, s.beam * 0.7, 0.9, 0.1), new THREE.Color('#bfe0ff').multiplyScalar(1.6));
    // side lights on the bridge wings, a white light on the mast
    for (const [x, col] of [[-B2 - 1, '#ff2a1a'], [B2 + 1, '#1aff6a']]) {
      glow.box(boxIn(sf, x, deck + 25.4, az + 2, 0.5, 0.5, 0.5), new THREE.Color(col).multiplyScalar(5));
      const p = at(sf, x, deck + 25.4, az + 2);
      lights.glints.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color(col), power: 0.4 });
    }
    // cargo: stacks in bays from the bridge to the bow, highest amidships
    for (let z = az + 12; z < L2 - bow * 0.6; z += BAY) {
      for (let x = -B2 + 2; x < B2 - 1.5; x += ROW) {
        if (rand() > s.load) continue;
        const mid = 1 - Math.abs(z) / L2;
        const h = 1 + Math.floor(rand() * (2 + mid * 4));
        const p = at(sf, x, deck, z);
        shipStacks.push({ x: p.x, y: p.y, z: p.z, dx: sf.elements[8], dz: sf.elements[10], h, seed: rand() });
      }
    }
  }

  // channel buoys
  for (const b of plan.buoys) {
    const bf = quayFrame(plan, b.u, b.v, seaY);
    parts.box(boxIn(bf, 0, 1.2, 0, 2.2, 3, 2.2), b.red ? '#5a1612' : '#12401f');
    glow.box(boxIn(bf, 0, 3.2, 0, 0.5, 0.5, 0.5), b.red ? red : green);
    const p = at(bf, 0, 3.2, 0);
    halo(b.red ? 'red' : 'green', p.x, p.y, p.z, 5);
    lights.glints.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color(b.red ? '#ff3020' : '#20ff70'), power: 0.35 });
  }

  // ---- the port's structures in one mesh, lit by the port's lights
  if (!parts.empty) {
    const mesh = new THREE.Mesh(parts.geometry(lights), createPortMaterial(1.25));
    mesh.name = 'port';
    group.add(mesh);
  }
  if (!steel.empty) {
    const mesh = new THREE.Mesh(steel.geometry(lights), createSteelMaterial(1.25));
    mesh.name = 'cranes';
    group.add(mesh);
  }

  // ---- floodlight masts: poles, lamp rings, halos
  if (plan.masts.length) {
    for (const m of plan.masts) {
      const mf = quayFrame(plan, m.u, m.v, landY);
      const p = at(mf, 0, MAST_H, 0);
      halo(m.v < 60 ? 'white' : 'sodium', p.x, p.y, p.z, 6);
      for (let k = 0; k < 4; k++) glow.box(boxIn(mf, Math.cos((k * Math.PI) / 2) * 1.2, MAST_H - 0.4, Math.sin((k * Math.PI) / 2) * 1.2, 1.2, 0.5, 1.2), m.v < 60 ? white : sodium);
    }
    const poles = new Parts();
    for (const m of plan.masts) {
      const mf = quayFrame(plan, m.u, m.v, landY);
      poles.box(boxIn(mf, 0, MAST_H / 2, 0, 0.7, MAST_H, 0.7), '#4a4d53');
      poles.box(boxIn(mf, 0, MAST_H - 0.2, 0, 3.6, 0.5, 3.6), '#3a3c41');
    }
    group.add(new THREE.Mesh(poles.geometry(lights), createPortMaterial(1.5)));
  }

  // ---- containers: a whole stack per instance far from the road; along the road at ground level,
  // one box per instance, stacked the way they really are: never quite square, some pairs of
  // 20 ft boxes, some high-cubes (not on low detail). Each box sits right on the one below, the
  // seam painted on
  const boxes = []; // on the ground or a deck
  const raised = []; // on another box
  for (const st of plan.stacks) {
    if (!(st.road && detail)) {
      boxes.push({ x: st.x, y: landY, z: st.z, dx: st.dx, dz: st.dz, l: CONTAINER.l, h: st.h * CONTAINER.h, levels: st.h, seed: st.seed });
      continue;
    }
    let y = landY;
    for (let k = 0; k < st.h; k++) {
      const list = k ? raised : boxes;
      const h = rand() < 0.35 ? 2.9 : 2.59;
      const yaw = (rand() - 0.5) * 0.008;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const dx = st.dx * cy - st.dz * sy;
      const dz = st.dx * sy + st.dz * cy;
      const along = (rand() - 0.5) * 0.14;
      const across = (rand() - 0.5) * 0.08;
      const x = st.x + st.dx * along - st.dz * across;
      const z = st.z + st.dz * along + st.dx * across;
      if (rand() < 0.2) {
        for (const sg of [-1, 1]) list.push({ x: x + dx * sg * 3.06, y, z: z + dz * sg * 3.06, dx, dz, l: 6.06, h, levels: 1, seed: rand() });
      } else list.push({ x, y, z, dx, dz, l: 12.19, h, levels: 1, seed: rand() });
      y += h;
    }
  }
  for (const st of shipStacks) boxes.push({ x: st.x, y: st.y, z: st.z, dx: st.dx, dz: st.dz, l: CONTAINER.l, h: st.h * CONTAINER.h, levels: st.h, seed: st.seed });
  const stackMat = createStackMaterial(detail);
  for (const [list, floors] of [[boxes, false], [raised, true]]) {
    if (!list.length) continue;
    // a unit box standing on its base; the base left off where it's never seen (on the ground or a
    // deck), kept up in a stack, where the sky would show through a box overhanging the one below
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const geo = new THREE.BufferGeometry();
    for (const k of ['position', 'normal']) geo.setAttribute(k, box.attributes[k]);
    const idx = Array.from(box.index.array);
    // (BoxGeometry's faces in order +x, -x, +y, -y, +z, -z: six indices each)
    geo.setIndex(floors ? idx : [...idx.slice(0, 18), ...idx.slice(24)]);
    const lightAttr = new Float32Array(list.length * 3);
    const boxAttr = new Float32Array(list.length * 2);
    geo.setAttribute('aLight', new THREE.InstancedBufferAttribute(lightAttr, 3));
    geo.setAttribute('aBox', new THREE.InstancedBufferAttribute(boxAttr, 2));
    const mesh = new THREE.InstancedMesh(geo, stackMat, list.length);
    list.forEach((b, n) => {
      // length along (dx, dz), height, width across it
      _m.set(b.dx * b.l, 0, -b.dz * CONTAINER.w, b.x, 0, b.h, 0, b.y, b.dz * b.l, 0, b.dx * CONTAINER.w, b.z, 0, 0, 0, 1);
      mesh.setMatrixAt(n, _m);
      // a stack is lit as from above it, a single box at its own height
      lights.at(b.x, b.levels > 1 ? b.y + b.h + 1 : b.y + b.h * 0.6, b.z, lt);
      lightAttr.set(lt, n * 3);
      boxAttr[n * 2] = b.seed;
      boxAttr[n * 2 + 1] = b.levels;
    });
    mesh.computeBoundingSphere();
    mesh.name = 'containers';
    group.add(mesh);
  }

  // ---- everything that glows, and halos round the lights
  if (!glow.empty) group.add(new THREE.Mesh(glow.geometry(null, 'color'), new THREE.MeshBasicMaterial({ vertexColors: true })));
  for (const [kind, col, k] of [['white', '#e6eeff', 0.4], ['sodium', '#ffb46e', 0.45], ['red', '#ff3a22', 0.6], ['green', '#2aff7a', 0.6]]) {
    const list = halos[kind];
    if (!list.length) continue;
    const hm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), createHaloMaterial(col, k), list.length);
    list.forEach(([x, y, z, s], i) => hm.setMatrixAt(i, _m.makeScale(s, s, s).setPosition(x, y, z)));
    hm.renderOrder = 3;
    hm.computeBoundingSphere();
    group.add(hm);
  }

  // ---- the lights' streaks on the water: the port's near the quay, the road's over the bay
  const glints = [];
  for (const g of lights.glints) {
    const [, v] = plan.toUV(g.x, g.z);
    if (v > 70) continue;
    glints.push([g.x, seaY, g.z, g.y - seaY, g.color.r, g.color.g, g.color.b, g.power]);
  }
  for (const h of opts.lampHeads || []) {
    const [, v] = plan.toUV(h.x, h.z);
    if (v < -2) glints.push([h.x, seaY, h.z, h.y - seaY, 0.9, 0.95, 1.0, 0.22]);
  }
  if (glints.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    const ig = new THREE.InstancedBufferGeometry().copy(geo);
    ig.instanceCount = glints.length;
    ig.setAttribute('aFoot', new THREE.InstancedBufferAttribute(new Float32Array(glints.flatMap((g) => g.slice(0, 4))), 4));
    ig.setAttribute('aGlint', new THREE.InstancedBufferAttribute(new Float32Array(glints.flatMap((g) => g.slice(4, 8))), 4));
    const mesh = new THREE.Mesh(ig, createGlintMaterial());
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.name = 'glints';
    group.add(mesh);
  }

  group.userData.lightMap = lightMap;
  return group;
}
