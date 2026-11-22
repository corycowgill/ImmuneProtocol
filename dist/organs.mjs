import { grow, growPoint } from './arena-scale.mjs';

function node(id, name, x, z) {
  return { id, name, x: grow(x), y: 1.25, z: grow(z) };
}

const CADENCE_STRETCH = 1.25;
const SPECIES_CODES = {
  v: 'virus', b: 'bacillus', s: 'spore', g: 'guard', p: 'splitter',
  h: 'phage', f: 'flagellate', m: 'blister', w: 'filovirus', a: 'amoeba', r: 'rogue', d: 'rogue-bot',
};

// Waves use one letter per pathogen (v virus, b bacillus, s spore, g shellback guard, p splitter,
// h phage, f flagellate, m blister mortar, w filovirus, a amoeba, r rogue cell, d rogue bot) and one
// lane letter per pathogen (L first node, R second node, C third node).
// Keep in step with WAVE_SCALE in simulation.mjs: each authored wave is fielded three times over.
const WAVE_SCALE = 3;

function wave(name, cadence, codes, lanes) {
  // A three-letter lane order (for example 'LCR') expands into surges of three pathogens per node.
  if (lanes.length === 3 && codes.length > 3) lanes = [...codes].map((_, index) => lanes[Math.floor(index / 3) % 3]).join('');
  if (codes.length !== lanes.length) throw new Error('Wave ' + name + ' needs one lane per pathogen');
  codes = codes.repeat(WAVE_SCALE);
  lanes = lanes.repeat(WAVE_SCALE);
  // Enemies walk farther in the enlarged arenas, so the spawn cadence is stretched to match.
  return { name, cadence: cadence * CADENCE_STRETCH, species: [...codes].map(code => SPECIES_CODES[code]), lanes };
}

