"""Blender-built NMD-11 "Crawler": a hijacked eight-legged surgical drone that shares the Rogue
Bot's sterile enamel, titanium, brass and red-optic look, rebuilt to run along the floor.

blender -b -P tools/enemies/build_crawler.py
The body is one baked mesh (attack-membrane, with the same morph targets as every pathogen). The
eight legs stay separate nodes named crawler-leg-<side>-<index>, pivoted at the hip, so the game
can run them procedurally. The editable .blend and a larger render go to tools/enemies/work/crawler,
or to CRAWLER_OUTPUT when that environment variable names a deliverable directory.
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
WORK = ROOT / 'tools' / 'enemies' / 'work' / 'crawler'
OUT = ROOT / 'dist' / 'assets' / 'enemies'
DELIVER = Path(os.environ.get('CRAWLER_OUTPUT', str(WORK)))
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



def sphere(name, loc, scale, mat, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, location=loc)
    obj = bpy.context.object; obj.scale = scale
    for poly in obj.data.polygons: poly.use_smooth = True
    return finish(obj, name, mat)


# Body, front (-Y) to back: laser head, thorax, waist, armoured abdomen. Feet rest at z = -.62.
box('enamel thorax shell', (0, -.2, .02), (.66, .6, .3), ivory, .12)
box('thorax carbon belly', (0, -.2, -.14), (.56, .52, .14), dark, .05)
box('thorax service plate', (0, -.2, .18), (.42, .4, .04), steel, .03)
sphere('enamel abdomen', (0, .42, .1), (.46, .5, .3), ivory)
sphere('abdomen carbon underside', (0, .44, .0), (.4, .44, .2), dark)
box('abdomen medical stripe', (0, .42, .395), (.07, .62, .02), teal, .006)
box('medical cross horizontal', (0, .58, .405), (.19, .05, .01), teal, .003)
box('medical cross vertical', (0, .58, .407), (.05, .19, .01), teal, .003)
for side in (-1, 1):
    for i in range(4):
        box('abdomen cooling vent', (side * .3, .26 + i * .1, .25), (.13, .025, .02), dark, .006)
    cylinder('captive hex fastener', (side * .24, -.36, .2), .03, .02, brass, vertices=6)
    cylinder('captive hex fastener', (side * .24, -.04, .2), .03, .02, brass, vertices=6)
    box('thorax flank armour', (side * .35, -.2, .04), (.06, .5, .2), ivory, .03)
    ring('hip bearing collar', (side * .34, -.2, -.02), .09, .02, brass, (0, math.pi / 2, 0))
cylinder('waist actuator', (0, .14, .04), .16, .16, steel, (math.pi / 2, 0, 0))
ring('waist seal', (0, .14, .04), .17, .022, brass, (math.pi / 2, 0, 0))
cylinder('compromised beacon', (0, .7, .32), .03, .08, red)
rod('sensor whip', (.12, .62, .3), (.2, .86, .52), .012, brass)

front = (math.pi / 2, 0, 0)
cylinder('turret gimbal', (0, -.52, .04), .2, .16, steel, front)
ring('brass turret collar', (0, -.6, .04), .16, .03, brass, front)
cylinder('short laser jacket', (0, -.74, .04), .1, .3, dark, front, True)
for index in range(3):
    ring('heat dissipation fin', (0, -.66 - index * .07, .04), .108, .014, steel, front, True)
cylinder('emitter housing', (0, -.92, .04), .12, .1, ivory, front, True)
ring('laser aperture rim', (0, -.975, .04), .08, .018, brass, front, True)
cylinder('red optical aperture', (0, -.985, .04), .07, .01, red, front, True)
cylinder('laser core', (0, -.993, .04), .022, .008, red, front, True)
# A spider's eye cluster: two large hacked lenses and four small ones above the emitter.
for side in (-1, 1):
    cylinder('camera eye', (side * .13, -.54, .2), .055, .08, dark, front)
    cylinder('hacked camera lens', (side * .13, -.585, .2), .038, .008, red, front)
    for row, (x, z) in enumerate([(.06, .27), (.2, .26)]):
        cylinder('auxiliary eye', (side * x, -.52, z), .026, .05, dark, front)
        cylinder('auxiliary lens', (side * x, -.547, z), .018, .006, red, front)
    # Surgical pincers folded under the emitter like chelicerae.
    rod('surgical pincer', (side * .1, -.58, -.08), (side * .07, -.86, -.2), .022, brass)
    box('pincer tip', (side * .065, -.88, -.21), (.04, .08, .03), ivory, .01)
    box('triage status light', (side * .2, .2, .16), (.08, .016, .03), teal, .006)

bpy.ops.object.text_add(location=(-.17, -.32, .205))
label = bpy.context.object; label.data.body = 'NMD-11'; label.data.size = .06; label.data.extrude = .001
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


albedo, normal, rough, ao, metal, emission = image('crawler_albedo', True), image('crawler_normal'), image('crawler_rough'), image('crawler_ao'), image('crawler_metal'), image('crawler_emission', True)
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
orm = image('crawler_orm'); packed = np.ones_like(color)
packed[:, 0] = ao_pixels[:, 0]; packed[:, 1] = rough_pixels[:, 0]; packed[:, 2] = metal_pixels[:, 0]
orm.pixels.foreach_set(packed.ravel())
runtime = bpy.data.materials.new('NMD-11 baked medical alloy'); runtime.use_nodes = True
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
        elif name == 'SwayA' and vertex.co.y > .2: point.co.x += .02 * (vertex.co.y - .2)
        elif name == 'SwayB' and vertex.co.y > .2: point.co.z += .012 * math.sin(vertex.co.y * 9)
        elif name == 'SwayC' and vertex.co.y < -.5: point.co.z += .01
        elif name == 'Breathe' and vertex.co.y > .1: point.co.z += .012 * (vertex.co.z + .2)
    if name != 'Clench':
        for frame, value in [(1, 0), (31, 1), (61, 0), (91, .4), (121, 0)]:
            key.value = value; key.keyframe_insert(data_path='value', frame=frame)
        key.value = 0
model.data.shape_keys.animation_data.action.name = 'Idle'
scene.frame_set(1); scene.frame_start = 1; scene.frame_end = 120

def flat(name, color, metallic, rough, emission=(0, 0, 0)):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic; bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Color'].default_value = (*emission, 1)
    bsdf.inputs['Emission Strength'].default_value = 2 if any(emission) else 0
    return mat


leg_steel = flat('leg titanium', (.3, .35, .34), .9, .3)
leg_ivory = flat('leg enamel plate', (.74, .77, .69), .3, .34)
leg_brass = flat('leg brass joint', (.5, .29, .1), .85, .3)
leg_dark = flat('leg carbon foot', (.025, .03, .032), .4, .45)
leg_teal = flat('leg telemetry', (.03, .3, .24), .5, .25, (.03, .85, .6))


def leg_part(kind, a, b, radius, mat):
    delta = Vector(b) - Vector(a)
    if kind == 'rod':
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=delta.length, location=(Vector(a) + Vector(b)) / 2)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(Vector(a) + Vector(b)) / 2)
        bpy.context.object.scale = (radius * 2.6, radius * 1.6, delta.length * .8)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = kind == 'rod'
    return obj


def joint(loc, radius, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radius, location=loc)
    obj = bpy.context.object; obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = True
    return obj


leg_nodes = []
for side in (-1, 1):
    for index, (along, splay) in enumerate([(-.38, -.55), (-.24, -.18), (-.1, .2), (.04, .55)]):
        hip = Vector((side * .36, along, -.02))
        out = Vector((side * math.cos(splay), math.sin(splay), 0))
        knee = hip + out * .42 + Vector((0, 0, .36))
        ankle = hip + out * .86 + Vector((0, 0, .02))
        foot = hip + out * 1.0 + Vector((0, 0, -.6))
        pieces = [
            joint(hip, .07, leg_brass),
            leg_part('rod', hip, knee, .042, leg_steel),
            leg_part('plate', hip + (knee - hip) * .15, hip + (knee - hip) * .85, .045, leg_ivory),
            joint(knee, .058, leg_brass),
            leg_part('rod', knee, ankle, .032, leg_steel),
            leg_part('plate', knee + (ankle - knee) * .2, knee + (ankle - knee) * .7, .03, leg_teal),
            joint(ankle, .045, leg_brass),
            leg_part('rod', ankle, foot, .026, leg_steel),
            leg_part('rod', foot + (ankle - foot) * .22, foot, .034, leg_dark),
        ]
        bpy.ops.object.select_all(action='DESELECT')
        for piece in pieces: piece.select_set(True)
        bpy.context.view_layer.objects.active = pieces[0]
        bpy.ops.object.join()
        leg = bpy.context.object
        leg.name = f'crawler-leg-{"L" if side < 0 else "R"}-{index}'
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        scene.cursor.location = hip
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        leg_nodes.append(leg)

bpy.ops.object.select_all(action='DESELECT')
model.select_set(True)
for leg in leg_nodes: leg.select_set(True)
bpy.context.view_layer.objects.active = model
bpy.ops.export_scene.gltf(filepath=str(OUT / 'crawler.glb'), export_format='GLB', use_selection=True,
                         export_image_format='WEBP', export_image_quality=86, export_yup=True,
                         export_animations=True, export_animation_mode='ACTIONS', export_morph=True,
                         export_morph_normal=False, export_cameras=False, export_lights=False)

# Cycles studio, as for the Rogue Bot: warm clinical enamel, broad soft reflections and a subdued lab floor.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.62))
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
camera.data.type = 'ORTHO'; camera.data.ortho_scale = 3.3; scene.camera = camera
scene.cycles.samples = 64; scene.render.resolution_x = scene.render.resolution_y = 720; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.quality = 90
scene.render.filepath = str(OUT / 'portraits' / 'crawler.webp'); bpy.ops.render.render(write_still=True)
scene.render.resolution_x, scene.render.resolution_y = 1400, 1050
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(DELIVER / 'crawler-blender.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(DELIVER / 'crawler.blend'))
triangles = sum(len(p.vertices) - 2 for p in model.data.polygons)
(WORK / 'report.json').write_text(json.dumps({'triangles': triangles, 'textureSize': 1024,
    'bytes': (OUT / 'crawler.glb').stat().st_size, 'portrait': 'portraits/crawler.webp'}, indent=2))
print('CRAWLER_READY', triangles, (OUT / 'crawler.glb').stat().st_size, flush=True)
