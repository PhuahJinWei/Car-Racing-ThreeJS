import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createRoadMaterial,
  createLitMaterial,
  createNeonMaterial,
  createTunnelMaterial,
  additive,
  globalUniforms,
} from './materials.js';

const CHUNK = 120; // samples per chunk (~240 m) - keeps draw calls low but still culls.

/**
 * F-shape concrete safety barrier: offset of the road-side face from its foot at height h
 * (75 mm vertical lip, a sloped toe up to 0.3 m, then a near-vertical upper face).
 */
export function barrierFaceOffset(h, height = 1.1) {
  if (h <= 0.075) return 0;
  if (h <= 0.3) return ((h - 0.075) / 0.225) * 0.17;
  return 0.17 + ((Math.min(h, height) - 0.3) / Math.max(0.01, height - 0.3)) * 0.08;
}

/**
 * Sweep cross-section polylines along the track.
 * polylines: [[ [d, h, u?], ... ], ...] or fn(row, i, s) returning the same topology.
 * h may be 'ground' to drop the point vertically to opts.groundY.
 */
export function sweep(track, i0, rows, polylines, opts = {}) {
  const getPL = typeof polylines === 'function' ? polylines : () => polylines;
  const first = getPL(0, i0 % track.n, i0 * track.ds);
  let vertsPerRow = 0;
  for (const pl of first) vertsPerRow += pl.length;
  const vcount = vertsPerRow * (rows + 1);
  const pos = new Float32Array(vcount * 3);
  const uv = new Float32Array(vcount * 2);
  const aIdx = new Float32Array(vcount);
  const attrs = (opts.attrs || []).map((a) => ({ ...a, data: new Float32Array(vcount * (a.size || 1)) }));
  const groundY = opts.groundY ?? 0;
  const { px, py, pz, rx, ry, rz, ux, uy, uz, n, ds } = track;
  let v = 0;
  for (let r = 0; r <= rows; r++) {
    const iu = i0 + r;
    const i = iu % n;
    const s = iu * ds;
    const pls = r === 0 ? first : getPL(r, i, s);
    for (let p = 0; p < pls.length; p++) {
      const pl = pls[p];
      for (let q = 0; q < pl.length; q++) {
        const pt = pl[q];
        const d = pt[0];
        const h = pt[1];
        let x = px[i] + rx[i] * d;
        let y = py[i] + ry[i] * d;
        let z = pz[i] + rz[i] * d;
        if (h === 'ground') y = groundY;
        else {
          x += ux[i] * h;
          y += uy[i] * h;
          z += uz[i] * h;
        }
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        uv[v * 2] = pt[2] !== undefined ? pt[2] : q / Math.max(1, pl.length - 1);
        uv[v * 2 + 1] = s;
        aIdx[v] = i;
        for (const a of attrs) {
          const val = a.fn(r, i, s, p, q);
          if ((a.size || 1) === 1) a.data[v] = val;
          else for (let c = 0; c < a.size; c++) a.data[v * a.size + c] = val[c];
        }
        v++;
      }
    }
  }
  const index = [];
  let base = 0;
  for (const pl of first) {
    const m = pl.length;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < m - 1; q++) {
        const a = r * vertsPerRow + base + q;
        const b = a + 1;
        const c = a + vertsPerRow;
        const d = c + 1;
        index.push(a, b, c, b, d, c);
      }
    }
    base += m;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aIdx', new THREE.BufferAttribute(aIdx, 1));
  for (const a of attrs) g.setAttribute(a.name, new THREE.BufferAttribute(a.data, a.size || 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function forChunks(track, i0, count, size, cb) {
  for (let k = 0; k < count; k += size) cb(i0 + k, Math.min(size, count - k));
}

/** Contiguous index ranges where predicate(i) holds (handles wrap-around). Returns [{start, count}]. */
export function ranges(track, pred) {
  const n = track.n;
  const out = [];
  let i = 0;
  // rotate start to a non-matching index so wrap-around ranges stay contiguous
  let off = 0;
  while (off < n && pred(off)) off++;
  if (off === n) return [{ start: 0, count: n }];
  let cur = null;
  for (let k = 0; k <= n; k++) {
    i = (off + k) % n;
    const ok = k < n && pred(i);
    if (ok && !cur) cur = { start: off + k, count: 0 };
    if (ok) cur.count++;
    if (!ok && cur) {
      out.push({ start: cur.start % n, count: cur.count });
      cur = null;
    }
  }
  return out;
}

/** Curvature-driven weight in [0, 1] for corner curbs. */
function curbWeights(track) {
  const n = track.n;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.abs(track.kappa[i]) > 1 / 160 ? 1 : 0;
  const out = new Float32Array(n);
  const R = 8;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = -R; k <= R; k++) m = Math.max(m, raw[(i + k + n) % n]);
    out[i] = m;
  }
  return out;
}

