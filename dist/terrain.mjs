// Raised ground the suit can climb, jump onto and fight from. Pure data and geometry: the
// simulation uses groundHeight for the suit, grenades and the turret; arena-scene folds the
// smooth pieces into the floor; terrain-view.mjs builds the hard-edged pieces.
//
// Kinds (heights are the top surface above the base floor, in metres):
//   mound  — a plaque rise with a flat top and a sloping skirt all round: walk straight up it.
//   shelf  — a flat-topped plaque shelf with a sheer edge: jump onto it (too tall to step).
//   ridge  — a low wall between two points: jump over it or stand on it.
// Crawlers walk the floor and go around every piece; floating pathogens drift over them.
import { growPoint } from './arena-scale.mjs';

// A suit steps up anything this tall without jumping; taller edges need a jump.
export const STEP_HEIGHT = .42;

const mound = (x, z, radius, top, slope) => ({ kind: 'mound', x, z, radius, top, slope });
const shelf = (x, z, radius, top) => ({ kind: 'shelf', x, z, radius, top });
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
});

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

// Height of one piece's surface at a point (0 outside it).
export function pieceHeight(piece, x, z) {
  if (piece.kind === 'ridge') {
    // A rounded crest: full height across most of the width, rolling off at the very edge.
    const d = ridgeDistance(piece, x, z) / (piece.width / 2);
    return d >= 1 ? 0 : piece.top * Math.min(1, (1 - d) * 4);
  }
  const d = Math.hypot(x - piece.x, z - piece.z);
  if (d <= piece.radius) return piece.top;
  if (piece.kind === 'shelf') {
    // A short rounded lip so the edge reads as plaque, not a cut cylinder.
    const lip = .25;
    return d >= piece.radius + lip ? 0 : piece.top * (1 - (d - piece.radius) / lip) ** 2 * .6;
  }
  const t = (d - piece.radius) / piece.slope;
  if (t >= 1) return 0;
  // Smoothstep down the skirt so the ramp meets the floor and the top without a crease.
  return piece.top * (1 - t * t * (3 - 2 * t));
}

// The raised ground at a point: the highest piece there, 0 on the base floor.
export function groundHeight(pieces, x, z) {
  let height = 0;
  for (const piece of pieces) {
    if (piece.kind === 'ridge') {
      if (Math.min(piece.x1, piece.x2) - piece.width > x || Math.max(piece.x1, piece.x2) + piece.width < x) continue;
    } else if (Math.abs(x - piece.x) > piece.radius + (piece.slope ?? 1) || Math.abs(z - piece.z) > piece.radius + (piece.slope ?? 1)) continue;
    const h = pieceHeight(piece, x, z);
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
