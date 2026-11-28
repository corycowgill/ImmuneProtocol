import { upper, verbatim } from './i18n.mjs';
import { UiLayout, lines } from './ui-core.mjs';
import { compactHud } from './hud-layout.mjs';
import { UI_THEME as T } from './ui-theme.mjs';

const text = (value, size = 15, color) => ({ kind: 'text', text: value, size, color });
const heading = (value, size = 30) => ({ kind: 'heading', text: upper(value ?? ''), size });
const section = value => ({ kind: 'section', text: value });
const grid = (children, minColumn = 170, maxColumns = 6) => ({ kind: 'grid', children: children.filter(Boolean), minColumn, maxColumns });
const button = (id, label, extra = {}) => ({ kind: 'button', id, action: id, text: label, size: 15, ...extra });
const polish = node => !node ? node : ({ ...node,
  ...(node.kind === 'text' && node.size === 14 ? { size: 15 } : {}),
  ...(node.kind === 'heading' && node.size <= 26 ? { text: upper(node.text), size: 23, color: T.paper } : {}),
  ...(node.kind === 'button' ? { size: 15 } : {}),
  ...(node.children ? { children: node.children.filter(Boolean).map(polish) } : {}),
});
const tabsFor = (ui, views, selected, rect, full) => {
  const items = views.map(view => button('@view:' + view.id, view.text, { selected: view.id === selected, variant: 'tab', height: 44 }));
  ui.flow([grid(items, 95, items.length)], rect, full);
};
const selectedView = (model, state, views) => views.find(view => view.id === state.pages?.[model.id]) ?? views[0];
function pane(ui, id, nodes, r, label) {
  // Every content pane shares the HUD's clipped-corner frame, so menus and combat read as one UI.
  ui.add({ kind: 'panel', hud: true, accent: '#c8f79470', top: 'rgba(16,26,34,.84)', bottom: 'rgba(8,13,18,.9)' }, r);
  const pad = r.w < 220 ? 10 : 16, padY = r.h < 320 ? 8 : 14;
  if (label) ui.add(section(label), { x: r.x + pad, y: r.y + 13, w: r.w - pad * 2, h: 26 });
  ui.pane(id, nodes.filter(Boolean), { x: r.x + pad, y: r.y + (label ? 48 : padY), w: r.w - pad * 2, h: Math.max(24, r.h - (label ? 61 : padY * 2)) });
}

// Plain models and resource keys; no browser layout or platform-specific input.
export function buildUiScreen(model, size, safe, state, measure) {
  const ui = new UiLayout(measure, state.scroll), { w, h } = size;
  const edge = w < 600 || h < 500 ? 16 : 40;
  const x = Math.max(edge, safe.left), right = Math.max(edge, safe.right), top = Math.max(h < 500 ? 8 : 20, safe.top), bottom = Math.max(12, safe.bottom);
  const area = { x, y: top, w: w - x - right, h: h - top - bottom }, full = { x: 0, y: 0, w, h };
  const scene = { type: model.type, background: model.type === 'combat' || model.type === 'intro' || model.background === false ? null : model.background ?? 'assets/hero.webp', modal: model.type === 'dialog', draw: ui.draw, hits: ui.hits, panes: ui.panes, scope: model.id };
  if (model.type === 'intro') {
    ui.add({ kind: 'image', src: model.src }, full);
    const skipWidth = model.skipLabel ? 172 : 144;
    // A dark pill keeps the prompt readable over bright video frames.
    ui.add({ kind: 'panel', color: '#05080acc', border: '#ffffff2e' }, { x: w - right - skipWidth - 4, y: h - bottom - 50, w: skipWidth + 8, h: 52 });
    ui.add(button(model.skip ?? 'intro:skip', model.skipLabel ?? 'Skip intro', { variant: 'ghost', icon: 'arrow' }), { x: w - right - skipWidth, y: h - bottom - 48, w: skipWidth, h: 48 });
  } else if (model.type === 'loading') {
    const compact = h < 500, width = Math.min(650, area.w), y = top + (compact ? 10 : h * .14);
    ui.add({ kind: 'icon', icon: 'shield', color: T.green }, { x, y, w: 26, h: 26 });
    ui.add({ ...text(model.eyebrow || 'NANO RESPONSE', 11, T.green), tracking: 1.4 }, { x: x + 40, y: y + 7, w: width - 40, h: 20 });
    const title = heading(model.title, compact ? 38 : 64), titleH = ui.height(title, width);
    ui.add(title, { x, y: y + 44, w: width, h: titleH });
    ui.add(text(model.detail, compact ? 14 : 16, T.muted), { x, y: y + 56 + titleH, w: width, h: 64 });
    const py = Math.max(y + titleH + 126, h - bottom - (model.failed ? 139 : 110));
    ui.flow([text(model.status, 13, T.muted), { kind: 'meter', text: model.failed ? 'PREPARATION INTERRUPTED' : 'PREPARING INSERTION', value: model.progress, detail: model.progress + '%', color: model.failed ? T.hot : T.green, thick: 5, glowHead: true }, ...(model.failed ? [button('loading:retry', 'Retry loading', { primary: true, icon: 'reset' })] : [text(model.quote, 12, T.muted)])], { x, y: py, w: width, h: h - py - bottom }, full);
  } else if (model.type === 'menu') buildMenu(ui, model, area, full, size);
  else if (model.type === 'combat') buildCombat(ui, model, area, full, size, state, measure);
  else if (['new-campaign-dialog', 'profile-delete-dialog', 'ui-recovery'].includes(model.id)) buildConfirmation(ui, model, area, full, size);
  else if (model.id === 'coop-dialog' && model.lobby && w >= 1000 && h >= 600) buildSquadLobby(ui, model, area, full, size);
  else buildDialog(ui, model, area, full, size, state, measure);
  if (state.popup) {
    const popup = state.popup, start = ui.draw.length, pw = Math.min(620, area.w), px = (w - pw) / 2;
    ui.add({ kind: 'panel', color: '#05090ef5', border: '#0000' }, full);
    const title = heading(popup.label || 'Choose an option', 30), th = ui.height(title, pw - 110), contentY = top + th + 30;
    ui.add(title, { x: px, y: top + 8, w: pw - 110, h: th });
    ui.hits.length = 0; ui.panes.length = 0;
    ui.add(button('@close-popup', 'Close', { icon: 'close', variant: 'ghost' }), { x: px + pw - 100, y: top, w: 100, h: 44 });
    const options = popup.body?.map(polish) ?? popup.options.map((o, index) => button('@option:' + index, o.text, { selected: o.value === popup.value, disabled: o.disabled }));
    pane(ui, 'popup', options, { x: px, y: contentY, w: pw, h: Math.max(40, h - bottom - contentY) });
    scene.accessDraw = ui.draw.slice(start);
  }
  return scene;
}

