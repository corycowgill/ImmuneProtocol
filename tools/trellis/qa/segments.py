"""QA: reassemble an exported runtime suit at its joint pivots (arms down) with
each rig joint tinted, front and side, so segmentation problems are visible.

    blender -b -P tools/trellis/qa/segments.py -- <character> [...]
Writes tools/trellis/renders/<character>/QA_segments.png
"""
import colorsys
import os
import sys

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common as C  # noqa: E402


def game_to_bl(p):
    return Vector((p[0], -p[2], p[1]))


def run(character):
    C.reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(C.DIRS['work'], character, character + '_raw.glb'))
    objs = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
    piv = {n: game_to_bl(o['pivot']) for n, o in objs.items()}
    for i, (name, obj) in enumerate(sorted(objs.items())):
        obj.location = piv[name]
        kind, _, sfx = name.partition('_')
        if kind == 'bicep':
            obj.scale.z = (piv[name] - piv['forearm_' + sfx]).length
        elif kind == 'forearm':
            obj.scale.z = (piv[name] - piv['glove_' + sfx]).length
        elif kind == 'glove':
            obj.rotation_euler.x = -1.5708  # undo fingers-forward for the rest pose
        mat = bpy.data.materials.new('seg_' + name)
        mat.use_nodes = True
        rgb = colorsys.hsv_to_rgb((i * .618) % 1, .75, .9)
        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1)
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    cam = C.studio(samples=16, resolution=768)
    out = os.path.join(C.DIRS['renders'], character)
    os.makedirs(out, exist_ok=True)
    height = C.config()[character]['target_height']
    C.render_views(cam, height, os.path.join(out, 'QA_segments'), views=['front', 'side'])


for c in sys.argv[sys.argv.index('--') + 1:]:
    run(c)
