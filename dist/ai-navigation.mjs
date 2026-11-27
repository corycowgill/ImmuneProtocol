const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Same circular solid footprints used by the simulation and existing boss LOS.
// Deliberately conservative for floating species: decorative visual gaps are not navigable.
export function clearSegment(obstacles, from, to, clearance = 0) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const length = dx * dx + dz * dz;
  // A suit standing up on an obstacle (solids.mjs) is in plain view of everything around it.
  const perched = point => (point.feet ?? 0) > .3;
  for (const [x, z, radius] of obstacles) {
    if ((perched(to) && (to.x - x) ** 2 + (to.z - z) ** 2 < radius * radius) ||
      (perched(from) && (from.x - x) ** 2 + (from.z - z) ** 2 < radius * radius)) continue;
    const t = length ? Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / length)) : 0;
    if ((from.x + dx * t - x) ** 2 + (from.z + dz * t - z) ** 2 < (radius + clearance) ** 2) return false;
  }
  return true;
}

export class NavigationSystem {
  constructor(obstacles, area, bounds = { x: 55, z: 77 }, clearance = .85) {
    this.obstacles = obstacles;
    this.area = area;
    this.bounds = bounds;
    this.clearance = clearance;
    this.points = [];
    // A reusable visibility graph suits the small, static, circular obstacle sets.
    for (const [x, z, radius] of obstacles) {
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const reach = (radius + this.clearance + .15) / Math.cos(Math.PI / 12);
        const p = { x: x + Math.sin(angle) * reach, z: z + Math.cos(angle) * reach };
        if (this.inside(p) && clearSegment(obstacles, p, p, this.clearance)) this.points.push(p);
      }
    }
    this.edges = this.points.map(() => []);
    for (let a = 0; a < this.points.length; a++) for (let b = a + 1; b < this.points.length; b++) {
      if (!this.clear(this.points[a], this.points[b])) continue;
      const cost = gap(this.points[a], this.points[b]);
      this.edges[a].push([b, cost]); this.edges[b].push([a, cost]);
    }
    this.searches = 0;
    this.failures = 0;
  }
  inside(p) {
    return (p.x / (this.bounds.x - 1)) ** 2 + (p.z / (this.bounds.z - 1)) ** 2 <= 1;
  }
  clear(a, b, clearance = this.clearance) { return clearSegment(this.obstacles, a, b, clearance); }
  project(point) {
    const p = { x: point.x, z: point.z };
    const scale = Math.hypot(p.x / (this.bounds.x - 1), p.z / (this.bounds.z - 1));
    if (scale > 1) { p.x /= scale; p.z /= scale; }
    for (let pass = 0; pass < 3; pass++) for (const [x, z, radius] of this.obstacles) {
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz), reach = radius + this.clearance + .08;
      if (d < reach) { p.x = x + (d ? dx / d : 1) * reach; p.z = z + (d ? dz / d : 0) * reach; }
    }
    return p;
  }
  path(from, destination) {
    this.searches++;
    const start = this.project(from), goal = this.project(destination);
    if (!this.inside(goal) || !this.clear(goal, goal)) { this.failures++; return null; }
    if (this.clear(start, goal)) return [goal];
    const count = this.points.length;
    const costs = new Float64Array(count); costs.fill(Infinity);
    const parents = new Int32Array(count); parents.fill(-1);
    const closed = new Uint8Array(count);
    for (let i = 0; i < count; i++) if (this.clear(start, this.points[i])) costs[i] = gap(start, this.points[i]);
    let best = -1;
    // Bounded A*: one expansion per static waypoint at most.
    for (let n = 0; n < count; n++) {
      let next = -1, value = Infinity;
      for (let i = 0; i < count; i++) {
        const score = costs[i] + gap(this.points[i], goal);
        if (!closed[i] && score < value) { value = score; next = i; }
      }
      if (next < 0) break;
      if (this.clear(this.points[next], goal)) { best = next; break; }
      closed[next] = 1;
      for (const [other, distance] of this.edges[next]) {
        const score = costs[next] + distance;
        if (score < costs[other]) { costs[other] = score; parents[other] = next; }
      }
    }
    if (best < 0) { this.failures++; return null; }
    const result = [goal];
    for (let i = best; i >= 0; i = parents[i]) result.unshift(this.points[i]);
    return result;
  }
}
