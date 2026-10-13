"""VICE: an 80s flat-12 supercar, low and very wide at the back. A short nose under a long convex
hood with the pop-up lamps folded flush, a black grille band between rectangular corner lamps, one
mirror high on the driver's windshield pillar, five thin strakes running from the middle of the
door over the side intakes into the wide rear hips, the roof running back into two flying
buttresses that fade into a low tail either side of a smooth engine lid (a brake-lamp pod on it, a
black vent behind it), black slats right across the tail over the lamps, and a bumper standing out
beneath them with a wide black panel behind the plate and four pipes in a black valance under it.
No wing. The side elevation is traced from a reference drawing and the tail follows a photo (both
the user's); drawings from the car factory's design (tools/car-factory/designs/vice.js).
Left-hand drive.
"""
import math

from lib import geo, road
from lib.road import rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.162, 'y': 0.318, 'x': 0.765, 'r': 0.318, 'w': 0.225, 'rim': 0.205},
    'rear': {'z': -1.388, 'y': 0.328, 'x': 0.83, 'r': 0.328, 'w': 0.265, 'rim': 0.205},
}

META = {
    'wheels': WHEELS,
    # the pop-up lamps fold flush into the fenders' front corners; the engine lid between the
    # buttresses
    'panels': {
        'side': [[[0.73, 0.775], [0.74, 0.5], [0.73, 0.245]], [[-0.384, 0.805], [-0.384, 0.245]]],
        'top': [
            [[-0.62, 0.92], [0.62, 0.92], [0.72, 1.35], [0.5, 1.55], [0.5, 2.06], [-0.5, 2.06], [-0.5, 1.55], [-0.72, 1.35], [-0.62, 0.92]],
            [[0.5, 1.57], [0.88, 1.57]], [[0.5, 1.93], [0.86, 1.93]], [[-0.5, 1.57], [-0.88, 1.57]], [[-0.5, 1.93], [-0.86, 1.93]],
            [[-0.47, -0.86], [0.47, -0.86], [0.47, -1.86], [-0.47, -1.86], [-0.47, -0.86]],
        ],
    },
    'livery': {
        'door': [0.45, 0.66],
        'shoulder': 0.76,
        'cabin': {'x': 0.62, 'z0': -0.8, 'z1': 0.86},
        'plate': {'x': 0, 'y': 0.41, 'w': 0.31, 'h': 0.155, 'text': 'VICE 86'},
    },
    'tailLights': [[0.71, 0.634, -2.09], [-0.71, 0.634, -2.09]],
    'headLights': [[0.76, 0.36, 2.15], [-0.76, 0.36, 2.15]],
    'exhausts': [[0.435, 0.31, -2.16], [0.525, 0.31, -2.16], [-0.435, 0.31, -2.16], [-0.525, 0.31, -2.16]],
}

AO_STRENGTH = {'grille': 0.5, 'interior': 0.5}

