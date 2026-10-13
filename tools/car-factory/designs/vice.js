// VICE - an 80s flat-12 supercar, low and very wide at the back. A short nose under a long convex
// hood with the pop-up lamps folded flush, a black grille band between rectangular corner lamps,
// one mirror high on the driver's windshield pillar, five thin strakes running from the middle of
// the door over the side intakes into the wide rear hips, the roof running back into two flying
// buttresses that fade into a low tail either side of a smooth engine lid (a brake-lamp pod on it, a
// black vent behind it), black slats right across the tail over the lamps, and a bumper standing
// out beneath them with a wide black panel behind the plate and four pipes in a black valance under
// it. No wing. The side elevation is traced from a reference drawing (2.656 mm a pixel), the tail
// follows a photo. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildVice() {
  const WH = {
    front: { z: 1.162, y: 0.318, x: 0.765, r: 0.318, w: 0.225, rim: 0.205 },
    rear: { z: -1.388, y: 0.328, x: 0.83, r: 0.328, w: 0.265, rim: 0.205 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a short nose with a crisp edge where the long convex hood begins, the
  // cowl, a low sill along the door, the rear hips, a low tail with the bumper standing out under it
  const bodySide = new Profile2D(
    [
      [2.1, 0.16, 1],
      [2.14, 0.235],
      [2.145, 0.3],
      [2.147, 0.4],
      [2.145, 0.5],
      [2.125, 0.522],
      [2.087, 0.531, 1],
      [2.047, 0.55],
      [1.98, 0.592],
      [1.847, 0.645],
      [1.715, 0.682],
      [1.582, 0.711],
      [1.45, 0.737],
      [1.316, 0.76],
      [1.157, 0.784],
      [0.97, 0.818],
      [0.864, 0.84],
      [0.8, 0.81],
      [0.65, 0.778],
      [0.3, 0.783],
      [-0.1, 0.79],
      [-0.38, 0.8],
      [-0.6, 0.82],
      [-0.85, 0.838],
      [-1.3, 0.842],
      [-1.8, 0.84],
      [-2.0, 0.833],
      [-2.075, 0.822, 1],
      [-2.08, 0.62],
      [-2.085, 0.56, 1],
      [-2.13, 0.545],
      [-2.145, 0.5],
      [-2.146, 0.42],
      [-2.135, 0.36],
      [-2.105, 0.3],
      [-2.04, 0.265],
      [-1.95, 0.25, 1],
      [-1.75, 0.22],
      [-1.5, 0.16],
      [-1.0, 0.15, 1],
      [1.0, 0.15, 1],
      [1.5, 0.16],
      [1.8, 0.16],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a narrow nose and doors, then the body swells out behind the doors into
  // hips almost two metres across
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.152],
      [0.55, 2.14],
      [0.8, 2.09],
      [0.9, 1.95],
      [0.925, 1.7],
      [0.93, 1.15],
      [0.925, 0.75],
      [0.915, 0.35],
      [0.93, -0.05],
      [0.97, -0.5],
      [0.99, -0.9],
      [0.995, -1.4],
      [0.99, -1.8],
      [0.97, -2.02],
      [0.9, -2.12],
      [0.6, -2.15],
      [0, -2.155],
    ]),
    { band: 0.2 },
  );
  // the glasshouse (z, y): a long raked windshield, the roof, then the buttresses falling away to
  // the tail
  const cabSide = new Profile2D(
    [
      [0.92, 0.7, 1],
      [0.9, 0.8],
      [0.864, 0.845],
      [0.75, 0.885],
      [0.52, 0.962],
      [0.25, 1.058],
      [0.121, 1.103],
      [0.0, 1.13],
      [-0.278, 1.143],
      [-0.543, 1.131],
      [-0.809, 1.108],
      [-0.942, 1.062],
      [-1.074, 1.028],
      [-1.207, 0.998],
      [-1.34, 0.964],
      [-1.473, 0.932],
      [-1.606, 0.898],
      [-1.738, 0.865],
      [-1.871, 0.838],
      [-2.0, 0.828],
      [-2.07, 0.82, 1],
      [-2.07, 0.7, 1],
    ],
    { band: 0.2 },
  );
  // (the buttresses spread out over the hips)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 0.9],
      [0.6, 0.89],
      [0.72, 0.8],
      [0.76, 0.45],
      [0.77, -0.05],
      [0.8, -0.5],
      [0.86, -0.95],
      [0.9, -1.45],
      [0.92, -1.85],
      [0.9, -2.06],
      [0, -2.1],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // the door glass, under the roof and down the windshield pillar to the sill
  const DOOR_WIN = [
    [0.62, 0.795, 1],
    [0.12, 1.048, 1],
    [-0.1, 1.072],
    [-0.42, 1.075, 1],
    [-0.37, 0.81, 1],
  ];
  // a quarter window in the side of each buttress, behind the slanted centre pillar
  const QUARTER_WIN = [
    [-0.5, 1.078, 1],
    [-0.795, 1.075, 1],
    [-0.795, 0.845, 1],
    [-0.43, 0.815, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 0.84],
    [0.56, 0.83],
    [0.66, 0.73],
    [0.66, 0.4],
    [0.61, 0.15],
    [0, 0.13],
  ]);
  // the upright glass at the head of the engine deck, between the buttresses (rear view, x y; it
  // must clear the tail's top edge, or the pane is laid half onto the tail and stretches over the
  // whole deck; sharp corners, or the outline's curve bulges out sideways past the window and the
  // pane is laid back along the buttresses' inner faces)
  const BACKLIGHT = [
    [-0.46, 0.88, 1],
    [0.46, 0.88, 1],
    [0.44, 1.07, 1],
    [-0.44, 1.07, 1],
  ];
  const doorWin = new Profile2D(DOOR_WIN, small);
  const quarterWin = new Profile2D(QUARTER_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);

  // cross-section: upright flanks with a soft shoulder and tumblehome above it
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.28) return 0.95 + 0.05 * smoothstep(0.14, 0.28, y);
    return 1.0 - ramp(y - 0.76, 0.008) * 0.4;
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.035);
    const tilt = Math.max(0, y - 0.85) * 0.55;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    // the engine deck sits down between the buttresses, behind an upright rear window, and runs out
    // to the tail between their tips
    const deck = Math.max(ax - 0.52, z + 0.8);
    const dCab = smax(smax(cS, cP, 0.04), -deck, 0.02);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    return smin(dBody, dCab, 0.025);
  }

  const acc = new Acc();
  const po = { wall: false };
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);
  // the strakes: a recess from the intake behind the door along the door, crossed by five thin fins
  // that converge toward their front ends; the recess narrows onto the outer fins and fades out
  // with them (sk: 0 at the back of the intake, 1 at the fins' front ends)
  const SK0 = -0.708; // back of the intake
  const SKD = -0.384; // back edge of the door: the intake is open behind it
  const SKF = 0.527; // front ends of the fins
  const recessTop = (sk) => 0.635 - 0.12 * sk;
  const recessBot = (sk) => 0.292 + 0.004 * sk;
  // fin heights at the back of the intake and at their front ends
  const FIN0 = [0.579, 0.52, 0.459, 0.399, 0.342];
  const FIN1 = [0.503, 0.45, 0.404, 0.357, 0.308];
  // the tail grille's slats, evenly spaced across its 0.585-0.795 opening (1.4 cm slats, 2.3 cm
  // gaps), and the gaps of the lamps' lower row, below the middle slat, where the brake lamps glow
  const SLATS = [0.615, 0.653, 0.69, 0.727, 0.765];
  const GLOW_ROW = [0.597, 0.634, 0.671];

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { dBody, dCab, cS, cP, bP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // one mirror, high on the driver's windshield pillar, in body colour
    if (x > 0.5 && x < 0.95 && y > 1.0 && y < 1.14 && z > 0.04 && z < 0.26) {
      acc.add(sdCapsule(x, y, z, 0.56, 1.07, 0.17, 0.76, 1.08, 0.15, 0.012), MAT.paint, 0.01);
      acc.add(sdRoundBox(x - 0.82, y - 1.083, z - 0.14, 0.068, 0.034, 0.03, 0.02), MAT.paint, 0.008);
    }
    // a low pod across the back of the engine lid, carrying a third brake lamp (no higher than the
    // buttresses beside it, or it stands out of the traced side view)
    if (ax < 0.3 && y > 0.75 && y < 0.95 && z < -1.4 && z > -1.72) {
      acc.add(sdRoundBox(x, y - 0.835, z + 1.56, 0.25, 0.046, 0.12, 0.012), MAT.paint, 0.01);
    }

    // ---------------------------------------------------------------- cuts
    // cockpit: hollow the glasshouse and the tub below it, furnished (a bulkhead behind the seats,
    // and the front wheel wells stay closed off from the footwells)
    if (y > 0.2 && z < 0.95 && z > -0.9 && ax < 0.92) {
      const tub = Math.max(dBody + 0.035, ax - 0.8);
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.26 - y, z - 0.88, -0.72 - z, 0.03 - arch(ax, y, z, WH.front));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.36, seatZ: -0.34, floorY: 0.26, dashZ: 0.56, dashY: 0.66, dashW: 0.66, wheelZ: 0.3, wheelY: 0.67, recline: 0.46 });
    }
    // window openings (glass panes sit in them)
    if (y > 0.7 && z < 0.95 && z > -0.92) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      let reg = Math.max(Math.min(doorWin.sample(z, y), quarterWin.sample(z, y)), cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab + 0.01);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      if (z < -0.7 && z > -0.9) {
        reg = Math.max(sdRoundBox(x, y - 0.975, 0, 0.46, 0.095, 1, 0.02), z + 0.7);
        acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      }
    }
    // the engine lid: the pod's brake lamp (measured from its flat back), and a black vent across
    // the deck behind the lid
    if (y > 0.78 && z < -1.6 && z > -2.0 && ax < 0.55) {
      acc.cut(pocket(Math.max(ax - 0.12, Math.abs(y - 0.861) - 0.006), -(z + 1.68), 0.006, po), po.wall ? MAT.trim : MAT.tail, 0.002);
      acc.cut(pocket(Math.max(ax - 0.5, Math.abs(z + 1.915) - 0.04), sh, 0.025, po), MAT.grille, 0.003);
    }
    // a vent across the hood in front of the windshield
    if (z > 0.85 && z < 1.05 && y > 0.7 && ax < 0.4) {
      acc.cut(pocket(Math.max(ax - 0.33, Math.abs(z - 0.955) - 0.022), sh, 0.02, po), MAT.grille, 0.003);
    }
    // the strakes: behind the door the recess opens into the intake, along the door it is a
    // shallow body-coloured channel; five thin fins stand across it at the skin
    if (ax > 0.7 && z < SKF + 0.05 && z > SK0 - 0.05 && y > 0.22 && y < 0.68) {
      const sk = Math.min(1, Math.max(0, (z - SK0) / (SKF - SK0)));
      const area = Math.max(y - recessTop(sk), recessBot(sk) - y, z - SKF, SK0 - z);
      // (rounded back corners on the intake)
      const intake = Math.max(sdRoundBox(z - (SK0 + SKD) / 2, y - 0.46, 0, (SKD - SK0) / 2 + 0.02, 0.175, 1, 0.05), z - SKD);
      acc.cut(pocket(Math.max(area, intake), bP, 0.075, po), po.wall ? MAT.paint : MAT.grille, 0.006);
      const fade = 1 - smoothstep(0.1, SKF, z);
      acc.cut(pocket(Math.max(area, SKD - z), bP, 0.003 + 0.012 * fade, po), MAT.paint, 0.004);
      for (let i = 0; i < 5; i++) {
        const ys = FIN0[i] + (FIN1[i] - FIN0[i]) * sk;
        const fin = Math.max(Math.abs(y - ys) - 0.0085, z - SKF, SK0 - z);
        acc.add(Math.max(fin, bP + 0.002, -(bP + 0.074)), MAT.paint, 0.002);
      }
    }
    // a fine crease along the flanks of the nose, level with its top edge
    if (ax > 0.82 && z > 1.47 && z < 2.1 && y > 0.5 && y < 0.57) {
      acc.cut(pocket(Math.max(Math.abs(y - 0.534) - 0.004, 1.5 - z), bP, 0.004, po), MAT.paint, 0.002);
    }
    // the nose: a black grille band between rectangular corner lamps (amber above, clear below)
    if (z > 2.0 && y > 0.28 && y < 0.5) {
      const grille = Math.max(ax - 0.6, Math.abs(y - 0.3875) - 0.0525);
      acc.cut(pocket(grille, sh, 0.035, po), po.wall ? MAT.trim : MAT.grille, 0.004);
      for (const yb of [0.37, 0.405]) acc.add(Math.max(grille, Math.abs(y - yb) - 0.006, sh + 0.004, -(sh + 0.033)), MAT.trim, 0.002);
      const lamp = Math.max(Math.abs(ax - 0.755) - 0.135, Math.abs(y - 0.3825) - 0.0625);
      acc.cut(pocket(lamp, sh, 0.014, po), po.wall ? MAT.trim : y > 0.4 ? MAT.amber : MAT.lens, 0.003);
    }
    // amber side markers on the front and rear corners
    if (ax > 0.85 && y > 0.44 && y < 0.58 && (z > 1.55 || z < -1.8)) {
      const front = Math.max(Math.abs(z - 1.643) - 0.05, Math.abs(y - 0.481) - 0.016);
      const back = Math.max(Math.abs(z + 1.92) - 0.057, Math.abs(y - 0.531) - 0.021);
      acc.cut(pocket(Math.min(front, back), bP, 0.008, po), po.wall ? MAT.trim : MAT.amber, 0.002);
    }
    // the tail: black slats right across it over the lamps behind its ends, each lamp a red row
    // below (the brake lamps glow through it) under a clear reversing lamp and an unlit amber
    // indicator
    if (z < -1.95 && y > 0.56 && y < 0.82) {
      const panel = Math.max(ax - 0.9, Math.abs(y - 0.69) - 0.105);
      // (measured from the flat tail panel: from the skin, the deck just above its top edge got cut
      // up too, and the far model spent 20k triangles on it)
      const face = -(z + 2.078);
      const lamp = ax < 0.52 ? MAT.grille : y < 0.69 ? MAT.tail : ax < 0.64 ? MAT.reverse : MAT.indicator;
      acc.cut(pocket(panel, face, 0.04, po), po.wall ? MAT.trim : lamp, 0.004);
      // the slats stand on the floor, the pocket's top and bottom edges framing them (gaps thinner
      // than the 5 mm build grid, between slat and edge or slat and floor, fray into thousands of
      // triangles in the far model)
      for (const ys of SLATS) acc.add(Math.max(panel, Math.abs(y - ys) - 0.007, face + 0.003, -(face + 0.05)), MAT.trim, 0.002);
    }
    // under the bumper a black valance crossed by two slats, two pipes standing out of it on each
    // side
    if (z < -1.9 && y > 0.22 && y < 0.37 && ax < 0.66) {
      const val = sdRoundBox(x, y - 0.3, 0, 0.62, 0.045, 1, 0.012);
      acc.cut(pocket(val, sh, 0.03, po), MAT.trim, 0.003);
      for (const ys of [0.284, 0.316]) acc.add(Math.max(val, Math.abs(y - ys) - 0.006, sh + 0.004, -(sh + 0.04)), MAT.trim, 0.002);
      for (const xc of [0.435, 0.525]) acc.add(sdCylZ(ax - xc, y - 0.31, z + 2.085, 0.036, 0.07), MAT.chrome, 0.004);
    }
    // the bumper: a wide black panel across its middle, the plate standing in front of it and of
    // the valance's top edge
    if (z < -1.95 && y > 0.3 && y < 0.54 && ax < 0.54) {
      const plate = sdRoundBox(x, y - 0.41, 0, 0.158, 0.0775, 1, 0.01);
      acc.cut(pocket(Math.min(sdRoundBox(x, y - 0.4575, 0, 0.5, 0.0575, 1, 0.015), plate), sh, 0.022, po), MAT.trim, 0.003);
      acc.add(Math.max(plate, sh + 0.012, -(sh + 0.032)), MAT.paint, 0.002);
    }
    // the pipes are open
    if (z < -2.12 && y < 0.36 && ax > 0.38 && ax < 0.58) {
      for (const xc of [0.435, 0.525]) acc.cut(Math.max(Math.hypot(ax - xc, y - 0.31) - 0.026, z + 2.135), MAT.exhaust, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 0.8) {
      if (Math.abs(z - WH.front.z) < 0.5) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.52) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (x > 0.74 && x < 0.91 && y > 1.05 && y < 1.12 && z > 0.08 && z < 0.13) {
      acc.cut(sdRoundBox(x - 0.82, y - 1.083, z - 0.108, 0.056, 0.024, 0.008, 0.008), MAT.chrome, 0.002);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.244) acc.m = MAT.trim; // a black band all the way round: spoiler, sills, valance
      else if (z > 1.45 && y < 0.24 + 0.06 * smoothstep(2.1, 1.55, z)) acc.m = MAT.trim; // the front spoiler rises toward the wheel
      else if (z < -1.9 && y < 0.3 && ax < 0.62) acc.m = MAT.trim; // (no white sliver under the rear valance)
    }
    out.m = acc.m;
    return acc.d;
  }

  // the far model (distant rivals): every material border keeps its full-resolution edge through
  // simplification, and the tail grille's slats and lamps alone cost 10k triangles. Far away the
  // tail grille is black in the middle and solid red over the lamps, the hood vent a painted groove
  function farMat(x, y, z, m) {
    const ax = Math.abs(x);
    if (m === MAT.grille && y > 0.7 && z > 0.85 && z < 1.05 && ax < 0.4) return MAT.paint;
    if (z < -1.95 && y > 0.57 && y < 0.82 && ax < 0.95) {
      if (ax < 0.52) return m === MAT.grille ? MAT.trim : m;
      if (m === MAT.trim || m === MAT.reverse || m === MAT.indicator) return MAT.tail;
    }
    return m;
  }

  // ------------------------------------------------------------------ glass, light strips
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of [DOOR_WIN, QUARTER_WIN]) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.rear, outline: BACKLIGHT, depth: 0.006 });
  for (const sx of [1, -1]) {
    // bright bars in the lamps' red row, glowing between the slats (straight on the flat tail panel,
    // so a coarse step will do)
    for (const ys of GLOW_ROW) {
      decals.push({
        kind: 'ribbon',
        mat: MAT.tailglow,
        view: VIEW.rear,
        path: [
          [0.53 * sx, ys],
          [0.89 * sx, ys],
        ],
        width: 0.012,
        depth: 0.034,
        step: 0.02,
      });
    }
  }

  return {
    id: 'vice',
    sdf,
    shell,
    farMat,
    decals,
    // the intakes and grilles are deep: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.5 },
    bounds: { min: [-1.25, 0.0, -2.4], max: [1.25, 1.3, 2.4] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y); the pop-up lamps fold
      // flush into the front corners of the fenders; the engine lid between the buttresses
      panels: {
        side: [
          [[0.73, 0.775], [0.74, 0.5], [0.73, 0.245]],
          [[-0.384, 0.805], [-0.384, 0.245]],
        ],
        top: [
          [[-0.62, 0.92], [0.62, 0.92], [0.72, 1.35], [0.5, 1.55], [0.5, 2.06], [-0.5, 2.06], [-0.5, 1.55], [-0.72, 1.35], [-0.62, 0.92]],
          [[0.5, 1.57], [0.88, 1.57]],
          [[0.5, 1.93], [0.86, 1.93]],
          [[-0.5, 1.57], [-0.88, 1.57]],
          [[-0.5, 1.93], [-0.86, 1.93]],
          [[-0.47, -0.86], [0.47, -0.86], [0.47, -1.86], [-0.47, -1.86], [-0.47, -0.86]],
        ],
      },
      // `plate`: the licence plate painted onto the plate standing in the bumper (rear view, metres)
      livery: {
        door: [0.45, 0.66],
        shoulder: 0.76,
        cabin: { x: 0.62, z0: -0.8, z1: 0.86 },
        plate: { x: 0, y: 0.41, w: 0.31, h: 0.155, text: 'VICE 86' },
      },
      tailLights: [
        [0.71, 0.634, -2.09],
        [-0.71, 0.634, -2.09],
      ],
      headLights: [
        [0.76, 0.36, 2.15],
        [-0.76, 0.36, 2.15],
      ],
      exhausts: [
        [0.435, 0.31, -2.16],
        [0.525, 0.31, -2.16],
        [-0.435, 0.31, -2.16],
        [-0.525, 0.31, -2.16],
      ],
    },
  };
}
