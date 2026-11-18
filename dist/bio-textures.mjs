import * as THREE from './vendor/three.module.js';

// Tileable, photographic-style tissue surfaces generated at load time: red blood cell membrane,
// intestinal mucosa, bacterial biofilm, neural tissue and leukocyte membrane. Each returns an sRGB
// albedo map and a tangent-space normal map. Every field wraps, so the maps tile without seams.

const SIZE = 512;
const cache = new Map();

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Periodic value noise on a gx by gy lattice, sampled across the whole texture.
function valueNoise(random, gx, gy) {
  const lattice = new Float32Array(gx * gy).map(() => random());
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const fy = y / SIZE * gy;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const row0 = (y0 % gy) * gx;
    const row1 = ((y0 + 1) % gy) * gx;
    for (let x = 0; x < SIZE; x++) {
      const fx = x / SIZE * gx;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const x1 = (x0 + 1) % gx;
      const a = lattice[row0 + x0] + (lattice[row0 + x1] - lattice[row0 + x0]) * sx;
      const b = lattice[row1 + x0] + (lattice[row1 + x1] - lattice[row1 + x0]) * sx;
      out[y * SIZE + x] = a + (b - a) * sy;
    }
  }
  return out;
}

function fbm(random, base, octaves, gain = .5, stretch = 1) {
  const out = new Float32Array(SIZE * SIZE);
  let amplitude = 1;
  let grid = base;
  for (let octave = 0; octave < octaves; octave++) {
    const layer = valueNoise(random, grid, Math.max(1, Math.round(grid * stretch)));
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amplitude;
    amplitude *= gain;
    grid *= 2;
  }
  return normalize(out);
}

function normalize(field) {
  let min = Infinity, max = -Infinity;
  for (const value of field) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - min) / range;
  return field;
}

// Wrapped cellular noise: distance to the nearest cell seed and the gap to the second nearest.
function worley(random, cells, jitter = 1) {
  const seeds = new Float32Array(cells * cells * 2).map(() => .5 + (random() - .5) * jitter);
  const near = new Float32Array(SIZE * SIZE);
  const edge = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const fy = (y + .5) / SIZE * cells;
    const cy = Math.floor(fy);
    for (let x = 0; x < SIZE; x++) {
      const fx = (x + .5) / SIZE * cells;
      const cx = Math.floor(fx);
      let f1 = 9, f2 = 9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox, gy = cy + oy;
          const index = (((gy % cells) + cells) % cells * cells + ((gx % cells) + cells) % cells) * 2;
          const d = Math.hypot(fx - gx - seeds[index], fy - gy - seeds[index + 1]);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      }
      near[y * SIZE + x] = f1;
      edge[y * SIZE + x] = f2 - f1;
    }
  }
  return { near, edge };
}

function ramp(stops, value, out, offset) {
  let i = 1;
  while (i < stops.length - 1 && value > stops[i][0]) i++;
  const [t0, c0] = stops[i - 1];
  const [t1, c1] = stops[i];
  const k = Math.min(1, Math.max(0, (value - t0) / (t1 - t0 || 1)));
  out[offset] = c0[0] + (c1[0] - c0[0]) * k;
  out[offset + 1] = c0[1] + (c1[1] - c0[1]) * k;
  out[offset + 2] = c0[2] + (c1[2] - c0[2]) * k;
}

const clamp01 = value => Math.min(1, Math.max(0, value));

