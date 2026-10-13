"""Geometry helpers for car models scripted in Blender.

Designs work in game space, as the game and the car factory do: +x is the car's left, +y up,
+z forward, in metres, with the wheels on the ground (y = 0). Blender is z-up, so every vertex
goes through G() on its way in: in Blender the car faces -Y (the front view shows its nose) and
stands upright, so the .blend file looks right when opened.

Parts are closed meshes: lofts of cross-sections, swept airfoils, tubes, plates and ellipsoids.
Each part names a material role (paint, carbon, trim, ...) that the game swaps for its own
material; a part can mix roles per face.
"""
import math

import bmesh
import bpy


def G(x, y, z):
    """Game space -> Blender space."""
    return (x, -z, y)


# ------------------------------------------------------------------------------------ maths
def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def smooth(a, b, v):
    t = clamp((v - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def pchip(xs, ys, x):
    """Monotone cubic interpolation through (xs, ys) (xs strictly increasing): no overshoot
    between keys, so a shape never bulges past the profiles it is keyed by. Clamped at the ends."""
    n = len(xs)
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    if n == 2:
        return lerp(ys[0], ys[1], (x - xs[0]) / (xs[1] - xs[0]))
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0] = d[0]
    m[-1] = d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    i = 0
    while x > xs[i + 1]:
        i += 1
    t = (x - xs[i]) / h[i]
    t2 = t * t
    t3 = t2 * t
    return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
            + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])


def keyed(keys, t):
    """Interpolate keyframes [(t, value), ...] where value is a number or a nested list/tuple
    of numbers (same shape in every key). Keys may come in either order."""
    keys = sorted(keys, key=lambda k: k[0])
    ts = [k[0] for k in keys]

    def rec(vals):
        first = vals[0]
        if isinstance(first, (list, tuple)):
            return [rec([v[i] for v in vals]) for i in range(len(first))]
        return pchip(ts, vals, t)

    return rec([k[1] for k in keys])


def catmull_chain(pts, per, closed=False, end_tangents=None):
    """Uniform Catmull-Rom through points (any dimension), `per` samples per segment.
    end_tangents: optional (before-first, after-last) phantom points in place of extrapolation."""
    n = len(pts)
    if n < 2:
        return [tuple(p) for p in pts]
    dim = len(pts[0])

    def at(i):
        if closed:
            return pts[i % n]
        if i < 0:
            if end_tangents and end_tangents[0] is not None:
                return end_tangents[0]
            return tuple(2 * pts[0][k] - pts[1][k] for k in range(dim))
        if i >= n:
            if end_tangents and end_tangents[1] is not None:
                return end_tangents[1]
            return tuple(2 * pts[-1][k] - pts[-2][k] for k in range(dim))
        return pts[i]

    out = []
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = at(i - 1), at(i), at(i + 1), at(i + 2)
        for s in range(per):
            t = s / per
            t2 = t * t
            t3 = t2 * t
            out.append(tuple(0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in range(dim)))
    if not closed:
        out.append(tuple(pts[-1]))
    return out


def curve(pts, per, closed=False, dim=2, end_tangents=None):
    """Smooth curve through control points. A point with one extra item set to 1 ((x, y, 1) in 2D,
    (x, y, z, 1) in 3D) is a sharp corner: the curve splits there into separate smooth runs."""
    coords = [tuple(p[:dim]) for p in pts]
    sharp = [len(p) > dim and p[dim] == 1 for p in pts]
    if not any(sharp):
        return catmull_chain(coords, per, closed, end_tangents)
    n = len(coords)
    out = []
    if closed:
        start = sharp.index(True)
        order = [(start + i) % n for i in range(n + 1)]
        run = [order[0]]
        for i in order[1:]:
            run.append(i)
            if sharp[i]:
                out.extend(catmull_chain([coords[j] for j in run], per)[:-1])
                run = [i]
        return out
    runs = []
    run = [0]
    for i in range(1, n):
        run.append(i)
        if sharp[i] or i == n - 1:
            runs.append(run)
            run = [i]
    for k, run in enumerate(runs):
        et = (end_tangents[0] if end_tangents and k == 0 else None,
              end_tangents[1] if end_tangents and k == len(runs) - 1 else None)
        seg = catmull_chain([coords[j] for j in run], per, end_tangents=et)
        out.extend(seg if k == len(runs) - 1 else seg[:-1])
    return out


