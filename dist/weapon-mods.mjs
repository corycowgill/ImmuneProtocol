export const WEAPON_MODS = {
  standard: {
    name: 'Factory assembly', detail: 'Balanced damage and fire rate.',
    bodyDamage: 23, criticalDamage: 42, interval: .118, aimCritical: .23, hipCritical: .16, aimSensitivity: .68,
  },
  'heavy-barrel': {
    name: 'Heavy barrel', detail: 'More damage per round with slower follow-up shots.',
    bodyDamage: 30, criticalDamage: 52, interval: .146, aimCritical: .23, hipCritical: .16, aimSensitivity: .68,
  },
  compensator: {
    name: 'Compensator', detail: 'Wider critical-hit zone from the hip. Lower critical damage.',
    bodyDamage: 23, criticalDamage: 39, interval: .125, aimCritical: .27, hipCritical: .36, aimSensitivity: .68,
  },
  'marksman-optic': {
    name: 'Marksman optic', detail: 'Higher critical damage and a wider aimed critical zone. Narrower from the hip.',
    bodyDamage: 23, criticalDamage: 50, interval: .127, aimCritical: .36, hipCritical: .12, aimSensitivity: .60,
  },
  'rapid-receiver': {
    name: 'Rapid receiver', detail: 'Fastest fire rate with less damage per round.',
    bodyDamage: 17, criticalDamage: 34, interval: .086, aimCritical: .23, hipCritical: .16, aimSensitivity: .68,
  },
};

export const WEAPON_FINISHES = {
  factory: { name: 'Factory ivory', color: '#c7c3ae' },
  obsidian: { name: 'Obsidian', color: '#47484b' },
  arctic: { name: 'Arctic', color: '#aac9cf' },
  crimson: { name: 'Crimson', color: '#8d4642' },
};
