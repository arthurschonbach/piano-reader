/**
 * Technique drills: scales, arpeggios and cadences, written out with their
 * fingering. Each one has its own tempo, which goes up a little after every
 * clean run. The MIDI piano tells whether the notes are even, whether the
 * thumb crossings bump, and whether chord notes land together.
 */
import { makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from '../core/model';
import type { Target } from '../exercise/rhythm';

type Hand = 'rh' | 'lh';
/** One event of a line: notes struck together (low to high), their fingers, length in beats. */
interface Ev {
  midis: number[];
  fingers: number[];
  dur: number;
}

export interface Drill {
  id: string;
  group: 'Gammes' | 'Arpèges' | 'Accords';
  title: string;
  desc: string;
  setup: string;
  tips: string[];
  keyFifths: number;
  rh?: Ev[];
  lh?: Ev[];
  startBpm: number;
  goalBpm: number;
  /** Shown in the daily session once this lesson is done (or acquired). */
  after?: string;
  /** Judged on chord attacks rather than legato. */
  chords?: boolean;
}

/** Notes in eighths, the last one held to the end of its bar. */
function line(notes: number[], fingers: number[]): Ev[] {
  const out: Ev[] = notes.map((m, i) => ({ midis: [m], fingers: [fingers[i]], dur: 0.5 }));
  const used = (notes.length - 1) * 0.5;
  const left = 4 - (used % 4);
  out[out.length - 1].dur = left < 1 ? left + 4 : left;
  return out;
}

/** Up and back down: `up` lists the notes from bottom to top. */
function upDown(up: number[], fUp: number[], fDown: number[]): Ev[] {
  const down = up.slice(0, -1).reverse();
  return line([...up, ...down], [...fUp, ...fDown]);
}

/** Down and back up (left hand in contrary motion). */
function downUp(down: number[], fDown: number[], fUp: number[]): Ev[] {
  const up = down.slice(0, -1).reverse();
  return line([...down, ...up], [...fDown, ...fUp]);
}

/** Major scale degrees in semitones from the tonic, over one or two octaves. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11, 12];
const scaleNotes = (tonic: number, steps: number[], octaves = 1) => {
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) out.push(...steps.slice(0, -1).map((s) => tonic + 12 * o + s));
  out.push(tonic + 12 * octaves);
  return out;
};

// Standard fingerings. RH up / down and LH up / down, one octave.
const RH_C = { up: [1, 2, 3, 1, 2, 3, 4, 5], down: [4, 3, 2, 1, 3, 2, 1] };
const LH_C = { up: [5, 4, 3, 2, 1, 3, 2, 1], down: [2, 3, 1, 2, 3, 4, 5] };
const RH_F = { up: [1, 2, 3, 4, 1, 2, 3, 4], down: [3, 2, 1, 4, 3, 2, 1] };

/** Broken chord over an octave and back: 1-2-3-5 (RH) or 5-3-2-1 (LH), one bar. */
function broken(root: number, third: number, hand: Hand): Ev[] {
  const ns = [root, root + third, root + 7, root + 12, root + 7, root + third];
  const f = hand === 'rh' ? [1, 2, 3, 5, 3, 2] : [5, 3, 2, 1, 2, 3];
  return [...ns.map((m, i) => ({ midis: [m], fingers: [f[i]], dur: 0.5 })), { midis: [root], fingers: [hand === 'rh' ? 1 : 5], dur: 1 }];
}

/** I-IV, V7-I, twice, in half notes: the left-hand voicings of the lessons. */
function cadence(I: number[], IV: number[], V: number[]): Ev[] {
  const ch = (midis: number[], fingers: number[]): Ev => ({ midis, fingers, dur: 2 });
  const bars = [ch(I, [5, 3, 1]), ch(IV, [5, 2, 1]), ch(V, [5, 2, 1]), ch(I, [5, 3, 1])];
  return [...bars, ...bars];
}

const C4 = 60;
const C3 = 48;

export const DRILLS: Drill[] = [
  // ------------------------------------------------------------------ scales
  {
    id: 'gamme-do-md',
    group: 'Gammes',
    title: 'Gamme de C majeur · main droite',
    desc: 'Une octave, en croches, avec le passage du pouce.',
    setup: 'Pouce droit sur le C central.',
    tips: [
      'En montant, le pouce passe sous le majeur (3) pour jouer le F. En descendant, le majeur passe par-dessus le pouce pour jouer le E.',
      'Prépare le passage : le pouce glisse sous la main pendant que tu joues le D et le E, il est déjà au-dessus du F quand il faut le jouer.',
      'Le coude et le poignet suivent la main latéralement, sans à-coups. Le passage du pouce ne doit pas s’entendre.'
    ],
    keyFifths: 0,
    rh: upDown(scaleNotes(C4, MAJOR), RH_C.up, RH_C.down),
    startBpm: 50,
    goalBpm: 100
  },
  {
    id: 'gamme-do-mg',
    group: 'Gammes',
    title: 'Gamme de C majeur · main gauche',
    desc: 'Une octave, en croches. Le passage du pouce se fait à l’envers.',
    setup: 'Auriculaire gauche sur le C3, une octave sous le C central.',
    tips: [
      'En montant, le majeur (3) passe par-dessus le pouce pour jouer le A. En descendant, le pouce passe sous le majeur pour jouer le G.',
      'La main gauche est souvent moins régulière : écoute surtout le 4e et le 5e doigt, qui ont tendance à jouer plus faiblement.'
    ],
    keyFifths: 0,
    lh: upDown(scaleNotes(C3, MAJOR), LH_C.up, LH_C.down),
    startBpm: 50,
    goalBpm: 100
  },
  {
    id: 'gamme-do-contraire',
    group: 'Gammes',
    title: 'Gamme de C · mouvement contraire',
    desc: 'Les deux mains partent des pouces et s’écartent : mêmes doigts aux deux mains.',
    setup: 'Pouce droit sur le C central, pouce gauche sur le C3 juste en dessous (une octave d’écart).',
    tips: [
      'En mouvement contraire, les deux mains utilisent les mêmes doigts au même moment : les deux pouces passent ensemble.',
      'C’est la meilleure entrée dans les gammes mains ensemble : la symétrie aide le cerveau.'
    ],
    keyFifths: 0,
    rh: upDown(scaleNotes(C4, MAJOR), RH_C.up, RH_C.down),
    lh: downUp(scaleNotes(36, MAJOR).reverse(), RH_C.up, RH_C.down),
    startBpm: 50,
    goalBpm: 92,
    after: 'mouvement-contraire'
  },
  {
    id: 'gamme-sol-md',
    group: 'Gammes',
    title: 'Gamme de G majeur · main droite',
    desc: 'Même doigté que C, avec le F♯ joué par le 4e doigt.',
    setup: 'Pouce droit sur le G au-dessus du C central (G4).',
    tips: ['Le 4e doigt tombe sur le F♯ : la main avance un peu vers le fond des touches pour l’atteindre sans se tordre.'],
    keyFifths: 1,
    rh: upDown(scaleNotes(67, MAJOR), RH_C.up, RH_C.down),
    startBpm: 50,
    goalBpm: 100,
    after: 'sol-majeur'
  },
  {
    id: 'gamme-sol-mg',
    group: 'Gammes',
    title: 'Gamme de G majeur · main gauche',
    desc: 'Même doigté que C à gauche, F♯ joué par le 2e doigt.',
    setup: 'Auriculaire gauche sur le G2, sur la ligne du bas de la clé de fa.',
    tips: ['Le F♯ tombe sous l’index (2), juste après le passage du majeur par-dessus le pouce.'],
    keyFifths: 1,
    lh: upDown(scaleNotes(43, MAJOR), LH_C.up, LH_C.down),
    startBpm: 50,
    goalBpm: 100,
    after: 'sol-majeur'
  },
  {
    id: 'gamme-fa-md',
    group: 'Gammes',
    title: 'Gamme de F majeur · main droite',
    desc: 'Le doigté change : 1-2-3-4, puis le pouce passe sous le 4.',
    setup: 'Pouce droit sur le F au-dessus du C central (F4).',
    tips: [
      'F majeur ne se doigte pas comme C : le 4e doigt joue le B♭, puis le pouce passe dessous pour le C.',
      'En descendant, le 4 passe par-dessus le pouce, du C au B♭.'
    ],
    keyFifths: -1,
    rh: upDown(scaleNotes(65, MAJOR), RH_F.up, RH_F.down),
    startBpm: 50,
    goalBpm: 100,
    after: 'fa-majeur'
  },
  {
    id: 'gamme-fa-mg',
    group: 'Gammes',
    title: 'Gamme de F majeur · main gauche',
    desc: 'Même doigté que C à gauche, le B♭ sous le 4e doigt.',
    setup: 'Auriculaire gauche sur le F2.',
    tips: ['À gauche, F majeur garde le doigté de C : 5-4-3-2-1, puis le 3 passe par-dessus.'],
    keyFifths: -1,
    lh: upDown(scaleNotes(41, MAJOR), LH_C.up, LH_C.down),
    startBpm: 50,
    goalBpm: 100,
    after: 'fa-majeur'
  },
  {
    id: 'gamme-la-mineur-md',
    group: 'Gammes',
    title: 'Gamme de A mineur harmonique · main droite',
    desc: 'La gamme mineure la plus jouée, avec son G♯ et son saut d’un ton et demi.',
    setup: 'Pouce droit sur le A au-dessus du C central (A4).',
    tips: [
      'A mineur a la même armure que C (rien), mais la version harmonique monte le G en G♯. Le ♯ est écrit devant chaque G.',
      'Entre F et G♯, il y a un ton et demi : c’est ce saut qui donne sa couleur orientale à la gamme. Doigté identique à C.'
    ],
    keyFifths: 0,
    rh: upDown(scaleNotes(69, HARMONIC_MINOR), RH_C.up, RH_C.down),
    startBpm: 50,
    goalBpm: 100,
    after: 'fa-majeur'
  },
  {
    id: 'gamme-do-parallele',
    group: 'Gammes',
    title: 'Gamme de C · mains ensemble à l’octave',
    desc: 'Les deux mains montent et descendent ensemble. Les pouces ne passent pas au même moment.',
    setup: 'Main droite : pouce sur le C central. Main gauche : auriculaire sur le C3.',
    tips: [
      'La difficulté : à droite le pouce passe sur le F, à gauche le majeur passe sur le A. Travaille d’abord ces deux endroits seuls, lentement.',
      'Écoute si les deux mains sonnent vraiment ensemble : l’app mesure l’écart entre elles à chaque note.'
    ],
    keyFifths: 0,
    rh: upDown(scaleNotes(C4, MAJOR), RH_C.up, RH_C.down),
    lh: upDown(scaleNotes(C3, MAJOR), LH_C.up, LH_C.down),
    startBpm: 46,
    goalBpm: 92,
    after: 'independance-rythmique',
    chords: false
  },
  {
    id: 'gamme-do-2-octaves-md',
    group: 'Gammes',
    title: 'Gamme de C · deux octaves, main droite',
    desc: 'Deux passages du pouce en montant, deux en descendant.',
    setup: 'Pouce droit sur le C central.',
    tips: [
      'Doigté : 1-2-3, 1-2-3-4, 1-2-3, 1-2-3-4-5. Le pouce passe sous le 3, puis sous le 4.',
      'Le passage sous le 4 est le plus difficile : laisse le poignet avancer pour faire de la place au pouce.'
    ],
    keyFifths: 0,
    rh: upDown(scaleNotes(C4, MAJOR, 2), [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5], [4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]),
    startBpm: 46,
    goalBpm: 100,
    after: 'basse-alberti'
  },
  // ---------------------------------------------------------------- arpeggios
  {
    id: 'arpege-brise-md',
    group: 'Arpèges',
    title: 'Accords brisés I-IV-V · main droite',
    desc: 'C, F et G arpégés sur une octave, doigté 1-2-3-5.',
    setup: 'Pouce droit sur le C central. La main se déplace d’un bloc vers le F, puis le G.',
    tips: [
      'Garde la forme de la main d’un accord à l’autre : seul le bras se déplace.',
      'Le 5e doigt sur l’octave du haut doit sonner autant que le pouce : pas de note qui s’écrase.'
    ],
    keyFifths: 0,
    rh: [...broken(60, 4, 'rh'), ...broken(65, 4, 'rh'), ...broken(67, 4, 'rh'), ...broken(60, 4, 'rh')],
    startBpm: 50,
    goalBpm: 96,
    after: 'trois-accords'
  },
  {
    id: 'arpege-brise-mg',
    group: 'Arpèges',
    title: 'Accords brisés I-IV-V · main gauche',
    desc: 'C, F et G arpégés sur une octave, doigté 5-3-2-1.',
    setup: 'Auriculaire gauche sur le C3.',
    tips: ['La main gauche descend au F2 puis au G2 : déplace-la pendant la noire de fin de mesure, sans couper le son trop tôt.'],
    keyFifths: 0,
    lh: [...broken(48, 4, 'lh'), ...broken(41, 4, 'lh'), ...broken(43, 4, 'lh'), ...broken(48, 4, 'lh')],
    startBpm: 50,
    goalBpm: 96,
    after: 'trois-accords'
  },
  {
    id: 'arpege-do-2-octaves-md',
    group: 'Arpèges',
    title: 'Arpège de C · deux octaves, main droite',
    desc: 'Le vrai arpège : C-E-G sur deux octaves, avec passage du pouce.',
    setup: 'Pouce droit sur le C central.',
    tips: [
      'Doigté 1-2-3, 1-2-3-5. Le pouce passe sous le 3 pour attraper le C suivant, une quarte plus loin : bien plus loin qu’en gamme.',
      'Le coude s’écarte un peu du corps en montant pour que le pouce arrive à temps.'
    ],
    keyFifths: 0,
    rh: upDown([60, 64, 67, 72, 76, 79, 84], [1, 2, 3, 1, 2, 3, 5], [3, 2, 1, 3, 2, 1]),
    startBpm: 44,
    goalBpm: 88,
    after: 'basse-alberti'
  },
  {
    id: 'arpege-do-2-octaves-mg',
    group: 'Arpèges',
    title: 'Arpège de C · deux octaves, main gauche',
    desc: 'C-E-G sur deux octaves, doigté 5-4-2-1-4-2-1.',
    setup: 'Auriculaire gauche sur le C2, deux octaves sous le C central.',
    tips: ['À gauche, c’est le 4 qui passe par-dessus le pouce en montant, et le pouce qui passe dessous en descendant.'],
    keyFifths: 0,
    lh: upDown([36, 40, 43, 48, 52, 55, 60], [5, 4, 2, 1, 4, 2, 1], [2, 4, 1, 2, 4, 5]),
    startBpm: 44,
    goalBpm: 88,
    after: 'basse-alberti'
  },
  // ------------------------------------------------------------------ chords
  {
    id: 'cadence-do-mg',
    group: 'Accords',
    title: 'Cadence I-IV-V7-I en C · main gauche',
    desc: 'Les trois accords plaqués, les trois notes exactement ensemble.',
    setup: 'Main gauche : auriculaire sur le C3.',
    tips: [
      'L’app mesure l’écart entre la première et la dernière note de chaque accord. Vise moins de 30 ms : on n’entend alors qu’une seule attaque.',
      'Prépare la forme de l’accord suivant pendant que tu tiens le précédent, puis pose les trois doigts d’un seul geste du bras.'
    ],
    keyFifths: 0,
    lh: cadence([48, 52, 55], [48, 53, 57], [47, 53, 55]),
    startBpm: 60,
    goalBpm: 100,
    after: 'trois-accords',
    chords: true
  },
  {
    id: 'cadence-sol-mg',
    group: 'Accords',
    title: 'Cadence I-IV-V7-I en G · main gauche',
    desc: 'La même forme de main, transposée en G : I = G-B-D, IV = G-C-E, V7 = F♯-C-D.',
    setup: 'Main gauche : auriculaire sur le G2.',
    tips: ['Transposer, c’est garder les mêmes gestes à un autre endroit. Seul le F♯ du V7 tombe sur une touche noire.'],
    keyFifths: 1,
    lh: cadence([43, 47, 50], [43, 48, 52], [42, 48, 50]),
    startBpm: 60,
    goalBpm: 100,
    after: 'trois-accords',
    chords: true
  },
  {
    id: 'cadence-fa-mg',
    group: 'Accords',
    title: 'Cadence I-IV-V7-I en F · main gauche',
    desc: 'En F : I = F-A-C, IV = F-B♭-D, V7 = E-B♭-C.',
    setup: 'Main gauche : auriculaire sur le F2.',
    tips: ['Le B♭ apparaît dans IV et dans V7 : garde l’index au-dessus de la touche noire entre les deux accords.'],
    keyFifths: -1,
    lh: cadence([41, 45, 48], [41, 46, 50], [40, 46, 48]),
    startBpm: 60,
    goalBpm: 100,
    after: 'trois-accords',
    chords: true
  }
];

export function drillById(id: string): Drill | undefined {
  return DRILLS.find((d) => d.id === id);
}

export interface DrillScore {
  score: Score;
  /** Notes right after a thumb crossing (thumb under, or a finger over the thumb). */
  crossings: Set<NoteItem>;
}

export function drillScore(d: Drill): DrillScore {
  const grand = !!d.rh && !!d.lh;
  const preferFlat = d.keyFifths < 0;
  const notes: NoteItem[] = [];
  const crossings = new Set<NoteItem>();
  let end = 0;
  for (const hand of ['rh', 'lh'] as Hand[]) {
    const evs = d[hand];
    if (!evs) continue;
    let t = 0;
    let prev: { midi: number; finger: number } | null = null;
    for (const e of evs) {
      e.midis.forEach((m, k) => {
        const n = makeNote({ beat: t, dur: e.dur, staff: grand && hand === 'lh' ? 1 : 0, midi: m, spell: spellOfMidi(m, preferFlat), finger: e.fingers[k], chord: k > 0 });
        notes.push(n);
        if (e.midis.length === 1 && prev) {
          // The fingers normally follow the pitch: right hand up = higher finger, left hand the reverse.
          const dp = Math.sign(m - prev.midi);
          const df = Math.sign(e.fingers[0] - prev.finger);
          if (dp && df && (hand === 'rh' ? dp !== df : dp === df)) crossings.add(n);
        }
      });
      prev = e.midis.length === 1 ? { midi: e.midis[0], finger: e.fingers[0] } : null;
      t += e.dur;
    }
    end = Math.max(end, t);
  }
  const measures: Measure[] = [];
  for (let b = 0; b * 4 < end; b++) {
    measures.push({
      number: b + 1,
      startBeat: b * 4,
      length: 4,
      key: d.keyFifths,
      keyChange: b === 0,
      time: b === 0 ? [4, 4] : null,
      notes: notes.filter((n) => n.beat >= b * 4 && n.beat < b * 4 + 4)
    });
  }
  return {
    score: { title: d.title, bpm: d.startBpm, measures, infinite: false, staves: grand ? 2 : 1, clefs: grand ? ['G', 'F'] : [d.lh ? 'F' : 'G'] },
    crossings
  };
}

export interface DrillAnalysis {
  /** Spread of the timing (standard deviation around the player's own average), ms. */
  steadiness?: number;
  /** Crossing notes arrive this much later than the others (ms, + = late). */
  crossingLagMs?: number;
  /** Crossing notes are this much louder than the others (velocity). */
  crossingAccent?: number;
  /** Median gap between the first and last note of a chord or of two hands together, ms. */
  chordSpreadMs?: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function analyzeDrill(targets: Target[], crossings: Set<NoteItem>): DrillAnalysis {
  const out: DrillAnalysis = {};
  const hits = targets.filter((t) => t.dtMs !== undefined && (t.grade === 'perfect' || t.grade === 'good'));
  if (hits.length >= 6) {
    const m = mean(hits.map((t) => t.dtMs!));
    out.steadiness = Math.sqrt(mean(hits.map((t) => (t.dtMs! - m) ** 2)));
  }
  const cross = hits.filter((t) => crossings.has(t.note));
  const rest = hits.filter((t) => !crossings.has(t.note));
  if (cross.length >= 2 && rest.length >= 4) {
    out.crossingLagMs = mean(cross.map((t) => t.dtMs!)) - mean(rest.map((t) => t.dtMs!));
    const cv = cross.filter((t) => t.velocity).map((t) => t.velocity!);
    const rv = rest.filter((t) => t.velocity).map((t) => t.velocity!);
    if (cv.length >= 2 && rv.length >= 4) out.crossingAccent = mean(cv) - mean(rv);
  }
  const byBeat = new Map<number, number[]>();
  for (const t of hits) byBeat.set(t.beat, [...(byBeat.get(t.beat) ?? []), t.dtMs!]);
  const spreads = [...byBeat.values()].filter((ds) => ds.length >= 2).map((ds) => Math.max(...ds) - Math.min(...ds)).sort((a, b) => a - b);
  if (spreads.length >= 3) out.chordSpreadMs = spreads[spreads.length >> 1];
  return out;
}

/** A clean run: right notes, even, and (when measured) legato scales or chords struck together. */
export const DRILL_PASS = { accuracy: 0.95, steadinessMs: 45, legato: 0.75, chordSpreadMs: 35 };
/** Tempo step after a clean run. */
export const BPM_STEP = 4;

export function drillPasses(
  d: Drill,
  r: { accuracy: number; assisted: boolean; legato?: number },
  a: DrillAnalysis
): boolean {
  if (r.assisted || r.accuracy < DRILL_PASS.accuracy) return false;
  if (a.steadiness === undefined || a.steadiness > DRILL_PASS.steadinessMs) return false;
  if (!d.chords && r.legato !== undefined && r.legato < DRILL_PASS.legato) return false;
  if ((d.chords || (d.rh && d.lh)) && a.chordSpreadMs !== undefined && a.chordSpreadMs > DRILL_PASS.chordSpreadMs) return false;
  return true;
}
