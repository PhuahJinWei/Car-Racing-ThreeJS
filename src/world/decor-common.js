import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { additive, globalUniforms, createLitMaterial } from './materials.js';
import { smoothstep } from '../core/math.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

/** Matrix for an object standing at (i, d) whose local +Z faces `facing` (unit, horizontal). */
export function standingMatrix(track, i, d, lift, facingX, facingZ, scale, out = _m) {
  _p.set(track.px[i] + track.rx[i] * d, track.py[i] + track.ry[i] * d + lift, track.pz[i] + track.rz[i] * d);
  const yaw = Math.atan2(facingX, facingZ);
  _q.setFromAxisAngle(_y.set(0, 1, 0), yaw);
  if (scale) _s.copy(scale);
  else _s.set(1, 1, 1);
  return out.compose(_p, _q, _s);
}

/** Horizontal unit vector pointing from side `side` back toward the road. */
export function inwardDir(track, i, side) {
  const rx = track.rx[i];
  const rz = track.rz[i];
  const l = Math.hypot(rx, rz) || 1;
  return [(-side * rx) / l, (-side * rz) / l];
}

// ---------------------------------------------------------------------------------------
// Street lamps: tapered steel pole on a flanged base, curved outreach arm, slim LED luminaire
// with a glowing panel underneath, and a soft camera-facing halo so rows of lamps read down
// the road. Poles are tinted by the baked light around them.
// ---------------------------------------------------------------------------------------

/** Instanced metal (poles, frames) lit by a per-instance baked light sample (attribute aLight). */
export function createInstancedLitMaterial(albedo = 0x55585f, gain = 2.2) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlbedo: { value: new THREE.Color(albedo) },
      uGain: { value: gain },
      uAmbient: globalUniforms.uAmbient,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
    },
    vertexShader: /* glsl */ `
      attribute vec3 aLight;
      varying vec3 vLight;
      varying vec3 vN;
      varying float vFogDepth;
      void main() {
        vLight = aLight;
        mat4 m = modelMatrix * instanceMatrix;
        vN = normalize(mat3(m) * normal);
        vec4 mv = viewMatrix * m * vec4(position, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAlbedo;
      uniform float uGain;
      uniform vec3 uAmbient;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vLight;
      varying vec3 vN;
      varying float vFogDepth;
      void main() {
        vec3 n = normalize(vN);
        float up = clamp(n.y, 0.0, 1.0);
        float down = clamp(-n.y, 0.0, 1.0);
        vec3 light = vLight * (0.55 + 0.25 * up + 0.3 * down) + uAmbient * 0.35 + vec3(0.01, 0.012, 0.016);
        vec3 col = uAlbedo * light * uGain;
        float fd = uFogDensity * vFogDepth;
        col = mix(col, uFogColor, 1.0 - exp(-fd * fd));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Soft halo around a light source, always facing the camera (instanced, additive). */
export function createHaloMaterial(color, intensity = 0.5) {
  return additive(
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: intensity },
        uFogColor: globalUniforms.uFogColor,
        uFogDensity: globalUniforms.uFogDensity,
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFog;
        varying float vFade;
        void main() {
          vUv = uv;
          vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float size = length(instanceMatrix[0].xyz);
          vec4 mv = viewMatrix * vec4(center, 1.0);
          float dist = -mv.z;
          // fade out right underneath, grow a little with distance so far lamps still read
          vFade = smoothstep(1.5, 7.0, dist);
          mv.xy += position.xy * size * (1.0 + dist * 0.006);
          vFog = dist;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec2 vUv;
        varying float vFog;
        varying float vFade;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float a = exp(-r * r * 10.0) * 0.9 + exp(-r * 3.5) * 0.16;
          a *= 1.0 - smoothstep(0.8, 1.0, r);
          float fd = uFogDensity * 0.45 * vFog;
          gl_FragColor = vec4(uColor * a * uIntensity * vFade * exp(-fd * fd), 1.0);
        }`,
    }),
  );
}

