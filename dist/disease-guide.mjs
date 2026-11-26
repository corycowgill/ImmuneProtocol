import * as THREE from './vendor/three.module.js';
import { publishUiFrame, uiViewport } from './ui-media.mjs';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { ENEMY_MODELS, animatePathogen, loadEnemyModel, pathogenMotion } from './enemy-models.mjs';
import { SPECIES, speciesHabitats } from './simulation.mjs';
import { MicroscopeBackdrop } from './microscope-view.mjs';

// The main menu's disease guide: every pathogen's scanned model (animated, drag to
// turn), its field description, live stats from the simulation, where it attacks,
// and some facts. Portraits are Cycles renders from tools/enemies/process.py.
export const PATHOGENS = [
  {
    type: 'rogue-bot', name: 'Rogue Bot', family: 'Compromised medical nanodrone', inspiration: 'Surgical robotics (fictional)',
    description: 'An NMD-07 medical drone hijacked inside the host. Sterile ceramic armor, surgical manipulators and magnetic stabilizers now carry a mini laser cannon aimed exclusively at the human response team.',
    tactics: 'The red aiming line locks before it fires. Step out of that line or break it with solid cover, then attack during its cooldown. It never attacks tissue.',
    facts: [
      'Its telemetry still reports a successful treatment. The hacked target list is the problem.',
      'The surgical laser was meant for precise repairs. Its new operator has terrible bedside manner.',
      'The white armor and medical markings are a reminder: this machine used to be on your side.',
    ],
  },
  {
    type: 'crawler', name: 'Crawler', family: 'Compromised surgical nanodrone', inspiration: 'Robotic spiders (fictional)',
    description: 'An NMD-11 surgical crawler from the same hijacked fleet as the Rogue Bot. Eight jointed titanium legs carry its ceramic body across the floor at a sprint, and a short surgical laser sits under a cluster of red camera eyes.',
    tactics: 'It runs in close and circles before it fires. Its red aiming line is brief and short, so keep your distance or step across the line, and shoot it while it recovers. Like the Rogue Bot, it ignores tissue and hunts suits.',
    facts: [
      'It was built to walk the inside of an artery and stitch tears. Now it stitches nothing.',
      'Eight legs means it never stumbles over a clot. It goes around, fast.',
      'Its laser reaches only a few metres. Distance is the safest armour you have.',
    ],
  },
  {
    type: 'virus', name: 'Crown Virus', family: 'Enveloped RNA virus', inspiration: 'Coronavirus',
    description: 'The rank and file of every infection. A fatty envelope studded with red spike proteins that it uses like grappling hooks to dock with cells, and with you.',
    tactics: 'Coils before it lunges at a fixed landing point. Step sideways during the windup and it sails past.',
    facts: [
      'Corona is Latin for crown. Early microscopists thought the spikes looked like the halo around the sun.',
      'About 700 of them side by side would just about cross the width of a human hair.',
      'It has no brain, no metabolism and no plan, and it still shows up to every gathering.',
    ],
  },
  {
    type: 'spore', name: 'Spitting Spore', family: 'Fungal sporangium', inspiration: 'Spore-launching fungi',
    description: 'A pulsing gel dome that hangs back on a skirt of red hooks and lobs pressurized spore droplets from range.',
    tactics: 'Swells before it spits a slow projectile. Strafe out of the line of fire, then close the distance: it is fragile.',
    facts: [
      'Real spore-shooting fungi such as Pilobolus launch their payload with accelerations of thousands of g.',
      'Fungi are more closely related to you than to plants. This is technically a family reunion.',
      'It keeps its distance on purpose. Even pathogens have boundaries.',
    ],
  },
  {
    type: 'bacillus', name: 'Bacillus', family: 'Rod-shaped bacterium', inspiration: 'Bacillus and E. coli',
    description: 'A glossy yellow rod bristling with pili. It ignores your suit, latches straight onto tissue, and tears.',
    tactics: 'Heads for a tissue node, braces, then tears. Knock it off before the gash opens, then repair.',
    facts: [
      'Bacillus is Latin for little stick. Microbiologists are not great at names.',
      'In ideal conditions some bacteria divide every 20 minutes. One becomes a billion in about ten hours.',
      'Those hairs are pili: microscopic grappling hooks for holding on to you.',
    ],
  },
  {
    type: 'splitter', name: 'Splitter', family: 'Budding virus', inspiration: 'Viral budding and binary fission',
    description: 'A violet, spiked virion already pinching down the middle. Kill it and the halves keep coming.',
    tactics: 'Breaks into two fast fragments on death. Keep the area in your sights after the first kill.',
    facts: [
      'The seam down its middle is where it divides. You can watch it thinking about it.',
      'Binary fission is the only family argument where both sides win.',
      'Its fragments are smaller, faster and somehow angrier.',
    ],
  },
  {
    type: 'guard', name: 'Shellback', family: 'Non-enveloped DNA virus', inspiration: 'Adenovirus',
    description: 'A teal protein capsid of tightly packed tiles, with fiber antennae at each corner, pushing an armored shield ahead of it.',
    tactics: 'Its front blocks your shots, rockets aside. Flank it and hit the exposed side or rear.',
    facts: [
      'Its shell is an icosahedron: 20 faces, the same shape as a D20. Roll for initiative.',
      'With no fatty envelope, viruses like this shrug off soap and sanitizer better than most.',
      'The real thing causes colds and pink eye. This one causes deployment reports.',
    ],
  },
  {
    type: 'colony', name: 'Valve Colony', family: 'Fungal biofilm', inspiration: 'Fungal endocarditis',
    description: 'A fruiting mushroom of green spore bulbs rooted into the heart valve by a mat of hyphae. It does not move. It does not need to.',
    tactics: 'Shoot it through the valve while the leaflets are open. Use the closed windows to repair.',
    facts: [
      'The largest known organism on Earth is a honey fungus in Oregon covering nearly 10 square kilometers.',
      'Biofilms are microbial cities, complete with walls, plumbing and waste management.',
      'Its root mat is mycelium: the same stuff that holds a forest floor together.',
    ],
  },
  {
    type: 'phage', name: 'Phage Lander', family: 'Bacteriophage', inspiration: 'T4 bacteriophage',
    description: 'A many-faceted head on a contractile tail and six spindly legs. It touches down like a lunar module and injects its payload.',
    tactics: 'A lighter, quicker lunger. It goes down fast, but it rarely comes alone.',
    facts: [
      'Phages are the most numerous biological entities on Earth: roughly 10³¹ of them.',
      'Its tail is a spring-loaded syringe. It does not knock.',
      'Your Phage Launcher is named after its well-behaved cousins. This one did not get the memo.',
    ],
  },
  {
    type: 'flagellate', name: 'Whiptail', family: 'Flagellated bacterium', inspiration: 'Helicobacter pylori',
    description: 'A dark, amber-spotted rod lashing violet flagella. It thrives where nothing should, like a stomach full of acid.',
    tactics: 'A sturdier lunger that hits harder than a virus. Watch for its coil and dodge.',
    facts: [
      'A scientist drank a culture of H. pylori to prove it causes ulcers. He later shared a Nobel Prize.',
      'Bacterial flagella spin on rotary motors, some faster than 100,000 rpm.',
      'It burrows into stomach mucus, which is the least glamorous real estate in the body.',
    ],
  },
  {
    type: 'blister', name: 'Blister Mortar', family: 'Mucoid slime mold', inspiration: 'Slime molds',
    description: 'A mottled sphere sprouting tendrils tipped with swollen red blisters. It pops them at you from range.',
    tactics: 'Spits like a spore but takes more punishment. Sidestep the windup and focus it down.',
    facts: [
      'Each tendril tip is a pressurized sac. Think water balloon, but nobody is laughing.',
      'Slime molds can solve mazes, and one rebuilt a map of the Tokyo rail network out of oat flakes.',
      'It has no brain and still makes better tactical decisions than most recruits.',
    ],
  },
  {
    type: 'filovirus', name: 'Filovirus', family: 'Filamentous RNA virus', inspiration: 'Ebola and Marburg viruses',
    description: 'A long, coiling crimson thread beaded with yellow glycoproteins. It wraps itself around tissue and squeezes.',
    tactics: 'Latches onto tissue like a bacillus and tears a little faster. Prioritize it at the nodes.',
    facts: [
      'Filum is Latin for thread. Up to 14 micrometers long, these are some of the longest viruses known.',
      'Under the microscope filoviruses curl into shepherd\'s crooks, loops and the occasional number 6.',
      'It is basically spaghetti with a criminal record.',
    ],
  },
  {
    type: 'amoeba', name: 'Amoeba', family: 'Free-living protist', inspiration: 'Naegleria fowleri',
    description: 'A glossy lavender blob that flows on false feet. Slow, soft-looking and very hard to put down.',
    tactics: 'The tankiest latcher. Start shooting early, before it reaches a node.',
    facts: [
      'Amoebas move by sloshing their insides into false feet called pseudopodia.',
      'Naegleria fowleri is nicknamed the brain-eating amoeba, which is why this one stalks the Neural Cortex.',
      'Some amoebas carry far more DNA than you do, and do much less with it.',
    ],
  },
  {
    type: 'rogue', name: 'Rogue Cell', family: 'Malignant body cell', inspiration: 'Metastatic cancer cell',
    description: 'A lumpy red mass trailing invasive filaments. Unlike everything else in this guide, it used to be on your side.',
    tactics: 'A hard-hitting latcher that tears tissue quickly. Intercept it before it digs in.',
    facts: [
      'Technically, the Rogue Cell is you. Awkward.',
      'Its filaments are invadopodia: little feet built for breaking into tissue.',
      'Cancer spreads through the lymphatic system, which is why it haunts the Lymph Node.',
    ],
  },
];

