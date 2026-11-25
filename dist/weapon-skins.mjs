// Weapon skins (patterned wraps over the polymer furniture) and decals (wide side prints).
// Skins are drawn as seamless tiles and projected triplanar in the shader, so the pattern
// keeps one scale across every part, whatever that part's UVs.
import * as THREE from './vendor/three.module.js';
import { WEAPON_DECALS, WEAPON_SKINS } from './weapon-mods.mjs';

const TAU = Math.PI * 2;
// Tile size in metres-per-repeat terms: the shader multiplies object space by `scale`.
const SKIN_LOOK = {
  none: { scale: 9, roughness: .52, metalness: .18 },
  tiger: { scale: 6, roughness: .48, metalness: .1 },
  zebra: { scale: 6, roughness: .45, metalness: .1 },
  winter: { scale: 7, roughness: .62, metalness: .08 },
  camo: { scale: 6, roughness: .66, metalness: .06 },
  digital: { scale: 7, roughness: .6, metalness: .08 },
  cyberpunk: { scale: 8, roughness: .3, metalness: .35, glow: .9 },
  carbon: { scale: 22, roughness: .28, metalness: .3 },
  molten: { scale: 6, roughness: .74, metalness: .05, glow: 1.1 },
  bloodstream: { scale: 6, roughness: .42, metalness: .08 },
  neural: { scale: 7, roughness: .36, metalness: .2, glow: .85 },
  outbreak: { scale: 6, roughness: .5, metalness: .08 },
  prismatic: { scale: 5, roughness: .16, metalness: .75, glow: .35 },
};

function randomSource(seed) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// Smooth noise that tiles over [0, 1): a sum of waves with whole-number frequencies.
function tilingNoise(seed, waves = 8, low = 1, high = 4) {
  const random = randomSource(seed);
  const terms = Array.from({ length: waves }, () => {
    const kx = Math.round(low + random() * (high - low)) * (random() < .5 ? -1 : 1);
    const ky = Math.round(random() * high) * (random() < .5 ? -1 : 1);
    return [kx, ky, random() * TAU, 1 / Math.hypot(kx, ky)];
  });
  const total = terms.reduce((sum, term) => sum + term[3], 0) * .5;
  return (u, v) => terms.reduce((sum, [kx, ky, phase, amplitude]) =>
    sum + amplitude * Math.sin(TAU * (kx * u + ky * v) + phase), 0) / total;
}

const smooth = (edge0, edge1, value) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a.map((channel, index) => channel + (b[index] - channel) * t);
const hex = value => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

