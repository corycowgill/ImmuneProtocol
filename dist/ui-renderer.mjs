import { lines, intersect, clamp } from './ui-core.mjs';
import { UI_THEME, uiFace, uiLineHeight } from './ui-theme.mjs';

export { UI_THEME } from './ui-theme.mjs';
// The renderer consumes only draw commands and a resource resolver. It does not
// query the DOM, change game state, or own input. A native host can replace it.
export class CanvasUiRenderer {
  constructor(canvas, resource) {
    this.canvas = canvas; this.c = canvas.getContext('2d', { alpha: true });
    if (!this.c) throw new Error('The game UI needs a 2D canvas context.');
    this.resource = resource;
    this.measure = (text, size = 14, weight = 500, face) => { this.font(size, weight, face); return this.c.measureText(String(text)).width; };
  }
  resize(w, h, ratio) {
    ratio = Math.max(1, ratio || 1);
    const width = Math.max(1, Math.round(w * ratio)), height = Math.max(1, Math.round(h * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    this.ratio = ratio; this.w = w; this.h = h;
  }
  font(size = 14, weight = 500, face) { this.c.font = `${weight} ${size}px ${uiFace(weight, face)}`; }
  box(r, fill, stroke, radius = 2) {
    const c = this.c; c.beginPath(); c.roundRect(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h), radius);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  text(text, r, size = 14, color = UI_THEME.paper, weight = 500, align = 'left', maxLines = Infinity, lineHeight = 1.4, face, tracking = 0) {
    if (!text) return;
    const c = this.c; this.font(size, weight, face); c.fillStyle = color; c.textBaseline = 'top'; c.textAlign = align;
    const metric = value => this.measure(value, size, weight, face) + Math.max(0, value.length - 1) * tracking;
    const list = lines(text, Math.max(8, r.w), metric, size, weight, face);
    this.font(size, weight, face);
    const count = Math.min(list.length, maxLines, r.h > 0 ? Math.max(1, Math.floor(r.h / (size * lineHeight) + .08)) : Infinity);
    list.slice(0, count).forEach((line, index) => {
      const y = r.y + index * size * lineHeight;
      if (!tracking) c.fillText(line, align === 'center' ? r.x + r.w / 2 : align === 'right' ? r.x + r.w : r.x, y);
      else {
        let x = align === 'center' ? r.x + (r.w - metric(line)) / 2 : align === 'right' ? r.x + r.w - metric(line) : r.x;
        c.textAlign = 'left'; for (const char of line) { c.fillText(char, x, y); x += c.measureText(char).width + tracking; } c.textAlign = align;
      }
    });
    return count * size * lineHeight;
  }
  icon(name, r, color = UI_THEME.paper) {
    const c = this.c; c.save(); c.translate(r.x, r.y); c.scale(r.w / 24, r.h / 24); c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color; c.fillStyle = color;
    const paths = {
      arrow: 'M4 12h15M14 6l6 6-6 6', back: 'M20 12H5M10 6l-6 6 6 6', down: 'M6 9l6 6 6-6', close: 'M6 6l12 12M18 6 6 18', check: 'M5 12l4 4L19 6',
      target: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 7a5 5 0 1 0 .01 0',
      users: 'M3 21v-3a5 5 0 0 1 10 0v3M8 4a4 4 0 1 0 .01 0M16 4a4 4 0 0 1 0 8M17 15a5 5 0 0 1 5 5',
      weapon: 'M3 8h15l3 3-3 3H9l-2 6H3l2-8H2V8M10 14v4h4v-4M18 7V4',
      book: 'M12 6C8 3 4 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-4-1-7 0-10 2v15',
      shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6L12 2M12 7v10M7 12h10',
      reset: 'M4 9a8 8 0 1 1 0 7M4 3v6h6',
      volume: 'M3 9h4l5-5v16l-5-5H3V9M16 8a6 6 0 0 1 0 8M19 4a11 11 0 0 1 0 16',
      muted: 'M3 9h4l5-5v16l-5-5H3V9M17 9l6 6M23 9l-6 6',
      pause: 'M8 5v14M16 5v14',
      settings: 'M10 2h4l1 4 3 1 3-1 2 4-3 3v3l1 3-4 3-3-2h-3l-3 2-4-3 1-3v-3L1 10l2-4 3 1 3-1 1-4M12 8a4 4 0 1 0 .01 0',
    };
    const path = paths[name] ?? paths.target; c.stroke(new Path2D(path)); c.restore();
  }
  image(key, r, cover = false, alpha = 1) {
    const image = this.resource(key);
    if (!image || !(image.videoWidth ?? image.naturalWidth ?? image.width) || image.complete === false) return;
    const iw = image.videoWidth || image.naturalWidth || image.width, ih = image.videoHeight || image.naturalHeight || image.height;
    if (!iw || !ih) return;
    const scale = cover ? Math.max(r.w / iw, r.h / ih) : Math.min(r.w / iw, r.h / ih);
    const c = this.c; c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip(); c.globalAlpha *= alpha;
    try { c.drawImage(image, r.x + (r.w - iw * scale) / 2, r.y + (r.h - ih * scale) / 2, iw * scale, ih * scale); } catch { /* A still-loading/failed optional portrait gets the themed placeholder. */ }
    c.restore();
  }
  render(scene, state) {
    const c = this.c; c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0); c.clearRect(0, 0, this.w, this.h);
    if (scene.background) {
      c.fillStyle = UI_THEME.base; c.fillRect(0, 0, this.w, this.h);
      this.image(scene.background, { x: 0, y: 0, w: this.w, h: this.h }, true, scene.type === 'menu' ? .8 : .17);
      const shade = c.createLinearGradient(0, 0, this.w, this.h); shade.addColorStop(0, '#080e13ef'); shade.addColorStop(.48, scene.type === 'menu' ? '#0b131b9c' : '#0b131be6'); shade.addColorStop(1, '#080e1338');
      c.fillStyle = shade; c.fillRect(0, 0, this.w, this.h);
    } else if (scene.modal) { c.fillStyle = '#080e13e8'; c.fillRect(0, 0, this.w, this.h); }
    else if (scene.type === 'intro') { c.fillStyle = '#000'; c.fillRect(0, 0, this.w, this.h); }
    for (const item of scene.draw) {
      const visible = item.clip ? intersect(item.rect, item.clip) : item.rect;
      if (visible.w <= 0 || visible.h <= 0 || visible.y > this.h || visible.y + visible.h < 0) continue;
      c.save();
      if (item.clip) { c.beginPath(); c.rect(item.clip.x, item.clip.y, item.clip.w, item.clip.h); c.clip(); }
      c.globalAlpha = item.disabled ? .4 : item.alpha ?? 1;
      this.item(item, state);
      c.restore();
    }
    for (const pane of scene.panes ?? []) if (pane.max > 0) {
      const thumb = Math.max(24, pane.rect.h * pane.rect.h / (pane.max + pane.rect.h));
      this.box({ x: pane.rect.x + pane.rect.w + 4, y: pane.rect.y + (pane.rect.h - thumb) * pane.offset / pane.max, w: 2, h: thumb }, '#c8f79470');
    }
  }
  item(item, state) {
    const { rect: r, kind } = item, c = this.c, t = UI_THEME;
    const focused = state.focus === item.id && state.showFocus, hot = state.hover === item.id;
    const active = item.selected || focused || hot;
    const inset = (p = 12) => ({ x: r.x + p, y: r.y + p, w: r.w - p * 2, h: r.h - p * 2 });
    if (kind === 'panel') return this.box(r, item.color ?? t.panel, item.border ?? t.line);
    if (kind === 'rule') return this.box(r, item.color ?? t.line, null, 0);
    if (kind === 'section') {
      this.text(item.text.toUpperCase(), { ...r, h: 18 }, 11, t.muted, 600, 'left', 1, 1.3, 'body', 1.4);
      return this.box({ x: r.x, y: r.y + r.h - 3, w: r.w, h: 1 }, t.line, null, 0);
    }
    if (kind === 'icon') return this.icon(item.icon, r, item.color);
    if (kind === 'image' || kind === 'preview') {
      this.box(r, '#0c151cbd', t.line); this.image(item.src, r, item.cover);
      if (item.caption) {
        this.box({ x: r.x, y: r.y + r.h - 34, w: r.w, h: 34 }, '#09121be8', null, 0);
        this.text(item.caption.toUpperCase(), { x: r.x + 12, y: r.y + r.h - 27, w: r.w - 24, h: 26 }, 21, t.paper, 800, 'left', 1, 1.04);
      }
      if (kind === 'preview') {
        this.box({ x: r.x + 12, y: r.y + 12, w: 23, h: 2 }, t.green, null, 0);
        this.text('DRAG TO ROTATE', { x: r.x + 12, y: r.y + r.h - 22, w: r.w - 24, h: 16 }, 10, t.muted, 500, 'right', 1, 1.3, 'mono');
      }
      return;
    }
    if (kind === 'button' || kind === 'hold') {
      if (item.variant === 'operator') {
        this.box(r, active ? '#26382de8' : '#142028d9', focused || item.selected ? t.green : t.line);
        if (item.compact) {
          this.image(item.src, { x: r.x + 5, y: r.y + 5, w: 42, h: r.h - 10 });
          const labelSize = Math.min(13, 13 * (r.w - 62) / Math.max(1, this.measure(item.text, 13, 600)));
          this.text(item.text, { x: r.x + 55, y: r.y + 12, w: r.w - 62, h: 20 }, labelSize, item.selected ? t.green : t.paper, 600, 'left', 1);
          this.text(item.detail, { x: r.x + 55, y: r.y + 35, w: r.w - 62, h: r.h - 38 }, 10, t.muted, 500, 'left', 2);
          if (item.selected) this.box({ x: r.x, y: r.y, w: 3, h: r.h }, t.green, null, 0);
          return;
        }
        this.image(item.src, { x: r.x + 8, y: r.y + 6, w: r.w - 16, h: r.h - 62 });
        this.text(item.text, { x: r.x + 10, y: r.y + r.h - 51, w: r.w - 20, h: 25 }, 23, item.selected ? t.green : t.paper, 800, 'center', 1, 1.04);
        this.text(item.detail, { x: r.x + 8, y: r.y + r.h - 23, w: r.w - 16, h: 18 }, 11, t.muted, 500, 'center', 1);
        if (item.selected) this.icon('check', { x: r.x + r.w - 25, y: r.y + 9, w: 15, h: 15 }, t.green);
        return;
      }
      if (item.round) {
        const size = item.size ?? 10;
        this.box(r, item.primary ? '#c8f79485' : active ? '#293127c0' : '#171b165c', item.color ?? (focused ? t.green : '#e9f3cc85'), Math.min(r.w, r.h) / 2);
        this.text(item.text, { x: r.x + 4, y: r.y + (r.h - size * 1.3) / 2, w: r.w - 8, h: r.h - 8 }, size, item.color ?? (item.primary ? '#efffd8' : t.paper), 500, 'center'); return;
      }
      const tab = item.variant === 'tab', ghost = item.variant === 'ghost', destructive = item.tone === 'danger';
      const fill = item.primary ? destructive ? t.hot : t.green : active ? t.raised : ghost || tab ? '#0000' : '#142028e8';
      this.box(r, fill, focused ? t.green : tab || ghost ? '#0000' : active ? '#c8f79480' : t.line);
      if (tab) this.box({ x: r.x, y: r.y + r.h - 2, w: r.w, h: 2 }, item.selected ? t.green : t.line, null, 0);
      else if (item.selected) this.box({ x: r.x, y: r.y, w: 3, h: r.h }, t.green, null, 0);
      const ink = item.primary ? '#142015' : destructive ? t.hot : t.paper;
      if (item.iconOnly) { this.icon(item.icon, { x: r.x + (r.w - 20) / 2, y: r.y + (r.h - 20) / 2, w: 20, h: 20 }, ink); return; }
      const padding = item.variant === 'reward' ? 8 : 12;
      let textRect = inset(padding);
      if (item.badge) { this.text(item.badge, { x: r.x + 10, y: r.y + (r.h - 16) / 2, w: 24, h: 16 }, 11, item.selected ? t.green : t.faint, 500, 'left', 1, 1.3, 'mono'); textRect.x += 30; textRect.w -= 30; }
      if (item.icon) { this.icon(item.icon, { x: r.x + 13, y: r.y + (r.h - 19) / 2, w: 19, h: 19 }, item.primary ? ink : t.green); textRect.x += 31; textRect.w -= 31; }
      if (item.src) { const tw = item.thumbnail ?? 64; this.image(item.src, { x: r.x + 6, y: r.y + 6, w: tw, h: r.h - 12 }); textRect.x += tw + 12; textRect.w -= tw + 12; }
      if (item.swatch) { this.box({ x: r.x + r.w - 34, y: r.y + 10, w: 24, h: 24 }, item.swatch, '#ffffff60'); textRect.w -= 32; }
      if (item.selected != null && !tab) textRect.w -= 20;
      const size = item.size ?? 16, titleHeight = lines(item.text, textRect.w, this.measure, size, 600).length * size * 1.4;
      if (!item.detail) { textRect.y = r.y + Math.max(8, (r.h - titleHeight) / 2); textRect.h = r.h - (textRect.y - r.y); }
      const th = this.text(item.text, textRect, size, ink, 600);
      if (item.detail) this.text(item.detail, { ...textRect, y: textRect.y + th + 5, h: r.h - padding * 2 - th - 5 }, 13, item.primary ? '#324631' : t.muted);
      if (item.selected && !tab) this.icon('check', { x: r.x + r.w - 27, y: r.y + (r.h - 15) / 2, w: 15, h: 15 }, t.green);
      else if (item.expanded != null) this.icon('down', { x: r.x + r.w - 28, y: r.y + (r.h - 18) / 2, w: 18, h: 18 }, t.muted);
      return;
    }
    if (['field', 'choice', 'slider'].includes(kind)) {
      const labelled = !!item.label, y = r.y + (labelled ? item.compact ? 20 : 24 : 0), box = { x: r.x, y, w: r.w, h: item.compact ? 44 : 46 };
      if (labelled) this.text(item.label, { x: r.x, y: r.y, w: r.w, h: 20 }, 12, t.muted);
      this.box(box, active ? '#23353dee' : '#101b23ee', focused ? t.green : t.line);
      if (kind === 'slider') {
        const ratio = clamp((Number(item.value) - Number(item.min ?? 0)) / Math.max(.0001, Number(item.max ?? 100) - Number(item.min ?? 0)), 0, 1);
        this.box({ x: r.x + 14, y: y + 29, w: r.w - 28, h: 3 }, '#dac8b33b');
        this.box({ x: r.x + 14, y: y + 29, w: (r.w - 28) * ratio, h: 3 }, t.green);
        c.beginPath(); c.arc(r.x + 14 + (r.w - 28) * ratio, y + 30, 7, 0, Math.PI * 2); c.fillStyle = t.green; c.fill();
        this.text(item.display ?? String(item.value), { x: r.x + 14, y: y + 5, w: r.w - 28, h: 18 }, 12, t.paper, 500, 'right', 1, 1.3, 'mono');
      } else {
        this.text(kind === 'choice' ? (item.options?.find(o => o.value === item.value)?.text ?? item.text) : String(item.value || item.placeholder || ''), { x: r.x + 12, y: y + 13, w: r.w - 45, h: 25 }, 14, t.paper, 500, 'left', 1);
        if (kind === 'choice') this.icon('down', { x: r.x + r.w - 29, y: y + 14, w: 17, h: 17 }, t.muted);
      }
      return;
    }
    if (kind === 'meter') {
      this.text(item.text, { ...r, h: 20 }, item.size ?? 12, item.color ?? t.paper);
      this.text(item.detail ?? Math.ceil(item.value) + '%', { ...r, h: 20 }, item.size ?? 12, item.color ?? t.green, 500, 'right');
      this.box({ x: r.x, y: r.y + r.h - 6, w: r.w, h: 3 }, '#e8d8ce38');
      this.box({ x: r.x, y: r.y + r.h - 6, w: r.w * clamp(Number(item.value) / Number(item.max ?? 100), 0, 1), h: 3 }, item.color ?? t.green);
      return;
    }
    if (kind === 'stat') {
      this.box(r, '#142028c9', null);
      this.text(item.text.toUpperCase(), { x: r.x + 12, y: r.y + 10, w: r.w - 24, h: 16 }, 10, t.muted, 600);
      return this.text(item.detail, { x: r.x + 12, y: r.y + 28, w: r.w - 24, h: r.h - 30 }, 24, item.color ?? t.paper, 800, 'left', Infinity, 1.04);
    }
    if (kind === 'keyrow') {
      this.box({ x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 }, t.line, null, 0);
      this.text(item.text, { x: r.x, y: r.y + 12, w: r.w * .4, h: r.h - 12 }, 14, t.muted);
      return this.text(item.detail, { x: r.x + r.w * .44, y: r.y + 12, w: r.w * .56, h: r.h - 12 }, 13, t.paper, 600, 'right');
    }
    if (kind === 'icon-label') {
      this.box(r, '#14141ab8', t.line);
      this.image(item.src, { x: r.x + 5, y: r.y + 5, w: 38, h: r.h - 10 });
      return this.text(item.text, { x: r.x + 50, y: r.y + 12, w: r.w - 58, h: r.h - 16 }, 11, t.paper, 500, 'left', 2);
    }
    if (kind === 'stick') {
      const x = r.x + r.w / 2, y = r.y + r.h / 2;
      c.beginPath(); c.arc(x, y, r.w / 2, 0, Math.PI * 2); c.fillStyle = '#191b143d'; c.fill(); c.strokeStyle = '#d8efbc66'; c.stroke();
      c.beginPath(); c.arc(x + (state.stick?.x ?? 0) * r.w * .34, y - (state.stick?.z ?? 0) * r.w * .34, 18, 0, Math.PI * 2); c.fillStyle = '#c8f7948c'; c.fill(); return;
    }
    if (kind === 'reticle') {
      const x = r.x + r.w / 2, y = r.y + r.h / 2, offset = item.offset ?? 8;
      c.strokeStyle = item.color ?? '#e5f4cb'; c.lineWidth = 1;
      if (item.hit) {
        c.beginPath(); for (const sx of [-1, 1]) for (const sy of [-1, 1]) { c.moveTo(x + sx * 4, y + sy * 4); c.lineTo(x + sx * 10, y + sy * 10); } c.stroke(); return;
      }
      c.beginPath(); for (const sign of [-1, 1]) { c.moveTo(x + sign * offset, y); c.lineTo(x + sign * (offset + 7), y); c.moveTo(x, y + sign * offset); c.lineTo(x, y + sign * (offset + 7)); } c.stroke(); return;
    }
    if (kind === 'path') {
      const path = new Path2D(item.path); c.fillStyle = item.fill; c.strokeStyle = item.color ?? '#ffbf69'; c.lineWidth = 2; c.setLineDash([9, 5]); c.fill(path); c.stroke(path); return;
    }
    if (kind === 'scope') {
      const radius = Math.min(r.w, r.h) * .33, x = r.w / 2, y = r.h / 2;
      c.beginPath(); c.rect(0, 0, r.w, r.h); c.arc(x, y, radius, 0, Math.PI * 2, true); c.fillStyle = '#000'; c.fill('evenodd');
      c.strokeStyle = '#000c'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - radius, y); c.lineTo(x + radius, y); c.moveTo(x, y - radius); c.lineTo(x, y + radius); c.stroke();
      c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); return;
    }
    if (kind === 'label') {
      if (item.box) this.box(r, '#151515c9', item.color ?? '#d4c9aa55', 2);
      return this.text(item.text, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }, item.size ?? 10, item.color ?? t.green, 500, item.align ?? 'center');
    }
    if (kind === 'look' || kind === 'scroll' || kind === 'spacer') return;
    this.text(item.text, r, item.size ?? (kind === 'heading' ? 24 : 15), item.color ?? t.paper, kind === 'heading' ? 800 : item.weight ?? 500, item.align ?? 'left', item.maxLines, uiLineHeight(item), item.face, item.tracking ?? 0);
  }
}
