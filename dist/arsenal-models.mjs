// First-person and armory models for every weapon. Each weapon's body is a Blender model
// (dist/assets/weapons); this file mounts the three variants of every part slot on it, plus
// skins, side decals, receiver stickers and hanging charms. The carbine's slot parts and the
// gloves come from carbine.mjs.
import * as THREE from './vendor/three.module.js';
import { accentPalette, createCarbine, finishPalette, finishTexture } from './carbine.mjs';
import { createHoloReticle } from './shot-fx.mjs';
import {
  DEFAULT_WEAPON_LOADOUT, WEAPON_CHARMS, WEAPON_DECALS, WEAPON_STICKERS, WEAPON_SKINS, normalizeWeaponLoadout,
} from './weapon-mods.mjs';
import { loadModel, loadTexture } from './asset-loading.mjs';
import {
  skinTexture, decalTexture, dressShell, ensureWeathering, makeSkinnable, makeWeathered, setWeatheringAtlas,
} from './weapon-skins.mjs';

// Weapon bodies are Blender models (tools/weapons/build_weapons.py), added once loaded; the
// game waits for them before it shows a weapon. Each GLB has a `body` node and a `bolt` node
// for the moving part, with materials named after the kit roles below, and a second UV layer
// into the weapon's baked occlusion and edge-wear atlas.
const MODELLED = ['carbine', 'sniper', 'shotgun', 'launcher', 'pistol'];
let weaponModels = new Map();
export const weaponModelsReady = typeof document === 'undefined' ? Promise.resolve(weaponModels)
  : Promise.all(MODELLED.map(kind => loadModel(new URL('./assets/weapons/' + kind + '.glb', import.meta.url).href)
    .then(async gltf => {
      const atlas = await loadTexture(new URL('./assets/weapons/' + kind + '-weathering.webp', import.meta.url).href);
      if (atlas) {
        // Blender's atlas is stored bottom-up; glTF UVs already count from the top.
        atlas.flipY = false;
        atlas.colorSpace = THREE.NoColorSpace;
        atlas.anisotropy = 4;
      }
      gltf.scene.userData.weatheringAtlas = atlas;
      return [kind, gltf.scene];
    }, error => {
      console.warn('Could not load the ' + kind + ' model; showing its parts only', error);
      return [kind, null];
    })))
    .then(entries => (weaponModels = new Map(entries.filter(([, scene]) => scene))));

export function prepareWeaponCosmetics(renderer) {
  for (const id of Object.keys(WEAPON_SKINS)) renderer.initTexture(skinTexture(id));
  for (const id of Object.keys(WEAPON_DECALS)) renderer.initTexture(decalTexture(id));
  for (const id of Object.keys(WEAPON_STICKERS)) renderer.initTexture(stickerTexture(id));
}

// A copy of one node of a weapon model, drawn with the given kit materials.
function modelledNode(scene, name, materials, kind) {
  const source = scene.getObjectByName(name);
  if (!source) return null;
  const node = source.clone();
  node.traverse(part => {
    if (!part.isMesh) return;
    const geometry = part.geometry;
    // The atlas UVs arrive as the glTF's second texture coordinate set.
    if (!geometry.getAttribute('weatheringUv') && geometry.getAttribute('uv1')) {
      geometry.setAttribute('weatheringUv', geometry.getAttribute('uv1'));
      geometry.deleteAttribute('uv1');
    }
    ensureWeathering(part);
    part.material = materials[part.material.name] ?? materials.dark;
    part.userData.weapon = kind;
  });
  const atlas = scene.userData.weatheringAtlas;
  if (atlas) for (const material of Object.values(materials)) setWeatheringAtlas(material, atlas);
  return node;
}

const textures = {};
const texture = kind => (textures[kind] ??= finishTexture(kind));

function createKit() {
  const brushed = texture('steel');
  const molded = texture('polymer');
  const kit = {
    shell: makeWeathered(makeSkinnable(new THREE.MeshStandardMaterial({
      color: 0xbeb6a3, metalness: .18, roughness: .52, map: molded, roughnessMap: molded, bumpMap: molded, bumpScale: .0027,
    })), 'shell'),
    steel: new THREE.MeshPhysicalMaterial({
      color: 0x7d8588, metalness: .79, roughness: .45, map: brushed, roughnessMap: brushed,
      bumpMap: brushed, bumpScale: .0016, clearcoat: .09, clearcoatRoughness: .5,
    }),
    dark: new THREE.MeshPhysicalMaterial({
      color: 0x4b5257, metalness: .52, roughness: .44, map: brushed, bumpMap: brushed, bumpScale: .00115,
      clearcoat: .1, clearcoatRoughness: .49,
    }),
    edge: new THREE.MeshStandardMaterial({ color: 0xa4a9a5, metalness: .9, roughness: .28, map: brushed }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x2b2e32, roughness: .78, map: molded }),
    accent: new THREE.MeshStandardMaterial({
      color: 0x4c9a60, emissive: 0x4ebf74, emissiveIntensity: 1.08, metalness: .33, roughness: .22,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x548d76, transparent: true, opacity: .3, metalness: .18, roughness: .13, clearcoat: 1, depthWrite: false,
    }),
    shellCasing: new THREE.MeshStandardMaterial({ color: 0xb8332b, metalness: .25, roughness: .45 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89a4b, metalness: .9, roughness: .3 }),
  };
  for (const role of ['steel', 'dark', 'edge', 'rubber']) makeWeathered(kit[role], role);
  return kit;
}

function paint(kit, build) {
  const palette = finishPalette(build.finish);
  dressShell(kit.shell, build.skin, palette.shell, texture('polymer'));
  kit.steel.color.setHex(palette.steel);
  kit.dark.color.setHex(palette.receiver);
  kit.edge.color.setHex(palette.trim);
  const accent = accentPalette(build.accent);
  kit.accent.color.setHex(accent.cell);
  kit.accent.emissive.setHex(accent.emitter);
  kit.glass.color.setHex(accent.glass);
}

// Small geometry helpers shared by every weapon builder.
function builder(root) {
  const mesh = (geometry, material, x, y, z, parent = root) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    parent.add(part);
    return part;
  };
  const panel = (width, height, length, radius, material, x, y, z, parent) => {
    const r = Math.min(radius, width / 2 - .0005, height / 2 - .0005, length / 2 - .0005);
    const hw = width / 2 - r;
    const hh = height / 2 - r;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();
    const body = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(.0005, length - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, steps: 1,
    });
    body.translate(0, 0, -length / 2 + r);
    return mesh(body, material, x, y, z, parent);
  };
  const tube = (radius, length, material, x, y, z, parent, segments = 22) => {
    const part = mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material, x, y, z, parent);
    part.rotation.x = Math.PI / 2;
    return part;
  };
  const cone = (top, bottom, length, material, x, y, z, parent) => {
    const part = mesh(new THREE.CylinderGeometry(top, bottom, length, 24), material, x, y, z, parent);
    part.rotation.x = Math.PI / 2;
    return part;
  };
  const lathe = (points, material, x, y, z, parent) => {
    const part = mesh(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), 32), material, x, y, z, parent);
    part.rotation.x = Math.PI / 2;
    return part;
  };
  const group = (parent = root, name = '') => {
    const part = new THREE.Group();
    part.name = name;
    parent.add(part);
    return part;
  };
  return { mesh, panel, tube, cone, lathe, group };
}

