import { makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from './model';

export interface HandGen {
  enabled: boolean;
  notes: number[];
  level: number;
  long?: 0 | 2 | 4;
  chords?: 0 | 3 | 4;
}

export interface GenConfig {
  rh: HandGen;
  lh: HandGen;
  time: [number, number];
  bpm: number;
  seed: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MIN = [0, 2, 3, 5, 7, 8, 10];
const FLAT_MAJ_ROOTS = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MIN_ROOTS = new Set([2, 7, 0, 5, 10, 3]);
const MAJ_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
const MIN_FIFTHS = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2];

const PROG_MAJ: number[][] = [
  [0, 3, 4, 0],
  [0, 4, 5, 3],
  [0, 5, 3, 4],
  [0, 3, 0, 4],
  [0, 1, 3, 4]
];
const PROG_MIN: number[][] = [
  [0, 3, 4, 0],
  [0, 5, 3, 4],
  [0, 3, 5, 4],
  [0, 4, 3, 0]
];

const REST_PROB: Record<number, number> = { 1: 0, 2: 0.04, 3: 0.07, 4: 0.12 };

const BEAT_POOLS: [number[], number][][] = [
  [],
  [[[1], 1]],
  [[[1], 0.55], [[0.5, 0.5], 0.45]],
  [[[1], 0.4], [[0.5, 0.5], 0.35], [[0.25, 0.25, 0.25, 0.25], 0.25]],
  [[[1], 0.25], [[0.5, 0.5], 0.3], [[0.5, 0.25, 0.25], 0.25], [[0.25, 0.25, 0.25, 0.25], 0.2]]
];

const CYCLE = [0, 2, 1, 2];

function pickWeighted<T>(rng: () => number, items: [T, number][]): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

interface HandState {
  sorted: number[];
  prev: number | null;
  repeat: number;
}

function mod12(m: number): number {
  return ((m % 12) + 12) % 12;
}

function inferKey(pcs: number[]): { root: number; minor: boolean; scale: number[] } | null {
  if (pcs.length < 3 || pcs.length > 8) return null;
  let best: { root: number; minor: boolean; scale: number[] } | null = null;
  let bestScore = -Infinity;
  for (let root = 0; root < 12; root++) {
    for (const minor of [false, true]) {
      const scale = (minor ? MIN : MAJ).map((s) => (s + root) % 12);
      let score = 0;
      for (const p of scale) if (pcs.includes(p)) score += 1;
      for (const p of pcs) if (!scale.includes(p)) score -= 0.7;
      if (pcs.includes(root)) score += 1.2;
      if (!minor) score += 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = { root, minor, scale };
      }
    }
  }
  return best && bestScore >= 4 ? best : null;
}

export class Generator {
  private rng: () => number;
  private rh: HandState;
  private lh: HandState;
  private count = 0;
  private phrasePos = 0;
  private prog: number[] = [0, 3, 4, 0];
  private rhRhythm: number[][] | null = null;
  private lhRhythm: number[][] | null = null;
  readonly scale: number[] | null;
  readonly minor: boolean;
  readonly root: number;

  constructor(private cfg: GenConfig) {
    this.rng = mulberry32(cfg.seed);
    this.rh = this.initHand(cfg.rh);
    this.lh = this.initHand(cfg.lh);
    const pcs: number[] = [];
    for (const h of [cfg.rh, cfg.lh]) {
      if (h.enabled) for (const m of h.notes) pcs.push(mod12(m));
    }
    const key = inferKey([...new Set(pcs)]);
    this.scale = key ? key.scale : null;
    this.minor = key ? key.minor : false;
    this.root = key ? key.root : 0;
  }

  get keyName(): string {
    const N = ['Do', 'Do♯/Ré♭', 'Ré', 'Ré♯/Mi♭', 'Mi', 'Fa', 'Fa♯/Sol♭', 'Sol', 'Sol♯/La♭', 'La', 'La♯/Si♭', 'Si'];
    return this.scale ? `${N[this.root]}${this.minor ? ' mineur' : ' majeur'}` : 'atonal';
  }

  get keyFifths(): number {
    if (!this.scale) return 0;
    return this.minor ? MIN_FIFTHS[this.root] : MAJ_FIFTHS[this.root];
  }

  private preferFlat(): boolean {
    if (!this.scale) return false;
    return this.minor ? FLAT_MIN_ROOTS.has(this.root) : FLAT_MAJ_ROOTS.has(this.root);
  }

  private initHand(h: HandGen): HandState {
    const sorted = [...h.notes].sort((a, b) => a - b);
    return { sorted, prev: null, repeat: 0 };
  }

  private beatSlots(level: number): number[] {
    const pool = BEAT_POOLS[Math.min(4, Math.max(1, level))];
    return [...pickWeighted(this.rng, pool)];
  }

