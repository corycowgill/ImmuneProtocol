"""Automated QA for the Nanonaut's skinned rig: run after build_nanonaut.py.

    blender -b tools/nanonaut/work/nanonaut.blend -P tools/nanonaut/qa.py -- [--render]

Writes tools/nanonaut/reports/qa.json and exits non-zero if a check fails:
  weights     at most four bones per vertex, normalized, none under 0.01, none unweighted
  bleed       no vertex is pulled by two bones that are not neighbours in the skeleton (the
              classic auto-rigging failure: a shin vertex weighted to the hip)
  stretch     per clip and per extreme pose, how much edges stretch or shrink against the rest
              pose (99th percentile and worst), and how much the closed mesh's volume changes
              (joints caving in under linear blend skinning)
  ground      boots never sink through the floor in locomotion, the body never in a death
  grip        hands stay on the carbine wherever a clip holds it in both hands
With --render it renders the extreme poses (reports/extreme_*.png)."""
import bpy, json, math, os, sys
import numpy as np
from mathutils import Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPORTS = os.path.join(HERE, 'reports')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
rig = bpy.data.objects['nanonaut_rig']
body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig and o.vertex_groups)
# Strain is relative edge stretch; a tear is how much longer the worst edge gets, in metres (what
# shows on screen: a 4 mm edge doubling is invisible, a 4 cm gap is not). Deaths and the extreme
# test poses bend further than play does and get the looser limits.
# Calibrated against this rig's measured behaviour: linear blend skinning (what three.js does)
# stretches a shoulder or a knee by some centimetres when it bends far and loses a little volume
# in deep folds; these limits catch tears and collapses beyond that.
LIMITS = {'stretch_p99': 1.0, 'tear_m': .05, 'tear_extreme_m': .08, 'volume_change': .09, 'volume_extreme': .14, 'bleed_fraction': .05,
          'foot_sink_m': .03, 'body_sink_m': .06, 'grip_m': .03}
GRIP = Vector((0, -.05, -.06))
FOREGRIP = Vector((0, .15, -.06))
failures = []


def fail(msg):
    failures.append(msg)
    print('[qa] FAIL', msg, flush=True)


# --- weights ----------------------------------------------------------------------------------
names = {g.index: g.name for g in body.vertex_groups}
bones = rig.data.bones
neighbours = {}
for b in bones:
    near = {b.name}
    if b.parent:
        near.add(b.parent.name)
        near.update(c.name for c in b.parent.children)
        if b.parent.parent:
            near.add(b.parent.parent.name)
    near.update(c.name for c in b.children)
    for c in b.children:
        near.update(g.name for g in c.children)
    neighbours[b.name] = near
too_many = unnormal = tiny = loose = bleed = 0
bleed_examples = []
for v in body.data.vertices:
    gs = [(names[g.group], g.weight) for g in v.groups if g.weight > 0]
    if not gs:
        loose += 1
        continue
    too_many += len(gs) > 4
    unnormal += abs(sum(w for _, w in gs) - 1) > 1e-3
    tiny += any(w < .01 for _, w in gs)
    strong = [n for n, w in gs if w > .1]
    hit = False
    for i, a in enumerate(strong):
        for b in strong[i + 1:]:
            if b not in neighbours.get(a, ()):
                hit = True
                if len(bleed_examples) < 6:
                    bleed_examples.append(f'{a}+{b} at {tuple(round(c, 2) for c in v.co)}')
                break
        if hit:
            break
    bleed += hit
n = len(body.data.vertices)
weights = {'vertices': n, 'over_four': too_many, 'not_normalized': unnormal, 'under_0.01': tiny, 'unweighted': loose,
           'bleeding': bleed, 'bleed_examples': bleed_examples}
print('[qa] weights', weights, flush=True)
if too_many or unnormal or tiny or loose:
    fail(f'weight hygiene: {too_many} over four bones, {unnormal} not normalized, {tiny} under 0.01, {loose} unweighted')
