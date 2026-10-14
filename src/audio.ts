import { measureAt, type Score } from './model';

/** A single note attack inside a beat window. Pure data — safe to unit test. */
export interface Onset {
  beat: number;
  midi: number;
  durBeats: number;
  /** True when the onset lands on a bar line (played slightly stronger). */
  accent: boolean;
}

function isBarStart(score: Score, beat: number): boolean {
  if (!score.measures.length) return false;
  const m = score.measures[measureAt(score, beat)];
  return !!m && Math.abs(m.startBeat - beat) < 1e-6;
}

/** All sounding notes with onset in (fromBeat, toBeat]. Sorted by beat, then pitch. */
export function onsetsInRange(score: Score, fromBeat: number, toBeat: number): Onset[] {
  const out: Onset[] = [];
  if (toBeat <= fromBeat) return out;
  for (const m of score.measures) {
    if (m.startBeat > toBeat) break;
    if (m.startBeat + m.length <= fromBeat) continue;
    for (const n of m.notes) {
      if (n.rest || n.grace || n.dur <= 0) continue;
      if (n.beat <= fromBeat || n.beat > toBeat) continue;
      const sustained = n.tieStart ? Math.max(n.tieEnd - n.beat, n.dur) : n.dur;
      out.push({
        beat: n.beat,
        midi: n.midi,
        durBeats: Math.max(0.15, sustained),
        accent: isBarStart(score, n.beat)
      });
    }
  }
  out.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  return out;
}

const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Tiny WebAudio engine. The player stays the master clock (beat advances on
 * the animation frame); this engine only schedules sound slightly ahead of
 * the cursor via sync(). No top-level window access, so it imports safely
 * in Node for testing the pure helpers above.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private clickBus: GainNode | null = null;
  private scheduledUntil = 0;
  private musicLevel = 0.8;
  private clickLevel = 0.6;

  /** Must be called from a user gesture. Returns true if sound is available. */
  unlock(): boolean {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 1;
        this.musicBus = this.ctx.createGain();
        this.clickBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicLevel;
        this.clickBus.gain.value = this.clickLevel;
        this.musicBus.connect(this.master);
        this.clickBus.connect(this.master);
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  get ready(): boolean {
    return !!this.ctx && !!this.master;
  }

  /** Guide-note and metronome mix, 0..1. Applied smoothly, no clicks. */
  setLevels(music: number, click: number): void {
    this.musicLevel = Math.max(0, Math.min(1, music));
    this.clickLevel = Math.max(0, Math.min(1, click));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus?.gain.setTargetAtTime(this.musicLevel, t, 0.02);
    this.clickBus?.gain.setTargetAtTime(this.clickLevel, t, 0.02);
  }

  /**
   * Forget everything scheduled; call after seeks, pauses, tempo jumps.
   * Parks the window a hair *before* the cursor so an onset exactly on
   * the beat (notably the very first note) is included, not skipped.
   * Streaming stays duplicate-free: after each sync the cursor advances
   * to the horizon, which is always ahead of the beat.
   */
  reset(beat: number): void {
    this.scheduledUntil = beat - 1e-4;
  }

  /**
   * Schedule sound for onsets in (scheduledUntil, beat + aheadBeats].
   * Call every animation frame while playing.
   */
  sync(beat: number, bpm: number, score: Score, opts: { sound: boolean; metronome: boolean }): void {
    if (!this.ctx || !this.master) return;
    if (!opts.sound && !opts.metronome) {
      this.scheduledUntil = beat;
      return;
    }
    if (beat < this.scheduledUntil - 1) this.scheduledUntil = beat - 1e-4; // looped back (keep cursor onset inclusive)
    const aheadBeats = 0.3;
    const horizon = beat + aheadBeats;
    if (horizon <= this.scheduledUntil) return;
    const spb = 60 / Math.max(20, bpm);
    const toTime = (b: number): number => this.ctx!.currentTime + Math.max(0, (b - beat) * spb);

    if (opts.sound) {
      for (const o of onsetsInRange(score, this.scheduledUntil, horizon)) {
        this.pluck(o.midi, toTime(o.beat), o.durBeats * spb, o.accent);
      }
    }
    if (opts.metronome && score.measures.length) {
      for (let k = Math.floor(this.scheduledUntil + 1); k <= horizon; k++) {
        this.click(toTime(k), isBarStart(score, k));
      }
    }
    this.scheduledUntil = horizon;
  }

  /**
   * Schedule a 4-beat count-in starting now. Returns its duration in seconds.
   * The caller should hold the cursor still until it elapses.
   */
  countIn(bpm: number, beats = 4): number {
    if (!this.ctx || !this.master) return 0;
    const spb = 60 / Math.max(20, bpm);
    const t0 = this.ctx.currentTime + 0.06;
    for (let i = 0; i < beats; i++) this.click(t0 + i * spb, i === 0);
    return 0.06 + beats * spb;
  }

  /** Briefly duck output (pause) to avoid hanging scheduled blips. */
  duck(down: boolean): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(down ? 0 : 1, t, 0.03);
  }

  dispose(): void {
    try {
      if (this.ctx) void this.ctx.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.clickBus = null;
  }

  private pluck(midi: number, t: number, durSec: number, accent: boolean): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const freq = midiToFreq(Math.max(21, Math.min(108, midi)));
    const life = Math.min(durSec * 1.4 + 0.5, 3);
    const peak = accent ? 0.24 : 0.19;

    // Gentle lowpass that closes as the note decays — the cheapest
    // approximation of a piano tone: bright attack, mellow sustain.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4200, t);
    filter.frequency.exponentialRampToValueAtTime(1100, t + life);
    filter.Q.value = 0.4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + life);

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = freq;
    o1.detune.value = -2;

    // Upper partial, quieter and shorter-lived than the fundamental.
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2;
    o2.detune.value = 4;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.22, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + Math.min(life * 0.45, 1.1));

    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(filter);
    filter.connect(this.musicBus);
    o1.start(t);
    o2.start(t);
    const end = t + life + 0.05;
    o1.stop(end);
    o2.stop(end);
    o1.onended = () => {
      o1.disconnect();
      o2.disconnect();
      g2.disconnect();
      g.disconnect();
      filter.disconnect();
    };
  }

  private click(t: number, accent: boolean): void {
    if (!this.ctx || !this.clickBus) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = accent ? 2200 : 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.11 : 0.07, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g);
    g.connect(this.clickBus);
    o.start(t);
    o.stop(t + 0.09);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
}
