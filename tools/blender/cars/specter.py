"""SPECTER LMP: a Le Mans hypercar. A full-width front with a low hood between muscular front fenders
whose inner walls lean out as they climb from the hood, slim headlights at the fender corners (an LED
eyelid hooking down at the corner over two projectors in chrome bezels), brake ducts with carbon
fins below them, a central intake split by a body-coloured blade, a louvred hood vent and louvres on
the fender tops, a carbon splitter, a narrow bubble canopy, vents behind the front wheels, carbon
sills, mirrors on stalks from the fenders, a shark fin running into a full-width wing with tall end
plates, a full-width light bar with blades down the corners, an open mesh tail with twin exhausts and
a carbon diffuser with strakes.

Drawings from the car factory's design (tools/car-factory/designs/specter.js, retired: see the git
history), re-spaced (see views.densify). The front fenders are part of the body's sections (see top
and sec); the canopy's tail drops into the engine cover at a clear angle, and the glass is kept to
the canopy's top and flanks, clear of its fillets.
"""
import math
from functools import lru_cache

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.45, 'y': 0.36, 'x': 0.84, 'r': 0.36, 'w': 0.31},
    'rear': {'z': -1.45, 'y': 0.36, 'x': 0.84, 'r': 0.36, 'w': 0.34},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    'panels': {
        'side': [
            [[0.66, 0.9], [0.62, 0.7], [-0.72, 0.72], [-0.8, 0.86]],
            [[0.62, 0.24], [0.62, 0.6]],
        ],
        'top': [
            [[-0.62, -0.95], [0.62, -0.95]],
            [[-0.5, 1.3], [0.5, 1.3]],
        ],
    },
    'livery': {'door': [-0.35, 0.43], 'shoulder': 0.58, 'cabin': {'x': 0.56, 'z0': -1.9, 'z1': 1.25}},
    'tailLights': [[0.85, 0.785, -2.47], [-0.85, 0.785, -2.47]],
    'headLights': [[0.725, 0.394, 2.39], [-0.725, 0.394, 2.39]],
    'exhausts': [[0.12, 0.6, -2.5], [-0.12, 0.6, -2.5]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5}

# ------------------------------------------------------------------------------- drawings
# the keel: the nose, the hood between the fenders, the side pods, the engine cover and tail
SIDE = Outline([
    (2.465, 0.11, 1), (2.5, 0.19), (2.505, 0.28), (2.48, 0.355), (2.42, 0.415), (2.27, 0.47), (2.02, 0.52), (1.72, 0.555), (1.42, 0.58),
    (1.12, 0.605), (0.82, 0.632), (0.4, 0.665), (0.0, 0.685), (-0.4, 0.705), (-1.0, 0.765), (-1.45, 0.865), (-1.9, 0.85), (-2.3, 0.83),
    (-2.44, 0.81, 1), (-2.475, 0.62), (-2.46, 0.45, 1), (-2.15, 0.24), (-1.85, 0.11, 1),
])
# the front fenders, side view: wedges from bumper height climbing over the wheels
POD_SIDE = Outline([
    (2.37, 0.2, 1), (2.425, 0.3), (2.44, 0.38), (2.415, 0.455), (2.33, 0.525), (2.16, 0.605), (1.93, 0.685), (1.69, 0.755), (1.45, 0.795),
    (1.15, 0.795), (0.85, 0.73), (0.64, 0.58), (0.6, 0.3, 1), (0.72, 0.16, 1),
])
# the outer plan: the front fenders' outline, then the side pods and the rear fenders
PLAN = Outline(mirror_u([
    (0, 2.495), (0.3, 2.485), (0.55, 2.46), (0.75, 2.415), (0.9, 2.365), (0.975, 2.27), (1.015, 2.0), (1.03, 1.6), (1.03, 1.3), (1.01, 1.0),
    (0.975, 0.75), (0.95, 0.5), (0.95, 0.2), (0.965, -0.6), (1.01, -1.0), (1.03, -1.45), (1.02, -1.95), (0.97, -2.32), (0.82, -2.47, 1),
    (0.4, -2.478), (0, -2.48),
]))
# the bubble canopy (its tail stands 2.5 cm proud of the engine cover, then drops into it steeply)
CAB_SIDE = Outline([
    (1.22, 0.5, 1), (1.17, 0.6), (1.01, 0.7), (0.85, 0.8), (0.45, 0.965), (0.05, 1.045), (-0.4, 1.06), (-0.85, 1.015), (-1.25, 0.925),
    (-1.5, 0.89), (-1.58, 0.83, 1), (-1.58, 0.5, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.27), (0.3, 1.22), (0.5, 0.92), (0.585, 0.4), (0.585, -0.3), (0.5, -0.9), (0.32, -1.5), (0.1, -1.92), (0, -1.97),
]))

