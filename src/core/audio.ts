/** A tiny silent WAV, looped to put iOS into "playback" audio mode. */
function silentWav(): string {
  const n = 800; // 0.1 s at 8 kHz, 8-bit mono
  const bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  bytes.fill(128, 44);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

let keepAlive: HTMLAudioElement | null = null;

/**
 * On iPad/iPhone, Web Audio is silenced by the silent switch / silent mode
 * unless the page is in "playback" mode. Ask for it (Safari 16.4+), and also
 * play a silent looping <audio>, the long-standing trick for older versions.
 * Must run inside a tap.
 */
function preferPlayback(): void {
  try {
    const nav = navigator as unknown as { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    // not supported
  }
  try {
    if (!keepAlive) {
      keepAlive = new Audio(silentWav());
      keepAlive.loop = true;
      keepAlive.setAttribute('playsinline', '');
    }
    void keepAlive.play().catch(() => undefined);
  } catch {
    // no <audio>: nothing more to do
  }
}

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
      preferPlayback();
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.9;
        this.gain.connect(this.ctx.destination);
        // Older iOS only starts the audio clock after a sound is played in the tap.
        const buf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  /** "running" once the browser actually lets sound out. */
  get state(): string {
    return this.ctx?.state ?? 'none';
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
