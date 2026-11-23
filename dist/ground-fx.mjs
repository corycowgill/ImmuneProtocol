// The arena floor, made to read as one continuous living surface instead of a repeating tile.
//
// paintGround() paints two unique textures for each arena as it loads, stretched once over the
// whole floor so nothing in them repeats:
//   macro  RGB colour variation: broad blotches, stains and bruises, branching vein networks
//          (densest around the tissue nodes), worn tracks from the walls to every node, and
//          healed scars along the walls. 0.5 is neutral; the shader multiplies by twice it.
//   mask   R contact shadow (around obstacles, nodes and the wall base), G where the second
//          tissue material shows through, B wetness (low ground, puddles, around the nodes),
//          A a vein mask for the arenas whose vessels glow.
//
// patchGround() rewrites how the floor material samples its own textures:
//   - anti-tiling: each sample picks between two offsets of the tile by a slowly varying noise
//     index and blends them where they differ least, so the 4.6 m tile never lines up into a grid;
//   - a second tissue material, a different surface texture at its own scale and angle with the
//     arena's own tint, blended by height so it settles into the crevices rather than cross-fading;
//   - bump strength that varies across the floor, so smooth glossy sheets sit beside ridged tissue;
//   - the macro colour and contact shadow on top;
//   - wetness: darker, glossier, smoother tissue with a full clear coat in the puddles;
//   - a fine detail normal that fades in only within a few metres of the camera;
//   - the floor caustics (surface-fx.mjs) and, in the brain and inner ear, faintly glowing veins.
import * as THREE from './vendor/three.module.js';
import { CAUSTIC_GLSL, causticTerm, causticUniforms } from './surface-fx.mjs';
import { floorHeight } from './arena-scene.mjs';
import { ARENA_GROWTH } from './arena-scale.mjs';
import { bioTexture } from './bio-textures.mjs';

const TAU = Math.PI * 2;
// Half the floor plane's size (arena-scene.mjs builds it 8 m larger than the chamber).
export const GROUND_EXTENT = Object.freeze([Math.round(51 * ARENA_GROWTH) + 4, Math.round(71 * ARENA_GROWTH) + 4]);
const CHAMBER = [Math.round(51 * ARENA_GROWTH), Math.round(71 * ARENA_GROWTH)];

