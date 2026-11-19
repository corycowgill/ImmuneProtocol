// Weapons, their parts, cosmetics and charms, and the two-weapon loadout a suit carries.
//
// A loadout is the active weapon's build flattened onto one object (weapon, barrel ... charm) plus
// `slot` ('primary' or 'secondary') and `arsenal`, which names both carried weapons and stores a
// build for every weapon so switching or editing never loses a configuration.

export const WEAPON_SLOTS = {
  barrel: {
    name: 'Barrel',
    options: {
      standard: { name: 'Service barrel', detail: 'Standard damage, fire rate and spread.' },
      'heavy-barrel': {
        name: 'Heavy barrel', detail: 'Hits harder and groups tighter. Slower follow-up shots.',
        changes: { bodyDamage: 5, criticalDamage: 7, interval: .025, spread: -.12 },
      },
      'short-barrel': {
        name: 'Short barrel', detail: 'Cycles faster and widens the hip-fire critical zone. Less damage, wider spread.',
        changes: { bodyDamage: -3, criticalDamage: -3, interval: -.016, hipCritical: .06, spread: .1 },
      },
    },
  },
  muzzle: {
    name: 'Muzzle',
    options: {
      standard: { name: 'Thread protector', detail: 'Full flash intensity and standard damage.' },
      compensator: {
        name: 'Compensator', detail: 'Tames hip-fire spread and widens the hip-fire critical zone. Critical hits deal less damage.',
        changes: { criticalDamage: -4, hipCritical: .16, hipSpread: -.2 },
      },
      'flash-hider': {
        name: 'Flash hider', detail: 'Dims muzzle flash and widens the aimed critical zone. Deals less damage.',
        changes: { bodyDamage: -2, criticalDamage: -2, aimCritical: .06, muzzleFlash: -.56 },
      },
    },
  },
  optic: {
    name: 'Optic',
    options: {
      standard: { name: 'Service sights', detail: 'Built-in sights. Standard zoom and tracking.' },
      'marksman-optic': {
        name: 'Marksman optic', detail: 'More zoom, tighter aimed spread and harder critical hits. Slower tracking.',
        changes: { criticalDamage: 6, aimCritical: .10, hipCritical: -.04, aimSensitivity: -.08, aimSpread: -.35, zoom: -.18 },
      },
      'reflex-sight': {
        name: 'Reflex sight', detail: 'Faster tracking when aimed and wider critical zones. Critical hits deal less damage.',
        changes: { criticalDamage: -3, aimCritical: .04, hipCritical: .04, aimSensitivity: .09, zoom: .08 },
      },
    },
  },
  receiver: {
    name: 'Receiver',
    options: {
      standard: { name: 'Service receiver', detail: 'Standard fire rate and damage.' },
      'rapid-receiver': {
        name: 'Rapid receiver', detail: 'Increases fire rate and reduces damage per shot.',
        changes: { bodyDamage: -5, criticalDamage: -7, interval: -.027 },
      },
      'precision-receiver': {
        name: 'Precision receiver', detail: 'Increases damage per shot. Slows fire rate and narrows the hip-fire critical zone.',
        changes: { bodyDamage: 3, criticalDamage: 4, interval: .023, hipCritical: -.03 },
      },
    },
  },
  magazine: {
    name: 'Magazine',
    options: {
      standard: { name: 'Service magazine', detail: 'Standard capacity and reload speed.' },
      'extended-magazine': {
        name: 'Extended magazine', detail: 'Holds about 40% more. Reloads more slowly.',
        changes: { magazineDelta: 12, reloadSeconds: .32 },
      },
      'quick-magazine': {
        name: 'Quick magazine', detail: 'Reloads about 30% faster. Holds fewer rounds.',
        changes: { magazineDelta: -8, reloadSeconds: -.40 },
      },
    },
  },
};

export const WEAPON_FINISHES = {
  factory: { name: 'Factory ivory', color: '#c7c3ae' },
  obsidian: { name: 'Obsidian', color: '#47484b' },
  arctic: { name: 'Arctic', color: '#aac9cf' },
  crimson: { name: 'Crimson', color: '#8d4642' },
  moss: { name: 'Moss', color: '#666e48' },
  desert: { name: 'Desert', color: '#b69b72' },
};

export const WEAPON_ACCENTS = {
  factory: { name: 'Jade', color: '#75f1b4' },
  amber: { name: 'Amber', color: '#ffb54c' },
  violet: { name: 'Violet', color: '#bc8cff' },
  ice: { name: 'Ice', color: '#7cddff' },
};

