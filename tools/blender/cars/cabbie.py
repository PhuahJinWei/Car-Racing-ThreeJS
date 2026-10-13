"""CABBIE: a 2000s city taxi. A big four-door saloon: a lit TAXI sign on the roof on a black base
and a radio whip on the trunk, headlamp units with two chrome bowls round their bulbs either side of
a chrome-ringed grille with three bars and a blank badge, amber corner lamps, an intake low down with
fog lamps in chrome rings, side repeaters, wipers, black window frames, pillars and belt moulding,
black rub strips along the doors and round both bumpers, a fuel flap, tall tail lamps (amber, red
and clear) either side of a red reflector band, a chrome garnish over the plate, a third brake lamp
behind the rear glass, a taximeter on the dash and a single exhaust. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/cabbie.js), re-spaced (see
views.densify).
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.5, 'y': 0.34, 'x': 0.8, 'r': 0.34, 'w': 0.235, 'rim': 0.21},
    'rear': {'z': -1.42, 'y': 0.34, 'x': 0.8, 'r': 0.34, 'w': 0.235, 'rim': 0.21},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [
            [[0.98, 0.86], [1.0, 0.6], [0.96, 0.25], [-0.36, 0.25], [-0.37, 0.6], [-0.36, 0.89]],
            [[-0.36, 0.25], [-1.0, 0.25], [-1.02, 0.6], [-1.02, 0.9]],
        ],
        'top': [
            [[-0.82, 1.06], [0.82, 1.06], [0.9, 1.7], [0.86, 2.55], [-0.86, 2.55], [-0.9, 1.7], [-0.82, 1.06]],
            [[-0.72, -1.68], [0.72, -1.68], [0.8, -2.55], [-0.8, -2.55], [-0.72, -1.68]],
        ],
        # the hood's front edge and the bumper's top over the rub strip; the trunk lid's edge and
        # the rear bumper's top
        'front': [[[-0.86, 0.71], [0.86, 0.71]], [[-0.96, 0.5], [0.96, 0.5]]],
        'rear': [[[-0.68, 0.86], [0.68, 0.86]], [[-0.96, 0.465], [0.96, 0.465]]],
    },
    # `taxi`: where the taxi livery's checker band runs (side view); `plate`: the licence plate
    # painted into its recess on the tail panel (rear view, metres)
    'livery': {
        'door': [0.3, 0.65],
        'shoulder': 0.8,
        'cabin': {'x': 0.75, 'z0': -1.6, 'z1': 1.0},
        'taxi': {'z0': -1.9, 'z1': 2.0, 'y': 0.655},
        'plate': {'x': 0, 'y': 0.555, 'w': 0.3, 'h': 0.15, 'text': 'TX 2004'},
    },
    'tailLights': [[0.79, 0.71, -2.7], [-0.79, 0.71, -2.7]],
    'headLights': [[0.64, 0.605, 2.69], [-0.64, 0.605, 2.69]],
    'exhausts': [[-0.56, 0.24, -2.75]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.6, 0.22, 1), (2.68, 0.3), (2.7, 0.45), (2.69, 0.6), (2.64, 0.72), (2.3, 0.77), (1.8, 0.8), (1.4, 0.827), (1.0, 0.85), (0.5, 0.866),
    (0.0, 0.88), (-0.6, 0.89), (-1.2, 0.9), (-1.7, 0.92), (-2.1, 0.928), (-2.35, 0.93), (-2.55, 0.92), (-2.66, 0.85), (-2.7, 0.6),
    (-2.69, 0.4), (-2.62, 0.28), (-2.5, 0.22, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.7), (0.35, 2.698), (0.6, 2.69), (0.82, 2.64), (0.94, 2.52), (0.975, 2.3), (0.98, 1.9, 1), (0.98, -1.9, 1), (0.975, -2.3),
    (0.94, -2.55), (0.8, -2.66), (0.55, -2.69), (0.25, -2.7), (0, -2.7),
]))
CAB_SIDE = Outline([
    (1.05, 0.82, 1), (1.0, 0.87, 1), (0.68, 1.125), (0.35, 1.38), (0.2, 1.435), (-0.1, 1.448), (-0.4, 1.455), (-0.85, 1.45), (-1.05, 1.41),
    (-1.25, 1.255), (-1.45, 1.1), (-1.62, 0.93, 1), (-1.62, 0.78, 1), (1.05, 0.76, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.06), (0.35, 1.058), (0.68, 1.05), (0.82, 1.0), (0.86, 0.9, 1), (0.86, -1.0, 1), (0.85, -1.18), (0.82, -1.36), (0.76, -1.52),
    (0.62, -1.61), (0.35, -1.638), (0, -1.64),
]))

FRONT_WIN = [(0.86, 0.95, 1), (0.33, 1.36), (0.18, 1.39, 1), (-0.32, 1.395, 1), (-0.32, 0.955, 1)]
REAR_WIN = [(-0.4, 1.395, 1), (-0.88, 1.39), (-1.02, 1.32, 1), (-1.02, 0.96, 1), (-0.4, 0.956, 1)]
QUARTER_WIN = [(-1.09, 1.27, 1), (-1.3, 1.11, 1), (-1.3, 0.965, 1), (-1.09, 0.962, 1)]
SIDE_WINS = (FRONT_WIN, REAR_WIN, QUARTER_WIN)
# (kept inside the A-pillars' fillets, see marshal.py)
WINDSHIELD = mirror_u([(0, 1.0), (0.66, 0.995), (0.745, 0.945), (0.755, 0.8), (0.725, 0.6), (0.67, 0.42), (0.64, 0.37), (0, 0.36)])
BACKLIGHT = [(-0.6, 0.965, 1), (0.6, 0.965, 1), (0.63, 1.02), (0.63, 1.3), (0.58, 1.385, 1), (-0.58, 1.385, 1), (-0.63, 1.3), (-0.63, 1.02)]
# tall tail lamps in the rear corners (off the corners' side-facing halves, see mochi.py)
TAIL = rrect(0.79, 0.7, 0.11, 0.14, 0.03)
TAIL_TOP, TAIL_LOW = 0.79, 0.63
SIGN_Z = -0.165
# the word TAXI as strokes (u across as it reads, v up), 10 cm tall
TAXI = [(-0.195, 0.045, -0.115, 0.045), (-0.155, 0.045, -0.155, -0.05), (-0.075, -0.05, -0.04, 0.05), (-0.04, 0.05, -0.005, -0.05),
        (-0.06, -0.012, -0.02, -0.012), (0.04, 0.05, 0.115, -0.05), (0.04, -0.05, 0.115, 0.05), (0.195, 0.05, 0.195, -0.05)]


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Gently barrelled flanks tucked in at the sills, a soft crease at the beltline."""
    barrel = 1 - 0.025 * min(1.0, ((y - 0.55) / 0.3) ** 2)
    if y < 0.3:
        return barrel * (0.955 + 0.045 * smoothstep(0.2, 0.3, y))
    return barrel * (1.0 - ramp(y - 0.86, 0.008) * 0.3)


