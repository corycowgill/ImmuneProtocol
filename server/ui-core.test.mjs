import test from 'node:test';
import assert from 'node:assert/strict';
import { UiLayout, UiPointers, lines, inside, intersect, hitTest, nextFocus, rangeValue, stickValue } from '../dist/ui-core.mjs';
import { buildUiScreen } from '../dist/ui-screens.mjs';
import { GameUi } from '../dist/ui-browser.mjs';
import { CanvasUiRenderer } from '../dist/ui-renderer.mjs';

const measure = (s, size = 14) => String(s).length * size * .56;
const btn = (id, extra = {}) => ({ kind: 'button', id, action: id, text: 'Control ' + id, ...extra });
const rect = (x = 0, y = 0, w = 100, h = 50) => ({ x, y, w, h });
const state = () => ({ scroll: {}, focus: null });
const safe = { left: 0, right: 0, top: 0, bottom: 0 };

test('text wraps long words, explicit paragraphs and empty text without overflowing', () => {
  const result = lines('A long_identifier_without_spaces\nSecond paragraph', 80, measure, 14);
  assert.ok(result.length > 3);
  assert.ok(result.every(line => measure(line, 14) <= 80));
  assert.deepEqual(lines('', 50, measure), ['']);
});

test('hit testing respects clips, disabled controls and front-to-back order', () => {
  const controls = [ { ...btn('back'), rect: rect() }, { ...btn('front'), rect: rect(20, 10), clip: rect(40, 0, 30, 80) } ];
  assert.equal(hitTest(controls, 50, 20).id, 'front');
  assert.equal(hitTest(controls, 25, 20).id, 'back');
  controls[1].disabled = true;
  assert.equal(hitTest(controls, 50, 20).id, 'back');
  assert.equal(hitTest(controls, 180, 20), undefined);
  assert.deepEqual(intersect(rect(0, 0, 20, 20), rect(10, 10, 20, 20)), rect(10, 10, 10, 10));
  assert.equal(inside(rect(), 100, 25), false);
});

test('nested layout reports the real content height and clamps scrolling on resize', () => {
  const scroll = { body: 9999 }, layout = new UiLayout(measure, scroll);
  const nodes = [{ kind: 'stack', children: [btn('a'), { kind: 'grid', minColumn: 100, children: [btn('b'), btn('c'), btn('d')] }, btn('e')] }];
  layout.pane('body', nodes, rect(10, 20, 280, 100));
  const pane = layout.panes[0], last = layout.draw.at(-1);
  assert.equal(scroll.body, pane.max);
  assert.equal(last.rect.y + last.rect.h, pane.rect.y + pane.rect.h);
  const wide = new UiLayout(measure, scroll); wide.pane('body', nodes, rect(10, 20, 1000, 1000));
  assert.equal(scroll.body, 0);
  assert.ok(wide.draw.every(item => item.rect.y >= 20));
});

test('slider input rounds to steps and sticks normalize diagonal movement', () => {
  const item = { rect: rect(0, 0, 128, 60), min: .5, max: 2.5, step: .1 };
  assert.equal(rangeValue(item, 64), 1.5);
  assert.equal(rangeValue(item, -100), .5);
  assert.equal(rangeValue(item, 999), 2.5);
  const stick = stickValue(rect(0, 0, 100, 100), 200, 200);
  assert.ok(Math.abs(Math.hypot(stick.x, stick.z) - 1) < 1e-9);
  assert.deepEqual(stickValue(rect(0, 0, 100, 100), 50, 50), { x: 0, z: -0 });
});

test('focus navigation follows geometry and skips disabled controls', () => {
  const items = [{ ...btn('a', { primary: true }), rect: rect() }, { ...btn('b'), rect: rect(110, 0) }, { ...btn('c', { disabled: true }), rect: rect(0, 60) }, { ...btn('d'), rect: rect(0, 120) }];
  assert.equal(nextFocus(items, null, 'down').id, 'a');
  assert.equal(nextFocus(items, 'a', 'right').id, 'b');
  assert.equal(nextFocus(items, 'a', 'down').id, 'd');
});

