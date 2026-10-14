"""RAZOR X: a knife-edged hypercar. A wedge from a pointed nose to a high, flat tail, creased flanks
with a long scoop dished along the doors into a side intake split by strakes, a hood sunk between
crowned fender pods with a duct in it, swept headlamp slits with light strips, a deep centre mouth
and corner intakes with fins, a carbon splitter, skirts and diffuser strakes, a fighter canopy with a
roof snorkel and an engine window in its tail, a louvred engine cover on the rear deck, a swan-neck
wing (its pylons hooked over the leading edge onto its top), Y-shaped tail lamps and quad exhausts in
a hexagonal surround.

Drawings from the car factory's design (tools/car-factory/designs/razor.js, retired: see the git
history), re-spaced (see views.densify). The canopy's tail drops into the deck at a clear angle, the
side glass is kept to the canopy's leaning flank, and the engine cover moved behind the canopy onto
the deck.
"""
import math
from functools import lru_cache

from lib import geo, road
from lib.road import rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.36, 'y': 0.345, 'x': 0.86, 'r': 0.345, 'w': 0.27},
    'rear': {'z': -1.36, 'y': 0.37, 'x': 0.85, 'r': 0.37, 'w': 0.34},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    'panels': {
        'side': [
            [[0.86, 0.81], [0.82, 0.36], [-0.1, 0.36], [-0.17, 0.72]],
            [[-1.2, 0.865], [-1.34, 0.865], [-1.34, 0.795], [-1.2, 0.795], [-1.2, 0.865]],
        ],
        'top': [
            [[-0.45, 1.15], [0.45, 1.15], [0.55, 1.5], [0.45, 2.1], [0.3, 2.3], [-0.3, 2.3], [-0.45, 2.1], [-0.55, 1.5], [-0.45, 1.15]],
        ],
    },
    'livery': {'door': [0.3, 0.56], 'shoulder': 0.6, 'cabin': {'x': 0.62, 'z0': -1.7, 'z1': 1.12}},
    'tailLights': [[0.72, 0.775, -2.38], [-0.72, 0.775, -2.38]],
    'headLights': [[0.65, 0.44, 2.2], [-0.65, 0.44, 2.2]],
    'exhausts': [[0.085, 0.69, -2.45], [0.215, 0.69, -2.45], [-0.085, 0.69, -2.45], [-0.215, 0.69, -2.45]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.25, 0.1, 1), (2.36, 0.15), (2.395, 0.235, 1), (2.3, 0.3), (2.05, 0.41), (1.85, 0.5), (1.62, 0.635), (1.36, 0.78), (1.0, 0.795),
    (0.5, 0.805), (0.0, 0.83), (-0.6, 0.875), (-1.2, 0.925), (-1.8, 0.955), (-2.05, 0.962), (-2.3, 0.965), (-2.39, 0.955, 1), (-2.405, 0.62),
    (-2.37, 0.48, 1), (-2.1, 0.28), (-1.75, 0.13), (-1.55, 0.1, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.395), (0.4, 2.37, 1), (0.78, 2.17), (0.96, 1.9, 1), (1.0, 1.4), (0.985, 0.95, 1), (0.95, 0.35), (0.965, -0.3), (1.03, -0.85, 1),
    (1.045, -1.36), (1.035, -1.9, 1), (0.97, -2.28), (0.62, -2.4, 1), (0, -2.41),
]))
# (the canopy's tail stands 3 cm proud of the deck, then drops into it at a clear angle)
CAB_SIDE = Outline([
    (1.15, 0.6, 1), (1.1, 0.7, 1), (0.82, 0.815), (0.55, 0.93), (0.15, 1.06), (-0.1, 1.097), (-0.35, 1.115), (-0.85, 1.09), (-1.3, 1.02),
    (-1.62, 0.985), (-1.7, 0.93, 1), (-1.7, 0.7, 1), (1.15, 0.52, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.18), (0.42, 1.14), (0.68, 0.9), (0.8, 0.4), (0.815, -0.2), (0.77, -0.8), (0.6, -1.3), (0.32, -1.68), (0, -1.78),
]))

