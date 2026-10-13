"""The track a set is built round, exactly as the game builds it (build.mjs exports it from the
game's own Track class): the centre line every ~2 m, its banked right vector, the road's width.

Everything here is in game space (x, y up, z), as the game uses it; G() takes a game point into
Blender, which is z up, and the glTF export takes it back.
"""
import json
import math

from mathutils import kdtree


def G(x, y, z):
    """Game space -> Blender space."""
    return (x, -z, y)


def smoothstep(a, b, v):
    t = min(1.0, max(0.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


class Track:
    def __init__(self, path):
        d = json.load(open(path, encoding='utf-8'))
        self.data = d
        self.n = d['n']
        self.ds = d['ds']
        self.length = d['length']
        self.W = d['halfWidth']
        self.barrier = d['barrier']
        self.px, self.py, self.pz = d['px'], d['py'], d['pz']
        self.tx, self.tz = d['tx'], d['tz']
        self.rx, self.ry, self.rz = d['rx'], d['ry'], d['rz']
        self.bounds = d['bounds']
        self.sections = d['sections']
        self.kd = kdtree.KDTree(self.n)
        for i in range(self.n):
            self.kd.insert((self.px[i], self.pz[i], 0.0), i)
        self.kd.balance()

    def at(self, s):
        """Sample index at distance s along the loop."""
        return int(round(s / self.ds)) % self.n

    def nearest(self, x, z):
        """(index, distance) of the centre-line sample nearest (x, z)."""
        _, i, dist = self.kd.find((x, z, 0.0))
        return i, dist

    def within(self, x, z, r):
        """Indices of the samples within r of (x, z)."""
        return [i for (_, i, _) in self.kd.find_range((x, z, 0.0), r)]

    def lateral(self, i, x, z):
        """Offset of (x, z) to the right of sample i (metres, level), and ahead of it."""
        dx, dz = x - self.px[i], z - self.pz[i]
        rl = math.hypot(self.rx[i], self.rz[i]) or 1.0
        return (dx * self.rx[i] + dz * self.rz[i]) / rl, dx * self.tx[i] + dz * self.tz[i]

    def surface(self, x, z):
        """The road surface's height at (x, z), its banking carried on sideways past the edges."""
        i, _ = self.nearest(x, z)
        lat, _ = self.lateral(i, x, z)
        rl = math.hypot(self.rx[i], self.rz[i]) or 1.0
        return self.py[i] + self.ry[i] / rl * lat

    def point(self, i, d, lift=0.0):
        """Game-space point d metres to the right of sample i (level), lift above the road there."""
        rl = math.hypot(self.rx[i], self.rz[i]) or 1.0
        x = self.px[i] + self.rx[i] / rl * d
        z = self.pz[i] + self.rz[i] / rl * d
        return (x, self.py[i] + self.ry[i] / rl * d + lift, z)

    def right(self, i):
        """Level unit vector to the right of sample i (x, z)."""
        rl = math.hypot(self.rx[i], self.rz[i]) or 1.0
        return (self.rx[i] / rl, self.rz[i] / rl)

    def heading(self, i):
        """Level unit vector along the road at sample i (x, z)."""
        tl = math.hypot(self.tx[i], self.tz[i]) or 1.0
        return (self.tx[i] / tl, self.tz[i] / tl)

    def curvature(self, i):
        """Signed curvature at sample i (1/m; positive = turning right, driven forward)."""
        a, b = (i - 2) % self.n, (i + 2) % self.n
        ha = math.atan2(self.tx[a], self.tz[a])
        hb = math.atan2(self.tx[b], self.tz[b])
        dh = (hb - ha + math.pi) % (2 * math.pi) - math.pi
        return -dh / (4 * self.ds)

    def clear(self, x, z, margin):
        """(x, z) is at least `margin` metres outside the barriers."""
        return self.nearest(x, z)[1] >= self.barrier + margin
