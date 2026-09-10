import { DOMParser } from 'linkedom';
import { parseXmlDoc } from '../src/musicxml';
import { Generator, makeGeneratorScore } from '../src/generator';
import { makeDemoScore } from '../src/demo';
import { computeTies, midiOf } from '../src/model';

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
    console.error(`ÉCHEC: ${msg}`);
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
};

assert(score.title === 'Test', 'titre depuis work-title');
assert(score.bpm === 72, 'tempo depuis <sound tempo>');
assert(score.measures.length === 2, '2 mesures');
assert(score.staves === 2, '2 portées');
assert(score.clefs[0] === 'G' && score.clefs[1] === 'F', 'clés G/F');
assert(score.measures[0].key === -1, 'armure -1');

const m1 = score.measures[0];
assert(m1.notes.length === 4, 'mesure 1: 4 événements (accord C/E + demi G + ronde F#)');
const rhChord = m1.notes.filter((n) => n.beat === 0 && n.staff === 0);
assert(rhChord.length === 2, 'accord de 2 notes RH au temps 0');
assert(rhChord.some((n) => n.chord), 'note d accord marquée');
const g4 = m1.notes.find((n) => n.beat === 1)!;
assert(g4 && g4.dur === 2, 'G4 demi au temps 1');
const wholeLh = m1.notes.find((n) => n.staff === 1)!;
assert(wholeLh.beat === 0 && wholeLh.dur === 4, 'main gauche: ronde au début');
assert(wholeLh.midi === midiOf({ step: 3, alter: 1, octave: 3 }), 'midi F#3 = 54');

const m2 = score.measures[1];
assert(m2.startBeat === 4, 'mesure 2 démarre à 4 temps');
assert(m2.length === 4, 'mesure 2 de 4 temps');
const a = m2.notes.find((n) => n.spell.step === 5 && n.staff === 0)!;
assert(a.tieStart && a.dur === 1 && a.beat === 4, 'tie start sur A4 au temps 4');
const restLh = m2.notes.find((n) => n.staff === 1)!;
assert(restLh.rest && restLh.base === 4, 'silence de mesure = pause générale');

computeTies(score);
assert(a.tieEnd === 6, 'tie étend A4 jusqu à 6');
assert(a.tieTarget !== null && a.tieTarget.beat === 5, 'tieTarget au beat suivant');

const demo = makeDemoScore();
assert(demo.measures.length === 8, 'démo: 8 mesures');
assert(demo.measures[1].startBeat === 4, 'démo: mesures de 4 temps');
assert(demo.measures.every((m) => m.notes.some((n) => n.staff === 0) && m.notes.some((n) => n.staff === 1)), 'démo: 2 mains');

const gen = makeGeneratorScore({
  rh: { enabled: true, notes: [60, 62, 64, 65, 67], level: 3 },
  lh: { enabled: true, notes: [48, 52, 55], level: 1 },
  time: [4, 4],
  bpm: 80,
  seed: 42
});
const gs = gen.score;
assert(gs.measures.length >= 8, 'génération pré-remplit 8+ mesures');
assert(gs.measures.every((m) => m.length === 4), 'génération: mesures de 4 temps');
for (let i = 1; i < gs.measures.length; i++) {
  assert(gs.measures[i].startBeat === gs.measures[i - 1].startBeat + gs.measures[i - 1].length, `mesure ${i + 1} enchaînée`);
}
assert(
  gs.measures.every((m) => m.notes.filter((n) => !n.rest).every((n) => [60, 62, 64, 65, 67, 48, 52, 55].includes(n.midi))),
  'notes générées dans les sets choisis'
);

const genProbe = new Generator({ rh: { enabled: true, notes: [60, 62, 64, 65, 67], level: 3 }, lh: { enabled: true, notes: [48, 52, 55], level: 1 }, time: [4, 4], bpm: 80, seed: 42 });
assert(genProbe.keyName === 'Do majeur', `tonalité inférée: Do majeur (reçu: ${genProbe.keyName})`);
assert(genProbe.keyFifths === 0, 'armure Do majeur = 0');

