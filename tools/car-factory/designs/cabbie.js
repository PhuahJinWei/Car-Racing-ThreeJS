// CABBIE - a 2000s city taxi. A big, soft-cornered four-door saloon: a lit TAXI sign on the roof,
// large headlamps either side of a chrome-ringed grille, amber corner lamps, black rub strips along
// the doors and across the bumpers, a red reflector band across the trunk between tall tail lamps,
// and a single exhaust. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildCabbie() {
  const WH = {
    front: { z: 1.5, y: 0.34, x: 0.8, r: 0.34, w: 0.235, rim: 0.21 },
    rear: { z: -1.42, y: 0.34, x: 0.8, r: 0.34, w: 0.235, rim: 0.21 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a blunt nose, a long hood, a straight beltline, a long trunk
  const bodySide = new Profile2D(
    [
      [2.6, 0.22, 1],
      [2.68, 0.3],
      [2.7, 0.45],
      [2.69, 0.6],
      [2.64, 0.72],
      [2.3, 0.77],
      [1.8, 0.8],
      [1.2, 0.84],
      [1.0, 0.85],
      [0.0, 0.88],
      [-1.2, 0.9],
      [-1.7, 0.92],
      [-2.3, 0.93],
      [-2.55, 0.92],
      [-2.66, 0.85],
      [-2.7, 0.6],
      [-2.69, 0.4],
      [-2.62, 0.28],
      [-2.5, 0.22, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): wide, with soft corners
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.7],
      [0.6, 2.69],
      [0.82, 2.64],
      [0.94, 2.52],
      [0.975, 2.3],
      [0.98, 1.6],
      [0.98, -1.6],
      [0.975, -2.3],
      [0.94, -2.55],
      [0.8, -2.66],
      [0, -2.7],
    ]),
    { band: 0.2 },
  );
  // the glasshouse: four doors under a long roof, a sloping rear window
  const cabSide = new Profile2D(
    [
      [1.05, 0.82, 1],
      [1.0, 0.87],
      [0.35, 1.38],
      [0.2, 1.435],
      [-0.4, 1.455],
      [-0.85, 1.45],
      [-1.05, 1.41],
      [-1.45, 1.1],
      [-1.62, 0.93, 1],
      [-1.62, 0.78, 1],
      [1.05, 0.76, 1],
    ],
    { band: 0.2 },
  );
  // (straight sides right up to the windshield base, so the pillars rise from its corners)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.06],
      [0.68, 1.05],
      [0.82, 1.0],
      [0.86, 0.9],
      [0.86, -1.0],
      [0.84, -1.3],
      [0.72, -1.6],
      [0, -1.64],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // front and rear door glass and a small quarter window, black pillars between them
  const FRONT_WIN = [
    [0.86, 0.95, 1],
    [0.33, 1.36],
    [0.18, 1.39, 1],
    [-0.32, 1.395, 1],
    [-0.32, 0.955, 1],
  ];
  const REAR_WIN = [
    [-0.4, 1.395, 1],
    [-0.88, 1.39],
    [-1.02, 1.32, 1],
    [-1.02, 0.96, 1],
    [-0.4, 0.956, 1],
  ];
  const QUARTER_WIN = [
    [-1.09, 1.27, 1],
    [-1.3, 1.11, 1],
    [-1.3, 0.965, 1],
    [-1.09, 0.962, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.02],
    [0.72, 1.01],
    [0.79, 0.94],
    [0.76, 0.6],
    [0.7, 0.4],
    [0.68, 0.36],
    [0, 0.35],
  ]);
  const sideWins = [FRONT_WIN, REAR_WIN, QUARTER_WIN];
  const sideWin = sideWins.map((o) => new Profile2D(o, small));
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -1.08],
      [0.66, -1.1],
      [0.7, -1.3],
      [0.62, -1.52],
      [0, -1.56],
    ]),
    small,
  );
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;
  // distance to a segment in 2D
  const seg = (u, v, a, b, c, d) => {
    const dx = c - a;
    const dy = d - b;
    const h = Math.max(0, Math.min(1, ((u - a) * dx + (v - b) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(u - a - dx * h, v - b - dy * h);
  };
  // the word TAXI as strokes, centred, 10 cm tall (u runs left to right as you read it: +x on the
  // front face, -x on the back)
  const TAXI = [
    // T
    [-0.235, 0.045, -0.155, 0.045],
    [-0.195, 0.045, -0.195, -0.05],
    // A
    [-0.115, -0.05, -0.08, 0.05],
    [-0.08, 0.05, -0.045, -0.05],
    [-0.1, -0.012, -0.06, -0.012],
    // X
    [0.0, 0.05, 0.075, -0.05],
    [0.0, -0.05, 0.075, 0.05],
    // I
    [0.155, 0.05, 0.155, -0.05],
  ].map(([a, b, c, d]) => [a + 0.04, b, c + 0.04, d]);
  const word = (u, v) => Math.min(...TAXI.map(([a, b, c, d]) => seg(u, v, a, b, c, d)));

  // cross-section: gently barrelled flanks, tucked in at the sills, a soft crease at the beltline
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    const barrel = 1 - 0.025 * Math.min(1, ((y - 0.55) / 0.3) ** 2);
    if (y < 0.3) return barrel * (0.955 + 0.045 * smoothstep(0.2, 0.3, y));
    return barrel * (1.0 - ramp(y - 0.86, 0.008) * 0.3);
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.08);
    const tilt = Math.max(0, y - 0.9) * 0.3;
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
    // the roof sign: a lit box on a black base, TAXI in black on its front and back faces
    if (y > 1.4 && y < 1.76 && z > -0.36 && z < 0.0 && ax < 0.5) {
      acc.add(sdRoundBox(x, y - 1.475, z + 0.165, 0.34, 0.02, 0.11, 0.015), MAT.trim, 0.012);
      acc.add(sdRoundBox(x, y - 1.6, z + 0.165, 0.42, 0.115, 0.085, 0.04), MAT.amber, 0.004);
      const u = z > -0.165 ? x : -x;
      const face = Math.abs(Math.abs(z + 0.165) - 0.085) - 0.004;
      acc.add(Math.max(word(u, y - 1.6) - 0.009, face), MAT.trim, 0.002);
    }
    // black rub strips along the doors and across both bumpers
    if (ax > 0.9 && y > 0.48 && y < 0.6 && z > -1.0 && z < 1.08) {
      acc.add(Math.max(sdRoundBox(0, y - 0.54, z - 0.04, 1, 0.022, 1.02, 0.014), sh - 0.009, -(sh + 0.02)), MAT.trim, 0.004);
    }
    if (Math.abs(z) > 2.3 && y > 0.32 && y < 0.48) {
      acc.add(roundEdge(bodyPlan.sample(ax, z) - 0.02, Math.abs(y - 0.4) - 0.035, 0.01), MAT.trim, 0.006);
    }
    // black mirrors on the door tops
    if (z > 0.7 && z < 1.0 && y > 0.88 && y < 1.1 && ax > 0.8) {
      acc.add(sdRoundBox(ax - 0.99, y - 1.0, z - 0.85, 0.075, 0.05, 0.04, 0.025), MAT.trim, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.83, 0.94, 0.86, 0.94, 0.98, 0.855, 0.015), MAT.trim, 0.01);
    }
    // one exhaust under the right-hand side of the bumper
    if (z < -2.4 && y < 0.34 && x < -0.4 && x > -0.72) {
      acc.add(sdCylZ(x + 0.56, y - 0.24, z + 2.64, 0.032, 0.08), MAT.chrome, 0.004);
      acc.cut(sdCylZ(x + 0.56, y - 0.24, z + 2.64, 0.024, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, a bench in front and one behind
    if (y > 0.22 && z < 1.06 && z > -1.62 && ax < 0.94) {
      const tub = Math.max(dBody + 0.035, ax - 0.88);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.28 - y, z - 1.0, -1.55 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.42, seatZ: 0.12, floorY: 0.28, dashZ: 0.78, dashY: 0.8, dashW: 0.82, wheelZ: 0.55, wheelY: 0.86, recline: 0.28 });
      if (z < -0.35) {
        acc.add(sdRoundBox(x, y - 0.4, z + 0.8, 0.76, 0.07, 0.26, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.7, z + 1.08, 0.76, 0.28, 0.07, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls (glass panes sit in them); black pillars between the
    // side windows; the rear glass is a shallow recess
    if (y > 0.88 && z < 1.08 && z > -1.65) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = cS - cP + 0.01; // negative on the sides of the glasshouse
      let reg = Math.max(Math.min(sideWin[0].sample(z, y), sideWin[1].sample(z, y), sideWin[2].sample(z, y)), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(Math.min(Math.abs(z + 0.36) - 0.045, Math.abs(z + 1.055) - 0.04), Math.abs(y - 1.17) - 0.23, side, onCab);
      acc.cut(pocket(reg, sh, 0.004, po), MAT.trim, 0.002);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // a chrome-ringed grille between big headlamps, amber lamps in the corners, an intake low down
    if (z > 2.4 && y > 0.28 && y < 0.74 && ax < 0.96) {
      const grille = sdRoundBox(x, y - 0.6, 0, 0.36, 0.07, 1, 0.05);
      acc.cut(pocket(grille, sh, 0.04, po), po.wall ? MAT.chrome : MAT.grille, 0.006);
      acc.add(Math.hypot(grille, sh + 0.006) - 0.011, MAT.chrome, 0.003);
      acc.add(Math.hypot(y - 0.6, sh + 0.014, Math.max(ax - 0.34, 0)) - 0.009, MAT.chrome, 0.002);
      acc.cut(pocket(sdRoundBox(ax - 0.64, y - 0.605, 0, 0.21, 0.072, 1, 0.035), sh, 0.03, po), po.wall ? MAT.chrome : MAT.head, 0.004);
      acc.cut(pocket(sdRoundBox(ax - 0.9, y - 0.6, 0, 0.05, 0.05, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.amber, 0.003);
      acc.cut(pocket(sdRoundBox(x, y - 0.32, 0, 0.5, 0.03, 1, 0.02), sh, 0.025, po), po.wall ? MAT.trim : MAT.grille, 0.004);
    }
    // tall tail lamps in the rear corners, a red reflector band across the trunk between them
    if (z < -2.4 && y > 0.5 && y < 0.9 && ax < 0.96) {
      acc.cut(pocket(sdRoundBox(ax - 0.82, y - 0.7, 0, 0.12, 0.14, 1, 0.03), sh, 0.02, po), po.wall ? MAT.trim : y > 0.6 ? MAT.tail : MAT.reverse, 0.003);
      acc.cut(pocket(sdRoundBox(x, y - 0.74, 0, 0.66, 0.04, 1, 0.01), sh, 0.012, po), po.wall ? MAT.trim : MAT.tail, 0.003);
    }
    // licence plate recess in the tail panel above the bumper's rub strip (the livery paints the
    // plate; lower down it hung off the bottom of the bumper)
    if (z < -2.4 && y > 0.46 && y < 0.65 && ax < 0.2) {
      acc.cut(pocket(sdRoundBox(x, y - 0.555, 0, 0.155, 0.075, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 0.85) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.7 && z < 1.0 && y > 0.88 && y < 1.1 && ax > 0.8) {
      acc.cut(sdRoundBox(ax - 0.99, y - 1.0, z - 0.812, 0.062, 0.038, 0.006, 0.008), MAT.chrome, 0.003);
    }
    // door pulls
    if (ax > 0.86 && y > 0.78 && y < 0.86 && z > -1.0 && z < 0.4) {
      for (const zc of [0.25, -0.62]) acc.add(Math.max(sdRoundBox(0, y - 0.82, z - zc, 1, 0.012, 0.06, 0.008), sh - 0.006, -(sh + 0.012)), MAT.trim, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint && y < 0.235) acc.m = MAT.trim; // underbody (the floor sits at 0.22)
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
    for (const [u, r] of [
      [0.55, 0.045],
      [0.73, 0.05],
    ]) {
      decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, 0.605], radius: r, depth: 0.026, segments: 24 });
    }
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.76 * sx, 0.78],
        [0.9 * sx, 0.78],
      ],
      width: 0.03,
      depth: 0.012,
      sharp: true,
    });
  }

  return {
    id: 'cabbie',
    sdf,
    shell,
    decals,
    // the grille mesh sits in a pocket: full AO turns it into a black void
    aoStrength: { [MAT.grille]: 0.45 },
    bounds: { min: [-1.2, 0.0, -2.95], max: [1.2, 1.85, 2.95] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [
          [[0.98, 0.86], [1.0, 0.6], [0.96, 0.25], [-0.36, 0.25], [-0.37, 0.6], [-0.36, 0.89]],
          [[-0.36, 0.25], [-1.0, 0.25], [-1.02, 0.6], [-1.02, 0.9]],
        ],
        top: [
          [[-0.82, 1.06], [0.82, 1.06], [0.9, 1.7], [0.86, 2.55], [-0.86, 2.55], [-0.9, 1.7], [-0.82, 1.06]],
          [[-0.72, -1.68], [0.72, -1.68], [0.8, -2.55], [-0.8, -2.55], [-0.72, -1.68]],
        ],
      },
      // `taxi`: where the taxi livery's checker band runs (side view); `plate`: the licence plate
      // painted into its recess on the tail panel (rear view, metres)
      livery: {
        door: [0.3, 0.65],
        shoulder: 0.8,
        cabin: { x: 0.75, z0: -1.6, z1: 1.0 },
        taxi: { z0: -1.9, z1: 2.0, y: 0.655 },
        plate: { x: 0, y: 0.555, w: 0.3, h: 0.15, text: 'TX 2004' },
      },
      tailLights: [
        [0.82, 0.74, -2.7],
        [-0.82, 0.74, -2.7],
      ],
      headLights: [
        [0.64, 0.605, 2.69],
        [-0.64, 0.605, 2.69],
      ],
      exhausts: [[-0.56, 0.24, -2.74]],
    },
  };
}
