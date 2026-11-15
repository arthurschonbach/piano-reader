import { parseMidi } from '../src/input/midi';
import { NoteBus } from '../src/input/bus';
import { buildSteps, HINT_AFTER, summarize, WaitSession } from '../src/exercise/wait';
import { buildTargets, RhythmSession, summarizeRhythm } from '../src/exercise/rhythm';
import { concatScores, generateExercise } from '../src/curriculum/generate';
import { LESSONS, lessonNotes } from '../src/curriculum/lessons';
import { PIECES, PIECE_STAGES, beatsPerBar, parseHand, pieceScore, pieceTags } from '../src/curriculum/pieces';
import { blockPasses, currentLesson, currentPiece, dailyPlan, flashLesson, knownHands, passes, sightReadingLesson } from '../src/curriculum/coach';
import {
  addDays, dayKey, emptyProgress, exportProgress, importProgress, migrate, recordLesson, recordPiece, recordPlacement,
  recordPractice, streak, validatedDays, weakestNotes, weaknessMap, type SessionMetrics
} from '../src/progress/store';
import { dynamicsByMeasure, noteName, makeNote, spellOfMidi, type Score } from '../src/core/model';
import { summarizeTouch, type TouchNote } from '../src/exercise/touch';

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
ok(parseMidi([0x90, 60, 0], 5)?.on === false, 'velocity 0 is a release');
ok(parseMidi([0x80, 60, 40], 5)?.on === false, 'note off');
ok(parseMidi([0xb0, 64, 127], 5) === null, 'sustain pedal ignored');
const bus = new NoteBus();
bus.emit({ midi: 60, on: true, velocity: 80, time: 0 });
bus.emit({ midi: 64, on: true, velocity: 80, time: 0 });
bus.emit({ midi: 60, on: false, velocity: 0, time: 1 });
ok(bus.held.size === 1 && bus.held.has(64), 'bus tracks held keys');

// --- names ---
ok(noteName(spellOfMidi(60)) === 'C' && noteName(spellOfMidi(66)) === 'F♯' && noteName(spellOfMidi(70, true)) === 'B♭', 'letter names');

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
ok(steps.length === 3 && steps[2].midis.join() === '60,67', 'steps: rests skipped, chord grouped');
const s = new WaitSession(steps, 0);
ok(s.noteOn(60, 1000, new Set()).kind === 'correct', 'right note advances');
ok(s.noteOn(65, 1500, new Set()).kind === 'wrong' && s.index === 1, 'wrong note flagged, no advance');
ok(s.noteOn(64, 2200, new Set()).kind === 'correct', 'then the right one');
ok(s.noteOn(60, 2500, new Set([60])).kind === 'partial', 'half a chord waits');
const fin = s.noteOn(67, 2600, new Set([60, 67]));
ok(fin.kind === 'correct' && fin.done, 'chord completes the exercise');
const sum = summarize(s.results);
ok(sum.clean === 2 && sum.medianReactionMs === 800, 'summary: clean count and median without the first step');
const hs = new WaitSession(steps, 0);
let last = hs.noteOn(70, 10, new Set());
for (let i = 1; i < HINT_AFTER; i++) last = hs.noteOn(70, 10, new Set());
ok(last.kind === 'wrong' && last.hint, 'hint after repeated mistakes');

// --- Rhythm mode ---
const targets = buildTargets(tiny);
ok(targets.length === 4, 'rhythm targets: every sounding note, chord split');
const r = new RhythmSession(targets, 1000);
ok(r.noteOn(60, 0.05).kind === 'hit', 'on time = hit');
const early = r.noteOn(64, 0.85);
ok(early.kind === 'hit' && early.grade === 'good' && early.dtMs < 0, '150 ms early = good, negative offset');
ok(r.noteOn(62, 2.0).kind === 'wrong', 'wrong pitch near a note = wrong');
ok(r.noteOn(67, 2.02).kind === 'hit', 'chord member hit');
ok(r.noteOn(72, 3.5).kind === 'extra', 'nothing written near = extra');
ok(r.tick(2.5).length === 1 && targets[2].grade === 'miss', 'unplayed note becomes a miss once its window passes');
const rs = summarizeRhythm(r);
ok(rs.hits === 3 && rs.missed === 1 && Math.abs(rs.accuracy - 0.75) < 1e-9, 'rhythm summary');

