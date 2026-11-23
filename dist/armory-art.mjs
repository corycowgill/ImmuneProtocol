import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { createArsenalView, weaponModelsReady } from './arsenal-models.mjs';
import { DEFAULT_WEAPON_LOADOUT, WEAPON_SLOTS, loadoutWithWeapon } from './weapon-mods.mjs';
import { LOW_MEMORY, loadTexture } from './asset-loading.mjs';
import { createTurret } from './turret.mjs';

// A soft round sprite for the turret's muzzle flash and contact shade (neither shows on the bench).
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// The armory's large preview, and the smaller part and cosmetic card pictures.
// Close to the shape of the armory stage, so the preview fills it without bands.
export const ARMORY_ART_SIZE = { width: 1280, height: 800 };
const CARD_SIZE = { width: 225, height: 130 };
export const FIELD_UPGRADE_ART = './assets/field-upgrades.webp';

const CARD_VIEWS = {
  barrel: { position: [-.67, .23, -.96], focus: [0, .025, -.65], fov: 36 },
  muzzle: { position: [-.41, .19, -1.02], focus: [0, .025, -.75], fov: 32 },
  optic: { position: [-.42, .29, -.30], focus: [0, .135, -.13], fov: 34 },
  receiver: { position: [-.50, .13, .06], focus: [0, .056, -.08], fov: 34 },
  magazine: { position: [-.49, -.15, -.30], focus: [0, -.19, -.24], fov: 37 },
};

// The lab workbench behind the weapon: modelled and path-traced in Blender from this scene's
// camera (tools/armory/build_bench.py). Resolves to null if it cannot be fetched; the armory then
// keeps its plain studio backdrop.
async function loadBench() {
  try {
    const picture = await loadTexture(new URL('./assets/armory/bench.webp', import.meta.url).href);
    picture.colorSpace = THREE.SRGBColorSpace;
    return picture;
  } catch (error) {
    console.warn('Could not load the armory workbench', error);
    return null;
  }
}

function createCapture(renderer, width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    colorSpace: THREE.SRGBColorSpace,
    samples: LOW_MEMORY ? 0 : Math.min(4, renderer.capabilities.maxSamples),
  });
  const bytes = new Uint8Array(width * height * 4);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(width, height);
  const stride = width * 4;

  function draw(scene, camera) {
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMipmap = renderer.getActiveMipmapLevel();
    const previousAutoClear = renderer.autoClear;
    try {
      renderer.setRenderTarget(target);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes);
    } finally {
      renderer.autoClear = previousAutoClear;
      renderer.setRenderTarget(previousTarget, previousFace, previousMipmap);
    }

    for (let row = 0; row < height; row++) {
      const offset = (height - 1 - row) * stride;
      pixels.data.set(bytes.subarray(offset, offset + stride), row * stride);
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  return { draw, dispose: () => target.dispose() };
}