# ------------------------------------------------------------------------------- materials
ROLE_PREVIEW = {
    # base colour, metallic, roughness, emission (preview renders only: the game uses its own)
    'paint': ((0.62, 0.025, 0.03), 0.35, 0.22, None),
    'carbon': ((0.02, 0.02, 0.022), 0.3, 0.32, None),
    'trim': ((0.012, 0.012, 0.014), 0.05, 0.55, None),
    'grille': ((0.004, 0.004, 0.005), 0.1, 0.6, None),
    'plastic': ((0.05, 0.052, 0.056), 0.0, 0.78, None),
    'glass': ((0.006, 0.008, 0.012), 0.4, 0.04, None),
    'window': ((0.006, 0.008, 0.012), 0.4, 0.04, None),
    'interior': ((0.025, 0.025, 0.028), 0.0, 0.75, None),
    'head': ((0.2, 0.21, 0.23), 1.0, 0.22, None),
    'chrome': ((0.8, 0.8, 0.82), 1.0, 0.07, None),
    'tail': ((0.25, 0.01, 0.015), 0.1, 0.15, None),
    'tailglow': ((1.0, 0.05, 0.08), 0.0, 0.3, (1.0, 0.04, 0.06, 6.0)),
    'exhaust': ((0.05, 0.02, 0.01), 0.6, 0.6, (1.0, 0.3, 0.06, 1.0)),
    'drl': ((1, 1, 1), 0.0, 0.3, (1, 1, 1, 4.0)),
    'amber': ((1.0, 0.45, 0.06), 0.0, 0.2, (1.0, 0.42, 0.05, 3.0)),
    'indicator': ((0.6, 0.24, 0.02), 0.1, 0.15, None),
    'reverse': ((0.7, 0.72, 0.75), 0.6, 0.12, None),
    # preview-only parts (the game generates its own wheels)
    'tyre': ((0.018, 0.018, 0.02), 0.0, 0.85, None),
    'rim': ((0.28, 0.29, 0.31), 0.9, 0.28, None),
    'ground': ((0.32, 0.32, 0.33), 0.0, 0.6, None),
}


def material(role):
    mat = bpy.data.materials.get(role)
    if mat:
        return mat
    mat = bpy.data.materials.new(role)
    base, metal, rough, emit = ROLE_PREVIEW.get(role, ROLE_PREVIEW['trim'])
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*base, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if role == 'paint':
        bsdf.inputs['Coat Weight'].default_value = 1.0
        bsdf.inputs['Coat Roughness'].default_value = 0.03
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit[:3], 1)
        bsdf.inputs['Emission Strength'].default_value = emit[3]
    mat.diffuse_color = (*base, 1)
    return mat


# ----------------------------------------------------------------------------------- meshes
def collection(name, parent=None):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(coll)
    return coll


