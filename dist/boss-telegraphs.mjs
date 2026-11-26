// Project the actual committed attack footprint. Reuses one SVG, without game/GPU state.
export function telegraphOutline(tell) {
  if (!tell || tell.remaining <= 0) return [];
  if (tell.kind === 'pulse') return []; // Global LOS attack: a finite ring would falsely imply a safe distance.
  const circle = (x, z, radius) => Array.from({ length: 32 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 16) * radius, z: z + Math.sin(i * Math.PI / 16) * radius }));
  // Several separate footprints (a missile salvo's circles): null breaks the outline between them.
  if (tell.rings) return tell.rings.flatMap(ring => [...circle(ring.x, ring.z, ring.radius), null]);
  // A laser sweep: the fan of floor it will cross, from the boss out to its reach.
  if (tell.kind === 'sweep') {
    const steps = 20, span = tell.to - tell.from;
    const arc = Array.from({ length: steps + 1 }, (_, i) => {
      const bearing = tell.from + span * i / steps;
      return { x: tell.x + Math.sin(bearing) * tell.radius, z: tell.z + Math.cos(bearing) * tell.radius };
    });
    return [{ x: tell.x, z: tell.z }, ...arc];
  }
  if (tell.kind === 'charge' || tell.kind === 'pull') {
    const dx = tell.toX - tell.x, dz = tell.toZ - tell.z, d = Math.hypot(dx, dz) || 1;
    const length = tell.kind === 'charge' ? tell.length ?? 76 : d;
    const x = -dz / d * tell.radius, z = dx / d * tell.radius;
    const count = Math.ceil(length / 2);
    const side = (direction, reverse) => Array.from({ length: count + 1 }, (_, i) => {
      const fraction = (reverse ? count - i : i) / count;
      return { x: tell.x + dx / d * length * fraction + x * direction, z: tell.z + dz / d * length * fraction + z * direction };
    });
    return [...side(1, false), ...side(-1, true)];
  }
  return circle(tell.x, tell.z, tell.radius);
}

export class BossTelegraphView {
  constructor(parent, doc = document) { this.parent = parent; this.document = doc; }
  update(sim, world, floor = () => 0) {
    const tell = sim.enemies.find(e => e.telegraph?.remaining > 0)?.telegraph;
    if (!tell || sim.phase !== 'combat') { if (this.svg) this.svg.style.display = 'none'; return; }
    if (!this.svg) {
      this.svg = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('aria-hidden', 'true');
      this.svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
      this.polygon = this.document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.polygon.setAttribute('fill', '#ff6e3c22'); this.polygon.setAttribute('stroke', '#ffbf69');
      this.polygon.setAttribute('stroke-width', '2'); this.polygon.setAttribute('stroke-dasharray', '9 5');
      this.svg.append(this.polygon); this.parent.append(this.svg);
    }
    const points = telegraphOutline(tell).map(p => p && world.project(p.x, floor(p.x, p.z) + .2, p.z));
    if (!points.length) { this.svg.style.display = 'none'; return; }
    // Show visible outline fragments when the player stands inside the footprint.
    // Never connect points across the near plane or fill a partial silhouette.
    const safe = p => !!p && p.visible && Number.isFinite(p.x + p.y);
    const all = points.every(safe);
    const path = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if (safe(a) && safe(b)) path.push(`M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`);
    }
    this.svg.style.display = path.length ? '' : 'none';
    this.polygon.setAttribute('d', all ? 'M' + points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L') + 'Z' : path.join(''));
    this.polygon.setAttribute('fill', all ? '#ff6e3c22' : 'none');
  }
}
