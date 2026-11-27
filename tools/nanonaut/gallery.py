"""Builds tools/nanonaut/work/preview/index.html: every clip's preview renders (front, side and
three-quarter views at four points through the clip) plus the QA extreme poses, for review.

    python tools/nanonaut/gallery.py"""
import glob, html, json, os, re, time

HERE = os.path.dirname(os.path.abspath(__file__))
PREVIEW = os.path.join(HERE, 'work', 'preview')
REPORTS = os.path.join(HERE, 'reports')

clips = {}
for path in glob.glob(os.path.join(PREVIEW, '*.png')):
    m = re.match(r'(.+)_(front|right|quarter|side)_(\d)\.png$', os.path.basename(path))
    if m:
        clips.setdefault(m.group(1), {}).setdefault(m.group(2), {})[int(m.group(3))] = os.path.basename(path)
qa = json.load(open(os.path.join(REPORTS, 'qa.json'))) if os.path.exists(os.path.join(REPORTS, 'qa.json')) else {}
stamp = time.strftime('%Y-%m-%d %H:%M')
rows = []
order = ['Aim', 'Stand', 'Walk', 'WalkBack', 'StrafeL', 'StrafeR', 'Run', 'LowReady', 'Crouch', 'CrouchWalk', 'Cover', 'Reload',
         'DodgeL', 'DodgeR', 'Stagger', 'DeathBack', 'DeathFront']
for name in sorted(clips, key=lambda n: order.index(n) if n in order else 99):
    views = clips[name]
    info = qa.get('clips', {}).get(name)
    note = ''
    if info:
        note = (f'QA: stretch p99 {info["p99"]:.0%} · worst tear {info["tear"] * 100:.1f} cm · volume change {info["volume"]:.1%} · '
                f'lowest point {info["lowest"] * 100:.1f} cm · hands off carbine {info["grip"] * 100:.1f} cm')
    cells = ''.join(f'<img loading="lazy" src="{html.escape(views[v][i])}" title="{v} {i}">' for v in ('front', 'right', 'side', 'quarter')
                    if v in views for i in sorted(views[v]))
    rows.append(f'<section><h2>{html.escape(name)}</h2><p>{html.escape(note)}</p><div class="strip">{cells}</div></section>')
extreme = sorted(glob.glob(os.path.join(REPORTS, 'extreme_*.png')))
if extreme:
    cells = ''.join(f'<figure><img loading="lazy" src="../../reports/{os.path.basename(p)}"><figcaption>{html.escape(os.path.basename(p)[8:-4].replace("_", " "))}</figcaption></figure>' for p in extreme)
    rows.append(f'<section><h2>QA extreme poses</h2><div class="strip">{cells}</div></section>')
fails = qa.get('failures')
summary = f'{len(fails)} QA failures' if fails else ('QA passed' if qa else 'QA not run')
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nanonaut Animation Review</title>
<style>
:root {{ --bg:#14171b; --panel:#1d2228; --text:#e6e9ec; --muted:#8b949e; }}
body {{ margin:0; padding:16px; background:var(--bg); color:var(--text); font:14px system-ui,sans-serif; }}
h1 {{ font-size:20px; margin:0 0 4px; }} h2 {{ font-size:16px; margin:0 0 2px; }} p {{ color:var(--muted); margin:0 0 8px; }}
section {{ background:var(--panel); border-radius:8px; padding:12px; margin:12px 0; }}
.strip {{ display:flex; gap:6px; overflow-x:auto; }} .strip img {{ height:240px; border-radius:4px; background:#888; }}
figure {{ margin:0; }} figcaption {{ color:var(--muted); font-size:12px; text-align:center; }}
</style></head><body><h1>Nanonaut animation review</h1><p>Built {stamp} · {summary}. Each row: front, right side and three-quarter views at four points through the clip. The grey block on the weapon bone stands in for the game's carbine.</p>
{''.join(rows)}</body></html>"""
open(os.path.join(PREVIEW, 'index.html'), 'w', encoding='utf-8').write(page)
print('wrote', os.path.join(PREVIEW, 'index.html'), len(clips), 'clips')
