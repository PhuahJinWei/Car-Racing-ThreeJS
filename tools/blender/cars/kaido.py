"""KAIDO: a 70s Japanese touring coupe dressed as a street racer. A crisp, boxy hardtop with a
"surf line" crease pressed into each side, black over-fenders bolted on with a row of chrome bolts,
a deep black chin spoiler raked forward with an intake, a full-width chrome grille of thin bars with
round headlamps in chrome rings at its ends, amber lamps under the front bumper, thin chrome bumpers
with overriders, mirrors out on the front fenders, wipers, chrome drip rails, window frames and
sills, amber side repeaters, a chrome racing fuel cap, quad round tail lamps in a black panel with
the plate between them, a chrome trunk lock, a ducktail and twin exhausts. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/kaido.js, retired: see the git
history), re-spaced (see views.densify); the ducktail is part of the side drawing.
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.3, 'y': 0.3, 'x': 0.72, 'r': 0.3, 'w': 0.225, 'rim': 0.18},
    'rear': {'z': -1.28, 'y': 0.3, 'x': 0.73, 'r': 0.3, 'w': 0.235, 'rim': 0.18},
}
GAP = 0.035

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z)
    'panels': {
        'side': [[[0.88, 0.78], [0.9, 0.5], [0.86, 0.25], [-0.32, 0.25], [-0.34, 0.5], [-0.32, 0.8]]],
        'top': [
            [[-0.68, 0.99], [0.68, 0.99], [0.76, 1.6], [0.74, 2.1], [-0.74, 2.1], [-0.76, 1.6], [-0.68, 0.99]],
            [[-0.62, -1.42], [0.62, -1.42], [0.72, -2.06], [-0.72, -2.06], [-0.62, -1.42]],
        ],
    },
    # `plate`: the licence plate painted onto its panel between the tail lamps (rear view, metres)
    'livery': {
        'door': [0.25, 0.42],
        'shoulder': 0.68,
        'cabin': {'x': 0.6, 'z0': -1.38, 'z1': 0.95},
        'plate': {'x': 0, 'y': 0.67, 'w': 0.3, 'h': 0.15, 'text': 'KD 1972'},
    },
    'tailLights': [[0.5, 0.67, -2.18], [-0.5, 0.67, -2.18]],
    'headLights': [[0.57, 0.56, 2.18], [-0.57, 0.56, 2.18]],
    'exhausts': [[0.46, 0.22, -2.24], [-0.46, 0.22, -2.24]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5, 'chrome': 0.7}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.12, 0.22, 1), (2.17, 0.27), (2.18, 0.34), (2.18, 0.62), (2.16, 0.69, 1), (1.6, 0.735), (1.0, 0.775), (0.5, 0.793), (0.0, 0.81),
    (-0.5, 0.825), (-1.0, 0.84), (-1.5, 0.857), (-1.75, 0.866), (-1.92, 0.882), (-2.04, 0.915), (-2.11, 0.94, 1), (-2.13, 0.9),
    (-2.16, 0.8), (-2.18, 0.6), (-2.17, 0.4), (-2.13, 0.28), (-2.05, 0.22, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.18), (0.3, 2.179), (0.6, 2.175), (0.74, 2.14), (0.795, 2.05), (0.805, 1.85, 1), (0.805, -1.7, 1), (0.8, -2.05), (0.75, -2.15),
    (0.5, -2.17), (0.25, -2.178), (0, -2.18),
]))
# (the back window runs on 3 cm into the trunk, so it rises out of it at a clear angle)
CAB_SIDE = Outline([
    (0.98, 0.72, 1), (0.93, 0.79, 1), (0.72, 0.97), (0.5, 1.16), (0.35, 1.235), (0.1, 1.26), (-0.18, 1.262), (-0.45, 1.26), (-0.65, 1.23),
    (-1.0, 1.06), (-1.32, 0.89), (-1.42, 0.83, 1), (-1.42, 0.7, 1), (0.98, 0.68, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 0.99), (0.3, 0.988), (0.58, 0.985), (0.68, 0.95), (0.71, 0.86, 1), (0.715, -0.7, 1), (0.7, -1.1), (0.62, -1.36), (0.3, -1.395),
    (0, -1.4),
]))

# (the door glass starts well behind the A-pillar: its frame laid on the pillar's rounded edge broke up)
DOOR_WIN = [(0.76, 0.85, 1), (0.37, 1.18, 1), (-0.28, 1.19, 1), (-0.28, 0.865, 1)]
QUARTER_WIN = [(-0.34, 1.19, 1), (-0.6, 1.17), (-0.86, 1.055, 1), (-0.86, 0.875, 1), (-0.34, 0.866, 1)]
SIDE_WINS = (DOOR_WIN, QUARTER_WIN)
# (kept inside the glasshouse's fillets, see marshal.py; straight edges, round corners)
WINDSHIELD = road.rounded([(-0.56, 0.95), (0.56, 0.95), (0.6, 0.62), (0.53, 0.37), (-0.53, 0.37), (-0.6, 0.62)], [0.05, 0.05, 0, 0.05, 0.05, 0])
REAR_GLASS = road.rounded([(-0.53, -0.68), (0.53, -0.68), (0.56, -0.95), (0.5, -1.27), (-0.5, -1.27), (-0.56, -0.95)], [0.05, 0.05, 0, 0.05, 0.05, 0])
# the surf line (side view): a crease from the front fender, dipping along the door and kicking up
# over the rear wheel to the tail
SURF = [(2.0, 0.66), (1.0, 0.64), (0.2, 0.6), (-0.55, 0.57), (-0.85, 0.62), (-1.2, 0.67), (-2.1, 0.69)]
HEAD_X, HEAD_Y = 0.57, 0.56


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Slab sides tucked in at the sills, a crisp crease along the beltline."""
    if y < 0.3:
        return 0.96 + 0.04 * smoothstep(0.2, 0.3, y)
    return 1.0 - ramp(y - 0.76, 0.004) * 0.3


