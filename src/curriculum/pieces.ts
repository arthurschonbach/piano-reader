import { computeTies, makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from '../core/model';

/**
 * Real pieces: public-domain melodies, with a simple left hand written for this
 * app. Notation per hand: bars split by "|", notes like "E4q@3" = pitch + octave,
 * length (w=4 h=2 q=1 e=½ dq=1½ dh=3, in quarter-note beats), optional @finger.
 * Rests: "rq", "rh", "rw", "re", "rdh". Sharps/flats: "F#4q", "Bb2h".
 * Chords: pitches joined by "+", the length on the last one: "B3+D4+F#4h".
 * A "~" at the end ties the note to the next one of that hand: "F#4dh~ | F#4dh".
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
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    origin: 'Chanson anglaise traditionnelle (XVIe siècle) · main gauche écrite pour l’app',
    level: 3,
    bpm: 100,
    keyFifths: 0,
    time: [3, 4],
    pickup: 1,
    setup: 'La mineur (A minor) : pas d’armure, mais des G♯ et un F♯ écrits devant les notes. Main droite : pouce sur le A4 au-dessus du C central.',
    tips: [
      'Le rythme « noire pointée, croche, noire » revient sans cesse : compte « 1 — 2 et 3 ».',
      'Le G est tantôt naturel (mesures 4 et 12), tantôt dièse (mesures 6, 7 et 14) : lis bien chaque altération.',
      'Main gauche : une seule note par mesure, la basse de l’accord.'
    ],
    rh:
      'A4q@1 | C5h@2 D5q@3 | E5dq@4 F5e@5 E5q@4 | D5h B4q | G4dq A4e B4q | C5h A4q | A4dq G#4e A4q | B4h G#4q | E4h A4q | ' +
      'C5h D5q | E5dq F5e E5q | D5h B4q | G4dq A4e B4q | C5dq B4e A4q | G#4dq F#4e G#4q | A4dh',
    lh: 'rq | A2dh@5 | C3dh | G2dh | E2dh | A2dh | F2dh | E2dh | E2dh | A2dh | C3dh | G2dh | E2dh | A2dh | E2dh | A2dh'
  },
  {
    id: 'prelude-do-bach',
    title: 'Prélude en C (début)',
    origin: 'J.-S. Bach, Clavier bien tempéré I, BWV 846 · valeurs doublées (croches au lieu de doubles croches)',
    level: 3,
    bpm: 60,
    keyFifths: 0,
    setup: 'Main gauche autour du C central (lue en clé de fa, au-dessus de la portée), main droite : pouce sur le G4.',
    tips: [
      'Chaque mesure est un accord brisé : la main gauche joue les deux notes graves et les tient, la main droite répète trois notes deux fois.',
      'Lis l’accord d’un coup avant chaque mesure : les doigts gardent la même forme pendant toute la mesure.',
      'Les accords : C, C, Ré mineur sur C, puis G7 sur B, et retour à C. C’est la cadence I-II-V-I.',
      'Les notes graves sont liées : ne les rejoue pas, garde les touches enfoncées.'
    ],
    rh:
      'rq G4e@1 C5e E5e G4e C5e E5e | rq G4e C5e E5e G4e C5e E5e | rq A4e@1 D5e F5e A4e D5e F5e | rq A4e D5e F5e A4e D5e F5e | ' +
      'rq G4e@1 D5e F5e G4e D5e F5e | rq G4e D5e F5e G4e D5e F5e | rq G4e C5e E5e G4e C5e E5e | rq G4e C5e E5h',
    lh:
      'C4e E4dq~ E4h | C4e E4dq~ E4h | C4e D4dq~ D4h | C4e D4dq~ D4h | ' +
      'B3e D4dq~ D4h | B3e D4dq~ D4h | C4e E4dq~ E4h | C4e E4dq~ E4h'
  },
  // ---------------------------------------------------------------- level 4
  {
    id: 'lettre-a-elise',
    title: 'Lettre à Élise (thème)',
    origin: 'L. van Beethoven, Für Elise, WoO 59 · valeurs doublées (3/4 en croches au lieu de 3/8 en doubles croches)',
    level: 4,
    bpm: 84,
    keyFifths: 0,
    time: [3, 4],
    pickup: 1,
    setup: 'La mineur. Main droite : 5e doigt sur le E5 (le dernier interligne en haut de la clé de sol), 4e doigt sur le D♯ juste à gauche.',
    tips: [
      'Le célèbre balancement E-D♯-E-D♯ : 5-4-5-4, poignet souple, sans appuyer.',
      'Les deux mains se passent le relais : la main gauche monte l’accord (A-E-A), la droite continue en partant du C central.',
      'Mesures 3 et 7 : G♯ et D♯ sont écrits, rien à l’armure. Ce sont les notes de E majeur, l’accord qui ramène vers A mineur.',
      'Dans l’original, ces 8 mesures sont jouées deux fois avant la partie centrale.'
    ],
    rh:
      'E5e@5 D#5e@4 | E5e@5 D#5e@4 E5e@5 B4e@2 D5e@4 C5e@3 | A4q@1 re C4e@1 E4e@2 A4e@3 | B4q@4 re E4e@1 G#4e@3 B4e@4 | C5q@5 re E4e@1 E5e@5 D#5e@4 | ' +
      'E5e D#5e E5e B4e D5e C5e | A4q re C4e E4e A4e | B4q re D4e C5e B4e | A4dh',
    lh:
      'rq | rdh | A2e@5 E3e@2 A3e@1 re rq | E2e E3e G#3e re rq | A2e@5 E3e@2 A3e@1 re rq | ' +
      'rdh | A2e E3e A3e re rq | E2e E3e G#3e re rq | A2e E3e A3h'
  },
  {
    id: 'gymnopedie-1',
    title: 'Gymnopédie n°1 (début)',
    origin: 'E. Satie, 1888',
    level: 4,
    bpm: 66,
    keyFifths: 2,
    time: [3, 4],
    setup: 'Ré majeur à l’armure (F♯ et C♯). Main gauche : auriculaire sur le G2, puis un saut vers l’accord au-dessus du C3.',
    tips: [
      'Quatre mesures d’introduction à la main gauche seule : une basse grave, puis un accord. G, puis D, en alternance, du début à la fin.',
      'Le saut de la main gauche est le cœur du morceau : regarde l’accord suivant pendant que tu joues la basse.',
      'La mélodie arrive mesure 5, très calme. Le F♯ final est tenu quatre mesures : ne le rejoue pas.',
      '« Lent et douloureux », dit Satie : aucune précipitation, laisse sonner.'
    ],
    rh: 'rdh | rdh | rdh | rdh | rq F#5q A5q | G5q F#5q C#5q | B4q C#5q D5q | A4dh | F#4dh~ | F#4dh~ | F#4dh~ | F#4dh',
    lh:
      'G2q@5 B3+D4+F#4h | D2q@5 A3+C#4+F#4h | G2q B3+D4+F#4h | D2q A3+C#4+F#4h | G2q B3+D4+F#4h | D2q A3+C#4+F#4h | ' +
      'G2q B3+D4+F#4h | D2q A3+C#4+F#4h | G2q B3+D4+F#4h | D2q A3+C#4+F#4h | G2q B3+D4+F#4h | D2q A3+C#4+F#4h'
  },
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
  /** Other notes struck with this one (a chord), low to high. */
  with?: Tok[];
  /** Tied to the next note of the same hand. */
  tie?: boolean;
}

