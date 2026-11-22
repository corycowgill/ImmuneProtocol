import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';

// This budget is selected before the first model request, not after the menu loads.
// The override is useful for checking the same path in a desktop browser.
export function constrainedDevice(nav = {}, search = '') {
  if (new URLSearchParams(search).get('memory') === 'low') return true;
  return /iPhone|iPad|iPod|Android/i.test(nav.userAgent ?? '') ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1) ||
    (Number.isFinite(nav.deviceMemory) && nav.deviceMemory <= 4);
}

export const LOW_MEMORY = constrainedDevice(globalThis.navigator, globalThis.location?.search);
export const MAX_TEXTURE_SIZE = LOW_MEMORY ? 512 : Infinity;
export const assetLoadingStats = { active: 0, peak: 0, reducedImages: 0, sourceBytes: 0, retainedBytes: 0 };

// Keep a decode/resize inside its slot so pending GLBs cannot all expand at once.
export function createAssetQueue(limit = 1, stats = { active: 0, peak: 0 }) {
  const pending = [];
  const pump = () => {
    while (stats.active < limit && pending.length) {
      const { task, resolve, reject } = pending.shift();
      stats.active++; stats.peak = Math.max(stats.peak, stats.active);
      const finish = () => { stats.active--; pump(); };
      Promise.resolve().then(task).then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
    }
  };
  return task => new Promise((resolve, reject) => { pending.push({ task, resolve, reject }); pump(); });
}
const enqueue = createAssetQueue(LOW_MEMORY ? 1 : 6, assetLoadingStats);

export function textureSize(width, height, maximum = MAX_TEXTURE_SIZE) {
  const scale = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function smallerImage(image, width, height) {
  // Keep HTML/canvas sources as canvases: WebGL honors texture.flipY for these,
  // whereas ImageBitmap orientation is fixed at decode time (glTF uses flipY=false).
  if (typeof image.close === 'function' && typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(image, { resizeWidth: width, resizeHeight: height,
        resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch { /* Older image decoders can use a small canvas instead. */ }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The device could not resize a game texture');
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

// Sources can be shared by several maps/materials. Replace every reference before closing
// the original ImageBitmap; never close a bitmap still used by another colour-space view.
export async function limitTextures(textures, maximum = MAX_TEXTURE_SIZE, resize = smallerImage) {
  const images = new Map();
  for (const texture of textures) {
    const image = texture.image;
    if (!image?.width || !image?.height || texture.isDataTexture || texture.isCompressedTexture ||
        Math.max(image.width, image.height) <= maximum) continue;
    if (!images.has(image)) images.set(image, []);
    images.get(image).push(texture);
  }
  for (const [image, maps] of images) {
    const { width, height } = textureSize(image.width, image.height, maximum);
    const replacement = await resize(image, width, height);
    for (const texture of maps) { texture.image = replacement; texture.needsUpdate = true; }
    assetLoadingStats.reducedImages++;
    assetLoadingStats.sourceBytes += image.width * image.height * 4;
    assetLoadingStats.retainedBytes += width * height * 4;
    image.close?.();
  }
}

export function loadModel(url) {
  return enqueue(async () => {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    if (LOW_MEMORY) {
      const textures = new Set();
      for (const scene of gltf.scenes) scene.traverse(object => {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material ?? {})) if (value?.isTexture) textures.add(value);
        }
      });
      await limitTextures(textures);
    }
    return gltf;
  });
}

export function loadTexture(url) {
  return enqueue(async () => {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    await limitTextures([texture]);
    return texture;
  });
}
