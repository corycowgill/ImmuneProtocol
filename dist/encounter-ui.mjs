// Brief radio notices; incoming breach warnings remain until the group arrives.
import { EncounterNotice } from './hud-layout.mjs';
export class EncounterView {
  constructor(parent, doc = document) { this.parent = parent; this.document = doc; this.notice = new EncounterNotice(); }
  update(sim) {
    const e = sim.encounter;
    const visible = this.notice.update(e, sim.clock) && sim.phase === 'combat' && !sim.tutorial && !sim.airway && !sim.boss && !sim.enemies.some(enemy => enemy.boss);
    if (!visible) { if (this.card) this.card.hidden = true; return; }
    if (!this.card) {
      const doc = this.document;
      this.card = doc.createElement('aside'); this.card.id = 'encounter-card';
      this.card.className = 'encounter-card';
      this.card.setAttribute('aria-label', 'Encounter intelligence');
      this.title = doc.createElement('strong'); this.summary = doc.createElement('div'); this.detail = doc.createElement('small');
      this.card.append(this.title, this.summary, this.detail); this.parent.append(this.card);
    }
    this.card.hidden = false; this.card.dataset.stage = e.stage;
    this.title.textContent = (e.stage === 'warning' && e.reroute ? 'BREACH RELOCATING · ' : '') + e.name.toUpperCase();
    const warning = e.stage === 'warning', holding = e.stage === 'holding';
    this.summary.textContent = e.stage === 'clear' ? 'GROUP NEUTRALIZED' : holding ? `BREACH DELAYED · ${e.nodeName}`
      : warning ? `${Math.ceil(e.remaining)}s · ${e.nodeName}${e.otherNodeName ? ' / DIVERSION: ' + e.otherNodeName : ''}`
      : `${e.pattern === 'feint' ? e.spawned < 3 ? 'DECOY: ' + e.otherNodeName : 'MAIN BREACH: ' + e.nodeName : e.nodeName} · ${e.alive} ${e.alive === 1 ? 'pathogen remains' : 'pathogens remain'}`;
    this.detail.hidden = !(warning || holding);
    this.detail.textContent = holding ? 'The incoming group is holding. Use the opening to regroup.' : e.cue;
  }
}