function pointerFixture() {
  const events = [], host = Object.fromEntries(['activate', 'hold', 'stick', 'value', 'look', 'preview', 'scroll'].map(name => [name, (...args) => events.push([name, ...args])]));
  return { pointers: new UiPointers(host), events };
}
test('movement, aiming and firing own independent touch pointers', () => {
  const { pointers, events } = pointerFixture(), point = { x: 50, y: 50 };
  pointers.down(1, { kind: 'stick', rect: rect(0, 0, 100, 100) }, point);
  pointers.down(2, { kind: 'look', rect: rect() }, point);
  pointers.down(3, { kind: 'hold', action: 'fire', rect: rect() }, point);
  pointers.move(1, { x: 100, y: 50 }); pointers.move(2, { x: 70, y: 60 });
  pointers.cancel(3);
  assert.equal(pointers.pointers.size, 2);
  assert.deepEqual(events.filter(e => e[0] === 'hold'), [['hold', 'fire', true], ['hold', 'fire', false]]);
  pointers.clear();
  assert.equal(pointers.pointers.size, 0);
  assert.deepEqual(events.filter(e => e[0] === 'stick').at(-1), ['stick', { x: 0, z: 0 }]);
});

test('one finger releasing a shared held action does not release another finger', () => {
  const { pointers, events } = pointerFixture(), point = { x: 30, y: 30 }, fire = { kind: 'hold', action: 'fire', rect: rect() };
  pointers.down(1, fire, point); pointers.down(2, fire, point); pointers.cancel(1);
  assert.deepEqual(events, [['hold', 'fire', true]]);
  pointers.cancel(2); assert.deepEqual(events.at(-1), ['hold', 'fire', false]);
});

test('scroll gestures and cancellation never activate the button underneath', () => {
  const { pointers, events } = pointerFixture();
  const item = { ...btn('weapon'), rect: rect(), pane: 'parts' };
  pointers.down(1, item, { x: 10, y: 40 }); pointers.move(1, { x: 10, y: 10 }); pointers.up(1, { x: 10, y: 10 });
  assert.equal(events.some(e => e[0] === 'activate'), false);
  assert.ok(events.some(e => e[0] === 'scroll' && e[2] === 30));
  pointers.down(2, item, { x: 10, y: 10 }); pointers.cancel(2);
  assert.equal(events.some(e => e[0] === 'activate'), false);
});

const sizes = [{ w: 393, h: 852 }, { w: 852, h: 393 }, { w: 667, h: 375 }, { w: 1280, h: 720 }];
test('every menu action stays reachable with logical scrolling at phone and desktop sizes', () => {
  const model = { type: 'menu', id: 'menu', detail: 'Defend the host', mute: btn('mute'), settings: btn('settings'), buttons: Array.from({ length: 7 }, (_, i) => btn(String(i))), status: [] };
  for (const size of sizes) {
    const scene = buildUiScreen(JSON.parse(JSON.stringify(model)), size, safe, state(), measure);
    assert.equal(scene.hits.length, 9);
    for (const hit of scene.hits) { assert.ok(hit.rect.w >= 44); assert.ok(hit.rect.h >= 44); }
    assert.ok(scene.panes.every(p => p.rect.x >= 0 && p.rect.y >= 0 && p.rect.x + p.rect.w <= size.w));
  }
});

test('all dialog families use the same portable canvas contract and fixed action footer', () => {
  for (const id of ['mission-dialog', 'armory-dialog', 'guide-dialog', 'manual-dialog', 'settings-dialog', 'coop-dialog', 'pause-dialog', 'extraction-dialog', 'result-dialog', 'new-campaign-dialog']) for (const size of sizes) {
    const model = { id, type: 'dialog', title: 'Screen', body: [headingFixture(), ...Array.from({ length: 15 }, (_, i) => btn('body' + i))], footer: [btn('done', { primary: true })] };
    const scene = buildUiScreen(model, size, safe, state(), measure), done = scene.hits.find(h => h.id === 'done');
    assert.ok(done.rect.y + done.rect.h <= size.h);
    assert.ok(scene.panes[0].max > 0);
    assert.ok(scene.hits.some(h => h.id === 'body14'));
    assert.doesNotThrow(() => JSON.stringify(scene));
  }
});
function headingFixture() { return { kind: 'heading', text: 'Options', size: 20 }; }

test('open choice popups exclude underlying screen controls from hit testing', () => {
  const s = state(); s.popup = { id: 'quality', label: 'Graphics quality', value: 'high', options: [{ value: 'high', text: 'High' }, { value: 'low', text: 'Low' }] };
  const scene = buildUiScreen({ id: 'settings', type: 'dialog', title: 'Settings', body: [btn('background')], footer: [] }, sizes[0], safe, s, measure);
  assert.deepEqual(scene.hits.map(h => h.id), ['@close-popup', '@option:0', '@option:1']);
  assert.deepEqual(scene.panes.map(p => p.id), ['popup']);
});

test('safe areas keep interactive menu controls clear of iPhone screen cutouts', () => {
  const model = { type: 'menu', id: 'menu', mute: btn('mute'), settings: btn('settings'), buttons: [btn('start')], status: [] };
  const scene = buildUiScreen(model, sizes[1], { top: 0, left: 59, right: 59, bottom: 21 }, state(), measure);
  assert.ok(scene.hits.every(h => h.rect.x >= 59 && h.rect.x + h.rect.w <= 852 - 59));
});

