"""BRAWLER: an early-70s fastback muscle car. A long hood with a power bulge and a chrome blower
standing up through it (a ribbed case on a black manifold, a drive pulley at its front, an injector
hat with a barred mouth on top), hood pins, a full-width grille with three chrome bars and a centre
divider, quad round lamps in chrome bezels, amber parking lamps under chrome blade bumpers, a black
chin lip, a coke-bottle waist swelling into wide rear haunches with a side scoop ahead of each, chrome
bullet mirrors, window frames, drip rails, sill mouldings and door pulls, side markers, a fender
antenna, a long fastback ending in a ducktail, a full-width tail-lamp panel split by chrome bars with
the fuel cap in its black centre, reverse lamps either side of the plate and twin exhausts.
Left-hand drive.

Drawings from the car factory's design (tools/car-factory/designs/brawler.js, retired: see the git
history), re-spaced (see views.densify); the fastback drops into the deck at a clear angle instead
of sliding into it.
"""
import math

from lib import geo, road
from lib.road import circle, rect, rrect, smoothstep, sym
from lib.views import Outline, mirror_u

Q = {'lod0': 1.0, 'lodm': 0.62, 'lod1': 0.3}

WHEELS = {
    'front': {'z': 1.43, 'y': 0.33, 'x': 0.775, 'r': 0.33, 'w': 0.235},
    'rear': {'z': -1.33, 'y': 0.355, 'x': 0.785, 'r': 0.355, 'w': 0.31},
}
GAP = 0.04

META = {
    'wheels': WHEELS,
    # panel gaps per view: side (z, y), top (x, z), front/rear (x, y)
    'panels': {
        'side': [[[0.98, 0.87], [1.0, 0.6], [0.97, 0.27], [-0.5, 0.27], [-0.52, 0.6], [-0.5, 0.88]]],
        'top': [
            [[-0.82, 1.07], [0.82, 1.07], [0.87, 1.8], [0.85, 2.36], [-0.85, 2.36], [-0.87, 1.8], [-0.82, 1.07]],
            [[-0.62, -1.9], [0.62, -1.9], [0.72, -2.28], [-0.72, -2.28], [-0.62, -1.9]],
        ],
    },
    # `plate`: the licence plate painted into the valance recess (rear view, metres)
    'livery': {
        'door': [0.22, 0.58],
        'shoulder': 0.78,
        'cabin': {'x': 0.62, 'z0': -2.2, 'z1': 1.04},
        'plate': {'x': 0, 'y': 0.355, 'w': 0.31, 'h': 0.155, 'text': 'V8 BRAWL'},
    },
    'tailLights': [[0.48, 0.72, -2.37], [-0.48, 0.72, -2.37]],
    'headLights': [[0.6, 0.605, 2.42], [-0.6, 0.605, 2.42]],
    'exhausts': [[0.55, 0.235, -2.45], [-0.55, 0.235, -2.45]],
}

AO_STRENGTH = {'grille': 0.45, 'interior': 0.5, 'chrome': 0.7}

