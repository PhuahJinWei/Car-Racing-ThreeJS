"""VOLT GT: a mid-engine grand tourer. Fenders that crown above a sunken hood, a cab-forward
glasshouse with a hard shoulder line, muscular rear haunches fed by side intakes, a ducktail deck,
a full-width light bar and a big diffuser.

Its drawings (side and plan views, glasshouse, section rule, hood dip) are the car factory's
(tools/car-factory/designs/volt.js), so the silhouette is the one approved; the body is lofted
with crisp edges and every detail is real geometry.
"""
import math

from lib import geo, road
from lib.road import smoothstep
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.31, 'y': 0.338, 'x': 0.83, 'r': 0.338, 'w': 0.26},
    'rear': {'z': -1.35, 'y': 0.35, 'x': 0.82, 'r': 0.35, 'w': 0.31},
}
GAP = 0.04  # tyre to arch clearance

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [
            [[0.74, 0.82], [0.715, 0.55], [0.69, 0.22], [0.2, 0.2], [-0.16, 0.205], [-0.23, 0.42], [-0.27, 0.62]],
            [[-1.18, 0.865], [-1.34, 0.865], [-1.34, 0.785], [-1.18, 0.785], [-1.18, 0.865]],
            [[1.97, 0.55], [1.86, 0.43], [1.72, 0.32]],
        ],
        'top': [
            [[-0.5, 1.03], [0.5, 1.03], [0.6, 1.55], [0.56, 1.98], [0.32, 2.15], [-0.32, 2.15], [-0.56, 1.98], [-0.6, 1.55], [-0.5, 1.03]],
            [[-0.6, -0.93], [0.6, -0.93], [0.63, -1.5], [0.52, -1.84], [-0.52, -1.84], [-0.63, -1.5], [-0.6, -0.93]],
        ],
    },
    'livery': {'door': [0.18, 0.5], 'shoulder': 0.62, 'cabin': {'x': 0.62, 'z0': -1.75, 'z1': 0.95}},
    'tailLights': [[0.72, 0.866, -2.24], [-0.72, 0.866, -2.24]],
    'headLights': [[0.65, 0.49, 2.12], [-0.65, 0.49, 2.12]],
    'exhausts': [[0.13, 0.665, -2.27], [-0.13, 0.665, -2.27]],
}

# deep meshes and louvres would bake to black voids
AO_STRENGTH = {'grille': 0.45, 'carbon': 0.6, 'interior': 0.5}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.1, 0.105, 1), (2.225, 0.14), (2.258, 0.26), (2.248, 0.37), (2.205, 0.445), (2.09, 0.52), (1.88, 0.6), (1.62, 0.7),
    (1.32, 0.775), (1.0, 0.79), (0.6, 0.805), (0.0, 0.84), (-0.6, 0.885), (-1.15, 0.945), (-1.7, 0.99), (-2.08, 1.008),
    (-2.19, 1.028, 1), (-2.238, 0.965), (-2.252, 0.8), (-2.245, 0.56), (-2.225, 0.5, 1), (-2.05, 0.3), (-1.75, 0.15),
    (-1.55, 0.105, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.258), (0.38, 2.24), (0.66, 2.18), (0.84, 2.06), (0.935, 1.86), (0.968, 1.62), (0.978, 1.34), (0.965, 1.06),
    (0.938, 0.8), (0.925, 0.3), (0.935, -0.25), (0.968, -0.75), (0.995, -1.15), (1.0, -1.42), (0.99, -1.72), (0.955, -2.0),
    (0.87, -2.18), (0.58, -2.25), (0, -2.262),
]))
# (the windscreen starts 3 cm lower than the factory's, under the hood's rear edge, so it rises out
# of the hood at a clean angle)
CAB_SIDE = Outline([
    (1.05, 0.6, 1), (1.0, 0.67), (0.6, 0.86), (0.24, 1.05), (0.1, 1.115), (-0.15, 1.155), (-0.55, 1.16), (-0.92, 1.115),
    (-1.25, 1.05), (-1.6, 1.0), (-1.88, 0.975, 1), (-1.88, 0.7, 1), (1.05, 0.55, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.06), (0.5, 1.045), (0.72, 0.9), (0.81, 0.55), (0.845, 0.0), (0.825, -0.6), (0.74, -1.15), (0.6, -1.55), (0.33, -1.86),
    (0, -1.92),
]))

