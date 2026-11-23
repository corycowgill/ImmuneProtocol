import * as THREE from './vendor/three.module.js';
import { chunkInstances, flowPatches } from './decor-chunks.mjs';
import { ARENA_GROWTH } from './arena-scale.mjs';

// Half-extents of the playable floor, for scenery scattered across or around it.
const FLOOR_X = 42 * ARENA_GROWTH;
const FLOOR_Z = 59 * ARENA_GROWTH;
import { bioTexture } from './bio-textures.mjs';
import { addLevelDetails } from './level-details.mjs';

// Large-scale set dressing and ambient VFX for every arena: blood-cell rivers and a pumping valve
// gate in the bloodstream, patrolling white blood cells, the villus forest of the small intestine,
// the microbiome of the colon, the macrophage of the lymph node and the firing neural web.
// Nothing here changes gameplay except the macrophage, which mirrors the lymph-node hazard.

const TAU = Math.PI * 2;

export function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Photographic-style maps for the organ shells (floor, wall, canopy).
export function bioSurface(name) {
  return { map: bioTexture(name), normalMap: bioTexture(name, [1, 1], true), roughnessMap: null };
}

export function bioMaterial(name, repeat, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    map: bioTexture(name, repeat), normalMap: bioTexture(name, repeat, true),
    normalScale: new THREE.Vector2(.8, .8), roughness: .42, clearcoat: .6, clearcoatRoughness: .25,
    ...options,
  });
}

// Bends geometry with height (local y >= 0) so instanced fingers, rods and fronds sway in the current.
export function addSway(material, time, amount, speed, key) {
  material.onBeforeCompile = shader => {
    shader.uniforms.swayTime = time;
    shader.vertexShader = 'uniform float swayTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 swayRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 swayRoot = vec3(0.0);
      #endif
      float swayPhase = swayRoot.x * 0.27 + swayRoot.z * 0.19;
      float swayHeight = max(position.y, 0.0);
      float swayBend = swayHeight * swayHeight * ${amount.toFixed(4)};
      transformed.x += sin(swayTime * ${speed.toFixed(3)} + swayPhase) * swayBend;
      transformed.z += cos(swayTime * ${(speed * .77).toFixed(3)} + swayPhase * 1.3) * swayBend * 0.7;`);
  };
  material.customProgramCacheKey = () => 'sway-' + key;
  return material;
}

// Soft-body wobble with a pseudopod that stretches toward `reach` (object space).
export function addMembrane(material, time, reach, key) {
  material.onBeforeCompile = shader => {
    shader.uniforms.blobTime = time;
    shader.uniforms.blobReach = reach;
    shader.vertexShader = 'uniform float blobTime;\nuniform vec4 blobReach;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 blobDir = normalize(position);
      float blobWave = sin(position.x * 3.1 + blobTime * 1.7) * sin(position.z * 2.7 - blobTime * 1.3)
        + 0.6 * sin(position.y * 4.3 + blobTime * 2.3);
      float blobFoot = pow(max(dot(blobDir, normalize(blobReach.xyz)), 0.0), 5.0);
      transformed += blobDir * (blobWave * 0.055 + blobFoot * blobReach.w);
      transformed.y *= 1.0 - 0.06 * sin(blobTime * 0.9);`);
  };
  material.customProgramCacheKey = () => 'membrane-' + key;
  return material;
}

export function lumpySphere(detail, strength, seed) {
  // A UV sphere (not an icosphere) so tiled textures wrap without a zig-zag seam.
  const segments = 8 * (detail + 1);
  const geometry = new THREE.SphereGeometry(1, segments * 2, segments);
  const p = geometry.attributes.position;
  const random = seeded(seed);
  const waves = Array.from({ length: 6 }, () => [random() * 4 + 1, random() * 4 + 1, random() * 4 + 1, random() * TAU]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let bump = 0;
    for (const [a, b, c, phase] of waves) bump += Math.sin(x * a + y * b + z * c + phase) / waves.length;
    const scale = 1 + bump * strength;
    p.setXYZ(i, x * scale, y * scale, z * scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function fingerGeometry(rows = 20, radial = 20) {
  // Unit-height villus: flared foot, slightly knobbly shaft, rounded tip. Height runs along +y.
  const profile = [];
  for (let i = 0; i <= rows; i++) {
    // Rings bunch up toward the tip so even low-poly fingers end in a rounded cap.
    const y = 1 - (1 - i / rows) ** 1.7;
    const radius = .5 + .28 * Math.exp(-y * 14) + .035 * Math.sin(y * 19);
    profile.push(new THREE.Vector2(radius * (y > .86 ? Math.sqrt(Math.max(0, 1 - ((y - .86) / .14) ** 2)) : 1), y));
  }
  profile.push(new THREE.Vector2(0, 1));
  return new THREE.LatheGeometry(profile, radial);
}

// The rivers carry hundreds of cells overhead and beyond the walls, each a few pixels wide, so
// the biconcave disc keeps its silhouette with a coarse profile.
export function redCellGeometry() {
  const profile = [[0, -.085], [.4, -.125], [.74, -.215], [.97, -.11], [1, 0],
    [.97, .11], [.74, .215], [.4, .125], [0, .085]];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 14);
}

export function mergeGeometries(parts) {
  const arrays = parts.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = arrays[0].attributes[name].itemSize;
    const total = arrays.reduce((sum, geometry) => sum + geometry.attributes[name].array.length, 0);
    const data = new Float32Array(total);
    let offset = 0;
    for (const geometry of arrays) {
      data.set(geometry.attributes[name].array, offset);
      offset += geometry.attributes[name].array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  for (const geometry of new Set([...parts, ...arrays])) geometry.dispose();
  return merged;
}

export function tube(points, radius, segments = 24, radial = 7) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))),
    segments, radius, radial, false);
}

// Tube whose radius tapers from r0 at the start to r1 at the end, like a dendrite or a villus.
export function taperedTube(points, r0, r1, segments = 30, radial = 9) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => Array.isArray(point) ? new THREE.Vector3(...point) : point));
  const geometry = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const position = geometry.attributes.position;
  const center = new THREE.Vector3();
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments;
    curve.getPointAt(t, center);
    const radius = THREE.MathUtils.lerp(r0, r1, t ** .8);
    for (let k = 0; k <= radial; k++) {
      const i = ring * (radial + 1) + k;
      position.setXYZ(i, center.x + (position.getX(i) - center.x) * radius, center.y + (position.getY(i) - center.y) * radius,
        center.z + (position.getZ(i) - center.z) * radius);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function glowSprite(map, color, scale, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

// Sampled spline so hundreds of cells can be placed each frame without arc-length searches.
function sampledPath(points, closed = false, samples = 256) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), closed);
  const frames = curve.computeFrenetFrames(samples, closed);
  const positions = curve.getSpacedPoints(samples);
  return { positions, tangents: frames.tangents, normals: frames.normals, binormals: frames.binormals, samples, closed };
}

const tempA = new THREE.Vector3();
const tempB = new THREE.Vector3();
const tempQ = new THREE.Quaternion();
const tempE = new THREE.Euler();
const tempM = new THREE.Matrix4();
const tempS = new THREE.Vector3();

function samplePath(path, t, out, tangent) {
  const f = (path.closed ? ((t % 1) + 1) % 1 : THREE.MathUtils.clamp(t, 0, 1)) * path.samples;
  const i = Math.min(path.samples - 1, Math.floor(f));
  const k = f - i;
  out.lerpVectors(path.positions[i], path.positions[i + 1], k);
  if (tangent) tangent.copy(path.tangents[i]);
  return i;
}

// ---------------------------------------------------------------- bloodstream

