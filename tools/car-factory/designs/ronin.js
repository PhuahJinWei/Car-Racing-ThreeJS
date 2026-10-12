// RONIN - a late-90s twin-turbo coupe wearing a wide-body kit. A low rounded nose with swept
// projector headlamps, a big mouth showing the intercooler, a carbon lip, front fenders that bulge
// up over the wheels, flared arches and deep skirts, a bubble glasshouse with a blacked-out B-pillar,
// a glass hatch under a tall hoop wing, quad round tail lamps in a smoked band, a carbon diffuser
// and one big exhaust. Left-hand drive.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdRoundBox, sdCylZ, sdCapsule } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildRonin() {
  const WH = {
    front: { z: 1.32, y: 0.345, x: 0.79, r: 0.345, w: 0.25 },
    rear: { z: -1.25, y: 0.355, x: 0.795, r: 0.355, w: 0.29 },
  };
  const GAP = 0.04; // tyre to arch clearance

  // ------------------------------------------------------------------ main volumes
  // side silhouette (z, y): a low rounded nose, a long hood falling to it, the beltline rising to a
  // short deck, a rounded tail
  const bodySide = new Profile2D(
    [
      [2.17, 0.15, 1],
      [2.24, 0.18],
      [2.275, 0.24],
      [2.29, 0.32],
      [2.285, 0.41],
      [2.265, 0.48],
      [2.225, 0.545],
      [2.16, 0.595],
      [2.06, 0.632],
      [1.9, 0.665],
      [1.6, 0.715],
      [1.3, 0.755],
      [1.0, 0.79],
      [0.8, 0.808],
      [0.4, 0.832],
      [0.0, 0.852],
      [-0.5, 0.874],
      [-1.0, 0.902],
      [-1.5, 0.935],
      [-1.85, 0.957],
      [-2.1, 0.97],
      [-2.22, 0.962],
      [-2.28, 0.93],
      [-2.305, 0.86],
      [-2.315, 0.72],
      [-2.315, 0.52],
      [-2.305, 0.4],
      [-2.275, 0.3],
      [-2.21, 0.22],
      [-2.1, 0.18, 1],
    ],
    { band: 0.2 },
  );
  // plan outline (x, z): a rounded nose, flares over both axles with a pinched waist between them
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.29],
      [0.38, 2.28],
      [0.6, 2.245],
      [0.76, 2.17],
      [0.86, 2.05],
      [0.905, 1.9],
      [0.925, 1.7],
      [0.935, 1.45],
      [0.935, 1.2],
      [0.925, 0.98],
      [0.905, 0.75],
      [0.895, 0.4],
      [0.895, -0.3],
      [0.905, -0.6],
      [0.93, -0.88],
      [0.95, -1.1],
      [0.955, -1.35],
      [0.95, -1.6],
      [0.935, -1.85],
      [0.9, -2.05],
      [0.83, -2.2],
      [0.65, -2.29],
      [0.3, -2.315],
      [0, -2.315],
    ]),
    { band: 0.2 },
  );
  // glasshouse: a raked windshield curving into a short bubble roof, the glass hatch sloping down to
  // the deck
  const cabSide = new Profile2D(
    [
      [0.99, 0.79, 1],
      [0.95, 0.85],
      [0.7, 0.99],
      [0.5, 1.09],
      [0.3, 1.185],
      [0.1, 1.245],
      [-0.15, 1.268],
      [-0.45, 1.262],
      [-0.7, 1.228],
      [-0.95, 1.16],
      [-1.2, 1.075],
      [-1.45, 0.995],
      [-1.62, 0.955, 1],
      [-1.62, 0.75, 1],
      [0.99, 0.7, 1],
    ],
    { band: 0.2 },
  );
  // (straight sides right up to the windshield base, so the pillars rise from its corners)
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.0],
      [0.6, 0.99],
      [0.74, 0.95],
      [0.775, 0.86],
      [0.78, 0.4],
      [0.78, -0.4],
      [0.765, -0.9],
      [0.72, -1.25],
      [0.62, -1.5],
      [0.42, -1.64],
      [0, -1.67],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  // door glass and a quarter window tapering into the hatch, inset from the pillars; the B-pillar
  // between them is blacked out
  const DOOR_WIN = [
    [0.745, 0.89, 1],
    [0.67, 0.932],
    [0.47, 1.032],
    [0.275, 1.125],
    [0.085, 1.19],
    [-0.15, 1.216],
    [-0.36, 1.214, 1],
    [-0.36, 0.905, 1],
  ];
  const QUARTER_WIN = [
    [-0.44, 1.212, 1],
    [-0.7, 1.178],
    [-0.937, 1.112],
    [-1.184, 1.028],
    [-1.3, 0.99, 1],
    [-1.12, 0.94],
    [-0.44, 0.908, 1],
  ];
  const WINDSHIELD = mirrorU([
    [0, 0.94],
    [0.6, 0.935],
    [0.69, 0.87],
    [0.66, 0.6],
    [0.6, 0.4],
    [0.55, 0.29],
    [0, 0.27],
  ]);
  const doorWin = new Profile2D(DOOR_WIN, small);
  const quarterWin = new Profile2D(QUARTER_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const rearGlass = new Profile2D(
    mirrorU([
      [0, -0.76],
      [0.5, -0.78],
      [0.55, -1.05],
      [0.5, -1.35],
      [0.38, -1.5],
      [0, -1.53],
    ]),
    small,
  );
  // headlamp as seen from the front (|x|, y): a teardrop, pointed at the inner end, swelling as it
  // sweeps up and out round the corner
  const headFoot = new Profile2D(
    [
      [0.38, 0.548, 1],
      [0.5, 0.537],
      [0.66, 0.539],
      [0.8, 0.552],
      [0.875, 0.585],
      [0.885, 0.625],
      [0.85, 0.656],
      [0.74, 0.66],
      [0.58, 0.63],
      [0.44, 0.583],
    ],
    { band: 0.08, res: 0.002 },
  );
  // intersection of two roughly orthogonal fields with the true distance outside the edge, so the
  // baked AO doesn't see phantom occlusion around the part
  const edge = (a, b) => (a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b));
  const roundEdge = (a, b, r) => edge(a + r, b + r) - r;
  // the hoop wing seen from behind (|x|, y): a strut up from the deck, a rounded shoulder and the
  // blade across; distance to that centreline
  const hoop = (ax, y) => {
    const strut = Math.hypot(ax - 0.69, y - Math.min(1.11, Math.max(0.9, y)));
    const blade = Math.hypot(ax - Math.min(0.6, ax), y - 1.2);
    const dx = ax - 0.6;
    const dy = y - 1.11;
    const arc = dx >= 0 && dy >= 0 ? Math.abs(Math.hypot(dx, dy) - 0.09) : 1;
    return Math.min(strut, blade, arc);
  };

  // cross-section: slightly barrelled flanks, tucked in under the sills
  const sec = (y) => {
    const barrel = 1 - 0.035 * Math.min(1, ((y - 0.52) / 0.36) ** 2);
    return y < 0.26 ? barrel * (0.95 + 0.05 * smoothstep(0.13, 0.26, y)) : barrel;
  };
  // the front fenders bulge up over the wheels (the hood sits low between them); the rear haunches
  // rise a little over the rear wheels
  const fenderRise = (ax, z) => {
    const front = 0.065 * smoothstep(0.8, 1.05, z) * (1 - smoothstep(1.75, 2.15, z));
    const rear = 0.025 * smoothstep(-0.75, -1.0, z) * (1 - smoothstep(-1.55, -1.85, z));
    return smoothstep(0.36, 0.62, ax) * (front + rear);
  };

  // un-cut outer skin (also used to lay the glass and lamps onto)
  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y - fenderRise(ax, z) * smoothstep(0.45, 0.65, y));
    // (a generous blend: every edge of the body is rounded off)
    const dBody = smax(bS, bP, 0.12);
    const tilt = Math.max(0, y - 0.86) * 0.55;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.08);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    return smin(dBody, dCab, 0.04);
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
    // carbon lip under the nose, wrapping round the corners
    if (z > 1.85 && y > 0.12 && y < 0.2) {
      acc.add(Math.max(edge(bodyPlan.sample(ax, z) - 0.035, Math.abs(y - 0.158) - 0.011), 1.95 - z), MAT.carbon, 0.006);
    }
    // deep side skirts between the arches, out flush with the flares
    if (ax > 0.7 && y < 0.34 && z < 1.0 && z > -0.92) {
      acc.add(Math.max(roundEdge(ax - 0.915, Math.abs(y - 0.215) - 0.065, 0.025), Math.abs(z - 0.04) - 0.92), MAT.paint, 0.03);
    }
    // the hoop wing: narrow struts standing on the deck and sweeping back, curving over into a wide
    // blade that is thickest near its leading edge and tilted up at the back
    if (y > 0.88 && y < 1.26 && z < -1.84 && z > -2.2 && ax < 0.75) {
      const t = smoothstep(1.08, 1.18, y);
      const zc = -1.97 - 0.07 * smoothstep(0.95, 1.12, y) + 0.02 * t;
      const half = 0.065 + 0.065 * t;
      const lead = smoothstep(zc - half, zc + 0.4 * half, z);
      const thick = 0.012 + t * (0.008 * lead - 0.006);
      acc.add(roundEdge(hoop(ax, y + t * (z - zc) * 0.07) - thick, Math.abs(z - zc) - half, 0.005), MAT.paint, 0.03);
    }
    // aero mirrors on short stalks from the door tops
    if (z > 0.6 && z < 0.82 && y > 0.84 && y < 1.02 && ax > 0.72) {
      acc.add(sdRoundBox(ax - 0.925, y - 0.955, z - 0.7, 0.065, 0.038, 0.05, 0.034), MAT.paint, 0.004);
      acc.add(sdCapsule(ax, y, z, 0.75, 0.875, 0.72, 0.88, 0.94, 0.7, 0.011), MAT.trim, 0.008);
    }
    // one big exhaust under the right-hand side of the bumper
    if (z < -2.12 && y < 0.36 && x < -0.38 && x > -0.66) {
      acc.add(sdCylZ(x + 0.52, y - 0.255, z + 2.28, 0.06, 0.09), MAT.chrome, 0.004);
      acc.cut(sdCylZ(x + 0.52, y - 0.255, z + 2.28, 0.048, 0.2), MAT.exhaust);
    }

    // ---------------------------------------------------------------- cuts
    // cabin: hollow the glasshouse and the tub below it, buckets in front, a small bench behind
    if (y > 0.2 && z < 1.0 && z > -1.6 && ax < 0.86) {
      const tub = Math.max(dBody + 0.035, ax - 0.8);
      // (the rear wheel wells stay closed off from the cabin)
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.24 - y, z - 0.93, -1.45 - z, 0.03 - arch(ax, y, z, WH.rear));
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.37, seatZ: -0.05, floorY: 0.24, dashZ: 0.62, dashY: 0.75, dashW: 0.72, wheelZ: 0.38, wheelY: 0.77, recline: 0.42 });
      if (z < -0.55) {
        acc.add(sdRoundBox(x, y - 0.34, z + 0.88, 0.6, 0.06, 0.2, 0.05), MAT.interior, 0.02);
        acc.add(sdRoundBox(x, y - 0.6, z + 1.12, 0.6, 0.24, 0.06, 0.05), MAT.interior, 0.03);
      }
    }
    // window openings through the cabin walls (glass panes sit in them); the hatch glass is a
    // shallow recess; the B-pillar is blacked out
    if (y > 0.86 && z < 1.0 && z > -1.62) {
      const onCab = dCab - dBody + 0.004; // negative where the glasshouse is the outer surface
      const top = cP - cS + 0.01; // negative on the top of the glasshouse
      const side = cS - cP + 0.01; // negative on the sides of the glasshouse
      let reg = Math.max(Math.min(doorWin.sample(z, y), quarterWin.sample(z, y)), side, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(Math.abs(z + 0.4) - 0.045, Math.abs(y - 1.058) - 0.158, side, onCab);
      acc.cut(pocket(reg, sh, 0.004, po), MAT.trim, 0.002);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(rearGlass.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.008, po), MAT.glass, 0.003);
    }
    // a big mouth in the bumper with the intercooler core across it: silver fins between end tanks
    // (measured from the nose's plan outline: from the skin, the underside right below would cut it
    // too)
    if (z > 2.05 && y > 0.18 && y < 0.46 && ax < 0.56) {
      const mouth = sdRoundBox(x, y - 0.32, 0, 0.47, 0.085, 1, 0.045);
      acc.cut(pocket(mouth, S.bP, 0.085, po), po.wall ? MAT.trim : MAT.grille, 0.008);
      const dep = S.bP + 0.04; // from a sheet 4 cm behind the face
      for (let i = 0; i < 5; i++) acc.add(Math.hypot(y - (0.264 + i * 0.028), dep, Math.max(ax - 0.42, 0)) - 0.009, MAT.chrome, 0.002);
      acc.add(Math.max(Math.abs(ax - 0.435) - 0.022, Math.abs(y - 0.32) - 0.068, Math.abs(dep) - 0.022), MAT.chrome, 0.004);
    }
    // round fog lamps in the bumper corners (the glowing lenses are decals)
    if (z > 1.95 && y > 0.22 && y < 0.4 && ax > 0.6 && ax < 0.84) {
      acc.cut(pocket(Math.hypot(ax - 0.72, y - 0.31) - 0.045, sh, 0.025, po), po.wall ? MAT.trim : MAT.head, 0.004);
    }
    // headlamp pockets (the projector lenses are decals)
    if (z > 1.85 && y > 0.5 && y < 0.68 && ax > 0.35) {
      acc.cut(pocket(headFoot.sample(ax, y), sh, 0.03, po), po.wall ? MAT.trim : MAT.head, 0.004);
    }
    // smoked tail band with the quad round lamps standing in it (the inner pair have clear reverse
    // lamps at their centres)
    if (z < -2.15 && y > 0.64 && y < 0.86 && ax < 0.84) {
      acc.cut(pocket(sdRoundBox(x, y - 0.75, 0, 0.8, 0.07, 1, 0.03), sh, 0.022, po), MAT.trim, 0.006);
      for (const xc of [0.43, 0.65]) {
        const r = Math.hypot(ax - xc, y - 0.75);
        acc.add(Math.max(r - 0.058, sh + 0.004, -(sh + 0.03)), MAT.tail, 0.003);
        if (xc < 0.5) acc.add(Math.max(r - 0.022, sh + 0.002, -(sh + 0.03)), MAT.reverse, 0.002);
      }
    }
    // licence plate recess in the rear bumper (the livery paints the plate)
    if (z < -2.15 && y > 0.36 && y < 0.58 && ax < 0.22) {
      acc.cut(pocket(sdRoundBox(x, y - 0.47, 0, 0.16, 0.078, 1, 0.02), sh, 0.012, po), po.wall ? MAT.trim : MAT.paint, 0.003);
    }
    // wheel arches (open to the side, black liners inside)
    if (ax > 0.55 && y < 0.85) {
      if (Math.abs(z - WH.front.z) < 0.55) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.012);
      if (Math.abs(z - WH.rear.z) < 0.55) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.012);
    }
    // mirror glass
    if (z > 0.6 && z < 0.82 && y > 0.84 && y < 1.02 && ax > 0.72) {
      acc.cut(sdRoundBox(ax - 0.925, y - 0.955, z - 0.648, 0.055, 0.027, 0.008, 0.008), MAT.chrome, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint) {
      if (y < 0.19) acc.m = MAT.trim; // underbody (the floor sits at 0.15-0.18)
      else if (z < -1.95 && y < 0.33) acc.m = MAT.carbon; // diffuser across the lower bumper
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
  const ring = (cx, cy, r) => Array.from({ length: 33 }, (_, i) => [cx + Math.cos((i / 32) * Math.PI * 2) * r, cy + Math.sin((i / 32) * Math.PI * 2) * r]);
  for (const sx of [1, -1]) {
    // twin projector lenses in each headlamp
    for (const [u, v, r] of [
      [0.56, 0.572, 0.025],
      [0.76, 0.605, 0.036],
    ]) {
      decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, v], radius: r, depth: 0.024, segments: 28 });
    }
    decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [0.72 * sx, 0.31], radius: 0.03, depth: 0.02, segments: 24 });
    // a glowing ring in each round tail lamp
    for (const xc of [0.43, 0.65]) decals.push({ kind: 'ribbon', mat: MAT.tailglow, view: VIEW.rear, path: ring(xc * sx, 0.75, 0.04), width: 0.012, depth: 0.002 });
  }

  return {
    id: 'ronin',
    sdf,
    shell,
    decals,
    // the grille mesh and the intercooler sit in a pocket: full AO turns them into black voids
    aoStrength: { [MAT.grille]: 0.45, [MAT.chrome]: 0.6 },
    bounds: { min: [-1.2, 0.0, -2.6], max: [1.2, 1.4, 2.5] },
    meta: {
      wheels: WH,
      // panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
      panels: {
        side: [[[0.86, 0.84], [0.9, 0.6], [0.86, 0.3], [-0.36, 0.3], [-0.38, 0.6], [-0.36, 0.89]]],
        top: [
          [[-0.78, 0.96], [0.78, 0.96], [0.84, 1.6], [0.72, 2.1], [-0.72, 2.1], [-0.84, 1.6], [-0.78, 0.96]],
          [[-0.62, -1.62], [0.62, -1.62], [0.74, -2.18], [-0.74, -2.18], [-0.62, -1.62]],
        ],
        // the bumpers' top edges: under the headlamps, and under the tail band
        front: [[[-0.9, 0.5], [0.9, 0.5]]],
        rear: [[[-0.92, 0.62], [0.92, 0.62]]],
      },
      // `plate`: the licence plate painted into the bumper recess (rear view, metres)
      livery: {
        door: [0.25, 0.55],
        shoulder: 0.72,
        cabin: { x: 0.6, z0: -1.55, z1: 0.95 },
        plate: { x: 0, y: 0.47, w: 0.3, h: 0.15, text: 'PS 280' },
      },
      tailLights: [
        [0.54, 0.75, -2.3],
        [-0.54, 0.75, -2.3],
      ],
      headLights: [
        [0.62, 0.58, 2.2],
        [-0.62, 0.58, 2.2],
      ],
      exhausts: [[-0.52, 0.255, -2.37]],
    },
  };
}
