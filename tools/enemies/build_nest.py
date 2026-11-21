"""Sculpts the brood nest master for tools/enemies/process.py.

Unlike the other pathogens, the nest has no source scan: it is modelled here. process.py calls
build_master() and then remeshes, decimates, bakes and animates the result like any scan.

  blender -b -P tools/enemies/process.py -- nest

The nest is a mound of wet tissue packed with translucent egg sacs. A few sacs have already torn
open into ragged craters, and thick roots spread from the base and grip the floor. Everything is
built from metaballs and tapered curves, fused by a voxel remesh, then wrinkled with layered
displacement. Colour comes from per-vertex masks (how deep inside a sac, how close to its crown,
root or body, crater interior) that a procedural material turns into membrane, embryo shadows,
veins and slime, so the bake carries real surface variation rather than a flat tint.
"""
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector

SEED = 4127
VOXEL = .0085


def spiral(count, lowest, rng):
    """Directions spread over the dome above `lowest` (sine of elevation), golden-angle spaced."""
    for index in range(count):
        height = lowest + (1 - lowest) * (index + .5) / count
        ring = math.sqrt(max(0, 1 - height * height))
        angle = index * 2.399963 + rng.uniform(-.25, .25)
        yield Vector((math.cos(angle) * ring, math.sin(angle) * ring, height))


def plan(rng):
    """Root paths and the directions sacs grow in, in metres with z up and the floor at z = 0."""
    body = {'centre': Vector((0, 0, .3)), 'size': Vector((.92, .86, .6))}
    sacs = []
    for index, direction in enumerate(spiral(34, .02, rng)):
        radius = rng.uniform(.16, .23) * (1.45 if index % 6 == 2 else 1)
        sacs.append({'up': direction, 'radius': radius, 'sink': rng.uniform(.18, .42)})
    for direction in spiral(4, .8, rng):
        sacs.append({'up': direction, 'radius': rng.uniform(.25, .31), 'sink': rng.uniform(.3, .45)})
    for index in (2, 11, 20, 27, 35):
        sacs[index]['hatched'] = True
    litter = []
    for _ in range(14):
        angle = rng.uniform(0, math.tau)
        reach = rng.uniform(.98, 1.3)
        radius = rng.uniform(.07, .12)
        litter.append({'centre': Vector((math.cos(angle) * reach, math.sin(angle) * reach * .95, radius * .78)),
                       'radius': radius, 'up': Vector((0, 0, 1))})
    roots = []
    for index in range(11):
        angle = index / 11 * math.tau + rng.uniform(-.2, .2)
        length = rng.uniform(.75, 1.25)
        bend = rng.uniform(-.55, .55)
        points = []
        for step in range(6):
            t = step / 5
            reach = .7 + length * t
            swing = angle + bend * t * t
            lift = .2 * (1 - t) ** 2 + .035 + .05 * math.sin(t * 7 + index)
            points.append(Vector((math.cos(swing) * reach, math.sin(swing) * reach * .95, lift)))
        roots.append({'points': points, 'radius': rng.uniform(.085, .13)})
    return body, sacs, litter, roots


