import * as THREE from 'three';
import { additive, alphaBlend, globalUniforms, HEADLIGHTS_GLSL } from '../world/materials.js';

// ---------------------------------------------------------------------------------------
// CPU-simulated, GPU-billboarded particles (one draw call per system)
// ---------------------------------------------------------------------------------------
const PARTICLE_VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iCol;
  attribute vec3 iSize; // size, stretch, rotation
  varying vec4 vCol;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vCol = iCol;
    vec4 c = viewMatrix * vec4(iPos, 1.0);
    vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 dir = vv.xy;
    float l = length(dir);
    vec2 ax = (iSize.y > 0.0 && l > 1e-4) ? dir / l : vec2(cos(iSize.z), sin(iSize.z));
    vec2 ay = vec2(-ax.y, ax.x);
    float len = iSize.x + l * iSize.y;
    c.xy += ax * position.x * len + ay * position.y * iSize.x;
    gl_Position = projectionMatrix * c;
  }`;

class ParticleSystem {
  constructor(max, kind) {
    this.max = max;
    this.kind = kind;
    this.count = 0;
    const n = max;
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.c = new Float32Array(n * 4);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.size1 = new Float32Array(n);
    this.stretch = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iSize', this.aSize);
    geo.instanceCount = 0;
    this.geo = geo;
    let mat;
    if (kind === 'spark') {
      mat = additive(
        new THREE.ShaderMaterial({
          vertexShader: PARTICLE_VERT,
          fragmentShader: /* glsl */ `
            varying vec4 vCol; varying vec2 vUv;
            void main() {
              vec2 p = (vUv - 0.5) * 2.0;
              float a = pow(clamp(1.0 - length(p), 0.0, 1.0), 1.6) * vCol.a;
              gl_FragColor = vec4(vCol.rgb * a, a);
            }`,
        }),
      );
    } else {
      mat = alphaBlend(
        new THREE.ShaderMaterial({
          uniforms: { uTime: globalUniforms.uTime },
          vertexShader: PARTICLE_VERT,
          fragmentShader: /* glsl */ `
            uniform float uTime;
            varying vec4 vCol; varying vec2 vUv;
            float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            void main() {
              vec2 p = (vUv - 0.5) * 2.0;
              float r = length(p);
              float n = h(floor(vUv * 6.0) + floor(uTime * 3.0)) * 0.15;
              float a = smoothstep(1.0, 0.15, r + n) * vCol.a;
              gl_FragColor = vec4(vCol.rgb, a);
            }`,
        }),
      );
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'spark' ? 8 : 7;
  }

  emit(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, a, stretch = 0, drag = 0, grav = 0) {
    let i;
    if (this.count < this.max) i = this.count++;
    else i = Math.floor(Math.random() * this.max);
    this.p[i * 3] = x;
    this.p[i * 3 + 1] = y;
    this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx;
    this.v[i * 3 + 1] = vy;
    this.v[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size0;
    this.size1[i] = size1;
    this.c[i * 4] = r;
    this.c[i * 4 + 1] = g;
    this.c[i * 4 + 2] = b;
    this.a0[i] = a;
    this.stretch[i] = stretch;
    this.rot[i] = Math.random() * 6.28;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this._move(n, i);
        i--;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= k;
      this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt;
      this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    }
    this.count = n;
    const P = this.aPos.array;
    const V = this.aVel.array;
    const C = this.aCol.array;
    const S = this.aSize.array;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.maxLife[i];
      P[i * 3] = this.p[i * 3];
      P[i * 3 + 1] = this.p[i * 3 + 1];
      P[i * 3 + 2] = this.p[i * 3 + 2];
      V[i * 3] = this.v[i * 3];
      V[i * 3 + 1] = this.v[i * 3 + 1];
      V[i * 3 + 2] = this.v[i * 3 + 2];
      C[i * 4] = this.c[i * 4];
      C[i * 4 + 1] = this.c[i * 4 + 1];
      C[i * 4 + 2] = this.c[i * 4 + 2];
      const fadeIn = this.kind === 'spark' ? 1 : Math.min(1, t * 6);
      C[i * 4 + 3] = this.a0[i] * (1 - t) * fadeIn;
      S[i * 3] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      S[i * 3 + 1] = this.stretch[i];
      S[i * 3 + 2] = this.rot[i] + t * 1.5;
    }
    this.geo.instanceCount = n;
    if (n > 0) {
      // whole buffers (a few tens of KB): upload ranges would cost new objects every frame
      this.aPos.needsUpdate = true;
      this.aVel.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aSize.needsUpdate = true;
    }
  }

  _move(from, to) {
    copySlot(this.p, 3, from, to);
    copySlot(this.v, 3, from, to);
    copySlot(this.c, 4, from, to);
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size0[to] = this.size0[from];
    this.size1[to] = this.size1[from];
    this.a0[to] = this.a0[from];
    this.stretch[to] = this.stretch[from];
    this.rot[to] = this.rot[from];
    this.drag[to] = this.drag[from];
    this.grav[to] = this.grav[from];
  }

  clear() {
    this.count = 0;
    this.geo.instanceCount = 0;
  }
}

// ---------------------------------------------------------------------------------------
// Ribbon trails (all trails share one dynamic buffer -> one draw call)
// ---------------------------------------------------------------------------------------
class TrailSystem {
  constructor(maxTrails, maxPoints, opts = {}) {
    this.maxTrails = maxTrails;
    this.maxPoints = maxPoints;
    this.flat = !!opts.flat;
    this.lifetime = opts.lifetime ?? 0.35;
    this.trails = [];
    // points that fell off a trail, reused for new ones (a trail point every frame per trail
    // would otherwise be garbage within a second)
    this.spare = [];
    const vcount = maxTrails * maxPoints * 2;
    this.pos = new Float32Array(vcount * 3);
    this.col = new Float32Array(vcount * 4);
    const idx = [];
    for (let t = 0; t < maxTrails; t++) {
      for (let p = 0; p < maxPoints - 1; p++) {
        const a = (t * maxPoints + p) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('color', this.aCol);
    geo.setIndex(idx);
    this.geo = geo;
    const mat = additive(
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec4 color;
          varying vec4 vCol;
          void main() { vCol = color; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec4 vCol;
          void main() { gl_FragColor = vec4(vCol.rgb * vCol.a, vCol.a); }`,
      }),
    );
    mat.side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  create(width, color) {
    if (this.trails.length >= this.maxTrails) return null;
    const tr = { id: this.trails.length, pts: [], width, color: new THREE.Color(color), intensity: 1, active: true };
    this.trails.push(tr);
    return tr;
  }

  push(tr, x, y, z, time, wx = 0, wy = 0, wz = 0) {
    const p = this.spare.pop() || {};
    p.x = x;
    p.y = y;
    p.z = z;
    p.t = time;
    p.wx = wx;
    p.wy = wy;
    p.wz = wz;
    tr.pts.unshift(p);
    if (tr.pts.length > this.maxPoints) this.spare.push(tr.pts.pop());
  }

  /** Empty a trail (its points are kept for reuse). */
  reset(tr) {
    while (tr.pts.length) this.spare.push(tr.pts.pop());
  }

  update(camera, time) {
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const P = this.pos;
    const C = this.col;
    P.fill(0);
    C.fill(0);
    for (const tr of this.trails) {
      while (tr.pts.length && time - tr.pts[tr.pts.length - 1].t > this.lifetime) this.spare.push(tr.pts.pop());
      const base = tr.id * this.maxPoints * 2;
      const n = tr.pts.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const p = tr.pts[i];
        const q = tr.pts[Math.min(n - 1, i + 1)];
        const o = tr.pts[Math.max(0, i - 1)];
        const age = (time - p.t) / this.lifetime;
        const fade = Math.max(0, 1 - age);
        let sx;
        let sy;
        let sz;
        if (this.flat) {
          sx = p.wx;
          sy = p.wy;
          sz = p.wz;
        } else {
          const dx = o.x - q.x;
          const dy = o.y - q.y;
          const dz = o.z - q.z;
          const vx = cx - p.x;
          const vy = cy - p.y;
          const vz = cz - p.z;
          sx = dy * vz - dz * vy;
          sy = dz * vx - dx * vz;
          sz = dx * vy - dy * vx;
          const l = Math.hypot(sx, sy, sz) || 1;
          sx /= l;
          sy /= l;
          sz /= l;
        }
        const w = tr.width * (0.35 + 0.65 * fade);
        // fade ribbons that pass right next to the camera (prevents fat smears filling the screen)
        const camD = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
        const camFade = this.flat ? 1 : Math.min(1, Math.max(0, (camD - 2.5) / 6));
        const v = base + i * 2;
        P[v * 3] = p.x + sx * w;
        P[v * 3 + 1] = p.y + sy * w;
        P[v * 3 + 2] = p.z + sz * w;
        P[v * 3 + 3] = p.x - sx * w;
        P[v * 3 + 4] = p.y - sy * w;
        P[v * 3 + 5] = p.z - sz * w;
        const a = fade * fade * tr.intensity * camFade * (i === 0 ? 0 : 1);
        for (let k = 0; k < 2; k++) {
          C[(v + k) * 4] = tr.color.r;
          C[(v + k) * 4 + 1] = tr.color.g;
          C[(v + k) * 4 + 2] = tr.color.b;
          C[(v + k) * 4 + 3] = a;
        }
      }
      // collapse unused tail onto the last point so nothing stretches
      const last = tr.pts[n - 1];
      for (let i = n; i < this.maxPoints; i++) {
        const v = base + i * 2;
        for (let k = 0; k < 2; k++) {
          P[(v + k) * 3] = last.x;
          P[(v + k) * 3 + 1] = last.y;
          P[(v + k) * 3 + 2] = last.z;
        }
      }
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
  }

  clearAll() {
    for (const t of this.trails) this.reset(t);
  }
}

