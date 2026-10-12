// Car factory: turns the distance-field car designs in ./designs into game-ready .glb models.
//   npm run build:cars                 all cars, final quality
//   node tools/car-factory/build.mjs volt --quick     fast low-res preview
//   node tools/car-factory/build.mjs volt --h=0.004   custom voxel size (metres)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { polygonize, buildParts, smoothSeams } from './mesher.js';
import { writeGLB } from './glb.js';
import { MAT, MAT_NAMES, MAT_PBR } from './parts.js';
import { buildDecal } from './decals.js';
import { buildVolt } from './designs/volt.js';
import { buildRazor } from './designs/razor.js';
import { buildSpecter } from './designs/specter.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../public/models/cars');
const DESIGNS = { volt: buildVolt, razor: buildRazor, specter: buildSpecter };

// triangle targets: full detail (player car, garage), a light version for distant opponents, and
// a mid version that stands in for full detail on phones (medium / low quality). The mid version
// ships in its own file (<id>.m.glb, with the far version), so phones download less.
const LODS = [
  { name: 'lod0', tris: 90000, error: 0.002, normalWeight: 0.15 },
  { name: 'lod1', tris: 16000, error: 0.008, normalWeight: 0.04 },
  { name: 'lodm', tris: 42000, error: 0.003, normalWeight: 0.1 },
];

// how much each part's shading detail matters (hidden wheel wells and pocket walls matter least)
const IMPORTANCE = { paint: 1, glass: 1, chrome: 0.6, head: 0.5, tail: 0.5, carbon: 0.35, interior: 0.3, trim: 0.2, grille: 0.15, exhaust: 0.15 };
const MAT_WEIGHTS = Object.fromEntries(Object.entries(IMPORTANCE).map(([k, v]) => [MAT[k], v]));
// mostly hidden parts get looser geometric tolerances (multiples of the LOD's error)
const STAGES = [
  { mats: new Set([MAT.trim, MAT.grille, MAT.exhaust]), mul: 3 },
  { mats: new Set([MAT.interior]), mul: 2 },
];
// far away only the painted silhouette matters: every detail part gets coarsened first
const FAR_STAGES = [{ mats: new Set([MAT.trim, MAT.grille, MAT.exhaust, MAT.carbon, MAT.chrome, MAT.head, MAT.tail]), mul: 3 }];

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const hArg = args.find((a) => a.startsWith('--h='));
const h = hArg ? parseFloat(hArg.slice(4)) : quick ? 0.012 : 0.005;
const ids = args.filter((a) => !a.startsWith('--'));

const secs = (t) => ((performance.now() - t) / 1000).toFixed(1) + 's';

function merge(list) {
  let nv = 0;
  let ni = 0;
  for (const m of list) {
    nv += m.positions.length;
    ni += m.indices.length;
  }
  const positions = new Float32Array(nv);
  const normals = new Float32Array(nv);
  const indices = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const m of list) {
    positions.set(m.positions, ov);
    normals.set(m.normals, ov);
    for (let i = 0; i < m.indices.length; i++) indices[oi + i] = m.indices[i] + ov / 3;
    ov += m.positions.length;
    oi += m.indices.length;
  }
  return { positions, normals, indices };
}

/** Add/refresh the model in cars.json; the content hash busts browser and service-worker caches. */
function register(id, glb, light) {
  const file = resolve(OUT, 'cars.json');
  let data = { cars: [] };
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // start a fresh manifest
  }
  const list = Array.isArray(data) ? data : (data.cars ||= []);
  let e = list.find((c) => c.id === id);
  if (!e) list.push((e = { id }));
  e.file = `${id}.glb`;
  e.gz = true;
  e.factory = true;
  e.v = createHash('sha1').update(glb).digest('hex').slice(0, 10);
  // the phone version (see LODS), with its own cache-busting hash
  e.light = { file: `${id}.m.glb`, v: createHash('sha1').update(light).digest('hex').slice(0, 10) };
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

