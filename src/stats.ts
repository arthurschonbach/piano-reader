/** Practice progress: what the learner actually did, across sessions. */

export interface PracticeStat {
  key: string;
  label: string;
  sessions: number;
  bars: number;
  topTempo: number;
  lastPlayed: number;
}

export interface SessionEntry {
  key: string;
  label: string;
  bars: number;
  tempo: number;
  now?: number;
}

const MAX_ENTRIES = 12;

/** Merge one finished session into the list. Pure — safe to unit test. */
export function recordSession(list: PracticeStat[], entry: SessionEntry): PracticeStat[] {
  const now = entry.now ?? Date.now();
  const bars = Math.max(0, Math.round(entry.bars));
  const tempo = Math.max(0, Math.round(entry.tempo));
  const next = list.map((s) => ({ ...s }));
  const found = next.find((s) => s.key === entry.key);
  if (found) {
    found.sessions += 1;
    found.bars += bars;
    found.topTempo = Math.max(found.topTempo, tempo);
    found.lastPlayed = now;
  } else {
    next.push({ key: entry.key, label: entry.label, sessions: 1, bars, topTempo: tempo, lastPlayed: now });
  }
  next.sort((a, b) => b.lastPlayed - a.lastPlayed);
  return next.slice(0, MAX_ENTRIES);
}

const STORE_KEY = 'piano-reader:practice:v1';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadStats(): PracticeStat[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PracticeStat[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.key === 'string' && typeof s.label === 'string')
      .map((s) => ({
        key: s.key,
        label: s.label,
        sessions: Math.max(0, s.sessions | 0),
        bars: Math.max(0, s.bars | 0),
        topTempo: Math.max(0, s.topTempo | 0),
        lastPlayed: s.lastPlayed | 0
      }))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveStats(list: PracticeStat[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // progress is a nicety, not a requirement
  }
}
