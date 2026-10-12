// SIDEWINDER - an 80s rally homologation special. A short, boxy hatch with blistered box flares
// over every wheel, a pod of four driving lamps on the hood, twin rectangular headlamps in a black
// grille, black rubbing strips round the car with amber corner lamps in them, a roof scoop, a
// spoiler over the hatch glass, a black tail band with big lamps and the plate in it, mud flaps
// behind every wheel and one big exhaust. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildSidewinder() {
  const WH = {
    front: { z: 1.2, y: 0.325, x: 0.78, r: 0.325, w: 0.25 },
    rear: { z: -1.24, y: 0.325, x: 0.79, r: 0.325, w: 0.25 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): an upright nose, a short hood, a straight beltline, a squared-off tail
  const bodySide = new Profile2D(
    [
      [1.97, 0.19, 1],
      [2.03, 0.22],
      [2.045, 0.3],
      [2.05, 0.46],
      [2.05, 0.7],
      [2.04, 0.765, 1],
      [1.8, 0.785],
      [1.4, 0.815],
      [1.0, 0.85],
      [0.85, 0.862],
      [0.4, 0.89],
      [-0.4, 0.915],
      [-1.2, 0.935],
      [-1.7, 0.95],
      [-1.88, 0.955, 1],
      [-1.93, 0.9],
      [-1.96, 0.7],
      [-1.97, 0.46],
      [-1.97, 0.3],
      [-1.94, 0.22],
      [-1.88, 0.19, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a box with small corner radii (the flares are added on)
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.05],
      [0.62, 2.05],
      [0.76, 2.03],
      [0.82, 1.97],
      [0.84, 1.85],
      [0.845, 1.5],
      [0.845, -1.5],
      [0.84, -1.82],
      [0.815, -1.93],
      [0.75, -1.97],
      [0, -1.97],
    ]),
    { band: 0.2 },
  );
  // glasshouse: an upright windshield, a flat roof and a raked hatch
  const cabSide = new Profile2D(
    [
      [0.97, 0.84, 1],
      [0.92, 0.9],
      [0.6, 1.13],
      [0.3, 1.33],
      [0.15, 1.375],
      [-0.2, 1.385],
      [-1.0, 1.383],
      [-1.18, 1.37],
      [-1.32, 1.32],
      [-1.6, 1.15],
      [-1.78, 1.03],
      [-1.86, 0.97, 1],
      [-1.86, 0.8, 1],
      [0.97, 0.75, 1],
    ],
    { band: 0.2 },
  );
  // (straight sides right up to the windshield base, so the pillars rise from its corners)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 0.99],
      [0.6, 0.985],
      [0.73, 0.95],
      [0.765, 0.88],
      [0.77, 0.4],
      [0.77, -1.2],
      [0.76, -1.5],
      [0.72, -1.75],
      [0.6, -1.88],
      [0, -1.9],
    ]),
    { band: 0.2 },
  );
  // the lamp pod on the hood seen from the side (z, y): an upright face for the lamps, faired back
  // down into the hood
  const podSide = new Profile2D(
    [
      [1.94, 0.76, 1],
      [1.94, 0.985, 1],
      [1.88, 0.995],
      [1.76, 0.95],
      [1.62, 0.86],
      [1.52, 0.8, 1],
      [1.52, 0.76, 1],
    ],
    { band: 0.12, res: 0.003 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // big door glass and a quarter window, thin pillars; the B-pillar is blacked out
  const DOOR_WIN = [
    [0.827, 0.9, 1],
    [0.21, 1.325, 1],
    [-0.35, 1.325, 1],
    [-0.35, 0.94, 1],
  ];
  const QUARTER_WIN = [
    [-0.45, 1.325, 1],
    [-1.0, 1.325, 1],
    [-1.6, 0.972, 1],
    [-0.45, 0.944, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 0.955],
    [0.62, 0.95],
    [0.71, 0.89],
    [0.68, 0.6],
    [0.63, 0.35],
    [0.6, 0.26],
    [0, 0.245],
  ]);
  const doorWin = new Profile2D(DOOR_WIN, small);
  const quarterWin = new Profile2D(QUARTER_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -1.24],
      [0.58, -1.25],
      [0.6, -1.5],
      [0.56, -1.82],
      [0, -1.835],
    ]),
    small,
  );
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;

  // cross-section: slab sides tucked in at the sills, a crisp crease along the beltline
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.3) return 0.96 + 0.04 * smoothstep(0.17, 0.3, y);
    return 1.0 - ramp(y - 0.88, 0.004) * 0.3;
  };
  // the roof scoop rises from the roof toward its open front
  const scoopRise = (z) => 0.075 * smoothstep(-1.05, -0.5, z);
  // how far the flares stand out from the body: full over the wheels, tapering to nothing at the
  // doors and round the corners
  const flareFront = (z) => 0.09 * smoothstep(0.64, 0.92, z) * (1 - smoothstep(1.8, 2.06, z));
  const flareRear = (z) => 0.1 * smoothstep(-0.62, -0.9, z) * (1 - smoothstep(-1.72, -1.97, z));

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.035);
    const tilt = Math.max(0, y - 0.95) * 0.28;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.03);
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
    // blistered box flares over the wheels: flat-topped, tapering into the doors and round the
    // corners of the nose and tail
    if (ax > 0.7 && y > 0.15 && y < 0.85) {
      if (z > 0.6) acc.add(roundEdge(bodyPlan.sample(ax, z) - flareFront(z), Math.abs(y - 0.49) - 0.29, 0.02), MAT.paint, 0.025);
      if (z < -0.58) acc.add(roundEdge(bodyPlan.sample(ax, z) - flareRear(z), Math.abs(y - 0.5) - 0.3, 0.02), MAT.paint, 0.025);
    }
    // black rubbing strips round the car at bumper height, with amber lamps in their front corners
    if (y > 0.34 && y < 0.46) {
      const strip = roundEdge(bodyPlan.sample(ax, z) - 0.014, Math.abs(y - 0.4) - 0.028, 0.006);
      acc.add(strip, z > 1.8 && ax > 0.6 ? MAT.amber : MAT.trim, 0.004);
    }
    // the lamp pod: a faired box across the front of the hood with four driving lamps in its face
    if (z > 1.45 && z < 2.0 && y > 0.7 && y < 1.05 && ax < 0.68) {
      acc.add(smax(podSide.sample(z, y), ax - 0.6, 0.05), MAT.paint, 0.02);
      for (const xc of [0.15, 0.44]) {
        const r = Math.hypot(ax - xc, y - 0.885);
        // a chrome ring round each lamp, the reflector inside it and a glowing bulb in the middle
        acc.add(Math.hypot(r - 0.084, z - 1.942) - 0.011, MAT.chrome, 0.004);
        acc.cut(Math.max(r - 0.075, 1.925 - z, z - 1.98), MAT.head, 0.004);
        acc.add(Math.max(r - 0.038, Math.abs(z - 1.93) - 0.006), MAT.lens, 0.002);
      }
    }
    // roof scoop on the centreline, open to the front
    if (y > 1.3 && y < 1.5 && z < -0.37 && z > -1.12 && ax < 0.3) {
      acc.add(Math.max(smax(ax - 0.2, y - 1.383 - scoopRise(z), 0.03), z + 0.42, -1.07 - z), MAT.paint, 0.02);
    }
    // a spoiler over the hatch glass, carrying the roof on back
    if (y > 1.3 && y < 1.45 && z < -1.05 && z > -1.5 && ax < 0.7) {
      const lip = Math.abs(y - 1.372 - (-1.15 - z) * 0.08) - 0.013;
      acc.add(roundEdge(Math.max(lip, ax - 0.63), Math.max(z + 1.42, -1.12 - z), 0.008), MAT.paint, 0.03);
    }
    // 80s door mirrors on short stalks from the door tops
    if (z > 0.62 && z < 0.82 && y > 0.85 && y < 1.04 && ax > 0.72) {
      acc.add(sdRoundBox(ax - 0.905, y - 0.975, z - 0.72, 0.06, 0.045, 0.035, 0.015), MAT.trim, 0.004);
      acc.add(sdCapsule(ax, y, z, 0.755, 0.89, 0.74, 0.86, 0.955, 0.725, 0.012), MAT.trim, 0.008);
    }
    // mud flaps behind every wheel (body coloured: kept out of the black underbody below)
    let flap = 1;
    if (ax > 0.62 && y < 0.3 && ((z > 0.72 && z < 0.88) || (z < -1.56 && z > -1.72))) {
      flap = sdRoundBox(ax - 0.795, y - 0.15, z - (z > 0 ? 0.8 : -1.64), 0.125, 0.09, 0.006, 0.004);
      acc.add(flap, MAT.paint, 0.006);
    }
    // one big exhaust under the right-hand side of the bumper
    if (z < -1.82 && y < 0.34 && x < -0.32 && x > -0.58) {
      acc.add(sdCylZ(x + 0.45, y - 0.23, z + 1.98, 0.05, 0.085), MAT.chrome, 0.004);
      acc.cut(sdCylZ(x + 0.45, y - 0.23, z + 1.98, 0.039, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, buckets in front, a small bench behind
    if (y > 0.22 && z < 1.0 && z > -1.75 && ax < 0.82) {
      const tub = Math.max(dBody + 0.035, ax - 0.76);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.25 - y, z - 0.93, -1.62 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.36, seatZ: 0.0, floorY: 0.25, dashZ: 0.66, dashY: 0.8, dashW: 0.72, wheelZ: 0.42, wheelY: 0.84, recline: 0.3 });
      if (z < -0.5) {
        acc.add(sdRoundBox(x, y - 0.36, z + 0.85, 0.6, 0.06, 0.22, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.64, z + 1.1, 0.6, 0.26, 0.06, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls (glass panes sit in them); the hatch glass is a
    // shallow recess; the B-pillar is blacked out
    if (y > 0.86 && z < 1.0 && z > -1.9) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = cS - cP + 0.01; // negative on the sides of the glasshouse
      let reg = Math.max(Math.min(doorWin.sample(z, y), quarterWin.sample(z, y)), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(Math.abs(z + 0.4) - 0.055, Math.abs(y - 1.133) - 0.196, side, onCab);
      acc.cut(pocket(reg, sh, 0.004, po), MAT.trim, 0.002);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // the roof scoop's mouth
    if (y > 1.38 && y < 1.47 && z < -0.3 && z > -0.54 && ax < 0.17) {
      acc.cut(Math.max(ax - 0.15, Math.abs(y - 1.418) - 0.03, -0.5 - z, z + 0.32), MAT.grille, 0.006);
    }
    // black grille panel across the nose with the twin rectangular headlamps set into it, body
    // coloured slats between them
    if (z > 1.9 && y > 0.52 && y < 0.78 && ax < 0.84) {
      acc.cut(pocket(sdRoundBox(x, y - 0.6525, 0, 0.8, 0.0925, 1, 0.012), S.bP, 0.025, po), MAT.trim, 0.004);
      acc.cut(pocket(sdRoundBox(ax - 0.57, y - 0.6525, 0, 0.19, 0.072, 1, 0.01), S.bP, 0.035, po), po.wall ? MAT.chrome : MAT.head, 0.003);
      for (const yb of [0.615, 0.6525, 0.69]) acc.add(Math.max(Math.hypot(y - yb, S.bP + 0.016) - 0.01, ax - 0.33), MAT.paint, 0.003);
    }
    // a wide intake under the rubbing strip
    if (z > 1.9 && y > 0.18 && y < 0.38 && ax < 0.6) {
      acc.cut(pocket(sdRoundBox(x, y - 0.29, 0, 0.5, 0.055, 1, 0.025), S.bP, 0.06, po), po.wall ? MAT.trim : MAT.grille, 0.008);
    }
    // black tail band: the big lamps at its ends (red over a clear reverse lamp), the plate between
    // them
    if (z < -1.85 && y > 0.58 && y < 0.84 && ax < 0.84) {
      const band = sdRoundBox(x, y - 0.71, 0, 0.8, 0.09, 1, 0.012);
      acc.cut(pocket(band, S.bP, 0.018, po), !po.wall && ax < 0.165 && Math.abs(y - 0.71) < 0.078 ? MAT.paint : MAT.trim, 0.004);
      if (ax > 0.44) acc.add(Math.max(band, 0.47 - ax, S.bP + 0.004, -(S.bP + 0.02)), y > 0.665 ? MAT.tail : MAT.reverse, 0.002);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 0.9) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.62 && z < 0.82 && y > 0.85 && y < 1.04 && ax > 0.72) {
      acc.cut(sdRoundBox(ax - 0.905, y - 0.975, z - 0.683, 0.05, 0.036, 0.006, 0.006), MAT.chrome, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.205 && flap > 0.004) acc.m = MAT.trim; // underbody (the floor sits at 0.19)
      else if (z < -1.85 && y < 0.3) acc.m = MAT.trim; // black valance under the rear bumper
      else if (z > 1.9 && y < 0.24) acc.m = MAT.trim; // chin
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
    // a bulb in each half of the rectangular headlamps
    for (const [u, r] of [
      [0.47, 0.042],
      [0.665, 0.05],
    ]) {
      // (the lamp pockets are cut from the plan outline, a little proud of the rounded skin the
      // decals sink from)
      decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, 0.6525], radius: r, depth: 0.02, segments: 28 });
    }
    // a bright bar across the red part of each tail lamp
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.5 * sx, 0.745],
        [0.77 * sx, 0.745],
      ],
      width: 0.03,
      depth: 0.002,
      sharp: true,
    });
  }

  return {
    id: 'sidewinder',
    sdf,
    shell,
    decals,
    // the intake and roof-scoop meshes sit in pockets: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.45 },
    bounds: { min: [-1.15, 0.0, -2.2], max: [1.15, 1.55, 2.25] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [[[0.66, 0.88], [0.66, 0.25], [-0.6, 0.25], [-0.6, 0.93]]],
        top: [[[-0.76, 0.96], [0.76, 0.96], [0.8, 1.5], [0.76, 2.0], [-0.76, 2.0], [-0.8, 1.5], [-0.76, 0.96]]],
        front: [[[-0.84, 0.5], [0.84, 0.5]]],
        rear: [[[-0.84, 0.52], [0.84, 0.52]]],
      },
      // `plate`: the licence plate painted into the middle of the tail band (rear view, metres)
      livery: {
        door: [0.0, 0.58],
        shoulder: 0.8,
        cabin: { x: 0.66, z0: -1.85, z1: 0.95 },
        plate: { x: 0, y: 0.71, w: 0.3, h: 0.15, text: 'GRB 86' },
      },
      tailLights: [
        [0.62, 0.745, -1.97],
        [-0.62, 0.745, -1.97],
      ],
      headLights: [
        [0.57, 0.6525, 2.05],
        [-0.57, 0.6525, 2.05],
      ],
      exhausts: [[-0.45, 0.23, -2.07]],
    },
  };
}