test('desktop UI retains the host pixel density', () => {
  const canvas = { getContext: () => ({}) }, renderer = new CanvasUiRenderer(canvas, () => null);
  renderer.resize(800, 400, 3);
  assert.equal(canvas.width, 2400); assert.equal(canvas.height, 1200);
});

function controllerUi() {
  const ui = new GameUi(), actions = [];
  ui.active = true; ui.model = { type: 'dialog', id: 'settings-dialog', defaultFocus: 'a' };
  ui.bindings = { active: () => ({ id: 'settings-dialog' }), activate: action => actions.push(action), back: () => actions.push('back'), actions: new Map() };
  ui.scene = { hits: ['a', 'b', 'c'].map((id, i) => ({ ...btn(id), rect: rect(0, i * 70) })), panes: [] };
  return { ui, actions };
}
const pad = (pressed = {}, menuY = 0) => ({ pressed, menuX: 0, menuY });
test('controller confirm invokes the focused action through the host binding', () => {
  const { ui, actions } = controllerUi();
  assert.equal(ui.menuGamepad(pad({ confirm: true }), 0), true);
  assert.deepEqual(actions, ['a']);
});
test('held controller directions honor initial delay and repeat interval', () => {
  const { ui } = controllerUi();
  ui.menuGamepad(pad({}, 1), 0); assert.equal(ui.state.focus, 'b');
  ui.menuGamepad(pad({}, 1), 200); assert.equal(ui.state.focus, 'b');
  ui.menuGamepad(pad({}, 1), 331); assert.equal(ui.state.focus, 'c');
});
test('controller back dismisses the current popup before closing its screen', () => {
  const { ui, actions } = controllerUi(); ui.state.popup = { id: 'parts', options: [] };
  ui.menuGamepad(pad({ back: true }), 0);
  assert.equal(ui.state.popup, null); assert.deepEqual(actions, []);
  ui.menuGamepad(pad({ back: true }), 10); assert.deepEqual(actions, ['back']);
});

test('forced extraction choices have no misleading back control', () => {
  const scene = buildUiScreen({ id: 'extraction', type: 'dialog', title: 'Extraction ready', canBack: false, body: [], footer: [btn('extract'), btn('overtime')] }, sizes[1], safe, state(), measure);
  assert.deepEqual(scene.hits.map(item => item.id), ['extract', 'overtime']);
});

test('long portrait screen titles reserve space before the content pane', () => {
  const title = 'MINIATURIZATION LAB';
  const scene = buildUiScreen({ id: 'coop', type: 'dialog', title, body: [btn('suit')], footer: [btn('ready')] }, sizes[0], safe, state(), measure);
  const label = scene.draw.find(item => item.kind === 'heading' && item.text === title);
  assert.ok(scene.panes[0].rect.y >= label.rect.y + label.rect.h);
});

test('combat panels and touch targets stay separate at phone and desktop aspect ratios', () => {
  for (const size of [...sizes, { w: 568, h: 320 }]) for (const special of [null, { title: 'Mega Virus', detail: 'Shell sealed', phase: 'Phase 1 / 3', health: 100 }]) {
    const model = { id: 'game', type: 'combat', touch: size.w < 900, actions: Object.fromEntries(['mute', 'pause', 'swap', 'turret', 'reload', 'repair'].map(id => [id, btn('game:' + id)])), hud: { nodes: ['Core', 'Branch', 'Wall'].map(name => ({ name, value: 100 })), paths: [], markers: [], special, health: 100, ammo: '30', weapon: 'Needle Carbine', wave: '01 / 05', threats: '18 threats left', hazard: 'Hazard in 4s', ally: 'Teammate: 100%', notice: 'Incoming breach' } };
    const scene = buildUiScreen(model, size, safe, state(), measure);
    const panels = scene.draw.filter(d => d.kind === 'panel');
    const overlap = intersect(panels[0].rect, panels[1].rect);
    assert.equal(overlap.w * overlap.h, 0, JSON.stringify({ size, special }));
    assert.ok(scene.hits.filter(h => h.kind !== 'look').every(h => h.rect.w >= 44 && h.rect.h >= 44));
    assert.ok(scene.hits.every(h => h.rect.x >= 0 && h.rect.x + h.rect.w <= size.w));
  }
});

