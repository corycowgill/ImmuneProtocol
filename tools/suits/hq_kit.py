"""Modeling + material toolkit for the photoreal co-op suits.

Imported by tools/suits/build_suits_hq.py. All coordinates passed to this kit
use the game (Three.js) frame: +Y up, the suit faces -Z. Arm and glove parts
are authored in their own joint space (pivot at the origin, the limb hanging
down -Y at real length) and are moved apart in "bake space" so they never
overlap while textures are baked.
"""
import math

import bmesh
import bpy
from mathutils import Vector

TAU = math.tau


def bl(p):
    """Game (x, y, z) -> Blender (x, -z, y)."""
    return Vector((p[0], -p[2], p[1]))


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def catmull(points, t):
    """Catmull-Rom sample of a list of tuples at t in [0, 1]."""
    n = len(points) - 1
    f = min(n - 1e-6, max(0.0, t * n))
    i = int(f)
    u = f - i
    p0 = points[max(0, i - 1)]
    p1 = points[i]
    p2 = points[min(n, i + 1)]
    p3 = points[min(n, i + 2)]
    out = []
    for a, b, c, d in zip(p0, p1, p2, p3):
        out.append(.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u ** 3))
    return out


class Lathe:
    """Elliptic surface of revolution around a vertical axis.

    profile: list of (y, rx, rz[, dz]) sorted top->bottom or bottom->top.
    theta = 0 faces the front (-z); theta = +pi/2 points to +x.
    """

    def __init__(self, center, profile):
        self.cx, self.cz = center
        prof = sorted([tuple(p) + (0.0,) * (4 - len(p)) for p in profile], key=lambda p: p[0])
        self.prof = prof
        self.y0, self.y1 = prof[0][0], prof[-1][0]

    def at(self, y):
        ys = [p[0] for p in self.prof]
        y = min(self.y1, max(self.y0, y))
        # Map y to a parameter through the knots so Catmull-Rom stays monotone in y.
        for i in range(len(ys) - 1):
            if ys[i] <= y <= ys[i + 1]:
                t = (i + (y - ys[i]) / max(1e-9, ys[i + 1] - ys[i])) / (len(ys) - 1)
                break
        else:
            t = 1.0
        _, rx, rz, dz = catmull(self.prof, t)
        return rx, rz, dz

    def point(self, theta, y, offset=0.0):
        rx, rz, dz = self.at(y)
        return (self.cx + math.sin(theta) * (rx + offset), y, self.cz + dz - math.cos(theta) * (rz + offset))


