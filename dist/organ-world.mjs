import * as THREE from './vendor/three.module.js';
import { chunkInstances } from './decor-chunks.mjs';
import { GASTRIC_PASSAGE, GASTRIC_VALVES } from './gastric.mjs';

const TAU = 2 * Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

const PROFILES = {
  lungs: {
    surfaces: ['leukocyte', 'mucosa', 'mucosa'],
    seed: 78121, tissue: [213, 167, 165], floor: 0xd9a1a3, wall: 0xf6bdc3, ceiling: 0xfbc9c6,
    background: 0x251f2a, fog: 0x5e4650, density: .027, back: 0xffbfc7, key: 0xadc6ee,
    low: 0x864155, accent: 0xf6b8bf, atmosphere: 0xfad8e3, hazard: 0xbeeafa,
  },
  stomach: {
    surfaces: ['mucosa', 'mucosa', 'mucosa'],
    seed: 12579, tissue: [182, 140, 102], floor: 0xd9a173, wall: 0xe49a71, ceiling: 0xd97760,
    background: 0x282119, fog: 0x584329, density: .029, back: 0xffb36e, key: 0xc4ed91,
    low: 0x6a2728, accent: 0xc1755b, atmosphere: 0xdab77b, hazard: 0xd9e982,
  },
  intestines: {
    surfaces: ['mucosa', 'mucosa', 'mucosa'],
    seed: 15387, tissue: [209, 158, 142], floor: 0xf2cfc4, wall: 0xf6989c, ceiling: 0xe98786,
    background: 0x241119, fog: 0x573136, density: .034, back: 0xff9a8f, key: 0xffc391,
    low: 0x783039, accent: 0xec9e8b, atmosphere: 0xf3ad9b, hazard: 0xffba79,
  },
  colon: {
    surfaces: ['biofilm', 'mucosa', 'mucosa'],
    seed: 33719, tissue: [196, 150, 118], floor: 0xc99472, wall: 0xd99a86, ceiling: 0xc98074,
    background: 0x1f1810, fog: 0x4b3a22, density: .031, back: 0xffc58a, key: 0xb9e08b,
    low: 0x5a3324, accent: 0xd8a06a, atmosphere: 0xd9c78f, hazard: 0xffa45c, hazardStyle: 2,
  },
  lymph: {
    surfaces: ['leukocyte', 'leukocyte', 'neural'],
    seed: 64151, tissue: [214, 196, 200], floor: 0xc7a7b0, wall: 0xd8bcc6, ceiling: 0xc6a8ba,
    background: 0x16192a, fog: 0x3a4058, density: .026, back: 0xd6e4ff, key: 0x9fe4d2,
    low: 0x4a3b5c, accent: 0xf0d6e0, atmosphere: 0xcfe6ff, hazard: 0xbff7e2, hazardStyle: 3,
  },
  ear: {
    surfaces: ['leukocyte', 'leukocyte', 'leukocyte'],
    seed: 57839, tissue: [187, 182, 185], floor: 0x9e8797, wall: 0xb5a7ba, ceiling: 0xc9b2c0,
    background: 0x221e2a, fog: 0x3f4255, density: .026, back: 0xded2ec, key: 0x87c7de,
    low: 0x4e435d, accent: 0xe5c6be, atmosphere: 0xadcce5, hazard: 0x8fe9ea,
  },
  brain: {
    surfaces: ['neural', 'neural', 'neural'],
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

function tissueLobe(width = 18, height = 12) {
  const geometry = new THREE.SphereGeometry(1, width, height);
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
  return (time, active, gastric) => {
    droplets.visible = gastric?.stage !== 'drained';
    droplets.position.y = Math.sin(time * 1.6) * (active ? .25 : .1);
  };
}

function sphincterPoint(radius, angle, depth, flatten) {
  const fold = 1 + .067 * Math.cos(angle * 7 - depth * 1.7) + .031 * Math.sin(angle * 13 + depth * 3);
  return [Math.cos(angle) * radius * fold, Math.sin(angle) * radius * fold * flatten, depth];
}

function buildSphincter(parent, skin, size, length, flatten, shade) {
  const lining = skin(0x9a4a4a, { side: THREE.DoubleSide, roughness: .53, clearcoat: .61 });
  const rimSkin = skin(0xd08b6c, { side: THREE.DoubleSide, roughness: .42, clearcoat: .78 });
  const tissue = skin(0x8a3144, { side: THREE.DoubleSide, roughness: .41, clearcoat: .74 });
  const wall = airwaySurface(20, 48, (t, angle) => sphincterPoint(size * (1 - t * .32), angle, -t * length, flatten));
  place(parent, wall, lining, 0, 0, 0);
  place(parent, airwaySurface(4, 48, (t, angle) =>
    sphincterPoint(size * (.67 * t), angle, -length - .015, flatten)), shade, 0, 0, 0);

  for (let ring = 0; ring < 5; ring++) {
    const depth = -ring * length / 6.7;
    const radius = size * (1 - ring * .045);
    const fold = size * (.15 - .013 * ring);
    const geometry = airwaySurface(10, 48, (ratio, angle) => {
      const step = ratio * TAU;
      return sphincterPoint(radius + fold * Math.cos(step), angle, depth + fold * Math.sin(step), flatten);
    });
    place(parent, geometry, ring % 2 ? lining : rimSkin, 0, 0, .055);
  }

  const segments = 48;
  const rows = 7;
  const membrane = airwaySurface(rows, segments, () => [0, 0, 0]);
  const opening = place(parent, membrane, tissue, 0, 0, 0);
  opening.frustumCulled = false;
  const vertices = membrane.attributes.position;
  let previous = Infinity;
  return (openness, time) => {
    opening.visible = openness < .972;
    if (!opening.visible) return;
    const flex = Math.sin(time * 2.8) * .014 * (1 - openness);
    const shape = openness + flex;
    if (Math.abs(previous - shape) < .003) return;
    for (let index = 0; index < vertices.count; index++) {
      const ratio = Math.floor(index / (segments + 1)) / rows;
      const angle = index % (segments + 1) / segments * TAU;
      const hole = size * Math.max(.005, shape * (.90 + .045 * Math.sin(angle * 7)));
      const ripple = Math.cos(angle * 7 + ratio * 4.5) * .09 + Math.sin(angle * 12) * .025;
      const depth = size * (.12 + (ripple + .14) * (1 - ratio) * (1 - openness));
      vertices.setXYZ(index, ...sphincterPoint(THREE.MathUtils.lerp(hole, size * .96, ratio), angle, depth, flatten));
    }
    vertices.needsUpdate = true;
    membrane.computeVertexNormals();
    previous = shape;
  };
}

function makeGastricValves(root, skin, lobe, glow, floorHeight) {
  const tissue = skin(0xa85b55, { roughness: .46, clearcoat: .83 });
  const membrane = skin(0xb47055, { roughness: .49, clearcoat: .66 });
  const shade = new THREE.MeshBasicMaterial({ color: 0x1e0c14, side: THREE.DoubleSide });
  const valves = GASTRIC_VALVES.map((valve, index) => {
    const base = new THREE.Group();
    base.position.set(valve.x, floorHeight(valve.x, valve.z), valve.z);
    base.rotation.y = index === 0 ? .45 : -.45;
    root.add(base);
    const chamber = new THREE.Group();
    chamber.position.set(0, valve.y, .45);
    base.add(chamber);
    const reshape = buildSphincter(chamber, skin, 1.52, 1.9, .78, shade);
    const body = place(base, lobe, tissue, 0, .31, -1.1);
    body.scale.set(1.83, .49, 1.63);
    tubes(base, [-1, 1].flatMap(side => [
      tube([[side * 1.28, 1.26, .15], [side * 1.76, .62, -.10], [side * 2.45, .25, -1.3], [side * 3.45, .09, -2.52]], .21, 21, 8),
      tube([[side * .98, 1.74, -.27], [side * 1.55, 1.22, -.88], [side * 1.96, .51, -1.84], [side * 1.75, .12, -2.57]], .11, 17, 7),
      tube([[side * 1.45, .72, -.12], [side * 1.98, .2, .51], [side * 2.55, .08, 1.48]], .12, 16, 7),
    ]), membrane);
    const indicator = new THREE.PointLight(index === 0 ? 0xcbd978 : 0xffb16d, 0, 6.2, 2);
    indicator.position.set(0, .25, 1.1);
    chamber.add(indicator);
    return { reshape, indicator, openness: index === 0 ? 1 : 0 };
  });

  const passage = new THREE.Group();
  const { x, y, z } = GASTRIC_PASSAGE;
  passage.position.set(x, y + floorHeight(x, z), z);
  passage.rotation.y = Math.PI;
  root.add(passage);
  const reshapePassage = buildSphincter(passage, skin, 2.85, 5.1, .62, shade);
  const mound = place(passage, lobe, tissue, 0, -1.61, -2.8);
  mound.scale.set(3.45, .47, 4.12);
  tubes(passage, [-1, 1].flatMap(side => [
    tube([[side * 2.3, .04, .29], [side * 2.97, -.22, -1.12], [side * 4.3, -.8, -1.79], [side * 5.28, -1.39, -4.46]], .31, 25, 9),
    tube([[side * 2.65, -.31, -.58], [side * 3.35, -.79, -.15], [side * 4.72, -1.36, .97]], .17, 23, 8),
  ]), tissue);
  const seam = new THREE.PointLight(0xf9af6e, 0, 10.8, 2);
  seam.position.set(0, .40, -.7);
  passage.add(seam);
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xeb7553, opacity: 0, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  mist.position.set(0, -.24, -.2);
  mist.scale.set(5.8, 3, 1);
  passage.add(mist);
  let exposure = 0;
  let previousState;

  return (sim, time, dt, reduced) => {
    const state = sim?.gastric;
    const reset = state !== previousState;
    previousState = state;
    const stage = state?.stage;
    const clock = reduced ? 0 : time;
    const stationValues = [state?.intake, state?.drain];
    for (const [index, valve] of valves.entries()) {
      const station = stationValues[index];
      const repairing = sim?.repairing && sim.repairTarget?.id === station?.id;
      const pulse = repairing ? sim.repairProgress * sim.repairAmount / state.sealPoints : 0;
      const completion = Math.min(1, (station?.progress ?? 0) + pulse);
      const target = index === 0 ? 1 - completion : completion;
      valve.openness = reset || reduced ? target : THREE.MathUtils.damp(valve.openness, target, 10, dt);
      valve.reshape(valve.openness, clock);
      const ready = stage === (index === 0 ? 'intake' : 'drain');
      const finished = station?.progress === 1;
      valve.indicator.intensity = ready ? 15 + 3.4 * Math.sin(clock * 4.4) : finished ? 6.5 : 0;
    }
    const drained = stage === 'drained';
    const clearing = stage === 'draining';
    const target = drained ? 1 : clearing ? Math.max(0, 1 - (state.level ?? 0) / .68) : 0;
    exposure = reset || reduced ? target : THREE.MathUtils.damp(exposure, target, 5.8, dt);
    reshapePassage(exposure, clock);
    seam.intensity = (27 + 4 * Math.sin(clock * 8)) * exposure;
    mist.material.opacity = exposure * (drained ? .17 : .32);
  };
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
  // The villus forest itself lives in level-props.mjs.
  centerGlow(root, glow, 4, 4, -34, 0xffa57f, 204, 28);
  centerGlow(root, glow, -16, 3.3, -9, 0xfac095, 126, 23);
  return () => {};
}

function makeColon(root, skin, lobe, random, glow) {
  const haustra = [];
  const bands = [];
  for (let i = 0; i < 9; i++) {
    const z = -41 + i * 9.6;
    const points = [];
    for (let segment = 0; segment <= 16; segment++) {
      const theta = segment / 16 * Math.PI;
      points.push([Math.cos(theta) * 28, 1.5 + 11.5 * Math.sin(theta) ** .7, z + Math.sin(theta * 3 + i) * 1.4]);
    }
    haustra.push(tube(points, 1.25 + random() * .5, 48, 12));
  }
  for (const angle of [.55, Math.PI / 2, Math.PI - .55]) {
    const points = [];
    for (let step = 0; step <= 12; step++) {
      const z = -46 + step * 7.8;
      points.push([Math.cos(angle) * 27, 1.5 + Math.sin(angle) * 11.5 + Math.sin(step * .9) * .4, z]);
    }
    bands.push(tube(points, .9, 60, 10));
  }
  tubes(root, haustra, skin(0xc98b72, { clearcoat: .74, roughness: .38 }));
  tubes(root, bands, skin(0xa86656, { roughness: .5 }));
  const pouches = instances(root, lobe, skin(0xd49c84, { clearcoat: .7 }), 34, index => {
    const side = index % 2 ? -1 : 1;
    const z = -42 + Math.floor(index / 2) * 5.2;
    const size = 2.6 + random() * 1.8;
    return { position: [side * (27 + random() * 2), 3 + random() * 5, z], scale: [size * .6, size, size * .9],
      angles: [0, side * .3, side * .2], brightness: .7 + random() * .3 };
  });
  pouches.frustumCulled = false;
  const residue = instances(root, lobe, skin(0x6e5330, { roughness: .78, clearcoat: .2 }), 46, () => {
    const angle = random() * TAU;
    const radial = .86 + random() * .1;
    const size = .5 + random() ** 2 * 2.2;
    return { position: [Math.cos(angle) * 30 * radial, size * .3, Math.sin(angle) * 41 * radial],
      scale: [size * 1.3, size * .6, size], angles: [0, random() * TAU, 0], brightness: .55 + random() * .4 };
  });
  residue.frustumCulled = false;
  centerGlow(root, glow, -6, 4.5, -30, 0xffb56a, 220, 34);
  centerGlow(root, glow, 14, 3.5, 6, 0xb6e07a, 150, 30);
  return (time, active) => {
    const squeeze = active ? .07 : .02;
    pouches.scale.set(1 - Math.sin(time * 1.6) * squeeze, 1, 1);
  };
}

function makeLymph(root, skin, lobe, random, glow) {
  const trabeculae = [];
  const reticulum = [];
  for (let i = 0; i < 14; i++) {
    const angle = i / 14 * TAU + random() * .2;
    const x = Math.cos(angle) * 28;
    const z = Math.sin(angle) * 39;
    trabeculae.push(tube([[x, 0, z], [x * .9, 6, z * .9], [x * .62, 11.5, z * .62], [x * .3, 13.5, z * .3],
      [0, 14.2, 0]], .55 + random() * .3, 30, 9));
  }
  for (let i = 0; i < 90; i++) {
    const a = [(random() - .5) * 52, 7 + random() * 7, (random() - .5) * 74];
    const b = [a[0] + (random() - .5) * 12, a[1] + (random() - .5) * 4, a[2] + (random() - .5) * 12];
    const mid = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + .8, (a[2] + b[2]) / 2];
    reticulum.push(tube([a, mid, b], .05 + random() * .06, 10, 5));
  }
  tubes(root, trabeculae, skin(0xc9a6b2, { clearcoat: .7 }));
  tubes(root, reticulum, skin(0xe6d4dc, { roughness: .35, emissive: 0x6a7fa8, emissiveIntensity: .12 }));
  // Follicles: dense spheres of resting lymphocytes packed against the capsule.
  const follicles = [];
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * TAU + .3;
    follicles.push([Math.cos(angle) * 26, 2 + random() * 4, Math.sin(angle) * 36, 3.4 + random() * 1.6]);
  }
  const lymphocytes = chunkInstances(instances(root, lobe.small, skin(0xf4eef4, { roughness: .4, clearcoat: .8, sheen: .8, sheenColor: 0xe0ecff,
    emissive: 0x4a5878, emissiveIntensity: .35 }),
    follicles.length * 70, index => {
      const [x, y, z, radius] = follicles[Math.floor(index / 70)];
      const phi = index * 2.39996;
      const h = (index % 70) / 69 * 2 - 1;
      const r = Math.sqrt(1 - h * h) * radius * (.75 + random() * .3);
      const size = .32 + random() * .16;
      return { position: [x + Math.cos(phi) * r, y + h * radius * .8, z + Math.sin(phi) * r],
        scale: [size, size, size], angles: [random(), random(), random()], brightness: .78 + random() * .22 };
    }), { cell: 20 });
  const germinal = new THREE.MeshPhysicalMaterial({ color: 0x9fd7ff, emissive: 0x5fa8ff, emissiveIntensity: .45,
    roughness: .3, transparent: true, opacity: .4, depthWrite: false });
  for (const [x, y, z, radius] of follicles) {
    const core = place(root, lobe, germinal, x, y, z);
    core.scale.setScalar(radius * .55);
  }
  // Dendritic cells drift overhead with long antigen-presenting processes.
  const dendrites = [];
  const dendriticBodies = [];
  for (let i = 0; i < 7; i++) {
    const center = [(random() - .5) * 40, 8 + random() * 4, (random() - .5) * 60];
    dendriticBodies.push(center);
    for (let arm = 0; arm < 9; arm++) {
      const theta = arm * 2.39996 + random();
      const lift = (random() - .5) * 1.6;
      const reach = 3 + random() * 3.5;
      dendrites.push(tube([center, [center[0] + Math.cos(theta) * reach * .45, center[1] + lift * .5, center[2] + Math.sin(theta) * reach * .45],
        [center[0] + Math.cos(theta + .3) * reach, center[1] + lift, center[2] + Math.sin(theta + .3) * reach]], .09 + random() * .05, 14, 6));
    }
  }
  const dendriticSkin = skin(0xe7cbbf, { clearcoat: .8, emissive: 0x7a4d9c, emissiveIntensity: .12 });
  tubes(root, dendrites, dendriticSkin);
  for (const [x, y, z] of dendriticBodies) place(root, lobe, dendriticSkin, x, y, z).scale.set(.9, .7, .9);
  centerGlow(root, glow, 0, 6, -24, 0xbcd8ff, 210, 36);
  centerGlow(root, glow, -14, 4, 14, 0xa6f0d6, 140, 30);
  centerGlow(root, glow, 16, 4, 14, 0xd6c8ff, 140, 30);
  return (time, active) => {
    lymphocytes.position.y = Math.sin(time * .9) * .05;
    germinal.emissiveIntensity = .4 + Math.sin(time * 2.1) * .12 + (active ? .25 : 0);
  };
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
  const cilia = chunkInstances(instances(root, lobe.small, skin(0xd2b4ae), 420, index => {
    const side = index % 2 ? -1 : 1;
    const lane = Math.floor(index / 56);
    const z = -34 + random() * 51;
    const y = .19 + random() ** 2 * .89;
    const x = side * (18.6 + lane * 1.38 + Math.sin(z * .22) * .76);
    return { position: [x, y * .75, z], scale: [.07 + random() * .13, y, .11 + random() * .10],
      angles: [.35, 0, side * .49], brightness: .67 + random() * .43 };
  }), { cell: 14 });
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
  lungs: makeLungs, stomach: makeStomach, intestines: makeIntestines, colon: makeColon, lymph: makeLymph,
  ear: makeEar, brain: makeBrain,
};
// Anatomy was authored for the original 29 x 41 m arenas; stretch it to the enlarged chambers.
const ANATOMY_SCALE = [1.45, 1.22, 1.45];