function buildMenu(ui, model, area, full, size) {
  const { w, h } = size, { x, y: top } = area, landscape = w > h && h < 540, phone = w < 600;
  ui.add({ kind: 'icon', icon: 'shield', color: T.green }, { x, y: top + 5, w: 28, h: 28 });
  // The active operator, left of the audio and settings buttons; on phones just the emblem.
  let brandRoom = 0;
  if (model.profile) {
    const chipW = phone ? 44 : Math.min(250, Math.max(150, ui.measure(model.profile.name ?? '', 15, 800) + 96));
    ui.add({ ...model.profile, kind: 'profile-chip', compact: phone }, { x: x + area.w - 104 - chipW, y: top, w: chipW, h: 44 });
    brandRoom = chipW + 8;
  }
  ui.add({ ...text(phone ? 'HALLUCINATED GAMES' : 'HALLUCINATED GAMES / NANO RESPONSE', 10, T.muted), tracking: 1.1, ...(model.brand ? { id: model.brand.id, action: model.brand.action, label: 'Visit Hallucinated Games' } : {}) }, { x: x + 40, y: top + 7, w: Math.max(100, area.w - 152 - brandRoom), h: 44 });
  ui.add({ ...model.mute, icon: model.mute?.selected ? 'muted' : 'volume', iconOnly: true, text: '' }, { x: x + area.w - 96, y: top, w: 44, h: 44 });
  ui.add({ ...model.settings, icon: 'settings', iconOnly: true, text: '' }, { x: x + area.w - 44, y: top, w: 44, h: 44 });
  ui.add({ kind: 'rule' }, { x, y: top + 51, w: area.w, h: 1 });
  const y = top + (landscape ? 74 : 80), leftW = landscape ? area.w * .44 : Math.min(550, area.w);
  ui.add({ ...text('A VERY SMALL OPERATION', 10, T.green), tracking: 2 }, { x, y, w: leftW, h: 18 });
  const logoSize = landscape ? Math.min(62, leftW * .17) : phone ? 66 : Math.min(86, h * .12);
  const logoY = y + 28, logoH = logoSize * 1.8;
  ui.add({ ...heading(verbatim('IMMUNE'), logoSize), lineHeight: .9 }, { x, y: logoY, w: leftW, h: logoSize });
  ui.add({ ...heading(verbatim('PROTOCOL'), logoSize), color: T.green, lineHeight: .9 }, { x, y: logoY + logoSize * .9, w: leftW, h: logoSize });
  ui.add(text(model.detail, landscape ? 14 : 15, '#c1cdd2'), { x, y: logoY + logoH + 15, w: Math.min(450, leftW), h: landscape ? 64 : 52 });
  const icons = { deploy: 'arrow', 'new-campaign': 'reset', 'mission-select': 'target', 'endless-open': 'infinity', 'coop-open': 'users', 'armory-open': 'weapon', 'achievements-open': 'trophy', guide: 'shield', manual: 'book' };
  const nav = model.buttons.map((b, i) => ({ ...b, primary: i === 0, variant: i === 0 ? b.variant : 'menu', size: i === 0 ? (landscape ? (w < 750 ? 14 : 16) : 17) : landscape ? 17 : 21, icon: icons[b.id?.replace(/^dom:/, '')] ?? 'arrow', height: i === 0 ? (landscape ? 68 : 76) : landscape ? 44 : 48, detail: i === 0 ? b.detail : null }));
  const nodes = [nav[0], { ...grid(nav.slice(1), phone ? 145 : 160, 2), gap: 4 }, ...(model.notices ?? []).map(note => text(note, 12, '#ffca96'))];
  const navX = landscape ? x + leftW + 26 : x, navY = landscape ? y : logoY + logoH + 91;
  const navW = landscape ? area.w - leftW - 26 : Math.min(550, area.w);
  ui.pane('menu-actions', nodes, { x: navX, y: navY, w: navW, h: h - navY - Math.max(16, h - area.y - area.h) });
  if (!phone && !landscape && model.operator) {
    // The operator record is a slim strip under the menu, in the shaded text column, so it no
    // longer covers the key art.
    const best = /^[\s—–-]*$/.test(model.operator.best ?? '') ? 'No runs yet' : model.operator.best;
    const sy = h - Math.max(16, h - area.y - area.h) - 46, sw = Math.min(550, area.w);
    if (sy > navY + 76 + 3 * 52) {
      ui.add({ kind: 'panel', hud: true, accent: '#c8f79470' }, { x, y: sy, w: sw, h: 46 });
      const cells = [['OPERATOR', model.profile?.name ?? ''], ['SECURED', model.operator.progress], ['BEST SCORE', best], ['DIFFICULTY', model.operator.difficulty]];
      const cw = (sw - 24) / cells.length;
      cells.forEach(([label, value], i) => {
        ui.add({ ...text(label, 9, i ? T.muted : T.green), weight: 700, tracking: 1.2 }, { x: x + 14 + i * cw, y: sy + (i || value ? 8 : 17), w: cw - 8, h: 14 });
        if (value) ui.add({ ...text(value, 15, T.paper), weight: 700 }, { x: x + 14 + i * cw, y: sy + 22, w: cw - 8, h: 20 });
      });
    }
  }
}

function buildConfirmation(ui, model, area, full, size) {
  const width = Math.min(610, area.w), pad = size.w < 600 ? 20 : 30, x = (size.w - width) / 2, inner = width - pad * 2;
  const title = heading(model.title, size.h < 500 ? 32 : 42), body = model.body.map(polish), destructive = ['new-campaign-dialog', 'profile-delete-dialog'].includes(model.id), actions = model.footer.map((b, i) => ({ ...polish(b), tone: destructive && i === 1 ? 'danger' : undefined, primary: destructive ? i === 1 : b.primary }));
  const controls = grid(actions, 230, 2), titleH = ui.height(title, inner), bodyH = ui.height({ kind: 'stack', children: body }, inner), actionsH = ui.height(controls, inner);
  const height = Math.min(area.h, 110 + titleH + bodyH + actionsH), y = Math.max(area.y, (size.h - height) / 2);
  ui.add({ kind: 'panel', color: '#111c24fc', border: '#a4c1cc50' }, { x, y, w: width, h: height });
  ui.add({ ...text(model.id === 'profile-delete-dialog' ? 'OPERATOR / SAVE DATA' : destructive ? 'CAMPAIGN / CHECKPOINT' : 'SYSTEM RECOVERY', 10, T.hot), tracking: 1.4 }, { x: x + pad, y: y + 22, w: inner, h: 18 });
  ui.add(title, { x: x + pad, y: y + 50, w: inner, h: titleH });
  ui.pane('body', body, { x: x + pad, y: y + 62 + titleH, w: inner, h: Math.max(28, height - 94 - titleH - actionsH) });
  ui.flow([controls], { x: x + pad, y: y + height - actionsH - 18, w: inner, h: actionsH }, full);
}

