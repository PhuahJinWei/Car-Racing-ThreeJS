"""A car's 2D drawings (side, plan, front views) as dense closed outlines, drawn the way the retired
car factory drew them (its sdf.js densify): Catmull-Rom between control points
(u, v[, 1]), where a point flagged 1 stays a sharp corner. The remodelled cars keep the
factory designs' drawings, so their silhouettes and proportions stay as approved.
"""
import math


def _sharp(p):
    return len(p) > 2 and bool(p[2])


def _cap(m, limit):
    length = math.hypot(*m)
    return m if length <= limit or length == 0 else (m[0] * limit / length, m[1] * limit / length)


def densify(points, step=0.004, clamp=3.0):
    """Dense closed polyline through control points (as the factory's densify: Catmull-Rom, in its
    Hermite form). A tangent longer than `clamp` times its segment is shortened: beside a long
    straight run a short segment otherwise overshoots its end and loops back - a spike out of the
    outline (a fin behind a pickup's tailgate, a tail squared off past its rounded corners). Keep
    neighbouring segments within a few times each other's length all the same."""
    n = len(points)
    out = []
    for i in range(n):
        p1 = points[i]
        p2 = points[(i + 1) % n]
        p0 = p1 if _sharp(p1) else points[(i - 1) % n]
        p3 = p2 if _sharp(p2) else points[(i + 2) % n]
        seg = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        m1 = _cap(((p2[0] - p0[0]) / 2, (p2[1] - p0[1]) / 2), clamp * seg)
        m2 = _cap(((p3[0] - p1[0]) / 2, (p3[1] - p1[1]) / 2), clamp * seg)
        steps = max(1, math.ceil(seg / step))
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            h00, h10, h01, h11 = 2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, 3 * t2 - 2 * t3, t3 - t2
            out.append((h00 * p1[0] + h10 * m1[0] + h01 * p2[0] + h11 * m2[0], h00 * p1[1] + h10 * m1[1] + h01 * p2[1] + h11 * m2[1]))
    return out


def mirror_u(half):
    """A half outline (u >= 0, from one end on the axis to the other) mirrored into a closed shape."""
    back = [(-p[0], p[1], *p[2:]) for p in reversed(half[1:-1])]
    return list(half) + back


class Outline:
    """A closed 2D outline: where a line across it enters and leaves."""

    def __init__(self, points, step=0.004):
        self.points = points
        self.poly = densify(points, step)
        us = [p[0] for p in self.poly]
        vs = [p[1] for p in self.poly]
        self.umin, self.umax, self.vmin, self.vmax = min(us), max(us), min(vs), max(vs)

    def _cross(self, a, axis):
        out = []
        P = self.poly
        n = len(P)
        o = 1 - axis
        for i in range(n):
            p, q = P[i], P[(i + 1) % n]
            if (p[axis] > a) != (q[axis] > a):
                t = (a - p[axis]) / (q[axis] - p[axis])
                out.append(p[o] + (q[o] - p[o]) * t)
        out.sort()
        return out

    def at_u(self, u):
        """v of every crossing of the vertical line at u (sorted)."""
        return self._cross(u, 0)

    def at_v(self, v):
        """u of every crossing of the horizontal line at v (sorted)."""
        return self._cross(v, 1)

    def span_v(self, u):
        c = self.at_u(u)
        return (c[0], c[-1]) if len(c) >= 2 else None

    def span_u(self, v):
        c = self.at_v(v)
        return (c[0], c[-1]) if len(c) >= 2 else None

    def half_width(self, v):
        """Largest |u| inside at height v (for a plan outline mirrored about u = 0)."""
        c = self.at_v(v)
        return max(abs(c[0]), abs(c[-1])) if len(c) >= 2 else 0.0

    def contains(self, u, v):
        return sum(1 for x in self.at_v(v) if x < u) % 2 == 1
