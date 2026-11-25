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
  gunmetal: { name: 'Gunmetal', color: '#5d636a' },
  midnight: { name: 'Midnight navy', color: '#2e3b58' },
  cobalt: { name: 'Cobalt', color: '#3f63b0' },
  teal: { name: 'Deep teal', color: '#2f6266' },
  toxic: { name: 'Toxic lime', color: '#8fb83a' },
  plum: { name: 'Plum', color: '#5e3b5c' },
  bubblegum: { name: 'Bubblegum', color: '#d77fa8' },
  rose: { name: 'Rose gold', color: '#c08a7d' },
  copper: { name: 'Burnt copper', color: '#a65e3a' },
  ash: { name: 'Ash gray', color: '#8e9192' },
  // Achievement rewards (achievements.mjs REWARDS).
  surgical: { name: 'Surgical steel', color: '#a9b8bf' },
  presidential: { name: 'Presidential gold', color: '#b8913a' },
  platinum: { name: 'Platinum', color: '#dfe7ec' },
};

export const WEAPON_ACCENTS = {
  factory: { name: 'Jade', color: '#75f1b4' },
  amber: { name: 'Amber', color: '#ffb54c' },
  violet: { name: 'Violet', color: '#bc8cff' },
  ice: { name: 'Ice', color: '#7cddff' },
  'code-red': { name: 'Code red', color: '#ff3b4e' },
  viral: { name: 'Viral magenta', color: '#ff4fd8' },
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
  dna: { name: 'Double helix', detail: 'A twisting DNA ladder on teal.', ink: '#f4fbff', paper: '#1d7f8c' },
  antibody: { name: 'Antibody', detail: 'The Y-shaped hero of the immune system.', ink: '#ffffff', paper: '#6f4ae0' },
  flame: { name: 'Hot shot', detail: 'A flame on charcoal.', ink: '#ff8a1f', paper: '#231b1b' },
  snowflake: { name: 'Snowflake', detail: 'Six crisp arms on winter blue.', ink: '#ffffff', paper: '#3e8fd8' },
  paw: { name: 'Tiger paw', detail: 'A big cat print on orange.', ink: '#1a1410', paper: '#f08a24' },
  crosshair: { name: 'Crosshair', detail: 'Red reticle on bone white.', ink: '#d6262c', paper: '#f1ece2' },
  cat: { name: 'Lab cat', detail: 'The lab mascot, looking smug.', ink: '#24191f', paper: '#ffd6a1' },
  pizza: { name: 'Pizza slice', detail: 'Rations of the elite.', ink: '#b8281f', paper: '#ffd062' },
  rainbow: { name: 'Rainbow', detail: 'Seven bands of good vibes.', ink: '#ffffff', paper: '#8fd3ff' },
  peace: { name: 'Peace', detail: 'Ironic, given the circumstances.', ink: '#ffffff', paper: '#2fa36b' },
  trophy: { name: 'Trophy', detail: 'Every boss in the body, on the shelf.', ink: '#6b4b06', paper: '#f4c94e' },
  medic: { name: 'Field medic', detail: 'A green cross for the tissue menders.', ink: '#ffffff', paper: '#1f9d62' },
  squad: { name: 'Squad up', detail: 'Three suits, one infection.', ink: '#0f1a21', paper: '#8fe4dd' },
};

// Patterned wraps over the weapon's polymer furniture. The body finish still colors the metal.
export const WEAPON_SKINS = {
  none: { name: 'Finish only', detail: 'Plain polymer in the body finish.' },
  tiger: { name: 'Tiger', detail: 'Black stripes on burnt orange.' },
  zebra: { name: 'Zebra', detail: 'Bold black and white bands.' },
  winter: { name: 'Winter camo', detail: 'Snow, ice and slate blotches.' },
  camo: { name: 'Woodland camo', detail: 'Leaf green, bark and loam.' },
  digital: { name: 'Urban digital', detail: 'Pixelated concrete grays.' },
  cyberpunk: { name: 'Cyberpunk', detail: 'Neon circuitry that glows in the dark.', glow: true },
  carbon: { name: 'Carbon fiber', detail: 'Woven twill under clear lacquer.' },
  molten: { name: 'Molten core', detail: 'Black rock split by glowing magma.', glow: true },
  bloodstream: { name: 'Bloodstream', detail: 'Red cells tumbling through plasma.' },
  neural: { name: 'Neural net', detail: 'Firing synapses that glow in the dark.', glow: true },
  outbreak: { name: 'Outbreak', detail: 'A field of spiked capsids on toxic green.' },
  prismatic: { name: 'Prismatic', detail: 'Holographic platinum that shifts colour.', glow: true },
};

