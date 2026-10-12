import { TRACKS } from '../world/tracks.js';
import { CARS } from '../car/car-defs.js';
import { rng, hashString } from '../core/math.js';

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function msUntilTomorrow() {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return t - now;
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
      objective = { type: 'win', label: 'WIN THE RACE', detail: 'Normal rivals. Take first place.', difficulty: 'normal' };
      break;
    case 'podium':
      objective = { type: 'podium', label: 'FINISH ON THE PODIUM', detail: 'Normal rivals. Top 3 or bust.', difficulty: 'normal' };
      break;
    case 'style': {
      const target = 5000 + Math.floor(r() * 5) * 1000;
      objective = { type: 'style', target, label: `SCORE ${target.toLocaleString('en-US')} STYLE`, detail: 'Drifts, near misses, big air and overtakes all count.' };
      break;
    }
    case 'nearMiss': {
      const target = 5 + Math.floor(r() * 6);
      objective = { type: 'nearMiss', target, label: `${target} NEAR MISSES`, detail: 'Pass rivals close enough to feel the paint.' };
      break;
    }
    case 'drift': {
      const target = 1500 + Math.floor(r() * 5) * 500;
      objective = { type: 'drift', target, label: `LAND A ${target.toLocaleString('en-US')}+ DRIFT`, detail: 'One single drift. Hold it, link it, cash it.' };
      break;
    }
    default: {
      const target = 3 + Math.floor(r() * 3);
      objective = { type: 'combo', target, label: `REACH A x${target} COMBO`, detail: 'Chain stunts within four seconds of each other.' };
    }
  }
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
      return `P${res.place}`;
  }
}
