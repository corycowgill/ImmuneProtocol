// The medic drone as it is drawn: the Blender model (tools/companions/build_drone.py) in the
// weapon kit's materials, so finishes, accents and skins paint it like a gun, with side decals, a
// top sticker and a hanging charm. In the field it hovers and banks as it flies, spins its rotors,
// and draws a mending beam from its belly emitter to the suit or node it is mending.
import * as THREE from './vendor/three.module.js';
import { normalizeDroneBuild } from './weapon-mods.mjs';
import { loadModel, loadTexture } from './asset-loading.mjs';
import { createCharms, createKit, modelledNode, paint, stickerTexture } from './arsenal-models.mjs';
import { decalTexture } from './weapon-skins.mjs';

// Flat panels on the model for cosmetics (tools/companions/drone-mounts.json), in its own metres.
const MOUNTS = {
  // Decal art is a 4:1 strip; it sits in the middle of each 74 x 42 mm side panel.
  decals: [
    { x: -.087, y: .004, z: -.0075, width: .074, height: .0185, side: -1 },
    { x: .087, y: .004, z: -.0075, width: .074, height: .0185, side: 1 },
  ],
  sticker: { x: 0, y: .078, z: -.036, size: .04 },
  // The eyelet under the back-left arm.
  charm: { x: -.1167, y: -.0335, z: .1167 },
};
const ROTORS = ['rotor-0', 'rotor-1', 'rotor-2', 'rotor-3'];

export const droneModelReady = typeof document === 'undefined' ? Promise.resolve(null)
  : loadModel(new URL('./assets/companions/drone.glb', import.meta.url).href).then(async gltf => {
    const atlas = await loadTexture(new URL('./assets/companions/drone-weathering.webp', import.meta.url).href);
    if (atlas) {
      // Blender's atlas is stored bottom-up; glTF UVs already count from the top.
      atlas.flipY = false;
      atlas.colorSpace = THREE.NoColorSpace;
      atlas.anisotropy = 4;
    }
    gltf.scene.userData.weatheringAtlas = atlas;
    return gltf.scene;
  }, error => {
    console.warn('Could not load the medic drone model', error);
    return null;
  });

let droneScene = null;
droneModelReady.then(scene => { droneScene = scene; });

export function setDroneMounts(mounts) {
  Object.assign(MOUNTS, mounts);
}

