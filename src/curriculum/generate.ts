import { computeTies, makeNote, spellOfMidi, type Measure, type Score } from '../core/model';
import { mulberry32, weighted } from '../core/random';
import { barLength, type Fn, type Hand, type Lesson, type Rhythm } from './lessons';

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

/**
 * What a bar does in its phrase: something new, a copy of an earlier bar
 * (same notes, or moved up or down: a sequence; in the other hand: an
 * imitation), or the cadence that closes the phrase.
 */
export type Plan = { kind: 'new' } | { kind: 'copy'; of: number; move: boolean } | { kind: 'cadence' };

const NEW: Plan = { kind: 'new' };
const CAD: Plan = { kind: 'cadence' };
const copy = (of: number, move: boolean): Plan => ({ kind: 'copy', of, move });

/** 4-bar phrase shapes; `of` counts from the phrase's first bar. */
const PHRASES: Plan[][] = [
  [NEW, copy(0, true), NEW, CAD], // motif, sequence, new idea, cadence
  [NEW, copy(0, false), NEW, CAD], // motif, repeat
  [NEW, NEW, copy(1, true), CAD],
  [NEW, copy(0, true), copy(1, true), CAD] // a sequence that keeps climbing or falling
];

/** The shape of a whole exercise, in 4-bar phrases. Later phrases often bring the opening back. */
export function phrasePlan(bars: number, rng: () => number): Plan[] {
  const out: Plan[] = [];
  for (let p = 0; p < bars; p += 4) {
    let shape: Plan[];
    if (p >= 4 && rng() < 0.6) shape = [copy(0, false), rng() < 0.5 ? copy(1, false) : copy(1, true), NEW, CAD];
    else shape = PHRASES[Math.floor(rng() * PHRASES.length)].map((x) => (x.kind === 'copy' ? copy(x.of + p, x.move) : x));
    out.push(...shape.slice(0, bars - p));
  }
  return out;
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
  // Weak notes come up more, and so do notes not heard yet in this exercise.
  const count = new Map<number, number>();
  const weight = (m: number) => (1 + 2 * (weak.get(m) ?? 0)) * (count.get(m) ? 1 : 2);
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
  const L = barLength(lesson);
  const total = (r: number[]) => r.reduce((a, d) => a + Math.abs(d), 0);
  const fits = (r: number[]) => Math.abs(total(r) - L) < 1e-9;
  // A rhythm longer than the bar holds its last note over the barline (a tie);
  // the next bar of that hand then starts that much later.
  const canOverflow = !['alternate', 'flash'].includes(lesson.arrangement);
  const carry: Partial<Record<Side, number>> = {};
  const pickRhythm = (side: Side, pool: Rhythm[], allowOver: boolean): number[] => {
    const c = carry[side] ?? 0;
    let cands = c
      ? pool.filter(([r]) => fits(r) && r[0] >= c - 1e-9)
      : pool.filter(([r]) => fits(r) || (allowOver && canOverflow && total(r) > L && r[r.length - 1] > 0));
    if (!cands.length) cands = rhythms.filter(([r]) => fits(r) && (!c || r[0] >= c - 1e-9));
    let r = cands.length ? weighted(rng, cands) : [L];
    if (c) {
      r = r[0] - c > 1e-9 ? [r[0] - c, ...r.slice(1)] : r.slice(1);
      carry[side] = 0;
    }
    if (total(r) > L + 1e-9) carry[side] = total(r) - L;
    return r;
  };
  const out: Record<Side, Ev[][]> = { rh: [], lh: [] };
  const firstSide: Side = lesson.arrangement === 'lh' || (lesson.arrangement === 'alternate' && rng() < 0.5) ? 'lh' : 'rh';
  let started: Partial<Record<Side, boolean>> = {};
  const mirrorFirst = lesson.arrangement === 'mirror' && rng() < 0.5;

  const handOf = (side: Side) => (side === 'rh' ? lesson.rh! : lesson.lh!);
  const lastNote = (rhythm: number[]) => rhythm.reduce((k, d, i) => (d > 0 ? i : k), -1);
  /** A new bar from the random walk. `end` steers the bar's last note (cadences). */
  const melody = (side: Side, rhythm: number[], last: boolean, fn?: Fn, end?: (m: number) => number): Ev[] => {
    const w = walkers[side]!;
    const hand = handOf(side);
    const lastK = lastNote(rhythm);
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
      const bias = (m: number) => (strong ? (inChord(m, fn) ? 3 : 0.25) : 1) * (k === lastK && end ? end(m) : 1);
      return [w.next(bias), d];
    });
  };

  // ---- phrase structure ----
  const plan: Plan[] = free ? Array.from({ length: bars }, () => NEW) : phrasePlan(bars, rng);
  /** Each bar's melody as positions in its hand's notes (null = rest). */
  const shapes: { side: Side; rhythm: number[]; pos: (number | null)[] }[] = [];
  let cadences = 0;
  const fitOf = (side: Side, rhythm: number[], pos: (number | null)[], fn: Fn) => {
    let f = 1;
    let t = 0;
    rhythm.forEach((d, k) => {
      const p = pos[k];
      if (p !== null && Math.abs(t % 2) < 1e-9) f *= inChord(handOf(side).notes[p], fn) ? 3 : 0.25;
      t += Math.abs(d);
    });
    return f;
  };
  /** Copy an earlier bar's contour into this bar, if it fits the hand and joins up. */
  const copyBar = (b: number, side: Side, src: (typeof shapes)[number], move: boolean): Ev[] | null => {
    const hand = handOf(side);
    const notes = src.pos.filter((p): p is number => p !== null);
    if (!notes.length) return null;
    const first = notes[0];
    const w = walkers[side]!;
    const shifts = move ? [1, -1, 2, -2] : [0];
    let best: { start: number; fn?: Fn; score: number } | null = null;
    for (const sh of shifts) {
      const start = first + sh;
      const pos = src.pos.map((p) => (p === null ? null : p - first + start));
      if (pos.some((p) => p !== null && (p < 0 || p >= hand.notes.length))) continue;
      if (started[side] && Math.abs(start - w.pos) > hand.maxLeap) continue;
      let fit = 1;
      let fn: Fn | undefined;
      if (acc) {
        // Harmonise the copy: the chord that fits it best, the planned one when tied.
        for (const f of ['I', 'IV', 'V'] as Fn[]) {
          const s = fitOf(side, src.rhythm, pos, f) * (f === prog[b] ? 1.5 : 1);
          if (!fn || s > fit) [fn, fit] = [f, s];
        }
      }
      const score = fit * (1 + rng());
      if (!best || score > best.score) best = { start, fn, score };
    }
    if (!best) return null;
    if (best.fn) prog[b] = best.fn;
    const pos = src.pos.map((p) => (p === null ? null : p - first + best!.start));
    w.pos = pos.filter((p): p is number => p !== null).at(-1)!;
    started[side] = true;
    return src.rhythm.map((d, k): Ev => (d < 0 ? [null, -d] : [hand.notes[pos[k]!], d]));
  };
  const realize = (b: number, side: Side, last: boolean): Ev[] => {
    const p = plan[b];
    const finalBar = last && !opts.noHome;
    let mel: Ev[] | null = null;
    const shortened = !!carry[side];
    const src = p.kind === 'copy' ? shapes[p.of] : undefined;
    if (!finalBar && !shortened && !(!opts.noHome && b === bars - 2) && src && fits(src.rhythm)) mel = copyBar(b, side, src, (p as { move: boolean }).move);
    // The bar before the last one leads home: it ends on a note of the dominant.
    const leadsHome = !opts.noHome && b === bars - 2;
    if (!mel && leadsHome) {
      const V = FN_PCS.V.slice(0, 3);
      mel = melody(side, pickRhythm(side, rhythms, false), false, acc ? prog[b] : undefined, (m) => (V.includes((((m - tonic) % 12) + 12) % 12) ? 6 : 0.2));
    }
    if (!mel && p.kind === 'cadence' && !finalBar) {
      // Phrase ending: a longer last note, on the dominant (a question) or the tonic (an answer).
      const pool = rhythms.filter(([r]) => fits(r) && Math.abs(r[r.length - 1]) >= 2 && r[r.length - 1] > 0);
      const rhythm = pickRhythm(side, pool.length ? pool : rhythms, false);
      const pcs = cadences++ % 2 === 0 ? FN_PCS.V.slice(0, 3) : FN_PCS.I;
      mel = melody(side, rhythm, false, acc ? prog[b] : undefined, (m) => (pcs.includes((((m - tonic) % 12) + 12) % 12) ? 4 : 0.3));
    }
    mel ??= melody(side, finalBar ? [L] : pickRhythm(side, rhythms, !last && b < bars - 2), last, acc ? prog[b] : undefined);
    const hand = handOf(side);
    shapes[b] = { side, rhythm: mel.map(([m, d]) => (m === null ? -d : d)), pos: mel.map(([m]) => (m === null ? null : hand.notes.indexOf(m as number))) };
    for (const [m] of mel) if (typeof m === 'number') count.set(m, (count.get(m) ?? 0) + 1);
    return mel;
  };

  for (let b = 0; b < bars; b++) {
    const last = b === bars - 1;
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
    const mel = realize(b, side, last);
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
      out[other].push([[null, L]]);
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
  const L = barLength(lesson);
  const time = lesson.time ?? [4, 4];
  const measures: Measure[] = [];
  for (let i = 0; i < bars; i++) {
    measures.push({
      number: i + 1,
      startBeat: i * L,
      length: L,
      key: lesson.keyFifths,
      keyChange: i === 0,
      time: i === 0 ? time : null,
      notes: [],
      dynamic: firstDyn && i % 2 === 0 ? ((i / 2) % 2 === 0 ? firstDyn : firstDyn === 'p' ? 'f' : 'p') : undefined
    });
  }
  for (const side of ['rh', 'lh'] as Side[]) {
    if (!grand && ((side === 'rh' && !hasRh) || (side === 'lh' && !hasLh))) continue;
    // One continuous line per hand: a note may run over the barline.
    let t = 0;
    for (const bar of parts[side]) {
      for (const [midi, dur] of bar) {
        const pieces = writtenPieces(t, dur, L, time);
        pieces.forEach(([start, len], k) => {
          const m = measures[Math.floor(start / L + 1e-9)];
          if (!m) return;
          if (midi === null) {
            // A whole bar of silence is a whole rest, whatever the time signature.
            const shape = Math.abs(len - L) < 1e-9 ? { base: 4, dots: 0 } : dotted(len, L);
            m.notes.push(makeNote({ beat: start, dur: len, ...shape, staff: staffOf(side), rest: true }));
            return;
          }
          const ms = Array.isArray(midi) ? [...midi].sort((x, y) => x - y) : [midi];
          ms.forEach((mm, j) => {
            const n = makeNote({ beat: start, dur: len, ...dotted(len, L), staff: staffOf(side), midi: mm, spell: spellOfMidi(mm, preferFlat), chord: j > 0 });
            n.tieStart = k < pieces.length - 1;
            n.tieStop = k > 0;
            m.notes.push(n);
          });
        });
        t += dur;
      }
    }
  }
  const score: Score = {
    title: lesson.title,
    bpm: lesson.bpm ?? 60,
    measures,
    infinite: false,
    staves: grand ? 2 : 1,
    clefs: grand ? ['G', 'F'] : [hasLh ? 'F' : 'G']
  };
  computeTies(score);
  return score;
}