/**
 * Builds the core track surfaces: road, barriers, neon strips, skirts, tunnels, pillars.
 * style: { road: {...material opts}, wall: {...}, neon: [{d, h, color, ...}], tunnel: {...}, skirt, pillars }
 */
export function buildTrackSurfaces(track, style, baker, group) {
  const W = track.halfWidth;
  const n = track.n;
  const wallIn = W + 0.6;
  const wallOut = W + 1.2;
  const wallH = style.wall?.height ?? 1.15;
  const groundY = style.groundY ?? track.bounds.minY - 1;
  const meshes = { road: [], walls: [], neon: [], tunnels: [] };

  // ---- Tunnel interior lighting, registered before the road and barriers are baked: bright,
  // even light that pulses gently under each pair of luminaires
  if (style.tunnel) {
    const ts = style.tunnel;
    const sp = ts.material?.spacing ?? 4.5;
    const lampC = new THREE.Color(ts.material?.lamp ?? 0xffe0b0);
    const ambC = new THREE.Color(ts.ambient ?? 0x2a2620);
    const lampI = ts.light ?? 0.75;
    const apex = ts.apex ?? 6.8;
    baker.addZone((i, x, y, z, out) => {
      if (!track.tunnelFlags[i]) return;
      const ph = ((i * track.ds) % sp) / sp;
      const f = (0.7 + 0.3 * Math.cos(ph * Math.PI * 2)) * lampI;
      out[0] += lampC.r * f + ambC.r;
      out[1] += lampC.g * f + ambC.g;
      out[2] += lampC.b * f + ambC.b;
    });
    // the same luminaires as real lights for the cars (not baked: the zone covers the road)
    const lumStep = Math.max(1, Math.round(sp / track.ds));
    for (const rg of ranges(track, (i) => track.tunnelFlags[i] === 1)) {
      for (let k = 0; k < rg.count; k += lumStep) {
        const i = (rg.start + k) % n;
        const h = apex - 0.35;
        baker.addDynamic(track.px[i] + track.ux[i] * h, track.py[i] + track.uy[i] * h, track.pz[i] + track.uz[i] * h, lampC, lampI * 0.9, 10, i);
      }
    }
  }

  // ---- Road
  const roadMat = createRoadMaterial({ halfWidth: W, length: track.length, ...style.road });
  const curbs = style.road?.curbs ? curbWeights(track) : null;
  const cols = [-W - 1.3, -W - 0.6, -W, -W * 0.72, -W * 0.45, -W * 0.2, 0, W * 0.2, W * 0.45, W * 0.72, W, W + 0.6, W + 1.3];
  const roadProfile = [cols.map((d) => [d, 0, (d + W) / (2 * W)])];
  forChunks(track, 0, n, CHUNK, (i0, rows) => {
    const g = sweep(track, i0, rows, roadProfile, {
      attrs: [{ name: 'aCurb', fn: (r, i) => (curbs ? curbs[i] : 0) }],
    });
    baker.bake(g);
    const m = new THREE.Mesh(g, roadMat);
    m.name = 'road';
    group.add(m);
    meshes.road.push(m);
  });

  // ---- Barriers (+ skirts down to the ground or a fixed deck depth)
  const wallMat = createLitMaterial({
    albedo: style.wall?.albedo ?? 0x1a1a24,
    brightness: style.wall?.brightness ?? 3.2,
    stripes: style.wall?.stripes ?? 0,
    stripeColor: style.wall?.stripeColor ?? 0xff2a2a,
    joints: style.wall?.joints ?? 6,
  });
  const skirt = style.skirt ?? 'ground';
  const skirtBottom = skirt === 'ground' ? 'ground' : -skirt;
  // F-shape profile: the road-side face slopes back from its foot, the outer face leans in a little
  const face = (h) => wallIn + barrierFaceOffset(h, wallH);
  const topIn = face(wallH);
  const topOut = wallOut - 0.1;
  const wallPolys = [
    // left wall: outer face, top, road-side face
    [[-wallOut, 0], [-topOut, wallH]],
    [[-topOut, wallH], [-topIn, wallH]],
    [[-topIn, wallH], [-face(0.3), 0.3], [-face(0.075), 0.075], [-wallIn, 0]],
    // right wall: road-side face, top, outer face
    [[wallIn, 0], [face(0.075), 0.075], [face(0.3), 0.3], [topIn, wallH]],
    [[topIn, wallH], [topOut, wallH]],
    [[topOut, wallH], [wallOut, 0]],
    // skirts
    [[-W - 1.3, skirtBottom], [-W - 1.3, 0]],
    [[W + 1.3, 0], [W + 1.3, skirtBottom]],
  ];
  forChunks(track, 0, n, CHUNK, (i0, rows) => {
    const g = sweep(track, i0, rows, wallPolys, { groundY });
    baker.bake(g);
    const m = new THREE.Mesh(g, wallMat);
    m.name = 'walls';
    group.add(m);
    meshes.walls.push(m);
  });

  // ---- Neon strips
  if (style.neon && style.neon.length) {
    const neonMat = createNeonMaterial({
      intensity: style.neonIntensity ?? 3.2,
      pulse: style.neonPulse ?? 0,
      pulseSpeed: style.neonPulseSpeed ?? 110,
      pulseSpacing: style.neonPulseSpacing ?? 70,
      dash: style.neonDash ?? 0,
      color: 0xffffff,
    });
    const polys = [];
    const colors = [];
    for (const s of style.neon) {
      const side = Math.sign(s.d);
      const d = s.d;
      const h = s.h;
      const w = s.w ?? 0.12;
      // a thin vertical band facing the road plus a lip
      polys.push([[d, h - w], [d, h], [d - side * 0.18, h]]);
      colors.push(new THREE.Color(s.color));
    }
    forChunks(track, 0, n, CHUNK, (i0, rows) => {
      const g = sweep(track, i0, rows, polys, {
        attrs: [
          {
            name: 'aColor',
            size: 3,
            fn: (r, i, s, p) => [colors[p].r, colors[p].g, colors[p].b],
          },
        ],
      });
      const m = new THREE.Mesh(g, neonMat);
      m.name = 'neon';
      group.add(m);
      meshes.neon.push(m);
    });
    meshes.neonMat = neonMat;
  }

  // ---- Tunnels
  if (style.tunnel) {
    const ts = style.tunnel;
    const TW = W + 1.3;
    const wallTop = ts.wallHeight ?? 4.6;
    const apex = ts.apex ?? 6.8;
    const prof = [];
    prof.push([TW, 0]);
    prof.push([TW, wallTop * 0.5]);
    prof.push([TW, wallTop]);
    const steps = 14;
    for (let k = 1; k < steps; k++) {
      const a = (k / steps) * Math.PI;
      prof.push([TW * Math.cos(a), wallTop + (apex - wallTop) * Math.sin(a)]);
    }
    prof.push([-TW, wallTop]);
    prof.push([-TW, wallTop * 0.5]);
    prof.push([-TW, 0]);
    // u coordinate along the profile
    let total = 0;
    const lens = [0];
    for (let k = 1; k < prof.length; k++) {
      total += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]);
      lens.push(total);
    }
    const tunnelProfile = [prof.map((p, k) => [p[0], p[1], lens[k] / total])];
    const wallU = lens[2] / total; // profile index 2 = top of the right wall
    const tunnelMat = createTunnelMaterial({ ...(ts.material || {}), wallU });
    const rgs = ranges(track, (i) => track.tunnelFlags[i] === 1);
    for (const rg of rgs) {
      forChunks(track, rg.start, rg.count, CHUNK, (i0, rows) => {
        const g = sweep(track, i0, Math.max(1, rows), tunnelProfile);
        const m = new THREE.Mesh(g, tunnelMat);
        m.name = 'tunnel';
        group.add(m);
        meshes.tunnels.push(m);
      });
      // Portals at both ends
      for (const [iEdge, dir] of [
        [rg.start, -1],
        [(rg.start + rg.count) % n, 1],
      ]) {
        group.add(buildPortal(track, iEdge, dir, prof, ts));
      }
    }
    meshes.tunnelMat = tunnelMat;
    meshes.tunnelRanges = rgs;

  }

  return meshes;
}

