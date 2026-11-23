// What the suit's abilities look like in the world: the antibody grenade and stun charge in flight
// (models, spin, blinking cores, trails), the stun charge's shock (ring, column, arcs to every
// pathogen it caught), crackling arcs on stunned pathogens, the antibody burst's jade flash, and
// the bash's impact rings. The camera side (dash lean, landing dip, dodge flash) lives in world.mjs.
import * as THREE from './vendor/three.module.js';
import { floorHeight } from './arena-scene.mjs';

const JADE = 0x6dffc1;
const VOLT = 0x7fd8ff;

function grenadeModel() {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xd9dfd4, metalness: .55, roughness: .32 });
  const core = new THREE.MeshStandardMaterial({ color: 0x1b3a2c, emissive: JADE, emissiveIntensity: 2.2, roughness: .25 });
  const band = new THREE.MeshStandardMaterial({ color: 0x2a2f33, metalness: .8, roughness: .35 });
  // A capsule body with a glowing window and the Y of an antibody on top.
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .1, 6, 14), shell);
  group.add(body);
  const window = new THREE.Mesh(new THREE.CylinderGeometry(.073, .073, .06, 18, 1, true), core);
  group.add(window);
  for (const y of [-.06, .06]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.073, .008, 6, 18), band);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }
  const arm = new THREE.CapsuleGeometry(.014, .07, 4, 8);
  const stem = new THREE.Mesh(arm, shell);
  stem.position.y = .16;
  group.add(stem);
  for (const side of [-1, 1]) {
    const branch = new THREE.Mesh(arm, shell);
    branch.position.set(side * .04, .23, 0);
    branch.rotation.z = -side * .7;
    group.add(branch);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), core);
    tip.position.set(side * .075, .27, 0);
    group.add(tip);
  }
  group.userData.glow = core;
  return group;
}

function stunModel() {
  const group = new THREE.Group();
  const casing = new THREE.MeshStandardMaterial({ color: 0x2b3138, metalness: .75, roughness: .3 });
  const coil = new THREE.MeshStandardMaterial({ color: 0x0f2a3a, emissive: VOLT, emissiveIntensity: 2.4, roughness: .2 });
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(.11, .12, .06, 22), casing);
  group.add(puck);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.105, .016, 8, 26), coil);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), coil);
  cap.position.y = .03;
  group.add(cap);
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.Mesh(new THREE.ConeGeometry(.012, .07, 6), casing);
    const angle = i * Math.PI * 2 / 3;
    prong.position.set(Math.cos(angle) * .1, -.05, Math.sin(angle) * .1);
    prong.rotation.x = Math.PI;
    group.add(prong);
  }
  group.userData.glow = coil;
  return group;
}

// A jagged bolt between two points, written into `positions` as line-segment pairs.
function bolt(positions, offset, from, to, jitter, random, steps = 6) {
  let px = from.x, py = from.y, pz = from.z;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const wobble = i === steps ? 0 : jitter;
    const x = from.x + (to.x - from.x) * t + (random() - .5) * wobble;
    const y = from.y + (to.y - from.y) * t + (random() - .5) * wobble;
    const z = from.z + (to.z - from.z) * t + (random() - .5) * wobble;
    positions.set([px, py, pz, x, y, z], offset);
    offset += 6;
    px = x; py = y; pz = z;
  }
  return offset;
}