export function buildLamps(track, baker, opts = {}) {
  const spacing = opts.spacing ?? 34;
  const H = opts.height ?? 9;
  const arm = opts.arm ?? 2.6;
  const W = track.halfWidth;
  const offset = W + (opts.offset ?? 2.0);
  const filter = opts.filter ?? (() => true);
  const step = Math.max(1, Math.round(spacing / track.ds));
  const items = [];
  let k = 0;
  for (let i = 0; i < track.n; i += step, k++) {
    if (!filter(i)) continue;
    const side = opts.bothSides ? (k % 2 === 0 ? 1 : -1) : opts.side ?? (k % 2 === 0 ? 1 : -1);
    items.push({ i, side });
    if (opts.paired) items.push({ i, side: -side });
  }
  if (!items.length) return null;

  // local frame: pole at the origin, the arm reaches toward +Z (the road)
  const pole = new THREE.CylinderGeometry(0.06, 0.1, H, 12);
  pole.translate(0, H / 2, 0);
  const flange = new THREE.CylinderGeometry(0.15, 0.18, 0.5, 12);
  flange.translate(0, 0.25, 0);
  const collar = new THREE.CylinderGeometry(0.075, 0.08, 0.3, 12);
  collar.translate(0, H - 0.12, 0);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, H - 0.3, 0), new THREE.Vector3(0, H + 0.45, arm * 0.2), new THREE.Vector3(0, H + 0.5, arm));
  const armG = new THREE.TubeGeometry(curve, 12, 0.045, 8, false);
  const tilt = (g) => {
    g.translate(0, 0, 0.32);
    g.rotateX(-0.06);
    g.translate(0, H + 0.49, arm - 0.04);
    return g;
  };
  const housing = tilt(new THREE.BoxGeometry(0.36, 0.1, 0.9));
  const parts = [pole, flange, collar, armG, housing].map((g) => {
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  });
  const poleGeo = mergeGeometries(parts);
  // LED panel under the housing (facing down)
  const panelGeo = new THREE.PlaneGeometry(0.28, 0.7);
  panelGeo.rotateX(Math.PI / 2);
  tilt(panelGeo);
  panelGeo.translate(0, -0.052, 0);
  const headLocal = new THREE.Vector3(0, H + 0.36, arm + 0.28);

  const color = new THREE.Color(opts.color ?? 0xcfe6ff);
  const lightAttr = new Float32Array(items.length * 3);
  poleGeo.setAttribute('aLight', new THREE.InstancedBufferAttribute(lightAttr, 3));
  const poles = new THREE.InstancedMesh(poleGeo, createInstancedLitMaterial(0x5d6168, 2.4), items.length);
  const panels = new THREE.InstancedMesh(panelGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(opts.headIntensity ?? 4), side: THREE.DoubleSide }), items.length);
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), createHaloMaterial(color, opts.halo ?? 0.55), items.length);
  halos.renderOrder = 3;
  const heads = [];
  const hm = new THREE.Matrix4();
  items.forEach((it, n) => {
    const [fx, fz] = inwardDir(track, it.i, it.side);
    standingMatrix(track, it.i, it.side * offset, 0, fx, fz);
    poles.setMatrixAt(n, _m);
    panels.setMatrixAt(n, _m);
    const hp = headLocal.clone().applyMatrix4(_m);
    hm.makeScale(1.7, 1.7, 1.7).setPosition(hp);
    halos.setMatrixAt(n, hm);
    heads.push({ i: it.i, px: _m.elements[12], py: _m.elements[13], pz: _m.elements[14], hx: hp.x, hy: hp.y, hz: hp.z });
    // pool of light under the lamp head, baked onto the road
    baker.addPoint(hp.x, hp.y, hp.z, color, opts.intensity ?? 1.0, opts.radius ?? 24, it.i);
  });
  // poles pick up the baked light around them (after every lamp is registered)
  const tmp = [0, 0, 0];
  heads.forEach((h, n) => {
    baker.sample(h.i, h.px, h.py + H * 0.45, h.pz, tmp);
    lightAttr.set(tmp, n * 3);
  });
  for (const m of [poles, panels, halos]) m.computeBoundingSphere();
  const g = new THREE.Group();
  g.add(poles, panels, halos);
  // where the lamp heads are (for their light on water)
  g.userData.heads = heads.map((h) => ({ x: h.hx, y: h.hy, z: h.hz }));
  return g;
}

