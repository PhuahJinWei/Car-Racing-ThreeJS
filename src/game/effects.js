import * as THREE from 'three';
import { additive, alphaBlend, globalUniforms } from '../world/materials.js';

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
      for (const a of [this.aPos, this.aVel, this.aCol, this.aSize]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }

  _move(from, to) {
    const cp = (arr, sz) => {
      for (let k = 0; k < sz; k++) arr[to * sz + k] = arr[from * sz + k];
    };
    cp(this.p, 3);
    cp(this.v, 3);
    cp(this.c, 4);
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
    tr.pts.unshift({ x, y, z, t: time, wx, wy, wz });
    if (tr.pts.length > this.maxPoints) tr.pts.pop();
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
      while (tr.pts.length && time - tr.pts[tr.pts.length - 1].t > this.lifetime) tr.pts.pop();
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
    for (const t of this.trails) t.pts.length = 0;
  }
}

// ---------------------------------------------------------------------------------------
// GPU streak field for rain - zero CPU cost per particle
// ---------------------------------------------------------------------------------------
function streakField(count, opts) {
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
  const mat = additive(
    new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uOffset: { value: new THREE.Vector3() },
        uDir: { value: new THREE.Vector3(0, -1, 0) },
        uLen: { value: 1 },
        uBox: { value: new THREE.Vector3(opts.box[0], opts.box[1], opts.box[2]) },
        uAlpha: { value: 0 },
        uColor: { value: new THREE.Color(opts.color) },
        uWidth: { value: opts.width },
        uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
        uCenterFade: { value: opts.centerFade ?? 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform vec3 uCam;
        uniform vec3 uOffset;
        uniform vec3 uDir;
        uniform float uLen;
        uniform vec3 uBox;
        uniform float uWidth;
        uniform vec3 uCamFwd;
        uniform float uCenterFade;
        varying float vA;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = mod(aSeed.xyz * uBox - uOffset, uBox) - uBox * 0.5;
          vec3 wp = uCam + p;
          float len = uLen * (0.6 + 0.8 * aSeed.w);
          vec3 dir = normalize(uDir);
          vec3 toCam = normalize(uCam - wp);
          vec3 side = normalize(cross(dir, toCam));
          vec3 pos = wp + dir * position.y * len + side * position.x * uWidth;
          float dist = length(p);
          vA = smoothstep(uBox.x * 0.5, uBox.x * 0.2, dist) * smoothstep(0.5, 2.5, dist);
          if (uCenterFade > 0.0) {
            float c = dot(normalize(p), uCamFwd);
            vA *= 1.0 - smoothstep(0.86, 0.97, c) * uCenterFade;
          }
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        uniform vec3 uColor;
        varying float vA;
        varying vec2 vUv;
        void main() {
          float a = vA * uAlpha * (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          gl_FragColor = vec4(uColor * a, a);
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
      this.rain = streakField(Math.round(1400 * q), { box: [44, 26, 44], color: '#9fb8d8', width: 0.012 });
      scene.add(this.rain);
      this.rainTravel = new THREE.Vector3();
    }
    this.time = 0;
  }

  spark(x, y, z, vx, vy, vz, color = [6, 3.2, 1.2], life = 0.5, size = 0.06, stretch = 0.045) {
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

  puff(x, y, z, vx, vy, vz, color, alpha = 0.35, size0 = 0.8, size1 = 3.4, life = 1.2) {
    this.smoke.emit(x, y, z, vx, vy, vz, life * (0.8 + Math.random() * 0.4), size0, size1, color[0], color[1], color[2], alpha, 0, 1.8, -0.6);
  }

  update(dt, camera, camVel, speedFactor) {
    this.time += dt;
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.trails.update(camera, this.time);
    this.skids.update(camera, this.time);
    if (this.rain) {
      const r = this.rain.material.uniforms;
      const fall = _rainVel.set(0, -22, 0);
      this.rainTravel.addScaledVector(fall, -dt).addScaledVector(camVel, dt);
      r.uCam.value.copy(camera.position);
      r.uOffset.value.copy(this.rainTravel);
      const rel = _rel.copy(fall).sub(camVel);
      r.uDir.value.copy(rel).normalize();
      r.uLen.value = 0.35 + rel.length() * 0.028;
      r.uAlpha.value = 0.55;
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

const _rainVel = new THREE.Vector3();
const _rel = new THREE.Vector3();