export class AbilityFX {
  constructor(scene, glow, random = Math.random) {
    this.scene = scene;
    this.glow = glow;
    this.random = random;
    this.items = new Map();
    this.pools = { grenade: [], stun: [] };
    this.trail = [];
    this.trailMaterial = new THREE.SpriteMaterial({ map: glow, color: JADE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.voltTrailMaterial = this.trailMaterial.clone();
    this.voltTrailMaterial.color.setHex(VOLT);
    this.trailPool = [];
    this.shocks = [];
    this.rings = [];
    // Arcs: one buffer redrawn every few frames for stun blasts and stunned pathogens alike.
    const MAX_SEGMENTS = 1400;
    this.arcPositions = new Float32Array(MAX_SEGMENTS * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.arcPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.arcs = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: 0xbfefff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.arcs.frustumCulled = false;
    this.arcs.renderOrder = 6;
    scene.add(this.arcs);
    this.arcClock = 0;
    this.center = new THREE.Vector3();
    this.light = new THREE.PointLight(VOLT, 0, 16, 2);
    scene.add(this.light);
    this.lightLife = 0;
    this.lightPeak = 0;
  }

  ring(x, y, z, color, radius, life, flat = true) {
    let ring = this.rings.find(item => item.life <= 0);
    if (!ring) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 48), new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      mesh.renderOrder = 5;
      this.scene.add(mesh);
      ring = { mesh, life: 0 };
      this.rings.push(ring);
    }
    ring.mesh.visible = true;
    ring.mesh.material.color.setHex(color);
    ring.mesh.position.set(x, y, z);
    ring.mesh.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
    Object.assign(ring, { life, duration: life, radius, flat });
    return ring;
  }

  flash(x, y, z, color, intensity, life) {
    this.light.color.setHex(color);
    this.light.position.set(x, y, z);
    this.lightPeak = intensity;
    this.lightLife = this.lightDuration = life;
  }

  // Called with each simulation event (and the camera position for facing rings).
  note(event, reduceMotion) {
    if (event.type === 'stun') {
      const ground = floorHeight(event.x, event.z) + .06;
      this.ring(event.x, ground, event.z, VOLT, event.radius, .55);
      this.ring(event.x, ground + .02, event.z, 0xffffff, event.radius * .55, .3);
      this.flash(event.x, event.y + 1, event.z, VOLT, reduceMotion ? 18 : 60, .45);
      this.shocks.push({ x: event.x, y: event.y, z: event.z, life: .45, targets: event.stunned ?? [] });
    }
    if (event.type === 'explosion' && event.kind === 'antibody') {
      const ground = floorHeight(event.x, event.z) + .06;
      this.ring(event.x, ground, event.z, JADE, event.radius, .6);
      this.flash(event.x, event.y + .6, event.z, JADE, reduceMotion ? 20 : 70, .4);
    }
    if (event.type === 'melee' && event.hits) {
      for (const target of event.targets ?? []) {
        this.ring(target.x, target.y, target.z, 0xffc98a, .65, .18, false).facing = true;
      }
    }
    if (event.type === 'throw' && event.stage === 'bounce' && !reduceMotion) {
      this.ring(event.x, floorHeight(event.x, event.z) + .05, event.z, event.kind === 'stun' ? VOLT : JADE, .35, .18);
    }
  }

  update(sim, camera, dt, reduceMotion, enemyViews) {
    const seen = new Set();
    for (const item of sim.throwables ?? []) {
      seen.add(item.id);
      let view = this.items.get(item.id);
      if (!view) {
        const model = this.pools[item.kind].pop() ?? (item.kind === 'grenade' ? grenadeModel() : stunModel());
        this.scene.add(model);
        view = { model, kind: item.kind, trail: 0 };
        this.items.set(item.id, view);
      }
      const ground = item.rest ? floorHeight(item.x, item.z) : 0;
      view.model.position.set(item.x, item.y + ground, item.z);
      view.model.rotation.set(item.rest ? 0 : item.spin, item.spin * .6, item.rest ? 0 : item.spin * .3);
      // The core blinks faster as the fuse runs down.
      const rate = 6 + 26 * Math.max(0, 1 - item.fuse / 1.5);
      view.model.userData.glow.emissiveIntensity = 1.2 + 2.4 * (.5 + .5 * Math.sin(item.age * rate));
      view.trail -= dt;
      if (!reduceMotion && !item.rest && view.trail <= 0) {
        view.trail = .016;
        const sprite = this.trailPool.pop() ?? new THREE.Sprite(this.trailMaterial);
        sprite.material = item.kind === 'stun' ? this.voltTrailMaterial : this.trailMaterial;
        sprite.position.copy(view.model.position);
        sprite.visible = true;
        this.scene.add(sprite);
        this.trail.push({ sprite, life: .28 });
      }
    }
    for (const [id, view] of this.items) {
      if (seen.has(id)) continue;
      this.scene.remove(view.model);
      this.pools[view.kind].push(view.model);
      this.items.delete(id);
    }
    let count = 0;
    for (const puff of this.trail) {
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.sprite.visible = false;
        this.trailPool.push(puff.sprite);
        continue;
      }
      puff.sprite.scale.setScalar(.22 * (puff.life / .28) + .04);
      this.trail[count++] = puff;
    }
    this.trail.length = count;

    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      const t = 1 - Math.max(0, ring.life) / ring.duration;
      const scale = Math.max(.01, ring.radius * (.15 + .85 * (1 - (1 - t) ** 3)));
      ring.mesh.scale.setScalar(scale);
      ring.mesh.material.opacity = (1 - t) * .9;
      if (ring.facing) ring.mesh.quaternion.copy(camera.quaternion);
      if (ring.life <= 0) ring.mesh.visible = false;
    }
    this.lightLife = Math.max(0, this.lightLife - dt);
    this.light.intensity = this.lightLife > 0 ? this.lightPeak * (this.lightLife / this.lightDuration) ** 2 : 0;

