import { parseMidi } from '../src/input/midi';
import { NoteBus } from '../src/input/bus';
import { buildSteps, HINT_AFTER, summarize, WaitSession } from '../src/exercise/wait';
import { generateExercise } from '../src/curriculum/generate';
import { LESSONS, MASTERY } from '../src/curriculum/lessons';
import { emptyProgress, recordSession, validatedDays, weakestNotes, weaknessMap } from '../src/progress/store';
import { frenchName, makeNote, spellOfMidi, type Score } from '../src/core/model';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    fails++;
    console.error(`FAIL: ${msg}`);
  } else console.log(`ok: ${msg}`);
};

// --- MIDI decoding ---
ok(parseMidi([0x90, 60, 100], 5)?.on === true, 'note on');
ok(parseMidi([0x93, 60, 100], 5)?.midi === 60, 'note on, any channel');
ok(parseMidi([0x90, 60, 0], 5)?.on === false, 'note on with velocity 0 is a release');
ok(parseMidi([0x80, 60, 40], 5)?.on === false, 'note off');
ok(parseMidi([0xb0, 64, 127], 5) === null, 'sustain pedal ignored');
ok(parseMidi([0xfe], 5) === null, 'active sensing ignored');

const bus = new NoteBus();
bus.emit({ midi: 60, on: true, velocity: 80, time: 0 });
bus.emit({ midi: 64, on: true, velocity: 80, time: 0 });
bus.emit({ midi: 60, on: false, velocity: 0, time: 1 });
ok(bus.held.size === 1 && bus.held.has(64), 'bus tracks held keys');
bus.releaseAll(2);
ok(bus.held.size === 0, 'releaseAll clears held keys');

// --- French names ---
ok(frenchName(spellOfMidi(60)) === 'Do', 'C4 = Do');
ok(frenchName(spellOfMidi(67)) === 'Sol', 'G4 = Sol');
ok(frenchName(spellOfMidi(66)) === 'Fa♯', 'F#4 = Fa♯');

// --- Wait mode ---
const tiny: Score = {
  title: 't', bpm: 60, infinite: false, staves: 1, clefs: ['G'],
  measures: [{
    number: 1, startBeat: 0, length: 4, key: 0, keyChange: true, time: [4, 4],
    notes: [
      makeNote({ beat: 0, dur: 1, midi: 60 }),
      makeNote({ beat: 1, dur: 1, midi: 64 }),
      makeNote({ beat: 2, dur: 2, midi: 60 }),
      makeNote({ beat: 2, dur: 2, midi: 67, chord: true }),
      makeNote({ beat: 3, dur: 1, rest: true })
    ]
  }]
};
const steps = buildSteps(tiny);
ok(steps.length === 3, 'steps: rests skipped, chord grouped');
ok(steps[2].midis.join() === '60,67', 'chord step expects both notes');

const s = new WaitSession(steps, 0);
const held = new Set<number>();
ok(s.noteOn(60, 1000, held).kind === 'correct', 'right note advances');
ok(s.noteOn(65, 1500, held).kind === 'wrong', 'wrong note is flagged');
ok(s.index === 1, 'wrong note does not advance');
ok(s.noteOn(64, 2200, held).kind === 'correct', 'then the right one advances');
held.add(60);
ok(s.noteOn(60, 2500, held).kind === 'partial', 'half a chord waits for the rest');
const fin = s.noteOn(67, 2600, new Set([60, 67]));
ok(fin.kind === 'correct' && fin.done, 'completing the chord ends the exercise');
ok(s.noteOn(60, 3000, held).kind === 'ignored', 'notes after the end are ignored');
ok(s.results[1].wrong.join() === '65' && s.results[1].reactionMs === 1200, 'result keeps the mistake and the time');

const sum = summarize(s.results);
ok(sum.steps === 3 && sum.clean === 2, 'summary counts clean steps');
ok(Math.abs(sum.accuracy - 2 / 3) < 1e-9, 'accuracy = clean / steps');
ok(sum.medianReactionMs === (1200 + 400) / 2, 'median leaves out the first step');
ok(sum.confusions.length === 1 && sum.confusions[0][0] === 64 && sum.confusions[0][1] === 65, 'confusion Mi→Fa recorded');

const h = new WaitSession(steps, 0);
let last = h.noteOn(70, 10, new Set());
for (let i = 1; i < HINT_AFTER; i++) last = h.noteOn(70, 10, new Set());
ok(last.kind === 'wrong' && last.hint, `hint after ${HINT_AFTER} mistakes`);

