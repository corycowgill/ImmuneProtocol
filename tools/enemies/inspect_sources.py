"""Reports geometry/material stats for each source GLB and renders a preview.

blender -b -P tools/enemies/inspect_sources.py -- <source_dir> <out_dir>
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
SOURCE, OUT = args[0], args[1]
os.makedirs(OUT, exist_ok=True)


def bounds(objects):
    corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    lo = Vector([min(c[i] for c in corners) for i in range(3)])
    hi = Vector([max(c[i] for c in corners) for i in range(3)])
    return lo, hi


def preview(path, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    lo, hi = bounds(meshes)
    size = hi - lo
    centre = (lo + hi) / 2
    images = [{'name': i.name, 'size': list(i.size)} for i in bpy.data.images]
    stats = {
        'file': os.path.basename(path),
        'bytes': os.path.getsize(path),
        'meshes': len(meshes),
        'vertices': sum(len(o.data.vertices) for o in meshes),
        'triangles': sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes),
        'materials': [m.name for m in bpy.data.materials],
        'images': images,
        'size': [round(v, 3) for v in size],
        'animations': [a.name for a in bpy.data.actions],
        'armatures': len([o for o in bpy.context.scene.objects if o.type == 'ARMATURE']),
    }
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    world.color = (0.05, 0.05, 0.06)
    scene.world = world
    radius = max(size) * .5
    camera = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    direction = Vector((1, -1.6, .7)).normalized()
    camera.location = centre + direction * radius * 3.4
    camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
    for offset, energy in ((Vector((2, -2, 3)), 900), (Vector((-3, 1, 1)), 350), (Vector((0, 3, -1)), 250)):
        light = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA'))
        light.data.energy = energy * radius * radius
        light.data.size = radius * 3
        light.location = centre + offset * radius * 2
        light.rotation_euler = (centre - light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    return stats


report = []
for file in sorted(os.listdir(SOURCE)):
    if file.endswith('.glb'):
        report.append(preview(os.path.join(SOURCE, file), os.path.splitext(file)[0]))
        print(json.dumps(report[-1]), flush=True)
json.dump(report, open(os.path.join(OUT, 'sources.json'), 'w'), indent=2)
