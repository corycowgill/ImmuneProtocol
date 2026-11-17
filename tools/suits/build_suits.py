"""Builds the four co-op suit models for Immune Protocol.

Run from the repository root:
    blender -b -P tools/suits/build_suits.py

Writes dist/suit-models.mjs, the compact part recipe the game builds its
lightweight fallback meshes from (worn while the photoreal GLBs from
build_suits_hq.py stream in), plus a reference tools/suits/renders/<id>_recipe.glb
export and a Cycles portrait in tools/suits/renders/<id>.png for each suit.

Each GLB contains one mesh object per animated joint of the teammate rig in
dist/teammate.mjs. Coordinates in this script use the game's (Three.js) frame:
+Y up, the suit faces -Z, so the visor sits at negative z. Object origins sit
on the joint pivots so the game can parent each part onto its joint.
"""
import math
import os
import sys

sys.path.append("/usr/lib/python3/dist-packages")
import json
import re

import bpy
from mathutils import Vector

# Every primitive and material is also recorded so the game can rebuild the
# exact same parts with Three.js primitives (see dist/suits.mjs).
RECIPE = {}
MATERIALS = {}


def q(values):
    return [round(float(v), 4) for v in values]

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'suits', 'renders')
PORTRAITS = os.path.join(ROOT, 'tools', 'suits', 'renders')
os.makedirs(OUT, exist_ok=True)
os.makedirs(PORTRAITS, exist_ok=True)

# Joint pivots in body space, matching createTeammate() in dist/teammate.mjs.
PIVOTS = {
    'hips': (0, .918, 0),
    'upper': (0, 1.09, 0),
    'head': (0, 1.651, -.003),
    'thigh_L': (-.112, .918, 0), 'thigh_R': (.112, .918, 0),
    'shin_L': (-.112, .515, 0), 'shin_R': (.112, .515, 0),
    'boot_L': (-.112, .167, -.03), 'boot_R': (.112, .167, -.03),
    # Arm segments are unit length from y=0 down to y=-1 and get stretched in game.
    'bicep_L': (0, 0, 0), 'bicep_R': (0, 0, 0),
    'forearm_L': (0, 0, 0), 'forearm_R': (0, 0, 0),
    'glove_L': (0, 0, 0), 'glove_R': (0, 0, 0),
}


def bl(p):
    """Three.js (x, y, z) to Blender (x, -z, y)."""
    return Vector((p[0], -p[2], p[1]))


def bl_scale(s):
    return Vector((s[0], s[2], s[1]))


def bl_rot(r):
    return (r[0], -r[2], r[1])


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metal=.3, rough=.5, emit=None, strength=0.0, alpha=1.0):
    entry = {'color': '#%06x' % color, 'metalness': metal, 'roughness': rough}
    if emit:
        entry.update(emissive='#%06x' % emit, emissiveIntensity=strength)
    if alpha < 1:
        entry['opacity'] = alpha
    MATERIALS[name] = entry
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*srgb(color), 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*srgb(emit), 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.blend_method = 'BLEND'
        mat.shadow_method = 'NONE'
    return mat


def srgb(hex_color):
    def channel(value):
        value /= 255
        return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
    return tuple(channel((hex_color >> shift) & 255) for shift in (16, 8, 0))


