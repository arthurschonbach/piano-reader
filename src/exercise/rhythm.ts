import type { NoteItem, Score } from '../core/model';

/** Timing windows, in ms either side of the written beat. */
export const WINDOWS = { perfect: 90, good: 180, max: 260 };

export type Grade = 'perfect' | 'good' | 'miss';

export interface Target {
  beat: number;
  midi: number;
  note: NoteItem;
  grade?: Grade;
  /** Played minus written time, ms (negative = early). */
  dtMs?: number;
}

export type Hit =
  | { kind: 'hit'; target: Target; grade: Grade; dtMs: number }
  | { kind: 'wrong'; played: number; near: Target | null }
  | { kind: 'extra' };

export function buildTargets(score: Score): Target[] {
  const out: Target[] = [];
  for (const m of score.measures) {
    for (const n of m.notes) {
      if (n.rest || n.grace || n.tieStop) continue;
      out.push({ beat: n.beat, midi: n.midi, note: n });
    }
  }
  return out.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

/**
 * "Sight-reading" mode: the score moves at the tempo and never waits.
 * Each written note must be played within a window around its time.
 */
export class RhythmSession {
  /** Wrong keys pressed near a written note: [expected, played]. */
  readonly wrong: [number, number][] = [];
  extras = 0;

  constructor(readonly targets: Target[], readonly msPerBeat: number) {}

  /** A key at `beat` (already corrected for latency). */
  noteOn(midi: number, beat: number): Hit {
    const maxB = WINDOWS.max / this.msPerBeat;
    let best: Target | null = null;
    let nearest: Target | null = null;
    for (const t of this.targets) {
      if (t.grade) continue;
      const d = Math.abs(t.beat - beat);
      if (d > maxB) {
        if (t.beat > beat) break;
        continue;
      }
      if (!nearest || d < Math.abs(nearest.beat - beat)) nearest = t;
      if (t.midi === midi && (!best || d < Math.abs(best.beat - beat))) best = t;
    }
    if (best) {
      const dtMs = (beat - best.beat) * this.msPerBeat;
      const a = Math.abs(dtMs);
      best.grade = a <= WINDOWS.perfect ? 'perfect' : 'good';
      best.dtMs = dtMs;
      return { kind: 'hit', target: best, grade: best.grade, dtMs };
    }
    if (nearest) {
      this.wrong.push([nearest.midi, midi]);
      return { kind: 'wrong', played: midi, near: nearest };
    }
    this.extras++;
    return { kind: 'extra' };
  }

  /** Mark notes whose window has passed as missed. Returns the new misses. */
  tick(beat: number): Target[] {
    const maxB = WINDOWS.max / this.msPerBeat;
    const missed: Target[] = [];
    for (const t of this.targets) {
      if (t.beat > beat) break;
      if (!t.grade && beat - t.beat > maxB) {
        t.grade = 'miss';
        missed.push(t);
      }
    }
    return missed;
  }

  get done(): boolean {
    return this.targets.every((t) => t.grade);
  }

  get lastBeat(): number {
    return this.targets.length ? this.targets[this.targets.length - 1].beat : 0;
  }
}

export interface RhythmSummary {
  total: number;
  hits: number;
  perfect: number;
  missed: number;
  wrongKeys: number;
  accuracy: number;
  /** Median of |played − written|, ms. */
  timingMs: number;
  /** Mean of played − written: negative = you rush, positive = you drag. */
  biasMs: number;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarizeRhythm(s: RhythmSession): RhythmSummary {
  const hits = s.targets.filter((t) => t.grade === 'perfect' || t.grade === 'good');
  const dts = hits.map((t) => t.dtMs ?? 0);
  return {
    total: s.targets.length,
    hits: hits.length,
    perfect: s.targets.filter((t) => t.grade === 'perfect').length,
    missed: s.targets.filter((t) => t.grade === 'miss').length,
    wrongKeys: s.wrong.length,
    accuracy: s.targets.length ? hits.length / s.targets.length : 0,
    timingMs: median(dts.map(Math.abs)),
    biasMs: dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0
  };
}
