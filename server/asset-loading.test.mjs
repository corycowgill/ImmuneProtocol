import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { LOW_MEMORY, MAX_TEXTURE_SIZE, constrainedDevice, createAssetQueue, limitTextures, scheduleAsset, textureSize } from '../dist/asset-loading.mjs';

test('mobile memory policy is selected before asset loading, including iPad desktop user agents', () => {
  assert.equal(constrainedDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), true);
  assert.equal(constrainedDevice({ userAgent: 'Android' }), true);
  assert.equal(constrainedDevice({ platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(constrainedDevice({ deviceMemory: 4 }), false);
  assert.equal(constrainedDevice({ userAgent: 'Windows', deviceMemory: 16 }), false);
  assert.equal(constrainedDevice({}, '?memory=low', 'localhost'), true);
  assert.equal(constrainedDevice({}, '?memory=low', '127.0.0.1'), true);
  assert.equal(constrainedDevice({}, '?memory=low', '[::1]'), true);
  assert.equal(constrainedDevice(), false);
});

test('desktop PCs stay full quality regardless of RAM, touch input, or public URL parameters', () => {
  for (const userAgent of ['Windows NT 10.0', 'Macintosh; Intel Mac OS X', 'X11; Linux x86_64']) {
    for (const deviceMemory of [1, 2, 4, 8, 16]) {
      assert.equal(constrainedDevice({ userAgent, deviceMemory, maxTouchPoints: 10 }, '?memory=low', 'corycowgill.github.io'), false);
    }
  }
  assert.equal(constrainedDevice({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(constrainedDevice({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }), true); // iPad desktop mode.
});

test('desktop loader starts more than six pending assets immediately and retains full textures', async () => {
  assert.equal(LOW_MEMORY, false); assert.equal(MAX_TEXTURE_SIZE, Infinity);
  let started = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const jobs = Array.from({ length: 20 }, () => scheduleAsset(() => { started++; return gate; }));
  assert.equal(started, 20); release(); await Promise.all(jobs);
  const image = { width: 4096, height: 2048 }, texture = new THREE.Texture(image);
  await limitTextures([texture], undefined, () => { throw Error('Desktop texture must retain its source'); });
  assert.equal(texture.image, image);
});

test('texture budget preserves aspect ratio and never upscales smaller images', () => {
  assert.deepEqual(textureSize(2048, 2048, 512), { width: 512, height: 512 });
  assert.deepEqual(textureSize(4096, 2048, 512), { width: 512, height: 256 });
  assert.deepEqual(textureSize(256, 128, 512), { width: 256, height: 128 });
  assert.deepEqual(textureSize(2048, 1024, Infinity), { width: 2048, height: 1024 });
});

test('one decode holds its slot through resize and a failure does not block later assets', async () => {
  const stats = { active: 0, peak: 0 }, queue = createAssetQueue(1, stats), order = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const jobs = [queue(async () => { order.push('decode'); await gate; order.push('resize'); return 'model'; }),
    queue(() => { order.push('failed'); throw new Error('Missing asset'); }),
    queue(() => { order.push('next'); return 'texture'; })];
  const completed = Promise.allSettled(jobs);
  await Promise.resolve(); assert.deepEqual(order, ['decode']); assert.equal(stats.active, 1);
  release();
  const results = await completed;
  assert.deepEqual(order, ['decode', 'resize', 'failed', 'next']);
  assert.equal(results[0].value, 'model'); assert.equal(results[1].status, 'rejected'); assert.equal(results[2].value, 'texture');
  assert.equal(stats.peak, 1); assert.equal(stats.active, 0);
});

test('shared image references are replaced before the original bitmap closes exactly once', async () => {
  let closes = 0, resizes = 0;
  const image = { width: 2048, height: 1024, close() {
    closes++; assert.equal(a.image, replacement); assert.equal(b.image, replacement); assert.equal(c.image, replacement);
  } };
  const replacement = { width: 512, height: 256 };
  const a = new THREE.Texture(image), b = a.clone(), c = new THREE.Texture(image);
  a.flipY = false; a.colorSpace = THREE.SRGBColorSpace; c.wrapS = THREE.RepeatWrapping;
  await limitTextures([a, b, c], 512, async (source, width, height) => {
    resizes++; assert.equal(source, image); assert.equal(width, 512); assert.equal(height, 256); return replacement;
  });
  assert.equal(resizes, 1); assert.equal(closes, 1); assert.equal(a.flipY, false);
  assert.equal(a.colorSpace, THREE.SRGBColorSpace); assert.equal(c.wrapS, THREE.RepeatWrapping);
  assert.ok(a.version > 0 && b.version > 0 && c.version > 0);
});

test('failed resizing keeps the original image usable and does not close it', async () => {
  let closed = false;
  const image = { width: 2048, height: 2048, close() { closed = true; } }, texture = new THREE.Texture(image);
  await assert.rejects(limitTextures([texture], 512, async () => { throw new Error('Decode failed'); }), /Decode failed/);
  assert.equal(texture.image, image); assert.equal(closed, false);
});

test('small images and typed pixel textures bypass the image decoder', async () => {
  const small = new THREE.Texture({ width: 256, height: 256 });
  const data = new THREE.DataTexture(new Uint8Array(4), 1024, 1024);
  await limitTextures([small, data], 512, () => { throw new Error('Should not decode'); });
  assert.equal(small.image.width, 256); assert.equal(data.image.width, 1024);
});

test('HTML images keep canvas orientation so WebGL can honor flipY on external textures', async () => {
  const originalDocument = globalThis.document, originalBitmap = globalThis.createImageBitmap;
  let draw = null;
  const surface = { getContext: () => ({ drawImage: (...args) => { draw = args; } }) };
  globalThis.document = { createElement: () => surface };
  globalThis.createImageBitmap = () => { throw new Error('HTML image orientation must stay under WebGL control'); };
  try {
    const image = { width: 2048, height: 1024 }, texture = new THREE.Texture(image);
    await limitTextures([texture], 512);
    assert.equal(texture.image, surface); assert.equal(texture.flipY, true);
    assert.equal(surface.width, 512); assert.equal(surface.height, 256);
    assert.deepEqual(draw, [image, 0, 0, 512, 256]);
  } finally { globalThis.document = originalDocument; globalThis.createImageBitmap = originalBitmap; }
});
