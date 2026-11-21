"""Sculpts the eight level bosses for tools/enemies/process.py (see dist/level-bosses.mjs).

  blender -b -P tools/enemies/process.py -- boss-thrombus boss-leech ...

Each function returns a master mesh built with the helpers in sculpt.py: metres, z up, the
organism facing -Y. Every boss gets its own silhouette and its own zone masks, so the baked
albedo separates plates from flesh, crystals from gel, hooks from skin.
"""
import math
import random

from mathutils import Vector

import sculpt
from sculpt import blob, fuse, metaballs, near_path, near_points, paint, prism, spiral, tube, tubes, vertices, zone_material

TAU = math.tau


def seat(body, centre, direction, depth=0):
    """The point where a ray from far outside meets the body, pushed `depth` back inside."""
    hit, location, _normal, _face = body.ray_cast(Vector(centre) + Vector(direction) * 6, -Vector(direction))
    return (location if hit else Vector(centre) + Vector(direction)) - Vector(direction) * depth


def thrombus():
    """Thrombus Titan: a hulking clot of fused red cells in a fibrin net, with a ram of platelet plates."""
    rng = random.Random(7101)
    centre = Vector((0, .1, .78))
    lumps = [{'co': centre, 'radius': 1.25, 'size': (1.02, 1.3, .74)},
             {'co': (0, -.95, .82), 'radius': .95, 'size': (1, .8, .86), 'stiffness': 1.8}]
    for _ in range(9):
        angle = rng.uniform(0, TAU)
        lumps.append({'co': (math.cos(angle) * .78, .15 + math.sin(angle) * 1.02, rng.uniform(.3, 1.05)), 'radius': rng.uniform(.5, .72), 'stiffness': 1.5})
    for side in (-1, 1):
        for along in (-.85, -.1, .75):
            lumps.append({'co': (side * .86, along, .2), 'radius': .56, 'stiffness': 1.7})
    body = metaballs('thrombus_body', lumps)
    parts, discs, plates, ropes = [body], [], [], []
    for direction in spiral(46, -.15, .3, rng):
        if direction.y < -.45:
            continue
        place = seat(body, centre, direction, .05)
        radius = rng.uniform(.17, .26)
        discs.append(place)
        parts.append(blob('cell', place, radius, (1, 1, .32), (rng.uniform(0, TAU), rng.uniform(0, TAU), rng.uniform(0, TAU)), 3))
    # The ram: overlapping plates across the front, largest at the brow.
    for row, (height, count, size) in enumerate(((1.1, 3, .44), (.72, 4, .4), (.36, 3, .36))):
        for index in range(count):
            angle = (index - (count - 1) / 2) * .62
            direction = Vector((math.sin(angle), -math.cos(angle), (height - .8) * .8)).normalized()
            place = seat(body, (0, -.7, .8), direction, -.03)
            plates.append(place)
            plate = blob('plate', place, size, (1, .3, 1.12), (0, 0, 0), 3)
            plate.rotation_euler = direction.to_track_quat('-Y', 'Z').to_euler()
            parts.append(plate)
    for index in range(7):
        along = -.7 + index * .32
        points = []
        for step in range(9):
            a = math.pi * step / 8
            points.append((math.cos(a) * 1.16 + rng.uniform(-.05, .05), along + math.sin(step * 1.3 + index) * .16, math.sin(a) * 1.02 + .12))
        ropes.append(points)
        parts.append(tube('rope', points, .05, lambda t: 1))
    obj = fuse(parts, 'thrombus', floor=.02)
    co, _ = vertices(obj)
    rope = sum((near_path(co, points, .1) for points in ropes), 0)
    paint(obj, {'r': near_points(co, discs, .3) * (1 - rope), 'g': near_points(co, plates, .52), 'b': rope})
    zone_material(obj,
                  base={'stops': [(.3, (.03, .004, .008)), (.55, (.14, .014, .018)), (.8, (.3, .04, .035))], 'scale': 6, 'rough': .32},
                  zones=[('r', {'stops': [(.3, (.3, .02, .02)), (.7, (.62, .07, .05))], 'scale': 11, 'rough': .2}),
                         ('g', {'stops': [(.25, (.42, .3, .16)), (.6, (.74, .62, .4)), (.85, (.88, .8, .62))], 'scale': 9, 'rough': .5, 'gain': 1.8}),
                         ('b', {'stops': [(.3, (.6, .5, .42)), (.7, (.9, .84, .74))], 'scale': 20, 'rough': .55, 'gain': 2.2})],
                  veins={'colour': (.02, .002, .005), 'scale': 7, 'width': .03, 'strength': .6})
    return sculpt.finish(obj)


