"""TRELLIS character pipeline stages (run inside Blender 4.2+).

    blender -b -P tools/trellis/process.py -- <stage> [character ...]

Stages: baseline  - Set A studio renders of the untouched original import
        master    - safe geometry refinement + PBR material upgrade; saves masters/<c>.blend
        enhanced  - Set B studio renders of the master
        runtime   - decimate, re-unwrap, bake from master, segment for the game rig, export GLB
        all       - every stage in order

Characters default to all four. Each stage records the source checksum in
reports/<c>_stages.json and is skipped when its inputs are unchanged
(set FORCE=1 to re-run).
"""
import json
import os
import sys
import traceback

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import common as C  # noqa: E402

CHARACTERS = ['lifeline', 'vanguard', 'wraith', 'bathysphere']
SAMPLES = int(os.environ.get('SAMPLES', 128))


def stage_state(character):
    path = os.path.join(C.DIRS['reports'], character + '_stages.json')
    return path, (json.load(open(path)) if os.path.exists(path) else {})


def up_to_date(character, stage, digest):
    path, state = stage_state(character)
    return not os.environ.get('FORCE') and state.get(stage, {}).get('sha256') == digest and state[stage].get('ok')


def mark(character, stage, digest, **info):
    path, state = stage_state(character)
    state[stage] = {'sha256': digest, 'ok': True, **info}
    json.dump(state, open(path, 'w'), indent=2)


def baseline(character):
    C.reset()
    obj = C.import_source(character)
    C.normalise(obj, character)
    out = os.path.join(C.DIRS['renders'], character)
    os.makedirs(out, exist_ok=True)
    cam = C.studio(SAMPLES)
    files = C.render_views(cam, C.config()[character]['target_height'], os.path.join(out, 'A'), subjects=[obj])
    return {'renders': [os.path.relpath(f, C.HERE) for f in files]}


# ---------------------------------------------------------------------------
# Master: safe refinement + PBR upgrade.

import math  # noqa: E402

import bmesh  # noqa: E402
import numpy as np  # noqa: E402

import materials as M  # noqa: E402


def mesh_health(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    stats = {
        'vertices': len(bm.verts), 'triangles': sum(len(f.verts) - 2 for f in bm.faces),
        'boundary_edges': sum(e.is_boundary for e in bm.edges),
        'non_manifold_edges': sum((not e.is_manifold) and not e.is_boundary for e in bm.edges),
        'inconsistent_winding_edges': sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
        'degenerate_faces': sum(f.calc_area() < 1e-12 for f in bm.faces),
        'loose_vertices': sum(not v.link_edges for v in bm.verts),
    }
    bm.free()
    return stats


def refine_geometry(obj):
    """Weld seam splits, drop degenerate faces / loose verts / tiny floaters,
    make winding consistent, and smooth-shade by angle so hard edges stay hard.
    No remeshing, subdivision, smoothing or decimation."""
    before = mesh_health(obj.data)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    welded = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    welded -= len(bm.verts)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
    loose = [v for v in bm.verts if not v.link_edges]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    # Floating fragments of a handful of vertices are reconstruction noise.
    bm.verts.ensure_lookup_table()
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
    bm.to_mesh(obj.data)
    bm.free()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35), keep_sharp_edges=True)
    after = mesh_health(obj.data)
    return {'before': before, 'after': after, 'welded_seam_vertices': welded, 'removed_floater_vertices': len(floaters),
            'bevels': 'not added: TRELLIS output is dense, irregular triangles with no clean edge loops, so a bevel '
                      'modifier produces artifacts; hard edges are kept via angle-based shading instead'}


def image(name, size, float_buffer=False, colorspace='Non-Color', alpha=True):
    img = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=float_buffer)
    img.colorspace_settings.name = colorspace
    return img


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def set_pixels(img, array):
    img.pixels.foreach_set(np.ascontiguousarray(array, np.float32).ravel())
    img.update()


def bake_with(obj, img, build, bake_type='EMIT', samples=1, margin=8):
    """Temporarily swaps in a material built by build(tree, out), bakes into img."""
    mat = bpy.data.materials.new('bake_tmp')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    build(nt, out)
    target = nt.nodes.new('ShaderNodeTexImage')
    target.image = img
    nt.nodes.active = target
    saved = [slot.material for slot in obj.material_slots]
    for slot in obj.material_slots:
        slot.material = mat
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.render.bake.margin = margin
    scene.render.bake.use_clear = True
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type=bake_type)
    for slot, m in zip(obj.material_slots, saved):
        slot.material = m
    bpy.data.materials.remove(mat)
    return pixels(img)


