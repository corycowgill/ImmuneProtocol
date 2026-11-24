import * as THREE from './vendor/three.module.js';
import { createArsenalView, weaponModelsReady, prepareWeaponCosmetics } from './arsenal-models.mjs';
import { COOP_SUITS, loadSuitModels } from './suits.mjs';
import { ExplosionFX } from './explosions.mjs';
import { DeathFX } from './death-fx.mjs';
import { PostFX } from './post-fx.mjs';
import { ImpactFX } from './impact-fx.mjs';
import { paintGround, patchGround, patchShell } from './ground-fx.mjs';
import { createRepairTool } from './repair-tool.mjs';
import { createHeartValve } from './heart-valve.mjs';
import { createTerrainView } from './terrain-view.mjs';
import { terrainFor, terrainFootprints } from './terrain.mjs';
import { AbilityFX } from './ability-fx.mjs';
import { createTurret } from './turret.mjs';
import { createGuardCarapace, createOrganEnvironment, organProfile } from './organ-world.mjs';
import { createMegaVirus } from './mega-virus.mjs';
import { bioSurface, createLevelProps } from './level-props.mjs';
import { ORGAN_MISSIONS } from './organs.mjs';
import { RENDERED_PREVIEWS } from './level-hud.mjs';
import { createSquadView } from './squad-view.mjs';
import { COOP_MAX_PLAYERS } from './coop-protocol.mjs';
import { DEFAULT_WEAPON_LOADOUT, WEAPON_ORDER, WEAPON_SLOTS, loadoutWithWeapon } from './weapon-mods.mjs';
import { Simulation, arenaObstacles, JUNCTION_GASH_SITES, JUNCTION_INLETS, OBJECTIVE, SPECIES, TISSUE_NODES } from './simulation.mjs';
import { ENEMY_MODELS, animatePathogen, loadEnemyModels, pathogenMotion, setPathogenRim } from './enemy-models.mjs';

// The pathogen rim light per arena: a colour that contrasts with the arena's dominant hue.
const PATHOGEN_RIMS = {
  artery: [0xb8d8f0, .42], junction: [0xb8d8f0, .4], heart: [0xb8d4f0, .4], lungs: [0xfff0e0, .25], stomach: [0xb0e0f0, .35],
  intestines: [0xb8e0f0, .38], colon: [0xc0e0f0, .35], lymph: [0xffe0b8, .3], ear: [0xffdcc0, .3], brain: [0xd8f8c0, .32],
};
import { RenderScale } from './render-scale.mjs';
import { LOW_MEMORY, loadTexture } from './asset-loading.mjs';
import { ARENA_GROWTH } from './arena-scale.mjs';
import { NEST } from './field-objectives.mjs';
import { BOSS_FLOATS, LEVEL_BOSSES } from './level-bosses.mjs';
import { chunkInstances, cullDecor } from './decor-chunks.mjs';
import { randomSource, configureTile, glowTexture, cloudTexture, fallbackTissue, normalFromImage, membraneMaps, reflectionTexture } from './arena-textures.mjs';
import { TAU, UP, floorHeight, baseFloorHeight, setTerrainArea, shapeFloor, texturedLobe, redCellGeometry, sprite, setInstance, addMesh, makeRoom, makeAtmosphere, makeTissue, makeJunctionField, biologicalMaterial } from './arena-scene.mjs';
import { prepareAll as prepareAllOf, prepareScenes as prepareScenesOf, capturePreview as capturePreviewOf, prepareArea as prepareAreaOf, prepareMission as prepareMissionOf } from './world-preparation.mjs';
import { enemyTemplate as enemyTemplateOf, dressGuardModel as dressGuardModelOf, updateEnemies as updateEnemiesOf, releaseEnemyView as releaseEnemyViewOf, poseEnemyAttack as poseEnemyAttackOf, updateTethers as updateTethersOf, updateProjectiles as updateProjectilesOf } from './pathogen-views.mjs';
import { TracerPool } from './shot-fx.mjs';
import { updateWeapon as updateWeaponOf, updateRepairTool as updateRepairToolOf, addShot as addShotOf, addTracer as addTracerOf, addTeammateShot as addTeammateShotOf, addTurretShot as addTurretShotOf } from './weapon-view.mjs';

// Every lit pixel walks all of the arena's point lights, and most of them are out of range of
// it or switched off (muzzle flash, explosion pool, indicators). Their contribution is exactly
// zero, so skipping the reflectance maths for them changes no pixel and saves most of the loop.
if (!THREE.ShaderChunk.lights_fragment_begin.includes('directLight.visible ) RE_Direct')) {
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin
    .replaceAll('RE_Direct( directLight,', 'if ( directLight.visible ) RE_Direct( directLight,');
}

const MAX_PARTICLES = 288;
const SPECIES_COLORS = {
  virus: 0xff6d4a, bacillus: 0xffd078, spore: 0xf384ff, colony: 0xa8e07a, guard: 0x6fd8cf, splitter: 0xc96bdc,
  phage: 0xb98cff, flagellate: 0xa678ff, blister: 0xff7a5c, filovirus: 0xff5a46, amoeba: 0xb7b2ff, rogue: 0xff6650,
  'rogue-bot': 0xff4838, crawler: 0xff5a30,
};
const HEALTHY = new THREE.Color(0xffc6ad);
const HEALTHY_FLANK = new THREE.Color(0xf1c1d5);
const INJURED = new THREE.Color(0xff795d);
const REPAIR_LIGHT = new THREE.Color(0x9bf4c4);

