"""Builds the enemy Nanonaut: a skinned, motion-captured human in a red and yellow biosuit.

    blender -b -P tools/nanonaut/build_nanonaut.py

Inputs (all generated on Hugging Face with the logged-in account; see docs/nanonaut.md):
  work/game_mesh.glb          the TRELLIS.2 scan at a game budget, with its own UVs and 4K PBR
                              textures (prepare_mesh.py; nothing remeshed or re-baked)
  work/autorig/animatable_file.fbx
                              Make-It-Animatable's learned Mixamo-standard skeleton (52 bones with
                              fingers) and blend weights for that mesh (autorig.py)
  motion/<clip>.npz           NVIDIA Kimodo motion capture (motion.py)

The build
  1. aligns the predicted skeleton to the scan and copies its weights vertex for vertex;
  2. binds every gear piece rigidly to one bone: the scan comes in separate pieces (plate carrier,
     pouches, holster, belt, mask, boots...), and a piece whose weights are dominated by one bone
     is bound wholly to it, so hard gear never bends;
  3. hangs the carbine on the right hand (a `weapon` bone) at the grip the mocap holds it with;
  4. retargets every clip from Kimodo, the whole body down to the fingers, by joint positions
     (retarget.py), with the legs on IK to the mocap ankles and the support hand on IK to the
     handguard; takes held left-handed are mirrored;
  5. bakes every clip to plain bone rotations and exports dist/assets/enemies/nanonaut.glb.
The game (nanonaut-view.mjs) plays the legs and the upper body as separate layers."""
import bpy, bmesh, math, os, sys, json, importlib, re, shutil, subprocess
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
WORK = os.path.join(HERE, 'work')
MOTION = os.path.join(HERE, 'motion')
OUT = os.path.join(ROOT, 'dist', 'assets', 'enemies', 'nanonaut.glb')
FPS = 30
sys.path.insert(0, HERE)
import retarget  # noqa: E402
importlib.reload(retarget)

# The game's clips: whether each loops, its cycle (seconds), and its mirror partner.
CLIPS = {
    'Stand': dict(loop=True, cycle=(1.6, 3.2)), 'Walk': dict(loop=True, cycle=(.8, 1.5)),
    'WalkBack': dict(loop=True, cycle=(.8, 1.6)), 'StrafeL': dict(loop=True, cycle=(.8, 1.8), partner='StrafeR'),
    'StrafeR': dict(loop=True, cycle=(.8, 1.8), partner='StrafeL'), 'Run': dict(loop=True, cycle=(.55, 1.0)),
    'Crouch': dict(loop=True, cycle=(1.0, 1.8), search=.45), 'CrouchWalk': dict(loop=True, cycle=(.9, 1.8)),
    'Aim': dict(loop=True, cycle=(1.6, 3.2)), 'LowReady': dict(loop=True, cycle=(1.4, 3.0)),
    'Cover': dict(loop=True, cycle=(1.4, 3.0), search=.4), 'Reload': dict(loop=False),
    'DodgeL': dict(loop=False, partner='DodgeR'), 'DodgeR': dict(loop=False, partner='DodgeL'),
    'Stagger': dict(loop=False, in_place=False),
    'DeathBack': dict(loop=False, in_place=False, free_hands=True), 'DeathFront': dict(loop=False, in_place=False, free_hands=True),
}
CLIP_INFO = {}


def log(*args):
    print('[nanonaut]', *args, flush=True)


# ------------------------------------------------------------------------------ assembly

def import_parts():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=os.path.join(WORK, 'game_mesh.glb'))
    body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    body.name = body.data.name = 'nanonaut'
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(WORK, 'autorig', 'animatable_file.fbx'), automatic_bone_orientation=False)
    new = set(bpy.context.scene.objects) - before
    rig = next(o for o in new if o.type == 'ARMATURE')
    source = next(o for o in new if o.type == 'MESH')
    return body, rig, source, [o for o in new if o not in (rig, source)]


