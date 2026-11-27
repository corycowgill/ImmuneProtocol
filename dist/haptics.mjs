// Controller rumble, modelled on how Call of Duty drives a pad: every weapon has its own kick
// (automatic guns light and quick so a burst reads as separate shots, heavy guns a deep thump),
// the trigger under your finger buzzes with each shot, hits and kills answer with short ticks,
// damage lands harder on the side it came from, explosions and boss slams roll in with distance,
// and a heartbeat pulses through the grips when the suit is close to failing.
//
// Effects are short envelopes mixed every frame. The mix is sent to the pad as brief rumble
// commands that are refreshed while anything is playing, so a dropped frame or a pause can never
// leave a motor stuck on. The browser exposes two grip motors (strong = low frequency, left grip;
// weak = high frequency, right grip) and, on Xbox pads in Chromium, the two impulse triggers.

const COMMAND_MS = 90;   // Each command outlives the refresh interval so the mix never gaps.
const REFRESH_MS = 34;
const CHANNELS = ['strong', 'weak', 'left', 'right'];
const SILENT = Object.freeze({ strong: 0, weak: 0, left: 0, right: 0 });

// Recoil kick per weapon. Every weapon hits both grip motors and the right trigger equally
// hard and holds full power long enough for the motors to spin up, so each one is felt as
// clearly as the others. They differ only in length: automatic guns end before the next round
// (the carbine fires every 118 ms) so a burst reads as separate punches; heavy guns last longer.
const KICK = { strong: .9, weak: .9, right: 1 };
export const WEAPON_KICK = Object.freeze({
  carbine: { ...KICK, ms: 92, hold: 45 },
  pistol: { ...KICK, ms: 90, hold: 45 },
  shotgun: { ...KICK, ms: 180, attack: 4, hold: 60 },
  sniper: { ...KICK, ms: 200, attack: 4, hold: 60 },
  launcher: { ...KICK, ms: 190, attack: 4, hold: 60 },
});

// Rumble motors barely move below about a tenth of their power and feel weak until well past
// half, so every non-zero level is lifted onto a curve that starts where the motor does.
const MOTOR_FLOOR = .14;
export function motorLevel(value) {
  if (!(value > .01)) return 0;
  return Math.min(1, MOTOR_FLOOR + (1 - MOTOR_FLOOR) * value ** .7);
}
// Every effect holds full power at least this long (or half its length, if shorter) before fading.
const MIN_HOLD = 35;

function level(effect, t) {
  if (t < 0 || t >= effect.ms) return 0;
  const attack = effect.attack ?? 0;
  if (t < attack) return t / attack;
  const hold = effect.hold ?? Math.min(MIN_HOLD, (effect.ms - attack) / 2);
  if (t < attack + hold) return 1;
  const fall = (t - attack - hold) / Math.max(1, effect.ms - attack - hold);
  return effect.flat ? 1 : (1 - fall) ** (effect.curve ?? 1.6);
}

// Two sources at .5 feel stronger than one but never exceed full power.
function combine(a, b) {
  return 1 - (1 - a) * (1 - b);
}

