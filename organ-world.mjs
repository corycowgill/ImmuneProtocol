import * as THREE from './vendor/three.module.js';

const TAU = 2 * Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

const PROFILES = {
  lungs: {
    seed: 78121, tissue: [213, 167, 165], floor: 0xd9a1a3, wall: 0xf6bdc3, ceiling: 0xfbc9c6,
    background: 0x251f2a, fog: 0x5e4650, density: .027, back: 0xffbfc7, key: 0xadc6ee,
    low: 0x864155, accent: 0xf6b8bf, atmosphere: 0xfad8e3, hazard: 0xbeeafa,
  },
  stomach: {
    seed: 12579, tissue: [182, 140, 102], floor: 0xd9a173, wall: 0xe49a71, ceiling: 0xd97760,
    background: 0x282119, fog: 0x584329, density: .029, back: 0xffb36e, key: 0xc4ed91,
    low: 0x6a2728, accent: 0xc1755b, atmosphere: 0xdab77b, hazard: 0xd9e982,
  },
  intestines: {
    seed: 15387, tissue: [209, 158, 142], floor: 0xe4a58c, wall: 0xf6989c, ceiling: 0xe98786,
    background: 0x241119, fog: 0x573136, density: .034, back: 0xff9a8f, key: 0xffc391,
    low: 0x783039, accent: 0xec9e8b, atmosphere: 0xf3ad9b, hazard: 0xffba79,
  },
  ear: {
    seed: 57839, tissue: [187, 182, 185], floor: 0x9e8797, wall: 0xb5a7ba, ceiling: 0xc9b2c0,
    background: 0x221e2a, fog: 0x3f4255, density: .026, back: 0xded2ec, key: 0x87c7de,
    low: 0x4e435d, accent: 0xe5c6be, atmosphere: 0xadcce5, hazard: 0x8fe9ea,
  },
  brain: {
    seed: 90119, tissue: [180, 155, 178], floor: 0xb99bab, wall: 0xbaa2bd, ceiling: 0xa287b8,
    background: 0x1e142c, fog: 0x47354d, density: .025, back: 0xc7a5fa, key: 0x8ac5ef,
    low: 0x5d3c73, accent: 0xd3b2d1, atmosphere: 0xb69fef, hazard: 0xdcadff,
  },
};

export function organProfile(area) {
  return PROFILES[area];
}

function seedRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function place(group, geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  group.add(object);
  return object;
}

function centerGlow(group, map, x, y, z, color, strength, radius) {
  const light = new THREE.PointLight(color, strength, radius, 2);
  light.position.set(x, y, z);
  group.add(light);
  const scatter = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, transparent: true, opacity: .11, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scatter.scale.set(radius * .40, radius * .32, 1);
  scatter.position.copy(light.position);
  group.add(scatter);
  return light;
}

function shapeCurve(coords) {
  return new THREE.CatmullRomCurve3(coords.map(point => new THREE.Vector3(...point)));
}

function tube(shape, radius, segments, radial = 9) {
  return new THREE.TubeGeometry(Array.isArray(shape) ? shapeCurve(shape) : shape, segments, radius, radial, false);
}

function tubes(group, parts, material) {
  const merged = new THREE.BufferGeometry();
  const arrays = parts.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
  for (const name of ['position', 'normal', 'uv']) {
    const size = arrays[0].attributes[name].itemSize;
    const length = arrays.reduce((sum, geometry) => sum + geometry.attributes[name].array.length, 0);
    const attribute = new Float32Array(length);
    let offset = 0;
    for (const geometry of arrays) {
      const input = geometry.attributes[name].array;
      attribute.set(input, offset);
      offset += input.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(attribute, size));
  }
  for (const geometry of [...new Set([...parts, ...arrays])]) geometry.dispose();
  return place(group, merged, material, 0, 0, 0);
}