// Wide prints along the side of the stock or body.
export const WEAPON_DECALS = {
  none: { name: 'No decal', detail: 'Clean sides.' },
  racing: { name: 'Racing stripes', detail: 'Twin stripes for going fast.', ink: '#f4f0e8', accent: '#e23b3b' },
  flames: { name: 'Hot rod flames', detail: 'Classic licks of fire.', ink: '#ffb02e', accent: '#e8401c' },
  tally: { name: 'Kill tally', detail: 'Count every pathogen you clear.', ink: '#f4f0e8', accent: '#f4f0e8' },
  chevrons: { name: 'Hazard chevrons', detail: 'Yellow and black warning bands.', ink: '#f2c84b', accent: '#151412' },
  circuit: { name: 'Circuit traces', detail: 'Glowing jade circuitry.', ink: '#75f1b4', accent: '#2f8f6c' },
  barcode: { name: 'Barcode', detail: 'Property of the immune system.', ink: '#f4f0e8', accent: '#f4f0e8' },
  number: { name: 'Unit 07', detail: 'Stenciled squad number.', ink: '#f4f0e8', accent: '#ffb54c' },
  splatter: { name: 'Paint splatter', detail: 'Pink, cyan and lime splashes.', ink: '#ff5fa2', accent: '#3ad6e8' },
  ecg: { name: 'Heartbeat', detail: 'A glowing ECG trace down the side.', ink: '#6bff8f', accent: '#1d7f3c' },
  blast: { name: 'Blast radius', detail: 'Shockwave rings from a five-kill rocket.', ink: '#ffb02e', accent: '#ff5a2a' },
  capsids: { name: 'Capsid parade', detail: 'A row of spiked viruses, marching single file.', ink: '#ff6f61', accent: '#f4f0e8' },
  helix: { name: 'Double helix', detail: 'A DNA strand running the length of the gun.', ink: '#7cddff', accent: '#ff4fd8' },
  claws: { name: 'Claw marks', detail: 'Three torn slashes, as if something fought back.', ink: '#f4f0e8', accent: '#d6262c' },
  pixels: { name: 'Pixel fade', detail: 'Squares dissolving from the stock forward.', ink: '#75f1b4', accent: '#3ad6e8' },
  lightning: { name: 'Lightning', detail: 'A glowing bolt from stock to muzzle.', ink: '#fff7c2', accent: '#7c9cff' },
  stars: { name: 'Shooting stars', detail: 'Gold stars with streaking tails.', ink: '#f7cf55', accent: '#ff8a1f' },
  caution: { name: 'Contagion tape', detail: 'Quarantine tape: do not cross.', ink: '#151412', accent: '#f2c84b' },
  pinstripe: { name: 'Pinstripe', detail: 'Hand-painted lines with a curl at each end.', ink: '#f4f0e8', accent: '#ffb54c' },
  crosses: { name: 'Medic crosses', detail: 'A row of red crosses for the tissue menders.', ink: '#f4f0e8', accent: '#e23b3b' },
  resonance: { name: 'Resonance', detail: 'Stacked sound waves from the inner ear.', ink: '#bc8cff', accent: '#7cddff' },
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
  dice: {
    name: "Gambler's die", buff: 'Fortune', detail: 'Critical hit zones 18% larger and 4% more damage.',
    color: '#f4f0e8', buffs: { critScale: .18, damageScale: .04 },
  },
  antibody: {
    name: 'Antibody', buff: 'Precision', detail: '6% more damage and 10% tighter spread.',
    color: '#8f6cff', buffs: { damageScale: .06, spreadScale: -.1 },
  },
  snowflake: {
    name: 'Frost crystal', buff: 'Composure', detail: 'Reloads 10% faster and spread is 12% tighter.',
    color: '#bfe8ff', buffs: { reloadScale: -.1, spreadScale: -.12 },
  },
  locket: {
    name: 'Heart locket', buff: 'Agility', detail: 'Move 5% faster and swap weapons 20% faster.',
    color: '#f0b53c', buffs: { moveScale: .05, switchScale: -.2 },
  },
  claw: {
    name: 'Tiger claw', buff: 'Ferocity', detail: '7% more damage and critical zones 10% larger.',
    color: '#f2e2c4', buffs: { damageScale: .07, critScale: .1 },
  },
  skull: {
    name: 'Berserker skull', buff: 'Fury', detail: '15% more damage, but spread is 12% wider.',
    color: '#e9e2d2', buffs: { damageScale: .15, spreadScale: .12 },
  },
  battery: {
    name: 'Spare cell', buff: 'Endurance', detail: 'Magazines hold 15% more and reloads are 8% faster.',
    color: '#5ee08a', buffs: { magazineScale: .15, reloadScale: -.08 },
  },
  star: {
    name: 'Shooting star', buff: 'All-rounder', detail: 'A little of everything: damage, reload, speed and accuracy.',
    color: '#ffd24a', buffs: { damageScale: .03, reloadScale: -.05, moveScale: .03, spreadScale: -.05 },
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

// The auto-turret is built and dressed like a carried weapon, with its own three part slots.
// Part changes are multipliers on the turret's base numbers (see turretStats).
export const TURRET_BASE = Object.freeze({ damage: 22, interval: .354, range: 20, slow: 1.4, stagger: 1.6 });
export const TURRET_SLOTS = {
  barrel: {
    name: 'Barrel',
    options: {
      standard: { name: 'Service barrel', detail: 'Standard damage and fire rate.' },
      'heavy-barrel': { name: 'Heavy barrel', detail: 'Hits 25% harder. Fires 15% slower.', changes: { damage: .25, rate: -.15 } },
      'short-barrel': { name: 'Short barrel', detail: 'Fires 20% faster. Each round deals 15% less.', changes: { damage: -.15, rate: .2 } },
    },
  },
  receiver: {
    name: 'Receiver',
    options: {
      standard: { name: 'Service receiver', detail: 'Standard slow and stagger.' },
      'cryo-receiver': { name: 'Cryo receiver', detail: 'Hits slow pathogens 60% longer. Deals 10% less damage.', changes: { slow: .6, damage: -.1 } },
      'shock-receiver': { name: 'Shock receiver', detail: 'Can knock a pathogen out of an attack every second instead of every 1.6. Fires 10% slower.', changes: { stagger: -.375, rate: -.1 } },
    },
  },
  sensor: {
    name: 'Sensor',
    options: {
      standard: { name: 'Service sensor', detail: 'Tracks targets out to 20 m.' },
      'long-range-sensor': { name: 'Long-range sensor', detail: 'Tracks out to 26 m. Fires 8% slower.', changes: { range: .3, rate: -.08 } },
      'close-in-sensor': { name: 'Close-in sensor', detail: 'Tracks out to 15 m only, but fires 18% faster.', changes: { range: -.25, rate: .18 } },
    },
  },
};
const TURRET_DEFAULTS = Object.freeze({
  barrel: 'standard', receiver: 'standard', sensor: 'standard',
  finish: 'factory', accent: 'factory', skin: 'none', decal: 'none', sticker: 'none', charm: 'none',
});

export function normalizeTurretBuild(value) {
  const build = { ...TURRET_DEFAULTS };
  if (!value || typeof value !== 'object') return build;
  for (const [slot, { options }] of Object.entries(TURRET_SLOTS)) {
    if (typeof value[slot] === 'string' && Object.hasOwn(options, value[slot])) build[slot] = value[slot];
  }
  for (const [key, options] of Object.entries(COSMETICS)) {
    if (typeof value[key] === 'string' && Object.hasOwn(options, value[key])) build[key] = value[key];
  }
  return build;
}

// Damage per round, seconds between rounds, range in metres, slow seconds, and the seconds
// between attack interruptions on one pathogen. A charm's damage buff carries over.
export function turretStats(value) {
  const build = normalizeTurretBuild(value);
  const scale = { damage: 1, rate: 1, range: 1, slow: 1, stagger: 1 };
  for (const [slot, { options }] of Object.entries(TURRET_SLOTS)) {
    for (const [stat, delta] of Object.entries(options[build[slot]].changes ?? {})) scale[stat] += delta;
  }
  scale.damage *= 1 + (WEAPON_CHARMS[build.charm].buffs.damageScale ?? 0);
  return {
    damage: TURRET_BASE.damage * scale.damage,
    interval: TURRET_BASE.interval / scale.rate,
    range: TURRET_BASE.range * scale.range,
    slow: TURRET_BASE.slow * scale.slow,
    stagger: TURRET_BASE.stagger * scale.stagger,
  };
}
// Each suit brings one nano companion: the auto-turret above, or the medic drone below.
export const COMPANIONS = Object.freeze({
  turret: Object.freeze({ name: 'Auto-turret', short: 'Turret', detail: 'Place it once per mission to hold an approach. Hits slow pathogens and can knock them out of attacks.' }),
  drone: Object.freeze({ name: 'Medic drone', short: 'Drone', detail: 'Follows you and slowly mends the most damaged suit or tissue node near it. Station it over a node, or call it back.' }),
});
export const DEFAULT_COMPANION = 'turret';
export const normalizeCompanion = id => typeof id === 'string' && Object.hasOwn(COMPANIONS, id) ? id : DEFAULT_COMPANION;

// The medic drone hovers by its suit and mends one target at a time: the suit or tissue node in
// its field that has lost the most. Healing is deliberately slow (about one point a second), so
// it keeps a defence topped up between pushes rather than replacing the tissue sealer, and it only
// mends a suit that has gone a moment without being hit (DRONE_RULES.calm), so it cannot out-heal a
// fight in progress.
// Part changes are multipliers on these numbers (see droneStats).
export const DRONE_BASE = Object.freeze({ suitHeal: 1, tissueHeal: 1, radius: 8, speed: 9 });
export const DRONE_SLOTS = {
  emitter: {
    name: 'Emitter',
    options: {
      standard: { name: 'Field emitter', detail: 'Mends a suit or tissue node by 1 point a second.' },
      'triage-emitter': { name: 'Triage emitter', detail: 'Mends suits 40% faster. Mends tissue 40% slower.', changes: { suitHeal: .4, tissueHeal: -.4 } },
      'graft-emitter': { name: 'Graft emitter', detail: 'Mends tissue 40% faster. Mends suits 40% slower.', changes: { suitHeal: -.4, tissueHeal: .4 } },
    },
  },
  field: {
    name: 'Field',
    options: {
      standard: { name: 'Service field', detail: 'Reaches 8 m from the drone.' },
      'wide-field': { name: 'Wide field', detail: 'Reaches 11 m. Mends 15% slower.', changes: { radius: .375, suitHeal: -.15, tissueHeal: -.15 } },
      'focus-field': { name: 'Focus field', detail: 'Reaches only 5 m, but mends 15% faster.', changes: { radius: -.375, suitHeal: .15, tissueHeal: .15 } },
    },
  },
  rotors: {
    name: 'Rotors',
    options: {
      standard: { name: 'Service rotors', detail: 'Keeps pace with a running suit.' },
      'sprint-rotors': { name: 'Sprint rotors', detail: 'Flies 35% faster to keep up and reposition. Mends 5% slower.', changes: { speed: .35, suitHeal: -.05, tissueHeal: -.05 } },
      'heavy-rotors': { name: 'Heavy rotors', detail: 'Flies 30% slower, but carries a bigger cell: mends 10% faster.', changes: { speed: -.3, suitHeal: .1, tissueHeal: .1 } },
    },
  },
};
const COSMETIC_DEFAULTS = Object.freeze({ finish: 'factory', accent: 'factory', skin: 'none', decal: 'none', sticker: 'none', charm: 'none' });
const DRONE_DEFAULTS = Object.freeze({ emitter: 'standard', field: 'standard', rotors: 'standard', ...COSMETIC_DEFAULTS });

export function normalizeDroneBuild(value) {
  const build = { ...DRONE_DEFAULTS };
  if (!value || typeof value !== 'object') return build;
  for (const [slot, { options }] of Object.entries(DRONE_SLOTS)) {
    if (typeof value[slot] === 'string' && Object.hasOwn(options, value[slot])) build[slot] = value[slot];
  }
  return normalizeCosmetics(value, build);
}

// Points a second on suits and on tissue, field radius in metres and flight speed in m/s. A
// charm's damage buff carries over as extra healing, as it carries over to turret damage.
export function droneStats(value) {
  const build = normalizeDroneBuild(value);
  const scale = { suitHeal: 1, tissueHeal: 1, radius: 1, speed: 1 };
  for (const [slot, { options }] of Object.entries(DRONE_SLOTS)) {
    for (const [stat, delta] of Object.entries(options[build[slot]].changes ?? {})) scale[stat] += delta;
  }
  const charm = 1 + (WEAPON_CHARMS[build.charm].buffs.damageScale ?? 0);
  return {
    suitHeal: DRONE_BASE.suitHeal * scale.suitHeal * charm,
    tissueHeal: DRONE_BASE.tissueHeal * scale.tissueHeal * charm,
    radius: DRONE_BASE.radius * scale.radius,
    speed: DRONE_BASE.speed * scale.speed,
  };
}

// The tissue sealer (the repair tool): each pulse of `interval` seconds restores `repair` tissue
// to the node or gash in reach. The Fast Sealer field upgrade and difficulty change `repair`.
export const SEALER_BASE = Object.freeze({ repair: 13, interval: .82, reach: 5.4 });

// The tissue sealer takes the same paint, skins, decals, stickers and charms as
// the guns. On the sealer they are cosmetic: a charm swings from it but never changes repairs.
export function normalizeSealerBuild(value) {
  return normalizeCosmetics(value, { ...COSMETIC_DEFAULTS });
}

function normalizeCosmetics(value, build) {
  if (!value || typeof value !== 'object') return build;
  for (const [key, options] of Object.entries(COSMETICS)) {
    if (typeof value[key] === 'string' && Object.hasOwn(options, value[key])) build[key] = value[key];
  }
  return build;
}

export const ARSENAL_SLOTS = Object.freeze(['primary', 'secondary']);
const BUILD_DEFAULTS = Object.freeze({
  barrel: 'standard', muzzle: 'standard', optic: 'standard', receiver: 'standard', magazine: 'standard',
  finish: 'factory', accent: 'factory', skin: 'none', decal: 'none', sticker: 'none', charm: 'none',
});
const COSMETICS = {
  finish: WEAPON_FINISHES, accent: WEAPON_ACCENTS, skin: WEAPON_SKINS, decal: WEAPON_DECALS,
  sticker: WEAPON_STICKERS, charm: WEAPON_CHARMS,
};
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
  return {
    weapon: active, slot, ...builds[active],
    arsenal: {
      primary, secondary, builds, turret: normalizeTurretBuild(arsenal.turret),
      companion: normalizeCompanion(arsenal.companion), drone: normalizeDroneBuild(arsenal.drone), sealer: normalizeSealerBuild(arsenal.sealer),
    },
  };
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

// Changes parts or cosmetics on the auto-turret.
export function loadoutWithTurret(loadout, changes) {
  const current = normalizeWeaponLoadout(loadout);
  return normalizeWeaponLoadout({ slot: current.slot, arsenal: { ...current.arsenal, turret: { ...current.arsenal.turret, ...changes } } });
}

// Changes parts or cosmetics on the medic drone.
export function loadoutWithDrone(loadout, changes) {
  const current = normalizeWeaponLoadout(loadout);
  return normalizeWeaponLoadout({ slot: current.slot, arsenal: { ...current.arsenal, drone: { ...current.arsenal.drone, ...changes } } });
}

// Changes cosmetics on the tissue sealer.
export function loadoutWithSealer(loadout, changes) {
  const current = normalizeWeaponLoadout(loadout);
  return normalizeWeaponLoadout({ slot: current.slot, arsenal: { ...current.arsenal, sealer: { ...current.arsenal.sealer, ...changes } } });
}

// Chooses the nano companion (turret or drone) the suit deploys with.
export function loadoutWithCompanion(loadout, companion) {
  const current = normalizeWeaponLoadout(loadout);
  return normalizeWeaponLoadout({ slot: current.slot, arsenal: { ...current.arsenal, companion } });
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
