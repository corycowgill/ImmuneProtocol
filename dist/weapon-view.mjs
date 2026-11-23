// The first-person view: the carried weapon's sway, recoil, reload and swap animation, the
// repair tool and its stream, and the shots, tracers and muzzle light for the player, teammates
// and the turret. Called through World's methods of the same names.
import * as THREE from './vendor/three.module.js';
import { TAU, UP, floorHeight } from './arena-scene.mjs';

export function updateWeapon(world, sim, dt, input, aiming, reduceMotion) {
  const pose = world.weaponPose;
  if (pose.sim !== sim) {
    pose.sim = sim;
    pose.stride = pose.movement = pose.aim = pose.recoil = pose.flash = pose.lowered = 0;
    pose.swayX = pose.swayY = 0;
  }
  const { clamp, damp, lerp, smoothstep } = THREE.MathUtils;
  const moving = reduceMotion ? 0 : Math.min(1, Math.hypot(input.moveX, input.moveZ));
  const sprint = input.sprint && !aiming;
  pose.movement = damp(pose.movement, moving, 11, dt);
  pose.stride += dt * (sprint ? 14 : 9) * pose.movement;
  pose.aim = damp(pose.aim, aiming ? 1 : 0, 18, dt);
  pose.lowered = damp(pose.lowered, sim.repairing ? 1 : 0, 12, dt);
  // A freshly drawn weapon rises from below the frame.
  pose.swap = sim.switching > 0 ? 1 - smoothstep(sim.switchProgress ?? 1, 0, 1) : damp(pose.swap, 0, 20, dt);
  pose.recoil = damp(pose.recoil, 0, 16, dt);
  pose.flash = Math.max(0, pose.flash - dt);
  pose.swayX = damp(pose.swayX, reduceMotion ? 0 : clamp(input.lookX * .001, -.027, .027), 15, dt);
  pose.swayY = damp(pose.swayY, reduceMotion ? 0 : clamp(input.lookY * .001, -.023, .023), 15, dt);

  const { model, muzzle, flash, magazine, magazineGrip, supportHand, bolt, poseHands } = world.carbine;
  if (sim.events !== world.lastEvents && sim.events.some(event => event.type === 'shot' &&
    (event.playerId == null || event.playerId === sim.player.id))) {
    const kick = sim.weapon.recoil ?? 1;
    pose.recoil = Math.min(1.24 * Math.max(1, kick * .8), pose.recoil + (reduceMotion ? .43 : 1) * kick);
    pose.flash = reduceMotion ? 0 : .037;
    flash.rotation.z = world.random() * TAU;
  }
  const aim = pose.aim;
  const reload = sim.reloadProgress;
  const reloadTilt = smoothstep(reload, 0, .17) * (1 - smoothstep(reload, .82, 1));
  const reach = smoothstep(reload, .035, .195) * (1 - smoothstep(reload, .80, .98));
  const magazineTravel = smoothstep(reload, .195, .43) * (1 - smoothstep(reload, .61, .80));
  const magazineTurn = smoothstep(reload, .30, .49) * (1 - smoothstep(reload, .64, .77));
  const seat = smoothstep(reload, .75, .80) * (1 - smoothstep(reload, .80, .89));
  const walk = Math.sin(pose.stride) * pose.movement * (1 - aim * .88);
  const step = Math.sin(pose.stride * 2) * pose.movement * (1 - aim * .88);
  const idle = reduceMotion ? 0 : Math.sin(world.clock * 2.1) * .005 * (1 - aim);
  const hipX = Math.min(.34, .14 + .12 * world.camera.aspect);
  const sway = 1 - aim * .9;
  const hip = world.carbine.hipOffset;
  model.position.set(
    lerp(hipX + hip.x, -world.weaponSight.x, aim) + walk * .022 - pose.swayX * sway - reloadTilt * .075,
    lerp(-.255 + hip.y, -world.weaponSight.y, aim) + idle + step * .011 + pose.swayY * sway
      + reloadTilt * .07 - pose.lowered * .42 - pose.recoil * .014 - pose.swap * .34,
    lerp(-.60 + hip.z, -.61 + hip.z * .6, aim) + pose.recoil * .068 - reloadTilt * .13,
  );
  model.rotation.set(
    lerp(.12, 0, aim) + pose.recoil * .065 + reloadTilt * .12 - seat * .047 - pose.lowered * .63 - pose.swayY - pose.swap * .7,
    lerp(.18, 0, aim) + reloadTilt * .19 - pose.swayX,
    lerp(-.06, 0, aim) + walk * .035 + reloadTilt * .55 - pose.lowered * .25,
  );
  magazine.position.copy(world.magazineRest);
  magazine.position.x -= magazineTurn * .067;
  magazine.position.y -= magazineTravel * .196;
  magazine.position.z += magazineTurn * .056;
  magazine.rotation.set(magazineTurn * .22, -magazineTurn * .15, -magazineTurn * .24);
  world.magazineHandPosition.copy(magazineGrip).applyQuaternion(magazine.quaternion).add(magazine.position);
  supportHand.position.copy(world.supportRest).lerp(world.magazineHandPosition,reach);
  supportHand.rotation.set(-reach * .24 + magazineTurn * .15, reach * .15, reach * .42 + magazineTurn * .17);
  bolt.position.z = Math.max(pose.recoil * .033, seat * .023);
  poseHands(reach, Math.min(pose.recoil,1));
  flash.visible = pose.flash > 0;
  const flashStrength = sim.weapon.muzzleFlash;
  flash.scale.setScalar(Math.sqrt(flashStrength));
  // Looking through a rifle scope replaces the model with the scope overlay.
  model.visible = pose.lowered < .91 && !(sim.weapon.scope && aim > .86);
  world.carbine.update(dt, pose, sim.player.ammo);
  world.updateRepairTool(sim, idle, walk, reduceMotion);

  world.weaponLightRotation.copy(world.camera.quaternion).invert();
  world.weaponKey.position.set(-1.3, 1.76, -.92)
    .applyQuaternion(world.weaponLightRotation).add(world.weaponKey.target.position);
  world.weaponScene.environmentRotation.setFromQuaternion(world.weaponLightRotation);
  world.weaponFlash.intensity = flash.visible ? 3.4 * flashStrength * (pose.flash / .037) : 0;
  muzzle.getWorldPosition(world.weaponFlash.position);
}

