// Builds the credits roll video (dist/assets/story/credits.mp4 and its poster) from credits.json.
// Local tool: needs Playwright's Chromium and ffmpeg. Usage: node tools/credits/build-credits.mjs
//
// The page draws the background and the scrolling text as two still images; ffmpeg slides the
// text over the background at a steady speed, holds on the last line, fades in and out, and lays
// the menu theme (looped with a crossfade when the roll outlasts it) underneath.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dist = join(root, 'dist');
const credits = JSON.parse(readFileSync(join(here, 'credits.json'), 'utf8'));
const out = join(dist, 'assets/story/credits');
const music = join(dist, 'assets/music/immune-response.mp3');

const WIDTH = 1280, HEIGHT = 720, FPS = 25;
const SPEED = 74;        // Pixels per second, as the original roll.
const LEAD = .3;         // Seconds before the first line enters.
const HOLD = 4.6;        // Seconds on the last line.
const FADE_IN = 1, FADE_OUT = .8;

const escape = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const role = ([label, name, notes]) => `<section class="role"><p class="label">${escape(label)}</p><h3>${escape(name)}</h3>${
  [].concat(notes ?? []).map(note => `<p class="note">${note ? escape(note) : '&nbsp;'}</p>`).join('')}</section>`;

// The game's own fonts, inlined so the page needs no file access.
const font = name => 'data:font/woff2;base64,' + readFileSync(join(dist, 'vendor', name)).toString('base64');
const style = `
@font-face{font-family:"Barlow Condensed";src:url("${font('barlow-condensed.woff2')}") format("woff2");font-weight:800}
@font-face{font-family:"IBM Plex Mono";src:url("${font('ibm-plex-mono.woff2')}") format("woff2");font-weight:500}
*{margin:0;box-sizing:border-box}
html,body{width:${WIDTH}px;background:transparent}
body.bg{height:${HEIGHT}px;background:radial-gradient(ellipse 50% 70% at 50% 48%,#11363f 0%,#0d2d35 30%,#082028 58%,#04141a 82%,#03101a 100%)}
.roll{width:${WIDTH}px;padding:0 120px;text-align:center;color:#e7f5ec;font:500 18px/1.5 "IBM Plex Mono",monospace}
.title{font:800 70px/1 "Barlow Condensed",sans-serif;letter-spacing:.5px;color:#e9f7ef}
.subtitle{margin-top:34px;font-size:19px;color:#c9d8d0}
.roles{margin-top:72px}
.role{margin-bottom:38px}
.label{font-size:20px;color:#7fe2a9;text-transform:uppercase;letter-spacing:.5px}
h3{margin-top:6px;font:800 42px/1.05 "Barlow Condensed",sans-serif;color:#eef8f2}
.note{margin-top:6px;color:#a8bab2}
.thanks{margin-top:150px}
.thanks h2{font:800 40px/1 "Barlow Condensed",sans-serif;color:#c8f794;margin-bottom:22px}
.thanks .line{color:#d8e5de;margin-top:10px}
.thanks .role{margin:56px 0 0}
.thanks .closing{margin-top:56px}
.disclaimer{margin-top:84px;color:#d8e5de}
.end{margin-top:150px;font:800 70px/1 "Barlow Condensed",sans-serif;color:#e9f7ef;padding-bottom:40px}`;

const roll = `<div class="roll">
<h1 class="title">${escape(credits.title)}</h1>
<p class="subtitle">${escape(credits.subtitle)}</p>
<div class="roles">${credits.roles.map(role).join('')}</div>
<div class="thanks"><h2>SPECIAL THANKS</h2>
${credits.specialThanks.lines.map(line => `<p class="line">${escape(line)}</p>`).join('')}
${credits.specialThanks.roles.map(role).join('')}
<p class="line closing">${escape(credits.specialThanks.closing)}</p></div>
<p class="disclaimer">${escape(credits.disclaimer)}</p>
<p class="end" id="end">${escape(credits.end)}</p>
</div>`;

const work = mkdtempSync(join(tmpdir(), 'credits-'));
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.setContent(`<!doctype html><html><head><style>${style}</style></head><body class="bg"></body></html>`);
  await page.screenshot({ path: join(work, 'bg.png') });
  await page.setContent(`<!doctype html><html><head><style>${style}</style></head><body>${roll}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const { height, endCenter } = await page.evaluate(() => {
    const end = document.getElementById('end').getBoundingClientRect();
    return { height: Math.ceil(document.querySelector('.roll').getBoundingClientRect().height), endCenter: (end.top + end.bottom - 40) / 2 };
  });
  await page.setViewportSize({ width: WIDTH, height });
  await page.screenshot({ path: join(work, 'roll.png'), omitBackground: true, fullPage: true });
  await browser.close();

  // The roll enters from the bottom edge and stops with the last line at the centre of the frame.
  const stopY = Math.round(HEIGHT * .51 - endCenter);
  const scroll = (HEIGHT - stopY) / SPEED;
  const duration = Math.ceil((LEAD + scroll + HOLD) * FPS) / FPS;
  const y = `max(${stopY}\\,${HEIGHT}-${SPEED}*max(0\\,t-${LEAD}))`;
  const loopAt = 46, crossfade = 2;
  console.log(`roll ${height}px, scroll ${scroll.toFixed(1)}s, total ${duration.toFixed(2)}s`);

  execFileSync('ffmpeg', ['-v', 'error', '-y',
    '-loop', '1', '-framerate', String(FPS), '-i', join(work, 'bg.png'),
    '-loop', '1', '-framerate', String(FPS), '-i', join(work, 'roll.png'),
    '-i', music, '-i', music,
    '-filter_complex', [
      `[0][1]overlay=x=0:y='${y}':eval=frame,trim=duration=${duration},fade=t=in:d=${FADE_IN},fade=t=out:st=${(duration - FADE_OUT).toFixed(2)}:d=${FADE_OUT},format=yuv420p[v]`,
      // The theme is 48 s; a second pass crossfades in when the roll runs longer.
      `[2]atrim=0:${loopAt}[a1];[3]atrim=${crossfade}:48,asetpts=PTS-STARTPTS[a2];[a1][a2]acrossfade=d=${crossfade}[am]`,
      `[am]atrim=0:${duration},afade=t=out:st=${(duration - 3).toFixed(2)}:d=3[a]`,
    ].join(';'),
    '-map', '[v]', '-map', '[a]', '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-g', String(FPS * 10), '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k', out + '.mp4']);
  // Poster: the first frame once the title is on screen.
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '3', '-i', out + '.mp4', '-frames:v', '1', '-vf', 'scale=640:-1', '-q:v', '70', out + '.webp']);
} finally {
  rmSync(work, { recursive: true, force: true });
}
