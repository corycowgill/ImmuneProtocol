// What a shot leaves behind. The simulation only knows whether a shot hit a pathogen; a miss runs
// on to the end of its range. Here each shot's ray is marched against the floor, the chamber wall
// and the solid obstacles to find the surface it would really strike, and that surface takes a
// mark: a puncture wound from bullets, a wet splash of a pathogen's fluid behind one it passed
// through, a scorch ring from a rocket. Marks lie on the surface they hit, fade after a while, and
// share fixed pools (the oldest mark gives way). Each strike also flashes light, sprays mist and
// sparks, and heavy rounds chip fragments.
import * as THREE from './vendor/three.module.js';
import { floorHeight, wallMargin } from './arena-scene.mjs';
import { deathRecipe } from './death-fx.mjs';

const TAU = Math.PI * 2;
const LIFE = 26;
const FADE = 6;
const POOLS = { puncture: 180, splash: 120, scorch: 24 };
// Wound colours per arena: the tissue a puncture opens and the stain a splash leaves around it.
const WOUNDS = {
  artery: 0x2a0306, junction: 0x2a0306, heart: 0x240206, lungs: 0x5a1424, stomach: 0x3a1408, intestines: 0x4a0c12,
  colon: 0x2a1806, lymph: 0x261c40, ear: 0x182a40, brain: 0x281040,
};

