// Getting the renderer ready before play: desktop startup prepares every arena; mobile
// prepares one arena and defers the co-op lab. Both upload textures and compile shaders,
// photograph available Free Mode
// previews, and each deployment rehearses its own arena, hazards, effects and both carried
// weapons on a throwaway fixture, then waits for the GPU (prepareMission), so nothing stalls
// once the mission starts. Called through World's methods of the same names.
import { weaponModelsReady, prepareWeaponCosmetics } from './arsenal-models.mjs';
import { COOP_SUITS, loadSuitModels } from './suits.mjs';
import { RENDERED_PREVIEWS } from './level-hud.mjs';
import { COOP_MAX_PLAYERS } from './coop-protocol.mjs';
import { DEFAULT_WEAPON_LOADOUT, WEAPON_ORDER, WEAPON_SLOTS, loadoutWithWeapon } from './weapon-mods.mjs';
import { Simulation, JUNCTION_GASH_SITES, SPECIES } from './simulation.mjs';
import { ENEMY_MODELS } from './enemy-models.mjs';
import { NEST } from './field-objectives.mjs';
import { LEVEL_BOSSES } from './level-bosses.mjs';
import { floorHeight } from './arena-scene.mjs';
import { LOW_MEMORY } from './asset-loading.mjs';

const PRELOAD_INPUT = Object.freeze({ moveX: 0, moveZ: 0, lookX: 0, lookY: 0 });

// Shaders bake in whether they draw to the screen (tone mapped there) or into an HDR target, so
// they are compiled against the target the game will actually draw into: the post-processing
// pipeline's on High quality, the screen on Low.
async function compileFor(world, scene, camera, kind) {
  const post = world.post && world.quality !== 'low' ? world.post : null;
  if (post && post.width < 2) post.setSize(160, 90);
  const previous = world.renderer.getRenderTarget();
  world.renderer.setRenderTarget(post ? (kind === 'weapon' ? post.weaponTarget : post.sceneTarget) : null);
  try {
    await world.renderer.compileAsync(scene, camera);
  } finally {
    world.renderer.setRenderTarget(previous);
  }
}

export function prepareAll(world, areas, onProgress = () => {}) {
  if (!world.preparation) {
    world.preparation = world.prepareScenes(areas, onProgress).catch(error => {
      world.preparation = null;
      throw error;
    });
  }
  return world.preparation;
}

export async function prepareScenes(world, areas, onProgress) {
  const startArea = world.area;
  // Mobile prepares the insertion site, then other arenas at their deployment gate.
  if (LOW_MEMORY) areas = [startArea];
  const shadows = world.renderer.shadowMap.enabled;
  const total = areas.length + 2;
  const textures = new Set();
  const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
  const warmTextures = scene => {
    scene.traverse(object => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const texture of Object.values(material)) {
          if (!texture?.isTexture || textures.has(texture)) continue;
          textures.add(texture);
          world.renderer.initTexture(texture);
        }
      }
    });
  };

  onProgress(0, total, LOW_MEMORY ? 'Loading compact weapons, pathogens and sound' : 'Downloading and decoding weapons, pathogens, suits and sound');
  world.warmTextures = warmTextures;
  const [, , weapons, suits] = await Promise.all([world.textureReady, world.enemyModelsReady, weaponModelsReady,
    LOW_MEMORY ? Promise.resolve([]) : loadSuitModels()]);
  if (weapons.size !== WEAPON_ORDER.length || world.enemyModels.size !== Object.keys(ENEMY_MODELS).length || suits.some(suit => !suit)) {
    throw new Error('Required weapon, pathogen or suit models are missing');
  }
  if (!LOW_MEMORY) prepareWeaponCosmetics(world.renderer);
  onProgress(1, total, 'Uploading textures and preparing weapon shaders');
  // Prime GPU programs and texture uploads on the actual renderer using a small frame.
  world.renderer.setPixelRatio(1);
  world.renderer.setSize(160, 90, false);
  world.renderer.initTexture(world.scene.environment);
  try {
    for (const mesh of world.tracers.meshes) mesh.visible = true;
    world.syncLights();
    await compileFor(world, world.scene, world.camera, 'scene');
    world.renderer.render(world.scene, world.camera);
    for (const mesh of world.tracers.meshes) mesh.visible = false;
    warmTextures(world.weaponScene);
    const armory = new Simulation('artery');
    armory.start();
    world.updateWeapon(armory, 0, PRELOAD_INPUT, false, true);
    // Cycle slots together to upload each component without rendering every possible build.
    const slotVariants = Object.entries(WEAPON_SLOTS).map(([slot, { options }]) => [slot, Object.keys(options)]);
    const variantCount = Math.max(...slotVariants.map(([, options]) => options.length));
    const warmupBuilds = WEAPON_ORDER.flatMap(weapon => Array.from({ length: variantCount }, (_, index) => ({
      ...loadoutWithWeapon(DEFAULT_WEAPON_LOADOUT, 'primary', weapon),
      weapon,
      ...Object.fromEntries(slotVariants.map(([slot, options]) => [slot, options[index] ?? 'standard'])),
    })));
    world.carbine.flash.visible = true;
    // Prime both weapon shadow variants before preparing the arena scenes.
    for (const enabled of LOW_MEMORY ? [shadows] : [!shadows, shadows]) {
      world.renderer.shadowMap.enabled = enabled;
      world.weaponKey.castShadow = enabled;
      for (const loadout of LOW_MEMORY ? [DEFAULT_WEAPON_LOADOUT] : warmupBuilds) {
        world.setWeaponLoadout(loadout);
        await compileFor(world, world.weaponScene, world.weaponCamera, 'weapon');
        world.renderer.render(world.weaponScene, world.weaponCamera);
      }
    }
    world.carbine.flash.visible = false;
    onProgress(2, total, 'Building the arenas and combat effects');
    for (let index = 0; index < areas.length; index++) {
      await nextTask();
      const area = areas[index];
      world.setArea(area);
      const fixture = new Simulation(area);
      fixture.start();
      if (Object.hasOwn(RENDERED_PREVIEWS, area)) world.capturePreview(area, fixture);
      await world.prepareArea(fixture, warmTextures);
      if (area === 'brain') {
        const finale = new Simulation('brain', { bossPractice: true });
        finale.start();
        finale.boss.state = 'exposed';
        finale.boss.openness = 1;
        await world.prepareArea(finale, warmTextures);
      }
      onProgress(index + 3, total, 'Arena ready: ' + area.replaceAll('-', ' '));
    }
  } finally {
    world.renderer.shadowMap.enabled = world.weaponKey.castShadow = shadows;
    world.carbine.flash.visible = false;
    world.setWeaponLoadout(DEFAULT_WEAPON_LOADOUT);
    world.setArea(startArea);
    world.resize(true);
  }
}

