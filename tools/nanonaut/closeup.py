"""Close-up review renders of the built Nanonaut (Eevee, 900 px), for checking the mesh by eye.

    blender -b tools/nanonaut/work/nanonaut.blend -P tools/nanonaut/closeup.py -- Clip:frame [...]
writes tools/nanonaut/work/closeup/<clip>_<frame>_<view>.png"""
import bpy, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'work', 'closeup')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['Aim:10']
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = scene.render.resolution_y = 900
scene.view_settings.view_transform = 'AgX'
world = bpy.data.worlds.get('closeup') or bpy.data.worlds.new('closeup')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.35, .37, .4, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .8
for o in list(scene.objects):
    if o.type in ('LIGHT', 'CAMERA'):
        bpy.data.objects.remove(o)
for name, loc, power in (('key', (2.5, -3, 3.5), 4.0), ('rim', (-2.5, 2.5, 3), 2.5)):
    light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
    light.data.energy = power
    light.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(light)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.lens = 55
scene.collection.objects.link(cam)
scene.camera = cam
rig = bpy.data.objects['nanonaut_rig']
rig.animation_data_create()
# A carbine-sized stand-in on the weapon bone (the game draws its own model there).
gunmetal = bpy.data.materials.new('gunmetal')
gunmetal.use_nodes = True
gunmetal.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.03, .033, .036, 1)
for size, loc in (((.05, .36, .085), (0, .1, 0)), ((.024, .26, .024), (0, .4, .015)), ((.035, .06, .15), (0, .1, -.1)),
                  ((.03, .045, .11), (0, -.04, -.08)), ((.04, .22, .09), (0, -.2, -.01))):
    bpy.ops.mesh.primitive_cube_add(size=1)
    part = bpy.context.active_object
    part.scale = size
    bpy.ops.object.transform_apply(scale=True)
    part.data.materials.append(gunmetal)
    part.parent, part.parent_type, part.parent_bone = rig, 'BONE', 'weapon'
    part.matrix_parent_inverse = __import__('mathutils').Matrix.Translation((0, -rig.data.bones['weapon'].length, 0))
    part.location = loc
os.makedirs(OUT, exist_ok=True)
views = {'front': (.9, -2.6, 1.25), 'back': (-.9, 2.6, 1.3), 'left': (2.7, -.3, 1.2), 'right': (-2.7, -.3, 1.2)}
for spec in args:
    clip, _, f = spec.partition(':')
    rig.animation_data.action = bpy.data.actions[clip] if clip != 'rest' else None
    if clip == 'rest':
        for pb in rig.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
    scene.frame_set(int(f or 0))
    target = Vector((0, -.05, .95))
    for v, loc in views.items():
        cam.location = loc
        cam.rotation_euler = (target - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(OUT, f'{clip}_{f}_{v}.png')
        bpy.ops.render.render(write_still=True)
print('closeups in', OUT)
