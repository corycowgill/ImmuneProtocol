import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { createTeammate } from './teammate.mjs';

// Live 3D co-op lobby: the squad stands on the twin reduction pads of the miniaturization
// machine in a hospital lab, wearing their chosen suits. The lab is modelled in Blender with
// its lighting baked by Cycles (tools/lobby/build_lab.py) and drawn unlit, so it matches the
// scanned suits. Drawn live on top: the squad (lit in real time, with contact shadows and the
// lab as their reflection), the emitter ring's spin and charge, ready beams and pad rings,
// operator screens, the hologram patient and the injection capsule's glass. The machine
// powers up as players ready, and charges when the whole squad is ready.
// The camera looks at the suits' fronts, so +x is screen left.
const SLOTS = [1.0, -1.0];
const TEAL = 0x5ff3e0;
const GREEN = 0x75f1b4;
const AMBER = 0xffc06a;
const PAD_TOP = .3;

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

// A live operator screen; update(time) repaints it.
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

// The baked lab: one node per atlas, each drawn with its baked lighting and no lights of its own.
const LAB_GROUPS = ['shell', 'machine', 'emitter'];
let labLoad = null;
function loadLab() {
  labLoad ??= (async () => {
    const asset = path => new URL('./assets/lobby/' + path, import.meta.url).href;
    const [gltf, ...atlases] = await Promise.all([
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(asset('lab.glb')),
      ...LAB_GROUPS.map(group => new THREE.TextureLoader().loadAsync(asset('lab-' + group + '.webp'))),
    ]);
    const nodes = {};
    LAB_GROUPS.forEach((group, index) => {
      const atlas = atlases[index];
      atlas.flipY = false;
      atlas.colorSpace = THREE.SRGBColorSpace;
      atlas.anisotropy = 8;
      const node = gltf.scene.getObjectByName('lab-' + group);
      node.traverse(part => {
        if (part.isMesh) part.material = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false });
      });
      nodes[group] = node;
    });
    return nodes;
  })().catch(error => {
    console.warn('Could not load the lobby lab', error);
    labLoad = null;
    return null;
  });
  return labLoad;
}

