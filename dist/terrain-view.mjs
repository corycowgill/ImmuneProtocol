// The hard-edged raised ground (terrain.mjs): plaque shelves and low ridges, as lumpy fatty
// deposits with a glossy, slightly translucent coat. Mounds need no mesh: they are part of the
// floor (arena-scene.mjs shapeFloor).
import * as THREE from './vendor/three.module.js';
import { pieceTop } from './terrain.mjs';

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

function colorize(geometry, top, look) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const n = noise(x * 1.3, y * 1.3, z * 1.3);
    // Fatty yellow on top, blushing to tissue red where it meets the floor, with darker streaks.
    const up = THREE.MathUtils.clamp(y / Math.max(.1, top), 0, 1);
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

function shelfMesh(piece, material, baseFloor, look) {
  const { radius, top } = piece;
  // Profile from buried foot to the flat top, with a rounded lip.
  const profile = [
    [radius + .35, -.35], [radius + .32, 0], [radius + .2, top * .45], [radius + .06, top * .86],
    [radius - .12, top], [radius * .55, top + .02], [0, top + .02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, 56);
  lumpy(geometry, .09, 1.6);
  colorize(geometry, top, look);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(piece.x, baseFloor(piece.x, piece.z), piece.z);
  mesh.userData.piece = piece;
  mesh.userData.base = mesh.position.y;
  return mesh;
}

function ridgeMesh(piece, material, baseFloor, look) {
  const length = Math.hypot(piece.x2 - piece.x1, piece.z2 - piece.z1);
  const half = piece.width / 2;
  const geometry = new THREE.CapsuleGeometry(half, length, 8, 18);
  geometry.rotateZ(Math.PI / 2);
  // Squash it into a low hump whose crest stands at the ridge's height.
  geometry.scale(1, piece.top / half, 1);
  lumpy(geometry, .07, 2.2);
  colorize(geometry, piece.top, look);
  const mesh = new THREE.Mesh(geometry, material);
  const cx = (piece.x1 + piece.x2) / 2, cz = (piece.z1 + piece.z2) / 2;
  mesh.position.set(cx, baseFloor(cx, cz), cz);
  mesh.rotation.y = -Math.atan2(piece.z2 - piece.z1, piece.x2 - piece.x1);
  return mesh;
}

export function createTerrainView(pieces, baseFloor, area = 'artery') {
  const group = new THREE.Group();
  group.name = 'terrain';
  const look = TERRAIN_LOOKS[area] ?? TERRAIN_LOOKS.artery;
  const material = plaque(look);
  const breathing = [];
  for (const piece of pieces) {
    if (piece.kind === 'shelf') {
      const mesh = shelfMesh(piece, material, baseFloor, look);
      group.add(mesh);
      if (piece.breathe) breathing.push(mesh);
    }
    if (piece.kind === 'ridge') group.add(ridgeMesh(piece, material, baseFloor, look));
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
