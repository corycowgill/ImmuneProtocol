import { UiLayout, lines } from './ui-core.mjs';
import { compactHud } from './hud-layout.mjs';

const text = (value, size = 14, color) => ({ kind: 'text', text: value, size, color });
const heading = (value, size = 26) => ({ kind: 'heading', text: value, size });
const grid = (children, minColumn = 170, maxColumns = 6) => ({ kind: 'grid', children: children.filter(Boolean), minColumn, maxColumns });
const button = (id, label, extra = {}) => ({ kind: 'button', id, action: id, text: label, ...extra });

// Screen definitions consume serializable state, resource keys and action IDs.
// No HTML, CSS selectors, browser events or game mutations live in this module.
export function buildUiScreen(model, size, safe, state, measure) {
  const ui = new UiLayout(measure, state.scroll), { w, h } = size;
  const edge = w < 600 || h < 500 ? 12 : 28;
  const x = Math.max(edge, safe.left), right = Math.max(edge, safe.right), top = Math.max(8, safe.top), bottom = Math.max(10, safe.bottom);
  const area = { x, y: top, w: w - x - right, h: h - top - bottom };
  const full = { x: 0, y: 0, w, h };
  const scene = { type: model.type, background: model.type === 'combat' || model.type === 'intro' || model.background === false ? null : model.background ?? 'assets/hero.webp', modal: model.type === 'dialog', draw: ui.draw, hits: ui.hits, panes: ui.panes, scope: model.id };
  if (model.type === 'intro') {
    ui.add({ kind: 'image', src: model.src }, full);
    ui.add(button('intro:skip', 'Skip intro'), { x: w - right - 128, y: h - bottom - 48, w: 128, h: 48 });
  } else if (model.type === 'loading') {
    const width = Math.min(600, area.w), compact = h < 500;
    ui.flow([text(model.eyebrow, 10, '#c8f794'), heading(model.title, compact ? 40 : 68), text(model.detail, compact ? 12 : 15)], { x, y: top + (compact ? 12 : 45), w: width, h: h / 2 }, full);
    const y = Math.max(h * .58, top + (compact ? 145 : 300));
    ui.flow([text(model.status, 12), { kind: 'meter', text: model.failed ? 'PREPARATION INTERRUPTED' : 'SYSTEM PREPARATION', value: model.progress, detail: model.progress + '%', color: model.failed ? '#ff977d' : '#c8f794' }, ...(model.failed ? [button('loading:retry', 'Retry loading', { primary: true })] : [text(model.quote, 12, '#cabaa8')])], { x, y, w: Math.min(720, area.w), h: h - y }, full);
  } else if (model.type === 'menu') {
    const landscape = w > h && h < 540;
    ui.add({ ...text('HALLUCINATED GAMES / NANO DEFENSE DIVISION', 10, '#c8f794'), ...(model.brand ? { id: model.brand.id, action: model.brand.action, label: 'Visit Hallucinated Games' } : {}) }, { x, y: top + 8, w: Math.max(140, area.w - 110), h: 44 });
    ui.add(model.mute, { x: w - right - 96, y: top, w: 44, h: 44 });
    ui.add(model.settings, { x: w - right - 44, y: top, w: 44, h: 44 });
    const y = top + 60, bodyH = h - y - bottom;
    const intro = [text('A VERY SMALL OPERATION', 10, '#c8f794'), heading('IMMUNE\nPROTOCOL', landscape ? 51 : w < 600 ? 60 : 96), text(model.detail, 14, '#d9ccbf'), ...(model.notices ?? []).map(note => text(note, 12, '#ffca96'))];
    const nav = model.buttons.map((b, i) => ({ ...b, primary: i === 0, detail: b.detail, size: 14 }));
    if (w >= 900 || landscape) {
      const leftW = Math.min(area.w * .48, 620), gap = w < 900 ? 20 : 50;
      ui.pane('menu-intro', [...intro, ...(landscape ? [] : model.status)], { x, y, w: leftW, h: bodyH });
      ui.pane('menu-actions', landscape ? [nav[0], grid(nav.slice(1).map(b => ({ ...b, detail: null })), 160, 2)] : nav, { x: x + leftW + gap, y, w: area.w - leftW - gap, h: bodyH });
    } else {
      ui.pane('menu-body', [...intro, nav[0], grid(nav.slice(1), 156, 2), ...model.status], { x, y, w: area.w, h: bodyH });
    }
  } else if (model.type === 'combat') {
    buildCombat(ui, model, area, full, size, state, measure);
  } else {
    const short = h < 500, titleSize = short ? 29 : 37;
    const titleWidth = area.w - (model.canBack === false ? 0 : 110);
    const titleLines = lines(model.title, titleWidth, measure, titleSize, 800).length;
    const titleHeight = titleLines * titleSize * 1.3;
    const headerH = titleLines > 1 ? 17 + titleHeight + 10 : short ? 52 : 68;
    ui.add(text(model.kicker ?? 'IMMUNE PROTOCOL', 10, '#bcaeaa'), { x, y: top + 2, w: area.w - 110, h: 14 });
    ui.add(heading(model.title, titleSize), { x, y: top + 17, w: titleWidth, h: titleHeight });
    if (model.canBack !== false) ui.add(button('@back', 'Back'), { x: w - right - 88, y: top, w: 88, h: 44 });
    const footer = [...(model.id === 'armory-dialog' && model.left?.length ? [button('@armory-stats', 'Build stats')] : []), ...(model.footer ?? [])].map(b => ({ ...b, detail: null, size: 13 }));
    let footerGrid = grid(footer, w < 600 ? 146 : 174, 5);
    const footerColumns = ui.columns(footerGrid, area.w);
    if (footer.length > footerColumns) {
      const rows = [];
      for (let i = 0; i < footer.length; i += footerColumns) rows.push(grid(footer.slice(i, i + footerColumns), w < 600 ? 146 : 174, footerColumns));
      footerGrid = { kind: 'stack', children: rows };
    }
    const footerH = footer.length ? ui.height(footerGrid, area.w) + 12 : 0;
    let y = top + headerH;
    if (model.tabs?.length) {
      const tabs = grid(model.tabs.map(b => ({ ...b, detail: null, size: 12 })), 96, model.tabs.length);
      const height = ui.height(tabs, area.w);
      ui.flow([tabs], { x, y, w: area.w, h: height }, full); y += height + 12;
    }
    const bodyH = Math.max(40, h - bottom - footerH - y - 4);
    const sticky = model.id === 'armory-dialog' ? model.body.find(n => n.id === '@armory-part') : null;
    const body = sticky ? model.body.filter(n => n !== sticky) : model.body;
    const bodyPane = (nodes, r) => {
      if (sticky) {
        const height = ui.height(sticky, r.w);
        ui.add(sticky, { ...r, h: height });
        r = { ...r, y: r.y + height + 12, h: Math.max(35, r.h - height - 12) };
      }
      ui.pane('body', nodes, r);
    };
    if (model.sidebar?.length && w >= 650) {
      const sideW = Math.min(250, area.w * .3), gap = 20;
      ui.pane('sidebar', model.sidebar, { x, y, w: sideW, h: bodyH });
      bodyPane(body, { x: x + sideW + gap, y, w: area.w - sideW - gap, h: bodyH });
    } else if (model.sidebar?.length) {
      ui.add({ kind: 'choice', id: '@sidebar', action: '@sidebar', text: model.selection ?? 'Choose an entry', value: '', options: model.sidebar.filter(n => n.action).map(n => ({ value: n.action, text: n.text, disabled: n.disabled })), label: '' }, { x, y, w: area.w, h: 48 });
      bodyPane(body, { x, y: y + 60, w: area.w, h: Math.max(35, bodyH - 60) });
    } else if (model.left?.length && w >= 650) {
      const leftW = Math.min(520, area.w * .46), gap = 22;
      ui.pane('preview', model.left, { x, y, w: leftW, h: bodyH });
      bodyPane(body, { x: x + leftW + gap, y, w: area.w - leftW - gap, h: bodyH });
    } else {
      const left = model.left ?? [];
      const nodes = model.id === 'coop-dialog' ? [...left.filter(n => n.kind === 'image').map(n => ({ ...n, height: 170 })), ...body, ...left.filter(n => n.kind !== 'image')]
        : [...(model.id === 'armory-dialog' ? left.slice(0, 3).map(n => n.kind === 'preview' ? { ...n, height: 165 } : n) : left), ...body];
      bodyPane(nodes, { x, y, w: area.w, h: bodyH });
    }
    if (footer.length) {
      ui.add({ kind: 'panel', color: '#111218f5' }, { x: 0, y: h - bottom - footerH - 3, w, h: bottom + footerH + 3 });
      ui.flow([footerGrid], { x, y: h - bottom - footerH + 12, w: area.w, h: footerH }, full);
    }
  }
  if (state.popup) {
    const popup = state.popup;
    const accessStart = ui.draw.length;
    ui.add({ kind: 'panel', color: '#090a10ed' }, full);
    const pw = Math.min(620, area.w), px = (w - pw) / 2;
    ui.add(heading(popup.label || 'Choose an option', 28), { x: px, y: top + 10, w: pw - 100, h: 48 });
    // Modal hit testing is restricted to this list and its own close button.
    ui.hits.length = 0;
    ui.panes.length = 0;
    ui.add(button('@close-popup', 'Close'), { x: px + pw - 88, y: top, w: 88, h: 44 });
    const options = popup.body ?? popup.options.map((o, index) => button('@option:' + index, o.text, { selected: o.value === popup.value, disabled: o.disabled }));
    ui.pane('popup', options, { x: px, y: top + 62, w: pw - 8, h: area.h - 72 });
    scene.accessDraw = ui.draw.slice(accessStart);
  }
  return scene;
}

