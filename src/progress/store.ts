/**
 * Everything the app remembers about the learner. Pure functions on a plain
 * object, saved to localStorage.
 */

export interface NoteStat {
  attempts: number;
  clean: number;
  /** Recent difficulty 0..1 (moving average): 0 = right and fluent, 1 = wrong. */
  difficulty: number;
}

export interface SessionRecord {
  date: number;
  mode: 'wait' | 'rhythm';
  accuracy: number;
  medianReactionMs?: number;
  timingMs?: number;
  tempo?: number;
  /** Note names were shown: doesn't count toward mastery. */
  assisted: boolean;
  validated: boolean;
}

export interface LessonRecord {
  sessions: SessionRecord[];
  mastered: boolean;
  /** Passed in the level test. */
  acquired?: boolean;
}

export interface PieceRecord {
  /** Index of the next stage to work on (PIECE_STAGES); = length when learnt. */
  stage: number;
  /** Validated stage ids, with the day. */
  stagesDone: Record<string, string>;
  /** Spaced review: interval in days and next due day, once learnt. */
  interval?: number;
  due?: string;
  reviews: number;
  sessions: SessionRecord[];
}

export interface DrillRecord {
  /** Tempo to play at next. */
  bpm: number;
  /** Fastest clean run. */
  best: number;
  /** Day the goal tempo was first reached cleanly. */
  reached?: string;
  sessions: SessionRecord[];
}

export interface EarRecord {
  level: number;
  sessions: { date: number; level: number; clean: number; total: number }[];
}

export interface Progress {
  version: 3;
  notes: Record<string, NoteStat>;
  /** "expected>played" → count */
  confusions: Record<string, number>;
  lessons: Record<string, LessonRecord>;
  pieces: Record<string, PieceRecord>;
  /** Technique drills, by id. */
  technique: Record<string, DrillRecord>;
  /** Ear training: current level and past sessions. */
  ear: EarRecord;
  /** Days with practice, "YYYY-MM-DD". */
  days: string[];
  placement?: { date: number; passed: string[]; stoppedAt: string | null };
  /** Welcome screen answered. */
  onboarded: boolean;
  /** Piece chosen in the library as the one being learnt. */
  focusPiece?: string;
}

export const emptyProgress = (): Progress => ({
  version: 3,
  notes: {},
  confusions: {},
  lessons: {},
  pieces: {},
  technique: {},
  ear: { level: 1, sessions: [] },
  days: [],
  onboarded: false
});

const KEEP_SESSIONS = 60;

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n, 12).getTime());
}

/** One note asked during a session, and how it went. */
export interface NoteAttempt {
  midi: number;
  clean: boolean;
  /** Right, but hesitant (slow in wait mode, off-beat in rhythm mode). */
  slow: boolean;
}

/** What any finished activity reports. */
export interface SessionMetrics {
  mode: 'wait' | 'rhythm';
  accuracy: number;
  medianReactionMs?: number;
  timingMs?: number;
  tempo?: number;
  attempts: NoteAttempt[];
  /** [expected, played, count] */
  confusions: [number, number, number][];
  assisted: boolean;
  /** Rhythm mode with a MIDI piano: share of notes held their full length. */
  held?: number;
  /** Dynamics: forte − piano velocity, and notes on the right side. */
  contrast?: number;
  dynAccuracy?: number;
  /** Melody − accompaniment velocity. */
  balance?: number;
}

/** Fold per-note results and confusions in, and mark today as practised. */
export function recordPractice(prev: Progress, m: SessionMetrics, now = Date.now()): Progress {
  const p: Progress = structuredClone(prev);
  for (const a of m.attempts) {
    const s = (p.notes[a.midi] ??= { attempts: 0, clean: 0, difficulty: 0.3 });
    s.attempts++;
    if (a.clean) s.clean++;
    const d = !a.clean ? 1 : a.slow ? 0.5 : 0;
    s.difficulty = s.difficulty * 0.8 + d * 0.2;
  }
  for (const [e, pl, n] of m.confusions) p.confusions[`${e}>${pl}`] = (p.confusions[`${e}>${pl}`] ?? 0) + n;
  const today = dayKey(now);
  if (!p.days.includes(today)) p.days = [...p.days, today].slice(-400);
  p.onboarded = true;
  return p;
}

