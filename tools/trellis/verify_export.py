"""Re-import an exported runtime GLB (pre-compression copy) and check it.

    blender -b -P tools/trellis/verify_export.py -- <character> [...]

Checks: every rig joint present with geometry, a pivot extra on each joint,
UVs present and inside [0, 1], one textured material with base colour,
metallic-roughness, normal and occlusion maps, texture sizes, and that the
reassembled suit's height matches characters.json. Writes
reports/<character>_export_check.json and exits non-zero on failure.
"""
import json
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import common as C  # noqa: E402

JOINTS = ['hips', 'upper', 'head', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
          'bicep_L', 'bicep_R', 'forearm_L', 'forearm_R', 'glove_L', 'glove_R']


def check(character):
    C.reset()
    raw = os.path.join(C.DIRS['work'], character, character + '_raw.glb')
    bpy.ops.import_scene.gltf(filepath=raw)
    objs = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
    problems = []
    result = {'joints': {}, 'materials': [], 'textures': {}}
    top = 0.0
    for joint in JOINTS:
        obj = objs.get(joint)
        if not obj:
            problems.append('missing joint ' + joint)
            continue
        me = obj.data
        uv = me.uv_layers.active
        coords = [c for d in uv.data for c in d.uv] if uv else []
        pivot = obj.get('pivot')
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        result['joints'][joint] = {'triangles': tris, 'pivot': list(pivot) if pivot else None,
                                   'uv_range': [min(coords), max(coords)] if coords else None}
        if not tris:
            problems.append(joint + ' has no faces')
        if not pivot:
            problems.append(joint + ' has no pivot extra')
        if not uv:
            problems.append(joint + ' has no UVs')
        elif min(coords) < -1e-3 or max(coords) > 1.001:
            problems.append(joint + ' UVs outside [0,1]')
        if joint == 'head' and pivot:
            top = pivot[1] + max(v.co.z for v in me.vertices)  # Blender Z = game Y
    for mat in {s.material for o in objs.values() for s in o.material_slots if s.material}:
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        maps = {sock: bsdf.inputs[sock].is_linked for sock in ('Base Color', 'Roughness', 'Metallic', 'Normal')}
        result['materials'].append({'name': mat.name, 'linked': maps})
        if not all(maps.values()):
            problems.append('material %s missing maps %s' % (mat.name, [k for k, v in maps.items() if not v]))
    for img in bpy.data.images:
        result['textures'][img.name] = list(img.size)
    occlusion = any(n.type == 'GROUP' and 'glTF' in (n.node_tree.name if n.node_tree else '')
                    for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes)
    result['occlusion_map'] = occlusion
    if not occlusion:
        problems.append('no occlusion map')
    expected = C.config()[character]['target_height']
    result['height_m'] = round(top, 3)
    if abs(top - expected) > .03:
        problems.append('height %.3f m, expected %.3f m' % (top, expected))
    result['problems'] = problems
    result['ok'] = not problems
    json.dump(result, open(os.path.join(C.DIRS['reports'], character + '_export_check.json'), 'w'), indent=2)
    print('EXPORT_CHECK', character, 'OK' if not problems else problems, flush=True)
    return not problems


ok = all([check(c) for c in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['lifeline'])])
sys.exit(0 if ok else 1)
