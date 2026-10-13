// JUGGERNAUT - a lifted off-road pickup. A crew cab on 35-inch tyres under black box flares, a tall
// square nose with a big black grille, three amber marker lamps in it and LED headlamps, a steel
// bumper with fog lamps over a skid plate, amber clearance lamps and an LED bar on the roof, a sport
// bar with two lamps over the bed, tall tail lamps on the bed corners, side steps, and the axles and
// frame showing under the lift. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdBox, sdRoundBox, sdCylX, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildJuggernaut() {
  const WH = {
    front: { z: 1.72, y: 0.44, x: 0.86, r: 0.44, w: 0.34 },
    rear: { z: -1.66, y: 0.44, x: 0.86, r: 0.44, w: 0.34 },
  };
  const GAP = 0.05; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a tall square nose, a long flat hood, a straight beltline running back
  // over the bed to the tailgate; the body sits high on the frame
  const bodySide = new Profile2D(
    [
      [2.75, 0.68, 1],
      [2.82, 0.74],
      [2.84, 0.85],
      [2.84, 1.3],
      [2.82, 1.37],
      [2.76, 1.41, 1],
      [2.2, 1.43],
      [1.5, 1.45],
      [1.2, 1.46],
      [0.0, 1.47],
      [-2.55, 1.47],
      [-2.6, 1.46, 1],
      [-2.62, 1.4],
      [-2.62, 0.78],
      [-2.58, 0.7],
      [-2.5, 0.68, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a box with small corner radii
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.84],
      [0.8, 2.84],
      [0.9, 2.8],
      [0.94, 2.7],
      [0.95, 2.4],
      [0.95, -2.5],
      [0.93, -2.6],
      [0.85, -2.62],
      [0, -2.62],
    ]),
    { band: 0.2 },
  );
  // the crew cab: a raked windshield, a flat roof, an upright back
  const cabSide = new Profile2D(
    [
      [1.22, 1.4, 1],
      [1.15, 1.47],
      [0.55, 1.93],
      [0.45, 1.965],
      [0.0, 1.98],
      [-0.62, 1.975],
      [-0.7, 1.95, 1],
      [-0.7, 1.4, 1],
      [1.22, 1.35, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.25],
      [0.75, 1.24],
      [0.86, 1.18],
      [0.88, 1.05],
      [0.88, -0.6],
      [0.86, -0.7],
      [0, -0.71],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // front and rear door glass, a blacked-out B-pillar between them
  const FRONT_WIN = [
    [0.968, 1.52, 1],
    [0.473, 1.9, 1],
    [0.12, 1.9, 1],
    [0.12, 1.525, 1],
  ];
  const REAR_WIN = [
    [0.04, 1.9, 1],
    [-0.6, 1.9, 1],
    [-0.6, 1.53, 1],
    [0.04, 1.525, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.17],
    [0.78, 1.165],
    [0.81, 1.1],
    [0.79, 0.8],
    [0.76, 0.55],
    [0.74, 0.5],
    [0, 0.49],
  ]);
  const frontWin = new Profile2D(FRONT_WIN, small);
  const rearWin = new Profile2D(REAR_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;
  // the sport bar seen from behind (|x|, y): posts up from the bed rails, rounded shoulders, the bar
  // across; distance to that centreline
  const hoop = (ax, y) => {
    const post = Math.hypot(ax - 0.78, y - Math.min(1.86, Math.max(1.4, y)));
    const bar = Math.hypot(ax - Math.min(0.66, ax), y - 1.98);
    const dx = ax - 0.66;
    const dy = y - 1.86;
    const arc = dx >= 0 && dy >= 0 ? Math.abs(Math.hypot(dx, dy) - 0.12) : 1;
    return Math.min(post, bar, arc);
  };

  // cross-section: slab sides, tucked in at the bottom, a crisp crease along the beltline
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.8) return 0.96 + 0.04 * smoothstep(0.68, 0.8, y);
    return 1.0 - ramp(y - 1.43, 0.004) * 0.25;
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.04);
    const tilt = Math.max(0, y - 1.5) * 0.12;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.035);
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
    // black box flares round the upper half of every arch
    if (ax > 0.82 && y > 0.3 && y < 1.15) {
      for (const w of [WH.front, WH.rear]) {
        if (Math.abs(z - w.z) > 0.8) continue;
        const ring = Math.abs(Math.hypot(y - w.y, z - w.z) - (w.r + 0.15)) - 0.1;
        acc.add(roundEdge(Math.max(ring, w.y - 0.1 - y, 0.86 - ax), ax - 1.06, 0.02), MAT.trim, 0.012);
      }
    }
    // the steel front bumper with a skid plate under it, and the rear bumper with a step
    if (z > 2.6 && y > 0.45 && y < 1.02) {
      acc.add(roundEdge(Math.max(Math.abs(y - 0.85) - 0.13, ax - 0.98), Math.max(z - 2.99, 2.7 - z), 0.025), MAT.trim, 0.01);
      acc.add(roundEdge(Math.max(Math.abs(y - 0.63) - 0.03, ax - 0.6), Math.max(z - 2.93, 2.3 - z), 0.012), MAT.trim, 0.008);
    }
    if (z < -2.45 && y > 0.55 && y < 0.9) {
      acc.add(roundEdge(Math.max(Math.abs(y - 0.74) - 0.09, ax - 0.97), Math.max(-2.77 - z, z + 2.5), 0.02), MAT.trim, 0.01);
    }
    // tubular side steps between the wheels
    if (ax > 0.86 && y > 0.5 && y < 0.7 && Math.abs(z) < 1.3) {
      acc.add(sdCapsule(ax, y, z, 0.99, 0.6, 1.12, 0.99, 0.6, -1.08, 0.04), MAT.trim, 0.01);
      for (const zb of [0.9, -0.85]) acc.add(sdCapsule(ax, y, z, 0.86, 0.64, zb, 0.98, 0.61, zb, 0.022), MAT.trim, 0.008);
    }
    // the frame rails and the axles showing under the lift
    if (y < 0.78) {
      acc.add(sdBox(ax - 0.5, y - 0.64, z - 0.1, 0.05, 0.06, 2.55), MAT.trim, 0.01);
      for (const w of [WH.front, WH.rear]) {
        if (Math.abs(z - w.z) > 0.3) continue;
        acc.add(sdCylX(x, y - w.y, z - w.z, 0.065, 0.74), MAT.trim, 0.01);
        acc.add(sdRoundBox(x - 0.1, y - w.y, z - w.z, 0.14, 0.13, 0.12, 0.08), MAT.trim, 0.02);
        acc.add(sdCapsule(ax, y, z, 0.6, w.y + 0.05, w.z, 0.55, 0.66, w.z, 0.035), MAT.trim, 0.01);
      }
    }
    // big truck mirrors on stalks from the door tops
    if (z > 0.85 && z < 1.15 && y > 1.45 && y < 1.82 && ax > 0.84) {
      acc.add(sdRoundBox(ax - 1.07, y - 1.65, z - 1.0, 0.06, 0.12, 0.04, 0.02), MAT.trim, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.86, 1.52, 1.02, 1.03, 1.6, 1.0, 0.018), MAT.trim, 0.01);
    }
    // roof: amber clearance lamps along the front edge, an LED bar on brackets behind them
    if (y > 1.9 && y < 2.1 && z > 0.12 && z < 0.6 && ax < 0.82) {
      for (const xc of [0, 0.2, 0.4]) acc.add(Math.hypot(ax - xc, y - 1.982, z - 0.47) - 0.03, MAT.amber, 0.006);
      acc.add(sdRoundBox(x, y - 2.04, z - 0.25, 0.74, 0.035, 0.045, 0.02), MAT.trim, 0.006);
      acc.add(sdRoundBox(ax - 0.55, y - 1.995, z - 0.25, 0.025, 0.03, 0.03, 0.01), MAT.trim, 0.01);
    }
    // a big exhaust tip under the right-hand side of the rear bumper
    if (z < -2.4 && y < 0.78 && x < -0.45 && x > -0.75) {
      acc.add(sdCylZ(x + 0.6, y - 0.6, z + 2.62, 0.05, 0.1), MAT.chrome, 0.004);
      acc.cut(sdCylZ(x + 0.6, y - 0.6, z + 2.62, 0.039, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // the bed: open on top, a black liner
    if (y > 0.95 && z < -0.75 && z > -2.58 && ax < 0.9) {
      acc.cut(Math.max(ax - 0.84, 1.02 - y, -2.52 - z, z + 0.8), MAT.trim, 0.01);
    }
    // (after the bed, which it stands in)
    // the sport bar over the bed, with two lamps on top
    if (y > 1.35 && y < 2.15 && z > -1.08 && z < -0.82 && ax < 0.86) {
      acc.add(Math.hypot(hoop(ax, y), z + 0.95) - 0.035, MAT.trim, 0.012);
      acc.add(sdCylZ(ax - 0.36, y - 2.06, z + 0.93, 0.075, 0.055), MAT.trim, 0.008);
    }
    // cabin: hollow the cab and the tub below it, buckets in front, a bench behind
    if (y > 0.95 && z < 1.22 && z > -0.72 && ax < 0.9) {
      const tub = Math.max(dBody + 0.04, ax - 0.86);
      const inner = Math.max(Math.min(dCab + 0.03, tub), 1.0 - y, z - 1.15, -0.66 - z);
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.42, seatZ: 0.42, floorY: 1.0, dashZ: 0.98, dashY: 1.47, dashW: 0.82, wheelZ: 0.74, wheelY: 1.52, recline: 0.28 });
      if (z < 0.0) {
        acc.add(sdRoundBox(x, y - 1.1, z + 0.3, 0.8, 0.07, 0.24, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 1.38, z + 0.56, 0.8, 0.28, 0.07, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cab walls (glass panes sit in them); the B-pillar is blacked out;
    // the back window is a shallow recess
    if (y > 1.45 && z < 1.25 && z > -0.75) {
      const onCab = dCab - dBody + 0.004; // negative where the cab is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the cab
      const side = cS - cP + 0.01; // negative on the sides of the cab
      let reg = Math.max(Math.min(frontWin.sample(z, y), rearWin.sample(z, y)), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(Math.abs(z - 0.08) - 0.045, Math.abs(y - 1.71) - 0.2, side, onCab);
      acc.cut(pocket(reg, sh, 0.004, po), MAT.trim, 0.002);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      if (z < -0.6) acc.cut(pocket(Math.max(sdRoundBox(x, y - 1.715, 0, 0.62, 0.165, 1, 0.04), onCab), sh, 0.01, po), MAT.glass, 0.003);
    }
    // the big black grille with body-coloured bars across it and three amber marker lamps
    if (z > 2.6 && y > 0.9 && y < 1.38 && ax < 0.7) {
      const grille = sdRoundBox(x, y - 1.135, 0, 0.62, 0.175, 1, 0.03);
      acc.cut(pocket(grille, S.bP, 0.06, po), po.wall ? MAT.trim : MAT.grille, 0.008);
      for (const yb of [1.04, 1.18]) acc.add(Math.max(roundEdge(Math.abs(y - yb) - 0.022, S.bP + 0.012, 0.008), ax - 0.6), MAT.paint, 0.003);
      for (const xc of [0, 0.14]) acc.add(Math.max(sdRoundBox(ax - xc, y - 1.27, 0, 0.035, 0.012, 1, 0.006), S.bP + 0.002, -(S.bP + 0.03)), MAT.amber, 0.002);
    }
    // LED headlamps in the corners of the nose
    if (z > 2.6 && y > 1.05 && y < 1.36 && ax > 0.6) {
      acc.cut(pocket(sdRoundBox(ax - 0.78, y - 1.205, 0, 0.13, 0.085, 1, 0.025), S.bP, 0.035, po), po.wall ? MAT.chrome : MAT.head, 0.004);
    }
    // round fog lamps in the bumper, their glowing bulbs in the middle
    if (z > 2.85 && y > 0.75 && y < 0.95 && ax > 0.55 && ax < 0.85) {
      const r = Math.hypot(ax - 0.7, y - 0.85);
      acc.cut(pocket(r - 0.055, z - 2.99, 0.025, po), po.wall ? MAT.trim : MAT.head, 0.004);
      acc.add(Math.max(r - 0.035, Math.abs(z - 2.972) - 0.005), MAT.lens, 0.002);
    }
    // tall tail lamps on the bed corners, a clear reverse lamp at the bottom of each
    if (z < -2.5 && y > 0.95 && y < 1.45 && ax > 0.78) {
      acc.cut(pocket(sdRoundBox(ax - 0.885, y - 1.2, 0, 0.055, 0.19, 1, 0.02), S.bP, 0.02, po), po.wall ? MAT.trim : y > 1.08 ? MAT.tail : MAT.reverse, 0.003);
    }
    // licence plate recess in the tailgate (the livery paints the plate)
    if (z < -2.5 && y > 0.85 && y < 1.05 && ax < 0.2) {
      acc.cut(pocket(sdRoundBox(x, y - 0.95, 0, 0.16, 0.078, 1, 0.02), S.bP, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 1.15) {
      if (Math.abs(z - WH.front.z) < 0.7) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.014);
      if (Math.abs(z - WH.rear.z) < 0.7) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.014);
    }
    // mirror glass, and the lenses of the roof-bar and sport-bar lamps and the fog lamps
    if (z > 0.85 && z < 1.15 && y > 1.45 && y < 1.82 && ax > 0.84) {
      acc.cut(sdRoundBox(ax - 1.07, y - 1.65, z - 0.958, 0.05, 0.1, 0.005, 0.01), MAT.chrome, 0.003);
    }
    if (y > 1.9 && y < 2.1 && z > 0.12 && z < 0.6 && ax < 0.8) {
      acc.add(Math.max(Math.abs(x) - 0.7, Math.abs(y - 2.04) - 0.018, Math.abs(z - 0.296) - 0.004), MAT.lens, 0.002);
    }
    if (y > 1.95 && y < 2.15 && z > -0.92 && z < -0.82 && ax > 0.26 && ax < 0.46) {
      acc.add(Math.max(Math.hypot(ax - 0.36, y - 2.06) - 0.058, Math.abs(z + 0.875) - 0.006), MAT.lens, 0.002);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint && y < 0.72) acc.m = MAT.trim; // underbody (the body bottom sits at 0.68)
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ glass, lamps
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of [FRONT_WIN, REAR_WIN]) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  for (const sx of [1, -1]) {
    // an LED running strip along the top of each headlamp and two projectors under it
    decals.push({
      kind: 'ribbon',
      mat: MAT.drl,
      view: VIEW.front,
      path: [
        [0.67 * sx, 1.268],
        [0.89 * sx, 1.268],
      ],
      width: 0.016,
      depth: 0.02,
      sharp: true,
    });
    for (const u of [0.72, 0.84]) decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, 1.18], radius: 0.034, depth: 0.025, segments: 24 });
    // a bright bar down each tail lamp
    decals.push({
      kind: 'ribbon',
      mat: MAT.tailglow,
      view: VIEW.rear,
      path: [
        [0.885 * sx, 1.12],
        [0.885 * sx, 1.36],
      ],
      width: 0.03,
      depth: 0.012,
      sharp: true,
    });
  }

  return {
    id: 'juggernaut',
    sdf,
    shell,
    decals,
    // the grille mesh sits in a pocket: full AO turns it into a black void
    aoStrength: { [MAT.grille]: 0.45 },
    bounds: { min: [-1.3, 0.0, -2.95], max: [1.3, 2.2, 3.1] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [
          [[1.0, 1.46], [1.0, 0.72], [0.08, 0.72], [0.08, 1.46]],
          [[0.08, 0.72], [-0.66, 0.72], [-0.66, 1.46]],
        ],
        top: [[[-0.86, 1.26], [0.86, 1.26], [0.9, 2.7], [-0.9, 2.7], [-0.86, 1.26]]],
        rear: [[[-0.8, 1.42], [0.8, 1.42]]],
      },
      // `plate`: the licence plate painted into the tailgate's recess (rear view, metres)
      livery: {
        door: [0.55, 1.1],
        shoulder: 1.3,
        cabin: { x: 0.82, z0: -0.7, z1: 1.15 },
        plate: { x: 0, y: 0.95, w: 0.3, h: 0.15, text: 'BIG 4X4' },
      },
      tailLights: [
        [0.885, 1.22, -2.63],
        [-0.885, 1.22, -2.63],
      ],
      headLights: [
        [0.78, 1.2, 2.84],
        [-0.78, 1.2, 2.84],
      ],
      exhausts: [[-0.6, 0.6, -2.73]],
    },
  };
}
