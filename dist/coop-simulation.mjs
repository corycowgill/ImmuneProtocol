import { RULES, Simulation } from './simulation.mjs';
import { magazineCapacity, normalizeWeaponLoadout, weaponStats } from './weapon-mods.mjs';
import { snapshotThrowables, throwItems, useMelee } from './abilities.mjs';
import { companionOf, createDrone, snapshotDrone } from './companions.mjs';
import { COOP_MAX_PLAYERS, COOP_SUITS, DEFAULT_COOP_SUIT } from './coop-protocol.mjs';

const normalizeSuit = suit => COOP_SUITS.includes(suit) ? suit : DEFAULT_COOP_SUIT;

const RESPAWN_HEALTH = 50;
// Holding the sealer on a downed teammate brings them back where they fell, at a third of their health.
export const REVIVE = Object.freeze({ seconds: 5, radius: 2.5, health: Math.round(RULES.health / 3) });

// State packets carry the build in hand and the names of both carried weapons, not every build.
// The sealer's cosmetics and the companion ride along so the sealer is painted and teammates know
// which companion each suit brought.
function snapshotLoadout({ arsenal, ...build }) {
  return { ...build, arsenal: { primary: arsenal.primary, secondary: arsenal.secondary, companion: arsenal.companion, sealer: arsenal.sealer } };
}

// What the server's AI keeps on an enemy that no client draws: encounter orders, attack origins and
// timers. The node it targets goes as nodeId, which the client resolves. The compact tactical
// decision stays for the AI debug overlay.
const SERVER_ONLY_ENEMY = ['node', 'encounterOrder', 'attackOrigin', 'perchLift', 'lungeCooldown'];

function snapshotEnemy(enemy) {
  const copy = { ...enemy, nodeId: enemy.node?.id ?? enemy.nodeId ?? null };
  for (const key of SERVER_ONLY_ENEMY) delete copy[key];
  // A Nanonaut's rig is posed from these; the rest of its combat state stays on the server.
  if (enemy.soldier) {
    const { state, stance, aimYaw, aimPitch, dodgeDir } = enemy.soldier;
    copy.soldier = { state, stance, aimYaw, aimPitch, dodgeDir };
  }
  return copy;
}

