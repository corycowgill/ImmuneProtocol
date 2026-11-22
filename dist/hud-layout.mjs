// Presentation rules only; none of these change simulation or input state.
export function compactHud(width, height, touch = false) {
  return width <= 720 || (height <= 520 && width <= 1180) || (touch && width <= 1366);
}

export function shortNodeName(node, nodes) {
  const words = name => name.trim().split(/\s+/);
  const own = words(node.name);
  for (const index of [-1, 0]) {
    const candidate = own.at(index);
    if (nodes.every(other => other === node || words(other.name).at(index)?.toLowerCase() !== candidate.toLowerCase())) return candidate;
  }
  return node.name;
}

export function importantNode(node, sim) {
  return !!(node.underAttack || node.health < 75 || sim.gash?.nodeId === node.id ||
    sim.airway?.ports.some(port => port.nodeId === node.id && !port.open));
}

export function fieldTargets(targets, player, compact) {
  if (!compact) return targets;
  const rank = { laser: 100, boss: 90, encounter: 70, nest: 50, cache: 20 };
  const sorted = [...targets].sort((a, b) => (rank[b.kind] ?? 0) - (rank[a.kind] ?? 0) ||
    Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
  const urgent = sorted.filter(t => (rank[t.kind] ?? 0) >= 90);
  return [...urgent, ...sorted.filter(t => (rank[t.kind] ?? 0) < 90).slice(0, Math.max(0, 4 - urgent.length))];
}

export class EncounterNotice {
  update(encounter, clock = 0) {
    if (!encounter) { this.key = null; return false; }
    const key = encounter.id + ':' + encounter.stage + ':' + !!encounter.reroute + ':' +
      (encounter.pattern === 'feint' && encounter.spawned >= 3);
    if (this.key !== key || clock < this.since) { this.key = key; this.since = clock; }
    if (encounter.stage === 'warning' || encounter.stage === 'holding') return true;
    return clock - this.since < (encounter.stage === 'clear' ? 1.8 : 2.5);
  }
}
