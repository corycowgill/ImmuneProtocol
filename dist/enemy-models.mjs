import * as THREE from './vendor/three.module.js';
import { loadModel } from './asset-loading.mjs';
import { cloneSkinned, createNanonautDisplay } from './nanonaut-view.mjs';

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
  // Brightened so its gold body holds up under the arenas' cooler fill and split toning.
  bacillus: { size: 1, glow: 0x4a3a0c, brighten: 1.45 },
  splitter: { size: 1, glow: 0x5a1a6a, brighten: 1.7 },
  guard: { size: 1.05, glow: 0x0c3434 },
  colony: { size: 1.4, glow: 0x1c2a0c },
  phage: { size: .98, glow: 0x2c1648 },
  // The Grip Phage wears the phage's scan, stained a sickly green with longer, splayed fibres.
  latcher: { size: .92, glow: 0x1e3a0c, file: 'phage', tint: 0x9fe07a },
  flagellate: { size: 1, glow: 0x24103c },
  blister: { size: .92, glow: 0x461410 },
  filovirus: { size: 1.2, glow: 0x46100a },
  amoeba: { size: 1.12, glow: 0x24204a },
  rogue: { size: 1.15, glow: 0x46120e },
  // Hard-surface medical drone, built and texture-baked in Blender.
  'rogue-bot': { size: 1, glow: 0xffffff },
  // Its eight-legged ground sibling (tools/enemies/build_crawler.py); legs are separate nodes.
  crawler: { size: 1, glow: 0xffffff },
  // A human soldier: a skinned, motion-captured TRELLIS scan (tools/nanonaut/build_nanonaut.py), not
  // a morphing membrane, animated by nanonaut-view.mjs.
  nanonaut: { size: 1, glow: 0xffffff, humanoid: true },
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
  // The finale's second boss, a war machine built in Blender by tools/enemies/build_nanobot.py.
  'boss-nanobot': { size: 1, glow: 0xffffff },
});

