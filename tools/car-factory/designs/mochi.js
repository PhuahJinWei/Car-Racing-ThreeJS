// MOCHI - a 90s Japanese kei box car. A tiny, tall box on 13-inch wheels, cheap but with all the
// parts a real one has: unpainted dark grey bumpers and a moulding along the doors, a short nose with
// round headlamps in chrome rings either side of a chrome-framed grille, amber corner lamps and side
// repeaters, wipers at the foot of an upright windshield, a black belt moulding under a tall
// glasshouse with five doors' worth of glass, chrome roof rails, a lip spoiler with a third brake
// lamp, tall tail lamps up the back corners (amber, red and clear), a chrome garnish over the plate, a
// rear wiper, a fuel flap, mud flaps and one little exhaust. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildMochi() {
  const WH = {
    front: { z: 1.18, y: 0.27, x: 0.63, r: 0.27, w: 0.155 },
    rear: { z: -1.18, y: 0.27, x: 0.63, r: 0.27, w: 0.155 },
  };
  const GAP = 0.035; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a short sloping nose, a straight beltline, an upright tail
  const bodySide = new Profile2D(
    [
      [1.66, 0.18, 1],
      [1.72, 0.24],
      [1.74, 0.34],
      [1.74, 0.48],
      [1.72, 0.66],
      [1.66, 0.75],
      [1.5, 0.8],
      [1.25, 0.84],
      [1.1, 0.865],
      [0.5, 0.885],
      [-0.5, 0.9],
      [-1.5, 0.92],
      [-1.6, 0.925, 1],
      [-1.66, 0.85],
      [-1.67, 0.5],
      [-1.66, 0.3],
      [-1.62, 0.2],
      [-1.55, 0.18, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a box with soft corners
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 1.74],
      [0.56, 1.73],
      [0.68, 1.68],
      [0.735, 1.57],
      [0.74, 1.4],
      [0.74, -1.45],
      [0.73, -1.58],
      [0.66, -1.66],
      [0, -1.67],
    ]),
    { band: 0.2 },
  );
  // the tall glasshouse: an upright windshield, a long flat roof and a near-vertical tailgate
  const cabSide = new Profile2D(
    [
      [1.16, 0.8, 1],
      [1.1, 0.865],
      [0.75, 1.4],
      [0.62, 1.55],
      [0.48, 1.6],
      [0.0, 1.615],
      [-1.4, 1.62],
      [-1.55, 1.6],
      [-1.62, 1.52],
      [-1.66, 0.93, 1],
      [-1.66, 0.8, 1],
      [1.16, 0.75, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.17],
      [0.6, 1.16],
      [0.68, 1.1],
      [0.7, 0.98],
      [0.7, -1.5],
      [0.67, -1.6],
      [0.56, -1.66],
      [0, -1.665],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // front and rear door glass and a small quarter window, black pillars between them
  const FRONT_WIN = [
    [1.0, 0.94, 1],
    [0.66, 1.46],
    [0.56, 1.54, 1],
    [0.1, 1.55, 1],
    [0.1, 0.94, 1],
  ];
  const REAR_WIN = [
    [0.02, 1.55, 1],
    [-0.78, 1.555, 1],
    [-0.78, 0.945, 1],
    [0.02, 0.94, 1],
  ];
  const QUARTER_WIN = [
    [-0.86, 1.555, 1],
    [-1.36, 1.56, 1],
    [-1.36, 0.95, 1],
    [-0.86, 0.946, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.13],
    [0.6, 1.125],
    [0.65, 1.06],
    [0.64, 0.8],
    [0.6, 0.62],
    [0, 0.6],
  ]);
  const sideWins = [FRONT_WIN, REAR_WIN, QUARTER_WIN];
  const sideWin = sideWins.map((o) => new Profile2D(o, small));
  const windshield = new Profile2D(WINDSHIELD, small);

  // cross-section: slab sides, tucked in at the sills, leaning in above a crisp shoulder line under
  // the windows
  const sec = (y) => (y < 0.3 ? 0.95 + 0.05 * smoothstep(0.18, 0.3, y) : y > 0.78 ? 1 - (y - 0.78) * 0.06 : 1);

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    // (edges a little crisper than a soft toy's: 5 cm)
    const dBody = smax(bS, bP, 0.05);
    const tilt = Math.max(0, y - 0.95) * 0.1;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.05);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    return smin(dBody, dCab, 0.03);
  }

  const acc = new Acc();
  const po = { wall: false };
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);
  // exact distance outside the corner where two fields meet (a plain max reads too close there, and
  // the AO bake paints a dark box round the part), and the same with the corner rounded
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;
  // wipers: points on the windshield (x across, at height y, `off` out from the glass) and on the
  // tailgate; two parked along the foot of the windshield, one across the bottom of the tailgate glass
  const onWindshield = (x, y, off) => [x, y + 0.548 * off, 1.1 - 0.654 * (y - 0.865) + 0.837 * off];
  const onTailgate = (x, y, off) => [x, y, -1.66 + 0.068 * (y - 0.93) - off];
  const WIPERS = [
    [onWindshield(0.36, 0.888, 0.012), onWindshield(-0.08, 0.903, 0.012)],
    [onWindshield(-0.15, 0.888, 0.012), onWindshield(-0.56, 0.903, 0.012)],
    [onTailgate(0.02, 1.0, 0.012), onTailgate(0.45, 1.05, 0.012)],
  ];

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { dBody, dCab, cS, cP, bP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // chrome roof rails on little feet, two bars across
    if (y > 1.58 && y < 1.72 && z > -1.42 && z < 0.55 && ax < 0.66) {
      acc.add(sdCapsule(ax, y, z, 0.56, 1.675, 0.42, 0.56, 1.675, -1.3, 0.016), MAT.chrome, 0.004);
      for (const zf of [0.38, -0.45, -1.26]) acc.add(sdRoundBox(ax - 0.56, y - 1.64, z - zf, 0.018, 0.035, 0.03, 0.01), MAT.chrome, 0.012);
      for (const zb of [0.1, -0.95]) acc.add(sdCapsule(ax, y, z, 0, 1.685, zb, 0.56, 1.685, zb, 0.012), MAT.chrome, 0.004);
    }
    // little black mirrors at the front corners of the door glass
    if (z > 0.86 && z < 1.08 && y > 0.86 && y < 1.08 && ax > 0.62) {
      acc.add(sdRoundBox(ax - 0.8, y - 0.99, z - 0.97, 0.045, 0.045, 0.032, 0.02), MAT.trim, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.68, 0.94, 0.99, 0.77, 0.98, 0.975, 0.011), MAT.trim, 0.008);
    }
    // unpainted dark grey plastic bumpers, 12 mm proud of the body and wrapping round the corners to
    // the wheel arches (which trim their ends)
    if (z > 1.38 && y < 0.5) acc.add(smax(edge(sh - 0.012, 1.4 - z), y - 0.47, 0.008), MAT.plastic, 0.002);
    if (z < -1.38 && y < 0.43) acc.add(smax(edge(sh - 0.012, z + 1.4), y - 0.4, 0.008), MAT.plastic, 0.002);
    // a moulding along the doors in the same plastic, level with the bumpers
    if (ax > 0.7 && y > 0.38 && y < 0.46 && Math.abs(z) < 0.92) {
      acc.add(roundEdge(Math.max(bP - 0.008, -(bP + 0.02)), sdRoundBox(z, y - 0.42, 0, 0.89, 0.02, 1, 0.012), 0.004), MAT.plastic, 0.003);
    }
    // a lip spoiler carrying the roof on over the tailgate
    if (ax < 0.66 && y > 1.5 && y < 1.68 && z < -1.4 && z > -1.7) {
      acc.add(sdRoundBox(x, y - 1.6, z + 1.575, 0.6, 0.025, 0.085, 0.01), MAT.paint, 0.025);
    }
    // a chrome garnish across the tailgate over the plate (the handle slot is cut under it)
    if (z < -1.6 && y > 0.61 && y < 0.67 && ax < 0.36) {
      acc.add(roundEdge(Math.max(sh - 0.006, -(sh + 0.015)), sdRoundBox(x, y - 0.64, 0, 0.34, 0.015, 1, 0.008), 0.003), MAT.chrome, 0.003);
    }
    // mud flaps behind every wheel
    if (ax > 0.56 && y < 0.3 && ((z > 0.84 && z < 0.88) || (z < -1.48 && z > -1.52))) {
      acc.add(sdRoundBox(ax - 0.645, y - 0.19, z - (z > 0 ? 0.862 : -1.5), 0.075, 0.085, 0.006, 0.004), MAT.trim, 0.006);
    }
    // one little exhaust under the right-hand side of the bumper (after the bumper, which would fill
    // its bore)
    if (z < -1.5 && y < 0.25 && x < -0.3 && x > -0.55) {
      acc.add(sdCylZ(x + 0.42, y - 0.16, z + 1.64, 0.026, 0.06), MAT.chrome, 0.004);
      acc.cut(sdCylZ(x + 0.42, y - 0.16, z + 1.64, 0.019, 0.075), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, buckets in front, a bench behind
    if (y > 0.2 && z < 1.16 && z > -1.62 && ax < 0.72) {
      const tub = Math.max(dBody + 0.035, ax - 0.67);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.23 - y, z - 1.1, -1.58 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.32, seatZ: 0.2, floorY: 0.28, dashZ: 0.86, dashY: 0.84, dashW: 0.64, wheelZ: 0.66, wheelY: 0.92, recline: 0.22 });
      if (z < -0.3) {
        acc.add(sdRoundBox(x, y - 0.42, z + 0.65, 0.58, 0.07, 0.22, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.72, z + 0.9, 0.58, 0.28, 0.07, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls (glass panes sit in them); black pillars between the
    // side windows; the tailgate glass is a shallow recess
    if (y > 0.88 && z < 1.2 && z > -1.7) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = cS - cP + 0.01; // negative on the sides of the glasshouse
      let reg = Math.max(Math.min(sideWin[0].sample(z, y), sideWin[1].sample(z, y), sideWin[2].sample(z, y)), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(Math.min(Math.abs(z - 0.06) - 0.05, Math.abs(z + 0.82) - 0.05), Math.abs(y - 1.248) - 0.31, side, onCab);
      acc.cut(pocket(reg, sh, 0.004, po), MAT.trim, 0.002);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      if (z < -1.5) acc.cut(pocket(Math.max(sdRoundBox(x, y - 1.27, 0, 0.56, 0.24, 1, 0.05), onCab), sh, 0.01, po), MAT.glass, 0.003);
    }
    // wipers, a hub at each pivot (after the glass, whose cuts would take them away)
    if ((z > 1.04 && z < 1.16 && y > 0.85 && y < 0.93) || (z < -1.6 && y > 0.97 && y < 1.08)) {
      for (const [a, b] of WIPERS) {
        acc.add(sdCapsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], 0.0075), MAT.trim, 0.003);
        acc.add(Math.hypot(x - a[0], y - a[1], z - a[2]) - 0.015, MAT.trim, 0.004);
      }
    }
    // round headlamps in chrome rings either side of a grille: a chrome frame, two chrome bars and a
    // blank badge plate on them
    if (z > 1.55 && y > 0.48 && y < 0.76 && ax < 0.66) {
      const r = Math.hypot(ax - 0.49, y - 0.615);
      acc.cut(pocket(r - 0.082, sh, 0.03, po), po.wall ? MAT.chrome : MAT.head, 0.004);
      acc.add(Math.hypot(r - 0.087, sh + 0.002) - 0.011, MAT.chrome, 0.003);
      const grille = sdRoundBox(x, y - 0.615, 0, 0.33, 0.05, 1, 0.02);
      acc.cut(pocket(grille, sh, 0.025, po), po.wall ? MAT.trim : MAT.grille, 0.004);
      acc.add(edge(Math.abs(grille + 0.004) - 0.005, Math.max(sh - 0.004, -(sh + 0.012))), MAT.chrome, 0.002);
      // (the bars stand on the grille's floor, and are thicker than two cells of the 5 mm build grid:
      // a gap or a bar thinner than that frays)
      for (const yb of [0.598, 0.632]) acc.add(edge(Math.max(grille, Math.abs(y - yb) - 0.006), Math.max(sh + 0.004, -(sh + 0.03))), MAT.chrome, 0.002);
      acc.add(edge(sdRoundBox(x, y - 0.615, 0, 0.045, 0.022, 1, 0.012), Math.max(sh - 0.003, -(sh + 0.012))), MAT.chrome, 0.002);
    }
    // in the bumper (measured from its face): a slatted intake and amber corner lamps
    if (z > 1.55 && y > 0.2 && y < 0.46 && ax < 0.76) {
      const bsh = sh - 0.012;
      const intake = sdRoundBox(x, y - 0.3, 0, 0.36, 0.04, 1, 0.025);
      acc.cut(pocket(intake, bsh, 0.03, po), po.wall ? MAT.plastic : MAT.grille, 0.004);
      for (const ys of [0.284, 0.316]) acc.add(edge(Math.max(intake, Math.abs(y - ys) - 0.007), Math.max(bsh + 0.004, -(bsh + 0.035))), MAT.plastic, 0.002);
      acc.cut(pocket(sdRoundBox(ax - 0.6, y - 0.4, 0, 0.08, 0.028, 1, 0.015), bsh, 0.012, po), po.wall ? MAT.trim : MAT.amber, 0.003);
    }
    // tall tail lamps up the back corners: an unlit amber indicator at the top, the red lamp, a clear
    // reverse lamp at the bottom (kept to the rounded corner: above the body the glasshouse is
    // narrower, and the lamp hooked round onto its side)
    if (z < -1.5 && y > 0.5 && y < 1.08 && ax > 0.52) {
      const lamp = edge(sdRoundBox(ax - 0.665, y - 0.78, 0, 0.065, 0.26, 1, 0.025), z + 1.585);
      acc.cut(pocket(lamp, sh, 0.02, po), po.wall ? MAT.trim : y > 0.92 ? MAT.indicator : y > 0.66 ? MAT.tail : MAT.reverse, 0.003);
    }
    // licence plate recess in the tailgate (the livery paints the plate), the handle slot under the
    // chrome garnish above it
    if (z < -1.5 && y > 0.4 && y < 0.63 && ax < 0.2) {
      acc.cut(pocket(sdRoundBox(x, y - 0.51, 0, 0.16, 0.078, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
      acc.cut(pocket(sdRoundBox(x, y - 0.616, 0, 0.075, 0.009, 1, 0.006), sh, 0.015, po), MAT.trim, 0.002);
    }
    // red reflectors in the rear bumper's corners
    if (z < -1.6 && y > 0.27 && y < 0.35 && ax > 0.48 && ax < 0.66) {
      acc.cut(pocket(sdRoundBox(ax - 0.57, y - 0.31, 0, 0.06, 0.014, 1, 0.006), sh - 0.012, 0.006, po), po.wall ? MAT.trim : MAT.tail, 0.002);
    }
    // the third brake lamp in the spoiler's trailing edge (measured from its flat back)
    if (ax < 0.2 && y > 1.58 && y < 1.62 && z < -1.62) {
      acc.cut(pocket(Math.max(ax - 0.14, Math.abs(y - 1.6) - 0.008), -(z + 1.66), 0.005, po), po.wall ? MAT.trim : MAT.tail, 0.002);
    }
    // amber side repeaters on the front fenders, and a fuel flap in the right rear quarter
    if (ax > 0.7 && z > 1.26 && z < 1.38 && y > 0.63 && y < 0.7) {
      acc.cut(pocket(sdRoundBox(z - 1.32, y - 0.665, 0, 0.024, 0.01, 1, 0.009), bP, 0.004, po), po.wall ? MAT.trim : MAT.indicator, 0.002);
    }
    if (x < -0.7 && z > -1.36 && z < -1.16 && y > 0.64 && y < 0.8) {
      acc.cut(pocket(sdRoundBox(z + 1.26, y - 0.72, 0, 0.06, 0.055, 1, 0.02), bP, 0.003, po), MAT.paint, 0.002);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.45 && y < 0.7) {
      if (Math.abs(z - WH.front.z) < 0.45) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.45) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.86 && z < 1.08 && y > 0.86 && y < 1.08 && ax > 0.62) {
      acc.cut(sdRoundBox(ax - 0.8, y - 0.99, z - 0.938, 0.035, 0.035, 0.005, 0.01), MAT.chrome, 0.003);
    }
    // black door pulls
    if (ax > 0.66 && y > 0.8 && y < 0.88 && z > -0.45 && z < 0.55) {
      for (const zc of [0.4, -0.38]) acc.add(Math.max(sdRoundBox(0, y - 0.84, z - zc, 1, 0.012, 0.05, 0.008), sh - 0.006, -(sh + 0.012)), MAT.trim, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.2) acc.m = MAT.trim; // underbody (the floor sits at 0.18)
      // a black belt moulding along the foot of the side glass, over the shoulder from just under
      // the body's top edge (which rises toward the tail)
      else if (y < 0.94 && y > 0.881 - 0.0155 * z && ax > 0.66 && z > -1.6 && z < 1.06) acc.m = MAT.trim;
    }
    out.m = acc.m;
    return acc.d;
  }

  // the far model (distant rivals): the door mouldings in body colour, their long borders with the
  // paint are the costliest thing about them
  function farMat(x, y, z, m) {
    return m === MAT.plastic && Math.abs(z) < 0.95 && y > 0.36 && y < 0.48 ? MAT.paint : m;
  }

  // ------------------------------------------------------------------ glass, lamps
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of sideWins) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  for (const sx of [1, -1]) {
    decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [0.49 * sx, 0.615], radius: 0.052, depth: 0.026, segments: 28 });
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.665 * sx, 0.7],
        [0.665 * sx, 0.89],
      ],
      width: 0.03,
      depth: 0.012,
      sharp: true,
    });
  }

  return {
    id: 'mochi',
    sdf,
    shell,
    farMat,
    decals,
    // the grille and the intake sit in pockets: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.45 },
    bounds: { min: [-1.0, 0.0, -1.95], max: [1.0, 1.85, 2.0] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y); the hood's front edge over
      // the lamps, the tailgate down to the bumper
      panels: {
        side: [
          [[1.05, 0.88], [1.05, 0.28], [0.06, 0.28], [0.06, 0.92]],
          [[0.06, 0.28], [-0.82, 0.28], [-0.82, 0.93]],
        ],
        top: [[[-0.66, 1.17], [0.66, 1.17], [0.7, 1.68], [-0.7, 1.68], [-0.66, 1.17]]],
        front: [[[-0.62, 0.735], [0.62, 0.735]]],
        rear: [[[-0.5, 0.93], [-0.51, 0.41], [0.51, 0.41], [0.5, 0.93]]],
      },
      // `plate`: the licence plate painted into the tailgate's recess (rear view, metres); `door`:
      // a door number's roundel, above the moulding
      livery: {
        door: [0.5, 0.665],
        shoulder: 0.75,
        cabin: { x: 0.6, z0: -1.6, z1: 1.1 },
        plate: { x: 0, y: 0.51, w: 0.3, h: 0.15, text: 'KEI 660' },
      },
      tailLights: [
        [0.665, 0.795, -1.67],
        [-0.665, 0.795, -1.67],
      ],
      headLights: [
        [0.49, 0.615, 1.73],
        [-0.49, 0.615, 1.73],
      ],
      exhausts: [[-0.42, 0.16, -1.71]],
    },
  };
}
