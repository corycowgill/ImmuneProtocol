// The hard-edged raised ground (terrain.mjs): plaque shelves and low ridges, as lumpy fatty
// deposits with a glossy, slightly translucent coat. Mounds need no mesh: they are part of the
// floor (arena-scene.mjs shapeFloor).
import * as THREE from './vendor/three.module.js';
import { pieceTop } from './terrain.mjs';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { LOW_MEMORY } from './asset-loading.mjs';

// Phones and low-memory devices get lighter raised ground.
const SEGMENTS = LOW_MEMORY ? 28 : 48;

// Each arena's raised ground in its own tissue: [top colour, foot colour, clearcoat, roughness].
export const TERRAIN_LOOKS = {
  artery: [[.6, .42, .24], [.45, .14, .12], .35, .5],
  junction: [[.6, .42, .24], [.45, .14, .12], .35, .5],
  heart: [[.62, .3, .26], [.4, .1, .1], .45, .45],
  lungs: [[.86, .5, .55], [.5, .16, .22], .3, .62],
  stomach: [[.78, .38, .3], [.42, .12, .1], .7, .35],
  intestines: [[.88, .5, .44], [.5, .17, .16], .55, .42],
  colon: [[.58, .36, .3], [.32, .14, .12], .45, .5],
  lymph: [[.88, .78, .58], [.52, .32, .26], .3, .55],
  ear: [[.88, .85, .78], [.5, .44, .4], .75, .3],
  brain: [[.78, .58, .62], [.42, .22, .28], .35, .55],
};

function noise(x, y, z) {
  return Math.sin(x * 2.1 + z * 1.3) * Math.cos(z * 1.7 - y * 2.3) * .5 + Math.sin(x * 5.3 - z * 4.1 + y * 3.7) * .25 +
    Math.sin(x * 11.7 + y * 9.1 + z * 10.3) * .1;
}

const plaque = look => new THREE.MeshPhysicalMaterial({
  vertexColors: true, roughness: look[3], metalness: 0, clearcoat: look[2], clearcoatRoughness: .35,
  sheen: .25, sheenColor: new THREE.Color().setRGB(...look[0]), sheenRoughness: .6,
});

// Raised ground in the arena's own floor: the floor material's colour, texture and normal map,
// projected in world space on all three axes (so sheer sides do not stretch) at the floor's own
// scale, so a terrace's top reads as the same tissue as the ground around it. Vertex colours carry
// only shading (occlusion toward the foot, streaks, the stomach's acid tideline).
const FLOOR_UV = 4.6; // world metres per floor UV unit (arena-scene floorGeometry)
function floorMatched(floor, look) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  // The floor is lifted by its own ground shading (detail, caustics); match its overall brightness.
  material.color.copy(floor.color).multiplyScalar(1.22);
  for (const key of ['map', 'normalMap', 'roughnessMap']) if (floor[key]) material[key] = floor[key];
  if (floor.normalScale) material.normalScale.copy(floor.normalScale);
  material.roughness = floor.roughness ?? look[3];
  material.metalness = floor.metalness ?? 0;
  // Standard (not physical) lighting: no clearcoat or sheen layers; a wet look comes from lower roughness.
  material.roughness = Math.max(.2, material.roughness - (floor.clearcoat ?? 0) * .25);
  const scale = texture => ({ value: (texture?.repeat?.x ?? 1) / FLOOR_UV });
  const uniforms = { triScale: scale(floor.map), triNormalScale: scale(floor.normalMap), triRoughScale: scale(floor.roughnessMap) };
  // Each projection is sampled only where it carries weight: a flat top costs one fetch, not three.
  const sample = (name, factor) => `triplanar(${name}, ${factor})`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.)).xyz;\nvTriNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTriPos;
