import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderScale } from '../dist/render-scale.mjs';

// Feeds whole seconds of frames at a rate that can depend on the current scale.
function run(governor, seconds, fpsAt) {
  for (let second = 0; second < seconds; second++) {
    const fps = fpsAt(governor.scale);
    for (let frame = 0; frame < fps; frame++) governor.sample(1 / fps);
  }
}

test('holds full resolution while the frame rate is healthy', () => {
  const governor = new RenderScale();
  run(governor, 30, () => 60);
  assert.equal(governor.scale, 1);
});

test('sheds pixels when fill-bound and settles without oscillating', () => {
  const governor = new RenderScale();
  // 38 fps at full resolution, frame time proportional to pixel count, capped by vsync.
  const fill = scale => Math.min(60, 38 / (scale * scale));
  run(governor, 20, fill);
  assert.ok(governor.scale < 1 && governor.scale >= governor.floor);
  assert.ok(fill(governor.scale) >= governor.low);
  const settled = [];
  for (let i = 0; i < 60; i++) { run(governor, 1, fill); settled.push(governor.scale); }
  assert.ok(new Set(settled.slice(30)).size <= 2, 'scale keeps changing');
});

test('restores resolution once the load passes', () => {
  const governor = new RenderScale();
  run(governor, 12, scale => Math.min(60, 30 / (scale * scale)));
  assert.ok(governor.scale < 1);
  run(governor, 60, () => 60);
  assert.equal(governor.scale, 1);
});

test('gives the sharpness back when fewer pixels do not help', () => {
  const governor = new RenderScale();
  run(governor, 12, () => 30); // A 30 Hz cap or a CPU limit.
  assert.equal(governor.scale, 1);
  assert.ok(governor.hold > 0);
});

test('ignores pauses and never leaves its bounds', () => {
  const governor = new RenderScale();
  assert.equal(governor.sample(4), false);
  run(governor, 40, () => 12);
  assert.ok(governor.scale >= governor.floor && governor.scale <= 1);
  governor.enabled = false;
  const before = governor.scale;
  run(governor, 5, () => 12);
  assert.equal(governor.scale, before);
});
