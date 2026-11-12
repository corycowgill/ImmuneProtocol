import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const TISSUE = new THREE.Vector3(0, 1.25, -8);
const UP = new THREE.Vector3(0, 1, 0);

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
  return new THREE.Vector3(Math.cos(angle) * 25 * ripple * arch, height,
    Math.sin(angle) * 36 * ripple * arch);
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
  const geometry = new THREE.PlaneGeometry(60, 81, 136, 168);
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const z = vertices.getZ(i);
    const edge = Math.max(0, Math.hypot(x / 24, z / 35) - .78);
    vertices.setY(i, floorHeight(x, z) + edge * edge * 5);
    uv.setXY(i, x / 4.6, z / 4.6);
  }
  geometry.computeVertexNormals();
  colorGeometry(geometry, (color, x, y, z) => {
    const p = Math.sin(x * .35 + z * .5) * .5 + Math.cos(z * .26 - x * .61) * .5;
    const rim = Math.max(0, Math.hypot(x / 24, z / 35) - .45);
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

function makeRoom(scene, tile, normal, glow, random) {
  const surfaces = [];
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

  const roof = new THREE.PlaneGeometry(50, 74, 54, 76);
  roof.rotateX(Math.PI / 2);
  const roofVertices = roof.attributes.position;
  const roofUv = roof.attributes.uv;
  for (let i = 0; i < roofVertices.count; i++) {
    const x = roofVertices.getX(i);
    const z = roofVertices.getZ(i);
    const edge = Math.min(1, Math.hypot(x / 25, z / 36));
    roofVertices.setY(i, 14.5 + (1 - edge ** 2) * 5 + Math.cos(x * .41 + z * .25) * .9);
    roofUv.setXY(i, x / 3.7, z / 3.7);
  }
  roof.computeVertexNormals();
  addMesh(scene, roof, skin({ color: 0x9e6768, side: THREE.DoubleSide, roughness: .66 }));

  const lobeMaterial = skin({ color: 0xeca5a3, roughness: .41, clearcoat: .55 });
  const vesselMaterial = skin({ color: 0xdb7f82, roughness: .36, clearcoat: .78 });
  const tinyVesselMaterial = skin({ color: 0xdf9193, roughness: .32, clearcoat: .68 });
  const lobe = texturedLobe(1, 32, 20, .24);
  const transform = new THREE.Object3D();
  const folds = instanceMesh(scene, lobe, lobeMaterial, 47);

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
  for (const { points, radius } of branches) addVessel(scene, vesselMaterial, points, radius, .37);

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
  const growths = instanceMesh(scene, texturedLobe(1, 12, 8, .32), growthMaterial, 790);
  const patch = new THREE.Vector3();
  const ciliaGeometry = tubeGeometry([
    new THREE.Vector3(0, -.2, 0), new THREE.Vector3(.02, .1, .02),
    new THREE.Vector3(.02, .45, .09), new THREE.Vector3(.12, .69, .16),
  ], .068, .22, 7, 5);
  const cilia = instanceMesh(scene, ciliaGeometry, tinyVesselMaterial, 560);

  for (let i = 0; i < growths.count; i++) {
    const angle = random() * TAU;
    const radial = .21 + Math.sqrt(random()) * .76;
    const x = Math.cos(angle) * 23 * radial;
    const z = Math.sin(angle) * 34 * radial;
    const edge = Math.hypot(x / 22, z / 33);
    const size = .035 + random() ** 3 * (edge > .73 ? .92 : .22);
    patch.set(x, floorHeight(x, z) - size * .24, z);
    transform.rotation.set(.1, random() * TAU, (random() - .5) * .4);
    setInstance(growths, i, transform, patch, [size, size * (.48 + random()), size * (.7 + random() * .4)]);
    growths.setColorAt(i, new THREE.Color().setRGB(.55 + random() * .45, .29 + random() * .61, .33 + random() * .45));
  }

  for (let i = 0; i < cilia.count; i++) {
    const angle = random() * TAU;
    const radial = .27 + Math.sqrt(random()) * .72;
    const x = Math.cos(angle) * 23 * radial;
    const z = Math.sin(angle) * 34 * radial;
    const edge = Math.hypot(x / 22, z / 33);
    const size = .13 + random() ** 2 * (edge > .8 ? 2.35 : .57);
    patch.set(x, floorHeight(x, z), z);
    transform.rotation.set((random() - .5) * .5, random() * TAU, (random() - .5) * .58);
    setInstance(cilia, i, transform, patch, [size, size, size]);
    cilia.setColorAt(i, new THREE.Color().setRGB(.57 + random() * .42, .46 + random() * .38, .41 + random() * .38));
  }

  const bulb = new THREE.PointLight(0xffb07c, 310, 34, 2);
  bulb.position.set(3.5, 3.8, -30.5);
  scene.add(bulb);
  const backGlow = sprite(glow, 0xffae65, 18, .75);
  backGlow.position.set(3.4, 3.6, -32);
  scene.add(backGlow);
  const filament = sprite(glow, 0xffe5aa, 3.5, .82);
  filament.position.set(3.5, 3.8, -31.2);
  filament.scale.y *= 2.25;
  scene.add(filament);

  return surfaces;
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
    const x = Math.cos(angle) * radial * 22;
    const z = Math.sin(angle) * radial * 33;
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
    positions[index] = Math.cos(angle) * radial * 23;
    positions[index + 1] = .05 + random() ** 1.45 * 14;
    positions[index + 2] = Math.sin(angle) * radial * 33;
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

function makeTissue(scene, glow, floorNormal, random) {
  const root = new THREE.Group();
  root.position.copy(TISSUE);
  scene.add(root);
  const lobe = texturedLobe(1, 26, 18, .25);
  const membrane = new THREE.MeshPhysicalMaterial({
    color: 0x5da695, emissive: 0x136d54, emissiveIntensity: .48,
    roughness: .29, metalness: .08, clearcoat: .85, clearcoatRoughness: .2,
    normalMap: floorNormal, normalScale: new THREE.Vector2(.55, .55),
  });
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xbe837a, roughness: .37, clearcoat: .61,
    normalMap: floorNormal, normalScale: new THREE.Vector2(.7, .7),
  });
  const fiber = new THREE.MeshStandardMaterial({
    color: 0x8be9ca, emissive: 0x21f8ae, emissiveIntensity: .6,
    metalness: .16, roughness: .35,
  });
  const coreMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc2ffe1, emissive: 0x72ffbd, emissiveIntensity: .93, clearcoat: .68, roughness: .3,
  });
  const organ = new THREE.Group();
  root.add(organ);
  const core = addMesh(organ, lobe, coreMaterial, new THREE.Vector3(0, .13, 0), [.69, .84, .61]);
  const glowOrb = sprite(glow, 0x66ffb5, 5.6, .48);
  glowOrb.position.y = .25;
  organ.add(glowOrb);

  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * TAU + random() * .16;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    const sac = addMesh(organ, lobe, membrane, new THREE.Vector3(x * .66, -.14 + random() * .33, z * .66),
      [.36 + random() * .11, .65 + random() * .35, .32 + random() * .11]);
    sac.quaternion.setFromUnitVectors(UP, new THREE.Vector3(x * .64, .77, z * .64).normalize());

    const scute = addMesh(root, lobe, shell, new THREE.Vector3(x * 1.16, -.91 + random() * .12, z * 1.16),
      [.56, .33 + random() * .2, .55]);
    scute.rotation.y = -angle;
    addVessel(root, shell, [[x * .77, -.63, z * .77], [x * 1.32, -.8, z * 1.32],
      [x * 1.75, -1.15, z * 1.75], [x * (2.2 + random() * .44), -1.26, z * (2.2 + random() * .44)]], .17 + random() * .06);
    addVessel(organ, fiber, [[x * 1.34, -.77, z * 1.34], [x * 1.12, -.22, z * 1.12],
      [x * .91 - z * .15, .39, z * .91 + x * .15],
      [x * .58 - z * .27, .66, z * .58 + x * .27]], .023, .16);
  }

  const light = new THREE.PointLight(0x84ffbf, 42, 11, 2);
  light.position.y = 1.2;
  root.add(light);

  const contact = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 5.3), new THREE.MeshBasicMaterial({
    color: 0x070101, map: glow, transparent: true, depthWrite: false, opacity: .76,
  }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.13;
  root.add(contact);

  return { organ, core, membrane, fiber, glowOrb, light };
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
  const body = texturedLobe(.55, 36, 23, .25);
  colorGeometry(body, (color, x, y, z) => {
    const bands = Math.sin(x * 15 + y * 4 + Math.cos(z * 13) * 2.6) * Math.cos(y * 18 - z * 6);
    color.setRGB(.71 + bands * .25, .38 + bands * .16, .22 + bands * .11);
  });
  const coat = biologicalMaterial(0xeb744f, normal, {
    vertexColors: true, emissive: 0x50110b, emissiveIntensity: .82, sheen: .34, sheenColor: 0xff9867,
  });
  addMesh(organism, body, coat);
  const thorn = biologicalMaterial(0xb92f18, normal, { emissive: 0x3c0c03, emissiveIntensity: .73 });
  const jewel = biologicalMaterial(0xffab62, normal, { emissive: 0xff4619, emissiveIntensity: .58 });
  const spike = new THREE.CylinderGeometry(.045, .093, 1, 8, 3);
  const cap = texturedLobe(1, 10, 8, .3);
  const spikes = instanceMesh(organism, spike, thorn, 34);
  const heads = instanceMesh(organism, cap, jewel, 34);
  const nodules = instanceMesh(organism, cap, jewel, 27);
  const transform = new THREE.Object3D();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < spikes.count; i++) {
    const y = 1 - (i + .5) / spikes.count * 2;
    const w = Math.sqrt(1 - y * y);
    const angle = i * goldenAngle + random() * .13;
    const vector = new THREE.Vector3(Math.cos(angle) * w, y, Math.sin(angle) * w);
    const reach = .74 + random() * .13;
    transform.quaternion.setFromUnitVectors(UP, vector);
    setInstance(spikes, i, transform, vector.clone().multiplyScalar((reach + .43) * .5), [1, reach - .43, 1]);
    const width = .044 + random() * .05;
    setInstance(heads, i, transform, vector.clone().multiplyScalar(reach), [width, width * (1 + random() * .59), width]);
    heads.setColorAt(i, new THREE.Color().setRGB(1, .45 + random() * .51, .24 + random() * .42));
    if (i < nodules.count) {
      vector.applyAxisAngle(UP, .28);
      setInstance(nodules, i, transform, vector.multiplyScalar(.51), [.058, .062, .073]);
    }
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
  const bell = texturedLobe(.52, 29, 20, .25);
  colorGeometry(bell, (color, x, y, z) => {
    const hue = .61 + Math.sin(x * 18 - y * 16 + z * 14) * .25;
    color.setRGB(hue * .7, hue * .54, hue + .12);
  });
  const membrane = biologicalMaterial(0xc197d4, normal, {
    vertexColors: true, emissive: 0x623077, emissiveIntensity: .76, sheen: .57, sheenColor: 0xeac6fe,
  });
  const tendril = biologicalMaterial(0xdc9adb, normal, { emissive: 0xd951d5, emissiveIntensity: .46 });
  const sac = biologicalMaterial(0xe999ef, normal, { emissive: 0xf263fc, emissiveIntensity: .69 });
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
  addMesh(organism, joinTubes(roots), tendril);

  const lobe = texturedLobe(.23, 20, 14, .23);
  addMesh(organism, lobe, sac, new THREE.Vector3(0, -.14, 0), [1.32, .81, 1.32]);
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
const SPECIES_COLORS = { virus: 0xff6d4a, bacillus: 0xffd078, spore: 0xf384ff };
const HEALTHY = new THREE.Color(0x53ffad);
const INJURED = new THREE.Color(0xff3d1f);

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x230f11);
    this.scene.fog = new THREE.FogExp2(0x462524, .036);
    this.scene.environment = reflectionTexture();
    this.scene.environmentIntensity = .51;

    this.camera = new THREE.PerspectiveCamera(61, 1, .063, 95);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.7, 18);
    this.clock = 0;
    this.random = randomSource(880129);
    this.transform = new THREE.Object3D();
    this.tempPosition = new THREE.Vector3();
    this.palette = new THREE.Color();
    this.glow = glowTexture();
    this.enemyViews = new Map();
    this.particles = [];
    this.shots = [];
    this.lastEvents = null;

    this.scene.add(new THREE.HemisphereLight(0xf4c3a4, 0x59313d, 1.05));
    const backlight = new THREE.DirectionalLight(0xffbd9e, 1.4);
    backlight.position.set(-12, 10, -16);
    this.scene.add(backlight);
    const fill = new THREE.DirectionalLight(0x9b9dbd, .58);
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

    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const tile = configureTile(fallbackTissue(), anisotropy, true);
    const normal = normalFromImage(tile.image, anisotropy);
    const surfaces = makeRoom(this.scene, tile, normal, this.glow, this.random);
    this.atmosphere = makeAtmosphere(this.scene, this.glow, this.random);
    this.tissue = makeTissue(this.scene, this.glow, normal, this.random);
    this.templates = {
      virus: virusModel(normal),
      bacillus: bacillusModel(normal),
      spore: sporeModel(normal),
    };
    new THREE.TextureLoader().load(new URL('./assets/tissue.webp', import.meta.url).href, (asset) => {
      configureTile(asset, anisotropy, true);
      const normalMap = normalFromImage(asset.image, anisotropy);
      for (const material of surfaces) {
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
    this.width = this.height = 0;
    this.resize();
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.45, Math.sqrt(2300000 / (width * height)));
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  project(x, y, z) {
    const ndc = this.tempPosition.set(x, y, z).project(this.camera);
    return { x: (ndc.x * .5 + .5) * this.width, y: (.5 - ndc.y * .5) * this.height,
      visible: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z > -1 && ndc.z < 1 };
  }

  updateAtmosphere(dt) {
    this.clock += dt;
    const { cells, cellPath, motes, clouds } = this.atmosphere;
    for (let i = 0; i < cellPath.length; i++) {
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
      cloud.position.set(x + Math.sin(this.clock * .14 + i) * .94, y + Math.sin(this.clock * .09 + i) * .38, z);
    }
  }

  updateTissue(sim) {
    const state = THREE.MathUtils.clamp(sim.tissue / 100, 0, 1);
    const { organ, core, membrane, fiber, glowOrb, light } = this.tissue;
    const healing = sim.repairProgress > 0 && sim.canRepair;
    this.palette.copy(INJURED).lerp(HEALTHY, Math.sqrt(state));
    light.color.copy(this.palette);
    light.intensity = 28 + state * 17 + (healing ? 19 + Math.sin(this.clock * 17) * 9 : 0);
    glowOrb.material.color.copy(this.palette);
    glowOrb.material.opacity = .25 + state * .19 + (healing ? .2 : 0);
    const beat = Math.max(0, Math.sin(this.clock * (healing ? 11 : 3.7))) ** 3;
    organ.scale.set(1 + beat * .065, 1 + beat * .08, 1 + beat * .065);
    core.material.emissive.copy(this.palette);
    fiber.emissive.copy(this.palette);
    membrane.emissive.copy(this.palette).multiplyScalar(.19);
  }

  updateEnemies(enemies, dt) {
    for (const view of this.enemyViews.values()) view.present = false;
    for (const enemy of enemies) {
      let view = this.enemyViews.get(enemy.id);
      if (!view) {
        const model = this.templates[enemy.type].clone();
        this.scene.add(model);
        const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
        shadow.rotation.x = -Math.PI / 2;
        this.scene.add(shadow);
        view = { model, shadow, present: true, hit: 0, phase: this.random() * TAU };
        this.enemyViews.set(enemy.id, view);
      }
      view.present = true;
      view.model.position.set(enemy.x, enemy.y, enemy.z);
      const angle = view.phase + this.clock * (enemy.type === 'virus' ? .64 : .9);
      view.model.rotation.set(Math.sin(angle * .74) * .24, angle, Math.sin(angle * .66) * .22);
      view.hit = Math.max(0, view.hit - dt * 7);
      const pulse = 1 + Math.sin(angle * 3) * .045 + view.hit * .13;
      view.model.scale.set(pulse, pulse - view.hit * .18, pulse);
      view.shadow.position.set(enemy.x, floorHeight(enemy.x, enemy.z) + .1, enemy.z);
      view.shadow.scale.setScalar((enemy.radius || .9) * 1.4);
    }
    for (const [id, view] of this.enemyViews) {
      if (!view.present) {
        this.scene.remove(view.model, view.shadow);
        this.enemyViews.delete(id);
      }
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

  addShot(event) {
    const start = new THREE.Vector3(.4, -.31, -.9).applyQuaternion(this.camera.quaternion).add(this.camera.position);
    const end = Number.isFinite(event.x) && Number.isFinite(event.y) && Number.isFinite(event.z)
      ? new THREE.Vector3(event.x, event.y, event.z)
      : new THREE.Vector3(0, 0, -36).applyQuaternion(this.camera.quaternion).add(this.camera.position);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), this.shotMaterial);
    this.scene.add(line);
    this.shots.push({ line, remaining: .064 });
    this.shotLight.intensity = 13;
    this.shotLight.position.copy(start);
    if (event.hit) this.burst(end.x, end.y, end.z, event.crit ? 0xffc875 : 0xff765a, event.crit ? 18 : 9, 3);
  }

  processEvents(events, dt, active) {
    if (active && events !== this.lastEvents) {
      this.lastEvents = events;
      for (const event of events) {
        if (event.type === 'shot') this.addShot(event);
        if (event.type === 'hit' && this.enemyViews.has(event.id)) this.enemyViews.get(event.id).hit = 1;
        if (event.type === 'kill') this.burst(event.x, event.y, event.z, SPECIES_COLORS[event.enemyType] || 0xff9c60, 40, 4.9);
        if (event.type === 'repair') this.burst(0, 1.4, -8, 0x83ffca, 38, 3.6);
        if (event.type === 'damage' && event.target === 'tissue') this.burst(0, 1.2, -8, 0xf37337, 14, 2.4);
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

  render(sim, dt = 0, active = true, aim = false) {
    this.resize();
    const { player } = sim;
    this.camera.position.set(player.x, player.y, player.z);
    this.camera.rotation.set(player.pitch, player.yaw, 0);
    const targetFov = aim && active ? 48 : 61;
    if (Math.abs(targetFov - this.camera.fov) > .04) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 10));
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.updateAtmosphere(dt);
    this.updateTissue(sim);
    this.updateEnemies(sim.enemies, dt);
    this.processEvents(sim.events || [], dt, active);
    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