class CoopSuit {
  constructor({ id, name, weaponLoadout, suit }, spawn, repairAmount) {
    this.spawn = spawn;
    this.repairAmount = repairAmount;
    this.baseMagazineSize = RULES.magazine;
    this.weaponLoadout = Object.freeze(normalizeWeaponLoadout({ ...weaponLoadout, slot: 'primary' }));
    this.configuredWeapon = weaponStats(this.weaponLoadout);
    this.player = { id, name, suit: normalizeSuit(suit), ammo: this.magazineSize, score: 0, kills: 0, linked: true };
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
    this.reviveTarget = null;
    this.player.reviveProgress = 0;
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
  constructor(profiles, area = 'artery', options = {}) {
    super(area, options);
    // A squad forms with two or three, and carries on through the campaign if it shrinks to one.
    if (profiles.length < 1 || profiles.length > COOP_MAX_PLAYERS ||
        profiles.some(profile => typeof profile.id !== 'string' || !profile.id) ||
        new Set(profiles.map(profile => profile.id)).size !== profiles.length) {
      throw new Error('Co-op requires one to three distinct players');
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
    // Every suit brings its own companion: its own turret to place once, or its own medic drone.
    for (const suit of this.suits) {
      suit.companion = companionOf(suit);
      suit.turretCharges = suit.companion === 'turret' ? 1 : 0;
      suit.turret = null;
      suit.drone = createDrone(this, suit);
    }
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
    return player?.health > 0 && player.linked ? player : null;
  }

  chooseAttackPlayer(enemy) {
    let closest = null;
    let closestDistance = Infinity;
    for (const { player } of this.activeSuits()) {
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

  // A suit whose player dropped stands out of the fight: pathogens, hazards, companions and the
  // wave rules ignore it until the player rejoins.
  activeSuits() {
    return this.suits.filter(suit => suit.player.linked);
  }

  squadSuits() {
    return this.suits;
  }

  get turrets() {
    return this.suits.map(suit => suit.turret).filter(Boolean);
  }

  // The match carries on without a dropped player. Their suit keeps its health, ammo and score
  // for when they come back. These happen between steps, so the events are handed back for the
  // room to send rather than added to the step's own list.
  setLinked(id, linked) {
    const suit = this.suitsById.get(id);
    if (!suit || suit.player.linked === linked) return [];
    const events = [];
    if (!linked) {
      if (suit.repairing) events.push(this.squadEvent({ type: 'repairStop', playerId: id }));
      this.releaseSuit(suit);
    }
    suit.player.linked = linked;
    events.push(this.squadEvent({ type: 'suit', stage: linked ? 'rejoined' : 'disconnected', playerId: id, name: suit.player.name }));
    return events;
  }

  // A player who leaves takes their suit, turret and drone with them; the squad plays on.
  removeSuit(id) {
    const suit = this.suitsById.get(id);
    if (!suit) return [];
    this.releaseSuit(suit);
    this.suits = this.suits.filter(member => member !== suit);
    this.suitsById.delete(id);
    this.players = this.suits.map(member => member.player);
    return [this.squadEvent({ type: 'suit', stage: 'left', playerId: id, name: suit.player.name })];
  }

  squadEvent(event) {
    event.sequence = ++this.eventSequence;
    return event;
  }

  releaseSuit(suit) {
    // A turret on the suit's back is set down where it stands.
    this.carryTurret(false, suit);
    this.stopRevive(suit);
    for (const member of this.suits) if (member.reviveTarget === suit) this.stopRevive(member);
    suit.clearActions();
    suit.player.aiming = false;
  }

  moveSuits(dt, inputsById) {
    for (const suit of this.activeSuits()) {
      if (suit.player.health <= 0) continue;
      this.movePlayer(dt, inputsById[suit.player.id] ?? {}, suit);
      if (this.organ?.phase === 'active') this.applyOrganHazard(dt, suit);
    }
  }

  actSuits(dt, inputsById) {
    for (const suit of this.activeSuits()) this.act(dt, suit, inputsById[suit.player.id] ?? {});
  }

  act(dt, suit, input) {
    const { player } = suit;
    if (player.health <= 0) return;
    const eventStart = this.events.length;
    if (input.deploy) this.useCompanion(suit);
    this.carryTurret(!!input.carry, suit);
    useMelee(this, suit, input, dt);
    throwItems(this, suit, input, dt);
    const repairing = this.updateRepair(dt, input.repair, suit);
    this.updateRifle(dt, input, repairing, suit);
    player.aiming = Boolean(input.aim && !repairing && !suit.reloading);
    for (let index = eventStart; index < this.events.length; index++) {
      const event = this.events[index];
      event.playerId = player.id;
      if (event.type === 'shot') event.origin = { x: player.x, y: player.y, z: player.z };
    }
  }

  // A downed teammate in reach takes the sealer before tissue does.
  updateRepair(dt, held, suit = this) {
    if (!this.suits) return super.updateRepair(dt, held, suit);
    const { player } = suit;
    let ally = null;
    let nearest = REVIVE.radius;
    for (const member of this.suits) {
      if (member === suit || !member.player.downed || !member.player.linked) continue;
      const distance = Math.hypot(member.player.x - player.x, member.player.z - player.z);
      if (distance <= nearest) {
        ally = member;
        nearest = distance;
      }
    }
    if (!ally) {
      if (suit.reviveTarget) this.stopRevive(suit);
      return super.updateRepair(dt, held, suit);
    }
    suit.nearNode = null;
    suit.nearTissue = suit.nearGash = false;
    suit.nearGastricValve = null;
    suit.canRepair = true;
    if (suit.reviveTarget !== ally) {
      if (suit.reviveTarget) this.stopRevive(suit);
      suit.reviveTarget = ally;
    }
    suit.repairTarget = ally.player;
    if (!held) {
      if (suit.repairing) this.events.push({ type: 'repairStop' });
      suit.repairing = false;
      suit.repairProgress = ally.player.reviveProgress = 0;
      return false;
    }
    if (!suit.repairing) {
      suit.repairing = true;
      this.events.push({ type: 'repairStart' });
    }
    suit.repairProgress = ally.player.reviveProgress = Math.min(1, suit.repairProgress + dt / REVIVE.seconds);
    if (suit.repairProgress >= 1) {
      ally.clearActions();
      Object.assign(ally.player, { health: REVIVE.health, downed: false });
      suit.repairProgress = 0;
      suit.reviveTarget = suit.repairTarget = null;
      this.creditPlayer(suit, 250);
      this.events.push({ type: 'suit', stage: 'revive', targetId: ally.player.id,
        x: ally.player.x, y: ally.player.y, z: ally.player.z });
    }
    return true;
  }

  stopRevive(suit) {
    if (suit.reviveTarget) suit.reviveTarget.player.reviveProgress = 0;
    suit.reviveTarget = null;
    suit.repairProgress = 0;
  }

  updateSuitStatus() {
    for (const suit of this.suits) {
      if (suit.player.health > 0 || suit.player.downed) continue;
      const playerId = suit.player.id;
      if (suit.repairing) this.events.push({ type: 'repairStop', playerId });
      this.stopRevive(suit);
      for (const member of this.suits) if (member.reviveTarget === suit) this.stopRevive(member);
      suit.clearActions();
      suit.player.downed = true;
      suit.player.aiming = false;
      this.events.push({ type: 'suit', stage: 'down', playerId });
    }
  }

  suitsDefeated() {
    return this.activeSuits().every(({ player }) => player.health === 0);
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
      revive: suit.reviveTarget ? { id: suit.reviveTarget.player.id, name: suit.reviveTarget.player.name } : null,
      nearGastricValveId: suit.nearGastricValve?.id ?? null,
      nearNode: nodeCopy(suit.nearNode), nearNodeId: suit.nearNode?.id ?? null,
      objective: nodeCopy(this.objective), objectiveId: this.objective.id,
      failedNode: nodeCopy(this.failedNode), failedNodeId: this.failedNode?.id ?? null,
      // Your own turret and drone drive the HUD; every one of them is drawn.
      turret: suit.turret ? { ...suit.turret } : null,
      turrets: this.turrets.map(turret => ({ ...turret })),
      companion: suit.companion,
      drone: snapshotDrone(suit.drone),
      drones: this.drones.map(drone => ({ ...snapshotDrone(drone), id: 'drone:' + drone.ownerId })),
      ability: suit.ability ? { ...suit.ability } : null,
      throwables: snapshotThrowables(this),
      turretPlacement: player.downed ? null : this.turretPlacementFor(player, suit),
      turretCharges: suit.turretCharges, canRedeployTurret: false,
      nodes,
      enemies: this.enemies.map(snapshotEnemy),
      projectiles: this.projectiles.map(({ owner, ...projectile }) => ({ ...projectile, ownerId: owner.id })),
      pickups: this.pickups.map(pickup => ({ ...pickup })),
      encounter: this.encounter ? { ...this.encounter, approaches: this.encounter.approaches.map(p => ({ ...p })) } : null,
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