class Suit:
    def __init__(self, ident):
        self.ident = ident
        self.parts = {name: [] for name in PIVOTS}
        self.recipe = {name: [] for name in PIVOTS}

    def record(self, part, kind, mat, **values):
        entry = [kind, mat.name]
        pivot = PIVOTS[part]
        for key, value in values.items():
            if key == 'center':
                value = [v - p for v, p in zip(value, pivot)]
            entry.append(q(value) if isinstance(value, (tuple, list)) else value)
        self.recipe[part].append(entry)

    def _finish(self, part, obj, mat, bevel=0.0, smooth=True):
        obj.data.materials.append(mat)
        if bevel:
            mod = obj.modifiers.new('bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = 'ANGLE'
        if smooth:
            bpy.ops.object.shade_smooth()
            # Keep hard edges on boxes readable.
            if hasattr(obj.data, 'use_auto_smooth'):
                obj.data.use_auto_smooth = True
                obj.data.auto_smooth_angle = math.radians(40)
        self.parts[part].append(obj)
        return obj

    def box(self, part, mat, center, size, rot=(0, 0, 0), bevel=.012):
        self.record(part, 'box', mat, center=center, size=size, rot=rot, bevel=round(bevel, 4))
        bpy.ops.mesh.primitive_cube_add(size=1, location=bl(center), rotation=bl_rot(rot))
        obj = bpy.context.object
        obj.scale = bl_scale(size)
        return self._finish(part, obj, mat, bevel)

    def ball(self, part, mat, center, radii, rot=(0, 0, 0), segments=24, rings=14):
        self.record(part, 'ball', mat, center=center, radii=radii, rot=rot, segments=segments, rings=rings)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1,
                                             location=bl(center), rotation=bl_rot(rot))
        obj = bpy.context.object
        obj.scale = bl_scale(radii)
        return self._finish(part, obj, mat)

    def cyl(self, part, mat, center, radius, depth, axis='y', rot=None, verts=20, bevel=.006, r2=None):
        self.record(part, 'cyl', mat, center=center, radius=radius, top=radius if r2 is None else r2,
                    depth=depth, axis=axis, rot=rot or (0, 0, 0), verts=verts)
        if r2 is None:
            bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=1, depth=1, location=bl(center),
                                                rotation=self._axis_rot(axis, rot))
            obj = bpy.context.object
            obj.scale = (radius, radius, depth)
        else:
            bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=r2, depth=depth,
                                            location=bl(center), rotation=self._axis_rot(axis, rot))
            obj = bpy.context.object
        return self._finish(part, obj, mat, bevel)

    @staticmethod
    def _axis_rot(axis, rot):
        # Blender cylinders run along their local Z. Map that onto a game axis.
        if axis == 'y':
            base = Vector((0, 0, 0))
        elif axis == 'x':
            base = Vector((0, math.pi / 2, 0))
        else:  # game z == blender -y
            base = Vector((math.pi / 2, 0, 0))
        if rot:
            base += Vector(bl_rot(rot))
        return tuple(base)

    def torus(self, part, mat, center, major, minor, axis='y', scale=(1, 1, 1)):
        # scale is given in Blender axes; store it in game axes.
        self.record(part, 'torus', mat, center=center, major=major, minor=minor, axis=axis,
                    scale=(scale[0], scale[2], scale[1]))
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                         minor_segments=10, location=bl(center), rotation=self._axis_rot(axis, None))
        obj = bpy.context.object
        obj.scale = scale
        return self._finish(part, obj, mat)

    def build(self):
        bpy.ops.object.select_all(action='DESELECT')
        joined = []
        for part, objects in self.parts.items():
            if not objects:
                continue
            for obj in objects:
                bpy.context.view_layer.objects.active = obj
                obj.select_set(True)
                for mod in list(obj.modifiers):
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                obj.select_set(False)
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.join()
            obj = bpy.context.object
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            bpy.context.scene.cursor.location = bl(PIVOTS[part])
            bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
            obj.name = part
            obj.data.name = part
            obj.select_set(False)
            joined.append(obj)
        return joined


# ---------------------------------------------------------------------------
# Shared anatomy helpers.

def legs(s, m, thigh_r=.095, shin_r=.08, knee=None, boot=None):
    for side, sfx in ((-1, 'L'), (1, 'R')):
        x = side * .112
        s.ball('thigh_' + sfx, m['under'], (x, .72, 0), (thigh_r, .22, thigh_r))
        s.ball('shin_' + sfx, m['under'], (x, .335, 0), (shin_r, .18, shin_r))
        if knee:
            knee(s, sfx, side, x)
        if boot:
            boot(s, sfx, side, x)


def arms(s, m, bicep_r=.074, fore_r=.064, glove_r=(.062, .073, .057)):
    for sfx in ('L', 'R'):
        s.ball('bicep_' + sfx, m['under'], (0, -.5, 0), (bicep_r, .53, bicep_r), segments=16, rings=10)
        s.ball('forearm_' + sfx, m['under'], (0, -.52, 0), (fore_r, .53, fore_r), segments=16, rings=10)
        s.ball('glove_' + sfx, m['trim'], (0, 0, 0), glove_r, segments=16, rings=10)


