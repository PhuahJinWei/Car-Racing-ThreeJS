"""RONIN: a late-90s twin-turbo coupe wearing a wide-body kit. A low rounded nose with swept headlamps
(twin projectors in chrome rings under a smoked cover), a big mouth showing the intercooler's chrome
fins and end tanks, fog lamps, a carbon lip, front fenders swelling up over the wheels with the hood
low between them, flared arches and deep skirts, a bubble glasshouse with a blacked-out B-pillar and
black window frames, aero mirrors, wipers, a glass hatch under a tall hoop wing (body coloured, an
airfoil swept up from the deck and over), quad round tail lamps with glowing rings in a smoked band,
the plate in a recess, a carbon diffuser with strakes and one big exhaust. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/ronin.js, retired: see the git
history), re-spaced (see views.densify); the skirts are part of the body's sections, the hatch drops
into the deck at a clear angle, and the glass is kept clear of the bubble's fillets.
"""
import math
from functools import lru_cache

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.32, 'y': 0.345, 'x': 0.79, 'r': 0.345, 'w': 0.25},
    'rear': {'z': -1.25, 'y': 0.355, 'x': 0.795, 'r': 0.355, 'w': 0.29},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [[[0.86, 0.84], [0.9, 0.6], [0.86, 0.3], [-0.36, 0.3], [-0.38, 0.6], [-0.36, 0.89]]],
        'top': [
            [[-0.78, 0.96], [0.78, 0.96], [0.84, 1.6], [0.72, 2.1], [-0.72, 2.1], [-0.84, 1.6], [-0.78, 0.96]],
            [[-0.62, -1.62], [0.62, -1.62], [0.74, -2.18], [-0.74, -2.18], [-0.62, -1.62]],
        ],
        # the bumpers' top edges: under the headlamps, and under the tail band
        'front': [[[-0.9, 0.5], [0.9, 0.5]]],
        'rear': [[[-0.92, 0.62], [0.92, 0.62]]],
    },
    # `plate`: the licence plate painted into the bumper recess (rear view, metres)
    'livery': {
        'door': [0.25, 0.55],
        'shoulder': 0.72,
        'cabin': {'x': 0.6, 'z0': -1.55, 'z1': 0.95},
        'plate': {'x': 0, 'y': 0.47, 'w': 0.3, 'h': 0.15, 'text': 'PS 280'},
    },
    'tailLights': [[0.54, 0.75, -2.3], [-0.54, 0.75, -2.3]],
    'headLights': [[0.62, 0.58, 2.2], [-0.62, 0.58, 2.2]],
    'exhausts': [[-0.52, 0.255, -2.37]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5, 'chrome': 0.6}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.17, 0.15, 1), (2.24, 0.18), (2.275, 0.24), (2.29, 0.32), (2.285, 0.41), (2.265, 0.48), (2.225, 0.545), (2.16, 0.595), (2.06, 0.632),
    (1.9, 0.665), (1.6, 0.715), (1.3, 0.755), (1.0, 0.79), (0.8, 0.808), (0.4, 0.832), (0.0, 0.852), (-0.5, 0.874), (-1.0, 0.902), (-1.5, 0.935),
    (-1.85, 0.957), (-2.1, 0.97), (-2.22, 0.962), (-2.28, 0.93), (-2.305, 0.86), (-2.315, 0.72), (-2.315, 0.52), (-2.305, 0.4), (-2.275, 0.3),
    (-2.21, 0.22), (-2.1, 0.18, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.29), (0.38, 2.28), (0.6, 2.245), (0.76, 2.17), (0.86, 2.05), (0.905, 1.9), (0.925, 1.7), (0.935, 1.45), (0.935, 1.2), (0.925, 0.98),
    (0.905, 0.75), (0.895, 0.4), (0.895, 0.05), (0.895, -0.3), (0.905, -0.6), (0.93, -0.88), (0.95, -1.1), (0.955, -1.35), (0.95, -1.6),
    (0.935, -1.85), (0.9, -2.05), (0.83, -2.2), (0.65, -2.29), (0.3, -2.315), (0, -2.315),
]))
# (the hatch stands 3 cm proud of the deck at its end, then drops into it at a clear angle)
CAB_SIDE = Outline([
    (0.99, 0.79, 1), (0.95, 0.85), (0.7, 0.99), (0.5, 1.09), (0.3, 1.185), (0.1, 1.245), (-0.15, 1.268), (-0.45, 1.262), (-0.7, 1.228),
    (-0.95, 1.16), (-1.2, 1.075), (-1.45, 0.995), (-1.56, 0.972), (-1.62, 0.925, 1), (-1.62, 0.75, 1), (0.99, 0.7, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.0), (0.3, 0.998), (0.6, 0.99), (0.74, 0.95), (0.775, 0.86), (0.78, 0.63), (0.78, 0.4, 1), (0.78, -0.4, 1), (0.765, -0.9), (0.72, -1.25),
    (0.62, -1.5), (0.42, -1.64), (0.2, -1.665), (0, -1.67),
]))

