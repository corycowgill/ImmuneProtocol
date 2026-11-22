import * as THREE from './vendor/three.module.js';
import { loadModel } from './asset-loading.mjs';

// Photoreal pathogen models. Each one is a 3D scan that tools/enemies/process.py
// refines, retopologises, texture-bakes and animates in Blender
// (dist/assets/enemies/<species>.glb). The mesh is named attack-membrane so the
// renderer's attack glow lights the whole organism through its emissive map.
// Its Idle clip loops the Breathe and SwayA-C morph targets; the renderer
// drives the Clench target from each attack windup. Until a model arrives, or
// if it fails to load, world.mjs shows a plain placeholder.
export const ENEMY_MODELS = Object.freeze({
  virus: { size: .9, glow: 0x4a160c },
  spore: { size: .82, glow: 0x3c1240 },
  bacillus: { size: 1, glow: 0x3d300a },
  splitter: { size: 1, glow: 0x3a0f44 },
  guard: { size: 1.05, glow: 0x0c3434 },
  colony: { size: 1.4, glow: 0x1c2a0c },
  phage: { size: .98, glow: 0x2c1648 },
  flagellate: { size: 1, glow: 0x24103c },
  blister: { size: .92, glow: 0x461410 },
  filovirus: { size: 1.2, glow: 0x46100a },
  amoeba: { size: 1.12, glow: 0x24204a },
  rogue: { size: 1.15, glow: 0x46120e },
  // Hard-surface medical drone, built and texture-baked in Blender.
  'rogue-bot': { size: 1, glow: 0xffffff },
  // Its eight-legged ground sibling (tools/enemies/build_crawler.py); legs are separate nodes.
  crawler: { size: 1, glow: 0xffffff },
  // The brood nest (field-objectives.mjs) is modelled in Blender by tools/enemies/build_nest.py.
  nest: { size: 1, glow: 0x4a1608 },
  // Level bosses (level-bosses.mjs), sculpted by tools/enemies/build_bosses.py.
  'boss-thrombus': { size: 1, glow: 0x4a0c0a },
  'boss-leech': { size: 1, glow: 0x3a2206 },
  'boss-bloom': { size: 1, glow: 0x0c3a30 },
  'boss-drill': { size: 1, glow: 0x4a1a12 },
  'boss-tapeworm': { size: 1, glow: 0x4a3a18 },
  'boss-colossus': { size: 1, glow: 0x343a08 },
  'boss-macrophage': { size: 1, glow: 0x34204a },
  'boss-screamer': { size: 1, glow: 0x1c2e4a },
});

// glTF clips keyed by the shared morph geometry, so every clone of a template finds its clip.
const clips = new WeakMap();
const loads = new Map();

function prepare(type, gltf) {
  const { size, glow } = ENEMY_MODELS[type];
  // gltfpack keeps the named node as a dequantisation wrapper around the mesh,
  // so the name and the clip's track targets move onto the mesh itself.
  const node = gltf.scene.getObjectByName('attack-membrane');
  let mesh = node?.isMesh ? node : null;
  node?.traverse(part => { mesh ??= part.isMesh ? part : null; });
  if (!mesh) throw new Error('The ' + type + ' model has no attack-membrane mesh');
  const meshName = mesh.name;
  if (node !== mesh) node.name = 'attack-membrane-dequantize';
  mesh.name = 'attack-membrane';
  mesh.material.emissive.setHex(glow);
  mesh.material.emissiveIntensity = .7;
  const clip = gltf.animations.find(animation => animation.name === 'Idle') ?? gltf.animations[0];
  for (const track of clip?.tracks ?? []) {
    if (track.name.startsWith(meshName + '.')) track.name = 'attack-membrane' + track.name.slice(meshName.length);
  }
  if (clip && mesh.morphTargetDictionary) clips.set(mesh.geometry, clip);
  const root = new THREE.Group();
  root.name = type + ' pathogen';
  gltf.scene.scale.setScalar(size);
  root.add(gltf.scene);
  return root;
}

// Resolves to a template Group, or null when the file is unavailable.
export function loadEnemyModel(type) {
  if (!Object.hasOwn(ENEMY_MODELS, type)) return Promise.resolve(null);
  if (!loads.has(type)) {
    const url = new URL('./assets/enemies/' + type + '.glb', import.meta.url).href;
    loads.set(type, loadModel(url)
      .then(gltf => prepare(type, gltf))
      .catch(error => {
        console.warn('Could not load the ' + type + ' model; showing a placeholder', error);
        return null;
      }));
  }
  return loads.get(type);
}

// Resolves to a Map of species -> template for every model that loaded.
export async function loadEnemyModels() {
  const types = Object.keys(ENEMY_MODELS);
  const models = await Promise.all(types.map(loadEnemyModel));
  return new Map(types.map((type, index) => [type, models[index]]).filter(([, model]) => model));
}

// Starts the looping idle animation on one placed copy of a template, at a random
// point in the loop. Returns null for models without morph animation.
export function pathogenMotion(model) {
  const mesh = model.getObjectByName('attack-membrane');
  const clip = mesh?.geometry && clips.get(mesh.geometry);
  if (!clip) return null;
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip).play();
  action.time = Math.random() * clip.duration;
  return { mixer, influences: mesh.morphTargetInfluences, clench: mesh.morphTargetDictionary.Clench };
}

// Advances the idle loop and applies the attack clench (-1 flared to 1 coiled).
export function animatePathogen(motion, dt, clench = 0) {
  if (!motion) return;
  motion.mixer.update(dt * (1 + Math.abs(clench) * 1.6));
  if (motion.clench !== undefined) motion.influences[motion.clench] = clench;
}
