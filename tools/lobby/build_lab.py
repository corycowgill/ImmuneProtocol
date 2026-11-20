"""Builds the co-op lobby's miniaturization lab and bakes its lighting.

blender -b -P tools/lobby/build_lab.py -- [--samples N] [--size N] [--preview]

Models the lab in the lobby's own coordinates (x to screen left, y up, z away from the
camera, metres): a tiled clinical floor, panelled walls with an observation window onto a
hospital corridor, a lit ceiling, the reduction machine (dais, pads, gantry arch, cables,
emitter ring), operator desks, the injection-capsule base, the hologram projector, coolant
lines and lab furniture. Cycles bakes the full lighting (direct, bounced and glossy) into
texture atlases, tone-mapped for display:

  dist/assets/lobby/lab.glb       nodes lab-shell, lab-machine, lab-emitter (atlas UVs)
  dist/assets/lobby/lab-shell.webp, lab-machine.webp, lab-emitter.webp

dist/coop-lobby-bay.mjs draws these unlit and adds what moves or changes: the squad, beams,
pad rings, the emitter's spin and charge glow, screens, hologram and capsule glass.
"""
import math
import os
import shutil
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'dist', 'assets', 'lobby')
WORK = os.path.join(HERE, 'work')
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SAMPLES = int(args[args.index('--samples') + 1]) if '--samples' in args else 160
SIZE = int(args[args.index('--size') + 1]) if '--size' in args else 2048
PREVIEW = '--preview' in args

TEAL = (.37, .95, .88)


def to_b(x, y, z):
    return Vector((x, -z, y))


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def principled(name, color, rough=.4, metal=0., coat=0., emission=None, strength=0.):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = coat
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def tile_floor():
    """Large-format porcelain tiles with fine grout and a little tonal variation."""
    mat = principled('floor', (.62, .66, .68), rough=.14, coat=.6)
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    coord = nt.nodes.new('ShaderNodeTexCoord')
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = 0
    brick.inputs['Scale'].default_value = 1.6
    brick.inputs['Mortar Size'].default_value = .006
    brick.inputs['Brick Width'].default_value = .6
    brick.inputs['Row Height'].default_value = .6
    brick.inputs['Color1'].default_value = (.62, .66, .68, 1)
    brick.inputs['Color2'].default_value = (.56, .6, .63, 1)
    brick.inputs['Mortar'].default_value = (.32, .36, .38, 1)
    nt.links.new(coord.outputs['Object'], brick.inputs['Vector'])
    nt.links.new(brick.outputs['Color'], bsdf.inputs['Base Color'])
    rough = nt.nodes.new('ShaderNodeMapRange')
    rough.inputs['From Min'].default_value = 0
    rough.inputs['From Max'].default_value = 1
    rough.inputs['To Min'].default_value = .55
    rough.inputs['To Max'].default_value = .12
    nt.links.new(brick.outputs['Fac'], rough.inputs['Value'])
    nt.links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
    return mat


M = {}


def materials():
    M['floor'] = tile_floor()
    M['wall'] = principled('wall', (.66, .7, .72), rough=.5)
    M['wall_dark'] = principled('wall_dark', (.42, .47, .5), rough=.5)
    M['seam'] = principled('seam', (.08, .09, .1), rough=.8)
    M['ceiling'] = principled('ceiling', (.2, .23, .25), rough=.7)
    M['ceramic'] = principled('ceramic', (.86, .88, .89), rough=.18, coat=.7)
    M['graphite'] = principled('graphite', (.06, .07, .08), rough=.35, metal=.6)
    M['chrome'] = principled('chrome', (.8, .82, .84), rough=.12, metal=1)
    M['rubber'] = principled('rubber', (.03, .03, .035), rough=.85)
    M['glow'] = principled('glow', TEAL, rough=.3, emission=TEAL, strength=9)
    M['glow_soft'] = principled('glow_soft', TEAL, rough=.3, emission=TEAL, strength=3)
    M['light'] = principled('light', (1, 1, 1), emission=(.95, .99, 1), strength=14)
    M['corridor'] = principled('corridor', (.12, .2, .24), rough=.6)
    M['corridor_light'] = principled('corridor_light', (1, 1, 1), emission=(.75, .95, 1), strength=6)
    M['glass_dark'] = principled('glass_dark', (.02, .05, .06), rough=.05, coat=1)
    M['yellow'] = principled('yellow', (.95, .7, .08), rough=.4)
    M['black'] = principled('black', (.03, .03, .03), rough=.5)
    M['coolant'] = principled('coolant', (.1, .35, .38), rough=.3, metal=.4, emission=(.05, .3, .32), strength=1.2)
    M['cabinet_glass'] = principled('cabinet_glass', (.55, .7, .72), rough=.05, metal=.1)
    M['blue_scrub'] = principled('blue_scrub', (.2, .45, .5), rough=.7)


