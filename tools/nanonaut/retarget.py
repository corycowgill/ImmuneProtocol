"""Retargets Kimodo motion (tools/nanonaut/motion/<clip>.npz) onto the Nanonaut's skeleton.

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


def to_blender(p):
    """Kimodo (x left, y up, z forward) to Blender (x left, -y forward, z up)."""
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


def load(path, rig, loop=False, in_place=True, loop_range=(.75, 1.6), search_from=0.0):
    """Returns joint positions [T, 77, 3] in the rig's armature space, scaled to its legs."""
    d = np.load(path)
    pj = to_blender(d['posed_joints'].astype(np.float64))
    root = to_blender(d['smooth_root_pos'].astype(np.float64))
    # Scale: mocap leg (hip to ankle, plus ankle height) to the rig's.
    def leg(p):
        return (np.linalg.norm(p[:, K['hip_L']] - p[:, K['knee_L']], axis=-1) + np.linalg.norm(p[:, K['knee_L']] - p[:, K['ankle_L']], axis=-1)).mean()
    bones = rig.data.bones
    ours = (bones['thigh_L'].length + bones['shin_L'].length)
    scale = ours / leg(pj)
    pj = pj * scale
    root = root * scale
    # Ankle height: the mocap's ankle joint rides lower above the floor than the scan's (whose
    # boots have thick soles), so the whole take is raised by the difference, measured while the
    # foot is planted, and boots meet the floor instead of sinking through it.
    contact = d['foot_contacts'][:, 0].astype(bool) if 'foot_contacts' in d.files else np.ones(len(pj), bool)
    ankles = np.concatenate([pj[contact, K['ankle_L'], 2], pj[d['foot_contacts'][:, 3].astype(bool) if 'foot_contacts' in d.files else contact, K['ankle_R'], 2]])
    planted = float(np.median(ankles)) if len(ankles) else float(pj[:, K['ankle_L'], 2].min())
    lift = bones['foot_L'].head_local.z - planted
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