const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export class Haptics {
  constructor(getPad = () => null) {
    this.getPad = getPad;
    this.effects = [];
    this.intensity = 1;
    this.triggerIntensity = 1;
    this.enabled = true;
    this.now = 0;
    this.sentAt = -Infinity;
    this.sent = SILENT;
    this.nextBeat = 0;
    this.aiming = false;
  }

  configure({ intensity = this.intensity, triggers = this.triggerIntensity } = {}) {
    this.intensity = Math.min(1.5, Math.max(0, Number.isFinite(intensity) ? intensity : 1));
    this.triggerIntensity = clamp01(triggers);
    if (!this.intensity) this.stop();
  }

  // Queues an envelope. `delay` (ms) lets one call build a pattern such as a double tick.
  add(effect, delay = 0) {
    if (!this.enabled || !this.intensity) return;
    this.effects.push({ ...effect, at: this.now + delay });
    // Keep the queue bounded under a storm of pellets and hits.
    if (this.effects.length > 48) this.effects.splice(0, this.effects.length - 48);
    this.sentAt = -Infinity; // Fresh onsets go out on the next update, not up to a refresh later.
  }

  // Reacts to one simulation event. `context` holds the local player and whether a teammate caused it.
  event(event, { player, teammate = false } = {}) {
    if (!event) return;
    const side = player ? sideOf(event, player) : 0;
    const distance = player && Number.isFinite(event.x) ? Math.hypot(event.x - player.x, event.z - player.z) : 0;
    const near = (scale = .08) => 1 / (1 + distance * scale);

    // A teammate's actions only reach your hands when they shake the ground near you.
    if (teammate && !['explosion', 'levelBoss', 'boss', 'stun'].includes(event.type)) return;

    switch (event.type) {
      case 'shot': {
        if (event.blast) break;
        const kick = WEAPON_KICK[event.weapon] ?? WEAPON_KICK.carbine;
        // Pellets after the first share one kick; hits still tick below.
        if (!event.pellet) {
          const steady = this.aiming ? .9 : 1; // Aiming down sights braces the weapon.
          this.add({ strong: kick.strong * steady, weak: kick.weak * steady, right: kick.right, ms: kick.ms, attack: kick.attack, hold: kick.hold });
        }
        if (event.hit && !event.rocket) {
          // Hit confirm: a light, high tick; a weak point lands sharper.
          this.add(event.crit ? { weak: .85, strong: .45, ms: 70 } : { weak: .6, strong: .2, ms: 55 }, 16);
        }
        break;
      }
      case 'kill':
        if (event.source === 'turret' || event.source === 'immune') break;
        // Kill confirm: a quick double thunk.
        this.add({ strong: .75, weak: .7, ms: 75 }, 20);
        this.add({ strong: .55, weak: .5, ms: 90 }, 130);
        break;
      case 'explosion': {
        const force = clamp01(near(.11) * (event.kind === 'antibody' ? 1 : 1.1));
        if (force < .08) break;
        this.add({ strong: force, weak: force * .55, ms: 260 + force * 260, attack: 10, curve: 1.9 });
        this.add({ strong: force * .4, weak: force * .1, ms: 420, curve: 2.6 }, 120); // Debris rumble.
        break;
      }
      case 'damage': {
        if (event.target !== 'player') break;
        const force = clamp01(.35 + (event.amount ?? 10) / 28);
        // Hits from the left land in the left grip, from the right in the right grip.
        this.add({
          strong: force * (.75 - side * .3), weak: force * (.65 + side * .3),
          ms: 150 + force * 80, attack: 6, curve: 2,
        });
        break;
      }
      case 'melee':
        if (event.hits) {
          this.add({ strong: 1, weak: .7, ms: 140, attack: 8, curve: 2 });
        } else this.add({ weak: .25, strong: .08, ms: 70, attack: 20 });
        break;
      case 'dash':
        this.add({ strong: .3, weak: .25, ms: 170, attack: 40, curve: 1.3 });
        break;
      case 'dodge':
        // Perfect dodge: a sharp snap, then a quiet beat while time slows.
        this.add({ strong: .55, weak: .85, ms: 85 });
        this.add({ strong: .18, ms: 320, curve: 1.2 }, 90);
        break;
      case 'mantle':
        this.add({ strong: .25, weak: .2, ms: 120, curve: 1.5 });
        break;
      case 'jump':
        this.add({ weak: .3, ms: 55 });
        break;
      case 'land': {
        const force = clamp01(.15 + (event.speed ?? 0) * .07);
        this.add({ strong: force, weak: force * .4, ms: 90 + force * 90, curve: 2 });
        break;
      }
      case 'throw':
        if (event.stage === 'release') this.add({ weak: .3, strong: .1, ms: 70, attack: 15 });
        else if (event.stage === 'empty') this.add({ right: .3, weak: .1, ms: 30 });
        break;
      case 'stun': {
        const force = clamp01(near(.06));
        if (force > .1) this.add({ weak: force * .8, strong: force * .3, ms: 220, curve: 1.5 });
        break;
      }
      case 'reload':
        // Magazine out on the start, the slap of the fresh one seating on completion.
        if (event.stage === 'complete') {
          this.add({ strong: .55, weak: .6, ms: 80 });
          this.add({ weak: .4, ms: 50 }, 110);
        } else this.add({ weak: .45, strong: .15, ms: 60 });
        break;
      case 'dry':
        this.add({ right: .6, weak: .3, ms: 50 });
        break;
      case 'swap':
        this.add({ weak: .4, strong: .2, ms: 65 });
        break;
      case 'turret':
        if (event.stage === 'deployed' || event.stage === 'redeployed' || event.stage === 'moved') {
          this.add({ strong: .45, weak: .2, ms: 120, curve: 2 });
        }
        break;
      case 'repair':
        if (event.complete) {
          this.add({ weak: .3, ms: 60 });
          this.add({ weak: .4, strong: .15, ms: 90 }, 120);
        }
        break;
      case 'cache':
        if (event.stage === 'collect' && !teammate) {
          this.add({ weak: .35, ms: 60 });
          this.add({ weak: .45, strong: .2, ms: 90 }, 110);
        }
        break;
      case 'wave':
        if (event.stage === 'start') {
          this.add({ strong: .25, ms: 140, attack: 40 });
          this.add({ strong: .35, ms: 200, attack: 40 }, 260);
        }
        break;
      case 'levelBoss':
        if (event.stage === 'arrive') {
          // A long swell as the boss enters.
          this.add({ strong: .75, weak: .2, ms: 1300, attack: 650, curve: 2 });
        } else if (event.stage === 'defeated') {
          this.add({ strong: 1, weak: .6, ms: 900, attack: 15, curve: 1.6 });
          this.add({ strong: .4, ms: 900, curve: 2 }, 500);
        } else if (event.stage === 'ability' && ['slam', 'charge', 'burrow', 'pulse-warning'].includes(event.ability)) {
          const force = clamp01(near(.05));
          if (force > .1) this.add({ strong: force * .8, weak: force * .3, ms: 380, attack: 60, curve: 1.8 });
        }
        break;
      case 'boss':
        if (event.stage === 'phase') this.add({ strong: .8, weak: .3, ms: 700, attack: 120, curve: 1.6 });
        else if (event.stage === 'defeated') {
          this.add({ strong: 1, weak: .7, ms: 1100, attack: 20, curve: 1.4 });
          this.add({ strong: .5, ms: 1000, curve: 2 }, 650);
        } else if (event.stage === 'warning') this.add({ strong: .35, ms: 260, attack: 80 });
        break;
      case 'suit':
        if (event.stage === 'down') this.add({ strong: 1, weak: .5, ms: 800, attack: 10, curve: 1.3 });
        else if (event.stage === 'respawn') this.add({ weak: .4, strong: .2, ms: 180, attack: 60 });
        break;
      case 'won':
        for (let beat = 0; beat < 3; beat++) this.add({ weak: .45, strong: .25, ms: 90 }, beat * 150);
        break;
      case 'lost':
        this.add({ strong: .7, weak: .15, ms: 1400, attack: 40, curve: 1.2 });
        break;
      case 'achievement':
        // Two light taps, so an unlock is felt without being mistaken for a hit.
        this.add({ weak: .35, strong: .1, ms: 70 });
        this.add({ weak: .5, strong: .15, ms: 110 }, 140);
        break;
    }
  }

  // Runs once a frame with what the player is doing right now. Returns the mix it sent, or null.
  update(now, { health = 100, maxHealth = 100, aiming = false, alive = true } = {}) {
    this.now = now;
    // Raising the sights clicks the left trigger, like the scope trigger in Call of Duty.
    if (aiming && !this.aiming) this.add({ left: .6, weak: .25, ms: 55 });
    this.aiming = aiming;

    // Heartbeat below a third of the suit: lub-dub, faster as it drops.
    const fraction = health / Math.max(1, maxHealth);
    if (alive && health > 0 && fraction < .34) {
      if (now >= this.nextBeat) {
        const urgency = 1 - fraction / .34;
        this.add({ strong: .3 + urgency * .35, ms: 110, attack: 25, curve: 2 });
        this.add({ strong: .18 + urgency * .25, ms: 140, attack: 25, curve: 2 }, 190);
        this.nextBeat = now + 1050 - urgency * 470;
      }
    } else this.nextBeat = now;

    const mix = { strong: 0, weak: 0, left: 0, right: 0 };
    let count = 0;
    for (const effect of this.effects) {
      const t = now - effect.at;
      if (t >= effect.ms) continue;
      this.effects[count++] = effect;
      const amount = level(effect, t);
      if (!amount) continue;
      for (const channel of CHANNELS) if (effect[channel]) mix[channel] = combine(mix[channel], effect[channel] * amount);
    }
    this.effects.length = count;
    for (const channel of CHANNELS) {
      const scale = this.intensity * (channel === 'left' || channel === 'right' ? this.triggerIntensity : 1);
      mix[channel] = scale > 0 ? clamp01(motorLevel(mix[channel]) * scale) : 0;
    }
    return this.send(mix, now);
  }

  send(mix, now) {
    const silent = CHANNELS.every(channel => mix[channel] < .01);
    const wasSilent = CHANNELS.every(channel => this.sent[channel] < .01);
    if (silent && wasSilent) return null;
    const changed = CHANNELS.some(channel => Math.abs(mix[channel] - this.sent[channel]) > .04);
    if (!silent && !changed && now - this.sentAt < REFRESH_MS) return null;
    this.sent = silent ? SILENT : mix;
    this.sentAt = now;
    play(this.getPad(), silent ? null : mix);
    return this.sent;
  }

  // Silences the pad at once and forgets queued effects (pause, menus, the end of a mission).
  stop() {
    this.effects.length = 0;
    this.nextBeat = this.now;
    this.aiming = false;
    if (this.sent !== SILENT) play(this.getPad(), null);
    this.sent = SILENT;
    this.sentAt = -Infinity;
  }

  // A short sample of the current strength, played when the setting changes.
  preview(now) {
    this.now = now;
    this.add({ strong: .6, weak: .4, right: .6, left: .6, ms: 220, attack: 15 });
  }
}

