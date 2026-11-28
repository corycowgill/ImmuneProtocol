import * as THREE from './vendor/three.module.js';
import { loadModel } from './asset-loading.mjs';
import { COOP_SUITS, DEFAULT_COOP_SUIT } from './coop-protocol.mjs';
import { readSetting, writeSetting } from './settings-store.mjs';

// Co-op suit catalog. The photoreal suits are TRELLIS scans refined, baked and cut
// into rig joints in Blender by tools/trellis/process.py (dist/assets/suits/<id>.glb).
// A suit appears once its model has loaded; there is no stand-in.
export const SUITS = Object.freeze({
  vanguard: {
    name: 'Vanguard', archetype: 'Heavy assault armor',
    detail: 'Chipped olive plate armor, brass dive helmet, and an amber visor.',
    accent: '#ff9a35',
  },
  wraith: {
    name: 'Wraith', archetype: 'Stealth infiltrator',
    detail: 'Matte black tactical plating, respirator, and violet light strips.',
    accent: '#c86bff',
  },
  lifeline: {
    name: 'Lifeline', archetype: 'Field corpsman',
    detail: 'White medic armor with red-cross plating and a black visor helmet.',
    accent: '#5dffc8',
  },
  bathysphere: {
    name: 'Bathysphere', archetype: 'Deep-dive pressure suit',
    detail: 'Riveted copper diving helmet, glowing portholes, and orange ballast bands.',
    accent: '#3fe6d6',
  },
});

export { COOP_SUITS, DEFAULT_COOP_SUIT };
export const normalizeSuit = id => COOP_SUITS.includes(id) ? id : DEFAULT_COOP_SUIT;

// The teammate rig's joints; every suit model has one node per joint.
export const RIG_JOINTS = Object.freeze(['hips', 'upper', 'head',
  ...['thigh', 'shin', 'boot', 'bicep', 'forearm', 'glove'].flatMap(part => [part + '_L', part + '_R'])]);

const SUIT_KEY = 'immune-protocol.coop-suit';

export function savedSuit() {
  return normalizeSuit(readSetting(SUIT_KEY));
}

export function saveSuit(id) {
  writeSetting(SUIT_KEY, normalizeSuit(id));
}

const glbModels = new Map();
const glbLoads = new Map();
let modelVersion = 0;

// Increments whenever a higher-detail model finishes loading, so worn suits can upgrade.
export const suitModelVersion = () => modelVersion;

function glbParts(id, gltf) {
  const parts = new Map();
  // Suits built from TRELLIS scans carry their own joint pivots (glTF extras, game
  // units). The teammate rig moves its joints there so limbs bend at the suit's knees.
  const rig = {};
  for (const node of [...gltf.scene.children]) { // Copy: re-parenting mutates children.
    if (!RIG_JOINTS.includes(node.name)) continue;
    node.traverse(child => {
      if (!child.isMesh) return;
      child.frustumCulled = false; // Arm segments are rescaled every frame.
      child.castShadow = true;
    });
    // Joint geometry is authored relative to its pivot; any node transform is
    // gltfpack's dequantisation and must be kept.
    const group = new THREE.Group();
    group.name = id + ' ' + node.name;
    group.add(node);
    parts.set(node.name, group);
    if (Array.isArray(node.userData?.pivot)) rig[node.name] = new THREE.Vector3().fromArray(node.userData.pivot);
  }
  if (Object.keys(rig).length === parts.size) parts.rig = rig;
  return parts.size === RIG_JOINTS.length ? parts : null;
}

// Loads the textured Blender model for a suit during startup. Resolves to the part map, or
// null if the file is unavailable.
export function loadSuitModel(id) {
  if (!COOP_SUITS.includes(id)) return Promise.resolve(null);
  if (!glbLoads.has(id)) {
    const url = new URL('./assets/suits/' + id + '.glb', import.meta.url).href;
    glbLoads.set(id, loadModel(url).then(gltf => {
      const parts = glbParts(id, gltf);
      if (!parts) throw new Error('Suit model is missing rig joints');
      glbModels.set(id, parts);
      modelVersion++;
      return parts;
    }).catch(error => {
      console.warn('Could not load the ' + id + ' suit model', error);
      return null;
    }));
  }
  return glbLoads.get(id);
}

// The skinned, motion-captured suits (tools/nanonaut, the Nanonaut's pipeline): one mesh on a
// 52-bone skeleton with every clip, at dist/assets/suits/rigged/<id>.glb. A teammate wears this
// when it has loaded, and the jointed model above otherwise.
const riggedModels = new Map();
const riggedLoads = new Map();

export function loadRiggedSuit(id) {
  if (!COOP_SUITS.includes(id)) return Promise.resolve(null);
  if (!riggedLoads.has(id)) {
    const url = new URL('./assets/suits/rigged/' + id + '.glb', import.meta.url).href;
    riggedLoads.set(id, loadModel(url).then(gltf => {
      const root = new THREE.Group();
      root.name = id + ' (rigged)';
      gltf.scene.traverse(part => {
        if (!part.isMesh) return;
        part.castShadow = true;
        part.frustumCulled = false; // skinned: its bounds move with the pose
      });
      root.add(gltf.scene);
      root.userData.humanoid = true;
      root.userData.clips = gltf.animations;
      riggedModels.set(id, root);
      modelVersion++;
      return root;
    }).catch(() => null));
  }
  return riggedLoads.get(id);
}

// The rigged template for a suit, or null while it loads (or where it does not exist).
export const riggedSuit = id => riggedModels.get(id) ?? null;

export const loadSuitModels = () => Promise.all(COOP_SUITS.map(id => Promise.all([loadSuitModel(id), loadRiggedSuit(id)]).then(([parts]) => parts)));

// Returns a Map of rig joint name -> Object3D template to clone onto that joint, or null
// while the suit's model is still loading (or if it failed).
export function suitParts(id) {
  if (!COOP_SUITS.includes(id)) return null;
  if (glbModels.has(id)) return glbModels.get(id);
  return null;
}