def tilt(y):
    return max(0.0, y - 0.84) * 0.3


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


def box_section(n=4, p=0.45):
    pts = []
    for k in range(4 * n):
        t = 2 * math.pi * k / (4 * n)
        c, s = math.cos(t), math.sin(t)
        pts.append((math.copysign(abs(c) ** p, c), math.copysign(abs(s) ** p, s)))
    return pts


def band(path, w):
    """A closed outline round a polyline, w wide (the surf line's crease)."""
    left, right = [], []
    for i, p in enumerate(path):
        a, b = path[max(i - 1, 0)], path[min(i + 1, len(path) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1
        nx, ny = -ty / ln * w / 2, tx / ln * w / 2
        left.append((p[0] + nx, p[1] + ny))
        right.append((p[0] - nx, p[1] - ny))
    return left + right[::-1]


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=lambda z: (0.762, 0.3), r_top=0.022, r_bot=0.035)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.015, r_top=0.045))
    # the surf line, pressed in before the over-fenders go on (cut through them, it left a slit)
    if lod != 'lod1':
        surf = road.Surface([skin])
        line = road._path(SURF, 6, max_seg=0.03)
        for view in ('left', 'right'):
            road.pocket(skin, surf, view, [(u, v, 1) for u, v in band(line, 0.016)], 0.008, coll, 'paint', grid=0.02)
    for w in WHEELS.values():
        for s in (1, -1):
            geo.boolean(skin, flare(f'flare_{w["z"]}_{s}', w, s, coll, n), op='UNION', sharp=50.0)
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