test('short landscape settings keep the first options visible and every option reachable', () => {
  const slider = id => ({ kind: 'slider', id, action: id, label: id, value: 1, min: 0, max: 2 });
  const quality = { kind: 'choice', id: 'quality', action: 'quality', label: 'Graphics quality', value: 'high', options: [{ value: 'high', text: 'High' }] };
  const model = { id: 'settings-dialog', type: 'dialog', title: 'Settings', body: [], footer: [btn('done')], settingsGroups: [{ text: 'Controls', nodes: [slider('sensitivity')] }, { text: 'Video', nodes: [quality, { kind: 'text', text: 'Use Low for smoother rendering on slower devices.' }] }, { text: 'Audio', nodes: [slider('music'), slider('effects')] }] };
  for (const size of [{ w: 852, h: 393 }, { w: 667, h: 375 }, { w: 568, h: 320 }]) {
    const scene = buildUiScreen(model, size, safe, state(), measure);
    for (const id of ['sensitivity']) {
      const hit = scene.hits.find(item => item.id === id);
      assert.deepEqual(intersect(hit.rect, hit.clip), hit.rect, id + JSON.stringify(size));
    }
    for (const id of ['sensitivity', 'quality', 'music', 'effects']) {
      const hit = scene.hits.find(item => item.id === id);
      assert.ok(hit, id + ' is in the scrolling pane' + JSON.stringify(size));
      assert.ok(hit.rect.h >= 44);
    }
  }
});

test('phone workspace tabs expose setup without leaving the mission screen', () => {
  const s = state(); s.pages = { 'mission-dialog': 'configuration' };
  const model = { id: 'mission-dialog', type: 'dialog', title: 'Deployment', sidebar: [btn('mission', { selected: true })], body: [], briefing: [{ kind: 'text', text: 'Mission story' }], configuration: [btn('easy'), btn('hard')], footer: [btn('deploy')] };
  const scene = buildUiScreen(model, sizes[1], safe, s, measure);
  assert.ok(scene.hits.some(item => item.id === 'easy'));
  assert.equal(scene.draw.some(item => item.text === 'Mission story'), false);
  assert.ok(scene.hits.some(item => item.id === 'deploy'));
  assert.equal(scene.hits.find(item => item.id === '@view:configuration').selected, true);
});

test('manual categories isolate their content while keeping the return action', () => {
  const s = state(); s.pages = { 'manual-dialog': 'tactics' };
  const model = { id: 'manual-dialog', type: 'dialog', title: 'Field manual', body: [], views: [{ id: 'controls', text: 'Controls', body: [btn('keybinds')] }, { id: 'tactics', text: 'Tactics', body: [btn('repair')] }], footer: [btn('return')] };
  const scene = buildUiScreen(model, sizes[0], safe, s, measure);
  assert.equal(scene.hits.some(item => item.id === 'keybinds'), false);
  assert.ok(scene.hits.some(item => item.id === 'repair'));
  assert.ok(scene.hits.some(item => item.id === 'return'));
});

test('destructive campaign confirmation defaults to keeping the checkpoint', () => {
  const ui = new GameUi(), actions = [];
  ui.active = true; ui.model = { id: 'new-campaign-dialog', type: 'dialog', title: 'Start new campaign?', defaultFocus: 'keep', body: [{ kind: 'text', text: 'Starting again replaces your campaign checkpoint.' }], footer: [btn('keep'), btn('start', { primary: true })] };
  ui.scene = buildUiScreen(ui.model, sizes[3], safe, ui.state, measure);
  ui.bindings = { activate: id => actions.push(id), actions: new Map() };
  ui.key('Enter');
  assert.deepEqual(actions, ['keep']);
  const card = ui.scene.draw.find(item => item.kind === 'panel');
  assert.ok(card.rect.w < sizes[3].w * .6);
  assert.ok(card.rect.h < sizes[3].h * .6);
});

test('short victory reports show all four reward choices beside their metrics', () => {
  const model = { id: 'result-dialog', type: 'dialog', title: 'Artery secured', body: [], footer: [btn('continue'), btn('armory'), btn('menu')], report: { label: 'Choose a field upgrade', summary: ['Score', 'Neutralized', 'Tissue'].map(text => ({ kind: 'keyrow', text, detail: '100%' })), options: ['Sealer', 'Magazine', 'Suit', 'Turret'].map(id => btn(id, { detail: 'Useful equipment for the next mission.', selected: false })) } };
  const scene = buildUiScreen(model, sizes[1], safe, state(), measure);
  for (const id of ['Sealer', 'Magazine', 'Suit', 'Turret', '@report-details']) {
    const hit = scene.hits.find(item => item.id === id);
    const visible = intersect(hit.rect, hit.clip);
    for (const axis of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(visible[axis] - hit.rect[axis]) < .01, id + ':' + axis);
  }
  assert.ok(scene.hits.find(item => item.id === 'continue'));
});
