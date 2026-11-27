"""Retargets Kimodo motion (tools/nanonaut/motion/<clip>.npz) onto the Nanonaut's Mixamo-standard skeleton.

Kimodo's SOMA skeleton and the Nanonaut's have different proportions and different rest poses
(SOMA rests in a T-pose; the scan in an A-pose with its arms forward), so joint rotations cannot
be copied across. Instead each bone is posed from joint *positions*: a frame is built from the
mocap landmarks (the bone's direction plus a reference for its twist, such as the hip line, the
shoulder line or the eye line), the same frame is built from the Nanonaut's own rest skeleton,
and the bone is turned by the difference between the two. The rest-pose difference therefore
cancels exactly, and nothing drifts out of place however far the two rest poses differ.

The legs are driven by IK instead: the mocap is scaled so its legs are the Nanonaut's length, the
ankles go exactly where the mocap puts them (so feet plant without sliding), the knees bend
towards the mocap's knees, and the boots take the mocap's foot direction.

Loops are cut at the gait cycle that best matches its own start and the small remaining mismatch
is spread across the cycle, so they repeat seamlessly; locomotion is made in-place and any
gradual turn is removed, so the game can steer it."""
import math
import numpy as np
from mathutils import Matrix, Vector

# SOMA joint indices in Kimodo's NPZ (its BVH lists the same joints after a Root).
K = {'hips': 0, 'spine1': 1, 'spine2': 2, 'chest': 3, 'neck1': 4, 'neck2': 5, 'head': 6, 'head_end': 7, 'eye_L': 9, 'eye_R': 10,
     'shoulder_L': 11, 'arm_L': 12, 'forearm_L': 13, 'hand_L': 14, 'middle_L': 24,
     'shoulder_R': 39, 'arm_R': 40, 'forearm_R': 41, 'hand_R': 42, 'middle_R': 52,
     'hip_L': 67, 'knee_L': 68, 'ankle_L': 69, 'ball_L': 70, 'toe_L': 71,
     'hip_R': 72, 'knee_R': 73, 'ankle_R': 74, 'ball_R': 75, 'toe_R': 76}


# Left/right joint pairs, for mirroring a take: eyes, the whole arm and hand, the whole leg.
MIRROR = list(range(77))
for a, b in [(9, 10)] + [(i, i + 28) for i in range(11, 39)] + [(i, i + 5) for i in range(67, 72)]:
    MIRROR[a], MIRROR[b] = b, a


def mirror(pj):
    """The take reflected left to right (Blender axes: x is the character's left)."""
    out = pj[:, MIRROR].copy()
    out[..., 0] *= -1
    return out


def handedness(pj):
    """+1 when the left hand leads the right along the body's forward axis (a right-handed rifle
    hold), -1 when the right hand leads (left-handed), near 0 when the rifle is carried across."""
    left = pj[:, K['hip_L']] - pj[:, K['hip_R']]
    up = np.array([0, 0, 1.0])
    forward = np.cross(left, up)
    forward /= np.linalg.norm(forward, axis=1, keepdims=True)
    lead = pj[:, K['hand_L']] - pj[:, K['hand_R']]
    return float(np.mean(np.einsum('ij,ij->i', lead, forward)) / max(1e-6, np.mean(np.linalg.norm(lead, axis=1))))


def to_blender(p):
    """Kimodo (x left, y up, z forward) to Blender (x left, -y forward, z up)."""
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


