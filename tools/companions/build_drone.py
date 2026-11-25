"""Models the medic drone companion in Blender and exports it for the game.

blender -b -P tools/companions/build_drone.py -- [--render] [--quick]

Reuses the weapon pipeline (tools/weapons/build_weapons.py): the same Kit, cutters,
bevels, weighted normals, occlusion/edge-wear bake and glTF export, writing to
dist/assets/companions/drone.glb and drone-weathering.webp.

Game coordinates as in the weapons (x left/right, y up, z toward the back, metres);
the drone faces -z, origin at the centre of the pod. Nodes:
  body      everything static
  rotor-0   front-left blades + hub (-x, -z)    rotor-1  front-right (+x, -z)
  rotor-3   back-left (-x, +z)                  rotor-2  back-right  (+x, +z)
            each node's origin is its hub; the game spins it about local Y
  emitter   an empty at the tip of the belly nozzle, where the healing beam starts
Flat cosmetic mount surfaces are listed in tools/companions/drone-mounts.json.

--quick skips finishing, baking and export and only renders the previews.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'weapons'))
os.environ.setdefault('WEAPON_ATLAS', '1024')
import build_weapons as bw  # noqa: E402

bw.OUT = os.path.join(bw.ROOT, 'dist', 'assets', 'companions')
bw.WORK = os.path.join(HERE, 'work')
bw.ATLAS = int(os.environ.get('WEAPON_ATLAS', 1024))
os.makedirs(bw.OUT, exist_ok=True)
os.makedirs(bw.WORK, exist_ok=True)

to_b = bw.to_b
TAU = math.tau

# Rotor hubs, in node order.
HUB = .22
HUB_Y = .003
CORNERS = [(-1, -1), (1, -1), (1, 1), (-1, 1)]

# ---------------------------------------------------------------------------
# Pod shape: a superellipse cross-section lofted along z, blunt at both ends.
# ---------------------------------------------------------------------------
ZC, HF, HB = -.005, .16, .145
POD_W, POD_TOP, POD_BOT, POD_EXP = .086, .074, .066, 2.7


def pod(z):
    t = (z - ZC) / (HF if z < ZC else HB)
    f = max(0., 1 - abs(t) ** 3) ** (1 / 3)
    return POD_W * f, POD_TOP * f, POD_BOT * f


def pod_top(z, x=0.):
    hw, top, _ = pod(z)
    return top * max(0., 1 - abs(x / hw) ** POD_EXP) ** (1 / POD_EXP)


def pod_side(z, y=0.):
    hw, top, bot = pod(z)
    h = top if y >= 0 else bot
    return hw * max(0., 1 - abs(y / h) ** POD_EXP) ** (1 / POD_EXP)


Z_NOSE = ZC - .922 * HF
Z_TAIL = ZC + .922 * HB


def ring_points(hw, top, bot, n, e):
    out = []
    for i in range(n):
        a = i / n * TAU
        c, s = math.cos(a), math.sin(a)
        x = hw * math.copysign(abs(c) ** (2 / e), c)
        y = (top if s >= 0 else bot) * math.copysign(abs(s) ** (2 / e), s)
        out.append((x, y))
    return out


def loft(k, z0, z1, mat, stations=14, n=64, scale=1., bevel=.0025, segments=3, cuts=(), ease=0):
    """A pod segment from z0 to z1 with flat end caps; ease>0 packs stations at z0, <0 at z1."""
    bm = bmesh.new()
    rings = []
    for i in range(stations):
        u = i / (stations - 1)
        if ease > 0:
            u = 1 - math.cos(u * math.pi / 2)
        elif ease < 0:
            u = math.sin(u * math.pi / 2)
        z = z0 + (z1 - z0) * u
        hw, top, bot = pod(z)
        rings.append([bm.verts.new(to_b(x, y, z)) for x, y in ring_points(hw * scale, top * scale, bot * scale, n, POD_EXP)])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    return k._object(bm, mat, bevel, segments, 40, cuts, True)


def revolve(k, profile, mat, center=(0, 0), axis='y', segments=64, arc=None, radius=0., steps=3, bevel=0):
    """A closed (radius, along) cross-section swept around an axis: rings, lips and collars.
    `arc` = (a0, a1) sweeps only part of the way round and caps both ends."""
    pts = bw.rounded(profile, radius, steps) if radius else [tuple(p[:2]) for p in profile]
    bm = bmesh.new()
    full = arc is None
    a0, a1 = arc if arc else (0, TAU)
    count = segments if full else segments + 1
    rings = []
    for i in range(count):
        a = a0 + (a1 - a0) * i / segments
        ring = []
        for r, along in pts:
            u, v = math.cos(a) * r, math.sin(a) * r
            if axis == 'z':
                p = (center[0] + u, center[1] + v, along)
            elif axis == 'x':
                p = (along, center[0] + u, center[1] + v)
            else:
                p = (center[0] + u, along, center[1] + v)
            ring.append(bm.verts.new(to_b(*p)))
        rings.append(ring)
    pairs = list(zip(rings, rings[1:]))
    if full:
        pairs.append((rings[-1], rings[0]))
    m = len(pts)
    for a, b in pairs:
        for i in range(m):
            j = (i + 1) % m
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if not full:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    return k._object(bm, mat, bevel, 2, 40, (), True)


def screw_y(k, x, y, z, r=.0042, d=1, mat='edge'):
    """A screw head standing on a face that looks up (d=1) or down (d=-1)."""
    return k.lathe([(0, y - .0015 * d), (r * .85, y - .0015 * d), (r, y), (r, y + .0018 * d),
                    (r * .7, y + .0028 * d), (0, y + .0028 * d)], mat, center=(x, z), axis='y', segments=18,
                   cuts=[bw.cutter_box((x, y + .0028 * d, z), (r * 1.6, .003, .0012))])


def screw_z(k, x, y, z, r=.0042, d=1, mat='edge'):
    """A screw head on a face that looks back (d=1, +z) or forward (d=-1)."""
    return k.lathe([(0, z - .0015 * d), (r * .85, z - .0015 * d), (r, z), (r, z + .0018 * d),
                    (r * .7, z + .0028 * d), (0, z + .0028 * d)], mat, center=(x, y), axis='z', segments=18,
                   cuts=[bw.cutter_box((x, y, z + .0028 * d), (r * 1.6, .0012, .003))])


def spin(obj, angle):
    """Turns a part about the game's vertical axis (radians, +x toward +z... see arm_angle)."""
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler[2] = angle
    return obj


