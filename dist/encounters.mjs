// Recompose the authored wave roster into readable encounters. Never adds enemies or stats.
export const ENCOUNTER_RULES = Object.freeze({ warning: 4, minimumGap: .55, safeSuit: 18, safeNode: 18, maxActive: 44, orderSeconds: 24 });
const mobile = ['virus', 'phage', 'flagellate', 'splitter'];
const ranged = ['spore', 'blister'];
const tissue = ['bacillus', 'filovirus', 'amoeba', 'rogue'];
export const ENCOUNTER_PATTERNS = Object.freeze([
  { id: 'pincer', name: 'Swarm Pincer', needs: [mobile, mobile, mobile, mobile], fronts: 2,
    cue: 'Two approaches converge. Cover the marked node from both sides.' },
  { id: 'crossfire', name: 'Spore Crossfire', needs: [ranged, ranged, mobile, mobile], fronts: 2,
    cue: 'Spitters enter from separate angles. Break one firing line first.' },
  { id: 'convoy', name: 'Colony Convoy', needs: [['guard'], tissue, tissue, [...ranged, ...mobile]], fronts: 1,
    cue: 'Armour leads tissue attackers. Get an angle on the colony behind it.' },
  { id: 'feint', name: 'Decoy Rush', needs: [mobile, mobile, tissue, tissue], fronts: 2,
    cue: 'The fast rush is a diversion. Tissue attackers follow at the other marked node.' },
  { id: 'siege', name: 'Tissue Siege', needs: [tissue, tissue, ranged, [...mobile, 'guard']], fronts: 1,
    cue: 'A colony and a spitter focus one node. Intercept the tissue attackers.' },
  { id: 'hunters', name: 'Predator Pack', needs: [mobile, mobile, mobile, [...ranged, 'rogue-bot', 'crawler']], fronts: 2,
    cue: 'Hunters pressure your suit while ranged support takes another angle. Keep moving.' },
].map(p => Object.freeze({ ...p, needs: Object.freeze(p.needs.map(n => Object.freeze(n))) })));

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const living = sim => sim.activeSuits().map(s => s.player).filter(p => p.health > 0);
const hash = text => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

function choose(pattern, pool) {
  const result = [];
  for (const types of pattern.needs) {
    const slot = pool.find(s => types.includes(s.type) && !result.includes(s));
    if (!slot) return null;
    result.push(slot);
  }
  return result;
}

export function planEncounters(sim) {
  sim.encounter = null; sim.encounterPlan = null;
  const mission = sim.missions[sim.wave - 1];
  if (!mission || mission.boss || mission.arrivals || sim.valve || sim.area === 'junction' ||
      (sim.hasTutorial && sim.wave === 1) || mission.species.length < 16) return;
  const base = mission.cadence * 1;
  const seed = hash(`${sim.encounterSeed}:${sim.area}:${sim.wave}`);
  const slots = mission.species.map((type, index) => ({ type, source: index,
    lane: mission.lanes ? Math.max(0, 'LRC'.indexOf(mission.lanes[index])) : (index + sim.wave - 1) % sim.nodes.length, pack: -1 }));
  const packs = [], used = new Set();
  for (const fraction of [.13, .44, .74]) {
    const start = Math.floor(slots.length * fraction), pool = slots.slice(start);
    if (pool.length < 5) continue;
    let picked = null, members = null;
    for (let j = 0; j < ENCOUNTER_PATTERNS.length; j++) {
      const candidate = ENCOUNTER_PATTERNS[(seed + packs.length * 3 + j) % ENCOUNTER_PATTERNS.length];
      if (used.has(candidate.id)) continue;
      members = choose(candidate, pool);
      if (members) { picked = candidate; break; }
    }
    if (!picked) continue;
    used.add(picked.id);
    const id = `${sim.wave}-${packs.length}-${picked.id}`;
    const pack = { id, pattern: picked.id, name: picked.name, cue: picked.cue, start, size: members.length,
      preferredNode: (seed + packs.length + sim.wave) % sim.nodes.length, fronts: picked.fronts,
      stage: 'planned', members: [], spawned: 0, sites: [], clearAt: 0 };
    for (let i = 0; i < members.length; i++) {
      members[i].pack = packs.length; members[i].member = i;
    }
    slots.splice(start, pool.length, ...members, ...pool.filter(s => !members.includes(s)));
    packs.push(pack);
  }
  const first = sim.wave === 1 ? .8 : .65;
  let previous = -base;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i], pack = packs[slot.pack];
    let at = first + i * base;
    if (pack) {
      if (slot.member === 0) pack.at = Math.max(at, ENCOUNTER_RULES.warning, previous + ENCOUNTER_RULES.minimumGap);
      const compressed = Math.max(ENCOUNTER_RULES.minimumGap, Math.min(1.1, base * .65));
      at = pack.at + slot.member * compressed + (pack.pattern === 'feint' && slot.member >= 2 ? 1.8 : 0);
    }
    slot.at = Math.max(at, previous + ENCOUNTER_RULES.minimumGap); previous = slot.at;
  }
  sim.encounterPlan = { slots, packs, delay: 0, relief: 0, lastSpawn: -Infinity };
}