def load(path, rig, loop=False, in_place=True, loop_range=(.75, 1.6), search_from=0.0, flip=False):
    """Returns joint positions [T, 77, 3] in the rig's armature space, scaled to its legs."""
    d = np.load(path)
    pj = to_blender(d['posed_joints'].astype(np.float64))
    root = to_blender(d['smooth_root_pos'].astype(np.float64))
    if flip:
        pj = mirror(pj)
        root = root * np.array([-1, 1, 1])
    # Scale: mocap leg (hip to ankle, plus ankle height) to the rig's.
    def leg(p):
        return (np.linalg.norm(p[:, K['hip_L']] - p[:, K['knee_L']], axis=-1) + np.linalg.norm(p[:, K['knee_L']] - p[:, K['ankle_L']], axis=-1)).mean()
    bones = rig.data.bones
    ours = (bones['LeftUpLeg'].length + bones['LeftLeg'].length)
    scale = ours / leg(pj)
    pj = pj * scale
    root = root * scale
    # Ankle height: the mocap's ankle joint rides lower above the floor than the scan's (whose
    # boots have thick soles), so the whole take is raised by the difference, measured while the
    # foot is planted, and boots meet the floor instead of sinking through it.
    contact = d['foot_contacts'][:, 0].astype(bool) if 'foot_contacts' in d.files else np.ones(len(pj), bool)
    ankles = np.concatenate([pj[contact, K['ankle_L'], 2], pj[d['foot_contacts'][:, 3].astype(bool) if 'foot_contacts' in d.files else contact, K['ankle_R'], 2]])
    planted = float(np.median(ankles)) if len(ankles) else float(pj[:, K['ankle_L'], 2].min())
    lift = bones['LeftFoot'].head_local.z - planted
    pj[..., 2] += lift
    if in_place:
        # Remove travel and any gradual turn: rotate every frame about the root so the hips face
        # forward on average, then take the horizontal root path out.
        hips = pj[:, K['hip_L']] - pj[:, K['hip_R']]
        face = np.unwrap(np.arctan2(hips[:, 1], hips[:, 0]))  # 0 when the hip line points along +X
        # A turn over the clip is removed; the stride's own sway is kept.
        trend = np.polyval(np.polyfit(np.arange(len(face)), face, 1), np.arange(len(face)))
        for t in range(len(pj)):
            c, s = math.cos(-trend[t]), math.sin(-trend[t])
            rot = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
            pj[t] = (pj[t] - [root[t, 0], root[t, 1], 0]) @ rot.T
    if loop:
        start, end = best_cycle(pj, loop_range, search_from)
        pj = pj[start:end + 1].copy()
        # Spread the small end-to-start mismatch across the cycle so it repeats seamlessly.
        mismatch = pj[-1] - pj[0]
        n = len(pj) - 1
        pj -= (np.arange(n + 1)[:, None, None] / n) * mismatch[None]
        pj = pj[:-1]
    travel = 0.0
    if loop:
        travel = float(np.linalg.norm((root[end] - root[start])[:2]) / ((end - start) / 30))
    return pj, scale, travel


def best_cycle(pj, seconds, search_from=0.0):
    """The [start, end] frames, end - start within `seconds` at 30 fps, whose poses match best."""
    rel = pj - pj[:, :1]  # pose relative to the hips
    feat = rel[:, [K['ankle_L'], K['ankle_R'], K['knee_L'], K['knee_R'], K['hand_L'], K['hand_R'], K['head']]].reshape(len(pj), -1)
    vel = np.gradient(feat, axis=0)
    best, pair = math.inf, (0, len(pj) - 1)
    lo, hi = int(seconds[0] * 30), int(seconds[1] * 30)
    first = int(search_from * len(pj))
    for a in range(first, max(first + 1, len(pj) - lo)):
        for b in range(a + lo, min(len(pj), a + hi + 1)):
            cost = np.linalg.norm(feat[a] - feat[b]) + 4 * np.linalg.norm(vel[a] - vel[b])
            if cost < best:
                best, pair = cost, (a, b)
    return pair


def source(motion_dir, name, partner=None):
    """Which take to use for a clip, and whether to mirror it, so every clip holds the rifle
    right-handed. A left-handed strafe or dodge is replaced by its mirrored opposite."""
    import os
    def raw(n):
        path = os.path.join(motion_dir, n + '.npz')
        return path, (handedness(to_blender(np.load(path)['posed_joints'].astype(np.float64))) if os.path.exists(path) else None)
    path, hand = raw(name)
    if hand is None or hand > -.2:
        return path, False, hand
    if partner:
        # Mirroring a directional take would reverse it: use the opposite take mirrored, or keep this one.
        other, other_hand = raw(partner)
        if other_hand is not None and other_hand < -.2:
            return other, True, -other_hand
        return path, False, hand
    return path, True, -hand


