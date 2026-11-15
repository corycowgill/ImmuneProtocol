import * as THREE from './vendor/three.module.js';
import { createCarbine } from './carbine.mjs';
import { WEAPON_FINISHES, WEAPON_MODS } from './weapon-mods.mjs';

export const ARMORY_ART_SIZE = { width: 450, height: 260 };
export const FIELD_UPGRADE_ART = './assets/field-upgrades.webp';

export async function prepareArmoryArt(renderer) {
  const { width, height } = ARMORY_ART_SIZE;
  const photography = new THREE.Scene();
  photography.background = new THREE.Color(0x201917);
  const carbine = createCarbine({ showHands: false });
  photography.add(carbine.model);
  photography.add(new THREE.HemisphereLight(0xf0eee9, 0xa6917f, 2.1));
  const key = new THREE.DirectionalLight(0xfff1d6, 3.5);
  key.position.set(-2, 3, 1);
  photography.add(key);
  const rim = new THREE.DirectionalLight(0xb3dce9, 2.3);
  rim.position.set(1, .8, -1);
  photography.add(rim);
  const camera = new THREE.PerspectiveCamera(29, width / height, .05, 10);
  camera.position.set(-1.31, .42, -.89);
  camera.lookAt(0, -.015, -.245);
  const target = new THREE.WebGLRenderTarget(width, height, { colorSpace: THREE.SRGBColorSpace });
  const previousTarget = renderer.getRenderTarget();
  const bytes = new Uint8Array(width * height * 4);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(width, height);
  const art = {};

  try {
    for (const mod of Object.keys(WEAPON_MODS)) {
      art[mod] = {};
      for (const finish of Object.keys(WEAPON_FINISHES)) {
        carbine.setLoadout(mod, finish);
        renderer.setRenderTarget(target);
        renderer.render(photography, camera);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes);
        const stride = width * 4;
        for (let row = 0; row < height; row++) {
          const offset = (height - 1 - row) * stride;
          pixels.data.set(bytes.subarray(offset, offset + stride), row * stride);
        }
        context.putImageData(pixels, 0, 0);
        const image = new Image(width, height);
        image.src = canvas.toDataURL('image/webp', .84);
        await image.decode();
        art[mod][finish] = image;
      }
      await new Promise(requestAnimationFrame);
    }
  } finally {
    renderer.setRenderTarget(previousTarget);
    target.dispose();
    const materials = new Set();
    const geometry = new Set();
    photography.traverse(object => {
      if (object.geometry) geometry.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    for (const item of geometry) item.dispose();
    const textures = new Set();
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
  }
  return art;
}
