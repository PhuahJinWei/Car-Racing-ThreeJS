"""APOGEE: a modern speed-record hypercar. A low nose with a light blade across it over small twin
projector lamps, a wide intake and corner ducts, front fenders cresting over the wheels with the hood
low between them, a teardrop canopy running back into a spine with dark glass over the engine, carbon
mirrors and skirts, side intakes swept back behind the doors, a long tail with twin carbon fins, rear
wheels covered by skirts of the body, a light blade across the tail over the plate, and a deep
diffuser with carbon strakes and two pipes. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/apogee.js, retired: see the git
history), re-spaced (see views.densify); the hood stays sunk under the windscreen's foot, and the
glass is kept to the canopy's top and flanks, clear of its fillets.
"""
import math
from functools import lru_cache

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.5, 'y': 0.34, 'x': 0.84, 'r': 0.34, 'w': 0.27, 'rim': 0.25},
    'rear': {'z': -1.35, 'y': 0.36, 'x': 0.84, 'r': 0.36, 'w': 0.33, 'rim': 0.26},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [[[0.95, 0.74], [0.98, 0.42], [0.9, 0.24], [-0.28, 0.24], [-0.3, 0.6], [-0.62, 0.8]]],
        'top': [[[-0.6, 1.14], [0.6, 1.14], [0.7, 1.7], [0.55, 2.2], [-0.55, 2.2], [-0.7, 1.7], [-0.6, 1.14]]],
    },
    # `plate`: the licence plate painted into the tail's recess (rear view, metres)
    'livery': {
        'door': [0.3, 0.52],
        'shoulder': 0.72,
        'cabin': {'x': 0.58, 'z0': -1.9, 'z1': 1.1},
        'plate': {'x': 0, 'y': 0.48, 'w': 0.31, 'h': 0.155, 'text': 'AP 0GE'},
    },
    'tailLights': [[0.45, 0.655, -2.64], [-0.45, 0.655, -2.64]],
    'headLights': [[0.7, 0.385, 2.32], [-0.7, 0.385, 2.32]],
    'exhausts': [[0.12, 0.31, -2.64], [-0.12, 0.31, -2.64]],
}

AO_STRENGTH = {'grille': 0.5, 'interior': 0.5}

# ------------------------------------------------------------------------------- drawings
# (along the fender crests: the hood and the deck sit lower, see dip)
SIDE = Outline([
    (2.25, 0.15, 1), (2.33, 0.19), (2.37, 0.25), (2.37, 0.31), (2.3, 0.38), (2.1, 0.5), (1.8, 0.66), (1.5, 0.79), (1.2, 0.8), (0.9, 0.77),
    (0.4, 0.75), (0.05, 0.762), (-0.3, 0.78), (-0.9, 0.85), (-1.35, 0.89), (-1.8, 0.88), (-2.2, 0.83), (-2.5, 0.76), (-2.62, 0.72, 1),
    (-2.65, 0.6), (-2.63, 0.45), (-2.55, 0.32), (-2.4, 0.2), (-2.2, 0.15, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.38), (0.4, 2.36), (0.7, 2.28), (0.88, 2.12), (0.97, 1.9), (1.0, 1.6), (1.0, 1.2), (0.94, 0.6), (0.92, 0.0), (0.98, -0.6), (1.05, -1.1),
    (1.06, -1.5), (1.04, -1.9), (0.96, -2.3), (0.82, -2.55), (0.6, -2.64), (0.3, -2.655), (0, -2.66),
]))
# the teardrop canopy, running back into a spine along the tail (which drops steeply into the deck)
CAB_SIDE = Outline([
    (1.15, 0.66, 1), (1.08, 0.73, 1), (0.84, 0.855), (0.6, 0.98), (0.2, 1.1), (-0.2, 1.12), (-0.6, 1.08), (-1.0, 0.99), (-1.5, 0.9), (-1.95, 0.85),
    (-2.0, 0.7, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.16), (0.5, 1.13), (0.64, 1.0), (0.7, 0.5), (0.7, -0.2), (0.62, -0.7), (0.45, -1.2), (0.25, -1.7), (0, -1.98),
]))

# (on the canopy's leaning flank, clear of its fillet above and the body's shoulder below)
SIDE_WIN = road.rounded([(0.7, 0.8), (0.3, 0.97), (-0.2, 1.01), (-0.55, 0.975), (-0.72, 0.9), (-0.6, 0.84)], [0.0, 0.1, 0.12, 0.1, 0.03, 0.0])
WINDSHIELD = road.rounded([(-0.46, 1.04), (0.46, 1.04), (0.55, 0.9), (0.5, 0.5), (0.42, 0.18), (-0.42, 0.18), (-0.5, 0.5), (-0.55, 0.9)],
                          [0.04, 0.04, 0.1, 0.12, 0.05, 0.05, 0.12, 0.1])