// Each arena's ground palette: vein and stain colours and the second material's tint are
// multipliers on the floor's own colour; wet is how much of the floor is glossy.
export const GROUND = Object.freeze({
  artery: { vein: [.5, .16, .18], stain: [.62, .32, .32], second: [.95, .62, .58], surface: 'neural', wet: .5, veins: 80 },
  junction: { vein: [.5, .16, .18], stain: [.62, .32, .32], second: [.95, .62, .58], surface: 'neural', wet: .45, veins: 70 },
  heart: { vein: [.46, .14, .16], stain: [.58, .28, .3], second: [.9, .56, .52], surface: 'neural', wet: .5, veins: 60 },
  lungs: { vein: [.72, .3, .42], stain: [.92, .78, .84], second: [1.06, .88, .92], surface: 'neural', wet: .15, veins: 90 },
  stomach: { vein: [.6, .3, .2], stain: [.86, .72, .42], second: [1.1, 1, .7], surface: 'biofilm', wet: .65, veins: 50 },
  intestines: { vein: [.68, .26, .28], stain: [.9, .7, .64], second: [1.06, .9, .84], surface: 'leukocyte', wet: .55, veins: 70 },
  colon: { vein: [.5, .34, .2], stain: [.62, .64, .36], second: [.86, .8, .56], surface: 'neural', wet: .55, veins: 50 },
  lymph: { vein: [.55, .5, .76], stain: [.82, .82, .96], second: [1, 1, 1.08], surface: 'neural', wet: .3, veins: 60 },
  ear: { vein: [.48, .58, .8], stain: [.82, .9, 1], second: [.96, 1, 1.1], surface: 'neural', wet: .3, veins: 60, glow: [.015, .12, .18] },
  brain: { vein: [.55, .34, .8], stain: [.82, .7, .95], second: [.95, .86, 1.08], surface: 'leukocyte', wet: .35, veins: 90, glow: [.2, .06, .34] },
});

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Paints an arena's macro and mask textures. Returns null where there is no canvas (tests).
export function paintGround(area, { nodes = [], obstacles = [], size = 2048 } = {}) {
  if (typeof document === 'undefined') return null;
  const palette = GROUND[area] ?? GROUND.artery;
  const random = seeded([...area].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 101) >>> 0);
  const [hx, hz] = GROUND_EXTENT;
  const canvas = (width) => {
    const element = document.createElement('canvas');
    element.width = element.height = width;
    return [element, element.getContext('2d')];
  };
  // World metres to pixels on a canvas `width` wide.
  const px = (x, width) => (x + hx) / (2 * hx) * width;
  const pz = (z, width) => (z + hz) / (2 * hz) * width;
  const mx = width => width / (2 * hx);
  const rgb = (c, alpha) => `rgba(${Math.round(c[0] * 128)},${Math.round(c[1] * 128)},${Math.round(c[2] * 128)},${alpha})`;
  const blob = (ctx, width, x, z, radius, color, alpha) => {
    const cx = px(x, width), cz = pz(z, width), r = Math.max(1, radius * mx(width));
    const gradient = ctx.createRadialGradient(cx, cz, 0, cx, cz, r);
    gradient.addColorStop(0, typeof color === 'string' ? color : rgb(color, alpha));
    gradient.addColorStop(1, typeof color === 'string' ? color.replace(/[\d.]+\)$/, '0)') : rgb(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Squash by the floor's aspect so blobs stay round in metres.
    ctx.ellipse(cx, cz, r, r * hx / hz, 0, 0, TAU);
    ctx.fill();
  };
  const inFloor = () => {
    const a = random() * TAU, r = Math.sqrt(random()) * .97;
    return [Math.cos(a) * CHAMBER[0] * r, Math.sin(a) * CHAMBER[1] * r];
  };

  // ---- Colour ----
  const [colorCanvas, color] = canvas(size);
  color.fillStyle = 'rgb(128,128,128)';
  color.fillRect(0, 0, size, size);
  for (let i = 0; i < 240; i++) {
    const [x, z] = inFloor();
    const shade = .66 + random() * .66;
    const hue = [shade * (1 + (random() - .5) * .1), shade * (1 + (random() - .5) * .1), shade * (1 + (random() - .5) * .1)];
    blob(color, size, x, z, 3 + random() * 14, hue, .45);
  }
  // Stains and bruises: clusters of the stain colour.
  for (let i = 0; i < 46; i++) {
    const [x, z] = inFloor();
    for (let k = 0; k < 6; k++) {
      blob(color, size, x + (random() - .5) * 5, z + (random() - .5) * 5, 1 + random() * 3.5, palette.stain, .55);
    }
  }
  // Worn tracks from the wall toward every node, where the pathogens come in.
  color.lineCap = color.lineJoin = 'round';
  const tracks = [];
  for (const node of nodes) {
    for (let i = 0; i < 4; i++) {
      const a = random() * TAU;
      let x = Math.cos(a) * CHAMBER[0] * .95, z = Math.sin(a) * CHAMBER[1] * .95;
      const points = [[x, z]];
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        x += (node.x - x) * .18 + (random() - .5) * 3;
        z += (node.z - z) * .18 + (random() - .5) * 3;
        if (t > .92) break;
        points.push([x, z]);
      }
      tracks.push(points);
    }
  }
  for (const [width, alpha] of [[3.4, .16], [2.1, .2], [1.1, .22]]) {
    color.lineWidth = width * mx(size);
    color.strokeStyle = rgb([.74, .7, .7], alpha);
    for (const points of tracks) {
      color.beginPath();
      points.forEach(([x, z], index) => (index ? color.lineTo : color.moveTo).call(color, px(x, size), pz(z, size)));
      color.stroke();
    }
  }
  // Vein networks: branching vessels, densest around the nodes.
  const [veinCanvas, veinMask] = canvas(size / 2);
  veinMask.fillStyle = '#000';
  veinMask.fillRect(0, 0, size / 2, size / 2);
  veinMask.lineCap = veinMask.lineJoin = 'round';
  const vein = (x, z, angle, width, length, depth) => {
    const points = [[x, z]];
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      angle += (random() - .5) * .7;
      x += Math.cos(angle) * length / steps;
      z += Math.sin(angle) * length / steps;
      points.push([x, z]);
    }
    for (const [ctx, width2, style, spread] of [[color, size, rgb(palette.vein, .3), 2.8], [color, size, rgb(palette.vein, .8), 1.3], [veinMask, size / 2, 'rgba(255,255,255,.8)', .8]]) {
      ctx.lineWidth = Math.max(.7, width * mx(width2) * spread);
      ctx.strokeStyle = style;
      ctx.beginPath();
      points.forEach(([a, b], index) => (index ? ctx.lineTo : ctx.moveTo).call(ctx, px(a, width2), pz(b, width2)));
      ctx.stroke();
    }
    if (depth <= 0 || width < .03) return;
    const branches = 1 + (random() < .6 ? 1 : 0);
    for (let b = 0; b < branches; b++) {
      const [bx, bz] = points[2 + Math.floor(random() * (points.length - 3))];
      vein(bx, bz, angle + (random() < .5 ? -1 : 1) * (.4 + random() * .7), width * .62, length * .72, depth - 1);
    }
    vein(x, z, angle + (random() - .5) * .5, width * .7, length * .8, depth - 1);
  };
  for (const node of nodes) {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + random() * .5;
      vein(node.x + Math.cos(a) * 3.5, node.z + Math.sin(a) * 3.5, a, .32, 9 + random() * 6, 4);
    }
  }
  for (let i = 0; i < palette.veins; i++) {
    const [x, z] = inFloor();
    vein(x, z, random() * TAU, .12 + random() * .2, 4 + random() * 8, 3);
  }
  // Healed scars along the wall base.
  for (let i = 0; i < 40; i++) {
    const a = random() * TAU, r = .9 + random() * .08;
    const x = Math.cos(a) * CHAMBER[0] * r, z = Math.sin(a) * CHAMBER[1] * r;
    color.lineWidth = (.25 + random() * .4) * mx(size);
    color.strokeStyle = rgb([1.2, 1.12, 1.1], .35);
    color.beginPath();
    color.moveTo(px(x, size), pz(z, size));
    const along = a + Math.PI / 2 + (random() - .5) * .6, length = 1.5 + random() * 3;
    color.quadraticCurveTo(px(x + Math.cos(along) * length * .5 + (random() - .5), size), pz(z + Math.sin(along) * length * .5 + (random() - .5), size),
      px(x + Math.cos(along) * length, size), pz(z + Math.sin(along) * length, size));
    color.stroke();
  }

  // ---- Masks (half resolution) ----
  const half = size / 2;
  const [aoCanvas, ao] = canvas(half);
  ao.fillStyle = '#fff';
  ao.fillRect(0, 0, half, half);
  for (const [x, z, radius] of obstacles) {
    blob(ao, half, x, z, radius + 3.2, 'rgba(0,0,0,.55)');
    blob(ao, half, x, z, radius + 1.1, 'rgba(0,0,0,.5)');
  }
  for (const node of nodes) blob(ao, half, node.x, node.z, 4.2, 'rgba(0,0,0,.42)');
  const [blendCanvas, blend] = canvas(half);
  blend.fillStyle = '#000';
  blend.fillRect(0, 0, half, half);
  for (let i = 0; i < 130; i++) {
    const [x, z] = inFloor();
    blob(blend, half, x, z, 4 + random() * 13, 'rgba(255,255,255,.45)');
  }
  for (const [x, z, radius] of obstacles) blob(blend, half, x, z, radius + 4, 'rgba(255,255,255,.5)');
  const [wetCanvas, wet] = canvas(half);
  wet.fillStyle = '#000';
  wet.fillRect(0, 0, half, half);
  for (let i = 0; i < 70; i++) {
    const [x, z] = inFloor();
    for (let k = 0; k < 3; k++) blob(wet, half, x + (random() - .5) * 3, z + (random() - .5) * 3, .8 + random() * 3.5, 'rgba(255,255,255,.7)');
  }
  for (const node of nodes) blob(wet, half, node.x, node.z, 6, 'rgba(255,255,255,.45)');

  // Combine the masks, adding the wall's contact shadow and wetness that pools in low ground.
  const read = c => c.getContext('2d').getImageData(0, 0, half, half).data;
  const [aoData, blendData, wetData, veinData] = [read(aoCanvas), read(blendCanvas), read(wetCanvas), read(veinCanvas)];
  const data = new Uint8Array(half * half * 4);
  for (let j = 0; j < half; j++) {
    const z = (j + .5) / half * 2 * hz - hz;
    for (let i = 0; i < half; i++) {
      const x = (i + .5) / half * 2 * hx - hx;
      const o = (j * half + i) * 4;
      const rim = Math.hypot(x / CHAMBER[0], z / CHAMBER[1]);
      const wallShadow = 1 - Math.min(1, Math.max(0, (rim - .86) / .12)) * .6;
      const low = Math.min(1, Math.max(0, (-.05 - floorHeight(x, z)) / .15));
      data[o] = aoData[o] * wallShadow;
      data[o + 1] = blendData[o];
      data[o + 2] = Math.min(255, wetData[o] + (palette.wet * .35 + low * .55 * palette.wet) * 255);
      data[o + 3] = veinData[o];
    }
  }
  const macro = new THREE.CanvasTexture(colorCanvas);
  const mask = new THREE.DataTexture(data, half, half);
  // Both are laid out with row 0 at the floor's -z edge, as the shader reads them.
  macro.flipY = false;
  for (const texture of [macro, mask]) {
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }
  // The second tissue's own surface texture (bio-textures.mjs), tiled like the first.
  const second = bioTexture(palette.surface ?? 'neural', [1, 1]);
  second.wrapS = second.wrapT = THREE.RepeatWrapping;
  return { macro, mask, second };
}

