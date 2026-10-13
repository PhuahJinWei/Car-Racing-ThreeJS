"""JUKEBOX: a late-50s American land yacht. A long, wide, low two-door hardtop: quad headlamps in
chrome rings under chrome brows, a wide chrome grille of round bars over a dark mesh, massive chrome
bumpers wrapping the corners (two bullets and amber parking lamps on the front one, the exhausts
leaving through ports in the ends of the rear one), a jet on the nose of the hood, a panoramic
windshield and a wraparound back window, pillarless side glass, chrome frames round all of it, a
chrome spear down each side over chrome sills and arch trims, skirts over the rear wheels, tall
tail fins edged in chrome carrying twin bullet tail lamps, a chrome grille across the tail echoing
the front one (the plate standing in its middle, reversing lamps either side), bench seats front
and back, and whitewall tyres. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/jukebox.js), re-spaced (see
views.densify).
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    # (small rims on tall sidewalls, wide whitewalls on them)
    'front': {'z': 1.55, 'y': 0.36, 'x': 0.8, 'r': 0.36, 'w': 0.21, 'rim': 0.2, 'whitewall': 0.075},
    'rear': {'z': -1.6, 'y': 0.36, 'x': 0.8, 'r': 0.36, 'w': 0.21, 'rim': 0.2, 'whitewall': 0.075},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z): the door, the hood, the deck lid
    'panels': {
        'side': [[[1.0, 0.86], [1.02, 0.5], [0.98, 0.26], [-0.4, 0.26], [-0.42, 0.5], [-0.4, 0.88]]],
        'top': [
            [[-0.8, 1.1], [0.8, 1.1], [0.9, 1.8], [0.88, 2.6], [-0.88, 2.6], [-0.9, 1.8], [-0.8, 1.1]],
            [[-0.62, -1.55], [0.62, -1.55], [0.7, -2.6], [-0.7, -2.6], [-0.62, -1.55]],
        ],
    },
    # `plate`: the licence plate painted onto the plate standing in the tail grille (rear view)
    'livery': {
        'door': [0.3, 0.6],
        'shoulder': 0.72,
        'cabin': {'x': 0.72, 'z0': -1.5, 'z1': 1.05},
        'plate': {'x': 0, 'y': 0.555, 'w': 0.3, 'h': 0.15, 'text': 'DIG 1959'},
    },
    'tailLights': [[0.92, 0.98, -2.74], [-0.92, 0.98, -2.74]],
    'headLights': [[0.75, 0.615, 2.72], [-0.75, 0.615, 2.72]],
    'exhausts': [[0.62, 0.345, -2.81], [-0.62, 0.345, -2.81]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5, 'chrome': 0.7}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.62, 0.24, 1), (2.7, 0.3), (2.73, 0.4), (2.73, 0.62), (2.7, 0.72), (2.62, 0.765), (2.45, 0.778), (2.2, 0.795), (1.8, 0.82),
    (1.4, 0.845), (1.0, 0.865), (0.5, 0.871), (0.0, 0.875), (-0.5, 0.88), (-1.0, 0.885), (-1.6, 0.89), (-2.1, 0.89), (-2.4, 0.887),
    (-2.6, 0.875), (-2.7, 0.82), (-2.74, 0.62), (-2.73, 0.4), (-2.66, 0.28), (-2.54, 0.22, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.73), (0.4, 2.728), (0.7, 2.722), (0.86, 2.7), (0.95, 2.64), (0.99, 2.5), (1.0, 2.25, 1), (1.0, -2.45, 1), (0.99, -2.6),
    (0.96, -2.69), (0.88, -2.73), (0.6, -2.738), (0.3, -2.74), (0, -2.74),
]))
CAB_SIDE = Outline([
    (1.08, 0.8, 1), (1.02, 0.87, 1), (0.82, 1.09), (0.62, 1.3), (0.45, 1.365), (0.2, 1.378), (-0.2, 1.379), (-0.65, 1.375), (-0.95, 1.33),
    (-1.12, 1.215), (-1.3, 1.07), (-1.45, 0.94), (-1.52, 0.9, 1), (-1.52, 0.75, 1), (1.08, 0.75, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.1), (0.4, 1.098), (0.7, 1.08), (0.8, 1.0), (0.83, 0.85, 1), (0.83, -1.0, 1), (0.81, -1.18), (0.76, -1.33), (0.62, -1.45),
    (0.4, -1.49), (0, -1.5),
]))
# a tail fin seen from the side: rising steeply out of the rear fender (a top meeting the deck at a
# shallow angle would fray the seam), then gently to its tip over the tail; its trailing edge
# stays clear of the tail's face
FIN = Outline([
    (-1.4, 0.8, 1), (-1.47, 0.9), (-1.62, 0.93), (-2.0, 0.975), (-2.35, 1.04), (-2.58, 1.12, 1), (-2.645, 1.105), (-2.672, 1.03),
    (-2.68, 0.93), (-2.68, 0.8, 1),
])
FIN_X = 0.92

# pillarless side glass: the door glass and the quarter glass meet with no post between
DOOR_WIN = [(0.9, 0.92, 1), (0.56, 1.29, 1), (0.0, 1.31, 1), (-0.38, 1.31, 1), (-0.38, 0.93, 1)]
QUARTER_WIN = [(-0.405, 1.31, 1), (-0.88, 1.29), (-1.12, 1.12, 1), (-1.12, 0.94, 1), (-0.405, 0.93, 1)]
SIDE_WINS = (DOOR_WIN, QUARTER_WIN)
# the panoramic windshield and the wraparound back window, seen from the front and from behind:
# they follow the glasshouse round its rounded corners
WINDSHIELD = [(-0.74, 0.885, 1), (0.74, 0.885, 1), (0.77, 0.93), (0.75, 1.05), (0.7, 1.2), (0.64, 1.28, 1), (-0.64, 1.28, 1),
              (-0.7, 1.2), (-0.75, 1.05), (-0.77, 0.93)]
BACKLIGHT = [(-0.68, 0.935, 1), (0.68, 0.935, 1), (0.71, 0.99), (0.69, 1.12), (0.64, 1.25), (0.58, 1.315, 1), (-0.58, 1.315, 1),
             (-0.64, 1.25), (-0.69, 1.12), (-0.71, 0.99)]
HEADS = (0.66, 0.84)
HEAD_Y = 0.615


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Slab sides tucked in at the sills, a crisp crease along the beltline."""
    if y < 0.32:
        return 0.95 + 0.05 * smoothstep(0.22, 0.32, y)
    return 1.0 - ramp(y - 0.84, 0.005) * 0.3


