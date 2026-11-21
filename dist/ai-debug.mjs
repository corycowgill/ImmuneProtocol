import { AI_PROFILES } from './ai-profiles.mjs';

// Created only when first enabled. No scene objects, listeners, or GPU resources per enemy.
export class AIDebugSystem {
  constructor(doc = document) { this.document = doc; this.enabled = false; this.layer = 0; this.next = 0; }
  toggle(cycle = false) {
    if (cycle) this.layer = (this.layer + 1) % 5;
    else this.enabled = !this.enabled;
    if (!this.panel && this.enabled) {
      this.panel = this.document.createElement('aside');
      this.panel.setAttribute('aria-label', 'Tactical AI debug');
      this.panel.style.cssText = 'position:fixed;right:12px;top:70px;z-index:80;width:340px;max-width:90vw;max-height:85vh;overflow:hidden;background:#07151deb;color:#b7ead8;padding:10px;font:11px/1.35 monospace;pointer-events:none;border:1px solid #4b8c84;border-radius:6px';
      this.map = this.document.createElement('canvas'); this.map.width = 320; this.map.height = 300;
      this.map.style.cssText = 'width:100%;max-height:32vh;object-fit:contain';
      this.text = this.document.createElement('pre'); this.text.style.cssText = 'white-space:pre-wrap;margin:6px 0';
      this.panel.append(this.map, this.text); this.document.body.append(this.panel);
    }
    if (this.panel) this.panel.hidden = !this.enabled;
  }
  update(sim, now = performance.now(), active = true) {
    if (sim?.ai) sim.ai.debug = this.enabled;
    if (!this.enabled || !this.panel) return;
    this.panel.hidden = !active;
    if (!active || !sim || now < this.next) return;
    this.next = now + 180;
    const world = sim.ai, ctx = this.map.getContext('2d'), scale = 1.8;
    const at = p => [160 + p.x * scale, 150 + p.z * scale];
    const line = (points, color, closed = false) => {
      if (!points.length) return;
      ctx.beginPath(); points.forEach((p, i) => { const [x, y] = at(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      if (closed) ctx.closePath(); ctx.strokeStyle = color; ctx.stroke();
    };
    const dot = (p, color, radius = 2) => { const [x, y] = at(p); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); };
    ctx.clearRect(0, 0, 320, 300); ctx.strokeStyle = '#477068';
    ctx.beginPath(); ctx.ellipse(160, 150, 55 * scale, 77 * scale, 0, 0, Math.PI * 2); ctx.stroke();
    for (const [x, z, radius] of world?.navigation.obstacles ?? []) { const [px, py] = at({ x, z }); ctx.fillStyle = '#52625d'; ctx.beginPath(); ctx.arc(px, py, radius * scale, 0, 7); ctx.fill(); }
    for (const node of sim.nodes) dot(node, '#42e5ad', 4);
    for (const player of sim.players ?? [sim.player]) dot(player, '#fff', 4);
    const enemies = [...sim.enemies].sort((a, b) => Math.hypot(a.x - sim.player.x, a.z - sim.player.z) - Math.hypot(b.x - sim.player.x, b.z - sim.player.z));
    const lines = ['AI · F3 toggle · Shift+F3 layers', ['All', 'Vision', 'Navigation', 'Cover', 'Squads'][this.layer]];
    if (world) {
      const t = world.telemetry, d = world.director;
      lines.push(`AI ms avg ${t.averageMs.toFixed(2)} peak ${t.peakMs.toFixed(2)} last ${t.lastMs.toFixed(2)}`,
        `LOS ${t.rays}/${world.config.sightBudget} paths ${t.paths}/${world.config.pathsPerStep}`,
        `Pressure ${d.pressure.size}/${d.limit} intensity ${d.intensity.toFixed(2)}`);
    } else lines.push('Co-op: compact server decisions; paths/timing local-only');
    for (const enemy of enemies) {
      const c = world?.controllers.get(enemy.id), state = enemy.tactical;
      const color = state?.role === 'objective' ? '#ffbb60' : '#ff7493';
      dot(enemy, color);
      if (!c) continue;
      if (this.layer === 0 || this.layer === 1) {
        const [x, y] = at(enemy), p = c.profile;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, p.sight * scale, Math.PI / 2 - enemy.heading - p.fov / 2, Math.PI / 2 - enemy.heading + p.fov / 2); ctx.closePath();
        ctx.strokeStyle = '#71a9e537'; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, p.biologicalRange * scale, 0, 7); ctx.stroke();
        for (const memory of c.memory.targets.values()) if (memory.kind === 'player') dot(memory, '#a5b5ff', 2);
      }
      if (this.layer === 0 || this.layer === 2) {
        line([enemy, ...c.path.slice(c.pathIndex)], '#69a7e7');
        if (c.destination) { line([enemy, c.destination], '#70e0ac70'); dot(c.destination, '#7ce9cf'); }
      }
      if (this.layer === 0 || this.layer === 3) for (const p of c.coverCandidates) dot(p, '#c39aff', 3);
      if (this.layer === 0 || this.layer === 4) {
        ctx.fillStyle = color; const [x, y] = at(enemy); ctx.fillText(`${enemy.id}:${c.role[0]}`, x + 3, y);
      }
    }
    for (const enemy of enemies.slice(0, 5)) {
      const c = world?.controllers.get(enemy.id), s = enemy.tactical;
      if (!s) continue;
      lines.push(`\n#${enemy.id} ${enemy.type} · ${AI_PROFILES[s.archetype]?.name ?? 'scripted'}`,
        `${s.role} / ${s.action} → ${s.target}`, `visible ${s.visible} · attack ${enemy.action}`);
      if (c) {
        lines.push(c.reason, Object.entries(c.scores).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(' '));
        const memory = [...c.memory.targets.values()].find(m => m.kind === 'player');
        if (memory) lines.push(`last seen ${memory.x.toFixed(1)},${memory.z.toFixed(1)} (${memory.source})`);
        if (c.memory.failures.length) lines.push(c.memory.failures.at(-1).reason);
      }
    }
    this.text.textContent = lines.join('\n');
  }
}