# ---------------------------------------------------------------------------
# 1. VANGUARD — heavy assault power armour (space-marine archetype).

def vanguard():
    s = Suit('vanguard')
    m = {
        'hull': material('hull', 0x454c2a, .3, .55),
        'trim': material('trim', 0xb48c42, .9, .32),
        'under': material('under', 0x1f2321, .1, .85),
        'metal': material('metal', 0x8b8f88, .85, .32),
        'glow': material('glow', 0xffa040, 0, .4, 0xff8a1f, 6),
        'visor': material('visor', 0x8c4c06, .55, .08, 0xff8a1f, .4),
        'stripe': material('stripe', 0xb88a1a, .2, .5),
    }
    # Torso — broad armoured cuirass.
    s.ball('upper', m['under'], (0, .19 + 1.09, .01), (.25, .31, .17))
    s.box('upper', m['hull'], (0, 1.33, -.09), (.47, .32, .16), bevel=.04)
    s.box('upper', m['hull'], (0, 1.16, -.07), (.36, .14, .14), bevel=.03)
    s.box('upper', m['trim'], (0, 1.33, -.175), (.16, .2, .02), bevel=.01)
    s.box('upper', m['glow'], (0, 1.36, -.188), (.11, .022, .01), bevel=0)
    s.box('upper', m['glow'], (0, 1.30, -.188), (.07, .018, .01), bevel=0)
    s.box('upper', m['stripe'], (0, 1.45, -.155), (.40, .04, .05), bevel=.01)
    # Massive pauldrons.
    for side in (-1, 1):
        s.ball('upper', m['trim'], (side * .25, 1.42, .01), (.11, .11, .11))
        s.box('upper', m['hull'], (side * .31, 1.47, 0), (.2, .1, .27), rot=(0, 0, side * -.35), bevel=.04)
        s.box('upper', m['hull'], (side * .35, 1.38, 0), (.12, .14, .25), rot=(0, 0, side * -.15), bevel=.03)
        s.box('upper', m['stripe'], (side * .40, 1.40, 0), (.02, .1, .26), rot=(0, 0, side * -.15), bevel=.004)
        s.box('upper', m['glow'], (side * .25, 1.52, -.12), (.07, .015, .012), rot=(0, 0, side * -.35), bevel=0)
    # Reactor backpack with twin exhausts.
    s.box('upper', m['trim'], (0, 1.3, .2), (.36, .38, .16), bevel=.04)
    for side in (-1, 1):
        s.cyl('upper', m['metal'], (side * .12, 1.36, .29), .055, .34)
        s.cyl('upper', m['glow'], (side * .12, 1.53, .29), .035, .02)
    s.box('upper', m['glow'], (0, 1.25, .285), (.04, .16, .01), bevel=0)
    # Helmet — rounded dome with wraparound amber visor and chin guard.
    s.ball('head', m['under'], (0, 1.52, .015), (.09, .07, .09))
    s.ball('head', m['hull'], (0, 1.66, .01), (.155, .165, .15))
    s.box('head', m['trim'], (0, 1.60, -.12), (.2, .1, .08), bevel=.025)
    s.ball('head', m['visor'], (0, 1.665, -.075), (.135, .05, .085))
    s.box('head', m['stripe'], (0, 1.78, -.02), (.04, .05, .27), bevel=.01)
    for side in (-1, 1):
        s.cyl('head', m['trim'], (side * .15, 1.64, .01), .045, .04, axis='x')
        s.cyl('head', m['glow'], (side * .172, 1.64, .01), .02, .01, axis='x')
    # Hips.
    s.ball('hips', m['under'], (0, .95, .005), (.22, .13, .13))
    s.box('hips', m['trim'], (0, 1.02, -.02), (.42, .08, .25), bevel=.02)
    s.box('hips', m['metal'], (0, 1.02, -.15), (.09, .06, .03))
    for side in (-1, 1):
        s.box('hips', m['hull'], (side * .17, .93, -.02), (.08, .16, .22), rot=(0, 0, side * .12), bevel=.02)

    def knee(s, sfx, side, x):
        s.box('thigh_' + sfx, m['hull'], (x, .74, -.08), (.15, .27, .06), bevel=.02)
        s.box('thigh_' + sfx, m['hull'], (x + side * .07, .74, 0), (.05, .24, .15), bevel=.015)
        s.box('shin_' + sfx, m['trim'], (x, .51, -.06), (.13, .11, .09), bevel=.03)
        s.box('shin_' + sfx, m['hull'], (x, .33, -.065), (.13, .26, .06), bevel=.02)
        s.box('shin_' + sfx, m['glow'], (x, .40, -.098), (.03, .06, .01), bevel=0)

    def boot(s, sfx, side, x):
        s.box('boot_' + sfx, m['trim'], (x, .11, -.04), (.16, .14, .22), bevel=.03)
        s.box('boot_' + sfx, m['under'], (x, .035, -.06), (.18, .06, .29), bevel=.02)
        s.box('boot_' + sfx, m['hull'], (x, .12, -.15), (.13, .09, .06), bevel=.02)

    legs(s, m, .1, .085, knee, boot)
    arms(s, m, .08, .07, (.075, .08, .068))
    for sfx in ('L', 'R'):
        s.ball('forearm_' + sfx, m['hull'], (0, -.6, 0), (.085, .34, .085), segments=16, rings=10)
        s.ball('bicep_' + sfx, m['hull'], (0, -.32, 0), (.08, .3, .08), segments=16, rings=10)
    return s, m