function bloodRiver(root, rivers, count, time, random) {
  const material = bioMaterial('red-cell', [1, 1], {
    color: 0xffffff, roughness: .34, clearcoat: .55, clearcoatRoughness: .3, sheen: .7, sheenColor: 0xff9c8a,
    sheenRoughness: .45, emissive: 0x3a0306, emissiveIntensity: .35,
  });
  // Each river is cut into stretches with their own bounds, so the stretches behind the camera
  // are skipped. Cells are dealt back into the stretch they are passing through every frame.
  const STRETCHES = 6;
  const bounds = [];
  for (const flow of rivers) {
    flow.patch = bounds.length;
    const { positions, samples } = flow.path;
    for (let stretch = 0; stretch < STRETCHES; stretch++) {
      const from = Math.floor(stretch / STRETCHES * samples);
      const to = Math.ceil((stretch + 1) / STRETCHES * samples);
      const sphere = new THREE.Sphere().setFromPoints(positions.slice(from, to + 1));
      // Room for the eddies that swing cells off the stream line, and for the cells themselves.
      sphere.radius += flow.radius * 1.2 + flow.cell * 1.6;
      bounds.push(sphere);
    }
  }
  const cells = flowPatches(root, redCellGeometry(), material, bounds, count);
  const totalWeight = rivers.reduce((sum, river) => sum + river.share, 0);
  const state = [];
  let riverIndex = 0;
  let quota = 0;
  for (let i = 0; i < count; i++) {
    while (i >= quota + Math.round(rivers[riverIndex].share / totalWeight * count) && riverIndex < rivers.length - 1) {
      quota += Math.round(rivers[riverIndex].share / totalWeight * count);
      riverIndex++;
    }
    const river = rivers[riverIndex];
    const radius = Math.sqrt(random()) * river.radius;
    const angle = random() * TAU;
    const size = river.cell * (.75 + random() * .5);
    state.push({
      river, t: random(), speed: (.7 + random() * .6) * river.speed / river.length,
      radius, angle, size, spin: (random() - .5) * 3, tumble: random() * TAU, wobble: random() * TAU,
    });
    const tint = .82 + random() * .18;
    state[i].color = new THREE.Color(tint, tint * (.86 + random() * .1), tint * (.88 + random() * .1));
  }
  const position = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  return (dt, pulse, visible) => {
    cells.begin();
    for (let i = 0; i < visible; i++) {
      const cell = state[i];
      const { river } = cell;
      cell.t += cell.speed * dt * pulse;
      if (!river.path.closed && cell.t > 1) cell.t -= 1;
      const index = samplePath(river.path, cell.t, position, tangent);
      const normal = river.path.normals[index];
      const binormal = river.path.binormals[index];
      // Turbulent eddies: each cell orbits its stream line and drifts across it.
      const swirl = cell.angle + time.value * (.7 + cell.spin * .2) + Math.sin(time.value * 1.3 + cell.wobble) * .6;
      const r = cell.radius * (1 + .18 * Math.sin(time.value * 2.1 + cell.wobble));
      position.addScaledVector(normal, Math.cos(swirl) * r).addScaledVector(binormal, Math.sin(swirl) * r);
      cell.tumble += cell.spin * dt * (.5 + pulse * .5);
      tempE.set(cell.tumble, cell.wobble + cell.tumble * .4, cell.tumble * .7);
      tempQ.setFromEuler(tempE);
      // Squash slightly along the flow: the cells are deformable.
      const squish = 1 + .12 * Math.sin(time.value * 3 + cell.wobble);
      tempS.set(cell.size * squish, cell.size * 1.05, cell.size / squish);
      tempM.compose(position, tempQ, tempS);
      const stretch = Math.min(STRETCHES - 1, Math.max(0, Math.floor(cell.t * STRETCHES)));
      cells.push(river.patch + stretch, tempM, cell.color);
    }
    cells.end();
  };
}

function plasmaHaze(root, river, glow, color, count, random) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    map: glow, color, size: .5, transparent: true, opacity: .42, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  root.add(points);
  const motes = Array.from({ length: count }, () => ({ t: random(), r: Math.sqrt(random()) * river.radius * 1.2, a: random() * TAU }));
  const position = new THREE.Vector3();
  return (dt, pulse) => {
    for (let i = 0; i < count; i++) {
      const mote = motes[i];
      mote.t = (mote.t + dt * pulse * river.speed * 1.4 / river.length) % 1;
      const index = samplePath(river.path, mote.t, position);
      position.addScaledVector(river.path.normals[index], Math.cos(mote.a) * mote.r)
        .addScaledVector(river.path.binormals[index], Math.sin(mote.a) * mote.r);
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
    }
    geometry.attributes.position.needsUpdate = true;
  };
}

function pathLength(path) {
  let length = 0;
  for (let i = 0; i < path.samples; i++) length += path.positions[i].distanceTo(path.positions[i + 1]);
  return length;
}

// River courses are written at the authored arena size.
const spread = points => points.map(([x, y, z]) => [x * ARENA_GROWTH, y, z * ARENA_GROWTH]);

function river(points, radius, speed, cell, share, closed = false) {
  const path = sampledPath(points, closed);
  return { path, radius, speed, cell, share, length: pathLength(path) };
}

// Translucent lumen wall so each river reads as a vessel, not floating cells.
function vesselSheath(root, flow, color) {
  const curve = new THREE.CatmullRomCurve3(flow.path.positions, flow.path.closed);
  const material = bioMaterial('red-cell', [8, 1], {
    color, transparent: true, opacity: .26, roughness: .2, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
    emissive: 0x5a0a10, emissiveIntensity: .3,
  });
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, flow.radius * 1.35, 18, flow.path.closed), material);
  mesh.renderOrder = 2;
  root.add(mesh);
  return mesh;
}