varying vec3 vTriNormal;
uniform float triScale, triNormalScale, triRoughScale;
vec3 triW;
vec4 triplanar(sampler2D t, float s) {
  vec4 c = vec4(0.);
  float w = 0.;
  if (triW.x > .03) { c += texture2D(t, vTriPos.zy * s) * triW.x; w += triW.x; }
  if (triW.y > .03) { c += texture2D(t, vTriPos.xz * s) * triW.y; w += triW.y; }
  if (triW.z > .03) { c += texture2D(t, vTriPos.xy * s) * triW.z; w += triW.z; }
  return c / max(w, .0001);
}`)
      .replace('#include <map_fragment>', `triW = pow(abs(normalize(vTriNormal)), vec3(4.));
triW /= triW.x + triW.y + triW.z;
#ifdef USE_MAP
diffuseColor *= ${sample('map', 'triScale')};
#endif`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
roughnessFactor *= ${sample('roughnessMap', 'triRoughScale')}.g;
#endif`)
      .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP
{
  vec3 wn = normalize(vTriNormal);
  vec3 nx = texture2D(normalMap, vTriPos.zy * triNormalScale).xyz * 2. - 1.;
  vec3 ny = texture2D(normalMap, vTriPos.xz * triNormalScale).xyz * 2. - 1.;
  vec3 nz = texture2D(normalMap, vTriPos.xy * triNormalScale).xyz * 2. - 1.;
  nx.xy *= normalScale; ny.xy *= normalScale; nz.xy *= normalScale;
  nx = vec3(nx.xy + wn.zy, abs(nx.z) * wn.x);
  ny = vec3(ny.xy + wn.xz, abs(ny.z) * wn.y);
  nz = vec3(nz.xy + wn.xy, abs(nz.z) * wn.z);
  vec3 worldNormal = normalize(nx.zyx * triW.x + ny.xzy * triW.y + nz.xyz * triW.z);
  normal = normalize((viewMatrix * vec4(worldNormal, 0.)).xyz);
}
#endif`);
  };
  material.customProgramCacheKey = () => 'terrain-floor-matched';
  return material;
}

function colorize(geometry, top, look, shadeOnly = false, tideline = 0) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const n = noise(x * 1.3, y * 1.3, z * 1.3);
    // Fatty yellow on top, blushing to tissue red where it meets the floor, with darker streaks.
    const up = THREE.MathUtils.clamp(y / Math.max(.1, top), 0, 1);
    if (shadeOnly) {
      // Occlusion toward the foot, faint streaks, and (stomach) a dark wet band where the acid sits.
      const shade = (.74 + .26 * up ** .7) * (.94 + n * .08) * (n > .38 ? .9 : 1);
      const wet = tideline ? 1 - .45 * Math.exp(-(((y - tideline) / .12) ** 2)) : 1;
      color.setRGB(shade * wet, shade * wet * (tideline ? .97 : 1), shade * wet * (tideline ? .9 : 1));
      color.toArray(colors, i * 3);
      continue;
    }
    const [r, g, b] = look[0];
    color.setRGB(r + n * .07, g * (.8 + up * .2) + n * .05, b * (.85 + up * .15));
    if (n > .38) color.multiplyScalar(.78);
    color.lerp(new THREE.Color().setRGB(...look[1]), (1 - up) * .6);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function lumpy(geometry, amount, scale = 1) {
  const position = geometry.attributes.position;
  const normal = new THREE.Vector3();
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    normal.fromBufferAttribute(normals, i);
    const push = noise(x * scale, y * scale, z * scale) * amount;
    position.setXYZ(i, x + normal.x * push, y + normal.y * push * .5, z + normal.z * push);
  }
  geometry.computeVertexNormals();
}

