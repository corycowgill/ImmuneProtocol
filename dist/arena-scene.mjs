// Builds the shared arena: the tissue floor and walls, vessels and growths, the drifting
// atmosphere, the Capillary Junction inlets and Heart Valve chamber, and the tissue nodes with
// their wounds. World (world.mjs) creates these once and shows the parts each mission needs.
import * as THREE from './vendor/three.module.js';
import { JUNCTION_GASH_SITES, JUNCTION_INLETS } from './simulation.mjs';
import { ARENA_GROWTH } from './arena-scale.mjs';
import { chunkInstances } from './decor-chunks.mjs';
import { cloudTexture, membraneMaps } from './arena-textures.mjs';
import { floorTerrainHeight, terrainFor } from './terrain.mjs';

// A full turn, and the world's up axis.
export const TAU = Math.PI * 2;
export const UP = new THREE.Vector3(0, 1, 0);

// The tissue shell sits a little outside the playable ellipse (ARENA in simulation.mjs).
const CHAMBER_WIDTH = Math.round(51 * ARENA_GROWTH);
const CHAMBER_DEPTH = Math.round(71 * ARENA_GROWTH);

// Horizontal stretch applied to anatomy that was laid out for the original, smaller arenas.
const LAYOUT_SCALE = 1.45 * ARENA_GROWTH;
const WALL_HEIGHT = 22;

// The gentle undulation of the tissue floor itself.
export function baseFloorHeight(x, z) {
  return .115 * Math.sin(x * .67 + z * .16) * Math.cos(z * .46)
    + .075 * Math.cos(z * .98 - x * .24) + .035 * Math.sin(x * 2.8 + z * 1.7);
}

// The arena whose raised ground (terrain.mjs) the floor currently carries.
let activeTerrain = [];
export function setTerrainArea(area) {
  activeTerrain = terrainFor(area);
}

// The visible floor: the undulation plus the current arena's plaque mounds.
export function floorHeight(x, z) {
  return baseFloorHeight(x, z) + (activeTerrain.length ? floorTerrainHeight(activeTerrain, x, z) : 0);
}

// How far inside the chamber wall a point is, as a fraction of the wall's reach at that angle and
// height (positive inside, negative beyond the wall). Used to land shots on the wall.
export function wallMargin(x, y, z) {
  const angle = Math.atan2(z / CHAMBER_DEPTH, x / CHAMBER_WIDTH);
  const reach = wallPosition(angle, y);
  return Math.hypot(reach.x / CHAMBER_WIDTH, reach.z / CHAMBER_DEPTH) - Math.hypot(x / CHAMBER_WIDTH, z / CHAMBER_DEPTH);
}

function wallPosition(angle, height) {
  const ripple = 1 + Math.sin(angle * 7 + height * .23) * .044
    + Math.cos(angle * 13 - height * .28) * .018
    + Math.sin(angle * 3 + height * .18) * .023;
  const arch = 1 - .22 * (height / 20) ** 3 - .03 * Math.cos(height * 1.12 + angle * 5);
  return new THREE.Vector3(Math.cos(angle) * CHAMBER_WIDTH * ripple * arch, height,
    Math.sin(angle) * CHAMBER_DEPTH * ripple * arch);
}

function colorGeometry(geometry, paint) {
  const vertices = geometry.attributes.position;
  const colors = new Float32Array(vertices.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < vertices.count; i++) {
    paint(color, vertices.getX(i), vertices.getY(i), vertices.getZ(i));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function floorGeometry() {
  const geometry = new THREE.PlaneGeometry(2 * CHAMBER_WIDTH + 8, 2 * CHAMBER_DEPTH + 8, 190, 240);
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) uv.setXY(i, vertices.getX(i) / 4.6, vertices.getZ(i) / 4.6);
  shapeFloor(geometry);
  return geometry;
}

// Lifts the shared floor to the current arena's ground (see setTerrainArea) and tints raised
// plaque a fatty yellow so the rises read from across the chamber.
export function shapeFloor(geometry) {
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const z = vertices.getZ(i);
    const edge = Math.max(0, Math.hypot(x / CHAMBER_WIDTH, z / CHAMBER_DEPTH) - .86);
    vertices.setY(i, floorHeight(x, z) + edge * edge * 5);
  }
  vertices.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  colorGeometry(geometry, (color, x, y, z) => {
    const p = Math.sin(x * .35 + z * .5) * .5 + Math.cos(z * .26 - x * .61) * .5;
    const rim = Math.max(0, Math.hypot(x / CHAMBER_WIDTH, z / CHAMBER_DEPTH) - .45);
    color.setRGB(.92 + p * .12 - rim * .23, .74 + p * .12 - rim * .2, .69 + p * .12 - rim * .13);
    const plaque = activeTerrain.length ? Math.min(1, floorTerrainHeight(activeTerrain, x, z) / .9) : 0;
    if (plaque > 0) color.lerp(PLAQUE.setRGB(1.02 + p * .06, .86 + p * .05, .58), plaque * .7);
  });
}
const PLAQUE = new THREE.Color();

function wallGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1, 220, 52);
  const vertices = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) {
    const angle = uv.getX(i) * TAU;
    const height = uv.getY(i) * WALL_HEIGHT - .5;
    const point = wallPosition(angle, height);
    vertices.setXYZ(i, point.x, point.y, point.z);
    uv.setXY(i, angle * 7.5, height / 3.3 + Math.sin(angle * 8) * .16);
  }
  geometry.computeVertexNormals();
  colorGeometry(geometry, (color, x, y, z) => {
    const mottling = Math.sin(x * .47 + z * .26 - y * .9) * .14
      + Math.cos(z * .71 + x * .12 + y * .62) * .12;
    color.setRGB(.78 + mottling, .64 + mottling, .6 + mottling * .7);
  });
  return geometry;
}

