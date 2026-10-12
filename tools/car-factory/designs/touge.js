// TOUGE - an 80s lightweight hatchback that lives on mountain passes. A long flat hood with the
// pop-up headlights raised, a wedge nose over a slim grille slot, a tall glasshouse ending in a
// liftback with a lip spoiler, a full-width tail-light band, and a rub strip down the flanks at the
// two-tone line. Right-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdBox, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildTouge() {
  const WH = {
    front: { z: 1.2, y: 0.3, x: 0.7, r: 0.3, w: 0.2 },
    rear: { z: -1.2, y: 0.3, x: 0.7, r: 0.3, w: 0.2 },
  };
  const GAP = 0.035; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): bumper, grille slot, the long hood, beltline, tail
  const bodySide = new Profile2D(
    [
      [1.95, 0.16, 1],
      [2.06, 0.18],
      [2.115, 0.24],
      [2.13, 0.34],
      [2.125, 0.47],
      [2.105, 0.505, 1],
      [2.085, 0.52, 1],
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
      [-2.075, 0.57],
      [-2.09, 0.5],
      [-2.09, 0.3],
      [-2.07, 0.22],
      [-1.98, 0.17, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a slab-sided box with rounded corners
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.13],
      [0.45, 2.125],
      [0.68, 2.1],
      [0.775, 2.05],
      [0.805, 1.95],
      [0.812, 1.7],
      [0.815, 1.2],
      [0.815, 0.4],
      [0.815, -0.6],
      [0.815, -1.3],
      [0.81, -1.8],
      [0.795, -1.98],
      [0.74, -2.06],
      [0.5, -2.09],
      [0, -2.095],
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
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 0.88],
      [0.5, 0.86],
      [0.66, 0.74],
      [0.72, 0.4],
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
    [0, 0.775],
    [0.46, 0.765],
    [0.56, 0.62],
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

  // cross-section: slab sides that tuck in at the sills, a soft crease at the beltline and a
  // touch of tumblehome above it
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.3) return 0.955 + 0.045 * smoothstep(0.14, 0.3, y);
    return 1.0 - ramp(y - 0.74, 0.012) * 0.22;
  };

  // the raised pop-up lamp pods on the hood corners
  const POD = { x: 0.55, y: 0.738, z: 1.85, hx: 0.165, hy: 0.072, hz: 0.085 };

  // un-cut outer skin, lamp pods included (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.045);
    const tilt = Math.max(0, y - 0.85) * 0.35;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.05);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    const d = smin(dBody, dCab, 0.025);
    if (z < 1.7 || z > 2.0 || y < 0.6 || y > 0.85 || ax < 0.3 || ax > 0.8) return d;
    return smin(d, sdRoundBox(ax - POD.x, y - POD.y, z - POD.z, POD.hx, POD.hy, POD.hz, 0.014), 0.008);
  }

  const acc = new Acc();
  const po = { wall: false };
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);

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
    // door mirrors at the front corner of the door glass
    if (z > 0.5 && z < 0.8 && y > 0.8 && y < 1.0 && ax > 0.72) {
      acc.add(sdRoundBox(ax - 0.9, y - 0.915, z - 0.63, 0.07, 0.048, 0.04, 0.03), MAT.paint, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.8, 0.885, 0.655, 0.87, 0.905, 0.64, 0.016), MAT.trim, 0.01);
    }
    // single exhaust under the rear bumper, on the right
    if (z < -1.85 && y < 0.32 && x < -0.3 && x > -0.6) {
      acc.add(sdCylZ(x + 0.45, y - 0.2, z + 2.05, 0.042, 0.08), MAT.chrome, 0.004);
      acc.cut(sdCylZ(x + 0.45, y - 0.2, z + 2.05, 0.032, 0.2), MAT.exhaust);
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
    // lamp faces in the pods
    if (z > 1.85 && y > 0.66 && y < 0.82 && ax > 0.37 && ax < 0.73) {
      const reg = Math.max(Math.abs(ax - POD.x) - 0.142, Math.abs(y - POD.y) - 0.05);
      acc.cut(Math.max(reg, z - (POD.z + POD.hz + 0.01), POD.z + POD.hz - 0.022 - z), MAT.head, 0.004);
    }
    // grille slot between the bumper and the hood (parking lamps at its ends), and an intake in
    // the bumper
    if (z > 1.95 && y > 0.2 && y < 0.64) {
      const slot = Math.max(ax - 0.75, Math.abs(y - 0.565) - 0.026);
      const intake = Math.max(ax - 0.42, Math.abs(y - 0.3) - 0.035);
      const d = pocket(Math.min(slot, intake), sh, 0.05, po);
      acc.cut(d, po.wall ? MAT.trim : ax > 0.645 && y > 0.45 ? MAT.head : MAT.grille, 0.004);
    }
    // tail-light band: lamps at the sides, a black garnish between them
    if (z < -1.9 && y > 0.6 && y < 0.88) {
      const band = Math.max(ax - 0.765, Math.abs(y - 0.745) - 0.062);
      const d = pocket(band, sh, 0.024, po);
      acc.cut(d, po.wall ? MAT.trim : ax > 0.31 ? MAT.tail : MAT.trim, 0.003);
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
    }
    out.m = acc.m;
    return acc.d;
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
        [0.425, 0.697, 1],
        [0.675, 0.697, 1],
        [0.675, 0.779, 1],
        [0.425, 0.779, 1],
      ].map(([u, v, s]) => [u * sx, v, s]),
      depth: 0.016,
      rings: 3,
      step: 0.01,
    });
    // parking lamps at the ends of the grille slot
    decals.push({
      kind: 'ribbon',
      mat: MAT.lens,
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
          [0.35 * sx, v],
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
          [[-0.74, 0.82], [0.74, 0.82], [0.76, 1.6], [0.74, 2.02], [-0.74, 2.02], [-0.76, 1.6], [-0.74, 0.82]],
          [[-0.68, -0.88], [0.68, -0.88], [0.7, -1.4], [0.66, -1.95], [-0.66, -1.95], [-0.7, -1.4], [-0.68, -0.88]],
        ],
        front: [[[-0.8, 0.505], [0.8, 0.505]]],
        rear: [[[-0.8, 0.585], [0.8, 0.585]]],
      },
      livery: { door: [0.12, 0.675], shoulder: 0.72, cabin: { x: 0.6, z0: -1.9, z1: 0.8 }, panda: { side: 0.475, front: 0.51, rear: 0.59 } },
      tailLights: [
        [0.55, 0.745, -2.05],
        [-0.55, 0.745, -2.05],
      ],
      headLights: [
        [0.55, 0.738, 1.94],
        [-0.55, 0.738, 1.94],
      ],
      exhausts: [[-0.45, 0.2, -2.12]],
    },
  };
}
