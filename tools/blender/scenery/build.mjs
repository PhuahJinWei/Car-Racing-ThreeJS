// Blender scenery: a track's set (the park round Floodlight Park, say) modelled in Blender around the
// real track, its night lighting baked in Cycles, packed into the .glb the game loads for the track
// (public/models/scenery/<id>.glb, with a gzipped twin). The game still builds the road, the
// barriers and the physics; the park's lamps light the road through the baked light map.
//   node tools/blender/scenery/build.mjs park          build, bake and export
//   ... --preview     also render a few views (tools/blender/out/scenery/<id>-<view>.png)
//   ... --shape       only the views: no bake, no export (quick looks at the modelling)
//   ... --only=woods,lake --size=1280x720   just these views, this size
//   ... --quick       a fast, noisy bake (small light map, few samples) to try the pipeline
//   ... --blend       also save tools/blender/out/scenery/<id>.blend to open in Blender
// Needs Blender 4.2 or newer; set BLENDER to its executable if it isn't in the usual place.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const OUT = join(root, 'public/models/scenery');
const WORK = join(root, 'tools/blender/out/scenery');
// each set and the track it is built round
const SETS = { park: 'park' };

/** The newest Blender in its usual install location (or $BLENDER). */
function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  if (process.platform === 'win32') {
    const base = join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation');
    const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^Blender \d/.test(d)) : [];
    dirs.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const d of dirs) {
      const exe = join(base, d, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  } else if (process.platform === 'darwin' && existsSync('/Applications/Blender.app/Contents/MacOS/Blender')) {
    return '/Applications/Blender.app/Contents/MacOS/Blender';
  }
  return 'blender';
}

/** The track as the game builds it (forward, unmirrored: the game mirrors the set itself), sampled for Blender. */
async function exportTrack(trackId, file) {
  const { Track } = await import(pathToFileURL(join(root, 'src/world/track.js')).href);
  const { getTrackDef } = await import(pathToFileURL(join(root, 'src/world/tracks.js')).href);
  const def = getTrackDef(trackId);
  const tr = new Track(def, { reverse: false, mirror: false, weather: 'clear' });
  // where each of the path's commands (straights, corners) lies along the loop: the track maps
  // sections given as [command, fraction] for us
  const segs = new Track({ ...def, sections: def.path.map((_, k) => ({ type: `seg${k}`, from: [k, 0], to: [k, 1] })) }, tr.variant);
  const arr = (a, k = 1000) => Array.from(a, (v) => Math.round(v * k) / k);
  const data = {
    id: trackId,
    n: tr.n,
    ds: tr.ds,
    length: tr.length,
    halfWidth: tr.halfWidth,
    // the barriers' inner face stands about this far out from the centre line
    barrier: tr.halfWidth + 0.6,
    px: arr(tr.px),
    py: arr(tr.py),
    pz: arr(tr.pz),
    tx: arr(tr.tx),
    tz: arr(tr.tz),
    rx: arr(tr.rx),
    ry: arr(tr.ry),
    rz: arr(tr.rz),
    sections: tr.sections.map((s) => ({ type: s.type, s0: s.s0, s1: s.s1 })),
    segments: segs.sections.map((s, k) => ({ k, cmd: def.path[k][0], s0: s.s0, s1: s.s1 })),
    bounds: tr.bounds,
  };
  writeFileSync(file, JSON.stringify(data));
  return data;
}

const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith('--'));
const shape = args.includes('--shape');
const blender = findBlender();
const secs = (t) => ((performance.now() - t) / 1000).toFixed(1) + 's';
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

for (const id of ids.length ? ids : Object.keys(SETS)) {
  if (!SETS[id]) {
    console.error(`unknown set "${id}" (have: ${Object.keys(SETS).join(', ')})`);
    process.exitCode = 1;
    continue;
  }
  const t0 = performance.now();
  const trackFile = join(WORK, `${id}-track.json`);
  const tr = await exportTrack(SETS[id], trackFile);
  console.log(`  track ${tr.id}: ${tr.n} samples, ${Math.round(tr.length)} m`);
  const flags = [];
  if (shape) flags.push('--preview', '--no-bake', '--no-export');
  for (const f of ['--preview', '--quick', '--blend', '--no-bake']) if (args.includes(f) && !flags.includes(f)) flags.push(f);
  for (const a of args) if (a.startsWith('--only=') || a.startsWith('--size=')) flags.push(a);
  const run = spawnSync(blender, ['-b', '--factory-startup', '--python', join(here, 'run.py'), '--', id, trackFile, WORK, ...flags], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (run.error) {
    console.error(`${id}: couldn't start Blender (${run.error.message}); set BLENDER to its executable`);
    process.exitCode = 1;
    continue;
  }
  const log = `${run.stdout}\n${run.stderr}`;
  writeFileSync(join(WORK, `${id}.log`), log);
  for (const line of log.split('\n')) if (/^(BUILD|BAKE|PREVIEW|EXPORT|DONE|WARNING)\b/.test(line) || /Error|Traceback|^\s+File "/.test(line)) console.log(`  ${line.trim()}`);
  if (run.status !== 0 || !/^DONE\b/m.test(log)) {
    console.error(`${id}: Blender failed (exit ${run.status}); the whole log is in ${join(WORK, id + '.log')}`);
    process.exitCode = 1;
    continue;
  }
  if (shape || args.includes('--no-bake')) continue;
  // the game's copies: the meshes with a gzipped twin (the game fetches that where the browser can
  // unpack it), the ground's light and colour maps
  // (the .m.glb: the light version, for low quality)
  for (const f of [`${id}.glb`, `${id}.m.glb`]) {
    if (!existsSync(join(WORK, f))) continue;
    copyFileSync(join(WORK, f), join(OUT, f));
    writeFileSync(join(OUT, f) + '.gz', gzipSync(readFileSync(join(OUT, f)), { level: 9 }));
  }
  for (const f of [`${id}-light.webp`, `${id}-ground.jpg`]) copyFileSync(join(WORK, f), join(OUT, f));
  const kb = (f) => (existsSync(join(OUT, f)) ? Math.round(statSync(join(OUT, f)).size / 1024) + ' KB' : '-');
  console.log(`  ${id}.glb ${kb(`${id}.glb`)} (${kb(`${id}.glb.gz`)} gzipped), ${id}.m.glb ${kb(`${id}.m.glb`)}, ${id}-light.webp ${kb(`${id}-light.webp`)}, ${id}-ground.jpg ${kb(`${id}-ground.jpg`)}; done in ${secs(t0)}`);
}
