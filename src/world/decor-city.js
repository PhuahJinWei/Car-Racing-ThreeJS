import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { globalUniforms, createLitMaterial } from './materials.js';
import { createBuildingMaterial } from './buildings.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

const SIGN_WORDS_H = ['NEON', 'HOTEL', 'RAMEN', 'ARCADE', 'CYBER', 'SUSHI', 'CLUB', '24H', 'KARAOKE', 'MOTEL', 'DINER', 'LIVE', 'VOLT', 'NOODLE', 'DRIVE', 'GAMES'];
const SIGN_WORDS_V = ['BAR', 'CAFE', 'ネオン', 'OPEN', 'TAXI', 'ラーメン', 'RAVE', 'NIGHT', 'ZONE', 'カラオケ', 'TECH', 'PIZZA', 'SHOP', 'HOTEL', 'BAR', 'GYM'];
const NEONS = ['#ff2bd6', '#00e5ff', '#7dff3a', '#ffb000', '#ff3d5a', '#8a5cff', '#00ffa3', '#ff7a2a'];

let atlasCache = null;
/** Canvas atlas with glowing neon signs. Top half: 16 horizontal, bottom half: 16 vertical. */
export function getSignAtlas() {
  if (atlasCache) return atlasCache;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 1024);
  const cells = [];
  const drawCell = (x, y, w, h, word, color, vertical) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#05040a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 22;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!vertical) {
      const size = Math.min(70, (w - 30) / (word.length * 0.62));
      ctx.font = `900 ${size}px Orbitron, "Arial Black", sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(word, x + w / 2, y + h / 2 + 2);
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(word, x + w / 2, y + h / 2 + 2);
    } else {
      const chars = [...word];
      const size = Math.min(54, (h - 30) / chars.length);
      ctx.font = `900 ${size}px Orbitron, "Arial Black", "Yu Gothic", "Hiragino Sans", sans-serif`;
      chars.forEach((ch, k) => {
        const cy = y + h / 2 + (k - (chars.length - 1) / 2) * size * 1.05;
        ctx.fillStyle = color;
        ctx.fillText(ch, x + w / 2, cy);
        ctx.shadowBlur = 5;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(ch, x + w / 2, cy);
        ctx.shadowBlur = 22;
      });
    }
    ctx.restore();
  };
  for (let k = 0; k < 16; k++) {
    const col = k % 4;
    const row = Math.floor(k / 4);
    const color = NEONS[k % NEONS.length];
    drawCell(col * 256, row * 128, 256, 128, SIGN_WORDS_H[k], color, false);
    cells.push({ u: (col * 256) / 1024, v: (row * 128) / 1024, w: 0.25, h: 0.125, color, vertical: false });
  }
  for (let k = 0; k < 16; k++) {
    const col = k % 8;
    const row = Math.floor(k / 8);
    const color = NEONS[(k * 3 + 1) % NEONS.length];
    drawCell(col * 128, 512 + row * 256, 128, 256, SIGN_WORDS_V[k], color, true);
    cells.push({ u: (col * 128) / 1024, v: (512 + row * 256) / 1024, w: 0.125, h: 0.25, color, vertical: true });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  atlasCache = { tex, cells };
  return atlasCache;
}

export function createSignMaterial() {
  const { tex } = getSignAtlas();
  return new THREE.ShaderMaterial({
    uniforms: {
      tAtlas: { value: tex },
      uTime: globalUniforms.uTime,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uIntensity: { value: 1.5 },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aUV;
      attribute float aSeed;
      varying vec2 vUv;
      varying vec4 vAtlas;
      varying float vSeed;
      varying float vFogDepth;
      void main() {
        vUv = uv;
        vAtlas = aUV;
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tAtlas;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec4 vAtlas;
      varying float vSeed;
      varying float vFogDepth;
      float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
      void main() {
        vec2 luv = vUv;
        if (!gl_FrontFacing) luv.x = 1.0 - luv.x;
        vec3 c = texture2D(tAtlas, vAtlas.xy + vec2(luv.x, 1.0 - luv.y) * vAtlas.zw).rgb;
        float flick = 1.0;
        if (vSeed > 0.85) flick = step(0.12, h11(floor(uTime * 14.0) + vSeed * 100.0)) * 0.85 + 0.15;
        vec3 col = c * c * uIntensity * 2.2 * flick + c * 0.15;
        float d = uFogDensity * 0.55 * vFogDepth;
        col = mix(col, uFogColor, 1.0 - exp(-d * d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/**
 * Downtown blocks: instanced buildings with procedural windows, neon signs (facade + blade signs),
 * and a few overpasses. Lights from signs are baked onto the road.
 * opts.groundY: build up from a fixed ground far below (elevated expressway) instead of road level;
 * heights are then measured from the road (rows' hMin/hMax may be negative = roofs below the road).
 * opts.rows: custom row layout; opts.signs / opts.shops: street-level dressing on or off.
 */
export function buildCity(track, baker, palette, rand, opts = {}) {
  const W = track.halfWidth;
  const density = opts.density ?? 1;
  const fixedGround = opts.groundY ?? null;
  const groundOf = (i) => (fixedGround === null ? track.py[i] - 1.2 : fixedGround);
  const placed = [];
  const buildings = [];
  const filter = opts.filter ?? (() => true);

  const rows = (
    opts.rows || [
      { setback: 6, dMin: 12, dMax: 22, hMin: 10, hMax: 46, gap: [1, 5] },
      { setback: 32, dMin: 16, dMax: 30, hMin: 28, hMax: 120, gap: [3, 10] },
      { setback: 70, dMin: 20, dMax: 40, hMin: 50, hMax: 190, gap: [6, 20] },
    ]
  ).slice(0, density > 0.8 ? 3 : 2);

  const fits = (cx, cz, hw, hd, yaw, clearance) => {
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    // corners + edge midpoints
    const pts = [
      [0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd], [hw, 0], [-hw, 0], [0, hd], [0, -hd],
    ];
    for (const [a, b] of pts) {
      // local x along track (forward), local z lateral
      const x = cx + sn * a + cs * b;
      const z = cz + cs * a - sn * b;
      if (track.nearestDistance(x, z, clearance + 10).dist < clearance) return false;
    }
    const r = Math.hypot(hw, hd);
    for (const p of placed) {
      const dx = p.x - cx;
      const dz = p.z - cz;
      if (dx * dx + dz * dz < (p.r + r) * (p.r + r) * 0.55) return false;
    }
    return true;
  };

  for (const side of [-1, 1]) {
    for (const row of rows) {
      let s = rand() * 15;
      while (s < track.length) {
        const width = 12 + rand() * 20;
        const depth = row.dMin + rand() * (row.dMax - row.dMin);
        const i = Math.floor((s + width / 2) / track.ds) % track.n;
        s += width + row.gap[0] + rand() * (row.gap[1] - row.gap[0]);
        if (!filter(i)) continue;
        const rx = track.rx[i];
        const rz = track.rz[i];
        const rl = Math.hypot(rx, rz) || 1;
        const off = side * (W + 1.3 + row.setback + depth / 2);
        const cx = track.px[i] + (rx / rl) * off;
        const cz = track.pz[i] + (rz / rl) * off;
        const yaw = track.heading[i];
        if (!fits(cx, cz, width / 2, depth / 2, yaw, W + 4.5)) continue;
        let h = row.hMin + Math.pow(rand(), 1.6) * (row.hMax - row.hMin);
        if (rand() < 0.08) h *= 1.6;
        // with a fixed ground far below, heights are relative to the road: stand up from the ground
        if (fixedGround !== null) h = Math.max(12, track.py[i] - fixedGround + h);
        placed.push({ x: cx, z: cz, r: Math.hypot(width, depth) / 2 });
        buildings.push({ x: cx, z: cz, y: groundOf(i), w: width, d: depth, h, yaw, side, i, row: rows.indexOf(row) });
      }
    }
  }

  // ---- Buildings: podium + inset tower (+ crown) blocks, rooftop service boxes
  const group = new THREE.Group();
  const blocks = [];
  for (const b of buildings) {
    // reference for "street level" (shop fronts, the warm wash of street lights on the walls)
    const road = fixedGround === null ? track.py[b.i] : fixedGround + 1.2;
    const seed = rand() * 100;
    const style = b.h > 70 && rand() < 0.6 ? 1 : rand() < 0.5 ? 0.5 : 0;
    const litFrac = style === 0 ? 0.15 + rand() * 0.25 : style === 0.5 ? 0.18 + rand() * 0.35 : 0.1 + rand() * 0.25;
    const crownHue = rand();
    const shops = opts.shops !== false && b.row === 0 && rand() < 0.8 ? 1 : 0;
    const top = b.y + b.h;
    // local frame: x = depth (away from the road), z = width (along the road)
    const cs = Math.cos(b.yaw);
    const sn = Math.sin(b.yaw);
    const at = (lx, lz) => [b.x + cs * lx + sn * lz, b.z - sn * lx + cs * lz];
    const add = (lx, lz, sx, sz, y0, y1, kind) => {
      const [x, z] = at(lx, lz);
      blocks.push({ x, z, y: y0, sx, sz, h: y1 - y0, yaw: b.yaw, seed, litFrac, style: kind ? 0 : style, top: y1 - road, base: y0 - road, kind, crownHue, shops: y0 - road < 0.5 ? shops : 0 });
    };
    let roof = { lx: 0, lz: 0, sx: b.d, sz: b.w, y: top };
    b.signMax = b.h;
    if (b.h > 40 && rand() < 0.65) {
      const podTop = b.y + 1.2 + 6 + rand() * 10;
      add(0, 0, b.d, b.w, b.y, podTop, 0);
      b.signMax = podTop - b.y;
      const inX = 1.5 + rand() * 3;
      const inZ = 1.5 + rand() * 3;
      const tsx = Math.max(8, b.d - inX * 2);
      const tsz = Math.max(8, b.w - inZ * 2);
      const back = 0; // towers sit centred on their podium
      if (b.h > 110 && rand() < 0.5) {
        const crownBase = top - b.h * (0.12 + rand() * 0.1);
        add(back, 0, tsx, tsz, podTop, crownBase, 0);
        const csx = Math.max(6, tsx - 4 - rand() * 4);
        const csz = Math.max(6, tsz - 4 - rand() * 4);
        add(back, 0, csx, csz, crownBase, top, 0);
        roof = { lx: back, lz: 0, sx: csx, sz: csz, y: top };
      } else {
        add(back, 0, tsx, tsz, podTop, top, 0);
        roof = { lx: back, lz: 0, sx: tsx, sz: tsz, y: top };
      }
    } else {
      add(0, 0, b.d, b.w, b.y, top, 0);
    }
    // rooftop service boxes (lift rooms, plant) on most roofs
    const nBox = rand() < 0.75 ? 1 + Math.floor(rand() * 2.5) : 0;
    for (let k = 0; k < nBox; k++) {
      const sx = Math.min(roof.sx - 2, 2.5 + rand() * 4);
      const sz = Math.min(roof.sz - 2, 2.5 + rand() * 5);
      if (sx < 1.5 || sz < 1.5) continue;
      const lx = roof.lx + (rand() - 0.5) * Math.max(0, roof.sx - sx - 2);
      const lz = roof.lz + (rand() - 0.5) * Math.max(0, roof.sz - sz - 2);
      add(lx, lz, sx, sz, roof.y, roof.y + 2.4 + rand() * 1.8, 1);
    }
  }
  if (blocks.length) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const params = new Float32Array(blocks.length * 4);
    const params2 = new Float32Array(blocks.length * 4);
    geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
    geo.setAttribute('aParams2', new THREE.InstancedBufferAttribute(params2, 4));
    const mat = createBuildingMaterial({ street: palette.lamp ?? '#ffb26b' });
    const mesh = new THREE.InstancedMesh(geo, mat, blocks.length);
    blocks.forEach((k, n) => {
      _q.setFromAxisAngle(_y, k.yaw);
      _p.set(k.x, k.y, k.z);
      _m.compose(_p, _q, _s.set(k.sx, k.h, k.sz));
      mesh.setMatrixAt(n, _m);
      params.set([k.seed, k.litFrac, k.style, k.top], n * 4);
      params2.set([k.base, k.kind, k.crownHue, k.shops], n * 4);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // ---- Neon signs
  const atlas = getSignAtlas();
  const signs = [];
  for (const b of opts.signs === false ? [] : buildings) {
    if (b.row > 1) continue;
    const rx = track.rx[b.i];
    const rz = track.rz[b.i];
    const rl = Math.hypot(rx, rz) || 1;
    const inX = (-b.side * rx) / rl;
    const inZ = (-b.side * rz) / rl;
    const fx = track.tx[b.i];
    const fz = track.tz[b.i];
    const fl = Math.hypot(fx, fz) || 1;
    // facade sign
    if (rand() < (b.row === 0 ? 0.32 : 0.08)) {
      const vertical = rand() < 0.4;
      const cell = vertical ? 16 + Math.floor(rand() * 16) : Math.floor(rand() * 16);
      const sw = vertical ? 2.6 + rand() * 1.2 : 7 + rand() * 6;
      const sh = vertical ? sw * 2 : sw / 2;
      if (sh + 5 > b.signMax) continue;
      const y = b.y + 4.8 + rand() * Math.max(0, Math.min(b.signMax - sh - 5.5, 9));
      const along = (rand() - 0.5) * Math.max(0, b.w - sw - 2);
      const x = b.x + inX * (b.d / 2 + 0.15) + (fx / fl) * along;
      const z = b.z + inZ * (b.d / 2 + 0.15) + (fz / fl) * along;
      signs.push({ x, y: y + sh / 2, z, w: sw, h: sh, fx: inX, fz: inZ, cell });
      const c = atlas.cells[cell].color;
      baker.addPoint(x + inX * 3, y + sh / 2, z + inZ * 3, c, 0.3, 22, b.i);
    }
    // blade sign sticking out over the sidewalk (faces traffic)
    if (b.row === 0 && b.signMax > 15 && rand() < 0.22) {
      const cell = 16 + Math.floor(rand() * 16);
      const sw = 2.2;
      const sh = 5 + rand() * 3;
      const y = b.y + 6 + rand() * 6;
      const x = b.x + inX * (b.d / 2 + 1.6);
      const z = b.z + inZ * (b.d / 2 + 1.6);
      signs.push({ x, y: y + sh / 2, z, w: sw, h: sh, fx: -fx / fl, fz: -fz / fl, cell });
      baker.addPoint(x, y + sh / 2, z, atlas.cells[cell].color, 0.25, 16, b.i);
    }
  }
  if (signs.length) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const uvs = new Float32Array(signs.length * 4);
    const seeds = new Float32Array(signs.length);
    geo.setAttribute('aUV', new THREE.InstancedBufferAttribute(uvs, 4));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const mesh = new THREE.InstancedMesh(geo, createSignMaterial(), signs.length);
    signs.forEach((sg, n) => {
      _q.setFromAxisAngle(_y, Math.atan2(sg.fx, sg.fz));
      _p.set(sg.x, sg.y, sg.z);
      _s.set(sg.w, sg.h, 1);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(n, _m);
      const cell = atlas.cells[sg.cell];
      uvs[n * 4] = cell.u;
      uvs[n * 4 + 1] = cell.v;
      uvs[n * 4 + 2] = cell.w;
      uvs[n * 4 + 3] = cell.h;
      seeds[n] = rand();
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // ---- Overpasses: concrete bridge with edge girders, parapets and a steel handrail, twin round
  // columns under a crosshead on each side, soffit lights. Baked light once the lamps exist.
  if (opts.overpasses) {
    const concrete = [];
    const soffitAll = [];
    const span = W * 2 + 34;
    let count = 0;
    for (let i = 40; i < track.n && count < opts.overpasses; i += Math.floor(track.n / (opts.overpasses + 1))) {
      // find a straight-ish spot
      let j = i;
      while (j < track.n - 1 && (Math.abs(track.kappa[j]) > 0.004 || track.tunnelFlags[j])) j++;
      if (j >= track.n - 1) break;
      count++;
      const f = { x: track.px[j], y: track.py[j], z: track.pz[j] };
      const yaw = track.heading[j];
      const H = 9.5;
      const local = [];
      local.push(new THREE.BoxGeometry(span, 0.45, 12).translate(0, H + 0.42, 0));
      for (const sz of [-1, 1]) {
        local.push(new THREE.BoxGeometry(span, 1.5, 0.6).translate(0, H + 0.2, sz * 5.95)); // edge girder / fascia
        local.push(new THREE.BoxGeometry(span, 1.05, 0.32).translate(0, H + 1.45, sz * 6.05)); // parapet
        local.push(new THREE.BoxGeometry(span, 0.07, 0.07).translate(0, H + 2.3, sz * 6.05)); // handrail
        for (let k = -span / 2 + 0.8; k < span / 2; k += 2.4) local.push(new THREE.BoxGeometry(0.05, 0.36, 0.05).translate(k, H + 2.1, sz * 6.05));
      }
      for (const sx of [-1, 1]) {
        const cx = sx * (W + 5.5);
        local.push(new THREE.BoxGeometry(2.2, 1.3, 11.2).translate(cx, H - 0.45, 0)); // crosshead
        for (const cz of [-3.3, 3.3]) local.push(new THREE.CylinderGeometry(0.62, 0.68, H + 1.2, 18).translate(cx, (H - 1.1) / 2 - 0.6, cz));
      }
      const soffit = [];
      for (let k = -3; k <= 3; k++) for (const lz of [-3.2, 3.2]) soffit.push(new THREE.BoxGeometry(1.1, 0.06, 0.32).translate(k * (W * 0.4), H + 0.16, lz));
      const mtx = new THREE.Matrix4().compose(new THREE.Vector3(f.x, f.y, f.z), new THREE.Quaternion().setFromAxisAngle(_y, yaw), new THREE.Vector3(1, 1, 1));
      for (const g of local) {
        if (g.attributes.uv) g.deleteAttribute('uv');
        const ng = (g.index ? g.toNonIndexed() : g).applyMatrix4(mtx);
        ng.setAttribute('aIdx', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(j), 1));
        concrete.push(ng);
      }
      for (const g of soffit) soffitAll.push(g.applyMatrix4(mtx).toNonIndexed());
      baker.addPoint(f.x, f.y + H - 1.5, f.z, palette.lamp2 ?? '#ffcf8a', 0.8, 20, j);
      // the deck keeps the rain off the road underneath
      const tl = Math.hypot(track.tx[j], track.tz[j]) || 1;
      opts.cover?.addRect(f.x, f.z, track.tx[j] / tl, track.tz[j] / tl, 6, span / 2, f.y + H + 0.65);
    }
    if (concrete.length) {
      const geo = baker.deferBake(mergeGeometries(concrete));
      group.add(new THREE.Mesh(geo, createLitMaterial({ albedo: 0x85878c, brightness: 2.4 })));
      group.add(new THREE.Mesh(mergeGeometries(soffitAll), new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.lamp2 ?? '#ffcf8a').multiplyScalar(3) })));
    }
  }

  return group;
}