# a teardrop of side glass on the canopy's leaning flank, clear of its fillet above and of the body
# below
SIDE_WIN = [(0.4, 0.86, 1), (0.15, 0.945), (-0.2, 0.99), (-0.55, 1.008), (-0.85, 0.99), (-1.04, 0.95, 1), (-0.75, 0.925), (-0.3, 0.887),
            (0.1, 0.866)]
WINDSHIELD = road.rounded([(-0.4, 1.06), (0.4, 1.06), (0.57, 0.85), (0.6, 0.45), (0.53, 0.12), (-0.53, 0.12), (-0.6, 0.45), (-0.57, 0.85)],
                          [0.04, 0.04, 0.15, 0.15, 0.05, 0.05, 0.15, 0.15])
ENGINE_GLASS = road.rounded([(-0.3, -1.12), (0.3, -1.12), (0.2, -1.5), (-0.2, -1.5)], 0.04)
# the roof snorkel: its open mouth facing forward, its top falling back into the roof
SNORKEL_SIDE = Outline([(-0.2, 1.06, 1), (-0.2, 1.18, 1), (-0.3, 1.19), (-0.55, 1.19), (-0.8, 1.175), (-0.95, 1.13), (-1.06, 1.05, 1)])
SNORKEL_PLAN = Outline(road.rounded([(-0.17, -0.19), (0.17, -0.19), (0.17, -1.07), (-0.17, -1.07)], [0.04, 0.04, 0.1, 0.1], n=4))
SIDE_INTAKE = [(-0.18, 0.73, 1), (-0.86, 0.75, 1), (-0.88, 0.45, 1), (-0.45, 0.36, 1)]
FRONT_MOUTH = mirror_u([(0, 0.27), (0.36, 0.26, 1), (0.42, 0.15, 1), (0, 0.145)])
CORNER_INTAKE = [(0.5, 0.16, 1), (0.88, 0.16, 1), (0.9, 0.36, 1), (0.82, 0.4, 1), (0.56, 0.3, 1)]
HOOD_DUCT = mirror_u([(0, 1.98), (0.2, 1.95, 1), (0.26, 1.6, 1), (0, 1.56)])
# the headlamp slit (front view), swept up toward the corner (stopping short of where the corner turns
# away to the side: a pocket cut along the view into a surface that steep is a long notch)
HEAD_SLIT = [(0.38, 0.405, 1), (0.52, 0.42), (0.66, 0.443), (0.84, 0.478, 1), (0.865, 0.462, 1), (0.74, 0.437), (0.6, 0.411), (0.48, 0.396),
             (0.4, 0.39, 1)]
# the Y tail lamp (rear view): three arms from a hub
TAIL_HUB = (0.72, 0.775)
TAIL_TIPS = ((0.93, 0.87), (0.54, 0.875), (0.72, 0.64))
HEX = road.rounded([(0.325, 0.69), (0.163, 0.778), (-0.163, 0.778), (-0.325, 0.69), (-0.163, 0.602), (0.163, 0.602)], 0.012)
PIPES = (0.085, 0.215)


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def shoulder(z):
    """The flank's sharp shoulder, rising toward the rear."""
    return 0.55 + 0.06 * smoothstep(0.4, -1.6, z)


@lru_cache(maxsize=None)
def body_half(z):
    return PLAN.half_width(z)


def sec(y, z):
    """A creased lower blade, steep flanks, a sharp shoulder and a strong tumblehome above it; the
    long scoop dished into the flank along the doors (an ellipsoid sunk 6 cm at its middle)."""
    if y < 0.33:
        s = 1 - 0.075 * ramp(0.33 - y, 0.006) / 0.23
    else:
        s = 1.0 - ramp(y - shoulder(z), 0.007) * 0.36
    e = 1 - ((y - 0.5) / 0.2) ** 2 - ((z + 0.25) / 0.9) ** 2
    if e > 0:
        W = max(body_half(z), 0.1)
        s = road.smin(s, (1.2 - 0.3 * math.sqrt(e)) / W, 0.04 / W)
    return s


