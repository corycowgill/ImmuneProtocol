// How pathogens look in the arena: a pooled 3D model per enemy, posed each frame from the
// simulation (drift, spin, attack wind-ups, latching tethers, nests and bosses), and the spore
// globules in flight. Called through World's methods of the same names.
import * as THREE from './vendor/three.module.js';
import { createGuardCarapace } from './organ-world.mjs';
import { OBJECTIVE } from './simulation.mjs';
import { animatePathogen, pathogenMotion } from './enemy-models.mjs';
import { BOSS_FLOATS } from './level-bosses.mjs';
import { membraneMaps } from './arena-textures.mjs';
import { TAU, UP, floorHeight, addMesh } from './arena-scene.mjs';

const FORWARD = new THREE.Vector3(0, 0, 1);

const ATTACK_GLOW = {
  virus: new THREE.Color(0xde653b),
  bacillus: new THREE.Color(0xef9b46),
  spore: new THREE.Color(0xd681b9),
  guard: new THREE.Color(0x5fe0d4),
  splitter: new THREE.Color(0xe798f5),
  phage: new THREE.Color(0xb47cff),
  flagellate: new THREE.Color(0xc46cff),
  blister: new THREE.Color(0xff5c48),
  filovirus: new THREE.Color(0xff5136),
  amoeba: new THREE.Color(0x9f96ff),
  rogue: new THREE.Color(0xff4d3d),
  'rogue-bot': new THREE.Color(0xff5b35),
  crawler: new THREE.Color(0xff6a2a),
};

// The Crawler runs on eight legs. Each leg is its own node pivoted at the hip; two alternating
// sets of four (an insect's tetrapod gait) swing and lift with the distance it covers, and the
// body crouches and splays its legs while it locks its laser.
function updateCrawlerView(world, enemy, view, dt, reduceMotion, charge) {
  view.legs ??= view.model.getObjectByName('crawler-leg-L-0') ? Array.from({ length: 8 }, (_, i) => {
    const side = i < 4 ? -1 : 1, index = i % 4;
    return { node: view.model.getObjectByName(`crawler-leg-${side < 0 ? 'L' : 'R'}-${index}`), side, set: (index + (side > 0 ? 1 : 0)) % 2 };
  }).filter(leg => leg.node) : [];
  const last = view.lastPosition ??= new THREE.Vector3(enemy.x, 0, enemy.z);
  const dx = enemy.x - last.x, dz = enemy.z - last.z;
  const moved = Math.hypot(dx, dz);
  last.set(enemy.x, 0, enemy.z);
  // Face the way it runs; while it holds a laser lock, face its aim.
  if (enemy.laser || enemy.action?.startsWith('laser')) view.facing = enemy.heading ?? view.facing ?? 0;
  else if (moved > .002 && moved < 2) {
    const target = Math.atan2(dx, dz);
    let turn = target - (view.facing ?? target);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    view.facing = (view.facing ?? target) + turn * Math.min(1, dt * 12);
  }
  const speed = dt > 0 ? moved / dt : 0;
  view.stride = THREE.MathUtils.damp(view.stride ?? 0, Math.min(1, speed / 4), 10, dt);
  view.gait = (view.gait ?? view.phase) + moved * 4.2;
  view.crouch = THREE.MathUtils.damp(view.crouch ?? 0, charge, 14, dt);
  const ground = floorHeight(enemy.x, enemy.z);
  const bob = reduceMotion ? 0 : Math.abs(Math.sin(view.gait)) * .05 * view.stride;
  view.model.position.y = enemy.y + ground - view.crouch * .14 + bob;
  view.model.rotation.set(reduceMotion ? 0 : -view.crouch * .12 + view.stride * .05, view.facing ?? enemy.heading ?? 0,
    reduceMotion ? 0 : Math.sin(view.gait) * .035 * view.stride);
  for (const leg of view.legs) {
    const phase = view.gait + leg.set * Math.PI;
    const idle = reduceMotion ? 0 : Math.sin(world.clock * 5 + leg.side * 1.3 + leg.node.position.z * 6) * .04 * (1 - view.stride);
    const swing = (reduceMotion ? 0 : Math.sin(phase) * .42 * view.stride) + idle;
    const lift = reduceMotion ? 0 : Math.max(0, Math.cos(phase)) * .38 * view.stride;
    leg.node.rotation.set(0, swing * leg.side, leg.side * (lift - view.crouch * .22));
  }
}

