function node(id, name, x, z) {
  return { id, name, x, y: 1.25, z };
}

function wave(name, cadence, species, lanes) {
  return { name, cadence, species, lanes };
}

export const ORGAN_MISSIONS = {
  lungs: {
    name: 'Bronchial Fork',
    briefing: 'Move into a side pocket before each exhale pushes you down the central airway.',
    nodes: [node('lungs-left', 'Left Alveoli', -11, -7), node('lungs-right', 'Right Alveoli', 11, -7)],
    entry: [0, 15],
    inlets: [[[-18, -24], [-24, -12], [-17, 20]], [[18, -24], [24, -12], [17, 20]]],
    hazard: {
      name: 'Exhale', instruction: 'Leave the center airway', effect: 'Airflow pushes you back',
      x: 0, z: -3, width: 11.2, depth: 42, recovery: 3.7, warning: 3.4, active: 3.1, push: 8.5,
    },
    waves: [
      wave('Crosswind', 1.20, ['virus', 'virus', 'spore', 'guard', 'virus', 'spore', 'virus'], 'LLRLRRL'),
      wave('Blocked Airway', .88, ['guard', 'spore', 'virus', 'spore', 'guard', 'virus', 'bacillus', 'spore', 'virus', 'bacillus'], 'RRLRLLLRRL'),
    ],
  },
  stomach: {
    name: 'Gastric Chamber',
    briefing: 'Circle the raised banks before acid floods the center basin.',
    nodes: [node('stomach-wall', 'Gastric Wall', -13, -8), node('stomach-lining', 'Pyloric Lining', 12, 3)],
    entry: [4, 15],
    inlets: [[[-22, -18], [-24, 4], [-17, -27]], [[23, -15], [20, 19], [13, -31]]],
    hazard: {
      name: 'Acid rise', instruction: 'Climb out of the basin', effect: 'Acid damages your suit',
      x: 0, z: -4, radius: 8, recovery: 5.8, warning: 3.6, active: 4.6, damage: 9,
    },
    waves: [
      wave('Acid-Tolerant Bloom', 1.12, ['virus', 'splitter', 'spore', 'virus', 'spore', 'guard', 'splitter', 'bacillus'], 'RLLRLRRL'),
      wave('Gastric Siege', .82, ['splitter', 'guard', 'spore', 'bacillus', 'splitter', 'virus', 'spore', 'guard', 'bacillus', 'spore', 'virus'], 'LLRLRRRLRLL'),
    ],
  },
  intestines: {
    name: 'Intestinal Bend',
    briefing: 'Use the side channels when a pressure wave sweeps the center passage.',
    nodes: [node('intestines-fold', 'Villus Bed', -11, -12), node('intestines-lining', 'Mucosal Bank', 11, 8)],
    entry: [0, 18],
    inlets: [[[-14, -31], [-23, -11], [-20, 12]], [[16, 24], [24, 0], [18, -26]]],
    hazard: {
      name: 'Contraction', instruction: 'Move into a side channel', effect: 'Pressure wave sweeping the center',
      x: 0, z: -31, endZ: 25, width: 16, depth: 7, recovery: 6, warning: 3.8, active: 4.3, damage: 14, push: 4,
    },
    waves: [
      wave('Parasitic Bloom', 1.08, ['splitter', 'virus', 'spore', 'splitter', 'bacillus', 'virus', 'spore'], 'LLRLRLR'),
      wave('Counterflow', .95, ['guard', 'spore', 'splitter', 'virus', 'guard', 'bacillus', 'splitter', 'spore', 'virus'], 'RRLLRLRRL'),
      wave('Choke Point', .78, ['guard', 'splitter', 'splitter', 'bacillus', 'spore', 'guard', 'virus', 'spore', 'bacillus', 'splitter', 'virus', 'spore'], 'LRRLRLRRLLRL'),
    ],
  },
  ear: {
    name: 'Inner Ear',
    briefing: 'Set your turret beyond the resonance rings. Pulses slow you and jam turrets inside.',
    nodes: [node('ear-cochlea', 'Cochlear Wall', -10, -9), node('ear-vestibule', 'Vestibular Node', 10, 0)],
    entry: [0, 14],
    inlets: [[[-18, -24], [-23, 0], [-13, -33]], [[20, 18], [22, -11], [15, -27]]],
    hazard: {
      name: 'Resonance', instruction: 'Keep your turret outside the ring', effect: 'Slows suit movement and jams turrets',
      radius: 8, alternateNodes: true, recovery: 5.2, warning: 3.5, active: 3.8, slow: .58,
    },
    waves: [
      wave('Harmonic Swarm', .94, ['spore', 'spore', 'guard', 'splitter', 'virus', 'spore', 'spore', 'guard', 'virus'], 'LRRLRLLRL'),
      wave('Feedback', .77, ['guard', 'splitter', 'spore', 'spore', 'guard', 'splitter', 'bacillus', 'virus', 'spore', 'splitter', 'bacillus', 'spore'], 'RRLRLLRLLRLR'),
    ],
  },
  brain: {
    name: 'Neural Cortex',
    briefing: 'Intercept the group attacking the overloaded node. It takes extra damage and cannot be repaired until the pulse ends.',
    nodes: [node('brain-motor', 'Motor Cortex', -11, -6), node('brain-sensory', 'Sensory Cortex', 11, -6)],
    entry: [0, 14],
    inlets: [[[-18, -25], [-23, -7], [-17, 21]], [[18, -25], [23, -7], [17, 21]]],
    hazard: {
      name: 'Neural overload', instruction: 'Prioritize the vulnerable node', effect: 'Takes extra damage. Repairs blocked',
      radius: 5.4, alternateNodes: true, recovery: 5.1, warning: 3.5, active: 4.1,
      repairBlocked: true, tissueDamage: 1.55,
    },
    waves: [
      wave('Signal Breach', .96, ['guard', 'splitter', 'spore', 'bacillus', 'guard', 'virus', 'spore', 'splitter', 'bacillus'], 'LLRLRRLLR'),
      wave('Synaptic Cascade', .78, ['guard', 'spore', 'splitter', 'bacillus', 'virus', 'guard', 'splitter', 'spore', 'bacillus', 'spore', 'virus', 'splitter'], 'RRLRLLRLRLLR'),
      wave('Cortical Siege', .70, ['guard', 'splitter', 'spore', 'guard', 'splitter', 'bacillus', 'virus', 'bacillus', 'splitter', 'spore', 'guard', 'splitter', 'virus', 'spore', 'bacillus'], 'LRRLLRLRLRLRRLL'),
    ],
  },
};