def leech():
    """Capillary Leech: a ringed, tapering body reared up over a toothed sucker."""
    rng = random.Random(7202)
    path = []
    for step in range(30):
        t = step / 29
        path.append(Vector((math.sin(t * 5.2) * .42 * (1 - t * .3), 1.7 - t * 3.0, .26 + max(0, 1 - t * 1.5) * 0 + (t ** 2.2) * .7)))
    elements = []
    for step, point in enumerate(path):
        t = step / 29
        girth = (.2 + .34 * math.sin(min(1, t * 1.15) * math.pi) ** .6) * (1.08 if step % 2 else .94)
        elements.append({'co': point, 'radius': girth * 1.75, 'size': (1, .62, .92), 'stiffness': 2.2})
    head = path[-1]
    front = (path[-1] - path[-3]).normalized()
    mouth = head + front * .34
    elements.append({'co': head + front * .12, 'radius': .92, 'stiffness': 2})
    elements.append({'co': mouth + front * .2, 'radius': .62, 'negative': True, 'stiffness': 2.4})
    body = metaballs('leech_body', elements, .014)
    parts, teeth = [body], []
    side = front.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(front).normalized()
    for ring, (count, reach, length) in enumerate(((16, .36, .2), (11, .24, .15))):
        for index in range(count):
            angle = index / count * TAU + ring * .2
            radial = side * math.cos(angle) + up * math.sin(angle)
            place = mouth - front * (.02 + ring * .1) + radial * reach
            teeth.append(place + (-radial + front * .5).normalized() * length * .5)
            parts.append(prism('tooth', place, .045, length, (-radial + front * .55), 5, .7))
    obj = fuse(parts, 'leech', wrinkles=((.4, .02), (.09, .012), (.04, .004)), floor=.02)
    co, normal = vertices(obj)
    belly = (normal[:, 2] < -.05).astype('float32') * .9 + ((co[:, 2] < .16).astype('float32') * .3)
    inside = near_points(co, [mouth - front * .12], .5)
    bite = near_points(co, teeth, .11)
    stripes = (abs(((co[:, 1] * 6.5) % 1) - .5) < .12).astype('float32') * (normal[:, 2] > .2)
    paint(obj, {'r': belly * (1 - inside), 'g': inside * (1 - bite), 'b': bite, 'a': stripes * (1 - inside)})
    zone_material(obj,
                  base={'stops': [(.3, (.012, .016, .01)), (.55, (.05, .06, .03)), (.8, (.13, .14, .06))], 'scale': 9, 'rough': .18},
                  zones=[('a', {'stops': [(.3, (.3, .12, .02)), (.7, (.62, .3, .06))], 'scale': 14, 'rough': .2, 'gain': 1}),
                         ('r', {'stops': [(.3, (.34, .1, .03)), (.7, (.7, .34, .1))], 'scale': 8, 'rough': .25}),
                         ('g', {'stops': [(.3, (.2, .01, .02)), (.7, (.55, .06, .07))], 'scale': 16, 'rough': .15, 'gain': 2}),
                         ('b', {'stops': [(.3, (.7, .64, .5)), (.7, (.95, .92, .82))], 'scale': 20, 'rough': .25, 'gain': 3})],
                  veins={'colour': (.3, .14, .02), 'scale': 12, 'width': .02, 'strength': .35}, coat=.95)
    return sculpt.finish(obj)


