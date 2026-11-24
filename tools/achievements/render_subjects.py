# Renders the game's weapon models as transparent hero shots for achievement artwork.
#   blender -b -P tools/achievements/render_subjects.py -- <out_dir> <models_dir> [name ...]
# The shipped .glb files are meshopt-compressed, which Blender cannot import; decode them first
# (decode_models.mjs) into <models_dir>, keeping the weapons/ and suits/ folders.
# Each model is framed to fill the shot, lit with a three-point rig, and rendered with Cycles
# (CPU, low samples) to <out_dir>/<name>.png. bake_art.py composes these into the final tiles.
import bpy, sys, os, math
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(ROOT, 'tools', 'achievements', 'subjects')
os.makedirs(out, exist_ok=True)

SUBJECTS = {
    # name: (glb, view yaw in degrees, elevation, resolution)
    'carbine': ('weapons/carbine.glb', 90, 12, 640),
    'sniper': ('weapons/sniper.glb', 90, 12, 640),
    'shotgun': ('weapons/shotgun.glb', 90, 12, 640),
    'launcher': ('weapons/launcher.glb', 90, 12, 640),
    'pistol': ('weapons/pistol.glb', 90, 12, 640),
}
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
models = args[1] if len(args) > 1 else os.path.join(ROOT, 'dist', 'assets')
only = args[2:]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Filmic' if 'Filmic' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
    world = bpy.data.worlds.new('world'); scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.08, 0.1, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    return scene


def light(name, energy, color, loc, size=3):
    data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.color = color; data.size = size
    obj = bpy.data.objects.new(name, data); bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    direction = -Vector(loc); obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


for name, (path, yaw, elevation, size) in SUBJECTS.items():
    if only and name not in only:
        continue
    scene = reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(models, path))
    meshes = [o for o in scene.objects if o.type == 'MESH']
    points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center, radius = (lo + hi) / 2, (hi - lo).length / 2
    cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 85
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
    yaw_r, el_r = math.radians(yaw), math.radians(elevation)
    # glTF imports Y-up as Z-up: orbit around Z.
    offset = Vector((math.sin(yaw_r) * math.cos(el_r), -math.cos(yaw_r) * math.cos(el_r), math.sin(el_r)))
    distance = radius / math.tan(math.atan(18 / 85)) * 1.04
    cam.location = center + offset * distance
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    light('key', 900 * radius ** 2, (1, .95, .88), tuple(center + Vector((radius * 2.5, -radius * 3, radius * 3))), radius * 2)
    light('rim', 1400 * radius ** 2, (.55, .95, 1), tuple(center + Vector((-radius * 3, radius * 3, radius * 2))), radius * 2)
    light('fill', 260 * radius ** 2, (.8, 1, .75), tuple(center + Vector((-radius * 3, -radius * 3, -radius))), radius * 3)
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.filepath = os.path.join(out, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)