function markTexture(kind) {
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = kind.length * 7919;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const c = size / 2;
  const radial = (x, y, r, stops) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };
  if (kind === 'puncture') {
    // A torn hole: dark core, a raised wet rim and short tears radiating out.
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = random() * TAU, length = 14 + random() * 22;
      ctx.lineWidth = 1.5 + random() * 2.5;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 10, c + Math.sin(a) * 10);
      ctx.lineTo(c + Math.cos(a + (random() - .5) * .4) * length, c + Math.sin(a + (random() - .5) * .4) * length);
      ctx.stroke();
    }
    radial(c, c, 30, [[0, 'rgba(255,255,255,.95)'], [.55, 'rgba(255,255,255,.75)'], [1, 'rgba(255,255,255,0)']]);
  } else if (kind === 'splash') {
    radial(c, c, 26, [[0, 'rgba(255,255,255,.85)'], [1, 'rgba(255,255,255,0)']]);
    for (let i = 0; i < 26; i++) {
      const a = random() * TAU, d = 14 + random() * 44, r = 1.5 + random() * 6 * (1 - d / 64);
      radial(c + Math.cos(a) * d, c + Math.sin(a) * d * .8, r, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
    }
  } else {
    radial(c, c, 60, [[0, 'rgba(255,255,255,.95)'], [.45, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class ImpactFX {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.clock = 0;
    this.area = 'artery';
    this.direction = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.roll = new THREE.Quaternion();
    this.color = new THREE.Color();
    this.pools = {};
    const plane = new THREE.PlaneGeometry(1, 1);
    for (const [kind, count] of Object.entries(POOLS)) {
      const material = new THREE.MeshStandardMaterial({
        map: typeof document === 'undefined' ? null : markTexture(kind), transparent: true, depthWrite: false,
        roughness: kind === 'scorch' ? .9 : .18, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.InstancedMesh(plane, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      mesh.count = 0;
      mesh.name = 'impact-' + kind;
      this.scene.add(mesh);
      this.pools[kind] = { mesh, next: 0, used: 0, born: new Float32Array(count).fill(-1e9), size: new Float32Array(count), transforms: Array.from({ length: count }, () => new THREE.Matrix4()) };
    }
    this.lights = Array.from({ length: 2 }, () => {
      const light = new THREE.PointLight(0xffb27a, 0, 7, 2);
      light.userData.remaining = 0;
      this.scene.add(light);
      return light;
    });
  }

  setArea(area) {
    this.area = area;
    this.clear();
  }

  clear() {
    for (const pool of Object.values(this.pools)) {
      pool.born.fill(-1e9);
      pool.used = pool.next = 0;
      pool.mesh.count = 0;
    }
    for (const light of this.lights) light.intensity = light.userData.remaining = 0;
  }

  // Lays one of each mark (or clears them) so their shaders compile while the arena is prepared.
  warm(on, at = new THREE.Vector3()) {
    if (!on) { this.clear(); return; }
    const up = new THREE.Vector3(0, 1, 0);
    for (const kind of Object.keys(this.pools)) this.mark(kind, new THREE.Vector3(at.x, floorHeight(at.x, at.z), at.z), up, .5, 0x502020);
  }

  // Marches a ray to the first solid surface it meets: the floor, the chamber wall or an obstacle.
  // Returns { point, normal, kind } or null within `reach` metres.
  surfaceHit(origin, direction, reach) {
    const obstacles = this.world.obstacles ?? [];
    const step = .45;
    let previous = 0;
    for (let t = step; t <= reach; t += step) {
      const x = origin.x + direction.x * t, y = origin.y + direction.y * t, z = origin.z + direction.z * t;
      let kind = null;
      if (y <= floorHeight(x, z)) kind = 'floor';
      else if (wallMargin(x, y, z) <= 0) kind = 'wall';
      else {
        for (const [ox, oz, radius] of obstacles) {
          if (y < radius * 1.6 && Math.hypot(x - ox, z - oz) < radius * .92) { kind = 'obstacle'; break; }
        }
      }
      if (!kind) { previous = t; continue; }
      // Refine the crossing between the last free sample and this one.
      let low = previous, high = t;
      for (let i = 0; i < 6; i++) {
        const mid = (low + high) / 2;
        const mx = origin.x + direction.x * mid, my = origin.y + direction.y * mid, mz = origin.z + direction.z * mid;
        const solid = kind === 'floor' ? my <= floorHeight(mx, mz) : kind === 'wall' ? wallMargin(mx, my, mz) <= 0
          : obstacles.some(([ox, oz, radius]) => my < radius * 1.6 && Math.hypot(mx - ox, mz - oz) < radius * .92);
        if (solid) high = mid; else low = mid;
      }
      const point = new THREE.Vector3().copy(origin).addScaledVector(direction, high);
      const normal = new THREE.Vector3();
      if (kind === 'floor') {
        const e = .2;
        normal.set(floorHeight(point.x - e, point.z) - floorHeight(point.x + e, point.z), 2 * e,
          floorHeight(point.x, point.z - e) - floorHeight(point.x, point.z + e)).normalize();
      } else if (kind === 'wall') normal.set(-point.x / 66 ** 2, 0, -point.z / 92 ** 2).normalize();
      else {
        const [ox, oz] = obstacles.find(([ox, oz, radius]) => Math.hypot(point.x - ox, point.z - oz) < radius * 1.05) ?? [point.x, point.z - 1];
        normal.set(point.x - ox, .3, point.z - oz).normalize();
      }
      return { point, normal, kind };
    }
    return null;
  }

  // Lays a mark of `kind` flat on a surface.
  mark(kind, point, normal, size, color) {
    const pool = this.pools[kind];
    const index = pool.next;
    pool.next = (pool.next + 1) % pool.born.length;
    pool.used = Math.max(pool.used, index + 1);
    this.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.roll.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * TAU);
    this.quaternion.multiply(this.roll);
    const transform = pool.transforms[index];
    transform.compose(this.point.copy(point).addScaledVector(normal, .025), this.quaternion, this.scale.set(size, size, size));
    pool.born[index] = this.clock;
    pool.size[index] = size;
    pool.mesh.setMatrixAt(index, transform);
    pool.mesh.setColorAt(index, this.color.setHex(color));
    pool.mesh.count = pool.used;
    pool.mesh.instanceMatrix.needsUpdate = true;
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
  }

  flash(point, color, intensity) {
    const light = this.lights.reduce((a, b) => (a.userData.remaining < b.userData.remaining ? a : b));
    light.color.setHex(color);
    light.position.copy(point);
    light.userData.remaining = light.userData.life = .07;
    light.userData.peak = intensity;
  }

  // A shot from `origin` along the ray to `end` that hit nothing alive: mark what it struck.
  shotMiss(origin, end, weapon, reduceMotion, pellet) {
    this.direction.subVectors(end, origin);
    const reach = this.direction.length();
    if (reach < .1) return;
    this.direction.divideScalar(reach);
    const hit = this.surfaceHit(origin, this.direction, Math.min(reach + 2, 80));
    if (!hit) return;
    // A shotgun's nine pellets would carpet the floor; most of them leave only a spark.
    if (!pellet || Math.random() < .35) {
      this.mark('puncture', hit.point, hit.normal, weapon === 'sniper' ? .8 : weapon === 'shotgun' ? .38 : .48 + Math.random() * .14, WOUNDS[this.area] ?? WOUNDS.artery);
    }
    const world = this.world;
    world.burst(hit.point.x, hit.point.y, hit.point.z, 0xffd0a0, reduceMotion ? 2 : pellet ? 3 : 7, 1.6);
    if (!pellet && world.explosions && !reduceMotion) {
      world.explosions.sprite(world.explosions.smoke, hit.point, {
        size: .25, grow: 1.4, life: .7, opacity: .4, color: WOUNDS[this.area] ?? 0x6a2020,
        vx: hit.normal.x * .6, vy: hit.normal.y * .6 + .25, vz: hit.normal.z * .6,
      });
      this.flash(hit.point.clone().addScaledVector(hit.normal, .3), 0xffc890, weapon === 'sniper' ? 40 : 14);
    }
    if (weapon === 'sniper' && !reduceMotion) {
      for (let i = 0; i < 3; i++) world.deaths?.chunk(hit.point, WOUNDS[this.area] ?? 0x6a2020, { size: .08, speed: 2.4, up: 2.8, life: 1.2 });
    }
  }

  // A rocket's blast scorches whatever it burst against.
  blast(point, radius) {
    let target = point, normal = new THREE.Vector3(0, 1, 0);
    const ground = floorHeight(point.x, point.z);
    if (point.y - ground < radius * .6) target = new THREE.Vector3(point.x, ground, point.z);
    else {
      const hit = this.surfaceHit(point, new THREE.Vector3(0, -1, 0), radius);
      if (!hit) return;
      target = hit.point; normal = hit.normal;
    }
    this.mark('scorch', target, normal, radius * .9, 0x1a0e0a);
    this.mark('splash', target, normal, radius * 1.2, WOUNDS[this.area] ?? WOUNDS.artery);
  }

  // A pathogen hit: fluid sprays through and spatters the surface behind it.
  enemyHit(view, impact, viewer, damage, critical, reduceMotion) {
    const recipe = view?.enemy ? deathRecipe(view.enemy) : null;
    const gore = recipe?.gore ?? 0x8a2020;
    this.direction.set(impact.x - viewer.x, impact.y - viewer.y, impact.z - viewer.z);
    const length = this.direction.length();
    if (length < .01) return;
    this.direction.divideScalar(length);
    const world = this.world;
    // Mist out of the wound, back toward the shooter and out the far side.
    if (world.explosions && !reduceMotion) {
      world.explosions.sprite(world.explosions.smoke, impact, {
        size: .3 + Math.min(.6, damage / 120), grow: 1.8, life: .55, opacity: .5, color: gore,
        vx: this.direction.x * 1.6, vy: .3, vz: this.direction.z * 1.6,
      });
    }
    // Fluid spurts: stretched streaks thrown back toward the shooter and out of the far side,
    // more and longer for heavier rounds, fanned so a burst reads as a splash, not a spark.
    if (world.sprays && !reduceMotion) {
      const count = Math.min(9, 4 + Math.round(damage / 15)) + (critical ? 3 : 0);
      const fluid = recipe?.flash ?? gore;
      for (let i = 0; i < count; i++) {
        const back = i % 3 !== 2 ? -1 : 1, reach = (.25 + Math.random() * .45) * (critical ? 1.4 : 1);
        this.point.set(impact.x, impact.y, impact.z);
        this.normal.copy(this.direction).multiplyScalar(back * .8)
          .add(this.scale.set(Math.random() - .5, Math.random() * .9 - .15, Math.random() - .5)).normalize();
        const end = this.point.clone().addScaledVector(this.normal, reach);
        end.y -= reach * reach * .35;
        // Short, thick and mostly the darker fluid: droplets flung off, not rays.
        world.sprays.add(this.point, end, i % 3 ? gore : fluid, .22 + Math.random() * .1, .07 + Math.random() * .06, reach * .55);
      }
    }
    // Heavy hits knock fragments loose.
    if ((damage >= 40 || critical) && !reduceMotion) {
      const count = Math.min(4, Math.round(damage / 35)) + (critical ? 1 : 0);
      for (let i = 0; i < count; i++) world.deaths?.chunk(impact, i % 2 ? recipe?.flash ?? gore : gore, { size: .07, speed: 2.6, up: 2.5, life: 1.3 });
    }
    // Exit spatter: whatever lies a few metres behind the pathogen takes a splash of its fluid.
    if (Math.random() < .7) {
      const origin = new THREE.Vector3(impact.x, impact.y, impact.z).addScaledVector(this.direction, (view?.enemy?.radius ?? .9) * (view?.enemy?.scale ?? 1));
      const down = this.direction.clone().add(new THREE.Vector3(0, -.45, 0)).normalize();
      const hit = this.surfaceHit(origin, down, 5);
      if (hit) this.mark('splash', hit.point, hit.normal, .5 + Math.min(.9, damage / 90) + Math.random() * .3, gore);
    }
  }

  update(dt) {
    this.clock += dt;
    for (const pool of Object.values(this.pools)) {
      let dirty = false;
      for (let i = 0; i < pool.used; i++) {
        const age = this.clock - pool.born[i];
        if (age < LIFE - FADE || age > LIFE + 1) continue;
        // Fading out: the mark shrinks away over its last seconds.
        const left = Math.max(0, (LIFE - age) / FADE);
        pool.transforms[i].decompose(this.point, this.quaternion, this.scale);
        this.matrix.compose(this.point, this.quaternion, this.scale.setScalar(pool.size[i] * left));
        pool.mesh.setMatrixAt(i, this.matrix);
        dirty = true;
      }
      if (dirty) pool.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const light of this.lights) {
      const data = light.userData;
      data.remaining = Math.max(0, data.remaining - dt);
      light.intensity = data.remaining > 0 ? data.peak * data.remaining / data.life : 0;
    }
  }
}