function fillPixels(context, size, shade) {
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = shade(x / size, y / size, x, y);
      const index = (y * size + x) * 4;
      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = b;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

// Layered blotch camouflage: each colour after the first covers where its noise is high.
function blotches(context, size, colors, seed, cell = 0) {
  const fields = colors.slice(1).map((_, index) => tilingNoise(seed + index * 97, 9, 1, 4));
  const limits = [-.05, .2, .42];
  fillPixels(context, size, (u, v) => {
    const qu = cell ? Math.floor(u * cell) / cell : u;
    const qv = cell ? Math.floor(v * cell) / cell : v;
    let color = colors[0];
    fields.forEach((field, index) => {
      const value = field(qu, qv);
      const t = cell ? Number(value > limits[index]) : smooth(limits[index] - .03, limits[index] + .03, value);
      color = mix(color, colors[index + 1], t);
    });
    return color;
  });
}

export function drawSkin(context, size, id) {
  if (id === 'tiger') {
    const warp = tilingNoise(31, 8, 1, 3);
    const width = tilingNoise(77, 6, 1, 3);
    const tone = tilingNoise(5, 6, 1, 2);
    fillPixels(context, size, (u, v) => {
      const base = mix([222, 112, 28], [244, 170, 74], smooth(-.6, .8, tone(u, v)));
      const stripe = Math.sin(TAU * 6 * u + 3.2 * warp(u, v));
      const limit = .25 + .45 * smooth(-.8, .8, width(u, v));
      return mix(base, [20, 14, 10], smooth(limit - .08, limit + .08, stripe));
    });
  } else if (id === 'zebra') {
    const warp = tilingNoise(12, 9, 1, 3);
    const pinch = tilingNoise(40, 5, 1, 2);
    fillPixels(context, size, (u, v) => {
      const band = Math.sin(TAU * 5 * v + 3.8 * warp(u, v)) + .35 * pinch(u, v);
      return mix([236, 232, 222], [18, 18, 20], smooth(-.1, .1, band));
    });
  } else if (id === 'winter') {
    blotches(context, size, [[233, 239, 242], [176, 191, 201], [112, 128, 141], [58, 66, 76]], 401);
  } else if (id === 'camo') {
    blotches(context, size, [[138, 134, 88], [76, 92, 46], [104, 78, 48], [36, 35, 28]], 911);
  } else if (id === 'digital') {
    blotches(context, size, [[158, 161, 163], [112, 116, 120], [76, 80, 84], [38, 40, 43]], 233, 32);
  } else if (id === 'carbon') {
    const cell = 16;
    fillPixels(context, size, (u, v, x, y) => {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const across = ((cx + cy) & 3) < 2;
      const f = ((across ? y : x) % cell) / cell;
      const fiber = Math.sin((across ? x : y) * 2.6) * 3;
      const sheen = Math.sin(Math.PI * f) * (across ? 46 : 30) + fiber;
      return [24 + sheen * .9, 26 + sheen * .95, 30 + sheen];
    });
  } else if (id === 'molten') {
    const random = randomSource(613);
    const seeds = Array.from({ length: 16 }, () => [random(), random()]);
    const grain = tilingNoise(88, 8, 2, 6);
    fillPixels(context, size, (u, v) => {
      let first = 9;
      let second = 9;
      for (const [sx, sy] of seeds) {
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const d = Math.hypot(u - sx - ox, v - sy - oy);
            if (d < first) [first, second] = [d, first];
            else if (d < second) second = d;
          }
        }
      }
      const edge = second - first;
      const rock = mix([22, 18, 17], [52, 40, 36], smooth(-.6, .9, grain(u, v)));
      const heat = Math.exp(-edge * 55);
      const crack = smooth(.022, .006, edge);
      return mix(mix(rock, [120, 22, 6], heat * .7), [255, 196, 90], crack);
    });
  } else if (id === 'cyberpunk') {
    context.fillStyle = '#120a22';
    context.fillRect(0, 0, size, size);
    const cells = 8;
    const step = size / cells;
    context.strokeStyle = '#ff2bd648';
    context.lineWidth = Math.max(1, size / 256);
    for (let i = 0; i <= cells; i++) {
      context.beginPath();
      context.moveTo(i * step, 0);
      context.lineTo(i * step, size);
      context.moveTo(0, i * step);
      context.lineTo(size, i * step);
      context.stroke();
    }
    const random = randomSource(2077);
    context.lineCap = context.lineJoin = 'round';
    for (let cx = 0; cx < cells; cx++) {
      for (let cy = 0; cy < cells; cy++) {
        if (random() < .35) continue;
        const color = random() < .55 ? '#2af0ff' : '#ff3bd9';
        const x0 = cx * step + step * (.2 + random() * .2);
        const y0 = cy * step + step * (.2 + random() * .6);
        const x1 = cx * step + step * (.6 + random() * .2);
        const y1 = cy * step + step * (.2 + random() * .6);
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = size / 128;
        context.beginPath();
        context.moveTo(x0, y0);
        context.lineTo(x0, y1);
        context.lineTo(x1, y1);
        context.stroke();
        for (const [px, py] of [[x0, y0], [x1, y1]]) {
          context.beginPath();
          context.arc(px, py, size / 80, 0, TAU);
          context.fill();
        }
      }
    }
  } else if (id === 'bloodstream') {
    // Biconcave red cells (a ring with a darker dimple) drifting over pale plasma.
    const tone = tilingNoise(17, 6, 1, 3);
    fillPixels(context, size, (u, v) => mix([238, 200, 170], [226, 178, 148], smooth(-.6, .8, tone(u, v))));
    const random = randomSource(1201);
    for (let i = 0; i < 26; i++) {
      const x = random() * size, y = random() * size, r = size * (.045 + random() * .035), tilt = random() * Math.PI;
      for (const [ox, oy] of [[0, 0], [-size, 0], [size, 0], [0, -size], [0, size]]) {
        context.save();
        context.translate(x + ox, y + oy); context.rotate(tilt); context.scale(1, .72 + random() * .2);
        const g = context.createRadialGradient(0, 0, r * .15, 0, 0, r);
        g.addColorStop(0, '#7a0f14'); g.addColorStop(.45, '#b3202a'); g.addColorStop(.8, '#d8363a'); g.addColorStop(1, '#8a1318');
        context.fillStyle = g;
        context.beginPath(); context.arc(0, 0, r, 0, TAU); context.fill();
        context.restore();
      }
    }
  } else if (id === 'neural') {
    // Dark tissue: each neuron sends glowing axons to its nearest neighbours, wrapping at the
    // edges so the tile repeats seamlessly.
    context.fillStyle = '#0b0a1c';
    context.fillRect(0, 0, size, size);
    const random = randomSource(3301);
    const cells = Array.from({ length: 22 }, () => [random() * size, random() * size, random() < .5 ? '#ff4fd8' : '#4fc8ff']);
    const offsets = [-size, 0, size];
    context.lineCap = 'round';
    for (const [x, y, color] of cells) {
      const near = cells.flatMap(([tx, ty]) => offsets.flatMap(ox => offsets.map(oy => [tx + ox, ty + oy])))
        .map(([tx, ty]) => [tx, ty, Math.hypot(tx - x, ty - y)]).filter(([, , d]) => d > 1).sort((p, q) => p[2] - q[2]).slice(0, 3);
      for (const [tx, ty] of near) {
        const bend = (random() - .5) * size * .12;
        for (const ox of offsets) for (const oy of offsets) {
          const path = () => { context.beginPath(); context.moveTo(x + ox, y + oy); context.quadraticCurveTo((x + tx) / 2 + ox + bend, (y + ty) / 2 + oy - bend, tx + ox, ty + oy); };
          path(); context.strokeStyle = color + '40'; context.lineWidth = size / 60; context.stroke();
          path(); context.strokeStyle = color; context.lineWidth = size / 240; context.stroke();
        }
      }
    }
    for (const [x, y] of cells) for (const ox of offsets) for (const oy of offsets) {
      const cx = x + ox, cy = y + oy, r = size / 26;
      const g = context.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.35, '#ffd1f6'); g.addColorStop(1, '#ff4fd800');
      context.fillStyle = g; context.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  } else if (id === 'outbreak') {
    // Spiked capsids, like the virions on the briefings, over hazard green.
    const tone = tilingNoise(905, 7, 1, 3);
    fillPixels(context, size, (u, v) => mix([46, 74, 30], [104, 150, 40], smooth(-.7, .9, tone(u, v))));
    const random = randomSource(907);
    for (let i = 0; i < 16; i++) {
      const x = random() * size, y = random() * size, r = size * (.04 + random() * .035);
      for (const [ox, oy] of [[0, 0], [-size, 0], [size, 0], [0, -size], [0, size]]) {
        const cx = x + ox, cy = y + oy;
        context.strokeStyle = '#e6463a'; context.fillStyle = '#ff6a4e'; context.lineWidth = r * .18;
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * TAU;
          context.beginPath(); context.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          context.lineTo(cx + Math.cos(a) * r * 1.45, cy + Math.sin(a) * r * 1.45); context.stroke();
          context.beginPath(); context.arc(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5, r * .16, 0, TAU); context.fill();
        }
        const g = context.createRadialGradient(cx - r * .3, cy - r * .3, r * .1, cx, cy, r);
        g.addColorStop(0, '#f4e8d6'); g.addColorStop(1, '#9a8a74');
        context.fillStyle = g; context.beginPath(); context.arc(cx, cy, r, 0, TAU); context.fill();
      }
    }
  } else if (id === 'prismatic') {
    // Holographic foil: rainbow bands bent by noise, with fine diffraction lines.
    const warp = tilingNoise(4242, 8, 1, 3);
    fillPixels(context, size, (u, v, x, y) => {
      const phase = (u + v) * 2 + .6 * warp(u, v);
      const r = 200 + 55 * Math.sin(TAU * phase), g = 200 + 55 * Math.sin(TAU * phase + 2.1), b = 210 + 45 * Math.sin(TAU * phase + 4.2);
      const line = (x + y) % 6 < 1 ? 18 : 0;
      return [Math.min(255, r + line), Math.min(255, g + line), Math.min(255, b + line)];
    });
  } else {
    // Plain polymer, as a neutral swatch.
    context.fillStyle = '#bdb8ab';
    context.fillRect(0, 0, size, size);
  }
}

