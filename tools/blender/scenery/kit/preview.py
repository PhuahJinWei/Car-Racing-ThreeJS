"""Preview renders of a set, lit by its own lamps: quick looks at the modelling before a bake.

They're rendered the way the game shows the world (no tone mapping, the road's brightness gain as
exposure), so a preview is a fair guess at the game, though the game's own road isn't in it.
"""
import math
import os
import time

import bpy
from mathutils import Vector

from .track import G


def setup(size=(960, 540), engine='EEVEE', samples=24, sky=None):
    scene = bpy.context.scene
    if engine == 'CYCLES':
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    else:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    # the game multiplies the baked light by 2.6 on the road and the ground
    scene.view_settings.exposure = math.log2(2.6)
    w = scene.world or bpy.data.worlds.new('night')
    scene.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    # the night sky's glow, as the bake has it (else a dim city sky)
    bg.inputs['Color'].default_value = (*(sky or (0.012, 0.016, 0.03)), 1.0)
    bg.inputs['Strength'].default_value = 1.0


def view(path, eye, target, fov=60.0):
    """Render the view from eye toward target (game space) to path."""
    scene = bpy.context.scene
    cam = scene.camera
    if cam is None:
        cam = bpy.data.objects.new('preview_cam', bpy.data.cameras.new('preview_cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
    cam.data.lens_unit = 'FOV'
    cam.data.angle = math.radians(fov)
    cam.data.clip_start = 0.1
    cam.data.clip_end = 4000.0
    cam.location = Vector(G(*eye))
    d = Vector(G(*target)) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'PREVIEW {path} {time.time() - t:.1f}s', flush=True)