# ------------------------------------------------------------------------------- drawings
SIDE = Outline([
    (2.3, 0.17, 1), (2.38, 0.2), (2.415, 0.28), (2.425, 0.4), (2.425, 0.53), (2.425, 0.66), (2.41, 0.74), (2.385, 0.775, 1), (2.2, 0.79),
    (2.0, 0.803), (1.8, 0.815), (1.4, 0.835), (1.0, 0.855), (0.4, 0.865), (0.0, 0.869), (-0.4, 0.872), (-0.8, 0.878), (-1.1, 0.893),
    (-1.4, 0.899), (-1.7, 0.905), (-2.1, 0.915), (-2.3, 0.932, 1), (-2.345, 0.88), (-2.36, 0.72), (-2.37, 0.56, 1), (-2.38, 0.5), (-2.38, 0.34),
    (-2.35, 0.25), (-2.26, 0.19, 1),
])
PLAN = Outline(mirror_u([
    (0, 2.425), (0.3, 2.425), (0.6, 2.425), (0.82, 2.41), (0.885, 2.35), (0.9, 2.2), (0.905, 1.8), (0.905, 1.45), (0.905, 1.1), (0.895, 0.6),
    (0.89, 0.0), (0.9, -0.5), (0.935, -0.95), (0.955, -1.3), (0.952, -1.75), (0.935, -2.1), (0.895, -2.3), (0.78, -2.37), (0.4, -2.378),
    (0, -2.38),
]))
# (the fastback stands 1.5 cm proud of the deck at its end and drops into it at a clear angle: run
# down into it at a few degrees, the two would seam in a frayed zigzag, see road.check_overlap)
CAB_SIDE = Outline([
    (1.08, 0.78, 1), (1.04, 0.86, 1), (0.83, 0.995), (0.62, 1.13), (0.4, 1.265), (0.2, 1.31), (-0.025, 1.318), (-0.25, 1.322), (-0.6, 1.3),
    (-1.0, 1.215), (-1.5, 1.08), (-1.95, 0.962), (-2.08, 0.932), (-2.14, 0.885, 1), (-2.14, 0.72, 1), (1.08, 0.7, 1),
])
CAB_PLAN = Outline(mirror_u([
    (0, 1.09), (0.3, 1.088), (0.6, 1.08), (0.78, 1.03), (0.82, 0.92), (0.824, 0.66), (0.825, 0.4), (0.82, -0.4), (0.8, -1.0), (0.74, -1.6),
    (0.62, -2.0), (0.42, -2.2), (0.2, -2.232), (0, -2.24),
]))

# (the door glass starts well behind the A-pillar's rounded edge, see kaido.py; the tops stay 7 cm
# under the roof, clear of its fillet)
DOOR_WIN = road.rounded([(0.8, 0.925), (0.26, 1.24), (-0.45, 1.24), (-0.45, 0.93)], [0, 0.08, 0, 0])
QUARTER_WIN = [(-0.53, 1.235, 1), (-0.95, 1.15), (-1.3, 1.04, 1), (-1.02, 0.95, 1), (-0.53, 0.932, 1)]
SIDE_WINS = (DOOR_WIN, QUARTER_WIN)
# (kept inside the glasshouse's fillets; straight edges, round corners)
WINDSHIELD = road.rounded([(-0.64, 0.98), (0.64, 0.98), (0.64, 0.66), (0.57, 0.42), (-0.57, 0.42), (-0.64, 0.66)], [0.05, 0.05, 0, 0.05, 0.05, 0])
REAR_GLASS = road.rounded([(-0.55, -0.94), (0.55, -0.94), (0.6, -1.3), (0.52, -1.77), (-0.52, -1.77), (-0.6, -1.3)], [0.05, 0.05, 0, 0.05, 0.05, 0])
LAMPS = (0.52, 0.69)
HEAD_Y = 0.605
BLOWER_Z = 1.53


def ramp(x, k):
    return x if x > 12 * k else k * math.log1p(math.exp(x / k))


def sec(y, z):
    """Tucked sills, upright flanks, a crisp crease along the beltline and tumblehome above it."""
    if y < 0.3:
        return 0.955 + 0.045 * smoothstep(0.15, 0.3, y)
    return 1.0 - ramp(y - 0.8, 0.004) * 0.35


def bulge(ax, z):
    """The power bulge down the middle of the hood."""
    return 0.03 * (1 - smoothstep(0.26, 0.4, ax)) * smoothstep(1.0, 1.3, z) * (1 - smoothstep(2.0, 2.3, z))


def keys(z):
    """The side split at the beltline crease and the sill's tuck, every section alike."""
    yb, yt = SIDE.span_v(z) or (0.2, 0.9)
    return (min(0.8, yt - 0.04), max(0.3, yb + 0.05))


def tilt(y):
    return max(0.0, y - 0.9) * 0.42