export function texturedLobe(radius, segments = 24, rings = 16, strength = .16) {
  const geometry = new THREE.SphereGeometry(radius, segments, rings);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / radius;
    const y = positions.getY(i) / radius;
    const z = positions.getZ(i) / radius;
    const density = 1 + strength * (.5 * Math.sin(x * 7.2 + y * 3) * Math.sin(z * 7 + y * 1.3)
      + .33 * Math.cos(y * 12 - z * 4) + .2 * Math.sin(x * 17 + z * 4));
    positions.setXYZ(i, x * radius * density, y * radius * density, z * radius * density);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function tubeGeometry(points, radius, tip = .24, lengthSegments = 28, radialSegments = 8) {
  const path = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(path, lengthSegments, radius, radialSegments, false);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let ring = 0; ring <= lengthSegments; ring++) {
    const along = ring / lengthSegments;
    const center = path.getPointAt(along);
    const taper = 1 - Math.pow(along, 1.6) * (1 - tip);
    for (let index = 0; index <= radialSegments; index++) {
      const i = ring * (radialSegments + 1) + index;
      const angle = TAU * index / radialSegments;
      const r = taper * (1 + Math.sin(along * 45 + angle * 3) * .043);
      position.setXYZ(i,
        center.x + (position.getX(i) - center.x) * r,
        center.y + (position.getY(i) - center.y) * r,
        center.z + (position.getZ(i) - center.z) * r);
      uv.setXY(i, uv.getX(i) * Math.max(1, path.getLength() / 2.2), uv.getY(i));
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function redCellGeometry() {
  const profile = [[0, -.089], [.19, -.091], [.38, -.12], [.55, -.17],
    [.72, -.21], [.85, -.185], [.96, -.119], [1, 0],
    [.96, .119], [.85, .185], [.72, .21], [.55, .17], [.38, .12], [.19, .091], [0, .089]];
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  colorGeometry(geometry, (color, x, y, z) => {
    const ring = Math.hypot(x, z);
    const tone = .64 + ring * .3 + Math.sin(x * 13 + z * 7) * .055;
    color.setRGB(tone, tone * .61, tone * .63);
  });
  return geometry;
}

export function sprite(texture, color, scale, opacity, blend = THREE.AdditiveBlending) {
  const object = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color,
    opacity,
    depthWrite: false,
    transparent: true,
    blending: blend,
  }));
  object.scale.set(scale, scale, 1);
  return object;
}

function instanceMesh(group, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  group.add(mesh);
  return mesh;
}

export function setInstance(mesh, index, transform, position, scale) {
  transform.position.copy(position);
  transform.scale.set(...scale);
  transform.updateMatrix();
  mesh.setMatrixAt(index, transform.matrix);
}

export function addMesh(group, geometry, material, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.copy(position);
  if (scale) mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

function addVessel(group, material, coordinates, radius, tip = .3) {
  const points = coordinates.map((point) => new THREE.Vector3(...point));
  return addMesh(group, tubeGeometry(points, radius, tip), material);
}

function capillaryTunnel(side, offset) {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 12.3, 1.42, -15.6),
    new THREE.Vector3(side * 15.6, 1.51, -18.9),
    new THREE.Vector3(side * 18.6, 1.62, -23.6),
    new THREE.Vector3(side * 23.7, 2.08, -27.7),
    new THREE.Vector3(side * 28.8, 2.54, -28.3),
  ].map(point => point.add(offset)));
  const crossSection = (along) => {
    const center = path.getPointAt(along);
    const tangent = path.getTangentAt(along);
    const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const flare = (1 - along) ** 2;
    const width = 2.63 + 2.25 * flare;
    const height = 2.33 + 1.74 * flare;
    const folds = 1 + .077 * Math.cos(along * 63) + .045 * Math.sin(along * 93);
    return (angle) => {
      const shape = folds + .044 * Math.sin(angle * 7 + along * 15) + .055 * Math.cos(angle * 3 - along * 8);
      const point = center.clone().addScaledVector(lateral, Math.cos(angle) * width * shape);
      point.y += Math.sin(angle) * height * shape;
      return point;
    };
  };
  const angleAt = (t) => -.53 + t * (Math.PI + 1.06);
  const geometry = new THREE.PlaneGeometry(1, 1, 44, 32);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  const sections = Array.from({ length: 45 }, (_, i) => crossSection(i / 44));

  for (let i = 0; i < positions.count; i++) {
    const along = uvs.getX(i);
    const point = sections[Math.round(along * 44)](angleAt(uvs.getY(i)));
    positions.setXYZ(i, point.x, point.y, point.z);
    uvs.setXY(i, along * 5.1, uvs.getY(i) * 3.35);
  }
  geometry.computeVertexNormals();
  colorGeometry(geometry, (color, x, y, z) => {
    const pigment = Math.cos(x * 1.24 + y * 1.11 - z * .76) * .09
      + Math.sin(z * 1.64 + x * .31) * .07;
    color.setRGB(.91 + pigment, .68 + pigment, .61 + pigment * .76);
  });
  const lips = [0, .13, .28].map((along, i) => {
    const section = crossSection(along);
    const points = Array.from({ length: 15 }, (_, j) => section(angleAt(j / 14)));
    return tubeGeometry(points, .31 - i * .067, .63, 29, 9);
  });
  return { geometry, lips };
}

