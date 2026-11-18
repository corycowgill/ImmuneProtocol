import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';
import { COOP_SUITS, DEFAULT_COOP_SUIT } from './coop-protocol.mjs';
import { SUIT_MODELS } from './suit-models.mjs';

// Co-op suit catalog. The photoreal models are authored and texture-baked in
// Blender by tools/suits/build_suits_hq.py (dist/assets/suits/<id>.glb). The
// lightweight primitive recipe in suit-models.mjs, from tools/suits/build_suits.py,
// is worn while a GLB streams in or if it fails to load.
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

const SUIT_KEY = 'immune-protocol.coop-suit';

export function savedSuit() {
  try { return normalizeSuit(localStorage.getItem(SUIT_KEY)); } catch { return DEFAULT_COOP_SUIT; }
}

export function saveSuit(id) {
  try { localStorage.setItem(SUIT_KEY, normalizeSuit(id)); } catch { /* Storage can be disabled. */ }
}

// Box with rounded edges: inner lattice lines sit at the bevel start, outer
// vertices are pushed onto the bevel arc.
function roundedBox(width, height, depth, radius) {
  const half = [width / 2, height / 2, depth / 2];
  const bevel = Math.min(radius, ...half.map(value => value * .45));
  const geometry = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
  if (bevel <= .001) {
    geometry.scale(width, height, depth);
    return geometry;
  }
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const inner = new THREE.Vector3();
  const outward = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = position.getComponent(index, axis);
      const edge = Math.abs(value) > .4;
      const sign = Math.sign(value) || 1;
      inner.setComponent(axis, sign * (half[axis] - bevel) * (edge ? 1 : Math.abs(value) * 6));
      outward.setComponent(axis, edge ? sign : 0);
    }
    outward.normalize();
    position.setXYZ(index, inner.x + outward.x * bevel, inner.y + outward.y * bevel, inner.z + outward.z * bevel);
    normal.setXYZ(index, outward.x, outward.y, outward.z);
  }
  return geometry;
}

const AXES = {
  y: new THREE.Euler(0, 0, 0),
  x: new THREE.Euler(0, 0, Math.PI / 2),
  z: new THREE.Euler(Math.PI / 2, 0, 0),
};
const TORUS_AXES = {
  y: new THREE.Euler(Math.PI / 2, 0, 0),
  x: new THREE.Euler(0, Math.PI / 2, 0),
  z: new THREE.Euler(0, 0, 0),
};

function primitive([kind, , center, ...shape]) {
  let geometry;
  const transform = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  // Blender XYZ Euler, converted from Blender to game axes, is a game-space YZX Euler.
  const euler = (values = [0, 0, 0]) => new THREE.Euler(values[0], values[1], values[2], 'YZX');
  if (kind === 'box') {
    const [size, rot, bevel] = shape;
    geometry = roundedBox(size[0], size[1], size[2], bevel);
    rotation.makeRotationFromEuler(euler(rot));
  } else if (kind === 'ball') {
    const [radii, rot, segments, rings] = shape;
    geometry = new THREE.SphereGeometry(1, segments, rings);
    geometry.scale(radii[0], radii[1], radii[2]);
    rotation.makeRotationFromEuler(euler(rot));
  } else if (kind === 'cyl') {
    const [radius, top, depth, axis, rot, verts] = shape;
    geometry = new THREE.CylinderGeometry(top, radius, depth, verts);
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(AXES[axis]));
    rotation.makeRotationFromEuler(euler(rot));
  } else {
    const [major, minor, axis, scale] = shape;
    geometry = new THREE.TorusGeometry(major, minor, 10, 32);
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(TORUS_AXES[axis]));
    geometry.scale(scale[0], scale[1], scale[2]);
  }
  transform.makeTranslation(center[0], center[1], center[2]).multiply(rotation);
  geometry.applyMatrix4(transform);
  geometry.deleteAttribute('uv');
  return geometry.index ? geometry : null;
}

function mergeGeometries(geometries) {
  let vertices = 0;
  let indices = 0;
  for (const geometry of geometries) {
    vertices += geometry.attributes.position.count;
    indices += geometry.index.count;
  }
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const index = new (vertices > 65535 ? Uint32Array : Uint16Array)(indices);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const geometry of geometries) {
    position.set(geometry.attributes.position.array, vertexOffset * 3);
    normal.set(geometry.attributes.normal.array, vertexOffset * 3);
    const source = geometry.index.array;
    for (let item = 0; item < source.length; item++) index[indexOffset + item] = source[item] + vertexOffset;
    vertexOffset += geometry.attributes.position.count;
    indexOffset += source.length;
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}

function createMaterial({ color, metalness, roughness, emissive, emissiveIntensity = 0, opacity = 1 }) {
  const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  if (emissive) {
    material.emissive.set(emissive);
    material.emissiveIntensity = Math.min(3, emissiveIntensity);
  }
  if (opacity < 1) {
    Object.assign(material, { transparent: true, opacity, depthWrite: false });
  }
  return material;
}

const models = new Map();
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
    if (!Object.hasOwn(SUIT_MODELS[id].parts, node.name)) continue;
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
  return parts.size === Object.keys(SUIT_MODELS[id].parts).length ? parts : null;
}

// Streams the textured Blender model for a suit. Resolves to the part map, or
// null if the file is unavailable (the primitive recipe stays in use).
export function loadSuitModel(id) {
  if (!Object.hasOwn(SUIT_MODELS, id)) return Promise.resolve(null);
  if (!glbLoads.has(id)) {
    const url = new URL('./assets/suits/' + id + '.glb', import.meta.url).href;
    glbLoads.set(id, new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url).then(gltf => {
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

export const loadSuitModels = () => Promise.all(COOP_SUITS.map(loadSuitModel));

function buildSuit(id) {
  const { materials: definitions, parts: recipe } = SUIT_MODELS[id];
  const materials = Object.fromEntries(Object.entries(definitions).map(([name, value]) => [name, createMaterial(value)]));
  const parts = new Map();
  for (const [joint, items] of Object.entries(recipe)) {
    const byMaterial = new Map();
    for (const item of items) {
      const geometry = primitive(item);
      if (!geometry) continue;
      if (!byMaterial.has(item[1])) byMaterial.set(item[1], []);
      byMaterial.get(item[1]).push(geometry);
    }
    const group = new THREE.Group();
    group.name = id + ' ' + joint;
    for (const [name, geometries] of byMaterial) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), materials[name]);
      if (materials[name].transparent) mesh.renderOrder = 2;
      group.add(mesh);
    }
    parts.set(joint, group);
  }
  return parts;
}

// Returns a Map of rig joint name -> Object3D template to clone onto that joint.
export function suitParts(id) {
  if (!Object.hasOwn(SUIT_MODELS, id)) return null;
  if (glbModels.has(id)) return glbModels.get(id);
  loadSuitModel(id);
  // Fallback: the primitive recipe is worn only until the GLB arrives (or if it fails).
  if (!models.has(id)) console.info('Suit ' + id + ': showing the primitive stand-in while the scanned model loads');
  if (!models.has(id)) models.set(id, buildSuit(id));
  return models.get(id);
}
