import * as THREE from './vendor/three.module.js';
import { HEART_VALVE } from './simulation.mjs';

const TAU = Math.PI * 2;
const CUSPS = 3;
const CUSP_SWEEP = TAU / CUSPS;
const CUSP_SPAN = 31;
const CUSP_WIDTH = 13;
const rimPhase = Math.PI / 2;

function surface(rows, columns, paint, dynamic = false) {
  const geometry = new THREE.BufferGeometry();
  const count = (rows + 1) * (columns + 1);
  const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  if (dynamic) positions.setUsage(THREE.DynamicDrawUsage);
  const colors = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const indices = [];
  const color = new THREE.Color();
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const index = row * (columns + 1) + column;
      const u = column / columns;
      const v = row / rows;
      uv[index * 2] = u;
      uv[index * 2 + 1] = v;
      paint(u, v, color).toArray(colors, index * 3);
      if (row === rows || column === columns) continue;
      const next = index + columns + 1;
      indices.push(index, next, index + 1, next, next + 1, index + 1);
    }
  }
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function mesh(group, geometry, material) {
  const result = new THREE.Mesh(geometry, material);
  group.add(result);
  return result;
}

function cuspShape(cusp, index, openness) {
  const positions = cusp.attributes.position;
  const bore = .035 + 2.35 * openness ** .6;
  const yaw = rimPhase + index * CUSP_SWEEP;
  for (let row = 0; row <= CUSP_WIDTH; row++) {
    const v = row / CUSP_WIDTH;
    for (let column = 0; column <= CUSP_SPAN; column++) {
      const u = column / CUSP_SPAN;
      const center = Math.sin(u * Math.PI);
      const theta = yaw + (u - .5) * CUSP_SWEEP;
      const scallop = 1 + openness * .075 * (1 - center ** 2);
      const base = HEART_VALVE.radius + .19 * center ** 2 + .04 * Math.sin(theta * 7);
      const radius = THREE.MathUtils.lerp(bore * scallop, base, v);
      // The free edge bends downstream when the valve opens. Keep the wall seam rooted.
      const fold = Math.sin(v * Math.PI);
      const z = -.50 * (1 - v) * openness + fold * (.21 + .24 * center)
        + (1 - v) * (.15 - .25 * openness) * center
        + fold * .031 * Math.sin(theta * 16 + v * 5);
      positions.setXYZ(row * (CUSP_SPAN + 1) + column,
        Math.cos(theta) * radius, Math.sin(theta) * radius, z);
    }
  }
  positions.needsUpdate = true;
  cusp.computeVertexNormals();
}

