import { makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from '../core/model';
import { mulberry32, weighted } from '../core/random';
import type { Fn, Hand, Lesson, Rhythm } from './lessons';

export interface GenOptions {
  seed: number;
  /** Per-note difficulty 0..1 (from progress): weak notes come up more. */
  weakness?: ReadonlyMap<number, number>;
  /** Override the lesson's length (level test blocks are short). */
  bars?: number;
  /** Override the lesson's rhythms. */
  rhythms?: Rhythm[];
  /** Always draw both staves (level test). */
  grand?: boolean;
  /** Don't force the last bar onto the home note. */
  noHome?: boolean;
}

/** Every allowed note shows up at least this often in a full exercise. */
const MIN_EACH = 2;
const DEFAULT_SHAPE = [0.4, 3, 2];

type Side = 'rh' | 'lh';
/** One event: midi, several midis struck together, or null for a rest; and its length in beats. */
type Ev = [number | number[] | null, number];

/** Chord tones of each function, as pitch classes above the tonic. */
const FN_PCS: Record<Fn, number[]> = { I: [0, 4, 7], IV: [5, 9, 0], V: [7, 11, 2, 5] };
/** First and second halves of an 8-bar period: a half cadence, then a full one. */
const OPENING: Fn[][] = [
  ['I', 'IV', 'I', 'V'],
  ['I', 'V', 'I', 'V'],
  ['I', 'I', 'IV', 'V'],
  ['I', 'IV', 'V', 'V']
];
const CLOSING: Fn[][] = [
  ['I', 'IV', 'V', 'I'],
  ['I', 'V', 'V', 'I'],
  ['IV', 'I', 'V', 'I'],
  ['I', 'IV', 'I', 'I'],
  ['IV', 'V', 'V', 'I']
];

/** One chord per bar, in 4-bar phrases, ending on the tonic. */
export function progression(bars: number, rng: () => number): Fn[] {
  const out: Fn[] = [];
  while (out.length < bars) {
    const left = bars - out.length;
    const pool = left <= 4 ? CLOSING : OPENING;
    out.push(...pool[Math.floor(rng() * pool.length)]);
  }
  return out.slice(out.length - bars);
}

const consonant = (a: number, b: number) => [0, 3, 4, 7, 8, 9].includes((((a - b) % 12) + 12) % 12);

class Walker {
  pos: number;
  private repeats = 0;
  constructor(
    private hand: Hand,
    private rng: () => number,
    private weight: (m: number) => number,
    private shape: number[],
    private free: boolean
  ) {
    this.pos = weighted(rng, hand.notes.map((m, i): [number, number] => [i, weight(m)]));
  }
  current(): number {
    return this.hand.notes[this.pos];
  }
  next(bias: (m: number) => number = () => 1): number {
    const notes = this.hand.notes;
    const options: [number, number][] = [];
    for (let i = 0; i < notes.length; i++) {
      const d = Math.abs(i - this.pos);
      let w: number;
      if (this.free) w = d === 0 ? 0.2 : 1;
      else if (d > this.hand.maxLeap) continue;
      else w = d === 0 ? (this.repeats ? 0 : this.shape[0] ?? 0.4) : this.shape[d] ?? 1;
      options.push([i, w * this.weight(notes[i]) * bias(notes[i])]);
    }
    const next = weighted(this.rng, options);
    this.repeats = next === this.pos ? this.repeats + 1 : 0;
    this.pos = next;
    return notes[next];
  }
}

function attempt(lesson: Lesson, opts: GenOptions, rng: () => number): Record<Side, Ev[][]> {
  const weak = opts.weakness ?? new Map<number, number>();
  const weight = (m: number) => 1 + 2 * (weak.get(m) ?? 0);
  const shape = lesson.leapShape ?? DEFAULT_SHAPE;
  const free = lesson.arrangement === 'flash';
  const walkers: Partial<Record<Side, Walker>> = {};
  if (lesson.rh) walkers.rh = new Walker(lesson.rh, rng, weight, shape, free);
  if (lesson.lh) walkers.lh = new Walker(lesson.lh, rng, weight, shape, free);
  const acc = lesson.arrangement === 'together' ? lesson.accomp : undefined;
  const melSide: Side = acc?.melody ?? 'rh';
  if (acc) {
    // Start on the tonic, so the first bar sounds like the key.
    const hand = lesson[melSide]!;
    const w = walkers[melSide]!;
    if (hand.home !== undefined) w.pos = hand.notes.indexOf(hand.home);
  }
  const prog = acc ? progression(opts.bars ?? lesson.bars, rng) : [];
  const tonic = (((lesson.keyFifths * 7) % 12) + 12) % 12;
  const inChord = (m: number, fn: Fn) => FN_PCS[fn].includes((((m - tonic) % 12) + 12) % 12);
  const rhythms = opts.rhythms ?? lesson.rhythms;
  const bars = opts.bars ?? lesson.bars;
  const out: Record<Side, Ev[][]> = { rh: [], lh: [] };
  const firstSide: Side = lesson.arrangement === 'lh' || (lesson.arrangement === 'alternate' && rng() < 0.5) ? 'lh' : 'rh';
  let started: Partial<Record<Side, boolean>> = {};
  const mirrorFirst = lesson.arrangement === 'mirror' && rng() < 0.5;

  const melody = (side: Side, rhythm: number[], last: boolean, fn?: Fn): Ev[] => {
    const w = walkers[side]!;
    const hand = side === 'rh' ? lesson.rh! : lesson.lh!;
    let t = 0;
    return rhythm.map((d, k): Ev => {
      const at = t;
      t += Math.abs(d);
      if (d < 0) return [null, -d];
      if (last && !opts.noHome && k === rhythm.length - 1 && hand.home !== undefined) return [hand.home, d];
      if (!started[side]) {
        started[side] = true;
        return [w.current(), d];
      }
      // On beats 1 and 3, the melody mostly lands on a note of the bar's chord.
      const strong = fn && Math.abs(at % 2) < 1e-9;
      return [w.next(strong ? (m) => (inChord(m, fn) ? 3 : 0.25) : undefined), d];
    });
  };

  for (let b = 0; b < bars; b++) {
    const last = b === bars - 1;
    const pickRhythm = (pool: Rhythm[]) => (last && !opts.noHome ? [4] : weighted(rng, pool));
    let side: Side;
    switch (lesson.arrangement) {
      case 'lh':
        side = 'lh';
        break;
      case 'rh':
        side = 'rh';
        break;
      case 'flash':
        side = lesson.rh && lesson.lh ? (rng() < 0.5 ? 'rh' : 'lh') : lesson.rh ? 'rh' : 'lh';
        break;
      case 'alternate':
        side = b % 2 === 0 ? firstSide : firstSide === 'rh' ? 'lh' : 'rh';
        break;
      case 'together':
        side = melSide;
        break;
      case 'mirror':
        side = 'rh';
        break;
    }
    const mel = melody(side, pickRhythm(rhythms), last, acc ? prog[b] : undefined);
    out[side].push(mel);
    const other: Side = side === 'rh' ? 'lh' : 'rh';
    if (acc) {
      // The other hand plays the bar's chord in one of the lesson's patterns.
      const voicing = acc.chords[prog[b]];
      const pat = last && !opts.noHome ? [[voicing.map((_, i) => i), 4] as [number[], number]] : weighted(rng, acc.patterns);
      out[other].push(pat.map(([idx, d]): Ev => [idx.length === 1 ? voicing[idx[0]] : idx.map((i) => voicing[i]), d]));
    } else if (lesson.arrangement === 'mirror' && lesson.lh) {
      // Same rhythm in both hands: parallel or contrary motion, two bars at a time.
      const contrary = (Math.floor(b / 2) % 2 === 0) === mirrorFirst;
      const rn = lesson.rh!.notes;
      const ln = lesson.lh.notes;
      out.lh.push(
        mel.map(([m, d]): Ev => {
          if (m === null) return [null, d];
          const i = rn.indexOf(m as number);
          return [ln[contrary ? ln.length - 1 - i : i], d];
        })
      );
    } else if (lesson.arrangement === 'together' && lesson.lh) {
      // Long left-hand notes that agree with the melody note above them.
      const lr = last && !opts.noHome ? [4] : weighted(rng, lesson.lhRhythms ?? [[[4], 1]]);
      let t = 0;
      const acc: Ev[] = lr.map((d, k): Ev => {
        let rhNote = (mel[0][0] as number | null) ?? 60;
        let mt = 0;
        for (const [m, md] of mel) {
          if (mt <= t + 1e-9 && typeof m === 'number') rhNote = m;
          mt += md;
        }
        t += d;
        if (last && !opts.noHome && k === lr.length - 1 && lesson.lh!.home !== undefined) return [lesson.lh!.home, d];
        const opts2 = lesson.lh!.notes.map((m): [number, number] => [m, (consonant(m, rhNote) ? 3 : 0.2) * weight(m)]);
        return [weighted(rng, opts2), d];
      });
      out.lh.push(acc);
    } else {
      out[other].push([[null, 4]]);
    }
  }
  return out;
}

function used(bars: Ev[][]): number[] {
  return bars.flat().flatMap(([m]) => (m === null ? [] : Array.isArray(m) ? m : [m]));
}

/** A fresh, finite exercise for a lesson. Same seed, same exercise. */
export function generateExercise(lesson: Lesson, opts: GenOptions): Score {
  const rng = mulberry32(opts.seed);
  let parts = attempt(lesson, opts, rng);
  const full = !opts.bars && !opts.noHome;
  for (let tries = 0; full && tries < 60; tries++) {
    const ok = (['rh', 'lh'] as Side[]).every((side) => {
      const hand = side === 'rh' ? lesson.rh : lesson.lh;
      if (!hand) return true;
      const u = used(parts[side]);
      // One hand alone gets every note twice; when hands share the bars, once is enough.
      const need = lesson.arrangement === 'rh' || lesson.arrangement === 'lh' ? MIN_EACH : 1;
      return hand.notes.every((m) => u.filter((x) => x === m).length >= need);
    });
    if (ok) break;
    parts = attempt(lesson, opts, rng);
  }

  const hasRh = !!lesson.rh && lesson.arrangement !== 'lh';
  const hasLh = !!lesson.lh && lesson.arrangement !== 'rh';
  const grand = opts.grand || (hasRh && hasLh);
  const staffOf = (side: Side) => (grand ? (side === 'rh' ? 0 : 1) : 0);
  const preferFlat = lesson.keyFifths < 0;
  const bars = parts.rh.length || parts.lh.length;

  // Dynamics lessons: piano and forte, two bars each, starting either way.
  const firstDyn = lesson.dynamics ? (rng() < 0.5 ? 'p' : 'f') : undefined;
  const measures: Measure[] = [];
  for (let i = 0; i < bars; i++) {
    const notes: NoteItem[] = [];
    for (const side of ['rh', 'lh'] as Side[]) {
      const bar = parts[side][i];
      if (!bar) continue;
      if (!grand && ((side === 'rh' && !hasRh) || (side === 'lh' && !hasLh))) continue;
      let t = i * 4;
      for (const [midi, dur] of bar) {
        if (midi === null) notes.push(makeNote({ beat: t, dur, staff: staffOf(side), rest: true }));
        else {
          const ms = Array.isArray(midi) ? [...midi].sort((a, b) => a - b) : [midi];
          ms.forEach((m, k) => notes.push(makeNote({ beat: t, dur, staff: staffOf(side), midi: m, spell: spellOfMidi(m, preferFlat), chord: k > 0 })));
        }
        t += dur;
      }
    }
    measures.push({
      number: i + 1,
      startBeat: i * 4,
      length: 4,
      key: lesson.keyFifths,
      keyChange: i === 0,
      time: i === 0 ? [4, 4] : null,
      notes,
      dynamic: firstDyn && i % 2 === 0 ? ((i / 2) % 2 === 0 ? firstDyn : firstDyn === 'p' ? 'f' : 'p') : undefined
    });
  }
  return {
    title: lesson.title,
    bpm: lesson.bpm ?? 60,
    measures,
    infinite: false,
    staves: grand ? 2 : 1,
    clefs: grand ? ['G', 'F'] : [hasLh ? 'F' : 'G']
  };
}

/** Glue scores end to end (level test). Key changes are kept. */
export function concatScores(parts: Score[], title: string): Score {
  const measures: Measure[] = [];
  let beat = 0;
  for (const sc of parts) {
    sc.measures.forEach((m, k) => {
      const shift = beat - m.startBeat;
      measures.push({
        ...m,
        number: measures.length + 1,
        startBeat: beat,
        keyChange: k === 0,
        time: measures.length === 0 ? [4, 4] : null,
        notes: m.notes.map((n) => ({ ...n, beat: n.beat + shift, tieEnd: n.tieEnd + shift }))
      });
      beat += m.length;
    });
  }
  return { title, bpm: 60, measures, infinite: false, staves: 2, clefs: ['G', 'F'] };
}