def arm_angle(sx, sz):
    # A part built along game +z points toward (sx, sz) after this turn about Blender Z.
    return math.atan2(sx, sz)


# ---------------------------------------------------------------------------
# Body
# ---------------------------------------------------------------------------

def build_pod(k):
    # Shell panels: nose, mid and tail, split by seams. A glowing status ring fills the
    # front seam, a dark core the rear one.
    eye = bw.cutter_cylinder((0, .002, Z_NOSE - .01), .032, .06, axis='z', segments=40)
    loft(k, Z_NOSE, -.08, 'shell', stations=16, ease=-1, cuts=[eye])
    loft(k, -.085, -.071, 'accent', stations=4, n=48, scale=.986, bevel=0)
    # Mid panel: two seams down the back, either side of the top sticker plate.
    seams = [bw.cutter_box((side * .047, pod_top(-.01, .047), -.01), (.0016, .012, .2)) for side in (-1, 1)]
    loft(k, -.076, .056, 'shell', stations=16, cuts=seams)
    loft(k, .051, .065, 'dark', stations=4, n=48, scale=.975, bevel=0)
    vents = [bw.cutter_slot((side * .074, .002 + i * .012, .094), .034, .0062, .03)
             for side in (-1, 1) for i in range(3)]
    loft(k, .06, Z_TAIL, 'shell', stations=12, ease=1, cuts=vents)

    # Side decal panels (flat, facing +-x) with a marking strip below.
    for side in (-1, 1):
        k.profile([(-.0505, -.0225), (.0355, -.0225), (.0355, .0305), (-.0505, .0305)], .014, 'dark',
                  x=side * .08, radius=.006, bevel=.0012)
        text = bw.cutter_text('MEDEVAC-3', (side * .083, -.036, -.0075), .0085, side=side, depth=.0014, bold=True)
        k.profile([(-.0505, -.0435), (.0355, -.0435), (.0355, -.0285), (-.0505, -.0285)], .012, 'steel',
                  x=side * .077, radius=.003, bevel=.001, cuts=[text])
        # Accent status strip along the top of each decal panel.
        k.box((side * .0838, .036, -.0075), (.004, .0035, .07), 'accent', bevel=.0008)

    # Top sticker plate (flat, facing up) between the back seams.
    k.section([(-.032, .066), (.032, .066), (.032, .078), (-.032, .078)], -.06, -.012, 'dark', radius=.0015,
              bevel=.0012)
    for x in (-.038, .038):
        for z in (-.056, -.016):
            screw_y(k, x, pod_top(z, x) - .0005, z, r=.0034)

    # Medical cross on the nose: an accent cross on a dark roundel, tilted to the slope.
    zc = -.118
    slope = (pod_top(zc + .004) - pod_top(zc - .004)) / .008
    tilt = -math.atan(slope)
    yc = pod_top(zc) - .0015
    disc = k.lathe([(0, -.003), (.021, -.003), (.0225, -.0015), (.0225, .0018), (.021, .003), (0, .003)], 'dark',
                   center=(0, 0), axis='y', segments=40)
    bar1 = k.box((0, .0035, 0), (.026, .004, .0085), 'accent', bevel=.0012)
    bar2 = k.box((0, .0035, 0), (.0085, .004, .026), 'accent', bevel=.0012)
    for part in (disc, bar1, bar2):
        bw.place(part, (0, yc, zc), tilt)

    # Medical cross on the tail, the side the player sees most.
    k.box((0, .0, Z_TAIL - .001), (.046, .046, .008), 'dark', bevel=.003)
    k.box((0, .0, Z_TAIL + .003), (.032, .01, .006), 'accent', bevel=.0015)
    k.box((0, .0, Z_TAIL + .003), (.01, .032, .006), 'accent', bevel=.0015)
    for x in (-.017, .017):
        for y in (-.017, .017):
            screw_z(k, x, y, Z_TAIL + .003, r=.0026)


