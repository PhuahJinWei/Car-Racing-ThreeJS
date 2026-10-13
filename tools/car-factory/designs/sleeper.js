// SLEEPER - a 90s European fast estate that looks like the family car. A long roof over a
// near-upright tailgate, roof rails and a lip spoiler, gently flared arches, a slim grille between
// wide flush headlamps, amber corner lamps, fog lamps in the bumper, very tall tail lamps up the back
// pillars, black rub strips along the doors and twin oval exhausts. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildSleeper() {
  const WH = {
    front: { z: 1.36, y: 0.32, x: 0.76, r: 0.32, w: 0.235, rim: 0.22 },
    rear: { z: -1.34, y: 0.32, x: 0.765, r: 0.32, w: 0.245, rim: 0.22 },
  };
  const GAP = 0.035; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a short sloping nose, a straight beltline, an upright tail
  const bodySide = new Profile2D(
    [
      [2.3, 0.2, 1],
      [2.35, 0.25],
      [2.37, 0.32],
      [2.37, 0.56],
      [2.35, 0.64],
      [2.3, 0.69],
      [1.9, 0.735],
      [1.3, 0.79],
      [1.1, 0.805],
      [0.0, 0.875],
      [-1.5, 0.915],
      [-2.2, 0.935],
      [-2.33, 0.93, 1],
      [-2.38, 0.86],
      [-2.4, 0.5],
      [-2.38, 0.3],
      [-2.3, 0.21],
      [-2.2, 0.2, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a softened box, the arches flared a little
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.37],
      [0.62, 2.36],
      [0.8, 2.31],
      [0.88, 2.2],
      [0.905, 1.9],
      [0.915, 1.55],
      [0.915, 1.15],
      [0.9, 0.8],
      [0.895, -0.7],
      [0.915, -1.1],
      [0.925, -1.5],
      [0.915, -1.9],
      [0.885, -2.26],
      [0.8, -2.37],
      [0, -2.4],
    ]),
    { band: 0.2 },
  );
  // the estate glasshouse: a raked windshield, a long flat roof and a near-upright tailgate
  const cabSide = new Profile2D(
    [
      [1.12, 0.78, 1],
      [1.06, 0.86],
      [0.45, 1.34],
      [0.28, 1.4],
      [0.0, 1.42],
      [-2.0, 1.42],
      [-2.18, 1.39],
      [-2.27, 1.2],
      [-2.34, 0.93, 1],
      [-2.34, 0.75, 1],
      [1.12, 0.73, 1],
    ],
    { band: 0.2 },
  );
  // (straight sides right up to the windshield base, so the pillars rise from its corners)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.14],
      [0.7, 1.13],
      [0.8, 1.08],
      [0.83, 0.98],
      [0.835, 0.5],
      [0.835, -2.0],
      [0.815, -2.2],
      [0.72, -2.33],
      [0, -2.35],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // front and rear door glass and the long cargo-area window, black pillars between them
  const FRONT_WIN = [
    [0.96, 0.93, 1],
    [0.42, 1.33],
    [0.27, 1.36, 1],
    [-0.28, 1.365, 1],
    [-0.28, 0.935, 1],
  ];
  const REAR_WIN = [
    [-0.36, 1.365, 1],
    [-1.04, 1.37, 1],
    [-1.04, 0.95, 1],
    [-0.36, 0.936, 1],
  ];
  const CARGO_WIN = [
    [-1.12, 1.37, 1],
    [-1.98, 1.37, 1],
    [-2.04, 1.3],
    [-2.04, 0.97, 1],
    [-1.12, 0.952, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.09],
    [0.72, 1.08],
    [0.78, 1.01],
    [0.75, 0.75],
    [0.7, 0.5],
    [0.67, 0.43],
    [0, 0.42],
  ]);
  const sideWins = [FRONT_WIN, REAR_WIN, CARGO_WIN];
  const sideWin = sideWins.map((o) => new Profile2D(o, small));
  const windshield = new Profile2D(WINDSHIELD, small);
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;

  // cross-section: slab sides tucked in at the sills, a soft crease along the beltline
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.3) return 0.955 + 0.045 * smoothstep(0.2, 0.3, y);
    return 1.0 - ramp(y - 0.86, 0.006) * 0.3;
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.05);
    const tilt = Math.max(0, y - 0.9) * 0.3;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.045);
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
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { dBody, dCab, cS, cP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // black roof rails on little feet
    if (y > 1.38 && y < 1.52 && z > -2.1 && z < 0.4 && ax < 0.72) {
      acc.add(sdCapsule(ax, y, z, 0.62, 1.475, 0.25, 0.62, 1.475, -1.95, 0.014), MAT.trim, 0.004);
      for (const zf of [0.2, -0.85, -1.9]) acc.add(sdRoundBox(ax - 0.62, y - 1.445, z - zf, 0.016, 0.03, 0.035, 0.01), MAT.trim, 0.012);
    }
    // a lip spoiler over the tailgate glass
    if (y > 1.36 && y < 1.46 && z < -1.95 && z > -2.32 && ax < 0.8) {
      acc.add(roundEdge(Math.max(Math.abs(y - 1.41) - 0.016, ax - 0.74), Math.max(z + 2.27, -2.05 - z), 0.008), MAT.paint, 0.02);
    }
    // black rub strips along the doors
    if (ax > 0.82 && y > 0.48 && y < 0.6 && z > -1.08 && z < 1.0) {
      acc.add(Math.max(sdRoundBox(0, y - 0.54, z + 0.04, 1, 0.022, 1.0, 0.014), sh - 0.009, -(sh + 0.02)), MAT.trim, 0.004);
    }
    // black mirrors on the door tops
    if (z > 0.72 && z < 1.0 && y > 0.88 && y < 1.08 && ax > 0.76) {
      acc.add(sdRoundBox(ax - 0.95, y - 0.985, z - 0.86, 0.07, 0.048, 0.038, 0.024), MAT.trim, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.8, 0.93, 0.87, 0.9, 0.97, 0.865, 0.014), MAT.trim, 0.01);
    }
    // twin oval exhausts under the bumper ends
    if (z < -2.15 && y < 0.34 && ax > 0.36 && ax < 0.7) {
      const o = Math.hypot((ax - 0.53) / 0.06, (y - 0.225) / 0.035);
      acc.add(Math.max((o - 1) * 0.035, Math.abs(z + 2.36) - 0.08), MAT.chrome, 0.004);
      acc.cut(Math.max((o - 0.78) * 0.03, Math.abs(z + 2.36) - 0.2), MAT.exhaust, 0.002);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, buckets in front, a bench behind
    if (y > 0.2 && z < 1.1 && z > -2.3 && ax < 0.86) {
      const tub = Math.max(dBody + 0.035, ax - 0.79);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.25 - y, z - 1.04, -2.22 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.38, seatZ: 0.15, floorY: 0.25, dashZ: 0.82, dashY: 0.8, dashW: 0.76, wheelZ: 0.58, wheelY: 0.86, recline: 0.3 });
      if (z < -0.25 && z > -1.4) {
        acc.add(sdRoundBox(x, y - 0.38, z + 0.66, 0.7, 0.07, 0.24, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.66, z + 0.92, 0.7, 0.27, 0.07, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls (glass panes sit in them); black pillars between the
    // side windows; the tailgate glass is a shallow recess
    if (y > 0.88 && z < 1.12 && z > -2.36) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = cS - cP + 0.01; // negative on the sides of the glasshouse
      let reg = Math.max(Math.min(sideWin[0].sample(z, y), sideWin[1].sample(z, y), sideWin[2].sample(z, y)), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(Math.min(Math.abs(z + 0.32) - 0.045, Math.abs(z + 1.08) - 0.045), Math.abs(y - 1.15) - 0.22, side, onCab);
      acc.cut(pocket(reg, sh, 0.004, po), MAT.trim, 0.002);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      if (z < -2.1) acc.cut(pocket(Math.max(sdRoundBox(x, y - 1.17, 0, 0.6, 0.2, 1, 0.04), onCab), sh, 0.01, po), MAT.glass, 0.003);
    }
    // a slim grille between wide flush headlamps, amber lamps round the corners
    if (z > 2.1 && y > 0.48 && y < 0.7 && ax < 0.92) {
      const grille = sdRoundBox(x, y - 0.6, 0, 0.26, 0.05, 1, 0.02);
      acc.cut(pocket(grille, S.bP, 0.035, po), po.wall ? MAT.chrome : MAT.grille, 0.006);
      for (const yb of [0.585, 0.615]) acc.add(Math.hypot(y - yb, S.bP + 0.012, Math.max(ax - 0.24, 0)) - 0.007, MAT.chrome, 0.002);
      acc.cut(pocket(sdRoundBox(ax - 0.53, y - 0.6, 0, 0.23, 0.058, 1, 0.012), S.bP, 0.03, po), po.wall ? MAT.chrome : MAT.head, 0.004);
      acc.cut(pocket(sdRoundBox(ax - 0.84, y - 0.6, 0, 0.06, 0.05, 1, 0.012), sh, 0.012, po), po.wall ? MAT.trim : MAT.amber, 0.003);
    }
    // a lower intake and round fog lamps in the bumper
    if (z > 2.1 && y > 0.2 && y < 0.46 && ax < 0.8) {
      acc.cut(pocket(sdRoundBox(x, y - 0.32, 0, 0.42, 0.045, 1, 0.025), S.bP, 0.04, po), po.wall ? MAT.trim : MAT.grille, 0.006);
      acc.cut(pocket(Math.hypot(ax - 0.64, y - 0.33) - 0.042, S.bP, 0.02, po), po.wall ? MAT.trim : MAT.head, 0.004);
    }
    // very tall tail lamps up the back pillars, a black panel across the tailgate with the plate
    if (z < -2.15 && y > 0.6 && y < 1.4 && ax < 0.9) {
      acc.cut(pocket(sdRoundBox(ax - 0.79, y - 1.0, 0, 0.065, 0.36, 1, 0.025), sh, 0.02, po), po.wall ? MAT.trim : y > 0.74 ? MAT.tail : MAT.reverse, 0.003);
      acc.cut(pocket(sdRoundBox(x, y - 0.74, 0, 0.62, 0.06, 1, 0.012), sh, 0.012, po), MAT.trim, 0.003);
    }
    if (z < -2.15 && y > 0.3 && y < 0.6 && ax < 0.2) {
      acc.cut(pocket(sdRoundBox(x, y - 0.46, 0, 0.155, 0.075, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.5 && y < 0.8) {
      if (Math.abs(z - WH.front.z) < 0.5) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.5) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.72 && z < 1.0 && y > 0.88 && y < 1.08 && ax > 0.76) {
      acc.cut(sdRoundBox(ax - 0.95, y - 0.985, z - 0.824, 0.058, 0.036, 0.006, 0.008), MAT.chrome, 0.003);
    }
    // door pulls
    if (ax > 0.82 && y > 0.76 && y < 0.84 && z > -1.0 && z < 0.4) {
      for (const zc of [0.22, -0.66]) acc.add(Math.max(sdRoundBox(0, y - 0.8, z - zc, 1, 0.012, 0.055, 0.008), sh - 0.006, -(sh + 0.012)), MAT.trim, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint && y < 0.215) acc.m = MAT.trim; // underbody (the floor sits at 0.2)
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
    // (the lamp pockets are cut from the plan outline, which stands proud of the rounded skin the
    // decals sink from: keep them shallow)
    for (const [u, r] of [
      [0.42, 0.034],
      [0.6, 0.04],
    ]) {
      decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, 0.6], radius: r, depth: 0.012, segments: 24 });
    }
    decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [0.64 * sx, 0.33], radius: 0.03, depth: 0.007, segments: 20 });
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.79 * sx, 0.8],
        [0.79 * sx, 1.3],
      ],
      width: 0.03,
      depth: 0.012,
      sharp: true,
    });
  }

  return {
    id: 'sleeper',
    sdf,
    shell,
    decals,
    // the grille mesh and intakes sit in pockets: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.45 },
    bounds: { min: [-1.15, 0.0, -2.65], max: [1.15, 1.6, 2.6] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [
          [[1.0, 0.86], [1.02, 0.6], [0.98, 0.24], [-0.32, 0.24], [-0.33, 0.6], [-0.32, 0.9]],
          [[-0.32, 0.24], [-1.06, 0.24], [-1.08, 0.6], [-1.08, 0.92]],
        ],
        top: [[[-0.8, 1.14], [0.8, 1.14], [0.88, 1.7], [0.84, 2.3], [-0.84, 2.3], [-0.88, 1.7], [-0.8, 1.14]]],
        rear: [[[-0.68, 0.92], [-0.7, 0.36], [0.7, 0.36], [0.68, 0.92]]],
      },
      // `plate`: the licence plate painted into the tailgate's recess (rear view, metres)
      livery: {
        door: [0.3, 0.6],
        shoulder: 0.78,
        cabin: { x: 0.72, z0: -2.3, z1: 1.08 },
        plate: { x: 0, y: 0.46, w: 0.3, h: 0.15, text: 'ZZ 315' },
      },
      tailLights: [
        [0.79, 1.0, -2.38],
        [-0.79, 1.0, -2.38],
      ],
      headLights: [
        [0.53, 0.6, 2.36],
        [-0.53, 0.6, 2.36],
      ],
      exhausts: [
        [0.53, 0.225, -2.45],
        [-0.53, 0.225, -2.45],
      ],
    },
  };
}