def world_co(obj):
    m = np.array(obj.matrix_world)
    co = np.array([v.co[:] for v in obj.data.vertices])
    return co @ m[:3, :3].T + m[:3, 3]


def align(body, rig, source):
    """The auto-rigger normalizes the mesh it was given (hips at the origin, 1.8 m tall) but keeps
    its vertices in order: solve the scale and offset that carry its copy onto the scan by least
    squares over corresponding vertices, and move its skeleton with it."""
    bpy.context.view_layer.update()
    b, s = world_co(body), world_co(source)
    if len(b) != len(s):
        raise RuntimeError('the auto-rigged mesh no longer matches the scan (%d vs %d vertices)' % (len(s), len(b)))
    # It also tilts the mesh a few degrees while canonicalizing it: fit rotation, scale and offset
    # together (Kabsch).
    sm, bm = s.mean(0), b.mean(0)
    S, B = s - sm, b - bm
    U, D, Vt = np.linalg.svd(S.T @ B)
    flip = np.sign(np.linalg.det(U @ Vt))
    R = (U @ np.diag([1, 1, flip]) @ Vt).T
    scale = float(D.sum() / (S * S).sum())
    linear = Matrix(R.tolist()) * scale
    fit = linear.to_4x4()
    fit.translation = Vector(bm - (R @ sm) * scale)
    for obj in (rig, source):
        if obj.parent is None:
            obj.matrix_world = fit @ obj.matrix_world
    bpy.context.view_layer.update()
    source_world = Matrix(source.matrix_world)
    for obj in (rig, source):
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if obj is source:
            obj.parent = None
            obj.matrix_world = source_world
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    error = np.linalg.norm(world_co(source) - b, axis=1)
    log('aligned the auto-rig: scale %.4f, vertex error mean %.5f m, worst %.5f m' % (scale, error.mean(), error.max()))
    if error.max() > .005:
        raise RuntimeError('the auto-rig does not line up with the scan')


def rename(rig, source):
    for b in rig.data.bones:
        b.name = b.name.replace('mixamorig:', '')
    for g in source.vertex_groups:
        g.name = g.name.replace('mixamorig:', '')
    rig.name = rig.data.name = 'nanonaut_rig'


def copy_weights(body, source):
    """The same vertices in the same order: each takes its counterpart's weights exactly."""
    names = [g.name for g in source.vertex_groups]
    groups = {n: body.vertex_groups.new(name=n) for n in names}
    for v, w in zip(body.data.vertices, source.data.vertices):
        for g in w.groups:
            if g.weight > 1e-4:
                groups[names[g.group]].add([v.index], g.weight, 'REPLACE')
    log('copied weights for', len(body.data.vertices), 'vertices, vertex for vertex')


