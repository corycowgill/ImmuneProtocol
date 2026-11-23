// Light on wet tissue. Every arena is filled with fluid, so sunlight-like caustics ripple across
// the floor: a shader patch on the floor's own material adds a moving web of focused light,
// tinted by the floor's colour, on top of its normal lighting. Strength is set per arena (the
// airy lungs keep only a faint shimmer).
import * as THREE from './vendor/three.module.js';

export const CAUSTICS = Object.freeze({
  artery: [.35, 0xffc8b0], junction: [.32, 0xffc8b0], heart: [.32, 0xffb8a0],
  lungs: [.12, 0xe8f0ff], stomach: [.38, 0xf4f0b0], intestines: [.32, 0xffd0b8], colon: [.3, 0xf0e4b0],
  lymph: [.24, 0xd8e8ff], ear: [.22, 0xd0f0ff], brain: [.2, 0xe0c8ff],
});

// GLSL for the caustic web, shared with the ground patch in ground-fx.mjs.
export const CAUSTIC_GLSL = /* glsl */ `
  uniform float causticTime, causticStrength;
  uniform vec3 causticTint;
  // A tileable water-caustic web: a few iterations of folded sine flow.
  float causticWeb(vec2 p, float t) {
    vec2 i = p;
    float c = 1.0;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - 3.5 / float(n + 1));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }
`;

// Adds the caustic light at world position `world` (a vec3 expression) to the emissive term.
export function causticTerm(world) {
  return /* glsl */ `
  {
    float t = causticTime * 0.35;
    vec2 p = ${world}.xz * 0.15;
    // Warp the web so it never reads as a tiled grid.
    p += vec2(sin(p.y * 0.73 + t * 0.4) + sin(p.y * 1.9 - t * 0.3) * 0.4, cos(p.x * 0.61 - t * 0.35) + cos(p.x * 1.7 + t * 0.25) * 0.4) * 0.9;
    // Filaments finer than a pixel shimmer into moire, so the web fades out as its on-screen
    // frequency rises (distance and grazing angles) instead of aliasing.
    float footprint = length(fwidth(p));
    float web = causticWeb(p, t) * 0.75 + causticWeb(p * 1.6 + 4.0, t * 1.2) * 0.25 * (1.0 - smoothstep(0.02, 0.06, footprint));
    // Only the focused filaments add light; the rest of the floor keeps its own colour.
    web = smoothstep(0.25, 1.4, web) * (1.0 - smoothstep(0.035, 0.11, footprint));
    float fade = 1.0 - smoothstep(25.0, 60.0, length(${world}.xz - cameraPosition.xz));
    totalEmissiveRadiance += diffuseColor.rgb * causticTint * web * causticStrength * fade;
  }`;
}

export function causticUniforms(time, area) {
  const [strength, tint] = CAUSTICS[area] ?? CAUSTICS.artery;
  return { causticTime: time, causticStrength: { value: strength }, causticTint: { value: new THREE.Color(tint) } };
}

// Patches a floor material in place. `time` is a shared { value } uniform.
export function addCaustics(material, time, area) {
  const uniforms = causticUniforms(time, area);
  material.userData.caustics = uniforms;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vCausticWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vCausticWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = 'varying vec3 vCausticWorld;\n' + CAUSTIC_GLSL + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + causticTerm('vCausticWorld'));
  };
  material.customProgramCacheKey = () => 'caustics-' + area;
  material.needsUpdate = true;
  return material;
}

// Translucent tissue: light scattering through thin membranes shows as a warm glow along the
// edges a wall or fold turns away from the camera. A fresnel term on the surface's own colour,
// tinted per arena, approximates that subsurface look on the arena's walls and canopy.
export function addTissueSheen(material, tint, strength = .35, key = 'tissue') {
  const uniforms = { sheenTint: { value: new THREE.Color(tint) }, sheenStrength: { value: strength } };
  material.userData.tissueSheen = uniforms;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = 'uniform vec3 sheenTint;\nuniform float sheenStrength;\n' + shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      {
        float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.6);
        totalEmissiveRadiance += diffuseColor.rgb * sheenTint * rim * sheenStrength;
      }`);
  };
  material.customProgramCacheKey = () => 'tissue-sheen-' + key;
  material.needsUpdate = true;
  return material;
}
