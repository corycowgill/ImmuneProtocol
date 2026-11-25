import { translate } from './i18n.mjs';
// The disease guide's specimen view: the pathogen sits in a petri dish seen down a microscope.
// Two flat layers frame the 3D model. Behind it, the lit circle of the microscope's field shows an
// amber agar plate with bacterial colonies, out-of-focus cells and the curved wall of the dish.
// In front of it, the eyepiece: black outside the field, a measuring reticle, a scale bar and the
// slide label. Specks drift slowly through the dish between the two. Both layers are painted on
// 2D canvases at the viewer's exact pixel size, so the round field never stretches.
import * as THREE from './vendor/three.module.js';

// A seeded random source, so a pathogen's plate looks the same every time it is opened.
function random(seed) {
  let state = seed >>> 0 || 1;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

// Radius of the round field of view for a viewer of this size.
export function fieldRadius(width, height) {
  return Math.min(width, height) * .47;
}

function canvas2d(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// The plate under the objective: agar, colonies, blurred cells and the dish wall.
export function paintPlate(context, width, height, seed) {
  const next = random(seed);
  const cx = width / 2, cy = height / 2, radius = fieldRadius(width, height);
  context.fillStyle = '#050302';
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.arc(cx, cy, radius * 1.02, 0, Math.PI * 2);
  context.clip();

  // Transmitted light through amber nutrient agar: bright at the centre, falling off to the rim.
  const light = context.createRadialGradient(cx - radius * .12, cy - radius * .16, radius * .05, cx, cy, radius * 1.05);
  light.addColorStop(0, '#fbedcc');
  light.addColorStop(.45, '#e2c391');
  light.addColorStop(.8, '#a57b4c');
  light.addColorStop(1, '#4a321d');
  context.fillStyle = light;
  context.fillRect(cx - radius * 1.1, cy - radius * 1.1, radius * 2.2, radius * 2.2);

  // Agar grain.
  const grains = Math.round(radius * radius * .012);
  for (let i = 0; i < grains; i++) {
    const angle = next() * Math.PI * 2, distance = Math.sqrt(next()) * radius;
    context.fillStyle = next() < .5 ? 'rgba(90,55,20,.13)' : 'rgba(255,245,220,.16)';
    context.fillRect(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, 1 + next() * 1.6, 1 + next() * 1.6);
  }

  const blur = amount => { if ('filter' in context) context.filter = amount ? `blur(${amount}px)` : 'none'; };

  // Out-of-focus cells far below the focal plane: large, soft rings.
  for (let i = 0; i < 9; i++) {
    const angle = next() * Math.PI * 2, distance = (.25 + next() * .7) * radius;
    const x = cx + Math.cos(angle) * distance, y = cy + Math.sin(angle) * distance, r = radius * (.06 + next() * .09);
    blur(radius * .025);
    context.fillStyle = 'rgba(255,240,210,.16)';
    context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2); context.fill();
    context.lineWidth = r * .18;
    context.strokeStyle = 'rgba(70,40,15,.22)';
    context.stroke();
  }

  // Bacterial colonies: cream domes with a darker rim, some in clusters.
  for (let i = 0; i < 26; i++) {
    const angle = next() * Math.PI * 2, distance = (.18 + next() * .8) * radius;
    const x = cx + Math.cos(angle) * distance, y = cy + Math.sin(angle) * distance;
    const r = radius * (.012 + next() ** 2 * .05);
    blur(next() < .55 ? radius * .006 : 0);
    const dome = context.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r);
    dome.addColorStop(0, 'rgba(255,250,232,.92)');
    dome.addColorStop(.7, 'rgba(236,214,170,.85)');
    dome.addColorStop(1, 'rgba(120,80,40,.75)');
    context.fillStyle = dome;
    context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2); context.fill();
    // A few satellites around the bigger colonies.
    if (r > radius * .03) {
      for (let j = 0; j < 4; j++) {
        const a = next() * Math.PI * 2, d = r * (1.4 + next() * 1.4), s = r * (.12 + next() * .2);
        context.fillStyle = 'rgba(245,228,190,.8)';
        context.beginPath(); context.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, Math.PI * 2); context.fill();
      }
    }
  }
  blur(0);

  // The curved glass wall of the dish crossing a corner of the field.
  // Its nearest point sits about two thirds of the way out, so it never crosses the specimen.
  const toward = Math.PI * (.6 + next() * .8) + (next() < .5 ? 0 : Math.PI * .8);
  const wallR = radius * 2.2, reach = wallR + radius * (.66 + next() * .14);
  const wallX = cx + Math.cos(toward) * reach, wallY = cy + Math.sin(toward) * reach;
  context.lineWidth = radius * .06;
  context.strokeStyle = 'rgba(40,24,10,.35)';
  context.beginPath(); context.arc(wallX, wallY, wallR + radius * .03, 0, Math.PI * 2); context.stroke();
  context.lineWidth = radius * .012;
  context.strokeStyle = 'rgba(255,250,235,.75)';
  context.beginPath(); context.arc(wallX, wallY, wallR, 0, Math.PI * 2); context.stroke();
  context.fillStyle = 'rgba(30,18,8,.28)';
  context.beginPath(); context.arc(wallX, wallY, wallR - radius * .01, 0, Math.PI * 2);
  context.rect(0, 0, width, height); context.fill('evenodd');

  // Illumination falls off towards the edge of the field, with a faint colour fringe.
  const falloff = context.createRadialGradient(cx, cy, radius * .55, cx, cy, radius * 1.02);
  falloff.addColorStop(0, 'rgba(0,0,0,0)');
  falloff.addColorStop(1, 'rgba(15,8,2,.7)');
  context.fillStyle = falloff;
  context.fillRect(0, 0, width, height);
  context.restore();
}

