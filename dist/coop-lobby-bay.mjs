import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { createTeammate } from './teammate.mjs';

// Live 3D co-op lobby: the squad stands on the twin reduction pads of the miniaturization
// machine in a futuristic hospital lab, wearing their chosen suits. The machine powers up
// as players ready: a ready pad's beam brightens, and with everyone ready the emitter ring
// overhead spins up and charges. Around the machine: a holographic patient with the
// injection site marked, the glass injection capsule the squad is loaded into, operator
// consoles with live readouts, and the lab itself.
// The camera looks at the suits' fronts, so +x is screen left.
const SLOTS = [1.0, -1.0];
const TEAL = 0x5ff3e0;
const GREEN = 0x75f1b4;
const AMBER = 0xffc06a;

function radialMask() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function canvasTexture(width, height, draw, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

// Polished clinical floor tiles with a hairline seam.
function floorTexture() {
  return canvasTexture(256, 256, (c, w) => {
    c.fillStyle = '#d9dfe2';
    c.fillRect(0, 0, w, w);
    const gradient = c.createLinearGradient(0, 0, w, w);
    gradient.addColorStop(0, '#ffffff22');
    gradient.addColorStop(1, '#00000014');
    c.fillStyle = gradient;
    c.fillRect(0, 0, w, w);
    c.strokeStyle = '#9aa6ad';
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, w - 3, w - 3);
  }, [14, 14]);
}

// Wall panels with seams, vents and a status stripe.
function wallTexture() {
  return canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#c9d2d6';
    c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 128) {
      const shade = c.createLinearGradient(x, 0, x + 128, 0);
      shade.addColorStop(0, '#ffffff30');
      shade.addColorStop(.5, '#ffffff00');
      shade.addColorStop(1, '#00000012');
      c.fillStyle = shade;
      c.fillRect(x, 0, 128, h);
      c.fillStyle = '#8e9aa1';
      c.fillRect(x, 0, 3, h);
    }
    c.fillStyle = '#8e9aa1';
    c.fillRect(0, h * .62, w, 3);
    c.fillStyle = '#5ff3e0';
    c.fillRect(0, h * .62 + 8, w, 4);
    for (let x = 20; x < w; x += 128) {
      for (let i = 0; i < 6; i++) {
        c.fillStyle = '#7d8a91';
        c.fillRect(x + 20, h * .78 + i * 7, 60, 3);
      }
    }
  }, [6, 1]);
}

function signTexture() {
  return canvasTexture(1024, 160, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#16323a';
    c.font = '800 74px "Barlow Condensed", "Arial Narrow", Impact, sans-serif';
    c.textBaseline = 'middle';
    c.fillText('MINIATURIZATION LAB  ·  M-01', 24, 62);
    c.font = '500 26px "IBM Plex Mono", monospace';
    c.fillStyle = '#2f6f75';
    c.fillText('IMMUNE PROTOCOL  ·  ST. CORPUSCLE GENERAL HOSPITAL  ·  RESTRICTED', 26, 124);
  });
}

// Hospital corridor glimpsed through the observation window.
function windowTexture() {
  return canvasTexture(512, 192, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0d2430');
    sky.addColorStop(1, '#16404a');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = '#9ff7ff' + (i % 2 ? '55' : '33');
      c.fillRect(20 + i * 56, 18, 34, 6);
    }
    c.fillStyle = '#0a1b22';
    for (let i = 0; i < 6; i++) c.fillRect(30 + i * 84, 70, 46, 122);
    c.fillStyle = '#5ff3e044';
    c.fillRect(0, h - 26, w, 3);
  });
}

// A live operator screen; draw(context, width, height, time) repaints it.
function liveScreen(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, update: time => { draw(context, 512, 320, time); texture.needsUpdate = true; } };
}

function screenFrame(c, w, h, title) {
  c.fillStyle = '#04141a';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = '#5ff3e066';
  c.lineWidth = 2;
  c.strokeRect(8, 8, w - 16, h - 16);
  c.fillStyle = '#5ff3e0';
  c.font = '600 22px "IBM Plex Mono", monospace';
  c.fillText(title, 24, 42);
}