# (on the canopy's leaning flank, clear of its fillet above and the side pods below)
SIDE_WIN = road.rounded([(0.45, 0.76), (0.15, 0.875), (-0.3, 0.92), (-0.65, 0.9), (-0.55, 0.8), (0.0, 0.74)], [0.0, 0.15, 0.2, 0.04, 0.08, 0.15])
# (the canopy's top is narrow - it leans in hard - and the windscreen stays on it)
WINDSHIELD = road.rounded([(-0.26, 1.13), (0.26, 1.13), (0.36, 0.92), (0.34, 0.5), (0.3, 0.05), (-0.3, 0.05), (-0.34, 0.5), (-0.36, 0.92)],
                          [0.04, 0.04, 0.1, 0.12, 0.05, 0.05, 0.12, 0.1])
# the headlight (front view): a slim slit rising toward the outside, hooking down at the corner
HEAD = road.rounded([(0.597, 0.422), (0.926, 0.448), (0.935, 0.43), (0.931, 0.358), (0.902, 0.356), (0.9, 0.386), (0.602, 0.362), (0.585, 0.392)],
                    [0.012, 0.012, 0.008, 0.008, 0.008, 0.0, 0.012, 0.012])
EYELID = ((0.625, 0.4128), (0.75, 0.4228), (0.87, 0.4324), (0.902, 0.4278), (0.915, 0.407), (0.9145, 0.38), (0.9138, 0.372))
PROJECTORS = ((0.68, 0.3902), (0.77, 0.3974))
MOUTH = road.rounded([(-0.44, 0.16), (0.44, 0.16), (0.4025, 0.31), (-0.4025, 0.31)], 0.03)
FIN = [(-0.75, 1.03, 1), (-1.4, 1.065, 1), (-2.05, 1.09, 1), (-2.34, 1.09, 1), (-2.34, 0.75, 1), (-0.8, 0.84, 1)]
END_PLATE = [(-1.86, 0.84, 1), (-1.98, 1.11, 1), (-2.49, 1.13, 1), (-2.49, 0.79, 1)]
FENDER_X = 0.79


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def fender_in(z):
    """Where the fenders' leaning inner walls stand at y 0.5 (they lean out 0.5 m per metre up)."""
    return 0.53 + 0.105 * smoothstep(1.3, 0.7, z)


@lru_cache(maxsize=None)
def fender_top(z):
    span = POD_SIDE.span_v(z)
    return span[1] if span else None


@lru_cache(maxsize=None)
def body_half(z):
    return PLAN.half_width(z)


def pod_weight(z):
    return smoothstep(0.62, 0.85, z) * (1 - smoothstep(2.3, 2.44, z))


def top(ax, z, yt):
    """The keel's top (the hood between the fenders) with the front fenders standing on it: a crown
    reached up a leaning inner wall."""
    yf = fender_top(z)
    if yf is None:
        return yt
    fender = road.smin(yf, 0.5 + 2.0 * (ax - fender_in(z)), 0.025)
    return road.smax(yt, fender, 0.03)


def sec(y, z):
    """The fenders tuck in toward their tops on the outside; the side pods and rear fenders have a
    soft shoulder and tumblehome; both tuck in under the sills."""
    W = max(body_half(z), 0.1)
    pz = pod_weight(z)
    s_pod = 1 - (max(W - FENDER_X, 0.0) / W) * ramp(y - 0.45, 0.015) * 0.5
    s_body = 1 - ramp(y - 0.62, 0.015) * 0.25
    s = pz * s_pod + (1 - pz) * s_body
    if y < 0.25:
        s *= 0.95 + 0.05 * smoothstep(0.1, 0.25, y)
    return s


