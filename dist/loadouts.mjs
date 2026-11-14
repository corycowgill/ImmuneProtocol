const acidAndPressureReduction = 40;
const turretSlowDuration = 2.2;

export const FIELD_UPGRADES = Object.freeze({
  'fast-sealer': {
    name: 'Fast Sealer',
    description: 'Restores 18 tissue points per repair pulse.',
    repairAmount: 18,
  },
  'deep-magazine': {
    name: 'Deep Magazine',
    description: 'Loads 42 rounds per magazine.',
    magazineSize: 42,
  },
  'insulated-suit': {
    name: 'Insulated Suit',
    description: `Takes ${acidAndPressureReduction}% less damage from acid and pressure waves.`,
    damageMultiplier: 1 - acidAndPressureReduction / 100,
  },
  'turret-stabilizer': {
    name: 'Turret Stabilizer',
    description: `Turret hits slow enemies for ${turretSlowDuration} seconds.`,
    slowDuration: turretSlowDuration,
  },
});