export function createLobbyBay(canvas, softMask = radialMask()) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // A studio reflection until the lab has loaded; then the suits reflect the lab itself.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  const scene = new THREE.Scene();
  scene.environment = studio;
  scene.environmentIntensity = .8;
  scene.background = new THREE.Color(0x0b1a20);
  const camera = new THREE.PerspectiveCamera(38, 2, .1, 40);
  const cameraHome = new THREE.Vector3(0, 1.85, -8.4);
  const lookAt = new THREE.Vector3(0, 1.45, .6);
  camera.position.copy(cameraHome);
  camera.lookAt(lookAt);

  // Lights for the squad only: the lab's materials are unlit. They follow the bake's ceiling
  // panels, the machine's teal glow and the window.
  scene.add(new THREE.HemisphereLight(0xe6f4f6, 0x2a3236, 1.1));
  const key = new THREE.DirectionalLight(0xf4fbff, 2.4);
  key.position.set(-1.5, 7, -3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fe9ff, 2.2);
  rim.position.set(3, 3.5, 5);
  scene.add(rim);
  const backRim = new THREE.DirectionalLight(0xd8f0ff, 1.6);
  backRim.position.set(-3, 3, 5);
  scene.add(backRim);
  const machineGlow = new THREE.PointLight(TEAL, 8, 6, 1.6);
  machineGlow.position.set(0, 2.6, .2);
  scene.add(machineGlow);

  const lab = new THREE.Group();
  scene.add(lab);
  const emitter = new THREE.Group();
  scene.add(emitter);
  const glow = color => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const add = (geometry, material, position, rotation, parent = scene) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  };

  // Charge glow over the baked emitter, lens and floor channels.
  const nodeMaterial = glow(TEAL);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    add(new THREE.SphereGeometry(.11, 16, 12), nodeMaterial, [Math.cos(angle) * 1.45, 2.8, Math.sin(angle) * 1.45], null, emitter);
  }
  const lensMaterial = glow(TEAL);
  add(new THREE.CircleGeometry(.4, 48), lensMaterial, [0, 2.88, 0], [Math.PI / 2, 0, 0]);
  const channelMaterial = glow(TEAL);
  for (const radius of [1.55, 2.05]) add(new THREE.TorusGeometry(radius, .03, 8, 128), channelMaterial, [0, .23, 0], [Math.PI / 2, 0, 0]);

  // Operator screens on the baked desks.
  const scaleState = { charge: 0, ready: false };
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
    c.fillStyle = '#5ff3e033';
    c.fillRect(24, 170, w - 48, 26);
    c.fillStyle = scaleState.charge >= .99 ? '#75f1b4' : '#5ff3e0';
    c.fillRect(24, 170, (w - 48) * scaleState.charge, 26);
    c.font = '500 20px "IBM Plex Mono", monospace';
    c.fillStyle = '#9ff7ff';
    c.fillText('FIELD CHARGE ' + Math.round(scaleState.charge * 100) + '%', 24, 232);
    c.fillText(scaleState.ready ? 'SQUAD LOCKED  ·  READY TO SHRINK' : 'AWAITING SQUAD', 24, 266);
    c.fillStyle = Math.sin(t * 6) > 0 ? '#ffc06a' : '#ffc06a55';
    c.fillRect(w - 52, 28, 22, 22);
  });
  for (const [side, screen] of [[1, scale], [-1, vitals]]) {
    const desk = new THREE.Group();
    desk.position.set(side * 3.5, 0, -1.4);
    desk.rotation.y = side * .55;
    scene.add(desk);
    add(new THREE.PlaneGeometry(1.2, .75), new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }),
      [0, 1.42, .072], [-.35, Math.PI, 0], desk);
  }

  // Holographic patient over the baked projector, injection site marked.
  const holoMaterial = new THREE.MeshBasicMaterial({ color: 0x7ff7ff, wireframe: true, transparent: true, opacity: .5, toneMapped: false, depthWrite: false });
  const holoShell = new THREE.MeshBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: .1, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const patient = new THREE.Group();
  patient.position.set(-3.3, .62, 2.7);
  scene.add(patient);
  const limb = (radius, length, position, rotation) => {
    for (const material of [holoMaterial, holoShell]) add(new THREE.CapsuleGeometry(radius, length, 4, 10), material, position, rotation, patient);
  };
  limb(.13, .02, [0, 1.62, 0]);
  limb(.2, .5, [0, 1.12, 0]);
  limb(.17, .2, [0, .74, 0]);
  for (const side of [-1, 1]) {
    limb(.065, .55, [side * .3, 1.08, 0], [0, 0, side * .18]);
    limb(.08, .62, [side * .11, .32, 0]);
  }
  const target = add(new THREE.SphereGeometry(.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5a4a, toneMapped: false }), [.06, 1.2, -.12], null, patient);
  const targetRing = add(new THREE.TorusGeometry(.1, .008, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff5a4a, toneMapped: false }), [0, 0, 0], null, patient);
  targetRing.position.copy(target.position);
  add(new THREE.CylinderGeometry(.55, .45, 1.9, 40, 1, true), glow(TEAL), [-3.3, 1.45, 2.7]).material.opacity = .05;

  // The injection capsule's glass, fluid and bubbles over its baked base.
  const capsule = new THREE.Group();
  capsule.position.set(3.4, 0, 2.7);
  scene.add(capsule);
  add(new THREE.CylinderGeometry(.42, .42, 1.6, 40), new THREE.MeshPhysicalMaterial({
    color: 0x2ff0c8, emissive: 0x16a98c, emissiveIntensity: .9, roughness: .1, transparent: true, opacity: .72,
  }), [0, 1.2, 0], null, capsule);
  add(new THREE.CylinderGeometry(.5, .5, 2.15, 48, 1, true), new THREE.MeshPhysicalMaterial({
    color: 0xdffaff, roughness: .04, metalness: 0, transparent: true, opacity: .2, side: THREE.DoubleSide,
  }), [0, 1.42, 0], null, capsule);
  const bubbles = Array.from({ length: 18 }, () => ({
    mesh: add(new THREE.SphereGeometry(.02 + Math.random() * .025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc8fff2, toneMapped: false }),
      [(Math.random() - .5) * .6, .5 + Math.random() * 1.4, (Math.random() - .5) * .6], null, capsule),
    speed: .2 + Math.random() * .4,
  }));

  // Motes drifting in the lab air.
  const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
    Array.from({ length: 360 }, (_, i) => (i % 3 === 1 ? Math.random() * 5 : (Math.random() - .5) * (i % 3 ? 8 : 10))), 3)),
  new THREE.PointsMaterial({ color: 0x9ff7ff, size: .02, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(motes);

  const bays = SLOTS.map((x, index) => {
    const pedestal = new THREE.Group();
    pedestal.position.set(x, PAD_TOP, 0);
    scene.add(pedestal);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false });
    add(new THREE.TorusGeometry(.53, .016, 8, 64), ringMaterial, [0, .005, 0], [Math.PI / 2, 0, 0], pedestal);
    // Contact shadow on the pad from the suit's own key spot.
    const catcher = add(new THREE.CircleGeometry(.75, 40), new THREE.ShadowMaterial({ opacity: .45 }), [0, .004, 0], [-Math.PI / 2, 0, 0], pedestal);
    catcher.receiveShadow = true;
    const spot = new THREE.SpotLight(0xffffff, 16, 6, .5, .8, 1.6);
    spot.position.set(-.6, 3.1, -1.6);
    spot.target.position.set(0, .9, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -.0004;
    spot.shadow.normalBias = .02;
    pedestal.add(spot, spot.target);
    const beam = add(new THREE.CylinderGeometry(.46, .5, 2.6, 40, 1, true), new THREE.MeshBasicMaterial({
      color: TEAL, transparent: true, opacity: .06, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }), [0, 1.3, 0], null, pedestal);
    const turntable = new THREE.Group();
    pedestal.add(turntable);
    const rig = createTeammate(softMask, { marker: false });
    rig.root.traverse(part => { if (part.isMesh) part.castShadow = true; });
    turntable.add(rig.root);
    const actor = {
      id: 'bay-' + index, x: 0, z: 0, yaw: 0, pitch: -.08, name: '', aiming: false,
      downed: false, connected: true, suit: null, weaponLoadout: undefined,
    };
    return { ringMaterial, beam, turntable, rig, actor, player: null, spin: index ? -.3 : .3 };
  });

  // Swap in the baked lab, and let the suits reflect it.
  loadLab().then(nodes => {
    if (!nodes) return;
    lab.add(nodes.shell.clone(), nodes.machine.clone());
    emitter.add(nodes.emitter.clone());
    const probe = new THREE.Scene();
    probe.add(nodes.shell.clone(), nodes.machine.clone());
    probe.position.y = -1.3;
    scene.environment = pmrem.fromScene(probe, .02, .1, 30).texture;
    scene.environmentIntensity = 1;
  });

  let frame = 0;
  let last = 0;
  let clock = 0;
  let screenClock = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const tone = new THREE.Color();
  const charged = new THREE.Color(GREEN);

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
      bay.beam.visible = here;
      bay.turntable.visible = here;
      if (!here) continue;
      if (!still) bay.actor.pitch = -.08 + Math.sin(clock * 1.3 + index * 2.1) * .035;
      bay.rig.update(bay.actor, 0, dt, true);
      if (!still) bay.turntable.rotation.y = Math.sin(clock * .4 + index * 1.7) * .35 + bay.spin;
      const pulse = still ? 0 : Math.sin(clock * 3 + index) * .03;
      bay.beam.material.opacity = (bay.player.ready ? .14 + charge * .16 : .04) + pulse;
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
    const energy = charge + (still ? 0 : Math.sin(clock * (2 + charge * 8)) * .2 * (.25 + charge));
    tone.set(TEAL).lerp(charged, charge);
    nodeMaterial.color.copy(tone).multiplyScalar(.15 + energy * .9);
    lensMaterial.color.copy(tone).multiplyScalar(.1 + energy * .8);
    channelMaterial.color.copy(tone).multiplyScalar(.05 + energy * .6);
    machineGlow.color.copy(tone);
    machineGlow.intensity = 6 + charge * 24;
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
    const booth = new THREE.Scene();
    booth.environment = studio;
    booth.environmentIntensity = .6;
    booth.add(new THREE.HemisphereLight(0xe6fbff, 0x1a2426, 1.3));
    const front = new THREE.DirectionalLight(0xffffff, 2.8);
    front.position.set(-2, 3, -4);
    booth.add(front);
    const back = new THREE.DirectionalLight(0x7fe9ff, 2.6);
    back.position.set(3, 2.5, 3);
    booth.add(back);
    const rig = createTeammate(softMask, { marker: false });
    rig.root.rotation.y = .5;
    booth.add(rig.root);
    rig.update({ id: 'portrait-' + suit, x: 0, z: 0, yaw: .5, pitch: -.1, suit, connected: true }, 0, 0, true);
    const lens = new THREE.PerspectiveCamera(26, width / height, .1, 20);
    lens.position.set(0, 1.15, -4.6);
    lens.lookAt(0, .95, 0);
    const bytes = new Uint8Array(width * height * 4);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(booth, lens);
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