  private rhythmFor(level: number, beats: number, stored: number[][] | null, long: number): number[][] {
    if (this.phrasePos > 0 && stored && this.rng() < 0.72) {
      const r = stored.map((b) => [...b]);
      if (this.rng() < 0.5) {
        const idxs = r.map((b, i) => [b, i] as const).filter(([b]) => b.length === 1 && b[0] === 1);
        if (idxs.length) {
          const [, bi] = idxs[Math.floor(this.rng() * idxs.length)];
          r[bi] = this.beatSlots(level);
        } else {
          const longs = r.map((b, i) => [b, i] as const).filter(([b]) => b.length === 1 && b[0] >= 2);
          if (longs.length) {
            const [, bi] = longs[Math.floor(this.rng() * longs.length)];
            const d = r[bi][0];
            const opts: number[][] =
              d === 4
                ? [[2, 2], [1, 1, 2], [2, 1, 1], [1, 1, 1, 1]]
                : [[1, 1], [0.5, 0.5, 1], [1, 0.5, 0.5]];
            r[bi] = opts[Math.floor(this.rng() * opts.length)];
          }
        }
      }
      return r;
    }
    const out: number[][] = [];
    const longProb = long >= 2 ? (level === 1 ? 0.22 : 0.13) : 0;
    const wholeProb = long >= 4 ? 0.07 : 0;
    let remaining = beats;
    while (remaining > 0) {
      if (remaining >= 4 && this.rng() < wholeProb) {
        out.push([4]);
        remaining -= 4;
        continue;
      }
      if (remaining >= 2 && this.rng() < longProb) {
        out.push([2]);
        remaining -= 2;
        continue;
      }
      out.push(this.beatSlots(level));
      remaining -= 1;
    }
    return out;
  }

  private chordPcs(degree: number, withSeventh: boolean): number[] | null {
    if (!this.scale) return null;
    const pcs = [this.scale[degree], this.scale[(degree + 2) % 7], this.scale[(degree + 4) % 7]];
    if (withSeventh) pcs.push(this.scale[(degree + 6) % 7]);
    return pcs;
  }

  private commit(state: HandState, midi: number): number {
    state.repeat = midi === state.prev ? state.repeat + 1 : 0;
    state.prev = midi;
    return midi;
  }