const GROUND_GLSL = /* glsl */ `
  varying vec3 vGroundWorld;
  uniform sampler2D groundMacro, groundMask, groundSecondMap;
  uniform vec2 groundExtent;
  uniform vec3 groundSecond, groundGlow;
  uniform float groundOn, groundDetail;
  float groundHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float groundNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
    return mix(mix(groundHash(i), groundHash(i + vec2(1., 0.)), u.x), mix(groundHash(i + vec2(0., 1.)), groundHash(i + vec2(1., 1.)), u.x), u.y);
  }
  // Repetition-free sampling: pick one of eight offsets of the tile by a slowly varying index and
  // blend the two nearest where they differ least (after Inigo Quilez, "texture repetition").
  vec4 textureNoTile(sampler2D samp, vec2 uv) {
    float k = groundNoise(uv * .35);
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    float l = k * 8.;
    float f = fract(l);
    float ia = floor(l), ib = ia + 1.;
    vec4 a = textureGrad(samp, uv + sin(vec2(3., 7.) * ia), dx, dy);
    vec4 b = textureGrad(samp, uv + sin(vec2(3., 7.) * ib), dx, dy);
    return mix(a, b, smoothstep(.2, .8, f - .1 * dot(a - b, vec4(1.))));
  }
`;

const MAP_FRAGMENT = /* glsl */ `
  float groundWet = 0., groundShade = 1., groundBlend = 0.;
  vec4 groundMaskValue = vec4(1., 0., 0., 0.);
  #ifdef USE_MAP
    vec2 macroUv = (vGroundWorld.xz + groundExtent) / (2. * groundExtent);
    vec4 macroValue = groundOn > .5 ? texture2D(groundMacro, macroUv) : vec4(.5);
    groundMaskValue = groundOn > .5 ? texture2D(groundMask, macroUv) : vec4(1., 0., 0., 0.);
    vec4 baseTex = textureNoTile(map, vMapUv);
    // The second tissue is a different surface altogether, at its own scale and angle.
    vec4 secondTex = textureNoTile(groundSecondMap, mat2(.8, -.6, .6, .8) * vMapUv * .62 + vec2(.37, .11));
    // Height-aware blend: the second tissue settles into the low parts of the first.
    float baseHeight = dot(baseTex.rgb, vec3(.333)), secondHeight = dot(secondTex.rgb, vec3(.333));
    float blendWeight = smoothstep(.0, .22, groundMaskValue.g + (secondHeight - baseHeight) * .9 - .3);
    groundBlend = blendWeight;
    vec3 albedo = mix(baseTex.rgb, secondTex.rgb * groundSecond, blendWeight);
    albedo *= macroValue.rgb * 2.;
    groundWet = groundMaskValue.b;
    groundShade = groundMaskValue.r;
    albedo *= mix(1., .7, groundWet);
    albedo *= .3 + .7 * groundShade;
    diffuseColor *= vec4(albedo, baseTex.a);
  #endif
`;

