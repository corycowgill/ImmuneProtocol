# Bakes the artwork tile for every achievement into dist/assets/achievements/<id>.webp.
#
#   python3 tools/achievements/bake_art.py [--subjects DIR] [id ...]
#
# Each tile is composed from the game's own art: pathogen and boss portraits, the organ holograms
# from the mission briefings, the field-upgrade renders, key art, and the five weapon models
# (rendered by render_subjects.py into --subjects, default tools/achievements/subjects). Over the
# subject go vector glyphs and a number plate, and around it a clipped-corner frame in the tier's
# metal (bronze, silver, gold, platinum) that matches the HUD panels. Tiles are drawn at 2x and
# downsampled for clean edges. Needs Pillow, and fontTools + brotli to read the bundled
# Barlow Condensed (pip install pillow fonttools brotli).
import functools, io, math, os, random, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, 'dist', 'assets')
OUT = os.path.join(ASSETS, 'achievements')
SIZE, SCALE = 320, 2
S = SIZE * SCALE

TIER = {
    'bronze': [(98, 52, 24), (222, 150, 96), (255, 214, 176), (140, 76, 36)],
    'silver': [(70, 82, 92), (196, 208, 216), (255, 255, 255), (120, 134, 144)],
    'gold': [(110, 76, 8), (240, 196, 72), (255, 244, 190), (168, 120, 18)],
    'platinum': [(40, 86, 106), (170, 232, 252), (245, 254, 255), (90, 150, 176)],
}
HUE = {
    'campaign': (70, 220, 205), 'combat': (255, 98, 84), 'bosses': (255, 96, 170),
    'support': (168, 240, 120), 'mastery': (176, 150, 255),
}

