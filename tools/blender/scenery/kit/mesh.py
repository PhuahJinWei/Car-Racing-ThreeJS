"""Building meshes in game space (y up), the way a set is made: many small parts gathered into one
Blender object per kind of thing, each face carrying a material named after its role (the game
swaps in its own material by the name before the dot: 'leaves.oak' is a 'leaves').

Parts are (verts, faces) pairs in game space; Mesh collects them and becomes a Blender object.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

from .track import G

# ------------------------------------------------------------------------------ materials
_mats = {}


def material(name, color=(0.5, 0.5, 0.5), rough=0.8, emission=None, strength=0.0, metal=0.0, transmission=0.0, alpha=1.0):
    """The material for a role (created once). emission: the colour it glows (in the bake too)."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if transmission:
        b.inputs['Transmission Weight'].default_value = transmission
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1.0)
        b.inputs['Emission Strength'].default_value = strength
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
    m.diffuse_color = (*color, 1.0)
    _mats[name] = m
    return m


def collection(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in (parent or bpy.context.scene.collection).children:
        (parent or bpy.context.scene.collection).children.link(c)
    return c


# ------------------------------------------------------------------------------ parts
def box(center, size, yaw=0.0):
    """An axis-aligned box (game space) turned by yaw about y."""
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    c, s = math.cos(yaw), math.sin(yaw)
    verts = []
    for (a, b, d) in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)):
        x, z = a * sx, d * sz
        verts.append((cx + x * c + z * s, cy + b * sy, cz - x * s + z * c))
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]
    return verts, faces


def frame_axes(p0, p1, up=(0.0, 1.0, 0.0)):
    """Unit axes (along, side, normal) for a segment from p0 to p1."""
    a = Vector(p1) - Vector(p0)
    a.normalize()
    u = Vector(up)
    if abs(a.dot(u)) > 0.98:
        u = Vector((1.0, 0.0, 0.0))
    s = a.cross(u)
    s.normalize()
    n = s.cross(a)
    return a, s, n


def tube(p0, p1, r0, r1=None, sides=6, caps=True, twist=0.0):
    """A tapered tube from p0 to p1 (radius r0 to r1), `sides` round."""
    r1 = r0 if r1 is None else r1
    a, s, n = frame_axes(p0, p1)
    verts = []
    for (p, r) in ((Vector(p0), r0), (Vector(p1), r1)):
        for k in range(sides):
            t = 2 * math.pi * (k + 0.5 * twist) / sides
            verts.append(tuple(p + (s * math.cos(t) + n * math.sin(t)) * r))
    # (wound to face out: the rings run from side toward normal, which is clockwise seen along a)
    faces = [(k, sides + k, sides + (k + 1) % sides, (k + 1) % sides) for k in range(sides)]
    if caps:
        faces.append(tuple(range(sides)))
        faces.append(tuple(reversed(range(sides, 2 * sides))))
    return verts, faces


