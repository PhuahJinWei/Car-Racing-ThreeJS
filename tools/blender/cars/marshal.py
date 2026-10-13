"""MARSHAL: a full-size pursuit sedan. A long hood with a big black grille between swept
headlights, fog lamps and a steel push bar with strobes, a segmented roof light bar (red on the
driver's side, blue on the other) with antennas, a pillar spotlight, an upright four-door
glasshouse with door handles and rubber side mouldings, a short trunk with a plate recess, and a
mesh partition behind the front seats. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/marshal.js).
"""
import math

from lib import geo, road
from lib.road import smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.5, 'y': 0.35, 'x': 0.8, 'r': 0.35, 'w': 0.25},
    'rear': {'z': -1.45, 'y': 0.35, 'x': 0.8, 'r': 0.35, 'w': 0.25},
}

META = {
    'wheels': WHEELS,
    'panels': {
        'side': [
            [[0.86, 0.97], [0.88, 0.6], [0.84, 0.27], [-0.45, 0.27], [-0.46, 0.6], [-0.45, 0.985]],
            [[-1.12, 0.99], [-1.12, 0.62], [-1.0, 0.5], [-0.98, 0.27], [-0.45, 0.27]],
            [[1.95, 0.56], [2.5, 0.56]],
            [[-2.0, 0.72], [-2.5, 0.72]],
        ],
        'top': [[[-0.85, 1.02], [0.85, 1.02], [0.9, 1.6], [0.86, 2.4], [-0.86, 2.4], [-0.9, 1.6], [-0.85, 1.02]]],
        'front': [[[-0.9, 0.56], [0.9, 0.56]]],
        'rear': [[[-0.95, 0.72], [0.95, 0.72]]],
    },
    # `patrol`: the doors that go white in the patrol livery and where its lettering sits; `plate`:
    # the licence plate painted into the bumper recess (rear view, metres)
    'livery': {
        'door': [0.2, 0.62],
        'shoulder': 0.86,
        'cabin': {'x': 0.7, 'z0': -1.5, 'z1': 1.0},
        'patrol': {'z0': -1.0, 'z1': 1.06, 'y0': 0.27, 'y1': 0.99, 'text': [0.06, 0.64]},
        'plate': {'x': 0, 'y': 0.5, 'w': 0.31, 'h': 0.155, 'text': 'PD 418'},
    },
    'tailLights': [[0.7, 0.915, -2.5], [-0.7, 0.915, -2.5]],
    'headLights': [[0.7, 0.72, 2.45], [-0.7, 0.72, 2.45]],
    'exhausts': [[0.6, 0.24, -2.57], [-0.6, 0.24, -2.57]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5}

SIDE = Outline([
    (2.35, 0.18, 1), (2.45, 0.2), (2.5, 0.28), (2.515, 0.42), (2.505, 0.56), (2.49, 0.66), (2.47, 0.76, 1), (2.3, 0.8), (1.9, 0.86),
    (1.4, 0.9), (1.0, 0.925), (0.5, 0.94), (-0.3, 0.96), (-1.0, 0.985), (-1.45, 1.0), (-2.0, 1.03), (-2.35, 1.04, 1), (-2.45, 1.0),
    (-2.49, 0.86), (-2.5, 0.72, 1), (-2.52, 0.62), (-2.52, 0.4), (-2.49, 0.26), (-2.38, 0.19, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.52), (0.5, 2.51), (0.78, 2.47), (0.9, 2.38), (0.945, 2.2), (0.955, 1.9), (0.96, 1.4), (0.96, 0.5), (0.96, -0.5), (0.96, -1.4),
    (0.955, -1.9), (0.94, -2.25), (0.88, -2.42), (0.65, -2.5), (0, -2.52),
]))
CAB_SIDE = Outline([
    (1.05, 0.88, 1), (1.0, 0.94), (0.6, 1.16), (0.3, 1.35), (0.1, 1.415), (-0.3, 1.44), (-0.8, 1.43), (-1.0, 1.4), (-1.25, 1.24),
    (-1.5, 1.07), (-1.6, 1.02, 1), (-1.6, 0.8, 1), (1.05, 0.75, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.08), (0.62, 1.07), (0.8, 1.02), (0.855, 0.9), (0.86, 0.6), (0.86, -0.2), (0.85, -0.9), (0.8, -1.35), (0.62, -1.62), (0, -1.65),
]))
FRONT_WIN = [(0.82, 0.975, 1), (0.07, 1.37, 1), (-0.42, 1.385, 1), (-0.42, 0.985, 1)]
REAR_WIN = [(-0.5, 1.385, 1), (-0.92, 1.37), (-1.05, 1.3, 1), (-1.05, 0.99, 1), (-0.5, 0.988, 1)]
QUARTER_WIN = [(-1.12, 1.25, 1), (-1.3, 1.13, 1), (-1.3, 1.0, 1), (-1.12, 0.995, 1)]
# (4.5 cm narrower than the factory's at the sides: the crisper glasshouse leans in sooner, and the
# glass would fold over its roof corners)
WINDSHIELD = mirror_u([(0, 1.02), (0.575, 1.01), (0.695, 0.88), (0.635, 0.45), (0.585, 0.12), (0, 0.09)])
REAR_GLASS = mirror_u([(0, -1.02), (0.6, -1.03), (0.62, -1.3), (0.55, -1.48), (0, -1.51)])
HEAD = [(0.52, 0.665, 1), (0.84, 0.69), (0.9, 0.74, 1), (0.86, 0.775), (0.54, 0.76, 1)]


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Tucked sills, upright flanks, a crisp shoulder crease and tumblehome above it."""
    if y < 0.32:
        return 0.955 + 0.045 * smoothstep(0.15, 0.32, y)
    return 1.0 - ramp(y - 0.88, 0.004) * 0.3


def tilt(y):
    return max(0.0, y - 1.0) * 0.4


def rect(x0, x1, y0, y1):
    return [(x0, y0, 1), (x1, y0, 1), (x1, y1, 1), (x0, y1, 1)]


def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=lambda z: (0.892, 0.32), r_top=0.03, r_bot=0.04)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.025, r_top=0.06))
    # rubber mouldings along the doors, merged before the arches so they end at the wheel openings
    surf = road.Surface([skin])
    for view in ('left', 'right'):
        m = road.ribbon(f'moulding_{view}', surf, view, [(1.08, 0.47), (-1.03, 0.47)], coll, 'trim', width=0.044, depth=0.01, thick=0.019, per=1)
        if m:
            geo.boolean(skin, m, op='UNION', sharp=50.0)
    road.wheel_arches(coll, n, skin, WHEELS)
    surf = road.Surface([skin])
    lamps_and_glass(coll, n, surf, lod)
    police_kit(coll, n, surf, lod)
    # ---- pockets into the solid skin
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in (FRONT_WIN, REAR_WIN, QUARTER_WIN):
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
    # big black grille between the headlights, and an intake across the bumper
    road.pocket(skin, surf, 'front', rect(-0.5, 0.5, 0.6, 0.74), 0.08, coll, 'grille', 'trim', grid=0.03)
    road.pocket(skin, surf, 'front', rect(-0.62, 0.62, 0.28, 0.4), 0.08, coll, 'grille', 'trim', grid=0.03)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', sym(HEAD, s), 0.03, coll, 'head', 'trim', grid=0.012)
        # fog lamps in the bumper corners
        fog = [(s * 0.76 + 0.042 * math.cos(a * math.pi / 6), 0.36 + 0.042 * math.sin(a * math.pi / 6)) for a in range(12)]
        road.pocket(skin, surf, 'front', fog, 0.022, coll, 'head', 'trim', grid=0.012)
        # tail lamps wrapping the rear corners, a clear reverse lamp at the inner end of each
        road.pocket(skin, surf, 'rear', sym(rect(0.56, 1.05, 0.86, 0.97), s), 0.026, coll, 'tail', 'trim', grid=0.012)
        road.pocket(skin, surf, 'rear', sym(rect(0.45, 0.56, 0.86, 0.97), s), 0.026, coll, 'reverse', 'trim', grid=0.012)
    for view in ('left', 'right'):
        road.pocket(skin, surf, view, rect(-2.56, -2.2, 0.86, 0.97), 0.026, coll, 'tail', 'trim', grid=0.012)
        # door handle cups
        if lod != 'lod1':
            for zc in (-0.28, -0.9):
                road.pocket(skin, surf, view, rect(zc - 0.085, zc + 0.085, 0.832, 0.892), 0.014, coll, 'trim', grid=0.01)
    # licence plate recess (the livery paints the plate)
    road.pocket(skin, surf, 'rear', rect(-0.17, 0.17, 0.415, 0.585), 0.012, coll, 'paint', 'trim', grid=0.02)
    # ---- the cabin hollowed: the tub keeps clear of the rear wheel wells
    if lod != 'lod1':
        geo.boolean(skin, geo.rbox('tub_rear', (0, 0.6, -1.205), (0.6, 0.3, 0.245), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
        road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.6, 0.025), (0.88, 0.3, 0.975)), z_range=(-1.45, 1.0), tilt=tilt, floor=0.75)

    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        if y < 0.195:
            return 'trim'
        if z < -2.3 and y < 0.36 and abs(x) < 0.8:
            return 'trim'
        if z > 2.3 and y < 0.25:
            return 'trim'
        return None

    road.zones(skin, fn, ys=(0.195, 0.36, 0.25), zs=(-2.3, 2.3), xs=(0.8,))
    if lod != 'lod1':
        cabin_inside(coll, n)


def lamps_and_glass(coll, n, surf, lod):
    g = 0.04  # (the full model's; it coarsens with the level)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        for i, win in enumerate((FRONT_WIN, REAR_WIN, QUARTER_WIN)):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'surround_{view}{i}', surf, view, win, coll, 'trim', width=0.012)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll)
    road.glass_panel('rear_glass', surf, 'top', REAR_GLASS, coll, grid=g, border=0.014 if lod != 'lod1' else 0)
    # third brake light along the top of the rear glass
    road.ribbon('brake_light', surf, 'rear', [(-0.15, 1.372), (0.15, 1.372)], coll, 'tailglow', width=0.012, depth=-0.002, thick=0.006, per=1)
    for s in (1, -1):
        road.ribbon(f'drl_{s}', surf, 'front', [(s * 0.56, 0.752), (s * 0.72, 0.758), (s * 0.85, 0.765)], coll, 'drl', width=0.009, depth=0.012,
                    thick=0.006, per=n(4, 2))
        for u, v in ((0.62, 0.712), (0.76, 0.722)):
            road.disc(f'head_ring_{s}{u}', surf, 'front', (s * u, v), 0.032, coll, 'chrome', depth=0.026, thick=0.01, sides=n(20, 10))
            road.disc(f'head_lens_{s}{u}', surf, 'front', (s * u, v), 0.026, coll, 'lens', depth=0.018, thick=0.006, sides=n(20, 10))
        road.disc(f'fog_ring_{s}', surf, 'front', (s * 0.76, 0.36), 0.036, coll, 'chrome', depth=0.02, thick=0.008, sides=n(20, 10))
        road.disc(f'fog_lens_{s}', surf, 'front', (s * 0.76, 0.36), 0.028, coll, 'lens', depth=0.014, thick=0.006, sides=n(20, 10))
        road.ribbon(f'tail_bar_{s}', surf, 'rear', [(s * 0.6, 0.93), (s * 0.86, 0.93)], coll, 'tailglow', width=0.016, depth=0.012, thick=0.005, per=1)
        road.ribbon(f'tail_bar_low_{s}', surf, 'rear', [(s * 0.6, 0.888), (s * 0.86, 0.888)], coll, 'tailglow', width=0.008, depth=0.012, thick=0.005, per=1)
    for view in ('left', 'right'):
        # amber markers at the front corners, red ones at the rear
        road.ribbon(f'marker_f_{view}', surf, view, [(2.3, 0.615), (2.18, 0.615)], coll, 'amber', width=0.03, depth=0.0, thick=0.005, per=1)
        road.ribbon(f'marker_r_{view}', surf, view, [(-2.18, 0.6), (-2.3, 0.6)], coll, 'tail', width=0.03, depth=0.0, thick=0.005, per=1)


def police_kit(coll, n, surf, lod):
    segs = n(3, 1)
    # roof light bar: a black base on two feet with end caps; four lamp modules a side (red on the
    # driver's side, blue on the other) round a clear takedown module
    geo.rbox('lightbar_base', (0, 1.483, -0.25), (0.6, 0.03, 0.12), coll, 'trim', r=0.02, segs=segs)
    for s in (1, -1):
        geo.rbox(f'lightbar_foot_{s}', (s * 0.45, 1.445, -0.25), (0.06, 0.03, 0.08), coll, 'trim', r=0.015, segs=segs)
        geo.rbox(f'lightbar_cap_{s}', (s * 0.6, 1.522, -0.25), (0.035, 0.058, 0.125), coll, 'trim', r=0.03, segs=segs)
        for i in range(4):
            geo.rbox(f'beacon_{s}{i}', (s * (0.155 + i * 0.11), 1.543, -0.25), (0.05, 0.03, 0.108), coll, 'beaconR' if s > 0 else 'beaconB',
                     r=0.016, segs=segs)
    geo.rbox('lightbar_takedown', (0, 1.54, -0.25), (0.095, 0.027, 0.104), coll, 'head', r=0.015, segs=segs)
    # radio antennas: two pucks behind the light bar and a short whip at the back of the roof
    for s in (1, -1):
        geo.cylinder(f'antenna_puck_{s}', (s * 0.28, 1.43, -0.72), (s * 0.28, 1.458, -0.72), 0.032, coll, 'trim', sides=n(16, 8))
    geo.cylinder('antenna_base', (0, 1.42, -0.9), (0, 1.44, -0.9), 0.018, coll, 'trim', sides=n(12, 6))
    geo.cylinder('antenna_whip', (0, 1.43, -0.9), (0, 1.66, -0.95), 0.0075, coll, 'trim', sides=n(8, 4))
    # a spotlight on the driver's windshield pillar
    geo.cylinder('spot_arm', (0.78, 1.1, 0.7), (0.87, 1.1, 0.71), 0.012, coll, 'chrome', sides=n(10, 6))
    geo.cylinder('spot_body', (0.89, 1.1, 0.665), (0.89, 1.1, 0.775), 0.058, coll, 'chrome', sides=n(20, 10))
    geo.cylinder('spot_face', (0.89, 1.1, 0.772), (0.89, 1.1, 0.782), 0.046, coll, 'head', sides=n(20, 10))
    # door mirrors
    for s in (1, -1):
        geo.strut(f'mirror_stalk_{s}', (s * 0.84, 0.99, 0.88), (s * 0.99, 1.02, 0.865), coll, width=0.034, thick=0.024, role='trim', sides=n(10, 6))
        geo.rbox(f'mirror_{s}', (s * 1.04, 1.035, 0.86), (0.085, 0.055, 0.045), coll, 'trim', r=0.03, segs=segs)
        geo.rbox(f'mirror_glass_{s}', (s * 1.04, 1.035, 0.814), (0.07, 0.042, 0.004), coll, 'chrome', r=0.01, segs=n(2, 1))
        # twin exhausts under the rear bumper
        road.exhaust_tip(coll, n, (s * 0.6, 0.24, -2.57), 0.045, 0.16, f'{s}')
    # steel push bar: two uprights, two cross bars, mounts into the bumper, strobes on the top rail
    for s in (1, -1):
        geo.rbox(f'pushbar_up_{s}', (s * 0.36, 0.55, 2.6), (0.034, 0.3, 0.034), coll, 'trim', r=0.014, segs=segs)
        geo.rbox(f'pushbar_mount_{s}', (s * 0.36, 0.42, 2.52), (0.026, 0.026, 0.09), coll, 'trim', r=0.01, segs=segs)
        geo.rbox(f'strobe_{s}', (s * 0.2, 0.74, 2.648), (0.055, 0.016, 0.01), coll, 'beaconR' if s > 0 else 'beaconB', r=0.006, segs=n(2, 1))
    for y in (0.74, 0.42):
        geo.rbox(f'pushbar_bar_{y}', (0, y, 2.615), (0.4, 0.028, 0.028), coll, 'trim', r=0.02, segs=segs)
    # the grille's black crossbar, inside it
    road.ribbon('grille_bar', surf, 'front', [(-0.5, 0.67), (0.5, 0.67)], coll, 'trim', width=0.018, depth=0.07, thick=0.058, per=1)
    if lod == 'lod1':
        return
    # pull handles in the door cups
    for view in ('left', 'right'):
        for zc in (-0.28, -0.9):
            road.ribbon(f'handle_{view}{zc}', surf, view, [(zc + 0.072, 0.866), (zc - 0.072, 0.866)], coll, 'trim', width=0.022, depth=0.016,
                        thick=0.021, per=1)
    # trunk lid shut lines: across the deck behind the rear glass, along both sides, down the tail
    road.bead('lid_front', surf, 'top', [(-0.78, -1.66), (0.78, -1.66)], coll, 'trim', radius=0.004, lift=-0.0025, per=1, sides=4)
    for s in (1, -1):
        road.bead(f'lid_side_{s}', surf, 'top', [(s * 0.78, -1.66), (s * 0.78, -2.36)], coll, 'trim', radius=0.004, lift=-0.0025, per=1, sides=4)
        road.bead(f'lid_tail_{s}', surf, 'rear', [(s * 0.44, 1.0), (s * 0.44, 0.725)], coll, 'trim', radius=0.004, lift=-0.0025, per=1, sides=4)
    road.bead('lid_low', surf, 'rear', [(-0.44, 0.725), (0.44, 0.725)], coll, 'trim', radius=0.004, lift=-0.0025, per=1, sides=4)
    # wipers along the bottom of the windscreen
    for x0, x1, tag in ((0.55, -0.15, 'l'), (0.0, -0.66, 'r')):
        road.bead(f'wiper_arm_{tag}', surf, 'top', [(x0, 1.0), (x1, 0.95)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{tag}', surf, 'top', [(x0 - 0.1, 0.995), (x1, 0.946)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.42, seat_z=0.05, floor_y=0.3, dash_z=0.74, dash_y=0.84, dash_w=0.82, wheel_z=0.52, wheel_y=0.86, recline=0.3)
    segs = n(3, 1)
    # a bench in the back behind a mesh partition
    geo.rbox('bench', (0, 0.4, -0.85), (0.74, 0.07, 0.26), coll, 'interior', r=0.05, segs=segs)
    geo.rbox('bench_back', (0, 0.72, -1.12), (0.74, 0.3, 0.07), coll, 'interior', r=0.05, segs=segs)
    geo.rbox('partition', (0, 0.95, -0.3), (0.72, 0.36, 0.008), coll, 'grille', r=0.006, segs=n(2, 1))
    geo.rbox('partition_frame', (0, 1.3, -0.3), (0.74, 0.02, 0.016), coll, 'trim', r=0.008, segs=n(2, 1))
