// Cosmetic customization catalogue. Everything here is purely visual.

export const PAINTS = [
  { id: 'p_crimson', name: 'Crimson', color: '#c40c2c', price: 0 },
  { id: 'p_midnight', name: 'Midnight', color: '#101c44', price: 0 },
  { id: 'p_white', name: 'Arctic', color: '#e9edf3', price: 0 },
  { id: 'p_black', name: 'Obsidian', color: '#0b0b10', price: 300 },
  { id: 'p_cyan', name: 'Cyber Cyan', color: '#00c4dc', price: 500 },
  { id: 'p_magenta', name: 'Hot Magenta', color: '#e3149a', price: 500 },
  { id: 'p_lime', name: 'Acid Lime', color: '#86e000', price: 500 },
  { id: 'p_orange', name: 'Blaze', color: '#ff6200', price: 500 },
  { id: 'p_violet', name: 'Ultraviolet', color: '#6528ff', price: 700 },
  { id: 'p_yellow', name: 'Volt Yellow', color: '#ffd000', price: 600 },
  { id: 'p_silver', name: 'Liquid Silver', color: '#a3acb7', price: 600 },
  { id: 'p_teal', name: 'Deep Teal', color: '#0b6f6c', price: 600 },
  { id: 'p_gold', name: 'Gold Rush', color: '#c9961a', price: 1200 },
];

export const FINISHES = [
  { id: 'gloss', name: 'Gloss', price: 0 },
  { id: 'metallic', name: 'Metallic', price: 600 },
  { id: 'matte', name: 'Matte', price: 900 },
  { id: 'pearl', name: 'Chameleon', price: 3500 },
  { id: 'chrome', name: 'Chrome', price: 5000 },
  { id: 'neon', name: 'Neon Glow', price: 6000 },
];

export const LIVERIES = [
  { id: 'lv_none', name: 'Clean', price: 0 },
  { id: 'lv_stripes', name: 'Twin Stripes', price: 600 },
  { id: 'lv_race', name: 'Racer 77', price: 800 },
  { id: 'lv_bolt', name: 'Side Bolt', price: 900 },
  { id: 'lv_split', name: 'Two-Tone', price: 1000 },
  { id: 'lv_circuit', name: 'Circuitry', price: 1800 },
  { id: 'lv_panda', name: 'Panda', price: 1200 },
  // only for the car named in `only`
  { id: 'lv_police', name: 'Patrol', price: 0, only: 'marshal' },
];

export const RIMS = [
  { id: 'r_split', name: 'Split Five', style: 'split', price: 0 },
  { id: 'r_turbine', name: 'Turbine', style: 'turbine', price: 700 },
  { id: 'r_mesh', name: 'Mesh', style: 'mesh', price: 900 },
  { id: 'r_blade', name: 'Blade', style: 'blade', price: 1200 },
];

export const RIM_COLORS = [
  { id: 'rc_silver', name: 'Silver', color: '#c9cfd8', price: 0 },
  { id: 'rc_gunmetal', name: 'Gunmetal', color: '#3a3f48', price: 0 },
  { id: 'rc_black', name: 'Black', color: '#111216', price: 200 },
  { id: 'rc_gold', name: 'Gold', color: '#c99a2e', price: 600 },
  { id: 'rc_neoncyan', name: 'Neon Cyan', color: '#00e5ff', glow: true, price: 1500 },
  { id: 'rc_neonpink', name: 'Neon Pink', color: '#ff2bd6', glow: true, price: 1500 },
];

/**
 * Window film. `shade`: how much of the cabin it hides (0 clear .. 1 black); mirror films also
 * colour the reflections.
 */
export const TINTS = [
  { id: 't_clear', name: 'Factory', shade: 0.3, color: '#0b0e13', price: 0 },
  { id: 't_light', name: 'Light Smoke', shade: 0.5, color: '#08090c', price: 300 },
  { id: 't_dark', name: 'Dark Smoke', shade: 0.7, color: '#050608', price: 500 },
  { id: 't_limo', name: 'Limo', shade: 0.9, color: '#020203', price: 800 },
  { id: 't_blue', name: 'Blue Mirror', shade: 0.75, color: '#2b4a8c', mirror: 0.5, price: 1200 },
  { id: 't_gold', name: 'Gold Mirror', shade: 0.75, color: '#a8833f', mirror: 0.5, price: 1200 },
];

/** Door numbers: a roundel on both doors (the Racer livery's own roundel shows it too). */
export const NUMBERS = [
  { id: 'n_none', name: 'None', value: null, price: 0 },
  { id: 'n_7', name: '#7', value: 7, price: 0 },
  { id: 'n_13', name: '#13', value: 13, price: 400 },
  { id: 'n_27', name: '#27', value: 27, price: 400 },
  { id: 'n_33', name: '#33', value: 33, price: 400 },
  { id: 'n_55', name: '#55', value: 55, price: 400 },
  { id: 'n_86', name: '#86', value: 86, price: 860 },
  { id: 'n_99', name: '#99', value: 99, price: 400 },
  { id: 'n_1', name: '#1', value: 1, price: 2500 },
];