def keys(z):
    """The side split at the shoulder and the sill's tuck, every section alike."""
    yb, yt = SIDE.span_v(z) or (0.11, 0.8)
    yf = fender_top(z)
    side_top = max(yt, yf) if yf else yt
    pz = pod_weight(z)
    k1 = min(0.45 * pz + 0.62 * (1 - pz), side_top - 0.06)
    return (k1, min(max(0.25, yb + 0.05), k1 - 0.02))


def top_keys(z):
    """Across the top: the fenders' feet on the hood and the edges of their crowns, every section
    alike (so both creases run along fixed vertices)."""
    yb, yt = SIDE.span_v(z) or (0.11, 0.8)
    yf = fender_top(z)
    foot = fender_in(z) + (yt - 0.5) / 2
    return (foot, foot + max(0.04, ((yf - yt) / 2) if yf else 0.0))


def tilt(y):
    return max(0.0, y - 0.7) * 0.55


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


def thin(pts, k):
    """Every k-th point, keeping the last."""
    out = pts[::k]
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    counts = ((n(9), n(6), n(7)), n(6), (n(10), n(8), n(6)), n(5), n(8))
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=keys, top=top, top_keys=top_keys, r_top=0.04, r_bot=0.03, stations=130,
                          counts=counts)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.08, stations=80))
    # (the front arches start right at the tyres' inner faces: further in, they'd break through the
    # fenders' leaning inner walls into the hood)
    road.wheel_arches(coll, n, skin, {'front': WHEELS['front']}, gap=GAP, inner=0.01)
    road.wheel_arches(coll, n, skin, {'rear': WHEELS['rear']}, gap=GAP)
    surf = road.Surface([skin])
    glass(coll, n, surf, lod)
    lamps(coll, n, surf, lod)
    parts(coll, n, surf, lod)
    openings(coll, n, skin, surf, lod)
    if lod != 'lod1':
        hollow(coll, n, skin)
    zones(skin)
    if lod != 'lod1':
        cabin_inside(coll, n)


