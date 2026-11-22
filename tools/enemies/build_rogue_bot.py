"""Blender-built NMD-07 hacked medical drone, PBR atlas, runtime GLB and Cycles portrait.

blender -b -P tools/enemies/build_rogue_bot.py
The editable studio .blend and a larger render go to tools/enemies/work/rogue-bot,
or to ROGUE_BOT_OUTPUT when that environment variable names a deliverable directory.
No online asset service or extra runtime dependency is used.
"""
import json
import math
import os
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'tools' / 'enemies' / 'work' / 'rogue-bot'
OUT = ROOT / 'dist' / 'assets' / 'enemies'
DELIVER = Path(os.environ.get('ROGUE_BOT_OUTPUT', str(WORK)))
for directory in (WORK, OUT / 'portraits', DELIVER):
    directory.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 8
scene.world.color = (.12, .12, .12)
scene.view_settings.view_transform = 'AgX'
parts = []


def material(name, color, metallic, rough, emission=(0, 0, 0)):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 145
    noise.inputs['Detail'].default_value = 3
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .32
    ramp.color_ramp.elements[0].color = (*[c * .55 for c in color], 1)
    ramp.color_ramp.elements[1].position = .7
    ramp.color_ramp.elements[1].color = (*color, 1)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Color'].default_value = (*emission, 1)
    bsdf.inputs['Emission Strength'].default_value = 2 if any(emission) else 0
    bevel = nodes.new('ShaderNodeBevel'); bevel.inputs['Radius'].default_value = .004; bevel.samples = 2
    links.new(bevel.outputs['Normal'], bsdf.inputs['Normal'])
    mat['metal'] = metallic; mat['emission'] = list(emission)
    return mat


ivory = material('sterile ceramic enamel', (.76, .79, .70), .35, .32)
steel = material('machined titanium', (.28, .33, .32), .9, .28)
dark = material('carbon and recessed seals', (.022, .031, .032), .4, .43)
brass = material('aged medical brass', (.48, .27, .095), .83, .3)
teal = material('medical telemetry', (.03, .3, .24), .55, .22, (.03, .85, .60))
red = material('compromised laser optic', (.28, .018, .009), .4, .19, (1, .025, .008))
mark = material('printed identification', (.045, .07, .065), .05, .7)


def finish(obj, name, mat, recoil=False):
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if recoil:
        group = obj.vertex_groups.new(name='laser_recoil')
        group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    parts.append(obj)
    return obj


def box(name, loc, scale, mat, bevel=.035, recoil=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object; obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('machined edge radii', 'BEVEL'); mod.width = bevel; mod.segments = 3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, mat, recoil)


def cylinder(name, loc, radius, depth, mat, rotation=(0, 0, 0), recoil=False, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    mod = obj.modifiers.new('turned rim', 'BEVEL'); mod.width = .012; mod.segments = 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons: poly.use_smooth = True
    return finish(obj, name, mat, recoil)


def ring(name, loc, major, minor, mat, rotation=(0, 0, 0), recoil=False):
    bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=8, major_radius=major,
                                   minor_radius=minor, location=loc, rotation=rotation)
    for poly in bpy.context.object.data.polygons: poly.use_smooth = True
    return finish(bpy.context.object, name, mat, recoil)


def rod(name, a, b, radius, mat):
    delta = Vector(b) - Vector(a)
    obj = cylinder(name, (Vector(a) + Vector(b)) / 2, radius, delta.length, mat)
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return obj


box('enamel pressure hull', (0, .10, .06), (1.30, 1.04, .57), ivory, .13)
box('lower carbon chassis', (0, .12, -.24), (1.12, .88, .31), dark, .09)
box('top service panel', (0, .13, .365), (.80, .70, .06), steel, .04)
box('top sterile panel', (0, .13, .405), (.73, .62, .035), ivory, .025)
box('medical cross horizontal', (-.15, .16, .432), (.27, .065, .008), teal, .003)
box('medical cross vertical', (-.15, .16, .434), (.065, .27, .008), teal, .003)
for x in (-.49, .49):
    for y in (-.24, .48):
        cylinder('captive hex fastener', (x, y, .365), .038, .022, brass, vertices=6)
        box('fastener slot', (x, y, .379), (.043, .009, .004), dark, .001)
