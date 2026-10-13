// TOUGE - an 80s lightweight hatchback that lives on mountain passes. A long flat hood with the
// pop-up headlights raised on its front corners, a wedge nose over a slim grille slot with amber
// lamps, wipers, an antenna mast on the right front fender, a tall glasshouse with black window
// frames ending in a liftback with a lip spoiler and a wiper, black door handles, black arch trims
// round small wheels on tall tyres, a fuel flap, a full-width tail-light band (red lamps with amber
// and clear sections inboard, a ribbed black panel between them), the plate in the rear bumper,
// and a rub strip down the flanks at the two-tone line. Right-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdBox, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildTouge() {
  const WH = {
    // 14-inch rims on tall sidewalls, as cars wore them then
    front: { z: 1.2, y: 0.3, x: 0.7, r: 0.3, w: 0.2, rim: 0.18 },
    rear: { z: -1.2, y: 0.3, x: 0.7, r: 0.3, w: 0.2, rim: 0.18 },
  };
  const GAP = 0.035; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a squared-off 80s bumper, grille slot, the long hood, beltline, tail
  const bodySide = new Profile2D(
    [
      [1.95, 0.16, 1],
      [2.09, 0.17, 1],
      [2.125, 0.2],
      [2.135, 0.3],
      [2.135, 0.46],
      [2.125, 0.5, 1],
      [2.088, 0.512, 1],
      [2.085, 0.6],
      [2.07, 0.632, 1],
      [1.85, 0.662],
      [1.5, 0.695],
      [1.1, 0.735],
      [0.8, 0.765],
      [0.3, 0.795],
      [-0.3, 0.82],
      [-0.9, 0.845],
      [-1.5, 0.875],
      [-1.85, 0.898],
      [-1.98, 0.905, 1],
      [-2.035, 0.86],
      [-2.05, 0.7],
      [-2.045, 0.6, 1],
      [-2.088, 0.585, 1],
      [-2.1, 0.55],
      [-2.1, 0.24],
      [-2.088, 0.19, 1],
      [-1.98, 0.17, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a slab-sided box with tight corners
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.135],
      [0.5, 2.13],
      [0.72, 2.115],
      [0.79, 2.08],
      [0.81, 2.0],
      [0.813, 1.7],
      [0.815, 1.2],
      [0.815, 0.4],
      [0.815, -0.6],
      [0.815, -1.3],
      [0.812, -1.85],
      [0.805, -2.0],
      [0.77, -2.075],
      [0.55, -2.1],
      [0, -2.105],
    ]),
    { band: 0.2 },
  );
  // glasshouse: raked windshield, flat roof, liftback
  const cabSide = new Profile2D(
    [
      [0.86, 0.72, 1],
      [0.82, 0.8],
      [0.5, 1.02],
      [0.2, 1.22],
      [0.05, 1.29],
      [-0.25, 1.315],
      [-0.7, 1.31],
      [-0.9, 1.28],
      [-1.25, 1.15],
      [-1.65, 0.995],
      [-1.93, 0.9, 1],
      [-1.93, 0.7, 1],
      [0.86, 0.6, 1],
    ],
    { band: 0.2 },
  );
  // (straight sides right up to the windshield base, so the windshield pillars rise from the
  // corners instead of twisting down onto the beltline)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 0.88],
      [0.53, 0.875],
      [0.67, 0.83],
      [0.72, 0.74],
      [0.725, 0.5],
      [0.735, -0.2],
      [0.73, -0.9],
      [0.7, -1.4],
      [0.64, -1.8],
      [0.45, -1.97],
      [0, -1.99],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // door glass and the rear quarter window, inset from the pillars
  const DOOR_WIN = [
    [0.6, 0.878, 1],
    [0.04, 1.24, 1],
    [-0.36, 1.25, 1],
    [-0.36, 0.878, 1],
  ];
  const QUARTER_WIN = [
    [-0.45, 1.25, 1],
    [-0.85, 1.236],
    [-1.05, 1.165],
    [-1.24, 1.06, 1],
    [-1.28, 0.89, 1],
    [-0.45, 0.882, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 0.79],
    [0.53, 0.78],
    [0.62, 0.7],
    [0.575, 0.32],
    [0.53, 0.1],
    [0, 0.075],
  ]);
  const doorWin = new Profile2D(DOOR_WIN, small);
  const quarterWin = new Profile2D(QUARTER_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -0.93],
      [0.5, -0.94],
      [0.53, -1.4],
      [0.47, -1.8],
      [0, -1.84],
    ]),
    small,
  );

  // cross-section: slab sides that tuck in at the sills, a crisp crease at the beltline and a
  // touch of tumblehome above it
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.3) return 0.955 + 0.045 * smoothstep(0.14, 0.3, y);
    return 1.0 - ramp(y - 0.74, 0.003) * 0.22;
  };

  // the pop-up headlights, raised: each body-coloured lid has swung up on its hinge at the back, so
  // from the side a light is a wedge (about 30 degrees) - standing on the very front corner, its
  // outer side carrying on the fender and its lamp facing forward, flush with the nose, in a black
  // bezel
  const POD = { x: 0.65, hw: 0.15, zf: 2.075, top: 0.8, zh: 1.835, yh: 0.658 };
  const lidSlope = (POD.top - POD.yh) / (POD.zf - POD.zh);
  const lidK = 1 / Math.hypot(1, lidSlope);
  const lidY = (z) => POD.yh + (z - POD.zh) * lidSlope;
  const hoodY = (z) => 0.668 - (z - 1.79) * 0.126; // the hood line under the lights
  // (its foot reaches down into the hood, which hides it; the body's own corner rounds it off)
  const pod = (ax, y, z) =>
    Math.max(
      smax(smax(Math.abs(ax - POD.x) - POD.hw, (y - lidY(z)) * lidK, 0.01), smax(z - POD.zf, 0.6 - y, 0.01), 0.01),
      bodyPlan.sample(ax, z),
    );

  // un-cut outer skin, lamp pods included (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    // (tight edge radii: 80s cars were crisp boxes, not soap bars)
    const dBody = smax(bS, bP, 0.022);
    const tilt = Math.max(0, y - 0.85) * 0.35;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.03);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    const d = smin(dBody, dCab, 0.025);
    if (z < 1.6 || z > 2.1 || y < 0.58 || y > 0.85 || ax < 0.45 || ax > 0.85) return d;
    return smin(d, pod(ax, y, z), 0.008);
  }

  const acc = new Acc();
  const po = { wall: false };
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);
  // exact distance outside the corner where two fields meet (a plain max reads too close there, and
  // the AO bake paints a dark box round the part)
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  // wipers: points on the windshield (x across, at height y) and on the liftback glass (x across,
  // at z), `off` out from the glass; two parked at the foot of the windshield toward the left (a
  // right-hand-drive car), one along the foot of the liftback glass
  const onWindshield = (x, y, off) => [x, y + 0.824 * off, 0.82 - 1.4545 * (y - 0.8) + 0.567 * off];
  const onHatch = (x, z, off) => [x, 0.995 + (z + 1.65) * 0.339 + 0.947 * off, z - 0.32 * off];
  const WIPERS = [
    [onWindshield(-0.36, 0.836, 0.012), onWindshield(0.08, 0.851, 0.012)],
    [onWindshield(0.1, 0.836, 0.012), onWindshield(0.47, 0.851, 0.012)],
    [onHatch(0.0, -1.86, 0.012), onHatch(0.42, -1.795, 0.012)],
  ];
  // the tail band's sections: red lamps outboard, amber and clear sections inboard of them, a black
  // ribbed panel in the middle
  const LAMP_IN = 0.31;
  const LAMP_SPLIT = 0.48;

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { bP, dBody, dCab, cS, cP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // rub strip along the flanks at the two-tone line
    if (y > 0.43 && y < 0.52 && Math.abs(z) < 1.75 && ax > 0.7) {
      acc.add(Math.max(Math.abs(y - 0.475) - 0.017, Math.abs(z) - 1.68, bP - 0.009, -(bP + 0.03)), MAT.trim, 0.004);
    }
    // lip spoiler on the end of the liftback
    if (z < -1.8 && z > -2.1 && y > 0.86 && y < 1.0 && ax < 0.8) {
      acc.add(sdRoundBox(x, y - 0.918, z + 1.965, 0.69, 0.016, 0.07, 0.012), MAT.paint, 0.02);
    }
    // black door mirrors at the front corner of the door glass, their stalks rooted in the pillar foot
    if (z > 0.5 && z < 0.8 && y > 0.8 && y < 1.0 && ax > 0.66) {
      acc.add(sdRoundBox(ax - 0.9, y - 0.915, z - 0.63, 0.07, 0.048, 0.04, 0.03), MAT.trim, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.7, 0.88, 0.66, 0.87, 0.905, 0.64, 0.016), MAT.trim, 0.01);
    }
    // single exhaust under the rear bumper, on the right
    if (z < -1.85 && y < 0.32 && x < -0.3 && x > -0.6) {
      acc.add(sdCylZ(x + 0.45, y - 0.2, z + 2.05, 0.042, 0.08), MAT.chrome, 0.004);
      acc.cut(sdCylZ(x + 0.45, y - 0.2, z + 2.05, 0.032, 0.2), MAT.exhaust);
    }
    // an antenna mast on the right front fender, beside the windshield, raked back a little
    if (x < -0.72 && x > -0.83 && y > 0.7 && y < 1.4 && z > 0.86 && z < 1.03) {
      acc.add(sdCapsule(x, y, z, -0.775, 0.74, 0.98, -0.775, 1.36, 0.9, 0.0055), MAT.chrome, 0.003);
      acc.add(sdCapsule(x, y, z, -0.775, 0.735, 0.98, -0.775, 0.765, 0.977, 0.012), MAT.chrome, 0.004);
    }
    // black pull handles at the top rear of the doors
    if (ax > 0.74 && y > 0.77 && y < 0.83 && z > -0.38 && z < -0.22) {
      acc.add(edge(sdRoundBox(0, y - 0.8, z + 0.3, 1, 0.012, 0.055, 0.008), Math.max(sh - 0.006, -(sh + 0.012))), MAT.trim, 0.003);
    }

    // ---------------------------------------------------------------- cuts
    // cockpit: hollow the glasshouse and the tub below it, then furnish it (right-hand drive)
    if (y > 0.2 && z < 0.86 && z > -1.35 && ax < 0.8) {
      const tub = Math.max(dBody + 0.03, ax - 0.74);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.25 - y, z - 0.8, -1.3 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, -x, y, z, { seatX: 0.36, seatZ: -0.22, floorY: 0.25, dashZ: 0.56, dashY: 0.73, dashW: 0.68, wheelZ: 0.32, wheelY: 0.76, recline: 0.3 });
    }
    // window openings through the cabin walls (glass panes sit in them); the liftback glass is a
    // shallow recess
    if (y > 0.7 && z < 0.9 && z > -1.95) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      let reg = Math.max(Math.min(doorWin.sample(z, y), quarterWin.sample(z, y)), cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.04, po), MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.04, po), MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // wipers, a hub at each pivot (after the glass, whose cuts would take them away)
    if ((z > 0.74 && z < 0.86 && y > 0.82 && y < 0.88 && ax < 0.52) || (z < -1.76 && z > -1.9 && y > 0.9 && y < 0.98 && ax < 0.46)) {
      for (const [a, b] of WIPERS) {
        acc.add(sdCapsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], 0.0075), MAT.trim, 0.003);
        acc.add(Math.hypot(x - a[0], y - a[1], z - a[2]) - 0.015, MAT.trim, 0.004);
      }
    }
    // lamp faces on the front of the pods
    if (z > POD.zf - 0.05 && y > 0.62 && y < 0.82 && ax > 0.48 && ax < 0.82) {
      const reg = Math.max(Math.abs(ax - POD.x) - 0.12, Math.abs(y - 0.715) - 0.058);
      acc.cut(Math.max(reg, z - (POD.zf + 0.01), POD.zf - 0.022 - z), MAT.head, 0.004);
    }
    // grille slot between the bumper and the hood (parking lamps at its ends), and an intake in
    // the bumper
    if (z > 1.95 && y > 0.2 && y < 0.64) {
      const slot = Math.max(ax - 0.75, Math.abs(y - 0.565) - 0.026);
      const intake = Math.max(ax - 0.42, Math.abs(y - 0.3) - 0.035);
      const d = pocket(Math.min(slot, intake), sh, 0.05, po);
      acc.cut(d, po.wall ? MAT.trim : ax > 0.645 && y > 0.45 ? MAT.head : MAT.grille, 0.004);
    }
    // amber turn-signal lamps in the bumper corners, wrapping round onto the sides
    if (z > 1.85 && y > 0.33 && y < 0.46 && ax > 0.52) {
      const reg = Math.max(0.6 - ax, Math.abs(y - 0.395) - 0.03, 1.9 - z);
      acc.cut(pocket(reg, sh, 0.015, po), po.wall ? MAT.trim : MAT.amber, 0.003);
    }
    // tail-light band: red lamps outboard, an unlit amber indicator over a clear reverse lamp inboard
    // of each, and a black panel between them ribbed across (the ribs stand on its floor)
    if (z < -1.9 && y > 0.6 && y < 0.88) {
      const band = Math.max(ax - 0.765, Math.abs(y - 0.745) - 0.062);
      const d = pocket(band, sh, 0.024, po);
      const lamp = ax < LAMP_IN ? MAT.trim : ax > LAMP_SPLIT ? MAT.tail : y > 0.745 ? MAT.indicator : MAT.reverse;
      acc.cut(d, po.wall ? MAT.trim : lamp, 0.003);
      for (const yr of [0.715, 0.745, 0.775]) {
        acc.add(edge(Math.max(ax - (LAMP_IN - 0.005), Math.abs(y - yr) - 0.005), Math.max(sh + 0.004, -(sh + 0.03))), MAT.trim, 0.002);
      }
    }
    // licence plate recess in the middle of the rear bumper (the livery paints the plate, over the
    // two-tone's black), and a fuel flap in the left rear quarter
    if (z < -2.0 && y > 0.32 && y < 0.53 && ax < 0.2) {
      acc.cut(pocket(sdRoundBox(x, y - 0.425, 0, 0.158, 0.078, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    if (x > 0.7 && z > -1.7 && z < -1.54 && y > 0.58 && y < 0.72) {
      acc.cut(pocket(sdRoundBox(z + 1.62, y - 0.65, 0, 0.055, 0.05, 1, 0.02), bP, 0.003, po), MAT.paint, 0.002);
    }
    // black trims round the wheel arches, standing a little proud of the fenders
    if (ax > 0.6 && y > 0.25 && y < 0.72) {
      for (const w of [WH.front, WH.rear]) {
        if (Math.abs(z - w.z) > 0.48) continue;
        const ring = Math.abs(Math.hypot(y - w.y, z - w.z) - (w.r + GAP + 0.022)) - 0.022;
        acc.add(Math.max(ring, bP - 0.01, -(bP + 0.03), w.y - 0.02 - y), MAT.trim, 0.004);
      }
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.5 && y < 0.75) {
      if (Math.abs(z - WH.front.z) < 0.5) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.5) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.5 && z < 0.8 && y > 0.8 && y < 1.0 && ax > 0.72) {
      acc.cut(sdRoundBox(ax - 0.9, y - 0.915, z - 0.588, 0.058, 0.037, 0.012, 0.01), MAT.chrome, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.168) acc.m = MAT.trim; // underbody
      else if (z < -2.0 && y < 0.3 && ax < 0.7) acc.m = MAT.trim; // valance under the rear bumper
      // a black bezel round each lamp (black sides would vanish against a night sky, leaving the
      // lids floating)
      else if (z > POD.zf - 0.012 && z < POD.zf + 0.006 && Math.abs(ax - POD.x) < POD.hw + 0.006 && y > hoodY(z) + 0.008 && y < lidY(z) - 0.008) acc.m = MAT.trim;
      // black window frames and centre pillar, so the side glass reads as one dark band
      else if (ax > 0.5 && y > 0.85 && y < 1.3 && z > -1.32 && z < 0.66 && cS - cP < -0.005 && Math.min(doorWin.sample(z, y), quarterWin.sample(z, y), Math.max(Math.abs(z + 0.405) - 0.07, Math.abs(y - 1.065) - 0.21)) < 0.016) acc.m = MAT.trim;
    }
    out.m = acc.m;
    return acc.d;
  }

  // the far model (distant rivals): every material border keeps its full-resolution edge through
  // simplification, and this one ran to 19k triangles. Far away the rub strips are body colour (the
  // two-tone line still shows), the grille slot and the intake are plain black, the tail lamps' inner
  // sections join the red, and the underbody joins the paint along the bottom edges
  function farMat(x, y, z, m) {
    const ax = Math.abs(x);
    if (m === MAT.trim && y > 0.44 && y < 0.51 && Math.abs(z) < 1.75 && ax > 0.7) return MAT.paint;
    if (z > 1.95 && (m === MAT.grille || m === MAT.head) && ((y > 0.52 && y < 0.6 && ax < 0.77) || (y > 0.25 && y < 0.35 && ax < 0.44))) return MAT.trim;
    if (z < -1.9 && y > 0.68 && y < 0.81 && (m === MAT.indicator || m === MAT.reverse)) return MAT.tail;
    if (m === MAT.trim && y < 0.168) return MAT.paint;
    return m;
  }

  // ------------------------------------------------------------------ glass, lamps, light strips
  const decals = [
    { kind: 'panel', mat: MAT.window, view: VIEW.left, outline: DOOR_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.right, outline: DOOR_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.left, outline: QUARTER_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.right, outline: QUARTER_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 },
  ];
  for (const sx of [1, -1]) {
    // the pop-up lamp lens
    decals.push({
      kind: 'panel',
      mat: MAT.lens,
      view: VIEW.front,
      outline: [
        [0.54, 0.665, 1],
        [0.76, 0.665, 1],
        [0.76, 0.765, 1],
        [0.54, 0.765, 1],
      ].map(([u, v, s]) => [u * sx, v, s]),
      depth: 0.016,
      rings: 3,
      step: 0.01,
    });
    // amber lamps at the ends of the grille slot, under the headlights
    decals.push({
      kind: 'ribbon',
      mat: MAT.amber,
      view: VIEW.front,
      path: [
        [0.665 * sx, 0.565],
        [0.73 * sx, 0.565],
      ],
      width: 0.026,
      depth: 0.012,
    });
    // tail lamps: two bright bars in each lamp
    for (const v of [0.775, 0.715]) {
      decals.push({
        kind: 'ribbon',
        mat: MAT.tailglow,
        view: VIEW.rear,
        path: [
          [(LAMP_SPLIT + 0.02) * sx, v],
          [0.73 * sx, v],
        ],
        width: 0.014,
        depth: 0.01,
      });
    }
  }

  return {
    id: 'touge',
    sdf,
    shell,
    farMat,
    decals,
    bounds: { min: [-1.1, 0.0, -2.3], max: [1.1, 1.45, 2.3] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [
          [[0.64, 0.875], [0.655, 0.5], [0.63, 0.205], [-0.42, 0.205], [-0.44, 0.5], [-0.42, 0.875]],
          [[1.62, 0.505], [2.12, 0.505]],
          [[-1.62, 0.56], [-2.08, 0.56]],
        ],
        top: [
          // the hood, notched round the headlights on the front corners
          [[-0.74, 0.82], [0.74, 0.82], [0.76, 1.6], [0.76, 1.82], [0.47, 1.82], [0.47, 2.03], [-0.47, 2.03], [-0.47, 1.82], [-0.76, 1.82], [-0.76, 1.6], [-0.74, 0.82]],
          [[-0.68, -0.88], [0.68, -0.88], [0.7, -1.4], [0.66, -1.95], [-0.66, -1.95], [-0.7, -1.4], [-0.68, -0.88]],
        ],
        front: [[[-0.8, 0.505], [0.8, 0.505]]],
        rear: [[[-0.8, 0.585], [0.8, 0.585]]],
      },
      // `plate`: the licence plate painted into the rear bumper's recess (rear view, metres)
      livery: {
        door: [0.12, 0.675],
        shoulder: 0.72,
        cabin: { x: 0.6, z0: -1.9, z1: 0.8 },
        panda: { side: 0.475, front: 0.51, rear: 0.59 },
        plate: { x: 0, y: 0.425, w: 0.3, h: 0.15, text: 'GUNMA 86' },
      },
      tailLights: [
        [0.62, 0.745, -2.05],
        [-0.62, 0.745, -2.05],
      ],
      headLights: [
        [0.65, 0.715, 2.075],
        [-0.65, 0.715, 2.075],
      ],
      exhausts: [[-0.45, 0.2, -2.12]],
    },
  };
}
