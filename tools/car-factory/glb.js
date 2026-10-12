// Minimal glTF 2.0 binary (.glb) writer: named groups (LODs) of parts, one primitive per part.

/**
 * groups: [{ name, parts: [{ name, material: { name, color: [r,g,b], metallic, roughness, emissive? },
 *            positions: Float32Array, normals: Float32Array, ao?: Float32Array, indices: Uint32Array }] }]
 * extras: JSON stored on the scene (GLTFLoader exposes it as scene.userData)
 */
export function writeGLB(groups, extras = {}) {
  const chunks = [];
  let byteLength = 0;
  const bufferViews = [];
  const accessors = [];
  const align4 = () => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
  };
  const addView = (typed, target) => {
    align4();
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const addAccessor = (typed, type, componentType, count, target, extra) => {
    const view = addView(typed, target);
    const acc = { bufferView: view, componentType, count, type };
    if (extra) Object.assign(acc, extra);
    accessors.push(acc);
    return accessors.length - 1;
  };

  const materials = [];
  const matIndex = new Map();
  const meshes = [];
  const nodes = [];
  const roots = [];
  for (const g of groups) {
    const children = [];
    for (const p of g.parts) {
      let mi = matIndex.get(p.material.name);
      if (mi === undefined) {
        const m = p.material;
        materials.push({
          name: m.name,
          pbrMetallicRoughness: {
            baseColorFactor: [...(m.color || [0.8, 0.8, 0.8]), 1],
            metallicFactor: m.metallic ?? 0,
            roughnessFactor: m.roughness ?? 0.5,
          },
          ...(m.emissive ? { emissiveFactor: m.emissive } : {}),
          doubleSided: false,
        });
        mi = materials.length - 1;
        matIndex.set(m.name, mi);
      }
      const n = p.positions.length / 3;
      // snap to binary grids (0.12 mm, 1/4096): the low float bits become zero and gzip far better
      const positions = p.positions.map((v) => Math.round(v * 8192) / 8192);
      const normals = p.normals.map((v) => Math.round(v * 4096) / 4096);
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++) {
          const v = positions[i * 3 + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      const attributes = {
        POSITION: addAccessor(positions, 'VEC3', 5126, n, 34962, { min, max }),
        NORMAL: addAccessor(normals, 'VEC3', 5126, n, 34962),
      };
      // ambient occlusion as a normalised byte vertex colour (always present so materials can rely on it)
      const col = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) {
        const a = Math.round(Math.max(0, Math.min(1, p.ao ? p.ao[i] : 1)) * 255);
        col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = a;
        col[i * 4 + 3] = 255;
      }
      attributes.COLOR_0 = addAccessor(col, 'VEC4', 5121, n, 34962, { normalized: true });
      const use16 = n < 65536;
      const ind = use16 ? Uint16Array.from(p.indices) : p.indices;
      const indices = addAccessor(ind, 'SCALAR', use16 ? 5123 : 5125, p.indices.length, 34963);
      meshes.push({ name: p.name, primitives: [{ attributes, indices, material: mi }] });
      nodes.push({ name: p.name, mesh: meshes.length - 1 });
      children.push(nodes.length - 1);
    }
    nodes.push({ name: g.name, children });
    roots.push(nodes.length - 1);
  }
  align4();
  const json = {
    asset: { version: '2.0', generator: 'midnight-overdrive car factory' },
    scene: 0,
    scenes: [{ name: 'car', nodes: roots, extras }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad);
    padded.set(jsonBytes);
    padded.fill(0x20, jsonBytes.length);
    jsonBytes = padded;
  }
  const total = 12 + 8 + jsonBytes.length + 8 + byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, byteLength, true);
  dv.setUint32(o + 4, 0x004e4942, true); // 'BIN'
  o += 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}