# kind: portrait | weapon | scene | upgrade | multi | glyph-only. glyph: drawn on top.
# badge: short text on a plate. hue: overrides the category tint.
M = lambda area, cx, cy, size: {'kind': 'scene', 'src': 'story/missions/%s.webp' % area, 'crop': (cx, cy, size)}
ART = {
    'scrubbed-in': {'cat': 'campaign', 'tier': 'bronze', 'kind': 'upgrade', 'quad': 0, 'glyph': 'cross'},
    'clot-buster': {'cat': 'campaign', 'tier': 'bronze', **M('artery', .29, .41, .74)},
    'capillary-action': {'cat': 'campaign', 'tier': 'bronze', **M('junction', .30, .44, .72)},
    'be-still': {'cat': 'campaign', 'tier': 'bronze', **M('heart', .26, .41, .72)},
    'deep-breath': {'cat': 'campaign', 'tier': 'bronze', **M('lungs', .28, .43, .78)},
    'iron-stomach': {'cat': 'campaign', 'tier': 'bronze', **M('stomach', .26, .42, .72)},
    'gut-feeling': {'cat': 'campaign', 'tier': 'bronze', **M('intestines', .22, .50, .78)},
    'end-of-the-line': {'cat': 'campaign', 'tier': 'bronze', **M('colon', .25, .47, .74)},
    'swollen-glands': {'cat': 'campaign', 'tier': 'bronze', **M('lymph', .255, .40, .62)},
    'hear-me-out': {'cat': 'campaign', 'tier': 'bronze', **M('ear', .28, .42, .66)},
    'mind-over-matter': {'cat': 'campaign', 'tier': 'silver', **M('brain', .265, .42, .62)},
    'president-safe': {'cat': 'campaign', 'tier': 'gold', 'kind': 'scene', 'src': 'story/campaign-ending.webp', 'crop': (.74, .47, .95), 'glyph': 'star'},
    'house-call': {'cat': 'campaign', 'tier': 'silver', 'kind': 'portrait', 'src': 'guard', 'glyph': 'cross', 'badge': 'HARD'},
    'chief-of-medicine': {'cat': 'campaign', 'tier': 'gold', 'kind': 'scene', 'src': 'hero.webp', 'crop': (.56, .40, .80), 'glyph': 'cross', 'badge': 'HARD'},
    'patient-zero': {'cat': 'combat', 'tier': 'bronze', 'kind': 'portrait', 'src': 'virus', 'badge': '1'},
    'antibody-count': {'cat': 'combat', 'tier': 'bronze', 'kind': 'portrait', 'src': 'phage', 'badge': '500'},
    'white-cell-army': {'cat': 'combat', 'tier': 'silver', 'kind': 'portrait', 'src': 'filovirus', 'badge': '5K'},
    'pandemic-over': {'cat': 'combat', 'tier': 'gold', 'kind': 'portrait', 'src': 'splitter', 'badge': '25K', 'rays': True},
    'critical-care': {'cat': 'combat', 'tier': 'bronze', 'kind': 'portrait', 'src': 'spore', 'glyph': 'crosshair', 'badge': '1K'},
    'needle-point': {'cat': 'combat', 'tier': 'bronze', 'kind': 'weapon', 'src': 'carbine', 'badge': '300', 'hue': (90, 210, 255)},
    'one-shot-one-cure': {'cat': 'combat', 'tier': 'bronze', 'kind': 'weapon', 'src': 'sniper', 'glyph': 'crosshair', 'badge': '100', 'hue': (120, 180, 255)},
    'bedside-blast': {'cat': 'combat', 'tier': 'bronze', 'kind': 'weapon', 'src': 'shotgun', 'badge': '200', 'hue': (255, 150, 80)},
    'phage-therapy': {'cat': 'combat', 'tier': 'bronze', 'kind': 'weapon', 'src': 'launcher', 'badge': '150', 'hue': (255, 120, 60)},
    'sting-operation': {'cat': 'combat', 'tier': 'bronze', 'kind': 'weapon', 'src': 'pistol', 'badge': '200', 'hue': (230, 230, 110)},
    'collateral-damage': {'cat': 'combat', 'tier': 'silver', 'kind': 'weapon', 'src': 'launcher', 'glyph': 'burst', 'badge': 'x5', 'hue': (255, 170, 60)},
    'fire-in-the-hole': {'cat': 'combat', 'tier': 'bronze', 'kind': 'portrait', 'src': 'amoeba', 'glyph': 'burst', 'badge': 'x4'},
    'fever-pitch': {'cat': 'combat', 'tier': 'silver', 'kind': 'portrait', 'src': 'blister', 'glyph': 'flame', 'badge': '15', 'hue': (255, 120, 40)},
    'knuckle-sandwich': {'cat': 'combat', 'tier': 'bronze', 'kind': 'portrait', 'src': 'bacillus', 'glyph': 'impact', 'badge': '25'},
    'shock-therapy': {'cat': 'combat', 'tier': 'bronze', 'kind': 'portrait', 'src': 'crawler', 'glyph': 'bolt', 'badge': 'x6', 'hue': (110, 200, 255)},
    'float-like-a-phagocyte': {'cat': 'combat', 'tier': 'bronze', 'kind': 'portrait', 'src': 'rogue-bot', 'glyph': 'chevrons', 'badge': '25', 'hue': (140, 255, 220)},
    'giant-slayer': {'cat': 'bosses', 'tier': 'bronze', 'kind': 'portrait', 'src': 'boss-colossus', 'glyph': 'star'},
    'off-the-wall': {'cat': 'bosses', 'tier': 'bronze', 'kind': 'portrait', 'src': 'boss-thrombus', 'glyph': 'impact'},
    'leech-removal': {'cat': 'bosses', 'tier': 'bronze', 'kind': 'portrait', 'src': 'boss-leech'},
    'worm-has-turned': {'cat': 'bosses', 'tier': 'bronze', 'kind': 'portrait', 'src': 'boss-tapeworm', 'badge': '7/7'},
    'indigestion': {'cat': 'bosses', 'tier': 'bronze', 'kind': 'portrait', 'src': 'boss-macrophage'},
    'going-viral': {'cat': 'bosses', 'tier': 'silver', 'kind': 'scene', 'src': 'missions/mega-virus.webp', 'crop': (.49, .42, .92)},
    'final-diagnosis': {'cat': 'bosses', 'tier': 'silver', 'kind': 'portrait', 'src': 'boss-screamer', 'glyph': 'crosshair', 'badge': '5'},
    'rogues-gallery': {'cat': 'bosses', 'tier': 'gold', 'kind': 'multi', 'src': ['boss-bloom', 'boss-drill', 'boss-thrombus'], 'badge': '9', 'rays': True},
    'egg-hunt': {'cat': 'support', 'tier': 'bronze', 'kind': 'portrait', 'src': 'nest', 'badge': '10'},
    'pest-control': {'cat': 'support', 'tier': 'silver', 'kind': 'portrait', 'src': 'nest', 'glyph': 'crosshair', 'badge': '75', 'hue': (255, 200, 90)},
    'care-package': {'cat': 'support', 'tier': 'bronze', 'kind': 'upgrade', 'quad': 1, 'glyph': 'cross', 'badge': '15'},
    'stitch-in-time': {'cat': 'support', 'tier': 'bronze', 'kind': 'scene', 'src': 'tissue.webp', 'crop': (.5, .5, .9), 'glyph': 'stitch', 'badge': '10', 'big': True, 'hue': (255, 120, 120)},
    'tissue-engineer': {'cat': 'support', 'tier': 'silver', 'kind': 'scene', 'src': 'tissue.webp', 'crop': (.3, .5, .7), 'glyph': 'cross', 'badge': '25K', 'big': True},
    'set-and-forget': {'cat': 'support', 'tier': 'silver', 'kind': 'upgrade', 'quad': 3, 'glyph': 'crosshair', 'badge': '250'},
    'squad-goals': {'cat': 'support', 'tier': 'silver', 'kind': 'upgrade', 'quad': 2, 'glyph': 'squad'},
    'know-your-enemy': {'cat': 'support', 'tier': 'bronze', 'kind': 'portrait', 'src': 'colony', 'glyph': 'magnifier', 'badge': '12'},
    'dressed-to-disinfect': {'cat': 'support', 'tier': 'bronze', 'kind': 'weapon', 'src': 'pistol', 'glyph': 'star', 'hue': (255, 110, 200), 'tint': (255, 120, 210)},
    'not-a-scratch': {'cat': 'mastery', 'tier': 'silver', 'kind': 'glyph-only', 'glyph': 'shield', 'badge': '100%'},
    'close-shave': {'cat': 'mastery', 'tier': 'bronze', 'kind': 'glyph-only', 'glyph': 'ecg-low', 'badge': '10%', 'hue': (255, 80, 80)},
    'no-backup-needed': {'cat': 'mastery', 'tier': 'silver', 'kind': 'weapon', 'src': 'carbine', 'glyph': 'no-turret'},
    'second-opinion': {'cat': 'mastery', 'tier': 'bronze', 'kind': 'glyph-only', 'glyph': 'rewind'},
    'overtime-hero': {'cat': 'mastery', 'tier': 'silver', 'kind': 'scene', 'src': 'story/missions/junction.webp', 'crop': (.30, .44, .72), 'glyph': 'clock'},
    'vital-signs': {'cat': 'mastery', 'tier': 'silver', 'kind': 'glyph-only', 'glyph': 'ecg', 'badge': '75K', 'hue': (120, 255, 150)},
    'off-the-charts': {'cat': 'mastery', 'tier': 'gold', 'kind': 'glyph-only', 'glyph': 'chart', 'badge': '100K', 'rays': True, 'hue': (255, 214, 90)},
    'field-tested': {'cat': 'mastery', 'tier': 'silver', 'kind': 'scene', 'src': 'field-upgrades.webp', 'crop': (.5, .5, 1), 'badge': '4/4'},
    'immune-protocol': {'cat': 'mastery', 'tier': 'platinum', 'kind': 'scene', 'src': 'hero.webp', 'crop': (.54, .38, .62), 'glyph': 'emblem', 'rays': True, 'hue': (150, 230, 255)},
    # Shown for a hidden achievement that is still locked.
    'hidden': {'cat': 'mastery', 'tier': 'silver', 'kind': 'glyph-only', 'glyph': 'question', 'hue': (120, 140, 160)},
}