function buildDialog(ui, model, area, full, size, state, measure) {
  const { w, h } = size, { x, y: top } = area, short = h < 500, phone = w < 650;
  const titleWidth = area.w - (model.canBack === false ? 0 : 132), nominalSize = short ? 32 : phone ? 36 : 46;
  const widestWord = Math.max(1, ...model.title.split(/\s+/).map(word => measure(word, nominalSize, 800)));
  const titleSize = Math.max(24, Math.min(nominalSize, nominalSize * titleWidth / widestWord));
  const titleH = lines(model.title, titleWidth, measure, titleSize, 800).length * titleSize * 1.04;
  ui.add({ ...text(model.kicker || 'IMMUNE PROTOCOL / FIELD SYSTEMS', 10, T.muted), tracking: 1.2 }, { x, y: top + 1, w: area.w - 112, h: 15 });
  ui.add(heading(model.title, titleSize), { x, y: top + 22, w: titleWidth, h: titleH });
  // Wide enough for "Back" in every language (Zurück, Atrás, Retour).
  if (model.canBack !== false) ui.add(button('@back', 'Back', { icon: 'back', variant: 'ghost' }), { x: x + area.w - 120, y: top, w: 120, h: 44 });
  let y = Math.round(top + titleH + 38);
  ui.add({ kind: 'rule' }, { x, y: y - 8, w: area.w, h: 1 });
  const footer = [...(model.id === 'armory-dialog' && model.left?.length ? [button('@armory-stats', 'Build stats')] : []), ...(model.footer ?? [])].map(b => ({ ...polish(b), detail: null, ...(short ? { height: 44 } : {}) }));
  let footerGrid = grid(footer, phone ? 145 : 160, 5), footerWidth = area.w;
  if (!phone && footer.length && footer.length <= 4) footerWidth = Math.min(area.w, footer.length * 205 + (footer.length - 1) * 10);
  const columns = ui.columns(footerGrid, footerWidth);
  if (footer.length > columns) footerGrid = { kind: 'stack', children: Array.from({ length: Math.ceil(footer.length / columns) }, (_, i) => grid(footer.slice(i * columns, (i + 1) * columns), phone ? 145 : 160, columns)) };
  const footerH = footer.length ? ui.height(footerGrid, footerWidth) + 22 : 0;
  if (model.tabs?.length) { const tabs = grid(model.tabs.map(b => ({ ...polish(b), variant: 'tab', detail: null, height: 44 })), 95, model.tabs.length); ui.flow([tabs], { x, y, w: area.w, h: 44 }, full); y += 56; }
  const bodyH = Math.max(40, h - (h - top - area.h) - footerH - y - 8), r = { x, y, w: area.w, h: bodyH };
  const compactOperators = node => ({ ...node, ...(short && node.variant === 'operator' ? { height: 74, compact: true } : {}), ...(node.children ? { children: node.children.map(compactOperators) } : {}) });
  const body = model.body.map(polish).map(compactOperators), left = model.left?.map(polish), sidebar = model.sidebar?.map(b => ({ ...polish(b), src: model.id === 'guide-dialog' ? b.src : null, detail: null, size: 14, thumbnail: 40, height: model.id === 'guide-dialog' ? 56 : 48 }));
  if (model.id === 'pause-dialog' && model.pauseActions) {
    if (phone) pane(ui, 'body', [...body, section('Mission controls'), ...model.pauseActions.map(polish)], r);
    else { const aw = Math.min(330, r.w * .36); pane(ui, 'pause-actions', model.pauseActions.map(polish).map(n => short ? { ...n, height: 44 } : n), { ...r, w: aw }, short ? null : 'Mission controls'); pane(ui, 'body', body, { ...r, x: x + aw + 24, w: r.w - aw - 24 }, 'Mission status'); }
  } else if (model.id === 'settings-dialog') {
    const groups = model.settingsGroups?.map(g => ({ ...g, nodes: g.nodes.map(polish) }));
    if (groups && short) {
      const compact = node => ({ ...node, compact: true });
      pane(ui, 'body', groups.flatMap(g => [section(g.text), grid(g.nodes.filter(n => n.kind !== 'text').map(compact), 210, 2)]), r);
    } else if (groups && !phone) {
      // Controls and Video on the left; Audio, Accessibility and anything later on the right.
      const cw = (r.w - 24) / 2, rows = g => [section(g.text), ...g.nodes.map(n => n.kind === 'text' ? { ...n, size: 12 } : n)];
      pane(ui, 'body', groups.slice(0, 2).flatMap(rows), { ...r, w: cw });
      pane(ui, 'audio', groups.slice(2).flatMap(rows), { ...r, x: x + cw + 24, w: cw });
    }
    else pane(ui, 'body', groups ? groups.flatMap(g => [section(g.text), ...g.nodes]) : body, { ...r, x: x + Math.max(0, (r.w - 900) / 2), w: Math.min(900, r.w) });
  } else if (model.report) {
    const summary = [...model.report.summary.map(polish), button('@report-details', 'Full mission details', { height: 44, variant: 'ghost' })];
    const decision = model.report.options ? [section(model.report.label), grid(model.report.options.map(option => ({ ...polish(option), variant: 'reward', ...(short ? { height: 80 } : {}) })), 145, 2)] : model.report.forecast.map(polish);
    if (!phone) { const sw = Math.min(330, r.w * .34); pane(ui, 'summary', summary, { ...r, w: sw }); pane(ui, 'body', decision, { ...r, x: x + sw + 24, w: r.w - sw - 24 }); }
    else pane(ui, 'body', [...decision, section('Mission summary'), ...summary], r);
  } else if (model.views?.length > 4 && r.w < 640) {
    // Too many sections for a tab row on a narrow screen: one picker, like the mission list.
    const current = selectedView(model, state, model.views);
    ui.add({ kind: 'choice', id: '@views', action: '@views', actionOptions: true, text: current.text, value: '@view:' + current.id, options: model.views.map(view => ({ value: '@view:' + view.id, text: view.text })), label: '' }, { ...r, h: 48 });
    pane(ui, 'body', current.body.map(polish), { ...r, y: r.y + 60, h: Math.max(40, r.h - 60) });
  } else if (model.views?.length) {
    const current = selectedView(model, state, model.views); tabsFor(ui, model.views, current.id, r, full);
    pane(ui, 'body', current.body.map(polish), { ...r, y: r.y + 56, h: Math.max(40, r.h - 56) });
  } else if (model.id === 'mission-dialog' && model.briefing) {
    let content = { ...r };
    if (!phone) { const sideW = Math.min(220, r.w * .24); pane(ui, 'sidebar', sidebar, { ...r, w: sideW }, 'Operations'); content = { ...r, x: r.x + sideW + 20, w: r.w - sideW - 20 }; }
    else { ui.add({ kind: 'choice', id: '@sidebar', action: '@sidebar', text: model.selection, value: '', options: model.sidebar.map(n => ({ value: n.action, text: n.text, disabled: n.disabled })), label: '' }, { ...r, h: 48 }); content.y += 60; content.h -= 60; }
    const briefing = model.briefing.map(polish).map(n => n.kind === 'image' ? { ...n, height: short ? 96 : 230, cover: true, caption: short ? model.briefing[1]?.text : undefined } : n).filter((n, i) => !short || i !== 1).map(n => short && n.kind === 'text' ? { ...n, size: 13 } : n), config = model.configuration.map(polish);
    if (w >= 1100) { const cw = (content.w - 20) * .48; pane(ui, 'body', briefing, { ...content, w: cw }, 'Mission briefing'); pane(ui, 'configuration', config, { ...content, x: content.x + cw + 20, w: content.w - cw - 20 }, 'Deployment setup'); }
    else { const views = [{ id: 'briefing', text: 'Briefing', body: briefing }, { id: 'configuration', text: 'Loadout', body: config }], current = selectedView(model, state, views); tabsFor(ui, views, current.id, content, full); pane(ui, 'body', current.body, { ...content, y: content.y + 54, h: Math.max(35, content.h - 54) }); }
  } else if (model.id === 'guide-dialog' && model.specimen) {
    let content = { ...r };
    if (!phone) { const sideW = Math.min(254, r.w * .28); pane(ui, 'sidebar', sidebar, { ...r, w: sideW }, 'Pathogen index'); content = { ...r, x: r.x + sideW + 20, w: r.w - sideW - 20 }; }
    else { ui.add({ kind: 'choice', id: '@sidebar', action: '@sidebar', text: model.selection, value: '', options: model.sidebar.map(n => ({ value: n.action, text: n.text, disabled: n.disabled })), label: '' }, { ...r, h: 48 }); content.y += 60; content.h -= 60; }
    // "Provoke" is the stage's one action: an accent button with an icon, centred under it at its own width.
    const provoke = n => ({ ...n, primary: true, icon: 'bolt', height: 44, fitWidth: Math.ceil(measure(upper(n.text), 14, 700) + .5 * String(n.text).length + 24 + 31 + 12) });
    const specimen = model.specimen.map(polish).map(n => n.kind === 'preview' ? { ...n, height: Math.max(160, Math.min(400, content.h - 110)), cover: true } : n.kind === 'button' ? provoke(n) : n), intel = model.intel.map(polish);
    if (w >= 1100) { const cw = (content.w - 20) * .56; pane(ui, 'body', specimen, { ...content, w: cw }, 'Live specimen'); pane(ui, 'intel', intel, { ...content, x: content.x + cw + 20, w: content.w - cw - 20 }, 'Field intelligence'); }
    else { const views = [{ id: 'specimen', text: 'Specimen', body: specimen }, { id: 'intel', text: 'Intel', body: intel }], current = selectedView(model, state, views); tabsFor(ui, views, current.id, content, full); pane(ui, 'body', current.body, { ...content, y: content.y + 54, h: Math.max(35, content.h - 54) }); }
  } else if (left?.length && !phone) {
    const leftW = Math.min(720, r.w * .57), content = { ...r, x: x + leftW + 24, w: r.w - leftW - 24 };
    const displayLeft = short && model.id === 'coop-dialog' ? [left[0], { ...text(model.squadText, 11, T.muted), height: 36, maxLines: 2 }] : short && model.id === 'armory-dialog' ? left.slice(0, 1) : model.id === 'armory-dialog' ? [...left.slice(0, 3), ...(left[3]?.children ? [{ ...left[3], children: left[3].children.slice(0, 3) }] : [])] : left;
    const previewNodes = displayLeft.map(n => n.kind === 'preview' || n.kind === 'image' ? { ...n, height: short ? Math.max(80, r.h - (model.id === 'coop-dialog' ? 64 : 16)) : Math.max(175, Math.min(370, r.h - 180)), cover: true } : n);
    pane(ui, 'preview', previewNodes, { ...r, w: leftW }); inspector(ui, model, body, content);
  } else if (left?.length && phone) {
    if (model.id === 'armory-dialog') {
      const preview = left.slice(0, 3).map(n => n.kind === 'preview' ? { ...n, height: 205, cover: true } : n);
      const views = [{ id: 'build', text: 'Configure', body }, { id: 'preview', text: 'Weapon preview', body: preview }], current = selectedView(model, state, views);
      tabsFor(ui, views, current.id, r, full); inspector(ui, model, current.body, { ...r, y: r.y + 54, h: Math.max(35, r.h - 54) });
    } else if (model.id === 'coop-dialog') {
      const views = [{ id: 'squad', text: 'Squad', body: left.map(n => n.kind === 'image' ? { ...n, height: 220, cover: true } : n) }, { id: 'suits', text: 'Suit selection', body }], current = selectedView(model, state, views);
      tabsFor(ui, views, current.id, r, full); pane(ui, 'body', current.body, { ...r, y: r.y + 54, h: Math.max(35, r.h - 54) });
    } else pane(ui, 'body', [...left, ...body], r);
  } else if (sidebar?.length && !phone) {
    const sw = Math.min(230, r.w * .25); pane(ui, 'sidebar', sidebar, { ...r, w: sw }); pane(ui, 'body', body, { ...r, x: x + sw + 24, w: r.w - sw - 24 });
  } else {
    const max = ['result-dialog', 'extraction-dialog'].includes(model.id) ? 1040 : model.id === 'coop-dialog' ? 900 : 1100;
    pane(ui, 'body', body, { ...r, x: x + Math.max(0, (r.w - max) / 2), w: Math.min(max, r.w) });
  }
  if (footer.length) {
    const fy = h - (h - top - area.h) - footerH;
    ui.add({ kind: 'panel', color: '#0b131bf5', border: '#0000' }, { x: 0, y: fy - 3, w, h: h - fy + 3 });
    ui.add({ kind: 'rule' }, { x, y: fy - 3, w: area.w, h: 1 });
    ui.flow([footerGrid], { x: x + area.w - footerWidth, y: fy + 10, w: footerWidth, h: footerH }, full);
    if (w >= 1100 && area.w - footerWidth > 220) ui.add(text('FIELD SYSTEMS / NANO RESPONSE', 10, T.faint), { x, y: fy + 27, w: area.w - footerWidth - 20, h: 18 });
  }
}
// The co-op room as a squad lobby: the lab fills the screen with the squad on its pads, the
// host's match settings down the left, suits down the right, a name plate under each seat and a
// large ready button with the squad's ready count. Phones and short screens keep the dialog layout.
function buildSquadLobby(ui, model, area, full, size) {
  const { w, h } = size, lobby = model.lobby, { x, y: top } = area;
  if (lobby.preview) ui.add({ ...lobby.preview, kind: 'image', cover: true }, full);
  const side = Math.min(640, w * .42), shade = '#05090e';
  ui.add({ kind: 'shade', direction: 'down', from: shade + 'e6', to: shade + '00' }, { x: 0, y: 0, w, h: 160 });
  ui.add({ kind: 'shade', direction: 'right', from: shade + 'f2', to: shade + '00' }, { x: 0, y: 0, w: side, h });
  ui.add({ kind: 'shade', direction: 'left', from: shade + 'f2', to: shade + '00' }, { x: w - side, y: 0, w: side, h });
  ui.add({ kind: 'shade', direction: 'up', from: shade + 'fa', to: shade + '00' }, { x: 0, y: h - 320, w, h: 320 });

  ui.add({ ...text(model.kicker, 10, T.green), tracking: 1.4 }, { x, y: top + 1, w: area.w - 140, h: 15 });
  ui.add(heading(model.title, 46), { x, y: top + 20, w: area.w - 140, h: 48 });
  if (model.canBack !== false) ui.add(button('@back', 'Back', { icon: 'back', variant: 'ghost' }), { x: x + area.w - 120, y: top, w: 120, h: 44 });

  // The footer: ready count and status on the left, the room's actions and a large ready button on the right.
  const readyH = 60, fy = top + area.h - readyH;
  const footer = (model.footer ?? []).map(polish), ready = footer.find(b => b.primary);
  let bx = x + area.w;
  if (ready) {
    bx -= 280;
    ui.add({ ...ready, size: 22, height: readyH, detail: null, icon: 'arrow' }, { x: bx, y: fy, w: 280, h: readyH });
  }
  for (const action of footer.filter(b => b !== ready).reverse()) {
    bx -= 186;
    ui.add({ ...action, detail: null, height: 48, variant: 'ghost' }, { x: bx, y: fy + 6, w: 176, h: 48 });
  }
  ui.add({ ...text('SQUAD READY', 10, T.muted), tracking: 1.4 }, { x, y: fy + 2, w: 140, h: 14 });
  ui.add({ ...heading(lobby.ready, 36), color: T.green }, { x, y: fy + 18, w: 140, h: 40 });
  ui.add({ ...text(lobby.status, 13, T.muted), maxLines: 3 }, { x: x + 150, y: fy + 6, w: Math.max(80, bx - x - 170), h: 54 });

  // Settings and suits in side columns; on narrower screens the suits join the settings column.
  const colTop = top + 92, colBottom = fy - 22, colH = colBottom - colTop;
  const left = Math.round(Math.min(400, Math.max(320, w * .25))), right = Math.round(Math.min(380, Math.max(300, w * .23)));
  const compact = node => ({ ...node, ...(node.variant === 'operator' && colH < 520 ? { height: 74, compact: true } : {}), ...(node.children ? { children: node.children.map(compact) } : {}) });
  const rules = polish(lobby.rules), suits = lobby.suits && compact(polish(lobby.suits)), invite = lobby.invite && polish(lobby.invite);
  // Each column is as tall as what it holds, up to the space above the footer (then it scrolls).
  const fit = (nodes, width, label) => Math.min(colH, (label ? 61 : 28) + nodes.filter(Boolean)
    .reduce((sum, node, index) => sum + ui.height(node, width - 32) + (index ? 10 : 0), 0));
  let centerX = x + left + 24, centerW = area.w - left - right - 48;
  if (centerW >= 3 * 180 + 28) {
    pane(ui, 'rules', [rules, invite], { x, y: colTop, w: left, h: fit([rules, invite], left, true) }, 'Match');
    pane(ui, 'suits', [suits], { x: x + area.w - right, y: colTop, w: right, h: fit([suits], right) });
  } else {
    pane(ui, 'rules', [rules, suits, invite], { x, y: colTop, w: left, h: fit([rules, suits, invite], left, true) }, 'Match');
    centerW = area.w - left - 24;
  }

  // One plate per seat, in the order the suits stand on the pads (left to right).
  const seats = lobby.squad ?? [], gap = 14;
  const plateW = Math.min(250, (centerW - gap * (seats.length - 1)) / Math.max(1, seats.length)), plateH = 108;
  const rowW = seats.length * plateW + (seats.length - 1) * gap;
  seats.forEach((seat, index) => ui.add({ kind: 'nameplate', ...seat },
    { x: centerX + (centerW - rowW) / 2 + index * (plateW + gap), y: colBottom - plateH, w: plateW, h: plateH }));
}

