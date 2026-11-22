import test from 'node:test';
import assert from 'node:assert/strict';
import { compactHud, shortNodeName, importantNode, fieldTargets, EncounterNotice } from '../dist/hud-layout.mjs';

test('phones use the compact HUD in both orientations; desktop remains full size', () => {
  for (const [w, h] of [[393, 852], [852, 393], [844, 390], [667, 375], [1180, 500]]) assert.equal(compactHud(w, h), true);
  assert.equal(compactHud(1194, 834, true), true);
  assert.equal(compactHud(1280, 720), false);
  assert.equal(compactHud(1920, 1080), false);
});

test('short node labels distinguish branches with a common noun', () => {
  const nodes = [{ name: 'Left Bronchus' }, { name: 'Right Bronchus' }];
  assert.deepEqual(nodes.map(n => shortNodeName(n, nodes)), ['Left', 'Right']);
  const artery = [{ name: 'Arterial Core' }, { name: 'Lateral Branch' }, { name: 'Venous Wall' }];
  assert.deepEqual(artery.map(n => shortNodeName(n, artery)), ['Core', 'Branch', 'Wall']);
  const duplicates = [{ name: 'Upper Left Tissue' }, { name: 'Upper Right Tissue' }];
  assert.equal(shortNodeName(duplicates[0], duplicates), 'Upper Left Tissue');
});

test('node arrows retain damage, active attacks, gashes and blocked airways', () => {
  const node = { id: 'left', health: 100, underAttack: false };
  assert.equal(importantNode(node, {}), false);
  assert.equal(importantNode({ ...node, underAttack: true }, {}), true);
  assert.equal(importantNode({ ...node, health: 74 }, {}), true);
  assert.equal(importantNode(node, { gash: { nodeId: 'left' } }), true);
  assert.equal(importantNode(node, { airway: { ports: [{ nodeId: 'left', open: false }] } }), true);
  assert.equal(importantNode(node, { airway: { ports: [{ nodeId: 'left', open: true }] } }), false);
});

test('compact field markers prioritize danger and nearby objectives without changing simulation order', () => {
  const targets = ['cache', 'nest', 'nest', 'nest', 'boss', 'laser', 'encounter'].map((kind, i) => ({ kind, x: i, z: 0 }));
  const original = [...targets], player = { x: 0, z: 0 };
  assert.deepEqual(fieldTargets(targets, player, true).map(t => t.kind), ['laser', 'boss', 'encounter', 'nest']);
  assert.equal(fieldTargets(targets, player, true)[3], targets[1]);
  assert.deepEqual(targets, original);
  assert.equal(fieldTargets(targets, player, false), targets);
});

test('a marker budget never drops simultaneous laser warnings or a boss', () => {
  const targets = [...Array.from({ length: 5 }, (_, x) => ({ kind: 'laser', x, z: 0 })), { kind: 'boss', x: 9, z: 0 }, { kind: 'cache', x: 0, z: 0 }];
  assert.equal(fieldTargets(targets, { x: 0, z: 0 }, true).length, 6);
});

test('encounter notices fade after arrival while warnings and delayed breaches remain visible', () => {
  const view = new EncounterNotice(), e = { id: 1, stage: 'warning' };
  assert.equal(view.update(e, 10), true);
  assert.equal(view.update(e, 90), true);
  e.stage = 'holding';
  assert.equal(view.update(e, 95), true);
  assert.equal(view.update(e, 120), true);
  e.stage = 'active';
  assert.equal(view.update(e, 125), true);
  assert.equal(view.update(e, 127.4), true);
  assert.equal(view.update(e, 127.5), false);
  e.stage = 'clear';
  assert.equal(view.update(e, 130), true);
  assert.equal(view.update(e, 132), false);
});

test('new encounters, reroutes, replay and reconnect clocks restart a notice', () => {
  const view = new EncounterNotice(), e = { id: 1, stage: 'active' };
  view.update(e, 20);
  assert.equal(view.update(e, 30), false);
  assert.equal(view.update({ ...e, id: 2 }, 30), true);
  assert.equal(view.update({ ...e, id: 2, reroute: true }, 40), true);
  assert.equal(view.update({ ...e, id: 2, reroute: true }, 1), true);
  assert.equal(view.update(null, 1), false);
  assert.equal(view.update(e, 1), true);
});

test('a decoy rush announces the real breach even after its arrival notice faded', () => {
  const view = new EncounterNotice(), e = { id: 1, stage: 'active', pattern: 'feint', spawned: 1 };
  view.update(e, 0);
  assert.equal(view.update(e, 4), false);
  assert.equal(view.update({ ...e, spawned: 3 }, 5), true);
  assert.equal(view.update({ ...e, spawned: 4 }, 8), false);
});
