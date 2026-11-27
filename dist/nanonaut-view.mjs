// How the Nanonaut looks in motion: its skinned, motion-captured model (tools/nanonaut), the
// game's own carbine in its hands, and an animation system in two layers. The legs choose between
// standing, walking, strafing, backing off, running and crouching from how it actually moves,
// played at the speed that keeps its boots planted; the upper body chooses between aiming, the
// low-ready carry, hiding behind cover and reloading. On top, the spine is turned each frame so
// the barrel points exactly where the simulation aims it, and shots kick it back.
import * as THREE from './vendor/three.module.js';
import { createArsenalView } from './arsenal-models.mjs';

// Bones that belong to the legs' layer; everything else is the upper body's.
const LOWER = new Set(['root', 'hips', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'foot_L', 'foot_R', 'toe_L', 'toe_R']);
const LOWER_CLIPS = ['Stand', 'Walk', 'WalkBack', 'StrafeL', 'StrafeR', 'Run', 'Crouch', 'CrouchWalk'];
const UPPER_CLIPS = ['Aim', 'LowReady', 'Cover', 'Reload'];
const FULL_CLIPS = ['DodgeL', 'DodgeR', 'Stagger', 'DeathBack', 'DeathFront'];
// The speed each locomotion clip was captured at (tools/nanonaut/reports/clips.json): playback
// is scaled to the real speed so feet do not slide.
const CLIP_SPEED = { Walk: 1.6, WalkBack: 1.24, StrafeL: 1.31, StrafeR: 1.04, Run: 2.5, CrouchWalk: .55 };
// The carbine in the weapon bone's frame: the same hold and scale as a teammate's.
const CARBINE_SCALE = .68;
const UP = new THREE.Vector3(0, 1, 0);

// Clones a skinned template with its own skeleton (Object3D.clone shares the original's bones).
export function cloneSkinned(source) {
  const clone = source.clone();
  const sources = new Map(), clones = new Map();
  (function walk(a, b) {
    sources.set(b, a); clones.set(a, b);
    for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]);
  })(source, clone);
  clone.traverse(node => {
    if (!node.isSkinnedMesh) return;
    const original = sources.get(node);
    node.skeleton = original.skeleton.clone();
    node.skeleton.bones = original.skeleton.bones.map(bone => clones.get(bone));
    node.bind(node.skeleton, original.bindMatrix);
  });
  return clone;
}

