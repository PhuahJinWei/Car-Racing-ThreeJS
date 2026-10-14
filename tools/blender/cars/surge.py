"""SURGE: an electric four-door. A smooth closed nose with no grille, a full-width light bar over slim
headlamps with twin projectors, a low intake and air curtains in the bumper corners, a long fastback
glasshouse with a dark glass roof running back into the rear glass, black window frames, gloss-black
mirrors, flush door handles, a charge-port flap, black sills, a small ducktail over a full-width tail
light bar, reverse lamps low in the bumper, the plate in a recess, a black diffuser with fins. No
exhausts. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/surge.js, retired: see the git
history), re-spaced (see views.densify); the fastback drops into the deck at a clear angle, and the
glass is kept clear of the glasshouse's fillets.
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.47, 'y': 0.35, 'x': 0.82, 'r': 0.35, 'w': 0.255, 'rim': 0.265},
    'rear': {'z': -1.47, 'y': 0.35, 'x': 0.82, 'r': 0.35, 'w': 0.265, 'rim': 0.265},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [
            [[0.98, 0.955], [1.0, 0.6], [0.9, 0.27], [-0.48, 0.27], [-0.49, 0.6], [-0.48, 0.995]],
            [[-1.64, 1.04], [-1.66, 0.62], [-1.5, 0.48], [-1.42, 0.27], [-0.48, 0.27]],
        ],
        'top': [[[-0.82, 1.27], [0.82, 1.27], [0.9, 1.7], [0.82, 2.3], [-0.82, 2.3], [-0.9, 1.7], [-0.82, 1.27]]],
        'rear': [[[-0.95, 0.76], [0.95, 0.76]]],
    },
    # `plate`: the licence plate painted into the tail's recess (rear view, metres)
    'livery': {
        'door': [0.0, 0.62],
        'shoulder': 0.84,
        'cabin': {'x': 0.72, 'z0': -2.0, 'z1': 1.24},
        'plate': {'x': 0, 'y': 0.63, 'w': 0.31, 'h': 0.155, 'text': 'EV 2077'},
    },
    'tailLights': [[0.75, 0.905, -2.46], [-0.75, 0.905, -2.46]],
    'headLights': [[0.67, 0.455, 2.45], [-0.67, 0.455, 2.45]],
    # (no exhausts: the game wants one point for its boost effects, hidden under the tail)
    'exhausts': [[0, 0.3, -2.4]],
}

AO_STRENGTH = {'grille': 0.5, 'interior': 0.5}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.28, 0.17, 1), (2.4, 0.21), (2.47, 0.3), (2.49, 0.38), (2.47, 0.45), (2.41, 0.52), (2.3, 0.6), (2.12, 0.67), (1.85, 0.75), (1.55, 0.82),
    (1.25, 0.865), (1.05, 0.885), (0.5, 0.92), (0.1, 0.937), (-0.3, 0.95), (-1.0, 0.975), (-1.6, 0.995), (-2.0, 1.015), (-2.3, 1.03),
    (-2.42, 1.03, 1), (-2.45, 0.95), (-2.47, 0.75), (-2.47, 0.55), (-2.44, 0.38), (-2.38, 0.26), (-2.28, 0.18, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.49), (0.35, 2.475), (0.62, 2.42), (0.8, 2.32), (0.91, 2.17), (0.955, 1.98), (0.97, 1.8), (0.975, 1.5), (0.975, 1.2, 1), (0.975, -1.2, 1),
    (0.975, -1.5), (0.97, -1.8), (0.95, -2.15), (0.88, -2.36), (0.7, -2.45), (0.4, -2.48), (0, -2.49),
]))
# (the fastback stands 3 cm proud of the deck at its end, then drops into it at a clear angle)
CAB_SIDE = Outline([
    (1.3, 0.8, 1), (1.24, 0.88), (1.02, 1.005), (0.8, 1.13), (0.35, 1.36), (0.05, 1.41), (-0.4, 1.425), (-0.8, 1.405), (-1.2, 1.33), (-1.6, 1.2),
    (-1.95, 1.085), (-2.08, 1.05), (-2.14, 0.97, 1), (-2.14, 0.8, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.32), (0.36, 1.318), (0.72, 1.315), (0.83, 1.28), (0.86, 1.18), (0.868, 0.94), (0.875, 0.7, 1), (0.875, -0.4, 1), (0.86, -1.0),
    (0.82, -1.5), (0.72, -1.9), (0.5, -2.12), (0.25, -2.155), (0, -2.16),
]))

# (the door glass starts well behind the A-pillar and keeps 10 cm under the roof line, clear of the
# glasshouse's fillet; its foot follows the rising beltline)
FRONT_WIN = [(0.95, 0.955, 1), (0.37, 1.25, 1), (-0.45, 1.322, 1), (-0.45, 0.995, 1)]
REAR_WIN = [(-0.53, 1.32, 1), (-0.95, 1.282), (-1.38, 1.17), (-1.6, 1.085, 1), (-1.63, 1.04, 1), (-0.53, 1.0, 1)]
SIDE_WINS = (FRONT_WIN, REAR_WIN)
WINDSHIELD = road.rounded([(-0.6, 1.22), (0.6, 1.22), (0.71, 1.12), (0.72, 0.8), (0.63, 0.45), (-0.63, 0.45), (-0.72, 0.8), (-0.71, 1.12)],
                          [0.04, 0.04, 0.1, 0.12, 0.05, 0.05, 0.12, 0.1])
# the dark glass roof, running on back into the rear glass (top view)
CANOPY = road.rounded([(-0.5, 0.33), (0.5, 0.33), (0.6, 0.18), (0.6, -0.6), (0.59, -1.2), (0.54, -1.7), (0.42, -1.96), (-0.42, -1.96), (-0.54, -1.7),
                       (-0.59, -1.2), (-0.6, -0.6), (-0.6, 0.18)], [0.05, 0.05, 0.1, 0.0, 0.2, 0.15, 0.06, 0.06, 0.15, 0.2, 0.0, 0.1])
HEAD_Y = 0.455
BAR_Y = 0.5


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Tucked sills, full flanks, a soft shoulder and tumblehome above it."""
    if y < 0.3:
        return 0.95 + 0.05 * smoothstep(0.15, 0.3, y)
    return 1.0 - ramp(y - 0.84, 0.012) * 0.32


