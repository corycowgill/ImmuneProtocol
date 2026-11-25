const MUSIC_CUES = [
  { mode: 'drift', file: 'arterial-drift.mp3', volume: 0.36 },
  { mode: 'combat', file: 'immune-response.mp3', volume: 0.43 },
];
// Each level's own combat theme (assets/music/levels/<area>.mp3). Only the current level's
// theme is decoded; until it is ready, or if it fails, the shared combat cue plays instead.
const LEVEL_THEMES = new Set(['artery', 'junction', 'heart', 'lungs', 'stomach', 'intestines', 'colon', 'lymph', 'ear', 'brain']);
const LEVEL_THEME_VOLUME = 0.4;

const SHOTS = ['weapon/shot-1', 'weapon/shot-2', 'weapon/shot-3', 'weapon/shot-4'];
const ENEMY_CUES = {
  virus: { windup: ['field/virus-windup', .47], release: ['field/virus-pounce', .36] },
  spore: { windup: ['field/spore-windup', .44], release: ['field/spore-spit', .39] },
  laser: { windup: ['field/laser-charge', .4], release: ['field/laser-fire', .55] },
  bacillus: { windup: ['field/bacillus-windup', .43] },
  // Heart colonies gurgle and spit like spores, deeper, out of their valve sleeves.
  colony: { release: ['field/spore-spit', .34] },
};
// Which death each pathogen dies (see death-fx.mjs), by species.
const DEATH_VOICES = {
  virus: ['death/pop', .5, 1], phage: ['death/pop', .46, 1.18], splitter: ['death/pop', .48, .9], rogue: ['death/squelch', .54, .86],
  blister: ['death/splat', .55, 1], flagellate: ['death/whip', .48, 1], spore: ['death/puff', .5, 1],
  bacillus: ['death/squelch', .5, 1], filovirus: ['death/squelch', .48, 1.12], amoeba: ['death/squelch', .52, .8],
  guard: ['death/crack', .55, 1], 'rogue-bot': ['death/bot', .6, 1], crawler: ['death/bot', .55, 1.22], colony: ['death/nest', .66, .85], nest: ['death/nest', .62, 1],
  segment: ['death/splat', .55, .7],
};
const ORGAN_CUES = {
  lungs: ['field/virus-pounce', 'field/valve-open', .66],
  stomach: ['field/spore-windup', 'field/valve-open', .69],
  intestines: ['field/valve-close', 'field/valve-open', .74],
  colon: ['field/peristalsis', 'field/peristalsis', .82],
  lymph: ['field/macrophage', 'field/engulf', .9],
  ear: ['field/branch', 'field/spore-windup', 1.11],
  brain: ['field/branch', 'field/valve-blocked', .88],
};
const EFFECTS = [
  ...SHOTS, 'field/deploy', 'field/arterial-bed',
  'weapon/dry', 'weapon/hit', 'weapon/kill', 'weapon/reload-start', 'weapon/reload-complete',
  'field/branch', 'field/tissue-hit', 'field/suit-hit',
  'field/repair-start', 'field/repair-loop', 'field/repair-pulse', 'field/repair-complete',
  'field/wave-start', 'field/wave-clear', 'field/won', 'field/lost',
  'field/valve-open', 'field/valve-close', 'field/valve-blocked',
  'field/mega-pulse', 'field/mega-membrane', 'field/mega-collapse',
  ...Object.values(ENEMY_CUES).flatMap(stages => Object.values(stages).map(([name]) => name)),
];