# ---------------------------------------------------------------------------
# 2. WRAITH — stealth infiltrator (cyber-ninja / recon archetype).

def wraith():
    s = Suit('wraith')
    m = {
        'hull': material('hull', 0x1c1d24, .55, .38),
        'trim': material('trim', 0x34313f, .7, .3),
        'under': material('under', 0x0c0c10, .05, .9),
        'metal': material('metal', 0x55536a, .9, .25),
        'glow': material('glow', 0xd06bff, 0, .4, 0xb43cff, 7),
        'visor': material('visor', 0x16051f, .95, .08, 0xc040ff, 1.2),
    }
    s.ball('upper', m['under'], (0, 1.28, .01), (.205, .29, .14))
    # Angular chest plate (two angled slabs).
    for side in (-1, 1):
        s.box('upper', m['hull'], (side * .085, 1.33, -.105), (.16, .26, .05), rot=(0, side * .35, 0), bevel=.008)
        s.box('upper', m['glow'], (side * .13, 1.28, -.14), (.012, .22, .01), rot=(0, side * .35, side * .25), bevel=0)
        # Slim angular shoulder blades.
        s.box('upper', m['trim'], (side * .235, 1.44, 0), (.13, .035, .2), rot=(0, 0, side * -.45), bevel=.006)
        s.ball('upper', m['under'], (side * .23, 1.41, .01), (.08, .085, .085))
    s.box('upper', m['hull'], (0, 1.12, -.07), (.25, .12, .1), bevel=.01)
    # Spine with trailing blade fins.
    s.box('upper', m['trim'], (0, 1.3, .15), (.1, .44, .06), bevel=.01)
    for i in range(4):
        s.box('upper', m['glow'], (0, 1.45 - i * .09, .185), (.05, .012, .012), bevel=0)
    for side in (-1, 1):
        s.box('upper', m['hull'], (side * .1, 1.36, .23), (.02, .32, .14), rot=(-.35, side * .25, 0), bevel=.004)
    # Helmet: elongated wedge with a narrow glowing slit.
    s.ball('head', m['under'], (0, 1.53, .015), (.07, .07, .075))
    s.ball('head', m['hull'], (0, 1.665, .03), (.12, .15, .16))
    s.box('head', m['hull'], (0, 1.64, -.075), (.2, .16, .14), rot=(.3, 0, 0), bevel=.03)
    s.box('head', m['visor'], (0, 1.675, -.146), (.19, .03, .02), bevel=.004)
    s.box('head', m['glow'], (0, 1.675, -.158), (.15, .008, .006), bevel=0)
    s.box('head', m['trim'], (0, 1.77, .06), (.03, .05, .3), rot=(.2, 0, 0), bevel=.01)
    for side in (-1, 1):
        s.box('head', m['trim'], (side * .118, 1.66, .07), (.02, .07, .18), rot=(0, side * .2, 0), bevel=.005)
        s.box('head', m['glow'], (side * .129, 1.66, .1), (.005, .01, .1), rot=(0, side * .2, 0), bevel=0)
    # Hips with a split tasset "coat tail".
    s.ball('hips', m['under'], (0, .95, .006), (.19, .12, .12))
    s.box('hips', m['trim'], (0, 1.01, -.02), (.36, .05, .23), bevel=.01)
    s.box('hips', m['glow'], (0, 1.01, -.135), (.06, .02, .01), bevel=0)
    for side in (-1, 1):
        s.box('hips', m['hull'], (side * .1, .8, .12), (.14, .34, .02), rot=(.25, 0, side * .12), bevel=.004)

    def knee(s, sfx, side, x):
        s.box('thigh_' + sfx, m['hull'], (x, .74, -.075), (.1, .26, .03), rot=(.05, 0, 0), bevel=.006)
        s.box('thigh_' + sfx, m['glow'], (x + side * .085, .72, 0), (.006, .24, .012), bevel=0)
        s.box('shin_' + sfx, m['hull'], (x, .5, -.07), (.09, .1, .05), rot=(-.4, 0, 0), bevel=.01)
        s.box('shin_' + sfx, m['hull'], (x, .32, -.06), (.085, .28, .03), bevel=.006)
        s.box('shin_' + sfx, m['glow'], (x, .32, -.077), (.01, .2, .006), bevel=0)

    def boot(s, sfx, side, x):
        s.box('boot_' + sfx, m['hull'], (x, .09, -.05), (.11, .12, .2), bevel=.015)
        s.box('boot_' + sfx, m['trim'], (x, .03, -.08), (.12, .04, .27), bevel=.01)
        s.box('boot_' + sfx, m['trim'], (x, .07, -.2), (.08, .05, .07), rot=(.4, 0, 0), bevel=.01)

    legs(s, m, .085, .07, knee, boot)
    arms(s, m, .066, .057, (.058, .07, .054))
    for sfx in ('L', 'R'):
        s.box('forearm_' + sfx, m['hull'], (0, -.62, -.02), (.1, .55, .1), bevel=.01)
        s.box('forearm_' + sfx, m['glow'], (0, -.62, -.072), (.012, .5, .006), bevel=0)
    return s, m


