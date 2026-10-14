import { makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from './model';

export type Hands = 'right' | 'left' | 'both';
export type Level = 1 | 2 | 3;
export type KeyId = 'C' | 'G' | 'F' | 'Am';

export interface ExerciseConfig {
  hands: Hands;
  level: Level;
  key: KeyId;
  bpm: number;
  seed: number;
}

export interface GenScore {
  score: Score;
  ensure: (untilBeat: number) => void;
}

const KEYS: Record<KeyId, { root: number; minor: boolean; fifths: number; label: string }> = {
  C: { root: 0, minor: false, fifths: 0, label: 'C major' },
  G: { root: 7, minor: false, fifths: 1, label: 'G major' },
  F: { root: 5, minor: false, fifths: -1, label: 'F major' },
  Am: { root: 9, minor: true, fifths: 0, label: 'A minor' }
};

export function keyLabel(k: KeyId): string {
  return KEYS[k].label;
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

// 8-bar phrases, degrees into the scale (0 = I/i).
const PROG_MAJ = [0, 5, 3, 4, 0, 3, 4, 0];
const PROG_MIN = [0, 5, 2, 6, 0, 3, 4, 0];

function triad(scale: number[], degree: number, minor: boolean): number[] {
  const at = (i: number) => scale[((i % 7) + 7) % 7];
  const pcs = [at(degree), at(degree + 2), at(degree + 4)];
  // Harmonic minor: raise the third of V.
  if (minor && degree === 4) pcs[1] = (pcs[1] + 1) % 12;
  return [...new Set(pcs)];
}

function pick<T>(rng: () => number, items: [T, number][]): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

function durParts(d: number): { base: number; dots: number } {
  if (d === 3) return { base: 2, dots: 1 };
  if (d === 1.5) return { base: 1, dots: 1 };
  return { base: d, dots: 0 };
}

const RHYTHM_1: number[][] = [
  [4],
  [2, 2],
  [2, 1, 1],
  [1, 1, 2],
  [1, 1, 1, 1]
];
const RHYTHM_2: number[][] = [...RHYTHM_1, [1, 1, 1, 1], [2, 1, 1], [1, 2, 1]];
const RHYTHM_3: number[][] = [
  ...RHYTHM_2,
  [0.5, 0.5, 1, 1, 1],
  [1, 1, 0.5, 0.5, 1],
  [1, 0.5, 0.5, 1, 1],
  [1, 1, 1, 0.5, 0.5]
];

class Etude {
  private rng: () => number;
  private scale: number[];
  private minor: boolean;
  private fifths: number;
  private prog: number[];
  private flat: boolean;
  // Melodic state on the scale ladder (index into an extended range).
  private ladder: number[];
  private pos: number;
  private prevMidi: number | null = null;
  private repeats = 0;
  private bar = 0;

  constructor(private cfg: ExerciseConfig) {
    this.rng = mulberry32(cfg.seed);
    const k = KEYS[cfg.key];
    this.scale = (k.minor ? MIN : MAJ).map((s) => (s + k.root) % 12);
    this.minor = k.minor;
    this.fifths = k.fifths;
    this.prog = k.minor ? PROG_MIN : PROG_MAJ;
    this.flat = k.root === 5;
    this.ladder = this.buildLadder();
    // Start in the middle of the range, on the tonic.
    this.pos = this.tonicStart();
  }

  private buildLadder(): number[] {
    // Two octaves of scale midis around C4/C3 depending on hand.
    const soloLeft = this.cfg.hands === 'left';
    const base = soloLeft ? 48 : 60; // C3 / C4
    const lo = base - 7;
    const out: number[] = [];
    for (let m = lo; m <= lo + 25; m++) {
      if (this.scale.includes(((m % 12) + 12) % 12)) out.push(m);
    }
    return out;
  }

  private tonicStart(): number {
    const tonicPc = this.scale[0];
    let best = 0;
    let bd = Infinity;
    const mid = this.ladder[Math.floor(this.ladder.length / 2)];
    this.ladder.forEach((m, i) => {
      if (m % 12 === tonicPc % 12 || ((m % 12) + 12) % 12 === tonicPc) {
        const d = Math.abs(m - mid);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    });
    return best;
  }

  private melodyBar(chord: number[], isHalf: boolean, isFinal: boolean): { midi: number; dur: number; strong: boolean }[] {
    const pool = this.cfg.level === 1 ? RHYTHM_1 : this.cfg.level === 2 ? RHYTHM_2 : RHYTHM_3;
    let durs: number[];
    if (isFinal) {
      durs = this.cfg.level === 1 ? [4] : [2, 2];
    } else if (this.cfg.level === 1 && this.rng() < 0.25) {
      durs = [4];
    } else {
      durs = [...pick(this.rng, pool.map((r): [number[], number] => [r, 1]))];
    }
    if (!isFinal && this.cfg.level >= 2 && durs.length === 2 && durs[0] === 2 && this.rng() < 0.2) {
      durs = [3, 1];
    }
    const out: { midi: number; dur: number; strong: boolean }[] = [];
    let t = 0;
    for (let i = 0; i < durs.length; i++) {
      const d = durs[i];
      const strong = t === 0 || t === 2;
      const last = i === durs.length - 1;
      const midi = this.nextPitch(chord, strong, last && (isHalf || isFinal), isFinal);
      out.push({ midi, dur: d, strong });
      t += d;
    }
    return out;
  }

  private chordToneTarget(chord: number[]): number {
    // Nearest chord tone on the ladder to current pos.
    let best = this.pos;
    let bd = Infinity;
    this.ladder.forEach((m, i) => {
      const pc = ((m % 12) + 12) % 12;
      if (!chord.includes(pc)) return;
      const d = Math.abs(i - this.pos);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private nextPitch(chord: number[], strong: boolean, cadential: boolean, isFinal: boolean): number {
    let target: number;
    if (isFinal) {
      target = this.chordToneTarget([this.scale[0]]);
      // Force exact tonic arrival.
      this.pos = target;
    } else if (cadential) {
      // Half cadence: end bar 4 on scale degree 2 (major) / 5th of V.
      const want = this.minor ? chord[0] : this.scale[1];
      let best = this.pos;
      let bd = Infinity;
      this.ladder.forEach((m, i) => {
        if (((m % 12) + 12) % 12 !== want) return;
        const d = Math.abs(i - this.pos);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      target = best;
      // Approach stepwise: move at most 2 ladder steps toward it now.
      const diff = target - this.pos;
      target = this.pos + Math.max(-2, Math.min(2, diff));
    } else if (strong) {
      // Strong beats: chord tone, stepwise preferred.
      const ct = this.chordToneTarget(chord);
      const diff = ct - this.pos;
      if (Math.abs(diff) <= 2) target = ct;
      else target = this.pos + Math.sign(diff) * (this.rng() < 0.7 ? 1 : 2);
    } else {
      // Weak beats: mostly steps, sometimes thirds.
      const r = this.rng();
      const step = r < 0.62 ? (this.rng() < 0.5 ? 1 : -1) : r < 0.82 ? (this.rng() < 0.5 ? 2 : -2) : 0;
      target = this.pos + step;
      // 65% chance to correct toward chord tone if we drifted off it.
      const pc = ((this.ladder[Math.max(0, Math.min(this.ladder.length - 1, target))] % 12) + 12) % 12;
      if (!chord.includes(pc) && this.scale.includes(pc) && this.rng() < 0.65) {
        target = this.chordToneTarget(chord);
        const diff = target - this.pos;
        if (Math.abs(diff) > 2) target = this.pos + Math.sign(diff) * 2;
      }
    }
    target = Math.max(2, Math.min(this.ladder.length - 3, target));
    const midi = this.ladder[target];
    if (this.prevMidi === midi) {
      this.repeats++;
      if (this.repeats >= 2) {
        target += target >= this.pos ? 1 : -1;
        target = Math.max(2, Math.min(this.ladder.length - 3, target));
        this.repeats = 0;
        this.pos = target;
        this.prevMidi = this.ladder[target];
        return this.prevMidi;
      }
    } else {
      this.repeats = 0;
    }
    this.pos = target;
    this.prevMidi = this.ladder[target];
    return this.ladder[target];
  }

  private bassBar(chord: number[], barInPhrase: number): { midi: number; dur: number }[] {
    // Roots and fifths only. Sobre: whole notes at L1, half notes above.
    const rootPc = chord[0];
    const fifthPc = chord[2] ?? chord[1];
    const find = (pc: number, near: number): number => {
      let best = near;
      let bd = Infinity;
      for (let m = 36; m <= 60; m++) {
        if (((m % 12) + 12) % 12 !== pc) continue;
        const d = Math.abs(m - near);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      return best;
    };
    const root = find(rootPc, 43);
    const fifth = find(fifthPc, root + 7 > 50 ? root - 5 : root + 7);
    void barInPhrase;
    if (this.cfg.level <= 1) return [{ midi: root, dur: 4 }];
    if (this.cfg.level === 2) {
      return this.rng() < 0.5
        ? [{ midi: root, dur: 4 }]
        : [{ midi: root, dur: 2 }, { midi: this.rng() < 0.7 ? fifth : root, dur: 2 }];
    }
    return [
      { midi: root, dur: 2 },
      { midi: this.rng() < 0.6 ? fifth : root, dur: 2 }
    ];
  }

  nextMeasure(): Measure {
    const barInPhrase = this.bar % 8;
    const degree = this.prog[barInPhrase];
    const chord = triad(this.scale, degree, this.minor);
    const isHalf = barInPhrase === 3;
    const isFinal = barInPhrase === 7;
    const notes: NoteItem[] = [];
    const push = (beat: number, dur: number, midi: number, staff: number) => {
      const { base, dots } = durParts(dur);
      notes.push(
        makeNote({ beat, dur, base, dots, staff, voice: 1, midi, spell: spellOfMidi(midi, this.flat) })
      );
    };
    const both = this.cfg.hands === 'both';
    const melodyStaff = this.cfg.hands === 'left' ? 1 : 0;
    if (both || this.cfg.hands === 'right' || this.cfg.hands === 'left') {
      const line = this.melodyBar(chord, isHalf, isFinal);
      let t = 0;
      for (const s of line) {
        push(t, s.dur, s.midi, melodyStaff);
        t += s.dur;
      }
    }
    if (both) {
      const bass = this.bassBar(chord, barInPhrase);
      let t = 0;
      for (const b of bass) {
        push(t, b.dur, b.midi, 1);
        t += b.dur;
      }
    }
    const m: Measure = {
      number: this.bar + 1,
      startBeat: 0,
      length: 4,
      key: this.fifths,
      keyChange: this.bar === 0,
      time: this.bar === 0 ? [4, 4] : null,
      notes
    };
    this.bar++;
    return m;
  }
}

export function makeExercise(cfg: ExerciseConfig): GenScore {
  const etude = new Etude(cfg);
  const soloLeft = cfg.hands === 'left';
  const score: Score = {
    title: `Sight-reading · ${keyLabel(cfg.key)} · Level ${cfg.level}`,
    bpm: cfg.bpm,
    measures: [],
    infinite: true,
    staves: cfg.hands === 'both' ? 2 : 1,
    clefs: cfg.hands === 'both' ? ['G', 'F'] : soloLeft ? ['F'] : ['G']
  };
  let end = 0;
  const ensure = (untilBeat: number) => {
    while (end < untilBeat) {
      const m = etude.nextMeasure();
      m.startBeat = end;
      for (const n of m.notes) n.beat += end;
      score.measures.push(m);
      end += m.length;
    }
  };
  ensure(32);
  return { score, ensure };
}
