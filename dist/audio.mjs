const MUSIC_CUES = [
  { mode: 'drift', file: 'arterial-drift.mp3', volume: 0.36 },
  { mode: 'combat', file: 'immune-response.mp3', volume: 0.43 },
];

const SHOTS = ['weapon/shot-1', 'weapon/shot-2', 'weapon/shot-3', 'weapon/shot-4'];
const ENEMY_CUES = {
  virus: { windup: ['field/virus-windup', .47], release: ['field/virus-pounce', .36] },
  spore: { windup: ['field/spore-windup', .44], release: ['field/spore-spit', .39] },
  bacillus: { windup: ['field/bacillus-windup', .43] },
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
    this.repairing = false;
    this.repairVoice = null;
    this.musicMode = 'drift';
    this.musicTracks = null;
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
      this.master.gain.value = this.muted ? 0 : 0.65;
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
    if (this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.65, this.context.currentTime, 0.03);
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
    const effects = Promise.all(EFFECTS.map(async name => {
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

  setMusic(mode) {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    this.fadeMusic();
  }

  fadeMusic() {
    if (!this.musicTracks) return;
    const now = this.context.currentTime;
    for (const { mode, volume, gain } of this.musicTracks) {
      gain.gain.setTargetAtTime(mode === this.musicMode ? volume : 0, now, 0.23);
    }
  }

  setActive(active) {
    this.active = active;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.effectsBus.gain.setTargetAtTime(active ? 1 : 0, now, 0.045);
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
    this.roomVoice?.gain.gain.setTargetAtTime(this.active ? 0.29 : 0, this.context.currentTime, 0.14);
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

  play(event) {
    if (this.context?.state !== 'running') return;
    switch (event.type) {
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
        if (event.stage === 'deployed' || event.stage === 'redeployed') {
          this.playSample('weapon/reload-complete', .48, { pan, rate: .78 });
        } else if (event.stage === 'fire') {
          const attenuation = 1 / (1 + (event.distance ?? 0) * .085);
          this.playSample('weapon/shot-3', .48 * attenuation, { pan, rate: .81 + Math.random() * .08 });
        }
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
        else this.playSample('weapon/kill', event.source === 'turret' ? .25 : .45, { pan: this.spatialPan(event) });
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
        const family = event.enemyType === 'guard' ? 'bacillus' : event.enemyType === 'splitter' ? 'virus' : event.enemyType;
        const cue = ENEMY_CUES[family]?.[event.stage];
        if (!cue) break;
        const [name, volume] = cue;
        const now = this.context.currentTime;
        if (now - (this.enemyCueAt.get(name) ?? -Infinity) < .14) break;
        const distance = event.distance ?? 0;
        const attenuation = 1 / (1 + Math.max(0, distance - 3) * .085);
        if (this.playSample(name, volume * attenuation, { pan: this.spatialPan(event) })) {
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