function updateBotView(world, enemy, view, dt, reduceMotion) {
  view.hit = Math.max(0, view.hit - dt * 7);
  const crawler = enemy.type === 'crawler';
  if (!crawler) view.model.rotation.set(0, enemy.heading || 0, reduceMotion ? 0 : Math.sin(world.clock * 1.7 + view.phase) * .025);
  view.model.scale.setScalar(1 + view.hit * .025);
  const charge = enemy.action === 'laser-windup' ? enemy.actionProgress : enemy.action === 'laser-fire' ? 1 : 0;
  if (crawler) updateCrawlerView(world, enemy, view, dt, reduceMotion, charge);
  if (!reduceMotion) animatePathogen(view.motion, dt, enemy.action === 'laser-fire' ? 1 : charge * .25);
  if (view.attackMembrane) view.attackMembrane.emissiveIntensity = view.membraneIntensity + charge * 1.6 + view.hit;
  if (!view.laser) {
    world.botLaserGeometry ??= new THREE.CylinderGeometry(1, 1, 1, 8);
    view.laser = new THREE.Group();
    for (const core of [false, true]) view.laser.add(new THREE.Mesh(world.botLaserGeometry,
      new THREE.MeshBasicMaterial({ color: core ? 0xffe7cb : 0xff2c18, transparent: true,
        opacity: core ? .9 : .32, depthWrite: false, toneMapped: false })));
    world.scene.add(view.laser);
  }
  const beam = enemy.laser;
  view.laser.visible = !!beam;
  if (beam) {
    const from = new THREE.Vector3(beam.from.x, beam.from.y, beam.from.z);
    const to = new THREE.Vector3(beam.to.x, beam.to.y, beam.to.z), direction = to.clone().sub(from);
    const length = direction.length();
    view.laser.position.copy(from).add(to).multiplyScalar(.5);
    if (length > .001) view.laser.quaternion.setFromUnitVectors(UP, direction.normalize());
    const firing = beam.stage === 'fire';
    view.laser.children.forEach((mesh, index) => mesh.scale.set(firing ? index ? .026 : .075 : index ? .005 : .016,
      length, firing ? index ? .026 : .075 : index ? .005 : .016));
  }
  view.shadow.position.set(enemy.x, floorHeight(enemy.x, enemy.z) + .1, enemy.z);
  view.shadow.scale.setScalar(enemy.radius * 1.4);
}

// The species' scanned model. If one failed to download, a plain membrane sphere keeps the
// pathogen visible and shootable.
export function enemyTemplate(world, type) {
  if (world.enemyModels.has(type)) return world.enemyModels.get(type);
  world.missingPathogen ??= (() => {
    const placeholder = new THREE.Mesh(new THREE.IcosahedronGeometry(.85, 3), new THREE.MeshStandardMaterial({
      color: 0x9a5a52, roughness: .5, emissive: 0x2a0d0a, emissiveIntensity: .5,
    }));
    placeholder.name = 'attack-membrane';
    return placeholder;
  })();
  return world.missingPathogen;
}

// The Shellback's armored front is a gameplay tell, so the scanned capsid wears
// the procedural carapace on the side that blocks shots.
export function dressGuardModel(world) {
  const model = world.enemyModels.get('guard');
  if (!model) return;
  const carapace = createGuardCarapace(membraneMaps);
  carapace.traverse(part => {
    if (!part.material) return;
    part.material = part.material.clone();
    part.material.color.setHex(0x9ec9c0);
    part.material.sheenColor?.setHex(0x8fe0d6);
  });
  carapace.scale.setScalar(1.12);
  model.add(carapace);
}

