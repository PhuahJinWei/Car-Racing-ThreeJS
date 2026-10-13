"""MONOPOSTO: a modern open-wheel grand prix car (the 2022-2026 look, no team or series marks).

A slim nose on a four-element front wing, a survival cell with a titanium halo over the cockpit,
undercut sidepods that wash down into a coke-bottle waist, a flat floor ending in a big diffuser,
a rear wing with a DRS flap and a beam wing, rain lights, and 18-inch covered wheels on slicks.
About 5 m long and 1.9 m wide with a 3.4 m wheelbase (the 2026 rules' compact car).

Game space throughout: +x is the car's left, +y up, +z forward (see lib/geo.py).
"""
import math

import bpy
from mathutils.bvhtree import BVHTree

from lib import geo
from lib.geo import keyed, lerp

# detail per level: the full model, the phone model and the far model (see tools/blender/run.py)
Q = {'lod0': 1.0, 'lodm': 0.72, 'lod1': 0.28}

# 18-inch rims on slicks, a yellow compound ring on each sidewall (the game draws the wheels)
WHEELS = {
    'front': {'z': 1.75, 'y': 0.36, 'x': 0.80, 'r': 0.36, 'w': 0.30, 'rim': 0.229, 'slick': True, 'whitewall': 0.018, 'wallColor': '#f2c40f'},
    'rear': {'z': -1.65, 'y': 0.36, 'x': 0.76, 'r': 0.36, 'w': 0.38, 'rim': 0.229, 'slick': True, 'whitewall': 0.018, 'wallColor': '#f2c40f'},
}

META = {
    'wheels': WHEELS,
    # panel seams per view: side (z, y), top (x, z): the nose cone's joint, the engine cover's edges
    'panels': {
        'side': [[[1.72, 0.25], [1.72, 0.49]]],
        'top': [[[-0.165, 1.72], [0.165, 1.72]], [[-0.13, -0.18], [-0.12, -1.35]], [[0.13, -0.18], [0.12, -1.35]]],
    },
    'livery': {
        # the number roundel sits on the engine cover, under the halo's rear legs
        'door': [-0.42, 0.68],
        'roundel': 0.12,
        # and the number again on top of the nose, read from in front
        'nose': {'z': 2.1, 'size': 0.085},
        'shoulder': 0.42,
        'cabin': {'x': 0.3, 'z0': -1.7, 'z1': 1.05},
        'panda': 0.26,
        'flames': {'z': 2.62, 'len': 2.3, 'y0': 0.12, 'y1': 0.64},
    },
    # rain lights in the rear wing's endplates (the light trails stream off the wing tips)
    'tailLights': [[0.495, 0.80, -2.44], [-0.495, 0.80, -2.44]],
    # no headlamps on a grand prix car: these only place the road beams
    'headLights': [[0.32, 0.3, 2.2], [-0.32, 0.3, 2.2]],
    'exhausts': [[0.0, 0.43, -2.04]],
}

# baked AO per material: inlets and the cockpit stay readable instead of going black
AO_STRENGTH = {'grille': 0.6, 'trim': 0.85}


def build(coll, lod):
    q = Q[lod]

    def n(k, lo=3):
        return max(lo, round(k * q))

    body = main_body(coll, n)
    cockpit(coll, body, n, lod)
    sidepods(coll, n, lod)
    floor(coll, n)
    front_wing(coll, n)
    rear_wing(coll, n)
    halo(coll, n)
    suspension(coll, n)
    driver(coll, n, lod)
    details(coll, n, lod)