def frame(direction, secondary):
    """An orthonormal frame: Y along `direction`, X along `secondary` made perpendicular to it."""
    y = Vector(direction).normalized()
    x = Vector(secondary)
    x = (x - y * x.dot(y))
    if x.length < 1e-6:
        x = Vector((1, 0, 0)) - y * y.x
    x.normalize()
    z = x.cross(y)
    return Matrix((x, y, z)).transposed()  # columns x, y, z


SIDES = (('Left', '_L'), ('Right', '_R'))
# Mixamo finger N is mocap finger N + 1 (SOMA counts the metacarpal); the thumbs line up.
FINGERS = {'Thumb': [1, 2, 3, 'End'], 'Index': [2, 3, 4, 'End'], 'Middle': [2, 3, 4, 'End'], 'Ring': [2, 3, 4, 'End'], 'Pinky': [2, 3, 4, 'End']}
FINGER_BASE = {'Thumb': 15, 'Index': 19, 'Middle': 24, 'Ring': 29, 'Pinky': 34}  # left hand; the right is +28
FINGER_SLOT = {1: 0, 2: 1, 3: 2, 4: 3, 'End': 4}
THUMB_SLOT = {1: 0, 2: 1, 3: 2, 'End': 3}


def finger_index(name, n, right):
    base = FINGER_BASE[name] + (28 if right else 0)
    return base + (THUMB_SLOT if name == 'Thumb' else FINGER_SLOT)[n]


