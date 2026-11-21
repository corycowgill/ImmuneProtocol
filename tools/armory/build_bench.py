"""Builds the armory's medical-lab workbench and renders it as the armory backdrop.

blender -b -P tools/armory/build_bench.py -- [--samples N] [--preview]

The armory shows a weapon floating over a maintenance pad on a hospital lab bench. The bench is
modelled with the co-op lobby lab's helpers and materials (tools/lobby/build_lab.py), in the
armory photo scene's own coordinates, and path-traced from the armory camera:

  dist/assets/armory/bench.webp   1920 x 1200, the picture behind the live, lit weapon

The weapon turns on a pivot while the camera stays put, so one picture serves every angle. It is
rendered with a shallow depth of field focused where the weapon floats, which keeps the bench
soft behind the weapon and its callouts. (The lobby bakes its lab into a texture atlas instead,
because its camera moves; a full-atlas bake of this bench takes far longer than a single frame.)

Coordinates match the armory's photo scene: the weapon lies along z around the origin with its
muzzle toward -z, and the camera sits on the -x side looking toward +x. So the bench top runs
along z under the weapon, the wall of cabinets and instruments stands at +x behind it, and
everything that should read in the picture is placed for that one view.
"""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'lobby'))
import build_lab as lab  # noqa: E402  (modelling helpers, materials and the bake)

OUT = os.path.join(ROOT, 'dist', 'assets', 'armory')
WORK = os.path.join(HERE, 'work')
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
lab.OUT = OUT
lab.PARTS.clear()
lab.PARTS['bench'] = []
B = 'bench'
TOP = -.46          # Height of the bench surface.
WALL = 1.05         # x of the back wall.
box, cylinder, tube, M = lab.box, lab.cylinder, lab.tube, lab.M


def materials():
    lab.materials()
    P = lab.principled
    M['steel'] = P('steel', (.62, .65, .67), rough=.28, metal=1)
    M['steel_dark'] = P('steel_dark', (.2, .22, .24), rough=.35, metal=.9)
    M['mat'] = P('mat', (.02, .07, .075), rough=.8)
    M['mat_line'] = P('mat_line', (.1, .4, .37), rough=.5, emission=lab.TEAL, strength=.5)
    M['panel'] = P('panel', (.5, .55, .57), rough=.5)
    M['screen'] = P('screen', (.01, .03, .035), rough=.2, emission=(.02, .16, .16), strength=1)
    M['trace'] = P('trace', (.2, .9, .8), rough=.3, emission=lab.TEAL, strength=4)
    M['screen_red'] = P('screen_red', (.08, .02, .02), rough=.2, emission=(1, .25, .18), strength=2.2)
    M['glass'] = P('glass', (.62, .8, .82), rough=.04, metal=.15, coat=1)
    M['amber'] = P('amber', (.75, .42, .08), rough=.12, coat=1, emission=(.9, .45, .05), strength=.35)
    M['serum'] = P('serum', (.1, .6, .5), rough=.12, coat=1, emission=(.1, .8, .65), strength=.5)
    M['blood'] = P('blood', (.45, .02, .03), rough=.15, coat=1)
    M['white'] = P('white', (.9, .91, .9), rough=.3, coat=.4)
    M['tool_red'] = P('tool_red', (.6, .06, .05), rough=.4)
    M['lamp'] = P('lamp', (1, 1, 1), emission=(1, .97, .9), strength=9)
    M['wall'] = P('wall_bench', (.3, .34, .36), rough=.55)
    M['peg'] = P('peg_bench', (.36, .4, .42), rough=.6)