  private nearest(state: HandState, pcs: number[] | null): number | null {
    const cand = pcs
      ? state.sorted.filter((m) => pcs.includes(mod12(m)))
      : state.sorted;
    if (!cand.length) return null;
    if (state.prev === null) return cand[Math.floor(cand.length / 2)];
    let best = cand[0];
    let bd = Infinity;
    for (const m of cand) {
      const d = Math.abs(m - state.prev);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return this.commit(state, best);
  }

  private pickPitch(state: HandState, chord: number[] | null, strong: boolean): number | null {
    const all = state.sorted;
    if (!all.length) return null;
    let cand: number[];
    if (chord) {
      cand = all.filter((m) => chord.includes(mod12(m)));
      if (!cand.length) cand = all;
    } else {
      cand = all;
    }
    if (state.repeat >= 2 && cand.length > 1) {
      const moved = cand.filter((m) => m !== state.prev);
      if (moved.length) cand = moved;
    }
    if (!strong && this.rng() < 0.22 && this.scale) {
      const passing = all.filter((m) => this.scale!.includes(mod12(m)));
      if (passing.length) cand = passing;
    }
    if (state.prev !== null && this.rng() < (strong ? 0.85 : 0.7)) {
      let best = cand[0];
      let bd = Infinity;
      for (const m of cand) {
        const d = Math.abs(m - state.prev);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      return this.commit(state, best);
    }
    return this.commit(state, cand[Math.floor(this.rng() * cand.length)]);
  }

  private chordMembers(state: HandState, melody: number, pcs: number[] | null, maxExtra: number): number[] {
    if (!pcs || maxExtra <= 0) return [];
    const extras: number[] = [];
    const used = new Set([melody]);
    for (const pc of pcs) {
      if (extras.length >= maxExtra) break;
      if (pc === mod12(melody)) continue;
      const cand = state.sorted.filter((m) => mod12(m) === pc && !used.has(m));
      if (!cand.length) continue;
      let best = cand[0];
      let bd = Infinity;
      for (const m of cand) {
        const d = Math.abs(m - melody);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      extras.push(best);
      used.add(best);
    }
    return extras;
  }

  private handNotes(
    state: HandState, hand: HandGen, staff: number, startBeat: number,
    rhythm: number[][], chord: number[] | null, endOnTonic: boolean, arpeggio: boolean
  ): NoteItem[] {
    const notes: NoteItem[] = [];
    const restProb = REST_PROB[hand.level] ?? 0.08;
    const flat = this.preferFlat();
    const maxChord = hand.chords ?? 0;
    const push = (start: number, dur: number, midi: number, isChord: boolean) => {
      notes.push(makeNote({ beat: startBeat + start, dur, staff, midi, chord: isChord, spell: spellOfMidi(midi, flat) }));
    };
    const rest = (start: number, dur: number) => {
      notes.push(makeNote({ beat: startBeat + start, dur, staff, rest: true }));
    };
    const slots: { start: number; dur: number }[] = [];
    let t = 0;
    for (const beat of rhythm) {
      for (const d of beat) {
        slots.push({ start: t, dur: d });
        t += d;
      }
    }
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const strong = Number.isInteger(s.start);
      const isLast = i === slots.length - 1;
      if (endOnTonic && isLast) {
        const midi = this.tonicPitch(state);
        if (midi === null) rest(s.start, s.dur);
        else push(s.start, s.dur, midi, false);
        continue;
      }
      if (s.start > 0 && this.rng() < restProb) {
        rest(s.start, s.dur);
        continue;
      }
      if (arpeggio && chord) {
        const block = maxChord >= 3 && s.start === 0 && this.rng() < 0.8;
        let midi = block ? this.nearest(state, [chord[0]]) : this.nearest(state, [chord[CYCLE[i % 4]]]);
        if (midi === null) midi = this.pickPitch(state, chord, strong);
        if (midi === null) {
          rest(s.start, s.dur);
          continue;
        }
        push(s.start, s.dur, midi, false);
        if (block) {
          for (const extra of this.chordMembers(state, midi, chord, maxChord - 1)) {
            push(s.start, s.dur, extra, true);
          }
        }
        continue;
      }
      const midi = this.pickPitch(state, chord, strong);
      if (midi === null) {
        rest(s.start, s.dur);
        continue;
      }
      push(s.start, s.dur, midi, false);
      if (chord && maxChord >= 3 && strong && s.dur >= 1 && this.rng() < 0.42) {
        for (const extra of this.chordMembers(state, midi, chord, maxChord - 1)) {
          push(s.start, s.dur, extra, true);
        }
      }
    }
    return notes;
  }

  private tonicPitch(state: HandState): number | null {
    if (!state.sorted.length) return null;
    if (!this.scale) return state.sorted[state.sorted.length - 1];
    const match = state.sorted.filter((m) => mod12(m) === this.scale![0]);
    if (!match.length) return this.nearest(state, null);
    return this.nearest(state, [this.scale![0]]);
  }

  nextMeasure(): Measure | null {
    const { rh, lh, time } = this.cfg;
    if (!rh.enabled && !lh.enabled) return null;
    const total = (time[0] * 4) / time[1];
    const beats = Math.max(1, Math.round(total));
    if (this.phrasePos === 0) {
      const pool = (this.minor ? PROG_MIN : PROG_MAJ).map((p) => [p, 1] as [number[], number]);
      this.prog = pickWeighted(this.rng, pool);
    }
    const degree = this.prog[this.phrasePos % 4];
    const withSeventh = (rh.chords ?? 0) === 4 || (lh.chords ?? 0) === 4;
    const chord = this.chordPcs(degree, withSeventh);
    const endOnTonic = this.phrasePos === 3;
    this.rhRhythm = this.rhythmFor(rh.level, beats, this.rhRhythm, rh.long ?? 2);
    this.lhRhythm = this.rhythmFor(lh.level, beats, this.lhRhythm, lh.long ?? 2);
    const notes: NoteItem[] = [];
    if (rh.enabled) notes.push(...this.handNotes(this.rh, rh, 0, 0, this.rhRhythm, chord, endOnTonic, false));
    if (lh.enabled) notes.push(...this.handNotes(this.lh, lh, 1, 0, this.lhRhythm, chord, endOnTonic, true));
    const m: Measure = {
      number: ++this.count,
      startBeat: 0,
      length: total,
      key: this.keyFifths,
      keyChange: this.count === 1,
      time: this.count === 1 ? [...time] : null,
      notes
    };
    this.phrasePos = (this.phrasePos + 1) % 4;
    return m;
  }
}

export function keyOf(cfg: GenConfig): string {
  return new Generator(cfg).keyName;
}

export interface GenScore {
  score: Score;
  ensure: (untilBeat: number) => void;
}

export function makeGeneratorScore(cfg: GenConfig): GenScore {
  const gen = new Generator(cfg);
  const score: Score = { title: 'Génération infinie', bpm: cfg.bpm, measures: [], infinite: true, staves: 2, clefs: ['G', 'F'] };
  let end = 0;
  const ensure = (untilBeat: number) => {
    while (end < untilBeat) {
      const m = gen.nextMeasure();
      if (!m) break;
      m.startBeat = end;
      for (const n of m.notes) n.beat += end;
      score.measures.push(m);
      end += m.length;
    }
  };
  ensure(32);
  return { score, ensure };
}