"""MOCHI: a 90s Japanese kei box car. A tiny, tall box on 13-inch wheels, cheap but with all the
parts a real one has: unpainted dark grey bumpers wrapping round to the wheel arches and a moulding
along the doors in the same plastic, a short nose with round headlamps in chrome bezels either side
of a chrome-framed grille, amber corner lamps and a slatted intake in the bumper, side repeaters, a
black cowl and wipers at the foot of an upright windshield, a black belt moulding under a tall
glasshouse with five doors' worth of glass and black pillars, roof rails on feet with two cross
bars, a lip spoiler with a third brake lamp, tall tail lamps in the back corners (amber, red and
clear), a chrome garnish over the plate, a rear wiper, a fuel flap, mud flaps and one little
exhaust. Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/mochi.js). The tailgate's glass
stands 3 cm behind the tail panel below it: the two flat faces would otherwise meet edge to edge,
and the seam frays.
"""
from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.18, 'y': 0.27, 'x': 0.63, 'r': 0.27, 'w': 0.155},
    'rear': {'z': -1.18, 'y': 0.27, 'x': 0.63, 'r': 0.27, 'w': 0.155},
}
GAP = 0.035

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y): the doors (the front one's
    # leading edge rounding the wheel arch), the hood, its front edge over the lamps, the tailgate
    'panels': {
        'side': [
            [[1.06, 0.88], [1.04, 0.62], [0.98, 0.5], [0.9, 0.4], [0.87, 0.28], [0.06, 0.28], [0.06, 0.935]],
            [[0.06, 0.28], [-0.82, 0.28], [-0.82, 0.94]],
        ],
        'top': [[[-0.66, 1.17], [0.66, 1.17], [0.7, 1.68], [-0.7, 1.68], [-0.66, 1.17]]],
        'front': [[[-0.62, 0.735], [0.62, 0.735]]],
        'rear': [[[-0.54, 1.55], [-0.54, 0.41], [0.54, 0.41], [0.54, 1.55]]],
    },
    # `plate`: the licence plate painted into the tail's recess (rear view, metres); `door`: a door
    # number's roundel, above the moulding
    'livery': {
        'door': [0.5, 0.665],
        'shoulder': 0.75,
        'cabin': {'x': 0.6, 'z0': -1.6, 'z1': 1.1},
        'plate': {'x': 0, 'y': 0.51, 'w': 0.3, 'h': 0.15, 'text': 'KEI 660'},
    },
    'tailLights': [[0.66, 0.655, -1.69], [-0.66, 0.655, -1.69]],
    'headLights': [[0.49, 0.615, 1.73], [-0.49, 0.615, 1.73]],
    'exhausts': [[-0.42, 0.152, -1.72]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5}

# ------------------------------------------------------------------------------- drawings
# (the factory's drawings, re-spaced: a short segment beside a long one overshoots, see views.densify)
SIDE = Outline([
    (1.66, 0.18, 1), (1.72, 0.24), (1.74, 0.34), (1.74, 0.48), (1.72, 0.66), (1.66, 0.75), (1.5, 0.8), (1.25, 0.84), (1.1, 0.865),
    (0.8, 0.876), (0.5, 0.885), (0.0, 0.893), (-0.5, 0.9), (-1.1, 0.912), (-1.45, 0.92), (-1.6, 0.925), (-1.66, 0.92), (-1.68, 0.898),
    (-1.684, 0.8), (-1.685, 0.55), (-1.678, 0.36), (-1.655, 0.26), (-1.61, 0.2), (-1.55, 0.18, 1),
])
PLAN = Outline(mirror_u([
    (0, 1.74), (0.3, 1.738), (0.56, 1.73), (0.68, 1.68), (0.735, 1.57), (0.74, 1.4, 1), (0.74, -1.5, 1), (0.737, -1.575), (0.722, -1.635),
    (0.69, -1.668), (0.62, -1.683), (0.4, -1.687), (0, -1.688),
]))
CAB_SIDE = Outline([
    (1.16, 0.8, 1), (1.1, 0.865, 1), (0.75, 1.4), (0.62, 1.55), (0.48, 1.6), (0.25, 1.61), (-0.3, 1.617), (-0.9, 1.62), (-1.3, 1.619),
    (-1.45, 1.612), (-1.54, 1.594), (-1.59, 1.56), (-1.612, 1.5), (-1.625, 1.33), (-1.64, 1.13), (-1.652, 0.93, 1), (-1.652, 0.78, 1),
    (1.16, 0.75, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.17), (0.4, 1.168), (0.6, 1.16), (0.68, 1.1), (0.7, 0.98, 1), (0.7, -1.45, 1), (0.686, -1.56), (0.635, -1.628), (0.5, -1.65),
    (0.3, -1.654), (0, -1.655),
]))