# ------------------------------------------------------------------------------- main body
# Half profiles (top centre round the left side to the bottom centre) of the nose, survival
# cell, airbox and engine cover, front to back.
BODY = [
    (2.58, [(0, 0.212), (0.034, 0.208), (0.056, 0.192), (0.064, 0.165), (0.06, 0.128), (0.04, 0.108), (0, 0.104)]),
    (2.30, [(0, 0.29), (0.055, 0.283), (0.088, 0.26), (0.10, 0.22), (0.096, 0.16), (0.066, 0.132), (0, 0.128)]),
    (2.00, [(0, 0.39), (0.075, 0.38), (0.12, 0.35), (0.135, 0.29), (0.13, 0.21), (0.09, 0.172), (0, 0.168)]),
    (1.70, [(0, 0.50), (0.095, 0.49), (0.155, 0.455), (0.17, 0.38), (0.165, 0.27), (0.12, 0.222), (0, 0.218)]),
    (1.30, [(0, 0.60), (0.12, 0.59), (0.2, 0.55), (0.22, 0.45), (0.215, 0.25), (0.17, 0.15), (0, 0.14)]),
    (0.95, [(0, 0.66), (0.15, 0.655), (0.25, 0.615), (0.27, 0.50), (0.265, 0.25), (0.22, 0.09), (0, 0.08)]),
    (0.50, [(0, 0.672), (0.16, 0.668), (0.27, 0.64), (0.30, 0.52), (0.30, 0.25), (0.26, 0.08), (0, 0.07)]),
    (0.18, [(0, 0.70), (0.15, 0.69), (0.26, 0.65), (0.29, 0.52), (0.29, 0.25), (0.25, 0.08), (0, 0.07)]),
    (0.02, [(0, 0.955), (0.07, 0.94), (0.15, 0.82), (0.27, 0.62), (0.28, 0.30), (0.24, 0.08), (0, 0.07)]),
    (-0.25, [(0, 0.93), (0.08, 0.91), (0.16, 0.78), (0.25, 0.58), (0.26, 0.30), (0.22, 0.08), (0, 0.07)]),
    (-0.70, [(0, 0.80), (0.09, 0.78), (0.16, 0.68), (0.21, 0.52), (0.22, 0.30), (0.19, 0.08), (0, 0.07)]),
    (-1.15, [(0, 0.66), (0.085, 0.645), (0.14, 0.58), (0.17, 0.46), (0.17, 0.30), (0.15, 0.10), (0, 0.09)]),
    (-1.55, [(0, 0.585), (0.07, 0.578), (0.11, 0.55), (0.13, 0.49), (0.13, 0.38), (0.11, 0.30), (0, 0.29)]),
    (-1.85, [(0, 0.57), (0.05, 0.566), (0.08, 0.55), (0.09, 0.52), (0.09, 0.47), (0.075, 0.445), (0, 0.44)]),
    (-2.06, [(0, 0.562), (0.035, 0.56), (0.055, 0.552), (0.06, 0.53), (0.06, 0.50), (0.05, 0.48), (0, 0.476)]),
]


def main_body(coll, n):
    zs = geo.stations(2.58, -2.06, n(76, 14), ease=0.35)
    rings = geo.keyed_body(BODY, zs, n(6, 2))
    nose, tip = geo.dome(rings[0], (0, 0, 1), 0.045, n(5, 2))
    tail, end = geo.dome(rings[-1], (0, 0, -1), 0.018, n(3, 2))
    rings = list(reversed(nose)) + rings + tail
    return geo.loft('body', rings, coll, 'paint', tips=(tip, end), sharp=55.0)


def surface_y(ob, x, z, top=3.0):
    """Height of an object's upper surface at (x, z), or None (a ray straight down)."""
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(ob, dg)
    hit = tree.ray_cast(geo.G(x, top, z), (0, 0, -1))
    return hit[0].z if hit[0] is not None else None


# the cockpit opening in plan view (x, z), front centre round the left side to the back
COCKPIT = [(0, 0.93), (0.12, 0.905), (0.2, 0.79), (0.245, 0.56), (0.24, 0.31), (0.2, 0.15), (0, 0.115)]


def cockpit(coll, body, n, lod):
    plan = geo.half_ring(COCKPIT, n(6, 2))
    # the padded rim follows the body's top round the opening (found before cutting it)
    rim = []
    for x, z in plan:
        y = surface_y(body, x, z)
        rim.append((x, (y if y is not None else 0.68) + 0.006, z))
    cutter = geo.loft('cockpit_cut', [[(x, 0.24, z) for x, z in plan], [(x, 1.4, z) for x, z in plan]], coll, 'interior')
    geo.boolean(body, cutter, sharp=55.0)
    geo.tube('cockpit_rim', rim + rim[:1], coll, radius=(0.02, 0.026), role='trim', sides=n(10, 4), caps=(False, False))
    # airbox intake above the driver's head
    intake = geo.rbox('airbox_cut', (0, 0.895, 0.12), (0.075, 0.048, 0.13), coll, 'grille', r=0.03, segs=n(3, 1))
    geo.boolean(body, intake, sharp=55.0)


