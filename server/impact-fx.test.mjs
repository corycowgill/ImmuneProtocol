import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { ImpactFX } from '../dist/impact-fx.mjs';
import { floorHeight, wallMargin } from '../dist/arena-scene.mjs';

function fx(obstacles = []) {
  const world = { scene: new THREE.Scene(), obstacles, burst() {}, explosions: null, deaths: null };
  return new ImpactFX(world);
}

test('shots land on the floor, the chamber wall and obstacles where they really meet them', () => {
  const impacts = fx([[10, 0, 2]]);
  const down = impacts.surfaceHit(new THREE.Vector3(3, 1.7, 4), new THREE.Vector3(0, -1, 0), 5);
  assert.equal(down.kind, 'floor');
  assert.ok(Math.abs(down.point.y - floorHeight(3, 4)) < .02);
  assert.ok(down.normal.y > .9);
  const level = impacts.surfaceHit(new THREE.Vector3(0, 2, 30), new THREE.Vector3(1, 0, 0), 120);
  assert.equal(level.kind, 'wall');
  assert.ok(Math.abs(wallMargin(level.point.x, level.point.y, level.point.z)) < .01);
  assert.ok(level.normal.x < 0, 'the wall faces back into the chamber');
  const blocked = impacts.surfaceHit(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(1, 0, 0), 60);
  assert.equal(blocked.kind, 'obstacle');
  assert.ok(blocked.point.x > 7.5 && blocked.point.x < 8.5);
  assert.equal(impacts.surfaceHit(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, 0), 10), null, 'nothing overhead within reach');
});

test('marks recycle the oldest when a pool fills, and fade away after their life', () => {
  const impacts = fx();
  const pool = impacts.pools.puncture;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pool.born.length + 25; i++) impacts.mark('puncture', new THREE.Vector3(i * .1, 0, 0), up, .3, 0x502020);
  assert.equal(pool.mesh.count, pool.born.length, 'the pool never grows past its size');
  assert.equal(pool.next, 25, 'the oldest marks were reused');
  for (let i = 0; i < 40; i++) impacts.update(1);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  pool.mesh.getMatrixAt(3, matrix);
  matrix.decompose(position, rotation, scale);
  assert.ok(scale.x < 1e-6, 'a mark past its life has shrunk away');
  impacts.clear();
  assert.equal(pool.mesh.count, 0);
});
