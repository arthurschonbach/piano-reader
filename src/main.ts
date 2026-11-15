import './styles.css';
import { lessonById } from './curriculum/lessons';
import { playLesson } from './ui/activities';
import { createApp } from './ui/app';
import { renderHome } from './ui/home';
import { renderLibrary, renderPiece } from './ui/library';
import { renderGlossary } from './ui/glossary';
import { renderPieceStage, renderPlacement, renderProgress, renderSession, renderSettings } from './ui/screens';

const root = document.getElementById('app') as HTMLElement;
const app = createApp();
let cleanup: (() => void) | null = null;

function route(): void {
  cleanup?.();
  cleanup = null;
  root.innerHTML = '';
  window.scrollTo(0, 0);
  const hash = location.hash.replace(/\?.*$/, '');
  const home = () => app.go('#/');
  let m: RegExpExecArray | null;
  if ((m = /^#\/lecon\/([\w-]+)$/.exec(hash)) && lessonById(m[1])) {
    cleanup = playLesson(root, app, lessonById(m[1])!, { onExit: home });
  } else if ((m = /^#\/morceau\/([\w-]+)\/(\d+)$/.exec(hash))) {
    cleanup = renderPieceStage(root, app, m[1], Number(m[2]));
  } else if ((m = /^#\/morceau\/([\w-]+)$/.exec(hash))) {
    cleanup = renderPiece(root, app, m[1]);
  } else if (hash === '#/bibliotheque') {
    cleanup = renderLibrary(root, app);
  } else if (hash === '#/lexique') {
    cleanup = renderGlossary(root, app);
  } else if (hash === '#/seance') {
    cleanup = renderSession(root, app);
  } else if (hash === '#/test') {
    cleanup = renderPlacement(root, app);
  } else if (hash === '#/progres') {
    cleanup = renderProgress(root, app);
  } else if (hash === '#/reglages') {
    cleanup = renderSettings(root, app);
  } else {
    if (hash !== '#/' && hash !== '') history.replaceState(null, '', '#/');
    cleanup = renderHome(root, app);
  }
}

window.addEventListener('hashchange', route);
route();
void app.midi.restore();
