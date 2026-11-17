"""Builds the photoreal co-op suit models for Immune Protocol.

Run from the repository root with Blender 4.2 LTS or newer (some distro
builds of 4.0 bake black maps):
    blender -b -P tools/suits/build_suits_hq.py -- vanguard wraith lifeline bathysphere

For each suit this script
  1. models the suit in Blender at real scale (conforming armour shells, lathed
     body volumes, corrugated hoses, rivets, straps, pouches),
  2. shades it with procedural PBR networks (chipped paint and edge wear,
     cavity grime, oxidation, scratches, fabric weave and wrinkles, dust),
  3. bakes those networks to a 2048px texture atlas (albedo, roughness +
     metallic, tangent-space normal) with Cycles,
  4. exports dist/assets/suits/<id>.glb with one mesh per animated joint of the
     teammate rig in dist/teammate.mjs (arm segments normalised to unit length),
  5. renders a Cycles beauty shot to tools/suits/renders/<id>_hq.png.

Reference art lives in tools/suits/reference/. Coordinates use the game frame
(+Y up, the suit faces -Z); see hq_kit.py.
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import hq_kit as K  # noqa: E402
from hq_kit import TAU, Lathe, glow, surface  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'dist', 'assets', 'suits')
RENDERS = os.path.join(ROOT, 'tools', 'suits', 'renders')
BAKE_DIR = os.path.join(ROOT, 'tools', 'suits', 'renders', 'bake')
for d in (OUT, RENDERS, BAKE_DIR):
    os.makedirs(d, exist_ok=True)

ATLAS = int(os.environ.get('SUIT_ATLAS', 2048))
SAMPLES = int(os.environ.get('SUIT_BAKE_SAMPLES', 24))

# Joint pivots in body space, matching createTeammate() in dist/teammate.mjs.
PIVOTS = {
    'hips': (0, .918, 0), 'upper': (0, 1.09, 0), 'head': (0, 1.651, -.003),
    'thigh_L': (-.112, .918, 0), 'thigh_R': (.112, .918, 0),
    'shin_L': (-.112, .515, 0), 'shin_R': (.112, .515, 0),
    'boot_L': (-.112, .167, -.03), 'boot_R': (.112, .167, -.03),
    'bicep_L': (0, 0, 0), 'bicep_R': (0, 0, 0),
    'forearm_L': (0, 0, 0), 'forearm_R': (0, 0, 0),
    'glove_L': (0, 0, 0), 'glove_R': (0, 0, 0),
}
# Arm segments are authored at real length and divided by it on export,
# because the game stretches a unit-length segment between joints.
ARM_LENGTH = {'bicep': .26, 'forearm': .25}
BAKE_OFFSETS = {
    'bicep_L': (-1.0, 1.4, 0), 'bicep_R': (-1.4, 1.4, 0),
    'forearm_L': (1.0, 1.4, 0), 'forearm_R': (1.4, 1.4, 0),
    'glove_L': (-1.0, .5, 0), 'glove_R': (1.0, .5, 0),
}
SIDES = (('L', -1), ('R', 1))

# ---------------------------------------------------------------------------
# Shared anatomy (lathe profiles: y, rx, rz, dz).

TORSO = Lathe((0, .005), [(1.03, .165, .12), (1.10, .172, .124), (1.20, .186, .13, -.004), (1.30, .206, .138, -.008),
                          (1.38, .222, .142, -.004), (1.44, .21, .134), (1.49, .15, .108), (1.525, .078, .074),
                          (1.575, .068, .068)])
PELVIS = Lathe((0, .005), [(.80, .12, .095), (.86, .172, .118), (.93, .192, .128), (1.0, .18, .124), (1.07, .166, .12)])


def thigh(s):
    return Lathe((s * .112, 0), [(.50, .062, .066), (.56, .067, .071), (.65, .076, .08), (.75, .087, .089),
                                 (.85, .096, .099), (.95, .1, .104)])


def shin(s):
    return Lathe((s * .112, 0), [(.135, .047, .05), (.18, .045, .048), (.24, .047, .051, .003), (.32, .056, .062, .008),
                                 (.40, .062, .07, .01), (.48, .064, .07, .004), (.56, .066, .07)])


def boot(s):
    return Lathe((s * .112, -.015), [(0.0, .07, .15, -.05), (.035, .073, .156, -.052), (.08, .071, .138, -.042),
                                     (.13, .066, .1, -.02), (.18, .061, .074, -.004), (.235, .058, .066, 0)])


def knee(s):
    return Lathe((s * .112, -.035), [(.42, .035, .025), (.455, .066, .05), (.51, .074, .058), (.565, .064, .048),
                                     (.6, .03, .02)])


def knee_cop(S, part, s, mat, rim=None, thick=.016):
    K_ = knee(s)
    S.plate(part, mat, K_, -1.5, 1.5, .43, .595, .008, thick, .005, bulge=.006, nu=20, nv=10)
    if rim:
        S.plate(part, rim, K_, -1.55, 1.55, .425, .44, .014, .01, .003, nu=20)


BICEP = Lathe((0, 0), [(-.27, .053, .053), (-.235, .057, .056), (-.14, .064, .062), (-.05, .07, .068),
                       (0, .07, .068), (.035, .048, .048)])
FOREARM = Lathe((0, 0), [(-.26, .041, .039), (-.21, .045, .042), (-.12, .055, .052), (-.04, .058, .055),
                         (0, .055, .053), (.025, .04, .04)])


def puff(lathe, k):
    """Inflated copy of a lathe (radii scaled by k), for padded or pressurised fabric."""
    return Lathe((lathe.cx, lathe.cz), [(y, rx * k, rz * k, dz) for y, rx, rz, dz in lathe.prof])


def shoulder(s):
    return Lathe((s * .245, .005), [(1.33, .118, .118), (1.40, .125, .128), (1.46, .108, .118), (1.505, .065, .075),
                                    (1.522, .012, .012)])


def base_body(S, m, under='under', thighs=True):
    """Undersuit volumes shared by all suits."""
    S.body('upper', m[under], TORSO, segs=40)
    S.body('hips', m[under], PELVIS, segs=40)
    for sfx, s in SIDES:
        S.body('thigh_' + sfx, m[under], thigh(s), segs=28)
        S.body('shin_' + sfx, m[under], shin(s), segs=28)
        S.body('bicep_' + sfx, m[under], BICEP, segs=24)
        S.body('forearm_' + sfx, m[under], FOREARM, segs=24)


def glove(S, part, s, m, palm, knuckle=None, cuff=None):
    """Gripping fist centred on the wrist pivot (glove-local frame: -z along the rifle)."""
    S.box(part, m[palm], (0, .004, -.012), (.068, .05, .082), bevel=.018, segs=3)
    S.box(part, m[palm], (0, -.024, -.006), (.06, .03, .07), bevel=.012)
    for i in range(4):
        x = (-.024 + i * .016) * s
        S.tube(part, m[palm], [(x, .01, -.05), (x, -.006, -.066), (x, -.034, -.062), (x, -.05, -.042)], .0085, segs=8)
    S.tube(part, m[palm], [(-s * .03, -.004, -.006), (-s * .042, -.018, -.03), (-s * .03, -.034, -.05)], .0095, segs=8)
    if knuckle:
        S.box(part, m[knuckle], (0, .03, -.04), (.07, .014, .03), bevel=.005)
        S.box(part, m[knuckle], (0, .031, -.005), (.055, .01, .04), bevel=.004)
    S.cyl(part, m[cuff or palm], (0, 0, .032), .042, .045, axis='z', verts=24, bevel=.004)


# ---------------------------------------------------------------------------
# 1. VANGUARD - olive heavy armour, brass helmet, amber visor.

def vanguard():
    S = K.Suit('vanguard', PIVOTS, BAKE_OFFSETS)
    steel_edge = (0x8c8a82, .32, 1.0)
    m = {
        'olive': surface('olive', 0x383a20, .6, edge=steel_edge, edge_amt=1.1, grime=(0x15110a, .95), streaks=.7,
                         camo=(0x23271a, 4.5, .55), scratch=.6, mottling=.85, dust=(0x4e3f2b, .6), bump=.3, panel=7),
        'hazard': surface('hazard', 0x343a22, .55, edge=steel_edge, edge_amt=1.0, grime=(0x17140c, .7), streaks=.4,
                          stripes=(0xb88a1a, 22, .42), scratch=.5, mottling=.4, bump=.25),
        'brass': surface('brass', 0xb48c42, .3, 1.0, var=.25, patina=(0x46492a, .55), grime=(0x1a140a, .55),
                         scratch=.5, bump=.15),
        'under': surface('under', 0x1d1f1d, .82, weave=800, wrinkle=.7, grime=(0x0b0b09, .4), dust=(0x4a3d2a, .4), bump=.35),
        'rubber': surface('rubber', 0x161615, .62, grime=(0x090908, .5), dust=(0x4a3d2a, .3), mottling=.3, bump=.2),
        'leather': surface('leather', 0x4b3220, .58, mottling=.7, scratch=.4, wrinkle=.3, grime=(0x140c06, .6), bump=.3),
        'steel': surface('steel', 0x77756e, .36, 1.0, scratch=.7, grime=(0x15130e, .6), bump=.15),
        'amber': surface('amber', 0x8c4c06, .06, .55, var=.06, grime=(0x281405, .25), bump=.02),
        'glow': glow('glow', 0xfff0c0, 9),
    }
    base_body(S, m)
    T = TORSO
    # Chest: armoured cuirass with a central rig box and brass pressure gauge.
    S.plate('upper', m['olive'], T, -1.25, 1.25, 1.2, 1.47, .016, .02, .006, bulge=.012,
            taper=lambda v: (-1.0 - .3 * v, 1.0 + .3 * v))
    S.plate('upper', m['olive'], T, 2.0, 4.28, 1.16, 1.46, .016, .018, .006, bulge=.008)
    for i, (y0, y1) in enumerate(((1.06, 1.115), (1.12, 1.175))):
        S.plate('upper', m['olive'], T, -1.0 + i * .1, 1.0 - i * .1, y0, y1, .014, .014, .004)
    S.box('upper', m['olive'], (0, 1.31, -.178), (.24, .19, .05), bevel=.012)
    for x in (-.1, .1):
        for y in (1.235, 1.385):
            S.ball('upper', m['steel'], (x, y, -.205), (.007, .007, .004), segs=10, rings=6)
    S.box('upper', m['steel'], (-.055, 1.36, -.205), (.07, .022, .006), bevel=.002)
    S.cyl('upper', m['brass'], (.06, 1.29, -.2), .036, .02, axis='z', verts=32)
    S.cyl('upper', m['amber'], (.06, 1.29, -.211), .027, .004, axis='z', verts=32, bevel=0)
    S.torus('upper', m['brass'], (.06, 1.29, -.212), .03, .004, axis='z', segs=32)
    S.box('upper', m['glow'], (-.06, 1.27, -.205), (.05, .012, .004), bevel=0)
    # Collar ring for the helmet seal.
    S.torus('upper', m['brass'], (0, 1.535, 0), .1, .02, scale=(1.05, 1, 1))
    S.torus('upper', m['steel'], (0, 1.512, 0), .112, .012, scale=(1.05, 1, 1))
    # Corrugated air hoses from the collar to the chest rig.
    for s in (-1, 1):
        S.tube('upper', m['rubber'], [(s * .085, 1.53, -.075), (s * .15, 1.47, -.16), (s * .16, 1.39, -.19),
                                      (s * .115, 1.33, -.205)], .014, ribs=30, segs=12)
        S.cyl('upper', m['brass'], (s * .085, 1.53, -.075), .018, .02, axis='z', verts=16)
    # Massive pauldrons with hazard stripes and rivets.
    for sfx, s in SIDES:
        L = shoulder(s)
        S.plate('upper', m['olive'], L, 0, TAU, 1.355, 1.522, .006, .02, .006, closed=True, nu=32)
        S.plate('upper', m['hazard'], L, s * .7, s * 2.4, 1.38, 1.42, .03, .01, .003)
        S.ring_rivets('upper', m['steel'], L, 1.445, 12, .028, .006)
        S.band('upper', m['leather'], L, 1.35, .028, .012, .008)
    # Reactor backpack with twin air cylinders.
    S.box('upper', m['olive'], (0, 1.3, .2), (.34, .38, .14), bevel=.025)
    S.box('upper', m['steel'], (0, 1.3, .274), (.22, .3, .012), bevel=.004)
    for s in (-1, 1):
        S.cyl('upper', m['steel'], (s * .11, 1.32, .3), .052, .36, verts=32, bevel=.004)
        for y in (1.2, 1.44):
            S.torus('upper', m['olive'], (s * .11, y, .3), .053, .007)
        S.cyl('upper', m['brass'], (s * .11, 1.52, .3), .022, .03, verts=16)
    # Harness straps over the shoulders.
    for s in (-1, 1):
        S.plate('upper', m['leather'], T, s * .42, s * .62, 1.12, 1.47, .02, .008, .002, nu=3)
    # Belt with pouches and a lit buckle.
    S.band('upper', m['leather'], T, 1.05, .05, .018, .012, .003)
    S.box('upper', m['steel'], (0, 1.05, -.142), (.075, .042, .02), bevel=.004)
    S.box('upper', m['glow'], (0, 1.05, -.153), (.04, .02, .004), bevel=0)
    for s in (-1, 1):
        for x in (.09, .15):
            S.box('upper', m['olive'], (s * x, 1.035, -.135 + (x - .09) * .6), (.055, .07, .045),
                  rot=(0, s * -.25 * (x / .09), 0), bevel=.008)
            S.box('upper', m['olive'], (s * x, 1.067, -.138 + (x - .09) * .6), (.058, .022, .05),
                  rot=(0, s * -.25 * (x / .09), 0), bevel=.005)
    # Hips: cod plate and side tassets.
    P = PELVIS
    S.plate('hips', m['olive'], P, -.55, .55, .82, .98, .012, .016, .005, bulge=.01,
            taper=lambda v: (-.35 - .2 * v, .35 + .2 * v))
    for s in (-1, 1):
        S.plate('hips', m['olive'], P, s * 1.05, s * 1.95, .84, 1.0, .016, .016, .005, bulge=.006)
    # Helmet: brass dome, wraparound amber visor, lamp and ear valves.
    H = Lathe((0, .012), [(1.535, .1, .1), (1.56, .142, .142), (1.62, .166, .166), (1.70, .167, .167),
                          (1.77, .143, .143), (1.82, .092, .092), (1.848, .012, .012)])
    S.body('head', m['brass'], H, segs=48)
    S.plate('head', m['amber'], H, -1.2, 1.2, 1.605, 1.735, .004, .006, .002, bulge=.012, nu=32)
    S.plate('head', m['brass'], H, -1.3, 1.3, 1.735, 1.755, .01, .01, .003, nu=32)
    S.plate('head', m['brass'], H, -1.3, 1.3, 1.588, 1.606, .01, .01, .003, nu=32)
    for s in (-1, 1):
        S.plate('head', m['brass'], H, s * 1.2, s * 1.32, 1.6, 1.745, .012, .01, .003, nu=3)
        S.cyl('head', m['steel'], (s * .168, 1.665, .01), .046, .03, axis='x', verts=32)
        S.cyl('head', m['brass'], (s * .186, 1.665, .01), .03, .02, axis='x', verts=24)
        S.ring_rivets('head', m['steel'], H, 1.575, 8, .006, .005, t0=s * 1.4, t1=s * 2.9)
    S.cyl('head', m['steel'], (0, 1.575, -.155), .036, .05, axis='z', verts=32)
    for i in range(4):
        S.torus('head', m['brass'], (0, 1.575, -.17 - i * .007), .035, .003, axis='z', segs=24)
    S.cyl('head', m['steel'], (.105, 1.79, -.07), .024, .07, axis='z', verts=24)
    S.cyl('head', m['glow'], (.105, 1.79, -.107), .019, .004, axis='z', verts=24, bevel=0)
    S.box('head', m['steel'], (.105, 1.77, -.05), (.02, .03, .03), bevel=.004)
    S.plate('head', m['brass'], H, -.12, .12, 1.76, 1.84, .006, .01, .003, nu=4)
    S.body('head', m['under'], Lathe((0, .01), [(1.5, .075, .075), (1.56, .09, .09)]), segs=24)

    for sfx, s in SIDES:
        # Thigh: heavy front plates with hazard strips and leather straps.
        Th = thigh(s)
        tw = lambda v, s=s: (-1.0 + s * .2, 1.0 + s * .2)
        S.plate('thigh_' + sfx, m['olive'], Th, 0, 0, .62, .9, .014, .018, .006, bulge=.012, taper=tw, nu=14)
        S.plate('thigh_' + sfx, m['hazard'], Th, s * .15, s * .85, .66, .70, .034, .006, .002, nu=6)
        S.plate('thigh_' + sfx, m['olive'], Th, s * 1.2, s * 2.1, .64, .88, .014, .016, .005, nu=8)
        for y in (.6, .8):
            S.band('thigh_' + sfx, m['leather'], Th, y, .028, .008, .007, t0=s * 1.0 if s < 0 else -2.3, t1=2.3 if s > 0 else s * -1.0)
        if s < 0:
            S.box('thigh_' + sfx, m['olive'], (s * .2, .7, -.01), (.04, .14, .09), bevel=.01)
        # Knee cup + segmented greave.
        Sh = shin(s)
        knee_cop(S, 'shin_' + sfx, s, m['olive'], rim=m['steel'])
        S.plate('shin_' + sfx, m['olive'], Sh, -1.15, 1.15, .32, .44, .014, .016, .005, bulge=.008)
        S.plate('shin_' + sfx, m['olive'], Sh, -1.05, 1.05, .19, .315, .014, .016, .005, bulge=.006)
        S.plate('shin_' + sfx, m['olive'], Sh, 2.3, 4.0, .22, .42, .012, .014, .004)
        S.band('shin_' + sfx, m['leather'], Sh, .3, .025, .022, .007)
        S.ring_rivets('shin_' + sfx, m['steel'], Sh, .43, 5, .03, .005, t0=-.9, t1=.9)
        # Boots: rubber body, lugged sole, steel toe cap, olive ankle guard.
        B = boot(s)
        S.body('boot_' + sfx, m['rubber'], B, segs=36)
        S.box('boot_' + sfx, m['rubber'], (s * .112, .014, -.065), (.142, .028, .31), bevel=.012)
        for i in range(6):
            S.box('boot_' + sfx, m['rubber'], (s * .112, .002, -.19 + i * .05), (.138, .008, .022), bevel=.003)
        S.plate('boot_' + sfx, m['olive'], B, -1.0, 1.0, .02, .075, .006, .012, .004, bulge=.006)
        S.plate('boot_' + sfx, m['olive'], B, -1.6, 1.6, .1, .175, .01, .014, .004, bulge=.004)
        S.band('boot_' + sfx, m['leather'], B, .085, .02, .016, .006)
        # Arms: plated bicep, elbow cop, bracer with hazard stripe.
        bp, fp, gp = 'bicep_' + sfx, 'forearm_' + sfx, 'glove_' + sfx
        S.plate(bp, m['olive'], BICEP, s * .2, s * 2.6, -.2, -.03, .012, .014, .005, bulge=.006)
        S.band(bp, m['leather'], BICEP, -.215, .022, .008, .006)
        S.ball(fp, m['olive'], (s * .012, -.005, .03), (.05, .05, .045), segs=24, rings=14)
        S.plate(fp, m['olive'], FOREARM, -2.5, 2.5, -.2, -.03, .012, .016, .005, bulge=.006, nu=24)
        S.plate(fp, m['hazard'], FOREARM, s * .4, s * 1.8, -.13, -.09, .03, .005, .002, nu=6)
        S.band(fp, m['leather'], FOREARM, -.225, .025, .008, .008)
        glove(S, gp, s, m, 'rubber', knuckle='olive', cuff='leather')
    return S


# ---------------------------------------------------------------------------
# 2. WRAITH - matte black stealth suit with violet light strips.

def wraith():
    S = K.Suit('wraith', PIVOTS, BAKE_OFFSETS)
    m = {
        'carbon': surface('carbon', 0x101114, .4, .3, edge=(0x5a5a62, .3, 1.0), edge_amt=.35, grime=(0x08080a, .6),
                          scratch=.35, var=.08, panel=9, bump=.2),
        'under': surface('under', 0x0c0c0f, .8, weave=1100, wrinkle=.8, grime=(0x060607, .4), dust=(0x2c2a28, .25), bump=.4),
        'pad': surface('pad', 0x151518, .72, weave=500, wrinkle=.3, grime=(0x060607, .5), bump=.3),
        'rubber': surface('rubber', 0x0c0c0d, .6, grime=(0x050506, .5), dust=(0x2c2a28, .3), bump=.2),
        'metal': surface('metal', 0x3a3a40, .32, 1.0, scratch=.6, grime=(0x08080a, .5)),
        'visor': surface('visor', 0x0a060f, .05, .4, var=.03, grime=(0x050308, .1), bump=.01),
        'glow': glow('glow', 0xc77dff, 10, base=0x8a40d0),
    }
    base_body(S, m)
    T = TORSO
    # Chest rig: angular carbon plates, X light strips, magazine pouches.
    for s in (-1, 1):
        S.plate('upper', m['carbon'], T, s * .08, s * 1.15, 1.2, 1.46, .02, .016, .005, bulge=.01, nu=10)
        S.plate('upper', m['glow'], T, s * .55, s * .62, 1.28, 1.42, .038, .004, .0, nu=2)
    S.plate('upper', m['carbon'], T, -.85, .85, 1.1, 1.19, .018, .014, .004)
    S.plate('upper', m['glow'], T, -.25, .25, 1.13, 1.145, .034, .004, 0, nu=4)
    S.plate('upper', m['carbon'], T, 2.1, 4.18, 1.15, 1.46, .016, .016, .005)
    for s in (-1, 1):
        for i in range(2):
            S.box('upper', m['pad'], (s * (.075 + i * .065), 1.21, -.17), (.055, .085, .04), bevel=.008)
            S.box('upper', m['pad'], (s * (.075 + i * .065), 1.25, -.175), (.058, .02, .045), bevel=.005)
        # Harness straps and buckles.
        S.plate('upper', m['rubber'], T, s * .35, s * .5, 1.04, 1.47, .022, .006, .002, nu=3)
        S.box('upper', m['metal'], (s * .08, 1.06, -.15), (.03, .03, .012), bevel=.003)
        # Slim shoulder armour.
        L = shoulder(s)
        S.plate('upper', m['carbon'], L, s * .5, s * 2.6, 1.43, 1.515, -.012, .012, .004, nu=20)
        S.plate('upper', m['carbon'], L, s * .8, s * 2.3, 1.39, 1.425, -.006, .01, .003, nu=16)
    # Respirator hoses curving from the mask to the back unit.
    for s in (-1, 1):
        S.tube('upper', m['rubber'], [(s * .06, 1.56, -.11), (s * .14, 1.52, -.09), (s * .17, 1.47, .02),
                                      (s * .1, 1.42, .18)], .013, ribs=32, segs=12)
    S.box('upper', m['carbon'], (0, 1.32, .175), (.24, .3, .07), bevel=.015)
    S.box('upper', m['glow'], (0, 1.38, .212), (.1, .008, .004), bevel=0)
    S.torus('upper', m['carbon'], (0, 1.535, 0), .085, .016)
    # Utility belt.
    S.band('upper', m['rubber'], T, 1.04, .04, .016, .01)
    S.box('upper', m['metal'], (0, 1.04, -.14), (.06, .035, .015), bevel=.004)
    P = PELVIS
    S.plate('hips', m['pad'], P, -.5, .5, .83, .97, .01, .012, .004, bulge=.006)
    # Helmet: rounded shell, violet visor band, respirator snout.
    H = Lathe((0, .015), [(1.54, .095, .1), (1.57, .13, .14), (1.63, .152, .16), (1.70, .155, .162),
                          (1.77, .134, .14), (1.815, .085, .09), (1.838, .012, .012)])
    S.body('head', m['carbon'], H, segs=48)
    S.plate('head', m['visor'], H, -1.25, 1.25, 1.655, 1.715, .004, .006, .002, nu=32)
    S.plate('head', m['glow'], H, -1.0, 1.0, 1.675, 1.695, .011, .002, 0, nu=30)
    S.plate('head', m['carbon'], H, -1.4, 1.4, 1.715, 1.74, .01, .012, .004, nu=32)
    S.plate('head', m['carbon'], H, -.15, .15, 1.74, 1.83, .006, .012, .004, nu=4)
    S.box('head', m['carbon'], (0, 1.59, -.14), (.1, .08, .07), rot=(.25, 0, 0), bevel=.02)
    S.cyl('head', m['metal'], (0, 1.575, -.18), .028, .02, axis='z', verts=32)
    for s in (-1, 1):
        S.cyl('head', m['metal'], (s * .055, 1.565, -.12), .02, .03, axis='x', verts=16)
        S.cyl('head', m['carbon'], (s * .155, 1.68, .01), .04, .03, axis='x', verts=32)
        S.box('head', m['metal'], (s * .17, 1.72, .02), (.01, .05, .012), bevel=.002)
    S.body('head', m['under'], Lathe((0, .01), [(1.5, .07, .07), (1.56, .085, .085)]), segs=24)

    for sfx, s in SIDES:
        Th = thigh(s)
        S.plate('thigh_' + sfx, m['pad'], Th, -.9, .9, .6, .86, .008, .01, .004, bulge=.006)
        S.plate('thigh_' + sfx, m['glow'], Th, s * 1.5, s * 1.56, .58, .82, .004, .003, 0, nu=2)
        S.box('thigh_' + sfx, m['pad'], (s * .2, .72, -.005), (.035, .11, .07), bevel=.01)
        S.box('thigh_' + sfx, m['metal'], (s * .218, .76, -.005), (.006, .02, .03), bevel=.002)
        for y in (.66, .78):
            S.band('thigh_' + sfx, m['rubber'], Th, y, .02, .006, .005)
        Sh = shin(s)
        knee_cop(S, 'shin_' + sfx, s, m['carbon'])
        S.plate('shin_' + sfx, m['carbon'], Sh, -1.0, 1.0, .2, .43, .01, .012, .004, bulge=.006)
        S.plate('shin_' + sfx, m['glow'], Sh, s * .7, s * .76, .2, .4, .022, .003, 0, nu=2)
        B = boot(s)
        S.body('boot_' + sfx, m['rubber'], B, segs=36)
        S.box('boot_' + sfx, m['rubber'], (s * .112, .014, -.065), (.14, .028, .305), bevel=.01)
        S.plate('boot_' + sfx, m['carbon'], B, -.9, .9, .02, .07, .006, .008, .003, bulge=.004)
        for y in (.09, .13):
            S.band('boot_' + sfx, m['pad'], B, y, .018, .006, .006)
            S.box('boot_' + sfx, m['metal'], (s * .17, y, -.04), (.008, .016, .02), bevel=.002)
        bp, fp, gp = 'bicep_' + sfx, 'forearm_' + sfx, 'glove_' + sfx
        S.band(bp, m['rubber'], BICEP, -.18, .02, .006, .005)
        S.plate(bp, m['pad'], BICEP, s * .6, s * 2.2, -.16, -.06, .006, .008, .003)
        S.plate(fp, m['carbon'], FOREARM, -2.2, 2.2, -.19, -.04, .008, .012, .004, bulge=.004, nu=22)
        S.plate(fp, m['glow'], FOREARM, s * .9, s * 1.0, -.18, -.06, .021, .003, 0, nu=2)
        S.ball(fp, m['pad'], (s * .01, -.005, .03), (.048, .048, .042), segs=24, rings=14)
        glove(S, gp, s, m, 'rubber', knuckle='carbon', cuff='pad')
    return S


# ---------------------------------------------------------------------------
# 3. LIFELINE - white-and-red field medic with a black visor helmet.

def lifeline():
    S = K.Suit('lifeline', PIVOTS, BAKE_OFFSETS)
    m = {
        'shell': surface('shell', 0xcfcbc2, .45, edge=(0x6c6a66, .4, .8), edge_amt=.3, grime=(0x4a4034, .8), streaks=.35,
                         scratch=.4, mottling=.35, dust=(0x7a6a55, .55), bump=.25, panel=8),
        'under': surface('under', 0xc9c6bd, .78, weave=700, wrinkle=.9, grime=(0x4d4235, .7),
                         dust=(0x7a6a55, .6), bump=.45, mottling=.3),
        'red': surface('red', 0xb01d22, .45, edge=(0x6c6a66, .4, .8), edge_amt=.3, grime=(0x2b1010, .6),
                       scratch=.4, dust=(0x6a5a45, .4), bump=.2),
        'strap': surface('strap', 0xa3191d, .7, weave=900, grime=(0x2b1010, .5), bump=.25),
        'black': surface('black', 0x18191b, .55, grime=(0x08080a, .4), dust=(0x4a3d2e, .3), bump=.2),
        'metal': surface('metal', 0x8c8f92, .34, 1.0, scratch=.5, grime=(0x221e18, .5)),
        'visor': surface('visor', 0x050607, .04, .3, var=.03, grime=(0x020203, .1), bump=.01),
        'glow': glow('glow', 0x6ff3ff, 9, base=0x50d8f0),
        'beacon': glow('beacon', 0xff3030, 6, base=0xd02020),
    }
    base_body(S, m)
    T = TORSO
    # Chest plate with red cross, cyan status lights.
    S.plate('upper', m['shell'], T, -1.2, 1.2, 1.22, 1.47, .02, .018, .006, bulge=.012,
            taper=lambda v: (-.95 - .25 * v, .95 + .25 * v))
    S.box('upper', m['red'], (0, 1.37, -.184), (.075, .022, .01), bevel=.003)
    S.box('upper', m['red'], (0, 1.37, -.184), (.022, .075, .01), bevel=.003)
    for s in (-1, 1):
        S.plate('upper', m['glow'], T, s * .78, s * .84, 1.3, 1.4, .042, .004, 0, nu=2)
    S.plate('upper', m['glow'], T, -.2, .2, 1.235, 1.245, .042, .004, 0, nu=4)
    S.plate('upper', m['shell'], T, 2.1, 4.18, 1.16, 1.46, .016, .016, .005, bulge=.006)
    S.box('upper', m['shell'], (0, 1.3, .19), (.26, .3, .1), bevel=.02)
    S.box('upper', m['red'], (0, 1.34, .242), (.05, .016, .006), bevel=.002)
    S.box('upper', m['red'], (0, 1.34, .242), (.016, .05, .006), bevel=.002)
    # Quilted abdomen ribs.
    for i in range(3):
        S.band('upper', m['under'], T, 1.09 + i * .045, .022, .006, .008, .004)
    # Shoulder caps with red trim; harness straps.
    for sfx, s in SIDES:
        L = shoulder(s)
        S.plate('upper', m['shell'], L, s * .1, s * 3.0, 1.38, 1.518, .006, .016, .005, nu=24)
        S.band('upper', m['red'], L, 1.375, .02, .02, .008, t0=s * .2 if s > 0 else -2.9, t1=2.9 if s > 0 else s * .2)
        S.plate('upper', m['strap'], T, s * .32, s * .48, 1.04, 1.47, .028, .006, .002, nu=3)
        S.plate('upper', m['strap'], T, s * 2.6, s * 2.8, 1.04, 1.47, .028, .006, .002, nu=3)
    S.torus('upper', m['metal'], (0, 1.535, 0), .092, .016)
    # Belt with medical pouches.
    S.band('upper', m['black'], T, 1.04, .04, .016, .01)
    S.box('upper', m['red'], (0, 1.04, -.142), (.07, .035, .014), bevel=.004)
    for s in (-1, 1):
        S.box('upper', m['shell'], (s * .14, 1.02, -.125), (.07, .085, .05), rot=(0, s * -.5, 0), bevel=.01)
        S.box('upper', m['red'], (s * .14, 1.06, -.13), (.072, .02, .054), rot=(0, s * -.5, 0), bevel=.005)
    S.box('upper', m['red'], (-.14 + .0, 1.02, -.157), (.028, .008, .004), rot=(0, .5, 0), bevel=0)
    S.box('upper', m['red'], (-.14, 1.02, -.157), (.008, .028, .004), rot=(0, .5, 0), bevel=0)
    P = PELVIS
    S.plate('hips', m['shell'], P, -.5, .5, .84, .97, .01, .012, .004, bulge=.006)
    for s in (-1, 1):
        S.box('hips', m['red'], (s * .2, .87, -.01), (.04, .1, .07), bevel=.01)
        S.box('hips', m['shell'], (s * .205, .9, -.012), (.045, .03, .075), bevel=.006)
    # Helmet: white shell, glossy black visor, cyan eye strips, red beacon.
    H = Lathe((0, .012), [(1.54, .1, .105), (1.57, .138, .145), (1.63, .16, .165), (1.70, .162, .167),
                          (1.77, .14, .145), (1.82, .088, .092), (1.845, .012, .012)])
    S.body('head', m['shell'], H, segs=48)
    S.plate('head', m['visor'], H, -1.15, 1.15, 1.6, 1.76, .003, .008, .003, bulge=.012, nu=32)
    for s in (-1, 1):
        S.plate('head', m['glow'], H, s * .12, s * .52, 1.665, 1.685, .022, .003, 0, nu=6)
        S.cyl('head', m['shell'], (s * .165, 1.67, .01), .045, .035, axis='x', verts=32)
        S.cyl('head', m['red'], (s * .185, 1.67, .01), .028, .012, axis='x', verts=24)
    S.plate('head', m['shell'], H, -1.25, 1.25, 1.575, 1.6, .008, .012, .004, nu=32)
    S.box('head', m['shell'], (0, 1.58, -.15), (.085, .06, .05), bevel=.015)
    for i in range(3):
        S.box('head', m['black'], (0, 1.565 + i * .014, -.176), (.06, .006, .004), bevel=.001)
    for s in (-1, 1):
        S.cyl('head', m['red'], (s * .05, 1.57, -.14), .016, .022, axis='x', verts=16)
    S.cyl('head', m['metal'], (0, 1.845, .012), .02, .016, verts=24)
    S.ball('head', m['beacon'], (0, 1.86, .012), (.016, .012, .016), segs=16, rings=10)
    S.body('head', m['under'], Lathe((0, .01), [(1.5, .074, .074), (1.56, .09, .09)]), segs=24)

    for sfx, s in SIDES:
        Th = thigh(s)
        # Red piping down the outer leg, side pouch.
        S.plate('thigh_' + sfx, m['red'], Th, s * 1.35, s * 1.55, .55, .93, .004, .006, .002, nu=3)
        S.plate('thigh_' + sfx, m['shell'], Th, -.8, .8, .66, .86, .008, .01, .004, bulge=.005)
        S.box('thigh_' + sfx, m['red'], (s * .2, .7, -.005), (.04, .12, .08), bevel=.012)
        S.box('thigh_' + sfx, m['shell'], (s * .205, .745, -.006), (.045, .03, .085), bevel=.006)
        S.band('thigh_' + sfx, m['strap'], Th, .78, .024, .008, .006)
        S.band('thigh_' + sfx, m['black'], Th, .6, .03, .008, .006)
        Sh = shin(s)
        knee_cop(S, 'shin_' + sfx, s, m['shell'], rim=m['red'])
        S.band('shin_' + sfx, m['red'], Sh, .445, .025, .01, .006)
        S.plate('shin_' + sfx, m['shell'], Sh, -1.0, 1.0, .22, .42, .01, .014, .005, bulge=.006)
        for x in (-.018, .018):
            S.box('shin_' + sfx, m['red'], (s * .112 + x, .27, -.083), (.012, .05, .006), bevel=.002)
        S.plate('shin_' + sfx, m['red'], Sh, s * 1.35, s * 1.55, .2, .5, .004, .006, .002, nu=3)
        B = boot(s)
        S.body('boot_' + sfx, m['red'], B, segs=36)
        S.box('boot_' + sfx, m['black'], (s * .112, .014, -.065), (.142, .028, .31), bevel=.012)
        S.plate('boot_' + sfx, m['shell'], B, -.9, .9, .035, .09, .006, .01, .004, bulge=.005)
        S.band('boot_' + sfx, m['shell'], B, .15, .04, .01, .008)
        S.plate('boot_' + sfx, m['metal'], B, 2.6, 3.7, .02, .08, .006, .01, .003)
        bp, fp, gp = 'bicep_' + sfx, 'forearm_' + sfx, 'glove_' + sfx
        S.band(bp, m['red'], BICEP, -.2, .03, .01, .008)
        S.band(bp, m['black'], BICEP, -.12, .03, .006, .006)
        S.plate(fp, m['shell'], FOREARM, -2.0, 2.0, -.19, -.05, .008, .012, .004, bulge=.004, nu=20)
        S.band(fp, m['red'], FOREARM, -.215, .028, .01, .008)
        S.ball(fp, m['shell'], (s * .01, -.005, .03), (.048, .048, .042), segs=24, rings=14)
        glove(S, gp, s, m, 'black', knuckle='black', cuff='red')
    return S


# ---------------------------------------------------------------------------
# 4. BATHYSPHERE - copper deep-dive suit, rubberised canvas, orange bands.

def bathysphere():
    S = K.Suit('bathysphere', PIVOTS, BAKE_OFFSETS)
    m = {
        'copper': surface('copper', 0x9a5530, .36, 1.0, var=.4, patina=(0x2f4a3c, .5), grime=(0x170d06, .85), streaks=.6,
                          scratch=.5, mottling=.85, bump=.2),
        'orange': surface('orange', 0xb44a18, .52, edge=(0x6a3a20, .4, 1.0), edge_amt=1.0, grime=(0x24120a, .75), streaks=.4,
                          scratch=.5, mottling=.4, dust=(0x3a2a1e, .4), bump=.25),
        'canvas': surface('canvas', 0x1c241d, .8, var=.25, weave=600, wrinkle=1.0, grime=(0x0a0c0a, .6),
                          mottling=.6, dust=(0x3a2e22, .5), bump=.5),
        'rubber': surface('rubber', 0x1a1a1a, .6, grime=(0x080808, .5), dust=(0x3a2e22, .4), bump=.2),
        'iron': surface('iron', 0x4a4440, .5, 1.0, scratch=.5, mottling=.7, grime=(0x1a0d06, .7), bump=.3),
        'glass': surface('glass', 0x0c2a2c, .05, .2, var=.05, grime=(0x061010, .15), bump=.01),
        'glow': glow('glow', 0x8ff8ff, 9, base=0x60e0f0),
        'lamp': glow('lamp', 0xffa040, 8, base=0xff8a1f),
    }
    base_body(S, m, under='canvas')
    # Pressurised canvas: puffier limb volumes over the base anatomy.
    for sfx, s in SIDES:
        S.body('thigh_' + sfx, m['canvas'], puff(thigh(s), 1.16), segs=28)
        S.body('shin_' + sfx, m['canvas'], puff(shin(s), 1.14), segs=28)
        S.body('bicep_' + sfx, m['canvas'], puff(BICEP, 1.15), segs=24)
        S.body('forearm_' + sfx, m['canvas'], puff(FOREARM, 1.12), segs=24)
    T = TORSO
    # Chest: orange harness frame, valve box, looping hose, copper breastplate.
    S.plate('upper', m['copper'], T, -1.1, 1.1, 1.36, 1.5, .02, .016, .005, bulge=.006)
    S.plate('upper', m['orange'], T, -1.25, 1.25, 1.33, 1.36, .036, .014, .004)
    S.plate('upper', m['orange'], T, -1.25, 1.25, 1.18, 1.21, .03, .014, .004)
    for s in (-1, 1):
        S.plate('upper', m['orange'], T, s * .95, s * 1.12, 1.18, 1.5, .035, .014, .004, nu=3)
    S.box('upper', m['iron'], (0, 1.38, -.19), (.13, .07, .05), bevel=.008)
    S.box('upper', m['copper'], (0, 1.39, -.217), (.09, .03, .008), bevel=.003)
    S.cyl('upper', m['iron'], (0, 1.3, -.185), .03, .05, axis='z', verts=24)
    S.cyl('upper', m['copper'], (0, 1.3, -.21), .016, .02, axis='z', verts=16)
    S.tube('upper', m['orange'], [(.02, 1.3, -.21), (.09, 1.26, -.215), (.15, 1.24, -.19), (.17, 1.3, -.17),
                                  (.14, 1.36, -.19)], .014, segs=14)
    S.ring_rivets('upper', m['iron'], T, 1.345, 14, .052, .005, t0=-1.2, t1=1.2)
    S.ring_rivets('upper', m['iron'], T, 1.195, 14, .046, .005, t0=-1.2, t1=1.2)
    # Breastplate collar with bolt ring, copper shoulder domes.
    S.cyl('upper', m['copper'], (0, 1.52, 0), .2, .05, verts=48, r2=.16)
    S.ring_rivets('upper', m['iron'], Lathe((0, 0), [(1.5, .19, .19), (1.55, .19, .19)]), 1.535, 16, .0, .007)
    for sfx, s in SIDES:
        L = shoulder(s)
        S.plate('upper', m['copper'], L, 0, TAU, 1.33, 1.522, .01, .018, .006, closed=True, nu=32)
        S.ring_rivets('upper', m['iron'], L, 1.36, 10, .03, .006)
    # Back air tank with orange bands.
    S.cyl('upper', m['copper'], (0, 1.3, .21), .085, .34, verts=36)
    S.ball('upper', m['copper'], (0, 1.47, .21), (.085, .04, .085), segs=36, rings=12)
    for y in (1.2, 1.36):
        S.torus('upper', m['orange'], (0, y, .21), .087, .01)
    # Weight belt.
    S.band('upper', m['rubber'], T, 1.04, .055, .016, .012)
    S.box('upper', m['orange'], (0, 1.04, -.145), (.06, .045, .018), bevel=.005)
    for s in (-1, 1):
        for i in range(2):
            S.box('upper', m['iron'], (s * (.08 + i * .07), 1.04, -.14 + i * .035), (.05, .05, .028),
                  rot=(0, s * -.35 * (i + 1), 0), bevel=.006)
    P = PELVIS
    S.band('hips', m['orange'], P, .97, .02, .012, .006)
    # Diving helmet: copper dome, cross-barred front porthole, side ports, top valve.
    H = Lathe((0, .01), [(1.52, .14, .14), (1.55, .16, .16), (1.62, .185, .185), (1.70, .188, .188),
                         (1.78, .165, .165), (1.84, .11, .11), (1.87, .03, .03)])
    S.body('head', m['copper'], H, segs=48)
    S.cyl('head', m['glow'], (0, 1.68, -.172), .08, .02, axis='z', verts=40, bevel=0)
    S.cyl('head', m['glass'], (0, 1.68, -.178), .082, .006, axis='z', verts=40, bevel=.001)
    S.torus('head', m['copper'], (0, 1.68, -.182), .09, .016, axis='z', segs=48)
    S.box('head', m['copper'], (0, 1.68, -.19), (.17, .014, .012), bevel=.003)
    S.box('head', m['copper'], (0, 1.68, -.19), (.014, .17, .012), bevel=.003)
    for i in range(8):
        a = i / 8 * TAU
        S.ball('head', m['iron'], (math.sin(a) * .09, 1.68 + math.cos(a) * .09, -.198), (.006, .006, .004), segs=8, rings=5)
    for s in (-1, 1):
        S.cyl('head', m['glow'], (s * .175, 1.68, 0), .045, .02, axis='x', verts=32, bevel=0)
        S.torus('head', m['copper'], (s * .182, 1.68, 0), .05, .012, axis='x', segs=36)
    S.cyl('head', m['copper'], (0, 1.875, .01), .03, .04, verts=24)
    S.ball('head', m['copper'], (0, 1.9, .01), (.025, .02, .025), segs=16, rings=10)
    S.torus('head', m['iron'], (0, 1.53, .01), .155, .016, segs=48)

    for sfx, s in SIDES:
        Th = puff(thigh(s), 1.16)
        for y in (.62, .86):
            S.band('thigh_' + sfx, m['orange'], Th, y, .045, .006, .012)
        S.ring_rivets('thigh_' + sfx, m['iron'], Th, .86, 10, .02, .005)
        Sh = puff(shin(s), 1.14)
        # Copper knee dome with an amber lamp.
        knee_cop(S, 'shin_' + sfx, s, m['copper'], rim=m['orange'], thick=.02)
        S.cyl('shin_' + sfx, m['lamp'], (s * .112, .51, -.122), .018, .01, axis='z', verts=24, bevel=0)
        S.torus('shin_' + sfx, m['copper'], (s * .112, .51, -.124), .022, .005, axis='z', segs=24)
        S.band('shin_' + sfx, m['orange'], Sh, .42, .045, .006, .012)
        S.band('shin_' + sfx, m['orange'], Sh, .22, .045, .006, .012)
        # Weighted diving boots.
        B = boot(s)
        S.body('boot_' + sfx, m['iron'], B, segs=36)
        S.box('boot_' + sfx, m['copper'], (s * .112, .018, -.065), (.152, .036, .315), bevel=.012)
        S.plate('boot_' + sfx, m['orange'], B, -1.1, 1.1, .05, .11, .008, .014, .004, bulge=.006)
        S.cyl('boot_' + sfx, m['lamp'], (s * .112, .08, -.2), .016, .01, axis='z', verts=24, bevel=0)
        S.torus('boot_' + sfx, m['copper'], (s * .112, .08, -.203), .02, .005, axis='z', segs=24)
        S.band('boot_' + sfx, m['orange'], B, .155, .03, .012, .01)
        bp, fp, gp = 'bicep_' + sfx, 'forearm_' + sfx, 'glove_' + sfx
        S.band(bp, m['orange'], puff(BICEP, 1.15), -.2, .04, .006, .01)
        S.band(fp, m['orange'], puff(FOREARM, 1.12), -.19, .055, .006, .012)
        S.band(fp, m['copper'], puff(FOREARM, 1.12), -.232, .022, .008, .01)
        S.ring_rivets(fp, m['iron'], puff(FOREARM, 1.12), -.19, 8, .02, .005)
        glove(S, gp, s, m, 'rubber', cuff='copper')
    return S


SUITS = {'vanguard': vanguard, 'wraith': wraith, 'lifeline': lifeline, 'bathysphere': bathysphere}


# ---------------------------------------------------------------------------
# Baking.

def uv_unwrap(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.002, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION', margin=.003,
                            shape_method='CONCAVE', scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(objects, ident):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.render.bake.margin = 12
    scene.render.bake.use_clear = True
    images = {}
    for key, colorspace in (('albedo', 'sRGB'), ('orm', 'Non-Color'), ('normal', 'Non-Color')):
        img = bpy.data.images.new(ident + '_' + key, ATLAS, ATLAS, alpha=False, float_buffer=False)
        img.colorspace_settings.name = colorspace
        images[key] = img

    baked = {mat for mat, *_ in K.BAKED}
    used = {slot.material for obj in objects for slot in obj.material_slots}
    entries = [entry for entry in K.BAKED if entry[0] in used]

    def target(img):
        for mat, *_ in entries:
            nodes = mat.node_tree.nodes
            node = nodes.get('bake_target') or nodes.new('ShaderNodeTexImage')
            node.name = 'bake_target'
            node.image = img
            nodes.active = node
        # Non-baked (glow) materials need an inert image target too.
        for mat in used - baked:
            nodes = mat.node_tree.nodes
            node = nodes.get('bake_target') or nodes.new('ShaderNodeTexImage')
            node.name = 'bake_target'
            node.image = img
            nodes.active = node

    def emit_pass(builder):
        temp = []
        for mat, albedo, rough, metal, bsdf, out in entries:
            N = K.Nodes(mat)
            em = N.add('ShaderNodeEmission', Strength=1.0)
            N.l.new(builder(N, albedo, rough, metal), em.inputs['Color'])
            N.l.new(em.outputs[0], out.inputs['Surface'])
            temp.append(em)
        for mat in used - baked:
            N = K.Nodes(mat)
            out = next(n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
            bsdf = mat.node_tree.nodes['Principled BSDF']
            em = N.add('ShaderNodeEmission', Strength=1.0)
            em.inputs['Color'].default_value = builder(None, None, None, None, glow_mat=bsdf)
            N.l.new(em.outputs[0], out.inputs['Surface'])
            temp.append(em)
        return temp

    def restore():
        for mat, albedo, rough, metal, bsdf, out in entries:
            mat.node_tree.links.new(bsdf.outputs[0], out.inputs['Surface'])
        for mat in used - baked:
            out = next(n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
            mat.node_tree.links.new(mat.node_tree.nodes['Principled BSDF'].outputs[0], out.inputs['Surface'])

    def as_socket(N, v):
        if isinstance(v, bpy.types.NodeSocket):
            return v
        node = N.add('ShaderNodeValue')
        node.outputs[0].default_value = v
        return node.outputs[0]

    def albedo_builder(N, albedo, rough, metal, glow_mat=None):
        if glow_mat:
            return tuple(glow_mat.inputs['Base Color'].default_value)
        return albedo

    def orm_builder(N, albedo, rough, metal, glow_mat=None):
        if glow_mat:
            return (1.0, .3, 0.0, 1.0)
        comb = N.add('ShaderNodeCombineColor')
        comb.inputs[0].default_value = 1.0
        N.l.new(as_socket(N, rough), comb.inputs[1])
        N.l.new(as_socket(N, metal), comb.inputs[2])
        return comb.outputs[0]

    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

    for key, builder, samples in (('albedo', albedo_builder, SAMPLES), ('orm', orm_builder, SAMPLES)):
        temp = emit_pass(builder)
        target(images[key])  # after emit_pass: adding nodes can steal the active node
        scene.cycles.samples = samples
        bpy.ops.object.bake(type='EMIT')
        for node in temp:
            node.id_data.nodes.remove(node)
        restore()
    target(images['normal'])
    scene.cycles.samples = 4
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')

    paths = {}
    for key, img in images.items():
        path = os.path.join(BAKE_DIR, '%s_%s.png' % (ident, key))
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
        paths[key] = path
    return images


def join_proxy(objects):
    """Join every joint into one mesh, tagging vertices with their joint name.

    Unwrapping and baking a single object keeps UV islands from different
    joints from overlapping and keeps bake margins from bleeding across joints.
    """
    for obj in objects:
        group = obj.vertex_groups.new(name=obj.name)
        group.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    proxy = bpy.context.object
    proxy.name = 'proxy'
    return proxy


def split_proxy(proxy, suit):
    import bmesh
    parts = []
    for name in suit.pivots:
        if proxy.vertex_groups.get(name) is None:
            continue
        index = proxy.vertex_groups[name].index
        obj = proxy.copy()
        obj.data = proxy.data.copy()
        bpy.context.scene.collection.objects.link(obj)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        deform = bm.verts.layers.deform.active
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if index not in v[deform]], context='VERTS')
        bm.to_mesh(obj.data)
        bm.free()
        obj.vertex_groups.clear()
        obj.name = obj.data.name = name
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.context.scene.cursor.location = suit.to_space(name, suit.pivots[name])
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        parts.append(obj)
    bpy.data.objects.remove(proxy, do_unlink=True)
    return parts


def final_material(ident, images):
    """One textured glTF-friendly material that replaces all baked networks."""
    mat = bpy.data.materials.new(ident + '_suit')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    alb = nodes.new('ShaderNodeTexImage')
    alb.image = images['albedo']
    orm = nodes.new('ShaderNodeTexImage')
    orm.image = images['orm']
    nrm = nodes.new('ShaderNodeTexImage')
    nrm.image = images['normal']
    sep = nodes.new('ShaderNodeSeparateColor')
    nmap = nodes.new('ShaderNodeNormalMap')
    links.new(alb.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(orm.outputs['Color'], sep.inputs[0])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    links.new(nrm.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def swap_materials(objects, suit_mat):
    baked = {mat for mat, *_ in K.BAKED}
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material in baked:
                slot.material = suit_mat
        # Merge duplicate slots so each joint draws with as few materials as possible.
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.ops.object.material_slot_remove_unused()


def normalise_arms(objects):
    for obj in objects:
        kind = obj.name.split('_')[0]
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if kind in ARM_LENGTH:
            obj.scale = (1, 1, 1 / ARM_LENGTH[kind])
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        # Geometry is already relative to the joint pivot; a zero node transform
        # leaves room for gltfpack's dequantisation transform.
        obj.location = (0, 0, 0)


def export(objects, ident):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    raw = os.path.join(BAKE_DIR, ident + '_raw.glb')
    bpy.ops.export_scene.gltf(
        filepath=raw, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials='EXPORT', export_image_format='WEBP',
        export_cameras=False, export_lights=False,
    )
    # Meshopt compression + quantisation (npm i -g gltfpack). Keeps joint node
    # names (-kn) and materials (-km); textures pass through as WebP.
    final = os.path.join(OUT, ident + '.glb')
    import shutil
    import subprocess
    if shutil.which('gltfpack'):
        subprocess.run(['gltfpack', '-i', raw, '-o', final, '-cc', '-kn', '-km', '-vt', '14'], check=True)
    else:
        print('gltfpack not found; writing an uncompressed GLB')
        shutil.copy(raw, final)


# ---------------------------------------------------------------------------
# Beauty render for review (Cycles, studio HDRI).

def studio_world():
    scene = bpy.context.scene
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    hdri = None
    root = os.path.dirname(bpy.app.binary_path)
    for dirpath, _, files in os.walk(os.path.join(root)):
        if 'studiolights' in dirpath and 'world' in dirpath:
            for name in ('interior.exr', 'studio.exr', 'city.exr', 'forest.exr'):
                if name in files:
                    hdri = os.path.join(dirpath, name)
                    break
        if hdri:
            break
    if not hdri:
        for base in ('/usr/share/blender', '/usr/lib/blender'):
            for dirpath, _, files in os.walk(base):
                if 'studiolights' in dirpath and 'world' in dirpath and files:
                    hdri = os.path.join(dirpath, sorted(f for f in files if f.endswith('.exr'))[0])
                    break
            if hdri:
                break
    bg = nodes['Background']
    out = nodes['World Output']
    path = nodes.new('ShaderNodeLightPath')
    backdrop = nodes.new('ShaderNodeBackground')
    backdrop.inputs['Color'].default_value = (.45, .45, .46, 1)
    mixw = nodes.new('ShaderNodeMixShader')
    links.new(path.outputs['Is Camera Ray'], mixw.inputs[0])
    links.new(bg.outputs[0], mixw.inputs[1])
    links.new(backdrop.outputs[0], mixw.inputs[2])
    links.new(mixw.outputs[0], out.inputs['Surface'])
    if hdri:
        env = nodes.new('ShaderNodeTexEnvironment')
        env.image = bpy.data.images.load(hdri)
        links.new(env.outputs['Color'], bg.inputs['Color'])
        bg.inputs['Strength'].default_value = .35
    else:
        bg.inputs['Color'].default_value = (.4, .4, .42, 1)
    scene.world = world
    return hdri


def beauty(objects, ident, suffix='_hq', pose=True, samples=96):
    by = {obj.name: obj for obj in objects}
    for name, obj in by.items():
        if name in PIVOTS and name not in BAKE_OFFSETS:
            obj.location = K.bl(PIVOTS[name])  # exported joints sit at the origin
    if pose:
        poses = {
            'L': ((-.245, 1.422, .008), (-.33, 1.17, .0), (-.37, .93, -.04)),
            'R': ((.245, 1.422, .008), (.33, 1.17, .0), (.37, .93, -.04)),
        }
        for sfx, (sh, el, wr) in poses.items():
            for name, a, b in (('bicep_' + sfx, sh, el), ('forearm_' + sfx, el, wr)):
                obj = by[name]
                start, end = K.bl(a), K.bl(b)
                d = end - start
                obj.location = start
                obj.rotation_mode = 'QUATERNION'
                obj.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(d.normalized())
                obj.scale = (1, 1, d.length)
            g = by['glove_' + sfx]
            g.location = K.bl(wr)
            g.rotation_euler = (math.radians(-80), 0, 0)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    except TypeError:
        pass
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    scene.view_settings.look = 'None'
    studio_world()
    # Floor.
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    floor = bpy.context.object
    fm = bpy.data.materials.new('floor')
    fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.32, .32, .33, 1)
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .6
    floor.data.materials.append(fm)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 70
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    if os.environ.get('SUIT_CLOSE'):
        cam.location = K.bl((.55, 1.55, -1.25))
        cam.rotation_euler = (K.bl((0, 1.45, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    else:
        cam.location = K.bl((1.3, 1.25, -4.2))
        cam.rotation_euler = (K.bl((0, .95, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam

    def light(name, pos, energy, color, size=2.0):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = K.bl(pos)
        obj.rotation_euler = (K.bl((0, 1.1, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    light('key', (2.4, 3.0, -2.6), 320, (1, .95, .9))
    light('rim', (-2.4, 2.4, 2.4), 380, (.75, .85, 1.0))
    light('fill', (-2.6, 1.0, -2.2), 90, (1, .9, .85))
    scene.render.filepath = os.path.join(RENDERS, ident + suffix + '.png')
    bpy.ops.render.render(write_still=True)


def render_export(ident):
    """Re-render a suit from its exported (pre-compression) GLB to check the asset."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(BAKE_DIR, ident + '_raw.glb'))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name in PIVOTS]
    for obj in objects:
        obj.location = (0, 0, 0)
        obj.rotation_mode = 'XYZ'
        obj.rotation_euler = (0, 0, 0)
    beauty(objects, ident)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(SUITS)
    if os.environ.get('SUIT_RENDER_ONLY'):
        for ident in args:
            render_export(ident)
        return
    preview = os.environ.get('SUIT_PREVIEW')  # render procedural shading only, no bake/export
    for ident in args:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        K.BAKED.clear()
        suit = SUITS[ident]()
        objects = suit.build()
        faces = sum(len(o.data.polygons) for o in objects)
        tris = sum(len(p.vertices) - 2 for o in objects for p in o.data.polygons)
        print('Built suit', ident, faces, 'faces', tris, 'tris', flush=True)
        if preview:
            for obj in objects:
                if obj.name in BAKE_OFFSETS:
                    kind = obj.name.split('_')[0]
                    if kind in ARM_LENGTH:
                        obj.scale = (1, 1, 1 / ARM_LENGTH[kind])
                        bpy.ops.object.select_all(action='DESELECT')
                        obj.select_set(True)
                        bpy.context.view_layer.objects.active = obj
                        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            beauty(objects, ident, suffix='_preview', samples=int(preview))
            continue
        proxy = join_proxy(objects)
        uv_unwrap([proxy])
        images = bake([proxy], ident)
        swap_materials([proxy], final_material(ident, images))
        objects = split_proxy(proxy, suit)
        normalise_arms(objects)
        export(objects, ident)
        print('Exported', ident, os.path.getsize(os.path.join(OUT, ident + '.glb')), 'bytes', flush=True)
        if not os.environ.get('SUIT_SKIP_RENDER'):
            beauty(objects, ident)


main()