// Short procedural cues for the colon, lymph node and wave countdown, rendered once at load.
const SYNTH_RATE = 44100;
const SYNTHESIZED = {
  // The suit's moves: dash whoosh, jump servo, landing thud, the shimmer of a perfect dodge, the
  // bash's swing and crunch, the throw, a throwable's clink, and the stun charge's discharge.
  'suit/dash': [.36, (t, noise) => {
    const swell = Math.sin(Math.PI * Math.min(1, t / .36)) ** 2;
    return noise(900 + 5200 * swell) * swell * .9 + Math.sin(2 * Math.PI * (72 * t)) * Math.exp(-t * 20) * .55;
  }],
  'suit/jump': [.2, (t, noise) => noise(2600) * Math.exp(-t * 15) * .45 +
    Math.sin(2 * Math.PI * (170 * t + 320 * t * t)) * Math.exp(-t * 16) * .3],
  'suit/land': [.32, (t, noise) => Math.sin(2 * Math.PI * (62 * t - 40 * t * t)) * Math.exp(-t * 13) +
    noise(420) * Math.exp(-t * 17) * .7],
  'suit/dodge': [.85, (t, noise) => {
    const rise = Math.sin(2 * Math.PI * (380 * t + 760 * t * t)) * .22 * Math.min(1, t / .3) * Math.exp(-Math.max(0, t - .3) * 6);
    const chime = t < .06 ? 0 : (Math.sin(2 * Math.PI * 1760 * (t - .06)) * .2 + Math.sin(2 * Math.PI * 2640 * (t - .06)) * .1) * Math.exp(-(t - .06) * 5);
    return rise + chime + noise(7000) * .18 * Math.sin(Math.PI * Math.min(1, t / .5));
  }],
  'suit/bash-swing': [.2, (t, noise) => noise(1600 + 5000 * t / .2) * Math.sin(Math.PI * t / .2) * .75],
  'suit/bash-hit': [.42, (t, noise) => Math.sin(2 * Math.PI * (92 * t - 70 * t * t)) * Math.exp(-t * 10) * 1.05 +
    noise(1300) * Math.exp(-t * 24) * .95 + noise(5000) * Math.exp(-t * 60) * .35],
  'suit/throw': [.28, (t, noise) => noise(3200) * Math.sin(Math.PI * t / .28) ** 2 * .55 +
    Math.sin(2 * Math.PI * 2900 * t) * Math.exp(-t * 110) * .3],
  'suit/bounce': [.15, (t, noise) => Math.sin(2 * Math.PI * 2280 * t) * Math.exp(-t * 34) * .38 +
    Math.sin(2 * Math.PI * 3460 * t) * Math.exp(-t * 44) * .22 + noise(5200) * Math.exp(-t * 90) * .3],
  'suit/stun': [1.15, (t, noise) => {
    const crackle = noise(8200) * (Math.sin(2 * Math.PI * 41 * t) * Math.sin(2 * Math.PI * 67 * t) > .1 ? 1 : .2) * Math.exp(-t * 2.6) * .8;
    const boom = Math.sin(2 * Math.PI * 52 * t) * Math.exp(-t * 7) * .85;
    const whine = Math.sin(2 * Math.PI * (1250 * t - 420 * t * t)) * Math.exp(-t * 3.2) * .22;
    return crackle + boom + whine;
  }],
  'suit/empty': [.16, t => (t < .06 || t > .09 ? Math.sin(2 * Math.PI * 520 * t) * .25 : 0) * Math.exp(-t * 6)],
  'field/laser-charge': [.95, t => (Math.sin(2 * Math.PI * (320 * t + 420 * t * t)) +
    .25 * Math.sin(2 * Math.PI * 1600 * t)) * Math.min(1, t / .03) * (.05 + .17 * t) * Math.min(1, (.95 - t) / .03)],
  'field/laser-fire': [.22, (t, noise) => (Math.sin(2 * Math.PI * (2600 * t - 4000 * t * t)) * .65 + noise(7000) * .2) *
    Math.exp(-t * 20) * Math.min(1, t / .003)],
  'field/outro-tick': [.12, t => (Math.sin(t * 2 * Math.PI * 1320) + Math.sin(t * 2 * Math.PI * 1980)) * .18 *
    Math.min(1, t / .003) * Math.max(0, 1 - t / .12)],
  'field/outro-start': [1.1, t => {
    const ring = (frequency, start) => t < start ? 0 : Math.sin((t - start) * 2 * Math.PI * frequency) *
      Math.min(1, (t - start) / .01) * Math.exp(-(t - start) * 3.2);
    return (ring(660, 0) + ring(990, .12) + .4 * ring(660, .32) + .3 * ring(990, .44)) * .22;
  }],
  'field/engulf': [.5, (t, noise) => {
    const sweep = Math.sin(2 * Math.PI * (320 * t - 250 * t * t / .45 / 2)) * Math.exp(-t * 5);
    return (sweep * .55 + noise(900) * .25 * Math.exp(-t * 7)) * Math.min(1, t / .01);
  }],
  'field/peristalsis': [1.8, (t, noise) => (noise(220) * .9 + Math.sin(t * 2 * Math.PI * 38) * .35) *
    (.55 + .45 * Math.sin(t * 2 * Math.PI * 3.2)) * Math.min(1, t / .25) * Math.min(1, (1.8 - t) / .6)],
  // Weapon voices: a heavy rifle crack, a shotgun boom, a light pistol snap, the rocket's launch
  // and burst, and the swap rattle.
  'weapon/sniper': [1.3, (t, noise) => {
    const crack = noise(5200) * Math.exp(-t * 38) * 1.2;
    const body = (noise(700) * .8 + Math.sin(2 * Math.PI * (95 * t - 30 * t * t))) * Math.exp(-t * 6);
    const tail = noise(300) * .45 * Math.exp(-t * 2.6) * Math.min(1, t / .05);
    return (crack + body * .8 + tail) * Math.min(1, t / .0015) * .75;
  }],
  'weapon/shotgun': [.9, (t, noise) => {
    const blast = noise(2600) * Math.exp(-t * 22) * 1.3;
    const thump = Math.sin(2 * Math.PI * (70 * t - 25 * t * t)) * Math.exp(-t * 9);
    return (blast + thump + noise(450) * .5 * Math.exp(-t * 5)) * Math.min(1, t / .0015) * .72;
  }],
  'weapon/pistol': [.22, (t, noise) => (noise(4200) * Math.exp(-t * 55) + Math.sin(2 * Math.PI * 340 * t) * .5 * Math.exp(-t * 40)) *
    Math.min(1, t / .001) * .6],
  'weapon/rocket': [1.1, (t, noise) => {
    const pop = noise(1800) * Math.exp(-t * 30);
    const whoosh = noise(900 + 1400 * Math.min(1, t * 2)) * Math.min(1, t / .06) * Math.exp(-t * 2.4);
    return (pop + whoosh * .9) * Math.min(1, t / .002) * .7;
  }],
  'weapon/explosion': [2.4, (t, noise) => {
    const crack = noise(3000) * Math.exp(-t * 26) * 1.2;
    const boom = (Math.sin(2 * Math.PI * (52 * t - 9 * t * t)) * 1.3 + noise(160) * 1.6) * Math.exp(-t * 2.3);
    const debris = noise(1200) * .35 * Math.exp(-t * 3.5) * Math.max(0, Math.sin(t * 41)) ;
    return (crack + boom + debris) * Math.min(1, t / .002) * .8;
  }],
  'weapon/swap': [.32, (t, noise) => {
    const click = (at, gain) => t < at ? 0 : noise(3500) * gain * Math.exp(-(t - at) * 60);
    return click(0, .7) + click(.11, .5) + click(.2, .9) + Math.sin(2 * Math.PI * 900 * t) * .08 * Math.exp(-t * 20);
  }],
  // Pathogen deaths, one voice per way of dying (see death-fx.mjs): a capsid's wet pop, a slime
  // mold's splash, a sporangium's hiss, a bacterium's gurgling tear, a shell's crack, a whiptail's
  // falling squeal, a drone's shorting buzz and blast, a nest tearing open, and a boss's long
  // convulsing groan that ends in a burst timed to its final explosion.
  'death/pop': [.5, (t, noise) => {
    const pop = Math.sin(2 * Math.PI * (430 * t - 380 * t * t)) * Math.exp(-t * 18);
    const wet = noise(2400) * Math.exp(-t * 32) * .9;
    const squelch = noise(650) * Math.exp(-t * 8) * (.55 + .45 * Math.sin(2 * Math.PI * 31 * t)) * .7;
    return (pop * .8 + wet + squelch) * Math.min(1, t / .002) * .62;
  }],
  'death/splat': [.85, (t, noise) => {
    const burst = noise(1900) * Math.exp(-t * 20) * 1.1;
    const thump = Math.sin(2 * Math.PI * (95 * t - 40 * t * t)) * Math.exp(-t * 11);
    const patter = noise(3200) * Math.exp(-Math.max(0, t - .1) * 6) * Math.max(0, Math.sin(2 * Math.PI * 23 * t)) ** 6 * (t > .1 ? 1 : 0);
    return (burst + thump + patter * .8) * Math.min(1, t / .002) * .6;
  }],
  'death/puff': [.9, (t, noise) => {
    const hiss = noise(5200) * Math.min(1, t / .02) * Math.exp(-t * 4.5) * .8;
    const pop = Math.sin(2 * Math.PI * (320 * t - 200 * t * t)) * Math.exp(-t * 24) * .6;
    const flutter = noise(1400) * Math.exp(-t * 6) * (.5 + .5 * Math.sin(2 * Math.PI * 17 * t)) * .4;
    return (hiss + pop + flutter) * .58;
  }],
  'death/squelch': [1.2, (t, noise) => {
    const tear = noise(1100) * Math.exp(-t * 9) * 1.1;
    const gurgle = noise(520) * (.5 + .5 * Math.sin(2 * Math.PI * (11 + 16 * t) * t)) * Math.min(1, t / .08) * Math.exp(-t * 2.6);
    const groan = Math.sin(2 * Math.PI * (150 * t - 38 * t * t)) * Math.exp(-t * 3.2) * .35;
    return (tear + gurgle * .9 + groan) * Math.min(1, t / .003) * .55;
  }],
  'death/crack': [1, (t, noise) => {
    const crack = (at, gain) => t < at ? 0 : noise(6500) * gain * Math.exp(-(t - at) * 48);
    const shell = Math.sin(2 * Math.PI * 1250 * t) * Math.exp(-t * 26) * .3;
    const body = noise(800) * Math.exp(-Math.max(0, t - .12) * 6) * (t > .1 ? .6 : 0) * (.5 + .5 * Math.sin(2 * Math.PI * 14 * t));
    return (crack(0, 1.2) + crack(.05, .8) + crack(.11, .6) + shell + body) * .58;
  }],
  'death/whip': [.6, (t, noise) => {
    const squeal = Math.sin(2 * Math.PI * (1500 * t - 1150 * t * t + 6 * Math.sin(2 * Math.PI * 21 * t) / (2 * Math.PI))) * Math.exp(-t * 6) * .45;
    const pop = t < .2 ? 0 : (noise(2200) * 1.1 + Math.sin(2 * Math.PI * (300 * (t - .2)) ) * .5) * Math.exp(-(t - .2) * 20);
    return (squeal * Math.min(1, t / .01) + pop) * .58;
  }],
  'death/bot': [1.4, (t, noise) => {
    const stutter = Math.sin(2 * Math.PI * 9 * t) > -.2 ? 1 : .15;
    const buzz = Math.sign(Math.sin(2 * Math.PI * (120 - 60 * t) * t)) * .25 * stutter * (t < .85 ? Math.min(1, t / .01) * (1 - t / .85 * .5) : 0);
    const crackle = noise(6000) * .35 * (t < .85 ? stutter : 0) * Math.max(0, Math.sin(2 * Math.PI * 37 * t)) ** 4;
    const blastAt = Math.max(0, t - .86);
    const blast = t < .86 ? 0 : (noise(2400) * Math.exp(-blastAt * 22) * 1.2 + (Math.sin(2 * Math.PI * (70 * blastAt)) * 1.1 + noise(220)) * Math.exp(-blastAt * 5)) * Math.min(1, blastAt / .002);
    return (buzz + crackle + blast) * .55;
  }],
  'death/nest': [1.7, (t, noise) => {
    const groan = (Math.sin(2 * Math.PI * (68 * t - 9 * t * t)) * .6 + noise(240) * .8) * Math.min(1, t / .1) * Math.exp(-t * 1.4);
    const sac = at => t < at ? 0 : (noise(1800) + Math.sin(2 * Math.PI * 260 * (t - at)) * .6) * Math.exp(-(t - at) * 22);
    return (groan + sac(0) + sac(.2) * .8 + sac(.42) * .7 + sac(.66) * .8 + sac(.9) * .6 + sac(1.18) * .9 + sac(1.4) * 1.2) * .5;
  }],
  'death/boss': [3.6, (t, noise) => {
    const groan = (Math.sin(2 * Math.PI * (58 * t - 5 * t * t + .8 * Math.sin(2 * Math.PI * 3 * t))) * .7 + noise(180) * .9) *
      Math.min(1, t / .15) * (t < 2 ? 1 : Math.exp(-(t - 2) * 6));
    const rupture = Math.max(0, Math.sin(2 * Math.PI * (4 + 3 * t) * t)) ** 12 * noise(1600) * (t < 2 ? 1.1 : 0);
    const at = Math.max(0, t - 2);
    const blast = t < 2 ? 0 : (noise(3000) * Math.exp(-at * 24) * 1.3 + (Math.sin(2 * Math.PI * (48 * at - 8 * at * at)) * 1.3 + noise(140) * 1.7) * Math.exp(-at * 2.1)) * Math.min(1, at / .002);
    return (groan * .7 + rupture + blast) * .66;
  }],
  'field/macrophage': [1.4, (t, noise) => (Math.sin(2 * Math.PI * (55 * t - 6.5 * t * t)) * .45 + noise(400) * .6) *
    (.6 + .4 * Math.sin(t * 2 * Math.PI * 1.7)) * Math.min(1, t / .2) * Math.min(1, (1.4 - t) / .5)],
};