const NORMAL_FRAGMENT = /* glsl */ `
  #ifdef USE_NORMALMAP_TANGENTSPACE
    vec3 mapN = textureNoTile(normalMap, vNormalMapUv).xyz * 2. - 1.;
    float detailFade = groundDetail * (1. - smoothstep(3., 14., length(vViewPosition)));
    if (detailFade > .01) {
      vec3 detailN = texture2D(normalMap, vNormalMapUv * 4.7 + .31).xyz * 2. - 1.;
      mapN.xy += detailN.xy * .7 * detailFade;
    }
    // Relief varies across the floor (smooth glossy sheets beside rough ridged tissue), and the
    // second tissue and puddles are smoother than the first, so no stretch reads as one pattern.
    float relief = mix(.35, 1.25, groundNoise(vGroundWorld.xz * .045 + 17.)) * mix(1., .45, groundBlend) * mix(1., .4, groundWet);
    mapN.xy *= normalScale * relief;
    normal = normalize(tbn * mapN);
  #else
    #include <normal_fragment_maps>
  #endif
`;

// Patches a floor material in place with the ground treatment and the floor caustics.
// `time` and `detail` are shared { value } uniforms; `maps` comes from paintGround (or null).
export function patchGround(material, { time, area, maps, detail }) {
  const palette = GROUND[area] ?? GROUND.artery;
  const [hx, hz] = GROUND_EXTENT;
  const uniforms = {
    ...causticUniforms(time, area),
    groundMacro: { value: maps?.macro ?? null }, groundMask: { value: maps?.mask ?? null },
    groundSecondMap: { value: maps?.second ?? null },
    groundOn: { value: maps ? 1 : 0 }, groundDetail: detail,
    groundExtent: { value: new THREE.Vector2(hx, hz) },
    groundSecond: { value: new THREE.Vector3(...palette.second) },
    groundGlow: { value: new THREE.Vector3(...(palette.glow ?? [0, 0, 0])) },
  };
  material.userData.ground = uniforms;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vGroundWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = GROUND_GLSL + CAUSTIC_GLSL + shader.fragmentShader
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .1, groundWet);`)
      .replace('#include <normal_fragment_maps>', NORMAL_FRAGMENT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${causticTerm('vGroundWorld')}
        totalEmissiveRadiance += groundGlow * groundMaskValue.a * (.55 + .45 * sin(causticTime * 1.3 + vGroundWorld.x * .2 + vGroundWorld.z * .13));`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat = mix(material.clearcoat, 1., groundWet);
          material.clearcoatRoughness = mix(material.clearcoatRoughness, .04, groundWet);
        #endif`);
  };
  material.customProgramCacheKey = () => 'ground-' + area;
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------- walls and canopy

