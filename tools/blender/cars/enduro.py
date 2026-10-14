"""ENDURO: a 60s endurance racer, barely knee-high. Front fenders rising above a low hood with round
lamps faired into them (a chrome bowl round each lens) and an oval mouth between, a chrome quick-fill
cap on the left fender, a bubble cabin whose doors cut up into the roof, small round chrome mirrors,
wipers, louvres over the engine, scoops ahead of the rear wheels, a long tail cut off square under
a lip, round tail lamps in chrome rims and four pipes. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/enduro.js, retired: see the git
history), re-spaced (see views.densify); the fastback drops into the engine deck at a clear angle,
and the glass and the louvres are kept to the bubble's top and flanks, clear of its fillets.
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.3, 'y': 0.31, 'x': 0.76, 'r': 0.31, 'w': 0.24, 'rim': 0.2},
    'rear': {'z': -1.12, 'y': 0.33, 'x': 0.78, 'r': 0.33, 'w': 0.31, 'rim': 0.2},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y); the door cut-outs carry on
    # across the roof
    'panels': {
        'side': [[[0.8, 0.66], [0.82, 0.3], [-0.42, 0.3], [-0.42, 0.74]]],
        'top': [
            [[0.47, 0.5], [0.47, -0.36]],
            [[-0.47, 0.5], [-0.47, -0.36]],
        ],
    },
    'livery': {
        'door': [0.15, 0.48],
        'shoulder': 0.66,
        'cabin': {'x': 0.55, 'z0': -1.1, 'z1': 0.86},
    },
    'tailLights': [[0.61, 0.56, -2.27], [-0.61, 0.56, -2.27]],
    'headLights': [[0.62, 0.54, 2.1], [-0.62, 0.54, 2.1]],
    'exhausts': [[0.1, 0.37, -2.3], [0.23, 0.37, -2.3], [-0.1, 0.37, -2.3], [-0.23, 0.37, -2.3]],
}

AO_STRENGTH = {'grille': 0.5, 'interior': 0.5, 'chrome': 0.7}

# ------------------------------------------------------------------------------- drawings
# (along the fender crowns: the hood and the engine deck sit lower, see dip)
SIDE = Outline([
    (2.12, 0.17, 1), (2.2, 0.22), (2.245, 0.3), (2.24, 0.37), (2.18, 0.44), (2.02, 0.53), (1.75, 0.63), (1.45, 0.71), (1.3, 0.73), (1.1, 0.73),
    (0.9, 0.71), (0.6, 0.68), (0.3, 0.672), (0.0, 0.67), (-0.3, 0.69), (-0.6, 0.72), (-0.9, 0.77), (-1.12, 0.79), (-1.4, 0.785), (-1.8, 0.76),
    (-2.1, 0.73), (-2.24, 0.71, 1), (-2.26, 0.6), (-2.25, 0.4), (-2.2, 0.28), (-2.1, 0.18, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.25), (0.4, 2.23), (0.66, 2.15), (0.82, 1.98), (0.9, 1.7), (0.91, 1.3), (0.885, 0.9), (0.865, 0.4), (0.865, 0.05), (0.88, -0.3),
    (0.92, -0.9), (0.93, -1.3), (0.92, -1.8), (0.88, -2.15), (0.7, -2.26), (0.35, -2.268), (0, -2.27),
]))
# the bubble cabin (its fastback stands 2.5 cm proud of the engine deck, then drops into it steeply)
CAB_SIDE = Outline([
    (0.92, 0.6, 1), (0.86, 0.66), (0.7, 0.775), (0.55, 0.88), (0.25, 1.0), (0.0, 1.025), (-0.3, 1.03), (-0.5, 1.0), (-0.7, 0.925), (-0.9, 0.85),
    (-1.04, 0.81), (-1.1, 0.74, 1), (-1.1, 0.6, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 0.92), (0.25, 0.915), (0.5, 0.9), (0.62, 0.8), (0.66, 0.4), (0.66, -0.3), (0.62, -0.8), (0.5, -1.1), (0.25, -1.155), (0, -1.17),
]))

# (on the bubble's flank, clear of its fillet above and the body's shoulder below)
DOOR_WIN = road.rounded([(0.62, 0.725), (0.3, 0.875), (-0.3, 0.925), (-0.42, 0.84), (-0.42, 0.71)], [0.0, 0.08, 0.08, 0.04, 0.0])
# (the bubble leans in hard as it rises: the windscreen stays on its top)
WINDSHIELD = road.rounded([(-0.44, 0.83), (0.44, 0.83), (0.51, 0.7), (0.44, 0.4), (0.38, 0.22), (-0.38, 0.22), (-0.44, 0.4), (-0.51, 0.7)],
                          [0.04, 0.04, 0.1, 0.1, 0.05, 0.05, 0.1, 0.1])
LOUVRES = [-0.62 - i * 0.085 for i in range(5)]
LAMP = (0.62, 0.54)
TAIL_LAMPS = (0.5, 0.72)
PIPES = (0.1, 0.23)


def dip(ax, z):
    """The hood and the engine deck sit lower than the fender crowns either side of them."""
    across = 1 - smoothstep(0.3, 0.64, ax)
    front = smoothstep(0.75, 1.15, z) * (1 - smoothstep(1.95, 2.2, z))
    rear = smoothstep(-0.95, -1.35, z) * (1 - smoothstep(-1.9, -2.2, z))
    return across * (0.065 * front + 0.045 * rear)


def sec(y, z):
    """Rounded flanks rolling in toward the fender crowns, tucked in under the sills."""
    if y < 0.28:
        return 0.95 + 0.05 * smoothstep(0.14, 0.28, y)
    return 1.0 - smoothstep(0.5, 0.8, y) * 0.06


def tilt(y):
    return max(0.0, y - 0.7) * 0.6


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


def ellipse(cu, cv, a, b, n=32):
    return [(cu + a * math.cos(2 * math.pi * i / n), cv + b * math.sin(2 * math.pi * i / n), 1) for i in range(n)]


def box_section(n=4, p=0.45):
    pts = []
    for k in range(4 * n):
        t = 2 * math.pi * k / (4 * n)
        c, s = math.cos(t), math.sin(t)
        pts.append((math.copysign(abs(c) ** p, c), math.copysign(abs(s) ** p, s)))
    return pts


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, top=lambda ax, z, yt: yt - dip(ax, z), r_top=0.08, r_bot=0.06, stations=120,
                          counts=(n(16), n(8), (n(22),), n(6), n(8)))
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.025, r_top=0.07, stations=70))
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
        road.panel(f'glass_{view}', surf, view, DOOR_WIN, coll, 'window', depth=d, grid=g)
        if lod != 'lod1':
            road.ring_panel(f'frame_{view}', surf, view, DOOR_WIN, coll, 'chrome', width=0.01, grid=0.04)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, width=0.03, grid=0.04)
        road.ring_panel('windshield_frame', surf, 'top', WINDSHIELD, coll, 'chrome', width=0.01, grid=0.04)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        # the faired lamps: a lens in each chrome bowl
        # (the fender's front is raked well back: the bowl, cut along the view, is shallow measured
        # square to the skin, so the lens sits close under the skin, clear of the bowl's floor)
        road.disc(f'head_lens_{s}', surf, 'front', (s * LAMP[0], LAMP[1]), 0.05, coll, 'lens', depth=0.014, thick=0.006, sides=n(28, 12), facing=0.25)
        # round tail lamps in chrome rims, a glowing ring in each
        for xc in TAIL_LAMPS:
            t = (s * xc, 0.56)
            road.bead(f'tail_rim_{s}{xc}', surf, 'rear', circle(*t, 0.059, n(24, 10)), coll, 'chrome', radius=0.007, lift=-0.002, per=1,
                      sides=n(6, 4), closed=True)
            road.bead(f'tail_glow_{s}{xc}', surf, 'rear', circle(*t, 0.034, n(20, 8)), coll, 'tailglow', radius=0.005, lift=-0.016, per=1,
                      sides=n(6, 4), closed=True)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    tail_lip(coll, n)
    for s in (1, -1):
        # small round chrome mirrors on the doors
        geo.cylinder(f'mirror_stalk_{s}', (s * 0.7, 0.7, 0.62), (s * 0.82, 0.752, 0.606), 0.01, coll, 'chrome', sides=n(8, 4))
        geo.cylinder(f'mirror_{s}', (s * 0.84, 0.76, 0.612), (s * 0.84, 0.76, 0.588), 0.045, coll, 'chrome', sides=n(20, 10))
        geo.cylinder(f'mirror_glass_{s}', (s * 0.84, 0.76, 0.589), (s * 0.84, 0.76, 0.585), 0.038, coll, 'glass', sides=n(20, 10))
        # four pipes out of the tail
        for xc in PIPES:
            road.exhaust_tip(coll, n, (s * xc, 0.37, -2.3), 0.038, 0.14, f'{s}{xc}', depth=0.06)
    # the chrome quick-fill cap on the left front fender
    road.disc('fuel_cap', surf, 'top', (0.63, 0.97), 0.05, coll, 'chrome', depth=-0.004, thick=0.01, sides=n(24, 10))
    road.disc('fuel_cap_lid', surf, 'top', (0.63, 0.97), 0.03, coll, 'chrome', depth=-0.013, thick=0.004, sides=n(20, 8))
    if lod == 'lod1':
        return
    # wipers parked at the foot of the windshield
    for x0, x1 in ((0.3, -0.08), (-0.12, -0.42)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 0.815), (x1, 0.79)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 0.811), (x1, 0.787)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def tail_lip(coll, n):
    """The small lip along the top of the cut-off tail, kicking back over it, its ends turned in."""
    secn = box_section(n(4, 2))
    pts = run(road.offset_outline(PLAN, 0.01), -2.08, False)
    pts = thin(pts, max(1, len(pts) // n(40, 12)))
    path = [(x, 0.725, z) for x, z in pts]
    for i in (0, -1):
        x, _, z = path[i]
        end = (x - math.copysign(0.05, x), 0.715, z + 0.02)
        if i == 0:
            path.insert(0, end)
        else:
            path.append(end)
    return geo.tube('tail_lip', path, coll, radius=(0.02, 0.022), role='paint', section=secn, sharp=60.0)


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            road.pocket(skin, surf, view, DOOR_WIN, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
    # the oval mouth, the lamps' chrome bowls (on the fenders' raked fronts)
    road.pocket(skin, surf, 'front', ellipse(0.0, 0.33, 0.36, 0.075, n(48, 20)), 0.06, coll, 'grille', 'paint', grid=0.015)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', ellipse(s * LAMP[0], LAMP[1], 0.115, 0.07, n(36, 16)), 0.06, coll, 'chrome', grid=0.012, facing=0.25)
        # the round tail lamps
        for xc in TAIL_LAMPS:
            road.pocket(skin, surf, 'rear', circle(s * xc, 0.56, 0.055, n(28, 12)), 0.02, coll, 'tail', 'chrome', grid=0.01)
    # louvres over the engine
    for zs in LOUVRES:
        road.pocket(skin, surf, 'top', rrect(0, zs, 0.36, 0.02, 0.01), 0.03, coll, 'grille', 'trim', grid=0.01)
    for view in ('left', 'right'):
        # the scoops ahead of the rear wheels
        road.pocket(skin, surf, view, rrect(-0.62, 0.49, 0.13, 0.1, 0.04), 0.06, coll, 'grille', 'paint', grid=0.015)


def hollow(coll, n, skin):
    """The cockpit hollowed: a tub between the wheels and the bubble's inside."""
    # (the tub's top stays under the door tops: this car is so low that a deeper one opened the
    # cockpit up under the side glass)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.41, 0.07), (0.76, 0.225, 0.77)), z_range=(-1.06, 0.9), tilt=tilt, wall=0.025,
                floor=0.6)


def zones(skin):
    """The underbody and the chin in black."""
    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        if y < 0.185:
            return 'trim'
        if z > 2.0 and y < 0.24:
            return 'trim'
        return None

    road.zones(skin, fn, ys=(0.185, 0.24), zs=(2.0,))


def cabin_inside(coll, n):
    # (low and well forward: the bubble's fastback falls fast behind the headrests)
    road.cockpit(coll, n, seat_x=0.33, seat_z=0.0, floor_y=0.14, dash_z=0.58, dash_y=0.6, dash_w=0.62, wheel_z=0.34, wheel_y=0.6, recline=0.65)