def tilt(y):
    return max(0.0, y - 0.9) * 0.35


def run(outline, cut, front=True):
    """The stretch of a plan outline ahead of z = cut (or behind it), in order round the end."""
    P = outline.poly
    inside = [(p[1] > cut) if front else (p[1] < cut) for p in P]
    start = next(i for i in range(len(P)) if inside[i] and not inside[i - 1])
    out = []
    i = start
    while inside[i % len(P)]:
        out.append(P[i % len(P)])
        i += 1
    return out


def bar_section(n=6):
    """A rounded-box section (unit half extents) for the bumpers."""
    pts = []
    for k in range(4 * n):
        t = 2 * math.pi * k / (4 * n)
        c, s = math.cos(t), math.sin(t)
        pts.append((math.copysign(abs(c) ** 0.45, c), math.copysign(abs(s) ** 0.45, s)))
    return pts


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = body(coll, n)
    arches(coll, n, skin)
    surf = road.Surface([skin])
    glass(coll, n, surf, lod)
    chrome(coll, n, surf, lod)
    bumpers(coll, n, lod)
    lamps(coll, n, surf, lod)
    openings(coll, n, skin, surf, lod)
    if lod != 'lod1':
        hollow(coll, n, skin)
    zones(skin)
    if lod != 'lod1':
        cabin_inside(coll, n)


def body(coll, n):
    """The body and hardtop lofted from the drawings, the tail fins merged in."""
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=lambda z: (0.845, 0.32), r_top=0.028, r_bot=0.04)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.05))
    for s in (1, -1):
        geo.boolean(skin, fin(f'fin_{s}', s, coll, n), op='UNION', sharp=50.0)
    return skin