def bloom():
    """Mold Crown: a knot of mycelium bristling with stalks, each ending in a head packed with spores."""
    rng = random.Random(7303)
    lumps = [{'co': (0, 0, 0), 'radius': .9, 'stiffness': 2}]
    for direction in spiral(12, -1, .5, rng):
        lumps.append({'co': direction * .42, 'radius': rng.uniform(.34, .5), 'stiffness': 1.6})
    core = metaballs('bloom_core', lumps)
    parts, heads, stalks = [core], [], []
    for direction in spiral(30, -.85, .35, rng):
        length = rng.uniform(.55, .95)
        root = direction * .46
        lean = Vector((rng.uniform(-.2, .2), rng.uniform(-.2, .2), rng.uniform(-.2, .2)))
        mid = root + (direction + lean).normalized() * length * .55
        tip = root + (direction + lean * .4).normalized() * length
        stalks.append([root, mid, tip])
        parts.append(tube('stalk', [root, mid, tip], .05, lambda t: 1 - t * .35))
        radius = rng.uniform(.13, .2)
        heads.append((tip, radius))
        parts.append(blob('head', tip, radius, subdivisions=3))
        # Chains of spores packed over the head.
        for spore in spiral(14, -.3, .4, rng):
            parts.append(blob('spore', tip + spore * radius * 1.02, radius * .3, subdivisions=2))
    for _ in range(26):
        direction = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
        points = [direction * .4, direction * .7 + Vector((rng.uniform(-.2, .2), rng.uniform(-.2, .2), rng.uniform(-.2, .2)))]
        points.append(points[-1] + Vector((rng.uniform(-.25, .25), rng.uniform(-.25, .25), rng.uniform(-.25, .25))))
        parts.append(tube('hypha', points, .025, lambda t: 1 - t * .6))
    obj = fuse(parts, 'bloom', smooth=3, wrinkles=((.3, .014), (.08, .008), (.03, .004)))
    co, _ = vertices(obj)
    head = sum((near_points(co, [tip], radius * 1.75) for tip, radius in heads), 0)
    stalk = sum((near_path(co, points, .09) for points in stalks), 0)
    paint(obj, {'r': head.clip(0, 1) ** .6, 'g': stalk.clip(0, 1) * (1 - head.clip(0, 1))})
    zone_material(obj,
                  base={'stops': [(.3, (.04, .035, .03)), (.55, (.13, .11, .09)), (.8, (.3, .27, .22))], 'scale': 12, 'rough': .7},
                  zones=[('g', {'stops': [(.3, (.42, .44, .36)), (.7, (.74, .76, .64))], 'scale': 18, 'rough': .5}),
                         ('r', {'stops': [(.25, (.03, .1, .09)), (.5, (.1, .32, .26)), (.8, (.36, .6, .46))], 'scale': 30, 'rough': .85, 'gain': 1.6})],
                  mottle=.5, coat=.15, subsurface=.15)
    return sculpt.finish(obj)


