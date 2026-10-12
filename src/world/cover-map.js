import * as THREE from 'three';

const OPEN = -1e4;

/**
 * A top-down map of what keeps the rain off: tunnel roofs and overpass decks. Each cell holds
 * the height of the cover over it, so rain stops at a tunnel mouth, the road under a roof stays
 * dry, and spray or the sound of rain can ask whether a spot is sheltered.
 * Shaders read it as a texture (`uCover`, placed by `uCoverRect`): R = height of the cover,
 * G = covered, filtered so the edges are soft.
 */
export class CoverMap {
  constructor(bounds, opts = {}) {
    const pad = opts.pad ?? 40;
    this.x0 = bounds.minX - pad;
    this.z0 = bounds.minZ - pad;
    const w = bounds.maxX - bounds.minX + pad * 2;
    const d = bounds.maxZ - bounds.minZ + pad * 2;
    this.cell = Math.max(opts.cell ?? 1.5, Math.max(w, d) / (opts.maxSize ?? 768));
    this.nx = Math.ceil(w / this.cell);
    this.nz = Math.ceil(d / this.cell);
    this.top = new Float32Array(this.nx * this.nz).fill(OPEN);
    this.count = 0;
    this.texture = null;
    this.rect = new THREE.Vector4(this.x0, this.z0, 1 / (this.nx * this.cell), 1 / (this.nz * this.cell));
  }

  /**
   * Cover a rectangle centred on (x, z): unit axis (ax, az) along its length, half length hl,
   * half width hw, the top of the cover at height y.
   */
  addRect(x, z, ax, az, hl, hw, y) {
    const c = this.cell;
    const ex = Math.abs(ax) * hl + Math.abs(az) * hw;
    const ez = Math.abs(az) * hl + Math.abs(ax) * hw;
    const i0 = Math.max(0, Math.floor((x - ex - this.x0) / c));
    const i1 = Math.min(this.nx - 1, Math.floor((x + ex - this.x0) / c));
    const j0 = Math.max(0, Math.floor((z - ez - this.z0) / c));
    const j1 = Math.min(this.nz - 1, Math.floor((z + ez - this.z0) / c));
    for (let j = j0; j <= j1; j++) {
      const pz = this.z0 + (j + 0.5) * c - z;
      for (let i = i0; i <= i1; i++) {
        const px = this.x0 + (i + 0.5) * c - x;
        if (Math.abs(px * ax + pz * az) > hl || Math.abs(pz * ax - px * az) > hw) continue;
        const k = j * this.nx + i;
        if (y > this.top[k]) this.top[k] = y;
      }
    }
    this.count++;
  }

  /** Height of the cover over (x, z); far below everything in the open. */
  heightAt(x, z) {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return OPEN;
    return this.top[j * this.nx + i];
  }

  /** Is the point (x, y, z) under cover? */
  covers(x, y, z) {
    return y < this.heightAt(x, z);
  }

  /** The texture shaders sample (built once, after every cover has been added). */
  build() {
    const { nx, nz, top } = this;
    // spread the heights a couple of cells into the open, so filtering near an edge never
    // blends a roof with "no roof" (G still says where the cover ends)
    let h = top;
    for (let pass = 0; pass < 2; pass++) {
      const next = h.slice();
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          if (h[k] > OPEN) continue;
          let m = OPEN;
          for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= nz) continue;
            for (let di = -1; di <= 1; di++) {
              const ii = i + di;
              if (ii < 0 || ii >= nx) continue;
              m = Math.max(m, h[jj * nx + ii]);
            }
          }
          next[k] = m;
        }
      }
      h = next;
    }
    const data = new Uint16Array(nx * nz * 2);
    const toHalf = THREE.DataUtils.toHalfFloat;
    const openH = toHalf(OPEN);
    const one = toHalf(1);
    for (let k = 0; k < nx * nz; k++) {
      data[k * 2] = h[k] > OPEN ? toHalf(h[k]) : openH;
      data[k * 2 + 1] = top[k] > OPEN ? one : 0;
    }
    const tex = new THREE.DataTexture(data, nx, nz, THREE.RGFormat, THREE.HalfFloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.texture = tex;
    return tex;
  }

  dispose() {
    if (this.texture) this.texture.dispose();
    this.texture = null;
  }
}

/** A 1 x 1 map with no cover anywhere, for scenes without a CoverMap. */
export function openSkyTexture() {
  const tex = new THREE.DataTexture(new Uint16Array([THREE.DataUtils.toHalfFloat(OPEN), 0]), 1, 1, THREE.RGFormat, THREE.HalfFloatType);
  tex.needsUpdate = true;
  return tex;
}
