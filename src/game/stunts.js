// Style scoring: drifts, near misses, slipstreams, air, overtakes - chained into combos.

export class StuntTracker {
  constructor(onPopup) {
    this.onPopup = onPopup;
    this.total = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.comboWindow = 4.0;
    this.driftPoints = 0;
    this.counts = { drift: 0, nearMiss: 0, overtake: 0, air: 0, slipstream: 0, perfectStart: 0, driftDistance: 0 };
    this.best = { drift: 0, air: 0, combo: 1 };
  }

  update(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }
  }

  /** Award points; returns the awarded (multiplied) amount. */
  add(kind, points, label, opts = {}) {
    const mult = this.combo;
    const awarded = Math.round(points * mult);
    this.total += awarded;
    if (opts.chain !== false) {
      this.combo = Math.min(5, this.combo + 1);
      this.comboTimer = this.comboWindow;
      this.best.combo = Math.max(this.best.combo, this.combo);
    }
    if (this.counts[kind] !== undefined) this.counts[kind]++;
    this.onPopup?.({ kind, label, points: awarded, combo: mult, big: opts.big });
    return awarded;
  }

  breakCombo() {
    if (this.combo > 1) this.onPopup?.({ kind: 'break', label: 'COMBO LOST', points: 0, combo: 1 });
    this.combo = 1;
    this.comboTimer = 0;
  }

  driftTick(dt, speed, slip) {
    const p = speed * Math.min(slip, 1.1) * dt * 4.2;
    this.driftPoints += p;
    this.counts.driftDistance += speed * dt;
    return this.driftPoints;
  }

  driftEnd(failed) {
    const pts = Math.round(this.driftPoints);
    this.driftPoints = 0;
    if (failed) {
      this.onPopup?.({ kind: 'fail', label: 'DRIFT FAILED', points: 0, combo: 1 });
      this.breakCombo();
      return 0;
    }
    if (pts < 60) return 0;
    this.best.drift = Math.max(this.best.drift, pts);
    let label = 'DRIFT';
    if (pts > 3500) label = 'INSANE DRIFT';
    else if (pts > 1800) label = 'EPIC DRIFT';
    else if (pts > 900) label = 'GREAT DRIFT';
    return this.add('drift', pts, label, { big: pts > 1800 });
  }
}
