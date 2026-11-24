// Controller aim assist, after the two parts Call of Duty uses:
//  - Slowdown: the right stick turns more slowly while the crosshair is over or near a pathogen,
//    so it is easier to stop on one instead of sweeping past it.
//  - Rotational assist: while the player is steering (either stick), the view carries along with
//    a pathogen's movement across the screen, so strafing fights and darting spores stay
//    trackable. It never moves the view on its own: no input, no help.
// Both fade with angular distance and range, and both are stronger when aiming down sights.

const RANGE = 70;
const BUBBLE = { hip: .055, ads: .085 };    // Radians around a target's outline where help starts.
const SLOWDOWN = { hip: .32, ads: .5 };     // How much of the stick speed is held back at the centre.
const ROTATION = { hip: .35, ads: .6 };     // Share of the target's angular motion carried along.
const MAX_FOLLOW = .045;                    // Radians per frame rotation may add.

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

// Direction from the eye to a point, as the yaw and pitch the view would need to face it.
export function bearing(player, point) {
  const dx = point.x - player.x, dy = (point.y ?? player.y) - player.y, dz = point.z - player.z;
  const flat = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, flat), distance: Math.hypot(flat, dy) };
}

export class AimAssist {
  constructor() {
    this.targetId = null;
    this.last = null;
  }

  reset() {
    this.targetId = null;
    this.last = null;
  }

  // The pathogen the help is about: the one nearest the crosshair inside its bubble, or null.
  pick(player, enemies, aiming) {
    const margin = aiming ? BUBBLE.ads : BUBBLE.hip;
    let best = null;
    for (const enemy of enemies ?? []) {
      if (enemy.hidden || enemy.health <= 0) continue;
      const aim = bearing(player, enemy);
      if (aim.distance > RANGE || aim.distance < .5) continue;
      const dYaw = wrap(aim.yaw - player.yaw) * Math.cos(player.pitch);
      const dPitch = aim.pitch - player.pitch;
      const offset = Math.hypot(dYaw, dPitch);
      const outline = Math.atan((enemy.radius ?? 1) / aim.distance);
      const bubble = outline + margin;
      if (offset > bubble) continue;
      // 1 over the outline's centre, 0 at the bubble's edge; distant targets get a little less.
      const closeness = Math.min(1, (bubble - offset) / Math.max(.001, bubble - outline * .35));
      const strength = closeness * (1 - .4 * aim.distance / RANGE);
      if (!best || strength > best.strength) best = { enemy, aim, strength };
    }
    return best;
  }

  // Adjusts this frame's controller look (in the simulation's look units) and returns it.
  // `turn` converts look units to radians (the simulation's turn sensitivity for this frame).
  apply({ mode = 'standard', player, enemies, lookX, lookY, moving = false, aiming = false, turn }) {
    if (mode === 'off' || !player || !(turn > 0)) {
      this.reset();
      return { lookX, lookY };
    }
    const target = this.pick(player, enemies, aiming);
    if (!target) {
      this.reset();
      return { lookX, lookY };
    }
    const steering = moving || Math.hypot(lookX, lookY) > 0;
    const slow = 1 - (aiming ? SLOWDOWN.ads : SLOWDOWN.hip) * target.strength;
    lookX *= slow;
    lookY *= slow;

    const key = target.enemy.id ?? target.enemy;
    const same = this.targetId === key && this.last;
    if (mode === 'standard' && same && steering) {
      const share = (aiming ? ROTATION.ads : ROTATION.hip) * target.strength;
      const clampTurn = value => Math.max(-MAX_FOLLOW, Math.min(MAX_FOLLOW, value));
      const followYaw = clampTurn(wrap(target.aim.yaw - this.last.yaw) * share);
      const followPitch = clampTurn((target.aim.pitch - this.last.pitch) * share);
      // The simulation turns by yaw -= lookX * turn and pitch -= lookY * turn.
      lookX -= followYaw / turn;
      lookY -= followPitch / turn;
    }
    this.targetId = key;
    this.last = { yaw: target.aim.yaw, pitch: target.aim.pitch };
    return { lookX, lookY };
  }
}