def metaball_mound(body, rng):
    """The muscle the sacs are bedded in: one flattened mass with a few shoulders."""
    data = bpy.data.metaballs.new('nest_mound')
    data.resolution = .014
    data.render_resolution = .014
    data.threshold = .6
    core = data.elements.new(type='ELLIPSOID')
    core.co = body['centre']
    core.radius = 1.12
    core.size_x, core.size_y, core.size_z = body['size']
    core.stiffness = 2
    for _ in range(7):
        angle = rng.uniform(0, math.tau)
        lump = data.elements.new(type='BALL')
        lump.co = body['centre'] + Vector((math.cos(angle) * .62, math.sin(angle) * .58, rng.uniform(-.12, .2)))
        lump.radius = rng.uniform(.42, .6)
        lump.stiffness = 1.6
    obj = bpy.data.objects.new('nest_mound', data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def seat_sacs(mound, body, sacs):
    """Beds each sac into the mound's actual surface along its growth direction."""
    for sac in sacs:
        origin = body['centre'] + sac['up'] * 4
        hit, location, _normal, _face = mound.ray_cast(origin, -sac['up'])
        surface = location if hit else body['centre'] + sac['up'] * .8
        sac['centre'] = surface + sac['up'] * sac['radius'] * (1 - 2 * sac['sink'])
        # Sacs low on the flank would sink through the floor.
        sac['centre'].z = max(sac['centre'].z, sac['radius'] * .7)


def sac_meshes(sacs, rng):
    """Whole sacs are slightly squashed spheres. Hatched ones are hollow cups with a ragged lip."""
    objects = []
    for index, sac in enumerate(sacs):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=4, radius=sac['radius'])
        up = sac['up']
        if sac.get('hatched'):
            cut = sac['radius'] * rng.uniform(.05, .3)
            doomed = [v for v in bm.verts if v.co.dot(up) > cut + sac['radius'] * .16 * math.sin(math.atan2(v.co.y, v.co.x) * 5 + index)]
            bmesh.ops.delete(bm, geom=doomed, context='VERTS')
            for vert in bm.verts:
                if vert.is_boundary:
                    # Peel the torn edge outward and vary its height.
                    vert.co += vert.co.normalized() * sac['radius'] * rng.uniform(.02, .16) + up * sac['radius'] * rng.uniform(-.06, .1)
        mesh = bpy.data.meshes.new('nest_sac%d' % index)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(mesh.name, mesh)
        obj.location = sac['centre']
        obj.rotation_euler = (rng.uniform(0, math.tau), rng.uniform(0, math.tau), rng.uniform(0, math.tau)) if not sac.get('hatched') else (0, 0, 0)
        obj.scale = (1, 1, 1) if sac.get('hatched') else (rng.uniform(.92, 1.08), rng.uniform(.92, 1.08), rng.uniform(.86, 1))
        bpy.context.scene.collection.objects.link(obj)
        if sac.get('hatched'):
            shell = obj.modifiers.new('shell', 'SOLIDIFY')
            shell.thickness = max(.032, sac['radius'] * .16)
            shell.offset = -1
        objects.append(obj)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target='MESH')
    return list(bpy.context.selected_objects)


def root_meshes(roots):
    objects = []
    for index, root in enumerate(roots):
        curve = bpy.data.curves.new('nest_root%d' % index, 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = root['radius']
        curve.bevel_resolution = 5
        curve.use_fill_caps = True
        spline = curve.splines.new('NURBS')
        spline.points.add(len(root['points']) - 1)
        for step, (point, co) in enumerate(zip(spline.points, root['points'])):
            point.co = (*co, 1)
            t = step / (len(root['points']) - 1)
            # Thick where it leaves the mound, a knuckle halfway, thin at the tip.
            point.radius = (1 - t) ** .8 * (1 + .25 * math.sin(t * 9 + index)) + .16
        spline.use_endpoint_u = True
        spline.order_u = 4
        spline.resolution_u = 14
        obj = bpy.data.objects.new(curve.name, curve)
        bpy.context.scene.collection.objects.link(obj)
        objects.append(obj)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target='MESH')
    return list(bpy.context.selected_objects)


def texture(name, kind, **settings):
    tex = bpy.data.textures.new(name, kind)
    for key, value in settings.items():
        setattr(tex, key, value)
    return tex


