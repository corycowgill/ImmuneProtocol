// The motion tracker: what is around the suit, as plain data for the HUD to draw. Pure (no DOM,
// no three.js), so any renderer or platform can draw it. Coordinates are relative to the suit and
// the way it faces: x to the right and y forward, both -1..1 across the tracker's range.
//
// Contacts: pathogens (with an up or down hint when well above or below the suit), bosses, brood
// nests, squadmates, the suit's turret and medic drone, antibody caches and the tissue nodes.
// Nodes and squadmates beyond range stay on the rim, pointing the way to them.

export const RADAR_RANGE = 30;
// How far above or below eye level a pathogen must be to earn an up or down hint, in metres.
const ABOVE = 2.2, BELOW = 1.4;

export function radarSnapshot(sim, { range = RADAR_RANGE, reduceMotion = false } = {}) {
  const player = sim?.player;
  if (!player) return null;
  const yaw = player.yaw ?? 0;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  // The suit faces (-sin, -cos) in the arena; its right is (cos, -sin).
  const place = (x, z) => {
    const dx = x - player.x, dz = z - player.z;
    return { x: (dx * cos - dz * sin) / range, y: (-dx * sin - dz * cos) / range };
  };
  const contacts = [];
  const add = (kind, at, extra = {}, keepOnRim = false) => {
    const point = place(at.x, at.z);
    const distance = Math.hypot(point.x, point.y);
    if (distance > 1) {
      if (!keepOnRim) return;
      point.x /= distance; point.y /= distance;
      extra.rim = true;
    }
    contacts.push({ kind, ...point, ...extra });
  };

  for (const enemy of sim.enemies ?? []) {
    if (enemy.hidden || enemy.health <= 0 || enemy.segmentOf && !enemy.boss) continue;
    const height = (enemy.y ?? 0) - (player.y ?? 1.7);
    const level = height > ABOVE ? 'above' : height < -BELOW ? 'below' : null;
    if (enemy.boss) add('boss', enemy, { size: Math.min(2.4, (enemy.radius ?? 2) / 1.2), level }, true);
    else if (enemy.nest) add('nest', enemy);
    else add('enemy', enemy, { size: Math.max(.8, Math.min(1.5, (enemy.radius ?? 1) / .95)), level });
  }
  (sim.nodes ?? []).forEach((node, index) => {
    if (sim.airway || (sim.tutorial && index > 0)) return;
    add('node', node, { index, health: node.health, attacked: !!node.underAttack }, true);
  });
  for (const pickup of sim.pickups ?? []) add('cache', pickup);
  for (const mate of sim.players ?? []) {
    if (mate === player || mate.id === player.id || mate.health <= 0) continue;
    add('ally', mate, {}, true);
  }
  const turrets = sim.turrets ?? (sim.turret ? [sim.turret] : []);
  for (const turret of turrets) if (turret && !turret.carried) add('turret', turret, { own: (turret.ownerId ?? null) === (player.id ?? null) });
  const drones = sim.drones ?? (sim.drone ? [sim.drone] : []);
  for (const drone of drones) if (drone) add('drone', drone);

  return { range, contacts, time: reduceMotion ? null : sim.clock ?? 0 };
}