SIDE_WIN = [(0.72, 0.815, 1), (0.55, 0.862), (0.3, 0.975), (0.1, 1.045), (-0.15, 1.085), (-0.5, 1.09), (-0.85, 1.05), (-1.05, 0.995),
            (-1.13, 0.965, 1), (-0.85, 0.94), (-0.4, 0.89), (0.2, 0.85), (0.6, 0.822)]
WINDSHIELD = mirror_u([(0, 0.995), (0.5, 0.975), (0.64, 0.86), (0.67, 0.55), (0.63, 0.26), (0, 0.22)])
# (kept on the flat of the deck, inside the roof's corner fillets: glass laid across the fillet
# can't follow it, and the paint shows through at its edge)
REAR_GLASS = mirror_u([(0, -0.98), (0.43, -1.0), (0.455, -1.4), (0.36, -1.7), (0, -1.76)])
SIDE_INTAKE = [(-0.28, 0.64, 1), (-0.86, 0.7), (-0.92, 0.39, 1), (-0.5, 0.42)]
FRONT_MOUTH = mirror_u([(0, 0.338), (0.34, 0.334), (0.47, 0.3), (0.48, 0.2), (0.44, 0.162), (0, 0.158)])
HOOD_VENT = [(0.14, 1.84, 1), (0.4, 1.8, 1), (0.44, 1.58, 1), (0.18, 1.62, 1)]
FRONT_SIDE_INTAKE = [(0.54, 0.165, 1), (0.84, 0.165), (0.905, 0.37, 1), (0.58, 0.325, 1)]
HEAD = [(0.4, 0.468, 1), (0.55, 0.488), (0.72, 0.514), (0.86, 0.542), (0.915, 0.535, 1), (0.9, 0.505), (0.74, 0.468), (0.56, 0.446), (0.43, 0.442)]


def ramp(x, k):
    """Smooth max(x, 0): the shoulder crease."""
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def shoulder(z):
    return 0.58 + 0.07 * smoothstep(0.3, -1.6, z)


def sec(y, z):
    """Half-width share at height y: tucked sills, vertical flanks, a crisp shoulder line that
    kicks up over the rear haunches, tumblehome above it."""
    if y < 0.3:
        return 0.94 + 0.06 * smoothstep(0.1, 0.3, y)
    return 1.0 - ramp(y - shoulder(z), 0.011) * 0.3


def dip(ax, z):
    """The hood sinks between the crowned front fenders, the engine deck between the haunches.
    (Both stay sunk on under the glasshouse, where the factory's smooth blend hid them: the hood
    rising back under the windscreen, or the deck under the fastback, would lie within millimetres
    of the glass and fray the seam - see road.check_overlap. The deck rises again right behind the
    fastback, which ends in a small lip.)"""
    front = smoothstep(0.35, 0.65, z) * (1 - smoothstep(1.9, 2.2, z)) * 0.085 * (1 - smoothstep(0.28, 0.72, ax))
    rear = (1 - smoothstep(-1.2, -1.05, z)) * smoothstep(-1.94, -1.84, z) * 0.05 * (1 - smoothstep(0.55, 0.85, ax))
    return front + rear


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = body(coll, n)
    surf = road.Surface([skin])
    details_before_cuts(coll, n, skin, surf)
    arches(coll, n, skin)
    # everything is laid out on the un-cut skin (rays through a finished window would land on the
    # seats); pockets go into the solid skin, and hollowing the cabin last opens the windows
    surf = road.Surface([skin])
    glass_and_lamps(coll, n, surf, lod)
    parts(coll, n, surf, lod)
    openings(coll, n, skin, surf, lod)
    # far away the glass is opaque (see the game's FAR_ROLE), so the far model has no cockpit
    if lod != 'lod1':
        hollow(coll, n, skin)
    zones(skin)
    if lod != 'lod1':
        road.cockpit(coll, n, seat_x=0.37, seat_z=-0.33, floor_y=0.27, dash_z=0.62, dash_y=0.7, dash_w=0.7, wheel_z=0.34, wheel_y=0.7, recline=0.38)


def tilt(y):
    """The glasshouse's tumblehome."""
    return max(0.0, y - 0.78) * 0.42


def body(coll, n):
    """The body and glasshouse lofted from the drawings, the side scoop sculpted in, unioned."""
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, top=lambda ax, z, yt: yt - dip(ax, z),
                          keys=lambda z: (shoulder(z) + 0.012, 0.3), z_range=(-2.249, 2.256))
    # the scoop along the doors that deepens into the side intake (as the factory's smooth cut)
    def scoop(x, y, z):
        ax = abs(x)
        if ax < 0.6 or not (0.2 < y < 0.76) or not (-1.1 < z < 0.7):
            return x, y, z
        k = 1 - ((y - 0.48) / 0.19) ** 2 - ((z + 0.2) / 0.85) ** 2
        if k <= 0:
            return x, y, z
        xe = 1.19 - 0.3 * math.sqrt(k)
        return math.copysign(road.smin(ax, xe, 0.07), x), y, z

    road.displace(skin, scoop)
    return road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.022, z_range=(-1.878, 1.048)))