def bench():
    # Stainless top with a raised back lip, a drawer carcass below and an anti-static work mat.
    box(B, 'steel', (.1, TOP - .03, -.3), (1.9, .06, 4.6), bevel=.012)
    box(B, 'steel', (WALL - .06, TOP + .05, -.3), (.08, .12, 4.6), bevel=.01)
    box(B, 'ceramic', (.15, TOP - .5, -.3), (1.7, .86, 4.5), bevel=.02)
    for z in (-1.7, -.6, .5, 1.6):
        box(B, 'steel_dark', (-.72, TOP - .34, z), (.02, .2, .9), bevel=.006)
        cylinder(B, 'chrome', (-.745, TOP - .34, z), .012, .5, axis='z')
    box(B, 'mat', (-.05, TOP + .006, -.32), (1.15, .012, 2.5), bevel=.004)
    for z in (-1.5, 1.0 - .14):
        box(B, 'mat_line', (-.05, TOP + .014, z), (1.05, .003, .012), bevel=0)
    for x in (-.56, .46):
        box(B, 'mat_line', (x, TOP + .014, -.32), (.012, .003, 2.36), bevel=0)
    for index in range(12):
        box(B, 'mat_line', (-.5, TOP + .014, -1.42 + index * .2), (.05, .003, .006), bevel=0)


def cradle():
    """The maintenance pad: a low emitter plate whose field holds the weapon above the mat."""
    cylinder(B, 'steel_dark', (.02, TOP + .022, -.26), .46, .02, bevel=.006)
    cylinder(B, 'graphite', (.02, TOP + .034, -.26), .4, .012)
    lab.torus(B, 'glow', (.02, TOP + .042, -.26), .37, .008)
    lab.torus(B, 'glow_soft', (.02, TOP + .042, -.26), .2, .005)
    for index in range(12):
        angle = index / 12 * math.tau
        cylinder(B, 'chrome', (.02 + math.cos(angle) * .29, TOP + .044, -.26 + math.sin(angle) * .29), .014, .008)
    for z, facing in ((-.6, -1), (.1, 1)):
        tube(B, 'rubber', [(.3, TOP + .03, z), (.55, TOP + .02, z + facing * .12), (.8, TOP + .02, z + facing * .3), (WALL - .12, TOP + .05, z + facing * .34)], .011)


def wall():
    # Panelled wall, a pegboard of tools, a shelf of reagents, cabinets with glass fronts.
    box(B, 'wall', (WALL + .05, .55, -.3), (.1, 2.4, 4.8), bevel=0)
    for z in (-2.3, -1.15, 0, 1.15):
        box(B, 'seam', (WALL - .002, .55, z + .28), (.006, 2.4, .012), bevel=0)
    box(B, 'peg', (WALL - .012, .22, -.75), (.02, .82, 1.5), bevel=.006)
    for row in range(7):
        for column in range(14):
            cylinder(B, 'seam', (WALL - .024, -.12 + row * .1, -1.42 + column * .1), .008, .004, axis='x', verts=10, bevel=0)
    # Hand tools hanging on the board.
    for index, (z, length, colour) in enumerate(((-1.34, .3, 'tool_red'), (-1.22, .24, 'yellow'), (-1.1, .34, 'tool_red'), (-.98, .2, 'black'), (-.86, .28, 'yellow'))):
        cylinder(B, colour, (WALL - .05, .42 - length * .2, z), .016, length * .45)
        cylinder(B, 'chrome', (WALL - .05, .42 - length * .68, z), .007, length * .55)
    for z in (-.62, -.44, -.26):
        tube(B, 'chrome', [(WALL - .05, .5, z), (WALL - .06, .3, z + .02), (WALL - .05, .12, z)], .008)
        box(B, 'chrome', (WALL - .05, .06, z), (.012, .1, .05), bevel=.004)
    # Reagent shelf with bottles, vials and a rack of blood tubes.
    box(B, 'steel', (WALL - .16, .78, -.3), (.3, .025, 2.9), bevel=.006)
    for index in range(11):
        z = -1.6 + index * .26
        kind = ('glass', 'amber', 'serum', 'white')[index % 4]
        height = .16 + (index * 7 % 5) * .028
        cylinder(B, kind, (WALL - .17, .79 + height / 2, z), .045 + (index % 3) * .008, height)
        cylinder(B, 'black' if index % 2 else 'white', (WALL - .17, .8 + height, z), .028, .03)
    box(B, 'white', (WALL - .22, TOP + .07, .86), (.16, .1, .5), bevel=.01)
    for index in range(8):
        cylinder(B, 'blood' if index % 3 else 'serum', (WALL - .22, TOP + .17, .66 + index * .058), .014, .14)
        cylinder(B, 'tool_red' if index % 3 else 'black', (WALL - .22, TOP + .245, .66 + index * .058), .016, .02)
    # Reagent bottles lined up along the back of the bench.
    for index in range(6):
        z = -.2 + index * .13
        kind = ('amber', 'glass', 'serum', 'white', 'amber', 'glass')[index]
        height = .13 + (index * 7 % 4) * .03
        cylinder(B, kind, (WALL - .2, TOP + height / 2, z), .04, height)
        cylinder(B, 'black' if index % 2 else 'white', (WALL - .2, TOP + height + .012, z), .024, .026)
    # Overhead cabinets with lit glass doors.
    box(B, 'ceramic', (WALL - .2, 1.42, -.3), (.42, .62, 4.4), bevel=.015)
    for index in range(5):
        box(B, 'cabinet_glass', (WALL - .415, 1.42, -2.06 + index * .88), (.012, .52, .8), bevel=0)
    box(B, 'lamp', (WALL - .3, 1.09, -.3), (.1, .02, 3.9), bevel=0)


