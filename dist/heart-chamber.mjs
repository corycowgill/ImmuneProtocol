// The Heart Valve chamber's layout: four valves set into the edge of a full-size arena, a tissue
// wound in front of each, and the spore colonies rooted on the floor behind each valve. Pure data
// and geometry, shared by the simulation (collision, shots, colony fire) and the renderer.
//
// Each valve is a muscular sleeve lying on the floor. Its mouth faces the middle of the chamber
// and the sleeve runs `SLEEVE_LENGTH` metres outward behind it. In a valve's own frame, `u` is the
// distance outward from the mouth (negative in front of it) and `v` is the sideways offset.

// Height of each valve's centre and the radius of its rim (the leaflets close inside it).
export const VALVE_CENTER_Y = 2;
export const VALVE_RIM = 3.65;
// How far the sleeve reaches behind the mouth, how wide and tall it is (for shots and collision).
export const SLEEVE_LENGTH = 14;
export const SLEEVE_HALF_WIDTH = 6.6;
export const SLEEVE_TOP = 8.75;
// The wound each valve's colonies spit at sits this far in front of the mouth, a little to one side
// so a suit standing guard over it still has a clear line through the aperture.
const WOUND_DISTANCE = 9;
const WOUND_SIDE = -2.6;

// Open and closed times per valve. Each valve runs the same beat a quarter-cycle after the one
// before it, so the open windows roll around the chamber and the squad has to run between them.
// Every valve starts shut; the first opens FIRST_OPEN seconds in.
export const VALVE_CLOSED_TIME = 7.2;
export const VALVE_OPEN_TIME = 3.6;
export const VALVE_PERIOD = VALVE_CLOSED_TIME + VALVE_OPEN_TIME;
export const VALVE_LEAFLET_TIME = .42;
const FIRST_OPEN = 4.5;

// Where a valve is in its beat at `clock`: open or not, and how long until that changes.
export function valveBeat(valve, clock) {
  if (clock < valve.offset) return { open: false, elapsed: 0, remaining: valve.offset - clock, duration: VALVE_CLOSED_TIME };
  const elapsed = (clock - valve.offset) % VALVE_PERIOD;
  return elapsed < VALVE_OPEN_TIME
    ? { open: true, elapsed, remaining: VALVE_OPEN_TIME - elapsed, duration: VALVE_OPEN_TIME }
    : { open: false, elapsed: elapsed - VALVE_OPEN_TIME, remaining: VALVE_PERIOD - elapsed, duration: VALVE_CLOSED_TIME };
}

// The aperture's radius at a given openness (0 closed, 1 fully open). The renderer shapes the
// leaflets with the same curve, so what you see is what a shot has to fit through.
export const apertureRadius = openness => .035 + 2.35 * openness ** .6;

// mouth: the centre of the valve on the floor; out: the unit direction the sleeve runs (away from
// the middle of the chamber). They open in this order, round the chamber.
const LAYOUT = [
  { id: 'mitral', name: 'Mitral', mouth: [0, -50], out: [0, -1] },
  { id: 'tricuspid', name: 'Tricuspid', mouth: [37, 4], out: [1, 0] },
  { id: 'aortic', name: 'Aortic', mouth: [0, 50], out: [0, 1] },
  { id: 'pulmonary', name: 'Pulmonary', mouth: [-37, -10], out: [-1, 0] },
];

// Three colonies root behind every valve: two flanking the aperture and one deeper in the middle.
const COLONY_SPOTS = [[3.6, -1.9], [5.6, 0], [3.6, 1.9]];

export const HEART_VALVES = Object.freeze(LAYOUT.map(({ id, name, mouth: [x, z], out: [ox, oz] }, index) => Object.freeze({
  id, name, index, x, z, ox, oz,
  // Sideways axis, and the yaw that turns a model built along -z to run outward.
  lx: -oz, lz: ox, yaw: Math.atan2(-ox, -oz),
  // When this valve first opens.
  offset: FIRST_OPEN + index * VALVE_PERIOD / LAYOUT.length,
  wound: Object.freeze({ x: x - ox * WOUND_DISTANCE - oz * WOUND_SIDE, z: z - oz * WOUND_DISTANCE + ox * WOUND_SIDE }),
  colonies: Object.freeze(COLONY_SPOTS.map(([u, v]) => Object.freeze({ x: x + ox * u - oz * v, z: z + oz * u + ox * v }))),
})));