def emit_vector(kind):
    def build(nt, out):
        coord = nt.nodes.new('ShaderNodeTexCoord')
        em = nt.nodes.new('ShaderNodeEmission')
        if kind == 'position':
            nt.links.new(coord.outputs['Object'], em.inputs['Color'])
        else:
            geo = nt.nodes.new('ShaderNodeNewGeometry')
            tr = nt.nodes.new('ShaderNodeVectorTransform')
            tr.vector_type = 'NORMAL'
            tr.convert_from, tr.convert_to = 'WORLD', 'OBJECT'
            nt.links.new(geo.outputs['Normal'], tr.inputs['Vector'])
            nt.links.new(tr.outputs['Vector'], em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    return build


def wrinkle_normal(mask_img):
    """Low-frequency fabric folds (2-4 cm) only where mask_img is white. A true
    weave (~1-2 mm) is far below this atlas's texel size and would alias."""
    def build(nt, out):
        coord = nt.nodes.new('ShaderNodeTexCoord')
        mapping = nt.nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (1, 1, 2.5)  # folds run around limbs
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 38.0  # object units are ~1.9 m tall
        noise.inputs['Detail'].default_value = 3.0
        noise.inputs['Distortion'].default_value = 1.2
        mask = nt.nodes.new('ShaderNodeTexImage')
        mask.image = mask_img
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .35
        bump.inputs['Distance'].default_value = .004
        bsdf = nt.nodes.new('ShaderNodeBsdfDiffuse')
        nt.links.new(coord.outputs['Object'], mapping.inputs['Vector'])
        nt.links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
        nt.links.new(noise.outputs['Fac'], mul.inputs[0])
        nt.links.new(mask.outputs['Color'], mul.inputs[1])
        nt.links.new(mul.outputs[0], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    return build


def gltf_output_group():
    """The node group Blender's glTF exporter reads the occlusion map from."""
    group = bpy.data.node_groups.get('glTF Material Output')
    if group:
        return group
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    group.nodes.new('NodeGroupInput')
    return group


def save_png(img, path):
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    img.filepath = path
    img.source = 'FILE'


def master(character):
    cfg = C.config()[character]
    C.reset()
    source = C.import_source(character)
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = character + '_master'
    bpy.context.scene.collection.objects.link(obj)
    source.hide_render = source.hide_viewport = True
    report = {'geometry': refine_geometry(obj)}
    C.log('master', character, 'geometry', json.dumps(report['geometry']['after']))
    mat = obj.material_slots[0].material
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    base_node = bsdf.inputs['Base Color'].links[0].from_node
    mr_node = next(n for n in nodes if n.type == 'TEX_IMAGE' and n.image and n.image != base_node.image)
    size = base_node.image.size[0]
    tex_dir = os.path.join(C.DIRS['masters'], character + '_textures')
    os.makedirs(tex_dir, exist_ok=True)
    # Original artwork, decoded losslessly next to the master.
    save_png(base_node.image, os.path.join(tex_dir, 'basecolor_original.png'))
    save_png(mr_node.image, os.path.join(tex_dir, 'metalrough_original.png'))

    C.log('master', character, 'baking position/normal maps')
    pos = bake_with(obj, image('pos', size, True), emit_vector('position'))
    nrm = bake_with(obj, image('nrm', size, True), emit_vector('normal'))
    valid = pos[..., 3] > .5
    lo = pos[valid][:, :3].min(0)
    hi = pos[valid][:, :3].max(0)
    position = (pos[..., :3] - lo) / np.maximum(hi - lo, 1e-6)
    normal = nrm[..., :3] / np.maximum(np.linalg.norm(nrm[..., :3], axis=-1, keepdims=True), 1e-6)
    albedo = pixels(base_node.image)[..., :3]
    mr = pixels(mr_node.image)
    rough, metal = mr[..., 1], mr[..., 2]

    labels = M.classify(character, albedo, rough, metal, position, normal, valid, cfg['visor'], cfg['classes'])
    labels = M.fill_visor(labels, position, normal, valid)
    new_r, new_m, shares = M.synthesise(labels, rough, metal, cfg['classes'], keep=cfg.get('keep_variation', .5))
    report['class_coverage'] = {k: round(v, 4) for k, v in shares.items()}
    C.log('master', character, 'class coverage', json.dumps(report['class_coverage']))

    # TRELLIS paints reflections into visor albedo; under real reflections they read
    # as stickers. Visor texels take the visor's dark median colour (original saved).
    vmask = (labels == 'visor') & valid
    if vmask.any():
        base_px = pixels(base_node.image)
        dark = base_px[..., :3][vmask]
        lum = dark.mean(1)
        median = np.median(dark[lum <= np.percentile(lum, 60)], 0)
        base_px[..., :3][vmask] = median
        new_base = image(character + '_basecolor', size, colorspace='sRGB')
        set_pixels(new_base, base_px)
        save_png(new_base, os.path.join(tex_dir, 'basecolor.png'))
        base_node.image = new_base
        albedo = base_px[..., :3]
        report['visor_albedo_cleaned_texels'] = int(vmask.sum())
    fabric = ((labels == 'fabric') & valid).astype(np.float32)
    mask_img = image('fabric_mask', size)
    set_pixels(mask_img, np.dstack([fabric, fabric, fabric, np.ones_like(fabric)]))
    C.log('master', character, 'baking fabric fold normals and ambient occlusion')
    normal_img = image(character + '_normal', size)
    bake_with(obj, normal_img, wrinkle_normal(mask_img), 'NORMAL', samples=1)
    ao_img = image('ao', size)
    ao = bake_with(obj, ao_img, lambda nt, out: nt.links.new(nt.nodes.new('ShaderNodeBsdfDiffuse').outputs[0], out.inputs['Surface']),
                   'AO', samples=int(os.environ.get('AO_SAMPLES', 64)))[..., 0]
    ao = np.where(valid, ao, 1.0)

    orm_img = image(character + '_orm', size)
    set_pixels(orm_img, np.dstack([ao, new_r, new_m, np.ones_like(ao)]))
    visor = ((labels == 'visor') & valid).astype(np.float32)
    coat_img = image(character + '_coat', size)
    set_pixels(coat_img, np.dstack([visor, visor, visor, np.ones_like(visor)]))
    cls_img = image(character + '_classes', size, colorspace='sRGB')
    cmap = M.class_map(np.where(valid, labels, 'unclassified'))
    set_pixels(cls_img, np.dstack([cmap, np.ones(cmap.shape[:2], np.float32)]))
    for img, name in ((orm_img, 'orm.png'), (normal_img, 'normal.png'), (coat_img, 'visor_coat.png'), (cls_img, 'classes_qa.png')):
        save_png(img, os.path.join(tex_dir, name))

    # Export-compatible material: original base colour; ORM; normal; visor clearcoat.
    for link in list(bsdf.inputs['Alpha'].links):
        mat.node_tree.links.remove(link)
    bsdf.inputs['Alpha'].default_value = 1.0
    mat.blend_method = 'OPAQUE' if hasattr(mat, 'blend_method') else None
    for n in list(nodes):
        if n.type in ('TEX_IMAGE', 'SEPARATE_COLOR', 'SEPRGB', 'NORMAL_MAP') and n != base_node:
            nodes.remove(n)
    links = mat.node_tree.links
    orm = nodes.new('ShaderNodeTexImage')
    orm.image = orm_img
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(orm.outputs['Color'], sep.inputs[0])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    out_group = nodes.new('ShaderNodeGroup')
    out_group.node_tree = gltf_output_group()
    links.new(sep.outputs['Red'], out_group.inputs['Occlusion'])
    nmap_tex = nodes.new('ShaderNodeTexImage')
    nmap_tex.image = normal_img
    nmap = nodes.new('ShaderNodeNormalMap')
    links.new(nmap_tex.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    coat = nodes.new('ShaderNodeTexImage')
    coat.image = coat_img
    links.new(coat.outputs['Color'], bsdf.inputs['Coat Weight'])
    bsdf.inputs['Coat Roughness'].default_value = .03
    mat.name = character + '_suit'
    obj.data.materials[0] = mat

    for img in (bpy.data.images.get('pos'), bpy.data.images.get('nrm'), bpy.data.images.get('fabric_mask'), bpy.data.images.get('ao')):
        if img:
            bpy.data.images.remove(img)
    path = os.path.join(C.DIRS['masters'], character + '.blend')
    bpy.ops.wm.save_as_mainfile(filepath=path, relative_remap=True)
    report['master_blend'] = os.path.relpath(path, C.HERE)
    json.dump(report, open(os.path.join(C.DIRS['reports'], character + '_master.json'), 'w'), indent=2)
    return {'master': report['master_blend']}


def enhanced(character):
    path = os.path.join(C.DIRS['masters'], character + '.blend')
    bpy.ops.wm.open_mainfile(filepath=path)
    obj = bpy.data.objects[character + '_master']
    C.normalise(obj, character)
    out = os.path.join(C.DIRS['renders'], character)
    cam = C.studio(SAMPLES)
    files = C.render_views(cam, C.config()[character]['target_height'], os.path.join(out, 'B'), subjects=[obj])
    # QA: the material class map on the model.
    mat = obj.material_slots[0].material
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    cls = mat.node_tree.nodes.new('ShaderNodeTexImage')
    cls.image = bpy.data.images.load(os.path.join(C.DIRS['masters'], character + '_textures', 'classes_qa.png'))
    em = mat.node_tree.nodes.new('ShaderNodeEmission')
    out_node = next(n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
    mat.node_tree.links.new(cls.outputs['Color'], em.inputs['Color'])
    mat.node_tree.links.new(em.outputs[0], out_node.inputs['Surface'])
    bpy.context.scene.cycles.samples = 8
    files += C.render_views(cam, C.config()[character]['target_height'], os.path.join(out, 'QA_classes'),
                            views=['front', 'rear'], subjects=[obj])
    return {'renders': [os.path.relpath(f, C.HERE) for f in files]}


# ---------------------------------------------------------------------------
# Runtime: game-ready rigid-segment asset.

JOINTS = ['hips', 'upper', 'head', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
          'bicep_L', 'bicep_R', 'forearm_L', 'forearm_R', 'glove_L', 'glove_R']
RIG_FRACTIONS = {  # game rig proportions (dist/teammate.mjs) as fractions of 1.85 m
    'waist': 1.09 / 1.85, 'neck': 1.651 / 1.85, 'knee': .515 / 1.85, 'ankle': .167 / 1.85,
}


def landmarks(verts, character):
    """Joint landmarks of a T-posed suit (Blender axes, z up, faces +Y)."""
    cfg = C.config()[character]
    H = verts[:, 2].max()
    ax = np.abs(verts[:, 0])
    # Shoulder: moving outward from the spine, where the vertical extent of the
    # upper body collapses from torso height to arm thickness.
    upper = verts[verts[:, 2] > .55 * H]
    shoulder_x = None
    for x in np.arange(.08, .35, .005) * H:
        band = upper[np.abs(np.abs(upper[:, 0]) - x) < .005 * H]
        if len(band) > 20 and np.ptp(band[:, 2]) < .17 * H:
            shoulder_x = x
            break
    arms = verts[ax > shoulder_x + .04 * H]
    arm_z = float(np.median(arms[:, 2]))
    tip_x = float(ax.max())
    wrist_x = tip_x - .095 * H
    elbow_x = shoulder_x + (wrist_x - shoulder_x) * .5
    # Crotch: lowest point where geometry crosses the centre line between the legs.
    centre = verts[np.abs(verts[:, 0]) < .012 * H]
    crotch = float(centre[centre[:, 2] > .2 * H][:, 2].min()) if len(centre) else .45 * H
    legs = verts[(verts[:, 2] < crotch - .05 * H) & (verts[:, 2] > .2 * H)]
    leg_x = float(np.median(np.abs(legs[:, 0])))
    lm = {
        'height': H, 'shoulder_x': shoulder_x - .02 * H, 'arm_z': arm_z, 'elbow_x': elbow_x, 'wrist_x': wrist_x,
        'crotch': crotch, 'hip': crotch + .05 * H, 'leg_x': leg_x,
        'waist': RIG_FRACTIONS['waist'] * H, 'neck': RIG_FRACTIONS['neck'] * H,
        'knee': RIG_FRACTIONS['knee'] * H * (crotch / (.43 * H)), 'ankle': RIG_FRACTIONS['ankle'] * H,
    }
    lm['pad_width'] = cfg.get('pad_width', .05)
    for key, value in cfg.get('landmark_overrides', {}).items():
        lm[key] = value * H if key not in ('height',) else value
    return {k: float(v) for k, v in lm.items()}  # pad_width stays a fraction


def assign_parts(centres, lm):
    """Face centroid -> joint part name."""
    x, y, z = centres[:, 0], centres[:, 1], centres[:, 2]
    ax = np.abs(x)
    side = np.where(x < 0, 'L', 'R')
    part = np.empty(len(centres), dtype=object)
    # Shoulder pads stay on the torso (rotating them with the arm turns them into fins).
    arm = (ax > lm['shoulder_x'] + lm.get('pad_width', .05) * lm['height']) & (z > lm['waist'] + .05 * lm['height'])
    part[:] = 'upper'
    part[z > lm['neck']] = 'head'
    part[z <= lm['waist']] = 'hips'
    leg = z <= lm['crotch']
    part[leg & (z > lm['knee'])] = 'thigh'
    part[leg & (z <= lm['knee']) & (z > lm['ankle'])] = 'shin'
    part[leg & (z <= lm['ankle'])] = 'boot'
    part[arm & (ax <= lm['elbow_x'])] = 'bicep'
    part[arm & (ax > lm['elbow_x']) & (ax <= lm['wrist_x'])] = 'forearm'
    part[arm & (ax > lm['wrist_x'])] = 'glove'
    sided = np.isin(part, ['thigh', 'shin', 'boot', 'bicep', 'forearm', 'glove'])
    part[sided] = part[sided] + '_' + side[sided]
    return part


def to_game(p):
    """Blender (x, y, z) -> game (x, y, z)."""
    return [float(p[0]), float(p[2]), float(-p[1])]


def bake_from_master(master, low, img, kind, samples=1):
    """Selected-to-active bake from the master onto the low-poly runtime mesh."""
    mat = master.material_slots[0].material
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    temp = []
    if kind != 'NORMAL':
        em = nt.nodes.new('ShaderNodeEmission')
        temp.append(em)
        if kind == 'albedo':
            nt.links.new(bsdf.inputs['Base Color'].links[0].from_socket, em.inputs['Color'])
        else:  # orm: the master ORM texture as-is
            orm = next(n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name.endswith('_orm'))
            nt.links.new(orm.outputs['Color'], em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    lmat = low.material_slots[0].material
    target = lmat.node_tree.nodes.new('ShaderNodeTexImage')
    target.image = img
    lmat.node_tree.nodes.active = target
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = .012
    scene.render.bake.max_ray_distance = .04
    scene.render.bake.margin = 10
    bpy.ops.object.select_all(action='DESELECT')
    master.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type='NORMAL' if kind == 'NORMAL' else 'EMIT', normal_space='TANGENT')
    nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    for n in temp:
        nt.nodes.remove(n)
    lmat.node_tree.nodes.remove(target)


def runtime(character):
    path = os.path.join(C.DIRS['masters'], character + '.blend')
    bpy.ops.wm.open_mainfile(filepath=path)
    master_obj = bpy.data.objects[character + '_master']
    for o in list(bpy.data.objects):
        if o != master_obj:
            bpy.data.objects.remove(o)
    C.normalise(master_obj, character)
    bpy.ops.object.select_all(action='DESELECT')
    master_obj.select_set(True)
    bpy.context.view_layer.objects.active = master_obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    target_tris = int(os.environ.get('RUNTIME_TRIS', 45000))
    low = master_obj.copy()
    low.data = master_obj.data.copy()
    low.name = character + '_runtime'
    bpy.context.scene.collection.objects.link(low)
    src_tris = sum(len(p.vertices) - 2 for p in low.data.polygons)
    dec = low.modifiers.new('decimate', 'DECIMATE')
    dec.decimate_type = 'COLLAPSE'
    dec.ratio = target_tris / src_tris
    dec.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.modifier_apply(modifier='decimate')
    # Fresh material + clean atlas for the runtime mesh.
    lmat = bpy.data.materials.new(character + '_suit')
    lmat.use_nodes = True
    low.data.materials.clear()
    low.data.materials.append(lmat)
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name='UVMap')
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=.002, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=.002, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    size = int(os.environ.get('RUNTIME_TEXTURE', 2048))
    imgs = {'albedo': image(character + '_albedo', size, colorspace='sRGB', alpha=False),
            'orm': image(character + '_rt_orm', size, alpha=False),
            'normal': image(character + '_rt_normal', size, alpha=False)}
    C.log('runtime', character, 'baking %d px maps from the %d-tri master onto %d tris' % (
        size, src_tris, sum(len(p.vertices) - 2 for p in low.data.polygons)))
    bake_from_master(master_obj, low, imgs['albedo'], 'albedo')
    bake_from_master(master_obj, low, imgs['orm'], 'orm')
    bake_from_master(master_obj, low, imgs['normal'], 'NORMAL', samples=4)
    tex_dir = os.path.join(C.DIRS['work'], character)
    os.makedirs(tex_dir, exist_ok=True)
    for key, img in imgs.items():
        save_png(img, os.path.join(tex_dir, key + '.png'))
    nt = lmat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    a = nt.nodes.new('ShaderNodeTexImage')
    a.image = imgs['albedo']
    nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    o = nt.nodes.new('ShaderNodeTexImage')
    o.image = imgs['orm']
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(o.outputs['Color'], sep.inputs[0])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    g = nt.nodes.new('ShaderNodeGroup')
    g.node_tree = gltf_output_group()
    nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = imgs['normal']
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(n.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    bpy.data.objects.remove(master_obj)

    # Segment into rig joints.
    verts = np.array([v.co[:] for v in low.data.vertices])
    lm = landmarks(verts, character)
    C.log('runtime', character, 'landmarks', json.dumps({k: round(v, 3) for k, v in lm.items()}))
    centres = np.array([p.center[:] for p in low.data.polygons])
    parts = assign_parts(centres, lm)
    pivots = {
        'hips': (0, 0, lm['hip']), 'upper': (0, 0, lm['waist']), 'head': (0, 0, lm['neck']),
    }
    for sfx, s in (('L', -1), ('R', 1)):
        pivots['thigh_' + sfx] = (s * lm['leg_x'], 0, lm['hip'])
        pivots['shin_' + sfx] = (s * lm['leg_x'], 0, lm['knee'])
        pivots['boot_' + sfx] = (s * lm['leg_x'], 0, lm['ankle'])
        pivots['bicep_' + sfx] = (s * lm['shoulder_x'], 0, lm['arm_z'])
        pivots['forearm_' + sfx] = (s * lm['elbow_x'], 0, lm['arm_z'])
        pivots['glove_' + sfx] = (s * lm['wrist_x'], 0, lm['arm_z'])
    from mathutils import Matrix, Vector
    # Overlap bands: faces within ~1.5 cm of a cut go to both neighbouring pieces,
    # so rigid pieces cover each other when a joint bends instead of opening a crack.
    band = .008 * lm['height']
    shifted = []
    for sign in (-1, 1):
        moved = dict(lm)
        for key in ('neck', 'waist', 'crotch', 'knee', 'ankle'):
            moved[key] = lm[key] + sign * band
        for key in ('shoulder_x', 'elbow_x', 'wrist_x'):
            moved[key] = lm[key] + sign * band
        shifted.append(assign_parts(centres, moved))
    # Lower the T-posed arms with a smooth shoulder blend (like skin weights ramping
    # across the shoulder), applied after baking so UVs/textures are unaffected.
    # Pieces are then cut from the arms-down pose: no fins or stubs at the shoulder.
    H = lm['height']
    blend = .06 * H  # bend zone length, starting at the shoulder cut
    co = np.empty(len(low.data.vertices) * 3)
    low.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    dx = np.abs(co[:, 0]) - lm['shoulder_x']
    above = co[:, 2] > lm['waist'] + .05 * H
    t = np.clip(dx / blend, 0, 1)  # torso (dx <= 0) never moves; the bend lives in the bicep piece
    weight = np.where(above, t * t * (3 - 2 * t), 0.0)
    sgn = np.sign(co[:, 0])
    angle = weight * sgn * (math.pi / 2)  # +X arm: +90 deg about Y sends it to -Z
    px = sgn * lm['shoulder_x']
    rx, rz = co[:, 0] - px, co[:, 2] - lm['arm_z']
    co[:, 0] = px + rx * np.cos(angle) + rz * np.sin(angle)
    co[:, 2] = lm['arm_z'] - rx * np.sin(angle) + rz * np.cos(angle)
    low.data.vertices.foreach_set('co', co.ravel())
    low.data.update()
    bicep_len = lm['elbow_x'] - lm['shoulder_x']
    fore_len = lm['wrist_x'] - lm['elbow_x']
    for sfx, s in (('L', -1), ('R', 1)):
        shoulder = (s * lm['shoulder_x'], 0, lm['arm_z'])
        pivots['bicep_' + sfx] = shoulder
        pivots['forearm_' + sfx] = (shoulder[0], 0, lm['arm_z'] - bicep_len)
        pivots['glove_' + sfx] = (shoulder[0], 0, lm['arm_z'] - bicep_len - fore_len)
    objects, counts = [], {}
    for joint in JOINTS:
        keep = np.where((parts == joint) | (shifted[0] == joint) | (shifted[1] == joint))[0]
        counts[joint] = int(len(keep))
        if not len(keep):
            raise RuntimeError('No geometry assigned to joint ' + joint)
        obj = low.copy()
        obj.data = low.data.copy()
        bpy.context.scene.collection.objects.link(obj)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        keep_set = set(keep.tolist())
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep_set], context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
        pivot = Vector(pivots[joint])
        bmesh.ops.translate(bm, verts=bm.verts, vec=-pivot)
        kind, _, sfx = joint.partition('_')
        if kind in ('bicep', 'forearm'):
            # Already hanging down -Z (game -Y); the game stretches unit-length segments.
            bmesh.ops.scale(bm, verts=bm.verts, vec=(1, 1, 1 / (bicep_len if kind == 'bicep' else fore_len)))
        elif kind == 'glove':
            # The hand hangs down after the shoulder bend; turn the fingers forward (Blender +Y).
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.validate(clean_customdata=False)
        obj.name = obj.data.name = joint
        obj['pivot'] = to_game(pivot)
        objects.append(obj)
    bpy.data.objects.remove(low)
    # Export: one node per joint at the origin; pivots travel as glTF extras.
    raw = os.path.join(tex_dir, character + '_raw.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_extras=True,
                              export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_image_format='WEBP', export_image_quality=85,
                              export_cameras=False, export_lights=False)
    final = os.path.join(C.DIRS['runtime'], character + '.glb')
    import shutil
    import subprocess
    if shutil.which('gltfpack'):
        subprocess.run(['gltfpack', '-i', raw, '-o', final, '-cc', '-kn', '-km', '-ke', '-vt', '14'], check=True)
    else:
        shutil.copy(raw, final)
    info = {'source_triangles': src_tris, 'runtime_triangles': sum(counts.values()), 'joint_faces': counts,
            'landmarks_m': {k: round(v, 4) for k, v in lm.items()}, 'texture_size': size,
            'glb_bytes': os.path.getsize(final), 'raw_glb_bytes': os.path.getsize(raw)}
    json.dump(info, open(os.path.join(C.DIRS['reports'], character + '_runtime.json'), 'w'), indent=2)
    C.log('runtime', character, 'exported', final, info['glb_bytes'], 'bytes')
    return {'glb': os.path.relpath(final, C.ROOT), 'triangles': info['runtime_triangles']}


STAGES = {'baseline': baseline, 'master': master, 'enhanced': enhanced, 'runtime': runtime}


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not args:
        raise SystemExit(__doc__)
    stage, characters = args[0], args[1:] or CHARACTERS
    order = list(STAGES) if stage == 'all' else [stage]
    failures = []
    for character in characters:
        _, digest = C.source_path(character)
        for name in order:
            if up_to_date(character, name, digest):
                C.log(name, character, 'up to date; skipping (FORCE=1 to re-run)')
                continue
            try:
                C.log(name, character, 'start')
                info = STAGES[name](character) or {}
                mark(character, name, digest, **info)
                C.log(name, character, 'done')
            except Exception:
                C.log(name, character, 'FAILED\n' + traceback.format_exc())
                failures.append((character, name))
                break  # later stages depend on this one
    if failures:
        raise SystemExit('Failed: %s' % failures)


main()