# ---------------------------------------------------------------------------
# 3. LIFELINE — sterile bio-containment corpsman (hazmat/medic archetype).

def lifeline():
    s = Suit('lifeline')
    m = {
        'hull': material('hull', 0xd9d6cf, .1, .45),
        'trim': material('trim', 0xb01d22, .2, .45),
        'under': material('under', 0xc9c6bd, .0, .78),
        'metal': material('metal', 0xa9b2b8, .8, .3),
        'glow': material('glow', 0x6ff3ff, 0, .4, 0x50d8f0, 5),
        'visor': material('visor', 0x050607, .3, .04),
        'face': material('face', 0x223038, .3, .5),
    }
    # Puffy pressurised torso with ribbed segments.
    s.ball('upper', m['under'], (0, 1.28, .01), (.25, .31, .18))
    s.ball('upper', m['hull'], (0, 1.33, -.03), (.25, .22, .16))
    for i in range(3):
        s.torus('upper', m['under'], (0, 1.13 + i * .05, 0), .2, .022, scale=(1.0, .7, 1))
    # Red cross chest badge.
    s.box('upper', m['trim'], (0, 1.37, -.185), (.11, .035, .02), bevel=.004)
    s.box('upper', m['trim'], (0, 1.37, -.185), (.035, .11, .02), bevel=.004)
    # Collar ring for the dome.
    s.torus('upper', m['metal'], (0, 1.55, -.003), .14, .03)
    for side in (-1, 1):
        s.ball('upper', m['hull'], (side * .25, 1.42, .01), (.12, .11, .12))
        s.box('upper', m['trim'], (side * .3, 1.45, 0), (.025, .08, .12), rot=(0, 0, side * -.6), bevel=.004)
    # Twin medical canisters + hoses.
    s.box('upper', m['hull'], (0, 1.3, .2), (.3, .36, .1), bevel=.03)
    for side in (-1, 1):
        s.cyl('upper', m['metal'], (side * .085, 1.3, .27), .065, .38)
        s.cyl('upper', m['glow'], (side * .085, 1.3, .27), .068, .1, verts=24, bevel=0)
        s.ball('upper', m['metal'], (side * .085, 1.49, .27), (.065, .03, .065))
        s.cyl('upper', m['under'], (side * .16, 1.43, .1), .016, .22, rot=(.6, 0, side * .4))
    # White helmet shell, glossy black visor with cyan eye strips, red beacon.
    s.ball('head', m['hull'], (0, 1.66, .012), (.162, .165, .167), segments=32, rings=18)
    s.ball('head', m['visor'], (0, 1.68, -.04), (.14, .075, .13), segments=32, rings=18)
    for side in (-1, 1):
        s.box('head', m['glow'], (side * .05, 1.672, -.168), (.06, .012, .01), bevel=.002)
    s.box('head', m['hull'], (0, 1.58, -.15), (.085, .06, .05), bevel=.015)
    s.cyl('head', m['trim'], (0, 1.84, .01), .04, .03)
    s.cyl('head', m['glow'], (0, 1.86, .01), .025, .02)
    for side in (-1, 1):
        s.cyl('head', m['metal'], (side * .165, 1.62, .01), .035, .04, axis='x')
    # Hips.
    s.ball('hips', m['under'], (0, .95, .006), (.22, .14, .14))
    s.torus('hips', m['trim'], (0, 1.0, -.01), .2, .028, scale=(1.05, .7, 1))
    s.box('hips', m['hull'], (.16, .93, -.06), (.08, .1, .08), bevel=.02)
    s.box('hips', m['trim'], (.16, .93, -.102), (.04, .012, .004), bevel=0)
    s.box('hips', m['trim'], (.16, .93, -.102), (.012, .04, .004), bevel=0)

    def knee(s, sfx, side, x):
        s.ball('thigh_' + sfx, m['hull'], (x, .74, -.01), (.1, .19, .1))
        s.torus('thigh_' + sfx, m['trim'], (x, .62, 0), .09, .018)
        s.ball('shin_' + sfx, m['hull'], (x, .5, -.03), (.08, .07, .08))
        s.ball('shin_' + sfx, m['hull'], (x, .32, 0), (.085, .15, .085))

    def boot(s, sfx, side, x):
        s.ball('boot_' + sfx, m['trim'], (x, .09, -.06), (.09, .08, .15))
        s.box('boot_' + sfx, m['under'], (x, .03, -.06), (.16, .05, .28), bevel=.02)

    legs(s, m, .1, .085, knee, boot)
    arms(s, m, .08, .07, (.068, .078, .062))
    for sfx in ('L', 'R'):
        s.ball('forearm_' + sfx, m['hull'], (0, -.55, 0), (.078, .36, .078), segments=16, rings=10)
        s.torus('forearm_' + sfx, m['trim'], (0, -.9, 0), .07, .016, scale=(1, 1, 1))
        s.ball('bicep_' + sfx, m['hull'], (0, -.45, 0), (.082, .35, .082), segments=16, rings=10)
    return s, m