for side in (-1, 1):
    box('armored flank panel', (side * .65, .10, .03), (.10, .72, .30), ivory, .035)
    for i in range(6):
        box('cooling vent', (side * .708, -.13 + i * .085, .04), (.008, .036, .18), dark, .006)
    for along in (-.31, .53):
        x = side * .93
        rod('titanium stabilizer', (side * .45, along, -.12), (x, along, -.12), .065, steel)
        cylinder('ducted magnetic thruster', (x, along, -.10), .245, .19, dark)
        ring('polished duct lip', (x, along, .008), .225, .034, steel)
        ring('navigation ring', (x, along, -.19), .20, .018, teal)
        cylinder('rotor hub', (x, along, .015), .055, .048, brass)
        for blade in range(5):
            a = blade * math.tau / 5
            fan = box('rotor blade', (x + math.cos(a) * .12, along + math.sin(a) * .12, .006), (.18, .045, .014), steel, .006)
            fan.rotation_euler.z = a
    rod('surgical manipulator', (side * .37, .22, -.30), (side * .56, -.12, -.55), .035, brass)
    rod('folded instrument', (side * .56, -.12, -.55), (side * .34, -.38, -.48), .022, steel)
    box('instrument tip', (side * .34, -.40, -.48), (.07, .11, .035), ivory, .012)

front = (math.pi / 2, 0, 0)
cylinder('laser gimbal', (0, -.39, -.02), .26, .25, steel, front)
ring('brass turret collar', (0, -.54, -.02), .19, .038, brass, front)
cylinder('laser heat jacket', (0, -.86, -.02), .142, .66, dark, front, True)
for index in range(6):
    ring('heat dissipation fin', (0, -.66 - index * .085, -.02), .147, .018, steel, front, True)
cylinder('cannon muzzle housing', (0, -1.22, -.02), .17, .15, ivory, front, True)
ring('laser aperture rim', (0, -1.305, -.02), .116, .023, brass, front, True)
cylinder('red optical aperture', (0, -1.319, -.02), .104, .012, red, front, True)
cylinder('black aperture pupil', (0, -1.328, -.02), .049, .008, dark, front, True)
cylinder('laser core', (0, -1.334, -.02), .029, .009, red, front, True)
for side in (-1, 1):
    box('gimbal cheek', (side * .27, -.48, .04), (.16, .33, .33), ivory, .055)
    cylinder('camera eye', (side * .43, -.445, .20), .069, .12, dark, front)
    cylinder('hacked camera lens', (side * .43, -.512, .20), .044, .009, red, front)
    box('triage status light', (side * .49, .63, .13), (.12, .018, .045), teal, .008)
ring('underside induction coil', (0, .17, -.405), .29, .035, brass)
cylinder('diagnostic reactor', (0, .17, -.414), .22, .025, teal)
rod('sensor mast', (.39, .40, .35), (.39, .40, .68), .017, brass)
cylinder('compromised beacon', (.39, .40, .68), .035, .085, red)

bpy.ops.object.text_add(location=(.09, .11, .433))
label = bpy.context.object; label.data.body = 'NMD-07'; label.data.size = .085; label.data.extrude = .001
label.data.materials.append(mark)
bpy.ops.object.convert(target='MESH'); parts.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT')
for part in parts: part.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join(); model = bpy.context.object; model.name = 'attack-membrane'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.015)
bpy.ops.object.mode_set(mode='OBJECT')


def image(name, color=False):
    img = bpy.data.images.new(name, width=1024, height=1024, alpha=True)
    img.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return img


def bake(img, kind):
    for mat in model.data.materials:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
        mat.node_tree.nodes.active = tex
    scene.render.bake.use_pass_direct = scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True; scene.render.bake.margin = 6
    scene.cycles.samples = 8 if kind != 'AO' else 24
    bpy.ops.object.bake(type=kind)
    return np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)


albedo, normal, rough, ao, metal, emission = image('bot_albedo', True), image('bot_normal'), image('bot_rough'), image('bot_ao'), image('bot_metal'), image('bot_emission', True)
color = bake(albedo, 'DIFFUSE'); rough_pixels = bake(rough, 'ROUGHNESS'); ao_pixels = bake(ao, 'AO')
bake(normal, 'NORMAL')
for channel, target in [('metal', metal), ('emission', emission)]:
    saved = []
    for mat in model.data.materials:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        output = nodes.get('Material Output'); old = output.inputs['Surface'].links[0].from_socket
        emit = nodes.new('ShaderNodeEmission')
        value = [mat['metal']] * 3 if channel == 'metal' else list(mat['emission'])
        emit.inputs['Color'].default_value = (*value, 1); links.new(emit.outputs[0], output.inputs['Surface'])
        saved.append((mat, old, emit))
    pixels = bake(target, 'EMIT')
    if channel == 'metal': metal_pixels = pixels
    for mat, old, emit in saved:
        mat.node_tree.links.new(old, mat.node_tree.nodes.get('Material Output').inputs['Surface'])
        mat.node_tree.nodes.remove(emit)
