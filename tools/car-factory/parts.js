// Shared building blocks for car designs: materials, a tiny material-tracking SDF
// "accumulator", and helpers for pockets cut into a surface shell.
import { smin, smax, sdRoundBox, sdCapsule } from './sdf.js';

export const MAT = {
  paint: 0,
  glass: 1,
  trim: 2,
  carbon: 3,
  chrome: 4,
  grille: 5,
  head: 6,
  drl: 7,
  tail: 8,
  tailglow: 9,
  exhaust: 10,
  lens: 11,
  interior: 12,
  window: 13,
  // warning-light lenses (a patrol car's light bar), flashed by the game
  beaconR: 14,
  beaconB: 15,
  // clear reverse-lamp lens, lit by the game while the car backs up
  reverse: 16,
  // amber lamp lens (turn signals), lit by the game as a position lamp
  amber: 17,
  // amber turn-signal lens left unlit (rear indicators: lit all the time, they'd look stuck on)
  indicator: 18,
  // unpainted dark grey plastic (a cheap car's bumpers and mouldings)
  plastic: 19,
};
export const MAT_NAMES = Object.fromEntries(Object.entries(MAT).map(([k, v]) => [v, k]));

/** Base PBR values written into the .glb (the game swaps in its own materials by name). */
export const MAT_PBR = {
  paint: { color: [0.6, 0.05, 0.05], metallic: 0.5, roughness: 0.3 },
  glass: { color: [0.02, 0.025, 0.03], metallic: 0.2, roughness: 0.05 },
  trim: { color: [0.02, 0.02, 0.022], metallic: 0.1, roughness: 0.6 },
  carbon: { color: [0.03, 0.03, 0.035], metallic: 0.3, roughness: 0.35 },
  chrome: { color: [0.8, 0.8, 0.82], metallic: 1, roughness: 0.12 },
  grille: { color: [0.015, 0.015, 0.017], metallic: 0.2, roughness: 0.5 },
  head: { color: [0.25, 0.26, 0.28], metallic: 0.9, roughness: 0.15 },
  drl: { color: [1, 1, 1], metallic: 0, roughness: 0.3, emissive: [1, 1, 1] },
  tail: { color: [0.35, 0.01, 0.02], metallic: 0.1, roughness: 0.15 },
  tailglow: { color: [1, 0.05, 0.08], metallic: 0, roughness: 0.3, emissive: [1, 0.05, 0.08] },
  exhaust: { color: [0.02, 0.02, 0.02], metallic: 0.6, roughness: 0.6 },
  lens: { color: [0.9, 0.92, 1], metallic: 0, roughness: 0.05, emissive: [0.9, 0.95, 1] },
  interior: { color: [0.045, 0.045, 0.05], metallic: 0, roughness: 0.75 },
  window: { color: [0.02, 0.025, 0.03], metallic: 0, roughness: 0.04 },
  beaconR: { color: [0.5, 0.02, 0.03], metallic: 0, roughness: 0.2, emissive: [1, 0.03, 0.05] },
  beaconB: { color: [0.02, 0.08, 0.5], metallic: 0, roughness: 0.2, emissive: [0.05, 0.25, 1] },
  reverse: { color: [0.7, 0.72, 0.75], metallic: 0.6, roughness: 0.12, emissive: [0.15, 0.15, 0.16] },
  amber: { color: [1, 0.45, 0.06], metallic: 0, roughness: 0.2, emissive: [1, 0.42, 0.05] },
  indicator: { color: [0.6, 0.24, 0.02], metallic: 0.1, roughness: 0.15 },
  plastic: { color: [0.06, 0.062, 0.066], metallic: 0, roughness: 0.78 },
};

