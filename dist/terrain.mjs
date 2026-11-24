// Raised ground the suit can climb, jump onto and fight from. Pure data and geometry: the
// simulation uses groundHeight for the suit, grenades and the turret; arena-scene folds the
// smooth pieces into the floor; terrain-view.mjs builds the hard-edged pieces.
//
// Kinds (heights are the top surface above the base floor, in metres):
//   mound  — a plaque rise with a flat top and a sloping skirt all round: walk straight up it.
//   shelf  — a flat-topped plaque shelf with a sheer edge: jump onto it (too tall to step).
//   ridge  — a low wall between two points: jump over it or stand on it.
// A shelf with `breathe` rises and falls over time (the lungs' breathing platforms).
// Crawlers walk the floor and go around every piece; floating pathogens drift over them.
import { growPoint } from './arena-scale.mjs';

// A suit steps up anything this tall without jumping; taller edges need a jump.
export const STEP_HEIGHT = .42;

const mound = (x, z, radius, top, slope) => ({ kind: 'mound', x, z, radius, top, slope });
const shelf = (x, z, radius, top, breathe) => ({ kind: 'shelf', x, z, radius, top, ...(breathe ? { breathe } : {}) });
const ridge = (x1, z1, x2, z2, width, top) => ({ kind: 'ridge', x1, z1, x2, z2, width, top });

// The artery is the first arena with real height: a plaque overlook beside each tissue node, a
// tall plaque shelf in the middle that has to be jumped, and low ridges across the inlet lanes.
// Authored in the pre-growth coordinates like the obstacles, then grown with the arena.
function grownMound(x, z, radius, top, slope) {
  const [gx, gz] = growPoint([x, z]);
  return mound(gx, gz, radius, top, slope);
}
function grownShelf(x, z, radius, top) {
  const [gx, gz] = growPoint([x, z]);
  return shelf(gx, gz, radius, top);
}
function grownRidge(x1, z1, x2, z2, width, top) {
  const [a, b] = growPoint([x1, z1]);
  const [c, d] = growPoint([x2, z2]);
  return ridge(a, b, c, d, width, top);
}

