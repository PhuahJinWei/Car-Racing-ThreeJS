// Turns a compact "turtle" description of a circuit (straights and constant-radius arcs)
// into a closed, evenly spaced centre-line. Two straights are automatically stretched so
// the loop closes exactly, which lets track layouts be authored by feel.

const DEG = Math.PI / 180;

function walk(cmds, lengths, step = 4) {
  // Heading psi: forward = (sin psi, cos psi) in (x, z). Left turn = psi increases.
  let x = 0;
  let z = 0;
  let psi = 0;
  const pts = [[x, z]];
  const starts = [];
  cmds.forEach((c, idx) => {
    starts.push(pts.length - 1);
    if (c[0] === 'S') {
      const len = lengths[idx];
      const n = Math.max(1, Math.round(len / step));
      for (let i = 1; i <= n; i++) {
        const d = (len * i) / n - (len * (i - 1)) / n;
        x += Math.sin(psi) * d;
        z += Math.cos(psi) * d;
        pts.push([x, z]);
      }
    } else {
      const sign = c[0] === 'L' ? 1 : -1;
      const ang = c[1] * DEG;
      const r = c[2];
      const arcLen = ang * r;
      const n = Math.max(2, Math.round(arcLen / step));
      // center of turn circle: to the left (sign=1) or right of heading
      const lx = Math.cos(psi) * sign; // left vector = (cos psi, -sin psi) for left turn
      const lz = -Math.sin(psi) * sign;
      const cx = x + lx * r;
      const cz = z + lz * r;
      const a0 = Math.atan2(x - cx, z - cz);
      for (let i = 1; i <= n; i++) {
        const a = a0 + (sign * ang * i) / n;
        pts.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
      }
      psi += sign * ang;
      const last = pts[pts.length - 1];
      x = last[0];
      z = last[1];
    }
  });
  starts.push(pts.length - 1);
  return { pts, end: [x, z], psi, starts };
}

/**
 * Build closed centre-line points from turtle commands.
 * Returns array of [x, z] (without the duplicated closing point).
 */
export function buildTurtlePath(cmds, step = 4) {
  const lengths = cmds.map((c) => (c[0] === 'S' ? c[1] : 0));
  const first = walk(cmds, lengths, step);
  const ex = first.end[0];
  const ez = first.end[1];

  // Heading of each straight
  const straights = [];
  {
    let psi = 0;
    cmds.forEach((c, idx) => {
      if (c[0] === 'S') straights.push({ idx, psi });
      else psi += (c[0] === 'L' ? 1 : -1) * c[1] * DEG;
    });
  }

  // Choose the pair of straights that absorbs the closing error with the least change.
  let best = null;
  for (let a = 0; a < straights.length; a++) {
    for (let b = a + 1; b < straights.length; b++) {
      const A = straights[a];
      const B = straights[b];
      const d1x = Math.sin(A.psi);
      const d1z = Math.cos(A.psi);
      const d2x = Math.sin(B.psi);
      const d2z = Math.cos(B.psi);
      const det = d1x * d2z - d1z * d2x;
      if (Math.abs(det) < 0.35) continue;
      // Solve k1*d1 + k2*d2 = -e
      const k1 = (-ex * d2z + ez * d2x) / det;
      const k2 = (-ez * d1x + ex * d1z) / det;
      const l1 = lengths[A.idx] + k1;
      const l2 = lengths[B.idx] + k2;
      if (l1 < 30 || l2 < 30) continue;
      // Prefer stretching straights over shrinking them (keeps authored straights intact).
      const cost = Math.abs(k1) + Math.abs(k2) + 3 * Math.max(0, -k1) + 3 * Math.max(0, -k2);
      if (!best || cost < best.cost) best = { cost, a: A.idx, b: B.idx, l1, l2 };
    }
  }
  if (best) {
    lengths[best.a] = best.l1;
    lengths[best.b] = best.l2;
  }
  const res = walk(cmds, lengths, step);
  const pts = res.pts;
  // Remove residual error (should be ~0) by distributing it along the loop.
  const rx = res.end[0];
  const rz = res.end[1];
  const n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts[i][0] -= rx * t;
    pts[i][1] -= rz * t;
  }
  pts.pop();
  return { pts, starts: res.starts, adjusted: best, headingError: res.psi };
}

/** Periodic smooth interpolation of an elevation profile [[fraction, height], ...]. */
export function sampleProfile(profile, f) {
  if (!profile || profile.length === 0) return 0;
  const n = profile.length;
  // find segment
  let i = 0;
  while (i < n && profile[i][0] <= f) i++;
  const p1 = profile[(i - 1 + n) % n];
  const p2 = profile[i % n];
  let f1 = p1[0];
  let f2 = p2[0];
  if (i === 0) f1 -= 1;
  if (i === n) f2 += 1;
  const t = f2 - f1 > 1e-6 ? (f - f1) / (f2 - f1) : 0;
  const u = t * t * (3 - 2 * t);
  return p1[1] + (p2[1] - p1[1]) * u;
}
