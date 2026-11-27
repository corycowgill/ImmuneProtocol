import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID, AchievementTracker, BOSS_IDS, CATEGORIES, FIELD_UPGRADE_IDS, MISSION_ACHIEVEMENTS, PLATINUM_ID,
  TIERS, TOTAL_POINTS, parseRecord,
} from '../dist/achievements.mjs';
import { AchievementToasts, TOAST_DURATION, achievementMenuDetail, achievementScreenModel, toastState } from '../dist/achievement-ui.mjs';
import { Simulation } from '../dist/simulation.mjs';
import { CAMPAIGN_AREAS } from '../dist/coop-protocol.mjs';
import { LEVEL_BOSSES } from '../dist/level-bosses.mjs';
import { FIELD_UPGRADES } from '../dist/loadouts.mjs';

const dist = path => fileURLToPath(new URL('../dist/' + path, import.meta.url));
// A tracker with in-memory storage and a fixed clock.
function tracker(saved = null) {
  const store = { text: saved, writes: 0 };
  const t = new AchievementTracker({ load: () => store.text, save: text => { store.text = text; store.writes++; }, now: () => 1700000000000 });
  const unlocked = [];
  t.onUnlock(item => unlocked.push(item.id));
  return { t, store, unlocked };
}
const kill = (extra = {}) => ({ type: 'kill', enemyType: 'virus', source: 'player', x: 0, z: 0, ...extra });

test('every achievement is well formed, has baked artwork, and the list scores 1,000', () => {
  const ids = new Set();
  for (const item of ACHIEVEMENTS) {
    assert.ok(!ids.has(item.id), 'duplicate ' + item.id); ids.add(item.id);
    assert.ok(TIERS[item.tier], item.id + ' tier');
    assert.ok(CATEGORIES.some(category => category.id === item.category), item.id + ' category');
    assert.ok(item.name && item.description.endsWith('.'), item.id + ' text');
    assert.equal(item.points % 5, 0, item.id + ' points are a multiple of 5');
    assert.ok(existsSync(dist(item.art)), 'missing art for ' + item.id);
    if (item.goal) assert.ok(item.stat && item.goal >= 1, item.id + ' counter');
  }
  assert.ok(existsSync(dist('assets/achievements/hidden.webp')));
  assert.equal(TOTAL_POINTS, 1000);
  assert.equal(ACHIEVEMENTS.filter(item => item.tier === 'platinum').length, 1);
  assert.equal(ACHIEVEMENT_BY_ID[PLATINUM_ID].tier, 'platinum');
});

test('the rules cover every mission, boss and field upgrade in the game', () => {
  assert.deepEqual(Object.keys(MISSION_ACHIEVEMENTS).sort(), [...CAMPAIGN_AREAS].sort());
  for (const id of Object.values(MISSION_ACHIEVEMENTS)) assert.ok(ACHIEVEMENT_BY_ID[id]);
  assert.deepEqual(BOSS_IDS.filter(id => id !== 'mega-virus').sort(), Object.values(LEVEL_BOSSES).map(boss => boss.id).sort());
  assert.deepEqual([...FIELD_UPGRADE_IDS].sort(), Object.keys(FIELD_UPGRADES).sort());
});

test('kills count up across missions and unlock the kill milestones once', () => {
  const { t, unlocked } = tracker();
  t.observe([kill()], { weapon: 'carbine', clock: 0 });
  assert.deepEqual(unlocked, ['patient-zero']);
  for (let i = 0; i < 499; i++) t.observe([kill()], { weapon: 'carbine', clock: i * 10 });
  assert.equal(t.stat('kills'), 500);
  assert.equal(t.stat('kills:carbine'), 500);
  assert.ok(unlocked.includes('antibody-count') && unlocked.includes('needle-point'));
  assert.equal(unlocked.filter(id => id === 'patient-zero').length, 1);
  assert.deepEqual(t.progress('white-cell-army'), { value: 500, goal: 5000 });
});