function makeJunction(scene, skin, glow) {
  const junction = new THREE.Group();
  scene.add(junction);
  const lining = skin({
    color: 0xe1bdb3, side: THREE.DoubleSide, vertexColors: true, roughness: .48,
    clearcoat: .66, clearcoatRoughness: .37, normalScale: new THREE.Vector2(.9, .9),
  });
  const lip = skin({ color: 0xcd9587, roughness: .43, clearcoat: .61 });
  const vein = skin({ color: 0xc16662, roughness: .41, clearcoat: .69 });
  const veins = [];

  const entrances = [
    { side: -1, light: 0xffa258, haze: 0xffa66c },
    { side: 1, light: 0x70d8d1, haze: 0x78d6d8 },
  ];
  for (const { side, light, haze } of entrances) {
    const inlet = JUNCTION_INLETS[side < 0 ? 'left' : 'right'];
    const offset = new THREE.Vector3(inlet.x - side * 12.3, inlet.y - 1.42, inlet.z + 15.6);
    const tunnel = capillaryTunnel(side, offset);
    addMesh(junction, tunnel.geometry, lining);
    addMesh(junction, joinTubes(tunnel.lips), lip);
    const points = (coordinates) => coordinates.map(([x, y, z]) => new THREE.Vector3(x * side, y, z).add(offset));
    veins.push(
      tubeGeometry(points([[23, 0, 11], [22, 4.3, 6], [20, 6.2, 1], [17, 6.8, -6],
        [13.4, 6.3, -12], [12.3, 5.4, -16.4], [13.8, 5.35, -20.6]]), .75, .38, 28, 10),
      tubeGeometry(points([[17.5, 6.6, -4.9], [15.5, 6.5, -7.6], [12.8, 6.1, -10.2],
        [10.1, 5.7, -13.2], [7.9, 3.9, -17.8]]), .39, .39, 21, 8),
      tubeGeometry(points([[21, 0, -12], [19.3, 1.8, -12], [17.1, 3.1, -12.9],
        [14.8, 4.43, -14.9], [13.4, 5.19, -16.4]]), .48, .45, 22, 8),
      tubeGeometry(points([[9.3, .08, -17.1], [7.7, .21, -18.4], [5.7, .31, -19.6],
        [3.7, .37, -21.7], [1.8, .57, -26.6]]), .39, .49, 18, 8),
    );

    const branchLight = new THREE.PointLight(light, 198, 26, 2);
    branchLight.position.set(side * 16.8, 2.65, -20.7).add(offset);
    junction.add(branchLight);

    const entranceHaze = sprite(glow, haze, 6.9, .43);
    entranceHaze.position.set(side * 16.7, 2.4, -20.4).add(offset);
    entranceHaze.scale.y *= .87;
    junction.add(entranceHaze);
    const farHaze = sprite(glow, haze, 3.35, .64);
    farHaze.position.set(side * 20.2, 2.75, -23.1).add(offset);
    farHaze.scale.y *= 1.28;
    junction.add(farHaze);
  }

  veins.push(
    tubeGeometry([[-22.5, 8.9, -24.2], [-14.6, 7.9, -20.4], [-6.4, 7.45, -22.9], [-1.1, 6.17, -25.7],
      [2.7, 6.57, -25.1], [11.9, 7.58, -21.5], [19.1, 7.66, -22.6], [24.5, 8.3, -25.6]].map((point) => new THREE.Vector3(...point)),
    .91, .54, 24, 10),
  );
  addMesh(junction, joinTubes(veins), vein);

  const ridge = addMesh(junction, texturedLobe(1, 28, 20, .12), lip,
    new THREE.Vector3(.35, 9.4, -25.3), [5.4, 5.8, 4.4]);
  ridge.rotation.set(.11, -.23, -.17);
  return junction;
}

function makeHeartChamber(scene, skin, glow) {
  const chamber = new THREE.Group();
  scene.add(chamber);
  const muscle = skin({ color: 0xad707e, roughness: .58, clearcoat: .62, sheen: .42,
    sheenColor: 0xed8c87 });
  const tendon = skin({ color: 0xd79695, roughness: .49, clearcoat: .68 });
  const lobe = texturedLobe(1, 31, 19, .20);
  const ridges = [];
  for (const side of [-1, 1]) {
    const ribs = [
      [17.1, 1.1, -5.5, 2.3, 4.8, 5.8, -.21],
      [17.8, .7, 3.4, 2.2, 4.6, 5.5, -.14],
      [17.9, 1.2, 10.4, 2.7, 4.2, 5.9, .27],
      [16.4, .8, 17.8, 2.7, 4.9, 6.0, .43],
      [11.1, .8, 25.4, 2.1, 3.8, 5.4, .93],
      [5.5, 1.7, 25.9, 4.5, 3.9, 3.3, -.25],
      [10.8, .6, -13.4, 6.4, 2.7, 2.3, .10],
    ];
    for (const [x, y, z, width, height, depth, tilt] of ribs) {
      const rib = addMesh(chamber, lobe, muscle, new THREE.Vector3(x * side, y, z), [width, height, depth]);
      rib.rotation.set(.06, tilt * side, -.23 * side);
    }
    const points = (coords) => coords.map(([x, y, z]) => new THREE.Vector3(x * side, y, z));
    ridges.push(tubeGeometry(points([[5.3, .4, -11.7], [9.4, .55, -10.5], [13.6, 1.16, -10.5],
      [15.1, 2.7, -6.4], [15.3, 2.2, 2.6], [16.0, 3.6, 10.5], [14.4, 2.8, 18.4],
      [8.3, 2.1, 22.9], [2.8, .46, 23.6]]), .58, .55, 40, 9));
    ridges.push(tubeGeometry(points([[15.6, 1.15, 15.7], [13.3, .48, 17.8], [10.8, .36, 19.8],
      [7.3, .23, 21.1], [4.6, .19, 21.7]]), .39, .25, 20, 8));
  }
  addMesh(chamber, lobe, muscle, new THREE.Vector3(.25, 1.3, 25.9), [4.3, 3.65, 3.45]);
  addMesh(chamber, joinTubes(ridges), tendon);
  const light = new THREE.PointLight(0xf09a86, 53, 19, 2);
  light.position.set(12.4, 3.1, 13.7);
  chamber.add(light);
  const haze = sprite(glow, 0xdb978c, 11, .18);
  haze.position.set(12.4, 2.4, 16.7);
  chamber.add(haze);
  return chamber;
}

