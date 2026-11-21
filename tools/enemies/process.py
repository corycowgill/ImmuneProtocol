"""Builds a runtime pathogen GLB and a studio portrait from one source scan.

blender -b -P tools/enemies/process.py -- <enemy> [<enemy> ...]

Per enemy (see enemies.json):
  1. Import the source scan and refine it: weld seam splits, drop degenerate
     faces and reconstruction floaters, fix winding. Centre it and scale it to a
     unit radius (the game sizes each species itself).
  2. Master shading: the scan's own albedo and roughness, plus a fine
     object-space pore bump so the baked normal map carries micro detail.
  3. Decimate a copy to the runtime budget, re-unwrap it, and bake albedo,
     roughness, ambient occlusion and a tangent normal map from the master.
  4. Grade the albedo (AO-darkened crevices, a touch of saturation), and build a
     wet organic material: clearcoat, sheen, ORM and an albedo-driven emissive
     map that the game uses for its attack glow.
  5. Animation as morph targets: Breathe, SwayA-C and Clench. A looping
     Idle clip drives Breathe and the three sway keys; the game drives Clench from
     the attack windup. Sway follows a smooth vector-noise field, weighted by how
     far each vertex sits from the body core, so spikes, tendrils, legs and
     flagella writhe while the body only breathes.
  6. Export to dist/assets/enemies/<enemy>.glb (meshopt-compressed with gltfpack
     when available) and render dist/assets/enemies/portraits/<enemy>.webp.
"""
import json
import math
import os
import shutil
import subprocess
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ORIGINALS = os.path.join(HERE, 'originals')
WORK = os.path.join(HERE, 'work')
RUNTIME = os.path.join(ROOT, 'dist', 'assets', 'enemies')
PORTRAITS = os.path.join(RUNTIME, 'portraits')
for path in (WORK, RUNTIME, PORTRAITS):
    os.makedirs(path, exist_ok=True)

CONFIG = json.load(open(os.path.join(HERE, 'enemies.json')))
TEXTURE = int(os.environ.get('ENEMY_TEXTURE', 1024))
SAMPLES = int(os.environ.get('SAMPLES', 96))
IDLE_SECONDS = 2.0


def log(enemy, *args):
    print('[enemies:%s] %s' % (enemy, ' '.join(str(a) for a in args)), flush=True)


def use_gpu():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for device in prefs.devices:
                device.use = device.type == kind
            scene.cycles.device = 'GPU'
            return kind
    scene.cycles.device = 'CPU'
    return 'CPU'


