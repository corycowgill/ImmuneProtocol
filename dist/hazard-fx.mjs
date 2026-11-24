// The organ hazards as real effects: the lungs' exhale is a gale of wind streaks and haze, the
// stomach's acid is a rising pool of glowing liquid that fills the low ground first, the gut's
// contractions are fleshy pressure waves that sweep the arena, the lymph node's macrophage zone
// is a wobbling digestive membrane, the inner ear's resonance draws cymatic patterns in the
// floor dust, and the brain's overload crackles with lightning. Every hazard reads its zone
// (centre, size, phase) from the simulation's organ state and draws a warning look first.
//
// Almost everything animates on the GPU from a time uniform: particle fields are instanced
// quads posed in the vertex shader, and the floor surfaces sample the arena's floor height in
// GLSL, so moving zones cost no per-frame geometry updates. Only the brain's lightning is
// rebuilt on the CPU, a few times a second.
import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;

// Shared GLSL: hashing, value noise, fbm, a cellular (Voronoi) field, and the arena floor height
// (the same formula as arena-scene.mjs floorHeight).
const COMMON = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
    return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0., a = .5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5; }
    return v;
  }
  // x: distance to the nearest cell point, y: gap to the second (0 on cell walls), z: cell id.
  vec3 cells(vec2 p, float t) {
    vec2 n = floor(p), f = fract(p);
    float f1 = 8., f2 = 8., id = 0.;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash12(n + g), hash12(n + g + 19.7));
      o = .5 + .45 * sin(t + TAU_ * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = hash12(n + g + 3.1); } else if (d < f2) f2 = d;
    }
    return vec3(sqrt(f1), sqrt(f2) - sqrt(f1), id);
  }
  float floorH(vec2 p) {
    return .115 * sin(p.x * .67 + p.y * .16) * cos(p.y * .46) + .075 * cos(p.y * .98 - p.x * .24) + .035 * sin(p.x * 2.8 + p.y * 1.7);
  }
`.replaceAll('TAU_', '6.2831853');

const HEADER = /* glsl */ `
  uniform float time, live, warn, level, swirl, crestHeight;
  uniform vec2 center, halfSize;
  uniform vec3 tint, accent;
  ${COMMON}