const toRecord = (m: SessionMetrics, validated: boolean, now: number): SessionRecord => ({
  date: now,
  mode: m.mode,
  accuracy: m.accuracy,
  medianReactionMs: m.medianReactionMs,
  timingMs: m.timingMs,
  tempo: m.tempo,
  assisted: m.assisted,
  validated
});

/** Distinct days with a validated session. */
export function validatedDays(rec: { sessions: SessionRecord[] } | undefined): number {
  if (!rec) return 0;
  return new Set(rec.sessions.filter((s) => s.validated).map((s) => dayKey(s.date))).size;
}

export interface LessonRecorded {
  progress: Progress;
  newlyMastered: boolean;
}

export function recordLesson(prev: Progress, lessonId: string, m: SessionMetrics, validated: boolean, daysNeeded: number, now = Date.now()): LessonRecorded {
  const p = recordPractice(prev, m, now);
  const rec = (p.lessons[lessonId] ??= { sessions: [], mastered: false });
  const was = rec.mastered;
  rec.sessions = [...rec.sessions, toRecord(m, validated, now)].slice(-KEEP_SESSIONS);
  if (validatedDays(rec) >= daysNeeded) rec.mastered = true;
  return { progress: p, newlyMastered: rec.mastered && !was };
}

/** Spaced review intervals for learnt pieces, in days. */
export const REVIEW_STEPS = [1, 3, 7, 14, 30];

export interface PieceRecorded {
  progress: Progress;
  /** The stage was validated and the piece moved on. */
  advanced: boolean;
  /** The last stage was just validated. */
  learnt: boolean;
}

export const emptyPiece = (): PieceRecord => ({ stage: 0, stagesDone: {}, reviews: 0, sessions: [] });

/**
 * Record work on one stage of a piece. Validating the current stage unlocks
 * the next; once all are done the piece enters spaced review (last stage).
 */
export function recordPiece(
  prev: Progress,
  pieceId: string,
  stageIndex: number,
  stageId: string,
  stageCount: number,
  m: SessionMetrics,
  validated: boolean,
  now = Date.now()
): PieceRecorded {
  const p = recordPractice(prev, m, now);
  const rec = (p.pieces[pieceId] ??= emptyPiece());
  rec.sessions = [...rec.sessions, toRecord(m, validated, now)].slice(-KEEP_SESSIONS);
  const today = dayKey(now);
  const learntBefore = rec.stage >= stageCount;
  let advanced = false;
  let learnt = false;
  if (learntBefore) {
    // Review: success pushes the next one further, failure brings it back to tomorrow.
    if (validated) {
      rec.reviews++;
      rec.interval = REVIEW_STEPS[Math.min(REVIEW_STEPS.length - 1, rec.reviews)];
    } else {
      rec.reviews = 0;
      rec.interval = 1;
    }
    rec.due = addDays(today, rec.interval);
  } else if (validated && stageIndex === rec.stage) {
    rec.stagesDone[stageId] = today;
    rec.stage++;
    advanced = true;
    if (rec.stage >= stageCount) {
      learnt = true;
      rec.reviews = 0;
      rec.interval = REVIEW_STEPS[0];
      rec.due = addDays(today, rec.interval);
    }
  }
  return { progress: p, advanced, learnt };
}

export interface DrillRecorded {
  progress: Progress;
  /** New tempo after a clean run at (or above) the current one. */
  raisedTo?: number;
  /** The goal tempo was reached for the first time. */
  reachedNow: boolean;
}

/**
 * Record a run of a technique drill. A clean run at the current tempo or
 * faster moves the tempo up one step, up to the goal; anything else keeps it.
 */
