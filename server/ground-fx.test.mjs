import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { GROUND, GROUND_EXTENT, paintGround, patchGround, patchShell } from '../dist/ground-fx.mjs';

test('every arena has a ground palette and the ground covers the floor plane', () => {
  for (const area of ['artery', 'junction', 'heart', 'lungs', 'stomach', 'intestines', 'colon', 'lymph', 'ear', 'brain']) {
    const palette = GROUND[area];
    assert.ok(palette, area);
    assert.ok(palette.wet >= 0 && palette.wet <= 1);
    assert.ok([...palette.vein, ...palette.stain, ...palette.second].every(v => v > 0 && v < 1.3), area + ' colours are multipliers');
  }
  assert.ok(GROUND_EXTENT[0] > 60 && GROUND_EXTENT[1] > 85);
  // Painting needs a canvas; headless it declines instead of throwing.
  assert.equal(paintGround('artery'), null);
});

// Each replacement must find its anchor in three.js's real physical shader, or that part of the
// ground silently disappears.
test('the ground patch rewrites map sampling, roughness, normals, emissive and clear coat', () => {
  const material = new THREE.MeshPhysicalMaterial({ clearcoat: .5 });
  patchGround(material, { time: { value: 0 }, area: 'stomach', maps: null, detail: { value: 1 } });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader);
  const fragment = shader.fragmentShader;
  for (const [what, pattern] of [
    ['anti-tiled albedo', /vec4 baseTex = textureNoTile\(map, vMapUv\)/],
    ['wet roughness', /roughnessFactor = mix\(roughnessFactor, \.1, groundWet\)/],
    ['anti-tiled normals with close detail', /textureNoTile\(normalMap, vNormalMapUv\)[\s\S]*detailFade/],
    ['caustics', /causticTint \* web/],
    ['wet clear coat', /material\.clearcoat = mix\(material\.clearcoat, 1\., groundWet\)/],
  ]) assert.match(fragment, pattern, what);
  for (const chunk of ['map_fragment', 'normal_fragment_maps', 'roughnessmap_fragment', 'emissivemap_fragment', 'lights_physical_fragment']) {
    assert.ok(THREE.ShaderLib.physical.fragmentShader.includes(`#include <${chunk}>`), chunk + ' still exists in three.js');
  }
  assert.match(shader.vertexShader, /vGroundWorld = \(modelMatrix/);
  assert.equal(shader.uniforms.groundOn.value, 0, 'without painted maps the ground falls back to neutral');
});

test('walls and canopy get anti-tiled tissue, vessels, wet streaks, contact shade and rim glow', () => {
  for (const kind of ['wall', 'canopy']) {
    const material = new THREE.MeshPhysicalMaterial({ clearcoat: .4 });
    patchShell(material, { area: 'brain', kind, detail: { value: 1 } });
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader);
    const fragment = shader.fragmentShader;
    for (const [what, pattern] of [
      ['anti-tiled albedo', /vec4 baseTex = textureNoTile\(map, vMapUv\)/],
      ['vessels', /shellVesselMask = shellVessels\(vesselSpace\)/],
      ['wet streaks and the wall-foot shadow', /smoothstep\(-\.3, 3\.2, sw\.y\)/],
      ['wet gloss', /roughnessFactor = mix\(roughnessFactor, \.12, shellWet\)/],
      ['glowing vessels', /totalEmissiveRadiance \+= shellGlow/],
      ['rim glow', /sheenTint \* pow\(1\.0 - facing, 2\.6\)/],
    ]) assert.match(fragment, pattern, kind + ': ' + what);
    assert.equal(shader.uniforms.shellWall.value, kind === 'wall' ? 1 : 0);
    assert.match(material.customProgramCacheKey(), new RegExp('shell-' + kind + '-brain'));
  }
});