@functools.lru_cache(None)
def load_font(px):
    try:
        from fontTools.ttLib import TTFont
        font = TTFont(os.path.join(ROOT, 'dist', 'vendor', 'barlow-condensed.woff2'))
        font.flavor = None
        data = io.BytesIO(); font.save(data); data.seek(0)
        return ImageFont.truetype(data, px)
    except Exception:
        for path in ['/usr/share/fonts/opentype/inter/InterDisplay-Black.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
            if os.path.exists(path):
                return ImageFont.truetype(path, px)
        return ImageFont.load_default()


def frame_polygon(inset, cut):
    # The HUD's clipped corners: top-left and bottom-right are cut.
    a, b = inset, S - inset
    return [(a + cut, a), (b, a), (b, b - cut), (b - cut, b), (a, b), (a, a + cut)]


def mask_of(polygon):
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask


def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


@functools.lru_cache(None)
def metal(tier):
    # A brushed metal plate: diagonal bands of light over the tier's base, with fine streaks.
    dark, base, light, mid = TIER[tier]
    img = Image.new('RGB', (S, S))
    px = img.load()
    rng = random.Random(tier)
    streak = [rng.uniform(-.06, .06) for _ in range(S * 2)]
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * S)
            v = .5 + .5 * math.cos((t * 2.6 + .15) * math.pi * 2) * .9
            v = max(0, min(1, v + streak[x + y]))
            px[x, y] = lerp(dark, base, min(1, v * 1.6)) if v < .62 else lerp(base, light, (v - .62) / .38)
    return img