def details_before_cuts(coll, n, skin, surf):
    """Add-ons merged into the skin before the arches and openings trim them."""
    adds = []
    # side skirt blades along the sills
    for s in (1, -1):
        adds.append(geo.rbox(f'skirt_{s}', (s * 0.885, 0.13, 0.0), (0.045, 0.016, 1.05), coll, 'carbon', r=0.012, segs=n(3, 1)))
    # front splitter following the nose, 3.5 cm proud of it
    pts = [p for p in PLAN.poly if p[1] > 1.95]
    pts.sort(key=lambda p: math.atan2(p[1] - 1.95, p[0]))
    out = []
    for i, (x, z) in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        l = math.hypot(tx, tz) or 1
        out.append((x + tz / l * 0.035, z - tx / l * 0.035))
    outline = [(x, z) for x, z in out[::3]] + [(out[-1][0], 1.95, 1), (out[0][0], 1.95, 1)]
    adds.append(geo.plate('splitter', [(x, z, 1) if i in (0, len(outline) - 1) else (x, z) for i, (x, z, *_) in enumerate(outline)],
                          coll, 'carbon', plane='y', at=0.13, thick=0.02, per=1))
    for a in adds:
        geo.boolean(skin, a, op='UNION', sharp=50.0)


def arches(coll, n, skin):
    road.wheel_arches(coll, n, skin, WHEELS, gap=GAP)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors and the glasshouse's inside, 2.5 cm walls."""
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.535, 0.02), (0.74, 0.265, 0.88)), z_range=(-0.86, 0.9), tilt=tilt)


