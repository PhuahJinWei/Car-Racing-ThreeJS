// SURGE - an electric four-door. A smooth closed nose with no grille, a full-width light bar over
// slim headlamps, a long fastback glasshouse with a dark glass roof running back into the rear
// glass, flush door handles, a small ducktail and a full-width tail light bar. No exhausts.
// Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildSurge() {
  const WH = {
    front: { z: 1.47, y: 0.35, x: 0.82, r: 0.35, w: 0.255, rim: 0.265 },
    rear: { z: -1.47, y: 0.35, x: 0.82, r: 0.35, w: 0.265, rim: 0.265 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a rounded nose under a low hood, a rising beltline, a ducktail
  const bodySide = new Profile2D(
    [
      [2.28, 0.17, 1],
      [2.4, 0.21],
      [2.47, 0.3],
      [2.49, 0.38],
      [2.47, 0.45],
      [2.41, 0.52],
      [2.3, 0.6],
      [2.12, 0.67],
      [1.85, 0.75],
      [1.55, 0.82],
      [1.25, 0.865],
      [1.05, 0.885],
      [0.5, 0.92],
      [-0.3, 0.95],
      [-1.0, 0.975],
      [-1.6, 0.995],
      [-2.0, 1.015],
      [-2.3, 1.03],
      [-2.42, 1.03, 1],
      [-2.45, 0.95],
      [-2.47, 0.75],
      [-2.47, 0.55],
      [-2.44, 0.38],
      [-2.38, 0.26],
      [-2.28, 0.18, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): rounded at both ends
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.49],
      [0.35, 2.475],
      [0.62, 2.42],
      [0.8, 2.32],
      [0.91, 2.17],
      [0.955, 1.98],
      [0.97, 1.8],
      [0.975, 1.2],
      [0.975, -1.2],
      [0.97, -1.8],
      [0.95, -2.15],
      [0.88, -2.36],
      [0.7, -2.45],
      [0.4, -2.48],
      [0, -2.49],
    ]),
    { band: 0.2 },
  );
  // the fastback glasshouse: a long raked windshield, the roof peaking over the front seats, one
  // long slope down to the ducktail
  const cabSide = new Profile2D(
    [
      [1.3, 0.8, 1],
      [1.24, 0.88],
      [0.8, 1.13],
      [0.35, 1.36],
      [0.05, 1.41],
      [-0.4, 1.425],
      [-0.8, 1.405],
      [-1.2, 1.33],
      [-1.6, 1.2],
      [-1.95, 1.08],
      [-2.12, 1.03],
      [-2.16, 0.95, 1],
      [-2.16, 0.8, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.32],
      [0.72, 1.315],
      [0.83, 1.28],
      [0.86, 1.18],
      [0.875, 0.7],
      [0.875, -0.4],
      [0.86, -1.0],
      [0.82, -1.5],
      [0.72, -1.9],
      [0.5, -2.12],
      [0, -2.16],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // front and rear door glass, the rear one running back into the C-pillar
  const FRONT_WIN = [
    [0.98, 0.955, 1],
    [0.4, 1.28, 1],
    [-0.45, 1.355, 1],
    [-0.45, 0.975, 1],
  ];
  const REAR_WIN = [
    [-0.53, 1.35, 1],
    [-0.95, 1.33],
    [-1.38, 1.2],
    [-1.6, 1.08, 1],
    [-1.64, 0.995, 1],
    [-0.53, 0.98, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.24],
    [0.58, 1.23],
    [0.72, 1.13],
    [0.75, 0.8],
    [0.68, 0.45],
    [0, 0.42],
  ]);
  // the dark glass roof, running on back into the rear glass (top view, x z)
  const CANOPY = mirrorU([
    [0, 0.34],
    [0.56, 0.33],
    [0.63, 0.18],
    [0.66, -0.6],
    [0.64, -1.2],
    [0.58, -1.7],
    [0.44, -1.98],
    [0, -2.02],
  ]);
  const sideWin = [FRONT_WIN, REAR_WIN].map((o) => new Profile2D(o, small));
  const windshield = new Profile2D(WINDSHIELD, small);
  const canopy = new Profile2D(CANOPY, small);

  // cross-section: tucked sills, full flanks, a soft shoulder and tumblehome above it
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.3) return 0.95 + 0.05 * smoothstep(0.15, 0.3, y);
    return 1.0 - ramp(y - 0.84, 0.012) * 0.32;
  };

  // un-cut outer skin (also used to lay the glass and light strips onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.06);
    const tilt = Math.max(0, y - 1.0) * 0.45;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.07);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    return smin(dBody, dCab, 0.04);
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
    // slim gloss-black door mirrors on short stalks
    if (z > 0.7 && z < 1.05 && y > 0.9 && y < 1.12 && ax > 0.82) {
      acc.add(sdRoundBox(ax - 1.03, y - 1.02, z - 0.86, 0.08, 0.045, 0.05, 0.035), MAT.trim, 0.008);
      acc.add(sdCapsule(ax, y, z, 0.86, 0.97, 0.9, 0.98, 1.0, 0.87, 0.014), MAT.trim, 0.01);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, two seats in front, a bench behind
    if (y > 0.22 && z < 1.3 && z > -2.1 && ax < 0.94) {
      const tub = Math.max(dBody + 0.035, ax - 0.88);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.3 - y, z - 1.2, -1.95 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.42, seatZ: 0.0, floorY: 0.3, dashZ: 0.86, dashY: 0.8, dashW: 0.82, wheelZ: 0.55, wheelY: 0.84, recline: 0.32 });
      if (z < -0.45) {
        acc.add(sdRoundBox(x, y - 0.4, z + 0.95, 0.74, 0.07, 0.26, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.7, z + 1.24, 0.74, 0.28, 0.07, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the glasshouse (glass panes sit in them); the roof and rear glass
    // are one dark, shallow recess
    if (y > 0.84 && z < 1.32 && z > -2.15) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = Math.min(sideWin[0].sample(z, y), sideWin[1].sample(z, y));
      let reg = Math.max(side, cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      // (the windshield stays clear of the rounded pillar bases, where the top blends into the body)
      reg = Math.max(windshield.sample(ax, z), top, onCab + 0.012);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(canopy.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // the front: a slot across the nose for the light bar, slim headlamps under its ends, a low
    // intake and air curtains in the bumper corners
    if (z > 2.0 && y > 0.2 && y < 0.72) {
      const bar = Math.max(ax - 0.8, Math.abs(y - 0.5) - 0.011);
      acc.cut(pocket(bar, sh, 0.02, po), po.wall ? MAT.trim : MAT.head, 0.003);
      const lamp = sdRoundBox(ax - 0.67, y - 0.462, 0, 0.13, 0.026, 1, 0.02);
      acc.cut(pocket(lamp, sh, 0.024, po), po.wall ? MAT.trim : MAT.head, 0.003);
      const intake = Math.max(ax - 0.52, Math.abs(y - 0.28) - 0.035);
      const curtain = Math.max(Math.abs(ax - 0.78) - 0.02, Math.abs(y - 0.33) - 0.065);
      acc.cut(pocket(Math.min(intake, curtain), sh, 0.05, po), po.wall ? MAT.trim : MAT.grille, 0.005);
    }
    // the tail: a light bar across the full width under the ducktail, reverse lamps low in the
    // bumper, a plate recess
    if (z < -2.15 && y > 0.3 && y < 1.0) {
      const bar = Math.max(ax - 0.93, Math.abs(y - 0.905) - 0.022);
      acc.cut(pocket(bar, sh, 0.022, po), po.wall ? MAT.trim : MAT.tail, 0.003);
      const rev = Math.max(Math.abs(ax - 0.62) - 0.07, Math.abs(y - 0.4) - 0.014);
      acc.cut(pocket(rev, sh, 0.012, po), po.wall ? MAT.trim : MAT.reverse, 0.002);
      acc.cut(pocket(sdRoundBox(x, y - 0.63, 0, 0.17, 0.085, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 0.85) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.7 && z < 1.0 && y > 0.95 && y < 1.1 && ax > 0.9) {
      acc.cut(sdRoundBox(ax - 1.04, y - 1.02, z - 0.808, 0.066, 0.034, 0.012, 0.01), MAT.chrome, 0.003);
    }
    // flush door handles: a thin slot toward the back of each door
    if (ax > 0.86 && y > 0.82 && y < 0.92 && z > -1.1 && z < -0.1) {
      for (const zc of [-0.3, -0.98]) {
        acc.cut(pocket(sdRoundBox(0, y - 0.87, z - zc, 1, 0.012, 0.08, 0.01), sh, 0.006, po), MAT.trim, 0.002);
      }
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.2) acc.m = MAT.trim; // underbody
      else if (z < -2.2 && y < 0.3) acc.m = MAT.trim; // diffuser
      else if (y < 0.27 && ax > 0.85 && z > -1.0 && z < 1.0) acc.m = MAT.trim; // sills
    }
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, light strips, lenses
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of [FRONT_WIN, REAR_WIN]) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  // the light bar across the nose, in its slot
  decals.push({
    kind: 'ribbon',
    mat: MAT.drl,
    view: VIEW.front,
    path: [
      [-0.79, 0.5],
      [0.79, 0.5],
    ],
    width: 0.01,
    depth: 0.012,
  });
  // the tail light bar
  decals.push({
    kind: 'ribbon',
    mat: MAT.tailglow,
    view: VIEW.rear,
    path: [
      [-0.9, 0.905],
      [0.9, 0.905],
    ],
    width: 0.014,
    depth: 0.014,
  });
  for (const sx of [1, -1]) {
    // projector lenses in the headlamps
    for (const u of [0.6, 0.74]) decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, 0.462], radius: 0.019, depth: 0.017 });
  }

  return {
    id: 'surge',
    sdf,
    shell,
    decals,
    // the intakes are deep: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.5 },
    bounds: { min: [-1.25, 0.0, -2.7], max: [1.25, 1.6, 2.7] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [
          [[0.98, 0.955], [1.0, 0.6], [0.9, 0.27], [-0.48, 0.27], [-0.49, 0.6], [-0.48, 0.975]],
          [[-1.64, 0.995], [-1.66, 0.62], [-1.5, 0.48], [-1.42, 0.27], [-0.48, 0.27]],
        ],
        top: [[[-0.82, 1.27], [0.82, 1.27], [0.9, 1.7], [0.82, 2.3], [-0.82, 2.3], [-0.9, 1.7], [-0.82, 1.27]]],
        rear: [[[-0.95, 0.76], [0.95, 0.76]]],
      },
      // `plate`: the licence plate painted into the tail's recess (rear view, metres)
      livery: {
        door: [0.0, 0.62],
        shoulder: 0.84,
        cabin: { x: 0.72, z0: -2.0, z1: 1.24 },
        plate: { x: 0, y: 0.63, w: 0.31, h: 0.155, text: 'EV 2077' },
      },
      tailLights: [
        [0.75, 0.905, -2.46],
        [-0.75, 0.905, -2.46],
      ],
      headLights: [
        [0.67, 0.462, 2.45],
        [-0.67, 0.462, 2.45],
      ],
      // (no exhausts: the game wants one point for its boost effects, hidden under the tail)
      exhausts: [[0, 0.3, -2.4]],
    },
  };
}