// Decals on the receiver. `ink` and `paper` colour the printed design.
export const WEAPON_STICKERS = {
  none: { name: 'No sticker', detail: 'Clean receiver.' },
  biohazard: { name: 'Biohazard', detail: 'Hazard trefoil on safety yellow.', ink: '#1d1b16', paper: '#f2c84b' },
  'happy-virus': { name: 'Happy virus', detail: 'A grinning capsid with spikes.', ink: '#2c1630', paper: '#ff8fc8' },
  bolt: { name: 'Voltage', detail: 'Lightning bolt on electric blue.', ink: '#fff7c2', paper: '#2e64d6' },
  heart: { name: 'Big heart', detail: 'A heart for the cardiac crew.', ink: '#ffffff', paper: '#d8344a' },
  skull: { name: 'Pathogen skull', detail: 'Bone-white skull on black.', ink: '#efe8dc', paper: '#18171a' },
  star: { name: 'Gold star', detail: 'Top marks from the immune system.', ink: '#5a3a06', paper: '#f7cf55' },
  studio: { name: 'Hallucinated', detail: 'The studio crest in jade.', ink: '#75f1b4', paper: '#14211b' },
};

// Charms hang from the weapon and give a buff while that weapon is in your hands.
export const WEAPON_CHARMS = {
  none: { name: 'No charm', buff: 'None', detail: 'No buff.', buffs: {} },
  clover: {
    name: 'Lucky clover', buff: 'Luck', detail: 'Critical hit zones are 30% larger.',
    color: '#5fd36b', buffs: { critScale: .3 },
  },
  fang: {
    name: 'Macrophage fang', buff: 'Strength', detail: 'Every hit deals 10% more damage.',
    color: '#efe6d2', buffs: { damageScale: .1 },
  },
  hourglass: {
    name: 'Quicksilver hourglass', buff: 'Reload speed', detail: 'Reloads 20% and weapon swaps 25% faster.',
    color: '#9fd8ff', buffs: { reloadScale: -.2, switchScale: -.25 },
  },
  feather: {
    name: 'Flagellum feather', buff: 'Movement speed', detail: 'Move 8% faster while this weapon is out.',
    color: '#ffb54c', buffs: { moveScale: .08 },
  },
  eye: {
    name: 'Steady eye', buff: 'Accuracy', detail: 'Spread is 30% tighter, hip-fire and aimed.',
    color: '#bc8cff', buffs: { spreadScale: -.3 },
  },
  capsule: {
    name: 'Ration capsule', buff: 'Capacity', detail: 'Magazines hold 25% more.',
    color: '#ff6f6f', buffs: { magazineScale: .25 },
  },
};

// The Needle Carbine's numbers are the reference every part change was tuned against.
export const DEFAULT_WEAPON_STATS = Object.freeze({
  bodyDamage: 23, criticalDamage: 42, interval: .118,
  aimCritical: .23, hipCritical: .16, aimSensitivity: .68,
  magazineDelta: 0, reloadSeconds: 1.35, muzzleFlash: 1,
  magazine: 30, pellets: 1, hipSpread: .008, aimSpread: .0015,
  falloffStart: Infinity, falloffEnd: Infinity, falloffMinimum: 1,
  splashDamage: 0, splashRadius: 0, projectileSpeed: 0,
  moveSpeed: 1, switchSeconds: .42, zoom: 48, recoil: 1, scope: false,
});

const weapon = (name, short, role, detail, stats) => Object.freeze({
  name, short, role, detail, stats: Object.freeze({ ...DEFAULT_WEAPON_STATS, ...stats }),
});