def openings(coll, n, skin, surf, lod):
    """Windows through the walls, lamp and intake pockets, vents, the rear panel."""
    if lod != 'lod1':
        for view in ('left', 'right'):
            road.pocket(skin, surf, view, SIDE_WIN, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
    # hood extractor vents
    for s in (1, -1):
        road.pocket(skin, surf, 'top', [(s * x, z, *f) for x, z, *f in HOOD_VENT], 0.045, coll, 'grille', 'trim', grid=0.02)
    # front intakes: the wide centre mouth and the finned side intakes
    road.pocket(skin, surf, 'front', FRONT_MOUTH, 0.075, coll, 'grille', 'trim', grid=0.025)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', [(s * x, y, *f) for x, y, *f in FRONT_SIDE_INTAKE], 0.075, coll, 'grille', 'trim', grid=0.025)
        # headlight housings (smoked chrome)
        road.pocket(skin, surf, 'front', [(s * x, y, *f) for x, y, *f in HEAD], 0.03, coll, 'head', 'trim', grid=0.012)
    # side intakes ahead of the rear wheels
    for view in ('left', 'right'):
        road.pocket(skin, surf, view, SIDE_INTAKE, 0.11, coll, 'grille', 'trim', grid=0.03)
    # tail lights: a full-width bar with L-shaped corners
    tail = [(-0.812, 0.887, 1), (0.812, 0.887, 1), (0.812, 0.715, 1), (0.768, 0.715, 1), (0.768, 0.845, 1), (-0.768, 0.845, 1),
            (-0.768, 0.715, 1), (-0.812, 0.715, 1)]
    road.pocket(skin, surf, 'rear', tail, 0.026, coll, 'tail', 'trim', grid=0.012)
    # the rear mesh panel behind louvres
    rp = [(-0.66, 0.58, 1), (0.66, 0.58, 1), (0.66, 0.8, 1), (-0.66, 0.8, 1)]
    road.pocket(skin, surf, 'rear', rp, 0.06, coll, 'grille', 'trim', grid=0.03)


def zones(skin):
    """Underbody, sills, chin, diffuser and lower rear fascia in black and carbon."""
    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        ax = abs(x)
        if y < 0.118:
            return 'trim'
        if y < 0.2 and abs(z) < 0.95 and ax > 0.6:
            return 'carbon'
        if y < 0.165 and z > 1.9:
            return 'carbon'
        if z < -1.5 and y < 0.5 and ax < 0.8:
            return 'carbon'
        if z < -2.0 and y < 0.58 and ax < 0.8:
            return 'carbon'
        return None

    road.zones(skin, fn, ys=(0.118, 0.2, 0.165, 0.5, 0.58), zs=(0.95, -0.95, 1.9, -1.5, -2.0), xs=(0.6, 0.8))


def glass_and_lamps(coll, n, surf, lod):
    g = 0.04  # (the full model's; it coarsens with the level)
    # (the far model's glass sits on the solid body: it has no window openings)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        road.panel(f'side_glass_{view}', surf, view, SIDE_WIN, coll, 'window', depth=d, grid=g)
        # a slim black surround round the glass
        if lod != 'lod1':
            road.ring_panel(f'window_surround_{view}', surf, view, SIDE_WIN, coll, 'trim', width=0.012)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll)
    # engine-cover glass laid on the deck in a black border
    road.glass_panel('engine_glass', surf, 'top', REAR_GLASS, coll, grid=g, border=0.014 if lod != 'lod1' else 0)
    for s in (1, -1):
        # headlights: an LED light guide along the top of the housing hooking down at the corner,
        # two projector lenses in chrome rings, a clear cover over all of it
        road.ribbon(f'drl_{s}', surf, 'front', [(s * u, v) for u, v in [(0.44, 0.467), (0.55, 0.479), (0.72, 0.504), (0.86, 0.53), (0.895, 0.515)]],
                    coll, 'drl', width=0.009, depth=0.012, thick=0.006, per=n(6, 3))
        for u, v in [(0.585, 0.463), (0.705, 0.481)]:
            road.disc(f'projector_ring_{s}_{u}', surf, 'front', (s * u, v), 0.019, coll, 'chrome', depth=0.024, thick=0.01, sides=n(20, 10))
            road.disc(f'projector_{s}_{u}', surf, 'front', (s * u, v), 0.0135, coll, 'lens', depth=0.016, thick=0.006, sides=n(18, 8))
        # an amber turn-signal segment in the housing's outer corner
        road.ribbon(f'head_indicator_{s}', surf, 'front', [(s * 0.8, 0.5), (s * 0.885, 0.516)], coll, 'indicator', width=0.012,
                    depth=0.02, thick=0.006, per=1)
        # tail light L-corners
        road.ribbon(f'tail_l_{s}', surf, 'rear', [(0.66 * s, 0.866), (0.79 * s, 0.866), (0.79 * s, 0.73)], coll, 'tailglow',
                    width=0.011, depth=0.012, thick=0.005, per=1)
        # side markers at the nose corners
        road.ribbon(f'marker_{s}', surf, 'left' if s > 0 else 'right', [(1.98, 0.47), (1.9, 0.5)], coll, 'amber', width=0.012,
                    depth=0.002, thick=0.004, per=1)
    road.ribbon('tail_bar', surf, 'rear', [(-0.66, 0.866), (0.66, 0.866)], coll, 'tailglow', width=0.006, depth=0.014, thick=0.005, per=1)
    # third brake light along the ducktail's lip
    road.ribbon('brake_strip', surf, 'rear', [(-0.36, 1.0), (0.36, 1.0)], coll, 'tailglow', width=0.007, depth=0.0, thick=0.004, per=1)