// Barrel, muzzle, optic, receiver and magazine variants generated from a weapon's dimensions.
function addSlotParts(root, kit, spec) {
  const { mesh, panel, tube, cone, lathe, group } = builder(root);
  const parts = { barrel: {}, muzzle: {}, optic: {}, receiver: {}, magazine: {} };
  const variant = (slot, id, parent = root) => {
    const part = group(parent, slot + ':' + id);
    part.visible = id === 'standard';
    parts[slot][id] = part;
    return part;
  };
  const { barrel, optic, receiver, magazine } = spec;
  const sockets = {};
  const lengths = { standard: barrel.length, 'heavy-barrel': barrel.length * 1.14, 'short-barrel': barrel.length * .8 };
  for (const [id, length] of Object.entries(lengths)) {
    const part = variant('barrel', id);
    const start = barrel.start;
    const radius = id === 'heavy-barrel' ? barrel.radius * 1.28 : barrel.radius;
    tube(radius, length, kit.steel, 0, barrel.y, start - length / 2, part);
    if (barrel.fluted && id !== 'short-barrel') {
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + Math.PI / 4;
        panel(.004, .004, length * .7, .001, kit.dark, Math.cos(angle) * radius, barrel.y + Math.sin(angle) * radius,
          start - length * .45, part);
      }
    }
    if (id === 'heavy-barrel') {
      tube(radius * 1.45, length * .3, kit.dark, 0, barrel.y, start - length * .35, part);
      for (let i = 0; i < 5; i++) tube(radius * 1.52, .005, kit.edge, 0, barrel.y, start - length * (.22 + i * .05), part);
    }
    if (id === 'short-barrel') tube(radius * 1.35, length * .18, kit.dark, 0, barrel.y, start - length * .82, part);
    sockets[id] = start - length;
  }

  const muzzleMount = group(root);
  muzzleMount.position.set(0, barrel.y, sockets.standard);
  const r = barrel.radius * (barrel.muzzleScale ?? 1);
  const standardMuzzle = variant('muzzle', 'standard', muzzleMount);
  lathe([[r * .7, -r * 3], [r * 1.45, -r * 3], [r * 1.6, -r * 2.6], [r * 1.6, -r * .6], [r * 1.2, 0], [r * .7, 0]],
    kit.steel, 0, 0, 0, standardMuzzle);
  const compensator = variant('muzzle', 'compensator', muzzleMount);
  panel(r * 3.4, r * 2.8, r * 4.4, r * .35, kit.steel, 0, 0, -r * 2.2, compensator);
  for (let i = 0; i < 3; i++) panel(r * 2.4, r * .25, r * .5, r * .08, kit.rubber, 0, r * 1.45, -r * (1.1 + i * 1.1), compensator);
  for (const side of [-1, 1]) panel(r * .25, r * 1.2, r * 2.6, r * .08, kit.dark, side * r * 1.75, 0, -r * 2.2, compensator);
  const hider = variant('muzzle', 'flash-hider', muzzleMount);
  tube(r * 1.5, r * 1.6, kit.dark, 0, 0, -r * .8, hider);
  for (let i = 0; i < 4; i++) {
    const angle = (i + .5) * Math.PI / 2;
    const prong = panel(r * 1, r * .7, r * 3, r * .15, kit.steel, Math.cos(angle) * r * 1.35, Math.sin(angle) * r * 1.35, -r * 3, hider);
    prong.rotation.z = angle - Math.PI / 2;
  }
  const tips = { standard: -r * 3, compensator: -r * 4.4, 'flash-hider': -r * 4.5 };

  const sightHeights = {};
  const standardOptic = variant('optic', 'standard');
  sightHeights.standard = spec.ownSights(standardOptic);
  const marksman = variant('optic', 'marksman-optic');
  const scopeY = optic.y + optic.scopeLift;
  panel(optic.width * .8, optic.y * 0 + .018, optic.length * 1.2, .004, kit.dark, 0, optic.y + .009, optic.z, marksman);
  lathe([[.022, -.09], [.034, -.09], [.039, -.08], [.038, -.06], [.026, -.045], [.027, .035], [.034, .05], [.034, .078],
    [.024, .08], [.022, .07], [.022, -.09]].map(([a, b]) => [a * optic.scale, b * optic.scale]),
  kit.steel, 0, scopeY, optic.z, marksman);
  mesh(new THREE.CircleGeometry(.025 * optic.scale, 28), kit.glass, 0, scopeY, optic.z - .081 * optic.scale, marksman).rotation.y = Math.PI;
  for (const dz of [-.05, .03]) panel(.026 * optic.scale, scopeY - optic.y, .012, .003, kit.dark, 0, (scopeY + optic.y) / 2, optic.z + dz * optic.scale, marksman);
  const dial = mesh(new THREE.CylinderGeometry(.011 * optic.scale, .013 * optic.scale, .013, 16), kit.edge, 0, scopeY + .034 * optic.scale, optic.z, marksman);
  dial.rotation.y = .3;
  sightHeights['marksman-optic'] = scopeY;
  const reflex = variant('optic', 'reflex-sight');
  const reflexY = optic.y + optic.reflexLift;
  panel(.05 * optic.scale, .016, .06 * optic.scale, .004, kit.dark, 0, optic.y + .008, optic.z, reflex);
  const hood = new THREE.Shape();
  const w = .03 * optic.scale;
  hood.moveTo(-w, -w * .8);
  hood.lineTo(w, -w * .8);
  hood.lineTo(w * 1.05, w * .5);
  hood.lineTo(w * .7, w * .95);
  hood.lineTo(-w * .7, w * .95);
  hood.lineTo(-w * 1.05, w * .5);
  hood.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-w * .78, -w * .5);
  hole.lineTo(w * .78, -w * .5);
  hole.lineTo(w * .8, w * .4);
  hole.lineTo(w * .55, w * .7);
  hole.lineTo(-w * .55, w * .7);
  hole.lineTo(-w * .8, w * .4);
  hole.closePath();
  hood.holes.push(hole);
  mesh(new THREE.ExtrudeGeometry(hood, { depth: .014, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 2 }),
    kit.shell, 0, reflexY, optic.z - .01, reflex);
  panel(w * 1.5, w * 1.1, .003, .001, kit.glass, 0, reflexY + w * .1, optic.z, reflex);
  const reticle = createHoloReticle(w * .9, 0xff6a52);
  reticle.position.set(0, reflexY + w * .1, optic.z + .005);
  reflex.add(reticle);
  sightHeights['reflex-sight'] = reflexY + w * .1;

  variant('receiver', 'standard');
  const rapid = variant('receiver', 'rapid-receiver');
  const precision = variant('receiver', 'precision-receiver');
  for (const side of [-1, 1]) {
    const x = side * (receiver.width / 2 + .004);
    panel(.008, receiver.height * .7, receiver.length * .6, .002, kit.shell, x, receiver.y, receiver.z, rapid);
    for (let i = 0; i < 4; i++) {
      const louver = panel(.006, receiver.height * .4, .01, .002, kit.dark, x + side * .004, receiver.y,
        receiver.z - receiver.length * .2 + i * receiver.length * .13, rapid);
      louver.rotation.x = -.35;
    }
    panel(.005, .007, receiver.length * .25, .0015, kit.accent, x + side * .005, receiver.y + receiver.height * .3, receiver.z + receiver.length * .15, rapid);
    panel(.007, receiver.height * .35, receiver.length * .7, .002, kit.steel, x, receiver.y - receiver.height * .05, receiver.z, precision);
    panel(.004, .006, receiver.length * .4, .0015, kit.edge, x + side * .004, receiver.y + receiver.height * .15, receiver.z, precision);
    for (const dz of [-.35, .35]) {
      const screw = mesh(new THREE.CylinderGeometry(.007, .007, .007, 10), kit.edge,
        x + side * .004, receiver.y - receiver.height * .05, receiver.z + dz * receiver.length * .7, precision);
      screw.rotation.z = Math.PI / 2;
    }
  }

  const magazineGroup = group(root);
  magazineGroup.position.set(...magazine.position);
  const grips = {};
  const box = (id, heightScale, depthScale, extra) => {
    const part = variant('magazine', id, magazineGroup);
    const height = magazine.height * heightScale;
    if (magazine.shape === 'shell') {
      for (let i = 0; i < Math.round(3 * heightScale); i++) {
        tube(.011, .05, kit.shellCasing, (i - 1) * .024, -height * .3, 0, part).rotation.set(0, 0, 0);
        tube(.0115, .012, kit.brass, (i - 1) * .024, -height * .3, .025, part);
      }
      panel(.085, .016, .06, .004, kit.dark, 0, -height * .3 - .017, 0, part);
    } else if (magazine.shape === 'rocket') {
      cone(.0, magazine.width * .5, .07, kit.accent, 0, 0, -.035, part).rotation.x = -Math.PI / 2;
      tube(magazine.width * .5, magazine.depth * heightScale, kit.shell, 0, 0, magazine.depth * heightScale / 2, part);
      for (let i = 0; i < 4; i++) {
        const fin = panel(.004, magazine.width * .55, .05, .001, kit.dark, 0, 0, magazine.depth * heightScale - .02, part);
        fin.rotation.z = i * Math.PI / 2;
        fin.position.x = Math.cos(i * Math.PI / 2 + Math.PI / 2) * magazine.width * .45;
        fin.position.y = Math.sin(i * Math.PI / 2 + Math.PI / 2) * magazine.width * .45;
      }
    } else {
      panel(magazine.width, height, magazine.depth * depthScale, .006, kit.dark, 0, -height / 2, 0, part).rotation.x = magazine.tilt ?? .1;
      panel(magazine.width * 1.08, .016, magazine.depth * depthScale * 1.08, .004, extra ? kit.shell : kit.steel, 0, -height - .004, -.004, part);
      if (heightScale > 1) {
        for (const side of [-1, 1]) {
          panel(.004, height * .8, .012, .0015, kit.accent, side * magazine.width / 2, -height * .45, magazine.depth * .25, part);
        }
      }
      if (extra) panel(magazine.width * .9, .008, .014, .002, kit.rubber, 0, -height - .016, -magazine.depth * .3, part);
    }
    grips[id] = new THREE.Vector3(-magazine.width / 2 - .01, -height * .55, -.01);
  };
  box('standard', 1, 1, false);
  box('extended-magazine', 1.45, 1.05, false);
  box('quick-magazine', .7, .95, true);

  return {
    parts, magazine: magazineGroup, magazineGrips: grips,
    muzzleFor: build => new THREE.Vector3(0, barrel.y, sockets[build.barrel] + tips[build.muzzle]),
    sightFor: build => new THREE.Vector3(0, sightHeights[build.optic], optic.z),
    apply(build) {
      for (const [slot, variants] of Object.entries(parts)) {
        for (const [id, part] of Object.entries(variants)) part.visible = build[slot] === id;
      }
      muzzleMount.position.z = sockets[build.barrel];
    },
    anchors: build => ({
      barrel: new THREE.Vector3(0, barrel.y, barrel.start - lengths[build.barrel] * .5),
      muzzle: new THREE.Vector3(0, barrel.y, sockets[build.barrel] + tips[build.muzzle] * .5),
      optic: new THREE.Vector3(0, sightHeights[build.optic], optic.z),
      receiver: new THREE.Vector3(0, receiver.y, receiver.z),
      magazine: new THREE.Vector3(...magazine.position).add(new THREE.Vector3(0, -magazine.height * .5, 0)),
    }),
  };
}

