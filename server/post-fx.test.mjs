import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { LOOKS } from '../dist/post-fx.mjs';
import { CAUSTICS, addCaustics, addTissueSheen } from '../dist/surface-fx.mjs';

const AREAS = ['artery', 'junction', 'heart', 'lungs', 'stomach', 'intestines', 'colon', 'lymph', 'ear', 'brain'];

test('every arena has a colour grade and floor caustics in sane ranges', () => {
  for (const area of AREAS) {
    const look = LOOKS[area];
    assert.ok(look, area + ' has a look');
    assert.ok(look.bloom > 0 && look.bloom < 1.5, area + ' bloom');
    assert.ok(look.saturation > .7 && look.saturation < 1.3, area + ' saturation');
    assert.ok(look.mistDensity > 0 && look.mistDensity < .05, area + ' mist stays a haze, not a wall');
    assert.ok(look.aberration < .002, area + ' lens fringe stays subtle');
    assert.ok([...look.tint, ...look.gain].every(v => v > .8 && v < 1.2), area + ' grade stays near neutral');
    assert.ok(CAUSTICS[area], area + ' has caustics');
  }
});

// The surface patches splice into three.js's own shader chunks; if a three.js update renamed one,
// the patch would silently do nothing. Run each patch against the real physical shader.
test('floor caustics and tissue sheen patch the real physical-material shader', () => {
  const shader = () => ({
    uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  });
  const time = { value: 0 };
  const floor = addCaustics(new THREE.MeshPhysicalMaterial(), time, 'stomach');
  const patched = shader();
  floor.onBeforeCompile(patched);
  assert.match(patched.vertexShader, /vCausticWorld = \(modelMatrix/);
  assert.match(patched.fragmentShader, /totalEmissiveRadiance \+= diffuseColor\.rgb \* causticTint/);
  assert.equal(patched.uniforms.causticTime, time);
  const wall = addTissueSheen(new THREE.MeshPhysicalMaterial(), 0xffffff, .2, 'test');
  const sheen = shader();
  wall.onBeforeCompile(sheen);
  assert.match(sheen.fragmentShader, /totalEmissiveRadiance \+= diffuseColor\.rgb \* sheenTint/);
  assert.notEqual(floor.customProgramCacheKey(), wall.customProgramCacheKey());
});