// ---------------------------------------------------------------------------------------
// Giant light arches spanning the road (over-the-top speed cue)
// ---------------------------------------------------------------------------------------
export function buildArches(track, baker, palette, opts = {}) {
  const spacing = opts.spacing ?? 70;
  const filter = opts.filter ?? (() => true);
  const step = Math.max(1, Math.round(spacing / track.ds));
  const W = track.halfWidth;
  const R = W + (opts.margin ?? 3.2);
  const items = [];
  for (let i = 0; i < track.n; i += step) if (filter(i)) items.push(i);
  if (!items.length) return null;
  const geo = new THREE.TorusGeometry(R, opts.tube ?? 0.32, 6, 48, Math.PI);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const cols = [new THREE.Color(palette.primary), new THREE.Color(palette.secondary), new THREE.Color(palette.accent ?? '#ffffff')];
  const tmpC = new THREE.Color();
  items.forEach((i, n) => {
    _p.set(track.px[i], track.py[i], track.pz[i]);
    // local XY plane perpendicular to the track tangent, local Y = road up
    _z.set(track.tx[i], track.ty[i], track.tz[i]).normalize();
    _y.set(track.ux[i], track.uy[i], track.uz[i]).normalize();
    _x.crossVectors(_y, _z).normalize();
    _m.makeBasis(_x, _y, _z);
    _m.setPosition(_p);
    mesh.setMatrixAt(n, _m);
    const c = cols[n % cols.length];
    tmpC.copy(c).multiplyScalar(opts.intensity ?? 4.5);
    mesh.setColorAt(n, tmpC);
    // light: top + both feet
    baker.addPoint(_p.x + _y.x * R, _p.y + _y.y * R, _p.z + _y.z * R, c, opts.light ?? 0.9, R * 2.6, i);
    for (const sd of [-1, 1]) baker.addPoint(_p.x + _x.x * R * sd, _p.y + 1.5, _p.z + _x.z * R * sd, c, 0.6, 14, i);
  });
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// ---------------------------------------------------------------------------------------
// Animated chevron boards on the outside of tight corners
// ---------------------------------------------------------------------------------------
export function buildChevrons(track, palette, opts = {}) {
  const W = track.halfWidth;
  const minK = opts.minCurvature ?? 1 / 120;
  const spacing = Math.max(1, Math.round((opts.spacing ?? 9) / track.ds));
  const items = [];
  for (let i = 0; i < track.n; i += spacing) {
    const k = track.kappa[i];
    if (Math.abs(k) < minK) continue;
    if (track.tunnelFlags[i]) continue;
    items.push({ i, side: Math.sign(k) });
  }
  if (!items.length) return null;
  const geo = new THREE.PlaneGeometry(2.4, 0.9);
  const dirAttr = new THREE.InstancedBufferAttribute(new Float32Array(items.length), 1);
  geo.setAttribute('aDir', dirAttr);
  // Retro-reflective chevron boards: white arrows on a red board (or black on yellow), lit, not glowing.
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uBoard: { value: new THREE.Color(opts.board ?? '#c8141c') },
      uArrow: { value: new THREE.Color(opts.arrow ?? '#f4f4f4') },
      uIntensity: { value: opts.intensity ?? 0.9 },
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aDir;
      varying vec2 vUv;
      varying float vDir;
      varying float vFogDepth;
      varying float vFacing;
      void main() {
        vUv = uv;
        vDir = aDir;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        // retro-reflective sheeting shines back toward the viewer's headlights
        vec3 nv = normalize(mat3(modelViewMatrix * instanceMatrix) * vec3(0.0, 0.0, 1.0));
        vFacing = abs(dot(nv, normalize(-mv.xyz)));
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBoard;
      uniform vec3 uArrow;
      uniform float uIntensity;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec2 vUv;
      varying float vDir;
      varying float vFogDepth;
      varying float vFacing;
      void main() {
        vec2 uv = vUv;
        float x = (vDir > 0.0 ? uv.x : 1.0 - uv.x) * 2.0;
        float y = abs(uv.y - 0.5) * 2.0;
        float c = fract(x - y * 0.42);
        float aa = fwidth(c) * 1.5;
        float arrow = smoothstep(0.0, aa, c) * (1.0 - smoothstep(0.3 - aa, 0.3 + aa, c)) * step(y, 0.78);
        float frame = step(0.93, max(abs(uv.x - 0.5) * 2.0, y));
        vec3 col = mix(uBoard, uArrow, max(arrow, frame)) * uIntensity * (0.45 + 1.1 * pow(vFacing, 3.0));
        if (!gl_FrontFacing) col = vec3(0.02);
        float d = uFogDensity * 0.6 * vFogDepth;
        col = mix(col, uFogColor, 1.0 - exp(-d * d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  // two posts from the barrier top and a backing plate behind each board
  const postParts = [
    new THREE.BoxGeometry(0.07, 0.6, 0.07).translate(-0.85, -0.72, -0.05),
    new THREE.BoxGeometry(0.07, 0.6, 0.07).translate(0.85, -0.72, -0.05),
    new THREE.BoxGeometry(2.44, 0.94, 0.04).translate(0, 0, -0.03),
  ].map((g) => (g.deleteAttribute('uv'), g.toNonIndexed()));
  const postGeo = mergeGeometries(postParts);
  const postLight = new Float32Array(items.length * 3);
  postGeo.setAttribute('aLight', new THREE.InstancedBufferAttribute(postLight, 3));
  const posts = new THREE.InstancedMesh(postGeo, createInstancedLitMaterial(0x5a5d63, 2.2), items.length);
  items.forEach((it, n) => {
    const i = it.i;
    const side = it.side;
    const d = side * (W + 0.62);
    _p.set(
      track.px[i] + track.rx[i] * d + track.ux[i] * 1.95,
      track.py[i] + track.ry[i] * d + track.uy[i] * 1.95,
      track.pz[i] + track.rz[i] * d + track.uz[i] * 1.95,
    );
    // plane local X along travel, local Y up, normal toward the road
    _x.set(track.tx[i], 0, track.tz[i]).normalize();
    _y.set(0, 1, 0);
    _z.crossVectors(_x, _y).normalize(); // = right-ish (+R)
    if (side > 0) {
      _x.negate();
      _z.negate();
    }
    _m.makeBasis(_x, _y, _z);
    _m.setPosition(_p);
    mesh.setMatrixAt(n, _m);
    posts.setMatrixAt(n, _m);
    // arrows point the way the road turns: a left turn (board on the right) reads "<" from the road
    dirAttr.setX(n, side > 0 ? 1 : -1);
  });
  mesh.computeBoundingSphere();
  posts.computeBoundingSphere();
  const g = new THREE.Group();
  g.add(mesh, posts);
  g.userData.lightItems = items.map((it) => it.i);
  g.userData.postLight = postLight;
  g.userData.postMesh = posts;
  return g;
}

// ---------------------------------------------------------------------------------------
// Green highway sign gantries (expressway)
// ---------------------------------------------------------------------------------------
const SIGN_TEXTS = [
  ['DOWNTOWN', 'EXIT 14', 'up'],
  ['HARBOR', '2 KM', 'left'],
  ['AIRPORT', 'EXIT 9', 'up'],
  ['CITY CENTRE', '', 'right'],
  ['NORTH BRIDGE', '1 KM', 'up'],
  ['STADIUM', 'EXIT 21', 'right'],
];

function signAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 768;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 768);
  SIGN_TEXTS.forEach(([a, b, arrow], k) => {
    const x = (k % 2) * 512;
    const y = Math.floor(k / 2) * 256;
    g.fillStyle = '#0f6b3a';
    g.fillRect(x + 6, y + 6, 500, 244);
    g.strokeStyle = '#f2f2f2';
    g.lineWidth = 8;
    g.strokeRect(x + 18, y + 18, 476, 220);
    g.fillStyle = '#f4f4f4';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = 'bold 64px Arial, Helvetica, sans-serif';
    g.fillText(a, x + 44, y + 92, 340);
    g.font = 'bold 46px Arial, Helvetica, sans-serif';
    if (b) g.fillText(b, x + 44, y + 172);
    // arrow
    g.save();
    g.translate(x + 430, y + 128);
    g.rotate(arrow === 'left' ? -Math.PI / 2 : arrow === 'right' ? Math.PI / 2 : 0);
    g.beginPath();
    g.moveTo(0, -62);
    g.lineTo(38, -12);
    g.lineTo(13, -12);
    g.lineTo(13, 62);
    g.lineTo(-13, 62);
    g.lineTo(-13, -12);
    g.lineTo(-38, -12);
    g.closePath();
    g.fill();
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildSignGantries(track, baker, opts = {}) {
  const spacing = opts.spacing ?? 420;
  const filter = opts.filter ?? (() => true);
  const step = Math.max(1, Math.round(spacing / track.ds));
  const W = track.halfWidth;
  const H = 6.8;
  const items = [];
  for (let i = Math.round(step * 0.45); i < track.n - 20; i += step) {
    // find a nearby straight-ish, open spot
    let j = i;
    let tries = 0;
    while (tries++ < 60 && (!filter(j) || Math.abs(track.kappa[j]) > 1 / 500)) j = (j + 1) % track.n;
    if (tries < 60) items.push(j);
  }
  if (!items.length) return null;
  const structure = [];
  const panels = [];
  const lights = [];
  const span = W * 2 + 4.4;
  items.forEach((i, n) => {
    const P = new THREE.Vector3(track.px[i], track.py[i], track.pz[i]);
    const z = new THREE.Vector3(track.tx[i], 0, track.tz[i]).normalize();
    const y = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(P);
    structure.push(new THREE.BoxGeometry(0.45, H + 1.2, 0.45).translate(span / 2, (H + 1.2) / 2, 0));
    structure.push(new THREE.BoxGeometry(0.45, H + 1.2, 0.45).translate(-span / 2, (H + 1.2) / 2, 0));
    structure.push(new THREE.BoxGeometry(span + 0.6, 0.35, 0.35).translate(0, H + 1.6, 0));
    structure.push(new THREE.BoxGeometry(span + 0.6, 0.35, 0.35).translate(0, H - 0.2, 0));
    for (let k = -6; k <= 6; k++) structure.push(new THREE.BoxGeometry(0.08, 1.8, 0.08).rotateZ(k % 2 ? 0.55 : -0.55).translate((k / 6) * (span / 2 - 0.4), H + 0.7, 0));
    for (const g of structure.slice(-17)) {
      g.applyMatrix4(m);
      g.userData.idx = i;
    }
    // two sign panels facing oncoming traffic (normal = -T)
    const count = 2;
    for (let k = 0; k < count; k++) {
      const cell = (n * count + k) % SIGN_TEXTS.length;
      const cx = (k - (count - 1) / 2) * 6.6;
      const pg = new THREE.PlaneGeometry(6.2, 3.1);
      pg.rotateY(Math.PI);
      pg.translate(cx, H + 0.7, -0.3);
      const uv = pg.attributes.uv;
      const u0 = (cell % 2) * 0.5;
      const v0 = 1 - (Math.floor(cell / 2) + 1) / 3;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, u0 + uv.getX(q) * 0.5, v0 + uv.getY(q) / 3);
      pg.applyMatrix4(m);
      panels.push(pg);
      // little lamps that light the panel from below
      for (const lx of [-2, 0, 2]) {
        const lg = new THREE.BoxGeometry(0.35, 0.12, 0.25).translate(cx + lx, H - 0.95, -0.9);
        lg.applyMatrix4(m);
        lights.push(lg);
      }
    }
    baker.addPoint(P.x, P.y + H - 1, P.z, opts.lightColor ?? '#e8eeff', 0.55, 18, i);
  });
  const g = new THREE.Group();
  const steel = mergeGeometries(
    structure.map((x) => {
      if (x.attributes.uv) x.deleteAttribute('uv');
      const ng = x.toNonIndexed();
      ng.setAttribute('aIdx', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(x.userData.idx), 1));
      return ng;
    }),
  );
  g.add(new THREE.Mesh(baker.deferBake(steel), createLitMaterial({ albedo: 0x7a7e86, brightness: 2.6 })));
  g.add(new THREE.Mesh(mergeGeometries(panels.map((x) => x.toNonIndexed())), new THREE.MeshBasicMaterial({ map: signAtlas(), color: new THREE.Color(0.85, 0.85, 0.85) })));
  g.add(new THREE.Mesh(mergeGeometries(lights.map((x) => x.toNonIndexed())), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0) })));
  return g;
}

// ---------------------------------------------------------------------------------------
// Overhead light gantries
// ---------------------------------------------------------------------------------------
export function buildGantries(track, baker, palette, opts = {}) {
  const spacing = opts.spacing ?? 160;
  const filter = opts.filter ?? (() => true);
  const step = Math.max(1, Math.round(spacing / track.ds));
  const W = track.halfWidth;
  const H = opts.height ?? 7.5;
  const items = [];
  for (let i = Math.round(step / 2); i < track.n - 10; i += step) if (filter(i)) items.push(i);
  if (!items.length) return null;
  const span = W * 2 + 5;
  // box truss: two top and two bottom chords, verticals and diagonals on both faces, lattice legs
  const parts = [];
  const bar = (x0, y0, z0, x1, y1, z1, r) => {
    const a = new THREE.Vector3(x0, y0, z0);
    const b = new THREE.Vector3(x1, y1, z1);
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(r, len, r);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(g);
  };
  const D = 0.55; // truss half depth (along the track)
  const T = 1.1; // truss height
  const yb = H - T / 2;
  const yt = H + T / 2;
  const half = span / 2 + 0.3;
  for (const z of [-D, D]) {
    bar(-half, yb, z, half, yb, z, 0.16);
    bar(-half, yt, z, half, yt, z, 0.16);
  }
  const bays = Math.round(span / 1.6);
  for (let k = 0; k <= bays; k++) {
    const x = -half + (k / bays) * half * 2;
    for (const z of [-D, D]) bar(x, yb, z, x, yt, z, 0.07);
    bar(x, yt, -D, x, yt, D, 0.06);
    bar(x, yb, -D, x, yb, D, 0.06);
    if (k < bays) {
      const x2 = -half + ((k + 1) / bays) * half * 2;
      for (const z of [-D, D]) bar(x, k % 2 ? yb : yt, z, x2, k % 2 ? yt : yb, z, 0.06);
    }
  }
  // lattice legs
  for (const sx of [-1, 1]) {
    const lx = sx * (span / 2);
    for (const dx of [-0.3, 0.3]) for (const z of [-D, D]) bar(lx + dx, 0, z, lx + dx, yt, z, 0.14);
    const n = Math.ceil(yt / 1.2);
    for (let k = 0; k < n; k++) {
      const y0 = (k / n) * yt;
      const y1 = ((k + 1) / n) * yt;
      for (const z of [-D, D]) bar(lx - 0.3, y0, z, lx + 0.3, y1, z, 0.05);
      bar(lx - 0.3, y0, -D, lx - 0.3, y1, D, 0.05);
      bar(lx + 0.3, y0, D, lx + 0.3, y1, -D, 0.05);
    }
    parts.push(new THREE.BoxGeometry(1.2, 0.3, 1.6).translate(lx, 0.15, 0));
  }
  // lamp housings under the bottom chords
  const lampN = Math.max(4, Math.round(span / 2.6));
  const lens = [];
  for (let k = 0; k < lampN; k++) {
    const x = -half + 0.9 + (k / (lampN - 1)) * (half * 2 - 1.8);
    parts.push(new THREE.BoxGeometry(0.7, 0.32, 0.55).translate(x, yb - 0.3, 0));
    lens.push(new THREE.PlaneGeometry(0.58, 0.44).rotateX(Math.PI / 2).translate(x, yb - 0.47, 0));
  }
  const frame = mergeGeometries(
    parts.map((g) => {
      if (g.attributes.uv) g.deleteAttribute('uv');
      return g.index ? g.toNonIndexed() : g;
    }),
  );
  const lightsGeo = mergeGeometries(lens.map((g) => (g.deleteAttribute('uv'), g.toNonIndexed())));
  const lc = new THREE.Color(opts.color ?? palette.accent ?? '#ffffff');
  const lightAttr = new Float32Array(items.length * 3);
  frame.setAttribute('aLight', new THREE.InstancedBufferAttribute(lightAttr, 3));
  const frames = new THREE.InstancedMesh(frame, createInstancedLitMaterial(0x6a6e76, 2.2), items.length);
  const lights = new THREE.InstancedMesh(lightsGeo, new THREE.MeshBasicMaterial({ color: lc.clone().multiplyScalar(4), side: THREE.DoubleSide }), items.length);
  items.forEach((i, n) => {
    _p.set(track.px[i], track.py[i], track.pz[i]);
    _z.set(track.tx[i], 0, track.tz[i]).normalize();
    _y.set(0, 1, 0);
    _x.crossVectors(_y, _z).normalize();
    _m.makeBasis(_x, _y, _z);
    _m.setPosition(_p);
    frames.setMatrixAt(n, _m);
    lights.setMatrixAt(n, _m);
    baker.addPoint(_p.x, _p.y + H - 0.5, _p.z, lc, opts.intensity ?? 1.3, 26, i);
  });
  // the steel picks up the light around it once every lamp is registered
  const tmp = [0, 0, 0];
  items.forEach((i, n) => {
    baker.sample(i, track.px[i], track.py[i] + H * 0.6, track.pz[i], tmp);
    lightAttr.set(tmp, n * 3);
  });
  frames.computeBoundingSphere();
  lights.computeBoundingSphere();
  const g = new THREE.Group();
  g.add(frames, lights);
  return g;
}

// ---------------------------------------------------------------------------------------
// Ground: terrain that follows the track nearby and flattens out, with a theme shader.
// ---------------------------------------------------------------------------------------

/**
 * The hill under a road that climbs well above its lowest point: the road's heights spread
 * outward (a gaussian of `sigma` metres) and fade to `base` far from the road, so the ground
 * between roads at different heights is one smooth slope. Returns (x, z) => height.
 */
export function hillField(track, opts = {}) {
  const sigma = opts.sigma ?? 140;
  const falloff = opts.falloff ?? 4; // weight of the base: higher, the hill ends sooner
  const base = opts.base ?? track.bounds.minY - 1.2;
  const step = Math.max(1, Math.round(10 / track.ds));
  const sx = [];
  const sz = [];
  const sy = [];
  for (let i = 0; i < track.n; i += step) {
    sx.push(track.px[i]);
    sz.push(track.pz[i]);
    sy.push(track.py[i]);
  }
  const inv = 1 / (2 * sigma * sigma);
  const cut2 = (3.2 * sigma) ** 2;
  return (x, z) => {
    let sw = falloff;
    let sh = falloff * base;
    for (let k = 0; k < sx.length; k++) {
      const dx = sx[k] - x;
      const dz = sz[k] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > cut2) continue;
      const w = Math.exp(-d2 * inv);
      sw += w;
      sh += w * sy[k];
    }
    return sh / sw;
  };
}

