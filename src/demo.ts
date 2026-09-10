import { makeNote, type Measure, type Score } from './model';

const mel: [number, number][] = [
  [60, 1], [60, 1], [67, 1], [67, 1],
  [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1],
  [62, 1], [62, 1], [60, 2],
  [67, 1], [67, 1], [65, 1], [65, 1],
  [64, 1], [64, 1], [62, 2],
  [67, 1], [67, 1], [65, 1], [65, 1],
  [64, 1], [64, 1], [62, 2],
  [60, 1], [60, 1], [67, 1], [67, 1],
  [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1],
  [62, 1], [62, 1], [60, 2]
];

const bass: [number, number][] = [
  [48, 2], [55, 2],
  [53, 2], [48, 2],
  [53, 2], [48, 2],
  [43, 2], [48, 2],
  [48, 2], [55, 2],
  [43, 2], [48, 2],
  [48, 2], [55, 2],
  [43, 2], [48, 2]
];

export function makeDemoScore(): Score {
  const measures: Measure[] = [];
  let startBeat = 0;
  let mi = 0;
  let bi = 0;
  for (let m = 0; m < 8; m++) {
    const notes = [];
    let t = 0;
    while (4 - t > 1e-6) {
      const [midi, dur] = mel[mi++];
      notes.push(makeNote({ beat: startBeat + t, dur, base: dur, staff: 0, midi }));
      t += dur;
    }
    t = 0;
    while (4 - t > 1e-6) {
      const [midi, dur] = bass[bi++];
      notes.push(makeNote({ beat: startBeat + t, dur, base: dur, staff: 1, midi }));
      t += dur;
    }
    measures.push({
      number: m + 1,
      startBeat,
      length: 4,
      key: 0,
      keyChange: m === 0,
      time: m === 0 ? [4, 4] : null,
      notes
    });
    startBeat += 4;
  }
  return { title: 'Ah ! vous dirai-je maman', bpm: 100, measures, infinite: false, staves: 2, clefs: ['G', 'F'] };
}