def fin(name, s, coll, n):
    """A tail fin: a blade 9 cm thick at its root thinning to 3 cm at its top, its outer face 2 cm
    in from the body side; the top 16 mm of it chrome (a fixed row of every section)."""
    rows = n(7, 3)
    rings, roles = [], []
    z0, z1 = FIN.umin + 0.003, FIN.umax - 0.003
    stations = body_like(z0, z1, n(44, 12))
    for z in stations:
        span = FIN.span_v(z)
        if not span:
            continue
        yb, yt = span
        yc = max(yb + 0.004, yt - 0.016)
        hw = lambda y: 0.045 - 0.029 * smoothstep(0.88, 1.12, y)
        ys = [yb + (yc - yb) * i / rows for i in range(rows + 1)]
        outer = [(FIN_X + hw(y), y) for y in ys]
        tip = [(FIN_X + hw(yt) * 0.75, yt - 0.004), (FIN_X, yt), (FIN_X - hw(yt) * 0.75, yt - 0.004)]
        inner = [(FIN_X - hw(y), y) for y in reversed(ys)]
        sec2 = outer + tip + inner
        rings.append([(s * x, y, z) for x, y in sec2])
    count = len(rings[0])
    # the faces between ring points k and k+1: chrome from the chrome row over the tip to its twin
    band = ['chrome' if rows <= k < rows + 4 else 'paint' for k in range(count)]
    faces, face_roles = [], []
    verts = [p for r in rings for p in r]
    for j in range(len(rings) - 1):
        for k in range(count):
            a, b = j * count + k, j * count + (k + 1) % count
            faces.append((a, b, b + count, a + count))
            face_roles.append(band[k] if k < count - 1 else 'paint')
    for cap, base in ((rings[0], 0), (rings[-1], (len(rings) - 1) * count)):
        c = tuple(sum(p[i] for p in cap) / count for i in range(3))
        verts.append(c)
        ci = len(verts) - 1
        for k in range(count):
            faces.append((base + k, base + (k + 1) % count, ci))
            face_roles.append('paint')
    return geo.make_mesh(name, verts, faces, coll, 'paint', face_roles=face_roles, sharp=50.0)


def body_like(z0, z1, count):
    return road.body_stations(z0, z1, count, ends=0.3)


def arches(coll, n, skin):
    """Open front arches; at the back a skirt hides the top of each wheel: the outer 6 cm of the
    body side stays closed above the axle."""
    road.wheel_arches(coll, n, skin, {'front': WHEELS['front']}, gap=GAP)
    w = WHEELS['rear']
    x0 = w['x'] - w['w'] / 2 - 0.04
    for s in (1, -1):
        cut = geo.cylinder(f'rear_well_{s}', (s * x0, w['y'], w['z']), (s * 0.94, w['y'], w['z']), w['r'] + GAP, coll, 'trim', sides=n(64, 20))
        geo.boolean(skin, cut, sharp=50.0)
        low = geo.cylinder(f'rear_open_{s}', (s * 0.9, w['y'], w['z']), (s * 1.6, w['y'], w['z']), w['r'] + GAP, coll, 'trim', sides=n(64, 20))
        geo.boolean(low, geo.box(f'rear_open_clip_{s}', (0, w['y'] - 0.5, w['z']), (2.0, 0.5, 1.0), coll), op='INTERSECT', sharp=50.0)
        geo.boolean(skin, low, sharp=50.0)