// --- Lesson 1 generator ---
const l1 = LESSONS[0];
for (const seed of [1, 2, 3, 42, 999, 123456]) {
  const sc = generateExercise(l1, { seed });
  const notes = sc.measures.flatMap((m) => m.notes);
  ok(sc.measures.length === 8, `seed ${seed}: 8 bars`);
  ok(sc.measures.every((m) => Math.abs(m.notes.reduce((a, n) => a + n.dur, 0) - 4) < 1e-9), `seed ${seed}: every bar fills 4 beats`);
  ok(notes.every((n) => l1.notes!.includes(n.midi)), `seed ${seed}: only Do Ré Mi Fa Sol`);
  ok(l1.notes!.every((m) => notes.filter((n) => n.midi === m).length >= 2), `seed ${seed}: every note comes up at least twice`);
  const mel = notes.map((n) => l1.notes!.indexOf(n.midi));
  ok(mel.slice(0, -1).every((p, i) => i === 0 || Math.abs(p - mel[i - 1]) <= l1.maxLeap!), `seed ${seed}: no jump bigger than a third`);
  ok(notes[notes.length - 1].midi === 60 && notes[notes.length - 1].dur === 4, `seed ${seed}: ends on a whole-note Do`);
  ok(notes.every((n) => [1, 2, 4].includes(n.dur)), `seed ${seed}: whole, half and quarter notes only`);
}
const a = generateExercise(l1, { seed: 7 }).measures.flatMap((m) => m.notes.map((n) => n.midi)).join();
const b = generateExercise(l1, { seed: 7 }).measures.flatMap((m) => m.notes.map((n) => n.midi)).join();
ok(a === b, 'same seed, same exercise');

// Weak notes come up more often.
const count = (weak: Map<number, number>) => {
  let n = 0;
  for (let seed = 0; seed < 200; seed++) {
    n += generateExercise(l1, { seed, weakness: weak }).measures.flatMap((m) => m.notes).filter((x) => x.midi === 65).length;
  }
  return n;
};
const plain = count(new Map());
const weakFa = count(new Map([[65, 1]]));
ok(weakFa > plain * 1.2, `a weak Fa shows up more (${plain} → ${weakFa})`);

// --- Progress ---
const perfect = steps.map((st, i) => ({ expected: st.midis, wrong: [], reactionMs: i ? 900 : 4000, hinted: false }));
const day1 = new Date(2026, 10, 10, 18).getTime();
const day1b = new Date(2026, 10, 10, 21).getTime();
const day2 = new Date(2026, 10, 11, 18).getTime();
let r = recordSession(emptyProgress(), 'do-main-droite', perfect, summarize(perfect), false, day1);
ok(r.validated && !r.newlyMastered, 'perfect session validates, not mastered yet');
r = recordSession(r.progress, 'do-main-droite', perfect, summarize(perfect), false, day1b);
ok(validatedDays(r.progress.lessons['do-main-droite']) === 1 && !r.newlyMastered, 'two sessions the same day count as one day');
r = recordSession(r.progress, 'do-main-droite', perfect, summarize(perfect), true, day2);
ok(!r.validated && !r.progress.lessons['do-main-droite'].mastered, 'session with note names shown does not count');
r = recordSession(r.progress, 'do-main-droite', perfect, summarize(perfect), false, day2);
ok(r.newlyMastered, `mastered after ${MASTERY.days} validated days`);

const slow = perfect.map((x) => ({ ...x, reactionMs: 2500 }));
ok(!recordSession(emptyProgress(), 'x', slow, summarize(slow), false, day1).validated, 'too slow does not validate');

const messy = s.results;
let p = emptyProgress();
for (let i = 0; i < 6; i++) p = recordSession(p, 'x', messy, summarize(messy), false, day1).progress;
ok((weaknessMap(p).get(64) ?? 0) > (weaknessMap(p).get(60) ?? 0), 'missed Mi is weaker than Do');
ok(weakestNotes(p)[0]?.midi === 64, 'Mi tops the notes to work on');
ok(p.confusions["64>65"] === 6, 'confusions accumulate across sessions');

if (fails) {
  console.error(`\n${fails} failing check(s)`);
  process.exit(1);
}
console.log('\nLogic OK.');