const TEXT_FONT = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif';

// A wide print, `width` by `height`, on a transparent background.
export function drawDecal(context, width, height, id) {
  const decal = WEAPON_DECALS[id];
  context.clearRect(0, 0, width, height);
  if (!decal?.ink) return;
  const s = height / 128;
  context.save();
  context.lineCap = context.lineJoin = 'round';
  if (id === 'racing') {
    context.fillStyle = decal.ink;
    context.fillRect(0, 30 * s, width, 26 * s);
    context.fillRect(0, 72 * s, width, 26 * s);
    context.fillStyle = decal.accent;
    context.fillRect(0, 60 * s, width, 8 * s);
  } else if (id === 'flames') {
    const random = randomSource(451);
    for (const [color, scale] of [[decal.accent, 1], [decal.ink, .62]]) {
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, 18 * s);
      let x = 0;
      for (let i = 0; i < 6; i++) {
        const reach = (90 + random() * 70) * s * scale * (1 + i * .25);
        const y = (20 + i * 17) * s;
        context.quadraticCurveTo(x + reach * .4, y - 6 * s, x + reach, y + 2 * s);
        context.quadraticCurveTo(x + reach * .45, y + 6 * s, x, y + 14 * s);
      }
      context.lineTo(0, 112 * s);
      context.closePath();
      context.fill();
    }
  } else if (id === 'tally') {
    context.strokeStyle = decal.ink;
    context.lineWidth = 9 * s;
    const random = randomSource(7);
    for (let group = 0; group < 4; group++) {
      const left = (30 + group * 115) * s;
      for (let i = 0; i < 4; i++) {
        const x = left + i * 18 * s;
        context.beginPath();
        context.moveTo(x + (random() - .5) * 4 * s, 26 * s);
        context.lineTo(x + (random() - .5) * 4 * s, 102 * s);
        context.stroke();
      }
      context.beginPath();
      context.moveTo(left - 12 * s, 92 * s);
      context.lineTo(left + 68 * s, 36 * s);
      context.stroke();
    }
  } else if (id === 'chevrons') {
    context.beginPath();
    context.rect(0, 26 * s, width, 76 * s);
    context.clip();
    context.fillStyle = decal.accent;
    context.fillRect(0, 26 * s, width, 76 * s);
    context.fillStyle = decal.ink;
    for (let x = -100 * s; x < width + 100 * s; x += 56 * s) {
      context.beginPath();
      context.moveTo(x, 26 * s);
      context.lineTo(x + 28 * s, 26 * s);
      context.lineTo(x + 28 * s + 76 * s, 102 * s);
      context.lineTo(x + 76 * s, 102 * s);
      context.closePath();
      context.fill();
    }
  } else if (id === 'circuit') {
    const random = randomSource(91);
    context.strokeStyle = decal.ink;
    context.fillStyle = decal.ink;
    context.shadowColor = decal.ink;
    context.shadowBlur = 8 * s;
    context.lineWidth = 5 * s;
    for (let i = 0; i < 9; i++) {
      const y = (22 + random() * 84) * s;
      const x0 = random() * width * .3;
      const x1 = x0 + width * (.25 + random() * .45);
      const bend = (random() < .5 ? -1 : 1) * 18 * s;
      context.beginPath();
      context.moveTo(x0, y);
      context.lineTo(x1, y);
      context.lineTo(x1 + 18 * s, Math.min(118 * s, Math.max(10 * s, y + bend)));
      context.lineTo(Math.min(width - 10 * s, x1 + 80 * s), Math.min(118 * s, Math.max(10 * s, y + bend)));
      context.stroke();
      for (const x of [x0, Math.min(width - 10 * s, x1 + 80 * s)]) {
        context.beginPath();
        context.arc(x, x === x0 ? y : Math.min(118 * s, Math.max(10 * s, y + bend)), 7 * s, 0, TAU);
        context.fill();
      }
    }
  } else if (id === 'barcode') {
    const random = randomSource(1453);
    context.fillStyle = decal.ink;
    let x = 24 * s;
    while (x < width * .62) {
      const bar = (2 + Math.floor(random() * 4) * 3) * s;
      context.fillRect(x, 16 * s, bar, 76 * s);
      x += bar + (3 + Math.floor(random() * 3) * 3) * s;
    }
    context.font = '600 ' + 26 * s + 'px "IBM Plex Mono", monospace';
    context.textBaseline = 'top';
    context.fillText('IMM-0451-7', 24 * s, 96 * s);
    context.font = '800 ' + 54 * s + 'px ' + TEXT_FONT;
    context.textBaseline = 'middle';
    context.fillText('T-CELL ISSUE', width * .66, 64 * s, width * .32);
  } else if (id === 'number') {
    context.fillStyle = decal.ink;
    context.font = '800 ' + 118 * s + 'px ' + TEXT_FONT;
    context.textBaseline = 'middle';
    context.fillText('07', 20 * s, 68 * s);
    context.font = '700 ' + 36 * s + 'px ' + TEXT_FONT;
    context.fillText('IMMUNE SQUAD', 150 * s, 50 * s, width - 170 * s);
    context.fillStyle = decal.accent;
    context.fillRect(150 * s, 78 * s, width - 180 * s, 10 * s);
    // Stencil bridges cut through the numerals.
    context.globalCompositeOperation = 'destination-out';
    context.fillRect(20 * s, 64 * s, 120 * s, 6 * s);
  } else if (id === 'ecg') {
    // An ECG trace with a soft glow, repeating along the whole print.
    context.shadowColor = decal.ink;
    context.shadowBlur = 12 * s;
    context.strokeStyle = decal.accent;
    context.lineWidth = 3 * s;
    context.beginPath(); context.moveTo(0, 64 * s); context.lineTo(width, 64 * s); context.stroke();
    context.strokeStyle = decal.ink;
    context.lineWidth = 8 * s;
    context.beginPath();
    context.moveTo(0, 64 * s);
    for (let x = 0; x < width; x += 170 * s) {
      context.lineTo(x + 40 * s, 64 * s); context.lineTo(x + 52 * s, 48 * s); context.lineTo(x + 62 * s, 64 * s);
      context.lineTo(x + 78 * s, 64 * s); context.lineTo(x + 88 * s, 14 * s); context.lineTo(x + 102 * s, 112 * s);
      context.lineTo(x + 112 * s, 64 * s); context.lineTo(x + 170 * s, 64 * s);
    }
    context.stroke();
  } else if (id === 'blast') {
    // A starburst with shockwave rings spreading toward the muzzle.
    const cx = 80 * s, cy = 64 * s;
    context.fillStyle = decal.accent;
    context.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU, r = (i % 2 ? 26 : 56) * s;
      context.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    context.closePath(); context.fill();
    context.fillStyle = decal.ink;
    context.beginPath(); context.arc(cx, cy, 22 * s, 0, TAU); context.fill();
    context.strokeStyle = decal.ink;
    for (let ring = 0; ring < 5; ring++) {
      context.lineWidth = (9 - ring * 1.4) * s;
      context.globalAlpha = 1 - ring * .16;
      context.beginPath(); context.arc(cx, cy, (80 + ring * 70) * s, -.5, .5); context.stroke();
    }
    context.globalAlpha = 1;
  } else if (id === 'capsids') {
    // Spiked capsids in a row, shrinking toward the muzzle.
    for (let i = 0; i < 6; i++) {
      const r = (34 - i * 3.4) * s, cx = width - (52 + i * 82) * s, cy = 64 * s;
      context.strokeStyle = decal.accent;
      context.lineWidth = 4 * s;
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * TAU + i * .3;
        context.beginPath();
        context.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        context.lineTo(cx + Math.cos(a) * r * 1.38, cy + Math.sin(a) * r * 1.38);
        context.stroke();
        context.fillStyle = decal.accent;
        context.beginPath(); context.arc(cx + Math.cos(a) * r * 1.42, cy + Math.sin(a) * r * 1.42, 4.5 * s, 0, TAU); context.fill();
      }
      context.fillStyle = decal.ink;
      context.beginPath(); context.arc(cx, cy, r, 0, TAU); context.fill();
      context.fillStyle = decal.accent;
      for (const [dx, dy] of [[-.35, -.2], [.3, -.3], [.05, .35]]) {
        context.beginPath(); context.arc(cx + dx * r, cy + dy * r, r * .16, 0, TAU); context.fill();
      }
    }
  } else if (id === 'helix') {
    // Two phase-shifted strands with rungs between them.
    const amp = 34 * s, wave = 150 * s, strand = (phase, x) => 64 * s + Math.sin(x / wave * TAU + phase) * amp;
    context.lineWidth = 4 * s;
    for (let x = 10 * s; x < width; x += 15 * s) {
      context.strokeStyle = Math.round(x / (15 * s)) % 2 ? decal.ink : decal.accent;
      context.globalAlpha = .75;
      context.beginPath(); context.moveTo(x, strand(0, x)); context.lineTo(x, strand(Math.PI, x)); context.stroke();
    }
    context.globalAlpha = 1;
    context.lineWidth = 9 * s;
    for (const [phase, color] of [[0, decal.ink], [Math.PI, decal.accent]]) {
      context.strokeStyle = color;
      context.beginPath();
      for (let x = 0; x <= width; x += 4 * s) context.lineTo(x, strand(phase, x));
      context.stroke();
    }
  } else if (id === 'claws') {
    // Three ragged slashes, a red undercoat showing round each one.
    for (const [color, grow] of [[decal.accent, 1.6], [decal.ink, 1]]) {
      context.fillStyle = color;
      for (let i = 0; i < 3; i++) {
        const x0 = (130 + i * 70) * s, x1 = x0 + 150 * s, y0 = 12 * s, y1 = 116 * s;
        const half = (16 - Math.abs(i - 1) * 4) * s * grow;
        context.beginPath();
        context.moveTo(x0, y1);
        context.quadraticCurveTo((x0 + x1) / 2 - half, (y0 + y1) / 2 - half * .6, x1, y0);
        context.quadraticCurveTo((x0 + x1) / 2 + half, (y0 + y1) / 2 + half * .6, x0, y1);
        context.fill();
      }
    }
  } else if (id === 'pixels') {
    // A pixel grid that thins out toward the muzzle.
    const random = randomSource(2718), cell = 16 * s;
    for (let x = 0; x < width; x += cell) {
      const density = Math.pow(x / width, 1.6);
      for (let y = 16 * s; y < 112 * s; y += cell) {
        if (random() > density) continue;
        context.fillStyle = random() < .7 ? decal.ink : decal.accent;
        context.fillRect(x + s, y + s, cell - 2 * s, cell - 2 * s);
      }
    }
  } else if (id === 'lightning') {
    const random = randomSource(77);
    const points = [[width, 64 * s]];
    for (let x = width - 50 * s; x > 0; x -= (40 + random() * 30) * s) points.push([x, (24 + random() * 80) * s]);
    points.push([0, 64 * s]);
    for (const [color, line, blur] of [[decal.accent, 16, 18], [decal.ink, 6, 8]]) {
      context.strokeStyle = color;
      context.shadowColor = color;
      context.shadowBlur = blur * s;
      context.lineWidth = line * s;
      context.beginPath();
      for (const [x, y] of points) context.lineTo(x, y);
      context.stroke();
    }
  } else if (id === 'stars') {
    const star = (cx, cy, r) => {
      context.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * .45 : r;
        context.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      }
      context.closePath(); context.fill();
    };
    for (const [x, y, r] of [[90, 46, 30], [250, 84, 22], [380, 40, 17], [470, 82, 12]]) {
      const tail = context.createLinearGradient(x * s, 0, (x + 150) * s, 0);
      tail.addColorStop(0, decal.accent); tail.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = tail;
      context.beginPath();
      context.moveTo(x * s, (y - r * .5) * s); context.lineTo((x + 150) * s, y * s); context.lineTo(x * s, (y + r * .5) * s);
      context.fill();
      context.fillStyle = decal.ink;
      star(x * s, y * s, r * s);
    }
  } else if (id === 'caution') {
    // Quarantine tape: a band with diagonal hatching at the ends and a stencilled warning.
    context.fillStyle = decal.accent;
    context.fillRect(0, 22 * s, width, 84 * s);
    context.fillStyle = decal.ink;
    context.fillRect(0, 28 * s, width, 5 * s);
    context.fillRect(0, 95 * s, width, 5 * s);
    context.font = '800 ' + 50 * s + 'px ' + TEXT_FONT;
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillText('CONTAGION · DO NOT CROSS', width / 2, 65 * s, width - 30 * s);
  } else if (id === 'pinstripe') {
    // A long hand-painted loop with a curl inside each end and a diamond at the centre.
    const left = 40 * s, right = width - 40 * s, r = 16 * s, cy = 64 * s;
    context.strokeStyle = decal.ink;
    context.lineWidth = 4 * s;
    context.beginPath();
    context.moveTo(left, cy - r);
    context.lineTo(right, cy - r);
    context.arc(right, cy, r, -Math.PI / 2, Math.PI / 2);
    context.lineTo(left, cy + r);
    context.arc(left, cy, r, Math.PI / 2, Math.PI * 1.5);
    context.stroke();
    for (const [x, dir] of [[left, 1], [right, -1]]) {
      context.beginPath();
      for (let t = 0; t <= 1; t += .05) {
        const a = t * TAU * 1.2, d = (1 - t) * r * .7;
        context.lineTo(x + dir * (r * .2 + Math.cos(a) * d), cy + Math.sin(a) * d);
      }
      context.stroke();
    }
    context.fillStyle = decal.accent;
    context.beginPath();
    context.moveTo(width / 2, 40 * s); context.lineTo(width / 2 + 24 * s, 64 * s); context.lineTo(width / 2, 88 * s); context.lineTo(width / 2 - 24 * s, 64 * s);
    context.closePath(); context.fill();
    context.fillStyle = decal.ink;
    context.beginPath(); context.arc(width / 2, cy, 6 * s, 0, TAU); context.fill();
  } else if (id === 'crosses') {
    for (let i = 0; i < 5; i++) {
      const cx = (56 + i * 100) * s, cy = 64 * s, arm = 15 * s, reach = 38 * s;
      context.fillStyle = decal.ink;
      context.beginPath(); context.arc(cx, cy, 46 * s, 0, TAU); context.fill();
      context.fillStyle = decal.accent;
      context.fillRect(cx - arm, cy - reach, arm * 2, reach * 2);
      context.fillRect(cx - reach, cy - arm, reach * 2, arm * 2);
    }
  } else if (id === 'resonance') {
    // Stacked sine waves that grow toward the muzzle, like a resonance pulse.
    for (let line = 0; line < 4; line++) {
      context.strokeStyle = line % 2 ? decal.accent : decal.ink;
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = 6 * s;
      context.lineWidth = (6 - line) * s;
      context.beginPath();
      for (let x = 0; x <= width; x += 3 * s) {
        const amp = (8 + (1 - x / width) * 34) * s * (1 - line * .18);
        context.lineTo(x, 64 * s + Math.sin(x / (38 * s) + line * .9) * amp);
      }
      context.stroke();
    }
  } else if (id === 'splatter') {
    const random = randomSource(66);
    for (const color of [decal.ink, decal.accent, '#b7f24a']) {
      context.fillStyle = color;
      for (let blob = 0; blob < 3; blob++) {
        const cx = random() * width;
        const cy = (30 + random() * 68) * s;
        const radius = (14 + random() * 20) * s;
        context.beginPath();
        context.arc(cx, cy, radius, 0, TAU);
        context.fill();
        for (let drop = 0; drop < 9; drop++) {
          const angle = random() * TAU;
          const distance = radius * (1.1 + random() * 1.6);
          context.beginPath();
          context.arc(cx + Math.cos(angle) * distance, Math.min(122 * s, Math.max(6 * s, cy + Math.sin(angle) * distance * .6)),
            (2 + random() * 6) * s, 0, TAU);
          context.fill();
        }
      }
    }
  }
  context.restore();
}

