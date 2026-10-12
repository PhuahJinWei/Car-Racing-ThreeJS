import { DEFAULT_CUSTOM_BY_CAR, OWNERSHIP_KEY } from '../car/customization.js';

const KEY = 'neonoverdrive.save.v1';
const GHOST_PREFIX = 'neonoverdrive.ghost.';

export const DEFAULT_SETTINGS = {
  quality: 'auto',
  master: 0.85,
  sfx: 0.9,
  music: 0.55,
  shake: 1,
  motionBlur: 1,
  chromatic: 1,
  speedLines: 1,
  camera: 'chase',
  units: 'kmh',
  haptics: true,
  controls: 'buttons',
  autoAccel: true,
  tiltSensitivity: 1,
  showFps: false,
  keyHints: true,
  reduceFlashes: false,
};

function defaultSave() {
  return {
    v: 2,
    credits: 2500,
    car: 'volt',
    ownedCars: ['volt'],
    custom: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_BY_CAR)),
    owned: {
      paint: ['p_crimson', 'p_midnight', 'p_white'],
      finish: ['gloss'],
      livery: ['lv_none'],
      rims: ['r_split'],
      rimColor: ['rc_gunmetal', 'rc_silver'],
      underglow: ['ug_none', 'ug_cyan'],
      trail: ['tr_red'],
    },
    settings: { ...DEFAULT_SETTINGS },
    records: {},
    tt: {},
    daily: { date: null, best: null, completed: false, streak: 0, lastCompleted: null },
    stats: { races: 0, wins: 0, podiums: 0, nearMisses: 0, driftDistance: 0, bestCombo: 1, creditsEarned: 0, bestDrift: 0 },
    lastSetup: { trackId: 'lumen', reverse: false, mirror: false, weather: 'clear', laps: 3, difficulty: 'easy' },
    tutorialDone: false,
  };
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Persistent progress: credits, cars, cosmetics, settings, records and ghosts. */
export class Storage {
  constructor() {
    this.data = defaultSave();
    const raw = safeGet(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.data = this._merge(defaultSave(), parsed);
        // v1 -> v2: rivals were retuned; start everyone on the friendlier default
        if (!parsed.v || parsed.v < 2) {
          this.data.lastSetup.difficulty = 'easy';
          for (const c of Object.values(this.data.custom)) c.underglow = 'ug_none';
          this.data.v = 2;
        }
      } catch {
        /* corrupted save -> defaults */
      }
    }
  }

  _merge(base, saved) {
    const out = { ...base, ...saved };
    out.settings = { ...base.settings, ...(saved.settings || {}) };
    out.owned = { ...base.owned };
    for (const k of Object.keys(base.owned)) out.owned[k] = Array.from(new Set([...(base.owned[k] || []), ...((saved.owned || {})[k] || [])]));
    out.custom = { ...base.custom };
    for (const k of Object.keys(saved.custom || {})) out.custom[k] = { ...(base.custom[k] || {}), ...saved.custom[k] };
    out.stats = { ...base.stats, ...(saved.stats || {}) };
    out.daily = { ...base.daily, ...(saved.daily || {}) };
    out.lastSetup = { ...base.lastSetup, ...(saved.lastSetup || {}) };
    return out;
  }

  save() {
    safeSet(KEY, JSON.stringify(this.data));
  }

  get settings() {
    return this.data.settings;
  }

  get credits() {
    return this.data.credits;
  }

  addCredits(n) {
    this.data.credits = Math.max(0, Math.round(this.data.credits + n));
    if (n > 0) this.data.stats.creditsEarned += Math.round(n);
    this.save();
  }

  spend(n) {
    if (this.data.credits < n) return false;
    this.data.credits -= n;
    this.save();
    return true;
  }

  ownsCar(id) {
    return this.data.ownedCars.includes(id);
  }

  buyCar(car) {
    if (this.ownsCar(car.id)) return true;
    if (!this.spend(car.price)) return false;
    this.data.ownedCars.push(car.id);
    // the car ships with its default look - grant those items
    const def = DEFAULT_CUSTOM_BY_CAR[car.id];
    if (def) for (const [cat, id] of Object.entries(def)) this.grant(cat, id);
    this.save();
    return true;
  }

  owns(category, id) {
    const bucket = OWNERSHIP_KEY[category] || category;
    return (this.data.owned[bucket] || []).includes(id);
  }

  grant(category, id) {
    const bucket = OWNERSHIP_KEY[category] || category;
    const arr = this.data.owned[bucket] || (this.data.owned[bucket] = []);
    if (!arr.includes(id)) arr.push(id);
  }

  buyItem(category, item) {
    if (this.owns(category, item.id)) return true;
    if (!this.spend(item.price)) return false;
    this.grant(category, item.id);
    this.save();
    return true;
  }

  customFor(carId) {
    return this.data.custom[carId] || (this.data.custom[carId] = { ...(DEFAULT_CUSTOM_BY_CAR[carId] || DEFAULT_CUSTOM_BY_CAR.volt) });
  }

  equip(carId, category, id) {
    this.customFor(carId)[category] = id;
    this.save();
  }

  record(key) {
    return this.data.records[key] || null;
  }

  setRecord(key, mode, time, bestLap) {
    const table = mode === 'timetrial' ? this.data.tt : this.data.records;
    const r = table[key] || (table[key] = { bestTime: null, bestLap: null });
    let newTime = false;
    let newLap = false;
    if (time && (!r.bestTime || time < r.bestTime)) {
      r.bestTime = time;
      newTime = true;
    }
    if (bestLap && isFinite(bestLap) && (!r.bestLap || bestLap < r.bestLap)) {
      r.bestLap = bestLap;
      newLap = true;
    }
    this.save();
    return { newTime, newLap };
  }

  getRecord(key, mode) {
    const table = mode === 'timetrial' ? this.data.tt : this.data.records;
    return table[key] || null;
  }

  getGhost(key) {
    return safeGet(GHOST_PREFIX + key);
  }

  setGhost(key, data) {
    if (!safeSet(GHOST_PREFIX + key, data)) {
      // storage full: drop other ghosts and retry once
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(GHOST_PREFIX)) localStorage.removeItem(k);
        }
      } catch {
        /* ignore */
      }
      safeSet(GHOST_PREFIX + key, data);
    }
  }

  reset() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('neonoverdrive.')) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
    const keepSettings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = keepSettings;
    this.save();
  }
}