def top(ax, z, yt):
    """The hood sunk between crowned fender pods. (It's sunk all the way back under the windscreen's
    foot and rises again under the canopy where that's wide enough to cover it: a hood rising under
    the windscreen at the windscreen's own rake seams with it in a frayed zigzag.) The pods swell
    over the front wheels to clear their arches by 3.5 cm: the wedge's line runs lower than the
    arch's top ahead of the wheel, and the arch cut a slot through the fender."""
    f = smoothstep(0.45, 0.75, z) * (1 - smoothstep(2.0, 2.3, z))
    w = WHEELS['front']
    dz = z - w['z']
    arch = w['y'] + math.sqrt(max(0.0, (w['r'] + GAP + 0.035) ** 2 - dz * dz))
    crown = road.smax(0.0, arch - yt, 0.02) * smoothstep(0.55, 0.75, ax)
    return yt - 0.1 * f * (1 - smoothstep(0.3, 0.74, ax)) * smoothstep(0.3, 0.42, yt) + crown


def keys(z):
    """The side split at the shoulder and the blade's crease, every section alike."""
    yb, yt = SIDE.span_v(z) or (0.1, 0.9)
    k1 = min(shoulder(z), yt - 0.04)
    return (k1, min(max(0.33, yb + 0.04), k1 - 0.02))


def tilt(y):
    return max(0.0, y - 0.78) * 0.5


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