def glass(coll, n, surf, lod):
    g = 0.05  # (the full model's; it coarsens with the level)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        road.panel(f'glass_{view}', surf, view, SIDE_WIN, coll, 'window', depth=d, grid=g)
        if lod != 'lod1':
            road.ring_panel(f'frame_{view}', surf, view, SIDE_WIN, coll, 'trim', width=0.012, grid=0.04)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, width=0.03, grid=0.04)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        # the LED eyelid along the top of the headlight, hooking down at the corner; two projectors
        # in chrome bezels below it
        road.ribbon(f'eyelid_{s}', surf, 'front', [(s * u, v) for u, v in EYELID], coll, 'drl', width=0.011, depth=0.008, thick=0.004, per=3)
        for u, v in PROJECTORS:
            road.disc(f'bezel_{s}{u}', surf, 'front', (s * u, v), 0.019, coll, 'chrome', depth=0.019, thick=0.004, sides=n(24, 10))
            road.disc(f'projector_{s}{u}', surf, 'front', (s * u, v), 0.0145, coll, 'lens', depth=0.016, thick=0.004, sides=n(20, 10))
        # the light blades down the rear corners
        road.ribbon(f'tail_blade_{s}', surf, 'rear', [(s * 0.928, 0.775), (s * 0.928, 0.56)], coll, 'tailglow', width=0.012, depth=0.012,
                    thick=0.004, per=1, facing=0.2)
    road.ribbon('tail_bar', surf, 'rear', [(-0.9, 0.785), (0.0, 0.785), (0.9, 0.785)], coll, 'tailglow', width=0.01, depth=0.012, thick=0.004,
                per=8)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    wing(coll, n)
    splitter(coll, n)
    # the shark fin, from the canopy's roof back into the wing
    geo.plate('shark_fin', FIN, coll, 'carbon', plane='x', at=0.0, thick=0.014, per=1)
    for s in (1, -1):
        # mirrors on blade stalks from the fender tops
        h = surf.project('top', s * 0.82, 0.86)
        y0 = h[0][1] if h else 0.72
        geo.rbox(f'mirror_stalk_{s}', (s * 0.82, (y0 + 0.88) / 2, 0.86), (0.008, (0.88 - y0) / 2 + 0.01, 0.03), coll, 'carbon', r=0.006, segs=n(2, 1))
        geo.rbox(f'mirror_{s}', (s * 0.84, 0.9, 0.84), (0.075, 0.035, 0.045), coll, 'carbon', r=0.028, segs=segs)
        geo.rbox(f'mirror_glass_{s}', (s * 0.84, 0.9, 0.796), (0.064, 0.026, 0.004), coll, 'chrome', r=0.008, segs=n(2, 1))
        # the exhausts in the open mesh tail
        road.exhaust_tip(coll, n, (s * 0.12, 0.6, -2.47), 0.05, 0.16, f'{s}', depth=0.07)
        # carbon fins in the brake ducts, strakes under the diffuser
        for xf in (0.72, 0.82):
            fin_plate(f'duct_fin_{s}{xf}', surf, s * xf, 0.176, 0.288, 0.012, 0.11, coll)
        for xf in (0.15, 0.4, 0.66):
            pts = []
            zs = [-1.8 - (2.47 - 1.8) * i / 8 for i in range(9)]
            for z in zs:
                pts.append((z, SIDE.span_v(z)[0] + 0.012, 1))
            for z in reversed(zs):
                pts.append((z - (0.03 if z == zs[-1] else 0.0), max(0.11, SIDE.span_v(z)[0] - 0.09), 1))
            geo.plate(f'strake_{s}{xf}', pts, coll, 'carbon', plane='x', at=s * xf, thick=0.016, per=1)
    # the body-coloured blade across the central intake
    fin_plate_x('intake_blade', surf, 0.25, 0.42, 0.012, 0.12, coll)
    if lod == 'lod1':
        return
    # louvres: three across the hood vent, six across each fender's top
    for zs in (1.93, 2.0, 2.07):
        road.ribbon(f'hood_louvre_{zs}', surf, 'top', [(-0.25, zs), (0.25, zs)], coll, 'carbon', width=0.014, depth=0.045, thick=0.041, per=1)
    for s in (1, -1):
        for i in range(6):
            zs = 0.96 + i * 0.064
            road.ribbon(f'fender_louvre_{s}{i}', surf, 'top', [(s * 0.78, zs), (s * 0.95, zs)], coll, 'carbon', width=0.016, depth=0.028, thick=0.025,
                        per=1)
    for view in ('left', 'right'):
        # carbon fins across the vents behind the front wheels
        for yb in (0.3, 0.36, 0.42):
            road.ribbon(f'vent_fin_{view}{yb}', surf, view, [(0.95, yb), (0.67, yb)], coll, 'carbon', width=0.012, depth=0.09, thick=0.08, per=1)
    # wipers
    road.bead('wiper_arm', surf, 'top', [(0.22, 1.1), (-0.14, 1.05)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
    road.bead('wiper_blade', surf, 'top', [(0.16, 1.096), (-0.2, 1.046)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def fin_plate(name, surf, x, y0, y1, thick, depth, coll):
    """A flat fin standing upright in a front-view pocket at x, from just under its mouth back
    `depth` (a plate: a fin projected along a pocket's curving floor twists)."""
    front, back = [], []
    for i in range(6):
        y = y0 + (y1 - y0) * i / 5
        h = surf.project('front', x, y)
        if h:
            front.append((h[0][2] - 0.012, y, 1))
            back.append((h[0][2] - depth, y, 1))
    if len(front) > 2:
        geo.plate(name, front + back[::-1], coll, 'carbon', plane='x', at=x, thick=thick, per=1)


def fin_plate_x(name, surf, y, half, thick, depth, coll):
    """A flat horizontal blade across a front-view pocket at height y, from just under its mouth back
    `depth`."""
    front, back = [], []
    for i in range(9):
        x = -half + 2 * half * i / 8
        h = surf.project('front', x, y)
        if h:
            front.append((x, h[0][2] - 0.012, 1))
            back.append((x, h[0][2] - depth, 1))
    if len(front) > 2:
        geo.plate(name, front + back[::-1], coll, 'paint', plane='y', at=y, thick=thick, per=1)


def wing(coll, n):
    """The full-width wing (its middle carried on the shark fin) and the tall end plates."""
    foil = geo.airfoil(n(24, 10), thick=0.055, camber=0.0)
    keys_ = [(-0.99, [0.47, 1.0, -2.0, 7.5, 1.0]), (0.99, [0.47, 1.0, -2.0, 7.5, 1.0])]
    # (stations across the span, the tips clear of the end plates: the baked shadow is sampled at
    # the vertices, and a blade with only its tips buried in the plates bakes black)
    geo.wing('wing', keys_, [-0.98 + 1.96 * i / n(8, 2) for i in range(n(8, 2) + 1)], foil, coll, 'carbon', invert=True)
    for s in (1, -1):
        geo.plate(f'wing_plate_{s}', END_PLATE, coll, 'carbon', plane='x', at=s * 0.995, thick=0.016, per=1)


def splitter(coll, n):
    """The carbon splitter under the nose, 4.5 cm proud of it."""
    pts = run(PLAN, 1.86, True)
    pts = thin(pts, max(1, len(pts) // n(50, 16)))
    rings = []
    for i, (x, z) in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, tz) or 1
        nx, nz = tz / ln, -tx / ln
        if nx * x + nz * (z - 1.0) < 0:
            nx, nz = -nx, -nz
        # (its inside reaches back under the nose)
        rings.append([(x + nx * o, y, z + nz * o) for o, y in ((0.045, 0.117), (0.05, 0.105), (0.045, 0.093), (-0.2, 0.093), (-0.2, 0.117))])
    return geo.loft('splitter', rings, coll, 'carbon', sharp=40.0)


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            road.pocket(skin, surf, view, SIDE_WIN, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
    # the headlights, the brake ducts under them, the central intake, the hood vent, the fender louvres
    for s in (1, -1):
        road.pocket(skin, surf, 'front', sym(HEAD, s), 0.026, coll, 'head', 'trim', grid=0.008, facing=0.2)
        road.pocket(skin, surf, 'front', sym(rrect(0.77, 0.232, 0.15, 0.062, 0.026), s), 0.12, coll, 'grille', 'trim', grid=0.015)
        road.pocket(skin, surf, 'top', sym(rrect(0.865, 1.12, 0.095, 0.2, 0.04), s), 0.03, coll, 'grille', 'trim', grid=0.015)
        # the rear light blades down the corners
        road.pocket(skin, surf, 'rear', sym(rrect(0.928, 0.665, 0.016, 0.125, 0.008), s), 0.02, coll, 'tail', 'trim', grid=0.008, facing=0.2)
    road.pocket(skin, surf, 'front', MOUTH, 0.14, coll, 'grille', 'trim', grid=0.015)
    road.pocket(skin, surf, 'top', rrect(0, 2.0, 0.27, 0.14, 0.05), 0.05, coll, 'grille', 'trim', grid=0.015)
    # the tail: the light bar's slot, the open mesh with the exhausts
    road.pocket(skin, surf, 'rear', rrect(0, 0.785, 0.91, 0.014, 0.008), 0.02, coll, 'tail', 'trim', grid=0.008)
    road.pocket(skin, surf, 'rear', rrect(0, 0.6, 0.82, 0.13, 0.04), 0.08, coll, 'grille', 'trim', grid=0.015)
    for view in ('left', 'right'):
        # the vents behind the front wheels
        road.pocket(skin, surf, view, rrect(0.81, 0.36, 0.15, 0.13, 0.04), 0.1, coll, 'grille', 'trim', grid=0.015)


def hollow(coll, n, skin):
    """The cockpit hollowed: a narrow prototype tub under the canopy."""
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.44, 0.1), (0.52, 0.29, 0.9)), z_range=(-0.95, 1.18), tilt=tilt, wall=0.025,
                floor=0.62)


def zones(skin):
    """The underbody black; carbon on the side pods' sills, under the nose and across the diffuser."""
    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        ax = abs(x)
        if y < 0.118:
            return 'trim'
        if y < 0.24 and ax > 0.4 and -1.1 < z < 0.95:
            return 'carbon'
        if y < 0.15 and z > 1.8:
            return 'carbon'
        if z < -1.7 and y < 0.46 and ny < -0.2:
            return 'carbon'
        return None

    road.zones(skin, fn, ys=(0.118, 0.15, 0.24, 0.46), zs=(1.8, 0.95, -1.1, -1.7), xs=(0.4,))


def cabin_inside(coll, n):
    # (laid well back, low and close to the middle: the canopy is narrow and low over the headrests)
    road.cockpit(coll, n, seat_x=0.25, seat_z=-0.25, floor_y=0.12, dash_z=0.72, dash_y=0.64, dash_w=0.48, wheel_z=0.44, wheel_y=0.64, recline=0.6)