`;
const FINISH = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

function sharedUniforms(tint, accent) {
  return {
    time: { value: 0 }, live: { value: 0 }, warn: { value: 0 }, level: { value: 1 }, swirl: { value: 0 }, crestHeight: { value: 0 },
    center: { value: new THREE.Vector2() }, halfSize: { value: new THREE.Vector2(1, 1) },
    tint: { value: new THREE.Color(tint) }, accent: { value: new THREE.Color(accent) },
  };
}

function material(uniforms, vertexShader, fragmentShader, { additive = false, side = THREE.DoubleSide, extra = {} } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...extra }, vertexShader: HEADER + vertexShader, fragmentShader: HEADER + fragmentShader + '',
    transparent: true, depthWrite: false, side,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function addTo(root, geometry, mat, order = 2) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  root.add(mesh);
  return mesh;
}

// A floor-hugging surface over the zone (local -1..1 on both axes, `reach` times the zone).
// reach: how far past the zone the floor effect extends, either one factor or [across x, across z].
function zoneFloor(root, uniforms, fragmentBody, { reach = 1, lift = .06, additive = false, segments = 64, order = 2 } = {}) {
  const [reachX, reachZ] = Array.isArray(reach) ? reach : [reach, reach];
  const geometry = new THREE.PlaneGeometry(2 * reachX, 2 * reachZ, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const vertex = /* glsl */ `
    varying vec2 vLocal, vWorld;
    void main() {
      vLocal = position.xz;
      vec2 w = center + position.xz * halfSize;
      vWorld = w;
      gl_Position = projectionMatrix * viewMatrix * vec4(w.x, floorH(w) + ${lift.toFixed(3)}, w.y, 1.);
    }
  `;
  const fragment = /* glsl */ `
    varying vec2 vLocal, vWorld;
    void main() {
      vec3 col = vec3(0.); float alpha = 0.;
      ${fragmentBody}
      gl_FragColor = vec4(col, alpha);
      ${FINISH}
    }
  `;
  return addTo(root, geometry, material(uniforms, vertex, fragment, { additive }), order);
}

// Instanced quads posed in the vertex shader. The body sets P (world position), and either a
// streak (direction D, length L) or a billboard (L = 0), plus width W, alpha A and colour C.
function quadField(root, uniforms, count, vertexBody, { additive = true, fragmentBody = null, order = 3 } = {}) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  const vertex = /* glsl */ `
    attribute vec4 seed;
    varying vec2 vUv; varying float vAlpha, vStreak; varying vec3 vColor; varying vec4 vSeed;
    void main() {
      vec3 P = vec3(0.); vec3 D = vec3(0., 0., 1.); float L = 0., W = .1, A = 1.; vec3 C = tint;
      ${vertexBody}
      // Particles right in front of the lens would smear across the screen.
      A *= smoothstep(1.2, 3.5, distance(P, cameraPosition));
      vUv = position.xy; vAlpha = A; vColor = C; vSeed = seed; vStreak = L > 0. ? 1. : 0.;
      vec3 world;
      if (L > 0.) {
        vec3 view = normalize(cameraPosition - P);
        vec3 side = normalize(cross(D, view) + vec3(1e-5));
        world = P - D * L * (1. - position.x) + side * W * (position.y - .5);
      } else {
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        world = P + (right * (position.x - .5) + up * (position.y - .5)) * W;
      }
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
    }
  `;
  const fragment = /* glsl */ `
    varying vec2 vUv; varying float vAlpha, vStreak; varying vec3 vColor; varying vec4 vSeed;
    void main() {
      float shape;
      if (vStreak > .5) shape = smoothstep(0., .25, vUv.x) * smoothstep(1., .82, vUv.x) * (1. - abs(vUv.y - .5) * 2.);
      else shape = pow(max(0., 1. - length(vUv - .5) * 2.), 1.6);
      vec3 col = vColor; float alpha = shape * vAlpha;
      ${fragmentBody ?? ''}
      if (alpha < .003) discard;
      gl_FragColor = vec4(col, alpha);
      ${FINISH}
    }
  `;
  const mesh = addTo(root, geometry, material(uniforms, vertex, fragment, { additive }), order);
  return mesh;
}

// A vertical band around the zone boundary (circle or rectangle), `height` metres tall.
function boundaryWall(root, uniforms, circle, height, fragmentBody, { additive = true, segments = 128, wobble = '0.', scale = '(1. + bend)', declare = '', extra = {} } = {}) {
  const positions = [];
  const index = [];
  const point = t => {
    if (circle) return [Math.cos(t * TAU), Math.sin(t * TAU)];
    const s = (t * 4) % 4, f = s % 1;
    return s < 1 ? [-1 + 2 * f, -1] : s < 2 ? [1, -1 + 2 * f] : s < 3 ? [1 - 2 * f, 1] : [-1, 1 - 2 * f];
  };
  for (let i = 0; i <= segments; i++) {
    const [x, z] = point(i / segments);
    positions.push(x, 0, z, x, 1, z);
    if (i < segments) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const vertex = /* glsl */ `
    ${declare}
    varying vec2 vLocal, vWorld; varying float vV, vAngle;
    void main() {
      vLocal = position.xz; vV = position.y; vAngle = atan(position.z, position.x);
      float bend = ${wobble};
      vec2 w = center + position.xz * halfSize * ${scale};
      vWorld = w;
      gl_Position = projectionMatrix * viewMatrix * vec4(w.x, floorH(w) - .05 + position.y * ${height.toFixed(2)}, w.y, 1.);
    }
  `;
  const fragment = /* glsl */ `
    ${declare}
    varying vec2 vLocal, vWorld; varying float vV, vAngle;
    void main() {
      vec3 col = tint; float alpha = 0.;
      ${fragmentBody}
      gl_FragColor = vec4(col, alpha);
      ${FINISH}
    }
  `;
  return addTo(root, geometry, material(uniforms, vertex, fragment, { additive, extra }), 3);
}

// A fleshy pressure crest spanning the zone: long along `along` ('x' or 'z'), a bump across it.
function pressureCrest(root, uniforms, along, fragmentBody) {
  const geometry = new THREE.PlaneGeometry(2, 2, 72, 28);
  const vertex = /* glsl */ `
    varying vec2 vLocal, vWorld; varying float vHeight; varying vec3 vNormal, vView;
    float crest(vec2 l) {
      float across = l.y * 1.6;
      float edge = smoothstep(1., .78, abs(l.x));
      float ripple = .82 + .18 * sin(l.x * 9. + time * 3.) + .1 * vnoise(vec2(l.x * 5., time * .8));
      return exp(-across * across * 2.6) * edge * ripple;
    }
    void main() {
      vec2 l = position.xy; vLocal = l;
      vec2 span = ${along === 'x' ? 'vec2(l.x * halfSize.x, l.y * halfSize.y)' : 'vec2(l.y * halfSize.x, l.x * halfSize.y)'};
      vec2 w = center + span;
      vWorld = w;
      float h = crest(l);
      vHeight = h;
      vec2 e = vec2(.02, 0.);
      float dx = crest(l + e.xy) - crest(l - e.xy), dy = crest(l + e.yx) - crest(l - e.yx);
      vec3 n = normalize(vec3(-dx * crestHeight * 12., 1., -dy * crestHeight * 4.));
      vNormal = ${along === 'x' ? 'n' : 'vec3(n.z, n.y, n.x)'};
      vec3 world = vec3(w.x, floorH(w) - .1 + h * crestHeight, w.y);
      vView = normalize(cameraPosition - world);
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
    }
  `;
  const fragment = /* glsl */ `
    varying vec2 vLocal, vWorld; varying float vHeight; varying vec3 vNormal, vView;
    void main() {
      vec3 col = tint; float alpha = 0.;
      float fres = pow(1. - abs(dot(normalize(vNormal), vView)), 2.2);
      ${fragmentBody}
      gl_FragColor = vec4(col, alpha);
      ${FINISH}
    }
  `;
  const mat = material(uniforms, vertex, fragment);
  return addTo(root, geometry, mat, 4);
}

// ---------------------------------------------------------------------------------------------
// The hazards

function exhale(root, u) {
  // Floor: wind-combed streaks racing along the airway, and chevrons on both edges pointing the
  // way the air will throw you.
  zoneFloor(root, u, /* glsl */ `
    float edge = abs(vLocal.x);
    float inside = 1. - smoothstep(.94, 1., edge);
    float speed = mix(-.6, 5.5, live);
    float streak = fbm(vec2(vWorld.x * .9, vWorld.y * .07 - time * speed * .35));
    streak = smoothstep(.45, .85, streak) * (.35 + .65 * fbm(vec2(vWorld.x * 3., vWorld.y * .2 - time * speed)));
    float lane = mod(vWorld.y * .22 - abs(vLocal.x) * halfSize.x * .22 - time * mix(.4, 1.6, live), 1.);
    float chevron = smoothstep(.0, .06, lane) * smoothstep(.22, .12, lane) * smoothstep(.74, .9, edge) * inside;
    float rim = smoothstep(.9, .97, edge) * inside;
    float pulse = .6 + .4 * sin(time * 6.);
    col = tint * (streak + chevron * 1.2 + rim * .6);
    alpha = inside * (streak * .4 * live + chevron * (.45 * warn * pulse + .5 * live) + rim * (.2 + .3 * warn * pulse) * max(warn, live));
  `, { additive: true });
  // Wind streaks: long thin ribbons flying down the corridor at different heights.
  quadField(root, u, 320, /* glsl */ `
    float speed = mix(-2.2, 24., live) * (.7 + seed.y * .6);
    float span = halfSize.y * 2.;
    float t = fract(seed.z + time * speed / span);
    vec2 lane = vec2(seed.x * 2. - 1., t * 2. - 1.);
    float h = .25 + pow(seed.w, 1.6) * 8.;
    P = vec3(center.x + lane.x * halfSize.x * .95 + sin(time * 1.7 + seed.w * 30.) * .4, 0., center.y + lane.y * halfSize.y);
    P.y = floorH(P.xz) + h + sin(time * 2.3 + seed.x * 20.) * .3;
    D = normalize(vec3(sin(time + seed.w * 9.) * .05, .02, sign(speed)));
    L = mix(.6, 4.5, live) * (.5 + seed.y);
    W = .045 + seed.w * .05;
    A = (live * .5 + warn * .15) * smoothstep(0., .08, t) * smoothstep(1., .9, t) * (1. - smoothstep(.85, 1., abs(lane.x)));
    C = mix(tint, vec3(1.), .5);
  `);
  // Haze gusts: large soft puffs drifting with the air, giving it body.
  quadField(root, u, 48, /* glsl */ `
    float speed = mix(-1., 11., live) * (.8 + seed.y * .4);
    float t = fract(seed.z + time * speed / (halfSize.y * 2.));
    P = vec3(center.x + (seed.x * 2. - 1.) * halfSize.x * .8, 0., center.y + (t * 2. - 1.) * halfSize.y);
    P.y = floorH(P.xz) + 1. + seed.w * 5.;
    W = 4. + seed.y * 5.;
    A = .11 * max(live, warn * .5) * smoothstep(0., .15, t) * smoothstep(1., .8, t);
    C = mix(tint, vec3(1.), .25);
  `, { additive: false, fragmentBody: /* glsl */ `
    float n = fbm(vUv * 3. + vSeed.xy * 10. + time * .2);
    alpha *= smoothstep(.3, .75, n) * 1.6;
  ` });
  // Motes of mucus and dust tumbling through the gale.
  quadField(root, u, 220, /* glsl */ `
    float speed = mix(-1.4, 13., live) * (.6 + seed.y * .8);
    float t = fract(seed.z + time * speed / (halfSize.y * 2.));
    P = vec3(center.x + (seed.x * 2. - 1.) * halfSize.x, 0., center.y + (t * 2. - 1.) * halfSize.y);
    P.y = floorH(P.xz) + .2 + seed.w * 6. + sin(time * 4. + seed.x * 40.) * .35 * live;
    W = .07 + seed.y * .12;
    A = (live * .8 + warn * .45) * smoothstep(0., .05, t) * smoothstep(1., .93, t);
    C = mix(tint, vec3(1., .96, .9), seed.x);
  `);
  return { light: [0xcfe6ff, 0], height: 5 };
}

function acid(root, u) {
  // The pool: a flat liquid level that floods the lowest ground first, with a glowing body,
  // flowing caustics, popping bubbles, a foam shoreline and a fresnel sheen.
  const pool = new THREE.PlaneGeometry(2, 2, 96, 96);
  pool.rotateX(-Math.PI / 2);
  const surface = material(u, /* glsl */ `
    varying vec2 vLocal, vWorld; varying vec3 vView; varying float vDepth;
    void main() {
      vLocal = position.xz;
      vec2 w = center + position.xz * halfSize;
      vWorld = w;
      float wave = (vnoise(w * .6 + time * .5) - .5) * .05 + sin(length(w - center) * 2.2 - time * 2.4) * .012 * live;
      float y = level + wave;
      vDepth = y - floorH(w);
      vec3 world = vec3(w.x, y, w.y);
      vView = normalize(cameraPosition - world);
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
    }
  `, /* glsl */ `
    varying vec2 vLocal, vWorld; varying vec3 vView; varying float vDepth;
    void main() {
      float r = length(vLocal);
      float inside = 1. - smoothstep(.95, 1., r);
      if (inside <= 0. || vDepth <= 0.) discard;
      // Draining swirls the acid into the drain.
      vec2 rel = vWorld - center;
      float ang = swirl * (2.5 / (.6 + length(rel) * .25)) * time * .6;
      vec2 sw = center + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * rel;
      vec2 flow = sw * .35 + vec2(time * .08, -time * .05);
      float n1 = fbm(flow), n2 = fbm(flow * 2.1 + 7.);
      vec2 e = vec2(.05, 0.);
      vec3 normal = normalize(vec3(fbm(flow + e.xy) - fbm(flow - e.xy), .18, fbm(flow + e.yx) - fbm(flow - e.yx)));
      vec3 deep = accent * .3, bright = tint * .75;
      vec3 body = mix(deep, bright, smoothstep(.3, .8, n1) * .55 + .08);
      vec3 cell = cells(sw * .9, time * 1.3);
      float caustic = smoothstep(.12, 0., cell.y) * (.4 + .6 * n2);
      // Bubbles: rings that swell and pop in each cell.
      vec3 b = cells(sw * 2.4 + 31., 0.);
      float life = fract(time * (.45 + b.z * .5) + b.z * 7.);
      float bubble = smoothstep(.05, 0., abs(b.x - life * .38)) * (1. - life) * step(.35, b.z);
      float shore = 1. - smoothstep(.0, .09, vDepth);
      float foam = shore * smoothstep(.5, .75, fbm(vWorld * 4. + time * .6));
      vec3 lightDir = normalize(vec3(.3, 1., .2));
      float spec = pow(max(0., dot(reflect(-lightDir, normal), vView)), 40.) * .8;
      float fres = pow(1. - max(0., dot(vView, vec3(0., 1., 0.))), 3.);
      vec3 sky = vec3(.16, .13, .07);
      vec3 col = mix(body * (.5 + .6 * live) + bright * caustic * .55, sky, fres * .6)
        + vec3(1., 1., .8) * (bubble * .9 + foam * .55 + spec);
      float alpha = inside * (smoothstep(0., .035, vDepth) * (.8 + .15 * fres) + foam * .2);
      gl_FragColor = vec4(col, clamp(alpha, 0., .96));
      ${FINISH}
    }
  `, { side: THREE.FrontSide });
  addTo(root, pool, surface, 2);
  // Warning: the basin's rim glows and seeping puddles fizz on the floor before the rise.
  zoneFloor(root, u, /* glsl */ `
    float r = length(vLocal);
    float inside = 1. - smoothstep(.97, 1., r);
    float ring = smoothstep(.86, .95, r) * inside;
    float dash = step(.5, fract(atan(vLocal.y, vLocal.x) * 6. / 3.14159 + time * .35));
    float stain = smoothstep(.55, .8, fbm(vWorld * .45 + 3.)) * inside;
    float fizz = smoothstep(.85, .95, vnoise(vWorld * 6. + time * 2.)) * stain;
    float pulse = .55 + .45 * sin(time * 7.);
    col = tint * (ring * (1. + dash) + stain * .5 + fizz * 2.);
    alpha = ring * (.45 + .45 * dash) * (warn * pulse * 1.8 + live * .25) + (stain * .45 + fizz * .8) * warn + fizz * .3 * live;
  `, { additive: true, lift: .05 });
  // Bubbles bursting up through the surface.
  quadField(root, u, 140, /* glsl */ `
    float life = fract(seed.z + time * (.5 + seed.y * .6));
    float a = seed.x * 6.2831853, rr = sqrt(seed.w) * .95;
    vec2 xz = center + vec2(cos(a), sin(a)) * rr * halfSize;
    P = vec3(xz.x, max(level, floorH(xz)) + life * life * (.4 + seed.y * .9), xz.y);
    W = .06 + seed.y * .16 * (1. - life);
    A = (live * .9 + warn * .3) * (1. - life) * step(floorH(xz), level + .02);
    C = mix(tint, vec3(1., 1., .7), .5);
  `);
  // Toxic vapour boiling off the surface.
  quadField(root, u, 60, /* glsl */ `
    float life = fract(seed.z + time * (.08 + seed.y * .06));
    float a = seed.x * 6.2831853, rr = sqrt(seed.w) * .85;
    vec2 xz = center + vec2(cos(a), sin(a)) * rr * halfSize + vec2(sin(time * .3 + seed.w * 9.), cos(time * .4 + seed.x * 7.)) * life * 1.5;
    P = vec3(xz.x, level + .3 + life * 4.5, xz.y);
    W = 2. + life * 4.5 + seed.y * 2.;
    A = .16 * (live + warn * .35) * smoothstep(0., .2, life) * (1. - life);
    C = mix(tint, accent, .5);
  `, { additive: false, fragmentBody: /* glsl */ `
    alpha *= smoothstep(.35, .8, fbm(vUv * 2.6 + vSeed.zw * 9. + time * .15)) * 1.8;
  ` });
  return { light: [0xb8f05a, 1.2], height: 1.4, pool: true };
}

function contraction(root, u, along) {
  // A fleshy crest of muscle pressure rolling through the gut.
  const crest = pressureCrest(root, u, along, /* glsl */ `
    float veins = smoothstep(.6, .68, fbm(vWorld * .45 + vec2(0., time * .2)));
    float skin = fbm(vWorld * 1.3 + time * .4);
    float throb = .75 + .25 * sin(time * 9. + vLocal.x * 4.);
    vec3 n = normalize(vNormal);
    vec3 sun = normalize(vec3(.3, 1., .4));
    float diffuse = .35 + .65 * max(0., dot(n, sun));
    float spec = pow(max(0., dot(reflect(-sun, n), vView)), 24.) * .5;
    float striation = pow(.5 + .5 * sin(vLocal.y * 46. + fbm(vWorld * .6) * 6.), 2.);
    float wet = smoothstep(.55, .8, fbm(vWorld * 2.2 + time * .3));
    vec3 flesh = mix(accent * .8, tint * .85, skin * .6 + vHeight * .45) * (.7 + .45 * striation);
    col = flesh * diffuse + accent * veins * .7 + tint * fres * .8 * throb + vec3(1., .88, .82) * spec * (.4 + wet);
    alpha = smoothstep(.02, .12, vHeight) * (.88 + .12 * fres) * max(live, warn * .55);
  `);
  // Floor: shock ripples running ahead of the crest and a glowing compression band under it.
  zoneFloor(root, u, /* glsl */ `
    float across = ${along === 'x' ? 'vLocal.y' : 'vLocal.x'};
    float side = ${along === 'x' ? 'vLocal.x' : 'vLocal.y'};
    float inside = smoothstep(1., .85, abs(side));
    float d = abs(across);
    float band = exp(-d * d * 7.);
    float rings = pow(.5 + .5 * sin(d * 18. - time * 10.), 6.) * smoothstep(3., .4, d);
    float crack = smoothstep(.7, .78, fbm(vWorld * .8 + time * .3)) * band;
    float pulse = .55 + .45 * sin(time * 8.);
    col = mix(accent, tint, band) * (band * .9 + rings * .7 + crack * 1.2);
    alpha = inside * (band * (.35 * live + .45 * warn * pulse) + rings * .16 * live + crack * .45 * live);
  `, { additive: true, reach: along === 'x' ? [1.02, 3] : [3, 1.02] });
  // Chyme flung forward off the crest, and grit shaken loose ahead of it.
  quadField(root, u, 220, /* glsl */ `
    float life = fract(seed.z + time * (.6 + seed.y * .5));
    float side = seed.x * 2. - 1.;
    vec2 dir = ${along === 'x' ? 'vec2(1., 0.)' : 'vec2(0., 1.)'} * sign(seed.w - .5 + 1e-3);
    vec2 base = center + ${along === 'x' ? 'vec2(0., side * halfSize.y)' : 'vec2(side * halfSize.x, 0.)'};
    vec3 v = vec3(dir.x * (3. + seed.y * 6.), 4. + seed.w * 5., dir.y * (3. + seed.y * 6.));
    float t = life * 1.1;
    vec3 start = vec3(base.x, floorH(base) + crestHeight * .8, base.y);
    P = start + v * t + vec3(0., -9.8, 0.) * t * t * .5;
    P.y = max(P.y, floorH(P.xz) + .05);
    D = normalize(v + vec3(0., -9.8 * t, 0.));
    L = .25 + seed.y * .4;
    W = .05 + seed.y * .06;
    A = live * (1. - life) * smoothstep(0., .05, life);
    C = mix(accent, tint, seed.y);
  `, { order: 5, additive: false });
  return { light: [0xffa060, 1.6], height: 2.5, crest };
}

function macrophageZone(root, u) {
  // Floor: digestive cytoplasm, lysosome granules and a pseudopod-edged membrane.
  zoneFloor(root, u, /* glsl */ `
    float a = atan(vLocal.y, vLocal.x);
    float edgeR = 1. - .06 * (sin(a * 5. + time * 1.3) * .6 + sin(a * 9. - time * 2.) * .4);
    float r = length(vLocal) / edgeR;
    float inside = 1. - smoothstep(.95, 1., r);
    float rim = smoothstep(.84, .97, r) * inside;
    vec3 cl = cells(vWorld * .9, time * .8);
    float wall = smoothstep(.12, .0, cl.y);
    float granule = smoothstep(.22, .05, cl.x) * step(.45, cl.z);
    float digest = fbm(vWorld * .35 + time * .25);
    float pulse = .6 + .4 * sin(time * 5.);
    col = mix(tint * .7, accent, granule) * (.8 + digest * .5) + tint * rim * .4;
    alpha = inside * ((wall * .45 + digest * .2 + granule * .7) * live + rim * (.55 * live + .6 * warn * pulse));
  `, { additive: false });
  // The cell membrane, rising around the zone and wobbling as it reaches.
  boundaryWall(root, u, true, 3.4, /* glsl */ `
    float n = fbm(vec2(vAngle * 3., vV * 2. - time * .6));
    float fade = smoothstep(0., .12, vV) * (1. - vV);
    alpha = fade * (.18 + .35 * n) * (live + warn * .4);
    col = mix(tint * .7, accent, n * .4) * (.8 + .3 * sin(vAngle * 12. + time * 2.));
  `, { additive: false, wobble: '.06 * (sin(atan(position.z, position.x) * 5. + time * 1.3) * .6 + sin(atan(position.z, position.x) * 9. - time * 2.) * .4) * (1. - position.y * .4)' });
  // Granules swirling inward to be digested.
  quadField(root, u, 160, /* glsl */ `
    float life = fract(seed.z + time * (.18 + seed.y * .2));
    float a = seed.x * 6.2831853 + life * 4. * (seed.w > .5 ? 1. : -1.);
    float rr = (1. - life) * .95;
    vec2 xz = center + vec2(cos(a), sin(a)) * rr * halfSize;
    P = vec3(xz.x, floorH(xz) + .3 + seed.w * 2.4 * (1. - life), xz.y);
    W = .08 + seed.y * .14;
    A = (live * .85 + warn * .25) * smoothstep(0., .1, life) * smoothstep(1., .85, life);
    C = mix(tint, accent, seed.y);
  `);
  return { light: [0xbff7e2, 1.2], height: 2 };
}

function resonance(root, u) {
  // Floor: cymatic standing-wave patterns (Chladni figures) that reshape as the tone shifts, with
  // radial pressure rings travelling out from the node.
  zoneFloor(root, u, /* glsl */ `
    float r = length(vLocal);
    float inside = 1. - smoothstep(.96, 1., r);
    float mode = floor(time * .35);
    float blend = smoothstep(.75, 1., fract(time * .35));
    vec2 nm1 = vec2(2. + mod(mode, 4.), 5. + mod(mode * 3., 3.));
    vec2 nm2 = vec2(2. + mod(mode + 1., 4.), 5. + mod((mode + 1.) * 3., 3.));
    vec2 p = vLocal * 1.5707963;
    float c1 = cos(nm1.x * p.x) * cos(nm1.y * p.y) - cos(nm1.y * p.x) * cos(nm1.x * p.y);
    float c2 = cos(nm2.x * p.x) * cos(nm2.y * p.y) - cos(nm2.y * p.x) * cos(nm2.x * p.y);
    float f = mix(c1, c2, blend);
    float lines = smoothstep(.12, .0, abs(f));
    float waves = pow(.5 + .5 * cos(r * 26. - time * 11.), 8.) * (1. - r);
    float rim = smoothstep(.88, .97, r) * inside;
    float pulse = .55 + .45 * sin(time * 12.);
    col = mix(tint * .85, accent, waves * .6);
    alpha = inside * ((lines * .75 + waves * .35) * live + rim * (.55 * live + .6 * warn * pulse) + lines * .25 * warn);
  `, { additive: false });
  // Sound rings expanding from the node, drawn as short glowing walls.
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const ring = boundaryWall(root, u, true, 1.1, /* glsl */ `
      float band = smoothstep(0., .25, vV) * smoothstep(1., .45, vV);
      alpha = band * ringFade * .8;
      col = tint * 1.3;
    `, { scale: 'ringScale', declare: 'uniform float ringScale, ringFade;', extra: { ringScale: { value: 0 }, ringFade: { value: 0 } } });
    rings.push(ring);
  }
  // Floor dust that dances off the antinodes and settles on the nodal lines.
  quadField(root, u, 420, /* glsl */ `
    vec2 l = vec2(seed.x, seed.y) * 2. - 1.;
    if (length(l) > 1.) l = normalize(l) * fract(seed.z * 7.);
    vec2 p = l * 1.5707963;
    float mode = floor(time * .35);
    vec2 nm = vec2(2. + mod(mode, 4.), 5. + mod(mode * 3., 3.));
    float f = cos(nm.x * p.x) * cos(nm.y * p.y) - cos(nm.y * p.x) * cos(nm.x * p.y);
    float hop = abs(f) * abs(sin(time * 28. + seed.w * 40.)) * .45 * live;
    vec2 xz = center + l * halfSize;
    P = vec3(xz.x, floorH(xz) + .07 + hop, xz.y);
    W = .06 + seed.w * .06;
    A = (live * .8 + warn * .2) * (.35 + .65 * smoothstep(.4, .0, abs(f)));
    C = mix(tint, accent, seed.z);
  `);
  return { light: [0x28c8f0, .7], height: 2.6, rings };
}

function overload(root, u) {
  // Floor: a neural mesh of dendrites lit by signals racing outward, flaring white when overloaded.
  zoneFloor(root, u, /* glsl */ `
    float r = length(vLocal);
    float inside = 1. - smoothstep(.95, 1., r);
    vec2 warp = vWorld + (vec2(fbm(vWorld * .35), fbm(vWorld * .35 + 9.)) - .5) * 3.;
    vec3 net = cells(warp * .8, time * .4);
    float dendrite = smoothstep(.07, .0, net.y) * (.55 + .45 * fbm(warp * 2.));
    float fine = smoothstep(.05, .0, cells(warp * 2.3 + 11., time * .7).y) * .4 * step(.4, fbm(warp * 1.3 + 4.));
    float signal = smoothstep(.12, 0., abs(fract(r * 1.4 - time * 1.6 + net.z * .3) - .5) - .38);
    float flicker = step(.55, vnoise(vec2(time * 18., net.z * 50.)));
    float rim = smoothstep(.86, .96, r) * inside;
    float pulse = .55 + .45 * sin(time * 9.);
    col = mix(tint, accent, signal * .5) * ((dendrite + fine) * (.8 + signal * 1.4 + flicker * .4) + rim);
    alpha = inside * ((dendrite + fine) * (.35 + .5 * signal + .3 * flicker) * live + (dendrite * .25 + rim * .6 * pulse) * warn + rim * .5 * live);
  `, { additive: true });
  // Sparks spat out where the arcs ground.
  quadField(root, u, 200, /* glsl */ `
    float life = fract(seed.z + time * (1.1 + seed.y));
    float a = seed.x * 6.2831853;
    vec2 base = center + vec2(cos(a), sin(a)) * sqrt(seed.w) * halfSize * .9;
    vec3 v = vec3(cos(a + seed.y) * 2.5, 3. + seed.y * 4., sin(a + seed.y) * 2.5);
    float t = life * .7;
    P = vec3(base.x, floorH(base) + .05, base.y) + v * t + vec3(0., -9.8, 0.) * t * t * .5;
    P.y = max(P.y, floorH(P.xz) + .03);
    D = normalize(v + vec3(0., -9.8 * t, 0.));
    L = .18 + seed.y * .2;
    W = .03 + seed.w * .03;
    A = live * (1. - life) * step(.35, fract(seed.z * 13. + floor(time * 3.) * .37));
    C = mix(tint, accent, seed.y);
  `);
  // Lightning: jagged ribbons rebuilt a few times a second.
  const arcs = 7, points = 14;
  const positions = new Float32Array(arcs * points * 2 * 3);
  const alphas = new Float32Array(arcs * points * 2);
  const index = [];
  for (let a = 0; a < arcs; a++) {
    for (let i = 0; i < points - 1; i++) {
      const o = (a * points + i) * 2;
      index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('fade', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(index);
  const bolt = new THREE.ShaderMaterial({
    uniforms: { ...u },
    vertexShader: /* glsl */ `attribute float fade; varying float vFade; void main() { vFade = fade; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.); }`,
    fragmentShader: HEADER + /* glsl */ `varying float vFade; void main() { gl_FragColor = vec4(mix(tint, vec3(1.), .45) * 1.6, vFade); ${FINISH} }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const lightning = addTo(root, geometry, bolt, 6);
  const point = new THREE.Vector3(), next = new THREE.Vector3(), side = new THREE.Vector3();
  let rebuild = 0;
  const strike = (center, radius, floorHeight, strength, camera) => {
    for (let a = 0; a < arcs; a++) {
      const live = Math.random() < strength;
      const angle = Math.random() * TAU, reach = radius * (.3 + Math.random() * .65);
      const ex = center.x + Math.cos(angle) * reach, ez = center.y + Math.sin(angle) * reach;
      const sx = center.x + (Math.random() - .5), sz = center.y + (Math.random() - .5), sy = floorHeight(sx, sz) + 2 + Math.random() * 1.6;
      const ey = floorHeight(ex, ez) + .05;
      const width = .05 + Math.random() * .07;
      for (let i = 0; i < points; i++) {
        const t = i / (points - 1);
        const jitter = Math.sin(t * Math.PI) * (.25 + reach * .06);
        point.set(sx + (ex - sx) * t + (Math.random() - .5) * jitter, sy + (ey - sy) * Math.pow(t, .8) + (Math.random() - .5) * jitter, sz + (ez - sz) * t + (Math.random() - .5) * jitter);
        next.set(ex - sx, ey - sy, ez - sz).normalize();
        side.subVectors(camera.position, point).cross(next).normalize().multiplyScalar(width * (1 - t * .6));
        const o = (a * points + i) * 2;
        positions.set([point.x - side.x, point.y - side.y, point.z - side.z, point.x + side.x, point.y + side.y, point.z + side.z], o * 3);
        alphas[o] = alphas[o + 1] = live ? .95 * (1 - t * .3) : 0;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.fade.needsUpdate = true;
  };
  return {
    light: [0xdcadff, 2.2], height: 2.6, flicker: true,
    update(dt, state, intensity, floorHeight, camera, reduced) {
      lightning.visible = intensity > .05 && !reduced;
      if (!lightning.visible || !camera) return;
      rebuild -= dt;
      if (rebuild > 0) return;
      rebuild = .06 + Math.random() * .08;
      strike(u.center.value, state.radius ?? 6, floorHeight, intensity, camera);
    },
  };
}

// ---------------------------------------------------------------------------------------------

const HAZARDS = {
  lungs: { build: exhale, tint: 0xa8d4ff, accent: 0xffffff },
  stomach: { build: acid, tint: 0xb4e83a, accent: 0x4a6a0a, lightFloor: true },
  // The crests stop short of the raised ground that rides them out (terrain.mjs HAZARD_CLEARANCE).
  intestines: { build: (root, u) => contraction(root, u, 'x'), tint: 0xd85a50, accent: 0x5a1418, crest: 1.7 },
  colon: { build: (root, u) => contraction(root, u, 'z'), tint: 0xc46a58, accent: 0x40160e, crest: .9 },
  lymph: { build: macrophageZone, tint: 0x3fd8a0, accent: 0xffb84a, lightFloor: true },
  ear: { build: resonance, tint: 0x28c8f0, accent: 0x7a8cff, lightFloor: true },
  brain: { build: overload, tint: 0xa458ff, accent: 0xff7ad8 },
};

export const HAZARD_AREAS = Object.freeze(Object.keys(HAZARDS));
const CIRCLES = new Set(['stomach', 'ear', 'brain', 'lymph']);

export function createHazardFX(area, root, floorHeight) {
  const spec = HAZARDS[area];
  if (!spec) return () => {};
  const group = new THREE.Group();
  group.name = 'hazard-fx-' + area;
  root.add(group);
  const u = sharedUniforms(spec.tint, spec.accent);
  const fx = spec.build(group, u) ?? {};
  // Every hazard raises a pulsing curtain around its zone while it warns, fading to a faint
  // boundary once it strikes, so the danger area always reads at a glance.
  boundaryWall(group, u, CIRCLES.has(area), 3.4, /* glsl */ `
    float fade = smoothstep(0., .08, vV) * pow(1. - vV, 1.6);
    float scan = .5 + .5 * sin(vV * 26. - time * 7.);
    float pulse = .55 + .45 * sin(time * 6.5);
    float n = fbm(vec2(vAngle * 4. + vWorld.x * .05, vV * 3. - time * .8));
    alpha = fade * (warn * (.5 + .4 * scan) * pulse + live * .1) * (.65 + .55 * n);
    col = tint * (1.1 + scan * .4);
  `, { additive: !spec.lightFloor });
  const light = new THREE.PointLight(fx.light?.[0] ?? spec.tint, 0, 26, 2);
  group.add(light);
  const circle = CIRCLES.has(area);
  let lastTime = 0, held = false, visibleBefore = false;
  group.visible = false;
  return (state, time, reduced, gastric, camera) => {
    const dt = Math.max(0, Math.min(.1, time - lastTime));
    lastTime = time;
    const draining = gastric?.stage === 'draining';
    const shown = !!state && gastric?.stage !== 'drained' && (state.phase !== 'recovery' || draining);
    const targetActive = shown && (state.phase === 'active' || draining) ? 1 : 0;
    const targetWarn = shown && state.phase === 'warning' ? 1 : 0;
    const blend = reduced || !visibleBefore ? 1 : 1 - Math.exp(-dt * 5);
    u.live.value += (targetActive - u.live.value) * blend;
    u.warn.value += (targetWarn - u.warn.value) * blend;
    const intensity = Math.max(u.live.value, u.warn.value);
    visibleBefore = true;
    group.visible = intensity > .004;
    if (!group.visible) { light.intensity = 0; return; }
    // Hold the zone in place while it fades out, so it does not jump to the next spot.
    if (shown && state) {
      const width = circle ? state.radius : state.width / 2;
      const depth = circle ? state.radius : state.depth / 2;
      if ([state.x, state.z, width, depth].every(Number.isFinite) && width > 0 && depth > 0) {
        u.center.value.set(state.x, state.z);
        u.halfSize.value.set(width, depth);
        held = true;
      }
    }
    if (!held) { group.visible = false; return; }
    u.time.value = reduced ? 0 : time;
    u.swirl.value = draining ? 1 : 0;
    if (fx.pool) {
      // The acid rises from below the floor to cover the basin; draining lowers it.
      const fill = draining ? Math.min(1, (gastric.level ?? 0) / .68) : u.live.value * .92 + u.warn.value * .08;
      u.level.value = -.32 + .66 * fill;
    }
    u.crestHeight.value = (spec.crest ?? 4.4) * u.live.value + .6 * u.warn.value;
    if (fx.rings) {
      fx.rings.forEach((ring, index) => {
        const t = reduced ? (index + .5) / fx.rings.length : (time * .55 + index / fx.rings.length) % 1;
        ring.material.uniforms.ringScale.value = .08 + t * .95;
        ring.material.uniforms.ringFade.value = (1 - t) * (u.live.value * .8 + u.warn.value * .25);
      });
    }
    fx.update?.(dt, state ?? {}, u.live.value, floorHeight, camera, reduced);
    const flicker = fx.flicker && !reduced ? .55 + Math.random() * .9 : 1;
    light.position.set(u.center.value.x, floorHeight(u.center.value.x, u.center.value.y) + (fx.height ?? 2), u.center.value.y);
    // A chamber-wide hazard still only lights its surroundings: the reach is capped.
    light.distance = Math.min(40, Math.max(u.halfSize.value.x, u.halfSize.value.y) * 2.4 + 6);
    light.intensity = (fx.light?.[1] ?? 1) * 40 * (u.live.value + u.warn.value * .3) * flicker;
  };
}