function inspector(ui, model, nodes, r) {
  const part = model.id === 'armory-dialog' ? nodes.find(n => n.id === '@armory-part') : null;
  const sticky = part ? { ...part, ...(r.h < 250 ? { label: '' } : {}) } : null;
  if (sticky) {
    ui.add(sticky, { x: r.x, y: r.y, w: r.w, h: ui.height(sticky, r.w) });
    const sh = ui.height(sticky, r.w) + 14;
    pane(ui, 'body', nodes.filter(n => n !== part), { ...r, y: r.y + sh, h: Math.max(35, r.h - sh) });
  } else pane(ui, 'body', nodes, r);
}

function buildCombat(ui, model, area, full, size, state, measure) {
  const { w, h } = size, d = model.hud, compact = compactHud(w, h, model.touch), portrait = h > w;
  const x = area.x, top = area.y, right = w - area.x - area.w, bottom = h - area.y - area.h;
  ui.add({ kind: 'look', id: 'game:look', action: 'game:look', focusable: false }, full);
  // The motion tracker in the top-right corner, under the mute and pause buttons when they show.
  const buttonsShown = !d.locked || model.touch;
  const radarSize = d.radar ? compact ? 86 : 124 : 0;
  // In portrait the tissue bars run the full width under the buttons, so the tracker sits below them.
  const radarTop = compact && portrait ? top + (d.special ? 111 : 48) + 38 : top + (buttonsShown ? 52 : 0);
  const radarRect = d.radar ? { x: w - right - radarSize, y: radarTop, w: radarSize, h: radarSize } : null;
  // Screen-edge feedback sits under every panel: the hit vignette, the bearing of the last hit and
  // the low-integrity pulse.
  if (d.damage > 0 || d.damageStrength > 0 || (Number.isFinite(d.health) && d.health <= 30)) {
    ui.add({ kind: 'vitals', damage: d.damage, bearing: d.damageBearing, strength: d.damageStrength, health: d.health }, full);
  }
  if (d.scope) ui.add({ kind: 'scope' }, full);
  for (const path of d.paths) ui.add({ kind: 'path', ...path }, full);
  for (const marker of d.markers) {
    const width = marker.quiet ? 10 : Math.min(marker.kind === 'laser' ? 188 : compact ? 125 : 170, Math.max(65, ...marker.text.split('\n').map(line => measure(line, compact ? 10 : 11) + 12)));
    const font = compact ? 10 : 11, height = marker.quiet ? 14 : lines(marker.text, width - 8, measure, font).length * font * 1.3 + 8;
    const reservedTop = compact ? top + (portrait ? (d.special ? 235 : 165) : d.special ? 112 : 83) : top + 120;
    const markerY = Math.max(reservedTop, Math.min(h - bottom - 170 - height, marker.y - (marker.edge ? height / 2 : height)));
    const rect = { x: Math.max(2, Math.min(w - width - 2, marker.x - width / 2)), y: markerY, w: width, h: height };
    // Markers at the right edge drop below the tracker rather than cover it.
    if (radarRect && rect.x + rect.w > radarRect.x - 4 && rect.y < radarRect.y + radarRect.h + 6 && rect.y + rect.h > radarRect.y) rect.y = radarRect.y + radarRect.h + 6;
    if (marker.attacker) ui.add({ kind: 'label', text: marker.text, color: marker.color, size: font, box: true }, rect);
    else ui.add({ kind: 'marker', text: marker.quiet ? '' : marker.text, color: marker.color, size: font, edge: marker.edge, angle: marker.angle, quiet: marker.quiet }, rect);
  }
  const nodeWidth = compact ? (portrait ? area.w : Math.min(238, w / 2 - (d.special ? Math.min(250, w * .34) : 150) / 2 - x - 12)) : 252;
  const nodeTop = compact && portrait ? top + (d.special ? 111 : 48) : top;
  const nodeHeight = compact ? 32 : 34 + d.nodes.length * 33;
  ui.add({ kind: 'panel', hud: true, accent: '#8fe4dd' }, { x, y: nodeTop, w: nodeWidth, h: nodeHeight });
  if (!compact) ui.add({ ...text('TISSUE NODES', 10, '#9fb5b0'), weight: 700, tracking: 1.6 }, { x: x + 14, y: nodeTop + 10, w: nodeWidth - 24, h: 18 });
  d.nodes.forEach((node, i) => {
    const cw = (nodeWidth - 16 - (d.nodes.length - 1) * 9) / d.nodes.length;
    ui.add({ kind: 'meter', text: node.name, value: node.value, size: compact ? 9 : 11, segments: compact ? 0 : 20, thick: compact ? 3 : 4, color: node.danger ? '#ff977d' : ['#c8f794', '#8fe4dd', '#dbafef'][i] }, compact ? { x: x + 8 + i * (cw + 9), y: nodeTop + 5, w: cw, h: 25 } : { x: x + 12, y: nodeTop + 33 + i * 33, w: nodeWidth - 24, h: 29 });
  });
  const waveW = d.special ? (compact ? Math.min(250, portrait ? area.w - 110 : w * .34) : Math.min(340, w * .34)) : compact ? 150 : 190;
  const waveX = portrait && compact ? x : (w - waveW) / 2;
  if (d.special?.health != null) {
    // A boss: name over a wide segmented health bar, phase on the right; no duplicate readouts.
    const panel = d.special, detail = /^\d+%$/.test(panel.detail.trim()) ? '' : panel.detail;
    const bh = (compact ? 58 : 68) + (detail ? 18 : 0);
    ui.add({ kind: 'panel', hud: true, accent: '#ff8fae' }, { x: waveX, y: top, w: waveW, h: bh });
    ui.add({ ...heading(panel.title, compact ? 17 : 22), tracking: .6 }, { x: waveX + 14, y: top + 8, w: waveW - 90, h: 26 });
    ui.add({ ...text(Math.ceil(panel.health) + '%', compact ? 11 : 13, '#ffd0dc'), align: 'right', weight: 700 }, { x: waveX + waveW - 74, y: top + 12, w: 60, h: 18 });
    ui.add({ kind: 'meter', text: '', detail: '', value: panel.health, segments: 40, thick: compact ? 6 : 8, color: '#ff6f8f' }, { x: waveX + 14, y: top + (compact ? 30 : 36), w: waveW - 28, h: 16 });
    if (panel.phase) ui.add({ ...text(upper(panel.phase), 9, '#e6c9de'), weight: 700, tracking: 1.2 }, { x: waveX + 14, y: top + (compact ? 42 : 52), w: waveW - 28, h: 14 });
    if (detail) ui.add(text(detail, compact ? 10 : 11, '#e6c9de'), { x: waveX + 14, y: top + bh - 22, w: waveW - 28, h: 16 });
  } else if (d.special) {
    const panel = d.special;
    ui.add({ kind: 'panel', hud: true, accent: '#e7aac2' }, { x: waveX, y: top, w: waveW, h: compact ? 100 : 145 });
    ui.add(heading(panel.title, compact ? 18 : 27), { x: waveX + 8, y: top + 6, w: waveW - 16, h: 28 });
    ui.add(text(panel.detail, compact ? 10 : 12, '#e6c9de'), { x: waveX + 8, y: top + (compact ? 32 : 44), w: waveW - 16, h: 58 });
  } else {
    ui.add({ kind: 'panel', hud: true, accent: '#ffc888' }, { x: waveX, y: top, w: waveW, h: compact ? 45 : 93 });
    if (!compact) ui.add({ ...text(d.mode, 10, '#c9b9a4'), align: 'center', weight: 700, tracking: 1.4 }, { x: waveX, y: top + 7, w: waveW, h: 18 });
    ui.add({ ...heading(d.wave, compact ? 24 : 42), align: 'center' }, { x: waveX, y: top + (compact ? 0 : 20), w: waveW, h: 43 });
    ui.add({ ...text(d.threats, compact ? 9 : 10, '#ffc888'), align: 'center', weight: 600, tracking: .8 }, { x: waveX, y: top + (compact ? 30 : 69), w: waveW, h: 16 });
  }
  if (radarRect) ui.add({ kind: 'radar', ...d.radar, compact }, radarRect);
  const act = model.actions;
  // Desktop controls stay out of the fight: while the mouse is captured, Escape pauses instead.
  if (!d.locked || model.touch) {
    ui.add({ ...act.mute, text: d.muted ? '♪ Off' : '♪' }, { x: w - right - 94, y: top, w: 44, h: 44 });
    ui.add({ ...act.pause, text: 'Ⅱ' }, { x: w - right - 44, y: top, w: 44, h: 44 });
  }
  const healthW = compact ? 104 : 180, healthH = compact ? 44 : 100;
  const healthColor = d.health <= 25 ? '#ff977d' : d.health <= 50 ? '#ffd27a' : '#c8f794';
  ui.add({ kind: 'panel', hud: true, accent: healthColor }, { x, y: h - bottom - healthH, w: healthW, h: healthH });
  if (!compact) ui.add({ ...text('SUIT INTEGRITY', 10, '#9fb5b0'), weight: 700, tracking: 1.6 }, { x: x + 12, y: h - bottom - 90, w: healthW - 20, h: 18 });
  ui.add({ ...heading(d.health + '%', compact ? 28 : 46), color: healthColor }, { x: x + 10, y: h - bottom - (compact ? 40 : 68), w: healthW - 16, h: 40 });
  ui.add({ kind: 'meter', value: d.health, color: healthColor, text: '', detail: '', segments: compact ? 10 : 20, thick: compact ? 3 : 5 }, { x: x + 10, y: h - bottom - (compact ? 10 : 13), w: healthW - 20, h: 11 });
  const ammoW = compact ? 114 : 210, ammoH = compact ? 56 : 112;
  const ammoX = compact && model.touch && !portrait ? w - right - 182 - ammoW : w - right - ammoW;
  const ammoY = h - bottom - ammoH - (compact && portrait && model.touch ? 110 : 0);
  ui.add({ kind: 'panel', hud: true, accent: d.ammoState ? '#ffc888' : '#c8f794' }, { x: ammoX, y: ammoY, w: ammoW, h: ammoH });
  ui.add({ ...text(d.weapon, compact ? 9 : 10, '#9fb5b0'), weight: 700, tracking: 1.4 }, { x: ammoX + 12, y: ammoY + 8, w: ammoW - 20, h: 18 });
  ui.add({ ...heading(d.ammo, compact ? 28 : 46), align: 'right', color: d.ammoState ? '#ffc888' : '#eaf8d4' }, { x: ammoX + 8, y: ammoY + 18, w: ammoW - 18, h: 42 });
  if (!compact && d.magazine?.size > 0) ui.add({ kind: 'rounds', ...d.magazine, color: d.ammoState ? '#ffc888' : '#c8f794' }, { x: ammoX + 12, y: ammoY + 64, w: ammoW - 24, h: 10 });
  if (d.ammoState) ui.add(text(d.ammoState, 9, '#ffc888'), { x: ammoX + 8, y: ammoY + ammoH - 12, w: ammoW - 16, h: 12 });
  if (d.reload > 0) ui.add({ kind: 'meter', value: d.reload, text: '', detail: '' }, { x: ammoX + 8, y: ammoY + ammoH - 7, w: ammoW - 16, h: 8 });
  if (!compact) {
    ui.add({ ...text(d.score, 11, '#d7e6e1'), align: 'right', weight: 600, tracking: .6 }, { x: w - right - 250, y: radarRect ? radarRect.y + radarRect.h + 8 : top + 54, w: 250, h: 20 });
    ui.add({ ...text(d.turret, 10, '#8fe4dd'), align: 'right' }, { x: ammoX, y: ammoY + ammoH - 20, w: ammoW - 10, h: 16 });
    if (d.weaponSlots?.length) ui.add({ kind: 'slots', slots: d.weaponSlots }, { x: ammoX, y: ammoY - 30, w: ammoW, h: 24 });
  } else if (!model.touch) ui.add({ ...text(d.turret, 9, '#8fe4dd'), align: 'right' }, { x: ammoX, y: ammoY - 18, w: ammoW, h: 16 });
  if (d.abilities) {
    // Above the suit panel: grenades and stun charges as pips, dash and bash as charge bars.
    const a = d.abilities, [gKey, sKey, dKey, bKey] = a.keys ?? [];
    const pw = compact ? 104 : 180, py = h - bottom - healthH - (compact ? 30 : 56);
    if (compact) {
      ui.add({ kind: 'panel', hud: true, accent: '#9dffd2' }, { x, y: py, w: pw, h: 26 });
      const pips = (n, max) => '◆'.repeat(Math.max(0, n)) + '◇'.repeat(Math.max(0, max - n));
      ui.add(text('GRN ' + pips(a.grenades, Math.max(2, a.grenades)), 8, a.grenades ? '#9dffd2' : '#7d8a80'), { x: x + 6, y: py + 3, w: pw / 2 - 6, h: 14 });
      ui.add(text('STN ' + pips(a.stuns, Math.max(1, a.stuns)), 8, a.stuns ? '#a9e6ff' : '#7d8a80'), { x: x + pw / 2, y: py + 3, w: pw / 2 - 6, h: 14 });
    } else {
      // Four tiles: grenade and stun show their charges as pips, dash and bash a recharge sweep.
      const gap = 4, tw = (pw - gap * 3) / 4;
      const tiles = [
        { icon: 'grenade', key: gKey, count: a.grenades, max: Math.max(2, a.grenades), color: '#9dffd2' },
        { icon: 'stun', key: sKey, count: a.stuns, max: Math.max(1, a.stuns), color: '#a9e6ff' },
        { icon: 'dash', key: dKey, charge: a.dash, color: '#c8f794' },
        { icon: 'bash', key: bKey, charge: a.bash, color: '#ffd27a' },
      ];
      tiles.forEach((tile, i) => ui.add({ kind: 'ability', ...tile }, { x: x + i * (tw + gap), y: py, w: tw, h: 48 }));
    }
  }
  const allyY = compact ? (portrait ? nodeTop + (d.hazard ? 76 : 39) : top + 37) : nodeTop + nodeHeight + 8;
  if (d.ally) ui.add(text(d.ally, 10, '#b2e8ff'), { x, y: allyY, w: nodeWidth, h: 28 });
  let hazardY = 0;
  if (d.hazard) {
    const hy = compact ? (portrait ? nodeTop + 39 : top + (d.ally ? 68 : 39)) : top + (d.special?.health != null ? 80 + (/^\d+%$/.test(d.special.detail.trim()) ? 0 : 18) : d.special ? 155 : 105);
    hazardY = hy;
    ui.add({ kind: 'label', text: d.hazard, hazard: true, align: 'left', size: compact ? 10 : 12, color: '#ffca96' }, { x: compact ? x : waveX, y: hy, w: compact ? Math.min(228, nodeWidth) : waveW, h: 30 });
  }
  const notice = d.notice || d.training || d.alert || d.surge;
  if (notice) {
    const width = Math.min(390, portrait ? area.w : w * .43), font = d.training ? 13 : 11;
    const height = Math.min(85, lines(notice, width - 16, measure, font).length * font * 1.3 + 12);
    const ny = compact ? Math.max(top + (portrait ? (d.special ? 184 : d.hazard ? 170 : 85) : d.special ? 108 : 51), portrait && d.ally ? allyY + 34 : 0, portrait && d.hazard ? hazardY + 36 : 0) : top + 108;
    const nx = compact ? Math.max((w - width) / 2, !portrait && (d.hazard || d.ally) ? x + nodeWidth + 10 : 0) : w - right - width;
    const noticeRect = { x: nx, y: ny, w: width, h: height };
    // Clear of the tracker (and, on desktop, the score under it).
    if (radarRect && noticeRect.x + noticeRect.w > radarRect.x && noticeRect.y < radarRect.y + radarRect.h + (compact ? 6 : 32)) noticeRect.y = radarRect.y + radarRect.h + (compact ? 6 : 34);
    ui.add({ kind: 'label', text: notice, size: font, box: true, color: '#ffe0ae' }, noticeRect);
  }
  if (d.prompt) {
    const width = Math.min(340, area.w - (portrait ? 0 : 230));
    ui.add({ kind: 'label', text: d.prompt, box: true, size: 11 }, { x: (w - width) / 2, y: h - bottom - (portrait ? 202 : 86), w: width, h: 38 });
    if (d.repair > 0) ui.add({ kind: 'meter', text: '', detail: '', value: d.repair }, { x: (w - width) / 2 + 8, y: h - bottom - (portrait ? 171 : 55), w: width - 16, h: 8 });
  }
  if (d.grip) {
    // Held by a Grip Phage: a pulsing alarm under the crosshair with the bash control.
    const label = upper(d.grip.text) + (d.grip.key ? '  [' + d.grip.key + ']' : '');
    const width = Math.min(area.w, measure(label, compact ? 12 : 14) + 40);
    ui.add({ kind: 'label', text: label, box: true, alarm: true, size: compact ? 12 : 14, color: '#ffb3a3', align: 'center' }, { x: (w - width) / 2, y: h / 2 + (compact ? 46 : 70), w: width, h: compact ? 30 : 36 });
  }
  if (d.shielded && !d.grip) {
    // A shot bounced off a shield: say which weak point to shoot instead.
    const label = upper(d.shielded.text);
    const width = Math.min(area.w, measure(label, compact ? 11 : 13) + 36);
    ui.add({ kind: 'label', text: label, box: true, size: compact ? 11 : 13, color: '#8ff0ff', align: 'center' }, { x: (w - width) / 2, y: h / 2 + (compact ? 46 : 62), w: width, h: compact ? 26 : 30 });
  }
  if ((!d.aiming && !d.scope) || d.hit) ui.add({ kind: 'reticle', offset: d.spread, hit: d.hit ? d.hitStrength || 1 : 0, crit: d.crit, kill: d.kill, aiming: d.aiming || d.scope, color: '#eaf8d4' }, { x: w / 2 - 40, y: h / 2 - 40, w: 80, h: 80 });
  if (model.touch) {
    const by = h - bottom - 95, bx = w - right - 166;
    ui.add({ kind: 'stick', id: 'game:stick', action: 'game:stick' }, { x: x + 5, y: h - bottom - 141, w: 92, h: 92 });
    for (const [name, xx, yy] of [['swap', 0, 0], ['turret', 51, 0], ['reload', 0, 51], ['repair', 51, 51],
      ['jump', 0, -51], ['dash', 51, -51], ['melee', 102, -51], ['crouch', 0, -102], ['grenade', 51, -102], ['stun', 102, -102]]) {
      const source = act[name]; if (!source) continue;
      ui.add({ ...source, kind: ['reload', 'repair', 'turret'].includes(name) ? 'hold' : 'button', text: source.text || name, size: 9, round: true,
        // While a Grip Phage holds the suit, the bash button calls for a tap.
        ...(name === 'melee' && d.grip ? { color: '#ff8a73', alarm: true } : {}) }, { x: bx + xx, y: by + yy, w: 44, h: 44 });
    }
    ui.add({ kind: 'hold', id: 'game:fire', action: 'game:fire', text: 'FIRE', touchIcon: 'fire', size: 12, primary: true, round: true }, { x: w - right - 64, y: by + 16, w: 64, h: 64 });
  }
  if (d.supply?.length) {
    const width = Math.min(480, area.w), height = 200;
    ui.add({ kind: 'panel' }, { x: (w - width) / 2 - 8, y: top + 84, w: width + 16, h: height });
    ui.pane('supply', [heading('Regroup / field support', 20), text(d.supplyNote, 11), grid(d.supply, 140, 2)], { x: (w - width) / 2, y: top + 94, w: width, h: height - 20 });
  }
}
