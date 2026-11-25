// Achievements: what they are, how each one is earned, and the saved record of who has earned
// what. Like console achievements and trophies, each has a tier (bronze, silver, gold, platinum),
// a score value, artwork (assets/achievements/<id>.webp, baked by tools/achievements/bake_art.py)
// and, where it counts something up, a visible progress bar.
//
// The tracker is plain data and rules. It reads simulation events (the same list field-events.mjs
// reacts to), the start and end of each mission, and a few menu actions. It has no DOM, Three.js or
// audio, so the rules run under node --test; the game wires it to storage, the toast and sounds.

export const ACHIEVEMENT_STORAGE_KEY = 'immune-protocol.achievements';

export const TIERS = Object.freeze({
  bronze: Object.freeze({ name: 'Bronze', color: '#e09a62', light: '#ffd2ac', dark: '#5a2f16' }),
  silver: Object.freeze({ name: 'Silver', color: '#c9d6de', light: '#ffffff', dark: '#46545e' }),
  gold: Object.freeze({ name: 'Gold', color: '#f4c94e', light: '#fff2b8', dark: '#6b4b06' }),
  platinum: Object.freeze({ name: 'Platinum', color: '#a6ecff', light: '#f2fdff', dark: '#24566a' }),
});

export const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'campaign', name: 'Campaign' }),
  Object.freeze({ id: 'combat', name: 'Combat' }),
  Object.freeze({ id: 'bosses', name: 'Bosses' }),
  Object.freeze({ id: 'support', name: 'Field ops' }),
  Object.freeze({ id: 'mastery', name: 'Mastery' }),
]);

// Area id -> the achievement for securing that mission.
export const MISSION_ACHIEVEMENTS = Object.freeze({
  artery: 'clot-buster', junction: 'capillary-action', heart: 'be-still', lungs: 'deep-breath', stomach: 'iron-stomach',
  intestines: 'gut-feeling', colon: 'end-of-the-line', lymph: 'swollen-glands', ear: 'hear-me-out', brain: 'mind-over-matter',
});
export const MISSION_AREAS = Object.freeze(Object.keys(MISSION_ACHIEVEMENTS));
// The eight mission bosses and the Mega Virus. The Heart Valve's colonies are not one boss.
export const BOSS_IDS = Object.freeze(['thrombus', 'leech', 'bloom', 'drill', 'tapeworm', 'colossus', 'macrophage', 'screamer', 'mega-virus']);
export const FIELD_UPGRADE_IDS = Object.freeze(['fast-sealer', 'deep-magazine', 'insulated-suit', 'turret-stabilizer']);
const WEAPON_KILLS = Object.freeze({ carbine: 'needle-point', sniper: 'one-shot-one-cure', shotgun: 'bedside-blast', launcher: 'phage-therapy', pistol: 'sting-operation' });

const a = (id, name, description, tier, points, category, extra = {}) => Object.freeze({ id, name, description, tier, points, category, art: 'assets/achievements/' + id + '.webp', ...extra });
const count = (stat, goal) => ({ stat, goal });

