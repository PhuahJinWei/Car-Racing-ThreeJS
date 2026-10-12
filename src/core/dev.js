// Developer mode: a few shortcuts for testing (credits, unlocks, replaying the daily challenge).
// Off for players until switched on by tapping the Profile title in Settings seven times, and only
// until the page is closed or reloaded (nothing is stored); always on on the dev server.
import { CARS } from '../car/car-defs.js';
import { CATEGORIES, DEFAULT_CUSTOM_BY_CAR } from '../car/customization.js';
import { todayKey } from '../game/daily.js';

export const DEV_TAPS = 7;
let on = false;

export function devMode() {
  return import.meta.env.DEV || on;
}

export function setDevMode(v) {
  on = !!v;
}

/** Credits straight onto the balance (not counted as earned in the career stats). */
export function devCredits(storage, n) {
  storage.data.credits += n;
  storage.save();
}

/** Every car (each with its stock look, as if bought) and every style item. */
export function devUnlockAll(storage) {
  const d = storage.data;
  for (const c of CARS) {
    if (d.ownedCars.includes(c.id)) continue;
    d.ownedCars.push(c.id);
    const def = DEFAULT_CUSTOM_BY_CAR[c.id];
    if (def) d.custom[c.id] = { ...def };
  }
  for (const cat of CATEGORIES) for (const it of cat.items) storage.grant(cat.key, it.id);
  storage.save();
}

/** Today's daily challenge as if not played yet: it pays out again, and the streak carries on. */
export function devResetDaily(storage) {
  const ds = storage.data.daily;
  const today = todayKey();
  if (ds.lastCompleted === today) {
    ds.streak = Math.max(0, (ds.streak || 0) - 1);
    const y = new Date();
    y.setDate(y.getDate() - 1);
    ds.lastCompleted = ds.streak ? todayKey(y) : null;
  }
  ds.completed = false;
  ds.bonus = false;
  ds.best = null;
  storage.save();
}