class Retargeter:
    """Poses one rig from mocap positions, frame by frame."""

    TRUNK = [  # bone, mocap from, mocap to, twist reference (mocap), the same reference on the rig at rest
        ('spine', 'spine1', 'chest', ('hip_L', 'hip_R', 'arm_L', 'arm_R'), ('thigh_L', 'thigh_R', 'upperarm_L', 'upperarm_R')),
        ('chest', 'chest', 'neck1', ('arm_L', 'arm_R'), ('upperarm_L', 'upperarm_R')),
        ('neck', 'neck1', 'head', ('eye_L', 'eye_R'), None),
        ('head', 'head', 'head_end', ('eye_L', 'eye_R'), None),
    ]

    def __init__(self, rig):
        self.rig = rig
        b = rig.data.bones
        head = lambda n: b[n].head_local.copy()
        self.rest = {n: b[n].matrix_local.to_3x3() for n in [x.name for x in b]}
        left = head('thigh_L') - head('thigh_R')
        self.rest_frames = {
            'hips': frame(head('spine') - head('hips'), left),
            'spine': frame(head('chest') - head('spine'), (left + head('upperarm_L') - head('upperarm_R')) / 2),
            'chest': frame(head('neck') - head('chest'), head('upperarm_L') - head('upperarm_R')),
            'neck': frame(head('head') - head('neck'), Vector((1, 0, 0))),
            'head': frame(b['head'].tail_local - head('head'), Vector((1, 0, 0))),
        }
        for s in ('_L', '_R'):
            self.rest_frames['upperarm' + s] = frame(head('forearm' + s) - head('upperarm' + s), self.bend(head('upperarm' + s), head('forearm' + s), head('hand' + s), s))
            self.rest_frames['forearm' + s] = frame(head('hand' + s) - head('forearm' + s), self.bend(head('upperarm' + s), head('forearm' + s), head('hand' + s), s))
            self.rest_frames['foot' + s] = frame(b['foot' + s].tail_local - head('foot' + s), Vector((1, 0, 0)))

    @staticmethod
    def bend(a, b, c, side):
        """The normal of the plane a limb bends in, pointing the same way on both sides."""
        n = (b - a).cross(c - b)
        if n.length < 1e-6:
            n = Vector((0, -1, 0))
        return n.normalized()

    def set_world(self, bone, rotation, location=None):
        pb = self.rig.pose.bones[bone]
        m = rotation.to_4x4()
        m.translation = location if location is not None else pb.matrix.translation
        pb.matrix = m
        import bpy
        bpy.context.view_layer.update()

    def aim(self, bone, target_frame):
        """Turn `bone` so its rest frame lands on `target_frame` (the rest-pose difference cancels)."""
        R = target_frame @ self.rest_frames[bone].inverted() @ self.rest[bone]
        self.set_world(bone, R)

    def pose(self, p, frame_index, parts, key):
        """Pose the rig from mocap positions p [77, 3]; parts: 'lower', 'trunk', 'arms'."""
        v = lambda name: Vector(p[K[name]])
        bones = self.rig.pose.bones
        if 'lower' in parts:
            hips = v('hips')
            left = v('hip_L') - v('hip_R')
            up = (v('spine1') - hips)
            R = frame(up, left) @ self.rest_frames['hips'].inverted() @ self.rest['hips']
            # Put the rig's hip joint where the mocap's pelvis is, keeping the leg roots aligned.
            mid = (v('hip_L') + v('hip_R')) / 2
            rest_mid = (self.rig.data.bones['thigh_L'].head_local + self.rig.data.bones['thigh_R'].head_local) / 2
            offset = R @ (self.rest['hips'].inverted() @ (rest_mid - self.rig.data.bones['hips'].head_local))
            self.set_world('hips', R, mid - offset)
            key('hips', ('location', 'rotation_quaternion'))
            for s in ('_L', '_R'):
                ankle, ball, knee, hip = v('ankle' + s), v('ball' + s), v('knee' + s), v('hip' + s)
                # A planted boot never dips below its own ankle height (its sole would go through the floor).
                ankle.z = max(ankle.z, self.rig.data.bones['foot' + s].head_local.z - .01)
                foot = frame(ball - ankle, (ball - ankle).cross(knee - ankle))
                rest_foot = frame(self.rig.data.bones['foot' + s].tail_local - self.rig.data.bones['foot' + s].head_local,
                                  (self.rig.data.bones['foot' + s].tail_local - self.rig.data.bones['foot' + s].head_local).cross(
                                      self.rig.data.bones['shin' + s].head_local - self.rig.data.bones['foot' + s].head_local))
                rot = foot @ rest_foot.inverted() @ self.rest['ik_foot' + s]
                self.set_world('ik_foot' + s, rot, ankle)
                key('ik_foot' + s, ('location', 'rotation_quaternion'))
                # The knee pole: out along the mocap's knee bend, half a metre.
                mid_leg = (hip + ankle) / 2
                out = knee - mid_leg
                if out.length < .02:
                    out = Vector((0, -1, 0))
                pole = knee + out.normalized() * .5
                self.set_world('pole_knee' + s, self.rig.pose.bones['pole_knee' + s].matrix.to_3x3(), pole)
                key('pole_knee' + s, ('location', 'rotation_quaternion'))
        if 'trunk' in parts:
            for bone, a, b, twist, _ in self.TRUNK:
                ref = (v(twist[0]) - v(twist[1])) if len(twist) == 2 else ((v(twist[0]) - v(twist[1])) + (v(twist[2]) - v(twist[3]))) / 2
                self.aim(bone, frame(v(b) - v(a), ref))
                key(bone, ('rotation_quaternion',))
        if 'arms' in parts:
            for s in ('_L', '_R'):
                sh, el, wr, mid = v('arm' + s), v('forearm' + s), v('hand' + s), v('middle' + s)
                # Clavicle: swing towards the mocap shoulder.
                pb = bones['clavicle' + s]
                cur = (pb.tail - pb.head).normalized()
                want = (sh - v('shoulder' + s)).normalized()
                self.set_world('clavicle' + s, cur.rotation_difference(want).to_matrix() @ pb.matrix.to_3x3())
                key('clavicle' + s, ('rotation_quaternion',))
                n = self.bend(sh, el, wr, s)
                self.aim('upperarm' + s, frame(el - sh, n))
                key('upperarm' + s, ('rotation_quaternion',))
                self.aim('forearm' + s, frame(wr - el, n))
                key('forearm' + s, ('rotation_quaternion',))
                pb = bones['hand' + s]
                cur = (pb.tail - pb.head).normalized()
                self.set_world('hand' + s, cur.rotation_difference((mid - wr).normalized()).to_matrix() @ pb.matrix.to_3x3())
                key('hand' + s, ('rotation_quaternion',))