def flare(name, w, s, coll, n):
    """A black bolt-on over-fender round the upper half of an arch, standing out to x 0.9, its top
    kept under the beltline crease. (Its inner edge stays inside the arch's cut, which trims it.)"""
    r0, r1 = w['r'] + 0.02, w['r'] + 0.165
    x0, x1 = 0.76, 0.9
    sec2 = [(r0, x0), (r1, x0), (r1, x1 - 0.012), (r1 - 0.012, x1), (r0 + 0.006, x1), (r0, x1 - 0.006)]
    a0 = math.asin(-0.06 / ((r0 + r1) / 2))
    rings = []
    steps = n(40, 12)
    for i in range(steps + 1):
        a = a0 + (math.pi - 2 * a0) * i / steps
        ring = []
        for rho, x in sec2:
            y = w['y'] + rho * math.sin(a)
            ring.append((s * x, min(y, 0.745), w['z'] + rho * math.cos(a)))
        rings.append(ring)
    return geo.loft(name, rings, coll, 'trim', sharp=40.0)


def glass(coll, n, surf, lod):
    g = 0.05  # (the full model's; it coarsens with the level)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        for i, win in enumerate(SIDE_WINS):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'chrome', width=0.012)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('rear_glass', surf, 'top', REAR_GLASS, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll)
        road.frit('rear_frit', surf, 'top', REAR_GLASS, coll, width=0.03)
        road.ring_panel('windshield_frame', surf, 'top', WINDSHIELD, coll, 'chrome', width=0.01)
        road.ring_panel('rear_frame', surf, 'top', REAR_GLASS, coll, 'chrome', width=0.01)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        c = (s * HEAD_X, HEAD_Y)
        # round headlamps at the grille's ends: a smoked reflector, a chrome ring, the lens
        road.disc(f'head_bowl_{s}', surf, 'front', c, 0.078, coll, 'head', depth=0.03, thick=0.004, sides=n(28, 12))
        road.bead(f'head_ring_{s}', surf, 'front', circle(*c, 0.083, n(28, 12)), coll, 'chrome', radius=0.01, lift=0.0, per=1, sides=n(8, 4),
                  closed=True)
        road.disc(f'head_lens_{s}', surf, 'front', c, 0.056, coll, 'lens', depth=0.016, thick=0.006, sides=n(24, 12))
        # quad round tail lamps (the inner pair with a clear reversing core), chrome rings, bright rings
        for xc in (0.4, 0.6):
            t = (s * xc, 0.67)
            road.disc(f'tail_{s}{xc}', surf, 'rear', t, 0.058, coll, 'tail', depth=0.012, thick=0.006, sides=n(24, 12))
            road.bead(f'tail_ring_{s}{xc}', surf, 'rear', circle(*t, 0.062, n(24, 10)), coll, 'chrome', radius=0.007, lift=0.0, per=1,
                      sides=n(6, 4), closed=True)
            if xc < 0.5:
                road.disc(f'tail_reverse_{s}', surf, 'rear', t, 0.026, coll, 'reverse', depth=0.008, thick=0.004, sides=n(16, 8))
            else:
                road.bead(f'tail_glow_{s}', surf, 'rear', circle(*t, 0.036, n(20, 8)), coll, 'tailglow', radius=0.006, lift=-0.004, per=1,
                          sides=n(6, 4), closed=True)
    # the grille: a chrome surround, five thin chrome bars across the mesh, a blank badge on them
    road.ring_panel('grille_surround', surf, 'front', rrect(0, HEAD_Y, 0.72, 0.085, 0.02), coll, 'chrome', width=0.008)
    for yb in (0.5, 0.53, 0.56, 0.59, 0.62):
        road.bead(f'grille_bar_{yb}', surf, 'front', [(-0.46, yb), (0.46, yb)], coll, 'chrome', radius=0.0065, lift=-0.012, per=1, sides=n(8, 4))
    road.panel('badge', surf, 'front', rrect(0, HEAD_Y, 0.05, 0.02, 0.01), coll, 'chrome', depth=-0.002, thick=0.024, grid=0.01)
    # the plate standing in the tail's black panel, the trunk lock in its chrome escutcheon
    road.panel('plate', surf, 'rear', rrect(0, 0.67, 0.155, 0.075, 0.02), coll, 'paint', depth=0.012, thick=0.016, grid=0.03)
    road.panel('lock_plate', surf, 'rear', rrect(0, 0.795, 0.032, 0.014, 0.008), coll, 'chrome', depth=-0.004, thick=0.008, grid=0.01)
    road.disc('lock', surf, 'rear', (0, 0.795), 0.006, coll, 'trim', depth=-0.006, thick=0.003, sides=n(10, 6))


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    # thin chrome bumpers wrapping the corners, overriders standing up on them
    plan = road.offset_outline(PLAN, 0.0175)
    secn = box_section(n(4, 2))
    for name, cut, front, zo in (('bumper_front', 1.95, True, 2.232), ('bumper_rear', -1.95, False, -2.232)):
        pts = run(plan, cut, front)
        step = max(1, len(pts) // n(60, 20))
        path = [(x, 0.41, z) for x, z in pts[::step]] + [(pts[-1][0], 0.41, pts[-1][1])]
        geo.tube(name, path, coll, radius=(0.026, 0.0175), role='chrome', section=secn, sharp=60.0)
        for s in (1, -1):
            geo.rbox(f'overrider_{name}_{s}', (s * 0.42, 0.405, zo), (0.022, 0.07, 0.03), coll, 'chrome', r=0.015, segs=segs)
    # the deep black chin spoiler, its face raked forward to its foot, an intake across its middle
    chin = chin_spoiler(coll, n)
    road.pocket(chin, road.Surface([chin]), 'front', rrect(0, 0.195, 0.3, 0.022, 0.01), 0.03, coll, 'grille', 'trim', grid=0.015)
    # the over-fenders' chrome bolts, eight round each, on its flat outer face
    if lod != 'lod1':
        for w in WHEELS.values():
            for s in (1, -1):
                for i in range(8):
                    t = math.radians(10 + i * 22.5)
                    zb, yb = w['z'] + (w['r'] + 0.148) * math.cos(t), w['y'] + (w['r'] + 0.148) * math.sin(t)
                    if yb > 0.735:
                        continue
                    geo.cylinder(f'bolt_{w["z"]}_{s}_{i}', (s * 0.898, yb, zb), (s * 0.908, yb, zb), 0.01, coll, 'chrome', sides=n(8, 6))
    # fender mirrors on thin stalks, twin exhausts under the rear bumper
    for s in (1, -1):
        h = surf.project('top', s * 0.66, 1.7)
        y0 = h[0][1] if h else 0.73
        geo.cylinder(f'mirror_stalk_{s}', (s * 0.66, y0 - 0.005, 1.7), (s * 0.67, 0.83, 1.665), 0.008, coll, 'trim', sides=n(8, 4))
        geo.rbox(f'mirror_{s}', (s * 0.67, 0.85, 1.66), (0.035, 0.03, 0.025), coll, 'trim', r=0.015, segs=segs)
        geo.rbox(f'mirror_glass_{s}', (s * 0.67, 0.85, 1.6355), (0.027, 0.022, 0.003), coll, 'chrome', r=0.008, segs=n(2, 1))
        road.exhaust_tip(coll, n, (s * 0.46, 0.22, -2.205), 0.034, 0.14, f'{s}', depth=0.06)
    # the chrome racing fuel cap on the right rear fender, above the crease
    road.disc('fuel_cap', surf, 'right', (-1.6, 0.815), 0.042, coll, 'chrome', depth=-0.005, thick=0.008, sides=n(24, 10))
    road.disc('fuel_cap_ring', surf, 'right', (-1.6, 0.815), 0.03, coll, 'trim', depth=-0.009, thick=0.004, sides=n(20, 8))
    for view in ('left', 'right'):
        # the chrome sill strip between the flares, amber repeaters ahead of the front wheels
        road.ribbon(f'sill_{view}', surf, view, [(0.86, 0.29), (-0.84, 0.29)], coll, 'chrome', width=0.04, depth=0.002, thick=0.007, per=1)
        road.ribbon(f'repeater_{view}', surf, view, [(1.98, 0.45), (1.92, 0.45)], coll, 'indicator', width=0.024, depth=0.002, thick=0.005, per=1)
    if lod == 'lod1':
        return
    for view in ('left', 'right'):
        # chrome door pulls, chrome drip rails along the roof's edges
        road.ribbon(f'pull_{view}', surf, view, [(-0.12, 0.74), (-0.24, 0.74)], coll, 'chrome', width=0.02, depth=0.004, thick=0.012, per=1)
        road.bead(f'drip_{view}', surf, view, [(0.38, 1.205), (0.25, 1.222), (0.05, 1.23), (-0.45, 1.23), (-0.55, 1.226), (-0.65, 1.2)], coll,
                  'chrome', radius=0.0045, lift=0.0, per=4, sides=n(6, 4))
    # wipers parked at the foot of the windshield
    for x0, x1 in ((0.38, -0.08), (-0.12, -0.52)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 0.935), (x1, 0.91)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 0.931), (x1, 0.907)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def chin_spoiler(coll, n):
    """The chin: a black lip following the nose's plan, 2 cm proud at the top and 7 cm at its foot."""
    pts = run(PLAN, 1.85, True)
    step = max(1, len(pts) // n(60, 20))
    pts = pts[::step] + [pts[-1]]
    rings = []
    ys = [0.15, 0.17, 0.2, 0.23, 0.25, 0.25]
    for i, (x, z) in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, tz) or 1
        # outward normal of the plan (the outline runs round the nose from one side to the other)
        nx, nz = tz / ln, -tx / ln
        if nx * x + nz * (z - 1.0) < 0:
            nx, nz = -nx, -nz
        ring = []
        for k, y in enumerate(ys):
            out = (0.02 + 0.05 * smoothstep(0.26, 0.15, y)) if k < len(ys) - 1 else -0.04
            ring.append((x + nx * out, y, z + nz * out))
        ring.append((x - nx * 0.04, 0.15, z - nz * 0.04))
        rings.append(ring)
    return geo.loft('chin', rings, coll, 'trim', sharp=40.0)


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', REAR_GLASS, 0.045, coll, 'trim', grid=0.03)
    # the grille's mesh, the tail's black panel, amber lamps under the front bumper
    road.pocket(skin, surf, 'front', rrect(0, HEAD_Y, 0.72, 0.085, 0.02), 0.035, coll, 'grille', 'chrome', grid=0.015)
    road.pocket(skin, surf, 'rear', rrect(0, 0.67, 0.72, 0.08, 0.02), 0.018, coll, 'trim', grid=0.015)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', sym(rrect(0.55, 0.32, 0.07, 0.022, 0.01), s), 0.012, coll, 'amber', 'trim', grid=0.01)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors, a narrower one between the rear wheel wells,
    the glasshouse's inside."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.52, -1.18), (0.52, 0.28, 0.22), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.48, 0.0), (0.72, 0.24, 0.9)), z_range=(-1.36, 0.92), tilt=tilt, wall=0.025,
                floor=0.62)


def zones(skin):
    """The underbody in black."""
    def fn(x, y, z, role, nx, ny, nz):
        return 'trim' if role == 'paint' and y < 0.235 else None

    road.zones(skin, fn, ys=(0.235,))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.36, seat_z=-0.05, floor_y=0.24, dash_z=0.66, dash_y=0.74, dash_w=0.66, wheel_z=0.42, wheel_y=0.8, recline=0.32)
    segs = n(3, 1)
    geo.rbox('rear_seat', (0, 0.34, -0.85), (0.6, 0.06, 0.22), coll, 'interior', r=0.05, segs=segs)
    back = geo.rbox('rear_seat_back', (0, 0, 0), (0.6, 0.24, 0.06), coll, 'interior', r=0.05, segs=segs)
    road._place(back, (0, 0.6, -1.1), 0.3)
