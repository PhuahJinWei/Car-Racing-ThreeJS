"""SLEEPER: a 90s European fast estate that looks like the family car. A long roof over a near-upright
tailgate, black roof rails on feet and a lip spoiler, gently flared arches, wide flush headlamps with
two chrome bowls each either side of a slim chrome-ringed grille with two bars and a blank badge,
amber lamps round the corners, a low intake with fog lamps, side repeaters, black rub strips right
round the car at bumper height, black window frames and pillars, a fuel flap, very tall tail lamps
(a red, amber and clear lamp in each rear corner and a red lamp up each back pillar) either side of a
smoked panel, the plate in a recess, a rear wiper, a cargo cover behind the rear seats and twin oval
exhausts. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/sleeper.js, retired: see the git
history), re-spaced (see views.densify). The tailgate stands on the body's top a couple of
centimetres in from its back edge (a clean, steep join: the factory's blend of the two was a shallow
crossing).
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.36, 'y': 0.32, 'x': 0.76, 'r': 0.32, 'w': 0.235, 'rim': 0.22},
    'rear': {'z': -1.34, 'y': 0.32, 'x': 0.765, 'r': 0.32, 'w': 0.245, 'rim': 0.22},
}
GAP = 0.035

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [
            [[1.0, 0.86], [1.02, 0.6], [0.98, 0.24], [-0.32, 0.24], [-0.33, 0.6], [-0.32, 0.9]],
            [[-0.32, 0.24], [-1.06, 0.24], [-1.08, 0.6], [-1.08, 0.92]],
        ],
        'top': [[[-0.8, 1.14], [0.8, 1.14], [0.88, 1.7], [0.84, 2.3], [-0.84, 2.3], [-0.88, 1.7], [-0.8, 1.14]]],
        # the tailgate's lower part, over the rub strip, between the corner lamps
        'rear': [[[-0.69, 0.92], [-0.7, 0.49], [0.7, 0.49], [0.69, 0.92]]],
    },
    # `plate`: the licence plate painted into its recess on the tailgate (rear view, metres)
    'livery': {
        'door': [0.3, 0.6],
        'shoulder': 0.78,
        'cabin': {'x': 0.72, 'z0': -2.3, 'z1': 1.08},
        'plate': {'x': 0, 'y': 0.575, 'w': 0.3, 'h': 0.15, 'text': 'ZZ 315'},
    },
    'tailLights': [[0.79, 0.85, -2.39], [-0.79, 0.85, -2.39]],
    'headLights': [[0.53, 0.6, 2.36], [-0.53, 0.6, 2.36]],
    'exhausts': [[0.53, 0.225, -2.45], [-0.53, 0.225, -2.45]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5, 'chrome': 0.7}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.3, 0.2, 1), (2.35, 0.25), (2.37, 0.32), (2.37, 0.44), (2.37, 0.56), (2.35, 0.64), (2.3, 0.69), (2.1, 0.713), (1.9, 0.735), (1.6, 0.763),
    (1.3, 0.79), (1.1, 0.805), (0.55, 0.842), (0.0, 0.875), (-0.5, 0.888), (-1.0, 0.902), (-1.5, 0.915), (-1.85, 0.926), (-2.2, 0.933),
    (-2.345, 0.933, 1), (-2.38, 0.88), (-2.395, 0.7), (-2.4, 0.5), (-2.38, 0.3), (-2.3, 0.21), (-2.2, 0.2, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.37), (0.31, 2.368), (0.62, 2.36), (0.8, 2.31), (0.88, 2.2), (0.905, 1.9), (0.915, 1.55), (0.915, 1.15), (0.9, 0.8), (0.897, 0.05),
    (0.895, -0.7), (0.915, -1.1), (0.925, -1.5), (0.915, -1.9), (0.885, -2.26), (0.8, -2.37), (0.4, -2.393), (0, -2.4),
]))
# (the tailgate stands on the body's top 2.5 cm in from its back edge)
CAB_SIDE = Outline([
    (1.12, 0.78, 1), (1.06, 0.86, 1), (0.75, 1.11), (0.45, 1.34), (0.28, 1.4), (0.0, 1.42), (-0.5, 1.42), (-1.0, 1.42), (-1.5, 1.42), (-2.0, 1.42),
    (-2.18, 1.39), (-2.255, 1.2), (-2.32, 0.93, 1), (-2.32, 0.75, 1), (1.12, 0.73, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.14), (0.35, 1.138), (0.7, 1.13), (0.8, 1.08), (0.83, 0.98), (0.833, 0.75), (0.835, 0.5, 1), (0.835, -2.0, 1), (0.815, -2.2),
    (0.72, -2.33), (0.4, -2.345), (0, -2.35),
]))

# (the front door glass starts well behind the A-pillar's rounded edge, see kaido.py; the tops stay
# 7 cm under the roof, clear of its fillet)
FRONT_WIN = road.rounded([(0.84, 0.93), (0.24, 1.35), (-0.28, 1.35), (-0.28, 0.935)], [0, 0.08, 0, 0])
REAR_WIN = [(-0.36, 1.35, 1), (-1.04, 1.35, 1), (-1.04, 0.95, 1), (-0.36, 0.936, 1)]
CARGO_WIN = road.rounded([(-1.12, 1.35), (-2.04, 1.35), (-2.04, 0.97), (-1.12, 0.952)], [0, 0.07, 0, 0])
SIDE_WINS = (FRONT_WIN, REAR_WIN, CARGO_WIN)
# (kept inside the glasshouse's fillets; straight edges, round corners)
WINDSHIELD = road.rounded([(-0.7, 1.04), (0.7, 1.04), (0.705, 0.75), (0.62, 0.44), (-0.62, 0.44), (-0.705, 0.75)], [0.05, 0.05, 0, 0.05, 0.05, 0])
TAILGATE = road.rounded([(-0.66, 0.97), (0.66, 0.97), (0.56, 1.35), (-0.56, 1.35)], 0.04)
# the lip spoiler: the roof carried on back over the tailgate glass (its underside crosses the roof's
# rounded back edge where that falls away steeply)
SPOILER_SIDE = Outline([(-1.98, 1.4, 1), (-1.98, 1.424), (-2.06, 1.431), (-2.16, 1.433), (-2.25, 1.43), (-2.3, 1.42), (-2.305, 1.408),
                        (-2.27, 1.398, 1), (-2.16, 1.386), (-2.05, 1.37, 1)])
SPOILER_PLAN = Outline(road.rounded([(-0.64, -1.97), (0.64, -1.97), (0.64, -2.31), (-0.64, -2.31)], [0.02, 0.02, 0.04, 0.04], n=4))
HEAD_Y = 0.6
STRIP_Y = 0.45
# the corner lamps: red over amber over a clear reverse lamp (rear view)
LAMP = road.rounded([(0.715, 0.64), (0.865, 0.64), (0.865, 0.89), (0.715, 0.89)], 0.02)
LAMP_AMBER, LAMP_RED = 0.745, 0.81


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Slab sides tucked in at the sills, a soft crease along the beltline."""
    if y < 0.3:
        return 0.955 + 0.045 * smoothstep(0.2, 0.3, y)
    return 1.0 - ramp(y - 0.86, 0.006) * 0.3