/** Material-tracking distance accumulator. */
export class Acc {
  constructor() {
    this.d = 1e9;
    this.m = 0;
  }
  set(d, m) {
    this.d = d;
    this.m = m;
    return this;
  }
  /** Add a part (smooth union). */
  add(d, m, k = 0) {
    if (d < this.d) this.m = m;
    this.d = k > 0 ? smin(this.d, d, k) : Math.min(this.d, d);
    return this;
  }
  /** Carve a cutter out; the newly exposed surface gets material m. */
  cut(d, m, k = 0) {
    if (-d > this.d) this.m = m;
    this.d = k > 0 ? smax(this.d, -d, k) : Math.max(this.d, -d);
    return this;
  }
  /** Intersect (keeps current material unless the intersector dominates and m given). */
  clip(d, m = -1, k = 0) {
    if (m >= 0 && d > this.d) this.m = m;
    this.d = k > 0 ? smax(this.d, d, k) : Math.max(this.d, d);
    return this;
  }
}

/**
 * A pocket = region ∩ thin shell under the surface. Returns {d, wall} where `wall` is true
 * when the region boundary (not the pocket floor) is the closest feature.
 *   region: signed distance of the pocket's footprint (negative inside)
 *   surf:   signed distance of the surface being cut (negative inside the body)
 *   depth:  how deep the pocket goes
 */
export function pocket(region, surf, depth, out) {
  const shell = -(surf + depth); // negative within `depth` of the surface (and outside it)
  out.wall = region > shell;
  return Math.max(region, shell);
}

/**
 * A simple left-hand-drive cockpit inside a hollowed cabin: bucket seats with bolsters, a
 * dashboard with a gauge hood, steering wheel on its column, centre console.
 * o: { seatX, seatZ, floorY, dashZ, dashY, dashW, wheelZ, wheelY, recline }
 */
export function addCockpit(acc, x, y, z, o) {
  const ax = Math.abs(x);
  const sx = ax - o.seatX;
  const fy = o.floorY;
  // seat cushions
  acc.add(sdRoundBox(sx, y - (fy + 0.09), z - o.seatZ, 0.2, 0.065, 0.24, 0.05), MAT.interior, 0.02);
  // reclined backrests with side bolsters
  const c = Math.cos(o.recline);
  const s = Math.sin(o.recline);
  const by = y - (fy + 0.42);
  const bz = z - (o.seatZ - 0.27);
  const ry = by * c + bz * s;
  const rz = -by * s + bz * c;
  acc.add(sdRoundBox(sx, ry, rz, 0.2, 0.32, 0.055, 0.05), MAT.interior, 0.03);
  acc.add(sdRoundBox(Math.abs(sx) - 0.2, ry + 0.06, rz - 0.05, 0.035, 0.22, 0.07, 0.03), MAT.interior, 0.03);
  // dashboard + gauge hood over the driver's side
  acc.add(sdRoundBox(x, y - o.dashY, z - o.dashZ, o.dashW, 0.075, 0.16, 0.05), MAT.interior, 0.04);
  acc.add(sdRoundBox(x - o.seatX, y - (o.dashY + 0.075), z - (o.dashZ - 0.07), 0.16, 0.04, 0.08, 0.03), MAT.interior, 0.02);
  // centre console
  acc.add(sdRoundBox(x, y - (fy + 0.12), z - (o.seatZ + 0.2), 0.09, 0.12, 0.45, 0.04), MAT.interior, 0.03);
  // steering wheel on the driver's side (+X), tilted toward the driver
  const tilt = 0.42;
  const wx = x - o.seatX;
  const wy = y - o.wheelY;
  const wz = z - o.wheelZ;
  const v = wy * Math.cos(tilt) + wz * Math.sin(tilt);
  const w = -wy * Math.sin(tilt) + wz * Math.cos(tilt);
  const ring = Math.hypot(Math.hypot(wx, v) - 0.165, w) - 0.017;
  acc.add(ring, MAT.carbon, 0.004);
  acc.add(sdRoundBox(wx, v, w, 0.05, 0.05, 0.02, 0.02), MAT.carbon, 0.006);
  acc.add(sdCapsule(x, y, z, o.seatX, o.wheelY + 0.02, o.wheelZ + 0.02, o.seatX, o.dashY - 0.01, o.dashZ - 0.04, 0.025), MAT.interior, 0.02);
}