ENGINE_GLASS = road.rounded([(-0.38, -0.23), (0.38, -0.23), (0.36, -0.75), (0.22, -1.1), (-0.22, -1.1), (-0.36, -0.75)], [0.04, 0.04, 0.1, 0.06, 0.06, 0.1])
SIDE_INTAKE = road.rounded([(-0.4, 0.371), (-0.4, 0.565), (-0.94, 0.585), (-0.94, 0.479)], 0.035)
FIN = [(-1.45, 0.8, 1), (-2.25, 1.12, 1), (-2.56, 1.13, 1), (-2.6, 0.7, 1), (-1.6, 0.7, 1)]
PROJECTORS = (0.64, 0.76)
BLADE_Y = 0.43


def dip(ax, z):
    """The hood and the deck sit lower than the fender crests either side of them. (The hood stays
    sunk back under the windscreen's foot and rises again under the canopy: rising under the
    windscreen at nearly its rake, the two would seam in a frayed zigzag.)"""
    front = (1 - smoothstep(0.38, 0.74, ax)) * smoothstep(0.55, 0.85, z) * (1 - smoothstep(2.05, 2.3, z))
    rear = (1 - smoothstep(0.5, 0.86, ax)) * smoothstep(-0.7, -1.1, z) * (1 - smoothstep(-2.3, -2.6, z))
    return 0.12 * front + 0.07 * rear


def sec(y, z):
    """Rounded flanks rolling in toward the crests, tucked in under the sills."""
    if y < 0.26:
        return 0.95 + 0.05 * smoothstep(0.13, 0.26, y)
    return 1.0 - smoothstep(0.52, 0.86, y) * 0.07


def tilt(y):
    return max(0.0, y - 0.8) * 0.6


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

    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, top=lambda ax, z, yt: yt - dip(ax, z), r_top=0.07, r_bot=0.05, stations=130,
                          counts=(n(18), n(8), (n(22),), n(6), n(8)))
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.07, stations=80))
    road.wheel_arches(coll, n, skin, {'front': WHEELS['front']}, gap=GAP)
    rear_wells(coll, n, skin)
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


def rear_wells(coll, n, skin):
    """The rear wheel wells: a skirt of the body stays over the outside of each wheel, open only along
    its bottom edge - the well hollowed inside the skin, then a slot cut through it below y 0.25."""
    w = WHEELS['rear']
    R = w['r'] + GAP
    x0 = w['x'] - w['w'] / 2 - 0.04
    for s in (1, -1):
        cut = geo.cylinder(f'rear_well_{s}', (s * x0, w['y'], w['z']), (s * 0.995, w['y'], w['z']), R, coll, 'trim', sides=n(64, 20))
        geo.boolean(skin, cut, sharp=50.0)
        # the circle's segment under y 0.25, through the skirt
        dz = math.sqrt(R * R - (0.25 - w['y']) ** 2)
        a0 = math.atan2(0.25 - w['y'], -dz)
        a1 = math.atan2(0.25 - w['y'], dz)
        arc = []
        k = n(24, 10)
        for i in range(k + 1):
            a = a0 + (a1 - a0) * i / k  # (round under the wheel, through -90 degrees)
            arc.append((w['z'] + R * math.cos(a), w['y'] + R * math.sin(a), 1))
        slot = geo.plate(f'rear_slot_{s}', arc, coll, 'trim', plane='x', at=s * (x0 + 1.6) / 2, thick=1.6 - x0, per=1)
        geo.boolean(skin, slot, sharp=50.0)


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
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, width=0.03, grid=0.04)


