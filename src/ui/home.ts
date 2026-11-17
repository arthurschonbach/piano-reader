import { currentLesson, currentPiece, dailyPlan, lessonDone, type Activity } from '../curriculum/coach';
import { LESSONS, MASTERY } from '../curriculum/lessons';
import { PIECE_STAGES, PIECES } from '../curriculum/pieces';
import { DRILLS } from '../curriculum/technique';
import { EAR_LEVELS } from '../curriculum/ear';
import type { MidiStatus } from '../input/midi';
import { practisedToday, streak, validatedDays, weakestNotes } from '../progress/store';
import type { App } from './app';
import { button, h, navDock, percent, themeButton, topBar } from './dom';
import { nameOf } from './player';

function pianoStatus(app: App, s: MidiStatus, el: HTMLElement): void {
  el.innerHTML = '';
  el.dataset.state = s.state === 'ready' ? (s.devices.length ? 'connected' : 'empty') : s.state;
  const text = h('span', 'ps-text');
  el.append(h('span', 'ps-dot'), text);
  switch (s.state) {
    case 'unsupported':
      text.textContent = 'Pas de MIDI dans ce navigateur : clavier à l’écran. Sur iPad, ouvre le site dans MIDIWeb Browser.';
      break;
    case 'idle':
      text.textContent = 'Piano non connecté.';
      el.append(button('Connecter le piano', 'btn primary small', () => void app.midi.request()));
      break;
    case 'asking':
      text.textContent = 'Accepte l’accès aux appareils MIDI…';
      break;
    case 'denied':
      text.textContent = 'Accès MIDI refusé. Autorise « Appareils MIDI » dans les réglages du site, puis :';
      el.append(button('Réessayer', 'btn small', () => void app.midi.request()));
      break;
    case 'ready':
      text.textContent = s.devices.length
        ? `${s.devices.join(', ')} connecté`
        : 'Aucun piano détecté : vérifie le Bluetooth ou le câble. Clavier à l’écran en attendant.';
      break;
  }
}

/** One glyph per kind of activity, so the day's plan reads at a glance. */
const ICON: Record<Activity['kind'], string> = {
  flash: '⚡', technique: '🎹', sight: '👀', lesson: '📘', loop: '🔁', piece: '🎼', ear: '👂'
};

/** A big tappable tile: what it is, where you are, how far along. */
function tile(icon: string, title: string, line: string, progress: number, go: () => void, cls = ''): HTMLElement {
  const t = button('', `tile ${cls}`, go);
  const head = h('div', 'tile-head');
  head.append(h('span', 'tile-icon', icon), h('span', 'tile-title', title));
  const bar = h('div', 'tile-bar');
  const fill = h('span');
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  bar.append(fill);
  t.append(head, h('div', 'tile-line', line), bar);
  return t;
}