export const ACHIEVEMENTS = Object.freeze([
  // Campaign
  a('scrubbed-in', 'Scrubbed In', 'Seal your first wound in the Arterial Junction training breach.', 'bronze', 10, 'campaign'),
  a('clot-buster', 'Clot Buster', 'Secure the Arterial Junction.', 'bronze', 10, 'campaign'),
  a('capillary-action', 'Capillary Action', 'Secure the Capillary Junction.', 'bronze', 10, 'campaign'),
  a('be-still', 'Be Still, My Heart', 'Stabilize all four chambers of the Heart Valve.', 'bronze', 10, 'campaign'),
  a('deep-breath', 'Take a Deep Breath', 'Secure the Bronchial Fork and keep the airway open.', 'bronze', 10, 'campaign'),
  a('iron-stomach', 'Iron Stomach', 'Secure the Gastric Chamber.', 'bronze', 10, 'campaign'),
  a('gut-feeling', 'Gut Feeling', 'Secure the Intestinal Bend.', 'bronze', 10, 'campaign'),
  a('end-of-the-line', 'End of the Line', 'Secure the Colonic Reservoir.', 'bronze', 10, 'campaign'),
  a('swollen-glands', 'Swollen Glands', 'Secure the Lymph Node.', 'bronze', 10, 'campaign'),
  a('hear-me-out', 'Hear Me Out', 'Secure the Inner Ear.', 'bronze', 10, 'campaign'),
  a('mind-over-matter', 'Mind Over Matter', 'Secure the Neural Cortex.', 'silver', 20, 'campaign'),
  a('president-safe', 'The President Is Safe', 'Complete the campaign, from the bloodstream to the brain.', 'gold', 90, 'campaign'),
  a('house-call', 'House Call', 'Win any solo mission on Hard.', 'silver', 15, 'campaign'),
  a('chief-of-medicine', 'Chief of Medicine', 'Win all ten missions on Hard, solo.', 'gold', 90, 'campaign', count('hardWins', 10)),
  // Combat
  a('patient-zero', 'Patient Zero', 'Neutralize your first pathogen.', 'bronze', 10, 'combat', count('kills', 1)),
  a('antibody-count', 'Antibody Count', 'Neutralize 500 pathogens.', 'bronze', 10, 'combat', count('kills', 500)),
  a('white-cell-army', 'White Cell Army', 'Neutralize 5,000 pathogens.', 'silver', 15, 'combat', count('kills', 5000)),
  a('pandemic-over', 'Pandemic Over', 'Neutralize 25,000 pathogens.', 'gold', 80, 'combat', count('kills', 25000)),
  a('critical-care', 'Critical Care', 'Land 1,000 critical hits.', 'bronze', 10, 'combat', count('crits', 1000)),
  a('needle-point', 'Needle Point', 'Neutralize 300 pathogens with the Needle Carbine.', 'bronze', 10, 'combat', count('kills:carbine', 300)),
  a('one-shot-one-cure', 'One Shot, One Cure', 'Neutralize 100 pathogens with the Lancet Rifle.', 'bronze', 10, 'combat', count('kills:sniper', 100)),
  a('bedside-blast', 'Bedside Blast', 'Neutralize 200 pathogens with the Burst Scattergun.', 'bronze', 10, 'combat', count('kills:shotgun', 200)),
  a('phage-therapy', 'Phage Therapy', 'Neutralize 150 pathogens with the Phage Launcher.', 'bronze', 10, 'combat', count('kills:launcher', 150)),
  a('sting-operation', 'Sting Operation', 'Neutralize 200 pathogens with the Sting Pistol.', 'bronze', 10, 'combat', count('kills:pistol', 200)),
  a('collateral-damage', 'Collateral Damage', 'Neutralize five pathogens with a single rocket.', 'silver', 15, 'combat'),
  a('fire-in-the-hole', 'Fire in the Hole', 'Neutralize four pathogens with a single antibody grenade.', 'bronze', 10, 'combat'),
  a('fever-pitch', 'Fever Pitch', 'Neutralize 15 pathogens within five seconds.', 'silver', 15, 'combat'),
  a('knuckle-sandwich', 'Knuckle Sandwich', 'Neutralize 25 pathogens with a melee bash.', 'bronze', 10, 'combat', count('kills:melee', 25)),
  a('shock-therapy', 'Shock Therapy', 'Catch six or more pathogens in a single stun charge.', 'bronze', 10, 'combat'),
  a('float-like-a-phagocyte', 'Float Like a Phagocyte', 'Pull off 25 perfect dodges.', 'bronze', 10, 'combat', count('dodges', 25)),
  // Bosses
  a('giant-slayer', 'Giant Slayer', 'Defeat your first mission boss.', 'bronze', 10, 'bosses'),
  a('off-the-wall', 'Off the Wall', 'Sidestep the Thrombus Titan so its charge slams it into a wall.', 'bronze', 10, 'bosses'),
  a('leech-removal', 'Leech Removal', 'Knock the Capillary Leech loose from a tissue node.', 'bronze', 10, 'bosses'),
  a('worm-has-turned', 'The Worm Has Turned', 'Destroy all seven Tapeworm segments in one fight.', 'bronze', 10, 'bosses'),
  a('indigestion', 'Indigestion', 'Break the Rogue Macrophage\'s pull before it engulfs a suit.', 'bronze', 10, 'bosses'),
  a('going-viral', 'Going Viral', 'Defeat the Mega Virus.', 'silver', 20, 'bosses'),
  a('final-diagnosis', 'Final Diagnosis', 'Land the killing blow on five bosses.', 'silver', 15, 'bosses', count('bossBlows', 5)),
  a('rogues-gallery', 'Rogues\' Gallery', 'Defeat all eight mission bosses and the Mega Virus.', 'gold', 80, 'bosses', count('bosses', BOSS_IDS.length)),
  // Field ops
  a('egg-hunt', 'Egg Hunt', 'Destroy 10 brood nests.', 'bronze', 10, 'support', count('nests', 10)),
  a('pest-control', 'Pest Control', 'Destroy 75 brood nests.', 'silver', 15, 'support', count('nests', 75)),
  a('care-package', 'Care Package', 'Collect 15 antibody caches.', 'bronze', 10, 'support', count('caches', 15)),
  a('stitch-in-time', 'A Stitch in Time', 'Seal 10 tissue gashes.', 'bronze', 10, 'support', count('gashes', 10)),
  a('tissue-engineer', 'Tissue Engineer', 'Restore 25,000 points of tissue integrity.', 'silver', 15, 'support', count('tissue', 25000)),
  a('set-and-forget', 'Set and Forget', 'Let your auto-turret neutralize 250 pathogens.', 'silver', 15, 'support', count('turretKills', 250)),
  a('squad-goals', 'Squad Goals', 'Win an online co-op mission.', 'silver', 15, 'support'),
  a('know-your-enemy', 'Know Your Enemy', 'Study 12 pathogens in the Disease guide.', 'bronze', 10, 'support', count('studied', 12)),
  a('dressed-to-disinfect', 'Dressed to Disinfect', 'Deploy with a skin, decal, sticker and charm on the same weapon.', 'bronze', 10, 'support'),
  // Mastery
  a('not-a-scratch', 'Not a Scratch', 'Win a mission with every tissue node at full integrity.', 'silver', 15, 'mastery'),
  a('close-shave', 'Close Shave', 'Win a mission with your suit at 10% integrity or less.', 'bronze', 10, 'mastery', { hidden: true }),
  a('no-backup-needed', 'No Backup Needed', 'Win a mission without deploying your auto-turret.', 'silver', 15, 'mastery'),
  a('second-opinion', 'Second Opinion', 'Win a mission after retrying it from a checkpoint.', 'bronze', 10, 'mastery'),
  a('overtime-hero', 'Overtime Hero', 'Hold the Capillary Junction through Overtime.', 'silver', 15, 'mastery'),
  a('vital-signs', 'Vital Signs', 'Score 75,000 in a single mission.', 'silver', 15, 'mastery'),
  a('off-the-charts', 'Off the Charts', 'Score 100,000 in a single mission.', 'gold', 70, 'mastery', { hidden: true }),
  a('field-tested', 'Field Tested', 'Win a mission with each of the four field upgrades.', 'silver', 15, 'mastery', count('upgrades', FIELD_UPGRADE_IDS.length)),
  a('immune-protocol', 'Immune Protocol', 'Earn every other achievement.', 'platinum', 0, 'mastery'),
]);