def parts(coll, n, surf, lod):
    # hood vent louvres
    vent = Outline([(x, z, 1) for x, z, *_ in HOOD_VENT], step=0.01)
    for s in (1, -1) if lod != 'lod1' else ():
        for i in range(5):
            zs = 1.615 + i * 0.05
            span = vent.span_u(zs)
            if span:
                road.ribbon(f'hood_louvre_{s}{i}', surf, 'top', [(s * (span[0] + 0.012), zs), (s * (span[1] - 0.012), zs)], coll, 'carbon',
                            width=0.016, depth=0.04, thick=0.034, per=1)
    # front: a body-colour aero blade across the mouth, fins in the side intakes, a badge
    h = surf.project('front', 0.0, 0.252)
    if h:
        zf = h[0][2]
        geo.rbox('aero_blade', (0, 0.252, zf - 0.04), (0.465, 0.0075, 0.03), coll, 'paint', r=0.006, segs=n(2, 1))
    for s in (1, -1):
        for xf in (0.66, 0.76):
            hf = surf.project('front', s * xf, 0.25)
            if hf:
                geo.rbox(f'intake_fin_{s}{xf}', (s * xf, 0.255, hf[0][2] - 0.045), (0.006, 0.075, 0.04), coll, 'carbon', r=0.003, segs=1)
    road.ribbon('badge', surf, 'front', [(-0.05, 0.395), (0.0, 0.375), (0.05, 0.395)], coll, 'chrome', width=0.012, depth=0.0, thick=0.006, per=1)
    # side intake strakes
    for view in ('left', 'right'):
        road.ribbon(f'side_strake_{view}', surf, view, [(-0.32, 0.565), (-0.88, 0.524)], coll, 'carbon', width=0.016, depth=0.1, thick=0.097, per=1)
    # rear panel louvres (stopping short of the exhausts) and the exhausts
    for i in range(5 if lod != 'lod1' else 0):
        y = 0.605 + i * 0.04
        segs = [(-0.62, 0.62)]
        dy = abs(y - 0.665)
        if dy < 0.068:
            hw = math.sqrt(0.068 ** 2 - dy ** 2)
            segs = [(-0.62, -0.13 - hw), (-0.13 + hw, 0.13 - hw), (0.13 + hw, 0.62)]
        for a, b in segs:
            if b - a > 0.03:
                road.ribbon(f'rear_louvre_{i}_{a:.2f}', surf, 'rear', [(a, y), (b, y)], coll, 'carbon', width=0.014, depth=0.06, thick=0.056, per=1)
    for s in (1, -1):
        road.exhaust_tip(coll, n, (s * 0.13, 0.665, -2.262), 0.054, 0.12, f'{s}')
        # reverse lamps at the rear panel's outer ends
        road.disc(f'reverse_{s}', surf, 'rear', (s * 0.56, 0.69), 0.03, coll, 'reverse', depth=0.05, thick=0.012, sides=n(20, 10))
    # diffuser strakes hanging under the rear ramp
    for xf in (0.0, 0.27, -0.27, 0.54, -0.54):
        top = []
        for k in range(9):
            z = -1.63 - 0.64 * k / 8
            span = SIDE.span_v(z)
            if span:
                top.append((z, span[0] - 0.004))
        if len(top) > 2:
            outline = [(z, y) for z, y in top] + [(z, max(0.11, y - 0.065)) for z, y in reversed(top)]
            outline = [(z, y, 1) if i in (0, len(top) - 1, len(top), len(outline) - 1) else (z, y) for i, (z, y) in enumerate(outline)]
            geo.plate(f'strake_{xf}', outline, coll, 'carbon', plane='x', at=xf, thick=0.01, per=2)
    # door mirrors on stalks from the door tops, with repeaters
    for s in (1, -1):
        geo.strut(f'mirror_stalk_{s}', (s * 0.845, 0.795, 0.675), (s * 0.935, 0.875, 0.632), coll, width=0.03, thick=0.022, role='trim', sides=n(10, 6))
        geo.rbox(f'mirror_{s}', (s * 1.0, 0.893, 0.62), (0.095, 0.046, 0.042), coll, 'paint', r=0.036, segs=n(3, 1))
        geo.rbox(f'mirror_glass_{s}', (s * 1.0, 0.893, 0.575), (0.082, 0.036, 0.004), coll, 'chrome', r=0.012, segs=n(2, 1))
        geo.rbox(f'mirror_repeater_{s}', (s * 1.085, 0.885, 0.64), (0.012, 0.007, 0.03), coll, 'amber', r=0.005, segs=1)
    if lod == 'lod1':
        return
    # flush door handles
    for view, s in (('left', 1), ('right', -1)):
        h = surf.project(view, -0.08, 0.72)
        if h:
            p, nrm = h
            geo.rbox(f'door_handle_{s}', (p[0] - s * 0.002, p[1], p[2]), (0.008, 0.012, 0.075), coll, 'chrome', r=0.006, segs=n(2, 1))
    # wipers resting along the bottom of the windscreen
    for x0, x1, tag in ((0.32, -0.28, 'l'), (-0.08, -0.62, 'r')):
        road.bead(f'wiper_arm_{tag}', surf, 'top', [(x0, 0.955), (x1, 0.9)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{tag}', surf, 'top', [(x0 - 0.12 * (x0 - x1) / abs(x0 - x1), 0.948), (x1, 0.896)], coll, 'trim', radius=0.008,
                  lift=0.006, per=1, sides=n(6, 4))
    # a small shark-fin antenna at the back of the roof
    h = surf.project('top', 0.0, -0.95)
    if h:
        y = h[0][1]
        geo.plate('antenna', [(-0.86, y - 0.01, 1), (-1.02, y - 0.01, 1), (-0.97, y + 0.05), (-0.9, y + 0.055)], coll, 'trim', plane='x', at=0.0, thick=0.022, per=3)
