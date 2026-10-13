// KAIDO - a 70s Japanese touring coupe dressed as a street racer. A crisp, boxy hardtop with a
// "surf line" crease running down each side, black over-fenders bolted on with a row of chrome
// bolts, a raked black chin spoiler with an intake, a full-width chrome grille of thin bars with
// round headlamps in chrome rings at its ends, amber lamps under the front bumper, thin chrome
// bumpers with overriders, mirrors out on the front fenders, wipers, chrome drip rails, window
// frames and sills, amber side repeaters, a chrome racing fuel cap, quad round tail lamps, a chrome
// trunk lock, a ducktail and twin exhausts. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW, offsetLoop } from '../decals.js';

export function buildKaido() {
  const WH = {
    front: { z: 1.3, y: 0.3, x: 0.72, r: 0.3, w: 0.225, rim: 0.18 },
    rear: { z: -1.28, y: 0.3, x: 0.73, r: 0.3, w: 0.235, rim: 0.18 },
  };
  const GAP = 0.035; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): an upright nose, a long flat hood, a straight beltline, a short trunk
  // ending in a ducktail
  const bodySide = new Profile2D(
    [
      [2.12, 0.22, 1],
      [2.17, 0.27],
      [2.18, 0.34],
      [2.18, 0.62],
      [2.16, 0.69, 1],
      [1.6, 0.735],
      [1.0, 0.775],
      [0.0, 0.81],
      [-1.0, 0.84],
      [-1.5, 0.86],
      [-1.95, 0.875],
      [-2.08, 0.9, 1],
      [-2.14, 0.875],
      [-2.17, 0.75],
      [-2.18, 0.5],
      [-2.15, 0.3],
      [-2.05, 0.22, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a box with small corner radii (the over-fenders are added on)
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.18],
      [0.6, 2.175],
      [0.74, 2.14],
      [0.795, 2.05],
      [0.805, 1.85],
      [0.805, -1.7],
      [0.8, -2.05],
      [0.75, -2.15],
      [0, -2.18],
    ]),
    { band: 0.2 },
  );
  // the glasshouse: an upright windshield, a short roof, a sloping rear window onto the trunk
  const cabSide = new Profile2D(
    [
      [0.98, 0.72, 1],
      [0.93, 0.79],
      [0.5, 1.16],
      [0.35, 1.235],
      [0.1, 1.26],
      [-0.45, 1.26],
      [-0.65, 1.23],
      [-1.0, 1.06],
      [-1.32, 0.89],
      [-1.4, 0.86, 1],
      [-1.4, 0.7, 1],
      [0.98, 0.68, 1],
    ],
    { band: 0.2 },
  );
  // (straight sides right up to the windshield base, so the pillars rise from its corners)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 0.99],
      [0.58, 0.985],
      [0.68, 0.95],
      [0.71, 0.86],
      [0.715, 0.3],
      [0.715, -0.7],
      [0.7, -1.1],
      [0.62, -1.36],
      [0, -1.4],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // door glass and a quarter window behind a thin chrome-framed post
  const DOOR_WIN = [
    [0.82, 0.85, 1],
    [0.42, 1.19, 1],
    [-0.28, 1.2, 1],
    [-0.28, 0.865, 1],
  ];
  const QUARTER_WIN = [
    [-0.34, 1.2, 1],
    [-0.6, 1.18],
    [-0.86, 1.06, 1],
    [-0.86, 0.875, 1],
    [-0.34, 0.866, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 0.96],
    [0.6, 0.955],
    [0.66, 0.89],
    [0.63, 0.6],
    [0.58, 0.4],
    [0.56, 0.36],
    [0, 0.35],
  ]);
  const doorWin = new Profile2D(DOOR_WIN, small);
  const quarterWin = new Profile2D(QUARTER_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const REAR_GLASS = mirrorU([
    [0, -0.66],
    [0.56, -0.68],
    [0.6, -0.95],
    [0.54, -1.26],
    [0, -1.3],
  ]);
  const rearGlass = new Profile2D(REAR_GLASS, small);
  // the surf line (side view, z y): a crease from the front fender, dipping along the door and
  // kicking up over the rear wheel to the tail
  const SURF = [
    [2.0, 0.66],
    [1.0, 0.64],
    [0.2, 0.6],
    [-0.55, 0.57],
    [-0.85, 0.62],
    [-1.2, 0.67],
    [-2.1, 0.69],
  ];
  const seg = (u, v, a, b, c, d) => {
    const dx = c - a;
    const dy = d - b;
    const h = Math.max(0, Math.min(1, ((u - a) * dx + (v - b) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(u - a - dx * h, v - b - dy * h);
  };
  const surf = (z, y) => {
    let d = 1;
    for (let i = 0; i + 1 < SURF.length; i++) d = Math.min(d, seg(z, y, SURF[i][0], SURF[i][1], SURF[i + 1][0], SURF[i + 1][1]));
    return d;
  };
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;

  // cross-section: slab sides tucked in at the sills, a crisp crease along the beltline
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k))); // smooth max(x, 0)
  const sec = (y) => {
    if (y < 0.3) return 0.96 + 0.04 * smoothstep(0.2, 0.3, y);
    return 1.0 - ramp(y - 0.76, 0.004) * 0.3;
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y);
    const dBody = smax(bS, bP, 0.03);
    const tilt = Math.max(0, y - 0.84) * 0.3;
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
  // the over-fenders' bolts: eight round the upper half of each flare, near its outer edge, on its
  // flat outer face (x 0.9)
  const BOLTS = [];
  for (const w of [WH.front, WH.rear]) {
    for (let i = 0; i < 8; i++) {
      const t = ((10 + i * 22.5) * Math.PI) / 180;
      BOLTS.push([w.z + (w.r + 0.148) * Math.cos(t), w.y + (w.r + 0.148) * Math.sin(t)]);
    }
  }
  // wipers parked along the foot of the windshield: points on the glass (x across, at height y,
  // `off` out from it)
  const onWindshield = (x, y, off) => [x, y + 0.758 * off, 0.93 - 1.1622 * (y - 0.79) + 0.652 * off];
  const WIPERS = [
    [onWindshield(0.38, 0.812, 0.012), onWindshield(-0.08, 0.828, 0.012)],
    [onWindshield(-0.12, 0.812, 0.012), onWindshield(-0.52, 0.828, 0.012)],
  ];
  // the chin spoiler's front leans forward toward its foot (how far it stands out of the plan, by
  // height)
  const chinOut = (y) => 0.02 + 0.05 * smoothstep(0.26, 0.15, y);

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { dBody, dCab, cS, cP, bP } = S;
    acc.set(sh, MAT.paint);

    // ---------------------------------------------------------------- add-ons
    // black bolt-on over-fenders round the upper half of every arch, their tops kept under the
    // beltline crease (reaching over it, they cut raggedly into the shoulder)
    if (ax > 0.7 && y > 0.18 && y < 0.78) {
      for (const w of [WH.front, WH.rear]) {
        if (Math.abs(z - w.z) > 0.52) continue;
        const ring = Math.abs(Math.hypot(y - w.y, z - w.z) - (w.r + 0.1)) - 0.065;
        acc.add(roundEdge(Math.max(ring, w.y - 0.06 - y, 0.76 - ax, y - 0.745), ax - 0.9, 0.012), MAT.trim, 0.008);
      }
    }
    // a deep black chin spoiler, its front raked forward to its foot, an intake across its middle
    if (z > 1.8 && y > 0.1 && y < 0.3) {
      const plan = bodyPlan.sample(ax, z);
      acc.add(Math.max(roundEdge(plan - chinOut(y), Math.abs(y - 0.2) - 0.05, 0.01), 1.85 - z), MAT.trim, 0.01);
      acc.cut(pocket(sdRoundBox(x, y - 0.195, 0, 0.3, 0.022, 1, 0.01), plan - chinOut(y), 0.03, po), MAT.grille, 0.004);
    }
    // thin chrome bumpers wrapping round the corners, a pair of overriders standing up on each
    if (Math.abs(z) > 1.85 && y > 0.32 && y < 0.5) {
      acc.add(Math.max(roundEdge(bodyPlan.sample(ax, z) - 0.035, Math.abs(y - 0.41) - 0.026, 0.01), 1.95 - Math.abs(z)), MAT.chrome, 0.008);
      if (Math.abs(ax - 0.42) < 0.05 && Math.abs(z) > 2.15) acc.add(sdRoundBox(ax - 0.42, y - 0.405, Math.abs(z) - 2.232, 0.022, 0.07, 0.03, 0.015), MAT.chrome, 0.006);
    }
    // the over-fenders' chrome bolts
    if (ax > 0.86 && ax < 0.93 && y > 0.25 && y < 0.8) {
      let b = 1;
      for (const [zb, yb] of BOLTS) b = Math.min(b, Math.hypot(ax - 0.9, y - yb, z - zb) - 0.01);
      acc.add(b, MAT.chrome, 0.003);
    }
    // a chrome sill strip between the flares
    if (ax > 0.7 && y > 0.25 && y < 0.33 && z > -0.84 && z < 0.86) {
      acc.add(roundEdge(Math.max(bP - 0.005, -(bP + 0.015)), sdRoundBox(z - 0.01, y - 0.29, 0, 0.8, 0.02, 1, 0.01), 0.004), MAT.chrome, 0.003);
    }
    // a ducktail: the trunk's tail kicks up into a lip
    if (ax < 0.8 && y > 0.8 && y < 0.98 && z < -1.8 && z > -2.16) {
      const top = (y - (0.875 + (-1.85 - z) * 0.26)) / Math.hypot(1, 0.26);
      acc.add(smax(smax(top, ax - 0.76, 0.012), smax(-2.115 - z, 0.82 - y, 0.01), 0.008), MAT.paint, 0.015);
    }
    // a chrome racing fuel cap on the right rear fender, above the crease
    if (x < -0.7 && y > 0.76 && y < 0.88 && z > -1.68 && z < -1.52) {
      acc.add(edge(Math.hypot(z + 1.6, y - 0.815) - 0.042, Math.max(bP - 0.006, -(bP + 0.012))), MAT.chrome, 0.003);
    }
    // mirrors out on the front fenders, on thin stalks
    if (z > 1.5 && z < 1.85 && y > 0.7 && y < 0.92 && ax > 0.5 && ax < 0.8) {
      acc.add(sdRoundBox(ax - 0.67, y - 0.85, z - 1.66, 0.035, 0.03, 0.025, 0.015), MAT.trim, 0.005);
      acc.add(sdCapsule(ax, y, z, 0.66, 0.74, 1.7, 0.67, 0.83, 1.665, 0.008), MAT.trim, 0.006);
    }
    // twin exhausts under the rear bumper
    if (z < -1.9 && y < 0.32 && ax > 0.32 && ax < 0.6) {
      acc.add(sdCylZ(ax - 0.46, y - 0.22, z + 2.16, 0.034, 0.08), MAT.chrome, 0.004);
      acc.cut(sdCylZ(ax - 0.46, y - 0.22, z + 2.16, 0.025, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, buckets in front, a bench behind
    if (y > 0.2 && z < 0.98 && z > -1.4 && ax < 0.78) {
      const tub = Math.max(dBody + 0.035, ax - 0.72);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.24 - y, z - 0.92, -1.32 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.36, seatZ: -0.05, floorY: 0.24, dashZ: 0.66, dashY: 0.74, dashW: 0.66, wheelZ: 0.42, wheelY: 0.8, recline: 0.32 });
      if (z < -0.5) {
        acc.add(sdRoundBox(x, y - 0.34, z + 0.85, 0.6, 0.06, 0.22, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.6, z + 1.1, 0.6, 0.24, 0.06, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls (glass panes sit in them, chrome frames round them)
    if (y > 0.78 && z < 1.0 && z > -1.42) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = cS - cP + 0.01; // negative on the sides of the glasshouse
      let reg = Math.max(Math.min(doorWin.sample(z, y), quarterWin.sample(z, y)), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.045, po), po.wall ? MAT.chrome : MAT.trim, 0.003);
    }
    // wipers, a hub at each pivot (after the glass, whose cut would take them away)
    if (z > 0.85 && z < 0.97 && y > 0.79 && y < 0.86 && ax < 0.6) {
      for (const [a, b] of WIPERS) {
        acc.add(sdCapsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], 0.0075), MAT.trim, 0.003);
        acc.add(Math.hypot(x - a[0], y - a[1], z - a[2]) - 0.015, MAT.trim, 0.004);
      }
    }
    // the surf line: a crease pressed into each side (wide and deep enough to read: finer, it
    // vanished), kept to the skin: the over-fenders pass over it (cut through them, it left a slit)
    if (ax > 0.7 && y > 0.5 && y < 0.75 && z > -2.15 && z < 2.05) {
      acc.cut(Math.max(pocket(surf(z, y) - 0.008, S.bP, 0.008, po), S.bP - 0.004), MAT.paint, 0.003);
    }
    // a full-width chrome grille: a chrome surround, five thin chrome bars across a dark mesh with a
    // blank badge on them, and the round headlamps in chrome rings at its ends
    if (z > 2.0 && y > 0.44 && y < 0.7 && ax < 0.76) {
      const grille = sdRoundBox(x, y - 0.56, 0, 0.72, 0.085, 1, 0.02);
      acc.cut(pocket(grille, S.bP, 0.035, po), po.wall ? MAT.chrome : MAT.grille, 0.006);
      acc.add(edge(Math.abs(grille + 0.004) - 0.006, Math.max(S.bP - 0.004, -(S.bP + 0.012))), MAT.chrome, 0.002);
      for (const yb of [0.5, 0.53, 0.56, 0.59, 0.62]) acc.add(Math.hypot(y - yb, S.bP + 0.012, Math.max(ax - 0.46, 0)) - 0.0065, MAT.chrome, 0.002);
      acc.add(edge(sdRoundBox(x, y - 0.56, 0, 0.05, 0.02, 1, 0.01), Math.max(S.bP + 0.002, -(S.bP + 0.02))), MAT.chrome, 0.002);
      const r = Math.hypot(ax - 0.57, y - 0.56);
      acc.add(Math.max(r - 0.08, S.bP + 0.03, -(S.bP + 0.035)), MAT.head, 0.003);
      acc.add(Math.hypot(r - 0.083, S.bP + 0.006) - 0.01, MAT.chrome, 0.003);
    }
    // amber lamps under the front bumper; amber repeaters on the front fenders; the trunk lock in a
    // chrome escutcheon over the tail panel
    if (z > 2.1 && y > 0.28 && y < 0.36 && ax > 0.45 && ax < 0.66) {
      acc.cut(pocket(sdRoundBox(ax - 0.55, y - 0.32, 0, 0.07, 0.022, 1, 0.01), S.bP, 0.012, po), po.wall ? MAT.trim : MAT.amber, 0.003);
    }
    if (ax > 0.75 && z > 1.9 && z < 2.0 && y > 0.42 && y < 0.48) {
      acc.cut(pocket(sdRoundBox(z - 1.95, y - 0.45, 0, 0.03, 0.012, 1, 0.01), bP, 0.004, po), po.wall ? MAT.trim : MAT.indicator, 0.002);
    }
    if (z < -2.05 && y > 0.76 && y < 0.83 && ax < 0.06) {
      acc.add(edge(sdRoundBox(x, y - 0.795, 0, 0.032, 0.014, 1, 0.008), Math.max(sh - 0.005, -(sh + 0.012))), MAT.chrome, 0.003);
      acc.cut(pocket(Math.hypot(x, y - 0.795) - 0.006, sh - 0.005, 0.006, po), MAT.trim, 0.002);
    }
    // quad round tail lamps in a black panel, the plate between them (the livery paints it)
    if (z < -2.0 && y > 0.56 && y < 0.8 && ax < 0.76) {
      acc.cut(pocket(sdRoundBox(x, y - 0.67, 0, 0.72, 0.08, 1, 0.02), S.bP, 0.018, po), MAT.trim, 0.004);
      acc.add(Math.max(sdRoundBox(x, y - 0.67, 0, 0.155, 0.075, 1, 0.02), S.bP + 0.008, -(S.bP + 0.02)), MAT.paint, 0.002);
      for (const xc of [0.4, 0.6]) {
        const r = Math.hypot(ax - xc, y - 0.67);
        acc.add(Math.max(r - 0.058, S.bP + 0.003, -(S.bP + 0.02)), xc < 0.5 && y < 0.64 ? MAT.reverse : MAT.tail, 0.002);
        acc.add(Math.hypot(r - 0.062, S.bP + 0.002) - 0.008, MAT.chrome, 0.003);
      }
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.5 && y < 0.7) {
      if (Math.abs(z - WH.front.z) < 0.5) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.01);
      if (Math.abs(z - WH.rear.z) < 0.5) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.01);
    }
    // fender mirror glass
    if (z > 1.5 && z < 1.85 && y > 0.7 && y < 0.92 && ax > 0.5 && ax < 0.8) {
      acc.cut(sdRoundBox(ax - 0.67, y - 0.85, z - 1.638, 0.026, 0.021, 0.005, 0.006), MAT.chrome, 0.002);
    }
    // chrome door pulls
    if (ax > 0.76 && y > 0.7 && y < 0.78 && z > -0.3 && z < -0.05) {
      acc.add(Math.max(sdRoundBox(0, y - 0.74, z + 0.18, 1, 0.01, 0.06, 0.008), sh - 0.006, -(sh + 0.012)), MAT.chrome, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.235) acc.m = MAT.trim; // underbody (the floor sits at 0.22)
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
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: REAR_GLASS, depth: 0.006, rings: 6 });
  // chrome frames round the side glass and chrome drip rails along the roof's edges: real strips
  // laid on the skin (painted onto it, they came out ragged)
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of [DOOR_WIN, QUARTER_WIN]) decals.push({ kind: 'bead', mat: MAT.chrome, view, path: offsetLoop(outline, 0.008), closed: true, width: 0.012, height: 0.0035 });
    decals.push({
      kind: 'bead',
      mat: MAT.chrome,
      view,
      path: [
        [0.38, 1.205],
        [0.25, 1.222],
        [0.05, 1.23],
        [-0.45, 1.23],
        [-0.55, 1.226],
        [-0.65, 1.2],
      ],
      width: 0.009,
      height: 0.004,
    });
  }
  const ring = (cx, cy, r) => Array.from({ length: 33 }, (_, i) => [cx + Math.cos((i / 32) * Math.PI * 2) * r, cy + Math.sin((i / 32) * Math.PI * 2) * r]);
  for (const sx of [1, -1]) {
    // (the lens stands a centimetre in front of the dark housing: at the housing's own depth, the
    // housing hid most of it and the lamps read as small dim lights)
    decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [0.57 * sx, 0.56], radius: 0.056, depth: 0.012, segments: 28 });
    decals.push({ kind: 'ribbon', mat: MAT.tailglow, view: VIEW.rear, path: ring(0.6 * sx, 0.67, 0.036), width: 0.012, depth: 0.001 });
  }

  return {
    id: 'kaido',
    sdf,
    shell,
    decals,
    // the grille mesh sits in a pocket: full AO turns it into a black void
    aoStrength: { [MAT.grille]: 0.45 },
    bounds: { min: [-1.1, 0.0, -2.45], max: [1.1, 1.4, 2.5] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [[[0.88, 0.78], [0.9, 0.5], [0.86, 0.25], [-0.32, 0.25], [-0.34, 0.5], [-0.32, 0.8]]],
        top: [
          [[-0.68, 0.99], [0.68, 0.99], [0.76, 1.6], [0.74, 2.1], [-0.74, 2.1], [-0.76, 1.6], [-0.68, 0.99]],
          [[-0.62, -1.42], [0.62, -1.42], [0.72, -2.06], [-0.72, -2.06], [-0.62, -1.42]],
        ],
      },
      // `plate`: the licence plate painted onto its panel between the tail lamps (rear view, metres)
      livery: {
        door: [0.25, 0.42],
        shoulder: 0.68,
        cabin: { x: 0.6, z0: -1.38, z1: 0.95 },
        plate: { x: 0, y: 0.67, w: 0.3, h: 0.15, text: 'KD 1972' },
      },
      tailLights: [
        [0.5, 0.67, -2.18],
        [-0.5, 0.67, -2.18],
      ],
      headLights: [
        [0.57, 0.56, 2.18],
        [-0.57, 0.56, 2.18],
      ],
      exhausts: [
        [0.46, 0.22, -2.24],
        [-0.46, 0.22, -2.24],
      ],
    },
  };
}