export const ACHIEVEMENT_BY_ID = Object.freeze(Object.fromEntries(ACHIEVEMENTS.map(item => [item.id, item])));

// Rewards: cosmetics and operator emblems that stay locked until their achievement is earned.
// None changes how a weapon handles. `kind` is the Armory slot (finish, accent, skin, decal,
// sticker) or 'emblem'; `id` is the option's key in weapon-mods.mjs or profiles.mjs.
export const REWARDS = Object.freeze([
  ['clot-buster', 'skin', 'bloodstream', 'Bloodstream skin'],
  ['mind-over-matter', 'skin', 'neural', 'Neural net skin'],
  ['pandemic-over', 'skin', 'outbreak', 'Outbreak skin'],
  ['immune-protocol', 'skin', 'prismatic', 'Prismatic skin'],
  ['immune-protocol', 'finish', 'platinum', 'Platinum finish'],
  ['president-safe', 'finish', 'presidential', 'Presidential gold finish'],
  ['chief-of-medicine', 'finish', 'surgical', 'Surgical steel finish'],
  ['house-call', 'accent', 'code-red', 'Code red accent'],
  ['going-viral', 'accent', 'viral', 'Viral magenta accent'],
  ['rogues-gallery', 'sticker', 'trophy', 'Trophy sticker'],
  ['tissue-engineer', 'sticker', 'medic', 'Field medic sticker'],
  ['squad-goals', 'sticker', 'squad', 'Squad up sticker'],
  ['vital-signs', 'decal', 'ecg', 'Heartbeat decal'],
  ['collateral-damage', 'decal', 'blast', 'Blast radius decal'],
  ['giant-slayer', 'emblem', 'boss-colossus', 'Biofilm Colossus emblem'],
  ['off-the-wall', 'emblem', 'boss-thrombus', 'Thrombus Titan emblem'],
  ['leech-removal', 'emblem', 'boss-leech', 'Capillary Leech emblem'],
  ['worm-has-turned', 'emblem', 'boss-tapeworm', 'Tapeworm emblem'],
  ['indigestion', 'emblem', 'boss-macrophage', 'Rogue Macrophage emblem'],
  ['final-diagnosis', 'emblem', 'boss-screamer', 'Otolith Screamer emblem'],
  ['deep-breath', 'emblem', 'boss-bloom', 'Mold Crown emblem'],
  ['iron-stomach', 'emblem', 'boss-drill', 'Pylori Drill emblem'],
].map(([achievement, kind, id, name]) => Object.freeze({ achievement, kind, id, name })));

