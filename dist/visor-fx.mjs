// Goo on the suit's visor. Swimming through a white blood cell floods the view with its milky
// cytoplasm; leaving it leaves a coat of plasm on the visor that sags and drips for a moment
// before the suit's glove wipes it away, leaving smeared streaks that thin out and clear.
// A pathogen that pounces onto the suit splats its own fluid across the visor the same way; the
// goo stays while the pathogen is still on the suit and is wiped once the suit is free.
// World feeds it the camera's depth inside a cell and whether a pathogen is on the suit each
// frame, and calls `splat` when an attack lands; post-fx.mjs draws the film from
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
      // 0 for an even coat (a cell), 1 for a splat that is thickest where it struck.
      gooFocus: { value: 0 },
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
    this.forcedInside = 0;
    this.forcedCell = null;
    this.cues = [];
    this.sync();
  }

  // A pathogen's attack landed on the suit: its fluid (colour, and a darker tint where it is
  // thick) splats over the visor. Splats stack up to a full coat.
  splat(colour, tint, amount = .75) {
    if (this.state === 'inside') return;
    const fresh = this.state === 'idle' || this.state === 'residue' || this.state === 'wiping';
    if (fresh) {
      this.uniforms.gooSeed.value = Math.random() * 100;
      this.uniforms.gooColor.value.copy(colour);
      this.uniforms.gooTint.value.copy(tint);
      this.uniforms.gooFocus.value = 1;
      this.age = 0;
      this.coat = 0;
    }
    this.coat = Math.min(1, this.coat + amount);
    this.state = 'coated';
    this.timer = 0;
    this.wipe = -.3;
    this.residue = 0;
    this.cues.push({ type: 'visor', stage: 'splat' });
  }

  // Engulfed by the Rogue Macrophage: a moment inside its cytoplasm, as when swimming through a
  // white blood cell, then the coat it leaves on the way out.
  engulf(colour, nucleus, seconds = 1.1) {
    this.forcedInside = seconds;
    this.forcedCell = { colour, nucleus };
  }

  // depth: 0 outside every cell, up to 1 at a cell's centre. cell: the colours of the cell.
  // held: a pathogen is still on the suit, so the goo stays put until it lets go.
  update(dt, depth, cell, reduceMotion = false, held = false) {
    if (this.forcedInside > 0) {
      this.forcedInside -= dt;
      depth = Math.max(depth, .45);
      cell = this.forcedCell;
    }
    const inside = depth > ENTER_DEPTH;
    this.inside = THREE.MathUtils.damp(this.inside, inside ? Math.min(1, depth * 2.4 + .35) : 0, inside ? 14 : 9, dt);
    if (inside) {
      if (this.state !== 'inside') {
        this.cues.push({ type: 'visor', stage: 'splat' });
        this.uniforms.gooSeed.value = Math.random() * 100;
        this.uniforms.gooFocus.value = 0;
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
      // Still in the pathogen's grip: the goo hangs there until the suit is free.
      this.timer = held ? 0 : this.timer + dt;
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

// Cracks in the visor glass as the suit loses integrity. Each crack belongs to an integrity
// level: it splinters across the glass the moment the suit falls to that level and is sealed
// (a glow of sealant along its lines, then gone) once healing lifts the suit back above it.
// The first cracks sit toward the edges of the glass; only a badly damaged suit cracks near the
// middle of the view. World feeds it the suit's integrity each frame.
export const CRACK_LEVELS = Object.freeze([70, 52, 36, 22, 10]);
// Where each level's crack strikes (screen 0..1, y up) and how large it grows.
const CRACK_SITES = [[.16, .7, .42], [.86, .28, .46], [.24, .18, .5], [.8, .8, .52], [.5, .36, .58]];
export const CRACK_SEAL = .8;

export class VisorCracks {
  constructor() {
    this.uniforms = {
      crackShape: { value: CRACK_SITES.map(() => new THREE.Vector4()) },
      crackState: { value: CRACK_SITES.map(() => new THREE.Vector4()) },
    };
    this.reset();
  }

  reset(seed = Math.random() * 100) {
    this.seed = seed;
    this.cracks = CRACK_LEVELS.map((level, index) => {
      const [x, y, size] = CRACK_SITES[index];
      const jitter = k => Math.sin(seed * (index + 1) * 12.9898 + k * 78.233) * .5;
      return { level, x: x + jitter(1) * .08, y: y + jitter(2) * .08, size: size * (1 + jitter(3) * .2), seed: seed + index * 7.3, shown: 0, sealing: 0 };
    });
    this.cues = [];
    this.sync();
  }

  update(dt, integrity) {
    // A downed suit keeps the glass it went down with until it is back up.
    const downed = integrity <= 0;
    for (const crack of this.cracks) {
      if (downed) {
        crack.age = (crack.age ?? 0) + dt;
        continue;
      }
      const broken = integrity <= crack.level;
      if (broken && crack.shown === 0) {
        crack.shown = 1;
        crack.sealing = 0;
        crack.age = 0;
        this.cues.push({ type: 'visor', stage: 'crack' });
      } else if (!broken && crack.shown > 0 && crack.sealing === 0) {
        crack.sealing = 1e-6;
        this.cues.push({ type: 'visor', stage: 'seal' });
      } else if (broken && crack.sealing > 0) {
        // Hit again before the seal finished: the crack opens back up.
        crack.sealing = 0;
        crack.shown = 1;
      }
      crack.age = (crack.age ?? 0) + dt;
      if (crack.sealing > 0) {
        crack.sealing = Math.min(1, crack.sealing + dt / CRACK_SEAL);
        if (crack.sealing >= 1) crack.shown = crack.sealing = 0;
      }
    }
    this.sync();
  }

  get active() {
    return this.cracks.some(crack => crack.shown > 0);
  }

  takeCues() {
    const cues = this.cues;
    this.cues = [];
    return cues;
  }

  sync() {
    this.cracks.forEach((crack, index) => {
      this.uniforms.crackShape.value[index].set(crack.x, crack.y, crack.size, crack.seed);
      // Visibility, sealant glow, and a brief white flash as the glass gives.
      const fade = crack.sealing > 0 ? 1 - THREE.MathUtils.smoothstep(crack.sealing, .45, 1) : 1;
      const glow = crack.sealing > 0 ? Math.sin(Math.min(1, crack.sealing / .7) * Math.PI) : 0;
      const flash = crack.shown > 0 && crack.sealing === 0 ? Math.max(0, 1 - (crack.age ?? 1) / .18) : 0;
      this.uniforms.crackState.value[index].set(crack.shown * fade, glow, flash, 0);
    });
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
      uniform float gooFocus;
      uniform vec4 crackShape[${CRACK_LEVELS.length}], crackState[${CRACK_LEVELS.length}];
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
        // A splat is thickest where the pathogen struck, the middle of the visor, and spatters out.
        float strike = 1. - smoothstep(.05, .55, length((uv - vec2(.5, .52)) * vec2(gooAspect * .75, 1.)));
        float field = blobs + drips * .5 + rim * .22 * (1. - gooFocus) + strike * gooFocus * .5;
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
        // Cracks in the glass itself, over everything outside the visor.
        for (int i = 0; i < ${CRACK_LEVELS.length}; i++) {
          if (crackState[i].x <= .001) continue;
          vec4 c = crackShape[i];
          vec2 q = (uv - c.xy) * vec2(gooAspect, 1.) / c.z;
          float r = length(q), a = atan(q.y, q.x);
          float px = fwidth(r) * 1.1;
          float lines = 0.;
          // Rays splintering out from the strike, each kinked and ending at its own reach.
          for (int k = 0; k < 8; k++) {
            float fk = float(k);
            float angle = (fk + hash(vec2(c.w, fk)) * .7) / 8. * 6.2831853 - 3.14159265;
            float reach = .35 + hash(vec2(fk, c.w + 1.)) * .65;
            // Straight runs with sharp kinks, as glass fractures: the angle offset is interpolated
            // linearly between a few random points along the ray, not smoothed.
            float run = r * 5.;
            float bend = mix(hash(vec2(floor(run), fk + c.w)), hash(vec2(floor(run) + 1., fk + c.w)), fract(run)) * .16 - .08;
            float da = mod(a - angle - bend + 3.14159265, 6.2831853) - 3.14159265;
            float d = abs(da) * r;
            float width = px * (1.6 - r / reach);
            lines = max(lines, (1. - smoothstep(width * .4, width + px, d)) * (1. - smoothstep(reach * .85, reach, r)));
          }
          // Concentric web segments between the rays, and a crushed spot at the strike.
          for (int k = 0; k < 2; k++) {
            float seg = a * 2.2;
            float ring = .16 + float(k) * .17 + (mix(hash(vec2(floor(seg), c.w + float(k))), hash(vec2(floor(seg) + 1., c.w + float(k))), fract(seg)) - .5) * .05;
            float piece = step(.45, noise(vec2(a * 2.6 + float(k) * 5., c.w)));
            lines = max(lines, (1. - smoothstep(px * .5, px * 1.6, abs(r - ring))) * piece * .8);
          }
          float crush = (1. - smoothstep(.0, .06, r)) * (.5 + .5 * noise(q * 90.));
          lines = max(lines, crush);
          vec4 s = crackState[i];
          // Bright where the fracture catches the light, with a faint dark seam beside it.
          vec3 glass = mix(vec3(.86, .92, 1.), vec3(.45, 1., .7), min(1., s.y * 1.6)) * (1. + s.z * 2. + s.y * .25);
          float a1 = clamp(lines * (.5 + s.z * .4 + s.y * .3) * s.x, 0., .9);
          result = vec4(mix(result.rgb, glass, a1), a1 + result.a * (1. - a1));
          float halo = (1. - smoothstep(.0, .5, r)) * .06 * s.x;
          result = vec4(mix(result.rgb, vec3(.8, .85, .9), halo), halo + result.a * (1. - halo));
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