class Suit:
    def __init__(self, ident, pivots, bake_offsets):
        self.ident = ident
        self.pivots = pivots
        self.offsets = bake_offsets
        self.parts = {name: [] for name in pivots}

    # -- low level --------------------------------------------------------
    def to_space(self, part, p):
        o = self.offsets.get(part, (0, 0, 0))
        return bl((p[0] + o[0], p[1] + o[1], p[2] + o[2]))

    def mesh(self, part, mat, verts, faces, smooth=True, name='m'):
        me = bpy.data.meshes.new(name)
        me.from_pydata([self.to_space(part, v) for v in verts], [], faces)
        me.validate()
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(mat)
        if smooth:
            for poly in me.polygons:
                poly.use_smooth = True
        self.parts[part].append(obj)
        return obj

    @staticmethod
    def modifiers(obj, thick=0.0, bevel=0.0, segs=2, subd=0, weighted=True, angle=35, offset=1.0):
        if thick:
            m = obj.modifiers.new('solid', 'SOLIDIFY')
            m.thickness = thick
            m.offset = offset
            m.use_even_offset = True
            m.use_quality_normals = True
        if bevel:
            m = obj.modifiers.new('bevel', 'BEVEL')
            m.width = bevel
            m.segments = segs
            m.limit_method = 'ANGLE'
            m.angle_limit = math.radians(angle)
            m.harden_normals = False
        if subd:
            m = obj.modifiers.new('subd', 'SUBSURF')
            m.levels = subd
            m.render_levels = subd
        if weighted:
            if hasattr(obj.data, 'use_auto_smooth'):  # Blender < 4.1
                obj.data.use_auto_smooth = True
                obj.data.auto_smooth_angle = math.radians(angle)
            m = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
            m.keep_sharp = True
        return obj

    # -- surfaces ---------------------------------------------------------
    def grid(self, part, mat, fn, nu, nv, closed_u=False, cap_v0=False, cap_v1=False, name='grid'):
        """fn(u, v) -> game point, u, v in [0, 1]."""
        cols = nu if closed_u else nu + 1
        verts = []
        for j in range(nv + 1):
            for i in range(cols):
                verts.append(fn(i / nu, j / nv))
        faces = []
        for j in range(nv):
            for i in range(nu):
                a = j * cols + i
                b = j * cols + (i + 1) % cols if closed_u else a + 1
                faces.append((a, b, b + cols, a + cols))
        for cap, j in ((cap_v0, 0), (cap_v1, nv)):
            if cap and closed_u:
                ring = [j * cols + i for i in range(cols)]
                cx = [sum(verts[k][axis] for k in ring) / len(ring) for axis in range(3)]
                verts.append(tuple(cx))
                c = len(verts) - 1
                for i in range(cols):
                    a, b = ring[i], ring[(i + 1) % cols]
                    faces.append((b, a, c) if j == 0 else (a, b, c))
        return self.mesh(part, mat, verts, faces, name=name)

    def body(self, part, mat, lathe, segs=32, rings=None, bevel=0.0):
        """Closed body volume from a lathe."""
        rings = rings or max(6, int((lathe.y1 - lathe.y0) / .024))
        obj = self.grid(part, mat, lambda u, v: lathe.point(u * TAU, lathe.y0 + (lathe.y1 - lathe.y0) * v),
                        segs, rings, closed_u=True, cap_v0=True, cap_v1=True, name='body')
        return self.modifiers(obj, bevel=bevel)

    def plate(self, part, mat, lathe, t0, t1, y0, y1, offset=.008, thick=.012, bevel=.004,
              bulge=0.0, nu=None, nv=None, taper=None, segs=1, closed=False):
        """Armour plate conforming to a lathe surface.

        t0/t1: angular extent (radians, 0 = front). taper(v) -> (t0, t1) override per row.
        bulge: extra outward offset at the plate centre for a domed look.
        """
        span = abs(t1 - t0)
        nu = nu or max(4, int(span / TAU * 36) + 2)
        nv = nv or max(3, int(abs(y1 - y0) / .03) + 2)

        def fn(u, v):
            a0, a1 = taper(v) if taper else (t0, t1)
            theta = a0 + (a1 - a0) * u
            y = y0 + (y1 - y0) * v
            dome = bulge * math.sin(math.pi * v) * (1.0 if closed else math.sin(math.pi * u))
            return lathe.point(theta, y, offset + dome)

        obj = self.grid(part, mat, fn, nu, nv, closed_u=closed, name='plate')
        return self.modifiers(obj, thick=thick, bevel=bevel, segs=segs)

    def band(self, part, mat, lathe, y, height, offset=.006, thick=.01, bevel=.003, segs=40, t0=0.0, t1=TAU):
        closed = abs(t1 - t0 - TAU) < 1e-6
        return self.plate(part, mat, lathe, t0, t1, y - height / 2, y + height / 2, offset, thick, bevel,
                          nu=segs, nv=2, closed=closed)

    # -- primitives -------------------------------------------------------
    def _prim(self, part, mat, obj, bevel, segs, subd=0, weighted=True):
        obj.data.materials.append(mat)
        for poly in obj.data.polygons:
            poly.use_smooth = True
        self.parts[part].append(obj)
        return self.modifiers(obj, bevel=bevel, segs=segs, subd=subd, weighted=weighted)

    def box(self, part, mat, center, size, rot=(0, 0, 0), bevel=.006, segs=3):
        bpy.ops.mesh.primitive_cube_add(size=1, location=self.to_space(part, center))
        obj = bpy.context.object
        obj.rotation_euler = (rot[0], -rot[2], rot[1])
        obj.scale = (size[0], size[2], size[1])
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        return self._prim(part, mat, obj, bevel, segs)

    def ball(self, part, mat, center, radii, segs=24, rings=16, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1,
                                             location=self.to_space(part, center))
        obj = bpy.context.object
        obj.rotation_euler = (rot[0], -rot[2], rot[1])
        obj.scale = (radii[0], radii[2], radii[1])
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        return self._prim(part, mat, obj, 0, 1)

    @staticmethod
    def _axis_euler(axis, rot=(0, 0, 0)):
        base = {'y': (0, 0, 0), 'x': (0, math.pi / 2, 0), 'z': (math.pi / 2, 0, 0)}[axis]
        return (base[0] + rot[0], base[1] - rot[2], base[2] + rot[1])

    def cyl(self, part, mat, center, radius, depth, axis='y', verts=24, bevel=.002, r2=None, rot=(0, 0, 0)):
        if r2 is None:
            bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                                location=self.to_space(part, center),
                                                rotation=self._axis_euler(axis, rot))
        else:
            bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=r2, depth=depth,
                                            location=self.to_space(part, center),
                                            rotation=self._axis_euler(axis, rot))
        return self._prim(part, mat, bpy.context.object, bevel, 2)

    def torus(self, part, mat, center, major, minor, axis='y', scale=(1, 1, 1), segs=40, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segs,
                                         minor_segments=10, location=self.to_space(part, center))
        obj = bpy.context.object
        # Torus default lies in Blender XY (game XZ) => axis 'y' needs no extra rotation.
        obj.rotation_euler = {'y': (0, 0, 0), 'x': (0, math.pi / 2, 0), 'z': (math.pi / 2, 0, 0)}[axis]
        obj.rotation_euler = (obj.rotation_euler[0] + rot[0], obj.rotation_euler[1] - rot[2], obj.rotation_euler[2] + rot[1])
        obj.scale = (scale[0], scale[2], scale[1])
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        return self._prim(part, mat, obj, 0, 1)

    def tube(self, part, mat, points, radius, ribs=0, rib_depth=.18, segs=12, res=None, caps=True, r_end=None):
        """Swept tube along a Catmull-Rom spline. ribs > 0 gives a corrugated hose."""
        pts = [Vector(p) for p in points]
        length = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))
        res = res or max(8, int(length / .006) if ribs else int(length / .02))
        samples = [Vector(catmull([tuple(p) for p in pts], k / res)) for k in range(res + 1)]
        tangents = []
        for k in range(res + 1):
            a = samples[max(0, k - 1)]
            b = samples[min(res, k + 1)]
            tangents.append((b - a).normalized())
        ref = Vector((0, 1, 0)) if abs(tangents[0].y) < .9 else Vector((1, 0, 0))
        normal = tangents[0].cross(ref).normalized()
        verts, faces = [], []
        for k, (c, t) in enumerate(zip(samples, tangents)):
            normal = (normal - t * normal.dot(t)).normalized()
            binormal = t.cross(normal)
            r = radius if r_end is None else radius + (r_end - radius) * k / res
            if ribs:
                r *= 1 + rib_depth * (.5 + .5 * math.cos(k / res * length / (length / ribs) * TAU))
            for s in range(segs):
                a = s / segs * TAU
                verts.append(tuple(c + (normal * math.cos(a) + binormal * math.sin(a)) * r))
        for k in range(res):
            for s in range(segs):
                a = k * segs + s
                b = k * segs + (s + 1) % segs
                faces.append((a, b, b + segs, a + segs))
        if caps:
            for k in (0, res):
                verts.append(tuple(samples[k]))
                c = len(verts) - 1
                for s in range(segs):
                    a = k * segs + s
                    b = k * segs + (s + 1) % segs
                    faces.append((b, a, c) if k == 0 else (a, b, c))
        return self.mesh(part, mat, verts, faces, name='tube')

    def rivets(self, part, mat, positions, r=.006):
        for p in positions:
            self.ball(part, mat, p, (r, r, r), segs=8, rings=5)

    def ring_rivets(self, part, mat, lathe, y, count, offset, r=.005, t0=0.0, t1=TAU):
        closed = abs(t1 - t0 - TAU) < 1e-6
        n = count if closed else count - 1
        for i in range(count):
            self.ball(part, mat, lathe.point(t0 + (t1 - t0) * i / max(1, n), y, offset), (r, r, r), segs=8, rings=5)

    # -- build ------------------------------------------------------------
    def build(self):
        joined = []
        for part, objects in self.parts.items():
            if not objects:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                bpy.context.view_layer.objects.active = obj
                obj.select_set(True)
            bpy.ops.object.convert(target='MESH')  # applies all modifiers
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.join()
            obj = bpy.context.object
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            pivot = self.pivots[part]
            bpy.context.scene.cursor.location = self.to_space(part, pivot)
            bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
            obj.name = part
            obj.data.name = part
            joined.append(obj)
        bpy.ops.object.select_all(action='DESELECT')
        return joined


