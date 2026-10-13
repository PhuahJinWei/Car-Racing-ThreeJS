// Liveries for car-factory models. Graphics are painted into an atlas of orthographic views
// (left, right, top, front, rear) that the paint shader projects onto the body, so the models need
// no UVs. RGB = paint + livery colours, alpha = panel gaps (0 inside a gap).
//
// Tiles (u, v, w, h) in texture space; v grows downward (the canvas texture uses flipY = false).
export const PROJ_TILES = {
  L: [0, 0, 1, 0.25],
  R: [0, 0.25, 1, 0.25],
  T: [0, 0.5, 1, 0.25],
  F: [0, 0.75, 0.5, 0.25],
  B: [0.5, 0.75, 0.5, 0.25],
};

const VIEW_KIND = { L: 'side', R: 'side', T: 'top', F: 'front', B: 'rear' };

/** Pixel rectangle of atlas tile k on a W x H canvas. */
export function tileRect(k, W, H) {
  const t = PROJ_TILES[k];
  return { x: t[0] * W, y: t[1] * H, w: t[2] * W, h: t[3] * H };
}

/**
 * Point a 2D context at view k of the atlas: afterwards drawing commands use that view's car
 * coordinates in metres - side (z, y), top (x, z), front / rear (x, y).
 */
export function setProjView(ctx, layout, k) {
  const t = tileRect(k, ctx.canvas.width, ctx.canvas.height);
  const [x0, y0, z0] = layout.min;
  const [x1, y1, z1] = layout.max;
  const len = z1 - z0;
  const hgt = y1 - y0;
  const wid = x1 - x0;
  if (k === 'L') ctx.setTransform(-t.w / len, 0, 0, -t.h / hgt, t.x + (z1 * t.w) / len, t.y + (y1 * t.h) / hgt);
  else if (k === 'R') ctx.setTransform(t.w / len, 0, 0, -t.h / hgt, t.x - (z0 * t.w) / len, t.y + (y1 * t.h) / hgt);
  else if (k === 'T') ctx.setTransform(0, t.h / wid, -t.w / len, 0, t.x + (z1 * t.w) / len, t.y - (x0 * t.h) / wid);
  else if (k === 'F') ctx.setTransform(t.w / wid, 0, 0, -t.h / hgt, t.x - (x0 * t.w) / wid, t.y + (y1 * t.h) / hgt);
  else ctx.setTransform(-t.w / wid, 0, 0, -t.h / hgt, t.x + (x1 * t.w) / wid, t.y + (y1 * t.h) / hgt);
  return t;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** '#rrggbb' colour a share t of the way from a to b, as a CSS colour. */
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ca = p(a);
  const cb = p(b);
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(', ')})`;
}

// hot-rod flame licks from the bottom up: [length (share of the whole), base centre, rise of the tip]
const FLAME_LICKS = [
  [0.5, 0.1, 0.12],
  [0.84, 0.3, 0.16],
  [1.0, 0.5, 0.16],
  [0.7, 0.7, 0.14],
  [0.4, 0.88, 0.08],
];

/**
 * Add a flame job's outline to the current path. map(u, v) places it: u runs back from the base
 * (0..1), v across it (0..1).
 */
function flamePath(ctx, map) {
  const P = (u, v) => map(u, v);
  // the solid base
  ctx.moveTo(...P(-0.05, -0.02));
  ctx.lineTo(...P(0.08, -0.02));
  ctx.lineTo(...P(0.08, 1.02));
  ctx.lineTo(...P(-0.05, 1.02));
  ctx.closePath();
  for (const [L, c, rise] of FLAME_LICKS) {
    const w = 0.15;
    const tv = c + rise;
    // lower edge: full, bulging down before it sweeps up into the tip; upper edge: hollowed
    ctx.moveTo(...P(0, c - w));
    ctx.bezierCurveTo(...P(0.45 * L, c - w - 0.07), ...P(0.8 * L, tv - 0.12), ...P(L, tv));
    ctx.bezierCurveTo(...P(0.72 * L, tv - 0.05), ...P(0.4 * L, c - 0.04), ...P(0, c + w));
    ctx.closePath();
  }
}

/**
 * layout: { min: [x,y,z], max: [x,y,z], panels?, livery?, wheels? } (car space, metres)
 * custom: resolved customization ({ paint, accent, livery, number }); number: the number to show
 * in a door roundel (the Racer livery has one; a door number puts one on any livery)
 */
export function drawProjectedLivery(canvas, layout, custom, number = 7) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const [, y0, z0] = layout.min;
  const [, y1, z1] = layout.max;
  const len = z1 - z0;
  const hgt = y1 - y0;
  const paint = custom.paint.color;
  const accent = custom.accent.color === custom.paint.color ? (custom.paint.color === '#e9edf3' ? '#0b0b10' : '#e9edf3') : custom.accent.color;
  const meta = layout.livery || {};
  const wh = layout.wheels || { front: { z: z1 - 1 }, rear: { z: z0 + 1 } };
  const zf = wh.front.z;
  const zr = wh.rear.z;
  const wb = zf - zr;
  const door = meta.door || [(zf + zr) / 2 + 0.2, 0.5];
  const shoulder = meta.shoulder ?? 0.62;
  const cabin = meta.cabin || { x: 0.6, z0: zr - 0.4, z1: zf - 0.35 };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, W, H);

  // drawing commands inside fn use the car coordinates (metres) of view k
  const inView = (k, fn) => {
    const px = tileRect(k, W, H);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(px.x, px.y, px.w, px.h);
    ctx.clip();
    setProjView(ctx, layout, k);
    fn(VIEW_KIND[k], k);
    ctx.restore();
  };
  const poly = (pts, close = true) => {
    ctx.beginPath();
    pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
    if (close) ctx.closePath();
  };
  // top-view points are given as (x, z)
  const topPoly = poly;
  const all = (fn) => ['L', 'R', 'T', 'F', 'B'].forEach((k) => inView(k, fn));

  // ---------------------------------------------------------------------------- livery graphics
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  const id = custom.livery.id;
  if (id === 'lv_stripes') {
    all((kind) => {
      if (kind === 'top') {
        for (const s of [-1, 1]) {
          topPoly([[s * 0.055, z0 - 1], [s * 0.2, z0 - 1], [s * 0.2, z1 + 1], [s * 0.055, z1 + 1]]);
          ctx.fill();
        }
      } else if (kind === 'front' || kind === 'rear') {
        for (const s of [-1, 1]) {
          poly([[s * 0.055, 0.3], [s * 0.2, 0.3], [s * 0.2, y1 + 1], [s * 0.055, y1 + 1]]);
          ctx.fill();
        }
      }
    });
  } else if (id === 'lv_race') {
    all((kind) => {
      if (kind === 'side') {
        // lower accent band and a pin stripe
        poly([[z0 - 1, 0.2], [z1 + 1, 0.2], [z1 + 1, 0.3], [z0 - 1, 0.3]]);
        ctx.fill();
        poly([[z0 - 1, 0.325], [z1 + 1, 0.325], [z1 + 1, 0.335], [z0 - 1, 0.335]]);
        ctx.fill();
      } else if (kind === 'top') {
        topPoly([[-0.04, z0 - 1], [0.04, z0 - 1], [0.04, z1 + 1], [-0.04, z1 + 1]]);
        ctx.fill();
      }
    });
  } else if (id === 'lv_bolt') {
    const d = door[0];
    const bolt = [
      [zf - 0.5, 0.56],
      [d - 0.05, 0.62],
      [d - 0.12, 0.5],
      [zr + 0.55, 0.6],
      [zr + 0.4, 0.58],
      [d - 0.3, 0.43],
      [d - 0.22, 0.54],
      [zf - 0.62, 0.5],
    ];
    all((kind) => {
      if (kind === 'side') {
        poly(bolt);
        ctx.fill();
      }
    });
  } else if (id === 'lv_split') {
    all((kind) => {
      if (kind === 'side') {
        poly([[z0 - 1, shoulder + 0.17], [z1 + 1, shoulder + 0.17], [z1 + 1, y1 + 1], [z0 - 1, y1 + 1]]);
        ctx.fill();
      } else if (kind === 'top') {
        topPoly([[-cabin.x, cabin.z0], [cabin.x, cabin.z0], [cabin.x, cabin.z1], [-cabin.x, cabin.z1]]);
        ctx.fill();
      }
    });
  } else if (id === 'lv_panda') {
    // two-tone: the lower body (bumpers, sills, lower doors) in the accent colour, up to a line a
    // design can set per view ({ side, front, rear }, or one height)
    const p = meta.panda ?? shoulder * 0.78;
    all((kind) => {
      if (kind === 'top') return;
      const line = typeof p === 'number' ? p : (p[kind] ?? p.side);
      const [a, b] = kind === 'side' ? [z0 - 1, z1 + 1] : [-3, 3];
      poly([[a, y0 - 1], [b, y0 - 1], [b, line], [a, line]]);
      ctx.fill();
    });
  } else if (id === 'lv_police') {
    // black-and-white patrol scheme: doors, pillars and roof in the accent colour
    const pt = meta.patrol || { z0: zr + 0.45, z1: zf - 0.45, y0: 0.25, y1: shoulder + 0.12 };
    all((kind) => {
      if (kind === 'side') {
        poly([[pt.z0, pt.y0], [pt.z1, pt.y0], [pt.z1, pt.y1], [pt.z0, pt.y1]]);
        ctx.fill();
        poly([[cabin.z0, pt.y1 - 0.01], [cabin.z1, pt.y1 - 0.01], [cabin.z1, y1 + 1], [cabin.z0, y1 + 1]]);
        ctx.fill();
      } else if (kind === 'top') {
        topPoly([[-cabin.x, cabin.z0], [cabin.x, cabin.z0], [cabin.x, cabin.z1], [-cabin.x, cabin.z1]]);
        ctx.fill();
      }
    });
  } else if (id === 'lv_taxi') {
    // a checkered band down each side, two rows of squares in the accent colour over the paint
    const tx = meta.taxi || { z0: zr - 0.3, z1: zf + 0.3, y: shoulder - 0.15 };
    const sq = 0.055;
    all((kind) => {
      if (kind !== 'side') return;
      for (let row = 0; row < 2; row++) {
        const ya = tx.y + row * sq;
        for (let k = 0, z = tx.z0; z < tx.z1; k++, z += sq) {
          if ((k + row) % 2) continue;
          const zb = Math.min(z + sq, tx.z1);
          poly([[z, ya], [zb, ya], [zb, ya + sq], [z, ya + sq]]);
          ctx.fill();
        }
      }
    });
  } else if (id === 'lv_flames') {
    // a flame job: a solid base round the nose, licks sweeping back along the sides (and over a
    // long enough hood), pale at the base and deepening to the accent colour at the tips. A design
    // can place it ({ z: base, len, y0, y1 }); by default it runs from the nose to mid-car.
    const fl = meta.flames || {};
    const zb = fl.z ?? z1;
    const lenS = fl.len ?? Math.max(1.4, len * 0.5);
    const lo = fl.y0 ?? Math.max(y0 + 0.2, shoulder - 0.42);
    const hi = fl.y1 ?? shoulder + 0.05;
    const hood = zb - cabin.z1 - 0.05;
    const hw = cabin.x + 0.12;
    const grad = (ax, ay, bx, by) => {
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      g.addColorStop(0, mixHex(accent, '#ffffff', 0.6));
      g.addColorStop(0.4, mixHex(accent, '#ffffff', 0.25));
      g.addColorStop(0.85, accent);
      return g;
    };
    all((kind) => {
      if (kind === 'side') {
        ctx.beginPath();
        flamePath(ctx, (u, v) => [zb - u * lenS, lo + v * (hi - lo)]);
        ctx.fillStyle = grad(zb, 0, zb - lenS, 0);
        ctx.fill();
      } else if (kind === 'top' && hood > 0.4) {
        ctx.beginPath();
        for (const s of [-1, 1]) flamePath(ctx, (u, v) => [s * (0.04 + v * (hw - 0.04)), zb - u * hood]);
        ctx.fillStyle = grad(0, zb, 0, zb - hood);
        ctx.fill();
      } else if (kind === 'front') {
        poly([[-3, y0 - 1], [3, y0 - 1], [3, hi], [-3, hi]]);
        ctx.fillStyle = mixHex(accent, '#ffffff', 0.6);
        ctx.fill();
      }
    });
  } else if (id === 'lv_circuit') {
    const r = rng(number * 7919 + 13);
    const traces = [];
    for (let i = 0; i < 26; i++) {
      let z = zr - 0.6 + r() * (wb + 1.6);
      let y = 0.25 + r() * (shoulder - 0.2);
      const pts = [[z, y]];
      for (let k = 0; k < 4; k++) {
        if (k % 2 === 0) z += (r() - 0.5) * 0.9;
        else y += (r() - 0.5) * 0.25;
        y = Math.max(0.2, Math.min(shoulder + 0.05, y));
        pts.push([z, y]);
      }
      traces.push(pts);
    }
    all((kind) => {
      if (kind !== 'side') return;
      ctx.lineWidth = 0.012;
      ctx.lineCap = 'square';
      for (const t of traces) {
        poly(t, false);
        ctx.stroke();
        const [ez, ey] = t[t.length - 1];
        ctx.beginPath();
        ctx.ellipse(ez, ey, 0.02, 0.02, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // side lettering, drawn upright in canvas space so it reads correctly on both sides (and widened
  // by the side view's aspect, so it isn't squashed on the car)
  const letter = (text, z, y, size, color, font) => {
    for (const k of ['L', 'R']) {
      const t = tileRect(k, W, H);
      const px = k === 'L' ? t.x + ((z1 - z) / len) * t.w : t.x + ((z - z0) / len) * t.w;
      const py = t.y + ((y1 - y) / hgt) * t.h;
      const sz = (size / hgt) * t.h;
      ctx.save();
      ctx.setTransform((t.w / len) / (t.h / hgt), 0, 0, 1, px, py);
      ctx.fillStyle = color;
      ctx.font = `${font} ${Math.round(sz)}px ${font === '900' ? 'Orbitron, ' : ''}Arial Black, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, sz * 0.04);
      ctx.restore();
    }
  };
  if (id === 'lv_police') {
    const pt = meta.patrol;
    const [tz, ty] = pt?.text || door;
    letter('POLICE', tz, ty, 0.15, paint, '800');
  }

  // number roundel on the doors
  if (id === 'lv_race' || custom.number?.value != null) {
    all((kind) => {
      if (kind !== 'side') return;
      ctx.beginPath();
      ctx.ellipse(door[0], door[1], 0.2, 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f2f4f8';
      ctx.fill();
      ctx.lineWidth = 0.018;
      ctx.strokeStyle = accent;
      ctx.stroke();
    });
    const digits = String(number);
    letter(digits, door[0], door[1], digits.length > 1 ? 0.2 : 0.26, '#0b0b10', '900');
  }

  // licence plate (designs that have a plate recess say where): white, a dark border and lettering
  const plate = meta.plate;
  if (plate) {
    inView('B', () => {
      ctx.fillStyle = '#e8ebef';
      ctx.fillRect(plate.x - plate.w / 2, plate.y - plate.h / 2, plate.w, plate.h);
      ctx.strokeStyle = '#1d2b4c';
      ctx.lineWidth = 0.007;
      ctx.strokeRect(plate.x - plate.w / 2 + 0.008, plate.y - plate.h / 2 + 0.008, plate.w - 0.016, plate.h - 0.016);
    });
    // lettering drawn in canvas space so it isn't mirrored (the rear view's x runs right to left)
    const t = tileRect('B', W, H);
    const [x0] = layout.min;
    const [x1] = layout.max;
    const wid = x1 - x0;
    const sz = ((plate.h * 0.5) / hgt) * t.h;
    ctx.save();
    ctx.setTransform(t.w / wid / (t.h / hgt), 0, 0, 1, t.x + ((x1 - plate.x) / wid) * t.w, t.y + ((y1 - plate.y) / hgt) * t.h);
    ctx.fillStyle = '#1d2b4c';
    ctx.font = `800 ${Math.round(sz)}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(plate.text, 0, sz * 0.04, ((plate.w - 0.05) / hgt) * t.h);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------- panel gaps
  const panels = layout.panels;
  if (panels) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    all((kind) => {
      const list = panels[kind];
      if (!list) return;
      ctx.lineWidth = 0.0045;
      for (const line of list) {
        if (kind === 'top') topPoly(line, false);
        else poly(line, false);
        ctx.stroke();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
