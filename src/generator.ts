import { makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from './model';

export type Contour = 'smooth' | 'wave' | 'leap';
export type Accompaniment = 'basic' | 'alberti' | 'arpeggio' | 'sustained' | 'pulse';
export type Harmony = 'classic' | 'varied' | 'loop';
export type Tri = 0 | 1 | 2;

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
  key?: { root: number; minor: boolean } | 'auto';
  contour?: Contour;
  accompaniment?: Accompaniment;
  harmony?: Harmony;
  motif?: Tri;
  syncop?: Tri;
  rests?: Tri;
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

type ProgPool = [number[], number][];

const PROG_CLASSIC_MAJ: ProgPool = [
  [[0, 3, 4, 0], 3],
  [[0, 1, 4, 0], 2],
  [[0, 4, 5, 3], 1.2],
  [[0, 5, 4, 0], 1.5],
  [[0, 3, 0, 4], 1.2],
  [[0, 3, 1, 4], 1.4],
  [[0, 4, 0, 3], 1],
  [[0, 5, 3, 4], 1.2]
];
const PROG_CLASSIC_MIN: ProgPool = [
  [[0, 3, 4, 0], 3],
  [[0, 1, 4, 0], 1.5],
  [[0, 5, 4, 0], 2],
  [[0, 3, 5, 4], 1.5],
  [[0, 5, 3, 4], 1.2]
];
const PROG_VARIED_MAJ: ProgPool = [
  ...PROG_CLASSIC_MAJ,
  [[0, 5, 1, 4], 1.5],
  [[0, 3, 5, 4], 1.2],
  [[0, 2, 5, 3], 1],
  [[0, 4, 1, 0], 1],
  [[0, 2, 3, 4], 0.8],
  [[0, 1, 3, 4], 1],
  [[0, 3, 4, 3], 1]
];
const PROG_VARIED_MIN: ProgPool = [
  ...PROG_CLASSIC_MIN,
  [[0, 3, 6, 4], 1.5],
  [[0, 6, 5, 4], 1.5],
  [[0, 5, 2, 4], 1],
  [[0, 2, 4, 0], 1],
  [[0, 6, 4, 0], 1]
];
const PROG_LOOP_MAJ: ProgPool = [
  [[0, 4, 5, 3], 3],
  [[0, 5, 3, 4], 3],
  [[0, 5, 1, 4], 2],
  [[0, 3, 4, 3], 1.5],
  [[0, 3, 0, 4], 1.2],
  [[0, 4, 5, 1], 1.5]
];
const PROG_LOOP_MIN: ProgPool = [
  [[0, 5, 6, 4], 3],
  [[0, 5, 3, 4], 2],
  [[0, 3, 6, 4], 2],
  [[0, 5, 4, 0], 1.5],
  [[0, 6, 5, 4], 1.5]
];

function poolFor(harmony: Harmony, minor: boolean): ProgPool {
  if (harmony === 'varied') return minor ? PROG_VARIED_MIN : PROG_VARIED_MAJ;
  if (harmony === 'loop') return minor ? PROG_LOOP_MIN : PROG_LOOP_MAJ;
  return minor ? PROG_CLASSIC_MIN : PROG_CLASSIC_MAJ;
}

const REST_PROB: Record<number, number> = { 1: 0, 2: 0.04, 3: 0.07, 4: 0.12 };
const REST_FACTOR: Record<number, number> = { 0: 0.55, 1: 1, 2: 1.7 };

const BEAT_POOLS: [number[], number][][] = [
  [],
  [[[1], 1]],
  [[[1], 0.55], [[0.5, 0.5], 0.45]],
  [[[1], 0.38], [[0.5, 0.5], 0.32], [[0.25, 0.25, 0.25, 0.25], 0.18], [[0.75, 0.25], 0.12]],
  [[[1], 0.22], [[0.5, 0.5], 0.28], [[0.5, 0.25, 0.25], 0.2], [[0.25, 0.25, 0.25, 0.25], 0.18], [[0.75, 0.25], 0.12]]
];

const CYCLE = [0, 2, 1, 2];

const PROFILES: Record<Contour, { step: number; mid: number; far: number; huge: number; turn: number }> = {
  smooth: { step: 2.6, mid: 1, far: 0.45, huge: 0.12, turn: 0.15 },
  wave: { step: 1.6, mid: 1.1, far: 0.75, huge: 0.25, turn: 0.3 },
  leap: { step: 0.9, mid: 1.6, far: 1.4, huge: 0.4, turn: 0.4 }
};

function durParts(d: number): { base: number; dots: number } {
  if (d === 1.5) return { base: 1, dots: 1 };
  if (d === 3) return { base: 2, dots: 1 };
  if (d === 0.75) return { base: 0.5, dots: 1 };
  return { base: d, dots: 0 };
}

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
  dir: 1 | -1;
  run: number;
  center: number;
}