function parseTok(t: string): Tok {
  if (t.endsWith('~')) return { ...parseTok(t.slice(0, -1)), tie: true };
  if (t.includes('+')) {
    const parts = t.split('+');
    const last = parseTok(parts[parts.length - 1]);
    const others = parts.slice(0, -1).map((p) => parseTok(`${p}${Object.keys(LEN).find((k) => LEN[k] === last.dur)}`));
    const all = [...others, last].sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0));
    return { ...all[0], dur: last.dur, finger: last.finger, with: all.slice(1) };
  }
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

export const beatsPerBar = (p: Piece): number => ((p.time ?? [4, 4])[0] * 4) / (p.time ?? [4, 4])[1];

export type PieceHands = 'rh' | 'lh' | 'both';

/** Build a score for one hand or both. One hand alone gets its own single staff. */
export function pieceScore(p: Piece, hands: PieceHands): Score {
  const rh = parseHand(p.rh);
  const lh = parseHand(p.lh);
  const grand = hands === 'both';
  const time = p.time ?? [4, 4];
  let start = 0;
  // A tie carries on from bar to bar, one flag per hand.
  const tied: Record<number, boolean> = {};
  const measures: Measure[] = rh.map((_, i) => {
    const notes: NoteItem[] = [];
    const length = Math.max(...[rh[i], lh[i]].map((bar) => (bar ?? []).reduce((a, t) => a + t.dur, 0)));
    const add = (bar: Tok[] | undefined, staff: number) => {
      let t = start;
      for (const k of bar ?? []) {
        const spell = k.midi === null ? spellOfMidi(60) : { step: k.step, alter: k.alter, octave: k.octave };
        const base = k.dur === 1.5 ? 1 : k.dur === 3 ? 2 : k.dur;
        const dots = k.dur === 1.5 || k.dur === 3 ? 1 : 0;
        const n = makeNote({ beat: t, dur: k.dur, base, dots, staff, rest: k.midi === null, midi: k.midi ?? 60, spell, finger: k.finger });
        n.tieStop = !!tied[staff] && k.midi !== null;
        n.tieStart = !!k.tie && k.midi !== null;
        tied[staff] = n.tieStart;
        notes.push(n);
        for (const c of k.with ?? []) {
          notes.push(makeNote({ beat: t, dur: k.dur, base, dots, staff, midi: c.midi!, spell: { step: c.step, alter: c.alter, octave: c.octave }, chord: true }));
        }
        t += k.dur;
      }
    };
    if (hands !== 'lh') add(rh[i], 0);
    if (hands !== 'rh') add(lh[i], grand ? 1 : 0);
    const m: Measure = { number: i + 1, startBeat: start, length, key: p.keyFifths, keyChange: i === 0, time: i === 0 ? time : null, notes };
    start += length;
    return m;
  });
  const score: Score = {
    title: p.title,
    bpm: p.bpm,
    measures,
    infinite: false,
    staves: grand ? 2 : 1,
    clefs: grand ? ['G', 'F'] : [hands === 'lh' ? 'F' : 'G']
  };
  computeTies(score);
  return score;
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
  if (toks.some((t) => t.with?.length)) tags.push('accords');
  if (toks.some((t) => t.tie)) tags.push('liaisons');
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

/**
 * Bars that went wrong, worst first: `errorBeats` lists where something went
 * wrong (a wrong key, a hesitation, a missed or late note, a note let go early).
 */
export function weakBars(score: Score, errorBeats: number[]): number[] {
  const count = new Map<number, number>();
  for (const b of errorBeats) {
    const i = score.measures.findIndex((m) => b >= m.startBeat - 1e-9 && b < m.startBeat + m.length - 1e-9);
    if (i >= 0) count.set(i, (count.get(i) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => i);
}

/**
 * The passage to loop: the worst bar, its weak neighbours (three bars at most),
 * and at least two bars so the way in or out of the hard spot is practised too.
 */
export function loopRange(score: Score, weak: number[]): [number, number] | null {
  if (!weak.length) return null;
  const set = new Set(weak);
  let a = weak[0];
  let b = weak[0];
  while (set.has(b + 1) && b - a < 2) b++;
  while (set.has(a - 1) && b - a < 2) a--;
  if (b === a) {
    if (b + 1 < score.measures.length) b++;
    else if (a > 0) a--;
  }
  return [a, b];
}

/** Bars a..b of a score as a score of their own, keeping the printed bar numbers. */
export function excerptScore(score: Score, a: number, b: number): Score {
  const time = score.measures.find((m) => m.time)?.time ?? [4, 4];
  const shift = score.measures[a].startBeat;
  const measures: Measure[] = score.measures.slice(a, b + 1).map((m, k) => ({
    ...m,
    number: k + 1,
    label: m.label ?? m.number,
    startBeat: m.startBeat - shift,
    keyChange: k === 0,
    time: k === 0 ? time : null,
    // A note tied in from before the excerpt is played, not held.
    notes: m.notes.map((n) => ({ ...n, beat: n.beat - shift, tieEnd: n.tieEnd - shift, tieTarget: null, tieStop: k === 0 && Math.abs(n.beat - m.startBeat) < 1e-9 ? false : n.tieStop }))
  }));
  const last = measures[measures.length - 1];
  for (const n of last.notes) if (n.tieStart && n.beat + n.dur >= last.startBeat + last.length - 1e-9) n.tieStart = false;
  const out: Score = { ...score, title: `${score.title} · mesures ${measures[0].label}–${last.label}`, measures };
  computeTies(out);
  return out;
}
