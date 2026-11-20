import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { ExplosionFX } from '../dist/explosions.mjs';
import { World } from '../dist/world.mjs';

function effects() {
  // Canvas drawing is irrelevant to resource lifetime; no WebGL context is needed.
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) }) };
  try { return new ExplosionFX(new THREE.Scene()); }
  finally { globalThis.document = original; }
}

test('repeated explosions and rocket trails keep bounded reusable GPU resources', () => {
  const fx = effects();
  const children = fx.scene.children.length;
  const capacities = [fx.spritePool.length, fx.ringPool.length, fx.rocketPool.length];
  const sprites = new Set(fx.spritePool.map(item => item.sprite));
  const geometry = new Set(fx.ringPool.map(item => item.ring.geometry));
  const start = new THREE.Vector3(0, 1, 0), end = new THREE.Vector3(0, 1, -10);
  for (let run = 0; run < 80; run++) {
    fx.launch(start, end, .2, false);
    fx.explode(0, 1, -5);
    for (let frame = 0; frame < 200; frame++) fx.update(1 / 60);
    assert.equal(fx.sprites.length + fx.rings.length + fx.rockets.length, 0);
    assert.deepEqual([fx.spritePool.length, fx.ringPool.length, fx.rocketPool.length], capacities);
    assert.equal(fx.scene.children.length, children);
    assert.ok(fx.spritePool.every(item => sprites.has(item.sprite)));
    assert.ok(fx.ringPool.every(item => geometry.has(item.ring.geometry)));
  }
});

test('saturation drops only decorative effects and clear returns every resource exactly once', () => {
  const fx = effects();
  const capacities = [fx.spritePool.length, fx.ringPool.length, fx.rocketPool.length];
  for (let i = 0; i < 50; i++) {
    fx.explode(i, 1, 0);
    fx.launch(new THREE.Vector3(), new THREE.Vector3(0, 0, -10), 1, false);
  }
  assert.equal(fx.spritePool.length, 0);
  assert.equal(fx.sprites.length, capacities[0]);
  fx.clear(); fx.clear();
  assert.deepEqual([fx.spritePool.length, fx.ringPool.length, fx.rocketPool.length], capacities);
  assert.equal(new Set(fx.spritePool).size, capacities[0]);
  assert.ok(fx.scene.children.every(child => !child.isSprite || !child.visible));
  assert.ok(fx.lights.every(light => light.intensity === 0 && light.userData.remaining === 0));
  const sprite = fx.sprite(fx.smoke, { x: 0, y: 0, z: 0 }, { size: 1, life: 1, delay: .5, vx: 3, cool: true });
  fx.clear();
  assert.equal(fx.sprite(fx.glow, { x: 1, y: 2, z: 3 }, { size: 2, life: 1 }), sprite);
  const item = fx.sprites[0];
  assert.equal(item.delay, 0);
  assert.equal(item.vx, undefined);
  assert.equal(item.cool, false);
});

test('reused pathogen rigs retain isolated membrane materials and reset combat state', () => {
  const source = new THREE.Group();
  const membrane = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ emissive: 0x110000 }));
  membrane.name = 'attack-membrane'; source.add(membrane);
  const world = Object.assign(Object.create(World.prototype), {
    scene: new THREE.Scene(), enemyModels: new Map([['virus', source]]), enemyViews: new Map(), enemyPool: new Map(),
    shadowGeometry: new THREE.PlaneGeometry(2, 2), shadowMaterial: new THREE.MeshBasicMaterial(), random: () => .5, clock: 0,
  });
  const enemy = id => ({ id, type: 'virus', x: 0, y: 1, z: -4, heading: 0, radius: 1 });
  world.updateEnemies([enemy(1), enemy(2)], 0, true);
  const first = world.enemyViews.get(1), second = world.enemyViews.get(2);
  assert.notEqual(first.attackMembrane, second.attackMembrane);
  assert.notEqual(first.attackMembrane, membrane.material);
  first.hit = 1; first.strike = .2;
  world.updateEnemies([enemy(2)], 0, true);
  assert.equal(first.model.visible, false);
  world.updateEnemies([enemy(3), enemy(2)], 0, true);
  assert.equal(world.enemyViews.get(3), first);
  assert.equal(first.hit, 0); assert.equal(first.strike, 0);
  assert.equal(first.model.visible, true);
  assert.equal(world.scene.children.length, 4);
});