def make_mesh(name, verts, faces, coll, role='paint', face_roles=None, sharp=35.0, recalc=True):
    """A mesh object from game-space vertices. face_roles: one role per face (else all `role`).
    sharp: edges creased more than this (degrees) get split normals; None keeps all smooth."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([G(*v) for v in verts], [], faces)
    me.validate(clean_customdata=False)
    roles = list(dict.fromkeys(face_roles)) if face_roles else [role]
    for r in roles:
        me.materials.append(material(r))
    if face_roles:
        idx = [roles.index(r) for r in face_roles]
        if len(idx) == len(me.polygons):
            me.polygons.foreach_set('material_index', idx)
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    finish_shading(ob, sharp)
    return ob


def finish_shading(ob, sharp=35.0):
    me = ob.data
    me.shade_smooth()
    if sharp is not None:
        me.set_sharp_from_angle(angle=math.radians(sharp))


def grid_faces(rows, cols, closed=True):
    """Quads joining `rows` rings of `cols` points each (ring-major vertex order)."""
    faces = []
    for j in range(rows - 1):
        for i in range(cols if closed else cols - 1):
            a = j * cols + i
            b = j * cols + (i + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    return faces


def grid_cap(ring, outer, verts, spacing):
    """Fill a (near) planar ring with even triangles: a grid of points `spacing` apart, clear of
    the edge, triangulated with the ring as the boundary (constrained Delaunay). Interior points are
    appended to verts; returns the faces, or None if the ring won't triangulate."""
    from mathutils import Vector
    from mathutils.geometry import delaunay_2d_cdt
    n = len(ring)
    c = tuple(sum(p[i] for p in ring) / n for i in range(3))
    nx = ny = nz = 0.0
    for i in range(n):
        p, q = ring[i], ring[(i + 1) % n]
        nx += (p[1] - q[1]) * (p[2] + q[2])
        ny += (p[2] - q[2]) * (p[0] + q[0])
        nz += (p[0] - q[0]) * (p[1] + q[1])
    ln = math.sqrt(nx * nx + ny * ny + nz * nz)
    if ln < 1e-12:
        return None
    nrm = (nx / ln, ny / ln, nz / ln)
    u = _norm(_cross(nrm, (1.0, 0.0, 0.0) if abs(nrm[0]) < 0.9 else (0.0, 1.0, 0.0)))
    v = _cross(nrm, u)
    pts = [(_dot(_sub(p, c), u), _dot(_sub(p, c), v)) for p in ring]
    us, vs = [p[0] for p in pts], [p[1] for p in pts]

    def inside(a, b):
        hits = 0
        for i in range(n):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
            if (y0 > b) != (y1 > b) and a < x0 + (x1 - x0) * (b - y0) / (y1 - y0):
                hits += 1
        return hits % 2 == 1

    def clear(a, b):
        lim = (0.45 * spacing) ** 2
        for i in range(n):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
            dx, dy = x1 - x0, y1 - y0
            t = max(0.0, min(1.0, ((a - x0) * dx + (b - y0) * dy) / (dx * dx + dy * dy or 1e-18)))
            if (a - x0 - dx * t) ** 2 + (b - y0 - dy * t) ** 2 < lim:
                return False
        return True

    inner = []
    a = min(us) + spacing * 0.5
    while a < max(us):
        b = min(vs) + spacing * 0.5
        while b < max(vs):
            if inside(a, b) and clear(a, b):
                inner.append((a, b))
            b += spacing
        a += spacing
    res = delaunay_2d_cdt([Vector(p) for p in pts + inner], [(i, (i + 1) % n) for i in range(n)], [list(range(n))], 1, 1e-7)
    out_verts, _, out_faces, orig_verts = res[0], res[1], res[2], res[3]
    index = []
    for j, ov in enumerate(out_verts):
        src = [o for o in orig_verts[j] if o < n]
        if src:
            index.append(outer[src[0]])
        else:
            verts.append(tuple(c[i] + u[i] * ov.x + v[i] * ov.y for i in range(3)))
            index.append(len(verts) - 1)
    faces = [tuple(index[i] for i in f) for f in out_faces if len(f) >= 3]
    return faces or None


def loft(name, rings, coll, role='paint', band_roles=None, caps=(True, True), tips=(None, None), sharp=35.0, cap_bands=1, cap_grid=None):
    """Skin closed rings (lists of game-space points, equal length) into a closed mesh.
    band_roles: a role per gap between consecutive rings (len(rings) - 1), else all `role`.
    caps: close the first / last ring with a fan; tips: the fan's centre (default: ring centre).
    cap_bands > 1 closes them with that many concentric bands round a small fan instead, cap_grid
    (a spacing) with even triangles (see grid_cap): a big flat end (a car's tail) closed by one fan
    of long thin triangles shades in streaks from its centre, and a lamp or plate cut into it leaves
    slivers that smear the baked shadow across the panel."""
    rows = len(rings)
    cols = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = grid_faces(rows, cols)
    face_roles = None
    if band_roles:
        face_roles = [band_roles[j] for j in range(rows - 1) for _ in range(cols)]
    for k, cap in enumerate(caps):
        if not cap:
            continue
        ring = rings[0] if k == 0 else rings[-1]
        outer = list(range(0, cols)) if k == 0 else list(range((rows - 1) * cols, rows * cols))
        if cap_grid:
            filled = grid_cap(ring, outer, verts, cap_grid)
            if filled:
                faces += filled
                if face_roles is not None:
                    face_roles += [band_roles[0] if k == 0 else band_roles[-1]] * len(filled)
                continue
        c = tips[k] or tuple(sum(p[i] for p in ring) / cols for i in range(3))
        cap_faces = []
        for j in range(1, max(1, cap_bands)):
            s = 1.0 - j / cap_bands
            start = len(verts)
            verts.extend(tuple(c[i] + (p[i] - c[i]) * s for i in range(3)) for p in ring)
            inner = list(range(start, start + cols))
            cap_faces += [(outer[i], outer[(i + 1) % cols], inner[(i + 1) % cols], inner[i]) for i in range(cols)]
            outer = inner
        verts.append(tuple(c))
        ci = len(verts) - 1
        cap_faces += [(outer[i], outer[(i + 1) % cols], ci) for i in range(cols)]
        faces += cap_faces
        if face_roles is not None:
            face_roles += [band_roles[0] if k == 0 else band_roles[-1]] * len(cap_faces)
    return make_mesh(name, verts, faces, coll, role, face_roles, sharp)


