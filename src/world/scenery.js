import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { globalUniforms, HEADLIGHTS_GLSL } from './materials.js';
import { createHaloMaterial } from './decor-common.js';
import { createGlintMaterial } from './decor-harbour.js';

// Sets modelled in Blender round a track (tools/blender/scenery): a .glb of meshes whose night
// lighting is baked in (each corner's light and sky in its colour, encoded as the bake left it),
// the set's own data in the scene's extras (its lamps, the ground's rectangle, the water), the
// ground's light and colour maps beside it. The game still builds the road, the barriers and the
// physics; the set's lamps light the road through the light map (a zone in the light baker).

const BASE = 'models/scenery/';
const ready = new Map(); // id -> prepared set
const pending = new Map(); // id -> promise of it
let loader = null;

async function getLoader() {
  if (loader) return loader;
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')]);
  if (loader) return loader;
  loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('draco/');
  loader.setDRACOLoader(draco);
  return loader;
}

/** The .glb's bytes: the gzipped twin where the browser can unpack it, else the plain file. */
async function fetchSet(file) {
  const get = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  if (typeof DecompressionStream !== 'undefined') {
    try {
      let bytes = await get(`${BASE}${file}.gz`);
      // (some servers already undo the gzip)
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      return bytes.buffer;
    } catch (err) {
      console.warn('[scenery] gzipped set unavailable, using the plain file', err);
    }
  }
  return (await get(`${BASE}${file}`)).buffer;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`couldn't load ${url}`));
    img.src = url;
  });
}

/**
 * Download and prepare a set once. lite: the light version (low quality: the trees far from the road
 * left out). Resolves to the set, or null if it can't be had (never throws).
 */
export function ensureScenery(id, lite = false) {
  if (!id) return Promise.resolve(null);
  const key = `${id}|${lite ? 'm' : 'full'}`;
  if (ready.has(key)) return Promise.resolve(ready.get(key));
  if (!pending.has(key)) {
    pending.set(
      key,
      (async () => {
        try {
          const [ldr, bytes] = await Promise.all([getLoader(), fetchSet(lite ? `${id}.m.glb` : `${id}.glb`)]);
          const gltf = await ldr.parseAsync(bytes, BASE);
          const data = JSON.parse(gltf.scene.userData?.scenery || '{}');
          const [lightImg, groundImg] = await Promise.all([loadImage(BASE + data.lightMap), loadImage(BASE + data.groundMap)]);
          const set = prepare(gltf, data, lightImg, groundImg);
          ready.set(key, set);
          // (one version at a time: the other's geometry can go)
          const other = `${id}|${lite ? 'full' : 'm'}`;
          ready.get(other)?.parts.forEach((p) => p.geometry.dispose());
          ready.delete(other);
          pending.delete(other);
          return set;
        } catch (err) {
          console.warn(`[scenery] couldn't load the set "${id}"`, err);
          pending.delete(key);
          return null;
        }
      })(),
    );
  }
  return pending.get(key);
}

/** A set that's been loaded (the version asked for, else the other), or null. */
export function getScenery(id, lite = false) {
  if (!id) return null;
  return ready.get(`${id}|${lite ? 'm' : 'full'}`) || ready.get(`${id}|${lite ? 'full' : 'm'}`) || null;
}

