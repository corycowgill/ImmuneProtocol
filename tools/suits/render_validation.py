"""Neutral studio validation renders for the co-op suits (separate from the game lobby).

    blender -b -P tools/suits/render_validation.py -- [glb_dir] [out_dir] [suit ...]

Loads <glb_dir>/<suit>_raw.glb (uncompressed export; Blender cannot read
meshopt-compressed files) and writes 1024x1024 front, side, three-quarter and
helmet/torso close-up renders to <out_dir>/<suit>_<view>.png.

Studio: 18% grey cyclorama, three large area lights (key 45 deg, fill, rim)
with fixed wattage, a dim uniform world, AgX view transform at exposure 0 and
a fixed 85 mm lens, so every suit and every iteration is lit identically.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB_DIR = argv[0] if len(argv) > 0 else os.path.join(ROOT, 'tools', 'suits', 'renders', 'bake')
OUT_DIR = argv[1] if len(argv) > 1 else os.path.join(ROOT, 'tools', 'suits', 'renders', 'validation')
SUITS = argv[2:] or ['vanguard', 'wraith', 'lifeline', 'bathysphere']
SAMPLES = int(os.environ.get('VALIDATION_SAMPLES', 128))
os.makedirs(OUT_DIR, exist_ok=True)

PIVOTS = {
    'hips': (0, .918, 0), 'upper': (0, 1.09, 0), 'head': (0, 1.651, -.003),
    'thigh_L': (-.112, .918, 0), 'thigh_R': (.112, .918, 0),
    'shin_L': (-.112, .515, 0), 'shin_R': (.112, .515, 0),
    'boot_L': (-.112, .167, -.03), 'boot_R': (.112, .167, -.03),
}
# Relaxed A-pose for the arms (game frame: shoulder, elbow, wrist).
ARMS = {
    'L': ((-.245, 1.422, .008), (-.34, 1.16, .01), (-.38, .92, -.03)),
    'R': ((.245, 1.422, .008), (.34, 1.16, .01), (.38, .92, -.03)),
}
# Camera views: (name, camera position, look-at target, lens mm). The suit faces -Z (game).
VIEWS = [
    ('front', (0, 1.0, -5.2), (0, .95, 0), 85),
    ('side', (5.2, 1.0, 0), (0, .95, 0), 85),
    ('three_quarter', (3.6, 1.15, -3.8), (0, .95, 0), 85),
    ('closeup', (.75, 1.6, -1.45), (0, 1.48, 0), 85),
]


def bl(p):
    return Vector((p[0], -p[2], p[1]))


def look(obj, target):
    obj.rotation_euler = (bl(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def studio(scene):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Base Contrast' if 'AgX - Base Contrast' in [
        i.identifier for i in scene.view_settings.bl_rna.properties['look'].enum_items_static] else 'None'
    scene.view_settings.exposure = 0
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.18, .18, .18, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .25
    scene.world = world
    # Cyclorama: floor curving up into a back wall, 18% grey.
    bpy.ops.mesh.primitive_plane_add(size=1)
    cyc = bpy.context.object
    cyc.scale = (14, 14, 1)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.subdivide(number_cuts=40)
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in cyc.data.vertices:
        y = v.co.y * 14
        if y < -2.0:  # bend upward behind the suit (it faces Blender +Y, so behind is -Y)
            t = -2.0 - y
            v.co.z = (t * t / 3.0) / 1.0
    cyc.scale = (14, 1, 1)
    for v in cyc.data.vertices:
        v.co.y *= 14
    mat = bpy.data.materials.new('cyc')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (.18, .18, .18, 1)
    bsdf.inputs['Roughness'].default_value = .85
    cyc.data.materials.append(mat)
    for poly in cyc.data.polygons:
        poly.use_smooth = True

    def area(name, pos, power, size, color=(1, 1, 1)):
        data = bpy.data.lights.new(name, 'AREA')
        data.shape = 'RECTANGLE'
        data.size, data.size_y = size
        data.energy = power
        data.color = color
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = bl(pos)
        look(obj, (0, 1.1, 0))

    area('key', (-2.6, 2.8, -2.6), 900, (1.6, 2.2), (1, .97, .93))
    area('fill', (3.0, 1.6, -2.4), 260, (2.0, 2.0), (.95, .97, 1))
    area('rim', (1.2, 2.6, 3.0), 700, (1.0, 2.4), (.92, .96, 1))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def pose(objects):
    by = {o.name: o for o in objects}
    for name, pivot in PIVOTS.items():
        if name in by:
            by[name].location = bl(pivot)
    for sfx, (sh, el, wr) in ARMS.items():
        for name, a, b in (('bicep_' + sfx, sh, el), ('forearm_' + sfx, el, wr)):
            if name not in by:
                continue
            obj = by[name]
            d = bl(b) - bl(a)
            obj.location = bl(a)
            obj.rotation_mode = 'QUATERNION'
            obj.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(d.normalized())
            obj.scale = (1, 1, d.length)
        if 'glove_' + sfx in by:
            g = by['glove_' + sfx]
            g.location = bl(wr)
            g.rotation_euler = (math.radians(-80), 0, 0)


def main():
    for ident in SUITS:
        path = os.path.join(GLB_DIR, ident + '_raw.glb')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        bpy.ops.import_scene.gltf(filepath=path)
        objects = [o for o in scene.objects if o.type == 'MESH']
        for o in objects:
            o.parent = None
            o.location = (0, 0, 0)
            o.rotation_mode = 'XYZ'
            o.rotation_euler = (0, 0, 0)
        pose(objects)
        cam = studio(scene)
        for name, pos, target, lens in VIEWS:
            cam.data.lens = lens
            cam.location = bl(pos)
            look(cam, target)
            scene.render.filepath = os.path.join(OUT_DIR, '%s_%s.png' % (ident, name))
            bpy.ops.render.render(write_still=True)
            print('Rendered', ident, name, flush=True)


main()
