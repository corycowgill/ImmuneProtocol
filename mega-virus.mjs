import * as THREE from './vendor/three.module.js';
import { BRAIN_BOSS_LOBES } from './brain-boss.mjs';

const TAU = Math.PI * 2;
const vector = (x, y, z) => new THREE.Vector3(x, y, z);

function surface(parent, geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.copy(position);
  parent.add(mesh);
  return mesh;
}

function cord(parent, points, radius, material) {
  const path = new THREE.CatmullRomCurve3(points);
  surface(parent, new THREE.TubeGeometry(path, 36, radius, 10, false), material);
  return path;
}

function capsule(radius, cut) {
  const geometry = new THREE.SphereGeometry(radius, 64, 42, 0, TAU, cut, Math.PI - cut);
  geometry.rotateX(Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index++) {
    const { x, y, z } = vector().fromBufferAttribute(position, index).multiplyScalar(1 / radius);
    const wrinkle = 1 + .045 * Math.sin(13 * x + 7 * z) * Math.sin(14 * y - 4 * z) +
      .019 * Math.sin(32 * x - 17 * y + 10 * z);
    position.setXYZ(index, x * radius * wrinkle, y * radius * wrinkle, z * radius * wrinkle);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function petalGeometry(radius) {
  const points = [];
  const indices = [];
  const uv = [];
  for (let row = 0; row <= 12; row++) {
    const t = row / 12;
    for (let col = 0; col <= 6; col++) {
      const side = col / 3 - 1;
      points.push(-radius * t, side * radius * (.38 * (1 - t) + .045), radius * (.18 * Math.sin(t * Math.PI) + .025 * side ** 2));
      uv.push(t, col / 6);
      if (row < 12 && col < 6) {
        const base = row * 7 + col;
        indices.push(base, base + 7, base + 1, base + 1, base + 7, base + 8);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createMegaVirus(membraneMaps, glow) {
  const root = new THREE.Group();
  root.visible = false;
  const maps = membraneMaps(87191, [150, 89, 107]);
  const membrane = new THREE.MeshPhysicalMaterial({
    ...maps, color: 0xb57792, roughness: .38, clearcoat: .72, clearcoatRoughness: .27,
    normalScale: new THREE.Vector2(.84, .84), side: THREE.DoubleSide,
  });
  const fibers = membrane.clone();
  fibers.color.setHex(0x9b5266);
  const plates = membrane.clone();
  plates.color.setHex(0xdb9b87);
  plates.roughness = .43;
  const throat = new THREE.MeshStandardMaterial({ color: 0x260a21, roughness: .62 });
  const cap = new THREE.SphereGeometry(1, 14, 9);
  const stem = new THREE.CylinderGeometry(.7, 1, 1, 9);
  const ports = [];

  for (const [index, lobe] of BRAIN_BOSS_LOBES.entries()) {
    const { radius, weakPoint } = lobe;
    const body = new THREE.Group();
    body.position.set(lobe.x, lobe.y, lobe.z);
    root.add(body);
    const cut = Math.asin(weakPoint.radius * 1.03 / radius);
    const hull = surface(body, capsule(radius, cut), membrane);
    const mouthZ = radius * Math.cos(cut) + .035;
    surface(body, new THREE.TorusGeometry(weakPoint.radius * 1.06, radius * .082, 13, 64), fibers, vector(0, 0, mouthZ));
    surface(body, new THREE.CircleGeometry(weakPoint.radius * 1.07, 42), throat, vector(0, 0, mouthZ - .24));

    const nucleus = new THREE.MeshPhysicalMaterial({
      ...maps, color: 0xeac254, emissive: 0xffb23d, emissiveIntensity: .85, roughness: .25,
      clearcoat: .9, clearcoatRoughness: .17,
    });
    const core = surface(body, capsule(weakPoint.radius * .76, 0), nucleus, vector(0, 0, mouthZ - .06));
    core.scale.z = .51;
    const sheen = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffad52, transparent: true, opacity: .22, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sheen.position.set(0, 0, mouthZ + .54);
    sheen.scale.setScalar(weakPoint.radius * 3.6);
    body.add(sheen);
    const lamp = new THREE.PointLight(0xffa232, 0, 11, 2);
    lamp.position.copy(sheen.position);
    body.add(lamp);

    const leaves = [];
    const petal = petalGeometry(weakPoint.radius * 1.09);
    for (let segment = 0; segment < 9; segment++) {
      const angle = segment * TAU / 9;
      const hinge = new THREE.Group();
      hinge.position.set(Math.cos(angle) * weakPoint.radius, Math.sin(angle) * weakPoint.radius, mouthZ + .12);
      hinge.rotation.z = angle;
      body.add(hinge);
      leaves.push(surface(hinge, petal, plates));
    }

    for (let spike = 0; spike < 50; spike++) {
      const z = 1 - 2 * (spike + .5) / 50;
      if (z > .86) continue;
      const angle = spike * 2.399963 + index * .71;
      const side = Math.sqrt(1 - z * z);
      const ray = vector(Math.cos(angle) * side, Math.sin(angle) * side, z);
      const length = radius * (.12 + .13 * (.5 + .5 * Math.sin(spike * 8.73)));
      const barb = surface(body, stem, fibers, ray.clone().multiplyScalar(radius + length * .38));
      barb.scale.set(length * .31, length, length * .30);
      barb.quaternion.setFromUnitVectors(vector(0, 1, 0), ray);
      const head = surface(body, cap, plates, ray.clone().multiplyScalar(radius + length * .91));
      head.scale.setScalar(length * .43);
    }
    ports.push({ lobe, hull, core, sheen, lamp, leaves });
  }

  const signals = [];
  const lumen = new THREE.MeshStandardMaterial({
    color: 0xf9989f, emissive: 0xbb335e, emissiveIntensity: .85, roughness: .44,
  });
  for (const side of [-1, 1]) {
    for (let branch = 0; branch < 3; branch++) {
      const path = cord(root, [
        vector(side * 1.85, 5.2 + branch * .65, -21.5 + branch * .58),
        vector(side * 4.0, 3.6 + branch * 1.65, -20.8 + branch * .35),
        vector(side * 5.45, 4.35 + branch * .25, -19 + branch * .64),
        vector(side * 7.05, 4.0 + branch * .57, -18.1),
      ], .24 - branch * .049, fibers);
      signals.push({ path, bead: surface(root, cap, lumen), slot: branch / 3 + (side + 1) * .2 });
    }
    cord(root, [
      vector(side * 6.7, 3.7, -18.9), vector(side * 9.8, 2.4, -23),
      vector(side * 13, 1.15, -23.9), vector(side * 18, .20, -28),
    ], .28, fibers);
    cord(root, [
      vector(side * 6.9, 5, -18.5), vector(side * 9.8, 6.1, -21.7),
      vector(side * 12, 8.4, -23.7), vector(side * 18.5, 12, -30),
    ], .22, membrane);
  }
  cord(root, [vector(0, 4, -21), vector(.5, 1.8, -20.5), vector(-2, .1, -22), vector(-5, .1, -27)], .46, fibers);

  let collapse = 0;
  return {
    root,
    update(boss, time, dt, reduced) {
      root.visible = !!boss;
      if (!boss) {
        collapse = 0;
        root.scale.setScalar(1);
        root.position.y = 0;
        return;
      }
      const defeated = boss.state === 'defeated';
      collapse = defeated ? Math.min(1, collapse + dt / .85) : 0;
      root.position.y = -3.5 * collapse;
      root.scale.y = 1 - .28 * collapse;
      root.visible = collapse < 1;
      for (const { lobe, hull, core, sheen, lamp, leaves } of ports) {
        const selected = !defeated && lobe.id === boss.weakPoint.id;
        const openness = selected ? boss.openness : 0;
        const warning = selected && boss.state === 'warning';
        const beat = reduced ? .5 : .5 + .5 * Math.sin(time * (warning ? 14 : 5) + lobe.x);
        hull.scale.setScalar(1 + (reduced ? 0 : .018 * beat));
        for (const leaf of leaves) leaf.rotation.y = -openness * 1.23 - (warning ? .075 * beat : 0);
        core.visible = openness > .16;
        core.material.emissiveIntensity = .65 + .7 * beat;
        sheen.visible = warning || openness > .16;
        sheen.material.opacity = warning ? .14 + .19 * beat : .25 * openness;
        lamp.intensity = warning ? 5 + 12 * beat : 42 * openness;
      }
      for (const { bead, path, slot } of signals) {
        bead.visible = !defeated && (boss.state !== 'sealed' || boss.phase > 1);
        bead.position.copy(path.getPoint(reduced ? .5 : (time * (.54 + boss.phase * .12) + slot) % 1));
        bead.scale.setScalar(.15 + .018 * boss.phase);
      }
    },
  };
}
