"""The disease guide's Cycles portrait of the built Nanonaut, aiming, three-quarter and rim-lit.
Run after build_nanonaut.py: blender -b tools/nanonaut/work/nanonaut.blend -P tools/nanonaut/portrait.py"""
import bpy, os
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
PORTRAIT = os.path.join(HERE, '..', '..', 'dist', 'assets', 'enemies', 'portraits', 'nanonaut.webp')
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'
scene.cycles.samples = int(os.environ.get('PORTRAIT_SAMPLES', 160))
scene.render.resolution_x = scene.render.resolution_y = 768
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'
world = bpy.data.worlds.new('portrait')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.04, .05, .06, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .6
rig = bpy.data.objects['nanonaut_rig']
rig.animation_data.action = bpy.data.actions['Aim']
scene.frame_set(20)
# A stand-in carbine on the weapon bone (barrel +Y, up +Z); the game hangs its own carbine there.
gunmetal = bpy.data.materials.new('gunmetal')
gunmetal.use_nodes = True
bsdf = gunmetal.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (.03, .033, .036, 1)
bsdf.inputs['Metallic'].default_value = .6
bsdf.inputs['Roughness'].default_value = .4
for size, loc in (((.05, .36, .085), (0, .1, 0)), ((.024, .26, .024), (0, .4, .015)), ((.035, .06, .15), (0, .1, -.1)),
                  ((.03, .045, .11), (0, -.04, -.08)), ((.04, .22, .09), (0, -.2, -.01)), ((.03, .1, .045), (0, .08, .07))):
    bpy.ops.mesh.primitive_cube_add(size=1)
    part = bpy.context.active_object
    part.scale = size
    bpy.ops.object.transform_apply(scale=True)
    part.data.materials.append(gunmetal)
    part.parent, part.parent_type, part.parent_bone = rig, 'BONE', 'weapon'
    part.matrix_parent_inverse = Matrix.Translation((0, -rig.data.bones['weapon'].length, 0))
    part.location = loc
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.lens = 70
cam.location = (-2.6, -3.6, 1.45)
cam.rotation_euler = (Vector((0, -.05, 1.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.collection.objects.link(cam)
scene.camera = cam
for name, loc, power, color in (('key', (-3, -3, 3.4), 900, (1, .93, .86)), ('rim', (2.8, 2.6, 2.4), 1400, (.55, .75, 1)),
                                ('fill', (2.5, -3, 1.2), 220, (1, .8, .7))):
    light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
    light.data.energy, light.data.color, light.data.size = power, color, 1.6
    light.location = loc
    light.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(light)
png = os.path.join(HERE, 'work', 'portrait.png')
scene.render.filepath = png
bpy.ops.render.render(write_still=True)
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.quality = 90
bpy.data.images.load(png).save_render(os.path.abspath(PORTRAIT))
print('[portrait]', os.path.abspath(PORTRAIT))
