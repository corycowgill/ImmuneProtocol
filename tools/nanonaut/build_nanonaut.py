"""Builds the enemy Nanonaut: a skinned, animated human in a red and yellow biosuit.

    blender -b -P tools/nanonaut/build_nanonaut.py -- [--skip-bake] [--preview] [--portrait]

Source: tools/nanonaut/originals/nanonaut-7.glb, generated on Hugging Face from FLUX.1 Krea
concept art (concept.py) by TRELLIS (generate.py). This script
  1. scales it to 1.84 m, welds seams, drops floaters and smooth-shades it by angle;
  2. derives physically based maps from the TRELLIS albedo: roughness/metallic per material
     class (red and yellow paint, black rubber and webbing, bare metal, the visor), Cycles
     ambient occlusion, a fabric-fold and paint-chip normal map, and an emissive visor;
  3. builds a 22-bone skeleton at the scan's own joints, with control bones for the carbine
     (`weapon`) and hand and foot IK, and skins the mesh with heat weights computed on a
     watertight voxel proxy and transferred back (TRELLIS meshes are not manifold);
  4. authors the motion set by hand-placed keys on the IK controls, then bakes every clip to
     plain forward kinematics so the game needs no IK solver:
       lower body  Stand, Walk, StrafeL, StrafeR, Run, Crouch, CrouchWalk
       upper body  Aim, LowReady, Cover, Reload
       full body   DodgeL, DodgeR, DeathBack, DeathFront, Stagger
     The game splits each clip at the spine and blends the two halves as separate layers
     (nanonaut-view.mjs), so it can aim while it strafes, reload while it runs, and so on;
  5. exports dist/assets/enemies/nanonaut.glb and the guide portrait.

The carbine itself is the game's own model (arsenal-models.mjs), held by the `weapon` bone:
its +Y runs down the barrel and +Z is up; the grip sits at the bone, the support hand
FOREGRIP ahead of it."""
import bpy, bmesh, math, os, sys, json, shutil, subprocess
from mathutils import Vector, Matrix, Quaternion, Euler
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SOURCE = os.path.join(HERE, 'originals', 'nanonaut-7.glb')
WORK = os.environ.get('NANONAUT_OUTPUT', os.path.join(HERE, 'work'))
OUT = os.path.join(ROOT, 'dist', 'assets', 'enemies', 'nanonaut.glb')
PORTRAIT = os.path.join(ROOT, 'dist', 'assets', 'enemies', 'portraits', 'nanonaut.webp')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HEIGHT = 1.84
FPS = 30
# The carbine in the weapon bone's frame (metres, +Y down the barrel, +Z up): the firing hand's
# wrist sits just behind and below the bone, the support hand's under the handguard. Matches GRIP in nanonaut-view.mjs.
GRIP = Vector((0, -.05, -.06))
FOREGRIP = Vector((0, .15, -.06))
TEXTURE = 2048


def log(*args):
    print('[nanonaut]', *args, flush=True)


# ---------------------------------------------------------------------------------- mesh

def import_source():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=SOURCE)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    obj = meshes[0]
    for o in list(bpy.context.scene.objects):
        if o != obj:
            bpy.data.objects.remove(o)
    obj.parent = None
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    co = np.array([v.co[:] for v in obj.data.vertices])
    lo, hi = co.min(0), co.max(0)
    scale = HEIGHT / (hi[2] - lo[2])
    centre = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]))
    for v in obj.data.vertices:
        v.co = (v.co - centre) * scale
    obj.name = obj.data.name = 'nanonaut_scan'
    return obj


def refine(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
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
        if len(island) < 24:
            floaters.extend(island)
    bmesh.ops.delete(bm, geom=floaters, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40), keep_sharp_edges=True)
    log('mesh', len(obj.data.polygons), 'faces,', len(floaters), 'floater vertices removed')


# ------------------------------------------------------------------------------ textures

def image(name, size, colorspace='Non-Color', float_buffer=False):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=float_buffer)
    img.colorspace_settings.name = colorspace
    return img


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def set_pixels(img, array):
    img.pixels.foreach_set(np.ascontiguousarray(array, np.float32).ravel())
    img.update()


def bake(obj, img, build, kind='EMIT', samples=1, margin=6):
    mat = bpy.data.materials.new('bake')
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
    scene.cycles.device = 'GPU' if os.environ.get('CYCLES_GPU', '1') == '1' else 'CPU'
    scene.cycles.samples = samples
    scene.render.bake.margin = margin
    scene.render.bake.use_clear = True
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type=kind)
    for slot, m in zip(obj.material_slots, saved):
        slot.material = m
    bpy.data.materials.remove(mat)
    return pixels(img)


def albedo_image(obj):
    for node in obj.data.materials[0].node_tree.nodes:
        if node.type == 'TEX_IMAGE':
            return node.image
    raise RuntimeError('The TRELLIS source has no base colour texture')


def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, d / (mx + 1e-6), mx


