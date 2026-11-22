import { lines, intersect, clamp } from './ui-core.mjs';

export const UI_THEME = Object.freeze({ paper: '#f4f0e8', muted: '#bcaeaa', green: '#c8f794', hot: '#ff977d', teal: '#8fe4dd', panel: '#171719e8', line: '#dac8b347' });
// The renderer consumes only draw commands and a resource resolver. It does not
// query the DOM, change game state, or own input. A native host can replace it.
export class CanvasUiRenderer {
  constructor(canvas, resource) {
    this.canvas = canvas; this.c = canvas.getContext('2d', { alpha: true });
    if (!this.c) throw new Error('The game UI needs a 2D canvas context.');
    this.resource = resource;
    this.measure = (text, size = 14, weight = 500) => { this.font(size, weight); return this.c.measureText(String(text)).width; };
  }
  resize(w, h, ratio) {
    ratio = Math.max(1, ratio || 1);
    const width = Math.max(1, Math.round(w * ratio)), height = Math.max(1, Math.round(h * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    this.ratio = ratio; this.w = w; this.h = h;
  }
  font(size = 14, weight = 500) { this.c.font = `${weight} ${size}px ${weight >= 800 ? '"Barlow Condensed", "Arial Narrow", sans-serif' : '"IBM Plex Mono", monospace'}`; }
  box(r, fill, stroke, radius = 4) {
    const c = this.c; c.beginPath(); c.roundRect(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h), radius);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  text(text, r, size = 14, color = UI_THEME.paper, weight = 500, align = 'left', maxLines = Infinity) {
    if (!text) return;
    const c = this.c; this.font(size, weight); c.fillStyle = color; c.textBaseline = 'top'; c.textAlign = align;
    const list = lines(text, Math.max(8, r.w), this.measure, size, weight);
    this.font(size, weight);
    list.slice(0, maxLines).forEach((line, index) => c.fillText(line, align === 'center' ? r.x + r.w / 2 : align === 'right' ? r.x + r.w : r.x, r.y + index * size * 1.3));
    return Math.min(list.length, maxLines) * size * 1.3;
  }
  image(key, r, cover = false, alpha = 1) {
    const image = this.resource(key);
    if (!image || !(image.naturalWidth ?? image.width) || image.complete === false) return;
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    if (!iw || !ih) return;
    const scale = cover ? Math.max(r.w / iw, r.h / ih) : Math.min(r.w / iw, r.h / ih);
    const c = this.c; c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip(); c.globalAlpha *= alpha;
    try { c.drawImage(image, r.x + (r.w - iw * scale) / 2, r.y + (r.h - ih * scale) / 2, iw * scale, ih * scale); } catch { /* A still-loading/failed optional portrait gets the themed placeholder. */ }
    c.restore();
  }
  render(scene, state) {
    const c = this.c; c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0); c.clearRect(0, 0, this.w, this.h);
    if (scene.background) {
      c.fillStyle = '#120e13'; c.fillRect(0, 0, this.w, this.h);
      this.image(scene.background, { x: 0, y: 0, w: this.w, h: this.h }, true, scene.type === 'menu' ? .65 : .3);
      const shade = c.createLinearGradient(0, 0, this.w, this.h); shade.addColorStop(0, '#0e0e13d9'); shade.addColorStop(1, '#140b1380');
      c.fillStyle = shade; c.fillRect(0, 0, this.w, this.h);
    } else if (scene.modal) { c.fillStyle = '#100d15cf'; c.fillRect(0, 0, this.w, this.h); }
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
    if (kind === 'image' || kind === 'preview') {
      this.box(r, '#15141b80', t.line); this.image(item.src, r, item.cover);
      if (kind === 'preview') this.text('DRAG TO ROTATE', { x: r.x + 12, y: r.y + r.h - 20, w: r.w - 24, h: 16 }, 9, t.muted, 500, 'right');
      return;
    }
    if (kind === 'button' || kind === 'hold') {
      if (item.round) {
        const size = item.size ?? 10;
        this.box(r, item.primary ? '#c8f79485' : active ? '#293127c0' : '#171b165c', item.color ?? (focused ? t.green : '#e9f3cc85'), Math.min(r.w, r.h) / 2);
        this.text(item.text, { x: r.x + 4, y: r.y + (r.h - size * 1.3) / 2, w: r.w - 8, h: r.h - 8 }, size, item.color ?? (item.primary ? '#efffd8' : t.paper), 500, 'center'); return;
      }
      this.box(r, item.primary ? '#c8f794' : active ? '#293127ee' : '#17171bdb', item.selected || focused ? t.green : t.line);
      if (item.selected) this.box({ x: r.x, y: r.y, w: 3, h: r.h }, t.green, null, 0);
      let textRect = inset();
      if (item.src) { this.image(item.src, { x: r.x + 4, y: r.y + 4, w: 72, h: r.h - 8 }); textRect.x += 76; textRect.w -= 76; }
      if (item.swatch) { this.box({ x: r.x + r.w - 34, y: r.y + 10, w: 24, h: 24 }, item.swatch, '#ffffff60'); textRect.w -= 32; }
      const th = this.text(item.text, textRect, item.size ?? 14, item.primary ? '#182013' : t.paper, 600);
      if (item.detail) this.text(item.detail, { ...textRect, y: textRect.y + th + 5 }, 12, item.primary ? '#38432e' : t.muted);
      return;
    }
    if (['field', 'choice', 'slider'].includes(kind)) {
      const labelled = !!item.label, y = r.y + (labelled ? 24 : 0), box = { x: r.x, y, w: r.w, h: 46 };
      if (labelled) this.text(item.label, { x: r.x, y: r.y, w: r.w, h: 20 }, 12, t.muted);
      this.box(box, active ? '#242b24ed' : '#121319ee', focused ? t.green : t.line);
      if (kind === 'slider') {
        const ratio = clamp((Number(item.value) - Number(item.min ?? 0)) / Math.max(.0001, Number(item.max ?? 100) - Number(item.min ?? 0)), 0, 1);
        this.box({ x: r.x + 14, y: y + 29, w: r.w - 28, h: 3 }, '#dac8b33b');
        this.box({ x: r.x + 14, y: y + 29, w: (r.w - 28) * ratio, h: 3 }, t.green);
        c.beginPath(); c.arc(r.x + 14 + (r.w - 28) * ratio, y + 30, 7, 0, Math.PI * 2); c.fillStyle = t.green; c.fill();
        this.text(item.display ?? String(item.value), { x: r.x + 14, y: y + 7, w: r.w - 28, h: 16 }, 11, t.paper, 500, 'right');
      } else {
        this.text(kind === 'choice' ? (item.options?.find(o => o.value === item.value)?.text ?? item.text) : String(item.value || item.placeholder || ''), { x: r.x + 12, y: y + 13, w: r.w - 45, h: 25 }, 14, t.paper, 500, 'left', 1);
        if (kind === 'choice') this.text('⌄', { x: r.x + r.w - 28, y: y + 10, w: 16, h: 20 }, 18, t.green);
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
      this.box(r, '#14141ab8', t.line);
      this.text(item.text, { x: r.x + 10, y: r.y + 8, w: r.w - 20, h: 16 }, 10, t.muted);
      return this.text(item.detail, { x: r.x + 10, y: r.y + 26, w: r.w - 20, h: r.h - 30 }, 16, item.color ?? t.green, 800);
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
    this.text(item.text, r, item.size ?? (kind === 'heading' ? 21 : 14), item.color ?? (kind === 'heading' ? t.green : t.paper), kind === 'heading' ? 800 : item.weight ?? 500, item.align ?? 'left');
  }
}
