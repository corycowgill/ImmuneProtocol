// Close-up set dressing for every arena, layered on level-props.mjs: the things a suit walks past
// at floor level and sees overhead. Red-cell drifts, platelets and fibrin in the bloodstream;
// grape-bunch alveoli, cilia carpets, mucus strands and surfactant bubbles in the lungs; gastric
// pits, mucus globs, chyme and rising acid bubbles in the stomach; Peyer's patches in the small
// intestine; biofilm mats and gas in the colon; resting lymphocytes and a reticular web in the
// lymph node; hair-cell bundles, otoconia and tectorial arches in the inner ear; astrocytes,
// myelinated axons and drifting vesicles in the brain.
//
// None of it collides or changes gameplay: floor scatter keeps clear of tissue nodes and
// obstacles, and tall pieces stand at the walls or hang overhead. Floor scatter is instanced and
// split into cullable patches (decor-chunks.mjs), and Low quality thins it.
import * as THREE from './vendor/three.module.js';
import { chunkInstances } from './decor-chunks.mjs';
import { ARENA_GROWTH } from './arena-scale.mjs';
import { bioMaterial, addSway, lumpySphere, fingerGeometry, redCellGeometry, mergeGeometries, tube, taperedTube } from './level-props.mjs';

const FLOOR_X = 42 * ARENA_GROWTH;
const FLOOR_Z = 59 * ARENA_GROWTH;
const TAU = Math.PI * 2;
const matrix = new THREE.Matrix4();
const rotation = new THREE.Quaternion();
const euler = new THREE.Euler();
const position = new THREE.Vector3();
const size = new THREE.Vector3();
const shade = new THREE.Color();

// keepOff: [x, z, radius] areas decor must stay off without being dressed like obstacles (raised ground).
function placement(random, nodes, obstacles, floorHeight, keepOff = []) {
  const clear = (x, z, gap) => !nodes.some(node => Math.hypot(node.x - x, node.z - z) < 4.5 + gap) &&
    !obstacles.some(([ox, oz, radius]) => Math.hypot(ox - x, oz - z) < radius + .6 + gap) &&
    !keepOff.some(([ox, oz, radius]) => Math.hypot(ox - x, oz - z) < radius + .4 + Math.max(0, gap));
  return {
    floorHeight, nodes, obstacles,
    // A floor point clear of nodes and obstacles, or null.
    inside(gap = 0, reach = .96) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const angle = random() * TAU, r = Math.sqrt(random()) * reach;
        const x = Math.cos(angle) * FLOOR_X * r, z = Math.sin(angle) * FLOOR_Z * r;
        if (clear(x, z, gap)) return [x, z];
      }
      return null;
    },
    // A point at or beyond the arena wall.
    rim(min = .98, max = 1.1) {
      const angle = random() * TAU, r = min + random() * (max - min);
      return [Math.cos(angle) * FLOOR_X * r, Math.sin(angle) * FLOOR_Z * r];
    },
    clear,
  };
}

// The arena being dressed, so every floor-level piece can be kept off nodes and obstacles.
let keepClear = () => true;

// items: { x, y, z, rx, ry, rz, sx, sy, sz, color: [r, g, b] }
function instanced(root, geometry, material, items, { chunk = true, cell = 24, pad = 1, name = '' } = {}) {
  // Clusters spread around their centre, so each floor piece is checked again on its own.
  items = items.filter(item => item.y > 1.5 || keepClear(item.x, item.z));
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  items.forEach((item, index) => {
    euler.set(item.rx ?? 0, item.ry ?? 0, item.rz ?? 0);
    matrix.compose(position.set(item.x, item.y, item.z), rotation.setFromEuler(euler), size.set(item.sx, item.sy ?? item.sx, item.sz ?? item.sx));
    mesh.setMatrixAt(index, matrix);
    if (item.color) mesh.setColorAt(index, shade.setRGB(...item.color));
  });
  root.add(mesh);
  return chunk ? chunkInstances(mesh, { cell, pad }) : mesh;
}

function tint(random, base = 1, spread = .2) {
  const t = base - random() * spread;
  return [t, t * (.92 + random() * .08), t * (.92 + random() * .08)];
}