# ---------------------------------------------------------------------------
# 4. BATHYSPHERE — brass deep-dive pressure suit (retro diving archetype).

def bathysphere():
    s = Suit('bathysphere')
    m = {
        'hull': material('hull', 0xa85c34, .9, .34),
        'trim': material('trim', 0xb44a18, .3, .52),
        'under': material('under', 0x24302a, .05, .85),
        'metal': material('metal', 0x4a4440, .9, .45),
        'glow': material('glow', 0x70fff0, 0, .4, 0x2fe6d6, 5),
        'visor': material('visor', 0x0a2a2c, .8, .06, 0x2fe6d6, 1.4),
    }
    s.ball('upper', m['under'], (0, 1.28, .01), (.26, .3, .18))
    # Barrel-shaped chest with riveted bands.
    s.cyl('upper', m['trim'], (0, 1.3, -.01), .24, .36, verts=28)
    for y in (1.15, 1.45):
        s.torus('upper', m['hull'], (0, y, -.01), .24, .022)
    for i in range(8):
        a = i / 8 * math.tau
        s.ball('upper', m['metal'], (math.sin(a) * .262, 1.45, -.01 + math.cos(a) * .262), (.012, .012, .012), segments=8, rings=6)
    s.cyl('upper', m['glow'], (0, 1.3, -.24), .05, .02, axis='z')
    s.torus('upper', m['hull'], (0, 1.3, -.245), .055, .012, axis='z')
    # Heavy breastplate collar.
    s.cyl('upper', m['hull'], (0, 1.53, -.003), .23, .07, verts=28, r2=.17)
    for side in (-1, 1):
        s.ball('upper', m['hull'], (side * .26, 1.42, .01), (.12, .12, .12))
    # Big horizontal air tank on the back.
    s.cyl('upper', m['metal'], (0, 1.36, .23), .1, .44, axis='x', verts=24)
    for side in (-1, 1):
        s.ball('upper', m['hull'], (side * .22, 1.36, .23), (.03, .1, .1))
    s.cyl('upper', m['trim'], (0, 1.22, .22), .04, .3, axis='x')
    s.cyl('upper', m['under'], (.14, 1.5, .13), .022, .22, rot=(.9, 0, 0))
    # Round diving helmet with front + side portholes and bolt ring.
    s.ball('head', m['hull'], (0, 1.67, .005), (.18, .18, .18), segments=32, rings=18)
    s.cyl('head', m['visor'], (0, 1.665, -.165), .085, .04, axis='z', verts=28)
    s.torus('head', m['metal'], (0, 1.665, -.18), .09, .018, axis='z')
    for i in range(3):
        s.box('head', m['metal'], (0, 1.665 + (i - 1) * .055, -.19), (.17, .008, .008), bevel=0)
    for side in (-1, 1):
        s.cyl('head', m['visor'], (side * .17, 1.67, .0), .05, .03, axis='x')
        s.torus('head', m['metal'], (side * .18, 1.67, 0), .055, .012, axis='x')
    s.cyl('head', m['glow'], (0, 1.86, .0), .03, .03)
    s.cyl('head', m['metal'], (0, 1.84, .0), .05, .02)
    s.torus('head', m['metal'], (0, 1.53, .005), .15, .025)
    for i in range(10):
        a = i / 10 * math.tau
        s.ball('head', m['hull'], (math.sin(a) * .15, 1.545, .005 + math.cos(a) * .15), (.014, .014, .014), segments=8, rings=6)
    # Hips with weight belt.
    s.ball('hips', m['under'], (0, .95, .006), (.23, .14, .14))
    s.cyl('hips', m['trim'], (0, 1.01, -.01), .225, .07, verts=28)
    for i in range(6):
        a = (i / 6 - .5) * math.pi * 1.2
        s.box('hips', m['metal'], (math.sin(a) * .23, 1.01, -.01 - math.cos(a) * .23), (.06, .08, .03), rot=(0, -a, 0), bevel=.01)

    def knee(s, sfx, side, x):
        for y in (.6, .78):
            s.torus('thigh_' + sfx, m['hull'], (x, y, 0), .095, .015)
        s.ball('shin_' + sfx, m['hull'], (x, .51, -.02), (.09, .09, .09))
        s.torus('shin_' + sfx, m['hull'], (x, .3, 0), .085, .015)

    def boot(s, sfx, side, x):
        s.box('boot_' + sfx, m['hull'], (x, .1, -.05), (.17, .14, .26), bevel=.035)
        s.box('boot_' + sfx, m['metal'], (x, .03, -.05), (.19, .06, .3), bevel=.02)
        s.cyl('boot_' + sfx, m['glow'], (x, .12, -.183), .018, .01, axis='z')

    legs(s, m, .105, .09, knee, boot)
    arms(s, m, .085, .075, (.08, .085, .07))
    for sfx in ('L', 'R'):
        s.ball('bicep_' + sfx, m['under'], (0, -.5, 0), (.088, .5, .088), segments=16, rings=10)
        s.torus('forearm_' + sfx, m['hull'], (0, -.92, 0), .085, .022)
        s.torus('forearm_' + sfx, m['hull'], (0, -.35, 0), .075, .014)
    return s, m


