// JUKEBOX - a late-50s American land yacht. A long, wide, low two-door hardtop: quad headlamps under
// chrome visors on the fender tips, a wide chrome grille, massive chrome bumpers (two bullets and
// amber parking lamps on the front one, the exhaust ports in the ends of the rear one), a hood
// ornament, a wide windshield and a pillarless glasshouse in chrome frames, a chrome spear down each
// side over chrome sills and arch trims, skirts over the rear wheels, huge chrome-edged tail fins
// carrying twin bullet tail lamps in chrome rings, a chrome grille across the tail echoing the front
// one, and whitewall tyres. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCapsule, sdEllipsoid } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW, offsetLoop } from '../decals.js';

export function buildJukebox() {
  const WH = {
    // (small rims on tall sidewalls, wide whitewalls on them)
    front: { z: 1.55, y: 0.36, x: 0.8, r: 0.36, w: 0.21, rim: 0.2, whitewall: 0.075 },
    rear: { z: -1.6, y: 0.36, x: 0.8, r: 0.36, w: 0.21, rim: 0.2, whitewall: 0.075 },
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
  const REAR_GLASS = mirrorU([
    [0, -0.78],
    [0.64, -0.8],
    [0.7, -1.05],
    [0.62, -1.36],
    [0, -1.4],
  ]);
  const rearGlass = new Profile2D(REAR_GLASS, small);
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
    const { dBody, dCab, cS, cP, bP } = S;
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
    // (the rear one was once bounded the wrong way round, z < -2.4 written as -2.4 - z < 0, and only
    // a sliver behind each rear wheel was ever built)
    if (z < -2.35 && y > 0.22 && y < 0.5) {
      acc.add(Math.max(roundEdge(bodyPlan.sample(ax, z) - 0.06, Math.abs(y - 0.35) - 0.07, 0.03), z + 2.4), MAT.chrome, 0.015);
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
    // chrome visors over the headlamps, along the top of the fender tips
    if (z > 2.55 && y > 0.68 && y < 0.74 && ax > 0.55 && ax < 0.96) {
      acc.add(roundEdge(Math.max(sh - 0.02, -(sh + 0.01)), sdRoundBox(ax - 0.75, y - 0.71, 0, 0.18, 0.011, 1, 0.008), 0.005), MAT.chrome, 0.004);
    }
    // chrome sills between the wheels, chrome trims round the front wheel arches and along the
    // foot of the rear skirts (the arch cuts come later and leave them be)
    if (ax > 0.85 && y > 0.24 && y < 0.34 && z > -1.25 && z < 1.17) {
      acc.add(roundEdge(Math.max(bP - 0.005, -(bP + 0.015)), sdRoundBox(z + 0.04, y - 0.29, 0, 1.14, 0.02, 1, 0.01), 0.004), MAT.chrome, 0.003);
    }
    if (ax > 0.85 && y > 0.28 && y < 0.82) {
      const band = Math.max(bP - 0.006, -(bP + 0.015));
      if (Math.abs(z - WH.front.z) < 0.48) {
        acc.add(roundEdge(band, Math.abs(Math.hypot(y - WH.front.y, z - WH.front.z) - (WH.front.r + GAP + 0.02)) - 0.011, 0.004), MAT.chrome, 0.003);
      }
      if (Math.abs(z - WH.rear.z) < 0.42 && y < 0.4) {
        acc.add(roundEdge(band, Math.max(Math.abs(y - 0.375) - 0.011, Math.abs(z - WH.rear.z) - 0.39), 0.004), MAT.chrome, 0.003);
      }
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
    // window openings through the cabin walls (glass panes sit in them, chrome frames round them)
    if (y > 0.86 && z < 1.1 && z > -1.52) {
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
    // twin bullet tail lamps in each fin's trailing edge, a chrome ring where each leaves the fin
    if (ax > 0.82 && y > 0.86 && y < 1.1 && z < -2.55) {
      for (const yc of [0.935, 1.025]) {
        acc.add(sdEllipsoid(ax - 0.93, y - yc, z + 2.68, 0.032, 0.032, 0.06), MAT.tail, 0.006);
        acc.add(Math.hypot(Math.hypot(ax - 0.93, y - yc) - 0.036, z + 2.69) - 0.008, MAT.chrome, 0.004);
      }
    }
    // the tail: a chrome strip across the deck lid; under it a chrome grille right across the tail,
    // echoing the front one, with the plate standing in its middle and a reversing lamp either side
    if (z < -2.55 && y > 0.42 && y < 0.86 && ax < 0.92) {
      acc.add(Math.max(Math.hypot(y - 0.8, sh + 0.004) - 0.011, ax - 0.86), MAT.chrome, 0.003);
      const grille = sdRoundBox(x, y - 0.56, 0, 0.84, 0.09, 1, 0.025);
      const plate = sdRoundBox(x, y - 0.555, 0, 0.165, 0.08, 1, 0.012);
      const lamp = sdRoundBox(ax - 0.52, y - 0.56, 0, 0.09, 0.035, 1, 0.012);
      acc.cut(pocket(grille, sh, 0.04, po), po.wall ? MAT.chrome : MAT.grille, 0.006);
      acc.add(edge(Math.abs(grille + 0.005) - 0.006, Math.max(sh - 0.005, -(sh + 0.015))), MAT.chrome, 0.002);
      // (the bars stand on the grille's floor and stop short of the plate and the lamps)
      for (const yb of [0.515, 0.56, 0.605]) {
        acc.add(edge(Math.max(grille, Math.abs(y - yb) - 0.007, -plate - 0.012, -lamp - 0.012), Math.max(sh + 0.006, -(sh + 0.045))), MAT.chrome, 0.002);
      }
      acc.add(edge(plate, Math.max(sh + 0.012, -(sh + 0.045))), MAT.paint, 0.002);
      acc.add(edge(lamp, Math.max(sh + 0.01, -(sh + 0.045))), MAT.reverse, 0.002);
    }
    // the exhausts end in ports in the rear bumper's ends; amber parking lamps in the front bumper
    // under the headlamps
    if (z < -2.6 && y > 0.26 && y < 0.42 && ax > 0.45 && ax < 0.8) {
      const bumper = roundEdge(bodyPlan.sample(ax, z) - 0.06, Math.abs(y - 0.35) - 0.07, 0.03);
      acc.cut(pocket(sdRoundBox(ax - 0.62, y - 0.345, 0, 0.075, 0.032, 1, 0.03), bumper, 0.05, po), po.wall ? MAT.chrome : MAT.exhaust, 0.004);
    }
    if (z > 2.6 && y > 0.29 && y < 0.37 && ax > 0.6 && ax < 0.92) {
      const bumper = roundEdge(bodyPlan.sample(ax, z) - 0.06, Math.abs(y - 0.33) - 0.075, 0.03);
      acc.cut(pocket(sdRoundBox(ax - 0.76, y - 0.33, 0, 0.075, 0.018, 1, 0.016), bumper, 0.012, po), po.wall ? MAT.chrome : MAT.amber, 0.003);
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
    if (acc.m === MAT.paint) {
      if (y < 0.235) acc.m = MAT.trim; // underbody (the floor sits at 0.22)
      // a chrome edge along the top and trailing edge of each fin
      else if (ax > 0.82 && y > 0.92 && z < -1.7 && z > -2.75 && finSide.sample(z, y) > -0.016) acc.m = MAT.chrome;
    }
    out.m = acc.m;
    return acc.d;
  }

  // the far model (distant rivals): the thin chrome trims merge into what they're laid on (every
  // material border keeps its full-resolution edge through simplification), the tail grille reads
  // as one chrome panel
  function farMat(x, y, z, m) {
    const ax = Math.abs(x);
    if (m === MAT.chrome) {
      if (ax > 0.85 && y < 0.33 && Math.abs(z + 0.04) < 1.2) return MAT.paint; // sills
      if (ax > 0.85 && y < 0.82 && Math.abs(Math.hypot(y - WH.front.y, z - WH.front.z) - 0.42) < 0.03) return MAT.paint; // front arch trims
      if (ax > 0.85 && y > 0.35 && y < 0.4 && Math.abs(z - WH.rear.z) < 0.42) return MAT.paint; // skirt strips
      if (ax > 0.82 && y > 0.9 && z < -1.7 && z > -2.66) return MAT.paint; // fin edges
      if (y > 0.78 && y < 1.4 && z > -1.55 && z < 1.15 && ax < 0.9) return MAT.trim; // window frames (the windshield's along the cowl too)
    }
    if (z < -2.55 && y > 0.45 && y < 0.68 && ax < 0.88 && (m === MAT.grille || m === MAT.reverse)) return MAT.chrome;
    return m;
  }

  // ------------------------------------------------------------------ glass, lamps
  const decals = [];
  for (const view of [VIEW.left, VIEW.right]) {
    for (const outline of [DOOR_WIN, QUARTER_WIN]) decals.push({ kind: 'panel', mat: MAT.window, view, outline, depth: 0.006 });
  }
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 });
  decals.push({ kind: 'panel', mat: MAT.window, view: VIEW.top, outline: REAR_GLASS, depth: 0.006, rings: 6 });
  // chunky chrome frames round all the glass: real strips laid on the skin (painted onto it, they
  // came out ragged)
  const frame = (view, outline) => ({ kind: 'bead', mat: MAT.chrome, view, path: offsetLoop(outline, 0.01), closed: true, width: 0.016, height: 0.005 });
  for (const view of [VIEW.left, VIEW.right]) for (const outline of [DOOR_WIN, QUARTER_WIN]) decals.push(frame(view, outline));
  decals.push(frame(VIEW.top, WINDSHIELD), frame(VIEW.top, REAR_GLASS));
  for (const sx of [1, -1]) {
    for (const xc of [0.66, 0.84]) decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [xc * sx, 0.615], radius: 0.045, depth: 0.028, segments: 24 });
  }

  return {
    id: 'jukebox',
    sdf,
    shell,
    farMat,
    decals,
    // the grille meshes sit in pockets: full AO turns them into black voids
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
        [0.62, 0.345, -2.8],
        [-0.62, 0.345, -2.8],
      ],
    },
  };
}
