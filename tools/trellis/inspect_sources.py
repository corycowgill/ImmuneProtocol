"""Stage 2 - Import each original TRELLIS GLB, run geometry/texture diagnostics,
and render normalised preview views for identification.

    blender -b -P tools/trellis/inspect_sources.py -- [A B C D]

Writes tools/trellis/reports/source_<X>_diagnostics.json and
tools/trellis/renders/preview/source_<X>_<view>.png. The original GLB is only
read; framing uses the camera, never by moving or scaling mesh data.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ORIGINALS = os.path.join(HERE, 'originals')
REPORTS = os.path.join(HERE, 'reports')
PREVIEW = os.path.join(HERE, 'renders', 'preview')
for d in (REPORTS, PREVIEW):
    os.makedirs(d, exist_ok=True)
SAMPLES = int(os.environ.get('PREVIEW_SAMPLES', 48))


def diagnostics(objects):
    meshes = [o for o in objects if o.type == 'MESH']
    report = {'mesh_objects': len(meshes), 'armatures': sum(o.type == 'ARMATURE' for o in objects),
              'vertices': 0, 'triangles': 0, 'faces': 0, 'material_slots': 0, 'uv_maps': [],
              'non_manifold_edges': 0, 'boundary_edges': 0, 'degenerate_faces': 0, 'zero_length_edges': 0,
              'loose_vertices': 0, 'disconnected_regions': 0, 'largest_region_share': 0,
              'inconsistent_normal_edges': 0, 'vertex_groups': 0, 'shape_keys': 0}
    for obj in meshes:
        me = obj.data
        report['vertices'] += len(me.vertices)
        report['faces'] += len(me.polygons)
        report['triangles'] += sum(len(p.vertices) - 2 for p in me.polygons)
        report['material_slots'] += len(obj.material_slots)
        report['uv_maps'] += [uv.name for uv in me.uv_layers]
        report['vertex_groups'] += len(obj.vertex_groups)
        report['shape_keys'] += len(me.shape_keys.key_blocks) if me.shape_keys else 0
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.edges.ensure_lookup_table()
        for e in bm.edges:
            if e.is_boundary:
                report['boundary_edges'] += 1
            elif not e.is_manifold:
                report['non_manifold_edges'] += 1
            elif not e.is_contiguous:
                report['inconsistent_normal_edges'] += 1
            if e.calc_length() < 1e-7:
                report['zero_length_edges'] += 1
        report['degenerate_faces'] += sum(1 for f in bm.faces if f.calc_area() < 1e-10)
        report['loose_vertices'] += sum(1 for v in bm.verts if not v.link_edges)
        # Connected regions (flood fill over edges).
        seen, sizes = set(), []
        for v in bm.verts:
            if v.index in seen:
                continue
            stack, count = [v], 0
            seen.add(v.index)
            while stack:
                cur = stack.pop()
                count += 1
                for e in cur.link_edges:
                    other = e.other_vert(cur)
                    if other.index not in seen:
                        seen.add(other.index)
                        stack.append(other)
            sizes.append(count)
        report['disconnected_regions'] += len(sizes)
        report['largest_region_share'] = round(max(sizes) / max(1, len(bm.verts)), 4)
        report['regions_over_1000_verts'] = sum(1 for s in sizes if s > 1000)
        bm.free()
    corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(c[i] for c in corners) for i in range(3)])
    hi = Vector([max(c[i] for c in corners) for i in range(3)])
    report['bounds_blender_xyz'] = {'min': list(map(lambda x: round(x, 4), lo)), 'max': list(map(lambda x: round(x, 4), hi))}
    report['size_blender_xyz'] = [round(v, 4) for v in hi - lo]
    report['materials'] = []
    for mat in {s.material for o in meshes for s in o.material_slots if s.material}:
        entry = {'name': mat.name, 'textures': []}
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if mat.use_nodes else None
        if bsdf:
            for socket in ('Base Color', 'Metallic', 'Roughness', 'Normal', 'Emission Color', 'Alpha'):
                inp = bsdf.inputs[socket]
                entry[socket] = 'linked' if inp.is_linked else (list(inp.default_value) if hasattr(inp.default_value, '__len__') else inp.default_value)
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                img = node.image
                links = [l.to_socket.name for l in node.outputs['Color'].links] + [l.to_socket.name for l in node.outputs['Alpha'].links]
                entry['textures'].append({'image': img.name, 'size': list(img.size), 'colorspace': img.colorspace_settings.name,
                                          'feeds': links, 'channels': img.channels})
        report['materials'].append(entry)
    return report, lo, hi


def render_views(key, lo, hi):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.view_settings.view_transform = 'AgX'
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.5, .5, .5, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .8
    scene.world = world
    for name, pos, power in (('key', (-3, -4, 5), 1500), ('fill', (4, -3, 2), 500), ('rim', (1, 5, 4), 900)):
        data = bpy.data.lights.new(name, 'AREA')
        data.size = 3
        data.energy = power
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = pos
    centre = (lo + hi) / 2
    height = hi.z - lo.z
    for obj in scene.objects:
        if obj.type == 'LIGHT':
            obj.location = centre + Vector(obj.location) * height
            obj.rotation_euler = (centre - obj.location).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 85
    distance = height * 3.6
    # glTF -Z forward imports as Blender +Y; render both sides and label by direction.
    views = {'neg_y': (0, -1), 'pos_x': (1, 0), 'pos_y': (0, 1), 'three_quarter_neg_y': (.7, -.7)}
    for name, (dx, dy) in views.items():
        cam.location = centre + Vector((dx, dy, 0)).normalized() * distance
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW, 'source_%s_%s.png' % (key, name))
        bpy.ops.render.render(write_still=True)


def main():
    keys = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['A', 'B', 'C', 'D']
    for key in keys:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        path = os.path.join(ORIGINALS, 'source_%s.glb' % key)
        bpy.ops.import_scene.gltf(filepath=path)
        objects = list(bpy.context.scene.objects)
        report, lo, hi = diagnostics(objects)
        report['source'] = key
        report['object_hierarchy'] = [{'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None,
                                       'location': list(o.location), 'rotation': list(o.rotation_euler), 'scale': list(o.scale)}
                                      for o in objects]
        with open(os.path.join(REPORTS, 'source_%s_diagnostics.json' % key), 'w') as handle:
            json.dump(report, handle, indent=2)
        print('DIAG', key, json.dumps({k: report[k] for k in ('vertices', 'triangles', 'mesh_objects', 'armatures',
              'non_manifold_edges', 'boundary_edges', 'degenerate_faces', 'disconnected_regions', 'size_blender_xyz')}), flush=True)
        # Extract the embedded textures for colour analysis.
        for img in bpy.data.images:
            if img.size[0]:
                img.filepath_raw = os.path.join(REPORTS, 'source_%s_%s.png' % (key, img.name.replace('/', '_')))
                img.file_format = 'PNG'
                img.save()
        if not os.environ.get('NO_RENDER'):
            render_views(key, lo, hi)


main()
