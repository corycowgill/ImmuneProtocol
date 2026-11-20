"""Models the five weapon bodies in Blender and exports them for the game.

blender -b -P tools/weapons/build_weapons.py -- [weapon ...] [--render]

Each weapon is hard-surface modeled in the game's own coordinates (x to the left/right,
y up, z toward the stock, metres): sculpted side profiles extruded across the gun,
cross-sections extruded along it, lathed round parts, and boolean cuts for ports,
vents, slots and serrations. Every part is bevelled and given weighted normals, so
flat faces stay flat and edges catch a rim of light.

Ambient occlusion and a curvature edge-wear mask are baked into one texture atlas
per weapon, dist/assets/weapons/<weapon>-weathering.webp (R occlusion, G worn
edges), through a second UV layer. Materials are named after the
roles the game's weapon kit uses (shell, steel, dark, edge, rubber, accent, glass,
cellGlass, shellCasing, brass), so finishes, skins and accent colours keep working.

The export, dist/assets/weapons/<weapon>.glb, holds two nodes: `body` replaces the
procedural body, and `bolt` the moving part (slide, pump, bolt, charging handle).
Part-slot variants (barrels, muzzles, optics, receivers, magazines) stay procedural
in dist/arsenal-models.mjs and carbine.mjs, which also define where they mount.
"""
import math
import os
import shutil
import subprocess
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'dist', 'assets', 'weapons')
WORK = os.path.join(HERE, 'work')
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

# Preview colours only; the game swaps in its own materials by name.
MATERIALS = {
    'shell': ((.74, .7, .62), 0, .55),
    'steel': ((.42, .44, .46), .9, .38),
    'dark': ((.12, .13, .14), .55, .45),
    'edge': ((.6, .62, .62), 1, .25),
    'rubber': ((.05, .05, .055), 0, .85),
    'accent': ((.3, .9, .5), 0, .3),
    'glass': ((.3, .5, .45), 0, .05),
    'cellGlass': ((.3, .55, .45), 0, .08),
    'shellCasing': ((.7, .12, .1), .2, .45),
    'brass': ((.8, .6, .3), .9, .3),
}


def to_b(x, y, z):
    """Game (x, y, z) to Blender: the glTF exporter maps Blender (x, y, z) to (x, z, -y)."""
    return Vector((x, -z, y))


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    color, metal, rough = MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if name == 'accent':
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = 2
    return mat


