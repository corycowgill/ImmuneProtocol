import { uiLineHeight, uiWeight } from './ui-theme.mjs';
import { CJK, translate } from './i18n.mjs';
// Renderer/host independent UI geometry and input. Coordinates are logical pixels.
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const inside = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
export function intersect(a, b) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}
// Splits a paragraph into the units a line may break between: words, and in Chinese single
// characters (which carry no spaces), keeping any punctuation with the character before it.
function breakUnits(paragraph) {
  if (!CJK.test(paragraph)) return paragraph.split(/\s+/).filter(Boolean).map(word => ({ word, space: true }));
  const units = [];
  for (const piece of paragraph.split(/(\s+)/)) {
    if (!piece) continue;
    if (/^\s+$/.test(piece)) { if (units.length) units[units.length - 1].spaceAfter = true; continue; }
    for (const token of piece.match(/[\u3400-\u9FFF\uF900-\uFAFF][\u3000-\u303F\uFF00-\uFFEF]*|[^\u3400-\u9FFF\uF900-\uFAFF]+/g) ?? []) {
      units.push({ word: token, space: false });
    }
  }
  // A unit is joined to the one before it with a space only where the text had one.
  return units.map((unit, index) => ({ word: unit.word, space: index > 0 && !!units[index - 1].spaceAfter }));
}

// The lines a text wraps to at `width`. The text is translated into the operator's language first.
export function lines(text, width, measure, size = 14, weight = 500, face) {
  const metric = value => measure(value, size, weight, face);
  const out = [];
  for (const paragraph of String(translate(text ?? '') ?? '').split('\n')) {
    let line = '';
    for (const { word, space } of breakUnits(paragraph)) {
      const join = space ? ' ' : '';
      const next = line ? line + join + word : word;
      if (line && metric(next) > width) { out.push(line); line = ''; }
      if (metric(word) > width) {
        for (const char of word) {
          if (line && metric(line + char) > width) { out.push(line); line = ''; }
          line += char;
        }
      } else line = line ? line + join + word : word;
    }
    out.push(line);
  }
  return out;
}
export function rangeValue(item, x) {
  const min = Number(item.min ?? 0), max = Number(item.max ?? 100), step = Number(item.step) || 1;
  const ratio = clamp((x - item.rect.x - 14) / Math.max(1, item.rect.w - 28), 0, 1);
  const n = min + Math.round(ratio * (max - min) / step) * step;
  return Number(clamp(n, min, max).toFixed(6));
}
export function stickValue(rect, x, y) {
  const radius = Math.min(rect.w, rect.h) * .34;
  const dx = x - rect.x - rect.w / 2, dy = y - rect.y - rect.h / 2;
  const divisor = Math.max(radius, Math.hypot(dx, dy));
  return { x: dx / divisor, z: -dy / divisor };
}
export function hitTest(items, x, y) {
  return [...items].reverse().find(item => !item.disabled && inside(item.rect, x, y) && (!item.clip || inside(item.clip, x, y)));
}
export function nextFocus(items, currentId, direction) {
  const controls = items.filter(item => !item.disabled && item.focusable !== false && !['look', 'stick', 'preview'].includes(item.kind));
  const current = controls.find(item => item.id === currentId);
  if (!current) return controls.find(item => item.primary || item.selected) ?? controls[0];
  const vertical = direction === 'up' || direction === 'down', sign = ['left', 'up'].includes(direction) ? -1 : 1;
  const cx = current.rect.x + current.rect.w / 2, cy = current.rect.y + current.rect.h / 2;
  let result, score = Infinity;
  for (const item of controls) {
    const dx = item.rect.x + item.rect.w / 2 - cx, dy = item.rect.y + item.rect.h / 2 - cy;
    const ahead = (vertical ? dy : dx) * sign, across = Math.abs(vertical ? dx : dy);
    if (ahead <= 3) continue;
    const rank = ahead + across * 2;
    if (rank < score) { result = item; score = rank; }
  }
  return result;
}

