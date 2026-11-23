import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { createHazardFX, HAZARD_AREAS } from '../dist/hazard-fx.mjs';
import { ORGAN_MISSIONS } from '../dist/organs.mjs';
import { floorHeight } from '../dist/arena-scene.mjs';

// Words GLSL ES 3.0 reserves; using one as an identifier stops the whole shader compiling.
const RESERVED = ['active', 'input', 'output', 'filter', 'sample', 'common', 'partition', 'superp', 'fixed', 'half', 'cast',
  'namespace', 'using', 'external', 'interface', 'union', 'enum', 'typedef', 'template', 'this', 'packed', 'goto', 'inline',
  'noinline', 'volatile', 'public', 'static', 'extern', 'long', 'short', 'double', 'unsigned', 'class', 'resource', 'buffer'];

function shaders(root) {
  const sources = [];
  root.traverse(object => {
    if (object.material?.isShaderMaterial) sources.push(object.material.vertexShader, object.material.fragmentShader);
  });
  return sources;
}

test('every organ hazard has an effect, and its shaders use no reserved GLSL words', () => {
  assert.deepEqual([...HAZARD_AREAS].sort(), Object.keys(ORGAN_MISSIONS).sort());
  for (const area of HAZARD_AREAS) {
    const root = new THREE.Group();
    createHazardFX(area, root, floorHeight);
    const sources = shaders(root);
    assert.ok(sources.length >= 4, area + ' builds shader effects');
    for (const source of sources) {
      for (const word of RESERVED) {
        assert.ok(!new RegExp(`(float|vec[234]|int|bool|mat[234])\\s+([\\w\\s,=.()+*-]*[\\s,])?${word}\\b`).test(source),
          `${area} declares the reserved word "${word}"`);
      }
    }
  }
});

test('a hazard warns, strikes, fades out and holds its zone while fading', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 10);
  for (const area of HAZARD_AREAS) {
    const root = new THREE.Group();
    const update = createHazardFX(area, root, floorHeight);
    const group = root.children[0];
    const hazard = ORGAN_MISSIONS[area].hazard;
    const state = phase => ({ phase, x: hazard.x ?? 4, z: hazard.z ?? -3, radius: hazard.radius, width: hazard.width, depth: hazard.depth, remaining: 1 });
    update(state('recovery'), 0, false, null, camera);
    assert.equal(group.visible, false, area + ' is hidden while recovering');
    let time = 0;
    for (let i = 0; i < 60; i++) update(state('warning'), time += 1 / 30, false, null, camera);
    assert.equal(group.visible, true, area + ' shows its warning');
    for (let i = 0; i < 60; i++) update(state('active'), time += 1 / 30, false, null, camera);
    const light = group.children.find(child => child.isPointLight);
    // Wind casts no light; every other hazard glows.
    if (area !== 'lungs') assert.ok(light.intensity > 0, area + ' lights the zone while active');
    // Recovery: the zone moves on in the simulation, but the fading effect stays where it was.
    const moved = { ...state('recovery'), x: 99, z: 99 };
    update(moved, time += 1 / 30, false, null, camera);
    assert.equal(group.visible, true, area + ' fades out rather than vanishing');
    for (let i = 0; i < 90; i++) update(moved, time += 1 / 30, false, null, camera);
    assert.equal(group.visible, false, area + ' is gone once faded');
  }
});

test('the stomach acid rises with the hazard and swirls down while draining', () => {
  const root = new THREE.Group();
  const update = createHazardFX('stomach', root, floorHeight);
  const surface = root.children[0].children.find(child => child.material?.uniforms?.level);
  const { level, swirl } = surface.material.uniforms;
  const state = { phase: 'active', x: 0, z: -6, radius: 11 };
  let time = 0;
  for (let i = 0; i < 90; i++) update(state, time += 1 / 30, false, { stage: 'flooded', level: 1 });
  assert.ok(level.value > .25, 'the acid covers the basin floor');
  update({ ...state, phase: 'recovery', radius: 5 }, time += 1 / 30, false, { stage: 'draining', level: .2 });
  assert.equal(swirl.value, 1);
  assert.ok(level.value < .1, 'a draining basin sinks');
});
