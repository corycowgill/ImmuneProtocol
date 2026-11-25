import { uiFrame } from './ui-media.mjs';
import { FIELD_UPGRADES } from './loadouts.mjs';
import { translate } from './i18n.mjs';

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
    if (tag === 'SUMMARY') return { ...base, kind: 'button', text: this.text(el), expanded: el.parentElement.open };
    const title = el.querySelector('strong');
    const all = this.text(el), main = this.text(title) || all || label;
    const detail = FIELD_UPGRADES[el.dataset.upgrade]?.shortDescription ?? (title ? clean(all.replace(main, '')) : '');
    const image = el.querySelector('img');
    if (el.classList.contains('coop-suit')) return { ...base, kind: 'button', variant: 'operator', text: main, detail: this.text(el.querySelector('small')), src: this.resource(image), height: 178, label };
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
    if (el.id === 'deploy-difficulty') return { kind: 'stack', children: [heading('Difficulty'), grid(this.controls('button', el).map(item => ({ ...item, variant: 'tab', height: 44 })), 90, 3), { kind: 'text', text: this.text(el.querySelector('.difficulty-detail')), size: 12 }] };
    if (el.id === 'deploy-intel') {
      const rows = [...el.children], hazard = rows.find(row => row.querySelector('small'));
      const stats = rows.filter(row => row !== hazard).map(row => ({ kind: 'stat', text: this.text(row.querySelector('dt')), detail: this.text(row.querySelector('dd')) }));
      const title = hazard ? clean([...hazard.querySelector('dd').childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ')) : '';
      return { kind: 'stack', children: [grid(stats, 120, 2), ...(hazard ? [heading('Hazard / ' + title), { kind: 'text', text: this.text(hazard.querySelector('small')), size: 14 }] : [])] };
    }
    if (tag === 'DETAILS') {
      const summary = el.querySelector('summary'), control = this.control(summary);
      return { kind: 'stack', children: [control, ...(el.open ? [...el.children].filter(c => c !== summary).map(c => this.block(c, excluded)).filter(Boolean) : [])] };
    }
    if (tag === 'PROGRESS' || el.getAttribute('role') === 'meter') return { kind: 'meter', text: el.getAttribute('aria-label') ?? '', value: el.value ?? Number(el.getAttribute('aria-valuenow')), max: el.max ?? Number(el.getAttribute('aria-valuemax') || 100) };
    if (/^H[1-6]$/.test(tag) || tag === 'LEGEND') return heading(this.text(el));
    if (tag === 'DL') {
      if (el.classList.contains('controls-list')) return { kind: 'stack', children: [...el.children].map(row => ({ kind: 'keyrow', text: this.text(row.querySelector('dt')), detail: clean([...row.querySelector('dd').childNodes].map(n => n.nodeName === 'KBD' ? ' ' + n.textContent + ' ' : n.textContent).join('')), keys: [...row.querySelector('dd').childNodes].map(n => n.nodeName === 'KBD' ? { key: clean(n.textContent) } : { text: clean(n.textContent) }).filter(part => part.key || part.text) })) };
      const children = [...el.children], stats = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i]; if (!this.shown(child)) continue;
        if (child.tagName === 'DT' && children[i + 1]?.tagName === 'DD') { stats.push({ kind: 'stat', text: this.text(child), detail: this.text(children[++i]) }); continue; }
        const dt = child.querySelector('dt'), dd = child.querySelector('dd');
        // Armory rows carry their bar: the current fill, the previewed change and whether it is better.
        const bar = child.querySelector('.gs-bar-fill'), delta = child.querySelector('.gs-bar-delta');
        if (dt && dd) stats.push({ kind: 'stat', text: this.text(dt), detail: this.text(dd),
          ...(bar ? { bar: parseFloat(bar.style.width) / 100 || 0, delta: parseFloat(delta?.style.width) / 100 || 0, change: child.dataset.change ?? 'none' } : {}) });
        else { const block = this.block(child, excluded); if (block) stats.push(block); }
      }
      return grid(stats, 150, 3);
    }
    if (['P', 'LI', 'SMALL', 'DT', 'DD', 'STRONG', 'EM'].includes(tag) && !el.querySelector('button,input,select,canvas,img,dl,ul,ol')) return { kind: 'text', text: this.text(el), size: tag === 'SMALL' ? 12 : 14, color: tag === 'SMALL' ? '#c4b6ad' : undefined };
    const children = [...el.children].map(c => this.block(c, excluded)).filter(Boolean);
    if (!children.length) return !el.children.length && this.text(el) ? { kind: 'text', text: this.text(el), size: 14 } : null;
    if (el.classList.contains('coop-suit-options')) return grid(children, 140, 2);
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
    if (id === 'briefing:skip') return this.get('campaign-briefing').close();
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
    if (id === 'campaign-briefing') return { id, type: 'intro', src: this.resource(root.querySelector('video')), skip: 'briefing:skip', skipLabel: 'Skip briefing' };
    if (id === 'startup-load') return { id, type: 'loading', background: 'assets/loading-patrol.webp', title: this.value('loading-title'), detail: this.value('loading-detail'), eyebrow: this.value('loading-mode'), progress: Number(this.get('startup-progress').value), quote: this.value('loading-quote'), status: this.value('startup-status'), failed: this.shown(this.get('startup-retry')) };
    if (id === 'game') return this.combat(root);
    if (id === 'menu') return { id, type: 'menu', brand: this.control(root.querySelector('.brand')), notices: ['menu-error', 'controller-audio-hint'].map(key => this.shown(this.get(key)) ? this.value(key) : '').filter(Boolean), detail: this.text(root.querySelector('.summary')), buttons: this.controls('.menu-navigation button', root), mute: this.control(root.querySelector('[data-mute]')), settings: this.control(root.querySelector('[data-settings]')), profile: this.get('profile-open') ? { ...this.control(this.get('profile-open')), ...this.profileModel?.chip() } : null, operator: { progress: this.value('operator-progress-value'), best: this.value('operator-best'), difficulty: this.value('operator-difficulty'), primary: this.value('operator-primary'), secondary: this.value('operator-secondary') }, status: [] };
    const model = { id, type: 'dialog', canBack: id !== 'extraction-dialog', background: this.shown(this.get('game')) ? false : 'assets/hero.webp', title: this.text(root.querySelector('h2')) || 'Immune Protocol', kicker: this.text(root.querySelector('.eyebrow,#deploy-mode')), body: [], footer: [] };
    const footerSelectors = {
      'armory-dialog': '#armory-reset,#armory-done', 'mission-dialog': '#deploy-armory,#deploy-practice',
      'pause-dialog': '.pause-actions button', 'settings-dialog': '#settings-close',
      'manual-dialog': '.manual-actions button', 'guide-dialog': '', 'achievements-dialog': '.achievements-actions button',
      'coop-dialog': '#coop-leave,#coop-customize,#coop-ready',
      'extraction-dialog': '#extract-now,#stay-overtime',
      'result-dialog': '#continue-mission,#replay,#restart-from-start,#result-armory,#return-menu',
      'new-campaign-dialog': 'button', 'profile-delete-dialog': 'button', 'profiles-dialog': '#profile-done',
    };
    const footerEls = footerSelectors[id] ? [...root.querySelectorAll(footerSelectors[id])].filter(e => this.shown(e)) : [];
    model.footer = footerEls.map(e => this.control(e));
    if (['manual-dialog', 'achievements-dialog'].includes(id) && model.background === false) model.footer = model.footer.map(item => ({ ...item, text: 'Back to pause', label: 'Back to pause' }));
    const excluded = new Set([...footerEls, root.querySelector('h2'), root.querySelector('.eyebrow,#deploy-mode'), ...root.querySelectorAll('.close-dialog,.deploy-back,#coop-close')].filter(Boolean));
    if (id === 'armory-dialog') {
      model.tabs = this.controls('#armory-modes button');
      model.defaultFocus = model.tabs.find(tab => tab.selected)?.id;
      const canvas = this.get('armory-preview')?.querySelector('canvas');
      model.left = [canvas ? { kind: 'preview', id: this.id(this.get('armory-preview')), action: this.id(this.get('armory-preview')), src: this.resource(canvas), height: 220 } : null, heading(this.value('armory-weapon-name')), { kind: 'text', text: this.value('armory-weapon-detail'), size: 12 }, this.block(this.get('armory-stats'))].filter(Boolean);
      const parts = this.controls('#armory-subtabs button');
      const selected = parts.find(p => p.selected) ?? parts[0];
      model.contextKey = root.dataset.mode + ':' + root.dataset.editing + ':' + selected?.action + ':' + this.value('armory-weapon-name');
      // In Gunsmith and Customize, which item is being edited: either weapon or the auto-turret.
      const items = this.controls('#armory-items button');
      const item = items.find(control => control.selected);
      const editing = items.length ? { kind: 'choice', id: '@armory-item', action: '@armory-item', actionOptions: true, label: 'EDITING', value: item?.action, options: items.map(control => ({ value: control.action, text: control.text })) } : null;
      model.body = [this.block(this.get('coop-armory-status')), editing, parts.length ? { kind: 'choice', id: '@armory-part', action: '@armory-part', actionOptions: true, label: root.dataset.mode === 'gunsmith' ? 'ATTACHMENT SLOT' : root.dataset.mode === 'customize' ? 'FINISH CATEGORY' : 'WEAPON SLOT', value: selected?.action, options: parts.map((p, i) => ({ value: p.action, text: (root.dataset.mode === 'weapons' ? (['Primary · ', 'Secondary · ', 'Companion · ', 'Sealer · '][i] ?? '') : '') + p.text, disabled: p.disabled })) } : heading(this.value('armory-panel-title')), this.block(this.get('armory-options')), this.block(root.querySelector('.armory-loadout'))].filter(Boolean);
    } else if (id === 'mission-dialog') {
      model.defaultFocus = this.id(this.get('deploy-practice'));
      model.sidebar = this.controls('#mission-gallery button').map(item => {
        const number = item.text.match(/\s(\d{2})$/);
        return number ? { ...item, text: item.text.slice(0, -3), badge: number[1] } : item;
      });
      model.selection = model.sidebar.find(b => b.selected)?.text;
      model.body = [this.block(this.get('deploy-hero-art')), heading(this.value('mission-preview-title')), { kind: 'text', text: this.value('mission-preview-detail'), size: 14 }, this.block(this.get('deploy-intel')), heading('Expected pathogens'), this.block(this.get('deploy-threats')), this.block(this.get('deploy-difficulty')), heading(this.value('deploy-upgrade-title')), this.block(this.get('deploy-upgrades')), this.block(this.get('deploy-loadout')), this.block(this.get('mission-error'))].filter(Boolean);
      model.briefing = model.body.slice(0, 6);
      model.configuration = [...model.body.slice(6, 9), this.block(this.get('practice-loadout-detail')), ...model.body.slice(9)].filter(Boolean);
    } else if (id === 'guide-dialog') {
      model.sidebar = this.controls('[data-guide-list] button');
      model.defaultFocus = model.sidebar.find(tab => tab.selected)?.id;
      model.selection = model.sidebar.find(b => b.selected)?.text;
      model.body = [this.block(root.querySelector('[data-guide-viewer]')), this.control(root.querySelector('[data-guide-provoke]')), this.block(root.querySelector('[data-guide-detail]'))].filter(Boolean);
      model.specimen = model.body.slice(0, 2);
      const detail = root.querySelector('[data-guide-detail]'), counterplay = detail.querySelector('.guide-tactics');
      const intelligence = this.blocks(detail, new Set([counterplay]));
      model.intel = [...intelligence.slice(0, 1), ...(counterplay ? [heading('Countermeasures'), this.block(counterplay)] : []), ...intelligence.slice(1)];
      for (const node of model.intel) if (node.kind === 'grid') { node.minColumn = 105; node.maxColumns = 3; }
    } else if (id === 'coop-dialog' && root.dataset.offline === 'true') {
      // No game server: a designed empty state instead of a lone status line.
      model.contextKey = 'offline';
      model.body = [
        { kind: 'heading', text: 'Squad link offline', size: 34 },
        { kind: 'text', text: 'Online co-op runs through the Immune Protocol game server, and this copy of the game was opened without one. Up to three operators can defend the host together once it is running.', size: 15, color: '#a8b7bf' },
        { kind: 'text', text: 'Play online: open the hosted co-op build, or start a local server with npm run serve:coop and open the address it prints.', size: 13, color: '#8fe4dd' },
      ];
    } else if (id === 'coop-dialog' && this.shown(this.get('coop-entry'))) {
      model.contextKey = 'entry';
      model.body = [this.block(this.get('coop-intro')), grid([this.control(this.get('coop-name')), this.control(this.get('coop-code'))], 280, 2), grid([this.control(this.get('coop-create')), this.control(this.get('coop-join')?.querySelector('button'))], 200, 2), this.block(this.get('coop-status'))].filter(Boolean);
    } else if (id === 'coop-dialog') {
      model.contextKey = 'room:' + this.value('coop-room-code');
      model.kicker = 'ROOM ' + this.value('coop-room-code');
      model.left = [this.block(root.querySelector('.coop-bay canvas')), this.block(root.querySelector('.coop-bay-roster')), this.control(this.get('coop-link'))].filter(Boolean);
      model.squadText = [...root.querySelectorAll('.coop-bay-roster li:not(.coop-bay-empty)')].map(row => this.text(row.querySelector('strong')) + ' / ' + this.text(row.querySelector('span'))).join(' · ');
      model.body = [this.block(root.querySelector('.coop-suits')), this.block(this.get('coop-status'))].filter(Boolean);
      const copy = this.control(this.get('coop-copy')); if (copy) model.footer.unshift(copy);
    } else if (id === 'settings-dialog') {
      model.defaultFocus = this.id(this.get('look-sensitivity'));
      model.footer.unshift(this.control(root.querySelector('[data-mute]')));
      // Every group heading and option row in the dialog, in order (game-settings.mjs adds most rows).
      model.settingsGroups = [];
      for (const node of root.querySelector('.settings-list').children) {
        if (node.matches('h3.settings-group')) model.settingsGroups.push({ text: this.text(node), nodes: [] });
        else if (model.settingsGroups.length && this.shown(node)) {
          const items = node.matches('.setting-row')
            ? [...node.querySelectorAll('input,select,button:not([data-mute]),small')].map(el => el.tagName === 'SMALL' ? this.block(el) : this.control(el))
            : [this.block(node)];
          model.settingsGroups.at(-1).nodes.push(...items.filter(Boolean));
        }
      }
      model.body = [grid(model.settingsGroups.flatMap(group => group.nodes.filter(node => node.kind !== 'text')), 280, 2)];
    } else if (id === 'manual-dialog') {
      const controls = [...root.querySelector('.manual-controls').children].filter(el => el.tagName === 'DETAILS'), tactics = [...root.querySelector('.manual-tactics').children].filter(el => el.tagName === 'DETAILS');
      model.views = [{ id: 'controls', text: 'Controls', body: controls.map(el => this.block(el)) }, { id: 'tactics', text: 'Tactics', body: tactics.slice(0, 2).map(el => this.block(el)) }, { id: 'operations', text: 'Operations', body: tactics.slice(2).map(el => this.block(el)) }];
      model.body = model.views[0].body;
    } else if (id === 'profiles-dialog') {
      // Operator cards and emblems come from the profile store; the callsign is the real input, so
      // the platform keyboard edits it.
      const active = this.profileModel?.chip();
      model.contextKey = 'profile:' + (active?.profileId ?? '') + ':' + (active?.name ?? '');
      model.defaultFocus = this.id(root.querySelector('[data-profile-id][aria-checked="true"]') ?? this.get('profile-done'));
      model.left = [{ kind: 'section', text: 'Operators on this device' },
        ...[...root.querySelectorAll('[data-profile-id]')].map(el => ({ ...this.control(el), ...this.profileModel?.card(el.dataset.profileId), kind: 'profile-card', height: 96 })),
        this.control(this.get('profile-new')), this.control(this.get('profile-import'))].filter(Boolean);
      const note = this.value('profile-name-note');
      model.body = [{ kind: 'section', text: 'Active operator' }, this.control(this.get('profile-name')),
        ...(note ? [{ kind: 'text', text: note, size: 13, color: /already|needs|not an|newer|could not|Delete one|no saved/.test(note) ? '#ff977d' : '#a8b7bf' }] : []),
        { kind: 'section', text: 'Language' }, this.control(this.get('profile-language')),
        { kind: 'section', text: 'Emblem' },
        grid([...root.querySelectorAll('[data-emblem]')].map(el => ({ ...this.control(el), kind: 'emblem', color: active?.color, height: 92 })), 82, 7),
        { kind: 'section', text: 'Save data' }, this.control(this.get('profile-export')),
        ...(this.shown(this.get('profile-delete')) ? [{ ...this.control(this.get('profile-delete')), tone: 'danger' }] : []),
      ].filter(Boolean);
    } else if (id === 'profile-delete-dialog') {
      model.body = [this.block(this.get('profile-delete-detail'))].filter(Boolean);
      model.defaultFocus = model.footer[0]?.id;
    } else if (id === 'achievements-dialog') {
      // Built from the achievement record rather than the DOM: cards, art and progress bars.
      const screen = this.achievementModel?.() ?? { views: [], details: {} };
      model.views = screen.views;
      model.details = screen.details;
      model.body = screen.views[0]?.body ?? [];
      model.contextKey = screen.summary ? screen.summary.earned + ':' + screen.summary.points : '';
    } else if (id === 'pause-dialog') {
      model.body = this.blocks(root.querySelector('.pause-info'), new Set([...root.querySelectorAll('h2,.eyebrow')]));
      model.pauseActions = model.footer.map(item => ({ ...item, tone: item.id === 'dom:quit' ? 'danger' : undefined }));
      model.footer = [];
      model.defaultFocus = this.id(this.get('resume'));
    } else if (id === 'new-campaign-dialog') {
      model.body = [this.block(this.get('new-campaign-detail'))].filter(Boolean);
      model.defaultFocus = model.footer[0]?.id;
    } else model.body = this.blocks(root, excluded);
    if (id === 'result-dialog' && this.shown(this.get('campaign-reward'))) {
      const metrics = this.block(this.get('result-stats'))?.children ?? [];
      model.report = { summary: metrics.map(item => ({ ...item, kind: 'keyrow', label: item.text, text: item.text.replace(/tissue average/i, 'Tissue') })), options: this.controls('#campaign-reward [data-upgrade]'), label: 'Choose a field upgrade' };
      model.reportDetails = this.blocks(root, new Set([...excluded, this.get('campaign-reward')]));
    } else if (id === 'extraction-dialog') {
      const metrics = this.block(root.querySelector('.extraction-stats'))?.children ?? [];
      model.report = { summary: metrics.map(item => ({ ...item, kind: 'keyrow', label: item.text, text: item.text.replace(/tissue average/i, 'Tissue').replace(/suit integrity/i, 'Suit').replace(/loaded \/ reserve/i, 'Ammo') })), forecast: [heading('Overtime / ' + this.value('extraction-bonus')), { kind: 'text', text: this.value('extraction-detail'), size: 13 }, { kind: 'text', text: this.text(root.querySelector('.overtime-forecast p')), size: 13 }] };
      model.reportDetails = this.blocks(root, excluded);
    }
    if (this.error) model.body.unshift({ kind: 'text', text: this.error, color: '#ff977d', size: 14 });
    return model;
  }
  combat(root) {
    const t = id => this.value(id), visibleText = id => this.shown(this.get(id)) ? t(id) : '';
    // A callout's title and detail as separate parts, so each translates on its own.
    const partsText = id => {
      const el = this.get(id);
      if (!this.shown(el)) return '';
      return [...el.childNodes].map(node => clean(node.textContent)).filter(Boolean).join(' · ');
    };
    const nodes = [...root.querySelectorAll('[data-tissue-node]')].filter(el => this.shown(el)).map(el => ({ name: this.text(el.querySelector('[data-node-name]')), value: Number(el.querySelector('[data-node-meter]').getAttribute('aria-valuenow')), danger: el.classList.contains('under-attack') || el.classList.contains('critical') }));
    const markers = [...root.querySelectorAll('.objective-marker,.objective-edge,.attacker-marker,.inlet-marker')].filter(el => this.shown(el)).map(el => {
      const edge = el.classList.contains('objective-edge'), quiet = el.classList.contains('quiet') || el.classList.contains('compact');
      return { x: parseFloat(edge ? el.style.getPropertyValue('--objective-x') : el.style.left), y: parseFloat(edge ? el.style.getPropertyValue('--objective-y') : el.style.top), text: this.text(el).replace(/\s*·\s*$/, '').replace(/\s*·?\s*(\d+ m)/, '\n$1'), kind: el.dataset.kind, edge, quiet, angle: edge ? parseFloat(el.style.getPropertyValue('--objective-angle')) : null, attacker: el.classList.contains('attacker-marker'), color: getComputedStyle(el).color };
    }).filter(m => Number.isFinite(m.x + m.y));
    const paths = [...root.querySelectorAll('svg[style*="position:fixed"] path')].filter(el => el.parentElement.style.display !== 'none').map(el => ({ path: el.getAttribute('d') || '', fill: el.getAttribute('fill') === 'none' ? '#0000' : el.getAttribute('fill'), color: el.getAttribute('stroke') }));
    let special = null;
    for (const [id, prefix] of [['boss-hud', 'boss'], ['airway-hud', 'airway'], ['gastric-hud', 'gastric']]) if (this.shown(this.get(id))) {
      const panel = this.get(id);
      special = { title: this.text(panel.querySelector('h2')), detail: [t(prefix + '-status'), visibleText(prefix + '-time'), ...[...panel.querySelectorAll('.airway-port,.gastric-valve')].map(e => this.text(e))].filter(Boolean).join(' · '), phase: t('boss-phase'), health: prefix === 'boss' ? Number(this.get('boss-health').getAttribute('aria-valuenow')) : null };
    }
    const actions = { mute: { ...this.control(root.querySelector('[data-mute]')), text: '', icon: root.querySelector('[data-mute]')?.getAttribute('aria-pressed') === 'true' ? 'muted' : 'volume', iconOnly: true }, pause: { ...this.control(this.get('pause')), icon: 'pause', iconOnly: true } };
    for (const name of ['swap', 'turret', 'reload', 'repair', 'jump', 'dash', 'melee', 'grenade', 'stun']) {
      const el = root.querySelector(`[data-touch="${name}"]`);
      const control = this.control(el); if (control) actions[name] = { ...control, id: 'game:' + name, action: 'game:' + name, color: name === 'turret' ? el.dataset.state === 'jammed' ? '#ff977d' : '#b2e8ff' : undefined };
    }
    return { id: 'game', type: 'combat', touch: !this.get('touch-controls').hidden, actions, hud: {
      nodes, markers, paths, special, health: parseFloat(t('health-value')), ammo: t('ammo-value'), weapon: t('equipment-label'), mode: t('wave-mode'), wave: t('wave-value'), threats: t('threats'), ammoState: t('reload-state'), reload: this.shown(this.get('reload-progress')) ? Number(this.get('reload-progress').value) : 0,
      repair: this.shown(this.get('repair-meter')) ? Number(this.get('repair-meter').getAttribute('aria-valuenow')) : 0,
      ally: visibleText('coop-match-status') || visibleText('coop-hud'), hazard: visibleText('organ-hazard') ? [t('organ-hazard-label'), visibleText('organ-hazard-time')].filter(Boolean).join(' · ') : '', notice: visibleText('encounter-card'), training: visibleText('training-hint') || visibleText('ability-hint'), alert: partsText('game-alert') || partsText('wave-outro'), surge: visibleText('junction-surge'), prompt: visibleText('action-prompt'), score: [...(this.get('scoreboard')?.children ?? [])].map(row => { const [name, points, kills] = [...row.children].map(part => this.text(part)); return `${translate(name)} ${points}  ·  ${translate(kills)}`.toUpperCase(); }).join('     ') || t('scoreboard'),
      magazine: { size: Number(this.get('ammo-value')?.dataset.size) || 0, count: Number(this.get('ammo-value')?.dataset.count) || 0, hidden: !!this.get('ammo-value')?.hidden },
      weaponSlots: [...(this.get('weapon-strip')?.children ?? [])].map(item => ({ key: this.text(item.firstElementChild), name: this.text(item.lastElementChild), active: item.dataset.active === 'true' })).filter(slot => slot.name), turret: t('turret-status-value'), weaponStrip: t('weapon-strip'),
      abilities: this.shown(this.get('ability-hud')) ? (({ grenades, stuns, dash, bash, keys }) => ({ grenades: +grenades, stuns: +stuns, dash: +dash, bash: +bash, keys: (keys ?? '').split('|') }))(this.get('ability-hud').dataset) : null,
      supply: this.shown(this.get('junction-supply')) ? this.controls('[data-junction-supply]') : [], supplyNote: t('junction-supply-note'),
      scope: this.get('scope-overlay')?.dataset.visible === 'true', hit: Number(this.get('hit-marker')?.style.opacity) > 0,
      hitStrength: Number(this.get('hit-marker')?.style.opacity) || 0, crit: !!this.get('hit-marker')?.classList.contains('critical'), kill: Number(this.get('hit-marker')?.dataset.kill) || 0,
      damageBearing: this.get('damage-flash')?.dataset.bearing ? Number(this.get('damage-flash').dataset.bearing) : null, damageStrength: Number(this.get('damage-flash')?.dataset.strength) || 0,
      aiming: this.get('reticle')?.classList.contains('aim'),
      spread: parseFloat(this.get('reticle')?.style.getPropertyValue('--offset')) || 8, damage: Number(this.get('damage-flash')?.style.opacity) || 0,
      muted: root.querySelector('[data-mute]')?.getAttribute('aria-pressed') === 'true', locked: !!document.pointerLockElement,
    } };
  }
}
