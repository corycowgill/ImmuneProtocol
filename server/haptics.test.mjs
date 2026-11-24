import assert from 'node:assert/strict';
import test from 'node:test';
import { Haptics, WEAPON_KICK } from '../dist/haptics.mjs';

// A fake Chromium Xbox pad that records every rumble command.
function fakePad({ triggers = true } = {}) {
  const calls = [];
  return {
    calls,
    vibrationActuator: {
      effects: triggers ? ['dual-rumble', 'trigger-rumble'] : ['dual-rumble'],
      playEffect(type, params) { calls.push({ type, ...params }); return Promise.resolve('complete'); },
      reset() { calls.push({ type: 'reset' }); return Promise.resolve('complete'); },
    },
  };
}

const player = { x: 0, z: 0, yaw: 0 };

test('heavy weapons kick longer than automatic ones, and the shot reaches the right trigger', () => {
  assert.ok(WEAPON_KICK.shotgun.ms > WEAPON_KICK.carbine.ms);
  // An automatic kick must end before the next round (carbine fires every 118 ms).
  assert.ok(WEAPON_KICK.carbine.ms < 118);

  const pad = fakePad();
  const haptics = new Haptics(() => pad);
  haptics.update(0);
  haptics.event({ type: 'shot', weapon: 'shotgun', pellet: 0, hit: false }, { player });
  const mix = haptics.update(5);
  assert.ok(mix.strong > .8 && mix.right > .5);
  assert.equal(pad.calls.at(-1).type, 'trigger-rumble');
  assert.ok(pad.calls.at(-1).duration > 34, 'each command bridges the refresh interval');
});

test('extra shotgun pellets do not stack more kick, and the motors fall silent afterwards', () => {
  const pad = fakePad();
  const haptics = new Haptics(() => pad);
  haptics.update(0);
  haptics.event({ type: 'shot', weapon: 'carbine', hit: false }, { player });
  const single = haptics.update(1).strong;
  haptics.stop();
  haptics.update(2);
  for (let pellet = 0; pellet < 9; pellet++) haptics.event({ type: 'shot', weapon: 'carbine', pellet, hit: false }, { player });
  assert.ok(Math.abs(haptics.update(3).strong - single) < .05);
  assert.deepEqual(haptics.update(1000), { strong: 0, weak: 0, left: 0, right: 0 });
  assert.equal(pad.calls.at(-1).type, 'reset');
  assert.equal(haptics.update(1100), null, 'nothing is sent while idle');
});

test('damage lands in the grip on the side it came from', () => {
  const left = new Haptics(() => null);
  left.update(0);
  left.event({ type: 'damage', target: 'player', amount: 12, x: -5, z: 0 }, { player });
  const fromLeft = left.update(8);
  const right = new Haptics(() => null);
  right.update(0);
  right.event({ type: 'damage', target: 'player', amount: 12, x: 5, z: 0 }, { player });
  const fromRight = right.update(8);
  assert.ok(fromLeft.strong > fromRight.strong);
  assert.ok(fromRight.weak > fromLeft.weak);
});

test('explosions fade with distance and teammates only reach you through the ground', () => {
  const blast = distance => {
    const haptics = new Haptics(() => null);
    haptics.update(0);
    haptics.event({ type: 'explosion', x: distance, z: 0 }, { player });
    return haptics.update(15)?.strong ?? 0;
  };
  assert.ok(blast(2) > blast(20));
  assert.equal(blast(200), 0);

  const haptics = new Haptics(() => null);
  haptics.update(0);
  haptics.event({ type: 'shot', weapon: 'sniper', hit: true }, { player, teammate: true });
  haptics.event({ type: 'damage', target: 'player', amount: 20, x: 1, z: 0 }, { player, teammate: true });
  assert.equal(haptics.update(5), null);
});

