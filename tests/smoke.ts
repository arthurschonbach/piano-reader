import { DOMParser } from 'linkedom';
import { parseXmlDoc } from '../src/musicxml';
import { makeExercise } from '../src/generator';
import { onsetsInRange, SoundEngine } from '../src/audio';
import { recordSession } from '../src/stats';
import { makeDemoScore } from '../src/demo';
import { computeTies, midiOf, type Score } from '../src/model';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Test</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>-1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <sound tempo="72"/>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff><chord/></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>F</step><alter>1</alter><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff><tie type="start"/><notations><tied type="start"/></notations></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff><tie type="stop"/><notations><tied type="stop"/></notations></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>6</duration></backup>
      <note><rest measure="yes"/><duration>8</duration><voice>1</voice><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>
`;

const doc = new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
const score = parseXmlDoc(doc, 'test.musicxml');

const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
};

assert(score.title === 'Test', 'title from work-title');
assert(score.bpm === 72, 'tempo from <sound tempo>');
assert(score.measures.length === 2, '2 bars');
assert(score.staves === 2, '2 staves');
assert(score.clefs[0] === 'G' && score.clefs[1] === 'F', 'G/F clefs');
assert(score.measures[0].key === -1, 'key signature -1');

const m1 = score.measures[0];
assert(m1.notes.length === 4, 'bar 1: 4 events (C/E chord + G half + F# whole)');
const rhChord = m1.notes.filter((n) => n.beat === 0 && n.staff === 0);
assert(rhChord.length === 2, '2-note RH chord on beat 0');
assert(rhChord.some((n) => n.chord), 'chord member flagged');
const g4 = m1.notes.find((n) => n.beat === 1)!;
assert(g4 && g4.dur === 2, 'G4 half note on beat 1');
const wholeLh = m1.notes.find((n) => n.staff === 1)!;
assert(wholeLh.beat === 0 && wholeLh.dur === 4, 'left hand: whole note at the start');
assert(wholeLh.midi === midiOf({ step: 3, alter: 1, octave: 3 }), 'midi F#3 = 54');

const m2 = score.measures[1];
assert(m2.startBeat === 4, 'bar 2 starts on beat 4');
assert(m2.length === 4, 'bar 2 is 4 beats');
const a = m2.notes.find((n) => n.spell.step === 5 && n.staff === 0)!;
assert(a.tieStart && a.dur === 1 && a.beat === 4, 'tie start on A4 at beat 4');
const restLh = m2.notes.find((n) => n.staff === 1)!;
assert(restLh.rest && restLh.base === 4, 'full-bar rest in LH');

computeTies(score);
assert(a.tieEnd === 6, 'tie extends A4 to beat 6');
assert(a.tieTarget !== null && a.tieTarget.beat === 5, 'tieTarget on the next beat');

const demo = makeDemoScore();
assert(demo.measures.length === 8, 'demo: 8 bars');
assert(demo.measures[1].startBeat === 4, 'demo: 4-beat bars');
assert(demo.measures.every((m) => m.notes.some((n) => n.staff === 0) && m.notes.some((n) => n.staff === 1)), 'demo: both hands');

// --- Sight-reading exercises ---

const C_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

const ex = makeExercise({ hands: 'right', level: 1, key: 'C', bpm: 60, seed: 42 });
const gs: Score = ex.score;
assert(gs.measures.length >= 8, 'exercise: 8+ bars pre-generated');
assert(gs.measures.every((m) => m.length === 4), 'exercise: 4-beat bars');
for (let i = 1; i < gs.measures.length; i++) {
  assert(
    gs.measures[i].startBeat === gs.measures[i - 1].startBeat + gs.measures[i - 1].length,
    `bar ${i + 1} follows the previous one`
  );
}
assert(gs.staves === 1 && gs.clefs[0] === 'G', 'right hand only: single treble staff');
for (const m of gs.measures) {
  assert(m.notes.filter((n) => !n.rest).every((n) => C_PCS.has(((n.midi % 12) + 12) % 12)), `bar ${m.number}: diatonic to C major`);
  const sum = m.notes.reduce((s, n) => s + n.dur, 0);
  assert(Math.abs(sum - 4) < 1e-6, `bar ${m.number}: fills 4 beats`);
  assert(m.notes.every((n) => n.dur === 1 || n.dur === 2 || n.dur === 4), `bar ${m.number}: level 1 has no eighth notes`);
}
// 8-bar phrase: bar 8 resolves to the tonic.
const finalBar = gs.measures[7].notes.filter((n) => !n.rest).at(-1)!;
assert(finalBar.midi % 12 === 0, 'phrase resolves to C');

ex.ensure(200);
assert(gs.measures.length >= 50, 'ensure keeps generating while playing');
const lastM = gs.measures[gs.measures.length - 1];
assert(lastM.startBeat + lastM.length >= 200, 'material generated past beat 200');

const both = makeExercise({ hands: 'both', level: 2, key: 'G', bpm: 80, seed: 7 });
both.ensure(64);
assert(both.score.staves === 2, 'both hands: two staves');
assert(both.score.measures.every((m) => m.notes.some((n) => n.staff === 0) && m.notes.some((n) => n.staff === 1)), 'both hands: every bar has both hands');
for (const m of both.score.measures) {
  const lh = m.notes.filter((n) => n.staff === 1);
  const sum = lh.reduce((s, n) => s + n.dur, 0);
  assert(Math.abs(sum - 4) < 1e-6, `bar ${m.number}: LH fills 4 beats`);
  assert(lh.every((n) => n.dur >= 2), `bar ${m.number}: LH in long values`);
}

const left = makeExercise({ hands: 'left', level: 1, key: 'Am', bpm: 60, seed: 3 });
assert(left.score.staves === 1 && left.score.clefs[0] === 'F', 'left hand only: single bass staff');
assert(left.score.measures.every((m) => m.notes.every((n) => n.staff === 1)), 'left hand only: nothing on staff 0');

// --- Sound scheduling helpers (pure, no AudioContext needed) ---

const on0 = onsetsInRange(demo, -0.001, 0.001);
assert(on0.length === 2, 'demo beat 0: melody C4 + bass C3 sound together');
assert(on0.some((o) => o.midi === 60 && o.durBeats === 1), 'melody onset carries its beat duration');
assert(on0.some((o) => o.midi === 48 && o.durBeats === 2), 'bass onset carries its beat duration');

const chordOn = onsetsInRange(score, -0.001, 0.001);
assert(chordOn.length === 3, 'imported chord: both members + bass whole note scheduled');
assert(chordOn.filter((o) => o.beat === 0).length === 3, 'all three share the onset beat');

assert(onsetsInRange(demo, 0, 0).length === 0, 'empty window schedules nothing');
assert(onsetsInRange(demo, 2, 1).length === 0, 'reversed window schedules nothing');
const all = onsetsInRange(demo, -1, 100);
assert(all.every((o, i) => i === 0 || all[i - 1].beat <= o.beat), 'onsets come out in beat order');
assert(all.every((o) => o.durBeats >= 0.15), 'every onset has a singable duration');
assert(on0.every((o) => o.accent), 'bar-line onsets are accented');
assert(onsetsInRange(demo, 0.5, 1.5).every((o) => !o.accent), 'off-beat onsets are not accented');

// --- Multi-part import: hands split across two parts ---

const twoPart = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Two Hands</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Right</part-name></score-part>
    <score-part id="P2"><part-name>Left</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>
`;
const doc2 = new DOMParser().parseFromString(twoPart, 'text/xml') as unknown as Document;
const merged = parseXmlDoc(doc2, 'two.xml');
assert(merged.title === 'Two Hands', 'two-part: title kept');
assert(merged.measures.length === 1, 'two-part: bars merged by index');
assert(merged.staves === 2, 'two-part: both hands kept');
assert(merged.clefs[0] === 'G' && merged.clefs[1] === 'F', 'two-part: clefs from each part');
const mm = merged.measures[0];
assert(mm.notes.some((n) => n.staff === 0 && n.midi === 60), 'two-part: RH note on staff 0');
assert(mm.notes.some((n) => n.staff === 1 && n.midi === 48), 'two-part: LH note on staff 1');
assert(Math.abs(mm.length - 2) < 1e-6, 'two-part: bar length is the longest part');
const lh = mm.notes.find((n) => n.staff === 1)!;
assert(lh.beat === mm.startBeat, 'two-part: hands stay time-aligned');

