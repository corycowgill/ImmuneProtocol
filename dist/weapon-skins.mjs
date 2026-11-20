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

// Patches a polymer material to sample its colour (and glow) maps triplanar in object space.
export function makeSkinnable(material) {
  const scale = { value: SKIN_LOOK.none.scale };
  material.userData.skinScale = scale;
  const triplanar = name => '(texture2D(' + name + ', skinPoint.zy) * skinWeights.x + texture2D(' + name +
    ', skinPoint.xz) * skinWeights.y + texture2D(' + name + ', skinPoint.xy) * skinWeights.z)';
  const setup = 'vec3 skinWeights = pow(abs(normalize(vSkinNormal)), vec3(4.0));\n' +
    'skinWeights /= skinWeights.x + skinWeights.y + skinWeights.z;\n' +
    'vec3 skinPoint = vSkinPosition * skinScale;\n';
  material.onBeforeCompile = shader => {
    shader.uniforms.skinScale = scale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPosition;\nvarying vec3 vSkinNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPosition = position;\nvSkinNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float skinScale;\nvarying vec3 vSkinPosition;\nvarying vec3 vSkinNormal;')
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n{\n' + setup + 'diffuseColor *= ' + triplanar('map') + ';\n}\n#endif')
      .replace('#include <emissivemap_fragment>',
        '#ifdef USE_EMISSIVEMAP\n{\n' + setup + 'totalEmissiveRadiance *= ' + triplanar('emissiveMap') + '.rgb;\n}\n#endif');
  };
  material.customProgramCacheKey = () => 'weapon-skin';
  return material;
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
