import * as THREE from './vendor/three.module.js';
import { createCarbine } from './carbine.mjs';
import { createRepairTool } from './repair-tool.mjs';
import { createHeartValve, createValveColony } from './heart-valve.mjs';
import { createTurret } from './turret.mjs';
import { JUNCTION_GASH_SITES, JUNCTION_INLETS, OBJECTIVE, TISSUE_NODES } from './simulation.mjs';

const TAU = Math.PI * 2;
const CHAMBER_WIDTH = 35;
const CHAMBER_DEPTH = 49;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(size, draw) {
  const surface = document.createElement('canvas');
  surface.width = surface.height = size;
  const context = surface.getContext('2d');
  draw(context, size);
  return new THREE.CanvasTexture(surface);
}

function configureTile(texture, anisotropy, color = false) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture() {
  return canvasTexture(128, (context, size) => {
    const middle = size / 2;
    const gradient = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.13, 'rgba(255,255,255,.75)');
    gradient.addColorStop(0.37, 'rgba(255,255,255,.27)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  });
}

function cloudTexture() {
  return canvasTexture(256, (context, size) => {
    const random = randomSource(506);
    for (let i = 0; i < 58; i++) {
      const angle = random() * TAU;
      const spread = Math.sqrt(random()) * 71;
      const x = size / 2 + Math.cos(angle) * spread;
      const y = size / 2 + Math.sin(angle) * spread * 0.83;
      const radius = 11 + random() * 34;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,.18)');
      gradient.addColorStop(0.44, 'rgba(255,255,255,.09)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
}

function fallbackTissue() {
  return canvasTexture(256, (context, size) => {
    const random = randomSource(146);
    const data = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const folds = Math.sin(TAU * x / size * 4 + Math.sin(TAU * y / size * 3) * 2.2);
        const fibers = Math.sin(TAU * y / size * 31 + folds * 5 + Math.sin(TAU * x / size * 2));
        const value = (folds * 0.2 + fibers * 0.23 + random() * 0.46 + 0.26);
        const offset = (y * size + x) * 4;
        data.data[offset] = 79 + value * 83;
        data.data[offset + 1] = 24 + value * 39;
        data.data[offset + 2] = 27 + value * 34;
        data.data[offset + 3] = 255;
      }
    }
    context.putImageData(data, 0, 0);
  });
}

function normalFromImage(image, anisotropy) {
  const source = document.createElement('canvas');
  source.width = source.height = 512;
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 512, 512);
  const data = context.getImageData(0, 0, 512, 512).data;
  return configureTile(canvasTexture(512, (target, size) => {
    const imageData = target.createImageData(size, size);
    const luminance = (x, y) => {
      const index = ((y & 511) * size + (x & 511)) * 4;
      return (data[index] * .55 + data[index + 1] * .32 + data[index + 2] * .13) / 255;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (luminance(x - 2, y) - luminance(x + 2, y)) * 3.8;
        const dy = (luminance(x, y + 2) - luminance(x, y - 2)) * 3.8;
        const length = Math.hypot(dx, dy, 1);
        const index = (y * size + x) * 4;
        imageData.data[index] = 127.5 * (1 + dx / length);
        imageData.data[index + 1] = 127.5 * (1 + dy / length);
        imageData.data[index + 2] = 127.5 * (1 + 1 / length);
        imageData.data[index + 3] = 255;
      }
    }
    target.putImageData(imageData, 0, 0);
  }), anisotropy);
}

function floorHeight(x, z) {
  return .115 * Math.sin(x * .67 + z * .16) * Math.cos(z * .46)
    + .075 * Math.cos(z * .98 - x * .24) + .035 * Math.sin(x * 2.8 + z * 1.7);
}

function wallPosition(angle, height) {
  const ripple = 1 + Math.sin(angle * 7 + height * .23) * .044
    + Math.cos(angle * 13 - height * .28) * .018
    + Math.sin(angle * 3 + height * .18) * .023;
  const arch = 1 - .22 * (height / 16) ** 3 - .03 * Math.cos(height * 1.12 + angle * 5);
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
  const geometry = new THREE.PlaneGeometry(2 * CHAMBER_WIDTH + 8, 2 * CHAMBER_DEPTH + 8, 150, 184);
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const z = vertices.getZ(i);
    const edge = Math.max(0, Math.hypot(x / CHAMBER_WIDTH, z / CHAMBER_DEPTH) - .86);
    vertices.setY(i, floorHeight(x, z) + edge * edge * 5);
    uv.setXY(i, x / 4.6, z / 4.6);
  }
  geometry.computeVertexNormals();
  colorGeometry(geometry, (color, x, y, z) => {
    const p = Math.sin(x * .35 + z * .5) * .5 + Math.cos(z * .26 - x * .61) * .5;
    const rim = Math.max(0, Math.hypot(x / CHAMBER_WIDTH, z / CHAMBER_DEPTH) - .45);
    color.setRGB(.92 + p * .12 - rim * .23, .74 + p * .12 - rim * .2, .69 + p * .12 - rim * .13);
  });
  return geometry;
}

function wallGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1, 168, 44);
  const vertices = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) {
    const angle = uv.getX(i) * TAU;
    const height = uv.getY(i) * 17.5 - .5;
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

function texturedLobe(radius, segments = 24, rings = 16, strength = .16) {
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

function redCellGeometry() {
  const profile = [[0, -.089], [.19, -.091], [.38, -.12], [.55, -.17],
    [.72, -.21], [.85, -.185], [.96, -.119], [1, 0],
    [.96, .119], [.85, .185], [.72, .21], [.55, .17], [.38, .12], [.19, .091], [0, .089]];
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 24);
  colorGeometry(geometry, (color, x, y, z) => {
    const ring = Math.hypot(x, z);
    const tone = .64 + ring * .3 + Math.sin(x * 13 + z * 7) * .055;
    color.setRGB(tone, tone * .61, tone * .63);
  });
  return geometry;
}

function sprite(texture, color, scale, opacity, blend = THREE.AdditiveBlending) {
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

function addMesh(group, geometry, material, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.copy(position);
  if (scale) mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

function instanceMesh(group, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  group.add(mesh);
  return mesh;
}

function setInstance(mesh, index, transform, position, scale) {
  transform.position.copy(position);
  transform.scale.set(...scale);
  transform.updateMatrix();
  mesh.setMatrixAt(index, transform.matrix);
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

function makeRoom(scene, tile, normal, glow, random) {
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

  addMesh(scene, floorGeometry(), skin({ vertexColors: true, roughness: .46 }));
  addMesh(scene, wallGeometry(), skin({ vertexColors: true, side: THREE.DoubleSide, roughness: .56 }));

  const roof = new THREE.PlaneGeometry(CHAMBER_WIDTH * 2, CHAMBER_DEPTH * 2, 54, 76);
  roof.rotateX(Math.PI / 2);
  const roofVertices = roof.attributes.position;
  const roofUv = roof.attributes.uv;
  for (let i = 0; i < roofVertices.count; i++) {
    const x = roofVertices.getX(i);
    const z = roofVertices.getZ(i);
    const edge = Math.min(1, Math.hypot(x / CHAMBER_WIDTH, z / CHAMBER_DEPTH));
    roofVertices.setY(i, 14.5 + (1 - edge ** 2) * 5 + Math.cos(x * .41 + z * .25) * .9);
    roofUv.setXY(i, x / 3.7, z / 3.7);
  }
  roof.computeVertexNormals();
  const canopy = addMesh(scene, roof, skin({ color: 0x9e6768, side: THREE.DoubleSide, roughness: .66 }));

  const lobeMaterial = skin({ color: 0xeca5a3, roughness: .41, clearcoat: .55 });
  const vesselMaterial = skin({ color: 0xdb7f82, roughness: .36, clearcoat: .78 });
  const tinyVesselMaterial = skin({ color: 0xdf9193, roughness: .32, clearcoat: .68 });
  const lobe = texturedLobe(1, 32, 20, .24);
  const transform = new THREE.Object3D();
  const folds = instanceMesh(scene, lobe, lobeMaterial, 60);

  for (let i = 0; i < folds.count; i++) {
    const angle = i / folds.count * TAU + random() * .055;
    const height = 1.1 + random() * 9.4;
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

  for (let i = 0; i < 44; i++) {
    const angle = random() * TAU;
    const low = random() * 9;
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
  const growths = instanceMesh(scene, texturedLobe(1, 12, 8, .32), growthMaterial, 965);
  const patch = new THREE.Vector3();
  const ciliaGeometry = tubeGeometry([
    new THREE.Vector3(0, -.2, 0), new THREE.Vector3(.02, .1, .02),
    new THREE.Vector3(.02, .45, .09), new THREE.Vector3(.12, .69, .16),
  ], .068, .22, 7, 5);
  const cilia = instanceMesh(scene, ciliaGeometry, tinyVesselMaterial, 670);

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
  arteryDetails.scale.set(1.25, 1, 1.22);

  const junctionDetails = makeJunction(scene, skin, glow);
  const heartDetails = makeHeartChamber(scene, skin, glow);
  return { surfaces, arteryDetails, junctionDetails, heartDetails, canopy, growths, cilia };
}

function makeAtmosphere(scene, glow, random) {
  const cells = instanceMesh(scene, redCellGeometry(), new THREE.MeshPhysicalMaterial({
    color: 0xe8646a,
    vertexColors: true,
    clearcoat: .54,
    clearcoatRoughness: .22,
    roughness: .37,
    sheen: .38,
    sheenColor: 0xffa997,
  }), 91);
  cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cells.frustumCulled = false;
  const cellPath = [];
  for (let i = 0; i < cells.count; i++) {
    const angle = random() * TAU;
    const radial = Math.sqrt(random()) * .89 + .11;
    const x = Math.cos(angle) * radial * (CHAMBER_WIDTH - 3);
    const z = Math.sin(angle) * radial * (CHAMBER_DEPTH - 3);
    const y = .72 + random() * 11 + (Math.abs(x) < 6 ? 1.7 : 0);
    const radius = .11 + random() ** 2 * .98;
    cellPath.push({ x, y, z, radius, phase: random() * TAU, spin: (random() - .5) * .45 });
    cells.setColorAt(i, new THREE.Color().setRGB(.55 + random() * .45, .45 + random() * .55, .39 + random() * .48));
  }

  const positions = new Float32Array(1000 * 3);
  const colors = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const angle = random() * TAU;
    const radial = Math.sqrt(random());
    positions[index] = Math.cos(angle) * radial * (CHAMBER_WIDTH - 2);
    positions[index + 1] = .05 + random() ** 1.45 * 14;
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
    const [x, y, z, size] = cloudPoints[index];
    const cloud = sprite(haze, index > 4 ? 0xb77266 : 0xfac597, size, index > 4 ? .115 : .26);
    cloud.position.set(x, y, z);
    cloud.scale.y *= .66;
    scene.add(cloud);
    clouds.push({ cloud, x, y, z });
  }

  return { cells, cellPath, motes, clouds };
}

function membraneMaps(seed, tint) {
  const size = 128;
  const lattice = 8;
  const random = randomSource(seed);
  const grains = Array.from({ length: lattice ** 2 }, () => [random(), random(), random()]);
  const cellMask = lattice - 1;
  const texelMask = size - 1;
  const height = new Float32Array(size * size);
  const pigment = new Uint8Array(height.length * 4);
  const roughness = new Uint8Array(pigment.length);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x * lattice / size;
      const gy = y * lattice / size;
      const cellX = Math.floor(gx);
      const cellY = Math.floor(gy);
      let first = Infinity;
      let second = Infinity;
      let tone = .5;
      for (let cy = cellY - 1; cy <= cellY + 1; cy++) {
        for (let cx = cellX - 1; cx <= cellX + 1; cx++) {
          const cell = grains[(cy & cellMask) * lattice + (cx & cellMask)];
          const distance = Math.hypot(cx + .2 + cell[0] * .6 - gx, cy + .2 + cell[1] * .6 - gy);
          if (distance < first) {
            second = first;
            first = distance;
            tone = cell[2];
          } else {
            second = Math.min(second, distance);
          }
        }
      }
      const groove = Math.min(1, (second - first) * 3);
      const fibril = Math.sin((y + Math.sin(x * TAU / size * 3) * 7) * TAU / size * 27);
      const grain = random();
      const detail = (.47 + groove * .31) + tone * .17 + fibril * .035 + grain * .04;
      const index = y * size + x;
      height[index] = groove * .68 + tone * .22 + fibril * .07 + grain * .06;
      pigment[index * 4] = tint[0] * detail;
      pigment[index * 4 + 1] = tint[1] * detail * (.83 + tone * .17);
      pigment[index * 4 + 2] = tint[2] * detail;
      pigment[index * 4 + 3] = 255;
      roughness.fill(123 + groove * 71 + grain * 34, index * 4, index * 4 + 3);
      roughness[index * 4 + 3] = 255;
    }
  }

  const normals = new Uint8Array(pigment.length);
  const h = (x, y) => height[(y & texelMask) * size + (x & texelMask)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * 1.45;
      const dy = (h(x, y - 1) - h(x, y + 1)) * 1.45;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 4;
      normals[index] = 127.5 * (1 + dx / length);
      normals[index + 1] = 127.5 * (1 + dy / length);
      normals[index + 2] = 127.5 * (1 + 1 / length);
      normals[index + 3] = 255;
    }
  }

  const texture = (data, color = false) => {
    const map = configureTile(new THREE.DataTexture(data, size, size), 4, color);
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  };
  return { map: texture(pigment, true), normalMap: texture(normals), roughnessMap: texture(roughness) };
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

function makeTissue(scene, glow, floorNormal, random, secondary = false) {
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

function makeJunctionField(group, tissue, glow) {
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

function biologicalMaterial(color, normal, options = {}) {
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

function virusModel(normal) {
  const organism = new THREE.Group();
  const random = randomSource(14833);
  const maps = membraneMaps(9841, [240, 197, 163]);
  const body = texturedLobe(.56, 44, 30, .28);
  colorGeometry(body, (color, x, y, z) => {
    const bands = Math.sin(x * 13 + y * 4 + Math.cos(z * 14) * 2.6) * Math.cos(y * 15 - z * 8);
    const blotch = Math.sin(x * 8 - y * 9 + z * 11) * .09;
    color.setRGB(.75 + bands * .22 + blotch, .58 + bands * .20 + blotch, .51 + bands * .18 + blotch);
  });
  const coat = biologicalMaterial(0xc26b47, normal, {
    ...maps, vertexColors: true, roughness: .66, clearcoat: .56,
    clearcoatRoughness: .29, normalScale: new THREE.Vector2(.94, .94),
    emissive: 0x341009, emissiveIntensity: .38, sheen: .38, sheenColor: 0xe99c79,
  });
  const thorn = biologicalMaterial(0xa35036, normal, {
    roughness: .48, clearcoat: .79, clearcoatRoughness: .25,
    emissive: 0x2d1008, emissiveIntensity: .32, normalScale: new THREE.Vector2(.67, .67),
  });
  const tip = biologicalMaterial(0xd8885f, normal, {
    ...maps, roughness: .56, clearcoat: .74, clearcoatRoughness: .26,
    emissive: 0xa52e12, emissiveIntensity: .22, normalScale: new THREE.Vector2(.63, .63),
    sheen: .42, sheenColor: 0xe7b985,
  });
  const nodule = biologicalMaterial(0xa75439, normal, {
    ...maps, roughness: .67, clearcoat: .61, clearcoatRoughness: .29,
    normalScale: new THREE.Vector2(.71, .71),
  });
  addMesh(organism, body, coat).name = 'attack-membrane';

  const spikes = new THREE.Group();
  spikes.name = 'virus-spikes';
  organism.add(spikes);
  const cap = texturedLobe(1, 12, 8, .38);
  const heads = instanceMesh(spikes, cap, tip, 28);
  const nodules = instanceMesh(organism, texturedLobe(1, 8, 6, .31), nodule, 51);
  const transform = new THREE.Object3D();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const strands = [];
  const direction = (i, count) => {
    const y = 1 - (i + .5) / count * 2;
    const spread = Math.sqrt(1 - y * y);
    const angle = i * goldenAngle + (random() - .5) * .42;
    return new THREE.Vector3(Math.cos(angle) * spread, y, Math.sin(angle) * spread);
  };

  for (let i = 0; i < heads.count; i++) {
    const axis = direction(i, heads.count);
    const cross = new THREE.Vector3(axis.z, .3 - random() * .6, -axis.x).normalize();
    const reach = .66 + random() ** .62 * .186;
    const skew = (random() - .42) * .19;
    const neck = axis.clone().multiplyScalar((reach + .5) * .5).addScaledVector(cross, -skew * .4);
    const end = axis.clone().multiplyScalar(reach).addScaledVector(cross, skew);
    strands.push(tubeGeometry([
      axis.clone().multiplyScalar(.43),
      axis.clone().multiplyScalar(.53).addScaledVector(cross, skew * .2),
      neck,
      end,
    ], .05 + random() * .039, .24 + random() * .22, 10, 7));
    if (i % 3 === 0) {
      strands.push(tubeGeometry([
        neck.clone().addScaledVector(axis, -.035),
        neck.clone().addScaledVector(axis, .055).addScaledVector(cross, -.079),
        end.clone().addScaledVector(axis, -.024).addScaledVector(cross, -.098),
      ], .027 + random() * .013, .13, 7, 6));
    }
    const width = .031 + random() * .026;
    const tangent = end.clone().sub(neck).normalize();
    transform.quaternion.setFromUnitVectors(UP, tangent);
    transform.rotateY(i * .74);
    setInstance(heads, i, transform, end, [width * (1.1 + random() * .36), width * (1.07 + random() * .52), width * .69]);
    heads.setColorAt(i, new THREE.Color().setRGB(.73 + random() * .26, .5 + random() * .42, .42 + random() * .44));
  }
  addMesh(spikes, joinTubes(strands), thorn);

  for (let i = 0; i < nodules.count; i++) {
    const axis = direction(i + 2, nodules.count + 4);
    const size = .03 + random() ** 1.36 * .093;
    const surface = .522 + (Math.sin(axis.x * 7.2 + axis.y * 3) * Math.sin(axis.z * 7 + axis.y * 1.3)) * .065;
    transform.quaternion.setFromUnitVectors(UP, axis);
    transform.rotateY(random() * TAU);
    setInstance(nodules, i, transform, axis.multiplyScalar(surface), [size, size * (.37 + random() * .41), size * .81]);
    nodules.setColorAt(i, new THREE.Color().setRGB(.63 + random() * .37, .42 + random() * .48, .38 + random() * .44));
  }
  return organism;
}

function bacillusModel(normal) {
  const organism = new THREE.Group();
  const random = randomSource(7886);
  const geometry = new THREE.CapsuleGeometry(.38, 1.12, 10, 24);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const wrinkled = 1 + Math.sin(y * 31 + z * 11) * .056 + Math.cos(y * 14 - x * 9) * .074;
    positions.setXYZ(i, x * wrinkled + (y * y - .27) * .38, y, z * wrinkled);
  }
  geometry.computeVertexNormals();
  colorGeometry(geometry, (color, x, y, z) => {
    const pigment = Math.cos(y * 19 + Math.sin(x * 14 + z * 8) * 2.1) * .5 + .5;
    color.setRGB(.55 + pigment * .45, .5 + pigment * .35, .24 + pigment * .19);
  });
  const skin = biologicalMaterial(0xaba45a, normal, {
    vertexColors: true, emissive: 0x584117, emissiveIntensity: .51, sheen: .54, sheenColor: 0xcbe75a,
  });
  const fiber = biologicalMaterial(0xc4ad67, normal, { emissive: 0x785c27, emissiveIntensity: .45 });
  const pulse = biologicalMaterial(0xf3c552, normal, { emissive: 0xff8c1b, emissiveIntensity: .76 });
  const body = new THREE.Group();
  body.rotation.set(.2, .15, 1.18);
  organism.add(body);
  addMesh(body, geometry, skin);

  const strands = [];
  for (let index = 0; index < 26; index++) {
    const a = index * 2.399963;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const y = (random() - .5) * 1.56;
    const length = .12 + random() * .36;
    strands.push(tubeGeometry([
      new THREE.Vector3(x * .29 + y * y * .3, y, z * .29),
      new THREE.Vector3(x * (.36 + length * .4) + y * y * .32, y + .07, z * (.36 + length * .43)),
      new THREE.Vector3(x * (.4 + length) + y * y * .34 + z * .12, y + .2, z * (.4 + length) - x * .12),
    ], .015 + random() * .011, .12, 8, 5));
  }
  for (let index = 0; index < 4; index++) {
    const spin = index / 4 * TAU;
    strands.push(tubeGeometry([
      new THREE.Vector3(.16 + Math.cos(spin) * .14, -.77, Math.sin(spin) * .15),
      new THREE.Vector3(.29 + Math.cos(spin) * .23, -.98, Math.sin(spin) * .2),
      new THREE.Vector3(.16 + Math.cos(spin + 1) * .33, -1.14, Math.sin(spin + 1) * .33),
      new THREE.Vector3(.15 + Math.cos(spin + 2.4) * .32, -1.35, Math.sin(spin + 2.4) * .33),
    ], .021, .1, 12, 5));
  }
  addMesh(body, joinTubes(strands), fiber);

  const bacteriaPearls = instanceMesh(body, texturedLobe(1, 12, 8, .24), pulse, 15);
  bacteriaPearls.name = 'attack-membrane';
  const transform = new THREE.Object3D();
  for (let i = 0; i < bacteriaPearls.count; i++) {
    const angle = i * 2.4;
    const y = (random() - .5) * 1.45;
    setInstance(bacteriaPearls, i, transform,
      new THREE.Vector3(Math.cos(angle) * .36 + (y * y - .27) * .38, y, Math.sin(angle) * .36), [.055, .082, .049]);
  }
  return organism;
}

function sporeModel(normal) {
  const organism = new THREE.Group();
  const random = randomSource(59651);
  const bell = texturedLobe(.52, 36, 25, .16);
  const maps = membraneMaps(3188, [207, 185, 203]);
  colorGeometry(bell, (color, x, y, z) => {
    const hue = .61 + Math.sin(x * 18 - y * 16 + z * 14) * .25;
    color.setRGB(hue * .7, hue * .54, hue + .12);
  });
  const membrane = biologicalMaterial(0x846489, normal, {
    ...maps, vertexColors: true, emissive: 0x48274e, emissiveIntensity: .32,
    roughness: .78, clearcoat: .36, clearcoatRoughness: .34, sheen: .26, sheenColor: 0xb286ac,
  });
  const tendril = biologicalMaterial(0x925371, normal, {
    emissive: 0x702644, emissiveIntensity: .18, roughness: .59, clearcoat: .43, clearcoatRoughness: .35,
  });
  const sac = biologicalMaterial(0x884761, normal, {
    ...maps, emissive: 0x9e3b68, emissiveIntensity: .29, roughness: .72, clearcoat: .41, clearcoatRoughness: .36,
  });
  addMesh(organism, bell, membrane, new THREE.Vector3(0, .16, 0), [1.12, .75, 1.12]);

  const roots = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const length = .21 + random() * .23;
    roots.push(tubeGeometry([
      new THREE.Vector3(x * .42, .13, z * .42),
      new THREE.Vector3(x * .52 + z * .07, -.1, z * .52 - x * .07),
      new THREE.Vector3(x * .48 + z * .16, -length, z * .48 - x * .16),
      new THREE.Vector3(x * .43 + z * .25, -length - .19, z * .43 - x * .25),
    ], .04 + random() * .014, .17, 13, 6));
  }
  addMesh(organism, joinTubes(roots), tendril).name = 'spore-fringe';

  const lobe = texturedLobe(.23, 20, 14, .23);
  addMesh(organism, lobe, sac, new THREE.Vector3(0, -.14, 0), [1.32, .81, 1.32]).name = 'attack-membrane';
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    addMesh(organism, lobe, sac, new THREE.Vector3(Math.cos(a) * .35, .18, Math.sin(a) * .35), [.62, .66, .62]);
  }
  return organism;
}

function reflectionTexture() {
  const texture = canvasTexture(256, (context, size) => {
    context.fillStyle = '#251a23';
    context.fillRect(0, 0, size, size);
    const softBox = (x, y, radius, width, color) => {
      context.save();
      context.translate(x, y);
      context.scale(width, 1);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(.28, color);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    };
    softBox(110, 57, 30, 1.65, '#ffe1b3');
    softBox(211, 91, 47, .58, '#7dbcc4');
    softBox(51, 84, 21, .53, '#e68a6f');
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

const MAX_PARTICLES = 288;
const SPECIES_COLORS = { virus: 0xff6d4a, bacillus: 0xffd078, spore: 0xf384ff, colony: 0xffb572 };
const ATTACK_GLOW = {
  virus: new THREE.Color(0xde653b),
  bacillus: new THREE.Color(0xef9b46),
  spore: new THREE.Color(0xd681b9),
};
const HEALTHY = new THREE.Color(0xffc6ad);
const HEALTHY_FLANK = new THREE.Color(0xf1c1d5);
const INJURED = new THREE.Color(0xff795d);
const REPAIR_LIGHT = new THREE.Color(0x9bf4c4);

export class World {
  constructor(canvas, area = 'artery') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x230f11);
    this.scene.fog = new THREE.FogExp2(0x462524, .036);
    this.scene.environment = reflectionTexture();
    this.scene.environmentIntensity = .51;

    this.camera = new THREE.PerspectiveCamera(61, 1, .063, 119);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.7, 18);
    this.clock = 0;
    this.random = randomSource(880129);
    this.transform = new THREE.Object3D();
    this.tempPosition = new THREE.Vector3();
    this.palette = new THREE.Color();
    this.glow = glowTexture();
    this.enemyViews = new Map();
    this.projectileViews = new Map();
    this.particles = [];
    this.shots = [];
    this.lastEvents = null;

    this.scene.add(new THREE.HemisphereLight(0xf6d4ba, 0x5c3c4e, .93));
    const backlight = new THREE.DirectionalLight(0xffbd9e, 1.4);
    backlight.position.set(-12, 10, -16);
    this.scene.add(backlight);
    const fill = new THREE.DirectionalLight(0xb3c9e3, .77);
    fill.position.set(4, 4, 16);
    this.scene.add(fill);
    const warm = new THREE.PointLight(0xff8969, 72, 24, 2);
    warm.position.set(-9, 3.2, 9);
    this.scene.add(warm);
    const side = new THREE.PointLight(0xff7561, 53, 24, 2);
    side.position.set(11, 4.6, -11);
    this.scene.add(side);
    this.shotLight = new THREE.PointLight(0xa8ffc4, 0, 8, 2);
    this.scene.add(this.shotLight);

    this.weaponScene = new THREE.Scene();
    this.weaponScene.environment = this.scene.environment;
    this.weaponScene.environmentIntensity = .83;
    this.weaponCamera = new THREE.PerspectiveCamera(55, 1, .026, 5);
    this.carbine = createCarbine();
    this.weaponScene.add(this.carbine.model);
    this.repairTool = createRepairTool(this.carbine.supportHand);
    this.weaponScene.add(this.repairTool.model);
    this.carbine.model.traverse(part => {
      if (part.isMesh && !part.material.transparent && !part.material.isMeshBasicMaterial) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
    });
    this.weaponScene.add(new THREE.HemisphereLight(0xf9ded4, 0x66313b, 1.16));
    this.weaponKey = new THREE.DirectionalLight(0xffcfb4, 1.72);
    this.weaponKey.castShadow = true;
    this.weaponKey.target.position.set(.13, -.2, -.82);
    this.weaponKey.shadow.mapSize.set(1024, 1024);
    this.weaponKey.shadow.camera = new THREE.OrthographicCamera(-.87, .87, .87, -.87, .05, 5);
    this.weaponKey.shadow.bias = -.00025;
    this.weaponKey.shadow.normalBias = .003;
    this.weaponRim = new THREE.DirectionalLight(0xaed5db, 1.04);
    this.weaponRim.position.set(.7, .8, -.6);
    const weaponBounce = new THREE.DirectionalLight(0xffd8c7, 1.24);
    weaponBounce.position.set(-.95, .28, .8);
    this.weaponFlash = new THREE.PointLight(0xffc776, 0, 2.3, 2);
    this.weaponScene.add(this.weaponKey, this.weaponKey.target, this.weaponRim, weaponBounce, this.weaponFlash);
    this.weaponPose = {
      sim: null, stride: 0, movement: 0, aim: 0, recoil: 0, flash: 0, lowered: 0,
      swayX: 0, swayY: 0,
    };
    this.weaponLightRotation = new THREE.Quaternion();
    this.weaponSight = this.carbine.sight.getWorldPosition(new THREE.Vector3());
    this.magazineRest = this.carbine.magazine.position.clone();
    this.magazineHandPosition = new THREE.Vector3();
    this.supportRest = this.carbine.supportHand.position.clone();
    const magazineBounds = new THREE.Box3().setFromObject(this.carbine.magazine);
    this.magazineGrip = magazineBounds.getCenter(new THREE.Vector3()).sub(this.magazineRest);
    this.magazineGrip.x = magazineBounds.min.x - this.magazineRest.x + .007;
    this.magazineGrip.z -= .019;

    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const tile = configureTile(fallbackTissue(), anisotropy, true);
    const normal = normalFromImage(tile.image, anisotropy);
    this.room = makeRoom(this.scene, tile, normal, this.glow, this.random);
    this.areaLights = { backlight, warm, side };
    this.atmosphere = makeAtmosphere(this.scene, this.glow, this.random);
    this.tissueViews = [
      makeTissue(this.scene, this.glow, normal, this.random),
      makeTissue(this.scene, this.glow, normal, randomSource(327113), true),
    ];
    this.junctionField = makeJunctionField(this.room.junctionDetails, this.tissueViews[0], this.glow);
    this.turretView = createTurret(this.glow);
    this.scene.add(this.turretView.model);
    this.turretMuzzle = new THREE.Vector3();
    this.leakTime = 0;
    this.toolStream = addMesh(this.scene, new THREE.CylinderGeometry(.014, .005, 1, 9, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xafffd2, transparent: true, opacity: .43, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
    this.toolStream.visible = false;
    this.toolStart = new THREE.Vector3();
    this.toolTarget = new THREE.Vector3();
    this.toolDirection = new THREE.Vector3();
    this.tetherGeometry = new THREE.CylinderGeometry(.016, .027, 1, 7, 1);
    this.tetherMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa05844, emissive: 0x361a0c, emissiveIntensity: .15, roughness: .49,
      clearcoat: .55, clearcoatRoughness: .29,
    });
    this.tetherStart = new THREE.Vector3();
    this.tetherEnd = new THREE.Vector3();
    this.tetherDirection = new THREE.Vector3();
    this.templates = {
      virus: virusModel(normal),
      bacillus: bacillusModel(normal),
      spore: sporeModel(normal),
    };
    this.sporeDroplet = texturedLobe(1, 18, 12, .11);
    this.sporeTrail = new THREE.SphereGeometry(1, 9, 6);
    this.sporeDropletMaterial = biologicalMaterial(0xca659e, normal, {
      emissive: 0xb32687, emissiveIntensity: .84, clearcoat: .96,
      roughness: .36, clearcoatRoughness: .16,
    });
    this.sporeTrailMaterial = new THREE.MeshBasicMaterial({
      color: 0xe280bd, transparent: true, opacity: .25,
      depthWrite: false,
    });
    this.projectileDirection = new THREE.Vector3();
    this.makeHeart = () => {
      const maps = membraneMaps(26701, [238, 181, 170]);
      this.templates.colony = createValveColony(maps, texturedLobe(1, 26, 17, .27), randomSource(8209));
      return createHeartValve(this.scene, maps, redCellGeometry(), randomSource(9468));
    };
    new THREE.TextureLoader().load(new URL('./assets/tissue.webp', import.meta.url).href, (asset) => {
      configureTile(asset, anisotropy, true);
      const normalMap = normalFromImage(asset.image, anisotropy);
      for (const material of this.room.surfaces) {
        material.map = asset;
        material.normalMap = normalMap;
      }
      tile.dispose();
    }, undefined, () => {});

    this.shadowGeometry = new THREE.PlaneGeometry(2, 2);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: this.glow,
      color: 0x070103,
      opacity: .73,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    this.particlePositions = new Float32Array(MAX_PARTICLES * 3);
    this.particleColors = new Float32Array(MAX_PARTICLES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.particleCloud = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: this.glow, vertexColors: true, size: .135, opacity: .95,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.particleCloud.frustumCulled = false;
    this.scene.add(this.particleCloud);

    this.shotMaterial = new THREE.LineBasicMaterial({
      color: 0xbcffb2,
      transparent: true,
      opacity: .76,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.turretShotMaterial = this.shotMaterial.clone();
    this.turretShotMaterial.color.setHex(0xffbd78);
    this.width = this.height = 0;
    this.setArea(area);
    this.setQuality('high');
  }

  setArea(area) {
    const junction = area === 'junction';
    const heart = area === 'heart';
    this.area = heart ? 'heart' : junction ? 'junction' : 'artery';
    const { arteryDetails, junctionDetails, heartDetails, canopy } = this.room;
    arteryDetails.visible = !junction && !heart;
    junctionDetails.visible = junction;
    heartDetails.visible = heart;
    if (heart && !this.heart) this.heart = this.makeHeart();
    if (this.heart) this.heart.group.visible = heart;
    canopy.scale.y = heart ? .54 : junction ? .63 : 1;
    this.scene.background.setHex(heart ? 0x26181f : junction ? 0x1d1115 : 0x230f11);
    this.scene.fog.color.setHex(heart ? 0x3c2228 : junction ? 0x332528 : 0x462524);
    this.scene.fog.density = heart ? .024 : junction ? .029 : .030;

    const { backlight, warm, side } = this.areaLights;
    backlight.color.setHex(heart ? 0xeab5b9 : junction ? 0xd2a79e : 0xffbd9e);
    backlight.intensity = heart ? .89 : junction ? 1.13 : 1.4;
    warm.intensity = heart ? 47 : junction ? 42 : 72;
    side.visible = !junction && !heart;
    this.updateEnemies([], 0);
    this.updateProjectiles([], false);
    for (const shot of this.shots) {
      this.scene.remove(shot.line);
      shot.line.geometry.dispose();
    }
    this.shots.length = 0;
    this.particles.length = 0;
    this.shotLight.intensity = 0;
    this.lastEvents = null;
    this.clock = 0;
    this.leakTime = 0;
    for (const branch of ['left', 'right']) {
      const { wound, tear, sheen } = this.junctionField.gashes[branch];
      this.junctionField.gashes[branch].opening = 0;
      wound.reshape(0);
      tear.visible = false;
      sheen.visible = false;
      this.junctionField.supports[branch].support.visible = false;
    }
    this.nodes = TISSUE_NODES[this.area];
    for (let i = 0; i < this.tissueViews.length; i++) {
      const view = this.tissueViews[i];
      const node = this.nodes[i];
      view.root.position.set(node.x, node.y + floorHeight(node.x, node.z), node.z);
      view.root.rotation.y = junction ? (i === 0 ? .31 : -.31) : i === 0 ? 0 : -.49;
      view.opening = 0;
      view.wound.reshape(0);
      view.channel.visible = false;
    }
    this.toolStream.visible = false;
    this.turretView.reset();
    this.camera.fov = 61;
    this.camera.updateProjectionMatrix();
  }

  setQuality(quality) {
    const low = quality === 'low';
    const next = low ? 'low' : 'high';
    if (next === this.quality) return;
    this.quality = next;
    this.renderer.shadowMap.enabled = !low;
    this.weaponKey.castShadow = !low;
    this.weaponKey.shadow.needsUpdate = !low;
    const { growths, cilia } = this.room;
    growths.count = low ? 330 : growths.instanceMatrix.count;
    cilia.count = low ? 170 : cilia.instanceMatrix.count;
    const { cells, cellPath, motes, clouds } = this.atmosphere;
    cells.count = low ? 35 : cellPath.length;
    motes.geometry.setDrawRange(0, low ? 280 : motes.geometry.attributes.position.count);
    clouds.forEach(({ cloud }, index) => { cloud.visible = !low || index % 3 === 2; });
    this.resize(true);
  }

  resize(force = false) {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const low = this.quality === 'low';
    const pixelRatio = Math.min(window.devicePixelRatio || 1, low ? .87 : 1.45,
      Math.sqrt((low ? 950000 : 2300000) / (width * height)));
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = width / height;
    this.weaponCamera.updateProjectionMatrix();
  }

  project(x, y, z) {
    const ndc = this.tempPosition.set(x, y, z).project(this.camera);
    return { x: (ndc.x * .5 + .5) * this.width, y: (.5 - ndc.y * .5) * this.height,
      visible: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z > -1 && ndc.z < 1 };
  }

  updateAtmosphere(dt) {
    this.clock += dt;
    const { cells, cellPath, motes, clouds } = this.atmosphere;
    for (let i = 0; i < cells.count; i++) {
      const { x, y, z, radius, phase, spin } = cellPath[i];
      const angle = phase + this.clock * .47;
      this.tempPosition.set(x + Math.sin(angle) * .86, y + Math.sin(angle * .61) * .58, z + Math.cos(angle * .72) * .79);
      this.transform.rotation.set(phase + this.clock * spin, phase * 1.7, phase * .3 + this.clock * spin * .58);
      setInstance(cells, i, this.transform, this.tempPosition, [radius, radius, radius * (1 + Math.sin(phase) * .14)]);
    }
    cells.instanceMatrix.needsUpdate = true;
    motes.position.x = Math.sin(this.clock * .15) * .43;
    motes.position.y = Math.sin(this.clock * .22) * .28;
    for (let i = 0; i < clouds.length; i++) {
      const { cloud, x, y, z } = clouds[i];
      if (!cloud.visible) continue;
      cloud.position.set(x + Math.sin(this.clock * .14 + i) * .94, y + Math.sin(this.clock * .09 + i) * .38, z);
    }
  }

  updateTissue(sim, dt, reduceMotion) {
    for (let i = 0; i < sim.nodes.length; i++) {
      const node = sim.nodes[i];
      const view = this.tissueViews[i];
      const state = THREE.MathUtils.clamp(node.health / 100, 0, 1);
      const { organ, core, fiber, glowOrb, light, channel, wound } = view;
      view.root.visible = !sim.tutorial || i === 0;
      const healing = sim.repairing && sim.repairTarget === node;
      const residualDamage = Math.max(0, 100 - node.health - (healing ? sim.repairProgress * 10 : 0));
      const target = Math.min(1, Math.sqrt(residualDamage / 43));
      const open = THREE.MathUtils.damp(view.opening, target, healing ? 11 : 8, dt);
      view.opening = open < .004 && target === 0 ? 0 : open;
      wound.reshape(view.opening);
      channel.visible = view.opening > .004;
      this.palette.copy(INJURED).lerp(i === 0 ? HEALTHY : HEALTHY_FLANK, state);
      if (healing) this.palette.lerp(REPAIR_LIGHT, .42);
      light.color.copy(this.palette);
      light.intensity = 5.2 + state * 1.1 + (healing ? 2.2 : 0);
      glowOrb.material.color.copy(healing ? REPAIR_LIGHT : this.palette);
      glowOrb.material.opacity = healing ? .10 : node.underAttack ? .049 : .017;
      const beat = reduceMotion ? 0 : Math.max(0, Math.sin(this.clock * 3.7 + i * .73)) ** 3;
      organ.scale.set(1 + beat * .027, 1 + beat * .044, 1 + beat * .026);
      core.material.emissive.copy(this.palette);
      core.material.emissiveIntensity = .025 + beat * .015 + (healing ? .04 : 0);
      fiber.emissive.copy(this.palette);
      fiber.emissiveIntensity = .033 + beat * .022 + (healing ? .13 : 0);
    }
  }

  updateJunctionField(sim, dt, reduceMotion) {
    const { gashes, supports, meshWire } = this.junctionField;
    const { gash, reinforcement } = sim;
    const sealing = gash && sim.repairTarget === gash;
    for (const branch of ['left', 'right']) {
      const site = gashes[branch];
      const torn = gash?.branch === branch;
      const remaining = torn ? gash.sealRemaining - (sealing ? sim.repairProgress * sim.repairAmount * .75 : 0) : 0;
      const target = torn ? Math.max(.10, remaining / gash.sealRequired) : 0;
      const open = THREE.MathUtils.damp(site.opening, target, torn && !sealing ? 13 : 10, dt);
      site.opening = !torn && open < .012 ? 0 : open;
      site.wound.reshape(site.opening);
      site.tear.visible = site.opening > 0;
      site.sheen.visible = site.tear.visible;
      if (site.sheen.visible) {
        site.sheen.material.color.setHex(sealing && torn ? 0x7af0ac : 0xff5d30);
        site.sheen.material.opacity = site.opening * (sealing && torn ? .16 : .11);
      }

      const { support, edge } = supports[branch];
      support.visible = reinforcement?.branch === branch;
      if (support.visible) {
        const strength = Math.min(1, reinforcement.remaining / 2.1);
        edge.material.opacity = .10 + strength * .24;
        meshWire.emissiveIntensity = .18 + strength * .72;
      }
    }
    this.leakTime -= dt;
    if (gash && !reduceMotion && this.leakTime <= 0) {
      const low = this.quality === 'low';
      this.leakTime = low ? .36 : .20;
      this.burst(gash.x, gash.y + .04, gash.z + .43, 0xe04b31, low ? 1 : 3, .85);
    }
  }

  updateEnemies(enemies, dt, reduceMotion = false) {
    for (const view of this.enemyViews.values()) view.present = false;
    for (const enemy of enemies) {
      let view = this.enemyViews.get(enemy.id);
      if (!view) {
        const model = this.templates[enemy.type].clone();
        const membrane = model.getObjectByName('attack-membrane');
        if (membrane) membrane.material = membrane.material.clone();
        this.scene.add(model);
        const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
        shadow.rotation.x = -Math.PI / 2;
        this.scene.add(shadow);
        view = {
          model, shadow, present: true, hit: 0, strike: 0, phase: this.random() * TAU,
          attackMembrane: membrane?.material,
          membraneGlow: membrane?.material.emissive.clone(),
          membraneIntensity: membrane?.material.emissiveIntensity,
          spikes: model.getObjectByName('virus-spikes'),
          fringe: model.getObjectByName('spore-fringe'),
        };
        this.enemyViews.set(enemy.id, view);
      }
      view.present = true;
      view.model.position.set(enemy.x, enemy.y, enemy.z);
      if (enemy.type === 'colony') {
        view.hit = Math.max(0, view.hit - dt * 7);
        const throb = reduceMotion ? 0 : Math.sin(this.clock * 3.1) * .025;
        view.model.scale.set(1 + throb + view.hit * .07, 1 - throb - view.hit * .06, 1);
        view.shadow.visible = false;
        continue;
      }
      const angle = view.phase + this.clock * (enemy.type === 'virus' ? .64 : .9);
      view.model.rotation.set(
        reduceMotion ? 0 : Math.sin(angle * .74) * .24,
        reduceMotion ? enemy.heading || 0 : angle,
        reduceMotion ? 0 : Math.sin(angle * .66) * .22,
      );
      view.strike = Math.max(0, view.strike - dt);
      if (view.strike > 0 && !enemy.latched && !reduceMotion) {
        const thrust = Math.sin(view.strike / .23 * Math.PI);
        view.model.position.lerp(enemy.node ?? OBJECTIVE, thrust * .10);
        view.model.rotation.z += thrust * .15;
      }
      view.hit = Math.max(0, view.hit - dt * 7);
      const pulse = 1 + (reduceMotion ? 0 : Math.sin(angle * 3) * .045 + view.hit * .13);
      view.model.scale.set(pulse, pulse - view.hit * .18, pulse);
      this.poseEnemyAttack(enemy, view, reduceMotion);
      if (enemy.latched) this.updateTethers(enemy, view, angle, reduceMotion);
      view.shadow.position.set(enemy.x, floorHeight(enemy.x, enemy.z) + .1, enemy.z);
      view.shadow.scale.setScalar((enemy.radius || .9) * 1.4);
    }
    for (const [id, view] of this.enemyViews) {
      if (!view.present) {
        this.scene.remove(view.model, view.shadow);
        if (view.tethers) this.scene.remove(...view.tethers);
        view.attackMembrane?.dispose();
        this.enemyViews.delete(id);
      }
    }
  }

  poseEnemyAttack(enemy, view, reduceMotion) {
    const { model, attackMembrane, spikes, fringe } = view;
    const progress = enemy.actionProgress ?? 0;
    const motion = reduceMotion ? .55 : 1;
    let glow = 0;
    if (spikes) spikes.scale.setScalar(1);
    if (fringe) fringe.scale.set(1, 1, 1);
    switch (enemy.action) {
      case 'virus-windup':
        model.rotation.set(-.27 * progress * motion, enemy.heading, 0);
        model.scale.x *= 1 + .18 * progress * motion;
        model.scale.y *= 1 - .36 * progress * motion;
        model.scale.z *= 1 - .24 * progress * motion;
        spikes?.scale.setScalar(1 - .22 * progress * motion);
        glow = .32 + .68 * progress;
        break;
      case 'virus-pounce': {
        const thrust = Math.sin(progress * Math.PI);
        model.rotation.set((.42 - progress * .84) * motion, enemy.heading, 0);
        model.scale.set(1 - .17 * thrust * motion, 1 - .16 * thrust * motion, 1 + .52 * thrust * motion);
        spikes?.scale.setScalar(1 + .11 * thrust * motion);
        glow = .9;
        break;
      }
      case 'virus-recover': {
        const recoil = Math.sin(progress * Math.PI) * motion;
        model.rotation.set(-.46 * recoil, enemy.heading, 0);
        model.scale.set(1 + .23 * recoil, 1 - .34 * recoil, 1 + .18 * recoil);
        glow = (1 - progress) * .42;
        break;
      }
      case 'spore-windup':
        model.rotation.set(-.20 * progress * motion, enemy.heading, 0);
        model.scale.x *= 1 + .30 * progress * motion;
        model.scale.y *= 1 - .23 * progress * motion;
        model.scale.z *= 1 + .30 * progress * motion;
        fringe?.scale.set(1 - .20 * progress * motion, 1 - .36 * progress * motion, 1 - .20 * progress * motion);
        glow = .34 + .66 * progress;
        break;
      case 'spore-recover': {
        const expel = Math.pow(1 - progress, 3) * motion;
        model.rotation.set(.36 * expel, enemy.heading, 0);
        model.scale.set(1 - .28 * expel, 1 + .35 * expel, 1 - .28 * expel);
        fringe?.scale.set(1 + .29 * expel, 1 + .27 * expel, 1 + .29 * expel);
        glow = (1 - progress) * .48;
        break;
      }
      case 'bacillus-windup':
        model.scale.y *= 1 + .29 * progress * motion;
        glow = .23 + .65 * progress;
        break;
      case 'bacillus-tear':
        model.scale.y *= 1 - .23 * Math.sin(progress * Math.PI) * motion;
        glow = .76 * (1 - progress);
        break;
    }
    if (attackMembrane) {
      attackMembrane.emissive.copy(view.membraneGlow).lerp(ATTACK_GLOW[enemy.type], glow * .58);
      attackMembrane.emissiveIntensity = view.membraneIntensity + glow * .66;
    }
  }

  updateTethers(enemy, view, angle, reduceMotion) {
    if (!view.tethers) {
      view.tethers = [-1, 1].map(() => addMesh(this.scene, this.tetherGeometry, this.tetherMaterial));
    }
    const anchor = enemy.attackAnchor ?? enemy.node ?? OBJECTIVE;
    const dx = anchor.x - enemy.x;
    const dz = anchor.z - enemy.z;
    const distance = Math.max(.01, Math.hypot(dx, dz));
    const x = dx / distance;
    const z = dz / distance;
    const progress = enemy.actionProgress ?? 0;
    const windup = enemy.action === 'bacillus-windup' ? progress : 0;
    const tear = enemy.action === 'bacillus-tear' ? Math.sin(progress * Math.PI) : 0;
    const motion = reduceMotion ? .55 : 1;
    const pull = .58 + (reduceMotion ? 0 : Math.sin(angle * 3) * .06) - windup * .44 * motion + tear * .69 * motion;
    view.model.rotation.set(z * pull, Math.atan2(x, z), -x * pull);
    view.model.position.x -= x * (windup * .23 - tear * .18) * motion;
    view.model.position.z -= z * (windup * .23 - tear * .18) * motion;
    view.tethers.forEach((tether, index) => {
      const spread = index === 0 ? -.15 : .15;
      this.tetherStart.set(view.model.position.x + x * .20 + z * spread,
        view.model.position.y + .04, view.model.position.z + z * .20 - x * spread);
      const radius = enemy.attackAnchor ? .45 : .89;
      this.tetherEnd.set(anchor.x - x * radius + z * spread * 1.45,
        anchor.y + spread * 1.4, anchor.z - z * radius - x * spread * 1.45);
      this.tetherDirection.subVectors(this.tetherEnd, this.tetherStart);
      const width = 1 + windup * .4 + tear * .2;
      tether.scale.set(width, this.tetherDirection.length(), width);
      tether.position.copy(this.tetherStart).lerp(this.tetherEnd, .5);
      tether.quaternion.setFromUnitVectors(UP, this.tetherDirection.normalize());
    });
  }

  updateProjectiles(projectiles, reduceMotion) {
    for (const view of this.projectileViews.values()) view.present = false;
    for (const projectile of projectiles) {
      let view = this.projectileViews.get(projectile.id);
      if (!view) {
        view = {
          model: addMesh(this.scene, this.sporeDroplet, this.sporeDropletMaterial),
          trail: addMesh(this.scene, this.sporeTrail, this.sporeTrailMaterial),
        };
        this.projectileViews.set(projectile.id, view);
      }
      view.present = true;
      const radius = projectile.radius;
      const direction = this.projectileDirection.set(projectile.vx, projectile.vy, projectile.vz).normalize();
      view.model.position.set(projectile.x, projectile.y, projectile.z);
      view.model.scale.set(radius * .88, radius * .88, radius * 1.35);
      if (direction.lengthSq() > 0) view.model.quaternion.setFromUnitVectors(FORWARD, direction);
      view.trail.visible = this.quality !== 'low' && !reduceMotion;
      if (view.trail.visible) {
        view.trail.position.copy(view.model.position).addScaledVector(direction, -radius * 1.48);
        view.trail.quaternion.copy(view.model.quaternion);
        view.trail.scale.set(radius * .41, radius * .41, radius * 2.3);
      }
    }
    for (const [id, view] of this.projectileViews) {
      if (view.present) continue;
      this.scene.remove(view.model, view.trail);
      this.projectileViews.delete(id);
    }
  }

  burst(x, y, z, color, count, spread) {
    this.palette.set(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const speed = (.25 + this.random() * .9) * spread;
      const angle = this.random() * TAU;
      const life = .14 + this.random() * .37;
      this.particles.push({
        x, y, z,
        vx: Math.cos(angle) * speed,
        vy: (.25 + this.random() * .66) * speed,
        vz: Math.sin(angle) * speed,
        r: this.palette.r, g: this.palette.g, b: this.palette.b, life, remaining: life,
      });
    }
  }

  updateParticles(dt) {
    let count = 0;
    for (const particle of this.particles) {
      particle.remaining -= dt;
      if (particle.remaining <= 0) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vy -= 2.4 * dt;
      const index = count * 3;
      const fade = particle.remaining / particle.life;
      this.particlePositions[index] = particle.x;
      this.particlePositions[index + 1] = particle.y;
      this.particlePositions[index + 2] = particle.z;
      this.particleColors[index] = particle.r * fade;
      this.particleColors[index + 1] = particle.g * fade;
      this.particleColors[index + 2] = particle.b * fade;
      this.particles[count++] = particle;
    }
    this.particles.length = count;
    const geometry = this.particleCloud.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.setDrawRange(0, count);
  }

  updateWeapon(sim, dt, input, aiming, reduceMotion) {
    const pose = this.weaponPose;
    if (pose.sim !== sim) {
      pose.sim = sim;
      pose.stride = pose.movement = pose.aim = pose.recoil = pose.flash = pose.lowered = 0;
      pose.swayX = pose.swayY = 0;
    }
    const { clamp, damp, lerp, smoothstep } = THREE.MathUtils;
    const moving = reduceMotion ? 0 : Math.min(1, Math.hypot(input.moveX, input.moveZ));
    const sprint = input.sprint && !aiming;
    pose.movement = damp(pose.movement, moving, 11, dt);
    pose.stride += dt * (sprint ? 14 : 9) * pose.movement;
    pose.aim = damp(pose.aim, aiming ? 1 : 0, 18, dt);
    pose.lowered = damp(pose.lowered, sim.repairing ? 1 : 0, 12, dt);
    pose.recoil = damp(pose.recoil, 0, 16, dt);
    pose.flash = Math.max(0, pose.flash - dt);
    pose.swayX = damp(pose.swayX, reduceMotion ? 0 : clamp(input.lookX * .001, -.027, .027), 15, dt);
    pose.swayY = damp(pose.swayY, reduceMotion ? 0 : clamp(input.lookY * .001, -.023, .023), 15, dt);

    const { model, muzzle, flash, magazine, supportHand, bolt, poseHands } = this.carbine;
    if (sim.events !== this.lastEvents && sim.events.some(event => event.type === 'shot')) {
      pose.recoil = Math.min(1.24, pose.recoil + (reduceMotion ? .43 : 1));
      pose.flash = reduceMotion ? 0 : .037;
      flash.rotation.z = this.random() * TAU;
    }
    const aim = pose.aim;
    const reload = sim.reloadProgress;
    const reloadTilt = smoothstep(reload, 0, .17) * (1 - smoothstep(reload, .82, 1));
    const reach = smoothstep(reload, .035, .195) * (1 - smoothstep(reload, .80, .98));
    const magazineTravel = smoothstep(reload, .195, .43) * (1 - smoothstep(reload, .61, .80));
    const magazineTurn = smoothstep(reload, .30, .49) * (1 - smoothstep(reload, .64, .77));
    const seat = smoothstep(reload, .75, .80) * (1 - smoothstep(reload, .80, .89));
    const walk = Math.sin(pose.stride) * pose.movement * (1 - aim * .88);
    const step = Math.sin(pose.stride * 2) * pose.movement * (1 - aim * .88);
    const idle = reduceMotion ? 0 : Math.sin(this.clock * 2.1) * .005 * (1 - aim);
    const hipX = Math.min(.34, .14 + .12 * this.camera.aspect);
    const sway = 1 - aim * .9;
    model.position.set(
      lerp(hipX, -this.weaponSight.x, aim) + walk * .022 - pose.swayX * sway - reloadTilt * .075,
      lerp(-.255, -this.weaponSight.y, aim) + idle + step * .011 + pose.swayY * sway
        + reloadTilt * .07 - pose.lowered * .42 - pose.recoil * .014,
      lerp(-.60, -.61, aim) + pose.recoil * .068 - reloadTilt * .13,
    );
    model.rotation.set(
      lerp(.12, 0, aim) + pose.recoil * .065 + reloadTilt * .12 - seat * .047 - pose.lowered * .63 - pose.swayY,
      lerp(.18, 0, aim) + reloadTilt * .19 - pose.swayX,
      lerp(-.06, 0, aim) + walk * .035 + reloadTilt * .55 - pose.lowered * .25,
    );
    magazine.position.copy(this.magazineRest);
    magazine.position.x -= magazineTurn * .067;
    magazine.position.y -= magazineTravel * .196;
    magazine.position.z += magazineTurn * .056;
    magazine.rotation.set(magazineTurn * .22, -magazineTurn * .15, -magazineTurn * .24);
    this.magazineHandPosition.copy(this.magazineGrip).applyQuaternion(magazine.quaternion).add(magazine.position);
    supportHand.position.copy(this.supportRest).lerp(this.magazineHandPosition,reach);
    supportHand.rotation.set(-reach * .24 + magazineTurn * .15, reach * .15, reach * .42 + magazineTurn * .17);
    bolt.position.z = Math.max(pose.recoil * .033, seat * .023);
    poseHands(reach, Math.min(pose.recoil,1));
    flash.visible = pose.flash > 0;
    model.visible = pose.lowered < .91;
    this.updateRepairTool(sim, idle, walk, reduceMotion);

    this.weaponLightRotation.copy(this.camera.quaternion).invert();
    this.weaponKey.position.set(-1.3, 1.76, -.92)
      .applyQuaternion(this.weaponLightRotation).add(this.weaponKey.target.position);
    this.weaponScene.environmentRotation.setFromQuaternion(this.weaponLightRotation);
    this.weaponFlash.intensity = flash.visible ? 3.4 * (pose.flash / .037) : 0;
    muzzle.getWorldPosition(this.weaponFlash.position);
  }

  updateRepairTool(sim, idle, walk, reduceMotion) {
    const { model, nozzle, indicator, reagent } = this.repairTool;
    const raise = THREE.MathUtils.smoothstep(this.weaponPose.lowered, .16, .86);
    model.visible = raise > .02;
    this.toolStream.visible = false;
    if (!model.visible) return;

    model.position.set(Math.min(.23, .11 + this.camera.aspect * .08) + walk * .018,
      -.237 - (1 - raise) * .42 + idle, -.58);
    model.rotation.set(.055 - (1 - raise) * .38, .17, -.07 + walk * .028);
    indicator.emissiveIntensity = .56 + sim.repairProgress * .65;
    reagent.emissiveIntensity = .42 + sim.repairProgress * .32;

    const target = sim.repairTarget ?? sim.objective;
    this.toolTarget.copy(target);
    this.toolTarget.y += floorHeight(target.x, target.z);
    this.toolTarget.z += sim.gash && target === sim.gash ? .49 : .83;
    if (!sim.repairing || raise < .68 || !this.project(this.toolTarget.x, this.toolTarget.y, this.toolTarget.z).visible) return;
    const start = nozzle.getWorldPosition(this.toolStart);
    const ratio = Math.tan(this.camera.fov * Math.PI / 360) / Math.tan(this.weaponCamera.fov * Math.PI / 360);
    start.x *= ratio;
    start.y *= ratio;
    this.camera.localToWorld(start);
    const direction = this.toolDirection.subVectors(this.toolTarget, start);
    if (direction.lengthSq() < .01) return;
    this.toolStream.scale.y = direction.length();
    this.toolStream.position.copy(start).lerp(this.toolTarget, .5);
    this.toolStream.quaternion.setFromUnitVectors(UP, direction.normalize());
    this.toolStream.material.opacity = reduceMotion ? .30 : .36 + Math.sin(this.clock * 17) * .08;
    this.toolStream.visible = true;
  }

  addShot(event) {
    const start = this.carbine.muzzle.getWorldPosition(new THREE.Vector3());
    // Match the on-screen muzzle position across the two camera fields of view.
    const ratio = Math.tan(this.camera.fov * Math.PI / 360) / Math.tan(this.weaponCamera.fov * Math.PI / 360);
    start.x *= ratio;
    start.y *= ratio;
    this.camera.localToWorld(start);
    const end = Number.isFinite(event.x) && Number.isFinite(event.y) && Number.isFinite(event.z)
      ? new THREE.Vector3(event.x, event.y, event.z)
      : new THREE.Vector3(0, 0, -36).applyQuaternion(this.camera.quaternion).add(this.camera.position);
    this.addTracer(start, end, this.shotMaterial, .064);
    this.shotLight.intensity = 13;
    this.shotLight.position.copy(start);
    if (event.hit) this.burst(end.x, end.y, end.z, event.crit ? 0xffc875 : 0xff765a, event.crit ? 18 : 9, 3);
  }

  addTracer(start, end, material, remaining) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), material);
    this.scene.add(line);
    this.shots.push({ line, remaining });
  }

  addTurretShot(event, reduceMotion) {
    const { x, y, z } = event.impact;
    const dx = x - event.x;
    const dz = z - event.z;
    this.turretView.fire(reduceMotion, Math.atan2(dx, dz), Math.atan2(y - event.y, Math.hypot(dx, dz)));
    const start = this.turretView.muzzle.getWorldPosition(this.turretMuzzle);
    this.addTracer(start, new THREE.Vector3(x, y, z), this.turretShotMaterial, .081);
    this.burst(x, y, z, 0xf49b62, reduceMotion ? 3 : 11, 2.2);
  }

  processEvents(events, dt, reduceMotion) {
    if (events !== this.lastEvents) {
      this.lastEvents = events;
      for (const event of events) {
        if (event.type === 'shot') this.addShot(event);
        if (event.type === 'turret' && event.stage === 'fire') this.addTurretShot(event, reduceMotion);
        if (event.type === 'turret' && (event.stage === 'deployed' || event.stage === 'redeployed') && !reduceMotion) {
          this.burst(event.x, floorHeight(event.x, event.z) + .11, event.z, 0xb78079, 15, 1.2);
        }
        if (event.type === 'hit' && this.enemyViews.has(event.id)) this.enemyViews.get(event.id).hit = 1;
        if (event.type === 'kill') this.burst(event.x, event.y, event.z, SPECIES_COLORS[event.enemyType] || 0xff9c60, 40, 4.9);
        if (event.type === 'repair') {
          this.burst(event.x, event.y + .15, event.z, 0x83ffca, event.complete ? 62 : 38, event.complete ? 4.8 : 3.6);
        }
        if (event.type === 'gash' && event.stage === 'open') this.burst(event.x, event.y + .12, event.z + .33, 0xff7555, 22, 2.6);
        if (event.type === 'damage' && event.target === 'tissue') {
          const attacker = this.enemyViews.get(event.id);
          if (attacker) attacker.strike = .23;
          const anchor = event.branch && this.area === 'junction' && event.anchor === 'gash'
            ? JUNCTION_GASH_SITES[event.branch] : this.nodes.find(node => node.id === event.nodeId) ?? OBJECTIVE;
          this.burst(THREE.MathUtils.lerp(anchor.x, event.x, .58), anchor.y + .03,
            THREE.MathUtils.lerp(anchor.z, event.z, .58), 0xf37337, 14, 2.4);
        }
        if (event.type === 'enemyAttack' && event.enemyType === 'spore') {
          if (event.stage === 'release') this.burst(event.x, event.y, event.z, 0xd279b1, 8, .9);
          if (event.stage === 'impact') this.burst(event.x, event.y, event.z, 0xe39bc8, 12, 1.7);
        }
        if (event.type === 'valve' && event.stage === 'blocked') {
          this.burst(event.x, event.y, event.z + .16, 0xdb806d, 7, 1.7);
        }
      }
    }
    let count = 0;
    for (const shot of this.shots) {
      shot.remaining -= dt;
      if (shot.remaining <= 0) {
        this.scene.remove(shot.line);
        shot.line.geometry.dispose();
      } else {
        this.shots[count++] = shot;
      }
    }
    this.shots.length = count;
    this.shotLight.intensity *= Math.exp(-dt * 28);
  }

  render(sim, dt, input, reduceMotion) {
    this.resize();
    const { player } = sim;
    this.camera.position.set(player.x, player.y, player.z);
    this.camera.rotation.set(player.pitch, player.yaw, 0);
    const aiming = input.aim && !sim.reloading && !sim.repairing;
    const targetFov = aiming ? 48 : 61;
    if (Math.abs(targetFov - this.camera.fov) > .04) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 10));
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.updateAtmosphere(dt);
    if (sim.valve) this.heart.update(sim.valve, dt, reduceMotion, this.quality === 'low');
    this.updateTissue(sim, dt, reduceMotion);
    if (this.area === 'junction') this.updateJunctionField(sim, dt, reduceMotion);
    this.updateEnemies(sim.enemies, dt, reduceMotion);
    this.updateProjectiles(sim.projectiles ?? [], reduceMotion);
    const { turret } = sim;
    this.turretView.update(turret, turret ? floorHeight(turret.x, turret.z) : 0, dt, reduceMotion);
    this.updateWeapon(sim, dt, input, aiming, reduceMotion);
    this.processEvents(sim.events, dt, reduceMotion);
    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
    // Give the close-up model its own depth buffer without clearing the artery.
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.weaponScene, this.weaponCamera);
    this.renderer.autoClear = true;
    return this.weaponPose.aim > .94;
  }
}