// `beam: false` leaves the mending beam out (the armory bench).
export function createDroneView(glow, { beam = true } = {}) {
  const model = new THREE.Group();
  model.name = 'medic-drone';
  const hover = new THREE.Group();
  model.add(hover);
  const kit = createKit();
  const rotors = [];
  let emitter = new THREE.Object3D();
  if (droneScene) {
    const body = modelledNode(droneScene, 'body', kit, 'drone');
    if (body) hover.add(body);
    for (const name of ROTORS) {
      const rotor = modelledNode(droneScene, name, kit, 'drone');
      if (!rotor) continue;
      hover.add(rotor);
      rotors.push(rotor);
    }
    const tip = droneScene.getObjectByName('emitter');
    if (tip) emitter.position.copy(tip.position);
  } else {
    // A plain stand-in if the model could not be fetched.
    const pod = new THREE.Mesh(new THREE.SphereGeometry(.13, 24, 14), kit.shell);
    pod.scale.y = .7;
    hover.add(pod);
    for (const [x, z] of [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.09, .012, 8, 24), kit.dark);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, .02, z);
      hover.add(ring);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(.16, .006, .022), kit.steel);
      blade.position.set(x, .025, z);
      hover.add(blade);
      rotors.push(blade);
    }
    emitter.position.set(0, -.11, 0);
  }
  hover.add(emitter);

  // Cosmetics.
  const decalMaterial = new THREE.MeshStandardMaterial({ transparent: true, roughness: .55, metalness: .1, polygonOffset: true, polygonOffsetFactor: -4 });
  const decals = MOUNTS.decals.map(({ x, y, z, width, height, side }) => {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(width, height), decalMaterial);
    decal.position.set(x + side * .0006, y, z);
    decal.rotation.y = side * Math.PI / 2;
    decal.visible = false;
    hover.add(decal);
    return decal;
  });
  const stickerMaterial = new THREE.MeshStandardMaterial({ transparent: true, roughness: .5, polygonOffset: true, polygonOffsetFactor: -4 });
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(MOUNTS.sticker.size, MOUNTS.sticker.size), stickerMaterial);
  sticker.position.set(MOUNTS.sticker.x, MOUNTS.sticker.y + .0006, MOUNTS.sticker.z);
  sticker.rotation.x = -Math.PI / 2;
  sticker.visible = false;
  hover.add(sticker);
  const { pivot: charmPivot, charms } = createCharms();
  charmPivot.scale.setScalar(1.6);
  charmPivot.position.set(MOUNTS.charm.x, MOUNTS.charm.y, MOUNTS.charm.z);
  hover.add(charmPivot);

  let dressed = '';
  function setBuild(value) {
    const build = normalizeDroneBuild(value);
    const key = Object.values(build).join('|');
    if (key === dressed) return;
    dressed = key;
    paint(kit, build);
    for (const decal of decals) decal.visible = build.decal !== 'none';
    if (build.decal !== 'none') decalMaterial.map = decalTexture(build.decal);
    decalMaterial.needsUpdate = true;
    sticker.visible = build.sticker !== 'none';
    if (sticker.visible) stickerMaterial.map = stickerTexture(build.sticker);
    stickerMaterial.needsUpdate = true;
    for (const [id, charm] of Object.entries(charms)) charm.visible = id === build.charm;
    charmPivot.visible = build.charm !== 'none';
    // Heavier rotors read as bigger discs, sprint rotors as smaller, faster ones.
    const scale = { 'heavy-rotors': 1.12, 'sprint-rotors': .9 }[build.rotors] ?? 1;
    for (const rotor of rotors) rotor.scale.set(scale, 1, scale);
  }
  setBuild(null);

  // The mending beam: a soft additive shaft from the emitter, a bright core inside it, a glow
  // where it leaves the drone and a ring where it lands.
  const beamColor = new THREE.Color(0x7dffb8);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.11, .045, 1, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.022, .012, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xd8ffe9, transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending }));
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: beamColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  spark.scale.setScalar(.42);
  const landing = new THREE.Mesh(new THREE.RingGeometry(.35, .5, 32),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: .4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  landing.rotation.x = -Math.PI / 2;
  const beamGroup = new THREE.Group();
  beamGroup.add(shaft, core, landing);
  beamGroup.visible = false;
  spark.visible = false;
  // The beam lives in world space; the caller adds `beam` to the scene.
  const beamRoot = new THREE.Group();
  beamRoot.add(beamGroup, spark);
  for (const mesh of [shaft, core, landing]) mesh.renderOrder = 3;

  const UP = new THREE.Vector3(0, 1, 0);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let spin = 0;
  let clock = 0;
  let tracked = null;
  const velocity = new THREE.Vector3();
  const last = new THREE.Vector3();
  let mend = 0;

  function reset() {
    model.visible = false;
    beamGroup.visible = spark.visible = false;
    tracked = null;
  }

  // Bob, spin and lights for a given moment, without moving the drone (also the bench pose).
  function pose(time, mending = 0, reduceMotion = false, jammed = false) {
    hover.position.y = reduceMotion ? 0 : Math.sin(time * 2.1) * .045;
    spin = time * (jammed ? 9 : 42);
    rotors.forEach((rotor, index) => { rotor.rotation.y = spin * (index % 2 ? -1 : 1) + index; });
    kit.accent.emissiveIntensity = jammed ? (Math.sin(time * 23) > 0 ? 1.4 : .2) : 1.05 + mending * .9 + Math.sin(time * 4) * .12;
    charmPivot.rotation.z = reduceMotion ? 0 : Math.sin(time * 2.4) * .14;
  }

  // `drone` is the simulation's drone record (or a co-op snapshot of it); `floor` is the floor's own
  // undulation under it, added to its height.
  function update(drone, floor, dt, reduceMotion) {
    if (!drone) {
      if (model.visible) reset();
      return;
    }
    clock += dt;
    setBuild(drone.build);
    const first = tracked !== drone.ownerId || !model.visible;
    tracked = drone.ownerId;
    model.visible = true;
    const target = new THREE.Vector3(drone.x, drone.y + floor, drone.z);
    if (first) {
      model.position.copy(target);
      last.copy(target);
      velocity.set(0, 0, 0);
    } else {
      model.position.lerp(target, Math.min(1, dt * 14));
    }
    // Bank into its motion and nose down when it flies fast.
    if (dt > 0) velocity.lerp(direction.subVectors(model.position, last).divideScalar(dt), Math.min(1, dt * 6));
    last.copy(model.position);
    const yawDelta = (drone.yaw ?? 0) - model.rotation.y;
    model.rotation.y += Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta)) * Math.min(1, dt * 5);
    const along = -(velocity.x * Math.sin(model.rotation.y) + velocity.z * Math.cos(model.rotation.y));
    const across = velocity.x * Math.cos(model.rotation.y) - velocity.z * Math.sin(model.rotation.y);
    hover.rotation.x = reduceMotion ? 0 : THREE.MathUtils.clamp(-along * .045, -.32, .32);
    hover.rotation.z = reduceMotion ? 0 : THREE.MathUtils.clamp(-across * .05, -.32, .32);
    const mending = !!drone.targetKind && !drone.jammed;
    mend += ((mending ? 1 : 0) - mend) * Math.min(1, dt * 6);
    pose(clock, mend, reduceMotion, drone.jammed);
    if (!beam) return;
    beamGroup.visible = spark.visible = mending;
    if (!mending) return;
    model.updateMatrixWorld(true);
    emitter.getWorldPosition(start);
    end.set(drone.targetX, drone.targetY + floor, drone.targetZ);
    direction.subVectors(end, start);
    const length = direction.length();
    if (length < .05) {
      beamGroup.visible = spark.visible = false;
      return;
    }
    for (const mesh of [shaft, core]) {
      mesh.scale.set(1, length, 1);
      mesh.position.copy(start).lerp(end, .5);
      mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    }
    const flicker = reduceMotion ? 1 : .8 + Math.sin(clock * 19) * .12 + Math.sin(clock * 7.3) * .08;
    shaft.material.opacity = .2 * mend * flicker;
    core.material.opacity = .7 * mend * flicker;
    spark.position.copy(start);
    spark.material.opacity = .9 * mend;
    landing.position.set(end.x, end.y - (drone.targetKind === 'suit' ? 1.1 : .9) + .04, end.z);
    const ripple = reduceMotion ? .5 : (clock * .9) % 1;
    landing.scale.setScalar(.6 + ripple * .9);
    landing.material.opacity = .45 * mend * (1 - ripple);
  }

  return { model, beam: beamRoot, emitter, reset, update, pose, setBuild };
}