test('a teammate\'s kills are theirs; turret, melee and grenade kills land in their own counters', () => {
  const { t } = tracker();
  const isLocal = event => event.playerId == null || event.playerId === 'me';
  t.observe([kill({ playerId: 'friend' }), kill({ playerId: 'me' }), kill({ source: 'turret' }), kill({ source: 'melee', playerId: 'me' })], { isLocal, weapon: 'sniper', clock: 1 });
  assert.equal(t.stat('kills'), 2);
  assert.equal(t.stat('kills:sniper'), 1);
  assert.equal(t.stat('kills:melee'), 1);
  assert.equal(t.stat('turretKills'), 1);
});

test('multi-kills: five from one rocket, four from one grenade, fifteen in five seconds', () => {
  const { t, unlocked } = tracker();
  t.observe([kill(), kill(), kill(), kill()], { weapon: 'launcher', clock: 1 });
  assert.ok(!unlocked.includes('collateral-damage'), 'kills without a blast are not one rocket');
  t.observe([{ type: 'explosion', radius: 5, x: 0, z: 0 }, ...Array.from({ length: 5 }, () => kill())], { weapon: 'launcher', clock: 2 });
  assert.ok(unlocked.includes('collateral-damage'));
  t.observe([{ type: 'explosion', kind: 'antibody' }, ...Array.from({ length: 4 }, () => kill({ source: 'grenade' }))], { weapon: 'carbine', clock: 30 });
  assert.ok(unlocked.includes('fire-in-the-hole'));
  const { t: t2, unlocked: u2 } = tracker();
  for (let i = 0; i < 14; i++) t2.observe([kill()], { weapon: 'carbine', clock: i * .5 });
  t2.observe([kill()], { weapon: 'carbine', clock: 20 });
  assert.ok(!u2.includes('fever-pitch'), 'fifteen kills spread out do not count');
  for (let i = 0; i < 15; i++) t2.observe([kill()], { weapon: 'carbine', clock: 40 + i * .3 });
  assert.ok(u2.includes('fever-pitch'));
});

test('boss feats come from the bosses\' own ability events', () => {
  const { t, unlocked } = tracker();
  t.observe([{ type: 'levelBoss', stage: 'ability', boss: 'thrombus', ability: 'stunned' }]);
  t.observe([{ type: 'levelBoss', stage: 'ability', boss: 'leech', ability: 'knocked' }]);
  t.observe([{ type: 'levelBoss', stage: 'ability', boss: 'macrophage', ability: 'broken' }]);
  t.observe(Array.from({ length: 7 }, () => kill({ segment: true, source: 'turret' })));
  assert.deepEqual(unlocked.sort(), ['indigestion', 'leech-removal', 'off-the-wall', 'worm-has-turned'].sort());
  for (const boss of BOSS_IDS.filter(id => id !== 'mega-virus')) t.observe([{ type: 'levelBoss', stage: 'defeated', boss }]);
  assert.ok(unlocked.includes('giant-slayer') && !unlocked.includes('rogues-gallery'));
  t.observe([{ type: 'boss', stage: 'defeated' }]);
  assert.ok(unlocked.includes('going-viral') && unlocked.includes('rogues-gallery'));
});

test('mission results: securing, Hard wins, flawless tissue, close shaves, no turret and retries', () => {
  const { t, unlocked } = tracker();
  t.missionStart({ area: 'artery', upgrade: 'fast-sealer' });
  t.observe([{ type: 'turret', stage: 'deployed' }]);
  t.missionEnd({ won: true, area: 'artery', difficulty: 'medium', score: 40000, nodes: [{ health: 100 }, { health: 80 }], health: 60 });
  assert.deepEqual(unlocked, ['clot-buster']);
  t.missionStart({ area: 'colon', checkpoint: true, upgrade: 'deep-magazine' });
  t.missionEnd({ won: true, area: 'colon', difficulty: 'hard', score: 101000, nodes: [{ health: 100 }, { health: 100 }], health: 8 });
  for (const id of ['end-of-the-line', 'house-call', 'not-a-scratch', 'close-shave', 'no-backup-needed', 'second-opinion', 'vital-signs', 'off-the-charts']) assert.ok(unlocked.includes(id), id);
  assert.equal(t.stat('hardWins'), 1);
  assert.equal(t.stat('upgrades'), 2);
  // A lost mission earns nothing for winning; Mega Virus practice is not the Neural Cortex.
  t.missionStart({ area: 'brain', bossPractice: true });
  t.missionEnd({ won: true, area: 'brain', difficulty: 'hard', score: 120000, nodes: [{ health: 100 }] , health: 90 });
  assert.ok(!unlocked.includes('mind-over-matter'));
  t.missionStart({ area: 'lymph' });
  t.missionEnd({ won: false, area: 'lymph', difficulty: 'hard', nodes: [{ health: 100 }], health: 0 });
  assert.ok(!unlocked.includes('swollen-glands'));
});

