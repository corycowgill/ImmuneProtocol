import * as THREE from './vendor/three.module.js';
import { HEART_VALVES, VALVE_CENTER_Y, VALVE_RIM, apertureRadius } from './heart-chamber.mjs';

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
  const bore = apertureRadius(openness);
  const yaw = rimPhase + index * CUSP_SWEEP;
  for (let row = 0; row <= CUSP_WIDTH; row++) {
    const v = row / CUSP_WIDTH;
    for (let column = 0; column <= CUSP_SPAN; column++) {
      const u = column / CUSP_SPAN;
      const center = Math.sin(u * Math.PI);
      const theta = yaw + (u - .5) * CUSP_SWEEP;
      const scallop = 1 + openness * .075 * (1 - center ** 2);
      const base = VALVE_RIM + .19 * center ** 2 + .04 * Math.sin(theta * 7);
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
    const z = .72 - v * 13.52;
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

// All four valves of the chamber. Each is a muscular sleeve lying in the floor with its mouth to the
// middle of the chamber, three leaflets that open and close on that valve's own beat, a capped
// far end, a light in its throat, and blood cells pouring through while it is open.
export function createHeartValve(scene, maps, redCell, random) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const muscle = new THREE.MeshPhysicalMaterial({
    ...maps, vertexColors: true, color: 0xd98e8d, roughness: .63,
    clearcoat: .59, clearcoatRoughness: .32, sheen: .44, sheenColor: 0xd68c93,
    normalScale: new THREE.Vector2(1.02, 1.02), side: THREE.DoubleSide,
  });
  const rim = new THREE.MeshPhysicalMaterial({
    ...maps, color: 0xc67d77, roughness: .55, clearcoat: .68, clearcoatRoughness: .29,
    sheen: .38, sheenColor: 0xf0a89f, normalScale: new THREE.Vector2(.7, .7),
  });
  const rimAccent = rim.clone();
  rimAccent.color.set(0x9f535e);
  const throat = new THREE.MeshPhysicalMaterial({
    ...maps, color: 0x5a2630, roughness: .7, clearcoat: .4, sheen: .3, sheenColor: 0xb05a66,
    emissive: 0x2a0a10, emissiveIntensity: .35, side: THREE.DoubleSide,
  });
  const sheet = new THREE.MeshPhysicalMaterial({
    ...maps, vertexColors: true, color: 0xffc8b9,
    roughness: .52, clearcoat: .76, clearcoatRoughness: .25,
    sheen: .62, sheenColor: 0xffb7a5, normalScale: new THREE.Vector2(.88, .88),
    emissive: 0x461721, emissiveIntensity: .13, side: THREE.DoubleSide,
  });
  const cellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb34a4f, roughness: .34, clearcoat: .75, clearcoatRoughness: .23,
    emissive: 0x431111, emissiveIntensity: .2,
  });
  const sleeveGeometry = sleeve();
  const rims = [shapedRim(3.82, .25, .25, .4), shapedRim(3.95, .13, .62, 1.2), shapedRim(3.99, .22, -.63, 2.8)];
  // The far end of the sleeve is closed off, so a look through the valve finds the colonies'
  // dark chamber rather than the arena beyond.
  const cap = new THREE.CircleGeometry(7.1, 40);
  cap.translate(0, 0, -12.7);
  const lip = new THREE.Color(0xe2959a);
  const vein = new THREE.Color(0x823d50);
  const transform = new THREE.Object3D();

  const valves = HEART_VALVES.map(layout => {
    const root = new THREE.Group();
    root.position.set(layout.x, VALVE_CENTER_Y, layout.z);
    root.rotation.y = layout.yaw;
    group.add(root);
    mesh(root, sleeveGeometry, muscle);
    mesh(root, rims[0], rim);
    mesh(root, rims[1], rimAccent);
    mesh(root, rims[2], rimAccent);
    mesh(root, cap, throat);
    const cusps = [];
    for (let index = 0; index < CUSPS; index++) {
      const geometry = surface(CUSP_WIDTH, CUSP_SPAN, (u, v, color) => {
        const striation = .5 + .5 * Math.sin(u * 27 + Math.sin(v * 5) + index * .65 + layout.index);
        const lipEdge = Math.exp(-v * 15) * .35;
        const root = THREE.MathUtils.smoothstep(v, .49, .96);
        const fade = .55 + .22 * Math.sin(u * Math.PI) + lipEdge - root * .45;
        return color.copy(vein).lerp(lip, fade + striation * .12);
      }, true);
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4.15);
      cuspShape(geometry, index, 0);
      mesh(root, geometry, sheet);
      cusps.push(geometry);
    }
    // One light in the throat: dim while shut, flaring as the leaflets part.
    const light = new THREE.PointLight(0xff9d66, 40, 15, 2);
    light.position.set(.6, .2, -4.6);
    root.add(light);
    const cells = new THREE.InstancedMesh(redCell, cellMaterial, 18);
    cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cells.frustumCulled = false;
    root.add(cells);
    const blood = Array.from({ length: cells.count }, (_, i) => ({
      angle: i * 2.39996, radial: .6 + random() * 1.63,
      depth: random() * 8, size: .072 + random() ** 1.8 * .15, tilt: random() * TAU,
    }));
    return { cusps, light, cells, blood, previous: -1, distance: 0 };
  });

  function update(state, dt, reduceMotion, low) {
    if (!state?.valves) return;
    for (const [index, view] of valves.entries()) {
      const openness = state.valves[index]?.openness ?? 0;
      if (Math.abs(openness - view.previous) > .0008 || (openness === 0 && view.previous !== 0)) {
        view.cusps.forEach((geometry, cusp) => cuspShape(geometry, cusp, openness));
        view.previous = openness;
      }
      view.light.intensity = 34 + openness * 70;
      const { cells, blood } = view;
      cells.visible = !reduceMotion && openness > .02;
      if (!cells.visible) continue;
      cells.count = low ? 6 : blood.length;
      view.distance = (view.distance + dt * (.25 + openness * 3.6)) % 8;
      for (let i = 0; i < cells.count; i++) {
        const cell = blood[i];
        // Cells pour out of the open valve into the chamber.
        const depth = (view.distance + cell.depth) % 8;
        const angle = cell.angle + depth * .18;
        const radial = Math.min(cell.radial, apertureRadius(openness) * .9) + depth * .10;
        transform.position.set(Math.cos(angle) * radial, Math.sin(angle) * radial - Math.max(0, depth - 4.5) * .25, depth - 4.5);
        transform.rotation.set(cell.tilt + depth * .72, angle, cell.tilt * .6);
        transform.scale.setScalar(cell.size);
        transform.updateMatrix();
        cells.setMatrixAt(i, transform.matrix);
      }
      cells.instanceMatrix.needsUpdate = true;
    }
  }
  return { group, update };
}