function buildPortal(track, i, dir, prof, ts) {
  // A flat frame around the tunnel mouth plus a glowing outline.
  const outer = prof.map(([d, h]) => {
    const len = Math.hypot(d, h - 2) || 1;
    return [d + (d / len) * 1.6, h + ((h - 2) / len) * 1.6];
  });
  const f = track.frameAt(i * track.ds, {});
  const P = new THREE.Vector3(f.px, f.py, f.pz);
  const R = new THREE.Vector3(f.rx, f.ry, f.rz);
  const U = new THREE.Vector3(f.ux, f.uy, f.uz);
  const T = new THREE.Vector3(f.tx, f.ty, f.tz);
  const pos = [];
  const idx = [];
  const depth = 1.4;
  const pt = (d, h, off) => P.clone().addScaledVector(R, d).addScaledVector(U, h).addScaledVector(T, off);
  const m = prof.length;
  for (let k = 0; k < m; k++) {
    const a = pt(prof[k][0], prof[k][1], 0);
    const b = pt(outer[k][0], outer[k][1], 0);
    const c = pt(outer[k][0], outer[k][1], dir * depth);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  for (let k = 0; k < m - 1; k++) {
    const a = k * 3;
    const b = (k + 1) * 3;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
    idx.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const frameMat = new THREE.MeshStandardMaterial({ color: ts.portalColor ?? 0x4a4c52, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, frameMat);
  const grp = new THREE.Group();
  grp.add(mesh);
  if (!ts.portalGlow) return grp;
  // glowing outline (tube along the inner edge)
  const pts = prof.map(([d, h]) => pt(d * 1.02, h + 0.05, dir * -0.05));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 48, 0.12, 6, false);
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ts.portalGlow ?? 0x00e5ff).multiplyScalar(4) });
  grp.add(new THREE.Mesh(tube, glowMat));
  const pts2 = outer.map(([d, h]) => pt(d, h, 0));
  const tube2 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 48, 0.1, 6, false);
  const glow2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(ts.portalGlow2 ?? 0xff2bd6).multiplyScalar(3) });
  grp.add(new THREE.Mesh(tube2, glow2));
  return grp;
}