# ---------------------------------------------------------------------------
# Procedural PBR materials. Each surface exposes albedo/roughness/metallic
# sockets so the same network can be baked to texture maps.

class Nodes:
    def __init__(self, mat):
        self.t = mat.node_tree
        self.n = self.t.nodes
        self.l = self.t.links

    def add(self, kind, **inputs):
        node = self.n.new(kind)
        for key, value in inputs.items():
            if key.startswith('_'):
                setattr(node, key[1:], value)
            elif isinstance(value, bpy.types.NodeSocket):
                self.l.new(value, node.inputs[key])
            else:
                node.inputs[key].default_value = value
        return node

    def math(self, op, a, b=0.0, clamp=False):
        node = self.n.new('ShaderNodeMath')
        node.operation = op
        node.use_clamp = clamp
        for idx, v in enumerate((a, b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.l.new(v, node.inputs[idx])
            else:
                node.inputs[idx].default_value = v
        return node.outputs[0]

    def mix(self, fac, a, b, mode='MIX'):
        node = self.n.new('ShaderNodeMix')
        node.data_type = 'RGBA'
        node.blend_type = mode
        for sock, v in ((node.inputs[0], fac), (node.inputs[6], a), (node.inputs[7], b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.l.new(v, sock)
            elif isinstance(v, (int, float)):
                sock.default_value = v
            else:
                sock.default_value = (*v, 1) if len(v) == 3 else v
        return node.outputs[2]

    def mixf(self, fac, a, b):
        node = self.n.new('ShaderNodeMix')
        node.data_type = 'FLOAT'
        for sock, v in ((node.inputs[0], fac), (node.inputs[2], a), (node.inputs[3], b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.l.new(v, sock)
            else:
                sock.default_value = v
        return node.outputs[0]

    def ramp(self, value, lo, hi):
        node = self.n.new('ShaderNodeMapRange')
        node.clamp = True
        self.l.new(value, node.inputs[0])
        node.inputs[1].default_value = lo
        node.inputs[2].default_value = hi
        return node.outputs[0]


BAKED = []  # materials whose networks get baked into the atlas


def lin(c):
    def ch(v):
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    if isinstance(c, int):
        c = ((c >> 16) & 255, (c >> 8) & 255, c & 255)
        c = tuple(v / 255 for v in c)
    return tuple(ch(v) for v in c)


def surface(name, color, rough=.5, metal=0.0, *, var=.12, var_scale=6.0,
            edge=None, edge_amt=0.0, grime=(0x2a2318, .5), dust=None,
            camo=None, stripes=None, weave=0.0, wrinkle=0.0, scratch=0.0, bump=.15,
            patina=None, panel=0.0, mottling=0.0, streaks=0.0):
    """Universal physically based surface.

    edge: (color, rough, metal) exposed under chipped paint on convex edges.
    grime: (color, amount) settles in cavities via an ambient-occlusion mask.
    dust: (color, amount) settles on the lower body (feet/shins).
    camo: (color, scale, amount) blotchy secondary paint (olive camo).
    stripes: (color, scale, width) diagonal hazard stripes.
    weave: fabric weave bump frequency (cycles per metre, 0 = off).
    wrinkle: fabric wrinkle bump amount.
    patina: (color, amount) oxidised metal in cavities (copper/brass).
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    N = Nodes(mat)
    N.n.clear()
    out = N.add('ShaderNodeOutputMaterial')
    bsdf = N.add('ShaderNodeBsdfPrincipled')
    geo = N.add('ShaderNodeNewGeometry')
    pos = geo.outputs['Position']

    def noise(scale, detail=6.0, rough_=.55, vector=pos, dist=0.0, w=None):
        n = N.add('ShaderNodeTexNoise', Scale=scale, Detail=detail, Roughness=rough_, Distortion=dist)
        N.l.new(vector, n.inputs['Vector'])
        return n.outputs['Fac']

    base = lin(color)
    col = N.add('ShaderNodeRGB')
    col.outputs[0].default_value = (*base, 1)
    albedo = col.outputs[0]
    # Large-scale tonal variation keeps flat paint from looking CG.
    v1 = noise(var_scale, 4)
    albedo = N.mix(var, albedo, N.mix(N.ramp(v1, .3, .7), [c * .72 for c in base], [min(1, c * 1.22) for c in base]))
    rough_s = N.math('ADD', rough, N.math('MULTIPLY', N.math('SUBTRACT', noise(var_scale * 3, 3), .5), .12))
    metal_s = metal

    if mottling:
        m = noise(18, 8, .7)
        albedo = N.mix(N.math('MULTIPLY', N.ramp(m, .45, .75), mottling), albedo, [c * .55 for c in base])

    if camo:
        ccol, cscale, camt = camo
        c = noise(cscale, 3, .5, dist=1.5)
        albedo = N.mix(N.math('MULTIPLY', N.ramp(c, .5, .54), camt), albedo, lin(ccol))

    if stripes:
        scol, sscale, swidth = stripes
        vec = N.add('ShaderNodeVectorMath', _operation='DOT_PRODUCT')
        N.l.new(pos, vec.inputs[0])
        vec.inputs[1].default_value = (.7071, 0, .7071)
        w = N.math('FRACT', N.math('MULTIPLY', vec.outputs['Value'], sscale))
        mask = N.math('LESS_THAN', w, swidth)
        albedo = N.mix(mask, albedo, lin(scol))

    if panel:
        # Subtle panel-to-panel tonal shifts (Voronoi cells).
        vor = N.add('ShaderNodeTexVoronoi', Scale=panel)
        N.l.new(pos, vor.inputs['Vector'])
        albedo = N.mix(N.math('MULTIPLY', vor.outputs['Distance'], .25), albedo, [c * .8 for c in base])

    bump_h = N.math('MULTIPLY', noise(220, 3), .15)  # micro surface

    if weave:
        wa = N.add('ShaderNodeTexWave', _wave_type='BANDS', Scale=weave, Distortion=0)
        N.l.new(pos, wa.inputs['Vector'])
        wa.bands_direction = 'X'
        wb = N.add('ShaderNodeTexWave', _wave_type='BANDS', Scale=weave, Distortion=0)
        N.l.new(pos, wb.inputs['Vector'])
        wb.bands_direction = 'Z'
        wv = N.math('MULTIPLY', wa.outputs['Fac'], wb.outputs['Fac'])
        bump_h = N.math('ADD', bump_h, N.math('MULTIPLY', wv, .5))
        albedo = N.mix(N.math('MULTIPLY', wv, .25), albedo, [c * .7 for c in base])

    if wrinkle:
        mp = N.add('ShaderNodeMapping')
        N.l.new(pos, mp.inputs['Vector'])
        mp.inputs['Scale'].default_value = (3.0, 3.0, 1.0)  # wrinkles run around limbs
        wr = noise(9, 4, .5, vector=mp.outputs['Vector'], dist=2.0)
        ridge = N.math('ABSOLUTE', N.math('SUBTRACT', wr, .5))
        bump_h = N.math('ADD', bump_h, N.math('MULTIPLY', N.ramp(ridge, 0, .12), wrinkle * -1.5))
        albedo = N.mix(N.math('MULTIPLY', N.math('SUBTRACT', 1, N.ramp(ridge, 0, .08)), .25 * wrinkle), albedo, [c * .6 for c in base])

    if scratch:
        mp = N.add('ShaderNodeMapping')
        N.l.new(pos, mp.inputs['Vector'])
        mp.inputs['Scale'].default_value = (90, 7, 90)
        mp.inputs['Rotation'].default_value = (.4, .9, .3)
        sc = noise(3, 1, .5, vector=mp.outputs['Vector'])
        line = N.math('LESS_THAN', N.math('ABSOLUTE', N.math('SUBTRACT', sc, .5)), .0025)
        breakup = N.math('GREATER_THAN', noise(7, 2), .6)
        smask = N.math('MULTIPLY', N.math('MULTIPLY', line, breakup), scratch * .8)
        tgt = lin(edge[0]) if edge else [min(1, c * 1.5 + .03) for c in base]
        albedo = N.mix(smask, albedo, [a * .6 + b * .4 for a, b in zip(tgt, base)])
        rough_s = N.mixf(smask, rough_s, .3)
        bump_h = N.math('SUBTRACT', bump_h, N.math('MULTIPLY', smask, .3))

    if streaks:
        mp = N.add('ShaderNodeMapping')
        N.l.new(pos, mp.inputs['Vector'])
        mp.inputs['Scale'].default_value = (14, 14, 1.2)  # long vertical runs (Blender Z is up)
        st = noise(3, 4, .6, vector=mp.outputs['Vector'])
        sm = N.math('MULTIPLY', N.ramp(st, .5, .75), streaks)
        albedo = N.mix(sm, albedo, [c * .55 for c in base])
        rough_s = N.mixf(sm, rough_s, .75)

    # Edge wear: compare the bevel-rounded normal with the true normal to find
    # convex edges, then break it into chips with noise. A slightly lower
    # threshold darkens the paint lip around each chip.
    if edge and edge_amt:
        bev = N.add('ShaderNodeBevel', Radius=.02, _samples=10)
        dot = N.add('ShaderNodeVectorMath', _operation='DOT_PRODUCT')
        N.l.new(bev.outputs['Normal'], dot.inputs[0])
        N.l.new(geo.outputs['Normal'], dot.inputs[1])
        curv = N.ramp(N.math('SUBTRACT', 1, dot.outputs['Value']), .001, .025)
        chips = N.math('MULTIPLY', N.math('SUBTRACT', N.ramp(noise(18, 12, .72), .36, .64), .5), 1.5)
        value = N.math('ADD', N.math('MULTIPLY', curv, .85 * edge_amt), chips)
        wear = N.ramp(value, .62, .66)
        lip = N.math('SUBTRACT', N.ramp(value, .54, .62), wear)
        albedo = N.mix(N.math('MULTIPLY', lip, .6), albedo, [c * .45 for c in base])
        ecol, erough, emetal = edge
        albedo = N.mix(wear, albedo, lin(ecol))
        rough_s = N.mixf(wear, rough_s, erough)
        metal_s = N.mixf(wear, metal_s, emetal)
        bump_h = N.math('SUBTRACT', bump_h, N.math('MULTIPLY', N.ramp(value, .55, .62), .6))

    # Cavity grime from ambient occlusion.
    ao = N.add('ShaderNodeAmbientOcclusion', Distance=.035, _samples=12, _only_local=True)
    cav = N.math('SUBTRACT', 1, ao.outputs['AO'])
    if patina:
        pcol, pamt = patina
        pm = N.ramp(N.math('ADD', N.math('MULTIPLY', cav, 2.2), N.math('MULTIPLY', N.math('SUBTRACT', noise(14, 6, .6), .5), .9)), .35, .7)
        pm = N.math('MULTIPLY', pm, pamt)
        albedo = N.mix(pm, albedo, lin(pcol))
        rough_s = N.mixf(pm, rough_s, .85)
        metal_s = N.mixf(pm, metal_s, 0.0)
    gcol, gamt = grime
    gm = N.math('MULTIPLY', N.ramp(N.math('ADD', N.math('MULTIPLY', cav, 2.4), N.math('MULTIPLY', N.math('SUBTRACT', noise(10, 5), .5), .8)), .2, .9), gamt)
    albedo = N.mix(gm, albedo, lin(gcol))
    rough_s = N.mixf(N.math('MULTIPLY', gm, .7), rough_s, .9)
    if dust:
        dcol, damt = dust
        sep = N.add('ShaderNodeSeparateXYZ')
        N.l.new(pos, sep.inputs[0])
        low = N.ramp(sep.outputs['Z'], .45, .02)  # Blender Z = game height
        dm = N.math('MULTIPLY', N.ramp(N.math('ADD', N.math('MULTIPLY', low, 1.0), N.math('MULTIPLY', N.math('SUBTRACT', noise(16, 6), .5), .9)), .4, .9), damt)
        albedo = N.mix(dm, albedo, lin(dcol))
        rough_s = N.mixf(dm, rough_s, .95)
        metal_s = N.mixf(dm, metal_s, 0.0)

    if isinstance(rough_s, bpy.types.NodeSocket):
        rough_s = N.math('MINIMUM', N.math('MAXIMUM', rough_s, .03), 1)
    bmp = N.add('ShaderNodeBump', Strength=bump, Distance=.002)
    N.l.new(bump_h, bmp.inputs['Height'])

    N.l.new(albedo, bsdf.inputs['Base Color'])
    for sock, value in (('Roughness', rough_s), ('Metallic', metal_s)):
        if isinstance(value, bpy.types.NodeSocket):
            N.l.new(value, bsdf.inputs[sock])
        else:
            bsdf.inputs[sock].default_value = value
    N.l.new(bmp.outputs['Normal'], bsdf.inputs['Normal'])
    N.l.new(bsdf.outputs[0], out.inputs['Surface'])
    BAKED.append((mat, albedo, rough_s, metal_s, bsdf, out))
    return mat


def glow(name, color, strength=6.0, base=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*lin(base if base is not None else color), 1)
    bsdf.inputs['Emission Color'].default_value = (*lin(color), 1)
    bsdf.inputs['Emission Strength'].default_value = strength
    bsdf.inputs['Roughness'].default_value = .3
    return mat


def glass(name, color, rough=.04, alpha=.35, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*lin(color), 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Alpha'].default_value = alpha
    mat.blend_method = 'BLEND'
    return mat