def y_outline(hub, tips, w, n=4):
    """The outline of arms w/2 wide from a hub to each tip (round-ended), as one polygon."""
    arms = sorted(tips, key=lambda t: math.atan2(t[1] - hub[1], t[0] - hub[0]))
    h = w / 2

    def frame(t):
        dx, dy = t[0] - hub[0], t[1] - hub[1]
        ln = math.hypot(dx, dy)
        return (dx / ln, dy / ln), (-dy / ln, dx / ln)

    def meet(p, d, q, e):
        """Where the line p + s d meets the line q + t e."""
        den = d[0] * e[1] - d[1] * e[0]
        s = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
        return (p[0] + d[0] * s, p[1] + d[1] * s)

    out = []
    k = len(arms)
    for i, t in enumerate(arms):
        d, nrm = frame(t)
        # where this arm's right edge meets the previous arm's left edge
        pd, pn = frame(arms[i - 1])
        out.append((*meet((hub[0] - nrm[0] * h, hub[1] - nrm[1] * h), d, (hub[0] + pn[0] * h, hub[1] + pn[1] * h), pd), 1))
        # round the tip
        for j in range(n + 1):
            a = -math.pi / 2 + math.pi * j / n
            c, s = math.cos(a), math.sin(a)
            out.append((t[0] + (d[0] * c + nrm[0] * s) * h, t[1] + (d[1] * c + nrm[1] * s) * h, 1))
    return out


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    counts = (n(14), n(6), (n(8), n(12), n(7)), n(5), n(8))
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=keys, top=top, r_top=0.03, r_bot=0.03, stations=125, counts=counts)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.05, stations=80))
    snorkel = road.view_body('snorkel', coll, n, SNORKEL_SIDE, SNORKEL_PLAN, r_top=0.03, r_bot=0.004, stations=40,
                             counts=(n(10), n(5), (n(4),), n(2), n(6)))
    geo.boolean(skin, snorkel, op='UNION', sharp=50.0)
    road.wheel_arches(coll, n, skin, WHEELS, gap=GAP)
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
    road.glass_panel('engine_glass', surf, 'top', ENGINE_GLASS, coll, 'glass', border=0.014 if lod != 'lod1' else 0, grid=0.04)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, grid=0.04)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        # a light strip along each headlamp slit
        road.ribbon(f'drl_{s}', surf, 'front', [(s * 0.42, 0.401), (s * 0.62, 0.427), (s * 0.82, 0.466)], coll, 'drl', width=0.008, depth=0.008,
                    thick=0.004, per=4)
        # bright bars along the Y tail lamp's arms
        for i, t in enumerate(TAIL_TIPS):
            road.ribbon(f'tail_glow_{s}{i}', surf, 'rear', [(s * TAIL_HUB[0], TAIL_HUB[1]), (s * t[0], t[1])], coll, 'tailglow', width=0.008,
                        depth=0.012, thick=0.003, per=1)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    wing(coll, n)
    splitter(coll, n)
    # carbon skirt blades along the sills, diffuser strakes under the tail
    for s in (1, -1):
        geo.rbox(f'skirt_{s}', (s * 0.9, 0.125, 0.04), (0.05, 0.015, 0.96), coll, 'carbon', r=0.01, segs=segs)
        for xf in (0.12, 0.38, 0.62):
            pts = []
            for i in range(9):
                z = -1.62 - (2.37 - 1.62) * i / 8
                yb = SIDE.span_v(z)[0]
                pts.append((z, yb + 0.015, 1))
            for i in range(8, -1, -1):
                z = -1.62 - (2.37 - 1.62) * i / 8
                yb = SIDE.span_v(z)[0]
                pts.append((z - (0.03 if i == 8 else 0.0), max(0.11, yb - 0.09), 1))
            geo.plate(f'strake_{s}{xf}', pts, coll, 'carbon', plane='x', at=s * xf, thick=0.016, per=1)
        # carbon mirrors on stalks from the door tops
        road.mirror_unit(coll, n, s, (0.86, 0.8, 0.79), (1.02, 0.885, 0.72), (0.09, 0.04, 0.05), glass_role='chrome', body_role='carbon',
                         arm_role='carbon', r=0.03)
        for xe in PIPES:
            road.exhaust_tip(coll, n, (s * xe, 0.69, -2.42), 0.045, 0.16, f'{s}{xe}', depth=0.07)
    # fins standing in the corner intakes (flat plates from the intake's floor to just under its
    # mouth), louvres across the engine cover, strakes across the side intakes
    for s in (1, -1):
        for xf, yt in ((0.66, 0.33), (0.8, 0.38)):
            front, back = [], []
            for i in range(7):
                y = 0.168 + (yt - 0.168) * i / 6
                h = surf.project('front', s * xf, y)
                if h:
                    front.append((h[0][2] - 0.015, y, 1))
                    back.append((h[0][2] - 0.13, y, 1))
            if len(front) > 2:
                geo.plate(f'intake_fin_{s}{xf}', front + back[::-1], coll, 'carbon', plane='x', at=s * xf, thick=0.012, per=1)
    if lod != 'lod1':
        for i in range(6):
            zl = -1.8 - i * 0.072
            road.ribbon(f'louvre_{i}', surf, 'top', [(-0.28, zl), (0.28, zl)], coll, 'carbon', width=0.018, depth=0.034, thick=0.03, per=1)
    for view in ('left', 'right'):
        for ys, z0 in ((0.5, -0.37), (0.6, -0.3), (0.69, -0.23)):
            road.ribbon(f'intake_strake_{view}{ys}', surf, view, [(z0, ys + (z0 + 0.6) * 0.05), (-0.85, ys - 0.0125)], coll, 'paint', width=0.022,
                        depth=0.05, thick=0.044, per=1)
    if lod == 'lod1':
        return
    # wipers parked at the foot of the windshield
    for x0, x1 in ((0.3, -0.12), (-0.16, -0.5)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 1.0), (x1, 0.95)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 0.995), (x1, 0.946)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def wing(coll, n):
    """The swan-neck wing: a blade across the tail, end plates, and pylons rising from the deck that
    hook over its leading edge onto its top."""
    foil = geo.airfoil(n(24, 10), thick=0.085, camber=0.03, pos=0.4)
    keys_ = [(-0.98, [0.41, 1.231, -1.84, 7.0, 1.0]), (0.98, [0.41, 1.231, -1.84, 7.0, 1.0])]
    # (stations across the span: the baked shadow is sampled at the vertices, and a blade with only
    # its tips next to the end plates bakes dark all over)
    geo.wing('wing', keys_, [-0.98 + 1.96 * i / n(8, 2) for i in range(n(8, 2) + 1)], foil, coll, 'carbon', invert=True)
    segs = n(3, 1)
    for s in (1, -1):
        geo.plate(f'wing_plate_{s}', rrect(-2.05, 1.205, 0.25, 0.105, 0.035), coll, 'carbon', plane='x', at=s * 0.995, thick=0.012, per=1)
        path = [(s * 0.36, 0.93, -1.84), (s * 0.36, 1.1, -1.8), (s * 0.36, 1.24, -1.79), (s * 0.36, 1.295, -1.84), (s * 0.36, 1.285, -1.93)]
        geo.tube(f'wing_pylon_{s}', path, coll, radius=(0.03, 0.009), role='carbon', sides=n(10, 6), smooth_path=n(4, 2))