def instruments():
    # Diagnostic monitor on an arm, showing a waveform and a readout.
    tube(B, 'graphite', [(WALL - .05, .12, .55), (WALL - .22, .2, .5), (WALL - .3, .16, .42)], .016)
    box(B, 'graphite', (WALL - .33, .16, .42), (.035, .46, .7), bevel=.012)
    box(B, 'screen', (WALL - .352, .16, .42), (.004, .4, .64), bevel=0)
    for index in range(22):
        t = index / 21
        beat = .11 * math.exp(-((t - .34) * 16) ** 2) - .05 * math.exp(-((t - .42) * 22) ** 2) + .02 * math.sin(t * 30)
        box(B, 'trace', (WALL - .356, .22 + beat, .15 + t * .54), (.003, .012, .03), bevel=0)
    for row in range(3):
        box(B, 'trace', (WALL - .356, .04 - row * .045, .3 + row * .03), (.003, .014, .22 - row * .04), bevel=0)
    box(B, 'screen_red', (WALL - .356, .3, .68), (.003, .04, .06), bevel=0)
    # Microscope.
    box(B, 'white', (.66, TOP + .02, -1.2), (.3, .04, .24), bevel=.012)
    box(B, 'white', (.76, TOP + .22, -1.2), (.07, .38, .09), bevel=.02)
    box(B, 'steel_dark', (.64, TOP + .13, -1.2), (.16, .012, .16), bevel=.004)
    cylinder(B, 'graphite', (.64, TOP + .26, -1.2), .034, .16)
    cylinder(B, 'chrome', (.64, TOP + .17, -1.2), .02, .05)
    tube(B, 'graphite', [(.7, TOP + .38, -1.2), (.62, TOP + .44, -1.2), (.54, TOP + .5, -1.2)], .022)
    cylinder(B, 'glow_soft', (.64, TOP + .027, -1.2), .03, .008)
    # Centrifuge.
    cylinder(B, 'white', (.6, TOP + .11, 1.72), .2, .22)
    cylinder(B, 'graphite', (.6, TOP + .23, 1.72), .17, .03)
    cylinder(B, 'cabinet_glass', (.6, TOP + .25, 1.72), .13, .012)
    box(B, 'screen', (.4, TOP + .12, 1.72), (.006, .06, .12), bevel=0)
    # Steel tray of spare parts and a kidney dish with syringes.
    box(B, 'steel', (.62, TOP + .02, .34), (.3, .03, .4), bevel=.01)
    for index in range(5):
        cylinder(B, 'graphite' if index % 2 else 'chrome', (.55 + (index % 2) * .12, TOP + .055, .2 + index * .07), .024, .05 + index * .012, axis='x')
    box(B, 'steel', (-.4, TOP + .02, -1.92), (.2, .03, .34), bevel=.03)
    for index in range(3):
        z = -2.0 + index * .08
        cylinder(B, 'glass', (-.4, TOP + .05, z), .012, .15, axis='x')
        cylinder(B, 'serum', (-.42, TOP + .05, z), .01, .08, axis='x')
        cylinder(B, 'chrome', (-.31, TOP + .05, z), .003, .06, axis='x', verts=8, bevel=0)
    # Petri dishes with cultures.
    for index, (x, z) in enumerate(((.62, -.42), (.74, -.26), (.56, -.2))):
        cylinder(B, 'glass', (x, TOP + .022, z), .07, .016)
        cylinder(B, ('blood', 'amber', 'serum')[index], (x, TOP + .028, z), .058, .006)
    # Magnifier lamp on an articulated arm, lighting the work.
    cylinder(B, 'steel_dark', (.8, TOP + .02, -.78), .07, .03)
    tube(B, 'chrome', [(.8, TOP + .03, -.78), (.84, TOP + .5, -.8), (.7, TOP + .86, -.68), (.52, TOP + .9, -.52)], .013)
    cylinder(B, 'graphite', (.48, TOP + .89, -.48), .1, .03)
    cylinder(B, 'lamp', (.48, TOP + .872, -.48), .085, .006)