    // Arcs flicker: redraw the bolts about thirty times a second.
    this.arcClock -= dt;
    this.shocks = this.shocks.filter(shock => (shock.life -= dt) > 0);
    if (this.arcClock > 0) return;
    this.arcClock = reduceMotion ? .12 : .033;
    const random = this.random;
    let offset = 0;
    const limit = this.arcPositions.length - 60;
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    for (const shock of this.shocks) {
      const base = floorHeight(shock.x, shock.z);
      for (const target of shock.targets) {
        if (offset > limit) break;
        from.set(shock.x, base + .4, shock.z);
        to.set(target.x, target.y, target.z);
        offset = bolt(this.arcPositions, offset, from, to, .7, random, 8);
      }
      for (let i = 0; i < 10 && offset <= limit; i++) {
        const angle = random() * Math.PI * 2;
        const reach = 1 + random() * 4.5;
        from.set(shock.x, base + .3, shock.z);
        to.set(shock.x + Math.cos(angle) * reach, base + .05 + random() * .8, shock.z + Math.sin(angle) * reach);
        offset = bolt(this.arcPositions, offset, from, to, .5, random, 5);
      }
    }
    for (const enemy of sim.enemies ?? []) {
      if (!(enemy.stunRemaining > 0) || offset > limit) continue;
      const view = enemyViews?.get(enemy.id);
      const center = view?.model?.position ?? this.center.set(enemy.x, enemy.y, enemy.z);
      const radius = (enemy.radius ?? .8) * 1.1;
      for (let i = 0; i < 3 && offset <= limit; i++) {
        const a = random() * Math.PI * 2;
        const b = a + 1 + random() * 2;
        const h1 = (random() - .5) * radius;
        const h2 = (random() - .5) * radius;
        from.set(center.x + Math.cos(a) * radius, center.y + h1, center.z + Math.sin(a) * radius);
        to.set(center.x + Math.cos(b) * radius, center.y + h2, center.z + Math.sin(b) * radius);
        offset = bolt(this.arcPositions, offset, from, to, .35, random, 4);
      }
    }
    this.arcs.geometry.setDrawRange(0, offset / 3);
    this.arcs.geometry.attributes.position.needsUpdate = true;
    this.arcs.geometry.attributes.position.clearUpdateRanges?.();
  }

  // Puts one of everything in front of the camera so preparation compiles its shaders.
  warm(on, at = { x: 0, y: 1, z: 0 }) {
    if (!on) { this.reset(); return; }
    const sim = { throwables: [
      { id: -1, kind: 'grenade', x: at.x - .4, y: at.y, z: at.z, fuse: 1, age: 0, spin: 0 },
      { id: -2, kind: 'stun', x: at.x + .4, y: at.y, z: at.z, fuse: 1, age: 0, spin: 0 },
    ], enemies: [] };
    this.update(sim, { quaternion: new THREE.Quaternion() }, .016, false, null);
    this.note({ type: 'stun', x: at.x, y: at.y, z: at.z, radius: 3, stunned: [{ x: at.x, y: at.y + 1, z: at.z - 1 }] }, false);
    this.note({ type: 'melee', hits: 1, targets: [{ x: at.x, y: at.y, z: at.z }] }, false);
    this.arcClock = 0;
    this.update(sim, { quaternion: new THREE.Quaternion() }, .016, false, null);
  }

  reset() {
    for (const [, view] of this.items) {
      this.scene.remove(view.model);
      this.pools[view.kind].push(view.model);
    }
    this.items.clear();
    for (const puff of this.trail) { puff.sprite.visible = false; this.trailPool.push(puff.sprite); }
    this.trail.length = 0;
    for (const ring of this.rings) { ring.life = 0; ring.mesh.visible = false; }
    this.shocks.length = 0;
    this.arcs.geometry.setDrawRange(0, 0);
    this.light.intensity = 0;
    this.lightLife = 0;
  }
}