def drill():
    """Pylori Drill: a thick corkscrew standing on its hardened tip under a tuft of flagella."""
    rng = random.Random(7404)
    helix = []
    for step in range(46):
        t = step / 45
        reach = .46 * math.sin(min(1, t * 1.6) * math.pi / 2) * (1 - max(0, t - .85) * 2.2)
        helix.append(Vector((math.cos(t * 2.75 * TAU) * reach, math.sin(t * 2.75 * TAU) * reach, .02 + t * 2.5)))
    elements = []
    for step, point in enumerate(helix):
        t = step / 45
        girth = .11 + .25 * math.sin(min(1, t * 1.25 + .06) * math.pi) ** .55
        elements.append({'co': point, 'radius': girth * 1.8, 'stiffness': 2.2})
    body = metaballs('drill_body', elements, .014)
    parts, lashes = [body], []
    crown = helix[-1]
    for index in range(7):
        angle = index / 7 * TAU
        points = [crown]
        for step in range(1, 7):
            wave = math.sin(step * 1.5 + index) * .14
            points.append(crown + Vector((math.cos(angle) * (.1 + step * .12) + wave * math.sin(angle), math.sin(angle) * (.1 + step * .12) - wave * math.cos(angle),
                                          .1 + step * .16 - step * step * .012)))
        lashes.append(points)
        parts.append(tube('lash', points, .04, lambda t: 1 - t * .75))
    obj = fuse(parts, 'drill', wrinkles=((.4, .016), (.09, .01), (.035, .004)))
    co, _ = vertices(obj)
    lash = sum((near_path(co, points, .08) for points in lashes), 0)
    tip = ((.5 - co[:, 2]) / .45).clip(0, 1)
    # Grooves follow the twist of the body.
    angle = (co[:, 2] * 2.75 * TAU / 2.5)
    groove = (abs(((co[:, 2] * 9 + (co[:, 0] * math.cos(0) + co[:, 1]) * 2) % 1) - .5) < .1).astype('float32') * (1 - tip) * (1 - lash.clip(0, 1))
    paint(obj, {'r': lash.clip(0, 1), 'g': tip, 'b': groove})
    zone_material(obj,
                  base={'stops': [(.3, (.34, .13, .1)), (.55, (.62, .34, .24)), (.8, (.82, .58, .42))], 'scale': 8, 'rough': .28},
                  zones=[('b', {'stops': [(.3, (.14, .03, .04)), (.7, (.34, .08, .08))], 'scale': 15, 'rough': .35, 'gain': 1}),
                         ('g', {'stops': [(.3, (.05, .03, .03)), (.7, (.24, .16, .12))], 'scale': 18, 'rough': .5, 'gain': 1.5}),
                         ('r', {'stops': [(.3, (.6, .44, .36)), (.7, (.9, .8, .7))], 'scale': 20, 'rough': .4, 'gain': 2.5})],
                  veins={'colour': (.3, .04, .05), 'scale': 9, 'width': .025, 'strength': .5})
    return sculpt.finish(obj)


def tapeworm():
    """Tapeworm: the scolex. Four cupped suckers around a dome ringed with two rows of hooks."""
    rng = random.Random(7505)
    elements = [{'co': (0, -.1, 0), 'radius': 1.28, 'size': (1, 1.05, .9)},
                {'co': (0, -.78, 0), 'radius': .78, 'size': (1, .85, 1), 'stiffness': 1.8}]
    for index in range(5):
        along = .62 + index * .36
        elements.append({'co': (0, along, 0), 'radius': (1.0 - index * .07) * (1.05 if index % 2 else .88), 'size': (1.12, .4, .7), 'stiffness': 2.3})
    cups = []
    for index in range(4):
        angle = math.pi / 4 + index * math.pi / 2
        direction = Vector((math.cos(angle) * .92, -.22, math.sin(angle) * .92)).normalized()
        place = Vector((0, -.12, 0)) + direction * .64
        cups.append(place + direction * .12)
        elements.append({'co': place, 'radius': .62, 'stiffness': 2.2})
        elements.append({'co': place + direction * .26, 'radius': .42, 'negative': True, 'stiffness': 2.6})
    body = metaballs('tapeworm_body', elements, .014)
    parts, hooks = [body], []
    for ring, (count, reach, length) in enumerate(((16, .3, .34), (13, .2, .26))):
        for index in range(count):
            angle = index / count * TAU + ring * .2
            radial = Vector((math.cos(angle), 0, math.sin(angle)))
            place = Vector((0, -1.08 + ring * -.08, 0)) + radial * reach
            hooks.append(place + radial * length * .3)
            parts.append(prism('hook', place, .05, length, radial * .85 + Vector((0, .5, 0)), 5, .9))
    obj = fuse(parts, 'tapeworm', wrinkles=((.4, .02), (.1, .01), (.04, .004)))
    co, _ = vertices(obj)
    cup = near_points(co, cups, .3)
    hook = near_points(co, hooks, .2) * (co[:, 1] < -.85)
    crease = (abs((((co[:, 1] - .44) / .36) % 1) - .5) > .4).astype('float32') * (co[:, 1] > .4)
    paint(obj, {'r': cup, 'g': hook, 'b': crease})
    zone_material(obj,
                  base={'stops': [(.3, (.5, .4, .28)), (.55, (.76, .68, .52)), (.8, (.9, .85, .72))], 'scale': 7, 'rough': .25},
                  zones=[('b', {'stops': [(.3, (.3, .2, .14)), (.7, (.5, .38, .26))], 'scale': 14, 'rough': .3, 'gain': 1}),
                         ('r', {'stops': [(.3, (.3, .06, .08)), (.7, (.62, .22, .2))], 'scale': 14, 'rough': .16, 'gain': 1.7}),
                         ('g', {'stops': [(.3, (.2, .09, .02)), (.7, (.5, .3, .08))], 'scale': 22, 'rough': .2, 'gain': 3})],
                  veins={'colour': (.5, .2, .16), 'scale': 8, 'width': .02, 'strength': .32}, coat=.85)
    return sculpt.finish(obj)