function buildSniper(kit) {
  const root = new THREE.Group();
  const { panel, tube, lathe, mesh, group } = builder(root);
  // The body and the bolt are the Blender model, swapped in once loaded.
  const bolt = group();
  const slots = addSlotParts(root, kit, {
    barrel: { start: -.29, length: .62, radius: .017, y: .02, fluted: true, muzzleScale: 1.1 },
    optic: { y: .075, z: -.15, width: .07, length: .2, scale: 1.25, scopeLift: .072, reflexLift: .045 },
    receiver: { y: .01, z: -.12, width: .11, height: .1, length: .36 },
    magazine: { position: [0, -.05, -.17], width: .056, height: .07, depth: .085, tilt: .05 },
    ownSights(part) {
      const y = .075 + .075;
      panel(.07, .018, .26, .004, kit.dark, 0, .084, -.15, part);
      lathe([[.026, -.17], [.042, -.17], [.046, -.155], [.044, -.13], [.03, -.11], [.031, .1], [.04, .12], [.04, .16],
        [.03, .165], [.026, .15], [.026, -.17]], kit.steel, 0, y, -.15, part);
      mesh(new THREE.CircleGeometry(.03, 28), kit.glass, 0, y, -.32, part).rotation.y = Math.PI;
      for (const dz of [-.07, .05]) {
        panel(.03, .07, .016, .004, kit.dark, 0, .115, -.15 + dz, part);
        tube(.035, .018, kit.edge, 0, y, -.15 + dz, part);
      }
      const turret = mesh(new THREE.CylinderGeometry(.013, .015, .02, 16), kit.edge, 0, y + .045, -.14, part);
      turret.rotation.y = .2;
      const windage = mesh(new THREE.CylinderGeometry(.012, .014, .02, 16), kit.edge, .045, y, -.14, part);
      windage.rotation.z = Math.PI / 2;
      mesh(new THREE.SphereGeometry(.003, 8, 6), kit.accent, 0, y, -.33, part);
      return y;
    },
  });
  return {
    root, bolt, ...slots,
    supportRest: new THREE.Vector3(-.075, -.074, -.44),
    sticker: { position: new THREE.Vector3(-.0508, .005, -.1), size: .05 },
    decal: { position: new THREE.Vector3(-.0596, .01, -.46), width: .3, height: .028 },
    charm: new THREE.Vector3(-.066, .012, -.24),
  };
}

