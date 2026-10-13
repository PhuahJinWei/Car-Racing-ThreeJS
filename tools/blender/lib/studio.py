"""Preview renders: stand-in wheels, a studio floor and lights, six views on one contact sheet.

Nothing here reaches the game: the game generates its own wheels and lights its own scene.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

from . import geo


def lathe(name, profile, center, coll, role, segments=48, side=1):
    """A closed surface of revolution round an axle along x: profile is a closed loop of
    (radius, axial offset) points, the axial offset growing outward on side `side`."""
    cx, cy, cz = center
    rows = len(profile)
    verts = []
    for (r, a) in profile:
        for k in range(segments):
            t = 2 * math.pi * k / segments
            verts.append((cx + side * a, cy + r * math.cos(t), cz + r * math.sin(t)))
    faces = []
    for j in range(rows):
        for i in range(segments):
            a0 = j * segments + i
            b0 = j * segments + (i + 1) % segments
            jn = ((j + 1) % rows) * segments
            faces.append((a0, b0, jn + (i + 1) % segments, jn + i))
    return geo.make_mesh(name, verts, faces, coll, role, sharp=45.0)


def preview_wheels(wheels, coll):
    """Stand-ins for the game's wheels: slick tyres and flat covered rims."""
    for key in ('front', 'rear'):
        w = wheels[key]
        r, hw = w['r'], w['w'] / 2
        rim = w.get('rim', r - 0.084)
        for s in (1, -1):
            c = (s * w['x'], w['y'], w['z'])
            tyre = [(rim, -hw + 0.02), (rim + 0.02, -hw), ((rim + r) / 2, -hw - 0.006), (r - 0.03, -hw), (r, -hw + 0.03),
                    (r, hw - 0.03), (r - 0.03, hw), ((rim + r) / 2, hw + 0.006), (rim + 0.02, hw), (rim, hw - 0.02)]
            lathe(f'tyre_{key}_{s}', tyre, c, coll, 'tyre', side=s)
            cover = [(0.01, hw - 0.03), (rim - 0.01, hw - 0.012), (rim + 0.01, hw - 0.004), (rim + 0.01, -hw + 0.03), (0.01, -hw + 0.03)]
            lathe(f'rim_{key}_{s}', cover, c, coll, 'rim', side=s)


def setup(meta, size=(640, 400)):
    """Studio floor, lights and world; returns the preview collection."""
    scene = bpy.context.scene
    coll = geo.collection('preview')
    bpy.ops.mesh.primitive_plane_add(size=60)
    ground = bpy.context.active_object
    ground.name = 'ground'
    for c in ground.users_collection:
        c.objects.unlink(ground)
    coll.objects.link(ground)
    ground.data.materials.append(geo.material('ground'))
    preview_wheels(meta['wheels'], coll)

    def area(name, loc, power, size_, energy_color=(1, 1, 1)):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = power
        data.size = size_
        data.color = energy_color
        ob = bpy.data.objects.new(name, data)
        coll.objects.link(ob)
        ob.location = Vector(geo.G(*loc))
        d = Vector((0, 0, 0.3)) - ob.location
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return ob

    area('key', (3.5, 5.0, 3.0), 1800, 4.0)
    area('fill', (-4.0, 3.0, -1.0), 700, 5.0, (0.9, 0.95, 1.0))
    area('rim', (0.0, 4.0, -6.0), 900, 4.0)
    area('top', (0.0, 7.0, 0.0), 900, 8.0)
    world = bpy.data.worlds.new('studio')
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.05, 0.055, 0.06, 1)
    bg.inputs['Strength'].default_value = 1.0
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    return coll


VIEWS = [
    # name, kind, eye (game space), target, ortho scale
    ('front34', 'persp', (3.6, 1.55, 4.6), (0.0, 0.32, 0.25), 0),
    ('rear34', 'persp', (-3.4, 1.9, -4.9), (0.0, 0.38, -0.3), 0),
    ('side', 'ortho', (12.0, 0.45, 0.0), (0.0, 0.45, 0.0), 5.7),
    ('top', 'ortho', (0.0, 12.0, 0.0), (0.0, 0.0, 0.0), 5.7),
    ('front', 'ortho', (0.0, 0.5, 12.0), (0.0, 0.5, 0.0), 2.4),
    ('rear', 'ortho', (0.0, 0.5, -12.0), (0.0, 0.5, 0.0), 2.4),
]
# close-ups, rendered only when asked for by name (--only)
CLOSEUPS = [
    ('inlet', 'persp', (2.3, 0.85, 2.4), (0.45, 0.42, 0.35), 0),
    ('tail', 'persp', (-2.0, 1.15, -3.9), (0.0, 0.55, -1.9), 0),
    ('cockpit', 'persp', (1.4, 1.9, 1.2), (0.0, 0.72, 0.3), 0),
    ('nose', 'persp', (1.9, 0.75, 3.6), (0.2, 0.22, 2.2), 0),
    ('chase', 'persp', (0.0, 2.1, -7.5), (0.0, 0.5, 0.0), 0),
    ('quarter', 'persp', (-2.6, 1.6, -3.4), (0.7, 0.9, -1.7), 0),
    ('flank', 'persp', (4.2, 1.2, 0.4), (0.6, 0.75, 0.0), 0),
    ('deck', 'persp', (0.6, 2.4, -3.3), (0.0, 0.92, -1.35), 0),
    ('screen', 'persp', (1.1, 1.75, 2.9), (0.0, 0.92, 0.55), 0),
    ('pillar', 'persp', (2.3, 1.35, 1.9), (0.7, 0.95, 0.5), 0),
]


