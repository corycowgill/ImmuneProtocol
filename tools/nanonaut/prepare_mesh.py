"""Makes the game mesh from the TRELLIS.2 scan the way game art is made: a low-poly mesh baked
from the high-poly one.

    blender -b -P tools/nanonaut/prepare_mesh.py -- [source.glb] [triangles]

The 295k-triangle scan is the high-poly source. A copy is decimated to the game budget with the
hands and helmet protected (a vertex-group weight, so fingers keep their shape), shaded smooth,
unwrapped afresh, and Cycles bakes the high mesh onto it: a tangent-space normal map (all the
fine relief the low mesh cannot carry), base colour, roughness and metallic from the scan's own
PBR maps, and ambient occlusion. Writes work/game_mesh.glb (textured) and work/rig_input.glb
(geometry only, for the auto-rigger)."""
import bpy, bmesh, os, sys, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CHARACTER = os.environ.get('CHARACTER', 'nanonaut')  # the Nanonaut or a co-op suit
WORK = os.path.join(HERE, 'work', *([] if CHARACTER == 'nanonaut' else [CHARACTER]))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SOURCE = ARGS[0] if ARGS else os.path.join(HERE, 'originals', 'nanonaut-trellis2-11.glb')
TRIS = int(ARGS[1]) if len(ARGS) > 1 else 60000
SIZE = int(os.environ.get('BAKE_SIZE', 2048))
HEIGHT = float(os.environ.get('HEIGHT', 1.84))  # metres, floor to helmet top


def log(*args):
    print('[prep]', *args, flush=True)