if bleed > LIMITS['bleed_fraction'] * n:
    fail(f'weight bleed on {bleed} vertices ({bleed / n:.2%}), e.g. {bleed_examples[:3]}')

# --- deformation --------------------------------------------------------------------------------
edges = np.array([e.vertices[:] for e in body.data.edges])
body.data.calc_loop_triangles()
tris = np.array([t.vertices[:] for t in body.data.loop_triangles])


def posed():
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    co = np.empty(len(ev.data.vertices) * 3)
    ev.data.vertices.foreach_get('co', co)
    m = np.array(body.matrix_world)
    return co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]


def volume(co):
    a, b, c = co[tris[:, 0]], co[tris[:, 1]], co[tris[:, 2]]
    return float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6)


def set_rest():
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()


rig.animation_data_create()
set_rest()
rest = posed()
rest_len = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
rest_vol = volume(rest)


def measure():
    bpy.context.view_layer.update()
    co = posed()
    length = np.linalg.norm(co[edges[:, 0]] - co[edges[:, 1]], axis=1)
    strain = np.abs(length / np.maximum(rest_len, 1e-6) - 1)
    wm = rig.matrix_world @ rig.pose.bones['weapon'].matrix
    wrist = lambda s: rig.matrix_world @ rig.pose.bones['forearm' + s].tail
    return {'p99': float(np.percentile(strain, 99)), 'max': float(strain.max()), 'tear': float(np.max(length - rest_len)), 'volume': abs(volume(co) - rest_vol) / abs(rest_vol),
            'lowest': float(co[:, 2].min()), 'grip': max((wrist('_R') - wm @ GRIP).length, (wrist('_L') - wm @ FOREGRIP).length)}


report = {'limits': LIMITS, 'weights': weights, 'clips': {}, 'extreme': {}}
LOCOMOTION = {'Stand', 'Walk', 'WalkBack', 'Run', 'StrafeL', 'StrafeR', 'Crouch', 'CrouchWalk', 'Aim', 'LowReady', 'Cover', 'Reload',
              'DodgeL', 'DodgeR', 'Stagger'}
TWO_HANDED = LOCOMOTION - {'Reload'}
for act in sorted(bpy.data.actions, key=lambda a: a.name):
    rig.animation_data.action = act
    start, end = (int(x) for x in act.frame_range)
    worst = {'p99': 0, 'max': 0, 'tear': 0, 'volume': 0, 'lowest': 9, 'grip': 0}
    for f in range(start, end + 1, 2):
        bpy.context.scene.frame_set(f)
        m = measure()
        for k in ('p99', 'max', 'tear', 'volume', 'grip'):
            worst[k] = max(worst[k], m[k])
        worst['lowest'] = min(worst['lowest'], m['lowest'])
    report['clips'][act.name] = worst
    sink = -worst['lowest']
    # Deaths, dives and the kneeling crouch fold knees and hips as far as the extreme test poses do.
    extreme = act.name.startswith(('Death', 'Dodge', 'Crouch'))
    print(f'[qa] {act.name:11s} stretch p99 {worst["p99"]:.0%}  tear {worst["tear"] * 100:.1f} cm  volume {worst["volume"]:.1%}  '
          f'lowest {worst["lowest"] * 100:5.1f} cm  grip {worst["grip"] * 100:4.1f} cm', flush=True)
    if worst['p99'] > LIMITS['stretch_p99'] * (1.4 if extreme else 1):
        fail(f'{act.name}: edges stretch p99 {worst["p99"]:.0%}')
    if worst['tear'] > LIMITS['tear_extreme_m' if extreme else 'tear_m']:
        fail(f'{act.name}: the skin tears open {worst["tear"] * 100:.1f} cm')
    if worst['volume'] > LIMITS['volume_extreme' if extreme else 'volume_change']:
        fail(f'{act.name}: volume changes {worst["volume"]:.1%}')
    if act.name in LOCOMOTION and sink > LIMITS['foot_sink_m']:
        fail(f'{act.name}: a boot sinks {sink * 100:.1f} cm into the floor')
    if act.name.startswith('Death') and sink > LIMITS['body_sink_m']:
        fail(f'{act.name}: the body sinks {sink * 100:.1f} cm into the floor')
    if act.name in TWO_HANDED and worst['grip'] > LIMITS['grip_m']:
        fail(f'{act.name}: a hand leaves the carbine by {worst["grip"] * 100:.1f} cm')