for (const m of gs.measures) {
  const rhNotes = m.notes.filter((n) => n.staff === 0 && !n.rest);
  assert(rhNotes.every((n) => [0, 2, 4, 5, 7, 9, 11].includes(((n.midi % 12) + 12) % 12)), `mesure ${m.number}: RH diatonique`);
  const sum = m.notes.filter((n) => n.staff === 0).reduce((a, n) => a + n.dur, 0);
  assert(Math.abs(sum - 4) < 1e-6, `mesure ${m.number}: RH remplit 4 temps`);
  const lhSum = m.notes.filter((n) => n.staff === 1).reduce((a, n) => a + n.dur, 0);
  assert(Math.abs(lhSum - 4) < 1e-6, `mesure ${m.number}: LH remplit 4 temps`);
}

const phraseEnd = gs.measures[3].notes.filter((n) => n.staff === 0 && !n.rest).at(-1)!;
assert(((phraseEnd.midi % 12) + 12) % 12 === 0, 'fin de phrase RH résout sur la tonique (Do)');

const m1Lh = gs.measures[0].notes.filter((n) => n.staff === 1 && !n.rest);
assert(m1Lh.every((n) => [0, 4, 7].includes(((n.midi % 12) + 12) % 12)), 'mesure 1 LH: notes de l accord I (do-mi-sol)');

const genFlat = new Generator({ rh: { enabled: true, notes: [65, 67, 69, 70, 72], level: 2 }, lh: { enabled: true, notes: [53, 57, 60], level: 1 }, time: [4, 4], bpm: 80, seed: 7 });
assert(genFlat.keyName === 'Fa majeur', `armure Fa majeur (reçu: ${genFlat.keyName})`);
assert(genFlat.keyFifths === -1, 'Fa majeur = 1 bémol');

gen.ensure(200);
assert(gs.measures.length >= 50, 'ensure étend le matériau au fil de la lecture');
const lastM = gs.measures[gs.measures.length - 1];
assert(lastM.startBeat + lastM.length >= 200, 'matériau généré au-delà de 200 temps');

const genChordal = makeGeneratorScore({
  rh: { enabled: true, notes: [60, 62, 64, 65, 67], level: 2, long: 0, chords: 3 },
  lh: { enabled: true, notes: [48, 52, 55], level: 1, long: 2, chords: 3 },
  time: [4, 4],
  bpm: 80,
  seed: 11
});
const gc = genChordal.score;
assert(gc.measures.some((m) => m.notes.some((n) => n.chord)), 'accords générés (notes marquées chord)');
for (const m of gc.measures) {
  for (const n of m.notes.filter((x) => x.chord)) {
    const prim = m.notes.find((p) => p.beat === n.beat && p.staff === n.staff && !p.chord);
    assert(!!prim && prim.dur === n.dur, 'membre d accord aligné sur sa note principale');
    assert([0, 4, 7, 2, 5, 9, 11, 2].includes(((n.midi % 12) + 12) % 12), 'membre d accord diatonique');
  }
  const sumPrim = m.notes.filter((n) => n.staff === 0 && !n.chord).reduce((a, n) => a + n.dur, 0);
  assert(Math.abs(sumPrim - 4) < 1e-6, `mesure ${m.number}: RH (hors accords) remplit 4 temps`);
}
const gcM1 = gc.measures[0];
const m1LhBlock = gcM1.notes.filter((n) => n.staff === 1 && !n.rest && n.beat === gcM1.startBeat);
assert(m1LhBlock.length >= 3, 'LH joue un bloc d accord en début de mesure');
assert(m1LhBlock.every((n) => n.dur === m1LhBlock[0].dur), 'bloc d accord homogène');
assert(m1LhBlock.every((n) => [0, 4, 7].includes(((n.midi % 12) + 12) % 12)), 'bloc d accord = triade de Do');

const genLong = makeGeneratorScore({
  rh: { enabled: true, notes: [60, 62, 64, 65, 67], level: 1, long: 4, chords: 0 },
  lh: { enabled: false, notes: [], level: 1, long: 0 },
  time: [4, 4],
  bpm: 80,
  seed: 5
});
const gl = genLong.score;
genLong.ensure(64);
assert(gl.measures.length >= 16, 'genLong: 16+ mesures');
const longs = gl.measures.flatMap((m) => m.notes).filter((n) => n.staff === 0 && !n.rest && n.dur >= 2);
assert(longs.length > 0, 'notes longues (blanches/roundes) générées');
assert(
  longs.every((n) => n.base === n.dur && (n.dur === 2 || n.dur === 4)),
  'notes longues = blanches (2) ou rondes (4)'
);

console.log('\nTous les tests passent.');