// A tricuspid gate that slams open and shut with the heartbeat and feeds the overhead river.
function valveGate(root, glow, position, radius, facing) {
  const gate = new THREE.Group();
  gate.position.set(...position);
  gate.rotation.y = facing;
  root.add(gate);
  const muscle = bioMaterial('mucosa', [6, 1], { color: 0xb05a5c, roughness: .5, clearcoat: .7, sheen: .5, sheenColor: 0xff9a8c });
  const leafletSkin = bioMaterial('leukocyte', [2, 2], {
    color: 0xf0b8b0, roughness: .36, clearcoat: .9, side: THREE.DoubleSide, transparent: true, opacity: .9,
    sheen: .8, sheenColor: 0xffe0d8, emissive: 0x4a0d10, emissiveIntensity: .2,
  });
  const annulus = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * .17, 20, 72), muscle);
  gate.add(annulus);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.22, radius * .26, 20, 72), muscle);
  outer.position.z = -radius * .25;
  gate.add(outer);
  const leaflets = [];
  for (let k = 0; k < 3; k++) {
    const center = k * TAU / 3 + Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(center) * radius, Math.sin(center) * radius, 0);
    gate.add(pivot);
    const rows = 14, columns = 18;
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let row = 0; row <= rows; row++) {
      const u = row / rows;
      for (let column = 0; column <= columns; column++) {
        const v = column / columns;
        const angle = center + (v - .5) * TAU / 3;
        const rim = [Math.cos(angle) * radius, Math.sin(angle) * radius];
        const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * radius * .32;
        positions.push(rim[0] * (1 - u) - pivot.position.x, rim[1] * (1 - u) - pivot.position.y, -belly);
        uvs.push(v, u);
        if (row && column) {
          const a = row * (columns + 1) + column;
          indices.push(a - columns - 2, a - columns - 1, a - 1, a - columns - 1, a, a - 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const leaflet = new THREE.Mesh(geometry, leafletSkin);
    pivot.add(leaflet);
    leaflets.push({ pivot, axis: new THREE.Vector3(-Math.sin(center), Math.cos(center), 0) });
  }
  const chords = [];
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * TAU;
    const start = [Math.cos(angle) * radius * .96, Math.sin(angle) * radius * .96, -.2];
    chords.push(tube([start, [start[0] * 1.15, start[1] * 1.15 - 1, -radius * .5], [start[0] * 1.3, -radius * 1.1, -radius * .9]], .07, 16, 5));
  }
  gate.add(new THREE.Mesh(mergeGeometries(chords), muscle));
  const light = new THREE.PointLight(0xff5a48, 0, radius * 6, 2);
  light.position.set(0, 0, -radius * .8);
  gate.add(light);
  const haze = glowSprite(glow, 0xff6a50, radius * 3.4, 0);
  haze.position.z = -radius * .5;
  gate.add(haze);
  return openness => {
    for (const { pivot, axis } of leaflets) pivot.quaternion.setFromAxisAngle(axis, -openness * 1.2);
    light.intensity = 40 + openness * 260;
    haze.material.opacity = .08 + openness * .3;
  };
}

// ---------------------------------------------------------------- immune cells

function makeLeukocyte(root, glow, radius, time, key, palette = {}) {
  const group = new THREE.Group();
  root.add(group);
  const reach = { value: new THREE.Vector4(1, 0, 0, .25) };
  const body = new THREE.Mesh(lumpySphere(5, .09, key.length * 97 + radius * 13), addMembrane(bioMaterial('leukocyte', [3, 2], {
    color: palette.body ?? 0xf3ece6, roughness: .36, clearcoat: .55, clearcoatRoughness: .4, sheen: 1, sheenColor: 0xffffff,
    transparent: true, opacity: palette.opacity ?? .74, emissive: palette.emissive ?? 0x2a2440, emissiveIntensity: .25,
  }), time, reach, key));
  body.scale.set(radius, radius * .82, radius);
  body.renderOrder = 3;
  group.add(body);
  // Multi-lobed nucleus and granules show through the translucent membrane.
  const nucleusSkin = bioMaterial('neural', [1, 1], { color: palette.nucleus ?? 0x8a5cb0, roughness: .55, clearcoat: .3,
    emissive: palette.nucleusGlow ?? 0x3a1860, emissiveIntensity: .45 });
  const lobes = palette.lobes ?? 3;
  for (let i = 0; i < lobes; i++) {
    const lobe = new THREE.Mesh(lumpySphere(3, .12, 31 + i * 7), nucleusSkin);
    const angle = i / lobes * TAU;
    lobe.position.set(Math.cos(angle) * radius * .24, radius * .05 * (i - 1), Math.sin(angle) * radius * .2);
    lobe.scale.setScalar(radius * (lobes === 1 ? .42 : .27));
    group.add(lobe);
  }
  const granuleGeometry = new THREE.BufferGeometry();
  const granules = new Float32Array(160 * 3);
  const random = seeded(radius * 1000 + key.length);
  for (let i = 0; i < 160; i++) {
    const direction = new THREE.Vector3(random() - .5, random() - .5, random() - .5).normalize().multiplyScalar(radius * (.3 + random() * .5));
    direction.toArray(granules, i * 3);
  }
  granuleGeometry.setAttribute('position', new THREE.BufferAttribute(granules, 3));
  group.add(new THREE.Points(granuleGeometry, new THREE.PointsMaterial({
    map: glow, color: palette.granules ?? 0xffd2f0, size: radius * .09, transparent: true, opacity: .7,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  const aura = glowSprite(glow, palette.aura ?? 0xcfe0ff, radius * 3.2, .05);
  group.add(aura);
  return { group, body, reach, aura };
}

function bacteriumMaterial(color) {
  return bioMaterial('biofilm', [1, 2], { color, roughness: .3, clearcoat: .9, emissive: 0x1a2a08, emissiveIntensity: .2 });
}

// Neutrophils roam the outer ring of the arena, chase stray bacteria and swallow them whole.
function immunePatrol(root, glow, time, count, random, ring) {
  const patrols = [];
  const prey = new THREE.CapsuleGeometry(.32, 1.3, 6, 12);
  for (let i = 0; i < count; i++) {
    const radius = 3.1 + random() * 1.1;
    const cell = makeLeukocyte(root, glow, radius, time, 'patrol');
    const bug = new THREE.Mesh(prey, bacteriumMaterial([0x9ccf54, 0xd6b24a, 0x7fc0a0][i % 3]));
    root.add(bug);
    const angle = i / count * TAU + random();
    const patrol = { cell, bug, radius, angle, x: 0, z: 0, preyX: 0, preyZ: 0, preyAngle: 0, eating: 0, wander: random() * TAU };
    placeOnRing(patrol, ring, angle, random);
    patrol.x = patrol.preyX - Math.cos(patrol.preyAngle) * 12;
    patrol.z = patrol.preyZ - Math.sin(patrol.preyAngle) * 12;
    patrols.push(patrol);
  }
  return (dt, floorHeight) => {
    for (const patrol of patrols) {
      const { cell, bug, radius } = patrol;
      const dx = patrol.preyX - patrol.x;
      const dz = patrol.preyZ - patrol.z;
      const distance = Math.hypot(dx, dz);
      if (patrol.eating > 0) {
        patrol.eating -= dt;
        const k = Math.max(0, patrol.eating / 1.8);
        bug.scale.setScalar(k);
        bug.position.lerp(tempA.set(patrol.x, floorHeight(patrol.x, patrol.z) + radius * .8, patrol.z), dt * 2.5);
        if (patrol.eating <= 0) placeOnRing(patrol, ring, patrol.angle + 1.4 + Math.random() * 2, Math.random);
      } else {
        const speed = 2.4;
        if (distance > radius * .7) {
          patrol.x += dx / distance * speed * dt;
          patrol.z += dz / distance * speed * dt;
        } else patrol.eating = 1.8;
        // The bacterium tries to swim away.
        patrol.wander += dt * 1.7;
        patrol.preyX += Math.cos(patrol.wander) * dt * .8;
        patrol.preyZ += Math.sin(patrol.wander * .8) * dt * .8;
        bug.scale.setScalar(1);
        bug.position.set(patrol.preyX, floorHeight(patrol.preyX, patrol.preyZ) + 1.2 + Math.sin(time.value * 3 + patrol.wander) * .3, patrol.preyZ);
        bug.rotation.set(Math.PI / 2, 0, Math.atan2(dz, dx) + Math.sin(time.value * 6) * .3);
      }
      cell.group.position.set(patrol.x, floorHeight(patrol.x, patrol.z) + radius * .78, patrol.z);
      tempB.set(dx, 0, dz).normalize();
      cell.reach.value.set(tempB.x, -.1, tempB.z, patrol.eating > 0 ? .1 : .32);
    }
  };
}

function placeOnRing(patrol, ring, angle, random) {
  patrol.angle = angle;
  const scale = ring[0] + random() * (ring[1] - ring[0]);
  patrol.preyX = Math.cos(angle) * FLOOR_X * scale;
  patrol.preyZ = Math.sin(angle) * FLOOR_Z * scale;
  patrol.preyAngle = angle + Math.PI / 2;
}

// ---------------------------------------------------------------- small intestine

function villusForest(root, time, random, nodes, obstacles) {
  const geometry = fingerGeometry(16, 14);
  const tall = addSway(bioMaterial('mucosa', [2, 7], {
    color: 0xffd9d0, roughness: .46, clearcoat: .55, sheen: .7, sheenColor: 0xffc2b8, emissive: 0x3a0a10, emissiveIntensity: .18,
  }), time, .022, .8, 'villus-tall');
  const grass = addSway(bioMaterial('mucosa', [1, 2], {
    color: 0xffe0da, roughness: .42, clearcoat: .6, sheen: .9, sheenColor: 0xffd0c8, emissive: 0x401018, emissiveIntensity: .25,
  }), time, .09, 1.3, 'villus-grass');
  const placements = [];
  for (const [x, z, size] of obstacles) {
    const count = Math.round(size * 3.2);
    for (let i = 0; i < count; i++) {
      const angle = random() * TAU;
      const r = Math.sqrt(random()) * size * .85;
      placements.push([x + Math.cos(angle) * r, z + Math.sin(angle) * r, .7 + random() * .6, 8 + (1 - r / size) * 9 + random() * 4]);
    }
  }
  for (let i = 0; i < 300; i++) {
    const angle = random() * TAU;
    const scale = 1.0 + random() * .16;
    placements.push([Math.cos(angle) * FLOOR_X * scale, Math.sin(angle) * FLOOR_Z * scale, .8 + random() * .7, 7 + random() * 11]);
  }
  const forest = new THREE.InstancedMesh(geometry, tall, placements.length);
  placements.forEach(([x, z, width, height], index) => {
    tempE.set((random() - .5) * .12, random() * TAU, (random() - .5) * .12);
    tempM.compose(tempA.set(x, -.3, z), tempQ.setFromEuler(tempE), tempS.set(width, height, width));
    forest.setMatrixAt(index, tempM);
    const tint = .8 + random() * .2;
    forest.setColorAt(index, new THREE.Color(tint, tint * (.86 + random() * .1), tint * (.88 + random() * .1)));
  });
  root.add(forest);
  chunkInstances(forest);
  const grassCount = 2600;
  const meadow = new THREE.InstancedMesh(fingerGeometry(6, 7), grass, grassCount);
  for (let i = 0; i < grassCount; i++) {
    let x, z;
    do {
      const angle = random() * TAU;
      const r = Math.sqrt(random()) * .98;
      x = Math.cos(angle) * FLOOR_X * r;
      z = Math.sin(angle) * FLOOR_Z * r;
    } while (nodes.some(node => Math.hypot(node.x - x, node.z - z) < 4.2));
    const height = .35 + random() ** 2 * 1.2;
    const width = .16 + random() * .16;
    tempE.set((random() - .5) * .3, random() * TAU, (random() - .5) * .3);
    tempM.compose(tempA.set(x, -.05, z), tempQ.setFromEuler(tempE), tempS.set(width, height, width));
    meadow.setMatrixAt(i, tempM);
    const tint = .8 + random() * .2;
    meadow.setColorAt(i, new THREE.Color(tint, tint * .9, tint * .9));
  }
  root.add(meadow);
  const patches = chunkInstances(meadow, { cell: 21 });
  return quality => patches.setFraction(quality ? 1 : 800 / grassCount);
}

// Nutrient motes drift down and are drawn into the nearest villus tips.
function nutrientDrift(root, glow, count, random, color) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    map: glow, color, size: .22, transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  root.add(points);
  const motes = Array.from({ length: count }, () => ({
    x: (random() - .5) * 2 * FLOOR_X, y: random() * 16, z: (random() - .5) * 2 * FLOOR_Z, vy: -.3 - random() * .6, phase: random() * TAU,
  }));
  return (dt, timeValue, pull = 0) => {
    for (let i = 0; i < count; i++) {
      const mote = motes[i];
      mote.y += mote.vy * dt;
      mote.x += Math.sin(timeValue * .6 + mote.phase) * dt * .5 + Math.sign(mote.x) * pull * dt;
      mote.z += Math.cos(timeValue * .5 + mote.phase) * dt * .5;
      if (mote.y < 0 || Math.abs(mote.x) > FLOOR_X + 6) {
        mote.y = 12 + Math.random() * 6;
        mote.x = (Math.random() - .5) * 2 * FLOOR_X;
        mote.z = (Math.random() - .5) * 2 * FLOOR_Z;
      }
      positions[i * 3] = mote.x;
      positions[i * 3 + 1] = mote.y;
      positions[i * 3 + 2] = mote.z;
    }
    geometry.attributes.position.needsUpdate = true;
  };
}

// ---------------------------------------------------------------- large intestine microbiome

function microbiome(root, time, random, nodes, obstacles, glow) {
  const palettes = [0x9fd15a, 0xe2b04c, 0xb98ad6, 0x6fc2b0, 0xd9785a];
  const colonies = [];
  for (const [x, z, size] of obstacles) colonies.push([x, z, size * 1.1, true]);
  while (colonies.length < 26) {
    const angle = random() * TAU;
    const r = .25 + random() * .75;
    const x = Math.cos(angle) * (FLOOR_X - 2) * r;
    const z = Math.sin(angle) * (FLOOR_Z - 2) * r;
    if (nodes.some(node => Math.hypot(node.x - x, node.z - z) < 7)) continue;
    colonies.push([x, z, 1.4 + random() * 2.2, false]);
  }
  // Biofilm mounds anchor the obstacle positions.
  const mound = bioMaterial('biofilm', [7, 4], { color: 0xd8c69a, roughness: .26, clearcoat: 1, clearcoatRoughness: .12,
    emissive: 0x1a1404, emissiveIntensity: .2, normalScale: new THREE.Vector2(.45, .45) });
  for (const [x, z, size, solid] of colonies) {
    if (!solid) continue;
    const blob = new THREE.Mesh(lumpySphere(4, .22, Math.round(x * 31 + z)), mound);
    blob.scale.set(size, size * .62, size * .95);
    blob.position.set(x, size * .05, z);
    root.add(blob);
  }
  const rods = new THREE.CapsuleGeometry(.16, .62, 2, 7);
  rods.translate(0, .47, 0);
  const rodMaterial = addSway(bioMaterial('biofilm', [1, 1], { color: 0xffffff, roughness: .32, clearcoat: 1,
    clearcoatRoughness: .12, sheen: .6, sheenColor: 0xfff4d8, normalScale: new THREE.Vector2(.4, .4) }), time, .5, 4.2, 'rods');
  const rodCount = 3200;
  const bacteria = new THREE.InstancedMesh(rods, rodMaterial, rodCount);
  const color = new THREE.Color();
  for (let i = 0; i < rodCount; i++) {
    const [x, z, size, solid] = colonies[i % colonies.length];
    const angle = random() * TAU;
    const r = Math.sqrt(random()) * size;
    const px = x + Math.cos(angle) * r;
    const pz = z + Math.sin(angle) * r;
    const height = solid ? Math.max(0, size * .58 * Math.sqrt(Math.max(0, 1 - (r / size) ** 2))) : 0;
    tempE.set((random() - .5) * 1.4, random() * TAU, (random() - .5) * 1.4);
    const s = .3 + random() * .35;
    tempM.compose(tempA.set(px, height, pz), tempQ.setFromEuler(tempE), tempS.set(s, s * (.8 + random() * .6), s));
    bacteria.setMatrixAt(i, tempM);
    color.setHex(palettes[(i % colonies.length) % palettes.length]).multiplyScalar(.75 + random() * .35);
    bacteria.setColorAt(i, color);
  }
  root.add(bacteria);
  chunkInstances(bacteria, { cell: 21 });
  // Streptococcus chains draped over the floor.
  const cocci = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 9, 6), bioMaterial('leukocyte', [1, 1], {
    color: 0xd9c4e8, roughness: .3, clearcoat: 1, sheen: .5, sheenColor: 0xffffff }), 640);
  for (let chain = 0; chain < 40; chain++) {
    let x = (random() - .5) * 1.8 * FLOOR_X;
    let z = (random() - .5) * 1.76 * FLOOR_Z;
    let heading = random() * TAU;
    for (let link = 0; link < 16; link++) {
      heading += (random() - .5) * .7;
      x += Math.cos(heading) * .23;
      z += Math.sin(heading) * .23;
      tempM.compose(tempA.set(x, .1, z), tempQ.identity(), tempS.set(1, .92, 1));
      cocci.setMatrixAt(chain * 16 + link, tempM);
      cocci.setColorAt(chain * 16 + link, color.setHSL(.72 + random() * .1, .35, .62 + random() * .15));
    }
  }
  root.add(cocci);
  chunkInstances(cocci);
  // Spirilla corkscrew through the air.
  const spirals = [];
  const spiralSkin = new THREE.MeshPhysicalMaterial({ color: 0xc9e08a, roughness: .3, clearcoat: 1,
    emissive: 0x3c5212, emissiveIntensity: .35 });
  for (let i = 0; i < 26; i++) {
    const points = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      points.push([Math.cos(t * TAU * 3) * .35, (t - .5) * 4, Math.sin(t * TAU * 3) * .35]);
    }
    const spiral = new THREE.Mesh(tube(points, .09, 80, 6), spiralSkin);
    spiral.position.set((random() - .5) * 1.76 * FLOOR_X, 3 + random() * 9, (random() - .5) * 1.7 * FLOOR_Z);
    spiral.rotation.set(random() * TAU, random() * TAU, 0);
    root.add(spiral);
    spirals.push({ spiral, speed: 2 + random() * 3, drift: random() * TAU });
  }
  // Undigested fibre: tangled cellulose strands.
  const fibres = [];
  for (let i = 0; i < 30; i++) {
    const start = [(random() - .5) * 1.9 * FLOOR_X, .2 + random() * .5, (random() - .5) * 1.86 * FLOOR_Z];
    if (nodes.some(node => Math.hypot(node.x - start[0], node.z - start[2]) < 6)) continue;
    const points = [start];
    for (let k = 0; k < 5; k++) {
      const last = points[points.length - 1];
      points.push([last[0] + (random() - .5) * 5, .2 + random() * 1.4, last[2] + (random() - .5) * 5]);
    }
    fibres.push(tube(points, .12 + random() * .1, 30, 6));
  }
  root.add(new THREE.Mesh(mergeGeometries(fibres), bioMaterial('neural', [6, 1], { color: 0xe8d28a, roughness: .55 })));
  // Fermentation gas and the water being pulled out through the walls.
  const bubbleCount = 160;
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshPhysicalMaterial({
    color: 0xe6f2d0, roughness: .05, clearcoat: 1, transparent: true, opacity: .28, depthWrite: false,
    emissive: 0x2a3a10, emissiveIntensity: .3, side: THREE.DoubleSide }), bubbleCount);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbles.frustumCulled = false;
  bubbles.renderOrder = 4;
  root.add(bubbles);
  const bubbleState = Array.from({ length: bubbleCount }, () => {
    const [x, z, size] = colonies[Math.floor(random() * colonies.length)];
    return { x: x + (random() - .5) * size, z: z + (random() - .5) * size, y: random() * 16, r: .12 + random() ** 2 * .7, speed: .8 + random() * 1.6 };
  });
  const water = new THREE.BufferGeometry();
  const waterCount = 700;
  const waterPositions = new Float32Array(waterCount * 3);
  water.setAttribute('position', new THREE.BufferAttribute(waterPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const waterPoints = new THREE.Points(water, new THREE.PointsMaterial({ map: glow, color: 0x9fd6ff, size: .18,
    transparent: true, opacity: .6, depthWrite: false, blending: THREE.AdditiveBlending }));
  waterPoints.frustumCulled = false;
  root.add(waterPoints);
  const droplets = Array.from({ length: waterCount }, () => ({ a: random() * TAU, r: random(), y: .3 + random() * 10 }));
  return (dt, timeValue, pressure) => {
    for (const { spiral, speed, drift } of spirals) {
      spiral.rotateY(speed * dt);
      spiral.position.y += Math.sin(timeValue * .5 + drift) * dt * .3;
    }
    for (let i = 0; i < bubbleCount; i++) {
      const bubble = bubbleState[i];
      bubble.y += bubble.speed * dt * (1 + pressure * 2.5);
      if (bubble.y > 18) bubble.y = 0;
      const wobble = Math.sin(timeValue * 3 + i) * .1;
      tempM.compose(tempA.set(bubble.x + wobble, bubble.y, bubble.z), tempQ.identity(),
        tempS.set(bubble.r * (1 + wobble), bubble.r * (1 - wobble), bubble.r));
      bubbles.setMatrixAt(i, tempM);
    }
    bubbles.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < waterCount; i++) {
      const drop = droplets[i];
      drop.r += dt * (.05 + pressure * .12);
      if (drop.r > 1.12) drop.r = Math.random() * .3;
      waterPositions[i * 3] = Math.cos(drop.a) * (FLOOR_X + 4) * drop.r;
      waterPositions[i * 3 + 1] = drop.y + Math.sin(timeValue + i) * .2;
      waterPositions[i * 3 + 2] = Math.sin(drop.a) * (FLOOR_Z + 6) * drop.r;
    }
    water.attributes.position.needsUpdate = true;
  };
}

// ---------------------------------------------------------------- neural cortex

function neuralWeb(root, glow, time, random, nodes, obstacles) {
  const somas = [];
  for (let i = 0; i < 30; i++) {
    const angle = random() * TAU;
    const high = random() < .55;
    const scale = high ? .6 + random() * .35 : .98 + random() * .06;
    somas.push(new THREE.Vector3(Math.cos(angle) * (FLOOR_X + 2) * scale, high ? 9 + random() * 10 : 1.5 + random() * 5, Math.sin(angle) * (FLOOR_Z + 3) * scale));
  }
  const somaSkin = bioMaterial('neural', [2, 2], { color: 0xcdb6c9, roughness: .36, clearcoat: .8, sheen: .8,
    sheenColor: 0xead6f4, emissive: 0x3a1a5a, emissiveIntensity: .22 });
  // Pyramidal neurons stand at the obstacles: a soma on the floor, an apical dendrite climbing into the
  // web and basal dendrites rooting into the cortex.
  const neuronParts = [];
  for (const [x, z, size] of obstacles) {
    const soma = new THREE.Mesh(lumpySphere(3, .1, Math.round(x * 13 + z)), somaSkin);
    soma.position.set(x, size * .75, z);
    soma.scale.set(size * .7, size * 1.05, size * .7);
    root.add(soma);
    const top = new THREE.Vector3(x + (random() - .5) * 3, 19, z + (random() - .5) * 3);
    neuronParts.push(taperedTube([[x, size * 1.6, z], [x + .6, 7, z - .4], [x - .4, 13, z + .5], top], size * .42, .12, 40, 12));
    for (let branch = 0; branch < 5; branch++) {
      const y = 6 + branch * 2.6;
      const angle = random() * TAU;
      const reach = 4 + random() * 6;
      neuronParts.push(taperedTube([[x, y, z], [x + Math.cos(angle) * reach * .5, y + 1.5, z + Math.sin(angle) * reach * .5],
        [x + Math.cos(angle) * reach, y + 2 + random() * 3, z + Math.sin(angle) * reach]], .28, .04, 22, 7));
    }
    for (let root2 = 0; root2 < 6; root2++) {
      const angle = root2 / 6 * TAU + random() * .5;
      const reach = size * 2 + random() * 3;
      neuronParts.push(taperedTube([[x, size * .5, z], [x + Math.cos(angle) * size * 1.1, .3, z + Math.sin(angle) * size * 1.1],
        [x + Math.cos(angle) * reach, .05, z + Math.sin(angle) * reach]], size * .2, .03, 20, 7));
    }
    somas.push(new THREE.Vector3(x, size * .9, z), top);
  }
  if (neuronParts.length) root.add(new THREE.Mesh(mergeGeometries(neuronParts), somaSkin));
  const somaGlows = somas.map((position, index) => {
    if (index < 30) {
      const body = new THREE.Mesh(lumpySphere(2, .18, 400 + index), somaSkin);
      body.position.copy(position);
      body.scale.setScalar(.9 + random() * 1.3);
      root.add(body);
    }
    const halo = glowSprite(glow, index % 3 ? 0x9fc6ff : 0xd5a6ff, 6, .12);
    halo.position.copy(position);
    root.add(halo);
    return { halo, flash: 0 };
  });
  const fibres = [];
  const fibreParts = [];
  for (let a = 0; a < somas.length; a++) {
    const nearest = somas.map((point, b) => [point.distanceTo(somas[a]), b]).filter(([, b]) => b !== a)
      .sort((p, q) => p[0] - q[0]).slice(0, 3);
    for (const [, b] of nearest) {
      if (b < a && nearest.length) continue;
      const from = somas[a], to = somas[b];
      const mid = from.clone().lerp(to, .5);
      mid.y += 2 + random() * 4;
      mid.x += (random() - .5) * 6;
      mid.z += (random() - .5) * 6;
      const curve = new THREE.CatmullRomCurve3([from, from.clone().lerp(mid, .5).add(new THREE.Vector3(0, 1, 0)), mid, to]);
      fibres.push({ curve, from: a, to: b, length: curve.getLength() });
      fibreParts.push(taperedTube(curve.getPoints(12), .16 + random() * .08, .06, 36, 6));
    }
  }
  // Ground-level dendrites meander across the floor from the walls.
  const groundParts = [];
  for (let i = 0; i < 26; i++) {
    const angle = random() * TAU;
    const points = [new THREE.Vector3(Math.cos(angle) * (FLOOR_X + 4), .02, Math.sin(angle) * (FLOOR_Z + 5))];
    let heading = angle + Math.PI + (random() - .5) * .8;
    for (let k = 0; k < 6; k++) {
      heading += (random() - .5) * 1.1;
      const last = points[points.length - 1];
      points.push(new THREE.Vector3(last.x + Math.cos(heading) * 3.2, .06 + random() * .1, last.z + Math.sin(heading) * 3.2));
    }
    if (points.some(point => nodes.some(node => Math.hypot(node.x - point.x, node.z - point.z) < 4))) continue;
    const curve = new THREE.CatmullRomCurve3(points);
    fibres.push({ curve, from: -1, to: -1, length: curve.getLength() });
    groundParts.push(taperedTube(points, .16, .03, 48, 6));
  }
  if (groundParts.length) root.add(new THREE.Mesh(mergeGeometries(groundParts), somaSkin));
  const fibreMaterial = bioMaterial('neural', [20, 1], { color: 0xa892b4, roughness: .34, clearcoat: .9,
    emissive: 0x4a2a8a, emissiveIntensity: .3 });
  root.add(new THREE.Mesh(mergeGeometries(fibreParts), fibreMaterial));
  // Action potentials race along fibres and flash the soma they reach.
  const pulseCount = 180;
  const pulseGeometry = new THREE.BufferGeometry();
  const pulsePositions = new Float32Array(pulseCount * 3);
  const pulseColors = new Float32Array(pulseCount * 3);
  pulseGeometry.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3).setUsage(THREE.DynamicDrawUsage));
  pulseGeometry.setAttribute('color', new THREE.BufferAttribute(pulseColors, 3));
  const pulseMaterial = new THREE.PointsMaterial({ map: glow, vertexColors: true, size: 1.1, transparent: true,
    opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending });
  const pulsePoints = new THREE.Points(pulseGeometry, pulseMaterial);
  pulsePoints.frustumCulled = false;
  root.add(pulsePoints);
  const pulses = Array.from({ length: pulseCount }, (_, i) => {
    const tint = new THREE.Color(i % 4 === 0 ? 0xfff2a8 : i % 2 ? 0x9fd8ff : 0xe0a8ff);
    tint.toArray(pulseColors, i * 3);
    return { fibre: Math.floor(random() * fibres.length), t: random(), speed: 9 + random() * 10 };
  });
  // Arcs of electrical discharge between neighbouring somas.
  const arcs = Array.from({ length: 8 }, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending }));
    line.frustumCulled = false;
    root.add(line);
    return { line, life: 0 };
  });
  const point = new THREE.Vector3();
  return (dt, active) => {
    const rate = active ? 2.1 : 1;
    for (let i = 0; i < pulseCount; i++) {
      const pulse = pulses[i];
      const fibre = fibres[pulse.fibre];
      pulse.t += pulse.speed * rate * dt / fibre.length;
      if (pulse.t >= 1) {
        if (fibre.to >= 0) somaGlows[fibre.to].flash = 1;
        const next = fibres.map((item, index) => [item, index]).filter(([item]) => item.from === fibre.to && fibre.to >= 0);
        pulse.fibre = next.length ? next[Math.floor(Math.random() * next.length)][1] : Math.floor(Math.random() * fibres.length);
        pulse.t = 0;
      }
      fibres[pulse.fibre].curve.getPoint(pulse.t, point);
      point.toArray(pulsePositions, i * 3);
    }
    pulseGeometry.attributes.position.needsUpdate = true;
    for (const glowState of somaGlows) {
      glowState.flash = Math.max(0, glowState.flash - dt * 2.4);
      glowState.halo.material.opacity = .08 + glowState.flash * .5;
      const s = 5 + glowState.flash * 5;
      glowState.halo.scale.set(s, s, 1);
    }
    fibreMaterial.emissiveIntensity = (active ? .7 : .3) + Math.sin(time.value * 7) * .04;
    for (const arc of arcs) {
      arc.life -= dt;
      if (arc.life <= 0 && Math.random() < dt * (active ? 2.2 : .6)) {
        const a = somas[Math.floor(Math.random() * somas.length)];
        const b = somas.reduce((best, item) => item !== a && item.distanceTo(a) < best.distanceTo(a) ? item : best, somas[a === somas[0] ? 1 : 0]);
        const positions = arc.line.geometry.attributes.position;
        for (let k = 0; k < 14; k++) {
          point.lerpVectors(a, b, k / 13);
          const jitter = k === 0 || k === 13 ? 0 : 1.1;
          positions.setXYZ(k, point.x + (Math.random() - .5) * jitter, point.y + (Math.random() - .5) * jitter, point.z + (Math.random() - .5) * jitter);
        }
        positions.needsUpdate = true;
        arc.life = .18;
      }
      arc.line.material.opacity = Math.max(0, arc.life / .18) * .9;
    }
  };
}