function synthesize(context, duration, voice) {
  const length = Math.round(duration * SYNTH_RATE);
  const buffer = context.createBuffer(1, length, SYNTH_RATE);
  const data = buffer.getChannelData(0);
  // One-pole low-passed noise whose cutoff each cue chooses.
  let state = 0;
  let seed = 22695477;
  const noise = cutoff => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const white = seed / 2147483648 - 1;
    state += (white - state) * Math.min(1, 2 * Math.PI * cutoff / SYNTH_RATE);
    return state * 3;
  };
  for (let i = 0; i < length; i++) data[i] = Math.max(-1, Math.min(1, voice(i / SYNTH_RATE, noise)));
  return buffer;
}

export class GameAudio {
  constructor() {
    this.context = null;
    this.muted = false;
    this.active = false;
    this.assetsReady = null;
    this.samples = new Map();
    this.shotIndex = 0;
    this.roomVoice = null;
    this.masterLevel = 1;
    this.ambienceLevel = 1;
    this.repairing = false;
    this.repairVoice = null;
    this.musicMode = 'drift';
    this.musicTracks = null;
    // { area, buffer, gain, source } for the current level's combat theme.
    this.levelTheme = null;
    // Player mix from Settings, 0 to 1.
    this.musicLevel = 1;
    this.effectsLevel = 1;
    this.damageAt = { player: -Infinity, tissue: -Infinity };
    this.branchAt = { left: -Infinity, right: -Infinity };
    this.valveBlockedAt = -Infinity;
    this.enemyCueAt = new Map();
  }

