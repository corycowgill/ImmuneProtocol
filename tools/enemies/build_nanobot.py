"""Blender-built Mega Nano Bot final boss: PBR atlas, runtime GLB and Cycles portrait.

blender -b -P tools/enemies/build_nanobot.py
A hovering armoured medical fortress that has hijacked a human brain as its processor.
The editable studio .blend and a larger render go to tools/enemies/work/nanobot, or to
NANOBOT_OUTPUT when that environment variable names a deliverable directory.

Conventions follow build_rogue_bot.py: Blender metres, z up, the machine facing -Y (the
laser cannon points -Y, which glTF's +Y-up export turns into +Z). The opaque hull is one
baked mesh named attack-membrane carrying the five shared morph targets and an Idle clip;
the dome, brain, pylon crystals, laser lens, missile pods and drone bay hatch are separate
named child meshes so the game can pulse, hide or recoil them. No online asset service or
extra runtime dependency is used, and the build is deterministic.
"""
import json
import math
import os
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'tools' / 'enemies' / 'work' / 'nanobot'
OUT = ROOT / 'dist' / 'assets' / 'enemies'
DELIVER = Path(os.environ.get('NANOBOT_OUTPUT', str(WORK)))
for directory in (WORK, OUT / 'portraits', DELIVER):
    directory.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for item in list(block):
        block.remove(item)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 8
scene.world.color = (.1, .1, .105)
scene.view_settings.view_transform = 'AgX'
noise.seed_set(4401)
TAU = math.tau
parts = []          # opaque pieces baked into the hull atlas
FRONT = -90.0       # degrees: -Y is forward