def backdrop(hue, rays):
    img = Image.new('RGB', (S, S), (6, 10, 14))
    glow = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(glow)
    for r in range(S // 2, 0, -4):
        d.ellipse([S / 2 - r * 1.15, S * .46 - r * 1.15, S / 2 + r * 1.15, S * .46 + r * 1.15], fill=int(200 * (1 - r / (S / 2)) ** 1.6))
    glow = glow.filter(ImageFilter.GaussianBlur(S / 30))
    img = Image.composite(Image.new('RGB', (S, S), tuple(int(c * .62) for c in hue)), img, glow)
    # A faint lattice of cells, like tissue under the microscope.
    cells = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(cells)
    step = S / 9
    for row in range(-1, 11):
        for col in range(-1, 11):
            cx = col * step + (step / 2 if row % 2 else 0)
            cy = row * step * .87
            r = step * .44
            d.regular_polygon((cx, cy, r), 6, rotation=30, outline=60, width=max(1, SCALE))
    img = Image.composite(Image.new('RGB', (S, S), lerp(hue, (255, 255, 255), .3)), img, cells.point(lambda v: v * .55))
    if rays:
        ray = Image.new('L', (S, S), 0)
        d = ImageDraw.Draw(ray)
        cx, cy = S / 2, S * .46
        for i in range(18):
            a0 = i / 18 * math.pi * 2
            d.polygon([(cx, cy), (cx + math.cos(a0) * S, cy + math.sin(a0) * S), (cx + math.cos(a0 + .09) * S, cy + math.sin(a0 + .09) * S)], fill=46)
        ray = ray.filter(ImageFilter.GaussianBlur(S / 120))
        img = Image.composite(Image.new('RGB', (S, S), lerp(hue, (255, 255, 255), .5)), img, ray)
    return img


def subject_glow(subject, hue, radius, strength=1.0):
    alpha = subject.getchannel('A')
    halo = alpha.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: min(255, int(v * 1.7 * strength)))
    layer = Image.new('RGBA', subject.size, hue + (0,))
    layer.putalpha(halo)
    return layer