def glass(coll, n, surf, lod):
    g = 0.05  # (the full model's; it coarsens with the level)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        for i, win in enumerate(SIDE_WINS):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'chrome', width=0.014)
    road.panel('windshield', surf, 'front', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('backlight', surf, 'rear', BACKLIGHT, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'front', WINDSHIELD, coll)
        road.ring_panel('windshield_frame', surf, 'front', WINDSHIELD, coll, 'chrome', width=0.014)
        road.ring_panel('backlight_frame', surf, 'rear', BACKLIGHT, coll, 'chrome', width=0.014)


def chrome(coll, n, surf, lod):
    """The spears, sills, arch trims and skirt strips, the deck lid strip, the hood's jet, the
    mirrors."""
    sides = n(8, 4)
    for view in ('left', 'right'):
        road.bead(f'spear_{view}', surf, view, [(2.3, 0.63), (-1.4, 0.63)], coll, 'chrome', radius=0.012, lift=-0.004, per=1, sides=sides)
        road.ribbon(f'sill_{view}', surf, view, [(1.1, 0.29), (-1.18, 0.29)], coll, 'chrome', width=0.04, depth=0.002, thick=0.007, per=1)
        w = WHEELS['front']
        arc = [(w['z'] + 0.42 * math.cos(a), w['y'] + 0.42 * math.sin(a)) for a in (math.pi * (-0.06 + 1.12 * i / 24) for i in range(25))]
        road.ribbon(f'arch_trim_{view}', surf, view, arc, coll, 'chrome', width=0.022, depth=0.003, thick=0.009, per=1)
        wr = WHEELS['rear']
        road.ribbon(f'skirt_strip_{view}', surf, view, [(wr['z'] + 0.39, 0.375), (wr['z'] - 0.39, 0.375)], coll, 'chrome', width=0.022,
                    depth=0.003, thick=0.008, per=1)
    # the deck lid's strip across the tail
    road.bead('deck_strip', surf, 'rear', [(-0.86, 0.8), (0.86, 0.8)], coll, 'chrome', radius=0.011, lift=-0.004, per=1, sides=sides)
    # a chrome jet on the nose of the hood: a fuselage and swept wings
    h = surf.project('top', 0.0, 2.48)
    if h:
        y = h[0][1]
        geo.ellipsoid('jet', (0, y + 0.018, 2.5), (0.02, 0.022, 0.12), coll, 'chrome', rings=n(10, 6), segs=n(14, 8))
        geo.plate('jet_wings', [(-0.06, 2.47, 1), (0.06, 2.47, 1), (0.03, 2.41, 1), (-0.03, 2.41, 1)], coll, 'chrome', plane='y', at=y + 0.012,
                  thick=0.006, per=1)
        geo.plate('jet_fin', [(2.36, y + 0.01, 1), (2.42, y + 0.01, 1), (2.37, y + 0.06, 1)], coll, 'chrome', plane='x', at=0.0, thick=0.006,
                  per=1)
    # chrome mirrors on the doors
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.88, 0.89, 0.86), (0.95, 0.95, 0.85), (0.045, 0.032, 0.05), glass_role='glass', body_role='chrome',
                         arm_role='chrome', r=0.026)
    # a chrome brow over each pair of headlamps
    for s in (1, -1):
        road.ribbon(f'brow_{s}', surf, 'front', [(s * 0.57, 0.71), (s * 0.93, 0.71)], coll, 'chrome', width=0.022, depth=0.004, thick=0.024,
                    per=1)
    if lod == 'lod1':
        return
    # wipers parked along the foot of the windshield, chrome arms
    for x0, x1 in ((0.62, 0.02), (0.05, -0.55)):
        road.bead(f'wiper_arm_{x0}', surf, 'front', [(x0, 0.895), (x1, 0.912)], coll, 'chrome', radius=0.005, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'front', [(x0 - 0.06, 0.9), (x1, 0.915)], coll, 'trim', radius=0.007, lift=0.006, per=1, sides=n(6, 4))