def build_eye(k):
    y, c = .002, (0, .002)
    zf = Z_NOSE
    k.lathe([(0, zf + .035), (.0312, zf + .035), (.0312, zf + .002), (0, zf + .002)], 'dark', center=c, axis='z')
    revolve(k, [(.0255, zf + .003), (.0255, zf - .004), (.029, zf - .0085), (.0355, zf - .0085), (.0385, zf - .005),
                (.0385, zf + .002), (.0355, zf + .004)], 'steel', center=c, axis='z', segments=56, radius=.0012)
    revolve(k, [(.0235, zf + .006), (.0235, zf - .002), (.0258, zf - .002), (.0258, zf + .006)], 'edge', center=c,
            axis='z', segments=48)
    revolve(k, [(.0135, zf + .009), (.0135, zf + .006), (.022, zf + .006), (.022, zf + .009)], 'accent', center=c,
            axis='z', segments=48)
    k.lathe([(0, zf + .01), (.0136, zf + .01), (.0136, zf + .0075), (0, zf + .0075)], 'dark', center=c, axis='z',
            segments=32)
    k.lathe([(0, zf - .0055), (.012, zf - .0045), (.019, zf - .0015), (.0236, zf + .002), (.0236, zf + .005),
             (0, zf + .005)], 'glass', center=c, axis='z', segments=48)
    # Brow: a dark visor strip across the top of the nose with two accent pips.
    for side in (-1, 1):
        k.lathe([(0, zf - .001), (.0042, zf - .001), (.0048, zf + .001), (.0048, zf + .006), (0, zf + .006)],
                'accent', center=(side * .036, .029), axis='z', segments=16)
    del y


