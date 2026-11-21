"""Shared sculpting helpers for the modelled bosses (build_boss_*.py).

A builder lays out primitives in metres with z up and the organism facing -Y (that becomes the
game's forward), fuses them into one watertight mesh, paints per-vertex masks, and hands back a
master for tools/enemies/process.py to remesh, decimate, bake and animate.

Colour is never a flat tint: `zone_material` blends up to four masked zones, each with its own
noise-driven colour ramp and wetness, then lays veins and fine mottling over the top so the bake
carries real variation.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

VOXEL = .0085


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def to_mesh(objects):
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target='MESH')
    return list(bpy.context.selected_objects)


def metaballs(name, elements, resolution=.016, threshold=.6):
    """elements: dicts with co, radius and optionally size (ellipsoid), stiffness, negative."""
    data = bpy.data.metaballs.new(name)
    data.resolution = data.render_resolution = resolution
    data.threshold = threshold
    for item in elements:
        ball = data.elements.new(type='ELLIPSOID' if 'size' in item else 'BALL')
        ball.co = item['co']
        ball.radius = item['radius']
        if 'size' in item:
            ball.size_x, ball.size_y, ball.size_z = item['size']
        ball.stiffness = item.get('stiffness', 2)
        ball.use_negative = item.get('negative', False)
    return to_mesh([link(bpy.data.objects.new(name, data))])[0]


def tube(name, points, radius, taper=lambda t: 1 - t * .8, resolution=6):
    """A bevelled curve through `points`; taper(t) scales the radius from root (0) to tip (1)."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    curve.use_fill_caps = True
    spline = curve.splines.new('NURBS')
    spline.points.add(len(points) - 1)
    for step, (point, co) in enumerate(zip(spline.points, points)):
        point.co = (*co, 1)
        point.radius = max(.05, taper(step / (len(points) - 1)))
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(points))
    spline.resolution_u = 12
    return link(bpy.data.objects.new(name, curve))


def tubes(specs):
    return to_mesh([tube(*spec) if isinstance(spec, tuple) else tube(**spec) for spec in specs]) if specs else []


def blob(name, co, radius, scale=(1, 1, 1), rotation=(0, 0, 0), subdivisions=4):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = co
    obj.scale = scale
    obj.rotation_euler = rotation
    return obj


