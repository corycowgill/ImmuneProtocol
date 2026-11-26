// Plain HUD data the game hands straight to the canvas interface, without going through the
// page's hidden HTML. New HUD readouts belong here, so the interface carries over to platforms
// with no DOM. The game writes it each frame (hud.mjs drawHud); ui-bindings.mjs reads it.
export const hudFeed = {
  // The motion tracker (radar.mjs radarSnapshot), plus the camera's horizontal field of view.
  radar: null,
  // Set while a Grip Phage clings to the suit: { key } names the bash control (null on touch,
  // where the bash button itself pulses).
  grip: null,
};