# (on the bubble's flank, clear of its fillet above and the body's shoulder below; the door glass
# starts well behind the A-pillar)
DOOR_WIN = [(0.72, 0.862, 1), (0.5, 0.995), (0.3, 1.09), (0.1, 1.15), (-0.12, 1.173), (-0.36, 1.172, 1), (-0.36, 0.905, 1)]
QUARTER_WIN = [(-0.44, 1.17, 1), (-0.7, 1.138), (-0.95, 1.068), (-1.15, 0.998, 1), (-0.8, 0.94), (-0.44, 0.908, 1)]
SIDE_WINS = (DOOR_WIN, QUARTER_WIN)
# (kept inside the glasshouse's fillets: the bubble leans in hard as it rises)
WINDSHIELD = road.rounded([(-0.6, 0.93), (0.6, 0.93), (0.66, 0.84), (0.6, 0.6), (0.47, 0.3), (-0.47, 0.3), (-0.6, 0.6), (-0.66, 0.84)],
                          [0.04, 0.04, 0.1, 0.12, 0.06, 0.06, 0.12, 0.1])
REAR_GLASS = road.rounded([(-0.48, -0.77), (0.48, -0.77), (0.52, -1.05), (0.48, -1.33), (0.36, -1.5), (-0.36, -1.5), (-0.48, -1.33),
                           (-0.52, -1.05)], [0.04, 0.04, 0.12, 0.08, 0.05, 0.05, 0.08, 0.12])
# the headlamp (front view): a teardrop pointed at its inner end, swelling as it sweeps up and out
HEAD = [(0.38, 0.548, 1), (0.5, 0.537), (0.64, 0.539), (0.76, 0.55), (0.835, 0.578), (0.855, 0.615), (0.83, 0.648), (0.73, 0.655), (0.58, 0.628),
        (0.45, 0.585)]
PROJECTORS = ((0.56, 0.572, 0.025), (0.74, 0.6, 0.033))
TAIL_LAMPS = (0.43, 0.65)


def flare_rise(ax, z):
    """The front fenders swell up over the wheels (the hood low between them); the rear haunches rise
    a little over the rear wheels."""
    front = 0.065 * smoothstep(0.8, 1.05, z) * (1 - smoothstep(1.75, 2.15, z))
    rear = 0.025 * smoothstep(-0.75, -1.0, z) * (1 - smoothstep(-1.55, -1.85, z))
    return smoothstep(0.36, 0.62, ax) * (front + rear)


@lru_cache(maxsize=None)
def body_half(z):
    return PLAN.half_width(z)


def sec(y, z):
    """Slightly barrelled flanks tucked in under the sills; between the wheels deep skirts carry the
    sill out to the flares' width."""
    barrel = 1 - 0.035 * min(1.0, ((y - 0.52) / 0.36) ** 2)
    s = barrel * (0.95 + 0.05 * smoothstep(0.13, 0.26, y)) if y < 0.26 else barrel
    sz = smoothstep(-0.9, -0.8, z) * (1 - smoothstep(0.88, 0.98, z))
    if sz > 0:
        W = max(body_half(z), 0.1)
        skirt = 0.915 * sz * (1 - smoothstep(0.26, 0.3, y))
        s = road.smax(s, skirt / W, 0.02 / W)
    return s


def keys(z):
    """The side split at the skirt's top, every section alike."""
    yb, yt = SIDE.span_v(z) or (0.16, 0.9)
    return (min(0.6, yt - 0.08), max(0.3, yb + 0.07))