def box_section(n=4, p=0.45):
    pts = []
    for k in range(4 * n):
        t = 2 * math.pi * k / (4 * n)
        c, s = math.cos(t), math.sin(t)
        pts.append((math.copysign(abs(c) ** p, c), math.copysign(abs(s) ** p, s)))
    return pts


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

    counts = (n(16), n(6), (n(10), n(9), n(7)), n(5), n(8))
    skin = road.view_body('body', coll, n, SIDE, PLAN, sec=sec, keys=keys, top=lambda ax, z, yt: yt + bulge(ax, z), r_top=0.03, r_bot=0.04,
                          stations=115, counts=counts)
    road.body_and_cabin(coll, n, skin, dict(side=CAB_SIDE, plan=CAB_PLAN, tilt=tilt, crown=0.02, r_top=0.045, stations=80))
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
                road.ring_panel(f'frame_{view}{i}', surf, view, win, coll, 'chrome', width=0.011, grid=0.04)
    road.panel('windshield', surf, 'top', WINDSHIELD, coll, 'window', depth=d, grid=g)
    road.panel('rear_glass', surf, 'top', REAR_GLASS, coll, 'window', depth=d, grid=g)
    if lod != 'lod1':
        road.frit('windshield_frit', surf, 'top', WINDSHIELD, coll, grid=0.04)
        road.frit('rear_frit', surf, 'top', REAR_GLASS, coll, width=0.03, grid=0.04)
        road.ring_panel('windshield_frame', surf, 'top', WINDSHIELD, coll, 'chrome', width=0.01, grid=0.04)
        road.ring_panel('rear_frame', surf, 'top', REAR_GLASS, coll, 'chrome', width=0.01, grid=0.04)


def lamps(coll, n, surf, lod):
    for s in (1, -1):
        # quad round lamps set back in the grille: a smoked reflector, the lens, a chrome bezel
        for xc in LAMPS:
            c = (s * xc, HEAD_Y)
            road.disc(f'head_bowl_{s}{xc}', surf, 'front', c, 0.066, coll, 'head', depth=0.036, thick=0.004, sides=n(28, 12))
            road.disc(f'head_lens_{s}{xc}', surf, 'front', c, 0.054, coll, 'lens', depth=0.03, thick=0.006, sides=n(28, 12))
            road.bead(f'head_bezel_{s}{xc}', surf, 'front', circle(*c, 0.071, n(28, 12)), coll, 'chrome', radius=0.011, lift=-0.02, per=1,
                      sides=n(8, 4), closed=True)
        # the three tail lamps a side, a bright bar in each
        for a, b in ((0.17, 0.34), (0.4, 0.57), (0.63, 0.79)):
            road.ribbon(f'tail_glow_{s}{a}', surf, 'rear', [(s * a, 0.72), (s * b, 0.72)], coll, 'tailglow', width=0.03, depth=0.022, thick=0.003,
                        per=1)
        # chrome bars between the tail lamps
        for xb in (0.14, 0.37, 0.6):
            road.ribbon(f'tail_bar_{s}{xb}', surf, 'rear', [(s * xb, 0.648), (s * xb, 0.792)], coll, 'chrome', width=0.016, depth=0.025, thick=0.02,
                        per=1)
    # the grille: three chrome bars between the lamps and a divider down the middle
    for yb in (0.555, 0.605, 0.655):
        road.bead(f'grille_bar_{yb}', surf, 'front', [(-0.43, yb), (0.43, yb)], coll, 'chrome', radius=0.012, lift=-0.02, per=1, sides=n(8, 4))
    road.bead('grille_divider', surf, 'front', [(0.0, 0.535), (0.0, 0.675)], coll, 'chrome', radius=0.011, lift=-0.02, per=1, sides=n(8, 4))
    # the tail panel: a chrome bezel, the black centre with the chrome fuel cap
    road.ring_panel('tail_bezel', surf, 'rear', rrect(0, 0.72, 0.82, 0.075, 0.012), coll, 'chrome', width=0.01)
    road.panel('tail_centre', surf, 'rear', rect(-0.14, 0.14, 0.645, 0.795), coll, 'trim', depth=0.02, thick=0.004, grid=0.02)
    road.disc('fuel_cap', surf, 'rear', (0.0, 0.72), 0.045, coll, 'chrome', depth=0.016, thick=0.012, sides=n(28, 12))
    road.disc('fuel_cap_lid', surf, 'rear', (0.0, 0.72), 0.03, coll, 'chrome', depth=0.005, thick=0.002, sides=n(24, 10))


