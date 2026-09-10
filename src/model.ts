export interface Spelled {
  step: number;
  alter: number;
  octave: number;
}

export interface NoteItem {
  beat: number;
  dur: number;
  base: number;
  staff: number;
  voice: number;
  rest: boolean;
  grace: boolean;
  chord: boolean;
  midi: number;
  spell: Spelled;
  tieStart: boolean;
  tieStop: boolean;
  tieEnd: number;
  tieTarget: NoteItem | null;
  dots: number;
  printed: string | null;
}

export interface Measure {
  number: number;
  startBeat: number;
  length: number;
  key: number;
  keyChange: boolean;
  time: [number, number] | null;
  notes: NoteItem[];
}

export interface Score {
  title: string;
  bpm: number;
  measures: Measure[];
  infinite: boolean;
  staves: number;
  clefs: string[];
}

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_SEMIS = [0, 2, 4, 5, 7, 9, 11];

export function midiOf(s: Spelled): number {
  return (s.octave + 1) * 12 + STEP_SEMIS[s.step] + s.alter;
}

export function spellOfMidi(midi: number, preferFlat = false): Spelled {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  if (preferFlat) {
    const flats: Record<number, [number, number]> = {
      1: [1, -1], 3: [2, -1], 6: [3, -1], 8: [5, -1], 10: [6, -1]
    };
    const f = flats[pc];
    if (f) return { step: f[0], alter: f[1], octave };
  }
  const sharpSteps: Record<number, [number, number]> = {
    0: [0, 0], 1: [0, 1], 2: [1, 0], 3: [1, 1], 4: [2, 0], 5: [3, 0],
    6: [3, 1], 7: [4, 0], 8: [4, 1], 9: [5, 0], 10: [5, 1], 11: [6, 0]
  };
  const [step, alter] = sharpSteps[pc];
  return { step, alter, octave };
}

export function nameOf(s: Spelled): string {
  const base = LETTERS[s.step];
  const acc = s.alter === 1 ? '♯' : s.alter === 2 ? '♯♯' : s.alter === -1 ? '♭' : s.alter === -2 ? '♭♭' : '';
  return `${base}${acc}${s.octave}`;
}

export function makeNote(p: Partial<NoteItem> & { beat: number; dur: number }): NoteItem {
  const spell: Spelled = p.spell ?? spellOfMidi(p.midi ?? 60);
  const midi = p.midi ?? midiOf(spell);
  return {
    beat: p.beat,
    dur: p.dur,
    base: p.base ?? p.dur,
    staff: p.staff ?? 0,
    voice: p.voice ?? 1,
    rest: p.rest ?? false,
    grace: p.grace ?? false,
    chord: p.chord ?? false,
    midi,
    spell,
    tieStart: false,
    tieStop: false,
    tieEnd: p.beat + p.dur,
    tieTarget: null,
    dots: p.dots ?? 0,
    printed: p.printed ?? null
  };
}

export function totalBeats(score: Score): number {
  const m = score.measures[score.measures.length - 1];
  return m ? m.startBeat + m.length : 0;
}

export function measureAt(score: Score, beat: number): number {
  let lo = 0;
  let hi = score.measures.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = score.measures[mid];
    if (beat < m.startBeat) hi = mid - 1;
    else if (beat >= m.startBeat + m.length && mid + 1 < score.measures.length) lo = mid + 1;
    else {
      idx = mid;
      break;
    }
  }
  return idx;
}

export function computeTies(score: Score): void {
  const open = new Map<string, NoteItem>();
  for (const m of score.measures) {
    const sorted = [...m.notes].sort((a, b) => a.beat - b.beat);
    for (const n of sorted) {
      n.tieEnd = n.beat + n.dur;
      n.tieTarget = null;
      const k = `${n.staff}:${n.voice}:${n.midi}`;
      const prev = open.get(k);
      if (n.tieStop && prev) {
        prev.tieTarget = n;
        prev.tieEnd = n.beat + n.dur;
        if (n.tieStart) open.set(k, prev);
        else open.delete(k);
      } else if (n.tieStart) {
        open.set(k, n);
      }
    }
  }
}