export const HEART_NODES = Object.freeze(HEART_VALVES.map(valve => Object.freeze({
  id: 'heart-' + valve.id, name: valve.name + ' Wound', x: valve.wound.x, y: 1.25, z: valve.wound.z, valveIndex: valve.index,
})));

// A point in a valve's own frame.
export function valveFrame(valve, x, z) {
  const dx = x - valve.x;
  const dz = z - valve.z;
  return { u: dx * valve.ox + dz * valve.oz, v: dx * valve.lx + dz * valve.lz };
}

// Whether a point lies inside a valve's sleeve (behind its mouth).
export function insideSleeve(valve, point) {
  const { u, v } = valveFrame(valve, point.x, point.z);
  return u > 0 && u < SLEEVE_LENGTH && Math.abs(v) < SLEEVE_HALF_WIDTH && (point.y ?? 0) < SLEEVE_TOP;
}

// Where a ray from `origin` along `ray` meets this valve's sleeve, if it does: the distance along
// the ray, and whether it enters through the mouth (and how far off the valve's centre) or hits
// the muscle outside. `exit` is where a ray that got in through the mouth meets the far wall.
export function traceSleeve(valve, origin, ray) {
  const { u: pu, v: pv } = valveFrame(valve, origin.x, origin.z);
  const du = ray.x * valve.ox + ray.z * valve.oz;
  const dv = ray.x * valve.lx + ray.z * valve.lz;
  let enter = -Infinity;
  let exit = Infinity;
  let face = null;
  for (const [p, d, low, high, name] of [
    [pu, du, 0, SLEEVE_LENGTH, 'mouth'],
    [pv, dv, -SLEEVE_HALF_WIDTH, SLEEVE_HALF_WIDTH, 'side'],
    [origin.y, ray.y, -Infinity, SLEEVE_TOP, 'top'],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < low || p > high) return null;
      continue;
    }
    let near = (low - p) / d;
    let far = (high - p) / d;
    // A ray entering at the low u bound comes in through the mouth.
    let nearFace = name === 'mouth' ? (d > 0 ? 'mouth' : 'back') : name;
    if (near > far) [near, far] = [far, near];
    if (near > enter) {
      enter = near;
      face = nearFace;
    }
    exit = Math.min(exit, far);
  }
  if (enter > exit || exit <= 0 || enter < 0) return null;
  if (face !== 'mouth') return { distance: enter, mouth: false, exit };
  const offset = Math.hypot(pv + dv * enter, origin.y + ray.y * enter - VALVE_CENTER_Y);
  return { distance: enter, mouth: offset <= VALVE_RIM + .3, offset, exit };
}

// Solid footprints [x, z, radius]: each sleeve (two discs down its length and one either side of
// the mouth), the four papillary muscles that stand between the valves, and two low clots for cover.
export const HEART_OBSTACLES = Object.freeze([
  ...HEART_VALVES.flatMap(valve => [[5, 0, 6.6], [10.5, 0, 6.6], [.5, -4.6, 2.2], [.5, 4.6, 2.2]].map(([u, v, r]) =>
    [valve.x + valve.ox * u + valve.lx * v, valve.z + valve.oz * u + valve.lz * v, r])),
  [-19, -26, 2.6], [19, -26, 2.6], [-20, 27, 2.6], [20, 27, 2.6],
  [-9, -12, 2.1], [10, 16, 2.1],
].map(item => Object.freeze(item.map(value => Math.round(value * 100) / 100))));

// Where flank patrols come in: the four quarters between the valves.
export const HEART_PATROL_ENTRIES = Object.freeze([
  { x: -42, z: -36 }, { x: 42, z: -36 }, { x: 42, z: 40 }, { x: -42, z: 40 },
].map(Object.freeze));

export const HEART_ENTRY = Object.freeze({ x: 0, z: 6 });