/** Lengths that can be written as one note (with at most one dot). */
const WRITABLE = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];

/**
 * How a note of `dur` beats starting at `t` is written: cut at barlines, at
 * the middle of a 4/4 bar when it starts off the beat (or the dotted-quarter
 * beat in 6/8), and into lengths that exist as single notes. Pieces are tied.
 */
export function writtenPieces(t: number, dur: number, L: number, time: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  const mid = time[1] === 8 ? 1.5 : time[0] === 4 ? 2 : 0;
  let s = t;
  const end = t + dur;
  while (end - s > 1e-9) {
    const barStart = Math.floor(s / L + 1e-9) * L;
    let cut = Math.min(end, barStart + L);
    const rel = s - barStart;
    // In 4/4 only an off-beat start is cut (a half note on beat 2 is fine); in 6/8, any start inside the first group.
    const offBeat = time[1] === 8 || Math.abs(rel - Math.round(rel)) > 1e-9;
    if (mid && offBeat && rel > 1e-9 && rel < mid - 1e-9 && cut - barStart > mid + 1e-9) cut = barStart + mid;
    let len = cut - s;
    if (!WRITABLE.some((w) => Math.abs(w - len) < 1e-9)) len = WRITABLE.find((w) => w < len + 1e-9) ?? len;
    out.push([s, len]);
    s += len;
  }
  return out;
}

/** Note shape for a length: a dotted half for 3 beats, and so on. A full-bar rest is a whole rest. */
function dotted(len: number, L: number): { base: number; dots: number } {
  if (Math.abs(len - L) < 1e-9 && L === 3) return { base: 2, dots: 1 };
  if ([3, 1.5, 0.75].some((x) => Math.abs(x - len) < 1e-9)) return { base: (len * 2) / 3, dots: 1 };
  return { base: len, dots: 0 };
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