// The curved walls and the canopy overhead get the same treatment as the floor, worked out in 3D
// world space (no painted map, so no seam where the wall closes on itself): repetition-free
// sampling, a second tissue blended in by height, broad colour variation, relief that changes
// across the surface, vessels climbing the walls and crossing the canopy (glowing in the brain and
// inner ear), wet streaks running down the walls, a contact shadow where the walls meet the floor,
// and the translucent-tissue rim glow (surface-fx.mjs addTissueSheen) on top.
const SHELL_GLSL = /* glsl */ `
  varying vec3 vShellWorld;
  uniform sampler2D shellSecondMap;
  uniform vec3 shellSecond, shellVein, shellGlow, sheenTint;
  uniform float shellWall, shellDetail, sheenStrength;
  float groundHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float groundNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
    return mix(mix(groundHash(i), groundHash(i + vec2(1., 0.)), u.x), mix(groundHash(i + vec2(0., 1.)), groundHash(i + vec2(1., 1.)), u.x), u.y);
  }
  vec4 textureNoTile(sampler2D samp, vec2 uv) {
    float k = groundNoise(uv * .35);
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    float l = k * 8.;
    float f = fract(l);
    float ia = floor(l), ib = ia + 1.;
    vec4 a = textureGrad(samp, uv + sin(vec2(3., 7.) * ia), dx, dy);
    vec4 b = textureGrad(samp, uv + sin(vec2(3., 7.) * ib), dx, dy);
    return mix(a, b, smoothstep(.2, .8, f - .1 * dot(a - b, vec4(1.))));
  }
  float shellHash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float shellNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3. - 2. * f);
    return mix(mix(mix(shellHash(i), shellHash(i + vec3(1., 0., 0.)), f.x), mix(shellHash(i + vec3(0., 1., 0.)), shellHash(i + vec3(1., 1., 0.)), f.x), f.y),
               mix(mix(shellHash(i + vec3(0., 0., 1.)), shellHash(i + vec3(1., 0., 1.)), f.x), mix(shellHash(i + vec3(0., 1., 1.)), shellHash(i + vec3(1., 1., 1.)), f.x), f.y), f.z);
  }
  float shellFbm(vec3 p) {
    float v = 0., a = .5;
    for (int i = 0; i < 4; i++) { v += a * shellNoise(p); p = p * 2.07 + vec3(13.1, 7.3, 3.7); a *= .5; }
    return v;
  }
  // Branching vessels: the crest lines of warped noise, kept to some stretches of the surface.
  float shellVessels(vec3 p) {
    vec3 warp = vec3(shellNoise(p * .5), shellNoise(p * .5 + 17.), shellNoise(p * .5 + 31.)) - .5;
    float ridge = 1. - abs(shellNoise(p + warp * 2.2) * 2. - 1.);
    float fine = 1. - abs(shellNoise(p * 2.3 + warp * 3. + 5.) * 2. - 1.);
    float present = smoothstep(.42, .62, shellNoise(p * .23 + 41.));
    return (smoothstep(.93, .985, ridge) + smoothstep(.95, .99, fine) * .55) * present;
  }
`;