function buildShotgun(kit) {
  const root = new THREE.Group();
  const { panel, tube, mesh, group } = builder(root);
  // The body and the bolt are the Blender model, swapped in once loaded.
  const bolt = group();
  const slots = addSlotParts(root, kit, {
    barrel: { start: -.25, length: .48, radius: .024, y: .022, muzzleScale: 1 },
    optic: { y: .058, z: -.12, width: .08, length: .18, scale: 1, scopeLift: .05, reflexLift: .03 },
    receiver: { y: 0, z: -.1, width: .125, height: .115, length: .31 },
    magazine: { position: [0, -.075, -.13], width: .07, height: .04, depth: .06, shape: 'shell' },
    ownSights(part) {
      mesh(new THREE.SphereGeometry(.006, 12, 8), kit.accent, 0, .05, -.7, part);
      const ring = mesh(new THREE.TorusGeometry(.014, .004, 8, 20), kit.dark, 0, .078, -.12, part);
      ring.rotation.y = 0;
      panel(.012, .02, .014, .003, kit.dark, 0, .064, -.12, part);
      return .078;
    },
  });
  return {
    root, bolt, ...slots,
    supportRest: new THREE.Vector3(-.075, -.085, -.42),
    sticker: { position: new THREE.Vector3(-.0606, -.012, -.02), size: .04 },
    decal: { position: new THREE.Vector3(-.0406, -.035, .21), width: .22, height: .07 },
    charm: new THREE.Vector3(-.074, 0, -.215),
  };
}

function buildLauncher(kit) {
  const root = new THREE.Group();
  const { panel, tube, cone, mesh, group } = builder(root);
  const y = .045;
  // The body and the bolt are the Blender model, swapped in once loaded.
  const bolt = group();
  const slots = addSlotParts(root, kit, {
    barrel: { start: -.59, length: .14, radius: .068, y, muzzleScale: .8 },
    optic: { y: y + .062, z: -.16, width: .06, length: .14, scale: 1.1, scopeLift: .05, reflexLift: .032 },
    receiver: { y, z: -.12, width: .13, height: .1, length: .3 },
    magazine: { position: [0, y, -.66], width: .1, height: .1, depth: .2, shape: 'rocket' },
    ownSights(part) {
      const sy = y + .1;
      panel(.016, .05, .04, .004, kit.dark, -.035, y + .075, -.16, part);
      panel(.05, .04, .08, .006, kit.dark, -.035, sy, -.16, part);
      mesh(new THREE.CircleGeometry(.014, 20), kit.glass, -.035, sy, -.201, part).rotation.y = Math.PI;
      mesh(new THREE.SphereGeometry(.003, 8, 6), kit.accent, -.035, sy, -.205, part);
      return sy;
    },
  });
  const sightFor = slots.sightFor;
  return {
    root, bolt, ...slots,
    // The launcher's own sight sits off to the left of the tube.
    sightFor: build => {
      const point = sightFor(build);
      if (build.optic === 'standard') point.x = -.035;
      return point;
    },
    supportRest: new THREE.Vector3(-.06, -.07, -.36),
    sticker: { position: new THREE.Vector3(-.0648, y - .015, -.08), size: .055 },
    decal: { position: new THREE.Vector3(0, y, -.28), width: .3, height: .05, curve: .0668, angle: -.42 },
    charm: new THREE.Vector3(-.075, .035, -.12),
    hipOffset: new THREE.Vector3(0, .015, 0),
  };
}

function buildPistol(kit) {
  const root = new THREE.Group();
  const { panel, tube, group } = builder(root);
  // The body and the bolt are the Blender model, swapped in once loaded.
  const bolt = group();
  const slots = addSlotParts(root, kit, {
    barrel: { start: -.18, length: .03, radius: .012, y: .028, muzzleScale: 1 },
    optic: { y: .058, z: -.02, width: .045, length: .08, scale: .62, scopeLift: .028, reflexLift: .018 },
    receiver: { y: .0, z: -.06, width: .044, height: .036, length: .22 },
    magazine: { position: [0, -.13, .055], width: .036, height: .03, depth: .055, tilt: -.24 },
    ownSights(part) {
      panel(.008, .01, .008, .002, kit.accent, 0, .063, -.18, part);
      panel(.03, .012, .01, .002, kit.dark, 0, .064, .03, part);
      return .066;
    },
  });
  return {
    root, bolt, ...slots,
    supportRest: new THREE.Vector3(-.05, -.115, .035),
    sticker: { position: new THREE.Vector3(-.0255, .035, -.09), size: .03 },
    decal: { position: new THREE.Vector3(-.0226, -.008, -.11), width: .12, height: .02 },
    charm: new THREE.Vector3(-.026, -.012, -.15),
    // The pistol sits higher and closer than the long guns so both gloves stay in frame.
    hipOffset: new THREE.Vector3(-.065, .125, .08),
  };
}

const BUILDERS = { sniper: buildSniper, shotgun: buildShotgun, launcher: buildLauncher, pistol: buildPistol };

