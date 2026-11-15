/**
 * The learning path, as plain data. Each lesson says what notes each hand may
 * use, how the hands are arranged, which rhythms appear and how it's judged.
 */

export type Mode = 'wait' | 'rhythm';
export type Arrangement = 'rh' | 'lh' | 'alternate' | 'together' | 'mirror' | 'flash';

/** Chord functions used by the accompaniments. */
export type Fn = 'I' | 'IV' | 'V';
/**
 * One bar of accompaniment: which notes of the chord (indexes in its voicing,
 * low to high) are struck together, and for how many beats.
 */
export type Pattern = [number[], number][];

/** Hands together: one hand has the melody, the other plays the chords. */
export interface Accomp {
  melody: 'rh' | 'lh';
  /** Voicing of each chord for the accompanying hand, low to high. */
  chords: Record<Fn, number[]>;
  /** Accompaniment patterns and their weights. */
  patterns: [Pattern, number][];
}

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
  /** Chord accompaniment (arrangement "together"): replaces lhRhythms. */
  accomp?: Accomp;
  /** Weight of each jump size (index = positions moved). */
  leapShape?: number[];
  bars: number;
  /** Target tempo for rhythm lessons. */
  bpm?: number;
  /** Part of the level test. */
  placement?: boolean;
  /** Mark piano and forte, two bars each. */
  dynamics?: boolean;
  /** Extra conditions on the touch (MIDI velocity) to pass. */
  touch?: TouchReq;
}

export interface TouchReq {
  /** Forte must be at least this much louder than piano (velocity units). */
  contrast?: number;
  /** The melody must be at least this much louder than the accompaniment. */
  balance?: number;
}