# ----------------------------------------------------------------------------------- sidepods
# Closed sections of the left sidepod, front to back: top inner corner, across the top to a tight
# shoulder (two close points), down the outside, which tucks hard in toward the floor (the
# undercut), along the bottom and up the inside. A letterbox inlet, then the top washes down
# toward the rear and the waist pinches in ahead of the rear wheels.
POD = [
    (0.90, [(0.25, 0.61), (0.45, 0.62), (0.62, 0.615), (0.655, 0.59), (0.66, 0.53), (0.65, 0.45), (0.62, 0.41), (0.45, 0.40), (0.26, 0.405), (0.245, 0.51)]),
    (0.70, [(0.25, 0.625), (0.47, 0.632), (0.66, 0.625), (0.70, 0.595), (0.705, 0.52), (0.66, 0.40), (0.56, 0.30), (0.42, 0.25), (0.27, 0.23), (0.245, 0.43)]),
    (0.35, [(0.25, 0.62), (0.48, 0.625), (0.675, 0.61), (0.715, 0.58), (0.72, 0.50), (0.66, 0.33), (0.54, 0.14), (0.42, 0.085), (0.27, 0.08), (0.245, 0.35)]),
    (0.00, [(0.24, 0.60), (0.47, 0.595), (0.65, 0.565), (0.69, 0.53), (0.695, 0.45), (0.64, 0.30), (0.53, 0.13), (0.41, 0.085), (0.26, 0.08), (0.235, 0.33)]),
    (-0.40, [(0.22, 0.57), (0.40, 0.53), (0.56, 0.46), (0.60, 0.42), (0.605, 0.36), (0.57, 0.25), (0.48, 0.12), (0.37, 0.085), (0.24, 0.08), (0.215, 0.31)]),
    (-0.85, [(0.19, 0.50), (0.31, 0.45), (0.42, 0.38), (0.45, 0.345), (0.455, 0.29), (0.43, 0.20), (0.37, 0.11), (0.29, 0.085), (0.21, 0.08), (0.185, 0.28)]),
    (-1.25, [(0.155, 0.42), (0.23, 0.38), (0.30, 0.32), (0.32, 0.29), (0.325, 0.245), (0.31, 0.18), (0.27, 0.11), (0.22, 0.085), (0.17, 0.08), (0.15, 0.24)]),
    (-1.55, [(0.12, 0.35), (0.16, 0.32), (0.20, 0.28), (0.215, 0.255), (0.22, 0.22), (0.21, 0.17), (0.185, 0.11), (0.16, 0.085), (0.13, 0.08), (0.115, 0.22)]),
]


def overbite(z, y):
    """The inlet's upper lip juts ahead of its lower one: the front of the pod rakes back."""
    return z + (y - 0.5) * 0.45 * geo.smooth(0.62, 0.9, z)


def pod_rings(keys, zs, per, s):
    rings = []
    for z in zs:
        ctrl = keyed(keys, z)
        loop = geo.curve([tuple(p) for p in ctrl], per, closed=True)
        rings.append([(s * x, y, overbite(z, y)) for x, y in loop])
    return rings


def inset(ctrl, d):
    cx = sum(p[0] for p in ctrl) / len(ctrl)
    cy = sum(p[1] for p in ctrl) / len(ctrl)
    out = []
    for x, y in ctrl:
        dx, dy = x - cx, y - cy
        l = math.hypot(dx, dy) or 1
        out.append((x - dx / l * d, y - dy / l * d))
    return out


def sidepods(coll, n, lod):
    zs = geo.stations(0.9, -1.55, n(46, 10), ease=0.3)
    per = n(4, 2)
    lip = inset(POD[0][1], 0.024)
    for s, side in ((1, 'L'), (-1, 'R')):
        pod = geo.loft(f'sidepod_{side}', pod_rings(POD, zs, per, s), coll, 'paint', sharp=55.0)
        loop = geo.curve(lip, per, closed=True)
        rings = [[(s * x, y, overbite(z, y)) for x, y in loop] for z in (1.05, 0.9, 0.62)]
        geo.boolean(pod, geo.loft(f'inlet_cut_{side}', rings, coll, 'grille'), sharp=55.0)
        if lod == 'lod1':
            continue
        # cooling louvres across the downwash ramp
        for k in range(5):
            z = -0.2 - 0.075 * k
            y = surface_y(pod, s * 0.43, z)
            if y is None:
                continue
            slot = geo.rbox(f'louvre_{side}{k}', (s * 0.43, y, z), (0.095, 0.045, 0.011), coll, 'grille', r=0.008, segs=n(2, 1))
            geo.boolean(pod, slot, sharp=55.0)


