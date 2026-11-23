// The cinematic image: the arena is drawn into an HDR target and finished here instead of going
// straight to the screen. Each frame:
//   1. combine   the scene (with its depth) and the first-person weapon (drawn into its own
//                target so it never picks up mist), darken creases with depth-based ambient
//                occlusion, and march a short ray through the depth buffer to lay drifting
//                volumetric mist in the low ground;
//   2. bloom     a soft-knee bright pass, then a mip chain down and back up (13-tap down, tent
//                up), so glows spread naturally around lit tissue, muzzle flashes and hazards;
//   3. finish    bloom, a gentle chromatic fringe toward the edges, ACES tone mapping at the
//                renderer's exposure, then a per-arena colour grade (tint, lift, gain,
//                saturation, contrast), vignette and fine film grain, written in sRGB.
// Only High quality uses it; Low draws straight to the screen as before.
import * as THREE from './vendor/three.module.js';

const FLOOR = /* glsl */ `
  float floorH(vec2 p) {
    return .115 * sin(p.x * .67 + p.y * .16) * cos(p.y * .46) + .075 * cos(p.y * .98 - p.x * .24) + .035 * sin(p.x * 2.8 + p.y * 1.7);
  }
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
    return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y);
  }
`;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

// Each arena's look. Tint, lift and gain are linear multipliers; mist is in metres.
const BASE = {
  bloom: .55, threshold: .95, knee: .6, saturation: 1.08, contrast: 1.06, tint: [1, 1, 1], lift: [0, 0, 0], gain: [1, 1, 1],
  ao: .65, vignette: .3, aberration: .0005, grain: .03, mist: [.55, .32, .3], mistDensity: 0.005, mistHeight: 1.1, mistReach: 45,
};
export const LOOKS = Object.freeze({
  artery: { ...BASE, saturation: .94, tint: [.98, .99, 1], lift: [.012, .004, .006], gain: [1.02, .98, .96], mist: [.62, .26, .24], mistDensity: 0.02 },
  junction: { ...BASE, saturation: .94, tint: [.98, .99, 1], lift: [.01, .003, .006], mist: [.55, .24, .24], mistDensity: 0.016 },
  heart: { ...BASE, bloom: .62, saturation: .95, tint: [1, .99, 1], lift: [.016, .002, .004], gain: [1.04, .95, .94], mist: [.6, .18, .2], mistDensity: 0.019 },
  lungs: { ...BASE, saturation: 1.02, tint: [1, .99, 1.03], lift: [.006, .004, .012], gain: [1.02, 1, 1.04], mist: [.78, .6, .66], mistDensity: 0.014, mistHeight: 1.7 },
  stomach: { ...BASE, tint: [1.03, 1.01, .93], lift: [.01, .008, 0], gain: [1.04, 1.02, .92], mist: [.62, .5, .26], mistDensity: 0.019 },
  intestines: { ...BASE, saturation: .92, tint: [.98, .99, 1.01], lift: [.012, .004, .006], mist: [.72, .4, .38], mistDensity: 0.017 },
  colon: { ...BASE, tint: [1.02, 1, .92], lift: [.008, .008, 0], gain: [1.02, 1.02, .9], mist: [.5, .44, .26], mistDensity: 0.020, mistHeight: 1.1 },
  lymph: { ...BASE, saturation: 1.04, tint: [.97, .99, 1.05], lift: [.002, .006, .014], gain: [.98, 1, 1.06], mist: [.5, .56, .7], mistDensity: 0.016, mistHeight: 1.6 },
  ear: { ...BASE, tint: [.98, 1, 1.05], lift: [.004, .008, .014], gain: [.98, 1.01, 1.05], mist: [.48, .56, .68], mistDensity: 0.016 },
  brain: { ...BASE, bloom: .68, saturation: 1.1, tint: [1, .96, 1.06], lift: [.01, .002, .02], gain: [1.02, .96, 1.06], mist: [.48, .34, .64], mistDensity: 0.017 },
});