def splitter(coll, n):
    """The carbon splitter under the nose, 4.5 cm proud of it."""
    pts = run(PLAN, 2.0, True)
    pts = thin(pts, max(1, len(pts) // n(50, 16)))
    rings = []
    for i, (x, z) in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, tz) or 1
        nx, nz = tz / ln, -tx / ln
        if nx * x + nz * (z - 1.0) < 0:
            nx, nz = -nx, -nz
        # (its inside reaches back under the nose's raked lower face)
        rings.append([(x + nx * o, y, z + nz * o) for o, y in ((0.045, 0.123), (0.05, 0.112), (0.045, 0.101), (-0.2, 0.101), (-0.2, 0.123))])
    return geo.loft('splitter', rings, coll, 'carbon', sharp=40.0)


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            road.pocket(skin, surf, view, SIDE_WIN, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
    # the intakes: the centre mouth, the corner intakes, the hood duct, the snorkel's mouth, the side
    # intakes (a shallow body-coloured duct, so the mesh at its back still catches the light)
    road.pocket(skin, surf, 'front', FRONT_MOUTH, 0.14, coll, 'grille', 'trim', grid=0.015)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', sym(CORNER_INTAKE, s), 0.14, coll, 'grille', 'trim', grid=0.015)
        road.pocket(skin, surf, 'front', sym(HEAD_SLIT, s), 0.028, coll, 'head', 'trim', grid=0.008)
        road.pocket(skin, surf, 'rear', sym(y_outline(TAIL_HUB, TAIL_TIPS, 0.026, n(4, 2)), s), 0.025, coll, 'tail', 'trim', grid=0.008)
    road.pocket(skin, surf, 'top', HOOD_DUCT, 0.05, coll, 'grille', 'trim', grid=0.015)
    road.pocket(skin, surf, 'front', rrect(0, 1.145, 0.13, 0.025, 0.01), 0.1, coll, 'grille', 'trim', grid=0.012)
    for view in ('left', 'right'):
        road.pocket(skin, surf, view, SIDE_INTAKE, 0.055, coll, 'grille', 'paint', grid=0.015)
    # the louvred engine cover on the deck, the hexagonal exhaust surround
    road.pocket(skin, surf, 'top', rrect(0, -1.98, 0.3, 0.24, 0.03), 0.035, coll, 'grille', 'trim', grid=0.015)
    road.pocket(skin, surf, 'rear', HEX, 0.07, coll, 'grille', 'trim', grid=0.012)


def hollow(coll, n, skin):
    """The cockpit hollowed: a tub between the doors and the canopy's inside."""
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.47, 0.04), (0.74, 0.29, 0.88)), z_range=(-1.0, 1.1), tilt=tilt, wall=0.025,
                floor=0.6)


def zones(skin):
    """The underbody black; carbon on the lower blade between the wheels, under the nose, on the
    diffuser and across the foot of the tail."""
    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        ax = abs(x)
        if y < 0.115:
            return 'trim'
        if y < 0.33 and abs(z) < 1.0 and ax > 0.6:
            return 'carbon'
        if y < 0.17 and z > 1.95:
            return 'carbon'
        if z < -1.5 and y < 0.48 and ny < -0.2:
            return 'carbon'
        if z < -2.1 and y < 0.56 and ax < 0.85:
            return 'carbon'
        return None

    road.zones(skin, fn, ys=(0.115, 0.17, 0.33, 0.48, 0.56), zs=(1.95, 1.0, -1.0, -1.5, -2.1), xs=(0.6, 0.85))


def cabin_inside(coll, n):
    # (low and well reclined: the canopy's roof is low over the headrests)
    road.cockpit(coll, n, seat_x=0.36, seat_z=-0.3, floor_y=0.2, dash_z=0.68, dash_y=0.68, dash_w=0.68, wheel_z=0.4, wheel_y=0.66, recline=0.5)