const SHELL_MAP = /* glsl */ `
  float shellWet = 0., shellBlend = 0., shellVesselMask = 0.;
  #ifdef USE_MAP
    vec3 sw = vShellWorld;
    vec4 baseTex = textureNoTile(map, vMapUv);
    vec4 secondTex = shellDetail > .5 ? textureNoTile(shellSecondMap, mat2(.8, -.6, .6, .8) * vMapUv * .7 + vec2(.2, .53)) : baseTex;
    float baseHeight = dot(baseTex.rgb, vec3(.333)), secondHeight = dot(secondTex.rgb, vec3(.333));
    shellBlend = smoothstep(.0, .22, shellFbm(sw * .045) + (secondHeight - baseHeight) * .9 - .42) * step(.5, shellDetail);
    vec3 albedo = mix(baseTex.rgb, secondTex.rgb * shellSecond, shellBlend);
    // Broad blotches of lighter and darker tissue.
    albedo *= .68 + .62 * shellFbm(sw * .028 + 3.);
    // Vessels: on the walls they run mostly upward; on the canopy they spread across it.
    vec3 vesselSpace = shellWall > .5 ? sw * vec3(.16, .07, .16) : sw * vec3(.14, .3, .14);
    shellVesselMask = shellVessels(vesselSpace);
    albedo = mix(albedo, albedo * shellVein, min(1., shellVesselMask) * .85);
    if (shellWall > .5) {
      // Wet streaks running down the walls: long in height, narrow around the chamber.
      float streak = shellNoise(vec3(sw.x * .55, sw.y * .035, sw.z * .55)) * .7 + shellNoise(vec3(sw.x * 1.6, sw.y * .09, sw.z * 1.6)) * .3;
      shellWet = smoothstep(.56, .78, streak) * smoothstep(19., 4., sw.y);
      // Where the wall meets the floor it sits in shadow.
      albedo *= mix(.45, 1., smoothstep(-.3, 3.2, sw.y));
    } else {
      // Moisture gathers in drips across the canopy.
      shellWet = smoothstep(.62, .82, shellNoise(sw * vec3(.3, .3, .3) + 9.)) * .8;
    }
    albedo *= mix(1., .7, shellWet);
    diffuseColor *= vec4(albedo, baseTex.a);
  #endif
`;

