// Goo on the suit's visor. Swimming through a white blood cell floods the view with its milky
// cytoplasm; leaving it leaves a coat of plasm on the visor that sags and drips for a moment
// before the suit's glove wipes it away, leaving smeared streaks that thin out and clear.
// World feeds it the camera's depth inside a cell each frame; post-fx.mjs draws the film from
// the uniforms it exposes (`uniforms`), and weapon-view.mjs dips the weapon while the off hand
// is up at the visor (`handRaise`).
import * as THREE from './vendor/three.module.js';

// Seconds the coat hangs and drips before the wipe starts, and how long one wipe takes.
export const VISOR_HOLD = .75;
export const VISOR_WIPE = .55;
// How long the streaks left behind by the wipe take to clear.
export const VISOR_RESIDUE = 2.6;
const ENTER_DEPTH = .02;

export class VisorGoo {
  constructor() {
    this.uniforms = {
      gooCoat: { value: 0 },
      gooWipe: { value: -.3 },
      gooResidue: { value: 0 },
      gooInside: { value: 0 },
      gooHand: { value: 0 },
      gooSeed: { value: 0 },
      gooAge: { value: 0 },
      gooColor: { value: new THREE.Color(0xf3ece6) },
      gooTint: { value: new THREE.Color(0x8a5cb0) },
    };
    this.reset();
  }

  reset() {
    // idle → inside → coated (hanging, dripping) → wiping → residue → idle
    this.state = 'idle';
    this.timer = 0;
    this.coat = 0;
    this.inside = 0;
    this.wipe = -.3;
    this.residue = 0;
    this.age = 0;
    this.handRaise = 0;
    this.cues = [];
    this.sync();
  }

  // depth: 0 outside every cell, up to 1 at a cell's centre. cell: the colours of the cell.
  update(dt, depth, cell, reduceMotion = false) {
    const inside = depth > ENTER_DEPTH;
    this.inside = THREE.MathUtils.damp(this.inside, inside ? Math.min(1, depth * 2.4 + .35) : 0, inside ? 14 : 9, dt);
    if (inside) {
      if (this.state !== 'inside') {
        this.cues.push({ type: 'visor', stage: 'splat' });
        this.uniforms.gooSeed.value = Math.random() * 100;
        this.age = 0;
      }
      if (cell) {
        this.uniforms.gooColor.value.copy(cell.colour);
        this.uniforms.gooTint.value.copy(cell.nucleus);
      }
      this.state = 'inside';
      this.coat = Math.min(1, this.coat + dt * 5);
      this.wipe = -.3;
      this.residue = 0;
      this.timer = 0;
    } else if (this.state === 'inside') {
      this.state = 'coated';
      this.timer = 0;
    } else if (this.state === 'coated') {
      this.timer += dt;
      if (this.timer >= VISOR_HOLD) {
        this.state = 'wiping';
        this.timer = 0;
        this.cues.push({ type: 'visor', stage: 'wipe' });
      }
    } else if (this.state === 'wiping') {
      this.timer += dt;
      const t = Math.min(1, this.timer / VISOR_WIPE);
      // The glove sweeps across fast in the middle and slows at the far edge.
      this.wipe = -.3 + THREE.MathUtils.smootherstep(t, 0, 1) * 1.7;
      this.residue = 1;
      if (t >= 1) {
        this.state = 'residue';
        this.timer = 0;
        this.coat = 0;
      }
    } else if (this.state === 'residue') {
      this.timer += dt;
      this.residue = Math.max(0, 1 - this.timer / VISOR_RESIDUE);
      if (this.residue <= 0) this.state = 'idle';
    }
    // The off hand comes up just before the sweep and drops once it has crossed.
    const handTarget = this.state === 'wiping' || (this.state === 'coated' && this.timer > VISOR_HOLD - .18) ? 1 : 0;
    this.handRaise = reduceMotion ? 0 : THREE.MathUtils.damp(this.handRaise, handTarget, 16, dt);
    if (this.state !== 'idle') this.age += dt;
    this.sync(reduceMotion);
  }

