"""Street furniture: cast-iron park lanterns, the taller swan-neck lamps along the circuit, benches.

Each lamp returns its parts and its light: {'p': (x, y, z), 'color', 'power' (the light's
brightness on the ground straight below it, in the game's light units), 'kind'}. The bake makes
Cycles point lights of them (see light_power), the game gives them their glow and halos.
"""
import math

from .mesh import box, lathe, material, tube

LANTERN_WARM = (1.0, 0.78, 0.52)
ROAD_WARM = (1.0, 0.84, 0.64)


def materials():
    return {
        'iron': material('iron', (0.018, 0.022, 0.02), rough=0.55, metal=0.6),
        'lamp': material('lamp', (1.0, 0.9, 0.75), rough=0.2, emission=(1.0, 0.82, 0.58), strength=6.0),
        'wood': material('wood', (0.16, 0.1, 0.06), rough=0.8),
        'stone': material('stone', (0.42, 0.4, 0.36), rough=0.9),
    }


def light_power(below, height):
    """Cycles power (W) of a point light `height` metres up that lights the ground straight below
    it to `below` in the game's light units (a diffuse bake reads P / (4 pi^2 h^2) there)."""
    return below * 4 * math.pi * math.pi * height * height


def lantern(base, yaw=0.0, height=3.9):
    """A Victorian park lantern on a fluted cast-iron post."""
    x, y, z = base
    k = height / 3.9
    parts = []
    post = [(0.2, 0.0), (0.2, 0.22), (0.15, 0.28), (0.11, 0.55), (0.07, 0.7), (0.055, 2.9 * k), (0.1, 2.95 * k), (0.1, 3.02 * k), (0.06, 3.08 * k)]
    parts.append((lathe(post, (x, y, z), 6, yaw), 'iron', True))
    head = [(0.07, 3.08 * k), (0.17, 3.18 * k), (0.2, 3.22 * k), (0.19, 3.24 * k), (0.0001, 3.24 * k)]
    parts.append((lathe(head, (x, y, z), 6, yaw), 'iron', False))
    glass = [(0.17, 3.24 * k), (0.21, 3.62 * k)]
    parts.append((lathe(glass, (x, y, z), 6, yaw, close_top=False, close_bottom=False), 'lamp', False))
    roof = [(0.25, 3.62 * k), (0.27, 3.66 * k), (0.12, 3.82 * k), (0.035, 3.9 * k), (0.05, 3.97 * k), (0.0001, 4.05 * k)]
    parts.append((lathe(roof, (x, y, z), 6, yaw, close_top=False), 'iron', False))
    light = {'p': (x, y + 3.45 * k, z), 'color': LANTERN_WARM, 'power': 0.55, 'kind': 'lantern'}
    return parts, light


def road_lamp(base, toward, height=7.2):
    """A tall swan-neck lamp: a column at the barrier's back, its arm curling out over the road
    edge to a lantern. toward: level unit vector (x, z) from the column toward the road."""
    x, y, z = base
    dx, dz = toward
    yaw = math.atan2(dx, dz)
    parts = []
    col = [(0.26, 0.0), (0.26, 0.35), (0.18, 0.42), (0.13, 0.9), (0.1, 1.05), (0.075, height - 0.5), (0.11, height - 0.45), (0.06, height - 0.35)]
    parts.append((lathe(col, (x, y, z), 6, yaw), 'iron', True))
    # the swan neck: up, over and down to the lantern, a run of short tubes
    reach = 1.6
    pts = []
    for k in range(7):
        t = k / 6
        out = reach * (1 - math.cos(math.pi * t)) / 2
        pts.append((x + dx * out, y + height - 0.4 + 0.55 * math.sin(math.pi * t) - 0.15 * t, z + dz * out))
    for p0, p1 in zip(pts, pts[1:]):
        parts.append((tube(p0, p1, 0.045, 0.04, 5, caps=False), 'iron', True))
    hx, hy, hz = x + dx * reach, y + height - 0.55, z + dz * reach
    head = [(0.0001, -0.02), (0.22, 0.1), (0.25, 0.14), (0.0001, 0.16)]
    parts.append((lathe([(r, hy + h) for (r, h) in head], (hx, 0.0, hz), 6, yaw), 'iron', False))
    glass = [(0.19, hy - 0.42), (0.23, hy - 0.02)]
    parts.append((lathe(glass, (hx, 0.0, hz), 6, yaw, close_top=False), 'lamp', False))
    light = {'p': (hx, hy - 0.22, hz), 'color': ROAD_WARM, 'power': 1.05, 'kind': 'road'}
    return parts, light


def bench(base, yaw):
    """A park bench: cast-iron ends, slatted wooden seat and back."""
    x, y, z = base
    c, s = math.cos(yaw), math.sin(yaw)

    def at(u, v, w):
        return (x + u * c + w * s, y + v, z - u * s + w * c)

    parts = []
    for u in (-0.75, 0.75):
        parts.append((box(at(u, 0.4, 0.0), (0.06, 0.8, 0.55), yaw), 'iron', False))
    parts.append((box(at(0.0, 0.45, 0.02), (1.7, 0.05, 0.45), yaw), 'wood', False))
    parts.append((box(at(0.0, 0.75, -0.2), (1.7, 0.3, 0.05), yaw), 'wood', False))
    return parts