def build_maps(obj, normal_img=None):
    """ORM, normal and emission maps on the scan's own UVs, from its albedo."""
    albedo = albedo_image(obj)
    albedo.colorspace_settings.name = 'sRGB'
    size = albedo.size[0]
    base = pixels(albedo)[..., :3]
    lin = base  # Blender hands back linear values for an sRGB image
    srgb = np.where(lin <= .0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 0, 1), 1 / 2.4) - .055)
    h, s, v = hsv(srgb)
    # Where each texel lives on the body, to find the visor.
    pos = image('position', size, float_buffer=True)  # signed metres
    position = bake(obj, pos, lambda nt, out: (
        nt.links.new(nt.nodes.new('ShaderNodeTexCoord').outputs['Object'], (em := nt.nodes.new('ShaderNodeEmission')).inputs['Color']),
        nt.links.new(em.outputs[0], out.inputs['Surface'])))[..., :3]
    valid = np.abs(position).sum(-1) > 1e-5
    red = ((h < .045) | (h > .93)) & (s > .38) & (v > .16)
    yellow = (h > .09) & (h < .2) & (s > .4) & (v > .3)
    dark = v < .2
    metal = (s < .1) & (v > .55) & ~yellow
    visor = (position[..., 2] > 1.5) & (position[..., 1] < -.02) & ((h < .13) | (h > .97)) & (s > .4) & (v > .18)
    rough = np.full(v.shape, .62, np.float32)
    rough[red] = .5
    rough[yellow] = .46
    rough[dark] = .74
    rough[metal] = .34
    rough[visor] = .06
    metallic = np.zeros_like(rough)
    metallic[metal] = .82
    # Keep a little of the scan's own grime as roughness variation.
    rough = np.clip(rough + (.5 - v) * .12, .04, .95)
    ao_img = image('ao', size)
    scene = bpy.context.scene
    scene.render.bake.use_selected_to_active = False
    ao = bake(obj, ao_img, lambda nt, out: nt.links.new(nt.nodes.new('ShaderNodeBsdfDiffuse').outputs[0], out.inputs['Surface']),
              kind='AO', samples=int(os.environ.get('AO_SAMPLES', 96)))[..., 0]
    ao = np.where(valid, np.clip(.35 + .65 * ao, 0, 1), 1)
    orm = np.stack([ao, rough, metallic, np.ones_like(ao)], -1)
    orm_img = image('nanonaut_orm', size)
    set_pixels(orm_img, orm)
    # Fabric folds on the suit cloth, and relief from the paint chips and stitching in the albedo.
    cloth = (red | yellow) & ~visor
    mask_img = image('cloth', size)
    set_pixels(mask_img, np.stack([cloth.astype(np.float32)] * 3 + [np.ones_like(rough)], -1))
    lum_img = image('relief', size)
    lum = (srgb[..., 0] * .3 + srgb[..., 1] * .59 + srgb[..., 2] * .11).astype(np.float32)
    set_pixels(lum_img, np.stack([lum] * 3 + [np.ones_like(lum)], -1))

    def normal_tree(nt, out):
        coord = nt.nodes.new('ShaderNodeTexCoord')
        mapping = nt.nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (1, 1, 2.6)
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 21.0
        noise.inputs['Detail'].default_value = 4.0
        noise.inputs['Distortion'].default_value = 1.3
        mask = nt.nodes.new('ShaderNodeTexImage')
        mask.image = mask_img
        relief = nt.nodes.new('ShaderNodeTexImage')
        relief.image = lum_img
        folds = nt.nodes.new('ShaderNodeMath')
        folds.operation = 'MULTIPLY'
        chips = nt.nodes.new('ShaderNodeMath')
        chips.operation = 'MULTIPLY'
        chips.inputs[1].default_value = .35
        total = nt.nodes.new('ShaderNodeMath')
        total.operation = 'ADD'
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .5
        bump.inputs['Distance'].default_value = .005
        bsdf = nt.nodes.new('ShaderNodeBsdfDiffuse')
        nt.links.new(coord.outputs['Object'], mapping.inputs['Vector'])
        nt.links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
        nt.links.new(noise.outputs['Fac'], folds.inputs[0])
        nt.links.new(mask.outputs['Color'], folds.inputs[1])
        nt.links.new(relief.outputs['Color'], chips.inputs[0])
        nt.links.new(folds.outputs[0], total.inputs[0])
        nt.links.new(chips.outputs[0], total.inputs[1])
        nt.links.new(total.outputs[0], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    if normal_img is None:
        normal_img = image('nanonaut_normal', size)
        scene.render.bake.normal_space = 'TANGENT'
        bake(obj, normal_img, normal_tree, kind='NORMAL', samples=4)
    emission = np.zeros_like(orm)
    glow = visor[..., None] * np.array([1., .42, .08, 1.], np.float32)
    emission[...] = glow
    emission[..., 3] = 1
    emit_img = image('nanonaut_emission', size, 'sRGB')
    set_pixels(emit_img, emission)
    log('maps: red %.1f%% yellow %.1f%% dark %.1f%% metal %.1f%% visor %.2f%%' % tuple(
        100 * m[valid].mean() for m in (red, yellow, dark, metal, visor)))
    # Wire them into the exported material.
    mat = bpy.data.materials.new('nanonaut_suit')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    a = nt.nodes.new('ShaderNodeTexImage')
    a.image = albedo
    nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    o = nt.nodes.new('ShaderNodeTexImage')
    o.image = orm_img
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(o.outputs['Color'], sep.inputs[0])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    group = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    if not group.interface.items_tree:
        group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        group.nodes.new('NodeGroupInput')
    g = nt.nodes.new('ShaderNodeGroup')
    g.node_tree = group
    nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = normal_img
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(n.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    e = nt.nodes.new('ShaderNodeTexImage')
    e.image = emit_img
    nt.links.new(e.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    os.makedirs(WORK, exist_ok=True)
    for img in (orm_img, normal_img, emit_img):
        img.filepath_raw = os.path.join(WORK, img.name + '.png')
        img.file_format = 'PNG'
        img.save()
        img.pack()


# ---------------------------------------------------------------------------- skeleton

# Joints measured on the scan (fractions of its height; +X is the character's left, -Y forward).
J = {
    'hips': (0, .005, .525), 'spine': (0, .005, .585), 'chest': (0, 0, .675), 'neck': (0, -.006, .805),
    'head': (0, -.016, .848), 'head_end': (0, -.016, .985),
    'clavicle': (.03, .004, .772), 'shoulder': (.143, .014, .783), 'elbow': (.232, -.024, .667),
    'wrist': (.292, -.118, .607), 'hand_end': (.333, -.178, .556),
    'thigh': (.08, .004, .49), 'knee': (.089, .0, .284), 'ankle': (.108, .03, .078),
    'ball': (.114, -.045, .02), 'toe': (.114, -.094, .016),
}


def at(name, side=1):
    x, y, z = JR.get(name, J[name]) if side < 0 else J[name]
    return Vector((x * side * HEIGHT, y * HEIGHT, z * HEIGHT))


DEFORM = ['hips', 'spine', 'chest', 'neck', 'head'] + [b + s for s in ('_L', '_R') for b in
          ('clavicle', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe')]


def build_skeleton(obj):
    arm_data = bpy.data.armatures.new('nanonaut_rig')
    rig = bpy.data.objects.new('nanonaut_rig', arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, roll_up=None, deform=True, connect=False):
        b = eb.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        b.use_deform = deform
        if roll_up is not None:
            b.align_roll(roll_up)
        return b

    fwd = Vector((0, -1, 0))
    bone('root', Vector((0, 0, 0)), Vector((0, -.3, 0)), deform=False, roll_up=Vector((0, 0, 1)))
    bone('hips', at('hips'), at('spine'), 'root', roll_up=fwd)
    bone('spine', at('spine'), at('chest'), 'hips', roll_up=fwd, connect=True)
    bone('chest', at('chest'), at('neck'), 'spine', roll_up=fwd, connect=True)
    bone('neck', at('neck'), at('head'), 'chest', roll_up=fwd, connect=True)
    bone('head', at('head'), at('head_end'), 'neck', roll_up=fwd, connect=True)
    for sfx, s in (('_L', 1), ('_R', -1)):
        bone('clavicle' + sfx, at('clavicle', s), at('shoulder', s), 'chest', roll_up=Vector((0, 0, 1)))
        bone('upperarm' + sfx, at('shoulder', s), at('elbow', s), 'clavicle' + sfx, roll_up=Vector((0, 1, 0)), connect=True)
        bone('forearm' + sfx, at('elbow', s), at('wrist', s), 'upperarm' + sfx, roll_up=Vector((0, 1, 0)), connect=True)
        bone('hand' + sfx, at('wrist', s), at('hand_end', s), 'forearm' + sfx, roll_up=Vector((0, 0, 1)), connect=True)
        bone('thigh' + sfx, at('thigh', s), at('knee', s), 'hips', roll_up=fwd)
        bone('shin' + sfx, at('knee', s), at('ankle', s), 'thigh' + sfx, roll_up=fwd, connect=True)
        bone('foot' + sfx, at('ankle', s), at('ball', s), 'shin' + sfx, roll_up=Vector((0, 0, 1)), connect=True)
        bone('toe' + sfx, at('ball', s), at('toe', s), 'foot' + sfx, roll_up=Vector((0, 0, 1)), connect=True)
        # Foot IK: the target sits at the ankle and carries the foot's orientation.
        ik = bone('ik_foot' + sfx, at('ankle', s), at('ankle', s) + (at('ball', s) - at('ankle', s)), 'root', deform=False,
                  roll_up=Vector((0, 0, 1)))
        bone('pole_knee' + sfx, at('knee', s) + Vector((0, -.6, 0)), at('knee', s) + Vector((0, -.7, 0)), 'ik_foot' + sfx, deform=False)
        bone('pole_elbow' + sfx, at('elbow', s) + Vector((s * .35, .45, -.25)), at('elbow', s) + Vector((s * .35, .55, -.25)), 'chest', deform=False)
    # The carbine: grip at the bone's head, barrel along +Y of the bone (forward, -Y in the rest pose).
    w = bone('weapon', Vector((-.07, -.36, 1.4)), Vector((-.07, -.56, 1.4)), 'chest', deform=False, roll_up=Vector((0, 0, 1)))
    for sfx, local in (('_R', GRIP), ('_L', FOREGRIP)):
        # Blender's bone frame: +Y along the bone (forward), +Z up; GRIP is in that frame.
        head = w.head + Vector((local.x, -local.y, local.z))
        hand = eb['hand' + sfx]
        bone('ik_hand' + sfx, head, head + (hand.tail - hand.head), 'weapon', deform=False, roll_up=hand.z_axis)
    bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for sfx, s in (('_L', 1), ('_R', -1)):
        c = rig.pose.bones['shin' + sfx].constraints.new('IK')
        c.target, c.subtarget, c.pole_target, c.pole_subtarget = rig, 'ik_foot' + sfx, rig, 'pole_knee' + sfx
        c.pole_angle = math.radians(-90)
        c.chain_count = 2
        c = rig.pose.bones['foot' + sfx].constraints.new('COPY_ROTATION')
        c.target, c.subtarget = rig, 'ik_foot' + sfx
        c = rig.pose.bones['forearm' + sfx].constraints.new('IK')
        c.target, c.subtarget, c.pole_target, c.pole_subtarget = rig, 'ik_hand' + sfx, rig, 'pole_elbow' + sfx
        c.pole_angle = math.radians(-90)
        c.chain_count = 2
        c.name = 'arm_ik'
        c = rig.pose.bones['hand' + sfx].constraints.new('COPY_ROTATION')
        c.target, c.subtarget = rig, 'ik_hand' + sfx
        c.name = 'hand_ik'
    bpy.ops.object.mode_set(mode='OBJECT')
    calibrate_poles(rig)
    return rig


def calibrate_poles(rig):
    """Finds each IK chain's pole angle: the one at which the solved chain, with its target and pole
    where they rest, matches the rest pose exactly (no twist). A wrong angle twists the limb about its
    own axis, which smooth skin shows at once as a wrung-out knee, ankle or elbow."""
    bpy.context.view_layer.update()
    for chain, upper in (('shin', 'thigh'), ('forearm', 'upperarm')):
        for sfx in ('_L', '_R'):
            pb = rig.pose.bones[chain + sfx]
            c = next(c for c in pb.constraints if c.type == 'IK')
            if chain == 'forearm':
                # The hand targets rest on the carbine, not at the wrists: test against the wrist.
                target = rig.pose.bones['ik_hand' + sfx]
                saved = target.location.copy()
                target.matrix = Matrix.Translation(rig.data.bones[chain + sfx].tail_local) @ target.matrix.to_3x3().to_4x4()
            best = None
            for deg in range(-180, 180, 2):
                c.pole_angle = math.radians(deg)
                bpy.context.view_layer.update()
                err = sum(rig.pose.bones[b + sfx].matrix.to_3x3().to_quaternion().rotation_difference(
                    rig.data.bones[b + sfx].matrix_local.to_3x3().to_quaternion()).angle for b in (upper, chain))
                if best is None or err < best[0]:
                    best = (err, deg)
            c.pole_angle = math.radians(best[1])
            if chain == 'forearm':
                target.location = saved
            bpy.context.view_layer.update()
            log('pole', chain + sfx, best[1], 'degrees, rest error %.2f deg' % math.degrees(best[0]))


def remesh(high):
    """A clean, watertight copy of the scan for deformation: a voxel remesh closes TRELLIS's holes
    and overlapping shells, QuadriFlow lays even quads over it (edge loops round every limb, so it
    bends without collapsing), and it is unwrapped afresh for the bakes from the scan."""
    low = high.copy()
    low.data = high.data.copy()
    low.name = low.data.name = 'nanonaut'
    bpy.context.scene.collection.objects.link(low)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = low
    low.select_set(True)
    rem = low.modifiers.new('remesh', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = float(os.environ.get('VOXEL', .0065))
    rem.adaptivity = 0
    bpy.ops.object.modifier_apply(modifier='remesh')
    target = int(os.environ.get('QUADS', 13000))
    before = len(low.data.polygons)
    try:
        result = bpy.ops.object.quadriflow_remesh(target_faces=target, use_preserve_sharp=False, use_preserve_boundary=False,
                                                  use_mesh_symmetry=False, smooth_normals=False, mode='FACES')
    except RuntimeError as error:
        result = {'CANCELLED', str(error)}
    if len(low.data.polygons) > target * 1.6:
        log('QuadriFlow did not finish (%s); decimating to the budget instead' % (result,))
        dec = low.modifiers.new('decimate', 'DECIMATE')
        dec.ratio = target * 2 / max(1, sum(len(f.vertices) - 2 for f in low.data.polygons))
        bpy.ops.object.modifier_apply(modifier='decimate')
    else:
        log('QuadriFlow:', before, '->', len(low.data.polygons), 'quads')
    bpy.ops.object.shade_smooth()
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.003, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=.003, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    log('remesh:', len(low.data.vertices), 'vertices,', sum(len(f.vertices) - 2 for f in low.data.polygons), 'triangles,',
        'manifold' if all(e.is_manifold for e in bmesh_edges(low)) else 'NOT manifold')
    return low


def bmesh_edges(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    edges = [type('E', (), {'is_manifold': e.is_manifold})() for e in bm.edges]
    bm.free()
    return edges


def transfer(high, low):
    """Bakes the scan onto the clean mesh: its colour, and its surface (the scan's own geometric
    detail plus fabric folds and the relief of its paint chips and stitching) as a normal map."""
    size = TEXTURE
    albedo = albedo_image(high)
    albedo.colorspace_settings.name = 'sRGB'
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU' if os.environ.get('CYCLES_GPU', '1') == '1' else 'CPU'
    bake_settings = scene.render.bake
    bake_settings.use_selected_to_active = True
    bake_settings.cage_extrusion = .012
    bake_settings.max_ray_distance = .05
    bake_settings.margin = 8

    def bake_onto(img, kind, build_high, samples=1):
        hm = bpy.data.materials.new('high')
        hm.use_nodes = True
        nt = hm.node_tree
        nt.nodes.clear()
        build_high(nt, nt.nodes.new('ShaderNodeOutputMaterial'))
        saved = [sl.material for sl in high.material_slots]
        for sl in high.material_slots:
            sl.material = hm
        lm = bpy.data.materials.new('low')
        lm.use_nodes = True
        t = lm.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = img
        lm.node_tree.nodes.active = t
        low.data.materials.clear()
        low.data.materials.append(lm)
        scene.cycles.samples = samples
        bpy.ops.object.select_all(action='DESELECT')
        high.select_set(True)
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.bake(type=kind)
        for sl, m in zip(high.material_slots, saved):
            sl.material = m
        return img

    def colour(nt, out):
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = albedo
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    base = image('nanonaut_albedo', size, 'sRGB')
    bake_onto(base, 'EMIT', colour)

    def surface(nt, out):
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = albedo
        lum = nt.nodes.new('ShaderNodeRGBToBW')
        coord = nt.nodes.new('ShaderNodeTexCoord')
        mapping = nt.nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (1, 1, 2.6)
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 21.0
        noise.inputs['Detail'].default_value = 4.0
        mix = nt.nodes.new('ShaderNodeMath')
        mix.operation = 'MULTIPLY_ADD'
        mix.inputs[1].default_value = .35
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .45
        bump.inputs['Distance'].default_value = .004
        bsdf = nt.nodes.new('ShaderNodeBsdfDiffuse')
        nt.links.new(tex.outputs['Color'], lum.inputs['Color'])
        nt.links.new(coord.outputs['Object'], mapping.inputs['Vector'])
        nt.links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
        nt.links.new(lum.outputs[0], mix.inputs[0])
        nt.links.new(noise.outputs['Fac'], mix.inputs[2])
        nt.links.new(mix.outputs[0], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    normal = image('nanonaut_normal', size)
    bake_settings.normal_space = 'TANGENT'
    bake_onto(normal, 'NORMAL', surface, samples=4)
    bake_settings.use_selected_to_active = False
    # The clean mesh now carries the scan's colour; the PBR maps are derived from it.
    m = bpy.data.materials.new('nanonaut_source')
    m.use_nodes = True
    t = m.node_tree.nodes.new('ShaderNodeTexImage')
    t.image = base
    m.node_tree.links.new(t.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    low.data.materials.clear()
    low.data.materials.append(m)
    os.makedirs(WORK, exist_ok=True)
    for img in (base, normal):
        img.filepath_raw = os.path.join(WORK, img.name + '.png')
        img.file_format = 'PNG'
        img.save()
        img.pack()
    return normal


def fit_joints(low):
    """Moves every joint to the centre of its limb's cross-section on the clean mesh, so each bone
    runs down the middle of what it moves (heat weighting needs its bones inside the body)."""
    co = np.array([v.co[:] for v in low.data.vertices])
    H = HEIGHT
    limbs = {'shoulder': ('clavicle', 'elbow'), 'elbow': ('shoulder', 'wrist'), 'wrist': ('elbow', 'hand_end'),
             'thigh': (None, 'knee'), 'knee': ('thigh', 'ankle'), 'ankle': ('knee', 'ball')}
    for s in (1, -1):
        for name, (prev, nxt) in limbs.items():
            j = np.array(at(name, s))
            a = np.array(at(prev, s)) if prev else j + np.array([0, 0, .2])
            b = np.array(at(nxt, s))
            axis = b - a
            axis /= np.linalg.norm(axis)
            for _ in range(3):
                rel = co - j
                along = rel @ axis
                radial = rel - along[:, None] * axis
                sel = (np.abs(along) < .02) & (np.linalg.norm(radial, axis=1) < .13) & (np.sign(co[:, 0]) == s)
                if sel.sum() < 12:
                    break
                shift = radial[sel].mean(0)
                j = j + shift
            x, y, z = j / H
            if s == 1:
                J[name] = (abs(x), y, z)
            else:
                JR[name] = (abs(x), y, z)
    # The trunk: centre each spine joint in its horizontal slice.
    # The trunk keeps its measured centre line: its slices include the pack and pouches, which
    # would drag the spine backwards.
    log('joints fitted:', {k: tuple(round(c * H, 3) for c in v) for k, v in J.items() })


JR = {}  # the right side's own fitted joints (the scan is not quite symmetric)


# Gear that must not bend: bound wholly to one bone, with a short blend at its edge.
def rigid_gear(low, rig):
    co = np.array([v.co[:] for v in low.data.vertices])
    H = HEIGHT
    groups = {g.name: g for g in low.vertex_groups}
    bones = rig.data.bones
    zones = []
    # Helmet (above the collar) to the head.
    zones.append(('head', np.clip((co[:, 2] - .835 * H) / .05, 0, 1) * (np.abs(co[:, 0]) < .15)))
    # The back pack and the chest rig's pouches ride the chest.
    pack = np.clip((co[:, 1] - .12) / .05, 0, 1) * np.clip((.15 - np.abs(co[:, 0])) / .05, 0, 1) * ((co[:, 2] > .6 * H) & (co[:, 2] < .76 * H))
    zones.append(('chest', pack))
    for sfx, s in (('_L', 1), ('_R', -1)):
        side = np.sign(co[:, 0]) == s
        hand = bones['hand' + sfx]
        axis = np.array((hand.tail_local - hand.head_local).normalized()[:])
        along = (co - np.array(hand.head_local[:])) @ axis
        zones.append(('hand' + sfx, np.clip(along / .04, 0, 1) * side * (np.linalg.norm(co - np.array(hand.head_local[:]), axis=1) < .2)))
        # Boots below the cuff to the foot (the toe keeps the front of the sole).
        zones.append(('foot' + sfx, np.clip((.115 * H - co[:, 2]) / .05, 0, 1) * side))
    for bone, w in zones:
        idx = np.where(w > 0)[0]
        for i in idx:
            v = low.data.vertices[i]
            k = float(w[i])
            for g in v.groups:
                name = low.vertex_groups[g.group].name
                if bone.startswith('foot') and name.startswith('toe'):
                    continue
                g.weight = g.weight * (1 - k) + (k if name == bone else 0)
            if not any(low.vertex_groups[g.group].name == bone for g in v.groups):
                groups[bone].add([int(i)], k, 'ADD')
    log('gear bound rigidly:', {b: int((w > .99).sum()) for b, w in zones})


def read_weights(low):
    names = [g.name for g in low.vertex_groups]
    W = np.zeros((len(low.data.vertices), len(names)))
    for v in low.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    return names, W


def write_weights(low, names, W):
    for j, name in enumerate(names):
        group = low.vertex_groups[name]
        group.remove(list(range(len(low.data.vertices))))
        idx = np.where(W[:, j] > 1e-4)[0]
        for i in idx:
            group.add([int(i)], float(W[i, j]), 'REPLACE')


def mask_weights(low, rig):
    """Keeps each bone to its own part of the body, so heat diffusion cannot leak a leg into a
    waist pouch or an arm down the ribs. Each region fades out over a few centimetres rather than
    stopping at a line: a hard edge in the weights is itself a tear waiting for the joint to bend.
    Then every vertex's weights are renormalized."""
    H = HEIGHT
    co = np.array([v.co[:] for v in low.data.vertices])
    x, z = np.abs(co[:, 0]), co[:, 2]
    above = lambda v, edge, width: np.clip((v - edge) / width + .5, 0, 1)
    below = lambda v, edge, width: np.clip((edge - v) / width + .5, 0, 1)
    sx, sz = J['shoulder'][0] * H, J['shoulder'][2] * H
    region = {
        'hips': below(z, .62 * H, .08), 'spine': above(z, .47 * H, .06) * below(z, .8 * H, .06), 'chest': above(z, .58 * H, .06),
        'neck': above(z, .74 * H, .05), 'head': above(z, .8 * H, .05) * below(x, .17, .05) * below(co[:, 1], .15, .05),
        'clavicle': above(z, .68 * H, .06) * below(z, .85 * H, .05) * above(x, .06, .04),
        'upperarm': above(x, sx - .07, .05) * np.maximum(above(z, sz - .13, .08), above(x, sx + .03, .05)),
        'forearm': above(x, sx + .06, .05), 'hand': above(x, sx + .17, .04),
        'thigh': below(z, .52 * H, .06), 'shin': below(z, .36 * H, .06), 'foot': below(z, .115 * H, .04), 'toe': below(z, .06 * H, .04),
    }
    left = co[:, 0] >= 0
    names, W = read_weights(low)
    before = (W > .01).sum()
    for j, name in enumerate(names):
        base, _, sfx = name.partition('_')
        m = region.get(base, np.ones(len(co)))
        if sfx:
            mine = left if sfx == 'L' else ~left
            # A side's bones stay on their side; the thighs meet and blend across the crotch.
            other = below(x, .05, .05) if base == 'thigh' else np.zeros(len(co))
            m = m * np.where(mine, 1, other)
        W[:, j] *= m
    total = W.sum(1)
    empty = total < 1e-6
    if empty.any():
        trunk = np.where(z < .55 * H, names.index('hips'), np.where(z < .8 * H, names.index('chest'), names.index('head')))
        W[np.where(empty)[0], trunk[empty]] = 1
        total = W.sum(1)
    W /= total[:, None]
    write_weights(low, names, W)
    log('weights faded to their regions:', int(before - (W > .01).sum()), 'stray influences removed')


def skin(low, rig):
    """Heat-diffusion weights on the clean mesh, then gear made rigid, then the glTF hygiene:
    smoothed across the joints, at most four bones per vertex, normalized, no weights under 0.01."""
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for b in rig.data.bones:
        if not b.use_deform and low.vertex_groups.get(b.name):
            low.vertex_groups.remove(low.vertex_groups[b.name])
    for name in DEFORM:
        if not low.vertex_groups.get(name):
            low.vertex_groups.new(name=name)
    empty = [n for n in DEFORM if not any(g.group == low.vertex_groups[n].index for v in low.data.vertices for g in v.groups if g.weight > .2)]
    if empty:
        log('WARNING heat weighting left bones without influence:', empty)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = low
    low.select_set(True)
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.mode_set(mode='OBJECT')
    mask_weights(low, rig)
    rigid_gear(low, rig)
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=.5, repeat=int(os.environ.get('SMOOTH', 4)))
    bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    loose = sum(1 for v in low.data.vertices if not v.groups)
    log('skinned:', len(low.data.vertices), 'vertices,', loose, 'unweighted;', 'empty bones:', empty or 'none')


# ------------------------------------------------------------------------------ posing

def q(pitch=0, yaw=0, roll=0):
    """A rotation about the armature's own axes: pitch about X (+ tips an upright bone
    forward), yaw about Z (+ turns to the character's left), roll about Y (+ leans left)."""
    return (Quaternion((0, 0, 1), math.radians(yaw)) @ Quaternion((0, 1, 0), math.radians(roll)) @
            Quaternion((1, 0, 0), math.radians(pitch)))


class Pose:
    """One key: rotations for FK bones, positions/orientations for the IK controls."""

    def __init__(self, **rot):
        self.rot = rot  # bone -> (pitch, yaw, roll)
        self.hips = Vector((0, 0, 0))
        self.feet = {}  # side -> (offset from rest ankle, (pitch, yaw, roll))
        self.weapon = None  # (position in armature space, (pitch, yaw, roll) of the barrel)
        self.ik = {'_L': 1.0, '_R': 1.0}
        self.hand = {}  # side -> fn(weapon matrix) -> where that wrist goes, when it leaves the carbine

    def copy(self):
        p = Pose(**dict(self.rot))
        p.hips = self.hips.copy()
        p.feet = dict(self.feet)
        p.weapon = self.weapon
        p.ik = dict(self.ik)
        p.hand = dict(self.hand)
        return p


def apply(rig, pose, frame, upper=True, lower=True):
    bones = rig.pose.bones
    rest = {b.name: b.matrix_local.to_quaternion() for b in rig.data.bones}
    lower_bones = {'root', 'hips', 'ik_foot_L', 'ik_foot_R', 'pole_knee_L', 'pole_knee_R'}
    for pb in bones:
        is_lower = pb.name in lower_bones
        if (is_lower and not lower) or (not is_lower and not upper):
            continue
        if pb.name.startswith(('ik_hand', 'pole_elbow', 'weapon')) or pb.name.startswith(('ik_foot', 'pole_knee')):
            continue
        r = pose.rot.get(pb.name, (0, 0, 0))
        R = rest[pb.name]
        pb.rotation_quaternion = R.inverted() @ q(*r) @ R
        pb.keyframe_insert('rotation_quaternion', frame=frame)
    if lower:
        hips = bones['hips']
        hips.location = rest['hips'].inverted() @ pose.hips
        hips.keyframe_insert('location', frame=frame)
        for sfx in ('_L', '_R'):
            offset, rot = pose.feet.get(sfx, (Vector((0, 0, 0)), (0, 0, 0)))
            pb = bones['ik_foot' + sfx]
            R = rest[pb.name]
            pb.location = R.inverted() @ Vector(offset)
            pb.rotation_quaternion = R.inverted() @ q(*rot) @ R
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('rotation_quaternion', frame=frame)
    if upper:
        for sfx in ('_L', '_R'):
            for name in ('arm_ik', 'hand_ik'):
                c = bones[('forearm' if name == 'arm_ik' else 'hand') + sfx].constraints[name]
                c.influence = pose.ik[sfx]
                c.keyframe_insert('influence', frame=frame)
        if pose.weapon:
            bpy.context.view_layer.update()
            position, (pitch, yaw, roll) = pose.weapon
            w = bones['weapon']
            target = Matrix.Translation(Vector(position)) @ (q(pitch, yaw, roll) @ rest['weapon']).to_matrix().to_4x4()
            w.matrix = target
            bpy.context.view_layer.update()
            w.keyframe_insert('location', frame=frame)
            w.keyframe_insert('rotation_quaternion', frame=frame)
        bpy.context.view_layer.update()
        weapon = bones['weapon'].matrix.copy()
        for sfx in ('_L', '_R'):
            pb = bones['ik_hand' + sfx]
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
            if sfx in pose.hand:
                bpy.context.view_layer.update()
                m = pb.matrix.copy()
                m.translation = pose.hand[sfx](weapon)
                pb.matrix = m
                bpy.context.view_layer.update()
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('rotation_quaternion', frame=frame)


def stance(depth=0.0):
    """The rifleman's base: knees soft, left foot forward, weight over the balls of the feet."""
    p = Pose()
    p.hips = Vector((0, .01, -.04 - depth))
    # Bladed from the hips, support side forward, so the waist barely has to twist.
    p.rot['hips'] = (0, -16, 0)
    p.feet['_L'] = (Vector((.015, -.1, 0)), (0, 6, 0))
    p.feet['_R'] = (Vector((-.04, .14, 0)), (0, -24, 0))
    return p


def aim(p, sway=(0, 0, 0), height=0.0):
    """Cheek on the stock, support elbow down: the carbine shouldered and level."""
    sx, sy, sz = sway
    p.rot.update(spine=(7, -5, 0), chest=(5, -3, 0), neck=(-4, 12, 0), head=(-9, 12, 3),
                 clavicle_L=(0, -15, 0), clavicle_R=(0, 5, 3))
    p.weapon = (Vector((-.065 + sx, -.35 + sy, 1.425 + sz + height + p.hips.z + .04)), (0 + sz * 20, -1, 0))
    return p


def low_ready(p, bob=0.0, swing=0.0):
    """Muzzle down and across the body: how it carries the carbine on the move."""
    p.rot.update(spine=(12, -8, 0), chest=(6, -8, 0), neck=(-8, 8, 0), head=(-6, 8, 0),
                 clavicle_L=(0, -6, 0), clavicle_R=(0, 4, 0))
    p.weapon = (Vector((-.1 + swing * .02, -.32, 1.16 + bob + p.hips.z + .04)), (-28, 26 + swing * 4, -12))
    return p


CLIPS = {}


def clip(name, frames, loop=True, part='full'):
    def register(fn):
        CLIPS[name] = (fn, frames, loop, part)
        return fn
    return register


def cycle_feet(p, t, stride, lift, duty, lateral=False, width=0.0, cross=0.0, speed_sign=1):
    """In-place locomotion: each foot slides back along the ground for the duty fraction of the
    cycle, then swings forward in an arc. t in [0, 1); right foot half a cycle behind the left."""
    for sfx, phase in (('_L', 0), ('_R', .5)):
        u = (t + phase) % 1
        base, rot = p.feet[sfx]
        if u < duty:
            k = u / duty
            along = stride * (.5 - k)
            up = 0
            heel = (-8 * (1 - k) * (1 - k) if not lateral else 0) + (14 * max(0, k - .7) / .3 if not lateral else 0)
        else:
            k = (u - duty) / (1 - duty)
            s = .5 - .5 * math.cos(math.pi * k)
            along = stride * (-.5 + s)
            up = lift * math.sin(math.pi * k) ** 1.4
            heel = 18 * (1 - k) ** 2 - 12 * k * k if not lateral else 0
        if lateral:
            offset = Vector((along * speed_sign, -abs(cross) * math.sin(math.pi * min(1, max(0, (u - duty) / (1 - duty)))) * (1 if sfx == '_R' else 0), up))
        else:
            offset = Vector((0, -along, up))
        p.feet[sfx] = (base + offset, (rot[0] - heel, rot[1], rot[2]))


def walk_pose(t, stride=.82, aimed=True):
    p = Pose()
    p.hips = Vector((0, 0, -.045 - .022 * math.cos(4 * math.pi * t + .6)))
    p.feet['_L'] = (Vector((.01, 0, 0)), (0, 4, 0))
    p.feet['_R'] = (Vector((-.01, 0, 0)), (0, -4, 0))
    cycle_feet(p, t, stride, .1, .6)
    swing = math.sin(2 * math.pi * t)
    p.rot['hips'] = (0, 5 * swing, 2 * math.sin(2 * math.pi * t + math.pi / 2))
    if aimed:
        aim(p, sway=(.004 * swing, 0, .006 * math.cos(4 * math.pi * t)))
        # The upper body holds its aim: counter the pelvis's turn.
        sp = p.rot['spine']
        p.rot['spine'] = (sp[0], sp[1] - 5 * swing, sp[2] - 2 * math.sin(2 * math.pi * t + math.pi / 2))
    return p


@clip('Stand', 60, part='lower')
def stand(f):
    t = f / 60
    p = stance()
    p.hips += Vector((.01 * math.sin(2 * math.pi * t), 0, .006 * math.sin(4 * math.pi * t)))
    p.rot['hips'] = (0, -4, 1.2 * math.sin(2 * math.pi * t))
    return p


@clip('Walk', 33, part='lower')  # 1.1 s cycle, 1.49 m/s
def walk(f):
    return walk_pose(f / 33)


@clip('Run', 22, part='lower')  # 0.73 s cycle, 4.4 m/s
def run(f):
    t = f / 22
    p = Pose()
    p.hips = Vector((0, -.04, -.07 - .04 * math.cos(4 * math.pi * t + .9)))
    p.feet['_L'] = (Vector((.0, 0, 0)), (0, 3, 0))
    p.feet['_R'] = (Vector((-.0, 0, 0)), (0, -3, 0))
    cycle_feet(p, t, 1.0, .26, .38)
    swing = math.sin(2 * math.pi * t)
    p.rot['hips'] = (10, 9 * swing, 3 * math.sin(2 * math.pi * t + math.pi / 2))
    return p


def strafe_pose(t, direction):
    p = Pose()
    p.hips = Vector((0, 0, -.06 - .02 * math.cos(4 * math.pi * t)))
    p.feet['_L'] = (Vector((.04, -.06, 0)), (0, 10 * direction, 0))
    p.feet['_R'] = (Vector((-.04, .06, 0)), (0, 10 * direction, 0))
    cycle_feet(p, t, .62, .11, .55, lateral=True, cross=.12, speed_sign=-direction)
    p.rot['hips'] = (0, -12 * direction, 3 * direction * math.sin(4 * math.pi * t))
    aim(p)
    sp = p.rot['spine']
    p.rot['spine'] = (sp[0], sp[1] + 12 * direction, sp[2] - 3 * direction * math.sin(4 * math.pi * t))
    return p


@clip('StrafeL', 30, part='lower')  # 1 s cycle, ~1.13 m/s to the left
def strafe_l(f):
    return strafe_pose(f / 30, 1)


@clip('StrafeR', 30, part='lower')
def strafe_r(f):
    return strafe_pose(f / 30, -1)


def crouch_pose(t=0.0, walk_t=None):
    p = Pose()
    p.hips = Vector((0, .1, -.5 + .006 * math.sin(2 * math.pi * t)))
    if walk_t is None:
        # Kneeling on the right knee behind cover, left foot planted forward.
        p.feet['_L'] = (Vector((.03, -.3, 0)), (0, 8, 0))
        p.feet['_R'] = (Vector((-.05, .36, .1)), (52, -12, 0))
        p.rot['hips'] = (16, -6, 0)
    else:
        p.feet['_L'] = (Vector((.06, -.05, 0)), (0, 6, 0))
        p.feet['_R'] = (Vector((-.06, .05, 0)), (0, -6, 0))
        p.hips.z = -.44 - .02 * math.cos(4 * math.pi * walk_t)
        cycle_feet(p, walk_t, .56, .1, .62)
        p.rot['hips'] = (20, 4 * math.sin(2 * math.pi * walk_t), 0)
    return p


@clip('Crouch', 60, part='lower')
def crouch(f):
    return crouch_pose(f / 60)


@clip('CrouchWalk', 36, part='lower')  # 1.2 s cycle, 0.75 m/s
def crouch_walk(f):
    return crouch_pose(0, f / 36)


@clip('Aim', 60, part='upper')
def aim_clip(f):
    t = f / 60
    p = stance()
    breathe = math.sin(2 * math.pi * t)
    aim(p, sway=(.002 * math.sin(2 * math.pi * t * 2 + 1), 0, .004 * breathe))
    c = p.rot['chest']
    p.rot['chest'] = (c[0] - 1.2 * breathe, c[1], c[2])
    return p


@clip('LowReady', 44, part='upper')
def low_ready_clip(f):
    t = f / 44
    p = stance()
    low_ready(p, bob=.008 * math.sin(4 * math.pi * t), swing=math.sin(2 * math.pi * t))
    return p


@clip('Cover', 60, part='upper')
def cover_clip(f):
    t = f / 60
    p = stance()
    # Carbine held upright against the chest, head down, glancing to the side.
    p.rot.update(spine=(18, -6, 0), chest=(8, -4, 0), neck=(10, 10 + 6 * math.sin(2 * math.pi * t), 0), head=(6, 8, 0))
    p.weapon = (Vector((-.025, -.22, 1.1 + p.hips.z + .04)), (62, 16, -8))
    return p


@clip('Reload', 66, loop=False, part='upper')  # 2.2 s
def reload(f):
    p = stance()
    aim(p)
    # Bring the carbine down and in, tilt it, strip the magazine, seat the new one, rack it, back up.
    k = f / 66
    def ease(a, b):
        x = min(1, max(0, (k - a) / (b - a)))
        return x * x * (3 - 2 * x)
    down = ease(0, .14) * (1 - ease(.82, 1))
    pos, (pt, yw, rl) = p.weapon
    pos = pos.lerp(Vector((-.04, -.33, 1.22 + p.hips.z + .04)), down)
    p.weapon = (pos, (pt + 14 * down, yw + 28 * down, rl - 32 * down))
    p.rot['head'] = (p.rot['head'][0] + 18 * down, p.rot['head'][1] - 10 * down, 0)
    p.rot['spine'] = (p.rot['spine'][0] + 6 * down, p.rot['spine'][1], 0)
    # The support hand works the magazine on IK: grab it, strip it and let it fall, take a fresh
    # one from the chest rig, seat it, slap it home, rack the charging handle, back to the handguard.
    on_gun = lambda local: (lambda w: w @ Vector(local))
    beside = lambda local, offset: (lambda w: w @ Vector(local) + Vector(offset))
    pouch = lambda w: Vector((.07, -.2, 1.13 + p.hips.z + .04))
    path = [(.12, on_gun(FOREGRIP)), (.24, on_gun((0, .08, -.15))), (.34, beside((0, .08, -.15), (.08, -.05, -.24))),
            (.46, pouch), (.52, pouch), (.62, beside((0, .08, -.2), (0, 0, -.02))), (.67, on_gun((0, .08, -.15))),
            (.7, on_gun((0, .08, -.135))), (.74, on_gun((0, .08, -.15))), (.81, on_gun((.045, -.01, .035))),
            (.86, on_gun((.045, -.1, .035))), (.97, on_gun(FOREGRIP))]
    if path[0][0] < k < path[-1][0]:
        for (t0, a0), (t1, a1) in zip(path, path[1:]):
            if t0 <= k <= t1:
                x = (k - t0) / (t1 - t0)
                x = x * x * (3 - 2 * x)
                p.hand['_L'] = lambda w, a0=a0, a1=a1, x=x: a0(w).lerp(a1(w), x)
                break
    p.rot['clavicle_L'] = (0, -9 + 5 * ease(.3, .45) * (1 - ease(.6, .7)), 0)
    return p


def death_pose(k, back):
    """k in [0, 1]: legs buckle, the body twists off the hit and hits the floor; the carbine slips."""
    p = stance()
    s = 1 if back else -1
    def ease(a, b, power=2):
        x = min(1, max(0, (k - a) / (b - a)))
        return 1 - (1 - x) ** power
    buckle, fall, settle = ease(0, .3), ease(.18, .62, 3), ease(.6, 1)
    lie = fall * 1.0
    p.hips = Vector((0, .25 * s * lie, -.04 - .78 * lie - .12 * buckle * (1 - lie)))
    p.rot['hips'] = (-84 * s * lie, 22 * buckle, 10 * lie * s)
    p.feet['_L'] = (Vector((.06, -.12 - .1 * buckle + .35 * s * lie, .05 * (1 - settle) * lie)), (-60 * lie * s, 20, 0))
    p.feet['_R'] = (Vector((-.12, .1 - .3 * buckle * (0 if back else 1) + .25 * s * lie, .08 * lie)), (-40 * lie * s, -40, 0))
    p.rot['spine'] = (-14 * s * buckle - 6 * settle, 14 * buckle, 0)
    p.rot['chest'] = (-12 * s * buckle, 10 * buckle, -8 * settle)
    p.rot['neck'] = (-30 * s * buckle + 14 * settle * s, 0, 0)
    p.rot['head'] = (-20 * s * buckle + 20 * settle * s, 26 * settle, 14 * settle)
    # The support hand lets go as the hit lands; the firing hand keeps the carbine until it hits the floor.
    p.ik['_L'] = 1 - ease(0, .12)
    p.ik['_R'] = 1 - ease(.55, .7)
    p.rot['upperarm_L'] = (60 * s * buckle - 20 * settle, 30 * buckle, -40 * buckle)
    p.rot['forearm_L'] = (-30 * buckle, 0, 0)
    p.rot['upperarm_R'] = (40 * s * settle, -30 * settle, 30 * settle)
    p.rot['forearm_R'] = (-25 * settle, 0, 0)
    aim_pos = Vector((-.075, -.4, 1.385))
    floor = Vector((-.42, -.3 + .5 * s, .05))
    gun = aim_pos.lerp(Vector((-.2, -.35 + .4 * s, .7)), fall).lerp(floor, settle)
    p.weapon = (gun, (-30 * fall - 60 * settle * s, -40 * fall, 80 * settle))
    return p


@clip('DeathBack', 48, loop=False)
def death_back(f):
    return death_pose(f / 48, True)


@clip('DeathFront', 48, loop=False)
def death_front(f):
    return death_pose(f / 48, False)


def dodge_pose(k, direction):
    """A low sidestep dive: drop, push off the outside foot, land in a crouch with the carbine up."""
    p = stance()
    def bell(a, b):
        x = min(1, max(0, (k - a) / (b - a)))
        return math.sin(math.pi * x)
    def ease(a, b):
        x = min(1, max(0, (k - a) / (b - a)))
        return x * x * (3 - 2 * x)
    drop = bell(0, 1)
    push = bell(.08, .5)
    land = ease(.4, .7) * (1 - ease(.75, 1))
    d = direction
    p.hips = Vector((0, .04, -.04 - .34 * drop + .06 * push))
    p.rot['hips'] = (10 * drop, 0, 18 * d * push - 6 * d * land)
    # Feet: the trailing foot pushes off and swings over; both land wide.
    p.feet['_L'] = (Vector((.06 + .18 * (d > 0) * land - .14 * (d < 0) * push, -.08, .16 * push * (d < 0))), (0, 8, 0))
    p.feet['_R'] = (Vector((-.06 - .18 * (d < 0) * land + .14 * (d > 0) * push, .1, .16 * push * (d > 0))), (0, -20, 0))
    aim(p)
    sp = p.rot['spine']
    p.rot['spine'] = (sp[0] + 10 * drop, sp[1], sp[2] - 16 * d * push)
    pos, rot = p.weapon
    p.weapon = (pos + Vector((0, 0, -.12 * drop)), (rot[0] - 10 * push, rot[1], rot[2] + 25 * d * push))
    return p


@clip('DodgeL', 21, loop=False)  # 0.7 s
def dodge_l(f):
    return dodge_pose(f / 21, 1)


@clip('DodgeR', 21, loop=False)
def dodge_r(f):
    return dodge_pose(f / 21, -1)


@clip('Stagger', 18, loop=False)  # 0.6 s: a heavy hit rocks it back a step
def stagger(f):
    k = f / 18
    hit = math.sin(math.pi * min(1, k / .55)) * (1 - max(0, k - .55) / .45 * .4) if k < 1 else 0
    p = stance()
    p.hips += Vector((0, .1 * hit, -.03 * hit))
    p.feet['_R'] = (p.feet['_R'][0] + Vector((0, .12 * hit, .06 * math.sin(math.pi * min(1, k * 1.6)))), p.feet['_R'][1])
    aim(p)
    sp = p.rot['spine']
    p.rot['spine'] = (sp[0] - 16 * hit, sp[1] + 10 * hit, sp[2] + 6 * hit)
    p.rot['head'] = (p.rot['head'][0] - 20 * hit, p.rot['head'][1], p.rot['head'][2])
    pos, rot = p.weapon
    p.weapon = (pos + Vector((0, .03 * hit, .07 * hit)), (rot[0] + 18 * hit, rot[1], rot[2]))
    return p


# Clips from Kimodo motion capture (motion.py, retarget.py): name -> loop, cycle range in seconds
# (and where in the take to look for it), what the mocap drives, what the carbine and arms do.
MOCAP = {
    'Stand': dict(loop=True, cycle=(1.6, 3.2), parts={'lower'}, upper='aim'),
    'Walk': dict(loop=True, cycle=(.8, 1.5), parts={'lower'}, upper='aim'),
    'WalkBack': dict(loop=True, cycle=(.8, 1.6), parts={'lower'}, upper='aim'),
    'StrafeL': dict(loop=True, cycle=(.8, 1.8), parts={'lower'}, upper='aim'),
    'StrafeR': dict(loop=True, cycle=(.8, 1.8), parts={'lower'}, upper='aim'),
    'Run': dict(loop=True, cycle=(.55, 1.0), parts={'lower'}, upper='low'),
    'Crouch': dict(loop=True, cycle=(1.0, 1.8), search=.45, parts={'lower'}, upper='aim'),
    'CrouchWalk': dict(loop=True, cycle=(.9, 1.8), parts={'lower'}, upper='aim'),
    'DodgeL': dict(loop=False, parts={'lower', 'trunk'}, upper='aim'),
    'DodgeR': dict(loop=False, parts={'lower', 'trunk'}, upper='aim'),
    'Stagger': dict(loop=False, in_place=False, parts={'lower', 'trunk'}, upper='aim'),
    'DeathBack': dict(loop=False, in_place=False, parts={'lower', 'trunk', 'arms'}, upper='drop'),
    'DeathFront': dict(loop=False, in_place=False, parts={'lower', 'trunk', 'arms'}, upper='drop'),
}
MOTION = os.path.join(HERE, 'motion')
CLIP_INFO = {}


def weapon_local(rig, pose):
    """The weapon bone's own (chest-relative) channels in a pose, so the carbine rides the chest
    wherever the mocap carries it, and its offset from the firing hand."""
    act = bpy.data.actions.new('scratch')
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    apply(rig, pose, 0)
    bpy.context.view_layer.update()
    w = rig.pose.bones['weapon']
    out = (w.location.copy(), w.rotation_quaternion.copy(), rig.pose.bones['hand_R'].matrix.inverted() @ w.matrix)
    rig.animation_data.action = None
    bpy.data.actions.remove(act)
    return out


def author_mocap(rig, name, spec, carry):
    import importlib
    sys.path.insert(0, HERE)
    import retarget
    importlib.reload(retarget)
    pj, scale, travel = retarget.load(os.path.join(MOTION, name + '.npz'), rig, loop=spec['loop'], in_place=spec.get('in_place', True),
                                      loop_range=spec.get('cycle', (.8, 1.6)), search_from=spec.get('search', 0.0))
    rt = retarget.Retargeter(rig)
    bones = rig.pose.bones

    def key(bone, channels):
        for c in channels:
            bones[bone].keyframe_insert(c, frame=bpy.context.scene.frame_current)
    frames = len(pj) if spec['loop'] else len(pj) - 1
    upper = spec['upper']
    for f in range(len(pj)):
        bpy.context.scene.frame_set(f)
        rt.pose(pj[f], f, {'lower'}, key)
        base = stance()
        hold = aim(base.copy()) if upper in ('aim', 'drop') else low_ready(base.copy())
        if upper == 'drop':
            hold.ik = {'_L': 0.0, '_R': 0.0}
        apply(rig, hold, f, upper=True, lower=False)
        if 'trunk' in spec['parts']:
            rt.pose(pj[f], f, {'trunk'}, key)
        if 'arms' in spec['parts']:
            rt.pose(pj[f], f, {'arms'}, key)
        w = bones['weapon']
        if upper == 'drop':
            # The carbine stays in the firing hand as it goes down.
            bpy.context.view_layer.update()
            w.matrix = bones['hand_R'].matrix @ carry['hand_offset']
        else:
            w.location, w.rotation_quaternion = carry[upper]
        bpy.context.view_layer.update()
        w.keyframe_insert('location', frame=f)
        w.keyframe_insert('rotation_quaternion', frame=f)
    if spec['loop']:  # close the loop: the last key repeats the first
        bpy.context.scene.frame_set(0)
    CLIP_INFO[name] = {'source': 'kimodo', 'frames': frames, 'seconds': frames / FPS, 'speed': round(travel, 3), 'scale': round(float(scale), 3)}
    return frames


def author(rig):
    actions = []
    rig.animation_data_create()
    carry = {}
    carry['aim'] = weapon_local(rig, aim(stance()))[:2]
    carry['low'] = weapon_local(rig, low_ready(stance()))[:2]
    carry['hand_offset'] = weapon_local(rig, aim(stance()))[2]
    for name, spec in MOCAP.items():
        if not os.path.exists(os.path.join(MOTION, name + '.npz')):
            continue
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        for pb in rig.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
        frames = author_mocap(rig, name, spec, carry)
        part = 'lower' if spec['parts'] == {'lower'} else 'full'
        act['nanonaut_part'] = part
        act['nanonaut_loop'] = spec['loop']
        act.frame_range = (0, frames)
        actions.append((act, frames))
        log('mocap', name, CLIP_INFO[name])
    for name, (fn, frames, loop, part) in CLIPS.items():
        if name in MOCAP and os.path.exists(os.path.join(MOTION, name + '.npz')):
            continue
        CLIP_INFO[name] = {'source': 'keyframed', 'frames': frames, 'seconds': frames / FPS}
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        # Reset every pose channel so nothing leaks between clips.
        for pb in rig.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
        step = 1 if frames <= 24 else 2
        keys = list(range(0, frames + 1, step))
        if keys[-1] != frames:
            keys.append(frames)
        for f in keys:
            pose = fn(f % frames if loop else f)
            apply(rig, pose, f, upper=part in ('upper', 'full'), lower=part in ('lower', 'full'))
            if part == 'lower':  # keep the upper body in a neutral aim so the bake is defined
                apply(rig, pose if pose.weapon else aim(pose.copy()), f, upper=True, lower=False)
            if part == 'upper':
                apply(rig, stance(), f, upper=False, lower=True)
        act['nanonaut_part'] = part
        act['nanonaut_loop'] = loop
        act.frame_range = (0, frames)
        actions.append((act, frames))
    # Bake every clip to forward kinematics.
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    baked = []
    for act, frames in actions:
        rig.animation_data.action = act
        bpy.ops.nla.bake(frame_start=0, frame_end=frames, only_selected=False, visual_keying=True,
                         clear_constraints=False, clear_parents=False, use_current_action=True, bake_types={'POSE'},
                         channel_types={'LOCATION', 'ROTATION'})
        baked.append(rig.animation_data.action)
        ground(rig, rig.animation_data.action, frames, settle=act.name.startswith('Death'))
        log('baked', act.name, frames, 'frames')
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    # Drop the IK controls; the weapon bone stays so the game can hang the carbine on it.
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for b in list(rig.data.edit_bones):
        if b.name.startswith(('ik_', 'pole_')):
            rig.data.edit_bones.remove(b)
    bpy.ops.object.mode_set(mode='OBJECT')
    for act in bpy.data.actions:
        strip_channels(act)
    rig.animation_data.action = None
    os.makedirs(os.path.join(HERE, 'reports'), exist_ok=True)
    json.dump(CLIP_INFO, open(os.path.join(HERE, 'reports', 'clips.json'), 'w'), indent=1)
    return baked


def ground(rig, act, frames, settle=True):
    """Rests a falling body on the floor: once it is down, its lowest point touches the floor
    exactly, and on the way down nothing passes through it."""
    pieces = [c for c in rig.children if c.type == 'MESH']
    hips = rig.pose.bones['hips']
    def lowest_point():
        deps = bpy.context.evaluated_depsgraph_get()
        return min(min((c.matrix_world @ v.co).z for v in list(c.evaluated_get(deps).data.vertices)[::5]) for c in pieces)
    rest = rig.data.bones['hips'].matrix_local.to_quaternion()
    for f in range(0, frames + 1):
        bpy.context.scene.frame_set(f)
        lowest = lowest_point()
        lift = -lowest if settle and f / frames > .55 else max(0, -lowest)
        if abs(lift) < 1e-4:
            continue
        hips.location = hips.location + rest.inverted() @ Vector((0, 0, lift))
        hips.keyframe_insert('location', frame=f)


def strip_channels(act):
    """Remove curves for deleted control bones and constraint influences."""
    import re
    keep = set(DEFORM) | {'root', 'weapon'}
    def channelbags(a):
        for layer in getattr(a, 'layers', []):
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    yield bag
    bags = list(channelbags(act))
    for bag in bags or [act]:
        for fc in list(bag.fcurves):
            m = re.match(r'pose\.bones\["([^"]+)"\]\.(\w+)', fc.data_path)
            if not m or m.group(1) not in keep or m.group(2) not in ('location', 'rotation_quaternion'):
                bag.fcurves.remove(fc)


# ------------------------------------------------------------------------------ output

def export(pieces, rig):
    os.makedirs(WORK, exist_ok=True)
    raw = os.path.join(WORK, 'nanonaut_raw.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces:
        piece.select_set(True)
    rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_image_format='WEBP', export_image_quality=88,
                              export_skins=True, export_all_influences=False, export_def_bones=False,
                              export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
                              export_frame_step=1, export_optimize_animation_size=True, export_anim_single_armature=True,
                              export_reset_pose_bones=True, export_cameras=False, export_lights=False, export_extras=True,
                              export_morph=False)
    gltfpack = os.environ.get('GLTFPACK') or shutil.which('gltfpack')
    if gltfpack:
        cmd = ['node', gltfpack] if gltfpack.endswith('.js') else [gltfpack]
        subprocess.run(cmd + ['-i', raw, '-o', OUT, '-cc', '-kn', '-ke', '-vt', '14', '-at', '16', '-ar', '14', '-af', '30'], check=True)
    else:
        shutil.copy(raw, OUT)
    log('exported', OUT, os.path.getsize(OUT), 'bytes (raw', os.path.getsize(raw), ')')


def preview(rig):
    """A contact sheet of every clip, for checking the animation by eye."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 360
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.5, .52, .55, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (.9, .2, .6)
    scene.collection.objects.link(sun)
    floor = bpy.data.meshes.new('floor')
    floor.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
    scene.collection.objects.link(bpy.data.objects.new('floor', floor))
    stand_in_carbine(rig)
    rig.animation_data_create()
    out_dir = os.path.join(WORK, 'preview')
    os.makedirs(out_dir, exist_ok=True)
    scene.render.resolution_x = scene.render.resolution_y = 420
    views = {'front': (0, -3.4, 1.0), 'right': (-3.4, -.4, 1.1), 'quarter': (2.2, -2.6, 1.3)}
    only = os.environ.get('CLIPS')
    for act in bpy.data.actions:
        if only and act.name not in only.split(','):
            continue
        rig.animation_data.action = act
        start, end = act.frame_range
        for v, loc in views.items():
            cam.location = loc
            cam.rotation_euler = (Vector((0, -.1, .85)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
            for i in range(4):
                f = int(start + (end - start) * i / 4)
                scene.frame_set(f)
                scene.render.filepath = os.path.join(out_dir, '%s_%s_%d.png' % (act.name, v, i))
                bpy.ops.render.render(write_still=True)
    log('previews in', out_dir)


def stand_in_carbine(rig):
    """A carbine-sized stand-in on the weapon bone (the game draws its own model there)."""
    mat = bpy.data.materials.new('gunmetal')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (.025, .027, .03, 1)
    bsdf.inputs['Metallic'].default_value = .7
    bsdf.inputs['Roughness'].default_value = .4
    parts = []
    # receiver, barrel, magazine, grip, stock (in the bone frame: +Y barrel, +Z up)
    for size, loc in (((.05, .36, .085), (0, .1, .0)), ((.024, .26, .024), (0, .4, .015)), ((.035, .06, .15), (0, .1, -.1)),
                      ((.03, .045, .11), (0, -.04, -.08)), ((.04, .22, .09), (0, -.2, -.01))):
        bpy.ops.mesh.primitive_cube_add(size=1)
        part = bpy.context.active_object
        part.scale = size
        part.data.materials.append(mat)
        bpy.ops.object.transform_apply(scale=True)
        part.parent = rig
        part.parent_type = 'BONE'
        part.parent_bone = 'weapon'
        bone = rig.data.bones['weapon']
        part.matrix_parent_inverse = Matrix.Translation((0, -bone.length, 0))
        part.location = loc
        parts.append(part)
    return parts


def portrait(rig):
    """The disease guide's Cycles portrait: aiming, three-quarter, rim-lit."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU'
    scene.cycles.samples = int(os.environ.get('PORTRAIT_SAMPLES', 160))
    scene.render.resolution_x, scene.render.resolution_y = 768, 768
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('portrait')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.04, .05, .06, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .6
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions['Aim']
    scene.frame_set(10)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 70
    cam.location = (2.6, -3.6, 1.45)
    cam.rotation_euler = (Vector((0, -.05, 1.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, loc, power, color in (('key', (3, -3, 3.4), 900, (1, .93, .86)), ('rim', (-2.8, 2.6, 2.4), 1400, (.55, .75, 1)),
                                    ('fill', (-2.5, -3, 1.2), 220, (1, .8, .7))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        light.data.energy, light.data.color, light.data.size = power, color, 1.6
        light.location = loc
        light.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    stand_in_carbine(rig)
    png = os.path.join(WORK, 'portrait.png')
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)
    os.makedirs(os.path.dirname(PORTRAIT), exist_ok=True)
    img = bpy.data.images.load(png)
    img.file_format = 'WEBP'
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.quality = 90
    img.save_render(PORTRAIT)
    log('portrait', PORTRAIT)


def main():
    high = import_source()
    refine(high)
    low = remesh(high)
    normal = transfer(high, low)
    if '--skip-bake' not in ARGS:
        build_maps(low, normal)
    bpy.data.objects.remove(high)
    fit_joints(low)
    rig = build_skeleton(low)
    skin(low, rig)
    author(rig)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'nanonaut.blend'))
    export([low], rig)
    if '--preview' in ARGS:
        preview(rig)
    if '--portrait' in ARGS:
        portrait(rig)


main()