/**
 * The ground's surface over a hillField: at the road's own height beside it (a little below the
 * road, as everywhere), blending into the hill over `blend` metres from a few metres out (so the
 * terrain mesh, coarser than the road, can't cut a corner up through the road's edge on a steep
 * slope). Returns (x, z) => height.
 */
export function hillGround(track, field, blend = 40) {
  const W = track.halfWidth;
  return (x, z) => {
    const hill = field(x, z) - 0.9;
    const r = track.nearestDistance(x, z, W + blend + 16);
    if (r.index < 0) return hill;
    const t = smoothstep(W + 6, W + 6 + blend, r.dist);
    return (track.py[r.index] - 0.9) * (1 - t) + hill * t;
  };
}

/** opts.ground: the surface's height at (x, z) (a hillGround) instead of falling to baseY. */
export function buildTerrain(track, palette, opts = {}) {
  const b = track.bounds;
  const margin = opts.margin ?? 600;
  const cell = opts.cell ?? 22;
  const baseY = opts.baseY ?? b.minY - 0.8;
  const ground = opts.ground ?? null;
  const minX = b.minX - margin;
  const maxX = b.maxX + margin;
  const minZ = b.minZ - margin;
  const maxZ = b.maxZ + margin;
  const nx = Math.ceil((maxX - minX) / cell);
  const nz = Math.ceil((maxZ - minZ) / cell);
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = geo.attributes.position;
  const W = track.halfWidth;
  const near = new Float32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v);
    const z = pos.getZ(v);
    const r = track.nearestDistance(x, z, ground ? W + 52 : 160);
    let y = ground ? ground(x, z) : baseY;
    if (r.index >= 0) {
      if (!ground) {
        const t = smoothstep(W + 3, W + (opts.blend ?? 110), r.dist);
        y = (track.py[r.index] - 0.9) * (1 - t) + baseY * t;
      }
      near[v] = 1 - smoothstep(W + 2, W + 40, r.dist);
    }
    pos.setY(v, y);
  }
  geo.setAttribute('aNear', new THREE.BufferAttribute(near, 1));
  geo.computeVertexNormals();
  const mat = createGroundMaterial(palette, opts.style ?? 'asphalt');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  // Far plane out to the horizon
  const far = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), mat);
  far.position.set((minX + maxX) / 2, baseY - 0.4, (minZ + maxZ) / 2);
  const g = new THREE.Group();
  g.add(mesh, far);
  g.userData.baseY = baseY;
  return g;
}

