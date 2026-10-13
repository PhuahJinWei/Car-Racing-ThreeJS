// Writing finished car models: the .glb (plus a gzipped twin) and its entry in cars.json. Shared by
// the car factory and the Blender car builds (tools/blender/build.mjs).
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { writeGLB } from './glb.js';

/** A file operation, retried for a moment: on Windows a dev server reading the file can hold it. */
function retry(op) {
  for (let i = 0; ; i++) {
    try {
      return op();
    } catch (e) {
      if (i >= 8) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

function writeRetry(file, data) {
  return retry(() => writeFileSync(file, data));
}

/** Write `name` into `dir` from LOD groups (see writeGLB); returns the .glb bytes. */
export function writeModel(dir, name, groups, extras) {
  const glb = writeGLB(groups, extras);
  const file = resolve(dir, name);
  writeRetry(file, glb);
  // gzipped twin: the game unpacks it with DecompressionStream (falls back to the plain file)
  const gz = gzipSync(glb, { level: 9 });
  writeRetry(file + '.gz', gz);
  console.log(`  wrote ${file} (${(glb.byteLength / 1024).toFixed(0)} KB, ${(gz.byteLength / 1024).toFixed(0)} KB gzipped)`);
  return glb;
}

/** Add/refresh the model in cars.json; the content hash busts browser and service-worker caches. */
export function register(dir, id, glb, light) {
  const file = resolve(dir, 'cars.json');
  // (a fresh manifest only when there's none: one that's locked or won't parse must stop the build,
  // not be written over with this car alone)
  const data = existsSync(file) ? JSON.parse(retry(() => readFileSync(file, 'utf8'))) : { cars: [] };
  const list = Array.isArray(data) ? data : (data.cars ||= []);
  let e = list.find((c) => c.id === id);
  if (!e) list.push((e = { id }));
  e.file = `${id}.glb`;
  e.gz = true;
  e.factory = true;
  e.v = createHash('sha1').update(glb).digest('hex').slice(0, 10);
  // the phone version, with its own cache-busting hash
  e.light = { file: `${id}.m.glb`, v: createHash('sha1').update(light).digest('hex').slice(0, 10) };
  writeRetry(file, JSON.stringify(data, null, 2) + '\n');
}