# -------------------------------------------------------------------------------------- floor
FLOOR = [
    (0.10, 1.10, 1), (0.34, 1.03), (0.6, 0.87), (0.78, 0.56), (0.80, 0.2), (0.80, -0.6), (0.78, -0.95),
    (0.66, -1.2), (0.555, -1.36), (0.52, -1.5, 1),
    (-0.52, -1.5, 1), (-0.555, -1.36), (-0.66, -1.2), (-0.78, -0.95), (-0.80, -0.6), (-0.80, 0.2), (-0.78, 0.56),
    (-0.6, 0.87), (-0.34, 1.03), (-0.10, 1.10, 1),
]


def floor(coll, n):
    geo.plate('floor', FLOOR, coll, 'carbon', plane='y', at=0.06, thick=0.028, per=n(6, 2))
    for s, side in ((1, 'L'), (-1, 'R')):
        # edge wings: the floor's outer edge curls up into a lip
        edge = [(0.55, 0.074), (0.55, 0.12), (0.3, 0.13), (-0.85, 0.12), (-0.95, 0.074, 1)]
        geo.plate(f'floor_edge_{side}', [(z, y, *f) for (z, y, *f) in edge], coll, 'carbon', plane='x', at=s * 0.788, thick=0.012, per=n(4, 1))
        # fences hanging under the floor's leading edge
        for k, x in enumerate((0.25, 0.37, 0.49)):
            fence = [(1.06 - 0.12 * k, 0.074, 1), (0.98 - 0.12 * k, 0.024), (0.58 - 0.06 * k, 0.024), (0.52 - 0.06 * k, 0.05, 1)]
            geo.plate(f'floor_fence_{side}{k}', fence, coll, 'carbon', plane='x', at=s * x, thick=0.008, per=n(3, 1))
    diffuser(coll, n)
    # rear brake-duct fences, just inboard of the rear tyres
    for s, side in ((1, 'L'), (-1, 'R')):
        duct = [(-1.38, 0.17, 1), (-1.4, 0.5), (-1.58, 0.585), (-1.86, 0.55), (-1.93, 0.42), (-1.92, 0.2, 1), (-1.7, 0.13)]
        geo.plate(f'rear_duct_{side}', duct, coll, 'carbon', plane='x', at=s * 0.548, thick=0.01, per=n(4, 1))


def roof_y(z):
    """Height of the diffuser's roof, curving up from the floor (z -1.42) to the exit (z -2.03)."""
    t = min(1.0, max(0.0, (-1.42 - z) / 0.61))
    return 0.062 + 0.25 * t ** 1.7


def diffuser(coll, n):
    # the roof: a thin sheet across the car
    zs = geo.stations(-1.42, -2.035, n(16, 5))
    rings = [[(x, roof_y(z) + 0.006, z) for z in zs] + [(x, roof_y(z) - 0.006, z) for z in reversed(zs)]
             for x in geo.stations(-0.505, 0.505, n(12, 3))]
    geo.loft('diffuser', rings, coll, 'carbon', sharp=50.0)
    # side walls, rising above the roof at the exit
    wall = [(-1.4, 0.046, 1), (-2.04, 0.046, 1), (-2.04, 0.37, 1), (-1.9, 0.335), (-1.7, 0.2), (-1.4, 0.088, 1)]
    for s, side in ((1, 'L'), (-1, 'R')):
        geo.plate(f'diffuser_wall_{side}', wall, coll, 'carbon', plane='x', at=s * 0.512, thick=0.014, per=n(4, 1))
    # strakes in the tunnels under the roof
    under = [(z, roof_y(z) - 0.004) for z in geo.stations(-2.03, -1.5, n(6, 3))]
    strake = [(-1.5, 0.046, 1), (-2.03, 0.046, 1)] + [(z, y, 1) if i in (0, len(under) - 1) else (z, y) for i, (z, y) in enumerate(under)]
    for x in (-0.34, -0.17, 0.17, 0.34):
        geo.plate(f'strake_{x:+.2f}', strake, coll, 'carbon', plane='x', at=x, thick=0.006, per=1)


