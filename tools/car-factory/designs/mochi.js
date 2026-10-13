// MOCHI - a 90s Japanese kei box car. A tiny, tall, soft-cornered box on 13-inch wheels: a short
// nose with two round headlamps and a slot of a grille between them, amber corner lamps in the
// bumper, an upright windshield, a tall glasshouse with five doors' worth of glass, chrome roof rails,
// tall tail lamps up the back corners and one little exhaust. Left-hand drive.
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

  // cross-section: slab sides, tucked in at the sills
  const sec = (y) => (y < 0.3 ? 0.95 + 0.05 * smoothstep(0.18, 0.3, y) : 1);

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.08);
    const tilt = Math.max(0, y - 0.95) * 0.1;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.07);
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

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { dBody, dCab, cS, cP } = S;
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
    // one little exhaust under the right-hand side of the bumper
    if (z < -1.5 && y < 0.3 && x < -0.3 && x > -0.55) {
      acc.add(sdCylZ(x + 0.42, y - 0.2, z + 1.66, 0.026, 0.06), MAT.chrome, 0.004);
      acc.cut(sdCylZ(x + 0.42, y - 0.2, z + 1.66, 0.019, 0.2), MAT.exhaust);
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
    // two round headlamps in chrome rings, a slot of a grille between them
    if (z > 1.55 && y > 0.5 && y < 0.76 && ax < 0.66) {
      const r = Math.hypot(ax - 0.5, y - 0.62);
      acc.cut(pocket(r - 0.072, sh, 0.03, po), po.wall ? MAT.chrome : MAT.head, 0.004);
      acc.add(Math.hypot(r - 0.076, sh + 0.003) - 0.009, MAT.chrome, 0.003);
      acc.cut(pocket(sdRoundBox(x, y - 0.625, 0, 0.28, 0.03, 1, 0.025), sh, 0.03, po), po.wall ? MAT.trim : MAT.grille, 0.004);
    }
    // an intake low in the bumper and amber corner lamps
    if (z > 1.55 && y > 0.2 && y < 0.46 && ax < 0.74) {
      acc.cut(pocket(sdRoundBox(x, y - 0.3, 0, 0.36, 0.04, 1, 0.03), sh, 0.03, po), po.wall ? MAT.trim : MAT.grille, 0.004);
      acc.cut(pocket(sdRoundBox(ax - 0.6, y - 0.4, 0, 0.08, 0.028, 1, 0.015), sh, 0.012, po), po.wall ? MAT.trim : MAT.amber, 0.003);
    }
    // tall tail lamps up the back corners, a clear reverse lamp at the bottom of each
    if (z < -1.5 && y > 0.5 && y < 1.08 && ax > 0.52) {
      acc.cut(pocket(sdRoundBox(ax - 0.665, y - 0.78, 0, 0.065, 0.26, 1, 0.025), sh, 0.02, po), po.wall ? MAT.trim : y > 0.62 ? MAT.tail : MAT.reverse, 0.003);
    }
    // licence plate recess in the tailgate (the livery paints the plate)
    if (z < -1.5 && y > 0.4 && y < 0.62 && ax < 0.2) {
      acc.cut(pocket(sdRoundBox(x, y - 0.51, 0, 0.16, 0.078, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
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
    if (acc.m === MAT.paint && y < 0.2) acc.m = MAT.trim; // underbody (the floor sits at 0.18)
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, lamps
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of sideWins) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  for (const sx of [1, -1]) {
    decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [0.5 * sx, 0.62], radius: 0.045, depth: 0.026, segments: 28 });
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.665 * sx, 0.68],
        [0.665 * sx, 0.98],
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
    decals,
    // the grille slot and the intake sit in pockets: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.45 },
    bounds: { min: [-1.0, 0.0, -1.95], max: [1.0, 1.85, 2.0] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [
          [[1.05, 0.88], [1.05, 0.28], [0.06, 0.28], [0.06, 0.92]],
          [[0.06, 0.28], [-0.82, 0.28], [-0.82, 0.93]],
        ],
        top: [[[-0.66, 1.17], [0.66, 1.17], [0.7, 1.68], [-0.7, 1.68], [-0.66, 1.17]]],
        rear: [[[-0.5, 0.93], [-0.52, 0.32], [0.52, 0.32], [0.5, 0.93]]],
      },
      // `plate`: the licence plate painted into the tailgate's recess (rear view, metres)
      livery: {
        door: [0.55, 0.6],
        shoulder: 0.75,
        cabin: { x: 0.6, z0: -1.6, z1: 1.1 },
        plate: { x: 0, y: 0.51, w: 0.3, h: 0.15, text: 'KEI 660' },
      },
      tailLights: [
        [0.665, 0.82, -1.67],
        [-0.665, 0.82, -1.67],
      ],
      headLights: [
        [0.5, 0.62, 1.73],
        [-0.5, 0.62, 1.73],
      ],
      exhausts: [[-0.42, 0.2, -1.72]],
    },
  };
}