def camera(name, kind, eye, target, scale):
    data = bpy.data.cameras.new(name)
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = Vector(geo.G(*eye))
    d = Vector(geo.G(*target)) - ob.location
    up = 'Y' if abs(d.normalized().z) < 0.99 else 'Z'
    ob.rotation_euler = d.to_track_quat('-Z', up).to_euler()
    if abs(d.normalized().z) > 0.99:
        # straight down, nose to the left as in the side view
        ob.rotation_euler = (0.0, 0.0, math.pi / 2)
    if kind == 'ortho':
        data.type = 'ORTHO'
        data.ortho_scale = scale
    else:
        data.lens = 50
    data.clip_end = 100
    return ob


def car_bounds():
    """Game-space bounds (min, max) of everything being rendered but the floor."""
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name == 'ground' or any(c.hide_render for c in ob.users_collection) or ob.hide_render:
            continue
        for v in ob.bound_box:
            p = ob.matrix_world @ Vector(v)
            g = (p.x, p.z, -p.y)
            for i in range(3):
                lo[i] = min(lo[i], g[i])
                hi[i] = max(hi[i], g[i])
    return lo, hi


def fit(view, bounds, aspect):
    """A view (drawn for a 4.8 m, 1.3 m tall, 2 m wide car) fitted to this car's bounds."""
    name, kind, eye, target, scale = view
    (x0, y0, z0), (x1, y1, z1) = bounds
    L, H, W = z1 - z0, y1 - max(y0, 0.0), x1 - x0
    cz = (z0 + z1) / 2
    if kind == 'ortho':
        if name in ('side',):
            scale = max(L * 1.12, H * 1.3 * aspect)
        elif name == 'top':
            scale = max(L * 1.12, W * 1.25 * aspect)
        else:
            scale = max(W * 1.15, H * 1.3 * aspect)
        k = H / 1.3
        tgt = (0.0, target[1] * k, cz if name != 'side' else cz)
        e = list(eye)
        if name == 'side':
            e = [eye[0], tgt[1], cz]
        elif name == 'top':
            e = [0.0, eye[1], cz]
            tgt = (0.0, 0.0, cz)
        else:
            e = [0.0, tgt[1], eye[2]]
        return name, kind, tuple(e), tgt, scale
    s = max(L / 4.8, H / 1.3, W / 2.0)
    tgt = (target[0] * W / 2.0, target[1] * H / 1.3, cz + target[2] * L / 4.8)
    e = tuple(tgt[i] + (eye[i] - target[i]) * s for i in range(3))
    return name, kind, e, tgt, scale


def contact_sheet(path, views=VIEWS, cols=3, size=(640, 400), only=None):
    """Render each view (fitted to the car's size) and tile them into one PNG at `path`."""
    scene = bpy.context.scene
    w, h = size
    tiles = []
    tmp = os.path.splitext(path)[0]
    if only:
        views = [v for v in views + CLOSEUPS if v[0] in only]
    bounds = car_bounds()
    for view in views:
        name, kind, eye, target, scale = fit(view, bounds, w / h)
        cam = camera('cam_' + name, kind, eye, target, scale)
        scene.camera = cam
        scene.render.filepath = f'{tmp}_{name}.png'
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(scene.render.filepath)
        px = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(px)
        tiles.append(px.reshape(h, w, 4))
        bpy.data.images.remove(img)
        os.remove(scene.render.filepath)
    rows = (len(tiles) + cols - 1) // cols
    sheet = np.zeros((rows * h, cols * w, 4), np.float32)
    sheet[..., 3] = 1
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        # image rows run bottom-up: the first tile goes at the top
        y0 = (rows - 1 - r) * h
        sheet[y0:y0 + h, c * w:(c + 1) * w] = t
    out = bpy.data.images.new('sheet', cols * w, rows * h, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    return path
