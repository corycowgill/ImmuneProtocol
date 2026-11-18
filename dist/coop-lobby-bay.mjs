import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { createTeammate } from './teammate.mjs';

// Live 3D "deployment bay" in the co-op lobby: shows each player's chosen suit
// side by side on glowing pedestals.
// The camera looks at the suits' fronts, so +x is screen left.
const SLOTS = [1.0, -1.0];

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

export function createLobbyBay(canvas, softMask = radialMask()) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Image-based lighting so the suits' metal, glass, and painted plates reflect a studio.
  // The floor and pedestals set their own envMap so a low envMapIntensity applies to them.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  pmrem.dispose();

  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = .55;
  scene.fog = new THREE.Fog(0x1a0f10, 5, 11);
  const camera = new THREE.PerspectiveCamera(30, 2, .1, 30);
  camera.position.set(0, 1.35, -5.6);
  camera.lookAt(0, 1.0, 0);

  scene.add(new THREE.HemisphereLight(0xffd9c8, 0x2a0d10, 1.1));
  const key = new THREE.DirectionalLight(0xfff1e2, 2.6);
  key.position.set(-2.5, 4, -4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fd8ff, 2.4);
  rim.position.set(3, 3, 4);
  scene.add(rim);
  // Cool back light from the opposite side so dark suits (Wraith) keep an edge.
  const backRim = new THREE.DirectionalLight(0xbfe4ff, 2.2);
  backRim.position.set(-3, 2.6, 4);
  scene.add(backRim);
  const fill = new THREE.PointLight(0xff5d4a, 6, 6, 1.6);
  fill.position.set(0, .4, -1.8);
  scene.add(fill);

  // Back wall: soft vascular glow so the suits read against the dark panel.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshBasicMaterial({
    color: 0x3a1517, map: softMask, transparent: true, opacity: .9, depthWrite: false,
  }));
  wall.position.set(0, 1.4, 3.5);
  wall.rotation.y = Math.PI;
  scene.add(wall);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({
    color: 0x24171a, roughness: .55, metalness: .4, envMap: environment, envMapIntensity: .05,
  }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const bays = SLOTS.map((x, index) => {
    const pedestal = new THREE.Group();
    pedestal.position.x = x;
    scene.add(pedestal);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.5, .56, .08, 40), new THREE.MeshStandardMaterial({
      color: 0x2b2a2e, metalness: .7, roughness: .35, envMap: environment, envMapIntensity: .1,
    }));
    disc.position.y = .04;
    pedestal.add(disc);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x75f1b4, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.52, .012, 8, 64), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .085;
    pedestal.add(ring);
    disc.receiveShadow = true;
    // Soft key spot per pedestal: models the armour and casts a contact shadow.
    const spot = new THREE.SpotLight(0xfff4ea, 18, 6, .5, .8, 1.6);
    spot.position.set(-.6, 3.1, -1.6);
    spot.target.position.set(0, .9, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -.0004;
    spot.shadow.normalBias = .02;
    pedestal.add(spot, spot.target);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.48, .5, 2.3, 40, 1, true), new THREE.MeshBasicMaterial({
      color: 0x75f1b4, transparent: true, opacity: .06, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    beam.position.y = 1.2;
    pedestal.add(beam);
    const turntable = new THREE.Group();
    turntable.position.y = .08;
    pedestal.add(turntable);
    const rig = createTeammate(softMask, { marker: false });
    turntable.add(rig.root);
    const actor = {
      id: 'bay-' + index, x: 0, z: 0, yaw: 0, pitch: -.08, name: '', aiming: false,
      downed: false, connected: true, suit: null, weaponLoadout: undefined,
    };
    return { pedestal, ring, ringMaterial, beam, turntable, rig, actor, player: null, spin: index ? -.35 : .35 };
  });

  let frame = 0;
  let last = 0;
  let clock = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 1.4 ? 40 : 30;
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
    for (const [index, bay] of bays.entries()) {
      const present = !!bay.player;
      bay.rig.root.visible = present;
      bay.beam.visible = present;
      if (present) {
        // Subtle idle: slow breathing sway of head and rifle through the rig.
        if (!still) bay.actor.pitch = -.08 + Math.sin(clock * 1.3 + index * 2.1) * .035;
        bay.rig.update(bay.actor, 0, dt, true);
        bay.rig.root.visible = true;
        if (!still) bay.turntable.rotation.y = Math.sin(clock * .45 + index * 1.7) * .55 + bay.spin;
        bay.beam.material.opacity = bay.player.ready ? .13 + Math.sin(clock * 3) * .03 : .05;
      }
      bay.ring.scale.setScalar(present && !still ? 1 + Math.sin(clock * 2 + index) * .02 : 1);
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
        bay.ringMaterial.color.set(0x5a4a48);
        continue;
      }
      bay.actor.suit = player.suit;
      bay.actor.weaponLoadout = player.weaponLoadout ?? undefined;
      bay.actor.name = player.name;
      bay.ringMaterial.color.set(!player.connected ? 0x8a6a5a : player.ready ? 0x75f1b4 : 0xffc06a);
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
    studio.add(new THREE.HemisphereLight(0xffe6dc, 0x2a1214, 1.3));
    const front = new THREE.DirectionalLight(0xfff1e2, 2.8);
    front.position.set(-2, 3, -4);
    studio.add(front);
    const back = new THREE.DirectionalLight(0x7fd8ff, 2.6);
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