export function makeRoom(scene, tile, normal, glow, random) {
  const surfaces = [];
  const arteryDetails = new THREE.Group();
  scene.add(arteryDetails);
  const skin = (options) => {
    const material = new THREE.MeshPhysicalMaterial({
      map: tile,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      color: 0xffffff,
      roughness: .47,
      clearcoat: .54,
      clearcoatRoughness: .33,
      ...options,
    });
    surfaces.push(material);
    return material;
  };

  const floor = addMesh(scene, floorGeometry(), skin({ vertexColors: true, roughness: .46 }));
  const wall = addMesh(scene, wallGeometry(), skin({ vertexColors: true, side: THREE.DoubleSide, roughness: .56 }));

  const roof = new THREE.PlaneGeometry(CHAMBER_WIDTH * 2, CHAMBER_DEPTH * 2, 54, 76);
  roof.rotateX(Math.PI / 2);
  const roofVertices = roof.attributes.position;
  const roofUv = roof.attributes.uv;
  for (let i = 0; i < roofVertices.count; i++) {
    const x = roofVertices.getX(i);
    const z = roofVertices.getZ(i);
    const edge = Math.min(1, Math.hypot(x / CHAMBER_WIDTH, z / CHAMBER_DEPTH));
    roofVertices.setY(i, 18.5 + (1 - edge ** 2) * 6.5 + Math.cos(x * .41 + z * .25) * .9);
    roofUv.setXY(i, x / 3.7, z / 3.7);
  }
  roof.computeVertexNormals();
  const canopy = addMesh(scene, roof, skin({ color: 0x9e6768, side: THREE.DoubleSide, roughness: .66 }));

  const lobeMaterial = skin({ color: 0xeca5a3, roughness: .41, clearcoat: .55 });
  const vesselMaterial = skin({ color: 0xdb7f82, roughness: .36, clearcoat: .78 });
  const tinyVesselMaterial = skin({ color: 0xdf9193, roughness: .32, clearcoat: .68 });
  const lobe = texturedLobe(1, 32, 20, .24);
  const transform = new THREE.Object3D();
  const folds = instanceMesh(scene, lobe, lobeMaterial, 96);

  for (let i = 0; i < folds.count; i++) {
    const angle = i / folds.count * TAU + random() * .055;
    const height = 1.1 + random() * 13;
    const center = wallPosition(angle, height);
    center.x *= .995;
    center.z *= .995;
    const width = 1.5 + random() * 2.9;
    transform.rotation.set(random() * .53 - .28, -angle, .2 + random() * .55);
    setInstance(folds, i, transform, center, [1.5 + random() * 2, 2.3 + random() * 4.7, width]);
    folds.setColorAt(i, new THREE.Color().setRGB(.66 + random() * .33, .55 + random() * .29, .54 + random() * .24));
  }

  const branches = [
    { points: [[-21, 1, 25], [-19, 7, 19], [-16, 9, 11], [-10, 12, 6], [-1, 13, 2], [12, 14, -1], [20, 10, -10]], radius: .86 },
    { points: [[-19, 6.8, 19], [-15, 7.7, 11], [-10, 9.8, 7], [-3, 12, 7], [3, 12.2, 12]], radius: .46 },
    { points: [[-14, 9.7, 9], [-18, 9.8, 1], [-20, 8.3, -5], [-16, 5.4, -16], [-14, 3.9, -23]], radius: .47 },
    { points: [[19, -.7, 17], [19, 3, 12], [18, 5.5, 6], [13, 8.4, .7], [4, 10.6, -4], [-4, 12.4, -11], [-10, 13, -22]], radius: 1.05 },
    { points: [[19, 2.4, 12], [17, 3.8, 8], [13, 5.5, 7], [10, 5.9, 5.5], [9, 6.7, 3]], radius: .39 },
    { points: [[18, 5.6, 5.5], [16.5, 6.7, -.5], [16.5, 7.7, -5], [15, 7.8, -11], [12, 7.5, -15]], radius: .44 },
    { points: [[-16, 0, -24], [-13, 5, -22], [-11, 7.3, -20], [-4, 8.8, -23], [0, 8.7, -29], [8, 10.2, -29], [16, 8.2, -25]], radius: .64 },
    { points: [[-13, 5, -22], [-10, 4.1, -24], [-9, 3.4, -27], [-8, 3.1, -31]], radius: .23 },
    { points: [[13, 1.5, -28], [15, 3.9, -25], [15, 6.2, -19], [19, 10, -13]], radius: .58 },
    { points: [[12, 1.3, -29], [11, 2.7, -27], [10, 3.4, -25], [8, 4.8, -24]], radius: .29 },
    { points: [[-11, 2.2, 28], [-13, 6, 25], [-13, 9.1, 20], [-8, 13, 17], [2, 15, 18]], radius: .57 },
    { points: [[18, 1, 23], [14, 4.4, 24], [9, 7.2, 24], [6, 8.7, 28], [3, 9.4, 32]], radius: .48 },
  ];
  for (const { points, radius } of branches) addVessel(arteryDetails, vesselMaterial, points, radius, .37);

  for (let i = 0; i < 70; i++) {
    const angle = random() * TAU;
    const low = random() * 12;
    const sweep = (random() - .5) * .5;
    const points = [];
    for (let j = 0; j < 5; j++) {
      const position = wallPosition(angle + sweep * j / 4 + (random() - .5) * .1, low + j * 1.3);
      position.x *= .88 + random() * .055;
      position.z *= .88 + random() * .055;
      points.push(position);
    }
    addMesh(scene, tubeGeometry(points, .054 + random() * .1, .15, 15, 5), tinyVesselMaterial);
  }

  const growthMaterial = skin({ color: 0xc88d8f, roughness: .37, clearcoat: .6 });
  const growths = instanceMesh(scene, texturedLobe(1, 12, 8, .32), growthMaterial, 1700);
  const patch = new THREE.Vector3();
  const ciliaGeometry = tubeGeometry([
    new THREE.Vector3(0, -.2, 0), new THREE.Vector3(.02, .1, .02),
    new THREE.Vector3(.02, .45, .09), new THREE.Vector3(.12, .69, .16),
  ], .068, .22, 7, 5);
  const cilia = instanceMesh(scene, ciliaGeometry, tinyVesselMaterial, 1150);

  for (let i = 0; i < growths.count; i++) {
    const angle = random() * TAU;
    const radial = .21 + Math.sqrt(random()) * .76;
    const x = Math.cos(angle) * (CHAMBER_WIDTH - 2) * radial;
    const z = Math.sin(angle) * (CHAMBER_DEPTH - 2) * radial;
    const edge = Math.hypot(x / (CHAMBER_WIDTH - 3), z / (CHAMBER_DEPTH - 3));
    const size = .035 + random() ** 3 * (edge > .73 ? .92 : .22);
    patch.set(x, floorHeight(x, z) - size * .24, z);
    transform.rotation.set(.1, random() * TAU, (random() - .5) * .4);
    setInstance(growths, i, transform, patch, [size, size * (.48 + random()), size * (.7 + random() * .4)]);
    growths.setColorAt(i, new THREE.Color().setRGB(.55 + random() * .45, .29 + random() * .61, .33 + random() * .45));
  }

  for (let i = 0; i < cilia.count; i++) {
    const angle = random() * TAU;
    const radial = .27 + Math.sqrt(random()) * .72;
    const x = Math.cos(angle) * (CHAMBER_WIDTH - 2) * radial;
    const z = Math.sin(angle) * (CHAMBER_DEPTH - 2) * radial;
    const edge = Math.hypot(x / (CHAMBER_WIDTH - 3), z / (CHAMBER_DEPTH - 3));
    const size = .13 + random() ** 2 * (edge > .8 ? 2.35 : .57);
    patch.set(x, floorHeight(x, z), z);
    transform.rotation.set((random() - .5) * .5, random() * TAU, (random() - .5) * .58);
    setInstance(cilia, i, transform, patch, [size, size, size]);
    cilia.setColorAt(i, new THREE.Color().setRGB(.57 + random() * .42, .46 + random() * .38, .41 + random() * .38));
  }

  const bulb = new THREE.PointLight(0xffb07c, 310, 34, 2);
  bulb.position.set(3.5, 3.8, -30.5);
  arteryDetails.add(bulb);
  const backGlow = sprite(glow, 0xffae65, 18, .75);
  backGlow.position.set(3.4, 3.6, -32);
  arteryDetails.add(backGlow);
  const filament = sprite(glow, 0xffe5aa, 3.5, .82);
  filament.position.set(3.5, 3.8, -31.2);
  filament.scale.y *= 2.25;
  arteryDetails.add(filament);
  arteryDetails.scale.set(1.25 * LAYOUT_SCALE, 1.18, 1.22 * LAYOUT_SCALE);

  const junctionDetails = makeJunction(scene, skin, glow);
  const heartDetails = makeHeartChamber(scene, skin, glow);
  // The heart's play space grew; push its muscular walls out to match.
  heartDetails.scale.set(1.2, 1.1, 1.12);
  chunkInstances(folds, { pad: 0 });
  return { surfaces, arteryDetails, junctionDetails, heartDetails, floor, wall, canopy,
    growths: chunkInstances(growths, { pad: 0 }), cilia: chunkInstances(cilia, { pad: 0 }) };
}