def colossus():
    """Biofilm Colossus: a slumped mountain of slime, studded with rod bacteria and gas blisters."""
    rng = random.Random(7606)
    centre = Vector((0, 0, .7))
    lumps = [{'co': centre, 'radius': 1.3, 'size': (1.15, 1.1, .82)}, {'co': (.1, -.2, 1.35), 'radius': .8, 'stiffness': 1.7}]
    for _ in range(14):
        angle = rng.uniform(0, TAU)
        reach = rng.uniform(.4, 1.1)
        lumps.append({'co': (math.cos(angle) * reach, math.sin(angle) * reach, rng.uniform(.2, 1.3) * (1.2 - reach * .5)), 'radius': rng.uniform(.4, .7), 'stiffness': 1.5})
    drips = []
    for index in range(11):
        angle = index / 11 * TAU + rng.uniform(-.2, .2)
        reach = rng.uniform(1.25, 1.75)
        drips.append((math.cos(angle) * reach, math.sin(angle) * reach, .1))
        lumps.append({'co': (math.cos(angle) * reach, math.sin(angle) * reach, .12), 'radius': rng.uniform(.4, .56), 'size': (1, 1, .42), 'stiffness': 1.6})
        lumps.append({'co': (math.cos(angle) * reach * .75, math.sin(angle) * reach * .75, .22), 'radius': .5, 'size': (1, 1, .5), 'stiffness': 1.5})
    body = metaballs('colossus_body', lumps)
    parts, rods, blisters = [body], [], []
    for direction in spiral(70, .02, .4, rng):
        place = seat(body, centre, direction, .04)
        axis = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized() * rng.uniform(.14, .22)
        rods.append([place - axis, place + axis])
        parts.append(tube('rod', [place - axis, place, place + axis], rng.uniform(.055, .075), lambda t: 1))
    for direction in spiral(20, .15, .6, rng):
        place = seat(body, centre, direction, -.02)
        radius = rng.uniform(.1, .22)
        blisters.append((place, radius))
        parts.append(blob('blister', place, radius, subdivisions=3))
    obj = fuse(parts, 'colossus', wrinkles=((.55, .045), (.16, .018), (.05, .005)), floor=.02)
    co, _ = vertices(obj)
    rod = sum((near_path(co, points, .1) for points in rods), 0).clip(0, 1)
    blister = sum((near_points(co, [place], radius * 1.5) for place, radius in blisters), 0).clip(0, 1)
    paint(obj, {'r': rod, 'g': blister * (1 - rod), 'b': near_points(co, drips, .7) * (co[:, 2] < .4)})
    zone_material(obj,
                  base={'stops': [(.25, (.16, .15, .02)), (.5, (.42, .4, .08)), (.8, (.7, .66, .24))], 'scale': 5, 'rough': .14},
                  zones=[('b', {'stops': [(.3, (.08, .09, .02)), (.7, (.24, .26, .05))], 'scale': 9, 'rough': .12}),
                         ('g', {'stops': [(.3, (.62, .64, .4)), (.7, (.9, .9, .7))], 'scale': 18, 'rough': .08, 'gain': 1.6}),
                         ('r', {'stops': [(.3, (.12, .2, .05)), (.7, (.34, .5, .12))], 'scale': 22, 'rough': .3, 'gain': 2.2})],
                  veins={'colour': (.1, .12, .01), 'scale': 6, 'width': .03, 'strength': .45}, coat=1, subsurface=.5)
    return sculpt.finish(obj)