def keys(z):
    """The side split at the beltline crease and the sill's tuck, every section alike (kept under
    the hood's rounded edge toward the nose, over the sill's toward the ends)."""
    yb, yt = SIDE.span_v(z) or (0.2, 0.9)
    return (min(0.86, yt - 0.055), max(0.3, yb + 0.05))


def tilt(y):
    return max(0.0, y - 0.9) * 0.3


def box_section(n=4, p=0.45):
    pts = []
    for k in range(4 * n):
        t = 2 * math.pi * k / (4 * n)
        c, s = math.cos(t), math.sin(t)
        pts.append((math.copysign(abs(c) ** p, c), math.copysign(abs(s) ** p, s)))
    return pts


def stretch(P, keep):
    """The run of a closed polyline's points where keep(x, z) holds (one run), in order."""
    inside = [keep(*p) for p in P]
    start = next(i for i in range(len(P)) if inside[i] and not inside[i - 1])
    out = []
    i = start
    while inside[i % len(P)] and len(out) < len(P):
        out.append(P[i % len(P)])
        i += 1
    return out


def thin(pts, k):
    """Every k-th point, keeping the last."""
    out = pts[::k]
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def edge_x(surf, view, y, x0, x1, step=0.004, facing=0.3):
    """How far out the skin still faces the view at height y (front or rear view)."""
    last = None
    x = x0
    while x < x1:
        if surf.project(view, x, y, facing=facing) is None:
            break
        last = x
        x += step
    return last if last is not None else x0


