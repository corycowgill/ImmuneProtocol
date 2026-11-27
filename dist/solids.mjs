// Solid scenery with height, for the suit: what it can stand on, climb onto or walk under, and
// what stays a wall. Pure data and maths (no three.js), shared by the simulation, the co-op
// server and the renderer, which draws the clots and mounds at these same heights.
//
// Every solid is a rounded body over a circle: centre (x, z), radius r, and a vertical profile
// centred at height c with half-height `half`. At a distance d from its centre its cross-section
// spans c ± half·√(1 − (d/r)²): a dome on the floor (c below the floor, half its height), a tube
// lying across the arena (c its centre line), or a pillar too tall to climb (half huge).
import { ARTERY_VESSELS, ARTERY_VESSEL_SCALE, VESSEL_TIP, curvePoint } from './artery-vessels.mjs';

// The suit's footprint and height: it stands on the highest point under its footprint, and a
// solid whose underside clears its head is walked under.
export const SUIT_RADIUS = .45;
export const SUIT_HEAD = 1.85;
// A pillar: as tall as the arena, so it is never stood on or climbed.
const PILLAR = 400;

const dome = (x, z, r, height, base = 0) => ({ x, z, r, c: base, half: height - base, kind: 'dome' });
const pillar = (x, z, r) => ({ x, z, r, c: PILLAR / 2, half: PILLAR, kind: 'pillar' });

// The artery's clots: height over width as each is drawn (level-props.mjs organPillars). Low,
// broad mounds: tall enough to hide behind, low enough to jump, grab and climb onto.
export function arteryClotHeight(index) {
  const n = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return .62 + (n - Math.floor(n)) * .18;
}
// The footprint a suit stands on (its body stops at a wall's surface with SUIT_RADIUS).
export const STANCE = .15;

// Each arena's obstacles [x, z, radius] as solids, shaped as the renderer draws them.
const OBSTACLE_SHAPES = {
  // Thrombi: lumpy domes a little narrower than their footprint, sunk .3 m into the floor.
  artery: ([x, z, size], index) => dome(x, z, size * .96, size * arteryClotHeight(index) - .3, -.3),
  // Gastric mounds: low mucosal swellings wrapped in rugae.
  stomach: ([x, z, size]) => dome(x, z, size * 1.02, size * .75 - .2, -.2),
  // Biofilm mounds: wider than their footprint, about two-thirds as tall as wide.
  colon: ([x, z, size]) => dome(x, z, size * 1.1, size * .73, size * .055),
};