export const WEAPON_TYPES = Object.freeze({
  carbine: weapon('Needle Carbine', 'Carbine', 'Assault',
    'Accurate automatic fire that handles every threat.', {}),
  sniper: weapon('Lancet Rifle', 'Sniper', 'Precision',
    'Bolt-action. One heavy round every second; near-perfect accuracy through the scope, wild from the hip.', {
      bodyDamage: 110, criticalDamage: 235, interval: 1.05, reloadSeconds: 2.3, magazine: 5,
      aimCritical: .3, hipCritical: .1, aimSensitivity: .42, hipSpread: .07, aimSpread: .0004,
      muzzleFlash: 1.6, switchSeconds: .6, zoom: 20, recoil: 2.5, scope: true,
    }),
  shotgun: weapon('Burst Scattergun', 'Shotgun', 'Close quarters',
    'Nine pellets that shred anything nearby. Damage falls away fast past 7 meters.', {
      bodyDamage: 15, criticalDamage: 24, interval: .78, reloadSeconds: 2.1, magazine: 6, pellets: 9,
      aimCritical: .26, hipCritical: .22, hipSpread: .085, aimSpread: .058,
      falloffStart: 7, falloffEnd: 22, falloffMinimum: .18, muzzleFlash: 1.8, zoom: 54, recoil: 2,
    }),
  launcher: weapon('Phage Launcher', 'Rocket', 'Demolition',
    'Two rockets that burst on impact and splash every pathogen nearby. Very slow to reload.', {
      bodyDamage: 70, criticalDamage: 70, interval: 1.1, reloadSeconds: 3.9, magazine: 2,
      aimCritical: 0, hipCritical: 0, aimSensitivity: .6, hipSpread: .025, aimSpread: .006,
      splashDamage: 150, splashRadius: 5.2, projectileSpeed: 48, muzzleFlash: 2.2,
      moveSpeed: .92, switchSeconds: .75, zoom: 50, recoil: 3,
    }),
  pistol: weapon('Sting Pistol', 'Pistol', 'Sidearm',
    'Light rounds at a blistering rate with a near-instant reload.', {
      bodyDamage: 11, criticalDamage: 21, interval: .072, reloadSeconds: .5, magazine: 16,
      aimSensitivity: .8, hipSpread: .02, aimSpread: .006, muzzleFlash: .7,
      moveSpeed: 1.05, switchSeconds: .25, zoom: 54, recoil: .55,
    }),
});

export const WEAPON_ORDER = Object.freeze(Object.keys(WEAPON_TYPES));
export const ARSENAL_SLOTS = Object.freeze(['primary', 'secondary']);
const BUILD_DEFAULTS = Object.freeze({
  barrel: 'standard', muzzle: 'standard', optic: 'standard', receiver: 'standard', magazine: 'standard',
  finish: 'factory', accent: 'factory', sticker: 'none', charm: 'none',
});
const COSMETICS = { finish: WEAPON_FINISHES, accent: WEAPON_ACCENTS, sticker: WEAPON_STICKERS, charm: WEAPON_CHARMS };
const slotEntries = Object.entries(WEAPON_SLOTS);
const legacySlots = new Map([
  ['heavy-barrel', 'barrel'], ['compensator', 'muzzle'],
  ['marksman-optic', 'optic'], ['rapid-receiver', 'receiver'],
]);

const isWeapon = id => typeof id === 'string' && Object.hasOwn(WEAPON_TYPES, id);

export function normalizeWeaponBuild(value) {
  const build = { ...BUILD_DEFAULTS };
  if (!value || typeof value !== 'object') return build;
  for (const [slot, { options }] of slotEntries) {
    const choice = value[slot];
    if (typeof choice === 'string' && Object.hasOwn(options, choice)) build[slot] = choice;
  }
  for (const [key, options] of Object.entries(COSMETICS)) {
    if (typeof value[key] === 'string' && Object.hasOwn(options, value[key])) build[key] = value[key];
  }
  return build;
}

// Accepts a full loadout, a loadout without builds (as co-op snapshots send it), or a legacy
// single carbine build saved before weapons existed.
export function normalizeWeaponLoadout(value) {
  const source = value && typeof value === 'object' ? value : {};
  const arsenal = source.arsenal && typeof source.arsenal === 'object' ? source.arsenal : {};
  const primary = isWeapon(arsenal.primary) ? arsenal.primary : 'carbine';
  let secondary = isWeapon(arsenal.secondary) ? arsenal.secondary : 'pistol';
  if (secondary === primary) secondary = primary === 'pistol' ? 'carbine' : 'pistol';
  const slot = source.slot === 'secondary' ? 'secondary' : 'primary';
  const active = slot === 'primary' ? primary : secondary;
  const flatOwner = isWeapon(source.weapon) ? source.weapon : 'carbine';
  const storedBuilds = arsenal.builds && typeof arsenal.builds === 'object' ? arsenal.builds : {};
  const builds = {};
  for (const id of WEAPON_ORDER) {
    // Top-level fields describe the weapon they name; they win over a stale stored build.
    builds[id] = normalizeWeaponBuild(id === flatOwner && (!storedBuilds[id] || source.weapon) ? source : storedBuilds[id]);
  }
  return { weapon: active, slot, ...builds[active], arsenal: { primary, secondary, builds } };
}

export const DEFAULT_WEAPON_LOADOUT = Object.freeze(normalizeWeaponLoadout({}));

export function legacyWeaponLoadout(mod, finish) {
  const slot = legacySlots.get(mod);
  return normalizeWeaponLoadout(slot ? { [slot]: mod, finish } : { finish });
}

// The same loadout with the other carried weapon (or a named slot) in hand.
export function loadoutInSlot(loadout, slot) {
  return normalizeWeaponLoadout({ ...normalizeWeaponLoadout(loadout), weapon: undefined, slot });
}

