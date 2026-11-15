export const WEAPON_SLOTS = {
  barrel: {
    name: 'Barrel',
    options: {
      standard: { name: 'Service barrel', detail: 'Standard damage and fire rate.' },
      'heavy-barrel': {
        name: 'Heavy barrel', detail: 'Hits harder with slower follow-up shots.',
        changes: { bodyDamage: 5, criticalDamage: 7, interval: .025 },
      },
      'short-barrel': {
        name: 'Short barrel', detail: 'Cycles faster and widens the hip-fire critical zone. Deals less damage.',
        changes: { bodyDamage: -3, criticalDamage: -3, interval: -.016, hipCritical: .06 },
      },
    },
  },
  muzzle: {
    name: 'Muzzle',
    options: {
      standard: { name: 'Thread protector', detail: 'Full flash intensity and standard damage.' },
      compensator: {
        name: 'Compensator', detail: 'Widens the hip-fire critical zone. Critical hits deal less damage.',
        changes: { criticalDamage: -4, hipCritical: .16 },
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
      standard: { name: 'Service sights', detail: 'Standard aim sensitivity and critical zones.' },
      'marksman-optic': {
        name: 'Marksman optic', detail: 'Larger aimed critical zone and harder critical hits. Slower tracking and a smaller hip-fire critical zone.',
        changes: { criticalDamage: 6, aimCritical: .10, hipCritical: -.04, aimSensitivity: -.08 },
      },
      'reflex-sight': {
        name: 'Reflex sight', detail: 'Faster tracking when aimed and wider critical zones. Critical hits deal less damage.',
        changes: { criticalDamage: -3, aimCritical: .04, hipCritical: .04, aimSensitivity: .09 },
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
        name: 'Extended magazine', detail: 'Holds 12 extra rounds. Reload takes 0.32 seconds longer.',
        changes: { magazineDelta: 12, reloadSeconds: .32 },
      },
      'quick-magazine': {
        name: 'Quick magazine', detail: 'Reloads 0.40 seconds faster. Holds 8 fewer rounds.',
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

export const DEFAULT_WEAPON_LOADOUT = Object.freeze({
  barrel: 'standard', muzzle: 'standard', optic: 'standard', receiver: 'standard', magazine: 'standard',
  finish: 'factory', accent: 'factory',
});

export const DEFAULT_WEAPON_STATS = Object.freeze({
  bodyDamage: 23, criticalDamage: 42, interval: .118,
  aimCritical: .23, hipCritical: .16, aimSensitivity: .68,
  magazineDelta: 0, reloadSeconds: 1.35, muzzleFlash: 1,
});

const slotEntries = Object.entries(WEAPON_SLOTS);
const legacySlots = new Map([
  ['heavy-barrel', 'barrel'], ['compensator', 'muzzle'],
  ['marksman-optic', 'optic'], ['rapid-receiver', 'receiver'],
]);

export function normalizeWeaponLoadout(value) {
  const loadout = { ...DEFAULT_WEAPON_LOADOUT };
  if (!value || typeof value !== 'object') return loadout;
  for (const [slot, { options }] of slotEntries) {
    const choice = value[slot];
    if (typeof choice === 'string' && Object.hasOwn(options, choice)) loadout[slot] = choice;
  }
  if (typeof value.finish === 'string' && Object.hasOwn(WEAPON_FINISHES, value.finish)) loadout.finish = value.finish;
  if (typeof value.accent === 'string' && Object.hasOwn(WEAPON_ACCENTS, value.accent)) loadout.accent = value.accent;
  return loadout;
}

export function legacyWeaponLoadout(mod, finish) {
  const slot = legacySlots.get(mod);
  return normalizeWeaponLoadout(slot ? { [slot]: mod, finish } : { finish });
}

export function weaponStats(loadout) {
  const selection = normalizeWeaponLoadout(loadout);
  const stats = { ...DEFAULT_WEAPON_STATS };
  for (const [slot, { options }] of slotEntries) {
    const { changes } = options[selection[slot]];
    if (!changes) continue;
    for (const [stat, delta] of Object.entries(changes)) stats[stat] += delta;
  }
  return stats;
}
