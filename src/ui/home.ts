import { frenchName, spellOfMidi } from '../core/model';
import { LESSONS, MASTERY, playable } from '../curriculum/lessons';
import type { MidiStatus } from '../input/midi';
import { validatedDays, weakestNotes } from '../progress/store';
import type { App } from './app';
import { button, h, percent } from './dom';

function pianoCard(app: App, s: MidiStatus, card: HTMLElement): void {
  card.innerHTML = '';
  card.dataset.state = s.state === 'ready' ? (s.devices.length ? 'connected' : 'empty') : s.state;
  const title = h('div', 'pc-title');
  const text = h('p', 'pc-text');
  card.append(title, text);
  switch (s.state) {
    case 'unsupported':
      title.textContent = 'Pas de MIDI sur cet appareil';
      text.textContent =
        'Les navigateurs d’iPad et d’iPhone ne reçoivent pas le MIDI. Pour jouer sur ton FP-10, ouvre ce site dans Chrome sur ton téléphone Android. Ici, tu peux t’entraîner avec le clavier à l’écran.';
      break;
    case 'idle':
      title.textContent = 'Branche ton piano';
      text.textContent =
        'Câble USB entre la prise USB COMPUTER (carrée) à l’arrière du FP-10 et ton téléphone, piano allumé. Puis :';
      card.append(button('Connecter le piano', 'btn primary', () => void app.midi.request()));
      break;
    case 'asking':
      title.textContent = 'Autorisation…';
      text.textContent = 'Accepte l’accès aux appareils MIDI dans la fenêtre de Chrome.';
      break;
    case 'denied':
      title.textContent = 'Accès MIDI refusé';
      text.textContent =
        'Dans Chrome : touche l’icône à gauche de l’adresse → Autorisations → Appareils MIDI → Autoriser. Puis :';
      card.append(button('Réessayer', 'btn', () => void app.midi.request()));
      break;
    case 'ready':
      if (!s.devices.length) {
        title.textContent = 'Aucun piano détecté';
        text.textContent = 'Vérifie le câble et que le piano est allumé : il apparaîtra tout seul. En attendant, le clavier à l’écran prend le relais.';
      } else {
        title.textContent = `✓ Piano connecté : ${s.devices.join(', ')}`;
        text.textContent = 'Joue une note pour tester.';
        text.classList.add('pc-live');
      }
      break;
  }
}

export function renderHome(root: HTMLElement, app: App): () => void {
  const page = h('div', 'page');
  page.append(h('h1', 'title', 'Piano Reader'), h('p', 'sub', 'Ton assistant pour apprendre à lire et jouer.'));

  const card = h('section', 'piano-card');
  page.append(card);
  const draw = (s: MidiStatus) => pianoCard(app, s, card);
  draw(app.midi.status);
  const offMidi = app.midi.onChange(draw);
  const offBus = app.bus.on((e) => {
    const live = card.querySelector('.pc-live');
    if (live && e.on) live.textContent = `Dernière note : ${frenchName(spellOfMidi(e.midi))} ✓`;
  });

  page.append(h('h2', 'sect', 'Ton parcours'));
  const list = h('ol', 'lessons');
  for (const l of LESSONS) {
    const rec = app.progress.lessons[l.id];
    const ok = playable(l);
    const li = h('li', `lesson${ok ? '' : ' locked'}${rec?.mastered ? ' mastered' : ''}`);
    const meta = h('div', 'meta');
    meta.append(h('div', 't', l.title), h('div', 'd', l.goal));
    let status = 'Bientôt';
    if (ok) {
      if (rec?.mastered) status = '✓ Maîtrisée';
      else if (rec?.sessions.length) {
        const last = rec.sessions[rec.sessions.length - 1];
        status = `${validatedDays(rec)} / ${MASTERY.days} jours validés · dernière séance ${percent(last.accuracy)}`;
      } else status = 'Pas encore commencée';
    }
    meta.append(h('div', 'st', status));
    li.append(h('div', 'num', String(l.number)), meta);
    if (ok) li.append(button(rec?.sessions.length ? 'Jouer' : 'Commencer', 'btn primary', () => app.go(`#/lecon/${l.id}`)));
    list.append(li);
  }
  page.append(list);

  const weak = weakestNotes(app.progress);
  if (weak.length) {
    page.append(h('h2', 'sect', 'À travailler'));
    const p = h('p', 'weak');
    p.textContent = weak
      .map((w) => `${frenchName(spellOfMidi(w.midi))} (${percent(w.stat.clean / w.stat.attempts)} juste)`)
      .join(' · ');
    page.append(p, h('p', 'hint', 'Les exercices font revenir ces notes plus souvent.'));
  }

  root.append(page);
  return () => {
    offMidi();
    offBus();
    page.remove();
  };
}
