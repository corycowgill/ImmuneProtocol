const MUSIC_CUES = [
  { mode: 'drift', file: 'arterial-drift.mp3', volume: 0.36 },
  { mode: 'combat', file: 'immune-response.mp3', volume: 0.43 },
];

export class GameAudio {
  constructor() {
    this.context = null;
    this.muted = false;
    this.active = false;
    this.heartbeat = null;
    this.repairVoice = null;
    this.musicMode = 'drift';
    this.musicTracks = null;
    this.musicLoading = null;
    this.damageAt = { player: -Infinity, tissue: -Infinity };
    this.branchAt = { left: -Infinity, right: -Infinity };
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

      this.noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      let seed = 297531;
      for (let i = 0; i < samples.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        samples[i] = (seed >>> 0) / 2147483648 - 1;
      }

      this.ambience = context.createGain();
      this.ambience.gain.value = 0;
      this.ambience.connect(this.master);

      const flow = context.createBufferSource();
      flow.buffer = this.noiseBuffer;
      flow.loop = true;
      const flowFilter = context.createBiquadFilter();
      flowFilter.type = 'lowpass';
      flowFilter.frequency.value = 188;
      flowFilter.Q.value = 0.9;
      flow.connect(flowFilter);
      flowFilter.connect(this.ambience);
      flow.start();

      const oscillator = context.createOscillator();
      oscillator.frequency.value = 42;
      const drone = context.createGain();
      drone.gain.value = 0.075;
      oscillator.connect(drone);
      drone.connect(this.ambience);
      oscillator.start();
    }

