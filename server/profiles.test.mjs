import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_PROFILES, PROFILE_EMBLEMS, PROFILE_INDEX_KEY, PROFILE_KEYS, ProfileStore, cleanProfileName, profileKey } from '../dist/profiles.mjs';
import { ACHIEVEMENT_STORAGE_KEY } from '../dist/achievements.mjs';
import * as store from '../dist/settings-store.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A minimal in-memory localStorage.
class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
let seed = 1;
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const make = storage => new ProfileStore(storage, { now: () => 1700000000000, random });

test('a first visit sets up one fresh operator', () => {
  const storage = new MemoryStorage();
  const profiles = make(storage);
  assert.equal(profiles.profiles.length, 1);
  assert.equal(profiles.active.name, 'Operator 1');
  assert.ok(profiles.fresh && !profiles.migrated);
  assert.ok(storage.getItem(PROFILE_INDEX_KEY));
});

test('an existing save moves into the first operator, named after its co-op callsign', () => {
  const storage = new MemoryStorage({
    'immune-protocol.best-score': '52000', 'immune-protocol.unlocked-mission': 'lungs', 'immune-protocol.coop-name': 'Dr Byte',
    [ACHIEVEMENT_STORAGE_KEY]: JSON.stringify({ unlocked: { 'patient-zero': 1, 'clot-buster': 2 } }),
    'immune-protocol.graphics-quality': 'low', 'immune-protocol.keybinds': '{}',
  });
  const profiles = make(storage);
  const id = profiles.active.id;
  assert.equal(profiles.active.name, 'Dr Byte');
  assert.ok(profiles.migrated && !profiles.fresh);
  assert.equal(storage.getItem('immune-protocol.best-score'), null, 'progress moved, not copied');
  assert.equal(storage.getItem(profileKey(id, 'immune-protocol.best-score')), '52000');
  assert.equal(storage.getItem('immune-protocol.graphics-quality'), 'low', 'device settings stay shared');
  assert.equal(storage.getItem('immune-protocol.keybinds'), '{}');
  assert.deepEqual(profiles.summary(id), { secured: 3, missions: 10, achievements: 2, totalAchievements: 56, points: 20, best: 52000 });
});

test('progress keys follow the active operator; device settings do not', () => {
  const storage = new MemoryStorage();
  const profiles = make(storage);
  const first = profiles.active.id, second = profiles.create('Nurse Ratched').id;
  for (const key of PROFILE_KEYS) assert.equal(profiles.scope(key), profileKey(first, key));
  assert.equal(profiles.scope('immune-protocol.look-sensitivity'), 'immune-protocol.look-sensitivity');
  assert.equal(profiles.scope('immune-protocol.setting.fov'), 'immune-protocol.setting.fov');
  storage.setItem(profiles.scope('immune-protocol.best-score'), '100');
  profiles.select(second);
  assert.equal(storage.getItem(profiles.scope('immune-protocol.best-score')), null, 'a new operator starts clean');
  storage.setItem(profiles.scope('immune-protocol.best-score'), '900');
  profiles.select(first);
  assert.equal(storage.getItem(profiles.scope('immune-protocol.best-score')), '100');
  // The choice survives a reload.
  assert.equal(make(storage).active.id, first);
});

test('names are trimmed, unique and limited; up to eight operators', () => {
  const profiles = make(new MemoryStorage());
  assert.equal(cleanProfileName('  Major\n  Tom  '), 'Major Tom');
  assert.equal(cleanProfileName('x'.repeat(40)).length, 16);
  const a = profiles.create('Medic');
  assert.equal(profiles.create('medic').name, 'Operator 3', 'a taken name falls back to a free one');
  assert.equal(profiles.rename(a.id, '   '), null);
  assert.equal(profiles.rename(a.id, 'OPERATOR 1'), null, 'names are unique ignoring case');
  assert.equal(profiles.rename(a.id, 'Medic Prime'), 'Medic Prime');
  assert.ok(profiles.setEmblem(a.id, 'phage') && !profiles.setEmblem(a.id, 'not-an-emblem'));
  while (profiles.canCreate) profiles.create();
  assert.equal(profiles.profiles.length, MAX_PROFILES);
  assert.equal(profiles.create('One too many'), null);
  assert.equal(new Set(profiles.profiles.map(p => p.name.toLowerCase())).size, MAX_PROFILES);
});