def grade(img, hue, amount):
    # Pull an RGB scene toward the tile's colour so every tile in a category reads as a set.
    tint = Image.new('RGB', img.size, hue)
    return Image.blend(img, ImageChops.multiply(img, tint).point(lambda v: min(255, int(v * 1.5))), amount)


def crop_square(img, cx, cy, size):
    w, h = img.size
    side = int(min(w, h) * size)
    left = int(max(0, min(w - side, cx * w - side / 2)))
    top = int(max(0, min(h - side, cy * h - side / 2)))
    return img.crop((left, top, left + side, top + side))


def place(canvas, subject, box_size, center=(.5, .5), angle=0, hue=(255, 255, 255), glow=True):
    if angle:
        subject = subject.rotate(angle, resample=Image.BICUBIC, expand=True)
    bbox = subject.getchannel('A').getbbox()
    if bbox:
        subject = subject.crop(bbox)
    scale = box_size / max(subject.size)
    subject = subject.resize((max(1, int(subject.width * scale)), max(1, int(subject.height * scale))), Image.LANCZOS)
    pos = (int(S * center[0] - subject.width / 2), int(S * center[1] - subject.height / 2))
    if glow:
        pad = 60 * SCALE
        padded = Image.new('RGBA', (subject.width + pad * 2, subject.height + pad * 2), (0, 0, 0, 0))
        padded.alpha_composite(subject, (pad, pad))
        shadow = Image.new('RGBA', padded.size, (0, 0, 0, 0))
        shadow.putalpha(padded.getchannel('A').filter(ImageFilter.GaussianBlur(10 * SCALE)).point(lambda v: int(v * .8)))
        canvas.alpha_composite(shadow, (pos[0] - pad + 4 * SCALE, pos[1] - pad + 10 * SCALE))
        canvas.alpha_composite(subject_glow(padded, hue, 14 * SCALE, .8), (pos[0] - pad, pos[1] - pad))
    canvas.alpha_composite(subject, pos)