def build_arms(k):
    for sx, sz in CORNERS:
        angle = arm_angle(sx, sz)
        d = Vector((sx, 0, sz)).normalized()

        def at(s, y):
            return (d.x * s, y, d.z * s)

        arm = k.profile([(.04, .026), (.13, .022, .03), (.228, .013), (.228, -.015), (.13, -.026, .03),
                         (.04, -.032)], .032, 'shell', radius=.006, bevel=.0022, segments=3)
        spin(arm, angle)
        # Root cuff where the arm enters the pod, and a clamp at the duct.
        cuff = k.box((0, -.001, .118), (.043, .062, .03), 'dark', bevel=.004)
        spin(cuff, angle)
        clamp = k.box((0, -.001, .2075), (.04, .036, .022), 'dark', bevel=.003)
        spin(clamp, angle)
        led = k.box((0, .0188, .168), (.007, .004, .042), 'accent', bevel=.0012, rotate=('x', .09))
        spin(led, angle)
        for off in (-.011, .011):
            p = Vector(at(.118, 0)) + Vector((-d.z, 0, d.x)) * off
            screw_y(k, p.x, .0305, p.z, r=.0036)
        build_duct(k, sx * HUB, sz * HUB, angle)


def build_duct(k, hx, hz, angle):
    c = (hx, hz)
    # Duct ring: rounded lip on top, slight flare below.
    revolve(k, [(.0795, -.024), (.0795, .017), (.0835, .026), (.09, .027), (.0945, .022), (.0945, -.014),
                (.0905, -.026), (.083, -.027)], 'shell', center=c, segments=72, radius=.003)
    # Dark liner inside, a steel lip ring, and a glowing arc on the outward face.
    revolve(k, [(.0778, -.021), (.0778, .015), (.08, .015), (.08, -.021)], 'dark', center=c, segments=72)
    revolve(k, [(.0822, .0255), (.0822, .0285), (.0918, .0285), (.0918, .0255)], 'edge', center=c, segments=72,
            radius=.0008)
    out = math.atan2(hz, hx)
    for i in range(6):
        a = out + math.pi / 6 + i * math.pi / 3
        screw_y(k, hx + math.cos(a) * .087, .0285, hz + math.sin(a) * .087, r=.0028)
    revolve(k, [(.0935, -.0035), (.0935, .0035), (.0962, .0035), (.0962, -.0035)], 'accent', center=c, segments=24,
            arc=(out - .75, out + .75), radius=.0006)
    revolve(k, [(.0935, -.0155), (.0935, -.0105), (.0958, -.0105), (.0958, -.0155)], 'dark', center=c, segments=72)
    # Motor pod under the rotor, held by four struts.
    k.lathe([(0, -.038), (.012, -.038), (.0175, -.035), (.022, -.026), (.0232, -.012), (.021, -.0065), (0, -.0065)],
            'dark', center=c, axis='y', segments=40)
    revolve(k, [(.0225, -.024), (.0242, -.024), (.0248, -.016), (.0236, -.016)], 'steel', center=c, segments=40)
    k.lathe([(0, -.0395), (.007, -.0395), (.008, -.037), (0, -.037)], 'edge', center=c, axis='y', segments=24)
    for i in range(4):
        a = out + math.pi / 4 + i * math.pi / 2
        r = .051
        k.box((hx + math.cos(a) * r, -.017, hz + math.sin(a) * r), (.058, .006, .009), 'dark', bevel=.0015,
              rotate=('y', -a))
    del angle