const skinTextures = {};
export function skinTexture(id) {
  if (skinTextures[id]) return skinTextures[id];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  drawSkin(canvas.getContext('2d'), 256, id);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return (skinTextures[id] = map);
}

const decalTextures = {};
export function decalTexture(id) {
  if (decalTextures[id]) return decalTextures[id];
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  drawDecal(canvas.getContext('2d'), 512, 128, id);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return (decalTextures[id] = map);
}

// Adds a shader patch to a material, keeping any patches it already has.
export function extendShader(material, key, patch) {
  const previous = material.onBeforeCompile;
  const keys = [...(material.userData.shaderKeys ?? []), key];
  material.userData.shaderKeys = keys;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    patch(shader);
  };
  material.customProgramCacheKey = () => keys.join('+');
  return material;
}

// How each weapon material ages: baked occlusion darkens crevices, and the baked
// edge mask wears the coating back to `color` with its own roughness and metalness.
// `edge` wears sharp edges procedurally too, wherever the surface normal turns quickly on screen,
// so modelled bevels on every part (baked atlas or not) catch a bright worn line.
const WEAR = {
  shell: { color: 0xc9c4b8, amount: .45, rough: .62, metal: .05, occlusion: .85, edge: .3 },
  dark: { color: 0x9a9c9c, amount: .75, rough: .32, metal: .9, occlusion: .9, edge: .6 },
  steel: { color: 0xd4d7d8, amount: .55, rough: .18, metal: 1, occlusion: .85, edge: .45 },
  edge: { color: 0xe3e5e5, amount: .35, rough: .16, metal: 1, occlusion: .7, edge: .3 },
  rubber: { color: 0x2a2b2d, amount: .25, rough: .9, metal: 0, occlusion: .9, edge: .1 },
};

