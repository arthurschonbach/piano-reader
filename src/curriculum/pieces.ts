import { makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from '../core/model';

/**
 * Real pieces (public domain melodies, simple left hand written for this app).
 * Notation per hand: bars split by "|", notes like "E4q@3":
 * pitch + octave, length (w=4 h=2 q=1 e=½ dq=1½ dh=3), optional @finger. Rests: "rq", "rh", "rw".
 */
export interface Piece {
  id: string;
  title: string;
  origin: string;
  /** 1 = easiest. */
  level: number;
  bpm: number;
  keyFifths: number;
  setup: string;
  tips: string[];
  rh: string;
  lh: string;
}

export const PIECES: Piece[] = [
  {
    id: 'agneau',
    title: 'Marie avait un petit agneau',
    origin: 'Comptine traditionnelle',
    level: 1,
    bpm: 60,
    keyFifths: 0,
    setup: 'Position de C aux deux mains : pouce droit sur le C central (C4), auriculaire gauche sur le C3, une octave plus bas.',
    tips: ['La mélodie descend puis remonte par notes voisines : lis le mouvement, pas chaque note.', 'Main gauche : de longues notes, juste C et G.'],
    rh: 'E4q@3 D4q C4q D4q | E4q E4q E4h | D4q D4q D4h | E4q G4q G4h | E4q D4q C4q D4q | E4q E4q E4q E4q | D4q D4q E4q D4q | C4w',
    lh: 'C3w@5 | C3h G3h@1 | G3w | C3h E3h@3 | C3w | C3h G3h | G3w | C3w'
  },
  {
    id: 'clair-de-lune',
    title: 'Au clair de la lune',
    origin: 'Chanson traditionnelle française',
    level: 1,
    bpm: 60,
    keyFifths: 0,
    setup: 'Position de C aux deux mains.',
    tips: ['Les 4 dernières mesures répètent les 4 premières : une fois la première ligne lue, tu connais tout.', 'Tiens bien les blanches jusqu’au bout : 2 temps chacune.'],
    rh: 'C4q@1 C4q C4q D4q | E4h D4h | C4q E4q D4q D4q | C4w | C4q C4q C4q D4q | E4h D4h | C4q E4q D4q D4q | C4w',
    lh: 'C3w@5 | C3h G3h@1 | E3h@3 G3h | C3w | C3w | C3h G3h | E3h G3h | C3w'
  },
  {
    id: 'hymne-joie',
    title: 'Hymne à la joie',
    origin: 'L. van Beethoven, 9e symphonie (thème simplifié)',
    level: 2,
    bpm: 66,
    keyFifths: 0,
    setup: 'Position de C aux deux mains. Majeur droit (3) sur le E pour commencer.',
    tips: [
      'Mesures 4 et 8 : une noire pointée (1 temps et demi) suivie d’une croche. Compte « 1 - et - 2 » : la croche tombe sur le « et ».',
      'Les mesures 5 à 7 répètent les mesures 1 à 3.'
    ],
    rh: 'E4q@3 E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | E4dq D4e D4h | E4q E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | D4dq C4e C4h',
    lh: 'C3w@5 | G3w@1 | E3w@3 | G3w | C3w | G3w | E3w | G3h C3h'
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (refrain)',
    origin: 'J. Pierpont, 1857',
    level: 3,
    bpm: 72,
    keyFifths: 0,
    setup: 'Position de C aux deux mains. Majeur droit (3) sur le E.',
    tips: [
      'Mesure 3 : E, G puis C : la main ne bouge pas, seuls les doigts changent (3, 5, 1).',
      'Les mesures 9 à 12 reprennent le début : seule la fin change.',
      'Mesure 6 : deux croches à la fin, « 4 et ».'
    ],
    rh:
      'E4q@3 E4q E4h | E4q E4q E4h | E4q G4q@5 C4dq@1 D4e | E4w | F4q F4q F4dq F4e | F4q E4q E4q E4e E4e | E4q D4q D4q E4q | D4h G4h | ' +
      'E4q E4q E4h | E4q E4q E4h | E4q G4q C4dq D4e | E4w | F4q F4q F4dq F4e | F4q E4q E4q E4e E4e | G4q G4q F4q D4q | C4w',
    lh:
      'C3w@5 | C3w | C3w | C3w | F3w@2 | C3w | G3w@1 | G3w | ' +
      'C3w | C3w | C3w | C3w | F3w | C3w | G3w | C3w'
  }
];

const LEN: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, dq: 1.5, dh: 3 };
const STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const SEMI = [0, 2, 4, 5, 7, 9, 11];

