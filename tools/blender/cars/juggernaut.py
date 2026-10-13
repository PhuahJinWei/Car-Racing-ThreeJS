"""JUGGERNAUT: a lifted off-road pickup. A crew cab on 35-inch tyres under black box flares, a tall
square nose with a big black grille, three amber marker lamps in it and LED headlamps, a steel
bumper with fog lamps and tow hooks over a skid plate, amber clearance lamps and an LED bar on the
roof, a sport bar with two lamps over a ribbed bed, tall tail lamps on the bed corners, side steps,
mud flaps, and the axles and frame showing under the lift. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/juggernaut.js).
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.72, 'y': 0.44, 'x': 0.86, 'r': 0.44, 'w': 0.34},
    'rear': {'z': -1.66, 'y': 0.44, 'x': 0.86, 'r': 0.44, 'w': 0.34},
}
GAP = 0.05

META = {
    'wheels': WHEELS,
    'panels': {
        'side': [[[1.0, 1.46], [1.0, 0.72], [0.08, 0.72], [0.08, 1.46]], [[0.08, 0.72], [-0.66, 0.72], [-0.66, 1.46]]],
        'top': [[[-0.86, 1.26], [0.86, 1.26], [0.9, 2.7], [-0.9, 2.7], [-0.86, 1.26]]],
        'rear': [[[-0.8, 1.42], [0.8, 1.42]]],
    },
    'livery': {
        'door': [0.55, 1.1],
        'shoulder': 1.3,
        'cabin': {'x': 0.82, 'z0': -0.7, 'z1': 1.15},
        'plate': {'x': 0, 'y': 0.95, 'w': 0.3, 'h': 0.15, 'text': 'BIG 4X4'},
    },
    'tailLights': [[0.885, 1.22, -2.63], [-0.885, 1.22, -2.63]],
    'headLights': [[0.78, 1.2, 2.84], [-0.78, 1.2, 2.84]],
    'exhausts': [[-0.6, 0.6, -2.73]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5}

# (straight runs end on sharp points: a short segment beside a long one overshoots, see views.densify)
SIDE = Outline([
    (2.75, 0.68, 1), (2.82, 0.74), (2.84, 0.85), (2.84, 1.08), (2.84, 1.3), (2.82, 1.37), (2.76, 1.41, 1), (2.2, 1.43), (1.5, 1.45), (1.2, 1.46),
    (0.0, 1.47), (-2.55, 1.47, 1), (-2.6, 1.46, 1), (-2.62, 1.4), (-2.622, 1.25), (-2.62, 0.78), (-2.58, 0.7), (-2.5, 0.68, 1),
])
PLAN = Outline(mirror_u([(0, 2.84), (0.4, 2.84), (0.8, 2.835), (0.9, 2.8), (0.94, 2.7), (0.95, 2.4, 1), (0.95, -2.5, 1), (0.93, -2.6), (0.85, -2.62),
                         (0.45, -2.62), (0, -2.62)]))
CAB_SIDE = Outline([(1.22, 1.4, 1), (1.15, 1.47, 1), (0.85, 1.7), (0.55, 1.93), (0.45, 1.965), (0.0, 1.98), (-0.4, 1.979), (-0.62, 1.975), (-0.7, 1.95, 1), (-0.7, 1.4, 1),
                    (1.22, 1.35, 1)])
CAB_PLAN = Outline(mirror_u([(0, 1.25), (0.4, 1.248), (0.75, 1.24), (0.86, 1.18), (0.88, 1.05, 1), (0.88, -0.6, 1), (0.86, -0.7), (0.45, -0.71),
                             (0, -0.71)]))
FRONT_WIN = [(0.968, 1.52, 1), (0.473, 1.9, 1), (0.12, 1.9, 1), (0.12, 1.525, 1)]
REAR_WIN = [(0.04, 1.9, 1), (-0.6, 1.9, 1), (-0.6, 1.53, 1), (0.04, 1.525, 1)]
WINDSHIELD = mirror_u([(0, 1.17), (0.74, 1.165), (0.77, 1.1), (0.75, 0.8), (0.72, 0.55), (0.7, 0.5), (0, 0.49)])


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Slab sides, tucked in at the bottom, a crisp crease along the beltline."""
    if y < 0.8:
        return 0.96 + 0.04 * smoothstep(0.68, 0.8, y)
    return 1.0 - ramp(y - 1.43, 0.004) * 0.25


def tilt(y):
    return max(0.0, y - 1.5) * 0.12