def dome(ring, axis, length, steps):
    """Close a loft end into a rounded dome: rings shrinking toward the end ring's centre along a
    quarter ellipse while moving up to `length` along `axis` (unit vector), plus the tip point."""
    cols = len(ring)
    c = [sum(p[i] for p in ring) / cols for i in range(3)]
    out = []
    for s in range(1, steps):
        a = (math.pi / 2) * s / steps
        k = math.cos(a)
        d = math.sin(a) * length
        out.append([tuple(c[i] + (p[i] - c[i]) * k + axis[i] * d for i in range(3)) for p in ring])
    tip = tuple(c[i] + axis[i] * length for i in range(3))
    return out, tip


# ------------------------------------------------------------------------------- profiles
def half_ring(ctrl, per, mirror_x=0.0):
    """A closed cross-section from a half profile: control points (x, y[, 1 = sharp]) running
    from the top centre (x = mirror_x) round the +x side to the bottom centre. The -x half is
    its mirror image. Returns 2D points, top centre first, going round the +x side."""
    def mir(p):
        return (2 * mirror_x - p[0], p[1])

    half = curve(ctrl, per, dim=2, end_tangents=(mir(ctrl[1]), mir(ctrl[-2])))
    half[0] = (mirror_x, half[0][1])
    half[-1] = (mirror_x, half[-1][1])
    other = [(2 * mirror_x - x, y) for (x, y) in reversed(half[1:-1])]
    return half + other


def keyed_body(keys, zs, per, mirror_x=0.0):
    """Rings for a symmetric body keyed by half profiles: keys [(z, [(x, y[, 1]), ...]), ...],
    every profile with the same number of control points (sharp flags come from the first key).
    zs: the stations to cut rings at."""
    flags = [len(p) > 2 and p[2] == 1 for p in keys[0][1]]
    plain = [(k[0], [(p[0], p[1]) for p in k[1]]) for k in keys]
    rings = []
    for z in zs:
        prof = keyed(plain, z)
        ctrl = [(p[0], p[1], 1) if f else (p[0], p[1]) for p, f in zip(prof, flags)]
        rings.append([(x, y, z) for (x, y) in half_ring(ctrl, per, mirror_x)])
    return rings


def stations(z0, z1, n, ease=0.0):
    """n stations from z0 to z1, bunched toward both ends by `ease` (0 = even)."""
    out = []
    for i in range(n):
        t = i / (n - 1)
        t = lerp(t, 0.5 - 0.5 * math.cos(math.pi * t), ease)
        out.append(lerp(z0, z1, t))
    return out


# ------------------------------------------------------------------------------- airfoils
def airfoil(count, thick=0.1, camber=0.04, pos=0.4):
    """NACA 4-digit style section as a closed loop of (u, v) points, u along the chord (0 = leading
    edge, 1 = trailing edge), v up. Cosine spacing packs points round the leading edge."""
    half = count // 2
    us = [0.5 * (1 - math.cos(math.pi * i / half)) for i in range(half + 1)]

    def yc(u):
        if camber == 0:
            return 0.0, 0.0
        if u < pos:
            return camber / pos ** 2 * (2 * pos * u - u * u), 2 * camber / pos ** 2 * (pos - u)
        return camber / (1 - pos) ** 2 * ((1 - 2 * pos) + 2 * pos * u - u * u), 2 * camber / (1 - pos) ** 2 * (pos - u)

    def yt(u):
        return 5 * thick * (0.2969 * math.sqrt(u) - 0.126 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1036 * u ** 4)

    upper = []
    lower = []
    for u in us:
        c, dc = yc(u)
        th = math.atan(dc)
        t = max(yt(u), 0.006 * thick / 0.1 if u > 0.97 else 0.0)
        upper.append((u - t * math.sin(th), c + t * math.cos(th)))
        lower.append((u + t * math.sin(th), c - t * math.cos(th)))
    # trailing edge -> upper -> leading edge -> lower -> (back to the trailing edge)
    return list(reversed(upper)) + lower[1:-1]


