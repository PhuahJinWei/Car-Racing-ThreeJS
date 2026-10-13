"""Build a track's set in Blender, headless (build.mjs runs this):

  blender -b --factory-startup --python tools/blender/scenery/run.py -- <set> <track.json> <out> [options]
    --preview      render the set's preview views (<set>-<view>.png)
    --only=a,b     just these views          --size=960x540   preview size
    --no-bake      skip the bake (and the export: an unbaked set isn't worth shipping)
    --no-export    build and preview only
    --quick        a fast bake: a small light map, few samples, a coarser ground
    --blend        also save <set>.blend

Writes <set>.glb (the meshes, their baked light in COLOR_0, the set's data in the scene's extras),
<set>-light.webp (the ground's light map) and <set>-ground.jpg (its colour) into <out>.
"""
import importlib
import json
import os
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# (no __pycache__ folders left beside the sources)
sys.dont_write_bytecode = True
sys.path.insert(0, HERE)

from kit import bake, export, mesh, preview  # noqa: E402
from kit.track import Track  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
name, track_file, out = argv[0], argv[1], argv[2]
opts = {a.split('=')[0]: (a.split('=')[1] if '=' in a else True) for a in argv[3:]}
quick = bool(opts.get('--quick'))
os.makedirs(out, exist_ok=True)
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
track = Track(track_file)
design = importlib.import_module(name)
coll = mesh.collection('set')
t = time.time()
built = design.build(track, coll, quick)
tris = 0
for ob in coll.objects:
    if ob.type == 'MESH':
        ob.data.calc_loop_triangles()
        tris += len(ob.data.loop_triangles)
print(f'BUILD done: {tris} tris, {len(built["lights"])} lamps, {time.time() - t:.1f}s', flush=True)

# the ground's colour, for the bake's bounced light and the previews
x0, z0, x1, z1 = built['rect']
# (the colour map is saved sRGB-encoded, as colour maps are: 8 bits go further that way)
albedo = built['albedo'].copy()
albedo[..., :3] = bake.srgb(albedo[..., :3])
albedo_img = bake.save_png(albedo, os.path.join(out, f'{name}-ground.png'), alpha=False)
gmat = built['ground'].data.materials[0]
tex = gmat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = albedo_img
tex.image.colorspace_settings.name = 'sRGB'
gmat.node_tree.links.new(tex.outputs['Color'], gmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

if opts.get('--preview'):
    size = tuple(int(v) for v in opts['--size'].split('x')) if isinstance(opts.get('--size'), str) else (960, 540)
    only = opts['--only'].split(',') if isinstance(opts.get('--only'), str) else None
    preview.setup(size, sky=built.get('sky'))
    for (vname, eye, target, fov) in design.views(track):
        if only and vname not in only:
            continue
        preview.view(os.path.join(out, f'{name}-{vname}.png'), eye, target, fov)

if not opts.get('--no-bake') and not opts.get('--no-export'):
    sky = built.get('sky', (0.0, 0.0, 0.0))
    bake.cycles(samples=16 if quick else 128)
    # the light map: 1024 a side (about a metre a pixel: plenty for lamps' pools), a lossy WebP
    # (a tenth of the PNG; the light is smooth)
    size = 512 if quick else 1024
    light = bake.bake_ground(built['ground'], size, 24 if quick else 160, sky)
    bake.save_png(light, os.path.join(out, f'{name}-light.webp'), fmt='WEBP', quality=92)
    targets = [o for o in built['objects'] if o.name != 'lamp_glass']
    bake.bake_vertices(targets, 24 if quick else 96, sky)
    # pieces about 200 m across: they cull, and Draco's precision is per piece
    pieces = []
    for ob in [built['ground'], *built['objects']]:
        pieces += export.split_by_cells(ob, 200.0, coll)
    if built.get('water'):
        pieces.append(built['water'])
    extras = {
        'version': 1,
        'rect': [x0, z0, x1, z1],
        'lightMap': f'{name}-light.webp',
        'groundMap': f'{name}-ground.jpg',
        'lightMax': bake.LIGHT_MAX,
        'waterY': built['water_y'],
        'lights': [{'p': [round(v, 3) for v in L['p']], 'color': list(L['color']), 'power': L['power'], 'kind': L['kind']} for L in built['lights']],
    }
    t = time.time()
    export.glb(os.path.join(out, f'{name}.glb'), pieces, extras)
    # the light version for phones on low quality: the same, without the trees far from the road
    export.glb(os.path.join(out, f'{name}.m.glb'), [p for p in pieces if not p.name.startswith('trees_far')], extras)
    # the colour map as a JPEG (the light map stays a PNG: no blocks in the dark)
    bake.save_png(albedo, os.path.join(out, f'{name}-ground.jpg'), alpha=False, fmt='JPEG')
    print(f'EXPORT {len(pieces)} pieces, {time.time() - t:.1f}s', flush=True)

if opts.get('--blend'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f'{name}.blend'))
print(f'DONE {time.time() - t0:.1f}s', flush=True)
