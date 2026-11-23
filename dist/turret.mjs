import * as THREE from './vendor/three.module.js';
import { WEAPON_ACCENTS, WEAPON_FINISHES, normalizeTurretBuild } from './weapon-mods.mjs';
import { decalTexture, dressShell, makeSkinnable } from './weapon-skins.mjs';
import { createCharms, stickerTexture } from './arsenal-models.mjs';

const Y = new THREE.Vector3(0, 1, 0);

function surfaceWear() {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(size, size);
  let seed = 41699;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    const grain = noise() * 18;
    for (let x = 0; x < size; x++) {
      const mottling = Math.sin(x * .16 + y * .03) * Math.cos(y * .12 - x * .04);
      const value = 184 + grain + noise() * 14 + mottling * 18;
      const index = (y * size + x) * 4;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function part(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function shell(parent, material, profile, depth, bevel, x, y, z) {
  const shape = new THREE.Shape();
  shape.moveTo(...profile[0]);
  for (const point of profile.slice(1)) shape.lineTo(...point);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
  });
  geometry.translate(0, 0, -depth / 2);
  return part(parent, geometry, material, x, y, z);
}

function cylinder(parent, material, top, bottom, height, x, y, z, forward = false, sides = 20) {
  const mesh = part(parent, new THREE.CylinderGeometry(top, bottom, height, sides), material, x, y, z);
  if (forward) mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function strut(parent, material, start, end, radius) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const mesh = cylinder(parent, material, radius, radius, direction.length(), 0, 0, 0, false, 10);
  mesh.position.copy(a).lerp(b, .5);
  mesh.quaternion.setFromUnitVectors(Y, direction.normalize());
  return mesh;
}

export function createTurret(glow) {
  const metal = (color, metalness, roughness) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const armor = metal(0x8f958b, .63, .58);
  const edge = metal(0x777a75, .89, .29);
  const frame = metal(0x353b3d, .67, .48);
  const rubber = metal(0x211e20, .03, .81);
  const accent = metal(0x9e6c4c, .62, .59);
  const barrel = metal(0x494a4d, .94, .27);
  const wear = surfaceWear();
  armor.roughnessMap = accent.roughnessMap = wear;
  armor.bumpMap = wear;
  armor.bumpScale = .011;
  const lens = new THREE.MeshPhysicalMaterial({
    color: 0x587c84, emissive: 0x41a5b2, emissiveIntensity: .54, metalness: .31,
    roughness: .22, clearcoat: .92, clearcoatRoughness: .13,
  });
  const diode = new THREE.MeshStandardMaterial({ color: 0x79d1c2, emissive: 0x67d9bd, emissiveIntensity: .73 });
  const muzzleInterior = new THREE.MeshBasicMaterial({ color: 0x121013 });
  const model = new THREE.Group();
  model.visible = false;

  const contact = part(model, new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({
    color: 0x0c0307, map: glow, opacity: .85, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  }), 0, .035, 0);
  contact.rotation.x = -Math.PI / 2;
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Group();
    leg.rotation.y = i * Math.PI * 2 / 3;
    model.add(leg);
    legs.push(leg);
    strut(leg, frame, [0, .37, .21], [0, .30, .68], .094);
    strut(leg, edge, [0, .30, .63], [0, .14, .96], .078);
    for (const side of [-1, 1]) {
      strut(leg, barrel, [side * .07, .27, .32], [side * .09, .12, .92], .027);
    }
    shell(leg, armor, [[-.12, .02], [.12, .02], [.15, -.06], [.11, -.09], [-.11, -.09], [-.15, -.06]],
      .27, .018, 0, .16, .92);
    part(leg, new THREE.BoxGeometry(.26, .081, .31), rubber, 0, .072, .93);
    for (const x of [-.08, .08]) cylinder(leg, edge, .024, .024, .012, x, .205, .92, false, 8);
  }
  cylinder(model, rubber, .25, .35, .085, 0, .12, 0, false, 10);
  cylinder(model, frame, .33, .34, .155, 0, .25, 0, false, 10);
  cylinder(model, armor, .29, .36, .115, 0, .375, 0, false, 10);
  cylinder(model, edge, .23, .24, .065, 0, .465, 0);
  cylinder(model, frame, .21, .21, .13, 0, .55, 0);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    cylinder(model, edge, .023, .023, .014, Math.sin(angle) * .266, .433, Math.cos(angle) * .266, false, 6);
  }

  const azimuth = new THREE.Group();
  azimuth.position.y = .54;
  model.add(azimuth);
  for (const side of [-1, 1]) {
    shell(azimuth, frame, [[-.073, 0], [.073, 0], [.088, .37], [.045, .51], [-.078, .49]],
      .21, .022, side * .24, .02, -.035);
    const axle = cylinder(azimuth, edge, .115, .115, .065, side * .29, .47, 0, false, 12);
    axle.rotation.z = Math.PI / 2;
    const cap = cylinder(azimuth, frame, .054, .054, .025, side * .33, .47, 0, false, 8);
    cap.rotation.z = Math.PI / 2;
  }
  const elevation = new THREE.Group();
  elevation.position.y = .47;
  azimuth.add(elevation);
  const recoil = new THREE.Group();
  elevation.add(recoil);

  shell(recoil, frame, [[-.186, -.15], [.16, -.15], [.217, -.082], [.217, .068], [.16, .158], [-.13, .15], [-.186, .073]],
    .66, .032, 0, 0, -.07);
  shell(recoil, armor, [[-.19, -.065], [-.139, -.108], [.154, -.108], [.199, -.057], [.143, .035], [-.147, .035]],
    .54, .018, 0, .148, -.15);
  shell(recoil, accent, [[-.136, -.08], [.11, -.08], [.137, -.053], [.137, .047], [.10, .081], [-.10, .081], [-.136, .045]],
    .065, .011, 0, -.002, -.457);
  for (const x of [-.09, .09]) cylinder(recoil, edge, .024, .024, .016, x, -.002, -.497, true, 8);
  for (let i = 0; i < 3; i++) {
    part(recoil, new THREE.BoxGeometry(.075, .007, .003), rubber, 0, -.025 + i * .024, -.502);
  }
  cylinder(recoil, frame, .094, .094, .40, 0, -.013, .29, true, 12);
  // The gun tube from the shroud forward; barrel parts stretch and thicken it.
  const tube = new THREE.Group();
  tube.position.set(0, -.012, .21);
  recoil.add(tube);
  cylinder(tube, barrel, .061, .078, .54, 0, 0, .27, true);
  cylinder(tube, edge, .087, .076, .10, 0, 0, .514, true, 12);
  cylinder(tube, barrel, .088, .092, .09, 0, 0, .576, true, 12);
  part(tube, new THREE.RingGeometry(.04, .08, 20), edge, 0, 0, .623);
  part(tube, new THREE.CircleGeometry(.064, 16), muzzleInterior, 0, 0, .622);
  for (let i = 0; i < 5; i++) {
    part(recoil, new THREE.BoxGeometry(.024, .024, .025), rubber, -.078, -.009, .42 + i * .032);
    part(recoil, new THREE.BoxGeometry(.024, .024, .025), rubber, .078, -.009, .42 + i * .032);
  }

  for (const side of [-1, 1]) {
    const cover = shell(recoil, armor, [[-.19, -.073], [.17, -.073], [.194, -.025], [.16, .057], [-.15, .087], [-.19, .04]],
      .023, .011, side * .212, -.041, -.096);
    cover.rotation.y = Math.PI / 2;
    const line = part(recoil, new THREE.BoxGeometry(.007, .024, .142), accent, side * .234, -.054, -.13);
    line.rotation.x = -.10;
    for (let i = 0; i < 3; i++) {
      const vent = part(recoil, new THREE.BoxGeometry(.007, .056, .014), rubber, side * .239, -.02, -.005 + i * .034);
      vent.rotation.x = -.32;
    }
  }
  // The sensor pod: sensor parts lengthen it into a scope or open it into a wide dish.
  const sensor = new THREE.Group();
  sensor.position.set(.128, .078, .272);
  recoil.add(sensor);
  cylinder(sensor, edge, .067, .074, .082, 0, 0, 0, true);
  cylinder(sensor, rubber, .05, .05, .029, 0, 0, .049, true);
  part(sensor, new THREE.SphereGeometry(.039, 18, 10), lens, 0, 0, .055).scale.z = .32;
  // Receiver coils: frost for the cryo receiver, amber for the shock receiver.
  const coilMaterial = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x6fd8ff, emissiveIntensity: .8, metalness: .4, roughness: .3 });
  const coils = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const coil = part(coils, new THREE.TorusGeometry(.098, .016, 8, 24), coilMaterial, 0, -.012, .53 + i * .06);
    coil.rotation.x = Math.PI / 2;
  }
  coils.visible = false;
  recoil.add(coils);
  part(recoil, new THREE.BoxGeometry(.075, .015, .068), diode, -.094, .193, -.175);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, .65);
  tube.add(muzzle);

  // Cosmetics: side decals on the receiver covers, a sticker on top, and a hanging charm.
  const decalMaterial = new THREE.MeshStandardMaterial({ transparent: true, roughness: .55, metalness: .1, polygonOffset: true, polygonOffsetFactor: -4 });
  const decals = [-1, 1].map(side => {
    // Along the sides of the top housing, above the yoke arms.
    const decal = part(recoil, new THREE.PlaneGeometry(.46, .075), decalMaterial, side * .214, .152, -.15);
    decal.rotation.y = side * Math.PI / 2;
    decal.visible = false;
    return decal;
  });
  const stickerMaterial = new THREE.MeshStandardMaterial({ transparent: true, roughness: .5, polygonOffset: true, polygonOffsetFactor: -4 });
  const sticker = part(recoil, new THREE.PlaneGeometry(.15, .15), stickerMaterial, .06, .206, -.3);
  sticker.rotation.x = -Math.PI / 2;
  sticker.visible = false;
  const { pivot: charmPivot, charms } = createCharms();
  charmPivot.scale.setScalar(4.2);
  charmPivot.position.set(.17, .14, -.43);
  recoil.add(charmPivot);
  let charmSwing = 0;

  makeSkinnable(armor);
  const plainArmor = armor.map;
  const factoryArmor = armor.color.getHex();
  const factoryAccent = accent.color.getHex();
  let dressed = '';
  // Applies a turret build (normalizeTurretBuild): parts change the silhouette, cosmetics the paint.
  function setBuild(value) {
    const build = normalizeTurretBuild(value);
    const key = Object.values(build).join('|');
    if (key === dressed) return;
    dressed = key;
    const finish = build.finish === 'factory' ? factoryArmor : new THREE.Color(WEAPON_FINISHES[build.finish].color).getHex();
    const hadMap = !!armor.map;
    dressShell(armor, build.skin, finish, plainArmor);
    if (hadMap !== !!armor.map) armor.needsUpdate = true;
    armor.roughnessMap = wear;
    const accentColor = new THREE.Color(WEAPON_ACCENTS[build.accent].color);
    accent.color.setHex(build.accent === 'factory' ? factoryAccent : accentColor.getHex());
    diode.color.copy(accentColor);
    diode.emissive.copy(accentColor);
    tube.scale.set(...{ 'heavy-barrel': [1.5, 1.5, 1.25], 'short-barrel': [.9, .9, .62] }[build.barrel] ?? [1, 1, 1]);
    sensor.scale.set(...{ 'long-range-sensor': [.85, .85, 3], 'close-in-sensor': [1.9, 1.9, .65] }[build.sensor] ?? [1, 1, 1]);
    // The coils ride the gun tube, so a short barrel pulls them back with it.
    coils.position.z = (tube.scale.z - 1) * .45;
    coils.visible = build.receiver !== 'standard';
    const coilColor = build.receiver === 'shock-receiver' ? 0xffc04d : 0x7fdcff;
    coilMaterial.color.setHex(coilColor);
    coilMaterial.emissive.setHex(coilColor);
    for (const decal of decals) decal.visible = build.decal !== 'none';
    if (build.decal !== 'none') decalMaterial.map = decalTexture(build.decal);
    decalMaterial.needsUpdate = true;
    sticker.visible = build.sticker !== 'none';
    if (sticker.visible) stickerMaterial.map = stickerTexture(build.sticker);
    stickerMaterial.needsUpdate = true;
    for (const [id, charm] of Object.entries(charms)) charm.visible = id === build.charm;
    charmPivot.visible = build.charm !== 'none';
  }
  setBuild(null);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffb365, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  flash.visible = false;
  muzzle.add(flash);

  let deployedFor = 0;
  let recoilTime = 0;
  let emplacement = null;

  function reset() {
    model.visible = false;
    flash.visible = false;
    deployedFor = 0;
    recoilTime = 0;
    emplacement = null;
  }

  let lift = 0;
  function update(turret, floor, dt, reduceMotion) {
    if (!turret) {
      if (model.visible) reset();
      return;
    }
    const firstFrame = turret !== emplacement;
    if (firstFrame) {
      reset();
      emplacement = turret;
    }
    model.visible = true;
    setBuild(turret.build);
    charmSwing += dt;
    charmPivot.rotation.z = reduceMotion ? 0 : Math.sin(charmSwing * 2.3) * .12 + recoilTime * 1.6;
    // A carried turret rides a little off the ground so it reads as picked up.
    lift += ((turret.carried ? .32 : 0) - lift) * Math.min(1, dt * 12);
    model.position.set(turret.x, turret.y + floor + lift, turret.z);
    deployedFor += dt;
    recoilTime = Math.max(0, recoilTime - dt);
    const yawDelta = turret.yaw - azimuth.rotation.y;
    azimuth.rotation.y = firstFrame ? turret.yaw : azimuth.rotation.y + Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta)) * (1 - Math.exp(-dt * 20));
    elevation.rotation.x = firstFrame ? -turret.pitch : THREE.MathUtils.damp(elevation.rotation.x, -turret.pitch, 20, dt);
    recoil.position.z = -recoilTime * (reduceMotion ? .16 : .59);
    const unfold = reduceMotion ? 1 : THREE.MathUtils.smoothstep(deployedFor, .01, .27);
    for (const leg of legs) {
      leg.scale.z = .45 + .55 * unfold;
      leg.rotation.x = .25 * (1 - unfold);
    }
    diode.emissiveIntensity = turret.targetId == null ? .54 : 1.28;
    lens.emissiveIntensity = turret.targetId == null ? .45 : .96;
    flash.visible = !reduceMotion && recoilTime > .095;
    if (flash.visible) flash.scale.setScalar(.47 * (recoilTime / .13));
  }

  function fire(reducedMotion, yaw, pitch) {
    recoilTime = .13;
    azimuth.rotation.y = yaw;
    elevation.rotation.x = -pitch;
    flash.visible = !reducedMotion;
    flash.scale.set(.64, .49, 1);
  }

  return { model, muzzle, reset, update, fire, setBuild };
}
