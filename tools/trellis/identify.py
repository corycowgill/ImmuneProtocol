"""Stage 3 - Identify which TRELLIS source is which character.

    python3 tools/trellis/identify.py

Signals (each normalised to [0, 1] distance, lower = more similar):
  1. colour  - HSV histogram of the front preview render vs the reference art.
  2. texture - HSV histogram of the source base-colour texture vs the reference art.
  3. palette - share of pixels matching each character's design criteria
               (olive, graphite, white+red, copper/orange).
  4. shape   - silhouette features (helmet width / height ratio, shoulder span,
               torso depth from the side view) vs the reference art.

All 24 source->character assignments are scored; the mapping is written to
tools/trellis/mapping.json only if the best assignment is unambiguous: every
source's chosen character is its own best match on the combined score, and the
runner-up permutation is worse by a clear margin. Otherwise the report flags it
for manual confirmation and no mapping file is written.
"""
import itertools
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
REFS = os.path.join(ROOT, 'tools', 'suits', 'reference')
PREVIEW = os.path.join(HERE, 'renders', 'preview')
REPORTS = os.path.join(HERE, 'reports')
CHARACTERS = ['vanguard', 'wraith', 'lifeline', 'bathysphere']
SOURCES = ['A', 'B', 'C', 'D']
MARGIN = 0.15  # runner-up assignment must be at least 15% worse


def hsv(rgb):
    img = Image.fromarray(rgb.reshape(-1, 1, 3).astype(np.uint8), 'RGB').convert('HSV')  # (N,3) would read as greyscale
    return np.asarray(img).reshape(-1, 3).astype(float)


def foreground_render(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(float)
    bg = np.median(a[:20, :20].reshape(-1, 3), 0)
    mask = np.abs(a - bg).sum(2) > 18
    return a, mask


def foreground_ref(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(float)[:, 312:888]  # drop letterbox
    bg = np.median(np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3)]), 0)
    sat, bright = a.max(2) - a.min(2), a.mean(2)
    mask = (np.abs(a - bg).sum(2) > 45) & ~((sat < 12) & (bright > 200))
    return a, mask


def histogram(pixels):
    h = hsv(pixels)
    # Hue only matters when saturated; achromatic pixels go to value bins.
    chroma = h[:, 1] > 50
    hue_hist = np.histogram(h[chroma, 0], bins=12, range=(0, 256))[0]
    val_hist = np.histogram(h[~chroma, 2], bins=6, range=(0, 256))[0]
    v = np.concatenate([hue_hist, val_hist]).astype(float)
    return v / max(1, v.sum())


def bhattacharyya(p, q):
    return float(np.sqrt(max(0.0, 1 - np.sum(np.sqrt(p * q)))))


PALETTES = {
    # (hue range 0-255, min sat, value range)
    'vanguard': [((25, 60), 60, (40, 200))],                       # olive / military green
    'wraith': [((0, 256), 0, (0, 70))],                            # graphite / black (low value)
    'lifeline': [((0, 256), 0, (190, 256)), ((240, 256), 120, (90, 256)), ((0, 8), 120, (90, 256))],  # white + red
    'bathysphere': [((8, 25), 110, (70, 256))],                    # copper / orange
}


def palette_share(pixels, character):
    h = hsv(pixels)
    share = 0.0
    for (h0, h1), smin, (v0, v1) in PALETTES[character]:
        sel = (h[:, 0] >= h0) & (h[:, 0] < h1) & (h[:, 2] >= v0) & (h[:, 2] < v1)
        if smin:
            sel &= h[:, 1] >= smin
        else:
            sel &= h[:, 1] < 60
        share += sel.mean()
    return share


def silhouette(mask):
    rows = np.where(mask.sum(1) > 2)[0]
    top, bot = rows[0], rows[-1]
    H = bot - top
    width = mask.sum(1)
    head = np.median(width[top + int(.02 * H): top + int(.08 * H)])
    cols = np.where(mask[top:bot].any(0))[0]
    span = cols[-1] - cols[0]
    # Width of the body (not arms) at mid-torso, sampled 35% down.
    torso_row = mask[top + int(.35 * H)]
    xs = np.where(torso_row)[0]
    centre = (cols[0] + cols[-1]) / 2
    core = xs[np.abs(xs - centre) < .25 * span]
    torso = (core.max() - core.min()) if len(core) else 0
    return np.array([head / H, torso / H])