// Printed decals drawn once per design.
const stickerTextures = {};
export function drawSticker(context, size, id) {
  const sticker = WEAPON_STICKERS[id];
  context.clearRect(0, 0, size, size);
  if (!sticker?.paper) return;
  const c = size / 2;
  context.save();
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.roundRect(size * .04, size * .04, size * .92, size * .92, size * .2);
  context.fill();
  context.fillStyle = sticker.paper;
  context.beginPath();
  context.roundRect(size * .1, size * .1, size * .8, size * .8, size * .16);
  context.fill();
  context.fillStyle = sticker.ink;
  context.strokeStyle = sticker.ink;
  context.lineCap = context.lineJoin = 'round';
  const s = size / 128;
  if (id === 'biohazard') {
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 3;
      context.beginPath();
      context.arc(c + Math.cos(angle) * 18 * s, c + Math.sin(angle) * 18 * s, 17 * s, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = sticker.paper;
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 3;
      context.beginPath();
      context.arc(c + Math.cos(angle) * 24 * s, c + Math.sin(angle) * 24 * s, 11 * s, 0, Math.PI * 2);
      context.fill();
    }
    context.beginPath();
    context.arc(c, c, 8 * s, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 5 * s;
    context.beginPath();
    context.arc(c, c, 24 * s, 0, Math.PI * 2);
    context.stroke();
  } else if (id === 'happy-virus') {
    context.lineWidth = 5 * s;
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5;
      context.beginPath();
      context.moveTo(c + Math.cos(angle) * 26 * s, c + Math.sin(angle) * 26 * s);
      context.lineTo(c + Math.cos(angle) * 40 * s, c + Math.sin(angle) * 40 * s);
      context.stroke();
      context.beginPath();
      context.arc(c + Math.cos(angle) * 41 * s, c + Math.sin(angle) * 41 * s, 5 * s, 0, Math.PI * 2);
      context.fill();
    }
    context.beginPath();
    context.arc(c, c, 28 * s, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = sticker.paper;
    for (const dx of [-10, 10]) {
      context.beginPath();
      context.arc(c + dx * s, c - 6 * s, 4.5 * s, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = sticker.paper;
    context.lineWidth = 4 * s;
    context.beginPath();
    context.arc(c, c + 2 * s, 14 * s, .2 * Math.PI, .8 * Math.PI);
    context.stroke();
  } else if (id === 'bolt') {
    context.beginPath();
    [[8, -40], [-18, 6], [0, 6], [-8, 40], [20, -8], [2, -8], [12, -40]].forEach(([x, y], index) => {
      context[index ? 'lineTo' : 'moveTo'](c + x * s, c + y * s);
    });
    context.closePath();
    context.fill();
  } else if (id === 'heart') {
    context.beginPath();
    context.moveTo(c, c + 34 * s);
    context.bezierCurveTo(c - 52 * s, c - 4 * s, c - 22 * s, c - 44 * s, c, c - 18 * s);
    context.bezierCurveTo(c + 22 * s, c - 44 * s, c + 52 * s, c - 4 * s, c, c + 34 * s);
    context.fill();
  } else if (id === 'skull') {
    context.beginPath();
    context.arc(c, c - 6 * s, 28 * s, 0, Math.PI * 2);
    context.fill();
    context.fillRect(c - 16 * s, c + 12 * s, 32 * s, 20 * s);
    context.fillStyle = sticker.paper;
    for (const dx of [-11, 11]) {
      context.beginPath();
      context.arc(c + dx * s, c - 6 * s, 8 * s, 0, Math.PI * 2);
      context.fill();
    }
    context.beginPath();
    context.moveTo(c, c + 2 * s);
    context.lineTo(c - 5 * s, c + 11 * s);
    context.lineTo(c + 5 * s, c + 11 * s);
    context.fill();
    for (const dx of [-8, 0, 8]) context.fillRect(c + dx * s - 1.5 * s, c + 20 * s, 3 * s, 12 * s);
  } else if (id === 'star') {
    context.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 ? 17 * s : 40 * s;
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      context[i ? 'lineTo' : 'moveTo'](c + Math.cos(angle) * radius, c + Math.sin(angle) * radius);
    }
    context.closePath();
    context.fill();
  } else if (id === 'studio') {
    context.lineWidth = 6 * s;
    context.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3;
      context[i ? 'lineTo' : 'moveTo'](c + Math.cos(angle) * 34 * s, c + Math.sin(angle) * 34 * s);
    }
    context.closePath();
    context.stroke();
    context.fillRect(c - 3 * s, c - 18 * s, 6 * s, 36 * s);
    context.fillRect(c - 18 * s, c - 3 * s, 36 * s, 6 * s);
  } else if (id === 'dna') {
    context.lineWidth = 5 * s;
    for (const phase of [0, Math.PI]) {
      context.beginPath();
      for (let i = 0; i <= 40; i++) {
        const y = c - 40 * s + i * 2 * s;
        context[i ? 'lineTo' : 'moveTo'](c + Math.sin(i * .22 + phase) * 22 * s, y);
      }
      context.stroke();
    }
    context.lineWidth = 3 * s;
    for (let i = 3; i < 40; i += 5) {
      const y = c - 40 * s + i * 2 * s;
      context.beginPath();
      context.moveTo(c + Math.sin(i * .22) * 22 * s, y);
      context.lineTo(c + Math.sin(i * .22 + Math.PI) * 22 * s, y);
      context.stroke();
    }
  } else if (id === 'antibody') {
    context.lineWidth = 11 * s;
    context.beginPath();
    context.moveTo(c, c + 38 * s);
    context.lineTo(c, c + 2 * s);
    context.lineTo(c - 26 * s, c - 30 * s);
    context.moveTo(c, c + 2 * s);
    context.lineTo(c + 26 * s, c - 30 * s);
    context.stroke();
    for (const dx of [-1, 1]) {
      context.beginPath();
      context.arc(c + dx * 30 * s, c - 35 * s, 8 * s, 0, Math.PI * 2);
      context.fill();
    }
  } else if (id === 'flame') {
    context.beginPath();
    context.moveTo(c, c - 42 * s);
    context.bezierCurveTo(c + 10 * s, c - 18 * s, c + 36 * s, c - 8 * s, c + 28 * s, c + 18 * s);
    context.bezierCurveTo(c + 22 * s, c + 40 * s, c - 22 * s, c + 42 * s, c - 28 * s, c + 18 * s);
    context.bezierCurveTo(c - 34 * s, c - 4 * s, c - 14 * s, c - 6 * s, c - 12 * s, c - 22 * s);
    context.bezierCurveTo(c - 4 * s, c - 14 * s, c - 4 * s, c - 30 * s, c, c - 42 * s);
    context.fill();
    context.fillStyle = '#ffe07a';
    context.beginPath();
    context.ellipse(c, c + 18 * s, 12 * s, 18 * s, 0, 0, Math.PI * 2);
    context.fill();
  } else if (id === 'snowflake') {
    context.lineWidth = 6 * s;
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const point = (r, turn = 0) => [c + Math.cos(angle + turn) * r * s, c + Math.sin(angle + turn) * r * s];
      context.beginPath();
      context.moveTo(c, c);
      context.lineTo(...point(40));
      context.moveTo(...point(24));
      context.lineTo(...point(33, .3));
      context.moveTo(...point(24));
      context.lineTo(...point(33, -.3));
      context.stroke();
    }
  } else if (id === 'paw') {
    context.beginPath();
    context.ellipse(c, c + 14 * s, 22 * s, 19 * s, 0, 0, Math.PI * 2);
    context.fill();
    for (const [dx, dy, r] of [[-28, -10, 9], [-11, -28, 10], [11, -28, 10], [28, -10, 9]]) {
      context.beginPath();
      context.ellipse(c + dx * s, c + dy * s, r * s * .8, r * s, dx * .02, 0, Math.PI * 2);
      context.fill();
    }
  } else if (id === 'crosshair') {
    context.lineWidth = 5 * s;
    for (const r of [34, 18]) {
      context.beginPath();
      context.arc(c, c, r * s, 0, Math.PI * 2);
      context.stroke();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      context.beginPath();
      context.moveTo(c + dx * 10 * s, c + dy * 10 * s);
      context.lineTo(c + dx * 44 * s, c + dy * 44 * s);
      context.stroke();
    }
    context.beginPath();
    context.arc(c, c, 4 * s, 0, Math.PI * 2);
    context.fill();
  } else if (id === 'cat') {
    context.beginPath();
    context.moveTo(c - 34 * s, c - 38 * s);
    context.lineTo(c - 16 * s, c - 20 * s);
    context.lineTo(c + 16 * s, c - 20 * s);
    context.lineTo(c + 34 * s, c - 38 * s);
    context.lineTo(c + 36 * s, c + 6 * s);
    context.quadraticCurveTo(c + 34 * s, c + 36 * s, c, c + 38 * s);
    context.quadraticCurveTo(c - 34 * s, c + 36 * s, c - 36 * s, c + 6 * s);
    context.closePath();
    context.fill();
    context.fillStyle = sticker.paper;
    context.strokeStyle = sticker.paper;
    context.lineWidth = 3.5 * s;
    for (const dx of [-14, 14]) {
      context.beginPath();
      context.moveTo(c + dx * s - 8 * s, c + 1 * s);
      context.quadraticCurveTo(c + dx * s, c - 6 * s, c + dx * s + 8 * s, c + 1 * s);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(c - 4 * s, c + 12 * s);
    context.lineTo(c + 4 * s, c + 12 * s);
    context.lineTo(c, c + 17 * s);
    context.fill();
    for (const dx of [-1, 1]) {
      for (const dy of [-4, 4]) {
        context.beginPath();
        context.moveTo(c + dx * 16 * s, c + (16 + dy * .5) * s);
        context.lineTo(c + dx * 32 * s, c + (16 + dy * 1.5) * s);
        context.stroke();
      }
    }
  } else if (id === 'pizza') {
    context.fillStyle = '#d98b3a';
    context.beginPath();
    context.moveTo(c - 34 * s, c - 30 * s);
    context.quadraticCurveTo(c, c - 46 * s, c + 34 * s, c - 30 * s);
    context.lineTo(c, c + 42 * s);
    context.closePath();
    context.fill();
    context.fillStyle = '#ffe28a';
    context.beginPath();
    context.moveTo(c - 28 * s, c - 22 * s);
    context.quadraticCurveTo(c, c - 34 * s, c + 28 * s, c - 22 * s);
    context.lineTo(c, c + 34 * s);
    context.closePath();
    context.fill();
    context.fillStyle = sticker.ink;
    for (const [dx, dy] of [[-10, -12], [10, -8], [0, 10], [-3, -24]]) {
      context.beginPath();
      context.arc(c + dx * s, c + dy * s, 6 * s, 0, Math.PI * 2);
      context.fill();
    }
  } else if (id === 'rainbow') {
    const bands = ['#e8413c', '#f39a2b', '#f6d23c', '#4cc35a', '#3a8fe0', '#5b4cc8', '#9a4fc7'];
    context.lineWidth = 6 * s;
    bands.forEach((color, index) => {
      context.strokeStyle = color;
      context.beginPath();
      context.arc(c, c + 20 * s, (42 - index * 6) * s, Math.PI, 0);
      context.stroke();
    });
    context.fillStyle = sticker.ink;
    for (const dx of [-30, 30]) {
      context.beginPath();
      context.arc(c + dx * s, c + 24 * s, 10 * s, 0, Math.PI * 2);
      context.arc(c + dx * s + 9 * s, c + 22 * s, 8 * s, 0, Math.PI * 2);
      context.fill();
    }
  } else if (id === 'peace') {
    context.lineWidth = 8 * s;
    context.beginPath();
    context.arc(c, c, 34 * s, 0, Math.PI * 2);
    context.moveTo(c, c - 34 * s);
    context.lineTo(c, c + 34 * s);
    context.moveTo(c, c);
    context.lineTo(c - 24 * s, c + 24 * s);
    context.moveTo(c, c);
    context.lineTo(c + 24 * s, c + 24 * s);
    context.stroke();
  } else if (id === 'trophy') {
    // A gold cup on its plinth.
    context.beginPath();
    context.moveTo(c - 26 * s, c - 34 * s); context.lineTo(c + 26 * s, c - 34 * s);
    context.quadraticCurveTo(c + 26 * s, c + 8 * s, c, c + 12 * s);
    context.quadraticCurveTo(c - 26 * s, c + 8 * s, c - 26 * s, c - 34 * s);
    context.fill();
    context.lineWidth = 7 * s;
    context.beginPath(); context.arc(c - 26 * s, c - 18 * s, 12 * s, Math.PI * .5, Math.PI * 1.5); context.stroke();
    context.beginPath(); context.arc(c + 26 * s, c - 18 * s, 12 * s, -Math.PI * .5, Math.PI * .5); context.stroke();
    context.fillRect(c - 6 * s, c + 10 * s, 12 * s, 14 * s);
    context.fillRect(c - 22 * s, c + 24 * s, 44 * s, 10 * s);
    context.fillStyle = '#fff6c8';
    context.fillRect(c - 16 * s, c - 28 * s, 6 * s, 22 * s);
  } else if (id === 'medic') {
    // A green cross (the protected red cross is not used).
    context.fillRect(c - 11 * s, c - 34 * s, 22 * s, 68 * s);
    context.fillRect(c - 34 * s, c - 11 * s, 68 * s, 22 * s);
  } else if (id === 'squad') {
    // Three suit helmets, shoulder to shoulder.
    for (const [x, scale] of [[c - 26 * s, .8], [c + 26 * s, .8], [c, 1]]) {
      context.beginPath(); context.arc(x, c - 8 * s * scale, 15 * s * scale, Math.PI, 0); context.lineTo(x + 15 * s * scale, c + 10 * s); context.lineTo(x - 15 * s * scale, c + 10 * s); context.closePath(); context.fill();
      context.fillStyle = sticker.paper;
      context.fillRect(x - 10 * s * scale, c - 8 * s * scale, 20 * s * scale, 6 * s * scale);
      context.fillStyle = sticker.ink;
    }
    context.fillRect(c - 44 * s, c + 16 * s, 88 * s, 8 * s);
  }
  context.restore();
}

export function stickerTexture(id) {
  if (stickerTextures[id]) return stickerTextures[id];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  drawSticker(canvas.getContext('2d'), 128, id);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return (stickerTextures[id] = map);
}

// One mesh per charm, hung from a three-link chain that swings with the weapon.
export function createCharms() {
  const pivot = new THREE.Group();
  pivot.name = 'weapon-charm';
  const { mesh, group } = builder(pivot);
  const chainMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, metalness: .9, roughness: .3 });
  for (let i = 0; i < 3; i++) {
    const link = mesh(new THREE.TorusGeometry(.0042, .0011, 6, 12), chainMaterial, 0, -.006 - i * .0075, 0);
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
  }
  const charms = {};
  const at = -.03;
  const tint = id => new THREE.MeshStandardMaterial({
    color: WEAPON_CHARMS[id].color, roughness: .35, metalness: .15,
    emissive: WEAPON_CHARMS[id].color, emissiveIntensity: .18,
  });
  const clover = charms.clover = group();
  for (let i = 0; i < 3; i++) {
    const angle = Math.PI / 2 + i * Math.PI * 2 / 3;
    const leaf = mesh(new THREE.SphereGeometry(.0075, 14, 10), tint('clover'), Math.cos(angle) * .007, at + Math.sin(angle) * .007, 0, clover);
    leaf.scale.set(1, 1, .35);
  }
  mesh(new THREE.CylinderGeometry(.0012, .0012, .012, 6), tint('clover'), .002, at - .011, 0, clover).rotation.z = .3;
  const fang = charms.fang = group();
  mesh(new THREE.ConeGeometry(.0065, .028, 12), tint('fang'), 0, at - .004, 0, fang).rotation.z = Math.PI;
  mesh(new THREE.TorusGeometry(.006, .0018, 6, 14), chainMaterial, 0, at + .011, 0, fang);
  const hourglass = charms.hourglass = group();
  mesh(new THREE.ConeGeometry(.007, .012, 14), tint('hourglass'), 0, at - .006, 0, hourglass);
  mesh(new THREE.ConeGeometry(.007, .012, 14), tint('hourglass'), 0, at + .006, 0, hourglass).rotation.z = Math.PI;
  for (const dy of [-.013, .013]) mesh(new THREE.CylinderGeometry(.009, .009, .003, 14), chainMaterial, 0, at + dy, 0, hourglass);
  const feather = charms.feather = group();
  const vane = mesh(new THREE.SphereGeometry(.009, 14, 10), tint('feather'), 0, at - .006, 0, feather);
  vane.scale.set(.5, 1.9, .16);
  mesh(new THREE.CylinderGeometry(.0008, .0008, .036, 6), chainMaterial, 0, at - .006, .0016, feather);
  const eye = charms.eye = group();
  mesh(new THREE.SphereGeometry(.009, 18, 14), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: .2 }), 0, at, 0, eye);
  mesh(new THREE.SphereGeometry(.0052, 16, 12), tint('eye'), 0, at, -.0052, eye);
  mesh(new THREE.SphereGeometry(.0024, 10, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, at, -.0085, eye);
  const capsule = charms.capsule = group();
  const top = mesh(new THREE.CapsuleGeometry(.0055, .009, 6, 12), tint('capsule'), 0, at + .004, 0, capsule);
  top.scale.y = .62;
  const bottom = mesh(new THREE.CapsuleGeometry(.0055, .009, 6, 12), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .3 }), 0, at - .006, 0, capsule);
  bottom.scale.y = .62;
  const gold = new THREE.MeshStandardMaterial({ color: 0xe6b84a, metalness: .85, roughness: .28, emissive: 0x6b4a10, emissiveIntensity: .15 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: .6 });
  const dice = charms.dice = group();
  const cube = mesh(new THREE.BoxGeometry(.014, .014, .014), tint('dice'), 0, at, 0, dice);
  cube.rotation.set(.35, .6, .2);
  for (const [x, y, z] of [[-.0071, 0, 0], [0, .0071, -.004], [0, .0071, .004], [0, 0, -.0071], [-.004, -.004, -.0071], [.004, .004, -.0071]]) {
    mesh(new THREE.SphereGeometry(.0016, 8, 6), ink, x, y, z, cube);
  }
  const antibody = charms.antibody = group();
  const arm = new THREE.CapsuleGeometry(.0022, .011, 4, 8);
  mesh(arm, tint('antibody'), 0, at - .007, 0, antibody);
  for (const side of [-1, 1]) {
    mesh(arm, tint('antibody'), side * .005, at + .006, 0, antibody).rotation.z = -side * .6;
    mesh(new THREE.SphereGeometry(.0032, 10, 8), tint('antibody'), side * .0095, at + .0125, 0, antibody);
  }
  const snowflake = charms.snowflake = group();
  for (let i = 0; i < 3; i++) {
    const spoke = mesh(new THREE.BoxGeometry(.0026, .028, .0016), tint('snowflake'), 0, at - .002, 0, snowflake);
    spoke.rotation.z = i * Math.PI / 3;
  }
  mesh(new THREE.OctahedronGeometry(.0045), tint('snowflake'), 0, at - .002, 0, snowflake);
  const heart = new THREE.Shape();
  heart.moveTo(0, -.009);
  heart.bezierCurveTo(-.014, .001, -.006, .011, 0, .004);
  heart.bezierCurveTo(.006, .011, .014, .001, 0, -.009);
  const locket = charms.locket = group();
  const shape = new THREE.ExtrudeGeometry(heart, { depth: .004, bevelEnabled: true, bevelThickness: .0012, bevelSize: .001, bevelSegments: 2 });
  shape.translate(0, 0, -.002);
  mesh(shape, gold, 0, at - .002, 0, locket).rotation.y = Math.PI / 2;
  const claw = charms.claw = group();
  mesh(new THREE.CylinderGeometry(.0018, .0018, .02, 8), chainMaterial, 0, at + .007, 0, claw).rotation.x = Math.PI / 2;
  for (const dz of [-.007, 0, .007]) {
    const talon = mesh(new THREE.ConeGeometry(.0028, .02, 10), tint('claw'), 0, at - .004, dz, claw);
    talon.rotation.set(dz * 18, 0, Math.PI + .35);
  }
  const skull = charms.skull = group();
  mesh(new THREE.SphereGeometry(.0085, 16, 12), tint('skull'), 0, at + .002, 0, skull);
  const jaw = mesh(new THREE.BoxGeometry(.009, .006, .009), tint('skull'), 0, at - .006, 0, skull);
  jaw.position.x = -.001;
  for (const dz of [-.0035, .0035]) mesh(new THREE.SphereGeometry(.0024, 8, 6), ink, -.0072, at + .002, dz, skull);
  const battery = charms.battery = group();
  mesh(new THREE.CylinderGeometry(.0055, .0055, .022, 16), new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: .5, roughness: .35 }), 0, at - .002, 0, battery);
  mesh(new THREE.CylinderGeometry(.0057, .0057, .008, 16), tint('battery'), 0, at + .004, 0, battery);
  mesh(new THREE.CylinderGeometry(.0022, .0022, .003, 10), chainMaterial, 0, at + .0105, 0, battery);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? .0055 : .013;
    const angle = Math.PI / 2 + i * Math.PI / 5;
    starShape[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  const star = charms.star = group();
  const starGeometry = new THREE.ExtrudeGeometry(starShape, { depth: .003, bevelEnabled: true, bevelThickness: .001, bevelSize: .0008, bevelSegments: 1 });
  starGeometry.translate(0, 0, -.0015);
  mesh(starGeometry, gold, 0, at - .006, 0, star).rotation.y = Math.PI / 2;
  // Charms read at a glance from the first-person view.
  pivot.scale.setScalar(1.6);
  return { pivot, charms };
}

