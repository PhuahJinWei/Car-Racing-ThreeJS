// Material roles for the car models (see tools/blender/build.mjs): the ids the parts are tagged
// with, and the base PBR values written into the .glb - the game swaps in its own materials by name.
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
