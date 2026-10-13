"""FLOODLIGHT PARK: a city park at night round the club circuit, built in Blender around the real
track (see build.mjs).

The road runs through it:
- under the woods round the hairpin, whose crowns close over it, past a bandstand in the clearing
  the hairpin wraps round;
- over a stone bridge where a stream runs out of the woods to the lake;
- along the lantern-lit promenade beside the lake on the back straight;
- past a Victorian glasshouse glowing beside the esses, and the floodlit pitches in the corner
  before the last turn;
- down the main straight between the club's pit building and its stand.
Paths with their own lanterns wind through it all. Everything stands clear of the barriers.

build(track, coll, quick) makes the objects and the lamps (Blender lights for the bake) and
returns {'ground', 'objects', 'water', 'lights', 'rect', 'water_y', 'albedo'}.
"""
import math

import bpy
import numpy as np
from mathutils import Vector, kdtree, noise

from kit import mesh, props, structures, terrain, trees
from kit.track import G, smoothstep

MARGIN = 150.0  # the park round the track's own extent, metres
MAP = 2048  # the ground's maps, pixels a side
CLEAR_TRUNK = 2.6  # a tree's trunk at least this far outside the barriers
CANOPY_CLEAR = 6.2  # leaves reaching over the road at least this high above it
NEAR = 30.0  # full-detail trees within this of the road, coarse ones beyond
WOODS = 80.0  # how deep the woods run back from the road
PATH_W = 3.2  # footpaths' width
# the night's own light, under the lamps': a cool moon high in the south-west (its light on open
# ground, in the game's units) and the city's warm glow over the whole sky
MOON = {'color': (0.62, 0.72, 1.0), 'ground': 0.12, 'elevation': 52.0, 'azimuth': 215.0}
SKY_GLOW = (0.034, 0.03, 0.03)


def seg(track, k):
    """(s0, s1) of the path's command k along the loop."""
    s = track.data['segments'][k]
    return s['s0'], s['s1']


def samples(track, k, step=1):
    """Sample indices along command k."""
    s0, s1 = seg(track, k)
    if s1 < s0:
        s1 += track.length
    return [track.at(s) for s in np.arange(s0, s1, track.ds * step)]


def at_frac(track, k, f):
    """Sample index a fraction f along command k."""
    s0, s1 = seg(track, k)
    if s1 < s0:
        s1 += track.length
    return track.at(s0 + (s1 - s0) * f)


def upsample(a, size):
    """Bilinear resize of a 2D array to size x size."""
    n = a.shape[0]
    p = (np.arange(size) + 0.5) * n / size - 0.5
    i0 = np.clip(np.floor(p).astype(int), 0, n - 1)
    i1 = np.clip(i0 + 1, 0, n - 1)
    f = np.clip(p - i0, 0, 1)
    rows = a[i0] * (1 - f)[:, None] + a[i1] * f[:, None]
    return rows[:, i0] * (1 - f)[None, :] + rows[:, i1] * f[None, :]


def catmull(points, step=2.0):
    """A smooth curve through points (x, z), sampled about every `step` metres."""
    pts = [Vector((x, z)) for (x, z) in points]
    out = []
    for k in range(len(pts) - 1):
        p0 = pts[max(0, k - 1)]
        p1, p2 = pts[k], pts[k + 1]
        p3 = pts[min(len(pts) - 1, k + 2)]
        n = max(2, int((p2 - p1).length / step))
        for j in range(n):
            t = j / n
            t2, t3 = t * t, t * t * t
            p = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((p.x, p.y))
    out.append((pts[-1].x, pts[-1].y))
    return out


class Lines:
    """Polylines (x, z) with a nearest-distance query."""

    def __init__(self):
        self.pts = []

    def add(self, line, step=1.0):
        for (a, b) in zip(line, line[1:]):
            n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
            for j in range(n):
                t = j / n
                self.pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        if line:
            self.pts.append(line[-1])

    def build(self):
        self.kd = kdtree.KDTree(max(1, len(self.pts)))
        for k, (x, z) in enumerate(self.pts):
            self.kd.insert((x, z, 0.0), k)
        self.kd.balance()
        return self

    def dist(self, x, z):
        if not self.pts:
            return 1e9
        return self.kd.find((x, z, 0.0))[2]