function sleeve() {
  const rows = 54;
  const columns = 92;
  const base = new THREE.Color(0x87505b);
  const rib = new THREE.Color(0xd1847b);
  const geometry = surface(rows, columns, (u, v, color) => {
    const theta = u * TAU;
    const ridge = (.5 + .5 * Math.cos(theta * 7 + Math.sin(v * 9) * .7)) ** 3;
    const light = .14 + ridge * .53 + .14 * Math.sin(v * 28 + theta * 2);
    return color.copy(base).lerp(rib, light);
  });
  const { position: positions, uv } = geometry.attributes;
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    const z = 19.9 - v * 32.7;
    const choke = Math.exp(-(((z + .06) / 3.6) ** 2));
    for (let column = 0; column <= columns; column++) {
      const theta = column / columns * TAU;
      const folds = Math.cos(theta * 7 + Math.sin(v * 9) * .7) ** 2;
      const r = 6.75 - choke * 2.82 + (.10 + .43 * (1 - choke)) * folds
        + .17 * Math.sin(theta * 4 - v * 5) * (1 - choke);
      const index = row * (columns + 1) + column;
      positions.setXYZ(index, r * Math.cos(theta), r * Math.sin(theta), z);
      uv.setXY(index, 4 * column / columns, 3 * v);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function shapedRim(radius, width, depth, side) {
  const geometry = new THREE.TorusGeometry(radius, width, 16, 92);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const theta = Math.atan2(positions.getY(i), positions.getX(i));
    const ridge = Math.sin(theta * 3 + .5) * .033 + Math.sin(theta * 9 + side) * .012;
    positions.setXYZ(i, positions.getX(i) * (1 + ridge),
      positions.getY(i) * (1 + ridge), positions.getZ(i) + depth + Math.sin(theta * 3) * .17);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createHeartValve(scene, maps, redCell, random) {
  const group = new THREE.Group();
  group.position.set(HEART_VALVE.x, HEART_VALVE.y, HEART_VALVE.z);
  group.visible = false;
  scene.add(group);

  const muscle = new THREE.MeshPhysicalMaterial({
    ...maps, vertexColors: true, color: 0xd98e8d, roughness: .63,
    clearcoat: .59, clearcoatRoughness: .32, sheen: .44, sheenColor: 0xd68c93,
    normalScale: new THREE.Vector2(1.02, 1.02), side: THREE.DoubleSide,
  });
  mesh(group, sleeve(), muscle);
  const rim = new THREE.MeshPhysicalMaterial({
    ...maps, color: 0xc67d77, roughness: .55, clearcoat: .68, clearcoatRoughness: .29,
    sheen: .38, sheenColor: 0xf0a89f, normalScale: new THREE.Vector2(.7, .7),
  });
  const rimAccent = rim.clone();
  rimAccent.color.set(0x9f535e);
  mesh(group, shapedRim(3.82, .25, .25, .4), rim);
  mesh(group, shapedRim(3.95, .13, .62, 1.2), rimAccent);
  mesh(group, shapedRim(3.99, .22, -.63, 2.8), rimAccent);

  const sheet = new THREE.MeshPhysicalMaterial({
    ...maps, vertexColors: true, color: 0xffc8b9,
    roughness: .52, clearcoat: .76, clearcoatRoughness: .25,
    sheen: .62, sheenColor: 0xffb7a5, normalScale: new THREE.Vector2(.88, .88),
    emissive: 0x461721, emissiveIntensity: .13, side: THREE.DoubleSide,
  });
  const lip = new THREE.Color(0xe2959a);
  const vein = new THREE.Color(0x823d50);
  const cusps = [];
  for (let index = 0; index < CUSPS; index++) {
    const geometry = surface(CUSP_WIDTH, CUSP_SPAN, (u, v, color) => {
      const striation = .5 + .5 * Math.sin(u * 27 + Math.sin(v * 5) + index * .65);
      const lipEdge = Math.exp(-v * 15) * .35;
      const root = THREE.MathUtils.smoothstep(v, .49, .96);
      const fade = .55 + .22 * Math.sin(u * Math.PI) + lipEdge - root * .45;
      return color.copy(vein).lerp(lip, fade + striation * .12);
    }, true);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4.15);
    cuspShape(geometry, index, 0);
    mesh(group, geometry, sheet);
    cusps.push(geometry);
  }

  const inflow = new THREE.PointLight(0xffac85, 31, 14, 2);
  inflow.position.set(-1.85, 2.75, 3.4);
  group.add(inflow);
  const chamber = new THREE.PointLight(0xff9d66, 65, 15, 2);
  chamber.position.set(1.85, 2.25, -4.3);
  const apertureLight = new THREE.PointLight(0xffdca1, 0, 6, 2);
  apertureLight.position.set(-.8, 2.1, -1.25);
  group.add(chamber, apertureLight);

  const cellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb34a4f, roughness: .34, clearcoat: .75, clearcoatRoughness: .23,
    emissive: 0x431111, emissiveIntensity: .2,
  });
  const cells = new THREE.InstancedMesh(redCell, cellMaterial, 26);
  cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cells.frustumCulled = false;
  group.add(cells);
  const blood = Array.from({ length: cells.count }, (_, i) => ({
    angle: i * 2.39996, radial: .6 + random() * 1.63,
    depth: random() * 8, size: .072 + random() ** 1.8 * .15, tilt: random() * TAU,
  }));
  const transform = new THREE.Object3D();
  let previous = 0;
  let distance = 0;

  function update(valve, dt, reduceMotion, low) {
    const openness = valve.openness;
    if (Math.abs(openness - previous) > .0008 || (openness === 0 && previous !== 0)) {
      cusps.forEach((geometry, index) => cuspShape(geometry, index, openness));
      previous = openness;
    }
    chamber.intensity = 46 + openness * 48;
    inflow.intensity = 29 + openness * 12;
    apertureLight.intensity = openness * 12;
    cells.visible = !reduceMotion;
    if (!cells.visible) return;
    cells.count = low ? 10 : blood.length;
    distance = (distance + dt * (.25 + openness * 3.6)) % 8;
    for (let index = 0; index < cells.count; index++) {
      const cell = blood[index];
      const depth = (distance + cell.depth) % 8;
      const angle = cell.angle + depth * .18;
      const radial = cell.radial + depth * .10;
      transform.position.set(Math.cos(angle) * radial,
        Math.sin(angle) * radial, -1.0 - depth);
      transform.rotation.set(cell.tilt + depth * .72, angle, cell.tilt * .6);
      transform.scale.setScalar(cell.size);
      transform.updateMatrix();
      cells.setMatrixAt(index, transform.matrix);
    }
    cells.instanceMatrix.needsUpdate = true;
  }
  return { group, update };
}