# Vector glyphs, drawn in a 0..1 box.
def glyph(name, size, color, outline=(4, 8, 12)):
    g = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    W = lambda v: max(1, int(v * size))
    P = lambda pts: [(x * size, y * size) for x, y in pts]

    def stroke_poly(points, width, closed=False):
        pts = P(points)
        if closed:
            pts = pts + [pts[0]]
        d.line(pts, fill=outline, width=W(width + .07), joint='curve')
        d.line(pts, fill=color, width=W(width), joint='curve')

    def fill_poly(points):
        d.polygon(P(points), fill=color, outline=outline, width=W(.035))

    if name == 'cross':
        fill_poly([(.36, .1), (.64, .1), (.64, .36), (.9, .36), (.9, .64), (.64, .64), (.64, .9), (.36, .9), (.36, .64), (.1, .64), (.1, .36), (.36, .36)])
    elif name == 'crosshair':
        d.ellipse([W(.18), W(.18), W(.82), W(.82)], outline=outline, width=W(.13))
        d.ellipse([W(.18), W(.18), W(.82), W(.82)], outline=color, width=W(.07))
        for seg in [[(.5, .04), (.5, .32)], [(.5, .68), (.5, .96)], [(.04, .5), (.32, .5)], [(.68, .5), (.96, .5)]]:
            stroke_poly(seg, .07)
        d.ellipse([W(.45), W(.45), W(.55), W(.55)], fill=color)
    elif name in ('burst', 'impact'):
        spikes = 12 if name == 'burst' else 8
        pts = []
        for i in range(spikes * 2):
            r = .48 if i % 2 == 0 else (.24 if name == 'burst' else .3)
            a = i / (spikes * 2) * math.pi * 2 + .2
            pts.append((.5 + math.cos(a) * r, .5 + math.sin(a) * r))
        fill_poly(pts)
        if name == 'burst':
            d.ellipse([W(.36), W(.36), W(.64), W(.64)], fill=(255, 255, 255))
    elif name == 'bolt':
        fill_poly([(.58, .04), (.2, .56), (.46, .56), (.38, .96), (.8, .4), (.53, .4)])
    elif name == 'flame':
        fill_poly([(.5, .04), (.68, .3), (.84, .52), (.82, .74), (.68, .92), (.5, .97), (.32, .92), (.18, .74), (.2, .52), (.34, .4), (.38, .58), (.46, .3)])
    elif name == 'star':
        pts = []
        for i in range(10):
            r = .48 if i % 2 == 0 else .2
            a = -math.pi / 2 + i * math.pi / 5
            pts.append((.5 + math.cos(a) * r, .53 + math.sin(a) * r))
        fill_poly(pts)
    elif name == 'chevrons':
        for off in (0, .3):
            fill_poly([(.12 + off, .18), (.3 + off, .18), (.58 + off, .5), (.3 + off, .82), (.12 + off, .82), (.4 + off, .5)])
    elif name == 'magnifier':
        d.ellipse([W(.08), W(.08), W(.66), W(.66)], outline=outline, width=W(.15))
        d.ellipse([W(.08), W(.08), W(.66), W(.66)], outline=color, width=W(.09))
        stroke_poly([(.6, .6), (.92, .92)], .14)
    elif name == 'shield':
        fill_poly([(.5, .04), (.9, .18), (.86, .58), (.5, .96), (.14, .58), (.1, .18)])
        d.line(P([(.3, .5), (.45, .66), (.72, .34)]), fill=(8, 20, 16), width=W(.09), joint='curve')
    elif name in ('ecg', 'ecg-low'):
        pts = [(.02, .58), (.25, .58), (.32, .45), (.38, .58), (.44, .58), (.5, .12), (.58, .9), (.64, .58), (.98, .58)]
        if name == 'ecg-low':
            pts = [(.02, .55), (.22, .55), (.3, .38), (.37, .72), (.44, .55), (.98, .55)]
        stroke_poly(pts, .075)
    elif name == 'chart':
        for i, h in enumerate([.3, .45, .62, .92]):
            x0 = .1 + i * .21
            d.rectangle([W(x0), W(.95 - h), W(x0 + .16), W(.95)], fill=color, outline=outline, width=W(.03))
    elif name == 'rewind':
        d.arc([W(.12), W(.12), W(.88), W(.88)], 200, 500, fill=outline, width=W(.15))
        d.arc([W(.12), W(.12), W(.88), W(.88)], 200, 500, fill=color, width=W(.09))
        fill_poly([(.02, .32), (.28, .32), (.13, .58)])
        fill_poly([(.46, .3), (.46, .7), (.66, .5)])
    elif name == 'clock':
        d.ellipse([W(.06), W(.06), W(.94), W(.94)], fill=outline)
        d.ellipse([W(.11), W(.11), W(.89), W(.89)], outline=color, width=W(.07))
        stroke_poly([(.5, .5), (.5, .24)], .07)
        stroke_poly([(.5, .5), (.7, .6)], .07)
    elif name == 'stitch':
        # A closed wound: a curved seam crossed by sutures. Outlines first, then fills, so the
        # crossings read as one shape.
        seam = [(.08 + i * .084, .56 - math.sin(i / 10 * math.pi) * .16) for i in range(11)]
        d.line(P(seam), fill=outline, width=W(.2), joint='curve')
        d.line(P(seam), fill=color, width=W(.13), joint='curve')
        for i in (1, 3, 5, 7, 9):
            x, y = seam[i]
            d.line(P([(x - .05, y - .13), (x + .05, y + .13)]), fill=(70, 12, 20), width=W(.045))
    elif name == 'squad':
        for cx, s in ((.28, .8), (.72, .8), (.5, 1)):
            d.ellipse([W(cx - .12 * s), W(.16 + (1 - s) * .1), W(cx + .12 * s), W(.4 + (1 - s) * .1)], fill=color, outline=outline, width=W(.03))
            d.pieslice([W(cx - .22 * s), W(.46 + (1 - s) * .1), W(cx + .22 * s), W(.96)], 180, 360, fill=color, outline=outline, width=W(.03))
    elif name == 'no-turret':
        d.ellipse([W(.08), W(.08), W(.92), W(.92)], outline=outline, width=W(.15))
        d.ellipse([W(.08), W(.08), W(.92), W(.92)], outline=color, width=W(.09))
        stroke_poly([(.22, .78), (.78, .22)], .09)
    elif name == 'question':
        f = load_font(int(size * .9))
        d.text((size / 2, size / 2), '?', font=f, fill=color, anchor='mm', stroke_width=W(.03), stroke_fill=outline)
    elif name == 'emblem':
        fill_poly([(.5, .04), (.9, .2), (.86, .6), (.5, .96), (.14, .6), (.1, .2)])
        inner = [(.5, .16), (.78, .27), (.75, .56), (.5, .83), (.25, .56), (.22, .27)]
        d.polygon(P(inner), fill=(14, 40, 56))
        d.polygon(P([(.44, .3), (.56, .3), (.56, .44), (.68, .44), (.68, .56), (.56, .56), (.56, .7), (.44, .7), (.44, .56), (.32, .56), (.32, .44), (.44, .44)]), fill=color)
    return g


