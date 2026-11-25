// Operator profiles: several players sharing one browser each keep their own save. A profile owns
// its campaign progress, unlocks, best score, loadout and cosmetics, difficulty, co-op callsign and
// suit, briefings and hints seen, and achievements. Display, audio and control settings belong to
// the device and are shared.
//
// Progress keys are stored per profile as `immune-protocol.profile.<id>.<name>`; settings-store.mjs
// maps the game's existing keys onto the active profile, so the rest of the game reads and writes
// them exactly as before. This module only needs a Storage-like object, so it runs under node --test.
import { ACHIEVEMENT_STORAGE_KEY, parseRecord, ACHIEVEMENTS } from './achievements.mjs';

export const PROFILE_INDEX_KEY = 'immune-protocol.profiles';
export const MAX_PROFILES = 8;
export const PROFILE_NAME_LENGTH = 16;
export const BACKUP_FORMAT = 'immune-protocol-operator';
// The largest single saved value a backup may carry (a full achievement record is a few KB).
const MAX_VALUE = 200000;
const PREFIX = 'immune-protocol.';

// Every saved key that belongs to a player rather than the device.
export const PROFILE_KEYS = Object.freeze([
  'immune-protocol.best-score', 'immune-protocol.junction-unlocked', 'immune-protocol.heart-unlocked',
  'immune-protocol.training-complete', 'immune-protocol.campaign-checkpoint', 'immune-protocol.unlocked-mission',
  'immune-protocol.practice-loadout', 'immune-protocol.weapon-loadout', 'immune-protocol.weapon-mod',
  'immune-protocol.weapon-finish', 'immune-protocol.coop-name', 'immune-protocol.mega-virus-reached',
  'immune-protocol.briefings-seen', 'immune-protocol.hints-seen', 'immune-protocol.difficulty',
  'immune-protocol.coop-suit', ACHIEVEMENT_STORAGE_KEY,
]);
const SCOPED = new Set(PROFILE_KEYS);

// Emblems are the pathogen portraits the game already ships, plus a helmet close-up of each
// co-op suit (rendered from the suit models into assets/suits/helmets).
export const PROFILE_EMBLEMS = Object.freeze([
  { id: 'virus', name: 'Virion' }, { id: 'phage', name: 'Phage' }, { id: 'bacillus', name: 'Bacillus' },
  { id: 'spore', name: 'Spore' }, { id: 'flagellate', name: 'Flagellate' }, { id: 'amoeba', name: 'Amoeba' },
  { id: 'blister', name: 'Blister' }, { id: 'filovirus', name: 'Filovirus' }, { id: 'guard', name: 'Shellback' },
  { id: 'splitter', name: 'Splitter' }, { id: 'colony', name: 'Colony' }, { id: 'crawler', name: 'Crawler' },
  { id: 'rogue-bot', name: 'Rogue Bot' }, { id: 'nest', name: 'Brood Nest' },
  { id: 'helmet-vanguard', name: 'Vanguard', src: 'assets/suits/helmets/vanguard.webp' },
  { id: 'helmet-wraith', name: 'Wraith', src: 'assets/suits/helmets/wraith.webp' },
  { id: 'helmet-lifeline', name: 'Lifeline', src: 'assets/suits/helmets/lifeline.webp' },
  { id: 'helmet-bathysphere', name: 'Bathysphere', src: 'assets/suits/helmets/bathysphere.webp' },
  // Boss emblems are achievement rewards (achievements.mjs REWARDS).
  { id: 'boss-colossus', name: 'Colossus' }, { id: 'boss-thrombus', name: 'Thrombus' }, { id: 'boss-leech', name: 'Leech' },
  { id: 'boss-tapeworm', name: 'Tapeworm' }, { id: 'boss-macrophage', name: 'Macrophage' }, { id: 'boss-screamer', name: 'Screamer' },
  { id: 'boss-bloom', name: 'Mold Crown' }, { id: 'boss-drill', name: 'Pylori Drill' },
].map(emblem => Object.freeze({ src: 'assets/enemies/portraits/' + emblem.id + '.webp', ...emblem })));
const EMBLEM_IDS = new Set(PROFILE_EMBLEMS.map(emblem => emblem.id));
// Accent colours for the emblem ring, so operators are told apart at a glance.
export const PROFILE_COLORS = Object.freeze(['#c8f794', '#8fe4dd', '#ffb37a', '#dbafef', '#ff8fae', '#f4c94e', '#9cc3ff', '#ff977d']);

export function cleanProfileName(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, PROFILE_NAME_LENGTH);
}

export function profileKey(id, key) {
  return PREFIX + 'profile.' + id + '.' + key.slice(PREFIX.length);
}

const newId = (taken, random = Math.random) => {
  let id;
  do id = 'p' + Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0'); while (taken.has(id));
  return id;
};

