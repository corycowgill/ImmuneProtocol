"""Shared helpers for the TRELLIS character pipeline (run inside Blender)."""
import hashlib
import json
import math
import os

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DIRS = {
    'originals': os.path.join(HERE, 'originals'),
    'masters': os.path.join(HERE, 'masters'),
    'runtime': os.path.join(ROOT, 'dist', 'assets', 'suits'),
    'renders': os.path.join(HERE, 'renders'),
    'reports': os.path.join(HERE, 'reports'),
    'work': os.path.join(HERE, 'work'),
}
for path in DIRS.values():
    os.makedirs(path, exist_ok=True)


def log(stage, character, *args):
    line = '[%s:%s] %s' % (stage, character, ' '.join(str(a) for a in args))
    print(line, flush=True)
    with open(os.path.join(DIRS['reports'], 'pipeline.log'), 'a') as handle:
        handle.write(line + '\n')


def config():
    return json.load(open(os.path.join(HERE, 'characters.json')))


def mapping():
    path = os.path.join(HERE, 'mapping.json')
    if not os.path.exists(path):
        raise SystemExit('mapping.json missing: run download.py, inspect_sources.py and identify.py first')
    return json.load(open(path))


def source_path(character):
    entry = mapping()[character]
    path = os.path.join(HERE, entry['file'])
    digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    if digest != entry['sha256']:
        raise SystemExit('%s does not match the checksum recorded in mapping.json' % path)
    return path, digest


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source(character):
    """Imports the original GLB untouched; returns the mesh object."""
    path, _ = source_path(character)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(meshes) != 1:
        raise RuntimeError('Expected one mesh in %s, found %d' % (path, len(meshes)))
    obj = meshes[0]
    obj.name = character + '_source'
    return obj


def bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector([min(c[i] for c in corners) for i in range(3)])
    hi = Vector([max(c[i] for c in corners) for i in range(3)])
    return lo, hi


def normalise(obj, character):
    """Object-level transform only (mesh data untouched): face game -Z, scale to
    target height, feet on the floor, centred over the origin."""
    cfg = config()[character]
    bpy.context.view_layer.update()
    lo, hi = bounds(obj)
    scale = cfg['target_height'] / (hi.z - lo.z)
    obj.rotation_mode = 'XYZ'  # the glTF importer uses quaternions
    obj.rotation_euler.z += math.radians(cfg['facing_deg'])
    obj.scale = [s * scale for s in obj.scale]
    bpy.context.view_layer.update()
    lo, hi = bounds(obj)
    obj.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.context.view_layer.update()
    return scale


# ---------------------------------------------------------------------------
# Neutral studio (Cycles, AgX, fixed exposure) shared by Set A and Set B.

VIEWS = {
    # name: (direction from target in game axes (x, z) as Blender (x, -y), height, lens, framing height)
    'front': ((0, 1), None, 85),
    'three_quarter': ((.72, .69), None, 85),
    'side': ((1, 0), None, 85),
    'rear': ((0, 1), 'rear', 85),  # subject turned 180 deg (a camera behind would sit in the wall)
    'closeup': ((.42, .91), 'closeup', 85),
}


def studio(samples=128, resolution=1024):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    try:  # GPU where available; this environment is CPU-only.
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.get_devices()
        gpu = next((t for t in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI')
                    if any(d.type == t for d in prefs.devices)), None)
        if gpu:
            prefs.compute_device_type = gpu
            for d in prefs.devices:
                d.use = True
            scene.cycles.device = 'GPU'
    except Exception:
        pass
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = resolution
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Base Contrast'
    scene.view_settings.exposure = 0
    # Neutral studio "HDRI": a procedural soft-box dome (no scenery in reflections).
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'LINEAR'
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Rotation'].default_value = (0, math.radians(-90), 0)  # gradient along Z
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .45
    ramp.color_ramp.elements[0].color = (.06, .06, .065, 1)
    ramp.color_ramp.elements[1].position = .62
    ramp.color_ramp.elements[1].color = (.42, .42, .44, 1)
    nt.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = .6
    scene.world = world
    # 18% grey cyclorama: floor sweeping up into a back wall (behind = Blender -Y).
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=2, y_subdivisions=60, size=1)
    cyc = bpy.context.object
    cyc.name = 'cyclorama'
    for v in cyc.data.vertices:
        x, y = v.co.x * 40, v.co.y * 16 + 2
        z = 0.0
        if y < -1.5:
            t = -1.5 - y
            z = t * t / 2.5
        v.co = (x, y, z)
    mat = bpy.data.materials.new('cyc')
    mat.use_nodes = True
    p = mat.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (.18, .18, .18, 1)
    p.inputs['Roughness'].default_value = .8
    cyc.data.materials.append(mat)
    for poly in cyc.data.polygons:
        poly.use_smooth = True

    def area(name, pos, power, size, size_y, color):
        data = bpy.data.lights.new(name, 'AREA')
        data.shape = 'RECTANGLE'
        data.size, data.size_y = size, size_y
        data.energy = power
        data.color = color
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = pos
        obj.rotation_euler = (Vector((0, 0, 1.1)) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()

    # Blender axes: suit faces +Y. Large soft key, subtle fill, controlled rim.
    area('key', (-2.4, 3.0, 2.9), 1100, 2.0, 2.6, (1, .97, .93))
    area('fill', (2.8, 2.6, 1.6), 260, 2.2, 2.2, (.94, .97, 1))
    area('rim', (1.4, -2.8, 2.7), 750, 1.0, 2.6, (.92, .96, 1))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_views(cam, height, out_prefix, views=None, subjects=()):
    scene = bpy.context.scene
    written = []
    for name in views or VIEWS:
        (dx, dy), mode, lens = VIEWS[name]
        for obj in subjects:
            obj.rotation_mode = 'XYZ'
            if mode == 'rear':
                obj.rotation_euler.z += math.pi
                obj.location.x, obj.location.y = -obj.location.x, -obj.location.y
        cam.data.lens = lens
        if mode == 'closeup':
            target = Vector((0, 0, height * .8))
            distance = height * .78
        else:
            target = Vector((0, 0, height * .5))
            distance = height * 2.75
        direction = Vector((dx, dy, 0)).normalized()
        cam.location = target + direction * distance + Vector((0, 0, height * (.04 if mode == 'closeup' else .02)))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = '%s_%s.png' % (out_prefix, name)
        bpy.ops.render.render(write_still=True)
        written.append(scene.render.filepath)
        for obj in subjects:
            if mode == 'rear':
                obj.rotation_euler.z -= math.pi
                obj.location.x, obj.location.y = -obj.location.x, -obj.location.y
    return written