def lathe(profile, center=(0.0, 0.0, 0.0), sides=8, yaw=0.0, close_top=True, close_bottom=True):
    """A surface of revolution about the vertical: profile [(radius, height), ...] bottom to top."""
    cx, cy, cz = center
    verts = []
    rows = []
    for (r, h) in profile:
        row = []
        if r < 1e-4:
            row = [len(verts)]
            verts.append((cx, cy + h, cz))
        else:
            for k in range(sides):
                t = yaw + 2 * math.pi * k / sides
                row.append(len(verts))
                verts.append((cx + r * math.cos(t), cy + h, cz + r * math.sin(t)))
        rows.append(row)
    # (the rings run counter-clockwise seen from below, so each band is wound bottom, up, along)
    faces = []
    for a, b in zip(rows, rows[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            faces += [(a[0], b[k], b[(k + 1) % sides]) for k in range(sides)]
        elif len(b) == 1:
            faces += [(a[k], b[0], a[(k + 1) % sides]) for k in range(sides)]
        else:
            faces += [(a[k], b[k], b[(k + 1) % sides], a[(k + 1) % sides]) for k in range(sides)]
    if close_bottom and len(rows[0]) > 1:
        faces.append(tuple(rows[0]))
    if close_top and len(rows[-1]) > 1:
        faces.append(tuple(reversed(rows[-1])))
    return verts, faces


def blob(center, radii, subdiv=1, lump=0.18, seed=0, squash_bottom=0.0):
    """A lumpy ellipsoid (an icosphere pushed about by noise): a clump of leaves."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rx, ry, rz = radii
    off = Vector((seed * 7.31, seed * 3.17, seed * 5.71))
    verts = []
    for v in bm.verts:
        d = v.co.copy()
        k = 1.0 + lump * (noise.noise(d * 1.7 + off) * 1.4)
        y = d.z * ry * k
        if squash_bottom and y < 0:
            y *= 1.0 - squash_bottom
        # (Blender's z up is the game's y, its y the game's -z: a turn, so the faces stay outward)
        verts.append((center[0] + d.x * rx * k, center[1] + y, center[2] - d.y * rz * k))
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return verts, faces


def cone(base, height, r, sides=7, yaw=0.0):
    """A cone standing on base (game space)."""
    return lathe([(r, 0.0), (0.0, height)], base, sides, yaw, close_top=False)


def prism(footprint, y0, y1):
    """A vertical prism over a footprint [(x, z), ...] counter-clockwise seen from above."""
    n = len(footprint)
    verts = [(x, y0, z) for (x, z) in footprint] + [(x, y1, z) for (x, z) in footprint]
    faces = [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple(range(n, 2 * n)))
    return verts, faces


def transform(part, m):
    """A part through a 4x4 matrix (game space)."""
    verts, faces = part
    return [tuple(m @ Vector(v)) for v in verts], faces


def place(part, offset=(0.0, 0.0, 0.0), yaw=0.0, scale=1.0):
    """A part turned by yaw about y, scaled, then moved by offset."""
    c, s = math.cos(yaw), math.sin(yaw)
    ox, oy, oz = offset
    verts, faces = part
    out = []
    for (x, y, z) in verts:
        x, y, z = x * scale, y * scale, z * scale
        out.append((ox + x * c + z * s, oy + y, oz - x * s + z * c))
    return out, faces


# ------------------------------------------------------------------------------ meshes
class Mesh:
    """Parts gathered into one object, faces tagged with their material."""

    def __init__(self, name, coll):
        self.name = name
        self.coll = coll
        self.verts = []
        self.faces = []
        self.face_mat = []
        self.mats = []
        self.smooth = []
        self.bend = []

    def add(self, part, mat, smooth=False, bend=None):
        """bend: a point (game space) the part's normals lean toward (foliage: a crown's centre)."""
        verts, faces = part
        base = len(self.verts)
        self.verts.extend(verts)
        self.bend.extend([bend] * len(verts))
        if mat not in self.mats:
            self.mats.append(mat)
        mi = self.mats.index(mat)
        for f in faces:
            self.faces.append(tuple(base + i for i in f))
            self.face_mat.append(mi)
            self.smooth.append(smooth)
        return self

    def __len__(self):
        return len(self.faces)

    def _bend_normals(self, me, amount=0.7):
        """Lean the normals of the parts given a bend point toward pointing away from it: the
        corners of everything else keep their own normals."""
        import numpy as np

        nv, nl = len(me.vertices), len(me.loops)
        co = np.empty(nv * 3, np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        vn = np.empty(nv * 3, np.float32)
        me.vertex_normals.foreach_get('vector', vn)
        vn = vn.reshape(-1, 3)
        cn = np.empty(nl * 3, np.float32)
        me.corner_normals.foreach_get('vector', cn)
        cn = cn.reshape(-1, 3)
        lv = np.empty(nl, np.int64)
        me.loops.foreach_get('vertex_index', lv)
        has = np.array([b is not None for b in self.bend])
        cen = np.array([G(*b) if b is not None else (0.0, 0.0, 0.0) for b in self.bend], np.float32)
        out = co - cen
        out /= np.linalg.norm(out, axis=1, keepdims=True) + 1e-9
        bent = vn * (1 - amount) + out * amount
        bent /= np.linalg.norm(bent, axis=1, keepdims=True) + 1e-9
        normals = np.where(has[lv][:, None], bent[lv], cn)
        me.normals_split_custom_set(normals.tolist())

    def build(self):
        if not self.faces:
            return None
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([G(*v) for v in self.verts], [], self.faces)
        for m in self.mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.face_mat)
        me.polygons.foreach_set('use_smooth', self.smooth)
        me.validate(clean_customdata=False)
        me.update()
        if any(b is not None for b in self.bend) and len(me.vertices) == len(self.bend):
            self._bend_normals(me)
        ob = bpy.data.objects.new(self.name, me)
        self.coll.objects.link(ob)
        return ob


def densify(ob, max_len=1.8, passes=8):
    """Ready an object for a bake into its vertices: split its long edges until none is longer than
    max_len (a 90 m wall with a vertex at each corner can't show a lamp's pool on it), and its hard
    edges apart (a corner shared by a lit front and a dark end wall would light both)."""
    if ob is None:
        return
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for _ in range(passes):
        long = [e for e in bm.edges if e.calc_length() > max_len]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
    # (the export splits these vertices anyway, for their normals: this costs nothing there)
    hard = [e for e in bm.edges if len(e.link_faces) == 2 and not all(f.smooth for f in e.link_faces) and e.calc_face_angle(0.0) > math.radians(30)]
    bmesh.ops.split_edges(bm, edges=hard)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def rng(seed):
    return random.Random(seed)
