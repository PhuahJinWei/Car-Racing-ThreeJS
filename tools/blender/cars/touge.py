"""TOUGE: an 80s lightweight hatchback that lives on mountain passes. A long flat hood with the
pop-up headlights raised on its front corners (body-coloured wedges, a lamp in a black bezel on the
front of each), a slim grille slot with amber lamps at its ends over a squared-off bumper with an
intake and amber corner lamps wrapping round, wipers, an antenna mast on the right front fender, a
tall glasshouse with black frames and centre pillar ending in a liftback with a lip spoiler and a
wiper, black door handles, black arch trims round small wheels on tall tyres, a fuel flap, a
full-width tail-light band (red lamps, amber and clear sections inboard, a ribbed black panel
between them), the plate in the rear bumper and a rub strip down the flanks at the two-tone line.
Right-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/touge.js, retired: see the git
history), re-spaced (see views.densify). The pop-up wedges stay as the user chose them: triangles
from the side.
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    # 14-inch rims on tall sidewalls, as cars wore them then
    'front': {'z': 1.2, 'y': 0.3, 'x': 0.7, 'r': 0.3, 'w': 0.2, 'rim': 0.18},
    'rear': {'z': -1.2, 'y': 0.3, 'x': 0.7, 'r': 0.3, 'w': 0.2, 'rim': 0.18},
}
GAP = 0.035

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [
            [[0.64, 0.875], [0.655, 0.5], [0.63, 0.205], [-0.42, 0.205], [-0.44, 0.5], [-0.42, 0.875]],
            [[1.62, 0.505], [2.12, 0.505]],
            [[-1.62, 0.56], [-2.08, 0.56]],
        ],
        'top': [
            # the hood, notched round the headlights on the front corners
            [[-0.74, 0.82], [0.74, 0.82], [0.76, 1.6], [0.76, 1.82], [0.47, 1.82], [0.47, 2.03], [-0.47, 2.03], [-0.47, 1.82], [-0.76, 1.82],
             [-0.76, 1.6], [-0.74, 0.82]],
            [[-0.68, -0.88], [0.68, -0.88], [0.7, -1.4], [0.66, -1.95], [-0.66, -1.95], [-0.7, -1.4], [-0.68, -0.88]],
        ],
        'front': [[[-0.8, 0.505], [0.8, 0.505]]],
        'rear': [[[-0.8, 0.585], [0.8, 0.585]]],
    },
    # `panda`: the two-tone line (side, front and rear views); `plate`: the licence plate painted
    # into the rear bumper's recess (rear view, metres)
    'livery': {
        'door': [0.12, 0.675],
        'shoulder': 0.72,
        'cabin': {'x': 0.6, 'z0': -1.9, 'z1': 0.8},
        'panda': {'side': 0.475, 'front': 0.51, 'rear': 0.59},
        'plate': {'x': 0, 'y': 0.425, 'w': 0.3, 'h': 0.15, 'text': 'GUNMA 86'},
    },
    'tailLights': [[0.62, 0.745, -2.05], [-0.62, 0.745, -2.05]],
    'headLights': [[0.65, 0.715, 2.078], [-0.65, 0.715, 2.078]],
    'exhausts': [[-0.45, 0.2, -2.13]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (1.95, 0.16, 1), (2.09, 0.17, 1), (2.125, 0.2), (2.135, 0.3), (2.135, 0.46), (2.125, 0.5, 1), (2.088, 0.512, 1), (2.085, 0.6),
    (2.07, 0.632, 1), (1.85, 0.662), (1.5, 0.695), (1.1, 0.735), (0.8, 0.765), (0.3, 0.795), (-0.3, 0.82), (-0.9, 0.845), (-1.5, 0.875),
    (-1.85, 0.898), (-1.98, 0.905, 1), (-2.03, 0.87), (-2.043, 0.75), (-2.047, 0.6, 1), (-2.088, 0.585, 1), (-2.1, 0.55), (-2.1, 0.4), (-2.1, 0.24),
    (-2.088, 0.19, 1), (-1.98, 0.17, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.135), (0.3, 2.133), (0.5, 2.13), (0.66, 2.12), (0.75, 2.1), (0.795, 2.06), (0.81, 2.0), (0.813, 1.7), (0.815, 1.2, 1),
    (0.815, -1.3, 1), (0.814, -1.65), (0.81, -1.88), (0.8, -2.01), (0.77, -2.075), (0.68, -2.095), (0.4, -2.103), (0, -2.105),
]))
CAB_SIDE = Outline([
    (0.86, 0.72, 1), (0.82, 0.8, 1), (0.5, 1.02), (0.2, 1.22), (0.05, 1.29), (-0.25, 1.315), (-0.7, 1.31), (-0.9, 1.28), (-1.25, 1.15),
    (-1.65, 0.995), (-1.93, 0.9, 1), (-1.93, 0.7, 1), (0.86, 0.6, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 0.88), (0.3, 0.879), (0.53, 0.875), (0.67, 0.83), (0.72, 0.74), (0.725, 0.5), (0.735, -0.2), (0.73, -0.9), (0.7, -1.4), (0.64, -1.8),
    (0.45, -1.97), (0, -1.99),
]))

DOOR_WIN = [(0.6, 0.878, 1), (0.04, 1.24, 1), (-0.36, 1.25, 1), (-0.36, 0.878, 1)]
QUARTER_WIN = [(-0.45, 1.25, 1), (-0.85, 1.236), (-1.05, 1.165), (-1.24, 1.06, 1), (-1.28, 0.89, 1), (-0.45, 0.882, 1)]
SIDE_WINS = (DOOR_WIN, QUARTER_WIN)
# (kept inside the glasshouse's fillets, see marshal.py)
WINDSHIELD = mirror_u([(0, 0.79), (0.52, 0.782), (0.585, 0.72), (0.56, 0.32), (0.52, 0.12), (0, 0.095)])
LIFTBACK = road.rounded([(-0.5, -0.955), (0.5, -0.955), (0.52, -1.4), (0.47, -1.815), (-0.47, -1.815), (-0.52, -1.4)], [0.07, 0.07, 0, 0.06, 0.06, 0])
# the pop-up lights, raised: a wedge from the side, hinged at the back, its lamp facing forward
POD_X0, POD_X1 = 0.5, 0.785
POD = [(1.82, 0.58), (2.078, 0.58), (2.078, 0.8), (1.865, 0.678), (1.84, 0.64)]
# the tail band's sections: red lamps outboard, amber and clear sections inboard, a ribbed black
# panel in the middle
LAMP_IN, LAMP_SPLIT, BAND_X = 0.31, 0.48, 0.755


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Slab sides tucked in at the sills, a crisp crease at the beltline, a touch of tumblehome."""
    if y < 0.3:
        return 0.955 + 0.045 * smoothstep(0.14, 0.3, y)
    return 1.0 - ramp(y - 0.74, 0.003) * 0.22


