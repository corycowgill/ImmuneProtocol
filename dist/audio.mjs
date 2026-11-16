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
      case 'dry':
        this.playSample('weapon/dry', 0.42);
        break;
      case 'hit':
        if (!event.lethal) this.playSample('weapon/hit', event.source === 'turret' ? .18 : event.crit ? .43 : .36, { pan: this.spatialPan(event) });
        break;
      case 'kill':
        this.playSample('weapon/kill', event.source === 'turret' ? .25 : .45, { pan: this.spatialPan(event) });
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