// ---------------------------------------------------------------- lymph node macrophage

function macrophage(root, glow, time) {
  const cell = makeLeukocyte(root, glow, 5.2, time, 'macrophage', {
    body: 0xf0e6da, opacity: .8, emissive: 0x3a5a58, nucleus: 0x6b4ea0, lobes: 1, granules: 0xffe2a8, aura: 0xbff7e2,
  });
  // Phagocytic arms: ruffled pseudopods that reach for prey on every side.
  const arms = new THREE.Group();
  cell.group.add(arms);
  const armSkin = bioMaterial('leukocyte', [2, 1], { color: 0xe4d6c8, roughness: .4, clearcoat: .6, transparent: true,
    opacity: .7, sheen: 1, sheenColor: 0xffffff });
  for (let i = 0; i < 9; i++) {
    const angle = i / 9 * TAU;
    const arm = new THREE.Mesh(tube([[0, 0, 0], [Math.cos(angle) * 3, -1.8, Math.sin(angle) * 3],
      [Math.cos(angle + .2) * 6.4, -3.6, Math.sin(angle + .2) * 6.4]], .55, 20, 9), armSkin);
    arms.add(arm);
  }
  const light = new THREE.PointLight(0xbff7e2, 0, 18, 2);
  light.position.y = 2;
  cell.group.add(light);
  let x = 0, z = -26;
  return (dt, organ, floorHeight) => {
    if (organ) {
      x = THREE.MathUtils.damp(x, organ.x, organ.phase === 'recovery' ? .5 : 1.8, dt);
      z = THREE.MathUtils.damp(z, organ.z, organ.phase === 'recovery' ? .5 : 1.8, dt);
    }
    const active = organ?.phase === 'active';
    const warning = organ?.phase === 'warning';
    cell.group.position.set(x, floorHeight(x, z) + 4.4, z);
    arms.rotation.y += dt * (active ? .9 : .2);
    arms.scale.setScalar(active ? 1.12 + Math.sin(time.value * 4) * .05 : warning ? 1 : .8);
    cell.reach.value.set(Math.sin(time.value * .7), -.4, Math.cos(time.value * .7), active ? .5 : .2);
    light.intensity = active ? 160 : warning ? 60 + Math.sin(time.value * 9) * 40 : 20;
    cell.aura.material.opacity = active ? .22 : .07;
  };
}

