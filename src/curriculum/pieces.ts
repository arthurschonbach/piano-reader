import { computeTies, makeNote, spellOfMidi, type Measure, type NoteItem, type Score } from '../core/model';

/**
 * Real pieces, public domain. Folk tunes have a simple left hand written for
 * this app; the classical pieces are transcribed from Mutopia Project editions
 * (mutopiaproject.org), note for note. Notation per hand: bars split by "|",
 * notes like "E4q@3" = pitch + octave, length (w=4 h=2 q=1 e=½ s=¼ dq=1½ dh=3
 * de=¾, in quarter-note beats), optional @finger.
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
  /** Clef of the left hand's staff (default bass). Some pieces keep it in treble. */
  lhClef?: 'G' | 'F';
  setup: string;
  tips: string[];
  rh: string;
  lh: string;
}

const C_BOTH = 'Position de C aux deux mains : pouce droit sur le C central (C4), auriculaire gauche sur le C3, une octave plus bas.';

export const PIECES: Piece[] = [
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
    rh: 'E4dq@3 G4e@5 G4h | E4dq D4e C4h@1 | D4dq E4e G4dq E4e | D4w | E4dq G4e G4h | E4dq D4e C4h | D4q E4q D4dq C4e | C4w',
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
  // ---------------------------------------------------------------- level 3,
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
    rh: 'C4de@1 C4s | D4q@2 C4q F4q@4 | E4h@3 C4de@1 C4s | D4q C4q G4q@5 | F4h@4 C4de@1 C4s | C5q@5 A4q@3 F4q@1 | E4q D4q Bb4de@4 Bb4s | A4q@3 F4q@1 G4q@2 | F4dh@1',
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
    id: 'schumann-melodie',
    title: 'Mélodie (Album pour la jeunesse n°1)',
    origin: 'R. Schumann, op. 68 n°1 · d’après l’édition Mutopia Project, reprises écrites',
    level: 3,
    bpm: 72,
    lhClef: 'G',
    keyFifths: 0,
    setup: 'Do majeur. Les deux mains en clé de sol, comme dans l’original : main gauche autour du C4, main droite au-dessus.',
    tips: [
      'La main droite chante en noires, legato ; la main gauche l’accompagne en croches régulières, plus doucement.',
      'La main gauche est écrite en clé de sol : lis-la comme la droite, une octave plus bas.',
      'Les mesures 1-4 sont jouées deux fois, puis les mesures 9-16 deux fois.'
    ],
    rh:
      'E5q D5q C5q B4q | A4e C5e B4e D5e C5q G4q | G5q F5q E5q C5q | B4q F#4+A4q G4q rq | E5q D5q C5q B4q | A4e C5e B4e D5e C5q G4q | G5q F5q E5q C5q | B4q F#4+A4q G4q rq | ' +
      'D5q C5q B4q rq | F5q E5q D5q rq | A5q G5q F5q E5q | D5e F5e E5e G5e A4+F5e C5e B4e D5e | C5+E5q D5q C5q B4q | A4e C5e B4e D5e C5q G4q | A5q G5q B4+F5q C5+E5q | D5e F5e B4e D5e C5q rq | ' +
      'D5q C5q B4q rq | F5q E5q D5q rq | A5q G5q F5q E5q | D5e F5e E5e G5e A4+F5e C5e B4e D5e | C5+E5q D5q C5q B4q | A4e C5e B4e D5e C5q G4q | A5q G5q B4+F5q C5+E5q | D5e F5e B4e D5e C5q rq',
    lh:
      'C4e G4e F4e G4e E4e G4e C4e E4e | F4e D4e G4e F4e E4e F4e E4e D4e | E4e G4e D4e G4e C4e G4e E4e G4e | D4e G4e C4e D4e B3e D4e G3q | C4e G4e F4e G4e E4e G4e C4e E4e | F4e D4e G4e F4e E4e F4e E4e D4e | E4e G4e D4e G4e C4e G4e E4e G4e | D4e G4e C4e D4e B3e D4e G3q | ' +
      'F4e G4e E4e G4e D4e G4e F#4e G4e | D4e G4e C4e G4e B3e G4e F#4e G4e | F4e G4e E4e G4e D4e G4e C4e G4e | B3e G4e C4e C#4e D4q G4q | C4e G4e F4e G4e E4e G4e C4e E4e | F4e D4e G4e F4e E4e F4e E4e C4e | F4e C5e E4e C5e D4e G4e C4e G4e | F4e A4e G4e F4e E4e G4e C4e E4e | ' +
      'F4e G4e E4e G4e D4e G4e F#4e G4e | D4e G4e C4e G4e B3e G4e F#4e G4e | F4e G4e E4e G4e D4e G4e C4e G4e | B3e G4e C4e C#4e D4q G4q | C4e G4e F4e G4e E4e G4e C4e E4e | F4e D4e G4e F4e E4e F4e E4e C4e | F4e C5e E4e C5e D4e G4e C4e G4e | F4e A4e G4e F4e E4e G4e C4q'
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
  // ---------------------------------------------------------------- level 5,
  {
    id: 'prelude-do-bach',
    title: 'Prélude en C (début)',
    origin: 'J.-S. Bach, Clavier bien tempéré I, BWV 846 · 4 premières mesures, d’après l’édition Mutopia Project',
    level: 4,
    bpm: 60,
    keyFifths: 0,
    setup: 'Main gauche autour du C central (lue en clé de fa, au-dessus de la portée), main droite : pouce sur le G4.',
    tips: [
      'Chaque demi-mesure est un accord brisé en doubles croches : la main gauche joue les deux notes graves, la main droite les trois aiguës, deux fois.',
      'Dans l’original, la note la plus grave est tenue toute la demi-mesure : garde-la enfoncée pendant que la main droite joue.',
      'Les accords : C, Ré mineur sur C, G7 sur B, puis C. Lis chaque accord d’un coup avant la mesure.'
    ],
    rh:
      're G4s C5s E5s G4s C5s E5s re G4s C5s E5s G4s C5s E5s | re A4s D5s F5s A4s D5s F5s re A4s D5s F5s A4s D5s F5s | re G4s D5s F5s G4s D5s F5s re G4s D5s F5s G4s D5s F5s | re G4s C5s E5s G4s C5s E5s re G4s C5s E5s G4s C5s E5s',
    lh:
      'C4s E4dq~ E4s C4s E4dq~ E4s | C4s D4dq~ D4s C4s D4dq~ D4s | B3s D4dq~ D4s B3s D4dq~ D4s | C4s E4dq~ E4s C4s E4dq~ E4s'
  },
  {
    id: 'lettre-a-elise',
    title: 'Lettre à Élise (thème)',
    origin: 'L. van Beethoven, Für Elise, WoO 59 · d’après l’édition Mutopia Project (dernière mesure ajoutée pour finir sur A)',
    level: 4,
    bpm: 63,
    keyFifths: 0,
    time: [3, 8],
    pickup: 0.5,
    setup: 'La mineur. Main droite : le E5 est le dernier interligne en haut de la clé de sol ; le D♯ est la touche noire juste à gauche.',
    tips: [
      'Mesure à 3/8 : trois croches par mesure, presque tout en doubles croches. Compte « 1 et 2 et 3 et ».',
      'Ça commence par une levée de deux doubles croches (E-D♯) avant la première barre de mesure.',
      'Les deux mains se passent le relais : la main gauche monte l’accord (A-E-A ou E-E-G♯), la droite continue.',
      'Dans l’original, ces 8 mesures sont jouées deux fois avant la partie centrale.'
    ],
    rh:
      'E5s D#5s | E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s G#4s B4s | C5e rs E4s E5s D#5s | E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s C5s B4s | ' +
      'A4dq',
    lh:
      're | rdq | A2s E3s A3s rde | E2s E3s G#3s rde | A2s E3s A3s rde | rdq | A2s E3s A3s rde | E2s E3s G#3s rde | ' +
      'A2s E3s A3s rde'
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
    id: 'schumann-petite-piece',
    title: 'Petite pièce (Album pour la jeunesse n°5)',
    origin: 'R. Schumann, op. 68 n°5 · d’après l’édition Mutopia Project',
    level: 4,
    bpm: 80,
    lhClef: 'G',
    keyFifths: 0,
    pickup: 3,
    setup: 'Do majeur. Main gauche en clé de sol (comme dans l’original), autour du C4.',
    tips: [
      'Ça commence par une levée de trois temps.',
      'La main gauche alterne sans arrêt une note grave et un G aigu : garde le pouce sur le G.',
      'La mélodie avance en noires : fais-la ressortir au-dessus des croches.'
    ],
    rh:
      'rq E5q F5q | G5q A5q D5q E5q | F5h C5q D5q | E5q E5q D5q A4q | C5q B4q E5q F5q | G5q A5q D5q E5q | F5h C5q D5q | E5q E5q D5q B4q | ' +
      'D5q C5q B4q C5q | D5q E5q C5q D5q | E5h C5q D5q | E5q F5q D5q E5q | F5q D5q E5q F5q | G5q A5q D5q E5q | F5h C5q D5q | E5q E5q D5q B4q | ' +
      'D5q C5q B4q C5q | D5q E5q C5q D5q | E5h C5q D5q | E5q F5q D5q E5q | F5q D5q E5q F5q | G5q A5q D5q E5q | F5h C5q D5q | E5q E5q D5q B4q | ' +
      'D5q C5q rh',
    lh:
      'rq C4e G4e D4e G4e | E4e G4e F4e G4e B3e G4e C4e G4e | D4e G4e D4e G4e A3e G4e B3e G4e | C4e G4e C4e G4e D4e F#4e D4e F#4e | G3e G4e G3e G4e C4e G4e D4e G4e | E4e G4e F4e G4e B3e G4e C4e G4e | D4e G4e D4e G4e A3e G4e B3e G4e | C4e G4e E4e G4e F3e F4e G3e D4e | ' +
      'C4+F4q E4q G3e G4e A3e G4e | B3e G4e C4e G4e A3e G4e B3e G4e | C4e G4e C4e G4e A3e G4e B3e G4e | C4e G4e D4e G4e B3e G4e C4e G4e | D4e G4e B3e G4e C4e G4e D4e G4e | E4e G4e F4e G4e B3e G4e C#4e G4e | D4e G4e D4e G4e A3e G4e B3e G4e | C4e G4e E4e G4e F3e F4e G3e D4e | ' +
      'C4+F4q E4q G3e G4e A3e G4e | B3e G4e C4e G4e A3e G4e B3e G4e | C4e G4e C4e G4e A3e G4e B3e G4e | C4e G4e D4e G4e B3e G4e C4e G4e | D4e G4e B3e G4e C4e G4e D4e G4e | E4e G4e F4e G4e B3e G4e C#4e G4e | D4e G4e D4e G4e A3e G4e B3e G4e | C4e G4e E4e G4e F3e F4e G3e D4e | ' +
      'C4+F4q E4q rh'
  },
  {
    id: 'schumann-marche',
    title: 'Marche militaire (Album pour la jeunesse n°2)',
    origin: 'R. Schumann, op. 68 n°2 · d’après l’édition Mutopia Project, sans les reprises',
    level: 4,
    bpm: 96,
    keyFifths: 1,
    time: [2, 4],
    setup: 'Sol majeur (un dièse, F♯). Mesure à 2/4. Main droite sur des accords de deux ou trois notes.',
    tips: [
      'Rythme pointé : croche pointée et double croche, puis croche. Compte « 1 et 2 et ».',
      'Chaque accord est suivi d’un demi-soupir : joue court et net, comme une marche.',
      'Les notes des accords doivent tomber exactement ensemble.'
    ],
    rh:
      'G4+B4de G4+C5s G4+D5e re | G4+E5e re G4+D5e re | F#4+C5e re G4+B4e re | F#4+A4e re G4e re | G4+B4de G4+C5s G4+D5e re | G4+E5e re G4+D5e re | E5+G5e re D5+F#5e re | C#5+E5e re D5e re | ' +
      'D4de E4s F#4q | E4q D4q | F#4+E5e re G4+D5e re | A4+C5e re G4+B4e re | D4+F#4+A4de E4s F#4q | E4q D4q | A4+C5e re G4+B4e re | F#4+A4e re G4+B4e re | ' +
      'G4+B4de G4+C5s G4+D5e re | G4+E5e re G4+D5e re | F#4+C5e re G4+B4e re | F#4+A4e re G4e re | C4de D4s E4q | D4q C4q | D4q A4+D5+F#5e re | B4+D5+G5e rdq',
    lh:
      'G3de A3s B3e re | C4e re B3e re | A3e re G3e re | D3+C4e re G3+B3e re | G3de A3s B3e re | C4e re B3e re | C#4e re D4e re | A3+G4e re D4+F#4e re | ' +
      'D3de E3s F#3q | E3q D3q | C4e re B3e re | F#3+D4e re G3+D4e re | D3de E3s F#3q | E3q D3q | F#3+D4e re G3+D4e re | D3+D4e re G3+D4e re | ' +
      'G3de A3s B3e re | C4e re B3e re | A3e re G3e re | D3+C4e re G3+B3e re | C3de D3s E3q | D3q C3q | D3q D4e re | G3e rdq'
  },
  // ---------------------------------------------------------------- level 5
  {
    id: 'menuet-sol',
    title: 'Menuet en sol (Minuet in G)',
    origin: 'C. Petzold, vers 1725 (Petit livre d’Anna Magdalena Bach, BWV Anh. 114) · d’après l’édition Mutopia Project, ornements omis',
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
    lh: 'G3+B3+D4h A3q | B3dh | C4dh | B3dh | A3dh | G3dh | D4q B3q G3q | D4q D3e C4e B3e A3e | B3h A3q | G3q B3q G3q | C4dh | B3q C4e B3e A3e G3e | A3h F#3q | G3h B3q | C4q D4q D3q | G3h G2q'
  },
  {
    id: 'menuet-sol-mineur',
    title: 'Menuet en sol mineur',
    origin: 'C. Petzold (Petit livre d’Anna Magdalena Bach, BWV Anh. 115) · d’après l’édition Mutopia Project, ornements omis',
    level: 5,
    bpm: 84,
    keyFifths: -2,
    time: [3, 4],
    setup: 'Sol mineur (G minor) : deux bémols à l’armure, B♭ et E♭. Main droite au-dessus du C5, main gauche autour du G3.',
    tips: [
      'Le pendant mineur du célèbre Menuet en sol : même forme, deux parties de 16 mesures.',
      'Le F♯ (sensible de sol mineur) est écrit devant les notes : il n’est pas à l’armure.',
      'La première partie finit en B♭ majeur (mesure 16), la seconde revient en sol mineur.'
    ],
    rh:
      'Bb5q A5q G5q | A5q D5q D5q | G5q G4e A4e Bb4e C5e | D5dh | Eb5q F5e Eb5e D5e C5e | D5q Eb5e D5e C5e Bb4e | C5q D5e C5e Bb4e C5e | A4dh | ' +
      'Bb5q A5q G5q | A5q D5q D5q | G5q G4e A4e Bb4e C5e | D5dh | F5q G5e F5e Eb5e D5e | Eb5q F5e Eb5e D5e C5e | D5q G5q C5q | D4+F4+Bb4dh | ' +
      'D5q Bb4e C5e D5e E5e | F5q G5q A5q | Bb5q G5e A5e Bb5e G5e | A5q G5e A5e F5q | F4e G4e A4e Bb4e C5e D5e | Eb5q D5q C5q | F5q Bb4q A4q | Bb4dh | ' +
      'G4q D5e C5e D5q | G4q Eb5e D5e Eb5q | G4e D5e F#4e C5e G4e Bb4e | A4h rq | D4e E4e F#4e G4e A4e Bb4e | C5q Bb4q A4q | Bb4e C5s D5s G4q F#4q | Bb3+D4+G4dh',
    lh:
      'G3dh | F3dh | Eb3dh | D3q D4e C4e Bb3e A3e | G3+Bb3h A3q | Bb3h G3q | A3q F#3q G3q | D3q D4e C4e Bb3e A3e | ' +
      'G3dh | F3dh | Eb3dh | D3q D4e C4e B3e A3e | B3+D4h G3q | C4q A3q F3q | Bb3q Eb3q F3+A3q | Bb3q Bb2h | ' +
      'Bb3dh | A3q G3q F3q | G3q E3q C3q | F3h rq | A3q G3q F3q | G3q F3q Eb3q | D3q Eb3q F3q | Bb2q D4q C4q | ' +
      'B3+D4dh | C4dh | Bb3q A3q G3q | D4q A3e G3e F#3e E3e | D3h rq | Eb3q D3q C3q | Bb2q C3q D3q | G3q G2h'
  },
  {
    id: 'schumann-cavalier',
    title: 'Le Cavalier sauvage (Album pour la jeunesse n°8)',
    origin: 'R. Schumann, op. 68 n°8 · d’après l’édition Mutopia Project, sans les reprises',
    level: 5,
    bpm: 96,
    keyFifths: 0,
    time: [6, 8],
    pickup: 0.5,
    setup: 'La mineur. Mesure à 6/8. Main droite autour du A4, main gauche une octave plus bas.',
    tips: [
      '6/8 rapide : sens deux grands temps par mesure, au galop.',
      'Ça commence par une levée d’une croche (E).',
      'Au milieu (mesures 17 à 24), la mélodie passe à la main gauche pendant que la droite joue des accords en F majeur.'
    ],
    rh:
      'E4e | A4e E4e A4e C5e A4e C5e | E5e C5e F5e E5e C5e A4e | B4e G#4e C5e B4e G#4e E4e | A4e E4e C5e B4e re E4e | A4e E4e A4e C5e A4e C5e | E5e C5e F5e E5e C5e A4e | B4e G#4e C5e B4e G#4e E4e | ' +
      'A4e E4e G#4e A4e rq | C4+F4+A4e rq C4+F4+A4e rq | F4+A4q F4+A4e F4+A4e rq | E4+G4+C5q E4+G4+C5e E4+G4+C5e rq | F4+A4+C5e A4e F4e E4+G4e rq | C4+F4+A4e rq C4+F4+A4e rq | F4+A4q F4+A4e F4+A4e rq | E4+G4+C5q E4+G4+C5e E4+G4+C5e rq | ' +
      'C4+F4+A4e re C4+G4e F4e re E4e | A4e E4e A4e C5e A4e C5e | E5e C5e F5e E5e C5e A4e | B4e G#4e C5e B4e G#4e E4e | A4e E4e C5e B4e re E4e | A4e E4e A4e C5e A4e C5e | E5e C5e F5e E5e C5e A4e | B4e G#4e C5e B4e G#4e E4e | ' +
      'A4e E4e G#4e A4e rq',
    lh:
      're | A3+C4e rq A3+C4+E4e rq | A3+C4+E4q A3+D4+F4e A3+C4+E4e rq | E3+G#3+B3q E3+A3+C4e E3+G#3+B3e rq | A3+C4e re A3+C4e E3+G#3+B3e rq | A3+C4e rq A3+C4+E4e rq | A3+C4+E4q A3+D4+F4e A3+C4+E4e rq | E3+G#3+B3q E3+A3+C4e E3+G#3+B3e rq | ' +
      'A3+C4e re E3+B3e A3+C4e re C3e | F3e C3e F3e A3e F3e A3e | C4e A3e D4e C4e A3e F3e | G3e E3e A3e G3e E3e C3e | F3e C3e A3e C3+G3e re C3e | F3e C3e F3e A3e F3e A3e | C4e A3e D4e C4e A3e F3e | G3e E3e A3e G3e E3e C3e | ' +
      'F3e C3e E3e F3e rq | A3+C4e rq A3+C4+E4e rq | A3+C4+E4q A3+D4+F4e A3+C4+E4e rq | E3+G#3+B3q E3+A3+C4e E3+G#3+B3e rq | A3+C4e re A3+C4e E3+G#3+B3e rq | A3+C4e rq A3+C4+E4e rq | A3+C4+E4q A3+D4+F4e A3+C4+E4e rq | E3+G#3+B3q E3+A3+C4e E3+G#3+B3e rq | ' +
      'A3+C4e re E3+B3e A3+C4e rq'
  },
  {
    id: 'burgmuller-arabesque',
    title: 'Arabesque (25 études op. 100 n°2)',
    origin: 'F. Burgmüller, op. 100 n°2 · d’après l’édition Mutopia Project, sans les reprises',
    level: 5,
    bpm: 88,
    keyFifths: 0,
    time: [2, 4],
    setup: 'La mineur. Mesure à 2/4. Main droite : pouce sur le A4 pour le premier groupe de doubles croches.',
    tips: [
      'Deux mesures d’introduction à la main gauche seule, puis les traits de doubles croches à droite.',
      'Chaque groupe de quatre doubles croches finit sur une croche courte : lève la main légèrement.',
      'Au milieu, les traits passent à la main gauche.'
    ],
    rh:
      'rh | rh | A4s B4s C5s B4s A4e re | A4s B4s C5s D5s E5e re | D5s E5s F5s G5s A5e re | A5s B5s C6s D6s E6e re | re E5e E5e F5e | D5e re D5q~ | ' +
      'D5e G5e D5e E5e | C5q C6e re | E5dq B4e | C5dq A4e | E5dq B4e | C5dq A4e | A5dq E5e | F5dq E5e | ' +
      'D5e C5e B4e A4e | G#4q E5q | A4s B4s C5s B4s A4e re | A4s B4s C5s D5s E5e re | D5s E5s F5s G5s A5e re | A5s B5s C6s D6s E6e re | re B4e B4e C5e | A4q E5q~ | ' +
      'E5e B4e B4e C5e | A4s B4s C5s B4s A4e re | D5s E5s F5s G5s A5e re | A5s B5s C6s B5s A5e re | D6s E6s F6s G6s A6e re | E4s D4s C4s B3s A3e re | C5+A5h',
    lh:
      'A3+C4+E4q A3+C4+E4q | A3+C4+E4q A3+C4+E4q | A3+C4+E4q A3+C4+E4q | A3+C4+E4q A3+C4+E4q | A3+D4+F4q A3+D4+F4q | A3+C4+E4q A3+C4+E4q | G3+C4+E4q G3+C4+E4q | G3+B3+F4q G3+B3+F4q | ' +
      'G3+B3+F4q G3+B3+F4q | C4+E4dq re | G#3s A3s B3s A3s G#3e re | A3s B3s C4s D4s E4e re | G#3s A3s B3s A3s G#3e re | A3s B3s C4s D4s E4e re | C#4s D4s E4s D4s C#4e re | D4s E4s F4s G4s A4e G4e | ' +
      'F4e E4e D4e D#4e | E4e D4e C4e B3e | A3+C4+E4q A3+C4+E4q | A3+C4+E4q A3+C4+E4q | A3+D4+F4q A3+D4+F4q | A3+C4+E4q A3+C4+E4q | A3+D4+E4q A3+D4+E4q | A3+C4+E4q A3+C4+E4q | ' +
      'A3+D4+E4q A3+D4+E4q | A3+C4+E4q A3+C4+E4q | A3+D4+F4q A3+D4+F4q | A3+C4+E4q A3+C4+E4q | A3+D4+F4q A3+D4+F4q | E3s D3s C3s B2s A2e re | A3+E4h'
  },
  {
    id: 'burgmuller-progres',
    title: 'Progrès (25 études op. 100 n°6)',
    origin: 'F. Burgmüller, op. 100 n°6 · d’après l’édition Mutopia Project, avec le da capo',
    level: 5,
    bpm: 80,
    keyFifths: 0,
    setup: 'Do majeur. Les deux mains commencent sur le E et le C, en gammes parallèles.',
    tips: [
      'Gammes en doubles croches aux deux mains : passages du pouce comme dans la section Technique.',
      'Après la mesure 16, on reprend du début jusqu’à « Fine » (mesure 8) : c’est écrit ici en entier.'
    ],
    rh:
      'E4e F4s G4s A4s B4s C5s D5s E5e B4e C5e A4e | G4e A4s B4s C5s D5s E5s F5s G5e F#5e G5e E5e | F5e D6e D5e B5e B4e G5e F5e D5e | C5+E5w | E4e F4s G4s A4s B4s C5s D5s E5e B4e C5e A4e | G4e A4s B4s C5s D5s E5s F5s G5e F#5e G5e E5e | F5e D6e D5e B5e B4e G5e F5e D5e | C5e D5s E5s F5s G5s A5s B5s C6q rq | ' +
      're C6e E6e A5e C6e E5e A5e C5e | D5+F5w | re B5e D6e G5e B5e D5e G5e B4e | C5+E5w | re E4e F4e E4e F#4e E4e G#4e E4e | A4e E4e B4e E4e C5e E4e A4e E4e | G#4e E5e B4e E5e C5e E5e A4e E5e | re E5q E5q E5q E5e | ' +
      'E4e F4s G4s A4s B4s C5s D5s E5e B4e C5e A4e | G4e A4s B4s C5s D5s E5s F5s G5e F#5e G5e E5e | F5e D6e D5e B5e B4e G5e F5e D5e | C5+E5w | E4e F4s G4s A4s B4s C5s D5s E5e B4e C5e A4e | G4e A4s B4s C5s D5s E5s F5s G5e F#5e G5e E5e | F5e D6e D5e B5e B4e G5e F5e D5e | C5e D5s E5s F5s G5s A5s B5s C6q rq',
    lh:
      'C3e D3s E3s F3s G3s A3s B3s C4e G#3e A3e F3e | E3e F3s G3s A3s B3s C4s D4s E4e D#4e E4e C4e | G3+D4w | C4e E4e A3e C4e G3e C4e E3e C4e | C3e D3s E3s F3s G3s A3s B3s C4e G#3e A3e F3e | E3e F3s G3s A3s B3s C4s D4s E4e D#4e E4e C4e | G3+D4dh G3+B3q | C4e B3s A3s G3s F3s E3s D3s C3q rq | ' +
      'A3+C4w | re D4e F4e A3e D4e F3e A3e D3e | G3+B3w | re C4e E4e G3e C4e E3e G3e C3e | E3h rq D4q | C4q G#3q A3q C4q | B3q G#3q A3q C4q | E4q E4q E4q E4q | ' +
      'C3e D3s E3s F3s G3s A3s B3s C4e G#3e A3e F3e | E3e F3s G3s A3s B3s C4s D4s E4e D#4e E4e C4e | G3+D4w | C4e E4e A3e C4e G3e C4e E3e C4e | C3e D3s E3s F3s G3s A3s B3s C4e G#3e A3e F3e | E3e F3s G3s A3s B3s C4s D4s E4e D#4e E4e C4e | G3+D4dh G3+B3q | C4e B3s A3s G3s F3s E3s D3s C3q rq'
  }
];

const LEN: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, dq: 1.5, dh: 3, de: 0.75 };
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
  const rest = /^r(dq|dh|de|w|h|q|e|s)$/.exec(t);
  if (rest) return { midi: null, step: 0, alter: 0, octave: 4, dur: LEN[rest[1]] };
  const m = /^([A-G])([#b]?)(\d)(dq|dh|de|w|h|q|e|s)(?:@([1-5]))?$/.exec(t);
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
        const dotted = k.dur === 1.5 || k.dur === 3 || k.dur === 0.75;
        // A whole bar of silence is written as a whole rest, whatever the time signature.
        const fullBarRest = k.midi === null && Math.abs(k.dur - length) < 1e-9 && bar!.length === 1;
        const base = fullBarRest ? 4 : dotted ? (k.dur * 2) / 3 : k.dur;
        const dots = dotted && !fullBarRest ? 1 : 0;
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
    clefs: grand ? ['G', p.lhClef ?? 'F'] : [hands === 'lh' ? p.lhClef ?? 'F' : 'G']
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
