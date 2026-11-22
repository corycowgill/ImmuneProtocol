import { CanvasUiRenderer } from './ui-renderer.mjs';
import { BrowserUiBindings } from './ui-bindings.mjs';
import { buildUiScreen } from './ui-screens.mjs';
import { hitTest, inside, nextFocus, clamp, UiPointers } from './ui-core.mjs';
import { enableUiMedia } from './ui-media.mjs';

export class GameUi {
  constructor() {
    this.active = false; this.controls = {}; this.state = { scroll: {}, focus: null, hover: null, showFocus: false, popup: null, stick: { x: 0, z: 0 } };
    this.images = new Map(); this.resourceImages = new WeakSet(); this.kinetic = new Map(); this.dirty = true; this.changed = true; this.lastSnapshot = 0; this.lastPaint = 0;
  }
  bindControls(controls) { this.controls = controls; }
  start() {
    if (this.active) return;
    this.bindings = new BrowserUiBindings();
    this.canvas = document.createElement('canvas'); this.canvas.id = 'game-ui'; this.canvas.tabIndex = -1; this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer = new CanvasUiRenderer(this.canvas, key => this.resource(key));
    this.access = document.createElement('section'); this.access.id = 'game-ui-access'; this.access.setAttribute('aria-label', 'Immune Protocol interface');
    this.editor = document.createElement('input'); this.editor.id = 'game-ui-editor'; this.editor.hidden = true;
    this.editor.autocomplete = 'off'; this.editor.spellcheck = false; this.editor.setAttribute('autocapitalize', 'off');
    this.probe = document.createElement('div'); this.probe.id = 'game-ui-safe-area'; this.probe.setAttribute('aria-hidden', 'true');
    document.body.append(this.canvas, this.access, this.editor, this.probe);
    this.bindings.installDialogs(() => this.invalidate());
    const nativeFocus = HTMLElement.prototype.focus, uiCanvas = this.canvas;
    // Legacy controllers may request focus after opening/closing a screen. UI
    // focus is logical now; keeping browser focus on hidden controls would scroll
    // their old document and expose a duplicate accessibility tree.
    HTMLElement.prototype.focus = function(options) {
      return nativeFocus.call(this.closest('#app,#startup-load,#studio-intro') ? uiCanvas : this, { ...options, preventScroll: true });
    };
    document.documentElement.dataset.ui = 'canvas';
    document.documentElement.setAttribute('translate', 'no');
    for (const el of [document.getElementById('app'), document.getElementById('startup-load'), document.getElementById('studio-intro')]) el?.setAttribute('aria-hidden', 'true');
    this.mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.active = true; enableUiMedia(this.mobile ? 900 : Infinity);
    this.pointers = new UiPointers({
      activate: item => this.activate(item), hold: (name, down) => this.controls.hold?.(name.replace('game:', ''), down),
      stick: value => { this.state.stick = value; this.controls.stick?.(value); this.changed = true; },
      value: (id, value) => { this.bindings.setValue(id, value); this.invalidate(); },
      look: (phase, point, id) => this.controls.look?.(phase, point, id),
      preview: (id, phase, point, pointerId) => {
        const target = this.bindings.actions.get(id); if (!target) return;
        target.dispatchEvent(new PointerEvent({ start: 'pointerdown', move: 'pointermove', end: 'pointerup' }[phase], { pointerId, clientX: point.x, clientY: point.y, pointerType: 'touch', bubbles: false }));
      },
      scroll: (id, delta) => this.scroll(id, delta),
      fling: (id, velocity) => this.kinetic.set(id, { velocity: clamp(velocity, -3000, 3000), time: performance.now() }),
    });
    this.installInput();
    new MutationObserver(records => {
      if (records.some(r => !r.target.closest?.('#game-ui-access,#game-ui-editor,#game-ui,#game-ui-safe-area'))) this.dirty = true;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    document.fonts.ready.then(() => this.invalidate());
    const frame = now => {
      if (!this.combatDriven || this.bindings.active()?.id !== 'game') this.present(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  presentCombat(now) { this.combatDriven = true; this.present(now); }
  present(now) {
    if (!this.active || this.failed) return;
    try { this.frame(now); }
    catch (error) {
      console.error('Could not draw the game interface', error); this.failed = true; this.pointers.clear(); this.controls.clear?.(); this.controls.pause?.();
      this.state.popup = null; this.state.scroll = {}; this.kinetic.clear();
      this.model = { id: 'ui-recovery', type: 'dialog', title: 'Interface interrupted', canBack: false, body: [{ kind: 'text', text: 'Reload the game to continue. Your saved progress is kept.' }], footer: [{ kind: 'button', id: '@reload-ui', action: '@reload-ui', text: 'Reload game', primary: true }] };
      this.scene = buildUiScreen(this.model, this.size ?? { w: innerWidth, h: innerHeight }, this.safe ?? { top: 0, left: 0, right: 0, bottom: 0 }, this.state, this.renderer.measure);
      this.renderer.render(this.scene, this.state); this.canvas.dataset.screen = 'ui-recovery'; this.syncAccess();
    }
  }
  invalidate() { this.dirty = this.changed = this.accessPending = true; }
  resource(key) {
    if (!key) return null;
    const source = this.bindings.resolve(key); if (source) {
      if (source.tagName === 'IMG' && !this.resourceImages.has(source)) {
        this.resourceImages.add(source); source.addEventListener('load', () => { this.changed = true; }); source.addEventListener('error', () => { this.changed = true; });
      }
      if (source.loading === 'lazy') source.loading = 'eager'; return source;
    }
    if (key.startsWith('media:')) return null;
    if (!this.images.has(key)) {
      const image = new Image(); image.decoding = 'async'; image.onload = () => { this.changed = true; }; image.src = key; this.images.set(key, image);
    }
    return this.images.get(key);
  }
  viewport() {
    const view = window.visualViewport;
    const w = Math.round(view?.width || innerWidth), h = Math.round(view?.height || innerHeight);
    const style = getComputedStyle(this.probe);
    this.safe = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
    const key = `${w}:${h}:${devicePixelRatio}:${Object.values(this.safe)}`;
    if (key !== this.sizeKey) {
      this.sizeKey = key; this.size = { w, h }; this.renderer.resize(w, h, this.mobile ? Math.min(2, devicePixelRatio) : devicePixelRatio);
      Object.assign(this.canvas.style, { width: w + 'px', height: h + 'px', left: (view?.offsetLeft || 0) + 'px', top: (view?.offsetTop || 0) + 'px' });
      this.invalidate();
    }
  }
  frame(now) {
    if (!this.active || document.hidden) return;
    this.viewport();
    const root = this.bindings.active(), scope = root?.id;
    if (scope !== this.scope) {
      this.pointers.clear(); this.closeEditor(); this.state.popup = null; this.state.focus = null; this.state.hover = null;
      if (scope === 'game') this.state.showFocus = false;
      this.scope = scope; this.state.scroll = {}; this.kinetic.clear(); this.invalidate();
    }
    const combat = scope === 'game';
    if ((this.dirty && (now - this.lastSnapshot > 65 || this.changed)) || combat || !this.model) {
      this.bindings.actions.clear(); this.bindings.resources.clear();
      const previous = this.model;
      this.model = this.bindings.snapshot();
      if (previous && this.model?.id === previous.id && (this.model.selection !== previous.selection || this.model.contextKey !== previous.contextKey)) { this.state.scroll.body = 0; this.kinetic.clear(); }
      this.lastSnapshot = now; this.dirty = false; this.changed = true;
    }
    if (!this.model) return;
    for (const [id, motion] of this.kinetic) {
      const dt = Math.min(.05, (now - motion.time) / 1000), before = this.state.scroll[id];
      this.scroll(id, motion.velocity * dt); motion.velocity *= Math.exp(-8 * dt); motion.time = now;
      if (Math.abs(motion.velocity) < 18 || before === this.state.scroll[id]) this.kinetic.delete(id);
    }
    const live = combat || this.model.type === 'intro' || this.model.id === 'armory-dialog' || this.model.id === 'guide-dialog' || this.model.id === 'coop-dialog';
    if (!this.changed && (!live || now - this.lastPaint < (combat || this.model.type === 'intro' ? 16 : 32))) return;
    this.scene = buildUiScreen(this.model, this.size, this.safe, this.state, this.renderer.measure);
    if (this.editing) {
      let field = this.scene.hits.find(item => item.id === this.editing.id);
      if (field) {
        const clip = field.clip;
        if (clip && (field.rect.y < clip.y || (field.rect.h <= clip.h && field.rect.y + field.rect.h > clip.y + clip.h))) {
          this.reveal(field); this.scene = buildUiScreen(this.model, this.size, this.safe, this.state, this.renderer.measure);
          field = this.scene.hits.find(item => item.id === this.editing.id);
        }
        this.placeEditor(field);
      }
    }
    this.renderer.render(this.scene, this.state); this.lastPaint = now; this.changed = false;
    this.canvas.dataset.screen = this.model.id; this.canvas.dataset.presentation = 'canvas';
    this.canvas.dataset.overlay = this.state.popup?.id ?? '';
    if (now - (this.lastAccess ?? 0) > 200 || scope !== this.accessScope || this.accessPending) { this.syncAccess(); this.lastAccess = now; this.accessScope = scope; this.accessPending = false; }
  }
  point(event) { const r = this.canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top, pointerType: event.pointerType, button: event.button, buttons: event.buttons, time: event.timeStamp }; }
  hit(point) {
    if (!this.scene) return null;
    return hitTest(this.scene.hits, point.x, point.y) ?? (() => {
      const pane = this.scene.panes.find(p => inside(p.rect, point.x, point.y));
      return pane ? { id: '@scroll:' + pane.id, kind: 'scroll', pane: pane.id, rect: pane.rect } : null;
    })();
  }
  installInput() {
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('selectstart', e => e.preventDefault());
    this.canvas.addEventListener('pointerdown', e => {
      e.preventDefault(); this.state.showFocus = false;
      const point = this.point(e), item = this.hit(point); if (!item) return;
      if (item.pane) this.kinetic.delete(item.pane);
      if (this.editing && item.id !== this.editing.id) this.closeEditor();
      if (e.pointerType === 'mouse' && e.button === 2 && item.kind !== 'look') return;
      this.canvas.setPointerCapture(e.pointerId);
      this.state.focus = item.id; this.changed = true; this.pointers.down(e.pointerId, item, point);
    });
    this.canvas.addEventListener('pointermove', e => {
      const point = this.point(e); this.pointers.move(e.pointerId, point);
      const item = this.hit(point);
      if (e.pointerType === 'mouse' && this.state.hover !== item?.id) {
        const previous = this.bindings.actions.get(this.state.hover); previous?.dispatchEvent(new Event('pointerleave'));
        this.state.hover = item?.id; this.changed = true;
        this.bindings.actions.get(item?.id)?.dispatchEvent(new Event('pointerenter'));
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.canvas.addEventListener(type, e => {
      this.pointers.up(e.pointerId, this.point(e), type !== 'pointerup'); this.changed = true;
    });
    this.canvas.addEventListener('wheel', e => {
      if (this.model?.type === 'combat' && !this.state.popup) { e.preventDefault(); return; }
      e.preventDefault(); const point = this.point(e);
      const pane = this.scene?.panes.find(p => inside(p.rect, point.x, point.y));
      if (pane) { this.kinetic.delete(pane.id); this.scroll(pane.id, e.deltaY * (e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? pane.rect.h : 1)); }
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!this.active || (e.target === this.editor && !['Escape', 'Enter', 'Tab'].includes(e.key))) return;
      if (this.model?.type === 'combat' && !this.state.popup && e.key !== 'Tab' && !(this.state.showFocus && ['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))) { this.state.showFocus = false; return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'Tab', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation(); this.state.showFocus = true;
      if (this.editing) {
        const original = this.bindings.actions.get(this.editing.action);
        this.closeEditor();
        if (e.key === 'Enter' && original?.form) {
          const submit = original.form.querySelector('button[type="submit"]'); if (submit) this.bindings.activate(this.bindings.id(submit)); this.invalidate(); return;
        }
        if (e.key === 'Escape' || e.key === 'Enter') { this.invalidate(); return; }
      }
      this.key(e.key, e.shiftKey);
    }, { capture: true });
    const clear = () => { this.pointers.clear(); this.kinetic.clear(); this.controls.clear?.(); this.changed = true; };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    window.addEventListener('resize', () => this.invalidate());
    window.visualViewport?.addEventListener('resize', () => this.invalidate());
    this.editor.addEventListener('input', () => { if (this.editing) this.bindings.setValue(this.editing.action, this.editor.value); this.invalidate(); });
    this.editor.addEventListener('blur', () => { this.editing = null; this.editor.hidden = true; this.invalidate(); });
  }
  activate(item) {
    if (!item || item.disabled) return;
    if (item.id === '@reload-ui') { location.reload(); return; }
    this.state.focus = item.id;
    if (item.id === '@close-popup') { this.state.popup = null; this.invalidate(); return; }
    if (item.id === '@armory-stats') { this.state.popup = { id: '@armory-stats', label: 'Build stats', body: this.model.left?.slice(3) ?? [] }; this.invalidate(); return; }
    if (item.id?.startsWith('@option:')) {
      const popup = this.state.popup, option = popup?.options[Number(item.id.slice(8))];
      if (!option || option.disabled) return;
      this.state.popup = null; this.state.focus = popup.id;
      if (popup.id === '@sidebar' || popup.actionOptions) this.bindings.activate(option.value); else this.bindings.setValue(popup.action, option.value);
    } else if (item.kind === 'choice') {
      this.kinetic.clear();
      this.state.popup = item; this.state.scroll.popup = 0; this.state.focus = '@option:' + Math.max(0, item.options.findIndex(o => o.value === item.value));
    } else if (item.kind === 'field') return this.openEditor(item);
    else if (item.action?.startsWith('game:')) this.controls.tap?.(item.action.slice(5));
    else this.bindings.activate(item.action ?? item.id);
    this.invalidate();
  }
  scroll(id, delta) {
    const pane = this.scene?.panes.find(p => p.id === id); if (!pane) return;
    this.state.scroll[id] = clamp((this.state.scroll[id] ?? 0) + delta, 0, pane.max); this.changed = true;
  }
  reveal(item) {
    const pane = this.scene.panes.find(p => p.id === item.pane); if (!pane) return;
    const top = item.rect.y, bottom = top + item.rect.h;
    if (top < pane.rect.y || item.rect.h > pane.rect.h) this.scroll(pane.id, top - pane.rect.y);
    else if (bottom > pane.rect.y + pane.rect.h) this.scroll(pane.id, bottom - pane.rect.y - pane.rect.h);
  }
  key(key, shift = false) {
    if (!this.scene) return;
    if (key === 'Escape') { if (this.state.popup) this.state.popup = null; else this.bindings.back(); this.invalidate(); return; }
    const hits = this.scene.hits.filter(h => !h.disabled && h.focusable !== false && !['look', 'stick', 'preview'].includes(h.kind));
    let current = hits.find(h => h.id === this.state.focus);
    if (!current) { current = hits.find(h => h.id === this.model?.defaultFocus) ?? hits.find(h => h.primary || h.selected) ?? hits[0]; if (current) this.state.focus = current.id; }
    if (!current) return;
    if (key === 'Enter' || key === ' ') return this.activate(current);
    const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[key];
    if (current.kind === 'slider' && ['left', 'right'].includes(direction)) {
      this.bindings.setValue(current.action, clamp(Number(current.value) + (direction === 'left' ? -1 : 1) * Number(current.step || 1), current.min, current.max)); this.invalidate(); return;
    }
    if (current.kind === 'choice' && ['left', 'right'].includes(direction)) {
      const options = current.options.filter(o => !o.disabled), i = options.findIndex(o => o.value === current.value);
      const option = options[clamp(i + (direction === 'left' ? -1 : 1), 0, options.length - 1)];
      if (option) { if (current.id === '@sidebar' || current.actionOptions) this.bindings.activate(option.value); else this.bindings.setValue(current.action, option.value); this.invalidate(); }
      return;
    }
    let next;
    if (key === 'Tab') next = hits[(hits.indexOf(current) + (shift ? hits.length - 1 : 1)) % hits.length];
    else if (direction) next = nextFocus(hits, current.id, direction);
    else if (['PageDown', 'PageUp', 'Home', 'End'].includes(key)) {
      const pane = this.scene.panes.find(p => p.id === current.pane) ?? this.scene.panes[0];
      if (pane) this.scroll(pane.id, key === 'Home' ? -Infinity : key === 'End' ? Infinity : pane.rect.h * (key === 'PageUp' ? -.8 : .8));
    }
    if (next) {
      this.state.focus = next.id; this.reveal(next);
      this.bindings.actions.get(next.action)?.dispatchEvent(new Event('focus'));
    }
    this.changed = true;
  }
  menuGamepad(pad, now) {
    if (!this.active || this.bindings.active()?.id === 'game') return false;
    const direction = Math.max(Math.abs(pad.menuX), Math.abs(pad.menuY)) < .55 ? null : Math.abs(pad.menuX) > Math.abs(pad.menuY) ? (pad.menuX < 0 ? 'ArrowLeft' : 'ArrowRight') : (pad.menuY < 0 ? 'ArrowUp' : 'ArrowDown');
    if (!this.state.showFocus) { this.state.showFocus = true; this.changed = true; }
    if (pad.pressed.back || pad.pressed.pause) this.key('Escape');
    else if (pad.pressed.confirm) this.key('Enter');
    else if (direction && (direction !== this.padDirection || now >= (this.padRepeat ?? 0))) {
      this.key(direction); this.padRepeat = now + (direction === this.padDirection ? 115 : 330);
    }
    this.padDirection = direction; return true;
  }
  openEditor(item) {
    this.editing = item; this.state.focus = item.id;
    const editor = this.editor, source = this.bindings.actions.get(item.action);
    editor.type = ['email', 'url', 'number', 'tel'].includes(item.inputType) ? item.inputType : 'text';
    editor.value = String(item.value ?? ''); editor.readOnly = !!item.readOnly;
    if (item.maxLength > 0) editor.maxLength = item.maxLength; else editor.removeAttribute('maxlength');
    editor.inputMode = item.inputMode || 'text'; editor.setAttribute('aria-label', item.label || 'Text');
    editor.enterKeyHint = source?.form ? 'go' : 'done'; editor.autocapitalize = source?.autocapitalize || 'off';
    this.placeEditor(item);
    editor.hidden = false; editor.focus({ preventScroll: true });
    if (source?.type === 'url' && source.readOnly) editor.select();
    this.changed = true;
  }
  placeEditor(item) {
    if (!item) return;
    const r = item.rect, view = window.visualViewport;
    Object.assign(this.editor.style, { left: (r.x + (view?.offsetLeft || 0)) + 'px', top: (r.y + 24 + (view?.offsetTop || 0)) + 'px', width: r.w + 'px', height: '46px' });
  }
  closeEditor() { if (this.editor && !this.editor.hidden) { this.editor.blur(); this.editor.hidden = true; } this.editing = null; }
  syncAccess() {
    const old = new Map([...this.access.children].map(e => [e.dataset.uiId, e]));
    const live = new Set();
    const titleId = '@screen-title', title = this.state.popup?.label || this.model.title || (this.model.type === 'combat' ? 'Mission HUD' : 'Immune Protocol');
    const entries = [{ id: titleId, kind: 'heading', text: title, rect: { x: 0, y: 0, w: 1, h: 1 } }, ...(this.scene.accessDraw ?? this.scene.draw).filter(item => item.text && !(item.kind === 'heading' && item.text === title) && !['panel', 'image', 'preview', 'path', 'scope', 'reticle', 'look', 'scroll'].includes(item.kind)), ...this.scene.hits.filter(item => ['field', 'slider', 'choice', 'stick'].includes(item.kind))];
    entries.forEach((item, index) => {
      const id = item.id ?? '@text:' + index; if (live.has(id)) return; live.add(id);
      const interactive = !!item.action || ['field', 'slider', 'choice', 'stick'].includes(item.kind);
      const tag = item.kind === 'slider' ? 'input' : interactive ? 'button' : item.kind === 'heading' ? 'h2' : 'p';
      let el = old.get(id);
      if (!el || el.tagName.toLowerCase() !== tag) { el?.remove(); el = document.createElement(tag); el.dataset.uiId = id; this.access.append(el); }
      const label = [item.label || item.text, item.kind === 'field' || item.kind === 'slider' ? item.value : item.detail].filter(v => v != null && v !== '').join(': ');
      if (el.textContent !== label && tag !== 'input') el.textContent = label;
      el.setAttribute('aria-label', label || item.id || 'Control');
      if (interactive) {
        el.disabled = !!item.disabled;
        el.onclick = () => { const fresh = this.scene.hits.find(h => h.id === item.id); if (fresh) { this.reveal(fresh); if (fresh.kind === 'hold') { this.controls.hold?.(fresh.action.slice(5), true); this.controls.hold?.(fresh.action.slice(5), false); } else this.activate(fresh); } };
        el.onfocus = () => { this.state.focus = item.id; this.state.showFocus = true; const fresh = this.scene.hits.find(h => h.id === item.id); if (fresh) this.reveal(fresh); this.changed = true; };
        if (tag === 'input') { el.type = 'range'; el.min = item.min; el.max = item.max; el.step = item.step; el.value = item.value; el.oninput = () => { this.bindings.setValue(item.action, el.value); this.invalidate(); }; }
        else el.type = 'button';
        if (item.selected != null) el.setAttribute('aria-pressed', String(item.selected));
      }
      Object.assign(el.style, { left: item.rect.x + 'px', top: item.rect.y + 'px', width: Math.max(1, item.rect.w) + 'px', height: Math.max(1, item.rect.h) + 'px' });
    });
    for (const [id, el] of old) if (!live.has(id)) el.remove();
  }
}
export const gameUi = new GameUi();