# ---------------------------------------------------------------------------
# Modelling helpers (game coordinates)
# ---------------------------------------------------------------------------

PARTS = {'shell': [], 'machine': [], 'emitter': []}


def finish(obj, mat, group, bevel=0.):
    obj.data.materials.append(M[mat])
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = 'ANGLE'
        mod.use_clamp_overlap = True
    PARTS[group].append(obj)
    return obj


def box(group, mat, center, size, rot=(0, 0, 0), bevel=.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=to_b(*center))
    obj = bpy.context.active_object
    obj.scale = (size[0], size[2], size[1])
    obj.rotation_euler = (rot[0], rot[2], rot[1])
    return finish(obj, mat, group, bevel)


def cylinder(group, mat, center, radius, depth, axis='y', top=None, verts=64, bevel=.006):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=radius if top is None else top,
                                    depth=depth, location=to_b(*center))
    obj = bpy.context.active_object
    if axis == 'z':
        obj.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'x':
        obj.rotation_euler = (0, math.pi / 2, 0)
    bpy.ops.object.shade_smooth()
    return finish(obj, mat, group, bevel)


def torus(group, mat, center, major, minor, plane='xz', arc=None, rot=(0, 0, 0)):
    """plane 'xz' lies flat (axis up); 'xy' stands facing the camera."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=128, minor_segments=20,
                                     location=to_b(*center))
    obj = bpy.context.active_object
    if arc is not None:
        # Keep the upper half of a ring standing in the xy plane (an arch).
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -1e-4], context='VERTS')
        bm.to_mesh(obj.data)
        bm.free()
    if plane == 'xy':
        obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.rotation_euler[2] += rot[1]
    bpy.ops.object.shade_smooth()
    return finish(obj, mat, group)


def tube(group, mat, points, radius):
    curve = bpy.data.curves.new('tube', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 6
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.bezier_points, points):
        point.co = to_b(x, y, z)
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new('tube', curve)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return finish(obj, mat, group)


def text(group, mat, body, center, size, extrude=.004):
    curve = bpy.data.curves.new('text', 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = extrude
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    obj = bpy.data.objects.new('text', curve)
    bpy.context.scene.collection.objects.link(obj)
    # Facing the camera (-z in game) and reading left to right on screen (-x in game).
    obj.rotation_euler = (math.pi / 2, 0, math.pi)
    obj.location = to_b(*center)
    bpy.context.view_layer.objects.active = obj
    for other in bpy.context.selected_objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.active_object, mat, group)


# ---------------------------------------------------------------------------
# The lab
# ---------------------------------------------------------------------------

def room():
    S = 'shell'
    # The floor fills most of the frame, so it gets extra atlas resolution.
    box(S, 'floor', (0, -.05, 0), (18, .1, 14.4), bevel=0)['texel'] = 1.8
    box(S, 'ceiling', (0, 7.05, 0), (18, .1, 14.4), bevel=0)
    # Back wall: panels with recessed seams around the observation window.
    for x0, x1 in ((-9, -3.4), (3.4, 9)):
        for row, (y0, y1) in enumerate(((0, 1.0), (1.0, 2.25), (2.25, 4.6), (4.6, 7))):
            count = 4
            for i in range(count):
                a = x0 + (x1 - x0) * i / count
                b = x0 + (x1 - x0) * (i + 1) / count
                box(S, 'wall_dark' if row == 0 else 'wall', ((a + b) / 2, (y0 + y1) / 2, 5.25),
                    (b - a - .03, y1 - y0 - .03, .12), bevel=.012)
    box(S, 'wall', (0, .62, 5.25), (6.8, 1.24, .12), bevel=.012)
    box(S, 'wall', (0, 5.8, 5.25), (6.8, 2.4, .12), bevel=.012)
    # Dark backing shows through the panel seams; it stops at the window opening.
    for center, size in (((-6.2, 3.5, 5.32), (5.6, 7, .02)), ((6.2, 3.5, 5.32), (5.6, 7, .02)),
                         ((0, .6, 5.32), (6.8, 1.2, .02)), ((0, 5.8, 5.32), (6.8, 2.4, .02))):
        box(S, 'seam', center, size, bevel=0)
    # Window frame and the corridor beyond: a lit hallway with doors and ceiling lights.
    for x in (-3.3, 3.3):
        box(S, 'graphite', (x, 3.4, 5.2), (.16, 2.5, .3), bevel=.02)
    for y in (2.2, 4.6):
        box(S, 'graphite', (0, y, 5.2), (6.76, .16, .3), bevel=.02)
    box(S, 'corridor', (0, 3.4, 7.6), (6.6, 4.4, .1), bevel=0)
    box(S, 'corridor', (0, 1.25, 6.5), (6.6, .1, 2.4), bevel=0)
    box(S, 'corridor', (0, 5.6, 6.5), (6.6, .1, 2.4), bevel=0)
    for i in range(6):
        box(S, 'corridor_light', (-2.75 + i * 1.1, 5.52, 6.4), (.6, .04, .25), bevel=0)
    for i in range(4):
        box(S, 'wall_dark', (-2.4 + i * 1.6, 2.6, 7.52), (.9, 2.6, .06), bevel=.01)
    box(S, 'glow_soft', (0, 1.32, 7.5), (6.6, .03, .05), bevel=0)
    # Side walls with panel seams, teal light strips and a sliding door on each side.
    for side in (-1, 1):
        x = side * 7.05
        for i in range(6):
            z = -6 + i * 2.2
            box(S, 'wall', (x, 2.2, z), (.12, 4.4 - .03, 2.2 - .03), bevel=.012)
            box(S, 'wall_dark', (x, 5.7, z), (.12, 2.6 - .03, 2.2 - .03), bevel=.012)
        box(S, 'glow', (x - side * .07, 4.42, -.5), (.04, .05, 12.4), bevel=0)
        box(S, 'graphite', (x - side * .08, 1.45, 2.4), (.08, 2.9, 1.8), bevel=.02)
        box(S, 'glass_dark', (x - side * .13, 1.55, 2.4), (.02, 2.2, .7), bevel=0)
        box(S, 'glow', (x - side * .13, 3.0, 2.4), (.02, .06, 1.2), bevel=0)
    # Ceiling light panels and a cable tray.
    for x in (-4.5, -1.5, 1.5, 4.5):
        for z in (-3.5, 1, 4):
            box(S, 'graphite', (x, 6.97, z), (2.1, .06, .62), bevel=.01)
            box(S, 'light', (x, 6.93, z), (1.9, .02, .45), bevel=0)
    box(S, 'graphite', (-5.5, 6.4, 0), (.5, .08, 13), bevel=.01)
    # Wall signage beside the window.
    text(S, 'graphite', 'MINIATURIZATION LAB  ·  M-01', (-5.05, 4.05, 5.17), .2)
    text(S, 'wall_dark', 'ST. CORPUSCLE GENERAL  ·  IMMUNE PROTOCOL  ·  RESTRICTED', (-5.05, 3.75, 5.17), .075)
    box(S, 'glow', (-5.05, 3.58, 5.17), (2.9, .02, .02), bevel=0)
    # Medical storage: glass-front cabinets along the back wall, a counter and supplies.
    for side in (-1, 1):
        cx = side * 5.6
        box(S, 'ceramic', (cx, .5, 4.75), (2.6, 1.0, .8), bevel=.02)
        box(S, 'graphite', (cx, 1.03, 4.75), (2.7, .06, .86), bevel=.01)
        if side > 0:
            box(S, 'ceramic', (cx, 2.6, 4.95), (2.6, 1.2, .5), bevel=.02)
            for i in range(3):
                box(S, 'cabinet_glass', (cx - .86 + i * .86, 2.6, 4.69), (.8, 1.1, .02), bevel=0)
        for i in range(5):
            box(S, 'blue_scrub' if i % 2 else 'ceramic', (cx - .8 + i * .38, 1.16 + (i % 2) * .04, 4.75),
                (.26, .2 + (i % 2) * .08, .3), bevel=.01)
    # Painted hazard ring on the floor around the dais.
    for i in range(40):
        a0 = i / 40 * math.tau
        mid = a0 + math.tau / 80
        box(S, 'yellow' if i % 2 else 'black', (math.cos(mid) * 3.0, .004, math.sin(mid) * 3.0),
            (.42, .008, .16), rot=(0, -mid + math.pi / 2, 0), bevel=0)


def machine():
    S = 'machine'
    cylinder(S, 'ceramic', (0, .08, 0), 2.6, .16, top=2.45)
    cylinder(S, 'graphite', (0, .19, 0), 2.3, .06, top=2.2)
    for radius in (1.55, 2.05):
        torus(S, 'glow', (0, .225, 0), radius, .02)
    for x in (1, -1):
        cylinder(S, 'chrome', (x, .26, 0), .56, .08, top=.5)
        cylinder(S, 'graphite', (x, .225, 0), .6, .02)
    for side in (-1, 1):
        box(S, 'ceramic', (side * 2.9, .06, -1.6), (.6, .12, 1.1), rot=(0, side * .4, 0), bevel=.03)
    # Gantry arch with segment clamps and a lit inner channel.
    torus(S, 'ceramic', (0, .22, .7), 2.25, .14, plane='xy', arc=True)
    torus(S, 'glow', (0, .22, .58), 2.25, .045, plane='xy', arc=True)
    for i in range(1, 8):
        angle = i / 8 * math.pi
        box(S, 'graphite', (math.cos(angle) * 2.25, .22 + math.sin(angle) * 2.25, .7), (.26, .14, .32),
            rot=(0, 0, angle), bevel=.015)
    for side in (-1, 1):
        box(S, 'graphite', (side * 2.25, .3, .7), (.5, .36, .62), bevel=.03)
    # Emitter housing and the four suspension cables.
    cylinder(S, 'graphite', (0, 3.05, 0), .55, .3, top=.42)
    for i in range(4):
        angle = math.pi / 4 + i * math.pi / 2
        start = (math.cos(angle) * 1.45, 2.9, math.sin(angle) * 1.45)
        end = (math.cos(angle) * 2.6, 7, math.sin(angle) * 2.6)
        tube(S, 'graphite', [start, ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2), end], .025)
    # Operator desks (screens are drawn live by the game).
    for side in (1, -1):
        cx, cz, turn = side * 3.5, -1.4, side * .55
        def at(dx, dy, dz):
            return (cx + dx * math.cos(turn) + dz * math.sin(turn), dy, cz - dx * math.sin(turn) + dz * math.cos(turn))
        box(S, 'ceramic', at(0, .48, 0), (1.3, .95, .55), rot=(0, turn, 0), bevel=.03)
        box(S, 'graphite', at(0, .98, 0), (1.36, .06, .62), rot=(0, turn, 0), bevel=.01)
        box(S, 'graphite', at(0, 1.42, .1), (1.28, .82, .05), rot=(-.35, turn, 0), bevel=.01)
        # Upright stand behind the monitor, with a bracket into its back.
        box(S, 'graphite', at(0, 1.2, .32), (.06, .4, .06), rot=(0, turn, 0), bevel=.005)
        box(S, 'graphite', at(0, 1.42, .24), (.22, .12, .2), rot=(0, turn, 0), bevel=.005)
        for i in range(6):
            box(S, 'chrome', at(-.45 + i * .18, 1.02, -.15), (.1, .02, .06), rot=(0, turn, 0), bevel=.004)
    # Injection capsule base and cap (glass and fluid are drawn live), and the hologram projector.
    cylinder(S, 'graphite', (3.4, .17, 2.7), .7, .35, top=.6)
    cylinder(S, 'graphite', (3.4, 2.65, 2.7), .6, .3)
    for y in (.5, 1.42, 2.34):
        torus(S, 'chrome', (3.4, y, 2.7), .51, .025)
    cylinder(S, 'chrome', (3.4, 3.4, 2.7), .06, 1.4, verts=24)
    cylinder(S, 'graphite', (-3.3, .25, 2.7), .65, .5, top=.55)
    cylinder(S, 'glow', (-3.3, .505, 2.7), .48, .01)
    # Coolant lines from the dais to the walls, and a surgical light on a ceiling arm.
    for side in (-1, 1):
        for lift in (0, .22):
            tube(S, 'coolant', [(side * 2.3, .2 + lift, .9), (side * 3.6, .12 + lift, 2.2),
                                (side * 5.2, .5 + lift, 3.4), (side * 6.9, 1.2 + lift, 3.6)], .07)
    tube(S, 'chrome', [(-5.5, 6.4, -2.4), (-5.2, 5.6, -2.6), (-4.6, 4.9, -2.9)], .04)
    cylinder(S, 'ceramic', (-4.5, 4.75, -2.95), .32, .12, top=.24)
    cylinder(S, 'light', (-4.5, 4.68, -2.95), .26, .01)


def emitter():
    S = 'emitter'
    torus(S, 'chrome', (0, 2.85, 0), 1.45, .07)
    for i in range(8):
        angle = i / 8 * math.tau
        bpy.ops.mesh.primitive_uv_sphere_add(radius=.09, location=to_b(math.cos(angle) * 1.45, 2.8, math.sin(angle) * 1.45))
        bpy.ops.object.shade_smooth()
        finish(bpy.context.active_object, 'glow', S)
    cylinder(S, 'glow', (0, 2.89, 0), .4, .01)


def lights():
    scene = bpy.context.scene
    world = bpy.data.worlds.new('lab')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.01, .015, .018, 1)
    scene.world = world
    def area(location, size, energy, color=(1, 1, 1)):
        light = bpy.data.objects.new('area', bpy.data.lights.new('area', 'AREA'))
        light.data.size = size
        light.data.energy = energy
        light.data.color = color
        light.location = to_b(*location)
        light.rotation_euler = (math.pi, 0, 0)  # pointing down
        scene.collection.objects.link(light)
    for x in (-4.5, -1.5, 1.5, 4.5):
        for z in (-3.5, 1, 4):
            area((x, 6.85, z), 1.6, 150)
    area((0, 6.6, -1.2), 3, 260, (.9, .97, 1))
    point = bpy.data.objects.new('emitter', bpy.data.lights.new('emitter', 'POINT'))
    point.data.energy = 220
    point.data.color = TEAL
    point.data.shadow_soft_size = .6
    point.location = to_b(0, 2.6, 0)
    scene.collection.objects.link(point)


# ---------------------------------------------------------------------------
# Bake and export
# ---------------------------------------------------------------------------

def use_gpu(scene):
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind
            prefs.refresh_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = 'GPU'
                print('[lab] rendering on', kind, flush=True)
                return
        except TypeError:
            continue
    print('[lab] no GPU found; rendering on the CPU', flush=True)


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


# Where the lobby's camera sways, and where the suits' reflection probe sits (game coordinates).
VIEWPOINTS = [to_b(x, 1.85, -8.4) for x in (-.4, 0, .4)] + [to_b(0, 1.6, 0)]


def cull_hidden(parts):
    """Deletes faces that no viewpoint can see (undersides, wall backs, faces against walls),
    so the atlas spends its pixels on what the lobby shows."""
    import bmesh
    depsgraph = bpy.context.evaluated_depsgraph_get()
    scene = bpy.context.scene
    removed = total = 0
    for part in parts:
        bm = bmesh.new()
        bm.from_mesh(part.data)
        hidden = []
        for face in bm.faces:
            center = face.calc_center_median()
            samples = [center] + [v.co.lerp(center, .08) for v in face.verts]
            normal = face.normal
            seen = False
            for point in samples:
                origin = point + normal * .002
                for eye in VIEWPOINTS:
                    direction = eye - origin
                    if direction.dot(normal) <= 0:
                        continue
                    distance = direction.length
                    hit = scene.ray_cast(depsgraph, origin, direction.normalized(), distance=distance - .01)[0]
                    if not hit:
                        seen = True
                        break
                if seen:
                    break
            if not seen:
                hidden.append(face)
        total += len(bm.faces)
        removed += len(hidden)
        bmesh.ops.delete(bm, geom=hidden, context='FACES')
        bm.to_mesh(part.data)
        bm.free()
    # Parts nobody can see at all go entirely.
    for part in [p for p in parts if not p.data.polygons]:
        parts.remove(part)
        bpy.data.objects.remove(part)
    print('[lab] culled %d of %d faces' % (removed, total), flush=True)


def prepare(group, cull=True):
    parts = PARTS[group]
    for part in parts:
        select([part])
        for mod in list(part.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    select(parts)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if cull:
        cull_hidden(parts)
    for part in parts:
        while part.data.uv_layers:
            part.data.uv_layers.remove(part.data.uv_layers[0])
        part.data.uv_layers.new(name='Bake')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=.003, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Packing keeps the islands' relative sizes, so scaling a part's UVs first gives it more texels.
    for part in parts:
        texel = part.get('texel', 1)
        if texel != 1:
            for loop in part.data.uv_layers['Bake'].data:
                loop.uv = loop.uv * texel
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=.002, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')


def tonemap(rgb):
    """ACES-fitted curve to display range, then sRGB-encoded by the saved image."""
    x = rgb * .9
    return np.clip((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0, 1)


def soften(rgb):
    """A small Gaussian blur to settle the bake's sampling noise; island margins keep seams clean."""
    out = rgb * .25
    for dy, dx, w in ((0, 1, .125), (0, -1, .125), (1, 0, .125), (-1, 0, .125),
                      (1, 1, .0625), (1, -1, .0625), (-1, 1, .0625), (-1, -1, .0625)):
        out = out + np.roll(np.roll(rgb, dy, 0), dx, 1) * w
    return out