def parts(coll, n, surf, lod):
    segs = n(3, 1)
    blower(coll, n)
    bumpers(coll, n)
    chin_lip(coll, n)
    # chrome bullet mirrors on stalks from the door tops, twin exhausts under the valance
    for s in (1, -1):
        road.mirror_unit(coll, n, s, (0.8, 0.885, 0.8), (0.95, 0.94, 0.78), (0.055, 0.038, 0.065), glass_role='glass', body_role='chrome',
                         arm_role='chrome', r=0.036)
        road.exhaust_tip(coll, n, (s * 0.55, 0.235, -2.4), 0.047, 0.16, f'{s}', depth=0.07)
    for view in ('left', 'right'):
        # chrome sill mouldings between the wheels
        road.ribbon(f'sill_{view}', surf, view, [(1.02, 0.255), (-0.9, 0.255)], coll, 'chrome', width=0.022, depth=0.002, thick=0.007, per=1)
    if lod == 'lod1':
        return
    # hood pins, the antenna on the right front fender
    for s in (1, -1):
        h = surf.project('top', s * 0.62, 2.27)
        if h:
            p = h[0]
            geo.cylinder(f'hood_pin_{s}', (p[0], p[1] - 0.004, p[2]), (p[0], p[1] + 0.012, p[2]), 0.013, coll, 'chrome', sides=n(12, 6))
            geo.cylinder(f'hood_pin_cap_{s}', (p[0], p[1] + 0.012, p[2]), (p[0], p[1] + 0.018, p[2]), 0.006, coll, 'chrome', sides=n(8, 6))
    h = surf.project('top', -0.76, 1.98)
    if h:
        p = h[0]
        geo.cylinder('antenna_base', (p[0], p[1] - 0.004, p[2]), (p[0], p[1] + 0.02, p[2]), 0.01, coll, 'chrome', sides=n(10, 6))
        geo.cylinder('antenna', (p[0], p[1] + 0.02, p[2]), (p[0], p[1] + 0.68, p[2] - 0.1), 0.003, coll, 'chrome', sides=n(6, 4))
    for view in ('left', 'right'):
        # chrome door pulls, chrome drip rails along the roof's edges
        road.ribbon(f'pull_{view}', surf, view, [(-0.25, 0.8), (-0.39, 0.8)], coll, 'chrome', width=0.02, depth=0.004, thick=0.012, per=1)
        road.bead(f'drip_{view}', surf, view, [(0.25, 1.262), (0.0, 1.281), (-0.3, 1.285), (-0.6, 1.268)], coll, 'chrome', radius=0.0045, lift=0.0,
                  per=4, sides=n(6, 4))
        # body-coloured louvres across the side scoops
        for yb in (0.605, 0.635):
            road.ribbon(f'scoop_bar_{view}{yb}', surf, view, [(-0.69, yb), (-0.87, yb)], coll, 'paint', width=0.008, depth=0.016, thick=0.012, per=1)
    # wipers parked at the foot of the windshield
    for x0, x1 in ((0.44, -0.06), (-0.1, -0.6)):
        road.bead(f'wiper_arm_{x0}', surf, 'top', [(x0, 0.965), (x1, 0.94)], coll, 'trim', radius=0.006, lift=0.012, per=1, sides=n(6, 4))
        road.bead(f'wiper_blade_{x0}', surf, 'top', [(x0 - 0.06, 0.961), (x1, 0.937)], coll, 'trim', radius=0.008, lift=0.006, per=1, sides=n(6, 4))


