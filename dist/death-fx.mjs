// How pathogens die. When the simulation reports a kill, the pathogen's pooled model is not
// hidden at once: it plays a death of its own species (a capsid that swells and ruptures, a
// sporangium that puffs apart, a bacterium that drops, convulses and melts into the floor, a
// drone that sparks, tumbles and blows apart, a nest that bursts sac by sac, a boss that
// convulses through a chain of ruptures before it explodes) and leaves gore, debris and a
// fading puddle behind. Every resource here is pooled; a saturated pool only drops decoration.
import * as THREE from './vendor/three.module.js';
import { floorHeight } from './arena-scene.mjs';
import { BOSS_FLOATS } from './level-bosses.mjs';

const TAU = Math.PI * 2;
const GRAVITY = 17;
const CHUNKS = 120;
const SPLATS = 32;
const CORPSE_LIMIT = 48;
// Kills are remembered briefly so an online client whose snapshot drops the pathogen a frame
// after the event still plays the death.
const KILL_MEMORY = 1.5;

// Each species' death: how its body comes apart and the colours it leaves.
export const DEATHS = Object.freeze({
  virus: { style: 'rupture', flash: 0xff9a6a, gore: 0xc8432c, chunk: 'blob', chunks: 8, swell: .34, time: .13, splat: 1.2 },
  phage: { style: 'rupture', flash: 0xd2b4ff, gore: 0x8a64d8, chunk: 'rod', chunks: 10, swell: .2, time: .11, splat: .8 },
  latcher: { style: 'rupture', flash: 0xd8ffb0, gore: 0x7fae3a, chunk: 'rod', chunks: 10, swell: .24, time: .12, splat: 1 },
  splitter: { style: 'rupture', flash: 0xf0a8ff, gore: 0x9b3fb4, chunk: 'blob', chunks: 6, swell: .26, time: .1, splat: 1 },
  blister: { style: 'rupture', flash: 0xffa080, gore: 0xd8362a, chunk: 'blob', chunks: 13, swell: .45, time: .16, splat: 2.1, splash: true },
  flagellate: { style: 'rupture', flash: 0xcfa8ff, gore: 0x7a3fd0, chunk: 'rod', chunks: 8, swell: .22, time: .3, splat: 1, spin: true },
  rogue: { style: 'rupture', flash: 0xff8a70, gore: 0xb3261e, chunk: 'blob', chunks: 12, swell: .3, time: .26, splat: 1.8, blebs: true },
  spore: { style: 'puff', flash: 0xffb0f4, gore: 0xd681b9, time: .32, splat: .7 },
  bacillus: { style: 'melt', flash: 0xffe0a0, gore: 0xc9a040, splat: 1.6, pose: 'lie' },
  filovirus: { style: 'melt', flash: 0xff8a70, gore: 0xb83a2a, splat: 1.5, pose: 'curl' },
  amoeba: { style: 'melt', flash: 0xd4d0ff, gore: 0x7f78d8, splat: 2.4, pose: 'slump' },
  guard: { style: 'melt', flash: 0x9ffff4, gore: 0x3a9c94, splat: 1.4, pose: 'lie', shell: 0x9ec9c0 },
  'rogue-bot': { style: 'crash', flash: 0xffc070, gore: 0x1a1414, splat: 2.2 },
  // The Crawler's legs curl in under it like a dead spider's as it shorts out on the floor.
  crawler: { style: 'crash', flash: 0xffb060, gore: 0x1a1414, splat: 1.6, curl: true },
  colony: { style: 'collapse', flash: 0xd8ff9a, gore: 0x7a9a3a, splat: 1.5, time: 1.5 },
  nest: { style: 'collapse', flash: 0xffd080, gore: 0xb0482a, splat: 1.5, time: 1.4 },
  segment: { style: 'rupture', flash: 0xfff0c0, gore: 0xc8a860, chunk: 'blob', chunks: 9, swell: .2, time: .12, splat: 1.2 },
  engulf: { style: 'engulf', flash: 0xc8a8ff, gore: 0x8060c0, time: .42 },
});

// Level bosses take the long death; each bleeds its own colour.
export const BOSS_GORE = Object.freeze({
  thrombus: 0xa8221c, leech: 0xc0902e, bloom: 0x4ac0a0, drill: 0xc8542e,
  tapeworm: 0xe0c890, colossus: 0x98a838, macrophage: 0x9070d8, screamer: 0x6a98e0,
});
export const BOSS_DEATH_TIME = 2;

export function deathRecipe(enemy) {
  if (enemy.boss) return { style: 'boss', flash: 0xffd2a0, gore: BOSS_GORE[enemy.boss] ?? 0xb03a2a, time: BOSS_DEATH_TIME, splat: 3 };
  if (enemy.segmentOf) return DEATHS.segment;
  if (enemy.nest) return DEATHS.nest;
  return DEATHS[enemy.type] ?? DEATHS.virus;
}