function tissueLobe() {
  const geometry = new THREE.SphereGeometry(1, 18, 12);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const factor = 1 + .065 * Math.sin(10 * x + 4 * y) * Math.cos(8 * z - 5 * y)
      + .028 * Math.cos(13 * y + 5 * z);
    p.setXYZ(i, x * factor, y * factor, z * factor);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function instances(group, geometry, material, count, layout) {
  const batch = new THREE.InstancedMesh(geometry, material, count);
  const frame = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const { position, scale, angles, brightness } = layout(i);
    frame.position.set(...position);
    frame.scale.set(...scale);
    frame.rotation.set(...angles);
    frame.updateMatrix();
    batch.setMatrixAt(i, frame.matrix);
    batch.setColorAt(i, tint.setRGB(brightness, brightness * .94, brightness * .96));
  }
  group.add(batch);
  return batch;
}

function makeLungs(root, skin, lobe, random, glow) {
  const branches = [];
  const capillaries = [];
  const lungs = [];
  for (const side of [-1, 1]) {
    const airway = new THREE.Group();
    airway.position.set(side * 15, 1.1, -29);
    root.add(airway);
    const ringSkin = skin(0xd6a0a2, { side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const ring = place(airway, new THREE.TorusGeometry(4.6 - i * .24, .31, 9, 45), ringSkin, 0, .8 + i * .10, -i * 1.15);
      ring.scale.set(1 + i * .045, .68 + i * .025, 1);
    }
    const throat = place(airway, new THREE.CylinderGeometry(3.6, 4.65, 11, 40, 4, true), skin(0x71545a, { side: THREE.DoubleSide, roughness: .58 }), 0, .95, -5.6);
    throat.rotation.x = -Math.PI / 2;
    throat.scale.z = .70;
    centerGlow(root, glow, side * 15, 3.8, -23, side < 0 ? 0xffc6cd : 0xb5d5fa, 190, 28);
    for (let cluster = 0; cluster < 5; cluster++) {
      const x = side * (22 + Math.cos(cluster * 1.4) * 3);
      const z = -31 + cluster * 12;
      const y = 1.3 + random() * 4.7;
      const bunch = new THREE.Group();
      bunch.position.set(x, y, z);
      root.add(bunch);
      instances(bunch, lobe, skin(cluster % 2 === 0 ? 0xf6a7ac : 0xf0b7b9), 18, index => {
        const phi = index * 2.39996;
        const height = (index / 17 - .5) * 2;
        const radius = Math.sqrt(1 - height ** 2);
        const cell = .69 + random() * .88;
        return { position: [Math.cos(phi) * radius * 2.5, height * 2.5, Math.sin(phi) * radius * 3.2],
          scale: [cell, cell * .85, cell * 1.04], angles: [phi * .1, phi, height * .36], brightness: .65 + random() * .36 };
      });
      lungs.push({ bunch, phase: cluster * .53 + side * .6 });
      branches.push(tube([[x, y, z], [x + side * 1.7, y + 2, z - 1], [side * 20, 10 + cluster * .33, z - 4],
        [side * 15, 13, z - 7], [side * 8, 14, z - 10]], .29 + cluster * .039, 18));
      for (let limb = 0; limb < 4; limb++) {
        capillaries.push(tube([[x, y + 1, z], [x + (limb - 1.5) * 1.25, y + 2, z + 1.8],
          [x + (limb - 1.5) * 1.7, y + .24, z + (limb % 2 ? 3 : -1.2)]], .055 + random() * .044, 10, 6));
      }
    }
    branches.push(tube([[side * 16, 9, -32], [side * 11, 11.5, -25], [side * 5, 10.5, -12], [0, 10.9, 1],
      [side * 3, 12.4, 13]], 1.05, 38, 14));
  }
  tubes(root, branches, skin(0xbf8490));
  tubes(root, capillaries, skin(0xa15e72));
  return (time, active) => {
    for (const { bunch, phase } of lungs) {
      const pulse = Math.sin(time * (active ? 1.8 : .83) + phase);
      bunch.scale.set(1 + pulse * .065, 1 + pulse * .088, 1 + pulse * .06);
    }
  };
}

function airwaySurface(rows, columns, sample) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      positions.push(...sample(row / rows, column / columns * TAU));
      uvs.push(column / columns, row / rows);
      if (!row || !column) continue;
      const corner = row * (columns + 1) + column;
      const before = corner - columns - 1;
      indices.push(before - 1, before, corner - 1, before, corner, corner - 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function portPoint(radius, angle, z) {
  const ripple = 1 + .051 * Math.cos(angle * 5 + z * 2) + .029 * Math.sin(angle * 9 - z * 3);
  return [radius * ripple * Math.cos(angle), radius * ripple * Math.sin(angle) * .85, z];
}

function makeBronchialPorts(root, skin, lobe, glow, floorHeight, nodes) {
  const vents = new THREE.Group();
  root.add(vents);
  vents.visible = false;
  const cartilage = skin(0xcd8f8b, { roughness: .48 });
  const lining = skin(0x643642, { side: THREE.DoubleSide, roughness: .49 });
  const clots = skin(0x602335, { side: THREE.DoubleSide, roughness: .55, emissive: 0x8b1c27, emissiveIntensity: .18 });
  const mucosa = skin(0xa45555, { roughness: .44, clearcoat: .77 });
  const shade = new THREE.MeshBasicMaterial({ color: 0x150e1a, side: THREE.DoubleSide });

  const ports = nodes.map((node, index) => {
    const valve = new THREE.Group();
    valve.position.set(node.x, floorHeight(node.x, node.z), node.z);
    valve.rotation.y = index === 0 ? .19 : -.19;
    vents.add(valve);
    const mouth = new THREE.Group();
    mouth.position.set(0, 1.38, .80);
    valve.add(mouth);
    const chamber = airwaySurface(15, 48, (t, angle) => portPoint(1.18 - t * .53, angle, -t * 2.05));
    place(mouth, chamber, lining, 0, 0, 0);
    place(mouth, new THREE.CircleGeometry(.69, 42), shade, 0, 0, -2.07).scale.y = .85;
    for (let ring = 0; ring < 4; ring++) {
      const z = .045 - ring * .48;
      const radius = 1.23 - ring * .126;
      const rim = airwaySurface(10, 48, (t, angle) => {
        const round = t * TAU;
        return portPoint(radius + .105 * Math.cos(round), angle, z + .14 * Math.sin(round));
      });
      place(mouth, rim, cartilage, 0, 0, 0);
    }
    const base = place(valve, lobe, mucosa, 0, .24, -.86);
    base.scale.set(1.52, .43, 1.8);
    for (const side of [-1, 1]) {
      const roots = [
        tube([[side * .89, 1.63, .23], [side * 1.33, 1.0, -.57], [side * 1.76, .38, -1.62], [side * 2.68, .13, -2.63]], .15, 16),
        tube([[side * 1.1, 1.18, -.20], [side * 1.49, .49, .56], [side * 1.81, .28, 1.10], [side * 2.65, .11, 1.64]], .075, 12),
      ];
      tubes(valve, roots, mucosa);
    }

    const membrane = airwaySurface(8, 48, (t, angle) => portPoint(.035 + t * 1.125, angle, .08));
    const membraneMesh = place(mouth, membrane, clots, 0, 0, .09);
    membraneMesh.frustumCulled = false;
    const folds = membrane.attributes.position;
    const air = new THREE.BufferGeometry();
    const airMotes = new THREE.BufferAttribute(new Float32Array(48), 3);
    air.setAttribute('position', airMotes);
    const airflow = new THREE.Points(air, new THREE.PointsMaterial({
      color: 0xa9edee, map: glow, transparent: true, opacity: .52, alphaTest: .03, depthWrite: false,
      blending: THREE.AdditiveBlending, size: .24,
    }));
    airflow.frustumCulled = false;
    mouth.add(airflow);
    const light = new THREE.PointLight(0x94e0e9, 0, 5, 2);
    light.position.set(0, 0, .34);
    mouth.add(light);
    return { node, folds, membrane, airflow, airMotes, light, openness: 0, lastOpening: -1 };
  });

  return (sim, clock, dt, reduced) => {
    vents.visible = !!sim?.airway;
    if (!vents.visible) {
      for (const port of ports) port.openness = 0;
      return;
    }
    for (const [index, port] of ports.entries()) {
      const { node, folds, membrane, airflow, airMotes, light } = port;
      const state = sim.airway.ports[index];
      const patching = !state.open && sim.repairing && sim.repairTarget?.id === node.id;
      const pulse = patching ? sim.repairProgress * sim.repairAmount / sim.airway.sealPoints : 0;
      const target = state.open ? 1 : Math.min(.98, state.progress + pulse);
      port.openness = reduced ? target : THREE.MathUtils.damp(port.openness, target, 10, dt);
      const open = port.openness;
      if (Math.abs(open - port.lastOpening) > .002) {
        for (let vertex = 0; vertex < folds.count; vertex++) {
          const row = Math.floor(vertex / 49) / 8;
          const angle = vertex % 49 / 48 * TAU;
          const lip = .025 + open * (.94 + .075 * Math.cos(angle * 5));
          const radius = THREE.MathUtils.lerp(lip, 1.16, row);
          const billow = (1 - row) * (.23 * (1 - open) + .09 * Math.sin(angle * 5 + row * 7) + .036 * Math.cos(angle * 12));
          folds.setXYZ(vertex, ...portPoint(radius, angle, billow));
        }
        folds.needsUpdate = true;
        membrane.computeVertexNormals();
        port.lastOpening = open;
      }
      airflow.visible = state.open && open > .78;
      light.intensity = state.open ? 10 * open : 1.8 * open;
      if (!airflow.visible) continue;
      for (let mote = 0; mote < airMotes.count; mote++) {
        const age = ((reduced ? .3 : clock * (sim.organ?.phase === 'active' ? .85 : .48)) + mote * .618) % 1;
        const angle = mote * 2.39996;
        const radius = .35 + .065 * mote;
        airMotes.setXYZ(mote, Math.cos(angle) * radius * age, Math.sin(angle) * radius * age + age * .40, -.8 + age * 3.35);
      }
      airMotes.needsUpdate = true;
    }
  };
}

function makeStomach(root, skin, lobe, random, glow) {
  const rugae = [];
  const creases = [];
  for (let i = 0; i < 13; i++) {
    const y = .5 + i * 1.07;
    const points = [];
    for (let sample = 0; sample <= 29; sample++) {
      const angle = Math.PI * (1.01 + .98 * sample / 29);
      const falloff = 1 - y * .012;
      const ripple = 1 + Math.sin(sample * .44 + i * .52) * .07;
      points.push([Math.cos(angle) * 33 * ripple * falloff, y + Math.cos(sample * .53 + i * .64) * .56,
        Math.sin(angle) * 41 * ripple * falloff]);
    }
    rugae.push(tube(points, .51 + random() * .55, 62, 11));
    creases.push(tube(points.map(([x, h, z]) => [x * .988, h - .5, z * .988]), .10 + random() * .07, 51, 6));
  }
  tubes(root, rugae, skin(0xc17b62));
  tubes(root, creases, skin(0x682930, { roughness: .64 }));
  const throat = new THREE.Group();
  throat.position.set(0, 2.8, -35);
  root.add(throat);
  for (let i = 0; i < 6; i++) {
    const ring = place(throat, new THREE.TorusGeometry(5.3 - i * .51, .87 - i * .09, 11, 45), skin(i % 2 ? 0xa15341 : 0xcb7f5e),
      0, i * .11, -i * .72);
    ring.scale.y = .68;
  }
  centerGlow(root, glow, -9, 3.5, -25, 0xfbb467, 190, 37);
  centerGlow(root, glow, 9, 2.9, -25, 0xc0d681, 158, 31);
  const droplets = instances(root, lobe, new THREE.MeshPhysicalMaterial({
    color: 0x89834d, roughness: .21, clearcoat: .95, transparent: true, opacity: .63,
  }), 87, index => {
    const angle = index * 2.39996;
    const radial = .4 + random() * .59;
    const size = .07 + random() ** 2 * .24;
    return { position: [Math.cos(angle) * 31 * radial, .13 + random() ** 2 * 1.8, Math.sin(angle) * 34 * radial],
      scale: [size, size * 1.3, size], angles: [0, angle, .1], brightness: .6 + random() * .4 };
  });
  return (time, active) => { droplets.position.y = Math.sin(time * 1.6) * (active ? .25 : .1); };
}

function makeIntestines(root, skin, lobe, random, glow) {
  const folds = [];
  const pillars = [];
  for (let i = 0; i < 7; i++) {
    const z = -39 + i * 11;
    const points = [];
    for (let segment = 0; segment <= 14; segment++) {
      const theta = segment / 14 * Math.PI;
      const bend = Math.sin(i * .95) * 3.3;
      points.push([Math.cos(theta) * 25 + bend, 2.8 + 9.7 * Math.sin(theta) ** .66,
        z + Math.cos(theta * 2 + i * .45) * 3.4]);
    }
    folds.push(tube(points, .81 + random() * .61, 43, 11));
    for (const side of [-1, 1]) {
      pillars.push(tube([[side * 30, -.4, z + 6], [side * 24, 2.1, z + 4], [side * 23.8, 4.6, z - 2],
        [side * 27, 7.7, z - 6]], .68, 21));
    }
  }
  tubes(root, folds, skin(0xde887d));
  tubes(root, pillars, skin(0xae5359));
  const villi = instances(root, lobe, skin(0xd29584, { clearcoat: .68 }), 440, index => {
    const x = (index % 2 ? -1 : 1) * (12.5 + random() ** .85 * 15);
    const z = -35 + random() * 62;
    const height = .21 + random() ** 2 * 1.28;
    return { position: [x, height * .47, z], scale: [.085 + random() * .23, height, .10 + random() * .19],
      angles: [(random() - .5) * .65, 0, Math.sign(x) * (.22 + random() * .29)], brightness: .64 + random() * .43 };
  });
  centerGlow(root, glow, 4, 4, -34, 0xffa57f, 204, 28);
  centerGlow(root, glow, -16, 3.3, -9, 0xfac095, 126, 23);
  return (time, active) => { villi.scale.y = 1 + Math.sin(time * 1.3) * (active ? .065 : .018); };
}

function makeEar(root, skin, lobe, random, glow) {
  const cochlea = new THREE.Group();
  cochlea.position.set(0, 5.5, -26);
  cochlea.rotation.set(-.09, .08, -.15);
  root.add(cochlea);
  const coil = [];
  const cartilage = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const angle = t * TAU * 2.46 - Math.PI * .81;
    const width = 10 * (1 - t) ** 1.15 + .8;
    const point = [Math.cos(angle) * width, Math.sin(angle) * width * .61, -t * 2.5 + .32 * Math.sin(angle)];
    coil.push(point);
    cartilage.push([point[0] * .98, point[1] * .98, point[2] + .62]);
  }
  place(cochlea, tube(coil, 1.15, 115, 13), skin(0xd4b8b8, { clearcoat: .88, roughness: .30 }), 0, 0, 0);
  place(cochlea, tube(cartilage, .25, 110, 8), skin(0xb97577), 0, 0, 0);
  const canalArches = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -15 - i * 6;
      canalArches.push(tube([[side * 26, -.5, z + 9], [side * 28, 4, z + 5],
        [side * 24, 8, z - 3], [side * 18, 10.8, z - 7], [side * 10, 11.8, z - 7.8],
        [side * 7, 7.5, z - 9]], .68 + i * .11, 36, 11));
    }
  }
  tubes(root, canalArches, skin(0xae93ad));
  const cilia = instances(root, lobe, skin(0xd2b4ae), 420, index => {
    const side = index % 2 ? -1 : 1;
    const lane = Math.floor(index / 56);
    const z = -34 + random() * 51;
    const y = .19 + random() ** 2 * .89;
    const x = side * (18.6 + lane * 1.38 + Math.sin(z * .22) * .76);
    return { position: [x, y * .75, z], scale: [.07 + random() * .13, y, .11 + random() * .10],
      angles: [.35, 0, side * .49], brightness: .67 + random() * .43 };
  });
  centerGlow(root, glow, .2, 5.8, -21, 0xd0c3e4, 169, 34);
  centerGlow(root, glow, -16, 3.8, -12, 0x98d1ee, 126, 32);
  return (time, active) => { cilia.scale.y = 1 + Math.sin(time * 10) * (active ? .06 : .005); };
}

