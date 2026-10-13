import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Detailed procedural wheels: tyres with shoulders and tread grooves, concave multi-spoke rims
// (one design per rim style), brake discs and calipers. Geometry is cached and shared between
// cars. Wheel frame: axle along X with the outer face toward +X; (Y, Z) is the wheel plane.
// Every part carries a baked ambient-occlusion vertex colour.

const cache = new Map();
const cached = (key, make) => {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
};
export const isSharedWheelGeometry = (g) => {
  for (const v of cache.values()) if (v === g) return true;
  return false;
};

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Rim radius for a tyre radius (≈ 20-21" rims on low-profile tyres). A design can pick its own
 * (`rim` in its wheel layout), say small rims on tall sidewalls for an older car. */
export const rimRadius = (r) => r - 0.084;

// lathe around the axle; profile points are [radius, axial]
function lathe(profile, segments, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(
    profile.map(([r, a]) => new THREE.Vector2(r, a)),
    segments,
    phiStart,
    phiLength,
  );
  g.rotateZ(-Math.PI / 2); // lathe axis Y -> axle X
  return g;
}

function finish(g, ao) {
  g.deleteAttribute('uv');
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = ao(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return ng;
}

/** Map an extrusion (shape in XY, depth along Z) into the wheel frame, bending it onto face(rho). */
function toWheel(g, face, depth) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i);
    const sy = p.getY(i);
    const sz = p.getZ(i);
    const rho = Math.hypot(sx, sy) || 1e-6;
    const df = (face(rho + 1e-4) - face(rho - 1e-4)) / 2e-4;
    p.setXYZ(i, face(rho) - depth + sz, sx, sy);
    const nx = n.getZ(i);
    const ny = n.getX(i) - df * (sx / rho) * n.getZ(i);
    const nz = n.getY(i) - df * (sy / rho) * n.getZ(i);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}

/** Outline of a spoke following a centreline (radius rIn..rOut, angle theta(t)) with half width half(t). */
function spokeShape(theta, half, rIn, rOut, n) {
  const left = [];
  const right = [];
  const at = (t) => {
    const rho = rIn + (rOut - rIn) * t;
    const th = theta(t);
    return [rho * Math.cos(th), rho * Math.sin(th)];
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [px, py] = at(t);
    const [qx, qy] = at(Math.min(1, t + 0.01));
    const [ox, oy] = at(Math.max(0, t - 0.01));
    let tx = qx - ox;
    let ty = qy - oy;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const h = half(t);
    left.push(new THREE.Vector2(px - ty * h, py + tx * h));
    right.push(new THREE.Vector2(px + ty * h, py - tx * h));
  }
  return new THREE.Shape([...left, ...right.reverse()]);
}

// ---------------------------------------------------------------------------------------- tyre
/** slick: no tread grooves (a racing tyre; `slick` in a design's wheel layout). */
export function tyreGeometry(r, w, hq, rim = rimRadius(r), slick = false) {
  return cached(`tyre|${r}|${w}|${hq}|${rim}|${slick}`, () => {
    const hw = w / 2;
    const sh = 0.028;
    const prof = [
      [rim + 0.002, -hw + 0.018],
      [rim + 0.012, -hw + 0.006],
      [rim + 0.03, -hw + 0.001],
      [(rim + r) / 2, -hw - 0.005],
      [r - sh * 1.1, -hw - 0.002],
      [r - sh * 0.45, -hw + sh * 0.3],
      [r - 0.005, -hw + sh * 0.8],
      [r, -hw + sh * 1.15],
    ];
    if (hq && !slick) {
      for (const gq of [-0.3, -0.1, 0.1, 0.3]) {
        const c = gq * w;
        prof.push([r, c - 0.008], [r - 0.007, c - 0.005], [r - 0.007, c + 0.005], [r, c + 0.008]);
      }
    }
    prof.push(
      [r, hw - sh * 1.15],
      [r - 0.005, hw - sh * 0.8],
      [r - sh * 0.45, hw - sh * 0.3],
      [r - sh * 1.1, hw + 0.002],
      [(rim + r) / 2, hw + 0.005],
      [rim + 0.03, hw - 0.001],
      [rim + 0.012, hw - 0.006],
      [rim + 0.002, hw - 0.018],
    );
    return finish(lathe(prof, hq ? 72 : 28), (x) => 0.45 + 0.55 * smooth(-hw, hw, x));
  });
}

/** A white band round the outer sidewall, `band` wide from just outside the rim: a design sets
 * `whitewall` (its width) in its wheel layout, wide whitewalls on a 50s car. It follows the
 * sidewall's bulge as tyreGeometry draws it, a hair proud of it, with the same segments. */
