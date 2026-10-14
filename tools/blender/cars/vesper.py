"""VESPER: a 60s European grand tourer. A very long hood with a central bulge between front fenders
that swell up over the wheels, an oval mouth in a chrome ring with one bar across it, round headlamps
set back in scoops in the fender tips behind chrome rims, chrome bumperettes, chrome gills behind the
front wheels, chrome sill trims, mirrors and door pulls, a small bubble glasshouse set far back with
chrome-framed glass, wipers, a chrome fuel cap on the deck, a fastback falling to a cut-off tail with
four round lamps in chrome rings and the plate below them, and twin exhausts. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/vesper.js, retired: see the git
history), re-spaced (see views.densify); the fastback drops into the deck at a clear angle, and the
glass is kept clear of the bubble's fillets.
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.35, 'y': 0.33, 'x': 0.7, 'r': 0.33, 'w': 0.2, 'rim': 0.2},
    'rear': {'z': -1.15, 'y': 0.33, 'x': 0.71, 'r': 0.33, 'w': 0.21, 'rim': 0.2},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [[[0.25, 0.79], [0.27, 0.5], [0.22, 0.24], [-0.68, 0.24], [-0.7, 0.5], [-0.68, 0.82]]],
        'top': [[[-0.6, 0.48], [0.6, 0.48], [0.76, 1.2], [0.6, 2.2], [-0.6, 2.2], [-0.76, 1.2], [-0.6, 0.48]]],
    },
    # `plate`: the licence plate painted into the tail's recess (rear view, metres)
    'livery': {
        'door': [-0.2, 0.55],
        'shoulder': 0.66,
        'cabin': {'x': 0.5, 'z0': -1.85, 'z1': 0.38},
        'plate': {'x': 0, 'y': 0.515, 'w': 0.235, 'h': 0.115, 'text': 'GT 1964'},
    },
    'tailLights': [[0.28, 0.6, -2.15], [-0.28, 0.6, -2.15]],
    'headLights': [[0.51, 0.505, 2.16], [-0.51, 0.505, 2.16]],
    'exhausts': [[0.2, 0.255, -2.2], [-0.2, 0.255, -2.2]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5, 'chrome': 0.7}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.28, 0.21, 1), (2.35, 0.26), (2.39, 0.34), (2.41, 0.42), (2.39, 0.48), (2.33, 0.53), (2.22, 0.57), (2.02, 0.605), (1.7, 0.65), (1.3, 0.7),
    (0.9, 0.745), (0.5, 0.78), (0.1, 0.8), (-0.5, 0.815), (-1.0, 0.83), (-1.5, 0.835), (-1.85, 0.815), (-2.0, 0.78), (-2.1, 0.735), (-2.14, 0.68),
    (-2.15, 0.6), (-2.15, 0.48), (-2.12, 0.36), (-2.06, 0.27), (-1.96, 0.21, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.41), (0.16, 2.395), (0.3, 2.34), (0.44, 2.25), (0.56, 2.12), (0.67, 1.96), (0.76, 1.74), (0.82, 1.5), (0.845, 1.3), (0.835, 1.0),
    (0.82, 0.6), (0.82, 0.0), (0.835, -0.5), (0.86, -0.9), (0.865, -1.2), (0.84, -1.55), (0.76, -1.85), (0.62, -2.03), (0.45, -2.12), (0, -2.15),
]))
# (the fastback stands 2.5 cm proud of the deck at its end, then drops into it at a clear angle)
CAB_SIDE = Outline([
    (0.42, 0.74, 1), (0.36, 0.8), (0.1, 0.96), (-0.12, 1.1), (-0.25, 1.17), (-0.4, 1.22), (-0.6, 1.235), (-0.85, 1.22), (-1.2, 1.12), (-1.5, 0.99),
    (-1.75, 0.87), (-1.86, 0.84), (-1.92, 0.78, 1), (-1.92, 0.7, 1), (0.42, 0.66, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 0.44), (0.25, 0.438), (0.5, 0.43), (0.62, 0.4), (0.66, 0.32), (0.68, 0.0), (0.68, -0.6), (0.66, -1.0), (0.6, -1.4), (0.48, -1.7),
    (0.3, -1.85), (0, -1.9),
]))

# (on the bubble's flank, clear of its fillet above and the body's shoulder below)
DOOR_WIN = [(0.12, 0.845, 1), (-0.1, 0.98), (-0.3, 1.09), (-0.48, 1.135), (-0.62, 1.14, 1), (-0.62, 0.866, 1)]
QUARTER_WIN = [(-0.68, 1.138, 1), (-0.9, 1.11), (-1.2, 1.02), (-1.45, 0.905, 1), (-0.68, 0.868, 1)]
SIDE_WINS = (DOOR_WIN, QUARTER_WIN)
# (kept inside the bubble's fillets: it leans in hard as it rises)
WINDSHIELD = road.rounded([(-0.5, 0.37), (0.5, 0.37), (0.55, 0.28), (0.52, 0.12), (0.42, -0.12), (0.35, -0.25), (-0.35, -0.25), (-0.42, -0.12),
                           (-0.52, 0.12), (-0.55, 0.28)], [0.04, 0.04, 0.06, 0.1, 0.08, 0.05, 0.05, 0.08, 0.1, 0.06])
REAR_GLASS = road.rounded([(-0.34, -0.93), (0.34, -0.93), (0.38, -1.2), (0.32, -1.5), (-0.32, -1.5), (-0.38, -1.2)], [0.04, 0.04, 0.12, 0.06, 0.06, 0.12])
HEAD = (0.51, 0.505)
TAIL_LAMPS = (0.2, 0.36)


def rise(ax, z):
    """The front fenders swell up over the wheels, the hood bulges along the middle and the rear
    haunches rise a little over the rear wheels."""
    front = 0.075 * smoothstep(0.75, 1.15, z) * (1 - smoothstep(1.75, 2.25, z))
    rear = 0.035 * smoothstep(-0.55, -0.9, z) * (1 - smoothstep(-1.45, -1.85, z))
    fender = smoothstep(0.36, 0.64, ax) * (front + rear)
    bulge = 0.028 * (1 - smoothstep(0.12, 0.3, ax)) * smoothstep(0.55, 0.9, z) * (1 - smoothstep(1.9, 2.25, z))
    return fender + bulge


def sec(y, z):
    """Gently barrelled flanks tucked in under the sills."""
    barrel = 1 - 0.055 * min(1.0, ((y - 0.46) / 0.32) ** 2)
    return barrel * (0.94 + 0.06 * smoothstep(0.14, 0.28, y)) if y < 0.28 else barrel


def tilt(y):
    return max(0.0, y - 0.84) * 0.6


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


def ellipse(cu, cv, a, b, n=32):
    return [(cu + a * math.cos(2 * math.pi * i / n), cv + b * math.sin(2 * math.pi * i / n)) for i in range(n)]


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

    counts = (n(16), n(8), (n(22),), n(6), n(8))
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, top=lambda ax, z, yt: yt + rise(ax, z), r_top=0.08, r_bot=0.06, stations=120,
                          counts=counts)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.03, r_top=0.06, stations=80))
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
        for i, win in enumerate(SIDE_WINS):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'chrome', width=0.011, grid=0.04)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('rear_glass', surf, 'top', REAR_GLASS, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, grid=0.04)
        road.frit('rear_frit', surf, 'top', REAR_GLASS, coll, width=0.03, grid=0.04)
        road.ring_panel('windshield_frame', surf, 'top', WINDSHIELD, coll, 'chrome', width=0.01, grid=0.04)
        road.ring_panel('rear_frame', surf, 'top', REAR_GLASS, coll, 'chrome', width=0.01, grid=0.04)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        # the headlamps at the back of their scoops, a chrome rim round each scoop's mouth
        c = (s * HEAD[0], HEAD[1])
        road.disc(f'head_lens_{s}', surf, 'front', c, 0.04, coll, 'lens', depth=0.1, thick=0.006, sides=n(24, 12))
        road.bead(f'head_rim_{s}', surf, 'front', ellipse(*c, 0.066, 0.056, n(28, 12)), coll, 'chrome', radius=0.006, lift=-0.002, per=1, sides=n(6, 4),
                  closed=True)
        # four round tail lamps in chrome rings, a glowing ring in each
        for xc in TAIL_LAMPS:
            t = (s * xc, 0.6)
            road.bead(f'tail_ring_{s}{xc}', surf, 'rear', circle(*t, 0.051, n(24, 10)), coll, 'chrome', radius=0.008, lift=-0.003, per=1,
                      sides=n(6, 4), closed=True)
            road.bead(f'tail_glow_{s}{xc}', surf, 'rear', circle(*t, 0.026, n(20, 8)), coll, 'tailglow', radius=0.005, lift=-0.016, per=1,
                      sides=n(6, 4), closed=True)
    # the oval mouth's chrome ring and its one bar
    road.bead('mouth_ring', surf, 'front', ellipse(0.0, 0.42, 0.24, 0.082, n(40, 16)), coll, 'chrome', radius=0.011, lift=-0.006, per=1,
              sides=n(8, 4), closed=True)
    road.bead('mouth_bar', surf, 'front', [(-0.22, 0.42), (0.22, 0.42)], coll, 'chrome', radius=0.009, lift=-0.02, per=1, sides=n(8, 4))


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    bumperettes(coll, n)
    # chrome bullet mirrors on the doors, twin exhausts under the tail
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.7, 0.8, 0.19), (0.78, 0.89, 0.18), (0.045, 0.032, 0.05), glass_role='glass', body_role='chrome',
                         arm_role='chrome', r=0.03)
        road.exhaust_tip(coll, n, (s * 0.2, 0.255, -2.17), 0.036, 0.16, f'{s}', depth=0.06)
    for view in ('left', 'right'):
        # chrome sill trims between the wheels
        road.ribbon(f'sill_{view}', surf, view, [(0.95, 0.262), (-0.75, 0.262)], coll, 'chrome', width=0.018, depth=0.002, thick=0.006, per=1)
    if lod == 'lod1':
        return
    for view in ('left', 'right'):
        # chrome door pulls, chrome bars across the gills
        road.ribbon(f'pull_{view}', surf, view, [(-0.435, 0.752), (-0.565, 0.752)], coll, 'chrome', width=0.02, depth=0.004, thick=0.012, per=1)
        for yb in (0.49, 0.535, 0.58):
            road.bead(f'gill_bar_{view}{yb}', surf, view, [(0.935, yb), (0.795, yb)], coll, 'chrome', radius=0.008, lift=-0.008, per=1, sides=n(8, 4))
    # the chrome fuel cap on the deck, wipers at the foot of the windshield
    road.disc('fuel_cap', surf, 'top', (-0.58, -1.7), 0.045, coll, 'chrome', depth=-0.004, thick=0.008, sides=n(24, 10))
    road.disc('fuel_cap_hinge', surf, 'top', (-0.58, -1.7), 0.02, coll, 'chrome', depth=-0.008, thick=0.005, sides=n(16, 8))
    for x0, x1 in ((0.36, -0.06), (-0.1, -0.48)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 0.355), (x1, 0.33)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 0.351), (x1, 0.327)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def bumperettes(coll, n):
    """Chrome bumperettes either side of the mouth and round the rear corners, their ends turned back
    into the body."""
    secn = box_section(n(4, 2))
    for name, off, cut, front, y, x0, x1 in (('front', 0.018, 1.95, True, 0.365, 0.26, 0.58), ('rear', 0.016, -1.75, False, 0.42, 0.26, 0.64)):
        pts = run(road.offset_outline(PLAN, off), cut, front)
        for s in (1, -1):
            side = [p for p in pts if x0 <= s * p[0] <= x1]
            k = max(1, len(side) // n(16, 6))
            side = side[::k] + ([side[-1]] if (len(side) - 1) % k else [])
            path = [(x, y, z) for x, z in side]
            for i in (0, -1):
                x, _, z = path[i]
                # (turned in toward the car's middle and back)
                inward = (-0.03 * s if abs(x) < 0.4 else -0.04 * s, 0.0, (-0.03 if front else 0.03))
                end = (x + inward[0], y, z + inward[2])
                if i == 0:
                    path.insert(0, end)
                else:
                    path.append(end)
            geo.tube(f'bumperette_{name}_{s}', path, coll, radius=(0.02, 0.014), role='chrome', section=secn, sharp=60.0)


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', REAR_GLASS, 0.045, coll, 'trim', grid=0.03)
    # the oval mouth, the headlamp scoops (chrome-lined, the lamp at the back)
    road.pocket(skin, surf, 'front', [(*p, 1) for p in ellipse(0.0, 0.42, 0.24, 0.082, n(48, 20))], 0.06, coll, 'grille', 'trim', grid=0.015)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', [(*p, 1) for p in ellipse(s * HEAD[0], HEAD[1], 0.062, 0.052, n(32, 14))], 0.11, coll, 'head', 'chrome',
                    grid=0.012, facing=0.2)
        # the four round tail lamps
        for xc in TAIL_LAMPS:
            road.pocket(skin, surf, 'rear', circle(s * xc, 0.6, 0.045, n(28, 12)), 0.02, coll, 'tail', 'chrome', grid=0.01)
    # the plate recess under the tail lamps (the livery paints the plate)
    road.pocket(skin, surf, 'rear', rrect(0, 0.515, 0.12, 0.06, 0.016), 0.012, coll, 'paint', 'trim', grid=0.015)
    if lod != 'lod1':
        for view in ('left', 'right'):
            # the gills behind the front wheels
            road.pocket(skin, surf, view, rrect(0.865, 0.535, 0.075, 0.075, 0.02), 0.02, coll, 'grille', 'trim', grid=0.012)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors, a narrower one between the rear wheel wells,
    the glasshouse's inside."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.52, -1.08), (0.53, 0.29, 0.34), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.5, -0.2), (0.74, 0.27, 0.55)), z_range=(-1.9, 0.4), tilt=tilt, wall=0.025, floor=0.75)


def zones(skin):
    """The underbody in black."""
    def fn(x, y, z, role, nx, ny, nz):
        return 'trim' if role == 'paint' and y < 0.225 else None

    road.zones(skin, fn, ys=(0.225,))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.33, seat_z=-0.5, floor_y=0.23, dash_z=0.2, dash_y=0.72, dash_w=0.64, wheel_z=-0.04, wheel_y=0.76, recline=0.38)
    # the parcel shelf behind the seats
    geo.rbox('parcel_shelf', (0, 0.83, -1.3), (0.48, 0.012, 0.24), coll, 'interior', r=0.008, segs=n(2, 1))