// --- Touch: key releases and velocity ---
const rel = new RhythmSession(buildTargets(tiny), 1000);
rel.noteOn(60, 0, 70);
rel.noteOff(60, 0.95);
rel.noteOn(64, 1.02, 72);
rel.noteOff(64, 1.4);
rel.noteOn(60, 2, 75);
rel.noteOn(67, 2, 74);
rel.releaseAll(3.9);
ok(rel.targets[0].velocity === 70 && rel.targets[0].offBeat === 0.95, 'rhythm: velocity and release recorded');
ok(rel.targets[3].offBeat === 4, 'rhythm: keys still down are closed at the end');
const heldEnd = new RhythmSession(buildTargets(tiny), 1000);
heldEnd.noteOn(60, 2, 70);
heldEnd.releaseAll(2.5);
ok(heldEnd.targets[2].offBeat === 4, 'rhythm: a key down when the run ends counts as held to its written end');
const tnOf = (t: (typeof rel.targets)[number]): TouchNote => ({ midi: t.midi, staff: t.note.staff, chord: t.note.chord, velocity: t.velocity ?? 0, start: t.note.beat, end: t.note.tieEnd, on: t.onBeat, off: t.offBeat });
const tsum = summarizeTouch(rel.targets.map(tnOf), { msPerBeat: 1000 });
ok(tsum.heldJudged === 4 && Math.abs(tsum.held! - 0.75) < 1e-9 && tsum.shortAt.join() === '1', 'touch: a quarter released at 40% is too short, the others are held');
const line = (offs: number[]): TouchNote[] => [60, 62, 64, 65, 67].map((m, i) => ({ midi: m, staff: 0, chord: false, velocity: 64, start: i, end: i + 1, on: i, off: offs[i] }));
ok(summarizeTouch(line([1, 2, 3, 4, 5]), { msPerBeat: 500 }).legato === 1, 'touch: releases on the next note are legato');
ok(summarizeTouch(line([0.6, 1.6, 2.6, 3.6, 4.6]), { msPerBeat: 500 }).legato === 0, 'touch: 200 ms gaps are not legato');
const dynNotes: TouchNote[] = [40, 44, 42, 46].map((v): TouchNote => ({ midi: 60, staff: 0, chord: false, velocity: v, dyn: 'p' }))
  .concat([80, 86, 84, 90].map((v): TouchNote => ({ midi: 60, staff: 0, chord: false, velocity: v, dyn: 'f' })));
const ds = summarizeTouch(dynNotes);
ok(Math.round(ds.contrast!) === 42 && ds.dynAccuracy === 1, 'touch: forte − piano contrast');
ok(ds.spread! < 4, 'touch: evenness is measured within each dynamic');
const bal = summarizeTouch(
  [70, 72, 74, 71].map((v): TouchNote => ({ midi: 64, staff: 0, chord: false, velocity: v })).concat([50, 52, 51, 49].map((v): TouchNote => ({ midi: 48, staff: 1, chord: false, velocity: v }))),
  { melodyStaff: 0 }
);
ok(Math.round(bal.balance!) === 21, 'touch: melody above accompaniment');
ok(summarizeTouch(line([1, 2, 3, 4, 5]).map((n) => ({ ...n, velocity: 0 }))).spread === undefined, 'touch: no velocity, no touch verdict');
const ws = new WaitSession(buildSteps(tiny), 0);
ws.noteOn(60, 100, new Set(), 55);
ok(ws.results[0].velocities.join() === '55', 'wait: velocity kept per note');
const baseM = { mode: 'rhythm' as const, accuracy: 1, timingMs: 50, tempo: 60, attempts: [], confusions: [], assisted: false };
ok(passes('rhythm', baseM, 60) && passes('rhythm', { ...baseM, held: 0.9 }, 60), 'held notes: pass when held or not measured');
ok(!passes('rhythm', { ...baseM, held: 0.5 }, 60), 'held notes: fail when released early');
ok(!passes('rhythm', { ...baseM, contrast: 10, dynAccuracy: 1 }, 60, { contrast: 25 }) && passes('rhythm', { ...baseM, contrast: 30, dynAccuracy: 0.9 }, 60, { contrast: 25 }), 'dynamics: contrast required');
ok(!passes('rhythm', baseM, 60, { balance: 10 }) && passes('rhythm', { ...baseM, balance: 12 }, 60, { balance: 10 }), 'balance: required, and missing without a piano');
const pf = generateExercise(LESSONS.find((l) => l.id === 'piano-forte')!, { seed: 3 });
const dyns = dynamicsByMeasure(pf);
ok(dyns.every((d) => d) && dyns.includes('p') && dyns.includes('f') && pf.measures.filter((m) => m.dynamic).length === 4, 'dynamics lesson: p and f every two bars');