// Replaces one carried weapon, keeping every build.
export function loadoutWithWeapon(loadout, slot, id) {
  const current = normalizeWeaponLoadout(loadout);
  const arsenal = { ...current.arsenal, [slot]: id };
  const other = slot === 'primary' ? 'secondary' : 'primary';
  if (arsenal[other] === id) arsenal[other] = current.arsenal[slot];
  return normalizeWeaponLoadout({ slot: current.slot, arsenal });
}

// Changes parts or cosmetics on one weapon's build.
export function loadoutWithBuild(loadout, id, changes) {
  const current = normalizeWeaponLoadout(loadout);
  const builds = { ...current.arsenal.builds, [id]: { ...current.arsenal.builds[id], ...changes } };
  return normalizeWeaponLoadout({ slot: current.slot, arsenal: { ...current.arsenal, builds } });
}

export function otherSlot(slot) {
  return slot === 'secondary' ? 'primary' : 'secondary';
}

// Part changes were authored for the carbine; other weapons scale them to their own numbers.
function scaledChange(stat, delta, base) {
  const reference = DEFAULT_WEAPON_STATS;
  if (stat === 'bodyDamage' || stat === 'criticalDamage') return delta * base.bodyDamage / reference.bodyDamage;
  if (stat === 'interval') return delta * base.interval / reference.interval;
  if (stat === 'reloadSeconds') return delta * base.reloadSeconds / reference.reloadSeconds;
  if (stat === 'magazineDelta') {
    const scaled = delta * base.magazine / reference.magazine;
    return delta > 0 ? Math.max(1, Math.round(scaled)) : Math.min(base.magazine > 2 ? -1 : 0, Math.round(scaled));
  }
  return delta;
}

export function weaponStats(loadout) {
  const selection = normalizeWeaponLoadout(loadout);
  const type = WEAPON_TYPES[selection.weapon];
  const base = type.stats;
  const stats = { ...base, weapon: selection.weapon, name: type.name };
  let spread = 1;
  let hipSpread = 1;
  let aimSpread = 1;
  let zoom = 1;
  for (const [slot, { options }] of slotEntries) {
    const { changes } = options[selection[slot]];
    if (!changes) continue;
    for (const [stat, delta] of Object.entries(changes)) {
      if (stat === 'spread') spread += delta;
      else if (stat === 'hipSpread') hipSpread += delta;
      else if (stat === 'aimSpread') aimSpread += delta;
      else if (stat === 'zoom') zoom += delta;
      else stats[stat] += scaledChange(stat, delta, base);
    }
  }
  if (base.splashDamage) stats.splashDamage = base.splashDamage * stats.bodyDamage / base.bodyDamage;
  const buffs = WEAPON_CHARMS[selection.charm].buffs;
  const damage = 1 + (buffs.damageScale ?? 0);
  stats.bodyDamage *= damage;
  stats.criticalDamage *= damage;
  stats.splashDamage *= damage;
  stats.aimCritical *= 1 + (buffs.critScale ?? 0);
  stats.hipCritical *= 1 + (buffs.critScale ?? 0);
  stats.reloadSeconds *= 1 + (buffs.reloadScale ?? 0);
  stats.switchSeconds *= 1 + (buffs.switchScale ?? 0);
  stats.moveSpeed *= 1 + (buffs.moveScale ?? 0);
  spread *= 1 + (buffs.spreadScale ?? 0);
  stats.hipSpread *= Math.max(.2, spread * hipSpread);
  stats.aimSpread *= Math.max(.2, spread * aimSpread);
  stats.magazineScale = 1 + (buffs.magazineScale ?? 0);
  stats.zoom = Math.min(60, base.zoom * zoom);
  stats.interval = Math.max(.05, stats.interval);
  stats.reloadSeconds = Math.max(.3, stats.reloadSeconds);
  stats.bodyDamage = Math.max(1, stats.bodyDamage);
  stats.criticalDamage = Math.max(stats.bodyDamage, stats.criticalDamage);
  return stats;
}

// Rounds per magazine. `baseMagazine` is 30 normally and grows with the Deep Magazine upgrade.
export function magazineCapacity(stats, baseMagazine = DEFAULT_WEAPON_STATS.magazine) {
  const magazine = stats.magazine ?? DEFAULT_WEAPON_STATS.magazine;
  const upgraded = magazine === DEFAULT_WEAPON_STATS.magazine
    ? baseMagazine : Math.round(magazine * baseMagazine / DEFAULT_WEAPON_STATS.magazine);
  return Math.max(1, Math.round((upgraded + (stats.magazineDelta ?? 0)) * (stats.magazineScale ?? 1)));
}