    try {
      if (this.context.state !== 'running') await this.context.resume();
    } catch {
      return;
    }
    this.setActive(this.active);
    this.loadMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.65, this.context.currentTime, 0.03);
  }

  loadMusic() {
    if (this.muted || this.musicTracks || this.musicLoading) return;
    const context = this.context;
    this.musicLoading = Promise.all(MUSIC_CUES.map(async ({ file }) => {
      const response = await fetch(new URL(`./assets/music/${file}`, import.meta.url));
      if (!response.ok) throw new Error(`Could not load soundtrack cue ${file}`);
      return context.decodeAudioData(await response.arrayBuffer());
    })).then(buffers => {
      // Start both arrangements on the same beat and keep them in sync through fades.
      const start = context.currentTime + 0.04;
      this.musicTracks = MUSIC_CUES.map(({ mode, volume }, i) => {
        const gain = context.createGain();
        gain.gain.value = 0;
        const source = context.createBufferSource();
        source.buffer = buffers[i];
        source.loop = true;
        source.connect(gain);
        gain.connect(this.master);
        source.start(start);
        return { mode, volume, gain };
      });
      this.fadeMusic();
    }).catch(() => {
      // A failed soundtrack download should leave the game and its sound effects playable.
    }).finally(() => {
      this.musicLoading = null;
    });
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
    this.ambience.gain.setTargetAtTime(active ? 0.42 : 0, this.context.currentTime, 0.18);
    if (active && this.heartbeat === null) {
      this.heartbeat = setInterval(() => {
        if (this.context.state !== 'running') return;
        this.tone('sine', 72, 39, 0.2, 0.17);
        this.tone('sine', 65, 37, 0.15, 0.11, 0.19);
        this.noise('lowpass', 170, 0.09, 0.04);
      }, 1260);
    }
    if (!active) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.stopRepair();
    }
  }

  branchPan(event) {
    if (Number.isFinite(event.pan)) return .85 * Math.max(-1, Math.min(1, event.pan));
    return event.branch === 'left' ? -.72 : event.branch === 'right' ? .72 : 0;
  }

  envelope(start, duration, volume, attack = 0.008, pan = 0) {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(duration / 3, attack));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    if (pan && typeof this.context.createStereoPanner === 'function') {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    return gain;
  }

  tone(shape, from, to, duration, volume, delay = 0, attack, pan = 0) {
    const start = this.context.currentTime + delay;
    const source = this.context.createOscillator();
    source.type = shape;
    source.frequency.setValueAtTime(from, start);
    source.frequency.exponentialRampToValueAtTime(to, start + duration);
    source.connect(this.envelope(start, duration, volume, attack, pan));
    source.start(start);
    source.stop(start + duration + 0.015);
  }

  noise(shape, frequency, duration, volume, delay = 0, q = 0.7) {
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = shape;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    source.connect(filter);
    filter.connect(this.envelope(start, duration, volume, 0.004));
    source.start(start, Math.random() * 1.1);
    source.stop(start + duration + 0.015);
  }

  startRepair() {
    if (this.repairVoice || !this.active) return;
    const now = this.context.currentTime;
    const carrier = this.context.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.setValueAtTime(146, now);
    carrier.frequency.exponentialRampToValueAtTime(305, now + 2);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(0.036, now, 0.15);
    carrier.connect(gain);
    gain.connect(this.master);
    carrier.start();
    this.repairVoice = { carrier, gain };
  }

  stopRepair() {
    if (!this.repairVoice) return;
    const now = this.context.currentTime;
    this.repairVoice.gain.gain.setTargetAtTime(0, now, 0.045);
    this.repairVoice.carrier.stop(now + 0.23);
    this.repairVoice = null;
  }

  play(event) {
    if (this.context?.state !== 'running') return;
    switch (event.type) {
      case 'shot':
        this.noise('bandpass', 1540, 0.13, 0.46, 0, 0.7);
        this.noise('highpass', 3600, 0.035, 0.15);
        this.tone('triangle', 190, 52, 0.16, 0.3);
        this.tone('sine', 460, 205, 0.085, 0.06);
        break;
      case 'hit':
        this.noise('bandpass', 740, 0.07, 0.18, 0.018, 1.2);
        this.tone('triangle', 1240, 860, 0.06, 0.052, 0.015);
        break;
      case 'kill':
        this.noise('lowpass', 540, 0.27, 0.31, 0.035);
        this.tone('sine', 172, 48, 0.22, 0.15, 0.042);
        this.tone('sine', 570, 760, 0.16, 0.08, 0.09);
        break;
      case 'branch': {
        const { branch } = event;
        if (branch !== 'left' && branch !== 'right') break;
        const time = this.context.currentTime;
        if (time - this.branchAt[branch] < 1.65) break;
        this.branchAt[branch] = time;
        const pan = this.branchPan(event);
        const frequency = branch === 'left' ? 510 : 710;
        this.tone('triangle', frequency, frequency * 1.18, .15, .112, 0, .017, pan);
        this.tone('sine', frequency * 1.38, frequency * 1.5, .20, .092, .12, .022, pan);
        break;
      }
      case 'damage': {
        const target = event.target === 'tissue' ? 'tissue' : 'player';
        const time = this.context.currentTime;
        const interval = target === 'tissue' ? 2.7 : .32;
        if (time - this.damageAt[target] < interval) break;
        this.damageAt[target] = time;
        if (target === 'player') {
          this.noise('lowpass', 920, 0.19, 0.34);
          this.tone('triangle', 94, 43, 0.24, 0.25);
        } else {
          const pan = this.branchPan(event);
          const frequency = event.branch === 'left' ? 824 : event.branch === 'right' ? 990 : 916;
          this.tone('triangle', frequency, frequency * .75, .18, .13, 0, .018, pan);
          this.tone('triangle', frequency, frequency * .65, .23, .12, .20, .018, pan);
        }
        break;
      }
      case 'reload':
        if (event.stage === 'complete') {
          this.tone('triangle', 328, 164, 0.13, 0.09);
          this.noise('highpass', 2500, 0.07, 0.17);
        } else {
          this.noise('bandpass', 2600, 0.12, 0.19);
          this.noise('bandpass', 1150, 0.14, 0.25, 0.44);
        }
        break;
      case 'repairStart':
        this.startRepair();
        break;
      case 'repairStop':
        this.stopRepair();
        break;
      case 'repair':
        if (event.complete) {
          this.stopRepair();
          this.tone('sine', 523, 523, 0.24, 0.12, 0, 0.022);
          this.tone('sine', 659, 659, 0.30, 0.11, 0.10, 0.022);
          this.tone('sine', 880, 880, 0.42, 0.095, 0.22, 0.035);
        } else {
          this.tone('sine', 494, 570, 0.18, 0.086, 0, 0.024);
          this.tone('sine', 740, 784, 0.22, 0.068, 0.10, 0.03);
        }
        break;
      case 'wave':
        this.tone('triangle', 133, 126, 0.37, 0.14, 0, 0.035);
        this.tone('sine', 385, 490, 0.27, 0.11, 0.16);
        this.tone('sine', 492, 611, 0.4, 0.1, 0.31);
        break;
      case 'deploy':
        this.noise('lowpass', 470, 0.56, 0.21);
        this.tone('sine', 85, 245, 0.47, 0.16, 0, 0.05);
        break;
      case 'won':
        [392, 494, 587, 784].forEach((frequency, i) => {
          this.tone('sine', frequency, frequency, 0.7, 0.13, i * 0.11, 0.03);
        });
        break;
      case 'lost':
        this.tone('triangle', 193, 53, 0.9, 0.18, 0, 0.04);
        this.noise('lowpass', 410, 0.81, 0.13);
        break;
    }
  }
}