// Renders a 480 x 270 Free Mode thumbnail from just behind the insertion point.
export function capturePreview(world, area, sim) {
  world.previews ??= {};
  try {
    const { x, z } = sim.player;
    world.camera.position.set(x, 2.3, z + 8);
    world.camera.rotation.set(-.06, 0, 0);
    world.camera.aspect = 16 / 9;
    world.camera.updateProjectionMatrix();
    world.camera.updateMatrixWorld();
    world.organEnvironment?.update(null, 2, false);
    world.props?.update(null, 2, 1 / 60, false);
    world.updateTissue(sim, 0, true);
    world.renderer.setSize(480, 270, false);
    world.syncLights();
    world.renderer.render(world.scene, world.camera);
    world.previews[area] = world.renderer.domElement.toDataURL('image/webp', .86);
  } catch {
    // Free Mode hides a card whose preview could not be drawn.
  } finally {
    world.renderer.setSize(160, 90, false);
  }
}

export async function prepareArea(world, sim, warmTextures) {
  const start = sim.player;
  let offset = -5;
  for (const type of Object.keys(SPECIES)) {
    if (type === 'colony') continue;
    const enemy = sim.createEnemy(type, start.x + offset, start.z - 11);
    if (enemy.behavior === 'bacillus') enemy.latched = true;
    sim.enemies.push(enemy);
    offset += 2;
  }
  sim.nodes[0].health = 66;
  sim.turret = { x: start.x + 2, y: 0, z: start.z - 4, yaw: Math.PI, pitch: 0 };
  sim.projectiles.push({ id: 0, x: start.x, y: 1, z: start.z - 8, vx: .2, vy: 0, vz: 1, radius: .25 });
  // The arena's boss, so its model, textures and shader are ready before it arrives.
  const design = LEVEL_BOSSES[sim.area];
  if (design) {
    const boss = sim.createEnemy(design.model, start.x + 9, start.z - 16, sim.nodes[0], design);
    sim.enemies.push(Object.assign(boss, { boss: design.id, behavior: 'boss', scale: design.scale, warning: '', damageScale: 1 }));
  }
  const nest = sim.createEnemy(NEST.model, start.x - 9, start.z - 14, sim.nodes[0], NEST);
  sim.enemies.push(Object.assign(nest, { nest: true, behavior: 'nest', scale: NEST.scale }));
  sim.pickups = [{ id: 0, kind: 'cache', x: start.x + 3, y: 1.3, z: start.z - 6, remaining: 30 }];
  if (sim.organ) sim.organ.phase = 'active';
  if (sim.area === 'junction') {
    sim.gash = { ...JUNCTION_GASH_SITES.left, branch: 'left', sealRemaining: 36, sealRequired: 36 };
    sim.reinforcement = { branch: 'right', remaining: 3 };
  }
  if (sim.area === 'stomach') {
    sim.gastric.stage = 'drained';
    sim.gastric.intake.progress = 1;
    sim.gastric.drain.progress = 1;
  }
  const shot = { type: 'shot', x: start.x, y: 1, z: start.z - 10, hit: true };
  const fire = { type: 'turret', stage: 'fire', x: sim.turret.x, y: 1, z: sim.turret.z,
    impact: { x: start.x - 2, y: 1, z: start.z - 13 } };
  start.id = 'warmup-local';
  sim.players = [start, ...Array.from({ length: LOW_MEMORY ? 0 : COOP_MAX_PLAYERS - 1 }, (_, index) => ({
    ...start, id: 'warmup-teammate-' + index, name: 'Teammate ' + (index + 1),
    x: start.x + (index ? 2.2 : -2.2), z: start.z - 9,
  }))];
  sim.events = [shot, fire, ...sim.players.slice(1).map(player => ({ ...shot, playerId: player.id })),
    { ...shot, rocket: true, travel: .8 },
    { type: 'explosion', x: start.x, y: 1, z: start.z - 7, radius: 5 }];
  world.render(sim, .02, PRELOAD_INPUT, false, false);
  // Keep both the healthy tissue's and recovery objective's lighting variants compiled.
  if (sim.area === 'lungs') {
    sim.startAirwayObjective();
    for (const port of sim.airway.ports) {
      port.open = true;
      port.progress = 1;
    }
    world.render(sim, .2, PRELOAD_INPUT, false, false);
  }
  if (sim.area === 'stomach') {
    sim.gastric.stage = 'draining';
    sim.gastric.level = .5;
    world.render(sim, .05, PRELOAD_INPUT, false, false);
  }
  sim.repairing = true;
  sim.repairTarget = sim.nodes[0];
  for (const teammate of sim.players.slice(1)) teammate.repairing = true;
  world.render(sim, .24, PRELOAD_INPUT, false, false);
  world.deaths?.warm(true, { x: start.x, y: 0, z: start.z - 6 });
  world.impacts?.warm(true, { x: start.x, y: 0, z: start.z - 5 });
  world.abilityFx?.warm(true, { x: start.x, y: 1, z: start.z - 4 });
  for (const suit of LOW_MEMORY ? [null] : COOP_SUITS) {
    for (const teammate of sim.players.slice(1)) teammate.suit = suit;
    world.teammateView.update(sim.players, start.id, floorHeight, 0, false);
    warmTextures(world.scene);
    world.syncLights();
    await compileFor(world, world.scene, world.camera, 'scene');
    world.renderer.render(world.scene, world.camera);
  }
  world.deaths?.warm(false);
  world.impacts?.warm(false);
  world.abilityFx?.warm(false);
  world.explosions.clear();
}