// ---------------------------------------------------------------------------------------
// Rain: a GPU streak field around the camera - zero CPU cost per drop. At night rain only
// shows where light catches it, so each drop is lit by the headlights and the street lamps
// nearest the player; none falls under a tunnel roof or an overpass.
// ---------------------------------------------------------------------------------------
export const RAIN_LAMPS = 6;
const RAIN_FALL = 17; // m/s
const RAIN_WIND = [2.2, 0.9]; // m/s: a slight slant
const RAIN_BOX = [40, 16, 40];
// the box sits ahead of the camera and above it, where the drops can be seen (not under the road)
const RAIN_AHEAD = 8;
const RAIN_UP = 5;
const RAIN_RANGE = 9; // full strength out to here, gone at twice this
const RAIN_LAMP_GAIN = 1.2;

function rainField(count) {
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  base.translate(0, 0.5, 0);
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  const G = globalUniforms;
  const mat = additive(
    new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uCenter: { value: new THREE.Vector3() },
        uOffset: { value: new THREE.Vector3() },
        uDir: { value: new THREE.Vector3(0, -1, 0) },
        uLen: { value: 1 },
        uBox: { value: new THREE.Vector3(...RAIN_BOX) },
        uWidth: { value: 0.012 },
        uPixel: { value: 0.0016 },
        uRange: { value: RAIN_RANGE },
        uAlpha: { value: 1 },
        uTint: { value: new THREE.Color(0.82, 0.88, 1.0) },
        uBase: { value: new THREE.Color(0.05, 0.055, 0.07) },
        uHeadGain: { value: 0.6 },
        uLampPos: { value: Array.from({ length: RAIN_LAMPS }, () => new THREE.Vector3()) },
        uLampCol: { value: Array.from({ length: RAIN_LAMPS }, () => new THREE.Vector4(0, 0, 0, 1)) },
        uCover: G.uCover,
        uCoverRect: G.uCoverRect,
        uHeadPos: G.uHeadPos,
        uHeadFwd: G.uHeadFwd,
        uHeadUp: G.uHeadUp,
        uHeadParams: G.uHeadParams,
        uHeadColor: G.uHeadColor,
      },
      vertexShader: /* glsl */ `
        #define RAIN_LAMPS ${RAIN_LAMPS}
        attribute vec4 aSeed;
        uniform vec3 uCam;
        uniform vec3 uCenter;
        uniform vec3 uOffset;
        uniform vec3 uDir;
        uniform float uLen;
        uniform vec3 uBox;
        uniform float uWidth;
        uniform float uPixel;
        uniform float uRange;
        uniform vec3 uBase;
        uniform float uHeadGain;
        uniform vec3 uLampPos[RAIN_LAMPS];
        uniform vec4 uLampCol[RAIN_LAMPS];
        uniform sampler2D uCover;
        uniform vec4 uCoverRect;
        varying vec3 vCol;
        varying vec2 vUv;
        ${HEADLIGHTS_GLSL}
        void main() {
          vUv = uv;
          vec3 wp = uCenter + mod(aSeed.xyz * uBox - uOffset, uBox) - uBox * 0.5;
          float len = uLen * (0.6 + 0.8 * aSeed.w);
          vec3 dir = normalize(uDir);
          vec3 toCam = uCam - wp;
          float dist = max(length(toCam), 1e-3);
          toCam /= dist;
          vec3 cr = cross(dir, toCam);
          vec3 side = cr / max(length(cr), 1e-4);
          // at least about a pixel wide, or distant drops break up into dashes; widened ones dim
          float w = max(uWidth, dist * uPixel);
          vec3 pos = wp + dir * position.y * len + side * position.x * w;
          float a = smoothstep(uRange * 2.0, uRange, dist) * smoothstep(1.5, 4.0, dist) * sqrt(uWidth / w);
          // none under a tunnel roof or an overpass
          vec2 cv = texture2D(uCover, (pos.xz - uCoverRect.xy) * uCoverRect.zw).rg;
          a *= 1.0 - cv.y * (1.0 - smoothstep(cv.x - 0.5, cv.x + 0.5, pos.y));
          // lit by the lamps nearby (street lights mostly below them) and the headlights
          vec3 light = uBase;
          for (int k = 0; k < RAIN_LAMPS; k++) {
            vec3 d = uLampPos[k] - pos;
            float d2 = dot(d, d);
            float f = max(1.0 - d2 * uLampCol[k].w, 0.0);
            float below = 0.35 + 0.65 * smoothstep(-0.2, 0.6, d.y * inversesqrt(d2 + 1e-3));
            light += uLampCol[k].rgb * (f * f * below);
          }
          light += headlights(pos, toCam, 1.0) * uHeadGain;
          vCol = light * a;
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        uniform vec3 uTint;
        varying vec3 vCol;
        varying vec2 vUv;
        void main() {
          float a = uAlpha * (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          gl_FragColor = vec4(uTint * vCol * a, 1.0);
        }`,
    }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

