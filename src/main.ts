import './styles.css';
import { lessonById, playable } from './curriculum/lessons';
import { createApp } from './ui/app';
import { renderExercise } from './ui/exercise';
import { renderHome } from './ui/home';

const root = document.getElementById('app') as HTMLElement;
const app = createApp();
let cleanup: (() => void) | null = null;

function route(): void {
  cleanup?.();
  cleanup = null;
  root.innerHTML = '';
  const m = /^#\/lecon\/([\w-]+)/.exec(location.hash);
  const lesson = m ? lessonById(m[1]) : undefined;
  if (lesson && playable(lesson)) cleanup = renderExercise(root, app, lesson);
  else {
    if (location.hash !== '#/' && location.hash !== '') history.replaceState(null, '', '#/');
    cleanup = renderHome(root, app);
  }
}

window.addEventListener('hashchange', route);
route();
void app.midi.restore();