export function renderHome(root: HTMLElement, app: App): () => void {
  const p = app.progress;
  const page = h('div', 'page home');

  // Nothing to tap up here: in full screen the iPad's top strip swallows taps.
  const head = h('header', 'home-head');
  head.append(h('h1', 'title', 'Piano Reader'));
  const s = streak(p);
  if (s) head.append(h('span', 'streak', `🔥 ${s} jour${s > 1 ? 's' : ''}`));
  const gear = button('⚙︎', 'btn icon', () => app.go('#/reglages'));
  gear.setAttribute('aria-label', 'Réglages');
  page.append(navDock(themeButton(app), gear), head);

  // --- First visit: find the right level ---
  if (!p.onboarded) {
    const card = h('section', 'card hero');
    card.append(
      h('h2', undefined, 'Bienvenue !'),
      h('p', undefined, 'Pour commencer au bon endroit, fais le test de niveau : quelques notes à lire et jouer, de plus en plus difficiles. 5 minutes environ.'),
      button('Faire le test de niveau', 'btn primary big', () => app.go('#/test')),
      button('Commencer au début', 'btn', () => {
        app.setProgress({ ...app.progress, onboarded: true });
        app.refresh();
      })
    );
    page.append(card);
  }

  // --- Today's session: the one big thing to do ---
  const plan = dailyPlan(p);
  const done = practisedToday(p);
  const today = h('section', 'card today');
  today.append(h('h2', undefined, done ? 'Séance du jour ✓' : 'Ta séance du jour'));
  const steps = h('ol', 'plan-steps');
  for (const a of plan) {
    const li = h('li', 'step');
    li.append(h('span', 'step-icon', ICON[a.kind]), h('span', 'step-label', a.label));
    steps.append(li);
  }
  today.append(steps, button(done ? 'Refaire une séance' : 'Commencer la séance', 'btn primary big', () => app.go('#/seance')));
  // The piano, right where it's needed: before playing.
  const status = h('div', 'piano-status');
  const drawStatus = (st: MidiStatus) => pianoStatus(app, st, status);
  drawStatus(app.midi.status);
  const offMidi = app.midi.onChange(drawStatus);
  const offBus = app.bus.on((e) => {
    const t = status.querySelector('.ps-text');
    if (t && e.on && app.midi.connected && app.midi.status.state === 'ready') t.textContent = `${app.midi.status.devices[0]} connecté · ${nameOf(e.midi)} ✓`;
  });
  today.append(status);
  page.append(today);

  // --- Everything else, one tile each ---
  const tiles = h('section', 'tiles');
  const cur = currentLesson(p);
  const mastered = LESSONS.filter((l) => lessonDone(p, l)).length;
  const rec = cur ? p.lessons[cur.id] : undefined;
  const lessonLine = cur
    ? `Leçon ${cur.number} · ${cur.title}${rec?.sessions.length ? ` · ${validatedDays(rec)}/${MASTERY.days} jours` : ''}`
    : 'Parcours terminé';
  tiles.append(tile('📘', 'Parcours', lessonLine, mastered / LESSONS.length, () => app.go('#/parcours'), 'path'));
  const piece = currentPiece(p);
  const stage = piece ? p.pieces[piece.id]?.stage ?? 0 : 0;
  tiles.append(
    tile(
      '🎼', 'Morceaux',
      piece ? `${piece.title} · ${PIECE_STAGES[stage]?.label ?? ''}` : `${PIECES.length} morceaux à choisir`,
      piece ? stage / PIECE_STAGES.length : 0,
      () => app.go(piece ? `#/morceau/${piece.id}` : '#/bibliotheque'),
      'pieces-tile'
    )
  );
  const reached = Object.values(p.technique).filter((r) => r.reached).length;
  tiles.append(tile('🎹', 'Technique', `${reached} / ${DRILLS.length} au tempo final`, reached / DRILLS.length, () => app.go('#/technique')));
  tiles.append(
    tile('👂', 'Oreille', `Niveau ${p.ear.level} · ${EAR_LEVELS[p.ear.level - 1]?.title ?? ''}`, (p.ear.level - 1) / EAR_LEVELS.length, () => app.go('#/oreille'))
  );
  page.append(tiles);

  // --- Quiet links ---
  const links = h('nav', 'links');
  links.append(
    button('📈 Mes progrès', 'btn quiet', () => app.go('#/progres')),
    button('📚 Bibliothèque', 'btn quiet', () => app.go('#/bibliotheque')),
    button('📖 Lexique FR ↔ EN', 'btn quiet', () => app.go('#/lexique')),
    button(p.placement ? 'Refaire le test de niveau' : 'Test de niveau', 'btn quiet', () => app.go('#/test'))
  );
  page.append(links);

  root.append(page);
  return () => {
    offMidi();
    offBus();
    page.remove();
  };
}

/** The whole path, current lesson in view. */
export function renderPath(root: HTMLElement, app: App): () => void {
  const p = app.progress;
  const view = h('div', 'subpage');
  view.append(topBar(app, 'Parcours', () => app.go('#/')));
  const page = h('div', 'page');
  const cur = currentLesson(p);
  const list = h('ol', 'lessons');
  let curEl: HTMLElement | null = null;
  for (const l of LESSONS) {
    const rec = p.lessons[l.id];
    const done = lessonDone(p, l);
    const li = h('li', `lesson${done ? ' mastered' : ''}${l === cur ? ' current' : ''}`);
    const meta = h('div', 'meta');
    meta.append(h('div', 't', l.title), h('div', 'd', l.goal));
    let st: string;
    if (rec?.mastered) st = '✓ Maîtrisée';
    else if (rec?.acquired) st = '✓ Acquise au test de niveau';
    else if (rec?.sessions.length) {
      const last = rec.sessions[rec.sessions.length - 1];
      st = `${validatedDays(rec)} / ${MASTERY.days} jours validés · dernier essai ${percent(last.accuracy)}`;
    } else st = l === cur ? 'À travailler maintenant' : l.mode === 'rhythm' ? 'En rythme' : 'Lecture';
    meta.append(h('div', 'st', st));
    li.append(h('div', 'num', done ? '✓' : String(l.number)), meta, button(l === cur ? 'Jouer' : 'Ouvrir', l === cur ? 'btn primary' : 'btn', () => app.go(`#/lecon/${l.id}`)));
    if (l === cur) curEl = li;
    list.append(li);
  }
  page.append(list);
  view.append(page);
  root.append(view);
  // Open on the lesson in progress, not on lesson 1.
  requestAnimationFrame(() => curEl?.scrollIntoView({ block: 'center' }));
  return () => view.remove();
}

/** The notes read least well, for the progress page. */
export function weakNotesLine(app: App): string {
  return weakestNotes(app.progress)
    .map((w) => `${nameOf(w.midi)} (${percent(w.stat.clean / w.stat.attempts)} juste)`)
    .join(' · ');
}