SIDE = Outline([
    (2.1, 0.16, 1), (2.14, 0.235), (2.145, 0.3), (2.147, 0.4), (2.145, 0.5), (2.125, 0.522), (2.087, 0.531, 1), (2.047, 0.55),
    (1.98, 0.592), (1.847, 0.645), (1.715, 0.682), (1.582, 0.711), (1.45, 0.737), (1.316, 0.76), (1.157, 0.784), (0.97, 0.818),
    (0.864, 0.84), (0.8, 0.81), (0.65, 0.778), (0.3, 0.783), (-0.1, 0.79), (-0.38, 0.8), (-0.6, 0.82), (-0.85, 0.838), (-1.3, 0.842),
    (-1.8, 0.84), (-2.0, 0.833), (-2.075, 0.822, 1), (-2.08, 0.62), (-2.085, 0.56, 1), (-2.13, 0.545), (-2.145, 0.5), (-2.146, 0.42),
    (-2.135, 0.36), (-2.105, 0.3), (-2.04, 0.265), (-1.95, 0.25, 1), (-1.75, 0.22), (-1.5, 0.16), (-1.0, 0.15, 1), (1.0, 0.15, 1),
    (1.5, 0.16), (1.8, 0.16),
])
PLAN = Outline(mirror_u([
    (0, 2.152), (0.55, 2.14), (0.8, 2.09), (0.9, 1.95), (0.925, 1.7), (0.93, 1.15), (0.925, 0.75), (0.915, 0.35), (0.93, -0.05),
    (0.97, -0.5), (0.99, -0.9), (0.995, -1.4), (0.99, -1.8), (0.97, -2.02), (0.9, -2.12), (0.6, -2.15), (0, -2.155),
]))
CAB_SIDE = Outline([
    (0.92, 0.7, 1), (0.9, 0.8), (0.864, 0.845), (0.75, 0.885), (0.52, 0.962), (0.25, 1.058), (0.121, 1.103), (0.0, 1.13),
    (-0.278, 1.143), (-0.543, 1.131), (-0.809, 1.108), (-0.942, 1.062), (-1.074, 1.028), (-1.207, 0.998), (-1.34, 0.964),
    # (the buttresses' tails a centimetre higher than the factory's: they stay just proud of the deck
    # to the end and stop on a small step; fading into it at the same height frays the seam)
    (-1.473, 0.932), (-1.606, 0.898), (-1.738, 0.866), (-1.871, 0.851), (-2.0, 0.846), (-2.07, 0.843, 1), (-2.07, 0.7, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 0.9), (0.6, 0.89), (0.72, 0.8), (0.76, 0.45), (0.77, -0.05), (0.8, -0.5), (0.86, -0.95), (0.9, -1.45), (0.92, -1.85), (0.9, -2.06),
    (0, -2.1),
]))
DOOR_WIN = [(0.62, 0.795, 1), (0.12, 1.048, 1), (-0.1, 1.072), (-0.42, 1.075, 1), (-0.37, 0.81, 1)]
QUARTER_WIN = [(-0.5, 1.078, 1), (-0.795, 1.075, 1), (-0.795, 0.845, 1), (-0.43, 0.815, 1)]
# (narrower than the factory's at the sides, for the crisper glasshouse)
WINDSHIELD = mirror_u([(0, 0.84), (0.53, 0.83), (0.625, 0.73), (0.625, 0.4), (0.575, 0.15), (0, 0.13)])
BACKLIGHT = [(-0.44, 0.885, 1), (0.44, 0.885, 1), (0.42, 1.065, 1), (-0.42, 1.065, 1)]