// ---------------------------------------------------------------------------------------
// Effects manager
// ---------------------------------------------------------------------------------------
export class Effects {
  constructor(scene, opts = {}) {
    const q = opts.particles ?? 1;
    this.scene = scene;
    this.sparks = new ParticleSystem(Math.round(500 * q), 'spark');
    this.smoke = new ParticleSystem(Math.round(320 * q), 'smoke');
    this.trails = new TrailSystem(16, 34, { lifetime: 0.32 });
    this.skids = new TrailSystem(4, 60, { lifetime: 2.4, flat: true });
    scene.add(this.sparks.mesh, this.smoke.mesh, this.trails.mesh, this.skids.mesh);
    this.rain = null;
    if (opts.rain) {
      this.rain = rainField(Math.round(4000 * q));
      scene.add(this.rain);
      this.rainTravel = new THREE.Vector3();
      this.rainCamVel = new THREE.Vector3();
      this.rainCam = null;
      // where the visible rain is (ahead of the camera): light it from the lamps around here
      this.rainFocus = new THREE.Vector3();
    }
    this.time = 0;
  }

  /** Light the rain with LightBaker lamps (strongest first, `count` of them used). */
  lightRain(lamps, count) {
    if (!this.rain) return;
    const u = this.rain.material.uniforms;
    for (let k = 0; k < RAIN_LAMPS; k++) {
      const col = u.uLampCol.value[k];
      const L = k < count ? lamps[k] : null;
      if (!L) {
        col.set(0, 0, 0, 1);
        continue;
      }
      u.uLampPos.value[k].set(L.x, L.y, L.z);
      col.set(L.r * RAIN_LAMP_GAIN, L.g * RAIN_LAMP_GAIN, L.b * RAIN_LAMP_GAIN, 1 / L.r2);
    }
  }