FRONT_WIN = [(1.0, 0.94, 1), (0.66, 1.46), (0.56, 1.54, 1), (0.1, 1.55, 1), (0.1, 0.94, 1)]
REAR_WIN = [(0.02, 1.55, 1), (-0.78, 1.555, 1), (-0.78, 0.945, 1), (0.02, 0.94, 1)]
QUARTER_WIN = [(-0.86, 1.555, 1), (-1.33, 1.56), (-1.405, 1.53), (-1.42, 1.46), (-1.42, 0.95, 1), (-0.86, 0.946, 1)]
SIDE_WINS = (FRONT_WIN, REAR_WIN, QUARTER_WIN)
# (kept inside the A-pillars' fillets, see marshal.py)
WINDSHIELD = mirror_u([(0, 1.085), (0.55, 1.08), (0.6, 1.045), (0.6, 0.85), (0.585, 0.72), (0.555, 0.64), (0, 0.625)])
REAR_GLASS = rrect(0, 1.255, 0.46, 0.235, 0.045)
# tall tail lamps in the back corners, wrapping halfway round them: amber at the top, clear at the
# bottom (kept below the tail's tight curve into the top, and off the corner's side-facing half:
# seen from behind it's at a grazing angle, and an outline projected there comes out ragged)
TAIL = rrect(0.6525, 0.655, 0.0675, 0.225, 0.026)
TAIL_REVERSE = [(0.585, 0.53, 1), (0.585, 0.456), (0.593, 0.437), (0.611, 0.43), (0.694, 0.43), (0.712, 0.437), (0.72, 0.456), (0.72, 0.53, 1)]
TAIL_AMBER = [(0.72, 0.78, 1), (0.585, 0.78, 1), (0.585, 0.854), (0.593, 0.873), (0.611, 0.88), (0.694, 0.88), (0.712, 0.873), (0.72, 0.854)]
# the lip spoiler (side and plan views), carrying the roof on over the tailgate: it starts inside the
# roof, whose rounded back edge crosses its top at a steep angle, and its ends round off with the
# roof's corners
SPOILER_SIDE = Outline([(-1.52, 1.585), (-1.6, 1.586), (-1.68, 1.584), (-1.705, 1.58), (-1.713, 1.571, 1), (-1.713, 1.558, 1),
                        (-1.69, 1.553), (-1.63, 1.549), (-1.58, 1.545), (-1.52, 1.54, 1)])
SPOILER_PLAN = Outline(mirror_u([(0, -1.5), (0.4, -1.5), (0.624, -1.5, 1), (0.622, -1.58), (0.612, -1.64), (0.588, -1.684), (0.54, -1.708),
                                 (0.4, -1.714), (0, -1.716)]))
HEAD_X, HEAD_Y = 0.49, 0.615


def sec(y, z):
    """Slab sides tucked in at the sills, leaning in above a crisp line under the windows."""
    if y < 0.3:
        return 0.95 + 0.05 * smoothstep(0.18, 0.3, y)
    return 1.0 - max(0.0, y - 0.78) * 0.06


def tilt(y):
    return max(0.0, y - 0.95) * 0.1


def belt(z):
    """The top of the black belt moulding, just under the body's top edge (rising to the tail)."""
    return 0.853 + 0.02115 * (1.1 - z)


