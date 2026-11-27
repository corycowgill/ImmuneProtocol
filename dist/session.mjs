// Live state shared by the game's modules: the game loop and menus (game.mjs), the HUD
// (hud.mjs), field events (field-events.mjs), input (controls.mjs) and the armory menu
// (armory-menu.mjs). An imported variable is read-only, so anything one module changes and
// another reads lives here. game.mjs fills in the real values while it starts up.
export const session = {
  // The 3D world, the sound engine, and the mission being played (a Simulation, or the latest
  // co-op snapshot). sim is also set while no mission runs, to the one last played.
  world: null,
  audio: null,
  // Controller rumble (haptics.mjs), fed by field events and refreshed each frame.
  haptics: null,
  sim: null,
  // Startup has finished; a mission is running; it is paused; it is an online co-op match.
  ready: false,
  running: false,
  paused: false,
  onlineRun: false,
  // The last input came from a controller (prompts show its buttons).
  usingGamepad: false,
  muted: false,
  // Look sensitivity from Settings, 0.5 to 2.5.
  sensitivity: 1,
  // First-time training at Arterial Junction has been completed.
  trainingComplete: false,
  // The two carried weapons and their builds, as saved.
  weaponLoadout: null,
  // The armory's photography and its screen.
  armoryArt: null,
  armoryScreen: null,
  // HUD feedback set by field events and read each frame: the hit marker and damage flash
  // timers, the node just restored to full, the centre announcement's remaining time, and when
  // the Shellback hint may show again. A kill confirmation and the direction of the last hit on
  // the suit (in world x/z) are kept alongside them.
  hitTimer: 0,
  // Counts down after this suit's shot bounces off a shielded boss.
  shieldedTimer: 0,
  shieldedBy: null,
  killTimer: 0,
  damageTimer: 0,
  damageFrom: null,
  restoredNode: null,
  announcementTimer: 0,
  guardHintUntil: 0,
};
