// SPECTER LMP - Le Mans hypercar. A full-width front with a raised hood between muscular front
// fenders, slim headlights at the fender corners, a central intake with an aero blade, brake
// ducts and a louvred hood vent; a narrow bubble canopy, deep side pods, a shark fin running into
// a full-width wing with tall end plates, louvred fenders and LED light blades at the rear.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdBox, sdRoundBox, sdCylZ } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildSpecter() {
  const WH = {
    front: { z: 1.45, y: 0.36, x: 0.84, r: 0.36, w: 0.31 },
    rear: { z: -1.45, y: 0.36, x: 0.84, r: 0.36, w: 0.34 },
  };
  const GAP = 0.04;
  // headlights (front view, u = |x|, v = y): a slim slit across the upright face of each fender
  // front, rising toward the outside, with a short hook where the LED eyelid turns down at the corner
  const SLANT = Math.atan(0.08);
  const HEAD = { cu: 0.765, cv: 0.405, hw: 0.166, hh: 0.03, cos: Math.cos(SLANT), sin: Math.sin(SLANT) };
  const HOOK = [0.918, 0.417, 0.914, 0.37];
  const segDist = (px, py, ax, ay, bx, by) => {
    const bax = bx - ax;
    const bay = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * bax + (py - ay) * bay) / (bax * bax + bay * bay)));
    return Math.hypot(px - ax - bax * t, py - ay - bay * t);
  };

  // ------------------------------------------------------------------ main body: keel, side pods,
  // rear fenders and engine cover
  const bodySide = new Profile2D(
    [
      [2.465, 0.11, 1],
      [2.5, 0.19],
      [2.505, 0.28],
      [2.48, 0.355],
      [2.42, 0.415],
      [2.27, 0.47],
      [2.02, 0.52],
      [1.72, 0.555],
      [1.42, 0.58],
      [1.12, 0.605],
      [0.82, 0.632],
      [0.4, 0.665],
      [-0.4, 0.705],
      [-1.0, 0.765],
      [-1.45, 0.865],
      [-1.9, 0.85],
      [-2.3, 0.83],
      [-2.44, 0.81, 1],
      [-2.475, 0.62],
      [-2.46, 0.45, 1],
      [-2.15, 0.24],
      [-1.85, 0.11, 1],
    ],
    { band: 0.2 },
  );
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.495],
      [0.3, 2.485],
      [0.55, 2.46],
      [0.75, 2.415],
      [0.88, 2.35],
      [0.95, 2.255],
      [0.975, 2.1],
      [0.965, 1.85],
      [0.8, 1.52],
      [0.6, 1.2],
      [0.86, 0.9, 1],
      [0.94, 0.75],
      [0.95, 0.2],
      [0.965, -0.6],
      [1.01, -1.0],
      [1.03, -1.45],
      [1.02, -1.95],
      [0.97, -2.32],
      [0.82, -2.47, 1],
      [0, -2.48],
    ]),
    { band: 0.2 },
  );
  // front fenders: wedges that start at bumper height and climb over the wheels, so the nose
  // reads as one full-width front instead of two pods standing on a shelf
  const podSide = new Profile2D(
    [
      [2.37, 0.2, 1],
      [2.425, 0.3],
      [2.44, 0.38],
      [2.415, 0.455],
      [2.33, 0.525],
      [2.16, 0.605],
      [1.93, 0.685],
      [1.69, 0.755],
      [1.45, 0.795],
      [1.15, 0.795],
      [0.85, 0.73],
      [0.64, 0.58],
      [0.6, 0.3, 1],
      [0.72, 0.16, 1],
    ],
    { band: 0.2 },
  );
  // outer outline only: the inner side is the leaning wall below
  const podPlan = new Profile2D(
    [
      [0.3, 2.3],
      [0.6, 2.38],
      [0.76, 2.405],
      [0.9, 2.37],
      [0.975, 2.27],
      [1.015, 2.0],
      [1.03, 1.6],
      [1.03, 1.3],
      [1.0, 0.8],
      [0.9, 0.62],
      [0.3, 0.62],
    ],
    { band: 0.2 },
  );
  // fenders tuck in toward the top on the outside; on the inside the wall leans outward and
  // sweeps down into the hood
  const FENDER_X = 0.79;
  const fenderK = (y) => 1 - Math.max(0, y - 0.45) * 0.5;
  const LEAN = 0.5;
  const LEAN_C = 1 / Math.hypot(1, LEAN);
  const fenderIn = (z) => 0.555 + 0.105 * smoothstep(1.3, 0.7, z);
  // bubble canopy
  const cabSide = new Profile2D(
    [
      [1.22, 0.5, 1],
      [1.17, 0.6],
      [0.85, 0.8],
      [0.45, 0.965],
      [0.05, 1.045],
      [-0.4, 1.06],
      [-0.85, 1.015],
      [-1.25, 0.925],
      [-1.65, 0.845],
      [-1.95, 0.8, 1],
      [-1.95, 0.5, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.27],
      [0.3, 1.22],
      [0.5, 0.92],
      [0.585, 0.4],
      [0.585, -0.3],
      [0.5, -0.9],
      [0.32, -1.5],
      [0.1, -1.92],
      [0, -1.97],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics and aero parts
  const small = { band: 0.12, res: 0.003 };
  const WINDSHIELD = mirrorU([
    [0, 1.19],
    [0.38, 1.12],
    [0.53, 0.75],
    [0.55, 0.22],
    [0.44, 0.0],
    [0, -0.03],
  ]);
  const SIDE_WIN = [
    [0.55, 0.845, 1],
    [0.2, 0.955],
    [-0.3, 0.985],
    [-0.72, 0.945, 1],
    [-0.55, 0.865],
    [0.0, 0.84, 1],
  ];
  const windshield = new Profile2D(WINDSHIELD, small);
  const sideWin = new Profile2D(SIDE_WIN, small);
  const fin = new Profile2D(
    [
      [-0.75, 1.03],
      [-1.4, 1.065],
      [-2.05, 1.09],
      [-2.34, 1.09, 1],
      [-2.34, 0.75, 1],
      [-0.8, 0.84, 1],
    ],
    { band: 0.12, res: 0.003 },
  );
  const wingFoil = new Profile2D(
    [
      [-2.0, 1.005],
      [-2.06, 1.028],
      [-2.18, 1.04],
      [-2.32, 1.047],
      [-2.47, 1.062, 1],
      [-2.32, 1.02],
      [-2.18, 1.005],
      [-2.06, 0.998],
    ],
    { band: 0.1, res: 0.002 },
  );
  const endPlate = new Profile2D(
    [
      [-1.86, 0.84, 1],
      [-1.98, 1.11, 1],
      [-2.49, 1.13, 1],
      [-2.49, 0.79, 1],
    ],
    small,
  );

  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k)));
  const sec = (y) => {
    if (y < 0.25) return 0.95 + 0.05 * smoothstep(0.1, 0.25, y);
    return 1 - ramp(y - 0.62, 0.015) * 0.25;
  };

  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0, pod: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    let dBody = smax(bS, bP, 0.04);
    let pod = 1;
    if (z > 0.4 && ax > 0.2) {
      const k = fenderK(y);
      const outer = smax(podSide.sample(z, y), podPlan.sample(FENDER_X + (ax - FENDER_X) / k, z) * k, 0.05);
      const inner = (fenderIn(z) + (y - 0.5) * LEAN - ax) * LEAN_C;
      pod = smax(outer, inner, 0.14);
      dBody = smin(dBody, pod, 0.06 + 0.12 * smoothstep(2.42, 2.1, z));
    }
    const tilt = Math.max(0, y - 0.7) * 0.55;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.1);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    S.pod = pod;
    return smin(dBody, dCab, 0.05);
  }

  const acc = new Acc();
  const po = { wall: false };
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { bS, bP, dBody, dCab, cS, cP, pod } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // carbon splitter lip just proud of the bumper
    if (z > 1.85 && y < 0.2) {
      acc.add(Math.max(bP - 0.045, Math.abs(y - 0.105) - 0.012, 1.86 - z), MAT.carbon, 0.015);
    }
    // shark fin
    if (ax < 0.05 && y > 0.7 && z < -0.6 && z > -2.45) {
      acc.add(Math.max(fin.sample(z, y), ax - 0.007), MAT.carbon, 0.015);
    }
    // rear wing + end plates
    if (y > 0.75 && z < -1.8 && z > -2.55) {
      acc.add(Math.max(wingFoil.sample(z, y), ax - 0.99), MAT.carbon, 0.004);
      acc.add(Math.max(endPlate.sample(z, y), Math.abs(ax - 0.995) - 0.008), MAT.carbon, 0.006);
    }
    // diffuser strakes
    if (z < -1.7 && y < 0.5) {
      for (const xf of [0.15, 0.4, 0.66]) {
        acc.add(Math.max(sdBox(ax - xf, y - 0.3, z + 2.15, 0.008, 0.2, 0.36), -bS - 0.004, bS - 0.1), MAT.carbon);
      }
    }
    // mirrors on the fender pods
    if (z > 0.6 && z < 1.0 && y > 0.7 && y < 1.0 && ax > 0.6) {
      acc.add(sdRoundBox(ax - 0.84, y - 0.9, z - 0.84, 0.075, 0.035, 0.045, 0.028), MAT.carbon, 0.004);
      acc.add(sdRoundBox(ax - 0.82, y - 0.8, z - 0.86, 0.008, 0.09, 0.03, 0.006), MAT.carbon, 0.01);
    }

    // ---------------------------------------------------------------- cuts
    // cockpit: narrow prototype tub under the canopy, driver laid back
    if (y > 0.18 && z < 1.1 && z > -0.95 && ax < 0.7) {
      const tub = Math.max(dBody + 0.035, ax - 0.52);
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.24 - y, z - 1.0, -0.8 - z);
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.27, seatZ: -0.25, floorY: 0.24, dashZ: 0.72, dashY: 0.64, dashW: 0.48, wheelZ: 0.44, wheelY: 0.66, recline: 0.55 });
    }
    if (y > 0.62 && z < 1.3 && z > -1.0) {
      const onCab = dCab - dBody + 0.004;
      let reg = Math.max(windshield.sample(ax, z), cP - cS + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(sideWin.sample(z, y), cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
    }
    // fender fronts: slim headlight slit with a short hook at the corner, brake duct below it
    if (z > 2.1 && y > 0.14 && y < 0.62 && ax > 0.55 && ax < 1.0) {
      const lu = ax - HEAD.cu;
      const lv = y - HEAD.cv;
      const su = lu * HEAD.cos + lv * HEAD.sin;
      const sv = lv * HEAD.cos - lu * HEAD.sin;
      const slit = sdRoundBox(su, sv, 0, HEAD.hw, HEAD.hh, 1, 0.02);
      const hook = segDist(ax, y, HOOK[0], HOOK[1], HOOK[2], HOOK[3]) - 0.015;
      acc.cut(pocket(smin(slit, hook, 0.015), sh, 0.026, po), po.wall ? MAT.trim : MAT.head, 0.003);
      const duct = sdRoundBox(ax - 0.77, y - 0.232, 0, 0.15, 0.062, 1, 0.026);
      acc.cut(pocket(duct, sh, 0.12, po), po.wall ? MAT.trim : MAT.grille, 0.005);
      const inner = Math.max(sh + 0.012, -(sh + 0.11));
      for (const xf of [0.72, 0.82]) acc.add(Math.max(duct, Math.abs(ax - xf) - 0.006, inner), MAT.carbon, 0.003);
    }
    // central intake, split by a body-colour aero blade
    if (z > 2.2 && y < 0.36 && ax < 0.56) {
      const mouth = sdRoundBox(x, y - 0.235, 0, 0.44 - (y - 0.16) * 0.25, 0.075, 1, 0.03);
      acc.cut(pocket(mouth, sh, 0.14, po), po.wall ? MAT.trim : MAT.grille, 0.006);
      const inner = Math.max(sh + 0.014, -(sh + 0.12));
      acc.add(Math.max(mouth, Math.abs(y - 0.25) - 0.0075, inner), MAT.paint, 0.004);
    }
    // louvred vent on the hood
    if (z > 1.8 && z < 2.2 && ax < 0.34 && y > 0.3) {
      const vent = sdRoundBox(x, 0, z - 2.0, 0.27, 1, 0.14, 0.05);
      acc.cut(pocket(vent, sh, 0.05, po), po.wall ? MAT.trim : MAT.grille, 0.004);
      for (const zs of [1.93, 2.0, 2.07]) acc.add(Math.max(vent, Math.abs(z - zs) - 0.007, sh + 0.004, -(sh + 0.045)), MAT.carbon, 0.002);
    }
    // louvres on top of the fender pods
    if (pod < 0.05 && z > 0.8 && z < 1.5 && y > 0.6) {
      const reg = sdRoundBox(ax - 0.865, 0, z - 1.12, 0.095, 1, 0.2, 0.04);
      acc.cut(pocket(reg, sh, 0.03, po), po.wall ? MAT.trim : MAT.grille, 0.003);
      for (let i = 0; i < 6; i++) {
        const zs = 0.96 + i * 0.064;
        acc.add(Math.max(reg, Math.abs(z - zs) - 0.008, sh + 0.004, -(sh + 0.029)), MAT.carbon, 0.002);
      }
    }
    // side pod intakes behind the front wheels
    if (z > 0.6 && z < 1.3 && y < 0.6 && ax > 0.5) {
      const reg = sdRoundBox(ax - 0.78, y - 0.36, 0, 0.15, 0.15, 1, 0.05);
      acc.cut(pocket(reg, bP, 0.3, po), po.wall ? MAT.trim : MAT.grille, 0.008);
    }
    // rear: full-width light bar, corner blades, open mesh panel with the exhausts
    if (z < -2.0 && y > 0.4 && y < 0.86) {
      let reg = Math.max(ax - 0.95, Math.abs(y - 0.785) - 0.014);
      reg = Math.min(reg, Math.max(Math.abs(ax - 0.93) - 0.016, Math.abs(y - 0.66) - 0.13));
      acc.cut(pocket(reg, sh, 0.02, po), po.wall ? MAT.trim : MAT.tail, 0.003);
      const mesh = sdRoundBox(x, y - 0.6, 0, 0.82, 0.13, 1, 0.04);
      acc.cut(pocket(mesh, sh, 0.08, po), po.wall ? MAT.trim : MAT.grille, 0.006);
      if (ax < 0.3) {
        acc.add(sdCylZ(ax - 0.12, y - 0.6, z + 2.43, 0.05, 0.05), MAT.chrome, 0.003);
        acc.cut(sdCylZ(ax - 0.12, y - 0.6, z + 2.43, 0.04, 0.2), MAT.exhaust);
      }
    }
    // wheel arches
    if (ax > 0.5 && y < 0.9) {
      if (Math.abs(z - WH.front.z) < 0.56) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.56) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.6 && z < 1.0 && y > 0.7 && y < 1.0 && ax > 0.6) {
      acc.cut(sdRoundBox(ax - 0.84, y - 0.9, z - 0.79, 0.064, 0.026, 0.01, 0.008), MAT.chrome, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.118) acc.m = MAT.trim;
      else if (y < 0.24 && ax > 0.4 && z < 0.95 && z > -1.1) acc.m = MAT.carbon; // side pod sills
      else if (y < 0.15 && z > 1.8) acc.m = MAT.carbon;
      else if (z < -1.7 && y < 0.46 && bS > bP - 0.005) acc.m = MAT.carbon;
    }
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ light strips & lenses
  const decals = [
    { kind: 'panel', mat: MAT.window, view: VIEW.left, outline: SIDE_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.right, outline: SIDE_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 },
  ];
  for (const sx of [1, -1]) {
    // LED eyelid along the top of the headlight slit, hooking down at the outer corner
    decals.push({
      kind: 'ribbon',
      mat: MAT.drl,
      view: VIEW.front,
      path: [
        [0.625, 0.4128],
        [0.75, 0.4228],
        [0.87, 0.4324],
        [0.902, 0.4278],
        [0.915, 0.407],
        [0.9145, 0.38],
        [0.9138, 0.372],
      ].map(([u, v]) => [u * sx, v]),
      width: 0.011,
      depth: 0.008,
    });
    // two projector lenses in chrome bezels below the eyelid
    for (const [u, v] of [
      [0.68, 0.3902],
      [0.77, 0.3974],
    ]) {
      decals.push({ kind: 'disc', mat: MAT.chrome, view: VIEW.front, center: [u * sx, v], radius: 0.019, depth: 0.019, segments: 32 });
      decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, v], radius: 0.0145, depth: 0.016, segments: 32 });
    }
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.93 * sx, 0.78],
        [0.93 * sx, 0.55],
      ],
      width: 0.01,
      depth: 0.007,
      sharp: true,
    });
  }
  decals.push({
    kind: 'ribbon',
    mat: MAT.tailglow,
    view: VIEW.rear,
    path: [
      [-0.92, 0.785],
      [0.92, 0.785],
    ],
    width: 0.007,
    depth: 0.008,
  });

  return {
    id: 'specter',
    sdf,
    shell,
    decals,
    bounds: { min: [-1.15, 0.0, -2.62], max: [1.15, 1.25, 2.62] },
    meta: {
      wheels: WH,
      panels: {
        side: [
          [[0.66, 0.9], [0.62, 0.7], [-0.72, 0.72], [-0.8, 0.86]],
          [[0.62, 0.24], [0.62, 0.6]],
        ],
        top: [
          [[-0.62, -0.95], [0.62, -0.95]],
          [[-0.5, 1.3], [0.5, 1.3]],
        ],
      },
      livery: { door: [-0.35, 0.43], shoulder: 0.58, cabin: { x: 0.56, z0: -1.9, z1: 1.25 } },
      tailLights: [
        [0.85, 0.785, -2.47],
        [-0.85, 0.785, -2.47],
      ],
      headLights: [
        [0.725, 0.394, 2.39],
        [-0.725, 0.394, 2.39],
      ],
      exhausts: [
        [0.12, 0.6, -2.5],
        [-0.12, 0.6, -2.5],
      ],
    },
  };
}