export function whitewallGeometry(r, w, hq, rim = rimRadius(r), band = 0.06) {
  return cached(`whitewall|${r}|${w}|${hq}|${rim}|${band}`, () => {
    const hw = w / 2;
    const wall = [
      [rim + 0.012, hw - 0.006],
      [rim + 0.03, hw - 0.001],
      [(rim + r) / 2, hw + 0.005],
      [r - 0.028 * 1.1, hw + 0.002],
    ];
    const at = (rho) => {
      let i = 1;
      while (i < wall.length - 1 && rho > wall[i][0]) i++;
      const [r0, a0] = wall[i - 1];
      const [r1, a1] = wall[i];
      return a0 + ((a1 - a0) * (rho - r0)) / (r1 - r0);
    };
    const inner = rim + 0.022;
    const outer = Math.min(inner + band, r - 0.045);
    // (outside in, as the tyre's outer wall runs, so it faces the same way)
    const prof = [];
    for (let i = 0; i <= 6; i++) {
      const rho = outer + ((inner - outer) * i) / 6;
      prof.push([rho, at(rho) + 0.0015]);
    }
    return finish(lathe(prof, hq ? 72 : 28), () => 0.95);
  });
}

// ---------------------------------------------------------------------------------------- rims
const RIM_STYLES = {
  // five split spokes (V pairs)
  split: (add, hub, lip) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(() => a, (t) => 0.024 - 0.01 * t, hub * 0.8, hub + 0.035, 4);
      for (const s of [-1, 1]) add((t) => a + s * (0.02 + 0.13 * t), (t) => 0.0125 - 0.0035 * t, hub + 0.01, lip, 12);
    }
  },
  // twelve curved turbine blades
  turbine: (add, hub, lip) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add((t) => a + 0.5 * t * t, (t) => 0.0095 + 0.005 * t, hub * 0.85, lip, 14);
    }
  },
  // cross-laced mesh
  mesh: (add, hub, lip) => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      for (const s of [-1, 1]) add((t) => a + s * 0.3 * t, () => 0.0065, hub * 0.85, lip, 12);
    }
  },
  // five wide aero blades
  blade: (add, hub, lip) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add((t) => a + 0.16 * t, (t) => 0.019 + 0.026 * t * t, hub * 0.85, lip, 12);
    }
  },
  // eight straight spokes, widening toward the rim: an 80s classic
  classic: (add, hub, lip) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(() => a, (t) => 0.0125 + 0.008 * t, hub * 0.85, lip, 6);
    }
  },
  // no spokes: a flat aero cover over the whole face on a centre-lock nut (see rimGeometry), as
  // on a grand prix car
  cover: () => {},
};

export function rimGeometry(style, r, w, hq, rim = rimRadius(r)) {
  const st = RIM_STYLES[style] ? style : 'split';
  return cached(`rim|${st}|${r}|${w}|${hq}|${rim}`, () => {
    const hw = w / 2;
    const lipFace = hw - 0.012;
    const dish = Math.min(0.06, w * 0.2);
    const hub = 0.074;
    const lip = rim - 0.012;
    const face = (rho) => lipFace - dish * Math.pow(1 - smooth(hub, lip, rho) * 0.999, 1.4) - 0.003;
    const parts = [];
    // outer lip + barrel (one lathe, normals out of the metal)
    parts.push(
      lathe(
        [
          [rim + 0.013, hw - 0.024],
          [rim + 0.013, hw - 0.012],
          [rim + 0.008, hw - 0.005],
          [rim - 0.004, hw - 0.003],
          [rim - 0.016, hw - 0.007],
          [rim - 0.021, hw - 0.016],
          [rim - 0.021, -hw + 0.03],
          [rim - 0.012, -hw + 0.014],
        ],
        hq ? 72 : 28,
      ),
    );
    // spokes
    const depth = hq ? 0.024 : 0.026;
    const ext = {
      depth,
      bevelEnabled: hq,
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelOffset: 0,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 1,
    };
    RIM_STYLES[st](
      (theta, half, rIn, rOut, n) => {
        const g = new THREE.ExtrudeGeometry(spokeShape(theta, half, rIn, rOut, hq ? n : Math.ceil(n / 2)), ext);
        parts.push(toWheel(g, face, depth));
      },
      hub,
      lip,
    );
    if (st === 'cover') {
      // the cover, flush with the lip and dipping round the hub (outside in, so it faces out)
      const back = lipFace - 0.03;
      parts.push(lathe([[lip + 0.004, lipFace - 0.01], [lip - 0.008, lipFace - 0.005], [hub + 0.014, lipFace - 0.008], [hub * 0.78, back], [0.004, back]], hq ? 72 : 28));
      // the centre-lock nut
      const nut = new THREE.CylinderGeometry(0.034, 0.038, 0.03, 6);
      nut.rotateZ(-Math.PI / 2);
      nut.translate(back + 0.015, 0, 0);
      parts.push(nut);
    } else {
      // hub, lug nuts, centre cap
      const hubFace = face(hub) + 0.002;
      const hubDisc = new THREE.CylinderGeometry(hub + 0.006, hub + 0.012, 0.03, hq ? 36 : 16);
      hubDisc.rotateZ(-Math.PI / 2);
      hubDisc.translate(hubFace - 0.015, 0, 0);
      parts.push(hubDisc);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
        const nut = new THREE.CylinderGeometry(0.0095, 0.0105, 0.02, 6);
        nut.rotateZ(-Math.PI / 2);
        nut.translate(hubFace + 0.006, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
        parts.push(nut);
      }
      const cap = new THREE.CylinderGeometry(0.027, 0.031, 0.012, hq ? 28 : 12);
      cap.rotateZ(-Math.PI / 2);
      cap.translate(hubFace + 0.005, 0, 0);
      parts.push(cap);
    }
    const merged = mergeGeometries(
      parts.map((g) => {
        g.deleteAttribute('uv');
        return g.index ? g.toNonIndexed() : g;
      }),
    );
    return finish(merged, (x, y, z) => {
      const rho = Math.hypot(y, z);
      const depthAo = 0.3 + 0.7 * smooth(-hw, lipFace - 0.02, x);
      const hubAo = 0.8 + 0.2 * smooth(hub * 0.5, hub * 1.6, rho);
      return depthAo * hubAo;
    });
  });
}