  async unlock() {
    if (!this.context) {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      this.context = new Audio();
      const context = this.context;
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.65 * this.masterLevel;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.ratio.value = 7;
      this.master.connect(limiter);
      limiter.connect(context.destination);

      this.effectsBus = context.createGain();
      this.effectsBus.gain.value = 0;
      this.effectsBus.connect(this.master);
    }

    try {
      if (this.context.state !== 'running') await this.context.resume();
    } catch {
      return;
    }
    const buffers = await this.prepare();
    this.setActive(this.active);
    this.startMusic(buffers);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.65 * this.masterLevel, this.context.currentTime, 0.03);
  }

  // Master scales everything; ambience scales the looping room bed under the combat mix.
  setLevels(master, ambience) {
    this.masterLevel = master;
    this.ambienceLevel = ambience;
    if (!this.context) return;
    this.setMuted(this.muted);
    this.syncRoom();
  }

  prepare() {
    if (this.assetsReady) return this.assetsReady;
    const OfflineAudio = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const decoder = OfflineAudio ? new OfflineAudio(1, 1, 44100) : this.context;
    if (!decoder) return Promise.resolve([]);
    const decode = async path => {
      try {
        const response = await fetch(new URL(path, import.meta.url));
        return response.ok ? await decoder.decodeAudioData(await response.arrayBuffer()) : null;
      } catch {
        return null;
      }
    };
    for (const [name, [duration, voice]] of Object.entries(SYNTHESIZED)) {
      try {
        this.samples.set(name, synthesize(decoder, duration, voice));
      } catch {
        // Missing cues fall back to silence.
      }
    }
    const effects = Promise.all(EFFECTS.filter(name => !Object.hasOwn(SYNTHESIZED, name)).map(async name => {
      const buffer = await decode(`./assets/sfx/${name}.wav`);
      if (buffer) this.samples.set(name, buffer);
    }));
    const tracks = Promise.all(MUSIC_CUES.map(({ file }) => decode(`./assets/music/${file}`)));
    this.assetsReady = Promise.all([effects, tracks]).then(([, buffers]) => buffers);
    return this.assetsReady;
  }

  startMusic(buffers) {
    if (this.musicTracks) return;
    const context = this.context;
    // A shared start keeps both arrangements beat-aligned during fades.
    const start = context.currentTime + 0.04;
    this.musicTracks = buffers.flatMap((buffer, i) => {
      if (!buffer) return [];
      const { mode, volume } = MUSIC_CUES[i];
      const gain = context.createGain();
      gain.gain.value = 0;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      gain.connect(this.master);
      source.start(start);
      return [{ mode, volume, gain }];
    });
    this.fadeMusic();
  }

  setMix(music, effects) {
    this.musicLevel = music;
    this.effectsLevel = effects;
    this.fadeMusic();
    this.setActive(this.active);
  }

  setMusic(mode) {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    this.fadeMusic();
  }

  // Load the combat theme for a mission area during its loading screen. The previous
  // level's theme is stopped and released so only one theme is held in memory.
  setLevel(area) {
    if (this.levelTheme?.area === area) {
      // Same level again (retry or replay): keep the decoded theme, restart it from the top.
      this.stopLevelTheme(this.levelTheme);
      return this.levelTheme.ready;
    }
    this.stopLevelTheme(this.levelTheme);
    this.levelTheme = null;
    if (!LEVEL_THEMES.has(area)) return Promise.resolve();
    const theme = { area, buffer: null, gain: null, source: null };
    const OfflineAudio = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const decoder = OfflineAudio ? new OfflineAudio(1, 1, 44100) : this.context;
    theme.ready = (async () => {
      try {
        if (!decoder) return;
        const response = await fetch(new URL(`./assets/music/levels/${area}.mp3`, import.meta.url));
        if (!response.ok) return;
        const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
        if (this.levelTheme !== theme) return;
        theme.buffer = buffer;
        this.fadeMusic();
      } catch {
        // The shared combat cue covers a missing or undecodable theme.
      }
    })();
    this.levelTheme = theme;
    return theme.ready;
  }

  stopLevelTheme(theme) {
    if (!theme?.source) return;
    const { source, gain } = theme;
    theme.source = null;
    theme.gain = null;
    const now = this.context.currentTime;
    gain.gain.setTargetAtTime(0, now, 0.15);
    try { source.stop(now + 0.8); } catch { /* Already stopped. */ }
    source.onended = () => gain.disconnect();
  }

  fadeMusic() {
    if (!this.musicTracks) return;
    const now = this.context.currentTime;
    const theme = this.levelTheme;
    const themed = !!theme?.buffer;
    // The theme starts from its opening bar the first time combat begins in the level,
    // then loops under later waves; between waves it fades out like the shared cue.
    if (themed && !theme.source && this.musicMode === 'combat') {
      theme.gain = this.context.createGain();
      theme.gain.gain.value = 0;
      theme.gain.connect(this.master);
      theme.source = this.context.createBufferSource();
      theme.source.buffer = theme.buffer;
      theme.source.loop = true;
      theme.source.connect(theme.gain);
      theme.source.start(now + 0.02);
    }
    for (const { mode, volume, gain } of this.musicTracks) {
      const on = mode === this.musicMode && !(themed && mode === 'combat');
      gain.gain.setTargetAtTime(on ? volume * this.musicLevel : 0, now, 0.23);
    }
    if (theme?.gain) {
      theme.gain.gain.setTargetAtTime(this.musicMode === 'combat' ? LEVEL_THEME_VOLUME * this.musicLevel : 0, now, 0.23);
    }
  }

  setActive(active) {
    this.active = active;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.effectsBus.gain.setTargetAtTime(active ? this.effectsLevel : 0, now, 0.045);
    if (!active) this.stopRepair();
    this.syncRoom();
  }

  playSample(name, volume, { pan = 0, rate = 1, loop = false, bus = this.effectsBus } = {}) {
    const buffer = this.samples.get(name);
    if (!buffer) return null;
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = loop;

    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    let panner;
    if (pan && context.createStereoPanner) {
      panner = context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(bus);
    } else {
      gain.connect(bus);
    }

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
    source.start();
    return { source, gain };
  }

  syncRoom() {
    if (this.active && !this.roomVoice) {
      this.roomVoice = this.playSample('field/arterial-bed', 0, { loop: true, bus: this.master });
    }
    this.roomVoice?.gain.gain.setTargetAtTime(this.active ? 0.29 * this.ambienceLevel : 0, this.context.currentTime, 0.14);
  }

  syncRepair() {
    if (this.repairing && this.active && !this.repairVoice) {
      this.repairVoice = this.playSample('field/repair-loop', 0, { loop: true });
      this.repairVoice?.gain.gain.setTargetAtTime(0.19, this.context.currentTime, 0.05);
    }
  }

  stopRepair() {
    this.repairing = false;
    if (!this.repairVoice) return;
    const now = this.context.currentTime;
    this.repairVoice.gain.gain.setTargetAtTime(0, now, 0.035);
    this.repairVoice.source.stop(now + 0.18);
    this.repairVoice = null;
  }

  spatialPan(event) {
    if (Number.isFinite(event.pan)) return 0.85 * Math.max(-1, Math.min(1, event.pan));
    return event.branch === 'left' ? -0.72 : event.branch === 'right' ? 0.72 : 0;
  }

  // The pathogen's own death, quieter with distance. Bosses get theirs from 'levelBoss'.
  playDeath(event) {
    if (event.boss) return;
    const voice = DEATH_VOICES[event.segment ? 'segment' : event.nest ? 'nest' : event.enemyType] ?? DEATH_VOICES.virus;
    const [name, volume, rate] = voice;
    const now = this.context.currentTime;
    // A rocket that kills a crowd still sounds like a crowd, not a wall of identical pops.
    this.deathAt ??= new Map();
    const recent = this.deathAt.get(name) ?? { at: -Infinity, count: 0 };
    const count = now - recent.at < .09 ? recent.count + 1 : 0;
    if (count > 2) return;
    this.deathAt.set(name, { at: now, count });
    const attenuation = 1 / (1 + Math.max(0, (event.distance ?? 0) - 4) * .07);
    this.playSample(name, volume * attenuation * (event.teammate ? .8 : 1) / (1 + count * .5), {
      pan: this.spatialPan(event), rate: rate * (.92 + Math.random() * .16),
    });
  }

  // The achievement chime: a bright rising arpeggio with a shimmer, longer and fuller for the
  // higher tiers. Synthesized, so it needs no sample; it plays in menus as well as in combat.
  achievement(tier = 'bronze') {
    const context = this.context;
    if (context?.state !== 'running') return;
    const notes = { bronze: [659.3, 987.8], silver: [659.3, 830.6, 987.8], gold: [523.3, 659.3, 784, 1046.5], platinum: [523.3, 659.3, 784, 1046.5, 1318.5] }[tier] ?? [659.3, 987.8];
    const out = context.createGain();
    out.gain.value = .22 * (this.effectsLevel ?? 1);
    out.connect(this.master);
    const start = context.currentTime + .02;
    notes.forEach((frequency, i) => {
      const at = start + i * .085, last = i === notes.length - 1, length = last ? 1.4 : .5;
      for (const [type, detune, level] of [['triangle', 0, 1], ['sine', 1200, .25]]) {
        const osc = context.createOscillator(), gain = context.createGain();
        osc.type = type; osc.frequency.value = frequency; osc.detune.value = detune;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(level * (last ? .9 : .6), at + .012);
        gain.gain.exponentialRampToValueAtTime(.0008, at + length);
        osc.connect(gain); gain.connect(out);
        osc.start(at); osc.stop(at + length + .05);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      }
    });
    setTimeout(() => out.disconnect(), 2500);
  }

  play(event) {
    if (this.context?.state !== 'running') return;
    switch (event.type) {
      case 'dash':
        this.playSample('suit/dash', event.teammate ? .3 : .62, { pan: event.teammate ? this.spatialPan(event) : -event.side * .25, rate: .95 + Math.random() * .1 });
        break;
      case 'jump':
        if (!event.teammate) this.playSample('suit/jump', .42, { rate: .95 + Math.random() * .1 });
        break;
      case 'land':
        if (!event.teammate) this.playSample('suit/land', Math.min(.75, .25 + event.speed * .07), { rate: .9 + Math.random() * .15 });
        break;
      case 'dodge':
        if (!event.teammate) this.playSample('suit/dodge', .7, { bus: this.master });
        break;
      case 'melee':
        this.playSample('suit/bash-swing', event.teammate ? .25 : .5, { pan: event.teammate ? this.spatialPan(event) : 0, rate: .95 + Math.random() * .12 });
        if (event.hits) this.playSample('suit/bash-hit', event.teammate ? .4 : .85, { pan: event.teammate ? this.spatialPan(event) : 0, rate: .9 + Math.random() * .15 });
        break;
      case 'throw':
        if (event.stage === 'release') this.playSample('suit/throw', event.teammate ? .3 : .55, { pan: this.spatialPan(event) });
        else if (event.stage === 'bounce') this.playSample('suit/bounce', .4 / (1 + (event.distance ?? 0) * .06), { pan: this.spatialPan(event), rate: event.kind === 'stun' ? .8 : 1.05 });
        else if (event.stage === 'empty' && !event.teammate) this.playSample('suit/empty', .5);
        break;
      case 'stun':
        this.playSample('suit/stun', .95 / (1 + (event.distance ?? 0) * .03), { pan: this.spatialPan(event) });
        break;
      case 'shot': {
        // Shotgun pellets and rocket bursts share one report per trigger pull.
        if (event.pellet || event.blast) break;
        const voice = { sniper: 'weapon/sniper', shotgun: 'weapon/shotgun', pistol: 'weapon/pistol', launcher: 'weapon/rocket' }[event.weapon];
        if (voice && this.samples.has(voice)) {
          const volume = event.teammate ? .5 / (1 + (event.distance ?? 0) * .085) : voice === 'weapon/pistol' ? .5 : .78;
          this.playSample(voice, volume, { pan: this.spatialPan(event), rate: .96 + Math.random() * .08 });
          break;
        }
        const readyShots = SHOTS.filter(name => this.samples.has(name));
        if (!readyShots.length) break;
        const sample = readyShots[this.shotIndex++ % readyShots.length];
        const volume = event.teammate ? .48 / (1 + (event.distance ?? 0) * .085) : .66;
        this.playSample(sample, volume, { pan: this.spatialPan(event), rate: 0.97 + Math.random() * .06 });
        break;
      }
      case 'turret': {
        const pan = this.spatialPan(event);
        if (event.stage === 'lifted') {
          this.playSample('weapon/reload-complete', .32, { pan, rate: 1.18 });
        } else if (event.stage === 'deployed' || event.stage === 'redeployed' || event.stage === 'moved') {
          this.playSample('weapon/reload-complete', .48, { pan, rate: .78 });
        } else if (event.stage === 'fire') {
          const attenuation = 1 / (1 + (event.distance ?? 0) * .085);
          // Automatic fire: quieter per shot than the old single slug, like a teammate's carbine.
          this.playSample('weapon/shot-3', .3 * attenuation, { pan, rate: .86 + Math.random() * .1 });
        }
        break;
      }
      case 'drone': {
        // A bright two-step chirp when it holds or leaves a station, a soft one when its beam locks on.
        const pan = this.spatialPan(event);
        if (event.stage === 'stationed') this.playSample('weapon/reload-complete', .34, { pan, rate: 1.42 });
        else if (event.stage === 'following') this.playSample('weapon/reload-complete', .3, { pan, rate: 1.62 });
        else if (event.stage === 'mend' && !event.teammate) this.playSample('weapon/reload-complete', .1, { pan, rate: 1.9 });
        break;
      }
      case 'explosion': {
        const attenuation = 1 / (1 + (event.distance ?? 0) * .03);
        this.playSample('weapon/explosion', .95 * attenuation, { pan: this.spatialPan(event), rate: .92 + Math.random() * .12 });
        break;
      }
      case 'swap':
        if (!event.teammate) this.playSample('weapon/swap', .45, { rate: event.weapon === 'pistol' ? 1.15 : event.weapon === 'launcher' ? .8 : 1 });
        break;
      case 'dry':
        this.playSample('weapon/dry', 0.42);
        break;
      case 'hit':
        if (!event.lethal) this.playSample('weapon/hit', event.source === 'turret' ? .18 : event.crit ? .43 : .36, { pan: this.spatialPan(event) });
        break;
      case 'kill':
        if (event.source === 'immune') this.playSample('field/engulf', .5, { pan: this.spatialPan(event), rate: .9 + Math.random() * .2 });
        else if (!event.teammate) this.playSample('weapon/kill', event.source === 'turret' ? .25 : .45, { pan: this.spatialPan(event) });
        this.playDeath(event);
        break;
      case 'levelBoss':
        if (event.stage === 'defeated') this.playSample('death/boss', .9, { pan: this.spatialPan(event) * .6, bus: this.master });
        else if (event.stage === 'ability' && event.ability === 'devour') {
          this.playSample('field/engulf', .45, { pan: this.spatialPan(event), rate: .75 + Math.random() * .1 });
        }
        break;
      case 'outro':
        this.playSample('field/outro-start', .42);
        break;
      case 'outroTick':
        this.playSample('field/outro-tick', .5, { rate: event.final ? .8 : 1 });
        break;
      case 'branch': {
        const { branch } = event;
        if (branch !== 'left' && branch !== 'right') break;
        const now = this.context.currentTime;
        if (now - this.branchAt[branch] < 1.65) break;
        if (this.playSample('field/branch', 0.44, {
          pan: this.spatialPan(event),
          rate: branch === 'left' ? 0.96 : 1.04,
        })) this.branchAt[branch] = now;
        break;
      }
      case 'enemyAttack': {
        const family = event.behavior ?? event.enemyType;
        const cue = ENEMY_CUES[family]?.[event.stage];
        if (!cue) break;
        const [name, volume] = cue;
        // The Crawler's short lock charges in about half the Rogue Bot's time, at a higher pitch.
        const rate = event.enemyType === 'crawler' ? (event.stage === 'windup' ? 1.85 : 1.3) : 1;
        const now = this.context.currentTime;
        if (now - (this.enemyCueAt.get(name) ?? -Infinity) < .14) break;
        const distance = event.distance ?? 0;
        const attenuation = 1 / (1 + Math.max(0, distance - 3) * .085);
        if (this.playSample(name, volume * attenuation, { pan: this.spatialPan(event), rate })) {
          this.enemyCueAt.set(name, now);
        }
        break;
      }
      case 'organ': {
        const cue = ORGAN_CUES[event.area];
        if (cue && (event.stage === 'warning' || event.stage === 'active')) {
          const active = event.stage === 'active';
          this.playSample(cue[Number(active)], active ? .49 : .36, {
            pan: this.spatialPan(event) * .72,
            rate: cue[2],
          });
        }
        break;
      }
      case 'guard':
        if (event.stage === 'block' && event.source !== 'turret' && this.context.currentTime - this.valveBlockedAt >= .18) {
          if (this.playSample('field/valve-blocked', .32, { pan: this.spatialPan(event), rate: .87 })) {
            this.valveBlockedAt = this.context.currentTime;
          }
        }
        break;
      case 'boss': {
        const pan = this.spatialPan(event) * .75;
        if (event.stage === 'phase') this.playSample('field/mega-pulse', .63, { pan, rate: .82 });
        else if (event.stage === 'warning') this.playSample('field/mega-pulse', .56, { pan, rate: 1 });
        else if (event.stage === 'expose') this.playSample('field/mega-membrane', .52, { pan });
        else if (event.stage === 'defeated') this.playSample('field/mega-collapse', .62, { pan });
        else if (event.stage === 'block' && this.context.currentTime - this.valveBlockedAt >= .14) {
          if (this.playSample('field/valve-blocked', .26, { pan, rate: .83 })) {
            this.valveBlockedAt = this.context.currentTime;
          }
        }
        break;
      }
      case 'airway': {
        const pan = this.spatialPan(event) * .8;
        if (event.stage === 'start' || event.stage === 'blocked') {
          this.playSample('field/valve-close', .41, { pan, rate: .77 });
        } else if (event.stage === 'opened') {
          this.playSample('field/valve-open', .48, { pan, rate: .93 });
        } else if (event.stage === 'hold') {
          this.playSample('field/branch', .27, { pan, rate: .92 });
        } else if (event.stage === 'incoming') {
          this.playSample('field/virus-windup', .43, { pan, rate: .87 });
        }
        break;
      }
      case 'gastric': {
        const pan = this.spatialPan(event) * .8;
        if (event.stage === 'intake-closed') this.playSample('field/valve-close', .54, { pan, rate: .72 });
        else if (event.stage === 'draining') this.playSample('field/valve-open', .53, { pan, rate: .69 });
        else if (event.stage === 'drained') this.playSample('field/repair-complete', .29, { pan, rate: .82 });
        else if (event.stage === 'flank' || event.stage === 'counterattack') {
          this.playSample('field/branch', .39, { pan, rate: .89 });
        }
        break;
      }
      case 'valve': {
        const pan = this.spatialPan(event) * .7;
        if (event.stage === 'open') this.playSample('field/valve-open', .36, { pan });
        else if (event.stage === 'closed') this.playSample('field/valve-close', .43, { pan });
        else if (event.stage === 'spew') this.playSample('field/spore-spit', .4, { pan, rate: .62 });
        else if (event.stage === 'cleared') this.playSample('field/valve-close', .5, { pan, rate: .7 });
        else if (event.stage === 'blocked') {
          const now = this.context.currentTime;
          if (now - this.valveBlockedAt >= .18 && this.playSample('field/valve-blocked', .29, { pan })) {
            this.valveBlockedAt = now;
          }
        }
        break;
      }
      case 'damage': {
        const suit = event.target === 'player';
        const target = suit ? 'player' : 'tissue';
        const now = this.context.currentTime;
        if (now - this.damageAt[target] < (suit ? 0.32 : 2.7)) break;
        const pan = this.spatialPan(event) * (suit ? 0.45 : 1);
        const sample = suit ? 'field/suit-hit' : 'field/tissue-hit';
        if (this.playSample(sample, suit ? 0.53 : 0.56, { pan })) this.damageAt[target] = now;
        break;
      }
      case 'reload':
        if (event.stage === 'complete') this.playSample('weapon/reload-complete', 0.46);
        else this.playSample('weapon/reload-start', 0.49);
        break;
      case 'repairStart':
        this.repairing = true;
        this.playSample('field/repair-start', 0.35);
        this.syncRepair();
        break;
      case 'repairStop':
        this.stopRepair();
        break;
      case 'repair':
        if (event.complete) {
          this.stopRepair();
          this.playSample('field/repair-complete', 0.45);
        } else {
          this.playSample('field/repair-pulse', 0.37);
        }
        break;
      case 'wave':
        this.playSample(event.stage === 'clear' ? 'field/wave-clear' : 'field/wave-start', 0.41);
        break;
      case 'deploy':
        this.playSample('field/deploy', 0.45);
        break;
      case 'won':
        this.playSample('field/won', 0.52, { bus: this.master });
        break;
      case 'lost':
        this.playSample('field/lost', 0.54, { bus: this.master });
        break;
    }
  }
}
