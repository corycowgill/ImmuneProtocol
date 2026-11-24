// The hard-edged raised ground (terrain.mjs): plaque shelves and low ridges, as lumpy fatty
// deposits with a glossy, slightly translucent coat. Mounds need no mesh: they are part of the
// floor (arena-scene.mjs shapeFloor).
import * as THREE from './vendor/three.module.js';

function noise(x, y, z) {
  return Math.sin(x * 2.1 + z * 1.3) * Math.cos(z * 1.7 - y * 2.3) * .5 + Math.sin(x * 5.3 - z * 4.1 + y * 3.7) * .25 +
    Math.sin(x * 11.7 + y * 9.1 + z * 10.3) * .1;
}

const plaque = () => new THREE.MeshPhysicalMaterial({
  vertexColors: true, roughness: .42, metalness: 0, clearcoat: .55, clearcoatRoughness: .3,
  sheen: .4, sheenColor: new THREE.Color(0xffe2b8), sheenRoughness: .6,
});

function colorize(geometry, top) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const n = noise(x * 1.3, y * 1.3, z * 1.3);
    // Fatty yellow on top, blushing to tissue red where it meets the floor, with darker streaks.
    const up = THREE.MathUtils.clamp(y / Math.max(.1, top), 0, 1);
    color.setRGB(.86 + n * .08, .58 + up * .2 + n * .06, .4 + up * .12);
    if (n > .38) color.multiplyScalar(.82);
    color.lerp(new THREE.Color(.62, .26, .24), (1 - up) * .55);
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

function shelfMesh(piece, material, baseFloor) {
  const { radius, top } = piece;
  // Profile from buried foot to the flat top, with a rounded lip.
  const profile = [
    [radius + .35, -.35], [radius + .32, 0], [radius + .2, top * .45], [radius + .06, top * .86],
    [radius - .12, top], [radius * .55, top + .02], [0, top + .02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, 56);
  lumpy(geometry, .09, 1.6);
  colorize(geometry, top);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(piece.x, baseFloor(piece.x, piece.z), piece.z);
  return mesh;
}

function ridgeMesh(piece, material, baseFloor) {
  const length = Math.hypot(piece.x2 - piece.x1, piece.z2 - piece.z1);
  const half = piece.width / 2;
  const geometry = new THREE.CapsuleGeometry(half, length, 8, 18);
  geometry.rotateZ(Math.PI / 2);
  // Squash it into a low hump whose crest stands at the ridge's height.
  geometry.scale(1, piece.top / half, 1);
  lumpy(geometry, .07, 2.2);
  colorize(geometry, piece.top);
  const mesh = new THREE.Mesh(geometry, material);
  const cx = (piece.x1 + piece.x2) / 2, cz = (piece.z1 + piece.z2) / 2;
  mesh.position.set(cx, baseFloor(cx, cz), cz);
  mesh.rotation.y = -Math.atan2(piece.z2 - piece.z1, piece.x2 - piece.x1);
  return mesh;
}

export function createTerrainView(pieces, baseFloor) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const material = plaque();
  for (const piece of pieces) {
    if (piece.kind === 'shelf') group.add(shelfMesh(piece, material, baseFloor));
    if (piece.kind === 'ridge') group.add(ridgeMesh(piece, material, baseFloor));
  }
  return group;
}
