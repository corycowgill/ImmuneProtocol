// First-time prompts for the suit's moves, each shown once (remembered in the browser) at the
// moment it would help: a dash when a pathogen first winds up at you, a jump beside raised ground,
// raised ground when a hazard is coming, a bash when something latches nearby, a grenade into a
// crowd, a stun charge when a node is swarmed, and dragging the turret. Uses the player's own key
// bindings, controller buttons or touch buttons. Off with Settings > Controls > Ability hints.
import { session } from './session.mjs';
import { byId, isTouch, setText } from './dom.mjs';
import { actionKey } from './keybinds.mjs';
import { readSetting, writeSetting } from './settings-store.mjs';
import { STEP_HEIGHT, pieceHeight } from './terrain.mjs';

const KEY = 'immune-protocol.hints-seen';
const SHOW_SECONDS = 5.5;
const GAP_SECONDS = 9;
const PAD = { dash: 'B', jump: 'A', melee: 'the right stick (click)', grenade: 'D-pad up', stun: 'D-pad down', turret: 'RB' };
const TOUCH = { dash: 'Dash', jump: 'Jump', melee: 'Bash', grenade: 'Grenade', stun: 'Stun', turret: 'Move' };

const panel = byId('ability-hint');
const title = byId('ability-hint-title');
const detail = byId('ability-hint-detail');

let seen = new Set();
try { seen = new Set(JSON.parse(readSetting(KEY) ?? '[]')); } catch { /* Start fresh. */ }
let showing = null;
let remaining = 0;
let quiet = 0;
let turretPlacedAt = null;

function key(action) {
  if (session.usingGamepad) return PAD[action];
  if (isTouch) return TOUCH[action];
  return actionKey(action);
}

const HAZARD_TEXT = {
  stomach: ['Get onto a rugae island', 'Acid floods the whole chamber. Jump onto any island: the acid cannot reach you there.'],
  intestines: ['Climb a villus terrace', 'The pressure wave sweeps the whole bend. Its top two tiers ride it out.'],
  colon: ['Climb onto a fold', 'Stand on a fold\'s crest and the squeeze passes beneath you.'],
};

// Each hint: id, test(sim, own suit's player) -> true when it would help now, and its text.
const HINTS = [
  { id: 'dash', when: (sim, player, events) => events.some(event => event.type === 'enemyAttack' && event.stage === 'windup' &&
      event.target === 'player' && (event.targetPlayerId == null || event.targetPlayerId === player.id)),
    text: () => ['Dash out of the attack', `Press ${key('dash')} with a direction as it winds up. A hit in the first moment of a dash misses you.`] },
  { id: 'hazard', when: sim => sim.organ?.phase === 'warning' && !!HAZARD_TEXT[sim.area], text: sim => HAZARD_TEXT[sim.area] },
  { id: 'melee', when: (sim, player) => sim.enemies.some(enemy => (enemy.latched || enemy.attackingTissue) && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 4.2),
    text: () => ['Bash it off the tissue', `Press ${key('melee')} to knock latched pathogens off nearby tissue and throw them back.`] },
  { id: 'grenade', when: (sim, player) => (sim.ability?.grenades ?? 0) > 0 &&
      sim.enemies.filter(enemy => !enemy.boss && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 13).length >= 4,
    text: () => ['Throw an antibody grenade', `Press ${key('grenade')}. It bursts on contact: heavy damage across 6 m.`] },
  { id: 'stun', when: sim => (sim.ability?.stuns ?? 0) > 0 && sim.nodes.some(node =>
      sim.enemies.filter(enemy => (enemy.latched || enemy.attackingTissue) && enemy.nodeId === node.id).length >= 2),
    text: () => ['Stun the swarm', `Press ${key('stun')}. Everything within 7 m freezes for three seconds.`] },
  { id: 'jump', when: (sim, player) => (sim.terrain ?? []).some(piece => {
      const top = piece.top ?? 0;
      if (top <= STEP_HEIGHT) return false;
      const ahead = { x: player.x - Math.sin(player.yaw) * 2.5, z: player.z - Math.cos(player.yaw) * 2.5 };
      return pieceHeight(piece, ahead.x, ahead.z) > STEP_HEIGHT && (player.feet ?? 0) < .2;
    }),
    text: () => ['Jump up', `Press ${key('jump')} to climb raised ground. Crawlers cannot follow you up.`] },
  { id: 'turret', when: sim => !!sim.turret && turretPlacedAt != null && sim.clock - turretPlacedAt > 25,
    text: () => ['Move your turret any time', `Hold ${key('turret')} to pick it up and drag it to a new spot.`] },
];

function remember(id) {
  seen.add(id);
  writeSetting(KEY, JSON.stringify([...seen]));
}

// Called every frame of play after the simulation step.
export function updateAbilityHints(dt) {
  const sim = session.sim;
  if (sim?.turret && turretPlacedAt == null) turretPlacedAt = sim.clock;
  if (!sim?.turret) turretPlacedAt = null;
  if (showing) {
    remaining -= dt;
    if (remaining <= 0) hide();
    return;
  }
  quiet = Math.max(0, quiet - dt);
  if (!session.running || session.paused || !sim || sim.tutorial || quiet > 0 || session.options?.['ability-hints'] === false) return;
  if (sim.phase !== 'combat' && sim.phase !== 'intermission') return;
  const player = sim.player;
  if (!player || player.health <= 0) return;
  const events = sim.events ?? [];
  for (const hint of HINTS) {
    if (seen.has(hint.id) || !hint.when(sim, player, events)) continue;
    const [heading, body] = hint.text(sim);
    setText(title, heading);
    setText(detail, body);
    panel.hidden = false;
    showing = hint.id;
    remaining = SHOW_SECONDS;
    remember(hint.id);
    return;
  }
}

function hide() {
  panel.hidden = true;
  showing = null;
  quiet = GAP_SECONDS;
}

export function clearAbilityHints() {
  if (showing) hide();
  quiet = 2;
  turretPlacedAt = null;
}

// Settings: show every hint again from the start.
export function resetAbilityHints() {
  seen = new Set();
  writeSetting(KEY, '[]');
}