export const TERRAIN = Object.freeze({
  artery: Object.freeze([
    // Overlooks: one per node, off to the side, each with a walkable ramp skirt.
    grownMound(-8.5, -24, 2.8, 1.05, 3.4),
    grownMound(30, 2, 2.4, .95, 3),
    grownMound(-30, 4, 2.4, .95, 3),
    // The plaque shelf in the middle of the chamber: jump up for the view over all three nodes.
    grownShelf(0, -4, 2.9, .78),
    // Low ridges across the approaches: hop them; crawlers must go round.
    grownRidge(-5, 21, 1, 23.5, .9, .62),
    grownRidge(7, 22, 12, 18.5, .9, .62),
    grownRidge(18, -9, 21, -16, .9, .58),
    grownRidge(-18, -8, -21, -15, .9, .58),
  ].map(Object.freeze)),
  // Capillary Junction: an overlook outside each node, a shelf between them, ridges on the way in.
  junction: Object.freeze([
    mound(-34, -22, 2.4, .95, 3),
    mound(34, -22, 2.4, .95, 3),
    shelf(0, -26, 2.6, .8),
    ridge(-13, 6, -6, 10, .9, .6),
    ridge(6, 10, 13, 6, .9, .6),
  ].map(Object.freeze)),
  // Heart Valve: a balcony to shoot down through the valve from, and a rise by the side node.
  heart: Object.freeze([
    shelf(-13, 15, 2.3, .82),
    mound(13, 24, 2, .9, 2.4),
    ridge(-5, 21, 3, 22.5, .9, .6),
  ].map(Object.freeze)),
  // Lungs: alveolar platforms that rise and fall with every breath, and bronchial ridges along
  // both edges of the airway.
  lungs: Object.freeze([
    shelf(-29, 0, 2.6, .72, { amp: .4, period: 5.2, phase: 0 }),
    shelf(29, 0, 2.6, .72, { amp: .4, period: 5.2, phase: Math.PI }),
    shelf(-20, 19, 2.2, .62, { amp: .35, period: 5.2, phase: Math.PI / 2 }),
    shelf(20, 19, 2.2, .62, { amp: .35, period: 5.2, phase: -Math.PI / 2 }),
    ridge(-12, -30, -12, -21, 1.1, .6),
    ridge(12, -30, 12, -21, 1.1, .6),
  ].map(Object.freeze)),
  // Stomach: rugae islands across the acid pool. Stand on one and the acid cannot reach you;
  // they are a jump apart. Banks beside each node.
  stomach: Object.freeze([
    shelf(-7.5, -3, 1.7, .8),
    shelf(-2.5, -8.5, 1.7, .8),
    shelf(3.5, -12, 1.7, .8),
    shelf(7.5, -5, 1.7, .8),
    mound(-37, -6, 2.2, .9, 2.8),
    mound(35, 20, 2.2, .9, 2.8),
  ].map(Object.freeze)),
  // Intestines: villus terraces, stepped so you can walk up them. Their crowns stand above the
  // contraction that sweeps the centre.
  intestines: Object.freeze([
    shelf(0, -20, 3.4, .38), shelf(0, -20, 2.4, .76), shelf(0, -20, 1.5, 1.14),
    shelf(1, 14, 3.2, .38), shelf(1, 14, 2.2, .76), shelf(1, 14, 1.4, 1.14),
    mound(-32, -16, 2.2, .9, 2.8),
  ].map(Object.freeze)),
  // Colon: haustral folds running with the bowel. Climb one and the squeeze passes under you.
  colon: Object.freeze([
    ridge(-30, -6, -30, 14, 1.5, .7),
    ridge(18, -32, 18, -16, 1.5, .7),
    ridge(1, 4, 1, 22, 1.5, .7),
    mound(36, 10, 2.2, .9, 2.8),
  ].map(Object.freeze)),
  // Lymph node: a tiered lookout in the middle of the follicle, rises by the flank nodes.
  lymph: Object.freeze([
    shelf(0, -28, 3.6, .38), shelf(0, -28, 2.5, .76), shelf(0, -28, 1.4, 1.14),
    mound(-31, 8, 2.2, .9, 2.8),
    mound(31, 8, 2.2, .9, 2.8),
  ].map(Object.freeze)),
  // Inner ear: the cochlea, a spiral stair to a high perch. A turret up there stands above the
  // resonance and never jams.
  ear: Object.freeze([
    ...Array.from({ length: 6 }, (_, i) => {
      const angle = i * 50 * Math.PI / 180;
      return shelf(10 + Math.cos(angle) * 3.2, -22 + Math.sin(angle) * 3.2, 1.7, .36 * (i + 1));
    }),
    shelf(10, -22, 1.7, 2.5),
    mound(-31, -4, 2.2, .9, 2.8),
  ].map(Object.freeze)),
  // Neural cortex: a synapse walkway of raised pads between the nodes, a jump apart, and rises
  // flanking the entry.
  brain: Object.freeze([
    ...[-12, -6, 0, 6, 12].map(x => shelf(x, -26, 1.9, .9)),
    mound(-34, 4, 2.2, .9, 2.8),
    mound(34, 4, 2.2, .9, 2.8),
  ].map(Object.freeze)),
});

// Raised ground that lifts the suit clear of an arena's hazard: from this foot height the acid,
// the contraction or the squeeze passes beneath it.
export const HAZARD_CLEARANCE = Object.freeze({ stomach: .5, intestines: 1, colon: .55 });
// A turret this high in the inner ear stands above the resonance.
export const RESONANCE_CLEARANCE = 1.4;

export function terrainFor(area) {
  return TERRAIN[area] ?? [];
}