export function makeAtmosphere(scene, glow, random) {
  const cells = instanceMesh(scene, redCellGeometry(), new THREE.MeshPhysicalMaterial({
    color: 0xe8646a,
    vertexColors: true,
    clearcoat: .54,
    clearcoatRoughness: .22,
    roughness: .37,
    sheen: .38,
    sheenColor: 0xffa997,
  }), 170);
  cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cells.frustumCulled = false;
  const cellPath = [];
  for (let i = 0; i < cells.count; i++) {
    const angle = random() * TAU;
    const radial = Math.sqrt(random()) * .89 + .11;
    const x = Math.cos(angle) * radial * (CHAMBER_WIDTH - 3);
    const z = Math.sin(angle) * radial * (CHAMBER_DEPTH - 3);
    const y = .72 + random() * 15 + (Math.abs(x) < 6 ? 1.7 : 0);
    const radius = .11 + random() ** 2 * .98;
    cellPath.push({ x, y, z, radius, phase: random() * TAU, spin: (random() - .5) * .45 });
    cells.setColorAt(i, new THREE.Color().setRGB(.55 + random() * .45, .45 + random() * .55, .39 + random() * .48));
  }

  const positions = new Float32Array(1900 * 3);
  const colors = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const angle = random() * TAU;
    const radial = Math.sqrt(random());
    positions[index] = Math.cos(angle) * radial * (CHAMBER_WIDTH - 2);
    positions[index + 1] = .05 + random() ** 1.45 * 18;
    positions[index + 2] = Math.sin(angle) * radial * (CHAMBER_DEPTH - 2);
    const value = .23 + random() * .77;
    colors[index] = value;
    colors[index + 1] = value * (.48 + random() * .38);
    colors[index + 2] = value * (.35 + random() * .42);
  }
  const fieldGeometry = new THREE.BufferGeometry();
  fieldGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  fieldGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const motes = new THREE.Points(fieldGeometry, new THREE.PointsMaterial({
    map: glow,
    vertexColors: true,
    size: .083,
    opacity: .82,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(motes);

  const haze = cloudTexture();
  const clouds = [];
  const cloudPoints = [
    [-13, 3.5, -12, 15], [11, 4.3, -19, 12], [4, 3, -26, 20],
    [7, 4.5, -30, 15], [-4, 3.5, -28, 16], [11, 2.2, -5, 12],
    [-17, 2.5, 6, 15], [15, 5.1, 11, 15], [-6, 1.6, -11, 10],
  ];
  for (let index = 0; index < cloudPoints.length; index++) {
    const [baseX, y, baseZ, baseSize] = cloudPoints[index];
    const x = baseX * LAYOUT_SCALE;
    const z = baseZ * LAYOUT_SCALE;
    const size = baseSize * 1.3;
    const cloud = sprite(haze, index > 4 ? 0xb77266 : 0xfac597, size, index > 4 ? .115 : .26);
    cloud.position.set(x, y, z);
    cloud.scale.y *= .66;
    scene.add(cloud);
    clouds.push({ cloud, x, y, z });
  }

  return { cells, cellPath, motes, clouds };
}

function woundGeometry() {
  const rows = 28;
  const shellColumns = 36;
  const channelColumns = 10;
  function surface(columns) {
    const geometry = new THREE.BufferGeometry();
    const size = (rows + 1) * (columns + 1);
    const uv = new Float32Array(size * 2);
    const indices = [];
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const i = row * (columns + 1) + column;
        uv[i * 2] = column / columns;
        uv[i * 2 + 1] = row / rows;
        if (row < rows && column < columns) {
          const next = i + columns + 1;
          indices.push(i, i + 1, next, i + 1, next + 1, next);
        }
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(size * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.55);
    return geometry;
  }

  const shell = surface(shellColumns);
  const channel = surface(channelColumns);
  const pigments = new Float32Array(channel.attributes.position.count * 3);
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= channelColumns; column++) {
      const edge = Math.abs(column / channelColumns * 2 - 1) ** 4;
      const detail = Math.sin(row * 2.7 + column * 1.7) * .09 + Math.cos(row * 4.2 - column * .74) * .06;
      const i = (row * (channelColumns + 1) + column) * 3;
      pigments[i] = .26 + edge * .61 + detail;
      pigments[i + 1] = .087 + edge * .47 + detail * .55;
      pigments[i + 2] = .093 + edge * .38 + detail * .5;
    }
  }
  channel.setAttribute('color', new THREE.BufferAttribute(pigments, 3));

  function setPoint(positions, index, angle, y, radial, depth) {
    const x = Math.sin(angle) * radial;
    const z = Math.cos(angle) * radial;
    const swell = 1 + .09 * Math.sin(x * 6 + y * 5 + z * 3) + .055 * Math.cos(z * 8 - y * 7);
    const profile = swell * (1 + .13 * y);
    positions.setXYZ(index, x * (profile - depth) + .09 * y * y, y * swell, z * (profile - depth) + .07 * y);
  }

  let previous = -1;
  function reshape(amount) {
    if (Math.abs(previous - amount) < .004 && amount !== 0) return;
    if (previous === amount) return;
    previous = amount;
    const gapHeight = .37 + .50 * amount;
    for (let row = 0; row <= rows; row++) {
      const latitude = (row / rows - .5) * Math.PI;
      const y = Math.sin(latitude);
      const radial = Math.cos(latitude);
      const taper = Math.max(0, 1 - Math.abs((y - .04) / gapHeight)) ** .68;
      const center = y * .54 + .10 * Math.sin(y * 8.8);
      const width = amount * taper * (.54 + Math.sin(y * 49) * .06 + Math.cos(y * 22) * .06);
      for (let column = 0; column <= shellColumns; column++) {
        const angle = center + width + (TAU - width * 2) * column / shellColumns;
        setPoint(shell.attributes.position, row * (shellColumns + 1) + column, angle, y, radial, 0);
      }
      for (let column = 0; column <= channelColumns; column++) {
        const across = column / channelColumns;
        const angle = center + (across * 2 - 1) * width;
        const depth = Math.sin(across * Math.PI) ** .68 * taper * amount
          * (.41 + Math.sin(y * 41 - across * 10) * .08);
        setPoint(channel.attributes.position, row * (channelColumns + 1) + column, angle, y, radial, depth);
      }
    }
    for (const geometry of [shell, channel]) {
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  }
  reshape(0);
  return { shell, channel, reshape };
}

export function makeTissue(scene, glow, floorNormal, random, secondary = false) {
  const root = new THREE.Group();
  scene.add(root);
  const maps = secondary ? membraneMaps(64939, [224, 189, 180]) : membraneMaps(42618, [235, 182, 165]);
  const lobe = texturedLobe(1, 40, 29, .14);
  const membrane = new THREE.MeshPhysicalMaterial({
    ...maps, color: secondary ? 0xb98489 : 0xbf8175, emissive: 0x5c1e1c, emissiveIntensity: .17,
    roughness: .61, clearcoat: .63, clearcoatRoughness: .28,
    sheen: .42, sheenColor: 0xefb5a1, normalScale: new THREE.Vector2(.74, .74),
  });
  const shell = new THREE.MeshPhysicalMaterial({
    ...maps, color: secondary ? 0x8e4c5a : 0x9b504e, roughness: .67, clearcoat: .61, clearcoatRoughness: .31,
    normalMap: floorNormal, normalScale: new THREE.Vector2(.9, .9),
  });
  const fiber = new THREE.MeshPhysicalMaterial({
    color: 0x9b524e, emissive: 0x5a2420, emissiveIntensity: .23,
    roughness: .47, clearcoat: .58, clearcoatRoughness: .29,
  });
  const coreMaterial = new THREE.MeshPhysicalMaterial({
    ...maps, color: secondary ? 0xb3717d : 0xb87363, emissive: 0x4a110d, emissiveIntensity: .095,
    clearcoat: .63, clearcoatRoughness: .30, roughness: .61, sheen: .38, sheenColor: 0xe59484,
    normalScale: new THREE.Vector2(.58, .58),
  });
  const channelMaterial = new THREE.MeshPhysicalMaterial({
    ...maps, color: 0xc43e38, vertexColors: true, roughness: .47,
    clearcoat: .84, clearcoatRoughness: .24, emissive: 0x2f0504, emissiveIntensity: .28,
    normalScale: new THREE.Vector2(.68, .68),
  });
  const organ = new THREE.Group();
  root.add(organ);
  const wound = woundGeometry();
  const core = addMesh(organ, wound.shell, coreMaterial,
    new THREE.Vector3(-.08, -.02, .06), [1.02, .92, .91]);
  core.rotation.set(-.18, -.09, secondary ? .23 : -.13);
  const channel = addMesh(core, wound.channel, channelMaterial);
  channel.visible = false;
  const upper = addMesh(organ, lobe, membrane, new THREE.Vector3(.51, -.08, -.27), [.57, .71, .49]);
  upper.rotation.set(.18, .2, -.55);
  const glowOrb = sprite(glow, 0x66ffb5, 2.45, .09);
  glowOrb.position.set(-.04, .2, -.25);
  organ.add(glowOrb);

  const roots = [];
  const capillaries = [];
  const glowingVeins = [];
  for (let i = 0; i < 9; i++) {
    const angle = i / 9 * TAU + random() * .34;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    const spread = .58 + random() * .25;
    const sac = addMesh(organ, lobe, membrane, new THREE.Vector3(x * spread, -.44 + random() * .31, z * spread),
      [.26 + random() * .18, .42 + random() * .32, .27 + random() * .16]);
    sac.quaternion.setFromUnitVectors(UP, new THREE.Vector3(x * .8 + z * .19, .67, z * .8 - x * .19).normalize());

    const scute = addMesh(root, lobe, shell, new THREE.Vector3(x * 1.04, -.98 + random() * .12, z * 1.04),
      [.52 + random() * .27, .22 + random() * .17, .51 + random() * .21]);
    scute.rotation.y = -angle;
    const bend = (random() - .5) * .41;
    const reach = 2.04 + random() * .87;
    roots.push(tubeGeometry([
      new THREE.Vector3(x * .66, -.64, z * .66),
      new THREE.Vector3(x * 1.29 + z * bend, -.84, z * 1.29 - x * bend),
      new THREE.Vector3(x * 1.73 - z * bend, -1.12, z * 1.73 + x * bend),
      new THREE.Vector3(x * reach, -1.24, z * reach),
    ], .16 + random() * .13, .13, 20, 9));
    for (const side of [-1, 1]) {
      capillaries.push(tubeGeometry([
        new THREE.Vector3(x * 1.16 + z * bend, -.9, z * 1.16 - x * bend),
        new THREE.Vector3(x * 1.58 + z * .32 * side, -1.13, z * 1.58 - x * .32 * side),
        new THREE.Vector3(x * reach + z * .42 * side, -1.23, z * reach - x * .42 * side),
      ], .043 + random() * .035, .13, 10, 6));
    }
    const vertex = new THREE.Vector3(x * .52 - z * .2, .65 + random() * .17, z * .49 + x * .2);
    const fork = new THREE.Vector3(x * .84 - z * .12, -.12 + random() * .14, z * .84 + x * .12);
    glowingVeins.push(tubeGeometry([
      new THREE.Vector3(x * 1.19, -.83, z * 1.19), fork,
      new THREE.Vector3(x * .76 - z * .23, .29, z * .72 + x * .23), vertex,
    ], .026 + random() * .015, .22, 15, 7));
    glowingVeins.push(tubeGeometry([
      fork, new THREE.Vector3(x * .92 + z * .06, .04, z * .88 - x * .06),
      new THREE.Vector3(x * .82 + z * .22, .27, z * .79 - x * .22),
    ], .016, .12, 8, 5));
  }
  addMesh(root, joinTubes(roots), shell);
  addMesh(root, joinTubes(capillaries), membrane);
  addMesh(organ, joinTubes(glowingVeins), fiber);

  const polyps = instanceMesh(organ, texturedLobe(1, 8, 6, .27), membrane, 49);
  const transform = new THREE.Object3D();
  for (let i = 0; i < polyps.count; i++) {
    const angle = random() * TAU;
    const y = (random() * 1.6 - .81) * .8;
    const radial = Math.sqrt(1 - (y / .87) ** 2);
    const size = .024 + random() ** 1.4 * .089;
    const x = Math.cos(angle) * radial * .78;
    const z = Math.sin(angle) * radial * .64;
    transform.rotation.set(random() * .7, angle, random() * .75);
    setInstance(polyps, i, transform, new THREE.Vector3(x - .1, y, z - .05), [size, size * .65, size * .76]);
    polyps.setColorAt(i, new THREE.Color().setRGB(.69 + random() * .27, .56 + random() * .27, .5 + random() * .24));
  }

  const light = new THREE.PointLight(0xffc7aa, 6.3, 7, 2);
  light.position.set(-.8, 1.48, 1.48);
  root.add(light);

  const contact = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 5.3), new THREE.MeshBasicMaterial({
    color: 0x070101, map: glow, transparent: true, depthWrite: false, opacity: .76,
  }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.13;
  root.add(contact);

  return { root, organ, core, membrane, fiber, glowOrb, light, channel, wound, opening: 0 };
}

export function makeJunctionField(group, tissue, glow) {
  const membrane = tissue.membrane.clone();
  membrane.color.setHex(0xbd665a);
  membrane.emissiveIntensity = .07;
  membrane.clearcoat = .82;
  const clot = tissue.channel.material.clone();
  clot.color.setHex(0xd63f29);
  clot.emissive.setHex(0x5a0e06);
  clot.emissiveIntensity = .55;
  const vessel = tissue.fiber.clone();
  vessel.color.setHex(0x743435);
  const lobe = texturedLobe(1, 24, 14, .17);
  const contact = new THREE.MeshBasicMaterial({
    color: 0x100204, map: glow, transparent: true, depthWrite: false, opacity: .59,
  });
  const anchor = new THREE.MeshStandardMaterial({ color: 0x486462, metalness: .58, roughness: .46 });
  const meshWire = new THREE.MeshStandardMaterial({
    color: 0x82b9a4, emissive: 0x4ea58b, emissiveIntensity: .36, metalness: .36, roughness: .49,
  });
  const meshGlow = new THREE.MeshBasicMaterial({
    color: 0x7bf4cc, opacity: .21, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const gashes = {};
  const supports = {};

  for (const branch of ['left', 'right']) {
    const side = branch === 'left' ? -1 : 1;
    const site = JUNCTION_GASH_SITES[branch];
    const root = new THREE.Group();
    root.position.copy(site);
    root.rotation.y = side * .84;
    group.add(root);
    const wound = woundGeometry();
    const bank = addMesh(root, wound.shell, membrane,
      new THREE.Vector3(0, -.04, 0), [1.18, .83, .55]);
    bank.rotation.z = -side * .82;
    const tear = addMesh(bank, wound.channel, clot);
    tear.visible = false;
    const sheen = sprite(glow, 0xff4d2b, 1.25, .0);
    sheen.position.set(.03, .01, .49);
    root.add(sheen);
    const dark = addMesh(root, new THREE.PlaneGeometry(3.3, 2.55), contact,
      new THREE.Vector3(0, floorHeight(site.x, site.z) - site.y + .018, 0));
    dark.rotation.x = -Math.PI / 2;

    // The smaller wound bed runs toward the defended node on its side of the chamber.
    const roots = [0, 1, 2].map(index => {
      const z = (index - 1) * .46;
      return tubeGeometry([
        new THREE.Vector3(-side * .52, -.38, z * .44),
        new THREE.Vector3(-side * 1.05, -.68, z),
        new THREE.Vector3(-side * 1.88, -.84, z * 1.42 - .22),
        new THREE.Vector3(-side * 3.35, -.83, z * 1.2 + .20),
      ], .23 - index * .035, .54, 15, 7);
    });
    addMesh(root, joinTubes(roots), vessel);
    for (const [x, y, z, w, h] of [[-.58, -.48, .06, .73, .28], [.56, -.51, -.09, .72, .31], [.24, -.58, .38, .85, .23]]) {
      const foot = addMesh(root, lobe, vessel, new THREE.Vector3(x * side, y, z), [w, h, .49]);
      foot.rotation.z = x * side * -.2;
    }
    gashes[branch] = { root, wound, tear, sheen, opening: 0 };

    const inlet = JUNCTION_INLETS[branch];
    const support = new THREE.Group();
    support.position.copy(inlet);
    support.rotation.y = -side * .72;
    support.visible = false;
    group.add(support);

    const frame = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.3, -1.37, .12), new THREE.Vector3(-3.05, .55, .07),
      new THREE.Vector3(-1.87, 2.25, -.05), new THREE.Vector3(0, 2.83, -.25),
      new THREE.Vector3(1.87, 2.25, -.05), new THREE.Vector3(3.05, .55, .07),
      new THREE.Vector3(3.3, -1.37, .12),
    ]);
    addMesh(support, new THREE.TubeGeometry(frame, 38, .069, 8, false), anchor);
    const strands = [];
    for (const slope of [-1, 1]) {
      for (let index = -3; index <= 3; index++) {
        const points = [];
        for (let step = 0; step <= 24; step++) {
          const y = -1.25 + step / 24 * 3.95;
          const x = index * .93 + slope * (y - .42) * .82;
          const section = 1 - ((y - .27) / 2.51) ** 2;
          if (x ** 2 > 10.2 * section) continue;
          points.push(new THREE.Vector3(x, y, -.32 + (x / 3.2) ** 2 * .31 + slope * .032));
        }
        if (points.length > 1) strands.push(tubeGeometry(points, .022, .79, 14, 5));
      }
    }
    addMesh(support, joinTubes(strands), meshWire);
    const edge = addMesh(support, new THREE.TubeGeometry(frame, 32, .089, 6, false), meshGlow.clone());
    supports[branch] = { support, edge };
  }
  return { gashes, supports, meshWire };
}

function joinTubes(tubes) {
  const geometry = new THREE.BufferGeometry();
  const meshes = tubes.map((tube) => tube.toNonIndexed());
  for (const name of ['position', 'normal', 'uv']) {
    const size = name === 'uv' ? 2 : 3;
    const count = meshes.reduce((sum, mesh) => sum + mesh.attributes[name].count, 0);
    const data = new Float32Array(count * size);
    let offset = 0;
    for (const mesh of meshes) {
      const values = mesh.attributes[name].array;
      data.set(values, offset);
      offset += values.length;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  for (const tube of tubes) tube.dispose();
  return geometry;
}

export function biologicalMaterial(color, normal, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    normalMap: normal,
    normalScale: new THREE.Vector2(.48, .48),
    roughness: .38,
    clearcoat: .53,
    clearcoatRoughness: .22,
    ...options,
  });
}