function safe(sim, p, buffer = 0) {
  return sim.ai.navigation.inside(p) && sim.ai.navigation.clear(p, p) &&
    living(sim).every(suit => gap(p, suit) >= ENCOUNTER_RULES.safeSuit + buffer) &&
    sim.nodes.every(node => gap(p, node) >= ENCOUNTER_RULES.safeNode + buffer);
}

function sites(sim, pack) {
  const inlets = (sim.organMission?.inlets ?? sim.constructor.entrances).flat().map(([x, z]) => ({ x, z }));
  const candidates = [...inlets];
  for (let i = 0; i < 32; i++) candidates.push({ x: Math.cos(i * Math.PI / 16) * 50, z: Math.sin(i * Math.PI / 16) * 70 });
  const node = sim.nodes[pack.node], result = [];
  const firstRoute = (sim.organMission?.inlets ?? sim.constructor.entrances)[pack.node];
  const preferred = firstRoute[(sim.wave + pack.start) % firstRoute.length];
  const initial = { x: preferred[0], z: preferred[1] };
  for (let front = 0; front < pack.fronts; front++) {
    let best = null, score = -Infinity;
    for (const raw of candidates) {
      const p = sim.ai.navigation.project(raw);
      if (!safe(sim, p, 5) || result.some(other => gap(other, p) < 28)) continue;
      const value = front === 0 ? -gap(p, initial) : gap(p, result[0]) - gap(p, node) * .15;
      if (value > score) { best = p; score = value; }
    }
    if (!best) return null;
    result.push(best);
  }
  return result;
}

function emit(sim, pack, stage, extra = {}) {
  const node = sim.nodes[pack.node];
  sim.events.push({ type: 'encounter', stage, id: pack.id, pattern: pack.pattern, name: pack.name, cue: pack.cue,
    nodeId: node?.id, nodeName: node?.name, x: node?.x, y: 1.7, z: node?.z, ...extra });
}

function warn(sim, pack, reroute = false) {
  // Commit strategic targets at the warning; the player can respond to this exact plan.
  pack.node ??= pack.preferredNode;
  if (sim.nodes[pack.node].health < 25) {
    const healthier = sim.nodes.findIndex(n => n.health > 45);
    if (healthier >= 0) pack.node = healthier;
  }
  pack.otherNode = (pack.node + 1) % sim.nodes.length;
  const chosen = sites(sim, pack);
  if (!chosen) return false;
  pack.sites = chosen; pack.stage = 'warning'; pack.warnedAt = sim.clock; pack.reroute = reroute;
  emit(sim, pack, 'warning', { reroute, otherNodeName: pack.pattern === 'feint' ? sim.nodes[pack.otherNode].name : null });
  return true;
}

function assignment(sim, pack, slot) {
  const feint = pack.pattern === 'feint', i = slot.member;
  const front = feint ? Number(i >= 2) : i % pack.sites.length;
  const nodeIndex = feint && i < 2 ? pack.otherNode : pack.node;
  const site = pack.sites[front], node = sim.nodes[nodeIndex];
  const direction = Math.atan2(node.x - site.x, node.z - site.z);
  // A convoy's armoured front is actually ahead of the fragile members.
  const lead = pack.pattern === 'convoy' && i === 0 ? 3 : 0;
  const offset = (i % 2 ? 1 : -1) * (1 + i * .35);
  const spawn = sim.ai.navigation.project({ x: site.x + Math.sin(direction) * lead + Math.cos(direction) * offset,
    z: site.z + Math.cos(direction) * lead - Math.sin(direction) * offset });
  let role = tissue.includes(slot.type) ? 'objective' : ranged.includes(slot.type) ? 'suppressor' : 'flanker';
  if (slot.type === 'guard') role = 'defender';
  if (pack.pattern === 'hunters' || (feint && i < 2)) role = 'aggressor';
  const approach = sim.ai.navigation.project({ x: (site.x + node.x) * .5 + Math.cos(direction) * (front ? -6 : 6),
    z: (site.z + node.z) * .5 - Math.sin(direction) * (front ? -6 : 6) });
  return { ...(safe(sim, spawn) ? spawn : site), nodeIndex, role, approach, packId: pack.id, member: i };
}