def blower(coll, n):
    """The blower standing through the hood: a ribbed chrome case on a black manifold, the drive
    pulley and belt at its front, an injector hat on top with a barred mouth facing forward."""
    segs = n(3, 1)
    z = BLOWER_Z
    geo.rbox('blower_base', (0, 0.855, z), (0.17, 0.03, 0.25), coll, 'trim', r=0.012, segs=segs)
    geo.rbox('blower_case', (0, 0.94, z), (0.13, 0.06, 0.21), coll, 'chrome', r=0.03, segs=segs)
    for yr in (0.915, 0.945, 0.975):
        geo.rbox(f'blower_rib_{yr}', (0, yr, z), (0.146, 0.005, 0.17), coll, 'chrome', r=0.004, segs=n(2, 1))
    geo.cylinder('blower_pulley', (0, 0.95, z + 0.205), (0, 0.95, z + 0.232), 0.05, coll, 'chrome', sides=n(24, 10))
    geo.cylinder('blower_hub', (0, 0.95, z + 0.232), (0, 0.95, z + 0.242), 0.018, coll, 'trim', sides=n(12, 6))
    geo.rbox('blower_belt', (0, 0.905, z + 0.218), (0.052, 0.05, 0.011), coll, 'trim', r=0.01, segs=n(2, 1))
    hat = geo.rbox('blower_hat', (0, 1.075, z + 0.03), (0.105, 0.08, 0.12), coll, 'chrome', r=0.03, segs=segs)
    geo.boolean(hat, geo.box('blower_mouth', (0, 1.08, z + 0.2), (0.08, 0.05, 0.15), coll, 'trim'), sharp=40.0)
    geo.rbox('blower_mouth_bar', (0, 1.08, z + 0.125), (0.085, 0.008, 0.008), coll, 'chrome', r=0.004, segs=n(2, 1))