export class UiLayout {
  constructor(measure, scroll = {}) { this.measure = measure; this.scroll = scroll; this.draw = []; this.hits = []; this.panes = []; }
  add(node, rect, clip, pane) {
    const item = { ...node, rect, clip, pane };
    this.draw.push(item);
    if (node.action || ['button', 'choice', 'slider', 'field', 'stick', 'preview'].includes(node.kind)) this.hits.push(item);
    return item;
  }
  height(node, width) {
    if (node.height != null && !['grid', 'row', 'stack'].includes(node.kind)) return node.height;
    const gap = node.gap ?? 10;
    if (node.kind === 'grid' || node.kind === 'row') {
      const cols = this.columns(node, width), cw = (width - gap * (cols - 1)) / cols;
      let height = 0;
      for (let i = 0; i < node.children.length; i += cols) height += Math.max(...node.children.slice(i, i + cols).map(n => this.height(n, cw))) + gap;
      return Math.max(0, height - gap);
    }
    if (node.kind === 'stack') return Math.max(0, node.children.reduce((h, n) => h + this.height(n, width) + 12, -12));
    if (node.kind === 'image' || node.kind === 'preview') return node.height ?? Math.min(260, width * .57);
    if (node.kind === 'spacer') return node.height ?? 12;
    if (node.kind === 'slider' || node.kind === 'field' || node.kind === 'choice') return node.kind === 'choice' && !node.label ? 48 : node.compact ? 64 : 76;
    if (node.kind === 'meter') return 38;
    if (node.kind === 'icon-label') return 48;
    if (node.kind === 'section') return 28;
    if (node.kind === 'keyrow') return Math.max(44, 24 + Math.max(lines(node.text, width * .4, this.measure, 14).length * 19.6, lines(node.detail, width * .56, this.measure, 13).length * 18.2));
    if (node.kind === 'stat') return Math.max(66, 30 + lines(node.detail, width - 24, this.measure, 24, 800).length * 25);
    const pad = node.kind === 'button' ? 12 : 0;
    const size = node.size ?? (node.kind === 'heading' ? 21 : 14);
    const inner = Math.max(20, width - pad * 2 - (node.src ? (node.thumbnail ?? 64) + 12 : 0) - (node.swatch ? 32 : 0) - (node.icon ? 32 : 0) - (node.badge ? 30 : 0) - (node.selected != null ? 18 : 0));
    const title = lines(node.text, inner, this.measure, size, uiWeight(node), node.face).length * size * uiLineHeight(node);
    const detail = node.detail ? lines(node.detail, inner, this.measure, 13).length * 18.2 + 5 : 0;
    return Math.max(node.kind === 'button' ? 48 : 0, title + detail + pad * 2);
  }
  columns(node, width) { return node.kind === 'row' ? Math.max(1, node.children.length) : Math.max(1, Math.min(node.children.length, node.maxColumns ?? 6, Math.floor((width + (node.gap ?? 10)) / (node.minColumn ?? 170)))); }
  flow(nodes, rect, clip = rect, pane) {
    let y = rect.y;
    for (const node of nodes.filter(Boolean)) {
      const h = Math.max(0, this.height(node, rect.w));
      if (node.kind === 'stack') this.flow(node.children, { x: rect.x, y, w: rect.w, h }, clip, pane);
      else if (node.kind === 'grid' || node.kind === 'row') {
        const cols = this.columns(node, rect.w), gap = node.gap ?? 10, cw = (rect.w - gap * (cols - 1)) / cols;
        let gy = y;
        for (let i = 0; i < node.children.length; i += cols) {
          const row = node.children.slice(i, i + cols), rh = Math.max(...row.map(n => this.height(n, cw)));
          row.forEach((child, j) => {
            const r = { x: rect.x + j * (cw + gap), y: gy, w: cw, h: rh };
            if (['stack', 'grid', 'row'].includes(child.kind)) this.flow([child], r, clip, pane);
            else this.add(child, r, clip, pane);
          });
          gy += rh + gap;
        }
      } else this.add(node, { x: rect.x, y, w: rect.w, h }, clip, pane);
      y += h + 12;
    }
    return Math.max(0, y - rect.y - 12);
  }
  pane(id, nodes, rect) {
    const start = this.draw.length, hitStart = this.hits.length;
    const contentHeight = this.flow(nodes, { ...rect, y: rect.y - (this.scroll[id] ?? 0) }, rect, id);
    const max = Math.max(0, contentHeight - rect.h);
    const offset = clamp(this.scroll[id] ?? 0, 0, max);
    const correction = (this.scroll[id] ?? 0) - offset;
    // The draw and hit arrays share item objects; translate each item exactly once.
    if (correction) for (const item of this.draw.slice(start)) item.rect.y += correction;
    this.scroll[id] = offset;
    this.panes.push({ id, rect, max, offset });
    return { start, hitStart, contentHeight };
  }
}