export const ORGAN_MISSIONS = {
  lungs: {
    name: 'Bronchial Fork',
    briefing: 'Shelter from the exhale. After three waves, reopen both bronchi and hold them through one full breath.',
    nodes: [node('lungs-left', 'Left Alveoli', -17, -12), node('lungs-right', 'Right Alveoli', 17, -12)],
    entry: [0, 26],
    inlets: [[[-26, -40], [-37, -16], [-30, 30]], [[26, -40], [37, -16], [30, 30]]],
    obstacles: [[-30, 8, 3.2], [30, 8, 3.2], [-9, -34, 2.6], [9, -34, 2.6], [-22, -30, 2.6], [22, -30, 2.6], [-18, 24, 2.8], [18, 24, 2.8]],
    hazard: {
      name: 'Exhale', instruction: 'Leave the center airway', effect: 'Airflow pushes you back',
      x: 0, z: -4, width: 14, depth: 74, recovery: 4.2, warning: 3.4, active: 3.4, push: 9,
    },
    waves: [
      wave('Crosswind', 1.12, 'vvsgvsvsvvs', 'LLRLRRLRLRR'),
      wave('Blocked Airway', .92, 'gdvmgvbshbvsvs', 'RRLRLLLRRLLRLR'),
      wave('Hypoxic Surge', .84, 'mgvbshgsbvspvmgvb', 'LLRRLRLLRRLRRLLRL'),
    ],
  },
  stomach: {
    name: 'Gastric Chamber',
    briefing: 'Use the banks during acid surges. Shut the intake and open the drain to reach the final wave.',
    nodes: [node('stomach-wall', 'Gastric Wall', -21, -14), node('stomach-lining', 'Pyloric Lining', 19, 8)],
    entry: [5, 27],
    inlets: [[[-28, -37], [-39, 4], [-14, -51]], [[36, -20], [30, 34], [22, -46]]],
    obstacles: [[-6, 18, 2.8], [10, -28, 3], [-30, -26, 2.8], [30, 26, 2.8], [-10, -38, 2.6], [-28, 24, 2.6]],
    hazard: {
      name: 'Acid rise', instruction: 'Climb out of the basin', effect: 'Acid damages your suit',
      x: 0, z: -6, radius: 11, recovery: 5.8, warning: 3.6, active: 4.6, damage: 9,
    },
    waves: [
      wave('Acid-Tolerant Bloom', 1.02, 'fpsvsgpavsfps', 'RLLRLRRLLRRLR'),
      wave('Gastric Siege', .80, 'pgdapfsgbsvpsgfas', 'LLRLRRRLRLLRLRRLL'),
    ],
  },
  intestines: {
    name: 'Intestinal Bend',
    briefing: 'Move through the villus forest. Use the side channels when a pressure wave sweeps the center passage, and cover three mucosal nodes.',
    nodes: [
      node('intestines-fold', 'Villus Bed', -16, -22),
      node('intestines-lining', 'Mucosal Bank', 18, 14),
      node('intestines-crypt', 'Crypt Hollow', -12, 22),
    ],
    entry: [2, 32],
    inlets: [
      [[-19, -47], [-37, -17], [-8, -53]],
      [[27, 39], [38, 0], [34, -20]],
      [[-19, 47], [-37, 16], [-33, 28]],
    ],
    obstacles: [
      [-30, -36, 4.5], [31, -34, 4], [-33, -2, 4], [34, 26, 3.5], [8, -44, 3.5], [13, -5, 2.6], [-12, 8, 2.6],
    ],
    hazard: {
      name: 'Contraction', instruction: 'Move into a side channel', effect: 'Pressure wave sweeping the center',
      x: 0, z: -52, endZ: 44, width: 20, depth: 8, recovery: 6, warning: 3.8, active: 4.8, damage: 14, push: 5,
    },
    waves: [
      wave('Parasitic Bloom', 1.04, 'pfspbvsvpsfv', 'CLR'),
      wave('Counterflow', 1.02, 'vspfsapsvpgvbsf', 'RLC'),
      wave('Crypt Raid', .84, 'dfpsgavpsvsgpfbsvs', 'CLR'),
      wave('Choke Point', .80, 'gppasfvsbpvsgpfasvpgsv', 'RCL'),
    ],
  },
  colon: {
    name: 'Colonic Reservoir',
    briefing: 'The microbiome is boiling over. Defend three absorptive nodes while haustral squeezes sweep the chamber side to side.',
    nodes: [
      node('colon-fold', 'Haustral Fold', -18, -18),
      node('colon-wall', 'Absorptive Wall', 22, -6),
      node('colon-crypt', 'Crypt Bed', -6, 26),
    ],
    entry: [8, 32],
    inlets: [
      [[-27, -39], [-38, -6], [-8, -53]],
      [[35, -22], [27, -39], [36, 22]],
      [[-30, 36], [10, 53], [-36, 20]],
    ],
    obstacles: [[-12, -2, 3.2], [12, 16, 3], [4, -30, 3.5], [-30, 8, 3], [26, 34, 3], [30, -32, 3], [-19, -37, 3], [-18, 44, 2.8]],
    hazard: {
      name: 'Haustral squeeze', instruction: 'Watch the wall band and step aside', effect: 'Pressure crushes your suit',
      x: -40, endX: 40, z: 0, width: 9, depth: 120, recovery: 6.4, warning: 3.6, active: 5.2, damage: 10, pushX: 5,
    },
    waves: [
      wave('Fermentation', 1.04, 'vhsvbsfpvsvhs', 'LCR'),
      wave('Biofilm Breach', .90, 'apdfgvbsppvshbsv', 'RCL'),
      wave('Gas Pocket', .82, 'sspfgsapsvshgpsbvs', 'CRL'),
      wave('Overgrowth', .72, 'gpasfpgbshpsgafpsvgsphb', 'LRC'),
    ],
  },
  lymph: {
    name: 'Lymph Node',
    briefing: 'A patrolling macrophage digests every pathogen it touches and will crush your suit too. Lure infections into its path while you hold three immune nodes.',
    nodes: [
      node('lymph-germinal', 'Germinal Center', -20, -12),
      node('lymph-paracortex', 'Paracortex', 20, -12),
      node('lymph-sinus', 'Afferent Sinus', 0, 28),
    ],
    entry: [0, 12],
    inlets: [
      [[-31, -31], [-39, -4], [-13, -51]],
      [[31, -31], [39, -4], [13, -51]],
      [[-23, 44], [23, 44], [0, 54]],
    ],
    obstacles: [[-10, -4, 2.2], [10, -4, 2.2], [-31, 22, 2.6], [31, 22, 2.6], [0, -40, 3], [-24, -36, 2.6], [24, -36, 2.6], [-12, 42, 2.4], [12, 42, 2.4]],
    hazard: {
      name: 'Macrophage sweep', instruction: 'Lure pathogens into its path', effect: 'Engulfs pathogens and crushes suits',
      radius: 7.5, recovery: 5.4, warning: 3.4, active: 4.8, damage: 12, engulf: 70,
      patrol: [[0, -26, 'Medulla'], [-24, 10, 'West sinus'], [24, 10, 'East sinus'], [0, 4, 'Hilum']],
    },
    waves: [
      wave('Antigen Drift', 1.02, 'vsvbhsvvsrvvs', 'RLC'),
      wave('Opsonized Swarm', .88, 'gdvprhsgvsvpws', 'CLR'),
      wave('Cytokine Storm', .80, 'psghsrvpsgvswphs', 'RLC'),
      wave('Sepsis Front', .76, 'gprsvspswhgspvrshvps', 'CRL'),
    ],
  },
  ear: {
    name: 'Inner Ear',
    briefing: 'Set your turret beyond the resonance rings. Pulses slow you and jam turrets inside, and they rotate between three nodes.',
    nodes: [
      node('ear-cochlea', 'Cochlear Wall', -17, -16),
      node('ear-vestibule', 'Vestibular Node', 18, 0),
      node('ear-saccule', 'Saccule', -12, 26),
    ],
    entry: [6, 18],
    inlets: [
      [[-26, -40], [-38, -6], [-10, -53]],
      [[32, 30], [37, -17], [25, -42]],
      [[-33, 29], [-17, 48], [8, 52]],
    ],
    obstacles: [[0, -8, 3], [-30, 10, 2.6], [24, 24, 2.6], [22, -26, 2.6], [-30, -32, 2.6], [8, 40, 2.8], [-2, 14, 2.4]],
    hazard: {
      name: 'Resonance', instruction: 'Keep your turret outside the ring', effect: 'Slows suit movement and jams turrets',
      radius: 9, alternateNodes: true, recovery: 5.2, warning: 3.5, active: 4, slow: .58,
    },
    waves: [
      wave('Harmonic Swarm', .92, 'ssgpvsmgvsvs', 'RLC'),
      wave('Feedback', .80, 'gpdsgpbfspbsvm', 'LRC'),
      wave('Standing Wave', .78, 'gpmbsfpvbspmsvwspsf', 'LCR'),
    ],
  },
  brain: {
    name: 'Neural Cortex',
    briefing: 'Intercept the group attacking the overloaded node. It takes extra damage and cannot be repaired until the pulse ends.',
    nodes: [node('brain-motor', 'Motor Cortex', -18, -6), node('brain-sensory', 'Sensory Cortex', 18, -6)],
    entry: [0, 26],
    inlets: [[[-28, -37], [-39, -8], [-30, 34]], [[28, -37], [39, -8], [30, 34]]],
    obstacles: [[-30, 18, 2.8], [30, 18, 2.8], [0, 10, 2.4], [-16, -30, 2.6], [16, -30, 2.6], [-16, 38, 2.6], [16, 38, 2.6]],
    hazard: {
      name: 'Neural overload', instruction: 'Prioritize the vulnerable node', effect: 'Takes extra damage. Repairs blocked',
      radius: 6.5, alternateNodes: true, recovery: 5.1, warning: 3.5, active: 4.1,
      repairBlocked: true, tissueDamage: 1.55,
    },
    waves: [
      wave('Signal Breach', .94, 'gpdagvsprvsvs', 'LLRLRRLLRRLRL'),
      wave('Synaptic Cascade', .86, 'gspavspmrsvpfsga', 'RRLRLLRLRLLRRLRL'),
      { name: 'Mega Virus', boss: true, species: [] },
    ],
  },
};

// The tables above are written at the authored size; everything positional grows with the arena.
// Obstacles keep their own size, and so do hazards that follow a node or a patrol rather than
// sitting in the anatomy.
for (const mission of Object.values(ORGAN_MISSIONS)) {
  mission.entry = growPoint(mission.entry);
  mission.inlets = mission.inlets.map(route => route.map(growPoint));
  mission.obstacles = mission.obstacles.map(growPoint);
  const { hazard } = mission;
  // A sweeping band reaches further but is no thicker than it was.
  const thin = hazard.endX !== undefined ? 'width' : hazard.endZ !== undefined ? 'depth' : null;
  for (const key of ['x', 'z', 'endX', 'endZ', 'width', 'depth']) {
    if (hazard[key] !== undefined && key !== thin) hazard[key] = grow(hazard[key]);
  }
  if (hazard.radius !== undefined && hazard.x !== undefined) hazard.radius = grow(hazard.radius);
  if (hazard.patrol) hazard.patrol = hazard.patrol.map(growPoint);
  // A sweeping band has further to travel, so it takes proportionally longer and moves no faster.
  if (hazard.endX !== undefined || hazard.endZ !== undefined) hazard.active = grow(hazard.active);
}