color[:, :3] *= np.sqrt(np.clip(ao_pixels[:, :1], .25, 1))
albedo.pixels.foreach_set(color.ravel())
orm = image('bot_orm'); packed = np.ones_like(color)
packed[:, 0] = ao_pixels[:, 0]; packed[:, 1] = rough_pixels[:, 0]; packed[:, 2] = metal_pixels[:, 0]
orm.pixels.foreach_set(packed.ravel())
runtime = bpy.data.materials.new('NMD-07 baked medical alloy'); runtime.use_nodes = True
nodes, links = runtime.node_tree.nodes, runtime.node_tree.links; bsdf = nodes.get('Principled BSDF')
for name, img in [('albedo', albedo), ('orm', orm), ('normal', normal), ('emission', emission)]:
    tex = nodes.new('ShaderNodeTexImage'); tex.image = img
    if name == 'albedo': links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    elif name == 'orm':
        separate = nodes.new('ShaderNodeSeparateColor'); links.new(tex.outputs['Color'], separate.inputs[0])
        links.new(separate.outputs['Green'], bsdf.inputs['Roughness']); links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
    elif name == 'normal':
        node = nodes.new('ShaderNodeNormalMap'); links.new(tex.outputs['Color'], node.inputs['Color']); links.new(node.outputs['Normal'], bsdf.inputs['Normal'])
    else: links.new(tex.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.4
    img.pack()
model.data.materials.clear(); model.data.materials.append(runtime)
for polygon in model.data.polygons: polygon.material_index = 0
model.shape_key_add(name='Basis')
recoil = model.vertex_groups.get('laser_recoil')
for name in ['Breathe', 'SwayA', 'SwayB', 'SwayC', 'Clench']:
    key = model.shape_key_add(name=name)
    for vertex, point in zip(model.data.vertices, key.data):
        if name == 'Clench' and recoil:
            try: point.co.y += recoil.weight(vertex.index) * .075
            except RuntimeError: pass
        elif name == 'SwayA' and vertex.co.z > .5: point.co.x += .014 * (vertex.co.z - .5)
        elif name == 'SwayB' and abs(vertex.co.x) > .77: point.co.z += .009 * math.sin(vertex.co.x * 9)
        elif name == 'SwayC' and vertex.co.z < -.45: point.co.y += .009
        elif name == 'Breathe' and vertex.co.z < -.4: point.co.z -= .004
    if name != 'Clench':
        for frame, value in [(1, 0), (31, 1), (61, 0), (91, .4), (121, 0)]:
            key.value = value; key.keyframe_insert(data_path='value', frame=frame)
        key.value = 0
model.data.shape_keys.animation_data.action.name = 'Idle'
scene.frame_set(1); scene.frame_start = 1; scene.frame_end = 120
bpy.ops.export_scene.gltf(filepath=str(OUT / 'rogue-bot.glb'), export_format='GLB', use_selection=True,
                         export_image_format='WEBP', export_image_quality=86, export_yup=True,
                         export_animations=True, export_animation_mode='ACTIONS', export_morph=True,
                         export_morph_normal=False, export_cameras=False, export_lights=False)

# Cycles studio: warm clinical enamel, broad soft reflections and a subdued lab floor.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.78))
floor = bpy.context.object; floor.data.materials.append(material('studio floor', (.035, .055, .052), .25, .36))
def area(name, loc, power, color, size):
    data = bpy.data.lights.new(name, 'AREA'); data.energy = power; data.color = color; data.shape = 'DISK'; data.size = size
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = loc
    obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
area('large clinical softbox', (-3, -4, 5), 500, (1, .87, .71), 4)
area('cool lab rim', (3, 1, 3), 650, (.48, .8, 1), 3)
area('front fill', (1, -5, 1), 140, (.8, 1, .94), 2)
bpy.ops.object.camera_add(location=(3, -4.4, 2.15))
camera = bpy.context.object; camera.rotation_euler = (Vector((0, -.18, -.04)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'; camera.data.ortho_scale = 3.65; scene.camera = camera
scene.cycles.samples = 64; scene.render.resolution_x = scene.render.resolution_y = 720; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.quality = 90
scene.render.filepath = str(OUT / 'portraits' / 'rogue-bot.webp'); bpy.ops.render.render(write_still=True)
scene.render.resolution_x, scene.render.resolution_y = 1400, 1050
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(DELIVER / 'rogue-bot-blender.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(DELIVER / 'rogue-bot.blend'))
triangles = sum(len(p.vertices) - 2 for p in model.data.polygons)
(WORK / 'report.json').write_text(json.dumps({'triangles': triangles, 'textureSize': 1024,
    'bytes': (OUT / 'rogue-bot.glb').stat().st_size, 'portrait': 'portraits/rogue-bot.webp'}, indent=2))
print('ROGUE_BOT_READY', triangles, (OUT / 'rogue-bot.glb').stat().st_size, flush=True)