def tilt(y):
    return max(0.0, y - 0.85) * 0.35


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    # (crisp 80s edges)
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=lambda z: (0.742, 0.3), r_top=0.02, r_bot=0.03)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.015, r_top=0.04))
    # the rub strip at the two-tone line, merged in before the arches trim it
    surf = road.Surface([skin])
    for view in ('left', 'right'):
        m = road.ribbon(f'rub_{view}', surf, view, [(1.68, 0.475), (-1.68, 0.475)], coll, 'trim', width=0.034, depth=0.008, thick=0.017, per=1)
        if m:
            geo.boolean(skin, m, op='UNION', sharp=50.0)
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


def pods(coll, n, lod):
    """The raised pop-up lights: a wedge on each front corner (body colour, its front face a black
    bezel), a recessed lamp in the bezel and its lens."""
    for s in (1, -1):
        pts = geo.curve([(z, y, 1) for z, y in POD], 1, closed=True)
        rings = []
        for x in (POD_X0, POD_X0 + 0.004, POD_X1 - 0.004, POD_X1):
            inset = 0.004 if x in (POD_X0, POD_X1) else 0.0
            rings.append([(s * x, y - inset * (1 if y > 0.6 else 0), z - inset * (1 if z > 2.0 else 0)) for z, y in pts])
        roles = []
        faces = []
        cols = len(pts)
        verts = [p for r in rings for p in r]
        for j in range(len(rings) - 1):
            for k in range(cols):
                a, b = j * cols + k, j * cols + (k + 1) % cols
                faces.append((a, b, b + cols, a + cols))
                z0, z1 = pts[k][0], pts[(k + 1) % cols][0]
                roles.append('trim' if z0 > 2.07 and z1 > 2.07 else 'paint')
        for ring_i in (0, len(rings) - 1):
            base = ring_i * cols
            c = tuple(sum(p[i] for p in rings[ring_i]) / cols for i in range(3))
            verts.append(c)
            ci = len(verts) - 1
            for k in range(cols):
                faces.append((base + k, base + (k + 1) % cols, ci))
                roles.append('paint')
        pod = geo.make_mesh(f'pod_{s}', verts, faces, coll, 'paint', face_roles=roles, sharp=40.0)
        ps = road.Surface([pod])
        road.pocket(pod, ps, 'front', sym(rect(0.53, 0.77, 0.657, 0.773), s), 0.022, coll, 'head', 'trim', grid=0.015)
        road.panel(f'pod_lens_{s}', ps, 'front', sym(rect(0.54, 0.76, 0.665, 0.765), s), coll, 'lens', depth=0.016, thick=0.004, grid=0.02)