interface MotifData {
  rhythm: number[][];
  cum: number[];
  rests: boolean[];
  first: number;
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
  private phraseCount = 0;
  private prog: number[] = [0, 3, 4, 0];
  private keepProg = false;
  private rhRhythm: number[][] | null = null;
  private lhRhythm: number[][] | null = null;
  private motifData: MotifData | null = null;
  private arpDir = true;
  private lhVoice: number[] | null = null;
  readonly contour: Contour;
  readonly accompaniment: Accompaniment;
  readonly harmony: Harmony;
  private motif: Tri;
  private syncop: Tri;
  private restsCfg: Tri;
  readonly scale: number[] | null;
  readonly minor: boolean;
  readonly root: number;

  constructor(private cfg: GenConfig) {
    this.rng = mulberry32(cfg.seed);
    this.contour = cfg.contour ?? 'wave';
    this.accompaniment = cfg.accompaniment ?? 'basic';
    this.harmony = cfg.harmony ?? 'classic';
    this.motif = cfg.motif ?? 1;
    this.syncop = cfg.syncop ?? 0;
    this.restsCfg = cfg.rests ?? 1;
    this.rh = this.initHand(cfg.rh);
    this.lh = this.initHand(cfg.lh);
    const k = cfg.key;
    if (k && k !== 'auto') {
      this.scale = (k.minor ? MIN : MAJ).map((s) => (s + k.root) % 12);
      this.minor = k.minor;
      this.root = k.root;
    } else {
      const pcs: number[] = [];
      for (const h of [cfg.rh, cfg.lh]) {
        if (h.enabled) for (const m of h.notes) pcs.push(mod12(m));
      }
      const key = inferKey([...new Set(pcs)]);
      this.scale = key ? key.scale : null;
      this.minor = key ? key.minor : false;
      this.root = key ? key.root : 0;
    }
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
    const center = sorted.length ? sorted.reduce((a, m) => a + m, 0) / sorted.length : 60;
    return { sorted, prev: null, repeat: 0, dir: 1, run: 0, center };
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
    const longProb = long >= 2 ? (level === 1 ? 0.22 : 0.2) : 0;
    const wholeProb = long >= 4 ? 0.2 : 0;
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

  private syncopate(r: number[][]): number[][] {
    if (!this.syncop) return r;
    const p = this.syncop === 1 ? 0.15 : 0.38;
    const out = r.map((b) => [...b]);
    for (let i = 0; i + 1 < out.length; i++) {
      if (out[i].length === 1 && out[i][0] === 1 && out[i + 1].length === 1 && out[i + 1][0] === 1 && this.rng() < p) {
        const heavy = this.rng() < 0.7;
        out[i] = [heavy ? 1.5 : 0.5];
        out[i + 1] = [heavy ? 0.5 : 1.5];
        i++;
      }
    }
    return out;
  }

  private chordPcs(degree: number, withSeventh: boolean): number[] | null {
    const sc = this.scale;
    if (!sc) return null;
    const at = (i: number) => sc[((i % 7) + 7) % 7];
    const pcs = [at(degree), at(degree + 2), at(degree + 4)];
    if (this.minor && degree === 4) pcs[1] = (at(6) + 1) % 12;
    if (withSeventh) {
      let seventh = at(degree + 6);
      if (this.minor && degree === 4) seventh = at(3);
      pcs.push(seventh);
    }
    return [...new Set(pcs)];
  }

  private commit(state: HandState, midi: number): number {
    state.repeat = midi === state.prev ? state.repeat + 1 : 0;
    state.prev = midi;
    return midi;
  }

  private nearestTo(cand: number[], target: number): number | null {
    let best: number | null = null;
    let bd = Infinity;
    for (const m of cand) {
      const d = Math.abs(m - target);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private nearest(state: HandState, pcs: number[] | null): number | null {
    const cand = pcs ? state.sorted.filter((m) => pcs.includes(mod12(m))) : state.sorted;
    if (!cand.length) return null;
    if (state.prev === null) return this.commit(state, cand[Math.floor(cand.length / 2)]);
    const best = this.nearestTo(cand, state.prev);
    return best === null ? null : this.commit(state, best);
  }

  private snap(state: HandState, target: number): number {
    const all = state.sorted;
    const best = this.nearestTo(all, target);
    return best === null ? all[0] : this.commit(state, best);
  }

  private pickPitch(state: HandState, chord: number[] | null, strong: boolean): number | null {
    const all = state.sorted;
    if (!all.length) return null;
    let cand: number[];
    if (chord) {
      cand = all.filter((m) => chord.includes(mod12(m)));
      if (!cand.length) {
        const sc = this.scale ? all.filter((m) => this.scale!.includes(mod12(m))) : [];
        cand = sc.length ? sc : all;
      }
    } else {
      cand = all;
    }
    if (state.repeat >= 2) {
      const moved = cand.filter((m) => m !== state.prev);
      if (moved.length) cand = moved;
    }
    const prof = PROFILES[this.contour];
    const prev = state.prev;
    const lo = all[0];
    const hi = all[all.length - 1];
    const items: [number, number][] = cand.map((m) => {
      const pc = mod12(m);
      let w: number;
      if (!chord) w = 1;
      else if (strong) w = chord.includes(pc) ? 6 : 0.3;
      else w = chord.includes(pc) ? 2 : this.scale && this.scale.includes(pc) ? 1.4 : 0.3;
      if (prev !== null && m !== prev) {
        const d = Math.abs(m - prev);
        if (d <= 2) w *= prof.step;
        else if (d <= 4) w *= prof.mid;
        else if (d <= 7) w *= prof.far;
        else w *= prof.huge;
        if (Math.sign(m - prev) === state.dir) w *= 1.25;
        else w *= 0.85;
      } else if (m === prev) {
        w *= state.repeat >= 1 ? 0.02 : 0.12;
      }
      w *= Math.max(0.3, 1 - Math.abs(m - state.center) / 16);
      if (this.scale && prev !== null && Math.abs(m - prev) === 1) w *= 1.6;
      return [m, w];
    });
    const choice = pickWeighted(this.rng, items);
    const ch = this.commit(state, choice);
    if (prev !== null && choice !== prev) {
      if (choice >= hi - 1) {
        state.dir = -1;
        state.run = 0;
      } else if (choice <= lo + 1) {
        state.dir = 1;
        state.run = 0;
      } else if (Math.sign(choice - prev) === state.dir) {
        state.run++;
      } else {
        state.dir = choice > prev ? 1 : -1;
        state.run = 1;
      }
      if (state.run >= 3 && this.rng() < prof.turn) {
        state.dir = state.dir === 1 ? -1 : 1;
        state.run = 0;
      }
    }
    return ch;
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
      const best = this.nearestTo(cand, melody);
      if (best === null) continue;
      extras.push(best);
      used.add(best);
    }
    return extras;
  }

  private pcCandidates(state: HandState, pcs: number[] | null): number[] {
    const all = state.sorted;
    if (!pcs) return all;
    let c = all.filter((m) => pcs.includes(mod12(m)));
    if (!c.length && this.scale) c = all.filter((m) => this.scale!.includes(mod12(m)));
    return c.length ? c : all;
  }

  private voicing(state: HandState, pcs: number[], prev: number[] | null, anchor: number): number[] {
    const used = new Set<number>();
    const out: number[] = [];
    for (let i = 0; i < pcs.length; i++) {
      const target = prev && prev[i] !== undefined ? prev[i] : anchor + i * 4;
      const cand = state.sorted.filter((m) => mod12(m) === pcs[i] && !used.has(m));
      let m = this.nearestTo(cand, target);
      if (m === null) m = this.nearestTo(state.sorted.filter((x) => !used.has(x)), target);
      if (m === null) continue;
      out.push(m);
      used.add(m);
    }
    return out;
  }

  private tonicPitch(state: HandState): number | null {
    if (!state.sorted.length) return null;
    if (!this.scale) return state.sorted[state.sorted.length - 1];
    const match = state.sorted.filter((m) => mod12(m) === this.scale![0]);
    if (!match.length) return this.nearest(state, null);
    return this.nearest(state, [this.scale![0]]);
  }

  private handNotes(
    state: HandState, hand: HandGen, staff: number, startBeat: number,
    rhythm: number[][], chord: number[] | null, end: 'tonic' | 'dominant' | null,
    arpeggio: boolean, motif: MotifData | null, record?: (m: MotifData) => void
  ): NoteItem[] {
    const notes: NoteItem[] = [];
    const restProb = Math.min(0.4, (REST_PROB[hand.level] ?? 0.08) * REST_FACTOR[this.restsCfg]);
    const flat = this.preferFlat();
    const maxChord = hand.chords ?? 0;
    const push = (start: number, dur: number, midi: number, isChord: boolean) => {
      const { base, dots } = durParts(dur);
      notes.push(makeNote({ beat: startBeat + start, dur, base, dots, staff, midi, chord: isChord, spell: spellOfMidi(midi, flat) }));
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
    const played: (number | null)[] = [];
    let base: number | null = null;
    if (motif) {
      const cand = this.pcCandidates(state, chord);
      base = this.nearestTo(cand, motif.first);
    }
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const strong = Number.isInteger(s.start);
      const isLast = i === slots.length - 1;
      if (end && isLast) {
        const midi = end === 'tonic' ? this.tonicPitch(state) : this.nearest(state, chord);
        if (midi === null) {
          rest(s.start, s.dur);
          played.push(null);
        } else {
          push(s.start, s.dur, midi, false);
          played.push(midi);
        }
        continue;
      }
      if (motif) {
        const intended = (base ?? motif.first) + motif.cum[i];
        if (motif.rests[i]) {
          rest(s.start, s.dur);
          played.push(null);
          continue;
        }
        const midi = this.snap(state, intended);
        push(s.start, s.dur, midi, false);
        played.push(midi);
        if (chord && maxChord >= 3 && strong && s.dur >= 1 && this.rng() < 0.3) {
          for (const extra of this.chordMembers(state, midi, chord, maxChord - 1)) {
            push(s.start, s.dur, extra, true);
          }
        }
        continue;
      }
      if (s.start > 0 && this.rng() < restProb) {
        rest(s.start, s.dur);
        played.push(null);
        continue;
      }
      if (arpeggio && chord) {
        const block = maxChord >= 3 && s.start === 0 && (this.count === 1 || this.rng() < 0.8);
        let midi = block ? this.nearest(state, [chord[0]]) : this.nearest(state, [chord[CYCLE[i % 4]]]);
        if (midi === null) midi = this.pickPitch(state, chord, strong);
        if (midi === null) {
          rest(s.start, s.dur);
          played.push(null);
          continue;
        }
        push(s.start, s.dur, midi, false);
        played.push(midi);
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
        played.push(null);
        continue;
      }
      push(s.start, s.dur, midi, false);
      played.push(midi);
      if (chord && maxChord >= 3 && strong && s.dur >= 1 && this.rng() < 0.42) {
        for (const extra of this.chordMembers(state, midi, chord, maxChord - 1)) {
          push(s.start, s.dur, extra, true);
        }
      }
    }
    if (record) {
      const cum: number[] = [];
      let lastPitch: number | null = null;
      let lastCum = 0;
      let first = NaN;
      for (const p of played) {
        if (p === null) {
          cum.push(lastCum);
          continue;
        }
        if (first !== first) first = p;
        if (lastPitch !== null) lastCum += p - lastPitch;
        cum.push(lastCum);
        lastPitch = p;
      }
      if (first === first) {
        record({ rhythm: rhythm.map((b) => [...b]), cum, rests: played.map((p) => p === null), first });
      }
    }
    return notes;
  }

  private accompNotes(
    state: HandState, hand: HandGen, staff: number, startBeat: number,
    beats: number, chord: number[], end: 'tonic' | 'dominant' | null, style: Accompaniment
  ): NoteItem[] {
    const notes: NoteItem[] = [];
    if (!state.sorted.length) return notes;
    const flat = this.preferFlat();
    const push = (start: number, dur: number, midi: number, isChord: boolean) => {
      const { base, dots } = durParts(dur);
      notes.push(makeNote({ beat: startBeat + start, dur, base, dots, staff, midi, chord: isChord, spell: spellOfMidi(midi, flat) }));
    };
    const cand = this.pcCandidates(state, chord);
    const finishEnd = (lastPrimary: NoteItem | null) => {
      if (end !== 'tonic' || !lastPrimary) return;
      const tp = this.tonicPitch(state);
      if (tp !== null) {
        lastPrimary.midi = tp;
        lastPrimary.spell = spellOfMidi(tp, flat);
      }
    };
    const maxChord = hand.chords ?? 0;
    const voicingSize = maxChord >= 4 ? 4 : maxChord >= 3 ? 3 : 1;
    const block = (start: number, dur: number): NoteItem | null => {
      const pcs = chord.slice(0, voicingSize);
      const anchor = this.lhVoice ? this.lhVoice[0] : state.center - 9;
      const v = this.voicing(state, pcs, this.lhVoice, anchor);
      if (!v.length) return null;
      this.lhVoice = v;
      push(start, dur, v[0], false);
      const primary = notes[notes.length - 1];
      for (let j = 1; j < v.length; j++) push(start, dur, v[j], true);
      return primary;
    };
    const holdEnd = (hand.long ?? 0) >= 2 && beats >= 2 && this.rng() < 0.5;
    const spanEnd = holdEnd ? beats - 1 : beats;

    if (style === 'sustained') {
      const pcs = chord.slice(0, voicingSize);
      const wholeBase = hand.level <= 1 ? 0.6 : 0.3;
      const wholeBoost = hand.long === 4 ? 0.2 : hand.long === 0 ? -0.25 : 0;
      const cells: number[] = [];
      let rem = beats;
      while (rem > 0) {
        if (rem >= 4 && this.rng() < Math.max(0.05, wholeBase + wholeBoost)) {
          cells.push(4);
          rem -= 4;
        } else if (rem >= 2 && this.rng() < (hand.level >= 3 ? 0.4 : 0.7)) {
          cells.push(2);
          rem -= 2;
        } else {
          cells.push(1);
          rem -= 1;
        }
      }
      let t = 0;
      for (const d of cells) {
        const anchor = this.lhVoice ? this.lhVoice[0] : state.center - 9;
        const v = this.voicing(state, pcs, this.lhVoice, anchor);
        if (v.length) {
          this.lhVoice = v;
          push(t, d, v[0], false);
          for (let j = 1; j < v.length; j++) push(t, d, v[j], true);
        } else {
          push(t, d, cand[0], false);
        }
        t += d;
      }
      return notes;
    }

    if (style === 'alberti') {
      const c = state.center;
      const low = this.nearestTo(cand, c - 9);
      if (low === null) return notes;
      const used = new Set([low]);
      const mid = this.nearestTo(cand.filter((m) => !used.has(m)), c - 3) ?? low;
      used.add(mid);
      const high = this.nearestTo(cand.filter((m) => !used.has(m)), c + 3) ?? mid;
      let t = 0;
      let lastPrimary: NoteItem | null = null;
      if (voicingSize >= 3 && this.rng() < 0.45) {
        const b0 = block(0, 1);
        if (b0) {
          lastPrimary = b0;
          t = 1;
        }
      }
      while (t < spanEnd - 1e-9) {
        if (hand.level >= 3) {
          for (const p of [low, high, mid, high]) {
            if (t >= spanEnd - 1e-9) break;
            push(t, 0.25, p, false);
            lastPrimary = notes[notes.length - 1];
            t += 0.25;
          }
        } else if (hand.level === 2) {
          const pair = Math.floor(t) % 2 === 0 ? [low, high] : [mid, high];
          push(t, 0.5, pair[0], false);
          lastPrimary = notes[notes.length - 1];
          t += 0.5;
          if (t < spanEnd - 1e-9) {
            push(t, 0.5, pair[1], false);
            lastPrimary = notes[notes.length - 1];
            t += 0.5;
          }
        } else {
          const seq = [low, mid, high, mid];
          push(t, 1, seq[Math.floor(t) % 4], false);
          lastPrimary = notes[notes.length - 1];
          t += 1;
        }
      }
      if (holdEnd && voicingSize >= 3) {
        const bh = block(beats - 1, 1);
        if (bh) lastPrimary = bh;
      } else if (holdEnd) {
        push(beats - 1, 1, low, false);
        lastPrimary = notes[notes.length - 1];
      }
      finishEnd(lastPrimary);
      return notes;
    }

    if (style === 'arpeggio') {
      const asc = [...new Set(cand)].sort((a, b) => a - b);
      const per = hand.level >= 3 ? 4 : hand.level === 2 ? 2 : 1;
      const step = 1 / per;
      const n = asc.length;
      let startBeat = 0;
      if (voicingSize >= 3 && this.rng() < 0.4) {
        const b0 = block(0, 1);
        if (b0) startBeat = 1;
      }
      const span = spanEnd - startBeat;
      const slots = Math.max(1, Math.round(span / step));
      let lastPrimary: NoteItem | null = null;
      for (let k = 0; k < slots; k++) {
        const idx = this.arpDir ? k % n : (slots - 1 - k) % n;
        const start = startBeat + k * step;
        if (start >= spanEnd - 1e-9) break;
        push(start, Math.min(step, spanEnd - start), asc[idx], false);
        lastPrimary = notes[notes.length - 1];
      }
      if (holdEnd) {
        if (voicingSize >= 3) {
          const bh = block(beats - 1, 1);
          if (bh) lastPrimary = bh;
        } else {
          push(beats - 1, 1, asc[0], false);
          lastPrimary = notes[notes.length - 1];
        }
      }
      finishEnd(lastPrimary);
      return notes;
    }

    const c = state.center;
    const root = this.nearestTo(cand, c - 9);
    if (root === null) return notes;
    const fifthCand = cand.filter((m) => m !== root && mod12(m) === mod12(chord[2]));
    const fifth = this.nearestTo(fifthCand, root + 7) ?? root;
    let t = 0;
    let lastPrimary: NoteItem | null = null;
    if (voicingSize >= 3 && this.rng() < 0.5) {
      const b0 = block(0, 1);
      if (b0) {
        lastPrimary = b0;
        t = 1;
      }
    }
    while (t < spanEnd - 1e-9) {
      if (hand.level >= 2) {
        push(t, 0.5, root, false);
        lastPrimary = notes[notes.length - 1];
        t += 0.5;
        if (t < spanEnd - 1e-9) {
          push(t, 0.5, Math.floor(t) % 4 === 3 ? fifth : root, false);
          lastPrimary = notes[notes.length - 1];
          t += 0.5;
        }
      } else {
        push(t, 1, Math.floor(t) % 4 === 3 ? fifth : root, false);
        lastPrimary = notes[notes.length - 1];
        t += 1;
      }
    }
    if (holdEnd) {
      if (voicingSize >= 3) {
        const bh = block(beats - 1, 1);
        if (bh) lastPrimary = bh;
      } else {
        push(beats - 1, 1, root, false);
        lastPrimary = notes[notes.length - 1];
      }
    }
    finishEnd(lastPrimary);
    return notes;
  }

  nextMeasure(): Measure | null {
    const { rh, lh, time } = this.cfg;
    if (!rh.enabled && !lh.enabled) return null;
    const total = (time[0] * 4) / time[1];
    const beats = Math.max(1, Math.round(total));
    if (this.phrasePos === 0) {
      this.phraseCount++;
      if (!(this.harmony === 'loop' && this.keepProg && this.rng() < 0.6)) {
        const pool = poolFor(this.harmony, !!this.minor);
        this.prog = pickWeighted(this.rng, pool);
        this.keepProg = true;
      }
      this.arpDir = this.rng() < 0.5;
      this.motifData = null;
    }
    const authentic = this.phrasePos === 3 && this.phraseCount % 2 === 1;
    const half = this.phrasePos === 3 && !authentic;
    const degree = this.phrasePos === 3 ? (authentic ? 0 : 4) : this.prog[this.phrasePos % 4];
    const withSeventh = (rh.chords ?? 0) === 4 || (lh.chords ?? 0) === 4;
    const chord = this.chordPcs(degree, withSeventh);
    const end: 'tonic' | 'dominant' | null = authentic ? 'tonic' : half ? 'dominant' : null;
    const notes: NoteItem[] = [];
    if (rh.enabled) {
      const wantReplay = this.motif > 0 && this.motifData !== null && (this.motif === 2 ? this.rng() < 0.9 : this.rng() < 0.5);
      let rhythm: number[][];
      let motif: MotifData | null = null;
      if (wantReplay && this.motifData) {
        motif = this.motifData;
        rhythm = motif.rhythm.map((b) => [...b]);
      } else {
        rhythm = this.syncopate(this.rhythmFor(rh.level, beats, this.rhRhythm, rh.long ?? 2));
      }
      this.rhRhythm = rhythm;
      notes.push(...this.handNotes(this.rh, rh, 0, 0, rhythm, chord, end, false, motif, motif ? undefined : (m) => (this.motifData = m)));
    }
    if (lh.enabled) {
      const style = this.accompaniment;
      if (!chord || style === 'basic') {
        const lhRhythm = this.rhythmFor(lh.level, beats, this.lhRhythm, lh.long ?? 2);
        this.lhRhythm = lhRhythm;
        notes.push(...this.handNotes(this.lh, lh, 1, 0, lhRhythm, chord, end, true, null));
      } else {
        notes.push(...this.accompNotes(this.lh, lh, 1, 0, beats, chord, end, style));
      }
    }
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