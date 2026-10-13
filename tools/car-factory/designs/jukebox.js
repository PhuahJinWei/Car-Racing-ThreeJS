// JUKEBOX - a late-50s American land yacht. A long, wide, low two-door hardtop: quad headlamps under
// hooded fender tips, a wide chrome grille, a massive chrome bumper with two bullets on it, a hood
// ornament, a wide windshield and a pillarless glasshouse, a chrome spear down each side, skirts
// over the rear wheels, and huge tail fins carrying twin bullet tail lamps. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule, sdEllipsoid } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildJukebox() {
  const WH = {
    front: { z: 1.55, y: 0.36, x: 0.8, r: 0.36, w: 0.21, rim: 0.2 },
    rear: { z: -1.6, y: 0.36, x: 0.8, r: 0.36, w: 0.21, rim: 0.2 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): an upright grille face, a long flat hood, a long flat deck
  const bodySide = new Profile2D(
    [
      [2.62, 0.24, 1],
      [2.7, 0.3],
      [2.73, 0.4],
      [2.73, 0.62],
      [2.7, 0.72],
      [2.62, 0.765],
      [2.3, 0.79],
      [1.8, 0.82],
      [1.2, 0.855],
      [1.0, 0.865],
      [0.0, 0.875],
      [-1.0, 0.885],
      [-1.6, 0.89],
      [-2.3, 0.89],
      [-2.6, 0.875],
      [-2.7, 0.82],
      [-2.74, 0.62],
      [-2.73, 0.4],
      [-2.66, 0.28],
      [-2.54, 0.22, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): wide and long, rounded at the nose, square at the tail
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.73],
      [0.8, 2.72],
      [0.94, 2.66],
      [0.99, 2.5],
      [1.0, 2.2],
      [1.0, -2.4],
      [0.99, -2.62],
      [0.95, -2.72],
      [0, -2.74],
    ]),
    { band: 0.2 },
  );
  // the hardtop: a wide windshield, a thin flat roof and a big rear window
  const cabSide = new Profile2D(
    [
      [1.08, 0.8, 1],
      [1.02, 0.87],
      [0.62, 1.3],
      [0.45, 1.365],
      [0.0, 1.38],
      [-0.65, 1.375],
      [-0.95, 1.33],
      [-1.25, 1.12],
      [-1.45, 0.94],
      [-1.52, 0.9, 1],
      [-1.52, 0.75, 1],
      [1.08, 0.75, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.1],
      [0.7, 1.08],
      [0.8, 1.0],
      [0.83, 0.85],
      [0.83, -1.0],
      [0.79, -1.3],
      [0.62, -1.47],
      [0, -1.5],
    ]),
    { band: 0.2 },
  );
  // a tail fin seen from the side (z, y): rising from the rear fender to a point over the tail
  const finSide = new Profile2D(
    [
      [-1.3, 0.85, 1],
      [-1.8, 0.93],
      [-2.3, 1.03],
      [-2.58, 1.12, 1],
      [-2.66, 1.1],
      [-2.68, 0.98],
      [-2.7, 0.82, 1],
    ],
    { band: 0.12, res: 0.003 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // pillarless side glass: the door glass and the rear quarter glass meet with no post between
  const DOOR_WIN = [
    [0.9, 0.92, 1],
    [0.56, 1.29, 1],
    [0.0, 1.31, 1],
    [-0.38, 1.31, 1],
    [-0.38, 0.93, 1],
  ];
  const QUARTER_WIN = [
    [-0.4, 1.31, 1],
    [-0.88, 1.29],
    [-1.12, 1.12, 1],
    [-1.12, 0.94, 1],
    [-0.4, 0.93, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.05],
    [0.72, 1.04],
    [0.79, 0.96],
    [0.78, 0.75],
    [0.7, 0.52],
    [0.66, 0.46],
    [0, 0.45],
  ]);
  const doorWin = new Profile2D(DOOR_WIN, small);
  const quarterWin = new Profile2D(QUARTER_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -0.78],
      [0.64, -0.8],
      [0.7, -1.05],
      [0.62, -1.36],
      [0, -1.4],
    ]),
    small,
  );
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;

  // cross-section: slab sides tucked in at the sills, a crease along the beltline
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.32) return 0.95 + 0.05 * smoothstep(0.22, 0.32, y);
    return 1.0 - ramp(y - 0.84, 0.005) * 0.3;
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.05);
    const tilt = Math.max(0, y - 0.9) * 0.35;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.05);
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
    // the tail fins: thin blades rising off the rear fenders
    if (ax > 0.7 && y > 0.8 && y < 1.18 && z < -1.2 && z > -2.75) {
      const half = 0.05 - 0.035 * smoothstep(0.88, 1.12, y);
      acc.add(Math.max(finSide.sample(z, y), Math.abs(ax - 0.93) - half), MAT.paint, 0.04);
    }
    // massive chrome bumpers wrapping round the corners, two chrome bullets on the front one
    if (z > 2.35 && y > 0.22 && y < 0.56) {
      acc.add(Math.max(roundEdge(bodyPlan.sample(ax, z) - 0.06, Math.abs(y - 0.33) - 0.075, 0.03), 2.4 - z), MAT.chrome, 0.015);
      acc.add(sdEllipsoid(ax - 0.42, y - 0.45, z - 2.76, 0.065, 0.065, 0.13), MAT.chrome, 0.015);
    }
    if (z < -2.35 && y > 0.22 && y < 0.5) {
      acc.add(Math.max(roundEdge(bodyPlan.sample(ax, z) - 0.06, Math.abs(y - 0.35) - 0.07, 0.03), -2.4 - z), MAT.chrome, 0.015);
    }
    // a chrome jet on the nose of the hood
    if (z > 2.35 && z < 2.75 && y > 0.74 && y < 0.88 && ax < 0.06) {
      acc.add(sdEllipsoid(x, y - 0.79, z - 2.55, 0.022, 0.03, 0.12), MAT.chrome, 0.012);
    }
    // a chrome spear down each side
    if (ax > 0.9 && y > 0.58 && y < 0.68 && z > -1.45 && z < 2.35) {
      acc.add(Math.max(Math.hypot(y - 0.63, sh + 0.004) - 0.013, z - 2.3, -1.4 - z), MAT.chrome, 0.004);
    }
    // chrome mirrors on the doors
    if (z > 0.75 && z < 1.0 && y > 0.82 && y < 1.0 && ax > 0.8) {
      acc.add(sdRoundBox(ax - 0.93, y - 0.95, z - 0.85, 0.045, 0.032, 0.05, 0.03), MAT.chrome, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.86, 0.86, 0.86, 0.92, 0.935, 0.855, 0.012), MAT.chrome, 0.008);
    }
    // twin exhausts under the rear bumper ends
    if (z < -2.4 && y < 0.3 && ax > 0.48 && ax < 0.72) {
      acc.add(sdCylZ(ax - 0.6, y - 0.22, z + 2.66, 0.038, 0.08), MAT.chrome, 0.004);
      acc.cut(sdCylZ(ax - 0.6, y - 0.22, z + 2.66, 0.029, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, a bench in front and one behind
    if (y > 0.22 && z < 1.08 && z > -1.52 && ax < 0.96) {
      const tub = Math.max(dBody + 0.04, ax - 0.86);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.26 - y, z - 1.0, -1.45 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.4, seatZ: 0.05, floorY: 0.26, dashZ: 0.78, dashY: 0.8, dashW: 0.86, wheelZ: 0.52, wheelY: 0.86, recline: 0.24 });
      if (z < -0.35) {
        acc.add(sdRoundBox(x, y - 0.38, z + 0.75, 0.8, 0.07, 0.26, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.66, z + 1.03, 0.8, 0.26, 0.07, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls in chrome frames (glass panes sit in them); the big
    // rear window is a shallow recess
    if (y > 0.86 && z < 1.1 && z > -1.52) {
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
    // the wide chrome grille: a mesh behind round chrome bars, between the headlamps
    if (z > 2.5 && y > 0.4 && y < 0.7 && ax < 0.64) {
      const grille = sdRoundBox(x, y - 0.545, 0, 0.56, 0.1, 1, 0.03);
      acc.cut(pocket(grille, S.bP, 0.05, po), po.wall ? MAT.chrome : MAT.grille, 0.008);
      for (const yb of [0.49, 0.545, 0.6]) acc.add(Math.hypot(y - yb, S.bP + 0.018, Math.max(ax - 0.54, 0)) - 0.011, MAT.chrome, 0.002);
      for (let i = -4; i <= 4; i++) acc.add(Math.max(Math.hypot(x - i * 0.12, S.bP + 0.018) - 0.008, Math.abs(y - 0.545) - 0.085), MAT.chrome, 0.002);
    }
    // quad headlamps under the hooded fender tips, in chrome rings
    if (z > 2.45 && y > 0.5 && y < 0.72 && ax > 0.56) {
      for (const xc of [0.66, 0.84]) {
        const r = Math.hypot(ax - xc, y - 0.615);
        acc.cut(pocket(r - 0.062, S.bP, 0.035, po), po.wall ? MAT.chrome : MAT.head, 0.004);
        acc.add(Math.hypot(r - 0.068, S.bP + 0.004) - 0.01, MAT.chrome, 0.003);
      }
    }
    // twin bullet tail lamps in each fin's trailing edge
    if (ax > 0.82 && y > 0.86 && y < 1.1 && z < -2.55) {
      for (const yc of [0.935, 1.025]) acc.add(sdEllipsoid(ax - 0.93, y - yc, z + 2.68, 0.032, 0.032, 0.06), MAT.tail, 0.006);
    }
    // the tail: a chrome strip across the deck lid, reversing lamps and the plate recess between the
    // bumper and the lid
    if (z < -2.55 && y > 0.42 && y < 0.86 && ax < 0.9) {
      acc.add(Math.max(Math.hypot(y - 0.8, sh + 0.004) - 0.011, ax - 0.86), MAT.chrome, 0.003);
      acc.cut(pocket(sdRoundBox(x, y - 0.555, 0, 0.16, 0.078, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
      acc.cut(pocket(sdRoundBox(ax - 0.5, y - 0.555, 0, 0.08, 0.035, 1, 0.015), sh, 0.012, po), po.wall ? MAT.chrome : MAT.reverse, 0.003);
    }
    // wheel arches (open to the side, black liners inside); a skirt hides the top of each rear wheel
    if (ax > 0.5 && y < 0.9) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(Math.max(arch(ax, y, z, WH.rear), Math.min(ax - 0.94, y - 0.36)), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.75 && z < 1.0 && y > 0.82 && y < 1.0 && ax > 0.8) {
      acc.cut(sdRoundBox(ax - 0.93, y - 0.95, z - 0.802, 0.036, 0.022, 0.006, 0.006), MAT.glass, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint && y < 0.235) acc.m = MAT.trim; // underbody (the floor sits at 0.22)
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, lamps
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of [DOOR_WIN, QUARTER_WIN]) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  for (const sx of [1, -1]) {
    for (const xc of [0.66, 0.84]) decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [xc * sx, 0.615], radius: 0.045, depth: 0.028, segments: 24 });
  }

  return {
    id: 'jukebox',
    sdf,
    shell,
    decals,
    // the grille mesh sits in a pocket: full AO turns it into a black void
    aoStrength: { [MAT.grille]: 0.45, [MAT.chrome]: 0.7 },
    bounds: { min: [-1.25, 0.0, -3.0], max: [1.25, 1.5, 3.05] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [[[1.0, 0.86], [1.02, 0.5], [0.98, 0.26], [-0.4, 0.26], [-0.42, 0.5], [-0.4, 0.88]]],
        top: [
          [[-0.8, 1.1], [0.8, 1.1], [0.9, 1.8], [0.88, 2.6], [-0.88, 2.6], [-0.9, 1.8], [-0.8, 1.1]],
          [[-0.62, -1.55], [0.62, -1.55], [0.7, -2.6], [-0.7, -2.6], [-0.62, -1.55]],
        ],
      },
      // `plate`: the licence plate painted into the tail's recess (rear view, metres)
      livery: {
        door: [0.3, 0.6],
        shoulder: 0.72,
        cabin: { x: 0.72, z0: -1.5, z1: 1.05 },
        plate: { x: 0, y: 0.555, w: 0.3, h: 0.15, text: 'DIG 1959' },
      },
      tailLights: [
        [0.93, 0.98, -2.74],
        [-0.93, 0.98, -2.74],
      ],
      headLights: [
        [0.75, 0.615, 2.72],
        [-0.75, 0.615, 2.72],
      ],
      exhausts: [
        [0.6, 0.22, -2.75],
        [-0.6, 0.22, -2.75],
      ],
    },
  };
}
