// While a co-op suit is down, its player watches a teammate who is still fighting, from over their
// shoulder, and can switch between teammates. The view goes back to the suit when someone starts
// reviving it, so the player sees who came for them.
export const SPECTATE_CAMERA = Object.freeze({ back: 3.2, up: .9, side: .55, pitch: -.16 });

// The teammate to watch, or null for the suit's own view. `cycle` moves on to the next one.
export function spectateTarget(sim, current, cycle = false) {
  const me = sim?.player;
  if (!me?.downed || (me.reviveProgress ?? 0) > 0) return null;
  const watchable = (sim.players ?? []).filter(player => player.id !== me.id && player.linked !== false && !player.downed && player.health > 0);
  if (!watchable.length) return null;
  const index = watchable.findIndex(player => player.id === current);
  if (index < 0) return watchable[0].id;
  return cycle ? watchable[(index + 1) % watchable.length].id : current;
}

// Where the spectator camera sits: behind and above the watched suit's right shoulder, looking
// where it looks. A suit faces -z at yaw 0, so behind it is +z.
export function spectatePose(player, ground = 0) {
  const { back, up, side, pitch } = SPECTATE_CAMERA;
  const sin = Math.sin(player.yaw ?? 0), cos = Math.cos(player.yaw ?? 0);
  return {
    x: player.x + sin * back + cos * side,
    y: Math.max(ground + 1.2, player.y + up),
    z: player.z + cos * back - sin * side,
    yaw: player.yaw ?? 0,
    pitch: pitch + (player.pitch ?? 0) * .5,
  };
}
