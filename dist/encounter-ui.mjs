// A persistent, compact radio card; simulation state also survives co-op interpolation/reconnect.
export class EncounterView {
  constructor(parent, doc = document) { this.parent = parent; this.document = doc; }
  update(sim) {
    const e = sim.encounter;
    const visible = e && sim.phase === 'combat' && !sim.tutorial && !sim.airway && !sim.boss && !sim.enemies.some(enemy => enemy.boss);
    if (!visible) { if (this.card) this.card.hidden = true; return; }
    if (!this.card) {
      const doc = this.document;
      this.card = doc.createElement('aside'); this.card.id = 'encounter-card';
      this.card.setAttribute('aria-label', 'Encounter intelligence');
      this.card.style.cssText = 'position:absolute;top:110px;left:50%;transform:translateX(-50%);width:min(460px,calc(100% - 28px));box-sizing:border-box;background:#171817e8;border:1px solid #d6ae69;color:#ffdeb1;border-radius:4px;padding:7px 10px;z-index:7;pointer-events:none;font:12px/1.35 monospace;text-align:center';
      this.title = doc.createElement('strong'); this.summary = doc.createElement('div'); this.detail = doc.createElement('small');
      this.detail.style.cssText = 'display:block;color:#d7dfc8;margin-top:4px';
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
