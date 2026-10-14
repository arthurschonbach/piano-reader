import './styles.css';
import { mountPlayer } from './player';
import { describeScore, renderHome, type LibraryItem, type PracticeChoice } from './views';
import { keyLabel, makeExercise, type ExerciseConfig } from './generator';
import { loadStats, recordSession, saveStats, type PracticeStat } from './stats';
import { makeDemoScore } from './demo';
import type { Score } from './model';

const app = document.getElementById('app') as HTMLElement;
const STORE_KEY = 'piano-reader:library:v1';

type Session =
  | { kind: 'piece'; item: LibraryItem }
  | { kind: 'practice'; score: Score; ensure: (untilBeat: number) => void; choice: PracticeChoice; seed: number };

let items: LibraryItem[] = [{ id: 'built-in-twinkle', title: 'Twinkle Twinkle Little Star', detail: '8 bars · sample', score: makeDemoScore() }];
let session: Session | null = null;
let cleanup: (() => void) | null = null;
let stats: PracticeStat[] = loadStats();

const HAND_LABEL: Record<PracticeChoice['hands'], string> = { right: 'Right hand', left: 'Left hand', both: 'Both hands' };

function practiceMeta(choice: PracticeChoice): { key: string; label: string } {
  return {
    key: `${choice.hands}·${choice.level}·${choice.key}`,
    label: `${HAND_LABEL[choice.hands]} · Level ${choice.level} · ${keyLabel(choice.key)}`
  };
}

function loadLibrary(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { title: string; score: Score }[];
    if (!Array.isArray(parsed)) return;
    const restored: LibraryItem[] = [];
    for (const entry of parsed.slice(0, 30)) {
      if (!entry || typeof entry.title !== 'string' || !entry.score || !Array.isArray(entry.score.measures)) continue;
      entry.score.infinite = false;
      restored.push({
        id: `file-${entry.title}-${entry.score.measures.length}-${Math.random().toString(36).slice(2)}`,
        title: entry.title,
        detail: describeScore(entry.score),
        score: entry.score
      });
    }
    if (restored.length) items = [items[0], ...restored];
  } catch {
    // Corrupt or full storage: fall back to the built-in sample.
  }
}

function saveLibrary(): void {
  try {
    const user = items.filter((it) => !it.id.startsWith('built-in')).slice(0, 30);
    localStorage.setItem(STORE_KEY, JSON.stringify(user.map((it) => ({ title: it.title, score: it.score }))));
  } catch {
    // Quota exceeded or unavailable: library simply won't persist.
  }
}

function bpmForLevel(level: number): number {
  return level === 1 ? 60 : level === 2 ? 80 : 96;
}

function startPractice(choice: PracticeChoice): void {
  const seed = Math.floor(Math.random() * 1e9);
  const cfg: ExerciseConfig = { ...choice, bpm: bpmForLevel(choice.level), seed };
  const g = makeExercise(cfg);
  session = { kind: 'practice', score: g.score, ensure: g.ensure, choice, seed };
  location.hash = '#/play';
}

function showHome(): void {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  session = null;
  app.innerHTML = '';
  renderHome(app, items, stats, {
    onOpen: (it) => {
      session = { kind: 'piece', item: it };
      location.hash = '#/play';
    },
    onRemove: (it) => {
      items = items.filter((x) => x !== it);
      saveLibrary();
      showHome();
    },
    onImport: (score) => {
      const it: LibraryItem = { id: `file-${Date.now()}`, title: score.title, detail: describeScore(score), score };
      items = [...items, it];
      saveLibrary();
      session = { kind: 'piece', item: it };
      location.hash = '#/play';
    },
    onPractice: (choice) => startPractice(choice)
  });
}

function showPlayer(s: Session): void {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  app.innerHTML = '';
  if (s.kind === 'piece') {
    cleanup = mountPlayer({
      root: app,
      title: s.item.title,
      score: s.item.score,
      persistKey: `piece:${s.item.id}`,
      onExit: () => {
        location.hash = '#/';
      }
    });
  } else {
    const meta = practiceMeta(s.choice);
    cleanup = mountPlayer({
      root: app,
      title: s.score.title,
      score: s.score,
      ensure: s.ensure,
      practice: true,
      onExit: () => {
        location.hash = '#/';
      },
      onStats: (st) => {
        if (st.bars <= 0) return;
        stats = recordSession(stats, { key: meta.key, label: meta.label, bars: st.bars, tempo: st.topTempo });
        saveStats(stats);
      },
      onNew: () => {
        // Fresh page of the same exercise: same level, new material.
        const seed = Math.floor(Math.random() * 1e9);
        const cfg: ExerciseConfig = { ...s.choice, bpm: bpmForLevel(s.choice.level), seed };
        const g = makeExercise(cfg);
        session = { kind: 'practice', score: g.score, ensure: g.ensure, choice: s.choice, seed };
        showPlayer(session);
      }
    });
  }
}

function route(): void {
  if (location.hash === '#/play' && session) showPlayer(session);
  else {
    if (location.hash !== '#/') location.hash = '#/';
    showHome();
  }
}

loadLibrary();
window.addEventListener('hashchange', route);
route();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