def wing_rings(span, foil, invert=True):
    """Rings for a wing element swept across the car. span: stations
    (x, chord, le_y, le_z, angle_deg[, thick_scale]); the angle raises the trailing edge.
    With invert the airfoil's camber faces down: a downforce wing."""
    rings = []
    for st in span:
        x, c, ly, lz, ang = st[:5]
        ts = st[5] if len(st) > 5 else 1.0
        a = math.radians(ang)
        dy, dz = math.sin(a), -math.cos(a)   # along the chord: back and up
        ny, nz = math.cos(a), math.sin(a)    # across it
        ring = []
        for u, v in foil:
            v = (-v if invert else v) * ts
            ring.append((x, ly + c * (u * dy + v * ny), lz + c * (u * dz + v * nz)))
        rings.append(ring)
    return rings


def wing(name, keys, xs, foil, coll, role='carbon', invert=True, caps=(True, True), sharp=40.0):
    """A wing element keyed across its span: keys [(x, [chord, le_y, le_z, angle, thick]), ...]
    sampled at stations xs (in increasing x)."""
    span = [(x, *keyed(keys, x)) for x in xs]
    return loft(name, wing_rings(span, foil, invert), coll, role, caps=caps, sharp=sharp)


# ---------------------------------------------------------------------------------- plates
def plate(name, outline, coll, role='paint', plane='x', at=0.0, thick=0.01, per=4, sharp=50.0):
    """A flat plate: a 2D outline (control points, sharp corners flagged) extruded `thick` across
    its plane. plane 'x': outline is (z, y) at x = at; 'y': (x, z) at height at; 'z': (x, y)."""
    pts = curve(outline, per, closed=True)
    n = len(pts)

    def P(u, v, w):
        if plane == 'x':
            return (w, v, u)
        if plane == 'y':
            return (u, w, v)
        return (u, v, w)

    verts = [P(u, v, at - thick / 2) for (u, v) in pts] + [P(u, v, at + thick / 2) for (u, v) in pts]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return make_mesh(name, verts, faces, coll, role, None, sharp)


def outline_span(pts, y):
    """(min, max) of u where the line at height y crosses a closed 2D outline of (u, y) points."""
    hits = []
    for i in range(len(pts)):
        (u0, y0), (u1, y1) = pts[i], pts[(i + 1) % len(pts)]
        if (y0 - y) * (y1 - y) <= 0 and y0 != y1:
            hits.append(u0 + (u1 - u0) * (y - y0) / (y1 - y0))
    return (min(hits), max(hits)) if len(hits) >= 2 else None


def sliced_plate(name, outline, coll, role, x_of_y, thick=0.012, slices=24, sides=16, per=4, sharp=50.0):
    """A plate built from horizontal slices of a 2D outline (z, y, sharp corners flagged), its
    centre plane bending with height to x = x_of_y(y): an endplate curling in at the top, say.
    Each slice is a long rounded rectangle, `thick` across."""
    pts = curve(outline, per, closed=True)
    ys = [p[1] for p in pts]
    rings = []
    for y in stations(min(ys) + 0.0015, max(ys) - 0.0015, slices, ease=0.35):
        span = outline_span(pts, y)
        if not span:
            continue
        zc, hl = (span[0] + span[1]) / 2, max((span[1] - span[0]) / 2, 0.002)
        xc, h = x_of_y(y), thick / 2
        ring = []
        for k in range(sides):
            t = 2 * math.pi * k / sides
            c, s = math.cos(t), math.sin(t)
            ring.append((xc + h * math.copysign(abs(s) ** (1 / 3), s), y, zc + hl * math.copysign(abs(c) ** (1 / 3), c)))
        rings.append(ring)
    return loft(name, rings, coll, role, sharp=sharp)