const REWARD_INDEX = new Map(REWARDS.map(reward => [reward.kind + ':' + reward.id, reward]));
// The reward behind a cosmetic or emblem, or null for items everyone has.
export const rewardFor = (kind, id) => REWARD_INDEX.get(kind + ':' + id) ?? null;
export const rewardsOf = achievementId => REWARDS.filter(reward => reward.achievement === achievementId);

export const PLATINUM_ID = 'immune-protocol';
export const TOTAL_POINTS = ACHIEVEMENTS.reduce((sum, item) => sum + item.points, 0);
// Counters that are kept as sets of distinct things (areas won on Hard, bosses, upgrades, pathogens).
const SET_STATS = ['hardWins', 'bosses', 'upgrades', 'studied'];

function emptyRecord() {
  return { version: 1, unlocked: {}, stats: {}, sets: {} };
}

export function parseRecord(text) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object') return emptyRecord();
    const record = emptyRecord();
    for (const [id, at] of Object.entries(value.unlocked ?? {})) if (ACHIEVEMENT_BY_ID[id] && Number.isFinite(at)) record.unlocked[id] = at;
    for (const [key, n] of Object.entries(value.stats ?? {})) if (Number.isFinite(n) && n > 0) record.stats[key] = n;
    for (const key of SET_STATS) if (Array.isArray(value.sets?.[key])) record.sets[key] = [...new Set(value.sets[key].filter(item => typeof item === 'string'))];
    return record;
  } catch {
    return emptyRecord();
  }
}

export class AchievementTracker {
  // load(): the saved JSON text or null; save(text): persist it; now(): a timestamp for unlocks.
  constructor({ load = () => null, save = () => {}, now = () => Date.now() } = {}) {
    this.loadText = load;
    this.saveText = save;
    this.now = now;
    this.record = parseRecord(load());
    this.listeners = new Set();
    this.run = null;
    this.dirty = false;
  }