def macrophage():
    """Rogue Macrophage: a ruffled white cell with reaching pseudopods and a gaping, half-digested maw."""
    rng = random.Random(7707)
    lumps = [{'co': (0, 0, 0), 'radius': 1.5, 'size': (1, 1, .9)}]
    for direction in spiral(16, -1, .5, rng):
        lumps.append({'co': direction * .7, 'radius': rng.uniform(.5, .76), 'stiffness': 1.5})
    lumps.append({'co': (0, -1.0, -.05), 'radius': .82, 'negative': True, 'stiffness': 2.4})
    arms = []
    for index in range(6):
        angle = (index - 2.5) * .52
        lift = rng.uniform(-.5, .6)
        points = [Vector((math.sin(angle) * .7, -.5, lift * .5))]
        for step in range(1, 6):
            t = step / 5
            points.append(Vector((math.sin(angle) * (.7 + t * .95) + math.sin(t * 4 + index) * .14, -.5 - t * (1.1 + rng.uniform(0, .4)), lift * (.5 + t * .6) + math.cos(t * 3 + index) * .12)))
        arms.append(points)
        for step, point in enumerate(points):
            lumps.append({'co': point, 'radius': (.5 - step * .05) * (1.25 if step == 5 else 1), 'stiffness': 2})
    body = metaballs('macrophage_body', lumps)
    parts, ruffles, meals = [body], [], []
    for direction in spiral(64, -1, .5, rng):
        if direction.y < -.55:
            continue
        place = seat(body, (0, 0, 0), direction, .12)
        ruffles.append(place + direction * .2)
        sheet = blob('ruffle', place, rng.uniform(.24, .4), (1, .16, 1.25), subdivisions=3)
        twist = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
        sheet.rotation_euler = (direction + twist * .5).to_track_quat('Z', 'Y').to_euler()
        parts.append(sheet)
    for _ in range(9):
        meals.append(Vector((rng.uniform(-.8, .8), rng.uniform(-.2, .9), rng.uniform(-.7, .7))).normalized() * 1.0)
    obj = fuse(parts, 'macrophage', wrinkles=((.5, .035), (.13, .014), (.05, .004)))
    co, normal = vertices(obj)
    maw = near_points(co, [(0, -.72, -.05)], .82) * (((co @ [0, -1, 0]) < 1.05))
    inside = maw * ((normal @ [0, -1, 0]) > -.2)
    paint(obj, {'r': near_points(co, ruffles, .26), 'g': inside.clip(0, 1), 'b': near_points(co, meals, .4) * (1 - inside.clip(0, 1))})
    zone_material(obj,
                  base={'stops': [(.3, (.42, .36, .48)), (.55, (.68, .62, .72)), (.8, (.88, .84, .88))], 'scale': 6, 'rough': .22},
                  zones=[('b', {'stops': [(.3, (.2, .08, .2)), (.7, (.42, .2, .36))], 'scale': 10, 'rough': .2}),
                         ('r', {'stops': [(.3, (.74, .68, .74)), (.7, (.96, .93, .94))], 'scale': 16, 'rough': .3, 'gain': 1.3}),
                         ('g', {'stops': [(.3, (.16, .02, .1)), (.7, (.48, .1, .24))], 'scale': 14, 'rough': .12, 'gain': 2.2})],
                  veins={'colour': (.36, .16, .4), 'scale': 7, 'width': .022, 'strength': .4}, coat=.9, subsurface=.5)
    return sculpt.finish(obj)