# ---------------------------------------------------------------- materials
def material(name, color, metallic, rough, emission=(0, 0, 0), grime=.35, strength=2):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    coords = nodes.new('ShaderNodeTexCoord')
    fine = nodes.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 145
    fine.inputs['Detail'].default_value = 3
    links.new(coords.outputs['Object'], fine.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .32
    ramp.color_ramp.elements[0].color = (*[c * .62 for c in color], 1)
    ramp.color_ramp.elements[1].position = .7
    ramp.color_ramp.elements[1].color = (*color, 1)
    links.new(fine.outputs['Fac'], ramp.inputs['Fac'])
    # Broad grime blotches and streaks: a sterile machine left running too long.
    blot = nodes.new('ShaderNodeTexNoise'); blot.inputs['Scale'].default_value = 7
    blot.inputs['Detail'].default_value = 6; blot.inputs['Roughness'].default_value = .62
    links.new(coords.outputs['Object'], blot.inputs['Vector'])
    blot_ramp = nodes.new('ShaderNodeValToRGB')
    blot_ramp.color_ramp.elements[0].position = .45; blot_ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    blot_ramp.color_ramp.elements[1].position = .72
    g = 1 - grime
    blot_ramp.color_ramp.elements[1].color = (g * .78, g * .72, g * .62, 1)
    links.new(blot.outputs['Fac'], blot_ramp.inputs['Fac'])
    mix = nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1
    links.new(ramp.outputs['Color'], mix.inputs['A']); links.new(blot_ramp.outputs['Color'], mix.inputs['B'])
    links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Color'].default_value = (*emission, 1)
    bsdf.inputs['Emission Strength'].default_value = strength if any(emission) else 0
    bevel = nodes.new('ShaderNodeBevel'); bevel.inputs['Radius'].default_value = .004; bevel.samples = 2
    links.new(bevel.outputs['Normal'], bsdf.inputs['Normal'])
    mat['metal'] = metallic; mat['emission'] = list(emission)
    return mat


def hazard(name, radial, count, a=(.42, .03, .02), b=(.03, .03, .03)):
    """Diagonal warning stripes, either around the z axis or along a flat panel."""
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    coords = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(coords.outputs['Object'], sep.inputs[0])
    if radial:
        grad = nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'RADIAL'
        links.new(coords.outputs['Object'], grad.inputs['Vector'])
        base = nodes.new('ShaderNodeMath'); base.operation = 'MULTIPLY'; base.inputs[1].default_value = count
        links.new(grad.outputs['Fac'], base.inputs[0])
    else:
        base = nodes.new('ShaderNodeMath'); base.operation = 'MULTIPLY'; base.inputs[1].default_value = count
        add_xy = nodes.new('ShaderNodeMath'); add_xy.operation = 'ADD'
        links.new(sep.outputs['X'], add_xy.inputs[0]); links.new(sep.outputs['Y'], add_xy.inputs[1])
        links.new(add_xy.outputs[0], base.inputs[0])
    tilt = nodes.new('ShaderNodeMath'); tilt.operation = 'MULTIPLY_ADD'
    tilt.inputs[1].default_value = count * (.35 if radial else 1)
    links.new(sep.outputs['Z'], tilt.inputs[0]); links.new(base.outputs[0], tilt.inputs[2])
    fract = nodes.new('ShaderNodeMath'); fract.operation = 'FRACT'; links.new(tilt.outputs[0], fract.inputs[0])
    ramp = nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position = 0; ramp.color_ramp.elements[0].color = (*a, 1)
    ramp.color_ramp.elements[1].position = .5; ramp.color_ramp.elements[1].color = (*b, 1)
    links.new(fract.outputs[0], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = .2; bsdf.inputs['Roughness'].default_value = .48
    bevel = nodes.new('ShaderNodeBevel'); bevel.inputs['Radius'].default_value = .003; bevel.samples = 2
    links.new(bevel.outputs['Normal'], bsdf.inputs['Normal'])
    mat['metal'] = .2; mat['emission'] = [0, 0, 0]
    return mat


def flat(name, color, emission, strength, rough=.2, metallic=0.0):
    """Untextured runtime material for the glowing separate parts."""
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic; bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Color'].default_value = (*emission, 1)
    bsdf.inputs['Emission Strength'].default_value = strength
    return mat


ivory = material('soiled sterile ceramic armour', (.56, .57, .54), .12, .4, grime=.58)
ivory2 = material('scuffed ceramic inlay', (.58, .60, .58), .15, .42, grime=.5)
titan = material('dark titanium chassis', (.085, .095, .10), .88, .34, grime=.2)
steel = material('machined steel', (.36, .38, .39), .92, .26, grime=.25)
recess = material('carbon recess and seals', (.016, .018, .02), .35, .5, grime=0)
brass = material('oxidised contact brass', (.40, .25, .10), .85, .32, grime=.3)
optic = material('hijacked red optics', (.30, .012, .008), .3, .16, (1, .03, .012), grime=0, strength=3)
warhead = material('red warhead paint', (.42, .025, .02), .25, .35, (.35, .0, .0), grime=.2)
telemetry = material('cyan containment telemetry', (.02, .25, .3), .4, .2, (.05, .75, .95), grime=0)
thrust = material('thruster plasma ring', (.5, .22, .05), .2, .3, (1, .42, .09), grime=0, strength=3)
core = material('thruster ion core', (.3, .5, .8), .1, .2, (.4, .75, 1), grime=0, strength=3)
amber = material('hangar work lights', (.5, .3, .05), .1, .3, (1, .55, .12), grime=0)
stripes = hazard('rim hazard stripes', True, 60)
stripes_flat = hazard('panel hazard stripes', False, 14)


# ---------------------------------------------------------------- geometry helpers
def basis(x, y, z, origin=(0, 0, 0)):
    x, y, z = Vector(x).normalized(), Vector(y).normalized(), Vector(z).normalized()
    rot = Matrix((x, y, z)).transposed()
    if rot.determinant() < 0:
        rot = Matrix((-x, y, z)).transposed()
    return Matrix.Translation(origin) @ rot.to_4x4()


def polar(deg, r, z=0.0):
    a = math.radians(deg)
    return Vector((math.cos(a) * r, math.sin(a) * r, z))


def radial_frame(deg, r, z):
    """Local x tangent, y up, z pointing radially out of the hull at that angle."""
    a = math.radians(deg)
    out = Vector((math.cos(a), math.sin(a), 0))
    tan = Vector((-math.sin(a), math.cos(a), 0))
    return basis(tan, (0, 0, 1), out, polar(deg, r, z))


DECK_SLOPE = math.atan(.655)


def deck_z(r):
    return .292 - (r - .54) * .655


def deck_frame(deg, r, lift=0.0):
    """Local x tangent, y up the sloped deck, z the deck's outward normal."""
    a = math.radians(deg)
    out = Vector((math.cos(a), math.sin(a), 0))
    tan = Vector((-math.sin(a), math.cos(a), 0))
    up = Vector((0, 0, 1))
    normal = out * math.sin(DECK_SLOPE) + up * math.cos(DECK_SLOPE)
    slope = -out * math.cos(DECK_SLOPE) + up * math.sin(DECK_SLOPE)
    return basis(tan, slope, normal, polar(deg, r, deck_z(r)) + normal * lift)


def make(name, bm, mat, groups=(), bevel=0.0, seg=2, smooth=34, part=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new(name, me); scene.collection.objects.link(obj)
    me.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('machined edge radii', 'BEVEL'); mod.width = bevel; mod.segments = seg
        mod.limit_method = 'ANGLE'; mod.angle_limit = math.radians(30)
        graph = bpy.context.evaluated_depsgraph_get()
        baked = bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
        obj.modifiers.clear(); old = obj.data; obj.data = baked; bpy.data.meshes.remove(old); baked.name = name
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.set_sharp_from_angle(angle=math.radians(smooth))
    for group in groups:
        obj.vertex_groups.new(name=group).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    if part:
        parts.append(obj)
    return obj


def bm_box(size, m=Matrix()):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts); bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def bm_cyl(r1, r2, depth, m=Matrix(), segs=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def bm_lathe(profile, m=Matrix(), segs=64, a0=None, a1=None):
    """Revolve a closed (r, z) polygon around z, fully or over [a0, a1] degrees with capped ends."""
    full = a0 is None
    bm = bmesh.new()
    count = segs if full else segs + 1
    start = 0 if full else math.radians(a0)
    span = TAU if full else math.radians(a1 - a0)
    rings = []
    for i in range(count):
        a = start + span * i / segs
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    n = len(profile)
    for i in range(segs):
        ra, rb = rings[i], rings[(i + 1) % count]
        for j in range(n):
            k = (j + 1) % n
            quad = [ra[j], rb[j], rb[k], ra[k]]
            try:
                bm.faces.new(quad)
            except ValueError:
                pass
    if not full:
        bm.faces.new(rings[0]); bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def bm_torus(major, minor, m=Matrix(), segs=32, sides=8):
    profile = [(major + minor * math.cos(TAU * i / sides), minor * math.sin(TAU * i / sides)) for i in range(sides)]
    return bm_lathe(profile, m, segs)


def bm_sweep(points, radius, sides=6, caps=True):
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    tangent = (pts[1] - pts[0]).normalized()
    normal = tangent.orthogonal().normalized()
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        normal = (normal - t * normal.dot(t)).normalized()
        binormal = t.cross(normal)
        rad = radius(i / (len(pts) - 1)) if callable(radius) else radius
        rings.append([bm.verts.new(p + (normal * math.cos(TAU * k / sides) + binormal * math.sin(TAU * k / sides)) * rad)
                      for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new([a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]])
    if caps:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bezier(p0, p1, p2, p3, steps):
    p0, p1, p2, p3 = map(Vector, (p0, p1, p2, p3))
    return [p0 * (1 - t) ** 3 + p1 * 3 * t * (1 - t) ** 2 + p2 * 3 * t * t * (1 - t) + p3 * t ** 3
            for t in (i / steps for i in range(steps + 1))]


def rx(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'X')


def ry(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Y')


def rz(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Z')


T = Matrix.Translation
ALONG_Y = rx(90)          # a z-axis primitive turned to lie along -Y/+Y
ALONG_X = ry(90)
PYLONS = (90.0, 210.0, 330.0)

# ---------------------------------------------------------------- hull: saucer fortress
# Dark titanium chassis under nine sloping ceramic deck plates; the seams between plates
# show the chassis, and the pylon mounts straddle three of the seams.
make('deck chassis', bm_lathe([(.44, .205), (.44, .272), (.79, .082), (.79, .045)], segs=64), titan, ('chassis',), 0)
for k in range(9):
    a0 = 90 + k * 40 + 1.1
    a1 = a0 + 40 - 2.2
    make('ceramic deck plate', bm_lathe([(.54, .255), (.54, .292), (.775, .138), (.805, .106), (.80, .086), (.77, .102)],
                                         segs=10, a0=a0, a1=a1), ivory, ('plates',), .007)
    if k % 2 == 0:
        make('raised deck inlay', bm_lathe([(.60, .243), (.60, .262), (.72, .184), (.72, .166)],
                                            segs=6, a0=a0 + 6, a1=a1 - 6), titan, ('plates',), .004, 1)
    else:
        for off in (-5, 5):
            m = deck_frame((a0 + a1) / 2 + off, .745, .004)
            make('red status slit', bm_box((.012, .05, .01), m), optic, ('plates',))
    for edge in (a0 + 2.4, a1 - 2.4):
        for r in (.575, .755):
            m = deck_frame(edge, r, .004)
            make('captive hex bolt', bm_cyl(.011, .011, .012, m, 6), steel, ('plates',), 0)
# Vent grilles on the flank plates and the rear.
for deg in (30.0, 150.0, 190.0, 350.0, 110.0, 70.0):
    m = deck_frame(deg, .67, .006)
    make('vent recess', bm_box((.15, .11, .012), m), recess, ('plates',), 0)
    for i in range(5):
        make('vent slat', bm_box((.135, .009, .016), m @ T((0, -.04 + i * .02, .004)) @ rx(-35)), titan, ('plates',), 0)
# Equatorial belt: machined steel band, hazard stripe ring and vent slots.
make('equatorial belt', bm_lathe([(.79, .085), (.845, .072), (.852, .052), (.852, -.065), (.845, -.085), (.79, -.095)], segs=64),
     steel, ('belt',), .006)
make('hazard band', bm_lathe([(.85, -.072), (.857, -.072), (.857, -.052), (.85, -.052)], segs=64), stripes, ('belt',), 0)
make('seal groove', bm_lathe([(.85, .036), (.856, .036), (.856, .044), (.85, .044)], segs=64), recess, ('belt',), 0)
for deg in list(np.linspace(-62, -36, 5)) + list(np.linspace(-144, -118, 5)) + list(np.linspace(38, 62, 4)) + list(np.linspace(118, 142, 4)):
    make('belt vent slot', bm_box((.022, .075, .012), radial_frame(float(deg), .852, -.005)), recess, ('belt',), 0)
# Lower hull and underside armour petals.
make('lower hull', bm_lathe([(0, -.08), (.80, -.08), (.80, -.11), (.66, -.27), (.54, -.335), (0, -.335)], segs=64), titan, ('lower',), 0)
for k in range(8):
    a0 = k * 45 + 22.5 + 1.5
    make('underside armour petal', bm_lathe([(.55, -.298), (.672, -.236), (.822, -.096), (.806, -.086), (.66, -.222), (.54, -.279)],
                                            segs=10, a0=a0, a1=a0 + 42), ivory, ('lower',), .006)
make('belly plate ring', bm_lathe([(.30, -.336), (.50, -.336), (.50, -.348), (.30, -.348)], segs=48), steel, ('lower',), 0)

# Dome collar, containment floor and brain socket (all inside or under the glass).
make('dome collar', bm_lathe([(.462, .262), (.565, .262), (.58, .295), (.55, .348), (.49, .352), (.462, .33)], segs=64), steel, ('collar',), .005)
make('collar shadow ring', bm_lathe([(.556, .30), (.568, .30), (.568, .315), (.556, .315)], segs=48), recess, ('collar',), 0)
for i in range(18):
    m = T(polar(i * 20 + 10, .525, .352)) @ rz(i * 20 + 10)
    make('collar bolt', bm_cyl(.012, .012, .012, m, 6), brass, ('collar',), 0)
make('containment floor', bm_lathe([(0, .30), (.47, .30), (.47, .332), (0, .332)], segs=48), titan, ('collar',), 0)
for r0, r1 in ((.19, .205), (.30, .315)):
    make('containment light ring', bm_lathe([(r0, .331), (r1, .331), (r1, .337), (r0, .337)], segs=48), telemetry, ('collar',), 0)
make('brain socket', bm_lathe([(0, .33), (.10, .33), (.095, .36), (.07, .385), (0, .385)], segs=32), steel, ('collar',), .004)
make('socket seal', bm_torus(.072, .01, T((0, 0, .384)), 32, 6), brass, ('collar',))
# Dome cage: three ribs over the glass, aligned with the pylons, meeting at a crown.
DOME_C, DOME_R = .40, .48
for deg in PYLONS:
    pts = []
    for i in range(23):
        phi = math.radians(-11 + i * (82.5 + 11) / 22)
        pts.append(polar(deg, (DOME_R + .014) * math.cos(phi), DOME_C + (DOME_R + .014) * math.sin(phi)))
    rib = bm_sweep(pts, .016, 4)
    make('dome cage rib', rib, titan, ('cage',), 0)
make('cage crown', bm_torus(.07, .016, T((0, 0, DOME_C + DOME_R + .004)), 32, 6), titan, ('cage',))
make('crown uplink', bm_lathe([(0, .875), (.045, .875), (.04, .905), (.012, .92), (0, .92)], segs=24), steel, ('cage',), .003)
make('crown beacon', bm_cyl(.012, .006, .03, T((0, 0, .93)), 8), optic, ('cage',))

# Shield pylon mounts: armoured hex pedestals with three claws (crystals are separate).
for deg in PYLONS:
    base = polar(deg, .72, 0)
    make('pylon pedestal', bm_cyl(.095, .08, .14, T(base + Vector((0, 0, .195))) @ rz(deg + 30), 6), titan, ('pylonbase',), .006)
    make('pylon collar', bm_lathe([(.05, .262), (.083, .262), (.083, .30), (.05, .30)], T(base), 16), steel, ('pylonbase',), 0)
    make('emitter cup', bm_lathe([(.03, .29), (.06, .29), (.065, .305), (.035, .305)], T(base), 16), telemetry, ('pylonbase',))
    for c in range(3):
        a = math.radians(deg + 60 + c * 120)
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = bezier(base + d * .075 + Vector((0, 0, .27)), base + d * .12 + Vector((0, 0, .42)),
                     base + d * .11 + Vector((0, 0, .58)), base + d * .045 + Vector((0, 0, .70)), 10)
        make('pylon claw', bm_sweep(pts, lambda t: .019 - .012 * t, 5), titan, ('prongs',), 0)
    # Armoured conduit from the dome collar down to the pedestal.
    pts = bezier(polar(deg, .57, .30), polar(deg, .62, .32), polar(deg, .64, .27), polar(deg, .66, .225), 8)
    make('power conduit', bm_sweep(pts, .022, 8), recess, ('chassis',), 0)
    for t in (.3, .6):
        p = pts[int(t * 8)]
        make('conduit clamp', bm_torus(.025, .006, T(p) @ basis((0, 0, 1), polar(deg + 90, 1), polar(deg, 1)), 12, 4), brass, ('chassis',))

# The face: a red sensor strip set in a dark visor under an angry V brow.
make('visor housing', bm_lathe([(.84, -.04), (.864, -.04), (.864, .058), (.84, .058)], segs=20, a0=FRONT - 26, a1=FRONT + 26), recess, ('belt',), .004)
make('sensor underglow', bm_lathe([(.862, -.03), (.866, -.03), (.866, -.022), (.862, -.022)], segs=18, a0=FRONT - 20, a1=FRONT + 20), optic, ('belt',))
for side in (-1, 1):
    # Two slit optics canted under the brow: a scowl, not a single eye.
    m = radial_frame(FRONT + side * 10.5, .866, .03) @ rz(side * 13)
    make('scowl optic', bm_box((.21, .02, .012), m), optic, ('belt',))
    for k in range(3):
        make('optic baffle', bm_box((.006, .024, .014), m @ T(((k - 1) * .06, 0, .001))), recess, ('belt',))
    m = radial_frame(FRONT + side * 21, .864, -.008)
    make('sensor pip', bm_cyl(.011, .009, .012, m, 10), optic, ('belt',))
for side in (-1, 1):
    m = radial_frame(FRONT + side * 10.5, .862, .085) @ rz(side * 13)
    make('brow plate', bm_box((.19, .05, .06), m), ivory, ('brow',), .008)
    jaw = radial_frame(FRONT + side * 17, .74, -.185) @ rx(42) @ rz(side * 8)
    make('jaw armour', bm_box((.17, .15, .035), jaw), ivory, ('lower',), .01)
    make('jaw hazard edge', bm_box((.172, .025, .037), jaw @ T((0, -.07, 0))), stripes_flat, ('lower',), .004)
    for k in range(3):
        make('jaw intake slit', bm_box((.012, .09, .01), jaw @ T(((k - 1) * .04, .02, .018))), recess, ('lower',))
    m = radial_frame(FRONT + side * 33, .858, .0)
    make('cheek armour', bm_box((.10, .13, .045), m), ivory2, ('belt',), .008)

# Laser cannon slung under the front: hinge yoke, shroud, finned barrel, focusing prongs.
make('cannon yoke', bm_box((.27, .30, .11), T((0, -.40, -.385))), ivory, ('lower', 'cannon'), .02)
make('cannon hinge', bm_cyl(.068, .068, .30, T((0, -.47, -.43)) @ ALONG_X, 24), steel, ('cannon',), .004)
make('hinge cap', bm_cyl(.05, .05, .32, T((0, -.47, -.43)) @ ALONG_X, 16), brass, ('cannon',), .003)
make('barrel shroud', bm_box((.16, .30, .13), T((0, -.66, -.43))), ivory, ('cannon',), .025)
make('shroud stripe', bm_box((.163, .04, .133), T((0, -.79, -.43))), stripes_flat, ('cannon',), .006)
make('barrel', bm_cyl(.048, .048, .52, T((0, -.85, -.43)) @ ALONG_Y, 24), titan, ('cannon',), .004)
for i in range(6):
    make('heat fin', bm_cyl(.072, .072, .014, T((0, -.84 - i * .032, -.43)) @ ALONG_Y, 20), steel, ('cannon',), 0)
make('muzzle housing', bm_lathe([(.03, .0), (.075, .0), (.082, .06), (.06, .085), (.03, .085)], T((0, -1.025, -.43)) @ rx(90), 24), steel, ('cannon',), .004, 1)
for c in range(3):
    a = math.radians(90 + c * 120)
    o = Vector((math.cos(a) * .07, 0, math.sin(a) * .07))
    pts = [Vector((0, -1.05, -.43)) + o, Vector((0, -1.10, -.43)) + o * 1.15, Vector((0, -1.14, -.43)) + o * .75]
    make('focusing prong', bm_sweep(pts, .012, 5), titan, ('cannon',), 0)
make('lens seat', bm_torus(.034, .008, T((0, -1.108, -.43)) @ rx(90), 24, 6), brass, ('cannon',))

# Thrusters: four gimballed bells and a central keel drive, plasma rings and ion cores.
BELL = [(.055, .0), (.078, .0), (.112, -.13), (.104, -.136), (.068, -.012), (.05, -.012)]
for sx in (-1, 1):
    for sy in (-1, 1):
        c = Vector((sx * .27, sy * .26, -.335))
        make('thruster housing', bm_cyl(.088, .08, .1, T(c + Vector((0, 0, -.05))), 20), steel, ('thruster',), .005, 1)
        make('thruster bell', bm_lathe(BELL, T(c + Vector((0, 0, -.1))), 24), titan, ('thruster',), 0)
        make('plasma ring', bm_cyl(.098, .098, .006, T(c + Vector((0, 0, -.225))), 24), thrust, ('thruster',))
        make('ion core', bm_cyl(.045, .03, .02, T(c + Vector((0, 0, -.21))), 16), core, ('thruster',))
make('keel reactor', bm_lathe([(0, -.33), (.17, -.33), (.16, -.44), (.11, -.60), (.075, -.70), (0, -.70)], segs=40), titan, ('keel',), .006)
for i in range(4):
    m = rz(i * 90 + 45) @ T((.135, 0, -.48)) @ ry(-17)
    make('keel armour fin', bm_box((.05, .03, .26), m), ivory, ('keel',), .008)
for i in range(8):
    m = rz(i * 45) @ T((.125, 0, -.565)) @ ry(-16)
    make('keel plasma slot', bm_box((.012, .03, .07), m), thrust, ('keel',), 0)
make('keel bell', bm_lathe([(.05, .0), (.072, .0), (.105, -.17), (.097, -.176), (.062, -.012), (.045, -.012)], T((0, 0, -.70)), 28), titan, ('keel',), 0)
make('keel plasma', bm_cyl(.09, .09, .006, T((0, 0, -.862))), thrust, ('keel',))
make('keel core', bm_cyl(.045, .03, .03, T((0, 0, -.84)), 16), core, ('keel',))

# Drone bay at the underside rear: lit hangar mouth framed by steel rails.
BAY_Y0, BAY_Y1, BAY_Z = .22, .46, -.345
make('hangar mouth', bm_box((.25, BAY_Y1 - BAY_Y0 - .02, .012), T((0, (BAY_Y0 + BAY_Y1) / 2, BAY_Z - .002))), recess, ('bay',), 0)
for x in (-.135, .135):
    make('bay rail', bm_box((.03, BAY_Y1 - BAY_Y0 + .03, .05), T((x, (BAY_Y0 + BAY_Y1) / 2, BAY_Z - .02))), steel, ('bay',), .006)
for y in (BAY_Y0 - .005, BAY_Y1 + .005):
    make('bay rail', bm_box((.30, .03, .05), T((0, y, BAY_Z - .02))), steel, ('bay',), .006)
for x in (-.09, .09):
    make('hangar light', bm_box((.016, BAY_Y1 - BAY_Y0 - .06, .006), T((x, (BAY_Y0 + BAY_Y1) / 2, BAY_Z - .009))), amber, ('bay',))
for y in np.linspace(BAY_Y0 + .04, BAY_Y1 - .04, 4):
    make('launch cradle', bm_box((.12, .012, .008), T((0, float(y), BAY_Z - .01))), titan, ('bay',))

# Missile pods on the flanks, mounted on trunnions.
POD_X = .985
for side in (-1, 1):
    pivot = Vector((side * .865, -.02, .03))
    make('pod trunnion', bm_cyl(.07, .07, .12, T((side * .825, -.02, .03)) @ ALONG_X, 24), steel, ('arm',), .004)
    make('trunnion collar', bm_torus(.072, .012, T((side * .80, -.02, .03)) @ ALONG_X, 24, 6), brass, ('arm',))
    tag = 'podL' if side < 0 else 'podR'
    c = Vector((side * POD_X, -.02, .03))
    make('pod armour shell', bm_box((.25, .56, .34), T(c)), ivory, (tag,), .04)
    make('pod cowl', bm_box((.27, .22, .06), T(c + Vector((0, -.16, .175))) @ rx(-14)), ivory, (tag,), .015)
    make('pod top armour', bm_box((.25, .30, .045), T(c + Vector((0, .12, .18)))), ivory2, (tag,), .012)
    make('pod spine', bm_box((.05, .44, .04), T(c + Vector((0, .04, .205)))), titan, (tag,), .008)
    make('pod side plate', bm_box((.014, .30, .15), T(c + Vector((side * .128, .06, .055)))), titan, (tag,), .005)
    make('pod side inlay', bm_box((.016, .26, .11), T(c + Vector((side * .13, .06, .055)))), ivory2, (tag,), .004)
    make('tube frame', bm_box((.25, .02, .33), T(c + Vector((0, -.272, 0)))), stripes_flat, (tag,), .004)
    make('pod keel', bm_box((.20, .50, .05), T(c + Vector((0, .02, -.18)))), titan, (tag,), .01)
    make('pod yoke', bm_box((.05, .22, .20), T((side * .88, -.02, .03))), titan, (tag,), .012)
    make('pod hazard flank', bm_box((.008, .30, .07), T(c + Vector((side * .127, .08, -.08)))), stripes_flat, (tag,), .002)
    make('tube face', bm_box((.22, .035, .30), T(c + Vector((0, -.29, 0)))), titan, (tag,), .006)
    for i in range(4):
        make('pod exhaust vent', bm_box((.18, .012, .03), T(c + Vector((0, .282, -.09 + i * .055)))), recess, (tag,), 0)
    make('pod status light', bm_cyl(.014, .014, .01, T(c + Vector((side * .127, -.17, .08))) @ ALONG_X, 12), optic, (tag,))
    for col in range(3):
        for row in range(4):
            p = c + Vector(((col - 1) * .068, -.30, (row - 1.5) * .072))
            make('missile tube', bm_cyl(.03, .03, .05, T(p) @ ALONG_Y, 12), steel, (tag,), 0)
            make('tube bore', bm_cyl(.022, .022, .01, T(p + Vector((0, -.022, 0))) @ ALONG_Y, 12), recess, (tag,))
            make('warhead', bm_cyl(.0, .018, .03, T(p + Vector((0, -.02, 0))) @ rx(-90), 10), warhead, (tag,))

# Drone bay hatch: closed at rest, hinged at its rear edge (origin on the hinge line) so a
# positive rotation about x swings its front edge down and opens the hangar.
HINGE = Vector((0, BAY_Y1 + .005, BAY_Z - .06))
hatch = T(HINGE) @ T((0, -(BAY_Y1 - BAY_Y0) / 2 - .005, 0))
make('bay hatch', bm_box((.27, BAY_Y1 - BAY_Y0 + .01, .03), hatch), ivory, ('hatch',), .008)
make('hatch stripe', bm_box((.272, .03, .032), hatch @ T((0, -(BAY_Y1 - BAY_Y0) / 2 + .03, 0))), stripes_flat, ('hatch',), .003)
make('hatch rib', bm_box((.03, BAY_Y1 - BAY_Y0 - .04, .045), hatch), titan, ('hatch',), .006)
make('hatch hinge', bm_cyl(.016, .016, .26, T(HINGE) @ ALONG_X, 12), steel, ('hatch',))

# ---------------------------------------------------------------- join, centre, UV, bake
bpy.ops.object.select_all(action='DESELECT')
for part in parts:
    part.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
model = bpy.context.object
model.name = 'attack-membrane'; model.data.name = 'attack-membrane'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def pack_uvs():
    """Repack every island tightly (smart project's own packing wastes most of the atlas)."""
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=.0035)


def centre_of_mass(mesh):
    """Volume centroid by the divergence theorem (each part is a closed shell)."""
    mesh.calc_loop_triangles()
    total, moment = 0.0, Vector()
    verts = mesh.vertices
    for tri in mesh.loop_triangles:
        a, b, c = (verts[i].co for i in tri.vertices)
        v = a.dot(b.cross(c)) / 6
        total += v; moment += (a + b + c) * (v / 4)
    return moment / total


COM = centre_of_mass(model.data)
COM.x = 0.0
print('NANOBOT_COM', tuple(round(v, 4) for v in COM), flush=True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.002)
pack_uvs()
bpy.ops.object.mode_set(mode='OBJECT')


def image(name, color=False, size=1024):
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return img


def bake(target, img, kind, samples=8):
    for mat in target.data.materials:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
        mat.node_tree.nodes.active = tex
    scene.render.bake.use_pass_direct = scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True; scene.render.bake.margin = 6
    scene.cycles.samples = samples
    bpy.ops.object.bake(type=kind)
    return np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)


scene.render.bake.use_selected_to_active = False
albedo, normal, rough, ao, metal, emission = (image('nanobot_albedo', True), image('nanobot_normal'), image('nanobot_rough'),
                                              image('nanobot_ao'), image('nanobot_metal'), image('nanobot_emission', True))
color = bake(model, albedo, 'DIFFUSE'); rough_pixels = bake(model, rough, 'ROUGHNESS'); ao_pixels = bake(model, ao, 'AO', 24)
bake(model, normal, 'NORMAL')
for channel, target in [('metal', metal), ('emission', emission)]:
    saved = []
    for mat in model.data.materials:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        output = nodes.get('Material Output'); old = output.inputs['Surface'].links[0].from_socket
        emit = nodes.new('ShaderNodeEmission')
        value = [mat['metal']] * 3 if channel == 'metal' else list(mat['emission'])
        emit.inputs['Color'].default_value = (*value, 1); links.new(emit.outputs[0], output.inputs['Surface'])
        saved.append((mat, old, emit))
    pixels = bake(model, target, 'EMIT')
    if channel == 'metal':
        metal_pixels = pixels
    for mat, old, emit in saved:
        mat.node_tree.links.new(old, mat.node_tree.nodes.get('Material Output').inputs['Surface'])
        mat.node_tree.nodes.remove(emit)
color[:, :3] *= np.sqrt(np.clip(ao_pixels[:, :1], .25, 1))
albedo.pixels.foreach_set(color.ravel())
orm = image('nanobot_orm'); packed = np.ones_like(color)
packed[:, 0] = ao_pixels[:, 0]; packed[:, 1] = rough_pixels[:, 0]; packed[:, 2] = metal_pixels[:, 0]
orm.pixels.foreach_set(packed.ravel())
runtime = bpy.data.materials.new('Mega Nano Bot baked armour'); runtime.use_nodes = True
nodes, links = runtime.node_tree.nodes, runtime.node_tree.links; bsdf = nodes.get('Principled BSDF')
for name, img in [('albedo', albedo), ('orm', orm), ('normal', normal), ('emission', emission)]:
    tex = nodes.new('ShaderNodeTexImage'); tex.image = img
    if name == 'albedo':
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    elif name == 'orm':
        separate = nodes.new('ShaderNodeSeparateColor'); links.new(tex.outputs['Color'], separate.inputs[0])
        links.new(separate.outputs['Green'], bsdf.inputs['Roughness']); links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
    elif name == 'normal':
        node = nodes.new('ShaderNodeNormalMap'); links.new(tex.outputs['Color'], node.inputs['Color']); links.new(node.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        links.new(tex.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.6
    img.pack()
model.data.materials.clear(); model.data.materials.append(runtime)
for polygon in model.data.polygons:
    polygon.material_index = 0
for mat in [m for m in bpy.data.materials if m.users == 0]:
    bpy.data.materials.remove(mat)


def split_off(group, name, pivot):
    """Separate one vertex group into its own object sharing the baked atlas, origin at the pivot."""
    bpy.ops.object.select_all(action='DESELECT'); model.select_set(True)
    bpy.context.view_layer.objects.active = model
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT')
    model.vertex_groups.active_index = model.vertex_groups[group].index
    bpy.ops.object.vertex_group_select(); bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    piece = [o for o in bpy.context.selected_objects if o != model][0]
    piece.name = name; piece.data.name = name
    piece.vertex_groups.clear()
    bpy.ops.object.select_all(action='DESELECT'); piece.select_set(True)
    bpy.context.view_layer.objects.active = piece
    scene.cursor.location = pivot
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return piece


pod_l = split_off('podL', 'nanobot-pod-L', (-.865, -.02, .03))
pod_r = split_off('podR', 'nanobot-pod-R', (.865, -.02, .03))
bay = split_off('hatch', 'nanobot-bay', HINGE)
scene.cursor.location = (0, 0, 0)

# ---------------------------------------------------------------- morph targets on the hull
model.shape_key_add(name='Basis')
groups = {g.name: g.index for g in model.vertex_groups}


def weight(vertex, name):
    index = groups.get(name)
    if index is None:
        return 0.0
    for g in vertex.groups:
        if g.group == index:
            return g.weight
    return 0.0


for name in ['Breathe', 'SwayA', 'SwayB', 'SwayC', 'Clench']:
    key = model.shape_key_add(name=name, from_mix=False)
    for vertex, point in zip(model.data.vertices, key.data):
        co = vertex.co
        r = math.hypot(co.x, co.y)
        ang = math.atan2(co.y, co.x)
        out = Vector((co.x, co.y, 0)) / max(r, 1e-6)
        plate = weight(vertex, 'plates') + weight(vertex, 'lower') * (r > .5)
        if name == 'Breathe':
            # Armour plates lift a hair off the chassis; the keel and thruster bells settle.
            point.co += out * .004 * plate + Vector((0, 0, .003)) * plate
            point.co.z -= .005 * (weight(vertex, 'keel') + weight(vertex, 'thruster')) * max(0, -co.z - .33) / .4
        elif name == 'SwayA':
            # Thruster bells gimbal sideways under the hull.
            depth = max(0, -co.z - .33)
            point.co.x += .05 * depth * weight(vertex, 'thruster')
            point.co.y += .02 * depth * weight(vertex, 'keel')
        elif name == 'SwayB':
            # A slow ripple around the deck plates and petals.
            point.co.z += .005 * math.sin(3 * ang) * plate
            point.co += out * .003 * math.sin(3 * ang + 1.3) * weight(vertex, 'brow')
        elif name == 'SwayC':
            # The pylon claws breathe open and the cannon yoke trims its pitch.
            prong = weight(vertex, 'prongs')
            if prong:
                for deg in PYLONS:
                    centre = polar(deg, .72, 0)
                    d = Vector((co.x - centre.x, co.y - centre.y, 0))
                    if d.length < .2:
                        point.co += d.normalized() * .012 * max(0, co.z - .27) / .43 * prong
            point.co.z -= .006 * weight(vertex, 'cannon') * math.sin(math.pi * min(1, max(0, (-co.y - .5) / .5)))
        elif name == 'Clench':
            # Hackles up: plates and petals flare outward, claws spread, the brow drops.
            if plate:
                lift = max(0, r - .52) / .3
                point.co += out * .03 * lift * plate
                point.co.z += (.045 if co.z > 0 else -.03) * lift * plate
            prong = weight(vertex, 'prongs')
            if prong:
                for deg in PYLONS:
                    centre = polar(deg, .72, 0)
                    d = Vector((co.x - centre.x, co.y - centre.y, 0))
                    if d.length < .2:
                        point.co += d.normalized() * .035 * max(0, co.z - .27) / .43 * prong
            point.co.z -= .02 * weight(vertex, 'brow')
            point.co += out * .012 * weight(vertex, 'brow')
    loops = {'Breathe': [(1, 0), (31, 1), (61, 0), (91, .6), (121, 0)],
             'SwayA': [(1, .5), (31, 1), (91, 0), (121, .5)],
             'SwayB': [(1, 0), (41, 1), (81, .3), (121, 0)],
             'SwayC': [(1, .3), (21, 0), (71, 1), (121, .3)]}
    if name in loops:
        for frame, value in loops[name]:
            key.value = value; key.keyframe_insert(data_path='value', frame=frame)
        key.value = 0
model.data.shape_keys.animation_data.action.name = 'Idle'
model.vertex_groups.clear()

# ---------------------------------------------------------------- brain
BRAIN_C = Vector((0, .015, .592))
BS = 1.2
AX, AY, AZ = .155, .285, .165


def hemisphere_shape(u, side):
    x, y, z = u
    lat = x * side
    f = max(0.0, -y); b = max(0.0, y)
    sx = (1 - .2 * f * f) * (1 - .12 * b * b)
    sz = (1 - .14 * f * f) * (1 - .1 * b ** 3)
    lm = lat if lat > 0 else lat * .36
    zm = z if z > 0 else z * .58
    # Temporal lobe: a bulge low on the side, forward of centre.
    t = math.exp(-((y + .1) / .36) ** 2) * max(0.0, lat) ** 1.5 * max(0.0, -z)
    X = side * (.36 * AX + .008 + lm * AX * sx + .02 * t)
    Y = y * AY * (1 - .04 * max(0.0, -z))
    Z = zm * AZ * sz - .06 * t + .02 * y * y
    return Vector((X, Y, Z)) * BS + BRAIN_C


def fold_field(p, side):
    """Sulcus depth 0..1 from the zero set of a domain-warped noise, plus the lateral fissure."""
    q = (p - BRAIN_C) / BS * 21.0 + Vector((side * 3.1, 0, 0))
    warp = noise.noise_vector(q * .45 + Vector((5.2, 1.3, 9.1)))
    n = noise.noise(q + warp * .8)
    s = math.exp(-(n / .11) ** 2)
    local = (p - BRAIN_C) / BS
    lat = local.x * side
    # Sylvian fissure: a deep cleft rising backward along the side.
    if lat > .07 and -.17 < local.y < .14:
        line = -.035 + .32 * (local.y + .12)
        s = max(s, math.exp(-((local.z - line) / .012) ** 2) * min(1.0, (lat - .07) / .05) * 1.6)
    # Central sulcus: across the crown, slanting back as it descends.
    if local.z > -.01:
        s = max(s, .9 * math.exp(-((local.y - (.0 - .3 * (local.z - .1))) / .01) ** 2) * min(1.0, local.z / .05))
    return min(1.0, s)


def vessel_field(p):
    q = (p - BRAIN_C) / BS * 5.5 + Vector((11.0, 3.0, 7.0))
    warp = noise.noise_vector(q * .7)
    return math.exp(-(noise.noise(q + warp) / .045) ** 2)


def set_colors(me, albedo_list, glow_list):
    for name, values in (('col', albedo_list), ('glow', glow_list)):
        attr = me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
        attr.data.foreach_set('color', np.array([(*c, 1) for c in values], dtype=np.float32).ravel())


# Linear-light colours: grey-pink cortex, deep red-brown sulci, purple vessels.
GYRUS = Vector((.46, .22, .22)); SULCUS = Vector((.09, .018, .03)); VEIN = Vector((.2, .015, .05))
MAGENTA = Vector((1.0, .12, .62))


def brain_colors(p, s, v):
    grain = .92 + .16 * noise.noise((p - BRAIN_C) * 60)
    base = GYRUS.lerp(SULCUS, s ** 1.3) * grain
    base = base.lerp(VEIN, .55 * v)
    glow = MAGENTA * (.7 * v + .55 * s ** 4)
    return base, glow


def build_hemisphere(side, subdiv):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    for vert in bm.verts:
        vert.co = hemisphere_shape(vert.co.normalized(), side)
    bm.normal_update()
    cols, glows = [], []
    for vert in bm.verts:
        p = vert.co.copy()
        s = fold_field(p, side)
        crown = 1 - s
        local = (p - BRAIN_C) / BS
        depth = (.017 if local.x * side > -.02 or local.z > .05 else .01) * BS
        vert.co = p + vert.normal * (depth * (crown ** .6 - 1) + .002)
        v = vessel_field(p) * (local.x * side > 0 or local.z > .06)
        c, g = brain_colors(p, s, v)
        cols.append(c); glows.append(g)
    return bm, cols, glows


def build_cerebellum(subdiv):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    centre = BRAIN_C + Vector((0, .195, -.098)) * BS
    for vert in bm.verts:
        x, y, z = vert.co.normalized()
        notch = 1 - .25 * math.exp(-(x / .18) ** 2) * (y > 0)
        vert.co = centre + Vector((x * .15, y * .085 * notch, z * .07 * (1 if z < 0 else .8))) * BS
    bm.normal_update()
    cols, glows = [], []
    for vert in bm.verts:
        p = vert.co.copy(); local = (p - centre) / BS
        stripe = .5 + .5 * math.cos(local.z * 170 + local.y * 40 + 2.5 * noise.noise(p * 20))
        s = stripe ** 3
        vert.co = p + vert.normal * (-.0045 * BS * s)
        c, g = brain_colors(p, s * .8, 0)
        cols.append(c * .92); glows.append(g * .6)
    return bm, cols, glows


def to_object(name, bm, cols, glows, mat):
    obj = make(name, bm, mat, part=False, smooth=180)
    set_colors(obj.data, cols, glows)
    return obj


def cube_uv(obj, dims):
    """Gnomonic cube projection from the lobe's centre: six clean islands per lobe."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    layer = bm.loops.layers.uv.verify()
    centre = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
    for face in bm.faces:
        c = face.calc_center_median() - centre
        c = Vector((c.x / dims.x, c.y / dims.y, c.z / dims.z))
        axis = max(range(3), key=lambda i: abs(c[i]))
        sign = 1 if c[axis] > 0 else -1
        a1, a2 = [i for i in range(3) if i != axis]
        tile = axis * 2 + (sign > 0)
        for loop in face.loops:
            v = loop.vert.co - centre
            v = Vector((v.x / dims.x, v.y / dims.y, v.z / dims.z))
            d = max(abs(v[axis]), 1e-4)
            # Scale each island by its physical size so the packer keeps texel density even.
            loop[layer].uv = (tile * 3 + v[a1] / d * dims[a1] * sign, v[a2] / d * dims[a2])
    bm.to_mesh(obj.data); bm.free()


brain_mat = bpy.data.materials.new('brain bake source'); brain_mat.use_nodes = True
n_, l_ = brain_mat.node_tree.nodes, brain_mat.node_tree.links; b_ = n_.get('Principled BSDF')
a_col = n_.new('ShaderNodeAttribute'); a_col.attribute_name = 'col'
a_glow = n_.new('ShaderNodeAttribute'); a_glow.attribute_name = 'glow'
l_.new(a_col.outputs['Color'], b_.inputs['Base Color']); l_.new(a_glow.outputs['Color'], b_.inputs['Emission Color'])
b_.inputs['Emission Strength'].default_value = 1.0; b_.inputs['Roughness'].default_value = .42


def accessories():
    """Brainstem, electrodes and fibre-optic cables (identical in the high and low brain)."""
    pieces = []
    stem_pts = bezier(BRAIN_C + Vector((0, .07, -.07)) * BS, BRAIN_C + Vector((0, .07, -.15)) * BS,
                      Vector((0, .02, .45)), Vector((0, 0, .37)), 8)
    stem = bm_sweep(stem_pts, lambda t: (.045 - .012 * t + .012 * math.exp(-((t - .35) / .15) ** 2)) * BS, 14)
    pieces.append((stem, Vector((.36, .2, .2)), Vector((.25, .02, .15)) * .3))
    return pieces


hemis_hi = [build_hemisphere(s, 7) for s in (-1, 1)]
cereb_hi = build_cerebellum(6)
high_objs = [to_object('brain high L', *hemis_hi[0], brain_mat), to_object('brain high R', *hemis_hi[1], brain_mat),
             to_object('cerebellum high', *cereb_hi, brain_mat)]
tree_bm = bmesh.new()
for o in high_objs:
    tree_bm.from_mesh(o.data)
tree = BVHTree.FromBMesh(tree_bm)


def surface(direction):
    d = Vector(direction).normalized()
    hit, nrm, _i, _dist = tree.ray_cast(BRAIN_C + d * 1.0, -d)
    return hit, nrm


cable_specs = []
for i, (az, el) in enumerate([(-60, 25), (-30, 40), (-120, 32), (-150, 18), (-90, 55), (60, 30), (30, 45), (120, 35),
                              (150, 20), (90, 58)]):
    a, e = math.radians(az), math.radians(el)
    direction = Vector((math.cos(e) * math.cos(a) * .7, math.cos(e) * math.sin(a), math.sin(e) * .9))
    hit, nrm = surface(direction)
    if hit is None:
        continue
    socket = polar(math.degrees(math.atan2(hit.y - BRAIN_C.y, hit.x)), .37 + .03 * (i % 2), .332)
    glow = i % 3 != 2
    cable_specs.append((hit, nrm, socket, glow))


def cable_meshes():
    out = []
    for hit, nrm, socket, glow in cable_specs:
        m = basis(nrm.orthogonal(), nrm.cross(nrm.orthogonal()), nrm, hit + nrm * .003)
        out.append((bm_cyl(.014, .011, .012, m, 10), Vector((.55, .56, .56)), Vector((.05, .7, .9)) * .8))
        out.append((bm_cyl(.0045, .0045, .02, m @ T((0, 0, -.006)), 6), Vector((.6, .45, .2)), Vector()))
        outward = Vector((hit.x - BRAIN_C.x, hit.y - BRAIN_C.y, 0)).normalized()
        pts = bezier(hit + nrm * .01, hit + nrm * .06 + outward * .07, socket + Vector((0, 0, .07)) + outward * .04, socket, 14)
        sheath = Vector((.04, .12, .15)) if glow else Vector((.06, .06, .07))
        light = Vector((.0, .6, .9)) * 1.1 if glow else Vector((.0, .0, .0))
        out.append((bm_sweep(pts, .0045 if glow else .0065, 6), sheath, light))
        out.append((bm_cyl(.016, .016, .02, T(socket + Vector((0, 0, .008))), 10), Vector((.2, .2, .22)), Vector()))
    return out


def accessory_objects(label):
    objs = []
    for k, (bm, col, glow) in enumerate(accessories() + cable_meshes()):
        obj = make('%s accessory %d' % (label, k), bm, brain_mat, part=False, smooth=40)
        count = len(obj.data.vertices)
        set_colors(obj.data, [col] * count, [glow] * count)
        objs.append(obj)
    return objs


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); obj = bpy.context.object; obj.name = name; obj.data.name = name
    return obj


high = join(high_objs + accessory_objects('high'), 'brain high')
low_parts = []
for label, (bm, cols, glows), ratio in [('L', build_hemisphere(-1, 7), .135), ('R', build_hemisphere(1, 7), .135),
                                        ('C', build_cerebellum(6), .14)]:
    obj = to_object('brain low ' + label, bm, cols, glows, brain_mat)
    mod = obj.modifiers.new('decimate', 'DECIMATE'); mod.ratio = ratio
    graph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph)); obj.modifiers.clear(); obj.data = mesh
    for poly in obj.data.polygons:
        poly.use_smooth = True
    cube_uv(obj, Vector((AX, AY, AZ)) * BS if label != 'C' else Vector((.15, .085, .07)) * BS)
    low_parts.append(obj)
wires = join(accessory_objects('low'), 'brain wiring')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=.002)
bpy.ops.object.mode_set(mode='OBJECT')
brain = join(low_parts + [wires], 'nanobot-brain')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
pack_uvs()
bpy.ops.object.mode_set(mode='OBJECT')
target_mat = bpy.data.materials.new('brain bake target'); target_mat.use_nodes = True
brain.data.materials.clear(); brain.data.materials.append(target_mat)
bpy.ops.object.select_all(action='DESELECT'); high.select_set(True); brain.select_set(True)
bpy.context.view_layer.objects.active = brain
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = .03; scene.render.bake.max_ray_distance = .09
b_albedo, b_normal, b_emit = image('brain_albedo', True), image('brain_normal'), image('brain_emission', True)
b_color = bake(brain, b_albedo, 'DIFFUSE', 4)
bake(brain, b_normal, 'NORMAL', 4)
bake(brain, b_emit, 'EMIT', 4)
scene.render.bake.use_selected_to_active = False
bpy.data.objects.remove(high)
brain_rt = bpy.data.materials.new('hijacked cortex'); brain_rt.use_nodes = True
nodes, links = brain_rt.node_tree.nodes, brain_rt.node_tree.links; bsdf = nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .4; bsdf.inputs['Metallic'].default_value = 0
for name, img in [('albedo', b_albedo), ('normal', b_normal), ('emission', b_emit)]:
    tex = nodes.new('ShaderNodeTexImage'); tex.image = img
    if name == 'albedo':
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    elif name == 'normal':
        node = nodes.new('ShaderNodeNormalMap'); links.new(tex.outputs['Color'], node.inputs['Color']); links.new(node.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        links.new(tex.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.5
    img.pack()
brain.data.materials.clear(); brain.data.materials.append(brain_rt)
for attr_name in ('col', 'glow'):
    attr = brain.data.attributes.get(attr_name)
    if attr is not None:
        brain.data.attributes.remove(attr)
scene.cursor.location = BRAIN_C
bpy.ops.object.select_all(action='DESELECT'); brain.select_set(True); bpy.context.view_layer.objects.active = brain
bpy.ops.object.origin_set(type='ORIGIN_CURSOR'); scene.cursor.location = (0, 0, 0)

# ---------------------------------------------------------------- glass dome, pylons, laser
glass = bpy.data.materials.new('containment glass'); glass.use_nodes = True
g = glass.node_tree.nodes.get('Principled BSDF')
g.inputs['Base Color'].default_value = (.25, .55, .6, 1); g.inputs['Alpha'].default_value = .26
g.inputs['Roughness'].default_value = .04; g.inputs['Metallic'].default_value = 0
g.inputs['Emission Color'].default_value = (.15, .75, .85, 1); g.inputs['Emission Strength'].default_value = .06
glass.surface_render_method = 'BLENDED'; glass.use_backface_culling = True
if hasattr(glass, 'blend_method'):
    glass.blend_method = 'BLEND'
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=DOME_R)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -.11], context='VERTS')
bmesh.ops.transform(bm, matrix=T((0, 0, DOME_C)), verts=bm.verts)
dome = make('nanobot-dome', bm, glass, part=False, smooth=180)
dome.data.name = 'nanobot-dome'
scene.cursor.location = (0, 0, DOME_C)
bpy.ops.object.select_all(action='DESELECT'); dome.select_set(True); bpy.context.view_layer.objects.active = dome
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

shield = flat('shield crystal', (.02, .35, .55), (.0, .55, 1.0), 1.5, .08)
pylons = []
for index, deg in enumerate(PYLONS):
    base = polar(deg, .72, .27)
    bm = bmesh.new()
    bottom = bm.verts.new(base + Vector((0, 0, .02)))
    low_ring = [bm.verts.new(base + Vector((math.cos(TAU * k / 6 + .3) * .05, math.sin(TAU * k / 6 + .3) * .05, .14))) for k in range(6)]
    high_ring = [bm.verts.new(base + Vector((math.cos(TAU * k / 6 + .3) * .042, math.sin(TAU * k / 6 + .3) * .042, .36))) for k in range(6)]
    top = bm.verts.new(base + Vector((0, 0, .54)))
    for k in range(6):
        j = (k + 1) % 6
        bm.faces.new([bottom, low_ring[j], low_ring[k]])
        bm.faces.new([low_ring[k], low_ring[j], high_ring[j], high_ring[k]])
        bm.faces.new([high_ring[k], high_ring[j], top])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for z, r in ((.17, .098), (.33, .082)):
        ring = bm_torus(r, .006, T(base + Vector((0, 0, z))), 32, 6)
        tmp = bpy.data.meshes.new('tmp'); ring.to_mesh(tmp); ring.free(); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    name = 'nanobot-pylon-%d' % index
    pylon = make(name, bm, shield, part=False, smooth=30)
    pylon.data.name = name
    scene.cursor.location = base
    bpy.ops.object.select_all(action='DESELECT'); pylon.select_set(True); bpy.context.view_layer.objects.active = pylon
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    pylons.append(pylon)

lens_mat = flat('laser emitter lens', (.6, .01, .005), (1, .015, .0), 1.3, .1)
bm = bm_lathe([(0, 0), (.034, 0), (.03, .012), (.016, .02), (0, .022)], T((0, -1.105, -.43)) @ rx(90), 32)
laser = make('nanobot-laser', bm, lens_mat, part=False, smooth=40)
laser.data.name = 'nanobot-laser'
scene.cursor.location = (0, -1.105, -.43)
bpy.ops.object.select_all(action='DESELECT'); laser.select_set(True); bpy.context.view_layer.objects.active = laser
bpy.ops.object.origin_set(type='ORIGIN_CURSOR'); scene.cursor.location = (0, 0, 0)

# ---------------------------------------------------------------- centre on the hull's mass, parent, export
children = [dome, brain, *pylons, laser, pod_l, pod_r, bay]
model.data.transform(Matrix.Translation(-COM), shape_keys=True)
for child in children:
    child.location -= COM
    child.parent = model
    child.matrix_parent_inverse = Matrix()
scene.frame_set(1); scene.frame_start = 1; scene.frame_end = 120
bpy.ops.object.select_all(action='DESELECT')
for obj in [model, *children]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = model
bpy.ops.export_scene.gltf(filepath=str(OUT / 'boss-nanobot.glb'), export_format='GLB', use_selection=True,
                         export_image_format='WEBP', export_image_quality=84, export_yup=True,
                         export_animations=True, export_animation_mode='ACTIONS', export_morph=True,
                         export_morph_normal=False, export_cameras=False, export_lights=False)

# ---------------------------------------------------------------- Cycles studio portrait
# Cycles sees both sides of the dome; let the far wall go clear so the brain stays crisp.
nodes, links = glass.node_tree.nodes, glass.node_tree.links
geometry = nodes.new('ShaderNodeNewGeometry'); clear = nodes.new('ShaderNodeBsdfTransparent')
mix = nodes.new('ShaderNodeMixShader'); output = nodes.get('Material Output')
links.new(geometry.outputs['Backfacing'], mix.inputs['Fac'])
links.new(g.outputs['BSDF'], mix.inputs[1]); links.new(clear.outputs['BSDF'], mix.inputs[2])
links.new(mix.outputs['Shader'], output.inputs['Surface'])
g.inputs['Alpha'].default_value = .14
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -1.25 - COM.z))
floor = bpy.context.object; floor.data.materials.append(material('studio floor', (.02, .022, .025), .3, .4, grime=.1))


def area(name, loc, power, color, size):
    data = bpy.data.lights.new(name, 'AREA'); data.energy = power; data.color = color; data.shape = 'DISK'; data.size = size
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = loc
    obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()


area('large clinical softbox', (-3, -4, 5), 420, (1, .9, .78), 4)
area('cool lab rim', (3, 2.5, 3), 900, (.45, .8, 1), 3)
area('hazard back rim', (-2.5, 3, 3), 130, (1, .3, .25), 2)
area('front fill', (1.5, -5, .6), 160, (.85, 1, .95), 2)
inner = bpy.data.lights.new('cortex glow', 'POINT'); inner.energy = 8; inner.color = (1, .35, .75); inner.shadow_soft_size = .1
inner_obj = bpy.data.objects.new('cortex glow', inner); scene.collection.objects.link(inner_obj)
inner_obj.location = BRAIN_C - COM + Vector((0, -.12, .25))
fluid = bpy.data.lights.new('containment fluid', 'POINT'); fluid.energy = 6; fluid.color = (.3, .9, 1); fluid.shadow_soft_size = .2
fluid_obj = bpy.data.objects.new('containment fluid', fluid); scene.collection.objects.link(fluid_obj)
fluid_obj.location = Vector((0, 0, .36)) - COM


def look(cam, target):
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()


azimuth, elevation, distance = math.radians(-58), math.radians(31), 8
target = Vector((0, -.08, .02))
bpy.ops.object.camera_add(location=target + Vector((math.cos(elevation) * math.cos(azimuth), math.cos(elevation) * math.sin(azimuth), math.sin(elevation))) * distance)
camera = bpy.context.object; look(camera, target)
camera.data.type = 'ORTHO'; camera.data.ortho_scale = 2.75; scene.camera = camera
scene.cycles.samples = 96; scene.render.resolution_x = scene.render.resolution_y = 720; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.quality = 90
scene.render.filepath = str(OUT / 'portraits' / 'boss-nanobot.webp'); bpy.ops.render.render(write_still=True)
camera.data.type = 'PERSP'; camera.data.lens = 85; camera.location = target + (camera.location - target) * .95; look(camera, target)
scene.cycles.samples = 160; scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(DELIVER / 'boss-nanobot-blender.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(DELIVER / 'boss-nanobot.blend'))


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


counts = {obj.name: tris(obj) for obj in [model, *children]}
report = {'triangles': sum(counts.values()), 'perObject': counts, 'textureSize': 1024,
          'centreOfMass': list(COM), 'bytes': (OUT / 'boss-nanobot.glb').stat().st_size,
          'portrait': 'portraits/boss-nanobot.webp'}
(WORK / 'report.json').write_text(json.dumps(report, indent=2))
print('NANOBOT_READY', json.dumps(report), flush=True)