// The solid stretches of the artery's great vessels, sampled along each tube: low runs can be
// stood on, high ones walked under, and the stretches in between block.
function arteryVesselSolids() {
  const [sx, sy, sz] = ARTERY_VESSEL_SCALE;
  const across = Math.max(sx, sz);
  const solids = [];
  for (const { points, radius } of ARTERY_VESSELS) {
    const samples = Array.from({ length: 241 }, (_, i) => curvePoint(points, i / 240));
    const lengths = [0];
    for (let i = 1; i < samples.length; i++) {
      const [a, b] = [samples[i - 1], samples[i]];
      lengths.push(lengths[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
    const total = lengths[lengths.length - 1];
    let last = null;
    samples.forEach((point, i) => {
      const r = radius * (1 - Math.pow(lengths[i] / total, 1.6) * (1 - VESSEL_TIP)) * 1.045;
      const c = point[1] * sy, half = r * sy;
      // Only the stretches that come down into a suit's reach matter.
      if (c - half > SUIT_HEAD + 2.6 || c + half < 0) return;
      const x = point[0] * sx, z = point[2] * sz, wide = r * across;
      if (last && Math.hypot(last.x - x, last.z - z) < wide * .3 && Math.abs(last.c - c) < .15) return;
      last = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: Math.round(wide * 100) / 100, c, half, kind: 'tube' };
      solids.push(last);
    });
  }
  return solids;
}
const ARTERY_VESSEL_SOLIDS = Object.freeze(arteryVesselSolids().map(Object.freeze));

// Everything solid a suit meets in an arena: its obstacles (climbable where the shape allows,
// pillars elsewhere) and, in the artery, the vessels.
export function suitSolids(area, obstacles) {
  const shape = OBSTACLE_SHAPES[area];
  const solids = obstacles.map((obstacle, index) => shape ? shape(obstacle, index) : pillar(...obstacle));
  if (area === 'artery') solids.push(...ARTERY_VESSEL_SOLIDS);
  return Object.freeze(solids.map(Object.freeze));
}

// The span [bottom, top] of a solid's body over the highest point of a suit-sized footprint at
// (x, z), or null where the footprint misses it.
export function solidSpan(solid, x, z, footprint = SUIT_RADIUS) {
  const d = Math.max(0, Math.hypot(x - solid.x, z - solid.z) - footprint);
  if (d >= solid.r) return null;
  const s = Math.sqrt(1 - (d / solid.r) ** 2) * solid.half;
  return [Math.max(0, solid.c - s), solid.c + s];
}

// The highest solid surface under a suit whose feet are at `feet`: solids whose underside clears
// its head are ignored (it walks under them). 0 where there is none.
export function solidGround(solids, x, z, feet, footprint = SUIT_RADIUS, head = SUIT_HEAD) {
  let height = 0;
  for (const solid of solids) {
    if (Math.abs(x - solid.x) > solid.r + footprint || Math.abs(z - solid.z) > solid.r + footprint) continue;
    const span = solidSpan(solid, x, z, footprint);
    if (!span || span[0] > feet + head) continue;
    if (span[1] > height) height = span[1];
  }
  return height;
}

// The top of the solid body at a point (no footprint), for line-of-sight and projectiles: how
// high something must be to pass over it there. 0 where there is no solid.
export function solidTopAt(solids, x, z) {
  let top = 0;
  for (const solid of solids) {
    if (Math.abs(x - solid.x) > solid.r || Math.abs(z - solid.z) > solid.r) continue;
    const span = solidSpan(solid, x, z, 0);
    if (span && span[0] < 1 && span[1] > top) top = span[1];
  }
  return top;
}

// Whether a solid can be climbed at all (pillars cannot).
export const climbable = solid => solid.kind !== 'pillar';

// The surface something small at height y rests on or runs into at (x, z): the top of the
// highest solid there whose underside is below it (it passes under the rest). 0 where none.
export function surfaceUnder(solids, x, z, y) {
  let top = 0;
  for (const solid of solids) {
    if (Math.abs(x - solid.x) > solid.r || Math.abs(z - solid.z) > solid.r) continue;
    const span = solidSpan(solid, x, z, 0);
    if (span && span[0] <= y + .05 && span[1] > top) top = span[1];
  }
  return top;
}

// How far along a ray (from `origin`, unit `direction`) it first meets a solid, up to `range`;
// Infinity if it meets none. Each solid is the rounded body of solidSpan, cut off at the floor.
export function raySolids(solids, origin, direction, range = Infinity) {
  let nearest = range;
  const { x: ox, y: oy, z: oz } = origin, { x: dx, y: dy, z: dz } = direction;
  for (const solid of solids) {
    // Squash the body into a unit sphere: x and z by its radius, y by its half-height.
    const sy = Math.min(solid.half, 1e3);
    const px = (ox - solid.x) / solid.r, py = (oy - solid.c) / sy, pz = (oz - solid.z) / solid.r;
    const vx = dx / solid.r, vy = dy / sy, vz = dz / solid.r;
    const a = vx * vx + vy * vy + vz * vz;
    const b = px * vx + py * vy + pz * vz;
    const c = px * px + py * py + pz * pz - 1;
    if (c <= 0) continue; // The ray starts inside it (a suit standing in a tube's skin): ignore.
    const discriminant = b * b - a * c;
    if (discriminant < 0 || b > 0) continue;
    const t = (-b - Math.sqrt(discriminant)) / a;
    if (t < 0 || t >= nearest || oy + dy * t < 0) continue;
    nearest = t;
  }
  return nearest;
}