export function createLobbyBay(canvas, softMask = radialMask()) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Image-based lighting so the suits' metal and glass, and the lab's ceramics, reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  pmrem.dispose();

  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = .7;
  scene.background = new THREE.Color(0x0b1a20);
  scene.fog = new THREE.Fog(0x0b1a20, 9, 19);
  const camera = new THREE.PerspectiveCamera(36, 2, .1, 40);
  const cameraHome = new THREE.Vector3(0, 1.85, -8.4);
  const lookAt = new THREE.Vector3(0, 1.45, .6);
  camera.position.copy(cameraHome);
  camera.lookAt(lookAt);

  scene.add(new THREE.HemisphereLight(0xe6fbff, 0x1d2a2e, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-2.5, 6, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -2, near: 1, far: 16 });
  key.shadow.bias = -.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fe9ff, 2.4);
  rim.position.set(3, 3, 4);
  scene.add(rim);
  const backRim = new THREE.DirectionalLight(0xbfe4ff, 1.8);
  backRim.position.set(-3, 2.6, 4);
  scene.add(backRim);
  const machineGlow = new THREE.PointLight(TEAL, 10, 7, 1.6);
  machineGlow.position.set(0, 2.9, .2);
  scene.add(machineGlow);

  const material = (color, options = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: .35, metalness: .1, ...options });
  const ceramic = material(0xe9eef0, { roughness: .28, clearcoat: .6, clearcoatRoughness: .2 });
  const graphite = material(0x2b3236, { roughness: .4, metalness: .7 });
  const chrome = material(0xc9d2d6, { roughness: .18, metalness: 1 });
  const glow = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const add = (geometry, mat, position, rotation, parent = scene) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // The room: tiled floor, panelled walls, an observation window, signage and light strips.
  const floor = add(new THREE.PlaneGeometry(30, 30), new THREE.MeshPhysicalMaterial({
    map: floorTexture(), roughness: .22, metalness: .05, clearcoat: .8, clearcoatRoughness: .12,
  }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
  floor.castShadow = false;
  const walls = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: .55, metalness: .05 });
  add(new THREE.PlaneGeometry(18, 7), walls, [0, 3.5, 5.2], [0, Math.PI, 0]);
  for (const side of [-1, 1]) {
    add(new THREE.PlaneGeometry(14, 7), walls, [side * 7, 3.5, 0], [0, -side * Math.PI / 2, 0]);
    add(new THREE.BoxGeometry(.06, .06, 12), glow(TEAL), [side * 6.9, 2.4, -.5]);
  }
  add(new THREE.PlaneGeometry(6.4, 2.2), new THREE.MeshBasicMaterial({ map: windowTexture() }), [0, 3.4, 5.15], [0, Math.PI, 0]);
  add(new THREE.BoxGeometry(6.6, .12, .12), graphite, [0, 2.24, 5.1]);
  add(new THREE.BoxGeometry(6.6, .12, .12), graphite, [0, 4.56, 5.1]);
  // Beside the window, clear of the machine and of the lobby's own heading.
  const sign = add(new THREE.PlaneGeometry(3.2, .5), new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true }),
    [-5, 3.9, 5.12], [0, Math.PI, 0]);
  sign.castShadow = false;
  for (const x of [-4.5, -1.5, 1.5, 4.5]) add(new THREE.BoxGeometry(2, .04, .5), glow(0xeafcff), [x, 6.9, 1]);

  // The reduction platform: a ceramic dais with glowing channels and the two pads.
  add(new THREE.CylinderGeometry(2.45, 2.6, .16, 72), ceramic, [0, .08, 0]);
  add(new THREE.CylinderGeometry(2.2, 2.3, .06, 72), graphite, [0, .19, 0]);
  const channels = [1.55, 2.05].map(radius => add(new THREE.TorusGeometry(radius, .018, 8, 96), glow(TEAL),
    [0, .225, 0], [Math.PI / 2, 0, 0]));
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(.6, .12, 1.1), ceramic, [side * 2.9, .06, -1.6], [0, side * .4, 0]);

  // The gantry: an arch framing the squad, an emitter ring overhead and the lens.
  const arch = add(new THREE.TorusGeometry(2.25, .14, 18, 96, Math.PI), ceramic, [0, .22, .7]);
  add(new THREE.TorusGeometry(2.25, .045, 8, 96, Math.PI), glow(TEAL), [0, .22, .58]);
  for (let i = 1; i < 8; i++) {
    const angle = i / 8 * Math.PI;
    add(new THREE.BoxGeometry(.26, .14, .3), graphite, [Math.cos(angle) * 2.25, .22 + Math.sin(angle) * 2.25, .7], [0, 0, angle]);
  }
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(.5, .36, .6), graphite, [side * 2.25, .3, .7]);
  arch.castShadow = true;
  const emitter = new THREE.Group();
  emitter.position.set(0, 2.85, 0);
  scene.add(emitter);
  add(new THREE.TorusGeometry(1.45, .07, 12, 96), chrome, [0, 0, 0], [Math.PI / 2, 0, 0], emitter);
  const nodes = [];
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const nodeMaterial = glow(TEAL);
    nodes.push(nodeMaterial);
    add(new THREE.SphereGeometry(.09, 16, 12), nodeMaterial, [Math.cos(angle) * 1.45, -.05, Math.sin(angle) * 1.45], null, emitter);
  }
  add(new THREE.CylinderGeometry(.42, .55, .3, 48), graphite, [0, 3.05, 0]);
  const lensMaterial = glow(TEAL);
  add(new THREE.CircleGeometry(.4, 48), lensMaterial, [0, 2.89, 0], [Math.PI / 2, 0, 0]);
  // Hung from four angled cables so the centre of the back wall stays clear.
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    const from = new THREE.Vector3(Math.cos(angle) * 1.45, 2.9, Math.sin(angle) * 1.45);
    const to = new THREE.Vector3(Math.cos(angle) * 2.6, 7, Math.sin(angle) * 2.6);
    const cable = add(new THREE.CylinderGeometry(.025, .025, from.distanceTo(to), 8), graphite, [0, 0, 0]);
    cable.position.copy(from).lerp(to, .5);
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  }

  // Coolant lines from the dais out to the walls.
  const coolant = new THREE.MeshStandardMaterial({ color: 0x1e5a63, roughness: .3, metalness: .4, emissive: 0x0d3a40, emissiveIntensity: .8 });
  for (const side of [-1, 1]) {
    for (const lift of [0, .22]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 2.3, .2 + lift, .9), new THREE.Vector3(side * 3.6, .12 + lift, 2.2),
        new THREE.Vector3(side * 5.2, .5 + lift, 3.4), new THREE.Vector3(side * 6.9, 1.2 + lift, 3.6),
      ]);
      add(new THREE.TubeGeometry(curve, 48, .07, 12), coolant, [0, 0, 0]);
    }
  }

  // Holographic patient on a projector, injection site marked (screen right).
  const projector = new THREE.Group();
  projector.position.set(-3.3, 0, 2.7);
  scene.add(projector);
  add(new THREE.CylinderGeometry(.55, .65, .5, 48), graphite, [0, .25, 0], null, projector);
  add(new THREE.CircleGeometry(.48, 48), glow(TEAL), [0, .51, 0], [-Math.PI / 2, 0, 0], projector);
  const holoMaterial = new THREE.MeshBasicMaterial({ color: 0x7ff7ff, wireframe: true, transparent: true, opacity: .55, toneMapped: false, depthWrite: false });
  const holoShell = new THREE.MeshBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: .1, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const patient = new THREE.Group();
  patient.position.y = .62;
  projector.add(patient);
  const limb = (radius, length, position, rotation) => {
    for (const mat of [holoMaterial, holoShell]) {
      const part = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat);
      part.position.set(...position);
      if (rotation) part.rotation.set(...rotation);
      patient.add(part);
    }
  };
  limb(.13, .02, [0, 1.62, 0]);
  limb(.2, .5, [0, 1.12, 0]);
  limb(.17, .2, [0, .74, 0]);
  for (const side of [-1, 1]) {
    limb(.065, .55, [side * .3, 1.08, 0], [0, 0, side * .18]);
    limb(.08, .62, [side * .11, .32, 0]);
  }
  const target = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 12), glow(0xff5a4a));
  target.position.set(.06, 1.2, -.12);
  patient.add(target);
  const targetRing = new THREE.Mesh(new THREE.TorusGeometry(.1, .008, 8, 32), glow(0xff5a4a));
  targetRing.position.copy(target.position);
  patient.add(targetRing);
  const holoCone = add(new THREE.CylinderGeometry(.55, .45, 1.9, 40, 1, true), new THREE.MeshBasicMaterial({
    color: TEAL, transparent: true, opacity: .05, side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }), [0, 1.45, 0], null, projector);
  holoCone.castShadow = false;

  // The injection capsule the shrunken squad is loaded into (screen left).
  const capsule = new THREE.Group();
  capsule.position.set(3.4, 0, 2.7);
  scene.add(capsule);
  add(new THREE.CylinderGeometry(.6, .7, .35, 48), graphite, [0, .17, 0], null, capsule);
  add(new THREE.CylinderGeometry(.6, .6, .3, 48), graphite, [0, 2.65, 0], null, capsule);
  const fluid = add(new THREE.CylinderGeometry(.42, .42, 1.6, 40), new THREE.MeshPhysicalMaterial({
    color: 0x2ff0c8, emissive: 0x16a98c, emissiveIntensity: .9, transmission: .3, roughness: .1, transparent: true, opacity: .75,
  }), [0, 1.2, 0], null, capsule);
  fluid.castShadow = false;
  const glass = add(new THREE.CylinderGeometry(.5, .5, 2.15, 48, 1, true), new THREE.MeshPhysicalMaterial({
    color: 0xdffaff, roughness: .05, metalness: 0, transmission: .9, transparent: true, opacity: .28, side: THREE.DoubleSide,
  }), [0, 1.42, 0], null, capsule);
  glass.castShadow = false;
  for (const y of [.5, 1.42, 2.34]) add(new THREE.TorusGeometry(.51, .025, 8, 48), chrome, [0, y, 0], [Math.PI / 2, 0, 0], capsule);
  add(new THREE.CylinderGeometry(.06, .06, 1.4, 16), chrome, [0, 3.4, 0], null, capsule);
  const bubbles = [];
  for (let i = 0; i < 18; i++) {
    const bubble = add(new THREE.SphereGeometry(.02 + Math.random() * .025, 8, 6), glow(0xc8fff2),
      [(Math.random() - .5) * .6, .5 + Math.random() * 1.4, (Math.random() - .5) * .6], null, capsule);
    bubble.castShadow = false;
    bubbles.push({ mesh: bubble, speed: .2 + Math.random() * .4 });
  }

  // Operator consoles with live screens.
  const vitals = liveScreen((c, w, h, t) => {
    screenFrame(c, w, h, 'PATIENT VITALS');
    c.strokeStyle = '#75f1b4';
    c.lineWidth = 3;
    c.beginPath();
    for (let x = 24; x < w - 24; x += 3) {
      const phase = (x / 90 - t * 1.4) % 1;
      const p = phase < 0 ? phase + 1 : phase;
      const spike = p > .42 && p < .5 ? Math.sin((p - .42) / .08 * Math.PI) * 70 : p > .5 && p < .54 ? -22 : 0;
      c[x === 24 ? 'moveTo' : 'lineTo'](x, 150 - spike + Math.sin(x * .1) * 2);
    }
    c.stroke();
    c.fillStyle = '#e6fbff';
    c.font = '800 54px "Barlow Condensed", Impact, sans-serif';
    c.fillText(Math.round(72 + Math.sin(t * .7) * 3) + ' BPM', 24, 260);
    c.font = '500 20px "IBM Plex Mono", monospace';
    c.fillStyle = '#ff8a73';
    c.fillText('INFECTION: SPREADING', 250, 252);
    c.fillStyle = '#5ff3e0';
    c.fillText('SpO2 97%   TEMP 38.9 C', 250, 282);
  });
  const scale = liveScreen((c, w, h, t) => {
    screenFrame(c, w, h, 'REDUCTION ARRAY');
    c.fillStyle = '#e6fbff';
    c.font = '800 64px "Barlow Condensed", Impact, sans-serif';
    c.fillText('1 : 1,000,000', 24, 130);
    const charge = scaleState.charge;
    c.fillStyle = '#5ff3e033';
    c.fillRect(24, 170, w - 48, 26);
    c.fillStyle = charge >= .99 ? '#75f1b4' : '#5ff3e0';
    c.fillRect(24, 170, (w - 48) * charge, 26);
    c.font = '500 20px "IBM Plex Mono", monospace';
    c.fillStyle = '#9ff7ff';
    c.fillText('FIELD CHARGE ' + Math.round(charge * 100) + '%', 24, 232);
    c.fillText(scaleState.ready ? 'SQUAD LOCKED  ·  READY TO SHRINK' : 'AWAITING SQUAD', 24, 266);
    c.fillStyle = Math.sin(t * 6) > 0 ? '#ffc06a' : '#ffc06a55';
    c.fillRect(w - 52, 28, 22, 22);
  });
  const scaleState = { charge: 0, ready: false };
  for (const [side, screen] of [[1, scale], [-1, vitals]]) {
    const desk = new THREE.Group();
    desk.position.set(side * 3.5, 0, -1.4);
    desk.rotation.y = side * .55;
    scene.add(desk);
    add(new THREE.BoxGeometry(1.3, .95, .55), ceramic, [0, .48, 0], null, desk);
    add(new THREE.BoxGeometry(1.36, .06, .62), graphite, [0, .98, 0], null, desk);
    const panel = add(new THREE.PlaneGeometry(1.2, .75), new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }),
      [0, 1.42, .05], [-.35, Math.PI, 0], desk);
    panel.castShadow = false;
    add(new THREE.BoxGeometry(1.28, .82, .05), graphite, [0, 1.42, .1], [-.35, 0, 0], desk);
    add(new THREE.CylinderGeometry(.03, .03, .45, 8), graphite, [0, 1.1, .2], [-.35, 0, 0], desk);
  }

  // Motes drifting in the lab air.
  const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
    Array.from({ length: 360 }, (_, i) => (i % 3 === 1 ? Math.random() * 5 : (Math.random() - .5) * (i % 3 ? 8 : 10))), 3)),
  new THREE.PointsMaterial({ color: 0x9ff7ff, size: .025, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(motes);

  const bays = SLOTS.map((x, index) => {
    const pedestal = new THREE.Group();
    pedestal.position.x = x;
    pedestal.position.y = .22;
    scene.add(pedestal);
    const disc = add(new THREE.CylinderGeometry(.5, .56, .08, 48), chrome, [0, .04, 0], null, pedestal);
    disc.castShadow = false;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false });
    const ring = add(new THREE.TorusGeometry(.52, .014, 8, 64), ringMaterial, [0, .085, 0], [Math.PI / 2, 0, 0], pedestal);
    ring.castShadow = false;
    // Soft key spot per pad: models the armour and casts a contact shadow.
    const spot = new THREE.SpotLight(0xffffff, 14, 6, .5, .8, 1.6);
    spot.position.set(-.6, 3.1, -1.6);
    spot.target.position.set(0, .9, 0);
    pedestal.add(spot, spot.target);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.46, .5, 2.6, 40, 1, true), new THREE.MeshBasicMaterial({
      color: TEAL, transparent: true, opacity: .06, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    beam.position.y = 1.35;
    pedestal.add(beam);
    const turntable = new THREE.Group();
    turntable.position.y = .08;
    pedestal.add(turntable);
    const rig = createTeammate(softMask, { marker: false });
    rig.root.traverse(part => { if (part.isMesh) part.castShadow = true; });
    turntable.add(rig.root);
    const actor = {
      id: 'bay-' + index, x: 0, z: 0, yaw: 0, pitch: -.08, name: '', aiming: false,
      downed: false, connected: true, suit: null, weaponLoadout: undefined,
    };
    return { pedestal, ring, ringMaterial, beam, turntable, rig, actor, player: null, spin: index ? -.3 : .3 };
  });

  let frame = 0;
  let last = 0;
  let clock = 0;
  let screenClock = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 1.2 ? 56 : camera.aspect < 1.6 ? 46 : 38;
      camera.updateProjectionMatrix();
    }
  }

  function render(now) {
    frame = requestAnimationFrame(render);
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    resize();
    const still = reduceMotion.matches;
    const present = bays.filter(bay => bay.player);
    const allReady = present.length > 0 && present.every(bay => bay.player.ready && bay.player.connected);
    // The field charges while the squad is ready and drains otherwise.
    scaleState.ready = allReady;
    scaleState.charge = THREE.MathUtils.clamp(scaleState.charge + (allReady ? dt * .35 : -dt * .6), 0, 1);
    const charge = scaleState.charge;
    for (const [index, bay] of bays.entries()) {
      const here = !!bay.player;
      bay.rig.root.visible = here;
      bay.beam.visible = here;
      if (here) {
        if (!still) bay.actor.pitch = -.08 + Math.sin(clock * 1.3 + index * 2.1) * .035;
        bay.rig.update(bay.actor, 0, dt, true);
        bay.rig.root.visible = true;
        if (!still) bay.turntable.rotation.y = Math.sin(clock * .4 + index * 1.7) * .35 + bay.spin;
        const pulse = still ? 0 : Math.sin(clock * 3 + index) * .03;
        bay.beam.material.opacity = (bay.player.ready ? .14 + charge * .16 : .04) + pulse;
      }
      bay.ring.scale.setScalar(here && !still ? 1 + Math.sin(clock * 2 + index) * .02 : 1);
    }
    if (!still) {
      emitter.rotation.y += dt * (.25 + charge * 3.2);
      patient.rotation.y += dt * .35;
      targetRing.scale.setScalar(1 + (clock * 1.5 % 1) * 1.6);
      for (const { mesh, speed } of bubbles) {
        mesh.position.y += dt * speed;
        if (mesh.position.y > 1.95) mesh.position.y = .5;
      }
      motes.rotation.y += dt * .02;
      camera.position.set(cameraHome.x + Math.sin(clock * .12) * .35, cameraHome.y + Math.sin(clock * .17) * .06, cameraHome.z);
      camera.lookAt(lookAt);
    }
    const energy = .5 + charge * .5 + (still ? 0 : Math.sin(clock * (2 + charge * 8)) * .15 * (.3 + charge));
    const tone = new THREE.Color(TEAL).lerp(new THREE.Color(GREEN), charge);
    lensMaterial.color.copy(tone).multiplyScalar(.6 + energy * .8);
    for (const nodeMaterial of nodes) nodeMaterial.color.copy(tone).multiplyScalar(.5 + energy);
    for (const channel of channels) channel.material.color.copy(tone).multiplyScalar(.6 + energy * .6);
    machineGlow.color.copy(tone);
    machineGlow.intensity = 8 + charge * 22;
    screenClock -= dt;
    if (screenClock <= 0) {
      screenClock = .1;
      vitals.update(clock);
      scale.update(clock);
    }
    renderer.render(scene, camera);
  }

  function setPlayers(players, localId) {
    // Keep the local player on the left so your suit is always in the same spot.
    const ordered = [...players].sort((a, b) => Number(b.id === localId) - Number(a.id === localId));
    for (const [index, bay] of bays.entries()) {
      const player = ordered[index] ?? null;
      bay.player = player;
      if (!player) {
        bay.ringMaterial.color.set(0x5a6a6e);
        continue;
      }
      bay.actor.suit = player.suit;
      bay.actor.weaponLoadout = player.weaponLoadout ?? undefined;
      bay.actor.name = player.name;
      bay.ringMaterial.color.set(!player.connected ? 0x8a6a5a : player.ready ? GREEN : AMBER);
    }
    return ordered;
  }

  // Renders a single suit to an image for the suit picker cards.
  function portrait(suit, width = 180, height = 240) {
    const target = new THREE.WebGLRenderTarget(width, height, {
      colorSpace: THREE.SRGBColorSpace, samples: Math.min(4, renderer.capabilities.maxSamples),
    });
    const studio = new THREE.Scene();
    studio.environment = environment;
    studio.environmentIntensity = .6;
    studio.add(new THREE.HemisphereLight(0xe6fbff, 0x1a2426, 1.3));
    const front = new THREE.DirectionalLight(0xffffff, 2.8);
    front.position.set(-2, 3, -4);
    studio.add(front);
    const back = new THREE.DirectionalLight(0x7fe9ff, 2.6);
    back.position.set(3, 2.5, 3);
    studio.add(back);
    const rig = createTeammate(softMask, { marker: false });
    rig.root.rotation.y = .5;
    studio.add(rig.root);
    rig.update({ id: 'portrait-' + suit, x: 0, z: 0, yaw: .5, pitch: -.1, suit, connected: true }, 0, 0, true);
    const lens = new THREE.PerspectiveCamera(26, width / height, .1, 20);
    lens.position.set(0, 1.15, -4.6);
    lens.lookAt(0, .95, 0);
    const bytes = new Uint8Array(width * height * 4);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(studio, lens);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes);
    renderer.setRenderTarget(previous);
    target.dispose();
    const image = document.createElement('canvas');
    image.width = width;
    image.height = height;
    const context = image.getContext('2d');
    const pixels = context.createImageData(width, height);
    const stride = width * 4;
    for (let row = 0; row < height; row++) {
      pixels.data.set(bytes.subarray((height - 1 - row) * stride, (height - row) * stride), row * stride);
    }
    context.putImageData(pixels, 0, 0);
    return image.toDataURL('image/png');
  }

  return {
    setPlayers,
    portrait,
    start() {
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(render);
      }
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
