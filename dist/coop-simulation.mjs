import { RULES, Simulation } from './simulation.mjs';
import { magazineCapacity, normalizeWeaponLoadout, weaponStats } from './weapon-mods.mjs';
import { COOP_MIN_PLAYERS, COOP_MAX_PLAYERS, COOP_SUITS, DEFAULT_COOP_SUIT } from './coop-protocol.mjs';

const normalizeSuit = suit => COOP_SUITS.includes(suit) ? suit : DEFAULT_COOP_SUIT;

const RESPAWN_HEALTH = 50;

// State packets carry the build in hand and the names of both carried weapons, not every build.
function snapshotLoadout({ arsenal, ...build }) {
  return { ...build, arsenal: { primary: arsenal.primary, secondary: arsenal.secondary } };
}

class CoopSuit {
  constructor({ id, name, weaponLoadout, suit }, spawn, repairAmount) {
    this.spawn = spawn;
    this.repairAmount = repairAmount;
    this.baseMagazineSize = RULES.magazine;
    this.weaponLoadout = Object.freeze(normalizeWeaponLoadout({ ...weaponLoadout, slot: 'primary' }));
    this.configuredWeapon = weaponStats(this.weaponLoadout);
    this.player = { id, name, suit: normalizeSuit(suit), ammo: this.magazineSize, score: 0, kills: 0 };
    this.resetPose(RULES.health);
  }

  get weapon() {
    return this.configuredWeapon;
  }

  get magazineSize() {
    return magazineCapacity(this.weapon, this.baseMagazineSize);
  }

  get switchProgress() {
    return this.switching > 0 ? 1 - this.switching / this.weapon.switchSeconds : 0;
  }

  get reloadProgress() {
    return this.reloading > 0 ? 1 - this.reloading / this.weapon.reloadSeconds : 0;
  }

  resetPose(health) {
    Object.assign(this.player, this.spawn, { yaw: 0, pitch: 0, health, downed: false, aiming: false });
    this.clearActions();
  }

  clearActions() {
    this.organNextDamage = 0;
    this.repairProgress = 0;
    this.repairing = false;
    this.repairTarget = null;
    this.nearNode = null;
    this.nearTissue = false;
    this.nearGash = false;
    this.nearGastricValve = null;
    this.canRepair = false;
    this.reloading = 0;
    this.reloadHeld = false;
    this.fireCooldown = 0;
    this.switching = 0;
  }
}

export class CoopSimulation extends Simulation {
  constructor(profiles, area = 'artery') {
    super(area);
    if (profiles.length < COOP_MIN_PLAYERS || profiles.length > COOP_MAX_PLAYERS ||
        profiles.some(profile => typeof profile.id !== 'string' || !profile.id) ||
        new Set(profiles.map(profile => profile.id)).size !== profiles.length) {
      throw new Error('Co-op requires two or three distinct players');
    }
    // Keep authored organ routes and timed attacks intact.
    if (area === 'artery') {
      this.missions = this.missions.map(mission => ({
        ...mission,
        cadence: mission.cadence * .82,
        species: mission.species.flatMap((type, index) => index % 3 === 2 ? [type, 'virus'] : [type]),
      }));
    }
    this.eventSequence = 0;
    this.createSquad(profiles);
  }

  createSquad(profiles) {
    this.suits = profiles.map((profile, index) => new CoopSuit(
      profile, { x: this.player.x + (index === 0 ? -2.2 : index === 1 ? 2.2 : 0),
        y: this.player.y, z: this.player.z + (index === 2 ? 2.2 : 0) }, this.repairAmount,
    ));
    this.suitsById = new Map(this.suits.map(suit => [suit.player.id, suit]));
    this.players = this.suits.map(suit => suit.player);
  }

  start(checkpoint = null) {
    super.start(checkpoint);
    this.createSquad(this.suits.map(({ player, weaponLoadout }) => ({
      id: player.id, name: player.name, suit: player.suit, weaponLoadout,
    })));
    // The squad is rebuilt after the shared state is restored; bring each suit back too.
    if (checkpoint) {
      this.restoreSuits(checkpoint.suits);
      this.checkpoint = { ...this.checkpoint, suits: this.captureCheckpoint().suits };
    }
    this.eventSequence = 0;
    this.sequenceEvents();
  }

  setWeaponLoadoutFor(id, loadout) {
    const suit = this.suitsById.get(id);
    if (!suit || (this.phase !== 'ready' && this.phase !== 'intermission')) return false;
    // Armory edits never change which weapon the suit has in hand.
    this.setWeaponLoadout({ ...normalizeWeaponLoadout(loadout), slot: suit.weaponLoadout.slot }, suit);
    if (this.phase === 'ready') suit.player.ammo = suit.magazineSize;
    return true;
  }

  attackPlayer(id) {
    const player = this.suitsById.get(id)?.player;
    return player?.health > 0 ? player : null;
  }

  chooseAttackPlayer(enemy) {
    let closest = null;
    let closestDistance = Infinity;
    for (const player of this.players) {
      if (player.health <= 0) continue;
      const distance = (player.x - enemy.x) ** 2 + (player.z - enemy.z) ** 2;
      if (distance < closestDistance) {
        closest = player;
        closestDistance = distance;
      }
    }
    return closest;
  }