# ------------------------------------------------------------------------------------ build
def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = body(coll, n)
    road.wheel_arches(coll, n, skin, WHEELS, gap=GAP)
    # everything is laid out on the un-cut skin; pockets go into the solid skin, and hollowing the
    # cabin last opens the windows
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


def body(coll, n):
    """The body and glasshouse lofted from the drawings, the bumpers, door mouldings and lip
    spoiler merged in."""
    # (a short car: fewer stations than the full-size cars' 130 keep the same spacing; few points
    # along the hidden floor)
    counts = (n(14), n(6), (n(4), n(10), n(5)), n(4), n(5))
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=lambda z: (0.78, 0.3), r_top=0.025, r_bot=0.04, stations=104, counts=counts)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.015, r_top=0.05, stations=74,
                                            counts=(n(10), n(6), (n(12),), 2, 2)))
    # the bumpers: the body grown 12 mm, cut to the bumpers' extent (they wrap round to the wheel
    # arches, which trim their ends)
    side, plan = road.offset_outline(SIDE, 0.012), road.offset_outline(PLAN, 0.012)
    for name, zr, clip in (('bumper_front', (1.3, plan.vmax - 0.003), ((0, 0.235, 1.75), (1.2, 0.235, 0.35))),
                           ('bumper_rear', (plan.vmin + 0.003, -1.3), ((0, 0.2, -1.75), (1.2, 0.2, 0.35)))):
        b = road.view_body(name, coll, n, side, plan, sec=sec, keys=lambda z: (0.3,), r_top=0.025, r_bot=0.04, z_range=zr, role='plastic',
                           stations=34, counts=(n(8), n(4), (n(6), n(8)), n(4), n(5)))
        geo.boolean(b, geo.box(name + '_clip', *clip, coll), op='INTERSECT', sharp=50.0)
        geo.boolean(skin, b, op='UNION', sharp=50.0)
    surf = road.Surface([skin])
    for view in ('left', 'right'):
        m = road.ribbon(f'moulding_{view}', surf, view, [(0.96, 0.42), (-0.96, 0.42)], coll, 'plastic', width=0.04, depth=0.008, thick=0.016, per=1)
        if m:
            geo.boolean(skin, m, op='UNION', sharp=50.0)
    spoiler = road.view_body('spoiler', coll, n, SPOILER_SIDE, SPOILER_PLAN, r_top=0.008, r_bot=0.006, stations=36,
                             counts=(n(10), n(4), (n(3),), n(3), n(8)))
    geo.boolean(skin, spoiler, op='UNION', sharp=50.0)
    return skin