export function updateRepairTool(world, sim, idle, walk, reduceMotion) {
  const { model, nozzle, indicator, reagent } = world.repairTool;
  const raise = THREE.MathUtils.smoothstep(world.weaponPose.lowered, .16, .86);
  model.visible = raise > .02;
  world.toolStream.visible = false;
  if (!model.visible) return;

  model.position.set(Math.min(.23, .11 + world.camera.aspect * .08) + walk * .018,
    -.237 - (1 - raise) * .42 + idle, -.58);
  model.rotation.set(.055 - (1 - raise) * .38, .17, -.07 + walk * .028);
  indicator.emissiveIntensity = .56 + sim.repairProgress * .65;
  reagent.emissiveIntensity = .42 + sim.repairProgress * .32;

  const target = sim.repairTarget ?? sim.objective;
  world.toolTarget.copy(target);
  world.toolTarget.y += floorHeight(target.x, target.z);
  world.toolTarget.z += sim.gash && target === sim.gash ? .49 : .83;
  if (!sim.repairing || raise < .68 || !world.project(world.toolTarget.x, world.toolTarget.y, world.toolTarget.z).visible) return;
  const start = nozzle.getWorldPosition(world.toolStart);
  const ratio = Math.tan(world.camera.fov * Math.PI / 360) / Math.tan(world.weaponCamera.fov * Math.PI / 360);
  start.x *= ratio;
  start.y *= ratio;
  world.camera.localToWorld(start);
  const direction = world.toolDirection.subVectors(world.toolTarget, start);
  if (direction.lengthSq() < .01) return;
  world.toolStream.scale.y = direction.length();
  world.toolStream.position.copy(start).lerp(world.toolTarget, .5);
  world.toolStream.quaternion.setFromUnitVectors(UP, direction.normalize());
  world.toolStream.material.opacity = reduceMotion ? .30 : .36 + Math.sin(world.clock * 17) * .08;
  world.toolStream.visible = true;
}

