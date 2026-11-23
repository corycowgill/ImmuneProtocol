import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { createLevelProps } from '../dist/level-props.mjs';
import { arenaObstacles, TISSUE_NODES } from '../dist/simulation.mjs';
import { ORGAN_MISSIONS } from '../dist/organs.mjs';
import { floorHeight } from '../dist/arena-scene.mjs';

const nodesOf = area => TISSUE_NODES[area] ?? ORGAN_MISSIONS[area]?.nodes ?? [];
const AREAS = ['artery', 'junction', 'lungs', 'stomach', 'intestines', 'colon', 'lymph', 'ear', 'brain'];
// The small intestine's villus forest and the colon's microbiome (level-props.mjs) already carpet
// those floors, so they add fewer, larger pieces.
const MINIMUM = { intestines: 15, colon: 50, artery: 300, junction: 300, lungs: 1000, stomach: 300, lymph: 200, ear: 300, brain: 20 };

test('every arena gets close-up dressing that leaves the tissue nodes clear', () => {
  const position = new THREE.Vector3(), matrix = new THREE.Matrix4();
  for (const area of AREAS) {
    const props = createLevelProps(area, { glow: new THREE.Texture(), floorHeight, nodes: nodesOf(area), obstacles: arenaObstacles(area) });
    const details = props.root.getObjectByName('level-details-' + area);
    assert.ok(details, area + ' has dressing');
    let instances = 0;
    details.traverse(object => {
      if (!object.isInstancedMesh) return;
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        instances++;
        // Floor scatter keeps a suit-wide gap around each node so repairs are never obstructed.
        if (position.y < 1.5) for (const node of nodesOf(area)) {
          assert.ok(Math.hypot(node.x - position.x, node.z - position.z) > 3.8, `${area} dressing sits on ${node.name}`);
        }
      }
    });
    assert.ok(instances >= MINIMUM[area], area + ' scatters plenty of detail (' + instances + ')');
    props.setQuality(false);
    props.update({}, 1, 1 / 60, false);
  }
});