function target(width, height, options = {}) {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, ...options,
  });
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    const samples = renderer.capabilities.isWebGL2 ? 4 : 0;
    this.sceneTarget = target(1, 1, { depthBuffer: true, samples });
    this.sceneTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.weaponTarget = target(1, 1, { depthBuffer: true, samples });
    this.hdr = target(1, 1);
    this.down = Array.from({ length: 6 }, () => target(1, 1));
    this.up = Array.from({ length: 6 }, () => target(1, 1));
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.screen = new THREE.Scene();
    this.screen.add(this.quad);
    this.look = { ...LOOKS.artery };
    this.width = this.height = 0;
    this.makeMaterials();
  }

  makeMaterials() {
    const shader = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
      uniforms, vertexShader: VERTEX, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.combine = shader(/* glsl */ `
      uniform sampler2D tScene, tDepth, tWeapon;
      uniform mat4 projectionInverse, cameraWorld;
      uniform vec3 cameraPos, mistColor;
      uniform float time, mistDensity, mistHeight, mistReach, cameraNear, cameraFar, projectionScale, aspect, aoStrength;
      varying vec2 vUv;
      ${FLOOR}
      float viewDepth(float d) { return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear)); }
      void main() {
        vec3 color = texture2D(tScene, vUv).rgb;
        float depth = texture2D(tDepth, vUv).x;
        // Ambient occlusion from the depth buffer: nearby surfaces in front of this one darken
        // creases, contacts and folds; the range cutoff keeps far objects from haloing.
        float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
        if (aoStrength > 0. && depth < 1.) {
          float z = viewDepth(depth);
          float radius = .55 * projectionScale / z;
          float occlusion = 0.;
          for (int i = 0; i < 8; i++) {
            float a = (float(i) + jitter) * 2.39996;
            float r = radius * (float(i) + 1.) / 8.;
            vec2 offset = vec2(cos(a) / aspect, sin(a)) * r;
            float d = viewDepth(texture2D(tDepth, vUv + offset).x);
            float closer = z - d;
            occlusion += smoothstep(.04, .3, closer) * (1. - smoothstep(.9, 1.8, closer));
          }
          color *= 1. - aoStrength * occlusion / 8.;
        }
        vec4 view = projectionInverse * vec4(vUv * 2. - 1., depth * 2. - 1., 1.);
        view /= view.w;
        vec3 world = (cameraWorld * vec4(view.xyz, 1.)).xyz;
        vec3 ray = world - cameraPos;
        float dist = length(ray);
        vec3 dir = ray / max(dist, 1e-4);
        float reach = min(dist, mistReach);
        // The same interleaved-gradient jitter hides the mist march's steps.
        float amount = 0.;
        for (int i = 0; i < 6; i++) {
          vec3 p = cameraPos + dir * ((float(i) + jitter) / 6. * reach);
          float height = max(0., p.y - floorH(p.xz));
          float drift = vnoise(p.xz * .085 + vec2(time * .05, time * .03)) * .75 + vnoise(p.xz * .26 - vec2(time * .09, -time * .04)) * .45;
          amount += exp(-height / mistHeight) * (.25 + drift);
        }
        float mist = 1. - exp(-amount * reach / 6. * mistDensity);
        color = mix(color, mistColor * (.45 + .55 * min(1., length(color) * 1.5)), mist * .7);
        vec4 weapon = texture2D(tWeapon, vUv);
        color = color * (1. - weapon.a) + weapon.rgb;
        gl_FragColor = vec4(color, 1.);
      }
    `, {
      tScene: { value: null }, tDepth: { value: null }, tWeapon: { value: null },
      projectionInverse: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() },
      cameraPos: { value: new THREE.Vector3() }, mistColor: { value: new THREE.Color() },
      time: { value: 0 }, mistDensity: { value: 0 }, mistHeight: { value: 1 }, mistReach: { value: 50 },
      cameraNear: { value: .1 }, cameraFar: { value: 100 }, projectionScale: { value: 1 }, aspect: { value: 1 }, aoStrength: { value: .6 },
    });
    this.prefilter = shader(/* glsl */ `
      uniform sampler2D tInput; uniform vec2 texel; uniform float threshold, knee;
      varying vec2 vUv;
      vec3 tap(vec2 o) { return texture2D(tInput, vUv + o * texel).rgb; }
      void main() {
        vec3 c = (tap(vec2(-1., -1.)) + tap(vec2(1., -1.)) + tap(vec2(-1., 1.)) + tap(vec2(1., 1.))) * .25;
        float bright = max(c.r, max(c.g, c.b));
        float soft = clamp(bright - threshold + knee, 0., 2. * knee);
        soft = soft * soft / (4. * knee + 1e-4);
        float weight = max(soft, bright - threshold) / max(bright, 1e-4);
        // Clamp fireflies so a single hot pixel cannot bloom across the screen.
        gl_FragColor = vec4(min(c * weight, vec3(24.)), 1.);
      }
    `, { tInput: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: .5 } });
    this.downsample = shader(/* glsl */ `
      uniform sampler2D tInput; uniform vec2 texel;
      varying vec2 vUv;
      vec3 tap(vec2 o) { return texture2D(tInput, vUv + o * texel).rgb; }
      void main() {
        vec3 a = tap(vec2(-2., -2.)), b = tap(vec2(0., -2.)), c = tap(vec2(2., -2.));
        vec3 d = tap(vec2(-1., -1.)), e = tap(vec2(1., -1.));
        vec3 f = tap(vec2(-2., 0.)), g = tap(vec2(0., 0.)), h = tap(vec2(2., 0.));
        vec3 i = tap(vec2(-1., 1.)), j = tap(vec2(1., 1.));
        vec3 k = tap(vec2(-2., 2.)), l = tap(vec2(0., 2.)), m = tap(vec2(2., 2.));
        vec3 color = (d + e + i + j) * .125 + (a + b + g + f) * .03125 + (b + c + h + g) * .03125 + (f + g + l + k) * .03125 + (g + h + m + l) * .03125;
        gl_FragColor = vec4(color, 1.);
      }
    `, { tInput: { value: null }, texel: { value: new THREE.Vector2() } });
    this.upsample = shader(/* glsl */ `
      uniform sampler2D tInput, tBase; uniform vec2 texel; uniform float radius;
      varying vec2 vUv;
      vec3 tap(vec2 o) { return texture2D(tInput, vUv + o * texel * radius).rgb; }
      void main() {
        vec3 tent = tap(vec2(0.)) * 4. + (tap(vec2(-1., 0.)) + tap(vec2(1., 0.)) + tap(vec2(0., -1.)) + tap(vec2(0., 1.))) * 2.
          + tap(vec2(-1., -1.)) + tap(vec2(1., -1.)) + tap(vec2(-1., 1.)) + tap(vec2(1., 1.));
        gl_FragColor = vec4(texture2D(tBase, vUv).rgb + tent / 16., 1.);
      }
    `, { tInput: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    this.finish = shader(/* glsl */ `
      uniform sampler2D tInput, tBloom;
      uniform vec2 resolution;
      uniform float time, exposure, bloom, saturation, contrast, vignette, aberration, grain, rush, focus;
      uniform vec3 tint, lift, gain;
      varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v) {
        vec3 a = v * (v + .0245786) - .000090537;
        vec3 b = v * (.983729 * v + .4329510) + .238081;
        return a / b;
      }
      vec3 aces(vec3 color) {
        const mat3 inputMat = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
        const mat3 outputMat = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
        color *= exposure / .6;
        return clamp(outputMat * RRTAndODTFit(inputMat * color), 0., 1.);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(vec3(.0031308), c));
      }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 centered = vUv - .5;
        float edge = dot(centered, centered);
        // A faint lens fringe that grows toward the corners.
        vec2 shift = centered * edge * aberration * 40.;
        vec3 color = vec3(texture2D(tInput, vUv - shift).r, texture2D(tInput, vUv).g, texture2D(tInput, vUv + shift).b);
        // A dash smears the frame outward from the centre: a short radial blur that spares the middle.
        if (rush > .001) {
          vec3 streak = color;
          float reach = rush * .055 * smoothstep(.02, .3, edge);
          for (int i = 1; i <= 6; i++) streak += texture2D(tInput, vUv - centered * reach * float(i) / 6.).rgb;
          color = streak / 7.;
        }
        color += texture2D(tBloom, vUv).rgb * bloom;
        color *= tint;
        color = aces(color);
        color = lift + color * (gain - lift);
        float luma = dot(color, vec3(.2126, .7152, .0722));
        color = mix(vec3(luma), color, saturation);
        color = (color - .5) * contrast + .5;
        // A dodged hit: the world drains toward cold steel for a moment, the centre stays sharp.
        color = mix(color, vec3(luma) * vec3(.82, .96, 1.12), focus * .7 * smoothstep(.0, .25, edge));
        color *= 1. - (vignette + focus * .35) * smoothstep(.12, .62, edge * 1.6);
        color = clamp(color, 0., 1.);
        vec3 display = toSRGB(color);
        display += (hash(gl_FragCoord.xy + fract(time * 37.) * 311.) - .5) * grain;
        gl_FragColor = vec4(display, 1.);
      }
    `, {
      tInput: { value: null }, tBloom: { value: null }, resolution: { value: new THREE.Vector2() },
      time: { value: 0 }, exposure: { value: 1 }, bloom: { value: .5 }, saturation: { value: 1 }, contrast: { value: 1 },
      vignette: { value: .3 }, aberration: { value: 0 }, grain: { value: 0 }, rush: { value: 0 }, focus: { value: 0 },
      tint: { value: new THREE.Vector3(1, 1, 1) }, lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) },
    });
  }

  setArea(area) {
    this.look = { ...(LOOKS[area] ?? LOOKS.artery) };
  }

  setSize(width, height) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.sceneTarget.setSize(width, height);
    this.weaponTarget.setSize(width, height);
    this.hdr.setSize(width, height);
    let w = width, h = height;
    for (let i = 0; i < this.down.length; i++) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      this.down[i].setSize(w, h);
      this.up[i].setSize(w, h);
    }
  }

  pass(material, output) {
    this.quad.material = material;
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.screen, this.camera);
  }

  // Draws the arena and weapon through the pipeline to the screen.
  render(scene, camera, weaponScene, weaponCamera, time, reduceMotion) {
    const { renderer } = this;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);
    // The weapon: its own target, cleared transparent, so it is laid over the misted arena.
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.weaponTarget);
    renderer.clear();
    renderer.render(weaponScene, weaponCamera);
    renderer.setClearColor(clear, alpha);

    const look = this.look;
    const combine = this.combine.uniforms;
    combine.tScene.value = this.sceneTarget.texture;
    combine.tDepth.value = this.sceneTarget.depthTexture;
    combine.tWeapon.value = this.weaponTarget.texture;
    combine.projectionInverse.value.copy(camera.projectionMatrixInverse);
    combine.cameraWorld.value.copy(camera.matrixWorld);
    camera.getWorldPosition(combine.cameraPos.value);
    combine.time.value = reduceMotion ? 0 : time;
    combine.mistColor.value.setRGB(...look.mist);
    combine.mistDensity.value = look.mistDensity;
    combine.mistHeight.value = look.mistHeight;
    combine.mistReach.value = look.mistReach;
    combine.cameraNear.value = camera.near;
    combine.cameraFar.value = camera.far;
    combine.projectionScale.value = camera.projectionMatrix.elements[5] * .5;
    combine.aspect.value = camera.aspect;
    const options = this.options ?? {};
    combine.aoStrength.value = options.ao === false ? 0 : look.ao;
    this.pass(this.combine, this.hdr);

    const pre = this.prefilter.uniforms;
    pre.tInput.value = this.hdr.texture;
    pre.texel.value.set(1 / this.width, 1 / this.height);
    pre.threshold.value = look.threshold;
    pre.knee.value = look.knee;
    this.pass(this.prefilter, this.down[0]);
    for (let i = 1; i < this.down.length; i++) {
      const source = this.down[i - 1];
      this.downsample.uniforms.tInput.value = source.texture;
      this.downsample.uniforms.texel.value.set(1 / source.width, 1 / source.height);
      this.pass(this.downsample, this.down[i]);
    }
    let previous = this.down[this.down.length - 1];
    for (let i = this.down.length - 2; i >= 0; i--) {
      const up = this.upsample.uniforms;
      up.tInput.value = previous.texture;
      up.tBase.value = this.down[i].texture;
      up.texel.value.set(1 / previous.width, 1 / previous.height);
      this.pass(this.upsample, this.up[i]);
      previous = this.up[i];
    }

    const finish = this.finish.uniforms;
    finish.tInput.value = this.hdr.texture;
    finish.tBloom.value = this.up[0].texture;
    finish.resolution.value.set(this.width, this.height);
    finish.time.value = reduceMotion ? 0 : time;
    finish.exposure.value = renderer.toneMappingExposure;
    finish.bloom.value = options.bloom === false ? 0 : look.bloom / this.down.length;
    finish.saturation.value = look.saturation;
    finish.contrast.value = look.contrast;
    finish.vignette.value = options.vignette === false ? 0 : look.vignette;
    finish.aberration.value = reduceMotion || options.aberration === false ? 0 : look.aberration;
    finish.grain.value = reduceMotion || options.grain === false ? 0 : look.grain;
    finish.rush.value = reduceMotion ? 0 : this.rush ?? 0;
    finish.focus.value = this.focus ?? 0;
    finish.tint.value.set(...look.tint);
    finish.lift.value.set(...look.lift);
    finish.gain.value.set(...look.gain);
    this.pass(this.finish, null);
    renderer.autoClear = autoClear;
  }

  dispose() {
    for (const item of [this.sceneTarget, this.weaponTarget, this.hdr, ...this.down, ...this.up]) item.dispose();
    for (const material of [this.combine, this.prefilter, this.downsample, this.upsample, this.finish]) material.dispose();
  }
}