def glass(coll, n, surf, lod):
    g = 0.05  # (the full model's; it coarsens with the level; flat glass)
    # (the far model's glass sits on the solid body: it has no window openings)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        for i, win in enumerate(SIDE_WINS):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'surround_{view}{i}', surf, view, win, coll, 'trim', width=0.012)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('rear_glass', surf, 'rear', REAR_GLASS, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll)
        road.ring_panel('rear_surround', surf, 'rear', REAR_GLASS, coll, 'trim', width=0.012)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        c = (s * HEAD_X, HEAD_Y)
        # round headlamps: a chrome bezel round a smoked reflector, the lens and a chrome bulb shield
        road.bead(f'head_bezel_{s}', surf, 'front', circle(*c, 0.088, n(32, 14)), coll, 'chrome', radius=0.008, lift=0.003, per=1,
                  sides=n(8, 4), closed=True)
        road.disc(f'head_lens_{s}', surf, 'front', c, 0.052, coll, 'lens', depth=0.024, thick=0.006, sides=n(28, 12))
        road.disc(f'head_shield_{s}', surf, 'front', c, 0.017, coll, 'chrome', depth=0.016, thick=0.006, sides=n(16, 8))
        # the tail lamps: clear and amber inserts on the red lamp's floor, black dividers, a bright
        # bar down the red
        road.panel(f'tail_reverse_{s}', surf, 'rear', sym(TAIL_REVERSE, s), coll, 'reverse', depth=0.007, thick=0.002, grid=0.02)
        road.panel(f'tail_amber_{s}', surf, 'rear', sym(TAIL_AMBER, s), coll, 'indicator', depth=0.007, thick=0.002, grid=0.02)
        for yd in (0.53, 0.78):
            road.ribbon(f'tail_divider_{s}{yd}', surf, 'rear', [(s * 0.585, yd), (s * 0.722, yd)], coll, 'trim', width=0.006, depth=0.008,
                        thick=0.004, per=1)
        road.ribbon(f'tail_glow_{s}', surf, 'rear', [(s * 0.652, 0.56), (s * 0.652, 0.75)], coll, 'tailglow', width=0.032, depth=0.007,
                    thick=0.003, per=1)
    # the grille: a chrome frame, two chrome bars and a blank badge plate on them
    road.bead('grille_frame', surf, 'front', rrect(0, HEAD_Y, 0.337, 0.057, 0.026, n(4, 2)), coll, 'chrome', radius=0.0055, lift=0.002,
              per=2, sides=n(8, 4), closed=True)
    for yb in (0.598, 0.632):
        road.ribbon(f'grille_bar_{yb}', surf, 'front', [(-0.326, yb), (0.326, yb)], coll, 'chrome', width=0.009, depth=0.024, thick=0.021, per=1)
    road.panel('badge', surf, 'front', rrect(0, HEAD_Y, 0.046, 0.022, 0.012), coll, 'chrome', depth=-0.003, thick=0.027, grid=0.01)
    # the bumper intake's slats
    for ys in (0.284, 0.316):
        road.ribbon(f'intake_slat_{ys}', surf, 'front', [(-0.35, ys), (0.35, ys)], coll, 'plastic', width=0.011, depth=0.029, thick=0.026, per=1)
    # the third brake lamp along the spoiler's trailing edge
    geo.rbox('brake_lamp', (0, 1.5645, -1.7133), (0.15, 0.0045, 0.0015), coll, 'tailglow', r=0.0012, segs=1)


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    # roof rails: chrome bars on black feet, two cross bars clamped on
    for s in (1, -1):
        x = s * 0.56

        def roof(z, x=x):
            h = surf.project('top', x, z)
            return h[0][1] if h else 1.6

        yr = 1.672
        path = [(x, roof(0.47) + 0.014, 0.47), (x, yr - 0.006, 0.43), (x, yr, 0.38), (x, yr, -1.24), (x, yr - 0.006, -1.29), (x, roof(-1.33) + 0.014, -1.33)]
        geo.tube(f'rail_{s}', path, coll, radius=0.013, role='chrome', sides=n(10, 6), smooth_path=n(4, 2))
        for zf in (0.45, -0.43, -1.31):
            y0 = roof(zf) - 0.006
            geo.rbox(f'rail_foot_{s}{zf}', (x, (y0 + yr) / 2, zf), (0.018, (yr - y0) / 2, 0.036), coll, 'trim', r=0.01, segs=n(2, 1))
    for zb in (0.1, -0.95):
        geo.tube(f'crossbar_{zb}', [(-0.56, 1.69, zb), (0.56, 1.69, zb)], coll, radius=(0.011, 0.021), role='chrome', sides=n(12, 6))
        for s in (1, -1):
            geo.rbox(f'crossbar_clamp_{zb}{s}', (s * 0.56, 1.684, zb), (0.022, 0.018, 0.027), coll, 'trim', r=0.008, segs=n(2, 1))
    # little black door mirrors at the front corners of the door glass
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.695, 0.955, 0.99), (0.805, 0.99, 0.97), (0.052, 0.038, 0.028), glass_role='chrome', body_role='trim',
                         arm_role='trim', r=0.013)
    # mud flaps hanging in the back of every wheel arch, one little exhaust under the right of the
    # rear bumper
    for s in (1, -1):
        for zf in (0.888, -1.472):
            geo.rbox(f'mud_flap_{s}{zf}', (s * 0.64, 0.19, zf), (0.072, 0.085, 0.005), coll, 'trim', r=0.004, segs=n(2, 1))
    road.exhaust_tip(coll, n, (-0.42, 0.152, -1.715), 0.022, 0.13, 'tip', depth=0.05)
    # the black cowl at the foot of the windshield
    road.panel('cowl', surf, 'top', rect(-0.62, 0.62, 1.1, 1.165), coll, 'plastic', depth=-0.003, thick=0.006, grid=0.03)
    if lod == 'lod1':
        return
    for i in range(-4, 5):
        road.ribbon(f'cowl_slot_{i}', surf, 'top', [(i * 0.12 - 0.04, 1.14), (i * 0.12 + 0.04, 1.14)], coll, 'trim', width=0.012,
                    depth=-0.0045, thick=0.001, per=1)
    # black door pulls (in cups, see openings)
    for view in ('left', 'right'):
        for zc in (0.2, -0.66):
            road.ribbon(f'handle_{view}{zc}', surf, view, [(zc + 0.045, 0.84), (zc - 0.045, 0.84)], coll, 'trim', width=0.016, depth=0.012,
                        thick=0.016, per=1)
    # wipers parked at the foot of the windshield, pivots on the cowl; the rear wiper along the
    # bottom of the tailgate glass
    for pts, blade, x0 in (([(0.36, 1.125), (0.27, 1.075), (-0.1, 1.05)], [(0.3, 1.068), (-0.12, 1.046)], 0.36),
                           ([(-0.15, 1.125), (-0.24, 1.075), (-0.58, 1.05)], [(-0.21, 1.068), (-0.58, 1.046)], -0.15)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', pts, coll, 'trim', radius=0.006, lift=0.01, per=4, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', blade, coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))
        h = surf.project('top', x0, 1.125)
        if h:
            p = h[0]
            geo.cylinder(f'wiper_pivot_{x0}', (p[0], p[1], p[2]), (p[0], p[1] + 0.018, p[2]), 0.013, coll, 'trim', sides=n(12, 6))
    road.bead('rear_wiper_arm', surf, 'rear', [(0.0, 0.995), (0.4, 1.04)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
    road.bead('rear_wiper_blade', surf, 'rear', [(0.06, 1.036), (0.43, 1.046)], coll, 'trim', radius=0.008, lift=0.007, per=1, sides=n(6, 4))
    h = surf.project('rear', 0.0, 0.995)
    if h:
        p = h[0]
        geo.cylinder('rear_wiper_pivot', p, (p[0], p[1], p[2] - 0.02), 0.014, coll, 'trim', sides=n(12, 6))
    # the chrome garnish over the plate
    road.panel('garnish', surf, 'rear', rrect(0, 0.645, 0.34, 0.016, 0.008), coll, 'chrome', depth=-0.004, thick=0.008, grid=0.02)


def openings(coll, n, skin, surf, lod):
    """Windows, lamp housings, the grille and intake, the plate recess and the small pockets."""
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'rear', REAR_GLASS, 0.045, coll, 'trim', grid=0.03)
    far = lod == 'lod1'
    for s in (1, -1):
        c = (s * HEAD_X, HEAD_Y)
        # the headlamps' reflectors: a shallow chrome-walled bowl, a deeper one behind the lens
        road.pocket(skin, surf, 'front', circle(*c, 0.082, n(32, 16)), 0.022, coll, 'head', 'chrome', grid=0.012)
        if not far:
            road.pocket(skin, surf, 'front', circle(*c, 0.062, n(28, 14)), 0.036, coll, 'head', grid=0.012)
        # amber corner lamps in the bumper, tail lamps, red reflectors in the rear bumper's corners
        road.pocket(skin, surf, 'front', sym(rrect(0.6, 0.4, 0.08, 0.028, 0.015), s), 0.012, coll, 'amber', 'trim', grid=0.01)
        road.pocket(skin, surf, 'rear', sym(TAIL, s), 0.01, coll, 'tail', 'trim', grid=0.012)
        reflector = sym(rrect(0.57, 0.31, 0.06, 0.014, 0.006), s)
        if far:
            road.panel(f'reflector_{s}', surf, 'rear', reflector, coll, 'tail', depth=-0.002, thick=0.004, grid=0.02)
        else:
            road.pocket(skin, surf, 'rear', reflector, 0.006, coll, 'tail', 'trim', grid=0.01)
    road.pocket(skin, surf, 'front', rrect(0, HEAD_Y, 0.33, 0.05, 0.02), 0.025, coll, 'grille', 'trim', grid=0.015)
    road.pocket(skin, surf, 'front', rrect(0, 0.3, 0.36, 0.04, 0.025), 0.03, coll, 'grille', 'plastic', grid=0.015)
    # the plate recess (the livery paints the plate) and the tailgate handle's slot under the garnish
    road.pocket(skin, surf, 'rear', rrect(0, 0.51, 0.16, 0.078, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)
    if far:
        # (the far model: the small things laid on instead of cut in, or left out)
        for view in ('left', 'right'):
            road.panel(f'repeater_{view}', surf, view, rrect(1.32, 0.665, 0.024, 0.01, 0.008), coll, 'indicator', depth=-0.002, thick=0.004,
                       grid=0.02)
        return
    road.pocket(skin, surf, 'rear', rrect(0, 0.618, 0.075, 0.009, 0.006), 0.014, coll, 'trim', grid=0.01)
    for view in ('left', 'right'):
        # amber side repeaters on the front fenders, cups for the door pulls
        road.pocket(skin, surf, view, rrect(1.32, 0.665, 0.024, 0.01, 0.008), 0.005, coll, 'indicator', 'trim', grid=0.01)
        for zc in (0.2, -0.66):
            road.pocket(skin, surf, view, rrect(zc, 0.84, 0.055, 0.019, 0.012), 0.012, coll, 'trim', grid=0.01)
    # the fuel flap in the right rear quarter
    road.pocket(skin, surf, 'right', rrect(-1.26, 0.72, 0.06, 0.055, 0.02), 0.0025, coll, 'paint', 'trim', grid=0.015)


def hollow(coll, n, skin):
    """The cabin hollowed: footwells between the front wheel wells, the cargo floor between the rear
    ones (the wheel wells stay closed off), a tub between the doors and the glasshouse's inside."""
    segs = n(3, 1)
    geo.boolean(skin, geo.rbox('footwell', (0, 0.535, 0.89), (0.44, 0.285, 0.11), coll, 'interior', r=0.05, segs=segs), sharp=50.0)
    geo.boolean(skin, geo.rbox('cargo', (0, 0.59, -1.2), (0.44, 0.24, 0.4), coll, 'interior', r=0.05, segs=segs), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.545, 0.0), (0.67, 0.295, 0.83)), z_range=(-1.632, 1.0), tilt=tilt, wall=0.025,
                floor=0.6)


