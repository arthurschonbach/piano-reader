import { currentLesson, currentPiece, dailyPlan, duePieces, lessonDone } from '../curriculum/coach';
import { LESSONS, MASTERY } from '../curriculum/lessons';
import { PIECES } from '../curriculum/pieces';
import { DRILLS } from '../curriculum/technique';
import { pieceRow } from './library';
import type { MidiStatus } from '../input/midi';
import { practisedToday, streak, validatedDays, weakestNotes } from '../progress/store';
import type { App } from './app';
import { button, h, navDock, percent, themeButton } from './dom';
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
        ? `${s.devices.join(', ')} connecté · joue une note pour tester`
        : 'Aucun piano détecté : vérifie le Bluetooth ou le câble. Clavier à l’écran en attendant.';
      break;
  }
}

export function renderHome(root: HTMLElement, app: App): () => void {
  const p = app.progress;
  const page = h('div', 'page');

  const head = h('header', 'home-head');
  const titles = h('div');
  titles.append(h('h1', 'title', 'Piano Reader'), h('p', 'sub', 'Ton coach de piano, à ton rythme.'));
  const gear = button('⚙︎', 'btn icon', () => app.go('#/reglages'));
  gear.setAttribute('aria-label', 'Réglages');
  head.append(titles);
  // Bottom-right: the top of the screen doesn't take taps in full screen.
  page.append(navDock(themeButton(app), gear));
  page.append(head);

  const status = h('div', 'piano-status');
  const drawStatus = (s: MidiStatus) => pianoStatus(app, s, status);
  drawStatus(app.midi.status);
  const offMidi = app.midi.onChange(drawStatus);
  const offBus = app.bus.on((e) => {
    const t = status.querySelector('.ps-text');
    if (t && e.on && app.midi.connected) t.textContent = `${nameOf(e.midi)} ✓ · ${app.midi.status.state === 'ready' ? app.midi.status.devices[0] : ''} connecté`;
  });
  page.append(status);

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

  // --- Today's session ---
  const plan = dailyPlan(p);
  const today = h('section', 'card today');
  const s = streak(p);
  const head2 = h('div', 'today-head');
  head2.append(h('h2', undefined, practisedToday(p) ? 'Séance du jour ✓' : 'Ta séance du jour'), h('span', 'streak', s ? `🔥 ${s} jour${s > 1 ? 's' : ''}` : ''));
  today.append(head2);
  const ol = h('ol', 'plan');
  for (const a of plan) ol.append(h('li', undefined, a.label));
  today.append(ol, h('p', 'hint', 'Environ 20 à 25 minutes. Garde le reste de ta séance pour tes propres morceaux.'));
  today.append(button(practisedToday(p) ? 'Refaire une séance' : 'Commencer la séance', 'btn primary big', () => app.go('#/seance')));
  page.append(today);

  // --- Path ---
  page.append(h('h2', 'sect', 'Parcours'));
  const cur = currentLesson(p);
  const list = h('ol', 'lessons');
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
    list.append(li);
  }
  page.append(list);

  // --- Pieces ---
  page.append(h('h2', 'sect', 'Morceaux'));
  const pl = h('ul', 'pieces');
  const curPiece = currentPiece(p);
  const shown = new Set<string>();
  for (const pc of [...(curPiece ? [curPiece] : []), ...duePieces(p)]) {
    if (shown.has(pc.id)) continue;
    shown.add(pc.id);
    pl.append(pieceRow(app, pc));
  }
  page.append(pl, button(`📚 Bibliothèque · ${PIECES.length} morceaux`, 'btn wide-btn', () => app.go('#/bibliotheque')));

  // --- Technique ---
  page.append(h('h2', 'sect', 'Technique'));
  const reached = Object.values(p.technique).filter((r) => r.reached).length;
  page.append(button(`🎹 Gammes, arpèges, accords · ${reached} / ${DRILLS.length} au tempo final`, 'btn wide-btn', () => app.go('#/technique')));

  // --- Footer links ---
  const weak = weakestNotes(p);
  if (weak.length) {
    page.append(h('h2', 'sect', 'À travailler'));
    page.append(h('p', 'weak', weak.map((w) => `${nameOf(w.midi)} (${percent(w.stat.clean / w.stat.attempts)} juste)`).join(' · ')));
  }
  const links = h('div', 'links');
  links.append(
    button('Mes progrès', 'btn', () => app.go('#/progres')),
    button('📖 Lexique FR ↔ EN', 'btn', () => app.go('#/lexique')),
    button(p.placement ? 'Refaire le test de niveau' : 'Test de niveau', 'btn', () => app.go('#/test'))
  );
  page.append(links);

  root.append(page);
  return () => {
    offMidi();
    offBus();
    page.remove();
  };
}