function makeBrain(root, skin, lobe, random, glow) {
  const axons = [];
  const dendrites = [];
  const gyri = [];
  const pathways = [];
  const terminals = [];
  const axonMaterial = skin(0x9974a8, { emissive: 0x604382, emissiveIntensity: .22 });
  for (let i = 0; i < 11; i++) {
    const side = i % 2 ? -1 : 1;
    const z = -37 + i * 5.4;
    const y = 5.9 + random() * 4;
    const x = side * (19 + random() * 7);
    const soma = place(root, lobe, skin(0xd3a9c9, { sheen: .34, sheenColor: 0xe4c2e8 }), x, y, z);
    soma.scale.set(1.52 + random() * 1.7, 1.14 + random() * 1.1, 1.6 + random());
    const path = shapeCurve([[x, y, z], [x * .88, y + 2.1, z + 2.5], [x * .66, y + 2.8, z + 4.3],
      [x * .35, y + 4.2, z + 5.6], [x * -.11, 12.8, z + 2], [x * -.74, 11.2, z + 7]]);
    pathways.push(path);
    axons.push(tube(path, .155 + random() * .10, 37, 8));
    for (let j = 0; j < 5; j++) {
      const span = j - 2;
      const limbX = x + span * 1.7;
      const limbZ = z + Math.sin(j * 2.35) * 5;
      dendrites.push(tube([[x, y, z], [limbX, y - 2.8 + Math.abs(span), limbZ * .92 + z * .08],
        [limbX + span * 1.3, .7 + random() * 3, limbZ + Math.sin(j * 2.35) * 3]], .07 + random() * .10, 18, 7));
    }
    const point = path.getPointAt(.92);
    const signal = place(root, lobe, new THREE.MeshBasicMaterial({
      color: i % 2 ? 0xecc1fa : 0x9ad7fb, transparent: true, opacity: .67,
    }), point.x, point.y, point.z);
    signal.scale.setScalar(.12);
    terminals.push({ signal, path, offset: random() });
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = side * (6.6 + i * 4.0);
      gyri.push(tube([[x * .8, 3.6, -37], [x, 7, -35], [x + side * 1.3, 10.5, -29], [x * .95, 12.2, -24],
        [x - side * 1.9, 12.8, -19], [x + side * 1.4, 13.6, -14], [x * 1.05, 15.1, -8]], .76, 30, 12));
    }
  }
  tubes(root, gyri, skin(0x977a97, { clearcoat: .57 }));
  tubes(root, axons, axonMaterial);
  tubes(root, dendrites, skin(0x9a648a));
  const sheaths = instances(root, lobe, skin(0xd3b6bf, { roughness: .29, clearcoat: .89 }), pathways.length * 10, index => {
    const path = pathways[Math.floor(index / 10)];
    const at = .14 + index % 10 * .075;
    const position = path.getPointAt(at), tangent = path.getTangentAt(at).normalize();
    const angle = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, tangent));
    return { position: position.toArray(), scale: [.31, .65 + random() * .19, .32],
      angles: [angle.x, angle.y, angle.z], brightness: .7 + random() * .33 };
  });
  sheaths.frustumCulled = false;
  centerGlow(root, glow, 5, 5, -27, 0xb28cfa, 188, 36);
  centerGlow(root, glow, -12, 4, -15, 0x92bde9, 108, 30);
  return (time, active) => {
    for (const { signal, path, offset } of terminals) {
      signal.position.copy(path.getPointAt((offset + time * (active ? .38 : .19)) % 1));
    }
    axonMaterial.emissiveIntensity = active ? .62 : .24;
  };
}

