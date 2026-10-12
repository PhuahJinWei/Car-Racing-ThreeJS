// MARSHAL - a full-size pursuit sedan. A long hood with a big black grille between swept
// headlights, a steel push bar, a roof light bar (red on the driver's side, blue on the other), an
// upright four-door glasshouse and a short trunk. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildMarshal() {
  const WH = {
    front: { z: 1.5, y: 0.35, x: 0.8, r: 0.35, w: 0.25 },
    rear: { z: -1.45, y: 0.35, x: 0.8, r: 0.35, w: 0.25 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): bumper, grille, the long hood, beltline, trunk
  const bodySide = new Profile2D(
    [
      [2.35, 0.18, 1],
      [2.45, 0.2],
      [2.5, 0.28],
      [2.515, 0.42],
      [2.505, 0.56],
      [2.49, 0.66],
      [2.47, 0.76, 1],
      [2.3, 0.8],
      [1.9, 0.86],
      [1.4, 0.9],
      [1.0, 0.925],
      [0.5, 0.94],
      [-0.3, 0.96],
      [-1.0, 0.985],
      [-1.45, 1.0],
      [-2.0, 1.03],
      [-2.35, 1.04, 1],
      [-2.45, 1.0],
      [-2.49, 0.86],
      [-2.5, 0.72, 1],
      [-2.52, 0.62],
      [-2.52, 0.4],
      [-2.49, 0.26],
      [-2.38, 0.19, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z)
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.52],
      [0.5, 2.51],
      [0.78, 2.47],
      [0.9, 2.38],
      [0.945, 2.2],
      [0.955, 1.9],
      [0.96, 1.4],
      [0.96, 0.5],
      [0.96, -0.5],
      [0.96, -1.4],
      [0.955, -1.9],
      [0.94, -2.25],
      [0.88, -2.42],
      [0.65, -2.5],
      [0, -2.52],
    ]),
    { band: 0.2 },
  );
  // glasshouse: four doors under a long flat roof
  const cabSide = new Profile2D(
    [
      [1.05, 0.88, 1],
      [1.0, 0.94],
      [0.6, 1.16],
      [0.3, 1.35],
      [0.1, 1.415],
      [-0.3, 1.44],
      [-0.8, 1.43],
      [-1.0, 1.4],
      [-1.25, 1.24],
      [-1.5, 1.07],
      [-1.6, 1.02, 1],
      [-1.6, 0.8, 1],
      [1.05, 0.75, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.08],
      [0.6, 1.06],
      [0.78, 0.9],
      [0.84, 0.5],
      [0.86, -0.2],
      [0.85, -0.9],
      [0.8, -1.35],
      [0.62, -1.62],
      [0, -1.65],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // front and rear door glass and a small quarter window in the C-pillar, inset from the pillars
  const FRONT_WIN = [
    [0.82, 0.975, 1],
    [0.07, 1.37, 1],
    [-0.42, 1.385, 1],
    [-0.42, 0.985, 1],
  ];
  const REAR_WIN = [
    [-0.5, 1.385, 1],
    [-0.92, 1.37],
    [-1.05, 1.3, 1],
    [-1.05, 0.99, 1],
    [-0.5, 0.988, 1],
  ];
  const QUARTER_WIN = [
    [-1.12, 1.25, 1],
    [-1.3, 1.13, 1],
    [-1.3, 1.0, 1],
    [-1.12, 0.995, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.0],
    [0.55, 0.99],
    [0.66, 0.82],
    [0.68, 0.45],
    [0.63, 0.12],
    [0, 0.09],
  ]);
  const sideWin = [FRONT_WIN, REAR_WIN, QUARTER_WIN].map((o) => new Profile2D(o, small));
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -1.02],
      [0.6, -1.03],
      [0.62, -1.3],
      [0.55, -1.48],
      [0, -1.51],
    ]),
    small,
  );
  // headlight as seen from the front (|x|, y): swept up and out toward the wing
  const headFoot = new Profile2D(
    [
      [0.52, 0.665, 1],
      [0.84, 0.69],
      [0.9, 0.74, 1],
      [0.86, 0.775],
      [0.54, 0.76, 1],
    ],
    { band: 0.08, res: 0.002 },
  );

  // cross-section: tucked sills, upright flanks, a shoulder crease and tumblehome above it
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.32) return 0.955 + 0.045 * smoothstep(0.15, 0.32, y);
    return 1.0 - ramp(y - 0.88, 0.012) * 0.22;
  };

  // un-cut outer skin (also used to lay the glass and light strips onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.05);
    const tilt = Math.max(0, y - 1.0) * 0.4;
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
    const { dBody, dCab, cS, cP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // roof light bar: a black base on two feet, red lenses on the driver's side, blue on the other
    if (y > 1.38 && y < 1.6 && z > -0.45 && z < -0.05 && ax < 0.66) {
      acc.add(sdRoundBox(x, y - 1.483, z + 0.25, 0.6, 0.03, 0.12, 0.02), MAT.trim, 0.004);
      acc.add(sdRoundBox(ax - 0.45, y - 1.445, z + 0.25, 0.06, 0.03, 0.08, 0.015), MAT.trim, 0.012);
      acc.add(sdRoundBox(ax - 0.305, y - 1.54, z + 0.25, 0.265, 0.03, 0.112, 0.024), x > 0 ? MAT.beaconR : MAT.beaconB, 0.004);
    }
    // door mirrors on the door tops
    if (z > 0.7 && z < 1.0 && y > 0.92 && y < 1.15 && ax > 0.85) {
      acc.add(sdRoundBox(ax - 1.04, y - 1.035, z - 0.86, 0.085, 0.055, 0.045, 0.03), MAT.trim, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.93, 1.0, 0.88, 0.99, 1.02, 0.865, 0.016), MAT.trim, 0.01);
    }
    // twin exhausts under the rear bumper
    if (z < -2.3 && y < 0.36 && ax > 0.45 && ax < 0.75) {
      acc.add(sdCylZ(ax - 0.6, y - 0.24, z + 2.49, 0.045, 0.08), MAT.chrome, 0.004);
      acc.cut(sdCylZ(ax - 0.6, y - 0.24, z + 2.49, 0.035, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, furnish the front, a bench in the back
    if (y > 0.22 && z < 1.06 && z > -1.5 && ax < 0.94) {
      const tub = Math.max(dBody + 0.035, ax - 0.88);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.3 - y, z - 1.0, -1.45 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      // (the dash stands clear of the bulkhead: a thin crack there costs thousands of triangles)
      addCockpit(acc, x, y, z, { seatX: 0.42, seatZ: 0.05, floorY: 0.3, dashZ: 0.74, dashY: 0.84, dashW: 0.82, wheelZ: 0.52, wheelY: 0.86, recline: 0.3 });
      if (z < -0.4) {
        acc.add(sdRoundBox(x, y - 0.4, z + 0.85, 0.74, 0.07, 0.26, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.72, z + 1.12, 0.74, 0.3, 0.07, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls (glass panes sit in them); the rear glass is a
    // shallow recess
    if (y > 0.9 && z < 1.1 && z > -1.6) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = Math.min(sideWin[0].sample(z, y), sideWin[1].sample(z, y), sideWin[2].sample(z, y));
      let reg = Math.max(side, cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // big black grille between the headlights, and an intake across the bumper
    if (z > 2.3 && y > 0.25 && y < 0.8) {
      const grille = Math.max(ax - 0.5, Math.abs(y - 0.67) - 0.07);
      const intake = Math.max(ax - 0.62, Math.abs(y - 0.34) - 0.06);
      const d = pocket(Math.min(grille, intake), sh, 0.08, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.grille, 0.006);
      // a black crossbar splits the grille
      acc.add(Math.max(grille, Math.abs(y - 0.67) - 0.009, sh + 0.012, -(sh + 0.07)), MAT.trim, 0.003);
    }
    // headlight pockets (LED strip + projector lenses are separate decal geometry)
    if (z > 2.2 && y > 0.6 && y < 0.82 && ax > 0.48) {
      const d = pocket(headFoot.sample(ax, y), sh, 0.03, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.head, 0.004);
    }
    // tail lights wrapping the rear corners
    if (z < -2.2 && y > 0.8 && y < 1.02 && ax > 0.4) {
      const reg = Math.max(0.45 - ax, Math.abs(y - 0.915) - 0.055);
      const d = pocket(reg, sh, 0.026, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.tail, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 0.85) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.7 && z < 1.0 && y > 0.92 && y < 1.15 && ax > 0.85) {
      acc.cut(sdRoundBox(ax - 1.04, y - 1.035, z - 0.817, 0.07, 0.042, 0.012, 0.01), MAT.chrome, 0.003);
    }
    // (after the grille cuts, which reach out through it)
    // steel push bar: two uprights, two cross bars, mounts back into the bumper
    if (z > 2.4 && z < 2.7 && y > 0.2 && y < 0.9 && ax < 0.56) {
      acc.add(sdRoundBox(ax - 0.36, y - 0.55, z - 2.6, 0.034, 0.3, 0.034, 0.014), MAT.trim, 0.004);
      acc.add(sdRoundBox(x, y - 0.74, z - 2.615, 0.4, 0.028, 0.028, 0.02), MAT.trim, 0.012);
      acc.add(sdRoundBox(x, y - 0.42, z - 2.615, 0.4, 0.028, 0.028, 0.02), MAT.trim, 0.012);
      acc.add(sdRoundBox(ax - 0.36, y - 0.42, z - 2.52, 0.026, 0.026, 0.09, 0.01), MAT.trim, 0.006);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.195) acc.m = MAT.trim; // underbody
      else if (z < -2.3 && y < 0.36 && ax < 0.8) acc.m = MAT.trim; // valance under the rear bumper
      else if (z > 2.3 && y < 0.25) acc.m = MAT.trim; // chin
    }
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, light strips, lenses
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of [FRONT_WIN, REAR_WIN, QUARTER_WIN]) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  for (const sx of [1, -1]) {
    // headlight running strip along the top of the pocket
    decals.push({
      kind: 'ribbon',
      mat: MAT.drl,
      view: VIEW.front,
      path: [
        [0.56, 0.752],
        [0.72, 0.758],
        [0.85, 0.765],
      ].map(([u, v]) => [u * sx, v]),
      width: 0.009,
      depth: 0.01,
    });
    for (const [u, v] of [
      [0.62, 0.712],
      [0.76, 0.722],
    ]) {
      decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, v], radius: 0.026, depth: 0.018 });
    }
    // tail lamps: a bright bar in each
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.5 * sx, 0.93],
        [0.86 * sx, 0.93],
      ],
      width: 0.016,
      depth: 0.01,
    });
  }

  return {
    id: 'marshal',
    sdf,
    shell,
    decals,
    bounds: { min: [-1.25, 0.0, -2.75], max: [1.25, 1.7, 2.8] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [
          [[0.86, 0.97], [0.88, 0.6], [0.84, 0.27], [-0.45, 0.27], [-0.46, 0.6], [-0.45, 0.985]],
          [[-1.12, 0.99], [-1.12, 0.62], [-1.0, 0.5], [-0.98, 0.27], [-0.45, 0.27]],
          [[1.95, 0.56], [2.5, 0.56]],
          [[-2.0, 0.72], [-2.5, 0.72]],
        ],
        top: [
          [[-0.85, 1.02], [0.85, 1.02], [0.9, 1.6], [0.86, 2.4], [-0.86, 2.4], [-0.9, 1.6], [-0.85, 1.02]],
          [[-0.8, -1.55], [0.8, -1.55], [0.85, -2.0], [0.8, -2.42], [-0.8, -2.42], [-0.85, -2.0], [-0.8, -1.55]],
        ],
        front: [[[-0.9, 0.56], [0.9, 0.56]]],
        rear: [[[-0.95, 0.72], [0.95, 0.72]]],
      },
      // `patrol`: the doors that go white in the patrol livery, and where its lettering sits
      livery: { door: [0.2, 0.62], shoulder: 0.86, cabin: { x: 0.7, z0: -1.5, z1: 1.0 }, patrol: { z0: -1.0, z1: 1.06, y0: 0.27, y1: 0.99, text: [0.06, 0.64] } },
      tailLights: [
        [0.7, 0.915, -2.5],
        [-0.7, 0.915, -2.5],
      ],
      headLights: [
        [0.7, 0.72, 2.45],
        [-0.7, 0.72, 2.45],
      ],
      exhausts: [
        [0.6, 0.24, -2.57],
        [-0.6, 0.24, -2.57],
      ],
    },
  };
}