def weld(body):
    """The glTF import splits vertices along UV seams; weld them back (UVs live on face corners, so
    they are kept) so each piece of gear is one connected piece again."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(body.data)
    bm.free()
    # The imported custom normals no longer match the welded mesh: shade it afresh, smooth across
    # the cloth and sharp at the gear's hard edges.
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    if body.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50), keep_sharp_edges=False)
    log('welded', before, '->', len(body.data.vertices), 'vertices')


def islands(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    label = [-1] * len(bm.verts)
    out = []
    for v in bm.verts:
        if label[v.index] >= 0:
            continue
        stack, members = [v], []
        label[v.index] = len(out)
        while stack:
            cur = stack.pop()
            members.append(cur.index)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if label[o.index] < 0:
                    label[o.index] = len(out)
                    stack.append(o)
        out.append(members)
    bm.free()
    return out


RIGID = set()  # vertices of the pieces bound wholly to one bone


def rigid_gear(body):
    """Each separate piece of the scan whose weights are dominated by one bone is bound wholly to
    that bone: plates, pouches, holster, mask and boots move as solid objects."""
    names = {g.index: g.name for g in body.vertex_groups}
    pieces = sorted(islands(body), key=len, reverse=True)
    rigid = []
    for members in pieces[1:]:  # the largest piece is the suit itself, which bends
        total = {}
        for i in members:
            for g in body.data.vertices[i].groups:
                total[names[g.group]] = total.get(names[g.group], 0) + g.weight
        if not total:
            continue
        bone, share = max(total.items(), key=lambda kv: kv[1])
        share /= sum(total.values())
        # Gloves and other pieces spanning joints must bend; small or one-bone pieces need not.
        if share < .72 or ('Hand' in bone and len(members) > 300):
            continue
        for i in members:
            for g in list(body.data.vertices[i].groups):
                body.vertex_groups[names[g.group]].remove([i])
            body.vertex_groups[bone].add([i], 1.0, 'REPLACE')
        rigid.append(bone)
        RIGID.update(members)
    log('rigid gear pieces:', len(rigid), 'of', len(pieces) - 1, '->', sorted(set(rigid)))


def textures(body, size=2048):
    """The scan's 4K maps, halved for the game (mobile halves them again at load)."""
    for mat in body.data.materials:
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image and node.image.size[0] > size:
                node.image.scale(size, size)
    log('textures at', size)


def smooth_seams(body, rig):
    """The learned weights split the crotch hard between the two thighs and the armpit between arm
    and chest, so a stride or a raised arm pulls those edges apart. Blend the pelvis into the
    crotch, then relax the weights there and in the armpits over the suit's own surface."""
    me = body.data
    co = np.array([v.co[:] for v in me.vertices])
    names = [g.name for g in body.vertex_groups]
    w = np.zeros((len(co), len(names)))
    for v in me.vertices:
        for g in v.groups:
            w[v.index, g.group] = g.weight
    # Everything that bends: the suit and the gear spanning joints, not the rigid pieces.
    suit = np.ones(len(co), bool)
    suit[list(RIGID)] = False
    x, z = np.abs(co[:, 0]), co[:, 2]
    crotch = suit & (x < .13) & (z > .7) & (z < .96)
    pit = suit & (x > .05) & (x < .3) & (z > 1.15) & (z < 1.52)  # armpits and shoulder blades
    hips = names.index('Hips')
    # No thigh influence above the hip joints: the belt and waist follow the pelvis.
    joint = rig.data.bones['LeftUpLeg'].head_local.z
    for leg in ('LeftUpLeg', 'RightUpLeg'):
        k = names.index(leg)
        fade = np.clip((z - joint) / .08, 0, 1) * suit
        moved = w[:, k] * fade
        w[:, k] -= moved
        w[:, hips] += moved
    pull = np.clip(1 - x / .09, 0, 1) * np.clip(1 - np.abs(z - .84) / .12, 0, 1) * .6
    w[crotch] *= (1 - pull[crotch])[:, None]
    w[crotch, hips] += pull[crotch]
    trunk = suit & (x < .26) & (z > joint - .05) & (z < 1.45)
    region = crotch | pit | trunk
    nbr = [[] for _ in co]
    for e in me.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)
    idx = np.nonzero(region)[0]
    for _ in range(12):
        nw = w.copy()
        for i in idx:
            if nbr[i]:
                nw[i] = .5 * w[i] + .5 * w[nbr[i]].mean(0)
        w = nw
    # The relax must not carry a limb into the torso: the centre of the chest, belly and back
    # answers to the spine and pelvis alone, fading back to the limbs toward the sides.
    limbs = [k for k, n in enumerate(names) if re.match(r'(Left|Right)(Arm|ForeArm|Shoulder|UpLeg)$', n)]
    centre = np.clip((.15 - x) / .06, 0, 1) * trunk * (z > joint + .06)
    for i in np.nonzero(centre)[0]:
        moved = w[i, limbs] * centre[i]
        w[i, limbs] -= moved
        w[i, hips if z[i] < joint + .2 else names.index('Spine')] += moved.sum()
    for i in idx:
        for gi in np.nonzero(w[i] > 1e-4)[0]:
            body.vertex_groups[gi].add([int(i)], float(w[i, gi]), 'REPLACE')
        for gi in np.nonzero((w[i] <= 1e-4))[0]:
            body.vertex_groups[gi].remove([int(i)])
    log('seams: relaxed', int(trunk.sum()), 'trunk vertices;', 'blended the pelvis into', int(crotch.sum()), 'crotch vertices, relaxed', int(pit.sum()), 'armpit vertices')