test('a low suit beats like a heart, faster as it falls', () => {
  const beats = health => {
    const haptics = new Haptics(() => null);
    let count = 0;
    for (let now = 0; now < 4000; now += 16) {
      const before = haptics.nextBeat;
      haptics.update(now, { health, maxHealth: 100 });
      if (haptics.nextBeat !== before && haptics.nextBeat > now) count++;
    }
    return count;
  };
  assert.equal(beats(80), 0);
  assert.ok(beats(5) > beats(30));
  assert.ok(beats(30) > 0);
});

test('the vibration setting scales everything and zero turns it off; triggers have their own scale', () => {
  const haptics = new Haptics(() => null);
  haptics.configure({ intensity: .5, triggers: 0 });
  haptics.update(0);
  haptics.event({ type: 'shot', weapon: 'sniper', hit: false }, { player });
  const mix = haptics.update(6);
  assert.ok(mix.strong <= .5 && mix.strong > .3);
  assert.equal(mix.right, 0);
  haptics.configure({ intensity: 0 });
  haptics.event({ type: 'explosion', x: 0, z: 0 }, { player });
  assert.equal(haptics.update(20), null);
});

test('pads without trigger motors get dual rumble, older Firefox pads a pulse, and errors stay quiet', () => {
  const pad = fakePad({ triggers: false });
  const haptics = new Haptics(() => pad);
  haptics.update(0);
  haptics.event({ type: 'dry' }, { player });
  haptics.event({ type: 'melee', hits: 1 }, { player });
  haptics.update(10);
  assert.equal(pad.calls.at(-1).type, 'dual-rumble');

  const pulses = [];
  const firefox = new Haptics(() => ({ hapticActuators: [{ pulse: (value, ms) => { pulses.push([value, ms]); return Promise.resolve(true); } }] }));
  firefox.update(0);
  firefox.event({ type: 'kill' }, { player });
  firefox.update(30);
  assert.ok(pulses.length && pulses[0][0] > 0);

  const broken = new Haptics(() => ({ vibrationActuator: { playEffect() { throw new Error('gone'); } } }));
  broken.update(0);
  broken.event({ type: 'explosion', x: 0, z: 0 }, { player });
  assert.doesNotThrow(() => broken.update(10));
});

test('light guns kick hard enough to feel: full power held while the motors spin up', () => {
  for (const weapon of ['carbine', 'pistol']) {
    const haptics = new Haptics(() => null);
    haptics.update(0);
    haptics.event({ type: 'shot', weapon, hit: false }, { player });
    const start = haptics.update(1);
    const held = haptics.update(38);
    assert.ok(start.strong >= .6 && start.weak >= .9, weapon + ' starts strong');
    assert.ok(Math.abs(held.strong - start.strong) < .01, weapon + ' still at full power after 38 ms');
    assert.ok(haptics.update(WEAPON_KICK[weapon].ms + 1)?.strong === 0 || WEAPON_KICK[weapon].ms < 118);
  }
});

test('the vibration slider can boost past 100%', () => {
  const normal = new Haptics(() => null);
  const boosted = new Haptics(() => null);
  boosted.configure({ intensity: 1.5 });
  for (const haptics of [normal, boosted]) {
    haptics.update(0);
    haptics.event({ type: 'shot', weapon: 'carbine', hit: false }, { player });
  }
  assert.ok(boosted.update(5).strong > normal.update(5).strong);
});

test('every weapon kicks equally hard and holds it while the motors spin up', () => {
  const peaks = Object.keys(WEAPON_KICK).map(weapon => {
    const haptics = new Haptics(() => null);
    haptics.update(0);
    haptics.event({ type: 'shot', weapon, hit: false }, { player });
    haptics.update(5);
    return { weapon, mix: haptics.update(40) };
  });
  for (const { weapon, mix } of peaks) {
    for (const channel of ['strong', 'weak', 'right']) {
      assert.ok(Math.abs(mix[channel] - peaks[0].mix[channel]) < .02, weapon + ' ' + channel + ' matches the others at 40 ms');
    }
  }
});
