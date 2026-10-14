// The cars: builds the scripted designs in ./cars into game-ready .glb files (written by
// tools/car-factory/output.js, as the retired SDF car factory wrote them, so the game treats them all
// alike: generated wheels, liveries, crash damage, far and phone models).
//   npm run build:cars                           every car, final quality (also npm run build:blender)
//   node tools/blender/build.mjs monoposto       one car
//   ... --preview     also render a contact sheet of six views (tools/blender/out/<id>.png)
//   ... --shape       only the contact sheet, full detail, no AO bake or export (quick looks;
//                     --lod=lodm or --lod=lod1 shows the phone or far model instead)
//   ... --only=inlet,tail --size=1280x800   just these views (close-ups too, see lib/studio.py), bigger
//   ... --blend       also save tools/blender/out/<id>.blend to open in Blender
// Needs Blender 4.2 or newer; set BLENDER to its executable if it isn't in the usual place.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeModel, register } from '../car-factory/output.js';
import { MAT_PBR } from '../car-factory/parts.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../public/models/cars');
const WORK = resolve(here, 'out');
const CARS = ['monoposto', 'volt', 'marshal', 'vice', 'juggernaut', 'mochi', 'jukebox', 'cabbie', 'touge', 'kaido', 'sidewinder', 'sleeper', 'brawler', 'razor', 'ronin', 'vesper', 'surge', 'specter', 'enduro', 'apogee'];

/** The newest Blender in its usual install location (or $BLENDER). */
function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  if (process.platform === 'win32') {
    const root = join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation');
    const dirs = existsSync(root) ? readdirSync(root).filter((d) => /^Blender \d/.test(d)) : [];
    dirs.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const d of dirs) {
      const exe = join(root, d, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  } else if (process.platform === 'darwin' && existsSync('/Applications/Blender.app/Contents/MacOS/Blender')) {
    return '/Applications/Blender.app/Contents/MacOS/Blender';
  }
  return 'blender';
}

const args = process.argv.slice(2);
const shape = args.includes('--shape');
const ids = args.filter((a) => !a.startsWith('--'));
const blender = findBlender();
const secs = (t) => ((performance.now() - t) / 1000).toFixed(1) + 's';

/** One LOD's parts from the exported manifest + binary (positions, normals, AO, indices). */
function partsOf(manifest, bin, lod, suffix) {
  const view = (Type, off, n) => new Type(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * 4));
  return manifest.lods[lod].map((e) => {
    let o = e.offset;
    const positions = view(Float32Array, o, e.verts * 3);
    o += e.verts * 12;
    const normals = view(Float32Array, o, e.verts * 3);
    o += e.verts * 12;
    const ao = view(Float32Array, o, e.verts);
    o += e.verts * 4;
    const indices = view(Uint32Array, o, e.indices);
    const bad = positions.reduce((n, v) => n + (Number.isFinite(v) ? 0 : 1), 0);
    if (bad) console.warn(`  ! ${lod} ${e.role}: ${bad} non-finite vertex coordinates`);
    return { name: e.role + suffix, material: { name: e.role, ...(MAT_PBR[e.role] || MAT_PBR.trim) }, positions, normals, ao, indices };
  });
}

mkdirSync(WORK, { recursive: true });
for (const id of ids.length ? ids : CARS) {
  if (!CARS.includes(id)) {
    console.error(`unknown Blender car "${id}" (have: ${CARS.join(', ')})`);
    process.exitCode = 1;
    continue;
  }
  const t0 = performance.now();
  const lod = args.find((a) => a.startsWith('--lod='))?.slice(6) || 'lod0';
  const flags = shape ? [`--lods=${lod}`, '--preview', '--no-export'] : [args.includes('--preview') ? '--preview' : ''];
  if (args.includes('--blend')) flags.push('--blend');
  for (const a of args) if (a.startsWith('--only=') || a.startsWith('--size=')) flags.push(a);
  const run = spawnSync(blender, ['-b', '--factory-startup', '--python', join(here, 'run.py'), '--', id, WORK, ...flags.filter(Boolean)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (run.error) {
    console.error(`${id}: couldn't start Blender (${run.error.message}); set BLENDER to its executable`);
    process.exitCode = 1;
    continue;
  }
  const log = `${run.stdout}\n${run.stderr}`;
  for (const line of log.split('\n')) if (/^(BUILD|PREVIEW|EXPORT|DONE|WARNING)\b/.test(line) || /Error|Traceback|^\s+File "/.test(line)) console.log(`  ${line.trim()}`);
  if (run.status !== 0 || !/^DONE\b/m.test(log)) {
    console.error(`${id}: Blender failed (exit ${run.status})`);
    process.exitCode = 1;
    continue;
  }
  if (shape) continue;

  const manifest = JSON.parse(readFileSync(join(WORK, `${id}.json`), 'utf8'));
  const bin = readFileSync(join(WORK, `${id}.bin`));
  const group = (lod, name = lod) => ({ name, parts: partsOf(manifest, bin, lod, lod === 'lod0' ? '' : `_${lod}`) });
  const extras = { factory: 1, id, ...manifest.meta };
  // as the factory does: full file = lod0 + lod1; light file = the mid version as its near model + lod1
  const full = writeModel(OUT, `${id}.glb`, [group('lod0'), group('lod1')], extras);
  const light = writeModel(OUT, `${id}.m.glb`, [group('lodm', 'lod0'), group('lod1')], extras);
  register(OUT, id, full, light);
  console.log(`  done in ${secs(t0)}`);
}
