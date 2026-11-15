/**
 * The learning path, as plain data. Each lesson says what notes each hand may
 * use, how the hands are arranged, which rhythms appear and how it's judged.
 */

export type Mode = 'wait' | 'rhythm';
export type Arrangement = 'rh' | 'lh' | 'alternate' | 'together' | 'flash';

export interface Hand {
  /** MIDI notes this hand may play, low to high. */
  notes: number[];
  /** Largest jump between two notes, counted in positions inside `notes`. */
  maxLeap: number;
  /** Resting note for the end of the exercise. */
  home?: number;
}

/** A bar rhythm in 4/4 (quarter = 1, negative = rest), with its weight. */
export type Rhythm = [number[], number];

export interface Lesson {
  id: string;
  number: number;
  title: string;
  goal: string;
  /** Where to put the hands before starting. */
  setup?: string;
  /** Short explanations shown before the first exercise. */
  theory: string[];
  mode: Mode;
  arrangement: Arrangement;
  rh?: Hand;
  lh?: Hand;
  keyFifths: number;
  rhythms: Rhythm[];
  /** Left-hand rhythms when both hands play together. */
  lhRhythms?: Rhythm[];
  /** Weight of each jump size (index = positions moved). */
  leapShape?: number[];
  bars: number;
  /** Target tempo for rhythm lessons. */
  bpm?: number;
  /** Part of the level test. */
  placement?: boolean;
}

export const MASTERY = {
  wait: { accuracy: 0.95, medianReactionMs: 1500 },
  rhythm: { accuracy: 0.9, timingMs: 120 },
  days: 2
};

const C_RH: Hand = { notes: [60, 62, 64, 65, 67], maxLeap: 2, home: 60 };
const C_LH: Hand = { notes: [48, 50, 52, 53, 55], maxLeap: 2, home: 48 };

const SIMPLE: Rhythm[] = [
  [[4], 1],
  [[2, 2], 2],
  [[2, 1, 1], 2],
  [[1, 1, 2], 2],
  [[1, 2, 1], 1],
  [[1, 1, 1, 1], 4]
];

