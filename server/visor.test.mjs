import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { VisorGoo, VISOR_HOLD, VISOR_WIPE, VISOR_RESIDUE } from '../dist/visor-fx.mjs';
import { createLevelProps } from '../dist/level-props.mjs';

const cell = { colour: new THREE.Color(0xf3ece6), nucleus: new THREE.Color(0x8a5cb0) };
const run = (visor, seconds, depth = 0, reduceMotion = false) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) visor.update(1 / 60, depth, depth ? cell : null, reduceMotion);
};

test('swimming through a white blood cell coats the visor, which drips, is wiped and clears', () => {
  const visor = new VisorGoo();
  assert.equal(visor.active, false);
  run(visor, .5, .5);
  assert.equal(visor.state, 'inside');
  assert.ok(visor.inside > .9, 'the cytoplasm fills the view while inside');
  assert.equal(visor.uniforms.gooCoat.value, 1);
  assert.deepEqual(visor.takeCues(), [{ type: 'visor', stage: 'splat' }]);

  // Out of the cell the coat hangs and runs before the glove comes up.
  run(visor, VISOR_HOLD * .5);
  assert.equal(visor.state, 'coated');
  assert.equal(visor.uniforms.gooCoat.value, 1);
  assert.ok(visor.inside < .1);
  run(visor, VISOR_HOLD * .5 + .05);
  assert.equal(visor.state, 'wiping');
  assert.deepEqual(visor.takeCues(), [{ type: 'visor', stage: 'wipe' }]);
  run(visor, VISOR_WIPE * .5);
  assert.ok(visor.handRaise > .8, 'the off hand is up at the visor mid-wipe');
  assert.ok(visor.uniforms.gooHand.value > .5);
  assert.ok(visor.wipe > 0 && visor.wipe < 1.4);

  // The wipe leaves streaks that thin out, then the visor is clear and the effect sleeps.
  run(visor, VISOR_WIPE * .5 + .05);
  assert.equal(visor.state, 'residue');
  assert.equal(visor.coat, 0);
  assert.ok(visor.residue > .9);
  run(visor, VISOR_RESIDUE + .1);
  assert.equal(visor.state, 'idle');
  run(visor, .3);
  assert.equal(visor.active, false);
  assert.deepEqual(visor.takeCues(), []);
});

test('re-entering a cell mid-wipe recoats the visor; reduced motion keeps the hand and drips still', () => {
  const visor = new VisorGoo();
  run(visor, .3, .4);
  run(visor, VISOR_HOLD + VISOR_WIPE * .4);
  assert.equal(visor.state, 'wiping');
  run(visor, .1, .4);
  assert.equal(visor.state, 'inside');
  assert.ok(visor.wipe < 0, 'the half-finished wipe is undone');

  const calm = new VisorGoo();
  run(calm, .3, .4, true);
  run(calm, VISOR_HOLD + VISOR_WIPE * .5, 0, true);
  assert.equal(calm.state, 'wiping');
  assert.equal(calm.handRaise, 0);
  assert.equal(calm.uniforms.gooHand.value, 0);
  assert.equal(calm.uniforms.gooAge.value, 0);
});

test('the bloodstream props report how deep a point sits inside a patrolling white blood cell', () => {
  const props = createLevelProps('artery', { glow: null, floorHeight: () => 0 });
  const cells = props.root.userData.leukocytes;
  assert.equal(cells.length, 2);
  props.update(null, 1, 1 / 60, false);
  props.root.updateMatrixWorld(true);
  const centre = cells[0].body.getWorldPosition(new THREE.Vector3());
  const inside = props.immersion(centre);
  assert.ok(inside.depth > .9);
  assert.equal(inside.cell, cells[0]);
  assert.equal(props.immersion(centre.clone().add(new THREE.Vector3(0, 0, 30))).depth, 0);
});