def tilt(y):
    return max(0.0, y - 0.9) * 0.3


def belt(z):
    """The top of the black belt moulding (just under the body's top edge, rising to the tail)."""
    return 0.868 - 0.0233 * z


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


def strip_section(n=4):
    pts = []
    for k in range(4 * n):
        t = 2 * math.pi * k / (4 * n)
        c, s = math.cos(t), math.sin(t)
        pts.append((math.copysign(abs(c) ** 0.5, c), math.copysign(abs(s) ** 0.5, s)))
    return pts


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=lambda z: (0.868, 0.3), r_top=0.028, r_bot=0.04)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.05))
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
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'trim', width=0.013)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('backlight', surf, 'rear', BACKLIGHT, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll)
        road.frit('backlight_frit', surf, 'rear', BACKLIGHT, coll, width=0.03)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        # headlamp units: a lens in each chrome bowl
        for u, r in ((0.55, 0.042), (0.73, 0.046)):
            road.disc(f'head_lens_{s}{u}', surf, 'front', (s * u, 0.605), r, coll, 'lens', depth=0.034, thick=0.006, sides=n(24, 12))
        # fog lamps in chrome rings
        road.bead(f'fog_ring_{s}', surf, 'front', circle(s * 0.7, 0.31, 0.037, n(20, 10)), coll, 'chrome', radius=0.005, lift=0.0, per=1,
                  sides=n(6, 4), closed=True)
        road.disc(f'fog_lens_{s}', surf, 'front', (s * 0.7, 0.31), 0.028, coll, 'lens', depth=0.014, thick=0.005, sides=n(20, 10))
        # the tail lamps: clear and amber inserts on the red lamp's floor, black dividers, a bright bar
        road.panel(f'tail_reverse_{s}', surf, 'rear', sym([(0.68, TAIL_LOW, 1), (0.9, TAIL_LOW, 1), (0.9, 0.56, 1), (0.68, 0.56, 1)], s), coll,
                   'reverse', depth=0.007, thick=0.002, grid=0.02)
        road.panel(f'tail_amber_{s}', surf, 'rear', sym([(0.68, TAIL_TOP, 1), (0.9, TAIL_TOP, 1), (0.9, 0.84, 1), (0.68, 0.84, 1)], s), coll,
                   'indicator', depth=0.007, thick=0.002, grid=0.02)
        for yd in (TAIL_LOW, TAIL_TOP):
            road.ribbon(f'tail_divider_{s}{yd}', surf, 'rear', [(s * 0.68, yd), (s * 0.9, yd)], coll, 'trim', width=0.006, depth=0.008, thick=0.004,
                        per=1)
        road.ribbon(f'tail_glow_{s}', surf, 'rear', [(s * 0.72, 0.71), (s * 0.88, 0.71)], coll, 'tailglow', width=0.03, depth=0.007, thick=0.003,
                    per=1)
    # the grille: a half-sunk chrome ring round it, three round bars, a blank badge plate
    road.bead('grille_ring', surf, 'front', rrect(0, 0.6, 0.36, 0.07, 0.05, n(5, 2)), coll, 'chrome', radius=0.011, lift=-0.006, per=2,
              sides=n(10, 6), closed=True)
    for yb in (0.565, 0.6, 0.635):
        road.bead(f'grille_bar_{yb}', surf, 'front', [(-0.345, yb), (0.345, yb)], coll, 'chrome', radius=0.008, lift=-0.014, per=1, sides=n(8, 4))
    road.panel('badge', surf, 'front', rrect(0, 0.6, 0.05, 0.026, 0.012), coll, 'chrome', depth=-0.003, thick=0.03, grid=0.01)
    # the third brake lamp behind the foot of the rear glass (inside the cabin)
    if lod != 'lod1':
        geo.rbox('brake_lamp_housing', (0, 0.985, -1.535), (0.2, 0.018, 0.02), coll, 'trim', r=0.008, segs=n(2, 1))
        geo.rbox('brake_lamp', (0, 0.985, -1.557), (0.18, 0.008, 0.002), coll, 'tailglow', r=0.002, segs=1)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    # the roof sign: a lit box on a black base, TAXI in black on its front and back
    h = surf.project('top', 0.0, SIGN_Z)
    ry = h[0][1] if h else 1.45
    geo.rbox('sign_base', (0, ry + 0.012, SIGN_Z), (0.34, 0.022, 0.11), coll, 'trim', r=0.012, segs=segs)
    geo.rbox('sign', (0, ry + 0.145, SIGN_Z), (0.42, 0.115, 0.085), coll, 'amber', r=0.035, segs=segs)
    for face, sgn in (('front', 1), ('back', -1)):
        zf = SIGN_Z + sgn * 0.087
        for i, (a, b, c, d) in enumerate(TAXI):
            geo.strut(f'sign_{face}_{i}', (sgn * (a + 0.0), ry + 0.145 + b, zf), (sgn * c, ry + 0.145 + d, zf), coll, width=0.018, thick=0.004,
                      role='trim', up=(0.0, 0.0, 1.0), sides=n(6, 4))
    # rub strips: along the doors, and round both bumpers (the plan grown 1 cm)
    for view in ('left', 'right'):
        road.ribbon(f'rub_{view}', surf, view, [(1.08, 0.54), (-1.0, 0.54)], coll, 'trim', width=0.044, depth=0.004, thick=0.013, per=1)
    plan = road.offset_outline(PLAN, 0.004)
    secn = strip_section(n(4, 2))
    for name, cut, front in (('rub_front', 2.3, True), ('rub_rear', -2.3, False)):
        pts = run(plan, cut, front)
        step = max(1, len(pts) // n(60, 20))
        path = [(x, 0.4, z) for x, z in pts[::step]] + [(pts[-1][0], 0.4, pts[-1][1])]
        geo.tube(name, path, coll, radius=(0.035, 0.012), role='trim', section=secn, sharp=60.0)
    # black mirrors on the door tops
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.84, 0.95, 0.87), (0.99, 1.0, 0.85), (0.075, 0.05, 0.04), glass_role='chrome', body_role='trim',
                         arm_role='trim', r=0.02)
    # one exhaust under the right of the rear bumper, the radio whip on the right of the trunk
    road.exhaust_tip(coll, n, (-0.56, 0.24, -2.745), 0.03, 0.14, 'tip', depth=0.06)
    h = surf.project('top', -0.55, -2.25)
    if h:
        p = h[0]
        geo.rbox('whip_base', (p[0], p[1] + 0.006, p[2]), (0.02, 0.012, 0.02), coll, 'trim', r=0.008, segs=n(2, 1))
        geo.cylinder('whip', (p[0], p[1] + 0.01, p[2]), (p[0], p[1] + 0.54, p[2] - 0.08), 0.0045, coll, 'trim', sides=n(6, 4))
    # the chrome garnish over the plate, the trunk lock in it
    road.panel('garnish', surf, 'rear', rrect(0, 0.66, 0.3, 0.014, 0.008), coll, 'chrome', depth=-0.004, thick=0.008, grid=0.02)
    road.disc('trunk_lock', surf, 'rear', (0.0, 0.66), 0.011, coll, 'trim', depth=-0.007, thick=0.004, sides=n(12, 6))
    if lod == 'lod1':
        return
    # door pulls, wipers
    for view in ('left', 'right'):
        for zc in (0.25, -0.62):
            road.ribbon(f'pull_{view}{zc}', surf, view, [(zc + 0.055, 0.82), (zc - 0.055, 0.82)], coll, 'trim', width=0.018, depth=0.012,
                        thick=0.017, per=1)
    for x0, x1 in ((0.42, -0.08), (-0.12, -0.6)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 0.985), (x1, 0.96)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 0.98), (x1, 0.957)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'rear', BACKLIGHT, 0.045, coll, 'trim', grid=0.03)
    road.pocket(skin, surf, 'front', rrect(0, 0.6, 0.36, 0.07, 0.05), 0.04, coll, 'grille', 'chrome', grid=0.015)
    for s in (1, -1):
        # headlamp units: a chrome housing, a deeper chrome bowl round each bulb
        road.pocket(skin, surf, 'front', sym(rrect(0.64, 0.605, 0.21, 0.072, 0.035), s), 0.03, coll, 'chrome', 'trim', grid=0.012)
        if lod != 'lod1':
            for u, r in ((0.55, 0.058), (0.73, 0.062)):
                road.pocket(skin, surf, 'front', circle(s * u, 0.605, r, n(28, 14)), 0.05, coll, 'chrome', grid=0.012)
        road.pocket(skin, surf, 'front', sym(rrect(0.9, 0.6, 0.05, 0.05, 0.02), s), 0.012, coll, 'amber', 'trim', grid=0.01)
        road.pocket(skin, surf, 'front', circle(s * 0.7, 0.31, 0.034, n(20, 10)), 0.02, coll, 'head', 'chrome', grid=0.01)
        road.pocket(skin, surf, 'rear', sym(TAIL, s), 0.01, coll, 'tail', 'trim', grid=0.012)
    road.pocket(skin, surf, 'front', rrect(0, 0.32, 0.5, 0.03, 0.02), 0.025, coll, 'grille', 'trim', grid=0.015)
    # the red reflector band between the tail lamps, the plate recess (the livery paints the plate)
    road.pocket(skin, surf, 'rear', rrect(0, 0.74, 0.66, 0.04, 0.01), 0.008, coll, 'tail', 'trim', grid=0.015)
    road.pocket(skin, surf, 'rear', rrect(0, 0.555, 0.155, 0.075, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)
    for view in ('left', 'right'):
        if lod != 'lod1':
            road.pocket(skin, surf, view, rrect(1.1, 0.72, 0.026, 0.011, 0.01), 0.005, coll, 'indicator', 'trim', grid=0.01)
            for zc in (0.25, -0.62):
                road.pocket(skin, surf, view, rrect(zc, 0.82, 0.07, 0.02, 0.012), 0.012, coll, 'trim', grid=0.01)
        else:
            road.panel(f'repeater_{view}', surf, view, rrect(1.1, 0.72, 0.026, 0.011, 0.01), coll, 'indicator', depth=-0.002, thick=0.004, grid=0.02)
    if lod != 'lod1':
        road.pocket(skin, surf, 'right', rrect(-1.95, 0.75, 0.06, 0.055, 0.02), 0.0025, coll, 'paint', 'trim', grid=0.015)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors, a narrower one between the rear wheel wells,
    the glasshouse's inside."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.6, -1.3), (0.58, 0.32, 0.29), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.565, 0.0), (0.88, 0.285, 0.97)), z_range=(-1.58, 0.96), tilt=tilt, wall=0.025,
                floor=0.7)


