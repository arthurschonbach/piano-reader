import { makeNote, spellOfMidi, type Measure, type Score } from '../core/model';
import { mulberry32, weighted } from '../core/random';
import type { Lesson } from './lessons';

export interface GenOptions {
  seed: number;
  /** Per-note difficulty 0..1 (from progress): weak notes come up more. */
  weakness?: ReadonlyMap<number, number>;
}

/** Every allowed note shows up at least this often in an exercise. */
const MIN_EACH = 2;

/** Each bar as [midi, beats] pairs. */
type Bar = [number, number][];

function attempt(lesson: Lesson, rng: () => number, weak: ReadonlyMap<number, number>): Bar[] {
  const notes = lesson.notes!;
  const bars = lesson.bars ?? 8;
  const leap = lesson.maxLeap ?? 2;
  const weight = (m: number) => 1 + 2 * (weak.get(m) ?? 0);
  let pos = weighted(rng, notes.map((m, i): [number, number] => [i, weight(m)]));
  let repeats = 0;
  const out: Bar[] = [];
  for (let b = 0; b < bars; b++) {
    const last = b === bars - 1;
    const rhythm = last ? [4] : weighted(rng, lesson.rhythms!);
    const bar: Bar = [];
    for (let k = 0; k < rhythm.length; k++) {
      if (b === 0 && k === 0) {
        bar.push([notes[pos], rhythm[k]]);
        continue;
      }
      if (last && lesson.home !== undefined) {
        bar.push([lesson.home, rhythm[k]]);
        continue;
      }
      const options: [number, number][] = [];
      for (let d = -leap; d <= leap; d++) {
        const i = pos + d;
        if (i < 0 || i >= notes.length) continue;
        // Steps are the bread and butter, thirds come next, repeats are rare.
        const shape = d === 0 ? (repeats ? 0 : 0.4) : Math.abs(d) === 1 ? 3 : 2 / (Math.abs(d) - 1);
        options.push([i, shape * weight(notes[i])]);
      }
      const next = weighted(rng, options);
      repeats = next === pos ? repeats + 1 : 0;
      pos = next;
      bar.push([notes[pos], rhythm[k]]);
    }
    out.push(bar);
  }
  return out;
}

/** A fresh, finite exercise for a lesson. Same seed, same exercise. */
export function generateExercise(lesson: Lesson, opts: GenOptions): Score {
  const rng = mulberry32(opts.seed);
  const weak = opts.weakness ?? new Map<number, number>();
  const notes = lesson.notes!;
  let bars = attempt(lesson, rng, weak);
  for (let tries = 0; tries < 40; tries++) {
    const flat = bars.flat().map(([m]) => m);
    if (notes.every((m) => flat.filter((x) => x === m).length >= MIN_EACH)) break;
    bars = attempt(lesson, rng, weak);
  }

  const measures: Measure[] = bars.map((bar, i) => {
    let t = i * 4;
    const ms: Measure = {
      number: i + 1,
      startBeat: i * 4,
      length: 4,
      key: 0,
      keyChange: i === 0,
      time: i === 0 ? [4, 4] : null,
      notes: bar.map(([midi, dur]) => {
        const n = makeNote({ beat: t, dur, staff: 0, midi, spell: spellOfMidi(midi) });
        t += dur;
        return n;
      })
    };
    return ms;
  });
  return {
    title: lesson.title,
    bpm: 60,
    measures,
    infinite: false,
    staves: 1,
    clefs: [lesson.clef ?? 'G']
  };
}
