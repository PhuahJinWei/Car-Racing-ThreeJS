import * as THREE from 'three';
import { CARS, getCarDef } from './car-defs.js';

// Real 3D car models (.glb) listed in public/models/cars/cars.json.
// Each model is normalised once (orientation, scale, ground contact) and analysed:
// wheels are found by name or shape, materials are sorted into paint / glass / lights /
// tyres / rims so the game can repaint the car, spin the wheels and drive the lights.

const BASE = 'models/cars/';
let loader = null;
let manifestPromise = null;
// keyed by `${id}|${version}`: 'full', or 'light' (the phone file: a mid-detail near model)
const assetPromises = new Map();
const assets = new Map();
// Each prepared model holds several MB of geometry (JS and GPU). The ones car models are using
// stay loaded; of the rest only the few used last are kept, so browsing a big roster in the garage
// doesn't pile them all up. A freed model loads again from the browser cache when needed.
const IDLE_KEEP = 3;
let useClock = 0;
// which version of each model to load and hand out (see setCarDetail)
let detail = 'full';

const RE = {
  wheel: /wheel|tire|tyre|rim\b|rims|felge|reifen|roue|rueda|llanta|caliper|brake[_ ]?disc|rotor/i,
  notWheel: /arch|well|house|fender|steering|spare/i,
  tire: /tire|tyre|rubber|reifen|pneu|gomma/i,
  glass: /glass|window|windshield|windscreen|scheibe|vitre|cristal|vetro/i,
  light: /light|lamp|headl|taill|brake[_ ]?l|indicator|blinker|signal|drl|reverse[_ ]?l/i,
  notLight: /highlight|lightweight/i,
  paint: /paint|\bbody|bodywork|exterior|karosserie|lackierung|\bcoat\b|\bshell\b/i,
  notPaint: /interior|seat|dash|steering|under|floor|tire|tyre|glass|light/i,
};

