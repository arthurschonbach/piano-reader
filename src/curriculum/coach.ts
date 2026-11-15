/**
 * The "teacher" logic: what counts as success, what to work on next,
 * what goes into today's session. Pure functions over progress.
 */
import { LESSONS, MASTERY, lessonNotes, type Hand, type Lesson } from './lessons';
import { PIECES, PIECE_STAGES, type Piece } from './pieces';
import { dayKey, pieceDue, type Progress, type SessionMetrics } from '../progress/store';

export function passes(mode: 'wait' | 'rhythm', m: SessionMetrics, targetBpm?: number): boolean {
  if (m.assisted) return false;
  if (mode === 'wait') return m.accuracy >= MASTERY.wait.accuracy && (m.medianReactionMs ?? Infinity) <= MASTERY.wait.medianReactionMs;
  const fastEnough = !targetBpm || (m.tempo ?? 0) >= targetBpm - 0.5;
  return fastEnough && m.accuracy >= MASTERY.rhythm.accuracy && (m.timingMs ?? Infinity) <= MASTERY.rhythm.timingMs;
}

export function lessonDone(p: Progress, l: Lesson): boolean {
  const r = p.lessons[l.id];
  return !!r && (r.mastered || !!r.acquired);
}

/** First lesson neither mastered nor passed in the level test. */
export function currentLesson(p: Progress): Lesson | null {
  return LESSONS.find((l) => !lessonDone(p, l)) ?? null;
}

/** Lessons done, least recently played first: candidates for a review. */
export function reviewLesson(p: Progress, exclude?: string): Lesson | null {
  const done = LESSONS.filter((l) => lessonDone(p, l) && l.id !== exclude);
  if (!done.length) return null;
  const last = (l: Lesson) => p.lessons[l.id]?.sessions.at(-1)?.date ?? 0;
  return [...done].sort((a, b) => last(a) - last(b))[0];
}

/** Notes the learner is expected to read by now (done lessons + current). */
export function knownHands(p: Progress): { rh: number[]; lh: number[] } {
  const cur = currentLesson(p);
  const pool = LESSONS.filter((l) => lessonDone(p, l) || l === cur);
  const rh = new Set<number>();
  const lh = new Set<number>();
  for (const l of pool) {
    l.rh?.notes.forEach((m) => rh.add(m));
    l.lh?.notes.forEach((m) => lh.add(m));
  }
  // Natural notes only, so a flash card never needs a key signature.
  const nat = (m: number) => ![1, 3, 6, 8, 10].includes(m % 12);
  return { rh: [...rh].filter(nat).sort((a, b) => a - b), lh: [...lh].filter(nat).sort((a, b) => a - b) };
}

/** Warm-up: random single notes from what's known, weak ones more often. */
export function flashLesson(p: Progress): Lesson {
  const k = knownHands(p);
  const hand = (notes: number[]): Hand | undefined => (notes.length ? { notes, maxLeap: notes.length } : undefined);
  return {
    id: 'echauffement',
    number: 0,
    title: 'Échauffement lecture',
    goal: 'Des notes au hasard parmi celles que tu connais. Réponds vite, sans compter les lignes.',
    theory: [],
    mode: 'wait',
    arrangement: 'flash',
    rh: hand(k.rh.length ? k.rh : [60, 62, 64, 65, 67]),
    lh: hand(k.lh),
    keyFifths: 0,
    rhythms: [[[1, 1, 1, 1], 1]],
    bars: 4
  };
}

/**
 * Sight-reading material: one step easier than what's being learnt, played
 * once, at tempo, without stopping.
 */
export function sightReadingLesson(p: Progress): Lesson {
  const cur = currentLesson(p);
  const idx = cur ? LESSONS.indexOf(cur) : LESSONS.length;
  const reading = LESSONS.slice(0, Math.max(1, idx)).filter((l) => l.mode === 'wait' && l.arrangement !== 'together');
  const base = reading.length ? reading[reading.length - 1] : LESSONS[0];
  return {
    ...base,
    id: 'lecture-a-vue',
    number: 0,
    title: 'Lecture à vue',
    goal: `Joue d’un bout à l’autre sans t’arrêter, même après une erreur (niveau : ${base.title}).`,
    theory: [
      'Ne t’arrête jamais : si tu rates une note, laisse-la et rattrape la suivante.',
      'Garde les yeux sur la partition, un peu en avance sur ce que tu joues.'
    ],
    mode: 'rhythm',
    bpm: 60,
    rhythms: [
      [[4], 1],
      [[2, 2], 2],
      [[2, 1, 1], 1],
      [[1, 1, 2], 1]
    ]
  };
}

/** Piece being learnt (first started and not learnt, else the easiest new one). */
export function currentPiece(p: Progress): Piece | null {
  const n = PIECE_STAGES.length;
  const started = PIECES.find((pc) => {
    const r = p.pieces[pc.id];
    return r && r.stage > 0 && r.stage < n;
  });
  if (started) return started;
  return PIECES.find((pc) => (p.pieces[pc.id]?.stage ?? 0) < n) ?? null;
}

export function duePieces(p: Progress, now = Date.now()): Piece[] {
  return PIECES.filter((pc) => pieceDue(p.pieces[pc.id], PIECE_STAGES.length, now));
}

export type Activity =
  | { kind: 'flash'; label: string }
  | { kind: 'sight'; label: string }
  | { kind: 'lesson'; label: string; lessonId: string; review: boolean }
  | { kind: 'piece'; label: string; pieceId: string; stage: number; review: boolean };

/**
 * Today's session (~20–25 min): warm-up, sight-reading, the lesson in progress,
 * then the piece in progress, and spaced reviews when due.
 */
export function dailyPlan(p: Progress, now = Date.now()): Activity[] {
  const out: Activity[] = [{ kind: 'flash', label: 'Échauffement lecture' }];
  const cur = currentLesson(p);
  if (cur && LESSONS.indexOf(cur) >= 1) out.push({ kind: 'sight', label: 'Lecture à vue' });
  if (cur) out.push({ kind: 'lesson', label: `Leçon ${cur.number} · ${cur.title}`, lessonId: cur.id, review: false });
  const rev = reviewLesson(p, cur?.id);
  if (rev && dayKey(now) !== dayKey(p.lessons[rev.id]?.sessions.at(-1)?.date ?? 0)) {
    out.push({ kind: 'lesson', label: `Révision · ${rev.title}`, lessonId: rev.id, review: true });
  }
  for (const pc of duePieces(p, now).slice(0, 2)) {
    out.push({ kind: 'piece', label: `Révision · ${pc.title}`, pieceId: pc.id, stage: PIECE_STAGES.length - 1, review: true });
  }
  const piece = currentPiece(p);
  if (piece) {
    const stage = p.pieces[piece.id]?.stage ?? 0;
    out.push({ kind: 'piece', label: `${piece.title} · ${PIECE_STAGES[stage].label}`, pieceId: piece.id, stage, review: false });
  }
  return out;
}

/** Level test: short blocks taken from the reading lessons, easiest first. */
export function placementLessons(): Lesson[] {
  return LESSONS.filter((l) => l.placement);
}

/** A test block passes with few mistakes and little hesitation. */
export function blockPasses(clean: number, total: number, medianReactionMs: number): boolean {
  return total > 0 && clean / total >= 0.8 && medianReactionMs <= 2500;
}

export { lessonNotes };
