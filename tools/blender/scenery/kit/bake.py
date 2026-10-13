"""Baking the set's night lighting in Cycles.

Two bakes: the light (diffuse, direct and bounced: the lamps, and the night's own light, the moon
and the city's glow in the sky, which the design adds), and how open each spot is to the sky
(ambient occlusion: dark under trees and eaves; the game scales its own ambient by it). Both go
into one RGBA value:
  rgb = sqrt(light / LIGHT_MAX)   (more steps in the dark, where the eye sees them)
  a   = sky
for the ground into a light map over its rectangle, for everything else into a colour per corner.
"""
import math
import time

import bpy
import numpy as np

# the brightest light the encoding holds (a floodlit pitch is about 4)
LIGHT_MAX = 8.0


def cycles(samples=64, bounces=2):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = bounces
    scene.cycles.diffuse_bounces = bounces
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 2
    scene.cycles.transparent_max_bounces = 4
    scene.cycles.use_light_tree = True
    scene.render.bake.margin = 4
    return scene


def world(color=(0.0, 0.0, 0.0), strength=1.0, ao_distance=None):
    scene = bpy.context.scene
    w = scene.world or bpy.data.worlds.new('night')
    scene.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (*color, 1.0)
    bg.inputs['Strength'].default_value = strength
    if ao_distance:
        w.light_settings.distance = ao_distance
    return w


def _select(objs):
    for o in bpy.context.view_layer.objects:
        if o:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def _image_node(mat, image):
    """Make `image` the active image node of mat (the bake writes into it)."""
    nt = mat.node_tree
    node = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image == image), None)
    if node is None:
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = image
        node.location = (-600, -400)
    for n in nt.nodes:
        n.select = False
    node.select = True
    nt.nodes.active = node
    return node


def blur(a, sigma):
    """A separable gaussian blur over the first two axes of an array (the bake's grain)."""
    r = max(1, int(math.ceil(sigma * 3)))
    k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * sigma * sigma))
    k /= k.sum()
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r, r)
        p = np.pad(a, pad, mode='edge')
        out = np.zeros_like(a)
        for i, w in enumerate(k):
            sl = [slice(None)] * a.ndim
            sl[axis] = slice(i, i + a.shape[axis])
            out += w * p[tuple(sl)]
        a = out
    return a