# --------------------------------------------------------------------------------- front wing
def cascade(e1, gaps, n_el):
    """Front wing elements at one span station: each element's leading edge tucks above and just
    ahead of the previous one's trailing edge (a slotted wing). e1: (chord, le_y, le_z, angle);
    gaps: per following element (chord, angle, overlap, slot)."""
    els = [e1]
    for chord, ang, overlap, slot in gaps[:n_el - 1]:
        c, y, z, a = els[-1]
        ar = math.radians(a)
        ty, tz = y + c * math.sin(ar), z - c * math.cos(ar)
        els.append((chord, ty + slot, tz + overlap, ang))
    return els


def front_wing_at(x):
    """Elements at span station x (0 = centre, 0.9 = endplate): flat in the middle, the flaps
    steepening and rising toward the endplates."""
    t = min(1.0, max(0.0, (x - 0.25) / 0.65))
    k = t * t
    e1 = (lerp(0.30, 0.22, t), 0.072 + 0.02 * k, lerp(2.625, 2.56, t), lerp(3.0, 9.0, t))
    gaps = [(lerp(0.16, 0.15, t), lerp(16, 24, k), 0.035, 0.013),
            (lerp(0.125, 0.12, t), lerp(28, 32, k), 0.03, 0.012),
            (lerp(0.105, 0.095, t), lerp(40, 44, k), 0.025, 0.011)]
    els = cascade(e1, gaps, 4)
    # the outer flaps climb toward the endplate
    return [(c, y + 0.015 * k * (i / 3), z, a) for i, (c, y, z, a) in enumerate(els)]


def front_wing(coll, n):
    xs = [lerp(-0.912, 0.912, i / (n(44, 10) - 1)) for i in range(n(44, 10))]
    foil = geo.airfoil(n(26, 8), thick=0.085, camber=0.05)
    roles = ['carbon', 'carbon', 'paint', 'paint']
    for e in range(4):
        span = [(x, *front_wing_at(abs(x))[e], 1.0) for x in xs]
        geo.loft(f'fw_element{e + 1}', geo.wing_rings(span, foil), coll, roles[e], sharp=40.0)
    for s, side in ((1, 'L'), (-1, 'R')):
        # low at the front, rising to meet the top flap's tip at the back
        outline = [(2.645, 0.05, 1), (2.635, 0.16), (2.56, 0.225), (2.42, 0.265), (2.25, 0.32), (2.13, 0.375),
                   (2.08, 0.372, 1), (2.06, 0.24), (2.09, 0.09), (2.2, 0.045, 1)]
        geo.plate(f'fw_endplate_{side}', outline, coll, 'paint', plane='x', at=s * 0.912, thick=0.012, per=n(5, 2))
        # the footplate turning out under the endplate
        foot = [(2.62, 0.045, 1), (2.62, 0.058, 1), (2.15, 0.058, 1), (2.15, 0.045, 1)]
        for k, x in enumerate((0.91, 0.935)):
            geo.plate(f'fw_foot_{side}{k}', foot, coll, 'carbon', plane='x', at=s * x, thick=0.03, per=1)