def lights():
    scene = bpy.context.scene
    world = bpy.data.worlds.new('bench')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.012, .016, .02, 1)
    scene.world = world

    def area(location, size, energy, color=(1, 1, 1), rotation=(math.pi, 0, 0)):
        light = bpy.data.objects.new('area', bpy.data.lights.new('area', 'AREA'))
        light.data.size = size
        light.data.energy = energy
        light.data.color = color
        light.location = lab.to_b(*location)
        light.rotation_euler = rotation
        scene.collection.objects.link(light)
    # A soft ceiling panel, a cool fill from the room behind the camera and a warm work lamp.
    area((-.1, 2.3, -.3), 2.4, 46, (.8, .92, 1))
    area((-1.6, 1.2, -.3), 2, 14, (.6, .85, 1), (math.radians(105), 0, math.radians(-90)))
    area((.48, TOP + .84, -.48), .16, 9, (1, .95, .85))
    point = bpy.data.objects.new('field', bpy.data.lights.new('field', 'POINT'))
    point.data.energy = 5
    point.data.color = lab.TEAL
    point.data.shadow_soft_size = .2
    point.location = lab.to_b(.02, TOP + .18, -.26)
    scene.collection.objects.link(point)


def render(samples, width, height, path, blur=True):
    scene = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle = math.radians(36)
    # Where the armory's camera sits for the carbine: four fifths of the way out from its focus.
    focus = lab.to_b(0, -.015, -.245)
    cam.location = lab.to_b(-1.31 * .8, -.015 + .435 * .8, -.245 - .645 * .8)
    cam.rotation_euler = (focus - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if blur:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = (focus - cam.location).length
        cam.data.dof.aperture_fstop = 3.2
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'Standard'
    scene.render.image_settings.file_format = 'WEBP' if path.endswith('.webp') else 'PNG'
    scene.render.image_settings.quality = 90
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('[bench] %s %d bytes' % (path, os.path.getsize(path)), flush=True)


if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials()
    bench()
    cradle()
    wall()
    instruments()
    lights()
    lab.use_gpu(bpy.context.scene)
    if lab.PREVIEW:
        render(48, 1280, 800, os.path.join(WORK, 'bench_preview.png'))
    else:
        render(lab.SAMPLES, 1920, 1200, os.path.join(OUT, 'bench.webp'))
