import './styles.css';
import { lessonById } from './curriculum/lessons';
import { playDrill, playLesson } from './ui/activities';
import { drillById } from './curriculum/technique';
import { renderTechnique } from './ui/technique';
import { renderEar } from './ui/ear';
import { createApp } from './ui/app';
import { renderHome } from './ui/home';
import { renderLibrary, renderPiece } from './ui/library';
import { renderGlossary } from './ui/glossary';
import { renderPieceLoop, renderPieceStage, renderPlacement, renderProgress, renderSession, renderSettings } from './ui/screens';

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
  } else if ((m = /^#\/morceau\/([\w-]+)\/boucle$/.exec(hash))) {
    cleanup = renderPieceLoop(root, app, m[1]);
  } else if ((m = /^#\/morceau\/([\w-]+)\/(\d+)$/.exec(hash))) {
    cleanup = renderPieceStage(root, app, m[1], Number(m[2]));
  } else if ((m = /^#\/morceau\/([\w-]+)$/.exec(hash))) {
    cleanup = renderPiece(root, app, m[1]);
  } else if ((m = /^#\/technique\/([\w-]+)$/.exec(hash)) && drillById(m[1])) {
    cleanup = playDrill(root, app, drillById(m[1])!, { onExit: () => app.go('#/technique') });
  } else if (hash === '#/oreille') {
    cleanup = renderEar(root, app, { onExit: home, again: () => app.refresh() });
  } else if (hash === '#/technique') {
    cleanup = renderTechnique(root, app);
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
