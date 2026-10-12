import { TRACKS } from '../world/tracks.js';
import { CARS } from '../car/car-defs.js';
import { rng, hashString } from '../core/math.js';
import { t } from '../core/i18n.js';

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function msUntilTomorrow() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
}

/** Deterministic daily challenge: same track, variant and objective for everyone on a given day. */
export function getDaily(date = new Date()) {
  const key = todayKey(date);
  const r = rng(hashString('daily:' + key));
  const track = TRACKS[Math.floor(r() * TRACKS.length)];
  const variant = { reverse: r() < 0.5, mirror: r() < 0.35, weather: r() < 0.45 ? 'rain' : 'clear' };
  const car = CARS[Math.floor(r() * CARS.length)];
  const kinds = ['win', 'podium', 'style', 'nearMiss', 'drift', 'combo'];
  const kind = kinds[Math.floor(r() * kinds.length)];
  let objective;
  switch (kind) {
    case 'win':
      objective = { type: 'win', difficulty: 'normal' };
      break;
    case 'podium':
      objective = { type: 'podium', difficulty: 'normal' };
      break;
    case 'style':
      objective = { type: 'style', target: 5000 + Math.floor(r() * 5) * 1000 };
      break;
    case 'nearMiss':
      objective = { type: 'nearMiss', target: 5 + Math.floor(r() * 6) };
      break;
    case 'drift':
      objective = { type: 'drift', target: 1500 + Math.floor(r() * 5) * 500 };
      break;
    default:
      objective = { type: 'combo', target: 3 + Math.floor(r() * 3) };
  }
  // in the current language: built whenever the screens ask for today's challenge
  const n = objective.target?.toLocaleString('en-US');
  objective.label = t(`obj.${objective.type}`, { n });
  objective.detail = t(`obj.${objective.type}Detail`);
  return {
    key,
    trackId: track.id,
    trackName: track.name,
    variant,
    carId: car.id,
    carName: car.name,
    laps: 2,
    difficulty: objective.difficulty || 'easy',
    objective,
    reward: 1500,
  };
}

export function evaluateDaily(daily, res) {
  const o = daily.objective;
  switch (o.type) {
    case 'win':
      return res.place === 1;
    case 'podium':
      return res.place <= 3;
    case 'style':
      return res.style >= o.target;
    case 'nearMiss':
      return (res.counts.nearMiss || 0) >= o.target;
    case 'drift':
      return (res.best.drift || 0) >= o.target;
    case 'combo':
      return (res.best.combo || 1) >= o.target;
    default:
      return false;
  }
}

export function dailyProgress(daily, res) {
  const o = daily.objective;
  switch (o.type) {
    case 'style':
      return `${res.style.toLocaleString('en-US')} / ${o.target.toLocaleString('en-US')}`;
    case 'nearMiss':
      return `${res.counts.nearMiss || 0} / ${o.target}`;
    case 'drift':
      return `${(res.best.drift || 0).toLocaleString('en-US')} / ${o.target.toLocaleString('en-US')}`;
    case 'combo':
      return `x${res.best.combo || 1} / x${o.target}`;
    default:
      return t('daily.place', { n: res.place });
  }
}
