// DEUCE - a 30s-style chopped hot rod. A three-window coupe body with its roof chopped low, sitting
// on black frame rails; no hood and no front fenders: a tall chrome grille shell, two chrome bucket
// headlamps on a bar, an exposed engine with chrome valve covers, three air cleaners and headers
// into pipes running back under the body, skinny front wheels on a chrome dropped axle, round rear
// fenders over fat rear tyres and small round tail lamps. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, sdBox, sdRoundBox, sdCylY, sdCylZ, sdCapsule, sdEllipsoid } from '../sdf.js';
import { MAT, Acc, pocket } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildDeuce() {
  // (whitewalls filling a like share of the skinny fronts' and fat rears' sidewalls)
  const WH = {
    front: { z: 1.55, y: 0.31, x: 0.68, r: 0.31, w: 0.16, rim: 0.2, whitewall: 0.04 },
    rear: { z: -1.15, y: 0.37, x: 0.76, r: 0.37, w: 0.32, rim: 0.2, whitewall: 0.07 },
  };

  // ------------------------------------------------------------------ main volumes
  // the body seen from the side (z, y): the cowl and doors, a rounded deck falling to the tail
  const bodySide = new Profile2D(
    [
      [1.12, 0.44, 1],
      [1.12, 0.92],
      [1.02, 0.96],
      [0.0, 0.965],
      [-0.6, 0.96],
      [-1.15, 0.935],
      [-1.5, 0.85],
      [-1.66, 0.7],
      [-1.71, 0.55],
      [-1.66, 0.44, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): the cowl narrows toward the engine, the tail is rounded
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 1.12],
      [0.5, 1.12],
      [0.62, 1.02],
      [0.68, 0.72],
      [0.68, -1.3],
      [0.64, -1.52],
      [0.52, -1.67],
      [0, -1.72],
    ]),
    { band: 0.2 },
  );
  // the chopped top: a short upright windshield, a low flat roof, a small back window
  const cabSide = new Profile2D(
    [
      [1.0, 0.86, 1],
      [0.97, 0.965],
      [0.93, 1.245],
      [0.86, 1.285],
      [0.2, 1.29],
      [-0.3, 1.275],
      [-0.5, 1.23],
      [-0.62, 1.12],
      [-0.68, 0.965],
      [-0.68, 0.86, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 0.99],
      [0.55, 0.98],
      [0.61, 0.93],
      [0.62, -0.5],
      [0.58, -0.65],
      [0, -0.7],
    ]),
    { band: 0.2 },
  );
  // the grille shell seen from the front (x, y): tall, round-shouldered, narrowing to the bottom
  const grilleShell = new Profile2D(
    mirrorU([
      [0, 1.025],
      [0.14, 1.005],
      [0.23, 0.95],
      [0.255, 0.86],
      [0.24, 0.58],
      [0.19, 0.46],
      [0, 0.43],
    ]),
    { band: 0.1, res: 0.002 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // a three-window coupe: one long door glass each side and a small back window
  const DOOR_WIN = [
    [0.875, 1.005, 1],
    [0.845, 1.225, 1],
    [0.1, 1.225, 1],
    [0.1, 1.005, 1],
  ];
  // the windshield seen from the front (x, y)
  const WINDSHIELD = [
    [-0.5, 1.005, 1],
    [0.5, 1.005, 1],
    [0.48, 1.225, 1],
    [-0.48, 1.225, 1],
  ];
  const doorWin = new Profile2D(DOOR_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);

  // un-cut outer skin (also used to lay the glass onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const bP = bodyPlan.sample(ax, z);
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.06);
    // the top leans in and its roof is crowned
    const tilt = Math.max(0, y - 1.0) * 0.4;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y + 0.06 * ax * ax);
    const dCab = smax(cS, cP, 0.06);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    return smin(dBody, dCab, 0.02);
  }

  const acc = new Acc();
  const po = { wall: false };
  const RX = 0.5; // the exhaust pipes run back under the body at this |x|
  const RY = 0.28;

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { dBody, dCab, cS, cP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // black frame rails under the body, running out to the grille shell
    if (y < 0.5 && ax > 0.3 && ax < 0.55 && z < 2.0 && z > -1.85) acc.add(sdBox(ax - 0.42, y - 0.36, z - 0.075, 0.035, 0.06, 1.85), MAT.trim, 0.01);
    // the grille shell: a chrome surround round a black radiator with thin chrome bars, a chrome cap
    if (z > 1.86 && z < 2.1 && y > 0.36 && y < 1.1 && ax < 0.32) {
      const f = grilleShell.sample(x, y);
      acc.add(Math.max(f, Math.abs(z - 1.97) - 0.06), MAT.chrome, 0.012);
      acc.cut(Math.max(f + 0.035, 1.995 - z), MAT.grille, 0.006);
      for (let i = -3; i <= 3; i++) acc.add(Math.max(Math.hypot(x - i * 0.055, z - 2.0) - 0.007, f + 0.03), MAT.chrome, 0.002);
      acc.add(sdCylY(x, y - 1.035, z - 1.96, 0.024, 0.022) - 0.004, MAT.chrome, 0.006);
    }
    // the engine: a dark block, chrome valve covers on its two banks, three chrome air cleaners on
    // the manifold, four chrome headers a side sweeping down into a collector
    if (z > 1.0 && z < 1.92 && y > 0.3 && y < 1.0 && ax < 0.62) {
      acc.add(sdRoundBox(x, y - 0.6, z - 1.48, 0.2, 0.2, 0.32, 0.05), MAT.head, 0.01);
      acc.add(sdRoundBox(ax - 0.17, y - 0.8, z - 1.48, 0.06, 0.035, 0.3, 0.03), MAT.chrome, 0.008);
      acc.add(sdRoundBox(x, y - 0.84, z - 1.48, 0.1, 0.04, 0.26, 0.02), MAT.head, 0.008);
      for (const zc of [1.27, 1.48, 1.69]) acc.add(sdCylY(x, y - 0.915, z - zc, 0.085, 0.028) - 0.006, MAT.chrome, 0.006);
      for (const zc of [1.28, 1.42, 1.56, 1.7]) acc.add(sdCapsule(ax, y, z, 0.2, 0.6, zc, 0.52, 0.4, 1.1, 0.02), MAT.chrome, 0.012);
    }
    // the collectors turn down into the pipes, which run back under the body to the tail
    if (ax > 0.4 && ax < 0.62 && y < 0.5 && z > -1.85 && z < 1.2) {
      acc.add(sdCapsule(ax, y, z, 0.52, 0.4, 1.1, RX, RY, 0.9, 0.04), MAT.chrome, 0.012);
      acc.add(sdCylZ(ax - RX, y - RY, z + 0.45, 0.04, 1.35), MAT.chrome, 0.012);
    }
    // chrome bucket headlamps on a bar in front of the radiator
    if (z > 1.75 && z < 2.05 && y > 0.7 && y < 1.0 && ax < 0.56) {
      acc.add(sdCapsule(x, y, z, -0.44, 0.78, 1.9, 0.44, 0.78, 1.9, 0.016), MAT.chrome, 0.008);
      acc.add(sdEllipsoid(ax - 0.44, y - 0.875, z - 1.9, 0.09, 0.09, 0.08), MAT.chrome, 0.012);
    }
    // the dropped front axle (its middle sits below the wheel centres) on a transverse spring, with
    // hairpin radius rods back to the frame
    if (z > 0.9 && z < 1.75 && y < 0.5 && ax < 0.7) {
      acc.add(sdCapsule(ax, y, z, 0.6, 0.31, 1.55, 0.4, 0.24, 1.55, 0.03), MAT.chrome, 0.012);
      acc.add(sdCapsule(x, y, z, -0.4, 0.24, 1.55, 0.4, 0.24, 1.55, 0.03), MAT.chrome, 0.012);
      acc.add(sdRoundBox(x, y - 0.42, z - 1.6, 0.46, 0.02, 0.035, 0.01), MAT.trim, 0.01);
      acc.add(sdCapsule(ax, y, z, 0.56, 0.3, 1.55, 0.42, 0.34, 0.98, 0.016), MAT.chrome, 0.008);
    }
    // a moulding along the body sides below the belt
    if (ax > 0.5 && y > 0.86 && y < 0.94 && z > -1.35 && z < 1.15) {
      acc.add(Math.hypot(y - 0.9, S.bP, Math.max(0, -1.3 - z, z - 1.06)) - 0.011, MAT.paint, 0.006);
    }
    // a round chrome mirror on the windshield post
    if (z > 0.85 && z < 1.0 && y > 1.0 && y < 1.2 && ax > 0.5) {
      acc.add(sdCylZ(ax - 0.71, y - 1.12, z - 0.92, 0.045, 0.01) - 0.004, MAT.chrome, 0.004);
      acc.add(sdCapsule(ax, y, z, 0.58, 1.08, 0.94, 0.68, 1.11, 0.925, 0.009), MAT.chrome, 0.006);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the top and the tub below it; a bench seat, a dash, a big thin wheel
    if (y > 0.4 && z < 1.06 && z > -0.72 && ax < 0.66) {
      const tub = Math.max(dBody + 0.03, ax - 0.6);
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.46 - y, z - 1.04, -0.64 - z);
      acc.cut(inner, MAT.interior, 0.012);
      acc.add(sdRoundBox(x, y - 0.55, z + 0.3, 0.56, 0.07, 0.22, 0.05), MAT.interior, 0.02);
      acc.add(sdRoundBox(x, y - 0.82, z + 0.52, 0.56, 0.22, 0.06, 0.05), MAT.interior, 0.03);
      acc.add(sdRoundBox(x, y - 0.88, z - 0.92, 0.56, 0.06, 0.08, 0.04), MAT.interior, 0.03);
      const wx = x - 0.28;
      const wy = y - 0.9;
      const wz = z - 0.66;
      const tilt = 0.6;
      const v = wy * Math.cos(tilt) + wz * Math.sin(tilt);
      const w = -wy * Math.sin(tilt) + wz * Math.cos(tilt);
      acc.add(Math.hypot(Math.hypot(wx, v) - 0.15, w) - 0.013, MAT.chrome, 0.004);
      acc.add(sdCapsule(x, y, z, 0.28, 0.9, 0.66, 0.28, 0.86, 0.88, 0.02), MAT.interior, 0.01);
    }
    // window openings through the top in chrome frames (glass panes sit in them); the back window
    // is a shallow recess
    if (y > 0.95 && z < 1.05 && z > -0.75) {
      const onCab = dCab - dBody + 0.004; // negative where the top is the outer surface
      const side = cS - cP + 0.01; // negative on the sides of the top
      let reg = Math.max(doorWin.sample(z, y), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
      reg = Math.max(windshield.sample(x, y), 0.85 - z, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
      reg = Math.max(sdRoundBox(x, y - 1.165, 0, 0.3, 0.055, 1, 0.03), -0.5 - z, onCab);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // room for the rear tyres in the body's flanks (the fenders cover them)
    if (ax > 0.45 && y < 0.95 && Math.abs(z - WH.rear.z) < 0.6) {
      acc.cut(Math.max(Math.hypot(y - WH.rear.y, z - WH.rear.z) - (WH.rear.r + 0.04), 0.56 - ax), MAT.trim, 0.012);
    }
    // round rear fenders: a rounded band over the top of each fat tyre, ending flat at both ends
    if (ax > 0.45 && y > 0.25 && y < 0.95 && z < -0.5 && z > -1.8) {
      const rho = Math.hypot(y - WH.rear.y, z - WH.rear.z);
      // (narrower toward its ends, which hang down in front of and behind the tyre)
      const hw = 0.2 - 0.05 * Math.min(1, Math.abs(z - WH.rear.z) / Math.max(rho, 1e-6));
      const band = sdRoundBox(ax - 0.765, rho - 0.465, 0, hw, 0.055, 1, 0.045);
      acc.add(Math.max(band, 0.3 - y), MAT.paint, 0.04);
    }
    // small round tail lamps in chrome cups and the plate between them (the livery paints it)
    if (z < -1.55 && y > 0.45 && y < 0.8 && ax < 0.56) {
      const r = Math.hypot(ax - 0.42, y - 0.66);
      acc.add(sdCylZ(ax - 0.42, y - 0.66, z + 1.69, 0.055, 0.03) - 0.006, MAT.chrome, 0.006);
      acc.add(Math.max(r - 0.044, Math.abs(z + 1.724) - 0.006), MAT.tail, 0.002);
      acc.add(Math.max(r - 0.02, Math.abs(z + 1.728) - 0.006), MAT.tailglow, 0.001);
      acc.cut(pocket(sdRoundBox(x, y - 0.57, 0, 0.155, 0.075, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    // the headlamp lenses
    if (z > 1.9 && z < 2.02 && y > 0.77 && y < 0.98 && ax > 0.33 && ax < 0.55) {
      acc.add(Math.max(sdEllipsoid(ax - 0.44, y - 0.875, z - 1.9, 0.086, 0.086, 0.086), 1.955 - z), MAT.lens, 0.002);
    }
    // the pipes end in open tips
    if (ax > 0.4 && ax < 0.6 && y < 0.4 && z < -1.7) {
      acc.cut(Math.max(Math.hypot(ax - RX, y - RY) - 0.028, z + 1.77), MAT.exhaust, 0.004);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint && y < 0.455 && ax < 0.55) acc.m = MAT.trim; // under the body (the floor sits at 0.44)
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) decals.push({ kind: 'panel', mat: MAT.window, view, outline: DOOR_WIN, depth: 0.006 });
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.front, outline: WINDSHIELD, depth: 0.006 });

  return {
    id: 'deuce',
    sdf,
    shell,
    decals,
    // the radiator sits deep in the grille shell: full AO turns it into a black void
    aoStrength: { [MAT.grille]: 0.45, [MAT.chrome]: 0.7, [MAT.head]: 0.7 },
    bounds: { min: [-1.1, 0.0, -1.95], max: [1.1, 1.45, 2.2] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [[[0.9, 0.955], [0.92, 0.48], [0.08, 0.48], [0.08, 0.955]]],
        top: [[[-0.52, -0.8], [0.52, -0.8], [0.5, -1.45], [-0.5, -1.45], [-0.52, -0.8]]],
      },
      // `plate`: the licence plate painted onto the tail (rear view, metres); `flames`: where the Flames
      // livery sits
      livery: {
        door: [0.5, 0.7],
        shoulder: 0.8,
        cabin: { x: 0.5, z0: -0.66, z1: 0.96 },
        plate: { x: 0, y: 0.57, w: 0.3, h: 0.15, text: 'HOT 32' },
        // the flame job starts at the cowl (there's no hood) and licks back over the doors
        flames: { z: 1.17, len: 1.75, y0: 0.42, y1: 0.86 },
      },
      tailLights: [
        [0.42, 0.66, -1.73],
        [-0.42, 0.66, -1.73],
      ],
      headLights: [
        [0.44, 0.875, 1.985],
        [-0.44, 0.875, 1.985],
      ],
      exhausts: [
        [RX, RY, -1.8],
        [-RX, RY, -1.8],
      ],
    },
  };
}