def bumpers(coll, n, lod):
    """Massive chrome bumpers swept round the ends, 6 cm proud of the body; two bullets on the front
    one, parking lamps in it, the exhaust ports in the ends of the rear one."""
    plan = road.offset_outline(PLAN, 0.02)
    secn = bar_section(n(6, 3))
    for name, cut, front, y, hy in (('bumper_front', 2.38, True, 0.33, 0.075), ('bumper_rear', -2.38, False, 0.35, 0.07)):
        pts = run(plan, cut, front)
        step = max(1, len(pts) // n(70, 24))
        path = [(x, y, z) for x, z in pts[::step]]
        if path[-1] != (pts[-1][0], y, pts[-1][1]):
            path.append((pts[-1][0], y, pts[-1][1]))
        bar = geo.tube(name, path, coll, radius=(hy, 0.04), role='chrome', section=secn, sharp=60.0)
        bs = road.Surface([bar])
        if front:
            for s in (1, -1):
                road.pocket(bar, bs, 'front', sym(rrect(0.76, 0.33, 0.075, 0.018, 0.016), s), 0.012, coll, 'amber', 'chrome', grid=0.012)
        else:
            for s in (1, -1):
                road.pocket(bar, bs, 'rear', sym(rrect(0.62, 0.345, 0.075, 0.032, 0.03), s), 0.05, coll, 'exhaust', 'chrome', grid=0.012)
    for s in (1, -1):
        geo.ellipsoid(f'bullet_{s}', (s * 0.42, 0.45, 2.76), (0.065, 0.065, 0.13), coll, 'chrome', rings=n(14, 6), segs=n(20, 8))


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        for xc in HEADS:
            c = (s * xc, HEAD_Y)
            road.bead(f'head_ring_{s}{xc}', surf, 'front', circle(*c, 0.069, n(28, 12)), coll, 'chrome', radius=0.009, lift=0.002, per=1,
                      sides=n(8, 4), closed=True)
            road.disc(f'head_lens_{s}{xc}', surf, 'front', c, 0.046, coll, 'lens', depth=0.026, thick=0.006, sides=n(24, 12))
    # twin bullet tail lamps leaving each fin's trailing edge in chrome rings, a bright core in each
    for s in (1, -1):
        for yc in (0.935, 1.025):
            x = s * FIN_X
            prof = [(0.0, -2.75), (0.012, -2.748), (0.024, -2.738), (0.031, -2.72), (0.033, -2.7), (0.033, -2.64)]
            road.lathe_z(f'tail_bullet_{s}{yc}', prof, (x, yc), coll, ['tailglow', 'tail', 'tail', 'tail', 'tail'], sides=n(20, 10))
            ring = [(x + 0.039 * math.cos(a), yc + 0.039 * math.sin(a), -2.685) for a in (2 * math.pi * k / n(24, 10) for k in range(n(24, 10)))]
            geo.tube(f'tail_ring_{s}{yc}', ring + ring[:1], coll, radius=0.007, role='chrome', sides=n(8, 4), caps=(False, False))
    # the tail grille: three chrome bars stopping short of the plate and the lamps, the plate standing
    # in it, a reversing lamp either side
    for yb in (0.515, 0.56, 0.605):
        for a, b in ((-0.82, -0.62), (-0.42, -0.2), (0.2, 0.42), (0.62, 0.82)):
            road.bead(f'tail_bar_{yb}{a}', surf, 'rear', [(a, yb), (b, yb)], coll, 'chrome', radius=0.008, lift=-0.016, per=1, sides=n(8, 4))
    road.panel('plate', surf, 'rear', rrect(0, 0.555, 0.165, 0.08, 0.012), coll, 'paint', depth=0.01, thick=0.03, grid=0.03)
    for s in (1, -1):
        road.panel(f'reverse_{s}', surf, 'rear', sym(rrect(0.52, 0.56, 0.09, 0.035, 0.012), s), coll, 'reverse', depth=0.012, thick=0.028,
                   grid=0.02)
    road.bead('tail_grille_frame', surf, 'rear', rrect(0, 0.56, 0.846, 0.096, 0.028, n(4, 2)), coll, 'chrome', radius=0.006, lift=0.001,
              per=2, sides=n(8, 4), closed=True)
    # the front grille: round chrome bars over the mesh, a chrome frame
    for yb in (0.49, 0.545, 0.6):
        road.bead(f'grille_bar_{yb}', surf, 'front', [(-0.545, yb), (0.545, yb)], coll, 'chrome', radius=0.011, lift=-0.018, per=1, sides=n(10, 6))
    if lod != 'lod1':
        for i in range(-4, 5):
            road.bead(f'grille_post_{i}', surf, 'front', [(i * 0.12, 0.455), (i * 0.12, 0.635)], coll, 'chrome', radius=0.008, lift=-0.022, per=1,
                      sides=n(8, 4))
    road.bead('grille_frame', surf, 'front', rrect(0, 0.545, 0.566, 0.106, 0.034, n(4, 2)), coll, 'chrome', radius=0.007, lift=0.001, per=2,
              sides=n(8, 4), closed=True)


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', 'chrome', grid=0.03)
        road.pocket(skin, surf, 'front', WINDSHIELD, 0.045, coll, 'trim', 'chrome', grid=0.03)
        road.pocket(skin, surf, 'rear', BACKLIGHT, 0.045, coll, 'trim', 'chrome', grid=0.03)
    road.pocket(skin, surf, 'front', rrect(0, 0.545, 0.56, 0.1, 0.03), 0.05, coll, 'grille', 'chrome', grid=0.02)
    for s in (1, -1):
        for xc in HEADS:
            road.pocket(skin, surf, 'front', circle(s * xc, HEAD_Y, 0.062, n(28, 14)), 0.035, coll, 'head', 'chrome', grid=0.012)
    road.pocket(skin, surf, 'rear', rrect(0, 0.56, 0.84, 0.09, 0.025), 0.04, coll, 'grille', 'chrome', grid=0.02)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors, a narrower one between the rear wheel wells,
    the hardtop's inside."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.6, -1.32), (0.6, 0.33, 0.16), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.555, -0.09), (0.88, 0.295, 1.05)), z_range=(-1.47, 0.98), tilt=tilt, wall=0.025,
                floor=0.7)