// -1 when the source is hard left of where the player faces, +1 hard right.
function sideOf(event, player) {
  const x = Number.isFinite(event.fromX) ? event.fromX : event.x;
  const z = Number.isFinite(event.fromZ) ? event.fromZ : event.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const dx = x - player.x, dz = z - player.z;
  const distance = Math.hypot(dx, dz);
  if (distance < .01) return 0;
  return Math.max(-1, Math.min(1, (dx * Math.cos(player.yaw ?? 0) - dz * Math.sin(player.yaw ?? 0)) / distance));
}

// Hands the mix to whatever rumble API this browser offers. Failures are ignored: rumble is a garnish.
function play(pad, mix) {
  if (!pad) return;
  try {
    const actuator = pad.vibrationActuator;
    if (actuator?.playEffect) {
      if (!mix) {
        if (actuator.reset) actuator.reset()?.catch?.(() => {});
        else actuator.playEffect('dual-rumble', { duration: 0, strongMagnitude: 0, weakMagnitude: 0 })?.catch?.(() => {});
        return;
      }
      const triggers = Array.isArray(actuator.effects) && actuator.effects.includes('trigger-rumble') && (mix.left > 0 || mix.right > 0);
      const params = { startDelay: 0, duration: COMMAND_MS, strongMagnitude: mix.strong, weakMagnitude: mix.weak };
      const result = triggers
        ? actuator.playEffect('trigger-rumble', { ...params, leftTrigger: mix.left, rightTrigger: mix.right })
        : actuator.playEffect('dual-rumble', params);
      result?.catch?.(() => {});
      return;
    }
    // Firefox's older API: one motor strength per actuator.
    const legacy = pad.hapticActuators?.[0];
    if (legacy?.pulse) legacy.pulse(mix ? Math.max(mix.strong, mix.weak) : 0, mix ? COMMAND_MS : 0)?.catch?.(() => {});
  } catch {
    // Some browsers throw while the pad is reconnecting.
  }
}