// Weathered materials read a baked atlas (R occlusion, G worn edges) through a
// `weatheringUv` attribute. The Blender models carry their own; procedural parts point at
// the atlas corner the bake leaves clear: no occlusion, no wear.
const CLEAR_CORNER = [.99, .01];
const CLEAR_ATLAS = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
CLEAR_ATLAS.needsUpdate = true;

export function ensureWeathering(root) {
  root.traverse(part => {
    const geometry = part.geometry;
    if (!part.isMesh || !geometry || geometry.getAttribute('weatheringUv')) return;
    const count = geometry.getAttribute('position').count;
    const values = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) values.set(CLEAR_CORNER, i * 2);
    geometry.setAttribute('weatheringUv', new THREE.BufferAttribute(values, 2));
  });
}

export function setWeatheringAtlas(material, atlas) {
  if (material.userData.weatheringAtlas) material.userData.weatheringAtlas.value = atlas;
}

export function makeWeathered(material, role) {
  const wear = WEAR[role];
  if (!wear || material.userData.weathered) return material;
  material.userData.weathered = true;
  const atlas = { value: CLEAR_ATLAS };
  material.userData.weatheringAtlas = atlas;
  const uniforms = {
    weatheringAtlas: atlas,
    weatherColor: { value: new THREE.Color(wear.color) },
    weatherAmount: { value: wear.amount },
    weatherRough: { value: wear.rough },
    weatherMetal: { value: wear.metal },
    weatherOcclusion: { value: wear.occlusion },
    weatherEdge: { value: wear.edge },
  };
  return extendShader(material, 'weathered', shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 weatheringUv;\nvarying vec2 vWeatheringUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWeatheringUv = weatheringUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWeatheringUv;\nuniform sampler2D weatheringAtlas;\n' +
        'uniform vec3 weatherColor;\nuniform float weatherAmount;\nuniform float weatherRough;\nuniform float weatherMetal;\n' +
        'uniform float weatherOcclusion;\nuniform float weatherEdge;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' +
        'vec2 weathering = texture2D(weatheringAtlas, vWeatheringUv).rg;\n' +
        '#ifndef FLAT_SHADED\nfloat weatherCurve = smoothstep(0.06, 0.32, length(fwidth(normalize(vNormal))));\n#else\nfloat weatherCurve = 0.0;\n#endif\n' +
        'float weatherWear = clamp(max(weathering.g * weatherAmount, weatherCurve * weatherEdge), 0.0, 1.0);\n' +
        'diffuseColor.rgb = mix(diffuseColor.rgb, weatherColor, weatherWear);\n' +
        'diffuseColor.rgb *= mix(1.0, weathering.r, weatherOcclusion);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' +
        'roughnessFactor = mix(roughnessFactor, weatherRough, weatherWear);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' +
        'metalnessFactor = mix(metalnessFactor, weatherMetal, weatherWear);');
  });
}