  get active() {
    return this.state !== 'idle' || this.inside > .001;
  }

  // Sound cues raised since the last call, for the audio engine.
  takeCues() {
    const cues = this.cues;
    this.cues = [];
    return cues;
  }

  sync(reduceMotion = false) {
    const u = this.uniforms;
    u.gooCoat.value = this.coat;
    u.gooWipe.value = this.wipe;
    u.gooResidue.value = this.residue;
    u.gooInside.value = this.inside;
    // The out-of-focus glove crossing the lens; a plain clear when motion is reduced.
    u.gooHand.value = reduceMotion || this.state !== 'wiping' ? 0 : Math.sin(Math.min(1, this.timer / VISOR_WIPE) * Math.PI);
    u.gooAge.value = reduceMotion ? 0 : this.age;
  }
}

// The film itself: a full-screen quad drawn last in the first-person pass, so it sits on the
// visor over the world and the weapon, with or without the post-processing chain. It is lit as
// a wet layer (thickness, specular glints, drips running down), cleared along the wipe line with
// a bead of goo pushed ahead of the glove, and leaves smeared streaks behind it.
export function createVisorOverlay(uniforms) {
  Object.assign(uniforms, { gooAspect: { value: 1 }, gooTime: { value: 0 } });
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0., 1.);
      }`,
    fragmentShader: /* glsl */ `
      uniform float gooCoat, gooWipe, gooResidue, gooInside, gooHand, gooSeed, gooAge, gooAspect, gooTime;
      uniform vec3 gooColor, gooTint;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0., a = .5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= .5; }
        return v;
      }
      // Distance along the wipe: the glove sweeps left to right, leaning with the stroke.
      float wipeLine(vec2 uv) { return uv.x * .82 + (1. - uv.y) * .18; }
      // Thickness of the coat at a screen point.
      float coatAt(vec2 uv) {
        vec2 p = vec2(uv.x * gooAspect, uv.y);
        // Sagging: the film slides down and pools toward the lower rim.
        float sag = gooAge * .035;
        float blobs = fbm(p * 2.4 + vec2(gooSeed, gooSeed * .7 + sag));
        // Drips: narrow runs that creep down the visor at their own pace.
        float column = floor(p.x * 9.);
        float speed = .05 + hash(vec2(column, gooSeed)) * .12;
        float lane = smoothstep(.42, .0, abs(fract(p.x * 9.) - .5)) * step(.55, hash(vec2(column, gooSeed + 3.)));
        float run = smoothstep(.0, .35, (1. - uv.y) - (1. - hash(vec2(column, gooSeed + 7.)) * .5) + gooAge * speed);
        float drips = lane * run * (.6 + .4 * noise(vec2(p.x * 30., uv.y * 6.)));
        float rim = smoothstep(.32, .62, length((uv - .5) * vec2(gooAspect * .8, 1.)));
        float field = blobs + drips * .5 + rim * .22;
        // Patchy, not a sheet: thick globs and runs with thin film and clear gaps between them.
        float threshold = mix(1.25, .5, gooCoat);
        float coat = (smoothstep(threshold, threshold + .16, field) * .85 + smoothstep(threshold - .12, threshold, field) * .15) * gooCoat;
        // The glove's edge pushes a bead of goo ahead of it and clears the visor behind it.
        float w = wipeLine(uv);
        float cleared = smoothstep(gooWipe + .015, gooWipe - .03, w);
        float bead = exp(-pow((w - gooWipe - .025) / .03, 2.)) * gooCoat * (.6 + .4 * fbm(p * 7.));
        // Smears left behind: short, broken streaks along the stroke and a few thin smudges.
        float patches = smoothstep(.48, .72, fbm(p * 2.2 + gooSeed * 1.3));
        float streaks = smoothstep(.66, .92, noise(vec2(w * 5. + gooSeed, uv.y * 52.))) * patches;
        float smudge = smoothstep(.58, .82, fbm(p * 3.4 - gooSeed)) * .5;
        float smear = streaks * .45 + smudge * .35;
        return mix(coat, smear * gooResidue, cleared) + bead * (1. - cleared);
      }
      void main() {
        vec2 uv = vUv;
        vec4 result = vec4(0.);
        // Inside the cell: a milky, slowly churning cytoplasm with the nucleus as a dark blur.
        if (gooInside > .001) {
          vec2 p = vec2(uv.x * gooAspect, uv.y) * 2.2;
          float churn = fbm(p + vec2(gooTime * .12, -gooTime * .08) + gooSeed);
          float granules = smoothstep(.78, .92, noise(p * 9. + gooTime * .3));
          vec3 cytoplasm = mix(gooColor * .42, gooColor * .62, churn) + granules * .18;
          cytoplasm = mix(cytoplasm, gooTint * .45, smoothstep(.55, .8, fbm(p * .6 - gooSeed)) * .55);
          float edge = smoothstep(.2, .75, length(uv - .5));
          result = vec4(cytoplasm * (1. - edge * .35), gooInside * (.42 + churn * .18 + edge * .2));
        }
        float t = coatAt(uv);
        if (t > .002) {
          vec2 e = vec2(1. / 900., 0.);
          float dx = coatAt(uv + e.xy) - coatAt(uv - e.xy);
          float dy = coatAt(uv + e.yx) - coatAt(uv - e.yx);
          vec3 normal = normalize(vec3(-dx * 42., -dy * 42., 1.));
          vec3 light = normalize(vec3(-.45, .7, 1.));
          float diffuse = .55 + .45 * dot(normal, light);
          float glint = pow(max(0., dot(reflect(-light, normal), vec3(0., 0., 1.))), 36.) * smoothstep(.05, .3, t);
          // Thin film is nearly clear; thick goo goes milky and takes a little of the nucleus tint.
          vec3 body = mix(gooColor * .8, gooTint * .7, smoothstep(.6, 1.1, t) * .3) * diffuse;
          float alpha = clamp(t * .5 + length(normal.xy) * .3, 0., .72);
          vec4 film = vec4(body + glint * 1.6, clamp(alpha + glint * .5, 0., .9));
          result = vec4(mix(result.rgb, film.rgb, film.a), film.a + result.a * (1. - film.a));
        }
        // The glove crossing right in front of the lens: dark, soft-edged woven fabric.
        if (gooHand > .001) {
          // An out-of-focus gloved palm right against the lens, crossing with the wipe: a soft dark
          // shape with a bumpy leading edge of fingers and a faint lit rim, no fine detail.
          vec2 centre = vec2(gooWipe * 1.12 + .02, .5 + (gooWipe - .5) * .12);
          vec2 q = (uv - centre) * vec2(gooAspect, 1.);
          float lean = -.32;
          q = mat2(cos(lean), -sin(lean), sin(lean), cos(lean)) * q;
          float bumps = .035 * smoothstep(-.2, .35, q.y) * abs(sin(q.y * 15.)) ;
          vec2 r = vec2(.3 + bumps, .72);
          float shape = length(q / r);
          float palm = smoothstep(1.02, .72, shape);
          float rim = smoothstep(.75, .95, shape) * smoothstep(1.05, .9, shape) * smoothstep(0., .3, -q.x + q.y * .3);
          vec3 glove = vec3(.055, .06, .048) * (.85 + .3 * noise(q * 6. + gooSeed)) + vec3(.16, .14, .1) * rim * .6;
          float a = palm * gooHand * .97;
          result = vec4(mix(result.rgb, glove, a), a + result.a * (1. - a));
        }
        if (result.a <= .001) discard;
        gl_FragColor = result;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  mesh.visible = false;
  mesh.name = 'visor-goo';
  return mesh;
}