export const MASTERY = {
  wait: { accuracy: 0.95, medianReactionMs: 1500 },
  rhythm: { accuracy: 0.9, timingMs: 120, held: 0.8 },
  /** Piano/forte notes on the right side of the midpoint between the two. */
  dynamics: { accuracy: 0.85 },
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

/** Accompaniment patterns, for a three-note voicing. */
const P = {
  wholeChord: [[[0, 1, 2], 4]] as Pattern,
  halfChords: [[[0, 1, 2], 2], [[0, 1, 2], 2]] as Pattern,
  broken: [[[0], 1], [[1], 1], [[2], 1], [[1], 1]] as Pattern,
  brokenUp: [[[0], 1], [[1], 1], [[2], 2]] as Pattern,
  bassChordHalf: [[[0], 2], [[1, 2], 2]] as Pattern,
  bassChord: [[[0], 1], [[1, 2], 1], [[0], 1], [[1, 2], 1]] as Pattern,
  alberti: [0, 2, 1, 2, 0, 2, 1, 2].map((i): [number[], number] => [[i], 0.5]),
  albertiHalf: [[[0], 0.5], [[2], 0.5], [[1], 0.5], [[2], 0.5], [[0, 1, 2], 2]] as Pattern
};

/** The three main chords of C major, left hand: C-E-G, C-F-A, B-F-G. */
const C_LH_CHORDS: Record<Fn, number[]> = { I: [48, 52, 55], IV: [48, 53, 57], V: [47, 53, 55] };
const C_LH_CHORD_HAND: Hand = { notes: [47, 48, 52, 53, 55, 57], maxLeap: 5, home: 48 };
/** The same chords for the right hand, around middle C. */
const C_RH_CHORDS: Record<Fn, number[]> = { I: [60, 64, 67], IV: [60, 65, 69], V: [59, 65, 67] };
/** Melody over chords: a third or a fourth now and then, to reach the chord notes. */
const C_RH_MELODY: Hand = { ...C_RH, maxLeap: 3 };
const MELODY_SHAPE = [0.4, 3, 2, 0.8];

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
  },
  {
    id: 'mouvement-contraire',
    number: 12,
    title: 'Mouvement parallèle et contraire',
    goal: 'Les deux mains jouent en même temps, chacune sa note, au même rythme.',
    setup: 'Main droite : pouce sur le C central (C4). Main gauche : auriculaire sur le C3, pouce sur le G3.',
    theory: [
      'Jusqu’ici, une main jouait pendant que l’autre tenait une note. Maintenant les deux bougent sur chaque note : c’est le vrai jeu mains ensemble (hands together).',
      'Mouvement parallèle (parallel motion) : les deux mains montent ou descendent ensemble. Ici elles jouent les mêmes notes à une octave d’écart, mais avec des doigts différents (pouce à droite, auriculaire à gauche sur le C).',
      'Mouvement contraire (contrary motion) : une main monte pendant que l’autre descend, comme dans un miroir. Ici les deux mains utilisent alors les mêmes doigts : pouce avec pouce, index avec index.',
      'Le mouvement change toutes les deux mesures. Avant chaque paire de mesures, regarde si les deux portées vont dans le même sens ou en sens inverse : ça te dit comment jouer sans lire chaque note séparément.'
    ],
    mode: 'wait',
    arrangement: 'mirror',
    rh: C_RH,
    lh: C_LH,
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 8
  },
  {
    id: 'trois-accords',
    number: 13,
    title: 'Les trois accords de C majeur',
    goal: 'Mélodie à droite, accords plaqués à gauche : I, IV et V7.',
    setup: 'Main droite en position de C. Main gauche : auriculaire sur le C3, prêt à descendre sur le B2 juste en dessous.',
    theory: [
      'Un accord (chord), c’est trois notes ou plus jouées ensemble. Presque toute la musique simple en C majeur tient sur trois accords, numérotés selon leur place dans la gamme : I (C), IV (F) et V7 (G7).',
      'I = C-E-G (doigts 5-3-1). C’est l’accord de la maison : un morceau en C finit presque toujours dessus.',
      'IV = C-F-A (doigts 5-2-1). Le C reste en place, les deux notes du haut montent d’une touche.',
      'V7 = B-F-G (doigts 5-2-1). Depuis I, l’auriculaire descend d’une touche (C → B), l’index monte (E → F) et le pouce ne bouge pas. Ce sont les notes de G7 rangées autrement, pour que la main bouge le moins possible.',
      'Lis l’accord comme une forme : I est empilé de tierces (ligne-ligne-ligne ou interligne-interligne-interligne). IV et V7 ont deux notes collées en haut. La mélodie à droite tombe le plus souvent sur une note de l’accord aux temps 1 et 3.'
    ],
    mode: 'wait',
    arrangement: 'together',
    rh: C_RH_MELODY,
    lh: C_LH_CHORD_HAND,
    accomp: { melody: 'rh', chords: C_LH_CHORDS, patterns: [[P.wholeChord, 2], [P.halfChords, 2]] },
    leapShape: MELODY_SHAPE,
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 8
  },
  {
    id: 'accords-brises',
    number: 14,
    title: 'Accords brisés et basse-accord',
    goal: 'La main gauche bouge à chaque temps pendant que la droite chante.',
    setup: 'Comme en leçon 13 : main droite en position de C, main gauche sur les accords I, IV et V7.',
    theory: [
      'Accord brisé (broken chord) : au lieu de plaquer l’accord, la main gauche joue ses notes l’une après l’autre (bas, milieu, haut, milieu). Les doigts gardent la forme de l’accord : la main ne bouge pas.',
      'Basse-accord (« oom-pah ») : la note du bas seule, puis les deux du haut ensemble, en alternance. C’est l’accompagnement des valses et des chansons.',
      'La main gauche fait maintenant plus de notes que la droite. Laisse-la tourner presque toute seule : une fois l’accord trouvé, le motif est le même à chaque temps.',
      'Repère d’abord le changement d’accord en début de mesure, puis lis la mélodie à droite.'
    ],
    mode: 'wait',
    arrangement: 'together',
    rh: C_RH_MELODY,
    lh: C_LH_CHORD_HAND,
    accomp: {
      melody: 'rh',
      chords: C_LH_CHORDS,
      patterns: [[P.broken, 3], [P.brokenUp, 2], [P.bassChord, 3], [P.bassChordHalf, 2]]
    },
    leapShape: MELODY_SHAPE,
    keyFifths: 0,
    rhythms: [
      [[4], 1],
      [[2, 2], 3],
      [[2, 1, 1], 2],
      [[1, 1, 2], 2],
      [[1, 1, 1, 1], 1]
    ],
    bars: 8
  },
  {
    id: 'basse-alberti',
    number: 15,
    title: 'La basse d’Alberti',
    goal: 'L’accompagnement en croches de Mozart et Clementi : bas, haut, milieu, haut.',
    setup: 'Main droite en position de C. Main gauche sur les accords I, IV et V7, doigts posés sur les trois notes.',
    theory: [
      'La basse d’Alberti (Alberti bass) brise l’accord dans l’ordre bas, haut, milieu, haut, en croches (eighth notes). Pour I : C-G-E-G, doigts 5-1-3-1.',
      'Le pouce revient une note sur deux : c’est lui qui donne la régularité. Garde la main posée, seuls les doigts bougent.',
      'C’est l’accompagnement de la Sonate facile de Mozart et des sonatines de Clementi. Une fois en place, il devient un réflexe et libère l’attention pour la main droite.',
      'Ici la partition t’attend : prends le temps de placer chaque note de la main droite au bon endroit dans le motif de la gauche.'
    ],
    mode: 'wait',
    arrangement: 'together',
    rh: C_RH_MELODY,
    lh: C_LH_CHORD_HAND,
    accomp: { melody: 'rh', chords: C_LH_CHORDS, patterns: [[P.alberti, 4], [P.albertiHalf, 1]] },
    leapShape: MELODY_SHAPE,
    keyFifths: 0,
    rhythms: [
      [[4], 1],
      [[2, 2], 3],
      [[2, 1, 1], 2],
      [[1, 1, 2], 2]
    ],
    bars: 8
  },
  {
    id: 'melodie-main-gauche',
    number: 16,
    title: 'La mélodie à la main gauche',
    goal: 'Inverser les rôles : la gauche chante, la droite accompagne.',
    setup: 'Main gauche en position de C3 (auriculaire sur le C3). Main droite autour du C central, prête pour C-E-G, C-F-A et B-F-G.',
    theory: [
      'Les accords passent à la main droite, mêmes noms, même forme : I = C-E-G (1-3-5), IV = C-F-A (1-3-5), V7 = B-F-G (1-4-5).',
      'La mélodie est maintenant en clé de fa. C’est souvent là que la lecture ralentit : la main droite peut tenir son accord pendant que tu lis la gauche.',
      'Joue la main gauche un peu plus fort que la droite. La mélodie doit ressortir, même quand c’est la main faible qui la joue.'
    ],
    mode: 'wait',
    arrangement: 'together',
    rh: { notes: [59, 60, 64, 65, 67, 69], maxLeap: 5, home: 60 },
    lh: { ...C_LH, maxLeap: 3 },
    accomp: { melody: 'lh', chords: C_RH_CHORDS, patterns: [[P.wholeChord, 2], [P.halfChords, 3], [P.bassChordHalf, 1]] },
    leapShape: MELODY_SHAPE,
    keyFifths: 0,
    rhythms: SIMPLE,
    bars: 8
  },
  {
    id: 'independance-rythmique',
    number: 17,
    title: 'Deux rythmes en même temps',
    goal: 'Au tempo : croches et silences à droite, accords brisés réguliers à gauche.',
    setup: 'Main droite en position de C. Main gauche sur les accords I, IV et V7.',
    theory: [
      'Les deux mains n’ont plus le même rythme : la gauche avance en noires régulières, la droite joue des croches, des blanches et des silences par-dessus.',
      'Compte à voix haute « 1 et 2 et 3 et 4 et ». Les noires de la main gauche tombent sur les chiffres, et les croches de la droite tombent sur les chiffres et sur les « et ».',
      'Si une main se perd, ne t’arrête pas : la gauche continue, la droite rattrape au temps suivant. Baisse le tempo plutôt que de t’arrêter.'
    ],
    mode: 'rhythm',
    arrangement: 'together',
    rh: C_RH_MELODY,
    lh: C_LH_CHORD_HAND,
    accomp: { melody: 'rh', chords: C_LH_CHORDS, patterns: [[P.broken, 3], [P.bassChord, 3], [P.brokenUp, 1]] },
    leapShape: MELODY_SHAPE,
    keyFifths: 0,
    rhythms: [
      [[2, 2], 2],
      [[1, 1, 2], 2],
      [[0.5, 0.5, 1, 2], 2],
      [[1, 0.5, 0.5, 2], 2],
      [[2, 0.5, 0.5, 1], 1],
      [[1, -1, 2], 1],
      [[0.5, 0.5, 0.5, 0.5, 2], 1]
    ],
    bars: 8,
    bpm: 60
  },
  {
    id: 'alberti-au-tempo',
    number: 18,
    title: 'Alberti au tempo',
    goal: 'La basse d’Alberti en continu, sans attendre, sous une mélodie simple.',
    setup: 'Main droite en position de C. Main gauche sur les accords I, IV et V7.',
    theory: [
      'Même accompagnement qu’en leçon 15, mais la partition n’attend plus : les croches de la main gauche doivent rester parfaitement égales.',
      'La main droite joue peu de notes : des blanches et des noires. Elles tombent toujours en même temps qu’une note de la main gauche. Écoute si les deux mains sonnent vraiment ensemble.',
      'Commence lentement (50 bpm). Le tempo cible est 60.'
    ],
    mode: 'rhythm',
    arrangement: 'together',
    rh: C_RH_MELODY,
    lh: C_LH_CHORD_HAND,
    accomp: { melody: 'rh', chords: C_LH_CHORDS, patterns: [[P.alberti, 1]] },
    leapShape: MELODY_SHAPE,
    keyFifths: 0,
    rhythms: [
      [[4], 1],
      [[2, 2], 3],
      [[2, 1, 1], 2],
      [[1, 1, 2], 2]
    ],
    bars: 8,
    bpm: 60
  },
  {
    id: 'piano-forte',
    number: 19,
    title: 'Piano et forte',
    goal: 'Jouer doux, puis fort, sur commande : le piano mesure la force de chaque note.',
    setup: 'Main droite en position de C, pouce sur le C central. Sans pédale.',
    theory: [
      'Les nuances (dynamics) s’écrivent sous la portée : p (piano) = doux, f (forte) = fort. Elles valent jusqu’à la nuance suivante.',
      'Ton piano envoie la vitesse de chaque touche (velocity, de 1 à 127). L’app compare la moyenne de tes notes p à celle de tes notes f : il faut au moins 25 d’écart, et chaque note doit être du bon côté.',
      'Forte ne veut pas dire taper : laisse tomber le poids du bras dans la touche, poignet souple. Piano : doigts près des touches, enfonce-les lentement mais jusqu’au fond.',
      'Change de nuance dès la première note de la mesure marquée. Et tiens chaque note toute sa durée : l’app vérifie aussi quand tu relâches la touche.'
    ],
    mode: 'rhythm',
    arrangement: 'rh',
    rh: C_RH,
    keyFifths: 0,
    rhythms: [
      [[4], 1],
      [[2, 2], 3],
      [[2, 1, 1], 2],
      [[1, 1, 2], 2],
      [[1, 1, 1, 1], 2]
    ],
    bars: 8,
    bpm: 60,
    dynamics: true,
    touch: { contrast: 25 }
  },
  {
    id: 'melodie-chantante',
    number: 20,
    title: 'Faire chanter la mélodie',
    goal: 'Mélodie forte à droite, accompagnement doux à gauche, en même temps.',
    setup: 'Main droite en position de C. Main gauche sur les accords I, IV et V7.',
    theory: [
      'Dans presque toute la musique, la mélodie doit passer au-dessus de l’accompagnement. Les deux mains jouent donc à deux nuances différentes en même temps : c’est une des choses les plus difficiles au piano.',
      'Main droite : poids du bras, son plein. Main gauche : doigts légers, touches enfoncées sans appuyer.',
      'L’app compare la vitesse moyenne des deux mains : la mélodie doit être au moins 10 au-dessus de l’accompagnement.',
      'Un bon exercice avant de commencer : joue un accord de C à gauche très doucement, et un C à droite fort en même temps. Recommence jusqu’à entendre clairement la note du haut.'
    ],
    mode: 'rhythm',
    arrangement: 'together',
    rh: C_RH_MELODY,
    lh: C_LH_CHORD_HAND,
    accomp: { melody: 'rh', chords: C_LH_CHORDS, patterns: [[P.broken, 2], [P.bassChord, 2], [P.halfChords, 1]] },
    leapShape: MELODY_SHAPE,
    keyFifths: 0,
    rhythms: [
      [[4], 1],
      [[2, 2], 3],
      [[2, 1, 1], 2],
      [[1, 1, 2], 2]
    ],
    bars: 8,
    bpm: 60,
    touch: { balance: 10 }
  },
  {
    id: 'motifs',
    number: 21,
    title: 'Lire par motifs',
    goal: 'Au tempo, de C3 à C5 : repérer ce qui se répète au lieu de tout relire.',
    setup: 'Les mains se déplacent : doigtés libres. Main droite autour du C central, main gauche autour du C3.',
    theory: [
      'La musique se répète presque toujours. Les exercices sont maintenant construits comme de vraies phrases de 4 mesures : un motif (motif), puis ce motif répété, déplacé ou imité, puis une fin de phrase.',
      'Répétition : la mesure est identique à une mesure déjà jouée. Tu n’as rien à relire, rejoue-la.',
      'Séquence (sequence) : même forme, même rythme, mais une note plus haut ou plus bas. Lis seulement la première note, les doigts refont le même dessin.',
      'Imitation : l’autre main reprend le motif, une octave plus bas ou plus haut. Sur la portée, la forme est la même sur l’autre clé.',
      'Cadence (cadence) : la 4e mesure de chaque phrase finit sur une note plus longue. Au milieu, elle reste en suspens (sur G ou D). À la fin, elle se pose sur C.',
      'Pendant que tu joues une mesure, regarde la suivante et demande-toi : « nouveau, ou déjà vu ? ».'
    ],
    mode: 'rhythm',
    arrangement: 'alternate',
    rh: { notes: [60, 62, 64, 65, 67, 69, 71, 72], maxLeap: 3, home: 60 },
    lh: { notes: [48, 50, 52, 53, 55, 57, 59, 60], maxLeap: 3, home: 48 },
    leapShape: [0.3, 2, 2, 1.2],
    keyFifths: 0,
    rhythms: [
      [[2, 2], 2],
      [[2, 1, 1], 2],
      [[1, 1, 2], 3],
      [[1, 1, 1, 1], 2],
      [[1, 0.5, 0.5, 2], 1]
    ],
    bars: 16,
    bpm: 60
  }
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** Every note a lesson can ask for. */
export function lessonNotes(l: Lesson): number[] {
  return [...(l.lh?.notes ?? []), ...(l.rh?.notes ?? [])].sort((a, b) => a - b);
}
