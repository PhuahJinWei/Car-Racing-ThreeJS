import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweep, ranges, forChunks } from './track-mesh.js';
import { createLitMaterial, globalUniforms, additive } from './materials.js';
import { createConeMaterial } from './decor-common.js';
import { inRange } from './track.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

function sideForSection(track, sec) {
  // Put stands on the outside of the dominant curve in the section (or left on straights).
  let sum = 0;
  for (let i = 0; i < track.n; i++) if (inRange(i * track.ds, sec.s0, sec.s1)) sum += track.kappa[i];
  if (Math.abs(sum) < 0.02) return -1;
  return Math.sign(sum);
}

export function createCrowdMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalUniforms.uTime,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uAmbient: globalUniforms.uAmbient,
      uExcite: { value: 0.3 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aCrowd; // rgb shirt, seed
      attribute vec3 aLight; // baked light where this spectator sits
      uniform float uTime;
      uniform float uExcite;
      varying vec3 vCol;
      varying vec3 vLight;
      varying vec2 vUv;
      varying float vSeed;
      varying float vFogDepth;
      void main() {
        vCol = aCrowd.rgb;
        vLight = aLight;
        vSeed = aCrowd.a;
        vUv = uv;
        vec3 p = position;
        float jump = max(0.0, sin(uTime * (6.0 + vSeed * 5.0) + vSeed * 40.0)) * 0.22 * uExcite;
        p.y += jump;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform vec3 uAmbient;
      varying vec3 vCol;
      varying vec3 vLight;
      varying vec2 vUv;
      varying float vSeed;
      varying float vFogDepth;
      float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
      void main() {
        // simple person silhouette: head circle + body
        vec2 q = vUv - vec2(0.5, 0.0);
        float head = step(length((vUv - vec2(0.5, 0.82)) * vec2(1.0, 1.3)), 0.17);
        float body = step(abs(q.x), 0.36 - vUv.y * 0.08) * step(vUv.y, 0.66);
        if (head + body < 0.5) discard;
        vec3 c = mix(vCol, vec3(0.55, 0.42, 0.34), head) * (vLight * 1.1 + uAmbient * 0.4 + 0.04);
        // camera flashes
        float f = step(0.9992, h11(floor(uTime * 6.0) * 1.37 + vSeed * 911.0));
        c += vec3(2.5) * f;
        float d = uFogDensity * vFogDepth;
        c = mix(c, uFogColor, 1.0 - exp(-d * d));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** Scrolling LED advertising boards (uv.x across the board, uv.y = metres along the track). */
function createAdBoardMaterial() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 64;
  const ctx = c.getContext('2d');
  const ads = [
    ['MIDNIGHT OVERDRIVE', '#0a0a10', '#ff3b30'],
    ['VOLT ENERGY', '#ffd200', '#101010'],
    ['RAZOR TYRES', '#101318', '#f2f2f2'],
    ['SPECTER OIL', '#1238ff', '#ffffff'],
    ['NIGHTRUN', '#e10600', '#ffffff'],
    ['NEON FM 97.4', '#111111', '#00e1ff'],
    ['APEX WATCHES', '#f2f2f2', '#111111'],
    ['TURBO COLA', '#c00018', '#ffe9a8'],
  ];
  ads.forEach(([text, bg, fg], k) => {
    const x = k * 256;
    ctx.fillStyle = bg;
    ctx.fillRect(x, 0, 256, 64);
    ctx.fillStyle = fg;
    ctx.font = `900 ${text.length > 12 ? 24 : 30}px Orbitron, "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 128, 34);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { tAds: { value: tex }, uTime: globalUniforms.uTime, uFogColor: globalUniforms.uFogColor, uFogDensity: globalUniforms.uFogDensity },
    vertexShader: /* glsl */ `
      attribute float aFlip;
      varying vec2 vUv;
      varying float vFlip;
      varying float vFogDepth;
      void main() {
        vUv = uv;
        vFlip = aFlip;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tAds;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec2 vUv;
      varying float vFlip;
      varying float vFogDepth;
      void main() {
        // each ad is 8 m long; boards scroll slowly
        float u = vFlip * vUv.y / 64.0 + floor(uTime / 6.0) * 0.125;
        vec3 c = texture2D(tAds, vec2(u, vUv.x)).rgb;
        // LED pixel grid
        vec2 px = fract(vec2(vUv.y * 40.0, vUv.x * 24.0));
        c *= 0.75 + 0.25 * step(0.2, px.x) * step(0.2, px.y);
        c = c * c * 2.4 + c * 0.1;
        float d = uFogDensity * 0.6 * vFogDepth;
        c = mix(c, uFogColor, 1.0 - exp(-d * d));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/**
 * Floodlit stadium dressing: grandstands (LED advertising boards, tiers of seats with a crowd,
 * cantilevered roof with a sponsor fascia and downlights), floodlight masts with banks of lamps,
 * fake volumetric cones and lens flares, a big screen, a sponsor sign and catch fences.
 */
export function buildStadium(track, baker, palette, rand, opts = {}) {
  const group = new THREE.Group();
  const W = track.halfWidth;
  const density = opts.density ?? 1;
  const stadiumSecs = track.sections.filter((s) => s.type === 'stadium');

  // ---- Floodlight masts first: their light must be registered before the stands are baked
  const towers = [];
  const towerStep = Math.round((opts.towerSpacing ?? 120) / track.ds);
  let alt = 0;
  for (let i = Math.round(towerStep * 0.3); i < track.n; i += towerStep) {
    alt++;
    let side = alt % 2 === 0 ? 1 : -1;
    const k = track.kappa[i];
    if (Math.abs(k) > 1 / 200) side = Math.sign(k); // outside of corners
    towers.push({ i, side });
  }
  const H = 32;
  for (const t of towers) {
    const i = t.i;
    baker.addPoint(track.px[i], track.py[i] + 18, track.pz[i], '#f4f7ff', 1.35, 58, i);
  }

  // ---- Grandstands
  const concreteMat = createLitMaterial({ albedo: 0x76787e, brightness: 2.4, side: THREE.DoubleSide, joints: 0 });
  const seatMat = createLitMaterial({ albedo: new THREE.Color(palette.primary ?? '#c8141c').multiplyScalar(0.7).getHex(), brightness: 2.4, side: THREE.DoubleSide });
  const roofMat = createLitMaterial({ albedo: 0x3c3e44, brightness: 2.2, side: THREE.DoubleSide });
  const adMat = createAdBoardMaterial();
  const downMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3.0), side: THREE.DoubleSide });
  const crowd = [];
  const steps = 12;
  const stepD = 0.95;
  const stepH = 0.55;
  const h0 = 2.0; // first tier above the barrier and the advertising boards
  for (const sec of stadiumSecs) {
    const side = sideForSection(track, sec);
    const d0 = W + 4.5;
    const hk = (k) => h0 + k * stepH;
    const dBack = d0 + steps * stepD;
    const hTop = hk(steps);
    const rf = hTop + 5.4; // roof height at the back
    const concrete = [
      [[side * d0, -1.2], [side * d0, h0]], // front wall
      [[side * dBack, hTop], [side * dBack, rf]], // rear wall
      [[side * (d0 - 1.3), rf + 1.05], [side * (dBack + 0.4), rf]], // roof underside
    ];
    const seats = [];
    for (let k = 0; k < steps; k++) {
      const d = d0 + k * stepD;
      concrete.push([[side * d, hk(k)], [side * d, hk(k + 1)]]); // risers
      seats.push([[side * d, hk(k + 1)], [side * (d + stepD), hk(k + 1)]]); // treads
    }
    const roof = [[[side * (dBack + 0.4), rf + 0.35], [side * (d0 - 1.3), rf + 1.4]]];
    const ads = [
      [[side * (d0 - 0.05), 1.15, 0], [side * (d0 - 0.05), 1.95, 1]], // pitch-side LED boards
      [[side * (d0 - 1.32), rf + 1.0, 0], [side * (d0 - 1.32), rf + 1.75, 1]], // roof fascia
    ];
    const down = [[[side * (d0 - 1.0), rf + 1.0], [side * (d0 - 0.4), rf + 0.94]]];
    const rgs = ranges(track, (i) => inRange(i * track.ds, sec.s0, sec.s1));
    for (const rg of rgs) {
      // downlights under the roof edge light the crowd
      for (let f = 0; f < rg.count; f += Math.round(22 / track.ds)) {
        const i = (rg.start + f) % track.n;
        const d = side * (d0 + 3);
        baker.addPoint(track.px[i] + track.rx[i] * d, track.py[i] + rf - 1, track.pz[i] + track.rz[i] * d, '#fff4e0', 0.5, 16, i);
      }
      forChunks(track, rg.start, rg.count, 120, (i0, rows) => {
        const r = Math.max(1, rows);
        for (const [polys, mat, bake] of [
          [concrete, concreteMat, true],
          [seats, seatMat, true],
          [roof, roofMat, true],
          [down, downMat, false],
        ]) {
          const g = sweep(track, i0, r, polys);
          if (bake) baker.bake(g);
          group.add(new THREE.Mesh(g, mat));
        }
        const ga = sweep(track, i0, r, ads, { attrs: [{ name: 'aFlip', fn: () => -side }] });
        group.add(new THREE.Mesh(ga, adMat));
      });
      // crowd on the treads
      const spacing = density > 0.8 ? 0.85 : 1.3;
      const stepI = spacing / track.ds;
      for (let k = 0; k < steps; k++) {
        const d = side * (d0 + k * stepD + stepD * 0.5);
        const h = hk(k + 1);
        for (let f = 0; f < rg.count; f += stepI) {
          if (rand() < 0.12) continue;
          const i = (rg.start + Math.floor(f)) % track.n;
          crowd.push({ i, d: d + (rand() - 0.5) * 0.3, h, side });
        }
      }
    }
    // floodlight wash over the grandstand
    const mid = Math.floor((sec.s0 + ((sec.s1 - sec.s0 + track.length) % track.length) / 2) / track.ds) % track.n;
    baker.addPoint(track.px[mid] + track.rx[mid] * side * (W + 6), track.py[mid] + 20, track.pz[mid] + track.rz[mid] * side * (W + 6), '#ffffff', 0.4, 90, mid);
  }

  if (crowd.length) {
    const geo = new THREE.PlaneGeometry(0.55, 1.0);
    geo.translate(0, 0.5, 0);
    const attr = new Float32Array(crowd.length * 4);
    const light = new Float32Array(crowd.length * 3);
    geo.setAttribute('aCrowd', new THREE.InstancedBufferAttribute(attr, 4));
    geo.setAttribute('aLight', new THREE.InstancedBufferAttribute(light, 3));
    const mat = createCrowdMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, crowd.length);
    const shirt = [palette.primary, palette.secondary, '#ffffff', '#222222', '#3060ff', '#ff3030', '#ffd23f'];
    const tc = new THREE.Color();
    const tmp = [0, 0, 0];
    crowd.forEach((c, n) => {
      const i = c.i;
      _p.set(
        track.px[i] + track.rx[i] * c.d + track.ux[i] * c.h,
        track.py[i] + track.ry[i] * c.d + track.uy[i] * c.h,
        track.pz[i] + track.rz[i] * c.d + track.uz[i] * c.h,
      );
      const rx = track.rx[i];
      const rz = track.rz[i];
      _q.setFromAxisAngle(_y.set(0, 1, 0), Math.atan2(-c.side * rx, -c.side * rz));
      _s.set(0.9 + rand() * 0.25, 0.9 + rand() * 0.3, 1);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(n, _m);
      tc.set(shirt[Math.floor(rand() * shirt.length)]).multiplyScalar(0.5 + rand() * 0.6);
      attr[n * 4] = tc.r;
      attr[n * 4 + 1] = tc.g;
      attr[n * 4 + 2] = tc.b;
      attr[n * 4 + 3] = rand();
      baker.sample(i, _p.x, _p.y + 0.8, _p.z, tmp);
      light.set(tmp, n * 3);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    group.userData.crowdMat = mat;
  }

  // ---- Floodlight masts: tapered steel mast, maintenance platform, a tilted frame holding a
  // 5 x 3 bank of floodlights aimed at the track
  const steelGeo = [];
  const lensGeo = [];
  const coneGeo = [];
  const flarePos = [];
  const add = (list, g, mtx) => {
    if (g.attributes.uv) g.deleteAttribute('uv');
    list.push((g.index ? g.toNonIndexed() : g).applyMatrix4(mtx));
  };
  for (const t of towers) {
    const i = t.i;
    const off = t.side * (W + 12);
    const base = new THREE.Vector3(track.px[i] + track.rx[i] * off, track.py[i] - 1, track.pz[i] + track.rz[i] * off);
    const inward = new THREE.Vector3(-t.side * track.rx[i], 0, -t.side * track.rz[i]).normalize();
    const yaw = Math.atan2(inward.x, inward.z);
    const mtx = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    add(steelGeo, new THREE.CylinderGeometry(0.42, 0.85, H, 12).translate(0, H / 2, 0), mtx);
    add(steelGeo, new THREE.CylinderGeometry(1.1, 1.3, 0.6, 12).translate(0, 0.3, 0), mtx);
    add(steelGeo, new THREE.BoxGeometry(7.6, 0.2, 2.0).translate(0, H - 0.7, 0.6), mtx);
    for (const sx of [-1, 1]) add(steelGeo, new THREE.BoxGeometry(0.06, 1.0, 2.0).translate(sx * 3.78, H - 0.15, 0.6), mtx);
    add(steelGeo, new THREE.BoxGeometry(7.6, 1.0, 0.06).translate(0, H - 0.15, 1.58), mtx);
    // the lamp bank, tilted so the lamps aim down at the track
    const tilt = Math.atan2(H - 1, W + 12);
    const head = new THREE.Matrix4().compose(new THREE.Vector3(0, H + 1.6, 0.25), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt), new THREE.Vector3(1, 1, 1));
    const hm = mtx.clone().multiply(head);
    add(steelGeo, new THREE.BoxGeometry(7.4, 4.2, 0.25).translate(0, 0, -0.45), hm);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const x = (c - 2) * 1.42;
        const y = (r - 1) * 1.32;
        add(steelGeo, new THREE.BoxGeometry(1.15, 1.05, 0.62).translate(x, y, -0.05), hm);
        add(lensGeo, new THREE.PlaneGeometry(0.95, 0.85).translate(x, y, 0.27), hm);
      }
    }
    // volumetric cone pointing from the lamps toward the track
    const target = new THREE.Vector3(track.px[i], track.py[i], track.pz[i]);
    const from = new THREE.Vector3(0, H + 1.6, 0.5).applyMatrix4(mtx);
    const dir = target.clone().sub(from);
    const len = dir.length() * 1.15;
    const cone = new THREE.CylinderGeometry(3.2, 15, len, 18, 1, true);
    cone.translate(0, -len / 2, 0); // apex at origin, opening downward
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize()));
    cone.translate(from.x, from.y, from.z);
    coneGeo.push(cone.toNonIndexed());
    flarePos.push(from);
  }
  if (towers.length) {
    group.add(new THREE.Mesh(mergeGeometries(steelGeo), new THREE.MeshStandardMaterial({ color: 0x2a2d35, metalness: 0.6, roughness: 0.5, emissive: new THREE.Color(0.012, 0.013, 0.016) })));
    group.add(new THREE.Mesh(mergeGeometries(lensGeo), new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 5.7, 6.2) })));
    if (opts.cones !== false) {
      const cones = new THREE.Mesh(mergeGeometries(coneGeo), createConeMaterial('#dfe8ff', opts.coneIntensity ?? 0.16));
      cones.renderOrder = 4;
      group.add(cones);
    }
    // lens flares as instanced billboards
    const flareGeo = new THREE.PlaneGeometry(1, 1);
    const flareMat = additive(
      new THREE.ShaderMaterial({
        uniforms: { uTime: globalUniforms.uTime },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float dist = -mv.z;
            float size = 2.4 + dist * 0.008;
            mv.xy += position.xy * vec2(size * 2.2, size);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            float r = length(p * vec2(1.0, 2.2));
            float core = exp(-r * 10.0) * 0.8;
            float streak = exp(-abs(p.y) * 60.0) * exp(-abs(p.x) * 4.0) * 0.2;
            vec3 c = vec3(1.0, 0.98, 1.0) * core + vec3(0.55, 0.7, 1.0) * streak;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    const flares = new THREE.InstancedMesh(flareGeo, flareMat, flarePos.length);
    flarePos.forEach((p, n) => {
      _m.makeTranslation(p.x, p.y, p.z);
      flares.setMatrixAt(n, _m);
    });
    flares.computeBoundingSphere();
    flares.frustumCulled = false;
    flares.renderOrder = 6;
    group.add(flares);
  }

  // ---- Big screen + sponsor sign beside the main straight
  {
    const i = Math.floor(30 / track.ds);
    const side = 1;
    const off = side * (W + 16);
    const P = new THREE.Vector3(track.px[i] + track.rx[i] * off, track.py[i], track.pz[i] + track.rz[i] * off);
    const inward = new THREE.Vector3(-side * track.rx[i], 0, -side * track.rz[i]).normalize();
    const T = new THREE.Vector3(track.tx[i], 0, track.tz[i]).normalize();
    // angle the screen toward approaching cars
    const face = inward.clone().multiplyScalar(0.6).addScaledVector(T, -0.8).normalize();
    const yaw = Math.atan2(face.x, face.z);
    const screenMat = new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime, uA: { value: new THREE.Color(palette.primary) }, uB: { value: new THREE.Color(palette.accent) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
        void main(){
          vec2 uv = vUv;
          float bars = sin(uv.x * 18.0 + uTime * 3.0) * 0.5 + 0.5;
          float wave = smoothstep(0.02, 0.0, abs(uv.y - 0.5 - 0.25 * sin(uv.x * 9.0 - uTime * 4.0)));
          vec3 c = mix(uA, uB, bars) * 0.6 + vec3(1.0) * wave * 1.5;
          c *= 0.85 + 0.15 * step(0.5, fract(uv.y * 120.0));
          c *= smoothstep(0.0, 0.02, uv.x) * smoothstep(1.0, 0.98, uv.x) * smoothstep(0.0, 0.03, uv.y) * smoothstep(1.0, 0.97, uv.y);
          gl_FragColor = vec4(c * 0.7, 1.0);
        }`,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(22, 12.4), screenMat);
    screen.position.copy(P).add(new THREE.Vector3(0, 14, 0));
    screen.rotation.y = yaw;
    group.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(23.2, 13.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x15161c, metalness: 0.5, roughness: 0.6 }));
    frame.position.copy(screen.position).addScaledVector(face, -0.45);
    frame.rotation.y = yaw;
    group.add(frame);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 0.6), frame.material);
    legs.position.copy(P).add(new THREE.Vector3(0, 4, 0)).addScaledVector(face, -0.6);
    legs.rotation.y = yaw;
    group.add(legs);
    baker.addPoint(screen.position.x + face.x * 8, screen.position.y - 6, screen.position.z + face.z * 8, palette.primary, 0.7, 45, i);

    // giant sponsor sign
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.font = '900 150px Orbitron, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = palette.primary;
    ctx.shadowBlur = 10;
    ctx.fillStyle = palette.primary;
    ctx.fillText('OVERDRIVE', 512, 136);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(44, 11), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6), transparent: false }));
    const i2 = Math.floor(170 / track.ds);
    const off2 = -(W + 34);
    sign.position.set(track.px[i2] + track.rx[i2] * off2, track.py[i2] + 26, track.pz[i2] + track.rz[i2] * off2);
    const in2 = new THREE.Vector3(track.rx[i2], 0, track.rz[i2]).normalize();
    const f2 = in2.clone().multiplyScalar(0.7).addScaledVector(new THREE.Vector3(track.tx[i2], 0, track.tz[i2]).normalize(), -0.7).normalize();
    sign.rotation.y = Math.atan2(f2.x, f2.z);
    group.add(sign);
    baker.addPoint(sign.position.x + f2.x * 10, sign.position.y - 10, sign.position.z + f2.z * 10, palette.primary, 0.6, 60, i2);
  }

  // ---- Catch fences along stadium sections
  if (stadiumSecs.length && density > 0.5) {
    const fenceMat = new THREE.ShaderMaterial({
      uniforms: { uFogColor: globalUniforms.uFogColor, uFogDensity: globalUniforms.uFogDensity, uAmbient: globalUniforms.uAmbient },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 aLight; varying vec3 vLight; varying vec2 vUv; varying float vFogDepth;
        void main(){ vLight = aLight; vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uAmbient;
        varying vec3 vLight; varying vec2 vUv; varying float vFogDepth;
        void main(){
          vec2 p = vec2(vUv.y, vUv.x * 4.0) / 0.12;
          vec2 a = abs(fract(vec2(p.x + p.y, p.x - p.y) * 0.5) - 0.5);
          float w = fwidth(p.x) * 0.6;
          float wire = 1.0 - smoothstep(0.04, 0.04 + w, min(a.x, a.y));
          float post = step(0.97, fract(vUv.y / 4.0));
          float alpha = max(wire * smoothstep(1.5, 0.3, w * 10.0), post);
          if (alpha < 0.5) discard;
          vec3 c = vec3(0.35) * (vLight + uAmbient * 0.5) * 1.5;
          float d = uFogDensity * vFogDepth;
          c = mix(c, uFogColor, 1.0 - exp(-d * d));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    for (const sec of stadiumSecs) {
      const rgs = ranges(track, (i) => inRange(i * track.ds, sec.s0, sec.s1));
      for (const rg of rgs) {
        forChunks(track, rg.start, rg.count, 120, (i0, rows) => {
          const g = sweep(track, i0, Math.max(1, rows), [
            [[-(W + 1.25), 1.1, 0], [-(W + 1.25), 4.2, 1]],
            [[W + 1.25, 1.1, 0], [W + 1.25, 4.2, 1]],
          ]);
          baker.bake(g);
          group.add(new THREE.Mesh(g, fenceMat));
        });
      }
    }
  }

  return group;
}