const BUILDERS = {
  lungs: makeLungs, stomach: makeStomach, intestines: makeIntestines, ear: makeEar, brain: makeBrain,
};

function hazardSurface(area, root, profile, floorHeight) {
  const circle = area === 'stomach' || area === 'ear' || area === 'brain';
  const geometry = new THREE.PlaneGeometry(2, 2, 24, 24);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(profile.hazard) }, time: { value: 0 }, intensity: { value: 0 },
      shape: { value: circle ? 1 : 0 }, style: { value: ['lungs', 'stomach', 'intestines', 'ear', 'brain'].indexOf(area) },
    },
    vertexShader: `
      varying vec2 uvLocal;
      void main() {
        uvLocal = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform float time, intensity;
      uniform int shape, style;
      varying vec2 uvLocal;
      void main() {
        float radial = length(uvLocal);
        float boundary = shape == 1 ? radial : max(abs(uvLocal.x), abs(uvLocal.y));
        float coverage = 1.0 - smoothstep(0.96, 1.00, boundary);
        float rim = smoothstep(0.91, 0.95, boundary);
        float layer;
        if (style == 0) {
          layer = pow(0.5 + 0.5 * sin(49.0 * uvLocal.x + sin(24.0 * uvLocal.y + time) * 1.5), 9.0);
          layer *= 0.38 + 0.62 * sin(20.0 * uvLocal.y + time * 9.0) * sin(20.0 * uvLocal.y + time * 9.0);
        } else if (style == 1) {
          float curl = sin(uvLocal.x * 19.0 + sin(uvLocal.y * 11.0 + time) * 2.0);
          layer = 0.46 + 0.48 * pow(0.5 + 0.5 * sin(uvLocal.y * 15.0 + curl * 2.2 - time * 1.3), 4.0);
        } else if (style == 2) {
          layer = pow(0.5 + 0.5 * sin(11.0 * uvLocal.y + sin(uvLocal.x * 12.0) * 0.34 + time * 5.0), 4.0);
        } else {
          layer = pow(0.5 + 0.5 * cos(radial * 28.0 - time * 9.0 + (style == 4 ? sin(uvLocal.x * 24.0) : 0.0)), 9.0);
        }
        float strength = (rim * 0.65 + layer * (style == 1 ? 0.78 : 0.39)) * coverage * intensity;
        gl_FragColor = vec4(tint * (0.64 + layer * 0.75), strength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
  });
  const field = place(root, geometry, material, 0, 0, 0);
  field.frustumCulled = false;
  const positions = geometry.attributes.position;
  const coords = Float32Array.from(positions.array);
  let previous = [Infinity, Infinity, Infinity, Infinity];
  return (state, time, reduced) => {
    const visible = !!state && state.phase !== 'recovery';
    field.visible = visible;
    if (!visible) return;
    const width = circle ? state.radius : state.width / 2;
    const depth = circle ? state.radius : state.depth / 2;
    if (![state.x, state.z, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) {
      field.visible = false;
      return;
    }
    if (state.x !== previous[0] || state.z !== previous[1] || width !== previous[2] || depth !== previous[3]) {
      for (let i = 0; i < positions.count; i++) {
        const x = state.x + coords[i * 3] * width;
        const z = state.z + coords[i * 3 + 2] * depth;
        positions.setXYZ(i, x, floorHeight(x, z) + .059, z);
      }
      positions.needsUpdate = true;
      previous = [state.x, state.z, width, depth];
    }
    material.uniforms.time.value = reduced ? 0 : time;
    material.uniforms.intensity.value = state.phase === 'warning' ? .49 : .94;
  };
}

export function createOrganEnvironment(area, { membraneMaps, floorHeight, glow, nodes }) {
  const profile = PROFILES[area];
  const root = new THREE.Group();
  const maps = membraneMaps(profile.seed, profile.tissue);
  const skin = (color, overrides = {}) => new THREE.MeshPhysicalMaterial({
    ...maps, color, roughness: .44, clearcoat: .62, clearcoatRoughness: .25,
    normalScale: new THREE.Vector2(.9, .9), ...overrides,
  });
  const lobe = tissueLobe();
  const updateAnatomy = BUILDERS[area](root, skin, lobe, seedRandom(profile.seed), glow);
  const updateHazard = hazardSurface(area, root, profile, floorHeight);
  const updateAirways = area === 'lungs' ? makeBronchialPorts(root, skin, lobe, glow, floorHeight, nodes) : null;
  return {
    root, maps, updateAirways,
    update(state, time, reduced) {
      updateAnatomy(reduced ? 0 : time, !reduced && state?.phase === 'active');
      updateHazard(state, time, reduced);
    },
  };
}

export function createOrganEnemies(membraneMaps, lobe) {
  const guard = new THREE.Group();
  const guardMaps = membraneMaps(57183, [218, 182, 161]);
  const muscle = new THREE.MeshPhysicalMaterial({
    ...guardMaps, color: 0xa44750, roughness: .47, clearcoat: .54,
    emissive: 0xb32f32, emissiveIntensity: .25,
  });
  const carapace = new THREE.MeshPhysicalMaterial({
    ...guardMaps, color: 0xe1bc98, roughness: .55, clearcoat: .43, sheen: .20, sheenColor: 0xecaa7d,
  });
  const scar = new THREE.MeshPhysicalMaterial({
    ...guardMaps, color: 0xe06657, roughness: .29, clearcoat: .94,
    emissive: 0xb93325, emissiveIntensity: .49,
  });
  const body = place(guard, lobe, muscle, 0, -.06, -.13);
  body.name = 'attack-membrane';
  body.scale.set(.8, .73, .82);
  const plating = new THREE.Group();
  plating.name = 'guard-carapace';
  guard.add(plating);
  const plate = new THREE.SphereGeometry(1.01, 28, 18, 0, Math.PI, .36, 2.49);
  plate.scale(.86, 1.02, .53);
  place(plating, plate, carapace, 0, .14, .48);
  carapace.side = THREE.DoubleSide;
  for (let i = -2; i <= 2; i++) {
    const y = i * .265 + .12;
    const width = .84 * Math.sqrt(1 - (y - .12) ** 2);
    const ridge = [[-width, y - .12, .52], [-width * .68, y + .04, .82], [0, y + .11, 1.04],
      [width * .68, y + .04, .82], [width, y - .12, .52]];
    place(plating, tube(ridge, i === 0 ? .105 : .074, 23, 8), carapace, 0, 0, 0);
  }
  const core = place(guard, lobe, scar, 0, .08, -.78);
  core.scale.set(.48, .49, .35);
  for (let i = 0; i < 7; i++) {
    const t = (i - 3) / 3;
    place(guard, tube([[t * .51, -.36, -.38], [t * .87, -.58, -.22 - Math.abs(t) * .25],
      [t * .98, -.77, .45 - Math.abs(t) * .74]], .059 + (1 - Math.abs(t)) * .023, 13, 7), muscle, 0, 0, 0);
  }

  const splitter = new THREE.Group();
  const splitterMaps = membraneMaps(43121, [208, 192, 226]);
  const splitSkin = new THREE.MeshPhysicalMaterial({
    ...splitterMaps, color: 0xb887b2, roughness: .32, clearcoat: .80,
    emissive: 0x73298d, emissiveIntensity: .24,
  });
  const ringSkin = new THREE.MeshPhysicalMaterial({
    ...splitterMaps, color: 0x936cac, roughness: .45, clearcoat: .61, metalness: .05,
    emissive: 0x4d3070, emissiveIntensity: .20,
  });
  const seamSkin = new THREE.MeshPhysicalMaterial({
    ...splitterMaps, color: 0xcb9cc3, emissive: 0x923d77, emissiveIntensity: .41, roughness: .37, clearcoat: .81,
  });
  const bridge = place(splitter, lobe, seamSkin, 0, -.03, .1);
  bridge.name = 'attack-membrane';
  bridge.scale.set(.48, .61, .63);
  for (const side of [-1, 1]) {
    const sac = place(splitter, lobe, splitSkin, .43 * side, .065, 0);
    sac.name = 'splitter-sac';
    sac.scale.set(.54, .66, .78);
    sac.rotation.z = -.21 * side;
    const fringe = new THREE.Group();
    fringe.position.x = side * .38;
    splitter.add(fringe);
    for (let i = 0; i < 9; i++) {
      const angle = i * TAU / 9;
      const x = Math.cos(angle), y = Math.sin(angle);
      place(fringe, tube([[x * .36, y * .41, .17], [x * .58, y * .54, -.14],
        [x * .65 + side * .03, y * .60, -.65 - (i % 3) * .12]], .039, 12, 6), ringSkin, 0, 0, 0);
    }
  }
  return { guard, splitter };
}
