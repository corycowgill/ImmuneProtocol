import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BOSS_MODELS } from '../dist/level-bosses.mjs';
import { SPECIES, speciesHabitats } from '../dist/simulation.mjs';

const asset = path => readFileSync(new URL('../dist/assets/enemies/' + path, import.meta.url));

test('every species has a scanned model with its animation targets', () => {
  // The brood nest and the level bosses are modelled in Blender rather than scanned.
  for (const type of [...Object.keys(SPECIES), 'nest', ...BOSS_MODELS]) {
    const file = asset(type + '.glb');
    assert.equal(file.toString('ascii', 0, 4), 'glTF', type + ' is a binary glTF');
    const length = file.readUInt32LE(12);
    const json = JSON.parse(file.toString('utf8', 20, 20 + length));
    const node = json.nodes.find(item => item.name === 'attack-membrane');
    assert.ok(node, type + ' has an attack-membrane node');
    const mesh = json.meshes.find(item => item.extras?.targetNames);
    assert.deepEqual(mesh.extras.targetNames, ['Breathe', 'SwayA', 'SwayB', 'SwayC', 'Clench'], type + ' morph targets');
    assert.ok(json.animations?.some(animation => animation.name === 'Idle'), type + ' has an Idle clip');
    assert.ok(asset('portraits/' + type + '.webp').length > 1000, type + ' has a guide portrait');
  }
});

test('every species attacks somewhere and appears in the disease guide', async () => {
  // The guide imports three.js, which needs no DOM until it is opened.
  const { PATHOGENS } = await import('../dist/disease-guide.mjs');
  const habitats = speciesHabitats();
  assert.deepEqual(PATHOGENS.map(entry => entry.type).sort(), Object.keys(SPECIES).sort());
  for (const entry of PATHOGENS) {
    assert.ok(habitats[entry.type].length, entry.type + ' appears in at least one mission');
    assert.equal(entry.facts.length, 3, entry.type + ' has three facts');
  }
});