export async function prepareMission(world, sim, onProgress = () => {}) {
  const nextTask = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  onProgress(5, 'Setting up the insertion site');
  await nextTask();
  world.setArea(sim.area);
  // Exercise mission-specific hazards and effects without advancing the live simulation.
  const fixture = new Simulation(sim.area, { weaponLoadout: sim.weaponLoadout, bossPractice: !!sim.boss });
  fixture.start();
  world.renderer.setPixelRatio(1);
  world.renderer.setSize(160, 90, false);
  try {
    onProgress(20, 'Preparing pathogens, props, hazards and explosions');
    await nextTask();
    await world.prepareArea(fixture, world.warmTextures);
    onProgress(65, 'Checking primary and secondary weapons');
    for (const slot of ['primary', 'secondary']) {
      world.setWeaponLoadout({ ...sim.weaponLoadout, slot });
      world.carbine.flash.visible = true;
      world.warmTextures(world.weaponScene);
      await compileFor(world, world.weaponScene, world.weaponCamera, 'weapon');
      world.renderer.render(world.weaponScene, world.weaponCamera);
      await nextTask();
    }
    onProgress(90, 'Preparing the first frame at your display resolution');
  } finally {
    world.carbine.flash.visible = false;
    world.setArea(sim.area);
    world.resize(true);
  }
  world.render(sim, 0, PRELOAD_INPUT, false);
  await compileFor(world, world.scene, world.camera, 'scene');
  await compileFor(world, world.weaponScene, world.weaponCamera, 'weapon');
  // Wait for the pre-rendered frame and uploads to actually finish on the GPU.
  const gl = world.renderer.getContext();
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) throw new Error('The graphics context could not finish preparation');
  gl.flush();
  try {
    let result;
    do {
      await nextTask();
      result = gl.clientWaitSync(fence, 0, 0);
      if (result === gl.WAIT_FAILED || gl.isContextLost()) throw new Error('Graphics preparation was interrupted');
    } while (result === gl.TIMEOUT_EXPIRED);
  } finally {
    gl.deleteSync(fence);
  }
  onProgress(100, 'Insertion site ready');
}