function split(clip, keep) {
  const tracks = clip.tracks.filter(track => keep(track.name.split('.')[0]));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

let carbineTemplate = null;
function carbine() {
  // One arsenal view builds the carbine; every Nanonaut carries a clone of it (shared geometry).
  if (!carbineTemplate) {
    const arsenal = createArsenalView({ showHands: false });
    arsenal.setLoadout();
    arsenal.model.updateMatrixWorld(true);
    carbineTemplate = { model: arsenal.model, muzzle: arsenal.muzzle.position.clone() };
  }
  return carbineTemplate;
}

// The animated rig for one placed copy of the model: its mixer, both layers and the carbine.
export function createNanonautRig(model) {
  const clips = new Map((model.userData.clips ?? []).map(clip => [clip.name, clip]));
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  const add = (name, clip, loop = true) => {
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.enabled = true;
    action.weight = 0;
    action.play();
    actions[name] = action;
  };
  for (const name of LOWER_CLIPS) add(name, clips.get(name) && split(clips.get(name), bone => LOWER.has(bone)));
  for (const name of UPPER_CLIPS) add(name, clips.get(name) && split(clips.get(name), bone => !LOWER.has(bone)), name !== 'Reload');
  for (const name of FULL_CLIPS) add(name, clips.get(name), false);
  for (const name of FULL_CLIPS) actions[name]?.stop();
  const bone = name => model.getObjectByName(name);
  const bones = { spine: bone('spine'), chest: bone('chest'), neck: bone('neck'), head: bone('head'), weapon: bone('weapon') };
  // The carbine.
  const { model: gunTemplate, muzzle: muzzlePoint } = carbine();
  const gun = gunTemplate.clone();
  gun.scale.setScalar(CARBINE_SCALE);
  // Carbine forward is -Z and up +Y; the bone's barrel axis is +Y and up +Z.
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, 0, .012);
  gun.traverse(part => { if (part.isMesh) { part.castShadow = true; part.frustumCulled = false; } });
  bones.weapon?.add(gun);
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(muzzlePoint);
  gun.add(muzzle);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.05, .22, 7), new THREE.MeshBasicMaterial({
    color: 0xffd08a, transparent: true, opacity: .9, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.rotation.x = -Math.PI / 2;
  flash.position.z = -.1;
  flash.visible = false;
  muzzle.add(flash);
  const weights = Object.fromEntries(Object.keys(actions).map(name => [name, 0]));
  return { mixer, actions, weights, bones, gun, muzzle, flash, recoil: 0, flashTime: 0, flinch: new THREE.Vector3(), phase: Math.random(),
    lastPosition: null, full: null, facing: null, lean: 0 };
}

const temp = { q: new THREE.Quaternion(), p: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3(), d: new THREE.Vector3() };

// Turns a bone by a world-space rotation, keeping its children with it.
function turnWorld(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  bone.parent.getWorldQuaternion(temp.p);
  temp.v.copy(axis).applyQuaternion(temp.p.invert());
  temp.q.setFromAxisAngle(temp.v.normalize(), angle);
  bone.quaternion.premultiply(temp.q);
  bone.updateMatrixWorld(true);
}

// Blends each layer's weights toward their targets (crossfading at `rate` per second).
function blend(rig, targets, dt, rate = 9) {
  for (const [name, action] of Object.entries(rig.actions)) {
    if (FULL_CLIPS.includes(name) && rig.full !== name) { rig.weights[name] = 0; action.weight = 0; continue; }
    const want = targets[name] ?? 0;
    rig.weights[name] += (want - rig.weights[name]) * Math.min(1, dt * rate);
    action.weight = rig.weights[name];
  }
}

function playFull(rig, name) {
  if (rig.full === name) return;
  rig.full = name;
  const action = rig.actions[name];
  if (!action) return;
  action.reset().play();
  rig.weights[name] = 0;
}

// Poses the rig from the soldier's state for this frame. `state` is the simulation's
// enemy.soldier plus how fast and which way the body moved.
export function poseNanonaut(rig, model, state, dt, reduceMotion) {
  const { actions } = rig;
  const targets = {};
  const local = state.local ?? { forward: 0, right: 0, speed: 0 };
  const crouch = state.stance === 'crouch';
  const aiming = state.aiming;
  // Full-body moments (a dodge, a stagger) take over both layers until they finish.
  if (rig.full) {
    const action = actions[rig.full];
    if (!action || !action.isRunning() || action.time >= action.getClip().duration - .02) rig.full = null;
  }
  if (state.dodge && !rig.full) playFull(rig, state.dodgeDir > 0 ? 'DodgeL' : 'DodgeR');
  if (state.stagger && !rig.full) playFull(rig, 'Stagger');
  if (rig.full) targets[rig.full] = 1;
  else {
    // Legs.
    const speed = local.speed;
    if (crouch) {
      if (speed < .18) targets.Crouch = 1;
      else { targets.CrouchWalk = 1; actions.CrouchWalk.timeScale = Math.max(.5, speed / CLIP_SPEED.CrouchWalk) * Math.sign(local.forward || 1); }
    } else if (speed < .15) targets.Stand = 1;
    else if (!aiming && speed > 2.6) {
      targets.Run = 1;
      actions.Run.timeScale = speed / CLIP_SPEED.Run;
    } else {
      // A directional blend: forward, back, left and right walks, weighted by the direction of travel.
      const f = local.forward / Math.max(speed, 1e-3), r = local.right / Math.max(speed, 1e-3);
      const parts = { Walk: Math.max(0, f), WalkBack: Math.max(0, -f), StrafeL: Math.max(0, -r), StrafeR: Math.max(0, r) };
      const sum = Object.values(parts).reduce((a, b) => a + b, 0) || 1;
      for (const [name, part] of Object.entries(parts)) {
        targets[name] = part / sum;
        if (actions[name]) actions[name].timeScale = THREE.MathUtils.clamp(speed / CLIP_SPEED[name], .4, 2.2);
      }
      if (speed > 2.6) { targets.Run = .6; for (const name of Object.keys(parts)) targets[name] *= .4; actions.Run.timeScale = speed / CLIP_SPEED.Run; }
    }
    // Upper body.
    if (state.reloading) {
      targets.Reload = 1;
      if (!rig.reloading) { actions.Reload.reset().play(); actions.Reload.timeScale = actions.Reload.getClip().duration / Math.max(.5, state.reloadTime); }
    } else if (state.hidden) targets.Cover = 1;
    else if (aiming) targets.Aim = 1;
    else targets.LowReady = 1;
    rig.reloading = state.reloading;
  }
  blend(rig, targets, dt, rig.full ? 14 : 9);
  rig.mixer.update(reduceMotion ? dt * .9 : dt);
  model.updateMatrixWorld(true);
  // Aim correction: turn the spine and chest so the barrel points where the simulation aims.
  const aimWeight = rig.full ? 0 : (rig.weights.Aim ?? 0) * (1 - (rig.weights.Reload ?? 0));
  if (aimWeight > .01 && rig.bones.weapon) {
    for (let pass = 0; pass < 2; pass++) {
      rig.bones.weapon.getWorldQuaternion(temp.q);
      const barrel = temp.v.set(0, 1, 0).applyQuaternion(temp.q);
      const want = temp.d.set(Math.sin(state.aimYaw) * Math.cos(state.aimPitch), Math.sin(state.aimPitch), Math.cos(state.aimYaw) * Math.cos(state.aimPitch));
      const yawError = Math.atan2(barrel.x * want.z - barrel.z * want.x, barrel.x * want.x + barrel.z * want.z);
      const pitchError = Math.asin(THREE.MathUtils.clamp(want.y, -1, 1)) - Math.asin(THREE.MathUtils.clamp(barrel.y, -1, 1));
      const yaw = -THREE.MathUtils.clamp(yawError, -1, 1) * aimWeight, pitch = THREE.MathUtils.clamp(pitchError, -.9, .9) * aimWeight;
      const right = temp.w.set(Math.cos(state.aimYaw), 0, -Math.sin(state.aimYaw));
      turnWorld(rig.bones.spine, UP, yaw * .55);
      turnWorld(rig.bones.chest, UP, yaw * .45);
      turnWorld(rig.bones.spine, right, -pitch * .45);
      turnWorld(rig.bones.chest, right, -pitch * .55);
    }
  }
  // Recoil and hit flinches on top.
  rig.recoil *= Math.exp(-dt * 16);
  if (rig.recoil > .01 && !reduceMotion) {
    const right = temp.w.set(Math.cos(state.aimYaw), 0, -Math.sin(state.aimYaw));
    turnWorld(rig.bones.chest, right, rig.recoil * .07);
    turnWorld(rig.bones.head, right, rig.recoil * .03);
  }
  if (rig.flinch.lengthSq() > 1e-5 && !reduceMotion) {
    turnWorld(rig.bones.spine, temp.w.set(1, 0, 0), rig.flinch.x);
    turnWorld(rig.bones.chest, temp.w.set(0, 0, 1), rig.flinch.z);
    rig.flinch.multiplyScalar(Math.exp(-dt * 10));
  }
  rig.flashTime = Math.max(0, rig.flashTime - dt);
  rig.flash.visible = !reduceMotion && rig.flashTime > 0;
  if (rig.flash.visible) rig.flash.rotation.z = Math.random() * Math.PI;
}

export function fireNanonaut(rig, reduceMotion, out) {
  rig.recoil = 1;
  rig.flashTime = reduceMotion ? 0 : .05;
  rig.flash.scale.setScalar(.8 + Math.random() * .5);
  return rig.muzzle.getWorldPosition(out);
}

export function flinchNanonaut(rig, from, model, heavy) {
  // Rocked away from the shot: more by heavy rounds.
  const dx = model.position.x - from.x, dz = model.position.z - from.z, d = Math.hypot(dx, dz) || 1;
  const facing = model.rotation.y;
  const back = (dx / d) * Math.sin(facing) + (dz / d) * Math.cos(facing);
  const side = (dx / d) * Math.cos(facing) - (dz / d) * Math.sin(facing);
  const kick = heavy ? .28 : .12;
  rig.flinch.x -= back * kick;
  rig.flinch.z += side * kick;
}

// The game's view of one Nanonaut, each frame (called from pathogen-views.mjs).
export function updateNanonautView(world, enemy, view, dt, reduceMotion, floor) {
  const rig = view.rig;
  const s = enemy.soldier ?? {};
  const last = rig.lastPosition ??= new THREE.Vector3(enemy.x, 0, enemy.z);
  const dx = enemy.x - last.x, dz = enemy.z - last.z;
  last.set(enemy.x, 0, enemy.z);
  const moved = Math.hypot(dx, dz);
  // Velocity, smoothed, in the body's own frame.
  const vx = moved < 2 && dt > 0 ? dx / dt : 0, vz = moved < 2 && dt > 0 ? dz / dt : 0;
  rig.vx = THREE.MathUtils.damp(rig.vx ?? 0, vx, 10, dt);
  rig.vz = THREE.MathUtils.damp(rig.vz ?? 0, vz, 10, dt);
  const yaw = s.aimYaw ?? enemy.heading ?? 0;
  let turn = yaw - (rig.facing ?? yaw);
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  rig.facing = (rig.facing ?? yaw) + turn * Math.min(1, dt * 10);
  const forward = rig.vx * Math.sin(rig.facing) + rig.vz * Math.cos(rig.facing);
  const right = -(rig.vx * Math.cos(rig.facing) - rig.vz * Math.sin(rig.facing));
  const speed = Math.hypot(rig.vx, rig.vz);
  view.model.position.set(enemy.x, (enemy.feet ?? 0) + floor, enemy.z);
  view.model.rotation.set(0, rig.facing, 0);
  view.hit = Math.max(0, view.hit - dt * 7);
  const aimingStates = new Set(['strafe', 'peek', 'push', 'backoff', 'search']);
  poseNanonaut(rig, view.model, {
    local: { forward, right, speed }, stance: s.stance, aiming: aimingStates.has(s.state) || (s.state === 'advance' && speed < 2.6),
    hidden: s.state === 'cover' || s.state === 'to-cover' && speed < 1, reloading: s.state === 'reload', reloadTime: 2.2,
    dodge: s.state === 'dodge', dodgeDir: s.dodgeDir, stagger: enemy.stunRemaining > 0,
    aimYaw: rig.facing, aimPitch: s.aimPitch ?? 0,
  }, dt, reduceMotion);
}

// The guide's turntable: it stands aiming, and "provoke" plays its reload.
export function createNanonautDisplay(model) {
  const rig = createNanonautRig(model);
  let provoke = 0;
  return {
    rig, humanoid: true,
    provoke() { provoke = 2.2; },
    update(dt) {
      provoke = Math.max(0, provoke - dt);
      poseNanonaut(rig, model, { local: { forward: 0, right: 0, speed: 0 }, stance: 'stand', aiming: provoke === 0, reloading: provoke > 0,
        reloadTime: 2.2, aimYaw: model.rotation.y, aimPitch: 0 }, dt, false);
    },
  };
}

// A death: the soldier falls the way the shot that killed it pushed it, and lies there.
export function dieNanonaut(rig, model, corpse, dt) {
  if (!corpse.humanDeath) {
    const facing = model.rotation.y;
    const along = corpse.dir.x * Math.sin(facing) + corpse.dir.z * Math.cos(facing);
    corpse.humanDeath = along > .2 ? 'DeathFront' : 'DeathBack';
    rig.full = null;
    playFull(rig, corpse.humanDeath);
    rig.flash.visible = false;
  }
  blend(rig, { [corpse.humanDeath]: 1 }, dt, 18);
  rig.mixer.update(dt);
}