def bumpers(coll, n):
    """Chrome blade bumpers wrapping the corners, their ends turned back into the body."""
    secn = box_section(n(4, 2))
    for name, off, cut, front, y, r in (('bumper_front', 0.025, 2.18, True, 0.43, (0.034, 0.02)), ('bumper_rear', 0.02, -2.15, False, 0.5,
                                                                                                    (0.032, 0.02))):
        pts = run(road.offset_outline(PLAN, off), cut, front)
        pts = thin(pts, max(1, len(pts) // n(60, 18)))
        path = [(x, y, z) for x, z in pts]
        # (the ends turn in, so no flat end shows)
        for i in (0, -1):
            x, _, z = path[i]
            end = (x - math.copysign(0.06, x), y, z + (-0.02 if front else 0.02))
            if i == 0:
                path.insert(0, end)
            else:
                path.append(end)
        geo.tube(name, path, coll, radius=r, role='chrome', section=secn, sharp=60.0)


def chin_lip(coll, n):
    """A black lip under the nose, 2 cm proud of it."""
    pts = run(PLAN, 2.1, True)
    pts = thin(pts, max(1, len(pts) // n(50, 16)))
    rings = []
    for i, (x, z) in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, tz) or 1
        nx, nz = tz / ln, -tx / ln
        if nx * x + nz * (z - 1.0) < 0:
            nx, nz = -nx, -nz
        # (its inside reaches back under the nose's rounded-under front)
        ring = [(x + nx * o, y, z + nz * o) for o, y in ((0.02, 0.2), (0.026, 0.186), (0.02, 0.168), (-0.15, 0.168), (-0.15, 0.2))]
        rings.append(ring)
    return geo.loft('chin', rings, coll, 'trim', sharp=40.0)


def openings(coll, n, skin, surf, lod):
    if lod != 'lod1':
        for view in ('left', 'right'):
            for win in SIDE_WINS:
                road.pocket(skin, surf, view, win, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', WINDSHIELD, 0.045, coll, 'trim', grid=0.03)
        road.pocket(skin, surf, 'top', REAR_GLASS, 0.045, coll, 'trim', grid=0.03)
    # the hood's opening round the blower, the grille, amber parking lamps under the bumper
    road.pocket(skin, surf, 'top', rrect(0, BLOWER_Z, 0.19, 0.27, 0.03), 0.03, coll, 'trim', grid=0.02)
    road.pocket(skin, surf, 'front', rrect(0, HEAD_Y, 0.8, 0.105, 0.015), 0.06, coll, 'grille', 'trim', grid=0.015)
    for s in (1, -1):
        road.pocket(skin, surf, 'front', sym(rrect(0.6, 0.33, 0.07, 0.022, 0.012), s), 0.012, coll, 'amber', 'chrome', grid=0.01)
        # the reverse lamps either side of the plate
        road.pocket(skin, surf, 'rear', sym(rrect(0.36, 0.355, 0.065, 0.025, 0.01), s), 0.015, coll, 'reverse', 'trim', grid=0.01)
    # the tail-lamp panel, the plate recess (the livery paints the plate)
    road.pocket(skin, surf, 'rear', rrect(0, 0.72, 0.82, 0.075, 0.012), 0.025, coll, 'tail', 'trim', grid=0.015)
    road.pocket(skin, surf, 'rear', rrect(0, 0.355, 0.17, 0.083, 0.02), 0.012, coll, 'paint', 'trim', grid=0.02)
    for view in ('left', 'right'):
        # side markers: amber at the front corners, red at the back; the side scoops ahead of the haunches
        road.pocket(skin, surf, view, rrect(2.07, 0.61, 0.065, 0.018, 0.012), 0.01, coll, 'amber', 'chrome', grid=0.01)
        road.pocket(skin, surf, view, rrect(-2.02, 0.61, 0.065, 0.018, 0.012), 0.01, coll, 'tail', 'chrome', grid=0.01)
        if lod != 'lod1':
            road.pocket(skin, surf, view, rrect(-0.78, 0.62, 0.1, 0.035, 0.015), 0.02, coll, 'grille', 'trim', grid=0.012)


def hollow(coll, n, skin):
    """The cabin hollowed: a tub between the doors, a narrower one between the rear wheel wells,
    the glasshouse's inside."""
    geo.boolean(skin, geo.rbox('tub_rear', (0, 0.55, -1.3), (0.56, 0.3, 0.32), coll, 'interior', r=0.05, segs=n(3, 1)), sharp=50.0)
    road.hollow(coll, n, skin, CAB_SIDE, CAB_PLAN, tub=((0, 0.53, 0.025), (0.82, 0.27, 0.925)), z_range=(-2.1, 1.04), tilt=tilt, wall=0.025,
                floor=0.7)


def zones(skin):
    """The underbody and the area under the rear valance in black."""
    def fn(x, y, z, role, nx, ny, nz):
        if role != 'paint':
            return None
        if y < 0.172:
            return 'trim'
        if z < -2.2 and y < 0.24:
            return 'trim'
        return None

    road.zones(skin, fn, ys=(0.172, 0.24), zs=(-2.2,))


def cabin_inside(coll, n):
    road.cockpit(coll, n, seat_x=0.38, seat_z=0.0, floor_y=0.26, dash_z=0.74, dash_y=0.78, dash_w=0.76, wheel_z=0.5, wheel_y=0.8, recline=0.38)
    segs = n(3, 1)
    geo.rbox('bench', (0, 0.36, -0.8), (0.66, 0.07, 0.25), coll, 'interior', r=0.05, segs=segs)
    back = geo.rbox('bench_back', (0, 0, 0), (0.66, 0.25, 0.07), coll, 'interior', r=0.05, segs=segs)
    road._place(back, (0, 0.62, -1.08), 0.35)
