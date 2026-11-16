import { RULES, Simulation } from './simulation.mjs';
import { normalizeWeaponLoadout, weaponStats } from './weapon-mods.mjs';

const RESPAWN_HEALTH = 50;

class CoopSuit {
  constructor({ id, name, weaponLoadout }, spawn, repairAmount) {
    this.spawn = spawn;
    this.repairAmount = repairAmount;
    this.baseMagazineSize = RULES.magazine;
    this.weaponLoadout = Object.freeze(normalizeWeaponLoadout(weaponLoadout));
    this.configuredWeapon = weaponStats(this.weaponLoadout);
    this.player = { id, name, ammo: this.magazineSize, reserve: RULES.initialReserve };
    this.resetPose(RULES.health);
  }

  get weapon() {
    return this.configuredWeapon;
  }

  get magazineSize() {
    return this.baseMagazineSize + this.weapon.magazineDelta;
  }

  get reloadProgress() {
    return this.reloading > 0 ? 1 - this.reloading / this.weapon.reloadSeconds : 0;
  }

  resetPose(health) {
    Object.assign(this.player, this.spawn, { yaw: 0, pitch: 0, health, downed: false, aiming: false });
    this.clearActions();
  }

  clearActions() {
    this.repairProgress = 0;
    this.repairing = false;
    this.repairTarget = null;
    this.nearNode = null;
    this.nearTissue = false;
    this.canRepair = false;
    this.reloading = 0;
    this.reloadHeld = false;
    this.fireCooldown = 0;
  }
}

export class CoopSimulation extends Simulation {
  constructor(profiles) {
    super('artery');
    if (profiles.length !== 2 || profiles[0].id === profiles[1].id) {
      throw new Error('Co-op requires two distinct players');
    }
    // Add pressure on both routes without changing any of the solo waves.
    this.missions = this.missions.map(mission => ({
      ...mission,
      cadence: mission.cadence * .82,
      species: mission.species.flatMap((type, index) => index % 3 === 2 ? [type, 'virus'] : [type]),
    }));
    this.eventSequence = 0;
    this.createSquad(profiles);
  }

  createSquad(profiles) {
    this.suits = profiles.map((profile, index) => new CoopSuit(
      profile, { x: index === 0 ? -2.2 : 2.2, y: this.player.y, z: this.player.z }, this.repairAmount,
    ));
    this.suitsById = new Map(this.suits.map(suit => [suit.player.id, suit]));
    this.players = this.suits.map(suit => suit.player);
  }

  start() {
    super.start();
    this.createSquad(this.suits.map(({ player, weaponLoadout }) => ({
      id: player.id, name: player.name, weaponLoadout,
    })));
    this.eventSequence = 0;
    this.sequenceEvents();
  }

  setWeaponLoadoutFor(id, loadout) {
    const suit = this.suitsById.get(id);
    if (!suit || (this.phase !== 'ready' && this.phase !== 'intermission')) return false;
    this.setWeaponLoadout(loadout, suit);
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

  resupplyAfterWave(reserve, health) {
    for (const suit of this.suits) {
      if (suit.player.downed) {
        suit.resetPose(RESPAWN_HEALTH);
        super.resupplyAfterWave(reserve, 0, suit.player);
        this.events.push({ type: 'suit', stage: 'respawn', playerId: suit.player.id });
      } else {
        super.resupplyAfterWave(reserve, health, suit.player);
      }
    }
  }

  act(dt, suit, input) {
    const { player } = suit;
    if (player.health <= 0) return;
    this.movePlayer(dt, input, suit);
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

  step(dt, inputsById = {}) {
    this.events = [];
    if (this.phase !== 'combat' && this.phase !== 'intermission') return;
    dt = Math.max(0, Math.min(.1, dt));
    this.clock += dt;
    for (const node of this.nodes) node.underAttack = false;
    for (const suit of this.suits) this.act(dt, suit, inputsById[suit.player.id] ?? {});
    this.updateTurret(dt);

    if (this.phase === 'intermission') {
      this.intermission = Math.max(0, this.intermission - dt);
      if (this.intermission === 0) this.beginWave();
    } else {
      const mission = this.missions[this.wave - 1];
      this.spawnCountdown -= dt;
      if (this.spawnIndex < mission.species.length && this.spawnCountdown <= 0) {
        this.spawn(mission.species[this.spawnIndex]);
        this.spawnCountdown += mission.cadence;
      }
      this.advanceEnemies(dt);
      this.advanceProjectiles(dt);
      this.remaining = mission.species.length - this.spawnIndex + this.enemies.length;
      for (const suit of this.suits) {
        if (suit.player.health > 0 || suit.player.downed) continue;
        const playerId = suit.player.id;
        if (suit.repairing) this.events.push({ type: 'repairStop', playerId });
        suit.clearActions();
        suit.player.downed = true;
        suit.player.aiming = false;
        this.events.push({ type: 'suit', stage: 'down', playerId });
      }
      if (this.failedNode) this.endMission('lost', 'tissue');
      else if (this.players.every(player => player.downed)) this.endMission('lost', 'suit');
      else if (this.remaining === 0 && this.projectiles.length === 0) this.clearWave();
    }
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
    const { player, weapon, weaponLoadout, baseMagazineSize, magazineSize,
      reloading, reloadProgress, repairAmount, repairing, repairProgress, canRepair, nearTissue } = suit;
    return {
      area: this.area,
      phase: this.phase, clock: this.clock, wave: this.wave, waves: this.waves, remaining: this.remaining,
      intermission: this.intermission, score: this.score, kills: this.kills, tissue: this.tissue,
      localPlayerId: id,
      player: { ...player },
      players: this.suits.map(member => ({
        ...member.player, weaponLoadout: member.weaponLoadout, repairing: member.repairing, reloadProgress: member.reloadProgress,
      })),
      weaponLoadout, weapon, baseMagazineSize, magazineSize, reloading, reloadProgress,
      repairAmount, repairing, repairProgress, canRepair, nearTissue,
      repairTarget: nodeCopy(suit.repairTarget), repairTargetId: suit.repairTarget?.id ?? null,
      nearNode: nodeCopy(suit.nearNode), nearNodeId: suit.nearNode?.id ?? null,
      objective: nodeCopy(this.objective), objectiveId: this.objective.id,
      failedNode: nodeCopy(this.failedNode), failedNodeId: this.failedNode?.id ?? null,
      turret: this.turret ? { ...this.turret } : null,
      turretPlacement: player.downed ? null : this.turretPlacementFor(player),
      turretCharges: this.turretCharges, canRedeployTurret: false,
      nodes,
      enemies: this.enemies.map(enemy => ({ ...enemy, node: nodeCopy(enemy.node) })),
      projectiles: this.projectiles.map(({ owner, ...projectile }) => ({ ...projectile, ownerId: owner.id })),
      events: this.events,
      tutorial: null, extractionPending: false, settling: false, overtime: false, overtimeBonus: 0,
    };
  }
}
