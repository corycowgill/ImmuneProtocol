// What a shot looks like leaving the barrel: the muzzle flash on the first-person weapon and the
// tracer streaks every gun draws into the arena.
//
// The muzzle flash is three layers that read from any angle: a star-shaped front flash facing
// down the barrel, crossed side petals that show the jet of burning propellant from the hip, and
// a hot core. Each shot re-rolls the rotation, length and petal mix, so automatic fire flickers
// instead of stamping the same shape every frame.
//
// A tracer is a camera-facing ribbon, bright at the head and fading along its tail, that travels
// from the muzzle to the impact during its short life rather than appearing as a static line.
import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;

function canvasTexture(size, draw, width = size) {
  // Headless model checks (node) have no canvas; the shapes still build around a blank texture.
  if (typeof document === 'undefined') return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = size;
  draw(canvas.getContext('2d'), width, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A ragged star: uneven spikes over a soft disc, seen down the barrel.
function starTexture() {
  return canvasTexture(128, (c, w, h) => {
    let seed = 4423;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const x = w / 2, y = h / 2;
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + (random() - .5) * .35, length = h * (.26 + random() * .22), spread = .07 + random() * .07;
      const g = c.createLinearGradient(x, y, x + Math.cos(a) * length, y + Math.sin(a) * length);
      g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(x + Math.cos(a - spread) * 6, y + Math.sin(a - spread) * 6);
      c.lineTo(x + Math.cos(a) * length, y + Math.sin(a) * length);
      c.lineTo(x + Math.cos(a + spread) * 6, y + Math.sin(a + spread) * 6); c.closePath(); c.fill();
    }
    const disc = c.createRadialGradient(x, y, 0, x, y, h * .3);
    disc.addColorStop(0, 'rgba(255,255,255,1)'); disc.addColorStop(.35, 'rgba(255,255,255,.55)'); disc.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = disc; c.fillRect(0, 0, w, h);
  });
}

// A flame petal from the side: a hot root that narrows and breaks into licks toward the tip.
function petalTexture() {
  return canvasTexture(64, (c, w, h) => {
    c.globalCompositeOperation = 'lighter';
    let seed = 991;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 7; i++) {
      const cy = h / 2 + (random() - .5) * h * .22, length = w * (.55 + random() * .42), thick = h * (.16 + random() * .14);
      const g = c.createLinearGradient(0, 0, length, 0);
      g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(.45, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(0, cy - thick / 2); c.quadraticCurveTo(length * .45, cy - thick * .7, length, cy + (random() - .5) * thick);
      c.quadraticCurveTo(length * .45, cy + thick * .7, 0, cy + thick / 2); c.closePath(); c.fill();
    }
  }, 256);
}

function coreTexture() {
  return canvasTexture(64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.8)'); g.addColorStop(.6, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

// Along the ribbon (u): a hard bright head at u = 1 fading to nothing at the tail.
// Across it (v): a hot centre line inside a soft glow.
function tracerTexture() {
  return canvasTexture(32, (c, w, h) => {
    const image = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / (w - 1), v = Math.abs(y / (h - 1) - .5) * 2;
      const along = Math.pow(u, 1.6) * (1 - Math.pow(Math.max(0, u - .94) / .06, 2));
      const across = Math.exp(-v * v * 10) * .55 + Math.exp(-v * v * 90) * .7;
      const a = Math.min(1, along * across * 1.25);
      const core = Math.exp(-v * v * 90) * Math.pow(u, 3);
      const i = (y * w + x) * 4;
      image.data[i] = 255; image.data[i + 1] = 255; image.data[i + 2] = Math.round(200 + 55 * core); image.data[i + 3] = Math.round(a * 255);
    }
    c.putImageData(image, 0, 0);
  }, 128);
}

const additive = (map, color, opacity = 1) => new THREE.MeshBasicMaterial({
  map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
});

// For the first-person weapon scene: adds light but leaves the target's alpha untouched. The post
// pipeline composites the weapon as scene * (1 - alpha) + weapon, so a glow that wrote alpha would
// cut a dark hole in the arena behind it instead of brightening it.
const weaponGlow = (map, color, opacity = 1) => Object.assign(additive(map, color, opacity), {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
});

let shared;
function textures() {
  return shared ??= { star: starTexture(), petal: petalTexture(), core: coreTexture(), tracer: tracerTexture() };
}

// The flash group points down -Z (the barrel). fire() re-rolls its shape for the next shot.
export function createMuzzleFlash() {
  const { star, petal, core } = textures();
  const flash = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(.2, .2), weaponGlow(star, 0xffd9a0, 1));
  front.material.color.multiplyScalar(3.2);
  front.position.z = -.03;
  const petals = [];
  const petalGeometry = new THREE.PlaneGeometry(.26, .075).translate(.13, 0, 0);
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(petalGeometry, weaponGlow(petal, 0xffb45e, 1));
    mesh.material.color.multiplyScalar(2.6);
    // Each petal lies along the barrel, crossed around it.
    mesh.rotation.set(0, Math.PI / 2, i / 3 * Math.PI);
    petals.push(mesh);
  }
  const petalRoot = new THREE.Group();
  petalRoot.add(...petals);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(.09, .09), weaponGlow(core, 0xffe6b8, 1));
  glow.material.color.multiplyScalar(2.6);
  glow.position.z = -.012;
  flash.add(petalRoot, front, glow);
  flash.visible = false;
  flash.userData.fire = random => {
    front.rotation.z = random() * TAU;
    front.scale.setScalar(.8 + random() * .45);
    petalRoot.rotation.z = random() * TAU;
    petals.forEach(p => { p.scale.set(.6 + random() * .65, .8 + random() * .5, 1); p.visible = random() > .18; });
    glow.scale.setScalar(.85 + random() * .3);
  };
  return flash;
}

