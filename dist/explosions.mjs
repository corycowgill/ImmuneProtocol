// Rocket flights and explosions: fireball, flash, smoke column, ground shockwave, sparks and light.
import * as THREE from './vendor/three.module.js';

function radialTexture(stops, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// A smoke puff with real structure: value-noise fBm, domain-warped so it curls, with a ragged
// edge and a denser core, instead of a soft round disc. Every puff is drawn at a random rotation.
function smokeTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  let seed = 913;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const grid = 32, lattice = Array.from({ length: grid * grid }, random);
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    const at = (i, j) => lattice[((j % grid + grid) % grid) * grid + ((i % grid + grid) % grid)];
    const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf, bottom = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf;
    return top + (bottom - top) * yf;
  };
  const fbm = (x, y) => noise(x, y) * .5 + noise(x * 2.03, y * 2.03) * .27 + noise(x * 4.1, y * 4.1) * .15 + noise(x * 8.3, y * 8.3) * .08;
  // Test stubs (node) provide a canvas without pixel access; the texture is then left blank.
  if (!context.createImageData) return new THREE.CanvasTexture(canvas);
  const image = context.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size * 2 - 1, v = py / size * 2 - 1;
      const wx = fbm(u * 2.2 + 5.1, v * 2.2 + 1.7), wy = fbm(u * 2.2 - 3.3, v * 2.2 + 8.2);
      const density = fbm(u * 2.6 + wx * 1.6, v * 2.6 + wy * 1.6);
      const r = Math.hypot(u, v) + (wx - .5) * .5;
      const falloff = Math.max(0, 1 - Math.pow(Math.max(0, r) / .92, 2.2));
      const alpha = Math.max(0, Math.min(1, (density - .3) * 1.9)) * falloff;
      const i = (py * size + px) * 4;
      const shade = 200 + density * 55;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = shade;
      image.data[i + 3] = Math.round(alpha * .62 * 255);
    }
  }
  context.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export class ExplosionFX {
  constructor(scene, { floorHeight = () => 0, burst = () => {} } = {}) {
    this.scene = scene;
    this.floorHeight = floorHeight;
    this.burst = burst;
    this.glow = radialTexture([[0, 'rgba(255,255,240,1)'], [.25, 'rgba(255,214,120,.95)'], [.6, 'rgba(255,110,40,.45)'], [1, 'rgba(255,60,20,0)']]);
    this.flare = radialTexture([[0, 'rgba(255,255,255,1)'], [.2, 'rgba(255,240,200,.8)'], [1, 'rgba(255,200,120,0)']]);
    this.smoke = smokeTexture();
    this.ringTexture = radialTexture([[0, 'rgba(255,200,140,0)'], [.72, 'rgba(255,200,140,0)'], [.86, 'rgba(255,230,190,.9)'], [1, 'rgba(255,160,80,0)']]);
    this.sprites = [];
    this.rings = [];
    this.rockets = [];
    this.lights = [];
    this.shake = 0;
    // The Camera shake option scales every jolt (1 is full strength).
    this.shakeScale = 1;
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffa255, 0, 26, 2);
      light.userData.remaining = 0;
      scene.add(light);
      this.lights.push(light);
    }
    this.rocketGeometry = this.createRocketGeometry();
    // Fixed pools retain GPU resources between effects. A saturated pool drops only
    // decorative visuals; combat and damage remain authoritative in the simulation.
    this.spritePool = Array.from({ length: 224 }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smoke, transparent: true, depthWrite: false }));
      sprite.visible = false;
      scene.add(sprite);
      return { sprite };
    });
    const ringGeometry = new THREE.PlaneGeometry(1, 1);
    this.ringPool = Array.from({ length: 16 }, () => {
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ map: this.ringTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      return { ring };
    });
    this.rocketPool = Array.from({ length: 12 }, () => {
      const model = this.rocketGeometry.clone();
      model.visible = false;
      scene.add(model);
      return { model, start: new THREE.Vector3(), end: new THREE.Vector3() };
    });
  }

  createRocketGeometry() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .55, 14),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c2, metalness: .4, roughness: .4 }));
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.075, .2, 14),
      new THREE.MeshStandardMaterial({ color: 0x75f1b4, emissive: 0x2f9b68, emissiveIntensity: .8, roughness: .3 }));
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -.37;
    group.add(nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(.012, .13, .14), new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: .6 }));
      fin.position.set(Math.cos(i * Math.PI / 2) * .08, Math.sin(i * Math.PI / 2) * .08, .22);
      fin.rotation.z = i * Math.PI / 2;
      group.add(fin);
    }
    const exhaust = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    exhaust.position.z = .38;
    exhaust.scale.setScalar(.7);
    group.add(exhaust);
    return group;
  }

  sprite(map, { x, y, z }, options) {
    const item = this.spritePool.pop();
    if (!item) return null;
    const { sprite } = item;
    const material = sprite.material;
    material.map = map;
    material.color.set(options.color ?? 0xffffff);
    material.blending = options.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.opacity = options.opacity ?? 1;
    material.rotation = Math.random() * Math.PI * 2;
    sprite.visible = true;
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(options.size);
    Object.assign(item, { delay: 0, fadeIn: 0, cool: false, vx: undefined, vy: 0, vz: 0, additive: false, opacity: 1, grow: 0 }, options, { life: options.life, remaining: options.life });
    this.sprites.push(item);
    return sprite;
  }

  // A rocket that flies from `start` to `end` over `travel` seconds, trailing smoke.
  launch(start, end, travel, reduceMotion) {
    const item = this.rocketPool.pop();
    if (!item) return;
    const { model } = item;
    model.visible = true;
    model.position.copy(start);
    model.lookAt(end);
    model.rotateY(Math.PI);
    item.start.copy(start);
    item.end.copy(end);
    Object.assign(item, { travel: Math.max(.03, travel), elapsed: 0, puff: 0, reduceMotion });
    this.rockets.push(item);
  }

  explode(x, y, z, radius = 5, reduceMotion = false) {
    const center = { x, y, z };
    const scale = radius / 5;
    this.sprite(this.flare, center, { size: 2, grow: 9 * scale, life: .16, additive: true, opacity: 1 });
    const balls = reduceMotion ? 4 : 11;
    for (let i = 0; i < balls; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * .9 * scale;
      this.sprite(this.glow, { x: x + Math.cos(angle) * spread, y: y + Math.random() * .8 * scale, z: z + Math.sin(angle) * spread }, {
        size: 1.2 * scale, grow: (3.4 + Math.random() * 2.6) * scale, life: .45 + Math.random() * .35, additive: true,
        color: new THREE.Color().setHSL(.07 + Math.random() * .05, 1, .6), cool: true,
        vx: Math.cos(angle) * 2.4 * scale, vy: 1.4 + Math.random() * 2, vz: Math.sin(angle) * 2.4 * scale,
      });
    }
    const puffs = reduceMotion ? 5 : 14;
    for (let i = 0; i < puffs; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * 1.6 * scale;
      this.sprite(this.smoke, { x: x + Math.cos(angle) * spread, y: y + Math.random() * scale, z: z + Math.sin(angle) * spread }, {
        // Dark, warm smoke: pale grey read as a sheet over the dim, fogged arenas once drawn in HDR.
        size: 1.6 * scale, grow: (2.4 + Math.random() * 2) * scale, life: 1.6 + Math.random() * 1.3, opacity: .7,
        color: new THREE.Color().setHSL(.03, .4, .05 + Math.random() * .05), fadeIn: .15, delay: Math.random() * .12,
        vx: Math.cos(angle) * .9, vy: 1.1 + Math.random() * 1.3, vz: Math.sin(angle) * .9,
      });
    }
    const item = this.ringPool.pop();
    if (item) {
      item.ring.position.set(x, this.floorHeight(x, z) + .06, z);
      item.ring.scale.setScalar(.5);
      item.ring.material.opacity = 1;
      item.ring.visible = true;
      Object.assign(item, { life: .45, remaining: .45, size: radius * 2.8 });
      this.rings.push(item);
    }
    const light = this.lights.reduce((low, item) => (item.userData.remaining < low.userData.remaining ? item : low));
    light.position.set(x, y + .6, z);
    light.userData.remaining = light.userData.life = .55;
    light.userData.peak = 420 * scale;
    this.burst(x, y, z, 0xffd27a, reduceMotion ? 18 : 70, 9 * scale);
    this.burst(x, y, z, 0xff6a2a, reduceMotion ? 10 : 45, 6 * scale);
    if (!reduceMotion) this.shake = Math.min(1, this.shake + .55);
  }

  update(dt, camera) {
    let count = 0;
    for (const rocket of this.rockets) {
      rocket.elapsed += dt;
      const t = Math.min(1, rocket.elapsed / rocket.travel);
      rocket.model.position.lerpVectors(rocket.start, rocket.end, t);
      rocket.model.rotateZ(dt * 14);
      rocket.puff -= dt;
      if (rocket.puff <= 0 && !rocket.reduceMotion) {
        rocket.puff = .012;
        this.sprite(this.smoke, rocket.model.position, {
          size: .35, grow: 1.6, life: .9 + Math.random() * .5, opacity: .5, color: 0xbfb6ad,
          vx: (Math.random() - .5) * .3, vy: .25, vz: (Math.random() - .5) * .3,
        });
        this.sprite(this.glow, rocket.model.position, { size: .5, grow: -.6, life: .12, additive: true, color: 0xffb060 });
      }
      if (t >= 1) {
        rocket.model.visible = false;
        this.rocketPool.push(rocket);
        continue;
      }
      this.rockets[count++] = rocket;
    }
    this.rockets.length = count;

    count = 0;
    for (const item of this.sprites) {
      if (item.delay > 0) {
        item.delay -= dt;
        item.sprite.material.opacity = 0;
        this.sprites[count++] = item;
        continue;
      }
      item.remaining -= dt;
      if (item.remaining <= 0) {
        item.sprite.visible = false;
        this.spritePool.push(item);
        continue;
      }
      const age = 1 - item.remaining / item.life;
      const { sprite } = item;
      sprite.scale.setScalar(Math.max(.05, sprite.scale.x + item.grow * dt * (1 - age * .6)));
      if (item.vx !== undefined) {
        const drag = Math.exp(-dt * 2.2);
        item.vx *= drag;
        item.vz *= drag;
        sprite.position.x += item.vx * dt;
        sprite.position.y += item.vy * dt;
        sprite.position.z += item.vz * dt;
      }
      const fadeIn = item.fadeIn ? Math.min(1, age / item.fadeIn) : 1;
      sprite.material.opacity = (item.opacity ?? 1) * fadeIn * (1 - age) ** (item.additive ? 1.4 : 1.1);
      if (item.cool) sprite.material.color.offsetHSL(-dt * .05, 0, -dt * .45);
      sprite.material.rotation += dt * .4;
      this.sprites[count++] = item;
    }
    this.sprites.length = count;

    count = 0;
    for (const item of this.rings) {
      item.remaining -= dt;
      if (item.remaining <= 0) {
        item.ring.visible = false;
        this.ringPool.push(item);
        continue;
      }
      const age = 1 - item.remaining / item.life;
      item.ring.scale.setScalar(.5 + item.size * Math.sqrt(age));
      item.ring.material.opacity = 1 - age;
      this.rings[count++] = item;
    }
    this.rings.length = count;

    for (const light of this.lights) {
      const data = light.userData;
      data.remaining = Math.max(0, data.remaining - dt);
      light.intensity = data.remaining > 0 ? data.peak * (data.remaining / data.life) ** 2 : 0;
    }
    // Camera shake decays quickly; the caller adds the offset after positioning the camera.
    if (camera && this.shake > .001) {
      const amount = this.shake * this.shake * .09 * this.shakeScale;
      camera.position.x += (Math.random() - .5) * amount;
      camera.position.y += (Math.random() - .5) * amount;
      camera.rotation.z += (Math.random() - .5) * amount * .4;
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }

  clear() {
    for (const item of this.sprites) { item.sprite.visible = false; this.spritePool.push(item); }
    for (const item of this.rings) { item.ring.visible = false; this.ringPool.push(item); }
    for (const rocket of this.rockets) { rocket.model.visible = false; this.rocketPool.push(rocket); }
    for (const light of this.lights) { light.intensity = 0; light.userData.remaining = 0; }
    this.sprites.length = this.rings.length = this.rockets.length = 0;
    this.shake = 0;
  }
}