// --- Generator, every lesson ---
for (const l of LESSONS) {
  for (const seed of [1, 42, 777]) {
    const sc = generateExercise(l, { seed });
    const notes = sc.measures.flatMap((m) => m.notes);
    const tag = `L${l.number} seed ${seed}`;
    ok(sc.measures.length === l.bars, `${tag}: ${l.bars} bars`);
    const filled = sc.measures.every((m) =>
      [...new Set(m.notes.map((n) => n.staff))].every((st) => Math.abs(m.notes.filter((n) => n.staff === st && !n.chord).reduce((a, n) => a + n.dur, 0) - 4) < 1e-9)
    );
    ok(filled, `${tag}: every staff fills every bar`);
    const allowed = new Set(lessonNotes(l));
    ok(notes.filter((n) => !n.rest).every((n) => allowed.has(n.midi)), `${tag}: only the lesson's notes`);
    ok(sc.measures.every((m) => m.key === l.keyFifths), `${tag}: key signature`);
    if (sc.staves === 2) ok(notes.filter((n) => !n.rest && n.staff === 1).every((n) => n.midi <= 60), `${tag}: left hand on the bass staff`);
    else ok(sc.clefs[0] === (l.arrangement === 'lh' ? 'F' : 'G'), `${tag}: single staff with the right clef`);
    const need = l.arrangement === 'rh' || l.arrangement === 'lh' ? 2 : 1;
    for (const hand of [l.arrangement === 'lh' ? undefined : l.rh, l.arrangement === 'rh' ? undefined : l.lh]) {
      if (!hand) continue;
      ok(hand.notes.every((m) => notes.filter((n) => n.midi === m).length >= need), `${tag}: each note at least ${need}×`);
    }
  }
}
const sol = generateExercise(LESSONS.find((l) => l.id === 'sol-majeur')!, { seed: 5 });
const fs = sol.measures.flatMap((m) => m.notes).filter((n) => n.midi === 66);
ok(fs.length > 0 && fs.every((n) => noteName(n.spell) === 'F♯'), 'G major: F# spelled F♯');
const fa = generateExercise(LESSONS.find((l) => l.id === 'fa-majeur')!, { seed: 5 });
ok(fa.measures.flatMap((m) => m.notes).filter((n) => n.midi === 70).every((n) => noteName(n.spell) === 'B♭'), 'F major: Bb spelled B♭');
const tog = generateExercise(LESSONS.find((l) => l.id === 'deux-mains')!, { seed: 9 });
ok(buildSteps(tog).some((st) => st.midis.length === 2), 'hands together: some steps need both hands');
// --- Hands together: chords and mirrored motion ---
const notesOf = (sc: Score, staff: number) => sc.measures.flatMap((m) => m.notes.filter((n) => n.staff === staff && !n.rest));
const mir = generateExercise(LESSONS.find((l) => l.id === 'mouvement-contraire')!, { seed: 4 });
const rhM = notesOf(mir, 0);
const lhM = notesOf(mir, 1);
ok(rhM.length === lhM.length && rhM.every((n, i) => n.beat === lhM[i].beat && n.dur === lhM[i].dur), 'mirror: same rhythm in both hands');
const moves = rhM.slice(1).map((n, i) => Math.sign(n.midi - rhM[i].midi) * Math.sign(lhM[i + 1].midi - lhM[i].midi));
ok(moves.includes(1) && moves.includes(-1), 'mirror: both parallel and contrary motion');
const chordSc = generateExercise(LESSONS.find((l) => l.id === 'trois-accords')!, { seed: 4 });
const chordSteps = buildSteps(chordSc);
ok(chordSteps.some((st) => st.midis.slice(0, 3).join() === '47,53,55'), 'chords: V7 voicing B-F-G appears');
ok(chordSteps.filter((st) => st.midis.length >= 4).length >= 4, 'chords: melody note struck with a three-note chord');
const lastChord = chordSc.measures.at(-1)!.notes.filter((n) => n.staff === 1).map((n) => n.midi).join();
ok(lastChord === '48,52,55', 'chords: ends on the I chord');
const alb = generateExercise(LESSONS.find((l) => l.id === 'alberti-au-tempo')!, { seed: 4 });
const bar1 = alb.measures[0].notes.filter((n) => n.staff === 1).map((n) => n.midi).join();
ok(bar1 === '48,55,52,55,48,55,52,55', 'Alberti: low, high, middle, high');
const lhMel = generateExercise(LESSONS.find((l) => l.id === 'melodie-main-gauche')!, { seed: 4 });
ok(notesOf(lhMel, 0).some((n) => n.chord) && !notesOf(lhMel, 1).some((n) => n.chord), 'left-hand melody: chords move to the right hand');
ok(generateExercise(LESSONS.find((l) => l.id === 'trois-accords')!, { seed: 4, bars: 2, noHome: true, grand: true }).measures.length === 2, 'chords: short blocks work too');