// A pool of travelling tracer ribbons. Each one is a quad rebuilt every frame to face the camera.
export class TracerPool {
  // hdr scales colours past 1 so tracers bloom. `liquid` ribbons blend normally instead of adding
  // light, so a pathogen's fluid reads as wet matter rather than glowing rays.
  constructor(scene, size = 96, hdr = 4.5, liquid = false) {
    this.hdr = hdr;
    this.liquid = liquid;
    this.texture = textures().tracer;
    this.materials = new Map();
    this.free = [];
    this.live = [];
    this.side = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.tail = new THREE.Vector3();
    for (let i = 0; i < size; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
      geometry.setIndex([0, 2, 1, 2, 3, 1]);
      const mesh = new THREE.Mesh(geometry, this.material(0xffffff));
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.free.push({ mesh, start: new THREE.Vector3(), end: new THREE.Vector3(), life: 0, remaining: 0, width: .03, tail: 4 });
    }
  }

  material(color) {
    if (!this.materials.has(color)) {
      // HDR: bright enough to cross the bloom threshold.
      const material = additive(this.texture, color, 1);
      if (this.liquid) material.blending = THREE.NormalBlending;
      material.color.multiplyScalar(this.hdr);
      this.materials.set(color, material);
    }
    return this.materials.get(color);
  }

  get meshes() { return [...this.free, ...this.live].map(t => t.mesh); }

  // width in metres; tail is the streak's length in metres; life in seconds.
  add(start, end, color, life, width = .03, tail = 5) {
    const tracer = this.free.pop() ?? this.live.shift();
    if (!tracer) return;
    tracer.start.copy(start); tracer.end.copy(end);
    tracer.life = tracer.remaining = life;
    tracer.width = width; tracer.tail = tail;
    tracer.mesh.material = this.material(color);
    tracer.mesh.visible = true;
    this.live.push(tracer);
  }

  update(dt, camera) {
    let count = 0;
    for (const tracer of this.live) {
      tracer.remaining -= dt;
      if (tracer.remaining <= 0) { tracer.mesh.visible = false; this.free.push(tracer); continue; }
      this.live[count++] = tracer;
      const length = tracer.start.distanceTo(tracer.end);
      // The head reaches the impact two thirds of the way through the life; the tail then catches up.
      const t = 1 - tracer.remaining / tracer.life;
      const headAt = Math.min(1, t * 1.5);
      const tailAt = Math.max(0, headAt - Math.min(1, tracer.tail / Math.max(length, .01)) * (1 - Math.max(0, t - .66) * 2.9));
      this.head.lerpVectors(tracer.start, tracer.end, headAt);
      this.tail.lerpVectors(tracer.start, tracer.end, Math.min(tailAt, headAt - .0001));
      this.side.subVectors(this.head, this.tail);
      this.view.subVectors(this.head, camera.position);
      // Never thinner than about two pixels, however far the streak is.
      const width = Math.max(tracer.width, this.view.length() * .0026);
      this.side.cross(this.view).normalize().multiplyScalar(width * (.6 + .4 * (1 - t)));
      const p = tracer.mesh.geometry.attributes.position;
      p.setXYZ(0, this.tail.x - this.side.x, this.tail.y - this.side.y, this.tail.z - this.side.z);
      p.setXYZ(1, this.tail.x + this.side.x, this.tail.y + this.side.y, this.tail.z + this.side.z);
      p.setXYZ(2, this.head.x - this.side.x, this.head.y - this.side.y, this.head.z - this.side.z);
      p.setXYZ(3, this.head.x + this.side.x, this.head.y + this.side.y, this.head.z + this.side.z);
      p.needsUpdate = true;
    }
    this.live.length = count;
  }

  clear() {
    for (const tracer of this.live) { tracer.mesh.visible = false; this.free.push(tracer); }
    this.live.length = 0;
  }
}

// The reticle projected in a reflex or red-dot sight's glass: a lit dot inside a broken ring,
// drawn additively so it glows over whatever is behind the window. Faces +Z (back toward the eye).
function reticleTexture() {
  return canvasTexture(128, (c, w, h) => {
    const x = w / 2, y = h / 2;
    c.shadowColor = 'rgba(255,255,255,.9)'; c.shadowBlur = 6;
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3.2;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x, y, 40, i * TAU / 4 + .22, (i + 1) * TAU / 4 - .22); c.stroke(); }
    c.lineWidth = 3.6;
    c.beginPath(); c.moveTo(x, y + 48); c.lineTo(x, y + 60); c.stroke();
    const dot = c.createRadialGradient(x, y, 0, x, y, 9);
    dot.addColorStop(0, 'rgba(255,255,255,1)'); dot.addColorStop(.45, 'rgba(255,255,255,.95)'); dot.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = dot; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill();
  });
}

let reticleMap;
export function createHoloReticle(size, color = 0x7dffa4) {
  reticleMap ??= reticleTexture();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), weaponGlow(reticleMap, color, 1));
  mesh.material.color.multiplyScalar(2.4);
  mesh.renderOrder = 3;
  return mesh;
}