def flare(name, w, s, coll, n):
    """A black box flare round the upper half of an arch, standing 11 cm out from the body side."""
    rings = []
    r0, r1 = w['r'] + 0.05, w['r'] + 0.25
    x0, x1 = 0.86, 1.06
    a0 = -math.asin(0.1 / ((r0 + r1) / 2))
    sec2 = [(r0, x0), (r1, x0), (r1, x1 - 0.02), (r1 - 0.02, x1), (r0 + 0.02, x1), (r0, x1 - 0.02)]
    for i in range(n(40, 10) + 1):
        a = a0 + (math.pi - 2 * a0) * i / n(40, 10)
        rings.append([(s * x, w['y'] + rho * math.sin(a), w['z'] + rho * math.cos(a)) for rho, x in sec2])
    return geo.loft(name, rings, coll, 'trim', sharp=40.0)


def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    segs = n(3, 1)
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=lambda z: (1.442, 0.8), r_top=0.03, r_bot=0.03)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.04))
    # box flares and bumpers merged in before the arches trim them
    for w in WHEELS.values():
        for s in (1, -1):
            geo.boolean(skin, flare(f'flare_{w["z"]}_{s}', w, s, coll, n), op='UNION', sharp=50.0)
    road.wheel_arches(coll, n, skin, WHEELS, gap=GAP)
    # the bed: open on top, lined in black
    geo.boolean(skin, geo.box('bed', (0, 1.5, -1.66), (0.84, 0.48, 0.86), coll, 'trim'), sharp=50.0)
    surf = road.Surface([skin])
    glass(coll, n, surf, lod)
    details(coll, n, surf, lod)
    # ---- pockets
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in (FRONT_WIN, REAR_WIN):
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
    for view in ('left', 'right'):
        # the blacked-out B-pillar
        road.pocket(skin, surf, view, rect(0.035, 0.125, 1.51, 1.91), 0.004, coll, 'trim', grid=0.02)
    # the big black grille, LED headlamps, tall tail lamps, the plate recess
    road.pocket(skin, surf, 'front', rrect(0, 1.135, 0.62, 0.175, 0.03), 0.06, coll, 'grille', 'trim', grid=0.03)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', rrect(s * 0.78, 1.205, 0.13, 0.085, 0.025), 0.035, coll, 'head', 'chrome', grid=0.015)
        # (the tall lamps wrap the bed's rounded corners)
        road.pocket(skin, surf, 'rear', rrect(s * 0.885, 1.255, 0.055, 0.135, 0.02), 0.02, coll, 'tail', 'trim', grid=0.012, facing=0.05)
        road.pocket(skin, surf, 'rear', rrect(s * 0.885, 1.05, 0.055, 0.04, 0.015), 0.02, coll, 'reverse', 'trim', grid=0.012, facing=0.05)
    road.pocket(skin, surf, 'rear', rrect(0, 0.95, 0.16, 0.078, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)
    # ---- the cab hollowed
    if lod != 'lod1':
        road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 1.22, 0.245), (0.86, 0.22, 0.905)), z_range=(-0.66, 1.15), tilt=tilt, wall=0.03,
                    floor=1.4)

    def fn(x, y, z, role, nx, ny, nz):
        return 'trim' if role == 'paint' and y < 0.72 else None

    road.zones(skin, fn, ys=(0.72,))
    if lod != 'lod1':
        road.cockpit(coll, n, seat_x=0.42, seat_z=0.42, floor_y=1.0, dash_z=0.98, dash_y=1.47, dash_w=0.82, wheel_z=0.74, wheel_y=1.52,
                     recline=0.28)
        geo.rbox('bench', (0, 1.1, -0.3), (0.8, 0.07, 0.24), coll, 'interior', r=0.05, segs=segs)
        geo.rbox('bench_back', (0, 1.38, -0.56), (0.8, 0.28, 0.07), coll, 'interior', r=0.05, segs=segs)


def glass(coll, n, surf, lod):
    g = 0.04  # (the full model's; it coarsens with the level)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        for i, win in enumerate((FRONT_WIN, REAR_WIN)):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'surround_{view}{i}', surf, view, win, coll, 'trim', width=0.014)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll)
    # the back window, and a brake light over it
    road.glass_panel('back_window', surf, 'rear', rrect(0, 1.715, 0.62, 0.165, 0.04), coll, grid=g, border=0.016 if lod != 'lod1' else 0)
    road.ribbon('cab_brake_light', surf, 'rear', [(-0.15, 1.935), (0.15, 1.935)], coll, 'tailglow', width=0.012, depth=-0.002, thick=0.006, per=1)


