/**
 * Metronome clicks with WebAudio. Times are given on the performance.now()
 * clock; they're converted to the audio clock when scheduled.
 */
export class Metronome {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;

  /** Must run inside a tap/click (browsers block audio otherwise). */
  unlock(): boolean {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.9;
        this.gain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  /** Schedule one click at a performance.now() time (ms). */
  click(atPerfMs: number, accent: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    const t = ctx.currentTime + Math.max(0, (atPerfMs - performance.now()) / 1000);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = accent ? 1760 : 1320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.32, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g);
    g.connect(this.gain);
    o.start(t);
    o.stop(t + 0.09);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.gain = null;
  }
}

/**
 * Keeps clicks scheduled a little ahead of time on each call to pump().
 * Beat 0 happens at t0 (performance.now ms); negative beats are the count-in.
 */
export class ClickTrack {
  private nextBeat: number;
  constructor(
    private metro: Metronome,
    private t0: number,
    private msPerBeat: number,
    from: number,
    private beatsPerBar = 4
  ) {
    this.nextBeat = Math.ceil(from);
  }

  pump(now: number, enabled: boolean, countInOnly = false): void {
    const horizon = now + 150;
    while (this.t0 + this.nextBeat * this.msPerBeat <= horizon) {
      const b = this.nextBeat++;
      if (!enabled && b >= 0) continue;
      if (countInOnly && b >= 0) continue;
      const accent = ((b % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar === 0;
      this.metro.click(this.t0 + b * this.msPerBeat, accent);
    }
  }
}