rest_q = {b.name: b.matrix_local.to_quaternion() for b in bones}


def rot(bone, pitch=0, yaw=0, roll=0):
    q = Quaternion((0, 0, 1), math.radians(yaw)) @ Quaternion((0, 1, 0), math.radians(roll)) @ Quaternion((1, 0, 0), math.radians(pitch))
    R = rest_q[bone]
    rig.pose.bones[bone].rotation_quaternion = R.inverted() @ q @ R


EXTREME = {
    'knee 120': lambda: (rot('thigh_L', -60), rot('shin_L', 120), rot('thigh_R', -60), rot('shin_R', 120)),
    'arms raised': lambda: (rot('upperarm_L', roll=-70, pitch=-40), rot('upperarm_R', roll=70, pitch=-40)),
    'elbows 130': lambda: (rot('upperarm_L', -60), rot('forearm_L', -130), rot('upperarm_R', -60), rot('forearm_R', -130)),
    'deep crouch': lambda: (rot('thigh_L', -95), rot('shin_L', 125), rot('foot_L', -30), rot('thigh_R', -95), rot('shin_R', 125),
                            rot('foot_R', -30), rot('spine', 25)),
    'waist twist 30': lambda: (rot('spine', yaw=18), rot('chest', yaw=12)),
    'lean back 25': lambda: (rot('spine', -15), rot('chest', -10)),
    'head turn 60': lambda: (rot('neck', yaw=25), rot('head', yaw=35, pitch=-15)),
    'stride': lambda: (rot('thigh_L', -50), rot('shin_L', 30), rot('thigh_R', 25), rot('shin_R', 60)),
}
for name, pose in EXTREME.items():
    set_rest()
    pose()
    m = measure()
    report['extreme'][name] = m
    print(f'[qa] extreme {name:15s} stretch p99 {m["p99"]:.0%} tear {m["tear"] * 100:.1f} cm volume {m["volume"]:.1%}', flush=True)
    if m['tear'] > LIMITS['tear_extreme_m'] or m['volume'] > LIMITS['volume_extreme']:
        fail(f'extreme {name}: tear {m["tear"] * 100:.1f} cm, volume {m["volume"]:.1%}')

os.makedirs(REPORTS, exist_ok=True)
report['failures'] = failures
json.dump(report, open(os.path.join(REPORTS, 'qa.json'), 'w'), indent=1)

if '--render' in ARGS:
    for old in os.listdir(REPORTS):
        if old.startswith('extreme_'):
            os.remove(os.path.join(REPORTS, old))
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 420
    cam = bpy.data.objects.new('qa_cam', bpy.data.cameras.new('qa_cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    if not any(o.type == 'LIGHT' for o in scene.objects):
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        sun.data.energy = 3.5
        sun.rotation_euler = (.9, .2, .6)
        scene.collection.objects.link(sun)
    for name, pose in EXTREME.items():
        for view, loc in (('front', (1.4, -3.2, 1.1)), ('back', (-1.6, 3.0, 1.2))):
            set_rest()
            pose()
            bpy.context.view_layer.update()
            cam.location = loc
            cam.rotation_euler = (Vector((0, 0, .85)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = os.path.join(REPORTS, 'extreme_%s_%s.png' % (name.replace(' ', '_'), view))
            bpy.ops.render.render(write_still=True)
    print('[qa] extreme pose renders in', REPORTS, flush=True)

print('[qa]', 'PASS' if not failures else f'{len(failures)} FAILURES', flush=True)
sys.exit(1 if failures else 0)