const RECIPES = {
  'red-cell'(random, color) {
    const broad = fbm(random, 3, 3, .55);
    const fine = fbm(random, 32, 3, .6);
    const height = new Float32Array(SIZE * SIZE);
    const stops = [[0, [96, 8, 16]], [.45, [158, 22, 30]], [.75, [196, 46, 48]], [1, [222, 92, 86]]];
    for (let i = 0; i < height.length; i++) {
      ramp(stops, broad[i] * .62 + fine[i] * .38, color, i * 4);
      height[i] = broad[i] * .7 + fine[i] * .3;
    }
    return { height, strength: 3.2 };
  },
  mucosa(random, color) {
    const { near, edge } = worley(random, 22, .9);
    const mottling = fbm(random, 4, 4, .55);
    const fine = fbm(random, 64, 2, .5);
    const veins = fbm(random, 3, 4, .55, 4);
    const height = new Float32Array(SIZE * SIZE);
    const stops = [[0, [122, 42, 52]], [.35, [196, 98, 104]], [.7, [232, 146, 138]], [1, [248, 196, 182]]];
    for (let i = 0; i < height.length; i++) {
      const pits = clamp01(1 - near[i] * 1.9) ** 2;
      const walls = clamp01(edge[i] * 7) ** .6;
      const capillary = clamp01((veins[i] - .62) * 6);
      ramp(stops, walls * .22 + mottling[i] * .55 + fine[i] * .23, color, i * 4);
      for (let c = 0; c < 3; c++) {
        const blood = [150, 18, 34][c];
        color[i * 4 + c] = (color[i * 4 + c] * (1 - .45 * capillary) + blood * .45 * capillary) * (1 - .35 * pits);
      }
      height[i] = walls * .6 + mottling[i] * .3 - pits * .5;
    }
    return { height, strength: 4.5 };
  },
  biofilm(random, color) {
    const { near, edge } = worley(random, 34, 1);
    const slime = fbm(random, 3, 4, .6);
    const specks = fbm(random, 96, 2, .5);
    const height = new Float32Array(SIZE * SIZE);
    const stops = [[0, [46, 36, 18]], [.35, [98, 84, 36]], [.6, [150, 128, 58]], [.85, [186, 160, 92]], [1, [214, 196, 140]]];
    for (let i = 0; i < height.length; i++) {
      const cells = clamp01(1 - near[i] * 1.6);
      const speck = clamp01((specks[i] - .7) * 5);
      ramp(stops, slime[i] * .5 + cells * .35 + clamp01(edge[i] * 2) * .15, color, i * 4);
      for (let c = 0; c < 3; c++) color[i * 4 + c] = color[i * 4 + c] * (1 - .4 * speck) + [92, 120, 52][c] * .4 * speck;
      height[i] = cells * .55 + slime[i] * .45;
    }
    return { height, strength: 5 };
  },
  neural(random, color) {
    const fibres = fbm(random, 6, 5, .62, 7);
    const cross = fbm(random, 30, 3, .6, .2);
    const body = fbm(random, 3, 3, .55);
    const grain = fbm(random, 64, 2, .5);
    const height = new Float32Array(SIZE * SIZE);
    const stops = [[0, [52, 34, 66]], [.4, [112, 84, 128]], [.7, [170, 140, 176]], [1, [226, 206, 226]]];
    for (let i = 0; i < height.length; i++) {
      ramp(stops, fibres[i] * .45 + cross[i] * .15 + body[i] * .25 + grain[i] * .15, color, i * 4);
      height[i] = fibres[i] * .7 + grain[i] * .3;
    }
    return { height, strength: 4 };
  },
  leukocyte(random, color) {
    const { near } = worley(random, 40, 1);
    const ruffles = fbm(random, 6, 4, .6, 2.2);
    const body = fbm(random, 3, 3, .55);
    const height = new Float32Array(SIZE * SIZE);
    const stops = [[0, [150, 140, 150]], [.4, [206, 196, 198]], [.75, [236, 228, 222]], [1, [252, 248, 240]]];
    for (let i = 0; i < height.length; i++) {
      const granules = clamp01(1 - near[i] * 2.2) ** 1.5;
      ramp(stops, body[i] * .45 + ruffles[i] * .3 + granules * .25, color, i * 4);
      height[i] = ruffles[i] * .5 + granules * .4 + body[i] * .1;
    }
    return { height, strength: 4 };
  },
};

function dataTexture(data, srgb) {
  const texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function build(name) {
  const random = seeded([...name].reduce((sum, char) => sum * 33 + char.charCodeAt(0), 5381) >>> 0);
  const color = new Float32Array(SIZE * SIZE * 4);
  const { height, strength } = RECIPES[name](random, color);
  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const normal = new Uint8Array(SIZE * SIZE * 4);
  const h = (x, y) => height[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      for (let c = 0; c < 3; c++) albedo[i * 4 + c] = Math.min(255, Math.max(0, color[i * 4 + c]));
      albedo[i * 4 + 3] = 255;
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      normal[i * 4] = 127.5 * (1 - dx / length);
      normal[i * 4 + 1] = 127.5 * (1 + dy / length);
      normal[i * 4 + 2] = 127.5 * (1 + 1 / length);
      normal[i * 4 + 3] = 255;
    }
  }
  return { albedo, normal };
}

// Returns a texture for `name` (or its normal map) with its own repeat; pixel data is shared.
export function bioTexture(name, repeat = [1, 1], isNormal = false) {
  if (!cache.has(name)) cache.set(name, build(name));
  const key = name + (isNormal ? ':normal:' : ':albedo:') + repeat.join('x');
  if (!cache.has(key)) {
    const pixels = cache.get(name);
    const texture = dataTexture(isNormal ? pixels.normal : pixels.albedo, !isNormal);
    texture.repeat.set(...repeat);
    cache.set(key, texture);
  }
  return cache.get(key);
}