def screamer():
    """Otolith Screamer: a crown of calcite crystals on a gel sac, trailing a bundle of sensory hairs."""
    rng = random.Random(7808)
    lumps = [{'co': (0, 0, 0), 'radius': 1.05, 'size': (1, 1, .8)}]
    for direction in spiral(9, -1, .5, rng):
        lumps.append({'co': direction * .4, 'radius': rng.uniform(.34, .5), 'stiffness': 1.6})
    sac = metaballs('screamer_sac', lumps)
    parts, crystals, hairs = [sac], [], []
    for direction in spiral(52, -.25, .4, rng):
        length = rng.uniform(.4, 1.05) * (1.25 if direction.z > .6 else 1)
        radius = rng.uniform(.085, .17)
        root = direction * .46
        lean = (direction + Vector((rng.uniform(-.3, .3), rng.uniform(-.3, .3), rng.uniform(-.1, .3)))).normalized()
        crystals.append([root, root + lean * length * 1.3])
        parts.append(prism('crystal', root, radius, length, lean, rng.choice((4, 6, 6)), .4))
    for ring in range(4):
        for index in range(6 + ring * 3):
            angle = index / (6 + ring * 3) * TAU + ring * .4
            reach = .08 + ring * .1
            length = 1.25 - ring * .24 + rng.uniform(-.06, .06)
            root = Vector((math.cos(angle) * reach, math.sin(angle) * reach, -.4))
            tip = root + Vector((math.cos(angle) * .1, math.sin(angle) * .1, -length))
            mid = (root + tip) / 2 + Vector((rng.uniform(-.05, .05), rng.uniform(-.05, .05), 0))
            hairs.append([root, mid, tip])
            parts.append(tube('hair', [root, mid, tip], .034, lambda t: 1 - t * .45))
    obj = fuse(parts, 'screamer', smooth=1, wrinkles=((.3, .006), (.05, .003)))
    co, _ = vertices(obj)
    crystal = sum((near_path(co, points, .2) for points in crystals), 0).clip(0, 1) * (((co ** 2).sum(1) ** .5) > .5)
    hair = sum((near_path(co, points, .07) for points in hairs), 0).clip(0, 1) * (co[:, 2] < -.42)
    paint(obj, {'r': crystal, 'g': hair})
    zone_material(obj,
                  base={'stops': [(.3, (.34, .2, .24)), (.55, (.6, .42, .46)), (.8, (.8, .66, .68))], 'scale': 7, 'rough': .16},
                  zones=[('g', {'stops': [(.3, (.6, .4, .34)), (.7, (.92, .78, .66))], 'scale': 22, 'rough': .3, 'gain': 2.4}),
                         ('r', {'stops': [(.25, (.5, .62, .72)), (.55, (.8, .88, .93)), (.85, (.97, .98, 1))], 'scale': 5, 'rough': .06, 'gain': 2})],
                  veins={'colour': (.5, .14, .2), 'scale': 9, 'width': .02, 'strength': .4, 'mask': None}, mottle=.16, coat=1, subsurface=.25)
    return sculpt.finish(obj)


BUILDERS = {'boss-thrombus': thrombus, 'boss-leech': leech, 'boss-bloom': bloom, 'boss-drill': drill,
            'boss-tapeworm': tapeworm, 'boss-colossus': colossus, 'boss-macrophage': macrophage, 'boss-screamer': screamer}
