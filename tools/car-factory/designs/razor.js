// RAZOR X - knife-edged hypercar. A wedge from a pointed nose to a high, flat tail, creased
// flanks, a fighter canopy with a roof snorkel, a louvred engine cover, a swan-neck rear wing,
// Y-shaped light signatures and quad exhausts in a hexagonal surround.
// Axes: +X = car's left, +Y = up, +Z = forward. Metres.
import { Profile2D, mirrorU, smax, smin, smoothstep, sdBox, sdRoundBox, sdCylZ, sdCapsule, sdEllipsoid } from '../sdf.js';
import { MAT, Acc, pocket, addCockpit } from '../parts.js';
import { VIEW } from '../decals.js';

export function buildRazor() {
  const WH = {
    front: { z: 1.36, y: 0.345, x: 0.86, r: 0.345, w: 0.27 },
    rear: { z: -1.36, y: 0.37, x: 0.85, r: 0.37, w: 0.34 },
  };
  const GAP = 0.04;

  // ------------------------------------------------------------------ main volumes
  const bodySide = new Profile2D(
    [
      [2.25, 0.1, 1],
      [2.36, 0.15],
      [2.395, 0.235, 1],
      [2.3, 0.3],
      [2.05, 0.41],
      [1.85, 0.5],
      [1.62, 0.635],
      [1.36, 0.78],
      [1.0, 0.795],
      [0.5, 0.805],
      [0.0, 0.83],
      [-0.6, 0.875],
      [-1.2, 0.925],
      [-1.8, 0.955],
      [-2.3, 0.965],
      [-2.39, 0.955, 1],
      [-2.405, 0.62],
      [-2.37, 0.48, 1],
      [-2.1, 0.28],
      [-1.75, 0.13],
      [-1.55, 0.1, 1],
    ],
    { band: 0.2 },
  );
  const bodyPlan = new Profile2D(
    mirrorU([
      [0, 2.395],
      [0.4, 2.37, 1],
      [0.78, 2.17],
      [0.96, 1.9, 1],
      [1.0, 1.4],
      [0.985, 0.95, 1],
      [0.95, 0.35],
      [0.965, -0.3],
      [1.03, -0.85, 1],
      [1.045, -1.36],
      [1.035, -1.9, 1],
      [0.97, -2.28],
      [0.62, -2.4, 1],
      [0, -2.41],
    ]),
    { band: 0.2 },
  );
  const cabSide = new Profile2D(
    [
      [1.15, 0.6, 1],
      [1.1, 0.7],
      [0.55, 0.93],
      [0.15, 1.06],
      [-0.35, 1.115],
      [-0.85, 1.09],
      [-1.3, 1.02],
      [-1.76, 0.955, 1],
      [-1.76, 0.7, 1],
      [1.15, 0.52, 1],
    ],
    { band: 0.2 },
  );
  const cabPlan = new Profile2D(
    mirrorU([
      [0, 1.18],
      [0.42, 1.14],
      [0.68, 0.9],
      [0.8, 0.4],
      [0.815, -0.2],
      [0.77, -0.8],
      [0.6, -1.3],
      [0.32, -1.68],
      [0, -1.78],
    ]),
    { band: 0.2 },
  );

  // ------------------------------------------------------------------ graphics (2D footprints)
  const small = { band: 0.12, res: 0.003 };
  const SIDE_WIN = [
    [0.92, 0.79, 1],
    [0.6, 0.905],
    [0.2, 1.03],
    [-0.2, 1.07, 1],
    [-0.75, 1.05],
    [-1.02, 0.985, 1],
    [-0.7, 0.905],
    [-0.1, 0.862, 1],
    [0.6, 0.815],
  ];
  const WINDSHIELD = mirrorU([
    [0, 1.1],
    [0.45, 1.07],
    [0.6, 0.85],
    [0.62, 0.45],
    [0.55, 0.12],
    [0, 0.08],
  ]);
  const sideWin = new Profile2D(SIDE_WIN, small);
  const windshield = new Profile2D(WINDSHIELD, small);
  const engineCover = new Profile2D(
    mirrorU([
      [0, -1.02],
      [0.46, -1.06, 1],
      [0.5, -1.42],
      [0.36, -1.68, 1],
      [0, -1.72],
    ]),
    small,
  );
  const sideIntake = new Profile2D(
    [
      [-0.18, 0.73, 1],
      [-0.96, 0.75, 1],
      [-0.99, 0.42, 1],
      [-0.45, 0.35, 1],
    ],
    small,
  );
  const hoodDuct = new Profile2D(
    mirrorU([
      [0, 1.98],
      [0.2, 1.95, 1],
      [0.26, 1.6, 1],
      [0, 1.56],
    ]),
    small,
  );
  // front intakes (|x|, y): a low centre mouth and big angular corner intakes
  const frontMouth = new Profile2D(
    mirrorU([
      [0, 0.27],
      [0.36, 0.26, 1],
      [0.42, 0.15, 1],
      [0, 0.145],
    ]),
    small,
  );
  const cornerIntake = new Profile2D(
    [
      [0.5, 0.16, 1],
      [0.92, 0.16, 1],
      [0.97, 0.36, 1],
      [0.82, 0.4, 1],
      [0.56, 0.3, 1],
    ],
    small,
  );
  // headlight slit (|x|, y), swept up toward the corner
  const headFoot = new Profile2D(
    [
      [0.38, 0.405, 1],
      [0.62, 0.438],
      [0.9, 0.49, 1],
      [0.93, 0.47],
      [0.66, 0.42],
      [0.42, 0.392],
    ],
    { band: 0.08, res: 0.002 },
  );
  // Y-shaped tail light, rear view (|x|, y)
  const tailArms = [
    [0.72, 0.775, 0.54, 0.875],
    [0.72, 0.775, 0.93, 0.87],
    [0.72, 0.775, 0.72, 0.64],
  ];
  const seg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - dx * h, py - ay - dy * h);
  };
  const tailY = (ax, y) => Math.min(...tailArms.map(([a, b, c, d]) => seg(ax, y, a, b, c, d))) - 0.013;
  // hexagonal exhaust surround (x, y)
  const hex = (x, y, r) => {
    const qx = Math.abs(x);
    const qy = Math.abs(y);
    return Math.max(qx * 0.866 + qy * 0.5, qy) - r;
  };
  // rear wing section (z, y): cambered, trailing edge up
  const wingFoil = new Profile2D(
    [
      [-1.84, 1.236],
      [-1.9, 1.256],
      [-2.0, 1.267],
      [-2.12, 1.272],
      [-2.25, 1.28, 1],
      [-2.12, 1.248],
      [-2.0, 1.234],
      [-1.9, 1.226],
    ],
    { band: 0.1, res: 0.002 },
  );

  // cross-section: a creased lower blade, steep flanks, a sharp shoulder that rises toward the
  // rear and a strong tumblehome above it
  const ramp = (x, k) => (x > 12 * k ? x : k * Math.log1p(Math.exp(x / k)));
  const sec = (y, z) => {
    if (y < 0.33) return 1 - (0.075 * ramp(0.33 - y, 0.006)) / 0.23;
    const shoulder = 0.55 + 0.06 * smoothstep(0.4, -1.6, z);
    return 1.0 - ramp(y - shoulder, 0.007) * 0.36;
  };
  // the hood sinks between crowned fender pods
  const dip = (ax, y, z) => {
    if (y < 0.3) return 0;
    return smoothstep(0.85, 1.1, z) * (1 - smoothstep(2.0, 2.3, z)) * 0.1 * (1 - smoothstep(0.3, 0.74, ax)) * smoothstep(0.3, 0.42, y);
  };

  const S = { bS: 0, bP: 0, dBody: 0, dCab: 0, cS: 0, cP: 0 };
  function shell(x, y, z) {
    const ax = Math.abs(x);
    const s = sec(y, z);
    const bP = bodyPlan.sample(ax / s, z) * s;
    const bS = bodySide.sample(z, y + dip(ax, y, z));
    const dBody = smax(bS, bP, 0.03);
    const tilt = Math.max(0, y - 0.78) * 0.5;
    const cP = cabPlan.sample(ax + tilt, z);
    const cS = cabSide.sample(z, y);
    const dCab = smax(cS, cP, 0.05);
    S.bS = bS;
    S.bP = bP;
    S.dBody = dBody;
    S.dCab = dCab;
    S.cS = cS;
    S.cP = cP;
    return smin(dBody, dCab, 0.025);
  }

  const acc = new Acc();
  const po = { wall: false };
  const arch = (ax, y, z, w) => Math.max(Math.hypot(y - w.y, z - w.z) - (w.r + GAP), w.x - w.w / 2 - 0.04 - ax);

  function sdf(x, y, z, out) {
    const ax = Math.abs(x);
    const sh = shell(x, y, z);
    const { bS, bP, dBody, dCab, cS, cP } = S;
    acc.set(sh, MAT.paint);

    // angular scoop along the doors into the side intake
    if (ax > 0.6 && y > 0.2 && y < 0.78 && z > -1.1 && z < 0.75) {
      acc.cut(sdEllipsoid(ax - 1.2, y - 0.5, z + 0.25, 0.3, 0.2, 0.9), MAT.paint, 0.04);
    }

    // ---------------------------------------------------------------- add-ons
    // roof snorkel
    let snork = 1;
    if (y > 0.95 && ax < 0.3 && z < 0.1 && z > -1.2) {
      snork = sdRoundBox(x, y - 1.11, z + 0.62, 0.17, 0.075, 0.42, 0.055);
      acc.add(snork, MAT.paint, 0.06);
    }
    // side skirt blades
    if (y < 0.25 && ax > 0.7 && Math.abs(z) < 1.2) {
      acc.add(sdRoundBox(ax - 0.9, y - 0.125, z, 0.05, 0.015, 1.1, 0.01), MAT.carbon, 0.02);
    }
    // front splitter
    if (z > 1.9 && y < 0.2) {
      acc.add(Math.max(bodyPlan.sample(ax, z) - 0.045, Math.abs(y - 0.112) - 0.011, 2.0 - z), MAT.carbon, 0.008);
    }
    // diffuser strakes
    if (z < -1.5 && y < 0.5) {
      for (const xf of [0.12, 0.38, 0.62]) {
        acc.add(Math.max(sdBox(ax - xf, y - 0.3, z + 2.0, 0.008, 0.2, 0.42), -bS - 0.004, bS - 0.1), MAT.carbon);
      }
    }
    // swan-neck rear wing: cambered blade, end plates, pylons
    if (y > 0.9 && z < -1.7 && z > -2.35) {
      acc.add(Math.max(wingFoil.sample(z, y), ax - 0.98), MAT.carbon, 0.004);
      acc.add(sdRoundBox(ax - 0.99, y - 1.21, z + 2.05, 0.012, 0.1, 0.25, 0.008), MAT.carbon, 0.006);
      acc.add(sdRoundBox(ax - 0.36, y - 1.1, z + 2.0, 0.009, 0.17, 0.1, 0.008), MAT.carbon, 0.02);
    }
    // mirrors
    if (z > 0.55 && z < 0.95 && y > 0.75 && y < 1.0 && ax > 0.78) {
      acc.add(sdRoundBox(ax - 1.02, y - 0.885, z - 0.72, 0.09, 0.04, 0.05, 0.03), MAT.carbon, 0.006);
      acc.add(sdCapsule(ax, y, z, 0.86, 0.8, 0.79, 0.96, 0.87, 0.74, 0.013), MAT.carbon, 0.01);
    }

    // ---------------------------------------------------------------- cuts
    // cockpit: hollow glasshouse + tub, furnished
    if (y > 0.2 && z < 1.0 && z > -1.0 && ax < 0.9) {
      const tub = Math.max(dBody + 0.035, ax - 0.74);
      const inner = Math.max(Math.min(dCab + 0.025, tub), 0.26 - y, z - 0.92, -0.84 - z);
      acc.cut(inner, MAT.interior, 0.012);
      addCockpit(acc, x, y, z, { seatX: 0.36, seatZ: -0.3, floorY: 0.26, dashZ: 0.68, dashY: 0.68, dashW: 0.68, wheelZ: 0.4, wheelY: 0.68, recline: 0.45 });
    }
    if (y > 0.62 && z < 1.2 && z > -1.85) {
      const onCab = dCab - dBody + 0.004;
      const top = cP - cS + 0.01;
      let reg = Math.max(sideWin.sample(z, y), cS - cP + 0.01, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      reg = Math.max(windshield.sample(ax, z), top, onCab);
      acc.cut(pocket(reg, sh, 0.045, po), MAT.trim, 0.003);
      // louvred engine cover
      reg = Math.max(engineCover.sample(ax, z), top);
      acc.cut(pocket(reg, sh, 0.035, po), po.wall ? MAT.trim : MAT.grille, 0.004);
      for (let i = 0; i < 6; i++) {
        const zs = -1.12 - i * 0.105;
        acc.add(Math.max(reg, Math.abs(z - zs) - 0.009, sh + 0.004, -(sh + 0.034)), MAT.carbon, 0.002);
      }
    }
    // snorkel mouth
    if (snork < 0.1 && z > -0.45) {
      const reg = sdRoundBox(x, y - 1.13, 0, 0.13, 0.035, 1, 0.012);
      acc.cut(pocket(reg, snork, 0.1, po), po.wall ? MAT.trim : MAT.grille, 0.004);
    }
    // hood duct
    if (z > 1.4 && z < 2.1 && ax < 0.4 && y > 0.4) {
      acc.cut(pocket(hoodDuct.sample(ax, z), sh, 0.05, po), po.wall ? MAT.trim : MAT.grille, 0.004);
    }
    // front intakes with vertical fins in the corner intakes
    if (z > 1.85 && y < 0.45) {
      const m = frontMouth.sample(ax, y);
      const c = Math.max(cornerIntake.sample(ax, y), 2.0 - z); // stay on the nose face
      acc.cut(pocket(Math.min(m, c), bP, 0.14, po), po.wall ? MAT.trim : MAT.grille, 0.005);
      const inner = Math.max(bP + 0.014, -(bP + 0.135));
      for (const xf of [0.66, 0.8]) acc.add(Math.max(c, Math.abs(ax - xf) - 0.006, inner), MAT.carbon, 0.003);
    }
    // headlight slits
    if (z > 1.8 && y > 0.36 && y < 0.56 && ax > 0.3) {
      const d = pocket(headFoot.sample(ax, y), sh, 0.028, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.head, 0.003);
    }
    // side intakes
    if (ax > 0.6 && z < -0.1 && z > -1.1 && y > 0.28 && y < 0.82) {
      const reg = sideIntake.sample(z, y);
      acc.cut(pocket(reg, bP, 0.12, po), po.wall ? MAT.trim : MAT.grille, 0.006);
      for (const ys of [0.5, 0.61]) {
        acc.add(Math.max(reg, Math.abs(y - ys - (z + 0.6) * 0.05) - 0.007, bP + 0.004, -(bP + 0.11)), MAT.carbon, 0.003);
      }
    }
    // Y tail lights
    if (z < -2.0 && y > 0.58 && y < 0.95 && ax > 0.45) {
      const d = pocket(tailY(ax, y), sh, 0.025, po);
      acc.cut(d, po.wall ? MAT.trim : MAT.tail, 0.003);
    }
    // hexagonal exhaust surround with quad pipes
    if (z < -2.0 && y > 0.5 && y < 0.86 && ax < 0.5) {
      acc.cut(pocket(hex(x / 3.2, y - 0.69, 0.088), sh, 0.07, po), po.wall ? MAT.trim : MAT.grille, 0.006);
      for (const xe of [0.095, 0.25]) {
        acc.add(sdCylZ(ax - xe, y - 0.69, z + 2.37, 0.05, 0.04), MAT.chrome, 0.003);
        acc.cut(sdCylZ(ax - xe, y - 0.69, z + 2.37, 0.039, 0.2), MAT.exhaust);
      }
    }
    // wheel arches
    if (ax > 0.5 && y < 0.9) {
      if (Math.abs(z - WH.front.z) < 0.56) acc.cut(arch(ax, y, z, WH.front), MAT.trim, 0.01);
      if (Math.abs(z - WH.rear.z) < 0.58) acc.cut(arch(ax, y, z, WH.rear), MAT.trim, 0.01);
    }
    // mirror glass
    if (z > 0.55 && z < 0.95 && y > 0.75 && y < 1.0 && ax > 0.78) {
      acc.cut(sdRoundBox(ax - 1.02, y - 0.885, z - 0.664, 0.078, 0.03, 0.012, 0.008), MAT.chrome, 0.003);
    }

    // ---------------------------------------------------------------- material zones
    if (acc.m === MAT.paint && snork > 0.004) {
      if (y < 0.115) acc.m = MAT.trim;
      else if (y < 0.33 && Math.abs(z) < 1.0 && ax > 0.6) acc.m = MAT.carbon; // lower blade
      else if (y < 0.17 && z > 1.95) acc.m = MAT.carbon;
      else if (z < -1.5 && y < 0.48 && bS > bP - 0.005) acc.m = MAT.carbon;
      else if (z < -2.1 && y < 0.56 && ax < 0.85) acc.m = MAT.carbon;
    }
    out.m = acc.m;
    return acc.d;
  }

  // ------------------------------------------------------------------ light strips & lenses
  const decals = [
    { kind: 'panel', mat: MAT.window, view: VIEW.left, outline: SIDE_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.right, outline: SIDE_WIN, depth: 0.006 },
    { kind: 'panel', mat: MAT.window, view: VIEW.top, outline: WINDSHIELD, depth: 0.006, rings: 8 },
  ];
  for (const sx of [1, -1]) {
    decals.push({
      kind: 'ribbon',
      mat: MAT.drl,
      view: VIEW.front,
      path: [
        [0.42, 0.402],
        [0.62, 0.43],
        [0.88, 0.48],
      ].map(([u, v]) => [u * sx, v]),
      width: 0.007,
      depth: 0.008,
    });
    decals.push({
      kind: 'ribbon',
      mat: MAT.drl,
      view: VIEW.front,
      path: [
        [0.7, 0.44],
        [0.8, 0.424],
      ].map(([u, v]) => [u * sx, v]),
      width: 0.006,
      depth: 0.01,
    });
    for (const u of [0.55, 0.65]) decals.push({ kind: 'disc', mat: MAT.lens, view: VIEW.front, center: [u * sx, u === 0.55 ? 0.414 : 0.428], radius: 0.01, depth: 0.016 });
    for (const [a, b, c, d] of tailArms) {
      decals.push({
        kind: 'ribbon',
        mat: MAT.tailglow,
        view: VIEW.rear,
        path: [
          [a * sx, b],
          [c * sx, d],
        ],
        width: 0.008,
        depth: 0.008,
        sharp: true,
      });
    }
  }

  return {
    id: 'razor',
    sdf,
    shell,
    decals,
    bounds: { min: [-1.2, 0.0, -2.52], max: [1.2, 1.4, 2.52] },
    meta: {
      wheels: WH,
      panels: {
        side: [
          [[0.86, 0.81], [0.82, 0.36], [-0.1, 0.36], [-0.17, 0.72]],
          [[-1.2, 0.865], [-1.34, 0.865], [-1.34, 0.795], [-1.2, 0.795], [-1.2, 0.865]],
        ],
        top: [
          [[-0.45, 1.15], [0.45, 1.15], [0.55, 1.5], [0.45, 2.1], [0.3, 2.3], [-0.3, 2.3], [-0.45, 2.1], [-0.55, 1.5], [-0.45, 1.15]],
        ],
      },
      livery: { door: [0.3, 0.56], shoulder: 0.6, cabin: { x: 0.62, z0: -1.7, z1: 1.12 } },
      tailLights: [
        [0.72, 0.775, -2.38],
        [-0.72, 0.775, -2.38],
      ],
      headLights: [
        [0.65, 0.44, 2.2],
        [-0.65, 0.44, 2.2],
      ],
      exhausts: [
        [0.095, 0.69, -2.41],
        [0.25, 0.69, -2.41],
        [-0.095, 0.69, -2.41],
        [-0.25, 0.69, -2.41],
      ],
    },
  };
}