function prepare(gltf, data, lightImg, groundImg) {
  gltf.scene.updateMatrixWorld(true);
  // the set comes in pieces about 200 m across (Draco's precision is per piece): one mesh per
  // material here, so it draws in a dozen calls
  const byMat = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material?.name || 'stone';
    if (!byMat.has(name)) byMat.set(name, { name, role: name.split('.')[0], color: o.material.color?.clone() ?? new THREE.Color(0.5, 0.5, 0.5), geos: [] });
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    byMat.get(name).geos.push(g);
    o.geometry.dispose();
  });
  const parts = [];
  for (const m of byMat.values()) {
    const geometry = m.geos.length > 1 ? mergeGeometries(m.geos, false) : m.geos[0];
    if (!geometry) {
      console.warn(`[scenery] couldn't merge the "${m.name}" pieces`);
      continue;
    }
    if (m.geos.length > 1) for (const g of m.geos) g.dispose();
    geometry.computeBoundingSphere();
    parts.push({ geometry, role: m.role, name: m.name, color: m.color });
  }
  const tex = (img, srgb) => {
    const t = new THREE.Texture(img);
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  // the light map's pixels, for the road's light (the baker samples them)
  const c = document.createElement('canvas');
  c.width = lightImg.width;
  c.height = lightImg.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(lightImg, 0, 0);
  const pixels = g.getImageData(0, 0, c.width, c.height).data;
  return { data, parts, lightTex: tex(lightImg, false), groundTex: tex(groundImg, true), pixels, mapW: c.width, mapH: c.height };
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
const NOISE = /* glsl */ `
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;
// the bake's encoding: light = rgb^2 * max, sky = a
const DECODE = /* glsl */ `
  uniform float uLightMax;
  vec3 bakedLight(vec4 c) { return c.rgb * c.rgb * uLightMax; }
`;

/** The ground: its colour map lit by the light map, the night sky's ambient where it's open. */
function createGroundMaterial(set) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAmbient: globalUniforms.uAmbient,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uWet: globalUniforms.uWet,
      uHeadPos: globalUniforms.uHeadPos,
      uHeadFwd: globalUniforms.uHeadFwd,
      uHeadUp: globalUniforms.uHeadUp,
      uHeadParams: globalUniforms.uHeadParams,
      uHeadColor: globalUniforms.uHeadColor,
      uLight: { value: set.lightTex },
      uAlbedo: { value: set.groundTex },
      uLightMax: { value: set.data.lightMax ?? 8 },
      uBrightness: { value: 2.6 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vFogDepth;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uLight;
      uniform sampler2D uAlbedo;
      uniform vec3 uAmbient;
      uniform float uBrightness;
      uniform float uWet;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vN;
      ${FOG}
      ${NOISE}
      ${DECODE}
      ${HEADLIGHTS_GLSL}
      void main() {
        vec3 alb = texture2D(uAlbedo, vUv).rgb;
        // close up the map is soft: blades and clods
        float n = vnoise(vWorld.xz * 2.7) * 0.6 + vnoise(vWorld.xz * 9.0) * 0.4;
        alb *= 0.78 + 0.44 * n;
        alb *= 1.0 - 0.25 * uWet;
        vec4 lm = texture2D(uLight, vUv);
        vec3 light = bakedLight(lm) + uAmbient * 0.6 * lm.a + headlights(vWorld, normalize(vN), 0.0);
        gl_FragColor = vec4(fogged(alb * light * uBrightness, 1.0), 1.0);
      }`,
  });
}

/** Everything else: its colour lit by the light baked into its corners. Leaves get a leafy mottle. */
function createBakedMaterial(color, role) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uAmbient: globalUniforms.uAmbient,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uWet: globalUniforms.uWet,
      uHeadPos: globalUniforms.uHeadPos,
      uHeadFwd: globalUniforms.uHeadFwd,
      uHeadUp: globalUniforms.uHeadUp,
      uHeadParams: globalUniforms.uHeadParams,
      uHeadColor: globalUniforms.uHeadColor,
      uColor: { value: color },
      uLightMax: { value: 8 },
      uLeaves: { value: role === 'leaves' ? 1 : 0 },
      uBrightness: { value: 2.6 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 color;
      varying vec4 vBake;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vFogDepth;
      void main() {
        vBake = color;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uAmbient;
      uniform float uLeaves;
      uniform float uBrightness;
      uniform float uWet;
      varying vec4 vBake;
      varying vec3 vWorld;
      varying vec3 vN;
      ${FOG}
      ${NOISE}
      ${DECODE}
      ${HEADLIGHTS_GLSL}
      void main() {
        vec3 n = normalize(vN);
        vec3 alb = uColor;
        if (uLeaves > 0.5) {
          // clusters of leaves, darker gaps between them
          vec3 p = vWorld * 1.9;
          float m = vnoise(p.xz + p.y * 0.7) * 0.55 + vnoise(p.zy * 1.7 + 3.1) * 0.45;
          alb *= 0.55 + 0.9 * m;
        } else {
          alb *= 1.0 - 0.3 * uWet;
        }
        vec3 light = bakedLight(vBake) + uAmbient * 0.6 * vBake.a + headlights(vWorld, n, 0.0);
        // leaves right by a lamp roll off instead of burning out flat: they keep their texture
        if (uLeaves > 0.5) light = 2.5 * (1.0 - exp(-light / 2.5));
        gl_FragColor = vec4(fogged(alb * light * uBrightness, 1.0), 1.0);
      }`,
  });
  // (a part that came without its bake stays dim, not lit white)
  mat.defaultAttributeValues = { ...mat.defaultAttributeValues, color: [0.08, 0.08, 0.08, 0.6] };
  return mat;
}

/**
 * The glasshouse's glass: lit from inside, warm, brightest up under the lamps; its glazing bars and
 * the palms and ferns inside dark against it. base: the height of its floor.
 */
function createGlasshouseMaterial(base) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uColor: { value: new THREE.Color(1.0, 0.74, 0.45) },
      uBase: { value: base },
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
      uniform vec3 uColor;
      uniform float uBase;
      varying vec3 vWorld;
      ${FOG}
      ${NOISE}
      void main() {
        float y = vWorld.y - uBase;
        // the panes: glazing bars every 0.6 m along, 0.9 m up
        vec2 g = abs(fract(vec2(vWorld.x + vWorld.z, y) / vec2(0.6, 0.9)) - 0.5);
        float bar = smoothstep(0.4, 0.46, max(g.x, g.y));
        // the plants inside: fronds thickest low down, against the glow of lamps hung high
        vec2 p = vec2((vWorld.x + vWorld.z) * 0.7, y);
        float n = vnoise(p * vec2(1.3, 0.9)) * 0.7 + vnoise(p * 3.1) * 0.3;
        float leaf = smoothstep(0.4, 0.68, n) * (0.25 + 0.75 * (1.0 - smoothstep(2.0, 9.0, y)));
        vec3 col = uColor * (0.4 + 0.38 * smoothstep(1.0, 10.0, y));
        col = mix(col, col * vec3(0.16, 0.22, 0.1), leaf * 0.9);
        col *= 1.0 - 0.6 * bar;
        gl_FragColor = vec4(fogged(col, 0.8), 1.0);
      }`,
  });
}