/** Support piers under elevated parts of the road: round column, tapered hammerhead cap. */
export function buildPillars(track, groundY, opts = {}) {
  const spacing = opts.spacing ?? 36;
  const step = Math.round(spacing / track.ds);
  const items = [];
  for (let i = 0; i < track.n; i += step) {
    const h = track.py[i] - 1.6 - groundY;
    if (h < (opts.minHeight ?? 3)) continue;
    items.push({ i, h });
  }
  if (!items.length) return null;
  const W = track.halfWidth;
  // unit-height column (scaled per pier) and a fixed-size cap, both instanced
  const col = new THREE.CylinderGeometry(1.15, 1.3, 1, 20);
  col.translate(0, -0.5, 0);
  const capW = W * 2 + 2.6;
  const shape = new THREE.Shape([
    new THREE.Vector2(-1.4, -2.4),
    new THREE.Vector2(1.4, -2.4),
    new THREE.Vector2(capW / 2, -0.6),
    new THREE.Vector2(capW / 2, 0),
    new THREE.Vector2(-capW / 2, 0),
    new THREE.Vector2(-capW / 2, -0.6),
  ]);
  const cap = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
  cap.translate(0, 0, -1.2);
  const mat = new THREE.MeshStandardMaterial({ color: opts.color ?? 0x55575d, roughness: 0.9, metalness: 0.05 });
  const cols = new THREE.InstancedMesh(col, mat, items.length);
  const caps = new THREE.InstancedMesh(cap, mat, items.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  items.forEach((it, k) => {
    const i = it.i;
    // cap spans across the road (local X), the road runs along local Z
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), track.heading[i]);
    p.set(track.px[i], track.py[i] - 1.4, track.pz[i]);
    m4.compose(p, q, sc.set(1, 1, 1));
    caps.setMatrixAt(k, m4);
    p.set(track.px[i], track.py[i] - 1.4 - 2.3, track.pz[i]);
    m4.compose(p, q, sc.set(1, Math.max(1, it.h - 2.3), 1));
    cols.setMatrixAt(k, m4);
  });
  cols.computeBoundingSphere();
  caps.computeBoundingSphere();
  const g = new THREE.Group();
  g.add(cols, caps);
  return g;
}

