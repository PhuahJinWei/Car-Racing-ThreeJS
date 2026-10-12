// BRAWLER - an early-70s fastback muscle car. A long hood with a chrome blower and its scoop
// standing up through a power bulge, a full-width grille with quad round lamps and chrome bars, blade
// bumpers, a coke-bottle waist that swells into wide rear haunches over fat tyres, a long fastback
// ending in a ducktail, and a full-width tail-lamp panel split by chrome bars. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildBrawler() {
  const WH = {
    front: { z: 1.43, y: 0.33, x: 0.775, r: 0.33, w: 0.235 },
    rear: { z: -1.33, y: 0.355, x: 0.785, r: 0.355, w: 0.31 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): valance, the upright grille face, the long hood, beltline, deck and
  // ducktail, tail panel
  const bodySide = new Profile2D(
    [
      [2.3, 0.17, 1],
      [2.38, 0.2],
      [2.415, 0.28],
      [2.425, 0.4],
      [2.425, 0.66],
      [2.41, 0.74],
      [2.385, 0.775, 1],
      [2.2, 0.79],
      [1.8, 0.815],
      [1.4, 0.835],
      [1.0, 0.855],
      [0.4, 0.865],
      [-0.4, 0.872],
      [-0.8, 0.878],
      [-1.1, 0.893],
      [-1.7, 0.905],
      [-2.1, 0.915],
      [-2.3, 0.932, 1],
      [-2.345, 0.88],
      [-2.36, 0.72],
      [-2.37, 0.56, 1],
      [-2.38, 0.5],
      [-2.38, 0.34],
      [-2.35, 0.25],
      [-2.26, 0.19, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a blunt full-width nose, a coke-bottle waist and wide rear haunches
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.425],
      [0.6, 2.425],
      [0.82, 2.41],
      [0.885, 2.35],
      [0.9, 2.2],
      [0.905, 1.8],
      [0.905, 1.1],
      [0.895, 0.6],
      [0.89, 0.0],
      [0.9, -0.5],
      [0.935, -0.95],
      [0.955, -1.3],
      [0.952, -1.75],
      [0.935, -2.1],
      [0.895, -2.3],
      [0.78, -2.37],
      [0, -2.38],
    ]),
    { band: 0.2 },
  );
  // glasshouse: raked windshield, short roof, a long fastback down to the ducktail
  const cabSide = new Profile2D(
    [
      [1.08, 0.78, 1],
      [1.04, 0.86],
      [0.62, 1.13],
      [0.4, 1.265],
      [0.2, 1.31],
      [-0.25, 1.322],
      [-0.6, 1.3],
      [-1.0, 1.215],
      [-1.5, 1.08],
      [-1.95, 0.96],
      [-2.18, 0.915, 1],
      [-2.18, 0.72, 1],
      [1.08, 0.7, 1],
    ],
    { band: 0.2 },
  );
  // (straight sides right up to the windshield base, so the pillars rise from its corners)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.09],
      [0.6, 1.08],
      [0.78, 1.03],
      [0.82, 0.92],
      [0.825, 0.4],
      [0.82, -0.4],
      [0.8, -1.0],
      [0.74, -1.6],
      [0.62, -2.0],
      [0.42, -2.2],
      [0, -2.24],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // door glass and a rear quarter window tapering into the fastback, inset from the pillars
  const DOOR_WIN = [
    [0.88, 0.925, 1],
    [0.34, 1.255, 1],
    [-0.45, 1.272, 1],
    [-0.45, 0.93, 1],
  ];
  const QUARTER_WIN = [
    [-0.53, 1.268, 1],
    [-0.95, 1.18],
    [-1.3, 1.06, 1],
    [-1.02, 0.95, 1],
    [-0.53, 0.932, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.0],
    [0.6, 0.99],
    [0.7, 0.88],
    [0.66, 0.55],
    [0.6, 0.42],
    [0, 0.4],
  ]);
  const doorWin = new Profile2D(DOOR_WIN, small);
  const quarterWin = new Profile2D(QUARTER_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -0.92],
      [0.55, -0.95],
      [0.6, -1.3],
      [0.52, -1.75],
      [0, -1.82],
    ]),
    small,
  );
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  // the same with its edges rounded to radius r (sharp chrome edges sparkle)
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;

  // cross-section: tucked sills, upright flanks, a crisp crease along the beltline and tumblehome
  // above it
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.3) return 0.955 + 0.045 * smoothstep(0.15, 0.3, y);
    return 1.0 - ramp(y - 0.8, 0.004) * 0.35;
  };
  // the power bulge down the middle of the hood
  const bulge = (ax, z) => 0.03 * (1 - smoothstep(0.26, 0.4, ax)) * smoothstep(1.0, 1.3, z) * (1 - smoothstep(2.0, 2.3, z));

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y - bulge(ax, z) * smoothstep(0.5, 0.7, y));
    const dBody = smax(bS, bP, 0.03);
    const tilt = Math.max(0, y - 0.9) * 0.42;
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
    // the blower: a ribbed chrome supercharger case standing through the hood on a black base,
    // with its injector hat on top
    if (z > 1.2 && z < 1.85 && y > 0.8 && y < 1.2 && ax < 0.25) {
      acc.add(sdRoundBox(x, y - 0.87, z - 1.53, 0.17, 0.03, 0.25, 0.02), MAT.trim, 0.012);
      acc.add(sdRoundBox(x, y - 0.94, z - 1.53, 0.13, 0.06, 0.21, 0.05), MAT.chrome, 0.006);
      for (const yr of [0.915, 0.945, 0.975]) acc.add(sdRoundBox(x, y - yr, z - 1.53, 0.146, 0.006, 0.17, 0.005), MAT.chrome, 0.003);
      acc.add(sdRoundBox(x, y - 1.075, z - 1.56, 0.105, 0.08, 0.12, 0.03), MAT.chrome, 0.008);
    }
    // a black chin spoiler under the nose
    if (z > 2.05 && y > 0.14 && y < 0.23) {
      acc.add(Math.max(bodyPlan.sample(ax, z) - 0.02, Math.abs(y - 0.185) - 0.017, 2.1 - z), MAT.trim, 0.01);
    }
    // chrome blade bumpers wrapping round the corners
    if (z > 2.1 && y > 0.32 && y < 0.54) {
      acc.add(Math.max(roundEdge(bodyPlan.sample(ax, z) - 0.045, Math.abs(y - 0.43) - 0.034, 0.01), 2.18 - z), MAT.chrome, 0.012);
    }
    if (z < -2.07 && y > 0.39 && y < 0.61) {
      acc.add(Math.max(roundEdge(bodyPlan.sample(ax, z) - 0.04, Math.abs(y - 0.5) - 0.032, 0.01), z + 2.15), MAT.chrome, 0.012);
    }
    // chrome bullet mirrors on stalks rooted in the door tops
    if (z > 0.66 && z < 0.9 && y > 0.84 && y < 1.0 && ax > 0.76) {
      acc.add(sdRoundBox(ax - 0.95, y - 0.94, z - 0.78, 0.06, 0.04, 0.065, 0.038), MAT.chrome, 0.004);
      acc.add(sdCapsule(ax, y, z, 0.8, 0.885, 0.8, 0.93, 0.93, 0.79, 0.014), MAT.chrome, 0.01);
    }
    // thin chrome mouldings along the sills
    if (ax > 0.8 && y > 0.22 && y < 0.29 && Math.abs(z - 0.05) < 1.0) {
      acc.add(Math.max(sdRoundBox(0, y - 0.255, z - 0.05, 1, 0.012, 0.95, 0.006), sh - 0.006, -(sh + 0.015)), MAT.chrome, 0.003);
    }
    // twin exhausts under the rear valance
    if (z < -2.25 && y < 0.32 && ax > 0.44 && ax < 0.66) {
      acc.add(sdCylZ(ax - 0.55, y - 0.235, z + 2.36, 0.047, 0.08), MAT.chrome, 0.004);
      acc.cut(sdCylZ(ax - 0.55, y - 0.235, z + 2.36, 0.036, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, buckets in front, a bench behind
    if (y > 0.2 && z < 1.06 && z > -1.9 && ax < 0.88) {
      const tub = Math.max(dBody + 0.035, ax - 0.82);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.26 - y, z - 1.0, -1.6 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.38, seatZ: 0.0, floorY: 0.26, dashZ: 0.74, dashY: 0.78, dashW: 0.76, wheelZ: 0.5, wheelY: 0.8, recline: 0.38 });
      if (z < -0.45) {
        acc.add(sdRoundBox(x, y - 0.36, z + 0.8, 0.66, 0.07, 0.25, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.62, z + 1.08, 0.66, 0.25, 0.07, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls (glass panes sit in them); the fastback glass is a
    // shallow recess
    if (y > 0.88 && z < 1.12 && z > -2.2) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      let reg = Math.max(Math.min(doorWin.sample(z, y), quarterWin.sample(z, y)), cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // the blower hat's mouth, with a chrome bar across it
    if (z > 1.5 && z < 1.75 && y > 1.0 && y < 1.15 && ax < 0.11) {
      acc.cut(Math.max(ax - 0.08, Math.abs(y - 1.08) - 0.05, 1.58 - z), MAT.trim, 0.004);
      acc.add(sdRoundBox(x, y - 1.08, z - 1.655, 0.085, 0.008, 0.008, 0.004), MAT.chrome, 0.002);
    }
    // full-width grille between the bumper and the hood: round chrome bars across a mesh, split in
    // the middle, with the quad lamps set into its ends in chrome ring bezels (curved chrome catches
    // the light; flat faces turned to the camera only mirror the dark)
    if (z > 2.3 && y > 0.45 && y < 0.78 && ax < 0.86) {
      const grille = Math.max(ax - 0.8, Math.abs(y - 0.605) - 0.105);
      acc.cut(pocket(grille, sh, 0.06, po), po.wall ? MAT.trim : MAT.grille, 0.012);
      const dep = sh + 0.02; // from a sheet 2 cm behind the face
      for (const yb of [0.555, 0.605, 0.655]) acc.add(Math.hypot(y - yb, dep, Math.max(ax - 0.43, 0)) - 0.012, MAT.chrome, 0.002);
      acc.add(Math.hypot(x, dep, Math.max(Math.abs(y - 0.605) - 0.065, 0)) - 0.011, MAT.chrome, 0.002);
      for (const xc of [0.52, 0.69]) {
        const r = Math.hypot(ax - xc, y - 0.605);
        acc.add(Math.max(r - 0.066, sh + 0.035, -(sh + 0.06)), MAT.head, 0.003);
        acc.add(Math.hypot(r - 0.071, dep) - 0.011, MAT.chrome, 0.004);
      }
    }
    // side marker lamps in chrome-rimmed recesses: clear at the front corners, red at the back
    if (ax > 0.8 && y > 0.56 && y < 0.66 && ((z > 1.95 && z < 2.2) || (z < -1.9 && z > -2.15))) {
      const lamp = sdRoundBox(0, y - 0.61, z - (z > 0 ? 2.07 : -2.02), 1, 0.018, 0.065, 0.012);
      acc.cut(pocket(lamp, sh, 0.01, po), po.wall ? MAT.chrome : z > 0 ? MAT.head : MAT.tail, 0.002);
    }
    // full-width tail-lamp panel: three lamps a side split by chrome bars, a black centre with the
    // fuel cap
    if (z < -2.2 && y > 0.6 && y < 0.84) {
      const panel = Math.max(ax - 0.82, Math.abs(y - 0.72) - 0.075);
      acc.cut(pocket(panel, sh, 0.025, po), po.wall ? MAT.trim : ax > 0.14 ? MAT.tail : MAT.trim, 0.006);
      const inner = Math.max(sh + 0.006, -(sh + 0.025));
      for (const xb of [0.14, 0.37, 0.6]) acc.add(Math.max(panel, Math.abs(ax - xb) - 0.008, inner), MAT.chrome, 0.002);
      if (ax < 0.08) acc.add(Math.max(sdCylZ(x, y - 0.72, z + 2.36, 0.045, 0.03), inner - 0.012), MAT.chrome, 0.003);
    }
    // reverse lamps and the licence plate recess in the rear valance (the livery paints the plate)
    if (z < -2.2 && y > 0.26 && y < 0.46 && ax < 0.5) {
      acc.cut(pocket(sdRoundBox(x, y - 0.355, 0, 0.17, 0.083, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
      acc.cut(pocket(Math.max(Math.abs(ax - 0.36) - 0.065, Math.abs(y - 0.355) - 0.025), sh, 0.015, po), po.wall ? MAT.trim : MAT.reverse, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 0.85) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.66 && z < 0.9 && y > 0.84 && y < 1.0 && ax > 0.76) {
      acc.cut(sdRoundBox(ax - 0.95, y - 0.94, z - 0.718, 0.048, 0.028, 0.01, 0.01), MAT.glass, 0.003);
    }
    // chrome door pulls
    if (ax > 0.8 && y > 0.77 && y < 0.83 && z > -0.45 && z < -0.2) {
      acc.add(Math.max(sdRoundBox(0, y - 0.8, z + 0.32, 1, 0.012, 0.07, 0.008), sh - 0.007, -(sh + 0.012)), MAT.chrome, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.17) acc.m = MAT.trim; // underbody
      else if (z < -2.2 && y < 0.24) acc.m = MAT.trim; // under the rear valance
    }
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
    // the quad round headlamps
    for (const xc of [0.52, 0.69]) decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [xc * sx, 0.605], radius: 0.054, depth: 0.03, segments: 32 });
    // a bright bar in each of the three tail lamps
    for (const [a, b] of [
      [0.17, 0.34],
      [0.4, 0.57],
      [0.63, 0.79],
    ]) {
      decals.push({
        kind: 'ribbon',
        mat: MAT.tailglow,
        view: VIEW.rear,
        path: [
          [a * sx, 0.72],
          [b * sx, 0.72],
        ],
        width: 0.03,
        depth: 0.014,
        sharp: true,
      });
    }
  }

  return {
    id: 'brawler',
    sdf,
    shell,
    decals,
    // the grille mesh sits in a pocket: full AO turns it into a black void
    aoStrength: { [MAT.grille]: 0.45 },
    bounds: { min: [-1.2, 0.0, -2.6], max: [1.2, 1.45, 2.65] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [[[0.98, 0.87], [1.0, 0.6], [0.97, 0.27], [-0.5, 0.27], [-0.52, 0.6], [-0.5, 0.88]]],
        top: [
          [[-0.82, 1.07], [0.82, 1.07], [0.87, 1.8], [0.85, 2.36], [-0.85, 2.36], [-0.87, 1.8], [-0.82, 1.07]],
          [[-0.62, -1.9], [0.62, -1.9], [0.72, -2.28], [-0.72, -2.28], [-0.62, -1.9]],
        ],
      },
      // `plate`: the licence plate painted into the valance recess (rear view, metres)
      livery: {
        door: [0.22, 0.58],
        shoulder: 0.78,
        cabin: { x: 0.62, z0: -2.2, z1: 1.04 },
        plate: { x: 0, y: 0.355, w: 0.31, h: 0.155, text: 'V8 BRAWL' },
      },
      tailLights: [
        [0.48, 0.72, -2.37],
        [-0.48, 0.72, -2.37],
      ],
      headLights: [
        [0.6, 0.605, 2.42],
        [-0.6, 0.605, 2.42],
      ],
      exhausts: [
        [0.55, 0.235, -2.45],
        [-0.55, 0.235, -2.45],
      ],
    },
  };
}