def bake(group, size):
    print('[lab] baking %s at %d px, %d samples' % (group, size, SAMPLES), flush=True)
    parts = PARTS[group]
    image = bpy.data.images.new(group, size, size, float_buffer=True)
    nodes = []
    for mat in {s.material for p in parts for s in p.material_slots}:
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        mat.node_tree.nodes.active = node
        nodes.append((mat, node))
    scene = bpy.context.scene
    scene.cycles.samples = SAMPLES
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.target = 'IMAGE_TEXTURES'
    scene.render.bake.margin = 8
    select(parts)
    bpy.ops.object.bake(type='COMBINED')
    for mat, node in nodes:
        mat.node_tree.nodes.remove(node)
    pixels = np.empty(size * size * 4, np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(size, size, 4)
    pixels[..., :3] = tonemap(soften(pixels[..., :3]))
    pixels[..., 3] = 1
    display = bpy.data.images.new(group + '_display', size, size, alpha=False)
    display.colorspace_settings.name = 'sRGB'
    # Linear 0-1 values; the image's sRGB setting encodes them on save.
    display.pixels.foreach_set(pixels.ravel())
    display.filepath_raw = os.path.join(OUT, 'lab-' + group + '.webp')
    display.file_format = 'WEBP'
    scene.render.image_settings.quality = 88
    display.save()


def export():
    roots = {}
    for group, parts in PARTS.items():
        select(parts)
        bpy.ops.object.join()
        merged = bpy.context.view_layer.objects.active
        merged.name = 'lab-' + group
        merged.data.materials.clear()
        roots[group] = merged
    select(list(roots.values()))
    raw = os.path.join(WORK, 'lab_raw.glb')
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_yup=True,
                              export_texcoords=True, export_normals=False, export_materials='NONE',
                              export_animations=False, export_cameras=False, export_lights=False)
    final = os.path.join(OUT, 'lab.glb')
    gltfpack = os.environ.get('GLTFPACK') or shutil.which('gltfpack')
    if gltfpack:
        command = ['node', gltfpack] if gltfpack.endswith('.js') else [gltfpack]
        subprocess.run([*command, '-i', raw, '-o', final, '-cc', '-kn', '-kv', '-vtf'], check=True)
    else:
        shutil.copyfile(raw, final)
    print('[lab] %d bytes' % os.path.getsize(final), flush=True)


def preview():
    scene = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle = math.radians(38)
    cam.location = to_b(0, 1.85, -8.4)
    cam.rotation_euler = (to_b(0, 1.45, .6) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 1600, 800
    scene.cycles.samples = 128
    scene.view_settings.view_transform = 'Standard'
    scene.render.filepath = os.path.join(WORK, 'lab_preview.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials()
    room()
    machine()
    emitter()
    lights()
    use_gpu(bpy.context.scene)
    if PREVIEW:
        preview()
        if '--preview-only' in args:
            sys.exit(0)
    import time
    for group, size in (('shell', SIZE), ('machine', SIZE), ('emitter', 1024)):
        started = time.time()
        prepare(group, cull=group != 'emitter')
        print('[lab] prepared %s in %.0fs' % (group, time.time() - started), flush=True)
        started = time.time()
        bake(group, size)
        print('[lab] baked %s in %.0fs' % (group, time.time() - started), flush=True)
    export()