// A fresnel rim light shared by every pathogen material, so silhouettes separate from tissue of
// the same hue, plus a faint shadow-side lift. world.mjs sets the colour and strength per arena (setPathogenRim).
const RIM = { pathogenRim: { value: new THREE.Color(0x9fd8ff) }, pathogenRimStrength: { value: .9 } };
export function setPathogenRim(color, strength) {
  RIM.pathogenRim.value.setHex(color);
  RIM.pathogenRimStrength.value = strength;
}
export function addPathogenRim(material) {
  if (!material || material.userData.pathogenRim || !('emissive' in material)) return material;
  material.userData.pathogenRim = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, RIM);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 pathogenRim;\nuniform float pathogenRimStrength;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimFacing = 1. - saturate(dot(normalize(normal), normalize(vViewPosition)));
        totalEmissiveRadiance += pathogenRim * pathogenRimStrength * rimFacing * rimFacing * rimFacing;
        // Shadow-side lift: light scattered through the membrane, tinted by the rim colour, with an
        // albedo floor so dark-shelled species keep their form instead of crushing to black.
        totalEmissiveRadiance += max(diffuseColor.rgb, vec3(.03)) * pathogenRim * .05;`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|pathogen-rim';
  return material;
}

// The medical drones have been inside the host a while: biofilm and dried fluid build up from
// their undersides and run down in streaks, worn wet and glossy, in a colour taken from the arena
// (setMachineGrime). Bounds map the model's own coordinates (often quantized) to a 0..1 box.
const GRIME = { grimeColor: { value: new THREE.Color(0x4a1012) } };
export function setMachineGrime(color) { GRIME.grimeColor.value.setHex(color); }
export function reapplyMachineGrime(clone) {
  const args = clone?.userData.grimeArgs;
  if (!args) return clone;
  clone.userData.machineGrime = false;
  return addMachineGrime(clone, new THREE.Box3(new THREE.Vector3(...args[0]), new THREE.Vector3(...args[1])), args[2]);
}
export function addMachineGrime(material, bounds, amount = 1) {
  if (!material || material.userData.machineGrime) return material;
  material.userData.machineGrime = true;
  // Plain numbers survive Material.clone(), which drops onBeforeCompile (see reapplyMachineGrime).
  material.userData.grimeArgs = [bounds.min.toArray(), bounds.max.toArray(), amount];
  const uniforms = { grimeMin: { value: bounds.min.clone() }, grimeSize: { value: bounds.getSize(new THREE.Vector3()).max(new THREE.Vector3(1e-4, 1e-4, 1e-4)) }, grimeAmount: { value: amount } };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, GRIME, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vGrimePos;\nvoid main() {')
      .replace('#include <project_vertex>', 'vGrimePos = transformed;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vGrimePos;
uniform vec3 grimeColor, grimeMin, grimeSize;
uniform float grimeAmount;
float grimeHash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float grimeNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(grimeHash(i), grimeHash(i + vec3(1, 0, 0)), f.x), mix(grimeHash(i + vec3(0, 1, 0)), grimeHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(grimeHash(i + vec3(0, 0, 1)), grimeHash(i + vec3(1, 0, 1)), f.x), mix(grimeHash(i + vec3(0, 1, 1)), grimeHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float grimeFbm(vec3 p) { return grimeNoise(p) * .55 + grimeNoise(p * 2.13) * .3 + grimeNoise(p * 4.37) * .15; }
void main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 grimeBox = (vGrimePos - grimeMin) / grimeSize;
  float grimeSpread = grimeFbm(grimeBox * 6.);
  float grimeLow = 1. - smoothstep(.0, .42, grimeBox.y + (grimeSpread - .5) * .3);
  float grimeRun = smoothstep(.58, .74, grimeFbm(vec3(grimeBox.x * 14., grimeBox.y * 1.6, grimeBox.z * 14.))) * (1. - smoothstep(.45, .8, grimeBox.y));
  float grimeSpots = smoothstep(.7, .8, grimeFbm(grimeBox * 11. + 3.1)) * .55;
  float grime = clamp(grimeLow * .9 + grimeRun * .7 + grimeSpots, 0., 1.) * grimeAmount;
  diffuseColor.rgb = mix(diffuseColor.rgb, grimeColor * (.5 + .8 * grimeSpread), grime * .85);
  diffuseColor.rgb *= 1. - grimeSpots * .25 * grimeAmount;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, .28, grime * .7);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, 0., grime * .8);');
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|machine-grime';
  return material;
}

// glTF clips keyed by the shared morph geometry, so every clone of a template finds its clip.
const clips = new WeakMap();
const loads = new Map();

// The Nanonaut's model: a skinned mesh and its clips. Its suit material keeps its baked PBR maps;
// the visor glows through the emission map, and it gets the pathogens' rim light so it reads
// against the tissue behind it.
function prepareHumanoid(type, gltf) {
  const root = new THREE.Group();
  root.name = type;
  gltf.scene.traverse(part => {
    if (!part.isMesh) return;
    part.castShadow = true;
    part.frustumCulled = false; // skinned: its bounds move with the pose
    [part.material].flat().forEach(material => {
      material.emissiveIntensity = 1.8;
      material.envMapIntensity = 1.1;
      addPathogenRim(material);
    });
  });
  root.add(gltf.scene);
  root.userData.humanoid = true;
  root.userData.clips = gltf.animations;
  return root;
}

// A placed copy of a template: skinned models need their own skeleton.
export function cloneEnemyModel(template) {
  return template?.userData.humanoid ? Object.assign(cloneSkinned(template), { userData: template.userData }) : template.clone();
}

function prepare(type, gltf) {
  if (ENEMY_MODELS[type].humanoid) return prepareHumanoid(type, gltf);
  const { size, glow, brighten = 1, tint } = ENEMY_MODELS[type];
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
  if (brighten !== 1) mesh.material.color.multiplyScalar(brighten);
  if (tint != null) {
    mesh.material = mesh.material.clone();
    mesh.material.color.multiply(new THREE.Color(tint));
  }
  // The Mega Nano Bot's baked optics, thruster rings and seams glow at full strength too.
  if (type === 'boss-nanobot') mesh.material.emissiveIntensity = 1.3;
  if (type === 'rogue-bot' || type === 'crawler') {
    // HDR optics and telemetry so the red eyes bloom, and grime on body and legs.
    mesh.material.emissiveIntensity = 1.3;
    gltf.scene.traverse(part => {
      if (!part.isMesh) return;
      part.geometry.computeBoundingBox();
      // Legs share the body's box would put them all "low"; they get their own lighter coat.
      [part.material].flat().forEach(material => addMachineGrime(material, part.geometry.boundingBox, part === mesh ? 1 : .55));
    });
  }
  const clip = gltf.animations.find(animation => animation.name === 'Idle') ?? gltf.animations[0];
  for (const track of clip?.tracks ?? []) {
    if (track.name.startsWith(meshName + '.')) track.name = 'attack-membrane' + track.name.slice(meshName.length);
  }
  if (clip && mesh.morphTargetDictionary) clips.set(mesh.geometry, clip);
  gltf.scene.traverse(part => { if (part.isMesh) [part.material].flat().forEach(addPathogenRim); });
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
    const url = new URL('./assets/enemies/' + (ENEMY_MODELS[type].file ?? type) + '.glb', import.meta.url).href;
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
  if (model.userData.humanoid) return createNanonautDisplay(model);
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
  if (motion.humanoid) { motion.update(dt); return; }
  motion.mixer.update(dt * (1 + Math.abs(clench) * 1.6));
  if (motion.clench !== undefined) motion.influences[motion.clench] = clench;
}