def tilt(y):
    return max(0.0, y - 0.86) * 0.55


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

    counts = (n(16), n(8), (n(10), n(10), n(6)), n(6), n(8))
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=keys, top=lambda ax, z, yt: yt + flare_rise(ax, z), r_top=0.07, r_bot=0.05,
                          stations=120, counts=counts)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.055, stations=80))
    road.wheel_arches(coll, n, skin, WHEELS, gap=GAP)
    surf = road.Surface([skin])
    glass(coll, n, surf, lod)
    lamps(coll, n, surf, lod)
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
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'trim', width=0.012, grid=0.04)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('rear_glass', surf, 'top', REAR_GLASS, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, grid=0.04)
        road.frit('rear_frit', surf, 'top', REAR_GLASS, coll, width=0.03, grid=0.04)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        # the headlamps: a smoked cover laid over the nose's rounded corner in a black border (pocketed
        # along the view, a surface that flat would take a long scrape), twin projectors in chrome rings
        road.glass_panel(f'head_{s}', surf, 'front', sym(HEAD, s), coll, 'head', border=0.007 if lod != 'lod1' else 0, grid=0.012, facing=0.12)
        for u, v, r in PROJECTORS:
            road.disc(f'projector_{s}{u}', surf, 'front', (s * u, v), r, coll, 'lens', depth=-0.004, thick=0.004, sides=n(24, 10), facing=0.12)
            if lod != 'lod1':
                road.bead(f'projector_ring_{s}{u}', surf, 'front', circle(s * u, v, r + 0.005, n(24, 10)), coll, 'chrome', radius=0.004, lift=0.004,
                          per=1, sides=n(6, 4), closed=True)
        road.disc(f'fog_lens_{s}', surf, 'front', (s * 0.72, 0.31), 0.03, coll, 'lens', depth=0.012, thick=0.005, sides=n(20, 10))
        # the quad round tail lamps standing in the smoked band (clear reverse lamps in the inner
        # pair), a glowing ring in each
        for xc in TAIL_LAMPS:
            c = (s * xc, 0.75)
            road.disc(f'tail_{s}{xc}', surf, 'rear', c, 0.058, coll, 'tail', depth=0.03, thick=0.026, sides=n(28, 12))
            road.bead(f'tail_glow_{s}{xc}', surf, 'rear', circle(*c, 0.04, n(24, 10)), coll, 'tailglow', radius=0.005, lift=-0.004, per=1,
                      sides=n(6, 4), closed=True)
            if xc < 0.5:
                road.disc(f'reverse_{s}', surf, 'rear', c, 0.022, coll, 'reverse', depth=0.006, thick=0.003, sides=n(16, 8))
    # the intercooler in the mouth: five chrome fins between chrome end tanks
    for i in range(5):
        yb = 0.264 + i * 0.028
        road.bead(f'cooler_fin_{i}', surf, 'front', [(-0.42, yb), (0.42, yb)], coll, 'chrome', radius=0.009, lift=-0.04, per=1, sides=n(8, 4))
    for s in (1, -1):
        road.panel(f'cooler_tank_{s}', surf, 'front', sym(rect(0.413, 0.457, 0.252, 0.388), s), coll, 'chrome', depth=0.018, thick=0.044, grid=0.02)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    hoop_wing(coll, n)
    lip(coll, n)
    # aero mirrors on short stalks from the door tops, the big exhaust under the right of the bumper
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.75, 0.875, 0.72), (0.925, 0.955, 0.7), (0.065, 0.038, 0.05), glass_role='chrome', body_role='paint',
                         arm_role='trim', r=0.034)
    road.exhaust_tip(coll, n, (-0.52, 0.255, -2.32), 0.06, 0.18, 'big', depth=0.08)
    # carbon strakes under the diffuser
    for xf in (-0.38, -0.2, 0.2, 0.38):
        pts = []
        zs = [-1.95 - 0.33 * i / 6 for i in range(7)]
        for z in zs:
            pts.append((z, SIDE.span_v(z)[0] + 0.012, 1))
        for z in reversed(zs):
            pts.append((z - (0.02 if z == zs[-1] else 0.0), max(0.15, SIDE.span_v(z)[0] - 0.08), 1))
        geo.plate(f'strake_{xf}', pts, coll, 'carbon', plane='x', at=xf, thick=0.012, per=1)
    if lod == 'lod1':
        return
    # door pulls, wipers
    for view in ('left', 'right'):
        road.ribbon(f'pull_{view}', surf, view, [(-0.2, 0.8), (-0.32, 0.8)], coll, 'trim', width=0.02, depth=0.004, thick=0.012, per=1)
    for x0, x1 in ((0.42, -0.08), (-0.12, -0.56)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 0.915), (x1, 0.89)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 0.911), (x1, 0.887)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def hoop_wing(coll, n):
    """The hoop wing: a body-coloured airfoil swept up from the deck in a strut each side, round a
    shoulder and across in a blade - wider of chord and tilted up at the back across the top."""
    pts = []
    k = n(6, 3)
    for i in range(k + 1):
        pts.append((0.69, 0.88 + (1.11 - 0.88) * i / k))
    for i in range(1, k + 1):
        a = math.pi / 2 * i / k
        pts.append((0.6 + 0.09 * math.cos(a), 1.11 + 0.09 * math.sin(a)))
    m = n(6, 3)
    for i in range(1, m + 1):
        pts.append((0.6 * (1 - i / m), 1.2))
    pts = pts + [(-x, y) for x, y in reversed(pts[:-1])]
    path, rads = [], []
    for x, y in pts:
        t = smoothstep(1.08, 1.18, y)
        zc = -1.97 - 0.07 * smoothstep(0.95, 1.12, y) + 0.02 * t
        path.append((x, y, zc))
        rads.append((0.065 + 0.065 * t, 0.012 - 0.003 * t))
    foil = geo.airfoil(n(20, 10), thick=0.2, camber=0.0)
    sec = [(1 - 2 * u, v / 0.1) for u, v in foil]
    wing = geo.tube('hoop_wing', path, coll, radius=lambda t: rads[round(t * (len(rads) - 1))], role='paint', up=(0.0, 0.0, 1.0), section=sec,
                    sharp=60.0)

    def tilt_up(x, y, z):
        # the blade's trailing edge up 4 degrees
        w = smoothstep(1.13, 1.19, y)
        return x, y + w * max(0.0, -2.02 - z) * 0.07, z

    road.displace(wing, tilt_up)
    return wing