export function createValveColony(maps, lobe, random) {
  const group = new THREE.Group();
  const crust = new THREE.MeshPhysicalMaterial({
    ...maps, color: 0xa36d57, roughness: .57, clearcoat: .72, clearcoatRoughness: .27,
    sheen: .45, sheenColor: 0xe6b48b, normalScale: new THREE.Vector2(.87, .87),
    emissive: 0x491e13, emissiveIntensity: .38,
  });
  const pustule = new THREE.MeshPhysicalMaterial({
    ...maps, color: 0xd6ae74, roughness: .43, clearcoat: .84, clearcoatRoughness: .2,
    emissive: 0x8f471b, emissiveIntensity: .7, sheen: .43, sheenColor: 0xeecb93,
    normalScale: new THREE.Vector2(.55, .55),
  });
  const matrix = mesh(group, lobe, crust);
  matrix.scale.set(.77, .73, .51);
  matrix.position.z = -.05;

  const forms = new THREE.InstancedMesh(lobe, crust, 21);
  group.add(forms);
  const pearls = new THREE.InstancedMesh(lobe, pustule, 14);
  group.add(pearls);
  const transform = new THREE.Object3D();
  for (let index = 0; index < forms.count; index++) {
    const angle = index * 2.39996;
    const radius = .38 + random() * .46;
    const size = .18 + random() * .21;
    transform.position.set(Math.cos(angle) * radius,
      Math.sin(angle) * radius * .89, .19 + random() * .19);
    transform.rotation.set(random(), -angle, angle);
    transform.scale.set(size * 1.2, size * .76, size);
    transform.updateMatrix();
    forms.setMatrixAt(index, transform.matrix);
    forms.setColorAt(index, new THREE.Color(0xf2b0a2).lerp(new THREE.Color(0xc17a67), random()));
  }
  for (let index = 0; index < pearls.count; index++) {
    const angle = index * 2.39996;
    const radius = index === 0 ? 0 : .18 + random() * .43;
    const size = index === 0 ? .19 : .055 + random() * .12;
    transform.position.set(Math.cos(angle) * radius,
      Math.sin(angle) * radius * .92, .40 + random() * .09);
    transform.rotation.set(random(), angle, random());
    transform.scale.set(size, size * .89, size * .80);
    transform.updateMatrix();
    pearls.setMatrixAt(index, transform.matrix);
  }

  for (let index = 0; index < 6; index++) {
    const angle = index / 6 * TAU + .16;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const growth = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * .46, y * .44, -.12),
      new THREE.Vector3(x * .91 + .07, y * .84 - .13, -.38),
      new THREE.Vector3(x * 1.62, y * 1.48 + .05, -1.32),
      new THREE.Vector3(x * 3.52, y * 2.98, -1.8),
    ]);
    mesh(group, new THREE.TubeGeometry(growth, 13, .044 + random() * .042, 6, false), crust);
  }
  return group;
}