def plate(canvas, text, tier, hue):
    font = load_font(int(46 * SCALE))
    d = ImageDraw.Draw(canvas)
    tw = d.textlength(text, font=font)
    w, h = tw + 30 * SCALE, 52 * SCALE
    x1, y1 = S - 30 * SCALE, S - 30 * SCALE
    x0, y0 = x1 - w, y1 - h
    cut = 12 * SCALE
    d.polygon([(x0 + cut, y0), (x1, y0), (x1, y1 - cut), (x1 - cut, y1), (x0, y1), (x0, y0 + cut)], fill=(8, 13, 18, 235), outline=TIER[tier][1] + (255,), width=2 * SCALE)
    d.text(((x0 + x1) / 2, (y0 + y1) / 2 + 1 * SCALE), text, font=font, fill=(255, 255, 255), anchor='mm')


def bake(id_, spec, subjects):
    tier, hue = spec['tier'], spec.get('hue') or HUE[spec['cat']]
    rays = spec.get('rays') or tier in ('gold', 'platinum')
    border, cut = 22 * SCALE, 54 * SCALE
    inner_poly = frame_polygon(border, cut - border * .4)
    art = backdrop(hue, rays).convert('RGBA')
    kind = spec['kind']
    if kind == 'portrait':
        src = Image.open(os.path.join(ASSETS, 'enemies', 'portraits', spec['src'] + '.webp')).convert('RGBA')
        place(art, src, S * .74, (.5, .5), hue=hue)
    elif kind == 'multi':
        for i, (name, cx, cy, size) in enumerate(zip(spec['src'], (.3, .7, .5), (.42, .42, .6), (.5, .5, .62))):
            src = Image.open(os.path.join(ASSETS, 'enemies', 'portraits', name + '.webp')).convert('RGBA')
            place(art, src, S * size, (cx, cy), hue=hue)
    elif kind == 'weapon':
        src = Image.open(os.path.join(subjects, spec['src'] + '.png')).convert('RGBA')
        if spec.get('tint'):
            rgb = grade(src.convert('RGB'), spec['tint'], .55)
            rgb.putalpha(src.getchannel('A'))
            src = rgb
        place(art, src, S * .86, (.5, .5), angle=24, hue=hue)
    elif kind in ('scene', 'upgrade'):
        img = Image.open(os.path.join(ASSETS, spec['src'] if kind == 'scene' else 'field-upgrades.webp')).convert('RGB')
        if kind == 'upgrade':
            q = spec['quad']
            half = img.width // 2
            img = img.crop(((q % 2) * half, (q // 2) * half, (q % 2) * half + half, (q // 2) * half + half))
        else:
            img = crop_square(img, *spec['crop'])
        img = img.resize((S, S), Image.LANCZOS)
        img = grade(img, hue, .25)
        # Fade the scene's edges into the backdrop.
        fade = Image.new('L', (S, S), 0)
        ImageDraw.Draw(fade).ellipse([-S * .12, -S * .12, S * 1.12, S * 1.12], fill=255)
        fade = fade.filter(ImageFilter.GaussianBlur(S / 10))
        art.paste(img, (0, 0), fade)
    has_subject = kind != 'glyph-only' and not spec.get('big')
    if spec.get('glyph'):
        color = (255, 255, 255) if has_subject else lerp(hue, (255, 255, 255), .45)
        size = int(S * (.3 if has_subject else .58))
        if has_subject:
            pos = (int(S * .08) + border // 2, int(S * .08) + border // 2) if spec.get('badge') else (S - size - border - int(S * .06), int(S * .08) + border // 2)
        else:
            pos = ((S - size) // 2, int((S - size) * .42))
        g = glyph(spec['glyph'], size, color)
        # Pad before blurring so the glow fades out instead of stopping at the glyph's box.
        pad = 40 * SCALE
        padded = Image.new('RGBA', (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
        padded.alpha_composite(g, (pad, pad))
        art.alpha_composite(subject_glow(padded, hue, (8 if has_subject else 22) * SCALE, 1.2 if has_subject else 1.4), (pos[0] - pad, pos[1] - pad))
        art.alpha_composite(g, pos)
    if spec.get('badge'):
        plate(art, spec['badge'], tier, hue)
    # Vignette and a soft top sheen, like glass over the tile.
    vignette = Image.new('L', (S, S), 0)
    ImageDraw.Draw(vignette).ellipse([-S * .25, -S * .25, S * 1.25, S * 1.25], fill=255)
    vignette = ImageChops.invert(vignette.filter(ImageFilter.GaussianBlur(S / 7))).point(lambda v: int(v * .75))
    art.alpha_composite(Image.merge('RGBA', [Image.new('L', (S, S), 0)] * 3 + [vignette]))
    sheen = Image.new('L', (S, S), 0)
    ImageDraw.Draw(sheen).polygon([(0, 0), (S, 0), (S, S * .18), (0, S * .46)], fill=26)
    art.alpha_composite(Image.merge('RGBA', [Image.new('L', (S, S), 255)] * 3 + [sheen.filter(ImageFilter.GaussianBlur(S / 60))]))
    # Frame: tier metal outside the inner polygon, a dark keyline and a bright inner bevel.
    tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    outer = frame_polygon(0, cut)
    tile.paste(metal(tier), (0, 0), mask_of(outer))
    d = ImageDraw.Draw(tile)
    d.line(outer + [outer[0]], fill=TIER[tier][2] + (255,), width=2 * SCALE)
    tile.paste(art, (0, 0), mask_of(inner_poly))
    d.line(inner_poly + [inner_poly[0]], fill=(5, 8, 10, 255), width=5 * SCALE)
    d.line(inner_poly + [inner_poly[0]], fill=TIER[tier][2] + (150,), width=1 * SCALE)
    # Rivets on the two square corners.
    for cx, cy in ((S - border / 2, border / 2), (border / 2, S - border / 2)):
        r = 4 * SCALE
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=TIER[tier][0] + (255,), outline=TIER[tier][2] + (255,), width=SCALE)
    tile = tile.resize((SIZE, SIZE), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    tile.save(os.path.join(OUT, id_ + '.webp'), 'WEBP', quality=86, method=6)


def main():
    args = sys.argv[1:]
    subjects = os.path.join(ROOT, 'tools', 'achievements', 'subjects')
    if '--subjects' in args:
        i = args.index('--subjects'); subjects = args[i + 1]; del args[i:i + 2]
    for id_, spec in ART.items():
        if args and id_ not in args:
            continue
        bake(id_, spec, subjects)
        print('baked', id_)


if __name__ == '__main__':
    main()