function publish(sim) {
  const plan = sim.encounterPlan, now = sim.clock;
  const pack = plan.packs.find(p => p.stage === 'warning' || p.stage === 'holding') ??
    [...plan.packs].reverse().find(p => p.stage === 'active') ?? plan.packs.find(p => p.stage === 'clear' && now - p.clearAt < 2.5);
  if (!pack) { sim.encounter = null; return; }
  const next = plan.slots.find(s => s.pack >= 0 && plan.packs[s.pack] === pack && s.member >= pack.spawned);
  const node = sim.nodes[pack.node];
  sim.encounter = { id: pack.id, pattern: pack.pattern, name: pack.name, cue: pack.cue, stage: pack.stage,
    nodeId: node.id, nodeName: node.name, otherNodeName: pack.pattern === 'feint' ? sim.nodes[pack.otherNode].name : null,
    remaining: next ? Math.max(0, next.at + plan.delay - (now - sim.waveStartedAt), ENCOUNTER_RULES.warning - (now - pack.warnedAt)) : 0,
    spawned: pack.spawned, total: pack.size, reroute: pack.reroute, alive: sim.enemies.filter(e => e.encounterOrder?.id === pack.id).length,
    approaches: pack.spawned < pack.size ? pack.sites.map((p, index) => ({ ...p, label: pack.pattern === 'feint'
      ? index === 0 ? 'DECOY' : 'BREACH' : pack.sites.length > 1 ? 'FLANK ' + (index + 1) : 'BREACH' })) : [] };
}

// Returns true when the encounter scheduler owns this ordinary wave's arrivals.
export function stepEncounters(sim, dt) {
  const plan = sim.encounterPlan;
  if (!plan) return false;
  if (sim.phase !== 'combat' || sim.airway || sim.tutorial || sim.bossArrived || sim.boss) { sim.encounter = null; return true; }
  const elapsed = sim.clock - sim.waveStartedAt;
  for (const pack of plan.packs) {
    if (pack.stage === 'planned' && elapsed >= pack.at + plan.delay - ENCOUNTER_RULES.warning) {
      if (!warn(sim, pack)) plan.delay += dt;
    }
    if (pack.spawned === pack.size && pack.stage !== 'clear' && !sim.enemies.some(e => e.encounterOrder?.id === pack.id)) {
      pack.stage = 'clear'; pack.clearAt = sim.clock; emit(sim, pack, 'clear');
    }
  }
  const slot = plan.slots[sim.spawnIndex];
  if (!slot) { publish(sim); return true; }
  const pack = plan.packs[slot.pack];
  if (elapsed >= slot.at + plan.delay && sim.clock - plan.lastSpawn >= ENCOUNTER_RULES.minimumGap) {
    const pressured = sim.enemies.length >= ENCOUNTER_RULES.maxActive ||
      (plan.relief < 5 && (living(sim).some(p => p.health < 25) || sim.nodes.some(n => n.health < 20)));
    if (pack && (pack.stage === 'planned' || sim.clock - pack.warnedAt < ENCOUNTER_RULES.warning || pressured)) {
      plan.delay += dt; plan.relief += dt;
      if (pack.stage !== 'planned' && pressured) pack.stage = 'holding';
    } else {
      const spawn = pack ? assignment(sim, pack, slot) : null;
      if (pack && !safe(sim, spawn)) {
        // If suits occupy a warned inlet, commit a new safe approach and warn again.
        if (warn(sim, pack, true)) plan.delay += ENCOUNTER_RULES.warning;
        else { pack.stage = 'holding'; plan.delay += dt; }
      } else {
        sim.spawn(slot.type, spawn ?? { nodeIndex: slot.lane });
        plan.lastSpawn = sim.clock;
        if (!pack || slot.member === pack.size - 1) plan.relief = 0;
        if (pack) {
          if (!pack.spawned) emit(sim, pack, 'engage');
          if (pack.pattern === 'feint' && slot.member === 2) emit(sim, pack, 'turn', { otherNodeName: sim.nodes[pack.otherNode].name });
          pack.members.push(sim.enemies.at(-1).id); pack.spawned++; pack.stage = 'active';
        }
      }
    }
  }
  sim.spawnCountdown = Math.max(0, slot.at + plan.delay - elapsed);
  publish(sim);
  return true;
}