export async function prepareArmoryArt(renderer) {
  const { width, height } = LOW_MEMORY ? { width: 640, height: 400 } : ARMORY_ART_SIZE;
  const [bench] = await Promise.all([loadBench(), weaponModelsReady]);
  const photography = new THREE.Scene();
  photography.background = new THREE.Color(0x201917);
  // A studio environment gives the metal and lacquer real reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  photography.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  photography.environmentIntensity = 1.05;
  pmrem.dispose();
  const carbine = createArsenalView({ showHands: false });
  // The weapon turns on a pivot at its own centre; the camera and the bench stay put.
  const turntable = new THREE.Group();
  turntable.add(carbine.model);
  // The auto-turret shares the bench; it is shown instead of the weapon while it is being edited.
  const sentry = createTurret(glowTexture());
  sentry.model.children[0].visible = false;
  sentry.model.visible = false;
  // Turned so its sensor, decal and charm side faces the camera, gun pointing across the bench.
  const sentryPose = new THREE.Group();
  sentryPose.rotation.y = Math.PI * 1.14;
  sentryPose.add(sentry.model);
  turntable.add(sentryPose);
  photography.add(turntable);
  const studio = photography.background;
  if (bench) renderer.initTexture(bench);
  photography.add(new THREE.HemisphereLight(0xf0eee9, 0xa6917f, 1.15));
  const key = new THREE.DirectionalLight(0xfff1d6, 3.5);
  key.position.set(-2, 3, 1);
  photography.add(key);
  const rim = new THREE.DirectionalLight(0xb3dce9, 2.3);
  rim.position.set(1, .8, -1);
  photography.add(rim);
  const fill = new THREE.DirectionalLight(0xd7e4eb, .75);
  fill.position.set(-2, -.35, -.05);
  photography.add(fill);

  // The taller frame keeps the width it had at 1280 x 680 and a 31 degree lens.
  const camera = new THREE.PerspectiveCamera(36, width / height, .05, 10);
  camera.position.set(-1.31, .42, -.89);
  camera.lookAt(0, -.015, -.245);
  const preview = createCapture(renderer, width, height);
  const cards = createCapture(renderer, CARD_SIZE.width, CARD_SIZE.height);
  const cardCamera = camera.clone();
  cardCamera.aspect = CARD_SIZE.width / CARD_SIZE.height;
  const thumbnails = {};

  // The complete preview and every thumbnail share one prebuilt weapon model.
  // Exercising each slot uploads its geometry and warms its material programs.
  try {
    for (const [slot, { options }] of Object.entries(WEAPON_SLOTS)) {
      const view = CARD_VIEWS[slot];
      cardCamera.position.set(...view.position);
      cardCamera.lookAt(...view.focus);
      cardCamera.fov = view.fov;
      cardCamera.updateProjectionMatrix();

      thumbnails[slot] = {};
      for (const option of Object.keys(options)) {
        carbine.setLoadout({ ...DEFAULT_WEAPON_LOADOUT, [slot]: option });
        const canvas = cards.draw(photography, cardCamera);
        const image = new Image(canvas.width, canvas.height);
        image.src = canvas.toDataURL('image/webp', .84);
        await image.decode();
        thumbnails[slot][option] = image;
      }
      await new Promise(requestAnimationFrame);
    }
    // Allocate the full-size target before the first visit to the armory.
    carbine.setLoadout(DEFAULT_WEAPON_LOADOUT);
    preview.draw(photography, camera);
  } catch (error) {
    preview.dispose();
    throw error;
  } finally {
    cards.dispose();
  }

  // Other weapons get their part cards the first time the armory shows them.
  const weaponThumbnails = { carbine: thumbnails };
  const cardCapture = createCapture(renderer, CARD_SIZE.width, CARD_SIZE.height);
  const previewCamera = camera.clone();
  const orbitCamera = camera.clone();
  const carbineFocus = new THREE.Vector3(0, -.015, -.245);
  const focus = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();
  const projected = new THREE.Vector3();
  // Every weapon is seen from the angle the carbine's camera uses.
  const viewDirection = carbineFocus.clone().sub(camera.position).normalize();
  const viewRight = new THREE.Vector3().crossVectors(viewDirection, up).normalize();
  const viewUp = new THREE.Vector3().crossVectors(viewRight, viewDirection);
  const corner = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  let shown = 'carbine';
  function frame(view, loadout) {
    // Measured with the weapon square on its pivot.
    turntable.position.set(0, 0, 0);
    turntable.rotation.set(0, 0, 0);
    carbine.model.position.set(0, 0, 0);
    sentryPose.position.set(0, 0, 0);
    // Fit the whole weapon as it is built right now: launchers and rifles are longer than the
    // carbine, pistols much shorter, and a long barrel or a scope changes the outline.
    const bounds = new THREE.Box3();
    // From the pivot down: the model's world position must reflect the reset above.
    turntable.updateMatrixWorld(true);
    view.model.traverse(part => {
      if (!part.isMesh) return;
      // Every weapon and every part option lives in this one model; only the drawn ones count.
      for (let node = part; node && node !== turntable; node = node.parent) if (!node.visible) return;
      bounds.expandByObject(part);
    });
    const center = bounds.getCenter(new THREE.Vector3());
    // Stand back just far enough that every corner of its outline is inside the picture, with
    // room left over for the callouts beside it and the name and stat bars above and below.
    const vertical = Math.tan(THREE.MathUtils.degToRad(previewCamera.fov / 2));
    const horizontal = vertical * previewCamera.aspect;
    let distance = 0;
    for (let index = 0; index < 8; index++) {
      corner.set(index & 1 ? bounds.max.x : bounds.min.x, index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z).sub(center);
      const depth = corner.dot(viewDirection);
      distance = Math.max(distance, Math.abs(corner.dot(viewRight)) / (horizontal * .96) - depth, Math.abs(corner.dot(viewUp)) / (vertical * .74) - depth);
    }
    // orbit() brings the camera in to four fifths of this.
    previewCamera.position.copy(center).addScaledVector(viewDirection, -distance / .8);
    previewCamera.lookAt(center);
    focus.copy(center);
    return previewCamera;
  }
  // Turns the framed camera around the weapon: yaw about the vertical, pitch over the top.
  function orbit(base, { yaw = 0, pitch = 0 } = {}) {
    // A little closer than the framing camera: the preview stage is large.
    const offset = base.position.clone().sub(focus).multiplyScalar(.8);
    // Turn the weapon about its centre, and tip it toward or away from the camera.
    turntable.position.copy(focus);
    carbine.model.position.copy(focus).negate();
    sentryPose.position.copy(focus).negate();
    side.crossVectors(offset, up).normalize();
    turntable.quaternion.setFromAxisAngle(side, -pitch).multiply(spin.setFromAxisAngle(up, -yaw));
    orbitCamera.position.copy(focus).add(offset);
    orbitCamera.fov = base.fov;
    orbitCamera.updateProjectionMatrix();
    orbitCamera.lookAt(focus);
    return orbitCamera;
  }
  return {
    thumbnails,
    thumbnailsFor(weapon) {
      if (weaponThumbnails[weapon]) return weaponThumbnails[weapon];
      const cards = {};
      const turretShown = sentry.model.visible;
      carbine.model.visible = true;
      sentry.model.visible = false;
      // Part cards are framed with the weapon square at the origin.
      turntable.position.set(0, 0, 0);
      turntable.rotation.set(0, 0, 0);
      carbine.model.position.set(0, 0, 0);
      const base = loadoutWithWeapon(DEFAULT_WEAPON_LOADOUT, 'primary', weapon);
      for (const [slot, { options }] of Object.entries(WEAPON_SLOTS)) {
        cards[slot] = {};
        for (const option of Object.keys(options)) {
          carbine.setLoadout({ ...base, weapon, [slot]: option });
          const focus = carbine.anchors()[slot];
          const reach = weapon === 'pistol' ? .32 : weapon === 'launcher' ? .62 : .5;
          cardCamera.position.set(focus.x - reach, focus.y + reach * .35, focus.z - reach * .45);
          cardCamera.lookAt(focus);
          cardCamera.fov = 36;
          cardCamera.updateProjectionMatrix();
          const canvas = cardCapture.draw(photography, cardCamera);
          const image = new Image(canvas.width, canvas.height);
          image.src = canvas.toDataURL('image/webp', .84);
          cards[slot][option] = image;
        }
      }
      carbine.model.visible = !turretShown;
      sentry.model.visible = turretShown;
      return (weaponThumbnails[weapon] = cards);
    },
    // `view` turns the camera around the weapon ({ yaw, pitch } in radians).
    render(loadout, view) {
      const turret = loadout.weapon === 'turret';
      carbine.model.visible = !turret;
      sentry.model.visible = turret;
      if (turret) sentry.setBuild(loadout);
      else carbine.setLoadout(loadout);
      shown = loadout.weapon;
      const framed = frame(turret ? sentry : carbine, loadout);
      // The splayed tripod legs make the turret's outline wide and low; come in to the gun itself.
      if (turret) framed.position.lerp(focus, .42);
      const lens = orbit(framed, view);
      // Only the big preview stands on the bench; part cards keep their plain backdrop.
      photography.background = bench ?? studio;
      turntable.updateMatrixWorld(true);
      const picture = preview.draw(photography, lens);
      photography.background = studio;
      return picture;
    },
    // Where each part slot sits in the last rendered preview, as fractions of its width and
    // height, for the callout lines drawn over it.
    anchors() {
      if (shown === 'turret') return null;
      const places = shown === 'carbine'
        ? Object.fromEntries(Object.entries(CARD_VIEWS).map(([slot, { focus }]) => [slot, new THREE.Vector3(...focus)]))
        : carbine.anchors();
      if (!places) return null;
      orbitCamera.updateMatrixWorld();
      return Object.fromEntries(Object.entries(places).map(([slot, place]) => {
        // Part positions are in the weapon's own space; carry them through its current turn.
        const point = carbine.model.localToWorld(projected.copy(place)).project(orbitCamera);
        return [slot, { x: point.x * .5 + .5, y: .5 - point.y * .5 }];
      }));
    },
  };
}