def pillar_lamp(surf, y0=0.97, y1=1.33, width=0.075, inset=0.025, rows=8):
    """The red lamp up each back pillar (rear view): its outer edge follows the pillar's rounded
    corner in from where it turns away (the glasshouse leans in as it rises), round-cornered; and
    the path up its middle."""
    ys = [y0 + (y1 - y0) * i / rows for i in range(rows + 1)]
    outer = [(edge_x(surf, 'rear', y, 0.45, 0.95) - inset, y) for y in ys]
    inner = [(x - width, y) for x, y in reversed(outer)]
    pts = outer + inner
    r = [0.0] * len(pts)
    for i in (0, len(outer) - 1, len(outer), len(pts) - 1):
        r[i] = 0.015
    mid = [(x - width / 2, y) for x, y in outer if y0 + 0.03 < y < y1 - 0.03]
    return road.rounded(pts, r, n=3), mid


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    counts = (n(12), n(6), (n(8), n(8), n(6)), n(5), n(7))
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=keys, r_top=0.045, r_bot=0.04, stations=100, counts=counts)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.045, stations=70,
                                            counts=(n(9), n(5), (n(10),), n(3), n(5))))
    spoiler = road.view_body('spoiler', coll, n, SPOILER_SIDE, SPOILER_PLAN, r_top=0.006, r_bot=0.004, stations=40,
                             counts=(n(10), n(4), (n(4),), n(2), n(6)))
    geo.boolean(skin, spoiler, op='UNION', sharp=50.0)
    road.wheel_arches(coll, n, skin, WHEELS, gap=GAP)
    surf = road.Surface([skin])
    upper, upper_mid = pillar_lamp(surf)
    glass(coll, n, surf, lod)
    lamps(coll, n, surf, lod, upper, upper_mid)
    parts(coll, n, surf, lod)
    openings(coll, n, skin, surf, lod)
    if lod != 'lod1':
        hollow(coll, n, skin)
    zones(skin, lod)
    if lod != 'lod1':
        cabin_inside(coll, n)


def glass(coll, n, surf, lod):
    g = 0.05  # (the full model's; it coarsens with the level)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        for i, win in enumerate(SIDE_WINS):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'trim', width=0.013, grid=0.04)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('tailgate_glass', surf, 'rear', TAILGATE, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, grid=0.04)
        road.frit('tailgate_frit', surf, 'rear', TAILGATE, coll, width=0.03, grid=0.04)


