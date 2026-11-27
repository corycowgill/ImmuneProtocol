// How the Mega Nano Bot looks in the arena, from its simulation state (nanobot-boss.mjs): its
// pylons vanish as they are destroyed, a shield bubble wraps it while they stand, the brain in its
// dome glows hotter when exposed, the belly cannon draws its laser (a thin aiming line during the
// warning, a thick burning beam during the sweep), the missile pods kick when a salvo leaves and the
// drone bay drops open when it launches. Missiles in flight are the world's rocket effects.
import * as THREE from './vendor/three.module.js';
import { NANOBOT, NANOBOT_LAYOUT } from './nanobot-boss.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const SCALE = new THREE.Vector3(), FROM = new THREE.Vector3(), TO = new THREE.Vector3();

// The shield: a fresnel bubble that is bright at its rim and nearly clear facing the camera.
function shieldMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, strength: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main() {
        vLocal = position;
        vec4 world = modelViewMatrix * vec4(position, 1.);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-world.xyz);
        gl_Position = projectionMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time, strength;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main() {
        float rim = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
        // Hexagonal-ish cells drifting over the bubble.
        vec3 p = vLocal * 6.;
        float cells = abs(sin(p.x + time * .6) * sin(p.y * 1.15 - time * .4) * sin(p.z + p.x * .5));
        float lines = smoothstep(.04, 0., abs(cells - .5) - .05);
        vec3 color = vec3(.25, .9, 1.) * (rim * 1.6 + lines * .22 + .03);
        gl_FragColor = vec4(color * strength, 1.);
      }`,
  });
}

export function dressNanobot(world, enemy, view, dt, reduceMotion, enemies = []) {
  const model = view.model;
  if (!view.nanobot) {
    const find = name => model.getObjectByName(name) ?? null;
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), shieldMaterial());
    shield.name = 'nanobot-shield';
    shield.renderOrder = 5;
    world.scene.add(shield);
    world.botLaserGeometry ??= new THREE.CylinderGeometry(1, 1, 1, 8);
    const beam = new THREE.Group();
    for (const core of [false, true]) beam.add(new THREE.Mesh(world.botLaserGeometry,
      new THREE.MeshBasicMaterial({ color: core ? 0xfff0d8 : 0xff2a12, transparent: true, opacity: core ? .95 : .38, depthWrite: false, toneMapped: false })));
    world.scene.add(beam);
    // A feed beam from each pylon crystal into the shield.
    const feeds = [0, 1, 2].map(() => {
      const feed = new THREE.Mesh(world.botLaserGeometry, new THREE.MeshBasicMaterial({
        color: 0x9ff6ff, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      feed.renderOrder = 6;
      world.scene.add(feed);
      return feed;
    });
    // Brain and pylon materials are cloned so this machine's glow does not leak into the template.
    const glow = mesh => {
      if (!mesh?.material) return null;
      mesh.material = mesh.material.clone();
      return { material: mesh.material, base: mesh.material.emissiveIntensity ?? 1 };
    };
    const brain = find('nanobot-brain');
    view.nanobot = {
      shield, beam, feeds,
      pylons: [0, 1, 2].map(i => find('nanobot-pylon-' + i)),
      brain, brainGlow: glow(brain),
      pods: ['nanobot-pod-L', 'nanobot-pod-R'].map(name => { const pod = find(name); return pod ? { pod, rest: pod.position.clone() } : null; }).filter(Boolean),
      bay: find('nanobot-bay'), bayRest: find('nanobot-bay')?.rotation.x ?? 0,
      laser: find('nanobot-laser'), laserGlow: glow(find('nanobot-laser')),
      kick: 0, shieldLevel: 0,
    };
  }
  const n = view.nanobot;
  // Pylons stand while their part-enemies live.
  const standing = new Set(enemies.filter(e => e.pylonOf === enemy.id && e.health > 0).map(e => e.slot));
  n.pylons.forEach((pylon, slot) => { if (pylon) pylon.visible = enemy.state === 'enter' || standing.has(slot); });

  // The shield fades in and out, and flickers as pylons fall.
  const target = enemy.shielded || enemy.state === 'enter' ? .55 + .15 * standing.size : 0;
  n.shieldLevel = THREE.MathUtils.damp(n.shieldLevel, target, 6, dt);
  n.shield.visible = n.shieldLevel > .01 && model.visible;
  // It sits over the dome, following the hull as it tilts and turns.
  const { shield: bubble } = NANOBOT_LAYOUT;
  model.updateMatrixWorld();
  n.shield.position.set(bubble.x, bubble.y, bubble.z).applyMatrix4(model.matrixWorld);
  const scale = model.getWorldScale(SCALE).x;
  n.shield.scale.setScalar(bubble.radius * scale);
  // Each standing pylon feeds it with a beam from its crystal to the bubble's edge.
  n.pylons.forEach((pylon, slot) => {
    const feed = n.feeds[slot];
    feed.visible = n.shield.visible && !!pylon?.visible;
    if (!feed.visible) return;
    const p = NANOBOT_LAYOUT.pylons[slot];
    FROM.set(p.x, p.y, p.z).applyMatrix4(model.matrixWorld);
    TO.copy(n.shield.position).sub(FROM);
    const length = Math.max(.01, TO.length() - bubble.radius * scale * .92);
    TO.normalize();
    feed.position.copy(FROM).addScaledVector(TO, length / 2);
    feed.quaternion.setFromUnitVectors(UP, TO);
    const pulse = reduceMotion ? 1 : .8 + .35 * Math.sin(world.clock * 9 + slot * 2.1);
    feed.scale.set(.17 * pulse, length, .17 * pulse);
    feed.material.opacity = Math.min(1, n.shieldLevel * 1.8);
  });
  n.shield.material.uniforms.time.value = reduceMotion ? 0 : world.clock;
  // Shots it turns make it flare.
  world.shieldPing = Math.max(0, (world.shieldPing ?? 0) - dt * 4);
  n.shield.material.uniforms.strength.value = n.shieldLevel * (reduceMotion ? 1 : 1 + .2 * Math.sin(world.clock * 13) * (standing.size < 3 ? 1 : 0)) + (n.shieldLevel > .01 ? world.shieldPing * .9 : 0);

  // The brain glows, harder and faster while it is exposed.
  if (n.brainGlow) {
    const exposed = !enemy.shielded && enemy.state !== 'enter';
    const beat = reduceMotion ? .5 : .5 + .5 * Math.sin(world.clock * (exposed ? 7 : 2.4));
    n.brainGlow.material.emissiveIntensity = n.brainGlow.base * (exposed ? 1.8 + beat * 1.6 : .8 + beat * .5);
  }

  // Belly cannon: an aiming line while it warns, a burning beam while it sweeps.
  const laser = enemy.laser;
  n.beam.visible = !!laser && model.visible;
  if (laser) {
    const from = new THREE.Vector3(laser.from.x, laser.from.y, laser.from.z);
    const to = new THREE.Vector3(laser.to.x, laser.to.y, laser.to.z), direction = to.clone().sub(from);
    const length = direction.length();
    n.beam.position.copy(from).add(to).multiplyScalar(.5);
    if (length > .001) n.beam.quaternion.setFromUnitVectors(UP, direction.normalize());
    const firing = laser.stage === 'fire';
    const flicker = reduceMotion ? 1 : 1 + .15 * Math.sin(world.clock * 61);
    n.beam.children.forEach((mesh, index) => {
      const width = (firing ? index ? .09 : .26 : index ? .012 : .035) * flicker;
      mesh.scale.set(width, length, width);
    });
  }
  if (n.laserGlow) n.laserGlow.material.emissiveIntensity = n.laserGlow.base * (laser ? laser.stage === 'fire' ? 4 : 2 : 1);

  // Missile pods kick back as a salvo leaves; the drone bay hangs open while it launches.
  n.kick = Math.max(0, n.kick - dt * 3);
  if (enemy.state === 'salvo' && enemy.timer > enemy.telegraph?.duration - .2) n.kick = 1;
  for (const { pod, rest } of n.pods) pod.position.set(rest.x, rest.y - n.kick * .04, rest.z - n.kick * .08);
  if (n.bay) {
    const open = enemy.state === 'drones' ? 1 : 0;
    n.bay.rotation.x = THREE.MathUtils.damp(n.bay.rotation.x, n.bayRest + open * 1.1, 5, dt);
  }
}

export function releaseNanobot(world, view) {
  if (!view.nanobot) return;
  world.scene.remove(view.nanobot.shield, view.nanobot.beam, ...view.nanobot.feeds);
  for (const feed of view.nanobot.feeds) feed.material.dispose();
  view.nanobot.shield.geometry.dispose();
  view.nanobot.shield.material.dispose();
  for (const mesh of view.nanobot.beam.children) mesh.material.dispose();
  view.nanobot = null;
}

// Hides its shield and beam while its model is pooled or plays its death.
export function hideNanobot(view) {
  if (!view.nanobot) return;
  view.nanobot.shield.visible = false;
  view.nanobot.beam.visible = false;
  for (const feed of view.nanobot.feeds) feed.visible = false;
}