function shelfMesh(piece, material, baseFloor, look, options = {}) {
  const { radius, top } = piece;
  // Profile from buried foot to the flat top, with a rounded lip.
  // Rings across the top as well as down the side, so the top can carry folds and lumps.
  const profile = [
    [radius + .35, -.35], [radius + .32, 0], [radius + .2, top * .45], [radius + .06, top * .86],
    [radius - .12, top], ...[.82, .64, .46, .28, .12].map(f => [radius * f, top + .02]), [0, top + .02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, SEGMENTS);
  lumpy(geometry, .09, 1.6);
  if (options.rugae) {
    // Gastric rugae: parallel folds across the top that wander a little.
    const position = geometry.attributes.position;
    const angle = (piece.x * 12.9898 + piece.z * 78.233) % Math.PI;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      if (y < top - .1) continue;
      const x = position.getX(i), z = position.getZ(i);
      const along = x * dx + z * dz + Math.sin((x * dz - z * dx) * 1.3) * .35;
      position.setY(i, y + .07 * Math.sin(along * 3.4) * Math.min(1, (y - top + .1) / .1));
    }
    geometry.computeVertexNormals();
  }
  colorize(geometry, top, look, options.shadeOnly, options.tideline ?? 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(piece.x, baseFloor(piece.x, piece.z), piece.z);
  mesh.userData.piece = piece;
  mesh.userData.base = mesh.position.y;
  return mesh;
}

function ridgeMesh(piece, material, baseFloor, look, options = {}) {
  const length = Math.hypot(piece.x2 - piece.x1, piece.z2 - piece.z1);
  const half = piece.width / 2;
  const geometry = new THREE.CapsuleGeometry(half, length, LOW_MEMORY ? 5 : 8, LOW_MEMORY ? 12 : 18);
  geometry.rotateZ(Math.PI / 2);
  // Squash it into a low hump whose crest stands at the ridge's height.
  geometry.scale(1, piece.top / half, 1);
  lumpy(geometry, .07, 2.2);
  colorize(geometry, piece.top, look, options.shadeOnly);
  const mesh = new THREE.Mesh(geometry, material);
  const cx = (piece.x1 + piece.x2) / 2, cz = (piece.z1 + piece.z2) / 2;
  mesh.position.set(cx, baseFloor(cx, cz), cz);
  mesh.rotation.y = -Math.atan2(piece.z2 - piece.z1, piece.x2 - piece.x1);
  return mesh;
}

// floor: the arena's floor material; with it the raised ground wears the same tissue.
export function createTerrainView(pieces, baseFloor, area = 'artery', floor = null) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const look = TERRAIN_LOOKS[area] ?? TERRAIN_LOOKS.artery;
  const material = floor?.map || floor?.normalMap ? floorMatched(floor, look) : plaque(look);
  const options = { shadeOnly: material.customProgramCacheKey?.() === 'terrain-floor-matched', rugae: area === 'stomach', tideline: area === 'stomach' ? .34 : 0 };
  const breathing = [];
  for (const piece of pieces) {
    if (piece.kind === 'shelf') {
      const mesh = shelfMesh(piece, material, baseFloor, look, options);
      group.add(mesh);
      if (piece.breathe) breathing.push(mesh);
    }
    if (piece.kind === 'ridge') group.add(ridgeMesh(piece, material, baseFloor, look, options));
  }
  // Everything that stays put is baked into one mesh: an arena of islands or terraces is a single
  // draw call instead of one per piece. Breathing platforms move, so they stay separate.
  const still = group.children.filter(mesh => !breathing.includes(mesh));
  if (still.length > 1) {
    const indexed = still.every(mesh => mesh.geometry.index);
    const geometries = still.map(mesh => {
      mesh.updateMatrix();
      const geometry = indexed ? mesh.geometry.clone() : mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrix);
    });
    const merged = mergeGeometries(geometries);
    if (merged) {
      for (const mesh of still) { mesh.geometry.dispose(); group.remove(mesh); }
      for (const geometry of geometries) geometry.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'terrain-static';
      group.add(mesh);
    }
  }
  // Breathing platforms follow the simulation clock so they match where the suit stands.
  group.userData.update = time => {
    for (const mesh of breathing) {
      const { piece, base } = mesh.userData;
      mesh.position.y = base + pieceTop(piece, time) - piece.top;
    }
  };
  return group;
}