export function recordDrill(
  prev: Progress,
  id: string,
  m: SessionMetrics,
  clean: boolean,
  played: number,
  start: number,
  goal: number,
  step: number,
  now = Date.now()
): DrillRecorded {
  const p = recordPractice(prev, m, now);
  const rec = (p.technique[id] ??= { bpm: start, best: 0, sessions: [] });
  rec.sessions = [...rec.sessions, toRecord(m, clean, now)].slice(-KEEP_SESSIONS);
  let raisedTo: number | undefined;
  let reachedNow = false;
  if (clean && played >= rec.bpm - 0.5) {
    rec.best = Math.max(rec.best, played);
    const next = Math.min(goal, played + step);
    if (next > rec.bpm) raisedTo = rec.bpm = next;
    if (played >= goal - 0.5 && !rec.reached) {
      rec.reached = dayKey(now);
      reachedNow = true;
    }
  }
  return { progress: p, raisedTo, reachedNow };
}

/** Record an ear session and move the level up or down. */
export function recordEar(prev: Progress, clean: number, total: number, nextLevel: number, now = Date.now()): Progress {
  const p = recordPractice(prev, { mode: 'wait', accuracy: total ? clean / total : 0, attempts: [], confusions: [], assisted: false }, now);
  p.ear = { level: nextLevel, sessions: [...p.ear.sessions, { date: now, level: p.ear.level, clean, total }].slice(-KEEP_SESSIONS) };
  return p;
}

export function pieceDue(rec: PieceRecord | undefined, stageCount: number, now = Date.now()): boolean {
  return !!rec && rec.stage >= stageCount && !!rec.due && rec.due <= dayKey(now);
}

/** Consecutive practice days ending today (or yesterday, if today isn't done yet). */
export function streak(p: Progress, now = Date.now()): number {
  const days = new Set(p.days);
  let d = dayKey(now);
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function practisedToday(p: Progress, now = Date.now()): boolean {
  return p.days.includes(dayKey(now));
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

export function recordPlacement(prev: Progress, passed: string[], stoppedAt: string | null, now = Date.now()): Progress {
  const p: Progress = structuredClone(prev);
  for (const id of passed) {
    const rec = (p.lessons[id] ??= { sessions: [], mastered: false });
    rec.acquired = true;
  }
  p.placement = { date: now, passed, stoppedAt };
  p.onboarded = true;
  return p;
}

/** Bring older saved data up to the current shape. */
export function migrate(raw: unknown): Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Progress> & { version?: number };
  if (r.version === 3) {
    // Fields added after version 3 shipped: fill them in when missing.
    const p = { ...base, ...r } as Progress;
    p.technique ??= {};
    p.ear ??= { level: 1, sessions: [] };
    return p;
  }
  if (r.version === 2) {
    const lessons: Record<string, LessonRecord> = {};
    const days = new Set<string>();
    for (const [id, rec] of Object.entries((r.lessons ?? {}) as Record<string, LessonRecord>)) {
      lessons[id] = { ...rec, sessions: rec.sessions.map((s) => ({ ...s, mode: s.mode ?? 'wait' })) };
      for (const s of rec.sessions) days.add(dayKey(s.date));
    }
    return { ...base, notes: r.notes ?? {}, confusions: r.confusions ?? {}, lessons, days: [...days].sort(), onboarded: days.size > 0 };
  }
  return base;
}

const STORE_KEY = 'piano-reader:progress:v3';
const OLD_KEY = 'piano-reader:progress:v2';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORE_KEY) ?? localStorage.getItem(OLD_KEY);
    return raw ? migrate(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // storage full or blocked: the app still works, progress isn't kept
  }
}

/** Compact text to move progress between the phone and the iPad. */
export function exportProgress(p: Progress): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(p))));
}

export function importProgress(code: string): Progress | null {
  try {
    const p = migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
    return p.version === 3 ? p : null;
  } catch {
    return null;
  }
}
