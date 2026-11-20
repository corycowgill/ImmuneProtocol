import assert from 'node:assert/strict';
import test from 'node:test';
import { createArsenalView } from '../dist/arsenal-models.mjs';
import {
  DEFAULT_WEAPON_LOADOUT, WEAPON_CHARMS, WEAPON_DECALS, WEAPON_ORDER, WEAPON_SKINS, loadoutWithBuild,
  loadoutWithWeapon, normalizeWeaponBuild, weaponStats,
} from '../dist/weapon-mods.mjs';

test('builds keep known skins and decals and drop unknown ones', () => {
  for (const skin of Object.keys(WEAPON_SKINS)) assert.equal(normalizeWeaponBuild({ skin }).skin, skin);
  for (const decal of Object.keys(WEAPON_DECALS)) assert.equal(normalizeWeaponBuild({ decal }).decal, decal);
  const build = normalizeWeaponBuild({ skin: 'paisley', decal: 'graffiti' });
  assert.equal(build.skin, 'none');
  assert.equal(build.decal, 'none');
});

test('every charm changes the weapon, and the skull trades accuracy for damage', () => {
  const plain = weaponStats(DEFAULT_WEAPON_LOADOUT);
  for (const charm of Object.keys(WEAPON_CHARMS)) {
    if (charm === 'none') continue;
    const stats = weaponStats(loadoutWithBuild(DEFAULT_WEAPON_LOADOUT, 'carbine', { charm }));
    assert.notDeepEqual(stats, plain, charm + ' has a buff');
  }
  const skull = weaponStats(loadoutWithBuild(DEFAULT_WEAPON_LOADOUT, 'carbine', { charm: 'skull' }));
  assert.ok(skull.bodyDamage > plain.bodyDamage);
  assert.ok(skull.hipSpread > plain.hipSpread);
});

test('every charm has a model that hangs from every weapon', () => {
  const view = createArsenalView({ showHands: false });
  const pivot = view.model.getObjectByName('weapon-charm');
  const models = pivot.children.filter(part => part.isGroup);
  assert.equal(models.length, Object.keys(WEAPON_CHARMS).length - 1);
  for (const weapon of WEAPON_ORDER) {
    for (const charm of Object.keys(WEAPON_CHARMS)) {
      const loadout = loadoutWithBuild(loadoutWithWeapon(DEFAULT_WEAPON_LOADOUT, 'primary', weapon), weapon, { charm });
      view.setLoadout({ ...loadout, slot: 'primary' });
      assert.equal(view.weapon, weapon);
      assert.equal(pivot.visible, charm !== 'none', weapon + ' ' + charm);
      assert.equal(models.filter(model => model.visible).length, charm === 'none' ? 0 : 1, weapon + ' ' + charm);
    }
  }
});
