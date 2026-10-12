// VOLT GT - mid-engine grand tourer. Fenders that crown above a sunken hood, a cab-forward
// glasshouse with a hard shoulder line, muscular rear haunches fed by side intakes, a ducktail
// deck, a full-width light bar and a big diffuser.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdBox, sdRoundBox, sdCylZ, sdCapsule, sdEllipsoid } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildVolt() {
  const WH = {
    front: { z: 1.31, y: 0.338, x: 0.83, r: 0.338, w: 0.26 },
    rear: { z: -1.35, y: 0.35, x: 0.82, r: 0.35, w: 0.31 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): crown of the fenders, beltline, deck
  const bodySide = new Profile2D(
    [
      [2.1, 0.105, 1],
      [2.225, 0.14],
      [2.258, 0.26],
      [2.248, 0.37],
      [2.205, 0.445],
      [2.09, 0.52],
      [1.88, 0.6],
      [1.62, 0.7],
      [1.32, 0.775],
      [1.0, 0.79],
      [0.6, 0.805],
      [0.0, 0.84],
      [-0.6, 0.885],
      [-1.15, 0.945],
      [-1.7, 0.99],
      [-2.08, 1.008],
      [-2.19, 1.028, 1],
      [-2.238, 0.965],
      [-2.252, 0.8],
      [-2.245, 0.56],
      [-2.225, 0.5, 1],
      [-2.05, 0.3],
      [-1.75, 0.15],
      [-1.55, 0.105, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): pinched waist, front fenders and wider rear haunches
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.258],
      [0.38, 2.24],
      [0.66, 2.18],
      [0.84, 2.06],
      [0.935, 1.86],
      [0.968, 1.62],
      [0.978, 1.34],
      [0.965, 1.06],
      [0.938, 0.8],
      [0.925, 0.3],
      [0.935, -0.25],
      [0.968, -0.75],
      [0.995, -1.15],
      [1.0, -1.42],
      [0.99, -1.72],
      [0.955, -2.0],
      [0.87, -2.18],
      [0.58, -2.25],
      [0, -2.262],
    ]),
    { band: 0.2 },
  );
  // glasshouse
  const cabSide = new Profile2D(
    [
      [1.05, 0.62, 1],
      [1.0, 0.7],
      [0.6, 0.86],
      [0.24, 1.05],
      [0.1, 1.115],
      [-0.15, 1.155],
      [-0.55, 1.16],
      [-0.92, 1.115],
      [-1.25, 1.05],
      [-1.6, 1.0],
      [-1.88, 0.975, 1],
      [-1.88, 0.7, 1],
      [1.05, 0.55, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.06],
      [0.5, 1.045],
      [0.72, 0.9],
      [0.81, 0.55],
      [0.845, 0.0],
      [0.825, -0.6],
      [0.74, -1.15],
      [0.6, -1.55],
      [0.33, -1.86],
      [0, -1.92],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  const SIDE_WIN = [
    [0.72, 0.815, 1],
    [0.55, 0.862],
    [0.3, 0.975],
    [0.1, 1.045],
    [-0.15, 1.085],
    [-0.5, 1.09],
    [-0.85, 1.05],
    [-1.05, 0.995],
    [-1.13, 0.965, 1],
    [-0.85, 0.94],
    [-0.4, 0.89],
    [0.2, 0.85],
    [0.6, 0.822],
  ];
  const WINDSHIELD = mirrorU([
    [0, 0.995],
    [0.5, 0.975],
    [0.64, 0.86],
    [0.67, 0.55],
    [0.63, 0.26],
    [0, 0.22],
  ]);
  const sideWin = new Profile2D(SIDE_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -0.98],
      [0.5, -1.0],
      [0.53, -1.4],
      [0.42, -1.7],
      [0, -1.76],
    ]),
    small,
  );
  const sideIntake = new Profile2D(
    [
      [-0.28, 0.64, 1],
      [-0.86, 0.7],
      [-0.92, 0.39, 1],
      [-0.5, 0.42],
    ],
    small,
  );
  // centre air intake as seen from the front (x, y)
  const frontMouth = new Profile2D(
    mirrorU([
      [0, 0.338],
      [0.34, 0.334],
      [0.47, 0.3],
      [0.48, 0.2],
      [0.44, 0.162],
      [0, 0.158],
    ]),
    small,
  );
  const hoodVent = new Profile2D(
    [
      [0.14, 1.84, 1],
      [0.4, 1.8, 1],
      [0.44, 1.58, 1],
      [0.18, 1.62, 1],
    ],
    small,
  );
  const frontSideIntake = new Profile2D(
    [
      [0.54, 0.165, 1],
      [0.84, 0.165],
      [0.905, 0.37, 1],
      [0.58, 0.325, 1],
    ],
    small,
  );
  // headlight as seen from the front (|x|, y): slim, swept up toward the corner
  const headFoot = new Profile2D(
    [
      [0.4, 0.468, 1],
      [0.55, 0.488],
      [0.72, 0.514],
      [0.86, 0.542],
      [0.915, 0.535, 1],
      [0.9, 0.505],
      [0.74, 0.468],
      [0.56, 0.446],
      [0.43, 0.442],
    ],
    { band: 0.08, res: 0.002 },
  );

  // cross-section: tucked sills, vertical flanks, a crisp shoulder line that kicks up over the
  // rear haunches, tumblehome above it
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y, z) => {
    if (y < 0.3) return 0.94 + 0.06 * smoothstep(0.1, 0.3, y);
    const shoulder = 0.58 + 0.07 * smoothstep(0.3, -1.6, z);
    return 1.0 - ramp(y - shoulder, 0.011) * 0.3;
  };
  // the hood sinks between the crowned front fenders, the engine deck between the haunches
  const dip = (ax, y, z) => {
    if (y < 0.3) return 0;
    const front = smoothstep(0.75, 1.0, z) * (1 - smoothstep(1.9, 2.2, z)) * 0.085 * (1 - smoothstep(0.28, 0.72, ax));
    const rear = (1 - smoothstep(-1.25, -1.05, z)) * smoothstep(-2.16, -1.95, z) * 0.025 * (1 - smoothstep(0.35, 0.8, ax));
    return (front + rear) * smoothstep(0.3, 0.45, y);
  };

  // un-cut outer skin (also used to lay the light strips onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y, z);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y + dip(ax, y, z));
    const dBody = smax(bS, bP, 0.05);
    const tilt = Math.max(0, y - 0.78) * 0.42;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.06);
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
    const { bS, bP, dBody, dCab, cS, cP } = S;
    acc.set(sh, MAT.paint);

    // sculpted scoop along the doors that deepens into the side intake
    if (ax > 0.6 && y > 0.2 && y < 0.75 && z > -1.1 && z < 0.7) {
      acc.cut(sdEllipsoid(ax - 1.19, y - 0.48, z + 0.2, 0.3, 0.19, 0.85), MAT.paint, 0.07);
    }

    // ---------------------------------------------------------------- add-ons
    // side skirt blades (trimmed by the wheel arches below)
    if (y < 0.25 && ax > 0.7 && Math.abs(z) < 1.15) {
      acc.add(sdRoundBox(ax - 0.885, y - 0.13, z, 0.045, 0.016, 1.05, 0.012), MAT.carbon, 0.025);
    }
    // front splitter following the nose
    if (z > 1.85 && y < 0.2) {
      acc.add(Math.max(bodyPlan.sample(ax, z) - 0.035, Math.abs(y - 0.116) - 0.011, 1.95 - z), MAT.carbon, 0.01);
    }
    // diffuser strakes under the rear ramp
    if (z < -1.5 && y < 0.53) {
      for (const xf of [0, 0.27, 0.54]) {
        acc.add(Math.max(sdBox(ax - xf, y - 0.31, z + 1.95, 0.008, 0.2, 0.32), -bS - 0.004, bS - 0.09), MAT.carbon);
      }
    }
    // door mirrors on stalks from the door tops
    if (z > 0.5 && z < 0.8 && y > 0.75 && y < 0.98 && ax > 0.78) {
      acc.add(sdRoundBox(ax - 1.0, y - 0.893, z - 0.62, 0.095, 0.046, 0.042, 0.036), MAT.paint, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.845, 0.795, 0.675, 0.935, 0.875, 0.632, 0.015), MAT.trim, 0.012);
    }

    // ---------------------------------------------------------------- cuts
    // cockpit: hollow the glasshouse and the tub below it (2.5-3.5 cm walls), then furnish it
    if (y > 0.2 && z < 1.0 && z > -1.05 && ax < 0.9) {
      const tub = Math.max(dBody + 0.035, ax - 0.74);
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.27 - y, z - 0.9, -0.86 - z);
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.37, seatZ: -0.33, floorY: 0.27, dashZ: 0.62, dashY: 0.7, dashW: 0.7, wheelZ: 0.34, wheelY: 0.7, recline: 0.38 });
    }
    // window openings through the cabin walls (separate glass panes sit in them), and the
    // engine-cover glass as a shallow recess
    if (y > 0.62 && z < 1.12 && z > -1.95) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      let reg = Math.max(sideWin.sample(z, y), cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // hood extractor vents
    if (z > 1.45 && z < 1.95 && ax < 0.55 && y > 0.45) {
      const d = pocket(hoodVent.sample(ax, z), sh, 0.045, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.grille, 0.005);
    }
    // front intakes: wide centre mouth split by a body-colour aero blade, finned side intakes
    // (depth measured from the nose face)
    if (z > 1.8 && y < 0.42) {
      const mouth = frontMouth.sample(x, y);
      const side = frontSideIntake.sample(ax, y);
      const d = pocket(Math.min(mouth, side), bP, 0.13, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.grille, 0.006);
      const inner = Math.max(bP + 0.014, -(bP + 0.125));
      acc.add(Math.max(mouth, Math.abs(y - 0.252) - 0.0075, inner), MAT.paint, 0.004);
      for (const xf of [0.66, 0.76]) acc.add(Math.max(side, Math.abs(ax - xf) - 0.006, inner), MAT.carbon, 0.003);
    }
    // headlight pockets (LED strip + projector lenses are separate decal geometry)
    if (z > 1.75 && y > 0.4 && y < 0.6 && ax > 0.3) {
      const d = pocket(headFoot.sample(ax, y), sh, 0.03, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.head, 0.004);
    }
    // side intakes ahead of the rear wheels, split by a carbon strake
    if (ax > 0.6 && z < -0.15 && z > -1.05 && y > 0.3 && y < 0.8) {
      const reg = sideIntake.sample(z, y);
      const d = pocket(reg, bP, 0.11, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.grille, 0.008);
      const strake = Math.max(reg, Math.abs(y - 0.545 - (z + 0.6) * 0.07) - 0.008, bP + 0.003, -(bP + 0.1));
      acc.add(strake, MAT.carbon, 0.004);
    }
    // tail lights: full-width bar with L-shaped corners
    if (z < -1.9 && y > 0.68 && y < 0.95) {
      let reg = Math.max(ax - 0.81, Math.abs(y - 0.866) - 0.021);
      reg = Math.min(reg, Math.max(Math.abs(ax - 0.79) - 0.022, Math.abs(y - 0.8) - 0.085));
      const d = pocket(reg, sh, 0.026, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.tail, 0.003);
    }
    // rear mesh panel with twin centre exhausts
    if (z < -1.9 && y > 0.5 && y < 0.84) {
      const d = pocket(sdRoundBox(x, y - 0.69, 0, 0.66, 0.11, 1, 0.035), sh, 0.06, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.grille, 0.005);
      if (ax < 0.3) {
        acc.add(sdCylZ(ax - 0.13, y - 0.665, z + 2.22, 0.054, 0.04), MAT.chrome, 0.003);
        acc.cut(sdCylZ(ax - 0.13, y - 0.665, z + 2.22, 0.043, 0.2), MAT.exhaust);
      }
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.5 && y < 0.86) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.5 && z < 0.8 && y > 0.75 && y < 0.98 && ax > 0.78) {
      acc.cut(sdRoundBox(ax - 1.0, y - 0.893, z - 0.572, 0.082, 0.036, 0.012, 0.01), MAT.chrome, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.118) acc.m = MAT.trim; // underbody
      else if (y < 0.2 && Math.abs(z) < 0.95 && ax > 0.6) acc.m = MAT.carbon; // sills
      else if (y < 0.165 && z > 1.9) acc.m = MAT.carbon; // chin
      else if (z < -1.5 && y < 0.5 && bS > bP - 0.005) acc.m = MAT.carbon; // diffuser ramp
      else if (z < -2.0 && y < 0.58 && ax < 0.8) acc.m = MAT.carbon; // lower rear fascia
    }
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, light strips, lenses
  const decals = [
    { kind: 'panel', mat: MAT.window, view: VIEW.left, outline: SIDE_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.right, outline: SIDE_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 },
  ];
  for (const sx of [1, -1]) {
    // headlight daytime-running strip along the top of the pocket, hooking down at the corner
    decals.push({
      kind: 'ribbon',
      mat: MAT.drl,
      view: VIEW.front,
      path: [
        [0.44, 0.467],
        [0.55, 0.479],
        [0.72, 0.504],
        [0.86, 0.53],
        [0.895, 0.515],
      ].map(([u, v]) => [u * sx, v]),
      width: 0.009,
      depth: 0.009,
    });
    for (const [u, v] of [
      [0.585, 0.463],
      [0.705, 0.481],
    ]) {
      decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, v], radius: 0.0135, depth: 0.017 });
    }
    // tail light L-corners
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.66 * sx, 0.866],
        [0.79 * sx, 0.866],
        [0.79 * sx, 0.73],
      ],
      width: 0.011,
      depth: 0.008,
      sharp: true,
    });
  }
  // full-width tail bar
  decals.push({
    kind: 'ribbon',
    mat: MAT.tailglow,
    view: VIEW.rear,
    path: [
      [-0.66, 0.866],
      [0.66, 0.866],
    ],
    width: 0.006,
    depth: 0.01,
  });

  return {
    id: 'volt',
    sdf,
    shell,
    decals,
    bounds: { min: [-1.2, 0.0, -2.42], max: [1.2, 1.3, 2.42] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [
          [[0.74, 0.82], [0.715, 0.55], [0.69, 0.22], [0.2, 0.2], [-0.16, 0.205], [-0.23, 0.42], [-0.27, 0.62]],
          [[-1.18, 0.865], [-1.34, 0.865], [-1.34, 0.785], [-1.18, 0.785], [-1.18, 0.865]],
          [[1.97, 0.55], [1.86, 0.43], [1.72, 0.32]],
        ],
        top: [
          [[-0.5, 1.03], [0.5, 1.03], [0.6, 1.55], [0.56, 1.98], [0.32, 2.15], [-0.32, 2.15], [-0.56, 1.98], [-0.6, 1.55], [-0.5, 1.03]],
          [[-0.6, -0.93], [0.6, -0.93], [0.63, -1.5], [0.52, -1.84], [-0.52, -1.84], [-0.63, -1.5], [-0.6, -0.93]],
        ],
      },
      livery: { door: [0.18, 0.5], shoulder: 0.62, cabin: { x: 0.62, z0: -1.75, z1: 0.95 } },
      tailLights: [
        [0.72, 0.866, -2.24],
        [-0.72, 0.866, -2.24],
      ],
      headLights: [
        [0.65, 0.49, 2.12],
        [-0.65, 0.49, 2.12],
      ],
      exhausts: [
        [0.13, 0.665, -2.27],
        [-0.13, 0.665, -2.27],
      ],
    },
  };
}