/** The glTF loader (and its decoders) is only downloaded once a model is actually needed. */
async function getLoader(renderer) {
  if (loader) return loader;
  const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/loaders/DRACOLoader.js'),
    import('three/addons/loaders/KTX2Loader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  if (loader) return loader;
  loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('draco/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (renderer) {
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath('basis/');
    ktx2.detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  }
  return loader;
}

/**
 * Load cars.json once. Entries can attach a model to an existing car id, or add brand new
 * cars (inheriting stats from `base`). Returns the list of entries.
 */
export function loadManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(BASE + 'cars.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { cars: [] }))
    .catch(() => ({ cars: [] }))
    .then((data) => {
      const list = Array.isArray(data) ? data : data.cars || [];
      for (const e of list) {
        if (!e || !e.id || !e.file) continue;
        let def = CARS.find((c) => c.id === e.id);
        if (!def) {
          const base = getCarDef(e.base || 'volt');
          def = JSON.parse(JSON.stringify(base));
          def.id = e.id;
          def.name = (e.name || e.id).toUpperCase();
          def.class = (e.class || base.class).toUpperCase();
          def.price = e.price ?? base.price;
          def.blurb = e.blurb || base.blurb;
          CARS.push(def);
        }
        if (e.name) def.name = e.name.toUpperCase();
        if (e.class) def.class = e.class.toUpperCase();
        if (e.price != null) def.price = e.price;
        if (e.blurb) def.blurb = e.blurb;
        // its own words are shown as written (the translations follow the built-in catalogue)
        if (e.class || e.blurb) def.ownText = true;
        if (e.stats) Object.assign(def.stats, e.stats);
        if (e.display) Object.assign(def.display, e.display);
        // `v` (written by the car factory) busts caches whenever a model is rebuilt
        const q = e.v ? `?v=${e.v}` : '';
        def.model = { ...e, url: BASE + e.file + q, gzUrl: e.gz ? BASE + e.file + '.gz' + q : null };
        if (e.light?.file) {
          const lq = e.light.v ? `?v=${e.light.v}` : '';
          def.model.light = { url: BASE + e.light.file + lq, gzUrl: e.gz ? BASE + e.light.file + '.gz' + lq : null };
        }
      }
      return list;
    });
  return manifestPromise;
}

export function hasModel(id) {
  return !!getCarDef(id).model;
}

/** Real models bring their own wheels; car-factory models get generated (restylable) ones. */
export function hasOwnWheels(id) {
  const m = getCarDef(id).model;
  return !!m && !m.factory;
}

/**
 * 'full' or 'light': which version of the car models to load and use from now on (your car, the
 * garage). Light (for phones) has a mid-detail near model and downloads about 40% less; cars already
 * built keep theirs. The cars only seen in passing - rivals, the menu street's traffic - ask for the
 * light version on every quality (see ensureCarAssets).
 */
export function setCarDetail(d) {
  detail = d === 'light' ? 'light' : 'full';
}

const versionOf = (def, want = detail) => (want === 'light' && def.model?.light ? 'light' : 'full');

/**
 * Prepared asset for a car id, in the version in use (or `want`), or null if none is loaded. A full
 * model stands in for a light one, never the other way round: a car met only as a rival still gets
 * its full model in the garage.
 */
export function getCarAsset(id, want) {
  const def = getCarDef(id);
  const version = versionOf(def, want);
  return assets.get(`${id}|${version}`) || (version === 'light' && assets.get(`${id}|full`)) || null;
}

/** A car model was built from `asset`: it stays loaded until released. */
export function retainCarAsset(asset) {
  if (!asset) return;
  asset.users = (asset.users || 0) + 1;
  asset.lastUsed = ++useClock;
}

/** A car model built from `asset` was disposed. */
export function releaseCarAsset(asset) {
  if (!asset) return;
  asset.users = Math.max(0, (asset.users || 0) - 1);
  asset.lastUsed = ++useClock;
}

/**
 * Free the models no car is using, apart from the few used last. Call it once the models needed
 * right now have been built (so they're in use), never between loading a model and building it.
 */
export function trimCarAssets() {
  const idle = [...assets].filter(([, a]) => !a.users && !a.pinned);
  idle.sort((a, b) => b[1].lastUsed - a[1].lastUsed);
  for (const [key, asset] of idle.slice(IDLE_KEEP)) {
    assets.delete(key);
    assetPromises.delete(key);
    // (both versions can be the same object - a previewed model is pinned, so not here)
    if ([...assets.values()].includes(asset)) continue;
    disposeAsset(asset);
  }
}

function disposeAsset(asset) {
  const geos = new Set();
  for (const parts of Object.values(asset.lods || {})) for (const p of parts) geos.add(p.geometry);
  if (asset.merged) for (const g of asset.merged.values()) geos.add(g);
  asset.scene?.traverse((o) => {
    if (!o.isMesh) return;
    geos.add(o.geometry);
    for (const m of [].concat(o.material)) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
  for (const g of geos) g?.dispose();
}

/** Model bytes: the gzipped twin when the browser can unpack it, else the plain .glb. */
async function fetchModel(model) {
  const get = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  if (model.gzUrl && typeof DecompressionStream !== 'undefined') {
    try {
      let bytes = await get(model.gzUrl);
      // some servers already undo the gzip (Content-Encoding) - only unpack real gzip data
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      return bytes.buffer;
    } catch (err) {
      console.warn('[cars] gzipped model unavailable, using the plain file', err);
    }
  }
  return (await get(model.url)).buffer;
}

/**
 * Load (and prepare) the models for the given car ids, in the version in use, or in `want` ('light'
 * for the cars only seen in passing). Never throws.
 */
export async function ensureCarAssets(ids, renderer, want) {
  await loadManifest();
  await Promise.all(
    [...new Set(ids)].map((id) => {
      const def = getCarDef(id);
      if (!def.model) return null;
      const version = versionOf(def, want);
      // (a full model already here does for a light one, rather than downloading that as well)
      if (version === 'light' && assets.has(`${id}|full`)) return null;
      const key = `${id}|${version}`;
      if (!assetPromises.has(key)) {
        const p = Promise.all([getLoader(renderer), fetchModel(version === 'light' ? def.model.light : def.model)])
          .then(
            ([ldr, buffer]) =>
              new Promise((resolve) => {
                ldr.parse(
                  buffer,
                  BASE,
                  (gltf) => {
                    try {
                      const asset = prepareAsset(gltf, def);
                      asset.users = 0;
                      asset.lastUsed = ++useClock;
                      assets.set(key, asset);
                      resolve(asset);
                    } catch (err) {
                      console.warn(`[cars] could not prepare ${def.model.url}`, err);
                      resolve(null);
                    }
                  },
                  (err) => {
                    console.warn(`[cars] could not parse ${def.model.url}`, err);
                    resolve(null);
                  },
                );
              }),
          )
          .catch((err) => {
            console.warn(`[cars] could not load ${def.model.url}`, err);
            return null;
          });
        assetPromises.set(key, p);
      }
      return assetPromises.get(key);
    }),
  );
}

/**
 * Preview a .glb dropped onto the page as the model for `carId` (this session only).
 * Returns a short report of what was detected.
 */
export async function previewModelFile(file, carId, renderer, extra = {}) {
  const ldr = await getLoader(renderer);
  const buf = await file.arrayBuffer();
  const gltf = await new Promise((resolve, reject) => ldr.parse(buf, '', resolve, reject));
  const def = getCarDef(carId);
  def.model = { ...(def.model || {}), ...extra, file: file.name, url: null, preview: true };
  const asset = prepareAsset(gltf, def);
  // (a dropped file can't be fetched again, so it is never freed)
  asset.pinned = true;
  asset.users = 0;
  asset.lastUsed = ++useClock;
  for (const version of ['full', 'light']) {
    assets.set(`${carId}|${version}`, asset);
    assetPromises.set(`${carId}|${version}`, Promise.resolve(asset));
  }
  const roles = {};
  for (const inf of asset.infos) for (const r of inf.roles) roles[r] = (roles[r] || 0) + 1;
  return { wheels: !!asset.wheels, roles, dims: asset.dims };
}

// ---------------------------------------------------------------------------------------

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

function namesOf(obj, mat) {
  let n = `${obj.name} ${mat ? mat.name : ''}`;
  let p = obj.parent;
  for (let k = 0; k < 3 && p; k++, p = p.parent) n += ' ' + p.name;
  return n;
}

function surfaceArea(geo, scaleSq) {
  const pos = geo.attributes.position;
  if (!pos) return 0;
  const idx = geo.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let area = 0;
  const tri = (i0, i1, i2) => {
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    area += b.sub(a).cross(c.sub(a)).length() * 0.5;
  };
  const count = idx ? idx.count : pos.count;
  const stride = Math.max(3, Math.floor(count / 3 / 4000) * 3); // sample big meshes
  for (let i = 0; i + 2 < count; i += stride) {
    if (idx) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    else tri(i, i + 1, i + 2);
  }
  return area * (stride / 3) * scaleSq;
}

/** Car-factory models are already in game units (metres, +Z forward, wheels on the ground). */
function prepareFactory(src, def) {
  const meta = src.userData;
  const lods = {};
  for (const name of ['lod0', 'lod1']) {
    const g = src.getObjectByName(name);
    if (!g) continue;
    const parts = [];
    g.traverse((o) => {
      if (o.isMesh) parts.push({ role: (o.material && o.material.name) || 'trim', geometry: o.geometry });
    });
    lods[name] = parts;
  }
  if (!lods.lod0) lods.lod0 = lods.lod1;
  const box = new THREE.Box3();
  for (const p of lods.lod0) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox);
  }
  const dims = {
    length: box.max.z - box.min.z,
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    frontZ: box.max.z,
    rearZ: box.min.z,
    halfWidth: (box.max.x - box.min.x) / 2,
  };
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  return { id: def.id, factory: true, lods, meta, dims, tail: meta.tailLights.map(v3), head: (meta.headLights || []).map(v3), hasModel: true };
}

function prepareAsset(gltf, def) {
  const cfg = def.model || {};
  const src = gltf.scene || gltf.scenes[0];
  if (src.userData && src.userData.factory) return prepareFactory(src, def);
  const root = new THREE.Group();
  root.name = `car:${def.id}`;
  const holder = new THREE.Group();
  holder.add(src);
  root.add(holder);

  // ---- orientation: the long horizontal axis is the car's length; glTF faces +Z
  holder.updateMatrixWorld(true);
  _box.setFromObject(holder);
  const size = _box.getSize(new THREE.Vector3());
  let rotY = 0;
  if (cfg.rotateY != null) rotY = THREE.MathUtils.degToRad(cfg.rotateY);
  else if (size.x > size.z * 1.15) rotY = -Math.PI / 2; // modelled along +X
  holder.rotation.y = rotY;
  holder.updateMatrixWorld(true);
  _box.setFromObject(holder);
  _box.getSize(size);

  // ---- scale to metres
  let scale = cfg.scale ?? 1;
  if (cfg.scale == null) {
    const target = cfg.length ?? def.dims.length;
    if (size.z < 3 || size.z > 7 || cfg.length) scale = target / size.z;
  }
  holder.scale.setScalar(scale);
  holder.updateMatrixWorld(true);
  _box.setFromObject(holder);
  const center = _box.getCenter(new THREE.Vector3());
  holder.position.x -= center.x;
  holder.position.z -= center.z;
  holder.position.y -= _box.min.y;
  holder.updateMatrixWorld(true);
  _box.setFromObject(holder);
  const dims = {
    length: _box.max.z - _box.min.z,
    width: _box.max.x - _box.min.x,
    height: _box.max.y - _box.min.y,
    frontZ: _box.max.z,
    rearZ: _box.min.z,
    halfWidth: (_box.max.x - _box.min.x) / 2,
  };

  // ---- gather meshes (traversal order is identical in clones)
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  root.updateMatrixWorld(true);
  const infos = meshes.map((m) => {
    const box = new THREE.Box3().setFromObject(m);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const ws = new THREE.Vector3();
    m.matrixWorld.decompose(_v, new THREE.Quaternion(), ws);
    return { mesh: m, box, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()), mats, names: namesOf(m, null), scaleSq: ws.x * ws.y, roles: [], corner: null };
  });

  // ---- wheels: by name, or by being round, low and out at the corners
  const len = dims.length;
  const isWheelShape = (inf) => {
    const s = inf.size;
    const d = Math.max(s.y, s.z);
    return (
      d > len * 0.1 &&
      d < len * 0.26 &&
      Math.abs(s.y - s.z) / d < 0.3 &&
      s.x < d * 0.85 &&
      inf.center.y < d * 0.8 &&
      Math.abs(inf.center.x) > dims.halfWidth * 0.35
    );
  };
  for (const inf of infos) {
    const named = RE.wheel.test(inf.names + inf.mats.map((m) => m.name).join(' ')) && !RE.notWheel.test(inf.names);
    const shaped = isWheelShape(inf);
    if ((named && inf.center.y < len * 0.2 && Math.abs(inf.center.x) > dims.halfWidth * 0.3) || shaped) {
      inf.corner = (inf.center.x > 0 ? 'L' : 'R') + (inf.center.z > 0 ? 'F' : 'B');
    }
  }
  const wheels = {};
  for (const corner of ['LF', 'RF', 'LB', 'RB']) {
    const parts = infos.filter((i) => i.corner === corner);
    if (!parts.length) continue;
    // the biggest round part (the tyre) defines centre and radius
    parts.sort((a, b) => Math.max(b.size.y, b.size.z) - Math.max(a.size.y, a.size.z));
    const t = parts[0];
    wheels[corner] = { center: t.center.clone(), radius: Math.max(t.size.y, t.size.z) / 2 };
  }
  const wheelOk = Object.keys(wheels).length === 4;
  if (!wheelOk) for (const inf of infos) inf.corner = null;

  // ---- material roles
  const zMid = (dims.frontZ + dims.rearZ) / 2;
  let paintFound = false;
  for (const inf of infos) {
    inf.mats.forEach((mat, j) => {
      const n = `${inf.names} ${mat.name}`;
      const emissive = mat.emissive ? mat.emissive.r + mat.emissive.g + mat.emissive.b : 0;
      let role = 'other';
      if (RE.glass.test(n) || (mat.transparent && mat.opacity < 0.9) || mat.transmission > 0.05) role = 'glass';
      else if ((RE.light.test(n) && !RE.notLight.test(n)) || (emissive > 0.3 && !inf.corner)) {
        const c = mat.emissive && emissive > 0.3 ? mat.emissive : mat.color || _c.set(1, 1, 1);
        const reddish = c.r > c.g * 1.6 && c.r > c.b * 1.6;
        role = reddish || inf.center.z < zMid - dims.length * 0.2 ? 'tail' : 'head';
        if (/indicator|blinker|signal/i.test(n)) role = 'other';
      } else if (inf.corner) {
        const lum = mat.color ? mat.color.r * 0.3 + mat.color.g * 0.59 + mat.color.b * 0.11 : 0.5;
        role = RE.tire.test(n) || (lum < 0.06 && (mat.roughness ?? 1) > 0.5) ? 'tire' : 'rim';
      } else if (RE.paint.test(n) && !RE.notPaint.test(n)) {
        role = 'paint';
        paintFound = true;
      }
      inf.roles[j] = role;
    });
  }
  if (!paintFound) {
    // biggest bright, opaque, non-metal-chrome surface is the paint
    const area = new Map();
    for (const inf of infos) {
      if (inf.corner) continue;
      const geo = inf.mesh.geometry;
      const a = surfaceArea(geo, inf.scaleSq);
      inf.mats.forEach((mat, j) => {
        if (inf.roles[j] !== 'other') return;
        const lum = mat.color ? mat.color.r * 0.3 + mat.color.g * 0.59 + mat.color.b * 0.11 : 0;
        if (lum < 0.02 || (mat.metalness > 0.95 && mat.roughness < 0.1)) return;
        area.set(mat, (area.get(mat) || 0) + a / inf.mats.length);
      });
    }
    let best = null;
    let bestA = 0;
    for (const [mat, a] of area) if (a > bestA) [best, bestA] = [mat, a];
    if (best) for (const inf of infos) inf.mats.forEach((m, j) => m === best && (inf.roles[j] = 'paint'));
  }

  // light anchor points (used for light trails / brake lights)
  const tailPts = [];
  const headPts = [];
  for (const inf of infos) {
    if (inf.roles.includes('tail')) tailPts.push(inf.center.clone());
    if (inf.roles.includes('head')) headPts.push(inf.center.clone());
  }
  const pickPair = (pts, fallbackZ, y) => {
    if (pts.length >= 2) {
      const l = pts.filter((p) => p.x > 0).sort((a, b) => b.x - a.x)[0];
      const r = pts.filter((p) => p.x < 0).sort((a, b) => a.x - b.x)[0];
      if (l && r) return [l, r];
    }
    return [new THREE.Vector3(dims.halfWidth * 0.68, y, fallbackZ), new THREE.Vector3(-dims.halfWidth * 0.68, y, fallbackZ)];
  };
  const tail = pickPair(tailPts, dims.rearZ + 0.05, dims.height * 0.62);
  const head = pickPair(headPts, dims.frontZ - 0.1, dims.height * 0.5);

  // other materials keep their look; make sure they reflect the scene
  for (const inf of infos) for (const m of inf.mats) if (m.isMeshStandardMaterial) m.envMapIntensity = m.envMapIntensity ?? 1;

  return {
    id: def.id,
    scene: root,
    infos: infos.map((i) => ({ roles: i.roles.slice(), corner: i.corner })),
    wheels: wheelOk ? wheels : null,
    dims,
    tail,
    head,
    paintMap: (() => {
      for (const inf of infos) for (let j = 0; j < inf.mats.length; j++) if (inf.roles[j] === 'paint' && inf.mats[j].map) return inf.mats[j].map;
      return null;
    })(),
    hasModel: true,
  };
}