// A decal bent around a tube of radius `curve`, centred `angle` radians up from the tube's left side.
// Like the flat decals, the print runs from the muzzle end to the stock end.
function wrappedDecal({ width, height, curve, angle = 0 }) {
  const geometry = new THREE.PlaneGeometry(width, height, 1, 16);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const along = position.getX(i);
    const around = position.getY(i) / curve + angle;
    position.setXYZ(i, -Math.cos(around) * curve, Math.sin(around) * curve, along);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// The first-person view: the carbine (with gloves) plus every other weapon, swapped by loadout.
export function createArsenalView({ showHands = true } = {}) {
  const carbine = createCarbine({ showHands });
  const { model } = carbine;
  const bodies = {};
  for (const [kind, build] of Object.entries(BUILDERS)) {
    const kit = createKit();
    const body = build(kit);
    body.kit = kit;
    body.root.visible = false;
    body.root.traverse(part => { if (part.isMesh) part.userData.weapon = kind; });
    model.add(body.root);
    bodies[kind] = body;
  }
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
    transparent: true, alphaTest: .4, roughness: .55, metalness: .05, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  sticker.rotation.y = -Math.PI / 2;
  model.add(sticker);
  // Side decal: a flat print, or one wrapped around the launcher's tube.
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
    transparent: true, alphaTest: .25, roughness: .5, metalness: .05, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2,
  }));
  model.add(decal);
  const decalShapes = new Map();
  const decalGeometry = spec => {
    if (!decalShapes.has(spec)) decalShapes.set(spec, spec.curve ? wrappedDecal(spec) : new THREE.PlaneGeometry(spec.width, spec.height));
    return decalShapes.get(spec);
  };
  makeSkinnable(carbine.shell);
  for (const [role, material] of Object.entries(carbine.materials)) makeWeathered(material, role);
  const carbinePolymer = carbine.shell.map;
  // Adds the modelled bodies around the slot parts and mounts.
  let modelled = false;
  const useModels = models => {
    if (modelled || !models.size) return;
    modelled = true;
    const carbineModel = models.get('carbine');
    if (carbineModel) {
      const bodyNode = modelledNode(carbineModel, 'body', carbine.materials, 'carbine');
      if (bodyNode) carbine.replaceBody(bodyNode, modelledNode(carbineModel, 'bolt', carbine.materials, 'carbine'));
    }
    for (const [kind, body] of Object.entries(bodies)) {
      const scene = models.get(kind);
      const bodyNode = scene && modelledNode(scene, 'body', body.kit, kind);
      if (!bodyNode) continue;
      for (const part of body.root.children) if (part.isMesh) part.visible = false;
      body.root.add(bodyNode);
      const boltNode = modelledNode(scene, 'bolt', body.kit, kind);
      if (boltNode && body.bolt) {
        for (const part of body.bolt.children) part.visible = false;
        body.bolt.add(boltNode);
      }
    }
    // A loadout applied before the swap re-shows the carbine body; apply it again.
    setLoadout(current);
  };
  const { pivot: charmPivot, charms } = createCharms();
  model.add(charmPivot);
  const charmSwing = { x: 0, z: 0, vx: 0, vz: 0 };
  // Carbine decor positions, matching its receiver and grip.
  const carbineDecor = {
    sticker: { position: new THREE.Vector3(-.0776, -.02, -.42), size: .036 },
    decal: { position: new THREE.Vector3(-.0812, .026, .115), width: .23, height: .05 },
    charm: new THREE.Vector3(-.08, -.02, -.25),
  };
  const carbineSight = carbine.sight.position.clone();
  const carbineMuzzle = carbine.muzzle.position.clone();
  const carbineMagazine = carbine.magazine;
  const carbineGrip = carbine.magazineGrip.clone();
  const carbineSupport = carbine.supportHand.position.clone();
  const carbineBolt = carbine.bolt;
  let active = 'carbine';
  let current = normalizeWeaponLoadout(DEFAULT_WEAPON_LOADOUT);
  const supportRest = carbineSupport.clone();
  const hipOffset = new THREE.Vector3();

  function setLoadout(loadout = DEFAULT_WEAPON_LOADOUT) {
    const next = normalizeWeaponLoadout(loadout);
    active = next.weapon;
    carbine.setBodyVisible(active === 'carbine');
    for (const [kind, body] of Object.entries(bodies)) body.root.visible = kind === active;
    let decor = carbineDecor;
    if (active === 'carbine') {
      carbine.setLoadout(next);
      carbine.setBodyVisible(true);
      carbine.sight.position.copy(carbineSight);
      supportRest.copy(carbineSupport);
      hipOffset.set(0, 0, 0);
    } else {
      const body = bodies[active];
      body.apply(next);
      paint(body.kit, next);
      carbine.muzzle.position.copy(body.muzzleFor(next));
      carbine.sight.position.copy(body.sightFor(next));
      supportRest.copy(body.supportRest);
      decor = body;
      hipOffset.copy(body.hipOffset ?? new THREE.Vector3());
    }
    if (active === 'carbine' && current.weapon !== 'carbine') {
      // Restore the carbine muzzle for its current barrel and muzzle.
      carbine.muzzle.position.copy(carbineMuzzle);
      carbine.setLoadout({ ...next, barrel: next.barrel === 'standard' ? 'short-barrel' : 'standard' });
      carbine.setLoadout(next);
    }
    if (active === 'carbine') dressShell(carbine.shell, next.skin, finishPalette(next.finish).shell, carbinePolymer);
    decal.visible = Boolean(WEAPON_DECALS[next.decal].ink);
    if (decal.visible) {
      decal.geometry = decalGeometry(decor.decal);
      decal.material.map = decalTexture(next.decal);
      decal.material.needsUpdate = true;
      decal.position.copy(decor.decal.position);
      decal.rotation.set(0, decor.decal.curve ? 0 : -Math.PI / 2, 0);
    }
    const design = WEAPON_STICKERS[next.sticker];
    sticker.visible = Boolean(design.paper);
    if (sticker.visible) {
      sticker.material.map = stickerTexture(next.sticker);
      sticker.material.needsUpdate = true;
      sticker.position.copy(decor.sticker.position);
      sticker.scale.setScalar(decor.sticker.size);
    }
    for (const [id, charm] of Object.entries(charms)) charm.visible = id === next.charm;
    charmPivot.visible = next.charm !== 'none';
    charmPivot.position.copy(decor.charm);
    current = next;
  }

  // Swings the charm like a pendulum from the weapon's sway, movement and recoil.
  function update(dt, { swayX = 0, swayY = 0, movement = 0, recoil = 0, stride = 0 } = {}, ammo = 1) {
    const step = Math.min(dt, .05);
    const pushX = -swayX * 60 + Math.sin(stride) * movement * .9;
    const pushZ = recoil * 9 + swayY * 40 + Math.cos(stride * 2) * movement * .5;
    charmSwing.vx += (pushX - charmSwing.x * 38 - charmSwing.vx * 3.2) * step;
    charmSwing.vz += (pushZ - charmSwing.z * 38 - charmSwing.vz * 3.2) * step;
    charmSwing.x = THREE.MathUtils.clamp(charmSwing.x + charmSwing.vx * step, -.9, .9);
    charmSwing.z = THREE.MathUtils.clamp(charmSwing.z + charmSwing.vz * step, -.9, .9);
    charmPivot.rotation.set(charmSwing.z, 0, charmSwing.x);
    // The launcher shows the loaded rocket only while it has one.
    if (active === 'launcher') bodies.launcher.magazine.visible = ammo > 0;
  }

  ensureWeathering(model);
  if (weaponModels.size) useModels(weaponModels);
  else weaponModelsReady.then(useModels);

  return {
    model,
    muzzle: carbine.muzzle,
    flash: carbine.flash,
    supportHand: carbine.supportHand,
    poseHands: carbine.poseHands,
    setLoadout,
    update,
    get weapon() { return active; },
    get sight() { return carbine.sight; },
    get magazine() { return active === 'carbine' ? carbineMagazine : bodies[active].magazine; },
    get magazineGrip() {
      return active === 'carbine' ? carbine.magazineGrip : bodies[active].magazineGrips[current.magazine];
    },
    get bolt() { return active === 'carbine' ? carbineBolt : bodies[active].bolt; },
    get supportRest() { return supportRest; },
    get hipOffset() { return hipOffset; },
    get carbineGrip() { return carbineGrip; },
    anchors() {
      if (active !== 'carbine') return bodies[active].anchors(current);
      return null;
    },
  };
}