# ---------------------------------------------------------------------------------- rear wing
def rear_wing(coll, n):
    xs = geo.stations(-0.49, 0.49, n(30, 8))
    foil = geo.airfoil(n(26, 8), thick=0.1, camber=0.06)
    # mainplane, then the DRS flap tucked above its trailing edge (flattening at its tips, under the
    # endplates' curled tops)
    main = [(x, 0.30, 0.80 - 0.02 * (x / 0.49) ** 2, -2.02, 11.0) for x in xs]
    flap = [(x, 0.21, 0.865, -2.235, 34.0 - 9.0 * geo.smooth(0.38, 0.49, abs(x))) for x in xs]
    geo.loft('rw_main', geo.wing_rings(main, foil), coll, 'carbon', sharp=40.0)
    geo.loft('rw_flap', geo.wing_rings(flap, foil), coll, 'paint', sharp=40.0)
    for s, side in ((1, 'L'), (-1, 'R')):
        # tall at the back, its lower front cut away on a diagonal under the mainplane's tip, and its
        # top curling in over the flap's tip
        outline = [(-2.445, 0.6, 1), (-2.445, 0.95), (-2.39, 0.995), (-2.2, 1.005), (-2.03, 0.985), (-1.96, 0.925),
                   (-1.97, 0.78), (-2.15, 0.66), (-2.32, 0.605)]

        def x_of_y(y, s=s):
            return s * (0.497 - 0.04 * geo.smooth(0.94, 1.005, y) ** 1.5)

        geo.sliced_plate(f'rw_endplate_{side}', outline, coll, 'carbon', x_of_y, slices=n(30, 6), sides=n(16, 8), per=n(5, 2))
        # rain-light strip down the endplate's trailing edge
        geo.rbox(f'rw_rainlight_{side}', (s * 0.497, 0.80, -2.443), (0.0085, 0.105, 0.006), coll, 'tailglow', r=0.004, segs=n(2, 1))
    # swan-neck pylon from the crash structure up to the mainplane
    pylon = [(-1.84, 0.53, 1), (-1.92, 0.68), (-2.02, 0.80), (-2.12, 0.835, 1), (-2.2, 0.80), (-2.12, 0.66), (-2.03, 0.53, 1)]
    geo.plate('rw_pylon', pylon, coll, 'carbon', plane='x', at=0.0, thick=0.014, per=n(4, 1))
    # DRS actuator pod
    geo.rbox('rw_drs_pod', (0, 0.885, -2.16), (0.03, 0.03, 0.06), coll, 'carbon', r=0.02, segs=n(3, 1))
    # beam wing: two small elements low between the diffuser's outer walls
    bxs = geo.stations(-0.49, 0.49, n(20, 6))
    bfoil = geo.airfoil(n(20, 8), thick=0.1, camber=0.06)
    geo.loft('beam_main', geo.wing_rings([(x, 0.13, 0.315, -1.98, 8.0) for x in bxs], bfoil), coll, 'carbon')
    geo.loft('beam_flap', geo.wing_rings([(x, 0.11, 0.352, -2.1, 26.0) for x in bxs], bfoil), coll, 'carbon')


# --------------------------------------------------------------------------------------- halo
def halo(coll, n):
    hoop = [(0.315, 0.71, 0.125), (0.305, 0.83, 0.2), (0.295, 0.895, 0.33), (0.25, 0.905, 0.55), (0.14, 0.905, 0.72),
            (0.0, 0.9, 0.785)]
    path = hoop + [(-x, y, z) for x, y, z in reversed(hoop[:-1])]
    geo.tube('halo', path, coll, radius=(0.021, 0.03), role='paint', sides=n(14, 5), smooth_path=n(6, 2), sharp=60.0)
    pillar = [(0.0, 0.64, 1.03), (0.0, 0.75, 0.96), (0.0, 0.85, 0.865), (0.0, 0.9, 0.79)]
    geo.tube('halo_pillar', pillar, coll, radius=(0.03, 0.02), role='paint', sides=n(12, 4), up=(1, 0, 0), smooth_path=n(5, 2), sharp=60.0)


# --------------------------------------------------------------------------------- suspension
def suspension(coll, n):
    sides = n(8, 4)
    for s, side in ((1, 'L'), (-1, 'R')):
        def P(x, y, z):
            return (s * x, y, z)

        links = [
            # front: lower and upper wishbones, pushrod, track rod
            (P(0.10, 0.22, 1.92), P(0.665, 0.225, 1.77)), (P(0.15, 0.2, 1.5), P(0.665, 0.225, 1.77)),
            (P(0.12, 0.36, 1.9), P(0.64, 0.5, 1.73)), (P(0.17, 0.44, 1.5), P(0.64, 0.5, 1.73)),
            (P(0.62, 0.25, 1.73), P(0.15, 0.52, 1.66)),
            (P(0.14, 0.3, 1.6), P(0.665, 0.33, 1.62)),
            # rear: lower and upper wishbones, pullrod, toe link
            (P(0.2, 0.17, -1.3), P(0.6, 0.22, -1.66)), (P(0.14, 0.2, -1.85), P(0.6, 0.22, -1.66)),
            (P(0.17, 0.43, -1.38), P(0.585, 0.5, -1.62)), (P(0.12, 0.45, -1.85), P(0.585, 0.5, -1.62)),
            (P(0.58, 0.48, -1.66), P(0.14, 0.24, -1.6)),
            (P(0.15, 0.3, -1.8), P(0.6, 0.3, -1.82)),
        ]
        for k, (a, b) in enumerate(links):
            geo.strut(f'susp_{side}{k}', a, b, coll, width=0.045, thick=0.014, sides=sides)