// Ambient particles animated in the vertex shader: bubbles that rise and pop, or motes and films
// that drift in place. `spawn(i)` returns each particle's base position.
function particles(root, time, count, spawn, { rise = 0, height = 4, size = .25, speed = .2, color = 0xffffff, style = 'soft', opacity = .8 } = {}) {
  const base = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    base.set(spawn(i), i * 3);
    for (let k = 0; k < 4; k++) seeds[i * 4 + k] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const material = new THREE.ShaderMaterial({
    uniforms: { time, tint: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      uniform float time;
      varying float vFade; varying vec4 vSeed;
      void main() {
        vec3 p = position;
        float t = fract(seed.x + time * ${speed.toFixed(3)} * (.6 + seed.y * .8));
        ${rise ? `
        p.y += t * ${height.toFixed(2)};
        p.x += sin(time * (1.3 + seed.z) + seed.w * 20.) * .12 * t;
        p.z += cos(time * (1.1 + seed.w) + seed.z * 20.) * .12 * t;
        vFade = smoothstep(0., .08, t) * smoothstep(1., .82, t);` : `
        p += vec3(sin(time * .13 + seed.x * 30.), sin(time * .19 + seed.y * 30.) * .6, cos(time * .11 + seed.z * 30.)) * ${height.toFixed(2)};
        vFade = .6 + .4 * sin(time * .7 + seed.w * 20.);`}
        vSeed = seed;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = min(48., ${size.toFixed(3)} * (.55 + seed.y * .9) * 760. / max(.5, -mv.z));
        vFade *= smoothstep(1., 3., -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 tint; uniform float opacity, time;
      varying float vFade; varying vec4 vSeed;
      void main() {
        vec2 c = gl_PointCoord - .5;
        float d = length(c) * 2.;
        if (d > 1.) discard;
        vec3 col = tint; float alpha;
        ${style === 'bubble' ? `
        float ring = smoothstep(.62, .9, d) * smoothstep(1., .9, d);
        float spot = smoothstep(.22, .0, length(c - vec2(-.17, .17)));
        alpha = (ring * .8 + spot * .9 + .08) * vFade;
        col = mix(tint, vec3(1.), spot);` : style === 'film' ? `
        float ring = smoothstep(.55, .92, d) * smoothstep(1., .92, d);
        float hue = atan(c.y, c.x) + time * .6 + vSeed.z * 6.28;
        vec3 sheen = .55 + .45 * cos(hue + vec3(0., 2.1, 4.2));
        float spot = smoothstep(.2, .0, length(c - vec2(-.18, .2)));
        col = mix(sheen, vec3(1.), spot);
        alpha = (ring * .75 + spot * .8 + .05) * vFade;` : `
        alpha = pow(1. - d, 1.7) * vFade;`}
        gl_FragColor = vec4(col, alpha * opacity);
      }
    `,
    transparent: true, depthWrite: false, blending: style === 'soft' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  root.add(points);
  return points;
}

// Drooping strands hung from the canopy.
function hangingStrands(root, random, count, material, { top = [17, 22], drop = [5, 10], radius = [.06, .14] } = {}) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * TAU, r = Math.sqrt(random()) * .95;
    const x = Math.cos(angle) * FLOOR_X * r, z = Math.sin(angle) * FLOOR_Z * r;
    const y0 = top[0] + random() * (top[1] - top[0]);
    const length = drop[0] + random() * (drop[1] - drop[0]);
    const sway = (random() - .5) * 2, lean = (random() - .5) * 2;
    const points = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      points.push([x + sway * t * t + Math.sin(t * 5 + i) * .15, y0 - length * t, z + lean * t * t]);
    }
    const thick = radius[0] + random() * (radius[1] - radius[0]);
    parts.push(taperedTube(points, thick, thick * .35, 16, 6));
    // A drop gathering at the tip.
    const drip = new THREE.SphereGeometry(thick * 1.6, 8, 6);
    drip.scale(1, 1.4, 1);
    drip.translate(points[6][0], points[6][1] - thick, points[6][2]);
    parts.push(drip);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  root.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- per-area dressing

function bloodstream(root, random, place, time) {
  // Red cells settled in drifts against the walls and the clots.
  const disc = redCellGeometry();
  const cell = bioMaterial('red-cell', [1, 1], { color: 0xc8362f, roughness: .3, clearcoat: .8, sheen: .5, sheenColor: 0xff9c8a,
    emissive: 0x3a0306, emissiveIntensity: .25 });
  const cells = [];
  for (let drift = 0; drift < 46; drift++) {
    const [cx, cz] = drift < 30 ? place.rim(.94, 1.02) : place.inside(-.3) ?? place.rim();
    const pile = 10 + Math.floor(random() * 14);
    for (let i = 0; i < pile; i++) {
      const a = random() * TAU, r = random() * 2.2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const stack = random() * (1 - r / 2.4) * 1.1;
      cells.push({ x, y: place.floorHeight(x, z) + .1 + stack, z, rx: random() * TAU, ry: random() * TAU, rz: random() * TAU,
        sx: .45 + random() * .25, color: tint(random, 1, .3) });
    }
  }
  instanced(root, disc, cell, cells, { name: 'red-cell-drifts' });
  // Platelets: small pale discs scattered over the floor.
  const platelet = bioMaterial('leukocyte', [1, 1], { color: 0xf0c890, roughness: .35, clearcoat: .6, emissive: 0x402008, emissiveIntensity: .25 });
  const platelets = [];
  for (let i = 0; i < 420; i++) {
    const spot = place.inside(-1);
    if (!spot) continue;
    const [x, z] = spot;
    const s = .1 + random() * .16;
    platelets.push({ x, y: place.floorHeight(x, z) + s * .3, z, ry: random() * TAU, rx: (random() - .5) * .5, sx: s, sy: s * .35, sz: s * .8,
      color: tint(random, 1, .25) });
  }
  instanced(root, lumpySphere(0, .4, 17), platelet, platelets, { name: 'platelets' });
  // Fibrin threads strung across the floor.
  const fibrin = bioMaterial('neural', [1, 4], { color: 0xf3dccd, roughness: .5, clearcoat: .4 });
  const threads = [];
  for (let i = 0; i < 70; i++) {
    const spot = place.inside(-.5);
    if (!spot) continue;
    const [x, z] = spot;
    const angle = random() * TAU, length = 2 + random() * 4;
    const points = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const px = x + Math.cos(angle) * length * t + Math.sin(t * 7 + i) * .2, pz = z + Math.sin(angle) * length * t + Math.cos(t * 5 + i) * .2;
      points.push([px, place.floorHeight(px, pz) + .04 + Math.sin(t * Math.PI) * .25, pz]);
    }
    threads.push(tube(points, .025 + random() * .02, 14, 4));
  }
  root.add(new THREE.Mesh(mergeGeometries(threads), fibrin));
  // Plasma motes in the air.
  particles(root, time, 260, () => {
    const angle = random() * TAU, r = Math.sqrt(random());
    return [Math.cos(angle) * FLOOR_X * r, .5 + random() * 9, Math.sin(angle) * FLOOR_Z * r];
  }, { height: 1.6, size: .09, color: 0xffb8a8, opacity: .55 });
}

function lungs(root, random, place, time) {
  // Alveoli: grape bunches of air sacs climbing the walls.
  const sac = bioMaterial('leukocyte', [1, 1], { color: 0xffc2cc, roughness: .28, clearcoat: .95, clearcoatRoughness: .12, sheen: 1,
    sheenColor: 0xffeef2, emissive: 0x5a1a28, emissiveIntensity: .32 });
  const sacs = [];
  for (let bunch = 0; bunch < 34; bunch++) {
    const [cx, cz] = place.rim(.96, 1.08);
    const count = 10 + Math.floor(random() * 10);
    for (let i = 0; i < count; i++) {
      const a = random() * TAU, r = random() * 2.6;
      const y = random() * 9;
      const s = (.7 + random() * 1.1) * (1 - y / 16);
      sacs.push({ x: cx + Math.cos(a) * r, y, z: cz + Math.sin(a) * r, ry: random() * TAU, sx: s, sy: s * (.9 + random() * .2), color: tint(random, 1, .22) });
    }
  }
  instanced(root, lumpySphere(1, .07, 31), sac, sacs, { name: 'alveoli', cell: 30 });
  // Cilia carpets: patches of fine hairs that beat in waves.
  const hair = addSway(bioMaterial('leukocyte', [1, 3], { color: 0xfff0f2, roughness: .4, clearcoat: .5, sheen: .8, sheenColor: 0xffffff,
    emissive: 0x4a1a24, emissiveIntensity: .25 }), time, .5, 3.1, 'lung-cilia');
  const cilia = [];
  for (let patch = 0; patch < 46; patch++) {
    const spot = place.inside(.5);
    if (!spot) continue;
    const [cx, cz] = spot;
    for (let i = 0; i < 70; i++) {
      const a = random() * TAU, r = Math.sqrt(random()) * 2.4;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const h = .25 + random() * .55 * (1 - r / 3);
      cilia.push({ x, y: place.floorHeight(x, z) - .02, z, rx: (random() - .5) * .3, ry: random() * TAU, sx: .05 + random() * .03, sy: h, color: tint(random, 1, .2) });
    }
  }
  const carpet = instanced(root, fingerGeometry(5, 5), hair, cilia, { name: 'cilia', cell: 21 });
  // Mucus strands hanging from the bronchial canopy.
  hangingStrands(root, random, 40, new THREE.MeshPhysicalMaterial({ color: 0xf4e6cc, roughness: .12, clearcoat: 1, clearcoatRoughness: .08,
    emissive: 0x302414, emissiveIntensity: .3, sheen: .6, sheenColor: 0xffffff }));
  // Surfactant bubbles drifting through the airway.
  particles(root, time, 150, () => {
    const angle = random() * TAU, r = Math.sqrt(random());
    return [Math.cos(angle) * FLOOR_X * r, 1 + random() * 10, Math.sin(angle) * FLOOR_Z * r];
  }, { height: 2.2, size: .5, style: 'film', opacity: .55 });
  return high => carpet?.setFraction(high ? 1 : .35);
}

function stomach(root, random, place, time) {
  // Gastric pits: glistening craters that dot the mucosa, darker in the throat.
  const pit = new THREE.LatheGeometry([[0, -.01], [.3, 0], [.55, .04], [.72, .07], [.88, .04], [1, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const colors = [];
  const pitPositions = pit.attributes.position;
  for (let i = 0; i < pitPositions.count; i++) {
    const r = Math.hypot(pitPositions.getX(i), pitPositions.getZ(i));
    const c = .55 + .45 * Math.min(1, r / .6);
    colors.push(c, c * .9, c * .85);
  }
  pit.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const pitMaterial = bioMaterial('mucosa', [1, 1], { color: 0xc89070, roughness: .22, clearcoat: 1, clearcoatRoughness: .08, vertexColors: true,
    side: THREE.DoubleSide });
  const pits = [];
  for (let i = 0; i < 300; i++) {
    const spot = place.inside(-.4);
    if (!spot) continue;
    const [x, z] = spot;
    const s = .5 + random() * .9;
    pits.push({ x, y: place.floorHeight(x, z) - .005, z, ry: random() * TAU, sx: s, sy: s * (.3 + random() * .3), color: tint(random, 1, .25) });
  }
  instanced(root, pit, pitMaterial, pits, { name: 'gastric-pits', cell: 21 });
  // Mucus globs and chyme scattered across the floor.
  const glob = new THREE.MeshPhysicalMaterial({ color: 0xf2e4b8, roughness: .08, clearcoat: 1, clearcoatRoughness: .05, sheen: .5,
    sheenColor: 0xffffff, emissive: 0x302808, emissiveIntensity: .35 });
  const chyme = bioMaterial('biofilm', [1, 1], { color: 0xc09048, roughness: .4, clearcoat: .7 });
  const globs = [], bits = [];
  for (let clump = 0; clump < 40; clump++) {
    const spot = place.inside(0);
    if (!spot) continue;
    const [cx, cz] = spot;
    for (let i = 0; i < 9; i++) {
      const a = random() * TAU, r = random() * 1.8;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = .15 + random() * .35;
      (i % 3 ? bits : globs).push({ x, y: place.floorHeight(x, z) + s * .25, z, ry: random() * TAU, rx: (random() - .5) * .6,
        sx: s, sy: s * (i % 3 ? .7 : .4), sz: s * (.8 + random() * .4), color: tint(random, 1, .3) });
    }
  }
  instanced(root, lumpySphere(1, .18, 7), glob, globs, { name: 'mucus-globs' });
  instanced(root, lumpySphere(0, .45, 9), chyme, bits, { name: 'chyme' });
  // Rugae: thick folds running along the walls.
  const folds = [];
  for (let i = 0; i < 16; i++) {
    const start = random() * TAU, span = .35 + random() * .4, ring = 1 + random() * .06, height = random() * 5;
    const points = [];
    for (let k = 0; k <= 10; k++) {
      const a = start + span * k / 10;
      points.push([Math.cos(a) * FLOOR_X * ring, height + Math.sin(k * 1.3 + i) * .8, Math.sin(a) * FLOOR_Z * ring]);
    }
    folds.push(tube(points, 1 + random() * .9, 40, 9));
  }
  root.add(new THREE.Mesh(mergeGeometries(folds), bioMaterial('mucosa', [8, 1], { color: 0xd47a60, roughness: .3, clearcoat: .95 })));
  hangingStrands(root, random, 22, glob, { drop: [4, 9] });
  // Acid bubbles streaming up out of the pits.
  const vents = pits.slice(0, 60);
  particles(root, time, 360, i => {
    const vent = vents[i % vents.length] ?? { x: 0, y: 0, z: 0 };
    return [vent.x + (random() - .5) * .4, vent.y, vent.z + (random() - .5) * .4];
  }, { rise: 1, height: 3.5, size: .1, speed: .25, style: 'bubble', color: 0xe4f28a, opacity: .7 });
}

function ear(root, random, place, time) {
  // Hair-cell bundles: staircases of stereocilia, tipped with mechanosensitive glow.
  const rods = [];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 7; i++) {
      const spread = (i - 3) / 3;
      const h = .45 + row * .32 - Math.abs(spread) * .08;
      const rod = new THREE.CylinderGeometry(.03, .04, h, 6);
      rod.translate(spread * .32, h / 2, -Math.abs(spread) * .18 + row * .09);
      rods.push(rod);
      const tip = new THREE.SphereGeometry(.045, 6, 4);
      tip.translate(spread * .32, h, -Math.abs(spread) * .18 + row * .09);
      rods.push(tip);
    }
  }
  const bundleMaterial = addSway(bioMaterial('leukocyte', [1, 2], { color: 0xe6faff, roughness: .25, clearcoat: .8,
    emissive: 0x2a8aa0, emissiveIntensity: .55 }), time, .12, 2.2, 'ear-bundles');
  const bundles = [];
  for (let i = 0; i < 260; i++) {
    const spot = place.inside(.2);
    if (!spot) continue;
    const [x, z] = spot;
    const s = .8 + random() * .9;
    bundles.push({ x, y: place.floorHeight(x, z) - .02, z, ry: random() * TAU, sx: s, color: tint(random, 1, .2) });
  }
  const field = instanced(root, mergeGeometries(rods), bundleMaterial, bundles, { name: 'hair-bundles', cell: 21 });
  // Otoconia: tiny calcite crystals strewn over the floor.
  const prism = new THREE.CylinderGeometry(.5, .5, 1, 6);
  prism.translate(0, .5, 0);
  const crystal = new THREE.MeshPhysicalMaterial({ color: 0xe6f6ff, roughness: .05, clearcoat: 1, iridescence: .7, emissive: 0x204a66,
    emissiveIntensity: .45, metalness: .1 });
  const shards = [];
  for (let clump = 0; clump < 60; clump++) {
    const spot = place.inside(-.4);
    if (!spot) continue;
    const [cx, cz] = spot;
    for (let i = 0; i < 7; i++) {
      const a = random() * TAU, r = random() * 1.2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = .07 + random() * .15;
      shards.push({ x, y: place.floorHeight(x, z) - .02, z, rx: (random() - .5) * 1.2, ry: random() * TAU, rz: (random() - .5) * 1.2,
        sx: s, sy: s * (2 + random() * 3), color: tint(random, 1, .15) });
    }
  }
  instanced(root, prism, crystal, shards, { name: 'otoconia' });
  // Tectorial membrane arches spanning the chamber.
  const arches = [];
  for (let i = 0; i < 9; i++) {
    const a = random() * Math.PI, width = .7 + random() * .25, peak = 11 + random() * 6;
    const points = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12 * 2 - 1;
      points.push([Math.cos(a) * FLOOR_X * width * t, peak * (1 - t * t) + 2, Math.sin(a) * FLOOR_Z * width * t]);
    }
    arches.push(taperedTube(points, .5 + random() * .4, .3, 48, 8));
  }
  const membrane = new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, roughness: .2, transparent: true, opacity: .42, depthWrite: false,
    emissive: 0x2a5070, emissiveIntensity: .6, side: THREE.DoubleSide, clearcoat: 1 });
  const archMesh = new THREE.Mesh(mergeGeometries(arches), membrane);
  archMesh.renderOrder = 2;
  root.add(archMesh);
  // Cochlear coils winding up the walls.
  const coils = [];
  for (let i = 0; i < 8; i++) {
    const [cx, cz] = place.rim(1.0, 1.06);
    const points = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, a = t * TAU * 2.6, r = 2.6 * (1 - t * .75);
      points.push([cx + Math.cos(a) * r, t * 11, cz + Math.sin(a) * r]);
    }
    coils.push(taperedTube(points, .55, .18, 90, 8));
  }
  root.add(new THREE.Mesh(mergeGeometries(coils), bioMaterial('leukocyte', [6, 1], { color: 0xc8b8d4, roughness: .3, clearcoat: .9,
    emissive: 0x20203a, emissiveIntensity: .3 })));
  particles(root, time, 200, () => {
    const angle = random() * TAU, r = Math.sqrt(random());
    return [Math.cos(angle) * FLOOR_X * r, .4 + random() * 8, Math.sin(angle) * FLOOR_Z * r];
  }, { height: 1.2, size: .08, color: 0xb8f0ff, opacity: .6 });
  return high => field?.setFraction(high ? 1 : .45);
}

function lymph(root, random, place, time) {
  // Lymphocytes resting in clusters along the cortex.
  const cell = bioMaterial('leukocyte', [1, 1], { color: 0xf2eaf4, roughness: .32, clearcoat: .8, sheen: .8, sheenColor: 0xdfe8ff,
    emissive: 0x2a2440, emissiveIntensity: .3 });
  const cells = [];
  for (let clump = 0; clump < 44; clump++) {
    const spot = clump < 26 ? place.rim(.93, 1.02) : place.inside(.3);
    if (!spot) continue;
    const [cx, cz] = spot;
    for (let i = 0; i < 11; i++) {
      const a = random() * TAU, r = random() * 2.2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = .35 + random() * .45;
      cells.push({ x, y: place.floorHeight(x, z) + s * .75 + (random() < .25 ? s : 0), z, ry: random() * TAU, sx: s,
        color: [.9 + random() * .1, .88 + random() * .1, .95 + random() * .05] });
    }
  }
  instanced(root, lumpySphere(1, .12, 23), cell, cells, { name: 'lymphocytes' });
  // A reticular web of fibres strung overhead.
  const fibres = [];
  for (let i = 0; i < 80; i++) {
    const a = random() * TAU, r = Math.sqrt(random()) * .95, b = a + (random() - .5) * 1.2, rb = Math.sqrt(random()) * .95;
    const from = [Math.cos(a) * FLOOR_X * r, 9 + random() * 9, Math.sin(a) * FLOOR_Z * r];
    const to = [Math.cos(b) * FLOOR_X * rb, 9 + random() * 9, Math.sin(b) * FLOOR_Z * rb];
    const mid = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 1.5 - random() * 2, (from[2] + to[2]) / 2];
    fibres.push(tube([from, mid, to], .04 + random() * .05, 16, 4));
  }
  root.add(new THREE.Mesh(mergeGeometries(fibres), bioMaterial('neural', [1, 6], { color: 0xf2e6ea, roughness: .4, clearcoat: .6,
    emissive: 0x302838, emissiveIntensity: .3 })));
}

function brain(root, random, place, time) {
  // Astrocytes: star-shaped glia with processes reaching over the floor.
  const parts = [lumpySphere(1, .15, 41)];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + random() * .4, lift = (random() - .3) * .8;
    const points = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, r = .6 + t * 2.6;
      points.push([Math.cos(a + Math.sin(t * 3) * .3) * r, lift * t * 1.5 - t * t * .9, Math.sin(a + Math.sin(t * 3) * .3) * r]);
    }
    parts.push(taperedTube(points, .32, .04, 16, 6));
  }
  const glia = bioMaterial('neural', [2, 2], { color: 0xdcc8f2, roughness: .3, clearcoat: .85, emissive: 0x40205a, emissiveIntensity: .45 });
  const stars = [];
  for (let i = 0; i < 54; i++) {
    const spot = i < 30 ? place.rim(.93, 1.02) : place.inside(1);
    if (!spot) continue;
    const [x, z] = spot;
    const s = .5 + random() * .7;
    stars.push({ x, y: place.floorHeight(x, z) + s * .5, z, ry: random() * TAU, sx: s, color: tint(random, 1, .2) });
  }
  instanced(root, mergeGeometries(parts), glia, stars, { name: 'astrocytes' });
  // Myelinated axons along the walls: glowing cores sheathed in segments with gaps between.
  const cores = [], sheaths = [];
  for (let i = 0; i < 12; i++) {
    const start = random() * TAU, span = .4 + random() * .5, ring = .99 + random() * .06, height = 1 + random() * 9;
    const path = [];
    for (let k = 0; k <= 16; k++) {
      const a = start + span * k / 16;
      path.push(new THREE.Vector3(Math.cos(a) * FLOOR_X * ring, height + Math.sin(k * .9 + i) * 1.2, Math.sin(a) * FLOOR_Z * ring));
    }
    const curve = new THREE.CatmullRomCurve3(path);
    cores.push(new THREE.TubeGeometry(curve, 80, .1, 5, false));
    for (let k = 0; k < 14; k++) {
      const pieces = [];
      for (let j = 0; j <= 4; j++) pieces.push(curve.getPointAt(Math.min(1, (k + j / 4 * .78) / 14)).toArray());
      sheaths.push(tube(pieces, .32, 8, 8));
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(cores), new THREE.MeshStandardMaterial({ color: 0xc8a0ff, emissive: 0xa070ff, emissiveIntensity: 1.6, roughness: .4 })));
  root.add(new THREE.Mesh(mergeGeometries(sheaths), bioMaterial('neural', [3, 1], { color: 0xf2e8ee, roughness: .25, clearcoat: 1, sheen: .6, sheenColor: 0xffffff })));
  // Synaptic vesicles drifting in the interstitial fluid.
  particles(root, time, 280, () => {
    const angle = random() * TAU, r = Math.sqrt(random());
    return [Math.cos(angle) * FLOOR_X * r, .5 + random() * 10, Math.sin(angle) * FLOOR_Z * r];
  }, { height: 1.4, size: .1, color: 0xd8b0ff, opacity: .7 });
}

function intestines(root, random, place, time) {
  // Peyer's patches: low lymphoid mounds glowing softly among the villi.
  const mound = bioMaterial('leukocyte', [2, 2], { color: 0xf8dcd6, roughness: .3, clearcoat: .9, sheen: .7, sheenColor: 0xfff0ea,
    emissive: 0x5a2420, emissiveIntensity: .45 });
  const mounds = [];
  for (let i = 0; i < 22; i++) {
    const spot = place.inside(1.5);
    if (!spot) continue;
    const [x, z] = spot;
    const s = 1.2 + random() * 1.4;
    mounds.push({ x, y: place.floorHeight(x, z) - s * .55, z, ry: random() * TAU, sx: s, sy: s * .7, color: tint(random, 1, .15) });
  }
  instanced(root, lumpySphere(2, .14, 51), mound, mounds, { name: 'peyers-patches' });
  particles(root, time, 220, () => {
    const angle = random() * TAU, r = Math.sqrt(random());
    return [Math.cos(angle) * FLOOR_X * r, place.floorHeight(0, 0), Math.sin(angle) * FLOOR_Z * r];
  }, { rise: 1, height: 6, size: .2, speed: .12, style: 'bubble', color: 0xffe0c8, opacity: .55 });
}

function colon(root, random, place, time) {
  // Biofilm mats: slick green-brown sheets spreading over the floor.
  const mat = bioMaterial('biofilm', [2, 2], { color: 0x8a9a4a, roughness: .2, clearcoat: 1, clearcoatRoughness: .1, sheen: .5,
    sheenColor: 0xd8f0a0, emissive: 0x1a2408, emissiveIntensity: .35 });
  const mats = [];
  for (let i = 0; i < 70; i++) {
    const spot = place.inside(-.2);
    if (!spot) continue;
    const [x, z] = spot;
    const s = 1 + random() * 2.2;
    mats.push({ x, y: place.floorHeight(x, z) - .02, z, ry: random() * TAU, sx: s, sy: .07 + random() * .06, sz: s * (.6 + random() * .6),
      color: tint(random, 1, .3) });
  }
  instanced(root, lumpySphere(1, .25, 61), mat, mats, { name: 'biofilm-mats' });
  // Gas bubbling up from the mats.
  particles(root, time, 300, i => {
    const m = mats[i % mats.length] ?? { x: 0, y: 0, z: 0 };
    return [m.x + (random() - .5) * m.sx, m.y + .05, m.z + (random() - .5) * m.sx];
  }, { rise: 1, height: 5, size: .22, speed: .14, style: 'bubble', color: 0xe8f0b0, opacity: .6 });
}

// ---------------------------------------------------------------- ground decals and edge debris

// Decal colours per arena: vessels, bruises, healed scars and glossy mucus film. The Heart Valve's
// small scripted chamber keeps its own dressing.
const DECALS = {
  artery: { vein: 0x4a0a10, bruise: 0x5a1820, scar: 0xe8b4a8, film: 0xfff0e0, debris: ['red-cell', 0x8a2a28] },
  junction: { vein: 0x4a0a10, bruise: 0x5a1820, scar: 0xe8b4a8, film: 0xfff0e0, debris: ['red-cell', 0x8a2a28] },
  lungs: { vein: 0x9a3a52, bruise: 0xb06478, scar: 0xfff0f4, film: 0xffffff, debris: ['leukocyte', 0xe0b0bc] },
  stomach: { vein: 0x6a2a18, bruise: 0x8a5a28, scar: 0xf8e0b8, film: 0xf4f0b0, debris: ['mucosa', 0xb07848] },
  intestines: { vein: 0x7a2228, bruise: 0x9a4a48, scar: 0xffe0d8, film: 0xfff4e8, debris: ['mucosa', 0xc07870] },
  colon: { vein: 0x4a3014, bruise: 0x5a6028, scar: 0xf0e0b8, film: 0xe8f0b0, debris: ['biofilm', 0x7a6a38] },
  lymph: { vein: 0x5a4a8a, bruise: 0x7a7aa8, scar: 0xf4f4ff, film: 0xf0f4ff, debris: ['leukocyte', 0xc8c4dc] },
  ear: { vein: 0x3a5a8a, bruise: 0x6a7aa0, scar: 0xf0f8ff, film: 0xe8f8ff, debris: ['leukocyte', 0xb8c0d8] },
  brain: { vein: 0x4a2a7a, bruise: 0x6a4a90, scar: 0xf0e8ff, film: 0xf4ecff, debris: ['neural', 0x9a80b8] },
};

// One soft-edged white decal shape on a small canvas; colour comes from the material.
function decalTexture(kind) {
  const size = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = kind.length * 977;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  ctx.lineCap = ctx.lineJoin = 'round';
  if (kind === 'vein') {
    const branch = (x, y, angle, width, length, depth) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(255,255,255,${.5 + depth * .1})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 0; i < 6; i++) {
        angle += (random() - .5) * .6;
        x += Math.cos(angle) * length / 6;
        y += Math.sin(angle) * length / 6;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (depth > 0) {
        branch(x, y, angle - .5 - random() * .5, width * .65, length * .7, depth - 1);
        branch(x, y, angle + .5 + random() * .5, width * .65, length * .7, depth - 1);
      }
    };
    for (let i = 0; i < 3; i++) branch(size / 2, size / 2, i / 3 * Math.PI * 2 + random(), 7, 46, 3);
  } else if (kind === 'scar') {
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(30, size / 2);
    ctx.bezierCurveTo(90, size / 2 - 30, 160, size / 2 + 30, 226, size / 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let x = 46; x < 220; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, size / 2 - 14);
      ctx.lineTo(x + 4, size / 2 + 14);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < (kind === 'bruise' ? 16 : 10); i++) {
      const a = random() * Math.PI * 2, d = random() * size * .22;
      const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d, r = size * (.1 + random() * .16);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(255,255,255,${kind === 'bruise' ? .5 : .6})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
  }
  // Fade every shape out before the edge so no decal shows a square border.
  ctx.globalCompositeOperation = 'destination-in';
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * .3, size / 2, size / 2, size * .5);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Flat decals, each a small grid laid onto the uneven floor, merged into one mesh per kind.
function groundDecals(root, random, place, area) {
  if (typeof document === 'undefined') return;
  const palette = DECALS[area] ?? DECALS.artery;
  const spots = { vein: [], bruise: [], scar: [], film: [] };
  for (const node of place.nodes) {
    for (let i = 0; i < 26; i++) {
      const a = random() * TAU, r = 4.6 + random() * 7;
      spots.vein.push([node.x + Math.cos(a) * r, node.z + Math.sin(a) * r, 1.6 + random() * 2.6]);
    }
    for (let i = 0; i < 6; i++) {
      const a = random() * TAU, r = 4.6 + random() * 3;
      spots.bruise.push([node.x + Math.cos(a) * r, node.z + Math.sin(a) * r, 2 + random() * 2.5]);
    }
  }
  for (const [x, z, radius] of place.obstacles) {
    for (let i = 0; i < 5; i++) {
      const a = random() * TAU, r = radius + .4 + random() * 2.2;
      spots.bruise.push([x + Math.cos(a) * r, z + Math.sin(a) * r, 1.6 + random() * 2.4]);
    }
  }
  for (let i = 0; i < 70; i++) {
    const spot = place.inside(-1);
    if (spot) spots.vein.push([...spot, 1.2 + random() * 2.4]);
  }
  for (let i = 0; i < 50; i++) {
    const [x, z] = place.rim(.86, .96);
    spots.scar.push([x, z, 1.2 + random() * 2.2]);
  }
  for (let i = 0; i < 60; i++) {
    const spot = place.inside(-1.5);
    if (spot) spots.film.push([...spot, 1 + random() * 3]);
  }
  const grid = 6;
  for (const [kind, list] of Object.entries(spots)) {
    if (!list.length) continue;
    const positions = [], uvs = [], normals = [], colors = [], index = [];
    for (const [x, z, size] of list) {
      const angle = random() * TAU, cos = Math.cos(angle), sin = Math.sin(angle);
      const shade = .8 + random() * .4;
      const base = positions.length / 3;
      for (let j = 0; j <= grid; j++) {
        for (let i = 0; i <= grid; i++) {
          const u = i / grid, v = j / grid, lx = (u - .5) * size, lz = (v - .5) * size;
          const wx = x + lx * cos - lz * sin, wz = z + lx * sin + lz * cos;
          positions.push(wx, place.floorHeight(wx, wz) + .028, wz);
          uvs.push(u, v);
          normals.push(0, 1, 0);
          colors.push(shade, shade, shade);
          if (i < grid && j < grid) {
            const k = base + j * (grid + 1) + i;
            index.push(k, k + grid + 1, k + 1, k + 1, k + grid + 1, k + grid + 2);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(index);
    const material = new THREE.MeshStandardMaterial({
      map: decalTexture(kind), color: palette[kind], vertexColors: true, transparent: true, depthWrite: false,
      opacity: kind === 'film' ? .5 : kind === 'scar' ? .55 : .75, roughness: kind === 'film' ? .05 : .55,
      metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'ground-decals-' + kind;
    mesh.renderOrder = 1;
    root.add(mesh);
  }
}

// Debris drifted against things the way real sediment collects: around obstacle bases, in a
// ring just outside each node's clear zone, and along the foot of the walls.
function edgeDebris(root, random, place, area) {
  const [texture, base] = (DECALS[area] ?? DECALS.artery).debris;
  const material = bioMaterial(texture, [1, 1], { color: base, roughness: .3, clearcoat: .8, clearcoatRoughness: .2 });
  const items = [];
  const add = (x, z, scale) => items.push({ x, y: place.floorHeight(x, z) - scale * .25, z, rx: random() * TAU, ry: random() * TAU,
    rz: random() * TAU, sx: scale, sy: scale * (.5 + random() * .4), sz: scale * (.7 + random() * .5), color: tint(random, 1.05, .35) });
  for (const [x, z, radius] of place.obstacles) {
    const count = Math.round(radius * 16);
    for (let i = 0; i < count; i++) {
      const a = random() * TAU, r = radius + .15 + Math.pow(random(), 2) * 1.8;
      add(x + Math.cos(a) * r, z + Math.sin(a) * r, .08 + Math.pow(random(), 2) * .32 * (1 - (r - radius) / 2.2));
    }
  }
  for (const node of place.nodes) {
    for (let i = 0; i < 40; i++) {
      const a = random() * TAU, r = 4.7 + Math.pow(random(), 1.5) * 2.4;
      add(node.x + Math.cos(a) * r, node.z + Math.sin(a) * r, .06 + random() * .16);
    }
  }
  for (let i = 0; i < 520; i++) {
    const [x, z] = place.rim(.88, .99);
    add(x, z, .1 + Math.pow(random(), 2) * .45);
  }
  return instanced(root, lumpySphere(0, .4, 71), material, items, { name: 'edge-debris', cell: 21 });
}

const DETAILS = { artery: bloodstream, junction: bloodstream, lungs, stomach, ear, lymph, brain, intestines, colon };

// Adds an arena's dressing to `root`. Returns a setQuality(high) function.
export function addLevelDetails(area, root, { random, time, nodes = [], obstacles = [], keepOff = [], floorHeight = () => 0 }) {
  if (!DECALS[area]) return () => {};
  const group = new THREE.Group();
  group.name = 'level-details-' + area;
  root.add(group);
  const place = placement(random, nodes, obstacles, floorHeight, keepOff);
  keepClear = (x, z) => place.clear(x, z, -.5);
  const quality = DETAILS[area]?.(group, random, place, time);
  groundDecals(group, random, place, area);
  const debris = edgeDebris(group, random, place, area);
  keepClear = () => true;
  return high => {
    if (typeof quality === 'function') quality(high);
    debris?.setFraction(high ? 1 : .5);
  };
}
