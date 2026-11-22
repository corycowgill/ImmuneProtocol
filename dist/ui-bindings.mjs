import { uiFrame } from './ui-media.mjs';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const hash = text => { let n = 2166136261; for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0).toString(36); };
const grid = (children, minColumn = 165, maxColumns = 4) => ({ kind: 'grid', children: children.filter(Boolean), minColumn, maxColumns });
const heading = text => ({ kind: 'heading', text, size: 20 });

// Browser compatibility adapter for the existing game controllers. It translates
// their semantic state/actions into plain UI models, never copies DOM layout or
// screenshots. The canvas renderer and layouts have no dependency on this adapter.
export class BrowserUiBindings {
  constructor(doc = document) { this.doc = doc; this.actions = new Map(); this.resources = new Map(); this.dialogs = []; this.error = ''; }
  get(id) { return this.doc.getElementById(id); }
  shown(el) {
    return !!el && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';
  }
  text(el) { return el ? clean(el.innerText || el.textContent) : ''; }
  value(id) { return this.text(this.get(id)); }
  id(el) {
    const parent = el.parentElement?.closest('[id]')?.id ?? 'screen';
    const data = [...Object.entries(el.dataset)].filter(([k]) => !['uiAction', 'gamepadFocus'].includes(k)).map(([k, v]) => k + ':' + v).join('/');
    const title = el.querySelector('strong,summary')?.textContent ?? el.getAttribute('aria-label') ?? el.textContent;
    const id = 'dom:' + (el.id || parent + ':' + hash(el.tagName + data + clean(title)));
    this.actions.set(id, el); return id;
  }
  resource(el) {
    if (!el) return null;
    const key = 'media:' + (el.id || el.getAttribute('data-guide-viewer') != null && 'guide-viewer' || el.src || this.id(el));
    this.resources.set(key, el); return key;
  }
  resolve(key) { const source = this.resources.get(key); return source?.tagName === 'CANVAS' ? uiFrame(source) : source; }
  control(el) {
    if (!this.shown(el)) return null;
    const id = this.id(el), tag = el.tagName;
    const label = el.getAttribute('aria-label') || this.text(el.labels?.[0]) || el.name || el.id;
    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
    const states = ['aria-pressed', 'aria-checked', 'aria-selected'];
    const base = { id, action: id, disabled, selected: states.some(a => el.hasAttribute(a)) ? states.some(a => el.getAttribute(a) === 'true') : undefined };
    if (tag === 'INPUT') {
      if (el.type === 'range') return { ...base, kind: 'slider', label, value: Number(el.value), min: Number(el.min || 0), max: Number(el.max || 100), step: Number(el.step || 1), display: this.value(el.id + '-value') || el.value };
      if (['checkbox', 'radio'].includes(el.type)) return { ...base, kind: 'button', text: label, selected: el.checked };
      return { ...base, kind: 'field', label, value: el.value, placeholder: el.placeholder, readOnly: el.readOnly, maxLength: el.maxLength, inputMode: el.inputMode, inputType: el.type };
    }
    if (tag === 'SELECT') return { ...base, kind: 'choice', label, value: el.value, options: [...el.options].filter(o => !o.hidden).map(o => ({ value: o.value, text: o.text, disabled: o.disabled })) };
    const title = el.querySelector('strong');
    const all = this.text(el), main = this.text(title) || all || label;
    const detail = title ? clean(all.replace(main, '')) : '';
    const image = el.querySelector('img');
    return { ...base, kind: 'button', text: main, detail, swatch: el.querySelector('.gs-swatch')?.style.getPropertyValue('--swatch'), src: image ? this.resource(image) : null, primary: el.classList.contains('primary') || el.classList.contains('menu-campaign'), label: el.getAttribute('aria-label') || main, href: el.href };
  }
  block(el, excluded = new Set()) {
    if (!el || excluded.has(el) || !this.shown(el)) return null;
    const tag = el.tagName;
    if (['SCRIPT', 'STYLE', 'SVG', 'USE', 'BR', 'OUTPUT'].includes(tag) || (el.getAttribute('aria-hidden') === 'true' && !['IMG', 'CANVAS'].includes(tag))) return null;
    if (['BUTTON', 'A', 'SELECT', 'INPUT', 'SUMMARY'].includes(tag)) return this.control(el);
    if (tag === 'IMG' || tag === 'CANVAS') {
      const preview = tag === 'CANVAS' && (el.hasAttribute('data-guide-viewer') || !!el.closest('#armory-preview'));
      return { kind: preview ? 'preview' : 'image', src: this.resource(el), ...(preview ? { id: this.id(el), action: this.id(el) } : {}), height: 210 };
    }
    if (tag === 'LABEL' && el.querySelector('input,select')) return this.control(el.querySelector('input,select'));
    if (tag === 'LABEL' && el.htmlFor) return null;
    if (el.id === 'deploy-threats') return grid([...el.children].map(child => ({ kind: 'icon-label', text: this.text(child), src: this.resource(child.querySelector('img')) })), 170, 4);
    if (el.id === 'deploy-difficulty') return { kind: 'stack', children: [heading('Difficulty'), grid(this.controls('button', el), 120, 3), { kind: 'text', text: this.text(el.querySelector('.difficulty-detail')), size: 12 }] };
    if (tag === 'DETAILS') {
      const summary = el.querySelector('summary'), control = this.control(summary);
      return { kind: 'stack', children: [control, ...(el.open ? [...el.children].filter(c => c !== summary).map(c => this.block(c, excluded)).filter(Boolean) : [])] };
    }
    if (tag === 'PROGRESS' || el.getAttribute('role') === 'meter') return { kind: 'meter', text: el.getAttribute('aria-label') ?? '', value: el.value ?? Number(el.getAttribute('aria-valuenow')), max: el.max ?? Number(el.getAttribute('aria-valuemax') || 100) };
    if (/^H[1-6]$/.test(tag) || tag === 'LEGEND') return heading(this.text(el));
    if (tag === 'DL') {
      const children = [...el.children], stats = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i]; if (!this.shown(child)) continue;
        if (child.tagName === 'DT' && children[i + 1]?.tagName === 'DD') { stats.push({ kind: 'stat', text: this.text(child), detail: this.text(children[++i]) }); continue; }
        const dt = child.querySelector('dt'), dd = child.querySelector('dd');
        if (dt && dd) stats.push({ kind: 'stat', text: this.text(dt), detail: this.text(dd) });
        else { const block = this.block(child, excluded); if (block) stats.push(block); }
      }
      return grid(stats, 150, 3);
    }
    if (['P', 'LI', 'SMALL', 'DT', 'DD', 'STRONG', 'EM'].includes(tag) && !el.querySelector('button,input,select,canvas,img,dl,ul,ol')) return { kind: 'text', text: this.text(el), size: tag === 'SMALL' ? 12 : 14, color: tag === 'SMALL' ? '#c4b6ad' : undefined };
    const children = [...el.children].map(c => this.block(c, excluded)).filter(Boolean);
    if (!children.length) return !el.children.length && this.text(el) ? { kind: 'text', text: this.text(el), size: 14 } : null;
    const group = !['rows', 'weapons'].includes(el.dataset.layout) && (el.getAttribute('role') === 'tablist' || el.getAttribute('role') === 'radiogroup' || /options|choice|mission-list|roster|loadout-row|threats|difficulty-picker/.test(el.className ?? ''));
    return group ? grid(children, el.getAttribute('role') === 'tablist' ? 110 : 175, 4) : { kind: 'stack', children };
  }
  blocks(el, excluded = new Set()) { return [...(el?.children ?? [])].map(c => this.block(c, excluded)).filter(Boolean); }
  controls(selector, root = this.doc) { return [...root.querySelectorAll(selector)].map(e => this.control(e)).filter(Boolean); }
  installDialogs(onChange) {
    const bindings = this, proto = this.doc.defaultView.HTMLDialogElement.prototype;
    const nativeClose = proto.close;
    this.restoreDialogs = () => { proto.showModal = originalShow; proto.close = nativeClose; };
    const originalShow = proto.showModal;
    // Visual/modal ownership is in UiCore. Keep controller close/cancel events and
    // semantic HTML available without opening browser top-layer dialogs above it.
    proto.showModal = function() {
      if (this.open) return;
      this.open = true;
      bindings.dialogs = bindings.dialogs.filter(d => d !== this); bindings.dialogs.push(this);
      onChange();
    };
    proto.close = function(value) {
      if (!this.open) return;
      nativeClose.call(this, value);
      bindings.dialogs = bindings.dialogs.filter(d => d !== this);
      onChange();
    };
    for (const form of this.doc.forms) form.noValidate = true;
  }
  active() {
    const intro = this.get('studio-intro'); if (intro?.open) return intro;
    if (this.shown(this.get('startup-load'))) return this.get('startup-load');
    return [...this.dialogs].reverse().find(d => d.open) ?? [...this.doc.querySelectorAll('dialog[open]')].at(-1) ?? (this.shown(this.get('game')) ? this.get('game') : this.get('menu'));
  }
  back() {
    const root = this.active();
    if (root?.tagName === 'DIALOG') { if (root.dispatchEvent(new Event('cancel', { cancelable: true }))) root.close(); }
  }
  activate(id) {
    if (id === '@back') return this.back();
    if (id === 'intro:skip') return this.get('studio-intro').close();
    if (id === 'loading:retry') return this.get('startup-retry').click();
    const el = this.actions.get(id); if (!el || !this.shown(el) || el.disabled) return;
    this.error = '';
    if (el.tagName === 'SUMMARY') { el.parentElement.open = !el.parentElement.open; return; }
    if (el.type === 'submit' && el.form) {
      const invalid = [...el.form.elements].find(e => e.validity && !e.validity.valid);
      if (invalid) { this.error = invalid.validationMessage; return; }
    }
    el.click();
  }
  setValue(id, value) {
    const el = this.actions.get(id); if (!el || el.disabled || el.readOnly) return;
    el.value = value; this.error = '';
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  snapshot() {
    const root = this.active(); if (!root) return null;
    const id = root.id;
    if (id === 'studio-intro') return { id, type: 'intro', src: this.resource(root.querySelector('canvas')) };
    if (id === 'startup-load') return { id, type: 'loading', background: 'assets/loading-patrol.webp', title: this.value('loading-title'), detail: this.value('loading-detail'), eyebrow: this.value('loading-mode'), progress: Number(this.get('startup-progress').value), quote: this.value('loading-quote'), status: this.value('startup-status'), failed: this.shown(this.get('startup-retry')) };
    if (id === 'game') return this.combat(root);
    if (id === 'menu') return { id, type: 'menu', brand: this.control(root.querySelector('.brand')), notices: ['menu-error', 'controller-audio-hint'].map(key => this.shown(this.get(key)) ? this.value(key) : '').filter(Boolean), detail: this.text(root.querySelector('.summary')), buttons: this.controls('.menu-navigation button', root), mute: { ...this.control(root.querySelector('[data-mute]')), text: '♪' }, settings: { ...this.control(root.querySelector('[data-settings]')), text: '⚙' }, status: [this.block(this.get('operator-card')), ...this.blocks(root.querySelector('.title-footer'))].filter(Boolean) };
    const model = { id, type: 'dialog', canBack: id !== 'extraction-dialog', background: this.shown(this.get('game')) ? false : 'assets/hero.webp', title: this.text(root.querySelector('h2')) || 'Immune Protocol', kicker: this.text(root.querySelector('.eyebrow,#deploy-mode')), body: [], footer: [] };
    const footerSelectors = {
      'armory-dialog': '#armory-reset,#armory-done', 'mission-dialog': '#deploy-armory,#deploy-practice',
      'pause-dialog': '.pause-actions button', 'settings-dialog': '#settings-close',
      'manual-dialog': '.manual-actions button', 'guide-dialog': '',
      'coop-dialog': '#coop-leave,#coop-customize,#coop-ready',
      'extraction-dialog': '#extract-now,#stay-overtime',
      'result-dialog': '#continue-mission,#replay,#restart-from-start,#result-armory,#return-menu',
      'new-campaign-dialog': 'button',
    };
    const footerEls = footerSelectors[id] ? [...root.querySelectorAll(footerSelectors[id])].filter(e => this.shown(e)) : [];
    model.footer = footerEls.map(e => this.control(e));
    if (id === 'manual-dialog' && model.background === false) model.footer = model.footer.map(item => ({ ...item, text: 'Back to pause', label: 'Back to pause' }));
    const excluded = new Set([...footerEls, root.querySelector('h2'), root.querySelector('.eyebrow,#deploy-mode'), ...root.querySelectorAll('.close-dialog,.deploy-back,#coop-close')].filter(Boolean));
    if (id === 'armory-dialog') {
      model.tabs = this.controls('#armory-modes button');
      model.defaultFocus = model.tabs.find(tab => tab.selected)?.id;
      const canvas = this.get('armory-preview')?.querySelector('canvas');
      model.left = [canvas ? { kind: 'preview', id: this.id(this.get('armory-preview')), action: this.id(this.get('armory-preview')), src: this.resource(canvas), height: 220 } : null, heading(this.value('armory-weapon-name')), { kind: 'text', text: this.value('armory-weapon-detail'), size: 12 }, this.block(this.get('armory-stats'))].filter(Boolean);
      const parts = this.controls('#armory-subtabs button');
      const selected = parts.find(p => p.selected) ?? parts[0];
      model.contextKey = root.dataset.mode + ':' + selected?.action + ':' + this.value('armory-weapon-name');
      model.body = [this.block(this.get('coop-armory-status')), parts.length ? { kind: 'choice', id: '@armory-part', action: '@armory-part', actionOptions: true, label: this.value('armory-panel-title'), value: selected?.action, options: parts.map((p, i) => ({ value: p.action, text: (root.dataset.mode === 'weapons' ? (i === 0 ? 'Primary · ' : 'Secondary · ') : '') + p.text, disabled: p.disabled })) } : heading(this.value('armory-panel-title')), this.block(this.get('armory-options')), this.block(root.querySelector('.armory-loadout'))].filter(Boolean);
    } else if (id === 'mission-dialog') {
      model.defaultFocus = this.id(this.get('deploy-practice'));
      model.sidebar = this.controls('#mission-gallery button');
      model.selection = model.sidebar.find(b => b.selected)?.text;
      model.body = [this.block(this.get('deploy-hero-art')), heading(this.value('mission-preview-title')), { kind: 'text', text: this.value('mission-preview-detail'), size: 14 }, this.block(this.get('deploy-intel')), heading('Expected pathogens'), this.block(this.get('deploy-threats')), this.block(this.get('deploy-difficulty')), heading(this.value('deploy-upgrade-title')), this.block(this.get('deploy-upgrades')), this.block(this.get('deploy-loadout')), this.block(this.get('mission-error'))].filter(Boolean);
    } else if (id === 'guide-dialog') {
      model.sidebar = this.controls('[data-guide-list] button');
      model.defaultFocus = model.sidebar.find(tab => tab.selected)?.id;
      model.selection = model.sidebar.find(b => b.selected)?.text;
      model.body = [this.block(root.querySelector('[data-guide-viewer]')), this.control(root.querySelector('[data-guide-provoke]')), this.block(root.querySelector('[data-guide-detail]'))].filter(Boolean);
    } else if (id === 'coop-dialog' && this.shown(this.get('coop-entry'))) {
      model.contextKey = 'entry';
      model.body = [this.block(this.get('coop-intro')), grid([this.control(this.get('coop-name')), this.control(this.get('coop-code'))], 280, 2), grid([this.control(this.get('coop-create')), this.control(this.get('coop-join')?.querySelector('button'))], 200, 2), this.block(this.get('coop-status'))].filter(Boolean);
    } else if (id === 'coop-dialog') {
      model.contextKey = 'room:' + this.value('coop-room-code');
      model.kicker = 'ROOM ' + this.value('coop-room-code');
      model.left = [this.block(root.querySelector('.coop-bay canvas')), this.block(root.querySelector('.coop-bay-roster')), this.control(this.get('coop-link'))].filter(Boolean);
      model.body = [this.block(this.get('coop-intro')), this.block(root.querySelector('.coop-suits')), this.block(this.get('coop-status'))].filter(Boolean);
      const copy = this.control(this.get('coop-copy')); if (copy) model.footer.unshift(copy);
    } else if (id === 'settings-dialog') {
      model.defaultFocus = this.id(this.get('look-sensitivity'));
      model.body = [grid([this.control(this.get('look-sensitivity')), { kind: 'stack', children: [this.control(this.get('graphics-quality')), this.block(this.get('graphics-quality-detail'))].filter(Boolean) }, this.control(this.get('music-volume')), this.control(this.get('effects-volume'))], 280, 2)];
      model.footer.unshift(this.control(root.querySelector('[data-mute]')));
    } else model.body = this.blocks(root, excluded);
    if (this.error) model.body.unshift({ kind: 'text', text: this.error, color: '#ff977d', size: 14 });
    return model;
  }
  combat(root) {
    const t = id => this.value(id), visibleText = id => this.shown(this.get(id)) ? t(id) : '';
    const nodes = [...root.querySelectorAll('[data-tissue-node]')].filter(el => this.shown(el)).map(el => ({ name: this.text(el.querySelector('[data-node-name]')), value: Number(el.querySelector('[data-node-meter]').getAttribute('aria-valuenow')), danger: el.classList.contains('under-attack') || el.classList.contains('critical') }));
    const markers = [...root.querySelectorAll('.objective-marker,.objective-edge,.attacker-marker,.inlet-marker')].filter(el => this.shown(el)).map(el => {
      const edge = el.classList.contains('objective-edge'), quiet = el.classList.contains('quiet') || el.classList.contains('compact');
      return { x: parseFloat(edge ? el.style.getPropertyValue('--objective-x') : el.style.left), y: parseFloat(edge ? el.style.getPropertyValue('--objective-y') : el.style.top), text: this.text(el).replace(/(\d+ m)/, '\n$1'), kind: el.dataset.kind, edge, quiet, attacker: el.classList.contains('attacker-marker'), color: getComputedStyle(el).color };
    }).filter(m => Number.isFinite(m.x + m.y));
    const paths = [...root.querySelectorAll('svg[style*="position:fixed"] path')].filter(el => el.parentElement.style.display !== 'none').map(el => ({ path: el.getAttribute('d') || '', fill: el.getAttribute('fill') === 'none' ? '#0000' : el.getAttribute('fill'), color: el.getAttribute('stroke') }));
    let special = null;
    for (const [id, prefix] of [['boss-hud', 'boss'], ['airway-hud', 'airway'], ['gastric-hud', 'gastric']]) if (this.shown(this.get(id))) {
      const panel = this.get(id);
      special = { title: this.text(panel.querySelector('h2')), detail: [t(prefix + '-status'), visibleText(prefix + '-time'), ...[...panel.querySelectorAll('.airway-port,.gastric-valve')].map(e => this.text(e))].filter(Boolean).join(' · '), phase: t('boss-phase'), health: prefix === 'boss' ? Number(this.get('boss-health').getAttribute('aria-valuenow')) : null };
    }
    const actions = { mute: { ...this.control(root.querySelector('[data-mute]')), text: '♪' }, pause: this.control(this.get('pause')) };
    for (const name of ['swap', 'turret', 'reload', 'repair']) {
      const el = root.querySelector(`[data-touch="${name}"]`);
      const control = this.control(el); if (control) actions[name] = { ...control, id: 'game:' + name, action: 'game:' + name, color: name === 'turret' ? el.dataset.state === 'jammed' ? '#ff977d' : '#b2e8ff' : undefined };
    }
    return { id: 'game', type: 'combat', touch: !this.get('touch-controls').hidden, actions, hud: {
      nodes, markers, paths, special, health: parseFloat(t('health-value')), ammo: t('ammo-value'), weapon: t('equipment-label'), mode: t('wave-mode'), wave: t('wave-value'), threats: t('threats'), ammoState: t('reload-state'), reload: this.shown(this.get('reload-progress')) ? Number(this.get('reload-progress').value) : 0,
      repair: this.shown(this.get('repair-meter')) ? Number(this.get('repair-meter').getAttribute('aria-valuenow')) : 0,
      ally: visibleText('coop-match-status') || visibleText('coop-hud'), hazard: visibleText('organ-hazard') ? [t('organ-hazard-label'), visibleText('organ-hazard-time')].filter(Boolean).join(' · ') : '', notice: visibleText('encounter-card'), training: visibleText('training-hint'), alert: visibleText('game-alert') || visibleText('wave-outro'), surge: visibleText('junction-surge'), prompt: visibleText('action-prompt'), score: t('scoreboard'), turret: t('turret-status-value'), weaponStrip: t('weapon-strip'),
      supply: this.shown(this.get('junction-supply')) ? this.controls('[data-junction-supply]') : [], supplyNote: t('junction-supply-note'),
      scope: this.get('scope-overlay')?.dataset.visible === 'true', hit: Number(this.get('hit-marker')?.style.opacity) > 0,
      aiming: this.get('reticle')?.classList.contains('aim'),
      spread: parseFloat(this.get('reticle')?.style.getPropertyValue('--offset')) || 8, damage: Number(this.get('damage-flash')?.style.opacity) || 0,
      muted: root.querySelector('[data-mute]')?.getAttribute('aria-pressed') === 'true',
    } };
  }
}