def refine(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_edges], context='VERTS')
    seen, floaters = set(), []
    for v in bm.verts:
        if v in seen:
            continue
        island, stack = [], [v]
        seen.add(v)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o not in seen:
                    seen.add(o)
                    stack.append(o)
        if len(island) < 12:
            floaters.extend(island)
    bmesh.ops.delete(bm, geom=floaters, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    after = len(bm.verts)
    bm.to_mesh(obj.data)
    bm.free()
    return {'vertices_before': before, 'vertices_after': after, 'floater_vertices': len(floaters)}


def normalise(obj):
    """Centre on the bounding box and scale to a unit bounding radius."""
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector([min(c[i] for c in corners) for i in range(3)])
    hi = Vector([max(c[i] for c in corners) for i in range(3)])
    scale = 2 / max(hi - lo)
    obj.location = -(lo + hi) / 2 * scale
    obj.scale = [s * scale for s in obj.scale]
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def image(name, colorspace='Non-Color'):
    img = bpy.data.images.new(name, TEXTURE, TEXTURE, alpha=False)
    img.colorspace_settings.name = colorspace
    return img


def pixels(img):
    array = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(array)
    return array.reshape(img.size[1], img.size[0], 4)


def set_pixels(img, array):
    img.pixels.foreach_set(np.ascontiguousarray(array, np.float32).ravel())
    img.update()


def master_shading(master):
    """Re-wires the scan's material for baking: albedo, roughness from the
    metal/rough map, and a fine pore bump for the normal bake."""
    mat = master.material_slots[0].material
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    pores = nt.nodes.new('ShaderNodeTexNoise')
    pores.inputs['Scale'].default_value = 42.0
    pores.inputs['Detail'].default_value = 6.0
    pores.inputs['Roughness'].default_value = .62
    cells = nt.nodes.new('ShaderNodeTexVoronoi')
    cells.feature = 'DISTANCE_TO_EDGE'
    cells.inputs['Scale'].default_value = 18.0
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = .55
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .32
    bump.inputs['Distance'].default_value = .006
    nt.links.new(coord.outputs['Object'], pores.inputs['Vector'])
    nt.links.new(coord.outputs['Object'], cells.inputs['Vector'])
    nt.links.new(pores.outputs['Fac'], mix.inputs[0])
    nt.links.new(cells.outputs['Distance'], mix.inputs[2])
    nt.links.new(mix.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def bake_from_master(master, low, img, kind, samples=1):
    """Selected-to-active bake from the master onto the runtime mesh, or a bake
    of the runtime mesh onto itself when both are the same object."""
    nt = master.material_slots[0].material.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    emission = None
    if kind in ('albedo', 'roughness'):
        emission = nt.nodes.new('ShaderNodeEmission')
        source = bsdf.inputs['Base Color' if kind == 'albedo' else 'Roughness']
        if source.links:
            nt.links.new(source.links[0].from_socket, emission.inputs['Color'])
        else:
            value = source.default_value
            emission.inputs['Color'].default_value = tuple(value) if kind == 'albedo' else (value, value, value, 1)
        nt.links.new(emission.outputs[0], out.inputs['Surface'])
    lmat = low.material_slots[0].material
    target = lmat.node_tree.nodes.new('ShaderNodeTexImage')
    target.image = img
    lmat.node_tree.nodes.active = target
    scene = bpy.context.scene
    scene.cycles.samples = samples
    bake = scene.render.bake
    bake.use_selected_to_active = master is not low
    bake.cage_extrusion = .02
    bake.max_ray_distance = .06
    bake.margin = 8
    bake.use_clear = True
    bpy.ops.object.select_all(action='DESELECT')
    master.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bake_type = {'normal': 'NORMAL', 'ao': 'AO'}.get(kind, 'EMIT')
    bpy.ops.object.bake(type=bake_type, normal_space='TANGENT')
    if emission:
        nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
        nt.nodes.remove(emission)
    lmat.node_tree.nodes.remove(target)
    return pixels(img)


def save(img, path, fmt='PNG'):
    img.filepath_raw = path
    img.file_format = fmt
    img.save()


def gltf_output_group():
    """The node group Blender's glTF exporter reads the occlusion map from."""
    group = bpy.data.node_groups.get('glTF Material Output')
    if group:
        return group
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    group.nodes.new('NodeGroupInput')
    return group


def runtime_material(enemy, imgs, settings):
    mat = bpy.data.materials.new(enemy + '_pathogen')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    albedo = nt.nodes.new('ShaderNodeTexImage')
    albedo.image = imgs['albedo']
    nt.links.new(albedo.outputs['Color'], bsdf.inputs['Base Color'])
    # The game tints and scales this per species and flares it during attacks.
    nt.links.new(albedo.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0
    orm = nt.nodes.new('ShaderNodeTexImage')
    orm.image = imgs['orm']
    split = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(orm.outputs['Color'], split.inputs[0])
    nt.links.new(split.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(split.outputs['Blue'], bsdf.inputs['Metallic'])
    occlusion = nt.nodes.new('ShaderNodeGroup')
    occlusion.node_tree = gltf_output_group()
    nt.links.new(split.outputs['Red'], occlusion.inputs['Occlusion'])
    normal_tex = nt.nodes.new('ShaderNodeTexImage')
    normal_tex.image = imgs['normal']
    normal_map = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    nt.links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Coat Weight'].default_value = settings['clearcoat']
    bsdf.inputs['Coat Roughness'].default_value = settings['coat_roughness']
    bsdf.inputs['Sheen Weight'].default_value = settings['sheen']
    bsdf.inputs['Sheen Tint'].default_value = (*settings['sheen_tint'], 1)
    bsdf.inputs['Sheen Roughness'].default_value = .45
    return mat


def grade(albedo, ao, saturation):
    """AO-darkened crevices and a little extra saturation on the baked albedo."""
    rgb = albedo[..., :3]
    occlusion = ao[..., :1]
    rgb = rgb * (.62 + .38 * occlusion)
    luma = (rgb * np.array([.2126, .7152, .0722], np.float32)).sum(-1, keepdims=True)
    rgb = np.clip(luma + (rgb - luma) * saturation, 0, 1)
    out = albedo.copy()
    out[..., :3] = rgb
    return out


def core_distance(low, iterations=110):
    """How far each vertex stands out from the body: the distance a vertex
    retracts under heavy Laplacian smoothing. Thin protrusions (spikes,
    tendrils, legs, flagella) collapse a long way, the body hardly moves."""
    me = low.data
    count = len(me.vertices)
    co = np.empty(count * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    edges = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', edges)
    edges = edges.reshape(-1, 2)
    degree = np.bincount(edges.ravel(), minlength=count).astype(np.float32)[:, None]
    degree[degree == 0] = 1
    smooth = co.copy()
    for _ in range(iterations):
        total = np.zeros_like(smooth)
        np.add.at(total, edges[:, 0], smooth[edges[:, 1]])
        np.add.at(total, edges[:, 1], smooth[edges[:, 0]])
        smooth += .5 * (total / degree - smooth)
    distance = np.linalg.norm(co - smooth, axis=1)
    lo, hi = np.percentile(distance, 35), np.percentile(distance, 98)
    t = np.clip((distance - lo) / max(hi - lo, 1e-6), 0, 1)
    weight = t * t * (3 - 2 * t)
    return co, smooth, weight


def add_motion(enemy, low, motion):
    co, smooth, weight = core_distance(low)
    me = low.data
    normals = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('normal', normals)
    normals = normals.reshape(-1, 3)
    frequency = motion['frequency']
    field = [np.array([noise.noise_vector(Vector(p) * frequency + Vector(seed)) for p in co], np.float32)
             for seed in ((13.1, 4.7, 9.2), (-6.3, 21.5, 2.8))]
    reach = (weight ** 1.3)[:, None]
    body = (1 - .6 * weight)[:, None]
    sway = [f * motion['sway'] * reach * 2.1 for f in field]
    # Exported clip weights are clamped to [0, 1], so the sway uses three targets
    # driven 120 degrees apart. With the third the negative sum of the other two
    # their constant parts cancel and each vertex circles its rest position.
    shapes = {
        'Breathe': normals * motion['breathe'] * body,
        'SwayA': sway[0],
        'SwayB': sway[1],
        'SwayC': -(sway[0] + sway[1]),
        'Clench': normals * motion['clench'] * (1 - weight)[:, None] + (smooth - co) * .4 * weight[:, None],
    }
    low.shape_key_add(name='Basis', from_mix=False)
    keys = {}
    for name, offset in shapes.items():
        key = low.shape_key_add(name=name, from_mix=False)
        key.slider_min = -1
        key.data.foreach_set('co', (co + offset).ravel())
        keys[name] = key
    scene = bpy.context.scene
    scene.render.fps = 24
    frames = int(IDLE_SECONDS * scene.render.fps)
    scene.frame_start, scene.frame_end = 0, frames
    for frame in range(0, frames + 1, 2):
        phase = frame / frames * math.tau
        values = {'Breathe': .5 - .5 * math.cos(phase), 'Clench': 0}
        for index, name in enumerate(('SwayA', 'SwayB', 'SwayC')):
            values[name] = .5 + .5 * math.cos(phase - index * math.tau / 3)
        for name, value in values.items():
            keys[name].value = value
            keys[name].keyframe_insert('value', frame=frame)
    action = me.shape_keys.animation_data.action
    action.name = 'Idle'
    return {'sway_vertices': int((weight > .5).sum()), 'vertices': len(me.vertices)}


def portrait(enemy, low):
    scene = bpy.context.scene
    use_gpu()
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 88
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    for key in low.data.shape_keys.key_blocks[1:]:
        key.value = 0
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    background = world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (.035, .02, .025, 1)
    background.inputs['Strength'].default_value = .6
    scene.world = world
    camera = bpy.data.objects.new('portrait_camera', bpy.data.cameras.new('portrait_camera'))
    camera.data.lens = 70
    scene.collection.objects.link(camera)
    scene.camera = camera
    direction = Vector((.75, -1.5, .5)).normalized()
    camera.location = direction * 5.5
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    lights = (
        ((3.5, -3, 4), 900, (1, .9, .82), 2.5),   # warm key
        ((-4, -1, 1.5), 260, (.55, .75, 1), 3),   # cool fill
        ((0, 4, 2.5), 1100, (1, .45, .4), 1.6),   # blood-red rim
        ((.5, -1, -4), 120, (.9, .6, .6), 3),     # bounce from below
    )
    for index, (offset, energy, colour, size) in enumerate(lights):
        light = bpy.data.objects.new('light%d' % index, bpy.data.lights.new('light%d' % index, 'AREA'))
        light.data.energy = energy
        light.data.color = colour
        light.data.size = size
        light.location = offset
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    scene.render.filepath = os.path.join(PORTRAITS, enemy + '.webp')
    bpy.ops.render.render(write_still=True)


def build(enemy):
    cfg = CONFIG[enemy]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    device = use_gpu()
    if cfg.get('builder'):
        # Modelled rather than scanned: a sibling script sculpts the master in this scene.
        sys.path.insert(0, HERE)
        master = __import__(cfg['builder']).build_master()
        source = cfg['builder'] + '.py'
    else:
        source = cfg['source']
        bpy.ops.import_scene.gltf(filepath=os.path.join(ORIGINALS, source))
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        if len(meshes) != 1:
            raise RuntimeError('%s: expected one mesh, found %d' % (source, len(meshes)))
        master = meshes[0]
    master.name = enemy + '_master'
    for other in [o for o in bpy.context.scene.objects if o != master]:
        bpy.data.objects.remove(other)
    report = {'source': source, 'device': device, 'refine': refine(master)}
    normalise(master)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40), keep_sharp_edges=True)
    master_shading(master)
    source_tris = triangles(master)

    low = master.copy()
    low.data = master.data.copy()
    low.name = 'attack-membrane'
    bpy.context.scene.collection.objects.link(low)
    bpy.context.view_layer.objects.active = low
    keep_uv = cfg.get('keep_uv', False)
    if keep_uv:
        # A lattice of fine strands (the colony's root mat) remeshes into millions
        # of faces and shreds when decimated that far. Such a model is placed
        # once, so it keeps a lighter decimation of the scan, its UVs, and bakes
        # onto itself.
        bpy.data.objects.remove(master)
        master = low
    elif cfg.get('remesh', True):
        # The scans are layered, non-manifold triangle soup that collapse
        # decimation shreds into slivers. A voxel remesh rebuilds one clean
        # watertight surface (fine enough to keep spikes, legs and flagella) that
        # decimates cleanly; the scan's own detail comes back in the bake. Open
        # shells (remesh: false) voxelise into crinkled double sheets, so those
        # decimate the scan directly.
        remesh = low.modifiers.new('remesh', 'REMESH')
        remesh.mode = 'VOXEL'
        remesh.voxel_size = cfg.get('voxel', .008)
        remesh.adaptivity = 0
        bpy.ops.object.modifier_apply(modifier='remesh')
    for _ in range(4):
        if triangles(low) <= cfg['tris'] * 1.05:
            break
        decimate = low.modifiers.new('decimate', 'DECIMATE')
        decimate.decimate_type = 'COLLAPSE'
        decimate.ratio = cfg['tris'] / triangles(low)
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='decimate')
    bpy.ops.object.shade_smooth()
    if not keep_uv:
        while low.data.uv_layers:
            low.data.uv_layers.remove(low.data.uv_layers[0])
        low.data.uv_layers.new(name='UVMap')
        low.data.materials.clear()
        bake_mat = bpy.data.materials.new('bake_target')
        bake_mat.use_nodes = True
        low.data.materials.append(bake_mat)
        bpy.ops.object.select_all(action='DESELECT')
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.003, scale_to_bounds=False)
        bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=.003, shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')
    report['triangles'] = {'source': source_tris, 'runtime': triangles(low)}
    log(enemy, 'baking %dpx maps from %d onto %d triangles on %s' % (TEXTURE, source_tris, triangles(low), device))

    imgs = {'albedo': image(enemy + '_albedo', 'sRGB'), 'orm': image(enemy + '_orm'),
            'normal': image(enemy + '_normal')}
    albedo = bake_from_master(master, low, imgs['albedo'], 'albedo')
    roughness = bake_from_master(master, low, image(enemy + '_rough'), 'roughness')
    ao = bake_from_master(master, low, image(enemy + '_ao'), 'ao', samples=64)
    bake_from_master(master, low, imgs['normal'], 'normal', samples=4)
    settings = cfg['material']
    set_pixels(imgs['albedo'], grade(albedo, ao, settings['saturation']))
    orm = np.ones_like(albedo)
    orm[..., 0] = ao[..., 0]
    orm[..., 1] = np.clip(roughness[..., 0] * settings['roughness_scale'], .08, 1)
    orm[..., 2] = 0  # Organisms are not metallic; the scans' metal channel is noise.
    set_pixels(imgs['orm'], orm)
    work = os.path.join(WORK, enemy)
    os.makedirs(work, exist_ok=True)
    for key, img in imgs.items():
        save(img, os.path.join(work, key + '.png'))

    low.data.materials.clear()
    low.data.materials.append(runtime_material(enemy, imgs, settings))
    if master is not low:
        bpy.data.objects.remove(master)
    report['motion'] = add_motion(enemy, low, cfg['motion'])

    raw = os.path.join(work, enemy + '_raw.glb')
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=raw, export_format='GLB', use_selection=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_image_format='WEBP', export_image_quality=82,
        export_animations=True, export_animation_mode='ACTIONS', export_morph=True,
        export_morph_normal=False, export_morph_animation=True, export_cameras=False, export_lights=False)
    final = os.path.join(RUNTIME, enemy + '.glb')
    # GLTFPACK may name the binary or the npm package's cli.js (run with node).
    gltfpack = os.environ.get('GLTFPACK') or shutil.which('gltfpack')
    if gltfpack:
        command = ['node', gltfpack] if gltfpack.endswith('.js') else [gltfpack]
        subprocess.run([*command, '-i', raw, '-o', final, '-cc', '-kn', '-km', '-ke', '-vt', '14'], check=True)
    else:
        shutil.copyfile(raw, final)
    report['bytes'] = {'raw': os.path.getsize(raw), 'runtime': os.path.getsize(final), 'packed': bool(gltfpack)}
    portrait(enemy, low)
    json.dump(report, open(os.path.join(work, 'report.json'), 'w'), indent=2)
    log(enemy, json.dumps(report))


if __name__ == '__main__':
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for name in requested or list(CONFIG):
        build(name)