// --- Practice stats ---

let stats = recordSession([], { key: 'right·1·C', label: 'Right hand · Level 1 · C major', bars: 8, tempo: 60, now: 1000 });
assert(stats.length === 1 && stats[0].sessions === 1 && stats[0].bars === 8, 'first session recorded');
stats = recordSession(stats, { key: 'right·1·C', label: 'Right hand · Level 1 · C major', bars: 12, tempo: 72, now: 2000 });
assert(stats.length === 1 && stats[0].sessions === 2 && stats[0].bars === 20, 'repeat sessions accumulate');
assert(stats[0].topTempo === 72, 'top tempo tracks the fastest session');
stats = recordSession(stats, { key: 'both·2·G', label: 'Both hands · Level 2 · G major', bars: 4, tempo: 80, now: 3000 });
assert(stats.length === 2 && stats[0].key === 'both·2·G', 'most recent practice sorts first');
assert(recordSession(stats, { key: 'x', label: 'X', bars: -2, tempo: -5, now: 4000 }).find((s) => s.key === 'x')?.bars === 0, 'nonsense input clamps to zero');

// --- First-note regression: the onset under the cursor must sound ---

assert(onsetsInRange(demo, 0 - 1e-4, 0 + 0.3).some((o) => o.beat === 0), 'cursor window includes the onset at beat 0');
assert(!onsetsInRange(demo, 0, 0 + 0.3).some((o) => o.beat === 0), 'streaming windows stay half-open (no double plays)');
{
  // White-box: reset() must park just before the cursor, never exactly on it.
  const engine = new SoundEngine();
  engine.reset(0);
  const su = (engine as unknown as { scheduledUntil: number }).scheduledUntil;
  assert(su < 0 && su > -0.01, 'reset(0) parks the window before beat 0');
  engine.reset(5);
  const su5 = (engine as unknown as { scheduledUntil: number }).scheduledUntil;
  assert(su5 < 5 && su5 > 5 - 0.01, 'reset(5) parks the window before beat 5');
  assert(onsetsInRange(demo, su, su + 0.31).some((o) => o.beat === 0), 'first sync after reset(0) schedules the first note');
}

console.log('\nAll tests pass.');