// Patches a polymer material to sample its colour (and glow) maps triplanar in object space.
export function makeSkinnable(material) {
  const scale = { value: SKIN_LOOK.none.scale };
  material.userData.skinScale = scale;
  const triplanar = name => '(texture2D(' + name + ', skinPoint.zy) * skinWeights.x + texture2D(' + name +
    ', skinPoint.xz) * skinWeights.y + texture2D(' + name + ', skinPoint.xy) * skinWeights.z)';
  const setup = 'vec3 skinWeights = pow(abs(normalize(vSkinNormal)), vec3(4.0));\n' +
    'skinWeights /= skinWeights.x + skinWeights.y + skinWeights.z;\n' +
    'vec3 skinPoint = vSkinPosition * skinScale;\n';
  return extendShader(material, 'weapon-skin', shader => {
    shader.uniforms.skinScale = scale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPosition;\nvarying vec3 vSkinNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPosition = position;\nvSkinNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float skinScale;\nvarying vec3 vSkinPosition;\nvarying vec3 vSkinNormal;')
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n{\n' + setup + 'diffuseColor *= ' + triplanar('map') + ';\n}\n#endif')
      .replace('#include <emissivemap_fragment>',
        '#ifdef USE_EMISSIVEMAP\n{\n' + setup + 'totalEmissiveRadiance *= ' + triplanar('emissiveMap') + '.rgb;\n}\n#endif');
  });
}

// Dresses a skinnable polymer material for a build: the plain finish or a patterned skin.
export function dressShell(material, skin, finishColor, plainMap) {
  const look = SKIN_LOOK[skin] ?? SKIN_LOOK.none;
  const plain = skin === 'none' || !Object.hasOwn(WEAPON_SKINS, skin);
  const map = plain ? plainMap : skinTexture(skin);
  const glow = look.glow ? map : null;
  if (Boolean(material.emissiveMap) !== Boolean(glow)) material.needsUpdate = true;
  material.map = map;
  material.emissiveMap = glow;
  material.color.setHex(plain ? finishColor : 0xffffff);
  material.emissive.setHex(glow ? 0xffffff : 0x000000);
  material.emissiveIntensity = look.glow ?? 1;
  material.roughness = look.roughness;
  material.metalness = look.metalness;
  material.userData.skinScale.value = look.scale;
}