const BEHAVIORS = {
  virus: 'Lunger · attacks suits and tissue',
  bacillus: 'Latcher · tears tissue',
  spore: 'Ranged · spits projectiles',
  laser: 'Laser drone · attacks human players only',
};
const SPECIALS = {
  guard: 'Armored front blocks shots',
  splitter: 'Splits in two on death',
  colony: 'Stationary · fight through the valve',
};
const STATS = [
  ['health', 'Health', 160],
  ['speed', 'Speed', 3.6],
  ['suitDamage', 'Suit damage', 14],
  ['tissueDamage', 'Tissue damage', 12],
  ['score', 'Score', 300],
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A soft cool disc of light on the stage under the specimen, so it stands on something.
function floorGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(190,240,255,.85)');
  gradient.addColorStop(.35, 'rgba(120,205,240,.45)');
  gradient.addColorStop(.75, 'rgba(80,170,220,.12)');
  gradient.addColorStop(1, 'rgba(80,170,220,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = -1;
  return disc;
}

// A small turntable scene that shows one animated pathogen at a time, as a specimen in a petri
// dish under the microscope (microscope-view.mjs).
class PathogenViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = .55;
    this.camera = new THREE.PerspectiveCamera(32, 1, .1, 50);
    // A little above the stage, so the glow disc under the specimen reads as a floor.
    this.camera.position.set(0, 1.3, 5.05);
    this.camera.lookAt(0, 0, 0);
    const key = new THREE.DirectionalLight(0xffe6cc, 2.6);
    key.position.set(3, 4, 4);
    // Cool rim lights from behind cut the silhouette out of the warm agar.
    const rim = new THREE.DirectionalLight(0x8fd6ff, 3.2);
    rim.position.set(-2.5, 2, -4);
    const rimRight = new THREE.DirectionalLight(0x7cc4ff, 1.8);
    rimRight.position.set(3, .6, -3.5);
    const fill = new THREE.HemisphereLight(0x9cc4ff, 0x3a1d22, .7);
    this.scene.add(key, rim, rimRight, fill);
    this.backdrop = new MicroscopeBackdrop(this.scene);
    this.floorGlow = floorGlow();
    this.scene.add(this.floorGlow);
    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    this.yaw = .5;
    this.pitch = .12;
    this.spin = .35;
    this.clench = 0;
    this.provoked = -1;
    this.last = 0;
    this.frame = this.frame.bind(this);
    this.dragging = null;
    canvas.addEventListener('pointerdown', event => {
      this.dragging = { x: event.clientX, y: event.clientY };
      if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!this.dragging) return;
      this.yaw += (event.clientX - this.dragging.x) * .012;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (event.clientY - this.dragging.y) * .008, -.9, .9);
      this.dragging = { x: event.clientX, y: event.clientY };
    });
    const release = () => { this.dragging = null; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  async show(type) {
    this.type = type;
    this.backdrop.setSpecimen(type, PATHOGENS.find(entry => entry.type === type)?.name ?? type);
    this.needsFit = true;
    const template = await loadEnemyModel(type);
    if (this.type !== type || this.disposed) return;
    this.turntable.clear();
    this.model = null;
    this.motion = null;
    if (!template) return;
    this.model = template.clone();
    // Show every model at the same apparent size, whatever its in-game scale.
    this.model.scale.setScalar(1 / ENEMY_MODELS[type].size);
    this.turntable.add(this.model);
    const bounds = new THREE.Box3().setFromObject(this.model), center = bounds.getCenter(new THREE.Vector3());
    this.model.position.sub(center);
    this.previewBounds = bounds.getSize(new THREE.Vector3());
    // The glow disc sits just under the specimen and spreads a little past its footprint.
    this.floorGlow.position.y = -this.previewBounds.y / 2 - .03;
    this.floorGlow.scale.setScalar(Math.max(this.previewBounds.x, this.previewBounds.z) * 1.25);
    this.needsFit = true;
    this.motion = pathogenMotion(this.model);
  }

  // Coils the model, then flares it, like an attack windup and strike.
  provoke() {
    this.provoked = 0;
  }

  start() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }

  frame(now) {
    if (!this.running || this.disposed) return;
    const dt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.dragging && !reduceMotion) this.yaw += dt * this.spin;
    if (this.provoked >= 0) {
      this.provoked += dt;
      const t = this.provoked;
      this.clench = t < .7 ? t / .7 : t < 1 ? 1 - (t - .7) / .3 * 1.8 : t < 1.6 ? -.8 * (1 - (t - 1) / .6) : 0;
      if (t >= 1.6) this.provoked = -1;
    }
    this.turntable.rotation.set(this.pitch, this.yaw, 0);
    if (!reduceMotion) animatePathogen(this.motion, dt, this.clench);
    const { width, height } = uiViewport(this.canvas);
    if (width && height && (this.needsFit || this.canvas.width !== Math.round(width * this.renderer.getPixelRatio()) ||
        this.canvas.height !== Math.round(height * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      // Fit the actual specimen to its canvas stage, including room for yaw.
      // Flat drones can fill a wide phone stage without shrinking into an icon.
      // The specimen fits inside the round field of view, not the whole canvas: about two thirds
      // of its height, with its widest turn (the footprint's diagonal) still inside the field.
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), halfWidth = halfHeight * Math.min(this.camera.aspect, 1);
      const b = this.previewBounds;
      const distance = b ? Math.max(b.y / (2 * halfHeight * .7), Math.hypot(b.x, b.z) / (2 * halfWidth * .98)) + b.z / 4 : Math.max(5.2, 1.45 / halfWidth);
      this.camera.position.setLength(distance);
      this.camera.updateProjectionMatrix();
      this.needsFit = false;
    }
    this.backdrop.resize(this.canvas.width, this.canvas.height);
    if (!reduceMotion) this.backdrop.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.backdrop.renderOverlay(this.renderer);
    publishUiFrame(this.canvas);
    requestAnimationFrame(this.frame);
  }

  dispose() {
    this.disposed = true;
    this.backdrop.dispose();
    this.floorGlow.geometry.dispose();
    this.floorGlow.material.map.dispose();
    this.floorGlow.material.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

// Wires up the guide dialog. missionName maps an area id to its display name.
export function createDiseaseGuide(dialog, { missionName, onStudy }) {
  const list = dialog.querySelector('[data-guide-list]');
  const detail = dialog.querySelector('[data-guide-detail]');
  const canvas = dialog.querySelector('[data-guide-viewer]');
  const habitats = speciesHabitats();
  let viewer = null;
  let selected = PATHOGENS[0].type;

  const cards = PATHOGENS.map(entry => {
    const card = element('button', 'guide-card');
    card.type = 'button';
    card.setAttribute('role', 'tab');
    card.dataset.type = entry.type;
    const portrait = new Image();
    portrait.src = new URL('./assets/enemies/portraits/' + entry.type + '.webp', import.meta.url).href;
    portrait.alt = '';
    portrait.loading = 'lazy';
    portrait.decoding = 'async';
    const label = element('span', 'guide-card-label');
    label.append(element('strong', '', entry.name), element('span', '', entry.family));
    card.append(portrait, label);
    card.addEventListener('click', () => select(entry.type));
    list.append(card);
    return card;
  });

  function render(entry) {
    const spec = SPECIES[entry.type];
    const behavior = spec.behavior ?? entry.type;
    const heading = element('header', 'guide-heading');
    heading.append(
      element('p', 'eyebrow', entry.family + ' · inspired by ' + entry.inspiration),
      element('h3', '', entry.name),
      element('p', 'guide-role', SPECIALS[entry.type] ?? BEHAVIORS[behavior]),
    );
    const stats = element('dl', 'guide-stats');
    for (const [key, name, max] of STATS) {
      if (spec[key] === undefined) continue;
      const row = element('div');
      const meter = element('span', 'guide-meter');
      meter.style.setProperty('--fill', Math.min(1, spec[key] / max).toFixed(3));
      const value = key === 'speed' ? spec[key].toFixed(1) + ' m/s' : String(spec[key]);
      row.append(element('dt', '', name), element('dd', '', value), meter);
      stats.append(row);
    }
    const tactics = element('section', 'guide-section');
    tactics.append(element('h4', '', 'Field notes'), element('p', '', entry.description), element('p', 'guide-tactics', entry.tactics));
    const where = element('section', 'guide-section');
    const places = element('ul', 'guide-places');
    for (const area of habitats[entry.type] ?? []) places.append(element('li', '', missionName(area)));
    where.append(element('h4', '', 'Encountered in'), places);
    const facts = element('section', 'guide-section');
    const factList = element('ul', 'guide-facts');
    for (const fact of entry.facts) factList.append(element('li', '', fact));
    facts.append(element('h4', '', 'Fun facts'), factList);
    detail.replaceChildren(heading, stats, tactics, where, facts);
  }

  function select(type) {
    selected = type;
    const entry = PATHOGENS.find(item => item.type === type);
    for (const card of cards) card.setAttribute('aria-selected', String(card.dataset.type === type));
    render(entry);
    detail.scrollTop = 0;
    viewer?.show(type);
    onStudy?.(type);
  }

  dialog.querySelector('[data-guide-provoke]').addEventListener('click', () => viewer?.provoke());
  dialog.addEventListener('close', () => {
    viewer?.dispose();
    viewer = null;
  });

  return {
    open() {
      if (!viewer) {
        try {
          viewer = new PathogenViewer(canvas);
        } catch (error) {
          console.warn('The disease guide viewer needs WebGL; showing portraits only', error);
        }
      }
      select(selected);
      dialog.showModal();
      viewer?.start();
      cards.find(card => card.dataset.type === selected)?.focus({ preventScroll: true });
    },
  };
}