// ---------------------------------------------------------------------------------------- brakes
export function discGeometry(r, w, rim = rimRadius(r)) {
  return cached(`disc|${r}|${w}|${rim}`, () => {
    const rd = rim - 0.055;
    // the hat shrinks with a small disc, so the friction band keeps its width
    const ri = Math.min(0.11, rd * 0.62);
    const t = 0.034;
    const c = discCenter(r, w);
    const ring = lathe(
      [
        [ri, c - t / 2 + 0.002],
        [ri + 0.002, c - t / 2],
        [rd - 0.002, c - t / 2],
        [rd, c - t / 2 + 0.002],
        [rd, c + t / 2 - 0.002],
        [rd - 0.002, c + t / 2],
        [ri + 0.002, c + t / 2],
        [ri, c + t / 2 - 0.002],
      ],
      48,
    );
    const hat = lathe(
      [
        [ri + 0.002, c - t / 2],
        [ri - 0.005, c + t / 2 + 0.03],
        [ri * 0.64, c + t / 2 + 0.036],
        [0.0, c + t / 2 + 0.036],
      ],
      32,
    );
    const g = mergeGeometries([ring, hat].map((p) => (p.deleteAttribute('uv'), p.toNonIndexed())));
    return finish(g, (x, y, z) => {
      const rho = Math.hypot(y, z);
      // brighter machined friction band
      return rho > ri + 0.01 && rho < rd - 0.008 ? 0.85 : 0.45;
    });
  });
}

function discCenter(r, w) {
  const hw = w / 2;
  const dish = Math.min(0.06, w * 0.2);
  return hw - 0.012 - dish - 0.075;
}

export function caliperGeometry(r, w, rim = rimRadius(r)) {
  return cached(`caliper|${r}|${w}|${rim}`, () => {
    const rd = rim - 0.055;
    const rIn = rd - 0.06;
    const rOut = rd + 0.016;
    const a0 = -0.42;
    const a1 = 0.42;
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector2(rOut * Math.cos(a), rOut * Math.sin(a)));
    }
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector2(rIn * Math.cos(a), rIn * Math.sin(a)));
    }
    const depth = 0.064;
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.007,
      bevelSegments: 2,
      curveSegments: 1,
    });
    const c = discCenter(r, w);
    toWheel(g, () => c + depth / 2 + 0.008, depth);
    // place it at the top-rear of the disc
    g.rotateX(-Math.PI * 0.32);
    g.deleteAttribute('uv');
    return finish(g, (x) => 0.75 + 0.25 * smooth(c - 0.04, c + 0.04, x));
  });
}