mkdirSync(OUT, { recursive: true });
for (const id of ids.length ? ids : Object.keys(DESIGNS)) {
  if (!DESIGNS[id]) {
    console.error(`unknown car "${id}" (have: ${Object.keys(DESIGNS).join(', ')})`);
    process.exitCode = 1;
    continue;
  }
  const t0 = performance.now();
  const design = DESIGNS[id]();
  console.log(`${id}: profiles ready in ${secs(t0)}`);

  const t1 = performance.now();
  const mesh = polygonize(design.sdf, design.bounds, h);
  const st = mesh.stats;
  console.log(`  surface nets @${h * 1000}mm: ${st.vertices} verts, ${st.triangles} tris, ${(st.evals / 1e6).toFixed(1)}M evals, ${secs(t1)}`);
  const t3 = performance.now();
  const seamVerts = smoothSeams(design.sdf, mesh);
  console.log(`  smoothed ${seamVerts} material-border vertices ${secs(t3)}`);

  // decal geometry per LOD (glass panes get much coarser far away)
  const decalsFor = (far) => {
    const out = new Map();
    for (const spec of design.decals || []) {
      const s = far && spec.kind === 'panel' ? { ...spec, step: 0.09, rings: 2 } : spec;
      const m = buildDecal(design.shell, s);
      if (!m || !m.indices.length) {
        if (!far) console.warn(`  ! ${MAT_NAMES[spec.mat]} decal missed the surface`);
        continue;
      }
      if (!out.has(spec.mat)) out.set(spec.mat, []);
      out.get(spec.mat).push(m);
    }
    return out;
  };

  const groups = [];
  for (const lod of LODS) {
    const t2 = performance.now();
    const far = lod.name === 'lod1';
    const parts = await buildParts(design.sdf, mesh, lod.tris, { error: lod.error, normalWeight: lod.normalWeight, matWeights: MAT_WEIGHTS, aoStrength: design.aoStrength, stages: (far ? FAR_STAGES : STAGES).map((st) => ({ mats: st.mats, error: lod.error * st.mul })) });
    // the far LOD keeps opaque glass, so the cockpit behind it can go
    if (far) delete parts[MAT.interior];
    const list = Object.entries(parts).map(([m, p]) => ({ mat: +m, ...p }));
    for (const [m, arr] of decalsFor(far)) list.push({ mat: m, ...merge(arr) });
    const suffix = lod.name === 'lod0' ? '' : `_${lod.name}`;
    groups.push({
      name: lod.name,
      parts: list.map((p) => {
        const name = MAT_NAMES[p.mat];
        return { name: name + suffix, material: { name, ...MAT_PBR[name] }, positions: p.positions, normals: p.normals, ao: p.ao, indices: p.indices };
      }),
    });
    const tris = list.map((p) => `${MAT_NAMES[p.mat]} ${p.indices.length / 3}`).join(', ');
    const total = list.reduce((s, p) => s + p.indices.length / 3, 0);
    console.log(`  ${lod.name}: ${total} tris (${tris}) ${secs(t2)}`);
  }

  // full file: lod0 + lod1; light file: the mid version as its near model (named lod0) + lod1
  const byName = Object.fromEntries(groups.map((g) => [g.name, g]));
  const write = (name, list) => {
    const glb = writeGLB(list, { factory: 1, id, ...design.meta });
    const file = resolve(OUT, name);
    writeFileSync(file, glb);
    // gzipped twin: the game unpacks it with DecompressionStream (falls back to the plain file)
    const gz = gzipSync(glb, { level: 9 });
    writeFileSync(file + '.gz', gz);
    console.log(`  wrote ${file} (${(glb.byteLength / 1024).toFixed(0)} KB, ${(gz.byteLength / 1024).toFixed(0)} KB gzipped)`);
    return glb;
  };
  const full = write(`${id}.glb`, [byName.lod0, byName.lod1]);
  const light = write(`${id}.m.glb`, [{ ...byName.lodm, name: 'lod0' }, byName.lod1]);
  register(id, full, light);
  console.log(`  done in ${secs(t0)}`);
}
