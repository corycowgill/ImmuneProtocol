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

test('a pathogen that pounces onto the suit splats its fluid, which stays until the suit is free', () => {
  const visor = new VisorGoo();
  const fluid = new THREE.Color(0xc8432c);
  visor.splat(new THREE.Color(0xeadcd0).lerp(fluid, .55), fluid.clone().multiplyScalar(.6), 1);
  assert.equal(visor.state, 'coated');
  assert.equal(visor.coat, 1);
  assert.equal(visor.uniforms.gooFocus.value, 1, 'a splat is thickest where it struck');
  assert.deepEqual(visor.takeCues(), [{ type: 'visor', stage: 'splat' }]);

  // While the pathogen is still on the suit the goo hangs there, however long that is.
  const held = (seconds, on) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) visor.update(1 / 60, 0, null, false, on); };
  held(VISOR_HOLD * 4, true);
  assert.equal(visor.state, 'coated');
  assert.equal(visor.handRaise, 0, 'the hand stays on the weapon while the pathogen is on the suit');
  // Free: it drips for a moment, then the glove wipes it.
  held(VISOR_HOLD + .05, false);
  assert.equal(visor.state, 'wiping');

  // A second hit mid-wipe recoats the visor; a spat glob adds less than a pounce.
  visor.splat(fluid, fluid, .6);
  assert.equal(visor.state, 'coated');
  assert.ok(Math.abs(visor.coat - .6) < 1e-9, 'a fresh splat after the wipe began starts a new coat');
  assert.ok(visor.wipe < 0);

  // Swimming through a cell is its own even coat, not a splat.
  const cellVisor = new VisorGoo();
  run(cellVisor, .2, .5);
  cellVisor.splat(fluid, fluid, 1);
  assert.equal(cellVisor.state, 'inside');
  assert.equal(cellVisor.uniforms.gooFocus.value, 0);
});

test('the visor cracks as the suit loses integrity and each crack is sealed once healing lifts it back', async () => {
  const { VisorCracks, CRACK_LEVELS, CRACK_SEAL } = await import('../dist/visor-fx.mjs');
  const cracks = new VisorCracks();
  cracks.reset(4);
  const step = (seconds, integrity) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) cracks.update(1 / 60, integrity); };
  step(.1, 100);
  assert.equal(cracks.active, false, 'a whole suit has whole glass');
  step(.1, 60);
  assert.deepEqual(cracks.cracks.map(c => c.shown), [1, 0, 0, 0, 0], 'one crack per integrity level crossed');
  assert.deepEqual(cracks.takeCues(), [{ type: 'visor', stage: 'crack' }]);
  step(.1, 9);
  assert.equal(cracks.cracks.filter(c => c.shown).length, CRACK_LEVELS.length);
  assert.equal(cracks.takeCues().length, CRACK_LEVELS.length - 1);
  // The first cracks stay toward the edges of the glass; only the last reaches near the middle.
  const off = ({ x, y }) => Math.hypot(x - .5, y - .5);
  assert.ok(cracks.cracks.slice(0, 4).every(c => off(c) > .25));

  // Healing to 60%: the four deeper cracks are sealed, the first stays.
  step(.1, 60);
  assert.deepEqual(cracks.takeCues(), Array(4).fill({ type: 'visor', stage: 'seal' }));
  assert.ok(cracks.uniforms.crackState.value[4].y > 0, 'sealant glows along a crack being sealed');
  step(CRACK_SEAL, 60);
  assert.deepEqual(cracks.cracks.map(c => c.shown), [1, 0, 0, 0, 0]);

  // Hit again mid-seal: the crack opens back up.
  step(.1, 100);
  step(.1, 65);
  assert.equal(cracks.cracks[0].sealing, 0);
  assert.equal(cracks.cracks[0].shown, 1);
  // Going down keeps the cracks as they were (no sealing on the way down); a fresh suit is whole.
  step(.1, 9);
  cracks.takeCues();
  step(.5, 0);
  assert.deepEqual(cracks.takeCues(), []);
  assert.equal(cracks.cracks.filter(c => c.shown).length, CRACK_LEVELS.length);
  const fresh = new VisorCracks();
  fresh.update(1 / 60, 0);
  assert.equal(fresh.active, false);
});

test('engulfed by the macrophage: a moment inside its cytoplasm, then a coat that is wiped once free', async () => {
  const visor = new VisorGoo();
  visor.engulf(new THREE.Color(0xe8dcf0), new THREE.Color(0x9070d8), 1);
  run(visor, .5);
  assert.equal(visor.state, 'inside');
  assert.ok(visor.inside > .8);
  assert.ok(visor.uniforms.gooColor.value.equals(new THREE.Color(0xe8dcf0)));
  run(visor, .6);
  assert.equal(visor.state, 'coated');
  run(visor, VISOR_HOLD + .1);
  assert.equal(visor.state, 'wiping');
});