// ---------------------------------------------------------------- obstacles in other organs

function organPillars(root, area, obstacles, random) {
  if (!obstacles.length) return;
  if (area === 'artery') {
    // Thrombi: dark clots of trapped red cells, bound in pale fibrin strands.
    const clot = bioMaterial('red-cell', [3, 2], { color: 0x8a1a1c, roughness: .3, clearcoat: 1, clearcoatRoughness: .14,
      emissive: 0x2a0406, emissiveIntensity: .3 });
    const cell = bioMaterial('red-cell', [1, 1], { color: 0xc23a36, roughness: .34, clearcoat: .7, sheen: .6, sheenColor: 0xff9c8a,
      emissive: 0x3a0306, emissiveIntensity: .3 });
    const fibrin = bioMaterial('neural', [1, 5], { color: 0xf0d2c0, roughness: .45, clearcoat: .5 });
    const disc = redCellGeometry();
    for (const [x, z, size] of obstacles) {
      const mound = new THREE.Mesh(lumpySphere(4, .24, Math.round(x * 5 + z * 3)), clot);
      mound.scale.set(size * .96, size * (.95 + random() * .5), size * .96);
      mound.position.set(x, -.3, z);
      mound.rotation.y = random() * TAU;
      root.add(mound);
      const height = mound.scale.y;
      const cells = [];
      for (let i = 0; i < 22; i++) {
        const angle = random() * TAU;
        const lift = random() ** .7;
        const ring = Math.sqrt(Math.max(0, 1 - lift * lift)) * size * .97;
        const piece = disc.clone();
        const scale = size * (.2 + random() * .14);
        tempE.set(random() * TAU, random() * TAU, random() * TAU);
        tempM.compose(tempA.set(x + Math.cos(angle) * ring, lift * height * .92 - .15, z + Math.sin(angle) * ring),
          tempQ.setFromEuler(tempE), tempS.set(scale, scale, scale));
        piece.applyMatrix4(tempM);
        cells.push(piece);
      }
      root.add(new THREE.Mesh(mergeGeometries(cells), cell));
      const strands = [];
      for (let i = 0; i < 8; i++) {
        const tilt = i / 8 * Math.PI + random() * .3;
        const points = [];
        for (let k = 0; k <= 10; k++) {
          const a = k / 10 * Math.PI;
          const along = Math.cos(a) * size * 1.12;
          points.push([x + along * Math.cos(tilt) + Math.sin(k * 2.1 + i) * .2, Math.sin(a) * height * 1.04 - .1,
            z + along * Math.sin(tilt) + Math.cos(k * 1.7 + i) * .2]);
        }
        strands.push(tube(points, .05 + random() * .04, 30, 5));
      }
      root.add(new THREE.Mesh(mergeGeometries(strands), fibrin));
    }
  } else if (area === 'lungs') {
    const skin = bioMaterial('leukocyte', [2, 2], { color: 0xffb8c2, roughness: .38, clearcoat: .85, sheen: .9, sheenColor: 0xffe6ec,
      emissive: 0x5a1a2a, emissiveIntensity: .25 });
    for (const [x, z, size] of obstacles) {
      for (let i = 0; i < 26; i++) {
        const sac = new THREE.Mesh(lumpySphere(1, .12, i * 13 + Math.round(x)), skin);
        const angle = random() * TAU;
        const r = random() * size * .6;
        const y = random() * 11;
        sac.position.set(x + Math.cos(angle) * r, y, z + Math.sin(angle) * r);
        sac.scale.setScalar(size * (.45 - y * .018) * (.7 + random() * .5));
        root.add(sac);
      }
    }
  } else if (area === 'stomach') {
    // Gastric mounds: a mucosal swelling wrapped in thick rugal folds and glistening with mucus.
    const skin = bioMaterial('mucosa', [4, 3], { color: 0xe0a080, roughness: .3, clearcoat: 1, clearcoatRoughness: .1 });
    const fold = bioMaterial('mucosa', [6, 1], { color: 0xc87a62, roughness: .36, clearcoat: .9 });
    for (const [x, z, size] of obstacles) {
      const mound = new THREE.Mesh(lumpySphere(4, .2, Math.round(x * 7 + z)), skin);
      mound.scale.set(size, size * .75, size);
      mound.position.set(x, -.2, z);
      root.add(mound);
      const rugae = [];
      for (let i = 0; i < 7; i++) {
        const tilt = (i / 7 - .5) * 1.6;
        const points = [];
        for (let k = 0; k <= 12; k++) {
          const a = k / 12 * Math.PI;
          const along = Math.cos(a) * size * 1.08;
          const up = Math.sin(a) * size * .82;
          points.push([x + along * Math.cos(tilt) + Math.sin(k * 1.7) * .15, up - .1, z + along * Math.sin(tilt) + (i - 3) * size * .12]);
        }
        rugae.push(tube(points, size * (.09 + random() * .04), 36, 8));
      }
      root.add(new THREE.Mesh(mergeGeometries(rugae), fold));
    }
  } else if (area === 'ear') {
    // Otoconia: calcite crystals of the vestibular organs, glassy and faceted.
    const crystal = new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: .06, metalness: 0, clearcoat: 1,
      transparent: true, opacity: .55, ior: 1.6, iridescence: .6, emissive: 0x204060, emissiveIntensity: .3, side: THREE.DoubleSide });
    const prism = new THREE.CylinderGeometry(.5, .5, 1, 6);
    prism.translate(0, .5, 0);
    for (const [x, z, size] of obstacles) {
      for (let i = 0; i < 9; i++) {
        const shard = new THREE.Mesh(prism, crystal);
        const angle = random() * TAU;
        const r = random() * size * .55;
        shard.position.set(x + Math.cos(angle) * r, -.2, z + Math.sin(angle) * r);
        shard.scale.set(size * (.25 + random() * .3), size * (1.2 + random() * 2.2), size * (.25 + random() * .3));
        shard.rotation.set((random() - .5) * .6, random() * TAU, (random() - .5) * .6);
        shard.renderOrder = 3;
        root.add(shard);
      }
    }
  } else if (area === 'lymph') {
    const fibre = bioMaterial('neural', [1, 6], { color: 0xefe2e6, roughness: .4, clearcoat: .7 });
    for (const [x, z, size] of obstacles) {
      const strands = [];
      for (let i = 0; i < 9; i++) {
        const angle = i / 9 * TAU;
        const points = [];
        for (let k = 0; k <= 8; k++) {
          const y = k * 2.2 - .4;
          const twist = angle + k * .45;
          const r = size * (.75 - Math.sin(k / 8 * Math.PI) * .3);
          points.push([x + Math.cos(twist) * r, y, z + Math.sin(twist) * r]);
        }
        strands.push(tube(points, size * .17, 40, 8));
      }
      root.add(new THREE.Mesh(mergeGeometries(strands), fibre));
    }
  }
}

