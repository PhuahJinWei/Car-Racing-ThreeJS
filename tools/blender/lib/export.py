"""Bake ambient occlusion and write each LOD's meshes, grouped by material role, for the packer.

Output: <name>.json (manifest + the car's meta) and <name>.bin (float32 positions, normals and AO,
uint32 indices per part), all in game space. tools/blender/build.mjs turns them into the game's
.glb files with the car factory's writer.
"""
import json

import bpy
import numpy as np

# The retired car factory's AO (its mesher.js bakeAO) leaves an open flat panel at 0.6 and
# darkens low, downward faces as if the road were there. The game's materials are tuned to that,
# so Blender's AO goes through the same formula.
AO_OPEN = 0.6
# eased everywhere: on dark glossy glass every speck of bake noise shows in the reflections
AO_DEFAULTS = {'glass': 0.3, 'chrome': 0.7}


def smooth_ao(me, ao_corner, lv, cn, passes=5):
    """Average the baked AO over neighbouring corners of the same smooth surface: per-vertex bake
    noise reads as a mottle on glossy paint and glass. (Never across a sharp edge: a lamp pocket's
    dark walls averaged into the rim of its opening darkened the paint round it, and every long thin
    triangle leaving the rim smeared that out across the panel in streaks.)"""
    nl = len(lv)
    if nl == 0:
        return ao_corner
    # a group per vertex and normal: the corners round a vertex on one smooth surface
    key = np.column_stack([lv, np.round(cn * 64).astype(np.int64)])
    _, grp = np.unique(key, axis=0, return_inverse=True)
    grp = grp.ravel()
    ng = int(grp.max()) + 1
    cnt = np.bincount(grp, minlength=ng).astype(np.float64)
    av = np.bincount(grp, weights=ao_corner, minlength=ng) / np.maximum(cnt, 1)
    # neighbours: consecutive corners round each face (always on one surface)
    starts = np.empty(len(me.polygons), np.int64)
    sizes = np.empty(len(me.polygons), np.int64)
    me.polygons.foreach_get('loop_start', starts)
    me.polygons.foreach_get('loop_total', sizes)
    idx = np.arange(nl)
    face = np.repeat(np.arange(len(starts)), sizes)
    nxt = np.where(idx + 1 < starts[face] + sizes[face], idx + 1, starts[face])
    a, b = grp[idx], grp[nxt]
    keep = a != b
    a, b = a[keep], b[keep]
    deg = np.bincount(a, minlength=ng) + np.bincount(b, minlength=ng)
    for _ in range(passes):
        s = np.bincount(a, weights=av[b], minlength=ng) + np.bincount(b, weights=av[a], minlength=ng)
        av = np.where(deg > 0, 0.5 * av + 0.5 * s / np.maximum(deg, 1), av)
    return av[grp].astype(np.float32)


def bake_ao(objs, distance=0.2, samples=160):
    """Cycles AO into a corner colour attribute 'ao' on every object (all of them, plus anything
    else renderable, occlude each other)."""
    scene = bpy.context.scene
    engine = scene.render.engine
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    if scene.world is None:
        scene.world = bpy.data.worlds.new('bake')
    scene.world.light_settings.distance = distance
    for o in objs:
        me = o.data
        attr = me.color_attributes.get('ao') or me.color_attributes.new('ao', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    scene.render.engine = engine


def role_of(mat):
    return mat.name.split('.')[0] if mat else 'trim'


def gather(objs, ao_strength=None):
    """{role: (positions, normals, ao, indices)} in game space for a list of objects."""
    ao_strength = {**AO_DEFAULTS, **(ao_strength or {})}
    parts = {}
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        nt = len(me.loop_triangles)
        if nt == 0:
            ev.to_mesh_clear()
            continue
        nl = len(me.loops)
        loops = np.empty(nt * 3, np.int32)
        me.loop_triangles.foreach_get('loops', loops)
        mats = np.empty(nt, np.int32)
        me.loop_triangles.foreach_get('material_index', mats)
        lv = np.empty(nl, np.int32)
        me.loops.foreach_get('vertex_index', lv)
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        cn = np.empty(nl * 3, np.float32)
        me.corner_normals.foreach_get('vector', cn)
        cn = cn.reshape(-1, 3)
        attr = me.color_attributes.get('ao')
        if attr is not None:
            raw = np.empty(len(attr.data) * 4, np.float32)
            attr.data.foreach_get('color', raw)
            ao = raw[0::4] if attr.domain == 'CORNER' else raw[0::4][lv]
            ao = smooth_ao(me, ao.astype(np.float64), lv, cn)
        else:
            ao = np.ones(nl, np.float32)
        mw = np.array(ob.matrix_world, np.float32)
        co = co @ mw[:3, :3].T + mw[:3, 3]
        cn = cn @ np.linalg.inv(mw[:3, :3]).astype(np.float32)
        cn /= np.linalg.norm(cn, axis=1, keepdims=True) + 1e-12
        tris = loops.reshape(-1, 3)
        for mi in np.unique(mats):
            role = role_of(me.materials[mi] if mi < len(me.materials) else None)
            corners = tris[mats == mi].ravel()
            vi = lv[corners]
            n = cn[corners]
            a = ao[corners]
            key = np.column_stack([vi, np.round(n * 1024).astype(np.int32), np.round(a * 255).astype(np.int32)])
            uniq, inv = np.unique(key, axis=0, return_inverse=True)
            inv = inv.ravel()
            first = np.empty(len(uniq), np.int64)
            first[inv] = np.arange(len(corners))
            p = co[vi[first]]
            nn = n[first]
            aa = a[first]
            # Blender (x, y, z) -> game (x, z, -y)
            gp = np.column_stack([p[:, 0], p[:, 2], -p[:, 1]]).astype(np.float32)
            gn = np.column_stack([nn[:, 0], nn[:, 2], -nn[:, 1]]).astype(np.float32)
            s = ao_strength.get(role, 1.0)
            aa = 1 - (1 - aa) * s
            ground = np.clip(gp[:, 1] / 0.35, 0, 1)
            aa = aa * (0.55 + 0.45 * np.minimum(1, ground + np.maximum(0, gn[:, 1]) * 0.8))
            aa = np.maximum(0.05, aa * AO_OPEN).astype(np.float32)
            parts.setdefault(role, []).append((gp, gn, aa, inv.astype(np.uint32)))
        ev.to_mesh_clear()
    out = {}
    for role, lst in parts.items():
        off = 0
        P, N, A, I = [], [], [], []
        for gp, gn, aa, idx in lst:
            P.append(gp)
            N.append(gn)
            A.append(aa)
            I.append(idx + off)
            off += len(gp)
        out[role] = (np.concatenate(P), np.concatenate(N), np.concatenate(A), np.concatenate(I))
    return out


def write(path_base, lods, meta):
    """lods: {name: {role: (P, N, A, I)}} -> <path_base>.json + .bin"""
    manifest = {'meta': meta, 'lods': {}}
    offset = 0
    with open(path_base + '.bin', 'wb') as f:
        for name, parts in lods.items():
            entries = []
            for role, (P, N, A, I) in sorted(parts.items()):
                blobs = [P.astype(np.float32).tobytes(), N.astype(np.float32).tobytes(), A.astype(np.float32).tobytes(),
                         I.astype(np.uint32).tobytes()]
                entries.append({'role': role, 'verts': int(len(P)), 'indices': int(len(I)), 'offset': offset})
                for b in blobs:
                    f.write(b)
                    offset += len(b)
            manifest['lods'][name] = entries
    with open(path_base + '.json', 'w') as f:
        json.dump(manifest, f, indent=1)