export function createGroundMaterial(palette, style) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...globalUniforms,
      uBase: { value: new THREE.Color(palette.ground ?? '#06060a') },
      uLineA: { value: new THREE.Color(palette.primary) },
      uLineB: { value: new THREE.Color(palette.secondary) },
      uStyle: { value: { grass: 1, carpet: 2, town: 3 }[style] ?? 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aNear;
      varying vec3 vWorld;
      varying float vNear;
      varying float vFogDepth;
      void main() {
        vNear = aNear;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uAmbient;
      uniform vec3 uBase;
      uniform vec3 uLineA;
      uniform vec3 uLineB;
      uniform float uStyle;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vWorld;
      varying float vNear;
      varying float vFogDepth;
      float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y); }
      // city light carpet: sodium street grid, a few white main roads, scattered lit windows
      vec3 carpet(vec2 p) {
        vec2 g = p / 34.0;
        vec2 cell = floor(g);
        vec2 f = fract(g);
        float street = 1.0 - smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        float dots = step(0.5, fract((p.x + p.y) * 0.2)) * street;
        float block = hash12(cell);
        vec3 col = uBase + uAmbient * 0.04;
        vec3 sodium = vec3(1.0, 0.62, 0.28);
        col += mix(sodium, vec3(0.9, 0.95, 1.0), step(0.85, block)) * dots * 0.9;
        col += vec3(1.0, 0.82, 0.6) * step(0.988, hash12(floor(p / 5.0))) * (1.0 - street) * 1.1;
        col += vec3(0.85, 0.9, 1.0) * step(0.995, hash12(floor(p / 4.0) + 7.0)) * (1.0 - street) * 1.0;
        return col;
      }
      // dark urban ground with faint grid
      vec3 urban(vec2 p) {
        vec2 g = abs(fract(p / 40.0) - 0.5);
        float line = 1.0 - smoothstep(0.0, 0.02, min(g.x, g.y));
        float n = vnoise(p * 0.5);
        return uBase * (0.8 + 0.4 * n) + uAmbient * 0.05 + uLineA * line * 0.06;
      }
      void main() {
        vec2 p = vWorld.xz;
        vec3 col;
        if (uStyle > 2.5) {
          // a town on a hill: paved beside the road, the lit streets of the town further out
          col = mix(carpet(p), urban(p), smoothstep(0.0, 0.4, vNear));
        } else if (uStyle > 1.5) {
          // city light carpet far below
          col = carpet(p);
        } else if (uStyle > 0.5) {
          // night grass with mowing stripes
          float stripe = step(0.5, fract((p.x * 0.7 + p.y * 0.7) / 18.0));
          float n = vnoise(p * 0.35) * 0.6 + vnoise(p * 2.1) * 0.4;
          col = vec3(0.014, 0.03, 0.016) * (0.7 + 0.6 * n) * (0.85 + 0.25 * stripe);
          col += uAmbient * 0.04;
        } else {
          col = urban(p);
        }
        col *= 1.0 + vNear * 0.6;
        float d = uFogDensity * vFogDepth;
        col = mix(col, uFogColor, 1.0 - exp(-d * d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Soft additive light cones (fake volumetrics) - used by floodlights and some lamps.
// ---------------------------------------------------------------------------------------
export function createConeMaterial(color, intensity = 0.35) {
  return additive(
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color).multiplyScalar(intensity) },
        uFogDensity: globalUniforms.uFogDensity,
        uWet: globalUniforms.uWet,
      },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        varying float vDist;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          vDist = length(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uWet;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        varying float vDist;
        void main() {
          float edge = abs(dot(normalize(vN), normalize(vV)));
          float along = pow(clamp(vUv.y, 0.0, 1.0), 1.4);
          // fade out when the camera drives through the beam so it never whites out the screen
          float near = smoothstep(6.0, 40.0, vDist);
          float a = along * pow(clamp(edge, 0.0, 1.0), 1.5) * (1.0 + uWet * 0.4) * near;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    }),
  );
}