interface Tok {
  midi: number | null;
  step: number;
  alter: number;
  octave: number;
  dur: number;
  finger?: number;
}

function parseTok(t: string): Tok {
  const rest = /^r(w|h|q|e|dq|dh)$/.exec(t);
  if (rest) return { midi: null, step: 0, alter: 0, octave: 4, dur: LEN[rest[1]] };
  const m = /^([A-G])([#b]?)(\d)(dq|dh|w|h|q|e)(?:@([1-5]))?$/.exec(t);
  if (!m) throw new Error(`Bad note token: ${t}`);
  const step = STEP[m[1]];
  const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return { midi: (octave + 1) * 12 + SEMI[step] + alter, step, alter, octave, dur: LEN[m[4]], finger: m[5] ? Number(m[5]) : undefined };
}

export function parseHand(src: string): Tok[][] {
  return src.split('|').map((bar) => bar.trim().split(/\s+/).filter(Boolean).map(parseTok));
}

export type PieceHands = 'rh' | 'lh' | 'both';

/** Build a score for one hand or both. One hand alone gets its own single staff. */
export function pieceScore(p: Piece, hands: PieceHands): Score {
  const rh = parseHand(p.rh);
  const lh = parseHand(p.lh);
  const grand = hands === 'both';
  const measures: Measure[] = rh.map((_, i) => {
    const notes: NoteItem[] = [];
    const add = (bar: Tok[] | undefined, staff: number) => {
      let t = i * 4;
      for (const k of bar ?? []) {
        const spell = k.midi === null ? spellOfMidi(60) : { step: k.step, alter: k.alter, octave: k.octave };
        const base = k.dur === 1.5 ? 1 : k.dur === 3 ? 2 : k.dur;
        const dots = k.dur === 1.5 || k.dur === 3 ? 1 : 0;
        notes.push(
          makeNote({
            beat: t, dur: k.dur, base, dots, staff, rest: k.midi === null,
            midi: k.midi ?? 60, spell: k.midi === null ? spell : spell, finger: k.finger
          })
        );
        t += k.dur;
      }
    };
    if (hands !== 'lh') add(rh[i], 0);
    if (hands !== 'rh') add(lh[i], grand ? 1 : 0);
    return { number: i + 1, startBeat: i * 4, length: 4, key: p.keyFifths, keyChange: i === 0, time: i === 0 ? [4, 4] : null, notes };
  });
  return {
    title: p.title,
    bpm: p.bpm,
    measures,
    infinite: false,
    staves: grand ? 2 : 1,
    clefs: grand ? ['G', 'F'] : [hands === 'lh' ? 'F' : 'G']
  };
}

export function pieceById(id: string): Piece | undefined {
  return PIECES.find((p) => p.id === id);
}

/** The learning steps of a piece, from hands apart to full tempo. */
export interface PieceStage {
  id: string;
  label: string;
  hands: PieceHands;
  mode: 'wait' | 'rhythm';
  /** Fraction of the piece tempo (rhythm stages). */
  tempo?: number;
}

export const PIECE_STAGES: PieceStage[] = [
  { id: 'md', label: 'Main droite seule', hands: 'rh', mode: 'wait' },
  { id: 'mg', label: 'Main gauche seule', hands: 'lh', mode: 'wait' },
  { id: 'ensemble', label: 'Mains ensemble, sans tempo', hands: 'both', mode: 'wait' },
  { id: 'lent', label: 'Mains ensemble, tempo lent', hands: 'both', mode: 'rhythm', tempo: 0.75 },
  { id: 'tempo', label: 'Mains ensemble, au tempo', hands: 'both', mode: 'rhythm', tempo: 1 }
];