export function updateEnemies(world, enemies, dt, reduceMotion = false) {
  for (const view of world.enemyViews.values()) view.present = false;
  for (const enemy of enemies) {
    let view = world.enemyViews.get(enemy.id);
    // A fresh simulation restarts its ids: a view left from another species is not reused.
    if (view && view.type !== enemy.type) {
      world.enemyViews.delete(enemy.id);
      releaseEnemyView(world, view);
      view = null;
    }
    if (!view) {
      view = world.enemyPool.get(enemy.type)?.pop();
      if (view) {
        view.model.visible = view.shadow.visible = true;
        view.hit = view.strike = view.clench = 0;
        view.lastPosition = view.facing = null;
        view.phase = world.random() * TAU;
        view.motion?.mixer?.setTime(0);
        world.enemyViews.set(enemy.id, view);
      }
    }
    if (!view) {
      const model = world.enemyTemplate(enemy.type).clone();
      const membrane = model.getObjectByName('attack-membrane');
      const clonedMembrane = membrane ? membrane.material.clone() : null;
      if (clonedMembrane) membrane.material = clonedMembrane;
      world.scene.add(model);
      const shadow = new THREE.Mesh(world.shadowGeometry, world.shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      world.scene.add(shadow);
      view = {
        model, shadow, type: enemy.type, present: true, hit: 0, strike: 0, phase: world.random() * TAU,
        attackMembrane: membrane?.material,
        clonedMembrane,
        membraneGlow: membrane?.material.emissive.clone(),
        membraneIntensity: membrane?.material.emissiveIntensity,
        spikes: model.getObjectByName('virus-spikes'),
        fringe: model.getObjectByName('spore-fringe'),
        guard: model.getObjectByName('guard-carapace'),
        sacs: model.children.filter(part => part.name === 'splitter-sac'),
        motion: pathogenMotion(model),
        clench: 0,
      };
      world.enemyViews.set(enemy.id, view);
    }
    view.present = true;
    view.enemy = enemy;
    view.shadow.visible = true;
    if (view.tethers) for (const tether of view.tethers) tether.visible = !!enemy.latched;
    view.model.position.set(enemy.x, enemy.y, enemy.z);
    if (enemy.type === 'rogue-bot' || enemy.type === 'crawler') { updateBotView(world, enemy, view, dt, reduceMotion); continue; }
    if (enemy.type === 'colony') {
      view.hit = Math.max(0, view.hit - dt * 7);
      const throb = reduceMotion ? 0 : Math.sin(world.clock * 3.1) * .025;
      view.model.scale.set(1 + throb + view.hit * .07, 1 - throb - view.hit * .06, 1);
      if (view.attackMembrane) view.attackMembrane.emissiveIntensity = view.membraneIntensity + (enemy.telegraph ? .8 : 0) + view.hit * .5;
      if (!reduceMotion) animatePathogen(view.motion, dt);
      view.shadow.visible = false;
      continue;
    }
    if (enemy.boss || enemy.segmentOf) {
      // A boss faces where it is going, towers at its own scale, and glows hotter while it winds
      // up an attack or lies stunned. Burrowed, it is not drawn at all.
      view.model.visible = view.shadow.visible = !enemy.hidden;
      view.hit = Math.max(0, view.hit - dt * 7);
      const floats = BOSS_FLOATS.includes(enemy.boss);
      const telegraph = enemy.warning ? 1 : 0;
      view.clench = THREE.MathUtils.damp(view.clench, telegraph, 6, dt);
      const pulse = reduceMotion ? 0 : Math.sin(world.clock * (2 + telegraph * 6) + view.phase) * (.018 + telegraph * .03);
      view.model.position.y = enemy.y + (floats ? 0 : floorHeight(enemy.x, enemy.z));
      view.model.rotation.set(0, enemy.heading || 0, floats && !reduceMotion ? Math.sin(world.clock * .7 + view.phase) * .06 : 0);
      view.model.scale.set(1 + pulse + view.hit * .02, 1 - pulse - view.hit * .03, 1 + pulse + view.hit * .02).multiplyScalar(enemy.scale);
      if (view.attackMembrane) {
        const exposed = enemy.damageScale > 1 ? .6 + Math.sin(world.clock * 9) * .3 : 0;
        view.attackMembrane.emissiveIntensity = view.membraneIntensity + view.clench * .9 + exposed + view.hit * .5;
      }
      if (!reduceMotion) animatePathogen(view.motion, dt, view.clench);
      view.shadow.position.set(enemy.x, floorHeight(enemy.x, enemy.z) + .1, enemy.z);
      view.shadow.scale.setScalar(enemy.radius * (floats ? 1.3 : 1.8));
      continue;
    }
    if (enemy.nest) {
      // A brood nest sits rooted to the floor, swollen, and throbs faster as it is shot.
      view.hit = Math.max(0, view.hit - dt * 7);
      const throb = reduceMotion ? 0 : Math.sin(world.clock * 2.4 + view.phase) * .04;
      // Rooted: it follows the floor, turned at a fixed angle, and swells without leaving it.
      view.model.position.y = floorHeight(enemy.x, enemy.z) + enemy.y * (1 + throb * .5 - view.hit * .04) - .06;
      view.model.rotation.set(0, view.phase, 0);
      view.model.scale.set(1 + view.hit * .03, 1 + throb * .5 - view.hit * .04, 1 + view.hit * .03).multiplyScalar(enemy.scale);
      if (view.attackMembrane) {
        view.attackMembrane.emissiveIntensity = view.membraneIntensity + .15 + throb * 4 + view.hit * .5;
      }
      if (!reduceMotion) animatePathogen(view.motion, dt, throb * 8);
      view.shadow.position.set(enemy.x, floorHeight(enemy.x, enemy.z) + .1, enemy.z);
      view.shadow.scale.setScalar(enemy.radius * 1.9);
      continue;
    }
    const angle = view.phase + world.clock * (enemy.type === 'virus' ? .64 : .9);
    view.model.rotation.set(
      reduceMotion ? 0 : Math.sin(angle * .74) * .24,
      reduceMotion ? enemy.heading || 0 : angle,
      reduceMotion ? 0 : Math.sin(angle * .66) * .22,
    );
    view.strike = Math.max(0, view.strike - dt);
    if (view.strike > 0 && !enemy.latched && !reduceMotion) {
      const thrust = Math.sin(view.strike / .23 * Math.PI);
      view.model.position.lerp(enemy.node ?? OBJECTIVE, thrust * .10);
      view.model.rotation.z += thrust * .15;
    }
    view.hit = Math.max(0, view.hit - dt * 7);
    const pulse = 1 + (reduceMotion ? 0 : Math.sin(angle * 3) * .045 + view.hit * .13);
    view.model.scale.set(pulse, pulse - view.hit * .18, pulse);
    world.poseEnemyAttack(enemy, view, reduceMotion);
    if (!reduceMotion) animatePathogen(view.motion, dt, view.clench);
    if (enemy.latched) world.updateTethers(enemy, view, angle, reduceMotion);
    if (view.guard && !enemy.latched) {
      view.model.rotation.set(reduceMotion ? 0 : Math.sin(angle * 3) * .042, enemy.heading, 0);
    }
    if (view.guard) view.guard.rotation.x = view.strike > 0 && !reduceMotion ? Math.sin(view.strike / .23 * Math.PI) * .22 : 0;
    if (!reduceMotion && view.sacs.length) {
      view.sacs.forEach((sac, index) => {
        const swell = 1 + Math.sin(angle * 7 + index * Math.PI) * .085;
        sac.scale.set(.54 * swell, .66 / swell, .78 * swell);
      });
    }
    if (enemy.fragment) view.model.scale.multiplyScalar(.62);
    view.shadow.position.set(enemy.x, floorHeight(enemy.x, enemy.z) + .1, enemy.z);
    view.shadow.scale.setScalar((enemy.radius || .9) * 1.4);
  }
  for (const [id, view] of world.enemyViews) {
    if (view.present) continue;
    world.enemyViews.delete(id);
    // A pathogen that was killed plays its death before its model goes back to the pool.
    if (!world.deaths?.claim(id, view)) releaseEnemyView(world, view);
  }
}

// Returns a view's model to its species pool, or frees it when the pool is full.
export function releaseEnemyView(world, view) {
  let pool = world.enemyPool.get(view.type);
  if (!pool) world.enemyPool.set(view.type, pool = []);
  if (pool.length < 12) {
    view.model.visible = view.shadow.visible = false;
    if (view.laser) view.laser.visible = false;
    if (view.tethers) for (const tether of view.tethers) tether.visible = false;
    pool.push(view);
  } else {
    world.scene.remove(view.model, view.shadow);
    if (view.tethers) world.scene.remove(...view.tethers);
    view.clonedMembrane?.dispose();
    view.motion?.mixer?.uncacheRoot(view.model);
    if (view.laser) {
      world.scene.remove(view.laser);
      for (const mesh of view.laser.children) mesh.material.dispose();
    }
  }
}

export function poseEnemyAttack(world, enemy, view, reduceMotion) {
  const { model, attackMembrane, spikes, fringe } = view;
  const progress = enemy.actionProgress ?? 0;
  const motion = reduceMotion ? .55 : 1;
  let glow = 0;
  // Scanned models coil (positive) or flare (negative) their spikes and tendrils.
  view.clench = 0;
  if (spikes) spikes.scale.setScalar(1);
  if (fringe) fringe.scale.set(1, 1, 1);
  switch (enemy.action) {
    case 'virus-windup':
      model.rotation.set(-.27 * progress * motion, enemy.heading, 0);
      model.scale.x *= 1 + .18 * progress * motion;
      model.scale.y *= 1 - .36 * progress * motion;
      model.scale.z *= 1 - .24 * progress * motion;
      spikes?.scale.setScalar(1 - .22 * progress * motion);
      view.clench = progress * motion;
      glow = .32 + .68 * progress;
      break;
    case 'virus-pounce': {
      const thrust = Math.sin(progress * Math.PI);
      model.rotation.set((.42 - progress * .84) * motion, enemy.heading, 0);
      model.scale.set(1 - .17 * thrust * motion, 1 - .16 * thrust * motion, 1 + .52 * thrust * motion);
      spikes?.scale.setScalar(1 + .11 * thrust * motion);
      view.clench = -.8 * thrust * motion;
      glow = .9;
      break;
    }
    case 'virus-recover': {
      const recoil = Math.sin(progress * Math.PI) * motion;
      model.rotation.set(-.46 * recoil, enemy.heading, 0);
      model.scale.set(1 + .23 * recoil, 1 - .34 * recoil, 1 + .18 * recoil);
      view.clench = .4 * recoil;
      glow = (1 - progress) * .42;
      break;
    }
    case 'spore-windup':
      model.rotation.set(-.20 * progress * motion, enemy.heading, 0);
      model.scale.x *= 1 + .30 * progress * motion;
      model.scale.y *= 1 - .23 * progress * motion;
      model.scale.z *= 1 + .30 * progress * motion;
      fringe?.scale.set(1 - .20 * progress * motion, 1 - .36 * progress * motion, 1 - .20 * progress * motion);
      view.clench = progress * motion;
      glow = .34 + .66 * progress;
      break;
    case 'spore-recover': {
      const expel = Math.pow(1 - progress, 3) * motion;
      model.rotation.set(.36 * expel, enemy.heading, 0);
      model.scale.set(1 - .28 * expel, 1 + .35 * expel, 1 - .28 * expel);
      fringe?.scale.set(1 + .29 * expel, 1 + .27 * expel, 1 + .29 * expel);
      view.clench = -expel;
      glow = (1 - progress) * .48;
      break;
    }
    case 'bacillus-windup':
      model.scale.y *= 1 + .29 * progress * motion;
      view.clench = progress * motion;
      glow = .23 + .65 * progress;
      break;
    case 'bacillus-tear':
      model.scale.y *= 1 - .23 * Math.sin(progress * Math.PI) * motion;
      view.clench = -.7 * Math.sin(progress * Math.PI) * motion;
      glow = .76 * (1 - progress);
      break;
  }
  if (attackMembrane) {
    attackMembrane.emissive.copy(view.membraneGlow).lerp(ATTACK_GLOW[enemy.type], glow * .58);
    attackMembrane.emissiveIntensity = view.membraneIntensity + glow * .66;
  }
}

export function updateTethers(world, enemy, view, angle, reduceMotion) {
  if (!view.tethers) {
    view.tethers = [-1, 1].map(() => addMesh(world.scene, world.tetherGeometry, world.tetherMaterial));
  }
  const anchor = enemy.attackAnchor ?? enemy.node ?? OBJECTIVE;
  const dx = anchor.x - enemy.x;
  const dz = anchor.z - enemy.z;
  const distance = Math.max(.01, Math.hypot(dx, dz));
  const x = dx / distance;
  const z = dz / distance;
  const progress = enemy.actionProgress ?? 0;
  const windup = enemy.action === 'bacillus-windup' ? progress : 0;
  const tear = enemy.action === 'bacillus-tear' ? Math.sin(progress * Math.PI) : 0;
  const motion = reduceMotion ? .55 : 1;
  const lean = view.guard ? .65 : 1;
  const pull = (.58 + (reduceMotion ? 0 : Math.sin(angle * 3) * .06) - windup * .44 * motion + tear * .69 * motion) * lean;
  view.model.rotation.set(z * pull, Math.atan2(x, z), -x * pull);
  view.model.position.x -= x * (windup * .23 - tear * .18) * motion;
  view.model.position.z -= z * (windup * .23 - tear * .18) * motion;
  view.tethers.forEach((tether, index) => {
    const spread = index === 0 ? -.15 : .15;
    world.tetherStart.set(view.model.position.x + x * .20 + z * spread,
      view.model.position.y + .04, view.model.position.z + z * .20 - x * spread);
    const radius = enemy.attackAnchor ? .45 : .89;
    world.tetherEnd.set(anchor.x - x * radius + z * spread * 1.45,
      anchor.y + spread * 1.4, anchor.z - z * radius - x * spread * 1.45);
    world.tetherDirection.subVectors(world.tetherEnd, world.tetherStart);
    const width = 1 + windup * .4 + tear * .2;
    tether.scale.set(width, world.tetherDirection.length(), width);
    tether.position.copy(world.tetherStart).lerp(world.tetherEnd, .5);
    tether.quaternion.setFromUnitVectors(UP, world.tetherDirection.normalize());
  });
}

export function updateProjectiles(world, projectiles, reduceMotion) {
  for (const view of world.projectileViews.values()) view.present = false;
  for (const projectile of projectiles) {
    let view = world.projectileViews.get(projectile.id);
    if (!view) {
      view = {
        model: addMesh(world.scene, world.sporeDroplet, world.sporeDropletMaterial),
        trail: addMesh(world.scene, world.sporeTrail, world.sporeTrailMaterial),
      };
      world.projectileViews.set(projectile.id, view);
    }
    view.present = true;
    const radius = projectile.radius;
    const direction = world.projectileDirection.set(projectile.vx, projectile.vy, projectile.vz).normalize();
    view.model.position.set(projectile.x, projectile.y, projectile.z);
    view.model.scale.set(radius * .88, radius * .88, radius * 1.35);
    if (direction.lengthSq() > 0) view.model.quaternion.setFromUnitVectors(FORWARD, direction);
    view.trail.visible = world.quality !== 'low' && !reduceMotion;
    if (view.trail.visible) {
      view.trail.position.copy(view.model.position).addScaledVector(direction, -radius * 1.48);
      view.trail.quaternion.copy(view.model.quaternion);
      view.trail.scale.set(radius * .41, radius * .41, radius * 2.3);
    }
  }
  for (const [id, view] of world.projectileViews) {
    if (view.present) continue;
    world.scene.remove(view.model, view.trail);
    world.projectileViews.delete(id);
  }
}