# ----------------------------------------------------------------------------------- tubes
def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _norm(a):
    l = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1e-12
    return (a[0] / l, a[1] / l, a[2] / l)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def frames(path, up=(0.0, 1.0, 0.0)):
    """Rotation-minimising frames along a polyline: (tangent, normal, binormal) per point, the
    normal starting as close to `up` as the tangent allows."""
    n = len(path)
    tans = [_norm(_sub(path[min(i + 1, n - 1)], path[max(i - 1, 0)])) for i in range(n)]
    t0 = tans[0]
    if abs(_dot(up, t0)) > 0.999:
        nrm = _norm(_cross(t0, (1.0, 0.0, 0.0)))
    else:
        nrm = _norm(_sub(up, tuple(t0[k] * _dot(up, t0) for k in range(3))))
    out = []
    for t in tans:
        nrm = _norm(_sub(nrm, tuple(t[k] * _dot(nrm, t) for k in range(3))))
        out.append((t, nrm, _cross(t, nrm)))
    return out


def tube(name, path, coll, radius=0.02, role='carbon', sides=12, up=(0.0, 1.0, 0.0), section=None,
         caps=(True, True), sharp=50.0, smooth_path=0):
    """Sweep a section along a 3D path (game space). radius: a number, (a, b) for an ellipse (a
    along the frame normal, which starts near `up`), or a callable t -> either. section: optional
    closed list of (u, v) points (unit half extents) used instead of an ellipse."""
    if smooth_path:
        path = catmull_chain(path, smooth_path)
    fr = frames(path, up)
    n = len(path)
    sec = section or [(math.cos(2 * math.pi * k / sides), math.sin(2 * math.pi * k / sides)) for k in range(sides)]
    rings = []
    for i, p in enumerate(path):
        r = radius(i / (n - 1)) if callable(radius) else radius
        a, b = (r, r) if isinstance(r, (int, float)) else r
        tan, nrm, bi = fr[i]
        rings.append([tuple(p[c] + nrm[c] * u * a + bi[c] * v * b for c in range(3)) for (u, v) in sec])
    return loft(name, rings, coll, role, caps=caps, sharp=sharp)


def strut(name, a, b, coll, width=0.04, thick=0.012, role='carbon', sides=10, up=(0.0, 1.0, 0.0), sharp=60.0):
    """A straight flattened arm from a to b (suspension links, stays): thin across `up`."""
    return tube(name, [a, b], coll, radius=(thick / 2, width / 2), role=role, sides=sides, up=up, sharp=sharp)


# ------------------------------------------------------------------------------- primitives
def ellipsoid(name, center, radii, coll, role='paint', rings=16, segs=24, face_role=None, sharp=None,
              squash=2.0):
    """An ellipsoid (squash > 2: a superellipsoid, boxier). face_role(u, v) -> role picks a role per
    face from where it sits on the grid, so a region's edges follow the grid lines cleanly (a visor
    on a helmet, say): u runs 0..1 from the top pole to the bottom one, v 0..1 round from +x
    (0.25 faces forward, +z)."""
    cx, cy, cz = center
    rx, ry, rz = radii
    e = 2.0 / squash

    def sp(v):
        return math.copysign(abs(v) ** e, v)

    verts = [(cx, cy + ry, cz)]
    for i in range(1, rings):
        phi = math.pi * i / rings
        for j in range(segs):
            th = 2 * math.pi * j / segs
            verts.append((cx + rx * sp(math.sin(phi)) * sp(math.cos(th)), cy + ry * sp(math.cos(phi)),
                          cz + rz * sp(math.sin(phi)) * sp(math.sin(th))))
    verts.append((cx, cy - ry, cz))
    faces = [(0, 1 + (j + 1) % segs, 1 + j) for j in range(segs)]
    uv = [(0.5 / rings, (j + 0.5) / segs) for j in range(segs)]
    for i in range(rings - 2):
        for j in range(segs):
            a = 1 + i * segs + j
            b = 1 + i * segs + (j + 1) % segs
            faces.append((a, b, b + segs, a + segs))
            uv.append(((i + 1.5) / rings, (j + 0.5) / segs))
    last = len(verts) - 1
    base = 1 + (rings - 2) * segs
    faces += [(base + j, base + (j + 1) % segs, last) for j in range(segs)]
    uv += [((rings - 0.5) / rings, (j + 0.5) / segs) for j in range(segs)]
    face_roles = [face_role(u, v) for u, v in uv] if face_role else None
    return make_mesh(name, verts, faces, coll, role, face_roles, sharp)


