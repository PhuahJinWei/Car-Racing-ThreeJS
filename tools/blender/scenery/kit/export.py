"""Exporting a set to the game: one .glb of meshes (Draco-compressed, each with its baked light and
sky in COLOR_0, materials named after their roles), the set's own data in the scene's extras (its
lamps, the ground's rectangle, the water level...), and the ground's maps as separate images.
"""
import json
import math

import bmesh
import bpy
from mathutils import Vector


def split_by_cells(ob, cell, coll):
    """Split an object into pieces by which `cell`-metre square (game x, z) each face's centre falls
    in: smaller pieces cull better in the game, and Draco's precision is per piece."""
    me = ob.data
    keys = {}
    for p in me.polygons:
        c = p.center
        gx, gz = c.x, -c.y
        keys.setdefault((math.floor(gx / cell), math.floor(gz / cell)), []).append(p.index)
    if len(keys) <= 1:
        return [ob]
    pieces = []
    for (i, j), faces in sorted(keys.items()):
        bm = bmesh.new()
        bm.from_mesh(me)
        keep = set(faces)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
        nm = bpy.data.meshes.new(f'{ob.name}_{i}_{j}')
        bm.to_mesh(nm)
        bm.free()
        for m in me.materials:
            nm.materials.append(m)
        # (bmesh keeps the colours but not which is the active one: the export takes that one)
        if 'COLOR' in nm.color_attributes:
            nm.color_attributes.active_color = nm.color_attributes['COLOR']
            nm.color_attributes.render_color_index = nm.color_attributes.active_color_index
        piece = bpy.data.objects.new(nm.name, nm)
        coll.objects.link(piece)
        pieces.append(piece)
    bpy.data.objects.remove(ob)
    return pieces


def glb(path, objs, extras):
    """Write the objects (and nothing else) to a .glb with the set's data in the scene's extras."""
    scene = bpy.context.scene
    for k in list(scene.keys()):
        del scene[k]
    scene['scenery'] = json.dumps(extras)
    # (objects removed by the split can linger in the view layer's list as empty entries)
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        if o:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_image_format='NONE',
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_attributes=False,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14,
        export_draco_color_quantization=10,
        export_draco_generic_quantization=12,
    )