def bake_ground(ground, size, samples, sky=(0.0, 0.0, 0.0)):
    """Bake the ground's light map: returns an RGBA float array (size x size), rows from z0 up.
    sky: the night sky's glow (the world's colour) for the light pass."""
    mat = ground.data.materials[0]
    out = {}
    for kind in ('light', 'sky'):
        img = bpy.data.images.new(f'ground_{kind}', size, size, alpha=False, float_buffer=True)
        _image_node(mat, img)
        _select([ground])
        t = time.time()
        if kind == 'light':
            world(sky, 1.0)
            bpy.context.scene.cycles.samples = samples
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, target='IMAGE_TEXTURES', margin=4)
        else:
            world((1.0, 1.0, 1.0), 1.0, ao_distance=18.0)
            bpy.context.scene.cycles.samples = max(16, samples // 2)
            bpy.ops.object.bake(type='AO', target='IMAGE_TEXTURES', margin=4)
        px = np.empty(size * size * 4, np.float32)
        img.pixels.foreach_get(px)
        out[kind] = px.reshape(size, size, 4)
        print(f'BAKE ground {kind} {size}x{size}, {time.time() - t:.1f}s', flush=True)
    rgba = np.empty((size, size, 4), np.float32)
    # (a pixel or so of blur takes out the grain the samples leave)
    rgba[..., :3] = np.sqrt(np.clip(blur(out['light'][..., :3], 1.0) / LIGHT_MAX, 0.0, 1.0))
    rgba[..., 3] = np.clip(blur(out['sky'][..., 0], 1.0), 0.0, 1.0)
    return rgba


def bake_vertices(objs, samples, sky=(0.0, 0.0, 0.0)):
    """Bake light and sky into every object's vertices; leaves a byte colour 'COLOR' (encoded) as the
    active colour attribute of each, for the glTF export."""
    objs = [o for o in objs if o.type == 'MESH' and len(o.data.polygons)]
    if not objs:
        return
    # (a colour per vertex, not per corner: per corner, every shared vertex splits in the export)
    for o in objs:
        me = o.data
        for name in ('bake_light', 'bake_sky'):
            if name not in me.color_attributes:
                me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    for kind, name in (('light', 'bake_light'), ('sky', 'bake_sky')):
        for o in objs:
            attr = o.data.color_attributes[name]
            o.data.color_attributes.active_color = attr
        _select(objs)
        t = time.time()
        if kind == 'light':
            world(sky, 1.0)
            bpy.context.scene.cycles.samples = samples
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, target='VERTEX_COLORS')
        else:
            world((1.0, 1.0, 1.0), 1.0, ao_distance=18.0)
            bpy.context.scene.cycles.samples = max(16, samples // 2)
            bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        verts = sum(len(o.data.vertices) for o in objs)
        print(f'BAKE {kind} on {len(objs)} objects, {verts} vertices, {time.time() - t:.1f}s', flush=True)
    for o in objs:
        me = o.data
        n = len(me.vertices)
        light = np.empty(n * 4, np.float32)
        sky = np.empty(n * 4, np.float32)
        me.color_attributes['bake_light'].data.foreach_get('color', light)
        me.color_attributes['bake_sky'].data.foreach_get('color', sky)
        # the bake's noise (a vertex gets only so many of the many lamps' samples) evened out
        # over each vertex's neighbours
        light = smooth(me, light.reshape(-1, 4), 3)
        sky = smooth(me, sky.reshape(-1, 4), 2)
        enc = np.empty((n, 4), np.float32)
        enc[:, :3] = np.sqrt(np.clip(light[:, :3] / LIGHT_MAX, 0.0, 1.0))
        enc[:, 3] = np.clip(sky[:, 0], 0.0, 1.0)
        col = me.color_attributes.get('COLOR') or me.color_attributes.new('COLOR', 'BYTE_COLOR', 'POINT')
        # (byte colours are stored as sRGB by Blender and handed back linear: pass the raw values)
        col.data.foreach_set('color', enc.ravel())
        me.color_attributes.remove(me.color_attributes['bake_light'])
        me.color_attributes.remove(me.color_attributes['bake_sky'])
        me.color_attributes.active_color = me.color_attributes['COLOR']
        me.color_attributes.render_color_index = me.color_attributes.active_color_index


def smooth(me, values, passes):
    """Per-vertex values (n x k) averaged with their neighbours along the mesh's edges."""
    nv = len(me.vertices)
    ev = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', ev)
    a, b = ev[0::2], ev[1::2]
    deg = (np.bincount(a, minlength=nv) + np.bincount(b, minlength=nv)).astype(np.float64)
    v = values.astype(np.float64)
    for _ in range(passes):
        s = np.zeros_like(v)
        for k in range(v.shape[1]):
            s[:, k] = np.bincount(a, weights=v[b, k], minlength=nv) + np.bincount(b, weights=v[a, k], minlength=nv)
        v = np.where(deg[:, None] > 0, 0.5 * v + 0.5 * s / np.maximum(deg, 1)[:, None], v)
    return v.astype(np.float32)


def srgb(c):
    """Linear -> sRGB (for colour maps saved 8 bits a channel)."""
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def save_png(rgba, path, alpha=True, fmt='PNG', quality=90):
    """Save an RGBA float array (rows from the bottom, as Blender stores images) as an 8-bit PNG
    (or JPEG), the values as they are (no colour management)."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new('save_' + str(abs(hash(path)) % 10000), w, h, alpha=alpha, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = fmt
    # (a fresh image saves as it is; save_render would put it through the scene's view transform)
    try:
        img.save(quality=quality)
    except TypeError:
        img.save()
    return img
