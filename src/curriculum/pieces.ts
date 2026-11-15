import { makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from '../core/model';

/**
 * Real pieces: public-domain melodies, with a simple left hand written for this
 * app. Notation per hand: bars split by "|", notes like "E4q@3" = pitch + octave,
 * length (w=4 h=2 q=1 e=½ dq=1½ dh=3, in quarter-note beats), optional @finger.
 * Rests: "rq", "rh", "rw", "re", "rdh". Sharps/flats: "F#4q", "Bb2h".
 */
export interface Piece {
  id: string;
  title: string;
  origin: string;
  /** 1 = easiest … 5. */
  level: number;
  bpm: number;
  keyFifths: number;
  /** Time signature, default 4/4 (beats counted in quarter notes). */
  time?: [number, number];
  /** Pickup (anacrusis) length in beats: the first bar is incomplete. */
  pickup?: number;
  setup: string;
  tips: string[];
  rh: string;
  lh: string;
}

const C_BOTH = 'Position de C aux deux mains : pouce droit sur le C central (C4), auriculaire gauche sur le C3, une octave plus bas.';

export const PIECES: Piece[] = [
  // ---------------------------------------------------------------- level 1
  {
    id: 'hot-cross-buns',
    title: 'Hot Cross Buns',
    origin: 'Comptine anglaise traditionnelle',
    level: 1,
    bpm: 60,
    keyFifths: 0,
    setup: C_BOTH,
    tips: ['Trois notes seulement à la main droite : E, D, C.', 'Mesures 3 et 7 : huit croches (eighth notes), deux par temps. Compte « 1 et 2 et 3 et 4 et ».'],
    rh: 'E4q@3 D4q@2 C4h@1 | E4q D4q C4h | C4e C4e C4e C4e D4e D4e D4e D4e | E4q D4q C4h | E4q D4q C4h | E4q D4q C4h | C4e C4e C4e C4e D4e D4e D4e D4e | E4q D4q C4h',
    lh: 'C3w@5 | C3w | C3h G3h@1 | C3w | C3w | C3w | C3h G3h | C3w'
  },
  {
    id: 'agneau',
    title: 'Marie avait un petit agneau',
    origin: 'Comptine traditionnelle (Mary Had a Little Lamb)',
    level: 1,
    bpm: 60,
    keyFifths: 0,
    setup: C_BOTH,
    tips: ['La mélodie descend puis remonte par notes voisines : lis le mouvement, pas chaque note.', 'Main gauche : de longues notes, juste C, E et G.'],
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
    setup: C_BOTH,
    tips: ['Les 4 dernières mesures répètent les 4 premières : une fois la première ligne lue, tu connais tout.', 'Tiens bien les blanches (half notes) jusqu’au bout : 2 temps chacune.'],
    rh: 'C4q@1 C4q C4q D4q | E4h D4h | C4q E4q D4q D4q | C4w | C4q C4q C4q D4q | E4h D4h | C4q E4q D4q D4q | C4w',
    lh: 'C3w@5 | C3h G3h@1 | E3h@3 G3h | C3w | C3w | C3h G3h | E3h G3h | C3w'
  },
  {
    id: 'petit-bateau',
    title: 'Petit Jean (Lightly Row)',
    origin: 'Chanson populaire allemande (Hänschen klein)',
    level: 1,
    bpm: 66,
    keyFifths: 0,
    setup: `${C_BOTH} Auriculaire droit (5) sur le G pour la première note.`,
    tips: ['16 mesures, mais les lignes 1, 2 et 4 se ressemblent beaucoup.', 'Ligne 3 : des notes répétées, garde le même doigt et relâche bien la touche entre deux notes.'],
    rh:
      'G4q@5 E4q@3 E4h | F4q@4 D4q@2 D4h | C4q@1 D4q E4q F4q | G4q G4q G4h | G4q E4q E4h | F4q D4q D4h | C4q E4q G4q G4q | C4w | ' +
      'D4q D4q D4q D4q | D4q E4q F4h | E4q E4q E4q E4q | E4q F4q G4h | G4q E4q E4h | F4q D4q D4h | C4q E4q G4q G4q | C4w',
    lh: 'C3w@5 | G3w@1 | C3w | G3w | C3w | G3w | C3h G3h | C3w | G3w | G3w | C3w | C3w | C3w | G3w | C3h G3h | C3w'
  },
  // ---------------------------------------------------------------- level 2
  {
    id: 'nouveau-monde',
    title: 'Symphonie du Nouveau Monde (Largo)',
    origin: 'A. Dvořák, 1893 (thème simplifié, « Goin’ Home »)',
    level: 2,
    bpm: 56,
    keyFifths: 0,
    setup: `${C_BOTH} Majeur droit (3) sur le E.`,
    tips: ['Un thème lent et chantant : noire pointée (dotted quarter) puis croche, comme « taaa-ta ».', 'Laisse sonner les rondes (whole notes) jusqu’à la mesure suivante.'],
    rh: 'E4dq@3 G4e@5 G4h | E4dq D4e C4h@1 | D4q E4q G4q E4q | D4w | E4dq G4e G4h | E4dq D4e C4h | D4q E4q D4q C4q | C4w',
    lh: 'C3w@5 | C3w | G3w@1 | G3w | C3w | C3w | G3h C3h | C3w'
  },
  {
    id: 'hymne-joie',
    title: 'Hymne à la joie',
    origin: 'L. van Beethoven, 9e symphonie (thème, 1re partie)',
    level: 2,
    bpm: 66,
    keyFifths: 0,
    setup: `${C_BOTH} Majeur droit (3) sur le E pour commencer.`,
    tips: [
      'Mesures 4 et 8 : une noire pointée (dotted quarter, 1 temps et demi) puis une croche. Compte « 1 - et - 2 » : la croche tombe sur le « et ».',
      'Les mesures 5 à 7 répètent les mesures 1 à 3.'
    ],
    rh: 'E4q@3 E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | E4dq D4e D4h | E4q E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | D4dq C4e C4h',
    lh: 'C3w@5 | G3w@1 | E3w@3 | G3w | C3w | G3w | E3w | G3h C3h'
  },
  {
    id: 'ah-vous-dirai-je',
    title: 'Ah ! vous dirai-je, maman (Twinkle Twinkle)',
    origin: 'Air traditionnel français, varié par Mozart',
    level: 2,
    bpm: 72,
    keyFifths: 0,
    setup: `${C_BOTH} La main droite s’ouvre : pouce sur C, 4e doigt sur G, 5e sur A.`,
    tips: ['Mesure 3 : la main revient en position de C (4e doigt sur F).', 'Les mesures 9 à 12 reprennent le début.'],
    rh:
      'C4q@1 C4q G4q@4 G4q | A4q@5 A4q G4h@4 | F4q@4 F4q E4q E4q | D4q D4q C4h | G4q@5 G4q F4q F4q | E4q E4q D4h | ' +
      'G4q G4q F4q F4q | E4q E4q D4h | C4q@1 C4q G4q@4 G4q | A4q@5 A4q G4h | F4q@4 F4q E4q E4q | D4q D4q C4h',
    lh: 'C3w@5 | F3h@2 C3h | F3h C3h | G3h@1 C3h | C3h F3h | C3h G3h | C3h F3h | C3h G3h | C3w | F3h C3h | F3h C3h | G3h C3h'
  },
  {
    id: 'frere-jacques',
    title: 'Frère Jacques',
    origin: 'Chanson traditionnelle française',
    level: 2,
    bpm: 72,
    keyFifths: 0,
    setup: `${C_BOTH}`,
    tips: [
      'Mesures 5 et 6 : quatre croches puis deux noires. La main s’étend pour le A (5e doigt).',
      'Mesures 7 et 8 : la main droite descend au G sous le C central, puis remonte.',
      'Chaque idée est répétée deux fois : lis la première, joue la seconde de mémoire.'
    ],
    rh: 'C4q@1 D4q E4q C4q | C4q D4q E4q C4q | E4q@3 F4q G4h | E4q F4q G4h | G4e@4 A4e@5 G4e F4e E4q C4q@1 | G4e@4 A4e G4e F4e E4q C4q | C4q@4 G3q@1 C4h@4 | C4q G3q C4h',
    lh: 'C3w@5 | C3w | C3h E3h@3 | C3h E3h | C3h G3h@1 | C3h G3h | C3w | C3w'
  },
  {
    id: 'london-bridge',
    title: 'London Bridge',
    origin: 'Comptine anglaise traditionnelle',
    level: 2,
    bpm: 72,
    keyFifths: 0,
    setup: `${C_BOTH} Main droite : 4e doigt sur G, 5e sur A.`,
    tips: ['Ça commence par une noire pointée et une croche (« taa-ta »).', 'Mesure 7 : un saut de D à G, la main reste en place.'],
    rh: 'G4dq@4 A4e@5 G4q F4q@3 | E4q@2 F4q G4h | D4q@1 E4q F4h | E4q F4q G4h | G4dq A4e G4q F4q | E4q F4q G4h | D4h@1 G4h@4 | E4q@3 C4dh@1',
    lh: 'C3w@5 | C3w | G3w@1 | C3w | C3w | C3w | G3w | C3w'
  },
  {
    id: 'old-macdonald',
    title: 'Old MacDonald',
    origin: 'Chanson populaire américaine',
    level: 2,
    bpm: 80,
    keyFifths: -1,
    setup: 'Main droite : pouce sur C4, 2 sur D, 3 sur F, 4 sur G, 5 sur A (la main saute le E). Main gauche : 2e doigt sur F3, auriculaire sur C3.',
    tips: ['En F majeur (F major), l’armure a un B♭… mais ce morceau ne contient aucun B : bonne occasion de regarder l’armure sans piège.', 'Mesure 4 : une blanche pointée (dotted half, 3 temps) puis une noire.'],
    rh: 'F4q@3 F4q F4q C4q@1 | D4q@2 D4q C4h | A4q@5 A4q G4q@4 G4q | F4dh@3 C4q@1 | F4q F4q F4q C4q | D4q D4q C4h | A4q A4q G4q G4q | F4w',
    lh: 'F3w@2 | F3w | F3h C3h@5 | F3w | F3w | F3w | F3h C3h | F3w'
  },
  // ---------------------------------------------------------------- level 3
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (refrain)',
    origin: 'J. Pierpont, 1857',
    level: 3,
    bpm: 72,
    keyFifths: 0,
    setup: `${C_BOTH} Majeur droit (3) sur le E.`,
    tips: [
      'Mesure 3 : E, G puis C : la main ne bouge pas, seuls les doigts changent (3, 5, 1).',
      'Les mesures 9 à 12 reprennent le début : seule la fin change.',
      'Mesure 6 : deux croches à la fin, « 4 et ».'
    ],
    rh:
      'E4q@3 E4q E4h | E4q E4q E4h | E4q G4q@5 C4dq@1 D4e | E4w | F4q F4q F4dq F4e | F4q E4q E4q E4e E4e | E4q D4q D4q E4q | D4h G4h | ' +
      'E4q E4q E4h | E4q E4q E4h | E4q G4q C4dq D4e | E4w | F4q F4q F4dq F4e | F4q E4q E4q E4e E4e | G4q G4q F4q D4q | C4w',
    lh: 'C3w@5 | C3w | C3w | C3w | F3w@2 | C3w | G3w@1 | G3w | C3w | C3w | C3w | C3w | F3w | C3w | G3w | C3w'
  },
  {
    id: 'joyeux-anniversaire',
    title: 'Joyeux anniversaire (Happy Birthday)',
    origin: 'M. et P. Hill, 1893 (domaine public)',
    level: 3,
    bpm: 90,
    keyFifths: -1,
    time: [3, 4],
    pickup: 1,
    setup: 'Main droite : pouce sur C4. Main gauche : 2e doigt sur F3.',
    tips: [
      'Mesure à 3 temps (3/4, three-four time) : compte « 1, 2, 3 ».',
      'Ça commence par une levée (pickup) : deux croches avant la première barre de mesure.',
      'Ligne 3 : la main droite monte jusqu’au C5, puis l’armure t’impose un B♭ (B flat).'
    ],
    rh: 'C4e@1 C4e | D4q@2 C4q F4q@4 | E4h@3 C4e@1 C4e | D4q C4q G4q@5 | F4h@4 C4e@1 C4e | C5q@5 A4q@3 F4q@1 | E4q D4q Bb4e@4 Bb4e | A4q@3 F4q@1 G4q@2 | F4dh@1',
    lh: 'rq | F3dh@2 | C3dh@5 | C3dh | F3dh@2 | F3dh | Bb2dh | C3dh | F3dh'
  },
  {
    id: 'canon-pachelbel',
    title: 'Canon de Pachelbel (thème)',
    origin: 'J. Pachelbel, vers 1680 (version simplifiée)',
    level: 3,
    bpm: 60,
    keyFifths: 2,
    setup: 'Ré majeur (D major), deux dièses : F♯ et C♯. Main droite autour du D5, main gauche dans le grave (D2 à D3).',
    tips: [
      'La basse (bass line) descend : D, A, B, F♯, G, D, G, A. C’est la même 8 notes en boucle tout le morceau.',
      'Armure à deux dièses : tous les F et tous les C sont dièses.',
      'La main gauche fait de grands écarts : regarde le clavier entre deux notes si besoin.'
    ],
    rh: 'F#5h@5 E5h@4 | D5h@3 C#5h@2 | B4h@2 A4h@1 | B4h@2 C#5h@3 | F#5h@5 E5h@4 | D5h@3 C#5h@2 | B4h@2 A4h@1 | B4h@2 C#5h@3 | D5w@4',
    lh: 'D3h@1 A2h@4 | B2h@3 F#2h@5 | G2h@4 D2h@5 | G2h@3 A2h@2 | D3h@1 A2h@4 | B2h@3 F#2h@5 | G2h@4 D2h@5 | G2h@3 A2h@2 | D3w@1'
  },
  // ---------------------------------------------------------------- level 4
  {
    id: 'hymne-joie-complet',
    title: 'Hymne à la joie (complet)',
    origin: 'L. van Beethoven, 9e symphonie',
    level: 4,
    bpm: 80,
    keyFifths: 0,
    setup: `${C_BOTH} Mesure 12 : la main droite descend au G3 sous le C central.`,
    tips: [
      'Partie du milieu (mesures 9 à 12) : des croches et un saut vers le grave.',
      'La main gauche bouge plus que dans la version simple : une blanche par demi-mesure.',
      'Les 4 dernières mesures sont exactement la fin de la première partie.'
    ],
    rh:
      'E4q@3 E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | E4dq D4e D4h | E4q E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | D4dq C4e C4h | ' +
      'D4q@2 D4q E4q C4q@1 | D4q E4e F4e E4q C4q | D4q E4e F4e E4q D4q | C4q D4q G3h@1 | E4q@3 E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | D4dq C4e C4h',
    lh:
      'C3h@5 E3h@3 | G3h@1 G3h | E3h C3h | G3h G3h | C3h E3h | G3h G3h | E3h C3h | G3h C3h | ' +
      'G3h C3h | G3h C3h | G3h C3h | E3h G3h | C3h E3h | G3h G3h | E3h C3h | G3h C3h'
  },
  // ---------------------------------------------------------------- level 5
  {
    id: 'menuet-sol',
    title: 'Menuet en sol (Minuet in G)',
    origin: 'C. Petzold, vers 1725 (longtemps attribué à J.-S. Bach) · main gauche simplifiée',
    level: 5,
    bpm: 84,
    keyFifths: 1,
    time: [3, 4],
    setup: 'Sol majeur (G major) : un dièse, F♯. Main droite : 5e doigt sur D5 pour commencer, pouce sur G4.',
    tips: [
      'Mesure à 3 temps (3/4) : un menuet est une danse, appuie un peu le premier temps.',
      'Des croches (eighth notes) presque partout : travaille d’abord mains séparées, très lentement.',
      'Mesure 3 : la main se déplace (3e doigt sur E5, puis pouce sur C5).',
      'Mesures 9 à 16 : comme 1 à 8, avec une fin différente.'
    ],
    rh:
      'D5q@5 G4e@1 A4e B4e C5e | D5q G4q G4q | E5q@3 C5e@1 D5e E5e F#5e | G5q@5 G4q G4q | C5q@4 D5e C5e B4e A4e | B4q@3 C5e B4e A4e G4e | F#4q@1 G4e A4e B4e G4e | A4dh | ' +
      'D5q@5 G4e@1 A4e B4e C5e | D5q G4q G4q | E5q@3 C5e@1 D5e E5e F#5e | G5q@5 G4q G4q | C5q@4 D5e C5e B4e A4e | B4q@3 C5e B4e A4e G4e | A4q B4e A4e G4e F#4e | G4dh',
    lh: 'G3dh@2 | B3dh | C4dh | B3dh | A3dh | G3dh | D3dh@5 | D3dh | G3dh@2 | B3dh | C4dh | B3dh | A3dh | G3dh | D3dh@5 | G2dh'
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
  const rest = /^r(dq|dh|w|h|q|e)$/.exec(t);
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

export const beatsPerBar = (p: Piece): number => (p.time ?? [4, 4])[0];

export type PieceHands = 'rh' | 'lh' | 'both';

/** Build a score for one hand or both. One hand alone gets its own single staff. */
export function pieceScore(p: Piece, hands: PieceHands): Score {
  const rh = parseHand(p.rh);
  const lh = parseHand(p.lh);
  const grand = hands === 'both';
  const time = p.time ?? [4, 4];
  let start = 0;
  const measures: Measure[] = rh.map((_, i) => {
    const notes: NoteItem[] = [];
    const length = Math.max(...[rh[i], lh[i]].map((bar) => (bar ?? []).reduce((a, t) => a + t.dur, 0)));
    const add = (bar: Tok[] | undefined, staff: number) => {
      let t = start;
      for (const k of bar ?? []) {
        const spell = k.midi === null ? spellOfMidi(60) : { step: k.step, alter: k.alter, octave: k.octave };
        const base = k.dur === 1.5 ? 1 : k.dur === 3 ? 2 : k.dur;
        const dots = k.dur === 1.5 || k.dur === 3 ? 1 : 0;
        notes.push(makeNote({ beat: t, dur: k.dur, base, dots, staff, rest: k.midi === null, midi: k.midi ?? 60, spell, finger: k.finger }));
        t += k.dur;
      }
    };
    if (hands !== 'lh') add(rh[i], 0);
    if (hands !== 'rh') add(lh[i], grand ? 1 : 0);
    const m: Measure = { number: i + 1, startBeat: start, length, key: p.keyFifths, keyChange: i === 0, time: i === 0 ? time : null, notes };
    start += length;
    return m;
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

/** What makes a piece harder, as short labels for the library. */
export function pieceTags(p: Piece): string[] {
  const toks = [...parseHand(p.rh), ...parseHand(p.lh)].flat();
  const tags: string[] = [];
  if (p.keyFifths > 0) tags.push(`${p.keyFifths} dièse${p.keyFifths > 1 ? 's' : ''}`);
  if (p.keyFifths < 0) tags.push(`${-p.keyFifths} bémol${p.keyFifths < -1 ? 's' : ''}`);
  if (p.time && p.time[0] !== 4) tags.push(`${p.time[0]}/${p.time[1]}`);
  if (p.pickup) tags.push('levée');
  if (toks.some((t) => t.dur === 0.5)) tags.push('croches');
  if (toks.some((t) => t.dur === 1.5 || t.dur === 3)) tags.push('notes pointées');
  const rhMidis = parseHand(p.rh).flat().map((t) => t.midi).filter((m): m is number => m !== null);
  const span = Math.max(...rhMidis) - Math.min(...rhMidis);
  if (span > 9) tags.push('la main se déplace');
  return tags;
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