function buildCombat(ui, model, area, full, size, state, measure) {
  const { w, h } = size, d = model.hud, compact = compactHud(w, h, model.touch), portrait = h > w;
  const x = area.x, top = area.y, right = w - area.x - area.w, bottom = h - area.y - area.h;
  ui.add({ kind: 'look', id: 'game:look', action: 'game:look', focusable: false }, full);
  if (d.scope) ui.add({ kind: 'scope' }, full);
  for (const path of d.paths) ui.add({ kind: 'path', ...path }, full);
  for (const marker of d.markers) {
    const width = marker.quiet ? 10 : Math.min(marker.kind === 'laser' ? 188 : compact ? 125 : 170, Math.max(65, ...marker.text.split('\n').map(line => measure(line, compact ? 10 : 11) + 12)));
    const font = compact ? 10 : 11, height = marker.quiet ? 14 : lines(marker.text, width - 8, measure, font).length * font * 1.3 + 8;
    const reservedTop = compact ? top + (portrait ? (d.special ? 235 : 165) : d.special ? 112 : 83) : top + 120;
    const markerY = Math.max(reservedTop, Math.min(h - bottom - 170 - height, marker.y - (marker.edge ? height / 2 : height)));
    ui.add({ kind: 'label', text: marker.quiet ? '◇' : marker.text, color: marker.color, size: font, box: marker.edge || marker.attacker }, { x: Math.max(2, Math.min(w - width - 2, marker.x - width / 2)), y: markerY, w: width, h: height });
  }
  const nodeWidth = compact ? (portrait ? area.w : Math.min(238, w / 2 - (d.special ? Math.min(250, w * .34) : 150) / 2 - x - 12)) : 252;
  const nodeTop = compact && portrait ? top + (d.special ? 111 : 48) : top;
  const nodeHeight = compact ? 32 : 34 + d.nodes.length * 33;
  ui.add({ kind: 'panel', color: '#141411ad' }, { x, y: nodeTop, w: nodeWidth, h: nodeHeight });
  if (!compact) ui.add(text('TISSUE NODES', 12, '#e5d9c6'), { x: x + 12, y: nodeTop + 9, w: nodeWidth - 24, h: 18 });
  d.nodes.forEach((node, i) => {
    const cw = (nodeWidth - 16 - (d.nodes.length - 1) * 9) / d.nodes.length;
    ui.add({ kind: 'meter', text: node.name, value: node.value, size: compact ? 9 : 11, color: node.danger ? '#ff977d' : ['#c8f794', '#8fe4dd', '#dbafef'][i] }, compact ? { x: x + 8 + i * (cw + 9), y: nodeTop + 5, w: cw, h: 25 } : { x: x + 12, y: nodeTop + 33 + i * 33, w: nodeWidth - 24, h: 29 });
  });
  const waveW = d.special ? (compact ? Math.min(250, portrait ? area.w - 110 : w * .34) : Math.min(340, w * .34)) : compact ? 150 : 190;
  const waveX = portrait && compact ? x : (w - waveW) / 2;
  if (d.special) {
    const panel = d.special;
    ui.add({ kind: 'panel' }, { x: waveX, y: top, w: waveW, h: compact ? 100 : 145 });
    ui.add(heading(panel.title, compact ? 18 : 27), { x: waveX + 8, y: top + 6, w: waveW - 16, h: 28 });
    ui.add(text(panel.detail, compact ? 10 : 12, '#e6c9de'), { x: waveX + 8, y: top + (compact ? 32 : 44), w: waveW - 16, h: 58 });
    if (panel.health != null) ui.add({ kind: 'meter', text: panel.phase ?? '', value: panel.health, size: 9, color: '#e7aac2' }, { x: waveX + 8, y: top + (compact ? 65 : 104), w: waveW - 16, h: 29 });
  } else {
    ui.add({ kind: 'panel', color: '#14141170' }, { x: waveX, y: top, w: waveW, h: compact ? 45 : 93 });
    if (!compact) ui.add(text(d.mode, 10), { x: waveX, y: top + 3, w: waveW, h: 18 });
    ui.add({ ...heading(d.wave, compact ? 24 : 42), align: 'center' }, { x: waveX, y: top + (compact ? 0 : 20), w: waveW, h: 43 });
    ui.add({ ...text(d.threats, compact ? 9 : 10), align: 'center' }, { x: waveX, y: top + (compact ? 30 : 69), w: waveW, h: 16 });
  }
  const act = model.actions;
  ui.add({ ...act.mute, text: d.muted ? '♪ Off' : '♪' }, { x: w - right - 94, y: top, w: 44, h: 44 });
  ui.add({ ...act.pause, text: 'Ⅱ' }, { x: w - right - 44, y: top, w: 44, h: 44 });
  const healthW = compact ? 104 : 180, healthH = compact ? 44 : 100;
  ui.add({ kind: 'panel', color: '#141411b0' }, { x, y: h - bottom - healthH, w: healthW, h: healthH });
  if (!compact) ui.add(text('SUIT INTEGRITY', 11), { x: x + 10, y: h - bottom - 90, w: healthW - 20, h: 18 });
  ui.add({ ...heading(d.health + '%', compact ? 28 : 46), color: d.health <= 25 ? '#ff977d' : '#c8f794' }, { x: x + 8, y: h - bottom - (compact ? 40 : 68), w: healthW - 16, h: 40 });
  ui.add({ kind: 'meter', value: d.health, color: d.health <= 25 ? '#ff977d' : '#c8f794', text: '', detail: '' }, { x: x + 8, y: h - bottom - 10, w: healthW - 16, h: 11 });
  const ammoW = compact ? 114 : 210, ammoH = compact ? 56 : 112;
  const ammoX = compact && model.touch && !portrait ? w - right - 182 - ammoW : w - right - ammoW;
  const ammoY = h - bottom - ammoH - (compact && portrait && model.touch ? 110 : 0);
  ui.add({ kind: 'panel', color: '#141411b0' }, { x: ammoX, y: ammoY, w: ammoW, h: ammoH });
  ui.add(text(d.weapon, compact ? 9 : 12), { x: ammoX + 8, y: ammoY + 5, w: ammoW - 16, h: 18 });
  ui.add({ ...heading(d.ammo, compact ? 28 : 46), align: 'right', color: d.ammoState ? '#ffc888' : '#c8f794' }, { x: ammoX + 8, y: ammoY + 18, w: ammoW - 16, h: 42 });
  if (d.ammoState) ui.add(text(d.ammoState, 9, '#ffc888'), { x: ammoX + 8, y: ammoY + ammoH - 12, w: ammoW - 16, h: 12 });
  if (d.reload > 0) ui.add({ kind: 'meter', value: d.reload, text: '', detail: '' }, { x: ammoX + 8, y: ammoY + ammoH - 7, w: ammoW - 16, h: 8 });
  if (!compact) {
    ui.add({ ...text(d.score, 11), align: 'right' }, { x: w - right - 250, y: top + 54, w: 250, h: 20 });
    ui.add({ ...text(d.turret, 10, '#8fe4dd'), align: 'right' }, { x: ammoX, y: ammoY + ammoH - 20, w: ammoW - 10, h: 16 });
    ui.add(text(d.weaponStrip, 11), { x: ammoX + 8, y: ammoY - 26, w: ammoW - 16, h: 24 });
  } else if (!model.touch) ui.add({ ...text(d.turret, 9, '#8fe4dd'), align: 'right' }, { x: ammoX, y: ammoY - 18, w: ammoW, h: 16 });
  const allyY = compact ? (portrait ? nodeTop + (d.hazard ? 76 : 39) : top + 37) : nodeTop + nodeHeight + 8;
  if (d.ally) ui.add(text(d.ally, 10, '#b2e8ff'), { x, y: allyY, w: nodeWidth, h: 28 });
  let hazardY = 0;
  if (d.hazard) {
    const hy = compact ? (portrait ? nodeTop + 39 : top + (d.ally ? 68 : 39)) : top + (d.special ? 155 : 105);
    hazardY = hy;
    ui.add({ kind: 'label', text: d.hazard, box: true, align: 'left', size: compact ? 10 : 11, color: '#ffca96' }, { x: compact ? x : waveX, y: hy, w: compact ? Math.min(228, nodeWidth) : waveW, h: 30 });
  }
  const notice = d.notice || d.training || d.alert || d.surge;
  if (notice) {
    const width = Math.min(390, portrait ? area.w : w * .43), font = d.training ? 13 : 11;
    const height = Math.min(85, lines(notice, width - 16, measure, font).length * font * 1.3 + 12);
    const ny = compact ? Math.max(top + (portrait ? (d.special ? 184 : d.hazard ? 170 : 85) : d.special ? 108 : 51), portrait && d.ally ? allyY + 34 : 0, portrait && d.hazard ? hazardY + 36 : 0) : top + 108;
    const nx = compact ? Math.max((w - width) / 2, !portrait && (d.hazard || d.ally) ? x + nodeWidth + 10 : 0) : w - right - width;
    ui.add({ kind: 'label', text: notice, size: font, box: true, color: '#ffe0ae' }, { x: nx, y: ny, w: width, h: height });
  }
  if (d.prompt) {
    const width = Math.min(340, area.w - (portrait ? 0 : 230));
    ui.add({ kind: 'label', text: d.prompt, box: true, size: 11 }, { x: (w - width) / 2, y: h - bottom - (portrait ? 202 : 86), w: width, h: 38 });
    if (d.repair > 0) ui.add({ kind: 'meter', text: '', detail: '', value: d.repair }, { x: (w - width) / 2 + 8, y: h - bottom - (portrait ? 171 : 55), w: width - 16, h: 8 });
  }
  if ((!d.aiming && !d.scope) || d.hit) ui.add({ kind: 'reticle', offset: d.spread, hit: d.hit, color: d.hit ? '#fff8b2' : '#e5f4cb' }, { x: w / 2 - 15, y: h / 2 - 15, w: 30, h: 30 });
  if (model.touch) {
    const by = h - bottom - 95, bx = w - right - 166;
    ui.add({ kind: 'stick', id: 'game:stick', action: 'game:stick' }, { x: x + 5, y: h - bottom - 141, w: 92, h: 92 });
    for (const [name, xx, yy] of [['swap', 0, 0], ['turret', 51, 0], ['reload', 0, 51], ['repair', 51, 51]]) {
      const source = act[name]; if (!source) continue;
      ui.add({ ...source, kind: ['reload', 'repair'].includes(name) ? 'hold' : 'button', text: source.text || name, size: 9, round: true }, { x: bx + xx, y: by + yy, w: 44, h: 44 });
    }
    ui.add({ kind: 'hold', id: 'game:fire', action: 'game:fire', text: 'FIRE', size: 12, primary: true, round: true }, { x: w - right - 64, y: by + 16, w: 64, h: 64 });
  }
  if (d.supply?.length) {
    const width = Math.min(480, area.w), height = 200;
    ui.add({ kind: 'panel' }, { x: (w - width) / 2 - 8, y: top + 84, w: width + 16, h: height });
    ui.pane('supply', [heading('Regroup / field support', 20), text(d.supplyNote, 11), grid(d.supply, 140, 2)], { x: (w - width) / 2, y: top + 94, w: width, h: height - 20 });
  }
  if (d.damage > 0) ui.add({ kind: 'panel', color: '#ff3120', alpha: Math.min(.26, d.damage * .8) }, full);
}
