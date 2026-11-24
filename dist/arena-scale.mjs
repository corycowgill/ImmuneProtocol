// How much larger the arenas are than the layouts were first authored at. Positions in the
// layout tables (tissue nodes, inlets, obstacles, hazard zones) and the scenery that was built
// around them are all multiplied by this, so a level keeps its shape and simply gets bigger.
// The Heart Valve is laid out directly at the full size (heart-chamber.mjs).
export const ARENA_GROWTH = 1.3;
export const grow = value => Math.round(value * ARENA_GROWTH * 100) / 100;
export const growPoint = ([x, z, ...rest]) => [grow(x), grow(z), ...rest];