test('co-op wins count for the squad but not toward solo Hard records', () => {
  const { t, unlocked } = tracker();
  t.missionStart({ area: 'heart', online: true });
  t.missionEnd({ won: true, area: 'heart', difficulty: 'hard', online: true, campaignComplete: true, nodes: [{ health: 50 }], health: 40 });
  assert.ok(unlocked.includes('squad-goals') && unlocked.includes('be-still') && unlocked.includes('president-safe'));
  assert.ok(!unlocked.includes('house-call'));
});

test('deploying a fully dressed weapon earns Dressed to Disinfect', () => {
  const { t, unlocked } = tracker();
  const plain = { skin: 'none', decal: 'none', sticker: 'none', charm: 'none' };
  t.missionStart({ area: 'artery', loadout: { arsenal: { primary: 'carbine', secondary: 'pistol', builds: { carbine: plain, pistol: { ...plain, skin: 'tiger', decal: 'flames', sticker: 'biohazard' } } } } });
  assert.ok(!unlocked.includes('dressed-to-disinfect'));
  t.missionStart({ area: 'artery', loadout: { arsenal: { primary: 'carbine', secondary: 'pistol', builds: { carbine: plain, pistol: { skin: 'tiger', decal: 'flames', sticker: 'biohazard', charm: 'clover' } } } } });
  assert.ok(unlocked.includes('dressed-to-disinfect'));
});

test('earning every other achievement awards the platinum, and the record survives a reload', () => {
  const { t, store, unlocked } = tracker();
  for (const item of ACHIEVEMENTS) if (item.id !== PLATINUM_ID) t.unlock(item.id);
  assert.equal(unlocked.at(-1), PLATINUM_ID);
  assert.equal(t.summary().points, 1000);
  assert.equal(t.summary().earned, ACHIEVEMENTS.length);
  const reloaded = new AchievementTracker({ load: () => store.text });
  assert.ok(reloaded.isUnlocked(PLATINUM_ID));
  assert.equal(reloaded.unlockedAt('patient-zero'), 1700000000000);
});

test('a damaged or foreign save is ignored rather than trusted', () => {
  assert.deepEqual(parseRecord('not json').unlocked, {});
  const record = parseRecord(JSON.stringify({ unlocked: { 'patient-zero': 5, 'made-up': 9, 'clot-buster': 'yes' }, stats: { kills: 12, crits: -4 }, sets: { bosses: ['thrombus', 'thrombus', 7] } }));
  assert.deepEqual(record.unlocked, { 'patient-zero': 5 });
  assert.deepEqual(record.stats, { kills: 12 });
  assert.deepEqual(record.sets.bosses, ['thrombus']);
});

test('counters are written in batches, not on every kill', () => {
  const { t, store } = tracker();
  t.observe([kill()], { weapon: 'carbine' });
  const writes = store.writes;
  for (let i = 0; i < 50; i++) t.observe([kill()], { weapon: 'carbine', clock: i * 10 });
  assert.equal(store.writes, writes);
  t.flush();
  assert.equal(store.writes, writes + 1);
  assert.equal(JSON.parse(store.text).stats.kills, 51);
});

