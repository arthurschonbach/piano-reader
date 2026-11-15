import { MASTERY } from '../curriculum/lessons';
import type { StepResult, Summary } from '../exercise/wait';

export interface NoteStat {
  attempts: number;
  clean: number;
  /** Recent difficulty 0..1 (moving average): 0 = right and fast, 1 = wrong. */
  difficulty: number;
}

export interface SessionRecord {
  date: number;
  accuracy: number;
  medianReactionMs: number;
  /** Note names were shown: the session doesn't count toward mastery. */
  assisted: boolean;
  validated: boolean;
}

export interface LessonRecord {
  sessions: SessionRecord[];
  mastered: boolean;
}

export interface Progress {
  version: 2;
  notes: Record<string, NoteStat>;
  /** "expected>played" → count */
  confusions: Record<string, number>;
  lessons: Record<string, LessonRecord>;
}

export const emptyProgress = (): Progress => ({ version: 2, notes: {}, confusions: {}, lessons: {} });

const KEEP_SESSIONS = 60;
const SLOW_MS = 2000;

function dayOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Distinct days with a validated session. */
export function validatedDays(rec: LessonRecord | undefined): number {
  if (!rec) return 0;
  return new Set(rec.sessions.filter((s) => s.validated).map((s) => dayOf(s.date))).size;
}

export interface Recorded {
  progress: Progress;
  validated: boolean;
  newlyMastered: boolean;
}

/** Fold one finished session into progress. Pure. */
export function recordSession(
  prev: Progress,
  lessonId: string,
  results: StepResult[],
  summary: Summary,
  assisted: boolean,
  now = Date.now()
): Recorded {
  const p: Progress = structuredClone(prev);
  for (const r of results) {
    for (const m of r.expected) {
      const s = (p.notes[m] ??= { attempts: 0, clean: 0, difficulty: 0.3 });
      s.attempts++;
      const ok = r.wrong.length === 0;
      if (ok) s.clean++;
      const d = !ok ? 1 : r.reactionMs > SLOW_MS ? 0.5 : 0;
      s.difficulty = s.difficulty * 0.8 + d * 0.2;
    }
  }
  for (const [e, pl, n] of summary.confusions) p.confusions[`${e}>${pl}`] = (p.confusions[`${e}>${pl}`] ?? 0) + n;

  const validated =
    !assisted && summary.steps > 0 &&
    summary.accuracy >= MASTERY.accuracy &&
    summary.medianReactionMs <= MASTERY.medianReactionMs;
  const rec = (p.lessons[lessonId] ??= { sessions: [], mastered: false });
  const wasMastered = rec.mastered;
  rec.sessions.push({ date: now, accuracy: summary.accuracy, medianReactionMs: summary.medianReactionMs, assisted, validated });
  rec.sessions = rec.sessions.slice(-KEEP_SESSIONS);
  if (validatedDays(rec) >= MASTERY.days) rec.mastered = true;
  return { progress: p, validated, newlyMastered: rec.mastered && !wasMastered };
}

/** Difficulty per note, for the generator. */
export function weaknessMap(p: Progress): Map<number, number> {
  const m = new Map<number, number>();
  for (const [k, s] of Object.entries(p.notes)) m.set(Number(k), s.difficulty);
  return m;
}

/** Notes that need work most, hardest first. */
export function weakestNotes(p: Progress, limit = 3): { midi: number; stat: NoteStat }[] {
  return Object.entries(p.notes)
    .map(([k, stat]) => ({ midi: Number(k), stat }))
    .filter((x) => x.stat.attempts >= 5 && x.stat.difficulty > 0.15)
    .sort((a, b) => b.stat.difficulty - a.stat.difficulty)
    .slice(0, limit);
}

const STORE_KEY = 'piano-reader:progress:v2';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw) as Progress;
    if (!p || p.version !== 2) return emptyProgress();
    return { ...emptyProgress(), ...p };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // storage full or blocked: progress for this session is lost, the app still works
  }
}