export const UNDERGLOWS = [
  { id: 'ug_none', name: 'Off', color: null, price: 0 },
  { id: 'ug_cyan', name: 'Cyan', color: '#00e5ff', price: 0 },
  { id: 'ug_magenta', name: 'Magenta', color: '#ff2bd6', price: 400 },
  { id: 'ug_lime', name: 'Lime', color: '#7dff3a', price: 400 },
  { id: 'ug_amber', name: 'Amber', color: '#ffa31a', price: 400 },
  { id: 'ug_violet', name: 'Violet', color: '#8a5cff', price: 400 },
  { id: 'ug_red', name: 'Red', color: '#ff2a3a', price: 400 },
  { id: 'ug_rainbow', name: 'Spectrum', color: 'rainbow', price: 2500 },
];

export const TRAILS = [
  { id: 'tr_red', name: 'Tail Red', color: '#ff2040', price: 0 },
  { id: 'tr_cyan', name: 'Cyan Streak', color: '#00e5ff', price: 500 },
  { id: 'tr_magenta', name: 'Magenta Streak', color: '#ff2bd6', price: 500 },
  { id: 'tr_gold', name: 'Gold Streak', color: '#ffc23d', price: 500 },
  { id: 'tr_white', name: 'White Hot', color: '#ffffff', price: 800 },
  { id: 'tr_rainbow', name: 'Spectrum', color: 'rainbow', price: 3000 },
];

export const CATEGORIES = [
  { key: 'paint', name: 'PAINT', items: PAINTS },
  { key: 'finish', name: 'FINISH', items: FINISHES },
  { key: 'livery', name: 'LIVERY', items: LIVERIES },
  { key: 'accent', name: 'ACCENT', items: PAINTS },
  { key: 'number', name: 'NUMBER', items: NUMBERS },
  { key: 'tint', name: 'WINDOW TINT', items: TINTS },
  { key: 'rims', name: 'RIMS', items: RIMS },
  { key: 'rimColor', name: 'RIM COLOR', items: RIM_COLORS },
  { key: 'underglow', name: 'UNDERGLOW', items: UNDERGLOWS },
  { key: 'trail', name: 'LIGHT TRAIL', items: TRAILS },
];

/** Which ownership bucket an item category uses (accent shares paints). */
export const OWNERSHIP_KEY = {
  paint: 'paint',
  accent: 'paint',
  finish: 'finish',
  livery: 'livery',
  number: 'number',
  tint: 'tint',
  rims: 'rims',
  rimColor: 'rimColor',
  underglow: 'underglow',
  trail: 'trail',
};

export const DEFAULT_CUSTOM = {
  paint: 'p_crimson',
  finish: 'gloss',
  accent: 'p_white',
  livery: 'lv_none',
  number: 'n_none',
  tint: 't_clear',
  rims: 'r_split',
  rimColor: 'rc_silver',
  underglow: 'ug_none',
  trail: 'tr_red',
};

export const DEFAULT_CUSTOM_BY_CAR = {
  volt: { ...DEFAULT_CUSTOM },
  razor: { ...DEFAULT_CUSTOM, paint: 'p_white', accent: 'p_black', livery: 'lv_stripes' },
  specter: { ...DEFAULT_CUSTOM, paint: 'p_midnight', accent: 'p_silver', livery: 'lv_race', rimColor: 'rc_black' },
  // the two-tone "panda": white over black
  touge: { ...DEFAULT_CUSTOM, paint: 'p_white', accent: 'p_black', livery: 'lv_panda', rimColor: 'rc_gunmetal' },
  // black and white
  marshal: { ...DEFAULT_CUSTOM, paint: 'p_black', accent: 'p_white', livery: 'lv_police', tint: 't_light' },
};

/** Whether an item is on offer for a car (some are made for one car). */
export const itemFits = (item, carId) => !item.only || item.only === carId;

export function findItem(category, id) {
  const cat = CATEGORIES.find((c) => c.key === category);
  if (!cat) return null;
  return cat.items.find((i) => i.id === id) || cat.items[0];
}

export function resolveCustom(custom) {
  const c = { ...DEFAULT_CUSTOM, ...(custom || {}) };
  return {
    paint: findItem('paint', c.paint),
    finish: findItem('finish', c.finish),
    accent: findItem('accent', c.accent),
    livery: findItem('livery', c.livery),
    number: findItem('number', c.number),
    tint: findItem('tint', c.tint),
    rims: findItem('rims', c.rims),
    rimColor: findItem('rimColor', c.rimColor),
    underglow: findItem('underglow', c.underglow),
    trail: findItem('trail', c.trail),
  };
}

/** Random cosmetic setup for AI opponents (deterministic per seed); patrol cars keep their colours. */
export function randomCustom(r, def) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const c = {
    paint: pick(PAINTS).id,
    finish: pick(['gloss', 'metallic', 'metallic', 'pearl', 'matte']),
    accent: pick(PAINTS).id,
    livery: pick(LIVERIES.filter((l) => !l.only)).id,
    tint: pick(['t_clear', 't_clear', 't_light', 't_dark', 't_limo']),
    rims: pick(RIMS).id,
    rimColor: pick(RIM_COLORS).id,
    underglow: r() < 0.85 ? 'ug_none' : pick(UNDERGLOWS.slice(1, 7)).id,
    trail: 'tr_red',
  };
  return def?.patrol ? { ...c, ...DEFAULT_CUSTOM_BY_CAR[def.id] } : c;
}
