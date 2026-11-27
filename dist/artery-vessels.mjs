// The great vessels slung across the artery chamber, shared by the renderer (arena-scene.mjs
// builds their tubes) and the simulation (the parts that come down to the floor are solid).
// Pure data and maths: no three.js, so the co-op server can use it.
import { ARENA_GROWTH } from './arena-scale.mjs';

// Control points in the vessel group's own space, and each vessel's radius there.
export const ARTERY_VESSELS = Object.freeze([
  { points: [[-21, 1, 25], [-19, 7, 19], [-16, 9, 11], [-10, 12, 6], [-1, 13, 2], [12, 14, -1], [20, 10, -10]], radius: .86 },
  { points: [[-19, 6.8, 19], [-15, 7.7, 11], [-10, 9.8, 7], [-3, 12, 7], [3, 12.2, 12]], radius: .46 },
  { points: [[-14, 9.7, 9], [-18, 9.8, 1], [-20, 8.3, -5], [-16, 5.4, -16], [-14, 3.9, -23]], radius: .47 },
  { points: [[19, -.7, 17], [19, 3, 12], [18, 5.5, 6], [13, 8.4, .7], [4, 10.6, -4], [-4, 12.4, -11], [-10, 13, -22]], radius: 1.05 },
  { points: [[19, 2.4, 12], [17, 3.8, 8], [13, 5.5, 7], [10, 5.9, 5.5], [9, 6.7, 3]], radius: .39 },
  { points: [[18, 5.6, 5.5], [16.5, 6.7, -.5], [16.5, 7.7, -5], [15, 7.8, -11], [12, 7.5, -15]], radius: .44 },
  { points: [[-16, 0, -24], [-13, 5, -22], [-11, 7.3, -20], [-4, 8.8, -23], [0, 8.7, -29], [8, 10.2, -29], [16, 8.2, -25]], radius: .64 },
  { points: [[-13, 5, -22], [-10, 4.1, -24], [-9, 3.4, -27], [-8, 3.1, -31]], radius: .23 },
  { points: [[13, 1.5, -28], [15, 3.9, -25], [15, 6.2, -19], [19, 10, -13]], radius: .58 },
  { points: [[12, 1.3, -29], [11, 2.7, -27], [10, 3.4, -25], [8, 4.8, -24]], radius: .29 },
  { points: [[-11, 2.2, 28], [-13, 6, 25], [-13, 9.1, 20], [-8, 13, 17], [2, 15, 18]], radius: .57 },
  { points: [[18, 1, 23], [14, 4.4, 24], [9, 7.2, 24], [6, 8.7, 28], [3, 9.4, 32]], radius: .48 },
].map(vessel => Object.freeze({ ...vessel, points: Object.freeze(vessel.points.map(point => Object.freeze(point))) })));
// Each tube narrows to this fraction of its radius at its far end.
export const VESSEL_TIP = .37;
// The vessel group's scale in the arena (arena-scene.mjs LAYOUT_SCALE, then x, y, z).
const LAYOUT_SCALE = 1.45 * ARENA_GROWTH;
export const ARTERY_VESSEL_SCALE = Object.freeze([1.25 * LAYOUT_SCALE, 1.18, 1.22 * LAYOUT_SCALE]);

// A point on the centripetal Catmull-Rom curve through `points` (as three.js CatmullRomCurve3
// draws it), at parameter t in 0..1.
export function curvePoint(points, t) {
  const l = points.length;
  const p = (l - 1) * t;
  let index = Math.floor(p);
  let weight = p - index;
  if (index >= l - 1) { index = l - 2; weight = 1; }
  const p1 = points[index], p2 = points[index + 1];
  const p0 = index > 0 ? points[index - 1] : p1.map((v, k) => 2 * v - p2[k]);
  const p3 = index + 2 < l ? points[index + 2] : p2.map((v, k) => 2 * v - p1[k]);
  const span = (a, b) => Math.pow((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2, .25);
  let dt0 = span(p0, p1), dt1 = span(p1, p2), dt2 = span(p2, p3);
  if (dt1 < 1e-4) dt1 = 1;
  if (dt0 < 1e-4) dt0 = dt1;
  if (dt2 < 1e-4) dt2 = dt1;
  return [0, 1, 2].map(k => {
    const x0 = p0[k], x1 = p1[k], x2 = p2[k], x3 = p3[k];
    const t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1;
    const t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1;
    const w = weight;
    return x1 + t1 * w + (-3 * x1 + 3 * x2 - 2 * t1 - t2) * w * w + (2 * x1 - 2 * x2 + t1 + t2) * w * w * w;
  });
}

// How tall a suit stands, and how low a tube may pass over the floor before it blocks one.
const SUIT_HEIGHT = 2;
const STEP_OVER = .4;
// The suit's own radius, so it stops at the vessel's skin rather than its centre line.
const SUIT_RADIUS = .45;

// Circles [x, z, radius] in arena space covering every stretch of vessel that comes down
// between the floor and a suit's head: a suit cannot walk through those.
export function arteryVesselFootprints() {
  const [sx, sy, sz] = ARTERY_VESSEL_SCALE;
  const across = Math.max(sx, sz);
  const circles = [];
  for (const { points, radius } of ARTERY_VESSELS) {
    // Sample finely and measure the length along the curve, as the tube's taper does.
    const samples = Array.from({ length: 241 }, (_, i) => curvePoint(points, i / 240));
    const lengths = [0];
    for (let i = 1; i < samples.length; i++) {
      const [a, b] = [samples[i - 1], samples[i]];
      lengths.push(lengths[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
    const total = lengths[lengths.length - 1];
    let last = null;
    samples.forEach((point, i) => {
      const along = lengths[i] / total;
      const r = radius * (1 - Math.pow(along, 1.6) * (1 - VESSEL_TIP)) * 1.045;
      // The tube's width at the height in the suit's band (floor to head) nearest its centre:
      // full width where the centre line passes through the band, narrower where only its
      // upper or lower edge dips into it, nothing where it clears the band.
      const centre = point[1] * sy, half = r * sy;
      const nearest = Math.min(SUIT_HEIGHT, Math.max(STEP_OVER, centre));
      const offset = (nearest - centre) / half;
      if (Math.abs(offset) >= 1) return;
      const x = point[0] * sx, z = point[2] * sz;
      const footprint = r * across * Math.sqrt(1 - offset * offset) + SUIT_RADIUS;
      // Keep the chain light: a new circle once the last one is well behind.
      if (last && Math.hypot(last[0] - x, last[1] - z) < footprint * .35 && Math.abs(last[2] - footprint) < .2) return;
      last = [x, z, footprint];
      circles.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(footprint * 100) / 100]);
    });
  }
  return circles;
}
