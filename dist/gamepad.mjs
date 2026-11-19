const EDGE_BUTTONS = {
  confirm: 0, back: 1, pause: 9, reload: 2, swap: 3, deploy: 5,
  up: 12, down: 13, left: 14, right: 15,
};

const HELD_BUTTONS = { fire: 7, aim: 6, repair: 4, sprint: 10 };
const BUTTONS = [...Object.values(EDGE_BUTTONS), ...Object.values(HELD_BUTTONS)];
const EDGE_ENTRIES = Object.entries(EDGE_BUTTONS);
const MOVE_DEAD_ZONE = .17;
const LOOK_DEAD_ZONE = .19;
const LOOK_RESPONSE = 1.6;
const CENTER = Object.freeze({ x: 0, y: 0 });
const NO_BUTTON_EDGES = Object.freeze(Object.fromEntries(EDGE_ENTRIES.map(([action]) => [action, false])));
const INACTIVE = Object.freeze({
  connected: false, disconnected: false, active: false,
  moveX: 0, moveZ: 0, lookX: 0, lookY: 0, menuX: 0, menuY: 0,
  fire: false, aim: false, repair: false, sprint: false,
  pressed: NO_BUTTON_EDGES,
});

function isStandardGamepad(pad) {
  return pad?.connected && pad.mapping === 'standard' && pad.axes.length >= 4 && pad.buttons.length >= 16;
}

function readMappedPads(read) {
  try {
    return Array.from(read() ?? []).filter(isStandardGamepad);
  } catch {
    // The browser can deny polling when Gamepad API access is restricted.
    return [];
  }
}

function readStick(axes, offset, deadZone, exponent) {
  const x = Number.isFinite(axes[offset]) ? axes[offset] : 0;
  const y = Number.isFinite(axes[offset + 1]) ? axes[offset + 1] : 0;
  const distance = Math.hypot(x, y);
  if (distance <= deadZone) return CENTER;
  const strength = (Math.min(distance, 1) - deadZone) / (1 - deadZone);
  const scale = strength ** exponent / distance;
  return { x: x * scale, y: y * scale };
}

function readButtons(gamepadButtons) {
  let mask = 0;
  for (const index of BUTTONS) {
    const button = gamepadButtons[index];
    const threshold = index === HELD_BUTTONS.fire || index === HELD_BUTTONS.aim ? .24 : .5;
    if (button?.pressed || button?.value >= threshold) mask |= 1 << index;
  }
  return mask;
}

function hasButton(mask, index) {
  return Boolean(mask & (1 << index));
}

export class GamepadInput {
  constructor(read = () => globalThis.navigator?.getGamepads?.()) {
    this.read = read;
    this.index = null;
    this.id = '';
    this.reset();
  }

  reset() {
    const pad = this.index === null ? null : this.selectedPad(readMappedPads(this.read));
    this.latchOnNextPoll = !pad;
    this.blockedButtons = pad ? readButtons(pad.buttons) : 0;
    this.blockedMove = !!pad && readStick(pad.axes, 0, MOVE_DEAD_ZONE, 1) !== CENTER;
    this.blockedLook = !!pad && readStick(pad.axes, 2, LOOK_DEAD_ZONE, LOOK_RESPONSE) !== CENTER;
    this.previousButtons = 0;
  }

  selectedPad(available) {
    return available.find(pad => pad.index === this.index && pad.id === this.id);
  }

  poll() {
    const available = readMappedPads(this.read);
    let pad = this.selectedPad(available);
    const disconnected = this.index !== null && !pad;
    if (!pad) {
      pad = available.find(pad => /xbox|xinput|vendor:\s*045e/i.test(pad.id)) ?? available[0];
      this.index = pad?.index ?? null;
      this.id = pad?.id ?? '';
      this.latchOnNextPoll = true;
      this.previousButtons = 0;
    }
    if (!pad) return disconnected ? { ...INACTIVE, disconnected: true } : INACTIVE;

    const rawButtons = readButtons(pad.buttons);
    let move = readStick(pad.axes, 0, MOVE_DEAD_ZONE, 1);
    let look = readStick(pad.axes, 2, LOOK_DEAD_ZONE, LOOK_RESPONSE);
    const active = rawButtons !== 0 || move !== CENTER || look !== CENTER;

    // Controls already held on a context change become eligible independently as each returns to neutral.
    if (this.latchOnNextPoll) {
      this.blockedButtons = rawButtons;
      this.blockedMove = move !== CENTER;
      this.blockedLook = look !== CENTER;
      this.latchOnNextPoll = false;
    }
    this.blockedButtons &= rawButtons;
    this.blockedMove = this.blockedMove && move !== CENTER;
    this.blockedLook = this.blockedLook && look !== CENTER;
    const buttons = rawButtons & ~this.blockedButtons;
    const buttonEdges = buttons & ~this.previousButtons;
    this.previousButtons = buttons;
    if (this.blockedMove) move = CENTER;
    if (this.blockedLook) look = CENTER;

    const dpadX = Number(hasButton(buttons, EDGE_BUTTONS.right)) - Number(hasButton(buttons, EDGE_BUTTONS.left));
    const dpadY = Number(hasButton(buttons, EDGE_BUTTONS.down)) - Number(hasButton(buttons, EDGE_BUTTONS.up));
    const useDpad = dpadX !== 0 || dpadY !== 0;
    const pressed = {};
    for (const [action, index] of EDGE_ENTRIES) pressed[action] = hasButton(buttonEdges, index);
    return {
      connected: true, disconnected, active,
      moveX: move.x, moveZ: move.y ? -move.y : 0, lookX: look.x, lookY: look.y,
      menuX: useDpad ? dpadX : move.x, menuY: useDpad ? dpadY : move.y,
      fire: hasButton(buttons, HELD_BUTTONS.fire), aim: hasButton(buttons, HELD_BUTTONS.aim),
      repair: hasButton(buttons, HELD_BUTTONS.repair), sprint: hasButton(buttons, HELD_BUTTONS.sprint),
      pressed,
    };
  }
}