def build_belly(k):
    zc = -.01
    c = (0, zc)
    # Emitter: a dark base plate, steel flange, collared nozzle and a recessed glowing core.
    k.lathe([(0, -.057), (.045, -.057), (.047, -.06), (.047, -.065), (.044, -.068), (0, -.068)], 'dark', center=c,
            axis='y', segments=56)
    k.lathe([(0, -.066), (.032, -.066), (.034, -.069), (.034, -.074), (.031, -.076), (0, -.076)], 'steel',
            center=c, axis='y', segments=48)
    k.lathe([(0, -.075), (.027, -.075), (.0255, -.084), (.021, -.094), (0, -.094)], 'dark', center=c, axis='y',
            segments=48)
    revolve(k, [(.0255, -.0785), (.0285, -.0785), (.0285, -.0825), (.025, -.0825)], 'edge', center=c, segments=48,
            radius=.0006)
    revolve(k, [(.0125, -.091), (.021, -.091), (.0225, -.094), (.0215, -.1), (.019, -.1015), (.0135, -.1015),
                (.0125, -.098)], 'steel', center=c, segments=48, radius=.0008)
    k.lathe([(0, -.091), (.0128, -.091), (.0128, -.093), (.01, -.0965), (0, -.0975)], 'accent', center=c, axis='y',
            segments=32)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        screw_y(k, math.cos(a) * .039, -.068, zc + math.sin(a) * .039, r=.0033, d=-1)
    # Intake grilles fore and aft of the emitter.
    for z in (-.066, .044):
        grille = [bw.cutter_box((0, -.0705, z + (i - 1.5) * .007), (.05, .006, .0032)) for i in range(4)]
        k.section([(-.03, -.07), (.03, -.07), (.03, -.058), (-.03, -.058)], z - .015, z + .015, 'dark', radius=.002,
                  bevel=.0012, cuts=grille)
    # Landing skids.
    for side in (-1, 1):
        for z in (-.058, .046):
            k.section([(side * .036, -.052), (side * .052, -.052), (side * .0745, -.103), (side * .0645, -.103)],
                      z - .0065, z + .0065, 'dark', radius=.003, bevel=.0015)
            k.box((side * .042, -.058, z), (.026, .012, .022), 'steel', bevel=.002)
        x = side * .07
        k.lathe([(0, -.086), (.0035, -.0862), (.0058, -.0855), (.0065, -.083), (.0065, .075), (.0058, .078),
                 (.0035, .0792), (0, .0794)], 'steel', center=(x, -.106), axis='z', segments=24)
        for z in (-.058, .046):
            k.lathe([(.0064, z - .014), (.0082, z - .012), (.0082, z + .012), (.0064, z + .014)], 'rubber',
                    center=(x, -.106), axis='z', segments=24)


def build_canister(k):
    y, z0, z1 = .097, -.002, .102
    c = (0, y)
    for z in (.012, .088):
        k.section([(-.026, .05), (.026, .05), (.027, .088, .006), (.018, .099, .004), (-.018, .099, .004),
                   (-.027, .088, .006)], z - .008, z + .008, 'dark', radius=.004, bevel=.0015,
                  cuts=[bw.cutter_cylinder((0, y, z), .0205, .03, axis='z', segments=40)])
    k.tube(.0192, z0 + .012, z1 - .012, 'glass', center=c, segments=40)
    k.tube(.0125, z0 + .014, z1 - .014, 'accent', center=c, segments=32)
    for zz in (.035, .05, .065):
        revolve(k, [(.0122, zz - .0015), (.0142, zz - .0015), (.0142, zz + .0015), (.0122, zz + .0015)], 'dark',
                center=c, axis='z', segments=32)
    for za, zb, s in ((z0, z0 + .016, -1), (z1 - .016, z1, 1)):
        k.lathe([(0, za), (.0205, za), (.0225, za + .002), (.0225, zb - .002), (.0205, zb), (0, zb)], 'steel',
                center=c, axis='z', segments=40,
                cuts=[bw.cutter_box((math.cos(a) * .0228, y + math.sin(a) * .0228, (za + zb) / 2),
                                    (.003, .003, .02), rotate=('z', a)) for a in [i * TAU / 12 for i in range(12)]])
        zt = zb if s > 0 else za
        k.lathe([(0, zt), (.008, zt), (.0085, zt + s * .003), (0, zt + s * .003)], 'edge', center=c, axis='z',
                segments=24)


def build_body():
    k = bw.Kit('drone', 'body')
    build_pod(k)
    build_eye(k)
    build_arms(k)
    build_belly(k)
    build_canister(k)
    # Charm eyelet under the back-left arm.
    d = Vector((-1, 0, 1)).normalized()
    p = d * .165
    k.box((p.x, -.026, p.z), (.012, .008, .016), 'dark', bevel=.002, rotate=('y', arm_angle(-1, 1)))
    eyelet = revolve(k, [(.0042, -.0016), (.0042, .0016), (.0072, .0016), (.0072, -.0016)], 'steel', center=(0, 0),
                     axis='x', segments=24, radius=.0007)
    eyelet.location = to_b(p.x, -.0335, p.z)
    spin(eyelet, arm_angle(-1, 1) + math.pi / 2)
    return k