  restoreSuitHealthAfterWave(health) {
    for (const suit of this.suits) {
      if (suit.player.downed) {
        suit.resetPose(RESPAWN_HEALTH);
        this.events.push({ type: 'suit', stage: 'respawn', playerId: suit.player.id });
      } else {
        super.restoreSuitHealthAfterWave(health, suit.player);
      }
    }
  }

  activeSuits() {
    return this.suits;
  }

  moveSuits(dt, inputsById) {
    for (const suit of this.suits) {
      if (suit.player.health <= 0) continue;
      this.movePlayer(dt, inputsById[suit.player.id] ?? {}, suit);
      if (this.organ?.phase === 'active') this.applyOrganHazard(dt, suit);
    }
  }

  actSuits(dt, inputsById) {
    for (const suit of this.suits) this.act(dt, suit, inputsById[suit.player.id] ?? {});
  }

  act(dt, suit, input) {
    const { player } = suit;
    if (player.health <= 0) return;
    const eventStart = this.events.length;
    if (input.deploy) this.deployTurret(suit);
    const repairing = this.updateRepair(dt, input.repair, suit);
    this.updateRifle(dt, input, repairing, suit);
    player.aiming = Boolean(input.aim && !repairing && !suit.reloading);
    for (let index = eventStart; index < this.events.length; index++) {
      const event = this.events[index];
      event.playerId = player.id;
      if (event.type === 'shot') event.origin = { x: player.x, y: player.y, z: player.z };
    }
  }

  updateSuitStatus() {
    for (const suit of this.suits) {
      if (suit.player.health > 0 || suit.player.downed) continue;
      const playerId = suit.player.id;
      if (suit.repairing) this.events.push({ type: 'repairStop', playerId });
      suit.clearActions();
      suit.player.downed = true;
      suit.player.aiming = false;
      this.events.push({ type: 'suit', stage: 'down', playerId });
    }
  }

  suitsDefeated() {
    return this.players.every(player => player.health === 0);
  }

  openExtractionChoice() {
    this.endMission('won');
  }

  step(dt, inputsById = {}) {
    super.step(dt, inputsById);
    this.sequenceEvents();
  }

  sequenceEvents() {
    for (const event of this.events) event.sequence = ++this.eventSequence;
  }

  snapshotFor(id) {
    const suit = this.suitsById.get(id);
    if (!suit) return null;
    const nodes = this.nodes.map(node => ({ ...node }));
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const nodeCopy = node => nodeById.get(node?.id) ?? null;
    const { player, weapon, baseMagazineSize, magazineSize, switching, switchProgress,
      reloading, reloadProgress, repairAmount, repairing, repairProgress, canRepair, nearTissue } = suit;
    const weaponLoadout = snapshotLoadout(suit.weaponLoadout);
    return {
      area: this.area,
      phase: this.phase, clock: this.clock, wave: this.wave, waves: this.waves, remaining: this.remaining,
      intermission: this.intermission, score: this.score, kills: this.kills, tissue: this.tissue,
      checkpoint: this.checkpoint ? { stage: this.checkpoint.stage, wave: this.checkpoint.wave } : null,
      localPlayerId: id,
      player: { ...player },
      players: this.suits.map(member => ({
        ...member.player, weaponLoadout: snapshotLoadout(member.weaponLoadout), repairing: member.repairing, reloadProgress: member.reloadProgress,
      })),
      weaponLoadout, weapon, baseMagazineSize, magazineSize, reloading, reloadProgress, switching, switchProgress,
      repairAmount, repairing, repairProgress, canRepair, nearTissue,
      repairTargetId: suit.repairTarget?.id ?? null, nearGash: suit.nearGash,
      nearGastricValveId: suit.nearGastricValve?.id ?? null,
      nearNode: nodeCopy(suit.nearNode), nearNodeId: suit.nearNode?.id ?? null,
      objective: nodeCopy(this.objective), objectiveId: this.objective.id,
      failedNode: nodeCopy(this.failedNode), failedNodeId: this.failedNode?.id ?? null,
      turret: this.turret ? { ...this.turret } : null,
      turretPlacement: player.downed ? null : this.turretPlacementFor(player),
      turretCharges: this.turretCharges, canRedeployTurret: this.canRedeployTurret,
      nodes,
      enemies: this.enemies.map(enemy => ({ ...enemy, node: nodeCopy(enemy.node) })),
      projectiles: this.projectiles.map(({ owner, ...projectile }) => ({ ...projectile, ownerId: owner.id })),
      pickups: this.pickups.map(pickup => ({ ...pickup })),
      events: this.events,
      tutorial: null, settling: this.settling,
      valve: this.valve, boss: this.boss, airway: this.airway, gastric: this.gastric,
      organ: this.organ, organWave: this.organWave, outro: this.outro,
      gash: this.gash, reinforcement: this.reinforcement, junctionWave: this.junctionWave,
      junctionSupply: this.junctionSupply, junctionSupplyLocked: this.junctionSupplyLocked,
      junctionForecast: this.junctionForecast, junctionSurge: this.junctionSurge,
    };
  }
}
