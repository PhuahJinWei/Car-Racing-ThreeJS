"""Road-car building blocks: bodies lofted from drawn views, and detail laid onto their skin.

Bodies: each cross-section is built from the drawings (the side view gives the top and bottom at
that station, the plan view the half-width, a section rule how the sides tuck and lean) with a
chosen fillet where the top meets the side and the side meets the floor, so edges stay as crisp
as a real car's instead of the distance fields' soft 5 cm blends. Every section is sampled with
the same number of points per run (top, corner, side runs split at crease heights, corner,
bottom), so creases stay on fixed vertices along the car and read as clean lines.

Detail: outlines drawn in a view (side, top, front, rear) are projected onto the skin by ray
casting: pockets (cutters that follow the surface, for lamps, intakes, vents and windows), panels
(glass panes and lenses set into them), ribbons (LED strips), discs (lamp lenses) and beads
(trims). Everything is in game space (+x left, +y up, +z forward), see geo.py.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

from . import geo
from .views import Outline, densify  # noqa: F401  (re-exported for designs)

# how much coarser than the full model the level being built is (run.py sets it per level):
# rings, frit and strips follow it on their own
LOD = {'scale': 1.0}


# ------------------------------------------------------------------------------- sections
def _poly_len(P):
    return sum(math.dist(P[i], P[i + 1]) for i in range(len(P) - 1))


def _cut_at(P, d, from_end=False):
    """Split a polyline at arc length d from its start (or end): (head, point, tail)."""
    Q = list(reversed(P)) if from_end else P
    acc = 0.0
    for i in range(len(Q) - 1):
        s = math.dist(Q[i], Q[i + 1])
        if acc + s >= d:
            t = (d - acc) / s if s > 0 else 0
            p = (Q[i][0] + (Q[i + 1][0] - Q[i][0]) * t, Q[i][1] + (Q[i + 1][1] - Q[i][1]) * t)
            head, tail = Q[:i + 1] + [p], [p] + Q[i + 1:]
            if from_end:
                return list(reversed(tail)), p, list(reversed(head))
            return head, p, tail
        acc += s
    return (P, P[-1], [P[-1]]) if not from_end else ([P[0]], P[0], P)


def resample(P, n):
    """n points evenly spaced along a polyline (ends included)."""
    if n < 2:
        return [P[0]]
    L = _poly_len(P)
    if L < 1e-9:
        return [P[0]] * n
    out = [P[0]]
    seg = [math.dist(P[i], P[i + 1]) for i in range(len(P) - 1)]
    j, acc = 0, 0.0
    for k in range(1, n - 1):
        target = L * k / (n - 1)
        while j < len(seg) - 1 and acc + seg[j] < target:
            acc += seg[j]
            j += 1
        t = (target - acc) / seg[j] if seg[j] > 0 else 0
        out.append((P[j][0] + (P[j + 1][0] - P[j][0]) * t, P[j][1] + (P[j + 1][1] - P[j][1]) * t))
    out.append(P[-1])
    return out


def _bezier(a, c, b, n):
    return [((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1])
            for t in (i / (n - 1) for i in range(n))]


def half_section(top_y, side_x, yt, yb, keys=(), r_top=0.025, r_bot=0.035, counts=(10, 5, (12,), 4, 6), x_top=None):
    """Half cross-section, top centre round the +x side to the bottom centre (2D points (x, y)).
    top_y(x): height of the top across the car; side_x(y): the side's half-width at height y;
    yt / yb: the section's top (at the centre) and bottom; keys: heights (descending) where the
    side is split into runs (creases); counts: points per run - (top, top corner, (side runs),
    bottom corner, bottom). x_top: where the top meets the side, if known."""
    # where the top surface meets the side
    xc = side_x(yt) if x_top is None else x_top
    if x_top is None:
        for _ in range(8):
            xc = side_x(top_y(xc))
    yc = top_y(xc)
    xb = side_x(yb)
    rt = max(1e-4, min(r_top, 0.45 * xc, 0.45 * max(yc - yb, 1e-4)))
    rb = max(1e-4, min(r_bot, 0.45 * xb, 0.45 * max(yc - yb, 1e-4)))
    top = [(xc * i / 47, top_y(xc * i / 47)) for i in range(48)]
    side = [(side_x(yc + (yb - yc) * i / 95), yc + (yb - yc) * i / 95) for i in range(96)]
    bottom = [(xb * (1 - i / 23), yb) for i in range(24)]
    t_head, a, _ = _cut_at(top, max(_poly_len(top) - rt, 0))
    _, b, s_rest = _cut_at(side, min(rt, _poly_len(side) * 0.45))
    s_head, a2, _ = _cut_at(s_rest, max(_poly_len(s_rest) - rb, 0))
    _, b2, b_rest = _cut_at(bottom, min(rb, _poly_len(bottom) * 0.45))
    n_top, n_c1, n_side, n_c2, n_bot = counts
    out = resample(t_head, n_top)
    out += _bezier(a, (xc, yc), b, n_c1 + 2)[1:-1]
    # side runs split at the crease heights
    runs = []
    rest = s_head
    for k in keys:
        if not (rest[-1][1] < k < rest[0][1]):
            continue
        idx = next(i for i in range(len(rest) - 1) if rest[i + 1][1] <= k)
        p, q = rest[idx], rest[idx + 1]
        t = (p[1] - k) / (p[1] - q[1]) if p[1] != q[1] else 0
        m = (p[0] + (q[0] - p[0]) * t, k)
        runs.append(rest[:idx + 1] + [m])
        rest = [m] + rest[idx + 1:]
    runs.append(rest)
    sizes = list(n_side) + [n_side[-1]] * (len(runs) - len(n_side))
    # keep the same number of side points whether or not a crease falls inside this section
    total = sum(n_side) if len(runs) == len(n_side) else sum(sizes[:len(runs)])
    if len(runs) != len(n_side):
        sizes = [max(2, round(total * _poly_len(r) / max(_poly_len(s_head), 1e-9))) for r in runs]
        sizes[-1] += sum(n_side) - sum(sizes)
        sizes[-1] = max(2, sizes[-1])
    for r, nr in zip(runs, sizes):
        out += resample(r, nr + 1)[:-1]
    out += _bezier(a2, (xb, yb), b2, n_c2 + 2)[:-1]
    out += resample(b_rest, n_bot)
    out[0] = (0.0, out[0][1])
    out[-1] = (0.0, out[-1][1])
    return out


def ring(half, z):
    """Mirror a half section into a closed ring at station z (top centre first)."""
    other = [(-x, y) for (x, y) in reversed(half[1:-1])]
    return [(x, y, z) for (x, y) in half + other]


def body_stations(z0, z1, n, ends=0.12):
    """Stations from z0 to z1, packed toward both ends (rounded noses and tails need them)."""
    out = []
    for i in range(n):
        t = i / (n - 1)
        s = 0.5 - 0.5 * math.cos(math.pi * t)
        out.append(z0 + (z1 - z0) * ((1 - ends) * t + ends * s))
    return out


def refine_stations(zs, metric, step, depth=6):
    """More stations wherever the section changes fast between two of them (metric(z) -> numbers,
    or None where there's no section): a steep end - a raked tailgate, a nose - lofted across a few
    stations is a handful of tall strips, and anything cut or joined into it leaves long slivers
    that shade in teeth."""
    out = [zs[0]]
    for a, b in zip(zs, zs[1:]):
        stack = [(a, b, 0)]
        mid = []
        while stack:
            z0, z1, d = stack.pop()
            m0, m1 = metric(z0), metric(z1)
            if d < depth and m0 and m1 and max(abs(p - q) for p, q in zip(m0, m1)) > step and abs(z1 - z0) > 4e-4:
                zm = (z0 + z1) / 2
                stack.append((zm, z1, d + 1))
                stack.append((z0, zm, d + 1))
            else:
                mid.append(z1)
        mid.sort(reverse=b < a)
        out += mid
    return out


def loft_body(name, rings, coll, role='paint', tips=(None, None), sharp=40.0):
    # (ends filled with even triangles: see geo.loft)
    return geo.loft(name, rings, coll, role, caps=(True, True), tips=tips, sharp=sharp, cap_bands=4, cap_grid=0.04 * LOD['scale'])


def _tip(side, front):
    """The side outline's foremost (or rearmost) point, as a loft's end tip at x = 0."""
    p = max(side.poly, key=lambda q: q[0]) if front else min(side.poly, key=lambda q: q[0])
    return (0.0, p[1], p[0])


def view_body(name, coll, n, side, plan, sec=None, top=None, keys=None, r_top=0.028, r_bot=0.04, stations=130, z_range=None,
              counts=None, role='paint'):
    """A body lofted from its drawings: side (Outline of (z, y)), plan (Outline of (x, z)), the
    section rule sec(y, z) (share of the plan's half-width at height y), top(ax, z, yt) (the top's
    height across the car, default flat at the silhouette) and keys(z) (crease heights)."""
    counts = counts or (n(14), n(6), (n(10), n(9), n(7)), n(5), n(8))
    z0, z1 = z_range or (max(side.umin, plan.vmin) + 0.003, min(side.umax, plan.vmax) - 0.003)
    rings = []

    def metric(z):
        span, W = side.span_v(z), plan.half_width(z)
        return (span[0], span[1], W) if span and W > 0.002 else None

    for z in refine_stations(body_stations(z0, z1, n(stations, max(8, stations // 5))), metric, 0.03 * LOD['scale']):
        span = side.span_v(z)
        W = plan.half_width(z)
        if not span or W <= 0.002:
            continue
        yb, yt = span

        def tf(x, z=z, yt=yt):
            return top(abs(x), z, yt) if top else yt

        def sx(y, z=z, W=W):
            return max(0.001, W * (sec(y, z) if sec else 1.0))

        half = half_section(tf, sx, yt, yb, keys=keys(z) if keys else (), r_top=r_top, r_bot=r_bot, counts=counts)
        rings.append(ring(half, z))
    # (a body cut short of the drawing's ends closes flat, not on the drawing's nose or tail)
    tips = (_tip(side, False) if z0 <= side.umin + 0.01 else None, _tip(side, True) if z1 >= side.umax - 0.01 else None)
    return loft_body(name, rings, coll, role, tips=tips, sharp=50.0)


def view_cabin(name, coll, n, side, plan, tilt=None, crown=0.02, r_top=0.055, stations=90, z_range=None, inset=0.0, bottom=None,
               counts=None, role='paint', top=None, lift=0.0):
    """A glasshouse lofted from its drawings (side and plan views): tilt(y) leans its sides in
    (tumblehome), crown bows its roof. inset shrinks it all round (the cabin's inside), bottom
    overrides its floor height, top its roof height, lift raises its floor."""
    counts = counts or (n(10), n(6), (n(12),), n(3), n(6))
    z0, z1 = z_range or (max(side.umin, plan.vmin) + 0.002, min(side.umax, plan.vmax) - 0.002)
    rings = []

    def metric(z):
        span, W = side.span_v(z), plan.half_width(z)
        return (span[0], span[1], W) if span and W > 0.002 else None

    zs = body_stations(z0, z1, n(stations, 20), ends=0.08 if not inset else 0.0)
    if not inset:
        zs = refine_stations(zs, metric, 0.03 * LOD['scale'])
    for z in zs:
        span = side.span_v(z)
        W = plan.half_width(z) - inset
        if not span or W <= 0.01:
            continue
        yb = (span[0] if bottom is None else bottom) + lift
        yt = span[1] - inset if top is None else top
        if yt - yb < 0.02:
            continue

        def sx(y, W=W):
            return max(0.002, W - (tilt(y) if tilt else 0.0))

        def tf(x, yt=yt, W=W):
            return yt - crown * (x / max(W, 1e-3)) ** 2

        half = half_section(tf, sx, yt, yb, r_top=r_top if not inset else r_top * 0.7, r_bot=0.01, counts=counts)
        rings.append(ring(half, z))
    if not rings:
        return None
    return loft_body(name, rings, coll, role, sharp=50.0) if not inset else geo.loft(name, rings, coll, role)


def check_overlap(body, cabin, tol=0.008, step=0.02, limit=12):
    """Warn where a body's top and its glasshouse lie within `tol` of each other over an area
    (seen from above). Two surfaces meeting that shallowly - a fastback sliding into a deck - make
    the union's seam zigzag across both surfaces' facets: a frayed, jagged edge in the paint and
    under anything laid on it. Give such places a clear step or a steep meeting instead."""
    sb, sc = Surface([body]), Surface([cabin])
    co = sc.co
    xs = np.arange(0.0, float(np.abs(co[:, 0]).max()), step)
    zs = np.arange(float(-co[:, 1].max()), float(-co[:, 1].min()), step)
    bad = []
    for z in zs:
        for x in xs:
            # (steep meetings - a glasshouse's side standing on the beltline - seam cleanly: only
            # two fairly flat surfaces count)
            hc = sc.cast((x, 4.0, z), (0.0, -1.0, 0.0), facing=0.55)
            if not hc:
                continue
            hb = sb.cast((x, 4.0, z), (0.0, -1.0, 0.0), facing=0.55)
            # (and only nearly parallel ones: a windscreen rising out of a hood at 20 degrees seams
            # cleanly however close the two come along the crossing)
            if hb and abs(hb[0][1] - hc[0][1]) < tol and sum(a * b for a, b in zip(hb[1], hc[1])) > 0.985:
                bad.append((x, z))
    if len(bad) > limit:
        bands = {}
        for x, z in bad:
            k = round(z / 0.2) * 0.2
            lo, hi, c = bands.get(k, (9.0, -9.0, 0))
            bands[k] = (min(lo, x), max(hi, x), c + 1)
        where = ', '.join(f'z {k:+.1f}: {c} (x {lo:.2f}..{hi:.2f})' for k, (lo, hi, c) in sorted(bands.items()) if c > 2)
        print(f'WARNING body and glasshouse nearly touch over {len(bad)} spots - their seam will fray there: {where}', flush=True)
    return bad


def body_and_cabin(coll, n, skin, cabin_args, trim=None, check=True):
    """Join a glasshouse (view_cabin's keyword arguments) onto a lofted body (see check_overlap).
    trim(cabin) cuts the glasshouse first (a VICE's sunken engine deck)."""
    cabin = view_cabin('cabin', coll, n, **cabin_args)
    if trim:
        trim(cabin)
    if check:
        check_overlap(skin, cabin)
    geo.boolean(skin, cabin, op='UNION', sharp=50.0)
    return skin


def wheel_arches(coll, n, skin, wheels, gap=0.04, inner=0.04, role='trim'):
    """Open wheel arches with black liners: a cylinder round each wheel, from just inside the
    tyre's inner face out through the body side."""
    for w in wheels.values():
        x0 = w['x'] - w['w'] / 2 - inner
        for s in (1, -1):
            cut = geo.cylinder(f'arch_{w["z"]}_{s}', (s * x0, w['y'], w['z']), (s * 1.6, w['y'], w['z']), w['r'] + gap, coll, role, sides=n(64, 20))
            geo.boolean(skin, cut, sharp=50.0)


def hollow(coll, n, skin, cab_side, cab_plan, tub, z_range, tilt=None, wall=0.025, floor=0.6):
    """Hollow the cabin so it shows through the glass: a tub (rounded box: centre, half extents)
    between the doors and the glasshouse's inside, `wall` thick. (The glasshouse's ends stay off
    the tub's planes: coincident faces leave the exact boolean pinched edges.)"""
    c, h = tub
    geo.boolean(skin, geo.rbox('tub', c, h, coll, 'interior', r=0.06, segs=n(3, 1)), sharp=50.0)
    inside = view_cabin('cabin_inside', coll, n, cab_side, cab_plan, tilt=tilt, crown=0.0, stations=40,
                        z_range=(z_range[0] + 0.017, z_range[1] + 0.022), inset=wall, bottom=floor, role='interior')
    if inside:
        geo.boolean(skin, inside, sharp=50.0)


def zones(skin, fn, ys=(), zs=(), xs=()):
    """Paint zones (sills, chin, diffuser...) on the skin: first cut along the given planes, so
    every zone ends on a straight line, then fn(x, y, z, role, nx, ny, nz) re-roles faces."""
    for y in ys:
        slice_plane(skin, (0, y, 0), (0, 1, 0))
    for z in zs:
        slice_plane(skin, (0, 0, z), (0, 0, 1))
    for x in xs:
        slice_plane(skin, (x, 0, 0), (1, 0, 0))
        slice_plane(skin, (-x, 0, 0), (1, 0, 0))
    zone(skin, fn)


def sym(outline, s):
    """An outline drawn for the left (+x / +u) side, mirrored for side s."""
    return [(s * p[0], p[1], *p[2:]) for p in outline]


def rect(u0, u1, v0, v1):
    """A sharp-cornered rectangle outline."""
    return [(u0, v0, 1), (u1, v0, 1), (u1, v1, 1), (u0, v1, 1)]


def rrect(cu, cv, hu, hv, r, n=4):
    """A rounded rectangle outline: centre, half extents, corner radius (sharp-flagged points: a
    smooth curve through them swung up to 3 cm out at each corner, beside the long straight sides)."""
    pts = []
    for qu, qv, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cu + qu * (hu - r) + r * math.cos(a), cv + qv * (hv - r) + r * math.sin(a), 1))
    return pts


def rounded(corners, r, n=5):
    """A polygon with straight edges and round corners of radius r (a single number or one per
    corner), as sharp-flagged points. (A few smooth control points make a wavy outline: a curve
    through five points round a rear window swung 2.6 cm above its corners.)"""
    k = len(corners)
    rs = r if isinstance(r, (list, tuple)) else [r] * k
    out = []
    for i in range(k):
        p0, p1, p2 = corners[i - 1], corners[i], corners[(i + 1) % k]
        a = (p0[0] - p1[0], p0[1] - p1[1])
        b = (p2[0] - p1[0], p2[1] - p1[1])
        la, lb = math.hypot(*a), math.hypot(*b)
        a, b = (a[0] / la, a[1] / la), (b[0] / lb, b[1] / lb)
        cosang = max(-0.999, min(0.999, a[0] * b[0] + a[1] * b[1]))
        half = math.acos(cosang) / 2
        ri = rs[i]
        if ri <= 0 or half < 1e-3:
            out.append((p1[0], p1[1], 1))
            continue
        t = min(ri / math.tan(half), 0.45 * la, 0.45 * lb)
        ri = t * math.tan(half)
        s = (p1[0] + a[0] * t, p1[1] + a[1] * t)
        e = (p1[0] + b[0] * t, p1[1] + b[1] * t)
        bis = (a[0] + b[0], a[1] + b[1])
        lbis = math.hypot(*bis)
        c = (p1[0] + bis[0] / lbis * ri / math.sin(half), p1[1] + bis[1] / lbis * ri / math.sin(half))
        a0 = math.atan2(s[1] - c[1], s[0] - c[0])
        a1 = math.atan2(e[1] - c[1], e[0] - c[0])
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        for j in range(n + 1):
            ang = a0 + da * j / n
            out.append((c[0] + ri * math.cos(ang), c[1] + ri * math.sin(ang), 1))
    return out


def circle(cu, cv, r, n=24):
    return [(cu + r * math.cos(2 * math.pi * i / n), cv + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def offset_outline(outline, d):
    """A drawing grown d all round (a bumper standing proud of the body it wraps)."""
    pts = []
    for p in outline.poly:
        if not pts or math.dist(p, pts[-1]) > 1e-5:
            pts.append(p)
    if math.dist(pts[0], pts[-1]) < 1e-5:
        pts.pop()
    return Outline([(u, v, 1) for u, v in offset_loop(pts, d)], step=1.0)


# ------------------------------------------------------------------------------ projection
VIEWS = {
    # view: (u axis, v axis, ray direction) in game space
    'left': ('z', 'y', (-1.0, 0.0, 0.0)),
    'right': ('z', 'y', (1.0, 0.0, 0.0)),
    'top': ('x', 'z', (0.0, -1.0, 0.0)),
    'front': ('x', 'y', (0.0, 0.0, -1.0)),
    'rear': ('x', 'y', (0.0, 0.0, 1.0)),
}
AXIS = {'x': 0, 'y': 1, 'z': 2}


class Surface:
    """Ray casts onto a set of objects (the car's skin), in game space. Normals come back smooth
    (interpolated from the vertex normals), so a panel or strip laid along a curve keeps an even
    offset instead of stepping at every face. A hit on a face turned away from the view (less
    than `facing`, the cosine between its normal and the ray) counts as a miss: a side window's
    outline then can't wrap onto the windscreen round the pillar, nor a windscreen onto the side
    glass."""

    def __init__(self, objs):
        dg = bpy.context.evaluated_depsgraph_get()
        cos, nrms, tris = [], [], []
        base = 0
        for o in objs:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            mw = np.array(o.matrix_world, np.float64)
            co = np.empty(len(me.vertices) * 3, np.float64)
            me.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
            vn = np.empty(len(me.vertices) * 3, np.float64)
            me.vertex_normals.foreach_get('vector', vn)
            vn = vn.reshape(-1, 3) @ np.linalg.inv(mw[:3, :3])
            lt = np.empty(len(me.loop_triangles) * 3, np.int64)
            me.loop_triangles.foreach_get('vertices', lt)
            cos.append(co)
            nrms.append(vn)
            tris.append(lt.reshape(-1, 3) + base)
            base += len(co)
            ev.to_mesh_clear()
        self.co = np.concatenate(cos)
        vn = np.concatenate(nrms)
        self.vn = vn / (np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12)
        self.tris = np.concatenate(tris)
        self.tree = BVHTree.FromPolygons([tuple(v) for v in self.co], [tuple(t) for t in self.tris], all_triangles=True)

    def cast(self, origin, direction, facing=0.3):
        o = Vector(geo.G(*origin))
        d = Vector(geo.G(*direction)).normalized()
        loc, _, idx, _ = self.tree.ray_cast(o, d)
        if loc is None:
            return None
        a, b, c = self.tris[idx]
        A, B, C = self.co[a], self.co[b], self.co[c]
        P = np.array(loc)
        v0, v1, v2 = B - A, C - A, P - A
        d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
        d20, d21 = v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-18:
            wb = wc = 1.0 / 3.0
        else:
            wb = (d11 * d20 - d01 * d21) / den
            wc = (d00 * d21 - d01 * d20) / den
        n = (1 - wb - wc) * self.vn[a] + wb * self.vn[b] + wc * self.vn[c]
        n /= np.linalg.norm(n) + 1e-12
        if facing is not None and -(n[0] * d.x + n[1] * d.y + n[2] * d.z) < facing:
            return None
        return (P[0], P[2], -P[1]), (float(n[0]), float(n[2]), float(-n[1]))

    def project(self, view, u, v, far=4.0, facing=0.3):
        """Point and normal where the view's ray through (u, v) meets the skin, or None."""
        ua, va, d = VIEWS[view]
        o = [0.0, 0.0, 0.0]
        o[AXIS[ua]] = u
        o[AXIS[va]] = v
        k = next(i for i in range(3) if d[i] != 0)
        o[k] = -d[k] * far
        return self.cast(tuple(o), d, facing)


def _connected(hits, view, uvs, edges, facing):
    """Only the hits joined to the decal's middle across the skin count; the rest are misses. A ray
    that slips past the edge of the skin strikes some other part of the car - a tail lamp wrapping a
    rear corner reached the rear wheel arch's front wall and stretched into a sliver along the side.
    Walking out from the middle along the decal's edges (uvs: its 2D points, edges: index pairs), a
    step deeper into the view than the skin could slope over that distance (it faces the view at
    least `facing`) is such a jump."""
    d = VIEWS[view][2]
    depth = [h[0][0] * d[0] + h[0][1] * d[1] + h[0][2] * d[2] if h else None for h in hits]
    good = [i for i, v in enumerate(depth) if v is not None]
    if not good:
        return hits
    cu = sum(p[0] for p in uvs) / len(uvs)
    cv = sum(p[1] for p in uvs) / len(uvs)
    seed = min(good, key=lambda i: (uvs[i][0] - cu) ** 2 + (uvs[i][1] - cv) ** 2)
    # (capped: right at a silhouette the skin may turn steeper, but those few points can borrow
    # their neighbours' hits)
    slope = min(12.0, 1.5 * math.tan(math.acos(min(0.999, max(0.02, facing or 0.02)))))
    adj = [[] for _ in uvs]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    ok = [False] * len(uvs)
    ok[seed] = True
    stack = [seed]
    while stack:
        a = stack.pop()
        for b in adj[a]:
            if not ok[b] and depth[b] is not None and abs(depth[b] - depth[a]) <= slope * math.dist(uvs[a], uvs[b]) + 0.004:
                ok[b] = True
                stack.append(b)
    return [h if ok[i] else None for i, h in enumerate(hits)]


def _chain(n, closed=False):
    return [(i, i + 1) for i in range(n - 1)] + ([(n - 1, 0)] if closed and n > 2 else [])


def _add(a, b, s=1.0):
    return (a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s)


def _norm3(a):
    l = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1e-12
    return (a[0] / l, a[1] / l, a[2] / l)


def _cross3(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _fine(pts, max_seg, closed):
    """Split every segment longer than max_seg. A projected outline or path whose points sit far
    apart cuts straight chords across a curved skin: an edge that dips under the paint (a frayed,
    'crispy' glass edge) or floats off it."""
    out = []
    n = len(pts)
    for i in range(n if closed else n - 1):
        a, b = pts[i], pts[(i + 1) % n]
        k = max(1, math.ceil(math.dist(a[:2], b[:2]) / max_seg))
        for j in range(k):
            t = j / k
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    if not closed:
        out.append((pts[-1][0], pts[-1][1]))
    return out


def _loop(points, per=4, dense=False, max_seg=0.01):
    """A closed 2D loop from control points (or already dense points), without repeats, no two
    neighbours more than max_seg apart."""
    src = points if dense else geo.curve(points, per, closed=True)
    pts = []
    for p in src:
        if not pts or math.dist(p[:2], pts[-1]) > 1e-4:
            pts.append((p[0], p[1]))
    if len(pts) > 2 and math.dist(pts[0], pts[-1]) < 1e-4:
        pts.pop()
    return _fine(pts, max_seg, True)


def _path(path, per, max_seg=0.025, closed=False):
    """A projected strip's path: smooth through its points, then fine enough to follow the skin."""
    pts = geo.catmull_chain([tuple(p) for p in path], per, closed=closed) if len(path) > 2 else [tuple(p) for p in path]
    return _fine(pts, max_seg * LOD['scale'], closed)


def offset_loop(pts, d):
    """A closed 2D loop moved d outward (mitred corners, capped at twice d)."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sg = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        e1 = (p1[0] - p0[0], p1[1] - p0[1])
        e2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1 = math.hypot(*e1) or 1e-9
        l2 = math.hypot(*e2) or 1e-9
        n1 = (sg * e1[1] / l1, -sg * e1[0] / l1)
        n2 = (sg * e2[1] / l2, -sg * e2[0] / l2)
        m = (n1[0] + n2[0], n1[1] + n2[1])
        lm = math.hypot(*m) or 1e-9
        m = (m[0] / lm, m[1] / lm)
        c = max(0.5, m[0] * n1[0] + m[1] * n1[1])
        out.append((p1[0] + m[0] * d / c, p1[1] + m[1] * d / c))
    return out


def patch2d(outline, grid=0.025, per=4, hole=None, dense=False, max_seg=0.01):
    """Triangulate a closed 2D outline (control points with sharp flags, or a dense loop) with
    interior points, leaving out an optional hole (a dense loop): (points, triangles, boundary
    edges)."""
    pts = _loop(outline, per, dense, max_seg)
    hl = _loop(hole, dense=True, max_seg=max_seg) if hole else []
    nb, nh = len(pts), len(hl)
    us = [p[0] for p in pts]
    vs = [p[1] for p in pts]
    inner = []
    ol = Outline([(p[0], p[1], 1) for p in pts], step=1.0)
    hol = Outline([(p[0], p[1], 1) for p in hl], step=1.0) if hl else None
    edge_pts = pts + hl
    u = min(us) + grid * 0.5
    while u < max(us):
        v = min(vs) + grid * 0.5
        while v < max(vs):
            if ol.contains(u, v) and not (hol and hol.contains(u, v)) and min(math.dist((u, v), q) for q in edge_pts) > grid * 0.45:
                inner.append((u, v))
            v += grid
        u += grid
    allp = pts + hl + inner
    edges = [(i, (i + 1) % nb) for i in range(nb)] + [(nb + i, nb + (i + 1) % nh) for i in range(nh)]
    res = delaunay_2d_cdt([Vector(p) for p in allp], edges, [list(range(nb))], 1, 1e-6)
    verts = [(v.x, v.y) for v in res[0]]
    tris = [tuple(f) for f in res[2] if len(f) == 3]
    if hol:
        tris = [f for f in tris if not hol.contains(sum(verts[i][0] for i in f) / 3, sum(verts[i][1] for i in f) / 3)]
    # boundary: edges used once, ordered into a loop
    count = {}
    for f in tris:
        for i in range(3):
            e = (f[i], f[(i + 1) % 3])
            count[tuple(sorted(e))] = count.get(tuple(sorted(e)), 0) + 1
    return verts, tris, [e for e, c in count.items() if c == 1]


def projected_layers(surface, view, outline, offsets, grid=0.025, per=4, hole=None, dense=False, facing=0.3, max_seg=0.01, along_view=False):
    """Project a triangulated outline onto the skin; returns (layers, tris, boundary edges)
    where layers[k][i] = hit point i moved offsets[k] along the surface normal (outward), or with
    along_view back along the view's rays: every layer then a copy of the hit patch shifted
    straight along them, which can't fold over itself however the skin curves."""
    verts, tris, bnd = patch2d(outline, grid, per, hole, dense, max_seg)
    edges = {tuple(sorted((f[i], f[(i + 1) % 3]))) for f in tris for i in range(3)}
    hits = _connected([surface.project(view, u, v, facing=facing) for u, v in verts], view, verts, edges, facing)
    if not any(hits):
        return None
    # misses (outline running off the edge of the skin) borrow their nearest hit's depth and normal
    # but keep their own place across the view: points piled onto one hit make zero-area faces,
    # and a cutter with those tears the skin
    good = [i for i, h in enumerate(hits) if h]
    ua, va, _ = VIEWS[view]
    for i, h in enumerate(hits):
        if not h:
            j = min(good, key=lambda k: math.dist(verts[i], verts[k]))
            p = list(hits[j][0])
            p[AXIS[ua]], p[AXIS[va]] = verts[i][0], verts[i][1]
            hits[i] = (tuple(p), hits[j][1])
    if along_view:
        back = tuple(-c for c in VIEWS[view][2])
        layers = [[_add(p, back, off) for (p, n) in hits] for off in offsets]
    else:
        layers = [[_add(p, n, off) for (p, n) in hits] for off in offsets]
    return layers, tris, bnd


def _slab(name, coll, top, bot, tris, bnd, role, sharp, wall_role=None):
    """Closed mesh between two layers of the same triangulation (the walls may take their own role)."""
    n = len(top)
    verts = top + bot
    faces = [tuple(f) for f in tris] + [(f[0] + n, f[2] + n, f[1] + n) for f in tris]
    roles = [role] * (2 * len(tris))
    for a, b in bnd:
        faces.append((a, b, b + n, a + n))
        roles.append(wall_role or role)
    return geo.make_mesh(name, verts, faces, coll, role, face_roles=roles if wall_role else None, sharp=sharp)


def pocket(target, surface, view, outline, depth, coll, role='trim', wall_role=None, lift=0.03, grid=0.025, per=4, sharp=40.0, facing=0.3):
    """Cut a pocket `depth` deep (along the view's rays) that follows the skin under a projected
    outline: its floor takes `role` (a lamp housing, an intake's grille), its walls `wall_role`
    (default the same). (The cutter is the skin's patch pushed straight along the rays: one pushed
    along the skin's normals folds over itself where a coarse grid meets a tight curve, and a
    folded cutter tears the skin or wipes it out.) grid is the full model's; it coarsens with the
    level being built."""
    grid *= LOD['scale']
    res = projected_layers(surface, view, outline, (lift, -depth), grid, per, max_seg=max(0.012, grid), facing=facing, along_view=True)
    if not res:
        return None
    (top, bot), tris, bnd = res
    cutter = _slab('cut', coll, top, bot, tris, bnd, role, sharp, wall_role)
    geo.boolean(target, cutter, sharp=sharp)
    return target


def panel(name, surface, view, outline, coll, role='window', depth=0.006, thick=0.004, grid=0.03, per=4, sharp=50.0, facing=0.3):
    """A thin panel set `depth` below the skin under a projected outline: glass, a lens, a plate.
    (A negative depth stands it proud; keep its back a millimetre under the skin then, so no gap
    and no flicker shows at its edge.) grid is the full model's; it coarsens with the level."""
    grid *= LOD['scale']
    res = projected_layers(surface, view, outline, (-depth, -depth - thick), grid, per, facing=facing, max_seg=max(0.008, grid * 0.35))
    if not res:
        return None
    (top, bot), tris, bnd = res
    return _slab(name, coll, top, bot, tris, bnd, role, sharp)


def ring_panel(name, surface, view, outline, coll, role='trim', width=0.012, depth=-0.003, thick=0.004, grid=0.026, per=4, facing=0.3,
               dense=False):
    """A band `width` wide round a projected outline, standing on the skin: a window's black
    surround, the border round a glass panel. Smooth and even, where a tube laid along the
    outline wobbles on a curved surface."""
    grid *= LOD['scale']
    inner = _loop(outline, per, dense, max(0.012, grid * 0.75))
    outer = offset_loop(inner, width)
    res = projected_layers(surface, view, outer, (-depth, -depth - thick), min(grid, width * 1.5), per, hole=inner, dense=True, facing=facing,
                           max_seg=max(0.012, grid * 0.75))
    if not res:
        return None
    (top, bot), tris, bnd = res
    return _slab(name, coll, top, bot, tris, bnd, role, 50.0)


def frit(name, surface, view, outline, coll, width=0.035, depth=0.005, per=4, grid=0.026):
    """The black band printed round the edge of a windscreen set `depth` + 1 mm under the skin,
    lying just on the glass: it hides the opening's edge behind the glass, as on a real car."""
    inner = offset_loop(_loop(outline, per, max_seg=max(0.012, grid * LOD['scale'] * 0.75)), -width)
    return ring_panel(name, surface, view, inner, coll, 'trim', width=width, depth=depth, thick=0.0008, grid=grid, per=per, dense=True)


def glass_panel(name, surface, view, outline, coll, role='glass', border=0.014, grid=0.025, per=4, facing=0.3):
    """Glass laid onto the skin (an engine cover's window, a pickup's back glass) in a black
    border: the glass 4 mm proud, its border just under it, both seated a millimetre into the skin."""
    g = panel(name, surface, view, outline, coll, role, depth=-0.004, thick=0.005, grid=grid, per=per, facing=facing)
    b = ring_panel(name + '_border', surface, view, outline, coll, 'trim', width=border, depth=-0.0036, thick=0.0046, grid=grid, per=per,
                   facing=facing) if border else None
    return g, b


def ribbon(name, surface, view, path, coll, role='drl', width=0.01, depth=0.006, thick=0.006, per=6, sharp=None, facing=0.3):
    """A strip laid along a projected path (an LED light guide, a pin stripe of trim)."""
    pts = _path(path, per)
    hits = _connected([surface.project(view, u, v, facing=facing) for u, v in pts], view, pts, _chain(len(pts)), facing)
    hits = [h for h in hits if h]
    if len(hits) < 2:
        return None
    rings = []
    for i, (p, n) in enumerate(hits):
        q = hits[min(i + 1, len(hits) - 1)][0]
        o = hits[max(i - 1, 0)][0]
        t = _norm3((q[0] - o[0], q[1] - o[1], q[2] - o[2]))
        b = _norm3(_cross3(n, t))
        base = _add(p, n, -depth)
        h = width / 2
        rings.append([_add(_add(base, b, h), n, thick), _add(_add(base, b, -h), n, thick), _add(base, b, -h), _add(base, b, h)])
    return geo.loft(name, rings, coll, role, sharp=sharp if sharp is not None else 60.0)


def disc(name, surface, view, center, radius, coll, role='lens', depth=0.008, thick=0.008, sides=20, facing=0.3):
    """A round lens set into the skin at a projected point."""
    h = surface.project(view, *center, facing=facing)
    if not h:
        return None
    p, n = h
    a = _norm3(_cross3(n, (0.0, 1.0, 0.0) if abs(n[1]) < 0.9 else (1.0, 0.0, 0.0)))
    b = _cross3(n, a)
    base = _add(p, n, -depth)
    rings = []
    for off in (thick, 0.0):
        c = _add(base, n, off)
        rings.append([_add(_add(c, a, radius * math.cos(2 * math.pi * k / sides)), b, radius * math.sin(2 * math.pi * k / sides)) for k in range(sides)])
    return geo.loft(name, rings, coll, role, sharp=50.0)


def bead(name, surface, view, path, coll, role='chrome', radius=0.006, lift=0.002, per=6, sides=8, closed=False):
    """A rounded strip standing on the skin along a projected path (window frames, trims)."""
    pts = _path(path, per, closed=closed)
    hits = _connected([surface.project(view, u, v) for u, v in pts], view, pts, _chain(len(pts), closed), 0.3)
    hits = [h for h in hits if h]
    if len(hits) < 2:
        return None
    path3 = [_add(p, n, lift) for p, n in hits]
    if closed:
        path3.append(path3[0])
    return geo.tube(name, path3, coll, radius=radius, role=role, sides=sides, caps=(not closed, not closed), sharp=60.0)


# --------------------------------------------------------------------------------- shaping
def displace(ob, fn):
    """Move every vertex: fn(x, y, z) -> (x, y, z) in game space (sculpting a scoop or a bulge
    into a lofted skin, as the factory's smooth cuts did)."""
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    for i in range(len(co)):
        x, y, z = fn(float(co[i, 0]), float(co[i, 2]), float(-co[i, 1]))
        co[i] = (x, -z, y)
    me.vertices.foreach_set('co', co.ravel())
    me.update()


def slice_plane(ob, point, normal):
    """Add edges where a plane crosses the mesh, so a material zone can end on a straight line."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(geo.G(*point)), plane_no=Vector(geo.G(*normal)), dist=1e-5)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def zone(ob, fn):
    """Re-assign faces' roles: fn(x, y, z, role, nx, ny, nz) -> new role or None (face centre and
    normal in game space)."""
    me = ob.data
    roles = [m.name.split('.')[0] if m else 'trim' for m in me.materials]
    changes = []
    for poly in me.polygons:
        c = poly.center
        nrm = poly.normal
        r = fn(c.x, c.z, -c.y, roles[poly.material_index], nrm.x, nrm.z, -nrm.y)
        if r and r != roles[poly.material_index]:
            changes.append((poly.index, r))
    for _, r in changes:
        if r not in roles:
            me.materials.append(geo.material(r))
            roles.append(r)
    for i, r in changes:
        me.polygons[i].material_index = roles.index(r)
    me.update()


def smin(a, b, k):
    if k <= 0:
        return min(a, b)
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def smoothstep(a, b, v):
    t = min(1.0, max(0.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


# -------------------------------------------------------------------------------- interiors
def cockpit(coll, n, seat_x, seat_z, floor_y, dash_z, dash_y, dash_w, wheel_z, wheel_y, recline=0.38, lhd=True,
            seats=2, trim='interior', accent='trim'):
    """Bucket seats with bolsters and headrests, a dashboard with a gauge hood and a screen, a
    centre console with a shifter, and a steering wheel on its column."""
    segs = n(3, 1)
    sides = [1, -1] if seats == 2 else [1]
    c, s = math.cos(recline), math.sin(recline)
    for sx in sides:
        x = sx * seat_x
        geo.rbox(f'seat_cushion_{sx}', (x, floor_y + 0.09, seat_z), (0.2, 0.065, 0.24), coll, trim, r=0.05, segs=segs)
        # backrest, reclined: a box rotated about x
        by, bz = floor_y + 0.42, seat_z - 0.27
        back = geo.rbox(f'seat_back_{sx}', (0, 0, 0), (0.2, 0.32, 0.055), coll, trim, r=0.05, segs=segs)
        _place(back, (x, by, bz), recline)
        for bs in (1, -1):
            bol = geo.rbox(f'seat_bolster_{sx}_{bs}', (0, 0, 0), (0.035, 0.22, 0.07), coll, accent, r=0.03, segs=segs)
            _place(bol, (x + bs * 0.2, by - 0.06 * c, bz + 0.06 * s - 0.05), recline)
        head = geo.rbox(f'seat_head_{sx}', (0, 0, 0), (0.12, 0.08, 0.05), coll, trim, r=0.04, segs=segs)
        _place(head, (x, by + 0.4 * c, bz - 0.4 * s), recline)
    geo.rbox('dash', (0, dash_y, dash_z), (dash_w, 0.075, 0.16), coll, trim, r=0.05, segs=segs)
    wx = seat_x if lhd else -seat_x
    geo.rbox('gauge_hood', (wx, dash_y + 0.075, dash_z - 0.07), (0.16, 0.04, 0.08), coll, accent, r=0.03, segs=segs)
    geo.rbox('dash_screen', (0, dash_y + 0.04, dash_z - 0.13), (0.13, 0.05, 0.008), coll, 'glass', r=0.01, segs=max(1, segs - 1))
    geo.rbox('console', (0, floor_y + 0.12, seat_z + 0.2), (0.09, 0.12, 0.45), coll, trim, r=0.04, segs=segs)
    geo.cylinder('shifter', (0, floor_y + 0.22, seat_z + 0.32), (0, floor_y + 0.3, seat_z + 0.3), 0.012, coll, 'chrome', sides=n(8, 4))
    # steering wheel, tilted toward the driver
    tilt = 0.42
    ring = []
    for k in range(n(24, 8)):
        a = 2 * math.pi * k / n(24, 8)
        u, v = 0.165 * math.cos(a), 0.165 * math.sin(a)
        ring.append((wx + u, wheel_y + v * math.cos(tilt), wheel_z + v * math.sin(tilt)))
    geo.tube('steering_rim', ring + ring[:1], coll, radius=0.017, role=accent, sides=n(8, 4), caps=(False, False))
    geo.rbox('steering_hub', (wx, wheel_y, wheel_z), (0.05, 0.05, 0.02), coll, accent, r=0.02, segs=segs)
    geo.cylinder('steering_column', (wx, wheel_y - 0.02, wheel_z + 0.04), (wx, dash_y - 0.01, dash_z - 0.04), 0.025, coll, trim, sides=n(10, 4))


def _place(ob, center, angle):
    """Rotate an object built at the origin about the x axis, then move it to center (game)."""
    me = ob.data
    c, s = math.cos(angle), math.sin(angle)
    for v in me.vertices:
        x, y, z = v.co.x, v.co.z, -v.co.y
        y2, z2 = y * c + z * s, -y * s + z * c
        v.co.x, v.co.y, v.co.z = x + center[0], -(z2 + center[2]), y2 + center[1]
    me.update()


# ------------------------------------------------------------------------------------ parts
def mirror_unit(coll, n, side, mount, head, size, glass_role='chrome', body_role='paint', arm_role='trim', indicator=False, r=None):
    """A door mirror: a stalk from the door to a rounded housing (corner radius r, default nearly
    round), glass facing back, and an optional amber repeater strip along the housing's outer edge."""
    s = side
    hx, hy, hz = head
    w, h, d = size
    geo.strut(f'mirror_arm_{s}', (s * mount[0], mount[1], mount[2]), (s * (hx - w * 0.6), hy - h * 0.2, hz + d * 0.2), coll,
              width=0.035, thick=0.014, role=arm_role, sides=n(10, 6))
    geo.rbox(f'mirror_{s}', (s * hx, hy, hz), (w, h, d), coll, body_role, r=r or min(h, d) * 0.85, segs=n(3, 1))
    geo.rbox(f'mirror_glass_{s}', (s * hx, hy, hz - d + 0.004), (w * 0.88, h * 0.76, 0.004), coll, glass_role, r=min(h, 0.02) * 0.7, segs=n(2, 1))
    if indicator:
        geo.rbox(f'mirror_repeater_{s}', (s * (hx + w * 0.55), hy - h * 0.1, hz + d * 0.15), (w * 0.4, 0.006, 0.01), coll, 'amber', r=0.004, segs=1)


def wiper(coll, n, pivot, angle, length, tag, role='trim'):
    """A wiper lying on the windscreen: an arm from its pivot and a blade along it."""
    px, py, pz = pivot
    ca, sa = math.cos(angle), math.sin(angle)
    tip = (px + ca * length, py + sa * length * 0.18, pz - sa * length * 0.05)
    geo.strut(f'wiper_arm_{tag}', pivot, tip, coll, width=0.014, thick=0.008, role=role, sides=n(8, 4))
    blade0 = (px + ca * length * 0.25, py + sa * length * 0.03 + 0.008, pz)
    geo.strut(f'wiper_blade_{tag}', blade0, (tip[0], tip[1] + 0.008, tip[2]), coll, width=0.01, thick=0.012, role=role, sides=n(6, 4))
    geo.cylinder(f'wiper_pivot_{tag}', (px, py - 0.01, pz), (px, py + 0.012, pz), 0.012, coll, role, sides=n(10, 6))


def lathe_z(name, profile, center, coll, band_roles, sides=24, oval=1.0, facing=-1):
    """A closed surface of revolution round an axis along z through center (x, y): profile is a
    list of (radius, z) from one end to the other (each end closes with a fan, or ends on the
    axis), band_roles a role per gap between profile points. oval stretches it across x."""
    cx, cy = center
    verts, faces, roles = [], [], []
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            verts.append((cx, cy, z))
            rings.append([len(verts) - 1])
            continue
        start = len(verts)
        for k in range(sides):
            t = 2 * math.pi * k / sides
            verts.append((cx + r * math.cos(t) * oval, cy + r * math.sin(t), z))
        rings.append(list(range(start, start + sides)))
    for j in range(len(rings) - 1):
        a, b = rings[j], rings[j + 1]
        for k in range(sides):
            if len(a) == 1:
                faces.append((a[0], b[(k + 1) % sides], b[k]))
            elif len(b) == 1:
                faces.append((a[k], a[(k + 1) % sides], b[0]))
            else:
                faces.append((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
            roles.append(band_roles[j])
    for end, ring_ in ((0, rings[0]), (1, rings[-1])):
        if len(ring_) > 1:
            z = profile[0][1] if end == 0 else profile[-1][1]
            verts.append((cx, cy, z))
            ci = len(verts) - 1
            for k in range(sides):
                faces.append((ring_[k], ring_[(k + 1) % sides], ci))
                roles.append(band_roles[0] if end == 0 else band_roles[-1])
    return geo.make_mesh(name, verts, faces, coll, band_roles[0], face_roles=roles, sharp=45.0)


def exhaust_tip(coll, n, center, radius, length, tag, role='chrome', oval=1.0, depth=0.06, wall=0.006):
    """A hollow exhaust tip pointing back (its open end at center's z): a polished outside and rim,
    a dark inside and a faint glow at the bottom of the pipe."""
    x, y, z = center
    prof = [(radius, z + length), (radius, z + 0.005), (radius - 0.0025, z), (radius - wall + 0.001, z), (radius - wall, z + 0.005),
            (radius - wall, z + depth), (0.0, z + depth)]
    return lathe_z(f'exhaust_{tag}', prof, (x, y), coll, [role, role, role, role, 'trim', 'exhaust'], sides=n(24, 10), oval=oval)
