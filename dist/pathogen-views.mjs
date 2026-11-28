// How pathogens look in the arena: a pooled 3D model per enemy, posed each frame from the
// simulation (drift, spin, attack wind-ups, latching tethers, nests and bosses), and the spore
// globules in flight. Called through World's methods of the same names.
import * as THREE from './vendor/three.module.js';
import { createGuardCarapace } from './organ-world.mjs';
import { OBJECTIVE } from './simulation.mjs';
import { addPathogenRim, animatePathogen, cloneEnemyModel, pathogenMotion, reapplyMachineGrime } from './enemy-models.mjs';
import { createNanonautRig, updateNanonautView } from './nanonaut-view.mjs';
import { BOSS_FLOATS } from './level-bosses.mjs';
import { ELITES } from './elites.mjs';
import { dressNanobot, hideNanobot, releaseNanobot } from './nanobot-view.mjs';
import { membraneMaps } from './arena-textures.mjs';
import { TAU, UP, floorHeight, groundLevel, baseFloorHeight, addMesh } from './arena-scene.mjs';

const FORWARD = new THREE.Vector3(0, 0, 1);
const HIT_FLASH = new THREE.Color(0xfff0e0);

// Grounds a pathogen with a contact shadow on the floor beneath it. The shadow spreads and fades
// as the model rises, so height above the floor reads at a glance and hovering species no longer
// look composited in.
function placeShadow(world, enemy, view, spread, lift = .1) {
  const radius = enemy.radius || .9;
  const ground = groundLevel(enemy.x, enemy.z, world.clock);
  const height = Math.max(0, view.model.position.y - radius * .8 - ground);
  view.shadow.position.set(enemy.x, ground + lift, enemy.z);
  view.shadow.scale.setScalar(radius * spread * (1 + height * .16));
  view.shadow.material.opacity = world.shadowMaterial.opacity * Math.exp(-height / 3);
}

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
  latcher: new THREE.Color(0x9cff5a),
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
  // The simulation already lifts the crawler onto raised ground; add only the chamber floor.
  const ground = baseFloorHeight(enemy.x, enemy.z);
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
  placeShadow(world, enemy, view, 1.4);
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

// How far the Valve Colony scan's roots reach below its centre at its rendered size (the scan spans
// ±0.945 m, scaled 1.4 in enemy-models.mjs), less a little so the roots bed into the floor.
const COLONY_ROOT = .945 * 1.4 - .1;

