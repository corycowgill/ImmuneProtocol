import { translate } from './i18n.mjs';
import * as THREE from './vendor/three.module.js';
import { createArsenalView } from './arsenal-models.mjs';
import { riggedSuit, suitModelVersion, suitParts } from './suits.mjs';
import { cloneSkinned, createNanonautRig, fireNanonaut, poseNanonaut } from './nanonaut-view.mjs';

const DOWN = new THREE.Vector3(0, -1, 0);
const { clamp, damp, lerp } = THREE.MathUtils;

export function createTeammate(softMask, { marker: showMarker = true } = {}) {
  const root = new THREE.Group();
  root.name = 'Co-op teammate';
  root.visible = false;
  const body = new THREE.Group();
  root.add(body);
  body.visible = false;
  const ball = new THREE.SphereGeometry(1, 16, 12);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const hull = new THREE.MeshStandardMaterial({ color: 0xa2afb2, metalness: .43, roughness: .48 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x28353c, metalness: .57, roughness: .45 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x191f24, roughness: .88 });
  const signal = new THREE.MeshStandardMaterial({ color: 0x77daea, emissive: 0x34bfd9, emissiveIntensity: .82, roughness: .38 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0x160a0d, map: softMask, transparent: true, opacity: .48, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  shadow.rotation.x = -Math.PI / 2;
  root.add(shadow);
  shadow.visible = false;

  function mesh(parent, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.scale.set(sx, sy, sz);
    parent.add(part);
    return part;
  }

  function joint(parent, x = 0, y = 0, z = 0) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    parent.add(group);
    return group;
  }

  // The rig's joints. Scanned suit parts attach to them; the arm segments are stretched
  // between shoulder, elbow and wrist every frame.
  const upper = joint(body, 0, 1.09);
  const head = joint(upper, 0, .561, -.003);
  const hips = joint(body, 0, .918);
  const legs = [-1, 1].map(side => {
    const thigh = joint(hips, side * .112);
    const shin = joint(thigh, 0, -.403);
    const boot = joint(shin, 0, -.348, -.030);
    return { thigh, shin, boot };
  });
  const arms = [-1, 1].map(side => ({
    side, shoulder: new THREE.Vector3(side * .238, .332, .008),
    bicep: joint(upper), forearm: joint(upper), glove: joint(upper),
  }));

  const suitJoints = { upper, head, hips };
  for (const [index, side] of ['L', 'R'].entries()) {
    suitJoints['thigh_' + side] = legs[index].thigh;
    suitJoints['shin_' + side] = legs[index].shin;
    suitJoints['boot_' + side] = legs[index].boot;
    suitJoints['bicep_' + side] = arms[index].bicep;
    suitJoints['forearm_' + side] = arms[index].forearm;
    suitJoints['glove_' + side] = arms[index].glove;
  }
  // The skinned suit: once a suit's rigged model has loaded it replaces the jointed body, animated by
  // the Nanonaut's motion-captured layers (nanonaut-view.mjs) and carrying this teammate's own rifle.
  let skinned = null; // { model, rig }
  let suitId = null;
  let suitWorn = false;
  let wornVersion = -1;
  const worn = [];
  // Default joint layout, restored for suits without their own pivots.
  const defaultLayout = new Map([upper, head, hips, ...legs.flatMap(leg => [leg.thigh, leg.shin, leg.boot])]
    .map(group => [group, group.position.clone()]));
  const defaultShoulders = arms.map(arm => arm.shoulder.clone());

  function fitRig(rig) {
    for (const [group, position] of defaultLayout) group.position.copy(position);
    arms.forEach((arm, index) => arm.shoulder.copy(defaultShoulders[index]));
    if (!rig) return;
    upper.position.copy(rig.upper);
    head.position.subVectors(rig.head, rig.upper);
    hips.position.copy(rig.hips);
    for (const [index, side] of ['L', 'R'].entries()) {
      legs[index].thigh.position.subVectors(rig['thigh_' + side], rig.hips);
      legs[index].shin.position.subVectors(rig['shin_' + side], rig['thigh_' + side]);
      legs[index].boot.position.subVectors(rig['boot_' + side], rig['shin_' + side]);
      arms[index].shoulder.subVectors(rig['bicep_' + side], rig.upper);
    }
  }

  function wearSuit(id) {
    // Dress once the suit's model has loaded; until then the teammate is not drawn.
    if (id === suitId && suitWorn && wornVersion === suitModelVersion()) return;
    const parts = id ? suitParts(id) : null;
    const rigged = id ? riggedSuit(id) : null;
    suitId = id;
    suitWorn = !!(parts || rigged);
    wornVersion = suitModelVersion();
    shadow.visible = suitWorn;
    for (const part of worn.splice(0)) part.removeFromParent();
    if (skinned) {
      skinned.model.removeFromParent();
      skinned.rig.mixer.stopAllAction();
      skinned = null;
      // The rifle goes back into the jointed body's hands.
      arsenal.model.scale.setScalar(ARSENAL_SCALE);
      arsenal.model.rotation.set(0, 0, 0);
      arsenal.model.position.set(0, .017, 0);
      rifle.add(arsenal.model);
    }
    body.visible = suitWorn && !rigged;
    if (rigged) {
      const model = Object.assign(cloneSkinned(rigged), { userData: rigged.userData });
      model.rotation.y = Math.PI; // the rig faces +Z; a teammate faces -Z
      root.add(model);
      skinned = { model, rig: createNanonautRig(model, { gun: arsenal.model, muzzle: arsenal.muzzle.position.clone() }) };
      return;
    }
    fitRig(parts?.rig);
    if (!parts) return;
    for (const [name, template] of parts) {
      const parent = suitJoints[name];
      if (!parent) continue;
      const part = template.clone();
      part.position.set(0, 0, 0);
      parent.add(part);
      worn.push(part);
    }
  }

  const holding = joint(upper, .12, .265, -.218);
  const rifle = joint(holding);
  const muzzle = joint(rifle, 0, .034, -.533);
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xf9df92, transparent: true, opacity: .85, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = mesh(muzzle, new THREE.ConeGeometry(.038, .15, 6), flashMaterial, 0, 0, -.072);
  flash.rotation.x = -Math.PI / 2;
  // The teammate holds the same weapon model, parts, stickers and charm as their first-person view,
  // scaled down to the rig.
  const arsenal = createArsenalView({ showHands: false });
  const ARSENAL_SCALE = .68;
  arsenal.model.scale.setScalar(ARSENAL_SCALE);
  arsenal.model.position.set(0, .017, 0);
  arsenal.model.traverse(part => { if (part.isMesh) part.castShadow = true; });
  rifle.add(arsenal.model);
  flash.visible = false;

  const sealer = joint(holding);
  mesh(sealer, cube, frame, 0, -.002, -.043, .113, .141, .204);
  mesh(sealer, cube, hull, 0, .007, -.091, .128, .103, .14);
  mesh(sealer, ball, signal, 0, .012, -.174, .046, .041, .038);
  mesh(sealer, cube, fabric, 0, -.072, .036, .076, .126, .080).rotation.x = -.15;
  sealer.visible = false;

  const markerCanvas = document.createElement('canvas');
  markerCanvas.width = 280;
  markerCanvas.height = 70;
  const context = markerCanvas.getContext('2d');
  const markerTexture = new THREE.CanvasTexture(markerCanvas);
  markerTexture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: markerTexture, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false,
  }));
  marker.scale.set(.220, .055, 1);
  marker.renderOrder = 20;
  marker.visible = showMarker;
  root.add(marker);
  let markerName;
  let markerStatus;

  function updateMarker(player) {
    const status = player.downed ? 'Downed' : player.connected === false ? 'Disconnected' : '';
    const fullName = player.name || 'Teammate';
    if (!showMarker || (fullName === markerName && status === markerStatus)) return;
    markerName = fullName;
    markerStatus = status;
    const name = Array.from(fullName).slice(0, 19).join('');
    const label = status ? status + ' · ' + name : name;
    const tint = status ? '#ffc09a' : '#aef3ff';
    context.clearRect(0, 0, 280, 70);
    context.font = 'bold 26px Arial, sans-serif';
    const width = clamp(context.measureText(label).width + 34, 80, 274);
    const left = (280 - width) * .5;
    context.fillStyle = 'rgba(7,20,24,.94)';
    context.fillRect(left, 6, width, 46);
    context.strokeStyle = tint;
    context.lineWidth = 2;
    context.strokeRect(left + 1, 7, width - 2, 44);
    context.fillStyle = tint;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(translate(label), 140, 29, width - 16);
    context.beginPath();
    context.moveTo(130, 51);
    context.lineTo(150, 51);
    context.lineTo(140, 66);
    context.closePath();
    context.fill();
    markerTexture.needsUpdate = true;
  }

  const armDirection = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const restedWrist = new THREE.Vector3(-.235, -.022, -.031);
  const previous = new THREE.Vector2();
  let actorId;
  let gait = 0;
  let stride = 0;
  let downedPose = 0;
  let recoil = 0;
  let flashTime = 0;
  let loadoutKey;
  let previousLoadout = null;
  const velocity = new THREE.Vector2();
  const facingAxis = new THREE.Vector3();
  let firedHold = 0, reloadSeen = 0, reloadTime = 2;

  function linkArm(segment, from, to) {
    armDirection.subVectors(to, from);
    const length = armDirection.length();
    segment.position.copy(from);
    segment.scale.y = length;
    segment.quaternion.setFromUnitVectors(DOWN, armDirection.divideScalar(Math.max(length, .001)));
  }

  function configureRifle(loadout) {
    if (loadout === previousLoadout) return;
    previousLoadout = loadout;
    const key = JSON.stringify(loadout ?? null);
    if (loadoutKey === key) return;
    loadoutKey = key;
    arsenal.setLoadout(loadout ?? undefined);
    muzzle.position.copy(arsenal.muzzle.position).multiplyScalar(ARSENAL_SCALE);
    muzzle.position.y += .017;
    skinned?.rig.muzzle.position.copy(arsenal.muzzle.position);
  }

  function hide() {
    root.visible = false;
    actorId = undefined;
    flash.visible = false;
  }

  let crouchPose = 0, climbPose = 0;
  function update(player, ground, dt, reduceMotion) {
    if (!player) {
      if (actorId !== undefined) hide();
      return;
    }
    const changed = actorId !== player.id;
    if (changed) {
      actorId = player.id;
      previous.set(player.x, player.z);
      gait = stride = recoil = flashTime = 0;
      downedPose = Number(!!player.downed);
      root.rotation.y = player.yaw;
    }
    const stepX = player.x - previous.x, stepZ = player.z - previous.y;
    const distance = Math.hypot(stepX, stepZ);
    previous.set(player.x, player.z);
    root.position.set(player.x, ground, player.z);
    root.visible = true;
    const turn = Math.atan2(Math.sin(player.yaw - root.rotation.y), Math.cos(player.yaw - root.rotation.y));
    root.rotation.y += reduceMotion ? turn : turn * (1 - Math.exp(-20 * dt));
    const walk = reduceMotion || player.downed || distance > 1 ? 0 : clamp(distance / Math.max(dt, .006) / 4.5, 0, 1);
    gait = damp(gait, walk, 14, dt);
    stride += Math.min(.3, distance) * 5.4;
    const prone = Number(!!player.downed);
    downedPose = reduceMotion ? prone : damp(downedPose, prone, 12, dt);
    const rise = reduceMotion ? 0 : Math.sin(stride * 2) * .024 * gait * (1 - downedPose);
    // A teammate crouches (or slides) low, and leans into a ledge as it climbs.
    crouchPose = reduceMotion ? Number(!!player.crouched) : damp(crouchPose, Number(!!player.crouched), 12, dt);
    climbPose = reduceMotion ? Number(!!player.mantling) : damp(climbPose, Number(!!player.mantling), 14, dt);
    body.position.y = rise + .23 * downedPose - crouchPose * .5 * (1 - downedPose);
    body.rotation.x = downedPose * 1.52 + climbPose * .45 + (player.sliding ? -.35 : 0);
    body.rotation.z = reduceMotion ? 0 : Math.sin(stride) * .027 * gait * (1 - downedPose);
    shadow.position.set(0, .025, downedPose * .79);
    shadow.scale.set(.88, lerp(.73, 2.15, downedPose), 1);
    marker.position.y = lerp(2.04, .71, downedPose);
    marker.position.z = 1.25 * downedPose;
    updateMarker(player);

    for (const [index, leg] of legs.entries()) {
      const swing = Math.sin(stride + index * Math.PI) * gait * .52 * (1 - downedPose);
      leg.thigh.rotation.x = swing - downedPose * .19;
      leg.shin.rotation.x = Math.max(0, -swing) * .78 + downedPose * .35;
      leg.boot.rotation.x = -leg.thigh.rotation.x * .50 - leg.shin.rotation.x * .42;
    }

    recoil = damp(recoil, 0, 19, dt);
    flashTime = Math.max(0, flashTime - dt);
    const reload = Math.sin(Math.PI * clamp(player.reloadProgress || 0, 0, 1));
    const repair = !!player.repairing && !prone;
    const aim = !!player.aiming && !prone;
    head.rotation.x = clamp(player.pitch * .45, -.45, .45);
    const pitch = clamp(player.pitch * .84, -1.15, 1.15) - reload * .39 + recoil * .085 - (repair ? .24 : 0);
    holding.position.set(lerp(aim ? .044 : .105, .224, downedPose), lerp(aim ? .385 : .265, .028, downedPose),
      lerp(-.218 + recoil * .033, .072, downedPose));
    holding.rotation.set(lerp(pitch, Math.PI / 2, downedPose), lerp(.18 * reload, .127, downedPose), -.35 * reload);
    holding.updateMatrix();
    rifle.visible = !repair;
    sealer.visible = repair;
    flash.visible = !reduceMotion && !prone && !repair && flashTime > 0;
    configureRifle(player.weaponLoadout);
    arsenal.update(dt, { recoil, movement: gait, stride }, 1);
    wearSuit(player.suit ?? null);
    if (skinned) {
      poseSkinned(player, stepX, stepZ, dt, reduceMotion, prone, repair, aim);
      return;
    }

    for (const arm of arms) {
      if (arm.side > 0) wrist.set(0, -.056, .045);
      else if (repair) wrist.set(0, -.056, -.105);
      else wrist.set(-.033 * reload, -.056 - .095 * reload, lerp(-.263, -.112, reload));
      wrist.applyMatrix4(holding.matrix);
      if (arm.side < 0) wrist.lerp(restedWrist, downedPose);
      elbow.set(arm.side * .290, .113 - (arm.side < 0 ? reload * .129 : 0), -.074);
      linkArm(arm.bicep, arm.shoulder, elbow);
      linkArm(arm.forearm, elbow, wrist);
      arm.glove.position.copy(wrist);
      arm.glove.rotation.copy(holding.rotation);
    }
  }

  // Poses the skinned suit from the player's state: its legs from how it really moves, its upper body
  // from aiming, reloading and firing, and a fall while downed.
  function poseSkinned(player, stepX, stepZ, dt, reduceMotion, prone, repair, aim) {
    const { model, rig } = skinned;
    root.updateMatrixWorld(true);
    model.getWorldDirection(facingAxis);
    const facing = Math.atan2(facingAxis.x, facingAxis.z);
    // A jump of a metre or more is a respawn or teleport, not a step.
    const moving = dt > 0 && Math.hypot(stepX, stepZ) < 1;
    velocity.x = damp(velocity.x, moving ? stepX / dt : 0, 10, dt);
    velocity.y = damp(velocity.y, moving ? stepZ / dt : 0, 10, dt);
    const forward = velocity.x * Math.sin(facing) + velocity.y * Math.cos(facing);
    const right = -(velocity.x * Math.cos(facing) - velocity.y * Math.sin(facing));
    const progress = clamp(player.reloadProgress || 0, 0, 1);
    const reloading = progress > 0 && progress < 1;
    // The reload's length, from how fast its progress runs, so the clip ends with it.
    if (reloading && progress > reloadSeen && dt > 0) reloadTime = clamp(dt / (progress - reloadSeen), .8, 4);
    reloadSeen = reloading ? progress : 0;
    firedHold = Math.max(0, firedHold - dt);
    arsenal.model.visible = !repair;
    poseNanonaut(rig, model, {
      local: { forward, right, speed: Math.hypot(velocity.x, velocity.y) },
      stance: player.crouched || player.sliding ? 'crouch' : 'stand',
      aiming: (aim || firedHold > 0) && !repair, reloading: reloading && !prone, reloadTime, downed: prone, atEase: !!player.atEase,
      aimYaw: facing, aimPitch: clamp(player.pitch || 0, -1.2, 1.2),
    }, dt > 0 ? dt : .5, reduceMotion); // a still (the lobby's portraits pass no time) settles straight into its pose
  }

  function fire(playerId, reduceMotion, position) {
    if (playerId !== actorId || !root.visible) return false;
    if (skinned) {
      firedHold = .8; // a teammate who fires raises the rifle to the shoulder
      fireNanonaut(skinned.rig, reduceMotion, position);
      return true;
    }
    recoil = reduceMotion ? .22 : 1;
    flashTime = reduceMotion ? 0 : .045;
    flash.visible = !reduceMotion && rifle.visible;
    muzzle.getWorldPosition(position);
    return true;
  }

  return { root, hide, update, fire, wearSuit };
}