def box(name, center, half, coll, role='trim'):
    """A plain axis-aligned box (a crisp boolean cutter)."""
    cx, cy, cz = center
    hx, hy, hz = half
    verts = [(cx + sx * hx, cy + sy * hy, cz + sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return make_mesh(name, verts, faces, coll, role, sharp=30.0)


def rbox(name, center, half, coll, role='trim', r=0.01, segs=3, sharp=None):
    """A rounded box: centre, half extents, corner radius (roughly)."""
    return ellipsoid(name, center, half, coll, role, rings=4 * segs + 2, segs=8 * segs, sharp=sharp,
                     squash=max(2.0, 2.0 * min(half) / max(r, 1e-4)))


def cylinder(name, a, b, radius, coll, role='trim', sides=16, caps=(True, True), sharp=40.0):
    axis = _norm(_sub(b, a))
    up = (1.0, 0.0, 0.0) if abs(axis[1]) > 0.9 else (0.0, 1.0, 0.0)
    return tube(name, [a, b], coll, radius=radius, role=role, sides=sides, caps=caps, sharp=sharp, up=up)


# ---------------------------------------------------------------------------------- booleans
SOLVERS = ('MANIFOLD', 'EXACT', 'FLOAT', 'FAST')  # (the order booleans try solvers in)


def open_edges(me):
    """Edges not shared by exactly two faces (holes, fins, pinches): a closed solid has none."""
    bm = bmesh.new()
    bm.from_mesh(me)
    n = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return n


def boolean(target, cutter, op='DIFFERENCE', keep_cutter=False, sharp=35.0, guard=None):
    """Apply a boolean (exact solver, tolerant of small holes). Faces the cutter adds bring the
    cutter's materials. A result that loses most of the target, or tears it open (edges no longer
    shared by two faces where it had none - a cutter folding over itself on a tight curve does
    it), is refused: the other solvers are tried, else the target is kept and a warning printed.
    A bad cutter shouldn't wipe out a whole body, and a torn body makes every later boolean on it
    misfire. (An intersection is meant to lose most of the target: no face count guard there.)"""
    if guard is None:
        guard = op != 'INTERSECT'

    def run(solver):
        mod = target.modifiers.new('bool', 'BOOLEAN')
        mod.operation = op
        mod.solver = solver
        mod.object = cutter
        if hasattr(mod, 'material_mode'):
            mod.material_mode = 'TRANSFER'
        if solver == 'EXACT' and hasattr(mod, 'use_hole_tolerant'):
            mod.use_hole_tolerant = True
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
        target.modifiers.clear()
        # weld the seams the cut leaves, so the next boolean sees a closed surface
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bm.to_mesh(me)
        bm.free()
        return me

    old = target.data
    torn = open_edges(old)
    solvers = [s for s in SOLVERS if s in {i.identifier for i in bpy.types.BooleanModifier.bl_rna.properties['solver'].enum_items}]
    me, why = None, ''
    for solver in solvers:
        me = run(solver)
        if not me.polygons:
            why = 'nothing left'
        elif guard and len(me.polygons) < 0.6 * len(old.polygons):
            why = f'{len(old.polygons)} -> {len(me.polygons)} faces'
        elif open_edges(me) > torn:
            why = f'{open_edges(me) - torn} torn edges'
        else:
            if solver != solvers[0]:
                print(f'NOTE boolean {op} of {target.name} with {cutter.name}: {solver} solver ({solvers[0].lower()}: {why})', flush=True)
            break
        bpy.data.meshes.remove(me)
        me = None
    if me is None:
        print(f'WARNING boolean {op} of {target.name} with {cutter.name} kept the target ({why})', flush=True)
    else:
        target.data = me
        bpy.data.meshes.remove(old)
    if not keep_cutter:
        bpy.data.objects.remove(cutter)
    finish_shading(target, sharp)
    return target


def mirror_copy(ob, name=None):
    """A copy of an object mirrored across the car's centre plane (x -> -x)."""
    me = ob.data.copy()
    for v in me.vertices:
        v.co.x = -v.co.x
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    cp = bpy.data.objects.new(name or ob.name + '.R', me)
    for c in ob.users_collection:
        c.objects.link(cp)
    return cp


def both_sides(build):
    """Call build(s, suffix) for the left (+x, s = 1) and right (s = -1) side."""
    return [build(1, 'L'), build(-1, 'R')]
