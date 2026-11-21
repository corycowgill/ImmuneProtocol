// Dynamic resolution. The arenas are fill-rate bound on modest GPUs, so when the frame rate
// sags the canvas is drawn with fewer pixels and scaled back up, then restored once there is
// headroom again. Pure bookkeeping: the renderer asks for the scale and applies it.
const WINDOW = 1; // Seconds of frames behind each decision.

export class RenderScale {
  constructor({ floor = .6, low = 50, high = 57 } = {}) {
    Object.assign(this, { floor, low, high, enabled: true });
    this.reset();
  }

  reset() {
    this.scale = 1;
    this.time = this.frames = this.steady = this.settle = this.hold = 0;
    this.patience = 4;
    this.backoff = 30;
    this.raised = false;
    this.trial = null;
  }

  // Feed the real time between two frames. Returns true when the scale changed.
  sample(seconds) {
    if (!this.enabled) return false;
    // A pause, a loading screen or a hidden tab says nothing about rendering speed.
    if (!(seconds > 0) || seconds > .25) {
      this.time = this.frames = 0;
      return false;
    }
    this.time += seconds;
    this.frames++;
    if (this.time < WINDOW) return false;
    const fps = this.frames / this.time;
    const elapsed = this.time;
    this.time = this.frames = 0;
    // The window after a change includes reallocating the drawing buffer.
    if (this.settle > 0) {
      this.settle--;
      return false;
    }
    if (this.hold > 0) {
      this.hold -= elapsed;
      return false;
    }
    // A raise that immediately costs frames is retried less eagerly.
    if (this.raised && fps < this.low) this.patience = Math.min(32, this.patience * 2);
    this.raised = false;
    if (fps < this.low) {
      this.steady = 0;
      // Fewer pixels did not help: the display is capped below the target or the CPU is the
      // limit, so give the sharpness back and stop trying for a while.
      if (this.trial && (this.trial.drops >= 2 || this.scale <= this.floor) && fps < this.trial.fps * 1.12) {
        this.scale = this.trial.from;
        this.trial = null;
        this.hold = this.backoff;
        this.backoff = Math.min(240, this.backoff * 2);
        this.settle = 1;
        return true;
      }
      if (this.scale <= this.floor) return false;
      this.trial ??= { from: this.scale, fps, drops: 0 };
      this.trial.drops++;
      // Frame time follows the pixel count, which follows the square of the scale.
      const step = Math.min(.93, Math.max(.8, Math.sqrt(fps / 60)));
      this.scale = Math.max(this.floor, this.scale * step);
      this.settle = 1;
      return true;
    }
    this.trial = null;
    if (fps < this.high || this.scale >= 1) {
      this.steady = 0;
      return false;
    }
    if (++this.steady < this.patience) return false;
    this.steady = 0;
    this.scale = Math.min(1, this.scale * 1.1);
    this.raised = true;
    this.settle = 1;
    return true;
  }
}