// The eyepiece in front of the specimen: black surround, reticle, scale bar and slide label.
export function paintEyepiece(context, width, height, label) {
  const cx = width / 2, cy = height / 2, radius = fieldRadius(width, height);
  context.clearRect(0, 0, width, height);
  const edge = context.createRadialGradient(cx, cy, radius * .93, cx, cy, radius * 1.01);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(3,2,1,1)');
  context.fillStyle = edge;
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#030201';
  context.beginPath();
  context.rect(0, 0, width, height);
  context.arc(cx, cy, radius * 1.005, 0, Math.PI * 2);
  context.fill('evenodd');
  // A thin chromatic ring where the field meets the eyepiece.
  context.lineWidth = Math.max(1, radius * .006);
  context.strokeStyle = 'rgba(120,170,255,.25)';
  context.beginPath(); context.arc(cx, cy, radius * .985, 0, Math.PI * 2); context.stroke();

  // Reticle: a crosshair with ticks along the horizontal axis.
  const unit = Math.max(1, radius / 260);
  context.strokeStyle = 'rgba(25,14,4,.3)';
  context.lineWidth = unit;
  context.beginPath();
  context.moveTo(cx - radius * .92, cy); context.lineTo(cx + radius * .92, cy);
  context.moveTo(cx, cy - radius * .92); context.lineTo(cx, cy + radius * .92);
  for (let i = -10; i <= 10; i++) {
    if (!i) continue;
    const x = cx + i * radius * .08, tall = i % 5 === 0 ? 9 : 5;
    context.moveTo(x, cy - tall * unit); context.lineTo(x, cy + tall * unit);
  }
  context.stroke();

  // Scale bar, lower right inside the field.
  const barX = cx + radius * .28, barY = cy + radius * .66, barW = radius * .3;
  context.fillStyle = 'rgba(25,14,4,.7)';
  context.fillRect(barX, barY, barW, 3 * unit);
  context.font = `600 ${Math.round(11 * unit)}px "IBM Plex Mono", monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(translate('100 nm'), barX + barW / 2, barY + 6 * unit);

  // Slide label and magnification, in the dark corners outside the field.
  context.fillStyle = 'rgba(214,230,220,.62)';
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  const small = Math.round(Math.max(10, Math.min(13, radius / 22)));
  context.font = `500 ${small}px "IBM Plex Mono", monospace`;
  context.fillText(translate('OBJ 100× · OIL'), small, small * 1.8);
  context.textAlign = 'right';
  context.fillText(translate(label), width - small, height - small);
}

// Holds both layers and the drifting specks for one WebGL viewer.
export class MicroscopeBackdrop {
  constructor(scene) {
    this.scene = scene;
    this.overlay = new THREE.Scene();
    this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.size = '';
    this.label = '';
    this.seed = 1;
    this.plateCanvas = null;
    this.eyepieceCanvas = null;
    this.plate = null;
    this.eyepiece = null;
    const eyepieceMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.lens = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), eyepieceMaterial);
    this.overlay.add(this.lens);
    this.specks = this.createSpecks();
    scene.add(this.specks);
  }

  // Specks of debris suspended in the medium around the specimen, out of focus.
  createSpecks() {
    const count = 70, next = random(7);
    const positions = new Float32Array(count * 3);
    this.drift = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set([(next() - .5) * 5, (next() - .5) * 4, -1.5 - next() * 3], i * 3);
      this.drift.set([(next() - .5) * .08, .03 + next() * .06, 0], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dot = canvas2d(32, 32), context = dot.getContext('2d');
    const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, 'rgba(255,248,230,.9)');
    glow.addColorStop(.5, 'rgba(240,220,180,.35)');
    glow.addColorStop(1, 'rgba(240,220,180,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 32, 32);
    const material = new THREE.PointsMaterial({
      size: .09, map: new THREE.CanvasTexture(dot), transparent: true, opacity: .55, depthWrite: false, toneMapped: false,
    });
    return new THREE.Points(geometry, material);
  }

  // Which pathogen is on the slide: sets its label and the layout of its plate.
  setSpecimen(type, name) {
    this.seed = hash(type);
    this.label = 'PLATE ' + String(this.seed % 90 + 10) + ' · ' + name.toUpperCase();
    this.size = '';
  }

  // Repaints both layers when the viewer's pixel size or specimen changes.
  resize(width, height) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    const key = width + 'x' + height + ':' + this.seed;
    if (key === this.size) return;
    this.size = key;
    this.plateCanvas ??= canvas2d(width, height);
    this.eyepieceCanvas ??= canvas2d(width, height);
    for (const canvas of [this.plateCanvas, this.eyepieceCanvas]) {
      canvas.width = width;
      canvas.height = height;
    }
    paintPlate(this.plateCanvas.getContext('2d'), width, height, this.seed);
    paintEyepiece(this.eyepieceCanvas.getContext('2d'), width, height, this.label);
    this.plate?.dispose();
    this.eyepiece?.dispose();
    this.plate = new THREE.CanvasTexture(this.plateCanvas);
    this.plate.colorSpace = THREE.SRGBColorSpace;
    this.eyepiece = new THREE.CanvasTexture(this.eyepieceCanvas);
    this.eyepiece.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.plate;
    this.lens.material.map = this.eyepiece;
    this.lens.material.needsUpdate = true;
  }

  update(dt) {
    const positions = this.specks.geometry.attributes.position;
    const array = positions.array;
    for (let i = 0; i < array.length; i += 3) {
      array[i] += this.drift[i] * dt;
      array[i + 1] += this.drift[i + 1] * dt;
      if (array[i + 1] > 2) array[i + 1] = -2;
      if (array[i] > 2.5) array[i] = -2.5;
      if (array[i] < -2.5) array[i] = 2.5;
    }
    positions.needsUpdate = true;
  }

  // Draws the eyepiece over the frame the renderer just drew.
  renderOverlay(renderer) {
    if (!this.eyepiece) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.overlay, this.overlayCamera);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.plate?.dispose();
    this.eyepiece?.dispose();
    this.lens.geometry.dispose();
    this.lens.material.dispose();
    this.specks.geometry.dispose();
    this.specks.material.map?.dispose();
    this.specks.material.dispose();
  }
}