/** Glowing chevron pads that boost the car. */
export function buildBoostPads(track) {
  if (!track.boostPads.length) return null;
  const group = new THREE.Group();
  const mat = additive(
    new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          // vUv.x across (0..1), vUv.y = metres along
          float x = abs(vUv.x - 0.5) * 2.0;
          float y = vUv.y / 2.2 - uTime * 3.0;
          float chev = fract(y - x * 0.55);
          float a = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.35, 0.45, chev));
          float border = smoothstep(0.86, 0.95, x);
          vec3 c = vec3(1.9, 1.05, 0.25);
          float alpha = (a * 0.75 + border * 0.45) * smoothstep(1.0, 0.92, x);
          gl_FragColor = vec4(c, alpha);
        }`,
    }),
  );
  mat.side = THREE.DoubleSide;
  for (const bp of track.boostPads) {
    const i0 = Math.floor(bp.s0 / track.ds);
    const rows = Math.max(2, Math.round(bp.len / track.ds));
    const g = sweep(track, i0, rows, [[[bp.d - bp.halfWidth, 0.04, 0], [bp.d + bp.halfWidth, 0.04, 1]]]);
    // re-base v to start at 0 for each pad
    const uv = g.attributes.uv;
    const v0 = uv.getY(0);
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) - v0);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2;
    group.add(m);
  }
  return group;
}

/** Jump ramps: a lit wedge with glowing chevrons. */
export function buildRamps(track, baker) {
  if (!track.ramps.length) return null;
  const group = new THREE.Group();
  const mat = createLitMaterial({ albedo: 0x2a2a38, brightness: 3.0, stripes: 1, stripeColor: 0xffb000 });
  for (const rp of track.ramps) {
    const i0 = Math.floor(rp.s0 / track.ds);
    const rows = Math.max(4, Math.round(rp.len / track.ds));
    const hAt = (r) => rp.height * Math.pow(Math.min(1, (r * track.ds) / rp.len), 1.6);
    const g = sweep(track, i0, rows, (r) => [
      [[rp.d - rp.halfWidth, hAt(r) + 0.02], [rp.d + rp.halfWidth, hAt(r) + 0.02]],
      [[rp.d - rp.halfWidth, 0], [rp.d - rp.halfWidth, hAt(r) + 0.02]],
      [[rp.d + rp.halfWidth, hAt(r) + 0.02], [rp.d + rp.halfWidth, 0]],
    ]);
    baker.bake(g);
    group.add(new THREE.Mesh(g, mat));
    // front face (drop-off) - visible when looking back
    const f = track.frameAt(rp.s0 + rows * track.ds, {});
    const face = new THREE.PlaneGeometry(rp.halfWidth * 2, rp.height);
    const fm = new THREE.Mesh(face, new THREE.MeshBasicMaterial({ color: 0x07070c, side: THREE.DoubleSide }));
    fm.position.set(f.px + f.rx * rp.d + f.ux * rp.height * 0.5, f.py + f.ry * rp.d + f.uy * rp.height * 0.5, f.pz + f.rz * rp.d + f.uz * rp.height * 0.5);
    fm.lookAt(fm.position.x + f.tx, fm.position.y + f.ty, fm.position.z + f.tz);
    group.add(fm);
    // glow edges
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa000).multiplyScalar(2.2) });
    for (const side of [-1, 1]) {
      const pts = [];
      for (let r = 0; r <= rows; r++) {
        const fr = track.frameAt(rp.s0 + r * track.ds, {});
        const d = rp.d + side * rp.halfWidth;
        const h = hAt(r) + 0.08;
        pts.push(new THREE.Vector3(fr.px + fr.rx * d + fr.ux * h, fr.py + fr.ry * d + fr.uy * h, fr.pz + fr.rz * d + fr.uz * h));
      }
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), rows, 0.1, 5, false), edgeMat));
    }
  }
  return group;
}

/** Start / finish gantry with a checkered banner and start lights. */
export function buildStartGantry(track, palette) {
  const group = new THREE.Group();
  const f = track.frameAt(0, {});
  const W = track.halfWidth;
  const P = new THREE.Vector3(f.px, f.py, f.pz);
  const R = new THREE.Vector3(f.rx, f.ry, f.rz);
  const U = new THREE.Vector3(0, 1, 0);
  const T = new THREE.Vector3(f.tx, 0, f.tz).normalize();
  const H = 8.5;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1c28, metalness: 0.7, roughness: 0.35 });
  const legGeo = new THREE.BoxGeometry(1.1, H, 1.1);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.copy(P).addScaledVector(R, side * (W + 2.4)).addScaledVector(U, H / 2);
    group.add(leg);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, H - 0.6, 0.15),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.secondary).multiplyScalar(1.6) }),
    );
    strip.position.copy(leg.position).addScaledVector(R, -side * 0.6);
    group.add(strip);
  }
  // banner with canvas texture
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#06060c';
  ctx.fillRect(0, 0, 1024, 128);
  for (let x = 0; x < 1024; x += 32) {
    for (let y = 0; y < 128; y += 32) {
      if (((x + y) / 32) % 2 === 0 && (x < 256 || x >= 768)) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 32, 32);
      }
    }
  }
  ctx.font = 'bold 72px Orbitron, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,255,255,0.4)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('FINISH', 512, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const bannerW = W * 2 + 4.8;
  const bannerMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.15, 1.15, 1.15), side: THREE.DoubleSide });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerW / 8), bannerMat);
  banner.position.copy(P).addScaledVector(U, H - 0.9);
  banner.lookAt(banner.position.clone().sub(T));
  group.add(banner);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(bannerW + 1.2, 0.6, 1.2), legMat);
  beam.position.copy(P).addScaledVector(U, H + 0.1);
  beam.lookAt(beam.position.clone().add(T));
  group.add(beam);
  // light bar under the beam
  const bar = new THREE.Mesh(new THREE.BoxGeometry(bannerW, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 2.0) }));
  bar.position.copy(P).addScaledVector(U, H - 0.25 - bannerW / 16 - 0.9 + 0.5);
  bar.lookAt(bar.position.clone().add(T));
  group.add(bar);

  // start lights facing the grid: five columns of red lamps that fill up during the countdown and
  // go out at the start, with a row of green lamps that flash on GO
  const panelY = H - 0.9 - bannerW / 16 - 1.15;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.85, 0.5), new THREE.MeshStandardMaterial({ color: 0x0b0c10, metalness: 0.4, roughness: 0.6 }));
  housing.position.copy(P).addScaledVector(U, panelY);
  housing.lookAt(housing.position.clone().sub(T));
  group.add(housing);
  for (const sx of [-2.2, 2.2]) {
    const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.12, H - panelY - 0.6, 0.12), legMat);
    hanger.position.copy(P).addScaledVector(U, (H + panelY) / 2).addScaledVector(R, sx);
    group.add(hanger);
  }
  const lamps = [];
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 2; r++) {
      const g = new THREE.CircleGeometry(0.3, 24);
      g.translate((c - 2) * 1.35, r ? 0.4 : -0.4, 0.27);
      const n = g.attributes.position.count;
      g.setAttribute('aLamp', new THREE.BufferAttribute(new Float32Array(n * 2).map((_, k) => (k % 2 ? r : c)), 2));
      lamps.push(g);
    }
  }
  const lampGeo = mergeGeometries(lamps.map((g) => (g.deleteAttribute('uv'), g.toNonIndexed())));
  const uniforms = { uLit: { value: 0 }, uGreen: { value: 0 } };
  const lampMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec2 aLamp;
      varying vec2 vLamp;
      void main() { vLamp = aLamp; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uLit;
      uniform float uGreen;
      varying vec2 vLamp;
      void main() {
        vec3 c;
        if (vLamp.y < 0.5) c = vLamp.x < uLit - 0.5 ? vec3(6.0, 0.25, 0.15) : vec3(0.08, 0.005, 0.005);
        else c = mix(vec3(0.004, 0.03, 0.01), vec3(0.3, 6.0, 0.8), uGreen);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const lampMesh = new THREE.Mesh(lampGeo, lampMat);
  lampMesh.position.copy(housing.position);
  lampMesh.quaternion.copy(housing.quaternion);
  group.add(lampMesh);
  group.userData.startLights = uniforms;
  return group;
}