  onUnlock(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  isUnlocked(id) { return Object.hasOwn(this.record.unlocked, id); }
  unlockedAt(id) { return this.record.unlocked[id] ?? null; }
  stat(key) { return SET_STATS.includes(key) ? (this.record.sets[key]?.length ?? 0) : (this.record.stats[key] ?? 0); }

  // Whether this player may use a cosmetic or emblem: free items always, rewards once earned.
  hasReward(kind, id) {
    const reward = rewardFor(kind, id);
    return !reward || this.isUnlocked(reward.achievement);
  }

  progress(id) {
    const item = ACHIEVEMENT_BY_ID[id];
    if (!item?.goal) return null;
    const value = this.isUnlocked(id) ? item.goal : Math.min(item.goal, Math.floor(this.stat(item.stat)));
    return { value, goal: item.goal };
  }

  summary() {
    const unlocked = ACHIEVEMENTS.filter(item => this.isUnlocked(item.id));
    const tiers = Object.fromEntries(Object.keys(TIERS).map(tier => [tier, { earned: 0, total: 0 }]));
    for (const item of ACHIEVEMENTS) { tiers[item.tier].total += 1; if (this.isUnlocked(item.id)) tiers[item.tier].earned += 1; }
    return {
      earned: unlocked.length, total: ACHIEVEMENTS.length,
      points: unlocked.reduce((sum, item) => sum + item.points, 0), totalPoints: TOTAL_POINTS,
      percent: Math.round(unlocked.length / ACHIEVEMENTS.length * 100), tiers,
    };
  }

  // Most recently earned first.
  recent(limit = 3) {
    return Object.entries(this.record.unlocked).sort((x, y) => y[1] - x[1]).slice(0, limit).map(([id]) => ACHIEVEMENT_BY_ID[id]);
  }

  unlock(id) {
    const item = ACHIEVEMENT_BY_ID[id];
    if (!item || this.isUnlocked(id)) return false;
    this.record.unlocked[id] = this.now();
    this.dirty = true;
    for (const listener of this.listeners) listener(item);
    if (id !== PLATINUM_ID && ACHIEVEMENTS.every(other => other.id === PLATINUM_ID || this.isUnlocked(other.id))) this.unlock(PLATINUM_ID);
    this.flush();
    return true;
  }

  add(key, amount = 1) {
    if (!(amount > 0)) return;
    this.record.stats[key] = (this.record.stats[key] ?? 0) + amount;
    this.dirty = true;
    this.checkCounters(key);
  }

  include(key, value) {
    const set = this.record.sets[key] ??= [];
    if (set.includes(value)) return;
    set.push(value);
    this.dirty = true;
    this.checkCounters(key);
  }

  checkCounters(key) {
    for (const item of ACHIEVEMENTS) if (item.stat === key && !this.isUnlocked(item.id) && this.stat(key) >= item.goal) this.unlock(item.id);
  }

  // Writes the record if anything changed. The game calls it every few seconds and at mission
  // boundaries rather than on every kill.
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try { this.saveText(JSON.stringify(this.record)); } catch { /* Storage may be unavailable. */ }
  }

  // Reads the saved record again, after the player switches operator profile. Anything unsaved
  // belongs to the previous profile, so save it first.
  reload() {
    this.flush();
    this.record = parseRecord(this.loadText());
    this.run = null;
    this.dirty = false;
  }

  reset() {
    this.record = emptyRecord();
    this.dirty = true;
    this.flush();
  }

  // A mission (or a retry from its checkpoint) begins.
  missionStart({ area, checkpoint = false, upgrade = null, online = false, bossPractice = false, loadout = null } = {}) {
    this.run = {
      area, upgrade, online, bossPractice, retried: !!checkpoint, turretUsed: false,
      segments: 0, killTimes: [],
    };
    const builds = loadout?.arsenal?.builds ?? {};
    const carried = [loadout?.arsenal?.primary, loadout?.arsenal?.secondary].filter(Boolean);
    if (carried.some(weapon => ['skin', 'decal', 'sticker', 'charm'].every(part => builds[weapon]?.[part] && builds[weapon][part] !== 'none'))) {
      this.unlock('dressed-to-disinfect');
    }
  }

