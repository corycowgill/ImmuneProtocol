"""Texel classification and PBR map synthesis for TRELLIS textures (numpy, inside Blender).

The TRELLIS base-colour artwork is kept exactly as generated. Roughness and
metallic are re-derived per material class (painted armour, fabric, rubber,
exposed metal, visor ...) because TRELLIS predicts them poorly (for example
uniform ~0.66 metallic on Vanguard's painted plates). Each class gets a
physically plausible target while half of the original per-texel variation
is kept, so worn or dirty areas still differ from clean ones.
"""
import numpy as np

CLASS_COLOURS = {  # for the QA class map
    'paint_white': (235, 235, 235), 'paint_red': (220, 30, 30), 'paint_olive': (110, 130, 50),
    'paint_orange': (255, 140, 20), 'copper': (180, 90, 40), 'brass': (220, 180, 60),
    'composite': (70, 70, 90), 'tactical': (90, 90, 160), 'white_suit': (235, 235, 235), 'fabric': (40, 140, 220), 'rubber': (30, 30, 30),
    'metal': (170, 170, 190), 'visor': (255, 0, 255), 'unclassified': (0, 255, 0),
}


def rgb_to_hsv(rgb):
    """rgb float [0,1] (..., 3) -> h, s, v in [0,1]."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rm = nz & (mx == r)
    gm = nz & (mx == g) & ~rm
    bm = nz & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    return h / 6, np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0), mx


def classify(character, albedo, rough, metal, position, normal, valid, visor_mode, classes):
    """Returns (labels array of class names per texel, dict of masks).

    position: object-space position normalised so z in [0,1] is floor..helmet top,
    normal: object-space unit normal, forward = -Y (TRELLIS sources face -Y).
    """
    h, s, v = rgb_to_hsv(albedo)
    z = position[..., 2]
    forward = -normal[..., 1]
    head = z > .86
    masks = {}
    red = ((h < .04) | (h > .94)) & (s > .45) & (v > .22)
    orange = (h >= .03) & (h < .12) & (s > .45) & (v > .18)
    olive = (h >= .11) & (h < .3) & (s > .18) & (v > .12)
    dark = v < .2
    grey = (s < .2) & (v >= .2) & (v < .62)
    white = (s < .2) & (v >= .62)
    if visor_mode == 'dark':
        visor = head & (forward > .35) & (v < .22)
    elif visor_mode == 'amber':
        visor = head & (forward > .35) & (h > .05) & (h < .24) & (s > .35) & (v > .25)  # amber to yellow-olive glass
    else:  # 'light': glass porthole on a metal helmet
        visor = head & (forward > .5) & (s < .3) & (v > .55)
    metallic_hint = metal > .5
    names = set(classes)
    if character == 'lifeline':
        # White plates and white fabric share one colour; TRELLIS roughness is too
        # noisy to split them, so they stay one class with original variation.
        masks['paint_red'] = red
        masks['white_suit'] = white | (grey & ~metallic_hint)
        masks['metal'] = grey & metallic_hint
        masks['rubber'] = dark
    elif character == 'vanguard':
        # Vanguard's olive paint is dark: hue decides, not brightness.
        olive_paint = (h >= .1) & (h < .3) & (s > .15) & (v > .05)
        masks['paint_olive'] = olive_paint & ~(orange & (v > .45))
        masks['brass'] = orange & ~olive_paint
        masks['metal'] = (grey | white) & (s < .12) & (v > .3)
        neutral_dark = (v <= .3) & (s < .15) & ~olive_paint
        masks['rubber'] = neutral_dark & (rough < .55)
        masks['fabric'] = neutral_dark & (rough >= .55)
    elif character == 'wraith':
        # Plates and fabric are both near-black; TRELLIS roughness is too noisy to
        # split them (doing so mottles the plates), so they share one class.
        masks['metal'] = (grey | white) & metallic_hint
        masks['tactical'] = (dark | grey) & ~masks['metal']
    elif character == 'bathysphere':
        masks['paint_orange'] = orange & (s > .72) & (v > .62)
        masks['copper'] = (orange | red) & ~masks['paint_orange']
        masks['metal'] = (grey | white) & metallic_hint
        masks['fabric'] = (dark | grey | olive) & ~metallic_hint & (rough >= .4)
        masks['rubber'] = (dark | grey) & ~metallic_hint & (rough < .4)
    masks['visor'] = visor
    labels = np.full(albedo.shape[:2], 'unclassified', dtype=object)
    for name in [n for n in masks if n != 'visor'] + ['visor']:  # visor overrides
        if name in names:
            labels[masks[name] & valid] = name
    return labels


def fill_visor(labels, position, normal, valid, voxel=1 / 90):
    """TRELLIS paints reflections into visor albedo, so highlight texels fail the
    colour test. Inside the helmet-front region, texels whose 3D voxel is mostly
    visor become visor too. Nothing outside that region changes."""
    region = valid & (position[..., 2] > .86) & (-normal[..., 1] > .3)
    if not (labels[region] == 'visor').any():
        return labels
    keys = np.floor(position[region] / voxel).astype(np.int64)
    keys = (keys[:, 0] * 1_000_003 + keys[:, 1]) * 1_000_003 + keys[:, 2]
    _, vid = np.unique(keys, return_inverse=True)
    is_visor = (labels[region] == 'visor').astype(np.float64)
    share = np.bincount(vid, is_visor) / np.bincount(vid)
    out = labels.copy()
    sub = out[region]
    sub[share[vid] > .5] = 'visor'
    out[region] = sub
    return out


SOFT = ('fabric', 'composite', 'rubber', 'paint_olive', 'copper', 'paint_orange')


def spatial_vote(labels, position, valid, voxel=1 / 70):
    """Optional majority vote of colour-ambiguous classes inside 3D voxels."""
    soft = valid & np.isin(labels, SOFT)
    if not soft.any():
        return labels
    keys = np.floor(position[soft] / voxel).astype(np.int64)
    keys = (keys[:, 0] * 1_000_003 + keys[:, 1]) * 1_000_003 + keys[:, 2]
    _, voxel_id = np.unique(keys, return_inverse=True)
    names = [n for n in SOFT if (labels[soft] == n).any()]
    counts = np.zeros((voxel_id.max() + 1, len(names)), np.int32)
    flat = labels[soft]
    for i, n in enumerate(names):
        np.add.at(counts[:, i], voxel_id[flat == n], 1)
    winner = np.array(names, dtype=object)[counts.argmax(1)]
    out = labels.copy()
    out[soft] = winner[voxel_id]
    return out


def synthesise(labels, rough, metal, classes, keep=.5):
    """Per-class targets with the original variation kept around them."""
    out_r = rough.copy()
    out_m = metal.copy()
    stats = {}
    for name, (tr, tm) in classes.items():
        m = labels == name
        if not m.any():
            stats[name] = 0.0
            continue
        out_r[m] = np.clip(tr + (rough[m] - np.median(rough[m])) * keep, .03, 1)
        # Metallic is close to binary physically; keep only a little variation.
        out_m[m] = np.clip(tm + (metal[m] - np.median(metal[m])) * keep * .3, 0, 1)
        stats[name] = float(m.mean())
    stats['unclassified'] = float((labels == 'unclassified').mean())
    return out_r, out_m, stats


def class_map(labels):
    img = np.zeros(labels.shape + (3,), np.float32)
    for name, colour in CLASS_COLOURS.items():
        img[labels == name] = np.array(colour) / 255
    return img