def fuse_and_wrinkle(parts):
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    nest = bpy.context.view_layer.objects.active
    nest.name = 'nest_master'
    remesh = nest.modifiers.new('fuse', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = VOXEL
    remesh.adaptivity = 0
    bpy.ops.object.modifier_apply(modifier='fuse')
    smooth = nest.modifiers.new('settle', 'SMOOTH')
    smooth.factor = .5
    smooth.iterations = 7
    bpy.ops.object.modifier_apply(modifier='settle')
    layers = (
        # Broad sag and swell, then membrane folds, then fine wrinkles.
        (texture('nest_swell', 'CLOUDS', noise_scale=.5, noise_depth=2), .028),
        (texture('nest_folds', 'MUSGRAVE', musgrave_type='RIDGED_MULTIFRACTAL', noise_scale=.16, octaves=4,
                 lacunarity=2.2, dimension_max=1.1) if 'MUSGRAVE' in bpy.types.Texture.bl_rna.properties['type'].enum_items.keys()
         else texture('nest_folds', 'CLOUDS', noise_scale=.16, noise_depth=5), .016),
        (texture('nest_wrinkles', 'CLOUDS', noise_scale=.05, noise_depth=4), .004),
    )
    for index, (tex, strength) in enumerate(layers):
        displace = nest.modifiers.new('wrinkle%d' % index, 'DISPLACE')
        displace.texture = tex
        displace.texture_coords = 'OBJECT'
        displace.strength = strength
        displace.mid_level = .5
        bpy.ops.object.modifier_apply(modifier=displace.name)
    # Flatten the underside so the nest sits on the floor instead of floating on a bulge.
    bm = bmesh.new()
    bm.from_mesh(nest.data)
    for vert in bm.verts:
        if vert.co.z < .012:
            vert.co.z = .012 - (.012 - vert.co.z) * .15
    bm.to_mesh(nest.data)
    bm.free()
    return nest


def paint_masks(nest, body, sacs, roots):
    """Per-vertex masks for the material: R sac membrane, G where the brood shows through the
    membrane, B root. Alpha marks the raw lining inside a torn sac."""
    mesh = nest.data
    count = len(mesh.vertices)
    co = np.empty(count * 3, np.float32)
    mesh.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    normal = np.empty(count * 3, np.float32)
    mesh.vertices.foreach_get('normal', normal)
    normal = normal.reshape(-1, 3)
    sac = np.zeros(count, np.float32)
    brood = np.zeros(count, np.float32)
    torn = np.zeros(count, np.float32)
    tone = np.zeros(count, np.float32)
    for index, item in enumerate(sacs):
        centre = np.array(item['centre'], np.float32)
        up = np.array(item['up'], np.float32)
        offset = co - centre
        distance = np.linalg.norm(offset, axis=1)
        direction = offset / np.maximum(distance, 1e-5)[:, None]
        # On or just inside the sphere, and facing out of it: that is membrane, not the bed.
        shell = np.clip((1.1 - distance / item['radius']) / .1, 0, 1) * np.clip(((normal * direction).sum(1) - .1) / .5, 0, 1)
        if item.get('hatched'):
            inner = np.clip((1.1 - distance / item['radius']) / .1, 0, 1) * np.clip((-(normal * direction).sum(1) + .25) / .4, 0, 1)
            torn = np.maximum(torn, inner)
            sac = np.maximum(sac, shell * .85)
            continue
        sac = np.maximum(sac, shell)
        # The brood is a dark, off-centre shape hanging in the lower half of each sac.
        lean = up + np.array([math.sin(index * 1.9), math.cos(index * 2.3), math.sin(index * 3.1) * .5], np.float32) * .7
        seat = centre + lean / np.linalg.norm(lean) * item['radius'] * .34
        depth = np.linalg.norm(co - seat, axis=1) / item['radius']
        brood = np.maximum(brood, shell * np.clip((1.02 - depth) / .34, 0, 1))
        # Each sac ripens at its own pace: a second layer carries one tone per sac.
        tone = np.maximum(tone, shell * (.15 + .85 * ((index * .618034) % 1)))
    root = np.zeros(count, np.float32)
    for item in roots:
        points = np.array(item['points'], np.float32)
        for start, end in zip(points[:-1], points[1:]):
            segment = end - start
            t = np.clip(((co - start) @ segment) / (segment @ segment), 0, 1)
            distance = np.linalg.norm(co - (start + t[:, None] * segment), axis=1)
            root = np.maximum(root, np.clip(1.7 - distance / item['radius'], 0, 1))
    planar = np.hypot(co[:, 0] / body['size'][0], co[:, 1] / body['size'][1])
    root *= np.clip((planar - .9) / .2, 0, 1) * (1 - sac)
    colours = np.stack([sac, brood, root, torn], axis=1)
    layer = mesh.color_attributes.new('nest_masks', 'FLOAT_COLOR', 'POINT')
    layer.data.foreach_set('color', colours.ravel())
    ripeness = mesh.color_attributes.new('nest_tone', 'FLOAT_COLOR', 'POINT')
    ripeness.data.foreach_set('color', np.stack([tone, tone, tone, np.ones_like(tone)], axis=1).ravel())
    mesh.update()


def ramp(tree, stops):
    node = tree.nodes.new('ShaderNodeValToRGB')
    while len(node.color_ramp.elements) < len(stops):
        node.color_ramp.elements.new(.5)
    for element, (position, colour) in zip(node.color_ramp.elements, stops):
        element.position = position
        element.color = colour
    return node


def math_node(tree, operation, a=None, b=None, clamp=False):
    node = tree.nodes.new('ShaderNodeMath')
    node.operation = operation
    node.use_clamp = clamp
    for index, value in enumerate((a, b)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            node.inputs[index].default_value = value
        else:
            tree.links.new(value, node.inputs[index])
    return node.outputs[0]


def mix_colour(tree, factor, a, b):
    node = tree.nodes.new('ShaderNodeMix')
    node.data_type = 'RGBA'
    for socket, value in ((node.inputs[0], factor), (node.inputs[6], a), (node.inputs[7], b)):
        if hasattr(value, 'is_linked'):
            tree.links.new(value, socket)
        elif isinstance(value, (int, float)):
            socket.default_value = value
        else:
            socket.default_value = value
    return node.outputs[2]


def material(nest):
    mat = bpy.data.materials.new('nest_master')
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes['Principled BSDF']
    coord = tree.nodes.new('ShaderNodeTexCoord')
    masks = tree.nodes.new('ShaderNodeVertexColor')
    masks.layer_name = 'nest_masks'
    split = tree.nodes.new('ShaderNodeSeparateColor')
    tree.links.new(masks.outputs['Color'], split.inputs[0])
    sac, crown, root, torn = split.outputs['Red'], split.outputs['Green'], split.outputs['Blue'], masks.outputs['Alpha']

    def noise(scale, detail=4, roughness=.6):
        node = tree.nodes.new('ShaderNodeTexNoise')
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = roughness
        tree.links.new(coord.outputs['Object'], node.inputs['Vector'])
        return node.outputs['Fac']

    def veins(scale, width):
        node = tree.nodes.new('ShaderNodeTexVoronoi')
        node.feature = 'DISTANCE_TO_EDGE'
        node.inputs['Scale'].default_value = scale
        warp = tree.nodes.new('ShaderNodeMixRGB')
        warp.blend_type = 'ADD'
        warp.inputs[0].default_value = .09
        tree.links.new(coord.outputs['Object'], warp.inputs[1])
        distortion = tree.nodes.new('ShaderNodeTexNoise')
        distortion.inputs['Scale'].default_value = scale * .6
        tree.links.new(coord.outputs['Object'], distortion.inputs['Vector'])
        tree.links.new(distortion.outputs['Color'], warp.inputs[2])
        tree.links.new(warp.outputs[0], node.inputs['Vector'])
        return math_node(tree, 'SUBTRACT', 1, math_node(tree, 'DIVIDE', node.outputs['Distance'], width, clamp=True), clamp=True)

    mottling = noise(6, 5)
    fine = noise(46, 3, .7)
    brood = crown
    # Bed: dark wet muscle, near-black maroon in the crevices, redder on the swells.
    bed = ramp(tree, ((.3, (.022, .003, .006, 1)), (.55, (.11, .012, .016, 1)), (.8, (.26, .035, .03, 1))))
    tree.links.new(mottling, bed.inputs[0])
    # Membrane: thin amber and rose skin, cloudy in patches.
    young = ramp(tree, ((.25, (.42, .13, .06, 1)), (.5, (.66, .3, .12, 1)), (.78, (.8, .52, .25, 1))))
    tree.links.new(noise(9, 3), young.inputs[0])
    tone = tree.nodes.new('ShaderNodeVertexColor')
    tone.layer_name = 'nest_tone'
    ripe = tree.nodes.new('ShaderNodeSeparateColor')
    tree.links.new(tone.outputs['Color'], ripe.inputs[0])
    # Ripe sacs flush dark rose and purple as the brood inside comes to term.
    membrane = tree.nodes.new('ShaderNodeMix')
    membrane.data_type = 'RGBA'
    membrane.blend_type = 'MULTIPLY'
    tree.links.new(math_node(tree, 'POWER', ripe.outputs['Red'], 1.6), membrane.inputs[0])
    tree.links.new(young.outputs['Color'], membrane.inputs[6])
    membrane.inputs[7].default_value = (.62, .2, .3, 1)
    # The brood darkens the sac from inside, with a soft irregular outline.
    soften = tree.nodes.new('ShaderNodeMapRange')
    soften.interpolation_type = 'SMOOTHSTEP'
    soften.inputs['From Min'].default_value = .32
    soften.inputs['From Max'].default_value = .82
    tree.links.new(math_node(tree, 'MULTIPLY', brood, math_node(tree, 'ADD', .75, math_node(tree, 'MULTIPLY', noise(19, 2), .6)), clamp=True),
                   soften.inputs['Value'])
    shadow = soften.outputs['Result']
    filled = mix_colour(tree, math_node(tree, 'MULTIPLY', shadow, .92), membrane.outputs[2], (.06, .006, .02, 1))
    # A few branching capillaries, fading out over the brood.
    patchy = math_node(tree, 'MULTIPLY', math_node(tree, 'SUBTRACT', noise(4, 2), .48, clamp=True), 5, clamp=True)
    capillaries = math_node(tree, 'MULTIPLY', veins(7, .022), patchy)
    veined = mix_colour(tree, math_node(tree, 'MULTIPLY', capillaries, .55), filled, (.3, .008, .015, 1))
    surface = mix_colour(tree, math_node(tree, 'MULTIPLY', sac, 1.25, clamp=True), bed.outputs['Color'], veined)
    # Roots: sinew the colour of the bed, paler and drier toward the tips.
    sinew = ramp(tree, ((.3, (.05, .008, .01, 1)), (.6, (.2, .045, .035, 1)), (.85, (.42, .17, .12, 1))))
    tree.links.new(noise(13, 4), sinew.inputs[0])
    rooted = mix_colour(tree, root, surface, sinew.outputs['Color'])
    # Torn sacs: raw, glistening lining.
    lining = ramp(tree, ((.3, (.12, .004, .01, 1)), (.75, (.5, .04, .035, 1))))
    tree.links.new(fine, lining.inputs[0])
    final = mix_colour(tree, torn, rooted, lining.outputs['Color'])
    tree.links.new(final, bsdf.inputs['Base Color'])

    # Wet everywhere; the membranes and the raw lining are the glossiest, roots the driest.
    rough = math_node(tree, 'ADD', .2, math_node(tree, 'MULTIPLY', fine, .3))
    rough = math_node(tree, 'SUBTRACT', rough, math_node(tree, 'MULTIPLY', sac, .12))
    rough = math_node(tree, 'ADD', rough, math_node(tree, 'MULTIPLY', root, .2))
    rough = math_node(tree, 'SUBTRACT', rough, math_node(tree, 'MULTIPLY', torn, .1), clamp=True)
    tree.links.new(rough, bsdf.inputs['Roughness'])
    bsdf.inputs['Subsurface Weight'].default_value = .35
    bsdf.inputs['Subsurface Radius'].default_value = (.12, .035, .02)
    bsdf.inputs['Subsurface Scale'].default_value = .2
    bsdf.inputs['Coat Weight'].default_value = .7
    bsdf.inputs['Coat Roughness'].default_value = .12
    nest.data.materials.clear()
    nest.data.materials.append(mat)
    return mat


def build_master():
    """Returns the finished master mesh object, linked into the current scene."""
    rng = random.Random(SEED)
    body, sacs, litter, roots = plan(rng)
    mound = metaball_mound(body, rng)
    seat_sacs(mound, body, sacs)
    sacs += litter
    nest = fuse_and_wrinkle([mound, *sac_meshes(sacs, rng), *root_meshes(roots)])
    paint_masks(nest, body, sacs, roots)
    material(nest)
    bpy.ops.object.select_all(action='DESELECT')
    nest.select_set(True)
    bpy.context.view_layer.objects.active = nest
    bpy.ops.object.shade_smooth()
    return nest