def health(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    out = {'verts': len(bm.verts), 'tris': sum(len(f.verts) - 2 for f in bm.faces), 'boundary': sum(e.is_boundary for e in bm.edges),
           'non_manifold': sum(not e.is_manifold and not e.is_boundary for e in bm.edges),
           'slivers': sum(1 for f in bm.faces if f.calc_area() < 1e-9)}
    bm.free()
    return out


def strip_inner(obj):
    """TRELLIS.2 surfaces are thin double-sided shells: an outer skin and an inward-facing copy a
    millimetre or two beneath it. The inner copy breaks baking (its rays start between the
    layers), occlusion and lighting. Keep only the faces seen from outside: a face survives if a
    ray from it escapes the model in some direction, tried nearest its own normal first."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    n = 96
    golden = math.pi * (3 - math.sqrt(5))
    dirs = np.array([[math.cos(golden * i) * math.sqrt(1 - (1 - 2 * (i + .5) / n) ** 2), math.sin(golden * i) * math.sqrt(1 - (1 - 2 * (i + .5) / n) ** 2),
                      1 - 2 * (i + .5) / n] for i in range(n)])
    hidden, flip = [], []
    for f in bm.faces:
        c, nrm = f.calc_center_median(), f.normal
        order = np.argsort(-(dirs @ np.array(nrm[:])))
        seen = False
        for k in order:
            d = Vector(dirs[k])
            if tree.ray_cast(c + d * 4e-4, d)[2] is None:
                seen = True
                break
        if not seen:
            hidden.append(f)
        elif d.dot(nrm) < 0:
            flip.append(f)  # seen only from behind: it faces inward
    bmesh.ops.reverse_faces(bm, faces=flip)
    bmesh.ops.delete(bm, geom=hidden, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    log('removed', len(hidden), 'hidden interior faces; turned', len(flip), 'inward-facing faces out')


def source_maps(obj):
    """The scan's base colour and metallic-roughness images, from its material's links."""
    base = mr = None
    nt = obj.data.materials[0].node_tree
    for link in nt.links:
        node, socket = link.from_node, link.to_socket.name
        while node.type != 'TEX_IMAGE' and node.inputs and node.inputs[0].is_linked:
            node = node.inputs[0].links[0].from_node
        if node.type != 'TEX_IMAGE':
            continue
        if link.to_socket.name == 'Base Color':
            base = node.image
        elif link.to_socket.name in ('Roughness', 'Metallic'):
            mr = node.image
    return base, mr


def image(name, colorspace='Non-Color'):
    img = bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    img.colorspace_settings.name = colorspace
    return img


def bake_onto(high, low, img, kind, build=None, samples=1, selected=True):
    scene = bpy.context.scene
    saved = [s.material for s in high.material_slots]
    if build:
        m = bpy.data.materials.new('bake_high')
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        build(nt, nt.nodes.new('ShaderNodeOutputMaterial'))
        for s in high.material_slots:
            s.material = m
    lm = low.data.materials[0]
    target = lm.node_tree.nodes.new('ShaderNodeTexImage')
    target.image = img
    lm.node_tree.nodes.active = target
    scene.cycles.samples = samples
    bake = scene.render.bake
    bake.use_selected_to_active = selected
    bake.cage_extrusion = .02
    bake.max_ray_distance = .06
    bake.margin = 8
    bpy.ops.object.select_all(action='DESELECT')
    if selected:
        high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type=kind)
    px = np.empty(SIZE * SIZE * 4, np.float32)
    img.pixels.foreach_get(px)
    log('bake', kind, img.name, 'mean', px.reshape(-1, 4)[:, :3].mean(0).round(3))
    lm.node_tree.nodes.remove(target)
    for s, mat in zip(high.material_slots, saved):
        s.material = mat
    img.filepath_raw = os.path.join(WORK, img.name + '.png')
    img.file_format = 'PNG'
    img.save()
    img.pack()
    log('baked', img.name, kind)


def emit_image(img, channel=None):
    def build(nt, out):
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    return build


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = os.environ.get('CYCLES_DEVICE', 'GPU')
    bpy.ops.import_scene.gltf(filepath=SOURCE)
    high = next(o for o in scene.objects if o.type == 'MESH')
    for o in list(scene.objects):
        if o is not high:
            bpy.data.objects.remove(o)
    high.parent = None
    bpy.context.view_layer.objects.active = high
    high.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    co = np.array([v.co[:] for v in high.data.vertices])
    lo, hi = co.min(0), co.max(0)
    centre = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
    high.data.vertices.foreach_set('co', ((co - centre) * HEIGHT / (hi[2] - lo[2])).ravel())
    high.data.update()
    bm = bmesh.new()
    bm.from_mesh(high.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(high.data)
    bm.free()
    high.name = 'high'
    strip_inner(high)
    log('high', health(high))
    base_img, mr_img = source_maps(high)
    log('source maps', base_img and base_img.name, mr_img and mr_img.name)

    low = high.copy()
    low.data = high.data.copy()
    low.name = low.data.name = 'nanonaut_game'
    scene.collection.objects.link(low)
    # Protect the hands and the helmet from the decimator: they hold the detail that reads first.
    co = np.array([v.co[:] for v in low.data.vertices])
    keep = low.vertex_groups.new(name='decimate')
    x, z = np.abs(co[:, 0]), co[:, 2]
    hands = (x > .45) & (z > .85) & (z < 1.3)
    helmet = z > 1.5
    weight = np.where(hands, .08, np.where(helmet, .4, 1.0))
    for i, w in enumerate(weight):
        keep.add([i], float(w), 'REPLACE')
    dec = low.modifiers.new('decimate', 'DECIMATE')
    dec.decimate_type = 'COLLAPSE'
    dec.ratio = TRIS / sum(len(p.vertices) - 2 for p in low.data.polygons)
    dec.use_collapse_triangulate = True
    dec.vertex_group = 'decimate'
    dec.vertex_group_factor = 1.0
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.modifier_apply(modifier='decimate')
    if low.vertex_groups.get('decimate'):
        low.vertex_groups.remove(low.vertex_groups['decimate'])
    if low.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth()
    log('low', health(low))
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.004, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=.004, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    mat = bpy.data.materials.new('nanonaut_suit')
    mat.use_nodes = True
    low.data.materials.clear()
    low.data.materials.append(mat)

    os.makedirs(WORK, exist_ok=True)
    albedo, rough_metal, normal = image('nanonaut_albedo', 'sRGB'), image('nanonaut_mr'), image('nanonaut_normal')
    bake_onto(high, low, albedo, 'EMIT', emit_image(base_img))
    bake_onto(high, low, rough_metal, 'EMIT', emit_image(mr_img))
    scene.render.bake.normal_space = 'TANGENT'
    bake_onto(high, low, normal, 'NORMAL', lambda nt, out: nt.links.new(nt.nodes.new('ShaderNodeBsdfPrincipled').outputs[0], out.inputs['Surface']), samples=4)
    # Occlusion, roughness and metallic in one ORM map, as glTF reads it.
    mr = np.empty(SIZE * SIZE * 4, np.float32); rough_metal.pixels.foreach_get(mr); mr = mr.reshape(-1, 4)
    orm = image('nanonaut_orm')
    # The scan's albedo already carries its shading, and an open single-layer shell bakes occlusion too
    # dark: occlusion is left at one (unshadowed); roughness and metallic come from the scan.
    orm_px = np.stack([np.ones(len(mr)), mr[:, 1], mr[:, 2], np.ones(len(mr))], 1)
    orm.pixels.foreach_set(orm_px.astype(np.float32).ravel())
    orm.update()
    orm.filepath_raw = os.path.join(WORK, 'nanonaut_orm.png'); orm.file_format = 'PNG'; orm.save(); orm.pack()

    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = albedo
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = orm
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(t.outputs['Color'], sep.inputs[0])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    group.nodes.new('NodeGroupInput')
    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = group
    nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = normal
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(t.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])

    bpy.data.objects.remove(high)
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.export_scene.gltf(filepath=os.path.join(WORK, 'game_mesh.glb'), export_format='GLB', use_selection=True,
                              export_image_format='WEBP', export_image_quality=92, export_normals=True, export_tangents=False)
    bpy.ops.export_scene.gltf(filepath=os.path.join(WORK, 'rig_input.glb'), export_format='GLB', use_selection=True, export_materials='NONE')
    log('wrote game_mesh.glb', os.path.getsize(os.path.join(WORK, 'game_mesh.glb')), 'rig_input.glb', os.path.getsize(os.path.join(WORK, 'rig_input.glb')))


main()