// An irregular wet splat with satellite droplets, white so each puddle can be tinted.
function splatTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  let seed = 4711;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const blob = (x, y, radius, alpha) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(.7, `rgba(255,255,255,${alpha * .85})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  };
  blob(size / 2, size / 2, size * .3, .9);
  for (let i = 0; i < 16; i++) {
    const angle = random() * TAU;
    const distance = size * (.12 + random() * .3);
    blob(size / 2 + Math.cos(angle) * distance, size / 2 + Math.sin(angle) * distance, size * (.03 + random() * .1), .85);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export class DeathFX {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.killed = new Map();
    this.corpses = [];
    this.chunks = [];
    this.splats = [];
    this.clock = 0;
    this.lastEvents = null;
    this.push = new THREE.Vector3();
    this.color = new THREE.Color();
    this.white = new THREE.Color(0xffffff);
    this.black = new THREE.Color(0);
    this.geometries = {
      blob: new THREE.IcosahedronGeometry(.5, 0),
      shard: new THREE.TetrahedronGeometry(.55, 0),
      rod: new THREE.CylinderGeometry(.13, .1, 1, 5),
    };
    this.chunkPool = Array.from({ length: CHUNKS }, () => {
      const mesh = new THREE.Mesh(this.geometries.blob, new THREE.MeshStandardMaterial({ roughness: .32 }));
      mesh.visible = false;
      this.scene.add(mesh);
      return { mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), size: new THREE.Vector3() };
    });
    const map = splatTexture();
    const plane = new THREE.PlaneGeometry(1, 1);
    this.splatPool = Array.from({ length: SPLATS }, () => {
      const mesh = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({
        map, transparent: true, depthWrite: false, roughness: .16, metalness: .08,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1;
      mesh.visible = false;
      this.scene.add(mesh);
      return { mesh };
    });
  }

  get fx() { return this.world.explosions; }
  get low() { return this.world.quality === 'low'; }

  random() { return this.world.random ? this.world.random() : Math.random(); }

  // Remembers this step's kills (and pathogens a boss devoured) for the views that vanish.
  note(events, viewer) {
    if (viewer) this.viewer = viewer;
    if (events === this.lastEvents) return;
    this.lastEvents = events;
    for (const event of events ?? []) {
      if (event.type === 'kill') this.killed.set(event.id, { at: this.clock });
      else if (event.type === 'levelBoss' && event.stage === 'ability' && event.prey != null) {
        this.killed.set(event.prey, { at: this.clock, devour: { x: event.x, y: event.y, z: event.z } });
      }
    }
  }

  // Called for a view whose pathogen has left the field. True when it died and now plays out.
  claim(id, view) {
    const enemy = view.enemy;
    if (!enemy) return false;
    let kill = this.killed.get(id);
    let delay = 0;
    if (!kill && enemy.segmentOf != null && this.killed.has(enemy.segmentOf)) {
      // A tapeworm's segments burst one after another down the chain when the head dies.
      kill = this.killed.get(enemy.segmentOf);
      delay = .12 + (enemy.order ?? 1) * .13;
    }
    if (!kill) return false;
    this.killed.delete(id);
    if (this.corpses.length >= CORPSE_LIMIT) this.finish(this.corpses.shift());
    const recipe = kill.devour ? DEATHS.engulf : deathRecipe(enemy);
    const { model } = view;
    const radius = enemy.radius || .9;
    const scale = enemy.boss || enemy.nest || enemy.segmentOf ? enemy.scale ?? 1 : 1;
    // The corpse lurches away from the suit that watched it die.
    const viewer = this.viewer;
    this.push.set(model.position.x - (viewer?.x ?? model.position.x), 0, model.position.z - (viewer?.z ?? model.position.z + 1));
    if (this.push.lengthSq() < 1e-6) this.push.set(0, 0, -1);
    this.push.normalize();
    const corpse = {
      id, view, enemy, dir: this.push.clone(), recipe, radius, scale, delay, t: 0, fired: 0, landed: false, tick: 0,
      kind: enemy.type,
      position: model.position.clone(), rotation: model.rotation.clone(), size: model.scale.clone(),
      floor: floorHeight(model.position.x, model.position.z),
      velocity: new THREE.Vector3(this.push.x, 0, this.push.z).multiplyScalar(recipe.style === 'crash' ? 2.6 : 1.1),
      spin: new THREE.Vector3((this.random() - .5) * 7, (this.random() - .5) * 4, (this.random() - .5) * 7),
      devour: kill.devour,
      floats: enemy.boss && BOSS_FLOATS.includes(enemy.boss),
    };
    view.dying = true;
    this.corpses.push(corpse);
    this.start(corpse);
    return true;
  }

  // Shows one debris chunk and one puddle (or hides them again) so their shaders compile while
  // the arena is being prepared rather than on the first kill.
  warm(on, at = { x: 0, y: 0, z: 0 }) {
    const chunk = this.chunkPool[0], splat = this.splatPool[0];
    if (!chunk || !splat) return;
    chunk.mesh.visible = splat.mesh.visible = on;
    if (on) {
      chunk.mesh.position.set(at.x, at.y + .4, at.z);
      chunk.mesh.scale.setScalar(.2);
      splat.mesh.position.set(at.x, at.y + .04, at.z);
      splat.mesh.scale.set(1, 1, 1);
    }
  }

  dying(id) {
    return this.corpses.some(corpse => corpse.id === id);
  }

  // ----- Pooled decoration -----

  chunk(origin, color, { shape = 'blob', size = .3, speed = 4, up = 4, metal = false, glow = 0, life = 1.8, stain = true } = {}) {
    const item = this.chunkPool.pop();
    if (!item) return;
    const { mesh, velocity, spin } = item;
    mesh.geometry = this.geometries[shape];
    const material = mesh.material;
    material.color.setHex(color);
    material.metalness = metal ? .75 : 0;
    material.roughness = metal ? .38 : .26;
    material.emissive.setHex(glow || color);
    // Wet tissue catches the arena light: a little self-glow keeps red chunks readable on a red floor.
    material.emissiveIntensity = glow ? 1.4 : .45;
    const angle = this.random() * TAU;
    const out = speed * (.45 + this.random() * .75);
    velocity.set(Math.cos(angle) * out + this.push.x * speed * .35, up * (.5 + this.random() * .8), Math.sin(angle) * out + this.push.z * speed * .35);
    spin.set((this.random() - .5) * 14, (this.random() - .5) * 14, (this.random() - .5) * 14);
    const s = size * (.6 + this.random() * .8);
    if (shape === 'rod') item.size.set(s * 1.1, s * (2.4 + this.random() * 2), s * 1.1);
    else if (shape === 'shard') item.size.set(s * 1.3, s * .35, s * 1.1);
    else item.size.set(s * (1 + this.random() * .5), s * (.6 + this.random() * .5), s);
    mesh.scale.copy(item.size);
    mesh.position.set(origin.x + (this.random() - .5) * size, origin.y + (this.random() - .2) * size, origin.z + (this.random() - .5) * size);
    mesh.rotation.set(this.random() * TAU, this.random() * TAU, this.random() * TAU);
    mesh.visible = true;
    Object.assign(item, { life, remaining: life, color, stain: stain && !metal, resting: false, stained: false, squash: 1 });
    this.chunks.push(item);
  }

  splat(x, z, color, size, { grow = .22, life = 7, opacity = .92 } = {}) {
    let item = this.splatPool.pop();
    if (!item) {
      item = this.splats.shift();
      if (!item) return null;
    }
    const { mesh } = item;
    mesh.material.color.setHex(color);
    mesh.material.emissive.setHex(color);
    mesh.material.emissiveIntensity = .12;
    mesh.material.opacity = opacity;
    mesh.position.set(x, floorHeight(x, z) + .035 + this.random() * .01, z);
    mesh.rotation.z = this.random() * TAU;
    mesh.scale.set(.01, .01, 1);
    mesh.visible = true;
    Object.assign(item, { size, aspect: .75 + this.random() * .5, grow, life, remaining: life, opacity });
    this.splats.push(item);
    return item;
  }

  flash(point, color, size, life = .2) {
    this.fx?.sprite(this.fx.glow, point, { size: size * 1.2, grow: size * 9, life, additive: true, color, opacity: 1 });
    this.fx?.sprite(this.fx.flare, point, { size: size * .8, grow: size * 5, life: life * .7, additive: true, color: 0xffffff, opacity: .9 });
  }

  mist(point, color, size, count, { rise = .5, life = 1.2, opacity = .5 } = {}) {
    if (!this.fx) return;
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU;
      const spread = this.random() * size * .5;
      this.fx.sprite(this.fx.smoke, { x: point.x + Math.cos(angle) * spread, y: point.y + (this.random() - .3) * size * .4, z: point.z + Math.sin(angle) * spread }, {
        size: size * (.5 + this.random() * .4), grow: size * (.8 + this.random()), life: life * (.75 + this.random() * .5), opacity,
        color, fadeIn: .08, vx: Math.cos(angle) * size * .6, vy: rise * (.5 + this.random()), vz: Math.sin(angle) * size * .6,
      });
    }
  }

  // Body chunks thrown out in a burst, with a puddle where they fall.
  gore(point, recipe, size, count, options = {}) {
    if (this.low) count = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      this.chunk(point, i % 3 === 2 ? recipe.flash : recipe.gore, {
        shape: options.shape ?? recipe.chunk ?? 'blob', size: (options.chunkSize ?? .26) * size, speed: (options.speed ?? 3.6) * Math.sqrt(size),
        up: (options.up ?? 4.2) * Math.sqrt(size), life: 1.4 + this.random() * 1.1, metal: options.metal,
      });
    }
  }

  // ----- Corpses -----

  start(corpse) {
    const { recipe, radius, scale } = corpse;
    const size = radius * Math.sqrt(scale);
    corpse.size0 = size;
    corpse.duration = recipe.time ?? 1;
    if (recipe.style === 'melt') corpse.duration = 1.7;
    if (recipe.style === 'crash') corpse.duration = .92;
    if (corpse.delay > 0) return;
    this.open(corpse);
  }

  // The moment of death: a bright snap of the species' colour.
  open(corpse) {
    corpse.opened = true;
    const { recipe, position, view } = corpse;
    const size = corpse.size0;
    const reduce = this.reduceMotion;
    switch (recipe.style) {
      case 'puff':
        this.flash(position, recipe.flash, size * .9, .16);
        this.mist(position, recipe.gore, size * 2.4, reduce ? 4 : this.low ? 6 : 11, { rise: .45, life: 2.1, opacity: .42 });
        this.world.burst(position.x, position.y, position.z, recipe.flash, reduce ? 10 : 32, 2.2);
        break;
      case 'melt':
        this.flash(position, recipe.flash, size * .6, .14);
        this.world.burst(position.x, position.y, position.z, recipe.gore, reduce ? 8 : 22, 2.6);
        if (recipe.shell) {
          // The Shellback's armour cracks off before the body inside drops.
          if (view.guard) view.guard.visible = false;
          for (let i = 0; i < (this.low ? 5 : 10); i++) {
            this.chunk(position, recipe.shell, { shape: 'shard', size: .34 * size, speed: 5, up: 4.5, life: 2.2, stain: false });
          }
          this.world.burst(position.x, position.y, position.z, 0xfce5a9, reduce ? 8 : 26, 3.4);
        }
        break;
      case 'crash':
        this.world.burst(position.x, position.y, position.z, 0xffd27a, reduce ? 10 : 34, 3.2);
        this.world.burst(position.x, position.y, position.z, 0x9fdcff, reduce ? 4 : 14, 2.2);
        this.flash(position, 0xffb060, size * .6, .12);
        break;
      case 'collapse':
        this.flash(position, recipe.flash, size * .7, .2);
        corpse.puddle = this.splat(position.x, position.z, recipe.gore, recipe.splat * size, { grow: 1.1, life: 9 });
        break;
      case 'boss':
        this.flash(position, recipe.flash, size * .5, .24);
        if (this.fx && !reduce) this.fx.shake = Math.min(1, this.fx.shake + .3);
        break;
      case 'engulf':
        this.world.burst(position.x, position.y, position.z, recipe.flash, reduce ? 4 : 12, 1.4);
        break;
    }
  }

  update(dt, reduceMotion = false) {
    this.reduceMotion = reduceMotion;
    this.clock += dt;
    for (const [id, kill] of this.killed) if (this.clock - kill.at > KILL_MEMORY) this.killed.delete(id);
    let count = 0;
    for (const corpse of this.corpses) {
      if (corpse.delay > 0) {
        corpse.delay -= dt;
        if (corpse.delay > 0) { this.corpses[count++] = corpse; continue; }
        this.push.copy(corpse.dir);
        this.open(corpse);
      }
      this.push.copy(corpse.dir);
      corpse.t += dt;
      if (this.pose(corpse, dt, reduceMotion) === false || corpse.t >= corpse.duration) {
        this.end(corpse);
        this.finish(corpse);
        continue;
      }
      this.corpses[count++] = corpse;
    }
    this.corpses.length = count;
    this.updateChunks(dt);
    this.updateSplats(dt);
  }

  // Poses the dying model for this frame.
  pose(corpse, dt, reduceMotion) {
    const { view, recipe, position, rotation, size } = corpse;
    const { model } = view;
    const k = Math.min(1, corpse.t / corpse.duration);
    const motion = reduceMotion ? .4 : 1;
    const membrane = view.attackMembrane;
    let clench = 0;
    switch (recipe.style) {
      case 'rupture': {
        // Swells unevenly, flares its spikes and glows white-hot, then pops.
        const swell = 1 + recipe.swell * k * k * (1 + .4 * motion);
        const wobble = reduceMotion ? 0 : Math.sin(corpse.t * 70) * .07 * k;
        model.position.copy(position).addScaledVector(corpse.velocity, corpse.t * .6);
        model.scale.set(size.x * (swell + wobble), size.y * (swell - wobble), size.z * (swell + wobble * .5));
        if (recipe.spin) model.rotation.set(rotation.x, rotation.y + corpse.t * corpse.t * 70 * motion, rotation.z + Math.sin(corpse.t * 40) * .4 * motion);
        else model.rotation.set(rotation.x + corpse.spin.x * corpse.t * .05, rotation.y, rotation.z + corpse.spin.z * corpse.t * .05);
        if (recipe.blebs && !reduceMotion && (corpse.tick -= dt) <= 0) {
          corpse.tick = .07;
          const angle = this.random() * TAU;
          this.world.burst(position.x + Math.cos(angle) * corpse.size0 * .7, position.y + (this.random() - .3) * corpse.size0,
            position.z + Math.sin(angle) * corpse.size0 * .7, recipe.gore, 6, 1.4);
        }
        clench = -k;
        this.glow(membrane, view, recipe.flash, k * 2.8);
        break;
      }
      case 'puff': {
        // Spins down to nothing as its spores scatter.
        const shrink = Math.max(.02, (1 - k) ** .7);
        model.position.copy(position);
        model.position.y += k * .4;
        model.scale.copy(size).multiplyScalar(shrink * (1 + .25 * Math.sin(k * Math.PI)));
        model.rotation.set(rotation.x, rotation.y + k * 9 * motion, rotation.z);
        if (view.fringe) view.fringe.scale.setScalar(1 + .6 * k);
        clench = -1;
        this.glow(membrane, view, recipe.flash, 1.6 * (1 - k));
        if (!reduceMotion && (corpse.tick -= dt) <= 0) {
          corpse.tick = .06;
          this.fx?.sprite(this.fx.glow, model.position, { size: .2, grow: .5, life: .6, additive: true, color: recipe.flash, opacity: .7,
            vx: (this.random() - .5) * 2.4, vy: .4 + this.random(), vz: (this.random() - .5) * 2.4 });
        }
        break;
      }
      case 'melt': clench = this.poseMelt(corpse, dt, reduceMotion); break;
      case 'crash': clench = this.poseCrash(corpse, dt, reduceMotion); break;
      case 'collapse': clench = this.poseCollapse(corpse, dt, reduceMotion); break;
      case 'boss': clench = this.poseBoss(corpse, dt, reduceMotion); break;
      case 'engulf': {
        // Dragged into the macrophage and swallowed.
        const pull = k * k;
        model.position.copy(position).lerp(corpse.devour, pull);
        model.scale.copy(size).multiplyScalar(Math.max(.02, 1 - pull));
        model.rotation.set(rotation.x, rotation.y + k * 12 * motion, rotation.z);
        clench = k;
        this.glow(membrane, view, recipe.flash, k * 1.5);
        break;
      }
    }
    if (view.motion && !reduceMotion) {
      view.motion.mixer.update(dt * 2.4);
      if (view.motion.clench !== undefined) view.motion.influences[view.motion.clench] = Math.max(-1, Math.min(1, clench));
    }
    const shadow = view.shadow;
    shadow.position.set(model.position.x, floorHeight(model.position.x, model.position.z) + .1, model.position.z);
    shadow.scale.setScalar(Math.max(.01, corpse.radius * 1.4 * (model.scale.x / Math.max(.001, size.x))) * (corpse.scale > 1 ? 1.3 : 1));
    return true;
  }

  glow(membrane, view, color, amount) {
    if (!membrane) return;
    membrane.emissive.copy(view.membraneGlow ?? this.black).lerp(this.color.setHex(color), Math.min(1, amount * .5));
    membrane.emissiveIntensity = (view.membraneIntensity ?? .7) + amount;
  }

  darken(membrane, view, amount) {
    if (!membrane) return;
    membrane.emissive.copy(view.membraneGlow ?? this.black).lerp(this.black, amount);
    membrane.emissiveIntensity = (view.membraneIntensity ?? .7) * (1 - amount);
  }

  // Drops to the floor, convulses, then melts into a spreading puddle.
  poseMelt(corpse, dt, reduceMotion) {
    const { view, recipe, size, rotation } = corpse;
    const { model } = view;
    const motion = reduceMotion ? .4 : 1;
    const rest = corpse.floor + corpse.radius * (recipe.pose === 'slump' ? .5 : .38);
    if (!corpse.landed) {
      if (corpse.y === undefined) corpse.y = corpse.position.y, corpse.vy = 1.2;
      corpse.vy -= GRAVITY * dt;
      corpse.y += corpse.vy * dt;
      corpse.position.addScaledVector(corpse.velocity, dt);
      corpse.velocity.multiplyScalar(Math.exp(-dt * 3));
      if (corpse.y <= rest) {
        corpse.y = rest;
        corpse.landed = corpse.t;
        const point = { x: corpse.position.x, y: rest, z: corpse.position.z };
        this.world.burst(point.x, point.y, point.z, recipe.gore, reduceMotion ? 8 : 26, 2.8);
        this.gore(point, recipe, corpse.size0, 4, { speed: 2.4, up: 3 });
        corpse.puddle = this.splat(point.x, point.z, recipe.gore, recipe.splat * corpse.size0, { grow: 1.3, life: 8 });
      }
    }
    const fall = Math.min(1, corpse.t / .38);
    model.position.set(corpse.position.x, corpse.y, corpse.position.z);
    let sx = size.x, sy = size.y, sz = size.z;
    if (recipe.pose === 'lie') model.rotation.set(rotation.x + fall * 1.35 * Math.sign(corpse.spin.x || 1), rotation.y, rotation.z + fall * .3);
    else if (recipe.pose === 'curl') {
      model.rotation.set(rotation.x + fall * 1.2, rotation.y + corpse.t * 3 * motion, rotation.z + fall * 1.8);
      sx *= 1 - .25 * fall; sz *= 1 + .2 * fall;
    } else model.rotation.set(rotation.x * (1 - fall), rotation.y, rotation.z * (1 - fall));
    let clench = 0;
    if (corpse.landed) {
      const since = corpse.t - corpse.landed;
      // Convulsions that fade, then the body dissolves into the floor.
      const spasm = Math.exp(-since * 3.2);
      clench = reduceMotion ? .5 : Math.sin(since * 34) * spasm;
      const jolt = reduceMotion ? 0 : Math.sin(since * 41) * .05 * spasm;
      const melt = Math.max(0, Math.min(1, (corpse.t - (corpse.duration - .85)) / .85));
      const ease = melt * melt * (3 - 2 * melt);
      sx *= (1 + jolt + .45 * ease); sz *= (1 - jolt + .45 * ease); sy *= (1 - jolt - .85 * ease);
      model.position.y -= corpse.radius * .55 * ease;
      this.darken(view.attackMembrane, view, .2 + .8 * ease);
      if (!reduceMotion && melt > 0 && (corpse.tick -= dt) <= 0) {
        corpse.tick = .09;
        const angle = this.random() * TAU, reach = this.random() * corpse.size0 * .8;
        this.fx?.sprite(this.fx.glow, { x: corpse.position.x + Math.cos(angle) * reach, y: corpse.floor + .1, z: corpse.position.z + Math.sin(angle) * reach },
          { size: .14, grow: .9, life: .45, additive: true, color: recipe.gore, opacity: .55, vx: 0, vy: .5, vz: 0 });
      }
    } else this.glow(view.attackMembrane, view, recipe.flash, 1.4 * (1 - fall));
    model.scale.set(sx, Math.max(.02, sy), sz);
    return clench;
  }

  // A drone that loses power: it sparks, smokes and tumbles, then blows apart on the floor.
  poseCrash(corpse, dt, reduceMotion) {
    const { view, size, rotation, position } = corpse;
    const { model } = view;
    if (corpse.y === undefined) corpse.y = position.y, corpse.vy = corpse.recipe.curl ? 3.2 : 2.2;
    const rest = corpse.floor + corpse.radius * (corpse.recipe.curl ? .3 : .45);
    corpse.vy -= GRAVITY * dt;
    corpse.y += corpse.vy * dt;
    position.addScaledVector(corpse.velocity, dt);
    corpse.velocity.multiplyScalar(Math.exp(-dt * 1.5));
    if (corpse.y <= rest) {
      corpse.y = rest;
      if (corpse.vy < -2) {
        this.world.burst(position.x, rest, position.z, 0xffd27a, reduceMotion ? 6 : 20, 2.6);
        this.fx?.sprite(this.fx.smoke, { x: position.x, y: rest, z: position.z }, { size: 1, grow: 2.5, life: 1, opacity: .45, color: 0x6a5a52, vx: 0, vy: .4, vz: 0 });
      }
      corpse.vy = Math.abs(corpse.vy) * .3;
      corpse.velocity.multiplyScalar(.5);
      corpse.spin.multiplyScalar(.5);
    }
    model.position.set(position.x, corpse.y, position.z);
    const tumble = reduceMotion ? .3 : 1;
    model.rotation.set(rotation.x + corpse.spin.x * corpse.t * .35 * tumble, rotation.y + corpse.spin.y * corpse.t * .2 * tumble, rotation.z + corpse.spin.z * corpse.t * .35 * tumble);
    model.scale.copy(size);
    if (view.laser) view.laser.visible = false;
    if (corpse.recipe.curl && view.legs) {
      const curl = Math.min(1, corpse.t / .5);
      for (const leg of view.legs) {
        const twitch = reduceMotion ? 0 : Math.sin(corpse.t * 40 + leg.node.position.z * 9) * .25 * (1 - curl);
        leg.node.rotation.set(0, twitch * leg.side, leg.side * (.9 * curl + twitch));
      }
    }
    // Flickering power: the eye stutters between dark and overloaded.
    const flicker = this.random() < .35 ? 3 : 0;
    this.glow(view.attackMembrane, view, 0xff6a3a, flicker);
    if (!reduceMotion && (corpse.tick -= dt) <= 0) {
      corpse.tick = .07;
      this.world.burst(model.position.x, model.position.y + .2, model.position.z, this.random() < .5 ? 0xffd27a : 0x9fdcff, 7, 2.2);
      this.fx?.sprite(this.fx.smoke, model.position, { size: .45, grow: 1.6, life: 1.1, opacity: .5, color: 0x2a2422, vx: (this.random() - .5) * .4, vy: .9, vz: (this.random() - .5) * .4 });
    }
    return flicker ? .8 : -.4;
  }

  // A rooted mass that bursts sac by sac and sags into the floor.
  poseCollapse(corpse, dt, reduceMotion) {
    const { view, recipe, size, rotation, position } = corpse;
    const { model } = view;
    const k = Math.min(1, corpse.t / corpse.duration);
    const ease = k * k * (3 - 2 * k);
    const shake = reduceMotion ? 0 : .08 * corpse.size0 * (1 - k * .5);
    model.position.set(position.x + (this.random() - .5) * shake, position.y - corpse.size0 * .9 * ease, position.z + (this.random() - .5) * shake);
    model.scale.set(size.x * (1 + .2 * ease), size.y * Math.max(.05, 1 - .8 * ease), size.z * (1 + .2 * ease));
    model.rotation.copy(rotation);
    if ((corpse.tick -= dt) <= 0) {
      corpse.tick = reduceMotion ? .3 : .15;
      const angle = this.random() * TAU;
      const reach = corpse.size0 * (.3 + this.random() * .4);
      const point = { x: position.x + Math.cos(angle) * reach, y: model.position.y + corpse.size0 * (.2 + this.random() * .5), z: position.z + Math.sin(angle) * reach };
      this.flash(point, recipe.flash, .6, .14);
      this.world.burst(point.x, point.y, point.z, recipe.gore, reduceMotion ? 5 : 16, 2.4);
      this.chunk(point, recipe.gore, { size: .3, speed: 3, up: 4, life: 1.6 });
    }
    if (corpse.puddle) corpse.puddle.size = recipe.splat * corpse.size0 * (1 + .2 * ease);
    this.glow(view.attackMembrane, view, recipe.flash, (1 - k) * (1 + Math.sin(corpse.t * 22)) * 1.2);
    if (k > .7) this.darken(view.attackMembrane, view, (k - .7) / .3);
    return Math.sin(corpse.t * 26) * (1 - k);
  }

  // A boss convulses through a chain of ruptures, falls if it was airborne, then explodes.
  poseBoss(corpse, dt, reduceMotion) {
    const { view, recipe, size, rotation, position } = corpse;
    const { model } = view;
    const k = Math.min(1, corpse.t / corpse.duration);
    const r = corpse.size0 / Math.sqrt(corpse.scale);
    if (corpse.y === undefined) corpse.y = position.y, corpse.vy = 0;
    const rest = corpse.floor + (corpse.floats ? r * .9 : position.y - corpse.floor);
    if (corpse.y > rest + .01) {
      corpse.vy -= GRAVITY * .55 * dt;
      corpse.y = Math.max(rest, corpse.y + corpse.vy * dt);
      if (corpse.y === rest) {
        this.world.burst(position.x, corpse.floor + .2, position.z, 0xc9a07a, reduceMotion ? 10 : 50, 6);
        this.mist({ x: position.x, y: corpse.floor + .4, z: position.z }, 0x5a4038, r * 2.5, reduceMotion ? 3 : 8, { rise: .4, life: 1.6, opacity: .45 });
        if (this.fx && !reduceMotion) this.fx.shake = Math.min(1, this.fx.shake + .5);
      }
    }
    const shake = reduceMotion ? 0 : r * .09 * (.4 + k);
    model.position.set(position.x + (this.random() - .5) * shake, corpse.y + (this.random() - .5) * shake * .5, position.z + (this.random() - .5) * shake);
    const throb = reduceMotion ? 0 : Math.sin(corpse.t * (14 + 26 * k)) * (.03 + .07 * k);
    const sag = corpse.floats ? 0 : .12 * k * k;
    model.scale.set(size.x * (1 + throb + .1 * k), size.y * (1 - throb - sag), size.z * (1 + throb + .1 * k));
    model.rotation.set(rotation.x + (reduceMotion ? 0 : Math.sin(corpse.t * 9) * .08 * k), rotation.y, rotation.z + (reduceMotion ? 0 : Math.cos(corpse.t * 7) * .1 * k));
    if ((corpse.tick -= dt) <= 0) {
      corpse.tick = reduceMotion ? .35 : .17 - .08 * k;
      const angle = this.random() * TAU;
      const point = {
        x: model.position.x + Math.cos(angle) * corpse.size0 * .55,
        y: model.position.y + corpse.size0 * (this.random() * .6 - .1),
        z: model.position.z + Math.sin(angle) * corpse.size0 * .55,
      };
      this.flash(point, recipe.flash, 1.1 + k, .18);
      this.world.burst(point.x, point.y, point.z, recipe.gore, reduceMotion ? 8 : 24, 4);
      this.gore(point, recipe, 2.2, 2, { speed: 3, up: 4 });
      if (this.random() < .4) this.mist(point, recipe.gore, 1.6, 2, { rise: .6, life: 1.2, opacity: .45 });
    }
    this.glow(view.attackMembrane, view, recipe.flash, (.8 + Math.max(0, Math.sin(corpse.t * 30))) * (1 + k * 2));
    return Math.sin(corpse.t * 30);
  }

  // The last moment: the model is gone and its remains fly.
  end(corpse) {
    const { recipe, view } = corpse;
    const model = view.model;
    const point = { x: model.position.x, y: model.position.y, z: model.position.z };
    const size = corpse.size0;
    const reduce = this.reduceMotion;
    switch (recipe.style) {
      case 'rupture': {
        this.flash(point, recipe.flash, size, .2);
        this.world.burst(point.x, point.y, point.z, recipe.gore, reduce ? 14 : 48, 4 * Math.sqrt(size));
        this.world.burst(point.x, point.y, point.z, recipe.flash, reduce ? 6 : 16, 2.4 * Math.sqrt(size));
        this.gore(point, recipe, size, recipe.chunks, { speed: recipe.splash ? 5 : 4 });
        this.mist(point, recipe.gore, size * 1.8, reduce ? 2 : this.low ? 3 : 6, { rise: .35, life: 1.1, opacity: .55 });
        this.splat(point.x, point.z, recipe.gore, recipe.splat * size);
        if (recipe.splash) {
          for (let i = 0; i < 4; i++) {
            const angle = i / 4 * TAU + this.random();
            const reach = size * (1.2 + this.random() * 1.2);
            this.splat(point.x + Math.cos(angle) * reach, point.z + Math.sin(angle) * reach, recipe.gore, size * (.4 + this.random() * .4), { grow: .4 });
          }
        }
        break;
      }
      case 'puff':
        this.splat(point.x, point.z, recipe.gore, recipe.splat * size, { opacity: .6 });
        break;
      case 'melt':
        this.world.burst(point.x, corpse.floor + .15, point.z, recipe.gore, reduce ? 4 : 12, 1.4);
        break;
      case 'crash': {
        const shake = this.fx?.shake ?? 0;
        this.fx?.explode(point.x, point.y, point.z, 2.6, reduce);
        if (this.fx) this.fx.shake = reduce ? 0 : Math.min(1, shake + .18);
        for (let i = 0; i < (this.low ? 5 : 11); i++) {
          const hot = i % 4 === 0;
          this.chunk(point, hot ? 0x3a2a24 : 0x8a9098, {
            shape: i % 2 ? 'shard' : 'rod', size: .16, speed: 6, up: 6, metal: true, glow: hot ? 0xff5a20 : 0, life: 2,
          });
        }
        this.splat(point.x, point.z, recipe.gore, recipe.splat, { opacity: .7, grow: .15 });
        break;
      }
      case 'collapse':
        this.flash(point, recipe.flash, size * .9, .26);
        this.world.burst(point.x, corpse.floor + size * .3, point.z, recipe.gore, reduce ? 16 : 70, 5);
        this.gore(point, recipe, size * .6, 12, { speed: 4, up: 5 });
        if (!this.low) this.mist(point, recipe.gore, size * 1.5, reduce ? 3 : 7, { rise: .5, life: 1.6, opacity: .5 });
        break;
      case 'boss': {
        const shake = this.fx?.shake ?? 0;
        this.fx?.explode(point.x, point.y, point.z, 9, reduce);
        if (this.fx && reduce) this.fx.shake = shake;
        this.world.burst(point.x, point.y, point.z, recipe.gore, reduce ? 30 : 120, 9);
        this.gore(point, recipe, 3, 26, { speed: 6, up: 7, chunkSize: .2 });
        this.mist(point, recipe.gore, size * 1.2, reduce ? 3 : 9, { rise: .7, life: 2.2, opacity: .55 });
        this.splat(point.x, point.z, recipe.gore, size * 1.7, { grow: .5, life: 12 });
        for (let i = 0; i < 6; i++) {
          const angle = i / 6 * TAU + this.random();
          const reach = size * (1.4 + this.random() * 1.6);
          this.splat(point.x + Math.cos(angle) * reach, point.z + Math.sin(angle) * reach, recipe.gore, size * (.25 + this.random() * .3), { grow: .5, life: 10 });
        }
        break;
      }
      case 'engulf':
        break;
    }
  }

  // Hands the model back to the enemy pool, as it was before it died.
  finish(corpse) {
    if (!corpse) return;
    const { view } = corpse;
    view.dying = false;
    if (view.attackMembrane && view.membraneGlow) {
      view.attackMembrane.emissive.copy(view.membraneGlow);
      view.attackMembrane.emissiveIntensity = view.membraneIntensity;
    }
    if (view.guard) view.guard.visible = true;
    if (view.legs) for (const leg of view.legs) leg.node.rotation.set(0, 0, 0);
    if (view.fringe) view.fringe.scale.set(1, 1, 1);
    if (view.motion?.clench !== undefined) view.motion.influences[view.motion.clench] = 0;
    view.model.scale.set(1, 1, 1);
    view.model.rotation.set(0, 0, 0);
    view.enemy = null;
    this.world.releaseEnemyView(view);
  }

  updateChunks(dt) {
    let count = 0;
    for (const item of this.chunks) {
      item.remaining -= dt;
      if (item.remaining <= 0) {
        item.mesh.visible = false;
        this.chunkPool.push(item);
        continue;
      }
      const { mesh, velocity, spin } = item;
      if (!item.resting) {
        velocity.y -= GRAVITY * dt;
        mesh.position.addScaledVector(velocity, dt);
        mesh.rotation.x += spin.x * dt;
        mesh.rotation.y += spin.y * dt;
        mesh.rotation.z += spin.z * dt;
        const floor = floorHeight(mesh.position.x, mesh.position.z) + item.size.y * .3;
        if (mesh.position.y <= floor) {
          mesh.position.y = floor;
          if (item.stain && !item.stained) {
            item.stained = true;
            if (this.random() < .35) this.splat(mesh.position.x, mesh.position.z, item.color, item.size.x * 2.2, { grow: .12, life: 5, opacity: .75 });
          }
          if (Math.abs(velocity.y) < 1.2) {
            item.resting = true;
            // Wet chunks settle flat.
            if (item.stain) item.squash = .55;
            mesh.scale.y = item.size.y * item.squash;
          } else {
            velocity.y = -velocity.y * .28;
            velocity.x *= .5;
            velocity.z *= .5;
            spin.multiplyScalar(.5);
          }
        }
      }
      const fade = Math.min(1, item.remaining / .45);
      if (fade < 1) mesh.scale.set(item.size.x * fade, item.size.y * item.squash * fade, item.size.z * fade);
      this.chunks[count++] = item;
    }
    this.chunks.length = count;
  }

  updateSplats(dt) {
    let count = 0;
    for (const item of this.splats) {
      item.remaining -= dt;
      if (item.remaining <= 0) {
        item.mesh.visible = false;
        this.splatPool.push(item);
        continue;
      }
      const age = item.life - item.remaining;
      const grown = Math.min(1, age / item.grow);
      const spread = item.size * (1 - (1 - grown) ** 3);
      item.mesh.scale.set(Math.max(.01, spread), Math.max(.01, spread * item.aspect), 1);
      item.mesh.material.opacity = item.opacity * Math.min(1, item.remaining / 2);
      this.splats[count++] = item;
    }
    this.splats.length = count;
  }

  clear() {
    for (const corpse of this.corpses) this.finish(corpse);
    for (const item of this.chunks) { item.mesh.visible = false; this.chunkPool.push(item); }
    for (const item of this.splats) { item.mesh.visible = false; this.splatPool.push(item); }
    this.corpses.length = this.chunks.length = this.splats.length = 0;
    this.killed.clear();
    this.lastEvents = null;
  }
}