export class ProfileStore {
  // storage: a Storage (localStorage) or null when the browser blocks it.
  constructor(storage, { now = () => Date.now(), random = Math.random } = {}) {
    this.storage = storage;
    this.now = now;
    this.random = random;
    this.fresh = false;
    this.migrated = false;
    this.index = this.load();
  }

  get(key) { try { return this.storage?.getItem(key) ?? null; } catch { return null; } }
  set(key, value) { try { this.storage?.setItem(key, String(value)); } catch { /* Storage may be blocked. */ } }
  drop(key) { try { this.storage?.removeItem(key); } catch { /* Storage may be blocked. */ } }

  load() {
    let index = null;
    try { index = JSON.parse(this.get(PROFILE_INDEX_KEY)); } catch { index = null; }
    const profiles = Array.isArray(index?.profiles) ? index.profiles.filter(p => p && typeof p.id === 'string' && /^p[0-9a-z]{6}$/.test(p.id)).map(p => ({
      id: p.id, name: cleanProfileName(p.name) || 'Operator', emblem: EMBLEM_IDS.has(p.emblem) ? p.emblem : 'virus',
      color: Number.isInteger(p.color) ? p.color % PROFILE_COLORS.length : 0,
      created: Number(p.created) || 0, lastPlayed: Number(p.lastPlayed) || 0,
    })) : [];
    const seen = new Set();
    const unique = profiles.filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, MAX_PROFILES);
    const result = { version: 1, active: unique.some(p => p.id === index?.active) ? index.active : unique[0]?.id ?? null, profiles: unique };
    if (!result.profiles.length) {
      // A lost or damaged index: rebuild an operator for every save still in storage.
      const found = new Set();
      try {
        for (let i = 0; i < (this.storage?.length ?? 0); i++) {
          const match = /^immune-protocol\.profile\.(p[0-9a-z]{6})\./.exec(this.storage.key(i) ?? '');
          if (match) found.add(match[1]);
        }
      } catch { /* Storage may be blocked. */ }
      [...found].slice(0, MAX_PROFILES).forEach((id, i) => result.profiles.push({ id, name: 'Operator ' + (i + 1), emblem: PROFILE_EMBLEMS[i % PROFILE_EMBLEMS.length].id, color: i % PROFILE_COLORS.length, created: 0, lastPlayed: 0 }));
      if (result.profiles.length) {
        result.active = result.profiles[0].id;
        this.index = result;
        this.save();
        return result;
      }

      // First run with profiles. An existing save becomes the first operator, named after its
      // co-op callsign when it has one; otherwise a fresh operator is set up.
      const legacy = PROFILE_KEYS.filter(key => this.get(key) != null);
      const callsign = cleanProfileName(this.get(PREFIX + 'coop-name'));
      const profile = this.blank(callsign || 'Operator 1', new Set(), 0);
      result.profiles.push(profile);
      result.active = profile.id;
      for (const key of legacy) {
        this.set(profileKey(profile.id, key), this.get(key));
        this.drop(key);
      }
      this.migrated = legacy.length > 0;
      this.fresh = !this.migrated;
      this.index = result;
      this.save();
    }
    return result;
  }

  blank(name, taken, color) {
    const free = PROFILE_EMBLEMS.filter(emblem => !emblem.id.startsWith('boss-'));
    const emblem = free[Math.floor(this.random() * free.length)].id;
    return { id: newId(taken, this.random), name, emblem, color, created: this.now(), lastPlayed: 0 };
  }

  save() { this.set(PROFILE_INDEX_KEY, JSON.stringify(this.index)); }

  get profiles() { return this.index.profiles; }
  get active() { return this.index.profiles.find(p => p.id === this.index.active) ?? this.index.profiles[0] ?? null; }
  find(id) { return this.index.profiles.find(p => p.id === id) ?? null; }
  get canCreate() { return this.index.profiles.length < MAX_PROFILES; }

  // The storage key a game key reads and writes for the active profile.
  scope(key) {
    const active = this.active;
    return active && SCOPED.has(key) ? profileKey(active.id, key) : key;
  }

  nameTaken(name, except = null) {
    const lower = cleanProfileName(name).toLowerCase();
    return this.index.profiles.some(p => p.id !== except && p.name.toLowerCase() === lower);
  }

  // A name like "Operator 3" that no one has yet.
  nextName() {
    for (let n = this.index.profiles.length + 1; ; n++) if (!this.nameTaken('Operator ' + n)) return 'Operator ' + n;
  }

  create(name) {
    if (!this.canCreate) return null;
    let clean = cleanProfileName(name) || this.nextName();
    if (this.nameTaken(clean)) clean = this.nextName();
    const used = new Set(this.index.profiles.map(p => p.color));
    const color = [...PROFILE_COLORS.keys()].find(i => !used.has(i)) ?? this.index.profiles.length % PROFILE_COLORS.length;
    const profile = this.blank(clean, new Set(this.index.profiles.map(p => p.id)), color);
    this.index.profiles.push(profile);
    this.save();
    return profile;
  }

  // Returns the stored name, or null if the name is empty or already used.
  rename(id, name) {
    const profile = this.find(id), clean = cleanProfileName(name);
    if (!profile || !clean || this.nameTaken(clean, id)) return null;
    profile.name = clean;
    this.save();
    return clean;
  }

  setEmblem(id, emblem) {
    const profile = this.find(id);
    if (!profile || !EMBLEM_IDS.has(emblem)) return false;
    profile.emblem = emblem;
    this.save();
    return true;
  }

  select(id) {
    const profile = this.find(id);
    if (!profile) return null;
    this.index.active = id;
    this.save();
    return profile;
  }

  touch(id = this.index.active) {
    const profile = this.find(id);
    if (!profile) return;
    profile.lastPlayed = this.now();
    this.save();
  }

  // Deletes a profile and every key it saved. The last profile cannot be deleted.
  remove(id) {
    if (this.index.profiles.length <= 1 || !this.find(id)) return false;
    const prefix = PREFIX + 'profile.' + id + '.';
    const keys = [];
    try { for (let i = 0; i < (this.storage?.length ?? 0); i++) { const key = this.storage.key(i); if (key?.startsWith(prefix)) keys.push(key); } } catch { /* Storage may be blocked. */ }
    for (const key of keys) this.drop(key);
    this.index.profiles = this.index.profiles.filter(p => p.id !== id);
    if (this.index.active === id) this.index.active = this.index.profiles[0].id;
    this.save();
    return true;
  }

  // A portable copy of one operator's save, for a backup file.
  exportProfile(id) {
    const profile = this.find(id);
    if (!profile) return null;
    const save = {};
    for (const key of PROFILE_KEYS) {
      const value = this.get(profileKey(id, key));
      if (value != null) save[key.slice(PREFIX.length)] = value;
    }
    return { format: BACKUP_FORMAT, version: 1, exported: new Date(this.now()).toISOString(),
      operator: { name: profile.name, emblem: profile.emblem }, save };
  }

  // Adds a backup as a new operator (never over an existing one). Returns { profile } or { error }.
  importProfile(data) {
    if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT || !data.save || typeof data.save !== 'object' || Array.isArray(data.save)) {
      return { error: 'That file is not an Immune Protocol operator backup.' };
    }
    if (data.version > 1) return { error: 'That backup is from a newer version of the game.' };
    if (!this.canCreate) return { error: 'This device already has ' + MAX_PROFILES + ' operators. Delete one to restore a backup.' };
    const allowed = new Set(PROFILE_KEYS.map(key => key.slice(PREFIX.length)));
    const entries = Object.entries(data.save).filter(([key, value]) => allowed.has(key) && typeof value === 'string' && value.length <= MAX_VALUE);
    if (!entries.length) return { error: 'That backup has no saved progress in it.' };
    let name = cleanProfileName(data.operator?.name) || this.nextName();
    for (let n = 2; this.nameTaken(name); n++) name = cleanProfileName(cleanProfileName(data.operator?.name).slice(0, PROFILE_NAME_LENGTH - 4) + ' (' + n + ')');
    const profile = this.create(name);
    if (!profile) return { error: 'The backup could not be restored.' };
    if (EMBLEM_IDS.has(data.operator?.emblem)) profile.emblem = data.operator.emblem;
    for (const [key, value] of entries) this.set(profileKey(profile.id, PREFIX + key), value);
    this.save();
    return { profile };
  }

  // What a profile card shows: missions secured, achievements, score and best run.
  summary(id) {
    const read = key => this.get(profileKey(id, key));
    const areas = ['artery', 'junction', 'heart', 'lungs', 'stomach', 'intestines', 'colon', 'lymph', 'ear', 'brain'];
    let secured = Math.max(0, areas.indexOf(read(PREFIX + 'unlocked-mission')));
    if (read(PREFIX + 'heart-unlocked') === 'true') secured = Math.max(secured, 2);
    else if (read(PREFIX + 'junction-unlocked') === 'true') secured = Math.max(secured, 1);
    const record = parseRecord(read(ACHIEVEMENT_STORAGE_KEY));
    const earned = ACHIEVEMENTS.filter(item => Object.hasOwn(record.unlocked, item.id));
    if (earned.some(item => item.id === 'president-safe')) secured = areas.length;
    return {
      secured, missions: areas.length,
      achievements: earned.length, totalAchievements: ACHIEVEMENTS.length,
      points: earned.reduce((sum, item) => sum + item.points, 0),
      best: Number(read(PREFIX + 'best-score')) || 0,
    };
  }
}