function hazardSurface(area, root, profile, floorHeight) {
  const circle = area === 'stomach' || area === 'ear' || area === 'brain' || area === 'lymph';
  const geometry = new THREE.PlaneGeometry(2, 2, 24, 24);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(profile.hazard) }, time: { value: 0 }, intensity: { value: 0 },
      shape: { value: circle ? 1 : 0 },
      style: { value: profile.hazardStyle ?? ['lungs', 'stomach', 'intestines', 'ear', 'brain'].indexOf(area) },
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
  return (state, time, reduced, gastric) => {
    const draining = gastric?.stage === 'draining';
    const visible = !!state && gastric?.stage !== 'drained' && (state.phase !== 'recovery' || draining);
    field.visible = visible;
    if (!visible) return;
    const level = gastric?.level ?? 1;
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
    material.uniforms.intensity.value = draining ? .25 + .69 * level / .68 : state.phase === 'warning' ? .49 : .94;
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
  // Hundreds of fist-sized cells and hair-thin cilia use a coarser copy of the same lump.
  lobe.small = tissueLobe(12, 8);
  const anatomy = new THREE.Group();
  anatomy.scale.set(...ANATOMY_SCALE);
  root.add(anatomy);
  const updateAnatomy = BUILDERS[area](anatomy, skin, lobe, seedRandom(profile.seed), glow);
  const updateHazard = hazardSurface(area, root, profile, floorHeight);
  const updateAirways = area === 'lungs' ? makeBronchialPorts(root, skin, lobe, glow, floorHeight, nodes) : null;
  const updateGastric = area === 'stomach' ? makeGastricValves(root, skin, lobe, glow, floorHeight) : null;
  return {
    root, maps, updateAirways, updateGastric,
    update(state, time, reduced, gastric) {
      updateAnatomy(reduced ? 0 : time, !reduced && state?.phase === 'active', gastric);
      updateHazard(state, time, reduced, gastric);
    },
  };
}

// The Shellback's armoured front: the tell for which side blocks shots. The scanned
// capsid model wears it (world.mjs).
export function createGuardCarapace(membraneMaps) {
  const carapace = new THREE.MeshPhysicalMaterial({
    ...membraneMaps(57183, [218, 182, 161]), color: 0xe1bc98, roughness: .55, clearcoat: .43, sheen: .20,
    sheenColor: 0xecaa7d, side: THREE.DoubleSide,
  });
  const plating = new THREE.Group();
  plating.name = 'guard-carapace';
  const plate = new THREE.SphereGeometry(1.01, 28, 18, 0, Math.PI, .36, 2.49);
  plate.scale(.86, 1.02, .53);
  place(plating, plate, carapace, 0, .14, .48);
  for (let i = -2; i <= 2; i++) {
    const y = i * .265 + .12;
    const width = .84 * Math.sqrt(1 - (y - .12) ** 2);
    const ridge = [[-width, y - .12, .52], [-width * .68, y + .04, .82], [0, y + .11, 1.04],
      [width * .68, y + .04, .82], [width, y - .12, .52]];
    place(plating, tube(ridge, i === 0 ? .105 : .074, 23, 8), carapace, 0, 0, 0);
  }
  return plating;
}