def lip(coll, n):
    """The carbon lip under the nose, 3.5 cm proud of it, wrapping round the corners."""
    pts = run(PLAN, 1.95, True)
    pts = thin(pts, max(1, len(pts) // n(50, 16)))
    rings = []
    for i, (x, z) in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, tz) or 1
        nx, nz = tz / ln, -tx / ln
        if nx * x + nz * (z - 1.0) < 0:
            nx, nz = -nx, -nz
        # (its inside reaches back under the nose's rounded-under front)
        rings.append([(x + nx * o, y, z + nz * o) for o, y in ((0.035, 0.169), (0.04, 0.158), (0.035, 0.147), (-0.15, 0.147), (-0.15, 0.169))])
    return geo.loft('lip', rings, coll, 'carbon', sharp=40.0)


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', REAR_GLASS, 0.045, coll, 'trim', grid=0.03)
    # the big mouth, the fog lamps
    road.pocket(skin, surf, 'front', rrect(0, 0.32, 0.47, 0.085, 0.045), 0.085, coll, 'grille', 'trim', grid=0.015)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', circle(s * 0.72, 0.31, 0.045, n(24, 12)), 0.025, coll, 'head', 'trim', grid=0.01)
    # the smoked tail band, the plate recess (the livery paints the plate)
    road.pocket(skin, surf, 'rear', rrect(0, 0.75, 0.8, 0.07, 0.03), 0.022, coll, 'glass', 'trim', grid=0.015)
    road.pocket(skin, surf, 'rear', rrect(0, 0.47, 0.16, 0.078, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors, a narrower one between the rear wheel wells,
    the glasshouse's inside."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.55, -1.2), (0.56, 0.3, 0.27), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.52, 0.02), (0.8, 0.28, 0.9)), z_range=(-1.6, 0.97), tilt=tilt, wall=0.025, floor=0.7)


def zones(skin, lod):
    """The underbody black, the diffuser carbon, the B-pillar black."""
    pillar = lod != 'lod1'

    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        if y < 0.19:
            return 'trim'
        if z < -1.95 and y < 0.33:
            return 'carbon'
        if pillar and abs(x) > 0.6 and 0.905 < y < 1.18 and abs(z + 0.4) < 0.04:
            return 'trim'
        return None

    road.zones(skin, fn, ys=(0.19, 0.33) + ((0.905, 1.18) if pillar else ()), zs=(-1.95,) + ((-0.44, -0.36) if pillar else ()),
               xs=((0.6,) if pillar else ()))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.37, seat_z=-0.05, floor_y=0.24, dash_z=0.62, dash_y=0.75, dash_w=0.72, wheel_z=0.38, wheel_y=0.77, recline=0.42)
    segs = n(3, 1)
    geo.rbox('rear_seat', (0, 0.34, -0.88), (0.6, 0.06, 0.2), coll, 'interior', r=0.05, segs=segs)
    back = geo.rbox('rear_seat_back', (0, 0, 0), (0.6, 0.24, 0.06), coll, 'interior', r=0.05, segs=segs)
    road._place(back, (0, 0.6, -1.12), 0.35)