def hygiene(body):
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    log('weights: limited to four, normalized, cleaned;', sum(1 for v in body.data.vertices if not v.groups), 'unweighted vertices')


def bind(body, rig):
    body.parent = rig
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig


# --------------------------------------------------------------------------- controls

def reset_pose(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def grip_from_mocap(rig):
    """Where the carbine sits in the right hand, from the Aim take's hands: the grip in the palm,
    the barrel toward the support hand, the receiver's top up. Returns the weapon frame relative
    to the right hand, and the support hand's place in the weapon frame."""
    path, flip, _ = retarget.source(MOTION, 'Aim')
    pj, _, _ = retarget.load(path, rig, loop=False, in_place=True, flip=flip)
    p = pj[len(pj) // 2]
    rig.animation_data_create()
    rig.animation_data.action = None
    rt = retarget.Retargeter(rig)
    rt.pose(p, 0, {'lower', 'trunk', 'arms', 'fingers'}, lambda *a: None)
    bpy.context.view_layer.update()
    pbs = rig.pose.bones
    hand_r = pbs['RightHand']
    # Grip in the posed rig's own palm, barrel to the posed support palm.
    palm = (hand_r.head + pbs['RightHandMiddle1'].head) / 2
    support = (pbs['LeftHand'].head + pbs['LeftHandMiddle1'].head) / 2
    barrel = (support - palm).normalized()
    up = (pbs['Neck'].head - pbs['Hips'].head).normalized()
    side = barrel.cross(up).normalized()
    up = side.cross(barrel).normalized()
    weapon = Matrix((side, barrel, up)).transposed().to_4x4()
    weapon.translation = palm
    local = hand_r.matrix.inverted() @ weapon
    wrist = weapon.inverted() @ pbs['LeftHand'].head
    # How the support hand sits on the handguard, kept for every clip.
    hand_rot = (weapon.inverted() @ pbs['LeftHand'].matrix).to_3x3()
    log('grip: support hand %.2f m up the carbine' % (support - palm).length)
    reset_pose(rig)
    return local, (wrist, hand_rot)


def add_controls(rig, weapon_local, support):
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    root = eb.new('root')
    root.head, root.tail = Vector((0, 0, 0)), Vector((0, -.3, 0))
    root.use_deform = False
    eb['Hips'].parent = root
    hand = eb['RightHand']
    rest = hand.matrix @ weapon_local
    w = eb.new('weapon')
    w.head = rest.translation
    w.tail = rest.translation + rest.to_3x3() @ Vector((0, .2, 0))
    w.align_roll(rest.to_3x3() @ Vector((0, 0, 1)))
    w.parent = hand
    w.use_deform = False
    wm = w.matrix.copy()
    wrist_local, hand_rot = support
    ik = eb.new('ik_hand_L')
    wrist = wm @ Vector(wrist_local)
    ik.head, ik.tail = wrist, wrist + Vector((0, .08, 0))
    m = (wm.to_3x3() @ hand_rot).to_4x4()
    m.translation = wrist
    ik.matrix = m
    ik.parent = w
    ik.use_deform = False
    pole = eb.new('pole_elbow_L')
    elbow = eb['LeftForeArm'].head
    pole.head, pole.tail = elbow + Vector((.25, .5, -.35)), elbow + Vector((.25, .6, -.35))
    pole.parent = eb['Spine2']
    pole.use_deform = False
    for s in ('Left', 'Right'):
        foot = eb[s + 'Foot']
        f = eb.new('ik_foot_' + s)
        f.head, f.tail, f.roll = foot.head.copy(), foot.tail.copy(), foot.roll
        f.parent = root
        f.use_deform = False
        knee = eb[s + 'Leg'].head
        k = eb.new('pole_knee_' + s)
        k.head, k.tail = knee + Vector((0, -.6, 0)), knee + Vector((0, -.7, 0))
        k.parent = f
        k.use_deform = False
    bpy.ops.object.mode_set(mode='POSE')
    reset_pose(rig)
    pbs = rig.pose.bones
    for s in ('Left', 'Right'):
        c = pbs[s + 'Leg'].constraints.new('IK')
        c.target, c.subtarget, c.pole_target, c.pole_subtarget, c.chain_count = rig, 'ik_foot_' + s, rig, 'pole_knee_' + s, 2
        c.name = 'leg_ik'
        c = pbs[s + 'Foot'].constraints.new('COPY_ROTATION')
        c.target, c.subtarget, c.name = rig, 'ik_foot_' + s, 'foot_ik'
    c = pbs['LeftForeArm'].constraints.new('IK')
    c.target, c.subtarget, c.pole_target, c.pole_subtarget, c.chain_count = rig, 'ik_hand_L', rig, 'pole_elbow_L', 2
    c.name = 'arm_ik'
    c = pbs['LeftHand'].constraints.new('COPY_ROTATION')
    c.target, c.subtarget, c.name = rig, 'ik_hand_L', 'hand_ik'
    bpy.ops.object.mode_set(mode='OBJECT')
    calibrate_poles(rig)
    rig['grip_support'] = list(support[0])


def calibrate_poles(rig):
    """Each IK chain's pole angle: the one at which the chain, its target at its rest place, solves
    to the rest pose exactly. A wrong angle wrings the limb about its own axis."""
    bpy.context.view_layer.update()
    pbs = rig.pose.bones
    for chain, upper, target in (('LeftLeg', 'LeftUpLeg', 'ik_foot_Left'), ('RightLeg', 'RightUpLeg', 'ik_foot_Right'),
                                 ('LeftForeArm', 'LeftArm', 'ik_hand_L')):
        c = next(c for c in pbs[chain].constraints if c.type == 'IK')
        t = pbs[target]
        saved = (t.location.copy(), t.rotation_quaternion.copy())
        m = t.matrix.copy()
        m.translation = rig.data.bones[chain].tail_local
        t.matrix = m
        best = None
        for deg in range(-180, 180, 2):
            c.pole_angle = math.radians(deg)
            bpy.context.view_layer.update()
            err = sum(pbs[b].matrix.to_quaternion().rotation_difference(rig.data.bones[b].matrix_local.to_quaternion()).angle for b in (upper, chain))
            if best is None or err < best[0]:
                best = (err, deg)
        c.pole_angle = math.radians(best[1])
        t.location, t.rotation_quaternion = saved
        bpy.context.view_layer.update()
        log('pole', chain, best[1], 'degrees, rest error %.2f deg' % math.degrees(best[0]))


# ------------------------------------------------------------------------------ motion

# Finger curl in degrees per segment: the firing hand round the pistol grip with the index finger
# along the trigger, the support hand round the handguard.
CURL = {'Right': {'Thumb': (15, 20, 15), 'Index': (22, 28, 18), 'Middle': (72, 85, 50), 'Ring': (75, 85, 50), 'Pinky': (78, 80, 45)},
        'Left': {'Thumb': (10, 25, 20), 'Index': (50, 55, 35), 'Middle': (58, 60, 38), 'Ring': (60, 62, 38), 'Pinky': (62, 62, 35)}}
GRIP = {}


def grip_pose(rig):
    """Each finger segment's local rotation for the grip: a curl in the finger's own flexion
    plane, toward the palm (the side of the hand the thumb lies on)."""
    from mathutils import Quaternion
    b = rig.data.bones
    for side in ('Left', 'Right'):
        lateral = (b[side + 'HandIndex1'].head_local - b[side + 'HandPinky1'].head_local).normalized()
        across = (b[side + 'HandIndex1'].head_local + b[side + 'HandPinky1'].head_local) / 2
        thumb = b[side + 'HandThumb2'].head_local
        for finger, angles in CURL[side].items():
            for seg, angle in enumerate(angles):
                name = f'{side}Hand{finger}{seg + 1}'
                if name not in b:
                    continue
                bone = b[name]
                d = (bone.tail_local - bone.head_local).normalized()
                palm = d.cross(lateral)
                if palm.dot(thumb - across) < 0:
                    palm = -palm
                axis = lateral.copy()
                if axis.cross(d).dot(palm) < 0:
                    axis = -axis
                if finger == 'Thumb':
                    # The thumb closes across the palm, not along the fingers.
                    axis = (d.cross(palm)).normalized()
                    if axis.cross(d).dot(across - bone.head_local) < 0:
                        axis = -axis
                local = bone.matrix_local.to_3x3().inverted() @ axis
                GRIP[name] = Quaternion(local.normalized(), math.radians(angle))


def author(rig):
    grip_pose(rig)
    rig.animation_data_create()
    pbs = rig.pose.bones
    actions = []
    only = os.environ.get('CLIPS')
    for name, spec in CLIPS.items():
        if only and name not in only.split(','):
            continue
        path, flip, hand = retarget.source(MOTION, name, spec.get('partner'))
        if not os.path.exists(path):
            continue
        pj, scale, travel = retarget.load(path, rig, loop=spec['loop'], in_place=spec.get('in_place', True), loop_range=spec.get('cycle', (.8, 1.6)),
                                          search_from=spec.get('search', 0.0), flip=flip)
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        reset_pose(rig)
        rt = retarget.Retargeter(rig)

        def key(bone, channels):
            for ch in channels:
                pbs[bone].keyframe_insert(ch, frame=bpy.context.scene.frame_current)
        frames = len(pj) if spec['loop'] else len(pj) - 1
        for f in range(len(pj)):
            bpy.context.scene.frame_set(f)
            rt.pose(pj[f], f, {'lower', 'trunk', 'arms', 'fingers'}, key)
            # The support hand holds the handguard, except as the soldier falls dead.
            for bone, constraint in (('LeftForeArm', 'arm_ik'), ('LeftHand', 'hand_ik')):
                c = pbs[bone].constraints[constraint]
                c.influence = 0.0 if spec.get('free_hands') else 1.0
                c.keyframe_insert('influence', frame=f)
            if not spec.get('free_hands'):
                for bone, q in GRIP.items():
                    pbs[bone].rotation_quaternion = q
                    pbs[bone].keyframe_insert('rotation_quaternion', frame=f)
        act.frame_range = (0, frames)
        CLIP_INFO[name] = {'source': os.path.basename(path), 'mirrored': flip, 'handedness': None if hand is None else round(hand, 2),
                           'frames': frames, 'seconds': round(frames / FPS, 3), 'speed': round(travel, 3), 'scale': round(float(scale), 3)}
        actions.append((act, frames, name.startswith('Death')))
        log('clip', name, CLIP_INFO[name])
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    for act, frames, death in actions:
        # Bones a clip does not key must sit at rest, not where the last clip authored left them.
        reset_pose(rig)
        rig.animation_data.action = act
        bpy.ops.nla.bake(frame_start=0, frame_end=frames, only_selected=False, visual_keying=True, clear_constraints=False,
                         clear_parents=False, use_current_action=True, bake_types={'POSE'}, channel_types={'LOCATION', 'ROTATION'})
        ground(rig, frames, settle=death)
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in pbs:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in list(rig.data.edit_bones):
        if b.name.startswith(('ik_', 'pole_')):
            rig.data.edit_bones.remove(b)
    bpy.ops.object.mode_set(mode='OBJECT')
    keep = {b.name for b in rig.data.bones}
    for act in bpy.data.actions:
        for layer in getattr(act, 'layers', []):
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in list(bag.fcurves):
                        m = re.match(r'pose\.bones\["([^"]+)"\]\.(\w+)', fc.data_path)
                        if not m or m.group(1) not in keep or m.group(2) not in ('location', 'rotation_quaternion'):
                            bag.fcurves.remove(fc)
    rig.animation_data.action = None
    os.makedirs(os.path.join(HERE, 'reports'), exist_ok=True)
    json.dump(CLIP_INFO, open(os.path.join(HERE, 'reports', 'clips.json'), 'w'), indent=1)


def ground(rig, frames, settle=False):
    """Nothing sinks through the floor; a dead body comes to rest on it."""
    body = next(c for c in rig.children if c.type == 'MESH')
    hips = rig.pose.bones['Hips']
    to_local = (rig.matrix_world @ rig.data.bones['Hips'].matrix_local).to_3x3().inverted()
    for f in range(0, frames + 1):
        bpy.context.scene.frame_set(f)
        ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        lowest = min((body.matrix_world @ v.co).z for v in list(ev.data.vertices)[::6])
        lift = -lowest if settle and f / frames > .55 else max(0, -lowest)
        if abs(lift) > .5:
            far = [(pb.name, round(pb.matrix.to_3x3().determinant(), 2), tuple(round(x, 3) for x in pb.rotation_quaternion), tuple(round(x, 2) for x in pb.scale))
                   for pb in rig.pose.bones if abs(pb.matrix.to_3x3().determinant() - 1) > .01 or abs(pb.rotation_quaternion.magnitude - 1) > .01]
            raise RuntimeError('%s frame %d: the body is %.1f m below the floor; runaway bones %s' % (rig.animation_data.action.name, f, -lowest, far[:12]))
        if abs(lift) < 1e-4:
            continue
        hips.location = hips.location + to_local @ Vector((0, 0, lift))
        hips.keyframe_insert('location', frame=f)


# ------------------------------------------------------------------------------ output

def export(body, rig):
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    raw = os.path.join(WORK, 'nanonaut_raw.glb')
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='WEBP',
                              export_image_quality=90, export_skins=True, export_all_influences=False, export_def_bones=False,
                              export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
                              export_optimize_animation_size=True, export_anim_single_armature=True, export_reset_pose_bones=True,
                              export_cameras=False, export_lights=False, export_extras=True, export_morph=False)
    # Meshopt-compressed like the other enemies (GLTFPACK may name the npm package's cli.js); named
    # nodes are kept so the game finds the weapon bone.
    gltfpack = os.environ.get('GLTFPACK') or shutil.which('gltfpack')
    if gltfpack:
        command = ['node', gltfpack] if gltfpack.endswith('.js') else [gltfpack]
        subprocess.run([*command, '-i', raw, '-o', OUT, '-cc', '-kn', '-km', '-ke', '-vt', '14'], check=True)
    else:
        shutil.copyfile(raw, OUT)
    log('exported', OUT, os.path.getsize(OUT), 'bytes', 'packed' if gltfpack else 'unpacked', 'from', os.path.getsize(raw))


def main():
    body, rig, source, extra = import_parts()
    align(body, rig, source)
    rename(rig, source)
    copy_weights(body, source)
    bpy.data.objects.remove(source)
    weld(body)
    textures(body)
    for o in extra:
        bpy.data.objects.remove(o)
    rigid_gear(body)
    smooth_seams(body, rig)
    hygiene(body)
    bind(body, rig)
    weapon_local, support = grip_from_mocap(rig)
    add_controls(rig, weapon_local, support)
    author(rig)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'nanonaut.blend'))
    export(body, rig)


main()