class Retargeter:
    """Poses a Mixamo-standard rig from mocap positions, frame by frame. Each bone is turned so a
    frame built from mocap landmarks (its direction plus a twist reference) lands on the same
    frame built from the rig at rest: the two skeletons' rest poses cancel exactly."""

    def __init__(self, rig):
        self.rig = rig
        b = rig.data.bones
        self.b = b
        self.rest = {x.name: x.matrix_local.to_3x3() for x in b}
        head = lambda n: b[n].head_local.copy()
        left = head('LeftUpLeg') - head('RightUpLeg')
        shoulders = head('LeftArm') - head('RightArm')
        self.rest_frames = {
            'Hips': frame(head('Spine') - head('Hips'), left),
            'Spine': frame(head('Spine1') - head('Spine'), (left + shoulders) / 2),
            'Spine1': frame(head('Spine2') - head('Spine1'), shoulders),
            'Spine2': frame(head('Neck') - head('Spine2'), shoulders),
            'Neck': frame(head('Head') - head('Neck'), shoulders),
            'Head': frame(b['Head'].tail_local - head('Head'), shoulders),
        }
        for side, _ in SIDES:
            arm, fore, hand = head(side + 'Arm'), head(side + 'ForeArm'), head(side + 'Hand')
            n = self.bend(arm, fore, hand)
            self.rest_frames[side + 'Arm'] = frame(fore - arm, n)
            self.rest_frames[side + 'ForeArm'] = frame(hand - fore, n)
            palm = head(side + 'HandIndex1') - head(side + 'HandPinky1')
            self.rest_frames[side + 'Hand'] = frame(head(side + 'HandMiddle1') - hand, palm)
            foot, toe, leg = head(side + 'Foot'), head(side + 'ToeBase'), head(side + 'Leg')
            self.rest_frames['foot' + side] = frame(toe - foot, (toe - foot).cross(leg - foot))
        self.ik = 'ik_foot_Left' in b

    @staticmethod
    def bend(a, b, c):
        n = (b - a).cross(c - b)
        return n.normalized() if n.length > 1e-6 else Vector((0, -1, 0))

    def set_world(self, bone, rotation, location=None):
        import bpy
        pb = self.rig.pose.bones[bone]
        # A pure rotation: any scale left in the input would compound frame after frame.
        m = rotation.to_quaternion().normalized().to_matrix().to_4x4()
        m.translation = location if location is not None else pb.matrix.translation
        pb.matrix = m
        pb.scale = (1, 1, 1)
        bpy.context.view_layer.update()

    def aim(self, bone, target_frame, rest_key=None):
        R = target_frame @ self.rest_frames[rest_key or bone].inverted() @ self.rest[bone]
        self.set_world(bone, R)

    def swing(self, bone, want):
        """Turn a bone (keeping its twist from its parent) to point along `want`."""
        pb = self.rig.pose.bones[bone]
        cur = (pb.tail - pb.head).normalized()
        self.set_world(bone, cur.rotation_difference(Vector(want).normalized()).to_matrix() @ pb.matrix.to_3x3())

    def pose(self, p, frame_index, parts, key):
        v = lambda name: Vector(p[K[name]])
        j = lambda i: Vector(p[i])
        if 'lower' in parts:
            hips = v('hips')
            left = v('hip_L') - v('hip_R')
            R = frame(v('spine1') - hips, left) @ self.rest_frames['Hips'].inverted() @ self.rest['Hips']
            mid = (v('hip_L') + v('hip_R')) / 2
            rest_mid = (self.b['LeftUpLeg'].head_local + self.b['RightUpLeg'].head_local) / 2
            offset = R @ (self.rest['Hips'].inverted() @ (rest_mid - self.b['Hips'].head_local))
            self.set_world('Hips', R, mid - offset)
            key('Hips', ('location', 'rotation_quaternion'))
            for side, s in SIDES:
                ankle, ball, knee, hip, toe = v('ankle' + s), v('ball' + s), v('knee' + s), v('hip' + s), v('toe' + s)
                ankle.z = max(ankle.z, self.b[side + 'Foot'].head_local.z - .01)
                foot = frame(ball - ankle, (ball - ankle).cross(knee - ankle))
                if self.ik:
                    rot = foot @ self.rest_frames['foot' + side].inverted() @ self.rest['ik_foot_' + side]
                    self.set_world('ik_foot_' + side, rot, ankle)
                    key('ik_foot_' + side, ('location', 'rotation_quaternion'))
                    out = knee - (hip + ankle) / 2
                    if out.length < .02:
                        out = Vector((0, -1, 0))
                    self.set_world('pole_knee_' + side, self.rig.pose.bones['pole_knee_' + side].matrix.to_3x3(), knee + out.normalized() * .5)
                    key('pole_knee_' + side, ('location', 'rotation_quaternion'))
                else:
                    self.swing(side + 'UpLeg', knee - hip)
                    self.swing(side + 'Leg', ankle - knee)
                    self.aim(side + 'Foot', foot, 'foot' + side)
                self.swing(side + 'ToeBase', toe - ball)
                key(side + 'ToeBase', ('rotation_quaternion',))
        if 'trunk' in parts:
            shoulders = v('arm_L') - v('arm_R')
            hipline = v('hip_L') - v('hip_R')
            for bone, a, b, ref in (('Spine', 'spine1', 'spine2', (hipline + shoulders) / 2), ('Spine1', 'spine2', 'chest', shoulders),
                                    ('Spine2', 'chest', 'neck1', shoulders), ('Neck', 'neck1', 'head', v('eye_L') - v('eye_R')),
                                    ('Head', 'head', 'head_end', v('eye_L') - v('eye_R'))):
                self.aim(bone, frame(v(b) - v(a), ref))
                key(bone, ('rotation_quaternion',))
        if 'arms' in parts:
            for side, s in SIDES:
                self.swing(side + 'Shoulder', v('arm' + s) - v('shoulder' + s))
                key(side + 'Shoulder', ('rotation_quaternion',))
                sh, el, wr = v('arm' + s), v('forearm' + s), v('hand' + s)
                n = self.bend(sh, el, wr)
                self.aim(side + 'Arm', frame(el - sh, n))
                key(side + 'Arm', ('rotation_quaternion',))
                self.aim(side + 'ForeArm', frame(wr - el, n))
                key(side + 'ForeArm', ('rotation_quaternion',))
                right = side == 'Right'
                knuckle = j(finger_index('Middle', 2, right))
                palm = j(finger_index('Index', 2, right)) - j(finger_index('Pinky', 2, right))
                self.aim(side + 'Hand', frame(knuckle - wr, palm))
                key(side + 'Hand', ('rotation_quaternion',))
        if 'fingers' in parts:
            for side, s in SIDES:
                right = side == 'Right'
                for name, joints in FINGERS.items():
                    for seg in range(3):
                        bone = f'{side}Hand{name}{seg + 1}'
                        if bone not in self.b:
                            continue
                        a, b2 = joints[seg], joints[seg + 1]
                        self.swing(bone, j(finger_index(name, b2, right)) - j(finger_index(name, a, right)))
                        key(bone, ('rotation_quaternion',))