// ------------------------------------------------------------------------------- all four wheels
/** Motion-blur disc over the spokes: a flat circle on the outer face (it carries uvs, no AO). */
export function blurGeometry(r, w, rim = rimRadius(r)) {
  return cached(`blur|${r}|${w}|${rim}`, () => {
    const g = new THREE.CircleGeometry(rim - 0.02, 40);
    g.rotateY(Math.PI / 2);
    g.translate(w / 2 - 0.006, 0, 0);
    return g.toNonIndexed();
  });
}

/**
 * One part of all four wheels baked into a single geometry for a skinned mesh, so a car draws
 * each wheel material once instead of once per wheel. Every vertex follows one bone of its wheel:
 * `boneOf(k)` (each wheel k has a steering pivot bone 2k and a rolling spin bone 2k + 1). Left
 * wheels are baked mirrored, with their triangles turned back to face out, so no bone ever
 * scales negatively. wheels: [{ x, y, z, r, w, side, rim? }] at rest, in car space.
 */
function bakeWheels(wheels, partOf, boneOf) {
  const srcs = wheels.map(partOf);
  const count = srcs.reduce((s, g) => s + g.attributes.position.count, 0);
  const uv = !!srcs[0].attributes.uv;
  const color = !!srcs[0].attributes.color;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = color ? new Float32Array(count * 3) : null;
  const tex = uv ? new Float32Array(count * 2) : null;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  let o = 0;
  wheels.forEach((wh, k) => {
    const g = srcs[k];
    const P = g.attributes.position.array;
    const N = g.attributes.normal.array;
    const C = color ? g.attributes.color.array : null;
    const U = uv ? g.attributes.uv.array : null;
    const n = g.attributes.position.count;
    const m = wh.side < 0 ? -1 : 1;
    const bone = boneOf(k);
    for (let t = 0; t < n; t += 3) {
      for (let j = 0; j < 3; j++) {
        const s = t + (m < 0 && j > 0 ? 3 - j : j);
        const d = o + t + j;
        pos[d * 3] = P[s * 3] * m + wh.x;
        pos[d * 3 + 1] = P[s * 3 + 1] + wh.y;
        pos[d * 3 + 2] = P[s * 3 + 2] + wh.z;
        nor[d * 3] = N[s * 3] * m;
        nor[d * 3 + 1] = N[s * 3 + 1];
        nor[d * 3 + 2] = N[s * 3 + 2];
        if (col) {
          col[d * 3] = C[s * 3];
          col[d * 3 + 1] = C[s * 3 + 1];
          col[d * 3 + 2] = C[s * 3 + 2];
        }
        if (tex) {
          tex[d * 2] = U[s * 2];
          tex[d * 2 + 1] = U[s * 2 + 1];
        }
        skinIndex[d * 4] = bone;
        skinWeight[d * 4] = 1;
      }
    }
    o += n;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (tex) geo.setAttribute('uv', new THREE.BufferAttribute(tex, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Geometry for all four wheels of a car (see bakeWheels), shared between every car with the same
 * wheels: { tyre, rim, blur } plus { disc, caliper } in high quality, and { whitewall } when every
 * wheel has one. Tyres, rims and discs roll with the spin bones; calipers and the blur disc only
 * steer.
 */
export function wheelSet(wheels, style, hq) {
  const key = `set|${wheels.map((w) => `${w.x},${w.y},${w.z},${w.r},${w.w},${w.rim},${w.whitewall},${!!w.slick}`).join('|')}|${style}|${hq}`;
  const spin = (k) => 2 * k + 1;
  const pivot = (k) => 2 * k;
  const rimOf = (w) => w.rim ?? rimRadius(w.r);
  const set = {
    tyre: cached(`${key}|tyre`, () => bakeWheels(wheels, (w) => tyreGeometry(w.r, w.w, hq, rimOf(w), !!w.slick), spin)),
    rim: cached(`${key}|rim`, () => bakeWheels(wheels, (w) => rimGeometry(style, w.r, w.w, hq, rimOf(w)), spin)),
    blur: cached(`${key}|blur`, () => bakeWheels(wheels, (w) => blurGeometry(w.r, w.w, rimOf(w)), pivot)),
  };
  if (hq) {
    set.disc = cached(`${key}|disc`, () => bakeWheels(wheels, (w) => discGeometry(w.r, w.w, rimOf(w)), spin));
    set.caliper = cached(`${key}|caliper`, () => bakeWheels(wheels, (w) => caliperGeometry(w.r, w.w, rimOf(w)), pivot));
  }
  if (wheels.every((w) => w.whitewall > 0)) {
    set.whitewall = cached(`${key}|whitewall`, () => bakeWheels(wheels, (w) => whitewallGeometry(w.r, w.w, hq, rimOf(w), w.whitewall), spin));
  }
  return set;
}
