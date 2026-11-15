import type { NoteItem, Score } from '../core/model';

/** One moment to play: a single note, or a chord struck together. */
export interface Step {
  beat: number;
  notes: NoteItem[];
  midis: number[];
}

export interface StepResult {
  expected: number[];
  /** Wrong keys pressed before getting it right. */
  wrong: number[];
  /** Time from the step becoming current to completing it. */
  reactionMs: number;
  /** The note name was revealed after repeated mistakes. */
  hinted: boolean;
  /** Key velocity of each expected note (0 = already down, unknown). */
  velocities: number[];
}

export type Feedback =
  | { kind: 'correct'; result: StepResult; done: boolean }
  | { kind: 'partial' }
  | { kind: 'wrong'; played: number; hint: boolean }
  | { kind: 'ignored' };

/** After this many wrong keys on one step, the app shows the note name. */
export const HINT_AFTER = 3;

/** Group a score's playable notes into steps, in time order. Ties don't re-strike. */
export function buildSteps(score: Score): Step[] {
  const byBeat = new Map<number, NoteItem[]>();
  for (const m of score.measures) {
    for (const n of m.notes) {
      if (n.rest || n.grace || n.tieStop) continue;
      const key = Math.round(n.beat * 1000) / 1000;
      const list = byBeat.get(key) ?? [];
      list.push(n);
      byBeat.set(key, list);
    }
  }
  return [...byBeat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([beat, notes]) => ({ beat, notes, midis: [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b) }));
}

/**
 * "Wait mode": the score stops on each step until the right key(s) are
 * down. Wrong keys are counted, never skipped over. No tempo involved.
 */
export class WaitSession {
  readonly results: StepResult[] = [];
  index = 0;
  private wrong: number[] = [];
  private vel = new Map<number, number>();
  private stepStart: number;

  constructor(readonly steps: Step[], now: number) {
    this.stepStart = now;
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  get current(): Step | null {
    return this.steps[this.index] ?? null;
  }

  /** Mistakes so far on the current step. */
  get currentWrong(): number {
    return this.wrong.length;
  }

  /** Restart the reaction clock, e.g. when the player was away from the piano. */
  restartClock(now: number): void {
    this.stepStart = now;
  }

  noteOn(midi: number, now: number, held: ReadonlySet<number>, velocity = 0): Feedback {
    const step = this.current;
    if (!step) return { kind: 'ignored' };
    if (!step.midis.includes(midi)) {
      this.wrong.push(midi);
      return { kind: 'wrong', played: midi, hint: this.wrong.length >= HINT_AFTER };
    }
    this.vel.set(midi, velocity);
    if (!step.midis.every((m) => held.has(m) || m === midi)) return { kind: 'partial' };
    const result: StepResult = {
      expected: step.midis,
      wrong: this.wrong,
      reactionMs: Math.max(0, now - this.stepStart),
      hinted: this.wrong.length >= HINT_AFTER,
      velocities: step.midis.map((m) => this.vel.get(m) ?? 0)
    };
    this.results.push(result);
    this.wrong = [];
    this.vel.clear();
    this.index++;
    this.stepStart = now;
    return { kind: 'correct', result, done: this.done };
  }
}

export interface Summary {
  steps: number;
  /** Steps played right on the first try. */
  clean: number;
  accuracy: number;
  medianReactionMs: number;
  /** [expected, played, count], most frequent first. */
  confusions: [number, number, number][];
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarize(results: StepResult[]): Summary {
  const clean = results.filter((r) => r.wrong.length === 0).length;
  // The first step's clock includes getting settled at the piano: leave it out.
  const reactions = results.slice(1).map((r) => r.reactionMs);
  const conf = new Map<string, [number, number, number]>();
  for (const r of results) {
    for (const p of r.wrong) {
      const e = r.expected[0];
      const k = `${e}>${p}`;
      const c = conf.get(k) ?? [e, p, 0];
      c[2]++;
      conf.set(k, c);
    }
  }
  return {
    steps: results.length,
    clean,
    accuracy: results.length ? clean / results.length : 0,
    medianReactionMs: median(reactions.length ? reactions : results.map((r) => r.reactionMs)),
    confusions: [...conf.values()].sort((a, b) => b[2] - a[2])
  };
}