def lamps(coll, n, surf, lod):
    # the light blade across the nose in its slot, the light blade across the tail
    road.ribbon('light_blade', surf, 'front', [(-0.83, BLADE_Y), (0.0, BLADE_Y), (0.83, BLADE_Y)], coll, 'drl', width=0.009, depth=0.01, thick=0.004,
                per=8, facing=0.2)
    road.ribbon('tail_blade', surf, 'rear', [(-0.6, 0.655), (0.0, 0.655), (0.6, 0.655)], coll, 'tailglow', width=0.016, depth=0.012, thick=0.004,
                per=8)
    for s in (1, -1):
        # twin projectors in each small lamp under the blade
        for u in PROJECTORS:
            road.disc(f'projector_{s}{u}', surf, 'front', (s * u, 0.385), 0.016, coll, 'lens', depth=0.018, thick=0.004, sides=n(20, 10), facing=0.2)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    for s in (1, -1):
        # the twin carbon fins on the tail
        geo.plate(f'fin_{s}', FIN, coll, 'carbon', plane='x', at=s * 0.6, thick=0.024, per=1)
        # carbon mirrors on stalks from the canopy
        geo.strut(f'mirror_stalk_{s}', (s * 0.64, 0.86, 0.78), (s * 0.87, 0.86, 0.75), coll, width=0.03, thick=0.012, role='carbon', sides=n(10, 6))
        geo.rbox(f'mirror_{s}', (s * 0.93, 0.86, 0.74), (0.075, 0.035, 0.045), coll, 'carbon', r=0.025, segs=segs)
        geo.rbox(f'mirror_glass_{s}', (s * 0.93, 0.86, 0.696), (0.062, 0.026, 0.004), coll, 'chrome', r=0.008, segs=n(2, 1))
        # two pipes in the middle of the diffuser
        road.exhaust_tip(coll, n, (s * 0.12, 0.31, -2.6), 0.042, 0.16, f'{s}', depth=0.07)
        # carbon strakes in the diffuser
        for xf in (0.3, 0.52):
            pts = []
            zs = [-2.2 - 0.44 * i / 6 for i in range(7)]
            for z in zs:
                pts.append((z, SIDE.span_v(z)[0] + 0.012, 1))
            for z in reversed(zs):
                pts.append((z - (0.02 if z == zs[-1] else 0.0), max(0.14, SIDE.span_v(z)[0] - 0.1), 1))
            geo.plate(f'strake_{s}{xf}', pts, coll, 'carbon', plane='x', at=s * xf, thick=0.016, per=1)
    if lod == 'lod1':
        return
    # wipers
    for x0, x1 in ((0.32, -0.08), (-0.12, -0.44)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 1.02), (x1, 0.98)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 1.016), (x1, 0.976)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            road.pocket(skin, surf, view, SIDE_WIN, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
    # the nose: the blade's slot, the small lamps under its ends, the wide intake, the corner ducts
    road.pocket(skin, surf, 'front', rrect(0, BLADE_Y, 0.84, 0.01, 0.008), 0.02, coll, 'head', 'trim', grid=0.008, facing=0.2)
    road.pocket(skin, surf, 'front', rrect(0, 0.26, 0.5, 0.06, 0.03), 0.08, coll, 'grille', 'trim', grid=0.015)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', sym(rrect(0.7, 0.385, 0.11, 0.022, 0.015), s), 0.022, coll, 'head', 'trim', grid=0.008, facing=0.2)
        road.pocket(skin, surf, 'front', sym(rrect(0.82, 0.27, 0.1, 0.06, 0.025), s), 0.08, coll, 'grille', 'trim', grid=0.015, facing=0.2)
    # the tail: the blade's slot, the plate recess (the livery paints the plate)
    road.pocket(skin, surf, 'rear', rrect(0, 0.655, 0.62, 0.016, 0.008), 0.02, coll, 'tail', 'trim', grid=0.008)
    road.pocket(skin, surf, 'rear', rrect(0, 0.48, 0.17, 0.085, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)
    for view in ('left', 'right'):
        # the side intakes behind the doors, swept back and tapering
        road.pocket(skin, surf, view, SIDE_INTAKE, 0.06, coll, 'grille', 'trim', grid=0.015)


def hollow(coll, n, skin):
    """The cockpit hollowed: a tub between the doors and the canopy's inside."""
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.46, 0.2), (0.78, 0.25, 0.88)), z_range=(-0.9, 1.1), tilt=tilt, wall=0.025, floor=0.65)


def zones(skin):
    """The underbody, the splitter and the diffuser in black; carbon side skirts."""
    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        if y < 0.17:
            return 'trim'
        if z > 2.05 and y < 0.2:
            return 'trim'
        if z < -2.2 and y < 0.38:
            return 'trim'
        if y < 0.24 and -0.8 < z < 1.0:
            return 'carbon'
        return None

    road.zones(skin, fn, ys=(0.17, 0.2, 0.24, 0.38), zs=(2.05, 1.0, -0.8, -2.2))


def cabin_inside(coll, n):
    # (low and laid back: the canopy is low over the headrests)
    road.cockpit(coll, n, seat_x=0.34, seat_z=-0.2, floor_y=0.18, dash_z=0.72, dash_y=0.66, dash_w=0.66, wheel_z=0.44, wheel_y=0.66, recline=0.6)