export const LESSONS: Lesson[] = [
  {
    id: 'do-main-droite',
    number: 1,
    title: 'Position de C · main droite',
    goal: 'Lire C, D, E, F, G en clé de sol, sans compter les lignes.',
    setup: 'Pouce droit sur le C du milieu du clavier (C4), un doigt par touche jusqu’au G (doigts 1 à 5).',
    theory: [
      'La clé de sol (treble clef) s’enroule autour de la 2e ligne (line) en partant du bas : la note posée sur cette ligne est un G (la clé de sol est aussi appelée clé de G).',
      'Le C du milieu du clavier (C central, ou C4) se place juste sous la portée (staff), sur une petite ligne ajoutée (ledger line).',
      'Lis par mouvement : si la note suivante est juste au-dessus (d’une ligne à l’interligne voisin, the next space), c’est la note suivante de la gamme (scale). Inutile de recompter depuis le bas.',
      'Ronde (whole note) = 4 temps (beats), blanche (half note) = 2 temps, noire (quarter note) = 1 temps. Ici le rythme ne compte pas encore : la partition t’attend.'
    ],
    mode: 'wait',
    arrangement: 'rh',
    rh: C_RH,
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 8,
    placement: true
  },
  {
    id: 'do-main-gauche',
    number: 2,
    title: 'Position de C · main gauche',
    goal: 'Lire C, D, E, F, G en clé de fa.',
    setup: 'Auriculaire gauche (doigt 5) sur le C3, une octave sous le C central, un doigt par touche jusqu’au G, joué par le pouce.',
    theory: [
      'La clé de fa (bass clef) a deux points qui entourent la 4e ligne : la note sur cette ligne est un F, celui juste sous le C central (la clé de fa est aussi appelée clé de F).',
      'En clé de fa, les notes ne sont pas au même endroit qu’en clé de sol. Le C3 se trouve dans le 2e interligne (space) en partant du bas.',
      'Repères pour cette position : C dans le 2e interligne, D sur la ligne du milieu, F sur la 4e ligne, entre les deux points de la clé.'
    ],
    mode: 'wait',
    arrangement: 'lh',
    lh: C_LH,
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 8,
    placement: true
  },
  {
    id: 'alternance',
    number: 3,
    title: 'Les deux mains en alternance',
    goal: 'Passer d’une portée à l’autre sans perdre le fil.',
    setup: 'Main droite en position de C (pouce sur le C central), main gauche en position de C3 (auriculaire une octave plus bas).',
    theory: [
      'La grande portée (grand staff) réunit les deux clés : clé de sol en haut pour la main droite, clé de fa en bas pour la main gauche.',
      'Avant chaque note, regarde d’abord sur quelle portée elle se trouve : c’est elle qui te dit quelle main joue.',
      'Le C central est à la frontière : sous la clé de sol avec une ligne ajoutée, ou au-dessus de la clé de fa.'
    ],
    mode: 'wait',
    arrangement: 'alternate',
    rh: C_RH,
    lh: C_LH,
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 8,
    placement: true
  },
  {
    id: 'en-rythme',
    number: 4,
    title: 'Jouer en rythme',
    goal: 'Jouer au tempo : noires, blanches, rondes et soupirs.',
    setup: 'Pouce droit sur le C central, comme en leçon 1.',
    theory: [
      'Maintenant la partition avance toute seule, au tempo. Le métronome compte une mesure (bar) de 4 clics avant de démarrer : c’est le décompte (count-in).',
      'Compte « 1, 2, 3, 4 » dans ta tête à chaque mesure : une noire dure 1 clic, une blanche 2, une ronde 4.',
      'Le soupir (quarter rest) est un silence d’une noire : tu ne joues rien, mais tu continues à compter.',
      'Mieux vaut une note juste et calme qu’une note précipitée. Baisse le tempo si besoin : la vitesse viendra.'
    ],
    mode: 'rhythm',
    arrangement: 'rh',
    rh: C_RH,
    keyFifths: 0,
    rhythms: [
      [[4], 1],
      [[2, 2], 2],
      [[2, 1, 1], 2],
      [[1, 1, 2], 2],
      [[1, 1, 1, 1], 3],
      [[1, -1, 2], 1],
      [[2, -1, 1], 1]
    ],
    bars: 8,
    bpm: 60
  },
  {
    id: 'intervalles',
    number: 5,
    title: 'Lire par intervalles',
    goal: 'Reconnaître secondes, tierces, quartes et quintes à leur forme.',
    setup: 'Les deux mains en position de C, comme en leçon 3.',
    theory: [
      'Un intervalle (interval), c’est l’écart entre deux notes. Seconde (2nd) : notes voisines. Tierce (3rd) : on saute une note. Quarte (4th) : on en saute deux. Quinte (5th) : du pouce à l’auriculaire.',
      'Sur la portée : une seconde va d’une ligne à l’interligne juste à côté. Une tierce va d’une ligne à la ligne suivante (ou d’un interligne au suivant).',
      'Une quinte va d’une ligne à la deuxième ligne au-dessus. Lis la forme plutôt que le nom : si tu sais d’où tu pars, il suffit de mesurer l’écart.'
    ],
    mode: 'wait',
    arrangement: 'alternate',
    rh: { ...C_RH, maxLeap: 4 },
    lh: { ...C_LH, maxLeap: 4 },
    leapShape: [0.2, 1, 2.5, 2, 1.5],
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 8,
    placement: true
  },
  {
    id: 'reperes',
    number: 6,
    title: 'Notes repères',
    goal: 'Sortir des cinq doigts : lire de C3 à C5 sur les deux portées.',
    setup: 'Ta main se déplace : regarde la note, trouve-la au clavier. Les doigtés sont libres.',
    theory: [
      'Cinq notes repères (landmark notes) à reconnaître d’un coup d’œil : le C central (ligne ajoutée entre les deux portées) et le G4 (2e ligne de la clé de sol).',
      'Puis le C5 (3e interligne de la clé de sol), le F3 (4e ligne de la clé de fa) et le C3 (2e interligne de la clé de fa).',
      'Pour lire une autre note, pars du repère le plus proche et compte une ou deux notes.'
    ],
    mode: 'wait',
    arrangement: 'alternate',
    rh: { notes: [60, 62, 64, 65, 67, 69, 71, 72], maxLeap: 3, home: 60 },
    lh: { notes: [48, 50, 52, 53, 55, 57, 59, 60], maxLeap: 3, home: 48 },
    leapShape: [0.3, 2, 2, 1.5],
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 12,
    placement: true
  },
  {
    id: 'deux-mains',
    number: 7,
    title: 'Les deux mains ensemble',
    goal: 'Jouer une mélodie à droite sur de longues notes à gauche.',
    setup: 'Les deux mains en position de C. La main gauche tient ses notes pendant que la droite avance.',
    theory: [
      'Les notes alignées verticalement se jouent en même temps (hands together), même si elles sont sur deux portées différentes.',
      'La main gauche joue peu de notes, mais longues : garde le doigt enfoncé pendant que la droite continue.',
      'Lis de bas en haut : d’abord la note de la main gauche, puis celle de la droite, et pose-les ensemble.'
    ],
    mode: 'wait',
    arrangement: 'together',
    rh: C_RH,
    lh: { notes: [48, 52, 53, 55], maxLeap: 3, home: 48 },
    keyFifths: 0,
    rhythms: [
      [[4], 1],
      [[2, 2], 3],
      [[2, 1, 1], 2],
      [[1, 1, 2], 2],
      [[1, 1, 1, 1], 1]
    ],
    lhRhythms: [
      [[4], 3],
      [[2, 2], 2]
    ],
    bars: 8,
    placement: true
  },
  {
    id: 'croches',
    number: 8,
    title: 'Les croches',
    goal: 'Jouer deux notes par temps, régulièrement.',
    setup: 'Pouce droit sur le C central.',
    theory: [
      'La croche (eighth note) dure un demi-temps : deux croches valent une noire. Elles sont souvent reliées par une barre (beam).',
      'Compte « 1 et 2 et 3 et 4 et » (« one and two and… ») : les croches tombent sur le chiffre et sur le « et ».',
      'Le métronome ne clique que sur les temps : la deuxième croche tombe pile entre deux clics.'
    ],
    mode: 'rhythm',
    arrangement: 'rh',
    rh: C_RH,
    keyFifths: 0,
    rhythms: [
      [[1, 1, 1, 1], 2],
      [[0.5, 0.5, 1, 1, 1], 2],
      [[1, 0.5, 0.5, 1, 1], 2],
      [[1, 0.5, 0.5, 2], 2],
      [[0.5, 0.5, 0.5, 0.5, 2], 1],
      [[2, 0.5, 0.5, 1], 1]
    ],
    bars: 8,
    bpm: 60
  },
  {
    id: 'position-sol',
    number: 9,
    title: 'Position de G',
    goal: 'Même forme de main, nouvelle place sur le clavier.',
    setup: 'Main droite : pouce sur le G4 au-dessus du C central, jusqu’au D5. Main gauche : auriculaire sur le G2 juste sous le C3, jusqu’au D3.',
    theory: [
      'Pouce droit sur le G de la 2e ligne de la clé de sol. Auriculaire gauche sur le G de la ligne du bas de la clé de fa.',
      'Les intervalles ne changent pas : si tu lis par écarts, tu sais déjà jouer dans cette position.'
    ],
    mode: 'wait',
    arrangement: 'alternate',
    rh: { notes: [67, 69, 71, 72, 74], maxLeap: 2, home: 67 },
    lh: { notes: [43, 45, 47, 48, 50], maxLeap: 2, home: 43 },
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 8,
    placement: true
  },
  {
    id: 'sol-majeur',
    number: 10,
    title: 'G majeur et son F♯',
    goal: 'Lire l’armure et jouer le F dièse sans qu’il soit écrit devant la note.',
    setup: 'Main droite : pouce sur le D4 juste au-dessus du C central, majeur (3) sur le F♯ (touche noire). Main gauche en position de G.',
    theory: [
      'Le dièse (♯, sharp) monte une note d’un demi-ton (half step) : on joue la touche juste à droite. F♯ est la touche noire entre F et G.',
      'En G majeur (G major), l’armure (key signature : le ♯ écrit après la clé, sur la ligne du F) veut dire : tous les F sont dièses, même sans ♯ devant la note.',
      'C’est le piège classique : l’armure n’est écrite qu’en début de ligne. Prends l’habitude de la regarder avant de jouer.'
    ],
    mode: 'wait',
    arrangement: 'alternate',
    rh: { notes: [62, 64, 66, 67, 69], maxLeap: 2, home: 67 },
    lh: { notes: [43, 45, 47, 48, 50], maxLeap: 2, home: 43 },
    keyFifths: 1,
    rhythms: SIMPLE,
    bars: 8,
    placement: true
  },
  {
    id: 'fa-majeur',
    number: 11,
    title: 'F majeur et son B♭',
    goal: 'Lire une armure avec un bémol.',
    setup: 'Main droite : pouce sur le F4 au-dessus du C central, annulaire (4) sur le B♭. Main gauche : auriculaire sur le F2, pouce sur le C3.',
    theory: [
      'Le bémol (♭, flat) descend une note d’un demi-ton : on joue la touche juste à gauche. B♭ est la touche noire entre A et B.',
      'En F majeur (F major), l’armure a un ♭ sur la ligne du B : tous les B sont bémols.',
      'Comme pour le F♯, regarde l’armure avant de commencer et répète-toi « B bémol » dans la tête.'
    ],
    mode: 'wait',
    arrangement: 'alternate',
    rh: { notes: [65, 67, 69, 70, 72], maxLeap: 2, home: 65 },
    lh: { notes: [41, 43, 45, 46, 48], maxLeap: 2, home: 41 },
    keyFifths: -1,
    rhythms: SIMPLE,
    bars: 8,
    placement: true
  }
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** Every note a lesson can ask for. */
export function lessonNotes(l: Lesson): number[] {
  return [...(l.lh?.notes ?? []), ...(l.rh?.notes ?? [])].sort((a, b) => a - b);
}