const a1 = generateExercise(LESSONS[0], { seed: 7 }).measures.flatMap((m) => m.notes.map((n) => n.midi)).join();
ok(a1 === generateExercise(LESSONS[0], { seed: 7 }).measures.flatMap((m) => m.notes.map((n) => n.midi)).join(), 'same seed, same exercise');
let plain = 0;
let weakFa = 0;
for (let seed = 0; seed < 150; seed++) {
  plain += generateExercise(LESSONS[0], { seed }).measures.flatMap((m) => m.notes).filter((x) => x.midi === 65).length;
  weakFa += generateExercise(LESSONS[0], { seed, weakness: new Map([[65, 1]]) }).measures.flatMap((m) => m.notes).filter((x) => x.midi === 65).length;
}
ok(weakFa > plain * 1.2, `weak Fa comes up more (${plain} → ${weakFa})`);

// --- Pieces ---
for (const pc of PIECES) {
  const rh = parseHand(pc.rh);
  const lh = parseHand(pc.lh);
  ok(rh.length === lh.length, `${pc.title}: both hands have ${rh.length} bars`);
  const bpb = beatsPerBar(pc);
  const want = (i: number) => (i === 0 && pc.pickup ? pc.pickup : bpb);
  ok([rh, lh].every((hand) => hand.every((bar, i) => Math.abs(bar.reduce((a, t) => a + t.dur, 0) - want(i)) < 1e-9)), `${pc.title}: every bar is ${bpb} beats${pc.pickup ? ' after the pickup' : ''}`);
  const both = pieceScore(pc, 'both');
  ok(both.measures.every((m, i) => i === 0 || Math.abs(m.startBeat - both.measures[i - 1].startBeat - both.measures[i - 1].length) < 1e-9), `${pc.title}: bars follow each other`);
  ok(pc.level >= 1 && pc.level <= 5, `${pc.title}: level ${pc.level}`);
  ok(both.measures.every((m) => m.key === pc.keyFifths), `${pc.title}: key signature on every bar`);
  ok(both.staves === 2 && pieceScore(pc, 'lh').clefs[0] === 'F', `${pc.title}: grand staff / bass clef alone`);
  ok(both.measures[0].notes.some((n) => n.finger), `${pc.title}: starting fingers given`);
  ok(buildTargets(both).length > 20, `${pc.title}: playable in rhythm mode`);
}
ok(PIECE_STAGES.length === 5 && PIECE_STAGES[0].hands === 'rh' && PIECE_STAGES[4].tempo === 1, 'piece stages: hands apart to full tempo');
ok(PIECES.length >= 15 && [1, 2, 3, 4, 5].every((lv) => PIECES.some((p) => p.level === lv)), `library: ${PIECES.length} pieces covering levels 1 to 5`);
ok(new Set(PIECES.map((p) => p.id)).size === PIECES.length, 'library: unique ids');
const hb = PIECES.find((p) => p.id === 'joyeux-anniversaire')!;
ok(pieceScore(hb, 'both').measures[0].length === 1 && pieceTags(hb).includes('levée') && pieceTags(hb).includes('3/4'), 'pickup bar and tags');
ok(pieceScore(PIECES.find((p) => p.id === 'canon-pachelbel')!, 'rh').measures.flatMap((m) => m.notes).some((n) => n.midi === 78 && noteName(n.spell) === 'F♯'), 'sharps in piece notation');