test('toasts pop, unroll, hold and leave one at a time, in order', () => {
  const toasts = new AchievementToasts();
  toasts.push(ACHIEVEMENT_BY_ID['patient-zero']);
  toasts.push(ACHIEVEMENT_BY_ID['clot-buster']);
  const first = toasts.frame(0);
  assert.equal(first.item.id, 'patient-zero');
  assert.equal(first.waiting, 1);
  assert.ok(first.open === 0 && first.text === 0, 'the banner starts closed');
  const held = toasts.frame(2000);
  assert.equal(held.open, 1);
  assert.equal(held.text, 1);
  assert.equal(held.alpha, 1);
  assert.equal(toasts.frame(TOAST_DURATION * 1000 + 1), null, 'a short gap before the next one');
  assert.equal(toasts.frame(TOAST_DURATION * 1000 + 400).item.id, 'clot-buster');
  const pop = toastState(ACHIEVEMENT_BY_ID['patient-zero'], .2);
  assert.ok(pop.art > 1, 'the art overshoots as it pops in');
  const leaving = toastState(ACHIEVEMENT_BY_ID['patient-zero'], TOAST_DURATION - .05);
  assert.ok(leaving.alpha < .2 && leaving.lift > 10);
});

test('the Achievements screen has an overview and a tab per category, with hidden ones masked', () => {
  const { t } = tracker();
  t.unlock('patient-zero');
  t.add('kills', 120);
  const screen = achievementScreenModel(t);
  assert.deepEqual(screen.views.map(view => view.id), ['all', ...CATEGORIES.map(category => category.id)]);
  const cards = screen.views[0].body.flatMap(node => node.children ?? [node]).filter(node => node.kind === 'achievement');
  const all = screen.views.slice(1).flatMap(view => view.body.flatMap(node => node.children ?? [])).filter(node => node.kind === 'achievement');
  assert.equal(all.length, ACHIEVEMENTS.length);
  assert.ok(cards.find(card => card.achievement === 'patient-zero').unlocked);
  const progress = all.find(card => card.achievement === 'antibody-count').progress;
  assert.deepEqual(progress, { value: 120, goal: 500 });
  const secret = all.find(card => card.achievement === 'close-shave');
  assert.ok(secret.secret && secret.text === 'Hidden achievement' && secret.src.endsWith('hidden.webp'));
  assert.equal(Object.keys(screen.details).length, ACHIEVEMENTS.length);
  assert.match(achievementMenuDetail(t), /^1 of 59 earned · 10 \/ 1000 G$/);
});

test('a real mission feeds the tracker without errors and credits the turret', () => {
  const sim = new Simulation('artery');
  sim.start();
  const { t } = tracker();
  t.missionStart({ area: 'artery' });
  let turretKills = 0;
  for (let i = 0; i < 60 * 90 && sim.phase !== 'lost'; i++) {
    sim.step(1 / 60, { deploy: i === 180 });
    turretKills += sim.events.filter(event => event.type === 'kill' && event.source === 'turret').length;
    t.observe(sim.events, { weapon: sim.weaponLoadout.weapon, clock: sim.clock });
  }
  assert.equal(t.stat('turretKills'), turretKills);
  t.missionEnd({ won: sim.phase === 'won', area: sim.area, difficulty: 'medium', score: sim.score, nodes: sim.nodes, health: sim.player.health });
  assert.ok(t.record.stats.turretKills === undefined || t.record.stats.turretKills >= 0);
});

