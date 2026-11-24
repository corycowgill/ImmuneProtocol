import { lines, intersect, clamp } from './ui-core.mjs';
import { UI_THEME, uiFace, uiLineHeight } from './ui-theme.mjs';
import { TIERS } from './achievements.mjs';

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
      trophy: 'M7 3h10v5a5 5 0 0 1-10 0V3M7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4',
      lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3M12 15v2',
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
      // Title and loading screens show their key art; content screens keep it as a faint texture.
      const feature = scene.type === 'menu' || scene.type === 'loading';
      this.image(scene.background, { x: 0, y: 0, w: this.w, h: this.h }, true, scene.type === 'menu' ? .85 : scene.type === 'loading' ? .8 : .17);
      // The text column on the left is shaded for legibility; the art opens up toward the right.
      const shade = c.createLinearGradient(0, 0, this.w, this.h * .35); shade.addColorStop(0, '#080e13f2'); shade.addColorStop(.42, feature ? '#0b131bb0' : '#0b131be6'); shade.addColorStop(1, feature ? '#080e1318' : '#080e1338');
      c.fillStyle = shade; c.fillRect(0, 0, this.w, this.h);
      // A floor fade grounds the footer and progress bar; a top fade frames the header rule.
      const floor = c.createLinearGradient(0, this.h * .62, 0, this.h); floor.addColorStop(0, '#080e1300'); floor.addColorStop(1, '#080e13d8');
      c.fillStyle = floor; c.fillRect(0, this.h * .62, this.w, this.h * .38);
      const ceiling = c.createLinearGradient(0, 0, 0, this.h * .16); ceiling.addColorStop(0, '#080e13a0'); ceiling.addColorStop(1, '#080e1300');
      c.fillStyle = ceiling; c.fillRect(0, 0, this.w, this.h * .16);
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
      // A visible track with a rounded thumb, so scrollbars read as controls rather than stray lines.
      this.box({ x: pane.rect.x + pane.rect.w + 3, y: pane.rect.y, w: 4, h: pane.rect.h }, '#ffffff0f', null, 2);
      this.box({ x: pane.rect.x + pane.rect.w + 3, y: pane.rect.y + (pane.rect.h - thumb) * pane.offset / pane.max, w: 4, h: thumb }, '#c8f794a0', null, 2);
    }
  }
  item(item, state) {
    const { rect: r, kind } = item, c = this.c, t = UI_THEME;
    const focused = state.focus === item.id && state.showFocus, hot = state.hover === item.id;
    const active = item.selected || focused || hot;
    const inset = (p = 12) => ({ x: r.x + p, y: r.y + p, w: r.w - p * 2, h: r.h - p * 2 });
    if (kind === 'panel') return item.hud ? this.hudPanel(r, item) : this.box(r, item.color ?? t.panel, item.border ?? t.line);
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
        // Viewfinder corners and a LIVE tag frame the turntable instead of a stray dash.
        c.strokeStyle = '#c8f79499'; c.lineWidth = 1.5; c.beginPath();
        for (const [px, py, sx, sy] of [[r.x + 10, r.y + 10, 1, 1], [r.x + r.w - 10, r.y + 10, -1, 1], [r.x + 10, r.y + r.h - 10, 1, -1], [r.x + r.w - 10, r.y + r.h - 10, -1, -1]]) {
          c.moveTo(px, py + sy * 14); c.lineTo(px, py); c.lineTo(px + sx * 14, py);
        }
        c.stroke();
        c.fillStyle = '#ff5a4a'; c.beginPath(); c.arc(r.x + 22, r.y + 22, 3, 0, Math.PI * 2); c.fill();
        this.text('LIVE', { x: r.x + 30, y: r.y + 16, w: 40, h: 14 }, 10, t.paper, 700, 'left', 1, 1.2, 'mono');
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
      if (item.variant === 'menu') {
        // A title-menu row: borderless condensed caps over a hairline; hover or focus slides in a
        // lime bar and a fading sweep, like a game menu rather than a form button.
        this.box({ x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 }, '#ffffff16', null, 0);
        if (active) {
          const sweep = c.createLinearGradient(r.x, 0, r.x + r.w, 0);
          sweep.addColorStop(0, '#c8f79430'); sweep.addColorStop(1, '#c8f79400');
          this.box(r, sweep, null, 0);
          this.box({ x: r.x, y: r.y + 6, w: 4, h: r.h - 12 }, t.green, null, 0);
        }
        const shift = active ? 14 : 4;
        if (item.icon) this.icon(item.icon, { x: r.x + shift, y: r.y + (r.h - 20) / 2, w: 20, h: 20 }, active ? t.green : t.muted);
        const size = item.size ?? 22;
        this.text(String(item.text).toUpperCase(), { x: r.x + shift + (item.icon ? 32 : 0), y: r.y + (r.h - size * 1.05) / 2, w: r.w - shift - 40, h: size * 1.2 }, size, active ? '#f4ffe6' : t.paper, 800, 'left', 1, 1.05, undefined, .6);
        return;
      }
      const tab = item.variant === 'tab', ghost = item.variant === 'ghost', destructive = item.tone === 'danger';
      const toggle = !item.primary && !tab && !ghost && !item.detail && /^(.+):\s*(ON|OFF)$/i.exec(item.text ?? '');
      if (toggle) {
        // An ON/OFF setting draws as a labelled switch rather than a button with a status suffix.
        const on = toggle[2].toUpperCase() === 'ON';
        this.box(r, active ? '#1b2a31' : '#101b23e8', focused ? t.green : t.line);
        if (active) this.box({ x: r.x, y: r.y, w: 4, h: r.h }, t.green, null, 0);
        this.text(toggle[1], { x: r.x + 14, y: r.y + (r.h - 22) / 2, w: r.w - 90, h: 22 }, 15, t.paper, 600, 'left', 1);
        const sw = { x: r.x + r.w - 58, y: r.y + r.h / 2 - 11, w: 42, h: 22 };
        this.box(sw, on ? '#c8f794' : '#ffffff1a', on ? null : '#ffffff40', 11);
        c.fillStyle = on ? '#142015' : '#a8b7bf'; c.beginPath(); c.arc(on ? sw.x + sw.w - 11 : sw.x + 11, sw.y + 11, 8, 0, Math.PI * 2); c.fill();
        return;
      }
      const fill = item.primary ? destructive ? t.hot : t.green : active ? t.raised : ghost || tab ? '#0000' : '#142028e8';
      if (item.primary) {
        // Lit from above, with a soft glow while hovered or focused.
        const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, destructive ? '#ffb3a0' : '#dcffb4'); g.addColorStop(1, destructive ? '#e6735c' : '#a9e86f');
        if (active) { c.shadowColor = destructive ? '#ff957e99' : '#c8f79499'; c.shadowBlur = 18; }
        this.box(r, g, focused ? '#f4ffe6' : null);
        c.shadowBlur = 0;
        this.box({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: 1 }, '#ffffff8c', null, 0);
      } else {
        this.box(r, tab || ghost ? fill : (() => { const g = c.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, active ? '#24363e' : '#172630f0'); g.addColorStop(1, active ? '#1b2a31' : '#0f1a21f0'); return g; })(), focused ? t.green : tab || ghost ? '#0000' : active ? '#c8f79480' : t.line);
        if (!tab && !ghost) this.box({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: 1 }, active ? '#c8f79433' : '#ffffff12', null, 0);
      }
      if (tab) this.box({ x: r.x, y: r.y + r.h - 2, w: r.w, h: 2 }, item.selected ? t.green : t.line, null, 0);
      else if (item.selected || (active && !ghost && !item.primary)) this.box({ x: r.x, y: r.y, w: item.selected ? 3 : 4, h: r.h }, t.green, null, 0);
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
      const caps = !item.detail && !item.src && !item.swatch && String(item.text ?? '').length <= 26;
      const th = this.text(caps ? String(item.text).toUpperCase() : item.text, textRect, caps ? size - 1 : size, ink, caps ? 700 : 600, 'left', Infinity, 1.4, undefined, caps ? .5 : 0);
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
    if (kind === 'achievement') return this.achievementCard(item, r, focused || hot);
    if (kind === 'achievement-summary') return this.achievementSummary(item, r);
    if (kind === 'achievement-art') {
      const side = Math.min(r.w, r.h), art = { x: r.x + (r.w - side) / 2, y: r.y, w: side, h: side };
      const tier = TIERS[item.tier] ?? TIERS.bronze;
      if (item.unlocked) { c.save(); c.shadowColor = tier.color; c.shadowBlur = 34; this.box({ x: art.x + 10, y: art.y + 10, w: art.w - 20, h: art.h - 20 }, '#000', null, 6); c.restore(); }
      this.image(item.src, art, false, item.unlocked ? 1 : .38);
      if (!item.unlocked) this.icon('lock', { x: art.x + side / 2 - 22, y: art.y + side / 2 - 22, w: 44, h: 44 }, '#e9f0f2');
      return;
    }
    if (kind === 'meter') {
      this.text(item.text, { ...r, h: 20 }, item.size ?? 12, item.color ?? t.paper);
      this.text(item.detail ?? Math.ceil(item.value) + '%', { ...r, h: 20 }, item.size ?? 12, item.color ?? t.green, 500, 'right');
      const fraction = clamp(Number(item.value) / Number(item.max ?? 100), 0, 1), bar = item.thick ?? 3;
      const track = { x: r.x, y: r.y + r.h - 3 - bar, w: r.w, h: bar };
      if (!item.segments) {
        this.box(track, '#e8d8ce38');
        if (item.glowHead && fraction > 0) { c.shadowColor = item.color ?? t.green; c.shadowBlur = 12; }
        this.box({ ...track, w: r.w * fraction }, item.color ?? t.green);
        c.shadowBlur = 0;
        if (item.glowHead && fraction > 0 && fraction < 1) {
          // A bright moving head on a progress bar.
          const hx = r.x + r.w * fraction, hy = track.y + bar / 2, g = c.createRadialGradient(hx, hy, 0, hx, hy, 14);
          g.addColorStop(0, '#ffffffcc'); g.addColorStop(.3, (item.color ?? t.green) + '99'); g.addColorStop(1, '#00000000');
          c.fillStyle = g; c.fillRect(hx - 14, hy - 14, 28, 28);
        }
        return;
      }
      // A HUD gauge: segmented cells, the filled ones lit with a soft glow, the tip cell partly filled.
      const n = item.segments, gap = 2, cell = (r.w - gap * (n - 1)) / n;
      c.save();
      for (let i = 0; i < n; i++) {
        const fill = clamp(fraction * n - i, 0, 1), cx = r.x + i * (cell + gap);
        this.box({ x: cx, y: track.y, w: cell, h: bar }, '#ffffff1c', null, 1);
        if (fill > 0) { c.shadowColor = item.color ?? t.green; c.shadowBlur = 6; this.box({ x: cx, y: track.y, w: cell * fill, h: bar }, item.color ?? t.green, null, 1); c.shadowBlur = 0; }
      }
      c.restore();
      return;
    }
    if (kind === 'stat') {
      this.box(r, '#142028c9', null);
      this.text(item.text.toUpperCase(), { x: r.x + 12, y: r.y + 10, w: r.w - 24, h: 16 }, 10, t.muted, 600);
      if (item.bar == null) return this.text(item.detail, { x: r.x + 12, y: r.y + 28, w: r.w - 24, h: r.h - 30 }, 24, item.color ?? t.paper, 800, 'left', Infinity, 1.04);
      // An Armory stat: value, the change a previewed part would make, and a bar that fills toward
      // "better", with the gain in green or the loss in red on top of it.
      const better = item.change === 'better', worse = item.change === 'worse';
      const [value, diff] = [item.detail.replace(/[+−]\d.*$/, '').trim(), (item.detail.match(/[+−]\d.*$/) ?? [''])[0]];
      const valueW = this.measure(value, 22, 800);
      this.text(value, { x: r.x + 12, y: r.y + 26, w: r.w - 24, h: 26 }, 22, t.paper, 800, 'left', 1, 1.04);
      if (diff) this.text(diff, { x: r.x + 18 + valueW, y: r.y + 32, w: r.w - 30 - valueW, h: 18 }, 13, better ? t.green : t.hot, 700, 'left', 1, 1.2);
      const track = { x: r.x + 12, y: r.y + r.h - 14, w: r.w - 24, h: 5 };
      this.box(track, '#ffffff14', null, 2);
      this.box({ ...track, w: track.w * Math.max(0, Math.min(1, item.bar)) }, '#c8f794b0', null, 2);
      if (item.delta > 0) this.box({ x: track.x + track.w * item.bar, y: track.y, w: track.w * item.delta, h: track.h }, better ? t.green : worse ? t.hot : t.muted, null, 2);
      return;
    }
    if (kind === 'keyrow' && item.keys?.length) {
      // Bindings as keycaps, right-aligned, with any joining words muted between them.
      this.box({ x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 }, t.line, null, 0);
      this.text(item.text, { x: r.x, y: r.y + 12, w: r.w * .4, h: r.h - 12 }, 14, t.muted);
      let x = r.x + r.w;
      const y = r.y + 9;
      for (const part of [...item.keys].reverse()) {
        if (part.key) {
          const width = Math.max(24, this.measure(part.key, 11, 700, 'mono') + 14);
          x -= width;
          this.box({ x, y: y + 2, w: width, h: 24 }, '#00000066', null, 4);
          this.box({ x, y, w: width, h: 24 }, '#1c2a32', '#ffffff40', 4);
          this.text(part.key, { x, y: y + 5, w: width, h: 16 }, 11, t.paper, 700, 'center', 1, 1.3, 'mono');
          x -= 6;
        } else {
          const width = this.measure(part.text, 12, 500) + 4;
          x -= width;
          this.text(part.text, { x, y: y + 5, w: width, h: 16 }, 12, t.faint, 500, 'left', 1);
          x -= 6;
        }
      }
      return;
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
    if (kind === 'reticle') return this.reticle(item, r);
    if (kind === 'vitals') return this.vitals(item);
    if (kind === 'marker') return this.marker(item, r);
    if (kind === 'ability') return this.ability(item, r);
    if (kind === 'rounds') {
      // One tick per round, spent rounds dim; large magazines fall back to a smooth bar.
      if (item.hidden) return;
      const n = item.size, gap = n > 20 ? 1 : 2, cell = (r.w - gap * (n - 1)) / n;
      if (cell < 1.5) { this.box(r, '#ffffff1c'); this.box({ ...r, w: r.w * item.count / n }, item.color); return; }
      for (let i = 0; i < n; i++) this.box({ x: r.x + r.w - (i + 1) * cell - i * gap, y: r.y, w: cell, h: r.h }, i < item.count ? item.color : '#ffffff1a', null, 1);
      return;
    }
    if (kind === 'slots') {
      // The two carried weapons as key-capped chips, the drawn one lit.
      let x = r.x + r.w;
      for (const slot of [...item.slots].reverse()) {
        const label = slot.name.toUpperCase(), width = this.measure(label, 10, 700) + 34;
        x -= width;
        this.box({ x, y: r.y, w: width, h: r.h }, slot.active ? '#22301ed9' : '#0a0f12b3', slot.active ? t.green : '#ffffff26', 2);
        this.box({ x: x + 6, y: r.y + 5, w: 14, h: r.h - 10 }, null, slot.active ? t.green : '#ffffff55', 2);
        this.text(slot.key, { x: x + 6, y: r.y + 6, w: 14, h: 12 }, 9, slot.active ? t.green : t.muted, 700, 'center', 1, 1.2, 'mono');
        this.text(label, { x: x + 25, y: r.y + 6, w: width - 28, h: 14 }, 10, slot.active ? t.green : t.muted, 700, 'left', 1, 1.2);
        x -= 6;
      }
      return;
    }
    if (kind === 'path') {
      const path = new Path2D(item.path); c.fillStyle = item.fill; c.strokeStyle = item.color ?? '#ffbf69'; c.lineWidth = 2; c.setLineDash([9, 5]); c.fill(path); c.stroke(path); return;
    }
    if (kind === 'scope') return this.scope(r);
    if (kind === 'label' && item.hazard) {
      // A timed organ hazard: an amber warning strip with a hazard glyph, pulsing as it nears.
      const pulse = .75 + .25 * Math.sin(performance.now() / 160);
      const g = c.createLinearGradient(r.x, 0, r.x + r.w, 0); g.addColorStop(0, `rgba(120,64,10,${.75 * pulse})`); g.addColorStop(1, 'rgba(30,18,8,.55)');
      this.box(r, g, '#ffca9655', 2);
      this.box({ x: r.x, y: r.y, w: 3, h: r.h }, item.color, null, 0);
      const tx = r.x + 16, ty = r.y + r.h / 2;
      c.strokeStyle = item.color; c.lineWidth = 1.6; c.lineJoin = 'round'; c.beginPath(); c.moveTo(tx, ty - 7); c.lineTo(tx + 8, ty + 6); c.lineTo(tx - 8, ty + 6); c.closePath(); c.stroke();
      c.fillStyle = item.color; c.fillRect(tx - .8, ty - 3, 1.6, 5); c.fillRect(tx - .8, ty + 3.4, 1.6, 1.6);
      return this.text(item.text.toUpperCase(), { x: r.x + 32, y: r.y + (r.h - (item.size ?? 11) * 1.3) / 2, w: r.w - 38, h: r.h - 4 }, item.size ?? 11, item.color, 700, 'left', 1, 1.3, undefined, .6);
    }
    if (kind === 'label') {
      if (item.box) this.box(r, '#151515c9', item.color ?? '#d4c9aa55', 2);
      return this.text(item.text, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }, item.size ?? 10, item.color ?? t.green, 500, item.align ?? 'center');
    }
    if (kind === 'look' || kind === 'scroll' || kind === 'spacer') return;
    this.text(item.text, r, item.size ?? (kind === 'heading' ? 24 : 15), item.color ?? t.paper, kind === 'heading' ? 800 : item.weight ?? 500, item.align ?? 'left', item.maxLines, uiLineHeight(item), item.face, item.tracking ?? 0);
  }

  // Strokes a path twice: a soft dark outline so it reads on bright tissue, then the colour.
  outlined(draw, color, width = 1.5, outline = .55) {
    const c = this.c;
    c.lineCap = 'round'; c.strokeStyle = `rgba(4,8,10,${outline})`; c.lineWidth = width + 2.2; c.beginPath(); draw(); c.stroke();
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); draw(); c.stroke();
  }
  // The hip-fire crosshair (ticks open with spread, a centre dot) and the hit confirmation over it:
  // white for a hit, amber for a critical, a larger red cross with a ring for a kill.
  reticle(item, r) {
    const c = this.c, x = r.x + r.w / 2, y = r.y + r.h / 2, gap = Math.max(4, item.offset ?? 8);
    if (!item.aiming) {
      this.outlined(() => {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(x + dx * gap, y + dy * gap); c.lineTo(x + dx * (gap + 7), y + dy * (gap + 7)); }
      }, item.color ?? '#eaf8d4', 1.6, .5);
      c.fillStyle = '#04080a8c'; c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = item.color ?? '#eaf8d4'; c.beginPath(); c.arc(x, y, 1.2, 0, Math.PI * 2); c.fill();
    }
    if (!item.hit && !item.kill) return;
    const kill = item.kill || 0, strength = Math.max(item.hit || 0, kill);
    const color = kill ? '#ff5442' : item.crit ? '#ffd36b' : '#ffffff';
    const inner = 5 + (1 - strength) * 3 + kill * 2, outer = inner + 6 + kill * 6;
    c.save(); c.globalAlpha *= Math.min(1, .35 + strength);
    this.outlined(() => {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { c.moveTo(x + sx * inner * .7071, y + sy * inner * .7071); c.lineTo(x + sx * outer * .7071, y + sy * outer * .7071); }
    }, color, kill ? 2.6 : item.crit ? 2.2 : 1.8, .6);
    if (kill) { c.strokeStyle = `rgba(255,84,66,${.55 * kill})`; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, outer + 5 - kill * 4, 0, Math.PI * 2); c.stroke(); }
    c.restore();
  }
  // Screen-edge feedback: a red vignette on each hit, a wedge pointing at where the hit came from,
  // and a slow pulse of dark red at the edges while suit integrity is critical.
  vitals(item) {
    const c = this.c, w = this.w, h = this.h, cx = w / 2, cy = h / 2, diag = Math.hypot(w, h) / 2;
    const now = performance.now() / 1000;
    const low = Number.isFinite(item.health) && item.health <= 30 ? (1 - Math.max(0, item.health) / 30) : 0;
    const pulse = low ? low * (.55 + .45 * Math.sin(now * (3 + low * 3))) : 0;
    const edge = Math.min(.62, (item.damage || 0) * 1.1 + pulse * .5);
    if (edge > .01) {
      const g = c.createRadialGradient(cx, cy, diag * .42, cx, cy, diag * 1.02);
      g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(.55, `rgba(150,8,4,${edge * .45})`); g.addColorStop(1, `rgba(90,0,0,${edge})`);
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    if (item.bearing != null && item.strength > 0) {
      const radius = Math.min(w, h) * .3, a = item.bearing - Math.PI / 2, span = .34;
      const g = c.createRadialGradient(cx, cy, radius - 18, cx, cy, radius + 22);
      g.addColorStop(0, 'rgba(255,60,40,0)'); g.addColorStop(.45, `rgba(255,70,48,${.85 * item.strength})`); g.addColorStop(1, 'rgba(255,60,40,0)');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, radius + 22, a - span, a + span); c.arc(cx, cy, radius - 18, a + span * .7, a - span * .7, true); c.closePath(); c.fill();
      // A sharp chevron at the wedge's centre names the direction.
      const px = cx + Math.cos(a) * (radius + 10), py = cy + Math.sin(a) * (radius + 10);
      c.save(); c.translate(px, py); c.rotate(a);
      c.fillStyle = `rgba(255,214,200,${.9 * item.strength})`; c.beginPath(); c.moveTo(9, 0); c.lineTo(-4, -8); c.lineTo(-1, 0); c.lineTo(-4, 8); c.closePath(); c.fill();
      c.restore();
    }
  }
  // A rifle scope: dark housing, a lens whose rim darkens and tints, thick posts that thin to fine
  // crosshairs with range ticks, and a lit centre dot.
  scope(r) {
    const c = this.c, radius = Math.min(r.w, r.h) * .36, x = r.w / 2, y = r.h / 2;
    c.beginPath(); c.rect(0, 0, r.w, r.h); c.arc(x, y, radius, 0, Math.PI * 2, true); c.fillStyle = '#020304'; c.fill('evenodd');
    const lens = c.createRadialGradient(x - radius * .18, y - radius * .22, radius * .2, x, y, radius);
    lens.addColorStop(0, 'rgba(120,200,255,.04)'); lens.addColorStop(.72, 'rgba(10,30,40,.06)'); lens.addColorStop(.9, 'rgba(0,6,10,.55)'); lens.addColorStop(1, 'rgba(0,0,0,.95)');
    c.fillStyle = lens; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(160,220,255,.16)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, radius - 3, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
    c.fillStyle = '#050607';
    const post = radius * .46, thick = Math.max(3, radius * .018);
    c.fillRect(x - radius, y - thick / 2, radius - post, thick); c.fillRect(x + post, y - thick / 2, radius - post, thick); c.fillRect(x - thick / 2, y + post, thick, radius - post);
    c.strokeStyle = 'rgba(5,6,7,.92)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x - post, y); c.lineTo(x + post, y); c.moveTo(x, y - radius); c.lineTo(x, y + post); c.stroke();
    c.beginPath();
    for (let i = 1; i <= 5; i++) { const d = post * i / 6, l = i % 2 ? 4 : 7; c.moveTo(x - d, y - l); c.lineTo(x - d, y + l); c.moveTo(x + d, y - l); c.lineTo(x + d, y + l); c.moveTo(x - l, y + d); c.lineTo(x + l, y + d); }
    c.stroke();
    const glow = c.createRadialGradient(x, y, 0, x, y, 7); glow.addColorStop(0, 'rgba(255,70,60,.9)'); glow.addColorStop(1, 'rgba(255,40,30,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff4b3e'; c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
  }

  // A combat HUD frame: smoked glass that darkens toward the bottom, a hairline edge, a clipped
  // top-left corner and short accent brackets on the corners.
  // A trophy cup in the tier's metal, like the trophy shown beside console achievements.
  trophy(r, tier) {
    const c = this.c, colors = TIERS[tier] ?? TIERS.bronze;
    c.save(); c.translate(r.x, r.y); c.scale(r.w / 24, r.h / 24);
    const g = c.createLinearGradient(4, 2, 20, 22); g.addColorStop(0, colors.light); g.addColorStop(.45, colors.color); g.addColorStop(1, colors.dark);
    c.fillStyle = g; c.strokeStyle = colors.dark; c.lineWidth = 1.2; c.lineJoin = 'round';
    const cup = new Path2D('M6.5 2.5h11v5.5a5.5 5.5 0 0 1-11 0zM10.6 13.2h2.8v3.6h-2.8zM7.5 17h9l1 4.5h-11z');
    c.fill(cup); c.stroke(cup);
    c.strokeStyle = colors.color; c.lineWidth = 1.6; c.lineCap = 'round';
    c.stroke(new Path2D('M6.5 4.5H4v1.6a3.6 3.6 0 0 0 3.4 3.6M17.5 4.5H20v1.6a3.6 3.6 0 0 1-3.4 3.6'));
    c.fillStyle = '#ffffff90'; c.fillRect(8.4, 3.6, 1.4, 4.2);
    c.restore();
  }
  achievementCard(item, r, active) {
    const c = this.c, t = UI_THEME, tier = TIERS[item.tier] ?? TIERS.bronze, earned = item.unlocked;
    const fill = c.createLinearGradient(r.x, 0, r.x + r.w, 0);
    fill.addColorStop(0, earned ? tier.dark + 'cc' : '#101a21e0'); fill.addColorStop(.45, '#121d25e6'); fill.addColorStop(1, '#0c151ce6');
    this.box(r, fill, null, 0);
    this.hudPanel(r, { accent: active ? t.green : earned ? tier.color : '#5d707a', top: '#00000000', bottom: '#00000000' });
    if (active) { c.strokeStyle = t.green; c.lineWidth = 2; c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
    const side = r.h - 16, art = { x: r.x + 8, y: r.y + 8, w: side, h: side };
    if (earned) { c.save(); c.shadowColor = tier.color; c.shadowBlur = 14; this.box({ x: art.x + 4, y: art.y + 4, w: art.w - 8, h: art.h - 8 }, '#000', null, 4); c.restore(); }
    this.image(item.src, art, false, earned ? 1 : .3);
    if (!earned) {
      this.box({ x: art.x + side / 2 - 17, y: art.y + side / 2 - 17, w: 34, h: 34 }, '#060a0dcc', '#ffffff30', 17);
      this.icon('lock', { x: art.x + side / 2 - 10, y: art.y + side / 2 - 10, w: 20, h: 20 }, '#dfe8ea');
    }
    const x = art.x + side + 14, w = r.x + r.w - 12 - x;
    this.text(item.text, { x, y: r.y + 11, w, h: 22 }, 16, earned ? t.paper : '#c6d1d5', 700, 'left', 1, 1.25);
    this.text(item.detail, { x, y: r.y + 34, w, h: 36 }, 12, earned ? '#b9c7cc' : t.faint, 500, 'left', 2, 1.4);
    const by = r.y + r.h - 25;
    this.trophy({ x, y: by - 1, w: 16, h: 16 }, item.tier);
    const tierText = tier.name.toUpperCase() + '  ·  ' + item.points + ' G';
    this.text(tierText, { x: x + 21, y: by + 1, w: 130, h: 14 }, 10, earned ? tier.color : t.muted, 700, 'left', 1, 1.3, 'mono');
    const rightX = x + 21 + this.measure(tierText, 10, 700, 'mono') + 14, rightW = r.x + r.w - 12 - rightX;
    if (item.progress && rightW > 60) {
      const p = item.progress, label = p.value.toLocaleString() + ' / ' + p.goal.toLocaleString(), lw = this.measure(label, 10, 600, 'mono') + 8;
      const bw = Math.max(20, rightW - lw);
      this.box({ x: rightX, y: by + 5, w: bw, h: 4 }, '#ffffff18', null, 2);
      this.box({ x: rightX, y: by + 5, w: bw * clamp(p.value / p.goal, 0, 1), h: 4 }, tier.color, null, 2);
      this.text(label, { x: rightX + bw + 6, y: by + 1, w: lw, h: 14 }, 10, t.muted, 600, 'left', 1, 1.3, 'mono');
    } else if (item.date && rightW > 60) {
      this.icon('check', { x: r.x + r.w - 26, y: by - 1, w: 15, h: 15 }, tier.color);
      this.text(item.date, { x: rightX, y: by + 1, w: rightW - 22, h: 14 }, 10, t.muted, 600, 'right', 1, 1.3, 'mono');
    }
  }
  achievementSummary(item, r) {
    const c = this.c, t = UI_THEME, wide = r.w >= 560;
    this.hudPanel(r, { accent: '#a6ecff', top: 'rgba(20,34,44,.9)', bottom: 'rgba(8,13,18,.94)' });
    const ring = Math.min(r.h - 28, 96), cx = r.x + 16 + ring / 2, cy = r.y + r.h / 2, rad = ring / 2 - 5;
    c.save(); c.lineCap = 'round';
    c.strokeStyle = '#ffffff16'; c.lineWidth = 8; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.stroke();
    const arc = c.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad); arc.addColorStop(0, '#f2fdff'); arc.addColorStop(1, '#5fd4f5');
    if (item.earned) { c.strokeStyle = arc; c.shadowColor = '#7fe3ff'; c.shadowBlur = 12; c.beginPath(); c.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * item.earned / item.total); c.stroke(); }
    c.restore();
    this.text(item.percent + '%', { x: cx - rad, y: cy - 17, w: rad * 2, h: 30 }, 26, t.paper, 800, 'center', 1, 1.04);
    this.text('COMPLETE', { x: cx - rad, y: cy + 10, w: rad * 2, h: 12 }, 8, t.muted, 700, 'center', 1, 1.2, 'mono', .8);
    const x = r.x + ring + 34, w = r.x + r.w - 16 - x;
    this.text('ACHIEVEMENTS', { x, y: r.y + 18, w, h: 14 }, 10, '#a6ecff', 700, 'left', 1, 1.2, 'body', 1.6);
    this.text(item.earned + ' / ' + item.total + ' EARNED', { x, y: r.y + 36, w: wide ? w * .55 : w, h: 34 }, wide ? 32 : 26, t.paper, 800, 'left', 1, 1.04);
    this.text(item.points.toLocaleString() + ' / ' + item.totalPoints.toLocaleString() + ' G', { x, y: r.y + (wide ? 76 : 68), w, h: 20 }, 15, '#f4c94e', 700, 'left', 1, 1.25, 'mono');
    const tiers = Object.entries(item.tiers);
    if (wide) {
      const tw = Math.min(92, (w * .45) / tiers.length), tx = r.x + r.w - 16 - tw * tiers.length;
      tiers.forEach(([tier, count], i) => {
        const bx = tx + i * tw;
        this.trophy({ x: bx + tw / 2 - 15, y: r.y + 24, w: 30, h: 30 }, tier);
        this.text(count.earned + '/' + count.total, { x: bx, y: r.y + 62, w: tw, h: 20 }, 16, t.paper, 800, 'center', 1, 1.1);
        this.text(TIERS[tier].name.toUpperCase(), { x: bx, y: r.y + 86, w: tw, h: 12 }, 8, TIERS[tier].color, 700, 'center', 1, 1.2, 'mono', .6);
      });
    } else {
      let bx = x;
      for (const [tier, count] of tiers) {
        this.trophy({ x: bx, y: r.y + r.h - 32, w: 16, h: 16 }, tier);
        const label = count.earned + '/' + count.total;
        this.text(label, { x: bx + 19, y: r.y + r.h - 30, w: 50, h: 14 }, 11, t.paper, 700, 'left', 1, 1.2, 'mono');
        bx += 26 + this.measure(label, 11, 700, 'mono');
      }
    }
  }
  // The "achievement unlocked" pop-up. `state` comes from achievement-ui.mjs toastState; the art
  // pops in at the centre, then the banner unrolls to its full width with the name and score.
  achievementToast(state, place) {
    if (!state) return;
    const c = this.c, t = UI_THEME, item = state.item, tier = TIERS[item.tier] ?? TIERS.bronze;
    const compact = place.compact, H = compact ? 64 : 78, W = Math.min(compact ? 380 : 452, place.w - 24), art = H + 10;
    const width = art + (W - art) * state.open, x0 = place.cx - width / 2, y = place.y - state.lift, artY = y + (H - art) / 2;
    c.save(); c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0); c.globalAlpha = state.alpha;
    if (state.open > .02) {
      const panel = { x: x0 + art / 2, y, w: Math.max(0, width - art / 2), h: H };
      c.save(); c.shadowColor = tier.color + '88'; c.shadowBlur = 26; this.box(panel, '#0b141bf2', null, 0); c.restore();
      this.hudPanel(panel, { accent: tier.color, top: 'rgba(24,38,48,.97)', bottom: 'rgba(8,13,18,.98)' });
      const band = c.createLinearGradient(panel.x, 0, panel.x + panel.w, 0); band.addColorStop(0, tier.color + '40'); band.addColorStop(.6, tier.color + '00');
      c.fillStyle = band; c.fillRect(panel.x, panel.y, panel.w, panel.h);
      c.save(); c.beginPath(); c.rect(panel.x, panel.y, panel.w, panel.h); c.clip();
      if (state.shine != null) {
        const sx = panel.x - 80 + (panel.w + 160) * state.shine, g = c.createLinearGradient(sx - 50, 0, sx + 50, 0);
        g.addColorStop(0, '#ffffff00'); g.addColorStop(.5, '#ffffff38'); g.addColorStop(1, '#ffffff00');
        c.fillStyle = g; c.beginPath(); c.moveTo(sx - 30, panel.y); c.lineTo(sx + 60, panel.y); c.lineTo(sx + 30, panel.y + panel.h); c.lineTo(sx - 60, panel.y + panel.h); c.fill();
      }
      c.globalAlpha *= state.text;
      const tx = x0 + art + 14, scoreW = compact ? 58 : 70, tw = x0 + width - tx - scoreW - 8;
      this.trophy({ x: tx, y: y + (compact ? 9 : 12), w: 13, h: 13 }, item.tier);
      this.text(item.tier === 'platinum' ? 'PLATINUM ACHIEVEMENT' : 'ACHIEVEMENT UNLOCKED', { x: tx + 18, y: y + (compact ? 10 : 13), w: tw - 18, h: 13 }, compact ? 9 : 10, tier.color, 700, 'left', 1, 1.2, 'body', 1.4);
      this.text(item.name, { x: tx, y: y + (compact ? 26 : 31), w: tw, h: 28 }, compact ? 21 : 25, t.paper, 800, 'left', 1, 1.04);
      if (!compact) this.text(tier.name.toUpperCase() + (state.waiting ? '  ·  +' + state.waiting + ' MORE' : ''), { x: tx, y: y + 58, w: tw, h: 12 }, 9, t.muted, 600, 'left', 1, 1.2, 'mono', .8);
      const sx = x0 + width - scoreW - 10;
      c.save(); c.shadowColor = tier.color; c.shadowBlur = 10;
      this.text(item.points + 'G', { x: sx, y: y + H / 2 - (compact ? 13 : 16), w: scoreW, h: 34 }, compact ? 24 : 30, tier.light, 800, 'right', 1, 1.04);
      c.restore(); c.restore();
    }
    // The art, popped slightly larger than the banner, with a glow in the tier colour.
    const s = art * state.art, ax = x0 + (art - s) / 2, ay = artY + (art - s) / 2;
    c.save(); c.shadowColor = tier.color; c.shadowBlur = 22; this.box({ x: ax + 4, y: ay + 4, w: s - 8, h: s - 8 }, '#000', null, 4); c.restore();
    this.image(item.art, { x: ax, y: ay, w: s, h: s });
    c.restore();
  }
  hudPanel(r, item) {
    const c = this.c, cut = Math.min(10, r.h / 4), accent = item.accent ?? '#c8f794';
    const shape = () => { c.beginPath(); c.moveTo(r.x + cut, r.y); c.lineTo(r.x + r.w, r.y); c.lineTo(r.x + r.w, r.y + r.h); c.lineTo(r.x, r.y + r.h); c.lineTo(r.x, r.y + cut); c.closePath(); };
    const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, item.top ?? 'rgba(22,32,36,.72)'); g.addColorStop(1, item.bottom ?? 'rgba(6,10,12,.82)');
    shape(); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(200,230,220,.14)'; c.lineWidth = 1; c.stroke();
    c.strokeStyle = accent; c.globalAlpha *= .85; c.lineWidth = 1.5; c.beginPath();
    const k = 9;
    c.moveTo(r.x, r.y + cut + k); c.lineTo(r.x, r.y + cut); c.lineTo(r.x + cut, r.y); c.lineTo(r.x + cut + k, r.y);
    c.moveTo(r.x + r.w - k, r.y + r.h); c.lineTo(r.x + r.w, r.y + r.h); c.lineTo(r.x + r.w, r.y + r.h - k);
    c.stroke();
  }

  // A world marker. In view: a diamond pin under its name and range. At the screen edge: a tag
  // with an arrow on the side facing the target.
  marker(item, r) {
    const c = this.c, color = item.color || UI_THEME.green, size = item.size ?? 11;
    const diamond = (x, y, s, fill) => { c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } c.stroke(); };
    c.save();
    c.shadowColor = 'rgba(0,0,0,.75)'; c.shadowBlur = 4;
    if (item.edge) {
      this.box(r, 'rgba(6,10,12,.72)', null, 2);
      c.shadowBlur = 0;
      this.box({ x: r.x, y: r.y, w: 2, h: r.h }, color, null, 0);
      this.text(item.text, { x: r.x + 8, y: r.y + 4, w: r.w - 12, h: r.h - 6 }, size, color, 600, 'left', 2, 1.3);
      if (Number.isFinite(item.angle)) {
        // The arrow sits outside the tag on the side the target lies.
        const ax = r.x + r.w / 2 + Math.sin(item.angle) * (r.w / 2 + 9), ay = r.y + r.h / 2 - Math.cos(item.angle) * (r.h / 2 + 9);
        c.translate(ax, ay); c.rotate(item.angle);
        c.fillStyle = color; c.beginPath(); c.moveTo(0, -7); c.lineTo(6, 3); c.lineTo(0, 0); c.lineTo(-6, 3); c.closePath(); c.fill();
      }
      c.restore(); return;
    }
    const x = r.x + r.w / 2, base = r.y + r.h;
    c.strokeStyle = color; c.lineWidth = 1.5;
    diamond(x, base - 4, item.quiet ? 3 : 5, 'rgba(6,10,12,.55)');
    c.fillStyle = color; c.beginPath(); c.arc(x, base - 4, 1.4, 0, Math.PI * 2); c.fill();
    if (item.text) this.text(item.text.toUpperCase(), { x: r.x - 10, y: r.y - 6, w: r.w + 20, h: r.h }, size - 1, color, 700, 'center', 2, 1.25, undefined, .6);
    c.restore();
  }

  // An ability tile: key cap, a small drawn icon, and either charge pips or a recharge sweep.
  ability(item, r) {
    const c = this.c, ready = item.charge != null ? item.charge >= 1 : item.count > 0;
    const color = ready ? item.color : '#6f7d76';
    this.hudPanel(r, { accent: ready ? item.color : '#ffffff30', top: 'rgba(22,32,36,.7)', bottom: 'rgba(6,10,12,.82)' });
    const cx = r.x + r.w / 2, cy = r.y + 21, s = 9;
    if (item.charge != null && item.charge < 1) {
      // The unfilled part of the recharge darkens clockwise from the top.
      c.strokeStyle = '#ffffff1f'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 13, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = item.color; c.beginPath(); c.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, item.charge)); c.stroke();
    } else if (ready) { c.shadowColor = item.color; c.shadowBlur = 10; }
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 1.7; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    if (item.icon === 'grenade') { c.arc(cx, cy + 2, s * .72, 0, Math.PI * 2); c.moveTo(cx - 3, cy - 6); c.lineTo(cx + 3, cy - 6); c.moveTo(cx + 3, cy - 6); c.lineTo(cx + 7, cy - 9); }
    else if (item.icon === 'stun') { c.moveTo(cx + 2, cy - s); c.lineTo(cx - 4, cy + 1); c.lineTo(cx + 1, cy + 1); c.lineTo(cx - 2, cy + s); c.lineTo(cx + 5, cy - 2); c.lineTo(cx, cy - 2); c.closePath(); }
    else if (item.icon === 'dash') { for (const dx of [-6, 0, 6]) { c.moveTo(cx + dx - 3, cy - 6); c.lineTo(cx + dx + 3, cy); c.lineTo(cx + dx - 3, cy + 6); } }
    else { c.moveTo(cx - 7, cy + 5); c.lineTo(cx - 7, cy - 2); c.lineTo(cx - 3, cy - 6); c.lineTo(cx + 6, cy - 6); c.lineTo(cx + 7, cy + 5); c.closePath(); c.moveTo(cx - 3, cy - 1); c.lineTo(cx + 4, cy - 1); }
    c.stroke();
    c.shadowBlur = 0;
    if (item.key) {
      this.box({ x: r.x + 3, y: r.y + 3, w: 13, h: 12 }, '#0a0f12cc', '#ffffff40', 2);
      this.text(item.key, { x: r.x + 3, y: r.y + 4, w: 13, h: 11 }, 8, '#d7e6e1', 700, 'center', 1, 1.2, 'mono');
    }
    if (item.max) {
      const n = item.max, pip = 6, total = n * pip + (n - 1) * 3;
      for (let i = 0; i < n; i++) {
        const px = cx - total / 2 + i * (pip + 3);
        this.box({ x: px, y: r.y + r.h - 9, w: pip, h: 4 }, i < item.count ? item.color : '#ffffff22', null, 1);
      }
    }
  }
}