def glass(coll, n, surf, lod):
    g = 0.05  # (the full model's; it coarsens with the level)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        for i, win in enumerate(SIDE_WINS):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'trim', width=0.014)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('liftback', surf, 'top', LIFTBACK, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll)
        road.frit('liftback_frit', surf, 'top', LIFTBACK, coll, width=0.03)


def lamps(coll, n, surf, lod):
    pods(coll, n, lod)
    for s in (1, -1):
        # amber lamps at the ends of the grille slot
        road.ribbon(f'slot_amber_{s}', surf, 'front', [(s * 0.665, 0.565), (s * 0.73, 0.565)], coll, 'amber', width=0.026, depth=0.012, thick=0.004,
                    per=1)
        # the tail band: amber over clear inboard of the red lamp, two bright bars in the red
        road.panel(f'tail_amber_{s}', surf, 'rear', sym(rect(LAMP_IN, LAMP_SPLIT, 0.745, 0.805), s), coll, 'indicator', depth=0.008, thick=0.002,
                   grid=0.02)
        road.panel(f'tail_reverse_{s}', surf, 'rear', sym(rect(LAMP_IN, LAMP_SPLIT, 0.685, 0.745), s), coll, 'reverse', depth=0.008, thick=0.002,
                   grid=0.02)
        for v in (0.775, 0.715):
            road.ribbon(f'tail_glow_{s}{v}', surf, 'rear', [(s * (LAMP_SPLIT + 0.02), v), (s * 0.72, v)], coll, 'tailglow', width=0.014, depth=0.008,
                        thick=0.003, per=1)
        road.ribbon(f'tail_divider_{s}', surf, 'rear', [(s * LAMP_SPLIT, 0.685), (s * LAMP_SPLIT, 0.805)], coll, 'trim', width=0.006, depth=0.009,
                    thick=0.004, per=1)
    # the black centre panel's ribs
    road.panel('tail_panel', surf, 'rear', rect(-LAMP_IN, LAMP_IN, 0.685, 0.805), coll, 'trim', depth=0.009, thick=0.002, grid=0.03)
    for yr in (0.715, 0.745, 0.775):
        road.ribbon(f'tail_rib_{yr}', surf, 'rear', [(-LAMP_IN + 0.006, yr), (LAMP_IN - 0.006, yr)], coll, 'trim', width=0.01, depth=0.008, thick=0.006,
                    per=1)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    # the lip spoiler on the end of the liftback
    geo.rbox('lip_spoiler', (0, 0.918, -1.965), (0.69, 0.016, 0.07), coll, 'paint', r=0.012, segs=segs)
    # black arch trims standing proud of the fenders (above the axle line)
    for view in ('left', 'right'):
        for w in WHEELS.values():
            rr = w['r'] + GAP + 0.022
            arc = [(w['z'] + rr * math.cos(a), w['y'] + rr * math.sin(a)) for a in (math.pi * (-0.04 + 1.08 * i / 24) for i in range(25))]
            road.ribbon(f'arch_trim_{view}{w["z"]}', surf, view, arc, coll, 'trim', width=0.044, depth=0.004, thick=0.014, per=1)
    # black mirrors at the front corners of the door glass, their stalks rooted in the pillar foot
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.7, 0.88, 0.66), (0.9, 0.915, 0.63), (0.07, 0.048, 0.04), glass_role='chrome', body_role='trim', arm_role='trim',
                         r=0.02)
    # a single exhaust under the right of the rear bumper, the antenna mast on the right front fender
    road.exhaust_tip(coll, n, (-0.45, 0.2, -2.125), 0.042, 0.14, 'tip', depth=0.07)
    h = surf.project('top', -0.775, 0.98)
    if h:
        p = h[0]
        geo.cylinder('antenna_base', (p[0], p[1] - 0.004, p[2]), (p[0], p[1] + 0.025, p[2]), 0.012, coll, 'chrome', sides=n(10, 6))
        geo.cylinder('antenna', (p[0], p[1] + 0.02, p[2]), (p[0], p[1] + 0.64, p[2] - 0.08), 0.0045, coll, 'chrome', sides=n(6, 4))
    if lod == 'lod1':
        return
    # black pull handles at the top rear of the doors
    for view in ('left', 'right'):
        road.ribbon(f'handle_{view}', surf, view, [(-0.245, 0.8), (-0.355, 0.8)], coll, 'trim', width=0.024, depth=0.006, thick=0.012, per=1)
    # wipers parked at the foot of the windshield (toward the left: right-hand drive), one on the liftback
    for x0, x1 in ((-0.36, 0.08), (0.1, 0.47)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 0.775), (x1, 0.755)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 + 0.06, 0.771), (x1, 0.752)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))
    road.bead('rear_wiper_arm', surf, 'top', [(0.0, -1.83), (0.42, -1.78)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
    road.bead('rear_wiper_blade', surf, 'top', [(0.05, -1.815), (0.43, -1.772)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', LIFTBACK, 0.045, coll, 'trim', grid=0.03)
    # the grille slot between the bumper and the hood (parking lamps at its ends), the bumper's intake
    road.pocket(skin, surf, 'front', rect(-0.75, 0.75, 0.539, 0.591), 0.05, coll, 'grille', 'trim', grid=0.015)
    road.pocket(skin, surf, 'front', rect(-0.42, 0.42, 0.265, 0.335), 0.05, coll, 'grille', 'trim', grid=0.015)
    for s in (1, -1):
        # amber turn signals in the bumper corners, wrapping round onto the sides
        road.pocket(skin, surf, 'front', sym(rect(0.6, 0.79, 0.365, 0.425), s), 0.015, coll, 'amber', 'trim', grid=0.012)
    for view in ('left', 'right'):
        road.pocket(skin, surf, view, rect(1.92, 2.07, 0.365, 0.425), 0.015, coll, 'amber', 'trim', grid=0.012)
    # the tail band (its floor red; the inserts on it), the plate recess in the rear bumper
    road.pocket(skin, surf, 'rear', rect(-BAND_X, BAND_X, 0.683, 0.807), 0.012, coll, 'tail', 'trim', grid=0.012)
    road.pocket(skin, surf, 'rear', rrect(0, 0.425, 0.158, 0.078, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)
    if lod != 'lod1':
        road.pocket(skin, surf, 'left', rrect(-1.62, 0.65, 0.055, 0.05, 0.02), 0.0025, coll, 'paint', 'trim', grid=0.015)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors and the glasshouse's inside (the rear wheel wells
    stay closed off)."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.52, -1.42), (0.5, 0.27, 0.36), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.475, -0.06), (0.74, 0.245, 0.79)), z_range=(-1.86, 0.8), tilt=tilt, wall=0.025,
                floor=0.62)


def zones(skin, lod):
    """The underbody, the valance under the rear bumper, black window frames' centre pillar."""
    pillar = lod != 'lod1'

    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        ax = abs(x)
        if y < 0.168:
            return 'trim'
        if z < -2.0 and y < 0.3 and ax < 0.7:
            return 'trim'
        if pillar and ax > 0.5 and 0.855 < y < 1.275 and abs(z + 0.405) < 0.07:
            return 'trim'
        return None

    road.zones(skin, fn, ys=(0.168, 0.3) + ((0.855, 1.275) if pillar else ()), zs=(-2.0,) + ((-0.475, -0.335) if pillar else ()),
               xs=(0.7,) + ((0.5,) if pillar else ()))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.36, seat_z=-0.22, floor_y=0.25, dash_z=0.56, dash_y=0.73, dash_w=0.68, wheel_z=0.32, wheel_y=0.76, recline=0.3,
                 lhd=False)
    segs = n(3, 1)
    geo.rbox('rear_seat', (0, 0.36, -0.95), (0.58, 0.06, 0.2), coll, 'interior', r=0.05, segs=segs)
    back = geo.rbox('rear_seat_back', (0, 0, 0), (0.58, 0.24, 0.06), coll, 'interior', r=0.05, segs=segs)
    road._place(back, (0, 0.62, -1.18), 0.32)