const SHELL_NORMAL = /* glsl */ `
  #ifdef USE_NORMALMAP_TANGENTSPACE
    vec3 mapN = textureNoTile(normalMap, vNormalMapUv).xyz * 2. - 1.;
    float relief = mix(.35, 1.3, shellNoise(vShellWorld * .05 + 7.)) * mix(1., .5, shellBlend) * mix(1., .45, shellWet);
    mapN.xy *= normalScale * relief;
    normal = normalize(tbn * mapN);
  #else
    #include <normal_fragment_maps>
  #endif
`;

// Patches a wall ('wall') or canopy ('canopy') material in place. `detail` is a shared { value }.
export function patchShell(material, { area, kind, detail, sheenTint = 0xffc4b4, sheenStrength = .2 }) {
  const palette = GROUND[area] ?? GROUND.artery;
  const second = typeof document === 'undefined' ? null : bioTexture(palette.surface ?? 'neural', [1, 1]);
  if (second) second.wrapS = second.wrapT = THREE.RepeatWrapping;
  const uniforms = {
    shellSecondMap: { value: second }, shellDetail: detail,
    shellWall: { value: kind === 'wall' ? 1 : 0 },
    shellSecond: { value: new THREE.Vector3(...palette.second) },
    shellVein: { value: new THREE.Vector3(...palette.vein) },
    shellGlow: { value: new THREE.Vector3(...(palette.glow ?? [0, 0, 0])) },
    sheenTint: { value: new THREE.Color(sheenTint) }, sheenStrength: { value: sheenStrength },
  };
  material.userData.shell = uniforms;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vShellWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_INSTANCING
        vShellWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vShellWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
    shader.fragmentShader = SHELL_GLSL + shader.fragmentShader
      .replace('#include <map_fragment>', SHELL_MAP)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .12, shellWet);`)
      .replace('#include <normal_fragment_maps>', SHELL_NORMAL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += shellGlow * min(1., shellVesselMask);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat = mix(material.clearcoat, 1., shellWet);
          material.clearcoatRoughness = mix(material.clearcoatRoughness, .05, shellWet);
        #endif`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          // Translucent tissue: light scattering through thin membranes glows along turned edges.
          float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance += diffuseColor.rgb * sheenTint * pow(1.0 - facing, 2.6) * sheenStrength;
        }`);
  };
  material.customProgramCacheKey = () => 'shell-' + kind + '-' + area;
  material.needsUpdate = true;
  return material;
}