def zones(skin, lod):
    """The underbody, the black belt moulding along the foot of the side glass, the black pillars."""
    pillars = lod != 'lod1'

    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        ax = abs(x)
        if y < 0.235:
            return 'trim'
        if ax > 0.78 and -1.62 < z < 0.98 and belt(z) < y < 0.955:
            return 'trim'
        if pillars and ax > 0.7 and 0.955 < y < 1.405 and (abs(z + 0.36) < 0.045 or abs(z + 1.055) < 0.04):
            return 'trim'
        return None

    road.slice_plane(skin, (0, belt(0.0), 0), (0, 1, 0.0233))
    road.zones(skin, fn, ys=(0.235, 0.955) + ((1.405,) if pillars else ()),
               zs=(-1.62, 0.98) + ((-0.405, -0.315, -1.095, -1.015) if pillars else ()), xs=(0.78,) + ((0.7,) if pillars else ()))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.42, seat_z=0.12, floor_y=0.28, dash_z=0.78, dash_y=0.8, dash_w=0.82, wheel_z=0.55, wheel_y=0.86, recline=0.28)
    segs = n(3, 1)
    geo.rbox('bench', (0, 0.4, -0.8), (0.76, 0.07, 0.26), coll, 'interior', r=0.05, segs=segs)
    back = geo.rbox('bench_back', (0, 0, 0), (0.76, 0.28, 0.07), coll, 'interior', r=0.05, segs=segs)
    road._place(back, (0, 0.7, -1.08), 0.22)
    # the taximeter on the dash, its red display facing the driver
    geo.rbox('meter', (0.0, 0.9, 0.72), (0.08, 0.025, 0.04), coll, 'trim', r=0.01, segs=n(2, 1))
    geo.rbox('meter_display', (0.0, 0.905, 0.679), (0.055, 0.012, 0.002), coll, 'tailglow', r=0.002, segs=1)