  // One simulation step's events. context: { isLocal(event), weapon, clock }.
  observe(events, { isLocal = event => event.playerId == null, weapon = null, clock = 0 } = {}) {
    const run = this.run ??= { retried: false, turretUsed: false, segments: 0, killTimes: [] };
    let rocketKills = 0, grenadeKills = 0, rocketBlast = false;
    for (const event of events ?? []) {
      const local = isLocal(event);
      switch (event.type) {
        case 'kill': {
          if (event.segment) {
            run.segments += 1;
            if (run.segments >= 7) this.unlock('worm-has-turned');
          }
          if (event.source === 'turret') { this.add('turretKills'); break; }
          if (!local || !['player', 'melee', 'grenade', 'stun'].includes(event.source)) break;
          this.add('kills');
          if (event.source === 'player' && WEAPON_KILLS[weapon]) this.add('kills:' + weapon);
          if (event.source === 'melee') this.add('kills:melee');
          if (event.source === 'player' && weapon === 'launcher') rocketKills += 1;
          if (event.source === 'grenade') grenadeKills += 1;
          if (event.nest) this.add('nests');
          if (event.boss) this.add('bossBlows');
          run.killTimes.push(clock);
          while (run.killTimes.length && run.killTimes[0] < clock - 5) run.killTimes.shift();
          if (run.killTimes.length >= 15) this.unlock('fever-pitch');
          break;
        }
        case 'explosion':
          if (event.kind !== 'antibody') rocketBlast = true;
          break;
        case 'shot':
          if (local && event.hit && event.crit) this.add('crits');
          break;
        case 'dodge':
          if (local) this.add('dodges');
          break;
        case 'stun':
          if (local && (event.stunned?.length ?? 0) >= 6) this.unlock('shock-therapy');
          break;
        case 'cache':
          if (event.stage === 'collect' && local) this.add('caches');
          break;
        case 'gash':
          if (event.stage === 'closed') this.add('gashes');
          break;
        case 'repair':
          if (event.amount > 0 && local) this.add('tissue', event.amount);
          break;
        case 'turret':
          if (['deployed', 'redeployed'].includes(event.stage) && local) run.turretUsed = true;
          break;
        case 'tutorial':
          if (event.stage === 'complete') this.unlock('scrubbed-in');
          break;
        case 'checkpoint':
          if (event.stage === 'restored') run.retried = true;
          break;
        case 'levelBoss':
          if (event.stage === 'defeated') { this.unlock('giant-slayer'); if (event.boss) this.include('bosses', event.boss); }
          if (event.stage === 'ability') {
            if (event.boss === 'thrombus' && event.ability === 'stunned') this.unlock('off-the-wall');
            if (event.boss === 'leech' && event.ability === 'knocked') this.unlock('leech-removal');
            if (event.boss === 'macrophage' && event.ability === 'broken') this.unlock('indigestion');
          }
          break;
        case 'boss':
          if (event.stage === 'defeated') { this.unlock('going-viral'); this.include('bosses', 'mega-virus'); }
          break;
      }
    }
    // Splash kills from one rocket all land in the step it bursts.
    if (rocketBlast && rocketKills >= 5) this.unlock('collateral-damage');
    if (grenadeKills >= 4) this.unlock('fire-in-the-hole');
  }

  // The mission report is about to show.
  missionEnd({ won, area, difficulty, score = 0, nodes = [], health = null, online = false, campaignComplete = false, overtimeBonus = 0, upgrade, bossPractice } = {}) {
    const run = this.run ?? {};
    this.run = null;
    upgrade ??= run.upgrade;
    bossPractice ??= run.bossPractice;
    if (won) {
      if (!bossPractice && MISSION_ACHIEVEMENTS[area]) this.unlock(MISSION_ACHIEVEMENTS[area]);
      if (difficulty === 'hard' && !online && !bossPractice) {
        this.unlock('house-call');
        if (MISSION_ACHIEVEMENTS[area]) this.include('hardWins', area);
      }
      if (campaignComplete) this.unlock('president-safe');
      if (online) this.unlock('squad-goals');
      if (nodes.length && nodes.every(node => node.health >= 99.5)) this.unlock('not-a-scratch');
      if (Number.isFinite(health) && health > 0 && health <= 10) this.unlock('close-shave');
      if (!run.turretUsed && !bossPractice && run.area) this.unlock('no-backup-needed');
      if (run.retried) this.unlock('second-opinion');
      if (overtimeBonus > 0) this.unlock('overtime-hero');
      if (FIELD_UPGRADE_IDS.includes(upgrade)) this.include('upgrades', upgrade);
    }
    if (!bossPractice && score >= 75000) this.unlock('vital-signs');
    if (!bossPractice && score >= 100000) this.unlock('off-the-charts');
    this.flush();
  }

  studyPathogen(type) {
    if (type) this.include('studied', type);
    this.flush();
  }
}