export function addShot(world, event, flashStrength, reduceMotion) {
  const start = world.carbine.muzzle.getWorldPosition(new THREE.Vector3());
  // Match the on-screen muzzle position across the two camera fields of view.
  const ratio = Math.tan(world.camera.fov * Math.PI / 360) / Math.tan(world.weaponCamera.fov * Math.PI / 360);
  start.x *= ratio;
  start.y *= ratio;
  world.camera.localToWorld(start);
  const end = Number.isFinite(event.x) && Number.isFinite(event.y) && Number.isFinite(event.z)
    ? new THREE.Vector3(event.x, event.y, event.z)
    : new THREE.Vector3(0, 0, -36).applyQuaternion(world.camera.quaternion).add(world.camera.position);
  if (event.rocket) world.explosions.launch(start, end, event.travel, reduceMotion);
  else if (!event.blast) world.addTracer(start, end, world.shotMaterial, event.weapon === 'sniper' ? .12 : .064);
  if (!event.pellet) {
    world.shotLight.intensity = (event.weapon === 'sniper' || event.weapon === 'shotgun' ? 70 : 42) * flashStrength;
    world.shotLight.position.copy(start);
  }
  if (event.hit) world.burst(end.x, end.y, end.z, event.crit ? 0xffc875 : 0xff765a, event.crit ? 18 : 9, 3);
  else if (!event.rocket && !event.blast) world.impacts?.shotMiss(start, end, event.weapon, reduceMotion, event.pellet);
}

export function addTracer(world, start, end, material, remaining) {
  const shot = world.tracerPool.pop();
  if (!shot) return;
  const position = shot.line.geometry.attributes.position;
  position.setXYZ(0, start.x, start.y, start.z);
  position.setXYZ(1, end.x, end.y, end.z);
  position.needsUpdate = true;
  shot.line.material = material;
  shot.line.visible = true;
  shot.remaining = remaining;
  world.shots.push(shot);
}

export function addTeammateShot(world, event, reduceMotion) {
  if (event.blast || !world.teammateView.fire(event.playerId, reduceMotion, world.teammateMuzzle)) return;
  const end = new THREE.Vector3(event.x, event.y, event.z);
  if (event.rocket) world.explosions.launch(world.teammateMuzzle, end, event.travel, reduceMotion);
  else world.addTracer(world.teammateMuzzle, end, world.teammateShotMaterial, .074);
  if (event.hit) world.burst(end.x, end.y, end.z, event.crit ? 0xffc875 : 0xff765a, reduceMotion ? 4 : 8, 2.6);
  else if (!event.rocket) world.impacts?.shotMiss(world.teammateMuzzle, end, event.weapon, reduceMotion, event.pellet);
}

export function addTurretShot(world, event, reduceMotion) {
  const { x, y, z } = event.impact;
  const dx = x - event.x;
  const dz = z - event.z;
  world.turretView.fire(reduceMotion, Math.atan2(dx, dz), Math.atan2(y - event.y, Math.hypot(dx, dz)));
  const start = world.turretView.muzzle.getWorldPosition(world.turretMuzzle);
  world.addTracer(start, new THREE.Vector3(x, y, z), world.turretShotMaterial, .081);
  world.burst(x, y, z, 0xf49b62, reduceMotion ? 3 : 11, 2.2);
}