# ------------------------------------------------------------------------------------- driver
def driver(coll, n, lod):
    def visor(u, v):
        # a band across the front, just above the helmet's middle
        return 'glass' if 0.36 < u < 0.5 and 0.125 < v < 0.375 else 'paint'

    # (multiples of 8, so the visor's edges land on grid lines)
    rings = math.ceil(n(16, 8) / 8) * 8
    segs = max(8, round(n(24, 8) / 8) * 8)
    geo.ellipsoid('helmet', (0, 0.80, 0.40), (0.115, 0.125, 0.14), coll, 'paint', rings=rings, segs=segs, face_role=visor, sharp=60.0)
    if lod == 'lod1':
        return
    geo.rbox('shoulders', (0, 0.665, 0.33), (0.17, 0.05, 0.12), coll, 'trim', r=0.04, segs=n(3, 1))
    geo.rbox('steering_wheel', (0, 0.63, 0.7), (0.13, 0.065, 0.02), coll, 'carbon', r=0.02, segs=n(3, 1))
    for s, side in ((1, 'L'), (-1, 'R')):
        geo.rbox(f'headrest_{side}', (s * 0.19, 0.71, 0.3), (0.055, 0.075, 0.15), coll, 'trim', r=0.03, segs=n(3, 1))
    geo.rbox('headrest_back', (0, 0.735, 0.165), (0.15, 0.08, 0.045), coll, 'trim', r=0.03, segs=n(3, 1))


# ------------------------------------------------------------------------------------ details
def details(coll, n, lod):
    for s, side in ((1, 'L'), (-1, 'R')):
        # mirrors on stalks off the sidepods
        geo.strut(f'mirror_stalk_{side}', (s * 0.27, 0.6, 0.86), (s * 0.47, 0.7, 0.81), coll, width=0.03, thick=0.01, sides=n(8, 4))
        geo.rbox(f'mirror_{side}', (s * 0.52, 0.715, 0.8), (0.075, 0.03, 0.035), coll, 'paint', r=0.02, segs=n(3, 1))
        geo.rbox(f'mirror_glass_{side}', (s * 0.52, 0.715, 0.7635), (0.066, 0.023, 0.004), coll, 'chrome', r=0.01, segs=n(2, 1))
    # shark fin along the engine cover's spine
    fin = [(-0.3, 0.9, 1), (-0.45, 0.945), (-1.0, 0.775), (-1.5, 0.63, 1), (-1.5, 0.52, 1), (-0.4, 0.82, 1)]
    geo.plate('fin', fin, coll, 'paint', plane='x', at=0.0, thick=0.008, per=n(4, 1))
    # onboard camera on the airbox
    geo.rbox('tcam', (0, 0.968, -0.02), (0.05, 0.018, 0.035), coll, 'trim', r=0.012, segs=n(3, 1))
    # exhaust under the crash structure, glowing inside
    geo.cylinder('exhaust', (0, 0.43, -1.9), (0, 0.43, -2.035), 0.046, coll, 'head', sides=n(18, 8))
    geo.cylinder('exhaust_glow', (0, 0.43, -1.95), (0, 0.43, -2.03), 0.036, coll, 'exhaust', sides=n(18, 8))
    # rain light on the crash structure's tip
    geo.rbox('rainlight_housing', (0, 0.52, -2.075), (0.05, 0.026, 0.012), coll, 'tail', r=0.008, segs=n(2, 1))
    geo.rbox('rainlight', (0, 0.52, -2.085), (0.04, 0.017, 0.004), coll, 'tailglow', r=0.004, segs=n(2, 1))