  spark(x, y, z, vx, vy, vz, color = SPARK, life = 0.5, size = 0.06, stretch = 0.045) {
    this.sparks.emit(x, y, z, vx, vy, vz, life, size, size * 0.5, color[0], color[1], color[2], 1, stretch, 1.5, 9);
  }

  burst(x, y, z, baseV, n, color, speed = 8, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9 + 0.1;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spark(
        x,
        y,
        z,
        baseV.x * 0.6 + Math.cos(a) * s * e,
        baseV.y * 0.3 + Math.random() * s * 0.7,
        baseV.z * 0.6 + Math.sin(a) * s * e,
        color,
        life * (0.5 + Math.random() * 0.7),
      );
    }
  }

  /** Glass fragments glinting as they fall. */
  glints(x, y, z, baseV, n, spread = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * (0.3 + Math.random());
      const b = 0.9 + Math.random() * 0.8;
      this.sparks.emit(
        x + (Math.random() - 0.5) * 0.3,
        y + (Math.random() - 0.5) * 0.15,
        z + (Math.random() - 0.5) * 0.3,
        baseV.x * 0.7 + Math.cos(a) * s,
        0.5 + Math.random() * 2.5,
        baseV.z * 0.7 + Math.sin(a) * s,
        0.45 + Math.random() * 0.6,
        0.024,
        0.014,
        1.3 * b,
        1.45 * b,
        1.65 * b,
        1,
        0.012,
        1.2,
        9,
      );
    }
  }

  /** Bits of plastic and carbon knocked off in a hard hit. */
  debris(x, y, z, baseV, n, spread = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * (0.3 + Math.random());
      const size = 0.04 + Math.random() * 0.05;
      this.smoke.emit(
        x + (Math.random() - 0.5) * 0.3,
        y + (Math.random() - 0.5) * 0.2,
        z + (Math.random() - 0.5) * 0.3,
        baseV.x * 0.75 + Math.cos(a) * s,
        1.5 + Math.random() * 3,
        baseV.z * 0.75 + Math.sin(a) * s,
        0.6 + Math.random() * 0.5,
        size,
        size,
        0.035,
        0.035,
        0.04,
        0.95,
        0,
        0.6,
        14,
      );
    }
  }

  puff(x, y, z, vx, vy, vz, color, alpha = 0.35, size0 = 0.8, size1 = 3.4, life = 1.2) {
    this.smoke.emit(x, y, z, vx, vy, vz, life * (0.8 + Math.random() * 0.4), size0, size1, color[0], color[1], color[2], alpha, 0, 1.8, -0.6);
  }

  /** viewHeight: height of the render target in pixels (keeps distant drops a pixel wide). */
  update(dt, camera, viewHeight = 720) {
    this.time += dt;
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.trails.update(camera, this.time);
    this.skids.update(camera, this.time);
    if (this.rain) {
      const r = this.rain.material.uniforms;
      const fall = _rainVel.set(RAIN_WIND[0], -RAIN_FALL, RAIN_WIND[1]);
      // follow the camera itself (not the car), so the drops stay put in the world as it swings
      if (!this.rainCam) this.rainCam = camera.position.clone();
      _d.subVectors(camera.position, this.rainCam);
      this.rainCam.copy(camera.position);
      if (_d.lengthSq() < 30 * 30) {
        this.rainTravel.add(_d);
        if (dt > 0) this.rainCamVel.lerp(_d.divideScalar(dt), Math.min(1, dt * 12));
      }
      this.rainTravel.addScaledVector(fall, -dt);
      // the field repeats every box, so wrapping keeps the numbers small without moving a drop
      this.rainTravel.set(this.rainTravel.x % RAIN_BOX[0], this.rainTravel.y % RAIN_BOX[1], this.rainTravel.z % RAIN_BOX[2]);
      camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
      _fwd.normalize().multiplyScalar(RAIN_AHEAD);
      this.rainFocus.copy(camera.position).add(_fwd);
      _fwd.y = RAIN_UP;
      r.uCam.value.copy(camera.position);
      r.uCenter.value.copy(camera.position).add(_fwd);
      r.uOffset.value.copy(this.rainTravel).add(_fwd);
      const rel = _rel.copy(fall).sub(this.rainCamVel);
      r.uDir.value.copy(rel).normalize();
      r.uLen.value = 0.25 + rel.length() * 0.016;
      // a drop's light is smeared over its streak: longer at speed, so fainter
      r.uAlpha.value = Math.min(1, Math.max(0.3, 0.6 / r.uLen.value));
      r.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(viewHeight, 1);
    }
  }

  clear() {
    this.sparks.clear();
    this.smoke.clear();
    this.trails.clearAll();
    this.skids.clearAll();
  }

  dispose() {
    for (const m of [this.sparks.mesh, this.smoke.mesh, this.trails.mesh, this.skids.mesh, this.rain]) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}

/** Copy particle slot `from` over slot `to` in a packed array with `sz` values per particle. */
const SPARK = [6, 3.2, 1.2];
function copySlot(arr, sz, from, to) {
  for (let k = 0; k < sz; k++) arr[to * sz + k] = arr[from * sz + k];
}

const _rainVel = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _d = new THREE.Vector3();
const _fwd = new THREE.Vector3();