function ridgeDistance(piece, x, z) {
  const dx = piece.x2 - piece.x1;
  const dz = piece.z2 - piece.z1;
  const length = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - piece.x1) * dx + (z - piece.z1) * dz) / length));
  return Math.hypot(x - (piece.x1 + dx * t), z - (piece.z1 + dz * t));
}

// The top of a piece at a time (breathing shelves rise and fall).
export function pieceTop(piece, time = 0) {
  const b = piece.breathe;
  return b ? piece.top + b.amp * Math.sin(time * Math.PI * 2 / b.period + b.phase) : piece.top;
}

// Height of one piece's surface at a point (0 outside it).
export function pieceHeight(piece, x, z, time = 0) {
  const top = pieceTop(piece, time);
  if (piece.kind === 'ridge') {
    // A rounded crest: full height across most of the width, rolling off at the very edge.
    const d = ridgeDistance(piece, x, z) / (piece.width / 2);
    return d >= 1 ? 0 : top * Math.min(1, (1 - d) * 4);
  }
  const d = Math.hypot(x - piece.x, z - piece.z);
  if (d <= piece.radius) return top;
  if (piece.kind === 'shelf') {
    // A short rounded lip so the edge reads as plaque, not a cut cylinder.
    const lip = .25;
    return d >= piece.radius + lip ? 0 : top * (1 - (d - piece.radius) / lip) ** 2 * .6;
  }
  const t = (d - piece.radius) / piece.slope;
  if (t >= 1) return 0;
  // Smoothstep down the skirt so the ramp meets the floor and the top without a crease.
  return top * (1 - t * t * (3 - 2 * t));
}

// The raised ground at a point: the highest piece there, 0 on the base floor.
export function groundHeight(pieces, x, z, time = 0) {
  let height = 0;
  for (const piece of pieces) {
    if (piece.kind === 'ridge') {
      if (Math.min(piece.x1, piece.x2) - piece.width > x || Math.max(piece.x1, piece.x2) + piece.width < x ||
        Math.min(piece.z1, piece.z2) - piece.width > z || Math.max(piece.z1, piece.z2) + piece.width < z) continue;
    } else if (Math.abs(x - piece.x) > piece.radius + (piece.slope ?? 1) || Math.abs(z - piece.z) > piece.radius + (piece.slope ?? 1)) continue;
    const h = pieceHeight(piece, x, z, time);
    if (h > height) height = h;
  }
  return height;
}

// Only the smooth pieces belong to the floor surface itself; shelves and ridges are their own
// meshes (their sheer edges cannot be drawn by the floor grid).
export function floorTerrainHeight(pieces, x, z) {
  let height = 0;
  for (const piece of pieces) {
    if (piece.kind !== 'mound') continue;
    if (Math.abs(x - piece.x) > piece.radius + piece.slope || Math.abs(z - piece.z) > piece.radius + piece.slope) continue;
    height = Math.max(height, pieceHeight(piece, x, z));
  }
  return height;
}

// Circles a floor-bound walker must keep out of, as [x, z, radius] like the arena obstacles.
// A ridge becomes a short chain of circles along its length.
export function terrainFootprints(pieces) {
  const circles = [];
  for (const piece of pieces) {
    if (piece.kind === 'ridge') {
      const length = Math.hypot(piece.x2 - piece.x1, piece.z2 - piece.z1);
      const count = Math.max(2, Math.ceil(length / (piece.width * .8)));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        circles.push([piece.x1 + (piece.x2 - piece.x1) * t, piece.z1 + (piece.z2 - piece.z1) * t, piece.width * .6]);
      }
    } else circles.push([piece.x, piece.z, piece.radius + (piece.kind === 'mound' ? piece.slope * .55 : .3)]);
  }
  return circles;
}

// True if a point sits on a moving (breathing) piece.
export function onMovingGround(pieces, x, z) {
  return pieces.some(piece => piece.breathe && Math.hypot(x - piece.x, z - piece.z) <= piece.radius + .3);
}