test('deleting an operator removes only their save, and the last one cannot be deleted', () => {
  const storage = new MemoryStorage();
  const profiles = make(storage);
  const keep = profiles.active.id, gone = profiles.create('Temp').id;
  storage.setItem(profileKey(keep, 'immune-protocol.best-score'), '1');
  storage.setItem(profileKey(gone, 'immune-protocol.best-score'), '2');
  storage.setItem(profileKey(gone, ACHIEVEMENT_STORAGE_KEY), '{}');
  profiles.select(gone);
  assert.ok(profiles.remove(gone));
  assert.equal(profiles.active.id, keep);
  assert.equal(storage.getItem(profileKey(gone, 'immune-protocol.best-score')), null);
  assert.equal(storage.getItem(profileKey(gone, ACHIEVEMENT_STORAGE_KEY)), null);
  assert.equal(storage.getItem(profileKey(keep, 'immune-protocol.best-score')), '1');
  assert.equal(profiles.remove(keep), false);
});

test('a damaged profile list is rebuilt from the saves still in storage', () => {
  const storage = new MemoryStorage();
  const profiles = make(storage);
  const a = profiles.active.id, b = profiles.create('Second').id;
  storage.setItem(profileKey(a, 'immune-protocol.best-score'), '5');
  storage.setItem(profileKey(b, 'immune-protocol.best-score'), '6');
  storage.setItem(PROFILE_INDEX_KEY, '{broken');
  const recovered = make(storage);
  assert.deepEqual(recovered.profiles.map(p => p.id).sort(), [a, b].sort());
  assert.ok(!recovered.fresh);
});

test('blocked storage still gives one working operator', () => {
  const blocked = { get length() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }, key() { throw new Error('blocked'); } };
  const profiles = make(blocked);
  assert.equal(profiles.profiles.length, 1);
  assert.ok(profiles.scope('immune-protocol.best-score'));
  assert.equal(make(null).active.name, 'Operator 1');
});

test('every emblem is a shipped portrait, and the settings store works without a browser', () => {
  for (const emblem of PROFILE_EMBLEMS) assert.ok(existsSync(fileURLToPath(new URL('../dist/' + emblem.src, import.meta.url))), emblem.id);
  assert.equal(store.readSetting('immune-protocol.best-score'), null);
  assert.doesNotThrow(() => store.writeSetting('immune-protocol.best-score', '1'));
});

test('a backup restores as a new operator with the same progress, on another device', () => {
  const home = new MemoryStorage();
  const profiles = make(home);
  const id = profiles.active.id;
  profiles.rename(id, 'Dr Byte');
  profiles.setEmblem(id, 'phage');
  home.setItem(profileKey(id, 'immune-protocol.best-score'), '61000');
  home.setItem(profileKey(id, ACHIEVEMENT_STORAGE_KEY), JSON.stringify({ unlocked: { 'patient-zero': 1 } }));
  home.setItem('immune-protocol.graphics-quality', 'low');
  const backup = JSON.parse(JSON.stringify(profiles.exportProfile(id)));
  assert.equal(backup.format, 'immune-protocol-operator');
  assert.deepEqual(Object.keys(backup.save).sort(), ['achievements', 'best-score']);
  assert.equal(backup.save['graphics-quality'], undefined, 'device settings are not in a backup');

  const away = make(new MemoryStorage());
  const { profile } = away.importProfile(backup);
  assert.equal(profile.name, 'Dr Byte');
  assert.equal(profile.emblem, 'phage');
  assert.equal(away.summary(profile.id).best, 61000);
  assert.equal(away.summary(profile.id).achievements, 1);
  // Restoring again on the same device keeps both, with a distinct name.
  assert.equal(away.importProfile(backup).profile.name, 'Dr Byte (2)');
});

test('restoring rejects other files, ignores unknown keys and respects the operator limit', () => {
  const profiles = make(new MemoryStorage());
  assert.match(profiles.importProfile(null).error, /not an Immune Protocol/);
  assert.match(profiles.importProfile({ format: 'something-else', save: {} }).error, /not an Immune Protocol/);
  assert.match(profiles.importProfile({ format: 'immune-protocol-operator', version: 9, save: { 'best-score': '1' } }).error, /newer version/);
  assert.match(profiles.importProfile({ format: 'immune-protocol-operator', version: 1, save: { keybinds: '{}' } }).error, /no saved progress/);
  const { profile } = profiles.importProfile({ format: 'immune-protocol-operator', version: 1, operator: { name: 'X', emblem: 'not-real' }, save: { 'best-score': '5', keybinds: '{"fire":"KeyZ"}', 'look-sensitivity': '9' } });
  assert.equal(profiles.storage.getItem(profileKey(profile.id, 'immune-protocol.best-score')), '5');
  assert.equal(profiles.storage.getItem('immune-protocol.keybinds'), null, 'nothing outside the operator save is written');
  assert.ok(PROFILE_EMBLEMS.some(emblem => emblem.id === profile.emblem));
  while (profiles.canCreate) profiles.create();
  assert.match(profiles.importProfile({ format: 'immune-protocol-operator', version: 1, save: { 'best-score': '1' } }).error, /already has 8/);
});