def keys(z):
    """The side split at the shoulder and the sill's tuck, every section alike."""
    yb, yt = SIDE.span_v(z) or (0.18, 0.95)
    return (min(0.84, yt - 0.06), max(0.3, yb + 0.06))


def tilt(y):
    return max(0.0, y - 1.0) * 0.45


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=keys, r_top=0.05, r_bot=0.045, stations=120)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.06, stations=85))
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
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'trim', width=0.012, grid=0.04)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, grid=0.04)


def lamps(coll, n, surf, lod):
    # the light bar across the nose in its slot, the tail light bar under the ducktail
    road.ribbon('light_bar', surf, 'front', [(-0.79, BAR_Y), (0.0, BAR_Y), (0.79, BAR_Y)], coll, 'drl', width=0.011, depth=0.01, thick=0.004, per=8)
    road.ribbon('tail_bar', surf, 'rear', [(-0.87, 0.905), (0.0, 0.905), (0.87, 0.905)], coll, 'tailglow', width=0.016, depth=0.014, thick=0.004,
                per=8)
    for s in (1, -1):
        # twin projectors in each slim headlamp
        for u in (0.6, 0.74):
            road.disc(f'projector_{s}{u}', surf, 'front', (s * u, HEAD_Y), 0.019, coll, 'lens', depth=0.018, thick=0.005, sides=n(20, 10))


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    # gloss-black mirrors on short stalks
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.86, 0.97, 0.9), (1.03, 1.02, 0.86), (0.08, 0.045, 0.05), glass_role='chrome', body_role='trim',
                         arm_role='trim', r=0.035)
    # black fins across the diffuser
    for xf in (-0.45, -0.18, 0.18, 0.45):
        pts = []
        zs = [-2.15 - 0.27 * i / 5 for i in range(6)]
        for z in zs:
            pts.append((z, SIDE.span_v(z)[0] + 0.012, 1))
        for z in reversed(zs):
            pts.append((z - (0.02 if z == zs[-1] else 0.0), max(0.17, SIDE.span_v(z)[0] - 0.07), 1))
        geo.plate(f'diffuser_fin_{xf}', pts, coll, 'trim', plane='x', at=xf, thick=0.012, per=1)
    if lod == 'lod1':
        return
    # wipers parked at the foot of the windshield
    for x0, x1 in ((0.46, -0.06), (-0.1, -0.62)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 1.205), (x1, 1.18)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 1.201), (x1, 1.177)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
    # the dark glass roof, one shallow recess running back into the rear glass
    road.pocket(skin, surf, 'top', CANOPY, 0.008, coll, 'glass', 'trim', grid=0.04)
    # the nose: the light bar's slot, the slim headlamps under its ends, the low intake, air curtains
    road.pocket(skin, surf, 'front', rrect(0, BAR_Y, 0.8, 0.011, 0.008), 0.02, coll, 'head', 'trim', grid=0.008)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', sym(rrect(0.67, HEAD_Y, 0.13, 0.026, 0.02), s), 0.024, coll, 'head', 'trim', grid=0.01)
        road.pocket(skin, surf, 'front', sym(rrect(0.78, 0.33, 0.02, 0.065, 0.012), s), 0.05, coll, 'grille', 'trim', grid=0.01)
        # the reverse lamps low in the bumper
        road.pocket(skin, surf, 'rear', sym(rrect(0.62, 0.4, 0.07, 0.014, 0.008), s), 0.012, coll, 'reverse', 'trim', grid=0.008)
    road.pocket(skin, surf, 'front', rrect(0, 0.28, 0.52, 0.035, 0.02), 0.05, coll, 'grille', 'trim', grid=0.015)
    # the tail light bar's slot, the plate recess (the livery paints the plate)
    road.pocket(skin, surf, 'rear', rrect(0, 0.905, 0.88, 0.022, 0.012), 0.022, coll, 'tail', 'trim', grid=0.01)
    road.pocket(skin, surf, 'rear', rrect(0, 0.63, 0.17, 0.085, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)
    if lod != 'lod1':
        for view in ('left', 'right'):
            # flush door handles: a thin slot toward the back of each door
            for zc in (-0.3, -0.98):
                road.pocket(skin, surf, view, rrect(zc, 0.87, 0.08, 0.012, 0.01), 0.006, coll, 'trim', grid=0.008)
        # the charge-port flap on the left rear fender
        road.pocket(skin, surf, 'left', rrect(-2.0, 0.8, 0.07, 0.05, 0.02), 0.0025, coll, 'paint', 'trim', grid=0.015)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the wheels, a narrower one between the rear wheel wells,
    the glasshouse's inside."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.62, -1.5), (0.6, 0.3, 0.45), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.6, 0.0), (0.88, 0.3, 1.05)), z_range=(-2.1, 1.28), tilt=tilt, wall=0.025, floor=0.8)


def zones(skin):
    """The underbody, the sills between the wheels and the diffuser in black."""
    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        if y < 0.2:
            return 'trim'
        if z < -2.2 and y < 0.3:
            return 'trim'
        if y < 0.27 and abs(x) > 0.85 and abs(z) < 1.0:
            return 'trim'
        return None

    road.zones(skin, fn, ys=(0.2, 0.27, 0.3), zs=(-2.2, -1.0, 1.0), xs=(0.85,))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.42, seat_z=0.0, floor_y=0.3, dash_z=0.86, dash_y=0.8, dash_w=0.82, wheel_z=0.55, wheel_y=0.84, recline=0.32)
    segs = n(3, 1)
    geo.rbox('bench', (0, 0.4, -0.95), (0.74, 0.07, 0.26), coll, 'interior', r=0.05, segs=segs)
    back = geo.rbox('bench_back', (0, 0, 0), (0.74, 0.28, 0.07), coll, 'interior', r=0.05, segs=segs)
    road._place(back, (0, 0.7, -1.24), 0.3)