class Kit:
    """Builds the parts of one node (`body` or `bolt`) of one weapon."""

    def __init__(self, weapon, node):
        self.weapon = weapon
        self.root = bpy.data.objects.get(weapon + ':' + node) or bpy.data.objects.new(weapon + ':' + node, None)
        if self.root.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(self.root)
        self.root['node'] = node
        self.count = 0

    def _object(self, bm, mat, bevel, segments, angle, cuts, smooth):
        self.count += 1
        mesh = bpy.data.meshes.new('%s_%d' % (self.root.name, self.count))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = self.root
        obj.data.materials.append(material(mat))
        cutters = [c for c in cuts if c is not None]
        if cutters:
            if len(cutters) > 1:
                joined = join(cutters)
            else:
                joined = cutters[0]
            mod = obj.modifiers.new('cut', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.solver = 'EXACT'
            # Cutters overlap each other once joined; let the solver resolve that.
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = joined
            obj['cutter'] = joined.name
        if bevel:
            mod = obj.modifiers.new('bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = segments
            mod.limit_method = 'ANGLE'
            mod.angle_limit = math.radians(angle)
            mod.use_clamp_overlap = True
            mod.miter_outer = 'MITER_ARC'
        obj['smooth'] = smooth
        return obj

    def profile(self, points, width, mat, x=0, radius=.004, bevel=.0018, segments=3, cuts=(), steps=6, angle=40):
        """A side silhouette, (z, y) points with optional per-corner radius, extruded across x."""
        bm = bmesh.new()
        pts = rounded(points, radius, steps)
        front = [bm.verts.new(to_b(x - width / 2, y, z)) for z, y in pts]
        face = bm.faces.new(front)
        geom = bmesh.ops.extrude_face_region(bm, geom=[face])['geom']
        bmesh.ops.translate(bm, vec=Vector((width, 0, 0)), verts=[g for g in geom if isinstance(g, bmesh.types.BMVert)])
        return self._object(bm, mat, bevel, segments, angle, cuts, False)

    def section(self, points, z0, z1, mat, radius=.003, bevel=.0015, segments=3, cuts=(), steps=5, angle=40):
        """A cross-section, (x, y) points, extruded along the gun from z0 to z1."""
        bm = bmesh.new()
        pts = rounded(points, radius, steps)
        front = [bm.verts.new(to_b(x, y, z0)) for x, y in pts]
        face = bm.faces.new(front)
        geom = bmesh.ops.extrude_face_region(bm, geom=[face])['geom']
        bmesh.ops.translate(bm, vec=to_b(0, 0, z1 - z0), verts=[g for g in geom if isinstance(g, bmesh.types.BMVert)])
        return self._object(bm, mat, bevel, segments, angle, cuts, False)

    def box(self, center, size, mat, bevel=.0015, segments=3, cuts=(), rotate=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        sx, sy, sz = size
        bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
        if rotate:
            axis, angle = rotate
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(angle, 4, axis_b(axis)))
        bmesh.ops.translate(bm, vec=to_b(*center), verts=bm.verts)
        return self._object(bm, mat, bevel, segments, 40, cuts, False)

    def lathe(self, profile, mat, center=(0, 0), axis='z', segments=40, bevel=0, cuts=(), smooth=True):
        """Round part from (radius, position) pairs along the game z (or x/y) axis."""
        bm = bmesh.new()
        rings = []
        for radius, along in profile:
            ring = []
            for i in range(segments):
                a = i / segments * math.tau
                u, v = math.cos(a) * radius, math.sin(a) * radius
                if axis == 'z':
                    p = (center[0] + u, center[1] + v, along)
                elif axis == 'x':
                    p = (along, center[0] + u, center[1] + v)
                else:
                    p = (center[0] + u, along, center[1] + v)
                ring.append(bm.verts.new(to_b(*p)))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                bm.faces.new((a[i], a[j], b[j], b[i]))
        for ring in (rings[0], rings[-1]):
            bm.faces.new(ring)
        return self._object(bm, mat, bevel, 2, 40, cuts, smooth)

    def tube(self, radius, z0, z1, mat, center=(0, 0), axis='z', segments=36, chamfer=.0012, cuts=()):
        c = min(chamfer, radius * .3)
        profile = [(radius - c, z0), (radius, z0 + c), (radius, z1 - c), (radius - c, z1)]
        return self.lathe(profile, mat, center, axis, segments, 0, cuts)


def axis_b(axis):
    return {'x': Vector((1, 0, 0)), 'y': Vector((0, 0, 1)), 'z': Vector((0, -1, 0))}[axis]


def rounded(points, radius, steps):
    """Fillets each corner of a polygon; a point's optional third value overrides the radius."""
    out = []
    n = len(points)
    for i, p in enumerate(points):
        r = p[2] if len(p) > 2 else radius
        a, b, c = Vector(points[i - 1][:2]), Vector(p[:2]), Vector(points[(i + 1) % n][:2])
        if r <= 0 or (a - b).length < 1e-6 or (c - b).length < 1e-6:
            out.append(b)
            continue
        d1, d2 = (a - b).normalized(), (c - b).normalized()
        angle = d1.angle(d2)
        if angle > math.pi - 1e-3:
            out.append(b)
            continue
        t = min(r / math.tan(angle / 2), (a - b).length * .48, (c - b).length * .48)
        p1, p2 = b + d1 * t, b + d2 * t
        for k in range(steps + 1):
            s = k / steps
            out.append(p1 * (1 - s) ** 2 + b * 2 * s * (1 - s) + p2 * s * s)
    clean = []
    for p in out:
        if not clean or (p - clean[-1]).length > 1e-5:
            clean.append(p)
    if (clean[0] - clean[-1]).length < 1e-5:
        clean.pop()
    return [tuple(p) for p in clean]


# Cutters live outside any weapon node and are deleted after the booleans are applied.
def cutter_box(center, size, rotate=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    sx, sy, sz = size
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    if rotate:
        axis, angle = rotate
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(angle, 4, axis_b(axis)))
    bmesh.ops.translate(bm, vec=to_b(*center), verts=bm.verts)
    return _cutter(bm)


def cutter_slot(center, length, height, depth, axis='z'):
    """A rounded slot (stadium) cut sideways into a part, `depth` deep across x."""
    bm = bmesh.new()
    r = height / 2
    pts = []
    for k in range(9):
        a = math.pi / 2 + k / 8 * math.pi
        pts.append((-length / 2 + r + math.cos(a) * r, math.sin(a) * r))
    for k in range(9):
        a = -math.pi / 2 + k / 8 * math.pi
        pts.append((length / 2 - r + math.cos(a) * r, math.sin(a) * r))
    cx, cy, cz = center
    if axis == 'z':
        verts = [bm.verts.new(to_b(cx - depth / 2, cy + v, cz + u)) for u, v in pts]
        shift = Vector((depth, 0, 0))
    else:  # a slot running up the part
        verts = [bm.verts.new(to_b(cx - depth / 2, cy + u, cz + v)) for u, v in pts]
        shift = Vector((depth, 0, 0))
    face = bm.faces.new(verts)
    geom = bmesh.ops.extrude_face_region(bm, geom=[face])['geom']
    bmesh.ops.translate(bm, vec=shift, verts=[g for g in geom if isinstance(g, bmesh.types.BMVert)])
    return _cutter(bm)


def cutter_cylinder(center, radius, length, axis='x', segments=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=length)
    rot = {'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Identity(4), 'z': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=to_b(*center), verts=bm.verts)
    return _cutter(bm)


def cutter_profile(points, width, x=0, radius=.002):
    bm = bmesh.new()
    pts = rounded(points, radius, 4)
    verts = [bm.verts.new(to_b(x - width / 2, y, z)) for z, y in pts]
    face = bm.faces.new(verts)
    geom = bmesh.ops.extrude_face_region(bm, geom=[face])['geom']
    bmesh.ops.translate(bm, vec=Vector((width, 0, 0)), verts=[g for g in geom if isinstance(g, bmesh.types.BMVert)])
    return _cutter(bm)


def _cutter(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('cutter')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('cutter', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['is_cutter'] = True
    obj.hide_render = True
    return obj


def cutter_text(text, position, size, side=-1, depth=.0012, bold=False):
    """Letters standing on a side face (side -1 is the left, the side the player sees),
    reading from muzzle to stock. Used as a boolean cutter they engrave the face."""
    curve = bpy.data.curves.new('text', 'FONT')
    curve.body = text
    curve.size = size
    curve.extrude = depth
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.space_character = 1.08
    if bold:
        curve.offset = size * .03
    obj = bpy.data.objects.new('text', curve)
    bpy.context.scene.collection.objects.link(obj)
    # Text +X runs toward the stock, +Y up, and its face points out of the side.
    columns = ((0, -1, 0), (0, 0, 1), (side, 0, 0)) if side < 0 else ((0, 1, 0), (0, 0, 1), (side, 0, 0))
    rotation = Matrix((columns[0], columns[1], columns[2])).transposed().to_4x4()
    obj.matrix_world = Matrix.Translation(to_b(*position)) @ rotation
    select([obj])
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.view_layer.objects.active
    obj['is_cutter'] = True
    obj.hide_render = True
    return obj


def cutter_line(p0, p1, x, width=.0011, depth=.003):
    """A panel seam: a thin groove from p0 to p1 ((z, y) points) on the face at x."""
    (z0, y0), (z1, y1) = p0, p1
    length = math.hypot(z1 - z0, y1 - y0)
    angle = math.atan2(y1 - y0, z1 - z0)
    return cutter_box((x, (y0 + y1) / 2, (z0 + z1) / 2), (depth, width, length + width), rotate=('x', -angle))


def lever(k, position, length, angle, mat='edge', side=-1, width=.004):
    """A small control lever on a side face with its pivot screw."""
    x, y, z = position
    part = k.profile([(-.004, .0035), (length, .0025), (length + .002, 0), (length, -.0025), (-.004, -.0035)],
                     width, mat, x=x + side * width / 2, radius=.0015, bevel=.0006)
    place(part, (0, y, z), angle)
    k.lathe([(0, x + side * width), (.004, x + side * width), (.0045, x + side * (width + .0015)),
             (0, x + side * (width + .0015))], 'steel', center=(y, z), axis='x', segments=16)
    return part


def join(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def array(fn, count, step):
    """Calls fn(offset) count times and returns the results (cutters or parts)."""
    return [fn(i * step) for i in range(count)]


# ---------------------------------------------------------------------------
# Weapons. Coordinates match the procedural builders so hands, mounts, slot parts,
# stickers, decals and charms stay where the game expects them.
# ---------------------------------------------------------------------------

def pistol_grip(k, y=-.088, z=.047, angle=-.32, width=.078, mat='dark'):
    """An ergonomic grip with finger grooves and a palm swell, tilted back like the game's grip."""
    h = .07
    pts = [(-.044, h, .006), (.03, h, .006), (.05, .045, .02), (.054, -.01, .02), (.05, -.062, .012),
           (.034, -.07, .006), (-.036, -.07, .006), (-.042, -.045, .01), (-.035, -.032, .012),
           (-.045, -.015, .012), (-.037, -.002, .012), (-.047, .016, .012), (-.04, .03, .012), (-.048, .048, .01)]
    # Recesses on both sides take textured rubber panels.
    # Rifle grips get inset rubber panels; a pistol's narrow grip is textured polymer.
    panels = width > .06
    grip = k.profile(pts, width, mat, radius=.006, bevel=.007, segments=4,
                     cuts=[cutter_box((side * (width / 2), -.008, .006), (.005, .09, .058)) for side in (-1, 1)]
                     if panels else ())
    parts = [grip]
    for side in (-1, 1) if panels else ():
        parts.append(k.profile([(-.03, .046), (.032, .046), (.04, -.02), (.032, -.05), (-.024, -.05), (-.03, -.012)],
                               .004, 'rubber', x=side * (width / 2 - .0015), radius=.008, bevel=.0012))
    for part in parts:
        place(part, (0, y, z), angle)
    return parts


def place(obj, position, angle=0):
    """Moves a part built around the origin; `angle` matches the game's rotation.x."""
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler[0] = angle
    obj.location = to_b(*position)


def trigger_group(k, z_front=-.112, z_back=.0, y_bottom=-.13, y_top=-.075, width=.03, mat='steel'):
    """A trigger guard loop and a curved trigger blade."""
    guard = k.profile([(z_front, y_top, .004), (z_front + .004, y_bottom + .01, .012), (z_front + .02, y_bottom, .006),
                       (z_back, y_bottom, .004), (z_back + .01, y_top, .004)],
                      width, mat, radius=.006, bevel=.0016,
                      cuts=[cutter_profile([(z_front + .009, y_top + .01), (z_front + .012, y_bottom + .016),
                                            (z_front + .024, y_bottom + .009), (z_back - .006, y_bottom + .009),
                                            (z_back - .004, y_top + .01)], width + .02, radius=.006)])
    blade = k.profile([(-.026, -.076), (-.018, -.076), (-.016, -.092), (-.02, -.108), (-.03, -.116),
                       (-.034, -.112), (-.027, -.1), (-.025, -.088)], .008, 'steel', radius=.002, bevel=.0008)
    return guard, blade


def picatinny(k, z0, z1, y, width=.074, mat='dark', teeth='steel'):
    """A rail with a dovetail section and cross slots every 10 mm."""
    h = .016
    cuts = [cutter_box((0, y + h / 2 + .002, z), (width + .02, .007, .0052)) for z in
            frange(z0 + .008, z1 - .006, .0102)]
    return k.section([(-width / 2 + .006, y - h / 2, .001), (width / 2 - .006, y - h / 2, .001),
                      (width / 2 - .006, y - .002, 0), (width / 2, y + .002, .001), (width / 2 - .004, y + h / 2, .001),
                      (-width / 2 + .004, y + h / 2, .001), (-width / 2, y + .002, .001), (-width / 2 + .006, y - .002, 0)],
                     z0, z1, mat, radius=.001, bevel=.0008, cuts=cuts)


def frange(a, b, step):
    out = []
    v = a
    while v <= b + 1e-9:
        out.append(v)
        v += step
    return out


def screw(k, x, y, z, radius=.0055, mat='edge'):
    head = k.lathe([(0, x - .0015 * sign(x)), (radius * .85, x - .0015 * sign(x)), (radius, x),
                    (radius, x + .002 * sign(x)), (radius * .7, x + .003 * sign(x)), (0, x + .003 * sign(x))],
                   mat, center=(y, z), axis='x', segments=18,
                   cuts=[cutter_box((x + .003 * sign(x), y, z), (.004, radius * 1.6, .0012))])
    return head


def sign(v):
    return -1 if v < 0 else 1


def build_carbine():
    body = Kit('carbine', 'body')
    # Upper receiver: machined, with a forward taper, recessed side pockets and roll marks.
    cuts = [cutter_box((side * .0775, .022, z), (.006, .03, .05)) for side in (-1, 1) for z in (-.14, -.08)]
    cuts += [cutter_text('NC-7  NEEDLE CARBINE', (-.077, .054, -.045), .0062),
             cutter_line((-.19, .04), (.1, .04), -.077), cutter_line((-.19, .04), (.1, .04), .077)]
    body.profile([(-.19, .068, .006), (-.17, .076, .004), (.1, .076, .006), (.11, .05, .01), (.1, -.03, .004),
                  (-.19, -.03, .004)], .154, 'steel', radius=.004, bevel=.0022, cuts=cuts)
    # Lower receiver and magazine well, flared around the magazine, with maker and serial marks.
    cuts = [cutter_text('IMMUNE ARMS - BIO 5.7', (-.07, -.056, -.235), .0052),
            cutter_text('SN 0721-19', (-.07, -.046, -.03), .0042),
            cutter_line((-.155, -.022), (-.155, -.075), -.07)]
    body.profile([(-.31, -.022, .004), (.04, -.022, .004), (.04, -.065, .01), (-.155, -.075, .01), (-.17, -.09, .004),
                  (-.305, -.09, .004), (-.315, -.07, .008)], .14, 'dark', radius=.006, bevel=.0022, cuts=cuts)
    # Fire selector, magazine release and bolt catch on the left.
    lever(body, (-.07, -.036, -.006), .016, .45)
    body.lathe([(0, -.07), (.0055, -.07), (.0055, -.0745), (.004, -.0752), (0, -.0752)], 'edge',
               center=(-.052, -.145), axis='x', segments=18)
    lever(body, (-.07, -.062, -.163), .018, 1.45, mat='dark')
    # Handguard: a deep-chamfered core, a riser under the rail, vented metal side plates and a hand stop.
    body.section([(-.052, -.05, .012), (.052, -.05, .012), (.052, .026, .008), (-.052, .026, .008)],
                 -.535, -.27, 'dark', radius=.006, bevel=.0016)
    body.section([(-.042, .02), (.042, .02), (.04, .074, .003), (-.04, .074, .003)], -.5, -.19, 'dark', radius=.003,
                 bevel=.0012, cuts=[cutter_slot((side * .042, .05, -.46 + i * .05), .03, .01, .012)
                                    for side in (-1, 1) for i in range(5)])
    body.profile([(-.535, -.05), (-.505, -.05), (-.51, -.072, .004), (-.528, -.074, .004)], .036, 'dark',
                 radius=.003, bevel=.0012)
    for side in (-1, 1):
        vents = [cutter_slot((side * .071, .012, -.505 + i * .042), .03, .012, .03) for i in range(6)]
        body.profile([(-.557, -.043, .01), (-.541, .044, .006), (-.511, .056, .006), (-.298, .053, .006),
                      (-.262, .026, .01), (-.284, -.045, .006)], .012, 'steel', x=side * .071, radius=.004,
                     bevel=.0014, cuts=vents)
        body.profile([(-.536, -.042), (-.5, -.062, .008), (-.329, -.06, .008), (-.303, -.04)], .009, 'shell',
                     x=side * .0735, radius=.004, bevel=.0012)
        # Energy cell: a glowing core under a glass sleeve, held by machined collars.
        body.box((side * .073, -.009, -.226), (.014, .045, .19), 'dark', bevel=.003)
        body.tube(.011, -.294, -.15, 'cellGlass', center=(side * .091, -.002))
        body.tube(.0062, -.29, -.154, 'accent', center=(side * .091, -.002))
        for z in (-.3, -.288, -.156, -.144):
            body.tube(.0145, z - .0045, z + .0045, 'steel', center=(side * .091, -.002))
        for z in (-.32, -.145, .102):
            screw(body, side * .0905, .032, z)
        for i in range(3):
            body.box((side * .0935, .035, .032 + i * .019), (.006, .004, .014), 'accent', bevel=.0008)
    picatinny(body, -.494, -.014, .081)
    # Stock: sculpted polymer shell with panel seams over a dark core, cheek riser and a ribbed butt pad.
    seams = [cutter_line((z, .07), (z, -.02), side * .08) for side in (-1, 1) for z in (.075, .205)]
    body.profile([(-.03, .055, .01), (.18, .058, .02), (.27, .045, .02), (.3, .01, .01), (.285, -.012, .01),
                  (.02, -.012, .01)], .16, 'shell', radius=.008, bevel=.0035, segments=4, cuts=seams)
    body.profile([(.04, -.012, .01), (.31, -.012, .008), (.322, -.074, .006), (.09, -.074, .02), (.06, -.06, .01)],
                 .138, 'dark', radius=.008, bevel=.003,
                 cuts=[cutter_slot((-.07, -.043, .2), .07, .014, .02), cutter_slot((.07, -.043, .2), .07, .014, .02),
                       cutter_cylinder((-.069, -.06, .27), .0075, .006)])
    body.lathe([(0, -.0695), (.0058, -.0695), (.0058, -.0705), (0, -.0705)], 'steel', center=(-.06, .27), axis='x',
               segments=18)
    body.profile([(.07, .055), (.25, .055), (.255, .07, .006), (.08, .072, .006)], .11, 'dark', radius=.005,
                 bevel=.002)
    body.profile([(.09, .07), (.24, .07), (.24, .078, .004), (.09, .078, .004)], .092, 'rubber', radius=.003,
                 bevel=.0015)
    pad = [cutter_box((0, -.104 + i * .018, .352), (.2, .004, .02)) for i in range(6)]
    body.profile([(.31, .06, .01), (.346, .055, .01), (.352, -.07, .006), (.338, -.078, .006), (.322, -.072, .006)],
                 .148, 'rubber', radius=.006, bevel=.003, cuts=pad)
    pistol_grip(body)
    trigger_group(body)
    # Bolt: the dust cover and the charging handle, which move together.
    bolt = Kit('carbine', 'bolt')
    bolt.profile([(-.11, .072), (.008, .072), (.008, .052, .004), (-.11, .052, .004)], .1, 'dark', x=.02,
                 radius=.004, bevel=.0016,
                 cuts=[cutter_box((.02, .072, -.05 + i * .02), (.11, .004, .006)) for i in range(4)])
    bolt.profile([(-.09, .066), (-.048, .066), (-.048, .05, .004), (-.09, .05, .004)], .02, 'edge', x=-.067,
                 radius=.004, bevel=.0012)
    bolt.lathe([(0, -.077), (.009, -.077), (.011, -.083), (.011, -.093), (.008, -.096), (0, -.096)], 'dark',
               center=(.058, -.069), axis='x', segments=20)


def build_sniper():
    body = Kit('sniper', 'body')
    # Handguard: octagonal free-float tube with M-LOK slots and a full-length rail on a riser.
    slots = [cutter_slot((side * .059, -.012, -.59 + i * .056), .034, .009, .012) for side in (-1, 1)
             for i in range(5)]
    body.section([(-.059, -.04), (.059, -.04), (.059, .03), (.046, .044), (-.046, .044), (-.059, .03)],
                 -.63, -.29, 'shell', radius=.007, bevel=.0018, cuts=slots)
    body.section([(-.03, .04), (.03, .04), (.03, .05), (-.03, .05)], -.62, .02, 'dark', radius=.002, bevel=.001)
    picatinny(body, -.62, .02, .058, width=.07)
    # Round steel action on a chassis that flares into the magazine well; roll marks on the chassis.
    body.tube(.032, -.29, .062, 'steel', center=(0, .014),
              cuts=[cutter_box((.03, .03, -.02), (.03, .03, .07))])
    cuts = [cutter_text('LANCET  .338 BIO-MAG', (-.05, -.022, -.235), .0058),
            cutter_text('IMMUNE ARMS', (-.05, -.036, -.07), .0048),
            cutter_slot((-.05, .0, -.06), .05, .012, .006), cutter_slot((.05, .0, -.06), .05, .012, .006)]
    body.profile([(-.3, .012), (.075, .012), (.09, -.025, .01), (.06, -.052, .008), (-.122, -.052, .006),
                  (-.128, -.068, .004), (-.218, -.068, .004), (-.224, -.05, .006), (-.3, -.044, .006)],
                 .1, 'dark', radius=.005, bevel=.002, cuts=cuts)
    # Bolt shroud and cocking piece behind the action, and a magazine release paddle.
    body.lathe([(0, .06), (.03, .06), (.028, .075), (.022, .1), (.016, .104), (0, .104)], 'steel', center=(0, .014))
    body.tube(.008, .1, .118, 'dark', center=(0, .014))
    body.profile([(-.118, -.052), (-.104, -.052), (-.106, -.07, .003), (-.116, -.072, .003)], .03, 'edge',
                 radius=.002, bevel=.0008)
    # Skeleton stock: lightened polymer frame, adjustable cheek riser and butt pad with spacers.
    hole = [cutter_profile([(.15, .022), (.37, .028), (.39, -.03), (.33, -.05), (.18, -.022)], .1, radius=.012)]
    body.profile([(.07, .042, .01), (.36, .048, .02), (.43, .056, .012), (.44, .05, .006), (.44, -.098, .006),
                  (.415, -.104, .012), (.3, -.072, .02), (.13, -.048, .02), (.075, -.02, .01)], .058, 'shell',
                 radius=.01, bevel=.0028, segments=4, cuts=hole)
    body.profile([(.18, .045), (.33, .05), (.33, .068, .008), (.19, .066, .008)], .05, 'shell', radius=.006,
                 bevel=.0024)
    for z in (.21, .3):
        body.lathe([(0, -.027), (.0068, -.027), (.0068, -.036), (.005, -.038), (0, -.038)], 'edge',
                   center=(.058, z), axis='x', segments=20,
                   cuts=[cutter_box((-.038, .058, z), (.004, .009, .0015))])
    body.profile([(.437, .062), (.462, .062, .008), (.462, -.11, .008), (.437, -.11)], .075, 'rubber', radius=.006,
                 bevel=.003, cuts=[cutter_box((0, -.1 + i * .02, .462), (.1, .004, .008)) for i in range(9)])
    body.profile([(.434, .06), (.438, .06), (.438, -.108), (.434, -.108)], .077, 'edge', radius=.001, bevel=.0006)
    pistol_grip(body)
    trigger_group(body)
    # Folded bipod under the handguard.
    body.box((0, -.05, -.6), (.05, .016, .03), 'dark', bevel=.003)
    for side in (-1, 1):
        body.tube(.0055, -.6, -.36, 'steel', center=(side * .026, -.06))
        body.tube(.0075, -.43, -.38, 'dark', center=(side * .026, -.06))
        body.lathe([(0, -.36), (.009, -.36), (.01, -.35), (.006, -.342), (0, -.342)], 'rubber',
                   center=(side * .026, -.06))
    bolt = Kit('sniper', 'bolt')
    bolt.lathe([(0, .02), (.006, .02), (.006, .1), (.008, .106), (.0135, .112), (.015, .124), (.012, .134),
                (0, .136)], 'steel', center=(.016, .028), axis='x', segments=24)
    bolt.tube(.019, -.075, .02, 'steel', center=(.004, .016))


def build_shotgun():
    body = Kit('shotgun', 'body')
    # Receiver: milled steel with loading and ejection ports and roll marks.
    cuts = [cutter_box((0, -.06, -.12), (.07, .02, .12)), cutter_box((.06, .02, -.1), (.03, .03, .08)),
            cutter_text('BURST SCATTERGUN  12 GA', (-.06, -.022, -.115), .0062),
            cutter_line((-.25, .005), (.05, .005), -.06)]
    body.profile([(-.255, .036), (-.2, .036), (.04, .036), (.06, .02, .01), (.06, -.036, .01), (.045, -.058, .006),
                  (-.255, -.058, .004)], .12, 'dark', radius=.005, bevel=.002, cuts=cuts)
    # Polymer top cover with a sight channel.
    body.profile([(-.21, .034), (.05, .034), (.056, .046, .008), (.035, .062, .008), (-.19, .062, .008)], .127,
                 'shell', radius=.006, bevel=.0024,
                 cuts=[cutter_box((0, .064, -.08), (.016, .01, .24))])
    # Side saddle with five spare shells.
    body.profile([(-.185, .024), (-.045, .024), (-.045, -.034, .004), (-.185, -.034, .004)], .006, 'dark',
                 x=-.0635, radius=.004, bevel=.0012)
    for i in range(5):
        z = -.17 + i * .026
        body.lathe([(0, -.022), (.0105, -.022), (.0105, .024), (.0085, .028), (0, .028)], 'shellCasing',
                   center=(-.076, z), axis='y', segments=20)
        body.lathe([(0, -.036), (.0118, -.036), (.0118, -.033), (.0106, -.032), (.0106, -.022), (0, -.022)],
                   'brass', center=(-.076, z), axis='y', segments=20)
    # Magazine tube, knurled cap and barrel clamp.
    body.tube(.018, -.63, -.25, 'steel', center=(0, -.038))
    knurl = [cutter_box((math.cos(a) * .021, -.038 + math.sin(a) * .021, -.652), (.004, .004, .03), rotate=('z', a))
             for a in [i * math.tau / 16 for i in range(16)]]
    body.lathe([(0, -.672), (.016, -.672), (.02, -.668), (.02, -.636), (.018, -.63), (0, -.63)], 'dark',
               center=(0, -.038), cuts=knurl)
    body.profile([(-.61, .046), (-.59, .046), (-.59, -.06, .008), (-.61, -.06, .008)], .05, 'dark', radius=.006,
                 bevel=.002)
    # Stock: polymer with a raised comb, sling swivel, spacer and a ribbed recoil pad.
    body.profile([(.055, .03, .01), (.16, .036, .02), (.35, .032, .01), (.35, -.112, .008), (.24, -.1, .02),
                  (.12, -.064, .02), (.06, -.046, .01)], .08, 'shell', radius=.01, bevel=.003, segments=4,
                 cuts=[cutter_line((.12, .036), (.2, -.09), side * .04) for side in (-1, 1)])
    body.lathe([(0, -.115), (.004, -.115), (.004, -.102), (0, -.102)], 'steel', center=(0, .3), axis='y',
               segments=12)
    body.lathe([(.006, -.006), (.0095, -.006), (.0095, .006), (.006, .006)], 'steel', center=(-.124, .3),
               axis='x', segments=18)
    body.profile([(.348, .036), (.352, .036), (.352, -.114), (.348, -.114)], .082, 'edge', radius=.001, bevel=.0006)
    body.profile([(.352, .038), (.376, .038, .008), (.376, -.116, .008), (.352, -.116)], .084, 'rubber', radius=.006,
                 bevel=.003, cuts=[cutter_box((0, -.1 + i * .018, .376), (.1, .004, .008)) for i in range(8)])
    pistol_grip(body)
    trigger_group(body)
    body.lathe([(0, -.048), (.0055, -.048), (.0055, .048), (0, .048)], 'shellCasing', center=(-.07, .005),
               axis='x', segments=18)
    # Pump: a ribbed polymer forend on twin action bars.
    bolt = Kit('shotgun', 'bolt')
    bolt.section([(-.043, -.076), (.043, -.076), (.043, -.004), (-.043, -.004)], -.525, -.315, 'shell',
                 radius=.02, bevel=.002)
    for i in range(6):
        z = -.5 + i * .034
        bolt.section([(-.0445, -.0775), (.0445, -.0775), (.0445, -.0025), (-.0445, -.0025)], z, z + .01, 'rubber',
                     radius=.021, bevel=.0015)
    for side in (-1, 1):
        bolt.tube(.0032, -.34, -.25, 'steel', center=(side * .032, -.02))


def build_launcher():
    body = Kit('launcher', 'body')
    y = .045
    # Launch tube with a subtly swelled midsection, bolted bands and a flared venturi.
    body.lathe([(.064, -.59), (.066, -.585), (.066, -.1), (.0672, -.05), (.0672, .1), (.066, .15), (.066, .23),
                (.064, .232)], 'shell', center=(0, y), segments=56)
    for z in (-.5, -.02, .12):
        body.lathe([(.066, z - .011), (.0705, z - .009), (.0715, z - .006), (.0715, z + .006), (.0705, z + .009),
                    (.066, z + .011)], 'dark', center=(0, y), segments=56)
        for angle in (.55, -.55):
            for side in (-1, 1):
                screw(body, side * math.cos(angle) * .0718, y + math.sin(angle) * .0718, z, radius=.0032)
    body.lathe([(.066, .21), (.072, .23), (.08, .28), (.094, .34), (.097, .36), (.094, .368), (.084, .368),
                (.07, .33), (.06, .28)], 'dark', center=(0, y), segments=56)
    body.lathe([(0, .3), (.062, .3), (.062, .305), (0, .305)], 'rubber', center=(0, y), segments=40)
    # Heat shield with vents on the right and warning plates along the top.
    body.profile([(-.4, y + .05, .01), (-.1, y + .05, .01), (-.1, y - .05, .01), (-.4, y - .05, .01)], .014, 'dark',
                 x=.072, radius=.01, bevel=.002,
                 cuts=[cutter_slot((.072, y, -.37 + i * .045), .06, .01, .03, axis='y') for i in range(6)])
    for i in range(5):
        body.box((0, y + .067, -.32 + i * .03), (.04, .004, .02), 'rubber' if i % 2 else 'shellCasing',
                 bevel=.0008, rotate=('y', .5))
    # Carry handle, grips and the firing-control housing.
    body.profile([(-.03, y + .066), (.09, y + .066), (.09, y + .076, .008), (.07, y + .106, .012),
                  (-.01, y + .106, .012), (-.03, y + .076, .008)], .016, 'dark', radius=.006, bevel=.002,
                 cuts=[cutter_profile([(-.012, y + .076), (.072, y + .076), (.062, y + .094), (0, y + .094)], .05,
                                      radius=.008)])
    grip = body.profile([(-.022, .055), (.022, .055), (.026, -.04, .008), (.018, -.055, .008), (-.018, -.055, .008),
                         (-.024, -.035, .008), (-.02, -.02, .006), (-.026, -.005, .006), (-.02, .01, .006),
                         (-.026, .025, .006)], .04, 'dark', radius=.006, bevel=.004, segments=4)
    place(grip, (0, -.06, -.33), .15)
    body.box((0, -.015, -.33), (.045, .02, .06), 'steel', bevel=.002)
    body.profile([(-.08, -.005), (.04, -.005), (.04, -.045, .006), (-.08, -.045, .006)], .05, 'dark', radius=.006,
                 bevel=.002)
    body.profile([(.07, -.03), (.2, -.03), (.2, -.055, .008), (.07, -.055, .008)], .06, 'rubber', radius=.008,
                 bevel=.003)
    for z in (-.45, .17):
        body.lathe([(.007, -.006), (.0105, -.006), (.0105, .006), (.007, .006)], 'steel', center=(y - .075, z),
                   axis='x', segments=18)
    pistol_grip(body)
    trigger_group(body)
    bolt = Kit('launcher', 'bolt')
    bolt.profile([(.075, y + .04), (.125, y + .04), (.125, y + .058, .005), (.08, y + .06, .005)], .03, 'edge',
                 x=.055, radius=.004, bevel=.0012)


def build_pistol():
    body = Kit('pistol', 'body')
    # Frame: dust cover with an accessory rail, squared trigger guard and beavertail.
    cuts = [cutter_box((0, -.0235, -.155 + i * .022), (.06, .004, .006)) for i in range(3)]
    cuts += [cutter_profile([(-.078, -.023), (-.006, -.023), (-.006, -.06, .006), (-.07, -.06, .006)], .06,
                            radius=.004),
             cutter_text('SN 9-0421', (-.022, -.008, -.035), .0038)]
    body.profile([(-.172, -.026, .004), (-.172, .012, .004), (.07, .012, .004), (.082, .0, .01), (.07, -.02, .006),
                  (.01, -.022), (.0, -.066, .006), (-.084, -.066, .01), (-.09, -.03, .006), (-.12, -.026)],
                 .044, 'dark', radius=.004, bevel=.0016, cuts=cuts)
    lever(body, (-.022, .013, -.08), .03, -.03, mat='steel', width=.003)
    lever(body, (-.022, .006, -.12), .008, 1.4, mat='steel', width=.003)
    body.lathe([(0, -.022), (.005, -.022), (.005, -.0255), (0, -.0255)], 'steel', center=(-.012, -.003), axis='x',
               segments=16)
    body.lathe([(0, -.172), (.007, -.172), (.007, -.178), (0, -.178)], 'steel', center=(0, .006), segments=20)
    pistol_grip(body, y=-.078, z=.045, angle=-.24, width=.046)
    body.profile([(-.016, -.024), (-.01, -.024), (-.009, -.04), (-.013, -.052), (-.02, -.058), (-.024, -.055),
                  (-.018, -.046), (-.016, -.034)], .008, 'steel', radius=.002, bevel=.0008)
    # Barrel crown ahead of the slide.
    body.lathe([(.008, -.212), (.0135, -.21), (.014, -.205), (.014, -.19), (.008, -.19)], 'steel', center=(0, .028),
               segments=32)
    bolt = Kit('pistol', 'bolt')
    serrations = [cutter_box((side * .025, .034, .018 + i * .0042), (.007, .03, .0018), rotate=('x', -.25))
                  for side in (-1, 1) for i in range(9)]
    serrations += [cutter_box((side * .025, .031, -.17 + i * .0042), (.007, .024, .0018), rotate=('x', .25))
                   for side in (-1, 1) for i in range(5)]
    cuts = serrations + [cutter_box((.006, .058, -.026), (.032, .016, .042)),
                         cutter_cylinder((0, .028, -.195), .0095, .03, axis='z'),
                         cutter_text('STING  9x19 BIO', (-.025, .038, -.14), .0052)]
    bolt.profile([(-.195, .012), (.055, .012), (.055, .052, .004), (.05, .058, .004), (-.17, .058, .006),
                  (-.195, .046, .008)], .05, 'shell', radius=.004, bevel=.0018, cuts=cuts)
    bolt.box((.004, .051, -.026), (.024, .012, .038), 'steel', bevel=.0012)
    bolt.profile([(-.188, .058), (-.18, .058), (-.181, .066, .002), (-.187, .066, .002)], .005, 'dark',
                 radius=.0015, bevel=.0006)
    for side in (-1, 1):
        bolt.profile([(.042, .058), (.054, .058), (.054, .067, .002), (.044, .066, .002)], .01, 'dark',
                     x=side * .0105, radius=.0015, bevel=.0006)


WEAPONS = {'carbine': build_carbine, 'sniper': build_sniper, 'shotgun': build_shotgun,
           'launcher': build_launcher, 'pistol': build_pistol}


# ---------------------------------------------------------------------------
# Finishing: booleans, bevels and weighted normals applied; occlusion and edge wear
# baked into one texture atlas per weapon.
# ---------------------------------------------------------------------------

ATLAS = int(os.environ.get('WEAPON_ATLAS', 2048))
# The atlas keeps its top-right corner clear (full occlusion, no wear) for the
# procedural slot parts, which all point their weathering UV there.
ATLAS_FILL = .97


def finish(weapon):
    nodes = [o for o in bpy.data.objects if o.name.startswith(weapon + ':') and o.type == 'EMPTY']
    parts = [c for n in nodes for c in n.children if c.type == 'MESH']
    bpy.context.view_layer.update()
    for part in parts:
        select([part])
        for mod in list(part.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # Boolean cuts bring the cutters' empty material slots along; faces keep the part's own.
        for polygon in part.data.polygons:
            polygon.material_index = 0
        while len(part.data.materials) > 1:
            part.data.materials.pop()
    for obj in [o for o in bpy.data.objects if o.get('is_cutter')]:
        bpy.data.objects.remove(obj)
    for part in [p for p in parts if not p.data.polygons]:
        print('[weapons:%s] dropped %s: its cuts removed it entirely' % (weapon, part.name), flush=True)
        parts.remove(part)
        bpy.data.objects.remove(part)
    for part in parts:
        bm = bmesh.new()
        bm.from_mesh(part.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bm.to_mesh(part.data)
        bm.free()
        select([part])
        bpy.ops.object.shade_smooth()
        mod = part.modifiers.new('weighted', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        mod.weight = 100
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35), keep_sharp_edges=True)
        bpy.ops.object.modifier_apply(modifier='weighted')
        # UVMap: real-scale box projection for the kit's tiling grain textures.
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.cube_project(cube_size=.25, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        part.data.uv_layers.new(name='Weathering')
    # Weathering: one shared, non-overlapping atlas over every part of the weapon.
    select(parts)
    for part in parts:
        part.data.uv_layers.active = part.data.uv_layers['Weathering']
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=.002, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=.003, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    for part in parts:
        layer = part.data.uv_layers['Weathering']
        for item in layer.data:
            item.uv = item.uv * ATLAS_FILL
    return nodes, parts


def use_gpu(scene):
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = 'GPU'
                return
        except TypeError:
            continue


def bake_into(parts, image, material=None, kind='EMIT', samples=1):
    """Bakes every part into one image, optionally with a temporary material."""
    saved = {}
    targets = []
    for part in parts:
        saved[part.name] = [s.material for s in part.material_slots]
        mats = [material] if material else saved[part.name]
        for slot, mat in zip(part.material_slots, mats):
            slot.material = mat
    for mat in {s.material for p in parts for s in p.material_slots}:
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        mat.node_tree.nodes.active = node
        targets.append((mat, node))
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.render.bake.target = 'IMAGE_TEXTURES'
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = True
    select(parts)
    bpy.ops.object.bake(type=kind)
    for mat, node in targets:
        mat.node_tree.nodes.remove(node)
    for part in parts:
        for slot, mat in zip(part.material_slots, saved[part.name]):
            slot.material = mat


def wear_material():
    """Edge wear from curvature: where Cycles' rounded bevel normal leaves the true
    normal, an edge is near. Independent of how the faces are triangulated."""
    mat = bpy.data.materials.new('wear')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    bevel = nt.nodes.new('ShaderNodeBevel')
    bevel.samples = 16
    bevel.inputs['Radius'].default_value = .0016
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.inputs['From Min'].default_value = .995
    ramp.inputs['From Max'].default_value = .93
    emit = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bevel.outputs['Normal'], dot.inputs[0])
    nt.links.new(geo.outputs['Normal'], dot.inputs[1])
    nt.links.new(dot.outputs['Value'], ramp.inputs['Value'])
    nt.links.new(ramp.outputs['Result'], emit.inputs['Color'])
    nt.links.new(emit.outputs[0], out.inputs['Surface'])
    return mat


def bake(weapon, parts):
    import numpy as np
    scene = bpy.context.scene
    use_gpu(scene)
    scene.world = scene.world or bpy.data.worlds.new('bake')
    scene.world.color = (1, 1, 1)
    # A short occlusion reach puts contact shadow into grooves, seams and lettering.
    scene.world.light_settings.distance = .015
    for part in parts:
        part.data.uv_layers.active = part.data.uv_layers['Weathering']
    ao = bpy.data.images.new('ao', ATLAS, ATLAS, alpha=False)
    ao.colorspace_settings.name = 'Non-Color'
    bake_into(parts, ao, kind='AO', samples=128)
    edge = bpy.data.images.new('edge', ATLAS, ATLAS, alpha=False)
    edge.colorspace_settings.name = 'Non-Color'
    bake_into(parts, edge, material=wear_material(), samples=16)
    size = ATLAS * ATLAS * 4
    a = np.empty(size, np.float32)
    e = np.empty(size, np.float32)
    ao.pixels.foreach_get(a)
    edge.pixels.foreach_get(e)
    out = np.ones((ATLAS, ATLAS, 4), np.float32)
    out[..., 0] = a.reshape(ATLAS, ATLAS, 4)[..., 0]
    out[..., 1] = np.clip(e.reshape(ATLAS, ATLAS, 4)[..., 0], 0, 1)
    out[..., 2] = 0
    corner = int(ATLAS * ATLAS_FILL) + 2
    out[corner:, :, 0] = 1
    out[:, corner:, 0] = 1
    out[corner:, :, 1] = 0
    out[:, corner:, 1] = 0
    atlas = bpy.data.images.new('weathering', ATLAS, ATLAS, alpha=False)
    atlas.colorspace_settings.name = 'Non-Color'
    atlas.pixels.foreach_set(out.ravel())
    atlas.filepath_raw = os.path.join(OUT, weapon + '-weathering.webp')
    atlas.file_format = 'WEBP'
    scene.render.image_settings.quality = 90
    atlas.save()
    for part in parts:
        part.data.uv_layers.active = part.data.uv_layers['UVMap']


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def export(weapon, nodes, parts):
    # One mesh per material per node keeps draw calls low.
    for node in nodes:
        by_material = {}
        for part in [c for c in node.children if c.type == 'MESH']:
            by_material.setdefault(part.data.materials[0].name, []).append(part)
        for name, group in by_material.items():
            merged = join(group) if len(group) > 1 else group[0]
            merged.name = '%s_%s' % (node.get('node'), name)
    for node in nodes:
        node.name = node.get('node')
    keep = nodes + [c for n in nodes for c in n.children]
    select(keep)
    raw = os.path.join(WORK, weapon + '_raw.glb')
    bpy.ops.export_scene.gltf(
        filepath=raw, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT', export_vertex_color='NONE',
        export_animations=False, export_cameras=False, export_lights=False)
    final = os.path.join(OUT, weapon + '.glb')
    gltfpack = os.environ.get('GLTFPACK') or shutil.which('gltfpack')
    if gltfpack:
        command = ['node', gltfpack] if gltfpack.endswith('.js') else [gltfpack]
        # Unquantized positions keep object-space skin projection at real-world scale, and -kv
        # keeps both UV sets, which gltfpack would otherwise drop from untextured materials.
        subprocess.run([*command, '-i', raw, '-o', final, '-cc', '-noq', '-kn', '-km', '-kv'], check=True)
    else:
        shutil.copyfile(raw, final)
    tris = sum(len(p.data.polygons) for n in nodes for p in n.children if p.type == 'MESH')
    print('[weapons:%s] %d faces, %d bytes' % (weapon, tris, os.path.getsize(final)), flush=True)


def render(weapon):
    """A studio preview from the armory's camera angle, for review."""
    scene = bpy.context.scene
    for obj in [o for o in bpy.data.objects if o.type in ('CAMERA', 'LIGHT')]:
        bpy.data.objects.remove(obj)
    scene.cycles.samples = 64
    scene.render.resolution_x, scene.render.resolution_y = 1200, 600
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.03, .025, .025, 1)
    scene.world = world
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    lo = Vector([min((o.matrix_world @ Vector(c))[i] for o in meshes for c in o.bound_box) for i in range(3)])
    hi = Vector([max((o.matrix_world @ Vector(c))[i] for o in meshes for c in o.bound_box) for i in range(3)])
    center, size = (lo + hi) / 2, (hi - lo).length
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = center + to_b(-1.31, .42, -.89).normalized() * size * 1.9
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    for offset, energy, color in ((to_b(-2, 3, 1), 60, (1, .95, .88)), (to_b(1, .8, -1), 35, (.7, .85, 1)),
                                  (to_b(-1, -.5, 2), 15, (1, .8, .7))):
        light = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA'))
        light.data.energy = energy
        light.data.color = color
        light.data.size = 1.5
        light.location = center + offset
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    scene.render.filepath = os.path.join(WORK, weapon + '.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    preview = '--render' in args
    for weapon in [a for a in args if not a.startswith('--')] or list(WEAPONS):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        WEAPONS[weapon]()
        nodes, parts = finish(weapon)
        bake(weapon, parts)
        export(weapon, nodes, parts)
        if preview:
            render(weapon)