def prism(name, co, radius, length, direction, sides=6, point=.35):
    """A faceted crystal: a prism along `direction` with a pointed tip."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=radius, radius2=radius * .86, depth=length)
    top = [v for v in bm.verts if v.co.z > 0]
    tip = bmesh.ops.extrude_face_region(bm, geom=[f for f in bm.faces if all(v in top for v in f.verts)])
    for vert in [g for g in tip['geom'] if isinstance(g, bmesh.types.BMVert)]:
        vert.co.z += length * point
        vert.co.x *= .12
        vert.co.y *= .12
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, length / 2))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = co
    obj.rotation_euler = Vector(direction).to_track_quat('Z', 'Y').to_euler()
    return obj


def texture(name, kind, **settings):
    tex = bpy.data.textures.new(name, kind)
    for key, value in settings.items():
        setattr(tex, key, value)
    return tex


def fuse(parts, name, voxel=VOXEL, smooth=5, wrinkles=((.5, .03), (.14, .014), (.05, .004)), floor=None):
    """Joins the parts, voxel-remeshes them into one skin and displaces it with layered noise.
    `floor` flattens everything below that height so a grounded organism sits on the ground."""
    meshes = to_mesh([part for part in parts if part.type != 'MESH']) if any(part.type != 'MESH' for part in parts) else []
    parts = [part for part in parts if part.type == 'MESH'] + meshes
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    remesh = obj.modifiers.new('fuse', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = voxel
    remesh.adaptivity = 0
    bpy.ops.object.modifier_apply(modifier='fuse')
    if smooth:
        settle = obj.modifiers.new('settle', 'SMOOTH')
        settle.factor = .5
        settle.iterations = smooth
        bpy.ops.object.modifier_apply(modifier='settle')
    for index, (scale, strength) in enumerate(wrinkles):
        displace = obj.modifiers.new('wrinkle%d' % index, 'DISPLACE')
        displace.texture = texture('%s_wrinkle%d' % (name, index), 'CLOUDS', noise_scale=scale, noise_depth=3)
        displace.texture_coords = 'OBJECT'
        displace.strength = strength
        displace.mid_level = .5
        bpy.ops.object.modifier_apply(modifier=displace.name)
    if floor is not None:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        for vert in bm.verts:
            if vert.co.z < floor:
                vert.co.z = floor - (floor - vert.co.z) * .12
        bm.to_mesh(obj.data)
        bm.free()
    bpy.ops.object.shade_smooth()
    return obj


def vertices(obj):
    mesh = obj.data
    count = len(mesh.vertices)
    co = np.empty(count * 3, np.float32)
    mesh.vertices.foreach_get('co', co)
    normal = np.empty(count * 3, np.float32)
    mesh.vertices.foreach_get('normal', normal)
    return co.reshape(-1, 3), normal.reshape(-1, 3)


def near_points(co, points, radius):
    """0..1 closeness of each vertex to the nearest of `points` (1 at the point, 0 at `radius`)."""
    best = np.zeros(len(co), np.float32)
    for point in points:
        distance = np.linalg.norm(co - np.array(point, np.float32), axis=1)
        best = np.maximum(best, np.clip(1 - distance / radius, 0, 1))
    return best


def near_path(co, points, radius):
    """Closeness to a polyline, for tendrils, ropes and stripes."""
    best = np.zeros(len(co), np.float32)
    points = np.array(points, np.float32)
    for start, end in zip(points[:-1], points[1:]):
        segment = end - start
        t = np.clip(((co - start) @ segment) / max(segment @ segment, 1e-9), 0, 1)
        distance = np.linalg.norm(co - (start + t[:, None] * segment), axis=1)
        best = np.maximum(best, np.clip(1 - distance / radius, 0, 1))
    return best


def paint(obj, masks, name='zones'):
    """Stores four 0..1 masks (r, g, b, a) per vertex for zone_material."""
    count = len(obj.data.vertices)
    channels = [np.clip(masks.get(key, np.zeros(count, np.float32)), 0, 1) for key in 'rgba']
    layer = obj.data.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    layer.data.foreach_set('color', np.stack(channels, axis=1).ravel())
    obj.data.update()


def _ramp(tree, stops):
    node = tree.nodes.new('ShaderNodeValToRGB')
    while len(node.color_ramp.elements) < len(stops):
        node.color_ramp.elements.new(.5)
    for element, (position, colour) in zip(node.color_ramp.elements, stops):
        element.position = position
        element.color = (*colour, 1)
    return node


def _math(tree, operation, a, b=None, clamp=False):
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


def _mix(tree, factor, a, b, blend='MIX'):
    node = tree.nodes.new('ShaderNodeMix')
    node.data_type = 'RGBA'
    node.blend_type = blend
    for socket, value in ((node.inputs[0], factor), (node.inputs[6], a), (node.inputs[7], b)):
        if isinstance(value, (int, float)):
            socket.default_value = value
        elif isinstance(value, tuple):
            socket.default_value = (*value, 1) if len(value) == 3 else value
        else:
            tree.links.new(value, socket)
    return node.outputs[2]


def zone_material(obj, base, zones=(), veins=None, mottle=.25, coat=.7, subsurface=.3):
    """base and each zone: dict(stops=[(pos, (r, g, b)), ...], scale=noise scale, rough=roughness).
    zones are keyed by mask channel ('r', 'g', 'b', 'a') and layered in order over the base.
    veins: dict(colour, scale, width, strength, mask=channel or None) draws a branching network."""
    mat = bpy.data.materials.new(obj.name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes['Principled BSDF']
    coord = tree.nodes.new('ShaderNodeTexCoord')
    masks = tree.nodes.new('ShaderNodeVertexColor')
    masks.layer_name = 'zones'
    split = tree.nodes.new('ShaderNodeSeparateColor')
    tree.links.new(masks.outputs['Color'], split.inputs[0])
    channel = {'r': split.outputs['Red'], 'g': split.outputs['Green'], 'b': split.outputs['Blue'], 'a': masks.outputs['Alpha']}

    def noise(scale, detail=4, roughness=.6):
        node = tree.nodes.new('ShaderNodeTexNoise')
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = roughness
        tree.links.new(coord.outputs['Object'], node.inputs['Vector'])
        return node.outputs['Fac']

    def layer(spec):
        ramp = _ramp(tree, spec['stops'])
        tree.links.new(noise(spec.get('scale', 7), spec.get('detail', 4)), ramp.inputs[0])
        return ramp.outputs['Color']

    colour = layer(base)
    rough = base.get('rough', .3)
    for key, spec in zones:
        weight = _math(tree, 'MULTIPLY', channel[key], spec.get('gain', 1.4), clamp=True)
        colour = _mix(tree, weight, colour, layer(spec))
        rough = _math(tree, 'ADD', _math(tree, 'MULTIPLY', rough, _math(tree, 'SUBTRACT', 1, weight)),
                      _math(tree, 'MULTIPLY', weight, spec.get('rough', .3)))
    if veins:
        cells = tree.nodes.new('ShaderNodeTexVoronoi')
        cells.feature = 'DISTANCE_TO_EDGE'
        cells.inputs['Scale'].default_value = veins.get('scale', 8)
        warp = tree.nodes.new('ShaderNodeMixRGB')
        warp.blend_type = 'ADD'
        warp.inputs[0].default_value = .1
        bend = tree.nodes.new('ShaderNodeTexNoise')
        bend.inputs['Scale'].default_value = veins.get('scale', 8) * .6
        tree.links.new(coord.outputs['Object'], bend.inputs['Vector'])
        tree.links.new(coord.outputs['Object'], warp.inputs[1])
        tree.links.new(bend.outputs['Color'], warp.inputs[2])
        tree.links.new(warp.outputs[0], cells.inputs['Vector'])
        line = _math(tree, 'SUBTRACT', 1, _math(tree, 'DIVIDE', cells.outputs['Distance'], veins.get('width', .03), clamp=True), clamp=True)
        patchy = _math(tree, 'MULTIPLY', _math(tree, 'SUBTRACT', noise(3.5, 2), veins.get('patch', .42), clamp=True), 5, clamp=True)
        weight = _math(tree, 'MULTIPLY', _math(tree, 'MULTIPLY', line, patchy), veins.get('strength', .6))
        if veins.get('mask'):
            weight = _math(tree, 'MULTIPLY', weight, channel[veins['mask']])
        colour = _mix(tree, weight, colour, veins['colour'])
    if mottle:
        # Fine light-and-dark mottling so no area is a single flat value.
        fine = _math(tree, 'ADD', 1 - mottle / 2, _math(tree, 'MULTIPLY', noise(38, 3, .7), mottle))
        tint = tree.nodes.new('ShaderNodeCombineColor')
        for socket in tint.inputs:
            tree.links.new(fine, socket)
        colour = _mix(tree, 1, colour, tint.outputs[0], 'MULTIPLY')
    tree.links.new(colour, bsdf.inputs['Base Color'])
    wet = _math(tree, 'ADD', rough if not isinstance(rough, (int, float)) else rough, _math(tree, 'MULTIPLY', noise(44, 3), .22), clamp=True)
    tree.links.new(wet, bsdf.inputs['Roughness'])
    bsdf.inputs['Subsurface Weight'].default_value = subsurface
    bsdf.inputs['Subsurface Radius'].default_value = (.12, .04, .025)
    bsdf.inputs['Subsurface Scale'].default_value = .2
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = .14
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def finish(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    return obj


def spiral(count, lowest=-1, jitter=0, rng=None):
    """Unit directions spread evenly over the sphere above `lowest` (sine of elevation)."""
    for index in range(count):
        height = lowest + (1 - lowest) * (index + .5) / count
        ring = math.sqrt(max(0, 1 - height * height))
        angle = index * 2.399963 + (rng.uniform(-jitter, jitter) if rng else 0)
        yield Vector((math.cos(angle) * ring, math.sin(angle) * ring, height))