// --- Progress, mastery, reviews ---
const metrics = (accuracy: number, med: number, extra: Partial<SessionMetrics> = {}): SessionMetrics => ({
  mode: 'wait', accuracy, medianReactionMs: med, attempts: [{ midi: 64, clean: accuracy > 0.9, slow: false }], confusions: [], assisted: false, ...extra
});
ok(passes('wait', metrics(0.96, 900)), 'wait pass');
ok(!passes('wait', metrics(0.96, 1800)), 'too hesitant fails');
ok(!passes('wait', metrics(1, 500, { assisted: true })), 'note names shown fail');
ok(passes('rhythm', { ...metrics(0.92, 0), mode: 'rhythm', timingMs: 80, tempo: 60 }, 60), 'rhythm pass at tempo');
ok(!passes('rhythm', { ...metrics(0.95, 0), mode: 'rhythm', timingMs: 80, tempo: 50 }, 60), 'rhythm below target tempo fails');

const d1 = new Date(2026, 10, 10, 18).getTime();
const d1b = new Date(2026, 10, 10, 21).getTime();
const d2 = new Date(2026, 10, 11, 18).getTime();
let p = recordLesson(emptyProgress(), 'do-main-droite', metrics(1, 800), true, 2, d1).progress;
p = recordLesson(p, 'do-main-droite', metrics(1, 800), true, 2, d1b).progress;
ok(validatedDays(p.lessons['do-main-droite']) === 1, 'same day counts once');
const m2 = recordLesson(p, 'do-main-droite', metrics(1, 800), true, 2, d2);
ok(m2.newlyMastered, 'mastered on the second day');
p = m2.progress;
ok(currentLesson(p)?.id === 'do-main-gauche', 'next lesson becomes current');
ok(streak(p, d2) === 2 && streak(p, d2 + 86400000) === 2 && streak(p, d2 + 3 * 86400000) === 0, 'streak counts consecutive days, tolerates today not done yet');