def zones(skin, lod):
    """The underbody, the black belt moulding along the foot of the side glass (over the shoulder)
    and the black pillars between the side windows (not on the far model, where they'd be a few
    pixels and every zone's cuts cost triangles)."""
    pillars = lod != 'lod1'

    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        ax = abs(x)
        if y < 0.195:
            return 'trim'
        if ax > 0.66 and -1.6 < z < 1.06 and belt(z) < y < 0.94:
            return 'trim'
        if pillars and ax > 0.6 and 0.94 < y < 1.565 and (0.01 < z < 0.11 or -0.87 < z < -0.77):
            return 'trim'
        return None

    road.slice_plane(skin, (0, belt(0.0), 0), (0, 1, 0.02115))
    road.zones(skin, fn, ys=(0.195, 0.94) + ((1.565,) if pillars else ()), zs=(1.06, -1.6) + ((0.01, 0.11, -0.77, -0.87) if pillars else ()),
               xs=(0.66,) + ((0.6,) if pillars else ()))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.32, seat_z=0.2, floor_y=0.28, dash_z=0.86, dash_y=0.84, dash_w=0.64, wheel_z=0.66, wheel_y=0.92, recline=0.22)
    segs = n(3, 1)
    geo.rbox('bench', (0, 0.42, -0.65), (0.58, 0.07, 0.22), coll, 'interior', r=0.05, segs=segs)
    geo.rbox('bench_back', (0, 0.72, -0.9), (0.58, 0.28, 0.07), coll, 'interior', r=0.05, segs=segs)