def build_rotor(index):
    sx, sz = CORNERS[index]
    k = bw.Kit('drone', 'rotor-%d' % index)
    k.root.location = to_b(sx * HUB, HUB_Y, sz * HUB)
    # Neighbouring rotors counter-rotate: mirror the blade pitch.
    hand = 1 if index % 2 == 0 else -1
    k.lathe([(0, -.0055), (.0135, -.0055), (.0142, -.003), (.0142, .002), (.011, .0075), (.006, .0105), (0, .0115)],
            'edge', center=(0, 0), axis='y', segments=36)
    k.lathe([(0, .0108), (.0035, .0108), (.0035, .0135), (0, .0135)], 'accent', center=(0, 0), axis='y', segments=16)
    for b in range(3):
        blade(k, b * TAU / 3, hand)
    return k


def blade(k, phi, hand):
    bm = bmesh.new()
    r0, r1 = .011, .0735
    stations = 9
    rings = []
    for i in range(stations):
        u = i / (stations - 1)
        r = r0 + (r1 - r0) * u
        chord = .024 - .009 * u - .004 * u ** 4
        thick = .0034 - .0016 * u
        pitch = hand * math.radians(24 - 13 * u)
        sweep = .006 * u * u
        rad = Vector((math.cos(phi), 0, math.sin(phi)))
        tan = Vector((-math.sin(phi), 0, math.cos(phi))) * hand
        section = [(-.5, 0), (-.32, .5), (.1, .5), (.5, .1), (.5, -.1), (.1, -.35), (-.32, -.35)]
        ring = []
        for cu, cv in section:
            uu, vv = cu * chord + sweep, cv * thick
            t = uu * math.cos(pitch) - vv * math.sin(pitch)
            h = uu * math.sin(pitch) + vv * math.cos(pitch)
            p = rad * r + tan * t
            ring.append(bm.verts.new(to_b(p.x, h, p.z)))
        rings.append(ring)
    m = 7
    for a, b in zip(rings, rings[1:]):
        for i in range(m):
            j = (i + 1) % m
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    return k._object(bm, 'steel', .0005, 1, 50, (), True)


EMITTER = (0, -.1, -.01)


def build_emitter():
    k = bw.Kit('drone', 'emitter')
    k.root.location = to_b(*EMITTER)
    k.root.empty_display_size = .02
    return k


def build():
    build_body()
    for i in range(4):
        build_rotor(i)
    build_emitter()


# ---------------------------------------------------------------------------
# Previews
# ---------------------------------------------------------------------------

VIEWS = {
    'front34': (-1.0, .55, -1.25),
    'back34': (1.1, .6, 1.1),
    'top': (.001, 1, .0001),
    'under': (-.6, -.9, -.7),
    'side': (-1, .12, .0),
}


DIST = float(os.environ.get('DRONE_CAM_DIST', 1.05))


def render_views(names, samples=48):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    for obj in [o for o in bpy.data.objects if o.type in ('CAMERA', 'LIGHT')]:
        bpy.data.objects.remove(obj)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1000, 760
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.05, .045, .045, 1)
    scene.world = world
    glass = bpy.data.materials.get('glass')
    if glass:
        bsdf = glass.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Transmission Weight'].default_value = .85
    center = Vector((0, 0, 0))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    scene.camera = cam
    for offset, energy, color in ((to_b(-2, 3, -1), 90, (1, .95, .88)), (to_b(2, .8, 1.5), 50, (.7, .85, 1)),
                                  (to_b(-1, -2, 1.5), 25, (1, .8, .7))):
        light = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA'))
        light.data.energy = energy
        light.data.color = color
        light.data.size = 1.5
        light.location = center + offset
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    for name in names:
        cam.location = center + to_b(*VIEWS[name]).normalized() * DIST
        cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(bw.WORK, 'drone-%s.png' % name)
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    views = [a[7:] for a in args if a.startswith('--view=')] or list(VIEWS)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build()
    if '--quick' in args:
        render_views(views, samples=24)
        sys.exit(0)
    nodes, parts = bw.finish('drone')
    bw.bake('drone', parts)
    bw.export('drone', nodes, parts)
    if '--render' in args:
        bw.render('drone')
        render_views(views)
