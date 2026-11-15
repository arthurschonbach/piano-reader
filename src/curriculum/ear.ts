/**
 * Ear training: the app plays a short phrase, the learner plays it back on
 * the piano. Levels go from three neighbouring notes to leaps across the
 * octave, and to hearing the bass of the I, IV and V chords.
 */
import { makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from '../core/model';
import { weighted } from '../core/random';

export interface EarLevel {
  n: number;
  title: string;
  desc: string;
  kind: 'melody' | 'bass';
  /** Notes the melody may use, low to high (melody levels). */
  pool: number[];
  length: number;
  /** Largest jump, in positions inside `pool`. */
  maxStep: number;
  /** Possible first notes (always named on screen). */
  starts: number[];
}

const C_FIVE = [60, 62, 64, 65, 67];
const C_OCTAVE = [60, 62, 64, 65, 67, 69, 71, 72];

export const EAR_LEVELS: EarLevel[] = [
  { n: 1, title: 'Trois notes voisines', desc: 'C, D et E, par notes voisines.', kind: 'melody', pool: [60, 62, 64], length: 3, maxStep: 1, starts: [60] },
  { n: 2, title: 'Position de C', desc: 'De C à G, par notes voisines.', kind: 'melody', pool: C_FIVE, length: 4, maxStep: 1, starts: [60] },
  { n: 3, title: 'Notes voisines et tierces', desc: 'De C à G, avec des sauts d’une tierce.', kind: 'melody', pool: C_FIVE, length: 4, maxStep: 2, starts: [60, 64] },
  { n: 4, title: 'Sauts jusqu’à la quinte', desc: 'De C à G, tous les sauts possibles.', kind: 'melody', pool: C_FIVE, length: 5, maxStep: 4, starts: [60, 64, 67] },
  { n: 5, title: 'Toute l’octave', desc: 'De C4 à C5, notes voisines et tierces.', kind: 'melody', pool: C_OCTAVE, length: 5, maxStep: 2, starts: [60, 64, 67, 72] },
  { n: 6, title: 'Les basses I, IV, V', desc: 'Quatre accords : joue leur basse (C, F ou G), dans l’octave de ton choix.', kind: 'bass', pool: [], length: 4, maxStep: 0, starts: [] },
  { n: 7, title: 'Grands sauts dans l’octave', desc: 'De C4 à C5, sauts jusqu’à la quinte, six notes.', kind: 'melody', pool: C_OCTAVE, length: 6, maxStep: 4, starts: [60, 64, 67, 72] }
];

/** Notes or chords played, in order. A bass dictation keeps the chords to play them. */
export interface Dictation {
  level: EarLevel;
  /** What the learner must play, in order. */
  answer: number[];
  /** What the app plays: one entry per beat, several notes for a chord. */
  sound: number[][];
}

/** C major voicings: root in the bass, the chord above middle C. */
const CHORDS: Record<'I' | 'IV' | 'V', number[]> = { I: [48, 60, 64, 67], IV: [53, 60, 65, 69], V: [55, 59, 62, 67] };
const BASS_LINES: ('I' | 'IV' | 'V')[][] = [
  ['I', 'IV', 'V', 'I'],
  ['I', 'V', 'I', 'V'],
  ['I', 'IV', 'I', 'V'],
  ['I', 'V', 'IV', 'I'],
  ['I', 'IV', 'IV', 'V'],
  ['I', 'V', 'V', 'I'],
  ['I', 'I', 'IV', 'V']
];

const TONIC_TRIAD = [0, 4, 7];

export function makeDictation(level: EarLevel, rng: () => number): Dictation {
  if (level.kind === 'bass') {
    const line = BASS_LINES[Math.floor(rng() * BASS_LINES.length)];
    return { level, answer: line.map((f) => CHORDS[f][0]), sound: line.map((f) => CHORDS[f]) };
  }
  const pool = level.pool;
  let pos = pool.indexOf(level.starts[Math.floor(rng() * level.starts.length)]);
  const out = [pool[pos]];
  for (let k = 1; k < level.length; k++) {
    const last = k === level.length - 1;
    const options: [number, number][] = [];
    for (let i = 0; i < pool.length; i++) {
      const d = Math.abs(i - pos);
      if (d > level.maxStep) continue;
      // Mostly steps, some leaps, few repeated notes; end on C, E or G.
      let w = d === 0 ? 0.15 : d === 1 ? 3 : 1.5 / d;
      if (last) w *= TONIC_TRIAD.includes(pool[i] % 12) ? 4 : 0.4;
      options.push([i, w]);
    }
    pos = weighted(rng, options);
    out.push(pool[pos]);
  }
  return { level, answer: out, sound: out.map((m) => [m]) };
}

export type EarFeedback = { kind: 'ok'; index: number; done: boolean } | { kind: 'wrong'; played: number; wrongs: number };

/** One dictation being answered: the notes must come in order; a wrong one sends back to the start. */
export class EarTry {
  pos = 0;
  wrongs = 0;
  constructor(readonly d: Dictation) {}

  private matches(midi: number, expected: number): boolean {
    // A bass can be played in any octave.
    return this.d.level.kind === 'bass' ? midi % 12 === expected % 12 : midi === expected;
  }

  get done(): boolean {
    return this.pos >= this.d.answer.length;
  }

  noteOn(midi: number): EarFeedback | null {
    if (this.done) return null;
    if (this.matches(midi, this.d.answer[this.pos])) {
      this.pos++;
      return { kind: 'ok', index: this.pos - 1, done: this.done };
    }
    this.wrongs++;
    this.pos = 0;
    return { kind: 'wrong', played: midi, wrongs: this.wrongs };
  }
}

/** Items in one ear session. */
export const EAR_ITEMS = 8;
/** Level up at 7/8 right first time, down at 3/8 or less. */
export const EAR_UP = 7;
export const EAR_DOWN = 3;
/** After this many wrong tries, the answer is shown. */
export const EAR_REVEAL_AFTER = 3;

export function nextEarLevel(level: number, clean: number): number {
  if (clean >= EAR_UP) return Math.min(EAR_LEVELS.length, level + 1);
  if (clean <= EAR_DOWN) return Math.max(1, level - 1);
  return level;
}

/** The dictation written out, so the sound can be matched with the page. */
export function dictationScore(d: Dictation): Score {
  const bass = d.level.kind === 'bass';
  const beats = d.answer.length;
  const bars = Math.ceil(beats / 4);
  const measures: Measure[] = [];
  for (let b = 0; b < bars; b++) {
    const notes: NoteItem[] = [];
    for (let i = b * 4; i < Math.min(beats, b * 4 + 4); i++) {
      const m = d.answer[i];
      notes.push(makeNote({ beat: i, dur: 1, midi: m, spell: spellOfMidi(m) }));
    }
    const used = Math.min(4, beats - b * 4);
    for (let r = used; r < 4; r++) notes.push(makeNote({ beat: b * 4 + r, dur: 1, rest: true }));
    measures.push({ number: b + 1, startBeat: b * 4, length: 4, key: 0, keyChange: b === 0, time: b === 0 ? [4, 4] : null, notes });
  }
  return { title: 'Dictée', bpm: 80, measures, infinite: false, staves: 1, clefs: [bass ? 'F' : 'G'] };
}