/**
 * A lit room seen through its glass, drawn on the pane: an office (the ceiling's lights along the
 * top, desks and partitions darker low down) or a garage (a workshop's tube lights, its back wall,
 * tool chests and a bench). span: the panes' bottom and top heights.
 */
function createRoomMaterial(span, kind = 'office') {
  const garage = kind === 'garage';
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uColor: { value: garage ? new THREE.Color(0.92, 0.95, 1.0) : new THREE.Color(1.0, 0.86, 0.66) },
      uSpan: { value: new THREE.Vector2(span[0], span[1]) },
      uGarage: { value: garage ? 1 : 0 },
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
      uniform vec3 uColor;
      uniform vec2 uSpan;
      uniform float uGarage;
      varying vec3 vWorld;
      ${FOG}
      ${NOISE}
      float band(float t, float a, float b) { return smoothstep(a - 0.015, a + 0.015, t) * (1.0 - smoothstep(b - 0.015, b + 0.015, t)); }
      void main() {
        float t = clamp((vWorld.y - uSpan.x) / max(uSpan.y - uSpan.x, 0.1), 0.0, 1.0);
        float along = vWorld.x + vWorld.z;
        float k;
        if (uGarage > 0.5) {
          float tubes = band(t, 0.7, 0.75) * step(0.3, fract(along / 2.2));
          float chests = band(t, 0.04, 0.26) * step(0.4, fract(along / 2.9 + 0.3));
          float bench = band(t, 0.24, 0.27);
          k = (0.45 + 0.2 * smoothstep(0.0, 0.7, t)) * (1.0 - 0.6 * chests - 0.5 * bench) + 1.1 * tubes;
        } else {
          float lights = band(t, 0.84, 0.94) * (0.55 + 0.45 * step(0.45, fract(along / 1.8)));
          float desks = (1.0 - smoothstep(0.3, 0.38, t)) * (0.45 + 0.55 * vnoise(vec2(along * 1.1, 2.0)));
          k = (0.2 + 0.32 * smoothstep(0.2, 0.8, t)) * (1.0 - 0.65 * desks) + 1.3 * lights;
        }
        gl_FragColor = vec4(fogged(uColor * k, 0.9), 1.0);
      }`,
  });
}

/**
 * The lake (and the stream): rippled, the night sky in it with the city's glow along the horizon,
 * the lamps' light spilling across it near the shore (the light map has it on the lake's bed: the
 * bake looks through the water).
 */
function createLakeMaterial(palette, set, mirror) {
  const [x0, z0, x1, z1] = set.data.rect;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalUniforms.uTime,
      uAmbient: globalUniforms.uAmbient,
      uFogColor: globalUniforms.uFogColor,
      uFogDensity: globalUniforms.uFogDensity,
      uSkyGlow: globalUniforms.uSkyGlow,
      uSkyTop: { value: new THREE.Color(palette.skyTop ?? '#010205') },
      uHorizon: { value: new THREE.Color(palette.skyHorizon ?? '#0c1220') },
      uLight: { value: set.lightTex },
      uLightMax: { value: set.data.lightMax ?? 8 },
      // the light map's rectangle: its left and far edges, 1 / its size (its rows run from z1 down)
      uRect: { value: new THREE.Vector4(x0, z1, 1 / (x1 - x0), 1 / (z1 - z0)) },
      uMirror: { value: mirror ? -1 : 1 },
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
      uniform sampler2D uLight;
      uniform vec4 uRect;
      uniform float uMirror;
      varying vec3 vWorld;
      ${FOG}
      ${NOISE}
      ${DECODE}
      void main() {
        vec2 p = vWorld.xz;
        // two layers of ripples drifting different ways
        vec2 q1 = p * 0.13 + vec2(uTime * 0.05, uTime * 0.03);
        vec2 q2 = p * 0.37 - vec2(uTime * 0.07, -uTime * 0.04);
        float e = 0.5;
        vec2 grad = vec2(vnoise(q1 + vec2(e, 0.0)) - vnoise(q1 - vec2(e, 0.0)), vnoise(q1 + vec2(0.0, e)) - vnoise(q1 - vec2(0.0, e)));
        grad += 0.6 * vec2(vnoise(q2 + vec2(e, 0.0)) - vnoise(q2 - vec2(e, 0.0)), vnoise(q2 + vec2(0.0, e)) - vnoise(q2 - vec2(0.0, e)));
        vec3 nrm = normalize(vec3(-grad.x * 0.16, 1.0, -grad.y * 0.16));
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 R = reflect(V, nrm);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, nrm), 0.0), 5.0);
        // the sky it mirrors, as the sky itself is drawn: dark overhead, the city's glow low down
        float h = clamp(R.y, 0.0, 1.0);
        vec3 sky = mix(uHorizon, uSkyTop, pow(clamp(h * 1.5, 0.0, 1.0), 0.5)) + uSkyGlow * (exp(-h * 7.0) * 0.6 + exp(-h * 28.0) * 0.4);
        vec3 col = mix(vec3(0.006, 0.01, 0.016) + uAmbient * 0.03, sky, fres);
        // the lamps' light on it (water takes up little of it)
        vec2 uv = vec2((vWorld.x * uMirror - uRect.x) * uRect.z, (uRect.y - vWorld.z) * uRect.w);
        col += bakedLight(texture2D(uLight, uv)) * 0.12 * (0.6 + 0.8 * vnoise(q2 * 2.0));
        gl_FragColor = vec4(fogged(col, 0.85), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// The set in a race
// ---------------------------------------------------------------------------------------
/**
 * The set as a group for a race, and its lamps' light on the road: the baker gets a zone that
 * reads the light map (mirrored with the track when it is).
 */
export function buildScenery(set, track, baker, palette, variant = {}) {
  const mirror = !!variant.mirror;
  const group = new THREE.Group();
  group.name = 'scenery';
  const inner = new THREE.Group();
  if (mirror) inner.scale.x = -1;
  group.add(inner);
  const ground = createGroundMaterial(set);
  const lake = createLakeMaterial(palette, set, mirror);
  const glass = set.parts.find((p) => p.role === 'glass');
  glass?.geometry.computeBoundingBox();
  // (the lit rooms' panes: their bottoms and tops)
  const span = (name) => {
    const p = set.parts.find((q) => q.name === name);
    if (!p) return [0, 1];
    p.geometry.computeBoundingBox();
    return [p.geometry.boundingBox.min.y, p.geometry.boundingBox.max.y];
  };
  // the things that shine: lamp glass, lit windows (the offices' and garages' rooms behind theirs),
  // floodlights, the glasshouse
  const glows = {
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.82, 0.58).multiplyScalar(3.2) }),
    window: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.66).multiplyScalar(1.05) }),
    'window.dim': createRoomMaterial(span('window.dim'), 'office'),
    'window.garage': createRoomMaterial(span('window.garage'), 'garage'),
    flood: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.88, 0.94, 1.0).multiplyScalar(6.0) }),
    glass: createGlasshouseMaterial(glass ? glass.geometry.boundingBox.min.y : 0),
  };
  const baked = new Map();
  for (const p of set.parts) {
    let mat;
    if (p.role === 'ground') mat = ground;
    else if (p.role === 'water') mat = lake;
    else if (glows[p.name] || glows[p.role]) mat = glows[p.name] || glows[p.role];
    else {
      if (!baked.has(p.name)) baked.set(p.name, createBakedMaterial(p.color, p.role));
      mat = baked.get(p.name);
    }
    const m = new THREE.Mesh(p.geometry, mat);
    m.name = `scenery-${p.name}`;
    inner.add(m);
  }

  // the lamps' light on the road (and the cars), from the light map
  const d = set.data;
  const [x0, z0, x1, z1] = d.rect;
  const W = set.mapW;
  const H = set.mapH;
  const px = set.pixels;
  const max = d.lightMax ?? 8;
  const tap = (i, j, k) => {
    const v = px[(j * W + i) * 4 + k] / 255;
    return v * v * max;
  };
  baker.addZone((i, x, y, z, out) => {
    const sx = mirror ? -x : x;
    const u = ((sx - x0) / (x1 - x0)) * W - 0.5;
    const v = ((z1 - z) / (z1 - z0)) * H - 0.5;
    if (u < 0 || v < 0 || u >= W - 1 || v >= H - 1) return;
    const iu = Math.floor(u);
    const iv = Math.floor(v);
    const fu = u - iu;
    const fv = v - iv;
    for (let k = 0; k < 3; k++) {
      const a = tap(iu, iv, k) * (1 - fu) + tap(iu + 1, iv, k) * fu;
      const b = tap(iu, iv + 1, k) * (1 - fu) + tap(iu + 1, iv + 1, k) * fu;
      out[k] += a * (1 - fv) + b * fv;
    }
  });

  // halos round the lamps, their glints on the lake
  const lights = (d.lights || []).map((L) => ({ ...L, p: [mirror ? -L.p[0] : L.p[0], L.p[1], L.p[2]] }));
  // (the lamps inside the garages and under the stand's roof get none)
  const halos = { road: [], lantern: [], flood: [], bandstand: [] };
  for (const L of lights) halos[L.kind]?.push(L);
  const _m = new THREE.Matrix4();
  for (const [kind, size, k, col] of [['road', 3.2, 0.42, '#ffcc90'], ['lantern', 2.0, 0.38, '#ffcc90'], ['flood', 9.0, 0.5, '#e4eeff'], ['bandstand', 4.0, 0.3, '#ffcc90']]) {
    const list = halos[kind];
    if (!list.length) continue;
    const hm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), createHaloMaterial(col, k), list.length);
    list.forEach((L, n) => hm.setMatrixAt(n, _m.makeScale(size, size, size).setPosition(L.p[0], L.p[1], L.p[2])));
    hm.renderOrder = 3;
    hm.computeBoundingSphere();
    group.add(hm);
  }
  if (d.waterY != null) {
    const glints = lights.filter((L) => L.p[1] - d.waterY < 12 && nearWater(set, L.p, mirror));
    if (glints.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
      geo.setIndex([0, 2, 1, 0, 3, 2]);
      const ig = new THREE.InstancedBufferGeometry().copy(geo);
      ig.instanceCount = glints.length;
      ig.setAttribute('aFoot', new THREE.InstancedBufferAttribute(new Float32Array(glints.flatMap((L) => [L.p[0], d.waterY, L.p[2], L.p[1] - d.waterY])), 4));
      ig.setAttribute('aGlint', new THREE.InstancedBufferAttribute(new Float32Array(glints.flatMap((L) => [...L.color, L.kind === 'road' ? 0.3 : 0.4])), 4));
      const gm = new THREE.Mesh(ig, createGlintMaterial());
      gm.frustumCulled = false;
      gm.renderOrder = 2;
      gm.name = 'glints';
      group.add(gm);
    }
  }
  return group;
}

/** A lamp close enough to the water to shine on it (its light map says the ground below is lake). */
function nearWater(set, p, mirror) {
  const d = set.data;
  const water = set.parts.find((q) => q.role === 'water');
  if (!water) return false;
  water.geometry.computeBoundingBox();
  const b = water.geometry.boundingBox;
  const x = mirror ? -p[0] : p[0];
  return x > b.min.x - 20 && x < b.max.x + 20 && p[2] > b.min.z - 20 && p[2] < b.max.z + 20 && d.waterY != null;
}