def main():
    refs = {c: foreground_ref(os.path.join(REFS, c + '.jpg')) for c in CHARACTERS}
    ref_hist = {c: histogram(a[m]) for c, (a, m) in refs.items()}
    ref_shape = {c: silhouette(m) for c, (a, m) in refs.items()}
    signals = {name: np.zeros((4, 4)) for name in ('colour', 'texture', 'palette', 'shape')}
    details = {}
    for i, s in enumerate(SOURCES):
        a, m = foreground_render(os.path.join(PREVIEW, 'source_%s_neg_y.png' % s))
        tex = np.asarray(Image.open(os.path.join(REPORTS, 'source_%s_Image_0.png' % s)).convert('RGBA')).astype(float)
        tex_px = tex[..., :3][tex[..., 3] > 0] if tex.shape[-1] == 4 else tex[..., :3].reshape(-1, 3)
        tex_px = tex_px[tex_px.sum(1) > 6]  # skip empty atlas space
        render_hist, tex_hist, shape = histogram(a[m]), histogram(tex_px), silhouette(m)
        shares = {c: palette_share(a[m], c) for c in CHARACTERS}
        details[s] = {'palette_share': {c: round(v, 3) for c, v in shares.items()},
                      'silhouette_head_torso_ratio': [round(x, 3) for x in shape]}
        for j, c in enumerate(CHARACTERS):
            signals['colour'][i, j] = bhattacharyya(render_hist, ref_hist[c])
            signals['texture'][i, j] = bhattacharyya(tex_hist, ref_hist[c])
            signals['palette'][i, j] = 1 - shares[c] / max(shares.values())
            signals['shape'][i, j] = float(np.abs(shape - ref_shape[c]).sum())
    # Normalise each signal to [0, 1] across the matrix, then weight.
    weights = {'colour': .3, 'texture': .2, 'palette': .35, 'shape': .15}
    combined = np.zeros((4, 4))
    for name, mat in signals.items():
        span = mat.max() - mat.min()
        combined += weights[name] * ((mat - mat.min()) / span if span else mat * 0)
    perms = sorted(itertools.permutations(range(4)), key=lambda p: sum(combined[i, p[i]] for i in range(4)))
    cost = lambda p: sum(combined[i, p[i]] for i in range(4))
    best, runner = perms[0], perms[1]
    margin = (cost(runner) - cost(best)) / max(1e-9, cost(best))
    row_best = [int(np.argmin(combined[i])) for i in range(4)]
    col_best = [int(np.argmin(combined[:, j])) for j in range(4)]
    consistent = all(row_best[i] == best[i] for i in range(4)) and all(col_best[best[i]] == i for i in range(4))
    margin = float(margin)
    unambiguous = bool(consistent and margin >= MARGIN)

    rows = []
    for i, s in enumerate(SOURCES):
        j = best[i]
        others = sorted(combined[i, k] for k in range(4) if k != j)
        separation = others[0] - combined[i, j]
        confidence = 'high' if separation > .25 else 'medium' if separation > .1 else 'low'
        evidence = {name: round(float(signals[name][i, j]), 3) for name in signals}
        rows.append({'source': s, 'character': CHARACTERS[j], 'confidence': confidence,
                     'score': round(float(combined[i, j]), 3), 'next_best_gap': round(float(separation), 3),
                     'signal_distances': evidence, **details[s]})
    report = {'unambiguous': unambiguous, 'consistent': consistent, 'assignment_margin': round(margin, 3),
              'combined_matrix': {s: {c: round(float(combined[i, j]), 3) for j, c in enumerate(CHARACTERS)} for i, s in enumerate(SOURCES)},
              'assignments': rows}
    with open(os.path.join(REPORTS, 'identification.json'), 'w') as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report, indent=1))
    if not unambiguous:
        sys.exit('Identification is ambiguous; confirm the mapping manually (no mapping.json written).')
    manifest = json.load(open(os.path.join(HERE, 'originals', 'manifest.json')))
    mapping = {r['character']: {'source': r['source'], 'file': 'originals/source_%s.glb' % r['source'],
                                'sha256': manifest[r['source']]['sha256'], 'source_url': manifest[r['source']]['source_url'],
                                'confidence': r['confidence']} for r in rows}
    with open(os.path.join(HERE, 'mapping.json'), 'w') as handle:
        json.dump(mapping, handle, indent=2)
    print('Wrote mapping.json')


if __name__ == '__main__':
    main()