// Pointer ownership survives multiple fingers, leaving a button and pointer cancellation.
export class UiPointers {
  constructor(host) { this.host = host; this.pointers = new Map(); }
  down(id, item, point) {
    this.cancel(id);
    this.pointers.set(id, { item, start: point, last: point, moved: false });
    if (item.kind === 'hold' && ![...this.pointers.entries()].some(([key, p]) => key !== id && p.item.action === item.action)) this.host.hold(item.action, true);
    if (item.kind === 'stick') this.host.stick(stickValue(item.rect, point.x, point.y));
    if (item.kind === 'slider') this.host.value(item.action, rangeValue(item, point.x));
    if (item.kind === 'look') this.host.look('start', point, id);
    if (item.kind === 'preview') this.host.preview(item.action, 'start', point, id);
  }
  move(id, point) {
    const p = this.pointers.get(id); if (!p) return;
    p.moved ||= Math.hypot(point.x - p.start.x, point.y - p.start.y) > 8;
    if (p.item.kind === 'stick') this.host.stick(stickValue(p.item.rect, point.x, point.y));
    if (p.item.kind === 'slider') this.host.value(p.item.action, rangeValue(p.item, point.x));
    if (p.item.kind === 'look') this.host.look('move', point, id);
    if (p.item.kind === 'preview') this.host.preview(p.item.action, 'move', point, id);
    if (p.moved && p.item.pane && !['stick', 'hold', 'slider', 'look', 'preview'].includes(p.item.kind)) {
      const dt = Math.max(8, (point.time ?? 16) - (p.last.time ?? 0));
      p.velocity = (p.velocity ?? 0) * .5 + (p.last.y - point.y) / dt * 500;
      this.host.scroll(p.item.pane, p.last.y - point.y);
    }
    p.last = point;
  }
  up(id, point, cancelled = false) {
    const p = this.pointers.get(id); if (!p) return;
    this.pointers.delete(id);
    const item = p.item;
    if (item.kind === 'hold' && ![...this.pointers.values()].some(p => p.item.action === item.action)) this.host.hold(item.action, false);
    if (item.kind === 'stick') this.host.stick({ x: 0, z: 0 });
    if (item.kind === 'look') this.host.look('end', point, id);
    if (item.kind === 'preview') this.host.preview(item.action, 'end', point, id);
    if (!cancelled && p.moved && item.pane && Math.abs(p.velocity ?? 0) > 60) this.host.fling?.(item.pane, p.velocity);
    if (!cancelled && !p.moved && !['hold', 'stick', 'look', 'preview', 'slider', 'scroll'].includes(item.kind) && inside(item.rect, point.x, point.y)) this.host.activate(item);
  }
  cancel(id) { const p = this.pointers.get(id); if (p) this.up(id, p.last, true); }
  clear() { for (const id of [...this.pointers.keys()]) this.cancel(id); }
}