def details(coll, n, surf, lod):
    segs = n(3, 1)
    # the steel front bumper over a skid plate, tow hooks, the rear bumper with a step
    geo.rbox('bumper_front', (0, 0.85, 2.845), (0.98, 0.13, 0.145), coll, 'trim', r=0.025, segs=segs)
    geo.rbox('skid_plate', (0, 0.63, 2.615), (0.6, 0.03, 0.315), coll, 'trim', r=0.012, segs=segs)
    geo.rbox('bumper_rear', (0, 0.74, -2.635), (0.97, 0.09, 0.135), coll, 'trim', r=0.02, segs=segs)
    for s in (1, -1):
        hook = [(s * 0.42, 0.74, 2.99), (s * 0.42, 0.7, 3.04), (s * 0.42, 0.66, 2.99)]
        geo.tube(f'tow_hook_{s}', hook, coll, radius=0.014, role='trim', sides=n(10, 6), smooth_path=n(4, 2))
        # round fog lamps in the bumper
        # (on the steel bumper, 15 cm ahead of the body's face: a chrome bezel, the lens ahead of it)
        road.disc(f'fog_ring_{s}', surf, 'front', (s * 0.7, 0.85), 0.06, coll, 'chrome', depth=-0.15, thick=0.01, sides=n(20, 10))
        road.disc(f'fog_{s}', surf, 'front', (s * 0.7, 0.85), 0.045, coll, 'lens', depth=-0.16, thick=0.006, sides=n(20, 10))
    # tubular side steps on brackets, mud flaps behind the wheels
    for s in (1, -1):
        geo.cylinder(f'step_{s}', (s * 0.99, 0.6, 1.12), (s * 0.99, 0.6, -1.08), 0.04, coll, 'trim', sides=n(14, 6))
        for zb in (0.9, -0.85):
            geo.cylinder(f'step_bracket_{s}{zb}', (s * 0.86, 0.64, zb), (s * 0.98, 0.61, zb), 0.022, coll, 'trim', sides=n(10, 6))
        for wz in (WHEELS['front']['z'], WHEELS['rear']['z']):
            geo.rbox(f'mud_flap_{s}{wz}', (s * 0.86, 0.32, wz - 0.53), (0.17, 0.16, 0.006), coll, 'trim', r=0.004, segs=n(2, 1))
    # the frame rails and the axles showing under the lift
    for s in (1, -1):
        geo.box(f'frame_{s}', (s * 0.5, 0.64, 0.1), (0.05, 0.06, 2.55), coll, 'trim')
    for w in WHEELS.values():
        geo.cylinder(f'axle_{w["z"]}', (-0.74, w['y'], w['z']), (0.74, w['y'], w['z']), 0.065, coll, 'trim', sides=n(16, 8))
        geo.rbox(f'diff_{w["z"]}', (0.1, w['y'], w['z']), (0.14, 0.13, 0.12), coll, 'trim', r=0.08, segs=segs)
        for s in (1, -1):
            geo.cylinder(f'shock_{w["z"]}{s}', (s * 0.6, w['y'] + 0.05, w['z']), (s * 0.55, 0.66, w['z']), 0.035, coll, 'chrome', sides=n(12, 6))
    # big truck mirrors on stalks
    for s in (1, -1):
        geo.strut(f'mirror_stalk_{s}', (s * 0.86, 1.52, 1.02), (s * 1.03, 1.6, 1.0), coll, width=0.04, thick=0.03, role='trim', sides=n(10, 6))
        geo.rbox(f'mirror_{s}', (s * 1.07, 1.65, 1.0), (0.06, 0.12, 0.04), coll, 'trim', r=0.02, segs=segs)
        geo.rbox(f'mirror_glass_{s}', (s * 1.07, 1.65, 0.958), (0.05, 0.1, 0.004), coll, 'chrome', r=0.01, segs=n(2, 1))
    # roof: amber clearance lamps along the front edge, an LED bar on brackets behind them
    for xc in (0.0, 0.2, -0.2, 0.4, -0.4):
        geo.ellipsoid(f'clearance_{xc}', (xc, 1.982, 0.47), (0.03, 0.022, 0.03), coll, 'amber', rings=n(8, 4), segs=n(12, 6))
    geo.rbox('led_bar', (0, 2.04, 0.25), (0.74, 0.035, 0.045), coll, 'trim', r=0.02, segs=segs)
    geo.rbox('led_bar_lens', (0, 2.04, 0.296), (0.7, 0.018, 0.004), coll, 'lens', r=0.004, segs=n(2, 1))
    for s in (1, -1):
        geo.rbox(f'led_bracket_{s}', (s * 0.55, 1.995, 0.25), (0.025, 0.03, 0.03), coll, 'trim', r=0.01, segs=n(2, 1))
    # the sport bar over the bed: posts up from the rails, rounded shoulders, a bar across, two lamps
    path = [(0.78, 1.4, -0.95), (0.78, 1.86, -0.95)]
    for i in range(1, 8):
        a = math.pi / 2 * i / 8
        path.append((0.66 + 0.12 * math.cos(a), 1.86 + 0.12 * math.sin(a), -0.95))
    path += [(0.0, 1.98, -0.95)]
    hoop = path + [(-x, y, z) for x, y, z in reversed(path[:-1])]
    geo.tube('sport_bar', hoop, coll, radius=0.035, role='trim', sides=n(14, 6))
    for s in (1, -1):
        geo.cylinder(f'bar_lamp_{s}', (s * 0.36, 2.06, -0.985), (s * 0.36, 2.06, -0.875), 0.075, coll, 'trim', sides=n(20, 10))
        geo.cylinder(f'bar_lamp_lens_{s}', (s * 0.36, 2.06, -0.876), (s * 0.36, 2.06, -0.868), 0.058, coll, 'lens', sides=n(20, 10))
    # the bed floor's ribs, a big exhaust under the right of the rear bumper
    for xr in (-0.6, -0.3, 0.0, 0.3, 0.6):
        geo.rbox(f'bed_rib_{xr}', (xr, 1.035, -1.66), (0.03, 0.012, 0.84), coll, 'trim', r=0.008, segs=n(2, 1))
    road.exhaust_tip(coll, n, (-0.6, 0.6, -2.73), 0.05, 0.2, 'big', depth=0.08)
    # the grille: body-coloured bars across it and three amber marker lamps in it
    for yb in (1.04, 1.18):
        road.ribbon(f'grille_bar_{yb}', surf, 'front', [(-0.6, yb), (0.6, yb)], coll, 'paint', width=0.044, depth=0.012, thick=0.012, per=1)
    for xc in (0.0, 0.14, -0.14):
        road.ribbon(f'grille_marker_{xc}', surf, 'front', [(xc - 0.035, 1.27), (xc + 0.035, 1.27)], coll, 'amber', width=0.024, depth=0.002,
                    thick=0.006, per=1)
    for s in (1, -1):
        # LED headlamps: a running strip along the top and two projectors in chrome rings
        road.ribbon(f'drl_{s}', surf, 'front', [(s * 0.67, 1.268), (s * 0.89, 1.268)], coll, 'drl', width=0.016, depth=0.02, thick=0.006, per=1)
        for u in (0.72, 0.84):
            road.disc(f'head_ring_{s}{u}', surf, 'front', (s * u, 1.18), 0.04, coll, 'chrome', depth=0.03, thick=0.01, sides=n(24, 10))
            road.disc(f'head_lens_{s}{u}', surf, 'front', (s * u, 1.18), 0.034, coll, 'lens', depth=0.025, thick=0.008, sides=n(24, 10))
        # a bright bar down each tail lamp
        road.ribbon(f'tail_glow_{s}', surf, 'rear', [(s * 0.885, 1.14), (s * 0.885, 1.37)], coll, 'tailglow', width=0.03, depth=0.012, thick=0.004,
                    per=1, facing=0.05)
    if lod == 'lod1':
        return
    # door handles, the tailgate handle, wipers
    for view in ('left', 'right'):
        for zc in (0.2, -0.56):
            road.ribbon(f'handle_{view}{zc}', surf, view, [(zc + 0.07, 1.36), (zc - 0.07, 1.36)], coll, 'trim', width=0.026, depth=0.004,
                        thick=0.02, per=1)
    road.ribbon('tailgate_handle', surf, 'rear', [(-0.12, 1.36), (0.12, 1.36)], coll, 'trim', width=0.04, depth=0.004, thick=0.016, per=1)
    for x0, x1, tag in ((0.62, -0.1, 'l'), (0.05, -0.7, 'r')):
        road.bead(f'wiper_arm_{tag}', surf, 'top', [(x0, 1.15), (x1, 1.1)], coll, 'trim', radius=0.007, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{tag}', surf, 'top', [(x0 - 0.1, 1.145), (x1, 1.096)], coll, 'trim', radius=0.009, lift=0.006, per=1, sides=n(6, 4))
