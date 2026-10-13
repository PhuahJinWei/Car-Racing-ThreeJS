// APOGEE - a modern speed-record hypercar. A low nose with a light blade across it over a wide
// intake, front fenders cresting over the wheels, a teardrop canopy running back into a spine, a
// long tail with twin carbon fins, rear wheels covered by skirts, a light blade across the tail and
// a deep diffuser. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildApogee() {
  const WH = {
    front: { z: 1.5, y: 0.34, x: 0.84, r: 0.34, w: 0.27, rim: 0.25 },
    rear: { z: -1.35, y: 0.36, x: 0.84, r: 0.36, w: 0.33, rim: 0.26 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette along the fender crests (z, y): a low nose, the front fenders over the wheels,
  // high haunches over the covered rear wheels, the long tail
  const bodySide = new Profile2D(
    [
      [2.25, 0.15, 1],
      [2.33, 0.19],
      [2.37, 0.25],
      [2.37, 0.31],
      [2.3, 0.38],
      [2.1, 0.5],
      [1.8, 0.66],
      [1.5, 0.79],
      [1.2, 0.8],
      [0.9, 0.77],
      [0.4, 0.75],
      [-0.3, 0.78],
      [-0.9, 0.85],
      [-1.35, 0.89],
      [-1.8, 0.88],
      [-2.2, 0.83],
      [-2.5, 0.76],
      [-2.62, 0.72, 1],
      [-2.65, 0.6],
      [-2.63, 0.45],
      [-2.55, 0.32],
      [-2.4, 0.2],
      [-2.2, 0.15, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a pinched waist, wide hips over the rear skirts, the tail tapering away
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.38],
      [0.4, 2.36],
      [0.7, 2.28],
      [0.88, 2.12],
      [0.97, 1.9],
      [1.0, 1.6],
      [1.0, 1.2],
      [0.94, 0.6],
      [0.92, 0.0],
      [0.98, -0.6],
      [1.05, -1.1],
      [1.06, -1.5],
      [1.04, -1.9],
      [0.96, -2.3],
      [0.82, -2.55],
      [0.6, -2.64],
      [0, -2.66],
    ]),
    { band: 0.2 },
  );
  // the teardrop canopy (z, y), running back into a spine along the tail
  const cabSide = new Profile2D(
    [
      [1.15, 0.66, 1],
      [1.08, 0.73],
      [0.6, 0.98],
      [0.2, 1.1],
      [-0.2, 1.12],
      [-0.6, 1.08],
      [-1.0, 0.99],
      [-1.5, 0.9],
      [-1.95, 0.85],
      [-2.0, 0.7, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.16],
      [0.5, 1.13],
      [0.64, 1.0],
      [0.7, 0.5],
      [0.7, -0.2],
      [0.62, -0.7],
      [0.45, -1.2],
      [0.25, -1.7],
      [0, -1.98],
    ]),
    { band: 0.2 },
  );
  // the fins seen from the side (z, y): a swept leading edge, square at the back
  const finSide = new Profile2D(
    [
      [-1.45, 0.8, 1],
      [-2.25, 1.12, 1],
      [-2.56, 1.13, 1],
      [-2.6, 0.7, 1],
      [-1.6, 0.7, 1],
    ],
    { band: 0.1, res: 0.003 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // the canopy's side glass
  const SIDE_WIN = [
    [0.86, 0.79, 1],
    [0.45, 1.0, 1],
    [-0.2, 1.05, 1],
    [-0.55, 0.98],
    [-0.75, 0.86, 1],
    [-0.6, 0.8, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.06],
    [0.46, 1.04],
    [0.56, 0.92],
    [0.55, 0.5],
    [0.48, 0.18],
    [0, 0.16],
  ]);
  // dark glass over the engine, at the back of the canopy (top view, x z)
  const ENGINE_GLASS = mirrorU([
    [0, -0.22],
    [0.38, -0.24],
    [0.36, -0.75],
    [0.22, -1.1],
    [0, -1.15],
  ]);
  const sideWin = new Profile2D(SIDE_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const engineGlass = new Profile2D(ENGINE_GLASS, small);

  // the hood and the deck sit lower than the fender crests either side of them
  const dip = (ax, z) => {
    const front = (1 - smoothstep(0.38, 0.74, ax)) * smoothstep(0.95, 1.35, z) * (1 - smoothstep(2.05, 2.3, z));
    const rear = (1 - smoothstep(0.5, 0.86, ax)) * smoothstep(-0.7, -1.1, z) * (1 - smoothstep(-2.3, -2.6, z));
    return 0.12 * front + 0.07 * rear;
  };
  const sec = (y) => {
    if (y < 0.26) return 0.95 + 0.05 * smoothstep(0.13, 0.26, y);
    return 1.0 - smoothstep(0.52, 0.86, y) * 0.07;
  };

  // un-cut outer skin (also used to lay the glass and light strips onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y + dip(ax, z));
    const dBody = smax(bS, bP, 0.07);
    const tilt = Math.max(0, y - 0.8) * 0.6;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.08);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    return smin(dBody, dCab, 0.06);
  }

  const acc = new Acc();
  const po = { wall: false };
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { dBody, dCab, cS, cP, bP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // twin carbon fins standing on the tail
    if (z < -1.35 && z > -2.7 && y > 0.6 && y < 1.2 && ax > 0.5 && ax < 0.7) {
      acc.add(Math.max(finSide.sample(z, y), Math.abs(ax - 0.6) - 0.012), MAT.carbon, 0.015);
    }
    // small carbon mirrors on stalks from the canopy
    if (z > 0.55 && z < 0.95 && y > 0.75 && y < 1.0 && ax > 0.6) {
      acc.add(sdRoundBox(ax - 0.93, y - 0.86, z - 0.74, 0.075, 0.035, 0.045, 0.025), MAT.carbon, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.66, 0.86, 0.78, 0.86, 0.86, 0.75, 0.012), MAT.carbon, 0.01);
    }
    // carbon strakes in the diffuser
    if (z < -2.2 && y < 0.36 && ax < 0.75) {
      for (const xc of [0.3, 0.52]) acc.add(sdRoundBox(ax - xc, y - 0.24, z + 2.42, 0.008, 0.1, 0.22, 0.006), MAT.carbon, 0.006);
    }
    // two pipes in the middle of the diffuser
    if (z < -2.3 && y < 0.42 && ax < 0.25) {
      acc.add(sdCylZ(ax - 0.12, y - 0.31, z + 2.55, 0.042, 0.08), MAT.chrome, 0.004);
    }

    // ---------------------------------------------------------------- cuts
    // cockpit: hollow the canopy and the tub below it, furnished
    if (y > 0.2 && z < 1.15 && z > -0.75 && ax < 0.9) {
      const tub = Math.max(dBody + 0.035, ax - 0.78);
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.26 - y, z - 1.08, -0.7 - z);
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.36, seatZ: -0.2, floorY: 0.26, dashZ: 0.72, dashY: 0.66, dashW: 0.66, wheelZ: 0.44, wheelY: 0.68, recline: 0.48 });
    }
    // the canopy's glass (panes sit in the openings); dark glass over the engine
    if (y > 0.6 && z < 1.15 && z > -1.25) {
      const onCab = dCab - dBody + 0.004; // negative where the canopy is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the canopy
      let reg = Math.max(sideWin.sample(z, y), cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab + 0.01);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(engineGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // the nose: a slot for the light blade, small lamps at its ends, a wide intake under it and
    // ducts in the corners
    if (z > 1.95 && y > 0.16 && y < 0.56) {
      const blade = Math.max(ax - 0.84, Math.abs(y - 0.43) - 0.01);
      acc.cut(pocket(blade, sh, 0.02, po), po.wall ? MAT.trim : MAT.head, 0.003);
      const lamp = sdRoundBox(ax - 0.7, y - 0.385, 0, 0.11, 0.022, 1, 0.015);
      acc.cut(pocket(lamp, sh, 0.022, po), po.wall ? MAT.trim : MAT.head, 0.003);
      const intake = sdRoundBox(x, y - 0.26, 0, 0.5, 0.06, 1, 0.03);
      const duct = sdRoundBox(ax - 0.82, y - 0.27, 0, 0.1, 0.06, 1, 0.025);
      acc.cut(pocket(Math.min(intake, duct), sh, 0.08, po), po.wall ? MAT.trim : MAT.grille, 0.006);
    }
    // side intakes behind the doors, swept back and tapering
    if (ax > 0.7 && z < -0.3 && z > -1.05 && y > 0.3 && y < 0.72) {
      const reg = sdRoundBox(0, y - 0.5 + (z + 0.67) * 0.12, z + 0.67, 1, 0.075 + (z + 0.67) * 0.08, 0.27, 0.04);
      acc.cut(pocket(reg, bP, 0.06, po), po.wall ? MAT.trim : MAT.grille, 0.008);
    }
    // the tail: a light blade across it, the plate below
    if (z < -2.3 && y > 0.36 && y < 0.8) {
      const blade = Math.max(ax - 0.62, Math.abs(y - 0.655) - 0.016);
      acc.cut(pocket(blade, sh, 0.02, po), po.wall ? MAT.trim : MAT.tail, 0.003);
      acc.cut(pocket(sdRoundBox(x, y - 0.48, 0, 0.17, 0.085, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    // the pipes are open
    if (z < -2.5 && y < 0.4 && ax < 0.2) acc.cut(Math.max(Math.hypot(ax - 0.12, y - 0.31) - 0.031, z + 2.6), MAT.exhaust, 0.003);
    // front wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 0.85 && Math.abs(z - WH.front.z) < 0.5) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
    // the rear wells: a skirt of the body stays over the outside of each wheel, open only along
    // its bottom edge
    if (ax > 0.55 && y < 0.9 && Math.abs(z - WH.rear.z) < 0.52) {
      acc.cut(Math.max(arch(ax, y, z, WH.rear), Math.min(bP + 0.03, y - 0.25)), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.55 && z < 0.95 && y > 0.8 && y < 0.95 && ax > 0.85) {
      acc.cut(sdRoundBox(ax - 0.93, y - 0.86, z - 0.697, 0.06, 0.026, 0.008, 0.008), MAT.chrome, 0.002);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.17) acc.m = MAT.trim; // underbody
      else if (z > 2.05 && y < 0.2) acc.m = MAT.trim; // splitter
      else if (z < -2.2 && y < 0.38) acc.m = MAT.trim; // diffuser
      else if (y < 0.24 && z > -0.8 && z < 1.0) acc.m = MAT.carbon; // side skirts
    }
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, light blades, lenses
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) decals.push({ kind: 'panel', mat: MAT.window, view, outline: SIDE_WIN, depth: 0.006 });
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  decals.push({
    kind: 'ribbon',
    mat: MAT.drl,
    view: VIEW.front,
    path: [
      [-0.83, 0.43],
      [0.83, 0.43],
    ],
    width: 0.009,
    depth: 0.01,
  });
  decals.push({
    kind: 'ribbon',
    mat: MAT.tailglow,
    view: VIEW.rear,
    path: [
      [-0.6, 0.655],
      [0.6, 0.655],
    ],
    width: 0.016,
    depth: 0.012,
  });
  for (const sx of [1, -1]) {
    for (const u of [0.64, 0.76]) decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, 0.385], radius: 0.016, depth: 0.019 });
  }

  return {
    id: 'apogee',
    sdf,
    shell,
    decals,
    // the intakes are deep: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.5 },
    bounds: { min: [-1.3, 0.0, -2.85], max: [1.3, 1.35, 2.55] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [[[0.95, 0.74], [0.98, 0.42], [0.9, 0.24], [-0.28, 0.24], [-0.3, 0.6], [-0.62, 0.8]]],
        top: [[[-0.6, 1.14], [0.6, 1.14], [0.7, 1.7], [0.55, 2.2], [-0.55, 2.2], [-0.7, 1.7], [-0.6, 1.14]]],
      },
      // `plate`: the licence plate painted into the tail's recess (rear view, metres)
      livery: {
        door: [0.3, 0.52],
        shoulder: 0.72,
        cabin: { x: 0.58, z0: -1.9, z1: 1.1 },
        plate: { x: 0, y: 0.48, w: 0.31, h: 0.155, text: 'AP 0GE' },
      },
      tailLights: [
        [0.45, 0.655, -2.64],
        [-0.45, 0.655, -2.64],
      ],
      headLights: [
        [0.7, 0.385, 2.32],
        [-0.7, 0.385, 2.32],
      ],
      exhausts: [
        [0.12, 0.31, -2.64],
        [-0.12, 0.31, -2.64],
      ],
    },
  };
}