// Pieces: stages then spaced reviews.
let pp = emptyProgress();
const n = PIECE_STAGES.length;
for (let i = 0; i < n; i++) pp = recordPiece(pp, 'agneau', i, PIECE_STAGES[i].id, n, metrics(1, 700), true, d1).progress;
ok(pp.pieces.agneau.stage === n && pp.pieces.agneau.due === addDays(dayKey(d1), 1), 'learnt piece: first review tomorrow');
pp = recordPiece(pp, 'agneau', n - 1, 'tempo', n, metrics(1, 700), true, d2).progress;
ok(pp.pieces.agneau.interval === 3, 'good review: next in 3 days');
pp = recordPiece(pp, 'agneau', n - 1, 'tempo', n, metrics(0.5, 700), false, d2).progress;
ok(pp.pieces.agneau.interval === 1, 'failed review: back to tomorrow');
const stuck = recordPiece(emptyProgress(), 'agneau', 2, 'ensemble', n, metrics(1, 700), true, d1).progress;
ok(stuck.pieces.agneau.stage === 0, 'stages cannot be skipped');

// Placement and plan.
let pl = recordPlacement(emptyProgress(), ['do-main-droite', 'do-main-gauche', 'alternance'], 'intervalles', d1);
ok(currentLesson(pl)?.id === 'en-rythme', 'after the test: first untested lesson (rhythm) is next');
ok(knownHands(pl).lh.includes(48) && knownHands(pl).rh.includes(67), 'known notes include acquired lessons');
ok(flashLesson(pl).lh !== undefined && flashLesson(pl).arrangement === 'flash', 'warm-up uses both hands once known');
ok(sightReadingLesson(pl).mode === 'rhythm', 'sight-reading is played at tempo');
const plan = dailyPlan(pl, d2).map((a) => a.kind);
ok(plan[0] === 'flash' && plan.includes('sight') && plan.includes('lesson') && plan.includes('piece'), `daily plan: ${plan.join(', ')}`);
ok(blockPasses(7, 8, 1800) && !blockPasses(5, 8, 1000) && !blockPasses(8, 8, 3500), 'level test block rule');
const cat = concatScores([generateExercise(LESSONS[0], { seed: 1, bars: 2, noHome: true, grand: true }), generateExercise(LESSONS[9], { seed: 2, bars: 2, noHome: true, grand: true })], 't');
ok(cat.measures.length === 4 && cat.measures[2].startBeat === 8 && cat.measures[2].keyChange && cat.measures[2].key === 1, 'test blocks glued with their key change');
ok(cat.measures[3].notes.every((x) => x.beat >= 12 && x.beat < 16), 'glued notes shifted in time');

// Notes stats, migration, transfer.
let np = emptyProgress();
for (let i = 0; i < 6; i++) np = recordPractice(np, { ...metrics(0, 900), attempts: [{ midi: 64, clean: false, slow: false }, { midi: 60, clean: true, slow: false }], confusions: [[64, 65, 1]] }, d1);
ok((weaknessMap(np).get(64) ?? 0) > (weaknessMap(np).get(60) ?? 0) && weakestNotes(np)[0]?.midi === 64, 'missed Mi is the weakest note');
ok(np.confusions['64>65'] === 6, 'confusions accumulate');
const old = { version: 2, notes: { 60: { attempts: 3, clean: 3, difficulty: 0 } }, confusions: {}, lessons: { 'do-main-droite': { sessions: [{ date: d1, accuracy: 1, medianReactionMs: 900, assisted: false, validated: true }], mastered: false } } };
const mig = migrate(old);
ok(mig.version === 3 && mig.days.length === 1 && mig.lessons['do-main-droite'].sessions[0].mode === 'wait' && mig.onboarded, 'v2 progress migrates');
const back = importProgress(exportProgress(pl));
ok(!!back && back.placement?.stoppedAt === 'intervalles', 'export / import round trip');
ok(importProgress('n’importe quoi') === null, 'bad code rejected');
pl = recordPractice(pl, metrics(1, 1), d1);
ok(pl.days.includes(dayKey(d1)), 'practice marks the day');

ok(currentPiece(emptyProgress())?.level === 1, 'without a choice, the easiest piece comes first');
ok(currentPiece({ ...emptyProgress(), focusPiece: 'menuet-sol' })?.id === 'menuet-sol', 'the piece chosen in the library becomes current');

if (fails) {
  console.error(`\n${fails} failing check(s)`);
  process.exit(1);
}
console.log('\nLogic OK.');
