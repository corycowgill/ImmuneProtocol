// Procedural textures for the arenas: the soft glow sprite, cloud and tissue tiles, normal maps
// derived from a tile, membrane maps for organ tissue, and the reflection environment.
import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;

export function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(size, draw) {
  const surface = document.createElement('canvas');
  surface.width = surface.height = size;
  const context = surface.getContext('2d');
  draw(context, size);
  return new THREE.CanvasTexture(surface);
}

export function configureTile(texture, anisotropy, color = false) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function glowTexture() {
  return canvasTexture(128, (context, size) => {
    const middle = size / 2;
    const gradient = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.13, 'rgba(255,255,255,.75)');
    gradient.addColorStop(0.37, 'rgba(255,255,255,.27)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  });
}

// A soft contact shadow: a broad dark disc that only fades out over its outer half, so the shadow
// under a hovering pathogen reads as a pool rather than a pinpoint.
export function contactShadowTexture() {
  return canvasTexture(128, (context, size) => {
    const middle = size / 2;
    const gradient = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,.86)');
    gradient.addColorStop(0.62, 'rgba(255,255,255,.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  });
}

export function cloudTexture() {
  return canvasTexture(256, (context, size) => {
    const random = randomSource(506);
    for (let i = 0; i < 58; i++) {
      const angle = random() * TAU;
      const spread = Math.sqrt(random()) * 71;
      const x = size / 2 + Math.cos(angle) * spread;
      const y = size / 2 + Math.sin(angle) * spread * 0.83;
      const radius = 11 + random() * 34;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,.18)');
      gradient.addColorStop(0.44, 'rgba(255,255,255,.09)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
}

export function fallbackTissue() {
  return canvasTexture(256, (context, size) => {
    const random = randomSource(146);
    const data = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const folds = Math.sin(TAU * x / size * 4 + Math.sin(TAU * y / size * 3) * 2.2);
        const fibers = Math.sin(TAU * y / size * 31 + folds * 5 + Math.sin(TAU * x / size * 2));
        const value = (folds * 0.2 + fibers * 0.23 + random() * 0.46 + 0.26);
        const offset = (y * size + x) * 4;
        data.data[offset] = 79 + value * 83;
        data.data[offset + 1] = 24 + value * 39;
        data.data[offset + 2] = 27 + value * 34;
        data.data[offset + 3] = 255;
      }
    }
    context.putImageData(data, 0, 0);
  });
}

export function normalFromImage(image, anisotropy) {
  const source = document.createElement('canvas');
  source.width = source.height = 512;
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 512, 512);
  const data = context.getImageData(0, 0, 512, 512).data;
  return configureTile(canvasTexture(512, (target, size) => {
    const imageData = target.createImageData(size, size);
    const luminance = (x, y) => {
      const index = ((y & 511) * size + (x & 511)) * 4;
      return (data[index] * .55 + data[index + 1] * .32 + data[index + 2] * .13) / 255;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (luminance(x - 2, y) - luminance(x + 2, y)) * 3.8;
        const dy = (luminance(x, y + 2) - luminance(x, y - 2)) * 3.8;
        const length = Math.hypot(dx, dy, 1);
        const index = (y * size + x) * 4;
        imageData.data[index] = 127.5 * (1 + dx / length);
        imageData.data[index + 1] = 127.5 * (1 + dy / length);
        imageData.data[index + 2] = 127.5 * (1 + 1 / length);
        imageData.data[index + 3] = 255;
      }
    }
    target.putImageData(imageData, 0, 0);
  }), anisotropy);
}

export function membraneMaps(seed, tint) {
  const size = 128;
  const lattice = 8;
  const random = randomSource(seed);
  const grains = Array.from({ length: lattice ** 2 }, () => [random(), random(), random()]);
  const cellMask = lattice - 1;
  const texelMask = size - 1;
  const height = new Float32Array(size * size);
  const pigment = new Uint8Array(height.length * 4);
  const roughness = new Uint8Array(pigment.length);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x * lattice / size;
      const gy = y * lattice / size;
      const cellX = Math.floor(gx);
      const cellY = Math.floor(gy);
      let first = Infinity;
      let second = Infinity;
      let tone = .5;
      for (let cy = cellY - 1; cy <= cellY + 1; cy++) {
        for (let cx = cellX - 1; cx <= cellX + 1; cx++) {
          const cell = grains[(cy & cellMask) * lattice + (cx & cellMask)];
          const distance = Math.hypot(cx + .2 + cell[0] * .6 - gx, cy + .2 + cell[1] * .6 - gy);
          if (distance < first) {
            second = first;
            first = distance;
            tone = cell[2];
          } else {
            second = Math.min(second, distance);
          }
        }
      }
      const groove = Math.min(1, (second - first) * 3);
      const fibril = Math.sin((y + Math.sin(x * TAU / size * 3) * 7) * TAU / size * 27);
      const grain = random();
      const detail = (.47 + groove * .31) + tone * .17 + fibril * .035 + grain * .04;
      const index = y * size + x;
      height[index] = groove * .68 + tone * .22 + fibril * .07 + grain * .06;
      pigment[index * 4] = tint[0] * detail;
      pigment[index * 4 + 1] = tint[1] * detail * (.83 + tone * .17);
      pigment[index * 4 + 2] = tint[2] * detail;
      pigment[index * 4 + 3] = 255;
      roughness.fill(123 + groove * 71 + grain * 34, index * 4, index * 4 + 3);
      roughness[index * 4 + 3] = 255;
    }
  }

  const normals = new Uint8Array(pigment.length);
  const h = (x, y) => height[(y & texelMask) * size + (x & texelMask)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * 1.45;
      const dy = (h(x, y - 1) - h(x, y + 1)) * 1.45;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 4;
      normals[index] = 127.5 * (1 + dx / length);
      normals[index + 1] = 127.5 * (1 + dy / length);
      normals[index + 2] = 127.5 * (1 + 1 / length);
      normals[index + 3] = 255;
    }
  }

  const texture = (data, color = false) => {
    const map = configureTile(new THREE.DataTexture(data, size, size), 4, color);
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  };
  return { map: texture(pigment, true), normalMap: texture(normals), roughnessMap: texture(roughness) };
}

export function reflectionTexture() {
  const texture = canvasTexture(256, (context, size) => {
    context.fillStyle = '#251a23';
    context.fillRect(0, 0, size, size);
    const softBox = (x, y, radius, width, color) => {
      context.save();
      context.translate(x, y);
      context.scale(width, 1);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(.28, color);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    };
    softBox(110, 57, 30, 1.65, '#ffe1b3');
    softBox(211, 91, 47, .58, '#7dbcc4');
    softBox(51, 84, 21, .53, '#e68a6f');
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
