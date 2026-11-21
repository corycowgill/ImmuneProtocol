// Field objectives: things to do out in the arena besides holding the tissue nodes.
//
// Brood nests take root far from the nodes and keep hatching fast little larvae until someone
// crosses the arena and destroys them; a wave is not clear while a nest stands. Antibody caches
// drift in for a limited time and patch up the suit of whoever reaches them first. Both pull
// players off their node and across the full chamber.
export const NEST = Object.freeze({
  model: 'blister', health: 640, radius: 2.05, y: 1.75, scale: 2.4,
  firstHatch: 5, hatchEvery: 6.5, hatchLimit: 8, score: 600,
});
export const CACHE = Object.freeze({ radius: 2.6, lifetime: 45, heal: 40, score: 250, y: 1.3 });

const NODE_CLEARANCE = 22;
const SUIT_CLEARANCE = 18;
const SITE_SPACING = 16;

function inHazard(hazard, x, z) {
  if (!hazard) return false;
  return hazard.radius ? Math.hypot(x - hazard.x, z - hazard.z) < hazard.radius + 2
    : Math.abs(x - hazard.x) < hazard.width / 2 + 2 && Math.abs(z - hazard.z) < hazard.depth / 2 + 2;
}

// A spot on the outer ring of the arena that is away from nodes, suits, obstacles and the hazard.
// The search is a fixed sequence, so the same wave offers the same sites.
function farSite(sim, arena, salt, taken) {
  let fallback = null;
  let fallbackGap = -Infinity;
  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = salt * 2.39996 + attempt * 0.83;
    const reach = .7 + .1 * Math.sin(attempt * 1.7 + salt);
    const x = Math.cos(angle) * arena.x * reach;
    const z = Math.sin(angle) * arena.z * reach;
    const nodeGap = Math.min(...sim.nodes.map(node => Math.hypot(node.x - x, node.z - z)));
    const suitGap = Math.min(...sim.activeSuits().map(({ player }) => Math.hypot(player.x - x, player.z - z)));
    const siteGap = Math.min(Infinity, ...taken.map(site => Math.hypot(site.x - x, site.z - z)));
    const blocked = (sim.organMission?.obstacles ?? []).some(([ox, oz, size]) => Math.hypot(ox - x, oz - z) < size + 3) ||
      inHazard(sim.organMission?.hazard, x, z);
    if (!blocked && siteGap >= SITE_SPACING && nodeGap > fallbackGap) {
      fallback = { x, z };
      fallbackGap = nodeGap;
    }
    if (!blocked && nodeGap >= NODE_CLEARANCE && suitGap >= SUIT_CLEARANCE && siteGap >= SITE_SPACING) return { x, z };
  }
  return fallback;
}

// Scripted encounters keep their own pacing: training, the heart valve, the junction and bosses.
function eligible(sim, mission) {
  return !sim.tutorial && !sim.valve && sim.area !== 'junction' && !mission.boss && !mission.arrivals;
}

export function planFieldObjectives(sim) {
  sim.pickups = [];
  const mission = sim.missions[sim.wave - 1];
  if (!eligible(sim, mission)) {
    sim.field = null;
    return;
  }
  const last = sim.wave === sim.waves;
  const nests = sim.wave === 1 && sim.waves > 2 ? 0 : last ? 2 : 1;
  sim.field = {
    // Fractions of the wave's roster that must have arrived before each objective appears.
    nestAt: Array.from({ length: nests }, (_, index) => .12 + index * .4),
    cacheAt: .45,
    nests: 0,
    cache: false,
    sites: [],
  };
}

export function stepFieldObjectives(sim, dt, arena) {
  const { field } = sim;
  if (!field || sim.phase !== 'combat') return;
  const mission = sim.missions[sim.wave - 1];
  const progress = sim.spawnIndex / Math.max(1, mission.species.length);
  if (sim.tutorial) return;

  while (field.nests < field.nestAt.length && progress >= field.nestAt[field.nests]) {
    const site = farSite(sim, arena, sim.wave * 3 + field.nests * 5 + sim.area.length, field.sites);
    field.nests++;
    if (!site) continue;
    field.sites.push(site);
    const node = [...sim.nodes].sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z))[0];
    const nest = sim.createEnemy(NEST.model, site.x, site.z, node, NEST);
    Object.assign(nest, { nest: true, behavior: 'nest', scale: NEST.scale, score: NEST.score, hatchIn: NEST.firstHatch, hatched: 0 });
    sim.enemies.push(nest);
    sim.events.push({ type: 'nest', stage: 'spawn', id: nest.id, x: nest.x, y: nest.y, z: nest.z });
  }

  if (!field.cache && progress >= field.cacheAt) {
    field.cache = true;
    const site = farSite(sim, arena, sim.wave * 7 + sim.area.length * 2, field.sites);
    if (site) {
      const cache = { id: sim.nextPickupId++, kind: 'cache', x: site.x, y: CACHE.y, z: site.z, remaining: CACHE.lifetime };
      sim.pickups.push(cache);
      sim.events.push({ type: 'cache', stage: 'spawn', id: cache.id, x: cache.x, y: cache.y, z: cache.z });
    }
  }

  let kept = 0;
  for (const cache of sim.pickups) {
    cache.remaining -= dt;
    const suit = sim.activeSuits().find(({ player }) => player.health > 0 &&
      Math.hypot(player.x - cache.x, player.z - cache.z) <= CACHE.radius);
    if (suit) {
      const { player } = suit;
      player.health = Math.min(100, player.health + CACHE.heal);
      player.ammo = suit.magazineSize;
      suit.reloading = 0;
      sim.score += CACHE.score;
      sim.creditPlayer(suit, CACHE.score);
      const event = { type: 'cache', stage: 'collect', id: cache.id, x: cache.x, y: cache.y, z: cache.z };
      if (player.id != null) event.playerId = player.id;
      sim.events.push(event);
    } else if (cache.remaining <= 0) {
      sim.events.push({ type: 'cache', stage: 'expire', id: cache.id, x: cache.x, y: cache.y, z: cache.z });
    } else {
      sim.pickups[kept++] = cache;
    }
  }
  sim.pickups.length = kept;
}

// A nest never moves. It hatches a larva toward the weakest node on a timer until it runs dry.
export function advanceNest(sim, nest, dt, larva) {
  nest.y = NEST.y + Math.sin(sim.clock * 1.4 + nest.id) * .05;
  if (nest.hatched >= NEST.hatchLimit) return;
  nest.hatchIn -= dt;
  if (nest.hatchIn > 0) return;
  nest.hatchIn = NEST.hatchEvery;
  nest.hatched++;
  const node = [...sim.nodes].sort((a, b) => a.health - b.health || Math.hypot(a.x - nest.x, a.z - nest.z) - Math.hypot(b.x - nest.x, b.z - nest.z))[0];
  const angle = nest.hatched * 2.4;
  const hatchling = sim.createEnemy('virus', nest.x + Math.cos(angle) * 2.6, nest.z + Math.sin(angle) * 2.6, node, larva);
  hatchling.fragment = true;
  sim.confineToArena(hatchling);
  sim.enemies.push(hatchling);
  sim.events.push({ type: 'nest', stage: 'hatch', id: nest.id, x: nest.x, y: nest.y, z: nest.z });
}
