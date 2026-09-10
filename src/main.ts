import './styles.css';
import { mountPlayer } from './player';
import { renderGenerator, renderHome } from './views';
import type { GenScore } from './generator';
import type { Score } from './model';

const app = document.getElementById('app') as HTMLElement;

const state: { score: Score | null; ensure: ((untilBeat: number) => void) | null; title: string } = {
  score: null,
  ensure: null,
  title: ''
};

let cleanup: (() => void) | null = null;

function route(): void {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  app.innerHTML = '';

  if (location.hash === '#/play' && state.score) {
    cleanup = mountPlayer({
      root: app,
      title: state.title,
      score: state.score,
      ensure: state.ensure ?? undefined,
      onExit: () => {
        location.hash = '#/';
      }
    });
    return;
  }

  if (location.hash === '#/generate') {
    renderGenerator(app, (g: GenScore) => {
      state.score = g.score;
      state.ensure = g.ensure;
      state.title = g.score.title;
      location.hash = '#/play';
    });
    return;
  }

  location.hash = '#/';
  renderHome(app, {
    onScore: (s: Score) => {
      state.score = s;
      state.ensure = null;
      state.title = s.title;
      location.hash = '#/play';
    },
    onGenerate: () => {
      location.hash = '#/generate';
    }
  });
}

window.addEventListener('hashchange', route);
route();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}