SUITS = [vanguard, wraith, lifeline, bathysphere]


def export(objects, ident):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, ident + '_recipe.glb'), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_texcoords=False, export_normals=True,
        export_materials='EXPORT', export_cameras=False, export_lights=False,
    )


def portrait(objects, ident):
    """Pose arm segments at rest and render a portrait for the picker card."""
    by = {obj.name: obj for obj in objects}
    poses = {
        'L': ((-.245, 1.422, .008), (-.31, 1.13, -.03), (-.30, .87, -.06)),
        'R': ((.245, 1.422, .008), (.31, 1.13, -.03), (.30, .87, -.06)),
    }
    for sfx, (shoulder, elbow, wrist) in poses.items():
        for name, a, b in (('bicep_' + sfx, shoulder, elbow), ('forearm_' + sfx, elbow, wrist)):
            obj = by[name]
            start, end = bl(a), bl(b)
            direction = end - start
            obj.location = start
            obj.rotation_mode = 'QUATERNION'
            obj.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(direction.normalized())
            obj.scale = (1, 1, direction.length)
        by['glove_' + sfx].location = bl(wrist)

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
    scene.cycles.device = 'CPU'
    scene.render.resolution_x = 360
    scene.render.resolution_y = 480
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Filmic' if 'Filmic' in [v.identifier for v in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.06, .03, .03, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    scene.world = world

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 60
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = bl((1.25, 1.35, -3.6))
    direction = bl((0, 1.0, 0)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam

    def light(name, pos, energy, color, size=1.5):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = bl(pos)
        obj.rotation_euler = (bl((0, 1.1, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    light('key', (2.2, 2.6, -2.4), 260, (1, .93, .85))
    light('rim', (-2.2, 2.0, 2.0), 320, (.55, .8, 1.0))
    light('fill', (-2.5, .8, -2.0), 70, (1, .55, .5))
    scene.render.filepath = os.path.join(PORTRAITS, ident + '.png')
    bpy.ops.render.render(write_still=True)


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for factory in SUITS:
        if only and factory.__name__ not in only:
            continue
        reset()
        MATERIALS.clear()
        suit, _ = factory()
        RECIPE[suit.ident] = {
            'materials': dict(MATERIALS),
            'parts': {name: items for name, items in suit.recipe.items() if items},
        }
        objects = suit.build()
        export(objects, suit.ident)
        portrait(objects, suit.ident)
        print('Built suit', suit.ident, sum(len(o.data.polygons) for o in objects), 'faces')
    if not only:
        def compact(value):
            text = json.dumps(value, separators=(',', ':'))
            text = re.sub(r'(?<=[\[,:])(-?\d+)\.0(?=[,\]}])', r'\1', text)  # 1.0 -> 1
            text = re.sub(r'(?<=[\[,:])(-?)0\.', r'\1.', text)  # 0.25 -> .25
            return re.sub(r'"(\w+)":', r'\1:', text)  # unquoted keys

        lines = ['{']
        for ident, suit in RECIPE.items():
            lines.append('  %s: {' % ident)
            lines.append('    materials: %s,' % compact(suit['materials']))
            lines.append('    parts: {')
            for part, items in suit['parts'].items():
                lines.append('      %s: [' % part)
                lines.extend('        %s,' % compact(item) for item in items)
                lines.append('      ],')
            lines.append('    },')
            lines.append('  },')
        lines.append('}')
        text = '\n'.join(lines)
        with open(os.path.join(ROOT, 'dist', 'suit-models.mjs'), 'w') as handle:
            handle.write('// Generated by tools/suits/build_suits.py in Blender. Do not edit by hand.\n')
            handle.write('// Per suit: materials, and for each rig joint a list of primitives:\n')
            handle.write('// [kind, material, center relative to the joint pivot, ...shape parameters].\n')
            handle.write('export const SUIT_MODELS = ' + text + ';\n')


main()