def zones(skin):
    """The underbody in black."""
    def fn(x, y, z, role, nx, ny, nz):
        return 'trim' if role == 'paint' and y < 0.235 else None

    road.zones(skin, fn, ys=(0.235,))


def cabin_inside(coll, n):
    """Bench seats front and back, a dash with a chrome strip, a big thin steering wheel with a
    chrome horn ring."""
    segs = n(3, 1)
    for name, z, back_z, y in (('front', 0.08, -0.2, 0.37), ('rear', -0.78, -1.05, 0.38)):
        geo.rbox(f'bench_{name}', (0, y, z), (0.74 if name == 'front' else 0.8, 0.07, 0.25), coll, 'interior', r=0.05, segs=segs)
        back = geo.rbox(f'bench_back_{name}', (0, 0, 0), (0.74 if name == 'front' else 0.8, 0.27, 0.065), coll, 'interior', r=0.05, segs=segs)
        road._place(back, (0, y + 0.32, back_z), 0.24)
    geo.rbox('dash', (0, 0.8, 0.8), (0.86, 0.08, 0.16), coll, 'interior', r=0.05, segs=segs)
    geo.rbox('dash_strip', (0, 0.815, 0.645), (0.82, 0.012, 0.006), coll, 'chrome', r=0.005, segs=1)
    geo.rbox('gauge_pod', (0.4, 0.875, 0.72), (0.18, 0.035, 0.07), coll, 'trim', r=0.03, segs=segs)
    wx, wy, wz, tilt_ = 0.4, 0.86, 0.5, 0.42
    for r, rad, tag in ((0.2, 0.012, 'rim'), (0.12, 0.005, 'horn')):
        ring = []
        for k in range(n(32, 10)):
            a = 2 * math.pi * k / n(32, 10)
            u, v = r * math.cos(a), r * math.sin(a)
            ring.append((wx + u, wy + v * math.cos(tilt_), wz + v * math.sin(tilt_)))
        geo.tube(f'steering_{tag}', ring + ring[:1], coll, radius=rad, role='trim' if tag == 'rim' else 'chrome', sides=n(8, 4), caps=(False, False))
    geo.rbox('steering_hub', (wx, wy, wz), (0.05, 0.05, 0.02), coll, 'chrome', r=0.02, segs=segs)
    geo.cylinder('steering_column', (wx, wy - 0.02, wz + 0.04), (wx, 0.79, 0.68), 0.025, coll, 'trim', sides=n(10, 4))
