"""The ground: a grid over the set's rectangle at the heights the design gives it, flat stretches
merged afterwards (the light comes from a baked map, not the vertices, so the mesh only needs the
shape), with a planar UV over the rectangle that the light and colour maps share.

UV (u, v) = ((x - x0) / (x1 - x0), (z - z0) / (z1 - z0)) in game space; the glTF export flips v, so
in the game the maps' top row is z1 and the bottom row z0.
"""
import math

import bmesh
import bpy

from .track import G


def grid(name, rect, cell, height, coll, mat, dissolve_deg=1.2):
    """A ground mesh over rect (x0, z0, x1, z1) every `cell` metres, heights from height(x, z)."""
    x0, z0, x1, z1 = rect
    nx = int(math.ceil((x1 - x0) / cell))
    nz = int(math.ceil((z1 - z0) / cell))
    xs = [x0 + (x1 - x0) * i / nx for i in range(nx + 1)]
    zs = [z0 + (z1 - z0) * j / nz for j in range(nz + 1)]
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rows = []
    for z in zs:
        row = []
        for x in xs:
            row.append(bm.verts.new(G(x, height(x, z), z)))
        rows.append(row)
    for j in range(nz):
        for i in range(nx):
            # (game x right, z down the rows: wound so the face looks up, +y)
            f = bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
            for loop in f.loops:
                gx, gz = loop.vert.co.x, -loop.vert.co.y
                loop[uv].uv = ((gx - x0) / (x1 - x0), (gz - z0) / (z1 - z0))
    bm.normal_update()
    # merge the flat stretches: faces within dissolve_deg of each other become one
    if dissolve_deg:
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(dissolve_deg), use_dissolve_boundaries=False, verts=bm.verts, edges=bm.edges)
        bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def face_up_check(ob):
    """Fraction of faces whose normals point up (Blender +z): should be ~1 for a ground."""
    up = sum(1 for p in ob.data.polygons if p.normal.z > 0)
    return up / max(1, len(ob.data.polygons))