export function updateEnemies(world, enemies, dt, reduceMotion = false) {
  for (const view of world.enemyViews.values()) view.present = false;
  const frameDt = dt;
  for (const enemy of enemies) {
    // Parts of a boss (the Mega Nano Bot's pylons and brain) are drawn by the boss's own model.
    if (enemy.noView) continue;
    // A stunned pathogen's own motion all but stops while it twitches in place.
    const stunned = enemy.stunRemaining > 0;
    dt = stunned ? frameDt * .07 : frameDt;
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
        view.knock?.set(0, 0, 0);
        view.phase = world.random() * TAU;
        view.motion?.mixer?.setTime(0);
        if (view.rig) Object.assign(view.rig, { lastPosition: null, facing: null, full: null, recoil: 0, flashTime: 0, vx: 0, vz: 0 });
        world.enemyViews.set(enemy.id, view);
      }
    }
    if (!view && world.enemyTemplate(enemy.type).userData.humanoid) {
      // A Nanonaut: its own skeleton, carbine and animation layers (nanonaut-view.mjs).
      const model = cloneEnemyModel(world.enemyTemplate(enemy.type));
      world.scene.add(model);
      const shadow = new THREE.Mesh(world.shadowGeometry, world.shadowMaterial.clone());
      shadow.rotation.x = -Math.PI / 2;
      world.scene.add(shadow);
      view = { model, shadow, type: enemy.type, present: true, hit: 0, strike: 0, phase: world.random() * TAU, rig: createNanonautRig(model), clench: 0, sacs: [] };
      world.enemyViews.set(enemy.id, view);
    }
    if (!view) {
      const model = world.enemyTemplate(enemy.type).clone();
      const membrane = model.getObjectByName('attack-membrane');
      const clonedMembrane = membrane ? membrane.material.clone() : null;
      if (clonedMembrane) {
        clonedMembrane.userData.pathogenRim = false;
        membrane.material = addPathogenRim(reapplyMachineGrime(clonedMembrane));
      }
      world.scene.add(model);
      const shadow = new THREE.Mesh(world.shadowGeometry, world.shadowMaterial.clone());
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
    if (stunned && !reduceMotion) {
      view.model.position.x += (world.random() - .5) * .07;
      view.model.position.y += (world.random() - .5) * .05;
      view.model.position.z += (world.random() - .5) * .07;
    }
    if (enemy.type === 'rogue-bot' || enemy.type === 'crawler') { updateBotView(world, enemy, view, dt, reduceMotion); dressElite(world, enemy, view, reduceMotion); continue; }
    if (view.rig) {
      updateNanonautView(world, enemy, view, frameDt, reduceMotion, baseFloorHeight(enemy.x, enemy.z));
      dressElite(world, enemy, view, reduceMotion);
      placeShadow(world, enemy, view, 1.05, .06);
      continue;
    }
    if (enemy.type === 'colony') {
      // Rooted on the floor of its valve sleeve: the scan's roots (its lowest point, COLONY_ROOT below
      // the model's centre) sit just into the ground, and it rears up as it readies a spit.
      view.hit = Math.max(0, view.hit - dt * 7);
      view.clench = THREE.MathUtils.damp(view.clench, enemy.charging ? 1 : 0, 9, dt);
      const throb = reduceMotion ? 0 : Math.sin(world.clock * 3.1 + view.phase) * .025;
      const stretch = 1 - throb - view.hit * .06 + view.clench * .07;
      view.model.position.y = groundLevel(enemy.x, enemy.z, world.clock) + COLONY_ROOT * stretch;
      view.model.rotation.set(0, enemy.heading ?? 0, 0);
      view.model.scale.set(1 + throb + view.hit * .07 - view.clench * .03, stretch, 1 + throb + view.hit * .07 - view.clench * .03);
      if (view.attackMembrane) view.attackMembrane.emissiveIntensity = view.membraneIntensity + view.clench * .9 + view.hit * .5;
      if (!reduceMotion) animatePathogen(view.motion, dt, view.clench);
      placeShadow(world, enemy, view, 1.6, .06);
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
      if (enemy.boss === 'nanobot') dressNanobot(world, enemy, view, dt, reduceMotion, enemies);
      placeShadow(world, enemy, view, floats ? 1.3 : 1.8);
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
      placeShadow(world, enemy, view, 1.9);
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
    // A hit flashes the membrane white-hot for an instant.
    if (view.hit > 0 && view.attackMembrane) {
      view.attackMembrane.emissive.lerp(HIT_FLASH, view.hit * .45);
      view.attackMembrane.emissiveIntensity += view.hit * 1.3;
    }
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
    if (view.knock && !reduceMotion) {
      view.model.position.add(view.knock);
      view.knock.multiplyScalar(Math.exp(-dt * 9));
    }
    dressElite(world, enemy, view, reduceMotion);
    placeShadow(world, enemy, view, 1.6);
  }
  for (const [id, view] of world.enemyViews) {
    if (view.present) continue;
    if (view.eliteMark) view.eliteMark.visible = false;
    hideNanobot(view);
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
    view.shadow.material.dispose();
    if (view.tethers) world.scene.remove(...view.tethers);
    view.clonedMembrane?.dispose();
    view.eliteHalo?.material.dispose();
    releaseNanobot(world, view);
    if (view.eliteMark) { world.scene.remove(view.eliteMark); view.eliteMark.material.dispose(); }
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
    case 'virus-coil': // a lunge's warning: the same coil, quicker
    case 'virus-windup':
      model.rotation.set(-.27 * progress * motion, enemy.heading, 0);
      model.scale.x *= 1 + .18 * progress * motion;
      model.scale.y *= 1 - .36 * progress * motion;
      model.scale.z *= 1 - .24 * progress * motion;
      spikes?.scale.setScalar(1 - .22 * progress * motion);
      view.clench = progress * motion;
      glow = .32 + .68 * progress;
      break;
    case 'virus-dash': // darting in to pouncing range, stretched along its run
      model.rotation.set(.3 * motion, enemy.heading, 0);
      model.scale.set(1 - .14 * motion, 1 - .12 * motion, 1 + .4 * motion);
      view.clench = -.5 * motion;
      glow = .75;
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
    case 'cling': {
      // Clamped onto the visor: legs splayed and gripping, the body heaving as it drains the suit,
      // with a quick shudder each time it feeds.
      const feed = reduceMotion ? 0 : Math.sin(world.clock * 9 + view.phase);
      model.rotation.set(-.55 + feed * .05, enemy.heading, feed * .08);
      // Drawn smaller than it is out in the arena so the near side stays in front of the lens.
      model.scale.set(.62 + feed * .03, .52 - feed * .03, .62 + feed * .03);
      view.clench = .75 + feed * .25;
      glow = .7 + .3 * Math.max(0, feed);
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
    // An elite's membrane burns in its mutation's colour.
    if (view.eliteColor) {
      attackMembrane.emissive.lerp(view.eliteColor, .65);
      attackMembrane.emissiveIntensity += .55 + .25 * Math.sin(world.clock * 4 + view.phase);
    }
  }
}

// The glyph floating over an elite, one per mutation: a shield (armoured), chevrons (swift) and a
// circle split in two (splitting). Drawn once in white and tinted by the sprite.
const ELITE_GLYPHS = new Map();
function eliteGlyph(kind) {
  if (ELITE_GLYPHS.has(kind)) return ELITE_GLYPHS.get(kind);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  c.translate(64, 64); c.lineCap = c.lineJoin = 'round';
  const glyph = () => {
    c.beginPath();
    if (kind === 'armoured') { c.moveTo(0, -38); c.lineTo(32, -26); c.lineTo(28, 8); c.quadraticCurveTo(20, 30, 0, 40); c.quadraticCurveTo(-20, 30, -28, 8); c.lineTo(-32, -26); c.closePath(); }
    else if (kind === 'swift') { for (const dx of [-18, 10]) { c.moveTo(dx - 12, -28); c.lineTo(dx + 14, 0); c.lineTo(dx - 12, 28); } }
    else { c.arc(0, 0, 32, 0, Math.PI * 2); c.moveTo(-8, -36); c.lineTo(8, 36); }
  };
  // A dark outline so the glyph reads over bright tissue, then the white mark the sprite tints.
  c.strokeStyle = 'rgba(0,0,0,.65)'; c.lineWidth = 20; glyph(); c.stroke();
  c.strokeStyle = '#ffffff'; c.lineWidth = 10; glyph(); c.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  ELITE_GLYPHS.set(kind, texture);
  return texture;
}

// Dresses a view for its pathogen's elite mutation (elites.mjs), or undresses a pooled one: a
// halo in the mutation's colour around the body, a glyph floating over it, and the membrane tint
// applied in poseEnemyAttack.
function dressElite(world, enemy, view, reduceMotion) {
  const kind = enemy.elite ?? null;
  if (view.eliteKind !== kind) {
    view.eliteKind = kind;
    view.eliteColor = kind ? new THREE.Color(ELITES[kind].color) : null;
    if (kind && !view.eliteHalo) {
      view.eliteHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: world.glow, color: 0xffffff, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending }));
      view.model.add(view.eliteHalo);
    }
    if (view.eliteHalo) {
      view.eliteHalo.visible = !!kind;
      if (kind) view.eliteHalo.material.color.setHex(ELITES[kind].color);
    }
    if (kind && !view.eliteMark) {
      view.eliteMark = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      view.eliteMark.renderOrder = 4;
      world.scene.add(view.eliteMark);
    }
    if (view.eliteMark) {
      view.eliteMark.visible = !!kind;
      if (kind) { view.eliteMark.material.map = eliteGlyph(kind); view.eliteMark.material.color.setHex(ELITES[kind].color); view.eliteMark.material.needsUpdate = true; }
    }
  }
  if (!kind || !view.eliteHalo) return;
  // The glyph bobs over the body, upright whatever the body is doing; not over one on a visor.
  const bob = reduceMotion ? 0 : Math.sin(world.clock * 2.4 + view.phase) * .08;
  view.eliteMark.visible = enemy.action !== 'cling';
  view.eliteMark.position.set(view.model.position.x, view.model.position.y + (enemy.radius ?? 1) * 1.5 + .25 + bob, view.model.position.z);
  view.eliteMark.scale.setScalar(.62);
  // The model's own scale already carries the species' size; the halo wraps its body.
  const breathe = reduceMotion ? 1 : 1 + .08 * Math.sin(world.clock * 3 + view.phase);
  view.eliteHalo.scale.setScalar((enemy.radius ?? 1) * 4.6 * breathe / Math.max(.2, view.model.scale.x));
  view.eliteHalo.material.opacity = .6 + (reduceMotion ? 0 : .12 * Math.sin(world.clock * 5 + view.phase));
  // An armoured elite is visibly bulkier.
  if (kind === 'armoured') view.model.scale.multiplyScalar(1.12);
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
        // A hot halo so the spit reads as a glowing threat, not a matte ball.
        halo: new THREE.Sprite(world.sporeHaloMaterial),
      };
      world.scene.add(view.halo);
      world.projectileViews.set(projectile.id, view);
    }
    view.present = true;
    const radius = projectile.radius;
    const direction = world.projectileDirection.set(projectile.vx, projectile.vy, projectile.vz).normalize();
    view.model.position.set(projectile.x, projectile.y, projectile.z);
    view.model.scale.set(radius * .88, radius * .88, radius * 1.35);
    if (direction.lengthSq() > 0) view.model.quaternion.setFromUnitVectors(FORWARD, direction);
    view.halo.position.copy(view.model.position);
    view.halo.scale.setScalar(radius * (3.4 + (reduceMotion ? 0 : Math.sin(world.clock * 31 + projectile.id) * .4)));
    view.trail.visible = world.quality !== 'low' && !reduceMotion;
    if (view.trail.visible) {
      view.trail.position.copy(view.model.position).addScaledVector(direction, -radius * 1.48);
      view.trail.quaternion.copy(view.model.quaternion);
      view.trail.scale.set(radius * .41, radius * .41, radius * 2.3);
    }
  }
  for (const [id, view] of world.projectileViews) {
    if (view.present) continue;
    world.scene.remove(view.model, view.trail, view.halo);
    world.projectileViews.delete(id);
  }
}
