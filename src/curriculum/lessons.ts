/** The reading path, as plain data. Only lessons with `notes` are playable yet. */
export interface Lesson {
  id: string;
  number: number;
  title: string;
  /** What you learn, one sentence. */
  goal: string;
  /** Shown before starting: where to put the hand. */
  setup?: string;
  clef?: 'G' | 'F';
  /** MIDI notes the exercise may use, low to high. */
  notes?: number[];
  /** Largest jump between two notes, counted in positions inside `notes`. */
  maxLeap?: number;
  /** Bar rhythms in 4/4 (quarter = 1). */
  rhythms?: [number[], number][];
  bars?: number;
  /** Ending note, to give the phrase a resting point. */
  home?: number;
}

/** A session validates the lesson when both thresholds are met. */
export const MASTERY = { accuracy: 0.95, medianReactionMs: 1500, days: 2 };

export const LESSONS: Lesson[] = [
  {
    id: 'do-main-droite',
    number: 1,
    title: 'Position de Do · main droite',
    goal: 'Lire Do, Ré, Mi, Fa, Sol en clé de sol, sans compter les lignes.',
    setup: 'Pouce droit sur le Do du milieu du clavier, un doigt par touche jusqu’au Sol (doigts 1 à 5).',
    clef: 'G',
    notes: [60, 62, 64, 65, 67],
    maxLeap: 2,
    rhythms: [
      [[4], 1],
      [[2, 2], 2],
      [[2, 1, 1], 2],
      [[1, 1, 2], 2],
      [[1, 2, 1], 1],
      [[1, 1, 1, 1], 4]
    ],
    bars: 8,
    home: 60
  },
  { id: 'do-main-gauche', number: 2, title: 'Position de Do · main gauche', goal: 'Lire Do, Ré, Mi, Fa, Sol en clé de fa.' },
  { id: 'intervalles', number: 3, title: 'Lire par intervalles', goal: 'Reconnaître une seconde, une tierce, une quarte à leur forme.' },
  { id: 'reperes', number: 4, title: 'Notes repères et nouvelles positions', goal: 'Sortir des cinq doigts : position de Sol, de Fa, notes repères.' },
  { id: 'deux-mains', number: 5, title: 'Les deux mains', goal: 'Alterner, puis jouer ensemble des lignes simples.' },
  { id: 'rythme', number: 6, title: 'Rythme', goal: 'Croches et notes pointées, avec un tempo imposé.' },
  { id: 'alterations', number: 7, title: 'Altérations', goal: 'Lire en Sol majeur et en Fa majeur.' }
];

export function playable(l: Lesson): boolean {
  return !!l.notes?.length && !!l.rhythms?.length;
}

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
