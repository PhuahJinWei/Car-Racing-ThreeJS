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

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * layout: { min: [x,y,z], max: [x,y,z], panels?, livery?, wheels? } (car space, metres)
 * custom: resolved customization ({ paint, accent, livery }); number: race number
 */
export function drawProjectedLivery(canvas, layout, custom, number = 7) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const [x0, y0, z0] = layout.min;
  const [x1, y1, z1] = layout.max;
  const len = z1 - z0;
  const hgt = y1 - y0;
  const wid = x1 - x0;
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

  const tilePx = (k) => {
    const t = PROJ_TILES[k];
    return { x: t[0] * W, y: t[1] * H, w: t[2] * W, h: t[3] * H };
  };
  // canvas transform so that drawing commands use car coordinates (metres) of each view
  const views = {
    L: { px: tilePx('L'), set: (t) => ctx.setTransform(-t.w / len, 0, 0, -t.h / hgt, t.x + (z1 * t.w) / len, t.y + (y1 * t.h) / hgt), kind: 'side' },
    R: { px: tilePx('R'), set: (t) => ctx.setTransform(t.w / len, 0, 0, -t.h / hgt, t.x - (z0 * t.w) / len, t.y + (y1 * t.h) / hgt), kind: 'side' },
    T: { px: tilePx('T'), set: (t) => ctx.setTransform(0, t.h / wid, -t.w / len, 0, t.x + (z1 * t.w) / len, t.y - (x0 * t.h) / wid), kind: 'top' },
    F: { px: tilePx('F'), set: (t) => ctx.setTransform(t.w / wid, 0, 0, -t.h / hgt, t.x - (x0 * t.w) / wid, t.y + (y1 * t.h) / hgt), kind: 'front' },
    B: { px: tilePx('B'), set: (t) => ctx.setTransform(-t.w / wid, 0, 0, -t.h / hgt, t.x + (x1 * t.w) / wid, t.y + (y1 * t.h) / hgt), kind: 'rear' },
  };
  const inView = (k, fn) => {
    const v = views[k];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(v.px.x, v.px.y, v.px.w, v.px.h);
    ctx.clip();
    v.set(v.px);
    fn(v.kind, k);
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
        // number roundel
        ctx.beginPath();
        ctx.ellipse(door[0], door[1], 0.2, 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#f2f4f8';
        ctx.fill();
        ctx.lineWidth = 0.018;
        ctx.strokeStyle = accent;
        ctx.stroke();
        ctx.fillStyle = accent;
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

  // race number, drawn upright in canvas space so it reads correctly on both sides
  if (id === 'lv_race') {
    for (const k of ['L', 'R']) {
      const v = views[k];
      const t = v.px;
      const px = k === 'L' ? t.x + ((z1 - door[0]) / len) * t.w : t.x + ((door[0] - z0) / len) * t.w;
      const py = t.y + ((y1 - door[1]) / hgt) * t.h;
      const size = (0.26 / hgt) * t.h;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0b0b10';
      ctx.font = `900 ${Math.round(size)}px Orbitron, Arial Black, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), px, py + size * 0.04);
      ctx.restore();
    }
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