export class World {
  constructor(canvas, area = 'artery') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW_MEMORY, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x230f11);
    this.scene.fog = new THREE.FogExp2(0x462524, .036);
    this.scene.environment = reflectionTexture();
    this.scene.environmentIntensity = .51;

    this.camera = new THREE.PerspectiveCamera(61, 1, .063, 240);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.7, 18);
    this.clock = 0;
    this.random = randomSource(880129);
    this.transform = new THREE.Object3D();
    this.tempPosition = new THREE.Vector3();
    this.palette = new THREE.Color();
    this.glow = glowTexture();
    this.enemyViews = new Map();
    this.enemyPool = new Map();
    this.projectileViews = new Map();
    this.teammateView = createSquadView(this.glow);
    this.teammateMuzzle = new THREE.Vector3();
    this.scene.add(this.teammateView.root);
    this.particles = [];
    this.lastEvents = null;

    const ambient = new THREE.HemisphereLight(0xf6d4ba, 0x5c3c4e, .93);
    this.scene.add(ambient);
    const backlight = new THREE.DirectionalLight(0xffbd9e, 1.4);
    backlight.position.set(-12, 10, -16);
    this.scene.add(backlight);
    const fill = new THREE.DirectionalLight(0xb3c9e3, .77);
    fill.position.set(4, 4, 16);
    this.scene.add(fill);
    const warm = new THREE.PointLight(0xff8969, 72, 24, 2);
    warm.position.set(-9, 3.2, 9);
    this.scene.add(warm);
    const side = new THREE.PointLight(0xff7561, 53, 24, 2);
    side.position.set(11, 4.6, -11);
    this.scene.add(side);
    // The muzzle flash lights the tissue around the suit.
    this.shotLight = new THREE.PointLight(0xffc48a, 0, 15, 2);
    this.scene.add(this.shotLight);
    this.explosions = new ExplosionFX(this.scene, { floorHeight, burst: (...args) => this.burst(...args) });
    this.deaths = new DeathFX(this);
    this.impacts = new ImpactFX(this);
    // The HDR finishing pipeline (bloom, mist, grade); High quality only.
    this.post = LOW_MEMORY ? null : new PostFX(this.renderer);

    this.weaponScene = new THREE.Scene();
    this.weaponScene.environment = this.scene.environment;
    this.weaponScene.environmentIntensity = .83;
    this.weaponCamera = new THREE.PerspectiveCamera(55, 1, .026, 5);
    // The arsenal view holds the gloves and all five weapons; only the equipped one is visible.
    this.carbine = createArsenalView();
    this.weaponScene.add(this.carbine.model);
    this.repairTool = createRepairTool(this.carbine.supportHand);
    this.weaponScene.add(this.repairTool.model);
    this.carbine.model.traverse(part => {
      if (part.isMesh && !part.material.transparent && !part.material.isMeshBasicMaterial) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
    });
    this.weaponAmbient = new THREE.HemisphereLight(0xf9ded4, 0x66313b, 1.16);
    this.weaponScene.add(this.weaponAmbient);
    this.weaponKey = new THREE.DirectionalLight(0xffcfb4, 1.72);
    this.weaponKey.castShadow = true;
    this.weaponKey.target.position.set(.13, -.2, -.82);
    this.weaponKey.shadow.mapSize.set(1024, 1024);
    this.weaponKey.shadow.camera = new THREE.OrthographicCamera(-.87, .87, .87, -.87, .05, 5);
    this.weaponKey.shadow.bias = -.00025;
    this.weaponKey.shadow.normalBias = .003;
    this.weaponRim = new THREE.DirectionalLight(0xaed5db, 1.04);
    this.weaponRim.position.set(.7, .8, -.6);
    const weaponBounce = this.weaponBounce = new THREE.DirectionalLight(0xffd8c7, 1.24);
    weaponBounce.position.set(-.95, .28, .8);
    this.weaponFlash = new THREE.PointLight(0xffc776, 0, 2.3, 2);
    this.weaponScene.add(this.weaponKey, this.weaponKey.target, this.weaponRim, weaponBounce, this.weaponFlash);
    this.weaponPose = {
      sim: null, stride: 0, movement: 0, aim: 0, recoil: 0, flash: 0, lowered: 0,
      swayX: 0, swayY: 0, swap: 0,
    };
    this.weaponLightRotation = new THREE.Quaternion();
    this.weaponSight = this.carbine.sight.getWorldPosition(new THREE.Vector3());
    this.magazineRest = this.carbine.magazine.position.clone();
    this.magazineHandPosition = new THREE.Vector3();
    this.supportRest = this.carbine.supportHand.position.clone();

    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const tile = configureTile(fallbackTissue(), anisotropy, true);
    const normal = normalFromImage(tile.image, anisotropy);
    this.room = makeRoom(this.scene, tile, normal, this.glow, this.random);
    this.areaLights = { ambient, backlight, fill, warm, side };
    this.atmosphere = makeAtmosphere(this.scene, this.glow, this.random);
    this.organEnvironments = new Map();
    this.levelProps = new Map();
    this.baseShellMaterials = [this.room.floor.material, this.room.wall.material, this.room.canopy.material];
    // The bloodstream arenas share the base floor; each organ gets its own patched clone below.
    this.surfaceTime = { value: 0 };
    // Close-range ground detail and the second blended tissue; off on Low quality.
    this.groundDetail = { value: LOW_MEMORY ? 0 : 1 };
    this.causticFloors = new Map();
    this.tissueViews = [
      makeTissue(this.scene, this.glow, normal, this.random),
      makeTissue(this.scene, this.glow, normal, randomSource(327113), true),
      makeTissue(this.scene, this.glow, normal, randomSource(551903), true),
    ];
    this.junctionField = makeJunctionField(this.room.junctionDetails, this.tissueViews[0], this.glow);
    this.turretView = createTurret(this.glow);
    this.abilityFx = new AbilityFX(this.scene, this.glow, this.random);
    this.terrainViews = new Map();
    // How the suit's own moves feel through the camera and the weapon (see applyFeel).
    this.feel = { rush: 0, side: 0, forward: 0, dip: 0, dipV: 0, focus: 0, bash: 0, throw: 0 };
    this.scene.add(this.turretView.model);
    this.turretMuzzle = new THREE.Vector3();
    this.leakTime = 0;
    this.toolStream = addMesh(this.scene, new THREE.CylinderGeometry(.014, .005, 1, 9, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xafffd2, transparent: true, opacity: .43, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
    this.toolStream.visible = false;
    this.toolStart = new THREE.Vector3();
    this.toolTarget = new THREE.Vector3();
    this.toolDirection = new THREE.Vector3();
    this.tetherGeometry = new THREE.CylinderGeometry(.016, .027, 1, 7, 1);
    this.tetherMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa05844, emissive: 0x361a0c, emissiveIntensity: .15, roughness: .49,
      clearcoat: .55, clearcoatRoughness: .29,
    });
    this.tetherStart = new THREE.Vector3();
    this.tetherEnd = new THREE.Vector3();
    this.tetherDirection = new THREE.Vector3();
    // Every pathogen is a scanned model; arenas are prepared once they have loaded.
    this.enemyModels = new Map();
    this.enemyModelsReady = loadEnemyModels().then(models => {
      this.enemyModels = models;
      this.dressGuardModel();
    });
    this.sporeDroplet = texturedLobe(1, 18, 12, .11);
    this.sporeTrail = new THREE.SphereGeometry(1, 9, 6);
    this.sporeDropletMaterial = biologicalMaterial(0xca659e, normal, {
      emissive: 0xd8329e, emissiveIntensity: 2.2, clearcoat: .96,
      roughness: .36, clearcoatRoughness: .16,
    });
    this.sporeTrailMaterial = new THREE.MeshBasicMaterial({
      color: 0xe280bd, transparent: true, opacity: .25,
      depthWrite: false,
    });
    this.sporeHaloMaterial = new THREE.SpriteMaterial({
      map: this.glow, color: new THREE.Color(0xff5fbf).multiplyScalar(2.2), transparent: true, opacity: .85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sporeTrailMaterial.color.multiplyScalar(1.8);
    this.sporeTrailMaterial.blending = THREE.AdditiveBlending;
    this.projectileDirection = new THREE.Vector3();
    this.makeHeart = () => {
      const maps = membraneMaps(26701, [238, 181, 170]);
      return createHeartValve(this.scene, maps, redCellGeometry(), randomSource(9468));
    };
    this.textureReady = loadTexture(new URL('./assets/tissue.webp', import.meta.url).href).then(asset => {
      configureTile(asset, anisotropy, true);
      const normalMap = normalFromImage(asset.image, anisotropy);
      for (const material of this.room.surfaces) {
        material.map = asset;
        material.normalMap = normalMap;
      }
      tile.dispose();
    }).catch(() => {
      // The generated tissue stays in use if the photo texture cannot be loaded.
    });

    this.shadowGeometry = new THREE.PlaneGeometry(2, 2);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: this.glow,
      color: 0x070103,
      opacity: .73,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    this.particlePositions = new Float32Array(MAX_PARTICLES * 3);
    this.particleColors = new Float32Array(MAX_PARTICLES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3).setUsage(THREE.DynamicDrawUsage));
    // Each droplet has its own size, shrinking as it fades (see updateParticles).
    this.particleSizes = new Float32Array(MAX_PARTICLES);
    geometry.setAttribute('pSize', new THREE.BufferAttribute(this.particleSizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const particleMaterial = new THREE.PointsMaterial({
      map: this.glow, vertexColors: true, size: .16, opacity: .95,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    particleMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float pSize;\nvoid main() {')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * pSize;');
    };
    particleMaterial.customProgramCacheKey = () => 'sized-particles';
    this.particleCloud = new THREE.Points(geometry, particleMaterial);
    this.particleCloud.frustumCulled = false;
    this.scene.add(this.particleCloud);

    // Tracer streaks for the suit's own fire, a teammate's and the turret's (shot-fx.mjs).
    this.tracers = new TracerPool(this.scene, 96);
    this.shotMaterial = 0xd6ffc4;
    this.teammateShotMaterial = 0xbcefff;
    this.turretShotMaterial = 0xffc27e;
    this.width = this.height = 0;
    this.renderScale = new RenderScale();
    this.lastRender = 0;
    this.lightProxies = new Map();
    this.lightMembers = new Map();
    this.setArea(area);
    this.setQuality(LOW_MEMORY ? 'low' : 'high');
  }

  prepareAll(...args) {
    return prepareAllOf(this, ...args);
  }

  async prepareScenes(...args) {
    return prepareScenesOf(this, ...args);
  }

  // Renders a 480 x 270 Free Mode thumbnail from just behind the insertion point.
  capturePreview(...args) {
    return capturePreviewOf(this, ...args);
  }

  async prepareArea(...args) {
    return prepareAreaOf(this, ...args);
  }

  async prepareMission(...args) {
    return prepareMissionOf(this, ...args);
  }

  setWeaponLoadout(loadout) {
    this.weaponSource = null;
    this.carbine.setLoadout(loadout);
    // Each weapon has its own sight line, magazine and support-hand position.
    this.weaponSight.copy(this.carbine.sight.position);
    this.magazineRest.copy(this.carbine.magazine.position);
    this.supportRest.copy(this.carbine.supportRest);
  }

  setArea(area) {
    this.teammateView.hide();
    this.explosions?.clear();
    this.megaVirus?.update(null, 0, 0, true);
    const junction = area === 'junction';
    const heart = area === 'heart';
    const profile = organProfile(area);
    this.area = heart || junction || profile ? area : 'artery';
    // Raised ground: the shared floor takes this arena's plaque mounds; shelves and ridges are
    // their own meshes. Set before any decor is placed, since placement reads floorHeight.
    if (this.terrainArea !== this.area) {
      this.terrainArea = this.area;
      setTerrainArea(this.area);
      shapeFloor(this.room.floor.geometry);
    }
    const { arteryDetails, junctionDetails, heartDetails, floor, wall, canopy, growths, cilia } = this.room;
    arteryDetails.visible = this.area === 'artery';
    junctionDetails.visible = junction;
    heartDetails.visible = heart;
    growths.visible = !profile;
    cilia.visible = !profile;
    if (heart && !this.heart) this.heart = this.makeHeart();
    if (this.heart) this.heart.group.visible = heart;
    if (profile && !this.organEnvironments.has(area)) {
      const environment = createOrganEnvironment(area, {
        membraneMaps, floorHeight, glow: this.glow, nodes: TISSUE_NODES[area], detail: this.groundDetail,
      });
      environment.shell = this.baseShellMaterials.map((source, index) => {
        const material = source.clone();
        Object.assign(material, environment.maps);
        if (profile.surfaces) Object.assign(material, bioSurface(profile.surfaces[index]));
        material.color.setHex([profile.floor, profile.wall, profile.ceiling][index]);
        material.normalScale.setScalar(index === 0 ? .32 : .53);
        material.roughness = index === 0 ? .83 : .76;
        material.clearcoat = index === 0 ? .29 : .37;
        if (index === 0) return this.dressGround(material, area);
        const sheenTint = new THREE.Color(profile.back ?? profile.accent).lerp(new THREE.Color(0xffffff), .5);
        return patchShell(material, { area, kind: index === 1 ? 'wall' : 'canopy', detail: this.groundDetail, sheenTint, sheenStrength: index === 1 ? .2 : .15 });
      });
      this.organEnvironments.set(area, environment);
    }
    if (area === 'brain' && !this.megaVirus) {
      this.megaVirus = createMegaVirus(membraneMaps, this.glow);
      this.scene.add(this.megaVirus.root);
    }
    if (!this.levelProps.has(this.area)) {
      const props = createLevelProps(this.area, {
        glow: this.glow, floorHeight, nodes: TISSUE_NODES[this.area], obstacles: arenaObstacles(this.area),
        keepOff: terrainFootprints(terrainFor(this.area)),
      });
      props.setQuality(this.quality !== 'low');
      this.levelProps.set(this.area, props);
    }
    this.props?.root.removeFromParent();
    this.props = this.levelProps.get(this.area);
    this.scene.add(this.props.root);
    this.organEnvironment?.root.removeFromParent();
    this.organEnvironment = this.organEnvironments.get(this.area);
    if (this.organEnvironment) this.scene.add(this.organEnvironment.root);
    [floor.material, wall.material, canopy.material] = this.organEnvironment?.shell ?? this.baseShellMaterials;
    if (!this.organEnvironment) {
      // Artery, junction and heart share the base shell's look, each with its own ground, vessels and caustics.
      if (!this.causticFloors.has(this.area)) {
        const [baseFloor, baseWall, baseCanopy] = this.baseShellMaterials;
        this.causticFloors.set(this.area, [
          this.dressGround(baseFloor.clone(), this.area),
          patchShell(baseWall.clone(), { area: this.area, kind: 'wall', detail: this.groundDetail, sheenStrength: .2 }),
          patchShell(baseCanopy.clone(), { area: this.area, kind: 'canopy', detail: this.groundDetail, sheenStrength: .15 }),
        ]);
      }
      [floor.material, wall.material, canopy.material] = this.causticFloors.get(this.area);
    }
    // Shelves and ridges wear this arena's floor, so they are built once its material is chosen.
    this.terrainView?.removeFromParent();
    this.terrainView = this.terrainViews.get(this.area) ??
      createTerrainView(terrainFor(this.area), baseFloorHeight, this.area, floor.material);
    this.terrainViews.set(this.area, this.terrainView);
    this.scene.add(this.terrainView);
    canopy.scale.y = heart ? .54 : junction ? .63 : profile ? .85 : 1;
    this.scene.background.setHex(profile?.background ?? (heart ? 0x26181f : junction ? 0x1d1115 : 0x230f11));
    this.scene.fog.color.setHex(profile?.fog ?? (heart ? 0x3c2228 : junction ? 0x332528 : 0x3a2228));
    // Larger arenas need thinner haze so the far side of the chamber still reads.
    this.scene.fog.density = (profile?.density ?? (heart ? .024 : junction ? .029 : .030)) * .64;

    const { ambient, backlight, fill, warm, side } = this.areaLights;
    ambient.color.setHex(profile?.back ?? 0xf6d4ba);
    ambient.groundColor.setHex(profile?.low ?? 0x6e4a5c);
    // The bloodstream arenas get a strong cool fill so shadows separate from the red key light.
    fill.color.setHex(profile?.key ?? 0x8fb8e8);
    fill.intensity = profile ? .77 : 1.05;
    backlight.color.setHex(profile?.back ?? (heart ? 0xeab5b9 : junction ? 0xd2a79e : 0xffbd9e));
    backlight.intensity = heart ? .89 : junction ? 1.13 : 1.4;
    warm.color.setHex(profile?.accent ?? 0xff8969);
    warm.intensity = profile ? 93 : heart ? 47 : junction ? 42 : 72;
    side.visible = !junction && !heart;
    side.color.setHex(profile?.key ?? 0xff7561);
    const { cells, motes, clouds } = this.atmosphere;
    cells.visible = !profile;
    motes.material.color.setHex(profile?.atmosphere ?? 0xffffff);
    clouds.forEach(({ cloud }, index) => cloud.material.color.setHex(profile?.atmosphere ?? (index > 4 ? 0xb77266 : 0xfac597)));
    this.deaths?.clear();
    this.post?.setArea(this.area);
    setPathogenRim(...(PATHOGEN_RIMS[this.area] ?? PATHOGEN_RIMS.artery));
    // The weapon picks up the arena: sky from its mist, ground and bounce from its fog and floor,
    // so the gun sits in the world instead of in a neutral studio.
    const mist = new THREE.Color().setRGB(...(this.post?.look.mist ?? [.62, .3, .28]));
    this.weaponAmbient.color.setHex(0xf9ded4).lerp(mist, .4);
    this.weaponAmbient.groundColor.copy(this.scene.fog.color).multiplyScalar(1.6);
    this.weaponBounce.color.copy(this.scene.fog.color).lerp(new THREE.Color(0xffd8c7), .45);
    this.weaponBounce.intensity = 1.5;
    this.obstacles = arenaObstacles(this.area);
    this.impacts?.setArea(this.area);
    this.updateEnemies([], 0);
    this.updateProjectiles([], false);
    this.tracers.clear();
    this.particles.length = 0;
    this.shotLight.intensity = 0;
    this.lastEvents = null;
    this.clock = 0;
    this.leakTime = 0;
    for (const branch of ['left', 'right']) {
      const { wound, tear, sheen } = this.junctionField.gashes[branch];
      this.junctionField.gashes[branch].opening = 0;
      wound.reshape(0);
      tear.visible = false;
      sheen.visible = false;
      this.junctionField.supports[branch].support.visible = false;
    }
    this.nodes = TISSUE_NODES[this.area];
    for (let i = 0; i < this.tissueViews.length; i++) {
      const view = this.tissueViews[i];
      const node = this.nodes[i];
      view.root.visible = !!node;
      if (!node) continue;
      view.root.position.set(node.x, node.y + floorHeight(node.x, node.z), node.z);
      view.root.rotation.y = junction ? (i === 0 ? .31 : -.31) : [0, -.49, .62][i];
      view.opening = 0;
      view.wound.reshape(0);
      view.channel.visible = false;
    }
    this.toolStream.visible = false;
    this.turretView.reset();
    this.abilityFx.reset();
    Object.assign(this.feel, { rush: 0, side: 0, forward: 0, dip: 0, dipV: 0, focus: 0, bash: 0, throw: 0 });
    this.camera.fov = 61;
    this.camera.updateProjectionMatrix();
    this.syncLights();
  }

  // Shaders are compiled for an exact number of lights. A light that drops out of the scene
  // because its owner is hidden (a tissue node during training, a closed valve, a stowed turret)
  // would force every material to recompile mid-mission, freezing the game for seconds. So each
  // light is drawn through a stand-in that stays in the scene and merely goes dark. A light joins
  // an arena's set the first time it is seen lit there, which the loading screen's rehearsal
  // triggers, so lights that belong to other arenas add no cost.
  syncLights() {
    let members = this.lightMembers.get(this.area);
    if (!members) this.lightMembers.set(this.area, members = new Set());
    const found = [];
    this.scene.traverse(object => {
      if (object.isPointLight && !object.userData.standIn && !this.lightProxies.has(object)) found.push(object);
    });
    for (const light of found) {
      const proxy = new THREE.PointLight();
      proxy.userData.standIn = true;
      light.layers.disableAll(); // The renderer skips the original; game code keeps driving it.
      this.lightProxies.set(light, proxy);
      this.scene.add(proxy);
    }
    for (const [light, proxy] of this.lightProxies) {
      let shown = light.visible;
      let node = light.parent;
      while (node && node !== this.scene) {
        shown &&= node.visible;
        node = node.parent;
      }
      // Lights of another arena leave with it; that only happens behind a loading screen.
      const attached = node === this.scene;
      if (attached && shown) members.add(light);
      proxy.visible = attached && members.has(light);
      if (!proxy.visible) continue;
      proxy.intensity = shown ? light.intensity : 0;
      proxy.color.copy(light.color);
      proxy.distance = light.distance;
      proxy.decay = light.decay;
      light.getWorldPosition(proxy.position);
    }
  }

  // Gives an arena's floor its unique painted ground, blended tissue, wetness and caustics.
  dressGround(material, area) {
    const maps = paintGround(area, { nodes: TISSUE_NODES[area] ?? [], obstacles: arenaObstacles(area), size: LOW_MEMORY ? 1024 : 2048 });
    if (maps) for (const texture of [maps.macro, maps.mask]) texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return patchGround(material, { time: this.surfaceTime, area, maps, detail: this.groundDetail });
  }

  // Player options from the settings menu (game-settings.mjs).
  applyOptions(options) {
    if (!options) return;
    this.renderer.toneMappingExposure = 1.14 * options.brightness;
    this.fieldOfView = options['field-of-view'];
    const fixed = options['resolution-scale'] === 'auto' ? null : Number(options['resolution-scale']);
    if (fixed !== this.fixedScale) {
      this.fixedScale = fixed;
      this.renderScale.enabled = fixed == null;
      this.renderScale.reset();
      this.resize(true);
    }
    this.explosions.shakeScale = options['camera-shake'];
    if (this.post) this.post.options = {
      bloom: options.bloom, ao: options['ambient-occlusion'], vignette: options.vignette,
      grain: options['film-grain'], aberration: options['chromatic-aberration'],
    };
  }

  // Reads this suit's dash, jump, landing, dodge, bash and throw events once per simulation step
  // and eases the camera and weapon responses: lean, FOV punch, landing dip, dodge focus.
  applyFeel(sim, dt, reduceMotion) {
    const feel = this.feel;
    const id = sim.player.id;
    if (sim.events !== this.feelEvents) {
      this.feelEvents = sim.events;
      for (const event of sim.events) {
        if (event.playerId != null && event.playerId !== id) continue;
        if (event.type === 'dash') Object.assign(feel, { rush: 1, side: event.side, forward: event.forward });
        if (event.type === 'jump') feel.dipV -= .35;
        if (event.type === 'land') feel.dipV -= Math.min(2.6, .35 + event.speed * .3);
        if (event.type === 'dodge') feel.focus = 1;
        if (event.type === 'melee') {
          feel.bash = 1;
          if (event.hits && !reduceMotion) this.explosions.shake = Math.min(1, this.explosions.shake + .2);
        }
        if (event.type === 'throw' && event.stage === 'release') feel.throw = 1;
      }
    }
    feel.rush = Math.max(0, feel.rush - dt * 4.2);
    feel.focus = Math.max(0, feel.focus - dt * 1.5);
    feel.bash = Math.max(0, feel.bash - dt / .42);
    feel.throw = Math.max(0, feel.throw - dt / .5);
    // The landing dip is a stiff spring back to eye height.
    const step = Math.min(dt, .05);
    feel.dipV += (-feel.dip * 110 - feel.dipV * 15) * step;
    feel.dip = reduceMotion ? 0 : THREE.MathUtils.clamp(feel.dip + feel.dipV * step, -.32, .1);
    if (this.post) {
      this.post.rush = feel.rush;
      this.post.focus = reduceMotion ? feel.focus * .4 : feel.focus;
    }
    return feel;
  }

  setQuality(quality) {
    const low = quality === 'low';
    const next = low ? 'low' : 'high';
    if (next === this.quality) return;
    this.quality = next;
    this.renderer.shadowMap.enabled = !low;
    if (this.groundDetail) this.groundDetail.value = low ? 0 : 1;
    this.weaponKey.castShadow = !low;
    this.weaponKey.shadow.needsUpdate = !low;
    const { growths, cilia } = this.room;
    growths.setFraction(low ? 330 / growths.total : 1);
    cilia.setFraction(low ? 170 / cilia.total : 1);
    const { cells, cellPath, motes, clouds } = this.atmosphere;
    cells.count = low ? 35 : cellPath.length;
    motes.geometry.setDrawRange(0, low ? 280 : motes.geometry.attributes.position.count);
    clouds.forEach(({ cloud }, index) => { cloud.visible = !low || index % 3 === 2; });
    for (const props of this.levelProps.values()) props.setQuality(!low);
    this.resize(true);
  }

  resize(force = false) {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const low = this.quality === 'low';
    const pixelRatio = Math.min(window.devicePixelRatio || 1, low ? .87 : 1.45,
      Math.sqrt((low ? 950000 : 2300000) / (width * height))) * (this.fixedScale ?? this.renderScale.scale);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = width / height;
    this.weaponCamera.updateProjectionMatrix();
  }

  project(x, y, z) {
    const ndc = this.tempPosition.set(x, y, z).project(this.camera);
    return { x: (ndc.x * .5 + .5) * this.width, y: (.5 - ndc.y * .5) * this.height,
      visible: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z > -1 && ndc.z < 1 };
  }

  updateAtmosphere(dt) {
    this.clock += dt;
    const { cells, cellPath, motes, clouds } = this.atmosphere;
    for (let i = 0; i < cells.count; i++) {
      const { x, y, z, radius, phase, spin } = cellPath[i];
      const angle = phase + this.clock * .47;
      this.tempPosition.set(x + Math.sin(angle) * .86, y + Math.sin(angle * .61) * .58, z + Math.cos(angle * .72) * .79);
      this.transform.rotation.set(phase + this.clock * spin, phase * 1.7, phase * .3 + this.clock * spin * .58);
      setInstance(cells, i, this.transform, this.tempPosition, [radius, radius, radius * (1 + Math.sin(phase) * .14)]);
    }
    cells.instanceMatrix.needsUpdate = true;
    motes.position.x = Math.sin(this.clock * .15) * .43;
    motes.position.y = Math.sin(this.clock * .22) * .28;
    for (let i = 0; i < clouds.length; i++) {
      const { cloud, x, y, z } = clouds[i];
      if (!cloud.visible) continue;
      cloud.position.set(x + Math.sin(this.clock * .14 + i) * .94, y + Math.sin(this.clock * .09 + i) * .38, z);
    }
  }

  updateTissue(sim, dt, reduceMotion) {
    for (let i = 0; i < sim.nodes.length; i++) {
      const node = sim.nodes[i];
      const view = this.tissueViews[i];
      const state = THREE.MathUtils.clamp(node.health / 100, 0, 1);
      const { organ, core, fiber, glowOrb, light, channel, wound } = view;
      view.root.visible = !sim.airway && (!sim.tutorial || i === 0);
      const healing = sim.repairing && sim.repairTarget === node;
      const residualDamage = Math.max(0, 100 - node.health - (healing ? sim.repairProgress * 10 : 0));
      const target = Math.min(1, Math.sqrt(residualDamage / 43));
      const open = THREE.MathUtils.damp(view.opening, target, healing ? 11 : 8, dt);
      view.opening = open < .004 && target === 0 ? 0 : open;
      wound.reshape(view.opening);
      channel.visible = view.opening > .004;
      this.palette.copy(INJURED).lerp(i === 0 ? HEALTHY : HEALTHY_FLANK, state);
      if (healing) this.palette.lerp(REPAIR_LIGHT, .42);
      light.color.copy(this.palette);
      light.intensity = 5.2 + state * 1.1 + (healing ? 2.2 : 0);
      glowOrb.material.color.copy(healing ? REPAIR_LIGHT : this.palette);
      glowOrb.material.opacity = healing ? .10 : node.underAttack ? .049 : .017;
      const beat = reduceMotion ? 0 : Math.max(0, Math.sin(this.clock * 3.7 + i * .73)) ** 3;
      organ.scale.set(1 + beat * .027, 1 + beat * .044, 1 + beat * .026);
      core.material.emissive.copy(this.palette);
      core.material.emissiveIntensity = .025 + beat * .015 + (healing ? .04 : 0);
      fiber.emissive.copy(this.palette);
      fiber.emissiveIntensity = .033 + beat * .022 + (healing ? .13 : 0);
    }
  }

  updateJunctionField(sim, dt, reduceMotion) {
    const { gashes, supports, meshWire } = this.junctionField;
    const { gash, reinforcement } = sim;
    const sealing = gash && sim.repairTarget === gash;
    for (const branch of ['left', 'right']) {
      const site = gashes[branch];
      const torn = gash?.branch === branch;
      const remaining = torn ? gash.sealRemaining - (sealing ? sim.repairProgress * sim.repairAmount * .75 : 0) : 0;
      const target = torn ? Math.max(.10, remaining / gash.sealRequired) : 0;
      const open = THREE.MathUtils.damp(site.opening, target, torn && !sealing ? 13 : 10, dt);
      site.opening = !torn && open < .012 ? 0 : open;
      site.wound.reshape(site.opening);
      site.tear.visible = site.opening > 0;
      site.sheen.visible = site.tear.visible;
      if (site.sheen.visible) {
        site.sheen.material.color.setHex(sealing && torn ? 0x7af0ac : 0xff5d30);
        site.sheen.material.opacity = site.opening * (sealing && torn ? .16 : .11);
      }

      const { support, edge } = supports[branch];
      support.visible = reinforcement?.branch === branch;
      if (support.visible) {
        const strength = Math.min(1, reinforcement.remaining / 2.1);
        edge.material.opacity = .10 + strength * .24;
        meshWire.emissiveIntensity = .18 + strength * .72;
      }
    }
    this.leakTime -= dt;
    if (gash && !reduceMotion && this.leakTime <= 0) {
      const low = this.quality === 'low';
      this.leakTime = low ? .36 : .20;
      this.burst(gash.x, gash.y + .04, gash.z + .43, 0xe04b31, low ? 1 : 3, .85);
    }
  }

  // The species' scanned model. If one failed to download, a plain membrane sphere keeps the
  // pathogen visible and shootable.
  enemyTemplate(...args) {
    return enemyTemplateOf(this, ...args);
  }

  // The Shellback's armored front is a gameplay tell, so the scanned capsid wears
  // the procedural carapace on the side that blocks shots.
  dressGuardModel(...args) {
    return dressGuardModelOf(this, ...args);
  }

  updateEnemies(...args) {
    return updateEnemiesOf(this, ...args);
  }

  releaseEnemyView(...args) {
    return releaseEnemyViewOf(this, ...args);
  }

  poseEnemyAttack(...args) {
    return poseEnemyAttackOf(this, ...args);
  }

  updateTethers(...args) {
    return updateTethersOf(this, ...args);
  }

  updateProjectiles(...args) {
    return updateProjectilesOf(this, ...args);
  }

  // Antibody caches: a bright teal mote with a halo, bobbing where a suit can walk into it.
  updatePickups(pickups, reduceMotion) {
    this.pickupViews ??= Array.from({ length: 3 }, () => {
      const group = new THREE.Group();
      const core = sprite(this.glow, 0x2fe0b0, 1.3, .8);
      const halo = sprite(this.glow, 0x1c9f84, 4.6, .34);
      group.add(halo, core);
      group.visible = false;
      this.scene.add(group);
      return { group, core, halo };
    });
    this.pickupViews.forEach((view, index) => {
      const pickup = pickups[index];
      view.group.visible = !!pickup;
      if (!pickup) return;
      const bob = reduceMotion ? 0 : Math.sin(this.clock * 2.3 + index) * .22;
      // A cache about to drift away flickers.
      const fading = pickup.remaining < 8 && !reduceMotion ? .55 + .45 * Math.sin(this.clock * 11) : 1;
      view.group.position.set(pickup.x, floorHeight(pickup.x, pickup.z) + pickup.y + bob, pickup.z);
      view.core.material.opacity = .8 * fading;
      view.halo.material.opacity = (.3 + (reduceMotion ? 0 : Math.sin(this.clock * 3.1) * .08)) * fading;
    });
  }

  burst(x, y, z, color, count, spread) {
    this.palette.set(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const speed = (.25 + this.random() * .9) * spread;
      const angle = this.random() * TAU;
      const life = .14 + this.random() * .37;
      this.particles.push({
        x, y, z,
        vx: Math.cos(angle) * speed,
        vy: (.25 + this.random() * .66) * speed,
        vz: Math.sin(angle) * speed,
        r: this.palette.r, g: this.palette.g, b: this.palette.b, life, remaining: life,
        // A few large soft droplets among many fine ones; all start bright enough to bloom.
        size: this.random() < .18 ? 1.5 + this.random() * .9 : .45 + this.random() * .7,
      });
    }
  }

  updateParticles(dt) {
    let count = 0;
    for (const particle of this.particles) {
      particle.remaining -= dt;
      if (particle.remaining <= 0) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vy -= 2.4 * dt;
      // Fluid drag: the spray bursts out fast and hangs before it falls.
      const drag = Math.exp(-dt * 3.2);
      particle.vx *= drag; particle.vz *= drag;
      const index = count * 3;
      const fade = particle.remaining / particle.life;
      this.particleSizes[count] = particle.size * (.35 + .65 * fade);
      this.particlePositions[index] = particle.x;
      this.particlePositions[index + 1] = particle.y;
      this.particlePositions[index + 2] = particle.z;
      const glow = fade * (1 + fade * .9);
      this.particleColors[index] = particle.r * glow;
      this.particleColors[index + 1] = particle.g * glow;
      this.particleColors[index + 2] = particle.b * glow;
      this.particles[count++] = particle;
    }
    this.particles.length = count;
    const geometry = this.particleCloud.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.pSize.needsUpdate = true;
    geometry.setDrawRange(0, count);
  }

  updateWeapon(...args) {
    return updateWeaponOf(this, ...args);
  }

  updateRepairTool(...args) {
    return updateRepairToolOf(this, ...args);
  }

  addShot(...args) {
    return addShotOf(this, ...args);
  }

  addTracer(...args) {
    return addTracerOf(this, ...args);
  }

  addTeammateShot(...args) {
    return addTeammateShotOf(this, ...args);
  }

  addTurretShot(...args) {
    return addTurretShotOf(this, ...args);
  }

  processEvents(events, dt, reduceMotion, flashStrength, playerId) {
    if (events !== this.lastEvents) {
      this.lastEvents = events;
      for (const event of events) {
        if (event.type === 'shot') {
          if (event.playerId == null || event.playerId === playerId) this.addShot(event, flashStrength, reduceMotion);
          else this.addTeammateShot(event, reduceMotion);
        }
        if (event.type === 'explosion') {
          this.explosions.explode(event.x, event.y, event.z, event.radius, reduceMotion);
          this.impacts.blast(new THREE.Vector3(event.x, event.y, event.z), event.radius);
        }
        if (['stun', 'explosion', 'melee', 'throw'].includes(event.type)) this.abilityFx.note(event, reduceMotion);
        if (event.type === 'turret' && event.stage === 'fire') this.addTurretShot(event, reduceMotion);
        if (event.type === 'turret' && (event.stage === 'deployed' || event.stage === 'redeployed') && !reduceMotion) {
          this.burst(event.x, floorHeight(event.x, event.z) + .11, event.z, 0xb78079, 15, 1.2);
        }
        if (event.type === 'hit') {
          // A lethal hit has already handed the pathogen's model to its death animation.
          const view = this.enemyViews.get(event.id) ?? this.deaths.corpses.find(corpse => corpse.id === event.id)?.view;
          if (view) {
            view.hit = 1;
            // Knocked back along the shot, harder by heavier rounds; bosses barely move.
            const push = Math.min(.42, (event.damage ?? 20) / 150) / (view.enemy?.boss || view.enemy?.nest ? 6 : 1);
            const dx = event.x - this.camera.position.x, dz = event.z - this.camera.position.z, length = Math.hypot(dx, dz) || 1;
            (view.knock ??= new THREE.Vector3()).add(this.tempPosition.set(dx / length * push, push * .2, dz / length * push));
          }
          if (Number.isFinite(event.x)) this.impacts.enemyHit(view, event, this.camera.position, event.damage ?? 20, event.crit, reduceMotion);
        }
        if (event.type === 'levelBoss') {
          const ground = floorHeight(event.x, event.z) + .2;
          if (event.stage === 'tremor') this.burst(event.x, ground, event.z, 0xc9a07a, reduceMotion ? 3 : 10, 2.6);
          if (event.stage === 'arrive') this.burst(event.x, event.y, event.z, 0xffb38a, reduceMotion ? 20 : 70, 6);
          if (event.stage === 'ability') this.burst(event.x, event.y, event.z, 0xffd9a0, reduceMotion ? 8 : 26, 4);
          // A defeated boss's convulsions and final blast play out in death-fx.mjs.
        }
        if (event.type === 'nest' && event.stage === 'hatch') this.burst(event.x, event.y + .6, event.z, 0xe07a5a, 14, 2.4);
        if (event.type === 'cache' && event.stage === 'collect') this.burst(event.x, event.y, event.z, 0x8dffd9, 46, 3.6);
        // Pathogens that die out of view (no model was ever posed) still leave a spray.
        if (event.type === 'kill' && !this.deaths.dying(event.id)) this.burst(event.x, event.y, event.z, SPECIES_COLORS[event.enemyType] || 0xff9c60, 40, 4.9);
        if (event.type === 'repair') {
          this.burst(event.x, event.y + .15, event.z, 0x83ffca, event.complete ? 62 : 38, event.complete ? 4.8 : 3.6);
        }
        if (event.type === 'gash' && event.stage === 'open') this.burst(event.x, event.y + .12, event.z + .33, 0xff7555, 22, 2.6);
        // A hit on your own suit jolts the camera.
        if (event.type === 'damage' && event.target === 'player' && (event.playerId == null || event.playerId === playerId) && !reduceMotion) {
          this.explosions.shake = Math.min(1, this.explosions.shake + .22);
        }
        if (event.type === 'damage' && event.target === 'tissue') {
          const attacker = this.enemyViews.get(event.id);
          if (attacker) attacker.strike = .23;
          const anchor = event.branch && this.area === 'junction' && event.anchor === 'gash'
            ? JUNCTION_GASH_SITES[event.branch] : this.nodes.find(node => node.id === event.nodeId) ?? OBJECTIVE;
          this.burst(THREE.MathUtils.lerp(anchor.x, event.x, .58), anchor.y + .03,
            THREE.MathUtils.lerp(anchor.z, event.z, .58), 0xf37337, 14, 2.4);
        }
        if (event.type === 'enemyAttack' && event.enemyType === 'spore') {
          if (event.stage === 'release') this.burst(event.x, event.y, event.z, 0xd279b1, 8, .9);
          if (event.stage === 'impact') this.burst(event.x, event.y, event.z, 0xe39bc8, 12, 1.7);
        }
        if (event.type === 'valve' && event.stage === 'blocked') {
          this.burst(event.x, event.y, event.z + .16, 0xdb806d, 7, 1.7);
        }
        if (event.type === 'guard' && event.stage === 'block') {
          const guard = this.enemyViews.get(event.id);
          if (guard) guard.strike = .23;
          this.burst(event.x, event.y, event.z, 0xfce5a9, 8, 2.0);
        }
        if (event.type === 'boss') {
          if (event.stage === 'block') this.burst(event.x, event.y, event.z, 0xe6dbbd, 7, 1.7);
          if (event.stage === 'hit') this.burst(event.x, event.y, event.z, 0xf8ad58, 11, 2.5);
          if (event.stage === 'spawn') this.burst(event.x, event.y, event.z, 0xc576ba, 24, 3.7);
          if (event.stage === 'defeated') this.burst(event.x, event.y, event.z, 0xfa9686, reduceMotion ? 18 : 85, 7.2);
        }
      }
    }
    this.tracers.update(dt, this.camera);
    this.shotLight.intensity *= Math.exp(-dt * 28);
  }

  render(sim, dt, input, reduceMotion, resizeViewport = true) {
    const now = performance.now();
    const rescaled = resizeViewport && this.renderScale.sample((now - this.lastRender) / 1000);
    this.lastRender = now;
    if (resizeViewport) this.resize(rescaled);
    const { player } = sim;
    const feel = this.applyFeel(sim, dt, reduceMotion);
    this.camera.position.set(player.x, player.y + feel.dip, player.z);
    // A sideways dash leans the view into it.
    this.camera.rotation.set(player.pitch, player.yaw, reduceMotion ? 0 : -feel.side * .085 * Math.sin(Math.min(1, feel.rush) * Math.PI * .5));
    const aiming = input.aim && !sim.reloading && !sim.repairing;
    // Each weapon and optic zooms by its own amount; the Lancet scope zooms furthest.
    // Aim zoom keeps each optic's magnification relative to the chosen field of view.
    const baseFov = this.fieldOfView ?? 61;
    // A dash punches the field of view out and lets it settle back.
    const dashFov = reduceMotion ? 0 : 11 * feel.rush * Math.max(.35, feel.forward + .6);
    const targetFov = (aiming ? (sim.weapon.zoom ?? 48) * baseFov / 61 : baseFov) + dashFov;
    if (Math.abs(targetFov - this.camera.fov) > .04) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * (feel.rush > .5 ? 30 : 12)));
      this.camera.updateProjectionMatrix();
    }
    this.surfaceTime.value = reduceMotion ? 0 : this.clock;
    this.explosions.update(dt, reduceMotion ? null : this.camera);
    this.camera.updateMatrixWorld();
    this.updateAtmosphere(dt);
    this.organEnvironment?.update(sim.organ, this.clock, reduceMotion, sim.gastric, this.camera);
    this.organEnvironment?.updateAirways?.(sim, this.clock, dt, reduceMotion);
    this.organEnvironment?.updateGastric?.(sim, this.clock, dt, reduceMotion);
    this.megaVirus?.update(sim.boss, this.clock, dt, reduceMotion);
    this.props?.update(sim, this.clock, dt, reduceMotion);
    if (sim.valve) this.heart.update(sim.valve, dt, reduceMotion, this.quality === 'low');
    this.updateTissue(sim, dt, reduceMotion);
    if (this.area === 'junction') this.updateJunctionField(sim, dt, reduceMotion);
    this.deaths.note(sim.events, player);
    this.updateEnemies(sim.enemies, dt, reduceMotion);
    this.deaths.update(dt, reduceMotion);
    this.impacts.update(dt);
    this.updateProjectiles(sim.projectiles ?? [], reduceMotion);
    this.updatePickups(sim.pickups ?? [], reduceMotion);
    this.teammateView.update(sim.players, player.id, floorHeight, dt, reduceMotion);
    const { turret } = sim;
    // turret.y is the raised ground it stands on; the floor's own undulation goes on top.
    this.turretView.update(turret, turret ? baseFloorHeight(turret.x, turret.z) : 0, dt, reduceMotion);
    this.abilityFx.update(sim, this.camera, dt, reduceMotion, this.enemyViews);
    this.terrainView?.userData.update?.(sim.clock ?? 0);
    const { weaponLoadout, tutorial } = sim;
    if (weaponLoadout !== this.weaponSource || tutorial !== this.weaponTutorial) {
      this.setWeaponLoadout(tutorial ? {
        ...DEFAULT_WEAPON_LOADOUT, finish: weaponLoadout.finish, accent: weaponLoadout.accent,
      } : weaponLoadout);
      this.weaponSource = weaponLoadout;
      this.weaponTutorial = tutorial;
    }
    this.updateWeapon(sim, dt, input, aiming, reduceMotion);
    this.processEvents(sim.events, dt, reduceMotion, sim.weapon.muzzleFlash, player.id);
    this.updateParticles(dt);
    this.scene.updateMatrixWorld();
    this.syncLights();
    cullDecor(this.camera, this.scene.fog);
    if (this.post && this.quality !== 'low') {
      this.post.render(this.scene, this.camera, this.weaponScene, this.weaponCamera, this.clock, reduceMotion);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      // Give the close-up model its own depth buffer without clearing the artery.
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.weaponScene, this.weaponCamera);
      this.renderer.autoClear = true;
    }
    return this.weaponPose.aim > .94;
  }
}
