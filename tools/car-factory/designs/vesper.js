// VESPER - a 60s European grand tourer. A very long hood with a central bulge between front fenders
// that swell up over the wheels, an oval mouth in a chrome ring with one bar across it, round
// headlamps set back in scoops in the fender tips, chrome bumperettes, chrome gills behind the front wheels, a
// small bubble glasshouse set far back with chrome window frames, a fastback falling to a cut-off
// tail with four round lamps, and twin exhausts. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule, sdEllipsoid } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildVesper() {
  const WH = {
    front: { z: 1.35, y: 0.33, x: 0.7, r: 0.33, w: 0.2, rim: 0.2 },
    rear: { z: -1.15, y: 0.33, x: 0.71, r: 0.33, w: 0.21, rim: 0.2 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a low round nose, the long hood rising to the cowl, a low beltline, a
  // short deck and the cut-off tail
  const bodySide = new Profile2D(
    [
      [2.28, 0.21, 1],
      [2.35, 0.26],
      [2.39, 0.34],
      [2.41, 0.42],
      [2.39, 0.48],
      [2.33, 0.53],
      [2.22, 0.57],
      [2.02, 0.605],
      [1.7, 0.65],
      [1.3, 0.7],
      [0.9, 0.745],
      [0.5, 0.78],
      [0.1, 0.8],
      [-0.5, 0.815],
      [-1.0, 0.83],
      [-1.5, 0.835],
      [-1.85, 0.815],
      [-2.0, 0.78],
      [-2.1, 0.735],
      [-2.14, 0.68],
      [-2.15, 0.6],
      [-2.15, 0.48],
      [-2.12, 0.36],
      [-2.06, 0.27],
      [-1.96, 0.21, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a narrow round nose, fenders swelling over the wheels, a slim waist, wide
  // haunches tapering to the cut-off tail
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.41],
      [0.16, 2.395],
      [0.3, 2.34],
      [0.44, 2.25],
      [0.56, 2.12],
      [0.67, 1.96],
      [0.76, 1.74],
      [0.82, 1.5],
      [0.845, 1.3],
      [0.835, 1.0],
      [0.82, 0.6],
      [0.82, 0.0],
      [0.835, -0.5],
      [0.86, -0.9],
      [0.865, -1.2],
      [0.84, -1.55],
      [0.76, -1.85],
      [0.62, -2.03],
      [0.45, -2.12],
      [0, -2.15],
    ]),
    { band: 0.2 },
  );
  // the small glasshouse: a raked windshield, a short bubble roof and a long fastback
  const cabSide = new Profile2D(
    [
      [0.42, 0.74, 1],
      [0.36, 0.8],
      [0.1, 0.96],
      [-0.12, 1.1],
      [-0.25, 1.17],
      [-0.4, 1.22],
      [-0.6, 1.235],
      [-0.85, 1.22],
      [-1.2, 1.12],
      [-1.5, 0.99],
      [-1.75, 0.87],
      [-1.95, 0.795, 1],
      [-1.95, 0.7, 1],
      [0.42, 0.66, 1],
    ],
    { band: 0.2 },
  );
  // (straight sides right up to the windshield base, so the pillars rise from its corners)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 0.44],
      [0.5, 0.43],
      [0.62, 0.4],
      [0.66, 0.32],
      [0.68, 0.0],
      [0.68, -0.6],
      [0.66, -1.0],
      [0.6, -1.4],
      [0.48, -1.7],
      [0.3, -1.85],
      [0, -1.9],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // door glass, and a quarter window tapering into the fastback behind a slim post
  const DOOR_WIN = [
    [0.162, 0.85, 1],
    [-0.1, 1.012],
    [-0.356, 1.165],
    [-0.5, 1.178],
    [-0.62, 1.178, 1],
    [-0.62, 0.866, 1],
  ];
  const QUARTER_WIN = [
    [-0.68, 1.176, 1],
    [-0.83, 1.163],
    [-1.2, 1.04],
    [-1.6, 0.9, 1],
    [-0.68, 0.868, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 0.39],
    [0.56, 0.385],
    [0.62, 0.33],
    [0.6, 0.15],
    [0.52, -0.1],
    [0.45, -0.25],
    [0, -0.28],
  ]);
  const doorWin = new Profile2D(DOOR_WIN, small);
  const quarterWin = new Profile2D(QUARTER_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -0.9],
      [0.38, -0.92],
      [0.42, -1.2],
      [0.34, -1.52],
      [0, -1.6],
    ]),
    small,
  );
  // approximate distance to an ellipse with semi-axes a, b
  const ell = (px, py, a, b) => {
    const k0 = Math.hypot(px / a, py / b);
    const k1 = Math.hypot(px / (a * a), py / (b * b));
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(a, b);
  };
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;

  // cross-section: gently barrelled flanks, tucked in under the sills
  const sec = (y) => {
    const barrel = 1 - 0.055 * Math.min(1, ((y - 0.46) / 0.32) ** 2);
    return y < 0.28 ? barrel * (0.94 + 0.06 * smoothstep(0.14, 0.28, y)) : barrel;
  };
  // the front fenders swell up over the wheels, the hood bulges along the middle and the rear
  // haunches rise a little over the rear wheels
  const rise = (ax, z) => {
    const front = 0.075 * smoothstep(0.75, 1.15, z) * (1 - smoothstep(1.75, 2.25, z));
    const rear = 0.035 * smoothstep(-0.55, -0.9, z) * (1 - smoothstep(-1.45, -1.85, z));
    const fender = smoothstep(0.36, 0.64, ax) * (front + rear);
    const bulge = 0.028 * (1 - smoothstep(0.12, 0.3, ax)) * smoothstep(0.55, 0.9, z) * (1 - smoothstep(1.9, 2.25, z));
    return fender + bulge;
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y - rise(ax, z) * smoothstep(0.42, 0.62, y));
    // (a generous blend: every edge of the body is rounded off)
    const dBody = smax(bS, bP, 0.11);
    const tilt = Math.max(0, y - 0.84) * 0.6;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.09);
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
    // chrome bumperettes either side of the mouth and on the rear corners
    if (z > 1.95 && y > 0.31 && y < 0.42 && ax > 0.2 && ax < 0.64) {
      acc.add(Math.max(roundEdge(bodyPlan.sample(ax, z) - 0.028, Math.abs(y - 0.365) - 0.02, 0.01), 0.26 - ax, ax - 0.58, 2.0 - z), MAT.chrome, 0.008);
    }
    if (z < -1.75 && y > 0.36 && y < 0.48 && ax > 0.2 && ax < 0.7) {
      acc.add(Math.max(roundEdge(bodyPlan.sample(ax, z) - 0.025, Math.abs(y - 0.42) - 0.02, 0.01), 0.26 - ax, ax - 0.64, -1.8 - z), MAT.chrome, 0.008);
    }
    // chrome mirrors on the doors
    if (z > 0.08 && z < 0.3 && y > 0.78 && y < 0.95 && ax > 0.66) {
      acc.add(sdRoundBox(ax - 0.78, y - 0.89, z - 0.18, 0.045, 0.032, 0.05, 0.03), MAT.chrome, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.7, 0.8, 0.19, 0.77, 0.875, 0.185, 0.011), MAT.chrome, 0.008);
    }
    // chrome door pulls
    if (ax > 0.76 && y > 0.7 && y < 0.8 && z > -0.62 && z < -0.38) {
      acc.add(Math.max(sdRoundBox(0, y - 0.752, z + 0.5, 1, 0.01, 0.065, 0.008), sh - 0.007, -(sh + 0.012)), MAT.chrome, 0.003);
    }
    // twin exhausts under the tail
    if (z < -1.95 && y < 0.34 && ax > 0.1 && ax < 0.3) {
      acc.add(sdCylZ(ax - 0.2, y - 0.255, z + 2.12, 0.036, 0.08), MAT.chrome, 0.004);
      acc.cut(sdCylZ(ax - 0.2, y - 0.255, z + 2.12, 0.027, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, two buckets and a parcel shelf behind
    if (y > 0.2 && z < 0.42 && z > -1.5 && ax < 0.8) {
      const tub = Math.max(dBody + 0.035, ax - 0.74);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.23 - y, z - 0.36, -1.35 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.33, seatZ: -0.5, floorY: 0.23, dashZ: 0.2, dashY: 0.72, dashW: 0.64, wheelZ: -0.04, wheelY: 0.76, recline: 0.38 });
    }
    // window openings through the cabin walls in chrome frames (glass panes sit in them); the
    // fastback glass is a shallow recess
    if (y > 0.82 && z < 0.45 && z > -1.9) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = cS - cP + 0.01; // negative on the sides of the glasshouse
      let reg = Math.max(Math.min(doorWin.sample(z, y), quarterWin.sample(z, y)), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // the oval mouth: a chrome ring, a mesh behind and one chrome bar across
    if (z > 2.1 && y > 0.28 && y < 0.58 && ax < 0.3) {
      const mouth = ell(x, y - 0.42, 0.24, 0.082);
      acc.cut(pocket(mouth, sh, 0.06, po), po.wall ? MAT.trim : MAT.grille, 0.008);
      acc.add(Math.hypot(mouth, sh + 0.006) - 0.011, MAT.chrome, 0.003);
      acc.add(Math.hypot(y - 0.42, sh + 0.02, Math.max(ax - 0.22, 0)) - 0.009, MAT.chrome, 0.002);
    }
    // headlamps set back in teardrop scoops in the fender tips, a chrome rim round each opening
    // and the glowing lamp at the back
    if (z > 1.8 && z < 2.35 && y > 0.4 && y < 0.62 && ax > 0.38 && ax < 0.64) {
      const scoop = sdEllipsoid(ax - 0.51, y - 0.505, z - 2.08, 0.066, 0.056, 0.17);
      acc.cut(scoop, MAT.head, 0.008);
      acc.add(Math.hypot(scoop, sh + 0.004) - 0.007, MAT.chrome, 0.002);
      acc.add(Math.max(Math.hypot(ax - 0.51, y - 0.505) - 0.04, Math.abs(z - 1.96) - 0.006), MAT.lens, 0.002);
    }
    // chrome gills behind the front wheels
    if (ax > 0.7 && z > 0.72 && z < 1.0 && y > 0.42 && y < 0.65) {
      const gill = sdRoundBox(0, y - 0.535, z - 0.865, 1, 0.075, 0.075, 0.02);
      acc.cut(pocket(gill, sh, 0.02, po), po.wall ? MAT.trim : MAT.grille, 0.006);
      for (const yb of [0.49, 0.535, 0.58]) acc.add(Math.max(Math.hypot(y - yb, sh + 0.008) - 0.008, Math.abs(z - 0.865) - 0.07), MAT.chrome, 0.002);
    }
    // the cut-off tail: four round lamps in chrome rings, the plate below them
    if (z < -1.95 && y > 0.4 && y < 0.7 && ax < 0.5) {
      for (const xc of [0.2, 0.36]) {
        const r = Math.hypot(ax - xc, y - 0.6);
        acc.cut(pocket(r - 0.045, sh, 0.02, po), po.wall ? MAT.chrome : MAT.tail, 0.004);
        acc.add(Math.hypot(r - 0.051, sh + 0.003) - 0.008, MAT.chrome, 0.003);
      }
      acc.cut(pocket(sdRoundBox(x, y - 0.515, 0, 0.12, 0.06, 1, 0.016), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.5 && y < 0.85) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.08 && z < 0.3 && y > 0.78 && y < 0.95 && ax > 0.66) {
      acc.cut(sdRoundBox(ax - 0.78, y - 0.89, z - 0.132, 0.036, 0.022, 0.006, 0.006), MAT.glass, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint && y < 0.225) acc.m = MAT.trim; // underbody (the floor sits at 0.21)
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, lamps
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of [DOOR_WIN, QUARTER_WIN]) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  const ring = (cx, cy, r) => Array.from({ length: 33 }, (_, i) => [cx + Math.cos((i / 32) * Math.PI * 2) * r, cy + Math.sin((i / 32) * Math.PI * 2) * r]);
  for (const sx of [1, -1]) {
    for (const xc of [0.2, 0.36]) decals.push({ kind: 'ribbon', mat: MAT.tailglow, view: VIEW.rear, path: ring(xc * sx, 0.6, 0.026), width: 0.01, depth: 0.016 });
  }

  return {
    id: 'vesper',
    sdf,
    shell,
    decals,
    // the mouth's mesh and the gills sit in pockets: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.45, [MAT.chrome]: 0.7 },
    bounds: { min: [-1.1, 0.0, -2.4], max: [1.1, 1.35, 2.6] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [[[0.25, 0.79], [0.27, 0.5], [0.22, 0.24], [-0.68, 0.24], [-0.7, 0.5], [-0.68, 0.82]]],
        top: [[[-0.6, 0.48], [0.6, 0.48], [0.76, 1.2], [0.6, 2.2], [-0.6, 2.2], [-0.76, 1.2], [-0.6, 0.48]]],
      },
      // `plate`: the licence plate painted into the tail's recess (rear view, metres)
      livery: {
        door: [-0.2, 0.55],
        shoulder: 0.66,
        cabin: { x: 0.5, z0: -1.85, z1: 0.38 },
        plate: { x: 0, y: 0.515, w: 0.235, h: 0.115, text: 'GT 1964' },
      },
      tailLights: [
        [0.28, 0.6, -2.15],
        [-0.28, 0.6, -2.15],
      ],
      headLights: [
        [0.51, 0.505, 2.16],
        [-0.51, 0.505, 2.16],
      ],
      exhausts: [
        [0.2, 0.255, -2.2],
        [-0.2, 0.255, -2.2],
      ],
    },
  };
}