// Soft volumetric light shafts from the tissue canopy.
function lightShafts(root, color, count, random) {
  const geometry = new THREE.CylinderGeometry(1.4, 4.2, 22, 24, 1, true);
  geometry.translate(0, -11, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) }, time: { value: 0 } },
    vertexShader: `varying float vHeight; varying vec3 vNormalView; varying vec3 vView;
      void main() { vHeight = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormalView = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 tint; uniform float time; varying float vHeight; varying vec3 vNormalView; varying vec3 vView;
      void main() { float fall = smoothstep(-22.0, -2.0, vHeight) * (1.0 - smoothstep(-2.0, 0.0, vHeight));
      float edge = pow(abs(dot(vNormalView, vView)), 1.6);
      float flicker = 0.85 + 0.15 * sin(time * 0.7 + vHeight * 0.3);
      gl_FragColor = vec4(tint, fall * edge * 0.075 * flicker); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (let i = 0; i < count; i++) {
    const shaft = new THREE.Mesh(geometry, material);
    const angle = random() * TAU;
    const r = .2 + random() * .65;
    shaft.position.set(Math.cos(angle) * (FLOOR_X - 2) * r, 23, Math.sin(angle) * (FLOOR_Z - 3) * r);
    shaft.rotation.set((random() - .5) * .3, 0, (random() - .5) * .3);
    shaft.scale.set(.8 + random() * .8, 1, .8 + random() * .8);
    root.add(shaft);
  }
  return material.uniforms.time;
}

// ---------------------------------------------------------------- per-area assembly

const SHAFT_COLORS = {
  artery: 0xff9a7a, junction: 0xffb08c, heart: 0xff8a7a, lungs: 0xd8ecff, stomach: 0xffd48a, intestines: 0xffc0a0,
  colon: 0xe8d890, lymph: 0xcfe8ff, ear: 0xc8e0ff, brain: 0xc8a8ff,
};

export function createLevelProps(area, { glow, floorHeight, nodes = [], obstacles = [] }) {
  const root = new THREE.Group();
  root.name = 'level-props-' + area;
  const random = seeded([...area].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0);
  const time = { value: 0 };
  const updates = [];
  let quality = true;
  const shaftTime = lightShafts(root, SHAFT_COLORS[area] ?? 0xffffff, area === 'brain' ? 4 : 7, random);
  const detailQuality = addLevelDetails(area, root, { random, time, nodes, obstacles, floorHeight });
  const heartbeat = () => {
    const phase = (time.value / 1.15) % 1;
    return phase < .38 ? Math.sin(phase / .38 * Math.PI) : 0;
  };

  if (area === 'artery' || area === 'junction' || area === 'heart') {
    const rivers = [];
    if (area === 'artery') {
      rivers.push(river(spread([[0, 9, -57], [0, 10.5, -44], [-14, 12.5, -22], [-8, 13.5, 4], [12, 12.5, 28], [30, 9.5, 52], [36, 8, 66]]), 3.6, 15, .55, 3));
    } else if (area === 'junction') {
      rivers.push(river(spread([[-48, 9, -40], [-24, 12, -30], [0, 13, -36], [24, 12, -30], [48, 9, -40]]), 3.2, 13, .5, 2));
    } else {
      rivers.push(river(spread([[-40, 12, 40], [-18, 15, 20], [0, 16, 0], [18, 15, -20], [40, 12, -40]]), 3, 16, .5, 2));
    }
    // Ground-level torrents race along both walls just outside the playable floor.
    rivers.push(river(spread([[-46, 2, -62], [-49, 2.4, -30], [-50, 2.6, 0], [-49, 2.4, 30], [-44, 2, 62]]), 2.6, 18, .45, 2.2));
    rivers.push(river(spread([[44, 2, 62], [49, 2.4, 30], [50, 2.6, 0], [49, 2.4, -30], [46, 2, -62]]), 2.6, 18, .45, 2.2));
    for (const flow of rivers) vesselSheath(root, flow, 0xffc2bc);
    const total = 820;
    const cells = bloodRiver(root, rivers, total, time, random);
    const plasma = rivers.map(flow => plasmaHaze(root, flow, glow, 0xff9a8a, 90, random));
    const gate = area === 'artery' ? valveGate(root, glow, spread([[0, 9, -57]])[0], 8.5, 0) : null;
    updates.push((dt, sim, reduced) => {
      const beat = reduced ? .3 : heartbeat();
      gate?.(beat);
      const pulse = .35 + beat * 1.6;
      cells(dt, pulse, quality ? total : 320);
      for (const update of plasma) update(dt, pulse);
    });
    const patrol = immunePatrol(root, glow, time, area === 'artery' ? 2 : 1, random, [.82, .96]);
    updates.push(dt => patrol(dt, floorHeight));
    if (area === 'artery') organPillars(root, area, obstacles, random);
  }

  if (area === 'intestines') {
    const setGrass = villusForest(root, time, random, nodes, obstacles);
    const drift = nutrientDrift(root, glow, 500, random, 0xffe2a0);
    updates.push((dt, sim) => drift(dt, time.value, sim?.organ?.phase === 'active' ? 2 : 0));
    updates.quality = setGrass;
  }

  if (area === 'colon') {
    const biome = microbiome(root, time, random, nodes, obstacles, glow);
    updates.push((dt, sim) => {
      const phase = sim?.organ?.phase;
      biome(dt, time.value, phase === 'active' ? 1 : phase === 'warning' ? .5 : 0);
    });
    const patrol = immunePatrol(root, glow, time, 1, random, [.85, .97]);
    updates.push(dt => patrol(dt, floorHeight));
  }

  if (area === 'lymph') {
    const cell = macrophage(root, glow, time);
    updates.push((dt, sim) => cell(dt, sim?.organ, floorHeight));
    const patrol = immunePatrol(root, glow, time, 3, random, [.8, .96]);
    updates.push(dt => patrol(dt, floorHeight));
    organPillars(root, area, obstacles, random);
    const drift = nutrientDrift(root, glow, 360, random, 0xcfe8ff);
    updates.push(dt => drift(dt, time.value));
  }

  if (area === 'brain') {
    const web = neuralWeb(root, glow, time, random, nodes, obstacles);
    updates.push((dt, sim) => web(dt, sim?.organ?.phase === 'active' || sim?.boss?.state === 'exposed'));
  }

  if (area === 'lungs' || area === 'stomach' || area === 'ear') {
    organPillars(root, area, obstacles, random);
    const drift = nutrientDrift(root, glow, 380, random, area === 'stomach' ? 0xe8f08a : area === 'ear' ? 0xb8e8ff : 0xffffff);
    updates.push((dt, sim) => drift(dt, time.value, area === 'lungs' && sim?.organ?.phase === 'active' ? -3 : 0));
  }

  return {
    root,
    setQuality(high) {
      quality = high;
      updates.quality?.(high);
      detailQuality(high);
    },
    update(sim, clock, dt, reduced) {
      const step = reduced ? 0 : dt;
      time.value = reduced ? 0 : clock;
      shaftTime.value = time.value;
      for (const update of updates) update(step, sim, reduced);
    },
  };
}
