// ENDURO - a 60s endurance racer, barely knee-high. Front fenders rising above a low hood with
// round lamps faired into them and an oval mouth between, a bubble cabin whose doors cut up into
// the roof, louvres over the engine, scoops ahead of the rear wheels, a long tail cut off square
// with a small lip, round tail lamps and four pipes. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylY, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildEnduro() {
  const WH = {
    front: { z: 1.3, y: 0.31, x: 0.76, r: 0.31, w: 0.24, rim: 0.2 },
    rear: { z: -1.12, y: 0.33, x: 0.78, r: 0.33, w: 0.31, rim: 0.2 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette along the fender tops (z, y): a low nose, fenders cresting over both axles, a
  // long tail cut off square
  const bodySide = new Profile2D(
    [
      [2.12, 0.17, 1],
      [2.2, 0.22],
      [2.245, 0.3],
      [2.24, 0.37],
      [2.18, 0.44],
      [2.02, 0.53],
      [1.75, 0.63],
      [1.45, 0.71],
      [1.3, 0.73],
      [1.1, 0.73],
      [0.9, 0.71],
      [0.6, 0.68],
      [0.0, 0.67],
      [-0.6, 0.72],
      [-0.9, 0.77],
      [-1.12, 0.79],
      [-1.4, 0.785],
      [-1.8, 0.76],
      [-2.1, 0.73],
      [-2.24, 0.71, 1],
      [-2.26, 0.6],
      [-2.25, 0.4],
      [-2.2, 0.28],
      [-2.1, 0.18, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a pinched waist between the front fenders and the rear hips
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.25],
      [0.4, 2.23],
      [0.66, 2.15],
      [0.82, 1.98],
      [0.9, 1.7],
      [0.91, 1.3],
      [0.885, 0.9],
      [0.865, 0.4],
      [0.88, -0.3],
      [0.92, -0.9],
      [0.93, -1.3],
      [0.92, -1.8],
      [0.88, -2.15],
      [0.7, -2.26],
      [0, -2.27],
    ]),
    { band: 0.2 },
  );
  // the bubble cabin (z, y): a curved windshield, a short roof, a fastback down onto the engine
  const cabSide = new Profile2D(
    [
      [0.92, 0.6, 1],
      [0.86, 0.66],
      [0.55, 0.88],
      [0.25, 1.0],
      [0.0, 1.025],
      [-0.3, 1.03],
      [-0.5, 1.0],
      [-0.9, 0.85],
      [-1.12, 0.78],
      [-1.16, 0.6, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 0.92],
      [0.5, 0.9],
      [0.62, 0.8],
      [0.66, 0.4],
      [0.66, -0.3],
      [0.62, -0.8],
      [0.5, -1.1],
      [0, -1.17],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // door glass reaching up to the roof edge (the doors are cut into the roof)
  const DOOR_WIN = [
    [0.66, 0.735, 1],
    [0.3, 0.94, 1],
    [-0.28, 0.965, 1],
    [-0.4, 0.78, 1],
    [-0.4, 0.72, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 0.84],
    [0.48, 0.82],
    [0.57, 0.7],
    [0.56, 0.4],
    [0.5, 0.2],
    [0, 0.18],
  ]);
  // louvres over the engine, on the fastback (top view, x z)
  const COVER = mirrorU([
    [0, -0.56],
    [0.42, -0.56],
    [0.48, -0.7],
    [0.46, -1.0],
    [0, -1.02],
  ]);
  const doorWin = new Profile2D(DOOR_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const cover = new Profile2D(COVER, small);

  // the hood and the engine deck sit lower than the fender crowns either side of them
  const dip = (ax, z) => {
    const across = 1 - smoothstep(0.3, 0.64, ax);
    const front = smoothstep(0.75, 1.15, z) * (1 - smoothstep(1.95, 2.2, z));
    const rear = smoothstep(-0.95, -1.35, z) * (1 - smoothstep(-1.9, -2.2, z));
    return across * (0.065 * front + 0.045 * rear);
  };
  // cross-section: rounded flanks rolling in toward the fender crowns
  const sec = (y) => {
    if (y < 0.28) return 0.95 + 0.05 * smoothstep(0.14, 0.28, y);
    return 1.0 - smoothstep(0.5, 0.8, y) * 0.06;
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y + dip(ax, z));
    const dBody = smax(bS, bP, 0.08);
    const tilt = Math.max(0, y - 0.7) * 0.6;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.08);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    return smin(dBody, dCab, 0.05);
  }

  const acc = new Acc();
  const po = { wall: false };
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { dBody, dCab, cS, cP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // small round chrome mirrors on the doors
    if (z > 0.45 && z < 0.75 && y > 0.6 && y < 0.85 && ax > 0.6) {
      acc.add(sdCylZ(ax - 0.84, y - 0.76, z - 0.6, 0.045, 0.012) - 0.004, MAT.chrome, 0.004);
      acc.add(sdCapsule(ax, y, z, 0.7, 0.7, 0.62, 0.82, 0.75, 0.605, 0.01), MAT.chrome, 0.008);
    }
    // a chrome quick-fill cap on the left front fender
    if (x > 0.5 && x < 0.75 && y > 0.6 && y < 0.8 && z > 0.85 && z < 1.1) {
      acc.add(sdCylY(x - 0.63, y - 0.71, z - 0.97, 0.05, 0.014) - 0.004, MAT.chrome, 0.006);
    }
    // a small lip along the top of the cut-off tail
    if (z < -2.0 && z > -2.35 && y > 0.6 && y < 0.82 && ax < 0.9) {
      acc.add(Math.max(sdRoundBox(x, y - 0.725, z + 2.24, 0.82, 0.02, 0.05, 0.012), -(sh + 0.02)), MAT.paint, 0.01);
    }
    // four pipes out of the tail
    if (z < -2.1 && y > 0.25 && y < 0.5 && ax < 0.35) {
      for (const xc of [0.1, 0.23]) acc.add(sdCylZ(ax - xc, y - 0.37, z + 2.24, 0.038, 0.06), MAT.chrome, 0.004);
    }

    // ---------------------------------------------------------------- cuts
    // cockpit: hollow the cabin and the tub below it, two seats
    if (y > 0.2 && z < 0.9 && z > -0.75 && ax < 0.86) {
      const tub = Math.max(dBody + 0.035, ax - 0.76);
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.24 - y, z - 0.84, -0.7 - z);
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.33, seatZ: -0.25, floorY: 0.24, dashZ: 0.58, dashY: 0.6, dashW: 0.62, wheelZ: 0.34, wheelY: 0.62, recline: 0.5 });
    }
    // window openings (glass panes sit in them); louvres over the engine
    if (y > 0.55 && z < 0.9 && z > -1.15) {
      const onCab = dCab - dBody + 0.004; // negative where the cabin is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the cabin
      let reg = Math.max(doorWin.sample(z, y), cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab + 0.01);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
      reg = Math.max(cover.sample(ax, z), top);
      for (let i = 0; i < 5; i++) {
        const zs = -0.62 - i * 0.085;
        acc.cut(pocket(Math.max(reg, Math.abs(z - zs) - 0.02), sh, 0.03, po), MAT.grille, 0.003);
      }
    }
    // the oval mouth, and round lamps faired into the fenders either side of it (chrome reflector
    // bowls: a dark one reads as an empty eye socket)
    if (z > 1.7 && y > 0.18 && y < 0.7) {
      const mouth = Math.hypot(x / 0.36, (y - 0.33) / 0.075) - 1;
      acc.cut(pocket(mouth * 0.075, sh, 0.06, po), po.wall ? MAT.paint : MAT.grille, 0.008);
      const lamp = Math.hypot((ax - 0.62) / 0.115, (y - 0.54) / 0.07) - 1;
      acc.cut(pocket(lamp * 0.07, sh, 0.035, po), MAT.chrome, 0.004);
    }
    // scoops in the flanks ahead of the rear wheels
    if (ax > 0.7 && z < -0.4 && z > -0.85 && y > 0.32 && y < 0.66) {
      const reg = sdRoundBox(0, y - 0.49, z + 0.62, 1, 0.1, 0.13, 0.04);
      acc.cut(pocket(reg, S.bP, 0.06, po), po.wall ? MAT.paint : MAT.grille, 0.008);
    }
    // round tail lamps, two a side, on the cut-off tail
    if (z < -2.1 && y > 0.45 && y < 0.68 && ax > 0.38 && ax < 0.86) {
      for (const xc of [0.5, 0.72]) {
        acc.cut(pocket(Math.hypot(ax - xc, y - 0.56) - 0.055, sh, 0.02, po), po.wall ? MAT.chrome : MAT.tail, 0.003);
      }
    }
    // the pipes are open
    if (z < -2.2 && y > 0.3 && y < 0.45 && ax < 0.3) {
      for (const xc of [0.1, 0.23]) acc.cut(Math.max(Math.hypot(ax - xc, y - 0.37) - 0.028, z + 2.27), MAT.exhaust, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.5 && y < 0.8) {
      if (Math.abs(z - WH.front.z) < 0.5) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.5) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.45 && z < 0.75 && y > 0.65 && y < 0.85 && ax > 0.75) {
      acc.cut(sdCylZ(ax - 0.84, y - 0.76, z - 0.586, 0.038, 0.004), MAT.chrome, 0.002);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.185) acc.m = MAT.trim; // underbody
      else if (z > 2.0 && y < 0.24) acc.m = MAT.trim; // chin
    }
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, lamps
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) decals.push({ kind: 'panel', mat: MAT.window, view, outline: DOOR_WIN, depth: 0.006 });
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  const ring = (cx, cy, r) => Array.from({ length: 33 }, (_, i) => [cx + Math.cos((i / 32) * Math.PI * 2) * r, cy + Math.sin((i / 32) * Math.PI * 2) * r]);
  for (const sx of [1, -1]) {
    decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [0.62 * sx, 0.54], radius: 0.05, depth: 0.03, segments: 28 });
    for (const xc of [0.5, 0.72]) decals.push({ kind: 'ribbon', mat: MAT.tailglow, view: VIEW.rear, path: ring(xc * sx, 0.56, 0.034), width: 0.012, depth: 0.016 });
  }

  return {
    id: 'enduro',
    sdf,
    shell,
    decals,
    // the mouth and the scoops are deep: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.5 },
    bounds: { min: [-1.2, 0.0, -2.5], max: [1.2, 1.3, 2.45] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y); the door cut-outs carry on
      // across the roof
      panels: {
        side: [[[0.8, 0.66], [0.82, 0.3], [-0.42, 0.3], [-0.42, 0.74]]],
        top: [
          [[0.47, 0.5], [0.47, -0.36]],
          [[-0.47, 0.5], [-0.47, -0.36]],
        ],
      },
      livery: {
        door: [0.15, 0.48],
        shoulder: 0.66,
        cabin: { x: 0.55, z0: -1.1, z1: 0.86 },
      },
      tailLights: [
        [0.61, 0.56, -2.27],
        [-0.61, 0.56, -2.27],
      ],
      headLights: [
        [0.62, 0.54, 2.1],
        [-0.62, 0.54, 2.1],
      ],
      exhausts: [
        [0.1, 0.37, -2.3],
        [0.23, 0.37, -2.3],
        [-0.1, 0.37, -2.3],
        [-0.23, 0.37, -2.3],
      ],
    },
  };
}
