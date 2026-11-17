import * as THREE from './vendor/three.module.js';
import { WEAPON_ACCENTS, WEAPON_FINISHES } from './weapon-mods.mjs';
import { suitModelVersion, suitParts } from './suits.mjs';

const DOWN = new THREE.Vector3(0, -1, 0);
const { clamp, damp, lerp } = THREE.MathUtils;

export function createTeammate(softMask, { marker: showMarker = true } = {}) {
  const root = new THREE.Group();
  root.name = 'Co-op teammate';
  root.visible = false;
  const body = new THREE.Group();
  root.add(body);
  const ball = new THREE.SphereGeometry(1, 16, 12);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const hull = new THREE.MeshStandardMaterial({ color: 0xa2afb2, metalness: .43, roughness: .48 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x28353c, metalness: .57, roughness: .45 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x191f24, roughness: .88 });
  const bolts = new THREE.MeshStandardMaterial({ color: 0x636e74, metalness: .8, roughness: .38 });
  const optic = new THREE.MeshStandardMaterial({ color: 0x10252c, metalness: .72, roughness: .21 });
  const signal = new THREE.MeshStandardMaterial({ color: 0x77daea, emissive: 0x34bfd9, emissiveIntensity: .82, roughness: .38 });
  const rifleShell = hull.clone();
  const rifleLight = signal.clone();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0x160a0d, map: softMask, transparent: true, opacity: .48, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  shadow.rotation.x = -Math.PI / 2;
  root.add(shadow);

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

  function armor(parent, profile, depth, material, x, y, z) {
    const shape = new THREE.Shape();
    shape.moveTo(...profile[0]);
    for (const point of profile.slice(1)) shape.lineTo(...point);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelSegments: 2, bevelSize: .013, bevelThickness: .012 });
    geometry.translate(0, 0, -depth / 2);
    return mesh(parent, geometry, material, x, y, z);
  }

  const upper = joint(body, 0, 1.09);
  mesh(upper, ball, fabric, 0, .19, .008, .238, .303, .154);
  const chest = [[-.214, .14], [-.14, .215], [.14, .215], [.214, .14], [.179, -.126], [.103, -.184], [-.103, -.184], [-.179, -.126]];
  armor(upper, chest, .118, hull, 0, .219, -.10);
  mesh(upper, cube, frame, 0, .24, -.17, .132, .194, .029);
  mesh(upper, cube, signal, 0, .274, -.188, .025, .085, .012);
  for (const side of [-1, 1]) {
    mesh(upper, cube, frame, side * .118, .14, -.164, .086, .068, .032).rotation.z = side * .16;
    mesh(upper, ball, bolts, side * .154, .309, -.159, .017, .017, .01);
    mesh(upper, ball, frame, side * .246, .334, .011, .11, .114, .112);
    mesh(upper, ball, hull, side * .255, .379, .006, .108, .073, .108);
  }

  const pack = [[-.147, .128], [-.09, .184], [.09, .184], [.147, .128], [.126, -.15], [-.126, -.15]];
  armor(upper, pack, .124, frame, 0, .20, .148);
  mesh(upper, cube, hull, 0, .209, .217, .182, .222, .026);
  for (const x of [-.041, .041]) mesh(upper, cube, signal, x, .28, .234, .026, .074, .012);
  for (let index = 0; index < 3; index++) mesh(upper, cube, frame, 0, .169 - index * .034, .235, .126, .013, .01);

  const head = joint(upper, 0, .561, -.003);
  mesh(head, ball, fabric, 0, -.134, .015, .087, .074, .088);
  mesh(head, ball, hull, 0, 0, .012, .144, .169, .135);
  const mask = [[-.106, .056], [.106, .056], [.113, .005], [.073, -.080], [-.073, -.080], [-.113, .005]];
  armor(head, mask, .053, frame, 0, -.016, -.098);
  const visor = [[-.106, .024], [.106, .024], [.093, -.019], [.040, -.035], [-.040, -.035], [-.093, -.019]];
  armor(head, visor, .017, optic, 0, .015, -.135);
  mesh(head, cube, signal, 0, .040, -.150, .147, .011, .01);
  for (const side of [-1, 1]) {
    mesh(head, ball, frame, side * .125, -.024, .026, .040, .066, .067);
    mesh(head, cube, signal, side * .158, -.021, .015, .008, .032, .034);
  }
  mesh(head, cube, bolts, 0, .122, .104, .039, .024, .050);

  const hips = joint(body, 0, .918);
  mesh(hips, ball, fabric, 0, .031, .006, .217, .132, .130);
  mesh(hips, cube, frame, 0, .103, -.019, .404, .070, .236);
  mesh(hips, cube, bolts, 0, .104, -.148, .081, .056, .026);
  const thighPlate = [[-.073, .094], [-.046, .136], [.044, .136], [.080, .070], [.056, -.106], [.026, -.135], [-.048, -.123], [-.073, -.066]];
  const shinPlate = [[-.053, .123], [.047, .122], [.058, .079], [.037, -.100], [.010, -.124], [-.035, -.105], [-.055, .070]];
  const legs = [-1, 1].map(side => {
    const thigh = joint(hips, side * .112);
    mesh(thigh, ball, fabric, 0, -.196, .006, .093, .225, .097);
    armor(thigh, thighPlate, .041, hull, side * .004, -.172, -.088);
    const shin = joint(thigh, 0, -.403);
    mesh(shin, ball, frame, 0, -.012, -.032, .101, .103, .090);
    mesh(shin, ball, bolts, 0, -.028, -.108, .067, .067, .030);
    mesh(shin, ball, fabric, 0, -.177, .006, .078, .166, .077);
    armor(shin, shinPlate, .036, hull, 0, -.184, -.068);
    const boot = joint(shin, 0, -.348, -.030);
    mesh(boot, ball, frame, 0, -.015, -.024, .086, .084, .134);
    mesh(boot, cube, fabric, 0, -.070, -.029, .166, .033, .244);
    mesh(boot, ball, hull, 0, -.028, -.107, .077, .050, .058);
    return { thigh, shin, boot };
  });

  const arms = [-1, 1].map(side => {
    const bicep = joint(upper);
    mesh(bicep, ball, fabric, 0, -.5, 0, .074, .53, .075);
    mesh(bicep, ball, hull, side * .030, -.39, -.004, .066, .39, .066);
    const forearm = joint(upper);
    mesh(forearm, ball, frame, 0, -.52, 0, .063, .53, .059);
    mesh(forearm, ball, hull, side * .025, -.57, -.011, .052, .345, .050);
    const glove = joint(upper);
    mesh(glove, ball, fabric, 0, 0, 0, .062, .073, .057);
    return { side, shoulder: new THREE.Vector3(side * .238, .332, .008), bicep, forearm, glove };
  });

  // Procedural "stock" suit meshes, hidden while a Blender suit model is worn.
  const stock = [];
  body.traverse(part => { if (part.isMesh) stock.push(part); });
  const suitJoints = { upper, head, hips };
  for (const [index, side] of ['L', 'R'].entries()) {
    suitJoints['thigh_' + side] = legs[index].thigh;
    suitJoints['shin_' + side] = legs[index].shin;
    suitJoints['boot_' + side] = legs[index].boot;
    suitJoints['bicep_' + side] = arms[index].bicep;
    suitJoints['forearm_' + side] = arms[index].forearm;
    suitJoints['glove_' + side] = arms[index].glove;
  }
  let suitId = null;
  let suitWorn = false;
  let wornVersion = -1;
  const worn = [];

  function wearSuit(id) {
    // Re-dress when a textured model finishes streaming in over the primitive one.
    if (id === suitId && (!id || (suitWorn && wornVersion === suitModelVersion()))) return;
    const parts = id ? suitParts(id) : null;
    if (id && !parts) return; // Models still loading; keep the stock suit for now.
    suitId = id;
    suitWorn = !!parts;
    wornVersion = suitModelVersion();
    for (const part of worn.splice(0)) part.removeFromParent();
    for (const part of stock) part.visible = !parts;
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
  mesh(rifle, cube, frame, 0, .019, -.111, .095, .111, .41);
  mesh(rifle, cube, rifleShell, 0, .049, -.135, .106, .052, .288);
  mesh(rifle, cube, frame, 0, .017, .137, .076, .085, .137);
  mesh(rifle, cube, fabric, 0, .01, .219, .104, .115, .041);
  mesh(rifle, cube, fabric, 0, -.056, .026, .068, .137, .067).rotation.x = -.29;
  mesh(rifle, cube, rifleLight, .054, .051, -.145, .008, .012, .139);
  mesh(rifle, cube, rifleLight, -.054, .051, -.145, .008, .012, .139);
  const magazine = mesh(rifle, cube, frame, 0, -.085, -.109, .071, .118, .102);
  magazine.rotation.x = -.18;
  const barrel = mesh(rifle, new THREE.CylinderGeometry(1, 1, 1, 12), bolts, 0, .034, -.396, .020, .177, .020);
  barrel.rotation.x = Math.PI / 2;
  const tip = mesh(rifle, cube, frame, 0, .034, -.487, .061, .061, .081);
  const sight = mesh(rifle, cube, frame, 0, .091, -.087, .049, .043, .056);
  mesh(rifle, cube, optic, 0, .107, -.088, .038, .025, .041);
  const muzzle = joint(rifle, 0, .034, -.533);
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xf9df92, transparent: true, opacity: .85, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = mesh(muzzle, new THREE.ConeGeometry(.038, .15, 6), flashMaterial, 0, 0, -.072);
  flash.rotation.x = -Math.PI / 2;
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
    context.fillText(label, 140, 29, width - 16);
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

  function linkArm(segment, from, to) {
    armDirection.subVectors(to, from);
    const length = armDirection.length();
    segment.position.copy(from);
    segment.scale.y = length;
    segment.quaternion.setFromUnitVectors(DOWN, armDirection.divideScalar(Math.max(length, .001)));
  }

  function configureRifle(loadout = {}) {
    if (loadout === previousLoadout) return;
    previousLoadout = loadout;
    const { barrel: barrelId, muzzle: muzzleId, optic: opticId, magazine: magazineId, receiver, finish, accent } = loadout;
    const key = [barrelId, muzzleId, opticId, magazineId, receiver, finish, accent].join('/');
    if (loadoutKey === key) return;
    loadoutKey = key;
    const barrelLength = barrelId === 'short-barrel' ? .107 : barrelId === 'heavy-barrel' ? .22 : .177;
    const barrelRadius = barrelId === 'heavy-barrel' ? .028 : .020;
    barrel.scale.set(barrelRadius, barrelLength, barrelRadius);
    barrel.position.z = -.308 - barrelLength * .5;
    tip.position.z = -.316 - barrelLength;
    tip.scale.set(muzzleId === 'compensator' ? .076 : .061, .061, muzzleId === 'flash-hider' ? .126 : .081);
    muzzle.position.z = tip.position.z - tip.scale.z * .5;
    flash.scale.setScalar(muzzleId === 'flash-hider' ? .65 : 1);
    sight.position.y = opticId === 'marksman-optic' ? .113 : opticId === 'reflex-sight' ? .101 : .091;
    sight.scale.z = opticId === 'marksman-optic' ? .139 : .056;
    magazine.scale.y = magazineId === 'extended-magazine' ? .168 : magazineId === 'quick-magazine' ? .087 : .118;
    magazine.position.y = -.031 - magazine.scale.y * .48;
    rifleShell.color.set((Object.hasOwn(WEAPON_FINISHES, finish) && WEAPON_FINISHES[finish].color) || '#c7c3ae');
    rifleLight.emissive.set((Object.hasOwn(WEAPON_ACCENTS, accent) && WEAPON_ACCENTS[accent].color) || '#75f1b4');
    rifleLight.emissiveIntensity = receiver === 'rapid-receiver' ? 1.30 : .82;
  }

  function hide() {
    root.visible = false;
    actorId = undefined;
    flash.visible = false;
  }

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
    const distance = Math.hypot(player.x - previous.x, player.z - previous.y);
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
    body.position.y = rise + .23 * downedPose;
    body.rotation.x = downedPose * 1.52;
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
    wearSuit(player.suit ?? null);

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

  function fire(playerId, reduceMotion, position) {
    if (playerId !== actorId || !root.visible) return false;
    recoil = reduceMotion ? .22 : 1;
    flashTime = reduceMotion ? 0 : .045;
    flash.visible = !reduceMotion && rifle.visible;
    muzzle.getWorldPosition(position);
    return true;
  }

  return { root, hide, update, fire, wearSuit };
}