test('every reward is a real cosmetic or emblem, earned by a real achievement, and starts locked', async () => {
  const { REWARDS, rewardFor, rewardsOf } = await import('../dist/achievements.mjs');
  const mods = await import('../dist/weapon-mods.mjs');
  const { PROFILE_EMBLEMS } = await import('../dist/profiles.mjs');
  const tables = { finish: mods.WEAPON_FINISHES, accent: mods.WEAPON_ACCENTS, skin: mods.WEAPON_SKINS, decal: mods.WEAPON_DECALS, sticker: mods.WEAPON_STICKERS };
  for (const reward of REWARDS) {
    assert.ok(ACHIEVEMENT_BY_ID[reward.achievement], reward.achievement);
    if (reward.kind === 'emblem') assert.ok(PROFILE_EMBLEMS.some(emblem => emblem.id === reward.id), reward.id);
    else assert.ok(tables[reward.kind]?.[reward.id], reward.kind + ':' + reward.id);
    if (reward.kind === 'emblem') assert.ok(existsSync(dist('assets/enemies/portraits/' + reward.id + '.webp')));
  }
  assert.equal(new Set(REWARDS.map(r => r.kind + ':' + r.id)).size, REWARDS.length, 'no reward is listed twice');
  assert.equal(rewardFor('skin', 'tiger'), null, 'ordinary cosmetics stay free');
  assert.equal(rewardsOf('immune-protocol').length, 2);
  const { t } = tracker();
  assert.ok(t.hasReward('skin', 'tiger'));
  assert.ok(!t.hasReward('skin', 'neural'));
  t.unlock('mind-over-matter');
  assert.ok(t.hasReward('skin', 'neural'));
  // A reward equipped in a saved build is still a valid build (co-op and older saves load it).
  const loadout = mods.normalizeWeaponLoadout({ weapon: 'carbine', skin: 'prismatic', finish: 'platinum', sticker: 'trophy', decal: 'ecg', accent: 'viral' });
  assert.equal(loadout.skin, 'prismatic');
  assert.equal(loadout.finish, 'platinum');
});

test('reward names show on the card, the detail and the toast', () => {
  const { t } = tracker();
  const screen = achievementScreenModel(t);
  const card = screen.views.slice(1).flatMap(view => view.body.flatMap(node => node.children ?? [])).find(node => node.achievement === 'off-the-wall');
  assert.equal(card.reward, 'Thrombus Titan emblem');
  assert.ok(screen.details['off-the-wall'].some(node => /Reward: Thrombus Titan emblem/.test(node.text ?? '')));
  assert.equal(toastState(ACHIEVEMENT_BY_ID['immune-protocol'], 1).reward, 'Prismatic skin + Platinum finish');
});

test('the Mega Nano Bot: destroying it, a fast pylon break, and an untouched kill', () => {
  const nano = (stage, extra = {}) => ({ type: 'levelBoss', stage, boss: 'nanobot', ...extra });
  const { t, unlocked } = tracker();
  t.observe([nano('arrive')], { clock: 0 });
  t.observe([nano('ability', { ability: 'shield-up' })], { clock: 4 });
  t.observe([nano('ability', { ability: 'shield-down' })], { clock: 15 });
  assert.ok(!unlocked.includes('short-circuit'), 'eleven seconds is too slow');
  t.observe([nano('ability', { ability: 'shield-up' })], { clock: 30 });
  t.observe([nano('ability', { ability: 'shield-down' })], { clock: 37 });
  assert.ok(unlocked.includes('short-circuit'));
  // A teammate being hurt does not count against this suit; its own hurt does.
  t.observe([{ type: 'damage', target: 'player', boss: 'nanobot', playerId: 'someone-else' }], { isLocal: event => event.playerId == null });
  t.observe([nano('defeated')]);
  assert.ok(unlocked.includes('lobotomy') && unlocked.includes('ghost-in-the-machine'));
  assert.ok(!unlocked.includes('rogues-gallery'), 'it is not one of the nine for Rogues\' Gallery');

  const hurt = tracker();
  hurt.t.observe([nano('arrive')]);
  hurt.t.observe([{ type: 'damage', target: 'player', boss: 'nanobot' }]);
  hurt.t.observe([nano('defeated')]);
  assert.ok(hurt.unlocked.includes('lobotomy') && !hurt.unlocked.includes('ghost-in-the-machine'));
});

test('the Mega Nano Bot\'s pylons are not tapeworm segments', () => {
  const sim = new Simulation('brain');
  sim.start();
  const pylon = sim.createEnemy('nanobot-part', 0, 0, sim.nodes[0], { health: 1, score: 0 });
  Object.assign(pylon, { segmentOf: 99, pylonOf: 99, slot: 0, score: 250 });
  sim.enemies.push(pylon);
  sim.events = [];
  sim.hitEnemy(pylon, 10, false, pylon, 'player', sim.player);
  const killed = sim.events.find(event => event.type === 'kill');
  assert.ok(killed.pylon && !killed.segment);
});
