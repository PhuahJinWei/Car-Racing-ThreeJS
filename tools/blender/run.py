"""Build a scripted car in Blender, headless (tools/blender/build.mjs runs this):

  blender -b --factory-startup --python tools/blender/run.py -- <car> <out_dir> [options]
    --lods=lod0,lodm,lod1   detail levels to build (default: all three)
    --preview               render a contact sheet of six views (<car>.png) from lod0
    --only=front34,side     just these preview views
    --size=1280x800         preview tile size
    --no-export             skip the AO bake and the mesh export (shape previews)
    --blend                 also save <car>.blend to look at or tweak in Blender

The design lives in cars/<car>.py: build(collection, lod) adds its parts for one detail level,
META is the car's game metadata (wheels, lights, livery anchors), AO_STRENGTH eases baked AO
per material role.
"""
import importlib
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import export, geo, road, studio  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
car, out = argv[0], argv[1]
opts = {a.split('=')[0]: (a.split('=')[1] if '=' in a else True) for a in argv[2:]}
lods = opts.get('--lods', 'lod0,lodm,lod1').split(',')
os.makedirs(out, exist_ok=True)
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
design = importlib.import_module(f'cars.{car}')
colls = {}
for lod in lods:
    t = time.time()
    colls[lod] = geo.collection(lod)
    road.LOD['scale'] = {'lod0': 1.0, 'lodm': 1.6, 'lod1': 3.0}.get(lod, 1.0)
    design.build(colls[lod], lod)
    tris = 0
    for ob in colls[lod].objects:
        ob.data.calc_loop_triangles()
        tris += len(ob.data.loop_triangles)
    print(f'BUILD {lod}: {len(colls[lod].objects)} parts, {tris} tris, {time.time() - t:.1f}s', flush=True)


def show_only(name):
    for lod, c in colls.items():
        c.hide_render = lod != name
        c.hide_viewport = lod != name


size = tuple(int(v) for v in opts['--size'].split('x')) if isinstance(opts.get('--size'), str) else (640, 400)
preview = studio.setup(design.META, size)
if opts.get('--preview'):
    t = time.time()
    show_only(lods[0])
    only = opts['--only'].split(',') if isinstance(opts.get('--only'), str) else None
    studio.contact_sheet(os.path.join(out, f'{car}.png'), only=only, size=size, cols=min(3, len(only) if only else 3))
    print(f'PREVIEW {os.path.join(out, car + ".png")} {time.time() - t:.1f}s', flush=True)

if not opts.get('--no-export'):
    ground = bpy.data.objects.get('ground')
    if ground:
        ground.hide_render = True
    results = {}
    for lod in lods:
        t = time.time()
        show_only(lod)
        objs = list(colls[lod].objects)
        export.bake_ao(objs)
        results[lod] = export.gather(objs, getattr(design, 'AO_STRENGTH', None))
        counts = ', '.join(f'{r} {len(p[3]) // 3}' for r, p in sorted(results[lod].items()))
        total = sum(len(p[3]) // 3 for p in results[lod].values())
        print(f'EXPORT {lod}: {total} tris ({counts}) {time.time() - t:.1f}s', flush=True)
    export.write(os.path.join(out, car), results, design.META)

if opts.get('--blend'):
    for c in colls.values():
        c.hide_viewport = False
        c.hide_render = False
    for lod, c in colls.items():
        # only the full-detail model shows when the file is opened
        if lod != lods[0]:
            c.hide_viewport = True
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f'{car}.blend'))
print(f'DONE {time.time() - t0:.1f}s', flush=True)