def lamps(coll, n, surf, lod, upper, upper_mid):
    for s in (1, -1):
        # the headlamps: a lens in each chrome bowl
        for u, r in ((0.41, 0.034), (0.62, 0.038)):
            road.disc(f'head_lens_{s}{u}', surf, 'front', (s * u, HEAD_Y), r, coll, 'lens', depth=0.034, thick=0.006, sides=n(24, 12))
        road.disc(f'fog_lens_{s}', surf, 'front', (s * 0.64, 0.33), 0.03, coll, 'lens', depth=0.012, thick=0.005, sides=n(20, 10))
        # the corner lamps: clear and amber inserts on the red lamp's floor, black dividers, a bright bar
        road.panel(f'lamp_reverse_{s}', surf, 'rear', sym([(0.715, 0.64, 1), (0.865, 0.64, 1), (0.865, LAMP_AMBER, 1), (0.715, LAMP_AMBER, 1)], s),
                   coll, 'reverse', depth=0.008, thick=0.002, grid=0.02)
        road.panel(f'lamp_amber_{s}', surf, 'rear', sym([(0.715, LAMP_AMBER, 1), (0.865, LAMP_AMBER, 1), (0.865, LAMP_RED, 1), (0.715, LAMP_RED, 1)], s),
                   coll, 'indicator', depth=0.008, thick=0.002, grid=0.02)
        for yd in (LAMP_AMBER, LAMP_RED):
            road.ribbon(f'lamp_divider_{s}{yd}', surf, 'rear', [(s * 0.715, yd), (s * 0.865, yd)], coll, 'trim', width=0.006, depth=0.009,
                        thick=0.004, per=1)
        road.ribbon(f'lamp_glow_{s}', surf, 'rear', [(s * 0.735, 0.85), (s * 0.845, 0.85)], coll, 'tailglow', width=0.026, depth=0.008, thick=0.003,
                    per=1)
        # the pillar lamp: a lens laid on the pillar's rounded corner in a black border (a pocket cut
        # along the view into a surface that steep is a skewed slot), a bright bar up its middle
        road.glass_panel(f'pillar_lamp_{s}', surf, 'rear', sym(upper, s), coll, 'tail', border=0.008 if lod == 'lod0' else 0, grid=0.02, facing=0.15)
        road.ribbon(f'pillar_glow_{s}', surf, 'rear', [(s * x, y) for x, y in upper_mid], coll, 'tailglow', width=0.02, depth=-0.0045, thick=0.003,
                    per=1, facing=0.15)
    # the grille: a chrome surround, two chrome bars, a blank badge on them
    road.ring_panel('grille_surround', surf, 'front', rrect(0, HEAD_Y, 0.26, 0.05, 0.02), coll, 'chrome', width=0.008)
    for yb in (0.585, 0.615):
        road.bead(f'grille_bar_{yb}', surf, 'front', [(-0.245, yb), (0.245, yb)], coll, 'chrome', radius=0.0065, lift=-0.012, per=1, sides=n(8, 4))
    road.panel('badge', surf, 'front', rrect(0, HEAD_Y, 0.042, 0.022, 0.01), coll, 'chrome', depth=-0.002, thick=0.026, grid=0.01)
    # the tailgate's chrome handle on the smoked panel
    road.panel('tailgate_handle', surf, 'rear', rrect(0, 0.74, 0.085, 0.013, 0.006), coll, 'chrome', depth=-0.003, thick=0.012, grid=0.01)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    strips(coll, n)
    rails(coll, n, surf)
    # black mirrors on the door tops, twin oval exhausts under the bumper's ends
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.8, 0.93, 0.87), (0.95, 0.985, 0.86), (0.07, 0.048, 0.038), glass_role='chrome', body_role='trim',
                         arm_role='trim', r=0.022)
        road.exhaust_tip(coll, n, (s * 0.53, 0.225, -2.405), 0.036, 0.16, f'{s}', oval=1.65, depth=0.06)
    if lod == 'lod1':
        return
    # door pulls, wipers, the rear wiper on the tailgate glass
    for view in ('left', 'right'):
        for zc in (0.22, -0.66):
            road.ribbon(f'pull_{view}{zc}', surf, view, [(zc + 0.055, 0.8), (zc - 0.055, 0.8)], coll, 'trim', width=0.018, depth=0.012, thick=0.017,
                        per=1)
    for x0, x1 in ((0.46, -0.06), (-0.1, -0.62)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 1.02), (x1, 0.995)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 1.016), (x1, 0.992)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))
    road.bead('rear_wiper_arm', surf, 'rear', [(0.0, 0.995), (0.36, 1.25)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
    road.bead('rear_wiper_blade', surf, 'rear', [(0.05, 1.04), (0.4, 1.285)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))
    hit = surf.project('rear', 0.0, 0.99)
    if hit:
        p, nr = hit
        geo.rbox('rear_wiper_pivot', road._add(p, nr, 0.006), (0.022, 0.016, 0.012), coll, 'trim', r=0.008, segs=segs)


def strips(coll, n):
    """Black rub strips right round the car at bumper height, in pieces between the wheel openings
    (each cut to its arches)."""
    P = road.offset_outline(PLAN, 0.003).poly
    secn = box_section(n(3, 2))
    pieces = (
        ('nose', lambda x, z: z > 1.55, [('front', 1), ('front', -1)]),
        ('side_l', lambda x, z: x > 0 and -1.15 < z < 1.15, [('front', 1), ('rear', 1)]),
        ('side_r', lambda x, z: x < 0 and -1.15 < z < 1.15, [('front', -1), ('rear', -1)]),
        ('tail', lambda x, z: z < -1.55, [('rear', 1), ('rear', -1)]),
    )
    for name, keep, arches in pieces:
        pts = stretch(P, keep)
        pts = thin(pts, max(1, len(pts) // n(50, 14)))
        strip = geo.tube(f'strip_{name}', [(x, STRIP_Y, z) for x, z in pts], coll, radius=(0.02, 0.009), role='trim', section=secn, sharp=60.0)
        for wk, s in arches:
            w = WHEELS[wk]
            cut = geo.cylinder(f'strip_arch_{name}_{wk}_{s}', (s * 0.55, w['y'], w['z']), (s * 1.6, w['y'], w['z']), w['r'] + GAP, coll, 'trim',
                               sides=n(64, 20))
            geo.boolean(strip, cut, sharp=60.0)


def rails(coll, n, surf):
    """Black roof rails along the roof's edges: each end dips into the roof, a foot in the middle."""
    secn = box_section(n(3, 2))
    for s in (1, -1):
        pts = []
        for z, h in ((0.33, -0.012), (0.27, 0.025), (0.18, 0.05), (0.0, 0.055), (-0.5, 0.055), (-1.0, 0.055), (-1.5, 0.055), (-1.78, 0.052),
                     (-1.88, 0.03), (-1.94, -0.012)):
            hit = surf.project('top', s * 0.6, z)
            pts.append((s * 0.6, (hit[0][1] if hit else 1.4) + h, z))
        geo.tube(f'rail_{s}', pts, coll, radius=(0.014, 0.011), role='trim', section=secn, sharp=60.0, smooth_path=n(4, 2))
        hit = surf.project('top', s * 0.6, -0.9)
        y0 = hit[0][1] if hit else 1.4
        geo.rbox(f'rail_foot_{s}', (s * 0.6, y0 + 0.025, -0.9), (0.014, 0.03, 0.04), coll, 'trim', r=0.01, segs=n(2, 1))


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'rear', TAILGATE, 0.045, coll, 'trim', grid=0.03)
    road.pocket(skin, surf, 'front', rrect(0, HEAD_Y, 0.26, 0.05, 0.02), 0.035, coll, 'grille', 'chrome', grid=0.012)
    for s in (1, -1):
        # the headlamps: a smoked chrome housing, a deeper chrome bowl round each bulb
        road.pocket(skin, surf, 'front', sym(rrect(0.53, HEAD_Y, 0.23, 0.058, 0.016), s), 0.03, coll, 'head', 'chrome', grid=0.012)
        if lod != 'lod1':
            for u, r in ((0.41, 0.046), (0.62, 0.05)):
                road.pocket(skin, surf, 'front', circle(s * u, HEAD_Y, r, n(28, 14)), 0.048, coll, 'chrome', grid=0.012)
        road.pocket(skin, surf, 'front', sym(rrect(0.825, HEAD_Y, 0.045, 0.05, 0.015), s), 0.012, coll, 'amber', 'trim', grid=0.01, facing=0.2)
        road.pocket(skin, surf, 'front', circle(s * 0.64, 0.33, 0.042, n(20, 10)), 0.02, coll, 'head', 'trim', grid=0.01)
        # the corner lamps
        road.pocket(skin, surf, 'rear', sym(LAMP, s), 0.012, coll, 'tail', 'trim', grid=0.012, facing=0.2)
    road.pocket(skin, surf, 'front', rrect(0, 0.32, 0.42, 0.045, 0.025), 0.04, coll, 'grille', 'trim', grid=0.015)
    # the smoked panel between the corner lamps, the plate recess (the livery paints the plate)
    road.pocket(skin, surf, 'rear', rrect(0, 0.74, 0.69, 0.06, 0.012), 0.008, coll, 'glass', 'trim', grid=0.015)
    road.pocket(skin, surf, 'rear', rrect(0, 0.575, 0.155, 0.075, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)
    for view in ('left', 'right'):
        if lod != 'lod1':
            road.pocket(skin, surf, view, rrect(1.88, 0.68, 0.026, 0.011, 0.01), 0.005, coll, 'indicator', 'trim', grid=0.01)
            for zc in (0.22, -0.66):
                road.pocket(skin, surf, view, rrect(zc, 0.8, 0.07, 0.02, 0.012), 0.012, coll, 'trim', grid=0.01)
        else:
            road.panel(f'repeater_{view}', surf, view, rrect(1.88, 0.68, 0.026, 0.011, 0.01), coll, 'indicator', depth=-0.002, thick=0.004, grid=0.02)
    if lod != 'lod1':
        road.pocket(skin, surf, 'right', rrect(-1.95, 0.74, 0.06, 0.055, 0.02), 0.0025, coll, 'paint', 'trim', grid=0.015)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors, the load floor's well between the rear wheel
    wells, the glasshouse's inside."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.55, -1.62), (0.56, 0.3, 0.66), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.53, 0.02), (0.8, 0.28, 0.95)), z_range=(-2.3, 1.08), tilt=tilt, wall=0.025,
                floor=0.75)


def zones(skin, lod):
    """The underbody, the chin and the valance under the rear bumper in black; the black pillars."""
    pillars = lod != 'lod1'

    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        if y < 0.215:
            return 'trim'
        if z > 2.2 and y < 0.24:
            return 'trim'
        if z < -2.25 and y < 0.24:
            return 'trim'
        if pillars and abs(x) > 0.6 and 0.925 < y < 1.362 and (abs(z + 0.32) < 0.04 or abs(z + 1.08) < 0.04):
            return 'trim'
        return None

    road.zones(skin, fn, ys=(0.215, 0.24) + ((0.925, 1.362) if pillars else ()), zs=(2.2, -2.25) + ((-0.36, -0.28, -1.12, -1.04) if pillars else ()),
               xs=((0.6,) if pillars else ()))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.38, seat_z=0.15, floor_y=0.25, dash_z=0.82, dash_y=0.8, dash_w=0.76, wheel_z=0.58, wheel_y=0.86, recline=0.3)
    segs = n(3, 1)
    geo.rbox('bench', (0, 0.38, -0.66), (0.7, 0.07, 0.24), coll, 'interior', r=0.05, segs=segs)
    back = geo.rbox('bench_back', (0, 0, 0), (0.7, 0.27, 0.07), coll, 'interior', r=0.05, segs=segs)
    road._place(back, (0, 0.68, -0.94), 0.2)
    # the load floor, and the cargo cover pulled over it level with the foot of the side glass
    geo.rbox('load_floor', (0, 0.56, -1.62), (0.55, 0.012, 0.62), coll, 'interior', r=0.008, segs=n(2, 1))
    geo.rbox('cargo_cover', (0, 0.94, -1.62), (0.72, 0.008, 0.58), coll, 'trim', r=0.006, segs=n(2, 1))