class Spacing:
    """Keeps things apart: a grid of what's been placed (x, z, radius)."""

    def __init__(self, cell=12.0):
        self.cell = cell
        self.grid = {}

    def free(self, x, z, r, k=0.75):
        c = self.cell
        ix, iz = int(x // c), int(z // c)
        reach = int(math.ceil((r * 2 + 30) / c))
        for i in range(ix - reach, ix + reach + 1):
            for j in range(iz - reach, iz + reach + 1):
                for (px, pz, pr) in self.grid.get((i, j), ()):
                    if (px - x) ** 2 + (pz - z) ** 2 < ((r + pr) * k) ** 2:
                        return False
        return True

    def add(self, x, z, r):
        self.grid.setdefault((int(x // self.cell), int(z // self.cell)), []).append((x, z, r))


class Park:
    def __init__(self, track):
        self.t = track
        b = track.bounds
        self.rect = (b['minX'] - MARGIN, b['minZ'] - MARGIN, b['maxX'] + MARGIN, b['maxZ'] + MARGIN)
        self.lights = []
        self.space = Spacing()
        self.pads = []  # (x, z, radius, height): flat ground (the glasshouse, the bandstand...)
        self.boxes = []  # (frame, half x, half z, height): flat rectangles (the pitch, the paddock)
        self._plan_lake()
        self._plan_base()
        self._plan_stream()
        self._plan_pitch()
        self._plan_glasshouse()
        self._plan_bandstand()
        self._plan_paddock()
        self._plan_paths()

    # ------------------------------------------------------------------ layout
    def _plan_lake(self):
        """The lake on the infield side of the back straight (command 5), as long as most of it,
        its near shore 12 m outside the barrier, the promenade between."""
        t = self.t
        idx = samples(t, 5)
        mid = idx[len(idx) // 2]
        hx, hz = t.heading(mid)
        rx, rz = t.right(mid)
        half = len(idx) * t.ds / 2
        self.lake_a = half * 0.92  # semi-axis along the straight
        self.lake_b = 88.0  # across it
        off = t.barrier + 12.0 + self.lake_b * 0.95
        px, _, pz = t.point(mid, 0.0)
        self.lake_c = (px + rx * off, pz + rz * off)
        self.lake_u = (hx, hz)
        self.lake_v = (rx, rz)
        # the water a little below the lowest road along the lake
        self.water_y = min(t.py[i] for i in idx) - 0.95
        self.promenade = idx

    def lake_xz(self, u, v):
        """A point of the lake's frame (u along the straight, v across) in the world."""
        cx, cz = self.lake_c
        return (cx + self.lake_u[0] * u + self.lake_v[0] * v, cz + self.lake_u[1] * u + self.lake_v[1] * v)

    def lake_depth(self, x, z):
        """Metres in from the lake's shore (negative outside it)."""
        cx, cz = self.lake_c
        dx, dz = x - cx, z - cz
        u = (dx * self.lake_u[0] + dz * self.lake_u[1]) / self.lake_a
        v = (dx * self.lake_v[0] + dz * self.lake_v[1]) / self.lake_b
        inside = (1.0 - math.hypot(u, v)) * self.lake_b
        # never within 12 m of a barrier
        return min(inside, self.t.nearest(x, z)[1] - (self.t.barrier + 12.0))

    def _plan_base(self):
        """A smooth field of the road's heights: the lawns rise and fall with the road."""
        t = self.t
        step = max(1, int(round(12 / t.ds)))
        self._sx = np.array([t.px[i] for i in range(0, t.n, step)])
        self._sz = np.array([t.pz[i] for i in range(0, t.n, step)])
        self._sy = np.array([t.py[i] for i in range(0, t.n, step)])
        self._far = float(np.mean(self._sy))

    def base(self, x, z):
        d2 = (self._sx - x) ** 2 + (self._sz - z) ** 2
        w = np.exp(-d2 / (2 * 70.0 ** 2))
        return float((w * self._sy).sum() + 0.3 * self._far) / (w.sum() + 0.3)

    def _plan_stream(self):
        """A stream out of the woods to the lake's west end, under the road (command 11) by a
        stone bridge."""
        t = self.t
        tip = self.lake_xz(self.lake_a * 0.97, 0.0)
        i = at_frac(t, 11, 0.79)
        self.bridge_i = i
        cx, _, cz = t.point(i, 0.0)
        hx, hz = t.heading(i)
        rx, rz = t.right(i)
        # the infield (the lake) is to the road's right; the stream runs on to its left, north
        pts = [tip, ((tip[0] + cx) / 2 + rx * 12, (tip[1] + cz) / 2 + rz * 12), (cx + rx * 22, cz + rz * 22), (cx, cz),
               (cx - rx * 24 - hx * 4, cz - rz * 24 - hz * 4), (cx - rx * 70 - hx * 18, cz - rz * 70 - hz * 18)]
        far = (cx - rx * 70 - hx * 18, cz - rz * 70 - hz * 18)
        x0, z0, x1, z1 = self.rect
        # on to the park's edge
        k = 0
        while x0 + 10 < far[0] < x1 - 10 and z0 + 10 < far[1] < z1 - 10 and k < 30:
            far = (far[0] - rx * 30 - hx * 6, far[1] - rz * 30 - hz * 6)
            pts.append(far)
            k += 1
        self.stream = catmull(pts, 2.0)
        self.stream_lines = Lines()
        self.stream_lines.add(self.stream)
        self.stream_lines.build()
        self.bed_y = self.water_y - 0.55

    def stream_depth(self, x, z):
        """The stream's channel: (bed height, how much of it here: 1 in the channel, 0 past its banks)."""
        d = self.stream_lines.dist(x, z)
        if d > 13.0:
            return None, 0.0
        return self.bed_y, 1.0 - smoothstep(3.0, 13.0, d)

    def _fits(self, F, hx, hz, margin):
        """Every point of a frame's rectangle (half sizes hx, hz) at least `margin` outside the barriers."""
        t = self.t
        for i in range(-4, 5):
            for j in range(-3, 4):
                x, _, z = F.p(hx * i / 4, 0, hz * j / 3)
                if t.nearest(x, z)[1] < t.barrier + margin or self.lake_depth(x, z) > -8 or self.stream_lines.dist(x, z) < 14:
                    return False
        return True

    def _plan_pitch(self):
        """A floodlit football pitch inside the corner before the last turn (commands 17-19), as close
        to the road as it fits."""
        t = self.t
        best = None
        for k, f in ((17, 0.5), (18, 0.5), (19, 0.5)):
            i = at_frac(t, k, f)
            hx, hz = t.heading(i)
            rx, rz = t.right(i)
            for off in np.arange(t.barrier + 50, t.barrier + 140, 6.0):
                for slide in (-30, -15, 0, 15, 30):
                    px, _, pz = t.point(i, off)
                    o = (px + hx * slide, 0.0, pz + hz * slide)
                    for yaw in (math.atan2(hx, hz) - math.pi / 2, math.atan2(hx, hz)):
                        F = structures.Frame(o, yaw)
                        if self._fits(F, 58.0, 40.0, 14.0):
                            d = min(t.nearest(*F.p(a, 0, b)[::2])[1] for a in (-58, 58) for b in (-40, 40))
                            if best is None or d < best[0]:
                                best = (d, o, yaw)
        if best is None:
            self.pitch = None
            return
        _, o, yaw = best
        y = self.base(o[0], o[2]) - 0.1
        self.pitch = structures.Frame((o[0], y, o[2]), yaw)
        self.boxes.append((self.pitch, 62.0, 44.0, y))

    def _plan_glasshouse(self):
        """The glasshouse on the far side of the esses (commands 15-16), along the road."""
        t = self.t
        i = at_frac(t, 15, 1.0)
        hx, hz = t.heading(i)
        rx, rz = t.right(i)
        # the esses' outside is to the road's left
        for off in np.arange(t.barrier + 26.0, t.barrier + 90.0, 4.0):
            x, _, z = t.point(i, -off)
            F = structures.Frame((x, 0, z), math.atan2(hx, hz) + math.pi / 2)
            if self._fits(F, 25.0, 12.0, 14.0):
                y = self.base(x, z) - 0.1
                self.glasshouse = structures.Frame((x, y, z), F.yaw)
                self.pads.append((x, z, 34.0, y))
                return
        self.glasshouse = None

    def _plan_bandstand(self):
        """The bandstand in the middle of the clearing the hairpin (command 10) wraps round."""
        t = self.t
        i = at_frac(t, 10, 0.5)
        x, _, z = t.point(i, 31.0)
        y = t.surface(x, z) - 0.2
        self.bandstand = (x, y, z)
        self.pads.append((x, z, 12.0, y))
        self.space.add(x, z, 16.0)

    def _plan_paddock(self):
        """The pit building outside the main straight at the start line, the stand across from it."""
        t = self.t
        i = t.at(0.0)
        rx, rz = t.right(i)
        hx, hz = t.heading(i)
        yaw = math.atan2(hx, hz)
        # the road's left is the outside here (the infield is to its right)
        px, py, pz = t.point(i, -(t.barrier + 6.0))
        # (a frame's front faces its -z: the pits look across the road at the stand)
        self.pits = structures.Frame((px, py - 0.2, pz), yaw + math.pi / 2)
        sx, sy, sz = t.point(i, t.barrier + 5.0)
        self.stand = structures.Frame((sx, sy - 0.2, sz), yaw - math.pi / 2)
        for F, hx_, hz_ in ((self.pits, 52.0, 16.0), (self.stand, 32.0, 14.0)):
            # (the frames' local z runs back from the front)
            c = F.p(0, 0, hz_ / 2 - 2.0)
            self.boxes.append((structures.Frame(c, F.yaw), hx_, hz_ / 2 + 4.0, F.o.y))
            for a in np.arange(-hx_, hx_ + 1, 8.0):
                for b in np.arange(-2.0, hz_ + 2.0, 8.0):
                    x, _, z = F.p(a, 0, b)
                    self.space.add(x, z, 4.0)

    def _plan_paths(self):
        """Footpaths: round the lake's far shore, along the stream (under the bridge), round the woods
        outside the hairpin, past the glasshouse to the pitch."""
        t = self.t
        paths = []
        # round the lake's far side, 9 m back from the water
        ring = []
        for k in range(73):
            a = 2 * math.pi * k / 72
            ring.append(self.lake_xz(math.cos(a) * (self.lake_a + 10), math.sin(a) * (self.lake_b + 10)))
        paths += self._clear_runs(ring, 10.0)
        # along the stream's east bank, through under the bridge
        bank = []
        for k in range(0, len(self.stream) - 1, 3):
            (ax, az), (bx, bz) = self.stream[k], self.stream[k + 1]
            l = math.hypot(bx - ax, bz - az) or 1
            bank.append((ax + (bz - az) / l * 6.0, az - (bx - ax) / l * 6.0))
        paths.append(bank)
        # round the woods outside the hairpin: the road's own line from the chicane to the bridge,
        # 36 m out to its left
        loop = []
        for k in (8, 9, 10, 11):
            for i in samples(t, k, 6):
                x, _, z = t.point(i, -(t.barrier + 36.0))
                loop.append((x, z))
        paths += self._clear_runs(catmull(loop[::2], 2.0), 22.0)
        # the glasshouse's front walk, on to the pitch
        if self.glasshouse:
            F = self.glasshouse
            walk = [F.p(-45, 0, -16), F.p(0, 0, -17), F.p(45, 0, -16)]
            walk = [(p[0], p[2]) for p in walk]
            if self.pitch:
                q = self.pitch.p(0, 0, -48)
                walk.append((q[0], q[2]))
            paths += self._clear_runs(catmull(walk, 2.0), 10.0)
        # round the pitch
        if self.pitch:
            F = self.pitch
            ring = [F.p(math.cos(a) * 66, 0, math.sin(a) * 47) for a in np.linspace(0, 2 * math.pi, 49)]
            paths += self._clear_runs([(p[0], p[2]) for p in ring], 10.0)
        self.paths = [p for p in paths if len(p) > 8]
        self.path_lines = Lines()
        for p in self.paths:
            self.path_lines.add(p)
        self.path_lines.build()

    def _clear_runs(self, line, margin):
        """The stretches of a polyline that keep `margin` outside the barriers and out of the water."""
        t = self.t
        runs, cur = [], []
        for (x, z) in line:
            ok = t.nearest(x, z)[1] >= t.barrier + margin and self.lake_depth(x, z) < -3
            if ok:
                cur.append((x, z))
            else:
                if len(cur) > 1:
                    runs.append(cur)
                cur = []
        if len(cur) > 1:
            runs.append(cur)
        return runs

    # ------------------------------------------------------------------ the ground's shape
    def in_box(self, x, z, grow=0.0):
        for (F, hx, hz, y) in self.boxes:
            dx, dz = x - F.o.x, z - F.o.z
            a = dx * F.c - dz * F.s
            b = dx * F.s + dz * F.c
            if abs(a) < hx + grow and abs(b) < hz + grow:
                return y, max(abs(a) - hx, abs(b) - hz)
        return None, 0.0

    def height(self, x, z):
        t = self.t
        i, d = t.nearest(x, z)
        road = t.surface(x, z)
        lawn = self.base(x, z) - 0.25 + 0.55 * noise.noise(Vector((x / 90.0, z / 90.0, 0.3)))
        # flat where something stands
        for (px, pz, r, py) in self.pads:
            dd = math.hypot(x - px, z - pz)
            if dd < r + 14:
                lawn += (py - lawn) * (1.0 - smoothstep(r, r + 14, dd))
        by, edge = self.in_box(x, z, 14.0)
        if by is not None:
            lawn += (by - lawn) * (1.0 - smoothstep(0.0, 14.0, edge))
        # at the road's own level beside it (under it, a little lower: the road hides it), the
        # lawns' gentle rise and fall further out
        if d < t.W + 0.6:
            h = road - 0.55
        else:
            h = road - 0.22
            h += (lawn - h) * smoothstep(t.barrier + 3.0, t.barrier + 24.0, d)
        lake = self.lake_depth(x, z)
        if lake > -10.0:
            bank = self.water_y + 0.28
            if lake > 0:
                h = self.water_y - min(2.3, 0.45 + 0.28 * lake)
            else:
                h = bank + (h - bank) * smoothstep(0.0, 10.0, -lake)
        bed, k = self.stream_depth(x, z)
        if k > 0:
            # the stream's channel cuts down through everything, under the bridge too
            h = min(h, h + (bed - h) * k)
        return h

    # ------------------------------------------------------------------ the ground's colour
    def field(self, n, fn):
        """fn(x, z) over an n x n grid on the rectangle (rows from z0 up)."""
        x0, z0, x1, z1 = self.rect
        out = np.empty((n, n), np.float32)
        for j in range(n):
            z = z0 + (j + 0.5) / n * (z1 - z0)
            for i in range(n):
                out[j, i] = fn(x0 + (i + 0.5) / n * (x1 - x0), z)
        return out

    def albedo(self, size):
        """The ground's colour map (rows from z0 up, as Blender stores images): lawn, the lake's
        muddy shore and the stream's banks, gravel paths and the promenade, the pitch's stripes and
        lines, the paddock's asphalt."""
        t = self.t
        x0, z0, x1, z1 = self.rect
        xs = x0 + (np.arange(size) + 0.5) / size * (x1 - x0)
        zs = z0 + (np.arange(size) + 0.5) / size * (z1 - z0)
        X, Z = np.meshgrid(xs, zs)
        n = min(512, size)
        dist = upsample(self.field(n, lambda x, z: t.nearest(x, z)[1]), size)
        lat = upsample(self.field(n, lambda x, z: t.lateral(t.nearest(x, z)[0], x, z)[0]), size)
        near_idx = upsample(self.field(n, lambda x, z: t.nearest(x, z)[0]), size)
        path = upsample(self.field(n, self.path_lines.dist), size)
        stream = upsample(self.field(n, self.stream_lines.dist), size)
        n1 = _fbm(X / 23.0, Z / 23.0, 3)
        n2 = _fbm(X / 4.1 + 7.0, Z / 4.1 - 3.0, 2)
        col = np.stack([0.05 + 0.02 * n1, 0.085 + 0.03 * n1 + 0.015 * n2, 0.035 + 0.01 * n2], -1)

        def lay(mask, c):
            nonlocal col
            m = np.clip(mask, 0.0, 1.0)[..., None]
            col = col * (1 - m) + c * m

        mud = np.stack([0.07 + 0.02 * n2, 0.065 + 0.015 * n2, 0.045 + 0.01 * n2], -1)
        gravel = np.stack([0.2 + 0.03 * n2, 0.18 + 0.03 * n2, 0.15 + 0.025 * n2], -1)
        # the lake's shore and the stream's banks: mud near the water
        cx, cz = self.lake_c
        dx, dz = X - cx, Z - cz
        u = (dx * self.lake_u[0] + dz * self.lake_u[1]) / self.lake_a
        v = (dx * self.lake_v[0] + dz * self.lake_v[1]) / self.lake_b
        lake = np.minimum((1.0 - np.hypot(u, v)) * self.lake_b, dist - (t.barrier + 12.0))
        lay(1.0 - (-lake) / 4.0, mud)
        lay(1.0 - (stream - 3.0) / 3.0, mud)
        # the paths and the promenade
        lay((PATH_W / 2 - path) / 0.5 + 0.5, gravel)
        lo, hi = min(self.promenade), max(self.promenade)
        along = (near_idx >= lo - 2) & (near_idx <= hi + 2)
        a, b = t.barrier + 4.0, t.barrier + 9.0
        lay((np.minimum(lat - a, b - lat) / 0.6 + 0.5) * along, gravel)
        # the paddock's asphalt
        asphalt = np.stack([0.06 + 0.01 * n2, 0.06 + 0.01 * n2, 0.065 + 0.01 * n2], -1)
        for (F, hx, hz, _) in self.boxes[1:] if self.pitch else self.boxes:
            A = (X - F.o.x) * F.c - (Z - F.o.z) * F.s
            B = (X - F.o.x) * F.s + (Z - F.o.z) * F.c
            lay(np.minimum(hx + 2 - np.abs(A), hz + 2 - np.abs(B)) / 0.6 + 0.5, asphalt)
        # the pitch: mown stripes, white lines
        if self.pitch:
            F = self.pitch
            A = (X - F.o.x) * F.c - (Z - F.o.z) * F.s
            B = (X - F.o.x) * F.s + (Z - F.o.z) * F.c
            inside = (np.abs(A) < 55.0) & (np.abs(B) < 37.0)
            stripe = (np.floor((A + 55.0) / 8.0) % 2)[..., None]
            turf = np.stack([0.06 + 0.01 * n2, 0.12 + 0.02 * n2, 0.045 + 0.01 * n2], -1) * (0.85 + 0.25 * stripe)
            lay(inside.astype(np.float32), turf)
            # (wider than a real line's 12 cm: a map pixel is 60 cm, and a thinner one would break up)
            lines = _pitch_lines(A, B, 0.5)
            lay(lines, np.array([0.55, 0.56, 0.52]))
        rgba = np.ones((size, size, 4), np.float32)
        rgba[..., :3] = np.clip(col, 0.0, 1.0)
        return rgba

    # ------------------------------------------------------------------ building it
    def build(self, coll, quick=False):
        t = self.t
        objects = []
        ground_mat = mesh.material('ground', (0.06, 0.09, 0.04), rough=0.95)
        ground = terrain.grid('ground', self.rect, 6.0 if quick else 3.0, self.height, coll, ground_mat)
        print(f'BUILD ground: {len(ground.data.polygons)} faces', flush=True)
        water = self._water(coll)
        mats = {**props.materials(), **trees.materials(), **structures.materials()}
        self.mats = mats
        self.parts = {k: mesh.Mesh(k, coll) for k in ('lamps', 'lamp_glass', 'buildings', 'trees_near', 'trees_far')}
        self.rng = mesh.rng(7)
        self._structures()
        self._road_lamps()
        self._promenade()
        self._path_lanterns()
        self._woods()
        self._lawns()
        self._willows()
        for name, m in self.parts.items():
            ob = m.build()
            if ob:
                if name in ('buildings', 'lamps'):
                    # (their light is baked per vertex: long walls need vertices along them)
                    mesh.densify(ob)
                objects.append(ob)
                print(f'BUILD {name}: {len(m)} faces', flush=True)
        g = bpy.data.objects.get('lamp_glass')
        if g:
            # the glass mustn't shade its own lamp
            g.visible_shadow = False
        if water:
            # the bake looks through the water: the lake's bed gets the lamps' light, which the game
            # spills across the surface
            water.visible_shadow = False
            water.visible_diffuse = False
            water.visible_glossy = False
        self._light_objects(coll)
        print(f'BUILD lights: {len(self.lights)}', flush=True)
        return {'ground': ground, 'objects': objects, 'water': water, 'lights': self.lights, 'rect': self.rect, 'water_y': self.water_y, 'sky': SKY_GLOW}

    def _add(self, parts, into='buildings'):
        for part, role, smooth in parts:
            target = 'lamp_glass' if role.split('.')[0] in ('lamp', 'window', 'flood', 'glass') else into
            self.parts[target].add(part, self.mats[role], smooth)

    def _tree(self, kind, x, z, near, scale=1.0, min_leaf=None):
        y = self.height(x, z)
        m = self.parts['trees_near' if near else 'trees_far']
        for p in trees.tree(kind, (x, y, z), self.rng, near=near, scale=scale, min_leaf=min_leaf):
            m.add(p[0], self.mats[p[1]], p[2], bend=p[3] if len(p) > 3 else None)
        self.space.add(x, z, trees.crown_of(kind, scale)[0] * 0.7)

    def _structures(self):
        t = self.t
        if self.glasshouse:
            parts, lights = structures.glasshouse(self.glasshouse.o, self.glasshouse.yaw)
            self._add(parts)
            self.lights += lights
            self.space.add(self.glasshouse.o.x, self.glasshouse.o.z, 30.0)
        parts, lights = structures.bandstand(self.bandstand)
        self._add(parts)
        self.lights += lights
        # the bridge
        i = self.bridge_i
        parts, lights = structures.bridge(t, i, 11.0, 2.6, self.bed_y, t.barrier + 0.65)
        self._add(parts)
        self.lights += lights
        for d in (-20, -10, 0, 10, 20):
            x, _, z = t.point(i, 0.0)
            hx, hz = t.heading(i)
            self.space.add(x + hx * d, z + hz * d, 10.0)
        # the pitch: masts along both sides aimed at its middle, goals at its ends
        if self.pitch:
            F = self.pitch
            centre = F.p(0, 0, 0)
            for a in (-40.0, 0.0, 40.0):
                for b in (-41.0, 41.0):
                    base = F.p(a, 0, b)
                    aim = F.p(a * 0.4, 0, b * 0.1)
                    parts, lights = structures.floodlight_mast((base[0], self.height(base[0], base[2]), base[2]), aim)
                    self._add(parts)
                    self.lights += lights
            for a in (-52.5, 52.5):
                parts, _ = structures.goal(F.p(a, 0, 0), F.yaw + (math.pi if a > 0 else 0.0))
                self._add(parts)
            for a in np.arange(-60, 61, 8.0):
                for b in np.arange(-42, 43, 8.0):
                    x, _, z = F.p(a, 0, b)
                    self.space.add(x, z, 4.0)
        # the paddock
        parts, lights = structures.pit_building(self.pits.o, self.pits.yaw)
        self._add(parts)
        self.lights += lights
        parts, lights = structures.stand(self.stand.o, self.stand.yaw)
        self._add(parts)
        self.lights += lights

    def _road_lamps(self):
        """Swan-neck lamps along the whole circuit, over the barriers, the two sides staggered."""
        t = self.t
        spacing = 30.0
        n = int(t.length // spacing)
        for k in range(n):
            s = (k + 0.5) * t.length / n
            i = t.at(s)
            side = 1 if k % 2 else -1
            gx, _, gz = t.point(i, side * (t.barrier + 1.7))
            if self.lake_depth(gx, gz) > -3.0 or self.in_box(gx, gz, 3.0)[0] is not None or self.stream_lines.dist(gx, gz) < 9:
                continue
            rx, rz = t.right(i)
            parts, light = props.road_lamp((gx, self.height(gx, gz), gz), (-side * rx, -side * rz))
            self._add(parts, 'lamps')
            self.lights.append(light)
            self.space.add(gx, gz, 1.5)

    def _promenade(self):
        """The promenade: lanterns along its lake side every 18 m, plane trees between them."""
        t = self.t
        idx = self.promenade
        for j in range(0, len(idx), int(round(18 / t.ds))):
            i = idx[j]
            gx, _, gz = t.point(i, t.barrier + 9.6)
            parts, light = props.lantern((gx, self.height(gx, gz), gz))
            self._add(parts, 'lamps')
            self.lights.append(light)
            self.space.add(gx, gz, 1.0)
            if j + 5 < len(idx):
                tx, _, tz = t.point(idx[j + 4], t.barrier + 10.8)
                if self.lake_depth(tx, tz) < -1.0 and self.space.free(tx, tz, 3.0):
                    road_y = t.py[idx[j + 4]]
                    self._tree('plane', tx, tz, True, 1.0, min_leaf=road_y + CANOPY_CLEAR - self.height(tx, tz))

    def _path_lanterns(self):
        """Lanterns along the footpaths every 24 m, the sides alternating; a bench now and then."""
        t = self.t
        k = 0
        for path in self.paths:
            run = 0.0
            for (a, b) in zip(path, path[1:]):
                seg_len = math.hypot(b[0] - a[0], b[1] - a[1])
                run += seg_len
                if run < 24.0:
                    continue
                run = 0.0
                k += 1
                l = seg_len or 1
                nx, nz = -(b[1] - a[1]) / l, (b[0] - a[0]) / l
                side = 1 if k % 2 else -1
                x, z = b[0] + nx * side * (PATH_W / 2 + 0.6), b[1] + nz * side * (PATH_W / 2 + 0.6)
                if t.nearest(x, z)[1] < t.barrier + 4 or self.lake_depth(x, z) > -1:
                    continue
                parts, light = props.lantern((x, self.height(x, z), z))
                self._add(parts, 'lamps')
                self.lights.append(light)
                self.space.add(x, z, 1.2)
                if k % 3 == 0:
                    bx, bz = b[0] - nx * side * (PATH_W / 2 + 0.7), b[1] - nz * side * (PATH_W / 2 + 0.7)
                    self._add(props.bench((bx, self.height(bx, bz), bz), math.atan2(nx * side, nz * side)), 'lamps')
        # keep trees off the paths
        for (x, z) in self.path_lines.pts[::3]:
            self.space.add(x, z, 2.5)
        for (x, z) in self.stream_lines.pts[::3]:
            self.space.add(x, z, 4.0)

    def _woods(self):
        """The woods round the hairpin (commands 8-11): big trees right behind the barriers whose
        crowns close over the road, more behind them, coarser further back."""
        t = self.t
        rng = self.rng
        cmds = (8, 9, 10, 11)
        for k in cmds:
            for i in samples(t, k, 6):
                for side in (-1, 1):
                    x, _, z = t.point(i, side * (t.barrier + CLEAR_TRUNK + rng.uniform(0.3, 1.6)))
                    if t.nearest(x, z)[1] < t.barrier + CLEAR_TRUNK or self.lake_depth(x, z) > -4 or not self.space.free(x, z, 4.0):
                        continue
                    kind = rng.choice(('oak', 'oak', 'lime', 'plane'))
                    self._tree(kind, x, z, True, 1.1, min_leaf=t.py[i] + CANOPY_CLEAR - self.height(x, z))
        idx = [i for k in cmds for i in samples(t, k, 1)]
        xs = [t.px[i] for i in idx]
        zs = [t.pz[i] for i in idx]
        box = (min(xs) - WOODS, min(zs) - WOODS, max(xs) + WOODS, max(zs) + WOODS)
        wood_set = set(idx)
        for _ in range(14000):
            x = rng.uniform(box[0], box[2])
            z = rng.uniform(box[1], box[3])
            i, d = t.nearest(x, z)
            if d > WOODS or d < t.barrier + CLEAR_TRUNK + 1.0 or self.lake_depth(x, z) > -4:
                continue
            if i not in wood_set and d < 60:
                continue
            kind = rng.choice(('oak', 'lime', 'lime', 'birch', 'pine', 'oak'))
            near = d < NEAR
            # close together by the road, where the eye is; further back fewer, bigger trees
            scale = 1.0 if near else 1.2
            r = trees.crown_of(kind, scale)[0] * 0.7
            if self.space.free(x, z, r, 0.75 if near else 1.05):
                self._tree(kind, x, z, near, scale, min_leaf=(t.py[i] + CANOPY_CLEAR - self.height(x, z)) if d < t.barrier + 10 else None)

    def _lawns(self):
        """The open park: trees standing apart, alone or in small groups."""
        t = self.t
        rng = self.rng
        x0, z0, x1, z1 = self.rect
        for _ in range(2500):
            x = rng.uniform(x0, x1)
            z = rng.uniform(z0, z1)
            i, d = t.nearest(x, z)
            if d < t.barrier + 8.0 or self.lake_depth(x, z) > -6 or self.in_box(x, z, 6.0)[0] is not None:
                continue
            kind = rng.choice(('oak', 'plane', 'lime', 'birch', 'poplar', 'pine'))
            r = trees.crown_of(kind)[0]
            if self.space.free(x, z, r * 3.2 if rng.random() < 0.8 else r):
                self._tree(kind, x, z, d < NEAR, 1.1)

    def _willows(self):
        """Willows on the lake's far bank."""
        t = self.t
        rng = self.rng
        for k in range(16):
            a = 2 * math.pi * (k + rng.random() * 0.5) / 16
            x, z = self.lake_xz(math.cos(a) * (self.lake_a + 4), math.sin(a) * (self.lake_b + 4))
            if t.nearest(x, z)[1] < t.barrier + 16 or self.lake_depth(x, z) > -2 or not self.space.free(x, z, 4.0):
                continue
            self._tree('willow', x, z, True)

    def _water(self, coll):
        """The water: a sheet over the lake and one along the stream (the banks hide their edges)."""
        m = mesh.Mesh('water', coll)
        mat = mesh.material('water', (0.01, 0.015, 0.02), rough=0.05)
        pts = [self.lake_xz(math.cos(2 * math.pi * k / 48) * (self.lake_a + 6), math.sin(2 * math.pi * k / 48) * (self.lake_b + 6)) for k in range(48)]
        area = sum(pts[k][0] * pts[(k + 1) % 48][1] - pts[(k + 1) % 48][0] * pts[k][1] for k in range(48))
        if area > 0:
            pts.reverse()
        m.add(([(x, self.water_y, z) for (x, z) in pts], [tuple(range(48))]), mat)
        # the stream: a ribbon along it
        verts, faces = [], []
        line = self.stream
        for k, (a, b) in enumerate(zip(line, line[1:])):
            l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
            # (wide enough that its edges are buried in the banks)
            nx, nz = -(b[1] - a[1]) / l * 8.0, (b[0] - a[0]) / l * 8.0
            verts += [(a[0] - nx, self.water_y - 0.05, a[1] - nz), (a[0] + nx, self.water_y - 0.05, a[1] + nz)]
            if k:
                q = (2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k)
                faces.append(q)
        # (wound to face up whichever way the stream runs)
        if faces:
            v = [Vector(p) for p in verts[:3]]
            if (v[1] - v[0]).cross(v[2] - v[0]).y < 0:
                faces = [f[::-1] for f in faces]
            m.add((verts, faces), mat)
        return m.build()

    def _light_objects(self, coll):
        """A Cycles light for every lamp (points, and spots for the floodlights), and the moon."""
        el, az = math.radians(MOON['elevation']), math.radians(MOON['azimuth'])
        data = bpy.data.lights.new('moon', 'SUN')
        data.color = MOON['color']
        # a sun of strength S lights a surface facing it to S / pi in a diffuse bake
        data.energy = MOON['ground'] * math.pi / math.sin(el)
        data.angle = math.radians(1.5)
        ob = bpy.data.objects.new('moon', data)
        # (shining down from elevation el, azimuth az measured from the game's +z toward +x)
        d = Vector(G(-math.cos(el) * math.sin(az), -math.sin(el), -math.cos(el) * math.cos(az)))
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        coll.objects.link(ob)
        for k, L in enumerate(self.lights):
            spot = 'aim' in L
            data = bpy.data.lights.new(f'L{k}', 'SPOT' if spot else 'POINT')
            data.color = L['color']
            # the power that lights the ground below (or where it's aimed) to L['power'] (game units)
            if spot:
                d = (Vector(L['aim']) - Vector(L['p'])).length
                data.energy = props.light_power(L['power'], d)
                data.spot_size = L['spot']
                data.spot_blend = 0.35
            else:
                h = max(1.0, L['p'][1] - self.height(L['p'][0], L['p'][2]))
                data.energy = props.light_power(L['power'], h)
            data.shadow_soft_size = 0.12 if not spot else 0.6
            ob = bpy.data.objects.new(f'L{k}', data)
            ob.location = Vector(G(*L['p']))
            if spot:
                d = Vector(G(*L['aim'])) - ob.location
                ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
            coll.objects.link(ob)


def _pitch_lines(A, B, w):
    """1 on a football pitch's white lines (A along it, B across, metres from its middle)."""
    L, Wd = 52.5, 34.0
    m = np.zeros(A.shape, np.float32)

    def line(d):
        return np.clip(1.0 - np.abs(d) / w, 0.0, 1.0)

    inside = (np.abs(A) <= L + w) & (np.abs(B) <= Wd + w)
    m = np.maximum(m, line(np.abs(A) - L) * (np.abs(B) <= Wd))
    m = np.maximum(m, line(np.abs(B) - Wd) * (np.abs(A) <= L))
    m = np.maximum(m, line(A) * (np.abs(B) <= Wd))
    m = np.maximum(m, line(np.hypot(A, B) - 9.15))
    for s in (-1, 1):
        # the penalty areas and goal areas
        for depth, half in ((16.5, 20.15), (5.5, 9.16)):
            x = s * (L - depth)
            m = np.maximum(m, line(A - x) * (np.abs(B) <= half) * (s * A >= s * x - w))
            m = np.maximum(m, line(np.abs(B) - half) * (s * A >= L - depth) * (s * A <= L))
    return m * inside


def _fbm(x, z, octaves):
    """Value noise over arrays (numpy), 0..1."""
    total = np.zeros_like(x, dtype=np.float32)
    amp = 0.5
    f = 1.0
    norm = 0.0
    for o in range(octaves):
        total += amp * _vnoise(x * f + o * 17.3, z * f - o * 9.1)
        norm += amp
        amp *= 0.5
        f *= 2.0
    return total / norm


def _hash(ix, iz):
    h = (ix * 374761393 + iz * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def _vnoise(x, z):
    ix = np.floor(x).astype(np.int64)
    iz = np.floor(z).astype(np.int64)
    fx = x - ix
    fz = z - iz
    ux = fx * fx * (3 - 2 * fx)
    uz = fz * fz * (3 - 2 * fz)
    a = _hash(ix, iz)
    b = _hash(ix + 1, iz)
    c = _hash(ix, iz + 1)
    d = _hash(ix + 1, iz + 1)
    return (a * (1 - ux) + b * ux) * (1 - uz) + (c * (1 - ux) + d * ux) * uz


def build(track, coll, quick=False):
    park = Park(track)
    out = park.build(coll, quick)
    out['albedo'] = park.albedo(512 if quick else MAP)
    return out


def views(track):
    """Preview views: (name, eye, target, fov) in game space."""
    t = track
    out = []

    def from_track(name, s, d, h, ahead, look_d, look_h, fov=60):
        out.append((name, t.point(t.at(s), d, h), t.point(t.at(s + ahead), look_d, look_h), fov))

    s5, s10, s11, s15, s18 = (seg(t, k) for k in (5, 10, 11, 15, 18))
    from_track('promenade', s5[0] + 120, 0.0, 3.4, 60, 3.0, 2.0)
    from_track('woods', s10[0] - 140, 0.0, 3.4, 60, 0.0, 2.5)
    from_track('bridge', s11[0] + 190, 0.0, 3.4, 50, 0.0, 1.5)
    from_track('glasshouse', s15[0] - 60, 0.0, 3.4, 40, -30.0, 4.0)
    from_track('pitch', s18[0] - 60, 0.0, 3.4, 50, 40.0, 6.0)
    from_track('start', -40, 0.0, 3.4, 70, 0.0, 2.0)
    cx = (t.bounds['minX'] + t.bounds['maxX']) / 2
    cz = (t.bounds['minZ'] + t.bounds['maxZ']) / 2
    out.append(('aerial', (cx + 300, 260, cz + 500), (cx, 0, cz), 55))
    return out