# the strakes: behind the door the recess opens into an intake; along the door it is a shallow
# channel crossed by five thin fins converging toward their front ends (sk 0 .. 1 from the back of
# the intake to the fins' front ends)
SK0, SKD, SKF = -0.708, -0.384, 0.527
FIN0 = [0.579, 0.52, 0.459, 0.399, 0.342]
FIN1 = [0.503, 0.45, 0.404, 0.357, 0.308]
SLATS = [0.615, 0.653, 0.69, 0.727, 0.765]
GLOW_ROW = [0.597, 0.634, 0.671]


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Upright flanks with a soft shoulder and tumblehome above it."""
    if y < 0.28:
        return 0.95 + 0.05 * smoothstep(0.14, 0.28, y)
    return 1.0 - ramp(y - 0.76, 0.008) * 0.4


def tilt(y):
    return max(0.0, y - 0.85) * 0.55


def build(coll, lod):
    q = Q[lod]

    def n(k, lo=2):
        return max(lo, round(k * q))

    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=lambda z: (0.768, 0.28), r_top=0.026, r_bot=0.035,
                          z_range=(-2.144, 2.145))
    # the engine deck sits down between the buttresses, behind an upright rear window
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.0, r_top=0.045, z_range=(-2.068, 0.918)),
                        trim=lambda cab: geo.boolean(cab, geo.box('deck', (0, 1.0, -1.65), (0.52, 0.5, 0.85), coll, 'paint'), sharp=50.0))
    # the brake-lamp pod across the back of the engine lid
    geo.boolean(skin, geo.rbox('pod', (0, 0.835, -1.56), (0.25, 0.046, 0.12), coll, 'paint', r=0.012, segs=n(3, 1)), op='UNION', sharp=50.0)
    road.wheel_arches(coll, n, skin, WHEELS)
    surf = road.Surface([skin])
    glass(coll, n, surf, lod)
    details(coll, n, surf, lod)
    # ---- pockets into the solid skin
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in (DOOR_WIN, QUARTER_WIN):
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'rear', BACKLIGHT, 0.045, coll, 'trim', grid=0.03)
    # the strakes' intakes behind the doors and their channels along them
    for view in ('left', 'right'):
        intake = [p for p in rrect((SK0 + SKD) / 2 - 0.02, 0.46, (SKD - SK0) / 2 + 0.02, 0.175, 0.05) if p[0] <= SKD + 1e-6]
        intake = [(SKD, 0.285, 1)] + [p for p in intake if p[0] < SKD - 0.001] + [(SKD, 0.635, 1)]
        if lod == 'lod1':
            # (far away a dark panel: on the coarse far skin the cut tears with every solver)
            road.panel(f'intake_{view}', surf, view, intake, coll, 'grille', depth=-0.002, thick=0.004, grid=0.04)
        else:
            road.pocket(skin, surf, view, intake, 0.075, coll, 'grille', 'paint', grid=0.02)
        for z0, z1, depth in ((SKD, 0.05, 0.012), (0.05, SKF, 0.005)):
            s0, s1 = (z0 - SK0) / (SKF - SK0), (z1 - SK0) / (SKF - SK0)
            chan = [(z0, 0.292 + 0.004 * s0, 1), (z1, 0.292 + 0.004 * s1, 1), (z1, 0.635 - 0.12 * s1, 1), (z0, 0.635 - 0.12 * s0, 1)]
            road.pocket(skin, surf, view, chan, depth, coll, 'paint', grid=0.02)
    # a vent across the hood in front of the windshield, the black vent behind the engine lid
    road.pocket(skin, surf, 'top', rect(-0.33, 0.33, 0.933, 0.977), 0.02, coll, 'grille', 'trim', grid=0.015)
    road.pocket(skin, surf, 'top', rect(-0.5, 0.5, -1.955, -1.875), 0.025, coll, 'grille', 'trim', grid=0.02)
    # the nose: a black grille band between rectangular corner lamps (amber above, clear below)
    road.pocket(skin, surf, 'front', rect(-0.6, 0.6, 0.335, 0.44), 0.035, coll, 'grille', 'trim', grid=0.015)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', sym(rect(0.62, 0.89, 0.4, 0.445), s), 0.014, coll, 'amber', 'trim', grid=0.012)
        road.pocket(skin, surf, 'front', sym(rect(0.62, 0.89, 0.32, 0.4), s), 0.014, coll, 'lens', 'trim', grid=0.012)
    for view in ('left', 'right'):
        # amber side markers on the front and rear corners, a fine crease along the nose's flanks
        road.pocket(skin, surf, view, rect(1.593, 1.693, 0.465, 0.497), 0.008, coll, 'amber', 'trim', grid=0.01)
        road.pocket(skin, surf, view, rect(-1.977, -1.863, 0.51, 0.552), 0.008, coll, 'amber', 'trim', grid=0.01)
        if lod != 'lod1':
            road.pocket(skin, surf, view, rect(1.5, 1.97, 0.531, 0.537), 0.004, coll, 'paint', grid=0.01)
    # the tail panel behind the slats (one pocket; the lamps are inserts on its floor)
    road.pocket(skin, surf, 'rear', rect(-0.9, 0.9, 0.585, 0.795), 0.04, coll, 'tail', 'trim', grid=0.015)
    # under the bumper a black valance; across its middle a wide black panel behind the plate
    road.pocket(skin, surf, 'rear', rrect(0, 0.3, 0.62, 0.045, 0.012), 0.03, coll, 'trim', grid=0.015)
    road.pocket(skin, surf, 'rear', rrect(0, 0.4575, 0.5, 0.0575, 0.015), 0.022, coll, 'trim', grid=0.015)
    road.pocket(skin, surf, 'rear', rrect(0, 0.41, 0.158, 0.0775, 0.01), 0.025, coll, 'trim', grid=0.015)
    # ---- the cabin hollowed (the front wheel wells stay closed off from the footwells)
    if lod != 'lod1':
        geo.boolean(skin, geo.rbox('footwell', (0, 0.5, 0.83), (0.58, 0.24, 0.05), coll, 'interior', r=0.03, segs=n(3, 1)), sharp=50.0)
        road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.5, 0.03), (0.8, 0.24, 0.75)), z_range=(-0.72, 0.78), tilt=tilt, floor=0.66)

    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        if y < 0.244:
            return 'trim'
        # the front spoiler's black rises toward the wheel
        if z > 1.45 and y < 0.24 + 0.06 * smoothstep(2.1, 1.55, z):
            return 'trim'
        if z < -1.9 and y < 0.3 and abs(x) < 0.62:
            return 'trim'
        return None

    road.zones(skin, fn, ys=(0.244, 0.3), zs=(-1.9, 1.45), xs=(0.62,))
    if lod != 'lod1':
        road.cockpit(coll, n, seat_x=0.36, seat_z=-0.25, floor_y=0.26, dash_z=0.56, dash_y=0.66, dash_w=0.66, wheel_z=0.3, wheel_y=0.67, recline=0.46)


def glass(coll, n, surf, lod):
    g = 0.04  # (the full model's; it coarsens with the level)
    d = 0.006 if lod != 'lod1' else -0.002
    for view in ('left', 'right'):
        for i, win in enumerate((DOOR_WIN, QUARTER_WIN)):
            road.panel(f'glass_{view}{i}', surf, view, win, coll, 'window', depth=d, grid=g)
            if lod != 'lod1':
                road.ring_panel(f'surround_{view}{i}', surf, view, win, coll, 'trim', width=0.011)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('backlight', surf, 'rear', BACKLIGHT, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll)
        road.ring_panel('backlight_surround', surf, 'rear', BACKLIGHT, coll, 'trim', width=0.011)


def details(coll, n, surf, lod):
    segs = n(3, 1)
    # the strakes' five fins, flush with the skin, converging forward
    for view in ('left', 'right'):
        for i in range(5):
            road.ribbon(f'strake_{view}{i}', surf, view, [(SK0 + 0.002, FIN0[i]), (SKF, FIN1[i])], coll, 'paint', width=0.017, depth=0.074,
                        thick=0.072, per=1)
    # one mirror, high on the driver's windshield pillar, in body colour
    geo.strut('mirror_arm', (0.56, 1.07, 0.17), (0.76, 1.08, 0.15), coll, width=0.026, thick=0.02, role='paint', sides=n(10, 6))
    geo.rbox('mirror', (0.82, 1.083, 0.14), (0.068, 0.034, 0.03), coll, 'paint', r=0.02, segs=segs)
    geo.rbox('mirror_glass', (0.82, 1.083, 0.108), (0.056, 0.024, 0.004), coll, 'chrome', r=0.008, segs=n(2, 1))
    # the pod's brake lamp on its flat back
    geo.rbox('pod_lamp', (0, 0.861, -1.68), (0.12, 0.006, 0.003), coll, 'tailglow', r=0.002, segs=1)
    # the nose grille's two bars, chrome rims round the corner lamps
    for yb in (0.37, 0.405):
        road.ribbon(f'grille_bar_{yb}', surf, 'front', [(-0.6, yb), (0.6, yb)], coll, 'trim', width=0.012, depth=0.033, thick=0.029, per=1)
    for s in (1, -1):
        road.bead(f'lamp_rim_{s}', surf, 'front', [(s * 0.62, 0.32), (s * 0.89, 0.32), (s * 0.89, 0.445), (s * 0.62, 0.445)], coll, 'chrome',
                  radius=0.004, lift=0.0, per=1, sides=n(6, 4), closed=True)
        # the four pipes in the valance
        for xc in (0.435, 0.525):
            road.exhaust_tip(coll, n, (s * xc, 0.31, -2.155), 0.036, 0.14, f'{s}{xc}')
    # the tail: lamp inserts on the panel's floor (the floor itself is red), slats right across
    for s in (1, -1):
        road.panel(f'tail_reverse_{s}', surf, 'rear', sym(rect(0.52, 0.64, 0.69, 0.795), s), coll, 'reverse', depth=0.036, thick=0.003, grid=0.02)
        road.panel(f'tail_indicator_{s}', surf, 'rear', sym(rect(0.64, 0.9, 0.69, 0.795), s), coll, 'indicator', depth=0.036, thick=0.003, grid=0.02)
        for ys in GLOW_ROW:
            road.ribbon(f'tail_glow_{s}{ys}', surf, 'rear', [(s * 0.53, ys), (s * 0.89, ys)], coll, 'tailglow', width=0.012, depth=0.034,
                        thick=0.004, per=1)
    road.panel('tail_centre', surf, 'rear', rect(-0.52, 0.52, 0.585, 0.795), coll, 'grille', depth=0.036, thick=0.003, grid=0.03)
    for ys in SLATS:
        road.ribbon(f'tail_slat_{ys}', surf, 'rear', [(-0.9, ys), (0.9, ys)], coll, 'trim', width=0.014, depth=0.05, thick=0.047, per=1)
    # the valance's two slats, the plate standing in front of its black panel
    for ys in (0.284, 0.316):
        road.ribbon(f'valance_slat_{ys}', surf, 'rear', [(-0.6, ys), (0.6, ys)], coll, 'trim', width=0.012, depth=0.034, thick=0.03, per=1)
    road.panel('plate', surf, 'rear', rrect(0, 0.41, 0.158, 0.0775, 0.01), coll, 'paint', depth=0.012, thick=0.02, grid=0.02)
    if lod == 'lod1':
        return
    # a black door pull at the top of each door, and the one big wiper
    for view in ('left', 'right'):
        road.ribbon(f'door_pull_{view}', surf, view, [(-0.22, 0.765), (-0.33, 0.77)], coll, 'trim', width=0.014, depth=0.006, thick=0.012, per=1)
    road.bead('wiper_arm', surf, 'top', [(0.42, 0.84), (-0.35, 0.79)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
    road.bead('wiper_blade', surf, 'top', [(0.3, 0.835), (-0.42, 0.785)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))
